import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';

import {
  DEFAULT_MESH_COORDINATION_LIMITS,
  createMeshCoordinationState,
  evaluateMeshCoordinationTimer,
  restoreMeshCoordinationState,
} from '@agentplat/mesh/coordination';

function messageId(value) {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(12, value);
  return Buffer.from(bytes).toString('base64url');
}

function identity() {
  return {
    tenantId: 'tenant-a',
    meshId: 'mesh-a',
    peerId: 'peer-a',
    instanceId: 'instance-a',
    keyId: 'key-a',
  };
}

function timerSnapshot({
  dueAt = 10,
  generation = 1,
  journal = [],
  limits = DEFAULT_MESH_COORDINATION_LIMITS,
  timers,
} = {}) {
  const recordKey = JSON.stringify(['capability.advertise', 'capability-a']);
  const domainRecords = {
    [recordKey]: {
      recordKey,
      recordType: 'capability.advertise',
      recordId: 'capability-a',
      contentDigest: 'A'.repeat(43),
      messageId: messageId(1),
      acceptedAt: 0,
    },
  };
  return {
    schemaVersion: 1,
    identity: identity(),
    domainRecords,
    timers: timers ?? {
      'timer-a': {
        timerId: 'timer-a',
        kind: 'capability.expiry',
        dueAt,
        generation,
        domainRecordKey: recordKey,
      },
    },
    journal,
    limits,
    localEventSequence: journal.length,
    lastLogicalTime: 0,
  };
}

test('coordination state is additive, bounded and deeply immutable', () => {
  const state = createMeshCoordinationState({ identity: identity() });

  assert.equal(state.schemaVersion, 1);
  assert.deepEqual(state.limits, DEFAULT_MESH_COORDINATION_LIMITS);
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.identity), true);
  assert.equal(Object.isFrozen(state.domainRecords), true);
  assert.equal(Object.isFrozen(state.timers), true);
  assert.equal(Object.isFrozen(state.journal), true);
  assert.equal(Object.isFrozen(state.limits), true);
  assert.equal(Object.getPrototypeOf(state.domainRecords), null);
  assert.equal(Object.getPrototypeOf(state.timers), null);

  assert.throws(
    () =>
      createMeshCoordinationState({
        identity: identity(),
        limits: { maximumTimers: 0 },
      }),
    /must be between 1/u
  );
  assert.throws(
    () =>
      createMeshCoordinationState({
        identity: identity(),
        limits: {
          maximumTimers: DEFAULT_MESH_COORDINATION_LIMITS.maximumTimers + 1,
        },
      }),
    /must be between 1/u
  );
});

test('snapshot restoration is strict, bounded and canonical', () => {
  const restored = restoreMeshCoordinationState(timerSnapshot());
  assert.equal(Object.isFrozen(restored.domainRecords), true);
  assert.equal(Object.isFrozen(Object.values(restored.domainRecords)[0]), true);
  assert.equal(Object.isFrozen(restored.timers['timer-a']), true);
  assert.equal(Object.getPrototypeOf(restored.domainRecords), null);
  assert.equal(Object.getPrototypeOf(restored.timers), null);

  assert.throws(
    () =>
      restoreMeshCoordinationState({
        ...timerSnapshot(),
        unexpected: true,
      }),
    /unsupported fields/u
  );
  assert.throws(
    () =>
      restoreMeshCoordinationState({
        ...timerSnapshot(),
        journal: [
          {
            sequence: 1,
            occurredAt: 0,
            kind: 'timer.fired',
          },
        ],
        localEventSequence: 1,
      }),
    /journal entry is invalid/u
  );
  assert.throws(
    () =>
      restoreMeshCoordinationState({
        ...timerSnapshot(),
        domainRecords: {
          ...timerSnapshot().domainRecords,
          [JSON.stringify(['objective.announce', 'objective-b'])]: {
            ...Object.values(timerSnapshot().domainRecords)[0],
            recordKey: JSON.stringify(['objective.announce', 'objective-b']),
            recordId: 'objective-b',
            contentDigest: 'not-a-digest',
          },
        },
      }),
    /domain record is invalid/u
  );
  assert.throws(
    () =>
      restoreMeshCoordinationState({
        ...timerSnapshot(),
        timers: {
          'timer-a': {
            ...timerSnapshot().timers['timer-a'],
            domainRecordKey: 'missing',
          },
        },
      }),
    /timer is invalid/u
  );
  assert.throws(
    () =>
      restoreMeshCoordinationState({
        ...timerSnapshot(),
        domainRecords: {},
        timers: {
          'timer-a': {
            ...timerSnapshot().timers['timer-a'],
            domainRecordKey: 'toString',
          },
        },
      }),
    /timer is invalid/u
  );
  assert.throws(
    () =>
      restoreMeshCoordinationState({
        ...timerSnapshot(),
        limits: {},
      }),
    /unsupported fields/u
  );
  assert.throws(
    () =>
      restoreMeshCoordinationState(
        timerSnapshot({
          limits: {
            maximumDomainRecords: 1,
            maximumTimers: 1,
            maximumJournalEntries: 1,
          },
          timers: {
            'timer-a': timerSnapshot().timers['timer-a'],
            'timer-b': {
              ...timerSnapshot().timers['timer-a'],
              timerId: 'timer-b',
            },
          },
        })
      ),
    /exceeds its limits/u
  );
});

