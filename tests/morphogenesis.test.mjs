import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryMorphologyHeadStoreV1,
  InMemoryMorphogenesisBudgetReservationPortV1,
  InMemoryMorphogenesisExecutionStoreV1,
  MorphologyHeadRuntimeV1,
  MorphologyHeadMorphogenesisActivationPortV1,
  MorphogenesisProposalEngineV1,
  MorphogenesisDecisionGateProviderV1,
  MorphogenesisDecisionRuntimeV1,
  MorphogenesisExecutionRuntimeV1,
  MorphogenesisExecutionTaskExecutorV1,
  MorphogenesisWorkflowOutcomeEvaluationPortV1,
  MorphogenesisTaskExecutionBindingResolverV1,
  InMemoryMorphogenesisDecisionStoreV1,
  InMemoryMorphogenesisReplayTombstoneStoreV1,
  assertMorphogenesisControlWindowAllowsV1,
  createAgentInstantiationProfileCertificationV1,
  createAgentInstantiationProfileEvolutionV1,
  createAgentInstantiationAuthorityAttenuationV1,
  createAgentInstantiationSynthesisCertificationV1,
  createAgentInstantiationProfileV2,
  createAgentInstantiationProfileV1,
  createMorphogenesisLineageLinkV1,
  createInitialMorphologyHeadV1,
  createMorphogenesisBudgetEnvelopeV1,
  createMorphogenesisNeedV1,
  createMorphogenesisOperationV1,
  createMorphogenesisPolicyV1,
  createMorphogenesisPolicyV2,
  createMorphogenesisProposalV1,
  createMorphogenesisBudgetReservationRequestV1,
  createMorphogenesisBudgetReservationV1,
  createMorphogenesisCandidateSearchRequestV1,
  createMorphogenesisCandidateSearchResultV1,
  createMorphogenesisExistingCandidateV1,
  createMorphogenesisLifecycleAgentV1,
  createMorphogenesisAgentAttestationV1,
  createMorphogenesisSuccessorTeamReceiptV1,
  createMorphogenesisContinuityReceiptV1,
  createMorphogenesisAuthorityFenceReceiptV1,
  createMorphogenesisTerminalAgentReceiptV1,
  createMorphogenesisReceiptV1,
  createMorphogenesisSuccessorRecoveryV1,
  createMorphogenesisReplayTombstoneV1,
  createMorphogenesisControlWindowV1,
  createMorphogenesisDecisionAuthorizationV1,
  createMorphogenesisDecisionCandidateV1,
  createMorphogenesisDecisionBindingV1,
  createCompositeMorphogenesisDecisionAuthorizationV1,
  createMorphogenesisCatalogLifecycleProcessDefinitionV1,
  createMorphogenesisCatalogLifecycleTaskDefinitionsV1,
  createMorphogenesisProcessBindingV1,
  createMorphogenesisScopeV1,
  createMorphogenesisTransformationHeadV1,
  createMorphologyComponentReferenceV1,
  createMorphologySnapshotV1,
  createMorphologySourceHeadV1,
  createTargetMorphologyPositionV1,
  createTargetMorphologyV1,
  validateMorphogenesisProposalV1,
  validateMorphogenesisPolicyV2,
  compileMorphogenesisOperatorV2,
  validateMorphogenesisCompiledOperatorPlanV2,
  createMorphogenesisOperatorStepReceiptV2,
  InMemoryMorphogenesisOperatorExecutionStoreV2,
  MorphogenesisOperatorExecutionRuntimeV2,
  validateAgentInstantiationProfileV1,
  validateAgentInstantiationProfileEvolutionV1,
  validateAgentInstantiationAuthorityAttenuationV1,
  validateAgentInstantiationSynthesisCertificationV1,
  validateAgentInstantiationProfileV2,
  validateMorphogenesisLineageLinkV1,
  validateMorphologySnapshotV1,
  verifyMorphogenesisDecisionAfterGateV1,
} from "../packages/collective-runtime/dist/morphogenesis.js";
import {
  compileGovernedRoleDefinitionV2,
  createDynamicRoleBlueprintV2,
  createGovernedRoleCertificationV2,
} from "../packages/inference-control/dist/governed-role-evolution.js";
import {
  GovernedAgentLifecycleMorphogenesisPortV1,
  TeamFormationMorphogenesisSuccessorPortV1,
  WorkActionMorphogenesisAuthorityFencePortV1,
  MorphogenesisActionGatewayTaskExecutorV1,
  MorphogenesisTelemetryPublisherV1,
  TrustInferenceMorphogenesisAttestationPortV1,
  compileAgentInstantiationProfileToCreationRequestV1,
} from "../packages/collective-host/dist/morphogenesis.js";
import {
  InMemoryMorphogenesisTeamTopologyStateStoreV2,
  MissionWorkReassignmentMorphogenesisBoundaryV2,
  MorphogenesisOperatorBoundaryRouterV2,
  RoleRealignmentMorphogenesisBoundaryV2,
  TeamTopologyMorphogenesisBoundaryV2,
} from "../packages/collective-host/dist/morphogenesis-operator-adapters.js";
import {
  GovernedAgentLineageRuntimeV1,
  InMemoryAgentLineageStoreV1,
  createAgentCreationCertificateV1,
  createAgentCreationPolicyV1,
  createAgentCreationRequestV1,
  createAgentFactoryReceiptV1,
} from "../packages/collective-membership/dist/agent-lineage.js";
import { GovernedAgentLifecycleRuntimeV1 } from "../packages/collective-membership/dist/governed-agent-lifecycle.js";
import { workContractDigestV1 } from "../packages/collective-control/dist/mesh.js";
import {
  InMemoryTeamFormationStoreV1,
  TeamFormationRuntimeV1,
  createTeamCandidateV1,
  createTeamFormationPolicyV1,
  createTeamFormationRequestV1,
  createTeamFormationScopeV1,
  createTeamPositionBidV1,
  createTeamPositionV1,
} from "../packages/collective-runtime/dist/team-formation.js";
import {
  createTeamTopologyNodeV1,
  createTeamTopologyStateV1,
  createTeamTopologyTransformationRequestV1,
  teamTopologyDigestV1,
} from "../packages/collective-runtime/dist/team-topology-transformation.js";
import {
  InMemoryProcessRunnerV1,
  InMemoryWorkflowStoreV1,
  createProcessDefinitionV1,
  createTaskDefinitionV1,
  digestWorkflowJsonV1,
} from "../packages/workflows/dist/index.js";
import {
  InMemoryTaskOutcomeStoreV1,
  WorkflowOutcomeRuntimeV1,
} from "../packages/workflows/dist/v1-outcomes.js";
import {
  TemporalProcessRunnerV1,
  TemporalWorkflowNotifierV1,
} from "../packages/workflows-temporal/dist/index.js";
import {
  createAgentRoomMorphogenesisDecisionAuthorizationV1,
  createAgentRoomMorphogenesisGateConfigurationV1,
} from "../packages/workflows-rooms/dist/morphogenesis.js";
import { CollectiveAgreementMorphogenesisDecisionIssuerV1 } from "../packages/collective-quorum/dist/morphogenesis.js";
import {
  projectMorphogenesisDiffToRoomArtifactV1,
  projectMorphogenesisNeedToMeshV1,
  projectMorphogenesisReceiptToRoomArtifactV1,
  MorphogenesisRoomParticipationPortV1,
  MorphogenesisMeshPublisherV1,
} from "../packages/rooms-mesh/dist/morphogenesis.js";

const sha = (character) => `sha256:${character.repeat(64)}`;

function fixture() {
  const policy = createMorphogenesisPolicyV1({
    schemaVersion: 1,
    policyId: "policy:morphogenesis:test",
    policyVersion: 1,
    parentPolicyDigest: null,
    requiredSourceClasses: ["work", "team", "mission", "membership"],
    allowedOperators: [
      "retire_agent",
      "instantiate_agent",
      "recruit_existing",
      "detach_agent",
    ],
    allowedDecisionRoutes: ["authorized_person", "authorized_agent"],
    requireIndependentDecider: true,
    allowAgentCreation: true,
    maximumPopulation: 16,
    maximumNewAgentsPerProposal: 2,
    maximumResourceUnitsPerProposal: 1_000,
    minimumNeedSeverityBps: 5_000,
    limits: {
      maximumSourceHeads: 16,
      maximumComponents: 128,
      maximumPositions: 16,
      maximumAgentDispositions: 32,
      maximumOperations: 32,
      maximumDependenciesPerOperation: 8,
      maximumEvidenceDigests: 16,
      maximumInvariantDigests: 16,
      maximumProposalTtlMs: 500,
      maximumNeedTtlMs: 1_000,
      maximumSourceFreshnessMs: 200,
      maximumCommitAttempts: 4,
      maximumTransformationsPerWindow: 4,
      transformationWindowMs: 10_000,
      cooldownMs: 500,
      hysteresisBps: 500,
    },
  });
  const scope = createMorphogenesisScopeV1({
    tenantId: "tenant:test",
    morphologyId: "morphology:test",
    policyDomainId: "policy-domain:test",
    missionId: "mission:test",
    missionIntentId: "mission-intent:test",
    objectiveId: "objective:test",
    meshId: "mesh:test",
    roomId: "room:test",
    workItemId: "work:test",
    workItemRevision: 1,
  });
  const sourceHeads = ["mission", "membership", "team", "work"].map(
    (sourceClass, index) =>
      createMorphologySourceHeadV1({
        sourceHeadId: `source-head:${sourceClass}`,
        sourceClass,
        sourceId: `source:${sourceClass}`,
        sourceVersion: 1,
        sourceImplementationDigest: sha(String(index + 1)),
        sourceRevision: 3,
        sourceRecordDigest: sha(String(index + 5)),
        scopeDigest: scope.scopeDigest,
        authenticationEvidenceDigest: sha((index + 9).toString(16)),
        required: true,
        observedAtLogicalMs: 100,
        expiresAtLogicalMs: 500,
      }),
  );
  const components = sourceHeads.map((head, index) =>
    createMorphologyComponentReferenceV1({
      componentKind:
        head.sourceClass === "mission"
          ? "artifact"
          : head.sourceClass === "membership"
            ? "membership"
            : head.sourceClass === "team"
              ? "team"
              : "work_contract",
      componentId: `component:${head.sourceClass}`,
      sourceHeadDigest: head.sourceHeadDigest,
      recordDigest: sha("def0"[index]),
      revision: 3,
      epoch: index + 1,
    }),
  );
  const snapshot = createMorphologySnapshotV1({
    snapshotId: "snapshot:test:1",
    scope,
    morphologyEpoch: 1,
    previousMorphologyDigest: null,
    policy,
    implementationDigest: sha("a"),
    sourceHeads: [...sourceHeads].reverse(),
    components: [...components].reverse(),
    population: {
      activeAgents: 2,
      dormantAgents: 0,
      activeTeams: 1,
      concurrentlyProvisioningAgents: 0,
    },
    resources: {
      configuredResourceUnits: 100,
      reservedResourceUnits: 20,
      consumedInteractionUnits: 10,
    },
    observedAtLogicalMs: 200,
    logicalTimeHighWaterMs: 200,
  });
  const need = createMorphogenesisNeedV1(
    {
      needId: "need:test:1",
      scopeDigest: scope.scopeDigest,
      currentSnapshotDigest: snapshot.snapshotDigest,
      reasonCode: "missing_capability",
      severityBps: 7_500,
      boundedViewDigest: sha("0"),
      candidateSearchLimit: 32,
      evidenceDigests: [sourceHeads[3].sourceHeadDigest],
      detectedAtLogicalMs: 210,
      expiresAtLogicalMs: 600,
    },
    policy,
  );
  const position = createTargetMorphologyPositionV1({
    positionId: "position:database-forensics",
    roleKey: "database_forensics",
    requiredCapabilityKeys: ["database_forensics"],
    dependsOnPositionIds: [],
    fillMode: "instantiate_catalog",
    currentAgentId: null,
    instantiationProfileDigest: sha("b"),
    resourceBudgetUnits: 10,
    maximumActionBudgetUnits: 5,
  });
  const target = createTargetMorphologyV1(
    {
      targetId: "target:test:1",
      scopeDigest: scope.scopeDigest,
      currentSnapshotDigest: snapshot.snapshotDigest,
      expectedCurrentEpoch: 1,
      positions: [position],
      agentDispositions: [],
      invariantDigests: [sha("c")],
      estimatedActiveAgents: 3,
      estimatedNewAgents: 1,
      estimatedResourceUnits: 10,
    },
    policy,
  );
  const operation = createMorphogenesisOperationV1(
    {
      operationId: "operation:instantiate:1",
      operator: "instantiate_agent",
      effectClass: "protected_external",
      dependsOnOperationIds: [],
      targetReferenceDigest: position.positionDigest,
      compensation: "terminate_unenrolled",
    },
    policy,
  );
  const budget = createMorphogenesisBudgetEnvelopeV1({
    maximumActiveAgents: 3,
    maximumNewAgents: 1,
    maximumConcurrentProvisioning: 1,
    maximumResourceUnits: 10,
    maximumInteractionUnits: 100,
    maximumActionUnits: 10,
    maximumInputTokens: 100,
    maximumOutputTokens: 100,
    maximumTotalTokens: 200,
    maximumDurationMs: 1_000,
    maximumCosts: [{ currency: "USD", micros: 1_000_000 }],
  });
  const proposalInput = {
    proposalId: "proposal:test:1",
    scopeDigest: scope.scopeDigest,
    currentSnapshotDigest: snapshot.snapshotDigest,
    expectedCurrentEpoch: 1,
    needDigest: need.needDigest,
    targetDigest: target.targetDigest,
    operations: [operation],
    processDefinitionDigest:
      createMorphogenesisCatalogLifecycleProcessDefinitionV1()
        .definitionDigest,
    budget,
    decisionRoute: "authorized_agent",
    proposerId: "agent:planner",
    proposerVersion: 1,
    proposerImplementationDigest: sha("e"),
    proposedAtLogicalMs: 220,
    expiresAtLogicalMs: 500,
  };
  const proposal = createMorphogenesisProposalV1(proposalInput, {
    policy,
    snapshot,
    need,
    target,
  });
  return { policy, scope, sourceHeads, components, snapshot, need, target, proposal };
}

function executionGuards(context, suffix) {
  const candidate = createMorphogenesisDecisionCandidateV1({
    candidateId: `execution-candidate:${suffix}`,
    proposal: context.proposal,
    policy: context.policy,
    membershipConfigurationDigest: sha("1"),
    membershipEpoch: 1,
    authorityId: "authority:morphogenesis",
    authorityEpoch: 1,
    workContractDigest: sha("2"),
    preparedAtLogicalMs: 230,
    expiresAtLogicalMs: 480,
  });
  const authorization = createMorphogenesisDecisionAuthorizationV1({
    authorizationId: `execution-authorization:${suffix}`,
    candidateDigest: candidate.candidateDigest,
    route: candidate.decisionRoute,
    actorType: "agent",
    actorId: "agent:execution-supervisor",
    actorMandateDigest: sha("3"),
    independenceGroupId: "independence:execution",
    disposition: "approved",
    proofDigest: sha("4"),
    issuedAtLogicalMs: 235,
    expiresAtLogicalMs: 470,
  });
  const decision = createMorphogenesisDecisionBindingV1({
    decisionId: `execution-decision:${suffix}`,
    candidate,
    authorization,
    decisionPortId: "decision-port:execution",
    decisionPortVersion: 1,
    decisionPortImplementationDigest: sha("5"),
    decidedAtLogicalMs: 240,
  });
  const budgetRequest = createMorphogenesisBudgetReservationRequestV1({
    reservationId: `execution-reservation:${suffix}`,
    scopeDigest: context.scope.scopeDigest,
    proposalDigest: context.proposal.proposalDigest,
    expectedMorphologyEpoch: context.proposal.expectedCurrentEpoch,
    operationId: `execution-budget-operation:${suffix}`,
    budget: context.proposal.budget,
    reservedAtLogicalMs: 230,
    expiresAtLogicalMs: 500,
  });
  const budgetReservation = createMorphogenesisBudgetReservationV1({
    request: budgetRequest,
    status: "reserved",
    closedAtLogicalMs: null,
    closeOperationId: null,
    closeReasonCode: null,
  });
  return { decision, budgetReservation };
}

function executionPostCommitPorts() {
  return {
    morphology: {
      async activate(input) {
        return {
          schemaVersion: 1,
          operationId: input.operationId,
          proposalDigest: input.proposalDigest,
          decisionDigest: input.decisionDigest,
          teamReceiptDigest: input.team.receiptDigest,
          resultingSnapshotDigest: input.resultingSnapshotDigest,
          morphologyEpoch: input.expectedMorphologyEpoch + 1,
          morphologyHeadDigest: sha("e"),
          activatedAtLogicalMs: input.logicalTimeMs,
          activationReceiptDigest: sha("f"),
        };
      },
      async reconcile(input) { return this.activate(input); },
    },
    continuity: {
      async checkpoint(input) {
        return createMorphogenesisContinuityReceiptV1({
          operationId: input.operationId,
          agentDigest: input.agent.agentDigest,
          teamReceiptDigest: input.team.receiptDigest,
          checkpointDigest: sha("1"),
          preservedArtifactDigests: [sha("2")],
          completedCausalNodeDigests: [sha("3")],
          invalidatedCausalClosureDigests: [],
          completedAtLogicalMs: input.logicalTimeMs,
        });
      },
      async reconcile(input) { return this.checkpoint(input); },
    },
    authority: {
      async fence(input) {
        return createMorphogenesisAuthorityFenceReceiptV1({
          operationId: input.operationId,
          agentDigest: input.agent.agentDigest,
          teamReceiptDigest: input.team.receiptDigest,
          fencedWorkContractDigests:
            input.team.individualWorkContractDigests,
          revokedActionGrantDigests: [],
          successorFenceDigests: [sha("4")],
          effectReceiptDigest: sha("9"),
          fencedAtLogicalMs: input.logicalTimeMs,
        });
      },
      async reconcile(input) { return this.fence(input); },
    },
    detachment: {
      async detach(input) {
        return createMorphogenesisTerminalAgentReceiptV1({
          operationId: input.operationId,
          agentDigest: input.agent.agentDigest,
          disposition: "detached",
          membershipConfigurationDigest: null,
          membershipEpoch: null,
          lifecycleReceiptDigest: sha("5"),
          terminatedAtLogicalMs: input.logicalTimeMs,
        });
      },
      async reconcile(input) { return this.detach(input); },
    },
    retirement: {
      async retire(input) {
        return createMorphogenesisTerminalAgentReceiptV1({
          operationId: input.operationId,
          agentDigest: input.agent.agentDigest,
          disposition: "retired",
          membershipConfigurationDigest: sha("6"),
          membershipEpoch: input.agent.membershipEpoch + 1,
          lifecycleReceiptDigest: sha("7"),
          terminatedAtLogicalMs: input.logicalTimeMs,
        });
      },
      async reconcile(input) { return this.retire(input); },
    },
    budgets: {
      async release(input) {
        return {
          status: "released",
          request: {
            reservationId: input.reservationId,
            proposalDigest: input.proposalDigest,
          },
          reservationDigest: sha("8"),
        };
      },
    },
  };
}

