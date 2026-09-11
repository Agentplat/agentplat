import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  acceptStagingOperationReceiptV1,
  digest,
} from "./lib/morphogenesis-staging-supervisor.mjs";

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
    await completeSupervisor(supervisorDirectory, privateKey);
    const bundleDirectory = path.join(temporary, "bundle");
    run("scripts/agent-morphogenesis-beta1-staging-bundle.mjs", [
      "--mode", "assemble-sign",
      "--confirm", "ASSEMBLE_MORPHOGENESIS_DISTRIBUTED_STAGING_BUNDLE",
      "--supervisor-directory", supervisorDirectory,
      "--output-directory", bundleDirectory,
      "--aws-cli", fakeAws,
    ], commandEnvironment);
    run("scripts/agent-morphogenesis-beta1-staging-bundle.mjs", [
      "--mode", "verify",
      "--bundle-directory", bundleDirectory,
    ]);
    const bundle = JSON.parse(await readFile(
      path.join(bundleDirectory, "staging-bundle.json"),
      "utf8",
    ));
    assert.equal(bundle.stagingQualification, "beta1-distributed-staging-profile-established");
    assert.equal(bundle.operationalReadiness, "staging-profile-established");
    assert.equal(bundle.productionReadiness, "not-established");
    assert.equal(bundle.productionClaimPermitted, false);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

async function completeSupervisor(directory, privateKey) {
  const config = JSON.parse(await readFile(path.join(directory, "supervisor-config.json"), "utf8"));
  let state = JSON.parse(await readFile(path.join(directory, "supervisor-state.json"), "utf8"));
  const events = (await readFile(path.join(directory, "supervisor-events.jsonl"), "utf8"))
    .split("\n").filter(Boolean).map(JSON.parse);
  const operations = [];
  for (const phase of ["baseline", "post-upgrade"])
    for (const scenarioId of config.operationalScenarioIds)
      operations.push(["canonical-scenario", { phase, scenarioId }]);
  for (const scenarioId of config.partitionAuthorityScenarioIds)
    operations.push(["canonical-scenario", { phase: "partition", scenarioId }]);
  for (const [faultClass, key] of [
    ["network-partition", "minimumNetworkPartitionCycles"],
    ["host-loss", "minimumHostLossCycles"],
    ["postgres-failover", "minimumPostgresFailoverCycles"],
    ["temporal-worker-loss", "minimumTemporalWorkerLossCycles"],
  ]) for (let index = 0; index < config.executionGeometry[key]; index += 1)
    operations.push(["fault-cycle", { faultClass, cycle: index + 1 }]);
  for (const [type, key] of [
    ["rolling-deployment", "minimumRollingDeploymentCycles"],
    ["schema-upgrade", "minimumSchemaUpgradeCycles"],
    ["backup-restore", "minimumBackupRestoreCycles"],
    ["key-rotation", "minimumKeyRotationCycles"],
  ]) for (let index = 0; index < config.executionGeometry[key]; index += 1)
    operations.push([type, maintenanceDetail(type, index + 1)]);
  operations.push(["tenant-mission-isolation", {
    tenantCount: 3, missionsPerTenant: 2, completedExecutions: 6,
    attemptedCrossTenantReads: 24, attemptedCrossMissionReads: 6,
    failureDomainCount: 3, crossTenantReadsAccepted: 0,
    crossTenantWritesAccepted: 0, crossMissionAuthorityUsesAccepted: 0,
    crossScopeReceiptsAccepted: 0, durableStateRoot: sha("a"),
    externalIsolationReceiptDigest: sha("b"),
  }]);
  operations.push(["soak-summary", {
    durationMs: 300_000,
    completedMorphogenesisRuns: config.executionGeometry.minimumCompletedMorphogenesisRuns,
    minimumRunsPerTenant: config.executionGeometry.minimumRunsPerTenant,
    tenantCount: config.executionGeometry.minimumTenants,
    maximumConcurrentMissions: config.executionGeometry.minimumConcurrentMissions,
    cumulativeMeshProcessStarts: config.requiredInfrastructure.minimumCumulativeAgentMeshProcessStarts,
    resourceSampleCount: 1_000, nominalP95WallTimeMs: 100,
    recoveryP95WallTimeMs: 500, rollbackP95WallTimeMs: 500,
    restorePointLossMs: 0, restoreTimeMs: 1_000,
    peakWorkerRssBytes: 100_000_000, aggregateWorkerCpuPercent: 200,
    finalPendingMeshInboxRows: 0, finalPendingMeshOutboxRows: 0,
    externalSpendUsd: 0, resourceSampleRoot: sha("c"),
    operationReceiptRoot: sha("d"),
  }]);
  for (const [operationType, detail] of operations) {
    const sequence = state.nextReceiptSequence;
    const operationId = `operation:test:${sequence}`;
    const body = {
      schemaVersion: 1,
      kind: "agentplat-agent-morphogenesis-beta1-staging-operation-receipt-v1",
      configDigest: config.configDigest,
      sourceCommit: config.sourceCommit,
      sequence,
      operationId,
      operationType,
      status: "passed",
      detail,
      invariants: {
        duplicateMaterialEffects: 0, unauthorizedActivations: 0,
        lostCommittedReceipts: 0, morphologyHeadForks: 0,
        crossTenantEffects: 0, crossMissionEffects: 0,
        missionContinuityRatio: 1,
      },
      productionReadiness: "not-established",
      productionClaimPermitted: false,
    };
    const signingBytes = Buffer.from(
      `agentplat-agent-morphogenesis-beta1-staging-operation-receipt-v1\n${JSON.stringify(body)}`,
    );
    const receiptDigest = digest(
      "agentplat-agent-morphogenesis-beta1-staging-operation-receipt-v1",
      body,
    );
    const signed = {
      ...body,
      receiptDigest,
      proof: {
        algorithm: "Ed25519",
        keyId: config.campaignKeyId,
        signature: sign(null, signingBytes, privateKey).toString("base64url"),
      },
    };
    const name = `${String(sequence).padStart(4, "0")}-${createHash("sha256")
      .update(operationId).digest("hex").slice(0, 16)}.json`;
    await writeFile(
      path.join(directory, "receipts", name),
      `${JSON.stringify(signed, null, 2)}\n`,
      { flag: "wx" },
    );
    const previous = state;
    state = acceptStagingOperationReceiptV1(config, state, body);
    const eventBody = {
      schemaVersion: 1,
      sequence: previous.nextEventSequence,
      type: "receipt-accepted",
      previousEventDigest: previous.lastEventDigest,
      detail: {
        operationId,
        operationType,
        receiptDigest,
        resultingStatus: state.status,
      },
    };
    const event = {
      ...eventBody,
      eventDigest: digest("staging-supervisor-event-v1", eventBody),
    };
    events.push(event);
    state = {
      ...state,
      acceptedReceiptDigests: [...previous.acceptedReceiptDigests, receiptDigest],
      nextEventSequence: previous.nextEventSequence + 1,
      lastEventDigest: event.eventDigest,
    };
  }
  assert.equal(state.status, "completed");
  await Promise.all([
    writeFile(
      path.join(directory, "supervisor-state.json"),
      `${JSON.stringify(state, null, 2)}\n`,
    ),
    writeFile(
      path.join(directory, "supervisor-events.jsonl"),
      `${events.map(JSON.stringify).join("\n")}\n`,
    ),
  ]);
}

