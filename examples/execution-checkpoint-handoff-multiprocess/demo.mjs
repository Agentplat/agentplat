import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { selectExecutionCheckpointReplicasV1 } from "@agentplat/collective-runtime/checkpoints";
import { runMigrations } from "@agentplat/collective-sync-postgres";
import { MESH_SIGNATURE_ALGORITHM } from "@agentplat/mesh-protocol";
import { Pool } from "pg";

const peerIds = [
  "peer:alpha",
  "peer:beta",
  "peer:delta",
  "peer:epsilon",
  "peer:gamma",
];
const policy = Object.freeze({
  schemaVersion: 1,
  replicaCount: 2,
  writeThreshold: 2,
  certificateCustodyThreshold: 2,
  evidenceLifetimeMs: 10_000,
  maximumArtifactBytes: 1_048_576,
});
const runId = randomUUID().replaceAll("-", "");
const schemas = Object.fromEntries(
  peerIds.map((peerId) => [
    peerId,
    `checkpoint_demo_${peerId.split(":")[1]}_${runId}`,
  ]),
);
const basePort = 20_000 + Math.floor(Math.random() * 15_000);
const ports = Object.fromEntries(
  peerIds.map((peerId, index) => [peerId, basePort + index]),
);
const endpoints = Object.fromEntries(
  peerIds.map((peerId) => [peerId, `http://127.0.0.1:${ports[peerId]}`]),
);
const channelToken = randomUUID();
const pool = new Pool(databaseOptions());
const children = new Map();
const childFile = fileURLToPath(new URL("./peer.mjs", import.meta.url));
const transfer = checkpointTransfer();

try {
  for (const schema of Object.values(schemas))
    await runMigrations(pool, { schema, createSchema: true });

  const keys = await keysFor(peerIds);
  const binding = membershipBinding();
  await startAll(binding, keys);

  const publication = await command("peer:alpha", {
    kind: "publish",
    transfer,
  });
  assert.equal(publication.published, true, publication.error);
  assert.ok(publication.certificateId);

  const selectedReplicas = await selectExecutionCheckpointReplicasV1({
    membership: binding,
    checkpointId: transfer.checkpoint.checkpointId,
    sourcePeerId: "peer:alpha",
    replicaCount: policy.replicaCount,
  });
  assert.deepEqual(
    publication.certifiedReplicaPeerIds,
    selectedReplicas.map(({ peerId }) => peerId).sort(),
  );
  const receiverId = peerIds.find(
    (peerId) =>
      peerId !== "peer:alpha" &&
      !selectedReplicas.some((replica) => replica.peerId === peerId),
  );
  assert.ok(receiverId);
  assert.equal(
    (
      await command(receiverId, {
        kind: "inspect",
        checkpointId: transfer.checkpoint.checkpointId,
      })
    ).available,
    false,
  );

  await stop("peer:alpha");

  const resolution = await command(receiverId, {
    kind: "resolve",
    checkpointId: transfer.checkpoint.checkpointId,
  });
  assert.equal(resolution.resolved, true, resolution.error);
  assert.equal(resolution.stateDigest, transfer.checkpoint.stateDigest);
  assert.equal(resolution.certificateId, publication.certificateId);

  await stop(receiverId);
  await start(receiverId, binding, keys);
  const restarted = await command(receiverId, {
    kind: "inspect",
    checkpointId: transfer.checkpoint.checkpointId,
  });
  assert.equal(restarted.available, true);
  assert.equal(restarted.certificateId, publication.certificateId);

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "passed",
        independentPeerProcesses: peerIds.length,
        certifiedReplicaPeerIds: selectedReplicas.map(({ peerId }) => peerId),
        producerStoppedBeforeResolution: true,
        checkpointResolvedBy: receiverId,
        receiverRestartPreservedArtifact: restarted.available,
        receiverRestartPreservedCertificate: Boolean(restarted.certificateId),
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await stopAll();
  for (const schema of Object.values(schemas))
    await pool
      .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      .catch(() => undefined);
  await pool.end();
}

async function startAll(binding, keys) {
  for (const peerId of peerIds) await start(peerId, binding, keys);
}