test("morphogenesis proposal engine authenticates sources and remains deterministic", async () => {
  const first = fixture();
  const second = fixture();
  assert.equal(first.snapshot.snapshotDigest, second.snapshot.snapshotDigest);
  assert.equal(first.proposal.proposalDigest, second.proposal.proposalDigest);
  assert.deepEqual(
    first.snapshot.sourceHeads.map(({ sourceClass }) => sourceClass),
    ["membership", "mission", "team", "work"],
  );
  assert.equal(first.proposal.advisoryOnly, true);
  assert.equal(
    validateMorphogenesisProposalV1(first.proposal, first).proposalDigest,
    first.proposal.proposalDigest,
  );
  const engine = new MorphogenesisProposalEngineV1({
    policy: first.policy,
    sourceResolution: {
      registryId: "source-registry:test",
      registryVersion: 1,
      registryDigest: sha("0"),
      async resolve(head) {
        return {
          sourceId: head.sourceId,
          sourceVersion: head.sourceVersion,
          sourceImplementationDigest: head.sourceImplementationDigest,
          authenticationEvidenceDigest: head.authenticationEvidenceDigest,
        };
      },
    },
    processDefinitionDigest: first.proposal.processDefinitionDigest,
  });
  const observed = await engine.observe({
    snapshotId: first.snapshot.snapshotId,
    scope: first.scope,
    morphologyEpoch: first.snapshot.morphologyEpoch,
    previousMorphologyDigest: first.snapshot.previousMorphologyDigest,
    implementationDigest: first.snapshot.implementationDigest,
    sourceHeads: first.sourceHeads,
    components: first.components,
    population: first.snapshot.population,
    resources: first.snapshot.resources,
    observedAtLogicalMs: first.snapshot.observedAtLogicalMs,
    logicalTimeHighWaterMs: first.snapshot.logicalTimeHighWaterMs,
  });
  const assessed = engine.assess({
    snapshot: observed,
    needId: first.need.needId,
    reasonCode: first.need.reasonCode,
    severityBps: first.need.severityBps,
    boundedViewDigest: first.need.boundedViewDigest,
    candidateSearchLimit: first.need.candidateSearchLimit,
    evidenceDigests: first.need.evidenceDigests,
    detectedAtLogicalMs: first.need.detectedAtLogicalMs,
    expiresAtLogicalMs: first.need.expiresAtLogicalMs,
  });
  const {
    schemaVersion: _proposalSchema,
    proposalDigest: _proposalDigest,
    advisoryOnly: _proposalAdvisory,
    ...proposalInput
  } = first.proposal;
  const proposed = engine.propose({
    snapshot: observed,
    need: assessed,
    target: first.target,
    window: createMorphogenesisControlWindowV1(
      {
        windowId: "control-window:empty",
        scopeDigest: first.scope.scopeDigest,
        currentMorphologyEpoch: 1,
        observedAtLogicalMs: 220,
        transformations: [],
      },
      first.policy,
    ),
    proposal: proposalInput,
  });
  assert.equal(proposed.proposalDigest, first.proposal.proposalDigest);
  const {
    schemaVersion: _sourceSchema,
    sourceHeadDigest: _sourceDigest,
    ...sourceBody
  } = first.sourceHeads[0];
  const rolledBackHead = createMorphologySourceHeadV1({
    ...sourceBody,
    sourceRevision: sourceBody.sourceRevision - 1,
    sourceRecordDigest: sha("f"),
  });
  await assert.rejects(
    engine.observe({
      snapshotId: "snapshot:rollback",
      scope: first.scope,
      morphologyEpoch: 1,
      previousMorphologyDigest: null,
      implementationDigest: first.snapshot.implementationDigest,
      sourceHeads: [rolledBackHead, ...first.sourceHeads.slice(1)],
      components: first.components,
      population: first.snapshot.population,
      resources: first.snapshot.resources,
      observedAtLogicalMs: 200,
      logicalTimeHighWaterMs: 200,
    }),
    /rollback or equivocation/,
  );
  assert.throws(
    () =>
      engine.propose({
        snapshot: observed,
        need: assessed,
        target: first.target,
        window: createMorphogenesisControlWindowV1(
          {
            windowId: "control-window:wrong-process",
            scopeDigest: first.scope.scopeDigest,
            currentMorphologyEpoch: 1,
            observedAtLogicalMs: 220,
            transformations: [],
          },
          first.policy,
        ),
        proposal: { ...proposalInput, processDefinitionDigest: sha("d") },
      }),
    /unregistered process definition/,
  );
  const deniedEngine = new MorphogenesisProposalEngineV1({
    policy: first.policy,
    sourceResolution: {
      registryId: "source-registry:denied",
      registryVersion: 1,
      registryDigest: sha("1"),
      async resolve() { return null; },
    },
    processDefinitionDigest: first.proposal.processDefinitionDigest,
  });
  await assert.rejects(
    deniedEngine.observe({
      snapshotId: first.snapshot.snapshotId,
      scope: first.scope,
      morphologyEpoch: 1,
      previousMorphologyDigest: null,
      implementationDigest: first.snapshot.implementationDigest,
      sourceHeads: first.sourceHeads,
      components: first.components,
      population: first.snapshot.population,
      resources: first.snapshot.resources,
      observedAtLogicalMs: 200,
      logicalTimeHighWaterMs: 200,
    }),
    /source authentication failed/,
  );
});

test("snapshot fails closed on missing, stale and global-view claims", () => {
  const { policy, scope, sourceHeads, components, snapshot } = fixture();
  assert.throws(
    () =>
      createMorphologySnapshotV1({
        snapshotId: "snapshot:missing",
        scope,
        morphologyEpoch: 1,
        previousMorphologyDigest: null,
        policy,
        implementationDigest: sha("a"),
        sourceHeads: sourceHeads.filter(({ sourceClass }) => sourceClass !== "work"),
        components: components.filter(
          ({ componentKind }) => componentKind !== "work_contract",
        ),
        population: snapshot.population,
        resources: snapshot.resources,
        observedAtLogicalMs: 200,
        logicalTimeHighWaterMs: 200,
      }),
    /required morphology source class work is unavailable/,
  );
  assert.throws(
    () =>
      createMorphologySnapshotV1({
        snapshotId: "snapshot:stale",
        scope,
        morphologyEpoch: 1,
        previousMorphologyDigest: null,
        policy,
        implementationDigest: sha("a"),
        sourceHeads,
        components,
        population: snapshot.population,
        resources: snapshot.resources,
        observedAtLogicalMs: 500,
        logicalTimeHighWaterMs: 500,
      }),
    /stale or cross-scoped/,
  );
  assert.throws(
    () =>
      validateMorphologySnapshotV1(
        { ...snapshot, globallyExhaustive: true },
        policy,
      ),
    /fields are invalid/,
  );
  assert.throws(
    () =>
      createMorphogenesisPolicyV1({
        ...policy.policy,
        allowedOperators: [
          ...policy.policy.allowedOperators,
          "derive_agent",
        ],
      }),
    /not available in the first release/,
  );
});

test("morphology head CAS retains one exact successor and replays it", async () => {
  const { policy, scope, snapshot, proposal } = fixture();
  const store = new InMemoryMorphologyHeadStoreV1();
  const runtime = new MorphologyHeadRuntimeV1({
    store,
    maximumCommitAttempts: policy.policy.limits.maximumCommitAttempts,
  });
  const initial = createInitialMorphologyHeadV1({
    stateKey: "morphology-head:test",
    scopeDigest: scope.scopeDigest,
    policyDigest: policy.policyDigest,
    morphologyEpoch: 1,
    snapshotDigest: snapshot.snapshotDigest,
    logicalTimeMs: 220,
  });
  await runtime.initialize(initial);
  const commit = {
    stateKey: initial.stateKey,
    scopeDigest: initial.scopeDigest,
    policyDigest: initial.policyDigest,
    expectedMorphologyEpoch: 1,
    snapshotDigest: sha("f"),
    proposalDigest: proposal.proposalDigest,
    decisionDigest: sha("1"),
    receiptDigest: sha("2"),
    logicalTimeMs: 300,
  };
  const successor = await runtime.commit(commit);
  assert.equal(successor.morphologyEpoch, 2);
  assert.equal(successor.revision, 1);
  assert.equal((await runtime.commit(commit)).headDigest, successor.headDigest);
  await assert.rejects(
    runtime.commit({
      ...commit,
      proposalDigest: sha("3"),
      decisionDigest: sha("4"),
      receiptDigest: sha("5"),
    }),
    /stale or cross-scoped/,
  );
});

test("morphology activation commits the Team-backed successor head exactly once", async () => {
  const context = fixture();
  const heads = new MorphologyHeadRuntimeV1({
    store: new InMemoryMorphologyHeadStoreV1(),
    maximumCommitAttempts: 4,
  });
  await heads.initialize(
    createInitialMorphologyHeadV1({
      stateKey: "morphology-head:activation",
      scopeDigest: context.scope.scopeDigest,
      policyDigest: context.policy.policyDigest,
      morphologyEpoch: 1,
      snapshotDigest: context.snapshot.snapshotDigest,
      logicalTimeMs: 220,
    }),
  );
  const team = createMorphogenesisSuccessorTeamReceiptV1({
    operationId: "operation:team-activation",
    agentDigest: sha("1"),
    teamId: "team:activation",
    teamEpoch: 2,
    teamProposalDigest: sha("2"),
    jointWorkContractDigest: sha("3"),
    individualWorkContractDigests: [sha("4")],
    executionStateDigest: sha("7"),
    retainedArtifactDigests: [],
    invalidatedCausalClosureDigests: [],
    activatedAtLogicalMs: 230,
  });
  const port = new MorphologyHeadMorphogenesisActivationPortV1(heads);
  const input = {
    operationId: "operation:commit-morphology",
    morphologyHeadStateKey: "morphology-head:activation",
    scope: context.scope,
    expectedMorphologyEpoch: 1,
    proposalDigest: context.proposal.proposalDigest,
    decisionDigest: sha("5"),
    resultingSnapshotDigest: sha("6"),
    team,
    logicalTimeMs: 240,
  };
  const activated = await port.activate(input);
  assert.equal(activated.morphologyEpoch, 2);
  assert.equal(
    (await port.reconcile(input)).activationReceiptDigest,
    activated.activationReceiptDigest,
  );
});

test("catalog instantiation profile binds certified role and compiles through the host adapter", async () => {
  const blueprint = createDynamicRoleBlueprintV2({
    blueprintId: "role-blueprint:database-forensics",
    missionId: "mission:test",
    roleKey: "database_forensics",
    predecessorDefinitionDigest: null,
    guidance: ["Inspect the authorized database evidence."],
    requiredCapabilityKeys: ["database_forensics"],
    requestedToolNames: ["database_reader"],
    requestedActionClasses: ["read_evidence"],
    resourceCeilingUnits: 20,
    constraints: { evidenceOnly: true },
    proposerPeerId: "peer:planner",
    proposerCredibilityDigest: sha("1"),
    basisEvidenceDigests: [sha("2")],
    proposedAtLogicalMs: 100,
  });
  const role = compileGovernedRoleDefinitionV2({
    blueprint,
    authority: {
      missionId: "mission:test",
      authorityDigest: sha("3"),
      permittedCapabilityKeys: ["database_forensics"],
      permittedToolNames: ["database_reader"],
      permittedActionClasses: ["read_evidence"],
      maximumResourceUnits: 20,
      requiredConstraintKeys: ["evidenceOnly"],
      localRuleProgramDigest: sha("4"),
    },
    semanticGuaranteeDigest: sha("5"),
    definitionRevision: 1,
  });
  const roleCertification = createGovernedRoleCertificationV2({
    definitionDigest: role.definitionDigest,
    semanticGuaranteeDigest: role.semanticGuaranteeDigest,
    collectiveCertificateDigest: sha("6"),
    membershipConfigurationDigest: sha("7"),
    membershipEpoch: 1,
    validUntilLogicalMs: 1_000,
  });
  const profile = createAgentInstantiationProfileV1({
    profileId: "profile:database-forensics",
    profileVersion: 1,
    predecessorProfileDigest: null,
    tenantId: "tenant:test",
    roomId: "room:test",
    objectiveId: "objective:test",
    workItemId: "work:test",
    workItemRevision: 1,
    role,
    roleCertification,
    adapterId: "adapter:portable-agent",
    adapterVersion: "1",
    instructionArtifactId: "artifact:instructions",
    instructionArtifactDigest: sha("8"),
    toolSetArtifactId: "artifact:tools",
    toolSetArtifactDigest: sha("9"),
    memoryScopeId: "memory-scope:forensics",
    memoryScopeDigest: sha("a"),
    inputContractDigest: sha("b"),
    outputContractDigest: sha("c"),
    modelConstraintsDigest: sha("d"),
    resourceBudgetUnits: 10,
    interactionBudgetUnits: 100,
    maximumActionBudgetUnits: 5,
    requiredAssessorIds: ["assessor:safety"],
    requiredAttestationDigests: [sha("e")],
    authorId: "agent:architect",
    provenanceDigest: sha("f"),
    validFromLogicalMs: 100,
    expiresAtLogicalMs: 900,
  });
  const certification = createAgentInstantiationProfileCertificationV1({
    certificationId: "profile-certification:1",
    profileDigest: profile.profileDigest,
    policyDigest: sha("0"),
    roleCertificationDigest: profile.roleCertificationDigest,
    certifierId: "agent:certifier",
    certifierVersion: 1,
    certifierImplementationDigest: sha("1"),
    evidenceDigests: [sha("2")],
    certifiedAtLogicalMs: 120,
    validUntilLogicalMs: 800,
  });
  assert.equal(profile.creationMode, "catalog");
  assert.equal(profile.roleDefinitionDigest, role.definitionDigest);
  assert.equal(profile.instructionArtifactId, "artifact:instructions");
  assert.equal(certification.profileDigest, profile.profileDigest);
  assert.equal(
    validateAgentInstantiationProfileV1(profile, {
      role,
      roleCertification,
    }).profileDigest,
    profile.profileDigest,
  );
  assert.throws(
    () =>
      validateAgentInstantiationProfileV1(
        { ...profile, capabilityKeys: ["admin"] },
        { role, roleCertification },
      ),
    /binding or digest is invalid/,
  );
  const { scope } = fixture();
  const creationRequest =
    await compileAgentInstantiationProfileToCreationRequestV1({
      requestId: "agent-creation-request:1",
      parentAgentId: "agent:parent",
      requestedAgentId: "agent:database-forensics",
      requestedPeerId: "peer:database-forensics",
      requestedInstanceId: "instance:database-forensics:1",
      factoryId: "factory:test",
      scope,
      expectedProfilePolicyDigest: certification.policyDigest,
      proposedAuthorityDigest: profile.authorityCeilingDigest,
      parentAuthorityDigest: sha("9"),
      requestedAtLogicalMs: 130,
      expiresAtLogicalMs: 700,
      profile,
      profileCertification: certification,
      role,
      roleCertification,
      certification: { async verify() { return true; } },
    });
  assert.equal(creationRequest.adapterId, profile.adapterId);
  assert.deepEqual(creationRequest.capabilityKeys, profile.capabilityKeys);
  assert.equal(
    creationRequest.roleDefinitionDigest,
    profile.roleDefinitionDigest,
  );
  const lineageLink = createMorphogenesisLineageLinkV1({
    linkId: "lineage-link:forensics",
    proposalDigest: sha("0"),
    profileDigest: profile.profileDigest,
    profileCertificationDigest: certification.certificationDigest,
    agentId: creationRequest.requestedAgentId,
    agentLineageDigest: sha("1"),
    factoryReceiptDigest: sha("2"),
    membershipConfigurationDigest: sha("3"),
    membershipEpoch: 2,
    createdAtLogicalMs: 140,
    retirementReceiptDigest: null,
  });
  assert.equal(
    validateMorphogenesisLineageLinkV1(lineageLink).linkDigest,
    lineageLink.linkDigest,
  );
  assert.equal("authorityDigest" in lineageLink, false);
  await assert.rejects(
    compileAgentInstantiationProfileToCreationRequestV1({
      requestId: "agent-creation-request:denied",
      parentAgentId: "agent:parent",
      requestedAgentId: "agent:denied",
      requestedPeerId: "peer:denied",
      requestedInstanceId: "instance:denied:1",
      factoryId: "factory:test",
      scope,
      expectedProfilePolicyDigest: certification.policyDigest,
      proposedAuthorityDigest: profile.authorityCeilingDigest,
      parentAuthorityDigest: sha("9"),
      requestedAtLogicalMs: 130,
      expiresAtLogicalMs: 700,
      profile,
      profileCertification: certification,
      role,
      roleCertification,
      certification: { async verify() { return false; } },
    }),
    /certification was denied/,
  );
});

test("attestation composes runtime, capability, Trust and Inference evidence", async () => {
  const context = fixture();
  const agent = createMorphogenesisLifecycleAgentV1({
    agentId: "agent:attestation",
    peerId: "peer:attestation",
    instanceId: "instance:attestation:1",
    lineageDigest: sha("1"),
    capabilityKeys: ["database_forensics"],
    roleDefinitionDigest: sha("2"),
    membershipConfigurationDigest: sha("3"),
    membershipEpoch: 1,
    source: "catalog_created",
  });
  let trustEligible = true;
  const port = new TrustInferenceMorphogenesisAttestationPortV1({
    runtime: { async verify() { return sha("4"); } },
    capabilities: { async assess() { return [sha("5")]; } },
    trust: {
      async evaluate() {
        return {
          eligible: trustEligible,
          current: true,
          evidenceDigest: sha("6"),
        };
      },
    },
    inference: {
      async evaluate() {
        return { eligible: true, current: true, evidenceDigest: sha("7") };
      },
    },
    receiptTtlMs: 100,
  });
  const input = {
    operationId: "operation:attestation",
    scope: context.scope,
    proposalDigest: context.proposal.proposalDigest,
    agent,
    profile: { profileDigest: sha("8") },
    logicalTimeMs: 200,
  };
  const receipt = await port.attest(input);
  assert.equal(receipt.runtimeAttestationDigest, sha("4"));
  assert.deepEqual(receipt.eligibilityEvidenceDigests, [sha("6"), sha("7")]);
  trustEligible = false;
  await assert.rejects(port.attest(input), /attestation was denied/);
});

