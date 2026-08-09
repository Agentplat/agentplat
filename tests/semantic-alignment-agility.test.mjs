import assert from "node:assert/strict";
import test from "node:test";

import {
  SemanticAlignmentAgilityRuntimeV1,
  InMemorySemanticActionAuthorizationAuthorityV1,
  bindHeterogeneousInterventionPortableControlV1,
  composeHeterogeneousPortableAgentV1,
  createHeterogeneousAgentRouteV1,
  portableAdapterBindingDigestV1,
  portableActionPayloadV1,
  createSemanticActionEffectReceiptV1,
  createSemanticAssessorAssessmentV1,
  createSemanticAssessorDescriptorV1,
  createSemanticControlBindingV1,
  createSemanticControlPolicyV1,
  createSemanticControlRequestV1,
  createSemanticDigestExplorationHeuristicV1,
  digestSemanticControlV1,
  digestSemanticOperationPayloadV1,
} from "../packages/inference-control/dist/semantic-alignment.js";
import {
  HeterogeneousInferenceInterventionRuntimeV1,
  createBoundedSignalAssessorV1,
  createInferenceInterventionAdapterDescriptorV1,
  createInferenceInterventionBindingV1,
  createInferenceInterventionPolicyV1,
  createInferenceInterventionReferenceAdapterV1,
} from "../packages/inference-control/dist/intervention.js";

const digest = (value) => digestSemanticControlV1("request", value);

function binding() {
  return createSemanticControlBindingV1({
    schemaVersion: 1,
    bindingId: "semantic-binding",
    missionId: "objective-1",
    roleId: "role-1",
    agentId: "agent-1",
    sessionId: "session-1",
    missionAnchorDigest: digest({ mission: 1 }),
    roleAnchorDigest: digest({ role: 1 }),
    authorityDigest: digest({ authority: 1 }),
  });
}

function policy(overrides = {}) {
  return createSemanticControlPolicyV1({
    schemaVersion: 1,
    policyId: "semantic-policy",
    policyVersion: 1,
    thresholds: {
      minimumRoleCoherenceBps: 8_000,
      minimumMissionAlignmentBps: 8_000,
      maximumContextConflictBps: 4_000,
      maximumUncertaintyBps: 4_000,
      minimumCourseActionDiversityBps: 6_000,
      minimumCourseActionNoveltyBps: 5_000,
    },
    minimumIndependenceGroups: 2,
    minimumGroupsPerDimension: 2,
    enforcingAssessorIds: ["semantic-a"],
    limits: {
      maximumAssessors: 8,
      maximumReasonCodes: 16,
      maximumEvidenceDigests: 16,
      maximumCourseActionCandidates: 16,
      maximumCourseActionHistory: 8,
      maximumRetainedDecisions: 8,
      maximumCommitAttempts: 3,
      maximumSequence: 1_000_000,
      maximumLogicalTimeMs: 10_000,
      maximumActionPayloadBytes: 65_536,
      actionAuthorizationTtlMs: 1_000,
      assessorTimeoutMs: 50,
    },
    ...overrides,
  });
}

function actionAuthorizationBoundary(label = "default") {
  return {
    ...actionEffectIdentity(label),
    authority: new InMemorySemanticActionAuthorizationAuthorityV1(
      `semantic-auth-${label}`,
      digest({ issuerKey: label }),
    ),
  };
}

function actionEffectIdentity(label) {
  return {
    effectConsumerDigest: digest({ effectConsumer: label }),
    sinkId: `semantic-effect-sink-${label}`,
    sinkKeyDigest: digest({ sinkKey: label }),
  };
}

