import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createPostgresPool, runMigrations } from "@agentplat/mesh-postgres";
import {
  createMorphogenesisBudgetEnvelopeV1,
  createMorphogenesisCatalogLifecycleProcessDefinitionV1,
  createMorphogenesisDecisionCandidateV1,
  createMorphogenesisDecisionAuthorizationV1,
  createCompositeMorphogenesisDecisionAuthorizationV1,
  createMorphogenesisPolicyV1,
} from "@agentplat/collective-runtime/morphogenesis";
import { CollectiveAgreementMorphogenesisDecisionIssuerV1 } from "@agentplat/collective-quorum/morphogenesis";

const exampleStartedAt = performance.now();

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
const peerIds = Object.freeze(["peer-a", "peer-b", "peer-c", "peer-d"]);
const ports = {
  "peer-a": positivePort(process.env.PEER_A_PORT ?? "43101"),
  "peer-b": positivePort(process.env.PEER_B_PORT ?? "43102"),
  "peer-c": positivePort(process.env.PEER_C_PORT ?? "43103"),
  "peer-d": positivePort(process.env.PEER_D_PORT ?? "43104"),
};
const targetWireVersions = Object.freeze({
  "peer-a": Object.freeze({ "peer-b": 0, "peer-c": 1, "peer-d": 1 }),
  "peer-b": Object.freeze({ "peer-a": 0, "peer-c": 0, "peer-d": 1 }),
  "peer-c": Object.freeze({ "peer-a": 1, "peer-b": 0, "peer-d": 0 }),
  "peer-d": Object.freeze({ "peer-a": 1, "peer-b": 1, "peer-c": 0 }),
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
const morphogenesisProjectionDigest = `sha256:${createHash("sha256")
  .update("agentplat-morphogenesis-beta1-need-projection")
  .digest("hex")}`;
const morphogenesisProjectionHex = morphogenesisProjectionDigest.slice(
  "sha256:".length,
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
    spawnPeer("peer-d"),
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

  const claim = await sendEvidence("peer-a", "peer-b", {
    type: "evidence.claim",
    claimId: `claim:${morphogenesisProjectionHex}`,
    subject: { kind: "peer", peerId: "peer-a" },
    scope: { kind: "mesh" },
    criterionId: "morphogenesis.need.available",
    outcome: "satisfied",
    assertionDigest: morphogenesisProjectionHex,
    content: {
      kind: "reference",
      mediaType: "application_json",
      reference: {
        schemaVersion: 1,
        kind: "external",
        referenceType: "morphogenesis_need",
        referenceId: "morphogenesis-need-beta1",
        referenceDigest: morphogenesisProjectionHex,
      },
      contentDigest: morphogenesisProjectionHex,
      encodedBytes: 32,
    },
    basisReferences: [],
    observedAt: null,
  });
  const attestations = [
    await sendEvidence("peer-b", "peer-a", {
      type: "evidence.attest",
      attestationId: `attestation:${morphogenesisProjectionHex}`,
      scope: { kind: "mesh" },
      claimId: claim.recordId,
      claimDigest: claim.recordDigest,
      disposition: "support",
      confidenceBasisPoints: 10_000,
      basisReferences: [],
      observedAt: null,
    }, claim.messageId),
    await sendEvidence("peer-c", "peer-a", {
      type: "evidence.attest",
      attestationId: `attestation:${morphogenesisProjectionHex}`,
      scope: { kind: "mesh" },
      claimId: claim.recordId,
      claimDigest: claim.recordDigest,
      disposition: "support",
      confidenceBasisPoints: 10_000,
      basisReferences: [],
      observedAt: null,
    }, claim.messageId),
    await sendEvidence("peer-d", "peer-a", {
      type: "evidence.attest",
      attestationId: `attestation:${morphogenesisProjectionHex}`,
      scope: { kind: "mesh" },
      claimId: claim.recordId,
      claimDigest: claim.recordDigest,
      disposition: "support",
      confidenceBasisPoints: 10_000,
      basisReferences: [],
      observedAt: null,
    }, claim.messageId),
  ];
  await sendPing("peer-a", "peer-d");

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
  const morphogenesisClaim = states["peer-b"].state.received.find(
    ({ recordId }) => recordId === claim.recordId,
  );
  assert.equal(morphogenesisClaim.contentDigest, morphogenesisProjectionHex);
  assert.equal(morphogenesisClaim.assertionDigest.length, 64);
  const morphogenesisVotes = states["peer-a"].state.received.filter(
    ({ claimId, disposition }) =>
      claimId === claim.recordId && disposition === "support",
  );
  assert.equal(morphogenesisVotes.length, 3);
  assert.equal(new Set(morphogenesisVotes.map(({ senderPeerId }) => senderPeerId)).size, 3);
  const collectiveDecision = await verifyMorphogenesisCollectiveDecision(
    morphogenesisVotes,
  );
  assert.equal(collectiveDecision.authorization.route, "collective");
  assert.equal(collectiveDecision.minorityPartitionAuthorization, null);
  assert.equal(collectiveDecision.dependentCollusionRejected, true);
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

  const evidenceRecord = {
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
      morphogenesisProjectionTransported: true,
      morphogenesisProjectionDigest,
      morphogenesisClaimDigest: claim.payloadHash,
      morphogenesisIndependentSupportCount: attestations.length,
      morphogenesisAuthorityGrantedByTransport: false,
      morphogenesisQuorumThreshold: collectiveDecision.quorumThreshold,
      morphogenesisCollectiveAuthorizationDigest:
        collectiveDecision.authorization.authorizationDigest,
      morphogenesisMinorityPartitionFailedClosed:
        collectiveDecision.minorityPartitionAuthorization === null,
      morphogenesisDependentCollusionRejected:
        collectiveDecision.dependentCollusionRejected,
      wallTimeMs: Math.max(0, Math.round(performance.now() - exampleStartedAt)),
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      morphologyChurnCount: 0,
      missionContinuityRatio: 1,
      duplicateMaterialEffectCount: 0,
      privateKeysPersisted: false,
      cleanup: "pending-finally",
    };
  const evidenceOutput = process.env.AGENTPLAT_MORPHOGENESIS_EVIDENCE_OUTPUT;
  if (evidenceOutput) {
    const outputDirectory = path.resolve(evidenceOutput);
    const repositoryRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../..",
    );
    const relative = path.relative(repositoryRoot, outputDirectory);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)))
      throw new TypeError("Morphogenesis Mesh evidence output must be external");
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(
      path.join(outputDirectory, "mesh-quorum-receipt.json"),
      `${JSON.stringify(evidenceRecord, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
  }
  console.log(JSON.stringify(evidenceRecord));

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

  async function sendEvidence(sender, receiver, payload, causationId) {
    const senderProcess = live.get(sender);
    const receiverProcess = live.get(receiver);
    const applied = waitFor(receiverProcess, "evidence_applied", 15_000);
    const sent = waitFor(senderProcess, "evidence_sent", 10_000);
    senderProcess.send({
      kind: "evidence",
      peerId: receiver,
      payload,
      causationId,
      attempts: 2,
    });
    duplicateAttempts += 1;
    const [sentRecord, appliedRecord] = await Promise.all([sent, applied]);
    assert.equal(appliedRecord.recordId, sentRecord.recordId);
    return sentRecord;
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

async function verifyMorphogenesisCollectiveDecision(votes) {
  const sha = (character) => `sha256:${character.repeat(64)}`;
  const policy = createMorphogenesisPolicyV1({
    schemaVersion: 1,
    policyId: "policy:morphogenesis-mesh-beta1",
    policyVersion: 1,
    parentPolicyDigest: null,
    requiredSourceClasses: ["mission"],
    allowedOperators: ["recruit_existing"],
    allowedDecisionRoutes: ["collective"],
    requireIndependentDecider: true,
    allowAgentCreation: false,
    maximumPopulation: 8,
    maximumNewAgentsPerProposal: 0,
    maximumResourceUnitsPerProposal: 100,
    minimumNeedSeverityBps: 1,
    limits: {
      maximumSourceHeads: 8,
      maximumComponents: 32,
      maximumPositions: 8,
      maximumAgentDispositions: 8,
      maximumOperations: 16,
      maximumDependenciesPerOperation: 8,
      maximumEvidenceDigests: 8,
      maximumInvariantDigests: 8,
      maximumProposalTtlMs: 10_000,
      maximumNeedTtlMs: 10_000,
      maximumSourceFreshnessMs: 10_000,
      maximumCommitAttempts: 4,
      maximumTransformationsPerWindow: 4,
      transformationWindowMs: 60_000,
      cooldownMs: 0,
      hysteresisBps: 0,
    },
  });
  const definition = createMorphogenesisCatalogLifecycleProcessDefinitionV1();
  const budget = createMorphogenesisBudgetEnvelopeV1({
    maximumActiveAgents: 3,
    maximumNewAgents: 0,
    maximumConcurrentProvisioning: 0,
    maximumResourceUnits: 10,
    maximumInteractionUnits: 100,
    maximumActionUnits: 10,
    maximumInputTokens: 0,
    maximumOutputTokens: 0,
    maximumTotalTokens: 0,
    maximumDurationMs: 10_000,
    maximumCosts: [{ currency: "USD", micros: 0 }],
  });
  const proposal = {
    schemaVersion: 1,
    proposalId: "proposal:mesh-beta1",
    scopeDigest: sha("1"),
    currentSnapshotDigest: sha("2"),
    expectedCurrentEpoch: 1,
    needDigest: sha("3"),
    targetDigest: sha("4"),
    operations: [{
      schemaVersion: 1,
      operationId: "operation:recruit-existing",
      operator: "recruit_existing",
      effectClass: "internal",
      dependsOnOperationIds: [],
      targetReferenceDigest: sha("5"),
      compensation: "none",
      operationDigest: sha("6"),
    }],
    processDefinitionDigest: definition.definitionDigest,
    budget,
    decisionRoute: "collective",
    proposerId: "agent:planner",
    proposerVersion: 1,
    proposerImplementationDigest: sha("7"),
    proposedAtLogicalMs: 100,
    expiresAtLogicalMs: 1_000,
    proposalDigest: sha("8"),
    advisoryOnly: true,
  };
  const membershipConfigurationDigest = sha("9");
  const candidate = createMorphogenesisDecisionCandidateV1({
    candidateId: "decision-candidate:mesh-beta1",
    proposal,
    policy,
    membershipConfigurationDigest,
    membershipEpoch: 1,
    authorityId: "authority:mesh-beta1",
    authorityEpoch: 1,
    workContractDigest: sha("a"),
    preparedAtLogicalMs: 110,
    expiresAtLogicalMs: 900,
  });
  const certificate = {
    schemaVersion: 1,
    kind: "commit_certificate",
    certificateId: "agreement-certificate:morphogenesis-mesh-beta1",
    coordinate: {
      policyDomainId: "policy-domain:mesh-beta1",
      slotId: "slot:morphogenesis-mesh-beta1",
      height: 1,
      round: 0,
      membershipEpoch: 1,
      membershipConfigurationDigest,
    },
    proposalId: "agreement-proposal:morphogenesis-mesh-beta1",
    value: {
      schemaVersion: 1,
      kind: "application",
      valueId: `morphogenesis:${candidate.candidateId}`,
      previousCommitDigest: null,
      payload: {
        candidateDigest: candidate.candidateDigest,
        actorMandateDigest: sha("b"),
        independenceGroupId: "independence:mesh-quorum",
        disposition: "approved",
        expiresAtLogicalMs: 800,
      },
      valueDigest: sha("c"),
    },
    prevoteCertificate: {},
    precommitCertificate: {},
    committedAtLogicalMs: 120,
    certificateDigest: sha("d"),
  };
  const quorumThreshold = 3;
  const uniqueSupporters = (records) =>
    new Set(
      records
        .filter(({ disposition }) => disposition === "support")
        .map(({ senderPeerId }) => senderPeerId),
    ).size;
  const issuer = (records) =>
    new CollectiveAgreementMorphogenesisDecisionIssuerV1({
      async resolve() {
        return uniqueSupporters(records) >= quorumThreshold ? certificate : null;
      },
      async verify({ certificate: retained }) {
        return (
          retained.certificateDigest === certificate.certificateDigest &&
          uniqueSupporters(records) >= quorumThreshold
        );
      },
    });
  const authorization = await issuer(votes).issue({
    candidate,
    logicalTimeMs: 125,
  });
  assert.ok(authorization);
  const minorityPartitionAuthorization = await issuer(votes.slice(0, 1)).issue({
    candidate,
    logicalTimeMs: 125,
  });
  const compositePolicy = createMorphogenesisPolicyV1({
    ...policy.policy,
    allowedDecisionRoutes: ["composite"],
  });
  const compositeProposal = {
    ...proposal,
    proposalId: "proposal:mesh-beta1-dependent-collusion",
    decisionRoute: "composite",
    proposalDigest: sha("e"),
  };
  const compositeCandidate = createMorphogenesisDecisionCandidateV1({
    candidateId: "decision-candidate:mesh-beta1-dependent-collusion",
    proposal: compositeProposal,
    policy: compositePolicy,
    membershipConfigurationDigest,
    membershipEpoch: 1,
    authorityId: "authority:mesh-beta1",
    authorityEpoch: 1,
    workContractDigest: sha("f"),
    preparedAtLogicalMs: 110,
    expiresAtLogicalMs: 900,
  });
  const component = (route, actorType, actorId, character) =>
    createMorphogenesisDecisionAuthorizationV1({
      authorizationId: `authorization:${actorId}`,
      candidateDigest: compositeCandidate.candidateDigest,
      route,
      actorType,
      actorId,
      actorMandateDigest: sha(character),
      independenceGroupId: "independence:colluding-operator",
      disposition: "approved",
      proofDigest: sha(character),
      issuedAtLogicalMs: 120,
      expiresAtLogicalMs: 800,
    });
  assert.throws(
    () =>
      createCompositeMorphogenesisDecisionAuthorizationV1({
        candidate: compositeCandidate,
        components: [
          component("authorized_agent", "agent", "peer-b", "1"),
          component("authorized_person", "person", "peer-c", "2"),
        ],
        minimumIndependentApprovals: 2,
        issuedAtLogicalMs: 125,
        expiresAtLogicalMs: 700,
      }),
    /duplicated or dependent/,
  );
  return {
    authorization,
    minorityPartitionAuthorization,
    quorumThreshold,
    dependentCollusionRejected: true,
  };
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
