import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fork } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  collectiveSyncDigestV1,
  createCollectiveSyncRecordV1,
} from "@agentplat/collective-sync";
import { MESH_SIGNATURE_ALGORITHM } from "@agentplat/mesh-protocol";
import { runMigrations } from "@agentplat/collective-sync-postgres";
import { Pool } from "pg";

const schema = `sync_demo_${randomUUID().replaceAll("-", "")}`;
const channelToken = randomUUID();
const peerIds = ["peer.1", "peer.2", "peer.3"];
const basePort = 20_000 + Math.floor(Math.random() * 15_000);
const ports = Object.fromEntries(
  peerIds.map((peerId, index) => [peerId, basePort + index]),
);
const endpoints = Object.fromEntries(
  peerIds.map((peerId) => [peerId, `http://127.0.0.1:${ports[peerId]}`]),
);
const pool = new Pool(databaseOptions());
const children = new Map();
const childFile = fileURLToPath(new URL("./peer.mjs", import.meta.url));

try {
  await runMigrations(pool, { schema, createSchema: true });
  const epochOneKeys = await keysFor(peerIds);
  const epochOne = await membershipBinding(1, epochOneKeys);
  await startAll(epochOne, epochOneKeys);

  const first = await syncRecord(1, null, {
    type: "objective.accepted",
    objectiveId: "objective.1",
  });
  const second = await syncRecord(2, first.recordDigest, {
    type: "work.accepted",
    workItemId: "work.1",
  });
  for (const peerId of ["peer.2", "peer.3"])
    await command(peerId, {
      kind: "append",
      syncDomain: "mission.1",
      records: [first, second],
    });

  const joined = await command("peer.1", {
    kind: "catch_up",
    syncDomain: "mission.1",
  });
  assert.equal(joined.ok, true, joined.error);
  let target = await command("peer.1", {
    kind: "inspect",
    syncDomain: "mission.1",
  });
  assert.equal(target.readiness.ready, true, target.readiness.reasonCode);
  assert.equal(target.frontier.entries[0].sequence, 2);
  assert.deepEqual(target.projection.accepted, [
    first.recordDigest,
    second.recordDigest,
  ]);

  await stop("peer.3");
  const third = await syncRecord(3, second.recordDigest, {
    type: "result.accepted",
    resultId: "result.1",
  });
  await command("peer.2", {
    kind: "append",
    syncDomain: "mission.1",
    records: [third],
  });
  const partitioned = await command("peer.1", {
    kind: "catch_up",
    syncDomain: "mission.1",
  });
  assert.equal(partitioned.ok, false);
  assert.equal(partitioned.error, "sync_frontier_threshold_unavailable");

  await start("peer.3", epochOne, epochOneKeys);
  await command("peer.3", {
    kind: "append",
    syncDomain: "mission.1",
    records: [third],
  });
  const healed = await command("peer.1", {
    kind: "catch_up",
    syncDomain: "mission.1",
  });
  assert.equal(healed.ok, true, healed.error);
  target = await command("peer.1", {
    kind: "inspect",
    syncDomain: "mission.1",
  });
  assert.equal(target.frontier.entries[0].sequence, 3);
  assert.equal(target.readiness.ready, true);

  const epochTwoKeys = new Map(epochOneKeys);
  epochTwoKeys.set("peer.2", await keyPair("peer.2", 2));
  const epochTwo = await membershipBinding(2, epochTwoKeys);
  await stopAll();
  await startAll(epochTwo, epochTwoKeys);
  const staleAfterRotation = await command("peer.1", {
    kind: "inspect",
    syncDomain: "mission.1",
  });
  assert.equal(staleAfterRotation.readiness.ready, false);
  assert.equal(
    staleAfterRotation.readiness.reasonCode,
    "sync_certificate_scope_or_membership_stale",
  );
  const rotated = await command("peer.1", {
    kind: "catch_up",
    syncDomain: "mission.1",
  });
  assert.equal(rotated.ok, true, rotated.error);
  const rotatedReady = await command("peer.1", {
    kind: "inspect",
    syncDomain: "mission.1",
  });
  assert.equal(
    rotatedReady.readiness.ready,
    true,
    rotatedReady.readiness.reasonCode,
  );

  await stop("peer.1");
  await start("peer.1", epochTwo, epochTwoKeys);
  const restarted = await command("peer.1", {
    kind: "inspect",
    syncDomain: "mission.1",
  });
  assert.equal(restarted.readiness.ready, true);
  assert.deepEqual(restarted.projection.accepted, [
    first.recordDigest,
    second.recordDigest,
    third.recordDigest,
  ]);

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "passed",
        membershipEpoch: epochTwo.epoch,
        joinedAtSequence: 2,
        recoveredAtSequence: restarted.frontier.entries[0].sequence,
        partitionFailedClosed: true,
        rotatedKeyId: epochTwoKeys.get("peer.2").keyId,
        restartRestoredReadiness: restarted.readiness.ready,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await stopAll();
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
      DATABASE_SCHEMA: schema,
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

async function command(peerId, message) {
  const child = children.get(peerId);
  if (!child) throw new Error(`${peerId} is unavailable`);
  const requestId = randomUUID();
  child.send({ ...message, requestId });
  return waitFor(
    child,
    (response) => response?.requestId === requestId,
    `${message.kind}:${peerId}`,
  );
}

function waitFor(child, predicate, label) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null) {
      reject(new Error(`peer already exited with code ${child.exitCode}`));
      return;
    }
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
      ids.map(async (peerId) => [peerId, await keyPair(peerId, 1)]),
    ),
  );
}
async function keyPair(peerId, revision) {
  return {
    keyId: `key.${peerId}.v${revision}`,
    pair: await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
      "sign",
      "verify",
    ]),
  };
}
async function membershipBinding(epoch, keys) {
  const body = {
    epoch,
    memberPeerIds: [...keys.keys()].sort(),
    memberInstances: [...keys.keys()]
      .sort()
      .map((peerId) => ({ peerId, instanceId: scope(peerId).instanceId })),
    activeKeyIds: [...keys].map(([peerId, definition]) => ({
      peerId,
      keyId: definition.keyId,
    })),
  };
  return Object.freeze({
    epoch,
    configurationDigest: await collectiveSyncDigestV1({
      domain: "example.membership",
      ...body,
    }),
    memberPeerIds: Object.freeze(body.memberPeerIds),
    memberInstances: Object.freeze(body.memberInstances),
  });
}
function syncRecord(sequence, predecessorDigest, payload) {
  return createCollectiveSyncRecordV1({
    tenantId: "tenant.1",
    meshId: "mesh.1",
    policyDomainId: "policy.1",
    syncDomain: "mission.1",
    streamId: "stream.objective.1",
    sequence,
    predecessorDigest,
    payload,
    createdAtLogicalMs: sequence,
  });
}
function scope(peerId) {
  return {
    tenantId: "tenant.1",
    meshId: "mesh.1",
    peerId,
    instanceId: `instance.${peerId}`,
    policyDomainId: "policy.1",
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