function actionEffectSink(label = "default", effectCounter = { count: 0 }) {
  const receipts = new Map();
  const { effectConsumerDigest, sinkId, sinkKeyDigest } =
    actionEffectIdentity(label);
  return {
    sinkId,
    sinkKeyDigest,
    effectConsumerDigest,
    async applyOnce({ authorization, targetDigest, actionPayloadDigest }) {
      assert.equal(targetDigest, authorization.claims.targetDigest);
      assert.equal(actionPayloadDigest, authorization.claims.actionPayloadDigest);
      const prior = receipts.get(authorization.authorizationDigest);
      if (prior) return prior;
      effectCounter.count += 1;
      const receipt = createSemanticActionEffectReceiptV1({
        schemaVersion: 1,
        authorizationDigest: authorization.authorizationDigest,
        effectConsumerDigest,
        sinkId,
        sinkKeyDigest,
        outcomeDigest: digest({
          authorizationDigest: authorization.authorizationDigest,
          targetDigest,
          actionPayloadDigest,
        }),
        committedAtLogicalTimeMs: authorization.claims.validFromLogicalTimeMs,
      });
      receipts.set(authorization.authorizationDigest, receipt);
      return receipt;
    },
    async verifyReceipt(receipt) {
      return receipts.get(receipt.authorizationDigest)?.receiptDigest ===
        receipt.receiptDigest;
    },
  };
}

function semanticAssessor(id, group, values = {}) {
  const descriptor = createSemanticAssessorDescriptorV1({
    schemaVersion: 1,
    assessorId: id,
    assessorVersion: 1,
    assessorImplementationDigest: digest({ id }),
    independenceGroup: group,
    basis: "application_semantic_model",
    supportedDimensions: [
      "context_conflict",
      "mission_alignment",
      "role_coherence",
      "uncertainty",
    ],
  });
  return {
    descriptor,
    assess(request) {
      const resolved = typeof values === "function" ? values(request) : values;
      return createSemanticAssessorAssessmentV1({
        schemaVersion: 1,
        requestDigest: request.requestDigest,
        assessorId: descriptor.assessorId,
        assessorVersion: descriptor.assessorVersion,
        assessorImplementationDigest: descriptor.assessorImplementationDigest,
        independenceGroup: descriptor.independenceGroup,
        metrics: {
          roleCoherenceBps: resolved.role ?? 9_000,
          missionAlignmentBps: resolved.mission ?? 9_000,
          contextConflictBps: resolved.conflict ?? 500,
          uncertaintyBps: resolved.uncertainty ?? 500,
          courseActionDiversityBps: null,
          courseActionNoveltyBps: null,
        },
        hardConstraintViolations: resolved.violations ?? [],
        recommendation: resolved.recommendation ?? "allow",
        reasonCodes: [],
        evidenceDigests: [],
      });
    },
  };
}

function runtime(overrides = {}) {
  return new SemanticAlignmentAgilityRuntimeV1({
    binding: binding(),
    policy: policy(),
    assessors: [
      semanticAssessor("semantic-a", "application"),
      semanticAssessor("semantic-b", "provider"),
      createSemanticDigestExplorationHeuristicV1({
        assessorId: "exploration",
        assessorVersion: 1,
        assessorImplementationDigest: digest({ exploration: 1 }),
        independenceGroup: "digest-signal",
      }),
      createSemanticDigestExplorationHeuristicV1({
        assessorId: "exploration-independent",
        assessorVersion: 1,
        assessorImplementationDigest: digest({ exploration: 2 }),
        independenceGroup: "digest-signal-independent",
      }),
    ],
    actionAuthorization: actionAuthorizationBoundary(),
    ...overrides,
  });
}

function request(bind, overrides = {}) {
  const checkpoint = overrides.checkpoint ?? "pre_step";
  return createSemanticControlRequestV1({
    schemaVersion: 1,
    requestId: `request-${overrides.sequence ?? 1}`,
    checkpoint,
    bindingDigest: bind.bindingDigest,
    missionAnchorDigest: bind.missionAnchorDigest,
    roleAnchorDigest: bind.roleAnchorDigest,
    authorityDigest: bind.authorityDigest,
    sequence: 1,
    step: 1,
    logicalTimeMs: 10,
    targetDigest: digest({ target: 1 }),
    contextDigest: digest({ context: 1 }),
    selectedCourseActionDigest: digest({ course: "same" }),
    candidateCourseActionDigests: [digest({ course: "same" }), digest({ course: "same" })],
    priorCourseActionDigests: [],
    modalities: ["text"],
    materialDigest: digest({ material: 1 }),
    actionPayloadDigest: checkpoint === "pre_action"
      ? digestSemanticOperationPayloadV1("test action payload")
      : null,
    materialHandle: "application://semantic-material/1",
    ...overrides,
  });
}

