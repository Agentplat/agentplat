import assert from "node:assert/strict";
import test from "node:test";

import {
  admitRoleRefinementCandidateV1,
  assertRoleRefinementStateV1,
  createRoleRefinementEvaluationV1,
  createRoleRefinementEvidenceSummaryV1,
  createRoleRefinementPatchV1,
  createRoleRefinementPolicyRecordV1,
  createRoleRefinementProposalV1,
  createRoleRefinementRequestV1,
  createRoleRefinementSemanticDecisionV1,
  createRoleRefinementStateV1,
  digestRoleRefinementJsonV1,
  expireRoleRefinementV1,
  failRoleRefinementV1,
  materializeRefinedRoleDefinitionV1,
  recordRoleRefinementEvaluationV1,
  selectRoleRefinementCandidateV1,
} from "@agentplat/inference-control/role-refinement";
import {
  createRoleAuthorityCeilingV1,
  createTrustedRoleDefinitionV1,
} from "@agentplat/inference-control/role-realignment";

const digest = (character) => `sha256:${character.repeat(64)}`;

function refinementPolicy() {
  return {
    schemaVersion: 1,
    policyId: "refinement-policy",
    policyVersion: 1,
    minimumIndependentEvaluations: 2,
    minimumCertificationWitnesses: 2,
    minimumMonitoringObservations: 2,
    maximumConsecutiveDegradedObservations: 2,
    thresholds: {
      minimumPredictedCoherenceBps: 7_000,
      minimumPredictedContributionBps: 6_000,
      maximumPredictedUncertaintyBps: 3_000,
      maximumTransitionRiskBps: 3_000,
      confirmationCoherenceBps: 8_000,
      confirmationContributionBps: 7_000,
      confirmationMaximumUncertaintyBps: 2_000,
      rollbackCoherenceBps: 4_000,
      rollbackContributionBps: 3_000,
      rollbackUncertaintyBps: 7_000,
    },
    scoringWeights: {
      coherenceBps: 4_000,
      contributionBps: 3_000,
      uncertaintyPenaltyBps: 1_500,
      transitionRiskPenaltyBps: 1_500,
    },
    limits: {
      maximumCandidates: 8,
      maximumStrategies: 4,
      maximumEvaluators: 8,
      maximumPatchOperations: 8,
      maximumInstructions: 16,
      maximumInstructionBytes: 4_096,
      maximumConstraintsBytes: 16_384,
      maximumReasonCodes: 8,
      maximumEvidenceReferences: 8,
      maximumObservations: 16,
      maximumEvents: 256,
      maximumRequestLifetimeMs: 10_000,
      maximumEvaluationLifetimeMs: 5_000,
      maximumCertificateLifetimeMs: 5_000,
      maximumMonitoringLifetimeMs: 5_000,
    },
  };
}

