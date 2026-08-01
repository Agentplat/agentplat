import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

import { createPostgresPool, runMigrations } from "@agentplat/mesh-postgres";

const databaseEnvironment =
  process.env.DATABASE_URL === undefined
    ? {
        PGHOST: process.env.PGHOST ?? "127.0.0.1",
        PGPORT: process.env.PGPORT ?? "55433",
        PGDATABASE: process.env.PGDATABASE ?? "agentplat_mesh_demo",
        PGUSER: process.env.PGUSER ?? "agentplat",
        PGPASSWORD: process.env.PGPASSWORD ?? "agentplat",
      }
    : { DATABASE_URL: process.env.DATABASE_URL };
const ports = {
  "peer-a": positivePort(process.env.PEER_A_PORT ?? "43101"),
  "peer-b": positivePort(process.env.PEER_B_PORT ?? "43102"),
};
const schema = `mesh_demo_${randomBytes(8).toString("hex")}`;
const channelToken = randomBytes(32).toString("base64url");
const pool = createPostgresPool({
  ...("DATABASE_URL" in databaseEnvironment
    ? { connectionString: databaseEnvironment.DATABASE_URL }
    : {
        host: databaseEnvironment.PGHOST,
        port: Number(databaseEnvironment.PGPORT),
        database: databaseEnvironment.PGDATABASE,
        user: databaseEnvironment.PGUSER,
        password: databaseEnvironment.PGPASSWORD,
      }),
  max: 4,
});
const children = [];

try {
  await runMigrations(pool, { schema, createSchema: true });
  const keyPairs = {
    "peer-a": await crypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify",
    ]),
    "peer-b": await crypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify",
    ]),
  };
  const publicKeys = Object.fromEntries(
    await Promise.all(
      Object.entries(keyPairs).map(async ([peerId, pair]) => [
        peerId,
        await crypto.subtle.exportKey("jwk", pair.publicKey),
      ]),
    ),
  );
  const childFile = fileURLToPath(new URL("./peer.mjs", import.meta.url));
  const spawnPeer = async (peerId, { paused = false } = {}) => {
    const child = fork(childFile, [], {
      env: {
        PATH: process.env.PATH,
        ...databaseEnvironment,
        MESH_SCHEMA: schema,
        PEER_ID: peerId,
        PEER_PORT: String(ports[peerId]),
        PEER_ENDPOINTS: JSON.stringify(
          Object.fromEntries(
            Object.entries(ports).map(([id, port]) => [
              id,
              `http://127.0.0.1:${port}`,
            ]),
          ),
        ),
        CHANNEL_TOKEN: channelToken,
        PRIVATE_KEY_JWK: JSON.stringify(
          await crypto.subtle.exportKey("jwk", keyPairs[peerId].privateKey),
        ),
        PUBLIC_KEY_JWKS: JSON.stringify(publicKeys),
        START_PAUSED: paused ? "1" : "0",
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    children.push(child);
    return child;
  };

  const peerA = await spawnPeer("peer-a");
  const initialPeerB = await spawnPeer("peer-b", { paused: true });
  await Promise.all(
    [peerA, initialPeerB].map((child) => waitFor(child, "ready", 15_000)),
  );
  const acknowledged = waitFor(peerA, "acknowledged", 30_000);
  const pingSent = waitFor(peerA, "ping_sent", 5_000);
  peerA.send({ kind: "ping", peerId: "peer-b" });
  await pingSent;
  const crashed = once(initialPeerB, "exit");
  initialPeerB.kill("SIGKILL");
  await crashed;
  const peerB = await spawnPeer("peer-b");
  await waitFor(peerB, "ready", 15_000);
  const acknowledgment = await acknowledged;
  const [stateA, stateB] = await Promise.all(
    [peerA, peerB].map((child) => requestState(child, 5_000)),
  );

  assert.equal(stateB.revision, 1);
  assert.equal(stateB.state.received.length, 1);
  assert.equal(stateB.state.received[0].type, "peer.ping");
  assert.equal(stateA.revision, 1);
  assert.equal(stateA.state.received.length, 1);
  assert.equal(stateA.state.received[0].type, "peer.ping_ack");
  assert.equal(
    stateA.state.received[0].causationId,
    stateB.state.received[0].messageId,
  );
  assert.equal(acknowledgment.causationId, stateB.state.received[0].messageId);

  console.log(
    JSON.stringify({
      example: "mesh-multiprocess",
      status: "passed",
      transport: "http",
      durability: "postgresql",
      peerIdentities: 2,
      processesStarted: 3,
      duplicateDeliveries: 1,
      forcedReceiverRestart: true,
      durableInboxRecordsAtPeerB: stateB.state.received.length,
      acknowledgementCausationId: acknowledgment.causationId,
      privateKeysPersisted: false,
    }),
  );
} finally {
  for (const child of children) {
    if (child.connected) child.send({ kind: "shutdown" });
  }
  await Promise.all(
    children.map(async (child) => {
      if (child.exitCode === null && child.signalCode === null) {
        await Promise.race([
          once(child, "exit"),
          new Promise((resolve) => setTimeout(resolve, 2_000)),
        ]);
      }
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
      }
    }),
  );
  if (/^mesh_demo_[a-f0-9]{16}$/u.test(schema)) {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
  await pool.end();
}

function waitFor(child, kind, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${kind}`));
    }, timeoutMs);
    const onMessage = (message) => {
      if (message?.kind !== kind) return;
      cleanup();
      resolve(message);
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`Peer exited before ${kind}: ${code}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("exit", onExit);
    };
    child.on("message", onMessage);
    child.on("exit", onExit);
  });
}

async function requestState(child, timeoutMs) {
  const response = waitFor(child, "state", timeoutMs);
  child.send({ kind: "state" });
  return (await response).snapshot;
}

function positivePort(value) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
    throw new RangeError("Peer port must be between 1024 and 65535");
  }
  return port;
}
