import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  collectiveMembershipJoinStatementDigestV1,
  collectiveMembershipRotationStatementDigestV1,
  createCollectiveMembershipConfigurationV1,
  createCollectiveMembershipKeyProofV1,
  createCollectiveMembershipTransitionProposalV1,
  exportCollectiveMembershipPublicKeyV1,
} from "@agentplat/collective-membership";
import { runMigrations } from "@agentplat/collective-membership-postgres";
import { MESH_SIGNATURE_ALGORITHM } from "@agentplat/mesh-protocol";
import { Pool } from "pg";

const peerIds = ["peer.1", "peer.2", "peer.3", "peer.4", "peer.5"];
const basePort = Number(process.env.MEMBERSHIP_BASE_PORT ?? "43310");
const endpoints = Object.fromEntries(
  peerIds.map((peerId, index) => [
    peerId,
    `http://127.0.0.1:${basePort + index}`,
  ]),
);
const schema = `membership_demo_${randomBytes(8).toString("hex")}`;
const channelToken = randomBytes(32).toString("base64url");
const pool = new Pool(databaseOptions());
const children = new Map();
const allChildren = [];
const childFile = fileURLToPath(new URL("./peer.mjs", import.meta.url));
const now = Date.now();
const time = (offsetMs) => new Date(now + offsetMs).toISOString();