function realignmentPolicy() {
  return {
    schemaVersion: 1,
    policyId: "role-policy",
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
      maximumEvaluationsPerCandidate: 8,
      maximumReasonCodes: 8,
      maximumEvidenceReferences: 8,
      maximumCapabilities: 8,
      maximumResourceClasses: 8,
      maximumInstructions: 16,
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

function fixture() {
  const policy = refinementPolicy();
  const rolePolicy = realignmentPolicy();
  const predecessor = createTrustedRoleDefinitionV1({
    catalogId: "catalog-local",
    definitionId: "investigator-role",
    definitionRevision: 3,
    predecessorDefinitionDigest: digest("0"),
    roleKey: "investigator",
    instructions: ["Inspect evidence.", "Summarize uncertainty."],
    constraints: {
      externalWrites: false,
      review: { required: false },
    },
    requiredCapabilityKeys: ["evidence.read", "evidence.review"],
    requiredResourceClasses: ["local.evidence"],
    maximumActionBudgetUnits: 8,
    validFromLogicalMs: 0,
    validUntilLogicalMs: 9_000,
  });
  const authorityCeiling = createRoleAuthorityCeilingV1({
    mandateDigest: digest("a"),
    capabilityKeys: ["evidence.read", "evidence.review"],
    resourceClasses: ["local.evidence"],
    maximumActionBudgetUnits: 8,
    validUntilLogicalMs: 9_000,
  });
  const evidence = createRoleRefinementEvidenceSummaryV1(
    {
      alignmentStateRevision: 9,
      alignmentStateDigest: digest("b"),
      rollingCoherenceBps: 6_200,
      degraded: true,
      observedSignalCount: 12,
      reasonCodes: ["persistent_role_drift"],
      evidenceReferenceIds: ["alignment-window-9"],
      summarizedAtLogicalMs: 5,
    },
    policy,
  );
  const policyRecord = createRoleRefinementPolicyRecordV1(policy);
  const request = createRoleRefinementRequestV1(
    {
      requestId: "refinement-request-1",
      selectionId: "selection-1",
      publicationId: "publication-1",
      activationId: "activation-1",
      rollbackId: "rollback-1",
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      policyDigest: policyRecord.policyDigest,
      tenantId: "tenant-a",
      sessionId: "session-a",
      agentId: "agent-a",
      objectiveId: "objective-a",
      predecessorCatalogId: predecessor.catalogId,
      predecessorDefinitionId: predecessor.definitionId,
      predecessorDefinitionRevision: predecessor.definitionRevision,
      predecessorDefinitionDigest: predecessor.definitionDigest,
      predecessorRoleAnchorDigest: digest("c"),
      authorityCeiling,
      evidence,
      createdAtLogicalMs: 5,
      expiresAtLogicalMs: 5_005,
    },
    policy,
    rolePolicy,
  );
  return { policy, rolePolicy, predecessor, authorityCeiling, request };
}

function patchFor(fixture, suffix, scoreOffset = 0) {
  const patch = createRoleRefinementPatchV1(
    {
      predecessorDefinitionDigest: fixture.predecessor.definitionDigest,
      operations: [
        {
          operationId: `operation-${suffix}`,
          kind: "instruction_replace",
          index: 1,
          expectedInstructionDigest: digestRoleRefinementJsonV1(
            "instruction",
            fixture.predecessor.instructions[1],
          ),
          instruction: `Quantify uncertainty ${suffix}.`,
        },
      ],
      authority: {
        requiredCapabilityKeys: ["evidence.read"],
        requiredResourceClasses: ["local.evidence"],
        maximumActionBudgetUnits: 6 - scoreOffset,
        validUntilLogicalMs: 8_000,
      },
    },
    fixture.predecessor,
    fixture.policy,
    fixture.rolePolicy,
  );
  const definition = materializeRefinedRoleDefinitionV1({
    predecessor: fixture.predecessor,
    patch,
    authorityCeiling: fixture.authorityCeiling,
    policy: fixture.policy,
    realignmentPolicy: fixture.rolePolicy,
  });
  return { patch, definition };
}

test("structured patches apply deterministically and retain exact predecessor lineage", () => {
  const setup = fixture();
  const { patch, definition } = patchFor(setup, "precise");
  const replay = materializeRefinedRoleDefinitionV1({
    predecessor: setup.predecessor,
    patch,
    authorityCeiling: setup.authorityCeiling,
    policy: setup.policy,
    realignmentPolicy: setup.rolePolicy,
  });
  assert.equal(replay.definitionDigest, definition.definitionDigest);
  assert.equal(
    definition.predecessorDefinitionDigest,
    setup.predecessor.definitionDigest,
  );
  assert.equal(definition.definitionRevision, 4);
  assert.deepEqual(definition.instructions, [
    "Inspect evidence.",
    "Quantify uncertainty precise.",
  ]);
  assert.deepEqual(definition.requiredCapabilityKeys, ["evidence.read"]);
});

test("stale patch preconditions and authority widening fail closed", () => {
  const setup = fixture();
  assert.throws(
    () =>
      createRoleRefinementPatchV1(
        {
          predecessorDefinitionDigest: setup.predecessor.definitionDigest,
          operations: [
            {
              operationId: "operation-stale",
              kind: "instruction_remove",
              index: 0,
              expectedInstructionDigest: digest("d"),
            },
          ],
          authority: {
            requiredCapabilityKeys: ["evidence.read"],
            requiredResourceClasses: ["local.evidence"],
            maximumActionBudgetUnits: 6,
            validUntilLogicalMs: 8_000,
          },
        },
        setup.predecessor,
        setup.policy,
        setup.rolePolicy,
      ),
    /instruction_precondition_failed/u,
  );
  assert.throws(
    () =>
      createRoleRefinementPatchV1(
        {
          predecessorDefinitionDigest: setup.predecessor.definitionDigest,
          operations: [
            {
              operationId: "operation-authority",
              kind: "instruction_insert",
              index: 2,
              instruction: "Preserve provenance.",
            },
          ],
          authority: {
            requiredCapabilityKeys: ["evidence.read", "network.write"],
            requiredResourceClasses: ["local.evidence"],
            maximumActionBudgetUnits: 9,
            validUntilLogicalMs: 9_001,
          },
        },
        setup.predecessor,
        setup.policy,
        setup.rolePolicy,
      ),
    /authority_widening_denied/u,
  );
});

function candidateArtifacts(setup, suffix, scoreOffset = 0) {
  const { patch, definition } = patchFor(setup, suffix, scoreOffset);
  const proposal = createRoleRefinementProposalV1(
    {
      proposalId: `proposal-${suffix}`,
      requestDigest: setup.request.requestDigest,
      proposerId: `proposer-${suffix}`,
      proposerVersion: 1,
      proposerBindingDigest: digest(suffix === "alpha" ? "e" : "f"),
      patch,
      refinedDefinitionDigest: definition.definitionDigest,
      reasonCodes: ["evidence_supported"],
      evidenceReferenceIds: ["alignment-window-9"],
      proposedAtLogicalMs: 10,
      expiresAtLogicalMs: 4_000,
    },
    setup.request,
    setup.predecessor,
    setup.policy,
    setup.rolePolicy,
  );
  const semanticDecision = createRoleRefinementSemanticDecisionV1(
    {
      requestDigest: setup.request.requestDigest,
      patchDigest: patch.patchDigest,
      refinedDefinitionDigest: definition.definitionDigest,
      validatorId: "semantic-validator",
      validatorVersion: 1,
      validatorBindingDigest: digest("1"),
      accepted: true,
      objectiveAligned: true,
      constraintsNotWeaker: true,
      reasonCodes: ["semantically_valid"],
      evidenceReferenceIds: ["alignment-window-9"],
      decidedAtLogicalMs: 11,
      expiresAtLogicalMs: 4_000,
    },
    setup.policy,
  );
  return { proposal, definition, semanticDecision };
}

function selectedState(order) {
  const setup = fixture();
  const artifacts = {
    alpha: candidateArtifacts(setup, "alpha", 0),
    beta: candidateArtifacts(setup, "beta", 1),
  };
  let state = createRoleRefinementStateV1({
    controllerId: "refinement-control",
    controllerVersion: 1,
    implementationId: "refinement-build-1",
    request: setup.request,
    policy: setup.policy,
    realignmentPolicy: setup.rolePolicy,
  });
  for (const suffix of order) {
    const item = artifacts[suffix];
    state = admitRoleRefinementCandidateV1(
      state,
      {
        expectedRevision: state.revision,
        proposal: item.proposal,
        refinedDefinition: item.definition,
        draftId: `draft-${suffix}`,
        semanticDecision: item.semanticDecision,
        proposerTrustDecisionDigest: digest(suffix === "alpha" ? "2" : "3"),
        logicalTimeMs: 12,
      },
      setup.predecessor,
      setup.policy,
      setup.rolePolicy,
    ).state;
  }
  for (const suffix of [...order].reverse()) {
    const candidate = state.candidates.find(
      (item) => item.proposalId === `proposal-${suffix}`,
    );
    for (const evaluator of ["evaluator-a", "evaluator-b"]) {
      const evaluation = createRoleRefinementEvaluationV1(
        {
          evaluationId: `${suffix}-${evaluator}`,
          requestDigest: setup.request.requestDigest,
          candidateDigest: candidate.candidateDigest,
          patchDigest: candidate.patchDigest,
          refinedDefinitionDigest: candidate.refinedDefinitionDigest,
          evaluatorId: evaluator,
          evaluatorVersion: 1,
          evaluatorBindingDigest: digest(evaluator.endsWith("a") ? "4" : "5"),
          evaluatorTrustDecisionDigest: digest(
            evaluator.endsWith("a") ? "6" : "7",
          ),
          eligible: true,
          predictedCoherenceBps: suffix === "alpha" ? 8_600 : 7_600,
          predictedContributionBps: suffix === "alpha" ? 8_000 : 7_000,
          uncertaintyBps: suffix === "alpha" ? 1_000 : 2_000,
          transitionRiskBps: suffix === "alpha" ? 1_000 : 2_000,
          reasonCodes: ["evaluation_complete"],
          evidenceReferenceIds: ["alignment-window-9"],
          evaluatedAtLogicalMs: 13,
          expiresAtLogicalMs: 4_000,
        },
        state,
        setup.policy,
      );
      state = recordRoleRefinementEvaluationV1(
        state,
        { expectedRevision: state.revision, evaluation, logicalTimeMs: 14 },
        setup.policy,
      ).state;
    }
  }
  state = selectRoleRefinementCandidateV1(
    state,
    {
      expectedRevision: state.revision,
      selectionId: "selection-1",
      logicalTimeMs: 15,
    },
    setup.policy,
  ).state;
  return { setup, state };
}

test("selection is order-independent and coordination candidates contain no role content", () => {
  const first = selectedState(["alpha", "beta"]);
  const second = selectedState(["beta", "alpha"]);
  assert.equal(
    first.state.selection.selectionDigest,
    second.state.selection.selectionDigest,
  );
  assert.equal(
    first.state.selection.selectedDefinitionDigest,
    first.state.candidates.find((item) => item.proposalId === "proposal-alpha")
      .refinedDefinitionDigest,
  );
  const serializedCandidates = JSON.stringify(first.state.candidates);
  assert.doesNotMatch(serializedCandidates, /Quantify uncertainty/u);
  assert.doesNotMatch(serializedCandidates, /externalWrites/u);
  assert.doesNotThrow(() =>
    assertRoleRefinementStateV1(
      first.state,
      first.setup.policy,
      first.setup.rolePolicy,
    ),
  );
});

test("terminal expiry and failure preserve a valid causal artifact prefix", () => {
  const selected = selectedState(["alpha", "beta"]);
  const expired = expireRoleRefinementV1(
    selected.state,
    {
      expectedRevision: selected.state.revision,
      logicalTimeMs: selected.state.request.expiresAtLogicalMs,
    },
    selected.setup.policy,
  ).state;
  assert.equal(expired.status, "expired");
  assert.equal(
    expired.selection.selectionDigest,
    selected.state.selection.selectionDigest,
  );
  assert.doesNotThrow(() =>
    assertRoleRefinementStateV1(
      expired,
      selected.setup.policy,
      selected.setup.rolePolicy,
    ),
  );
  const failed = failRoleRefinementV1(
    selected.state,
    {
      expectedRevision: selected.state.revision,
      failureDigest: digest("f"),
      reasonCode: "strategy_runtime_failed",
      logicalTimeMs: selected.state.lastLogicalTimeMs + 1,
    },
    selected.setup.policy,
  ).state;
  assert.equal(failed.status, "failed");
  assert.equal(
    failed.selection.selectionDigest,
    selected.state.selection.selectionDigest,
  );
  assert.doesNotThrow(() =>
    assertRoleRefinementStateV1(
      failed,
      selected.setup.policy,
      selected.setup.rolePolicy,
    ),
  );
});
