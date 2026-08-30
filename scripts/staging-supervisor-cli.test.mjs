import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { digest } from "./lib/morphogenesis-staging-supervisor.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);

test("staging supervisor plans, authorizes, ingests and rejects replay end-to-end", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "agentplat-staging-supervisor-test-"));
  try {
    const sourceCommit = git("rev-parse", "HEAD");
    const keyId = "arn:aws:kms:us-east-1:123456789012:key/11111111-2222-3333-4444-555555555555";
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const privateKeyPath = path.join(temporary, "private-key.pem");
    const publicKeyPath = path.join(temporary, "public-key.pem");
    const publicDer = publicKey.export({ type: "spki", format: "der" });
    await Promise.all([
      writeFile(privateKeyPath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 }),
      writeFile(publicKeyPath, publicKey.export({ type: "spki", format: "pem" })),
    ]);
    const inventory = {
      schemaVersion: 1,
      kind: "agentplat-agent-morphogenesis-beta1-distributed-staging-inventory-v1",
      status: "bound",
      sourceCommit,
      keyCustody: { canonicalKeyId: keyId },
    };
    const inventoryDigest = digest(
      "agentplat-agent-morphogenesis-beta1-distributed-staging-inventory-v1",
      inventory,
    );
    const deploymentBody = {
      schemaVersion: 1,
      kind: "agentplat-agent-morphogenesis-beta1-staging-deployment-receipt-v1",
      status: "deployed",
      sourceCommit,
      inventoryDigest,
      stagingQualification: "not-established",
      productionReadiness: "not-established",
      productionClaimPermitted: false,
    };
    const deployment = {
      ...deploymentBody,
      receiptDigest: digest("staging-deployment-receipt-v1", deploymentBody),
    };
    const inventoryPath = path.join(temporary, "inventory.json");
    const deploymentPath = path.join(temporary, "deployment.json");
    await Promise.all([
      writeFile(inventoryPath, JSON.stringify(inventory)),
      writeFile(deploymentPath, JSON.stringify(deployment)),
    ]);
    const supervisorDirectory = path.join(temporary, "supervisor");
    run("scripts/agent-morphogenesis-beta1-staging-supervisor.mjs", [
      "--mode", "plan",
      "--confirm", "PLAN_MORPHOGENESIS_DISTRIBUTED_STAGING",
      "--source-sha", sourceCommit,
      "--inventory", inventoryPath,
      "--deployment-receipt", deploymentPath,
      "--campaign-public-key", publicKeyPath,
      "--campaign-key-id", keyId,
      "--supervisor-directory", supervisorDirectory,
    ]);
    const fakeAws = path.join(temporary, "fake-aws.mjs");
    await writeFile(fakeAws, fakeAwsSource(), { mode: 0o700 });
    await chmod(fakeAws, 0o700);
    const commandEnvironment = {
      ...process.env,
      TEST_KMS_KEY_ID: keyId,
      TEST_KMS_PRIVATE_KEY: privateKeyPath,
      TEST_KMS_PUBLIC_KEY: publicDer.toString("base64"),
    };
    const expiresAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1_000).toISOString();
    run("scripts/agent-morphogenesis-beta1-staging-supervisor.mjs", [
      "--mode", "authorize",
      "--confirm", "AUTHORIZE_MORPHOGENESIS_DISTRIBUTED_STAGING",
      "--supervisor-directory", supervisorDirectory,
      "--actor-type", "agent",
      "--actor-id", "agent:staging-authorizer",
      "--expires-at", expiresAt,
      "--aws-cli", fakeAws,
    ], commandEnvironment);
    const detailPath = path.join(temporary, "detail.json");
    await writeFile(detailPath, JSON.stringify({
      externalReceiptDigest: `sha256:${"e".repeat(64)}`,
    }));
    const receiptDirectory = path.join(temporary, "receipt-1");
    run("scripts/agent-morphogenesis-beta1-staging-operation-receipt.mjs", [
      "--mode", "issue",
      "--confirm", "ISSUE_MORPHOGENESIS_STAGING_OPERATION_RECEIPT",
      "--supervisor-directory", supervisorDirectory,
      "--sequence", "1",
      "--operation-id", "operation:alert-delivery:1",
      "--operation-type", "alert-delivery",
      "--detail", detailPath,
      "--output-directory", receiptDirectory,
      "--aws-cli", fakeAws,
    ], commandEnvironment);
    const receiptPath = path.join(receiptDirectory, "operation-receipt.json");
    run("scripts/agent-morphogenesis-beta1-staging-supervisor.mjs", [
      "--mode", "ingest",
      "--supervisor-directory", supervisorDirectory,
      "--receipt", receiptPath,
    ]);
    const state = JSON.parse(await readFile(
      path.join(supervisorDirectory, "supervisor-state.json"),
      "utf8",
    ));
    assert.equal(state.status, "running");
    assert.equal(state.alertDeliveryPassed, true);
    assert.equal(state.nextReceiptSequence, 2);
    assert.equal(state.acceptedReceiptDigests.length, 1);
    assert.equal(
      (await readdir(path.join(supervisorDirectory, "receipts"))).length,
      1,
    );
    const replay = spawnSync(
      process.execPath,
      [
        "scripts/agent-morphogenesis-beta1-staging-supervisor.mjs",
        "--mode", "ingest",
        "--supervisor-directory", supervisorDirectory,
        "--receipt", receiptPath,
      ],
      { cwd: root, encoding: "utf8" },
    );
    assert.notEqual(replay.status, 0);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

function run(script, args, env = process.env) {
  return execFileSync(process.execPath, [script, ...args], {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function fakeAwsSource() {
  return `#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createPrivateKey, sign } from "node:crypto";
const args = process.argv.slice(2);
const operation = args[args.indexOf("kms") + 1];
const keyId = process.env.TEST_KMS_KEY_ID;
let result;
if (operation === "get-public-key") result = {
  KeyId: keyId,
  KeySpec: "ECC_NIST_EDWARDS25519",
  KeyUsage: "SIGN_VERIFY",
  SigningAlgorithms: ["ED25519_SHA_512"],
  PublicKey: process.env.TEST_KMS_PUBLIC_KEY,
};
else if (operation === "describe-key") result = { KeyMetadata: {
  Arn: keyId, Enabled: true, KeyState: "Enabled",
  KeySpec: "ECC_NIST_EDWARDS25519", KeyUsage: "SIGN_VERIFY",
} };
else if (operation === "sign") {
  const message = Buffer.from(args[args.indexOf("--message") + 1], "base64");
  const privateKey = createPrivateKey(readFileSync(process.env.TEST_KMS_PRIVATE_KEY));
  result = { KeyId: keyId, SigningAlgorithm: "ED25519_SHA_512", Signature: sign(null, message, privateKey).toString("base64") };
} else throw new Error("unsupported fake AWS operation");
process.stdout.write(JSON.stringify(result));
`;
}