test("budget reservations prevent concurrent double spend and replay exactly", async () => {
  const { scope, proposal } = fixture();
  const authority = new InMemoryMorphogenesisBudgetReservationPortV1({
    scopeDigest: scope.scopeDigest,
    capacity: {
      maximumActiveAgents: 16,
      maximumNewAgents: 2,
      maximumConcurrentProvisioning: 2,
      maximumResourceUnits: 20,
      maximumInteractionUnits: 200,
      maximumActionUnits: 20,
      maximumInputTokens: 200,
      maximumOutputTokens: 200,
      maximumTotalTokens: 400,
      maximumDurationMs: 2_000,
      maximumCosts: [{ currency: "USD", micros: 2_000_000 }],
    },
  });
  const request = createMorphogenesisBudgetReservationRequestV1({
    reservationId: "reservation:1",
    scopeDigest: scope.scopeDigest,
    proposalDigest: proposal.proposalDigest,
    expectedMorphologyEpoch: 1,
    operationId: "operation:budget:1",
    budget: proposal.budget,
    reservedAtLogicalMs: 230,
    expiresAtLogicalMs: 500,
  });
  const reserved = await authority.reserve(request);
  assert.equal(reserved.status, "reserved");
  assert.equal((await authority.reserve(request)).reservationDigest, reserved.reservationDigest);
  const conflictingRequest = createMorphogenesisBudgetReservationRequestV1({
    reservationId: request.reservationId,
    scopeDigest: request.scopeDigest,
    proposalDigest: sha("9"),
    expectedMorphologyEpoch: request.expectedMorphologyEpoch,
    operationId: request.operationId,
    budget: request.budget,
    reservedAtLogicalMs: request.reservedAtLogicalMs,
    expiresAtLogicalMs: request.expiresAtLogicalMs,
  });
  await assert.rejects(
    authority.reserve(conflictingRequest),
    /identity was reused with changed input/,
  );
  const oversized = createMorphogenesisBudgetReservationRequestV1({
    ...request,
    reservationId: "reservation:2",
    operationId: "operation:budget:2",
    proposalDigest: sha("8"),
    budget: createMorphogenesisBudgetEnvelopeV1({
      ...proposal.budget,
      maximumNewAgents: 2,
      maximumConcurrentProvisioning: 1,
    }),
  });
  await assert.rejects(authority.reserve(oversized), /maximumNewAgents is exhausted/);
  const released = await authority.release({
    reservationId: request.reservationId,
    proposalDigest: request.proposalDigest,
    releaseOperationId: "operation:budget:release:1",
    reasonCode: "transition_completed",
    logicalTimeMs: 300,
  });
  assert.equal(released.status, "released");
  assert.equal(
    (
      await authority.release({
        reservationId: request.reservationId,
        proposalDigest: request.proposalDigest,
        releaseOperationId: "operation:budget:release:1",
        reasonCode: "transition_completed",
        logicalTimeMs: 300,
      })
    ).reservationDigest,
    released.reservationDigest,
  );
});

test("control window enforces cooldown, hysteresis and churn", () => {
  const { policy, scope, need } = fixture();
  const { schemaVersion: _needSchema, needDigest: _needDigest, ...needInput } =
    need;
  const controlNeed = createMorphogenesisNeedV1(
    {
      ...needInput,
      needId: "need:test:control",
      expiresAtLogicalMs: 900,
    },
    policy,
  );
  const transformation = createMorphogenesisTransformationHeadV1({
    morphologyEpoch: 1,
    proposalDigest: sha("1"),
    needReasonCode: "missing_capability",
    needSeverityBps: 7_000,
    acceptedAtLogicalMs: 100,
    receiptDigest: sha("2"),
  });
  const window = createMorphogenesisControlWindowV1(
    {
      windowId: "control-window:1",
      scopeDigest: scope.scopeDigest,
      currentMorphologyEpoch: 2,
      observedAtLogicalMs: 150,
      transformations: [transformation],
    },
    policy,
  );
  assert.throws(
    () =>
      assertMorphogenesisControlWindowAllowsV1({
        policy,
        window,
        need: controlNeed,
        logicalTimeMs: 200,
      }),
    /cooldown is active/,
  );
  assert.doesNotThrow(() =>
    assertMorphogenesisControlWindowAllowsV1({
      policy,
      window,
      need: controlNeed,
      logicalTimeMs: 700,
    }),
  );
  const lowerNeed = createMorphogenesisNeedV1(
    {
      ...needInput,
      needId: "need:test:lower",
      severityBps: 7_400,
      expiresAtLogicalMs: 900,
    },
    policy,
  );
  assert.throws(
    () =>
      assertMorphogenesisControlWindowAllowsV1({
        policy,
        window,
        need: lowerNeed,
        logicalTimeMs: 700,
      }),
    /hysteresis margin is not satisfied/,
  );
  const fullWindow = Array.from({ length: 4 }, (_, index) =>
    createMorphogenesisTransformationHeadV1({
      morphologyEpoch: index + 1,
      proposalDigest: sha("3456"[index]),
      needReasonCode: "missing_capability",
      needSeverityBps: 6_000 + index,
      acceptedAtLogicalMs: 100 + index,
      receiptDigest: sha("789a"[index]),
    }),
  );
  assert.throws(
    () =>
      createMorphogenesisControlWindowV1(
        {
          windowId: "control-window:exhausted",
          scopeDigest: scope.scopeDigest,
          currentMorphologyEpoch: 6,
          observedAtLogicalMs: 200,
          transformations: [
            ...fullWindow,
            createMorphogenesisTransformationHeadV1({
              morphologyEpoch: 5,
              proposalDigest: sha("b"),
              needReasonCode: "missing_capability",
              needSeverityBps: 6_100,
              acceptedAtLogicalMs: 105,
              receiptDigest: sha("c"),
            }),
          ],
        },
        policy,
      ),
    /window is exhausted/,
  );
});

test("authorized agent decision is exact, independent and drives the fixed Workflow DAG", async () => {
  const { policy, proposal } = fixture();
  let candidate;
  const authorizations = {
    async issue({ candidate: current }) {
      return createMorphogenesisDecisionAuthorizationV1({
        authorizationId: "decision-authorization:1",
        candidateDigest: current.candidateDigest,
        route: current.decisionRoute,
        actorType: "agent",
        actorId: "agent:decision-supervisor",
        actorMandateDigest: sha("1"),
        independenceGroupId: "independence:supervision",
        disposition: "approved",
        proofDigest: sha("2"),
        issuedAtLogicalMs: 235,
        expiresAtLogicalMs: 470,
      });
    },
    async verify() {
      return true;
    },
  };
  const decisionRuntime = new MorphogenesisDecisionRuntimeV1({
    decisionPortId: "decision-port:test",
    decisionPortVersion: 1,
    decisionPortImplementationDigest: sha("3"),
    policy,
    proposals: {
      async resolve(proposalDigest) {
        return proposalDigest === proposal.proposalDigest ? proposal : null;
      },
    },
    authorizations,
    store: new InMemoryMorphogenesisDecisionStoreV1(),
  });
  candidate = await decisionRuntime.prepare({
    candidateId: "decision-candidate:1",
    proposal,
    policy,
    membershipConfigurationDigest: sha("4"),
    membershipEpoch: 1,
    authorityId: "authority:morphogenesis",
    authorityEpoch: 1,
    workContractDigest: sha("5"),
    preparedAtLogicalMs: 230,
    expiresAtLogicalMs: 480,
  });
  const decision = await decisionRuntime.decide({
    candidate,
    logicalTimeMs: 240,
  });
  assert.equal(decision.authorization.disposition, "approved");
  assert.equal(
    (
      await decisionRuntime.decide({
        candidate,
        logicalTimeMs: 250,
      })
    ).decisionDigest,
    decision.decisionDigest,
  );

  const definition = createMorphogenesisCatalogLifecycleProcessDefinitionV1();
  const taskDefinitions =
    createMorphogenesisCatalogLifecycleTaskDefinitionsV1();
  const processBinding = createMorphogenesisProcessBindingV1({
    tenantId: "tenant:test",
    runId: "morphogenesis-run:1",
    executionStateKey: "morphogenesis-execution:workflow-test",
    processDefinitionDigest: definition.definitionDigest,
    scopeDigest: candidate.scopeDigest,
    proposalDigest: candidate.proposalDigest,
    targetDigest: candidate.targetDigest,
    candidateDigest: candidate.candidateDigest,
    policyDigest: candidate.policyDigest,
    morphologyEpoch: candidate.morphologyEpoch,
    boundAtLogicalMs: 240,
  });
  assert.equal(processBinding.candidateDigest, candidate.candidateDigest);
  const executed = [];
  const executor = {
    async execute(input) {
      executed.push(input.stage.stageId);
      if (input.stage.stageId === "verify_decision")
        await verifyMorphogenesisDecisionAfterGateV1({
          decisions: decisionRuntime,
          candidate,
          logicalTimeMs: 250,
        });
      return { status: "completed" };
    },
  };
  const runner = new InMemoryProcessRunnerV1(undefined, {
    taskExecutor: executor,
    protectedTaskExecutor: executor,
    taskBindingResolver: new MorphogenesisTaskExecutionBindingResolverV1({
      policyDigest: policy.policyDigest,
      toolsetDigest: sha("9"),
      runtimeImplementationDigest: sha("a"),
    }),
    gateProvider: new MorphogenesisDecisionGateProviderV1({
      decisions: decisionRuntime,
      candidates: {
        async resolve(candidateDigest) {
          return candidateDigest === candidate.candidateDigest
            ? candidate
            : null;
        },
      },
      clock: { resolve() { return 250; } },
    }),
  });
  for (const taskDefinition of taskDefinitions)
    await runner.registerTaskDefinition("tenant:test", taskDefinition);
  await runner.registerProcessDefinition("tenant:test", definition);
  const temporalNotifications = [];
  const temporalRunner = new TemporalProcessRunnerV1(
    runner,
    new TemporalWorkflowNotifierV1({
      client: {
        workflow: {
          async signalWithStart(_workflow, options) {
            temporalNotifications.push(options);
          },
        },
      },
      taskQueue: "morphogenesis-test",
    }),
  );
  const started = await temporalRunner.start({
    tenantId: "tenant:test",
    runId: "morphogenesis-run:1",
    processId: definition.processId,
    processVersion: definition.version,
    operationId: "workflow-operation:start:1",
    idempotencyKey: "workflow-start:1",
    input: {
      candidateDigest: candidate.candidateDigest,
      decisionRoute: candidate.decisionRoute,
    },
    logicalTime: "2026-08-29T12:00:00.000Z",
  });
  assert.equal(started.run.status, "waiting");
  assert.equal(
    started.run.stageStates.find(({ stageId }) => stageId === "await_outcome")
      .status,
    "waiting",
  );
  const completed = await temporalRunner.signal({
    tenantId: "tenant:test",
    runId: started.run.runId,
    operationId: "workflow-operation:outcome:1",
    idempotencyKey: "workflow-outcome:1",
    signal: {
      signalId: "morphogenesis-outcome:1",
      signalType: "agentplat.morphogenesis.outcome.v1",
      correlationKey: "morphogenesis",
      sourceType: "morphogenesis_outcome",
      sourceId: "outcome:test",
      receivedAt: "2026-08-29T12:01:00.000Z",
    },
    logicalTime: "2026-08-29T12:01:00.000Z",
  });
  assert.equal(
    completed.run.status,
    "completed",
    JSON.stringify(completed.run.stageStates),
  );
  assert.equal(temporalNotifications.length, 2);
  assert.deepEqual(executed, [
    "observe",
    "assess",
    "propose",
    "verify_decision",
    "prepare",
    "provision",
    "attest",
    "enroll",
    "activate",
    "commit_morphology",
    "checkpoint",
    "fence",
    "drain",
    "release_budget",
    "evaluate",
  ]);

  const selfApprovalRuntime = new MorphogenesisDecisionRuntimeV1({
    decisionPortId: "decision-port:self",
    decisionPortVersion: 1,
    decisionPortImplementationDigest: sha("6"),
    policy,
    proposals: { async resolve() { return proposal; } },
    authorizations: {
      async issue({ candidate: current }) {
        return createMorphogenesisDecisionAuthorizationV1({
          authorizationId: "decision-authorization:self",
          candidateDigest: current.candidateDigest,
          route: "authorized_agent",
          actorType: "agent",
          actorId: proposal.proposerId,
          actorMandateDigest: sha("7"),
          independenceGroupId: "independence:self",
          disposition: "approved",
          proofDigest: sha("8"),
          issuedAtLogicalMs: 235,
          expiresAtLogicalMs: 470,
        });
      },
      async verify() { return true; },
    },
    store: new InMemoryMorphogenesisDecisionStoreV1(),
  });
  await assert.rejects(
    selfApprovalRuntime.decide({ candidate, logicalTimeMs: 240 }),
    /stale or prohibited/,
  );
});

test("stale decision authority is rejected without persisting a decision", async () => {
  const { policy, proposal } = fixture();
  const store = new InMemoryMorphogenesisDecisionStoreV1();
  const runtime = new MorphogenesisDecisionRuntimeV1({
    decisionPortId: "decision-port:stale-authority",
    decisionPortVersion: 1,
    decisionPortImplementationDigest: sha("1"),
    policy,
    proposals: {
      async resolve(proposalDigest) {
        return proposalDigest === proposal.proposalDigest ? proposal : null;
      },
    },
    authorizations: {
      async issue({ candidate }) {
        return createMorphogenesisDecisionAuthorizationV1({
          authorizationId: "decision-authorization:stale",
          candidateDigest: candidate.candidateDigest,
          route: "authorized_agent",
          actorType: "agent",
          actorId: "agent:stale-supervisor",
          actorMandateDigest: sha("2"),
          independenceGroupId: "independence:stale-supervision",
          disposition: "approved",
          proofDigest: sha("3"),
          issuedAtLogicalMs: 231,
          expiresAtLogicalMs: 235,
        });
      },
      async verify() {
        return true;
      },
    },
    store,
  });
  const candidate = await runtime.prepare({
    candidateId: "decision-candidate:stale-authority",
    proposal,
    policy,
    membershipConfigurationDigest: sha("4"),
    membershipEpoch: 1,
    authorityId: "authority:stale",
    authorityEpoch: 1,
    workContractDigest: sha("5"),
    preparedAtLogicalMs: 230,
    expiresAtLogicalMs: 480,
  });
  await assert.rejects(
    runtime.decide({ candidate, logicalTimeMs: 240 }),
    /stale or prohibited/,
  );
  assert.equal(await store.load(candidate.candidateDigest), null);
});

test("authorized person route reuses an exact Agent Room approval", () => {
  const context = fixture();
  const {
    schemaVersion: _schema,
    proposalDigest: _digest,
    advisoryOnly: _advisory,
    ...proposalInput
  } = context.proposal;
  const proposal = createMorphogenesisProposalV1(
    {
      ...proposalInput,
      proposalId: "proposal:test:person",
      decisionRoute: "authorized_person",
    },
    context,
  );
  const candidate = createMorphogenesisDecisionCandidateV1({
    candidateId: "decision-candidate:person",
    proposal,
    policy: context.policy,
    membershipConfigurationDigest: sha("1"),
    membershipEpoch: 1,
    authorityId: "authority:morphogenesis",
    authorityEpoch: 1,
    workContractDigest: sha("2"),
    preparedAtLogicalMs: 230,
    expiresAtLogicalMs: 480,
  });
  const configuration = createAgentRoomMorphogenesisGateConfigurationV1({
    candidate,
    roomId: "room:test",
    requestedBy: "agent:planner",
  });
  assert.equal(configuration.targetId, candidate.candidateId);
  assert.match(configuration.action, new RegExp(candidate.candidateDigest));
  const approval = {
    id: "approval:morphogenesis:person",
    tenantId: "tenant:test",
    roomId: "room:test",
    targetType: "action",
    targetId: candidate.candidateId,
    action: configuration.action,
    status: "approved",
    requestedBy: "agent:planner",
    decidedBy: "person:reviewer",
    createdAt: "2026-08-29T12:00:00.000Z",
    updatedAt: "2026-08-29T12:01:00.000Z",
    decidedAt: "2026-08-29T12:01:00.000Z",
  };
  const authorization =
    createAgentRoomMorphogenesisDecisionAuthorizationV1({
      candidate,
      approval,
      expectedTenantId: "tenant:test",
      expectedRoomId: "room:test",
      actorMandateDigest: sha("3"),
      independenceGroupId: "independence:human-review",
      proofDigest: sha("4"),
      decidedAtLogicalMs: 240,
      expiresAtLogicalMs: 470,
    });
  assert.equal(authorization.actorType, "person");
  assert.equal(authorization.actorId, "person:reviewer");
  assert.equal(authorization.candidateDigest, candidate.candidateDigest);
  assert.throws(
    () =>
      createAgentRoomMorphogenesisDecisionAuthorizationV1({
        candidate,
        approval: { ...approval, targetId: "decision-candidate:other" },
        expectedTenantId: "tenant:test",
        expectedRoomId: "room:test",
        actorMandateDigest: sha("3"),
        independenceGroupId: "independence:human-review",
        proofDigest: sha("4"),
        decidedAtLogicalMs: 240,
        expiresAtLogicalMs: 470,
      }),
    /does not bind/,
  );
});

test("all policy-selected decision routes normalize to the same inert authorization contract", () => {
  const cases = [
    ["local_policy", "policy"],
    ["authorized_agent", "agent"],
    ["authorized_person", "person"],
    ["collective", "collective"],
    ["composite", "composite"],
  ];
  for (const [route, actorType] of cases) {
    const authorization = createMorphogenesisDecisionAuthorizationV1({
      authorizationId: `authorization:${route}`,
      candidateDigest: sha("1"),
      route,
      actorType,
      actorId: `actor:${route}`,
      actorMandateDigest: sha("2"),
      independenceGroupId: `independence:${route}`,
      disposition: "approved",
      proofDigest: sha("3"),
      issuedAtLogicalMs: 100,
      expiresAtLogicalMs: 200,
    });
    assert.equal(authorization.route, route);
    assert.equal(authorization.actorType, actorType);
  }
  assert.throws(
    () =>
      createMorphogenesisDecisionAuthorizationV1({
        authorizationId: "authorization:wrong-actor",
        candidateDigest: sha("1"),
        route: "authorized_agent",
        actorType: "person",
        actorId: "person:wrong",
        actorMandateDigest: sha("2"),
        independenceGroupId: "independence:wrong",
        disposition: "approved",
        proofDigest: sha("3"),
        issuedAtLogicalMs: 100,
        expiresAtLogicalMs: 200,
      }),
    /route and actor type differ/,
  );
});

test("composite review requires independent approved actors", () => {
  const context = fixture();
  const policy = createMorphogenesisPolicyV1({
    ...context.policy.policy,
    allowedDecisionRoutes: ["composite"],
  });
  const proposal = {
    ...context.proposal,
    proposalId: "proposal:test:composite",
    decisionRoute: "composite",
    proposalDigest: sha("5"),
  };
  const candidate = createMorphogenesisDecisionCandidateV1({
    candidateId: "candidate:composite",
    proposal,
    policy,
    membershipConfigurationDigest: sha("6"),
    membershipEpoch: 1,
    authorityId: "authority:composite",
    authorityEpoch: 1,
    workContractDigest: sha("7"),
    preparedAtLogicalMs: 230,
    expiresAtLogicalMs: 480,
  });
  const component = (route, actorType, actorId, group, character) =>
    createMorphogenesisDecisionAuthorizationV1({
      authorizationId: `authorization:${actorId}`,
      candidateDigest: candidate.candidateDigest,
      route,
      actorType,
      actorId,
      actorMandateDigest: sha(character),
      independenceGroupId: group,
      disposition: "approved",
      proofDigest: sha(character),
      issuedAtLogicalMs: 235,
      expiresAtLogicalMs: 470,
    });
  const agentApproval = component(
    "authorized_agent",
    "agent",
    "agent:reviewer",
    "independence:agent",
    "8",
  );
  const personApproval = component(
    "authorized_person",
    "person",
    "person:reviewer",
    "independence:person",
    "9",
  );
  const composite = createCompositeMorphogenesisDecisionAuthorizationV1({
    candidate,
    components: [agentApproval, personApproval],
    minimumIndependentApprovals: 2,
    issuedAtLogicalMs: 240,
    expiresAtLogicalMs: 460,
  });
  assert.equal(composite.route, "composite");
  assert.equal(composite.actorType, "composite");
  assert.throws(
    () =>
      createCompositeMorphogenesisDecisionAuthorizationV1({
        candidate,
        components: [
          agentApproval,
          { ...personApproval, independenceGroupId: agentApproval.independenceGroupId },
        ],
        minimumIndependentApprovals: 2,
        issuedAtLogicalMs: 240,
        expiresAtLogicalMs: 460,
      }),
    /digest is invalid|duplicated or dependent/,
  );
});

