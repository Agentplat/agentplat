import assert from "node:assert/strict";
import test from "node:test";

import { createRoleAlignmentPortableAgentControlV1 } from "@agentplat/inference-control/role-alignment/portable-agent";
import {
  createRoleRefinementCertificateV1,
  createRoleRefinementPatchV1,
  createRoleRefinementProposalV1,
  materializeRefinedRoleDefinitionV1,
} from "@agentplat/inference-control/role-refinement";
import {
  InMemoryGovernedRoleRevisionCatalogV1,
  InMemoryRoleRefinementDraftRepositoryV1,
  InMemoryRoleRefinementStateStoreV1,
  createRoleRefinementPortableAgentV1,
} from "@agentplat/inference-control/role-refinement/portable-agent";
import {
  createRoleAuthorityCeilingV1,
  createTrustedRoleDefinitionV1,
} from "@agentplat/inference-control/role-realignment";
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

const refinementPolicy = {
  schemaVersion: 1,
  policyId: "refinement-policy",
  policyVersion: 1,
  minimumIndependentEvaluations: 2,
  minimumCertificationWitnesses: 2,
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

const predecessor = createTrustedRoleDefinitionV1({
  catalogId: "catalog-local",
  definitionId: "investigator-role",
  definitionRevision: 1,
  predecessorDefinitionDigest: null,
  roleKey: "investigator",
  instructions: ["Inspect evidence."],
  constraints: { externalWrites: false },
  requiredCapabilityKeys: ["evidence.read", "evidence.review"],
  requiredResourceClasses: ["local.evidence"],
  maximumActionBudgetUnits: 8,
  validFromLogicalMs: 0,
  validUntilLogicalMs: 10_000,
});

const initialRole = {
  schemaVersion: 1,
  roleBindingId: predecessor.definitionId,
  roleRevision: predecessor.definitionRevision,
  predecessorRoleBindingId: null,
  objectiveId: "objective-a",
  roleKey: predecessor.roleKey,
  instructions: predecessor.instructions,
  constraints: predecessor.constraints,
  validFromLogicalMs: predecessor.validFromLogicalMs,
  validUntilLogicalMs: predecessor.validUntilLogicalMs,
};

function eligibleTrustDecision(logicalTimeMs) {
  const raw = (character) => character.repeat(64);
  const value = {
    schemaVersion: 1,
    eligibilityDecisionId: "pending",
    requestDigest: raw("1"),
    subjectDigest: raw("2"),
    scopeDigest: raw("3"),
    policyDigest: raw("4"),
    profileId: `profile:${raw("5")}`,
    profileDigest: raw("5"),
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

async function createFixture({
  degraded,
  certificationEnabled = true,
  stateStore = new InMemoryRoleRefinementStateStoreV1(),
}) {
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
    adapterId: manifest.adapterId,
    adapterVersion: manifest.adapterVersion,
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

  const catalog = new InMemoryGovernedRoleRevisionCatalogV1({
    definitions: [predecessor],
    realignmentPolicy,
  });
  const drafts = new InMemoryRoleRefinementDraftRepositoryV1();
  let mayCertify = certificationEnabled;
  const proposerBindingDigest = digest("b");
  const semanticBindingDigest = digest("c");
  const monitorBindingDigest = digest("d");
  const evaluatorSpecs = [
    ["evaluator-a", digest("e")],
    ["evaluator-b", digest("f")],
  ];
  const options = {
    controllerId: "refinement-control",
    controllerVersion: 1,
    implementationId: "refinement-build-a",
    policy: refinementPolicy,
    realignmentPolicy,
    alignmentPolicy,
    alignment,
    runtime,
    strategies: [
      {
        proposerId: "strategy-local",
        proposerVersion: 1,
        proposerBindingDigest,
        propose({ request, predecessor: current, logicalTimeMs }) {
          const patch = createRoleRefinementPatchV1(
            {
              predecessorDefinitionDigest: current.definitionDigest,
              operations: [
                {
                  operationId: "operation-add-review",
                  kind: "instruction_insert",
                  index: 1,
                  instruction: "Quantify uncertainty before conclusions.",
                },
              ],
              authority: {
                requiredCapabilityKeys: ["evidence.read"],
                requiredResourceClasses: ["local.evidence"],
                maximumActionBudgetUnits: 6,
                validUntilLogicalMs: 9_000,
              },
            },
            current,
            refinementPolicy,
            realignmentPolicy,
          );
          const definition = materializeRefinedRoleDefinitionV1({
            predecessor: current,
            patch,
            authorityCeiling: request.authorityCeiling,
            policy: refinementPolicy,
            realignmentPolicy,
          });
          return [
            createRoleRefinementProposalV1(
              {
                proposalId: "proposal-local",
                requestDigest: request.requestDigest,
                proposerId: "strategy-local",
                proposerVersion: 1,
                proposerBindingDigest,
                patch,
                refinedDefinitionDigest: definition.definitionDigest,
                reasonCodes: ["evidence_supported"],
                evidenceReferenceIds: ["evidence-drift"],
                proposedAtLogicalMs: logicalTimeMs,
                expiresAtLogicalMs: logicalTimeMs + 4_000,
              },
              request,
              current,
              refinementPolicy,
              realignmentPolicy,
            ),
          ];
        },
      },
    ],
    semanticValidator: {
      validatorId: "semantic-local",
      validatorVersion: 1,
      validatorBindingDigest: semanticBindingDigest,
      validate() {
        return {
          accepted: true,
          objectiveAligned: true,
          constraintsNotWeaker: true,
          reasonCodes: ["semantically_valid"],
          evidenceReferenceIds: ["evidence-drift"],
        };
      },
    },
    evaluators: evaluatorSpecs.map(([evaluatorId, evaluatorBindingDigest]) => ({
      evaluatorId,
      evaluatorVersion: 1,
      evaluatorBindingDigest,
      evaluate() {
        return {
          eligible: true,
          predictedCoherenceBps: 8_700,
          predictedContributionBps: 8_200,
          uncertaintyBps: 1_000,
          transitionRiskBps: 1_000,
          reasonCodes: ["candidate_supported"],
          evidenceReferenceIds: ["evidence-drift"],
        };
      },
    })),
    monitor: {
      observerId: "monitor-local",
      observerVersion: 1,
      observerBindingDigest: monitorBindingDigest,
      observe() {
        return degraded
          ? {
              coherenceBps: 2_000,
              contributionBps: 2_000,
              uncertaintyBps: 8_000,
              hardViolation: true,
              reasonCodes: ["hard_constraint_violation"],
              evidenceReferenceIds: ["monitoring-window-1"],
            }
          : {
              coherenceBps: 9_000,
              contributionBps: 8_500,
              uncertaintyBps: 1_000,
              hardViolation: false,
              reasonCodes: ["healthy_revision"],
              evidenceReferenceIds: ["monitoring-window-1"],
            };
      },
    },
    trustEligibility: {
      evaluate({ logicalTimeMs }) {
        return eligibleTrustDecision(logicalTimeMs);
      },
    },
    drafts,
    catalog,
    stateStore,
    certification: {
      certify({ action, state, policy, logicalTimeMs, expiresAtLogicalMs }) {
        if (!mayCertify) return null;
        return createRoleRefinementCertificateV1(
          {
            certificateId: `certificate-${action}`,
            action,
            certifierId: "certifier-local",
            certifierVersion: 1,
            certifierBindingDigest: digest("8"),
            requestDigest: state.request.requestDigest,
            selectionDigest: state.selection.selectionDigest,
            predecessorDefinitionDigest:
              state.request.predecessorDefinitionDigest,
            refinedDefinitionDigest: state.selection.selectedDefinitionDigest,
            patchDigest: state.selection.selectedPatchDigest,
            authorityCeilingDigest:
              state.request.authorityCeiling.ceilingDigest,
            activationDigest:
              action === "rollback" ? state.activation.activationDigest : null,
            monitoringDigest:
              action === "rollback" ? state.monitoring.monitoringDigest : null,
            witnessIds: ["witness-a", "witness-b"],
            membershipEpoch: 1,
            membershipConfigurationDigest: digest("9"),
            sourceCertificateDigest: digest("7"),
            certifiedAtLogicalMs: logicalTimeMs,
            expiresAtLogicalMs,
          },
          state,
          policy,
        );
      },
    },
    requestTtlMs: 5_000,
    evaluationTtlMs: 4_000,
    semanticDecisionTtlMs: 4_000,
    certificationTtlMs: 4_000,
    observationTtlMs: 2_000,
    monitoringTtlMs: 4_000,
    maximumStateBytes: 16_777_216,
  };
  const orchestrator = createRoleRefinementPortableAgentV1(options);
  const authorityCeiling = createRoleAuthorityCeilingV1({
    mandateDigest: digest("6"),
    capabilityKeys: ["evidence.read", "evidence.review"],
    resourceClasses: ["local.evidence"],
    maximumActionBudgetUnits: 8,
    validUntilLogicalMs: 10_000,
  });
  const input = {
    sessionId: "session-a",
    requestId: "request-a",
    selectionId: "selection-a",
    publicationId: "publication-a",
    activationId: "activation-a",
    rollbackId: "rollback-a",
    predecessorCatalogId: predecessor.catalogId,
    predecessorDefinitionId: predecessor.definitionId,
    predecessorDefinitionRevision: predecessor.definitionRevision,
    predecessorDefinitionDigest: predecessor.definitionDigest,
    authorityCeiling,
    logicalTimeMs: 3,
  };
  return {
    orchestrator,
    runtime,
    alignment,
    catalog,
    input,
    options,
    enableCertification() {
      mayCertify = true;
    },
  };
}

test("portable refinement publishes, activates, monitors and confirms one exact revision", async () => {
  const fixture = await createFixture({ degraded: false });
  const state = await fixture.orchestrator.run(fixture.input);
  assert.equal(state.status, "confirmed");
  assert.equal(state.publication.definitionRevision, 2);
  assert.equal(
    state.activation.refinedDefinitionDigest,
    state.selection.selectedDefinitionDigest,
  );
  assert.equal(
    (await fixture.runtime.getSession("session-a")).role.roleRevision,
    2,
  );
  assert.equal(
    (await fixture.alignment.getState("session-a")).roleAnchor.roleRevision,
    2,
  );
  const replay = await fixture.orchestrator.run({
    ...fixture.input,
    logicalTimeMs: 4,
  });
  assert.equal(replay.stateDigest, state.stateDigest);
});

test("degraded provisional activation is certified, rolled back and quarantined", async () => {
  const fixture = await createFixture({ degraded: true });
  const state = await fixture.orchestrator.run(fixture.input);
  assert.equal(state.status, "quarantined");
  assert.equal(
    state.rollback.restoredDefinitionDigest,
    predecessor.definitionDigest,
  );
  assert.equal(
    (await fixture.runtime.getSession("session-a")).role.roleRevision,
    1,
  );
  assert.equal(
    (await fixture.alignment.getState("session-a")).roleAnchor.roleRevision,
    1,
  );
  assert.equal(
    await fixture.catalog.isQuarantined(
      state.rollback.quarantinedDefinitionDigest,
    ),
    true,
  );
  assert.equal(state.rollbackCertificate.action, "rollback");
});

test("a crash after catalog quarantine resumes from the durable rolled-back state", async () => {
  const durable = new InMemoryRoleRefinementStateStoreV1();
  let failQuarantinedSave = true;
  const stateStore = {
    load(sessionId) {
      return durable.load(sessionId);
    },
    async save(state, expectedRevision) {
      if (state.status === "quarantined" && failQuarantinedSave) {
        failQuarantinedSave = false;
        throw new Error("simulated_quarantine_state_write_failure");
      }
      await durable.save(state, expectedRevision);
    },
    rebind(input) {
      return durable.rebind(input);
    },
  };
  const fixture = await createFixture({ degraded: true, stateStore });
  await assert.rejects(
    fixture.orchestrator.run(fixture.input),
    /simulated_quarantine_state_write_failure/u,
  );
  const partial = await durable.load("session-a");
  assert.equal(partial.status, "rolled_back");
  assert.equal(
    await fixture.catalog.isQuarantined(
      partial.rollback.quarantinedDefinitionDigest,
    ),
    true,
  );
  const restarted = createRoleRefinementPortableAgentV1(fixture.options);
  const recovered = await restarted.run({ ...fixture.input, logicalTimeMs: 4 });
  assert.equal(recovered.status, "quarantined");
  assert.equal(
    recovered.rollback.rollbackDigest,
    partial.rollback.rollbackDigest,
  );
});

test("an expired publication certificate terminates without publishing or activating", async () => {
  const durable = new InMemoryRoleRefinementStateStoreV1();
  let stopAfterCertification = true;
  const stateStore = {
    load(sessionId) {
      return durable.load(sessionId);
    },
    async save(state, expectedRevision) {
      await durable.save(state, expectedRevision);
      if (state.status === "certified" && stopAfterCertification) {
        stopAfterCertification = false;
        throw new Error("simulated_stop_after_publication_certification");
      }
    },
    rebind(input) {
      return durable.rebind(input);
    },
  };
  const fixture = await createFixture({ degraded: false, stateStore });
  await assert.rejects(
    fixture.orchestrator.run(fixture.input),
    /simulated_stop_after_publication_certification/u,
  );
  const certified = await durable.load("session-a");
  assert.equal(certified.status, "certified");
  const restarted = createRoleRefinementPortableAgentV1(fixture.options);
  const expired = await restarted.run({
    ...fixture.input,
    logicalTimeMs: certified.publicationCertificate.expiresAtLogicalMs,
  });
  assert.equal(expired.status, "expired");
  assert.equal(
    await fixture.catalog.resolve({
      catalogId: certified.request.predecessorCatalogId,
      definitionId: certified.request.predecessorDefinitionId,
      definitionRevision: certified.request.predecessorDefinitionRevision + 1,
      definitionDigest: certified.selection.selectedDefinitionDigest,
      logicalTimeMs: expired.lastLogicalTimeMs,
    }),
    null,
  );
  assert.equal(
    (await fixture.runtime.getSession("session-a")).role.roleRevision,
    1,
  );
});

test("an expired rollback certificate is replaced before restoration", async () => {
  const durable = new InMemoryRoleRefinementStateStoreV1();
  let stopAfterRollbackCertification = true;
  const stateStore = {
    load(sessionId) {
      return durable.load(sessionId);
    },
    async save(state, expectedRevision) {
      await durable.save(state, expectedRevision);
      if (
        state.status === "rollback_certified" &&
        stopAfterRollbackCertification
      ) {
        stopAfterRollbackCertification = false;
        throw new Error("simulated_stop_after_rollback_certification");
      }
    },
    rebind(input) {
      return durable.rebind(input);
    },
  };
  const fixture = await createFixture({ degraded: true, stateStore });
  await assert.rejects(
    fixture.orchestrator.run(fixture.input),
    /simulated_stop_after_rollback_certification/u,
  );
  const certified = await durable.load("session-a");
  assert.equal(certified.status, "rollback_certified");
  assert.equal(
    (await fixture.runtime.getSession("session-a")).role.roleRevision,
    2,
  );
  const expiredCertificateDigest =
    certified.rollbackCertificate.certificateDigest;
  const restarted = createRoleRefinementPortableAgentV1(fixture.options);
  const recovered = await restarted.run({
    ...fixture.input,
    logicalTimeMs: certified.rollbackCertificate.expiresAtLogicalMs,
  });
  assert.equal(recovered.status, "quarantined");
  assert.notEqual(
    recovered.rollbackCertificate.certificateDigest,
    expiredCertificateDigest,
  );
  assert.equal(
    (await fixture.runtime.getSession("session-a")).role.roleRevision,
    1,
  );
});

test("a restarted orchestrator resumes an exact partially completed refinement", async () => {
  const fixture = await createFixture({
    degraded: false,
    certificationEnabled: false,
  });
  const partial = await fixture.orchestrator.run(fixture.input);
  assert.equal(partial.status, "selected");
  assert.equal(
    (await fixture.runtime.getSession("session-a")).role.roleRevision,
    1,
  );
  fixture.enableCertification();
  const restarted = createRoleRefinementPortableAgentV1(fixture.options);
  const completed = await restarted.run({ ...fixture.input, logicalTimeMs: 4 });
  assert.equal(completed.status, "confirmed");
  assert.equal(
    completed.selection.selectionDigest,
    partial.selection.selectionDigest,
  );
  assert.equal(
    completed.events[partial.events.length - 1].eventDigest,
    partial.events.at(-1).eventDigest,
  );
});

test("a restarted orchestrator rejects substituted operation identifiers before external effects", async () => {
  const fixture = await createFixture({
    degraded: false,
    certificationEnabled: false,
  });
  const partial = await fixture.orchestrator.run(fixture.input);
  assert.equal(partial.status, "selected");
  fixture.enableCertification();
  const restarted = createRoleRefinementPortableAgentV1(fixture.options);
  await assert.rejects(
    restarted.run({
      ...fixture.input,
      publicationId: "publication-substituted",
      logicalTimeMs: 4,
    }),
    /role_refinement_run_binding_mismatch/u,
  );
  assert.equal(
    (await restarted.getState("session-a")).stateDigest,
    partial.stateDigest,
  );
  assert.equal(
    (await fixture.runtime.getSession("session-a")).role.roleRevision,
    1,
  );
  assert.equal(
    (await fixture.alignment.getState("session-a")).roleAnchor.roleRevision,
    1,
  );
});

test("handoff rebinds confirmed state only after exact local artifact resolution", async () => {
  const fixture = await createFixture({ degraded: false });
  const confirmed = await fixture.orchestrator.run(fixture.input);
  const session = await fixture.runtime.getSession("session-a");
  const checkpointTransfer = {
    schemaVersion: 1,
    contentClass: "portable_application_state",
    tenantId: "tenant-a",
    objectiveId: "objective-a",
    sourceSessionId: "session-a",
    sourceAgentId: "agent-a",
    sourceSessionRevision: session.revision,
    roleBindingId: session.role.roleBindingId,
    adapterId: manifest.adapterId,
    adapterVersion: manifest.adapterVersion,
    implementationId: manifest.implementationId,
    checkpoint: {
      schemaVersion: 1,
      checkpointId: "checkpoint-a",
      sessionId: "session-a",
      adapterId: manifest.adapterId,
      adapterVersion: manifest.adapterVersion,
      implementationId: manifest.implementationId,
      throughStepSequence: 0,
      stateReference: "memory://checkpoint-a",
      stateDigest: digest("0"),
      createdAt: "2026-08-05T00:00:00.000Z",
    },
    state: { cursor: 0 },
    exportedAt: "2026-08-05T00:00:00.000Z",
  };
  await assert.rejects(
    fixture.orchestrator.exportHandoff({
      sessionId: "session-a",
      checkpointTransfer: {
        ...checkpointTransfer,
        sourceSessionRevision: session.revision - 1,
      },
      logicalTimeMs: 4,
    }),
    /handoff_binding_invalid/u,
  );
  const [alignmentHandoff, refinementHandoff] = await Promise.all([
    fixture.alignment.exportHandoff({
      sessionId: "session-a",
      checkpointTransfer,
      logicalTimeMs: 4,
    }),
    fixture.orchestrator.exportHandoff({
      sessionId: "session-a",
      checkpointTransfer,
      logicalTimeMs: 4,
    }),
  ]);
  const targetAlignment = await fixture.alignment.importHandoff({
    handoff: alignmentHandoff,
    checkpointTransfer,
    targetSessionId: "session-b",
    targetAgentId: "agent-b",
    targetRole: session.role,
    logicalTimeMs: 5,
  });
  const rebound = await fixture.orchestrator.importHandoff({
    handoff: refinementHandoff,
    checkpointTransfer,
    targetAlignmentState: targetAlignment,
    logicalTimeMs: 5,
  });
  assert.equal(rebound.status, "confirmed");
  assert.equal(rebound.activeSessionId, "session-b");
  assert.equal(rebound.agentId, "agent-b");
  assert.equal(rebound.events.at(-1).eventType, "session_rebound");
  assert.equal(
    rebound.selection.selectionDigest,
    confirmed.selection.selectionDigest,
  );
  assert.equal(await fixture.orchestrator.getState("session-a"), undefined);
  assert.equal(
    (await fixture.orchestrator.getState("session-b")).stateDigest,
    rebound.stateDigest,
  );
  const replay = await fixture.orchestrator.run({
    ...fixture.input,
    sessionId: "session-b",
    logicalTimeMs: 6,
  });
  assert.equal(replay.stateDigest, rebound.stateDigest);
});
