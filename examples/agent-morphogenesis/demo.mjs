import {
  InMemoryMorphogenesisExecutionStoreV1,
  MorphogenesisExecutionRuntimeV1,
  MorphogenesisExecutionTaskExecutorV1,
  MorphogenesisTaskExecutionBindingResolverV1,
  createMorphogenesisAgentAttestationV1,
  createMorphogenesisAuthorityFenceReceiptV1,
  createMorphogenesisBudgetEnvelopeV1,
  createMorphogenesisBudgetReservationRequestV1,
  createMorphogenesisBudgetReservationV1,
  createMorphogenesisCandidateSearchRequestV1,
  createMorphogenesisCandidateSearchResultV1,
  createMorphogenesisCatalogLifecycleProcessDefinitionV1,
  createMorphogenesisCatalogLifecycleTaskDefinitionsV1,
  createMorphogenesisContinuityReceiptV1,
  createMorphogenesisDecisionAuthorizationV1,
  createMorphogenesisDecisionBindingV1,
  createMorphogenesisDecisionCandidateV1,
  createMorphogenesisExistingCandidateV1,
  createMorphogenesisLifecycleAgentV1,
  createMorphogenesisPolicyV1,
  createMorphogenesisProcessBindingV1,
  createMorphogenesisScopeV1,
  createMorphogenesisSuccessorTeamReceiptV1,
  createMorphogenesisTerminalAgentReceiptV1,
} from "../../packages/collective-runtime/dist/morphogenesis.js";
import { InMemoryProcessRunnerV1 } from "../../packages/workflows/dist/index.js";

const sha = (character) => `sha256:${character.repeat(64)}`;

const requestedBranch = process.argv[2] ?? "both";
const requestedRoute = process.argv[3] ?? "authorized_agent";
const branches = requestedBranch === "both" ? ["recruit", "create"] : [requestedBranch];

for (const branch of branches)
  console.log(JSON.stringify(await runScenario(branch, requestedRoute), null, 2));

