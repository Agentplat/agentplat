import assert from "node:assert/strict";
import test from "node:test";

import {
  CollectiveTelemetryRuntimeV1,
  InMemoryCollectiveTelemetryMonotonicAnchorV1,
  createCollectiveTelemetryPolicyV1,
} from "@agentplat/audit/collective-telemetry";

import {
  AutonomousCompromiseRecoveryRuntimeV1,
  BoundedLifecycleCompromiseRecoveryRuntimeRegistryV1,
  autonomousCompromiseRecoveryScopeV1,
  hasAutonomousCompromiseRecoveryClosedRegistryPairV1,
  invokeAutonomousCompromiseRecoveryGateExecutionV1,
  invokeAutonomousCompromiseRecoveryRequireNodeProgressV1,
  invokeAutonomousCompromiseRecoveryTickV1,
  isAutonomousCompromiseRecoveryBoundToAssignmentAuthorityV1,
  isAutonomousCompromiseRecoveryBoundToLifecycleV1,
  isAutonomousCompromiseRecoveryRuntimeV1,
  isBoundedLifecycleCompromiseRecoveryRuntimeRegistryV1,
} from "@agentplat/collective-runtime/compromise-aware-recovery";
import {
  ReferenceCollectiveMembershipGenerationChangedErrorV1,
  createReferenceIntegratedCollectiveStackV1,
  createReferenceRecoveryAwareCurrentnessV1,
  createReferenceRecoveryExecutionAuthorityV1,
  createReferenceRecoveryGatedNodeFacadeV1,
  declareRestartDurableSparseBftFinalityGatewayV1,
  inspectReferenceIntegratedCollectiveStackV1,
  isReferenceIntegratedCollectiveStackBoundToPlaneAndRecoveryV1,
  isReferenceIntegratedCollectiveStackBoundToV1,
  isReferenceIntegratedCollectiveStackV1,
  readReferenceIntegratedCollectiveArtifactV1,
  storeReferenceIntegratedCollectiveArtifactV1,
} from "@agentplat/collective-host/reference-integrated-stack";
import {
  AssuranceCoupledExecutionRuntimeV1,
  InMemoryAssuranceCoupledExecutionStoreV1,
  assuranceCognitiveContextBindingDigestV1,
  assuranceCoupledExecutionInputDigestV1,
  createAssuranceExecutionAuthorityFenceV1,
  isAssuranceCoupledExecutionRuntimeV1,
  validateExecutionAuthorityFenceV1,
} from "@agentplat/collective-host/assurance-coupled-execution";
import { createIntegratedSemanticAcceptancePolicyV2 } from "@agentplat/collective-host";
import {
  InMemoryAutonomousAdaptationStoreV1,
  declareRestartDurableAutonomousAdaptationStoreV1,
} from "@agentplat/collective-host/autonomous-adaptation";
import { InMemoryAutonomousCollectiveNodeStoreV1 } from "@agentplat/collective-host/autonomous-node";
import { CollectiveHostTelemetryAdapterV1 } from "@agentplat/collective-host/collective-telemetry";
import { GovernedRoleCatalogCurrentnessV1 } from "@agentplat/collective-host/reference-local-ports";
import {
  InMemoryDistributedCollectiveArtifactStoreV1,
  distributedCollectiveArtifactDigestV1,
  distributedCollectiveMessageDigestV1,
} from "@agentplat/collective-host/distributed-protocol";
import {
  AnytimeSemanticHorizonCouplingV1,
  invokeAnytimeSemanticHorizonCouplingV1,
  isAnytimeSemanticHorizonCouplingV1,
} from "@agentplat/collective-host/semantic-horizon-coupling";
import { createDistributedDecompositionPolicyV1 } from "@agentplat/collective-planning/distributed-decomposition";
import { collectiveQuorumDigestV1 } from "@agentplat/collective-quorum";
import { createStrategicAllocationPolicyV1 } from "@agentplat/collective-runtime/strategic-allocation";
import {
  GovernedAgentLifecycleRuntimeV1,
  governedAgentLifecycleRegistryV1,
  isGovernedAgentLifecycleRuntimeV1,
} from "@agentplat/collective-membership/governed-agent-lifecycle";
import {
  GovernedAgentLineageRuntimeV1,
  InMemoryAgentLineageStoreV1,
} from "@agentplat/collective-membership/agent-lineage";
import {
  GovernedRoleCatalogRuntimeV2,
  governedRoleCatalogMissionIdV2,
  invokeGovernedRoleCatalogResolveActiveRoleBindingV2,
  isGovernedRoleCatalogRuntimeV2,
} from "@agentplat/inference-control/governed-role-evolution";
import {
  OperationalCognitiveControllerV1,
  isOperationalCognitiveControllerV1,
} from "@agentplat/inference-control/operational-control";
import {
  InMemorySemanticHorizonBudgetMonotonicAnchorV1,
  InMemorySemanticHorizonBudgetStoreV1,
} from "@agentplat/inference-control/semantic-horizon-budget";
import {
  AnytimeSemanticGuaranteeEngineV1,
  createAnytimeSemanticGuaranteePolicyV1,
  createSemanticHorizonControlPolicyV1,
  createSemanticHorizonControlV1,
} from "@agentplat/inference-control/semantic-guarantees";
import {
  SequentialSemanticGuaranteeEngineV1,
  invokeSequentialSemanticGuaranteeAppendV1,
  isSequentialSemanticGuaranteeEngineV1,
} from "@agentplat/inference-control/semantic-metrics";
import {
  createBlackBoxControlPolicyV1,
  digestBlackBoxContentV1,
} from "@agentplat/inference-control/reference-controllers";

const digest = (character) => `sha256:${character.repeat(64)}`;
const scope = Object.freeze({
  tenantId: "tenant:recovery",
  meshId: "mesh:recovery",
  missionIntentId: "mission:recovery",
  objectiveId: "objective:recovery",
  workItemId: "work:recovery",
});
const coordinatorScope = Object.freeze({
  tenantId: scope.tenantId,
  meshId: scope.meshId,
  missionIntentId: scope.missionIntentId,
});
const verdict = Object.freeze({
  scope,
  certificateDigest: digest("a"),
});

function strategicAllocationPolicy(overrides = {}) {
  return createStrategicAllocationPolicyV1({
    schemaVersion: 1,
    policyId: "allocation:reference-stack",
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
    ...overrides,
  });
}

async function semanticAcceptancePolicy(overrides = {}) {
  return createIntegratedSemanticAcceptancePolicyV2({
    policyId: "semantic-acceptance:reference-stack",
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
    ...overrides,
  });
}

function state(overrides = {}) {
  return {
    scope,
    activeIncident: null,
    completedCertificateDigests: [],
    supersededCertificates: [],
    stateDigest: digest("1"),
    ...overrides,
  };
}

function fakeRecovery(options = {}) {
  let retained = options.initialVerdict
    ? state({
        activeIncident: {
          stage: options.initialStage ?? "certified",
          verdict: options.initialVerdict,
          request: { recoveryRequestId: "request:retained" },
          supersedesCertificateDigests:
            options.initialSupersedesCertificateDigests ?? [],
          failureCode:
            options.initialStage === "blocked"
              ? "retained_recovery_blocked"
              : null,
        },
        stateDigest: digest("2"),
      })
    : state();
  let runCalls = 0;
  const calls = { load: 0, submit: 0, run: 0 };
  return {
    calls,
    snapshot() {
      return structuredClone(retained);
    },
    async load() {
      calls.load += 1;
      return structuredClone(retained);
    },
    async submit(input) {
      calls.submit += 1;
      const supersedesCertificateDigests =
        retained.activeIncident?.stage === "blocked"
          ? [
              retained.activeIncident.verdict.certificateDigest,
              ...retained.activeIncident.supersedesCertificateDigests,
            ]
          : [];
      retained = state({
        activeIncident: {
          stage: "certified",
          verdict: input.verdict,
          request: input.request,
          supersedesCertificateDigests,
          failureCode: null,
        },
        completedCertificateDigests: retained.completedCertificateDigests,
        supersededCertificates: retained.supersededCertificates,
        stateDigest: digest("2"),
      });
      return structuredClone(retained);
    },
    async runToTerminal() {
      calls.run += 1;
      runCalls += 1;
      const completes = runCalls >= (options.completeAfterRuns ?? 1);
      const certificateDigest =
        retained.activeIncident.verdict.certificateDigest;
      const supersededCertificateDigests =
        retained.activeIncident.supersedesCertificateDigests;
      retained = state({
        activeIncident: {
          ...retained.activeIncident,
          stage: completes ? "completed" : "excluded",
        },
        completedCertificateDigests: completes
          ? [
              ...new Set([
                ...retained.completedCertificateDigests,
                certificateDigest,
              ]),
            ]
          : retained.completedCertificateDigests,
        supersededCertificates:
          completes && supersededCertificateDigests.length > 0
            ? [
                ...retained.supersededCertificates,
                ...supersededCertificateDigests.map(
                  (supersededCertificateDigest) => ({
                    supersededCertificateDigest,
                    supersedingCertificateDigest: certificateDigest,
                  }),
                ),
              ]
            : retained.supersededCertificates,
        stateDigest: completes ? digest("4") : digest("3"),
      });
      return structuredClone(retained);
    },
    async gateExecution() {
      return { allowed: true, reasonCode: "current_fence" };
    },
  };
}

function sourceFor(deliveredVerdict = verdict) {
  let pending = true;
  const acknowledgements = [];
  return {
    acknowledgements,
    replay() {
      pending = true;
    },
    async pull(input) {
      assert.equal(input.scope.tenantId, coordinatorScope.tenantId);
      return {
        verdicts: pending ? [deliveredVerdict] : [],
        hasMore: false,
      };
    },
    async acknowledge(input) {
      acknowledgements.push(input);
      pending = false;
    },
  };
}

function coordinatorStore() {
  let retained = null;
  return {
    async load() {
      return retained ? structuredClone(retained) : null;
    },
    async save(input) {
      if (
        (retained?.revision ?? null) !== input.expectedRevision ||
        (retained?.stateDigest ?? null) !== input.expectedStateDigest
      )
        return false;
      retained = structuredClone(input.state);
      return true;
    },
  };
}

function supervisor({
  recovery,
  source,
  planner,
  maximumScopes = 4,
  scopeAdmission = {
    async admit() {
      return true;
    },
  },
  store = coordinatorStore(),
  Runtime = AutonomousCompromiseRecoveryRuntimeV1,
}) {
  return new Runtime({
    consumerId: "recovery-consumer:1",
    scope: coordinatorScope,
    verdictSource: source,
    requestPlanner: planner,
    runtimes: {
      async resolve(input) {
        assert.deepEqual(input.scope, scope);
        return recovery;
      },
    },
    scopeAdmission,
    coordinatorStore: store,
    coordinatorStateKey: "recovery-coordinator:1",
    policy: {
      policyDigest: digest("9"),
      maximumCertificatesPerTick: 4,
      maximumSagaStepsPerIncident: 8,
      maximumScopes,
      maximumCommitAttempts: 4,
    },
  });
}

test("autonomous recovery completes, acknowledges, and requires a clean tick", async () => {
  const recovery = fakeRecovery();
  const source = sourceFor();
  let planningCalls = 0;
  const coordinator = supervisor({
    recovery,
    source,
    planner: {
      async deriveRequest() {
        planningCalls += 1;
        return { recoveryRequestId: "request:1" };
      },
    },
  });

  const recovered = await coordinator.tick({ logicalTimeMs: 10 });
  assert.equal(recovered.status, "recovered");
  assert.equal(recovered.nodeProgressAllowed, false);
  assert.equal(source.acknowledgements.length, 1);
  assert.deepEqual(recovery.calls, { load: 1, submit: 1, run: 1 });
  assert.equal(planningCalls, 1);

  const clean = await coordinator.tick({ logicalTimeMs: 11 });
  assert.equal(clean.status, "ready");
  assert.equal(clean.nodeProgressAllowed, true);

  source.replay();
  const replay = await coordinator.tick({ logicalTimeMs: 12 });
  assert.equal(replay.status, "recovered");
  assert.equal(replay.nodeProgressAllowed, false);
  assert.equal(source.acknowledgements.length, 2);
  assert.deepEqual(recovery.calls, { load: 2, submit: 1, run: 1 });
  assert.equal(planningCalls, 1);
});

