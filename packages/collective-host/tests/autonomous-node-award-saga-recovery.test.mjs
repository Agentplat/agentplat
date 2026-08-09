import assert from "node:assert/strict";
import test from "node:test";

import { collectiveQuorumDigestV1 } from "../../collective-quorum/dist/index.js";
import {
  allocateStrategicallyV1,
  createStrategicAllocationPolicyV1,
  createStrategicBidCommitmentV1,
  createStrategicBidRevealV1,
  strategicSealedBidDigestV1,
} from "../../collective-runtime/dist/strategic-allocation.js";
import {
  AutonomousCollectiveAdaptationAuthorityAdapterV1,
  AutonomousCollectiveExecutionAuthorityAdapterV1,
  AutonomousCollectiveNodeRuntimeV1,
  InMemoryAutonomousCollectiveNodeStoreV1,
} from "../dist/autonomous-collective-node.js";
import {
  DistributedCollectiveProtocolRuntimeV1,
  InMemoryDistributedCollectiveArtifactStoreV1,
  InMemoryDistributedCollectiveProtocolStoreV1,
} from "../dist/distributed-collective-protocol.js";
import { DistributedPlanningRuntimeV1 } from "../dist/distributed-planning-runtime.js";
import { createDistributedDecompositionPolicyV1 } from "../../collective-planning/dist/distributed-decomposition.js";

const digest = (character) => `sha256:${character.repeat(64)}`;
const overlayDigest = (character) => `sha256:${character.repeat(43)}`;
const phases = [
  "reserved",
  "materialized",
  "assurance_started",
  "assurance_completed",
  "settle_enqueued",
  "settled",
  "signal_enqueued",
  "signal_published",
  "completed",
];

for (const fault of [
  "after_materialization",
  "after_assurance_effect",
  "after_settlement",
  "after_signal_publish",
  "after_state_commit_before_ack",
]) {
  test(`award saga recovers exactly after ${fault}`, async () => {
    const fixture = await awardSagaFixture({ fault });
    await assert.rejects(
      fixture.first.advance({ logicalTimeMs: 10 }),
      /simulated award saga crash/u,
    );

    const recovered = fixture.reconstruct();
    const completed = await recovered.advance({ logicalTimeMs: 20 });
    assert.equal(completed.status, "completed");
    assert.equal(completed.awardOperations[0].phase, "completed");
    assert.equal(completed.awardOperations[0].semanticSequence, 1);
    assert.equal(completed.semanticSequenceHighWater, 1);
    assert.equal(fixture.prepareCalls(), 1);
    assert.equal(fixture.executionEffects(), 1);

    const protocol = fixture.protocol();
    const messages = await protocol.messages();
    assert.equal(
      messages.filter(({ kind }) => kind === "allocation.settlement").length,
      1,
    );
    assert.equal(
      messages.filter(({ kind }) => kind === "mission.signal").length,
      1,
    );
    assert.deepEqual(
      fixture.persistedPhases(),
      [...fixture.persistedPhases()].sort(
        (left, right) => phases.indexOf(left) - phases.indexOf(right),
      ),
    );
  });
}

test("rehydration ignores actor email but rejects changed actor authority", async () => {
  const emailOnly = await awardSagaFixture({ fault: "after_materialization" });
  await assert.rejects(
    emailOnly.first.advance({ logicalTimeMs: 10 }),
    /simulated award saga crash/u,
  );
  assert.equal(
    (await emailOnly.reconstruct().advance({ logicalTimeMs: 20 })).status,
    "completed",
  );
  const persisted = await emailOnly.nodeStore.load("node:award-saga");
  assert.equal(
    JSON.stringify(persisted.awardOperations[0].cognitiveContextBinding).includes(
      "operator@example.test",
    ),
    false,
  );

  const authorityChanged = await awardSagaFixture({
    fault: "after_materialization",
    changeActorAuthorityOnRehydrate: true,
  });
  await assert.rejects(
    authorityChanged.first.advance({ logicalTimeMs: 10 }),
    /simulated award saga crash/u,
  );
  await assert.rejects(
    authorityChanged.reconstruct().advance({ logicalTimeMs: 20 }),
    /changed its durable binding/u,
  );
  assert.equal(authorityChanged.executionEffects(), 0);
});