test("hard role or mission constraints stop local action dispatch", async () => {
  const bind = binding();
  const controlled = new SemanticAlignmentAgilityRuntimeV1({
    binding: bind,
    policy: policy(),
    assessors: [
      semanticAssessor("semantic-a", "application", {
        violations: ["mission_constraint"],
      }),
      semanticAssessor("semantic-b", "provider"),
    ],
  });
  const effectCounter = { count: 0 };
  const result = await controlled.dispatchAction(
    {
      request: request(bind, {
        checkpoint: "pre_action",
        candidateCourseActionDigests: [],
        priorCourseActionDigests: [],
      }),
      interventionPayload: "test action payload",
    },
    10,
    actionEffectSink("default", effectCounter),
  );
  assert.equal(result.decision.disposition, "block");
  assert.equal(result.effectReceipt, null);
  assert.equal(effectCounter.count, 0);
  assert.deepEqual(result.decision.aggregate.hardConstraintViolations, [
    "mission_constraint",
  ]);
});

test("digest heuristic only signals exploration and steering preserves pre-step agility", async () => {
  const controlled = runtime();
  const bind = binding();
  const selected = digest({ course: "same" });
  await controlled.preStep({
    request: request(bind, {
      candidateCourseActionDigests: [selected, digest({ course: "other" })],
    }),
  });
  let ran = false;
  const result = await controlled.runStep({
    request: request(bind, {
      requestId: "request-2",
      sequence: 2,
      step: 2,
      logicalTimeMs: 11,
      priorCourseActionDigests: [selected],
    }),
  }, () => {
    ran = true;
    return "continued";
  });
  assert.equal(result.decision.disposition, "steer");
  assert.equal(result.decision.proceed, true);
  assert.equal(result.value, "continued");
  assert.equal(ran, true);
  assert.equal(result.decision.aggregate.metrics.courseActionDiversityBps, 5_000);
  assert.equal(result.decision.aggregate.metrics.courseActionNoveltyBps, 0);
  assert.equal(result.decision.aggregate.metrics.roleCoherenceBps, 9_000);
  assert.throws(
    () =>
      createSemanticAssessorDescriptorV1({
        schemaVersion: 1,
        assessorId: "dishonest-lexical-baseline",
        assessorVersion: 1,
        assessorImplementationDigest: digest({ heuristic: 2 }),
        independenceGroup: "lexical",
        basis: "reference_digest_heuristic",
        supportedDimensions: ["mission_alignment"],
      }),
    /cannot_claim_semantic_dimensions/,
  );
});

test("exploration claims fail closed when corresponding metrics lack independent coverage", async () => {
  const bind = binding();
  const controlled = new SemanticAlignmentAgilityRuntimeV1({
    binding: bind,
    policy: policy(),
    assessors: [
      semanticAssessor("semantic-a", "application"),
      semanticAssessor("semantic-b", "provider"),
    ],
  });
  const decision = await controlled.preStep({ request: request(bind) });
  assert.equal(decision.disposition, "abstain");
  assert.ok(decision.reasonCodes.includes("course_action_diversity_coverage_incomplete"));
  assert.ok(decision.reasonCodes.includes("course_action_novelty_coverage_incomplete"));
});