test("Room and Mesh projections remain deterministic, bounded and authority-neutral", async () => {
  const context = fixture();
  const room = {
    id: "room:test",
    tenantId: "tenant:test",
    status: "active",
  };
  const diff = projectMorphogenesisDiffToRoomArtifactV1({
    room,
    snapshot: context.snapshot,
    need: context.need,
    target: context.target,
    proposal: context.proposal,
    createdBy: "agent:planner",
  });
  assert.equal(diff.kind, "room.artifact");
  assert.equal(diff.input.metadata.proposalDigest, context.proposal.proposalDigest);
  assert.equal(diff.input.content.currentPopulation, 2);
  assert.equal("authority" in diff.input.content, false);
  const mesh = await projectMorphogenesisNeedToMeshV1({
    snapshot: context.snapshot,
    need: context.need,
    target: context.target,
  });
  assert.equal(mesh.unsigned, true);
  assert.equal(mesh.meshId, context.scope.meshId);
  assert.deepEqual(mesh.requiredCapabilityKeys, ["database_forensics"]);
  assert.match(mesh.projectionDigest, /^sha256:/);
  const delivered = await new MorphogenesisMeshPublisherV1({
    async send(projection) {
      return {
        schemaVersion: 1,
        projectionDigest: projection.projectionDigest,
        senderPeerId: "peer:publisher",
        senderInstanceId: "instance:publisher:1",
        membershipConfigurationDigest: sha("0"),
        membershipEpoch: 1,
        envelopeDigest: sha("1"),
        sentAtLogicalMs: 250,
      };
    },
    async verify() { return true; },
  }).publish(mesh);
  assert.equal(delivered.projectionDigest, mesh.projectionDigest);
  const receipt = createMorphogenesisReceiptV1({
    receiptId: "receipt:projection",
    scopeDigest: context.scope.scopeDigest,
    proposalDigest: context.proposal.proposalDigest,
    decisionDigest: sha("1"),
    budgetReservationDigest: sha("2"),
    budgetReleaseDigest: sha("3"),
    activationReceiptDigest: sha("4"),
    continuityReceiptDigest: sha("5"),
    fenceReceiptDigest: sha("6"),
    terminalAgentReceiptDigest: sha("7"),
    resultingSnapshotDigest: sha("8"),
    resultingMorphologyEpoch: 2,
    disposition: "success",
    outcomeEvidenceDigests: [sha("9")],
    evaluatedAtLogicalMs: 500,
  });
  const projectedReceipt = projectMorphogenesisReceiptToRoomArtifactV1({
    room,
    receipt,
  });
  assert.equal(projectedReceipt.input.metadata.receiptDigest, receipt.receiptDigest);
  assert.throws(
    () =>
      projectMorphogenesisDiffToRoomArtifactV1({
        room: { ...room, id: "room:other" },
        snapshot: context.snapshot,
        need: context.need,
        target: context.target,
        proposal: context.proposal,
      }),
    /matching Room/,
  );
});

test("Room participation is explicit and grants no Mesh or Work authority", async () => {
  const context = fixture();
  const agent = createMorphogenesisLifecycleAgentV1({
    agentId: "agent:room-specialist",
    peerId: "peer:room-specialist",
    instanceId: "instance:room-specialist:1",
    lineageDigest: sha("1"),
    capabilityKeys: ["database_forensics"],
    roleDefinitionDigest: sha("2"),
    membershipConfigurationDigest: sha("3"),
    membershipEpoch: 2,
    source: "catalog_created",
  });
  const profile = {
    tenantId: context.scope.tenantId,
    roomId: context.scope.roomId,
    missionId: context.scope.missionId,
    adapterId: "adapter:portable-agent",
    roleDefinitionDigest: agent.roleDefinitionDigest,
    profileDigest: sha("4"),
  };
  let applied;
  const port = new MorphogenesisRoomParticipationPortV1({
    async addParticipant(tenantId, roomId, input) {
      applied = { tenantId, roomId, input };
      return { ...input, tenantId };
    },
  });
  const receipt = await port.apply({
    operationId: "operation:room-participation",
    room: { id: context.scope.roomId, tenantId: context.scope.tenantId, status: "active" },
    agent,
    profile,
    actorId: "agent:room-service",
    appliedAt: "2026-08-29T12:00:00.000Z",
  });
  assert.equal(receipt.participantId, agent.agentId);
  assert.deepEqual(applied.input.permissions, []);
  assert.equal(applied.input.authorityLevel, 0);
  assert.equal("workContract" in applied.input, false);
  assert.equal("membership" in applied.input, false);
});

test("delayed outcomes bind the exact Workflow Task Run and missing coverage stays indeterminate", async () => {
  const store = new InMemoryWorkflowStoreV1();
  const runner = new InMemoryProcessRunnerV1(store, {
    taskExecutor: { async execute() { return { status: "completed" }; } },
  });
  const definition = createProcessDefinitionV1({
    processId: "morphogenesis-outcome-test",
    version: "1",
    name: "Morphogenesis outcome test",
    stages: [
      {
        schemaVersion: 1,
        stageId: "activate",
        name: "Activate",
        kind: "task",
        taskDefinitionId: "morphogenesis-outcome-activate",
        taskDefinitionVersion: "1",
        dependsOn: [],
      },
    ],
  });
  const taskDefinition = createTaskDefinitionV1({
    taskDefinitionId: "morphogenesis-outcome-activate",
    version: "1",
    name: "Activate",
    handlerKey: "handler:morphogenesis-outcome",
    handlerDigest: digestWorkflowJsonV1("test-handler", {
      handler: "morphogenesis-outcome",
    }),
    effectClass: "internal",
  });
  await runner.registerTaskDefinition("tenant:test", taskDefinition);
  await runner.registerProcessDefinition("tenant:test", definition);
  const run = (
    await runner.start({
      tenantId: "tenant:test",
      runId: "run:morphogenesis-outcome",
      processId: definition.processId,
      processVersion: definition.version,
      operationId: "operation:morphogenesis-outcome",
      idempotencyKey: "morphogenesis-outcome",
      logicalTime: "2026-08-29T12:00:00.000Z",
    })
  ).run;
  const [taskRun] = await store.listTaskRuns({
    tenantId: "tenant:test",
    processRunId: run.runId,
  });
  const outcomes = new InMemoryTaskOutcomeStoreV1();
  const outcomeRuntime = new WorkflowOutcomeRuntimeV1(store, outcomes);
  const recorded = await outcomeRuntime.record({
    tenantId: "tenant:test",
    outcomeId: "outcome:morphogenesis-positive",
    taskRunId: taskRun.taskRunId,
    taskExecutionBindingDigest: taskRun.binding.bindingDigest,
    outcomeType: "morphogenesis_result",
    verdict: "positive",
    scoreBasisPoints: 9_000,
    sourceType: "review",
    sourceId: "review:1",
    observedAt: "2026-08-29T12:01:00.000Z",
    recordedAt: "2026-08-29T12:01:00.000Z",
    evidenceReferenceIds: ["artifact:review"],
  });
  const binding = createMorphogenesisProcessBindingV1({
    tenantId: "tenant:test",
    runId: run.runId,
    executionStateKey: "execution:morphogenesis-outcome",
    processDefinitionDigest: definition.definitionDigest,
    scopeDigest: sha("1"),
    proposalDigest: sha("2"),
    targetDigest: sha("3"),
    candidateDigest: sha("4"),
    policyDigest: sha("5"),
    morphologyEpoch: 1,
    boundAtLogicalMs: 100,
  });
  const evaluationOptions = {
    taskRuns: store,
    coveragePolicy: {
      outcomeType: "morphogenesis_result",
      windowMs: 60 * 60 * 1_000,
      minimumConcludedOutcomes: 1,
      maximumObservationLagMs: 60 * 60 * 1_000,
      maximumUnresolvedBasisPoints: 0,
    },
    outcomeType: "morphogenesis_result",
    logicalTime: () => "2026-08-29T12:02:00.000Z",
  };
  const positive = await new MorphogenesisWorkflowOutcomeEvaluationPortV1({
    ...evaluationOptions,
    outcomes,
  }).evaluate({ binding, logicalTimeMs: 200 });
  assert.equal(positive.disposition, "success");
  assert.equal(
    positive.outcomeEvidenceDigests.includes(recorded.outcome.outcomeDigest),
    true,
  );
  const missing = await new MorphogenesisWorkflowOutcomeEvaluationPortV1({
    ...evaluationOptions,
    outcomes: new InMemoryTaskOutcomeStoreV1(),
  }).evaluate({ binding, logicalTimeMs: 200 });
  assert.equal(missing.disposition, "indeterminate");
});

test("post-activation failure becomes an explicit advisory successor recovery", () => {
  const receipt = createMorphogenesisReceiptV1({
    receiptId: "receipt:failed-morphology",
    scopeDigest: sha("1"),
    proposalDigest: sha("2"),
    decisionDigest: sha("3"),
    budgetReservationDigest: sha("4"),
    budgetReleaseDigest: sha("5"),
    activationReceiptDigest: sha("6"),
    continuityReceiptDigest: sha("7"),
    fenceReceiptDigest: sha("8"),
    terminalAgentReceiptDigest: sha("9"),
    resultingSnapshotDigest: sha("a"),
    resultingMorphologyEpoch: 2,
    disposition: "successor_recovery_required",
    outcomeEvidenceDigests: [sha("b")],
    evaluatedAtLogicalMs: 500,
  });
  const recovery = createMorphogenesisSuccessorRecoveryV1({
    receipt,
    reasonEvidenceDigests: receipt.outcomeEvidenceDigests,
    proposedAtLogicalMs: 510,
  });
  assert.equal(recovery.currentMorphologyEpoch, 2);
  assert.equal(recovery.expectedSuccessorEpoch, 3);
  assert.equal(recovery.advisoryOnly, true);
  assert.throws(
    () =>
      createMorphogenesisSuccessorRecoveryV1({
        receipt: { ...receipt, disposition: "success" },
        reasonEvidenceDigests: [sha("b")],
        proposedAtLogicalMs: 510,
      }),
    /successful Morphogenesis receipt/,
  );
});

test("compacted proposal coordinates retain replay-protection tombstones", async () => {
  const store = new InMemoryMorphogenesisReplayTombstoneStoreV1();
  const tombstone = createMorphogenesisReplayTombstoneV1({
    kind: "proposal",
    identityDigest: sha("1"),
    scopeDigest: sha("2"),
    morphologyEpoch: 2,
    terminalDigest: sha("3"),
    compactedAtLogicalMs: 500,
  });
  assert.equal(await store.record(tombstone), "created");
  assert.equal(await store.record(tombstone), "replayed");
  assert.equal(
    (await store.load({
      kind: tombstone.kind,
      identityDigest: tombstone.identityDigest,
    })).tombstoneDigest,
    tombstone.tombstoneDigest,
  );
  await assert.rejects(
    store.record({ ...tombstone, terminalDigest: sha("4") }),
    /tombstone digest is invalid|identity conflict/,
  );
});

test("collective route maps an authenticated application agreement certificate", async () => {
  const context = fixture();
  const policy = createMorphogenesisPolicyV1({
    ...context.policy.policy,
    allowedDecisionRoutes: ["collective"],
  });
  const proposal = {
    ...context.proposal,
    proposalId: "proposal:test:collective",
    decisionRoute: "collective",
    proposalDigest: sha("6"),
  };
  const candidate = createMorphogenesisDecisionCandidateV1({
    candidateId: "decision-candidate:collective",
    proposal,
    policy,
    membershipConfigurationDigest: sha("7"),
    membershipEpoch: 3,
    authorityId: "authority:collective",
    authorityEpoch: 2,
    workContractDigest: sha("8"),
    preparedAtLogicalMs: 230,
    expiresAtLogicalMs: 470,
  });
  const certificate = {
    schemaVersion: 1,
    kind: "commit_certificate",
    certificateId: "agreement-certificate:morphogenesis",
    coordinate: {
      policyDomainId: "policy-domain:test",
      slotId: "slot:morphogenesis",
      height: 1,
      round: 0,
      membershipEpoch: 3,
      membershipConfigurationDigest: sha("7"),
    },
    proposalId: "agreement-proposal:morphogenesis",
    value: {
      schemaVersion: 1,
      kind: "application",
      valueId: `morphogenesis:${candidate.candidateId}`,
      previousCommitDigest: null,
      payload: {
        candidateDigest: candidate.candidateDigest,
        actorMandateDigest: sha("9"),
        independenceGroupId: "independence:collective",
        disposition: "approved",
        expiresAtLogicalMs: 460,
      },
      valueDigest: sha("a"),
    },
    prevoteCertificate: {},
    precommitCertificate: {},
    committedAtLogicalMs: 240,
    certificateDigest: sha("b"),
  };
  const issuer = new CollectiveAgreementMorphogenesisDecisionIssuerV1({
    async resolve() { return certificate; },
    async verify() { return true; },
  });
  const authorization = await issuer.issue({
    candidate,
    logicalTimeMs: 245,
  });
  assert.equal(authorization.route, "collective");
  assert.equal(authorization.actorType, "collective");
  assert.equal(await issuer.verify({ candidate, authorization, logicalTimeMs: 250 }), true);
});

