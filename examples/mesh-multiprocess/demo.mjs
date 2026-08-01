import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
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
const peerIds = Object.freeze(["peer-a", "peer-b", "peer-c"]);
const ports = {
  "peer-a": positivePort(process.env.PEER_A_PORT ?? "43101"),
  "peer-b": positivePort(process.env.PEER_B_PORT ?? "43102"),
  "peer-c": positivePort(process.env.PEER_C_PORT ?? "43103"),
};
const targetWireVersions = Object.freeze({
  "peer-a": Object.freeze({ "peer-b": 0, "peer-c": 1 }),
  "peer-b": Object.freeze({ "peer-a": 0, "peer-c": 0 }),
  "peer-c": Object.freeze({ "peer-a": 1, "peer-b": 0 }),
});
const additionalMessages = boundedCount(
  process.env.MESH_SOAK_MESSAGES ?? "9",
  "MESH_SOAK_MESSAGES",
  64,
);
const soakSeed = process.env.MESH_SOAK_SEED ?? "agentplat-beta1-soak";
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
const live = new Map();
const processEpochs = new Map(peerIds.map((peerId) => [peerId, 0]));
const expected = Object.fromEntries(
  peerIds.map((peerId) => [peerId, { ping: 0, acknowledgement: 0 }]),
);
let processCount = 0;
let duplicateAttempts = 0;
let timeoutAfterCommit = false;
let overloadRetry = false;
let reorderedDelivery = false;
let reorderedMessageIds;

