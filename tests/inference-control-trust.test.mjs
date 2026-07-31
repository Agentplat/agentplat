import assert from "node:assert/strict";
import test from "node:test";

import {
  createAssessmentRequestReferenceV1,
  createClaimCandidateFromAcceptedActionDispatchV1,
  createClaimCandidateFromAcceptedInferenceOutcomeV1,
  createClaimCandidateFromAcceptedOutboundMessageV1,
  createInferenceControlTrustClaimMappingV1,
  createInferenceControlTrustStateEligibilityConfigV1,
  digestActionDispatcherBindingV1,
  digestInferenceControlTrustModelBoundaryV1,
  digestInferenceControlTrustRuntimeSourceBindingV1,
  digestInferenceControlTrustStateEligibilityConfigV1,
  digestInferenceControlTrustSubjectMappingV1,
  digestOutboundMessageDispatcherBindingV1,
  digestTrustEligibilityBindingV1,
  evaluateInferenceControlTrustStateEligibilityV1,
  restoreInferenceControlTrustEligibilityRuntimeV1,
  runWithTrustEligibilityV1,
  runWithTrustStateEligibilityV1,
  wrapActionDispatcherWithTrustV1,
  wrapActionDispatcherWithTrustStateV1,
  wrapOutboundMessageDispatcherWithTrustV1,
  wrapOutboundMessageDispatcherWithTrustStateV1,
} from "../packages/inference-control/dist/trust.js";
import {
  actionDigest,
  scopeDigest,
} from "../packages/inference-control/dist/tools.js";
import { outboundMessageDigest } from "../packages/inference-control/dist/messages.js";
import {
  EVIDENCE_TRUST_LIMITS_V1,
  createEvidenceFusionPolicyV1,
  createEvidenceTrustDependencyBindingV1,
  createEvidenceTrustSnapshotV1,
  createEvidenceTrustStateV1,
  deriveApplicableBindingDigests,
  digestEvidenceFusionPolicyV1,
  reduceEvidenceTrustStateV1,
  sha256TrustBytesV1,
} from "../packages/trust/dist/index.js";

const controlDigest = (digit) => `sha256:${digit.repeat(64)}`;
const trustDigest = (digit) => digit.repeat(64);
const scope = Object.freeze({
  schemaVersion: 1,
  kind: "standalone",
  tenantId: "tenant:one",
  runId: "run:one",
  agentId: "agent:one",
  organizationId: null,
  workspaceId: null,
  policyId: "control-policy:one",
  policyVersion: 1,
});
const target = Object.freeze({
  schemaVersion: 1,
  operation: "action",
  tenantId: "tenant:one",
  runId: "run:one",
  scopeDigest: scopeDigest(scope),
  targetDigest: controlDigest("2"),
});

function integration(status, mode = "restrict", onDiagnostic) {
  const policy = {
    policyId: "trust-policy:one",
    policyVersion: 1,
    policyDigest: trustDigest("a"),
    mode,
  };
  const mapping = {
    mappingId: "trust-mapping:one",
    mappingVersion: 1,
    mappingDigest: trustDigest("b"),
  };
  const resolver = {
    resolverId: "trust-resolver:one",
    resolverVersion: 1,
    resolverDigest: trustDigest("c"),
    resolve(requested) {
      return {
        schemaVersion: 1,
        status,
        policyDigest: policy.policyDigest,
        resolverDigest: this.resolverDigest,
        mappingDigest: mapping.mappingDigest,
        scopeDigest: requested.scopeDigest,
        targetDigest: requested.targetDigest,
      };
    },
  };
  return {
    policy,
    mapping,
    resolver,
    ...(onDiagnostic ? { onDiagnostic } : {}),
  };
}

const actionInput = Object.freeze({
  binding: { actionBindingId: "action-binding:one" },
  input: {},
  context: { tenant: { tenantId: "tenant:one" }, runId: "run:one" },
  permit: {
    actionDigest: controlDigest("2"),
    scopeDigest: scopeDigest(scope),
  },
});
const unsignedMessage = Object.freeze({
  schemaVersion: 1,
  messageId: "message:one",
  runId: "run:one",
  tenantId: "tenant:one",
  channel: "channel:one",
  recipient: "peer:two",
  mediaType: "text",
  content: "safe message",
  scope,
  idempotencyKey: "idempotency:message",
});
const message = Object.freeze({
  ...unsignedMessage,
  messageDigest: outboundMessageDigest(unsignedMessage),
});
const messageInput = Object.freeze({
  message,
  permit: {
    messageDigest: message.messageDigest,
    scopeDigest: scopeDigest(scope),
  },
});
const messageTarget = Object.freeze({
  ...target,
  operation: "outbound_message",
  targetDigest: message.messageDigest,
});