test("execution runtime recruits an eligible existing agent and activates a Work-bound successor Team", async () => {
  const context = fixture();
  const searchRequest = createMorphogenesisCandidateSearchRequestV1({
    requestId: "candidate-search:recruit",
    scopeDigest: context.scope.scopeDigest,
    positionDigest: context.target.positions[0].positionDigest,
    requiredCapabilityKeys: ["database_forensics"],
    membershipConfigurationDigest: sha("1"),
    membershipEpoch: 1,
    viewId: "mesh-view:recruit",
    viewDigest: sha("2"),
    searchLimit: 8,
    requestedAtLogicalMs: 100,
    expiresAtLogicalMs: 500,
  });
  const candidate = createMorphogenesisExistingCandidateV1({
    candidateId: "candidate:existing-forensics",
    agentId: "agent:existing-forensics",
    peerId: "peer:existing-forensics",
    instanceId: "instance:existing-forensics:1",
    lineageDigest: sha("3"),
    capabilityKeys: ["database_forensics"],
    sourceEvidenceDigest: sha("4"),
    membershipConfigurationDigest: searchRequest.membershipConfigurationDigest,
    membershipEpoch: searchRequest.membershipEpoch,
    locallyEvaluatedScoreMicros: 9_000,
    budgetUnits: 5,
    observedAtLogicalMs: 120,
    validUntilLogicalMs: 400,
  });
  const searchResult = createMorphogenesisCandidateSearchResultV1(
    {
      requestDigest: searchRequest.requestDigest,
      status: "eligible_candidates",
      completeWithinDeclaredView: true,
      searchedCandidateCount: 1,
      candidates: [candidate],
      observedAtLogicalMs: 130,
    },
    searchRequest,
  );
  const agent = createMorphogenesisLifecycleAgentV1({
    agentId: candidate.agentId,
    peerId: candidate.peerId,
    instanceId: candidate.instanceId,
    lineageDigest: candidate.lineageDigest,
    capabilityKeys: candidate.capabilityKeys,
    roleDefinitionDigest: sha("5"),
    membershipConfigurationDigest:
      candidate.membershipConfigurationDigest,
    membershipEpoch: candidate.membershipEpoch,
    source: "existing",
  });
  let createCalls = 0;
  const runtime = new MorphogenesisExecutionRuntimeV1({
    ...executionPostCommitPorts(),
    discovery: { async search() { return searchResult; } },
    profiles: { async resolve() { return null; } },
    lifecycle: {
      async createAndEnroll() { createCalls += 1; throw new Error("unexpected creation"); },
      async reconcileCreateAndEnroll() { throw new Error("unexpected reconciliation"); },
      async eligibility(input) {
        return input.peerId === agent.peerId &&
          input.instanceId === agent.instanceId
          ? agent
          : null;
      },
    },
    attestation: {
      async attest(input) {
        return createMorphogenesisAgentAttestationV1({
          operationId: input.operationId,
          agentDigest: input.agent.agentDigest,
          profileDigest: null,
          runtimeAttestationDigest: sha("6"),
          capabilityAssessmentDigests: [sha("7")],
          eligibilityEvidenceDigests: [sha("8")],
          attestedAtLogicalMs: input.logicalTimeMs,
          validUntilLogicalMs: 450,
        });
      },
      async reconcile(input) { return this.attest(input); },
    },
    teams: {
      async activateSuccessor(input) {
        return createMorphogenesisSuccessorTeamReceiptV1({
          operationId: input.operationId,
          agentDigest: input.agent.agentDigest,
          teamId: "team:successor",
          teamEpoch: 2,
          teamProposalDigest: sha("9"),
          jointWorkContractDigest: sha("a"),
          individualWorkContractDigests: [sha("b")],
          executionStateDigest: sha("c"),
          retainedArtifactDigests: [sha("d")],
          invalidatedCausalClosureDigests: [],
          activatedAtLogicalMs: input.logicalTimeMs,
        });
      },
      async reconcileActivation(input) { return this.activateSuccessor(input); },
    },
    store: new InMemoryMorphogenesisExecutionStoreV1(),
    maximumCommitAttempts: 4,
  });
  const guards = executionGuards(context, "recruit");
  const record = await runtime.initialize({
    stateKey: "morphogenesis-execution:recruit",
    scope: context.scope,
    proposalDigest: context.proposal.proposalDigest,
    targetDigest: context.target.targetDigest,
    decision: guards.decision,
    budgetReservation: guards.budgetReservation,
    morphologyHeadStateKey: "morphology-head:recruit",
    expectedMorphologyEpoch: context.proposal.expectedCurrentEpoch,
    resultingSnapshotDigest: sha("e"),
    positionDigest: context.target.positions[0].positionDigest,
    requiredCapabilityKeys: ["database_forensics"],
    searchRequest,
    profile: null,
    profileCertificationDigest: null,
    logicalTimeMs: 150,
  });
  const definition = createMorphogenesisCatalogLifecycleProcessDefinitionV1();
  const runId = "morphogenesis-run:execution-recruit";
  const binding = createMorphogenesisProcessBindingV1({
    tenantId: context.scope.tenantId,
    runId,
    executionStateKey: record.stateKey,
    processDefinitionDigest: definition.definitionDigest,
    scopeDigest: context.scope.scopeDigest,
    proposalDigest: context.proposal.proposalDigest,
    targetDigest: context.target.targetDigest,
    candidateDigest: guards.decision.candidate.candidateDigest,
    policyDigest: context.policy.policyDigest,
    morphologyEpoch: context.proposal.expectedCurrentEpoch,
    boundAtLogicalMs: 150,
  });
  const stageTimes = {
    prepare: 155,
    provision: 160,
    attest: 170,
    enroll: 180,
    activate: 190,
    commit_morphology: 195,
    checkpoint: 210,
    fence: 220,
    drain: 230,
    release_budget: 235,
    evaluate: 240,
  };
  const executionExecutor = new MorphogenesisExecutionTaskExecutorV1({
    execution: runtime,
    bindings: {
      async resolve(input) {
        return input.runId === runId ? binding : null;
      },
    },
    clock: {
      read(input) {
        return stageTimes[input.stage.stageId] ?? 190;
      },
    },
    evaluation: {
      async evaluate() {
        return {
          disposition: "success",
          outcomeEvidenceDigests: [sha("e")],
        };
      },
    },
  });
  const internalExecutor = {
    async execute(input) {
      return ["attest", "evaluate"].includes(input.stage.stageId)
        ? executionExecutor.execute(input)
        : { status: "completed" };
    },
  };
  const runner = new InMemoryProcessRunnerV1(undefined, {
    taskExecutor: internalExecutor,
    protectedTaskExecutor: executionExecutor,
    gateProvider: {
      async resolve() {
        return { status: "approved", gateRequestId: "gate:execution-recruit" };
      },
    },
    taskBindingResolver: new MorphogenesisTaskExecutionBindingResolverV1({
      policyDigest: context.policy.policyDigest,
      toolsetDigest: sha("c"),
      runtimeImplementationDigest: sha("d"),
    }),
  });
  for (const taskDefinition of
    createMorphogenesisCatalogLifecycleTaskDefinitionsV1())
    await runner.registerTaskDefinition(context.scope.tenantId, taskDefinition);
  await runner.registerProcessDefinition(context.scope.tenantId, definition);
  const started = await runner.start({
    tenantId: context.scope.tenantId,
    runId,
    processId: definition.processId,
    processVersion: definition.version,
    operationId: "workflow-operation:execution-recruit",
    idempotencyKey: "workflow-execution-recruit",
    input: {
      candidateDigest: guards.decision.candidate.candidateDigest,
      decisionRoute: guards.decision.candidate.decisionRoute,
    },
    logicalTime: "2026-08-29T12:00:00.000Z",
  });
  assert.equal(started.run.status, "waiting");
  const activated = await runtime.required(record.stateKey);
  assert.equal(activated.branch, "recruit_existing");
  assert.equal(activated.agent.agentDigest, agent.agentDigest);
  assert.equal(createCalls, 0);
  assert.equal(activated.phase, "morphology_active");
  assert.deepEqual(activated.team.individualWorkContractDigests, [sha("b")]);
  const compensationStage = definition.stages.find(
    ({ stageId }) => stageId === "compensate_prepare",
  );
  const prohibitedCompensation = await executionExecutor.execute({
    tenantId: context.scope.tenantId,
    runId,
    stage: compensationStage,
    taskDefinition: createMorphogenesisCatalogLifecycleTaskDefinitionsV1().find(
      ({ taskDefinitionId }) =>
        taskDefinitionId === compensationStage.taskDefinitionId,
    ),
    attempt: 1,
    taskRunId: "task-run:post-commit-compensation",
    idempotencyKey: "post-commit-compensation",
    binding: {},
    lease: {
      ownerId: "worker:test",
      token: "lease:test",
      generation: 0,
      expiresAt: "2026-08-29T12:10:00.000Z",
    },
    heartbeat: async () => true,
    signal: new AbortController().signal,
  });
  assert.deepEqual(prohibitedCompensation, {
    status: "failed",
    reasonCode: "morphogenesis_post_commit_compensation_prohibited",
  });
  const completed = await runner.signal({
    tenantId: context.scope.tenantId,
    runId,
    operationId: "workflow-operation:execution-outcome",
    idempotencyKey: "workflow-execution-outcome",
    signal: {
      signalId: "morphogenesis-execution-outcome:1",
      signalType: "agentplat.morphogenesis.outcome.v1",
      correlationKey: "morphogenesis",
      sourceType: "morphogenesis_outcome",
      sourceId: "outcome:execution-recruit",
      receivedAt: "2026-08-29T12:01:00.000Z",
    },
    logicalTime: "2026-08-29T12:01:00.000Z",
  });
  assert.equal(completed.run.status, "completed");
  const terminal = await runtime.required(record.stateKey);
  assert.equal(terminal.phase, "completed");
  assert.equal(terminal.terminalAgent.disposition, "detached");
  assert.equal(terminal.budgetReleaseDigest, sha("8"));
  assert.equal(terminal.receipt.disposition, "success");
  const telemetry = [];
  const cursor = await new MorphogenesisTelemetryPublisherV1({
    async record(event) { telemetry.push(event); },
  }).publish({ execution: terminal });
  assert.equal(cursor, terminal.events.length);
  assert.equal(telemetry.length, terminal.events.length);
  assert.equal(
    telemetry.every(({ operation }) => operation === "morphogenesis.transition"),
    true,
  );
  assert.doesNotMatch(JSON.stringify(telemetry), /prompt|credential|reasoning/i);
});

test("catalog creation reconciles a crash after create-and-enroll without duplicate birth", async () => {
  const context = fixture();
  const searchRequest = createMorphogenesisCandidateSearchRequestV1({
    requestId: "candidate-search:create",
    scopeDigest: context.scope.scopeDigest,
    positionDigest: context.target.positions[0].positionDigest,
    requiredCapabilityKeys: ["database_forensics"],
    membershipConfigurationDigest: sha("1"),
    membershipEpoch: 1,
    viewId: "mesh-view:create",
    viewDigest: sha("2"),
    searchLimit: 8,
    requestedAtLogicalMs: 100,
    expiresAtLogicalMs: 500,
  });
  const searchResult = createMorphogenesisCandidateSearchResultV1(
    {
      requestDigest: searchRequest.requestDigest,
      status: "no_eligible_candidate_in_bounded_view",
      completeWithinDeclaredView: true,
      searchedCandidateCount: 0,
      candidates: [],
      observedAtLogicalMs: 130,
    },
    searchRequest,
  );
  const profile = {
    schemaVersion: 1,
    profileDigest: sha("3"),
    roleDefinitionDigest: sha("4"),
  };
  const profileCertificationDigest = sha("f");
  const createdAgent = createMorphogenesisLifecycleAgentV1({
    agentId: "agent:created-forensics",
    peerId: "peer:created-forensics",
    instanceId: "instance:created-forensics:1",
    lineageDigest: sha("5"),
    capabilityKeys: ["database_forensics"],
    roleDefinitionDigest: profile.roleDefinitionDigest,
    membershipConfigurationDigest: sha("6"),
    membershipEpoch: 2,
    source: "catalog_created",
  });
  let createCalls = 0;
  let reconcileCalls = 0;
  let materialized = false;
  let checkpointReceipt;
  let fenceReceipt;
  let retirementReceipt;
  let budgetReleaseReceipt;
  let budgetReleaseCalls = 0;
  let attestationReceipt;
  let teamActivationReceipt;
  let attestationCalls = 0;
  let teamActivationCalls = 0;
  const runtime = new MorphogenesisExecutionRuntimeV1({
    ...executionPostCommitPorts(),
    continuity: {
      async checkpoint(input) {
        checkpointReceipt = createMorphogenesisContinuityReceiptV1({
          operationId: input.operationId,
          agentDigest: input.agent.agentDigest,
          teamReceiptDigest: input.team.receiptDigest,
          checkpointDigest: sha("0"),
          preservedArtifactDigests: [sha("1")],
          completedCausalNodeDigests: [sha("2")],
          invalidatedCausalClosureDigests: [],
          completedAtLogicalMs: input.logicalTimeMs,
        });
        throw new Error("simulated checkpoint acknowledgement loss");
      },
      async reconcile() { return checkpointReceipt; },
    },
    authority: {
      async fence(input) {
        fenceReceipt = createMorphogenesisAuthorityFenceReceiptV1({
          operationId: input.operationId,
          agentDigest: input.agent.agentDigest,
          teamReceiptDigest: input.team.receiptDigest,
          fencedWorkContractDigests:
            input.team.individualWorkContractDigests,
          revokedActionGrantDigests: [],
          successorFenceDigests: [sha("3")],
          effectReceiptDigest: sha("6"),
          fencedAtLogicalMs: input.logicalTimeMs,
        });
        throw new Error("simulated fence acknowledgement loss");
      },
      async reconcile() { return fenceReceipt; },
    },
    retirement: {
      async retire(input) {
        retirementReceipt = createMorphogenesisTerminalAgentReceiptV1({
          operationId: input.operationId,
          agentDigest: input.agent.agentDigest,
          disposition: "retired",
          membershipConfigurationDigest: sha("4"),
          membershipEpoch: input.agent.membershipEpoch + 1,
          lifecycleReceiptDigest: sha("5"),
          terminatedAtLogicalMs: input.logicalTimeMs,
        });
        throw new Error("simulated retirement acknowledgement loss");
      },
      async reconcile() { return retirementReceipt; },
    },
    budgets: {
      async release(input) {
        budgetReleaseCalls += 1;
        budgetReleaseReceipt ??= {
          status: "released",
          request: {
            reservationId: input.reservationId,
            proposalDigest: input.proposalDigest,
          },
          reservationDigest: sha("7"),
        };
        if (budgetReleaseCalls === 1)
          throw new Error("simulated budget release acknowledgement loss");
        return budgetReleaseReceipt;
      },
    },
    discovery: { async search() { return searchResult; } },
    profiles: {
      async resolve(digest) {
        return digest === profile.profileDigest
          ? {
              profile,
              certificationDigest: profileCertificationDigest,
              validUntilLogicalMs: 500,
              status: "certified",
            }
          : null;
      },
    },
    lifecycle: {
      async createAndEnroll() {
        createCalls += 1;
        materialized = true;
        throw new Error("simulated acknowledgement loss");
      },
      async reconcileCreateAndEnroll() {
        reconcileCalls += 1;
        return materialized ? createdAgent : null;
      },
      async eligibility(input) {
        return materialized && input.peerId === createdAgent.peerId
          ? createdAgent
          : null;
      },
    },
    attestation: {
      async attest(input) {
        attestationCalls += 1;
        attestationReceipt ??= createMorphogenesisAgentAttestationV1({
          operationId: input.operationId,
          agentDigest: input.agent.agentDigest,
          profileDigest: profile.profileDigest,
          runtimeAttestationDigest: sha("7"),
          capabilityAssessmentDigests: [sha("8")],
          eligibilityEvidenceDigests: [sha("9")],
          attestedAtLogicalMs: input.logicalTimeMs,
          validUntilLogicalMs: 450,
        });
        throw new Error("simulated attestation acknowledgement loss");
      },
      async reconcile() { return attestationReceipt; },
    },
    teams: {
      async activateSuccessor(input) {
        teamActivationCalls += 1;
        teamActivationReceipt ??= createMorphogenesisSuccessorTeamReceiptV1({
          operationId: input.operationId,
          agentDigest: input.agent.agentDigest,
          teamId: "team:created-successor",
          teamEpoch: 2,
          teamProposalDigest: sha("a"),
          jointWorkContractDigest: sha("b"),
          individualWorkContractDigests: [sha("c")],
          executionStateDigest: sha("d"),
          retainedArtifactDigests: [sha("e")],
          invalidatedCausalClosureDigests: [],
          activatedAtLogicalMs: input.logicalTimeMs,
        });
        throw new Error("simulated Team activation acknowledgement loss");
      },
      async reconcileActivation() { return teamActivationReceipt; },
    },
    store: new InMemoryMorphogenesisExecutionStoreV1(),
    maximumCommitAttempts: 4,
  });
  const guards = executionGuards(context, "create");
  const initial = await runtime.initialize({
    stateKey: "morphogenesis-execution:create",
    scope: context.scope,
    proposalDigest: context.proposal.proposalDigest,
    targetDigest: context.target.targetDigest,
    decision: guards.decision,
    budgetReservation: guards.budgetReservation,
    morphologyHeadStateKey: "morphology-head:create",
    expectedMorphologyEpoch: context.proposal.expectedCurrentEpoch,
    resultingSnapshotDigest: sha("f"),
    positionDigest: context.target.positions[0].positionDigest,
    requiredCapabilityKeys: ["database_forensics"],
    searchRequest,
    profile,
    profileCertificationDigest,
    logicalTimeMs: 150,
  });
  await assert.rejects(
    runtime.resolveAgent({ stateKey: initial.stateKey, logicalTimeMs: 160 }),
    /acknowledgement loss/,
  );
  assert.equal((await runtime.required(initial.stateKey)).phase, "creating");
  let record = await runtime.resolveAgent({ stateKey: initial.stateKey, logicalTimeMs: 170 });
  assert.equal(record.phase, "agent_ready");
  assert.equal(record.branch, "catalog_created");
  assert.equal(createCalls, 1);
  assert.equal(reconcileCalls, 1);
  await assert.rejects(
    runtime.attest({ stateKey: record.stateKey, logicalTimeMs: 180 }),
    /attestation acknowledgement loss/,
  );
  assert.equal((await runtime.required(record.stateKey)).phase, "attesting");
  const attestationRecoveryRuntime = new MorphogenesisExecutionRuntimeV1(
    runtime.options,
  );
  record = await attestationRecoveryRuntime.attest({
    stateKey: record.stateKey,
    logicalTimeMs: 181,
  });
  assert.equal(attestationCalls, 1);
  record = await runtime.verifyEnrollment({ stateKey: record.stateKey, logicalTimeMs: 190 });
  await assert.rejects(
    runtime.activateTeam({ stateKey: record.stateKey, logicalTimeMs: 200 }),
    /Team activation acknowledgement loss/,
  );
  assert.equal((await runtime.required(record.stateKey)).phase, "activating_team");
  const teamRecoveryRuntime = new MorphogenesisExecutionRuntimeV1(
    runtime.options,
  );
  record = await teamRecoveryRuntime.activateTeam({
    stateKey: record.stateKey,
    logicalTimeMs: 201,
  });
  assert.equal(teamActivationCalls, 1);
  assert.equal(record.phase, "team_active");
  assert.equal(record.agent.source, "catalog_created");
  record = await runtime.commitMorphology({
    stateKey: record.stateKey,
    logicalTimeMs: 205,
  });
  await assert.rejects(
    runtime.checkpoint({ stateKey: record.stateKey, logicalTimeMs: 210 }),
    /checkpoint acknowledgement loss/,
  );
  assert.equal((await runtime.required(record.stateKey)).phase, "checkpointing");
  const checkpointRecoveryRuntime = new MorphogenesisExecutionRuntimeV1(
    runtime.options,
  );
  record = await checkpointRecoveryRuntime.checkpoint({
    stateKey: record.stateKey,
    logicalTimeMs: 211,
  });
  await assert.rejects(
    runtime.fenceAuthority({ stateKey: record.stateKey, logicalTimeMs: 220 }),
    /fence acknowledgement loss/,
  );
  assert.equal((await runtime.required(record.stateKey)).phase, "fencing");
  const fenceRecoveryRuntime = new MorphogenesisExecutionRuntimeV1(
    runtime.options,
  );
  record = await fenceRecoveryRuntime.fenceAuthority({
    stateKey: record.stateKey,
    logicalTimeMs: 221,
  });
  await assert.rejects(
    runtime.drain({ stateKey: record.stateKey, logicalTimeMs: 230 }),
    /retirement acknowledgement loss/,
  );
  assert.equal((await runtime.required(record.stateKey)).phase, "draining");
  const retirementRecoveryRuntime = new MorphogenesisExecutionRuntimeV1(
    runtime.options,
  );
  record = await retirementRecoveryRuntime.drain({
    stateKey: record.stateKey,
    logicalTimeMs: 231,
  });
  assert.equal(record.phase, "retired");
  assert.equal(record.terminalAgent.disposition, "retired");
  await assert.rejects(
    runtime.releaseBudget({ stateKey: record.stateKey, logicalTimeMs: 235 }),
    /budget release acknowledgement loss/,
  );
  assert.equal((await runtime.required(record.stateKey)).phase, "releasing_budget");
  const budgetRecoveryRuntime = new MorphogenesisExecutionRuntimeV1(
    runtime.options,
  );
  record = await budgetRecoveryRuntime.releaseBudget({
    stateKey: record.stateKey,
    logicalTimeMs: 236,
  });
  assert.equal(record.phase, "budget_released");
  record = await runtime.complete({
    stateKey: record.stateKey,
    disposition: "success",
    outcomeEvidenceDigests: [sha("d")],
    logicalTimeMs: 240,
  });
  assert.equal(record.phase, "completed");
});

