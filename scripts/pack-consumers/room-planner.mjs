import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createAgentRoomPlanner as frameworkPlanner } from '@agentplat/framework';
import {
  createAgentRoomPlanner,
  createRuntimeRoomPlannerReasoner,
  RoomService,
  roomPlannerBudget,
  priceRoomPlannerUsage,
  resolveRoomConversation,
  conversationReference,
} from '@agentplat/rooms';
import {
  createPostgresPool, runMigrations as migrateRooms,
  getMigrationStatus as roomsStatus, PostgresRoomRepository,
  PostgresRoomPlannerStore, PostgresRoomPlannerCallResults,
} from '@agentplat/rooms-postgres';
import {
  runMigrations as migrateWorkflows, getMigrationStatus as workflowsStatus,
  PostgresWorkflowStoreV1,
} from '@agentplat/workflows-postgres';
import { RoomPlannerWorkflowCalls } from '@agentplat/workflows-rooms';

assert.equal(process.env.AGENTPLAT_POSTGRES_TEST, '1');
assert.equal(frameworkPlanner, createAgentRoomPlanner);
for (const api of [
  createRuntimeRoomPlannerReasoner,
  roomPlannerBudget,
  priceRoomPlannerUsage,
  resolveRoomConversation,
  conversationReference,
])
  assert.equal(typeof api, 'function');
const roomsEntry = import.meta.resolve('@agentplat/rooms-postgres');
for (const migration of ['019_room_planner', '020_room_conversations'])
  for (const direction of ['up', 'down'])
    assert.ok(
      (
        await readFile(
          new URL(`../migrations/${migration}.${direction}.sql`, roomsEntry),
          'utf8',
        )
      ).length > 0,
    );

const schema = `planner_consumer_${randomUUID().replaceAll('-', '')}`;
const pool = createPostgresPool();
try {
  const options = { schema, createSchema: true };
  assert.equal((await migrateRooms(pool, options)).currentVersion, 20);
  assert.equal((await migrateWorkflows(pool, { schema, createSchema: false })).currentVersion, 1);
  // Reopening both ledgers must preserve the coordinated schema and require no new migration.
  await migrateRooms(pool, { schema, createSchema: false });
  await migrateWorkflows(pool, { schema, createSchema: false });
  for (const status of [await roomsStatus(pool, { schema }), await workflowsStatus(pool, { schema })])
    assert.deepEqual(status.pendingVersions, []);
  const service = new RoomService({ repository: new PostgresRoomRepository(pool, { schema }) });
  const room = await service.createRoom('planner-consumer', { title: 'Published cohort', goal: 'Verify durable Planner calls' });
  const scope = { tenantId: 'planner-consumer', roomId: room.id };
  const message = { id: 'same-nonce', idempotent: true, role: 'human', content: 'Draft once', metadata: { b: 2, a: 1 } };
  const messages = await Promise.all([service.sendMessage(scope.tenantId, room.id, message), service.sendMessage(scope.tenantId, room.id, message)]);
  assert.deepEqual(messages[0], messages[1]);
  await assert.rejects(
    service.sendMessage(scope.tenantId, room.id, {
      ...message,
      content: 'Changed',
    }),
    (e) => e.code === 'CONFLICT',
  );
  assert.equal(
    (await service.listEvents(scope.tenantId, room.id)).filter(
      (e) => e.type === 'message_created',
    ).length,
    1,
  );
  const root = await service.sendMessage(scope.tenantId, room.id, {
    id: 'thread-root',
    role: 'human',
    content: 'One conversation',
    startThread: true,
  });
  const reply = await service.sendMessage(scope.tenantId, room.id, {
    role: 'agent',
    content: 'One reply',
    replyToMessageId: root.id,
  });
  assert.equal(reply.threadId, root.id);
  const thread = await service.listMessages(scope.tenantId, room.id, {
    threadId: root.id,
    limit: 1,
  });
  assert.equal(thread.hasMore, true);
  assert.equal(
    (await service.getMessage(scope.tenantId, room.id, root.id)).threadId,
    root.id,
  );

  const planner = createAgentRoomPlanner({
    store: new PostgresRoomPlannerStore(pool, { schema }),
    reservationMicros: { reason: 10, task: 10, review: 10, direct: 10 },
    authorize: async () => {},
    reasoner: { propose: async () => { throw Error('Observation must not call the model'); } },
    resolveEvent: async (_, id) => ({ id, kind: 'message', actorId: 'owner', content: 'Draft once' }),
    context: async () => ({}), route: async () => [],
    execute: async () => { throw Error('No external work in this consumer'); },
    verify: async () => { throw Error('No model review in this consumer'); },
    deliver: async () => {},
  });
  await planner.configure(scope, { mode: 'observe', budgetLimitMicros: 100 });
  await planner.acceptEvent(scope, messages[0].id);
  await planner.acceptEvent(scope, messages[0].id);
  const reopened = new PostgresRoomPlannerStore(pool, { schema });
  assert.equal((await reopened.load(scope)).events.length, 1);
  assert.equal(await reopened.load({ ...scope, tenantId: 'foreign' }), undefined);
  let invocations = 0;
  const execute = async () => {
    invocations++;
    return { usage: { costMicros: 1, inputTokens: 1, outputTokens: 1 }, result: { content: 'Durable report' } };
  };
  const workflowOptions = () => ({
    store: new PostgresWorkflowStoreV1(pool, { schema }),
    results: new PostgresRoomPlannerCallResults(pool, { schema }),
    workerId: `worker-${randomUUID()}`, execute, assertCurrent: async () => {},
  });
  const call = {
    operationId: 'one-call',
    threadId: root.id,
    replyToMessageId: root.id,
    assertCurrent: async () => {},
  };
  const first = await new RoomPlannerWorkflowCalls(workflowOptions()).run(
    scope,
    call,
    { kind: 'task' },
  );
  assert.deepEqual(
    await new RoomPlannerWorkflowCalls(workflowOptions()).run(scope, call, {
      kind: 'task',
    }),
    first,
  );
  assert.equal(invocations, 1);
  await assert.rejects(
    new RoomPlannerWorkflowCalls(workflowOptions()).run(
      scope,
      { ...call, threadId: 'different-thread' },
      { kind: 'task' },
    ),
  );
  const tasks = await new PostgresWorkflowStoreV1(pool, {
    schema,
  }).listTaskRuns({ tenantId: scope.tenantId });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].status, 'completed');
  await assert.rejects(
    new PostgresRoomPlannerCallResults(pool, { schema }).put(
      scope,
      call.operationId,
      { changed: true },
    ),
  );
  console.log(
    'Room Planner package consumer passed public APIs, Rooms 020/workflows 001, native threads, idempotent intake, scoped persistence and workflow receipt recovery.',
  );
} finally {
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await pool.end();
}
