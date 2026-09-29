import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentDefinitionRegistry,
  AgentRoomHandoffCoordinator,
  DefaultAgentRoomCoordinationExecutionPort,
  InMemoryAgentDefinitionRegistryStore,
  InMemoryRoomExecutionSessionStore,
  InMemoryRoomHandoffStore,
  InMemoryRoomRepository,
  RoomExecutionCoordinator,
  RoomService,
} from '@agentplat/rooms';

test('default coordination execution creates deterministic task, run and execution session', async () => {
  let sequence = 0;
  const repository = new InMemoryRoomRepository();
  const rooms = new RoomService({
    repository,
    idGenerator: () => `generated-${++sequence}`,
    runtime: {
      registerProvider: () => undefined,
      stream: async function* () {},
      run: async (_agent, _input, context) => ({
        status: 'completed',
        output: `completed:${context.runId}`,
      }),
    },
  });
  const definitions = new AgentDefinitionRegistry(
    new InMemoryAgentDefinitionRegistryStore()
  );
  await definitions.createAgent({
    tenantId: 'tenant-1',
    agentId: 'agent-1',
    name: 'Agent One',
  });
  const draft = await definitions.createRevision({
    tenantId: 'tenant-1',
    agentId: 'agent-1',
    version: '1.0.0',
    instructions: 'Complete assigned work.',
    runtimeProfile: { platform: 'mock' },
  });
  await definitions.publishRevision('tenant-1', draft.definition.revisionId, 0);
  const room = await rooms.createRoom('tenant-1', {
    title: 'Coordination',
    goal: 'Complete routed work',
  });
  const participant = await rooms.addParticipant('tenant-1', room.id, {
    type: 'agent',
    displayName: 'Agent One',
    role: 'worker',
    permissions: ['task.run'],
    runtime: { platform: 'mock' },
    metadata: { agentId: 'agent-1' },
  });
  const message = await rooms.sendMessage('tenant-1', room.id, {
    role: 'human',
    content: 'Prepare the result.',
  });
  const sessions = new RoomExecutionCoordinator(
    rooms,
    new InMemoryRoomExecutionSessionStore(),
    { agentRegistry: definitions }
  );
  const handoffs = new AgentRoomHandoffCoordinator(
    rooms,
    new InMemoryRoomHandoffStore(),
    definitions
  );
  const execution = new DefaultAgentRoomCoordinationExecutionPort(
    rooms,
    definitions,
    sessions,
    handoffs
  );

  const result = await execution.dispatchMessage({
    tenantId: 'tenant-1',
    roomId: room.id,
    messageId: message.id,
    participantIds: [participant.id],
    routing: {
      kind: 'assigned',
      participantIds: [participant.id],
      basis: 'router',
    },
    operationId: 'coordination-1:message:item-1',
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.runIds.length, 1);

  const state = await rooms.getRoomState('tenant-1', room.id);
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].status, 'completed');
  assert.equal(
    state.tasks[0].metadata.agentRevisionId,
    draft.definition.revisionId
  );

  const replay = await execution.dispatchMessage({
    tenantId: 'tenant-1',
    roomId: room.id,
    messageId: message.id,
    participantIds: [participant.id],
    routing: {
      kind: 'assigned',
      participantIds: [participant.id],
      basis: 'router',
    },
    operationId: 'coordination-1:message:item-1',
  });
  assert.deepEqual(replay.runIds, result.runIds);
  assert.equal((await rooms.getRoomState('tenant-1', room.id)).tasks.length, 1);
  // A purpose candidate in the same Room must not be treated as another instruction agent.
  await definitions.createAgent({ tenantId: 'tenant-1', agentId: 'purpose-agent', name: 'Purpose' });
  const purpose = await definitions.createRevision({
    tenantId: 'tenant-1', agentId: 'purpose-agent', version: '1.0.0',
    instructions: 'Consider the input.', runtimeProfile: { platform: 'mock' },
    interaction: { schemaVersion: 1, interactionMode: 'purpose', governanceId: 'gov-1' },
  });
  await definitions.publishRevision('tenant-1', purpose.definition.revisionId, 0);
  const purposeParticipant = await rooms.addParticipant('tenant-1', room.id, {
    type: 'agent', displayName: 'Purpose', role: 'worker', permissions: ['task.run'],
    runtime: { platform: 'mock', config: { interactionMode: 'instruction' } },
    metadata: { agentId: 'purpose-agent', interactionMode: 'instruction' },
  });
  await assert.rejects(execution.dispatchMessage({
    tenantId: 'tenant-1', roomId: room.id, messageId: message.id,
    participantIds: [purposeParticipant.id], operationId: 'purpose-attempt',
  }), /qualified purpose mission execution is required/);
  assert.equal((await rooms.getRoomState('tenant-1', room.id)).tasks.length, 1);
  await assert.rejects(execution.dispatchMessage({
    tenantId: 'tenant-1', roomId: room.id, messageId: message.id,
    participantIds: [participant.id, purposeParticipant.id], operationId: 'mixed-attempt',
  }), /qualified purpose mission execution is required/);
  assert.equal((await rooms.getRoomState('tenant-1', room.id)).tasks.length, 1);
  assert.deepEqual((await execution.dispatchMessage({
    tenantId: 'tenant-1', roomId: room.id, messageId: message.id,
    participantIds: [participant.id], operationId: 'coordination-1:message:item-1',
  })).runIds, result.runIds);
  await assert.rejects(execution.dispatchHandoff({
    operationId: 'purpose-handoff',
    handoff: {
      status: 'accepted', tenantId: 'tenant-1', roomId: room.id,
      targetParticipantId: purposeParticipant.id,
      targetAgentRevisionId: purpose.definition.revisionId,
      targetAgentRevisionDigest: purpose.definition.digest,
    },
  }), /qualified purpose mission execution is required/);
  assert.equal((await rooms.getRoomState('tenant-1', room.id)).tasks.length, 1);
});
