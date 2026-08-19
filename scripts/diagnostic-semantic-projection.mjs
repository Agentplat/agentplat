import { digestCollectiveStatisticalCampaignArtifactV1 } from "../packages/mesh-sim/dist/index.js";

export function projectDiagnosticSemanticMetrics(context, traceEvents, monitorVerdict) {
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
      evidencePresent: convergenceEvidencePresent,
      agreement: null,
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
