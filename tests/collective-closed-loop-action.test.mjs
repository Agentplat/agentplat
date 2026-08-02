import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptDelegationMandateV1,
  createCollectiveAuthorityStateV1,
  createDelegationMandateV1,
  delegationMandateDigestV1,
  digestCollectiveJsonV1,
  workContractDigestV1,
} from "@agentplat/collective-control";
import {
  CapabilityRegistryV1,
  INFERENCE_CONTROL_LIMITS_V1,
  createInferenceControlStateV1,
  createPolicyRecordV1,
  negotiateCapabilitiesV1,
  reduceInferenceControlStateV1,
} from "../packages/inference-control/dist/index.js";
import {
  actionDigest,
  actionInputDigest,
  controlDigest,
  scopeDigest,
} from "../packages/inference-control/dist/tools.js";
import {
  DEFAULT_COLLECTIVE_EVALUATION_LIMITS_V1,
  createCollectiveEnvironmentAdvanceRequestV1,
  createCollectiveEnvironmentInitializationV1,
  createCollectiveEvaluationRegistrationBindingV1,
  createCollectiveInvariantMonitorPolicyV1,
} from "@agentplat/collective-planning/evaluation";
import {
  EVIDENCE_TRUST_LIMITS_V1,
  createEvidenceFusionPolicyV1,
  createEvidenceTrustStateV1,
  createTrustEligibilityRequestV1,
  digestEvidenceFusionPolicyV1,
  digestScopeV1,
  digestSubjectV1,
  reduceEvidenceTrustStateV1,
} from "../packages/trust/dist/index.js";
import {
  collectiveDeterministicEnvironmentDigestV1,
  collectiveHiddenCanaryDigestV1,
  createCollectiveDeterministicEnvironmentHarnessV1,
  runCollectiveClosedLoopActionV1,
} from "@agentplat/mesh-sim";

const hash = (value) => digestCollectiveJsonV1("state", value);
const NOW = 20;
const actionInput = Object.freeze({ documentId: "document:closed-loop" });

function mandate() {
  const statement = {
    schemaVersion: 1,
    mandateId: "mandate:closed-loop",
    tenantId: "tenant:closed-loop",
    policyDomainId: "policy-domain:closed-loop",
    issuerId: "issuer:closed-loop",
    revision: 1,
    predecessorDigest: null,
    subjectPeerIds: ["peer:worker"],
    objective: {
      schemaVersion: 1,
      meshId: "mesh:closed-loop",
      objectiveId: "objective:closed-loop",
      objectiveDocumentId: "objective-document:closed-loop",
      minimumObjectiveRevision: 1,
      maximumObjectiveRevision: 1,
    },
    work: {
      schemaVersion: 1,
      workItemIds: ["work:closed-loop"],
      permittedRoleKeys: ["executor"],
      maximumWorkItemRevision: 1,
    },
    permittedCapabilityKeys: ["documents.write"],
    permittedActions: [
      {
        schemaVersion: 1,
        namespace: "documents",
        toolId: "writer",
        operation: "create",
      },
    ],
    budget: {
      schemaVersion: 1,
      totalBudgetUnits: 10,
      maximumWorkBudgetUnits: 10,
      maximumActionBudgetUnits: 10,
      maximumConcurrentWorkReservations: 1,
      maximumConcurrentActionReservations: 1,
      reservationLifetimeMs: 100,
    },
    validFrom: "2026-08-01T00:00:00.000Z",
    validUntil: "2026-08-02T00:00:00.000Z",
    roomProvenance: null,
    evidence: {
      schemaVersion: 1,
      redactionPolicyId: "redaction:closed-loop",
      retentionClass: "standard",
      requireDurablePreDispatchEvidence: true,
    },
  };
  const mandateDigest = delegationMandateDigestV1(statement);
  return createDelegationMandateV1({
    statement,
    proof: {
      schemaVersion: 1,
      kind: "local_attestation",
      issuerId: statement.issuerId,
      attestorId: "attestor:closed-loop",
      attestationId: "attestation:closed-loop",
      signedDigest: mandateDigest,
    },
  });
}

