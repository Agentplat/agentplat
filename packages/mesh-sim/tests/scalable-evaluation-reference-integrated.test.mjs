import assert from "node:assert/strict";
import test from "node:test";

const evaluation = await import("../dist/scalable-evaluation.js");
const simulation = await import("../dist/index.js");
const environment = await import("../dist/multi-domain-environment.js");
const mesh = await import("../../mesh/dist/overlay.js");
const quorum = await import("../../collective-quorum/dist/index.js");
const host = await import("../../collective-host/dist/index.js");
const audit = await import("../../audit/dist/index.js");
const membership = await import("../../collective-membership/dist/index.js");
const runtime = await import("../../collective-runtime/dist/index.js");
const recoveryRuntime =
  await import("../../collective-runtime/dist/compromise-aware-recovery.js");
const inference = await import("../../inference-control/dist/index.js");
const planning = await import("../../collective-planning/dist/index.js");

const hexDigest = (character) => `sha256:${character.repeat(64)}`;

function egressFixture(extraOptions = {}) {
  const profile = mesh.meshSparseOverlayProfileV2("standard-500");
  const membershipDigest = profile.profileDigest;
  let stored;
  const store = {
    async load() {
      return stored;
    },
    async compareAndSwap(input) {
      if (input.expectedRevision === null) {
        if (stored !== undefined) return false;
      } else if (
        !stored ||
        stored.revision !== input.expectedRevision ||
        stored.stateDigest !== input.expectedStateDigest
      ) {
        return false;
      }
      stored = input.next;
      return true;
    },
  };
  const adapter = environment.createReferenceMultiDomainEnvironmentAdapterV1({
    domain: "cyber",
    adapterId: "reference-integrated:environment",
  });
  const options = {
    plane: {
      overlayId: "overlay:reference-integrated",
      profile,
      topologySeed: 29,
      localPeerIndex: 0,
      membershipDigest,
      store,
      membership: {
        async resolve(input) {
          return {
            schemaVersion: 1,
            overlayId: input.overlayId,
            membershipDigest: input.membershipDigest,
            observedAtLogicalTime: input.logicalTime,
            validUntilLogicalTime: input.logicalTime + 1_000,
            peers: input.peerIndexes.map((peerIndex) => ({
              peerIndex,
              peerId: `peer-${String(peerIndex).padStart(3, "0")}`,
              availability: "active",
            })),
          };
        },
      },
      updateAdmission: {
        pending() {
          return 0;
        },
        async admit() {
          return { status: "admitted" };
        },
      },
    },
    descriptor: adapter.descriptor,
    localPeerId: "peer-000",
    scope: {
      tenantId: "tenant:evaluation",
      meshId: "mesh:evaluation",
      missionIntentId: "mission:evaluation",
      objectiveId: "objective:evaluation",
    },
    objectiveDigest: objectiveScopeDigest(),
    membershipConfigurationDigest: evaluation.scalableEvaluationDigestV1(
      "test-membership",
      { epoch: 1 },
    ),
    membershipEpoch: 1,
    ...extraOptions,
  };
  const egress =
    new evaluation.ReferenceIntegratedScalableEvaluationEgressRuntimeV1(
      options,
    );
  return { egress, adapter, profile, options };
}

function missionIntent() {
  return planning.createMissionIntentV1({
    schemaVersion: 1,
    missionIntentId: "mission:evaluation",
    revision: 1,
    predecessorDigest: null,
    tenantId: "tenant:evaluation",
    policyDomainId: "policy:evaluation",
    objective: {
      schemaVersion: 1,
      meshId: "mesh:evaluation",
      objectiveId: "objective:evaluation",
      objectiveDocumentId: "document:evaluation",
      objectiveRevision: 1,
      acceptedPolicyDigest: hexDigest("a"),
    },
    mandateDigest: hexDigest("b"),
    outcomeStatements: ["complete"],
    permittedResourceClasses: ["resource"],
    permittedCapabilityKeys: ["capability"],
    planningLimits: {
      schemaVersion: 1,
      maximumCandidateFragments: 4,
      maximumActiveFragments: 4,
      maximumFragmentsPerPeer: 4,
      maximumRevisionsPerSemanticSlot: 2,
      maximumDependencyDepth: 2,
      maximumDependencyFanout: 2,
      maximumCapabilityTerms: 2,
      maximumOutcomeTerms: 2,
      maximumProposalBytes: 16_384,
      maximumSnapshotBytes: 131_072,
      maximumTraceBytes: 131_072,
      maximumTotalPlanningBudgetUnits: 40,
      maximumFragmentBudgetUnits: 20,
      budgetShardPolicy: "equal_mandate_subjects",
      maximumConcurrentProposals: 4,
      maximumActiveRoles: 4,
      proposalLogicalWindowMs: 20,
      observationLogicalWindowMs: 20,
      replanningLogicalWindowMs: 20,
    },
    selectionPolicyDigest: hexDigest("c"),
    validFrom: "2026-01-01T00:00:00Z",
    validUntil: "2027-01-01T00:00:00Z",
  });
}

function objectiveScopeDigest(intent = missionIntent()) {
  return evaluation.scalableEvaluationDigestV1(
    "reference-integrated-objective-scope",
    intent.objective,
  );
}

function missionIntentForScope(scope) {
  const { intentDigest: ignored, ...intent } = missionIntent();
  return planning.createMissionIntentV1({
    ...intent,
    tenantId: scope.tenantId,
    missionIntentId: scope.missionIntentId,
    objective: {
      ...intent.objective,
      meshId: scope.meshId,
      objectiveId: scope.objectiveId,
    },
  });
}