async function start(peerId, binding, keys) {
  if (children.has(peerId)) return;
  const publicKeys = Object.fromEntries(
    await Promise.all(
      [...keys].map(async ([memberPeerId, definition]) => [
        memberPeerId,
        {
          keyId: definition.keyId,
          publicKey: await crypto.subtle.exportKey(
            "jwk",
            definition.pair.publicKey,
          ),
        },
      ]),
    ),
  );
  const definition = keys.get(peerId);
  const child = fork(childFile, [], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PEER_ID: peerId,
      PORT: String(ports[peerId]),
      SCOPE: JSON.stringify(scope(peerId)),
      MEMBERSHIP_BINDING: JSON.stringify(binding),
      PUBLIC_KEYS: JSON.stringify(publicKeys),
      PRIVATE_KEY: JSON.stringify({
        keyId: definition.keyId,
        privateKey: await crypto.subtle.exportKey(
          "jwk",
          definition.pair.privateKey,
        ),
      }),
      ENDPOINTS: JSON.stringify(endpoints),
      CHANNEL_TOKEN: channelToken,
      DATABASE_SCHEMA: schemas[peerId],
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  children.set(peerId, child);
  await waitFor(
    child,
    (message) => message?.kind === "ready",
    `start:${peerId}`,
  );
}

async function stop(peerId) {
  const child = children.get(peerId);
  if (!child) return;
  children.delete(peerId);
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
}

async function stopAll() {
  await Promise.all([...children.keys()].map(stop));
}

async function command(peerId, value) {
  const child = children.get(peerId);
  if (!child) throw new Error(`${peerId} is unavailable`);
  const requestId = randomUUID();
  child.send({ ...value, requestId });
  return waitFor(
    child,
    (response) => response?.requestId === requestId,
    `${value.kind}:${peerId}`,
  );
}

function waitFor(child, predicate, label) {
  return new Promise((resolve, reject) => {
    const observed = [];
    const timeout = setTimeout(
      () =>
        finish(new Error(`${label} timed out: ${JSON.stringify(observed)}`)),
      15_000,
    );
    const onMessage = (message) => {
      observed.push(message);
      if (predicate(message)) finish(null, message);
    };
    const onExit = (code) => finish(new Error(`peer exited with code ${code}`));
    function finish(error, value) {
      clearTimeout(timeout);
      child.off("message", onMessage);
      child.off("exit", onExit);
      error ? reject(error) : resolve(value);
    }
    child.on("message", onMessage);
    child.once("exit", onExit);
  });
}

async function keysFor(ids) {
  return new Map(
    await Promise.all(
      ids.map(async (peerId) => [
        peerId,
        {
          keyId: `key.${peerId}.v1`,
          pair: await crypto.subtle.generateKey(
            MESH_SIGNATURE_ALGORITHM,
            true,
            ["sign", "verify"],
          ),
        },
      ]),
    ),
  );
}

function membershipBinding() {
  return Object.freeze({
    schemaVersion: 1,
    epoch: 1,
    configurationDigest: `sha256:${"a".repeat(64)}`,
    memberInstances: Object.freeze(
      peerIds.map((peerId) => ({
        peerId,
        instanceId: scope(peerId).instanceId,
      })),
    ),
  });
}

function checkpointTransfer() {
  return {
    schemaVersion: 1,
    contentClass: "portable_application_state",
    tenantId: "tenant:checkpoint-test",
    objectiveId: "objective:checkpoint-test",
    sourceSessionId: "session:source",
    sourceAgentId: "agent:source",
    sourceSessionRevision: 4,
    roleBindingId: "role:source",
    adapterId: "adapter:portable",
    adapterVersion: "1.0.0",
    implementationId: "adapter:portable:build:1",
    checkpoint: {
      schemaVersion: 1,
      checkpointId: "checkpoint:portable:example:1",
      sessionId: "session:source",
      adapterId: "adapter:portable",
      adapterVersion: "1.0.0",
      implementationId: "adapter:portable:build:1",
      throughStepSequence: 3,
      stateReference: "local://source/checkpoint/3",
      stateDigest: `sha256:${"d".repeat(64)}`,
      createdAt: "2030-01-01T00:00:00.000Z",
    },
    state: { completedUnits: ["unit:1", "unit:2"], cursor: 2 },
    exportedAt: "2030-01-01T00:00:00.000Z",
  };
}

function scope(peerId) {
  const name = peerId.split(":")[1];
  return {
    tenantId: "tenant:checkpoint-test",
    meshId: "mesh:checkpoint-test",
    peerId,
    instanceId: `instance:${name}:1`,
    policyDomainId: "policy-domain:checkpoint-test",
  };
}

function databaseOptions() {
  if (process.env.DATABASE_URL)
    return { connectionString: process.env.DATABASE_URL, max: 4 };
  return {
    host: process.env.PGHOST ?? "127.0.0.1",
    port: Number(process.env.PGPORT ?? "55433"),
    database: process.env.PGDATABASE ?? "agentplat_mesh_demo",
    user: process.env.PGUSER ?? "agentplat",
    password: process.env.PGPASSWORD ?? "agentplat",
    max: 4,
  };
}