function actionDispatcher() {
  return {
    dispatcherId: "action-dispatcher:one",
    dispatcherVersion: 1,
    fencingMode: "local_only",
    calls: 0,
    async dispatch() {
      this.calls += 1;
      return { ok: true, dispatcher: this.dispatcherId };
    },
  };
}

function messageDispatcher(digest = controlDigest("3")) {
  return {
    dispatcherId: "message-dispatcher:one",
    dispatcherVersion: 1,
    dispatcherDigest: digest,
    fencingMode: "local_only",
    calls: 0,
    async send() {
      this.calls += 1;
      return { ok: true, dispatcher: this.dispatcherId };
    },
  };
}

test("Trust integration remains opt-in and direct dispatchers preserve defaults", async () => {
  const dispatcher = actionDispatcher();
  await dispatcher.dispatch(actionInput);
  assert.equal(dispatcher.calls, 1);
});

test("restrict wrappers fail closed for unavailable, stale, mismatch, and quarantine", async () => {
  for (const status of ["unavailable", "stale", "mismatch", "quarantined"]) {
    const actionBase = actionDispatcher();
    const messageBase = messageDispatcher();
    const action = wrapActionDispatcherWithTrustV1(
      actionBase,
      integration(status),
      () => target,
    );
    const message = wrapOutboundMessageDispatcherWithTrustV1(
      messageBase,
      integration(status),
      () => messageTarget,
    );
    await assert.rejects(
      action.dispatch(actionInput),
      /trust_eligibility_restricted/,
    );
    await assert.rejects(
      message.send(messageInput),
      /trust_eligibility_restricted/,
    );
    assert.equal(actionBase.calls, 0, status);
    assert.equal(messageBase.calls, 0, status);
  }
});

test("target mappers cannot substitute Action or Message operation, identity, scope, or context", async () => {
  const actionMismatches = [
    { label: "operation", target: { ...target, operation: "model" } },
    {
      label: "target",
      target: { ...target, targetDigest: controlDigest("d") },
    },
    {
      label: "scope",
      target: { ...target, scopeDigest: controlDigest("e") },
    },
    { label: "tenant", target: { ...target, tenantId: "tenant:other" } },
    { label: "run", target: { ...target, runId: "run:other" } },
  ];
  for (const mismatch of actionMismatches) {
    const base = actionDispatcher();
    const wrapped = wrapActionDispatcherWithTrustV1(
      base,
      integration("eligible", "observe"),
      () => mismatch.target,
    );
    await assert.rejects(
      wrapped.dispatch(actionInput),
      /trust_eligibility_target_mismatch/,
      mismatch.label,
    );
    assert.equal(base.calls, 0, mismatch.label);
  }

  const messageMismatches = [
    {
      label: "operation",
      target: { ...messageTarget, operation: "action" },
    },
    {
      label: "target",
      target: { ...messageTarget, targetDigest: controlDigest("d") },
    },
    {
      label: "scope",
      target: { ...messageTarget, scopeDigest: controlDigest("e") },
    },
    {
      label: "tenant",
      target: { ...messageTarget, tenantId: "tenant:other" },
    },
    { label: "run", target: { ...messageTarget, runId: "run:other" } },
  ];
  for (const mismatch of messageMismatches) {
    const base = messageDispatcher();
    const wrapped = wrapOutboundMessageDispatcherWithTrustV1(
      base,
      integration("eligible", "observe"),
      () => mismatch.target,
    );
    await assert.rejects(
      wrapped.send(messageInput),
      /trust_eligibility_target_mismatch/,
      mismatch.label,
    );
    assert.equal(base.calls, 0, mismatch.label);
  }
});

test("wrappers snapshot mutable bindings and bind base methods to their receiver", async () => {
  const dispatcher = actionDispatcher();
  const configured = integration("eligible");
  const originalPolicyDigest = configured.policy.policyDigest;
  const originalMappingDigest = configured.mapping.mappingDigest;
  configured.resolver.resolve = function (requested) {
    return {
      schemaVersion: 1,
      status: "eligible",
      policyDigest: originalPolicyDigest,
      resolverDigest: this.resolverDigest,
      mappingDigest: originalMappingDigest,
      scopeDigest: requested.scopeDigest,
      targetDigest: requested.targetDigest,
    };
  };
  const wrapped = wrapActionDispatcherWithTrustV1(
    dispatcher,
    configured,
    () => target,
  );
  const originalBinding = wrapped.trustBindingDigest;
  configured.policy.mode = "observe";
  configured.mapping.mappingDigest = trustDigest("d");
  configured.resolver.resolve = () => ({ status: "stale" });
  dispatcher.dispatcherId = "action-dispatcher:mutated";
  dispatcher.dispatch = async () => ({ ok: false });
  assert.equal(wrapped.trustBindingDigest, originalBinding);
  assert.deepEqual(await wrapped.dispatch(actionInput), {
    ok: true,
    dispatcher: "action-dispatcher:mutated",
  });
  assert.equal(dispatcher.calls, 1);
});

