import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemoryRoomRepository,
  RepositoryAgentRoomCoordinationStore,
  RoomService,
} from '@agentplat/rooms';

test('persisted human message enters the coordination inbox in the same repository transaction', async () => {
  const repository = new InMemoryRoomRepository();
  const service = new RoomService({
    repository,
    automaticCoordination: {},
  });
  const room = await service.createRoom('tenant-1', {
    title: 'Automatic coordination',
    goal: 'Route messages without manual enqueue',
  });
  const message = await service.sendMessage('tenant-1', room.id, {
    role: 'human',
    content: 'Start automatically.',
  });
  const coordination = await new RepositoryAgentRoomCoordinationStore(
    repository
  ).load('tenant-1', room.id, `room:${room.id}`);
  assert.equal(coordination.revision, 0);
  assert.deepEqual(coordination.items[0], {
    itemId: `message:${message.id}`,
    kind: 'message',
    referenceId: message.id,
    status: 'pending',
    operationId: `room:${room.id}:message:message:${message.id}`,
    attempts: 0,
    runIds: [],
  });
});

test('coordination inbox failure rolls back the message and its domain event', async () => {
  const delegate = new InMemoryRoomRepository();
  const repository = {
    ...delegate,
    transaction: (tenantId, work) =>
      delegate.transaction(tenantId, (transaction) =>
        work(
          new Proxy(transaction, {
            get(target, property, receiver) {
              if (property === 'saveAgentRoomCoordinationState') {
                return async () => {
                  throw new Error('forced inbox failure');
                };
              }
              const value = Reflect.get(target, property, receiver);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          })
        )
      ),
    getRoom: delegate.getRoom.bind(delegate),
    listRooms: delegate.listRooms.bind(delegate),
    getRoomState: delegate.getRoomState.bind(delegate),
    getParticipant: delegate.getParticipant.bind(delegate),
    getTask: delegate.getTask.bind(delegate),
    getArtifact: delegate.getArtifact.bind(delegate),
    getApproval: delegate.getApproval.bind(delegate),
    listEvents: delegate.listEvents.bind(delegate),
  };
  const service = new RoomService({ repository, automaticCoordination: {} });
  const room = await service.createRoom('tenant-1', {
    title: 'Rollback',
    goal: 'Rollback failed inbox mutation',
  });
  await assert.rejects(
    service.sendMessage('tenant-1', room.id, {
      role: 'human',
      content: 'This must roll back.',
    }),
    /forced inbox failure/
  );
  const state = await delegate.getRoomState('tenant-1', room.id);
  assert.equal(state.messages.length, 0);
  assert.deepEqual(
    state.events.map((event) => event.type),
    ['room_created']
  );
});
