import {
  admitRoleRefinementCandidateV1,
  certifyRoleRefinementV1,
  completeRoleRefinementRollbackV1,
  createRoleRefinementActivationV1,
  createRoleRefinementCertificateV1,
  createRoleRefinementEvaluationV1,
  createRoleRefinementEvidenceSummaryV1,
  createRoleRefinementPatchV1,
  createRoleRefinementPolicyRecordV1,
  createRoleRefinementProposalV1,
  createRoleRefinementPublicationV1,
  createRoleRefinementRequestV1,
  createRoleRefinementRollbackV1,
  createRoleRefinementSemanticDecisionV1,
  createRoleRefinementStateV1,
  createRoleRefinementObservationV1,
  materializeRefinedRoleDefinitionV1,
  quarantineRoleRefinementRevisionV1,
  recordRoleRefinementActivationV1,
  recordRoleRefinementEvaluationV1,
  recordRoleRefinementObservationV1,
  recordRoleRefinementPublicationV1,
  selectRoleRefinementCandidateV1,
} from "@agentplat/inference-control/role-refinement";
import {
  createRoleAuthorityCeilingV1,
  createTrustedRoleDefinitionV1,
} from "@agentplat/inference-control/role-realignment";

const digest = (character) => `sha256:${character.repeat(64)}`;

const realignmentPolicy = {
  schemaVersion: 1,
  policyId: "role-policy",
  policyVersion: 1,
  parentPolicyDigest: null,
  minimumIndependentEvaluations: 1,
  minimumCertificationWitnesses: 1,
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
    maximumProposers: 2,
    maximumCandidates: 4,
    maximumEvaluationsPerCandidate: 4,
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
    maximumRetainedEvents: 128,
    maximumStateBytes: 16_777_216,
  },
};

const policy = {
  schemaVersion: 1,
  policyId: "refinement-policy",
  policyVersion: 1,
  minimumIndependentEvaluations: 1,
  minimumCertificationWitnesses: 1,
  minimumMonitoringObservations: 1,
  maximumConsecutiveDegradedObservations: 1,
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
    maximumCandidates: 4,
    maximumStrategies: 2,
    maximumEvaluators: 4,
    maximumPatchOperations: 8,
    maximumInstructions: 16,
    maximumInstructionBytes: 4_096,
    maximumConstraintsBytes: 16_384,
    maximumReasonCodes: 8,
    maximumEvidenceReferences: 8,
    maximumObservations: 8,
    maximumEvents: 128,
    maximumRequestLifetimeMs: 10_000,
    maximumEvaluationLifetimeMs: 5_000,
    maximumCertificateLifetimeMs: 5_000,
    maximumMonitoringLifetimeMs: 5_000,
  },
};

const predecessor = createTrustedRoleDefinitionV1({
  catalogId: "catalog-local",
  definitionId: "investigator-role",
  definitionRevision: 1,
  predecessorDefinitionDigest: null,
  roleKey: "investigator",
  instructions: ["Inspect the available evidence."],
  constraints: { externalWrites: false },
  requiredCapabilityKeys: ["evidence.read", "evidence.review"],
  requiredResourceClasses: ["local.evidence"],
  maximumActionBudgetUnits: 8,
  validFromLogicalMs: 0,
  validUntilLogicalMs: 10_000,
});