test("binding digests commit the real Action and Message dispatcher identities", () => {
  const configured = integration("eligible");
  const actionOne = actionDispatcher();
  const actionTwo = { ...actionDispatcher(), dispatcherVersion: 2 };
  const messageOne = messageDispatcher(controlDigest("3"));
  const messageTwo = messageDispatcher(controlDigest("4"));
  assert.notEqual(
    digestActionDispatcherBindingV1(actionOne),
    digestActionDispatcherBindingV1(actionTwo),
  );
  assert.notEqual(
    digestOutboundMessageDispatcherBindingV1(messageOne),
    digestOutboundMessageDispatcherBindingV1(messageTwo),
  );
  assert.notEqual(
    wrapActionDispatcherWithTrustV1(actionOne, configured, () => target)
      .trustBindingDigest,
    wrapActionDispatcherWithTrustV1(actionTwo, configured, () => target)
      .trustBindingDigest,
  );
  assert.notEqual(
    wrapOutboundMessageDispatcherWithTrustV1(messageOne, configured, () => ({
      ...messageTarget,
    })).trustBindingDigest,
    wrapOutboundMessageDispatcherWithTrustV1(messageTwo, configured, () => ({
      ...messageTarget,
    })).trustBindingDigest,
  );
  assert.equal(
    digestTrustEligibilityBindingV1(configured, trustDigest("e")),
    digestTrustEligibilityBindingV1(configured, trustDigest("e")),
  );
});

test("observe delegates and diagnostics cannot alter observe or fail-closed behavior", async () => {
  const observeBase = actionDispatcher();
  const observed = wrapActionDispatcherWithTrustV1(
    observeBase,
    integration("quarantined", "observe", () => {
      throw new Error("diagnostic sink failure");
    }),
    () => target,
  );
  assert.equal((await observed.dispatch(actionInput)).ok, true);
  assert.equal(observeBase.calls, 1);

  const restrictBase = actionDispatcher();
  const restricted = wrapActionDispatcherWithTrustV1(
    restrictBase,
    integration("stale", "restrict", () => {
      throw new Error("diagnostic sink failure");
    }),
    () => target,
  );
  await assert.rejects(
    restricted.dispatch(actionInput),
    /trust_eligibility_restricted/,
  );
  assert.equal(restrictBase.calls, 0);
});

test("model pre-run helper is opt-in and restrict mode does not start the model", () => {
  let starts = 0;
  assert.throws(
    () =>
      runWithTrustEligibilityV1(
        { ...integration("stale"), modelBindingDigest: trustDigest("f") },
        { ...target, operation: "model" },
        () => {
          starts += 1;
          return "never";
        },
      ),
    /trust_eligibility_restricted/,
  );
  assert.equal(starts, 0);
});

function acceptedAssessment(
  checkpoint = "pre_tool",
  targetKind = "action",
  targetDigest = controlDigest("4"),
) {
  const requestScope = { ...scope };
  const reorderedScope = {
    policyVersion: 1,
    policyId: "control-policy:one",
    workspaceId: null,
    organizationId: null,
    agentId: "agent:one",
    runId: "run:one",
    tenantId: "tenant:one",
    kind: "standalone",
    schemaVersion: 1,
  };
  const request = {
    schemaVersion: 1,
    assessmentRequestId: "assessment-request:one",
    requestGeneration: 1,
    runId: "run:one",
    tenantId: "tenant:one",
    policyId: "control-policy:one",
    policyVersion: 1,
    checkpoint,
    assessorId: "assessor:one",
    assessorVersion: 1,
    targetKind,
    targetDigest,
    contextEntryIds: [],
    zoneDigest: controlDigest("5"),
    provenanceDigest: controlDigest("6"),
    scope: requestScope,
    createdAtLogicalMs: 1,
    expiresAtLogicalMs: 100,
    status: "accepted",
  };
  const assessment = {
    schemaVersion: 1,
    assessmentId: "assessment:one",
    assessmentRequestId: request.assessmentRequestId,
    requestGeneration: request.requestGeneration,
    runId: request.runId,
    tenantId: request.tenantId,
    policyId: request.policyId,
    policyVersion: request.policyVersion,
    checkpoint: request.checkpoint,
    assessorId: request.assessorId,
    assessorVersion: request.assessorVersion,
    targetKind: request.targetKind,
    targetDigest: request.targetDigest,
    zoneDigest: request.zoneDigest,
    provenanceDigest: request.provenanceDigest,
    scope: reorderedScope,
    disposition: "allow",
    reasonCodes: ["assessment_required"],
    uncertaintyBasisPoints: 0,
    evidenceReferences: ["evidence:reference"],
    revisedContent: "secret output must not be copied",
    challenge: null,
    assessedAtLogicalMs: 2,
    expiresAtLogicalMs: 100,
  };
  return { request, assessment };
}

