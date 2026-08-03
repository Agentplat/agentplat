import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
} from '@agentplat/collective-planning';

import {
  replayMeshReducerScenario,
  runMeshReducerScenario,
  type MeshReducerScenarioConfig,
  type MeshReducerScenarioRecord,
  type MeshReducerScenarioReplayResult,
  type MeshReducerScenarioRuntime,
  type MeshReducerScenarioTrace,
} from './reducer-scenario.js';

/**
 * A compact, runner-neutral fault schedule.  The transport faults are always
 * executed by the simulation driver; capability and assignment faults are
 * normal reducer events so an adapter cannot mistake a trace annotation for a
 * domain transition.
 */
export const COLLECTIVE_CLOSED_LOOP_FAULT_MATRIX_LIMITS_V1 = Object.freeze({
  maximumFaults: 8,
  maximumScenarioEvents: 5_000,
  maximumObservers: 8,
});

export type CollectiveClosedLoopFaultMatrixFamilyV1 =
  | 'capability.withdraw'
  | 'assignment.decline'
  | 'peer.crash'
  | 'peer.restart'
  | 'network.partition'
  | 'network.heal';

export interface CollectiveClosedLoopFaultMatrixEventInjectionV1 {
  readonly schemaVersion: 1;
  readonly kind: 'reducer_event';
  readonly eventId: string;
}

export interface CollectiveClosedLoopFaultMatrixDriverInjectionV1 {
  readonly schemaVersion: 1;
  readonly kind: 'driver_fault';
  readonly simulationFaultId: string;
}

export type CollectiveClosedLoopFaultMatrixInjectionV1 =
  | CollectiveClosedLoopFaultMatrixEventInjectionV1
  | CollectiveClosedLoopFaultMatrixDriverInjectionV1;

interface CollectiveClosedLoopFaultMatrixBaseV1 {
  readonly schemaVersion: 1;
  readonly faultId: string;
  readonly family: CollectiveClosedLoopFaultMatrixFamilyV1;
  readonly logicalTime: number;
  readonly injection: CollectiveClosedLoopFaultMatrixInjectionV1;
  /** Explicit predecessor keeps restart/heal causality independent of timing. */
  readonly causalPredecessorFaultId: string | null;
}

export interface CollectiveClosedLoopCapabilityWithdrawalFaultV1 extends CollectiveClosedLoopFaultMatrixBaseV1 {
  readonly family: 'capability.withdraw';
  readonly injection: CollectiveClosedLoopFaultMatrixEventInjectionV1;
}

export interface CollectiveClosedLoopAssignmentDeclineFaultV1 extends CollectiveClosedLoopFaultMatrixBaseV1 {
  readonly family: 'assignment.decline';
  readonly injection: CollectiveClosedLoopFaultMatrixEventInjectionV1;
  readonly reofferEventId: string;
  readonly declinedOfferAttempt: number;
  readonly reofferAttempt: number;
}

export interface CollectiveClosedLoopTransportFaultV1 extends CollectiveClosedLoopFaultMatrixBaseV1 {
  readonly family:
    'peer.crash' | 'peer.restart' | 'network.partition' | 'network.heal';
  readonly injection: CollectiveClosedLoopFaultMatrixDriverInjectionV1;
}

export type CollectiveClosedLoopFaultMatrixFaultV1 =
  | CollectiveClosedLoopCapabilityWithdrawalFaultV1
  | CollectiveClosedLoopAssignmentDeclineFaultV1
  | CollectiveClosedLoopTransportFaultV1;

export interface CollectiveClosedLoopFaultMatrixObservationV1<
  State,
  Projection,
> {
  readonly faultId: string;
  /**
   * Domain adapters assert the post-condition against the actual reducer
   * trace. For example, a withdrawal must no longer be eligible for matching.
   */
  observe(input: {
    readonly trace: MeshReducerScenarioTrace<State, Projection>;
    readonly injectedRecord: MeshReducerScenarioRecord;
  }): boolean;
}

export interface CollectiveClosedLoopFaultMatrixInputV1<
  State,
  Action,
  Effect = unknown,
  Projection = State,
> {
  readonly schemaVersion: 1;
  readonly scenario: MeshReducerScenarioConfig<State, Action>;
  readonly runtime: MeshReducerScenarioRuntime<
    State,
    Action,
    Effect,
    Projection
  >;
  readonly faults: readonly CollectiveClosedLoopFaultMatrixFaultV1[];
  readonly observations: readonly CollectiveClosedLoopFaultMatrixObservationV1<
    State,
    Projection
  >[];
}