test("autonomous recovery leaves a verdict unacknowledged without an authoritative request", async () => {
  const recovery = fakeRecovery();
  const source = sourceFor();
  let planningCalls = 0;
  const coordinator = supervisor({
    recovery,
    source,
    planner: {
      async deriveRequest() {
        planningCalls += 1;
        return null;
      },
    },
  });

  const first = await coordinator.tick({ logicalTimeMs: 10 });
  const second = await coordinator.tick({ logicalTimeMs: 11 });
  assert.equal(first.status, "request_unavailable");
  assert.equal(second.status, "request_unavailable");
  assert.equal(first.nodeProgressAllowed, false);
  assert.equal(source.acknowledgements.length, 0);
  assert.deepEqual(recovery.calls, { load: 2, submit: 0, run: 0 });
  assert.equal(planningCalls, 2);
});

test("autonomous recovery resumes an incomplete durable saga without replanning", async () => {
  const recovery = fakeRecovery({ completeAfterRuns: 2 });
  const source = sourceFor();
  let planningCalls = 0;
  const coordinator = supervisor({
    recovery,
    source,
    planner: {
      async deriveRequest() {
        planningCalls += 1;
        return { recoveryRequestId: "request:1" };
      },
    },
  });

  const pending = await coordinator.tick({ logicalTimeMs: 10 });
  assert.equal(pending.status, "in_progress");
  assert.equal(source.acknowledgements.length, 0);
  const recovered = await coordinator.tick({ logicalTimeMs: 11 });
  assert.equal(recovered.status, "recovered");
  assert.equal(recovered.nodeProgressAllowed, false);
  assert.equal(source.acknowledgements.length, 1);
  assert.deepEqual(recovery.calls, { load: 2, submit: 1, run: 2 });
  assert.equal(planningCalls, 1);
});

test("autonomous recovery advances a retained incident before an out-of-order delivery", async () => {
  const retainedVerdict = Object.freeze({
    scope,
    certificateDigest: digest("f"),
  });
  const recovery = fakeRecovery({ initialVerdict: retainedVerdict });
  const source = sourceFor(verdict);
  let planningCalls = 0;
  const coordinator = supervisor({
    recovery,
    source,
    planner: {
      async deriveRequest() {
        planningCalls += 1;
        return { recoveryRequestId: "request:delivered" };
      },
    },
  });

  const result = await coordinator.tick({ logicalTimeMs: 10 });
  assert.equal(result.status, "recovered");
  assert.equal(result.nodeProgressAllowed, false);
  assert.deepEqual(
    source.acknowledgements.map((item) => item.certificateDigest),
    [retainedVerdict.certificateDigest, verdict.certificateDigest],
  );
  assert.deepEqual(recovery.calls, { load: 1, submit: 1, run: 2 });
  assert.equal(planningCalls, 1);
});

test("a new certificate may supersede a blocked incident for the same scope", async () => {
  const blockedVerdict = Object.freeze({
    scope,
    certificateDigest: digest("8"),
  });
  const recovery = fakeRecovery({
    initialVerdict: blockedVerdict,
    initialStage: "blocked",
  });
  const source = sourceFor(verdict);
  const durableCoordinator = coordinatorStore();
  let planningCalls = 0;
  const coordinator = supervisor({
    recovery,
    source,
    store: durableCoordinator,
    planner: {
      async deriveRequest() {
        planningCalls += 1;
        return { recoveryRequestId: "request:superseding" };
      },
    },
  });

  const recovered = await coordinator.tick({ logicalTimeMs: 10 });
  assert.equal(recovered.status, "recovered");
  assert.equal(recovered.nodeProgressAllowed, false);
  assert.deepEqual(
    source.acknowledgements.map((item) => item.certificateDigest),
    [verdict.certificateDigest],
  );
  assert.deepEqual(recovery.calls, { load: 1, submit: 1, run: 1 });
  assert.equal(planningCalls, 1);

  // Simulate a process restart after B is terminal but before the older A was
  // acknowledged by its at-least-once inbox.
  const supersededSource = sourceFor(blockedVerdict);
  const restarted = supervisor({
    recovery,
    source: supersededSource,
    store: durableCoordinator,
    planner: {
      async deriveRequest() {
        throw new Error("superseded recovery must not be replanned");
      },
    },
  });
  const replay = await restarted.tick({ logicalTimeMs: 11 });
  assert.equal(replay.status, "recovered");
  assert.equal(replay.nodeProgressAllowed, false);
  assert.deepEqual(
    supersededSource.acknowledgements.map((item) => item.certificateDigest),
    [blockedVerdict.certificateDigest],
  );
  assert.deepEqual(recovery.calls, { load: 2, submit: 1, run: 1 });
  assert.equal(planningCalls, 1);
});

test("a blocked supersession chain ignores ancestor redelivery before advancing to a new successor", async () => {
  const ancestorVerdict = Object.freeze({
    scope,
    certificateDigest: digest("6"),
  });
  const blockedSuccessorVerdict = Object.freeze({
    scope,
    certificateDigest: digest("7"),
  });
  const terminalSuccessorVerdict = Object.freeze({
    scope,
    certificateDigest: digest("c"),
  });
  const recovery = fakeRecovery({
    initialVerdict: blockedSuccessorVerdict,
    initialStage: "blocked",
    initialSupersedesCertificateDigests: [ancestorVerdict.certificateDigest],
  });
  const durableCoordinator = coordinatorStore();
  const ancestorSource = sourceFor(ancestorVerdict);
  let planningCalls = 0;
  const blockedCoordinator = supervisor({
    recovery,
    source: ancestorSource,
    store: durableCoordinator,
    planner: {
      async deriveRequest() {
        planningCalls += 1;
        return { recoveryRequestId: "request:must-not-run" };
      },
    },
  });
  const retainedBeforeRedelivery = recovery.snapshot();

  const blocked = await blockedCoordinator.tick({ logicalTimeMs: 10 });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.reasonCode, "superseding_recovery_blocked");
  assert.equal(blocked.nodeProgressAllowed, false);
  assert.equal(ancestorSource.acknowledgements.length, 0);
  assert.deepEqual(recovery.calls, { load: 1, submit: 0, run: 0 });
  assert.equal(planningCalls, 0);
  assert.deepEqual(recovery.snapshot(), retainedBeforeRedelivery);

  const successorSource = sourceFor(terminalSuccessorVerdict);
  const successorCoordinator = supervisor({
    recovery,
    source: successorSource,
    store: durableCoordinator,
    planner: {
      async deriveRequest() {
        planningCalls += 1;
        return { recoveryRequestId: "request:terminal-successor" };
      },
    },
  });
  const recovered = await successorCoordinator.tick({ logicalTimeMs: 11 });
  assert.equal(recovered.status, "recovered");
  assert.equal(recovered.nodeProgressAllowed, false);
  assert.deepEqual(recovery.calls, { load: 2, submit: 1, run: 1 });
  assert.equal(planningCalls, 1);
  assert.deepEqual(recovery.snapshot().supersededCertificates, [
    {
      supersededCertificateDigest: blockedSuccessorVerdict.certificateDigest,
      supersedingCertificateDigest: terminalSuccessorVerdict.certificateDigest,
    },
    {
      supersededCertificateDigest: ancestorVerdict.certificateDigest,
      supersedingCertificateDigest: terminalSuccessorVerdict.certificateDigest,
    },
  ]);
});

test("durable coordinator state rejects logical-time rollback before inbox pull", async () => {
  const recovery = fakeRecovery();
  let pulls = 0;
  const coordinator = supervisor({
    recovery,
    source: {
      async pull() {
        pulls += 1;
        return { verdicts: [], hasMore: false };
      },
      async acknowledge() {},
    },
    planner: {
      async deriveRequest() {
        return null;
      },
    },
  });

  assert.equal(
    (await coordinator.tick({ logicalTimeMs: 10 })).nodeProgressAllowed,
    true,
  );
  await assert.rejects(
    coordinator.tick({ logicalTimeMs: 9 }),
    /logical time regressed/,
  );
  assert.equal(pulls, 1);
});

test("durable scope capacity fails closed before resolving an unknown scope", async () => {
  const recovery = fakeRecovery();
  const secondScope = Object.freeze({ ...scope, workItemId: "work:second" });
  let delivered = verdict;
  let resolves = 0;
  const coordinator = new AutonomousCompromiseRecoveryRuntimeV1({
    consumerId: "recovery-consumer:capacity",
    scope: coordinatorScope,
    verdictSource: {
      async pull() {
        return { verdicts: [delivered], hasMore: false };
      },
      async acknowledge() {},
    },
    requestPlanner: {
      async deriveRequest() {
        return null;
      },
    },
    runtimes: {
      async resolve() {
        resolves += 1;
        return recovery;
      },
    },
    scopeAdmission: {
      async admit() {
        return true;
      },
    },
    coordinatorStore: coordinatorStore(),
    coordinatorStateKey: "recovery-coordinator:capacity",
    policy: {
      policyDigest: digest("9"),
      maximumCertificatesPerTick: 1,
      maximumSagaStepsPerIncident: 1,
      maximumScopes: 1,
      maximumCommitAttempts: 2,
    },
  });

  assert.equal(
    (await coordinator.tick({ logicalTimeMs: 10 })).status,
    "request_unavailable",
  );
  delivered = Object.freeze({
    scope: secondScope,
    certificateDigest: digest("b"),
  });
  const exhausted = await coordinator.tick({ logicalTimeMs: 11 });
  assert.equal(exhausted.status, "scope_capacity_exhausted");
  assert.equal(exhausted.nodeProgressAllowed, false);
  assert.equal(resolves, 1);
});

function countedNode() {
  const calls = {
    initialize: 0,
    loadOptional: 0,
    load: 0,
    submitMission: 0,
    receive: 0,
    advance: 0,
  };
  return {
    calls,
    node: {
      async initialize() {
        calls.initialize += 1;
        return {};
      },
      async loadOptional() {
        calls.loadOptional += 1;
        return null;
      },
      async load() {
        calls.load += 1;
        return { stateDigest: digest("b") };
      },
      async submitMission() {
        calls.submitMission += 1;
        return {};
      },
      async receive() {
        calls.receive += 1;
        return {};
      },
      async advance() {
        calls.advance += 1;
        return {};
      },
    },
  };
}

function structuralLifecycleFor(membershipDigest = digest("6")) {
  return {
    options: {
      registry: {
        current() {
          return {
            tenantId: coordinatorScope.tenantId,
            meshId: coordinatorScope.meshId,
            configurationDigest: membershipDigest,
            epoch: 1,
          };
        },
      },
    },
    async eligibility() {
      return { eligible: true };
    },
    async retirePeer() {
      return {
        retired: true,
        peerId: "peer:subject",
        membershipConfigurationDigest: digest("8"),
        membershipEpoch: 2,
        retirementDigest: digest("7"),
        retiredAtLogicalMs: 10,
      };
    },
  };
}

function lifecycleFor(membershipDigest = digest("6")) {
  const structural = structuralLifecycleFor(membershipDigest);
  const lineage = new GovernedAgentLineageRuntimeV1({
    stateKey: "lineage:reference-stack",
    policy: {
      schemaVersion: 1,
      policyId: "policy:reference-stack",
      policyVersion: 1,
      maximumGeneration: 4,
      maximumChildrenPerAgent: 4,
      maximumActiveDescendants: 8,
      maximumResourceUnitsPerChild: 100,
      maximumInteractionUnitsPerChild: 100,
      allowedAdapterIds: ["adapter:reference-stack"],
      permittedCapabilityKeys: ["capability:reference-stack"],
      requireRulePolicyInheritance: true,
      requireAuthorityAttenuation: true,
      requestTtlLogicalMs: 100,
      maximumCommitAttempts: 4,
      policyDigest: digest("5"),
    },
    store: new InMemoryAgentLineageStoreV1(),
    factory: {
      factoryId: "factory:reference-stack",
      factoryVersion: 1,
      factoryImplementationDigest: digest("4"),
      async create() {
        throw new Error("not used by reference stack binding tests");
      },
      async terminate() {
        throw new Error("not used by reference stack binding tests");
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
        throw new Error("not used by reference stack binding tests");
      },
      async remove() {
        throw new Error("not used by reference stack binding tests");
      },
    },
  });
  return new GovernedAgentLifecycleRuntimeV1({
    lineage,
    registry: structural.options.registry,
  });
}