function claimMapping() {
  return createInferenceControlTrustClaimMappingV1({
    schemaVersion: 1,
    mappingId: "trust-mapping:claim",
    mappingVersion: 1,
    sourceId: "source:local",
    subject: { schemaVersion: 1, kind: "peer", peerId: "peer:one" },
    scope: {
      schemaVersion: 1,
      kind: "controlled_run",
      tenantId: "tenant:one",
      runId: "run:one",
      agentId: "agent:one",
      controlPolicyId: "control-policy:one",
      controlPolicyVersion: 1,
      coordinatedScopeDigest: null,
    },
    criterionId: "criterion:accepted-assessment",
    outcome: "satisfied",
  });
}

function claimInput(
  checkpoint = "pre_tool",
  targetKind = "action",
  targetDigest = controlDigest("4"),
) {
  const { request, assessment } = acceptedAssessment(
    checkpoint,
    targetKind,
    targetDigest,
  );
  return {
    schemaVersion: 1,
    assessmentRequest: request,
    assessment,
    assessorBindingDigest: controlDigest("7"),
    dependencyBindingDigest: controlDigest("8"),
    mapping: claimMapping(),
    observedAt: null,
  };
}

test("accepted assessments use exact request references, canonical scope equality, and no content", () => {
  const input = claimInput();
  const reference = createAssessmentRequestReferenceV1(input.assessmentRequest);
  const claim = createClaimCandidateFromAcceptedInferenceOutcomeV1(input);
  assert.equal(reference.referenceType, "assessment_request");
  assert.equal(claim.content, null);
  assert.equal(JSON.stringify(claim).includes("secret output"), false);
  assert.equal(JSON.stringify(claim).includes("grant"), false);
  assert.equal(claim.basisReferences.length, 7);
});

test("terminal Action and Outbound Message outcomes become content-free Claim candidates", () => {
  const actionInput = claimInput();
  const actionBase = actionDispatcher();
  const binding = {
    schemaVersion: 1,
    actionBindingId: "action-binding:one",
    actionBindingVersion: 1,
    namespace: "files",
    toolId: "tool:write",
    operation: "write",
    dispatcherId: actionBase.dispatcherId,
    dispatcherVersion: actionBase.dispatcherVersion,
    contextResolverId: "context-resolver:one",
    contextResolverVersion: 1,
    fencingMode: actionBase.fencingMode,
    handlerDigest: controlDigest("9"),
  };
  const provisionalGrant = {
    schemaVersion: 1,
    grantId: "grant:one",
    stateGeneration: 2,
    scope,
    scopeDigest: scopeDigest(scope),
    namespace: binding.namespace,
    toolId: binding.toolId,
    operation: binding.operation,
    actionBindingId: binding.actionBindingId,
    actionBindingVersion: binding.actionBindingVersion,
    handlerDigest: binding.handlerDigest,
    inputDigest: controlDigest("a"),
    actionDigest: "",
    assessmentRequestId: actionInput.assessmentRequest.assessmentRequestId,
    assessmentId: actionInput.assessment.assessmentId,
    assessmentTargetDigest: actionInput.assessment.targetDigest,
    idempotencyKey: "idempotency:one",
    issuedAtLogicalMs: 1,
    expiresAtLogicalMs: 100,
    singleUse: true,
    status: "dispatched",
    reservation: null,
  };
  const grant = {
    ...provisionalGrant,
    actionDigest: actionDigest(provisionalGrant, binding),
  };
  const actionClaim = createClaimCandidateFromAcceptedActionDispatchV1({
    ...actionInput,
    grant,
    binding,
    dispatcher: actionBase,
  });
  assert.equal(actionClaim.content, null);
  assert.equal(JSON.stringify(actionClaim).includes("tool:write"), false);
  assert.equal(actionClaim.basisReferences.length, 9);

  const messageInput = claimInput(
    "pre_message",
    "outbound_message",
    controlDigest("b"),
  );
  const messageBase = messageDispatcher();
  const messageClaim = createClaimCandidateFromAcceptedOutboundMessageV1({
    ...messageInput,
    attempt: {
      schemaVersion: 1,
      messageAttemptId: "message-attempt:one",
      messageId: "message:one",
      assessmentRequestId: messageInput.assessmentRequest.assessmentRequestId,
      assessmentId: messageInput.assessment.assessmentId,
      messageDigest: controlDigest("b"),
      scopeDigest: scopeDigest(scope),
      idempotencyKey: "idempotency:message",
      generation: 2,
      dispatcherId: messageBase.dispatcherId,
      dispatcherVersion: messageBase.dispatcherVersion,
      dispatcherDigest: messageBase.dispatcherDigest,
      status: "sent",
      reservation: null,
      reservedAtLogicalMs: 1,
      expiresAtLogicalMs: 100,
    },
    dispatcher: messageBase,
  });
  assert.equal(messageClaim.content, null);
  assert.equal(JSON.stringify(messageClaim).includes("message body"), false);
  assert.equal(messageClaim.basisReferences.length, 9);
});

