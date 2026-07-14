import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryEventBus } from '@agentplat/events';
import {
  BoundedContextBuilder,
  InMemoryRoomRepository,
  RoomService,
} from '@agentplat/rooms';
import { createMockRuntime } from '@agentplat/runtime-mock';
import { DefaultAgentRuntime } from '@agentplat/runtime';

function fixture(options = {}) {
  let sequence = 0;
  const repository = new InMemoryRoomRepository();
  const eventBus = new InMemoryEventBus();
  const service = new RoomService({
    repository,
    eventPublisher: eventBus,
    runtime: createMockRuntime(),
    idGenerator: () => `id-${++sequence}`,
    clock: () =>
      new Date(`2026-07-14T12:00:${String(sequence).padStart(2, '0')}.000Z`),
    ...options,
  });
  return { repository, eventBus, service };
}

async function createRoomTeam(service, tenantId = 'tenant-a') {
  const room = await service.createRoom(tenantId, {
    title: 'Launch room',
    goal: 'Prepare a launch brief',
    createdBy: 'human-a',
  });
  const human = await service.addParticipant(tenantId, room.id, {
    id: 'human-a',
    type: 'human',
    displayName: 'Human approver',
    role: 'owner',
    authorityLevel: 10,
    permissions: ['*'],
  });
  const agent = await service.addParticipant(tenantId, room.id, {
    id: 'agent-a',
    type: 'agent',
    displayName: 'Research agent',
    role: 'researcher',
    memoryScope: 'agent',
    runtime: { platform: 'mock', instructions: 'Be concise' },
  });
  return { room, human, agent };
}

test('room lifecycle and recursive delegation reject invalid transitions', async () => {
  const { service } = fixture();
  const parent = await service.createRoom('tenant-a', {
    title: 'Parent',
    goal: 'Delegate',
  });
  const child = await service.createRoom('tenant-a', {
    parentRoomId: parent.id,
    title: 'Child',
    goal: 'Do delegated work',
  });

  assert.equal(child.parentRoomId, parent.id);
  await assert.rejects(
    service.resumeRoom('tenant-a', parent.id),
    (error) => error.code === 'CONFLICT'
  );
  assert.equal(
    (await service.pauseRoom('tenant-a', parent.id)).status,
    'paused'
  );
  assert.equal(
    (await service.resumeRoom('tenant-a', parent.id)).status,
    'active'
  );
  assert.deepEqual(
    (await service.listEvents('tenant-a', parent.id)).map(
      (event) => event.type
    ),
    ['room_created', 'room_paused', 'room_resumed']
  );
});

test('repository and service preserve tenant isolation', async () => {
  const { service } = fixture();
  const room = await service.createRoom('tenant-a', {
    title: 'Private',
    goal: 'Stay isolated',
  });
  await assert.rejects(
    service.getRoomState('tenant-b', room.id),
    (error) => error.code === 'NOT_FOUND'
  );
  assert.equal((await service.listRooms('tenant-b')).length, 0);
});

test('full mocked Agent Room flow creates, approves and archives an artifact', async () => {
  const { service, eventBus } = fixture();
  const { room, human, agent } = await createRoomTeam(service);
  await service.sendMessage('tenant-a', room.id, {
    authorParticipantId: human.id,
    role: 'human',
    content: 'Focus on the launch risks.',
  });
  const task = await service.createTask('tenant-a', room.id, {
    stepId: 'research',
    assignedParticipantId: agent.id,
    instruction: 'Draft the launch brief',
    expectedOutput: 'A concise brief',
    expectedArtifactKind: 'launch-brief',
    acceptanceCriteria: ['Includes risks'],
  });

  const run = await service.runTask('tenant-a', room.id, task.id);
  assert.equal(run.status, 'completed');
  let state = await service.getRoomState('tenant-a', room.id);
  assert.equal(state.artifacts.length, 1);
  assert.equal(state.artifacts[0].versions.length, 1);
  assert.equal(state.contextSnapshots.length, 1);

  const approval = await service.requestApproval('tenant-a', room.id, {
    targetType: 'artifact',
    targetId: state.artifacts[0].id,
    requestedBy: agent.id,
  });
  await service.resolveApproval('tenant-a', approval.id, 'approved', {
    decidedBy: human.id,
    comment: 'Ready to publish',
  });
  assert.equal(
    (await service.getRoomState('tenant-a', room.id)).artifacts[0].status,
    'approved'
  );

  assert.equal(
    (await service.completeRoom('tenant-a', room.id, human.id)).status,
    'completed'
  );
  assert.equal(
    (await service.archiveRoom('tenant-a', room.id, human.id)).status,
    'archived'
  );
  state = await service.getRoomState('tenant-a', room.id);
  assert.equal(state.room.status, 'archived');
  assert.ok(state.events.some((event) => event.type === 'task_run_started'));
  assert.ok(state.events.some((event) => event.type === 'approval_granted'));
  assert.equal(eventBus.listPublished().length, state.events.length);
});