function binding() {
  return {
    schemaVersion: 1,
    actionBindingId: "binding:closed-loop",
    actionBindingVersion: 1,
    namespace: "documents",
    toolId: "writer",
    operation: "create",
    dispatcherId: "dispatcher:closed-loop",
    dispatcherVersion: 1,
    contextResolverId: "context:closed-loop",
    contextResolverVersion: 1,
    fencingMode: "downstream_atomic",
    handlerDigest: controlDigest("handler-binding", { handler: "closed-loop" }),
  };
}

function mesh(overrides = {}) {
  return {
    meshId: "mesh:closed-loop",
    objectiveId: "objective:closed-loop",
    objectiveRevision: 1,
    workItemId: "work:closed-loop",
    workItemRevision: 1,
    assignedPeerId: "peer:worker",
    assignedInstanceId: "instance:worker:1",
    assignmentAuthorityId: "assignment:closed-loop",
    assignmentEpoch: 1,
    authorityGeneration: 1,
    fencingToken: "fence:closed-loop:1",
    leaseExpiresAtLogicalMs: 100,
    objectiveTerminal: false,
    workTerminal: false,
    ...overrides,
  };
}

function scope(current, policyId = "policy:closed-loop") {
  return {
    schemaVersion: 1,
    kind: "coordinated",
    tenantId: "tenant:closed-loop",
    runId: "run:closed-loop",
    agentId: "agent:worker",
    policyId,
    policyVersion: 1,
    meshId: current.meshId,
    objectiveId: current.objectiveId,
    objectiveRevision: current.objectiveRevision,
    workItemId: current.workItemId,
    workItemRevision: current.workItemRevision,
    peerId: current.assignedPeerId,
    instanceId: current.assignedInstanceId,
    assignmentAuthorityId: current.assignmentAuthorityId,
    assignmentEpoch: current.assignmentEpoch,
    fencingToken: current.fencingToken,
    leaseExpiresAtLogicalMs: current.leaseExpiresAtLogicalMs,
    authorityGeneration: current.authorityGeneration,
    objectiveTerminal: false,
    workTerminal: false,
  };
}

function workContract(document, current) {
  const body = {
    schemaVersion: 1,
    workContractId: "contract:closed-loop",
    generation: 1,
    tenantId: document.statement.tenantId,
    policyDomainId: document.statement.policyDomainId,
    mandate: {
      schemaVersion: 1,
      mandateId: document.statement.mandateId,
      mandateRevision: 1,
      mandateDigest: document.mandateDigest,
    },
    objective: {
      schemaVersion: 1,
      meshId: current.meshId,
      objectiveId: current.objectiveId,
      objectiveDocumentId: "objective-document:closed-loop",
      objectiveRevision: current.objectiveRevision,
      acceptedMessageId: "message:objective:closed-loop",
      acceptedPolicyDigest: hash({ objective: "closed-loop" }),
    },
    assignment: {
      schemaVersion: 1,
      workItemId: current.workItemId,
      workItemRevision: current.workItemRevision,
      ownerPeerId: "peer:owner",
      assignedPeerId: current.assignedPeerId,
      assignedInstanceId: current.assignedInstanceId,
      assignmentAuthorityId: current.assignmentAuthorityId,
      assignmentEpoch: current.assignmentEpoch,
      authorityGeneration: current.authorityGeneration,
      fencingToken: current.fencingToken,
      leaseExpiresAtLogicalMs: current.leaseExpiresAtLogicalMs,
      workDeadline: "2026-08-01T00:01:00.000Z",
    },
    roleKey: "executor",
    requiredCapabilityKeys: ["documents.write"],
    completionCriteria: ["write one document"],
    inputReferenceDigest: hash({ input: "closed-loop" }),
    reservedBudgetUnits: 10,
    maximumActionBudgetUnits: 10,
    trustPolicyId: "trust-policy:closed-loop",
    inferencePolicyId: "policy:closed-loop",
    createdAtLogicalMs: NOW,
    updatedAtLogicalMs: NOW,
    status: "active",
    terminalReasonCode: null,
  };
  return { ...body, workContractDigest: workContractDigestV1(body) };
}