const inferenceStateTrustScope = Object.freeze({
  schemaVersion: 1,
  kind: "controlled_run",
  tenantId: "tenant:one",
  runId: "run:one",
  agentId: "agent:one",
  controlPolicyId: "control-policy:one",
  controlPolicyVersion: 1,
  coordinatedScopeDigest: null,
});
const inferenceStateTrustSubject = Object.freeze({
  schemaVersion: 1,
  kind: "peer",
  peerId: "peer:one",
});

function inferenceStateTrustPolicy(minimumScoreBasisPoints = 4000) {
  return createEvidenceFusionPolicyV1({
    schemaVersion: 1,
    policyId: "inference-state-eligibility-policy",
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
        decayIntervalMs: 100,
        decayBasisPointsPerInterval: 1,
        uncertaintyGrowthBasisPointsPerInterval: 1,
        minimumRetainedWeightBasisPoints: 1,
        contradictionUncertaintyBasisPointsPerClaim: 1,
        maximumContradictionUncertaintyBasisPoints: 1000,
        degradedScoreAtOrBelowBasisPoints: 1000,
        degradedUncertaintyAtOrAboveBasisPoints: 9000,
      },
    ],
    criteria: [
      {
        criterionId: "criterion-a",
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
          allowedBasisReferences: [],
        },
        challengeAuthority: {
          allowedSourceRelations: ["target_author"],
          allowedBasisReferences: [],
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
        sourceId: "peer:one",
        sourceKind: "peer",
        dependencyGroupId: "peer-one-group",
        roles: ["challenge", "claim"],
        maximumWeightBasisPoints: 1000,
        validFromLogicalMs: 0,
        validUntilLogicalMs: 1000,
      },
    ],
    dependencyGroups: [
      {
        dependencyGroupId: "peer-one-group",
        maximumAttestationWeightPerClaimBasisPoints: 1000,
        maximumProfileWeightPerDimensionCriterionBasisPoints: 1000,
      },
    ],
    eligibilityRules: [
      {
        ruleId: "inference-operation",
        maximumProfileAgeMs: 100,
        requirements: [
          {
            dimensionId: "integrity",
            minimumScoreBasisPoints,
            maximumUncertaintyBasisPoints: 10000,
          },
        ],
      },
    ],
    quarantinePolicy: { enabled: false, rules: [], maximumActiveRecords: 1 },
    recoveryPolicy: { rules: [] },
    limits: EVIDENCE_TRUST_LIMITS_V1,
    diagnosticsPolicyId: "diagnostics",
    redactionPolicyId: "redaction",
  });
}

const inferenceStateTrustRuntimeSourceIdentity = Object.freeze({
  sourceId: "inference-state-runtime-source",
  sourceVersion: 1,
  protectorBindingDigest: trustDigest("9"),
});
const inferenceStateTrustRuntimeSourceBindingDigest =
  digestInferenceControlTrustRuntimeSourceBindingV1(
    inferenceStateTrustRuntimeSourceIdentity,
  );

function modelBoundary(run = (targetValue) => targetValue) {
  return {
    modelBoundaryId: "model-boundary:one",
    modelBoundaryVersion: 1,
    implementationDigest: trustDigest("8"),
    run,
  };
}