test('privileged task execution is denied unless explicitly allowed', async () => {
  const { service } = fixture();
  const { room, agent } = await createRoomTeam(service);
  const denied = await service.createTask('tenant-a', room.id, {
    stepId: 'publish',
    assignedParticipantId: agent.id,
    instruction: 'Publish externally',
    expectedOutput: 'Published item',
    expectedArtifactKind: 'publication',
    actionLevel: 'external_write',
  });
  await assert.rejects(
    service.runTask('tenant-a', room.id, denied.id),
    (error) => error.code === 'FORBIDDEN'
  );

  await service.createPolicy('tenant-a', room.id, {
    name: 'Publishing policy',
    allowedActions: ['task.run.external_write'],
  });
  assert.equal(
    (await service.runTask('tenant-a', room.id, denied.id)).status,
    'completed'
  );
});

test('context assembly is bounded and carries selected provenance', async () => {
  const { service } = fixture({
    contextBuilder: new BoundedContextBuilder({
      transcriptLimit: 2,
      memoryLimit: 1,
    }),
  });
  const { room, human, agent } = await createRoomTeam(service);
  for (const content of ['one', 'two', 'three']) {
    await service.sendMessage('tenant-a', room.id, {
      authorParticipantId: human.id,
      role: 'human',
      content,
    });
  }
  await service.writeMemory('tenant-a', room.id, {
    scope: 'room',
    content: 'older',
    source: 'test',
  });
  await service.writeMemory('tenant-a', room.id, {
    scope: 'room',
    content: 'newer',
    source: 'test',
  });
  const task = await service.createTask('tenant-a', room.id, {
    stepId: 'bounded',
    assignedParticipantId: agent.id,
    instruction: 'Use bounded context',
    expectedOutput: 'Result',
    expectedArtifactKind: 'note',
  });
  await service.runTask('tenant-a', room.id, task.id);
  const state = await service.getRoomState('tenant-a', room.id);
  const context = state.contextSnapshots[0].context;
  assert.deepEqual(
    context.transcript.map((message) => message.content),
    ['two', 'three']
  );
  assert.equal(context.memory.length, 1);
  assert.deepEqual(
    context.provenance.messageIds,
    context.transcript.map((message) => message.id)
  );
});

test('only human room participants can resolve approvals', async () => {
  const { service } = fixture();
  const { room, agent } = await createRoomTeam(service);
  const artifact = await service.createArtifact('tenant-a', room.id, {
    type: 'brief',
    title: 'Draft',
    content: 'draft',
    createdBy: agent.id,
  });
  const approval = await service.requestApproval('tenant-a', room.id, {
    targetType: 'artifact',
    targetId: artifact.id,
  });
  await assert.rejects(
    service.resolveApproval('tenant-a', approval.id, 'approved', {
      decidedBy: agent.id,
    }),
    (error) => error.code === 'FORBIDDEN'
  );
});

