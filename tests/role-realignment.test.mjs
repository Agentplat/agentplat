import assert from "node:assert/strict";
import test from "node:test";

import {
  createRoleAlignmentPolicyRecordV1,
  createRoleAlignmentRoleAnchorV1,
  createRoleAlignmentStateV1,
  observeRoleAlignmentSignalV1,
} from "@agentplat/inference-control/role-alignment";
import {
  admitRoleCandidateV1,
  assertRoleRealignmentStateV1,
  beginRoleRealignmentActivationV1,
  certifyRoleRealignmentSelectionV1,
  completeRoleRealignmentActivationV1,
  createRoleAuthorityCeilingV1,
  createRoleCandidateEvaluationV1,
  createRoleCandidateProposalV1,
  createRoleRealignmentCertificateV1,
  createRoleRealignmentPolicyRecordV1,
  createRoleRealignmentRequestV1,
  createRoleRealignmentStateV1,
  createTrustedRoleDefinitionV1,
  digestRoleRealignmentJsonV1,
  materializeCertifiedRoleBindingV1,
  recordRoleCandidateEvaluationV1,
  selectRoleCandidateV1,
} from "@agentplat/inference-control/role-realignment";

const digest = (character) => `sha256:${character.repeat(64)}`;

function alignmentPolicy() {
  return {
    schemaVersion: 1,
    policyId: "alignment-policy",
    policyVersion: 1,
    parentPolicyDigest: null,
    thresholds: {
      healthyCoherenceBps: 8_000,
      reinforceCoherenceBelowBps: 7_000,
      pauseCoherenceAtOrBelowBps: 3_000,
      denyCoherenceAtOrBelowBps: 1_000,
      challengeContextAtOrAboveBps: 8_000,
      maximumUncertaintyBps: 6_000,
    },
    consecutiveBreachLimit: 2,
    recoverySignalsRequired: 2,
    reinforcementCooldownSignals: 0,
    denyActionsWhileDegraded: true,
    budgets: {
      maximumReinforcements: 8,
      maximumContextChallenges: 4,
      maximumPauses: 2,
    },
    limits: {
      rollingWindowSignals: 16,
      maximumSignals: 1_000,
      maximumRetainedEvents: 256,
      maximumReasonCodesPerSignal: 8,
      maximumEvidenceReferencesPerSignal: 8,
      maximumAssessmentTtlMs: 10_000,
      maximumStateBytes: 16_777_216,
    },
  };
}

function realignmentPolicy() {
  return {
    schemaVersion: 1,
    policyId: "role-realignment-policy",
    policyVersion: 1,
    parentPolicyDigest: null,
    minimumIndependentEvaluations: 2,
    minimumCertificationWitnesses: 2,
    thresholds: {
      minimumRoleFitBps: 7_000,
      minimumMissionContributionBps: 6_000,
      maximumUncertaintyBps: 3_000,
      maximumTransitionRiskBps: 3_000,
    },
    scoringWeights: {
      roleFitBps: 4_000,
      missionContributionBps: 3_000,
      uncertaintyPenaltyBps: 1_500,
      transitionRiskPenaltyBps: 1_500,
    },
    limits: {
      maximumProposers: 4,
      maximumCandidates: 8,
      maximumEvaluationsPerCandidate: 4,
      maximumReasonCodes: 8,
      maximumEvidenceReferences: 8,
      maximumCapabilities: 8,
      maximumResourceClasses: 8,
      maximumInstructions: 8,
      maximumInstructionBytes: 4_096,
      maximumConstraintsBytes: 16_384,
      maximumRequestTtlMs: 10_000,
      maximumEvaluationTtlMs: 5_000,
      maximumCertificationTtlMs: 5_000,
      maximumRetainedEvents: 256,
      maximumStateBytes: 16_777_216,
    },
  };
}