function trustFixture(
  current,
  { restricted = false, policyId = "trust-policy:closed-loop" } = {},
) {
  const subject = { schemaVersion: 1, kind: "peer", peerId: "peer:worker" };
  const trustScope = {
    schemaVersion: 1,
    kind: "work",
    tenantId: "tenant:closed-loop",
    meshId: current.meshId,
    objectiveId: current.objectiveId,
    objectiveRevision: current.objectiveRevision,
    workItemId: current.workItemId,
    workItemRevision: current.workItemRevision,
    assignmentEpoch: current.assignmentEpoch,
    assignmentAuthorityId: current.assignmentAuthorityId,
    fencingToken: current.fencingToken,
  };
  const policy = createEvidenceFusionPolicyV1({
    schemaVersion: 1,
    policyId,
    policyVersion: 1,
    parentPolicyDigest: null,
    mode: "restrict",
    dimensions: [
      {
        dimensionId: "integrity",
        priorScoreBasisPoints: 5000,
        priorWeightBasisPoints: 1,
        minimumUncertaintyBasisPoints: 0,
        coverageTargetBasisPoints: 1,
        decayIntervalMs: 1,
        decayBasisPointsPerInterval: 1,
        uncertaintyGrowthBasisPointsPerInterval: 1,
        minimumRetainedWeightBasisPoints: 1,
        contradictionUncertaintyBasisPointsPerClaim: 1,
        maximumContradictionUncertaintyBasisPoints: 1000,
        degradedScoreAtOrBelowBasisPoints: 2000,
        degradedUncertaintyAtOrAboveBasisPoints: 8000,
      },
    ],
    criteria: [
      {
        criterionId: "criterion:integrity",
        dimensionId: "integrity",
        satisfiedValueBasisPoints: 10000,
        violatedValueBasisPoints: 0,
        inconclusiveValueBasisPoints: null,
        baseWeightBasisPoints: 1000,
        maximumClaimWeightBasisPoints: 1000,
        maximumSourceGroupContributionWeightBasisPoints: 1000,
        minimumSupportGroups: 1,
        minimumSupportWeightBasisPoints: 1,
        minimumContradictionGroups: 1,
        minimumContradictionWeightBasisPoints: 1,
        allowClaimSourceAttestation: false,
        contentRequired: false,
        quarantineEligible: false,
        recoveryEligible: false,
        maximumAgeMs: 1000,
        claimAuthority: {
          allowedSourceRelations: ["subject_self"],
          allowedBasisReferences: [
            {
              kind: "external",
              referenceType: "root",
              minimumCount: 1,
              maximumCount: 1,
            },
          ],
        },
        challengeAuthority: {
          allowedSourceRelations: ["target_author"],
          allowedBasisReferences: [
            {
              kind: "external",
              referenceType: "root",
              minimumCount: 1,
              maximumCount: 1,
            },
          ],
          requireResolvedBasis: true,
        },
        challengeResolution: {
          minimumCorroboratingGroups: 1,
          minimumCorroboratingWeightBasisPoints: 1,
          minimumOpposingGroups: 1,
          minimumOpposingWeightBasisPoints: 1,
        },
      },
    ],
    sourceBindings: [
      {
        sourceId: "peer:worker",
        sourceKind: "peer",
        dependencyGroupId: "group:worker",
        roles: ["challenge", "claim"],
        maximumWeightBasisPoints: 1000,
        validFromLogicalMs: 0,
        validUntilLogicalMs: 1000,
      },
    ],
    dependencyGroups: [
      {
        dependencyGroupId: "group:worker",
        maximumAttestationWeightPerClaimBasisPoints: 1000,
        maximumProfileWeightPerDimensionCriterionBasisPoints: 1000,
      },
    ],
    eligibilityRules: [
      {
        ruleId: "permit",
        maximumProfileAgeMs: 100,
        requirements: [
          {
            dimensionId: "integrity",
            minimumScoreBasisPoints: restricted ? 6000 : 4000,
            maximumUncertaintyBasisPoints: 10000,
          },
        ],
      },
    ],
    quarantinePolicy: { enabled: false, rules: [], maximumActiveRecords: 1 },
    recoveryPolicy: { rules: [] },
    limits: EVIDENCE_TRUST_LIMITS_V1,
    diagnosticsPolicyId: "diagnostics:closed-loop",
    redactionPolicyId: "redaction:closed-loop",
  });
  const policyDigest = digestEvidenceFusionPolicyV1(policy);
  let state = reduceEvidenceTrustStateV1(
    createEvidenceTrustStateV1({ stateId: "trust:closed-loop" }),
    { schemaVersion: 1, kind: "policy_registered", policy, logicalTimeMs: 0 },
  ).state;
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "fusion_evaluated",
    request: {
      tenantId: trustScope.tenantId,
      subject,
      scope: trustScope,
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      policyDigest,
      dependencyBindingDigests: [],
    },
    logicalTimeMs: 0,
  }).state;
  const fusion = state.fusionDecisions[0];
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "profile_evaluated",
    fusionDecisionId: fusion.fusionDecisionId,
    fusionDecisionDigest: fusion.fusionDecisionDigest,
    logicalTimeMs: 0,
  }).state;
  const profile = state.profiles[0];
  const rule = policy.eligibilityRules[0];
  return {
    state,
    request: createTrustEligibilityRequestV1({
      schemaVersion: 1,
      tenantId: profile.tenantId,
      subject: profile.subject,
      subjectDigest: digestSubjectV1(profile.subject),
      scope: profile.scope,
      scopeDigest: digestScopeV1(profile.scope),
      policyId: profile.policyId,
      policyVersion: profile.policyVersion,
      policyDigest: profile.policyDigest,
      profileId: profile.profileId,
      profileDigest: profile.profileDigest,
      maximumProfileAgeMs: rule.maximumProfileAgeMs,
      requirements: rule.requirements,
    }),
  };
}