test('agent-scoped memory never leaks to another participant', async () => {
  const { service } = fixture();
  const { room, agent } = await createRoomTeam(service);
  await service.addParticipant('tenant-a', room.id, {
    id: 'agent-b',
    type: 'agent',
    displayName: 'Second agent',
    role: 'researcher',
    memoryScope: 'agent',
    runtime: { platform: 'mock' },
  });
  await service.writeMemory('tenant-a', room.id, {
    scope: 'agent',
    scopeId: agent.id,
    content: 'visible to agent A',
    source: 'test',
  });
  await service.writeMemory('tenant-a', room.id, {
    scope: 'agent',
    scopeId: 'agent-b',
    content: 'private to agent B',
    source: 'test',
  });
  const task = await service.createTask('tenant-a', room.id, {
    stepId: 'private-context',
    assignedParticipantId: agent.id,
    instruction: 'Use only your memory',
    expectedOutput: 'Note',
    expectedArtifactKind: 'note',
  });
  await service.runTask('tenant-a', room.id, task.id);
  const context = (await service.getRoomState('tenant-a', room.id))
    .contextSnapshots[0].context;
  assert.deepEqual(
    context.memory.map((entry) => entry.content),
    ['visible to agent A']
  );
});

test('a task can only be claimed by one concurrent run', async () => {
  const { service } = fixture();
  const { room, agent } = await createRoomTeam(service);
  const task = await service.createTask('tenant-a', room.id, {
    stepId: 'single-claim',
    assignedParticipantId: agent.id,
    instruction: 'Run once',
    expectedOutput: 'Note',
    expectedArtifactKind: 'note',
  });

  const outcomes = await Promise.allSettled([
    service.runTask('tenant-a', room.id, task.id),
    service.runTask('tenant-a', room.id, task.id),
  ]);
  assert.equal(
    outcomes.filter((result) => result.status === 'fulfilled').length,
    1
  );
  assert.equal(
    outcomes.filter((result) => result.status === 'rejected').length,
    1
  );
  const state = await service.getRoomState('tenant-a', room.id);
  assert.equal(state.runs.length, 1);
  assert.equal(state.artifacts.length, 1);
});

test('repository transactions are tenant-bound and returned data is detached', async () => {
  const { repository, service } = fixture();
  const room = await service.createRoom('tenant-a', {
    title: 'Immutable read',
    goal: 'Protect repository state',
  });
  room.title = 'mutated by caller';
  assert.equal(
    (await service.getRoomState('tenant-a', room.id)).room.title,
    'Immutable read'
  );

  await assert.rejects(
    repository.transaction('tenant-a', (transaction) =>
      transaction.getRoom('tenant-b', room.id)
    ),
    (error) => error.code === 'FORBIDDEN'
  );
});

test('artifact approval targets one immutable version and gates room completion', async () => {
  const { service } = fixture();
  const { room, human } = await createRoomTeam(service);
  const artifact = await service.createArtifact('tenant-a', room.id, {
    type: 'brief',
    title: 'Versioned brief',
    content: 'v1',
  });

  await assert.rejects(
    service.completeRoom('tenant-a', room.id),
    (error) => error.code === 'CONFLICT'
  );
  const approval = await service.requestApproval('tenant-a', room.id, {
    targetType: 'artifact',
    targetId: artifact.id,
  });
  assert.equal(approval.targetVersion, 1);
  await assert.rejects(
    service.createArtifactVersion('tenant-a', room.id, artifact.id, {
      content: 'v2',
    }),
    (error) => error.code === 'CONFLICT'
  );
  await assert.rejects(
    service.requestApproval('tenant-a', room.id, {
      targetType: 'artifact',
      targetId: artifact.id,
    }),
    (error) => error.code === 'CONFLICT'
  );
  await service.resolveApproval('tenant-a', approval.id, 'approved', {
    decidedBy: human.id,
  });
  assert.equal(
    (await service.completeRoom('tenant-a', room.id)).status,
    'completed'
  );
});