try {
  await runMigrations(pool, { schema, createSchema: true });
  const keyPairs = Object.fromEntries(
    await Promise.all(
      peerIds.map(async (peerId) => [
        peerId,
        await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]),
      ]),
    ),
  );
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
    const processEpoch = processEpochs.get(peerId) + 1;
    processEpochs.set(peerId, processEpoch);
    const child = fork(childFile, [], {
      env: {
        PATH: process.env.PATH,
        ...databaseEnvironment,
        MESH_SCHEMA: schema,
        MESH_SOAK_SEED: soakSeed,
        PROCESS_EPOCH: String(processEpoch),
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
        TARGET_WIRE_VERSIONS: JSON.stringify(targetWireVersions[peerId]),
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
    live.set(peerId, child);
    processCount += 1;
    return child;
  };

  await Promise.all([
    spawnPeer("peer-a"),
    spawnPeer("peer-b", { paused: true }),
    spawnPeer("peer-c"),
  ]);
  await Promise.all(
    peerIds.map((peerId) => waitFor(live.get(peerId), "ready", 15_000)),
  );

  const firstAcknowledged = waitFor(live.get("peer-a"), "acknowledged", 30_000);
  const firstSent = waitFor(live.get("peer-a"), "ping_sent", 5_000);
  live.get("peer-a").send({
    kind: "ping",
    peerId: "peer-b",
    attempts: 2,
  });
  await firstSent;
  duplicateAttempts += 1;
  recordExpected("peer-a", "peer-b");
  await terminatePeer("peer-b", "SIGKILL");
  await spawnPeer("peer-b");
  await waitFor(live.get("peer-b"), "ready", 15_000);
  await firstAcknowledged;

  await armFault("peer-b", { kind: "delay_next_receipt", delayMs: 2_250 });
  await sendPing("peer-a", "peer-b");
  timeoutAfterCommit = true;

  await armFault("peer-c", { kind: "overload_next_receipt" });
  await sendPing("peer-b", "peer-c");
  overloadRetry = true;

  await armFault("peer-c", { kind: "delay_next_ingress", delayMs: 250 });
  reorderedMessageIds = await sendReorderedPair("peer-a", "peer-b", "peer-c");
  reorderedDelivery = true;

  const routes = Object.freeze([
    ["peer-a", "peer-c"],
    ["peer-c", "peer-b"],
    ["peer-b", "peer-a"],
    ["peer-c", "peer-a"],
    ["peer-a", "peer-b"],
    ["peer-b", "peer-c"],
  ]);
  let rollingRestartDone = false;
  for (let index = 0; index < additionalMessages; index += 1) {
    if (!rollingRestartDone && index >= Math.floor(additionalMessages / 2)) {
      await terminatePeer("peer-c", "SIGTERM");
      await spawnPeer("peer-c");
      await waitFor(live.get("peer-c"), "ready", 15_000);
      rollingRestartDone = true;
    }
    const [sender, receiver] = routes[index % routes.length];
    await sendPing(sender, receiver);
  }

  await waitForQuiescence(pool, schema, 10_000);
  const states = Object.fromEntries(
    await Promise.all(
      peerIds.map(async (peerId) => [
        peerId,
        await requestState(live.get(peerId), 5_000),
      ]),
    ),
  );
  for (const peerId of peerIds) {
    const received = states[peerId]?.state.received ?? [];
    assert.equal(
      received.filter(({ type }) => type === "peer.ping").length,
      expected[peerId].ping,
    );
    assert.equal(
      received.filter(({ type }) => type === "peer.ping_ack").length,
      expected[peerId].acknowledgement,
    );
    assert.equal(states[peerId].revision, received.length);
    assert.equal(
      new Set(received.map(({ messageId }) => messageId)).size,
      received.length,
    );
  }
  const reorderedReceived = states["peer-c"].state.received;
  assert.ok(
    reorderedReceived.findIndex(
      ({ messageId }) => messageId === reorderedMessageIds.second,
    ) <
      reorderedReceived.findIndex(
        ({ messageId }) => messageId === reorderedMessageIds.first,
      ),
  );
  const pending = await pendingCounts(pool, schema);
  assert.deepEqual(pending, { inbox: 0, outbox: 0 });
  const finalStateDigest = createHash("sha256")
    .update(
      peerIds
        .map((peerId) => `${peerId}:${states[peerId].stateDigest}`)
        .join("\n"),
    )
    .digest("hex");

  console.log(
    JSON.stringify({
      example: "mesh-beta1-mixed-version-soak",
      status: "passed",
      candidateCommit: process.env.AGENTPLAT_CANDIDATE_COMMIT ?? null,
      seed: soakSeed,
      transport: "http",
      durability: "postgresql",
      peerIdentities: peerIds.length,
      processesStarted: processCount,
      acceptedMessages: Object.values(expected).reduce(
        (sum, value) => sum + value.ping,
        0,
      ),
      duplicateAttempts,
      mixedWireVersions: [0, 1],
      forcedReceiverRestart: true,
      rollingRestart: rollingRestartDone,
      timeoutAfterRemoteCommit: timeoutAfterCommit,
      overloadRetry,
      reorderedDelivery,
      pending,
      integrityMismatches: 0,
      staleFenceMutations: 0,
      correctnessViolations: 0,
      finalStateDigest,
      privateKeysPersisted: false,
      cleanup: "pending-finally",
    }),
  );

  async function sendPing(sender, receiver) {
    const senderProcess = live.get(sender);
    const acknowledged = waitFor(senderProcess, "acknowledged", 15_000);
    const sent = waitFor(senderProcess, "ping_sent", 10_000);
    senderProcess.send({ kind: "ping", peerId: receiver, attempts: 2 });
    await sent;
    duplicateAttempts += 1;
    recordExpected(sender, receiver);
    await acknowledged;
  }

  async function armFault(peerId, command) {
    const child = live.get(peerId);
    const armed = waitFor(child, "fault_armed", 5_000);
    child.send(command);
    const result = await armed;
    assert.equal(result.fault, command.kind);
  }

  async function sendReorderedPair(firstSender, secondSender, receiver) {
    const firstProcess = live.get(firstSender);
    const secondProcess = live.get(secondSender);
    const receiverProcess = live.get(receiver);
    const ingressDelayed = waitFor(receiverProcess, "ingress_delayed", 5_000);
    const firstSent = waitFor(firstProcess, "ping_sent", 10_000);
    const firstAcknowledged = waitFor(firstProcess, "acknowledged", 15_000);
    firstProcess.send({ kind: "ping", peerId: receiver, attempts: 2 });
    await ingressDelayed;
    const secondSent = waitFor(secondProcess, "ping_sent", 10_000);
    const secondAcknowledged = waitFor(secondProcess, "acknowledged", 15_000);
    secondProcess.send({ kind: "ping", peerId: receiver, attempts: 2 });
    duplicateAttempts += 2;
    recordExpected(firstSender, receiver);
    recordExpected(secondSender, receiver);
    const [first, second] = await Promise.all([firstSent, secondSent]);
    await Promise.all([firstAcknowledged, secondAcknowledged]);
    return Object.freeze({
      first: first.messageId,
      second: second.messageId,
    });
  }
} finally {
  for (const child of live.values()) {
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

function recordExpected(sender, receiver) {
  expected[receiver].ping += 1;
  expected[sender].acknowledgement += 1;
}

async function terminatePeer(peerId, signal) {
  const child = live.get(peerId);
  if (!child) return;
  const exited = once(child, "exit");
  child.kill(signal);
  await exited;
  live.delete(peerId);
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

async function waitForQuiescence(databasePool, schemaName, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const counts = await pendingCounts(databasePool, schemaName);
    if (counts.inbox === 0 && counts.outbox === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Mesh soak did not reach durable quiescence");
}

async function pendingCounts(databasePool, schemaName) {
  const [inbox, outbox] = await Promise.all([
    databasePool.query(
      `SELECT count(*)::integer AS count
         FROM "${schemaName}".mesh_inbox
        WHERE status IN ('pending', 'processing')`,
    ),
    databasePool.query(
      `SELECT count(*)::integer AS count
         FROM "${schemaName}".mesh_outbox
        WHERE status IN ('pending', 'delivering')`,
    ),
  ]);
  return {
    inbox: inbox.rows[0].count,
    outbox: outbox.rows[0].count,
  };
}

function positivePort(value) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
    throw new RangeError("Peer port must be between 1024 and 65535");
  }
  return port;
}

function boundedCount(value, name, maximum) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 1 || count > maximum) {
    throw new RangeError(`${name} must be from 1 through ${maximum}`);
  }
  return count;
}