test("volatile material handles stay private while the exact material digest is replay-bound", async () => {
  const bind = binding();
  const first = request(bind, { materialHandle: "provider://first/private-material" });
  const second = request(bind, { materialHandle: "application://second/private-material" });
  assert.equal(first.requestDigest, second.requestDigest);
  const changed = request(bind, {
    materialHandle: "application://second/private-material",
    materialDigest: digest({ material: 2 }),
  });
  assert.notEqual(first.requestDigest, changed.requestDigest);
  const controlled = runtime();
  await controlled.preStep({ request: first });
  const serialized = JSON.stringify(await controlled.getState());
  assert.equal(serialized.includes("private-material"), false);
  assert.equal(serialized.includes("materialHandle"), false);
});

test("malformed pre-action intervention evidence fails closed and stays content-free", async () => {
  const bind = binding();
  const assessmentDigest = digest({ interventionAssessment: 1 });
  const controlled = runtime({
    binding: bind,
    intervention: {
      bindingDigest: digest({ interventionBinding: 1 }),
      policyDigest: digest({ interventionPolicy: 1 }),
      async verifyOperationGate() {
        return false;
      },
      async gateOperation() {
        return {
          allowed: false,
          assessments: [{ assessmentDigest }],
          state: {},
        };
      },
    },
  });
  const effectCounter = { count: 0 };
  const result = await controlled.dispatchAction(
    {
      request: request(bind, {
        checkpoint: "pre_action",
        actionPayloadDigest: digestSemanticOperationPayloadV1("volatile action payload"),
        candidateCourseActionDigests: [],
        priorCourseActionDigests: [],
      }),
      interventionPayload: "volatile action payload",
    },
    10,
    actionEffectSink("default", effectCounter),
  );
  assert.equal(result.decision.disposition, "block");
  assert.equal(effectCounter.count, 0);
  assert.deepEqual(result.decision.interventionAssessmentDigests, []);
  assert.ok(result.decision.reasonCodes.includes("inference_intervention_gate_unavailable"));
  assert.equal(JSON.stringify(result.decision).includes("volatile action payload"), false);
});

test("pre-action replay cannot substitute a different payload and the sink receives the exact authorization fence", async () => {
  const bind = binding();
  const controlled = runtime({ binding: bind });
  const payload = "authorized action payload";
  const actionRequest = request(bind, {
    checkpoint: "pre_action",
    selectedCourseActionDigest: null,
    candidateCourseActionDigests: [],
    actionPayloadDigest: digestSemanticOperationPayloadV1(payload),
  });
  const sink = actionEffectSink();
  const result = await controlled.dispatchAction(
    { request: actionRequest, interventionPayload: payload },
    11,
    sink,
  );
  const authorization = result.authorization;
  assert.ok(authorization);
  assert.equal(
    authorization.claims.actionPayloadDigest,
    actionRequest.actionPayloadDigest,
  );
  assert.equal(authorization.claims.sinkId, sink.sinkId);
  assert.equal(authorization.claims.sinkKeyDigest, sink.sinkKeyDigest);
  assert.equal(
    result.effectReceipt.authorizationDigest,
    authorization.authorizationDigest,
  );
  await assert.rejects(
    controlled.verifyActionAuthorization({
      authorizationId: actionRequest.requestId,
      authorizationDigest: authorization.authorizationDigest,
      expectedTargetDigest: digest({ substitutedTarget: 1 }),
      expectedActionPayloadDigest: actionRequest.actionPayloadDigest,
      currentLogicalTimeMs: actionRequest.logicalTimeMs,
    }),
    /currentness_invalid/,
  );
  await assert.rejects(
    controlled.verifyActionAuthorization({
      authorizationId: "fabricated-authorization",
      expectedTargetDigest: actionRequest.targetDigest,
      expectedActionPayloadDigest: actionRequest.actionPayloadDigest,
      currentLogicalTimeMs: actionRequest.logicalTimeMs,
    }),
    /unverified/,
  );
  await assert.rejects(
    controlled.verifyActionAuthorization({
      authorizationId: actionRequest.requestId,
      authorizationDigest: authorization.authorizationDigest,
      expectedTargetDigest: actionRequest.targetDigest,
      expectedActionPayloadDigest: actionRequest.actionPayloadDigest,
      currentLogicalTimeMs: 1_011,
    }),
    /unverified/,
  );
  await assert.rejects(
    controlled.dispatchAction(
      { request: actionRequest, interventionPayload: "substituted payload" },
      11,
      sink,
    ),
    /semantic_action_payload_digest_mismatch/,
  );
});

