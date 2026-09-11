#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  createHash, createPublicKey, verify as verifySignature,
} from "node:crypto";
import {
  appendFile, mkdir, open, readFile, rename, rm, writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  acceptStagingOperationReceiptV1,
  createInitialStagingSupervisorStateV1,
  createStagingSupervisorConfigV1,
  digest,
} from "./lib/morphogenesis-staging-supervisor.mjs";
import {
  createAwsJsonRunner,
  resolveAwsKmsEd25519V1,
  signAwsKmsEd25519V1,
} from "./lib/aws-kms-ed25519.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parse(process.argv.slice(2));
const mode = options.mode ?? "contract-smoke";

if (mode === "contract-smoke") {
  exact(["mode"]);
  const [profile, readiness] = await Promise.all([
    json(path.join(root, "config/agent-morphogenesis-beta1-staging-qualification-v1.json")),
    json(path.join(root, "config/agent-morphogenesis-beta1-operational-readiness-v1.json")),
  ]);
  assert.equal(profile.executionGeometry.minimumSoakDurationMs, 0);
  assert.equal(profile.executionGeometry.minimumCompletedMorphogenesisRuns, 1_000);
  assert.equal(readiness.operationalScenarioIds.length, 22);
  console.log(JSON.stringify({
    status: "passed",
    signedReceiptIngestionRequired: true,
    exactScenarioCount: 22,
    minimumSoakDurationMs: profile.executionGeometry.minimumSoakDurationMs,
    minimumRuns: profile.executionGeometry.minimumCompletedMorphogenesisRuns,
    executionPermitted: false,
    stagingQualification: "not-established",
    productionClaimPermitted: false,
  }, null, 2));
} else if (mode === "plan") {
  exact([
    "campaign-key-id", "campaign-public-key", "confirm", "deployment-receipt",
    "inventory", "mode", "source-sha", "supervisor-directory",
  ]);
  assert.equal(options.confirm, "PLAN_MORPHOGENESIS_DISTRIBUTED_STAGING");
  const sourceCommit = required("source-sha");
  assert.match(sourceCommit, /^[0-9a-f]{40}$/u);
  assert.equal(git("rev-parse", "HEAD"), sourceCommit);
  assert.equal(git("status", "--porcelain=v1", "--untracked-files=no"), "");
  const supervisorDirectory = external(required("supervisor-directory"));
  const [profile, readiness, inventory, deployment, publicKeyPem] = await Promise.all([
    json(path.join(root, "config/agent-morphogenesis-beta1-staging-qualification-v1.json")),
    json(path.join(root, "config/agent-morphogenesis-beta1-operational-readiness-v1.json")),
    json(external(required("inventory"))),
    json(external(required("deployment-receipt"))),
    readFile(external(required("campaign-public-key")), "utf8"),
  ]);
  assert.equal(inventory.sourceCommit, sourceCommit);
  assert.equal(inventory.status, "bound");
  assert.equal(required("campaign-key-id"), inventory.keyCustody.canonicalKeyId);
  assert.equal(deployment.sourceCommit, sourceCommit);
  assert.equal(deployment.status, "deployed");
  assert.equal(deployment.stagingQualification, "not-established");
  assert.equal(deployment.productionClaimPermitted, false);
  const { receiptDigest: deploymentReceiptDigest, ...deploymentBody } = deployment;
  assert.equal(
    deploymentReceiptDigest,
    digest("staging-deployment-receipt-v1", deploymentBody),
  );
  assert.equal(
    deployment.inventoryDigest,
    digest(
      "agentplat-agent-morphogenesis-beta1-distributed-staging-inventory-v1",
      inventory,
    ),
  );
  const publicKey = createPublicKey(publicKeyPem);
  assert.equal(publicKey.asymmetricKeyType, "ed25519");
  const publicKeyBytes = publicKey.export({ type: "spki", format: "der" });
  const publicKeyFingerprint = `sha256:${createHash("sha256").update(publicKeyBytes).digest("hex")}`;
  const config = createStagingSupervisorConfigV1({
    profile,
    sourceCommit,
    inventoryDigest: deployment.inventoryDigest,
    deploymentReceiptDigest,
    campaignKeyId: required("campaign-key-id"),
    campaignPublicKeyFingerprint: publicKeyFingerprint,
    operationalScenarioIds: readiness.operationalScenarioIds,
  });
  let state = createInitialStagingSupervisorStateV1(config);
  await mkdir(supervisorDirectory, { recursive: false });
  await mkdir(path.join(supervisorDirectory, "receipts"));
  const event = createEvent(state, "planned", {
    sourceCommit,
    configDigest: config.configDigest,
  });
  state = {
    ...state,
    nextEventSequence: state.nextEventSequence + 1,
    lastEventDigest: event.eventDigest,
  };
  await Promise.all([
    exclusive(supervisorDirectory, "supervisor-config.json", config),
    exclusive(supervisorDirectory, "supervisor-state.json", state),
    writeFile(
      path.join(supervisorDirectory, "campaign-public-key.pem"),
      publicKeyPem,
      { encoding: "utf8", flag: "wx" },
    ),
    writeFile(
      path.join(supervisorDirectory, "supervisor-events.jsonl"),
      `${JSON.stringify(event)}\n`,
      { encoding: "utf8", flag: "wx" },
    ),
  ]);
  console.log(JSON.stringify({
    status: "planned",
    sourceCommit,
    configDigest: config.configDigest,
    campaignKeyId: config.campaignKeyId,
    minimumSoakDurationMs: config.executionGeometry.minimumSoakDurationMs,
    minimumRuns: config.executionGeometry.minimumCompletedMorphogenesisRuns,
    executionPermitted: false,
    stagingQualification: "not-established",
    productionClaimPermitted: false,
    supervisorDirectory,
  }, null, 2));
} else if (mode === "authorize") {
  allowed([
    "actor-id", "actor-type", "aws-cli", "aws-profile", "aws-region",
    "confirm", "expires-at", "mode", "supervisor-directory",
  ]);
  assert.equal(options.confirm, "AUTHORIZE_MORPHOGENESIS_DISTRIBUTED_STAGING");
  assert.ok(new Set(["agent", "person", "collective"]).has(options["actor-type"]));
  assert.match(options["actor-id"], /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u);
  const directory = external(required("supervisor-directory"));
  const lock = await acquire(directory);
  try {
    const [config, current, publicKeyPem] = await Promise.all([
      json(path.join(directory, "supervisor-config.json")),
      json(path.join(directory, "supervisor-state.json")),
      readFile(path.join(directory, "campaign-public-key.pem"), "utf8"),
    ]);
    assert.equal(current.status, "planned");
    const issuedAt = new Date().toISOString();
    const expiresAt = required("expires-at");
    assert.equal(new Date(expiresAt).toISOString(), expiresAt);
    assert.ok(
      Date.parse(expiresAt) - Date.parse(issuedAt) >=
        config.executionGeometry.targetSoakDurationMs + 3_600_000,
    );
    const runAws = createAwsJsonRunner({
      executable: options["aws-cli"],
      profile: options["aws-profile"],
      region: options["aws-region"],
    });
    const material = await resolveAwsKmsEd25519V1({
      keyId: config.campaignKeyId,
      runAws,
    });
    assert.equal(material.keyId, config.campaignKeyId);
    assert.equal(material.publicKeyFingerprint, config.campaignPublicKeyFingerprint);
    assert.equal(
      createPublicKey(publicKeyPem).export({ type: "spki", format: "der" }).equals(material.publicKeyBytes),
      true,
    );
    const body = {
      schemaVersion: 1,
      kind: "agentplat-agent-morphogenesis-beta1-staging-authorization-v1",
      authorizationId: `authorization:${config.configDigest.slice("sha256:".length, 25)}`,
      configDigest: config.configDigest,
      sourceCommit: config.sourceCommit,
      deploymentReceiptDigest: config.deploymentReceiptDigest,
      actorType: options["actor-type"],
      actorId: options["actor-id"],
      campaignKeyId: config.campaignKeyId,
      issuedAt,
      expiresAt,
      productionReadiness: "not-established",
      productionClaimPermitted: false,
    };
    const signature = await signAwsKmsEd25519V1({
      material,
      message: authorizationSigningBytes(body),
      runAws,
    });
    const authorization = {
      ...body,
      authorizationDigest: digest("staging-authorization-v1", body),
      proof: { algorithm: "Ed25519", keyId: material.keyId, signature },
    };
    await exclusive(directory, "authorization.json", authorization);
    const event = createEvent(current, "authorized", {
      authorizationDigest: authorization.authorizationDigest,
      actorType: body.actorType,
      actorId: body.actorId,
      expiresAt,
    });
    const next = {
      ...current,
      status: "authorized",
      authorizationDigest: authorization.authorizationDigest,
      authorizationExpiresAt: expiresAt,
      nextEventSequence: current.nextEventSequence + 1,
      lastEventDigest: event.eventDigest,
    };
    await saveState(directory, next);
    await appendFile(
      path.join(directory, "supervisor-events.jsonl"),
      `${JSON.stringify(event)}\n`,
      "utf8",
    );
    console.log(JSON.stringify({
      status: "authorized",
      authorizationDigest: authorization.authorizationDigest,
      actorType: body.actorType,
      actorId: body.actorId,
      expiresAt,
      executionPermitted: true,
      stagingQualification: "not-established",
      productionClaimPermitted: false,
    }, null, 2));
  } finally {
    await lock.close();
    await rm(path.join(directory, "supervisor.lock"), { force: true });
  }
} else if (mode === "ingest") {
  exact(["mode", "receipt", "supervisor-directory"]);
  const directory = external(required("supervisor-directory"));
  const receiptPath = external(required("receipt"));
  const lock = await acquire(directory);
  try {
    const [config, current, signed, publicKeyPem, authorization] = await Promise.all([
      json(path.join(directory, "supervisor-config.json")),
      json(path.join(directory, "supervisor-state.json")),
      json(receiptPath),
      readFile(path.join(directory, "campaign-public-key.pem"), "utf8"),
      json(path.join(directory, "authorization.json")),
    ]);
    assert.ok(new Set(["authorized", "running"]).has(current.status));
    verifyAuthorization(config, current, authorization, publicKeyPem);
    const { receiptDigest, proof, ...body } = signed;
    assert.equal(
      receiptDigest,
      digest("agentplat-agent-morphogenesis-beta1-staging-operation-receipt-v1", body),
    );
    assert.deepEqual(Object.keys(proof).sort(), ["algorithm", "keyId", "signature"]);
    assert.equal(proof.algorithm, "Ed25519");
    assert.equal(proof.keyId, config.campaignKeyId);
    assert.equal(
      verifySignature(
        null,
        signingBytes(body),
        createPublicKey(publicKeyPem),
        Buffer.from(proof.signature, "base64url"),
      ),
      true,
    );
    let next = acceptStagingOperationReceiptV1(config, current, body);
    const event = createEvent(current, "receipt-accepted", {
      operationId: body.operationId,
      operationType: body.operationType,
      receiptDigest,
      resultingStatus: next.status,
    });
    next = {
      ...next,
      acceptedReceiptDigests: [...current.acceptedReceiptDigests, receiptDigest],
      nextEventSequence: current.nextEventSequence + 1,
      lastEventDigest: event.eventDigest,
    };
    const receiptName = `${String(body.sequence).padStart(4, "0")}-${createHash("sha256")
      .update(body.operationId)
      .digest("hex")
      .slice(0, 16)}.json`;
    await retainExact(
      path.join(directory, "receipts", receiptName),
      `${JSON.stringify(signed, null, 2)}\n`,
    );
    await saveState(directory, next);
    await appendFile(
      path.join(directory, "supervisor-events.jsonl"),
      `${JSON.stringify(event)}\n`,
      "utf8",
    );
    console.log(JSON.stringify({
      status: "accepted",
      operationId: body.operationId,
      operationType: body.operationType,
      supervisorStatus: next.status,
      nextReceiptSequence: next.nextReceiptSequence,
      stagingQualification: next.stagingQualification,
      productionReadiness: "not-established",
      productionClaimPermitted: false,
    }, null, 2));
  } finally {
    await lock.close();
    await rm(path.join(directory, "supervisor.lock"), { force: true });
  }
} else if (mode === "status") {
  exact(["mode", "supervisor-directory"]);
  const state = await json(path.join(external(required("supervisor-directory")), "supervisor-state.json"));
  console.log(JSON.stringify(state, null, 2));
} else {
  throw new TypeError("staging_supervisor_mode_invalid");
}