export interface CollectiveClosedLoopFaultMatrixRecordV1 {
  readonly schemaVersion: 1;
  readonly faultId: string;
  readonly family: CollectiveClosedLoopFaultMatrixFamilyV1;
  readonly scheduledEventDigest: PlanningDigestV1;
  readonly injectedEventDigest: PlanningDigestV1;
  readonly observedEventDigest: PlanningDigestV1;
  readonly injectedRecordId: string;
  readonly observed: true;
}

export interface CollectiveClosedLoopFaultMatrixResultV1<State, Projection> {
  readonly schemaVersion: 1;
  readonly scenarioDigest: string;
  readonly trace: MeshReducerScenarioTrace<State, Projection>;
  readonly records: readonly CollectiveClosedLoopFaultMatrixRecordV1[];
  readonly matrixDigest: PlanningDigestV1;
}

export interface CollectiveClosedLoopFaultMatrixReplayResultV1 {
  readonly matches: boolean;
  readonly expectedMatrixDigest: PlanningDigestV1;
  readonly actualMatrixDigest: PlanningDigestV1;
  readonly replay: MeshReducerScenarioReplayResult;
}

/**
 * Executes a bounded mixed fault campaign. This function intentionally does
 * not inject domain faults itself: the supplied Mesh reducer adapter receives
 * the signed/verified withdrawal or decline event from its normal schedule.
 */
export async function runCollectiveClosedLoopFaultMatrixV1<
  State,
  Action,
  Effect = unknown,
  Projection = State,
>(
  input: CollectiveClosedLoopFaultMatrixInputV1<
    State,
    Action,
    Effect,
    Projection
  >
): Promise<CollectiveClosedLoopFaultMatrixResultV1<State, Projection>> {
  validateInput(input);
  const trace = await runMeshReducerScenario(input.scenario, input.runtime);
  const records = await materializeRecords(input, trace);
  const matrixDigest = digest({
    kind: 'collective-closed-loop-fault-matrix-result-v1',
    scenarioDigest: trace.configurationDigest,
    traceDigest: trace.chainDigest,
    records: records.map((record) => ({
      faultId: record.faultId,
      observedEventDigest: record.observedEventDigest,
    })),
  });
  return Object.freeze({
    schemaVersion: 1,
    scenarioDigest: trace.configurationDigest,
    trace,
    records: Object.freeze(records),
    matrixDigest,
  });
}

/** Re-runs the exact schedule and requires both driver and matrix evidence. */
export async function replayCollectiveClosedLoopFaultMatrixV1<
  State,
  Action,
  Effect = unknown,
  Projection = State,
>(
  input: CollectiveClosedLoopFaultMatrixInputV1<
    State,
    Action,
    Effect,
    Projection
  >,
  expected: CollectiveClosedLoopFaultMatrixResultV1<State, Projection>
): Promise<CollectiveClosedLoopFaultMatrixReplayResultV1> {
  validateInput(input);
  const replay = await replayMeshReducerScenario(
    input.scenario,
    input.runtime,
    expected.trace
  );
  const actual = await runCollectiveClosedLoopFaultMatrixV1(input);
  const matches =
    replay.matches && actual.matrixDigest === expected.matrixDigest;
  return Object.freeze({
    matches,
    expectedMatrixDigest: expected.matrixDigest,
    actualMatrixDigest: actual.matrixDigest,
    replay,
  });
}