const authorityCeiling = createRoleAuthorityCeilingV1({
  mandateDigest: digest("a"),
  capabilityKeys: ["evidence.read", "evidence.review"],
  resourceClasses: ["local.evidence"],
  maximumActionBudgetUnits: 8,
  validUntilLogicalMs: 10_000,
});
const policyRecord = createRoleRefinementPolicyRecordV1(policy);
const evidence = createRoleRefinementEvidenceSummaryV1(
  {
    alignmentStateRevision: 12,
    alignmentStateDigest: digest("b"),
    rollingCoherenceBps: 6_100,
    degraded: true,
    observedSignalCount: 20,
    reasonCodes: ["persistent_role_drift"],
    evidenceReferenceIds: ["alignment-window-12"],
    summarizedAtLogicalMs: 10,
  },
  policy,
);
const request = createRoleRefinementRequestV1(
  {
    requestId: "refinement-request-1",
    selectionId: "selection-local",
    publicationId: "publication-local",
    activationId: "activation-local",
    rollbackId: "rollback-local",
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    policyDigest: policyRecord.policyDigest,
    tenantId: "tenant-local",
    sessionId: "session-local",
    agentId: "agent-local",
    objectiveId: "objective-local",
    predecessorCatalogId: predecessor.catalogId,
    predecessorDefinitionId: predecessor.definitionId,
    predecessorDefinitionRevision: predecessor.definitionRevision,
    predecessorDefinitionDigest: predecessor.definitionDigest,
    predecessorRoleAnchorDigest: digest("c"),
    authorityCeiling,
    evidence,
    createdAtLogicalMs: 10,
    expiresAtLogicalMs: 5_010,
  },
  policy,
  realignmentPolicy,
);
const patch = createRoleRefinementPatchV1(
  {
    predecessorDefinitionDigest: predecessor.definitionDigest,
    operations: [
      {
        operationId: "add-uncertainty-check",
        kind: "instruction_insert",
        index: 1,
        instruction: "Quantify uncertainty before reaching a conclusion.",
      },
    ],
    authority: {
      requiredCapabilityKeys: ["evidence.read"],
      requiredResourceClasses: ["local.evidence"],
      maximumActionBudgetUnits: 6,
      validUntilLogicalMs: 9_000,
    },
  },
  predecessor,
  policy,
  realignmentPolicy,
);
const refined = materializeRefinedRoleDefinitionV1({
  predecessor,
  patch,
  authorityCeiling,
  policy,
  realignmentPolicy,
});
const proposal = createRoleRefinementProposalV1(
  {
    proposalId: "proposal-local",
    requestDigest: request.requestDigest,
    proposerId: "strategy-local",
    proposerVersion: 1,
    proposerBindingDigest: digest("d"),
    patch,
    refinedDefinitionDigest: refined.definitionDigest,
    reasonCodes: ["evidence_supported"],
    evidenceReferenceIds: ["alignment-window-12"],
    proposedAtLogicalMs: 11,
    expiresAtLogicalMs: 4_000,
  },
  request,
  predecessor,
  policy,
  realignmentPolicy,
);
const semanticDecision = createRoleRefinementSemanticDecisionV1(
  {
    requestDigest: request.requestDigest,
    patchDigest: patch.patchDigest,
    refinedDefinitionDigest: refined.definitionDigest,
    validatorId: "semantic-local",
    validatorVersion: 1,
    validatorBindingDigest: digest("e"),
    accepted: true,
    objectiveAligned: true,
    constraintsNotWeaker: true,
    reasonCodes: ["semantically_valid"],
    evidenceReferenceIds: ["alignment-window-12"],
    decidedAtLogicalMs: 12,
    expiresAtLogicalMs: 4_000,
  },
  policy,
);

