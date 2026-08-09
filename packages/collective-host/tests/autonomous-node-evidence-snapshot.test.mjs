import assert from "node:assert/strict";
import test from "node:test";

import { collectiveQuorumDigestV1 } from "../../collective-quorum/dist/index.js";
import {
  createMissionDecompositionRequestV1,
  createMissionIntentV1,
} from "../../collective-planning/dist/index.js";
import { createDistributedDecompositionPolicyV1 } from "../../collective-planning/dist/distributed-decomposition.js";
import { createStrategicAllocationPolicyV1 } from "../../collective-runtime/dist/strategic-allocation.js";
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

const digest = (character) => `sha256:${character.repeat(64)}`;
const overlayDigest = (character) => `sha256:${character.repeat(43)}`;

test("decomposition retry retains its exact admitted evidence snapshot", async () => {
  const fixture = await evidenceFixture();
  await fixture.installNodeState("accepted");
  fixture.armPublishCrash();
  await assert.rejects(
    fixture.node.advance({ logicalTimeMs: 10 }),
    /simulated planning publication crash/u,
  );
  const late = await fixture.publishLateEvidence(10);

  const recovered = await fixture.reconstruct().advance({ logicalTimeMs: 12 });
  assert.equal(recovered.status, "collecting_graphs");
  assert.equal(fixture.availableRoleCalls(), 1);
  assert.equal(
    recovered.localGraph.tasks.some((task) =>
      task.basisObservationDigests.includes(late.payloadDigest),
    ),
    false,
  );
});

test("local bid proposal receives the persisted merge subset, not a late head", async () => {
  const fixture = await evidenceFixture();
  const candidate = await fixture.publishCandidateGraph(5);
  await fixture.installNodeState("collecting_graphs", candidate);
  fixture.armPublishCrash();
  await assert.rejects(
    fixture.node.advance({ logicalTimeMs: 11 }),
    /simulated planning publication crash/u,
  );
  const late = await fixture.publishLateEvidence(11);

  const recovered = await fixture.reconstruct().advance({ logicalTimeMs: 13 });
  assert.equal(recovered.status, "collecting_bid_commitments");
  assert.equal(fixture.proposeBidSnapshots().length, 1);
  assert.equal(
    fixture.proposeBidSnapshots()[0].includes(late.messageDigest),
    false,
  );
  assert.equal(
    fixture.proposeBidSnapshots()[0].includes(candidate.messageDigest),
    true,
  );
});

test("standalone node rejects structural execution and adaptation authorities", async () => {
  const fixture = await evidenceFixture();
  assert.throws(
    () => fixture.construct({ execution: {
      options: { localPeerId: "peer:local" },
      async execute() {},
      async lookupReceipt() { return null; },
    } }),
    /nominal autonomous execution authority/u,
  );
  assert.throws(
    () => fixture.construct({ adaptation: {
      options: { protocol: fixture.protocol, missionId: fixture.intent.missionIntentId },
      async initialize() {},
      async load() {},
      async publishSignal() {},
      async runCycle() {},
    } }),
    /nominal autonomous adaptation authority/u,
  );
});

