import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { collectiveSyncDigestV1 } from "@agentplat/collective-sync";
import { runMigrations as runSyncMigrations } from "@agentplat/collective-sync-postgres";
import { MESH_SIGNATURE_ALGORITHM } from "@agentplat/mesh-protocol";
import { selectPlanningArtifactReplicasV1 } from "@agentplat/planning-artifacts";
import { runMigrations as runArtifactMigrations } from "@agentplat/planning-artifacts-postgres";
import { Pool } from "pg";
import { planningArtifactFixture } from "./fixture.mjs";

const peerIds = [
  "peer:alpha",
  "peer:beta",
  "peer:delta",
  "peer:epsilon",
  "peer:gamma",
];
const replicationPolicy = Object.freeze({
  schemaVersion: 1,
  replicaCount: 2,
  writeThreshold: 2,
  receiptLifetimeMs: 10_000,
});
const runId = randomUUID().replaceAll("-", "");
const schemas = Object.fromEntries(
  peerIds.map((peerId) => [
    peerId,
    `artifact_demo_${peerId.split(":")[1]}_${runId}`,
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

try {
  for (const schema of Object.values(schemas)) {
    await runSyncMigrations(pool, { schema, createSchema: true });
    await runArtifactMigrations(pool, { schema, createSchema: true });
  }
  const keys = await keysFor(peerIds);
  const binding = await membershipBinding(keys);
  await startAll(binding, keys);

  const { projection } = planningArtifactFixture();
  const record = projection.repositoryRecord;
  const publication = await command("peer:alpha", {
    kind: "publish",
    record,
  });
  assert.equal(publication.published, true);
  assert.equal(publication.contentReference, record.contentReference);
  assert.ok(publication.certificateId);
  const selectedReplicas = await selectPlanningArtifactReplicasV1({
    membership: binding,
    sourcePeerId: "peer:alpha",
    sourceInstanceId: "instance:alpha:1",
    fragmentDigest: record.fragmentDigest,
    policy: replicationPolicy,
  });
  assert.deepEqual(
    publication.certifiedReplicaPeerIds,
    selectedReplicas.map((replica) => replica.peerId).sort(),
  );
  const receiverId = peerIds.find(
    (peerId) =>
      peerId !== "peer:alpha" &&
      !selectedReplicas.some((replica) => replica.peerId === peerId),
  );
  assert.ok(receiverId);
  const before = await command(receiverId, {
    kind: "inspect",
    contentReference: record.contentReference,
    fragmentDigest: record.fragmentDigest,
  });
  assert.equal(before.available, false);

  // The producer is removed before resolution. Only certified replicas remain.
  await stop("peer:alpha");

  // This request is exactly what the runtime derives after authenticating a work offer.
  const offerArtifact = {
    tenantId: record.tenantId,
    meshId: record.meshId,
    policyDomainId: record.policyDomainId,
    objectiveId: record.objectiveId,
    missionIntentId: projection.extension.missionIntentId,
    intentRevision: projection.extension.intentRevision,
    intentDigest: projection.extension.intentDigest,
    proposalDigest: projection.extension.proposalDigest,
    fragmentDigest: projection.extension.fragmentDigest,
    planViewDigest: projection.extension.planViewDigest,
    contentReference: record.contentReference,
    sourcePeerId: "peer:alpha",
    sourceInstanceId: "instance:alpha:1",
    receivedAtLogicalMs: 100,
  };
  const receiver = await command(receiverId, {
    kind: "accept_offer",
    request: offerArtifact,
  });
  assert.equal(receiver.accepted, true, receiver.error);
  assert.equal(receiver.fragmentDigest, record.fragmentDigest);
  assert.equal(receiver.certificateCreated, false);

  await stop(receiverId);
  await start(receiverId, binding, keys);
  const restarted = await command(receiverId, {
    kind: "inspect",
    contentReference: record.contentReference,
    fragmentDigest: record.fragmentDigest,
  });
  assert.equal(restarted.available, true);
  assert.equal(restarted.fragmentDigest, record.fragmentDigest);
  assert.equal(restarted.certificateId, publication.certificateId);

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "passed",
        independentPeerProcesses: peerIds.length,
        certifiedReplicaPeerIds: selectedReplicas.map(
          (replica) => replica.peerId,
        ),
        producerStoppedBeforeResolution: true,
        exactArtifactResolvedBy: receiverId,
        catchUpCertificateCreated: false,
        receiverRestartPreservedArtifact: restarted.available,
        receiverRestartPreservedReplicationCertificate: Boolean(
          restarted.certificateId,
        ),
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
        finish(
          new Error(`${label} timed out after ${JSON.stringify(observed)}`),
        ),
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
async function membershipBinding(keys) {
  const memberPeerIds = [...keys.keys()].sort();
  const memberInstances = memberPeerIds.map((peerId) => ({
    peerId,
    instanceId: scope(peerId).instanceId,
  }));
  return Object.freeze({
    epoch: 1,
    configurationDigest: await collectiveSyncDigestV1({
      domain: "example.planning-artifact.membership",
      memberPeerIds,
      memberInstances,
    }),
    memberPeerIds: Object.freeze(memberPeerIds),
    memberInstances: Object.freeze(memberInstances),
  });
}
function scope(peerId) {
  const name = peerId.split(":")[1];
  return {
    tenantId: "tenant:artifact-test",
    meshId: "mesh:artifact-test",
    peerId,
    instanceId: `instance:${name}:1`,
    policyDomainId: "policy-domain:artifact-test",
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