function operationalController() {
  const observer = (kind) => ({
    observerId: `observer:${kind}`,
    observerVersion: 1,
    observerImplementationDigest: digest("3"),
    kind,
    async observe() {
      return {
        valueBasisPoints: 9_000,
        evidenceDigests: [],
        reasonCodes: [],
      };
    },
  });
  const roleReinforcement = "Follow the governed mission role.";
  const semantic = semanticGuaranteePorts();
  return new OperationalCognitiveControllerV1({
    controlId: "control:reference-stack",
    mode: "black_box",
    guaranteeStateKey: "guarantee:reference-stack",
    blackBoxPolicy: createBlackBoxControlPolicyV1({
      maximumContextTokens: 128,
      maximumContextItems: 8,
      maximumContextItemBytes: 4_096,
      minimumTrustBasisPoints: 5_000,
      maximumRiskBasisPoints: 5_000,
      maximumItemsPerIndependenceGroup: 2,
      allowedToolNames: [],
      protectedZones: ["authority"],
      roleReinforcement,
      roleReinforcementDigest: digestBlackBoxContentV1(roleReinforcement),
    }),
    observers: {
      coherence: observer("coherence"),
      objective: observer("objective_alignment"),
      context: observer("context_conflict"),
      uncertainty: observer("uncertainty"),
    },
    intervention: {
      async gateCheckpoint() {
        throw new Error("not used by reference stack binding tests");
      },
      async gateOperation() {
        throw new Error("not used by reference stack binding tests");
      },
    },
    guarantee: semantic.guarantees,
    horizonControl: semantic.horizon,
    horizonBudgetStore: new InMemorySemanticHorizonBudgetStoreV1(),
    horizonBudgetMonotonicAnchor:
      new InMemorySemanticHorizonBudgetMonotonicAnchorV1(),
    horizonBudgetStateKey: "budget:operational:reference-stack",
    inference: {
      async execute() {
        throw new Error("not used by reference stack binding tests");
      },
    },
  });
}

function semanticHorizonCoupling() {
  return new AnytimeSemanticHorizonCouplingV1(semanticGuaranteePorts());
}

function semanticGuaranteePorts() {
  const metric = (direction) => ({
    direction,
    errorBudgetPpm: 10_000,
    missingness: "worst_case_imputation",
  });
  const policy = createAnytimeSemanticGuaranteePolicyV1({
    policyId: "guarantee:recovery-reference",
    familywiseErrorBudgetPpm: 60_000,
    minimumInferenceSamples: 1,
    metrics: {
      roleCoherence: metric("higher_is_better"),
      missionAlignment: metric("higher_is_better"),
      contextConflict: metric("lower_is_better"),
      uncertainty: metric("lower_is_better"),
      courseActionDiversity: metric("higher_is_better"),
      courseActionNovelty: metric("higher_is_better"),
    },
    assumptions: { assumptionEvidenceDigests: [] },
  });
  const horizonPolicy = createSemanticHorizonControlPolicyV1({
    expectedGuaranteePolicyDigest: policy.policyDigest,
    expectedAssumptionsDigest: policy.assumptions.assumptionsDigest,
    nominalHorizonSteps: 8,
    cautionHorizonSteps: 2,
    replanHorizonSteps: 1,
    thresholds: Object.fromEntries(
      [
        "roleCoherence",
        "missionAlignment",
        "contextConflict",
        "uncertainty",
        "courseActionDiversity",
        "courseActionNovelty",
      ].map((name) => [name, { thresholdBasisPoints: 5_000, enabled: false }]),
    ),
  });
  return {
    guarantees: new AnytimeSemanticGuaranteeEngineV1({ policy }),
    horizon: createSemanticHorizonControlV1(horizonPolicy),
  };
}

function assignmentAuthority() {
  return {
    async install() {
      return {
        assignmentEpoch: 2,
        fencingToken: "fence:2",
        installedAtLogicalMs: 10,
      };
    },
    async resolve() {
      return null;
    },
    async reconcile() {
      return null;
    },
    async commit() {
      throw new Error("not used by binding test");
    },
  };
}