async function materializeRecords<State, Action, Effect, Projection>(
  input: CollectiveClosedLoopFaultMatrixInputV1<
    State,
    Action,
    Effect,
    Projection
  >,
  trace: MeshReducerScenarioTrace<State, Projection>
): Promise<CollectiveClosedLoopFaultMatrixRecordV1[]> {
  const results: CollectiveClosedLoopFaultMatrixRecordV1[] = [];
  for (const fault of input.faults) {
    const injectedRecord = findInjectedRecord(trace, fault);
    if (injectedRecord.order.logicalTime !== fault.logicalTime)
      throw new Error(`fault_matrix_injection_time_mismatch:${fault.faultId}`);
    if (!injectedRecord.accepted)
      throw new Error(
        `fault_matrix_injection_not_applied:${fault.faultId}:${
          injectedRecord.rejectionCode ?? 'rejected'
        }`
      );
    if (fault.family === 'assignment.decline') {
      const reoffer = trace.records.find(
        (record) => record.eventId === fault.reofferEventId
      );
      if (
        reoffer === undefined ||
        !reoffer.accepted ||
        reoffer.order.logicalTime < injectedRecord.order.logicalTime ||
        (reoffer.order.logicalTime === injectedRecord.order.logicalTime &&
          reoffer.order.insertionSequence <=
            injectedRecord.order.insertionSequence)
      )
        throw new Error(`fault_matrix_reoffer_not_causal:${fault.faultId}`);
    }
    const observer = input.observations.find(
      (candidate) => candidate.faultId === fault.faultId
    );
    if (observer === undefined)
      throw new Error(`fault_matrix_observation_missing:${fault.faultId}`);
    if (!observer.observe({ trace, injectedRecord }))
      throw new Error(
        `fault_matrix_observation_not_confirmed:${fault.faultId}`
      );
    const scheduledEventDigest = digest({
      kind: 'collective-closed-loop-fault-matrix-scheduled-v1',
      value: scheduledProjection(fault),
    });
    const injectedEventDigest = digest({
      kind: 'collective-closed-loop-fault-matrix-injected-v1',
      value: recordProjection(injectedRecord),
    });
    const observedEventDigest = digest({
      kind: 'collective-closed-loop-fault-matrix-observed-v1',
      value: {
        faultId: fault.faultId,
        injectedRecordId: injectedRecord.eventId,
        chainDigest: injectedRecord.chainDigest,
        stateDigest: injectedRecord.stateDigest,
        projectionDigest: injectedRecord.projectionDigest,
      },
    });
    results.push(
      Object.freeze({
        schemaVersion: 1,
        faultId: fault.faultId,
        family: fault.family,
        scheduledEventDigest,
        injectedEventDigest,
        observedEventDigest,
        injectedRecordId: injectedRecord.eventId,
        observed: true,
      })
    );
  }
  return results;
}

function findInjectedRecord<State, Projection>(
  trace: MeshReducerScenarioTrace<State, Projection>,
  fault: CollectiveClosedLoopFaultMatrixFaultV1
): MeshReducerScenarioRecord {
  const recordId =
    fault.injection.kind === 'reducer_event'
      ? fault.injection.eventId
      : `fault:${fault.injection.simulationFaultId}`;
  const record = trace.records.find(
    (candidate) => candidate.eventId === recordId
  );
  if (record === undefined)
    throw new Error(`fault_matrix_injection_missing:${fault.faultId}`);
  if (
    fault.injection.kind === 'driver_fault' &&
    (record.kind !== 'fault' ||
      record.faultId !== fault.injection.simulationFaultId)
  )
    throw new Error(`fault_matrix_driver_injection_invalid:${fault.faultId}`);
  return record;
}

function validateInput<State, Action, Effect, Projection>(
  input: CollectiveClosedLoopFaultMatrixInputV1<
    State,
    Action,
    Effect,
    Projection
  >
): void {
  if (!input || typeof input !== 'object' || input.schemaVersion !== 1)
    throw new TypeError('fault_matrix_input_invalid');
  if (!Array.isArray(input.faults) || !Array.isArray(input.observations))
    throw new TypeError('fault_matrix_collections_invalid');
  if (
    input.faults.length === 0 ||
    input.faults.length >
      COLLECTIVE_CLOSED_LOOP_FAULT_MATRIX_LIMITS_V1.maximumFaults ||
    input.observations.length !== input.faults.length ||
    input.scenario.events.length >
      COLLECTIVE_CLOSED_LOOP_FAULT_MATRIX_LIMITS_V1.maximumScenarioEvents
  )
    throw new RangeError('fault_matrix_limit_exceeded');

  const eventIds = new Set(input.scenario.events.map((event) => event.eventId));
  const simulationFaults = new Map(
    input.scenario.faultPlan.faults.map((fault) => [fault.faultId, fault])
  );
  const faultIds = new Set<string>();
  const observationIds = new Set<string>();
  const faultById = new Map<string, CollectiveClosedLoopFaultMatrixFaultV1>();
  for (const fault of input.faults) {
    validateFault(fault, eventIds, simulationFaults);
    if (faultIds.has(fault.faultId))
      throw new TypeError('fault_matrix_duplicate_fault_id');
    faultIds.add(fault.faultId);
    faultById.set(fault.faultId, fault);
  }
  for (const fault of input.faults) {
    if (fault.causalPredecessorFaultId !== null) {
      const predecessor = faultById.get(fault.causalPredecessorFaultId);
      if (predecessor === undefined)
        throw new TypeError(
          fault.family === 'peer.restart'
            ? 'fault_matrix_restart_without_crash'
            : fault.family === 'network.heal'
              ? 'fault_matrix_heal_without_partition'
              : 'fault_matrix_predecessor_unknown'
        );
      if (predecessor.logicalTime >= fault.logicalTime)
        throw new TypeError('fault_matrix_predecessor_not_earlier');
      if (
        fault.family === 'peer.restart' &&
        predecessor.family !== 'peer.crash'
      )
        throw new TypeError('fault_matrix_restart_without_crash');
      if (
        fault.family === 'network.heal' &&
        predecessor.family !== 'network.partition'
      )
        throw new TypeError('fault_matrix_heal_without_partition');
    } else if (
      fault.family === 'peer.restart' ||
      fault.family === 'network.heal'
    )
      throw new TypeError(
        fault.family === 'peer.restart'
          ? 'fault_matrix_restart_without_crash'
          : 'fault_matrix_heal_without_partition'
      );
  }
  const declaredDriverFaultIds = new Set(
    input.faults
      .filter((fault) => fault.injection.kind === 'driver_fault')
      .map((fault) => fault.injection.simulationFaultId)
  );
  if (
    declaredDriverFaultIds.size !== simulationFaults.size ||
    [...simulationFaults.keys()].some(
      (faultId) => !declaredDriverFaultIds.has(faultId)
    )
  )
    throw new TypeError('fault_matrix_driver_coverage_invalid');
  for (const observation of input.observations) {
    if (
      !observation ||
      typeof observation !== 'object' ||
      typeof observation.faultId !== 'string' ||
      typeof observation.observe !== 'function' ||
      !faultIds.has(observation.faultId) ||
      observationIds.has(observation.faultId)
    )
      throw new TypeError('fault_matrix_observation_invalid');
    observationIds.add(observation.faultId);
  }
}