test('organization memory is shared across rooms in one tenant only', async () => {
  const { service } = fixture();
  const first = await createRoomTeam(service);
  await service.createPolicy('tenant-a', first.room.id, {
    name: 'Organization memory',
    memoryAccessRules: ['organization'],
  });
  await service.writeMemory('tenant-a', first.room.id, {
    scope: 'organization',
    content: 'tenant-wide fact',
    source: 'policy',
  });

  const second = await service.createRoom('tenant-a', {
    title: 'Second room',
    goal: 'Reuse governed memory',
  });
  assert.equal(
    (await service.getRoomState('tenant-a', second.id)).memory.length,
    1
  );
  const foreign = await service.createRoom('tenant-b', {
    title: 'Foreign room',
    goal: 'Remain isolated',
  });
  assert.equal(
    (await service.getRoomState('tenant-b', foreign.id)).memory.length,
    0
  );
});

test('event publisher and observability hook failures cannot reverse committed state', async () => {
  const repository = new InMemoryRoomRepository();
  const service = new RoomService({
    repository,
    eventPublisher: {
      publish: async () => {
        throw new Error('offline');
      },
    },
    onEventPublishError: () => {
      throw new Error('logging failed');
    },
  });
  const room = await service.createRoom('tenant-a', {
    title: 'Durable room',
    goal: 'Commit before publish',
  });
  assert.equal(
    (await service.getRoomState('tenant-a', room.id)).events.length,
    1
  );
});

test('runtime timeout marks the task and run failed instead of leaving them running', async () => {
  const runtime = new DefaultAgentRuntime();
  let aborted = false;
  runtime.registerProvider('mock', {
    run: async (_agent, _input, context) =>
      new Promise((_resolve, reject) => {
        context.signal.addEventListener('abort', () => {
          aborted = true;
          reject(context.signal.reason);
        });
      }),
  });
  const { service } = fixture({ runtime, runTimeoutMs: 5 });
  const { room, agent } = await createRoomTeam(service);
  const task = await service.createTask('tenant-a', room.id, {
    stepId: 'timeout',
    assignedParticipantId: agent.id,
    instruction: 'Never returns',
    expectedOutput: 'Nothing',
    expectedArtifactKind: 'note',
  });

  await assert.rejects(
    service.runTask('tenant-a', room.id, task.id),
    /timed out/
  );
  const state = await service.getRoomState('tenant-a', room.id);
  assert.equal(aborted, true);
  assert.equal(state.tasks[0].status, 'failed');
  assert.equal(state.runs[0].status, 'failed');
});

test('an expired run lease is recovered when the task is retried', async () => {
  const { service, repository } = fixture();
  const { room, agent } = await createRoomTeam(service);
  const task = await service.createTask('tenant-a', room.id, {
    stepId: 'recover',
    assignedParticipantId: agent.id,
    instruction: 'Recover this handoff',
    expectedOutput: 'Recovered',
    expectedArtifactKind: 'note',
  });
  await repository.transaction('tenant-a', async (transaction) => {
    await transaction.updateTask({
      ...task,
      status: 'running',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });
    await transaction.insertRun({
      id: 'stale-run',
      tenantId: 'tenant-a',
      roomId: room.id,
      taskId: task.id,
      participantId: agent.id,
      runtime: 'mock',
      status: 'running',
      startedAt: '2020-01-01T00:00:00.000Z',
      leaseExpiresAt: '2020-01-01T00:05:00.000Z',
    });
  });

  assert.equal(
    (await service.runTask('tenant-a', room.id, task.id)).status,
    'completed'
  );
  const state = await service.getRoomState('tenant-a', room.id);
  assert.deepEqual(
    state.runs.map((run) => run.status),
    ['failed', 'completed']
  );
  assert.ok(
    state.events.some(
      (event) =>
        event.type === 'task_run_failed' && event.payload.recovered === true
    )
  );
});

test('a parent room cannot complete while a subroom is still active', async () => {
  const { service } = fixture();
  const parent = await service.createRoom('tenant-a', {
    title: 'Parent',
    goal: 'Coordinate delegated work',
  });
  const child = await service.createRoom('tenant-a', {
    parentRoomId: parent.id,
    title: 'Child',
    goal: 'Finish delegated work',
  });

  await assert.rejects(
    service.completeRoom('tenant-a', parent.id),
    (error) => error.code === 'CONFLICT'
  );
  await service.completeRoom('tenant-a', child.id);
  assert.equal(
    (await service.completeRoom('tenant-a', parent.id)).status,
    'completed'
  );
});