async function awardSagaFixture(options) {
  const scopeDigest = digest("1");
  const membershipDigest = digest("2");
  const allocationPolicy = createStrategicAllocationPolicyV1({
    schemaVersion: 1,
    policyId: "policy:award-saga",
    policyVersion: 1,
    maximumTasksPerPeer: 4,
    maximumTasksPerIndependenceGroup: 4,
    maximumTotalBudgetUnits: 100,
    maximumTotalResourceUnits: 100,
    maximumCollusionPressureBasisPoints: 10_000,
    maximumCredibilityUncertaintyBasisPoints: 10_000,
    minimumCapabilityConfidenceBasisPoints: 0,
    utilityWeightBasisPoints: 10_000,
    costWeightBasisPoints: 0,
    credibilityWeightBasisPoints: 0,
    capabilityWeightBasisPoints: 0,
    collusionPenaltyWeightBasisPoints: 0,
    falseCommitmentPenaltyBasisPoints: 0,
  });
  const decompositionPolicy = createDistributedDecompositionPolicyV1({
    schemaVersion: 1,
    policyId: "decomposition:award-saga",
    policyVersion: 1,
    maximumTasks: 4,
    maximumDepth: 2,
    maximumDependenciesPerTask: 2,
    maximumBudgetUnits: 100,
    minimumProposalConfidenceBasisPoints: 0,
    templates: [],
  });
  const task = {
    schemaVersion: 1,
    taskId: "task:award-saga",
    semanticSlotKey: "outcome:0/step:execute",
    outcomeIndex: 0,
    stepKey: "execute",
    roleKey: "operator",
    requiredCapabilityKeys: ["execute"],
    dependencyTaskDigests: [],
    budgetUnits: 10,
    confidenceBasisPoints: 9_000,
    proposerPeerId: "peer:local",
    proposerInstanceId: "instance:local",
    basisObservationDigests: [],
    predecessorTaskDigest: null,
    taskDigest: digest("3"),
  };
  const strategicTask = {
    taskId: task.taskId,
    taskDigest: task.taskDigest,
    requiredCapabilityKeys: task.requiredCapabilityKeys,
    requiredIndependenceGroupId: null,
    budgetCeilingUnits: 10,
    collateralFloorUnits: 0,
    dependsOnTaskIds: [],
  };
  const attestation = {
    attestationId: "attestation:local",
    peerId: "peer:local",
    capabilityKeys: ["execute"],
    capabilityConfidenceBasisPoints: 9_000,
    resourceCeilingUnits: 10,
    issuerId: "issuer:local",
    issuerKeyDigest: digest("4"),
    validFromLogicalMs: 0,
    validUntilLogicalMs: 100,
    attestationDigest: digest("5"),
  };
  const revealBody = {
    allocationId: "allocation:award-saga",
    taskId: task.taskId,
    peerId: "peer:local",
    peerInstanceId: "instance:local",
    independenceGroupId: "group:local",
    declaredUtilityMicros: 10_000,
    declaredCostUnits: 1,
    declaredResourceUnits: 1,
    requestedBudgetUnits: 1,
    collateralUnits: 1,
    availabilityUntilLogicalMs: 100,
    capabilityAttestationDigest: attestation.attestationDigest,
    nonceDigest: digest("6"),
  };
  const commitment = createStrategicBidCommitmentV1({
    commitmentId: "commitment:local",
    ...revealBody,
    sealedBidDigest: strategicSealedBidDigestV1(revealBody),
    committedAtLogicalMs: 1,
  });
  const reveal = createStrategicBidRevealV1({
    revealId: "reveal:local",
    commitmentId: commitment.commitmentId,
    ...revealBody,
    revealedAtLogicalMs: 2,
  });
  const plan = await allocateStrategicallyV1({
    allocationId: "allocation:award-saga",
    scopeDigest,
    tasks: [strategicTask],
    candidates: [
      {
        commitment,
        reveal,
        attestation,
        peer: {
          peerId: "peer:local",
          scopeDigest,
          credibilityStateDigest: digest("7"),
          credibilityScoreBasisPoints: 9_000,
          credibilityUncertaintyBasisPoints: 0,
          collusionPressureBasisPoints: 0,
          status: "eligible",
        },
      },
    ],
    policy: allocationPolicy,
    evidence: {
      async verifyCapabilityAttestation() {
        return true;
      },
      async verifyPeerProjection() {
        return true;
      },
    },
    logicalTimeMs: 5,
  });
  assert.equal(plan.awards.length, 1);

  const nodeStore = new InMemoryAutonomousCollectiveNodeStoreV1();
  const protocolStoreBase = new InMemoryDistributedCollectiveProtocolStoreV1();
  const artifacts = new InMemoryDistributedCollectiveArtifactStoreV1();
  let failAck = options.fault === "after_state_commit_before_ack";
  const protocolStore = {
    load: (protocolId) => protocolStoreBase.load(protocolId),
    async save(next, expectedRevision) {
      const current = await protocolStoreBase.load(next.protocolId);
      const introducesAck = next.outbox.some(
        (item) =>
          item.commandAcknowledged === true &&
          !current?.outbox.some(
            (prior) =>
              prior.reference.messageDigest === item.reference.messageDigest &&
              prior.commandAcknowledged === true,
          ),
      );
      if (failAck && introducesAck) {
        failAck = false;
        throw new Error("simulated award saga crash after state commit before ACK");
      }
      return protocolStoreBase.save(next, expectedRevision);
    },
  };
  let injected = false;
  const persistedPhases = [];
  const faultStore = {
    load: (runtimeId) => nodeStore.load(runtimeId),
    save: (state, expectedRevision) => nodeStore.save(state, expectedRevision),
    reserveAdvance: (input) => nodeStore.reserveAdvance(input),
    assertAdvanceFence: (reservation, logicalTimeMs) =>
      nodeStore.assertAdvanceFence(reservation, logicalTimeMs),
    releaseAdvance: (reservation) => nodeStore.releaseAdvance(reservation),
    runAdvanceCommand: (input) => nodeStore.runAdvanceCommand(input),
    loadAdvanceCommandBinding: (reservation, commandId) =>
      nodeStore.loadAdvanceCommandBinding(reservation, commandId),
    async saveAdvance(state, expectedRevision, reservation, telemetry) {
      const phase = state.awardOperations?.[0]?.phase;
      const before =
        (options.fault === "after_assurance_effect" &&
          phase === "assurance_completed") ||
        (options.fault === "after_settlement" && phase === "settled") ||
        (options.fault === "after_signal_publish" &&
          phase === "signal_published");
      if (!injected && before) {
        injected = true;
        throw new Error(`simulated award saga crash ${options.fault}`);
      }
      const saved = await nodeStore.saveAdvance(
        state,
        expectedRevision,
        reservation,
        telemetry,
      );
      if (saved && phase) persistedPhases.push(phase);
      if (
        !injected &&
        options.fault === "after_materialization" &&
        phase === "materialized"
      ) {
        injected = true;
        throw new Error("simulated award saga crash after materialization");
      }
      return saved;
    },
  };
  const receipts = new Map();
  let prepareCalls = 0;
  let executionEffects = 0;
  let latestProtocol;
  const decisions = [];
  const tenant = {
    tenantId: "tenant:award-saga",
    organizationId: "organization:one",
    actor: {
      actorId: "actor:operator",
      actorType: "human",
      email: "operator@example.test",
      roles: ["operator", "auditor"],
    },
  };
  const context = (rehydrated) => ({
    tenant: {
      ...tenant,
      actor: {
        ...tenant.actor,
        email: rehydrated ? "rotated@example.test" : tenant.actor.email,
        roles:
          rehydrated && options.changeActorAuthorityOnRehydrate
            ? ["administrator"]
            : tenant.actor.roles,
      },
    },
    signal: new AbortController().signal,
  });

  function runtime() {
    const protocol = new DistributedCollectiveProtocolRuntimeV1({
      protocolId: "protocol:award-saga",
      scopeDigest,
      membershipConfigurationDigest: membershipDigest,
      localPeerId: "peer:local",
      localInstanceId: "instance:local",
      plane: {
        async publish() {
          return { update: { updateDigest: overlayDigest("A") } };
        },
      },
      artifacts,
      authenticity: {
        localKeyId: "key:local",
        async sign(messageDigest) {
          return `signed:${messageDigest}`;
        },
        async verify(input) {
          return input.signature === `signed:${input.messageDigest}`;
        },
      },
      membership: { async verifyPeer() { return true; } },
      store: protocolStore,
      crypto: globalThis.crypto,
    });
    latestProtocol = protocol;
    const planning = new DistributedPlanningRuntimeV1({
      protocol,
      decompositionPolicy,
      allocationPolicy,
      allocationEvidence: {
        async verifyCapabilityAttestation() { return true; },
        async verifyPeerProjection() { return true; },
      },
    });
    const execution = new AutonomousCollectiveExecutionAuthorityAdapterV1({
      localPeerId: "peer:local",
      async execute(input) {
        executionEffects += 1;
        const receipt = {
          schemaVersion: 1,
          executionId: input.executionId,
          awardDigest: input.awardDigest,
          status: "completed",
          receiptDigest: digest("b"),
          anytimeSemanticGuaranteeDigest: null,
          semanticHorizonDecisionDigest: null,
          semanticHorizonDecision: null,
          logicalTimeMs: input.logicalTimeMs,
        };
        receipts.set(input.executionId, receipt);
        return receipt;
      },
      async lookupReceipt(input) {
        return receipts.get(input.executionId) ?? null;
      },
    });
    const adaptation = new AutonomousCollectiveAdaptationAuthorityAdapterV1({
      protocol,
      missionId: "mission:award-saga",
      async initialize() { return { decisions }; },
      async load() { return { decisions }; },
      async publishSignal(input) {
        return protocol.publish({
          cycleId: `adaptation:${input.signal.missionId}`,
          streamId: `mission-signal:${input.signal.sourcePeerId}`,
          kind: "mission.signal",
          payload: input.signal,
          logicalTimeMs: input.signal.observedAtLogicalMs,
          lifetime: input.lifetime,
          ...(input.commandBindingDigest
            ? { commandBindingDigest: input.commandBindingDigest }
            : {}),
        });
      },
      async runCycle(input) {
        const decision = { cycleId: input.cycleId, status: "idle" };
        decisions.push(decision);
        return decision;
      },
    });
    return new AutonomousCollectiveNodeRuntimeV1({
      runtimeId: "node:award-saga",
      protocol,
      planning,
      execution,
      adaptation,
      localPlanning: {
        async availableRoleKeys() { return ["operator"]; },
        async proposeBids() { return []; },
      },
      planningFinality: {
        async certify() { return null; },
        async reconcileCertification() { return null; },
        async verify() { return true; },
      },
      taskMaterializer: {
        async prepare(input) {
          prepareCalls += 1;
          return {
            semanticSequence: input.semanticSequence,
            cognitiveRequest: {
              requestId: input.materializationId,
              tenantId: tenant.tenantId,
              operation: "plan",
              logicalTimeMs: input.logicalTimeMs,
              authorityDigest: digest("c"),
              controlPlaneDigest: input.planningFinality.certificateDigest,
            },
            cognitiveContext: context(false),
          };
        },
      },
      taskContextRehydrator: {
        async rehydrate() { return context(true); },
      },
      policy: {
        schemaVersion: 1,
        graphProposalWindowMs: 1,
        bidCommitmentWindowMs: 1,
        bidRevealWindowMs: 1,
        messageLifetimeMs: 100,
        maximumLocalBids: 1,
        maximumAdmittedEvidenceMessages: 16,
        advanceLeaseDurationMs: 1,
      },
      store: faultStore,
      crypto: globalThis.crypto,
    });
  }

  const first = runtime();
  const idle = await first.initialize(0);
  const planningDecisionDigest = digest("8");
  const body = {
    ...idle,
    status: "executing",
    revision: 1,
    logicalTimeHighWaterMs: 5,
    intent: { missionIntentId: "mission:award-saga" },
    cycle: {
      schemaVersion: 1,
      cycleId: "cycle:award-saga",
      missionIntentId: "mission:award-saga",
      intentRevision: 1,
      intentDigest: digest("9"),
      allocationId: plan.allocationId,
      graphProposalCloseAtLogicalMs: 1,
      bidCommitmentCloseAtLogicalMs: 2,
      bidRevealCloseAtLogicalMs: 3,
    },
    graph: { tasks: [task], graphDigest: digest("a") },
    plan,
    planningDecisionDigest,
    planningFinality: {
      certificateId: "certificate:award-saga",
      certificateDigest: digest("d"),
      proposalDigest: planningDecisionDigest,
    },
    previousStateDigest: idle.stateDigest,
  };
  delete body.stateDigest;
  const executing = {
    ...body,
    stateDigest: await collectiveQuorumDigestV1({
      domain: "autonomous-collective-node-state-v1",
      body,
    }),
  };
  assert.equal(await nodeStore.save(executing, 0), true);
  return {
    first,
    reconstruct: runtime,
    nodeStore,
    protocol: () => latestProtocol,
    prepareCalls: () => prepareCalls,
    executionEffects: () => executionEffects,
    persistedPhases: () => persistedPhases,
  };
}