function alignmentStateRequiringRealignment() {
  const policy = alignmentPolicy();
  const anchor = createRoleAlignmentRoleAnchorV1({
    tenantId: "tenant-a",
    sessionId: "session-a",
    agentId: "agent-a",
    objectiveId: "objective-a",
    roleBindingId: "role-observer-1",
    roleRevision: 1,
    predecessorRoleBindingId: null,
    roleKey: "observer",
    roleContent: {
      instructions: ["Inspect evidence."],
      constraints: { externalWrites: false },
      validFromLogicalMs: 0,
      validUntilLogicalMs: 20_000,
    },
  });
  let state = createRoleAlignmentStateV1({
    controllerId: "alignment-control",
    controllerVersion: 1,
    implementationId: "alignment-build-1",
    policy,
    roleAnchor: anchor,
    createdAtLogicalMs: 0,
  });
  for (let sequence = 1; sequence <= 2; sequence += 1) {
    state = observeRoleAlignmentSignalV1(
      state,
      {
        expectedRevision: state.revision,
        signal: {
          schemaVersion: 1,
          signalId: `signal-${sequence}`,
          assessmentRequestId: `assessment-${sequence}`,
          assessorId: "assessor-a",
          assessorVersion: 1,
          assessorBindingDigest: digest("a"),
          tenantId: state.tenantId,
          sessionId: state.sessionId,
          agentId: state.agentId,
          stepId: `step-${sequence}`,
          checkpoint: "pre_step",
          roleAnchorDigest: state.roleAnchor.anchorDigest,
          roleRevision: state.roleAnchor.roleRevision,
          targetDigest: digest(String(sequence)),
          coherenceBps: 6_000,
          uncertaintyBps: 1_000,
          contextInconsistencyBps: 500,
          hardViolation: false,
          reasonCodes: ["role_drift"],
          evidenceReferenceIds: [`evidence-${sequence}`],
          observedAtLogicalMs: sequence,
          expiresAtLogicalMs: sequence + 1_000,
        },
      },
      policy,
    ).state;
  }
  return { state, policy };
}

function setup() {
  const policy = realignmentPolicy();
  const alignment = alignmentStateRequiringRealignment();
  const ceiling = createRoleAuthorityCeilingV1({
    mandateDigest: digest("b"),
    capabilityKeys: ["evidence.read", "evidence.review"],
    resourceClasses: ["local.evidence"],
    maximumActionBudgetUnits: 10,
    validUntilLogicalMs: 10_000,
  });
  const request = createRoleRealignmentRequestV1({
    requestId: "realignment-request-1",
    policy,
    alignmentPolicy: alignment.policy,
    alignmentState: alignment.state,
    authorityCeiling: ceiling,
    createdAtLogicalMs: 3,
    expiresAtLogicalMs: 9_000,
  });
  const state = createRoleRealignmentStateV1({
    controllerId: "realignment-control",
    controllerVersion: 1,
    implementationId: "realignment-build-1",
    policy,
    request,
    createdAtLogicalMs: 3,
  });
  return { policy, request, state };
}

function definition(id, overrides = {}) {
  return createTrustedRoleDefinitionV1({
    catalogId: "catalog-local",
    definitionId: id,
    definitionRevision: 1,
    predecessorDefinitionDigest: null,
    roleKey: id,
    instructions: ["Review inconsistent evidence."],
    constraints: { externalWrites: false },
    requiredCapabilityKeys: ["evidence.read"],
    requiredResourceClasses: ["local.evidence"],
    maximumActionBudgetUnits: 5,
    validFromLogicalMs: 0,
    validUntilLogicalMs: 9_000,
    ...overrides,
  });
}

function proposal(request, roleDefinition, proposer, time = 4) {
  return createRoleCandidateProposalV1({
    proposalId: `proposal-${proposer}-${roleDefinition.definitionId}`,
    requestDigest: request.requestDigest,
    proposerId: proposer,
    proposerVersion: 1,
    proposerBindingDigest: digest(proposer === "proposer-a" ? "c" : "d"),
    definitionId: roleDefinition.definitionId,
    definitionRevision: roleDefinition.definitionRevision,
    definitionDigest: roleDefinition.definitionDigest,
    reasonCodes: ["catalog_match"],
    evidenceReferenceIds: ["evidence-role-gap"],
    proposedAtLogicalMs: time,
    expiresAtLogicalMs: 5_005,
  });
}