test("lifecycle adapter creates and enrolls through the nominal governed lifecycle", async () => {
  const context = fixture();
  const creationPolicy = await createAgentCreationPolicyV1({
    schemaVersion: 1,
    policyId: "agent-creation-policy:morphogenesis",
    policyVersion: 1,
    maximumGeneration: 4,
    maximumChildrenPerAgent: 4,
    maximumActiveDescendants: 8,
    maximumResourceUnitsPerChild: 100,
    maximumInteractionUnitsPerChild: 100,
    allowedAdapterIds: ["adapter:portable-agent"],
    permittedCapabilityKeys: ["database_forensics"],
    requireRulePolicyInheritance: true,
    requireAuthorityAttenuation: true,
    requestTtlLogicalMs: 1_000,
    maximumCommitAttempts: 4,
  });
  let factoryReceipt;
  let memberPresent = false;
  const lineage = new GovernedAgentLineageRuntimeV1({
    stateKey: "lineage:morphogenesis-adapter",
    policy: creationPolicy,
    store: new InMemoryAgentLineageStoreV1(),
    factory: {
      factoryId: "factory:morphogenesis",
      factoryVersion: 1,
      factoryImplementationDigest: sha("1"),
      async create() { return factoryReceipt; },
      async terminate() {
        return { terminated: true, receiptDigest: sha("2") };
      },
    },
    certification: {
      async verify() { return true; },
      async verifyAuthorityAttenuation() { return true; },
    },
    enrollment: {
      async enroll() {
        memberPresent = true;
        return {
          enrolled: true,
          authorizationConfigurationDigest: sha("3"),
          authorizationEpoch: 1,
          membershipConfigurationDigest: sha("4"),
          membershipEpoch: 2,
        };
      },
      async remove() {
        memberPresent = false;
        return {
          removed: true,
          membershipConfigurationDigest: sha("5"),
          membershipEpoch: 3,
        };
      },
    },
  });
  await lineage.initialize({
    schemaVersion: 1,
    agentId: "agent:root",
    peerId: "peer:root",
    instanceId: "instance:root",
    parentAgentId: null,
    rootAgentId: "agent:root",
    generation: 0,
    factoryId: "factory:morphogenesis",
    adapterId: "adapter:portable-agent",
    adapterVersion: "1",
    capabilityKeys: ["database_forensics"],
    roleDefinitionDigest: sha("6"),
    authorityDigest: sha("7"),
    parentAuthorityDigest: null,
    localRuleProgramDigest: sha("8"),
    resourceBudgetUnits: 100,
    interactionBudgetUnits: 100,
    publicKeyId: "key:root",
    publicKey: "public-key-root",
    validFrom: "2030-01-01T00:00:00.000Z",
    validUntil: "2031-01-01T00:00:00.000Z",
    creationCertificateDigest: sha("9"),
    membershipConfigurationDigest: sha("3"),
    membershipEpoch: 1,
    status: "active",
    createdAtLogicalMs: 0,
    terminatedAtLogicalMs: null,
    retirementMembershipConfigurationDigest: null,
    retirementMembershipEpoch: null,
  });
  const lifecycle = new GovernedAgentLifecycleRuntimeV1({
    lineage,
    registry: {
      current() {
        return {
          epoch: memberPresent ? 2 : 1,
          configurationDigest: memberPresent ? sha("4") : sha("3"),
          members: [
            { peerId: "peer:root", instanceId: "instance:root" },
            ...(memberPresent
              ? [
                  {
                    peerId: "peer:created-adapter",
                    instanceId: "instance:created-adapter:1",
                  },
                ]
              : []),
          ],
        };
      },
    },
  });
  const profile = {
    schemaVersion: 1,
    profileDigest: sha("a"),
    roleDefinitionDigest: sha("6"),
    adapterId: "adapter:portable-agent",
    adapterVersion: "1",
    capabilityKeys: ["database_forensics"],
    authorityCeilingDigest: sha("b"),
    localRuleProgramDigest: sha("8"),
    resourceBudgetUnits: 10,
    interactionBudgetUnits: 10,
  };
  const prepared = new Map();
  const adapter = new GovernedAgentLifecycleMorphogenesisPortV1({
    lifecycle,
    material: {
      async prepare(input) {
        if (prepared.has(input.operationId)) return prepared.get(input.operationId);
        const root = (await lineage.load()).agents.find(
          ({ agentId }) => agentId === "agent:root",
        );
        const request = await createAgentCreationRequestV1({
          requestId: input.operationId,
          parentAgentId: root.agentId,
          requestedAgentId: "agent:created-adapter",
          requestedPeerId: "peer:created-adapter",
          requestedInstanceId: "instance:created-adapter:1",
          factoryId: "factory:morphogenesis",
          adapterId: profile.adapterId,
          adapterVersion: profile.adapterVersion,
          capabilityKeys: profile.capabilityKeys,
          roleDefinitionDigest: profile.roleDefinitionDigest,
          proposedAuthorityDigest: profile.authorityCeilingDigest,
          parentAuthorityDigest: root.authorityDigest,
          localRuleProgramDigest: profile.localRuleProgramDigest,
          resourceBudgetUnits: profile.resourceBudgetUnits,
          interactionBudgetUnits: profile.interactionBudgetUnits,
          requestedAtLogicalMs: input.logicalTimeMs,
          expiresAtLogicalMs: 900,
        });
        const certificate = await createAgentCreationCertificateV1({
          requestDigest: request.requestDigest,
          policyDigest: creationPolicy.policyDigest,
          parentLineageDigest: root.lineageDigest,
          roleDefinitionDigest: request.roleDefinitionDigest,
          authorityAttenuationDigest: sha("c"),
          collectiveCertificateDigest: sha("d"),
          membershipConfigurationDigest: sha("3"),
          membershipEpoch: 1,
          certifiedAtLogicalMs: input.logicalTimeMs,
          validUntilLogicalMs: 900,
        });
        factoryReceipt = await createAgentFactoryReceiptV1({
          requestDigest: request.requestDigest,
          factoryId: "factory:morphogenesis",
          factoryVersion: 1,
          factoryImplementationDigest: sha("1"),
          agentId: request.requestedAgentId,
          peerId: request.requestedPeerId,
          instanceId: request.requestedInstanceId,
          publicKeyId: "key:created-adapter",
          publicKey: "public-key-created-adapter",
          keyAlgorithm: "Ed25519",
          validFrom: "2030-01-01T00:00:00.000Z",
          validUntil: "2031-01-01T00:00:00.000Z",
          runtimeAttestationDigest: sha("e"),
        });
        const material = {
          request,
          certificate,
          activeKeyProof: {
            algorithm: "Ed25519",
            keyId: "key:created-adapter",
            value: "proof-created-adapter",
          },
        };
        prepared.set(input.operationId, material);
        return material;
      },
    },
  });
  const agent = await adapter.createAndEnroll({
    operationId: "operation:create-adapter",
    scope: context.scope,
    proposalDigest: context.proposal.proposalDigest,
    profile,
    logicalTimeMs: 200,
  });
  assert.equal(agent.source, "catalog_created");
  assert.equal(agent.membershipEpoch, 2);
  assert.equal(
    (
      await adapter.eligibility({
        peerId: agent.peerId,
        instanceId: agent.instanceId,
        requiredCapabilityKeys: ["database_forensics"],
        membershipConfigurationDigest: agent.membershipConfigurationDigest,
        membershipEpoch: agent.membershipEpoch,
        expectedSource: "catalog_created",
        logicalTimeMs: 210,
      })
    ).agentDigest,
    agent.agentDigest,
  );
  const fence = createMorphogenesisAuthorityFenceReceiptV1({
    operationId: "operation:fence-adapter",
    agentDigest: agent.agentDigest,
    teamReceiptDigest: sha("f"),
    fencedWorkContractDigests: [sha("0")],
    revokedActionGrantDigests: [],
    successorFenceDigests: [sha("1")],
    effectReceiptDigest: sha("2"),
    fencedAtLogicalMs: 220,
  });
  const retired = await adapter.retire({
    operationId: "operation:retire-adapter",
    scope: context.scope,
    proposalDigest: context.proposal.proposalDigest,
    agent,
    fence,
    reasonCode: "morphogenesis_lifecycle_complete",
    logicalTimeMs: 230,
  });
  assert.equal(retired.disposition, "retired");
  assert.equal(retired.membershipEpoch, 3);
  assert.equal(
    await adapter.eligibility({
      peerId: agent.peerId,
      instanceId: agent.instanceId,
      requiredCapabilityKeys: ["database_forensics"],
      membershipConfigurationDigest: retired.membershipConfigurationDigest,
      membershipEpoch: retired.membershipEpoch,
      expectedSource: "catalog_created",
      logicalTimeMs: 240,
    }),
    null,
  );
});

test("Team adapter activates the actual formed proposal with exact individual Work authority", async () => {
  const context = fixture();
  const operationId = "morphogenesis-team-operation:1";
  const teamScope = createTeamFormationScopeV1({
    tenantId: context.scope.tenantId,
    meshId: context.scope.meshId,
    policyDomainId: context.scope.policyDomainId,
    missionIntentId: context.scope.missionIntentId,
    objectiveId: context.scope.objectiveId,
    rootWorkItemId: context.scope.workItemId,
    rootWorkItemRevision: context.scope.workItemRevision,
  });
  const position = createTeamPositionV1({
    schemaVersion: 1,
    positionId: "position:database-forensics",
    workItemId: context.scope.workItemId,
    workItemRevision: context.scope.workItemRevision,
    roleKey: "database_forensics",
    requiredCapabilityKeys: ["database_forensics"],
    completionCriteria: ["forensic_artifact_published"],
    dependsOnPositionIds: [],
    budgetUnits: 10,
    maximumActionBudgetUnits: 5,
  });
  const teamCandidate = createTeamCandidateV1({
    schemaVersion: 1,
    candidateId: "team-candidate:forensics",
    peerId: "peer:created-forensics",
    instanceId: "instance:created-forensics:1",
    independenceGroupId: "independence:forensics",
    sourceCandidateDigest: sha("1"),
    sourceRequestDigest: sha("2"),
    sourceDecisionDigest: sha("3"),
    eligibleWorkItemId: position.workItemId,
    eligibleWorkItemRevision: position.workItemRevision,
    requiredCapabilityKeys: position.requiredCapabilityKeys,
  });
  const bid = createTeamPositionBidV1({
    schemaVersion: 1,
    bidId: "team-bid:forensics",
    positionId: position.positionId,
    candidate: teamCandidate,
    sourceBidDigest: sha("4"),
    capacityReservationUnits: 1,
    budgetUnits: 10,
    expectedCompletionAtLogicalMs: 400,
    locallyEvaluatedScoreMicros: 9_000,
    observedAtLogicalMs: 200,
    validUntilLogicalMs: 500,
  });
  const formationRequest = createTeamFormationRequestV1({
    schemaVersion: 1,
    requestId: operationId,
    scope: teamScope,
    membershipEpoch: 2,
    membershipConfigurationDigest: sha("5"),
    positions: [position],
    bids: [bid],
    logicalTimeMs: 210,
    validUntilLogicalMs: 500,
  });
  const policy = createTeamFormationPolicyV1({
    schemaVersion: 1,
    policyId: "team-policy:morphogenesis",
    policyVersion: 1,
    parentPolicyDigest: null,
    minimumDistinctPeers: 1,
    minimumIndependenceGroups: 1,
    maximumTotalBudgetUnits: 20,
    requireDistinctPeerPerPosition: true,
    limits: {
      maximumPositions: 4,
      maximumBidsPerPosition: 8,
      maximumMembers: 4,
      maximumSearchNodes: 100,
      maximumReasonCodesPerDecision: 8,
      maximumHistoryEntries: 8,
      maximumRequestInvalidations: 8,
      maximumRequestTtlMs: 1_000,
      maximumTeamDurationMs: 1_000,
      maximumCommitAttempts: 4,
    },
  });
  const formation = new TeamFormationRuntimeV1({
    stateKey: "team-formation:morphogenesis",
    formationId: "team-formation:morphogenesis",
    formationVersion: 1,
    implementationId: "team-formation:morphogenesis:v1",
    policy,
    store: new InMemoryTeamFormationStoreV1(),
  });
  const agent = createMorphogenesisLifecycleAgentV1({
    agentId: "agent:created-forensics",
    peerId: teamCandidate.peerId,
    instanceId: teamCandidate.instanceId,
    lineageDigest: sha("6"),
    capabilityKeys: ["database_forensics"],
    roleDefinitionDigest: sha("7"),
    membershipConfigurationDigest:
      formationRequest.membershipConfigurationDigest,
    membershipEpoch: formationRequest.membershipEpoch,
    source: "catalog_created",
  });
  const attestation = createMorphogenesisAgentAttestationV1({
    operationId: "attestation:forensics",
    agentDigest: agent.agentDigest,
    profileDigest: sha("8"),
    runtimeAttestationDigest: sha("9"),
    capabilityAssessmentDigests: [sha("a")],
    eligibilityEvidenceDigests: [sha("b")],
    attestedAtLogicalMs: 215,
    validUntilLogicalMs: 500,
  });
  const adapter = new TeamFormationMorphogenesisSuccessorPortV1({
    formation,
    commands: {
      async buildFormationRequest() { return formationRequest; },
      async resolveWorkContracts({ proposal }) {
        const member = proposal.members[0];
        const selectedPosition = proposal.positions[0];
        const body = {
          schemaVersion: 1,
          workContractId: "work-contract:morphogenesis:forensics",
          generation: 1,
          tenantId: proposal.scope.tenantId,
          policyDomainId: proposal.scope.policyDomainId,
          mandate: {
            schemaVersion: 1,
            mandateId: "mandate:morphogenesis",
            mandateRevision: 1,
            mandateDigest: sha("c"),
          },
          objective: {
            schemaVersion: 1,
            meshId: proposal.scope.meshId,
            objectiveId: proposal.scope.objectiveId,
            objectiveDocumentId: "objective-document:morphogenesis",
            objectiveRevision: 1,
            acceptedMessageId: "objective-message:morphogenesis",
            acceptedPolicyDigest: sha("d"),
          },
          assignment: {
            schemaVersion: 1,
            workItemId: selectedPosition.workItemId,
            workItemRevision: selectedPosition.workItemRevision,
            ownerPeerId: "peer:mission-owner",
            assignedPeerId: member.peerId,
            assignedInstanceId: member.instanceId,
            assignmentAuthorityId: "authority:morphogenesis-work",
            assignmentEpoch: 1,
            authorityGeneration: 1,
            fencingToken: "fence:morphogenesis-work",
            leaseExpiresAtLogicalMs: 450,
            workDeadline: "2030-01-01T00:00:00.000Z",
          },
          roleKey: selectedPosition.roleKey,
          requiredCapabilityKeys: selectedPosition.requiredCapabilityKeys,
          completionCriteria: selectedPosition.completionCriteria,
          inputReferenceDigest: null,
          reservedBudgetUnits: selectedPosition.budgetUnits,
          maximumActionBudgetUnits:
            selectedPosition.maximumActionBudgetUnits,
          trustPolicyId: "trust-policy:morphogenesis",
          inferencePolicyId: "inference-policy:morphogenesis",
          createdAtLogicalMs: 220,
          updatedAtLogicalMs: 220,
          status: "active",
          terminalReasonCode: null,
        };
        return [{ ...body, workContractDigest: workContractDigestV1(body) }];
      },
      async continueExecution() {
        return {
          executionStateDigest: sha("e"),
          retainedArtifactDigests: [sha("f")],
          invalidatedCausalClosureDigests: [],
        };
      },
    },
  });
  const receipt = await adapter.activateSuccessor({
    operationId,
    scope: context.scope,
    proposalDigest: context.proposal.proposalDigest,
    positionDigest: position.positionDigest,
    agent,
    attestation,
    logicalTimeMs: 220,
  });
  assert.equal(receipt.teamEpoch, 1);
  assert.equal(receipt.individualWorkContractDigests.length, 1);
  assert.equal(
    (
      await adapter.reconcileActivation({
        operationId,
        scope: context.scope,
        proposalDigest: context.proposal.proposalDigest,
        positionDigest: position.positionDigest,
        agent,
        attestation,
        logicalTimeMs: 220,
      })
    ).receiptDigest,
    receipt.receiptDigest,
  );
});

test("Work/Action fence adapter refuses incomplete fencing evidence", async () => {
  const context = fixture();
  const agent = createMorphogenesisLifecycleAgentV1({
    agentId: "agent:fence",
    peerId: "peer:fence",
    instanceId: "instance:fence:1",
    lineageDigest: sha("1"),
    capabilityKeys: ["database_forensics"],
    roleDefinitionDigest: sha("2"),
    membershipConfigurationDigest: sha("3"),
    membershipEpoch: 1,
    source: "existing",
  });
  const team = createMorphogenesisSuccessorTeamReceiptV1({
    operationId: "operation:team-fence",
    agentDigest: agent.agentDigest,
    teamId: "team:fence",
    teamEpoch: 1,
    teamProposalDigest: sha("4"),
    jointWorkContractDigest: sha("5"),
    individualWorkContractDigests: [sha("6"), sha("7")],
    executionStateDigest: sha("d"),
    retainedArtifactDigests: [sha("e")],
    invalidatedCausalClosureDigests: [],
    activatedAtLogicalMs: 100,
  });
  const continuity = createMorphogenesisContinuityReceiptV1({
    operationId: "operation:checkpoint-fence",
    agentDigest: agent.agentDigest,
    teamReceiptDigest: team.receiptDigest,
    checkpointDigest: sha("8"),
    preservedArtifactDigests: [sha("9")],
    completedCausalNodeDigests: [],
    invalidatedCausalClosureDigests: [],
    completedAtLogicalMs: 110,
  });
  let complete = false;
  const adapter = new WorkActionMorphogenesisAuthorityFencePortV1({
    async fence() {
      return {
        fencedWorkContractDigests: complete
          ? team.individualWorkContractDigests
          : [team.individualWorkContractDigests[0]],
        revokedActionGrantDigests: [sha("a")],
        successorFenceDigests: [sha("b")],
        effectReceiptDigest: sha("c"),
      };
    },
    async reconcile(input) { return this.fence(input); },
  });
  const input = {
    operationId: "operation:fence",
    scope: context.scope,
    proposalDigest: context.proposal.proposalDigest,
    agent,
    team,
    continuity,
    logicalTimeMs: 120,
  };
  await assert.rejects(adapter.fence(input), /fence result is incomplete/);
  complete = true;
  const receipt = await adapter.fence(input);
  assert.deepEqual(
    receipt.fencedWorkContractDigests,
    team.individualWorkContractDigests,
  );
  assert.equal(receipt.effectReceiptDigest, sha("c"));
});

test("protected Workflow executor crosses the Action Gateway and retains its result", async () => {
  let invocation;
  const task = {
    tenantId: "tenant:test",
    runId: "run:gateway",
    stage: {
      schemaVersion: 1,
      stageId: "provision",
      name: "Provision",
      kind: "task",
      taskDefinitionId: "agentplat.morphogenesis.provision.v1",
      taskDefinitionVersion: "1",
      dependsOn: [],
    },
    taskDefinition: {},
    attempt: 1,
    taskRunId: "task-run:gateway",
    idempotencyKey: "gateway-idempotency",
    binding: { bindingDigest: sha("1") },
    lease: {
      ownerId: "worker:gateway",
      token: "lease:gateway",
      generation: 0,
      expiresAt: "2026-08-29T12:10:00.000Z",
    },
    heartbeat: async () => true,
    signal: new AbortController().signal,
  };
  const executor = new MorphogenesisActionGatewayTaskExecutorV1({
    gateways: {
      async resolve() {
        return {
          grantId: "grant:morphogenesis",
          gateway: {
            async invoke(input) {
              invocation = input;
              return {
                ok: true,
                value: {
                  status: "completed",
                  resultReference: "morphogenesis:result:1",
                  resultDigest: sha("2"),
                },
              };
            },
          },
        };
      },
    },
    clock: { read() { return 100; } },
  });
  assert.deepEqual(await executor.execute(task), {
    status: "completed",
    resultReference: "morphogenesis:result:1",
    resultDigest: sha("2"),
  });
  assert.equal(invocation.grantId, "grant:morphogenesis");
  assert.equal(invocation.input.taskRunId, task.taskRunId);
  const indeterminate = new MorphogenesisActionGatewayTaskExecutorV1({
    gateways: {
      async resolve() {
        return {
          grantId: "grant:failure",
          gateway: { async invoke() { throw new Error("lost response"); } },
        };
      },
    },
    clock: { read() { return 100; } },
  });
  assert.deepEqual(await indeterminate.execute(task), {
    status: "indeterminate",
    reasonCode: "morphogenesis_action_gateway_indeterminate",
  });
});