function createEvent(state, type, detail) {
  const body = {
    schemaVersion: 1,
    sequence: state.nextEventSequence,
    type,
    previousEventDigest: state.lastEventDigest,
    detail,
  };
  return { ...body, eventDigest: digest("staging-supervisor-event-v1", body) };
}

async function saveState(directory, state) {
  const temporary = path.join(directory, `supervisor-state.${process.pid}.tmp`);
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, path.join(directory, "supervisor-state.json"));
}

async function acquire(directory) {
  const file = await open(path.join(directory, "supervisor.lock"), "wx");
  await file.writeFile(`${process.pid}\n`, "utf8");
  return file;
}

function signingBytes(body) {
  return Buffer.from(
    `agentplat-agent-morphogenesis-beta1-staging-operation-receipt-v1\n${JSON.stringify(body)}`,
    "utf8",
  );
}

function authorizationSigningBytes(body) {
  return Buffer.from(
    `agentplat-agent-morphogenesis-beta1-staging-authorization-v1\n${JSON.stringify(body)}`,
    "utf8",
  );
}

function verifyAuthorization(config, state, authorization, publicKeyPem) {
  const { authorizationDigest, proof, ...body } = authorization;
  assert.equal(authorizationDigest, digest("staging-authorization-v1", body));
  assert.equal(authorizationDigest, state.authorizationDigest);
  assert.equal(body.configDigest, config.configDigest);
  assert.equal(body.sourceCommit, config.sourceCommit);
  assert.equal(body.deploymentReceiptDigest, config.deploymentReceiptDigest);
  assert.equal(body.campaignKeyId, config.campaignKeyId);
  assert.equal(body.productionReadiness, "not-established");
  assert.equal(body.productionClaimPermitted, false);
  assert.ok(Date.parse(body.expiresAt) > Date.now());
  assert.equal(proof.algorithm, "Ed25519");
  assert.equal(proof.keyId, config.campaignKeyId);
  assert.equal(
    verifySignature(
      null,
      authorizationSigningBytes(body),
      createPublicKey(publicKeyPem),
      Buffer.from(proof.signature, "base64url"),
    ),
    true,
  );
}

async function exclusive(directory, name, value) {
  await writeFile(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8", flag: "wx",
  });
}

async function retainExact(file, value) {
  try {
    await writeFile(file, value, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error?.code !== "EEXIST" || await readFile(file, "utf8") !== value)
      throw error;
  }
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function required(name) {
  const value = options[name];
  if (!value) throw new TypeError(`${name} is required`);
  return value;
}

function external(value) {
  const resolved = path.resolve(value);
  const relative = path.relative(root, resolved);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)))
    throw new TypeError("staging supervisor paths must be external");
  return resolved;
}

function exact(expected) {
  assert.deepEqual(Object.keys(options).sort(), expected.sort());
}

function allowed(names) {
  for (const name of Object.keys(options))
    if (!names.includes(name)) throw new TypeError(`unsupported option: ${name}`);
}

function parse(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--") continue;
    if (!args[index].startsWith("--")) throw new TypeError("invalid option");
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new TypeError(`missing value for ${args[index]}`);
    result[args[index].slice(2)] = value;
    index += 1;
  }
  return result;
}

async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