test('executable tasks reject direct assignment to human participants', async () => {
  const { service } = fixture();
  const { room, human } = await createRoomTeam(service);

  await assert.rejects(
    service.createTask('tenant-a', room.id, {
      stepId: 'human-only',
      assignedParticipantId: human.id,
      instruction: 'Perform a manual review',
      expectedOutput: 'A decision',
      expectedArtifactKind: 'decision',
    }),
    (error) => error.code === 'VALIDATION_ERROR'
  );
});

test('the service clock also governs memory expiration in runtime context', async () => {
  let now = new Date('2026-07-14T12:00:00.000Z');
  const { service } = fixture({ clock: () => now });
  const { room, agent } = await createRoomTeam(service);
  await service.writeMemory('tenant-a', room.id, {
    scope: 'room',
    content: 'Temporary context',
    source: 'test',
    retention: 'until',
    retainUntil: '2026-07-14T12:01:00.000Z',
  });
  const task = await service.createTask('tenant-a', room.id, {
    stepId: 'expired-memory',
    assignedParticipantId: agent.id,
    instruction: 'Build without stale context',
    expectedOutput: 'A note',
    expectedArtifactKind: 'note',
  });

  now = new Date('2026-07-14T12:02:00.000Z');
  await service.runTask('tenant-a', room.id, task.id);
  const state = await service.getRoomState('tenant-a', room.id);
  assert.equal(state.contextSnapshots[0].context.memory.length, 0);
});

test('multi-event publication preserves durable event order', async () => {
  const observed = [];
  const eventPublisher = {
    publish: async (event) => {
      if (event.type === 'task_created') {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      observed.push(event.type);
    },
  };
  const { service } = fixture({ eventPublisher });
  const { room, agent } = await createRoomTeam(service);
  await service.createTask('tenant-a', room.id, {
    stepId: 'ordered-events',
    assignedParticipantId: agent.id,
    instruction: 'Keep event ordering',
    expectedOutput: 'A note',
    expectedArtifactKind: 'note',
  });

  assert.deepEqual(observed.slice(-2), ['task_created', 'task_assigned']);
});

test('a slow started-event publisher cannot cause duplicate runtime execution', async () => {
  let runtimeCalls = 0;
  let now = new Date('2026-07-14T12:00:00.000Z');
  let releaseFirstPublish;
  let reportFirstPublish;
  let startedPublications = 0;
  const firstPublishStarted = new Promise((resolve) => {
    reportFirstPublish = resolve;
  });
  const firstPublishRelease = new Promise((resolve) => {
    releaseFirstPublish = resolve;
  });
  const runtime = new DefaultAgentRuntime();
  runtime.registerProvider('mock', {
    run: async () => {
      runtimeCalls += 1;
      return { status: 'completed', output: 'Only once' };
    },
  });
  const eventPublisher = {
    publish: async (event) => {
      if (event.type === 'task_run_started' && ++startedPublications === 1) {
        reportFirstPublish();
        await firstPublishRelease;
      }
    },
  };
  const { service } = fixture({
    runtime,
    eventPublisher,
    clock: () => now,
    runTimeoutMs: 20,
  });
  const { room, agent } = await createRoomTeam(service);
  const task = await service.createTask('tenant-a', room.id, {
    stepId: 'slow-publisher',
    assignedParticipantId: agent.id,
    instruction: 'Run once',
    expectedOutput: 'One result',
    expectedArtifactKind: 'note',
  });

  const first = service.runTask('tenant-a', room.id, task.id);
  await firstPublishStarted;
  now = new Date('2026-07-14T12:00:00.021Z');
  const second = await service.runTask('tenant-a', room.id, task.id);
  releaseFirstPublish();

  assert.equal(runtimeCalls, 1);
  assert.equal(second.status, 'completed');
  await assert.rejects(first, (error) => error.code === 'CONFLICT');
});