test("derived and synthesized instantiation evidence is immutable and authority-neutral", () => {
  const derived = createAgentInstantiationProfileEvolutionV1({
    evolutionId: "profile-evolution:derived:1",
    mode: "derived",
    materialProfileDigest: sha("1"),
    parentProfileDigests: [sha("2")],
    parentAgentLineageDigests: [sha("3")],
    inheritedCapabilityKeys: ["database_forensics"],
    removedCapabilityKeys: ["general_triage"],
    addedCapabilityKeys: ["log_correlation"],
    addedCapabilityAttestationDigests: [sha("4")],
    evolutionPolicyDigest: sha("5"),
    evolutionImplementationDigest: sha("6"),
    evidenceDigests: [sha("7")],
    proposedAtLogicalMs: 100,
  });
  assert.equal(
    validateAgentInstantiationProfileEvolutionV1(derived).evolutionDigest,
    derived.evolutionDigest,
  );
  const attenuation = createAgentInstantiationAuthorityAttenuationV1({
    attenuationId: "authority-attenuation:derived:1",
    evolutionDigest: derived.evolutionDigest,
    parentAuthorityCeilingDigests: [sha("8")],
    childAuthorityCeilingDigest: sha("9"),
    retainedToolNames: ["logs.read"],
    removedToolNames: ["shell.execute"],
    retainedActionClasses: ["read"],
    removedActionClasses: ["write"],
    policyDigest: sha("a"),
    issuerId: "authority:attenuation",
    issuerImplementationDigest: sha("b"),
    evidenceDigests: [sha("c")],
    issuedAtLogicalMs: 110,
    validUntilLogicalMs: 500,
  });
  assert.equal(
    validateAgentInstantiationAuthorityAttenuationV1(attenuation)
      .attenuationDigest,
    attenuation.attenuationDigest,
  );
  const synthesized = createAgentInstantiationProfileEvolutionV1({
    evolutionId: "profile-evolution:synthesized:1",
    mode: "synthesized",
    materialProfileDigest: sha("d"),
    parentProfileDigests: [],
    parentAgentLineageDigests: [],
    inheritedCapabilityKeys: [],
    removedCapabilityKeys: [],
    addedCapabilityKeys: ["incident_coordination"],
    addedCapabilityAttestationDigests: [sha("e")],
    evolutionPolicyDigest: sha("f"),
    evolutionImplementationDigest: sha("0"),
    evidenceDigests: [sha("1")],
    proposedAtLogicalMs: 120,
  });
  const certification = createAgentInstantiationSynthesisCertificationV1({
    certificationId: "synthesis-certification:1",
    evolutionDigest: synthesized.evolutionDigest,
    materialProfileDigest: synthesized.materialProfileDigest,
    synthesizerId: "agent:synthesizer",
    synthesizerVersion: 1,
    synthesizerImplementationDigest: sha("2"),
    independentCertifierId: "agent:certifier",
    independentCertifierImplementationDigest: sha("3"),
    policyDigest: synthesized.evolutionPolicyDigest,
    evidenceDigests: [sha("4")],
    certifiedAtLogicalMs: 130,
    validUntilLogicalMs: 500,
  });
  assert.equal(
    validateAgentInstantiationSynthesisCertificationV1(certification)
      .certificationDigest,
    certification.certificationDigest,
  );
  assert.throws(() =>
    createAgentInstantiationProfileEvolutionV1({
      ...derived,
      inheritedCapabilityKeys: ["database_forensics"],
      addedCapabilityKeys: ["database_forensics"],
    }),
  );
  assert.throws(() =>
    createAgentInstantiationSynthesisCertificationV1({
      ...certification,
      independentCertifierId: certification.synthesizerId,
    }),
  );
});

test("AgentInstantiationProfileV2 derives a narrower certified material profile", async () => {
  const createMaterial = ({
    suffix,
    digestCharacter,
    capabilityKeys,
    toolNames,
    actionClasses,
    resourceUnits,
    predecessorProfileDigest,
  }) => {
    const blueprint = createDynamicRoleBlueprintV2({
      blueprintId: `role-blueprint:${suffix}`,
      missionId: "mission:profile-v2",
      roleKey: `role_${suffix}`,
      predecessorDefinitionDigest: null,
      guidance: [`Perform ${suffix} within the certified scope.`],
      requiredCapabilityKeys: capabilityKeys,
      requestedToolNames: toolNames,
      requestedActionClasses: actionClasses,
      resourceCeilingUnits: resourceUnits,
      constraints: { evidenceOnly: true },
      proposerPeerId: "peer:profile-architect",
      proposerCredibilityDigest: sha(digestCharacter),
      basisEvidenceDigests: [sha("1")],
      proposedAtLogicalMs: 100,
    });
    const role = compileGovernedRoleDefinitionV2({
      blueprint,
      authority: {
        missionId: "mission:profile-v2",
        authorityDigest: sha(digestCharacter),
        permittedCapabilityKeys: capabilityKeys,
        permittedToolNames: toolNames,
        permittedActionClasses: actionClasses,
        maximumResourceUnits: resourceUnits,
        requiredConstraintKeys: ["evidenceOnly"],
        localRuleProgramDigest: sha("2"),
      },
      semanticGuaranteeDigest: sha("3"),
      definitionRevision: 1,
    });
    const roleCertification = createGovernedRoleCertificationV2({
      definitionDigest: role.definitionDigest,
      semanticGuaranteeDigest: role.semanticGuaranteeDigest,
      collectiveCertificateDigest: sha("4"),
      membershipConfigurationDigest: sha("5"),
      membershipEpoch: 1,
      validUntilLogicalMs: 1_000,
    });
    const profile = createAgentInstantiationProfileV1({
      profileId: `profile:${suffix}`,
      profileVersion: 1,
      predecessorProfileDigest,
      tenantId: "tenant:profile-v2",
      roomId: "room:profile-v2",
      objectiveId: "objective:profile-v2",
      workItemId: "work:profile-v2",
      workItemRevision: 1,
      role,
      roleCertification,
      adapterId: "adapter:portable-agent",
      adapterVersion: "1",
      instructionArtifactId: `artifact:instructions:${suffix}`,
      instructionArtifactDigest: sha("6"),
      toolSetArtifactId: `artifact:tools:${suffix}`,
      toolSetArtifactDigest: sha("7"),
      memoryScopeId: `memory-scope:${suffix}`,
      memoryScopeDigest: sha("8"),
      inputContractDigest: sha("9"),
      outputContractDigest: sha("a"),
      modelConstraintsDigest: sha("b"),
      resourceBudgetUnits: resourceUnits,
      interactionBudgetUnits: resourceUnits * 10,
      maximumActionBudgetUnits: Math.max(1, resourceUnits - 1),
      requiredAssessorIds: ["assessor:profile-v2"],
      requiredAttestationDigests: [sha("c")],
      authorId: "agent:profile-architect",
      provenanceDigest: sha("d"),
      validFromLogicalMs: 100,
      expiresAtLogicalMs: 900,
    });
    return { profile, role, roleCertification };
  };
  const parent = createMaterial({
    suffix: "parent",
    digestCharacter: "e",
    capabilityKeys: ["database_forensics", "general_triage"],
    toolNames: ["database_reader", "shell_execute"],
    actionClasses: ["read_evidence", "write_evidence"],
    resourceUnits: 10,
    predecessorProfileDigest: null,
  });
  const child = createMaterial({
    suffix: "child",
    digestCharacter: "f",
    capabilityKeys: ["database_forensics", "log_correlation"],
    toolNames: ["database_reader"],
    actionClasses: ["read_evidence"],
    resourceUnits: 5,
    predecessorProfileDigest: parent.profile.profileDigest,
  });
  const evolution = createAgentInstantiationProfileEvolutionV1({
    evolutionId: "profile-evolution:v2:derived",
    mode: "derived",
    materialProfileDigest: child.profile.profileDigest,
    parentProfileDigests: [parent.profile.profileDigest],
    parentAgentLineageDigests: [sha("0")],
    inheritedCapabilityKeys: ["database_forensics"],
    removedCapabilityKeys: ["general_triage"],
    addedCapabilityKeys: ["log_correlation"],
    addedCapabilityAttestationDigests: [sha("1")],
    evolutionPolicyDigest: sha("2"),
    evolutionImplementationDigest: sha("3"),
    evidenceDigests: [sha("4")],
    proposedAtLogicalMs: 150,
  });
  const attenuation = createAgentInstantiationAuthorityAttenuationV1({
    attenuationId: "attenuation:v2:derived",
    evolutionDigest: evolution.evolutionDigest,
    parentAuthorityCeilingDigests: [parent.profile.authorityCeilingDigest],
    childAuthorityCeilingDigest: child.profile.authorityCeilingDigest,
    retainedToolNames: child.profile.toolNames,
    removedToolNames: ["shell_execute"],
    retainedActionClasses: child.profile.actionClasses,
    removedActionClasses: ["write_evidence"],
    policyDigest: sha("5"),
    issuerId: "authority:profile-v2",
    issuerImplementationDigest: sha("6"),
    evidenceDigests: [sha("7")],
    issuedAtLogicalMs: 160,
    validUntilLogicalMs: 800,
  });
  const context = {
    materialProfile: child.profile,
    parentProfiles: [parent.profile],
    evolution,
    attenuation,
    synthesisCertification: null,
    logicalTimeMs: 200,
  };
  const profile = createAgentInstantiationProfileV2({
    creationMode: "derived",
    context,
  });
  assert.equal(profile.schemaVersion, 2);
  assert.equal(profile.creationMode, "derived");
  assert.equal(profile.materialProfileDigest, child.profile.profileDigest);
  assert.equal(profile.authorityAttenuationDigest, attenuation.attenuationDigest);
  assert.equal(
    validateAgentInstantiationProfileV2(profile, context).profileDigest,
    profile.profileDigest,
  );
  const synthesisEvolution = createAgentInstantiationProfileEvolutionV1({
    evolutionId: "profile-evolution:v2:synthesized",
    mode: "synthesized",
    materialProfileDigest: child.profile.profileDigest,
    parentProfileDigests: [parent.profile.profileDigest],
    parentAgentLineageDigests: [sha("8")],
    inheritedCapabilityKeys: [],
    removedCapabilityKeys: [],
    addedCapabilityKeys: child.profile.capabilityKeys,
    addedCapabilityAttestationDigests: [sha("9")],
    evolutionPolicyDigest: sha("a"),
    evolutionImplementationDigest: sha("b"),
    evidenceDigests: [sha("c")],
    proposedAtLogicalMs: 170,
  });
  const synthesisAttenuation = createAgentInstantiationAuthorityAttenuationV1({
    ...attenuation,
    attenuationId: "attenuation:v2:synthesized",
    evolutionDigest: synthesisEvolution.evolutionDigest,
  });
  const synthesisCertification =
    createAgentInstantiationSynthesisCertificationV1({
      certificationId: "synthesis-certification:v2",
      evolutionDigest: synthesisEvolution.evolutionDigest,
      materialProfileDigest: child.profile.profileDigest,
      synthesizerId: "agent:profile-synthesizer",
      synthesizerVersion: 1,
      synthesizerImplementationDigest: sha("d"),
      independentCertifierId: "agent:profile-certifier",
      independentCertifierImplementationDigest: sha("e"),
      policyDigest: synthesisEvolution.evolutionPolicyDigest,
      evidenceDigests: [sha("f")],
      certifiedAtLogicalMs: 180,
      validUntilLogicalMs: 800,
    });
  const synthesizedContext = {
    materialProfile: child.profile,
    parentProfiles: [parent.profile],
    evolution: synthesisEvolution,
    attenuation: synthesisAttenuation,
    synthesisCertification,
    logicalTimeMs: 200,
  };
  const synthesizedProfile = createAgentInstantiationProfileV2({
    creationMode: "synthesized",
    context: synthesizedContext,
  });
  assert.equal(synthesizedProfile.creationMode, "synthesized");
  assert.equal(
    validateAgentInstantiationProfileV2(
      synthesizedProfile,
      synthesizedContext,
    ).profileDigest,
    synthesizedProfile.profileDigest,
  );
  const profileCertification = createAgentInstantiationProfileCertificationV1({
    certificationId: "profile-certification:v2:derived",
    profileDigest: profile.profileDigest,
    policyDigest: sha("8"),
    roleCertificationDigest: profile.roleCertificationDigest,
    certifierId: "agent:profile-v2-certifier",
    certifierVersion: 1,
    certifierImplementationDigest: sha("9"),
    evidenceDigests: [sha("a")],
    certifiedAtLogicalMs: 180,
    validUntilLogicalMs: 800,
  });
  const scope = createMorphogenesisScopeV1({
    tenantId: "tenant:profile-v2",
    morphologyId: "morphology:profile-v2",
    policyDomainId: "policy-domain:profile-v2",
    missionId: "mission:profile-v2",
    missionIntentId: "mission-intent:profile-v2",
    objectiveId: "objective:profile-v2",
    meshId: "mesh:profile-v2",
    roomId: "room:profile-v2",
    workItemId: "work:profile-v2",
    workItemRevision: 1,
  });
  const creationRequest =
    await compileAgentInstantiationProfileToCreationRequestV1({
      requestId: "creation-request:profile-v2",
      parentAgentId: "agent:parent:profile-v2",
      requestedAgentId: "agent:child:profile-v2",
      requestedPeerId: "peer:child:profile-v2",
      requestedInstanceId: "instance:child:profile-v2:1",
      factoryId: "factory:profile-v2",
      scope,
      expectedProfilePolicyDigest: profileCertification.policyDigest,
      proposedAuthorityDigest: profile.authorityCeilingDigest,
      parentAuthorityDigest: parent.profile.authorityCeilingDigest,
      requestedAtLogicalMs: 200,
      expiresAtLogicalMs: 700,
      profile,
      profileV2Context: context,
      profileCertification,
      role: child.role,
      roleCertification: child.roleCertification,
      certificationV2: { async verify() { return true; } },
      authorityAttenuationVerification: {
        async verify() { return true; },
      },
    });
  assert.equal(creationRequest.capabilityKeys.includes("log_correlation"), true);
  assert.equal(
    creationRequest.proposedAuthorityDigest,
    profile.authorityCeilingDigest,
  );
  await assert.rejects(
    compileAgentInstantiationProfileToCreationRequestV1({
      requestId: "creation-request:profile-v2:denied",
      parentAgentId: "agent:parent:profile-v2",
      requestedAgentId: "agent:child:profile-v2:denied",
      requestedPeerId: "peer:child:profile-v2:denied",
      requestedInstanceId: "instance:child:profile-v2:denied:1",
      factoryId: "factory:profile-v2",
      scope,
      expectedProfilePolicyDigest: profileCertification.policyDigest,
      proposedAuthorityDigest: profile.authorityCeilingDigest,
      parentAuthorityDigest: parent.profile.authorityCeilingDigest,
      requestedAtLogicalMs: 200,
      expiresAtLogicalMs: 700,
      profile,
      profileV2Context: context,
      profileCertification,
      role: child.role,
      roleCertification: child.roleCertification,
      certificationV2: { async verify() { return true; } },
    }),
    /authority attenuation was denied/,
  );
  assert.throws(() =>
    createAgentInstantiationProfileV2({
      creationMode: "derived",
      context: {
        ...context,
        materialProfile: {
          ...child.profile,
          interactionBudgetUnits: parent.profile.interactionBudgetUnits + 1,
          profileDigest: child.profile.profileDigest,
        },
      },
    }),
  );
});

test("MorphogenesisPolicyV2 admits advanced operators only through explicit capabilities", () => {
  const baseline = fixture().policy.policy;
  const policy = createMorphogenesisPolicyV2({
    ...baseline,
    schemaVersion: 2,
    allowedOperators: [...baseline.allowedOperators, "derive_agent"].sort(),
    enabledAdvancedCapabilities: ["derived_profiles"],
    maximumDerivedAgentsPerProposal: 1,
    maximumSynthesizedAgentsPerProposal: 0,
    maximumRoleChangesPerProposal: 0,
    maximumWorkReassignmentsPerProposal: 0,
    maximumReplacementsPerProposal: 0,
    maximumSuspensionsPerProposal: 0,
    maximumTopologyOperationsPerProposal: 0,
    maximumCreationDepth: 0,
  });
  assert.equal(policy.schemaVersion, 2);
  assert.equal(validateMorphogenesisPolicyV2(policy).policyDigest, policy.policyDigest);
  const operation = createMorphogenesisOperationV1(
    {
      operationId: "operation:derive-agent:v2",
      operator: "derive_agent",
      effectClass: "protected_external",
      dependsOnOperationIds: ["operation:instantiate-agent:v2"],
      targetReferenceDigest: sha("1"),
      compensation: "terminate_unenrolled",
    },
    policy,
  );
  assert.equal(operation.operator, "derive_agent");
  assert.throws(() =>
    createMorphogenesisPolicyV2({
      ...policy.policy,
      enabledAdvancedCapabilities: [],
      maximumDerivedAgentsPerProposal: 0,
    }),
  );
  assert.throws(() =>
    createMorphogenesisPolicyV1({
      ...baseline,
      allowedOperators: [...baseline.allowedOperators, "derive_agent"],
    }),
  );
});

test("advanced Morphogenesis operators compile to existing authority boundaries", () => {
  const baseline = fixture().policy.policy;
  const policy = createMorphogenesisPolicyV2({
    ...baseline,
    schemaVersion: 2,
    allowedOperators: [
      ...new Set([
        ...baseline.allowedOperators,
        "derive_agent",
        "realign_role",
        "reassign_work",
        "replace_agent",
        "suspend_agent",
        "split_team",
        "merge_teams",
        "federate_teams",
      ]),
    ].sort(),
    enabledAdvancedCapabilities: [
      "derived_profiles",
      "synthesized_profiles",
      "role_realignments",
      "work_reassignments",
      "agent_replacements",
      "agent_suspensions",
      "team_topology_transformations",
    ],
    maximumDerivedAgentsPerProposal: 1,
    maximumSynthesizedAgentsPerProposal: 1,
    maximumRoleChangesPerProposal: 1,
    maximumWorkReassignmentsPerProposal: 1,
    maximumReplacementsPerProposal: 1,
    maximumSuspensionsPerProposal: 1,
    maximumTopologyOperationsPerProposal: 1,
    maximumCreationDepth: 0,
  });
  const fixtures = [
    [
      "derive_agent",
      {
        operator: "derive_agent",
        profileDigest: sha("1"),
        evolutionDigest: sha("2"),
        attenuationDigest: sha("3"),
      },
      "agent_instantiation_profile",
    ],
    [
      "realign_role",
      {
        operator: "realign_role",
        roleRealignmentRequestDigest: sha("4"),
        currentRoleBindingDigest: sha("5"),
      },
      "governed_role_realignment",
    ],
    [
      "reassign_work",
      {
        operator: "reassign_work",
        missionLifecycleCommandDigest: sha("6"),
        predecessorWorkContractDigest: sha("7"),
        successorWorkContractDigest: sha("8"),
      },
      "mission_work_reassignment",
    ],
    [
      "replace_agent",
      {
        operator: "replace_agent",
        predecessorAgentDigest: sha("9"),
        successorTargetDigest: sha("a"),
        continuityPolicyDigest: sha("b"),
      },
      "governed_agent_lifecycle",
    ],
    [
      "suspend_agent",
      {
        operator: "suspend_agent",
        agentDigest: sha("c"),
        suspensionPolicyDigest: sha("d"),
      },
      "team_execution_continuity",
    ],
    [
      "split_team",
      {
        operator: "split_team",
        transformationRequestDigest: sha("e"),
        topologyPolicyDigest: sha("f"),
      },
      "team_topology_transformation",
    ],
  ];
  for (const [operator, binding, firstBoundary] of fixtures) {
    const operation = createMorphogenesisOperationV1(
      {
        operationId: `operation:compile:${operator}`,
        operator,
        effectClass: "protected_external",
        dependsOnOperationIds: [],
        targetReferenceDigest: sha("0"),
        compensation: "restore_predecessor_before_commit",
      },
      policy,
    );
    const plan = compileMorphogenesisOperatorV2({
      planId: `compiled-plan:${operator}`,
      operation,
      policy,
      binding,
      compilerId: "compiler:morphogenesis:v2",
      compilerVersion: 1,
      compilerImplementationDigest: sha("1"),
      compiledAtLogicalMs: 100,
    });
    assert.equal(plan.steps[0].boundary, firstBoundary);
    assert.equal(plan.advisoryOnly, true);
    assert.equal(
      validateMorphogenesisCompiledOperatorPlanV2(plan, {
        operation,
        policy,
        binding,
      }).planDigest,
      plan.planDigest,
    );
    if (operator === "replace_agent") {
      assert.equal(plan.steps.length, 6);
      assert.equal(plan.steps.at(-1).operation, "drain_and_retire_predecessor");
    }
  }
});