function boundSupervisor(
  lifecycle,
  authority,
  supervisorScope = coordinatorScope,
) {
  const registry = new BoundedLifecycleCompromiseRecoveryRuntimeRegistryV1({
    lifecycle,
    assignmentAuthority: authority,
    maximumScopes: 1,
    entries: [
      {
        stateKey: "bound-recovery:state",
        anchorKey: "bound-recovery:anchor",
        scope,
        policy: {
          schemaVersion: 1,
          policyId: "bound-recovery-policy",
          policyVersion: 1,
          policyDigest: digest("5"),
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
  return new AutonomousCompromiseRecoveryRuntimeV1({
    consumerId: "consumer:bound",
    scope: supervisorScope,
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
    runtimes: registry,
    scopeAdmission: registry,
    coordinatorStore: coordinatorStore(),
    coordinatorStateKey: "coordinator:bound",
    policy: {
      policyDigest: digest("4"),
      maximumCertificatesPerTick: 1,
      maximumSagaStepsPerIncident: 4,
      maximumScopes: 1,
      maximumCommitAttempts: 2,
    },
  });
}

function minimalIntegratedOptions({ lifecycle, recovery, authority }) {
  const membershipDigest =
    governedAgentLifecycleRegistryV1(lifecycle).current().configurationDigest;
  const governedRoles = new GovernedRoleCatalogRuntimeV2({
    catalogId: "catalog:reference-roles",
    missionId: coordinatorScope.missionIntentId,
    authorityDigest: digest("6"),
    certification: {
      async verify() {
        return true;
      },
    },
  });
  return {
    protocol: {
      membershipConfigurationDigest: membershipDigest,
      localPeerId: "peer:local",
      localInstanceId: "instance:local",
    },
    finality: { membership: { configurationDigest: membershipDigest } },
    local: {
      catalog: {
        tenantId: coordinatorScope.tenantId,
        membershipConfigurationDigest: membershipDigest,
        localPeerId: "peer:local",
        localInstanceId: "instance:local",
      },
      lifecycle,
      governedRoleCatalog: governedRoles,
    },
    execution: {
      operationalControl: operationalController(),
      semanticGuarantees: new SequentialSemanticGuaranteeEngineV1(8),
      semanticHorizon: semanticHorizonCoupling(),
      semanticStateKey: "semantic:reference-stack",
      semanticHorizonBudgetStore: new InMemorySemanticHorizonBudgetStoreV1(),
      semanticHorizonBudgetMonotonicAnchor:
        new InMemorySemanticHorizonBudgetMonotonicAnchorV1(),
      semanticHorizonBudgetStateKey: "budget:effects:reference-stack",
    },
    adaptation: { missionId: coordinatorScope.missionIntentId },
    recovery,
    recoveryAssignmentAuthority: authority,
  };
}

async function completeIntegratedOptions({ lifecycle, recovery, authority }) {
  const base = minimalIntegratedOptions({ lifecycle, recovery, authority });
  const semanticAcceptance = await semanticAcceptancePolicy();
  const telemetryPolicy = await createCollectiveTelemetryPolicyV1({
    schemaVersion: 1,
    policyId: "policy:reference-stack-test",
    policyVersion: 1,
    allowedMetricKeys: [],
    maximumEvidenceDigestsPerEvent: 16,
    maximumMetricsPerEvent: 0,
    maximumRetainedEvents: 16,
    maximumCommitAttempts: 4,
  });
  const telemetryRuntime = new CollectiveTelemetryRuntimeV1({
    streamId: "stream:reference-stack-test",
    anchorKey: "anchor:reference-stack-test",
    tenantId: coordinatorScope.tenantId,
    collectiveId: coordinatorScope.meshId,
    policy: telemetryPolicy,
    authenticity: {
      peerId: "peer:local",
      instanceId: "instance:local",
      keyId: "key:reference-stack",
      async sign(value) {
        return `signed:${value}`;
      },
      async verify(input) {
        return input.signature === `signed:${input.messageDigest}`;
      },
    },
    monotonicAnchor: new InMemoryCollectiveTelemetryMonotonicAnchorV1(),
  });
  await telemetryRuntime.initialize(0);
  const telemetry = new CollectiveHostTelemetryAdapterV1(telemetryRuntime);
  const plane = {
    async publish() {
      throw new Error("not used by reference stack identity tests");
    },
  };
  const artifacts = new InMemoryDistributedCollectiveArtifactStoreV1();
  const membershipDigest = base.protocol.membershipConfigurationDigest;
  const catalog = {
    schemaVersion: 1,
    catalogId: "catalog:reference-stack",
    catalogVersion: 1,
    tenantId: coordinatorScope.tenantId,
    localPeerId: base.protocol.localPeerId,
    localInstanceId: base.protocol.localInstanceId,
    membershipConfigurationDigest: membershipDigest,
    issuerId: "issuer:reference-stack",
    issuerKeyDigest: digest("7"),
    independenceGroupId: "group:reference-stack",
    bidNonceSeed: "reference-stack-test-seed",
    bidValidityMs: 100,
    credibilityStateDigest: digest("8"),
    credibilityScoreBasisPoints: 9_000,
    credibilityUncertaintyBasisPoints: 100,
    collusionPressureBasisPoints: 0,
    entries: [],
    catalogDigest: digest("9"),
  };
  const domains = ["mission", "strategy", "role", "team"];
  return {
    options: {
      ...base,
      protocol: {
        ...base.protocol,
        protocolId: "protocol:reference-stack",
        scopeDigest: digest("a"),
        plane,
        artifacts,
        authenticity: {
          localKeyId: "key:reference-stack",
          async sign() {
            return "signature:reference-stack";
          },
          async verify() {
            return true;
          },
        },
        membership: {
          async verifyPeer() {
            return true;
          },
          async resolveIndependenceGroup() {
            return "group:reference-stack";
          },
        },
      },
      planning: {
        decompositionPolicy: createDistributedDecompositionPolicyV1({
          schemaVersion: 1,
          policyId: "decomposition:reference-stack",
          policyVersion: 1,
          maximumTasks: 16,
          maximumDepth: 4,
          maximumDependenciesPerTask: 4,
          maximumBudgetUnits: 1_000,
          minimumProposalConfidenceBasisPoints: 0,
          templates: [],
        }),
        allocationPolicy: strategicAllocationPolicy(),
      },
      local: { ...base.local, catalog },
      finality: {
        membership: {
          schemaVersion: 2,
          epoch: 1,
          configurationDigest: membershipDigest,
          selectionSeedDigest: digest("b"),
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
        gateway: declareRestartDurableSparseBftFinalityGatewayV1({
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
      execution: {
        ...base.execution,
        semanticGuarantees: new SequentialSemanticGuaranteeEngineV1(8),
        semanticAcceptance,
        semanticAssessment: {
          async assess() {
            throw new Error("not used by reference stack identity tests");
          },
        },
        effects: {
          async prepare() {
            throw new Error("not used by reference stack identity tests");
          },
          async commit() {
            throw new Error("not used by reference stack identity tests");
          },
        },
        store: new InMemoryAssuranceCoupledExecutionStoreV1(),
        telemetry,
      },
      adaptation: {
        ...base.adaptation,
        runtimeId: "adaptation:reference-stack",
        policy: {
          schemaVersion: 1,
          policyId: "adaptation-policy:reference-stack",
          policyVersion: 1,
          minimumSeverityBasisPoints: 0,
          minimumConfidenceBasisPoints: 0,
          minimumIndependentSources: 1,
          observationWindowMs: 100,
          domainCooldownMs: Object.fromEntries(
            domains.map((domain) => [domain, 0]),
          ),
          maximumActionsPerCycle: 4,
          maximumEvidenceDigestsPerSignal: 16,
          maximumRetainedSignals: 16,
          maximumRetainedDecisions: 16,
          maximumCommitAttempts: 2,
          policyDigest: digest("c"),
        },
        planners: domains.map((domain) => ({
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
            throw new Error("not used by reference stack identity tests");
          },
          async reconcileRollback() {
            return null;
          },
          async rollback() {
            throw new Error("not used by reference stack identity tests");
          },
        },
        store: declareRestartDurableAutonomousAdaptationStoreV1(
          new InMemoryAutonomousAdaptationStoreV1(),
        ),
        invariants: {
          maximumRiskBasisPoints: 1_000,
          allowedDomains: domains,
          allowedAuthorityCeilingDigests: [digest("d")],
        },
      },
      node: {
        runtimeId: "node:reference-stack",
        policy: {
          schemaVersion: 1,
          graphProposalWindowMs: 10,
          bidCommitmentWindowMs: 10,
          bidRevealWindowMs: 10,
          messageLifetimeMs: 100,
          maximumLocalBids: 4,
          maximumAdmittedEvidenceMessages: 16,
        },
        store: new InMemoryAutonomousCollectiveNodeStoreV1(),
        telemetry,
      },
    },
    plane,
    artifacts,
  };
}

test("reference facade invokes no node mutation while recovery input is unresolved", async () => {
  const membershipDigest = digest("c");
  for (const status of [
    "runtime_unavailable",
    "request_unavailable",
    "in_progress",
    "recovered",
  ]) {
    for (const invoke of [
      (node) => node.initialize(10),
      (node) => node.submitMission({ logicalTimeMs: 10 }),
      (node) => node.receive({ updateId: "update:1" }, 10),
      (node) => node.advance({ logicalTimeMs: 10 }),
    ]) {
      const counted = countedNode();
      const recovery = supervisor({
        recovery:
          status === "runtime_unavailable"
            ? null
            : fakeRecovery({
                completeAfterRuns: status === "in_progress" ? 2 : 1,
              }),
        source: sourceFor(),
        planner: {
          async deriveRequest() {
            return status === "request_unavailable"
              ? null
              : { recoveryRequestId: `request:${status}` };
          },
        },
      });
      recovery.requireNodeProgress = async () => ({
        status: "ready",
        nodeProgressAllowed: true,
      });
      const node = createReferenceRecoveryGatedNodeFacadeV1({
        node: counted.node,
        recovery,
        expectedMembershipConfigurationDigest: membershipDigest,
        currentMembership: () => ({
          configurationDigest: membershipDigest,
          epoch: 1,
        }),
      });

      await assert.rejects(
        invoke(node),
        (error) => error.result.status === status,
      );
      assert.deepEqual(counted.calls, {
        initialize: 0,
        loadOptional: 0,
        load: 0,
        submitMission: 0,
        receive: 0,
        advance: 0,
      });
    }
  }
});

test("reference facade blocks receive after recovery rotates membership", async () => {
  const counted = countedNode();
  const expected = digest("d");
  const recovery = supervisor({
    recovery: fakeRecovery(),
    source: {
      async pull() {
        return { verdicts: [], hasMore: false };
      },
      async acknowledge() {},
    },
    planner: {
      async deriveRequest() {
        return null;
      },
    },
  });
  const node = createReferenceRecoveryGatedNodeFacadeV1({
    node: counted.node,
    recovery,
    expectedMembershipConfigurationDigest: expected,
    currentMembership: () => ({
      configurationDigest: digest("e"),
      epoch: 2,
    }),
  });

  await assert.rejects(
    node.receive({ updateId: "update:1" }, 12),
    ReferenceCollectiveMembershipGenerationChangedErrorV1,
  );
  assert.equal(counted.calls.receive, 0);
});

test("reference recovery facades reject impostors and ignore patched progress gates", async () => {
  const membershipDigest = digest("f");
  const recovery = supervisor({
    recovery: fakeRecovery(),
    source: sourceFor(),
    planner: {
      async deriveRequest() {
        return { recoveryRequestId: "request:currentness" };
      },
    },
  });
  let patchedTicks = 0;
  recovery.tick = async () => {
    patchedTicks += 1;
    return { status: "ready", nodeProgressAllowed: true };
  };
  const currentness = createReferenceRecoveryAwareCurrentnessV1({
    delegate: {
      async verify() {
        return true;
      },
    },
    recovery,
    expectedMembershipConfigurationDigest: membershipDigest,
    currentMembership: () => ({
      configurationDigest: membershipDigest,
      epoch: 1,
    }),
  });
  assert.equal(await currentness.verify({ logicalTimeMs: 10 }), false);
  assert.equal(patchedTicks, 0);

  const prototypeOnly = Object.create(
    AutonomousCompromiseRecoveryRuntimeV1.prototype,
  );
  const structural = {
    scope: coordinatorScope,
    async tick() {
      return { status: "ready", nodeProgressAllowed: true };
    },
    async requireNodeProgress() {
      return { status: "ready", nodeProgressAllowed: true };
    },
    async gateExecution() {
      return { allowed: true, reasonCode: "structural" };
    },
  };
  const counted = countedNode();
  for (const impostor of [prototypeOnly, structural]) {
    assert.throws(
      () =>
        createReferenceRecoveryGatedNodeFacadeV1({
          node: counted.node,
          recovery: impostor,
          expectedMembershipConfigurationDigest: membershipDigest,
          currentMembership: () => ({
            configurationDigest: membershipDigest,
            epoch: 1,
          }),
        }),
      /autonomous compromise recovery supervisor is required/u,
    );
    assert.throws(
      () =>
        createReferenceRecoveryAwareCurrentnessV1({
          delegate: {
            async verify() {
              return true;
            },
          },
          recovery: impostor,
          expectedMembershipConfigurationDigest: membershipDigest,
          currentMembership: () => ({
            configurationDigest: membershipDigest,
            epoch: 1,
          }),
        }),
      /autonomous compromise recovery supervisor is required/u,
    );
    assert.throws(
      () =>
        createReferenceRecoveryExecutionAuthorityV1({
          recovery: impostor,
          assignmentAuthority: assignmentAuthority(),
          expectedMembershipConfigurationDigest: membershipDigest,
          currentMembership: () => ({
            configurationDigest: membershipDigest,
            epoch: 1,
          }),
        }),
      /autonomous compromise recovery supervisor is required/u,
    );
  }
});

test("execution authority rejects a fence from another planning objective", async () => {
  const currentness = {
    executionId: "execution:1",
    localPeerId: "peer:local",
    localInstanceId: "instance:local",
    graphDigest: digest("1"),
    allocationPlanDigest: digest("2"),
    awardDigest: digest("3"),
    task: { taskId: scope.workItemId, taskDigest: digest("4") },
    planningDecisionDigest: digest("5"),
    planningFinalityCertificateDigest: digest("6"),
    cognitiveRequest: {
      tenantId: scope.tenantId,
      payload: {
        missionIntentId: scope.missionIntentId,
        planningCycleId: scope.objectiveId,
      },
    },
    logicalTimeMs: 10,
  };
  const crossObjective = await createAssuranceExecutionAuthorityFenceV1({
    schemaVersion: 1,
    scope: { ...scope, objectiveId: "objective:other" },
    executionId: currentness.executionId,
    awardDigest: currentness.awardDigest,
    taskDigest: currentness.task.taskDigest,
    assignedPeerId: currentness.localPeerId,
    assignmentEpoch: 1,
    fencingToken: "fence:1",
    membershipConfigurationDigest: digest("7"),
    membershipEpoch: 1,
  });

  await assert.rejects(
    validateExecutionAuthorityFenceV1({
      fence: crossObjective,
      currentness,
    }),
    /authority fence binding is invalid/,
  );
});

test("execution authority re-drains recovery immediately before atomic commit", async () => {
  const membershipDigest = digest("8");
  let recoveryCalls = 0;
  let commitCalls = 0;
  let reconcileCalls = 0;
  const reconciledReceipt = { receiptDigest: digest("a") };
  const fence = await createAssuranceExecutionAuthorityFenceV1({
    schemaVersion: 1,
    scope,
    executionId: "execution:race",
    awardDigest: digest("1"),
    taskDigest: digest("2"),
    assignedPeerId: "peer:local",
    assignmentEpoch: 1,
    fencingToken: "fence:1",
    membershipConfigurationDigest: membershipDigest,
    membershipEpoch: 1,
  });
  const assignment = {
    async install() {
      return {};
    },
    async resolve() {
      return fence;
    },
    async reconcile() {
      reconcileCalls += 1;
      return reconciledReceipt;
    },
    async commit() {
      commitCalls += 1;
      return {};
    },
  };
  const recovery = supervisor({
    recovery: fakeRecovery({ completeAfterRuns: 2 }),
    source: {
      async pull() {
        recoveryCalls += 1;
        return {
          verdicts: recoveryCalls === 1 ? [] : [verdict],
          hasMore: false,
        };
      },
      async acknowledge() {},
    },
    planner: {
      async deriveRequest() {
        return { recoveryRequestId: "request:commit-race" };
      },
    },
  });
  recovery.requireNodeProgress = async () => ({
    status: "ready",
    nodeProgressAllowed: true,
  });
  recovery.gateExecution = async () => ({
    allowed: false,
    reasonCode: "monkey_patch",
  });
  Object.defineProperty(recovery, "scope", {
    value: { ...coordinatorScope, missionIntentId: "mission:mutated" },
    configurable: true,
  });
  const authority = createReferenceRecoveryExecutionAuthorityV1({
    recovery,
    assignmentAuthority: assignment,
    expectedMembershipConfigurationDigest: membershipDigest,
    currentMembership: () => ({
      configurationDigest: membershipDigest,
      epoch: 1,
    }),
  });
  let replacementResolveCalls = 0;
  let replacementReconcileCalls = 0;
  let replacementCommitCalls = 0;
  assignment.resolve = async () => {
    replacementResolveCalls += 1;
    return null;
  };
  assignment.commit = async () => {
    replacementCommitCalls += 1;
    return {};
  };
  assignment.reconcile = async () => {
    replacementReconcileCalls += 1;
    return null;
  };
  const currentness = {
    executionId: fence.executionId,
    localPeerId: fence.assignedPeerId,
    localInstanceId: "instance:local",
    graphDigest: digest("3"),
    allocationPlanDigest: digest("4"),
    awardDigest: fence.awardDigest,
    task: { taskId: scope.workItemId, taskDigest: fence.taskDigest },
    planningDecisionDigest: digest("5"),
    planningFinalityCertificateDigest: digest("6"),
    cognitiveRequest: {
      tenantId: scope.tenantId,
      payload: {
        missionIntentId: scope.missionIntentId,
        planningCycleId: scope.objectiveId,
      },
    },
    logicalTimeMs: 10,
  };
  const resolved = await authority.resolve(currentness);
  assert.equal(resolved?.authorityDigest, fence.authorityDigest);
  await assert.rejects(
    authority.commit({
      executionId: fence.executionId,
      effect: {},
      certificate: {},
      authorityFence: fence,
      logicalTimeMs: 10,
      signal: new AbortController().signal,
    }),
    (error) => error.result.status === "in_progress",
  );
  assert.equal(
    await authority.reconcile({
      executionId: fence.executionId,
      effect: {},
      certificate: {},
      authorityFence: fence,
    }),
    reconciledReceipt,
  );
  assert.equal(recoveryCalls, 2);
  assert.equal(commitCalls, 0);
  assert.equal(reconcileCalls, 1);
  assert.equal(replacementResolveCalls, 0);
  assert.equal(replacementReconcileCalls, 0);
  assert.equal(replacementCommitCalls, 0);
});

test("autonomous recovery invokers retain nominal identity across overrides and rebinding", async () => {
  const emptySource = () => ({
    async pull() {
      return { verdicts: [], hasMore: false };
    },
    async acknowledge() {},
  });
  const overrides = {
    lifecycle: 0,
    authority: 0,
    tick: 0,
    progress: 0,
    gate: 0,
  };
  class OverridingRecovery extends AutonomousCompromiseRecoveryRuntimeV1 {
    isBoundToLifecycle() {
      overrides.lifecycle += 1;
      return true;
    }

    isBoundToAssignmentAuthority() {
      overrides.authority += 1;
      return true;
    }

    async tick() {
      overrides.tick += 1;
      throw new Error("subclass recovery tick must not run");
    }

    async requireNodeProgress() {
      overrides.progress += 1;
      throw new Error("subclass recovery progress gate must not run");
    }

    async gateExecution() {
      overrides.gate += 1;
      return { allowed: false, reasonCode: "subclass_override" };
    }
  }
  const subclass = supervisor({
    recovery: fakeRecovery(),
    source: emptySource(),
    planner: {
      async deriveRequest() {
        return null;
      },
    },
    Runtime: OverridingRecovery,
  });
  const first = await invokeAutonomousCompromiseRecoveryTickV1(subclass, {
    logicalTimeMs: 10,
  });
  const second = await invokeAutonomousCompromiseRecoveryRequireNodeProgressV1(
    subclass,
    {
      logicalTimeMs: 11,
    },
  );
  const gate = await invokeAutonomousCompromiseRecoveryGateExecutionV1(
    subclass,
    {
      scope,
      peerId: "peer:local",
      assignmentEpoch: 1,
      fencingToken: "fence:1",
      logicalTimeMs: 12,
    },
  );
  assert.equal(first.nodeProgressAllowed, true);
  assert.equal(second.nodeProgressAllowed, true);
  assert.equal(gate.allowed, true);
  assert.deepEqual(overrides, {
    lifecycle: 0,
    authority: 0,
    tick: 0,
    progress: 0,
    gate: 0,
  });

  const monkeyCalls = { tick: 0, progress: 0, gate: 0 };
  const monkey = supervisor({
    recovery: fakeRecovery(),
    source: emptySource(),
    planner: {
      async deriveRequest() {
        return null;
      },
    },
  });
  monkey.tick = async () => {
    monkeyCalls.tick += 1;
    throw new Error("monkey-patched recovery tick must not run");
  };
  monkey.requireNodeProgress = async () => {
    monkeyCalls.progress += 1;
    throw new Error("monkey-patched recovery progress gate must not run");
  };
  monkey.gateExecution = async () => {
    monkeyCalls.gate += 1;
    return { allowed: false, reasonCode: "monkey_patch" };
  };
  Object.defineProperty(monkey, "scope", {
    value: { ...coordinatorScope, missionIntentId: "mission:mutated" },
    configurable: true,
  });
  assert.equal(
    (
      await invokeAutonomousCompromiseRecoveryTickV1(monkey, {
        logicalTimeMs: 20,
      })
    ).nodeProgressAllowed,
    true,
  );
  assert.equal(
    (
      await invokeAutonomousCompromiseRecoveryRequireNodeProgressV1(monkey, {
        logicalTimeMs: 21,
      })
    ).nodeProgressAllowed,
    true,
  );
  assert.equal(
    (
      await invokeAutonomousCompromiseRecoveryGateExecutionV1(monkey, {
        scope,
        peerId: "peer:local",
        assignmentEpoch: 1,
        fencingToken: "fence:1",
        logicalTimeMs: 22,
      })
    ).allowed,
    true,
  );
  assert.deepEqual(monkeyCalls, { tick: 0, progress: 0, gate: 0 });
  assert.deepEqual(
    autonomousCompromiseRecoveryScopeV1(monkey),
    coordinatorScope,
  );

  const lifecycle = lifecycleFor();
  const authority = assignmentAuthority();
  const bound = boundSupervisor(lifecycle, authority);
  bound.isBoundToLifecycle = () => true;
  bound.isBoundToAssignmentAuthority = () => true;
  assert.equal(
    isAutonomousCompromiseRecoveryBoundToLifecycleV1(bound, lifecycle),
    true,
  );
  assert.equal(
    isAutonomousCompromiseRecoveryBoundToLifecycleV1(bound, lifecycleFor()),
    false,
  );
  assert.equal(
    isAutonomousCompromiseRecoveryBoundToAssignmentAuthorityV1(
      bound,
      authority,
    ),
    true,
  );
  assert.equal(
    isAutonomousCompromiseRecoveryBoundToAssignmentAuthorityV1(
      bound,
      assignmentAuthority(),
    ),
    false,
  );

  const prototypeOnly = Object.create(
    AutonomousCompromiseRecoveryRuntimeV1.prototype,
  );
  const structural = {
    scope: coordinatorScope,
    tick: monkey.tick.bind(monkey),
    requireNodeProgress: monkey.requireNodeProgress.bind(monkey),
    gateExecution: monkey.gateExecution.bind(monkey),
    isBoundToLifecycle: () => true,
    isBoundToAssignmentAuthority: () => true,
  };
  assert.equal(isAutonomousCompromiseRecoveryRuntimeV1(monkey), true);
  assert.equal(isAutonomousCompromiseRecoveryRuntimeV1(prototypeOnly), false);
  assert.equal(isAutonomousCompromiseRecoveryRuntimeV1(structural), false);
  assert.throws(
    () => autonomousCompromiseRecoveryScopeV1(prototypeOnly),
    /concrete autonomous compromise recovery runtime/u,
  );
});

test("autonomous recovery captures registry and saga methods and rejects saga substitution", async () => {
  const original = fakeRecovery();
  const replacement = fakeRecovery();
  let selected = original;
  const registry = {
    async resolve() {
      return selected;
    },
  };
  const admission = {
    async admit() {
      return true;
    },
  };
  const store = coordinatorStore();
  const runtime = new AutonomousCompromiseRecoveryRuntimeV1({
    consumerId: "consumer:capture-test",
    scope: coordinatorScope,
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
    runtimes: registry,
    scopeAdmission: admission,
    coordinatorStore: store,
    coordinatorStateKey: "coordinator:capture-test",
    policy: {
      policyDigest: digest("5"),
      maximumCertificatesPerTick: 1,
      maximumSagaStepsPerIncident: 4,
      maximumScopes: 1,
      maximumCommitAttempts: 2,
    },
  });
  assert.equal(
    hasAutonomousCompromiseRecoveryClosedRegistryPairV1(runtime),
    false,
  );
  assert.equal(
    isBoundedLifecycleCompromiseRecoveryRuntimeRegistryV1(registry),
    false,
  );
  registry.resolve = async () => {
    throw new Error("rebound registry resolve must not run");
  };
  admission.admit = async () => {
    throw new Error("rebound admission must not run");
  };
  store.load = async () => {
    throw new Error("rebound coordinator load must not run");
  };
  store.save = async () => {
    throw new Error("rebound coordinator save must not run");
  };
  const input = {
    scope,
    peerId: "peer:local",
    assignmentEpoch: 1,
    fencingToken: "fence:1",
    logicalTimeMs: 10,
  };
  assert.equal(
    (await invokeAutonomousCompromiseRecoveryGateExecutionV1(runtime, input))
      .allowed,
    true,
  );
  original.gateExecution = async () => {
    throw new Error("monkey-patched retained saga must not run");
  };
  assert.equal(
    (
      await invokeAutonomousCompromiseRecoveryGateExecutionV1(runtime, {
        ...input,
        logicalTimeMs: 11,
      })
    ).allowed,
    true,
  );
  selected = replacement;
  await assert.rejects(
    invokeAutonomousCompromiseRecoveryGateExecutionV1(runtime, {
      ...input,
      logicalTimeMs: 12,
    }),
    /substituted a retained saga/u,
  );

  const lifecycle = lifecycleFor();
  const authority = assignmentAuthority();
  const closed = boundSupervisor(lifecycle, authority);
  assert.equal(
    hasAutonomousCompromiseRecoveryClosedRegistryPairV1(closed),
    true,
  );
});

test("governed role currentness uses nominal catalog identity and captured bindings", async () => {
  const missionId = coordinatorScope.missionIntentId;
  const catalogOptions = {
    catalogId: "catalog:role-currentness",
    missionId,
    authorityDigest: digest("6"),
    certification: {
      async verify() {
        return true;
      },
    },
  };
  const monkeyCalls = { resolve: 0 };
  const catalog = new GovernedRoleCatalogRuntimeV2(catalogOptions);
  await catalog.initialize();
  catalog.resolveActiveRoleBinding = async () => {
    monkeyCalls.resolve += 1;
    throw new Error("monkey-patched role resolution must not run");
  };

  const subclassCalls = { resolve: 0 };
  class OverridingRoleCatalog extends GovernedRoleCatalogRuntimeV2 {
    async resolveActiveRoleBinding() {
      subclassCalls.resolve += 1;
      throw new Error("subclass role resolution must not run");
    }
  }
  const subclassCatalog = new OverridingRoleCatalog({
    ...catalogOptions,
    catalogId: "catalog:role-currentness-subclass",
  });
  await subclassCatalog.initialize();

  const structural = {
    options: catalog.options,
    resolveActiveRoleBinding:
      GovernedRoleCatalogRuntimeV2.prototype.resolveActiveRoleBinding.bind(
        catalog,
      ),
  };
  const prototypeOnly = Object.create(GovernedRoleCatalogRuntimeV2.prototype);
  assert.equal(isGovernedRoleCatalogRuntimeV2(catalog), true);
  assert.equal(isGovernedRoleCatalogRuntimeV2(subclassCatalog), true);
  assert.equal(isGovernedRoleCatalogRuntimeV2(structural), false);
  assert.equal(isGovernedRoleCatalogRuntimeV2(prototypeOnly), false);
  assert.equal(governedRoleCatalogMissionIdV2(catalog), missionId);

  catalogOptions.missionId = "mission:mutated";
  assert.equal(governedRoleCatalogMissionIdV2(catalog), missionId);
  assert.throws(() => {
    catalog.options.missionId = "mission:rebound";
  }, TypeError);
  assert.equal(
    await invokeGovernedRoleCatalogResolveActiveRoleBindingV2(catalog, {
      roleKey: "role:worker",
      agentId: "agent:worker",
      objectiveId: "objective:worker",
      validFromLogicalMs: 10,
      validUntilLogicalMs: 11,
    }),
    null,
  );
  assert.equal(
    await invokeGovernedRoleCatalogResolveActiveRoleBindingV2(subclassCatalog, {
      roleKey: "role:worker",
      agentId: "agent:worker",
      objectiveId: "objective:worker",
      validFromLogicalMs: 10,
      validUntilLogicalMs: 11,
    }),
    null,
  );
  assert.deepEqual(monkeyCalls, { resolve: 0 });
  assert.deepEqual(subclassCalls, { resolve: 0 });

  const currentnessOptions = { catalog };
  const currentness = new GovernedRoleCatalogCurrentnessV1(currentnessOptions);
  currentnessOptions.catalog = structural;
  assert.throws(() => {
    currentness.options.catalog = structural;
  }, TypeError);
  assert.equal(
    await currentness.resolve({
      missionId,
      objectiveId: "objective:worker",
      roleKey: "role:worker",
      agentId: "agent:worker",
      requiredCapabilityKeys: [],
      logicalTimeMs: 10,
    }),
    null,
  );
  assert.deepEqual(monkeyCalls, { resolve: 0 });
  assert.throws(
    () => new GovernedRoleCatalogCurrentnessV1({ catalog: structural }),
    /concrete governed role catalog/u,
  );
  assert.throws(
    () => new GovernedRoleCatalogCurrentnessV1({ catalog: prototypeOnly }),
    /concrete governed role catalog/u,
  );
});

test("reference stack rejects structural lifecycle and cognitive-controller impostors", () => {
  const lifecycle = lifecycleFor();
  const authority = assignmentAuthority();
  const recovery = boundSupervisor(lifecycle, authority);
  const options = minimalIntegratedOptions({ lifecycle, recovery, authority });
  const structuralLifecycle = structuralLifecycleFor();
  const structuralController = {
    options: options.execution.operationalControl.options,
    runTurn: options.execution.operationalControl.runTurn.bind(
      options.execution.operationalControl,
    ),
    runPreTool: options.execution.operationalControl.runPreTool.bind(
      options.execution.operationalControl,
    ),
    runPreEffect: options.execution.operationalControl.runPreEffect.bind(
      options.execution.operationalControl,
    ),
  };
  const structuralRoles = {
    options: options.local.governedRoleCatalog.options,
    resolveActiveRoleBinding:
      options.local.governedRoleCatalog.resolveActiveRoleBinding.bind(
        options.local.governedRoleCatalog,
      ),
  };
  const structuralRecovery = {
    scope: recovery.scope,
    tick: recovery.tick.bind(recovery),
    requireNodeProgress: recovery.requireNodeProgress.bind(recovery),
    gateExecution: recovery.gateExecution.bind(recovery),
    isBoundToLifecycle: () => true,
    isBoundToAssignmentAuthority: () => true,
  };
  const prototypeRecovery = Object.create(
    AutonomousCompromiseRecoveryRuntimeV1.prototype,
  );

  assert.equal(isGovernedAgentLifecycleRuntimeV1(lifecycle), true);
  assert.equal(isGovernedAgentLifecycleRuntimeV1(structuralLifecycle), false);
  assert.equal(
    isOperationalCognitiveControllerV1(options.execution.operationalControl),
    true,
  );
  assert.equal(isOperationalCognitiveControllerV1(structuralController), false);
  assert.equal(isGovernedRoleCatalogRuntimeV2(structuralRoles), false);
  assert.equal(
    isAutonomousCompromiseRecoveryRuntimeV1(structuralRecovery),
    false,
  );
  assert.equal(
    isAutonomousCompromiseRecoveryRuntimeV1(prototypeRecovery),
    false,
  );
  assert.throws(
    () =>
      createReferenceIntegratedCollectiveStackV1({
        ...options,
        local: { ...options.local, lifecycle: structuralLifecycle },
      }),
    /reference stack requires a concrete governed lifecycle runtime/u,
  );
  assert.throws(
    () =>
      createReferenceIntegratedCollectiveStackV1({
        ...options,
        execution: {
          ...options.execution,
          operationalControl: structuralController,
        },
      }),
    /reference stack requires a concrete operational cognitive controller/u,
  );
  assert.throws(
    () =>
      createReferenceIntegratedCollectiveStackV1({
        ...options,
        local: { ...options.local, governedRoleCatalog: structuralRoles },
      }),
    /reference stack requires a concrete governed lifecycle runtime and role currentness/u,
  );
  for (const impostor of [structuralRecovery, prototypeRecovery])
    assert.throws(
      () =>
        createReferenceIntegratedCollectiveStackV1({
          ...options,
          recovery: impostor,
        }),
      /reference stack recovery scope is invalid/u,
    );
});

test("reference stack requires and binds explicit semantic horizon control", () => {
  const lifecycle = lifecycleFor();
  const authority = assignmentAuthority();
  const recovery = boundSupervisor(lifecycle, authority);
  const options = minimalIntegratedOptions({ lifecycle, recovery, authority });
  const {
    semanticHorizon: omittedHorizon,
    semanticStateKey: omittedStateKey,
    ...executionWithoutHorizon
  } = options.execution;

  assert.ok(
    options.execution.semanticHorizon instanceof
      AnytimeSemanticHorizonCouplingV1,
  );
  assert.equal(options.execution.semanticStateKey, "semantic:reference-stack");
  assert.ok(omittedHorizon);
  assert.equal(omittedStateKey, "semantic:reference-stack");
  const {
    semanticHorizonBudgetMonotonicAnchor: omittedBudgetAnchor,
    ...executionWithoutBudgetAnchor
  } = options.execution;
  assert.ok(omittedBudgetAnchor);
  const structuralHorizon = {
    options: omittedHorizon.options,
    evaluate: omittedHorizon.evaluate.bind(omittedHorizon),
  };
  assert.equal(isAnytimeSemanticHorizonCouplingV1(structuralHorizon), false);
  const structuralEngine = {
    append: options.execution.semanticGuarantees.append.bind(
      options.execution.semanticGuarantees,
    ),
  };
  assert.equal(isSequentialSemanticGuaranteeEngineV1(structuralEngine), false);
  assert.throws(
    () =>
      createReferenceIntegratedCollectiveStackV1({
        ...options,
        execution: {
          ...options.execution,
          semanticGuarantees: structuralEngine,
        },
      }),
    /reference stack requires a concrete sequential semantic guarantee engine/u,
  );
  assert.throws(
    () =>
      createReferenceIntegratedCollectiveStackV1({
        ...options,
        execution: executionWithoutHorizon,
      }),
    /reference stack requires semantic horizon control/u,
  );
  assert.throws(
    () =>
      createReferenceIntegratedCollectiveStackV1({
        ...options,
        execution: executionWithoutBudgetAnchor,
      }),
    /semantic horizon control with durable budgets/u,
  );
  assert.throws(
    () =>
      createReferenceIntegratedCollectiveStackV1({
        ...options,
        execution: {
          ...options.execution,
          semanticHorizon: structuralHorizon,
        },
      }),
    /reference stack requires semantic horizon control/u,
  );
});

test("assurance context binding excludes credentials and binds canonical actor authority", async () => {
  const cognitiveRequest = {
    tenantId: "tenant:assurance",
    authorityDigest: digest("1"),
  };
  const first = await assuranceCognitiveContextBindingDigestV1({
    cognitiveRequest,
    cognitiveContext: {
      tenant: {
        tenantId: cognitiveRequest.tenantId,
        organizationId: "organization:one",
        workspaceId: "workspace:one",
        actor: {
          actorId: "actor:one",
          actorType: "machine",
          email: "first@example.invalid",
          roles: ["role:writer", "role:reader"],
        },
      },
      signal: new AbortController().signal,
      credentials: { token: "fixture-a" },
    },
  });
  const secretAndOrderChanged = await assuranceCognitiveContextBindingDigestV1({
    cognitiveRequest,
    cognitiveContext: {
      tenant: {
        tenantId: cognitiveRequest.tenantId,
        organizationId: "organization:one",
        workspaceId: "workspace:one",
        actor: {
          actorId: "actor:one",
          actorType: "machine",
          email: "second@example.invalid",
          roles: ["role:reader", "role:writer", "role:reader"],
        },
      },
      signal: new AbortController().signal,
      credentials: { token: "fixture-b", password: "fixture-c" },
    },
  });
  const authorityChanged = await assuranceCognitiveContextBindingDigestV1({
    cognitiveRequest,
    cognitiveContext: {
      tenant: {
        tenantId: cognitiveRequest.tenantId,
        organizationId: "organization:one",
        workspaceId: "workspace:one",
        actor: {
          actorId: "actor:one",
          actorType: "machine",
          roles: ["role:reader"],
        },
      },
      signal: new AbortController().signal,
    },
  });
  assert.equal(first, secretAndOrderChanged);
  assert.notEqual(first, authorityChanged);
});

test("assurance captures policies, semantic horizon requirements and operational control at construction", async () => {
  const semanticHorizon = semanticHorizonCoupling();
  const control = operationalController();
  const allocationPolicy = structuredClone(strategicAllocationPolicy());
  const semanticAcceptance = structuredClone(await semanticAcceptancePolicy());
  const executionStore = new InMemoryAssuranceCoupledExecutionStoreV1();
  const options = {
    localPeerId: "peer:assurance",
    localInstanceId: "instance:assurance",
    allocationPolicy,
    semanticGuarantees: new SequentialSemanticGuaranteeEngineV1(8),
    semanticAcceptance,
    semanticAssessment: {
      async assess() {
        return null;
      },
    },
    semanticHorizon,
    semanticStateKey: "semantic:assurance",
    requireSemanticHorizon: true,
    cognitive: {
      async execute() {
        return null;
      },
    },
    currentness: {
      async verify() {
        return true;
      },
    },
    authority: assignmentAuthority(),
    operationalControl: control,
    finality: {
      async verifyPlanning() {
        throw new Error("not used by construction capture test");
      },
      async certifyExecution() {
        throw new Error("not used by construction capture test");
      },
      async verifyExecution() {
        throw new Error("not used by construction capture test");
      },
    },
    effects: {
      async prepare() {
        throw new Error("not used by construction capture test");
      },
      async commit() {
        throw new Error("not used by construction capture test");
      },
    },
    store: executionStore,
  };
  const runtime = new AssuranceCoupledExecutionRuntimeV1(options);
  assert.equal(isAssuranceCoupledExecutionRuntimeV1(runtime), true);
  await assert.rejects(
    runtime.lookupReceipt({
      executionId: "execution:context-mismatch",
      cognitiveContextBindingDigest: digest("0"),
      cognitiveRequest: {
        tenantId: "tenant:assurance",
        authorityDigest: digest("1"),
      },
      cognitiveContext: {
        tenant: {
          tenantId: "tenant:assurance",
          actor: { actorType: "system", roles: ["role:assurance"] },
        },
        signal: new AbortController().signal,
      },
    }),
    /cognitive context binding digest is invalid/u,
  );
  const poisonedInput = {
    executionId: "execution:poisoned-receipt",
    graphDigest: digest("1"),
    allocationPlan: { planDigest: digest("2") },
    planningCycle: {},
    planningEvidenceMessageDigests: [],
    awardDigest: digest("3"),
    task: { taskDigest: digest("4") },
    planningDecisionDigest: digest("5"),
    planningFinality: { certificateDigest: digest("6") },
    semanticSequence: 1,
    cognitiveRequest: {
      tenantId: "tenant:assurance",
      authorityDigest: digest("7"),
    },
    cognitiveContext: {
      tenant: { tenantId: "tenant:assurance" },
      signal: new AbortController().signal,
      credentials: { token: "fixture-d" },
    },
    telemetryCorrelation: {},
    logicalTimeMs: 1,
  };
  poisonedInput.cognitiveContextBindingDigest =
    await assuranceCognitiveContextBindingDigestV1(poisonedInput);
  const poisonedExecutionInputDigest =
    await assuranceCoupledExecutionInputDigestV1(poisonedInput);
  const poisonedBody = {
    schemaVersion: 1,
    executionId: poisonedInput.executionId,
    executionInputDigest: poisonedExecutionInputDigest,
    cognitiveContextBindingDigest: poisonedInput.cognitiveContextBindingDigest,
    status: "completed",
    graphDigest: poisonedInput.graphDigest,
    allocationPlanDigest: poisonedInput.allocationPlan.planDigest,
    awardDigest: poisonedInput.awardDigest,
    taskDigest: poisonedInput.task.taskDigest,
    planningDecisionDigest: poisonedInput.planningDecisionDigest,
    planningFinalityCertificateDigest:
      poisonedInput.planningFinality.certificateDigest,
    telemetryCorrelation: poisonedInput.telemetryCorrelation,
    cognitiveResult: null,
    cognitiveReceipt: null,
    assessmentDigest: null,
    semanticGuarantee: null,
    anytimeSemanticGuaranteeDigest: null,
    semanticHorizonDecision: null,
    semanticHorizonDecisionDigest: null,
    authorityFence: null,
    executionFinality: null,
    effect: null,
    effectReceipt: null,
    logicalTimeMs: poisonedInput.logicalTimeMs,
  };
  const poisonedReceipt = {
    ...poisonedBody,
    receiptDigest: await collectiveQuorumDigestV1({
      domain: "assurance-coupled-execution-receipt-v1",
      body: poisonedBody,
    }),
  };
  const poisonedStore = new InMemoryAssuranceCoupledExecutionStoreV1();
  assert.equal(
    await poisonedStore.reserve({
      executionId: poisonedInput.executionId,
      executionInputDigest: poisonedExecutionInputDigest,
      reservationId: "reservation:poisoned",
      logicalTimeMs: 1,
      reservedUntilLogicalMs: 2,
    }),
    true,
  );
  assert.equal(
    await poisonedStore.complete({
      executionId: poisonedInput.executionId,
      executionInputDigest: poisonedExecutionInputDigest,
      reservationId: "reservation:poisoned",
      receipt: poisonedReceipt,
    }),
    true,
  );
  const poisonedRuntime = new AssuranceCoupledExecutionRuntimeV1({
    ...options,
    store: poisonedStore,
  });
  await assert.rejects(
    poisonedRuntime.lookupReceipt(poisonedInput),
    /persisted completed assurance receipt is incomplete/u,
  );
  assert.equal(
    Object.getOwnPropertyDescriptor(runtime, "execute").writable,
    false,
  );
  assert.notEqual(
    runtime.options.semanticAssessment,
    options.semanticAssessment,
  );
  assert.notEqual(runtime.options.effects, options.effects);
  assert.deepEqual(Object.keys(runtime.options.effects), ["prepare"]);
  assert.notEqual(runtime.options.authority, options.authority);
  assert.notEqual(runtime.options.store, executionStore);
  let replacementExecuteCalls = 0;
  class OverridingAssuranceRuntime extends AssuranceCoupledExecutionRuntimeV1 {
    async execute() {
      replacementExecuteCalls += 1;
      throw new Error("replacement execute must not run");
    }
  }
  const overriding = new OverridingAssuranceRuntime(options);
  await assert.rejects(overriding.execute({}), /executionId is invalid/u);
  const originalExecute = AssuranceCoupledExecutionRuntimeV1.prototype.execute;
  AssuranceCoupledExecutionRuntimeV1.prototype.execute = async () => {
    replacementExecuteCalls += 1;
    throw new Error("patched execute must not run");
  };
  await assert.rejects(runtime.execute({}), /executionId is invalid/u);
  AssuranceCoupledExecutionRuntimeV1.prototype.execute = originalExecute;
  assert.equal(replacementExecuteCalls, 0);
  options.cognitive.execute = async () => {
    replacementExecuteCalls += 1;
    throw new Error("replacement cognitive must not run");
  };
  options.currentness.verify = async () => false;
  options.finality.verifyPlanning = async () => false;
  options.finality.certifyExecution = async () => null;
  options.finality.verifyExecution = async () => false;
  options.semanticAssessment.assess = async () => null;
  options.effects.prepare = async () => null;
  options.effects.commit = async () => null;
  options.authority.commit = async () => {
    replacementExecuteCalls += 1;
    throw new Error("replacement authority must not run");
  };
  executionStore.load = async () => {
    throw new Error("replacement store load must not run");
  };
  assert.notEqual(runtime.options.cognitive.execute, options.cognitive.execute);
  assert.notEqual(
    runtime.options.currentness.verify,
    options.currentness.verify,
  );
  assert.notEqual(
    runtime.options.finality.verifyPlanning,
    options.finality.verifyPlanning,
  );
  assert.notEqual(
    runtime.options.semanticAssessment.assess,
    options.semanticAssessment.assess,
  );
  assert.notEqual(runtime.options.effects.prepare, options.effects.prepare);
  assert.notEqual(runtime.options.authority.commit, options.authority.commit);
  assert.notEqual(runtime.options.store.load, executionStore.load);
  const structuralHorizon = {
    evaluate: semanticHorizon.evaluate.bind(semanticHorizon),
  };
  const structuralController = {
    runTurn: control.runTurn.bind(control),
    runPreTool: control.runPreTool.bind(control),
    runPreEffect: control.runPreEffect.bind(control),
  };
  options.requireSemanticHorizon = false;
  options.semanticHorizon = structuralHorizon;
  options.semanticStateKey = "semantic:mutated";
  options.operationalControl = structuralController;
  allocationPolicy.maximumTasksPerPeer = 1;
  semanticAcceptance.minimumSamples = 100_000;

  assert.equal(runtime.options.requireSemanticHorizon, true);
  assert.equal(runtime.options.semanticHorizon, semanticHorizon);
  assert.equal(runtime.options.semanticStateKey, "semantic:assurance");
  assert.equal(runtime.options.operationalControl, control);
  assert.equal(runtime.options.allocationPolicy.maximumTasksPerPeer, 16);
  assert.equal(runtime.options.semanticAcceptance.minimumSamples, 1);
  assert.equal(Object.isFrozen(runtime.options.allocationPolicy), true);
  assert.equal(Object.isFrozen(runtime.options.semanticAcceptance), true);
  options.allocationPolicy = strategicAllocationPolicy();
  options.semanticAcceptance = await semanticAcceptancePolicy();
  for (const property of [
    "requireSemanticHorizon",
    "semanticHorizon",
    "semanticStateKey",
    "operationalControl",
  ])
    assert.throws(() => {
      runtime.options[property] = options[property];
    }, TypeError);
  assert.throws(
    () =>
      new AssuranceCoupledExecutionRuntimeV1({
        ...options,
        authority: undefined,
      }),
    /protected effects require atomic execution authority/u,
  );
  assert.throws(
    () =>
      new AssuranceCoupledExecutionRuntimeV1({
        ...options,
        requireSemanticHorizon: true,
        semanticHorizon: structuralHorizon,
        semanticStateKey: "semantic:required-structural",
        operationalControl: control,
      }),
    /assurance requires a concrete anytime semantic horizon coupling/u,
  );
  assert.throws(
    () =>
      new AssuranceCoupledExecutionRuntimeV1({
        ...options,
        semanticGuarantees: { append() {} },
      }),
    /assurance requires a concrete sequential semantic guarantee engine/u,
  );
  assert.throws(
    () =>
      new AssuranceCoupledExecutionRuntimeV1({
        ...options,
        requireSemanticHorizon: true,
        semanticHorizon,
        semanticStateKey: "semantic:required-real",
        operationalControl: structuralController,
      }),
    /assurance requires a concrete operational cognitive controller/u,
  );

  let evaluateReads = 0;
  let evaluator = async () => ({ decisionDigest: digest("1") });
  const optionalStructural = {};
  Object.defineProperty(optionalStructural, "evaluate", {
    get() {
      evaluateReads += 1;
      return evaluator;
    },
  });
  const optional = new AssuranceCoupledExecutionRuntimeV1({
    ...options,
    semanticHorizon: optionalStructural,
    semanticStateKey: "semantic:optional-structural",
    requireSemanticHorizon: false,
    operationalControl: control,
  });
  evaluator = async () => {
    throw new Error("replacement structural horizon must not be captured");
  };
  assert.equal(evaluateReads, 1);
  assert.equal(optional.options.semanticHorizon, optionalStructural);

  const invalidSemanticAcceptance = {
    ...(await semanticAcceptancePolicy()),
    minimumSamples: 2,
  };
  const invalidSemanticRuntime = new AssuranceCoupledExecutionRuntimeV1({
    ...options,
    allocationPolicy: strategicAllocationPolicy(),
    semanticAcceptance: invalidSemanticAcceptance,
    semanticHorizon,
    semanticStateKey: "semantic:invalid-policy",
    requireSemanticHorizon: true,
    operationalControl: control,
  });
  await assert.rejects(
    invalidSemanticRuntime.execute({}),
    /semantic acceptance policy digest is invalid/u,
  );
});

test("sequential semantic guarantee engine is nominal and ignores method replacement", () => {
  const calls = { subclass: 0 };
  const sample = {
    sequence: 1,
    logicalTimeMs: 10,
    metrics: {
      roleCoherenceBps: 9_000,
      missionAlignmentBps: 9_000,
      contextConflictBps: 0,
      uncertaintyBps: 0,
      courseActionDiversityBps: 9_000,
      courseActionNoveltyBps: 9_000,
    },
    assessmentDigest: digest("e"),
  };
  const structural = {
    append() {
      throw new Error("must not run");
    },
  };
  assert.equal(isSequentialSemanticGuaranteeEngineV1(structural), false);
  assert.throws(
    () => invokeSequentialSemanticGuaranteeAppendV1(structural, sample),
    /concrete_sequential_semantic_guarantee_engine_required/u,
  );
  class OverridingEngine extends SequentialSemanticGuaranteeEngineV1 {
    append() {
      calls.subclass += 1;
      throw new Error("subclass override must not run");
    }
  }
  const engine = new OverridingEngine(8);
  assert.equal(isSequentialSemanticGuaranteeEngineV1(engine), true);
  assert.throws(() => {
    engine.append = () => {
      throw new Error("replacement must not run");
    };
  }, TypeError);
  const guarantee = invokeSequentialSemanticGuaranteeAppendV1(engine, sample);
  assert.equal(guarantee.throughSequence, 1);
  assert.equal(calls.subclass, 0);
});

test("semantic horizon evaluation ignores monkey patches and subclass overrides", async () => {
  const calls = { monkeyPatch: 0, subclass: 0, enginePatch: 0 };
  const options = semanticGuaranteePorts();
  const input = {
    stateKey: "semantic:invoker-test",
    sequence: 1,
    logicalTimeMs: 10,
    metrics: {
      roleCoherenceBps: 9_000,
      missionAlignmentBps: 9_000,
      contextConflictBps: 0,
      uncertaintyBps: 0,
      courseActionDiversityBps: 9_000,
      courseActionNoveltyBps: 9_000,
    },
    assessmentDigest: digest("a"),
  };
  const patched = new AnytimeSemanticHorizonCouplingV1(options);
  assert.equal("advance" in options.guarantees, false);
  assert.equal("guaranteeFrom" in options.guarantees, false);
  assert.equal("assertStateAndAnchor" in options.guarantees, false);
  options.guarantees.append = async () => {
    calls.enginePatch += 1;
    throw new Error("monkey-patched guarantee engine must not run");
  };
  patched.evaluate = async () => {
    calls.monkeyPatch += 1;
    throw new Error("monkey-patched horizon evaluator must not run");
  };
  assert.equal(isAnytimeSemanticHorizonCouplingV1(patched), true);
  const patchedResult = await invokeAnytimeSemanticHorizonCouplingV1(
    patched,
    input,
  );
  assert.equal(patchedResult.decision.directive, "continue");

  class OverridingHorizonCoupling extends AnytimeSemanticHorizonCouplingV1 {
    async evaluate() {
      calls.subclass += 1;
      throw new Error("subclass horizon evaluator must not run");
    }
  }
  const subclass = new OverridingHorizonCoupling(options);
  const subclassResult = await invokeAnytimeSemanticHorizonCouplingV1(
    subclass,
    { ...input, sequence: 2, logicalTimeMs: 11 },
  );
  assert.equal(subclassResult.decision.directive, "continue");
  assert.deepEqual(calls, {
    monkeyPatch: 0,
    subclass: 0,
    enginePatch: 0,
  });
});

test("reference stack requires exact lifecycle and assignment-authority identity", () => {
  const lifecycle = lifecycleFor();
  const authority = assignmentAuthority();
  const recovery = boundSupervisor(lifecycle, authority);
  const otherLifecycle = lifecycleFor();
  const otherAuthority = assignmentAuthority();

  assert.equal(recovery.isBoundToLifecycle(lifecycle), true);
  assert.equal(recovery.isBoundToLifecycle(otherLifecycle), false);
  assert.equal(recovery.isBoundToAssignmentAuthority(authority), true);
  assert.equal(recovery.isBoundToAssignmentAuthority(otherAuthority), false);
  assert.throws(
    () =>
      createReferenceIntegratedCollectiveStackV1(
        minimalIntegratedOptions({
          lifecycle: otherLifecycle,
          recovery,
          authority,
        }),
      ),
    /recovery scope is invalid/,
  );
  assert.throws(
    () =>
      createReferenceIntegratedCollectiveStackV1(
        minimalIntegratedOptions({
          lifecycle,
          recovery,
          authority: otherAuthority,
        }),
      ),
    /recovery scope is invalid/,
  );
});

test("reference stack branding, identity binding and inspection are nominal and read-only", async () => {
  const lifecycle = lifecycleFor();
  const authority = assignmentAuthority();
  const recovery = boundSupervisor(lifecycle, authority);
  const { options, plane, artifacts } = await completeIntegratedOptions({
    lifecycle,
    recovery,
    authority,
  });
  recovery.isBoundToLifecycle = () => false;
  recovery.isBoundToAssignmentAuthority = () => false;
  Object.defineProperty(recovery, "scope", {
    value: { ...coordinatorScope, missionIntentId: "mission:mutated" },
    configurable: true,
  });
  const capturedFinalityConfigurationDigest =
    options.finality.membership.configurationDigest;
  let finalityConfigurationReads = 0;
  Object.defineProperty(options.finality.membership, "configurationDigest", {
    configurable: true,
    enumerable: true,
    get() {
      finalityConfigurationReads += 1;
      return finalityConfigurationReads === 1
        ? capturedFinalityConfigurationDigest
        : digest("f");
    },
  });
  const stack = createReferenceIntegratedCollectiveStackV1(options);
  assert.equal(finalityConfigurationReads, 1);
  Object.defineProperty(options.finality.membership, "configurationDigest", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: capturedFinalityConfigurationDigest,
  });
  const facadeClone = Object.freeze({ node: stack.node });
  const exactAuthorityBinding = {
    plane,
    artifacts,
    authenticity: options.protocol.authenticity,
    protocolMembership: options.protocol.membership,
    crypto: options.protocol.crypto,
    finalityMembership: options.finality.membership,
    finalityPolicy: options.finality.policy,
    finalitySignatures: options.finality.signatures,
    finalityGateway: options.finality.gateway,
    recoveryAssignmentAuthority: authority,
  };

  assert.equal(isReferenceIntegratedCollectiveStackV1(stack), true);
  assert.equal(isReferenceIntegratedCollectiveStackV1(facadeClone), false);
  assert.equal(
    isReferenceIntegratedCollectiveStackV1({ node: stack.node }),
    false,
  );
  assert.equal(
    isReferenceIntegratedCollectiveStackBoundToV1(stack, exactAuthorityBinding),
    true,
  );
  for (const [authorityName, replacement] of [
    ["artifacts", { put: artifacts.put, get: artifacts.get }],
    ["authenticity", { ...options.protocol.authenticity }],
    ["protocolMembership", { ...options.protocol.membership }],
    ["crypto", globalThis.crypto],
    ["finalityMembership", { ...options.finality.membership }],
    ["finalityPolicy", { ...options.finality.policy }],
    ["finalitySignatures", { ...options.finality.signatures }],
  ])
    assert.equal(
      isReferenceIntegratedCollectiveStackBoundToV1(stack, {
        ...exactAuthorityBinding,
        [authorityName]: replacement,
      }),
      false,
    );
  assert.equal(
    isReferenceIntegratedCollectiveStackBoundToPlaneAndRecoveryV1(stack, {
      plane,
      recoveryAssignmentAuthority: authority,
    }),
    true,
  );
  assert.equal(
    isReferenceIntegratedCollectiveStackBoundToPlaneAndRecoveryV1(stack, {
      plane: { publish: plane.publish },
      recoveryAssignmentAuthority: authority,
    }),
    false,
  );
  assert.equal(
    isReferenceIntegratedCollectiveStackBoundToV1(stack, {
      plane: { publish: plane.publish },
      artifacts,
      authenticity: options.protocol.authenticity,
      protocolMembership: options.protocol.membership,
      crypto: options.protocol.crypto,
      finalityMembership: options.finality.membership,
      finalityPolicy: options.finality.policy,
      finalitySignatures: options.finality.signatures,
      finalityGateway: options.finality.gateway,
      recoveryAssignmentAuthority: authority,
    }),
    false,
  );
  assert.equal(
    isReferenceIntegratedCollectiveStackBoundToV1(stack, {
      plane,
      artifacts,
      authenticity: options.protocol.authenticity,
      protocolMembership: options.protocol.membership,
      crypto: options.protocol.crypto,
      finalityMembership: options.finality.membership,
      finalityPolicy: options.finality.policy,
      finalitySignatures: options.finality.signatures,
      finalityGateway: {
        certify: options.finality.gateway.certify,
        shardCertificates: options.finality.gateway.shardCertificates,
      },
      recoveryAssignmentAuthority: authority,
    }),
    false,
  );
  assert.equal(
    isReferenceIntegratedCollectiveStackBoundToV1(stack, {
      plane,
      artifacts,
      authenticity: options.protocol.authenticity,
      protocolMembership: options.protocol.membership,
      crypto: options.protocol.crypto,
      finalityMembership: options.finality.membership,
      finalityPolicy: options.finality.policy,
      finalitySignatures: options.finality.signatures,
      finalityGateway: options.finality.gateway,
      recoveryAssignmentAuthority: assignmentAuthority(),
    }),
    false,
  );

  assert.equal(await stack.node.loadOptional(), null);
  await assert.rejects(
    stack.node.load(),
    /autonomous collective node is not initialized/u,
  );
  const snapshot = await inspectReferenceIntegratedCollectiveStackV1(stack);
  assert.deepEqual(snapshot, {
    schemaVersion: 1,
    node: null,
    protocol: null,
  });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.throws(() => {
    snapshot.node = {};
  }, TypeError);
  await assert.rejects(
    inspectReferenceIntegratedCollectiveStackV1(facadeClone),
    /stack is not genuine/u,
  );

  const payload = { observation: { status: "healthy" } };
  const payloadDigest = await collectiveQuorumDigestV1({
    domain: "distributed-collective-payload-v1",
    body: payload,
  });
  const unsigned = {
    schemaVersion: 1,
    protocolId: options.protocol.protocolId,
    scopeDigest: options.protocol.scopeDigest,
    membershipConfigurationDigest:
      options.protocol.membershipConfigurationDigest,
    cycleId: "cycle:inspection",
    streamId: "stream:inspection",
    kind: "context.claim",
    issuerPeerId: options.protocol.localPeerId,
    issuerInstanceId: options.protocol.localInstanceId,
    issuerKeyId: options.protocol.authenticity.localKeyId,
    sequence: 1,
    logicalTimeMs: 10,
    expiresAtLogicalMs: 20,
    predecessorMessageDigest: null,
    payloadDigest,
    payload,
  };
  const messageDigest = await distributedCollectiveMessageDigestV1(unsigned);
  const signed = {
    ...unsigned,
    messageDigest,
    signature: "signature:inspection",
  };
  const artifactDigest = await distributedCollectiveArtifactDigestV1(signed);
  const message = { ...signed, artifactDigest };
  await assert.rejects(
    storeReferenceIntegratedCollectiveArtifactV1(facadeClone, message),
    /stack is not genuine/u,
  );
  await assert.rejects(
    storeReferenceIntegratedCollectiveArtifactV1(stack, {
      ...message,
      payload: { observation: { status: "tampered" } },
    }),
    /collective payload digest is invalid/u,
  );
  const stored = await storeReferenceIntegratedCollectiveArtifactV1(
    stack,
    message,
  );
  const signatureRejectingStack = createReferenceIntegratedCollectiveStackV1({
    ...options,
    protocol: {
      ...options.protocol,
      authenticity: {
        ...options.protocol.authenticity,
        async verify() {
          return false;
        },
      },
    },
  });
  await assert.rejects(
    storeReferenceIntegratedCollectiveArtifactV1(
      signatureRejectingStack,
      message,
    ),
    /artifact signature is unverified/u,
  );
  await assert.rejects(
    readReferenceIntegratedCollectiveArtifactV1(
      signatureRejectingStack,
      artifactDigest,
    ),
    /artifact signature is unverified/u,
  );
  const lossyStoreStack = createReferenceIntegratedCollectiveStackV1({
    ...options,
    protocol: {
      ...options.protocol,
      artifacts: {
        async put() {},
        async get() {
          return null;
        },
      },
    },
  });
  await assert.rejects(
    storeReferenceIntegratedCollectiveArtifactV1(lossyStoreStack, message),
    /artifact store did not retain artifact/u,
  );
  options.protocol.artifacts.get = async () => null;
  options.protocol.authenticity.verify = async () => false;
  options.protocol.membership.verifyPeer = async () => false;
  options.finality.gateway.certify = async () => {
    throw new Error("replacement finality gateway must not run");
  };
  options.finality.gateway.shardCertificates = async () => {
    throw new Error("replacement finality gateway must not run");
  };
  options.finality.signatures.verifyAggregate = async () => false;
  payload.observation.status = "source-mutated";
  assert.equal(stored.artifactDigest, artifactDigest);
  assert.equal(stored.payload.observation.status, "healthy");
  assert.equal(Object.isFrozen(stored), true);
  assert.equal(Object.isFrozen(stored.payload), true);
  assert.equal(Object.isFrozen(stored.payload.observation), true);

  const artifact = await readReferenceIntegratedCollectiveArtifactV1(
    stack,
    artifactDigest,
  );
  assert.equal(artifact?.artifactDigest, artifactDigest);
  assert.equal(Object.isFrozen(artifact), true);
  assert.equal(Object.isFrozen(artifact.payload), true);
  assert.equal(Object.isFrozen(artifact.payload.observation), true);
  assert.throws(() => {
    artifact.payload.observation.status = "mutated";
  }, TypeError);
  assert.equal(
    isReferenceIntegratedCollectiveStackBoundToV1(stack, exactAuthorityBinding),
    true,
  );
  assert.equal(
    await readReferenceIntegratedCollectiveArtifactV1(
      stack,
      `sha256:${"A".repeat(43)}`,
    ),
    null,
  );
  await assert.rejects(
    readReferenceIntegratedCollectiveArtifactV1(stack, digest("f")),
    /artifactDigest is invalid/u,
  );

  const cryptoA = {
    subtle: {
      digest: globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle),
    },
  };
  const cryptoB = {
    subtle: {
      digest: globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle),
    },
  };
  assert.throws(
    () =>
      createReferenceIntegratedCollectiveStackV1({
        ...options,
        protocol: { ...options.protocol, crypto: cryptoA },
        finality: { ...options.finality, crypto: cryptoB },
      }),
    /protocol and sparse BFT crypto authorities differ/u,
  );
});

test("reference stack rejects genuine durable telemetry from another collective scope", async () => {
  const lifecycle = lifecycleFor();
  const authority = assignmentAuthority();
  const recovery = boundSupervisor(lifecycle, authority);
  const { options } = await completeIntegratedOptions({
    lifecycle,
    recovery,
    authority,
  });
  const policy = await createCollectiveTelemetryPolicyV1({
    schemaVersion: 1,
    policyId: "policy:foreign-reference-stack",
    policyVersion: 1,
    allowedMetricKeys: [],
    maximumEvidenceDigestsPerEvent: 16,
    maximumMetricsPerEvent: 0,
    maximumRetainedEvents: 16,
    maximumCommitAttempts: 4,
  });
  const foreignRuntime = new CollectiveTelemetryRuntimeV1({
    streamId: "stream:foreign-reference-stack",
    anchorKey: "anchor:foreign-reference-stack",
    tenantId: coordinatorScope.tenantId,
    collectiveId: "mesh:foreign",
    policy,
    authenticity: {
      peerId: options.protocol.localPeerId,
      instanceId: options.protocol.localInstanceId,
      keyId: options.protocol.authenticity.localKeyId,
      async sign(value) {
        return `signed:${value}`;
      },
      async verify(input) {
        return input.signature === `signed:${input.messageDigest}`;
      },
    },
    monotonicAnchor: new InMemoryCollectiveTelemetryMonotonicAnchorV1(),
  });
  await foreignRuntime.initialize(0);
  const foreignTelemetry = new CollectiveHostTelemetryAdapterV1(foreignRuntime);
  options.execution.telemetry = foreignTelemetry;
  options.node.telemetry = foreignTelemetry;

  assert.throws(
    () => createReferenceIntegratedCollectiveStackV1(options),
    /durable causal telemetry outboxes/u,
  );
});

test("reference stack rejects a recovery supervisor bound to another mesh", () => {
  const membershipDigest = digest("6");
  const authority = assignmentAuthority();
  const lifecycle = lifecycleFor(membershipDigest);
  const recovery = boundSupervisor(lifecycle, authority, {
    ...coordinatorScope,
    meshId: "mesh:other",
  });

  assert.throws(
    () =>
      createReferenceIntegratedCollectiveStackV1(
        minimalIntegratedOptions({
          lifecycle,
          recovery,
          authority,
        }),
      ),
    /recovery scope is invalid/,
  );
});