test("pre-action payload bytes are bounded before hashing or assessor work", async () => {
  const bind = binding();
  const controlled = runtime({
    binding: bind,
    policy: policy({
      limits: {
        ...policy().limits,
        maximumActionPayloadBytes: 8,
      },
    }),
  });
  const payload = "payload-too-large";
  await assert.rejects(
    controlled.preAction({
      request: request(bind, {
        checkpoint: "pre_action",
        selectedCourseActionDigest: null,
        candidateCourseActionDigests: [],
        actionPayloadDigest: digestSemanticOperationPayloadV1(payload),
      }),
      interventionPayload: payload,
    }),
    /semantic_action_payload_too_large/,
  );
});

test("independent ensemble ratification cannot weaken a local semantic block", async () => {
  let ensembleCalls = 0;
  const bind = binding();
  const controlled = new SemanticAlignmentAgilityRuntimeV1({
    binding: bind,
    policy: policy(),
    assessors: [
      semanticAssessor("semantic-a", "application", { role: 2_000 }),
      semanticAssessor("semantic-b", "provider"),
    ],
    ensemble: {
      bindingDigest: digest({ ensembleBinding: 1 }),
      policyDigest: digest({ ensemblePolicy: 1 }),
      async verifyVerdict() {
        return true;
      },
      async assess() {
        ensembleCalls += 1;
        throw new Error("must not be consulted after a hard local block");
      },
    },
  });
  const decision = await controlled.preStep({ request: request(bind) });
  assert.equal(decision.disposition, "block");
  assert.equal(ensembleCalls, 0);
});

test("unbound or malformed ensemble evidence fails closed", async () => {
  const bind = binding();
  const controlled = runtime({
    binding: bind,
    ensemble: {
      bindingDigest: digest({ ensembleBinding: "malformed" }),
      policyDigest: digest({ ensemblePolicy: "malformed" }),
      async verifyVerdict() {
        return false;
      },
      async assess() {
        return {
          verdict: {
            schemaVersion: 1,
            requestDigest: digest({ unrelatedRequest: 1 }),
            decision: "allow",
            votes: [],
            countedAssessorIds: [],
            countedIndependenceGroups: [],
            missingAssessorIds: [],
            coverageComplete: true,
            verdictDigest: digest({ fabricatedVerdict: 1 }),
          },
        };
      },
    },
  });
  const decision = await controlled.preStep({ request: request(bind) });
  assert.equal(decision.disposition, "block");
  assert.ok(decision.reasonCodes.includes("independent_ensemble_unavailable"));
});