let inferenceStateTrustFixtureSequence = 0;
function inferenceStateTrustFixture({
  operation = "model",
  mode = "restrict",
  minimumScoreBasisPoints = 4000,
} = {}) {
  const policy = inferenceStateTrustPolicy(minimumScoreBasisPoints);
  const policyDigest = digestEvidenceFusionPolicyV1(policy);
  const rule = policy.eligibilityRules[0];
  const baseBindingDigest =
    operation === "action"
      ? digestActionDispatcherBindingV1(actionDispatcher())
      : operation === "outbound_message"
        ? digestOutboundMessageDispatcherBindingV1(messageDispatcher())
        : digestInferenceControlTrustModelBoundaryV1(modelBoundary());
  const mapping = {
    controlTenantId: "tenant:one",
    controlRunId: "run:one",
    controlScopeDigest: scopeDigest(scope),
    trustSubject: inferenceStateTrustSubject,
    trustScope: inferenceStateTrustScope,
  };
  const subjectMappingDigest =
    digestInferenceControlTrustSubjectMappingV1(mapping);
  const placeholderConfig = {
    schemaVersion: 1,
    operation,
    mode,
    ...mapping,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    policyDigest,
    maximumProfileAgeMs: rule.maximumProfileAgeMs,
    requirements: rule.requirements,
    subjectMappingDigest,
    runtimeSourceBindingDigest: inferenceStateTrustRuntimeSourceBindingDigest,
    profileResolverBindingDigest: trustDigest("a"),
    boundaryBindingDigest: trustDigest("b"),
    baseBindingDigest,
  };
  const configurationDigest =
    digestInferenceControlTrustStateEligibilityConfigV1(placeholderConfig);
  const profileResolver = createEvidenceTrustDependencyBindingV1({
    schemaVersion: 1,
    bindingName: "inference-profile-resolver",
    bindingVersion: 1,
    parentBindingDigest: null,
    bindingKind: "profile_resolver",
    implementationId: "inference-profile-resolver-v1",
    implementationDigest: trustDigest("c"),
    configurationDigest: trustDigest("d"),
    policyDigest,
    subjectMappingDigest,
    upstreamBindingDigest: null,
    registeredAtLogicalMs: 0,
    validFromLogicalMs: 0,
    validUntilLogicalMs: null,
  });
  const boundary = createEvidenceTrustDependencyBindingV1({
    schemaVersion: 1,
    bindingName: `inference-${operation}-boundary`,
    bindingVersion: 1,
    parentBindingDigest: null,
    bindingKind:
      operation === "model"
        ? "model_boundary"
        : operation === "action"
          ? "action_dispatcher"
          : "message_dispatcher",
    implementationId: `inference-${operation}-boundary-v1`,
    implementationDigest: baseBindingDigest,
    configurationDigest,
    policyDigest,
    subjectMappingDigest,
    upstreamBindingDigest: profileResolver.bindingDigest,
    registeredAtLogicalMs: 0,
    validFromLogicalMs: 0,
    validUntilLogicalMs: null,
  });
  const config = createInferenceControlTrustStateEligibilityConfigV1({
    ...placeholderConfig,
    profileResolverBindingDigest: profileResolver.bindingDigest,
    boundaryBindingDigest: boundary.bindingDigest,
  });
  let state = reduceEvidenceTrustStateV1(
    createEvidenceTrustStateV1({
      stateId: `inference-state-eligibility-${operation}-${mode}-${(inferenceStateTrustFixtureSequence += 1)}`,
    }),
    { schemaVersion: 1, kind: "policy_registered", policy, logicalTimeMs: 0 },
  ).state;
  for (const binding of [profileResolver, boundary]) {
    state = reduceEvidenceTrustStateV1(state, {
      schemaVersion: 1,
      kind: "dependency_binding_registered",
      binding,
      logicalTimeMs: 0,
    }).state;
  }
  const request = {
    tenantId: "tenant:one",
    subject: inferenceStateTrustSubject,
    scope: inferenceStateTrustScope,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    policyDigest,
    dependencyBindingDigests: deriveApplicableBindingDigests(
      state,
      policyDigest,
      0,
    ),
  };
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "fusion_evaluated",
    request,
    logicalTimeMs: 0,
  }).state;
  const decision = state.fusionDecisions[0];
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "profile_evaluated",
    fusionDecisionId: decision.fusionDecisionId,
    fusionDecisionDigest: decision.fusionDecisionDigest,
    logicalTimeMs: 0,
  }).state;
  const targetForOperation =
    operation === "action"
      ? target
      : operation === "outbound_message"
        ? messageTarget
        : Object.freeze({
            ...target,
            operation: "model",
            targetDigest: controlDigest("7"),
          });
  return {
    state,
    config,
    policy,
    profileResolver,
    boundary,
    target: targetForOperation,
  };
}

const inferenceStateTrustProtector = {
  bindingDigest: trustDigest("9"),
  protect(materialBytes) {
    return {
      algorithmId: "test-sha256",
      keyId: "inference-state-eligibility-test-key",
      encoding: "base64url",
      proof: sha256TrustBytesV1(materialBytes),
    };
  },
  verify(materialBytes, proof) {
    return proof.proof === sha256TrustBytesV1(materialBytes);
  },
};

const inferenceStateTrustAnchors = new WeakMap();

function verifiedInferenceStateTrustRuntime(
  state,
  { generation = 1, previousSnapshotDigest = null } = {},
) {
  const snapshot = createEvidenceTrustSnapshotV1({
    state,
    generation,
    previousSnapshotDigest,
    createdAtLogicalMs: state.logicalTimeHighWaterMs,
    protector: inferenceStateTrustProtector,
  });
  const anchor = {
    schemaVersion: 1,
    stateId: snapshot.stateId,
    requiredGeneration: snapshot.generation,
    requiredSnapshotDigest: snapshot.snapshotDigest,
    minimumLogicalHighWaterMs: state.logicalTimeHighWaterMs,
    protectorBindingDigest: inferenceStateTrustProtector.bindingDigest,
  };
  const runtime = restoreInferenceControlTrustEligibilityRuntimeV1(
    snapshot,
    anchor,
    inferenceStateTrustProtector,
    inferenceStateTrustRuntimeSourceBindingDigest,
  );
  inferenceStateTrustAnchors.set(runtime, anchor);
  return { snapshot, anchor, runtime };
}

