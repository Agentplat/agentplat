import {
  createRoleAlignmentRoleAnchorV1,
  createRoleAlignmentStateV1,
  observeRoleAlignmentSignalV1,
  replaceRoleAlignmentRoleV1,
} from "@agentplat/inference-control/role-alignment";
import {
  createRoleAuthorityCeilingV1,
  createRoleCandidateProposalV1,
  createRoleRealignmentCertificateV1,
  createTrustedRoleDefinitionV1,
} from "@agentplat/inference-control/role-realignment";
import { createRoleRealignmentPortableAgentV1 } from "@agentplat/inference-control/role-realignment/portable-agent";
import { digestTrustEligibilityDecisionV1 } from "@agentplat/trust";

const digest = (character) => `sha256:${character.repeat(64)}`;
const trustDigest = (character) => character.repeat(64);

const alignmentPolicy = {
  schemaVersion: 1,
  policyId: "alignment:example",
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

const realignmentPolicy = {
  schemaVersion: 1,
  policyId: "realignment:example",
  policyVersion: 1,
  parentPolicyDigest: null,
  minimumIndependentEvaluations: 2,
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

const initialRole = {
  schemaVersion: 1,
  roleBindingId: "role:observer:1",
  roleRevision: 1,
  predecessorRoleBindingId: null,
  objectiveId: "objective:review",
  roleKey: "observer",
  instructions: ["Inspect evidence."],
  constraints: { externalWrites: false },
  validFromLogicalMs: 0,
  validUntilLogicalMs: 20_000,
};

let alignmentState = createRoleAlignmentStateV1({
  controllerId: "alignment:example",
  controllerVersion: 1,
  implementationId: "alignment:example:v1",
  policy: alignmentPolicy,
  roleAnchor: createRoleAlignmentRoleAnchorV1({
    tenantId: "tenant:example",
    sessionId: "session:example",
    agentId: "agent:example",
    objectiveId: initialRole.objectiveId,
    roleBindingId: initialRole.roleBindingId,
    roleRevision: initialRole.roleRevision,
    predecessorRoleBindingId: initialRole.predecessorRoleBindingId,
    roleKey: initialRole.roleKey,
    roleContent: {
      instructions: initialRole.instructions,
      constraints: initialRole.constraints,
      validFromLogicalMs: initialRole.validFromLogicalMs,
      validUntilLogicalMs: initialRole.validUntilLogicalMs,
    },
  }),
  createdAtLogicalMs: 0,
});

for (let sequence = 1; sequence <= 2; sequence += 1) {
  alignmentState = observeRoleAlignmentSignalV1(
    alignmentState,
    {
      expectedRevision: alignmentState.revision,
      signal: {
        schemaVersion: 1,
        signalId: `signal:${sequence}`,
        assessmentRequestId: `assessment:${sequence}`,
        assessorId: "assessor:example",
        assessorVersion: 1,
        assessorBindingDigest: digest("a"),
        tenantId: alignmentState.tenantId,
        sessionId: alignmentState.sessionId,
        agentId: alignmentState.agentId,
        stepId: `step:${sequence}`,
        checkpoint: "pre_step",
        roleAnchorDigest: alignmentState.roleAnchor.anchorDigest,
        roleRevision: alignmentState.roleAnchor.roleRevision,
        targetDigest: digest(String(sequence)),
        coherenceBps: 6_000,
        uncertaintyBps: 1_000,
        contextInconsistencyBps: 500,
        hardViolation: false,
        reasonCodes: ["role_drift"],
        evidenceReferenceIds: [`evidence:${sequence}`],
        observedAtLogicalMs: sequence,
        expiresAtLogicalMs: sequence + 1_000,
      },
    },
    alignmentPolicy,
  ).state;
}

const trustedDefinition = createTrustedRoleDefinitionV1({
  catalogId: "catalog:local",
  definitionId: "role:evidence-reviewer",
  definitionRevision: 1,
  predecessorDefinitionDigest: null,
  roleKey: "evidence-reviewer",
  instructions: ["Resolve inconsistent evidence."],
  constraints: { externalWrites: false },
  requiredCapabilityKeys: ["evidence.read"],
  requiredResourceClasses: ["local.evidence"],
  maximumActionBudgetUnits: 5,
  validFromLogicalMs: 0,
  validUntilLogicalMs: 10_000,
});

let session = {
  sessionId: "session:example",
  tenantId: "tenant:example",
  agentId: "agent:example",
  objectiveId: "objective:review",
  role: initialRole,
  status: "active",
  revision: 1,
};

const alignment = {
  async getState() {
    return alignmentState;
  },
  async activateSessionRole(input) {
    const role = input.role;
    alignmentState = replaceRoleAlignmentRoleV1(
      alignmentState,
      {
        expectedRevision: input.expectedRevision,
        roleAnchor: createRoleAlignmentRoleAnchorV1({
          tenantId: input.tenantId,
          sessionId: input.sessionId,
          agentId: input.agentId,
          objectiveId: role.objectiveId,
          roleBindingId: role.roleBindingId,
          roleRevision: role.roleRevision,
          predecessorRoleBindingId: role.predecessorRoleBindingId,
          roleKey: role.roleKey,
          roleContent: {
            instructions: role.instructions,
            constraints: role.constraints,
            validFromLogicalMs: role.validFromLogicalMs,
            validUntilLogicalMs: role.validUntilLogicalMs,
          },
        }),
        logicalTimeMs: input.logicalTimeMs,
      },
      alignmentPolicy,
    );
    return alignmentState;
  },
};

const runtime = {
  async getSession() {
    return session;
  },
  async updateRole(_sessionId, role, expectedRevision) {
    if (session.revision !== expectedRevision)
      throw new Error("revision conflict");
    session = { ...session, role, revision: session.revision + 1 };
    return session;
  },
};

function eligibleDecision(logicalTimeMs) {
  const decision = {
    schemaVersion: 1,
    eligibilityDecisionId: "pending",
    requestDigest: trustDigest("1"),
    subjectDigest: trustDigest("2"),
    scopeDigest: trustDigest("3"),
    policyDigest: trustDigest("4"),
    profileId: `profile:${trustDigest("5")}`,
    profileDigest: trustDigest("5"),
    quarantineRecordIds: [],
    evaluatedAtLogicalMs: logicalTimeMs,
    disposition: "eligible",
    requirementResults: [],
    reasonCodes: [],
  };
  return {
    ...decision,
    eligibilityDecisionId: `eligibility-decision:${digestTrustEligibilityDecisionV1(decision)}`,
  };
}

const proposerBindingDigest = digest("b");
const realignment = createRoleRealignmentPortableAgentV1({
  controllerId: "realignment:example",
  controllerVersion: 1,
  implementationId: "realignment:example:v1",
  policy: realignmentPolicy,
  alignmentPolicy,
  alignment,
  runtime,
  discovery: [
    {
      proposerId: "discovery:local",
      proposerVersion: 1,
      proposerBindingDigest,
      propose({ request, logicalTimeMs }) {
        return [
          createRoleCandidateProposalV1({
            proposalId: "proposal:evidence-reviewer",
            requestDigest: request.requestDigest,
            proposerId: "discovery:local",
            proposerVersion: 1,
            proposerBindingDigest,
            definitionId: trustedDefinition.definitionId,
            definitionRevision: trustedDefinition.definitionRevision,
            definitionDigest: trustedDefinition.definitionDigest,
            reasonCodes: ["catalog_match"],
            evidenceReferenceIds: ["evidence:role-gap"],
            proposedAtLogicalMs: logicalTimeMs,
            expiresAtLogicalMs: logicalTimeMs + 4_000,
          }),
        ];
      },
    },
  ],
  catalog: { resolve: () => trustedDefinition },
  evaluators: ["c", "d"].map((character) => ({
    evaluatorId: `evaluator:${character}`,
    evaluatorVersion: 1,
    evaluatorBindingDigest: digest(character),
    evaluate: () => ({
      eligible: true,
      roleFitBps: 9_000,
      missionContributionBps: 8_500,
      uncertaintyBps: 1_000,
      transitionRiskBps: 1_000,
      reasonCodes: ["candidate_supported"],
      evidenceReferenceIds: ["evidence:candidate"],
    }),
  })),
  trustEligibility: {
    evaluate: ({ logicalTimeMs }) => eligibleDecision(logicalTimeMs),
  },
  certification: {
    certify({ state, logicalTimeMs, expiresAtLogicalMs }) {
      return createRoleRealignmentCertificateV1({
        certificateId: "certificate:local",
        certificationKind: "local_policy",
        certifierId: "certifier:local",
        certifierVersion: 1,
        certifierBindingDigest: digest("e"),
        requestDigest: state.request.requestDigest,
        selectionDigest: state.selection.selectionDigest,
        selectedCandidateDigest: state.selection.selectedCandidateDigest,
        selectedDefinitionDigest: state.selection.selectedDefinitionDigest,
        authorityCeilingDigest: state.request.authorityCeiling.ceilingDigest,
        witnessIds: ["witness:local"],
        membershipEpoch: null,
        membershipConfigurationDigest: null,
        sourceCertificateDigest: digest("f"),
        certifiedAtLogicalMs: logicalTimeMs,
        expiresAtLogicalMs,
      });
    },
  },
  requestTtlMs: 5_000,
  evaluationTtlMs: 4_000,
  certificationTtlMs: 4_000,
});

const result = await realignment.run({
  sessionId: "session:example",
  requestId: "request:example",
  selectionId: "selection:example",
  activationId: "activation:example",
  authorityCeiling: createRoleAuthorityCeilingV1({
    mandateDigest: digest("9"),
    capabilityKeys: ["evidence.read", "evidence.review"],
    resourceClasses: ["local.evidence"],
    maximumActionBudgetUnits: 10,
    validUntilLogicalMs: 10_000,
  }),
  logicalTimeMs: 3,
});

console.log(
  JSON.stringify(
    {
      status: result.status,
      selectedDefinitionDigest: result.selection.selectedDefinitionDigest,
      role: {
        roleBindingId: session.role.roleBindingId,
        roleRevision: session.role.roleRevision,
        predecessorRoleBindingId: session.role.predecessorRoleBindingId,
        roleKey: session.role.roleKey,
      },
      alignmentStatus: alignmentState.status,
      eventTypes: result.events.map(({ eventType }) => eventType),
    },
    null,
    2,
  ),
);