test("portable composition withholds opaque-provider output when semantic post-output control denies", async () => {
  const bind = binding();
  const semanticRuntime = new SemanticAlignmentAgilityRuntimeV1({
    binding: bind,
    policy: policy(),
    assessors: [
      semanticAssessor("semantic-a", "application", (input) =>
        input.checkpoint === "post_output" ? { role: 1_000 } : {}),
      semanticAssessor("semantic-b", "provider"),
    ],
    actionAuthorization: actionAuthorizationBoundary("portable"),
  });
  const interventionAdapter = createInferenceInterventionAdapterDescriptorV1({
    schemaVersion: 1,
    adapterId: "opaque-intervention",
    adapterVersion: 1,
    adapterImplementationDigest: digest({ adapter: 1 }),
    agentClass: "opaque_api_model",
    capabilities: ["action_gate", "output_gate", "pre_input_filter"],
  });
  let adapterCalls = 0;
  const allowControl = (controlId) => ({
    controlId,
    controlVersion: 1,
    implementationId: `${controlId}-build`,
    evaluate: () => ({ disposition: "allow", reasonCode: "allowed" }),
  });
  const roleControl = {
    ...allowControl("role-control"),
    binding: {
      policyId: "role-policy",
      policyVersion: 1,
      policyDigest: digest({ rolePolicy: 1 }),
      assessorId: "role-assessor",
      assessorVersion: 1,
      assessorBindingDigest: digest({ roleAssessor: 1 }),
    },
  };
  const manifest = {
    schemaVersion: 1,
    adapterId: "opaque-agent",
    adapterVersion: "1",
    implementationId: "opaque-agent-build",
    agentKinds: ["language_model"],
    inputModalities: ["structured"],
    outputModalities: ["text"],
    interactionModes: ["invoke"],
    controlPoints: ["pre_step", "post_output", "pre_action"],
    supportsCancellation: true,
    supportsCheckpoint: false,
    supportsRestore: false,
    maximumObservationBytes: 10_000,
    maximumOutputBytes: 10_000,
    maximumActionBytes: 10_000,
    maximumStepsPerSession: 10,
  };
  const route = createHeterogeneousAgentRouteV1({
    schemaVersion: 1,
    routeId: "opaque-route",
    routeKind: "opaque_api",
    representationAccess: "opaque",
    interventionAdapter,
    portableAdapterBindingDigest: portableAdapterBindingDigestV1(manifest),
    representationSidecarBindingDigest: null,
  });
  const interventionRuntime = new HeterogeneousInferenceInterventionRuntimeV1({
    binding: createInferenceInterventionBindingV1({
      schemaVersion: 1,
      bindingId: "portable-intervention-binding",
      missionId: "objective-1",
      agentId: "agent-1",
      sessionId: "session-1",
      roleId: "role-1",
      modelOrAdapterId: interventionAdapter.adapterId,
      modelOrAdapterDigest: interventionAdapter.descriptorDigest,
      authorityDigest: digest({ interventionAuthority: 1 }),
      fence: 1,
    }),
    policy: createInferenceInterventionPolicyV1({
      schemaVersion: 1,
      policyId: "portable-intervention-policy",
      policyVersion: 1,
      requiredCapabilities: ["pre_input_filter", "output_gate", "action_gate"],
      thresholds: {
        blockRiskBps: 9_000,
        interventionRiskBps: 8_000,
        maximumUncertaintyBps: 9_000,
        minimumRoleCoherenceBps: 1,
      },
      budget: {
        maximumInterventions: 1,
        maximumRepresentationRequests: 1,
        cooldownLogicalMs: 0,
        recoveryClearAssessments: 1,
        maximumCasAttempts: 4,
      },
      maximumStep: 1_000_000,
      maximumWindowTokens: 32,
      sidecarTimeoutMs: 100,
    }),
    adapter: createInferenceInterventionReferenceAdapterV1({
      schemaVersion: 1,
      adapterId: interventionAdapter.adapterId,
      adapterVersion: interventionAdapter.adapterVersion,
      adapterImplementationDigest: interventionAdapter.adapterImplementationDigest,
      agentClass: interventionAdapter.agentClass,
      capabilities: interventionAdapter.capabilities,
      invoke: async () => ({ output: "allowed" }),
    }),
    assessors: [createBoundedSignalAssessorV1({
      assessorId: "portable-intervention-assessor",
      assessorVersion: 1,
      assessorImplementationDigest: digest({ interventionAssessor: 1 }),
      blockedPhrases: ["blocked-intervention"],
      interventionPhrases: ["modify-intervention"],
    })],
  });
  const composition = composeHeterogeneousPortableAgentV1({
    composerId: "heterogeneous-composer",
    composerVersion: 1,
    implementationId: "composer-build",
    route,
    manifest,
    adapter: {
      async step(input) {
        adapterCalls += 1;
        if (input.request.stepId === "step-action") {
          return {
            schemaVersion: 1,
            sessionId: input.sessionId,
            stepId: input.request.stepId,
            stepSequence: input.stepSequence,
            status: "completed",
            outputs: [],
            actionProposals: [{
              schemaVersion: 1,
              actionId: "action-1",
              actionClass: "observe",
              input: { target: "north" },
              riskClass: "low",
              metadata: { channel: "primary" },
            }],
            checkpoint: null,
            reasonCode: null,
            metadata: {},
          };
        }
        return {
          schemaVersion: 1,
          sessionId: input.sessionId,
          stepId: input.request.stepId,
          stepSequence: input.stepSequence,
          status: "completed",
          outputs: [{
            schemaVersion: 1,
            outputId: "output-1",
            modality: "text",
            content: "not released",
            contentReference: null,
            metadata: {},
          }],
          actionProposals: [],
          checkpoint: null,
          reasonCode: null,
          metadata: {},
        };
      },
    },
    semanticRuntime,
    semanticMaterial: {
      bind: () => ({
        materialHandle: "provider://opaque/assessment/1",
        materialDigest: digest({ opaqueMaterial: 1 }),
        candidateCourseActionDigests: [],
        selectedCourseActionDigest: null,
        modalities: ["text"],
      }),
    },
    roleAlignmentControl: roleControl,
    interventionControl: bindHeterogeneousInterventionPortableControlV1({
      runtime: interventionRuntime,
    }),
    maximumSessionLogicalTimeMs: 10_000,
  });
  assert.equal(typeof composition.actionGateway.dispatch, "function");
  await composition.sessionRuntime.createSession({
    sessionId: "session-1",
    tenant: { tenantId: "tenant-1" },
    agentId: "agent-1",
    adapterId: "opaque-agent",
    adapterVersion: "1",
    requirements: composition.requiredSessionCapabilities,
    role: {
      schemaVersion: 1,
      roleBindingId: "role-1",
      roleRevision: 1,
      predecessorRoleBindingId: null,
      objectiveId: "objective-1",
      roleKey: "observer",
      instructions: ["Observe."],
      constraints: {},
      validFromLogicalMs: 0,
      validUntilLogicalMs: 1_000,
    },
  });
  const firstOutcome = await composition.sessionRuntime.step("session-1", {
    schemaVersion: 1,
    stepId: "step-1",
    expectedSessionRevision: 0,
    interactionMode: "invoke",
    observations: [],
    input: {},
    requestedOutputModalities: ["text"],
    logicalTimeMs: 10,
  });
  assert.equal(firstOutcome.record.status, "refused");
  assert.equal(adapterCalls, 1);
  const outcome = await composition.sessionRuntime.step("session-1", {
    schemaVersion: 1,
    stepId: "step-2",
    expectedSessionRevision: firstOutcome.session.revision,
    interactionMode: "invoke",
    observations: [],
    input: {},
    requestedOutputModalities: ["text"],
    logicalTimeMs: 10,
  });
  assert.equal(adapterCalls, 2);
  assert.equal(outcome.record.status, "refused");
  assert.deepEqual(outcome.record.result.outputs, []);
  const actionOutcome = await composition.sessionRuntime.step("session-1", {
    schemaVersion: 1,
    stepId: "step-action",
    expectedSessionRevision: outcome.session.revision,
    interactionMode: "invoke",
    observations: [],
    input: {},
    requestedOutputModalities: ["text"],
    logicalTimeMs: 10,
  });
  assert.equal(actionOutcome.record.status, "completed");
  const proposal = actionOutcome.record.result.actionProposals[0];
  const portableActionRequest = {
    schemaVersion: 1,
    checkpoint: "pre_action",
    stepSequence: actionOutcome.record.stepSequence,
    checkpointItemIndex: 0,
    manifest,
    sessionId: actionOutcome.session.sessionId,
    tenantId: actionOutcome.session.tenantId,
    agentId: actionOutcome.session.agentId,
    role: actionOutcome.session.role,
    request: actionOutcome.record.request,
    output: null,
    actionProposal: proposal,
  };
  const effectCounter = { count: 0 };
  const sink = actionEffectSink("portable", effectCounter);
  const dispatched = await composition.actionGateway.dispatch({
    request: portableActionRequest,
    currentLogicalTimeMs: 10,
  }, sink);
  const replayed = await composition.actionGateway.dispatch({
    request: portableActionRequest,
    currentLogicalTimeMs: 10,
  }, sink);
  assert.equal(effectCounter.count, 1);
  assert.equal(
    dispatched.effectReceipt.receiptDigest,
    replayed.effectReceipt.receiptDigest,
  );
  assert.equal(
    dispatched.effectReceipt.authorizationDigest,
    dispatched.authorization.authorizationDigest,
  );
  await assert.rejects(
    composition.actionGateway.dispatch({
      request: portableActionRequest,
      currentLogicalTimeMs: 10,
    }, { ...sink, sinkId: "different-effect-sink" }),
    /sink_binding_mismatch/,
  );
  await assert.rejects(
    composition.actionGateway.dispatch({
      request: portableActionRequest,
      currentLogicalTimeMs: 10,
    }, { ...sink, sinkKeyDigest: digest({ sinkKey: "different" }) }),
    /sink_binding_mismatch/,
  );
  assert.equal(effectCounter.count, 1);
  await assert.rejects(
    composition.actionGateway.dispatch({
      request: {
        ...portableActionRequest,
        actionProposal: { ...proposal, actionClass: "modify" },
      },
      currentLogicalTimeMs: 10,
    }, sink),
    /session_commit_unverified/,
  );
});