async function runScenario(branch, decisionRoute) {
  if (!new Set(["recruit", "create"]).has(branch))
    throw new TypeError("branch must be recruit, create or both");
  if (!new Set(["authorized_agent", "authorized_person"]).has(decisionRoute))
    throw new TypeError("decision route must be authorized_agent or authorized_person");

  const scope = createMorphogenesisScopeV1({
    tenantId: "tenant:example",
    morphologyId: `morphology:${branch}`,
    policyDomainId: "policy-domain:example",
    missionId: "mission:incident-response",
    missionIntentId: "mission-intent:incident-response",
    objectiveId: "objective:database-forensics",
    meshId: "mesh:example",
    roomId: "room:incident-response",
    workItemId: "work:database-forensics",
    workItemRevision: 1,
  });
  const policy = createMorphogenesisPolicyV1({
    schemaVersion: 1,
    policyId: "policy:morphogenesis-example",
    policyVersion: 1,
    parentPolicyDigest: null,
    requiredSourceClasses: ["mission"],
    allowedOperators: [
      "recruit_existing",
      "instantiate_agent",
      "detach_agent",
      "retire_agent",
    ],
    allowedDecisionRoutes: ["authorized_agent", "authorized_person"],
    requireIndependentDecider: true,
    allowAgentCreation: true,
    maximumPopulation: 8,
    maximumNewAgentsPerProposal: 1,
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
  const budget = createMorphogenesisBudgetEnvelopeV1({
    maximumActiveAgents: 3,
    maximumNewAgents: branch === "create" ? 1 : 0,
    maximumConcurrentProvisioning: branch === "create" ? 1 : 0,
    maximumResourceUnits: 10,
    maximumInteractionUnits: 100,
    maximumActionUnits: 10,
    maximumInputTokens: 100,
    maximumOutputTokens: 100,
    maximumTotalTokens: 200,
    maximumDurationMs: 10_000,
    maximumCosts: [{ currency: "USD", micros: 1_000_000 }],
  });
  const definition = createMorphogenesisCatalogLifecycleProcessDefinitionV1();
  const operation = branch === "create" ? "instantiate_agent" : "recruit_existing";
  const proposal = {
    schemaVersion: 1,
    proposalId: `proposal:${branch}`,
    scopeDigest: scope.scopeDigest,
    currentSnapshotDigest: sha("1"),
    expectedCurrentEpoch: 1,
    needDigest: sha("2"),
    targetDigest: sha("3"),
    operations: [
      {
        schemaVersion: 1,
        operationId: `operation:${operation}`,
        operator: operation,
        effectClass: branch === "create" ? "protected_external" : "internal",
        dependsOnOperationIds: [],
        targetReferenceDigest: sha("4"),
        compensation: branch === "create" ? "terminate_unenrolled" : "none",
        operationDigest: sha("5"),
      },
    ],
    processDefinitionDigest: definition.definitionDigest,
    budget,
    decisionRoute,
    proposerId: "agent:planner",
    proposerVersion: 1,
    proposerImplementationDigest: sha("6"),
    proposedAtLogicalMs: 100,
    expiresAtLogicalMs: 1_000,
    proposalDigest: branch === "create" ? sha("7") : sha("8"),
    advisoryOnly: true,
  };
  const decisionCandidate = createMorphogenesisDecisionCandidateV1({
    candidateId: `decision-candidate:${branch}`,
    proposal,
    policy,
    membershipConfigurationDigest: sha("9"),
    membershipEpoch: 1,
    authorityId: "authority:morphogenesis-example",
    authorityEpoch: 1,
    workContractDigest: sha("a"),
    preparedAtLogicalMs: 110,
    expiresAtLogicalMs: 900,
  });
  const authorization = createMorphogenesisDecisionAuthorizationV1({
    authorizationId: `authorization:${branch}:${decisionRoute}`,
    candidateDigest: decisionCandidate.candidateDigest,
    route: decisionRoute,
    actorType: decisionRoute === "authorized_agent" ? "agent" : "person",
    actorId:
      decisionRoute === "authorized_agent"
        ? "agent:supervisor"
        : "person:reviewer",
    actorMandateDigest: sha("b"),
    independenceGroupId: "independence:review",
    disposition: "approved",
    proofDigest: sha("c"),
    issuedAtLogicalMs: 120,
    expiresAtLogicalMs: 800,
  });
  const decision = createMorphogenesisDecisionBindingV1({
    decisionId: `decision:${branch}`,
    candidate: decisionCandidate,
    authorization,
    decisionPortId: "decision-port:example",
    decisionPortVersion: 1,
    decisionPortImplementationDigest: sha("d"),
    decidedAtLogicalMs: 130,
  });
  const reservationRequest = createMorphogenesisBudgetReservationRequestV1({
    reservationId: `reservation:${branch}`,
    scopeDigest: scope.scopeDigest,
    proposalDigest: proposal.proposalDigest,
    expectedMorphologyEpoch: 1,
    operationId: `budget-operation:${branch}`,
    budget,
    reservedAtLogicalMs: 120,
    expiresAtLogicalMs: 1_000,
  });
  const reservation = createMorphogenesisBudgetReservationV1({
    request: reservationRequest,
    status: "reserved",
    closedAtLogicalMs: null,
    closeOperationId: null,
    closeReasonCode: null,
  });
  const searchRequest = createMorphogenesisCandidateSearchRequestV1({
    requestId: `search:${branch}`,
    scopeDigest: scope.scopeDigest,
    positionDigest: sha("e"),
    requiredCapabilityKeys: ["database_forensics"],
    membershipConfigurationDigest: sha("9"),
    membershipEpoch: 1,
    viewId: `view:${branch}`,
    viewDigest: sha("f"),
    searchLimit: 8,
    requestedAtLogicalMs: 100,
    expiresAtLogicalMs: 1_000,
  });
  const existing = createMorphogenesisExistingCandidateV1({
    candidateId: "candidate:existing",
    agentId: "agent:existing",
    peerId: "peer:existing",
    instanceId: "instance:existing:1",
    lineageDigest: sha("0"),
    capabilityKeys: ["database_forensics"],
    sourceEvidenceDigest: sha("1"),
    membershipConfigurationDigest: searchRequest.membershipConfigurationDigest,
    membershipEpoch: 1,
    locallyEvaluatedScoreMicros: 9_000,
    budgetUnits: 5,
    observedAtLogicalMs: 140,
    validUntilLogicalMs: 900,
  });
  const searchResult = createMorphogenesisCandidateSearchResultV1(
    {
      requestDigest: searchRequest.requestDigest,
      status:
        branch === "recruit"
          ? "eligible_candidates"
          : "no_eligible_candidate_in_bounded_view",
      completeWithinDeclaredView: true,
      searchedCandidateCount: branch === "recruit" ? 1 : 0,
      candidates: branch === "recruit" ? [existing] : [],
      observedAtLogicalMs: 150,
    },
    searchRequest,
  );
  const profile = {
    schemaVersion: 1,
    profileDigest: sha("2"),
    roleDefinitionDigest: sha("3"),
  };
  const created = createMorphogenesisLifecycleAgentV1({
    agentId: branch === "recruit" ? existing.agentId : "agent:created",
    peerId: branch === "recruit" ? existing.peerId : "peer:created",
    instanceId:
      branch === "recruit" ? existing.instanceId : "instance:created:1",
    lineageDigest: branch === "recruit" ? existing.lineageDigest : sha("4"),
    capabilityKeys: ["database_forensics"],
    roleDefinitionDigest: profile.roleDefinitionDigest,
    membershipConfigurationDigest: branch === "recruit" ? sha("9") : sha("5"),
    membershipEpoch: branch === "recruit" ? 1 : 2,
    source: branch === "recruit" ? "existing" : "catalog_created",
  });
  const store = new InMemoryMorphogenesisExecutionStoreV1();
  let materialized = false;
  let firstCreate = true;
  const ports = postCommitPorts();
  const options = {
    ...ports,
    discovery: { async search() { return searchResult; } },
    profiles: {
      async resolve(digest) {
        return digest === profile.profileDigest
          ? {
              profile,
              certificationDigest: sha("6"),
              validUntilLogicalMs: 900,
              status: "certified",
            }
          : null;
      },
    },
    lifecycle: {
      async createAndEnroll() {
        materialized = true;
        if (firstCreate) {
          firstCreate = false;
          throw new Error("simulated process stop after external creation");
        }
        return created;
      },
      async reconcileCreateAndEnroll() { return materialized ? created : null; },
      async eligibility(input) {
        return input.peerId === created.peerId ? created : null;
      },
    },
    attestation: {
      async attest(input) {
        return createMorphogenesisAgentAttestationV1({
          operationId: input.operationId,
          agentDigest: input.agent.agentDigest,
          profileDigest: branch === "create" ? profile.profileDigest : null,
          runtimeAttestationDigest: sha("7"),
          capabilityAssessmentDigests: [sha("8")],
          eligibilityEvidenceDigests: [sha("9")],
          attestedAtLogicalMs: input.logicalTimeMs,
          validUntilLogicalMs: 900,
        });
      },
      async reconcile(input) { return this.attest(input); },
    },
    teams: {
      async activateSuccessor(input) {
        return createMorphogenesisSuccessorTeamReceiptV1({
          operationId: input.operationId,
          agentDigest: input.agent.agentDigest,
          teamId: `team:${branch}`,
          teamEpoch: 2,
          teamProposalDigest: sha("a"),
          jointWorkContractDigest: sha("b"),
          individualWorkContractDigests: [sha("c")],
          executionStateDigest: sha("d"),
          retainedArtifactDigests: [sha("e")],
          invalidatedCausalClosureDigests: [],
          activatedAtLogicalMs: input.logicalTimeMs,
        });
      },
      async reconcileActivation(input) { return this.activateSuccessor(input); },
    },
    store,
    maximumCommitAttempts: 4,
  };
  let runtime = new MorphogenesisExecutionRuntimeV1(options);
  const execution = await runtime.initialize({
    stateKey: `execution:${branch}`,
    scope,
    proposalDigest: proposal.proposalDigest,
    targetDigest: proposal.targetDigest,
    decision,
    budgetReservation: reservation,
    morphologyHeadStateKey: `head:${branch}`,
    expectedMorphologyEpoch: 1,
    resultingSnapshotDigest: sha("f"),
    positionDigest: searchRequest.positionDigest,
    requiredCapabilityKeys: searchRequest.requiredCapabilityKeys,
    searchRequest,
    profile: branch === "create" ? profile : null,
    profileCertificationDigest: branch === "create" ? sha("6") : null,
    logicalTimeMs: 160,
  });
  if (branch === "create") {
    try {
      await runtime.resolveAgent({ stateKey: execution.stateKey, logicalTimeMs: 170 });
    } catch (error) {
      console.error(`[expected crash] ${error.message}`);
      runtime = new MorphogenesisExecutionRuntimeV1(options);
      await runtime.resolveAgent({ stateKey: execution.stateKey, logicalTimeMs: 171 });
    }
  }
  const runId = `workflow:${branch}`;
  const binding = createMorphogenesisProcessBindingV1({
    tenantId: scope.tenantId,
    runId,
    executionStateKey: execution.stateKey,
    processDefinitionDigest: definition.definitionDigest,
    scopeDigest: scope.scopeDigest,
    proposalDigest: proposal.proposalDigest,
    targetDigest: proposal.targetDigest,
    candidateDigest: decisionCandidate.candidateDigest,
    policyDigest: policy.policyDigest,
    morphologyEpoch: 1,
    boundAtLogicalMs: 170,
  });
  const effectExecutor = new MorphogenesisExecutionTaskExecutorV1({
    execution: runtime,
    bindings: { async resolve() { return binding; } },
    clock: { read(task) { return 180 + task.attempt; } },
    evaluation: {
      async evaluate() {
        return { disposition: "success", outcomeEvidenceDigests: [sha("0")] };
      },
    },
  });
  const runner = new InMemoryProcessRunnerV1(undefined, {
    taskExecutor: {
      async execute(task) {
        return ["attest", "evaluate"].includes(task.stage.stageId)
          ? effectExecutor.execute(task)
          : { status: "completed" };
      },
    },
    protectedTaskExecutor: effectExecutor,
    gateProvider: {
      async resolve() { return { status: "approved", gateRequestId: `gate:${branch}` }; },
    },
    taskBindingResolver: new MorphogenesisTaskExecutionBindingResolverV1({
      policyDigest: policy.policyDigest,
      toolsetDigest: sha("1"),
      runtimeImplementationDigest: sha("2"),
    }),
  });
  for (const task of createMorphogenesisCatalogLifecycleTaskDefinitionsV1())
    await runner.registerTaskDefinition(scope.tenantId, task);
  await runner.registerProcessDefinition(scope.tenantId, definition);
  await runner.start({
    tenantId: scope.tenantId,
    runId,
    processId: definition.processId,
    processVersion: definition.version,
    operationId: `start:${branch}`,
    idempotencyKey: `start:${branch}`,
    input: {
      candidateDigest: decisionCandidate.candidateDigest,
      decisionRoute,
    },
    logicalTime: "2026-08-29T12:00:00.000Z",
  });
  await runner.signal({
    tenantId: scope.tenantId,
    runId,
    operationId: `outcome:${branch}`,
    idempotencyKey: `outcome:${branch}`,
    signal: {
      signalId: `outcome-signal:${branch}`,
      signalType: "agentplat.morphogenesis.outcome.v1",
      correlationKey: "morphogenesis",
      sourceType: "example",
      sourceId: `example:${branch}`,
      receivedAt: "2026-08-29T12:01:00.000Z",
    },
    logicalTime: "2026-08-29T12:01:00.000Z",
  });
  const result = await runtime.required(execution.stateKey);
  return {
    branch,
    decisionRoute,
    phase: result.phase,
    agentSource: result.agent.source,
    terminalDisposition: result.terminalAgent.disposition,
    morphologyEpoch: result.activation.morphologyEpoch,
    receiptDigest: result.receipt.receiptDigest,
    eventCount: result.events.length,
  };
}

function postCommitPorts() {
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
          morphologyHeadDigest: sha("3"),
          activatedAtLogicalMs: input.logicalTimeMs,
          activationReceiptDigest: sha("4"),
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
          checkpointDigest: sha("5"),
          preservedArtifactDigests: [sha("6")],
          completedCausalNodeDigests: [sha("7")],
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
          fencedWorkContractDigests: input.team.individualWorkContractDigests,
          revokedActionGrantDigests: [],
          successorFenceDigests: [sha("8")],
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
          lifecycleReceiptDigest: sha("a"),
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
          membershipConfigurationDigest: sha("b"),
          membershipEpoch: input.agent.membershipEpoch + 1,
          lifecycleReceiptDigest: sha("c"),
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
          reservationDigest: sha("d"),
        };
      },
    },
  };
}