test("advanced operator runtime reconciles a crash without repeating the boundary effect", async () => {
  const baseline = fixture().policy.policy;
  const policy = createMorphogenesisPolicyV2({
    ...baseline,
    schemaVersion: 2,
    allowedOperators: [...baseline.allowedOperators, "derive_agent"].sort(),
    enabledAdvancedCapabilities: ["derived_profiles"],
    maximumDerivedAgentsPerProposal: 1,
    maximumSynthesizedAgentsPerProposal: 0,
    maximumRoleChangesPerProposal: 0,
    maximumWorkReassignmentsPerProposal: 0,
    maximumReplacementsPerProposal: 0,
    maximumSuspensionsPerProposal: 0,
    maximumTopologyOperationsPerProposal: 0,
    maximumCreationDepth: 0,
  });
  const operation = createMorphogenesisOperationV1(
    {
      operationId: "operation:runtime:derive",
      operator: "derive_agent",
      effectClass: "protected_external",
      dependsOnOperationIds: [],
      targetReferenceDigest: sha("1"),
      compensation: "terminate_unenrolled",
    },
    policy,
  );
  const binding = {
    operator: "derive_agent",
    profileDigest: sha("2"),
    evolutionDigest: sha("3"),
    attenuationDigest: sha("4"),
  };
  const plan = compileMorphogenesisOperatorV2({
    planId: "compiled-plan:runtime:derive",
    operation,
    policy,
    binding,
    compilerId: "compiler:morphogenesis:v2",
    compilerVersion: 1,
    compilerImplementationDigest: sha("5"),
    compiledAtLogicalMs: 100,
  });
  const store = new InMemoryMorphogenesisOperatorExecutionStoreV2();
  const applied = new Map();
  const executeCounts = new Map();
  let crash = true;
  const boundaries = {
    async execute(input) {
      executeCounts.set(
        input.step.stepId,
        (executeCounts.get(input.step.stepId) ?? 0) + 1,
      );
      const receipt = createMorphogenesisOperatorStepReceiptV2({
        operationId: input.operationId,
        planDigest: input.plan.planDigest,
        stepId: input.step.stepId,
        stepDigest: input.step.stepDigest,
        boundary: input.step.boundary,
        resultDigest: sha(String(applied.size + 6)),
        appliedAtLogicalMs: input.logicalTimeMs,
      });
      applied.set(input.operationId, receipt);
      if (input.step.stepId === plan.steps[1].stepId && crash) {
        crash = false;
        throw new Error("simulated stop after external commit");
      }
      return { status: "applied", receipt };
    },
    async reconcile(input) {
      const receipt = applied.get(input.operationId);
      return receipt
        ? { status: "applied", receipt }
        : { status: "not_applied" };
    },
  };
  let runtime = new MorphogenesisOperatorExecutionRuntimeV2({
    store,
    boundaries,
  });
  let state = await runtime.initialize({
    stateKey: "operator-execution:derive:1",
    plan,
    proposalDigest: sha("a"),
    decisionDigest: sha("b"),
    authorizationDigest: sha("c"),
    authorityFenceDigest: sha("d"),
    expectedMorphologyEpoch: 1,
    logicalTimeMs: 110,
  });
  let logicalTimeMs = 120;
  while (state.status !== "completed") {
    try {
      state = await runtime.advance({
        stateKey: state.stateKey,
        logicalTimeMs,
      });
    } catch (error) {
      assert.match(error.message, /simulated stop/);
      runtime = new MorphogenesisOperatorExecutionRuntimeV2({
        store,
        boundaries,
      });
      state = await runtime.required(state.stateKey);
      assert.equal(state.status, "executing");
    }
    logicalTimeMs += 10;
  }
  assert.equal(state.receipts.length, plan.steps.length);
  assert.equal(applied.size, plan.steps.length);
  for (const step of plan.steps)
    assert.equal(executeCounts.get(step.stepId), 1);
  assert.equal(
    (await runtime.required(state.stateKey)).stateDigest,
    state.stateDigest,
  );
  let indeterminateCalls = 0;
  const indeterminateRuntime = new MorphogenesisOperatorExecutionRuntimeV2({
    store: new InMemoryMorphogenesisOperatorExecutionStoreV2(),
    boundaries: {
      async execute() {
        indeterminateCalls += 1;
        return { status: "indeterminate", evidenceDigest: sha("e") };
      },
      async reconcile() {
        indeterminateCalls += 1;
        return { status: "indeterminate", evidenceDigest: sha("e") };
      },
    },
  });
  let indeterminate = await indeterminateRuntime.initialize({
    stateKey: "operator-execution:derive:indeterminate",
    plan,
    proposalDigest: sha("a"),
    decisionDigest: sha("b"),
    authorizationDigest: sha("c"),
    authorityFenceDigest: sha("d"),
    expectedMorphologyEpoch: 1,
    logicalTimeMs: 110,
  });
  indeterminate = await indeterminateRuntime.advance({
    stateKey: indeterminate.stateKey,
    logicalTimeMs: 120,
  });
  assert.equal(indeterminate.status, "indeterminate");
  assert.equal(
    (await indeterminateRuntime.advance({
      stateKey: indeterminate.stateKey,
      logicalTimeMs: 130,
    })).stateDigest,
    indeterminate.stateDigest,
  );
  assert.equal(indeterminateCalls, 1);
});

test("split_team executes through the existing durable Team topology reducer", async () => {
  const baseline = fixture().policy.policy;
  const policy = createMorphogenesisPolicyV2({
    ...baseline,
    schemaVersion: 2,
    allowedOperators: [...baseline.allowedOperators, "split_team"].sort(),
    enabledAdvancedCapabilities: ["team_topology_transformations"],
    maximumDerivedAgentsPerProposal: 0,
    maximumSynthesizedAgentsPerProposal: 0,
    maximumRoleChangesPerProposal: 0,
    maximumWorkReassignmentsPerProposal: 0,
    maximumReplacementsPerProposal: 0,
    maximumSuspensionsPerProposal: 0,
    maximumTopologyOperationsPerProposal: 1,
    maximumCreationDepth: 0,
  });
  const source = createTeamTopologyNodeV1({
    teamId: "team:source",
    parentTeamIds: [],
    memberIds: ["agent:a", "agent:b"],
    coordinatorId: "agent:a",
    membershipEpoch: 1,
    membershipConfigurationDigest: sha("1"),
  });
  const targets = [
    createTeamTopologyNodeV1({
      teamId: "team:target:a",
      parentTeamIds: [source.teamId],
      memberIds: ["agent:a"],
      coordinatorId: "agent:a",
      membershipEpoch: 2,
      membershipConfigurationDigest: sha("2"),
    }),
    createTeamTopologyNodeV1({
      teamId: "team:target:b",
      parentTeamIds: [source.teamId],
      memberIds: ["agent:b"],
      coordinatorId: "agent:b",
      membershipEpoch: 2,
      membershipConfigurationDigest: sha("2"),
    }),
  ];
  const topology = createTeamTopologyStateV1({
    topologyId: "topology:morphogenesis:test",
    epoch: 1,
    topology: [source],
  });
  const request = createTeamTopologyTransformationRequestV1({
    transformationId: "topology-transformation:split:1",
    operation: "split",
    sourceTeamIds: [source.teamId],
    targetTeams: targets,
    priorTopologyDigest: teamTopologyDigestV1(topology.topology),
    policyDigest: policy.policyDigest,
    quorumDigest: sha("3"),
    requestedAtLogicalMs: 100,
    validUntilLogicalMs: 500,
  });
  const operation = createMorphogenesisOperationV1(
    {
      operationId: "operation:split-team:1",
      operator: "split_team",
      effectClass: "protected_external",
      dependsOnOperationIds: [],
      targetReferenceDigest: request.requestDigest,
      compensation: "restore_predecessor_before_commit",
    },
    policy,
  );
  const binding = {
    operator: "split_team",
    transformationRequestDigest: request.requestDigest,
    topologyPolicyDigest: policy.policyDigest,
  };
  const plan = compileMorphogenesisOperatorV2({
    planId: "compiled-plan:split-team:1",
    operation,
    policy,
    binding,
    compilerId: "compiler:morphogenesis:v2",
    compilerVersion: 1,
    compilerImplementationDigest: sha("4"),
    compiledAtLogicalMs: 110,
  });
  const topologyStore = new InMemoryMorphogenesisTeamTopologyStateStoreV2([
    topology,
  ]);
  const adapter = new TeamTopologyMorphogenesisBoundaryV2({
    store: topologyStore,
    requests: {
      async resolve(digest) {
        return digest === request.requestDigest
          ? { topologyId: topology.topologyId, request }
          : null;
      },
    },
  });
  const runtime = new MorphogenesisOperatorExecutionRuntimeV2({
    store: new InMemoryMorphogenesisOperatorExecutionStoreV2(),
    boundaries: adapter,
  });
  let state = await runtime.initialize({
    stateKey: "operator-execution:split-team:1",
    plan,
    proposalDigest: sha("5"),
    decisionDigest: sha("6"),
    authorizationDigest: sha("7"),
    authorityFenceDigest: sha("8"),
    expectedMorphologyEpoch: 1,
    logicalTimeMs: 120,
  });
  while (state.status !== "completed")
    state = await runtime.advance({
      stateKey: state.stateKey,
      logicalTimeMs: 130 + state.revision,
    });
  const activated = await topologyStore.load(topology.topologyId);
  assert.equal(activated.epoch, 2);
  assert.deepEqual(
    activated.topology.map(({ teamId }) => teamId),
    ["team:target:a", "team:target:b"],
  );
  assert.equal(
    activated.transformations.find(
      ({ transformationId }) =>
        transformationId === request.transformationId,
    ).status,
    "activated",
  );
  assert.equal(state.receipts.length, 2);
});

test("reassign_work observes Mission Lifecycle and an exact successor Work receipt", async () => {
  const baseline = fixture().policy.policy;
  const policy = createMorphogenesisPolicyV2({
    ...baseline,
    schemaVersion: 2,
    allowedOperators: [...baseline.allowedOperators, "reassign_work"].sort(),
    enabledAdvancedCapabilities: ["work_reassignments"],
    maximumDerivedAgentsPerProposal: 0,
    maximumSynthesizedAgentsPerProposal: 0,
    maximumRoleChangesPerProposal: 0,
    maximumWorkReassignmentsPerProposal: 1,
    maximumReplacementsPerProposal: 0,
    maximumSuspensionsPerProposal: 0,
    maximumTopologyOperationsPerProposal: 0,
    maximumCreationDepth: 0,
  });
  const operation = createMorphogenesisOperationV1(
    {
      operationId: "operation:reassign-work:1",
      operator: "reassign_work",
      effectClass: "protected_external",
      dependsOnOperationIds: [],
      targetReferenceDigest: sha("1"),
      compensation: "restore_predecessor_before_commit",
    },
    policy,
  );
  const binding = {
    operator: "reassign_work",
    missionLifecycleCommandDigest: sha("2"),
    predecessorWorkContractDigest: sha("3"),
    successorWorkContractDigest: sha("4"),
  };
  const plan = compileMorphogenesisOperatorV2({
    planId: "compiled-plan:reassign-work:1",
    operation,
    policy,
    binding,
    compilerId: "compiler:morphogenesis:v2",
    compilerVersion: 1,
    compilerImplementationDigest: sha("5"),
    compiledAtLogicalMs: 100,
  });
  let missionAdvances = 0;
  const missionState = {
    outbox: [
      {
        action: "enact_work_reassignment",
        status: "applied",
        controlProposalDigest: binding.missionLifecycleCommandDigest,
        intentDigest: sha("6"),
        resultDigest: sha("7"),
      },
    ],
  };
  const mission = new MissionWorkReassignmentMorphogenesisBoundaryV2({
    async resolveMission(digest) {
      if (digest !== binding.missionLifecycleCommandDigest) return null;
      return {
        runtime: {
          async advance() { missionAdvances += 1; return missionState; },
          async recover() { return missionState; },
        },
        request: { logicalTimeMs: 120 },
        morphogenesisAuthorizationDigest: sha("8"),
        authorityFenceDigest: sha("9"),
      };
    },
    async resolveWorkReceipt(digest) {
      return digest === binding.successorWorkContractDigest
        ? {
            commandDigest: binding.missionLifecycleCommandDigest,
            missionResultDigest: sha("7"),
            workContractDigest: binding.successorWorkContractDigest,
            workReceiptDigest: sha("a"),
            issuedAtLogicalMs: 125,
          }
        : null;
    },
  });
  const fence = {
    async execute(input) {
      return {
        status: "applied",
        receipt: createMorphogenesisOperatorStepReceiptV2({
          operationId: input.operationId,
          planDigest: input.plan.planDigest,
          stepId: input.step.stepId,
          stepDigest: input.step.stepDigest,
          boundary: input.step.boundary,
          resultDigest: sha("b"),
          appliedAtLogicalMs: input.logicalTimeMs,
        }),
      };
    },
    async reconcile() { return { status: "not_applied" }; },
  };
  const runtime = new MorphogenesisOperatorExecutionRuntimeV2({
    store: new InMemoryMorphogenesisOperatorExecutionStoreV2(),
    boundaries: new MorphogenesisOperatorBoundaryRouterV2([
      {
        boundaries: ["mission_work_reassignment"],
        port: mission,
      },
      { boundaries: ["work_action_fence"], port: fence },
    ]),
  });
  let state = await runtime.initialize({
    stateKey: "operator-execution:reassign-work:1",
    plan,
    proposalDigest: sha("c"),
    decisionDigest: sha("d"),
    authorizationDigest: sha("8"),
    authorityFenceDigest: sha("9"),
    expectedMorphologyEpoch: 1,
    logicalTimeMs: 110,
  });
  while (state.status !== "completed")
    state = await runtime.advance({
      stateKey: state.stateKey,
      logicalTimeMs: 120 + state.revision,
    });
  assert.equal(state.receipts.length, 3);
  assert.equal(state.receipts[1].resultDigest, sha("a"));
  assert.equal(missionAdvances, 1);
});

test("realign_role delegates waiting and activation to the existing role runtime", async () => {
  const baseline = fixture().policy.policy;
  const policy = createMorphogenesisPolicyV2({
    ...baseline,
    schemaVersion: 2,
    allowedOperators: [...baseline.allowedOperators, "realign_role"].sort(),
    enabledAdvancedCapabilities: ["role_realignments"],
    maximumDerivedAgentsPerProposal: 0,
    maximumSynthesizedAgentsPerProposal: 0,
    maximumRoleChangesPerProposal: 1,
    maximumWorkReassignmentsPerProposal: 0,
    maximumReplacementsPerProposal: 0,
    maximumSuspensionsPerProposal: 0,
    maximumTopologyOperationsPerProposal: 0,
    maximumCreationDepth: 0,
  });
  const operation = createMorphogenesisOperationV1(
    {
      operationId: "operation:realign-role:1",
      operator: "realign_role",
      effectClass: "protected_external",
      dependsOnOperationIds: [],
      targetReferenceDigest: sha("1"),
      compensation: "restore_predecessor_before_commit",
    },
    policy,
  );
  const binding = {
    operator: "realign_role",
    roleRealignmentRequestDigest: sha("2"),
    currentRoleBindingDigest: sha("3"),
  };
  const plan = compileMorphogenesisOperatorV2({
    planId: "compiled-plan:realign-role:1",
    operation,
    policy,
    binding,
    compilerId: "compiler:morphogenesis:v2",
    compilerVersion: 1,
    compilerImplementationDigest: sha("4"),
    compiledAtLogicalMs: 100,
  });
  let runs = 0;
  const adapter = new RoleRealignmentMorphogenesisBoundaryV2({
    async resolve(digest) {
      if (digest !== binding.roleRealignmentRequestDigest) return null;
      return {
        runtime: {
          async run(input) {
            runs += 1;
            return runs === 1
              ? {
                  request: { requestDigest: digest },
                  status: "selected",
                  stateDigest: sha("5"),
                }
              : {
                  request: { requestDigest: digest },
                  status: "activated",
                  stateDigest: sha("6"),
                  activation: {
                    activationDigest: sha("7"),
                    completedAtLogicalMs: input.logicalTimeMs,
                  },
                };
          },
        },
        input: {
          sessionId: "session:role:1",
          requestId: "request:role:1",
          selectionId: "selection:role:1",
          activationId: "activation:role:1",
          authorityCeiling: {},
          logicalTimeMs: 100,
        },
        currentRoleBindingDigest: binding.currentRoleBindingDigest,
        morphogenesisAuthorizationDigest: sha("8"),
        authorityFenceDigest: sha("9"),
      };
    },
  });
  const runtime = new MorphogenesisOperatorExecutionRuntimeV2({
    store: new InMemoryMorphogenesisOperatorExecutionStoreV2(),
    boundaries: new MorphogenesisOperatorBoundaryRouterV2([
      { boundaries: ["governed_role_realignment"], port: adapter },
    ]),
  });
  let state = await runtime.initialize({
    stateKey: "operator-execution:realign-role:1",
    plan,
    proposalDigest: sha("a"),
    decisionDigest: sha("b"),
    authorizationDigest: sha("8"),
    authorityFenceDigest: sha("9"),
    expectedMorphologyEpoch: 1,
    logicalTimeMs: 110,
  });
  state = await runtime.advance({ stateKey: state.stateKey, logicalTimeMs: 120 });
  assert.equal(state.status, "prepared");
  assert.equal(state.nextStepIndex, 0);
  state = await runtime.advance({ stateKey: state.stateKey, logicalTimeMs: 130 });
  assert.equal(state.status, "completed");
  assert.equal(state.receipts[0].resultDigest, sha("7"));
  assert.equal(runs, 2);
});
