import assert from 'node:assert/strict';
import { AgentRoomCoordinationRuntime, RoomService } from '@agentplat/rooms';
import {
  createPostgresPool,
  PostgresAgentRoomCoordinationStore,
  PostgresRoomRepository,
  runMigrations,
} from '@agentplat/rooms-postgres';

const phase = process.argv[2];
const tenantId = process.env.RECOVERY_TENANT_ID ?? 'restart-reference';
const roomId = 'restart-room';
const coordinationId = 'restart-coordination';
const pool = createPostgresPool();
const store = new PostgresAgentRoomCoordinationStore(pool);

try {
  await runMigrations(pool);
  if (phase === 'prepare') {
    const rooms = new RoomService({
      repository: new PostgresRoomRepository(pool),
    });
    await rooms.createRoom(tenantId, {
      id: roomId,
      title: 'Restart recovery Room',
      goal: 'Recover one expired coordination claim',
    });
    const runtime = coordinationRuntime(store);
    await runtime.initialize({ tenantId, roomId, coordinationId });
    await runtime.enqueue({
      tenantId,
      roomId,
      coordinationId,
      expectedRevision: 0,
      itemId: 'restart-item',
      kind: 'message',
      referenceId: 'message-1',
    });
    const current = await store.load(tenantId, roomId, coordinationId);
    const expired = {
      ...current,
      revision: current.revision + 1,
      status: 'routing',
      items: current.items.map((item) => ({
        ...item,
        status: 'processing',
        attempts: 1,
        leaseToken: 'terminated-process',
        leaseExpiresAt: '2000-01-01T00:00:00.000Z',
      })),
      updatedAt: new Date().toISOString(),
    };
    assert.equal(
      await store.compareAndSet({
        expectedRevision: current.revision,
        state: expired,
      }),
      true
    );
    console.log(JSON.stringify({ phase, revision: expired.revision }));
  } else if (phase === 'recover') {
    const runtime = coordinationRuntime(store);
    const current = await store.load(tenantId, roomId, coordinationId);
    const recovered = await runtime.runNext({
      tenantId,
      roomId,
      coordinationId,
      expectedRevision: current.revision,
      leaseToken: 'successor-process',
    });
    assert.equal(recovered.status, 'completed');
    assert.equal(recovered.items[0].attempts, 2);
    assert.equal(
      recovered.items[0].operationId,
      'restart-coordination:message:restart-item'
    );
    console.log(
      JSON.stringify({
        phase,
        revision: recovered.revision,
        attempts: recovered.items[0].attempts,
        operationId: recovered.items[0].operationId,
      })
    );
  } else {
    throw new Error('Expected prepare or recover phase');
  }
} finally {
  await pool.end();
}

function coordinationRuntime(coordinationStore) {
  return new AgentRoomCoordinationRuntime(
    coordinationStore,
    {
      routeMessage: async () => ({
        kind: 'assigned',
        participantIds: ['recovered-agent'],
        basis: 'router',
      }),
    },
    { get: async () => ({ status: 'accepted' }) },
    {
      dispatchMessage: async () => ({ status: 'completed', runIds: ['run-1'] }),
      dispatchHandoff: async () => ({ status: 'completed', runIds: ['run-1'] }),
    }
  );
}