async function evidenceFixture() {
  const scopeDigest = digest("1");
  const membershipConfigurationDigest = digest("2");
  const intent = createMissionIntentV1({
    schemaVersion: 1,
    missionIntentId: "mission:evidence-snapshot",
    revision: 1,
    predecessorDigest: null,
    tenantId: "tenant:evidence-snapshot",
    policyDomainId: "policy-domain:evidence-snapshot",
    objective: {
      schemaVersion: 1,
      meshId: "mesh:evidence-snapshot",
      objectiveId: "objective:evidence-snapshot",
      objectiveDocumentId: "document:evidence-snapshot",
      objectiveRevision: 1,
      acceptedPolicyDigest: digest("3"),
    },
    mandateDigest: digest("4"),
    outcomeStatements: ["Inspect local evidence"],
    permittedResourceClasses: ["compute"],
    permittedCapabilityKeys: ["inspect"],
    planningLimits: {
      schemaVersion: 1,
      maximumCandidateFragments: 8,
      maximumActiveFragments: 4,
      maximumFragmentsPerPeer: 4,
      maximumRevisionsPerSemanticSlot: 4,
      maximumDependencyDepth: 4,
      maximumDependencyFanout: 4,
      maximumCapabilityTerms: 4,
      maximumOutcomeTerms: 4,
      maximumProposalBytes: 16_384,
      maximumSnapshotBytes: 131_072,
      maximumTraceBytes: 131_072,
      maximumTotalPlanningBudgetUnits: 100,
      maximumFragmentBudgetUnits: 50,
      budgetShardPolicy: "equal_mandate_subjects",
      maximumConcurrentProposals: 4,
      maximumActiveRoles: 4,
      proposalLogicalWindowMs: 100,
      observationLogicalWindowMs: 100,
      replanningLogicalWindowMs: 100,
    },
    selectionPolicyDigest: digest("5"),
    validFrom: "2026-08-01T00:00:00.000Z",
    validUntil: "2026-08-02T00:00:00.000Z",
  });
  const cycle = {
    schemaVersion: 1,
    cycleId: "cycle:evidence-snapshot",
    missionIntentId: intent.missionIntentId,
    intentRevision: intent.revision,
    intentDigest: intent.intentDigest,
    allocationId: "allocation:evidence-snapshot",
    graphProposalCloseAtLogicalMs: 11,
    bidCommitmentCloseAtLogicalMs: 21,
    bidRevealCloseAtLogicalMs: 31,
  };
  const decompositionPolicy = createDistributedDecompositionPolicyV1({
    schemaVersion: 1,
    policyId: "decomposition:evidence-snapshot",
    policyVersion: 1,
    maximumTasks: 8,
    maximumDepth: 4,
    maximumDependenciesPerTask: 4,
    maximumBudgetUnits: 100,
    minimumProposalConfidenceBasisPoints: 0,
    templates: [],
  });
  const allocationPolicy = createStrategicAllocationPolicyV1({
    schemaVersion: 1,
    policyId: "allocation:evidence-snapshot",
    policyVersion: 1,
    maximumTasksPerPeer: 8,
    maximumTasksPerIndependenceGroup: 8,
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
  const nodeStore = new InMemoryAutonomousCollectiveNodeStoreV1();
  const protocolStore = new InMemoryDistributedCollectiveProtocolStoreV1();
  const artifacts = new InMemoryDistributedCollectiveArtifactStoreV1();
  let crashNextPublish = false;
  const plane = {
    async publish() {
      if (crashNextPublish) {
        crashNextPublish = false;
        throw new Error("simulated planning publication crash");
      }
      return { update: { updateDigest: overlayDigest("A") } };
    },
  };
  const proposeBidSnapshots = [];
  let availableRoleCalls = 0;
  let latestProtocol;

  function authorities(protocol) {
    return {
      execution: new AutonomousCollectiveExecutionAuthorityAdapterV1({
        localPeerId: "peer:local",
        async execute() { throw new Error("execution is not expected"); },
        async lookupReceipt() { return null; },
      }),
      adaptation: new AutonomousCollectiveAdaptationAuthorityAdapterV1({
        protocol,
        missionId: intent.missionIntentId,
        async initialize() { return { decisions: [] }; },
        async load() { return { decisions: [] }; },
        async publishSignal() { throw new Error("signal is not expected"); },
        async runCycle(input) { return { cycleId: input.cycleId, status: "idle" }; },
      }),
    };
  }

  function runtime(overrides = {}) {
    const protocol = new DistributedCollectiveProtocolRuntimeV1({
      protocolId: "protocol:evidence-snapshot",
      scopeDigest,
      membershipConfigurationDigest,
      localPeerId: "peer:local",
      localInstanceId: "instance:local",
      plane,
      artifacts,
      authenticity: {
        localKeyId: "key:local",
        async sign(messageDigest) { return `signed:${messageDigest}`; },
        async verify(input) { return input.signature === `signed:${input.messageDigest}`; },
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
    const nominal = authorities(protocol);
    return new AutonomousCollectiveNodeRuntimeV1({
      runtimeId: "node:evidence-snapshot",
      protocol,
      planning,
      execution: overrides.execution ?? nominal.execution,
      adaptation: overrides.adaptation ?? nominal.adaptation,
      localPlanning: {
        async availableRoleKeys() {
          availableRoleCalls += 1;
          return ["role:local"];
        },
        async proposeBids(input) {
          proposeBidSnapshots.push(
            input.admittedMessages.map(({ messageDigest }) => messageDigest).sort(),
          );
          return [];
        },
      },
      planningFinality: {
        async certify() { return null; },
        async reconcileCertification() { return null; },
        async verify() { return false; },
      },
      taskMaterializer: { async prepare() { throw new Error("not expected"); } },
      policy: {
        schemaVersion: 1,
        graphProposalWindowMs: 10,
        bidCommitmentWindowMs: 10,
        bidRevealWindowMs: 10,
        messageLifetimeMs: 100,
        maximumLocalBids: 4,
        maximumAdmittedEvidenceMessages: 32,
        advanceLeaseDurationMs: 1,
      },
      store: nodeStore,
      crypto: globalThis.crypto,
    });
  }

  const node = runtime();
  const idle = await node.initialize(0);
  const intentMessage = await latestProtocol.publish({
    cycleId: cycle.cycleId,
    streamId: "intent:evidence-snapshot",
    kind: "context.claim",
    payload: { schemaVersion: 1, payloadKind: "mission_intent", intent },
    logicalTimeMs: 5,
    lifetime: 100,
  });

  async function installNodeState(status, graph = null) {
    const body = {
      ...idle,
      status,
      revision: 1,
      logicalTimeHighWaterMs: 5,
      intent,
      cycle,
      localGraph: graph?.graph ?? null,
      graph: null,
      nextWakeAtLogicalMs:
        status === "accepted" ? 5 : cycle.graphProposalCloseAtLogicalMs,
      previousStateDigest: idle.stateDigest,
    };
    delete body.stateDigest;
    const state = {
      ...body,
      stateDigest: await collectiveQuorumDigestV1({
        domain: "autonomous-collective-node-state-v1",
        body,
      }),
    };
    assert.equal(await nodeStore.save(state, 0), true);
  }

  async function publishCandidateGraph(logicalTimeMs) {
    const request = createMissionDecompositionRequestV1({
      schemaVersion: 1,
      requestId: "request:evidence-snapshot",
      missionIntentId: intent.missionIntentId,
      intentRevision: intent.revision,
      intentDigest: intent.intentDigest,
      proposerPeerId: "peer:local",
      proposerInstanceId: "instance:local",
      outcomeStatements: intent.outcomeStatements,
      permittedCapabilityKeys: intent.permittedCapabilityKeys,
      availableRoleKeys: ["role:local"],
      observationDigests: [intentMessage.payloadDigest],
      totalBudgetUnits: 100,
      priorGraphDigest: null,
      logicalTimeMs,
    });
    const graph = await new DistributedPlanningRuntimeV1({
          protocol: latestProtocol,
          decompositionPolicy,
          allocationPolicy,
          allocationEvidence: {
            async verifyCapabilityAttestation() { return true; },
            async verifyPeerProjection() { return true; },
          },
        }).proposeDecomposition({
      cycle,
      request,
      publication: { logicalTimeMs, lifetime: 100 },
    });
    const message = (await latestProtocol.messages({
      cycleId: cycle.cycleId,
      kind: "planning.graph",
    })).at(-1);
    return { graph, messageDigest: message.messageDigest };
  }

  async function publishLateEvidence(logicalTimeMs) {
    return latestProtocol.publish({
      cycleId: cycle.cycleId,
      streamId: "context:late",
      kind: "context.claim",
      payload: { schemaVersion: 1, payloadKind: "late_evidence", value: 1 },
      logicalTimeMs,
      lifetime: 100,
    });
  }

  return {
    node,
    nodeStore,
    protocol: latestProtocol,
    intent,
    reconstruct: runtime,
    construct: runtime,
    installNodeState,
    publishCandidateGraph,
    publishLateEvidence,
    armPublishCrash() { crashNextPublish = true; },
    availableRoleCalls: () => availableRoleCalls,
    proposeBidSnapshots: () => proposeBidSnapshots,
  };
}
