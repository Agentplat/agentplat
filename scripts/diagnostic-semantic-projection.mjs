import { digestCollectiveStatisticalCampaignArtifactV1 } from "../packages/mesh-sim/dist/index.js";
import { InProcessSparseBftFinalityGatewayV1 } from "../packages/collective-host/dist/index.js";
import { createSparseCommitteePolicyV2, sparseAggregateSignerSetDigestV2 } from "../packages/collective-quorum/dist/sparse-agreement.js";
import { createHash } from "node:crypto";

export async function projectDiagnosticSemanticMetrics(context, traceEvents, monitorVerdict) {
  const events = Array.isArray(traceEvents) ? traceEvents : [];
  const inferenceEvents = events.filter((event) => event.kind === "inference.assessed" && event.status === "accepted");
  const dispatchEvents = events.filter((event) => event.kind === "effect.dispatch" && event.status === "accepted");
  const committedEffects = events.filter((event) => event.kind === "environment.effect.committed" && event.status === "accepted");
  const unsafeExecutableCount = Object.entries(monitorVerdict ?? {})
    .filter(([key]) => key.endsWith("Violations"))
    .reduce((total, [, value]) => total + Number(value ?? 0), 0);
  const roleDecisionCount = inferenceEvents.length;
  const usefulDecisionCount = Math.min(inferenceEvents.length, committedEffects.length);
  const healEvent = events.find((event) => event.kind === "fault.observed" && event.faultBinding?.faultFamily === "network.heal");
  const quiescenceEvent = [...events].reverse().find((event) => event.kind === "work.result" && event.status === "accepted");
  const healIndex = healEvent ? events.indexOf(healEvent) : -1;
  const quiescenceIndex = quiescenceEvent ? events.indexOf(quiescenceEvent) : -1;
  const convergenceEvidencePresent = healEvent !== undefined && quiescenceEvent !== undefined && quiescenceIndex > healIndex && unsafeExecutableCount === 0 && monitorVerdict?.missionSuccess === true;
  const convergenceInteractionDelta = convergenceEvidencePresent
    ? events.slice(healIndex + 1, quiescenceIndex + 1).reduce((total, event) => total + Number(event.accountingUnits ?? 0), 0)
    : null;
  const agreementCertificate = convergenceEvidencePresent
    ? await certifyDiagnosticQuiescence(context, healEvent, quiescenceEvent, monitorVerdict)
    : null;
  const body = {
    schemaVersion: 1,
    projectionOwner: "evaluator",
    evaluatorBasis: "trace-and-monitor-v1",
    cellId: context.cell.cellId,
    runner: context.runner,
    attempt: null,
    diagnosticDecisionPopulation: 1,
    confirmatoryDecisionPopulation: 1_000,
    roleDecisionCount,
    usefulDecisionCount,
    usefulDecisionRate: roleDecisionCount === 0 ? null : usefulDecisionCount / roleDecisionCount,
    unsafeExecutableCount,
    roleHorizonStatus: roleDecisionCount === 1 ? "complete_for_diagnostic_profile" : "incomplete",
    convergence: {
      schemaVersion: 1,
      evidenceType: "post_heal_quiescence_v1",
      healOrQuiescenceEventId: healEvent?.eventId ?? null,
      quiescenceEventId: quiescenceEvent?.eventId ?? null,
      agreementEventId: null,
      agreementCertificateDigest: agreementCertificate?.certificate.certificateDigest ?? null,
      evidencePresent: convergenceEvidencePresent,
      agreement: agreementCertificate === null ? null : 1,
      interactionDelta: convergenceInteractionDelta,
      reasonCode: convergenceEvidencePresent ? null : "convergence_evidence_missing",
    },
    observedInferenceEventIds: inferenceEvents.map((event) => event.eventId),
    observedDispatchEventIds: dispatchEvents.map((event) => event.eventId),
    observedCommittedEffectEventIds: committedEffects.map((event) => event.eventId),
    status: roleDecisionCount === 1 && convergenceEvidencePresent ? "complete_for_diagnostic_profile" : "incomplete",
    confirmatoryStatus: roleDecisionCount === 1_000 && convergenceEvidencePresent ? "complete" : "incomplete",
  };
  return Object.freeze({
    ...body,
    projectionDigest: digestCollectiveStatisticalCampaignArtifactV1("metric-projection", body),
  });
}

async function certifyDiagnosticQuiescence(context, healEvent, quiescenceEvent, monitorVerdict) {
  const validators = [0, 1, 2, 3].map((index) => ({
    peerId: `diagnostic-v${index}`,
    instanceId: `diagnostic-i${index}`,
    keyId: `diagnostic-k${index}`,
    eligibilityDigest: digestText(`eligibility:${index}`),
    independenceGroupId: `diagnostic-g${index}`,
  }));
  const membership = {
    schemaVersion: 2,
    epoch: 1,
    configurationDigest: digestText(`${context.cell.cellId}:membership`),
    selectionSeedDigest: digestText(`${context.cell.cellId}:selection`),
    validators,
  };
  const policy = await createSparseCommitteePolicyV2({
    policyId: `diagnostic-quiescence:${context.cell.cellId}`,
    policyVersion: 1,
    committeeSize: 4,
    faultThreshold: 1,
    reconciliationCommitteeSize: 4,
    reconciliationFaultThreshold: 1,
    maximumCommittees: 1,
    maximumValidatorsPerIndependenceGroup: 1,
  });
  const proposalDigest = digestText(`${healEvent.eventId}:${quiescenceEvent.eventId}:proposal`);
  const valueDigest = digestText(`${healEvent.eventId}:${quiescenceEvent.eventId}:value`);
  const decisionId = `diagnostic-quiescence:${context.cell.cellId}:${context.runner}`;
  const signatures = {
    algorithm: "diagnostic-test-signatures-v1",
    verifyShare: async ({ validator, signature }) => signature === `signed:${validator.peerId}`,
    aggregate: async ({ messageDigest, shares }) => {
      const signerPeerIds = shares.map((share) => share.signerPeerId).sort();
      return {
        algorithm: "diagnostic-test-signatures-v1",
        signerPeerIds,
        signerSetDigest: await sparseAggregateSignerSetDigestV2("diagnostic-test-signatures-v1", signerPeerIds),
        value: `aggregate:${messageDigest}`,
      };
    },
    verifyAggregate: async ({ messageDigest, signature }) => signature.value === `aggregate:${messageDigest}`,
  };
  const gateway = new InProcessSparseBftFinalityGatewayV1({
    membership,
    policy,
    signatures,
    signers: validators.map((validator) => ({
      ...validator,
      admitProposal: async ({ decisionId: candidateId, proposalDigest: candidateProposal, valueDigest: candidateValue }) =>
        candidateId === decisionId && candidateProposal === proposalDigest && candidateValue === valueDigest,
      sign: async () => `signed:${validator.peerId}`,
    })),
  });
  const finalized = await gateway.certify({
    decisionClass: "diagnostic_quiescence",
    decisionId,
    proposalDigest,
    valueDigest,
    commandBindingDigest: digestText(`${context.cell.cellId}:command`),
    evidenceDigests: [digestText(healEvent.eventId), digestText(quiescenceEvent.eventId), digestText(JSON.stringify(monitorVerdict))].sort(),
    logicalTimeMs: quiescenceEvent.logicalTimeMs ?? 0,
  });
  return finalized;
}

function digestText(value) {
  return `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
}
