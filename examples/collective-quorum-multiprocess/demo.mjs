import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

import { runMigrations } from "@agentplat/collective-quorum-postgres";
import { Pool } from "pg";

const peerIds = [
  "proposer.a",
  "proposer.b",
  "witness.1",
  "witness.2",
  "witness.3",
];
const witnesses = ["witness.1", "witness.2", "witness.3"];
const basePort = Number(process.env.QUORUM_BASE_PORT ?? "43210");
const endpoints = Object.fromEntries(
  peerIds.map((peerId, index) => [
    peerId,
    `http://127.0.0.1:${basePort + index}`,
  ]),
);
const schema = `quorum_demo_${randomBytes(8).toString("hex")}`;
const channelToken = randomBytes(32).toString("base64url");
const pool = new Pool(databaseOptions());
const children = new Map();
const allChildren = [];
const processEpochs = new Map(peerIds.map((peerId) => [peerId, 0]));
const childFile = fileURLToPath(new URL("./peer.mjs", import.meta.url));

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
  const publicJwks = Object.fromEntries(
    await Promise.all(
      peerIds.map(async (peerId) => [
        peerId,
        await crypto.subtle.exportKey("jwk", keyPairs[peerId].publicKey),
      ]),
    ),
  );

  const spawn = async (peerId) => {
    const processEpoch = (processEpochs.get(peerId) ?? 0) + 1;
    processEpochs.set(peerId, processEpoch);
    const child = fork(childFile, [], {
      env: {
        ...process.env,
        PEER_ID: peerId,
        PEER_PORT: String(basePort + peerIds.indexOf(peerId)),
        PEER_ENDPOINTS: JSON.stringify(endpoints),
        PROCESS_EPOCH: String(processEpoch),
        QUORUM_SCHEMA: schema,
        CHANNEL_TOKEN: channelToken,
        PRIVATE_KEY_JWK: JSON.stringify(
          await crypto.subtle.exportKey("jwk", keyPairs[peerId].privateKey),
        ),
        PUBLIC_KEY_JWKS: JSON.stringify(publicJwks),
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    children.set(peerId, child);
    allChildren.push(child);
    await waitFor(child, (message) => message?.kind === "ready", 15_000);
  };

  await Promise.all(peerIds.map(spawn));
  const first = await elect("proposer.a", input());
  assert.ok(first);
  assert.equal(first.certifiedWitnessPeerIds.length, 2);

  await stop("witness.2", "SIGKILL");
  await spawn("witness.2");
  const second = await elect("proposer.b", {
    ...input(),
    proposals: [
      ...input().proposals,
      {
        takeoverProposalId: "proposal.c",
        proposedAssigneePeerId: "candidate.c",
        acceptedAtLogicalMs: 92,
      },
    ],
  });
  assert.ok(second);
  assert.equal(second.selectedProposalId, first.selectedProposalId);
  assert.equal(second.selectedAssigneePeerId, first.selectedAssigneePeerId);

  await Promise.all([
    stop("witness.2", "SIGTERM"),
    stop("witness.3", "SIGTERM"),
  ]);
  const minority = await elect("proposer.a", input());
  assert.equal(minority, null);

  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        scenario: "distributed_peer_quorum",
        processCount: 6,
        distinctPeerCount: 5,
        restartedPeerId: "witness.2",
        firstDecision: first,
        postRestartDecision: second,
        minorityFailedClosed: minority === null,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await Promise.all(
    [...children.keys()].map((peerId) =>
      stop(peerId, "SIGTERM").catch(() => undefined),
    ),
  );
  await pool
    .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    .catch(() => undefined);
  await pool.end();
}

async function elect(peerId, electionInput) {
  const child = children.get(peerId);
  if (!child?.connected) throw new Error(`${peerId} is not running`);
  const requestId = randomBytes(8).toString("hex");
  const response = waitFor(
    child,
    (message) =>
      message?.requestId === requestId &&
      (message.kind === "election" || message.kind === "election_error"),
    15_000,
  );
  child.send({ kind: "elect", requestId, input: electionInput });
  const message = await response;
  if (message.kind === "election_error") throw new Error(message.error);
  return message.decision;
}

async function stop(peerId, signal) {
  const child = children.get(peerId);
  if (!child) return;
  children.delete(peerId);
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill(signal);
  await Promise.race([
    exited,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${peerId} did not exit`)), 5_000),
    ),
  ]);
}

function waitFor(child, predicate, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.off("message", onMessage);
      reject(new Error(`timed out waiting for child ${child.pid}`));
    }, timeoutMs);
    const onMessage = (message) => {
      if (!predicate(message)) return;
      clearTimeout(timeout);
      child.off("message", onMessage);
      resolve(message);
    };
    child.on("message", onMessage);
  });
}

function input() {
  return {
    scopeDigest: `sha256:${"5".repeat(64)}`,
    objectiveId: "objective.demo.1",
    objectiveRevision: 1,
    objectiveExpiresAtLogicalMs: 1_000,
    workItemId: "work.demo.1",
    workItemRevision: 1,
    priorAssignmentEpoch: 1,
    proposedAssignmentEpoch: 2,
    proposals: [
      {
        takeoverProposalId: "proposal.a",
        proposedAssigneePeerId: "candidate.a",
        acceptedAtLogicalMs: 90,
      },
      {
        takeoverProposalId: "proposal.b",
        proposedAssigneePeerId: "candidate.b",
        acceptedAtLogicalMs: 91,
      },
    ],
    eligibleWitnessPeerIds: witnesses,
    recoveryWitnessThreshold: 2,
    logicalTimeMs: 100,
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