let state = createRoleRefinementStateV1({
  controllerId: "refinement-control",
  controllerVersion: 1,
  implementationId: "refinement-example-v1",
  request,
  policy,
  realignmentPolicy,
});
state = admitRoleRefinementCandidateV1(
  state,
  {
    expectedRevision: state.revision,
    proposal,
    refinedDefinition: refined,
    draftId: "draft-local",
    semanticDecision,
    proposerTrustDecisionDigest: digest("f"),
    logicalTimeMs: 12,
  },
  predecessor,
  policy,
  realignmentPolicy,
).state;
const candidate = state.candidates[0];
const evaluation = createRoleRefinementEvaluationV1(
  {
    evaluationId: "evaluation-local",
    requestDigest: request.requestDigest,
    candidateDigest: candidate.candidateDigest,
    patchDigest: candidate.patchDigest,
    refinedDefinitionDigest: candidate.refinedDefinitionDigest,
    evaluatorId: "evaluator-local",
    evaluatorVersion: 1,
    evaluatorBindingDigest: digest("1"),
    evaluatorTrustDecisionDigest: digest("2"),
    eligible: true,
    predictedCoherenceBps: 8_800,
    predictedContributionBps: 8_200,
    uncertaintyBps: 1_000,
    transitionRiskBps: 1_000,
    reasonCodes: ["candidate_supported"],
    evidenceReferenceIds: ["alignment-window-12"],
    evaluatedAtLogicalMs: 13,
    expiresAtLogicalMs: 4_000,
  },
  state,
  policy,
);
state = recordRoleRefinementEvaluationV1(
  state,
  { expectedRevision: state.revision, evaluation, logicalTimeMs: 13 },
  policy,
).state;
state = selectRoleRefinementCandidateV1(
  state,
  {
    expectedRevision: state.revision,
    selectionId: "selection-local",
    logicalTimeMs: 14,
  },
  policy,
).state;
const certificate = createRoleRefinementCertificateV1(
  {
    certificateId: "certificate-local",
    action: "publish",
    certifierId: "certifier-local",
    certifierVersion: 1,
    certifierBindingDigest: digest("3"),
    requestDigest: request.requestDigest,
    selectionDigest: state.selection.selectionDigest,
    predecessorDefinitionDigest: predecessor.definitionDigest,
    refinedDefinitionDigest: refined.definitionDigest,
    patchDigest: patch.patchDigest,
    authorityCeilingDigest: authorityCeiling.ceilingDigest,
    activationDigest: null,
    monitoringDigest: null,
    witnessIds: ["witness-local"],
    membershipEpoch: 1,
    membershipConfigurationDigest: digest("4"),
    sourceCertificateDigest: digest("5"),
    certifiedAtLogicalMs: 15,
    expiresAtLogicalMs: 1_000,
  },
  state,
  policy,
);
state = certifyRoleRefinementV1(
  state,
  { expectedRevision: state.revision, certificate, logicalTimeMs: 15 },
  policy,
).state;

function activate(certified, suffix) {
  const publication = createRoleRefinementPublicationV1(
    {
      publicationId: request.publicationId,
      catalogId: refined.catalogId,
      definitionId: refined.definitionId,
      definitionRevision: refined.definitionRevision,
      predecessorDefinitionDigest: predecessor.definitionDigest,
      refinedDefinitionDigest: refined.definitionDigest,
      certificateDigest: certified.publicationCertificate.certificateDigest,
      publishedAtLogicalMs: 16,
    },
    certified,
  );
  let active = recordRoleRefinementPublicationV1(
    certified,
    { expectedRevision: certified.revision, publication, logicalTimeMs: 16 },
    policy,
  ).state;
  const activation = createRoleRefinementActivationV1(
    {
      activationId: request.activationId,
      publicationDigest: publication.publicationDigest,
      predecessorDefinitionDigest: predecessor.definitionDigest,
      refinedDefinitionDigest: refined.definitionDigest,
      roleBindingId: refined.definitionId,
      roleRevision: refined.definitionRevision,
      roleContentDigest: digest("6"),
      runtimeSessionRevision: 2,
      activatedAtLogicalMs: 17,
      monitoringExpiresAtLogicalMs: 1_000,
    },
    active,
    policy,
  );
  active = recordRoleRefinementActivationV1(
    active,
    { expectedRevision: active.revision, activation, logicalTimeMs: 17 },
    policy,
  ).state;
  return active;
}