function inferenceFixture(
  current,
  actionBinding,
  {
    deny = false,
    expiresAtLogicalMs = 100,
    policyId = "policy:closed-loop",
  } = {},
) {
  const controlScope = scope(current, policyId);
  const registry = new CapabilityRegistryV1();
  const descriptor = {
    schemaVersion: 1,
    capabilityId: "capability:closed-loop",
    descriptorVersion: 1,
    inputInspection: "full",
    finalOutputAssessment: "full",
    incrementalOutputAssessment: "none",
    releaseInterruption: "local",
    toolInterception: "all",
    messageInterception: "none",
    representationAccess: "opaque",
    declarationSource: "wrapper",
    assurance: "reference_tested",
    wrapperId: "wrapper:closed-loop",
    wrapperVersion: 1,
  };
  const handle = registry.register({
    descriptor,
    wrapperInstanceId: "instance:closed-loop",
  });
  const policy = {
    schemaVersion: 1,
    policyId,
    policyVersion: 1,
    parentPolicyDigest: null,
    mode: "observe",
    outputRisk: "low",
    checkpoints: ["pre_tool"],
    requiredCapabilities: [{ kind: "tool_interception", value: "all" }],
    minimumCapabilityAssurance: "verified",
    allowedCapabilityBindings: [
      {
        schemaVersion: 1,
        capabilityId: descriptor.capabilityId,
        descriptorVersion: 1,
        wrapperId: descriptor.wrapperId,
        wrapperVersion: 1,
        descriptorDigest: handle.descriptorDigest,
        requiredAssurance: "reference_tested",
      },
    ],
    allowedContextZones: ["user_untrusted"],
    allowedTransformerBindings: [],
    allowedActions: [
      {
        schemaVersion: 1,
        namespace: actionBinding.namespace,
        toolId: actionBinding.toolId,
        operation: actionBinding.operation,
        actionBindingId: actionBinding.actionBindingId,
        minimumActionBindingVersion: 1,
      },
    ],
    allowedMessageChannels: [],
    assessmentBindings: [
      {
        schemaVersion: 1,
        checkpoint: "pre_tool",
        assessorId: "assessor:closed-loop",
        assessorVersion: 1,
        assessorBindingDigest: `sha256:${"1".repeat(64)}`,
        maximumResponseBytes: 2048,
        maximumEvidenceReferences: 1,
        timeoutMs: 100,
      },
    ],
    budgets: { revisions: 0, retries: 0, challenges: 0 },
    limits: INFERENCE_CONTROL_LIMITS_V1,
    maximumRunDurationMs: 100,
    maximumAssessmentTtlMs: 100,
    maximumGrantTtlMs: 100,
    maximumMessagePermitTtlMs: 100,
    exhaustedDisposition: "deny",
    coordinatedActionsRequired: true,
    diagnosticsPolicyId: "diagnostics:closed-loop",
    redactionPolicyId: "redaction:closed-loop",
  };
  const policyRecord = createPolicyRecordV1(policy);
  let state = createInferenceControlStateV1({
    stateId: "inference:closed-loop",
    tenantId: "tenant:closed-loop",
  });
  const reduce = (value) => {
    const result = reduceInferenceControlStateV1(
      state,
      {
        schemaVersion: 1,
        expectedStateGeneration: state.stateGeneration,
        ...value,
      },
      value.type === "capability_negotiated"
        ? { capabilityRegistry: registry }
        : undefined,
    );
    assert.equal(result.accepted, true, result.reasonCode);
    state = result.state;
  };
  reduce({
    inputId: "inference:policy",
    type: "policy_registered",
    policy,
    policyDigest: policyRecord.policyDigest,
    logicalTimeMs: 0,
  });
  const run = {
    schemaVersion: 1,
    runId: controlScope.runId,
    tenantId: controlScope.tenantId,
    policyDigest: policyRecord.policyDigest,
    capabilityDescriptorDigest: handle.descriptorDigest,
    capabilityHandleId: null,
    scope: controlScope,
    generation: 1,
    phase: "created",
    createdAtLogicalMs: 0,
    deadlineAtLogicalMs: 100,
    dispositionCounts: { revisions: 0, retries: 0, challenges: 0 },
    contextEntryIds: [],
    assessmentRequestIds: [],
    assessmentIds: [],
    streamIds: [],
    grantIds: [],
    messageAttemptIds: [],
    outputDigest: null,
    releasedBytes: 0,
    terminalReasonCode: null,
  };
  reduce({
    inputId: "inference:run",
    type: "run_created",
    run,
    logicalTimeMs: 0,
  });
  const negotiation = negotiateCapabilitiesV1(descriptor, {
    policyDigest: policyRecord.policyDigest,
    descriptorDigest: handle.descriptorDigest,
    mode: policy.mode,
    checkpoints: policy.checkpoints,
    requiredCapabilities: policy.requiredCapabilities,
    minimumCapabilityAssurance: policy.minimumCapabilityAssurance,
    allowedCapabilityBindings: policy.allowedCapabilityBindings,
  });
  reduce({
    inputId: "inference:capability",
    type: "capability_negotiated",
    runId: run.runId,
    capabilityHandleId: handle.capabilityHandleId,
    descriptorDigest: handle.descriptorDigest,
    result: negotiation,
    logicalTimeMs: 0,
  });
  const targetDigest = hash({ target: "action:closed-loop" });
  const assessmentRequest = {
    schemaVersion: 1,
    assessmentRequestId: "assessment-request:closed-loop",
    requestGeneration: 1,
    runId: run.runId,
    tenantId: run.tenantId,
    policyId: policy.policyId,
    policyVersion: 1,
    checkpoint: "pre_tool",
    assessorId: "assessor:closed-loop",
    assessorVersion: 1,
    targetKind: "action",
    targetDigest,
    contextEntryIds: [],
    zoneDigest: hash({ zone: "closed-loop" }),
    provenanceDigest: hash({ provenance: "closed-loop" }),
    scope: controlScope,
    createdAtLogicalMs: NOW,
    expiresAtLogicalMs,
    status: "pending",
  };
  const assessment = {
    schemaVersion: 1,
    assessmentId: "assessment:closed-loop",
    assessmentRequestId: assessmentRequest.assessmentRequestId,
    requestGeneration: 1,
    runId: run.runId,
    tenantId: run.tenantId,
    policyId: policy.policyId,
    policyVersion: 1,
    checkpoint: "pre_tool",
    assessorId: "assessor:closed-loop",
    assessorVersion: 1,
    targetKind: "action",
    targetDigest,
    zoneDigest: assessmentRequest.zoneDigest,
    provenanceDigest: assessmentRequest.provenanceDigest,
    scope: controlScope,
    disposition: deny ? "deny" : "allow",
    reasonCodes: ["assessment_required"],
    uncertaintyBasisPoints: 0,
    evidenceReferences: [],
    revisedContent: null,
    challenge: null,
    assessedAtLogicalMs: NOW,
    expiresAtLogicalMs,
  };
  const provisional = {
    schemaVersion: 1,
    grantId: "grant:closed-loop",
    runId: run.runId,
    stateGeneration: state.stateGeneration + 2,
    scope: controlScope,
    scopeDigest: scopeDigest(controlScope),
    namespace: actionBinding.namespace,
    toolId: actionBinding.toolId,
    operation: actionBinding.operation,
    actionBindingId: actionBinding.actionBindingId,
    actionBindingVersion: 1,
    handlerDigest: actionBinding.handlerDigest,
    inputDigest: actionInputDigest(actionInput),
    actionDigest: "",
    assessmentRequestId: assessmentRequest.assessmentRequestId,
    assessmentId: assessment.assessmentId,
    assessmentTargetDigest: targetDigest,
    idempotencyKey: "effect:closed-loop",
    issuedAtLogicalMs: NOW,
    expiresAtLogicalMs,
    singleUse: true,
    status: "issued",
    reservation: null,
  };
  return {
    state,
    assessmentRequest,
    assessment,
    actionGrant: {
      ...provisional,
      actionDigest: actionDigest(provisional, actionBinding),
    },
  };
}