function semanticGuaranteePorts() {
  const names = [
    "roleCoherence",
    "missionAlignment",
    "contextConflict",
    "uncertainty",
    "courseActionDiversity",
    "courseActionNovelty",
  ];
  const policy = inference.createAnytimeSemanticGuaranteePolicyV1({
    policyId: "guarantee:reference-e2e",
    familywiseErrorBudgetPpm: 60_000,
    minimumInferenceSamples: 1,
    metrics: Object.fromEntries(
      names.map((name) => [
        name,
        {
          direction:
            name === "contextConflict" || name === "uncertainty"
              ? "lower_is_better"
              : "higher_is_better",
          errorBudgetPpm: 10_000,
          missingness: "worst_case_imputation",
        },
      ]),
    ),
    assumptions: { assumptionEvidenceDigests: [] },
  });
  const horizonPolicy = inference.createSemanticHorizonControlPolicyV1({
    expectedGuaranteePolicyDigest: policy.policyDigest,
    expectedAssumptionsDigest: policy.assumptions.assumptionsDigest,
    nominalHorizonSteps: 8,
    cautionHorizonSteps: 2,
    replanHorizonSteps: 1,
    thresholds: Object.fromEntries(
      names.map((name) => [
        name,
        { thresholdBasisPoints: 5_000, enabled: false },
      ]),
    ),
  });
  return {
    guarantees: new inference.AnytimeSemanticGuaranteeEngineV1({ policy }),
    horizon: inference.createSemanticHorizonControlV1(horizonPolicy),
  };
}

/**
 * A deliberately small, but fully nominal, stack. It mirrors the public
 * reference-stack test wiring and leaves the mission blocked after its first
 * context publication; that is sufficient to exercise the adapter boundary.
 */
