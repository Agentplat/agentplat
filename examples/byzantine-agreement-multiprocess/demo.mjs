import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { createCollectiveAgreementMembershipV1 } from "@agentplat/collective-quorum/agreement";
import { runMigrations } from "@agentplat/collective-quorum-postgres/agreement";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error("DATABASE_URL is required for the multiprocess example");

const peerIds = ["p0", "p1", "p2", "p3", "p4", "p5", "p6"];
const schema = `agreement_demo_${randomUUID().replaceAll("-", "")}`;
const peerFile = fileURLToPath(new URL("./peer.mjs", import.meta.url));
const pool = new Pool({ connectionString: databaseUrl });
const processes = new Map();

try {
  await runMigrations(pool, { schema, createSchema: true });
  const identities = [];
  for (const peerId of peerIds) {
    const child = spawn(peerId);
    processes.set(peerId, child);
    await waitFor(child, "awaiting_bootstrap");
    child.send({ type: "bootstrap" });
    identities.push(await waitFor(child, "booted"));
  }
  const membership = await createCollectiveAgreementMembershipV1({
    epoch: 1,
    faultThreshold: 2,
    validators: identities.map((identity) => ({
      peerId: identity.peerId,
      instanceId: `instance.${identity.peerId}`,
      keyId: `key.${identity.peerId}`,
    })),
  });
  const endpoints = Object.fromEntries(
    identities.map((identity) => [identity.peerId, identity.endpoint]),
  );
  for (const identity of identities) {
    const child = processes.get(identity.peerId);
    child.send({
      type: "configure",
      databaseUrl,
      schema,
      membership,
      endpoints,
      identities,
      behavior: ["p5", "p6"].includes(identity.peerId)
        ? "unavailable"
        : "honest",
    });
    await waitFor(child, "configured");
  }

  const proposer = processes.get("p0");
  proposer.send({
    type: "decide",
    membership,
    value: {
      kind: "planning_slot_head",
      valueId: "planning.value.demo",
      payload: {
        semanticSlotKey: "planning.slot.demo",
        selectedProposalDigest: `sha256:${"a".repeat(64)}`,
      },
    },
  });
  const decided = await waitFor(proposer, "decided", 20_000);
  assert.ok(decided.certificate);
  assert.equal(decided.certificate.precommitCertificate.votes.length, 5);

  const firstIdentity = identities.find((identity) => identity.peerId === "p0");
  proposer.send({ type: "shutdown" });
  await exited(proposer);
  processes.delete("p0");

  const restarted = spawn("p0");
  processes.set("p0", restarted);
  await waitFor(restarted, "awaiting_bootstrap");
  restarted.send({
    type: "bootstrap",
    privateJwk: firstIdentity.privateJwk,
    publicJwk: firstIdentity.publicJwk,
  });
  const restartedIdentity = await waitFor(restarted, "booted");
  restarted.send({
    type: "configure",
    databaseUrl,
    schema,
    membership,
    endpoints: { ...endpoints, p0: restartedIdentity.endpoint },
    identities,
    behavior: "honest",
  });
  await waitFor(restarted, "configured");
  restarted.send({ type: "inspect" });
  const inspected = await waitFor(restarted, "inspected");
  assert.equal(inspected.commitDigest, decided.certificate.certificateDigest);
  assert.equal(inspected.state.lockedRound, 0);
  assert.equal(
    inspected.state.lockedValueDigest,
    decided.certificate.value.valueDigest,
  );

  console.log(
    JSON.stringify({
      status: "passed",
      profile: "seven_process_byzantine_resilient_agreement",
      validators: 7,
      unavailableValidators: 2,
      quorumSignatures: decided.certificate.precommitCertificate.votes.length,
      proposerRestartRecovered: true,
      certificateDigest: decided.certificate.certificateDigest,
    }),
  );
} finally {
  for (const child of processes.values()) {
    if (child.connected) child.send({ type: "shutdown" });
    setTimeout(() => child.kill("SIGTERM"), 1_000).unref();
  }
  await pool
    .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    .catch(() => undefined);
  await pool.end();
}

function spawn(peerId) {
  return fork(peerFile, [peerId], {
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
}

function waitFor(child, type, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting for ${type}`));
    }, timeoutMs);
    const onMessage = (message) => {
      if (message.type === "failed") {
        cleanup();
        reject(new Error(`${message.peerId}: ${message.error}`));
      } else if (message.type === type) {
        cleanup();
        resolve(message);
      }
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`peer exited before ${type}: ${code}`));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      child.off("message", onMessage);
      child.off("exit", onExit);
    };
    child.on("message", onMessage);
    child.on("exit", onExit);
  });
}

function exited(child) {
  return new Promise((resolve) => child.once("exit", resolve));
}