try {
  await runMigrations(pool, { schema, createSchema: true });
  const keyPairs = new Map();
  const members = new Map();
  for (const peerId of peerIds) {
    const pair = await crypto.subtle.generateKey(
      MESH_SIGNATURE_ALGORITHM,
      true,
      ["sign", "verify"],
    );
    keyPairs.set(`${peerId}.v1`, pair);
    const key = await keyDefinition(
      `key.${peerId}.v1`,
      pair.publicKey,
      time(-86_400_000),
      time(86_400_000),
    );
    members.set(peerId, {
      peerId,
      instanceId: `instance.${peerId}`,
      activeKeyId: key.keyId,
      keys: [key],
    });
  }
  const initial = await createCollectiveMembershipConfigurationV1({
    tenantId: "tenant.membership.demo",
    meshId: "mesh.membership.demo",
    policyDomainId: "policy.membership.demo",
    epoch: 1,
    previousConfigurationDigest: null,
    effectiveAt: time(-3_600_000),
    effectiveAtLogicalMs: 0,
    members: peerIds.slice(0, 4).map((peerId) => members.get(peerId)),
  });

  const spawn = async (peerId, keyVersion = "v1") => {
    const pair = keyPairs.get(`${peerId}.${keyVersion}`);
    const child = fork(childFile, [], {
      env: {
        ...process.env,
        PEER_ID: peerId,
        PEER_PORT: String(basePort + peerIds.indexOf(peerId)),
        PEER_ENDPOINTS: JSON.stringify(endpoints),
        MEMBERSHIP_SCHEMA: schema,
        CHANNEL_TOKEN: channelToken,
        INITIAL_CONFIGURATION: JSON.stringify(initial),
        PRIVATE_KEY_JWK: JSON.stringify(
          await crypto.subtle.exportKey("jwk", pair.privateKey),
        ),
        SIGNING_KEY_ID: `key.${peerId}.${keyVersion}`,
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    children.set(peerId, child);
    allChildren.push(child);
    return waitFor(child, (message) => message?.kind === "ready", 15_000);
  };
  await Promise.all(peerIds.map((peerId) => spawn(peerId)));

  const joined = await createCollectiveMembershipConfigurationV1({
    ...nextSeed(initial, 2, time(-3_500_000), 200),
    members: [...initial.members, members.get("peer.5")],
  });
  const joinStatement = await collectiveMembershipJoinStatementDigestV1(
    initial,
    joined,
    "peer.5",
    "key.peer.5.v1",
  );
  const join = await createCollectiveMembershipTransitionProposalV1({
    current: initial,
    next: joined,
    change: {
      kind: "join",
      peerId: "peer.5",
      activeKeyProof: await createCollectiveMembershipKeyProofV1({
        statementDigest: joinStatement,
        keyId: "key.peer.5.v1",
        privateKey: keyPairs.get("peer.5.v1").privateKey,
      }),
    },
    proposedAtLogicalMs: 100,
    expiresAtLogicalMs: 190,
  });
  assert.ok(await transition("peer.1", join));

  await setClock(220);
  const replacement = await crypto.subtle.generateKey(
    MESH_SIGNATURE_ALGORITHM,
    true,
    ["sign", "verify"],
  );
  keyPairs.set("peer.2.v2", replacement);
  const replacementKey = await keyDefinition(
    "key.peer.2.v2",
    replacement.publicKey,
    time(-3_400_000),
    time(86_400_000),
  );
  const overlapUntil = time(3_600_000);
  const peerTwo = joined.members.find(({ peerId }) => peerId === "peer.2");
  const rotatedPeerTwo = {
    ...peerTwo,
    activeKeyId: replacementKey.keyId,
    keys: [
      ...peerTwo.keys.map((key) => ({ ...key, validUntil: overlapUntil })),
      replacementKey,
    ],
  };
  const rotated = await createCollectiveMembershipConfigurationV1({
    ...nextSeed(joined, 3, time(-3_400_000), 300),
    members: joined.members.map((member) =>
      member.peerId === "peer.2" ? rotatedPeerTwo : member,
    ),
  });
  const rotationStatement = await collectiveMembershipRotationStatementDigestV1(
    joined,
    rotated,
    {
      peerId: "peer.2",
      retiringKeyId: "key.peer.2.v1",
      activeKeyId: "key.peer.2.v2",
      overlapUntil,
    },
  );
  const rotation = await createCollectiveMembershipTransitionProposalV1({
    current: joined,
    next: rotated,
    change: {
      kind: "rotate_key",
      peerId: "peer.2",
      retiringKeyId: "key.peer.2.v1",
      activeKeyId: "key.peer.2.v2",
      overlapUntil,
      retiringKeyProof: await createCollectiveMembershipKeyProofV1({
        statementDigest: rotationStatement,
        keyId: "key.peer.2.v1",
        privateKey: keyPairs.get("peer.2.v1").privateKey,
      }),
      activeKeyProof: await createCollectiveMembershipKeyProofV1({
        statementDigest: rotationStatement,
        keyId: "key.peer.2.v2",
        privateKey: replacement.privateKey,
      }),
    },
    proposedAtLogicalMs: 220,
    expiresAtLogicalMs: 290,
  });
  assert.ok(await transition("peer.1", rotation));

  await stop("peer.2", "SIGTERM");
  const restarted = await spawn("peer.2", "v2");
  assert.equal(restarted.epoch, 3);
  await setClock(320);
  const left = await createCollectiveMembershipConfigurationV1({
    ...nextSeed(rotated, 4, time(-3_300_000), 400),
    members: rotated.members.filter(({ peerId }) => peerId !== "peer.5"),
  });
  const leave = await createCollectiveMembershipTransitionProposalV1({
    current: rotated,
    next: left,
    change: { kind: "leave", peerId: "peer.5" },
    proposedAtLogicalMs: 320,
    expiresAtLogicalMs: 390,
  });
  assert.ok(await transition("peer.1", leave));

  const inspection = await command(
    "peer.1",
    {
      kind: "inspect",
      logicalTimes: [150, 250, 350, 450],
    },
    "inspection",
  );
  assert.equal(inspection.currentEpoch, 4);
  assert.deepEqual(
    inspection.bindings.map(({ epoch }) => epoch),
    [1, 2, 3, 4],
  );

  await setClock(420);
  const rejoined = await createCollectiveMembershipConfigurationV1({
    ...nextSeed(left, 5, time(-3_200_000), 500),
    members: [...left.members, members.get("peer.5")],
  });
  const rejoinStatement = await collectiveMembershipJoinStatementDigestV1(
    left,
    rejoined,
    "peer.5",
    "key.peer.5.v1",
  );
  const rejoin = await createCollectiveMembershipTransitionProposalV1({
    current: left,
    next: rejoined,
    change: {
      kind: "join",
      peerId: "peer.5",
      activeKeyProof: await createCollectiveMembershipKeyProofV1({
        statementDigest: rejoinStatement,
        keyId: "key.peer.5.v1",
        privateKey: keyPairs.get("peer.5.v1").privateKey,
      }),
    },
    proposedAtLogicalMs: 420,
    expiresAtLogicalMs: 490,
  });
  await Promise.all([stop("peer.3", "SIGTERM"), stop("peer.4", "SIGTERM")]);
  const minority = await transition("peer.1", rejoin);
  assert.equal(minority, null);

  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        scenario: "dynamic_membership_key_rotation",
        distinctPeerCount: 5,
        processCount: 6,
        joinedEpoch: 2,
        rotatedEpoch: 3,
        replacementKeyRestarted: true,
        leftEpoch: 4,
        historicalBindingEpochs: inspection.bindings.map(({ epoch }) => epoch),
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

async function transition(peerId, proposal) {
  const message = await command(
    peerId,
    { kind: "transition", proposal },
    "transition",
  );
  return message.certificate;
}

async function setClock(logicalTimeMs) {
  await Promise.all(
    [...children.keys()].map((peerId) =>
      command(peerId, { kind: "set_clock", logicalTimeMs }, "clock_set"),
    ),
  );
}

async function command(peerId, message, expectedKind) {
  const child = children.get(peerId);
  if (!child?.connected) throw new Error(`${peerId} is not running`);
  const requestId = randomBytes(8).toString("hex");
  const response = waitFor(
    child,
    (candidate) =>
      candidate?.requestId === requestId &&
      (candidate.kind === expectedKind || candidate.kind === "command_error"),
    15_000,
  );
  child.send({ ...message, requestId });
  const result = await response;
  if (result.kind === "command_error") throw new Error(result.error);
  return result;
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

async function keyDefinition(keyId, publicKey, validFrom, validUntil) {
  return {
    keyId,
    algorithm: MESH_SIGNATURE_ALGORITHM,
    publicKey: await exportCollectiveMembershipPublicKeyV1(publicKey),
    validFrom,
    validUntil,
  };
}

function nextSeed(current, epoch, effectiveAt, effectiveAtLogicalMs) {
  return {
    tenantId: current.tenantId,
    meshId: current.meshId,
    policyDomainId: current.policyDomainId,
    epoch,
    previousConfigurationDigest: current.configurationDigest,
    effectiveAt,
    effectiveAtLogicalMs,
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
