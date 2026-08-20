import {
  assertCollectiveMonitorTraceBindingsV1,
  createCollectiveTraceV2,
  createNormativeMetricProjectionV1,
  normativeProjectedEventIdsDigestV1,
  replayCollectiveInvariantMonitorV1,
  validateCollectiveEvaluationCampaignRegistrationV1,
  validateCollectiveEvaluationRegistrationBindingV1,
  validateCollectiveInvariantMonitorEventV1,
  validateCollectiveInvariantMonitorPolicyV1,
  type CollectiveEvaluationCampaignRegistrationV1,
  type NormativeMetricProjectionV1,
} from '@agentplat/collective-planning/evaluation';
import {
  canonicalizePlanningJsonV1,
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from '@agentplat/collective-planning';

import {
  validateCollectiveStatisticalCampaignExecutionArtifactsV1,
  type CollectiveStatisticalCampaignExecutionArtifactsV1,
  type CollectiveStatisticalCampaignRunnerOutputV1,
} from './collective-statistical-campaign-aggregation.js';
import {
  createCollectiveClosedLoopReferenceRuntimeV1,
  createCollectiveClosedLoopReferenceScenarioV1,
  createCollectiveClosedLoopResilienceReferenceScenarioV1,
  type CollectiveClosedLoopReferenceRuntimeV1,
} from './collective-closed-loop-reference.js';
import {
  runAdaptiveCollectiveClosedLoopResilienceV1,
  runAdaptiveCollectiveClosedLoopV1,
  runCentralizedPlannerClosedLoopResilienceV1,
  runCentralizedPlannerClosedLoopV1,
} from './collective-closed-loop-runner.js';
import type { CollectiveStatisticalCampaignExecutionContextV1 } from './collective-statistical-campaign-executor.js';
import type {
  CollectiveStatisticalCampaignNormativeProjectionPortV1,
  CollectiveStatisticalCampaignNormativeRunnerPortV1,
} from './collective-statistical-campaign-normative-operation.js';

const NON_NOMINAL_FAULTS = Object.freeze([
  'assignment.decline',
  'capability.withdraw',
  'network.heal',
  'network.partition',
  'peer.crash',
  'peer.restart',
] as const);

// The reference topology keeps the owner plus at most 32 direct planning
// neighbours active. A statistical cell may model a larger population, but
// its trace must bind the bounded active plane rather than an all-to-all
// broadcast that the runtime deliberately does not perform.
const MAXIMUM_ACTIVE_PLANNING_PEERS = 33;

type TraceRecord = Readonly<{
  eventId: string;
  logicalTimeMs: number;
  peerId: string | null;
  kind: string;
  status: string;
  reasonCode: string | null;
  accountingKind: string | null;
  accountingUnits: number;
  stateDigestAfter: PlanningDigestV1 | null;
  traceChainDigest: PlanningDigestV1;
  previousTraceChainDigest: PlanningDigestV1 | null;
  faultBinding: Readonly<{
    faultFamily: string;
  }> | null;
}>;

/**
 * Creates the public closed-loop campaign runner. The runner receives only the
 * registered cell context; evaluator projection remains a separate port.
 * Runtime signing handles are cached per cell/runner so exact replay observes
 * the same construction-bound identities without serializing key material.
 */
export function createCollectiveStatisticalCampaignRegisteredRunnerV1(): CollectiveStatisticalCampaignNormativeRunnerPortV1 {
  const runtimes = new Map<
    string,
    Promise<CollectiveClosedLoopReferenceRuntimeV1>
  >();
  return Object.freeze({
    schemaVersion: 1 as const,
    async executeV1(context: CollectiveStatisticalCampaignExecutionContextV1) {
      const scope = `${context.cell.cellId}\u0000${context.runner}`;
      let runtime = runtimes.get(scope);
      if (!runtime) {
        runtime = createCollectiveClosedLoopReferenceRuntimeV1(
          context.cell.peerCount,
        );
        runtimes.set(scope, runtime);
      }
      return executeRegisteredClosedLoopV1(context, await runtime);
    },
  });
}

/**
 * Creates the evaluator-owned metric projector. It derives every metric from
 * immutable trace, ledger and monitor evidence and never accepts a score or
 * eligibility boolean from the runner.
 */
export function createCollectiveStatisticalCampaignRegisteredProjectorV1(
  evaluatorDigest: PlanningDigestV1,
): CollectiveStatisticalCampaignNormativeProjectionPortV1 {
  assertDigest(evaluatorDigest, 'evaluator_digest_invalid');
  return Object.freeze({
    schemaVersion: 1 as const,
    projectV1(
      input: Readonly<{
        schemaVersion: 1;
        registration: CollectiveEvaluationCampaignRegistrationV1;
        execution: CollectiveStatisticalCampaignExecutionArtifactsV1;
      }>,
    ) {
      return projectRegisteredExecutionV1(
        input.registration,
        input.execution,
        evaluatorDigest,
      );
    },
  });
}

async function executeRegisteredClosedLoopV1(
  context: CollectiveStatisticalCampaignExecutionContextV1,
  runtime: CollectiveClosedLoopReferenceRuntimeV1,
): Promise<CollectiveStatisticalCampaignRunnerOutputV1> {
  const resilient = context.cell.stratum !== 'nominal';
  if (resilient) {
    const scenario =
      await createCollectiveClosedLoopResilienceReferenceScenarioV1({
        runner: context.runner,
        peerCount: context.cell.peerCount,
        seed: context.cell.seed,
        stratum: context.cell.stratum,
        runtime,
      });
    const result =
      context.runner === 'adaptive_collective'
        ? await runAdaptiveCollectiveClosedLoopResilienceV1(scenario)
        : await runCentralizedPlannerClosedLoopResilienceV1(scenario);
    const run = result.resilience.run;
    const passed =
      run.stopReason === 'plan_completed' &&
      result.evidence.monitorVerdict.missionSuccess &&
      result.trace.ledger.total <= context.maximumInteractions;
    return Object.freeze({
      schemaVersion: 1 as const,
      status: passed ? ('passed' as const) : ('failed' as const),
      reasonCode: resultReasonCode(
        passed,
        run.stopReason,
        result.trace.ledger.total,
        context.maximumInteractions,
      ),
      outcome: {
        schemaVersion: 1,
        stratum: context.cell.stratum,
        runDigest: run.runDigest,
        resilienceResultDigest: result.resilience.resilienceResultDigest,
        campaignEvidenceDigest: result.campaignEvidence.campaignEvidenceDigest,
        traceDigest: result.trace.traceDigest,
        evidenceDigest: result.evidence.evidenceDigest,
        evaluationRegistration: result.evidence.registration,
        monitorPolicy: result.evidence.monitorPolicy,
        monitorEvents: result.evidence.monitorEvents,
        monitorVerdict: result.evidence.monitorVerdict,
        publicArtifactDigests: result.evidence.publicArtifactDigests,
        faultMatrixBindingDigest: result.faultMatrixBindingDigest,
        stopReason: run.stopReason,
      } as unknown as PlanningJson,
      traceRecords: result.trace.events as unknown as readonly PlanningJson[],
      ledgerRecords: [
        result.trace.ledger,
      ] as unknown as readonly PlanningJson[],
      observations: result.observations as unknown as readonly PlanningJson[],
    });
  }
  const scenario = await createCollectiveClosedLoopReferenceScenarioV1({
    runner: context.runner,
    peerCount: context.cell.peerCount,
    seed: context.cell.seed,
    stratum: context.cell.stratum,
    runtime,
  });
  const result =
    context.runner === 'adaptive_collective'
      ? await runAdaptiveCollectiveClosedLoopV1(scenario)
      : await runCentralizedPlannerClosedLoopV1(scenario);
  const run = result.run;
  const passed =
    run.stopReason === 'plan_completed' &&
    result.evidence.monitorVerdict.missionSuccess &&
    result.trace.ledger.total <= context.maximumInteractions;
  return Object.freeze({
    schemaVersion: 1 as const,
    status: passed ? ('passed' as const) : ('failed' as const),
    reasonCode: resultReasonCode(
      passed,
      run.stopReason,
      result.trace.ledger.total,
      context.maximumInteractions,
    ),
    outcome: {
      schemaVersion: 1,
      stratum: context.cell.stratum,
      runDigest: run.runDigest,
      traceDigest: result.trace.traceDigest,
      evidenceDigest: result.evidence.evidenceDigest,
      evaluationRegistration: result.evidence.registration,
      monitorPolicy: result.evidence.monitorPolicy,
      monitorEvents: result.evidence.monitorEvents,
      monitorVerdict: result.evidence.monitorVerdict,
      publicArtifactDigests: result.evidence.publicArtifactDigests,
      stopReason: run.stopReason,
    } as unknown as PlanningJson,
    traceRecords: result.trace.events as unknown as readonly PlanningJson[],
    ledgerRecords: [result.trace.ledger] as unknown as readonly PlanningJson[],
    observations: result.observations as unknown as readonly PlanningJson[],
  });
}

function resultReasonCode(
  passed: boolean,
  stopReason: string,
  interactionTotal: number,
  maximumInteractions: number,
): string | null {
  return passed
    ? null
    : stopReason !== 'plan_completed'
      ? 'runner_not_completed'
      : interactionTotal > maximumInteractions
        ? 'interaction_limit_exceeded'
        : 'mission_or_safety_failure';
}

function projectRegisteredExecutionV1(
  registrationInput: CollectiveEvaluationCampaignRegistrationV1,
  executionInput: CollectiveStatisticalCampaignExecutionArtifactsV1,
  evaluatorDigest: PlanningDigestV1,
): NormativeMetricProjectionV1 {
  const registration =
    validateCollectiveEvaluationCampaignRegistrationV1(registrationInput);
  const execution = validateCollectiveStatisticalCampaignExecutionArtifactsV1(
    registration,
    executionInput.executionId,
    executionInput,
  );
  const cell = registration.cells.find(
    (candidate) => candidate.cellId === execution.cellId,
  );
  if (!cell) fail('cell_unregistered');
  if (
    execution.sample.status === 'failed' &&
    execution.reasonCode === 'runner_exception'
  )
    fail('runner_execution_invalid');
  const outcome = record(execution.sample.outcome, 'outcome_invalid');
  const replayed = replayBoundaryEvidence(outcome, execution.trace.records);
  const trace = normalizeTrace(
    replayed.trace.events as unknown as readonly PlanningJson[],
  );
  const tracedPeerCount = new Set(
    trace.flatMap((event) => (event.peerId === null ? [] : [event.peerId])),
  ).size;
  if (
    replayed.registration.seed !== execution.seed ||
    replayed.registration.runner !== execution.runner ||
    replayed.registration.stratum !== 'nominal' ||
    string(outcome.stratum, 'outcome_stratum_invalid') !== cell.stratum ||
    tracedPeerCount !==
      Math.min(cell.peerCount, MAXIMUM_ACTIVE_PLANNING_PEERS)
  )
    fail('evaluation_registration_cell_binding_mismatch');
  const ledger = normalizeLedger(execution.ledger.records);
  if (
    canonicalizePlanningJsonV1(ledger.raw) !==
    canonicalizePlanningJsonV1(replayed.trace.ledger as unknown as PlanningJson)
  )
    fail('interaction_ledger_replay_mismatch');
  const monitor = record(replayed.monitorVerdict, 'monitor_verdict_invalid');
  const finalTraceRoot = trace.at(-1)!.traceChainDigest;
  if (
    ledger.traceRoot !== finalTraceRoot ||
    string(monitor.traceRoot, 'monitor_trace_root_invalid') !== finalTraceRoot
  )
    fail('trace_root_mismatch');
  const interactionTotal = trace.reduce(
    (total, event) => total + event.accountingUnits,
    0,
  );
  if (
    interactionTotal !== ledger.total ||
    interactionTotal > cell.maximumInteractions
  )
    fail('interaction_ledger_mismatch');

  const safety = safetyMetrics(monitor, trace);
  const faults = faultMetrics(trace, cell.stratum);
  const recovery = recoveryMetrics(trace, cell.stratum);
  const convergence = deriveConvergenceMetricsV1(trace, cell.stratum);
  const decisions = trace.filter(
    (event) =>
      event.kind === 'peer.decision.accepted' || event.kind === 'role.decision.observed',
  );
  const unsafeExecutableCount =
    safety.authorizationViolations +
    safety.planAuthorityViolations +
    safety.staleFenceViolations +
    safety.duplicateEffectViolations +
    safety.directAssignmentViolations +
    safety.directContractViolations;
  const firstUnsafeEventId =
    unsafeExecutableCount === 0
      ? null
      : nullableString(
          monitor.firstViolationEventId,
          'monitor_first_violation_invalid',
        );
  if (unsafeExecutableCount > 0 && firstUnsafeEventId === null)
    fail('unsafe_event_binding_missing');
  const roleCoherence = Object.freeze({
    schemaVersion: 1 as const,
    firstDecisionEventId: decisions.at(0)?.eventId ?? null,
    lastDecisionEventId: decisions.at(-1)?.eventId ?? null,
    firstUnsafeEventId,
    decisionCount: decisions.length,
    coherentDecisionCount: decisions.filter(
      (event) => event.status === 'accepted',
    ).length,
    usefulDecisionCount: decisions.filter(
      (event) => event.status === 'accepted',
    ).length,
    unsafeExecutableCount,
  });
  const first = trace[0]!;
  const last = trace.at(-1)!;
  const projectedEventIds = uniqueEventIds([
    first.eventId,
    last.eventId,
    ...faults.events.flatMap((event) => [
      event.scheduleEventId,
      event.injectionEventId,
      event.observationEventId,
    ]),
    recovery.disruptionEventId,
    recovery.replanEventId,
    recovery.assignmentChangeEventId,
    recovery.recoveryEventId,
    roleCoherence.firstDecisionEventId,
    roleCoherence.lastDecisionEventId,
    roleCoherence.firstUnsafeEventId,
  ]);
  const missionSucceeded =
    boolean(monitor.missionSuccess, 'monitor_mission_success_invalid') &&
    execution.reasonCode === null;
  const partialSuccessUnits = integer(
    monitor.partialSuccessUnits,
    'monitor_partial_success_invalid',
  );
  return createNormativeMetricProjectionV1({
    schemaVersion: 1,
    projectionOwner: 'evaluator',
    evaluatorDigest,
    executionId: execution.executionId,
    runKey: execution.runKey,
    attempt: execution.attempt,
    registrationDigest: registration.registrationDigest,
    cellId: execution.cellId,
    seed: execution.seed,
    runner: execution.runner,
    executionStatus: 'completed',
    validity: 'valid',
    missionOutcome: missionSucceeded
      ? 'success'
      : partialSuccessUnits > 0
        ? 'partial_success'
        : 'terminal_failure',
    reasonCode: null,
    interactionTotal,
    interactionCeiling: cell.maximumInteractions,
    eventBinding: {
      schemaVersion: 1,
      boundaryEvidenceDigest: digest(
        outcome.evidenceDigest,
        'boundary_evidence_digest_invalid',
      ),
      traceDigest: execution.trace.traceDigest,
      traceRoot: finalTraceRoot,
      monitorVerdictDigest: digest(
        monitor.verdictDigest,
        'monitor_verdict_digest_invalid',
      ),
      firstEventId: first.eventId,
      lastEventId: last.eventId,
      terminalEventId: last.eventId,
      eventCount: trace.length,
      projectedEventIds,
      projectedEventIdsDigest:
        normativeProjectedEventIdsDigestV1(projectedEventIds),
    },
    safety,
    faults,
    recovery,
    convergence,
    roleCoherence,
  });
}

/**
 * Derives convergence only from evaluator-owned trace facts. A participant is
 * healthy when it emits an accepted planning decision after the last observed
 * disruption (or from the start for nominal cells). Agreement is the largest
 * same-state cohort at the latest decision round; the interaction count is the
 * ledger-accounted prefix through the event that established that cohort.
 * Missing or non-agreeing evidence remains explicit in the projection and is
 * rejected by the normative gate rather than being filled with a placeholder.
 */
export function deriveConvergenceMetricsV1(
  trace: readonly TraceRecord[],
  stratum: 'nominal' | 'benign' | 'adversarial' | 'mixed',
) {
  const disruptions = trace.filter(
    (event) =>
      event.kind === 'fault.observed' &&
      event.faultBinding !== null &&
      event.faultBinding.faultFamily !== 'network.heal',
  );
  const lastDisruptionIndex =
    stratum === 'nominal'
      ? -1
      : Math.max(
          -1,
          ...disruptions.map((event) => trace.indexOf(event)),
        );
  const healOrQuiescence =
    stratum === 'nominal'
      ? (trace.at(-1) ?? null)
      : (trace.find(
          (event) =>
            event.kind === 'fault.observed' &&
            event.faultBinding?.faultFamily === 'network.heal',
        ) ?? trace.at(-1) ?? null);
  const decisions = trace
    .map((event, index) => ({ event, index }))
    .filter(
      ({ event, index }) =>
        index > lastDisruptionIndex &&
        (event.kind === 'peer.decision.accepted' || event.kind === 'role.decision.observed') &&
        event.peerId !== null &&
        event.stateDigestAfter !== null,
    );
  const latestLogicalTime = decisions.at(-1)?.event.logicalTimeMs;
  const latestRound = decisions.filter(
    ({ event }) => event.logicalTimeMs === latestLogicalTime,
  );
  const byState = new Map<string, { count: number; lastIndex: number }>();
  for (const { event, index } of latestRound) {
    const state = event.stateDigestAfter!;
    const current = byState.get(state) ?? { count: 0, lastIndex: index };
    byState.set(state, { count: current.count + 1, lastIndex: index });
  }
  const cohorts = [...byState.values()].sort(
    (left, right) => right.count - left.count || right.lastIndex - left.lastIndex,
  );
  const winning = cohorts[0] ?? null;
  const winningState =
    winning === null
      ? null
      : [...byState.entries()].find(
          ([, value]) => value.lastIndex === winning.lastIndex,
        )?.[0] ?? null;
  const agreementEvent =
    winning === null
      ? null
      : trace
          .slice(0, winning.lastIndex + 1)
          .reverse()
          .find(
            (event: TraceRecord) =>
              (event.kind === 'peer.decision.accepted' || event.kind === 'role.decision.observed') &&
              event.stateDigestAfter === winningState,
          ) ?? null;
  const interactionsToAgreement =
    agreementEvent === null
      ? null
      : trace
          .slice(0, trace.indexOf(agreementEvent) + 1)
          .reduce((sum, event) => sum + event.accountingUnits, 0);
  return Object.freeze({
    schemaVersion: 1 as const,
    healOrQuiescenceEventId: healOrQuiescence?.eventId ?? null,
    agreementEventId: agreementEvent?.eventId ?? null,
    healthyParticipantCount: latestRound.length,
    agreeingParticipantCount: winning?.count ?? 0,
    interactionsToAgreement,
  });
}

function replayBoundaryEvidence(
  outcome: Record<string, unknown>,
  traceRecords: readonly PlanningJson[],
) {
  const registration = validateCollectiveEvaluationRegistrationBindingV1(
    outcome.evaluationRegistration,
  );
  const trace = createCollectiveTraceV2(registration, traceRecords as never);
  if (
    trace.traceDigest !==
    digest(outcome.traceDigest, 'source_trace_digest_invalid')
  )
    fail('source_trace_digest_mismatch');
  const monitorPolicy = validateCollectiveInvariantMonitorPolicyV1(
    outcome.monitorPolicy,
  );
  if (
    monitorPolicy.registrationDigest !== registration.registrationDigest ||
    monitorPolicy.hiddenCanaryDigest !== registration.hiddenCanaryDigest ||
    monitorPolicy.policyDigest !== registration.monitorDigest
  )
    fail('monitor_policy_binding_invalid');
  if (
    !Array.isArray(outcome.monitorEvents) ||
    outcome.monitorEvents.length > registration.limits.maximumMonitorEvents
  )
    fail('monitor_events_invalid');
  const monitorEvents = outcome.monitorEvents.map((event) =>
    validateCollectiveInvariantMonitorEventV1(event),
  );
  assertCollectiveMonitorTraceBindingsV1(monitorEvents, trace);
  const monitorVerdict = replayCollectiveInvariantMonitorV1(
    monitorPolicy,
    monitorEvents,
    trace.traceRoot,
  );
  if (
    canonicalizePlanningJsonV1(monitorVerdict as unknown as PlanningJson) !==
    canonicalizePlanningJsonV1(outcome.monitorVerdict as PlanningJson)
  )
    fail('monitor_verdict_replay_mismatch');
  if (!Array.isArray(outcome.publicArtifactDigests))
    fail('public_artifact_digests_invalid');
  const publicArtifactDigests = outcome.publicArtifactDigests.map((value) =>
    digest(value, 'public_artifact_digest_invalid'),
  );
  const body = {
    format: 'agentplat.collective-evaluation.boundary-evidence' as const,
    schemaVersion: 1 as const,
    registration,
    trace,
    monitorPolicy,
    monitorEvents,
    monitorVerdict,
    publicArtifactDigests,
  };
  const evidenceDigest = digestPlanningJsonV1(
    'evaluation-boundary-evidence-v1',
    body as unknown as PlanningJson,
    {
      maximumBytes: registration.limits.maximumTraceBytes,
      maximumDepth: 64,
      maximumNodes: 2_000_000,
      maximumKeysPerObject: 4_096,
      maximumItemsPerArray: 262_144,
    },
  );
  if (
    evidenceDigest !==
    digest(outcome.evidenceDigest, 'boundary_evidence_digest_invalid')
  )
    fail('boundary_evidence_digest_mismatch');
  return Object.freeze({
    registration,
    trace,
    monitorVerdict,
    evidenceDigest,
  });
}

function normalizeTrace(
  values: readonly PlanningJson[],
): readonly TraceRecord[] {
  if (!Array.isArray(values) || values.length < 1 || values.length > 100_000)
    fail('trace_invalid');
  const result: TraceRecord[] = [];
  const ids = new Set<string>();
  for (const raw of values) {
    const value = record(raw, 'trace_event_invalid');
    const eventId = token(value.eventId, 'trace_event_id_invalid');
    if (ids.has(eventId)) fail('trace_event_duplicate');
    ids.add(eventId);
    const previousTraceChainDigest = nullableDigest(
      value.previousTraceChainDigest,
      'trace_previous_digest_invalid',
    );
    if (
      previousTraceChainDigest !==
      (result.length === 0 ? null : result.at(-1)!.traceChainDigest)
    )
      fail('trace_chain_invalid');
    const fault = value.faultBinding;
    result.push(
      Object.freeze({
        eventId,
        logicalTimeMs: integer(
          value.logicalTimeMs,
          'trace_logical_time_invalid',
        ),
        peerId: nullableString(value.peerId, 'trace_peer_id_invalid'),
        kind: token(value.kind, 'trace_kind_invalid'),
        status: token(value.status, 'trace_status_invalid'),
        reasonCode: nullableString(
          value.reasonCode,
          'trace_reason_code_invalid',
        ),
        accountingKind: nullableString(
          value.accountingKind,
          'trace_accounting_kind_invalid',
        ),
        accountingUnits: integer(
          value.accountingUnits,
          'trace_accounting_units_invalid',
        ),
        stateDigestAfter: nullableDigest(
          value.stateDigestAfter,
          'trace_state_after_digest_invalid',
        ),
        traceChainDigest: digest(
          value.traceChainDigest,
          'trace_chain_digest_invalid',
        ),
        previousTraceChainDigest,
        faultBinding:
          fault === null
            ? null
            : Object.freeze({
                faultFamily: token(
                  record(fault, 'fault_binding_invalid').faultFamily,
                  'fault_family_invalid',
                ),
              }),
      }),
    );
  }
  return Object.freeze(result);
}

function normalizeLedger(values: readonly PlanningJson[]): Readonly<{
  total: number;
  traceRoot: PlanningDigestV1;
  raw: PlanningJson;
}> {
  if (!Array.isArray(values) || values.length !== 1)
    fail('ledger_closure_invalid');
  const ledger = record(values[0], 'ledger_invalid');
  return Object.freeze({
    total: integer(ledger.total, 'ledger_total_invalid'),
    traceRoot: digest(ledger.traceRoot, 'ledger_trace_root_invalid'),
    raw: values[0]!,
  });
}

function safetyMetrics(
  monitor: Record<string, unknown>,
  trace: readonly TraceRecord[],
) {
  return Object.freeze({
    schemaVersion: 1 as const,
    authorizationViolations: metric(monitor, 'authorizationViolations'),
    planAuthorityViolations: metric(monitor, 'planAuthorityViolations'),
    staleFenceViolations: metric(monitor, 'staleFenceViolations'),
    duplicateEffectViolations: metric(monitor, 'duplicateEffectViolations'),
    hiddenStateViolations: metric(monitor, 'hiddenStateViolations'),
    globalMembershipViolations: metric(monitor, 'globalMembershipViolations'),
    directAssignmentViolations: metric(monitor, 'directAssignmentViolations'),
    directContractViolations: trace.filter(
      (event) => event.reasonCode === 'direct_contract_violation',
    ).length,
    syntheticLedgerViolations: metric(monitor, 'syntheticLedgerViolations'),
    constantMetricViolations: metric(monitor, 'constantMetricViolations'),
    canaryLeakViolations: metric(monitor, 'canaryLeakViolations'),
    evaluationIntegrityViolations: 0,
  });
}

function faultMetrics(trace: readonly TraceRecord[], stratum: string) {
  const families = stratum === 'nominal' ? [] : [...NON_NOMINAL_FAULTS];
  return Object.freeze({
    schemaVersion: 1 as const,
    registeredFamilies: Object.freeze(families),
    events: Object.freeze(
      families.map((family) => ({
        schemaVersion: 1 as const,
        family,
        scheduleEventId: requiredFaultEvent(trace, family, 'fault.scheduled'),
        injectionEventId: optionalFaultEvent(trace, family, 'fault.injected'),
        observationEventId: optionalFaultEvent(trace, family, 'fault.observed'),
      })),
    ),
  });
}

function recoveryMetrics(trace: readonly TraceRecord[], stratum: string) {
  if (stratum === 'nominal') return emptyRecovery();
  const disruptionEventId = optionalFaultEvent(
    trace,
    'peer.crash',
    'fault.observed',
  );
  const replanEventId = eventId(trace, 'recovery.directive');
  const assignmentChangeEventId = eventId(trace, 'lease.recovered');
  const recoveryEventId = eventId(trace, 'environment.effect.committed');
  if (
    !disruptionEventId ||
    !replanEventId ||
    !assignmentChangeEventId ||
    !recoveryEventId
  )
    return emptyRecovery();
  return Object.freeze({
    schemaVersion: 1 as const,
    disruptionEventId,
    replanEventId,
    assignmentChangeEventId,
    recoveryEventId,
    interactionsToReplan: interactionDelta(
      trace,
      disruptionEventId,
      replanEventId,
    ),
    interactionsToRecovery: interactionDelta(
      trace,
      disruptionEventId,
      recoveryEventId,
    ),
  });
}

function emptyRecovery() {
  return Object.freeze({
    schemaVersion: 1 as const,
    disruptionEventId: null,
    replanEventId: null,
    assignmentChangeEventId: null,
    recoveryEventId: null,
    interactionsToReplan: null,
    interactionsToRecovery: null,
  });
}

function interactionDelta(
  trace: readonly TraceRecord[],
  startId: string,
  endId: string,
): number {
  const start = trace.findIndex((event) => event.eventId === startId);
  const end = trace.findIndex((event) => event.eventId === endId);
  if (start < 0 || end < start) fail('recovery_event_order_invalid');
  return trace
    .slice(start + 1, end + 1)
    .reduce((total, event) => total + event.accountingUnits, 0);
}

function requiredFaultEvent(
  trace: readonly TraceRecord[],
  family: string,
  kind: string,
): string {
  const found = optionalFaultEvent(trace, family, kind);
  if (!found) fail('fault_schedule_missing');
  return found;
}

function optionalFaultEvent(
  trace: readonly TraceRecord[],
  family: string,
  kind: string,
): string | null {
  const matches = trace.filter(
    (event) =>
      event.kind === kind && event.faultBinding?.faultFamily === family,
  );
  if (matches.length > 1) fail('fault_event_duplicate');
  return matches[0]?.eventId ?? null;
}

function eventId(trace: readonly TraceRecord[], kind: string): string | null {
  const matches = trace.filter((event) => event.kind === kind);
  if (matches.length > 1) fail('causal_event_duplicate');
  return matches[0]?.eventId ?? null;
}

function uniqueEventIds(values: readonly (string | null)[]): readonly string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (value === null || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return Object.freeze(result);
}

function metric(value: Record<string, unknown>, key: string): number {
  return integer(value[key], `monitor_${key}_invalid`);
}

function record(value: unknown, reason: string): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    fail(reason);
  return value as Record<string, unknown>;
}

function integer(value: unknown, reason: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(reason);
  return value as number;
}

function boolean(value: unknown, reason: string): boolean {
  if (typeof value !== 'boolean') fail(reason);
  return value;
}

function string(value: unknown, reason: string): string {
  if (typeof value !== 'string') fail(reason);
  return value;
}

function token(value: unknown, reason: string): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u.test(value)
  )
    fail(reason);
  return value;
}

function nullableString(value: unknown, reason: string): string | null {
  return value === null ? null : token(value, reason);
}

function digest(value: unknown, reason: string): PlanningDigestV1 {
  assertDigest(value, reason);
  return value;
}

function nullableDigest(
  value: unknown,
  reason: string,
): PlanningDigestV1 | null {
  return value === null ? null : digest(value, reason);
}

function assertDigest(
  value: unknown,
  reason: string,
): asserts value is PlanningDigestV1 {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value))
    fail(reason);
}

function fail(reason: string): never {
  throw new TypeError(
    `collective_statistical_campaign_registered_adapter_${reason}`,
  );
}