function inferenceStateTrustIntegration(
  config,
  runtime,
  onDiagnostic,
  {
    rollbackAnchor = inferenceStateTrustAnchors.get(runtime),
    sourceIdentity = inferenceStateTrustRuntimeSourceIdentity,
    onCurrent,
  } = {},
) {
  const bindingDigest =
    digestInferenceControlTrustRuntimeSourceBindingV1(sourceIdentity);
  return {
    config,
    runtime: {
      ...sourceIdentity,
      bindingDigest,
      current: () => {
        onCurrent?.();
        return { schemaVersion: 1, runtime, rollbackAnchor };
      },
    },
    ...(onDiagnostic ? { onDiagnostic } : {}),
  };
}

test("state-backed Inference Trust delegates model, Action, and Message only for eligible profiles", async () => {
  const model = inferenceStateTrustFixture({ operation: "model" });
  const modelRuntime = verifiedInferenceStateTrustRuntime(model.state).runtime;
  let currentSamples = 0;
  const modelIntegration = inferenceStateTrustIntegration(
    model.config,
    modelRuntime,
    undefined,
    { onCurrent: () => (currentSamples += 1) },
  );
  const modelResult = evaluateInferenceControlTrustStateEligibilityV1(
    modelIntegration,
    model.target,
  );
  assert.equal(modelResult.status, "eligible");
  let modelCalls = 0;
  let capturedModelTarget;
  assert.equal(
    runWithTrustStateEligibilityV1(
      modelIntegration,
      model.target,
      modelBoundary((targetValue) => {
        capturedModelTarget = targetValue;
        return (modelCalls += 1);
      }),
    ),
    1,
  );
  assert.equal(modelCalls, 1);
  assert.equal(currentSamples, 2);
  assert.deepEqual(capturedModelTarget, model.target);
  assert.equal(Object.isFrozen(capturedModelTarget), true);

  const action = inferenceStateTrustFixture({ operation: "action" });
  const actionBase = actionDispatcher();
  const wrappedAction = wrapActionDispatcherWithTrustStateV1(
    actionBase,
    inferenceStateTrustIntegration(
      action.config,
      verifiedInferenceStateTrustRuntime(action.state).runtime,
    ),
  );
  await wrappedAction.dispatch(actionInput);
  assert.equal(actionBase.calls, 1);

  const messageState = inferenceStateTrustFixture({
    operation: "outbound_message",
  });
  const messageBase = messageDispatcher();
  const wrappedMessage = wrapOutboundMessageDispatcherWithTrustStateV1(
    messageBase,
    inferenceStateTrustIntegration(
      messageState.config,
      verifiedInferenceStateTrustRuntime(messageState.state).runtime,
    ),
  );
  await wrappedMessage.send(messageInput);
  assert.equal(messageBase.calls, 1);
});

test("state-backed Inference Trust restricts model, Action, and Message for restricted profiles", async () => {
  const model = inferenceStateTrustFixture({
    operation: "model",
    minimumScoreBasisPoints: 6000,
  });
  const modelRuntime = verifiedInferenceStateTrustRuntime(model.state).runtime;
  assert.equal(
    evaluateInferenceControlTrustStateEligibilityV1(
      inferenceStateTrustIntegration(model.config, modelRuntime),
      model.target,
    ).status,
    "restricted",
  );
  assert.throws(
    () =>
      runWithTrustStateEligibilityV1(
        inferenceStateTrustIntegration(model.config, modelRuntime),
        model.target,
        modelBoundary(() => "must not run"),
      ),
    /trust_eligibility_restricted/,
  );

  for (const operation of ["action", "outbound_message"]) {
    const fixture = inferenceStateTrustFixture({
      operation,
      minimumScoreBasisPoints: 6000,
    });
    const runtime = verifiedInferenceStateTrustRuntime(fixture.state).runtime;
    if (operation === "action") {
      const base = actionDispatcher();
      const wrapped = wrapActionDispatcherWithTrustStateV1(
        base,
        inferenceStateTrustIntegration(fixture.config, runtime),
      );
      await assert.rejects(
        wrapped.dispatch(actionInput),
        /trust_eligibility_restricted/,
      );
      assert.equal(base.calls, 0);
    } else {
      const base = messageDispatcher();
      const wrapped = wrapOutboundMessageDispatcherWithTrustStateV1(
        base,
        inferenceStateTrustIntegration(fixture.config, runtime),
      );
      await assert.rejects(
        wrapped.send(messageInput),
        /trust_eligibility_restricted/,
      );
      assert.equal(base.calls, 0);
    }
  }
});