test('trusted timer evaluation is generation-fenced and fail-closed', () => {
  const state = restoreMeshCoordinationState(timerSnapshot());

  for (const [input, logicalTime, code] of [
    [
      { kind: 'timer.fired', timerId: 'missing', generation: 1 },
      10,
      'timer_unknown',
    ],
    [
      { kind: 'timer.fired', timerId: 'timer-a', generation: 2 },
      10,
      'timer_generation_stale',
    ],
    [
      { kind: 'timer.fired', timerId: 'timer-a', generation: 1 },
      9,
      'timer_not_due',
    ],
  ]) {
    const rejected = evaluateMeshCoordinationTimer(state, input, logicalTime);
    assert.deepEqual(rejected, { accepted: false, code, state });
    assert.equal(rejected.state, state);
    assert.equal(state.journal.length, 0);
    assert.equal(state.timers['timer-a'].generation, 1);
  }

  const exact = evaluateMeshCoordinationTimer(
    state,
    { kind: 'timer.fired', timerId: 'timer-a', generation: 1 },
    10
  );
  assert.equal(exact.accepted, true);
  assert.equal(exact.state.timers['timer-a'], undefined);
  assert.deepEqual(exact.state.journal, [
    {
      sequence: 1,
      occurredAt: 10,
      kind: 'timer.fired',
      domainRecordKey: exact.timer.domainRecordKey,
      timerId: 'timer-a',
    },
  ]);
  assert.equal(Object.isFrozen(exact.state), true);
  assert.equal(Object.isFrozen(exact.state.journal), true);
  assert.equal(Object.isFrozen(exact.state.journal[0]), true);

  const duplicate = evaluateMeshCoordinationTimer(
    exact.state,
    { kind: 'timer.fired', timerId: 'timer-a', generation: 1 },
    11
  );
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.code, 'timer_unknown');
  assert.equal(duplicate.state, exact.state);

  const late = evaluateMeshCoordinationTimer(
    restoreMeshCoordinationState(timerSnapshot()),
    { kind: 'timer.fired', timerId: 'timer-a', generation: 1 },
    11
  );
  assert.equal(late.accepted, true);
});

test('generic timer evaluation cannot consume workflow-owned timers', () => {
  const recordKey = JSON.stringify([
    'objective.announce',
    'objective-document-a',
  ]);
  const state = restoreMeshCoordinationState({
    ...timerSnapshot(),
    domainRecords: {
      [recordKey]: {
        recordKey,
        recordType: 'objective.announce',
        recordId: 'objective-document-a',
        objectiveId: 'objective-a',
        contentDigest: 'A'.repeat(43),
        messageId: messageId(1),
        acceptedAt: 0,
      },
    },
    timers: {
      'objective:11:objective-a:expiry': {
        timerId: 'objective:11:objective-a:expiry',
        kind: 'objective.expiry',
        dueAt: 10,
        generation: 1,
        domainRecordKey: recordKey,
      },
      'work:11:objective-a:11:work-item-a:deadline': {
        timerId: 'work:11:objective-a:11:work-item-a:deadline',
        kind: 'work.deadline',
        dueAt: 10,
        generation: 1,
        domainRecordKey: recordKey,
      },
    },
  });

  for (const timerId of Object.keys(state.timers)) {
    const decision = evaluateMeshCoordinationTimer(
      state,
      { kind: 'timer.fired', timerId, generation: 1 },
      10
    );
    assert.deepEqual(decision, {
      accepted: false,
      code: 'timer_owned_by_workflow',
      state,
    });
    assert.equal(decision.state, state);
    assert.equal(state.timers[timerId].generation, 1);
  }
  assert.equal(state.journal.length, 0);
  assert.equal(state.localEventSequence, 0);
  assert.equal(state.lastLogicalTime, 0);
});

test('journal exhaustion cannot consume a due timer', () => {
  const base = timerSnapshot({
    limits: {
      maximumDomainRecords: 1,
      maximumTimers: 1,
      maximumJournalEntries: 1,
    },
  });
  const recordKey = Object.keys(base.domainRecords)[0];
  const state = restoreMeshCoordinationState({
    ...base,
    journal: [
      {
        sequence: 1,
        occurredAt: 0,
        kind: 'command.accepted',
        domainRecordKey: recordKey,
      },
    ],
    localEventSequence: 1,
  });
  const result = evaluateMeshCoordinationTimer(
    state,
    { kind: 'timer.fired', timerId: 'timer-a', generation: 1 },
    10
  );

  assert.deepEqual(result, {
    accepted: false,
    code: 'journal_capacity_exceeded',
    state,
  });
  assert.equal(result.state, state);
  assert.equal(state.timers['timer-a'].generation, 1);
  assert.equal(state.journal.length, 1);
});

test('timer evaluation rejects forged mutable snapshots', () => {
  assert.throws(
    () =>
      evaluateMeshCoordinationTimer(
        timerSnapshot(),
        { kind: 'timer.fired', timerId: 'timer-a', generation: 1 },
        10
      ),
    /immutable snapshot/u
  );
  const state = restoreMeshCoordinationState(timerSnapshot());
  assert.throws(
    () =>
      evaluateMeshCoordinationTimer(
        state,
        {
          kind: 'timer.fired',
          timerId: 'a'.repeat(769),
          generation: 1,
        },
        10
      ),
    /Invalid Mesh coordination timer input/u
  );
});