function fixture(options = {}) {
  const document = mandate();
  const current = mesh(options.mesh);
  const work = workContract(document, current);
  const accepted = acceptDelegationMandateV1(
    createCollectiveAuthorityStateV1({
      tenantId: document.statement.tenantId,
      policyDomainId: document.statement.policyDomainId,
    }),
    {
      mandate: document,
      verification: {
        schemaVersion: 1,
        verifierId: "verifier:closed-loop",
        verifierVersion: 1,
        issuerId: document.statement.issuerId,
        signedDigest: document.mandateDigest,
        verifiedAt: "2026-08-01T00:00:00.000Z",
        status: "verified",
      },
      acceptedAtLogicalMs: 1,
    },
  );
  assert.equal(accepted.accepted, true);
  const actionBinding = binding();
  const inference = inferenceFixture(current, actionBinding, options.inference);
  const trust = trustFixture(current, options.trust);
  const hiddenCanary = "closed-loop-canary";
  const inputDigest = actionInputDigest(actionInput);
  const definition = {
    schemaVersion: 1,
    environmentId: "environment:closed-loop",
    observations: [],
    hiddenCanary,
    effectRules: [
      {
        schemaVersion: 1,
        effectId: "effect:closed-loop",
        workItemId: current.workItemId,
        workItemRevision: 1,
        workContractId: work.workContractId,
        workContractDigest: work.workContractDigest,
        peerId: current.assignedPeerId,
        peerInstanceId: current.assignedInstanceId,
        assignmentEpoch: current.assignmentEpoch,
        authorityGeneration: current.authorityGeneration,
        fencingToken: current.fencingToken,
        actionClass: "publish-result",
        inputDigest,
        outputDigest: hash({ output: "closed-loop" }),
        behavior: "commit",
        rejectionCode: null,
      },
    ],
  };
  const registrationDigest = hash({ registration: "closed-loop" });
  const intentDigest = hash({ intent: "closed-loop" });
  const monitorPolicy = createCollectiveInvariantMonitorPolicyV1({
    schemaVersion: 1,
    policyId: "monitor:closed-loop",
    registrationDigest,
    requiredEffects: [
      {
        schemaVersion: 1,
        effectId: "effect:closed-loop",
        outcomeUnits: 1,
        objectiveValue: 1,
      },
    ],
    hiddenCanaryDigest: collectiveHiddenCanaryDigestV1(hiddenCanary),
  });
  const registration = createCollectiveEvaluationRegistrationBindingV1({
    schemaVersion: 1,
    registrationId: "registration:closed-loop",
    registrationDigest,
    tenantId: document.statement.tenantId,
    missionIntentId: "mission:closed-loop",
    intentRevision: 1,
    intentDigest,
    runner: "adaptive_collective",
    stratum: "nominal",
    seed: 1,
    environmentDigest: collectiveDeterministicEnvironmentDigestV1(definition),
    observationPolicyDigest: hash({ observation: "closed-loop" }),
    monitorDigest: monitorPolicy.policyDigest,
    hiddenCanaryDigest: collectiveHiddenCanaryDigestV1(hiddenCanary),
    limits: DEFAULT_COLLECTIVE_EVALUATION_LIMITS_V1,
  });
  const harness = createCollectiveDeterministicEnvironmentHarnessV1({
    schemaVersion: 1,
    registration,
    monitorPolicy,
    definition,
  });
  harness.environment.initialize(
    createCollectiveEnvironmentInitializationV1({
      schemaVersion: 1,
      initializationId: "initialization:closed-loop",
      registration,
      initializedAtLogicalMs: 0,
    }),
  );
  assert.equal(
    harness.environment.advance(
      createCollectiveEnvironmentAdvanceRequestV1({
        schemaVersion: 1,
        advanceId: "advance:closed-loop",
        registrationDigest: registration.bindingDigest,
        targetLogicalTimeMs: NOW,
      }),
    ).status,
    "advanced",
  );
  return {
    harness,
    input: {
      mandate: document,
      authorityState: accepted.state,
      workContract: work,
      mesh: current,
      environment: harness.environment,
      effect: {
        registrationDigest: registration.bindingDigest,
        missionIntentId: registration.missionIntentId,
        intentRevision: registration.intentRevision,
        intentDigest: registration.intentDigest,
        actionClass: "publish-result",
      },
      actionBinding,
      actionInput,
      trustState: trust.state,
      trustRequest: trust.request,
      inferenceState: inference.state,
      assessmentRequest: inference.assessmentRequest,
      assessment: inference.assessment,
      actionGrant: inference.actionGrant,
      logicalTimeMs: NOW,
      wallTime: "2026-08-01T00:00:00.020Z",
      gatewayId: "gateway:closed-loop",
      reservationId: "reservation:closed-loop",
      permitId: "permit:closed-loop",
      decisionId: "decision:closed-loop",
    },
  };
}