function observe(active, suffix, degraded) {
  const observation = createRoleRefinementObservationV1(
    {
      observationId: `observation-${suffix}`,
      requestDigest: request.requestDigest,
      activationDigest: active.activation.activationDigest,
      observerId: "monitor-local",
      observerVersion: 1,
      observerBindingDigest: digest("7"),
      observerTrustDecisionDigest: digest("8"),
      coherenceBps: degraded ? 2_000 : 9_000,
      contributionBps: degraded ? 2_000 : 8_500,
      uncertaintyBps: degraded ? 8_000 : 1_000,
      hardViolation: degraded,
      reasonCodes: [
        degraded ? "hard_constraint_violation" : "healthy_revision",
      ],
      evidenceReferenceIds: [`monitoring-window-${suffix}`],
      observedAtLogicalMs: 18,
      expiresAtLogicalMs: 900,
    },
    active,
    policy,
  );
  return recordRoleRefinementObservationV1(
    active,
    { expectedRevision: active.revision, observation, logicalTimeMs: 18 },
    policy,
  ).state;
}

const confirmedState = observe(activate(state, "healthy"), "healthy", false);
let rollbackState = observe(activate(state, "degraded"), "degraded", true);
const rollbackCertificate = createRoleRefinementCertificateV1(
  {
    certificateId: "certificate-rollback",
    action: "rollback",
    certifierId: "certifier-local",
    certifierVersion: 1,
    certifierBindingDigest: digest("3"),
    requestDigest: request.requestDigest,
    selectionDigest: rollbackState.selection.selectionDigest,
    predecessorDefinitionDigest: predecessor.definitionDigest,
    refinedDefinitionDigest: refined.definitionDigest,
    patchDigest: patch.patchDigest,
    authorityCeilingDigest: authorityCeiling.ceilingDigest,
    activationDigest: rollbackState.activation.activationDigest,
    monitoringDigest: rollbackState.monitoring.monitoringDigest,
    witnessIds: ["witness-local"],
    membershipEpoch: 1,
    membershipConfigurationDigest: digest("4"),
    sourceCertificateDigest: digest("9"),
    certifiedAtLogicalMs: 19,
    expiresAtLogicalMs: 1_000,
  },
  rollbackState,
  policy,
);
rollbackState = certifyRoleRefinementV1(
  rollbackState,
  {
    expectedRevision: rollbackState.revision,
    certificate: rollbackCertificate,
    logicalTimeMs: 19,
  },
  policy,
).state;
const rollback = createRoleRefinementRollbackV1(
  {
    rollbackId: "rollback-local",
    activationDigest: rollbackState.activation.activationDigest,
    monitoringDigest: rollbackState.monitoring.monitoringDigest,
    rollbackCertificateDigest: rollbackCertificate.certificateDigest,
    restoredDefinitionDigest: predecessor.definitionDigest,
    quarantinedDefinitionDigest: refined.definitionDigest,
    runtimeSessionRevision: 3,
    rolledBackAtLogicalMs: 20,
  },
  rollbackState,
);
rollbackState = completeRoleRefinementRollbackV1(
  rollbackState,
  { expectedRevision: rollbackState.revision, rollback, logicalTimeMs: 20 },
  policy,
).state;
rollbackState = quarantineRoleRefinementRevisionV1(
  rollbackState,
  {
    expectedRevision: rollbackState.revision,
    quarantineRecordDigest: digest("0"),
    logicalTimeMs: 20,
  },
  policy,
).state;

console.log(
  JSON.stringify(
    {
      healthyStatus: confirmedState.status,
      degradedStatus: rollbackState.status,
      predecessorRevision: predecessor.definitionRevision,
      refinedRevision: refined.definitionRevision,
      selectedDefinitionDigest: state.selection.selectedDefinitionDigest,
      coordinationStateContainsExactInstructions: JSON.stringify(
        state,
      ).includes("Quantify uncertainty"),
      requiredCapabilityKeys: refined.requiredCapabilityKeys,
    },
    null,
    2,
  ),
);
