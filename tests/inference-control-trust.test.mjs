import assert from "node:assert/strict";
import test from "node:test";

import {
  createAssessmentRequestReferenceV1,
  createClaimCandidateFromAcceptedActionDispatchV1,
  createClaimCandidateFromAcceptedInferenceOutcomeV1,
  createClaimCandidateFromAcceptedOutboundMessageV1,
  createInferenceControlTrustClaimMappingV1,
  digestActionDispatcherBindingV1,
  digestOutboundMessageDispatcherBindingV1,
  digestTrustEligibilityBindingV1,
  runWithTrustEligibilityV1,
  wrapActionDispatcherWithTrustV1,
  wrapOutboundMessageDispatcherWithTrustV1,
} from "../packages/inference-control/dist/trust.js";
import {
  actionDigest,
  scopeDigest,
} from "../packages/inference-control/dist/tools.js";
import { outboundMessageDigest } from "../packages/inference-control/dist/messages.js";

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