function commits(harness) {
  return harness
    .finalize()
    .trace.events.filter(
      (event) => event.kind === "environment.effect.committed",
    ).length;
}

test("closed-loop action reaches the fenced environment effect through real governed controls", async () => {
  const data = fixture();
  const result = await runCollectiveClosedLoopActionV1(data.input);
  assert.equal(result.action.dispatched, true);
  assert.equal(result.actionPermit.status, "issued");
  assert.equal(commits(data.harness), 1);
});

for (const [name, mutate] of [
  [
    "restricted Trust",
    (data) => {
      const trust = trustFixture(data.input.mesh, { restricted: true });
      return {
        ...data.input,
        trustState: trust.state,
        trustRequest: trust.request,
      };
    },
  ],
  [
    "unavailable Trust",
    (data) => ({
      ...data.input,
      trustState: createEvidenceTrustStateV1({ stateId: "trust:unavailable" }),
    }),
  ],
  [
    "substituted Trust policy",
    (data) => {
      const trust = trustFixture(data.input.mesh, {
        policyId: "trust-policy:substituted",
      });
      return {
        ...data.input,
        trustState: trust.state,
        trustRequest: trust.request,
      };
    },
  ],
  [
    "substituted inference policy",
    (data) => {
      const inference = inferenceFixture(
        data.input.mesh,
        data.input.actionBinding,
        { policyId: "policy:substituted" },
      );
      return {
        ...data.input,
        inferenceState: inference.state,
        assessmentRequest: inference.assessmentRequest,
        assessment: inference.assessment,
        actionGrant: inference.actionGrant,
      };
    },
  ],
  [
    "denied assessment",
    (data) => ({
      ...data.input,
      assessment: { ...data.input.assessment, disposition: "deny" },
    }),
  ],
  [
    "stale assessment",
    (data) => ({
      ...data.input,
      assessment: { ...data.input.assessment, expiresAtLogicalMs: NOW },
    }),
  ],
  [
    "stale fence",
    (data) => ({
      ...data.input,
      mesh: { ...data.input.mesh, fencingToken: "fence:stale:1" },
    }),
  ],
  [
    "expired lease",
    (data) => ({
      ...data.input,
      mesh: { ...data.input.mesh, leaseExpiresAtLogicalMs: NOW },
    }),
  ],
  [
    "input binding mismatch",
    (data) => ({ ...data.input, actionInput: { documentId: "different" } }),
  ],
])
  test(`closed-loop action fails closed for ${name}`, async () => {
    const data = fixture();
    await assert.rejects(() => runCollectiveClosedLoopActionV1(mutate(data)));
    assert.equal(commits(data.harness), 0);
  });

test("proposal and role records are not action authority inputs", () => {
  const data = fixture();
  assert.equal("proposal" in data.input, false);
  assert.equal("role" in data.input, false);
  assert.equal(Object.hasOwn(data.input.mesh, "proposal"), false);
  assert.equal(Object.hasOwn(data.input.mesh, "role"), false);
});
