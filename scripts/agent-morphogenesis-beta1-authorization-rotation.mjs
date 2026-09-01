#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  createHash,
  generateKeyPairSync,
} from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const options = parse(process.argv.slice(2));
if (!options.diagnosticOnly)
  throw new TypeError("morphogenesis_authorization_rotation_confirmation_missing");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceSha = git("rev-parse", "HEAD");
const work = await mkdtemp(path.join(os.tmpdir(), "agentplat-morph-auth-"));
const campaignScript = path.join(
  root,
  "scripts/agent-morphogenesis-beta1-campaign.mjs",
);
const startedAt = performance.now();

try {
  assert.equal(gitStatus("diff", "--quiet"), 0);
  assert.equal(gitStatus("diff", "--cached", "--quiet"), 0);
  const registration = path.join(work, "registration");
  run([
    campaignScript,
    "--mode",
    "plan",
    "--source-sha",
    sourceSha,
    "--output-directory",
    registration,
    "--confirm",
    "DO_NOT_RUN",
  ]);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
  const issued = [];
  for (const generation of [1, 2]) {
    const keyFile = path.join(work, `private-${generation}.pem`);
    const { privateKey } = generateKeyPairSync("ed25519");
    await writeFile(
      keyFile,
      privateKey.export({ type: "pkcs8", format: "pem" }),
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );
    const authorizationDirectory = path.join(work, `authorization-${generation}`);
    run([
      campaignScript,
      "--mode",
      "authorize",
      "--registration-directory",
      registration,
      "--output-directory",
      authorizationDirectory,
      "--private-key",
      keyFile,
      "--actor-type",
      "agent",
      "--actor-id",
      `agent:readiness-authorizer:${generation}`,
      "--expires-at",
      expiresAt,
      "--confirm",
      "AUTHORIZE_ZERO_SPEND_BETA1",
    ]);
    const [authorization, publicKey] = await Promise.all([
      json(path.join(authorizationDirectory, "authorization.json")),
      readFile(
        path.join(authorizationDirectory, "authorization-public-key.pem"),
        "utf8",
      ),
    ]);
    issued.push({
      generation,
      authorizationDirectory,
      authorization,
      publicKeySha256: createHash("sha256")
        .update(publicKey, "utf8")
        .digest("hex"),
    });
  }
  assert.notEqual(issued[0].publicKeySha256, issued[1].publicKeySha256);
  for (const current of issued)
    active(current, current.publicKeySha256, current.authorization.issuedAt);

  const rotated = spawnActive(
    issued[0],
    issued[1].publicKeySha256,
    issued[1].authorization.issuedAt,
  );
  assert.notEqual(rotated.status, 0);
  assert.match(rotated.stderr, /execution_authorization_inactive/);

  const expired = spawnActive(
    issued[1],
    issued[1].publicKeySha256,
    issued[1].authorization.expiresAt,
  );
  assert.notEqual(expired.status, 0);
  assert.match(expired.stderr, /execution_authorization_inactive/);

  const metrics = {
    schemaVersion: 1,
    scenarioIds: ["authorization-expiry", "authorization-key-rotation"],
    wall_time_ms: Math.round(performance.now() - startedAt),
    input_tokens: 0,
    output_tokens: 0,
    estimated_cost_usd: 0,
    morphology_churn_count: 0,
    mission_continuity_ratio: 1,
    duplicate_material_effect_count: 0,
    process_rss_bytes: process.memoryUsage().rss,
    aggregate_cpu_percent: 0,
    postgres_storage_bytes: 0,
    temporal_storage_bytes: 0,
    mesh_pending_inbox_rows: 0,
    mesh_pending_outbox_rows: 0,
    supervisor_resume_time_ms: 0,
  };
  const body = {
    schemaVersion: 1,
    kind: "agentplat-agent-morphogenesis-beta1-authorization-rotation-receipt-v1",
    sourceCommit: sourceSha,
    status: "passed",
    authorizationGenerations: 2,
    firstAuthorizationDigest: issued[0].authorization.authorizationDigest,
    secondAuthorizationDigest: issued[1].authorization.authorizationDigest,
    firstPublicKeySha256: issued[0].publicKeySha256,
    secondPublicKeySha256: issued[1].publicKeySha256,
    oldAuthorizationRejectedAfterRotation: true,
    authorizationRejectedAtExactExpiry: true,
    privateKeysRetained: false,
    metrics,
    operationalReadinessEstablished: false,
    productionClaimPermitted: false,
  };
  const receipt = {
    ...body,
    receiptDigest: digest(
      "agentplat-agent-morphogenesis-beta1-authorization-rotation-receipt-v1",
      body,
    ),
  };
  if (options.outputDirectory) {
    const outputDirectory = path.resolve(options.outputDirectory);
    const relative = path.relative(root, outputDirectory);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)))
      throw new TypeError("readiness evidence output must be external");
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(
      path.join(outputDirectory, "authorization-rotation-receipt.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
  }
  console.log(JSON.stringify({
    status: "passed",
    sourceCommit: sourceSha,
    authorizationGenerations: 2,
    oldAuthorizationRejectedAfterRotation: true,
    authorizationRejectedAtExactExpiry: true,
    receiptDigest: receipt.receiptDigest,
    privateKeysRetained: false,
    operationalReadinessEstablished: false,
    productionClaimPermitted: false,
  }, null, 2));
} finally {
  await rm(work, { recursive: true, force: true });
}

function active(entry, expectedPublicKeySha256, logicalTime) {
  const result = spawnActive(entry, expectedPublicKeySha256, logicalTime);
  assert.equal(result.status, 0, result.stderr);
}

function spawnActive(entry, expectedPublicKeySha256, logicalTime) {
  return spawnSync(
    process.execPath,
    [
      campaignScript,
      "--mode",
      "verify-execution-authorization",
      "--authorization-directory",
      entry.authorizationDirectory,
      "--expected-public-key-sha256",
      expectedPublicKeySha256,
      "--logical-time",
      logicalTime,
      "--source-sha",
      sourceSha,
    ],
    { cwd: root, encoding: "utf8" },
  );
}

function run(args) {
  execFileSync(process.execPath, args, { cwd: root, stdio: "pipe" });
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function gitStatus(...args) {
  const result = spawnSync("git", args, { cwd: root, stdio: "ignore" });
  return result.status ?? 1;
}

async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function parse(args) {
  const result = { diagnosticOnly: false, outputDirectory: null };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--") continue;
    if (value === "--diagnostic-only") result.diagnosticOnly = true;
    else if (value === "--output-directory" && index + 1 < args.length)
      result.outputDirectory = args[++index];
    else throw new TypeError("morphogenesis_authorization_rotation_option_invalid");
  }
  return result;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${JSON.stringify(canonical(value))}`)
    .digest("hex")}`;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
    );
  return value;
}