test("state-backed observe mode preserves delegation for unavailable opaque-runtime failures", async () => {
  const fixture = inferenceStateTrustFixture({
    operation: "action",
    mode: "observe",
  });
  const verified = verifiedInferenceStateTrustRuntime(fixture.state).runtime;
  const diagnostics = [];
  const unavailable = inferenceStateTrustIntegration(
    fixture.config,
    structuredClone(verified),
    (diagnostic) => diagnostics.push(diagnostic),
  );
  assert.equal(
    evaluateInferenceControlTrustStateEligibilityV1(unavailable, fixture.target)
      .status,
    "unavailable",
  );
  const base = actionDispatcher();
  const wrapped = wrapActionDispatcherWithTrustStateV1(base, unavailable);
  await wrapped.dispatch(actionInput);
  assert.equal(base.calls, 1);
  assert.equal(diagnostics.at(-1).status, "unavailable");
});

test("state-backed Inference Trust rejects raw clones, anchor/source substitutions, stale snapshots, superseded generations, and unauthenticated time", () => {
  const fixture = inferenceStateTrustFixture({ operation: "model" });
  const initial = verifiedInferenceStateTrustRuntime(fixture.state);
  const cloneIntegration = inferenceStateTrustIntegration(
    fixture.config,
    structuredClone(initial.runtime),
    undefined,
    { rollbackAnchor: initial.anchor },
  );
  assert.equal(
    evaluateInferenceControlTrustStateEligibilityV1(
      cloneIntegration,
      fixture.target,
    ).status,
    "unavailable",
  );
  assert.throws(
    () =>
      runWithTrustStateEligibilityV1(
        cloneIntegration,
        fixture.target,
        modelBoundary(() => "no"),
      ),
    /trust_eligibility_restricted/,
  );
  assert.equal(
    evaluateInferenceControlTrustStateEligibilityV1(
      inferenceStateTrustIntegration(
        fixture.config,
        initial.runtime,
        undefined,
        {
          rollbackAnchor: {
            ...initial.anchor,
            requiredSnapshotDigest: trustDigest("e"),
          },
        },
      ),
      fixture.target,
    ).status,
    "unavailable",
  );
  assert.throws(
    () =>
      evaluateInferenceControlTrustStateEligibilityV1(
        inferenceStateTrustIntegration(
          fixture.config,
          initial.runtime,
          undefined,
          {
            sourceIdentity: {
              ...inferenceStateTrustRuntimeSourceIdentity,
              sourceId: "substituted-runtime-source",
            },
          },
        ),
        fixture.target,
      ),
    /trust_state_integration_invalid/,
  );

  const advancedState = reduceEvidenceTrustStateV1(fixture.state, {
    schemaVersion: 1,
    kind: "advance_logical_time",
    logicalTimeMs: 101,
  }).state;
  const advanced = verifiedInferenceStateTrustRuntime(advancedState, {
    generation: 2,
    previousSnapshotDigest: initial.snapshot.snapshotDigest,
  });
  assert.equal(
    evaluateInferenceControlTrustStateEligibilityV1(
      inferenceStateTrustIntegration(fixture.config, initial.runtime),
      fixture.target,
    ).status,
    "unavailable",
  );
  assert.equal(
    evaluateInferenceControlTrustStateEligibilityV1(
      inferenceStateTrustIntegration(fixture.config, advanced.runtime),
      fixture.target,
    ).status,
    "unavailable",
  );
});

test("state-backed Inference Trust binds config, boundary chain, base identity, and configured control target identity", () => {
  const fixture = inferenceStateTrustFixture({ operation: "model" });
  const runtime = verifiedInferenceStateTrustRuntime(fixture.state).runtime;
  const integration = inferenceStateTrustIntegration(fixture.config, runtime);
  for (const targetSubstitution of [
    { ...fixture.target, operation: "action" },
    { ...fixture.target, tenantId: "tenant:other" },
    { ...fixture.target, runId: "run:other" },
    { ...fixture.target, scopeDigest: controlDigest("e") },
  ]) {
    assert.throws(
      () =>
        runWithTrustStateEligibilityV1(
          integration,
          targetSubstitution,
          modelBoundary(() => "must not run"),
        ),
      /trust_eligibility_target_mismatch/,
    );
  }
  assert.equal(
    evaluateInferenceControlTrustStateEligibilityV1(integration, {
      ...fixture.target,
      targetDigest: controlDigest("d"),
    }).status,
    "eligible",
  );
  assert.throws(
    () =>
      evaluateInferenceControlTrustStateEligibilityV1(integration, {
        ...fixture.target,
        targetDigest: "not-a-control-digest",
      }),
    /targetDigest_invalid/,
  );
  assert.throws(
    () =>
      runWithTrustStateEligibilityV1(integration, fixture.target, {
        ...modelBoundary(),
        implementationDigest: trustDigest("f"),
      }),
    /trust_state_binding_mismatch/,
  );
  for (const config of [
    { ...fixture.config, baseBindingDigest: trustDigest("f") },
    { ...fixture.config, boundaryBindingDigest: trustDigest("e") },
  ]) {
    assert.equal(
      evaluateInferenceControlTrustStateEligibilityV1(
        inferenceStateTrustIntegration(config, runtime),
        fixture.target,
      ).status,
      "unavailable",
    );
  }
});
