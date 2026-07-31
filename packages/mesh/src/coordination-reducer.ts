import type {
  MeshCoordinationState,
  MeshCoordinationTimerDecision,
  MeshCoordinationTimerFiredInput,
} from './coordination-contracts.js';
import { assertFrozenMeshCoordinationState } from './coordination-state.js';
import {
  assertMeshLogicalTime,
  createFrozenRecord,
  recordEntries,
} from './state.js';

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/;

/**
 * Evaluates one driver-supplied timer generation without reading a host clock.
 * It does not schedule host work; driver integration is added by the workflow
 * increment that first creates a timer.
 */
export function evaluateMeshCoordinationTimer(
  state: MeshCoordinationState,
  input: MeshCoordinationTimerFiredInput,
  logicalTime: number
): MeshCoordinationTimerDecision {
  assertFrozenMeshCoordinationState(state);
  assertMeshLogicalTime(logicalTime);
  if (logicalTime < state.lastLogicalTime) {
    throw new RangeError(
      'Mesh coordination logical time cannot move backwards'
    );
  }
  if (
    !input ||
    typeof input !== 'object' ||
    input.kind !== 'timer.fired' ||
    typeof input.timerId !== 'string' ||
    !identifierPattern.test(input.timerId) ||
    input.timerId.length > 256 ||
    !Number.isSafeInteger(input.generation) ||
    input.generation < 1
  ) {
    throw new TypeError('Invalid Mesh coordination timer input');
  }

  const timer = state.timers[input.timerId];
  if (!timer) return rejection(state, 'timer_unknown');
  if (timer.generation !== input.generation) {
    return rejection(state, 'timer_generation_stale');
  }
  if (logicalTime < timer.dueAt) {
    return rejection(state, 'timer_not_due');
  }
  if (state.journal.length >= state.limits.maximumJournalEntries) {
    return rejection(state, 'journal_capacity_exceeded');
  }
  if (state.localEventSequence >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Mesh coordination event sequence exhausted');
  }

  const sequence = state.localEventSequence + 1;
  const journalEntry = Object.freeze({
    sequence,
    occurredAt: logicalTime,
    kind: 'timer.fired' as const,
    domainRecordKey: timer.domainRecordKey,
    timerId: timer.timerId,
  });
  const nextState = Object.freeze({
    ...state,
    timers: createFrozenRecord(
      recordEntries(state.timers).filter(
        ([timerId]) => timerId !== input.timerId
      )
    ),
    journal: Object.freeze([...state.journal, journalEntry]),
    localEventSequence: sequence,
    lastLogicalTime: logicalTime,
  });
  return Object.freeze({
    accepted: true,
    timer,
    state: nextState,
  });
}

function rejection(
  state: MeshCoordinationState,
  code:
    | 'timer_unknown'
    | 'timer_generation_stale'
    | 'timer_not_due'
    | 'journal_capacity_exceeded'
): MeshCoordinationTimerDecision {
  return Object.freeze({
    accepted: false,
    code,
    state,
  });
}