function validateFault(
  fault: CollectiveClosedLoopFaultMatrixFaultV1,
  eventIds: ReadonlySet<string>,
  simulationFaults: ReadonlyMap<string, { readonly kind: string }>
): void {
  if (!fault || typeof fault !== 'object' || fault.schemaVersion !== 1)
    throw new TypeError('fault_matrix_fault_invalid');
  if (!token(fault.faultId) || !Number.isSafeInteger(fault.logicalTime))
    throw new TypeError('fault_matrix_fault_invalid');
  const semantic =
    fault.family === 'capability.withdraw' ||
    fault.family === 'assignment.decline';
  if (semantic !== (fault.injection.kind === 'reducer_event'))
    throw new TypeError('fault_matrix_injection_kind_invalid');
  if (fault.injection.kind === 'reducer_event') {
    if (
      !token(fault.injection.eventId) ||
      !eventIds.has(fault.injection.eventId)
    )
      throw new TypeError('fault_matrix_declared_only');
  } else {
    const simulationFault = simulationFaults.get(
      fault.injection.simulationFaultId
    );
    const expectedKind =
      fault.family === 'peer.restart' ? 'peer.resume' : fault.family;
    if (
      !token(fault.injection.simulationFaultId) ||
      simulationFault === undefined ||
      simulationFault.kind !== expectedKind
    )
      throw new TypeError('fault_matrix_declared_only');
  }
  if (fault.family === 'assignment.decline') {
    if (
      !token(fault.reofferEventId) ||
      !eventIds.has(fault.reofferEventId) ||
      !Number.isSafeInteger(fault.declinedOfferAttempt) ||
      fault.declinedOfferAttempt < 1 ||
      !Number.isSafeInteger(fault.reofferAttempt) ||
      fault.reofferAttempt !== fault.declinedOfferAttempt + 1
    )
      throw new TypeError('fault_matrix_reoffer_attempt_invalid');
  }
}

function scheduledProjection(
  fault: CollectiveClosedLoopFaultMatrixFaultV1
): Record<string, unknown> {
  return {
    faultId: fault.faultId,
    family: fault.family,
    logicalTime: fault.logicalTime,
    injection:
      fault.injection.kind === 'reducer_event'
        ? { kind: fault.injection.kind, eventId: fault.injection.eventId }
        : {
            kind: fault.injection.kind,
            simulationFaultId: fault.injection.simulationFaultId,
          },
  };
}

function recordProjection(
  record: MeshReducerScenarioRecord
): Record<string, unknown> {
  return {
    eventId: record.eventId,
    kind: record.kind,
    accepted: record.accepted,
    actionDigest: record.actionDigest,
    effectsDigest: record.effectsDigest,
    stateDigest: record.stateDigest,
    chainDigest: record.chainDigest,
  };
}

function digest(value: Record<string, unknown>): PlanningDigestV1 {
  return digestPlanningJsonV1(
    'evaluation-boundary-evidence-v1',
    value as never,
    {
      maximumBytes: 1_048_576,
      maximumDepth: 32,
      maximumNodes: 16_384,
      maximumKeysPerObject: 256,
      maximumItemsPerArray: 4_096,
    }
  );
}

function token(value: unknown): value is string {
  return (
    typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)
  );
}