function evaluation(state, candidate, evaluator, scores = {}) {
  return createRoleCandidateEvaluationV1({
    evaluationId: `evaluation-${candidate.candidateId}-${evaluator}`,
    requestDigest: state.request.requestDigest,
    candidateDigest: candidate.candidateDigest,
    definitionDigest: candidate.proposal.definitionDigest,
    evaluatorId: evaluator,
    evaluatorVersion: 1,
    evaluatorBindingDigest: digest(evaluator === "evaluator-a" ? "e" : "f"),
    eligibilityDecisionDigest: digest(evaluator === "evaluator-a" ? "1" : "2"),
    eligible: true,
    roleFitBps: 8_500,
    missionContributionBps: 8_000,
    uncertaintyBps: 1_000,
    transitionRiskBps: 1_000,
    reasonCodes: ["candidate_supported"],
    evidenceReferenceIds: ["evidence-assessment"],
    evaluatedAtLogicalMs: 5,
    expiresAtLogicalMs: 5_005,
    ...scores,
  });
}

test("deterministic discovery selects, certifies and materializes an exact successor", () => {
  const context = setup();
  let state = context.state;
  const roles = [definition("reviewer-a"), definition("reviewer-b")];
  for (let index = 0; index < roles.length; index += 1) {
    const admitted = admitRoleCandidateV1(
      state,
      {
        expectedRevision: state.revision,
        proposal: proposal(
          context.request,
          roles[index],
          index === 0 ? "proposer-a" : "proposer-b",
        ),
        proposerEligibilityDecisionDigest: digest(index === 0 ? "3" : "4"),
        definition: roles[index],
        logicalTimeMs: 4,
      },
      context.policy,
    );
    state = admitted.state;
  }
  assert.equal(
    state.candidates.some((candidate) => "definition" in candidate),
    false,
  );
  assert.equal(
    JSON.stringify(state.candidates).includes("Review inconsistent evidence."),
    false,
  );
  for (const candidate of state.candidates) {
    for (const evaluator of ["evaluator-a", "evaluator-b"]) {
      const scores =
        candidate.proposal.definitionId === "reviewer-b"
          ? { roleFitBps: 8_800, missionContributionBps: 8_500 }
          : {};
      const recorded = recordRoleCandidateEvaluationV1(
        state,
        {
          expectedRevision: state.revision,
          evaluation: evaluation(state, candidate, evaluator, scores),
          logicalTimeMs: 5,
        },
        context.policy,
      );
      state = recorded.state;
    }
  }
  state = selectRoleCandidateV1(
    state,
    {
      expectedRevision: state.revision,
      selectionId: "selection-1",
      logicalTimeMs: 6,
    },
    context.policy,
  ).state;
  const substitutedSelectionState = structuredClone(state);
  const lowerRankedCandidate = substitutedSelectionState.candidates.find(
    (candidate) =>
      candidate.candidateDigest !==
      substitutedSelectionState.selection.selectedCandidateDigest,
  );
  substitutedSelectionState.selection.selectedCandidateId =
    lowerRankedCandidate.candidateId;
  substitutedSelectionState.selection.selectedCandidateDigest =
    lowerRankedCandidate.candidateDigest;
  substitutedSelectionState.selection.selectedDefinitionDigest =
    lowerRankedCandidate.proposal.definitionDigest;
  const { selectionDigest: _selectionDigest, ...selectionBody } =
    substitutedSelectionState.selection;
  substitutedSelectionState.selection.selectionDigest =
    digestRoleRealignmentJsonV1("selection", selectionBody);
  const selectionEvent = substitutedSelectionState.events.at(-1);
  selectionEvent.inputDigest =
    substitutedSelectionState.selection.selectionDigest;
  const { eventDigest: _eventDigest, ...eventBody } = selectionEvent;
  selectionEvent.eventDigest = digestRoleRealignmentJsonV1("event", eventBody);
  substitutedSelectionState.lastEventDigest = selectionEvent.eventDigest;
  const { stateDigest: _stateDigest, ...stateBody } = substitutedSelectionState;
  substitutedSelectionState.stateDigest = digestRoleRealignmentJsonV1(
    "state",
    stateBody,
  );
  assert.throws(
    () =>
      assertRoleRealignmentStateV1(substitutedSelectionState, context.policy),
    /selection_invalid/u,
  );
  assert.equal(
    state.candidates.find(
      (candidate) =>
        candidate.candidateDigest === state.selection.selectedCandidateDigest,
    ).proposal.definitionId,
    "reviewer-b",
  );
  const certificate = createRoleRealignmentCertificateV1({
    certificateId: "certificate-1",
    certificationKind: "local_policy",
    certifierId: "certifier-local",
    certifierVersion: 1,
    certifierBindingDigest: digest("5"),
    requestDigest: state.request.requestDigest,
    selectionDigest: state.selection.selectionDigest,
    selectedCandidateDigest: state.selection.selectedCandidateDigest,
    selectedDefinitionDigest: state.selection.selectedDefinitionDigest,
    authorityCeilingDigest: state.request.authorityCeiling.ceilingDigest,
    witnessIds: ["witness-a", "witness-b"],
    membershipEpoch: null,
    membershipConfigurationDigest: null,
    sourceCertificateDigest: digest("6"),
    certifiedAtLogicalMs: 7,
    expiresAtLogicalMs: 5_007,
  });
  state = certifyRoleRealignmentSelectionV1(
    state,
    { expectedRevision: state.revision, certificate, logicalTimeMs: 7 },
    context.policy,
  ).state;
  const role = materializeCertifiedRoleBindingV1(
    state,
    { logicalTimeMs: 8, definition: roles[1] },
    context.policy,
  );
  assert.equal(role.roleRevision, 2);
  assert.equal(role.predecessorRoleBindingId, "role-observer-1");
  assert.equal(role.roleKey, "reviewer-b");
  state = beginRoleRealignmentActivationV1(
    state,
    {
      expectedRevision: state.revision,
      activationId: "activation-1",
      definition: roles[1],
      logicalTimeMs: 8,
    },
    context.policy,
  ).state;
  state = completeRoleRealignmentActivationV1(
    state,
    {
      expectedRevision: state.revision,
      runtimeSessionRevision: 2,
      alignmentStateRevision: 3,
      alignmentRoleAnchorDigest: digest("7"),
      logicalTimeMs: 9,
    },
    context.policy,
  ).state;
  assert.equal(state.status, "activated");
  assert.doesNotThrow(() =>
    assertRoleRealignmentStateV1(state, context.policy),
  );
  const substitutedActivationState = structuredClone(state);
  substitutedActivationState.activation.roleBinding.instructions = [
    "Injected peer instructions.",
  ];
  substitutedActivationState.activation.roleBindingDigest =
    digestRoleRealignmentJsonV1(
      "role_binding",
      substitutedActivationState.activation.roleBinding,
    );
  const { activationDigest: _activationDigest, ...activationBody } =
    substitutedActivationState.activation;
  substitutedActivationState.activation.activationDigest =
    digestRoleRealignmentJsonV1("activation", activationBody);
  const activationEvent = substitutedActivationState.events.at(-1);
  activationEvent.inputDigest =
    substitutedActivationState.activation.activationDigest;
  const { eventDigest: _activationEventDigest, ...activationEventBody } =
    activationEvent;
  activationEvent.eventDigest = digestRoleRealignmentJsonV1(
    "event",
    activationEventBody,
  );
  substitutedActivationState.lastEventDigest = activationEvent.eventDigest;
  const { stateDigest: _activationStateDigest, ...activationStateBody } =
    substitutedActivationState;
  substitutedActivationState.stateDigest = digestRoleRealignmentJsonV1(
    "state",
    activationStateBody,
  );
  assert.throws(
    () =>
      assertRoleRealignmentStateV1(substitutedActivationState, context.policy),
    /activation_invalid/u,
  );
  assert.match(
    createRoleRealignmentPolicyRecordV1(context.policy).policyDigest,
    /^sha256:[0-9a-f]{64}$/u,
  );
  assert.match(
    createRoleAlignmentPolicyRecordV1(alignmentPolicy()).policyDigest,
    /^sha256:[0-9a-f]{64}$/u,
  );
});

test("trusted catalog definitions cannot widen the current authority ceiling", () => {
  const context = setup();
  const widened = definition("writer", {
    requiredCapabilityKeys: ["evidence.read", "external.write"],
  });
  assert.throws(
    () =>
      admitRoleCandidateV1(
        context.state,
        {
          expectedRevision: context.state.revision,
          proposal: proposal(context.request, widened, "proposer-a"),
          proposerEligibilityDecisionDigest: digest("3"),
          definition: widened,
          logicalTimeMs: 4,
        },
        context.policy,
      ),
    /authority_widening_denied/u,
  );
});