test("route validation distinguishes representation-capable and opaque agents", () => {
  const representation = createInferenceInterventionAdapterDescriptorV1({
    schemaVersion: 1,
    adapterId: "open-weight-intervention",
    adapterVersion: 1,
    adapterImplementationDigest: digest({ open: 1 }),
    agentClass: "representation_sidecar_model",
    capabilities: [
      "action_gate",
      "output_gate",
      "pre_input_filter",
      "representation_intervention",
    ],
  });
  assert.doesNotThrow(() =>
    createHeterogeneousAgentRouteV1({
      schemaVersion: 1,
      routeId: "open-weight-route",
      routeKind: "open_weight_representation",
      representationAccess: "read_write",
      interventionAdapter: representation,
      portableAdapterBindingDigest: digest({ portableAdapter: 1 }),
      representationSidecarBindingDigest: digest({ sidecar: 1 }),
    }),
  );
  assert.throws(
    () =>
      createHeterogeneousAgentRouteV1({
        schemaVersion: 1,
        routeId: "false-opaque-route",
        routeKind: "opaque_api",
        representationAccess: "opaque",
        interventionAdapter: representation,
        portableAdapterBindingDigest: digest({ portableAdapter: 1 }),
        representationSidecarBindingDigest: null,
      }),
    /must_not_claim_representation_access/,
  );
});

test("portable semantic action payload binds the full proposal, not only input", () => {
  const base = {
    checkpoint: "pre_action",
    actionProposal: {
      schemaVersion: 1,
      actionId: "action-1",
      actionClass: "observe",
      input: { target: "north" },
      riskClass: "low",
      metadata: { channel: "primary" },
    },
  };
  const original = digestSemanticOperationPayloadV1(portableActionPayloadV1(base));
  const changedClass = digestSemanticOperationPayloadV1(portableActionPayloadV1({
    ...base,
    actionProposal: { ...base.actionProposal, actionClass: "modify" },
  }));
  const changedRisk = digestSemanticOperationPayloadV1(portableActionPayloadV1({
    ...base,
    actionProposal: { ...base.actionProposal, riskClass: "high" },
  }));
  const changedMetadata = digestSemanticOperationPayloadV1(portableActionPayloadV1({
    ...base,
    actionProposal: {
      ...base.actionProposal,
      metadata: { channel: "secondary" },
    },
  }));
  assert.notEqual(original, changedClass);
  assert.notEqual(original, changedRisk);
  assert.notEqual(original, changedMetadata);
});