function maintenanceDetail(type, cycle) {
  const common = { cycle, externalMaintenanceReceiptDigest: sha("1") };
  if (type === "rolling-deployment") return { ...common,
    predecessorImage: `registry.invalid/a@sha256:${"2".repeat(64)}`,
    successorImage: `registry.invalid/a@sha256:${"3".repeat(64)}`,
    failureDomainCount: 3, allPeersReady: true, versionSkewObserved: true };
  if (type === "schema-upgrade") return { ...common,
    previousMigration: cycle - 1, successorMigration: cycle,
    backwardRestoreTested: true, migrationReceiptDigest: sha("4") };
  if (type === "backup-restore") return { ...common,
    backupDigest: sha("5"), sourceCanonicalRoot: sha("6"),
    restoredCanonicalRoot: sha("6"), cleanRestoreResourceId: `restore:${cycle}`,
    restorePointLossMs: 0, restoreTimeMs: 1 };
  return { ...common, predecessorKeyId: `key:old:${cycle}`,
    successorKeyId: `key:new:${cycle}`, activeSignerKeyId: `key:new:${cycle}`,
    predecessorSigningDenied: true, predecessorHistoricalVerificationPassed: true,
    rotationReceiptDigest: sha("7") };
}

function sha(character) {
  return `sha256:${character.repeat(64)}`;
}

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