async function genuinePeerFixture({
  peerIndex,
  trace = [],
  scope = {
    tenantId: "tenant:evaluation",
    meshId: "mesh:evaluation",
    missionIntentId: "mission:evaluation",
    objectiveId: "objective:evaluation",
  },
  objectiveDigest = objectiveScopeDigest(),
}) {
  const profile = mesh.meshSparseOverlayProfileV2("standard-500");
  const adapter = environment.createReferenceMultiDomainEnvironmentAdapterV1({
    domain: "cyber",
    adapterId: "reference-integrated:environment",
  });
  const membershipDigest = profile.profileDigest;
  let sparseState;
  const planeStore = {
    async load() {
      return sparseState;
    },
    async compareAndSwap(input) {
      if (input.expectedRevision === null) {
        if (sparseState !== undefined) return false;
      } else if (
        !sparseState ||
        sparseState.revision !== input.expectedRevision ||
        sparseState.stateDigest !== input.expectedStateDigest
      )
        return false;
      sparseState = input.next;
      return true;
    },
  };
  const egressOptions = {
    plane: {
      overlayId: `overlay:reference-integrated:${peerIndex}`,
      profile,
      topologySeed: 29,
      localPeerIndex: peerIndex,
      membershipDigest,
      store: planeStore,
      membership: {
        async resolve(input) {
          return {
            schemaVersion: 1,
            overlayId: input.overlayId,
            membershipDigest: input.membershipDigest,
            observedAtLogicalTime: input.logicalTime,
            validUntilLogicalTime: input.logicalTime + 1_000,
            peers: input.peerIndexes.map((index) => ({
              peerIndex: index,
              peerId: `peer-${String(index).padStart(3, "0")}`,
              availability: "active",
            })),
          };
        },
      },
      updateAdmission: {
        pending() {
          return 0;
        },
        async admit() {
          trace.push("target-plane-receive");
          return { status: "admitted" };
        },
      },
    },
    descriptor: adapter.descriptor,
    localPeerId: `peer-${String(peerIndex).padStart(3, "0")}`,
    scope,
    objectiveDigest,
    membershipConfigurationDigest: hexDigest("d"),
    membershipEpoch: 1,
  };
  const realEgress =
    new evaluation.ReferenceIntegratedScalableEvaluationEgressRuntimeV1(
      egressOptions,
    );
  const registry = {
    current() {
      return {
        tenantId: "tenant:evaluation",
        meshId: "mesh:evaluation",
        configurationDigest: hexDigest("d"),
        epoch: 1,
      };
    },
    async list() {
      return [];
    },
    async get() {
      return null;
    },
    async upsert() {},
    async retirePeer() {
      throw new Error("not used");
    },
  };
  const lineage = new membership.GovernedAgentLineageRuntimeV1({
    stateKey: `lineage:evaluation:${peerIndex}`,
    policy: {
      schemaVersion: 1,
      policyId: "policy:evaluation-lineage",
      policyVersion: 1,
      maximumGeneration: 4,
      maximumChildrenPerAgent: 4,
      maximumActiveDescendants: 8,
      maximumResourceUnitsPerChild: 100,
      maximumInteractionUnitsPerChild: 100,
      allowedAdapterIds: ["adapter:evaluation-lineage"],
      permittedCapabilityKeys: ["capability:evaluation-lineage"],
      requireRulePolicyInheritance: true,
      requireAuthorityAttenuation: true,
      requestTtlLogicalMs: 100,
      maximumCommitAttempts: 4,
      policyDigest: hexDigest("e"),
    },
    store: new membership.InMemoryAgentLineageStoreV1(),
    factory: {
      factoryId: "factory:evaluation-lineage",
      factoryVersion: 1,
      factoryImplementationDigest: hexDigest("f"),
      async create() {
        throw new Error("not used");
      },
      async terminate() {
        throw new Error("not used");
      },
    },
    certification: {
      async verify() {
        return true;
      },
      async verifyAuthorityAttenuation() {
        return true;
      },
    },
    enrollment: {
      async enroll() {
        throw new Error("not used");
      },
      async remove() {
        throw new Error("not used");
      },
    },
  });
  const lifecycle = new membership.GovernedAgentLifecycleRuntimeV1({
    lineage,
    registry,
  });
  const recoveryRegistry =
    new recoveryRuntime.BoundedLifecycleCompromiseRecoveryRuntimeRegistryV1({
      lifecycle,
      assignmentAuthority: realEgress,
      maximumScopes: 1,
      entries: [
        {
          stateKey: `recovery:${peerIndex}`,
          anchorKey: `anchor:${peerIndex}`,
          scope: {
            tenantId: "tenant:evaluation",
            meshId: "mesh:evaluation",
            missionIntentId: "mission:evaluation",
            objectiveId: "objective:evaluation",
            workItemId: `work:${peerIndex}`,
          },
          policy: {
            schemaVersion: 1,
            policyId: `recovery-policy:${peerIndex}`,
            policyVersion: 1,
            policyDigest: hexDigest("e"),
            maximumVerdictLifetimeMs: 1_000,
            maximumTakeoverProposals: 4,
            maximumWitnesses: 4,
            maximumExcludedPeers: 4,
            maximumCompletedCertificates: 4,
            maximumCommitAttempts: 2,
            maximumRunSteps: 4,
          },
          store: {
            async loadCurrent() {
              return { state: null, anchor: null };
            },
            async save() {
              return true;
            },
          },
          verification: {
            async verify() {
              return true;
            },
          },
          sparseExclusion: {
            async exclude() {
              throw new Error("not used");
            },
          },
          activation: {
            async activate() {
              throw new Error("not used");
            },
          },
          restoration: {
            async restoreCheckpoint() {
              throw new Error("not used");
            },
            async activateReauction() {
              throw new Error("not used");
            },
            async requestReplanning() {
              throw new Error("not used");
            },
          },
        },
      ],
    });
  const recovery = new recoveryRuntime.AutonomousCompromiseRecoveryRuntimeV1({
    consumerId: `recovery-consumer:${peerIndex}`,
    scope: {
      tenantId: "tenant:evaluation",
      meshId: "mesh:evaluation",
      missionIntentId: "mission:evaluation",
    },
    verdictSource: {
      async pull() {
        return { verdicts: [], hasMore: false };
      },
      async acknowledge() {},
    },
    requestPlanner: {
      async deriveRequest() {
        return null;
      },
    },
    runtimes: recoveryRegistry,
    scopeAdmission: recoveryRegistry,
    coordinatorStore: {
      async load() {
        return null;
      },
      async save() {
        return true;
      },
    },
    coordinatorStateKey: `recovery-coordinator:${peerIndex}`,
    policy: {
      policyDigest: hexDigest("f"),
      maximumCertificatesPerTick: 1,
      maximumSagaStepsPerIncident: 4,
      maximumScopes: 1,
      maximumCommitAttempts: 2,
    },
  });
  const telemetryPolicy = await audit.createCollectiveTelemetryPolicyV1({
    schemaVersion: 1,
    policyId: `telemetry:${peerIndex}`,
    policyVersion: 1,
    allowedMetricKeys: [],
    maximumEvidenceDigestsPerEvent: 16,
    maximumMetricsPerEvent: 0,
    maximumRetainedEvents: 16,
    maximumCommitAttempts: 4,
  });
  const telemetryRuntime = new audit.CollectiveTelemetryRuntimeV1({
    streamId: `stream:${peerIndex}`,
    anchorKey: `anchor:${peerIndex}`,
    tenantId: "tenant:evaluation",
    collectiveId: "mesh:evaluation",
    policy: telemetryPolicy,
    authenticity: {
      peerId: `peer-${String(peerIndex).padStart(3, "0")}`,
      instanceId: `instance:${peerIndex}`,
      keyId: `key:${peerIndex}`,
      async sign(value) {
        return `signed:${value}`;
      },
      async verify(input) {
        return input.signature === `signed:${input.messageDigest}`;
      },
    },
    monotonicAnchor: new audit.InMemoryCollectiveTelemetryMonotonicAnchorV1(),
  });
  await telemetryRuntime.initialize(0);
  const telemetry = new host.CollectiveHostTelemetryAdapterV1(telemetryRuntime);
  const semantic = semanticGuaranteePorts();
  const executionSemanticGuarantees =
    new inference.SequentialSemanticGuaranteeEngineV1(16);
  const allocationPolicy = runtime.createStrategicAllocationPolicyV1({
    schemaVersion: 1,
    policyId: `allocation:${peerIndex}`,
    policyVersion: 1,
    maximumTasksPerPeer: 16,
    maximumTasksPerIndependenceGroup: 16,
    maximumTotalBudgetUnits: 10_000,
    maximumTotalResourceUnits: 10_000,
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
  // The reference collective composition is intentionally closed over a
  // restart-safe cognitive horizon ledger. Keep the controller and assurance
  // boundary on the same nominal stores so a reconstructed peer cannot spend
  // a fresh horizon budget.
  const semanticHorizonBudgetStore =
    new inference.InMemorySemanticHorizonBudgetStoreV1();
  const semanticHorizonBudgetMonotonicAnchor =
    new inference.InMemorySemanticHorizonBudgetMonotonicAnchorV1();
  const semanticHorizonBudgetStateKey = `semantic-horizon:${peerIndex}`;
  const semanticAcceptance =
    await host.createIntegratedSemanticAcceptancePolicyV2({
      policyId: `semantic-acceptance:${peerIndex}`,
      policyVersion: 1,
      minimumSamples: 1,
      minimumRoleCoherenceLowerBasisPoints: 0,
      minimumMissionAlignmentLowerBasisPoints: 0,
      maximumContextConflictUpperBasisPoints: 10_000,
      maximumUncertaintyUpperBasisPoints: 10_000,
      minimumCourseActionDiversityLowerBasisPoints: 0,
      minimumCourseActionNoveltyLowerBasisPoints: 0,
      requireCourseActionDiversity: false,
      requireCourseActionNovelty: false,
    });
  const controller = new inference.OperationalCognitiveControllerV1({
    controlId: `control:${peerIndex}`,
    mode: "black_box",
    guaranteeStateKey: `guarantee:${peerIndex}`,
    blackBoxPolicy: inference.createBlackBoxControlPolicyV1({
      maximumContextTokens: 128,
      maximumContextItems: 8,
      maximumContextItemBytes: 4_096,
      minimumTrustBasisPoints: 5_000,
      maximumRiskBasisPoints: 5_000,
      maximumItemsPerIndependenceGroup: 2,
      allowedToolNames: [],
      protectedZones: ["authority"],
      roleReinforcement: "Follow the governed mission role.",
      roleReinforcementDigest: inference.digestBlackBoxContentV1(
        "Follow the governed mission role.",
      ),
    }),
    observers: Object.fromEntries(
      [
        "coherence",
        "objective_alignment",
        "context_conflict",
        "uncertainty",
      ].map((kind) => [
        kind === "objective_alignment"
          ? "objective"
          : kind === "context_conflict"
            ? "context"
            : kind,
        {
          observerId: `observer:${kind}:${peerIndex}`,
          observerVersion: 1,
          observerImplementationDigest: hexDigest("1"),
          kind,
          async observe() {
            return {
              valueBasisPoints: 9_000,
              evidenceDigests: [],
              reasonCodes: [],
            };
          },
        },
      ]),
    ),
    intervention: {
      async gateCheckpoint() {
        throw new Error("not used");
      },
      async gateOperation() {
        throw new Error("not used");
      },
    },
    guarantee: semantic.guarantees,
    horizonControl: semantic.horizon,
    horizonBudgetStore: semanticHorizonBudgetStore,
    horizonBudgetMonotonicAnchor: semanticHorizonBudgetMonotonicAnchor,
    horizonBudgetStateKey: semanticHorizonBudgetStateKey,
    inference: {
      async execute() {
        throw new Error("not used");
      },
    },
  });
  const roles = new inference.GovernedRoleCatalogRuntimeV2({
    catalogId: `roles:${peerIndex}`,
    missionId: "mission:evaluation",
    authorityDigest: hexDigest("2"),
    certification: {
      async verify() {
        return true;
      },
    },
  });
  const artifacts = new host.InMemoryDistributedCollectiveArtifactStoreV1();
  const adaptationPolicy = await host.createAutonomousAdaptationPolicyV1({
    schemaVersion: 1,
    policyId: `adaptation-policy:${peerIndex}`,
    policyVersion: 1,
    minimumSeverityBasisPoints: 0,
    minimumConfidenceBasisPoints: 0,
    minimumIndependentSources: 1,
    observationWindowMs: 100,
    domainCooldownMs: { mission: 0, strategy: 0, role: 0, team: 0 },
    maximumActionsPerCycle: 4,
    maximumEvidenceDigestsPerSignal: 16,
    maximumRetainedSignals: 16,
    maximumRetainedDecisions: 16,
    maximumCommitAttempts: 2,
  });
  const localCatalog = await host.createReferenceLocalCapabilityCatalogV1({
    schemaVersion: 1,
    catalogId: `catalog:${peerIndex}`,
    catalogVersion: 1,
    tenantId: "tenant:evaluation",
    localPeerId: `peer-${String(peerIndex).padStart(3, "0")}`,
    localInstanceId: `instance:${peerIndex}`,
    membershipConfigurationDigest: hexDigest("d"),
    issuerId: `issuer:${peerIndex}`,
    issuerKeyDigest: hexDigest("5"),
    independenceGroupId: `group:${peerIndex}`,
    bidNonceSeed: `reference-stack-test-seed-${peerIndex}`,
    bidValidityMs: 100,
    credibilityStateDigest: hexDigest("6"),
    credibilityScoreBasisPoints: 9_000,
    credibilityUncertaintyBasisPoints: 100,
    collusionPressureBasisPoints: 0,
    entries: [],
  });
  const stack = host.createReferenceIntegratedCollectiveStackV1({
    protocol: {
      protocolId: "protocol:evaluation",
      scopeDigest: hexDigest("3"),
      crypto: globalThis.crypto,
      membershipConfigurationDigest: hexDigest("d"),
      localPeerId: `peer-${String(peerIndex).padStart(3, "0")}`,
      localInstanceId: `instance:${peerIndex}`,
      plane: realEgress,
      artifacts,
      authenticity: {
        localKeyId: `key:${peerIndex}`,
        async sign() {
          return "signature";
        },
        async verify() {
          trace.push("target-node-receive");
          return true;
        },
      },
      membership: {
        async verifyPeer() {
          return true;
        },
        async resolveIndependenceGroup() {
          return `group:${peerIndex}`;
        },
      },
    },
    planning: {
      decompositionPolicy: planning.createDistributedDecompositionPolicyV1({
        schemaVersion: 1,
        policyId: `decomposition:${peerIndex}`,
        policyVersion: 1,
        maximumTasks: 16,
        maximumDepth: 4,
        maximumDependenciesPerTask: 4,
        maximumBudgetUnits: 1_000,
        minimumProposalConfidenceBasisPoints: 0,
        templates: [],
      }),
      allocationPolicy,
    },
    finality: {
      crypto: globalThis.crypto,
      membership: {
        schemaVersion: 2,
        epoch: 1,
        configurationDigest: hexDigest("d"),
        selectionSeedDigest: hexDigest("4"),
        validators: [],
      },
      policy: {},
      signatures: {
        algorithm: "test",
        async verifyShare() {
          return true;
        },
        async aggregate() {
          return null;
        },
        async verifyAggregate() {
          return true;
        },
      },
      gateway: host.declareRestartDurableSparseBftFinalityGatewayV1({
        async certify() {
          return null;
        },
        async shardCertificates() {
          return null;
        },
        async reconcileCertification() {
          return null;
        },
      }),
    },
    local: {
      catalog: localCatalog,
      lifecycle,
      governedRoleCatalog: roles,
    },
    execution: {
      operationalControl: controller,
      semanticHorizon: new host.AnytimeSemanticHorizonCouplingV1(semantic),
      semanticStateKey: `semantic:${peerIndex}`,
      semanticHorizonBudgetStore,
      semanticHorizonBudgetStateKey,
      semanticHorizonBudgetMonotonicAnchor,
      semanticGuarantees: executionSemanticGuarantees,
      semanticAcceptance,
      semanticAssessment: {
        async assess() {
          throw new Error("not used");
        },
      },
      effects: {
        async prepare() {
          throw new Error("not used");
        },
        async commit() {
          throw new Error("not used");
        },
      },
      store: new host.InMemoryAssuranceCoupledExecutionStoreV1(),
      telemetry,
    },
    adaptation: {
      missionId: "mission:evaluation",
      runtimeId: `adaptation:${peerIndex}`,
      policy: adaptationPolicy,
      planners: ["mission", "strategy", "role", "team"].map((domain) => ({
        domain,
        async propose() {
          return null;
        },
      })),
      actuator: {
        async reconcileApply() {
          return null;
        },
        async apply() {
          throw new Error("not used");
        },
        async reconcileRollback() {
          return null;
        },
        async rollback() {
          throw new Error("not used");
        },
      },
      store: host.declareRestartDurableAutonomousAdaptationStoreV1(
        new host.InMemoryAutonomousAdaptationStoreV1(),
      ),
      invariants: {
        maximumRiskBasisPoints: 1_000,
        allowedDomains: ["mission", "strategy", "role", "team"],
        allowedAuthorityCeilingDigests: [hexDigest("9")],
      },
    },
    recovery,
    recoveryAssignmentAuthority: realEgress,
    node: {
      runtimeId: `node:${peerIndex}`,
      crypto: globalThis.crypto,
      policy: {
        schemaVersion: 1,
        graphProposalWindowMs: 10,
        bidCommitmentWindowMs: 10,
        bidRevealWindowMs: 10,
        messageLifetimeMs: 100,
        maximumLocalBids: 4,
        maximumAdmittedEvidenceMessages: 16,
        fanout: 1,
      },
      store: new host.InMemoryAutonomousCollectiveNodeStoreV1(),
      telemetry,
    },
  });
  return { stack, egress: realEgress, adapter, profile };
}

test("genuine stacks carry a source step through ACK ingress before target node receipt", async () => {
  const profile = mesh.meshSparseOverlayProfileV2("standard-500");
  const previewView = mesh.createMeshSparsePeerViewV2({
    schemaVersion: 2,
    profile,
    topologySeed: 29,
    peerIndex: 0,
  });
  const preview = mesh.publishMeshSparseUpdateV2({
    schemaVersion: 2,
    profile,
    state: mesh.createMeshSparseRoutingStateV2({
      schemaVersion: 2,
      profile,
      view: previewView,
      logicalTime: 0,
    }),
    topic: "collective.context.claim",
    payloadDigest: profile.profileDigest,
    logicalTime: 1,
    lifetime: 100,
    fanout: 1,
  });
  const targetIndex = preview.deliveries[0].recipientPeerIndex;
  const trace = [];
  const source = await genuinePeerFixture({ peerIndex: 0 });
  const target = await genuinePeerFixture({ peerIndex: targetIndex, trace });
  const intent = missionIntent();
  const evaluationProfile = evaluation.createScalableEvaluationProfileV1({
    profileId: "standard-500",
    maximumInteractions: 128,
    maximumMessages: 8,
    maximumMessageBytes: 1_000_000,
    maximumRetainedRecords: 8,
  });
  const scenario = environment.createReferenceMultiDomainScenarioDefinitionV1({
    adapter: source.adapter,
    scenarioId: "reference-integrated:e2e",
    scaleProfileId: evaluationProfile.shardedProfileId,
    seed: 29,
  });
  const descriptor = evaluation.createScalableEvaluationTeamDescriptorV1({
    teamId: "team:reference",
    architecture: "distributed",
    implementationId:
      evaluation.REFERENCE_INTEGRATED_SCALABLE_EVALUATION_IMPLEMENTATION_ID_V1,
    implementationVersion: "1",
    implementationDigest: hexDigest("a"),
  });
  const competitor = evaluation.createScalableEvaluationTeamDescriptorV1({
    teamId: "team:competitor",
    architecture: "centralized",
    implementationId: "competitor:test",
    implementationVersion: "1",
    implementationDigest: hexDigest("b"),
  });
  const definition = evaluation.createScalableEvaluationDefinitionV1({
    evaluationId: "evaluation:reference-integrated:e2e",
    profile: evaluationProfile,
    descriptor: source.adapter.descriptor,
    scenario,
    partialObservability:
      evaluation.createScalableEvaluationPartialObservabilityV1({
        scope: "peer_local",
        maximumObservationsPerPull: 4,
        allowCrossDomainAggregation: false,
        sourceVisibilityPolicyDigest: scenario.visibilityPolicyDigest,
      }),
    teams: [descriptor, competitor],
    perturbations: [],
  });
  const observationSchemaDigest =
    source.adapter.descriptor.observationSchemas[0].schemaDigest;
  const sourcePeer = evaluation.bindReferenceIntegratedScalableEvaluationPeerV1(
    {
      peerIndex: 0,
      stack: source.stack,
      egress: source.egress,
      missionIntent: intent,
      observationSchemaDigest,
    },
  );
  const targetPeer = evaluation.bindReferenceIntegratedScalableEvaluationPeerV1(
    {
      peerIndex: targetIndex,
      stack: target.stack,
      egress: target.egress,
      missionIntent: intent,
      observationSchemaDigest,
    },
  );
  const port = evaluation.createReferenceIntegratedScalableEvaluationTeamPortV1(
    {
      descriptor,
      definition,
      peers: [sourcePeer, targetPeer],
    },
  );
  assert.throws(
    () =>
      evaluation.createReferenceIntegratedScalableEvaluationTeamPortV1({
        descriptor,
        definition,
        peers: [sourcePeer, targetPeer],
      }),
    /reference_integrated_peer_already_owned/u,
  );
  const sourceStep = {
    schemaVersion: 1,
    evaluationDefinitionDigest: definition.definitionDigest,
    teamId: descriptor.teamId,
    peerIndex: 0,
    domain: "cyber",
    logicalTime: 1,
    delivery: { deliveryDigest: hexDigest("c"), observations: [] },
    remainingInteractions: 127,
    remainingMessages: 8,
    remainingMessageBytes: 1_000_000,
  };
  const sourceOutput = await port.stepV1(sourceStep);
  assert.equal(sourceOutput.messages.length, 1);
  const message = sourceOutput.messages[0];
  assert.equal(message.targetPeerIndex, targetIndex);
  const eventId = "event:reference-e2e";
  const batch = simulation.createShardedSimulationCrossShardMessageBatchV1({
    batchId: "batch:reference-e2e",
    sessionId: "session:reference-e2e",
    episodeId: "episode:reference-e2e",
    sourceShardId: "shard:0",
    targetShardId: "shard:1",
    logicalTime: 1,
    messages: [
      {
        schemaVersion: 1,
        eventId,
        sourcePeerIndex: 0,
        targetPeerIndex: targetIndex,
        logicalTime: 1,
        payloadDigest: message.transportEnvelopeDigest,
      },
    ],
  });
  const ackBody = {
    schemaVersion: 1,
    batchId: batch.batchId,
    batchDigest: batch.batchDigest,
    accepted: true,
    duplicate: false,
    deliveredEventIds: [eventId],
  };
  const bridgeAck = {
    ...ackBody,
    ackDigest: simulation.shardedSimulationDigestV1(
      "sharded-simulation-cross-shard-ack-v1",
      ackBody,
    ),
  };
  const tamperedEnvelope = structuredClone(message.transportEnvelope);
  tamperedEnvelope.captureSequence += 1;
  await assert.rejects(
    () =>
      port.ingestAcknowledgedMessageV1({
        schemaVersion: 1,
        evaluationDefinitionDigest: definition.definitionDigest,
        teamId: descriptor.teamId,
        sessionId: "session:reference-e2e",
        episodeId: "episode:reference-e2e",
        logicalTime: 1,
        eventId,
        batch,
        bridgeAck,
        message: {
          ...message,
          transportEnvelope: tamperedEnvelope,
          transportEnvelopeDigest: evaluation.scalableEvaluationDigestV1(
            "team-message-transport-envelope",
            tamperedEnvelope,
          ),
          byteLength: new TextEncoder().encode(JSON.stringify(tamperedEnvelope))
            .byteLength,
        },
      }),
    /reference_integrated_transport_capture_invalid/u,
  );
  const ingress = await port.ingestAcknowledgedMessageV1({
    schemaVersion: 1,
    evaluationDefinitionDigest: definition.definitionDigest,
    teamId: descriptor.teamId,
    sessionId: "session:reference-e2e",
    episodeId: "episode:reference-e2e",
    logicalTime: 1,
    eventId,
    batch,
    bridgeAck,
    message,
  });
  assert.equal(ingress.status, "admitted");
  assert.equal(
    evaluation.inspectReferenceIntegratedScalableEvaluationEgressV1(
      source.egress,
    ).capturedDeliveryCount,
    0,
  );

  await port.stepV1({
    schemaVersion: 1,
    evaluationDefinitionDigest: definition.definitionDigest,
    teamId: descriptor.teamId,
    peerIndex: targetIndex,
    domain: "cyber",
    logicalTime: 1,
    delivery: { deliveryDigest: hexDigest("d"), observations: [] },
    remainingInteractions: 8,
    remainingMessages: 8,
    remainingMessageBytes: 1_000_000,
  });
  const planeReceiveIndex = trace.indexOf("target-plane-receive");
  assert.ok(planeReceiveIndex >= 0);
  assert.ok(trace.lastIndexOf("target-node-receive") > planeReceiveIndex);
  await assert.rejects(
    () =>
      port.stepV1({
        schemaVersion: 1,
        evaluationDefinitionDigest: definition.definitionDigest,
        teamId: descriptor.teamId,
        peerIndex: targetIndex,
        domain: "cyber",
        logicalTime: 1,
        delivery: { deliveryDigest: hexDigest("d"), observations: [] },
        remainingInteractions: 8,
        remainingMessages: 7,
        remainingMessageBytes: 1_000_000,
      }),
    /reference_integrated_step_retry_conflict/u,
  );

  for (let logicalTime = 2; logicalTime <= 65; logicalTime += 1) {
    await port.stepV1({
      ...sourceStep,
      logicalTime,
      delivery: {
        deliveryDigest: evaluation.scalableEvaluationDigestV1(
          "reference-integrated-bounded-journal-delivery",
          { logicalTime },
        ),
        observations: [],
      },
      remainingInteractions: 128 - logicalTime,
    });
  }
  assert.equal(
    evaluation.inspectReferenceIntegratedScalableEvaluationEgressV1(
      source.egress,
    ).settledDeliveryCount,
    0,
  );
  await assert.rejects(
    () => port.stepV1(sourceStep),
    /reference_integrated_step_retry_window_expired/u,
  );
});

test("reference peer binding requires exact mission scope and has one exclusive owner", async () => {
  const peer = await genuinePeerFixture({ peerIndex: 0 });
  const observationSchemaDigest =
    peer.adapter.descriptor.observationSchemas[0].schemaDigest;
  const { intentDigest: ignored, ...intentBody } = missionIntent();
  const wrongTenantIntent = planning.createMissionIntentV1({
    ...intentBody,
    tenantId: "tenant:other",
  });
  assert.throws(
    () =>
      evaluation.bindReferenceIntegratedScalableEvaluationPeerV1({
        peerIndex: 0,
        stack: peer.stack,
        egress: peer.egress,
        missionIntent: wrongTenantIntent,
        observationSchemaDigest,
      }),
    /reference_integrated_mission_scope_mismatch/u,
  );
  const binding = {
    peerIndex: 0,
    stack: peer.stack,
    egress: peer.egress,
    missionIntent: missionIntent(),
    observationSchemaDigest,
  };
  assert.ok(
    evaluation.bindReferenceIntegratedScalableEvaluationPeerV1(binding),
  );
  assert.throws(
    () => evaluation.bindReferenceIntegratedScalableEvaluationPeerV1(binding),
    /reference_integrated_peer_binding_already_exists/u,
  );
});

test("genuine cross-scope peers are rejected before they can form an ingress route", async () => {
  const source = await genuinePeerFixture({ peerIndex: 0 });
  const targetScope = {
    tenantId: "tenant:other",
    meshId: "mesh:other",
    missionIntentId: "mission:other",
    objectiveId: "objective:other",
  };
  const targetIntent = missionIntentForScope(targetScope);
  const target = await genuinePeerFixture({
    peerIndex: 1,
    scope: targetScope,
    objectiveDigest: objectiveScopeDigest(targetIntent),
  });
  const profile = evaluation.createScalableEvaluationProfileV1({
    profileId: "standard-500",
    maximumInteractions: 128,
    maximumMessages: 8,
    maximumMessageBytes: 1_000_000,
    maximumRetainedRecords: 8,
  });
  const scenario = environment.createReferenceMultiDomainScenarioDefinitionV1({
    adapter: source.adapter,
    scenarioId: "reference-integrated:scope-mismatch",
    scaleProfileId: profile.shardedProfileId,
    seed: 29,
  });
  const descriptor = evaluation.createScalableEvaluationTeamDescriptorV1({
    teamId: "team:scope-mismatch",
    architecture: "distributed",
    implementationId:
      evaluation.REFERENCE_INTEGRATED_SCALABLE_EVALUATION_IMPLEMENTATION_ID_V1,
    implementationVersion: "1",
    implementationDigest: hexDigest("e"),
  });
  const competitor = evaluation.createScalableEvaluationTeamDescriptorV1({
    teamId: "team:scope-mismatch:competitor",
    architecture: "centralized",
    implementationId: "competitor:test",
    implementationVersion: "1",
    implementationDigest: hexDigest("f"),
  });
  const definition = evaluation.createScalableEvaluationDefinitionV1({
    evaluationId: "evaluation:reference-integrated:scope-mismatch",
    profile,
    descriptor: source.adapter.descriptor,
    scenario,
    partialObservability:
      evaluation.createScalableEvaluationPartialObservabilityV1({
        scope: "peer_local",
        maximumObservationsPerPull: 4,
        allowCrossDomainAggregation: false,
        sourceVisibilityPolicyDigest: scenario.visibilityPolicyDigest,
      }),
    teams: [descriptor, competitor],
    perturbations: [],
  });
  const observationSchemaDigest =
    source.adapter.descriptor.observationSchemas[0].schemaDigest;
  const sourcePeer = evaluation.bindReferenceIntegratedScalableEvaluationPeerV1(
    {
      peerIndex: 0,
      stack: source.stack,
      egress: source.egress,
      missionIntent: missionIntent(),
      observationSchemaDigest,
    },
  );
  const targetPeer = evaluation.bindReferenceIntegratedScalableEvaluationPeerV1(
    {
      peerIndex: 1,
      stack: target.stack,
      egress: target.egress,
      missionIntent: targetIntent,
      observationSchemaDigest,
    },
  );

  assert.throws(
    () =>
      evaluation.createReferenceIntegratedScalableEvaluationTeamPortV1({
        descriptor,
        definition,
        peers: [sourcePeer, targetPeer],
      }),
    /reference_integrated_peer_scope_mismatch/u,
  );
});

test("reference integrated egress rejects method substitution and hidden callbacks", () => {
  const { egress, options } = egressFixture();
  assert.throws(() => {
    egress.publish = async () => ({ substituted: true });
  }, TypeError);
  assert.equal(Object.isFrozen(egress), true);

  class SubstitutedEgress
    extends evaluation.ReferenceIntegratedScalableEvaluationEgressRuntimeV1 {}
  assert.throws(
    () => new SubstitutedEgress(options),
    /reference_integrated_egress_subclass_invalid/u,
  );
  assert.throws(
    () =>
      new evaluation.ReferenceIntegratedScalableEvaluationEgressRuntimeV1({
        ...options,
        mapEffect() {},
      }),
    /reference_integrated_egress_options_invalid/u,
  );
});

test("reference integrated egress uses nominal sparse-plane invokers after prototype and port mutation", async () => {
  const { egress, options } = egressFixture();
  const prototype = mesh.MeshSparsePeerPlaneRuntimeV1.prototype;
  const priorPublish = Object.getOwnPropertyDescriptor(prototype, "publish");
  let substitutedPublishCalls = 0;
  let substitutedStoreCalls = 0;
  Object.defineProperty(prototype, "publish", {
    configurable: true,
    writable: true,
    value: async () => {
      substitutedPublishCalls += 1;
      throw new Error("substituted sparse publish must not run");
    },
  });
  options.plane.store.load = async () => {
    substitutedStoreCalls += 1;
    throw new Error("substituted sparse store must not run");
  };
  options.plane.localPeerIndex = 499;
  try {
    const result = await egress.publish({
      topic: "collective.nominal-sparse-plane",
      payloadDigest: `sha256:${"A".repeat(43)}`,
      logicalTime: 1,
      lifetime: 10,
    });
    assert.equal(result.update.topic, "collective.nominal-sparse-plane");
    assert.equal(result.update.originPeerIndex, 0);
    assert.equal(substitutedPublishCalls, 0);
    assert.equal(substitutedStoreCalls, 0);
  } finally {
    if (priorPublish) Object.defineProperty(prototype, "publish", priorPublish);
    else delete prototype.publish;
  }
});

test("reference integrated egress captures exact sparse destinations nominally", async () => {
  const { egress, profile } = egressFixture();
  assert.equal(
    evaluation.isReferenceIntegratedScalableEvaluationEgressV1(egress),
    true,
  );
  assert.equal(
    evaluation.isReferenceIntegratedScalableEvaluationEgressV1({
      publish: egress.publish.bind(egress),
    }),
    false,
  );

  const published = await egress.publish({
    topic: "collective.context.claim",
    payloadDigest: profile.profileDigest,
    logicalTime: 1,
    lifetime: 100,
    fanout: 2,
  });
  assert.equal(published.update.originPeerIndex, 0);
  const snapshot =
    evaluation.inspectReferenceIntegratedScalableEvaluationEgressV1(egress);
  assert.equal(snapshot.localPeerIndex, 0);
  assert.equal(snapshot.capturedDeliveryCount, 2);
  assert.match(snapshot.latestDeliveryCaptureDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.throws(() => {
    snapshot.capturedDeliveryCount = 0;
  }, TypeError);
});

test("reference integrated protected commits stop in the evaluation effect outbox", async () => {
  const { egress, adapter } = egressFixture({ recoveryPeerId: "peer-001" });
  const taskDigest = evaluation.scalableEvaluationDigestV1("test-task", {
    taskId: "task:evaluation",
  });
  const awardDigest = evaluation.scalableEvaluationDigestV1("test-award", {
    taskDigest,
  });
  const fence = await egress.resolve({
    localPeerId: "peer-000",
    cognitiveRequest: {
      tenantId: "tenant:evaluation",
      payload: {
        missionIntentId: "mission:evaluation",
        planningCycleId: "cycle:evaluation:protected",
      },
    },
    task: { taskId: "task:evaluation", taskDigest },
    executionId: "execution:evaluation",
    awardDigest,
  });
  assert.ok(fence);
  assert.equal(fence.scope.missionIntentId, "mission:evaluation");
  assert.equal(fence.scope.objectiveId, "cycle:evaluation:protected");
  const actionSchema = adapter.descriptor.actionSchemas[0];
  const action = {
    schemaVersion: 1,
    domain: actionSchema.domain,
    entityId: "entity:0",
    capability: actionSchema.capability,
    schemaDigest: actionSchema.schemaDigest,
    payload: { requested: true },
  };
  const effectClass = "environment.action";
  const proposalDigest = await quorum.collectiveQuorumDigestV1({
    domain: "assurance-protected-effect-proposal-v1",
    body: { schemaVersion: 1, effectClass, payload: action },
  });
  const certificate = {
    proposalDigest: evaluation.scalableEvaluationDigestV1(
      "test-execution-decision",
      { proposalDigest },
    ),
    valueDigest: proposalDigest,
    certificateDigest: evaluation.scalableEvaluationDigestV1(
      "test-execution-certificate",
      { proposalDigest },
    ),
  };
  const request = {
    executionId: "execution:evaluation",
    effect: {
      schemaVersion: 1,
      effectClass,
      payload: action,
      proposalDigest,
    },
    certificate,
    authorityFence: fence,
    logicalTimeMs: 5,
    signal: new AbortController().signal,
  };
  const receipt = await egress.commit(request);
  assert.equal(receipt.status, "committed");
  assert.equal(receipt.reasonCode, "evaluation_outbox_committed");
  await egress.install({
    operationId: "operation:advance-after-effect",
    workItemId: request.authorityFence.scope.workItemId,
    excludedPeerId: request.authorityFence.assignedPeerId,
    expectedAssignmentEpoch: request.authorityFence.assignmentEpoch,
    expectedFencingToken: request.authorityFence.fencingToken,
    nextAssignmentEpoch: request.authorityFence.assignmentEpoch + 1,
    logicalTimeMs: 6,
  });
  // Recovery must observe the old execution's already committed receipt even
  // after another peer owns a newer assignment epoch. Re-applying the stale
  // authority fence would be unsafe and is deliberately unnecessary.
  assert.equal(await egress.reconcile(request), receipt);
  assert.equal(await egress.commit(request), receipt);
  const snapshot =
    evaluation.inspectReferenceIntegratedScalableEvaluationEgressV1(egress);
  assert.equal(snapshot.capturedEffectCount, 1);
  assert.match(snapshot.latestEffectCaptureDigest, /^sha256:[0-9a-f]{64}$/u);

  await assert.rejects(
    () =>
      egress.commit({
        ...request,
        executionId: "execution:invalid-payload",
        effect: { ...request.effect, payload: { arbitrary: true } },
        authorityFence: {
          ...fence,
          executionId: "execution:invalid-payload",
        },
      }),
    /action_schema_version_invalid|effect_authority_invalid|effect_proposal_invalid/u,
  );
});

test("reference integrated peer binding rejects structural stack callbacks", () => {
  const { egress } = egressFixture();
  assert.throws(
    () =>
      evaluation.bindReferenceIntegratedScalableEvaluationPeerV1({
        peerIndex: 0,
        stack: {
          node: {
            async loadOptional() {
              return null;
            },
            async initialize() {},
            async load() {},
            async submitMission() {},
            async receive() {},
            async advance() {},
          },
        },
        egress,
        missionIntent: {},
        observationSchemaDigest: evaluation.scalableEvaluationDigestV1(
          "test-observation-schema",
          {},
        ),
      }),
    /reference_integrated_stack_not_genuine/u,
  );
});
