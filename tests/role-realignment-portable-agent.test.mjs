import assert from "node:assert/strict";
import test from "node:test";

import { createRoleAlignmentPortableAgentControlV1 } from "@agentplat/inference-control/role-alignment/portable-agent";
import {
  createRoleAuthorityCeilingV1,
  createRoleCandidateProposalV1,
  createRoleRealignmentCertificateV1,
  createTrustedRoleDefinitionV1,
} from "@agentplat/inference-control/role-realignment";
import { createRoleRealignmentPortableAgentV1 } from "@agentplat/inference-control/role-realignment/portable-agent";
import {
  PortableAgentAdapterRegistryV1,
  PortableAgentSessionRuntimeV1,
} from "@agentplat/runtime/adapter";
import { digestTrustEligibilityDecisionV1 } from "@agentplat/trust";

const digest = (character) => `sha256:${character.repeat(64)}`;

const alignmentPolicy = {
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

const realignmentPolicy = {
  schemaVersion: 1,
  policyId: "role-realignment-policy",
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

const manifest = {
  schemaVersion: 1,
  adapterId: "adapter-a",
  adapterVersion: "1.0.0",
  implementationId: "adapter-build-a",
  agentKinds: ["hybrid"],
  inputModalities: ["structured"],
  outputModalities: ["text"],
  interactionModes: ["observe_act"],
  controlPoints: ["pre_step"],
  supportsCancellation: true,
  supportsCheckpoint: false,
  supportsRestore: false,
  maximumObservationBytes: 65_536,
  maximumOutputBytes: 65_536,
  maximumActionBytes: 65_536,
  maximumStepsPerSession: 100,
};

const initialRole = {
  schemaVersion: 1,
  roleBindingId: "role-observer-1",
  roleRevision: 1,
  predecessorRoleBindingId: null,
  objectiveId: "objective-a",
  roleKey: "observer",
  instructions: ["Inspect evidence."],
  constraints: { externalWrites: false },
  validFromLogicalMs: 0,
  validUntilLogicalMs: 20_000,
};

function eligibleTrustDecision(logicalTimeMs) {
  const trustDigest = (character) => character.repeat(64);
  const value = {
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
    ...value,
    eligibilityDecisionId: `eligibility-decision:${digestTrustEligibilityDecisionV1(value)}`,
  };
}

function controlTarget(logicalTimeMs) {
  return {
    schemaVersion: 1,
    checkpoint: "pre_step",
    stepSequence: 1,
    manifest,
    sessionId: "session-a",
    tenantId: "tenant-a",
    agentId: "agent-a",
    role: initialRole,
    request: {
      schemaVersion: 1,
      stepId: `step-${logicalTimeMs}`,
      expectedSessionRevision: 0,
      interactionMode: "observe_act",
      observations: [],
      input: { inspect: true },
      requestedOutputModalities: ["text"],
      logicalTimeMs,
    },
    output: null,
    actionProposal: null,
  };
}

test("portable orchestration closes discovery through certified activation and resumes exactly", async () => {
  const alignment = createRoleAlignmentPortableAgentControlV1({
    controlId: "alignment-control",
    controlVersion: 1,
    implementationId: "alignment-build-a",
    policy: alignmentPolicy,
    assessorBinding: {
      schemaVersion: 1,
      assessorId: "assessor-a",
      assessorVersion: 1,
      assessorBindingDigest: digest("a"),
    },
    assessmentTtlMs: 1_000,
    assessor: {
      assess(request) {
        return {
          schemaVersion: 1,
          assessmentId: `assessment-${request.stateRevision + 1}`,
          assessmentRequestId: request.assessmentRequestId,
          targetDigest: request.targetDigest,
          assessorId: "assessor-a",
          assessorVersion: 1,
          assessorBindingDigest: digest("a"),
          coherenceBps: 6_000,
          uncertaintyBps: 1_000,
          contextInconsistencyBps: 500,
          hardViolation: false,
          reasonCodes: ["role_drift"],
          evidenceReferenceIds: ["evidence-drift"],
          assessedAtLogicalMs: request.createdAtLogicalMs,
        };
      },
    },
  });
  const registry = new PortableAgentAdapterRegistryV1().register({
    manifest,
    adapter: {
      async step(input) {
        return {
          schemaVersion: 1,
          sessionId: input.sessionId,
          stepId: input.request.stepId,
          stepSequence: input.stepSequence,
          status: "completed",
          outputs: [],
          actionProposals: [],
          checkpoint: null,
          reasonCode: null,
          metadata: {},
        };
      },
    },
  });
  const runtime = new PortableAgentSessionRuntimeV1({
    registry,
    control: alignment,
  });
  await runtime.createSession({
    sessionId: "session-a",
    tenant: { tenantId: "tenant-a" },
    agentId: "agent-a",
    adapterId: "adapter-a",
    adapterVersion: "1.0.0",
    requirements: {
      agentKinds: ["hybrid"],
      inputModalities: ["structured"],
      outputModalities: ["text"],
      interactionMode: "observe_act",
      controlPoints: ["pre_step"],
      requireCancellation: true,
    },
    role: initialRole,
  });
  await alignment.evaluate(controlTarget(1));
  await alignment.evaluate(controlTarget(2));
  assert.equal(
    (await alignment.getState("session-a")).status,
    "realignment_required",
  );

  const definition = createTrustedRoleDefinitionV1({
    catalogId: "catalog-local",
    definitionId: "evidence-reviewer",
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
  const discoveryBinding = digest("b");
  const evaluators = ["c", "d"].map((character) => ({
    evaluatorId: `evaluator-${character}`,
    evaluatorVersion: 1,
    evaluatorBindingDigest: digest(character),
    evaluate() {
      return {
        eligible: true,
        roleFitBps: 9_000,
        missionContributionBps: 8_500,
        uncertaintyBps: 1_000,
        transitionRiskBps: 1_000,
        reasonCodes: ["candidate_supported"],
        evidenceReferenceIds: ["evidence-candidate"],
      };
    },
  }));
  const orchestrator = createRoleRealignmentPortableAgentV1({
    controllerId: "role-realignment-control",
    controllerVersion: 1,
    implementationId: "role-realignment-build-a",
    policy: realignmentPolicy,
    alignmentPolicy,
    alignment,
    runtime,
    discovery: [
      {
        proposerId: "discovery-local",
        proposerVersion: 1,
        proposerBindingDigest: discoveryBinding,
        propose({ request, logicalTimeMs }) {
          return [
            createRoleCandidateProposalV1({
              proposalId: "proposal-reviewer",
              requestDigest: request.requestDigest,
              proposerId: "discovery-local",
              proposerVersion: 1,
              proposerBindingDigest: discoveryBinding,
              definitionId: definition.definitionId,
              definitionRevision: definition.definitionRevision,
              definitionDigest: definition.definitionDigest,
              reasonCodes: ["catalog_match"],
              evidenceReferenceIds: ["evidence-role-gap"],
              proposedAtLogicalMs: logicalTimeMs,
              expiresAtLogicalMs: logicalTimeMs + 4_000,
            }),
          ];
        },
      },
    ],
    catalog: {
      resolve() {
        return definition;
      },
    },
    evaluators,
    trustEligibility: {
      evaluate({ logicalTimeMs }) {
        return eligibleTrustDecision(logicalTimeMs);
      },
    },
    certification: {
      certify({ state, logicalTimeMs, expiresAtLogicalMs }) {
        return createRoleRealignmentCertificateV1({
          certificateId: "certificate-local",
          certificationKind: "local_policy",
          certifierId: "certifier-local",
          certifierVersion: 1,
          certifierBindingDigest: digest("e"),
          requestDigest: state.request.requestDigest,
          selectionDigest: state.selection.selectionDigest,
          selectedCandidateDigest: state.selection.selectedCandidateDigest,
          selectedDefinitionDigest: state.selection.selectedDefinitionDigest,
          authorityCeilingDigest: state.request.authorityCeiling.ceilingDigest,
          witnessIds: ["witness-local"],
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
    observer: {
      observe() {
        throw new Error("observer unavailable");
      },
    },
  });
  const authorityCeiling = createRoleAuthorityCeilingV1({
    mandateDigest: digest("9"),
    capabilityKeys: ["evidence.read", "evidence.review"],
    resourceClasses: ["local.evidence"],
    maximumActionBudgetUnits: 10,
    validUntilLogicalMs: 10_000,
  });
  const result = await orchestrator.run({
    sessionId: "session-a",
    requestId: "request-a",
    selectionId: "selection-a",
    activationId: "activation-a",
    authorityCeiling,
    logicalTimeMs: 3,
  });
  assert.equal(result.status, "activated");
  assert.equal(result.activation.roleBinding.roleKey, "evidence-reviewer");
  assert.equal((await runtime.getSession("session-a")).role.roleRevision, 2);
  assert.equal((await alignment.getState("session-a")).status, "active");
  assert.equal(
    (
      await orchestrator.run({
        sessionId: "session-a",
        requestId: "request-a",
        selectionId: "selection-a",
        activationId: "activation-a",
        authorityCeiling,
        logicalTimeMs: 4,
      })
    ).stateDigest,
    result.stateDigest,
  );

  const checkpointTransfer = {
    schemaVersion: 1,
    contentClass: "portable_application_state",
    tenantId: "tenant-a",
    objectiveId: "objective-a",
    sourceSessionId: "session-a",
    sourceAgentId: "agent-a",
    sourceSessionRevision: (await runtime.getSession("session-a")).revision,
    roleBindingId: result.activation.roleBinding.roleBindingId,
    adapterId: "adapter-a",
    adapterVersion: "1.0.0",
    implementationId: "adapter-build-a",
    checkpoint: {
      schemaVersion: 1,
      checkpointId: "checkpoint-a",
      sessionId: "session-a",
      adapterId: "adapter-a",
      adapterVersion: "1.0.0",
      implementationId: "adapter-build-a",
      throughStepSequence: 0,
      stateReference: "memory://checkpoint-a",
      stateDigest: digest("8"),
      createdAt: "2026-08-05T00:00:00.000Z",
    },
    state: { cursor: 0 },
    exportedAt: "2026-08-05T00:00:00.000Z",
  };
  const [alignmentHandoff, realignmentHandoff] = await Promise.all([
    alignment.exportHandoff({
      sessionId: "session-a",
      checkpointTransfer,
      logicalTimeMs: 5,
    }),
    orchestrator.exportHandoff({
      sessionId: "session-a",
      checkpointTransfer,
      logicalTimeMs: 5,
    }),
  ]);
  const targetAlignment = await alignment.importHandoff({
    handoff: alignmentHandoff,
    checkpointTransfer,
    targetSessionId: "session-b",
    targetAgentId: "agent-b",
    targetRole: result.activation.roleBinding,
    logicalTimeMs: 6,
  });
  const rebound = await orchestrator.importHandoff({
    handoff: realignmentHandoff,
    checkpointTransfer,
    targetAlignmentState: targetAlignment,
    logicalTimeMs: 6,
  });
  assert.equal(rebound.status, "activated");
  assert.equal(rebound.originSessionId, "session-a");
  assert.equal(rebound.activeSessionId, "session-b");
  assert.equal(rebound.activeAgentId, "agent-b");
  assert.equal(rebound.events.at(-1).eventType, "session_rebound");
  assert.equal(await orchestrator.getState("session-a"), undefined);
  assert.equal(
    (await orchestrator.getState("session-b")).stateDigest,
    rebound.stateDigest,
  );
});
