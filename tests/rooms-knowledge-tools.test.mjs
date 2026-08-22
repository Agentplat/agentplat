import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AGENT_ROOM_TOOL_IDS,
  InMemoryKnowledgeBundleStore,
  InMemoryRoomRepository,
  KnowledgeBundleRegistry,
  RoomService,
  registerAgentRoomToolBridges,
} from '@agentplat/rooms';
import { InMemoryToolRegistry } from '@agentplat/tools';

test('knowledge bundles are immutable, content-addressed and exactly replayable', async () => {
  const registry = new KnowledgeBundleRegistry(
    new InMemoryKnowledgeBundleStore()
  );
  const input = {
    tenantId: 'tenant-1',
    bundleId: 'research-policy',
    version: '1.0.0',
    documents: [
      {
        documentId: 'policy',
        title: 'Research policy',
        content: 'Use authoritative sources.',
      },
    ],
  };
  const first = await registry.createRevision(input);
  const replay = await registry.createRevision(input);
  assert.match(
    first.reference,
    /^knowledge:\/\/research-policy@1\.0\.0:sha256:/
  );
  assert.deepEqual(replay, first);
  await assert.rejects(
    registry.createRevision({
      ...input,
      documents: [{ ...input.documents[0], content: 'Different content.' }],
    }),
    /different content/
  );
});

test('Agent Room tool bridges persist knowledge reads, memory and artifacts through governed domains', async () => {
  const rooms = new RoomService({ repository: new InMemoryRoomRepository() });
  const room = await rooms.createRoom('tenant-1', {
    title: 'Knowledge Room',
    goal: 'Create a supported artifact',
  });
  const participant = await rooms.addParticipant('tenant-1', room.id, {
    type: 'agent',
    displayName: 'Research Agent',
    role: 'researcher',
    memoryScope: 'agent',
    runtime: { platform: 'mock' },
  });
  const knowledge = new KnowledgeBundleRegistry(
    new InMemoryKnowledgeBundleStore()
  );
  const bundle = await knowledge.createRevision({
    tenantId: 'tenant-1',
    bundleId: 'research-policy',
    version: '1.0.0',
    documents: [
      {
        documentId: 'policy',
        title: 'Policy',
        content: 'Use authoritative sources.',
      },
    ],
  });
  const tools = new InMemoryToolRegistry();
  const handoffCalls = [];
  await registerAgentRoomToolBridges({
    registry: tools,
    rooms,
    knowledge,
    resolveKnowledgeRefs: async () => [bundle.reference],
    handoffs: {
      propose: async (input) => {
        handoffCalls.push(input);
        return { handoffId: input.handoffId, status: 'proposed' };
      },
    },
  });
  const context = {
    tenant: { tenantId: 'tenant-1' },
    toolId: '',
    runId: 'run-1',
    metadata: { roomId: room.id, participantId: participant.id },
  };
  const read = await (
    await tools.get(AGENT_ROOM_TOOL_IDS.knowledgeRead)
  ).handler.invoke(
    { reference: bundle.reference, documentId: 'policy' },
    context
  );
  assert.equal(read.ok, true);
  assert.equal(read.value.content, 'Use authoritative sources.');

  const saved = await (
    await tools.get(AGENT_ROOM_TOOL_IDS.memorySave)
  ).handler.invoke(
    { scope: 'agent', content: { finding: 'supported' } },
    context
  );
  assert.equal(saved.ok, true);

  const emitted = await (
    await tools.get(AGENT_ROOM_TOOL_IDS.artifactEmit)
  ).handler.invoke(
    {
      type: 'report',
      title: 'Research report',
      content: { summary: 'Supported conclusion' },
    },
    context
  );
  assert.equal(emitted.ok, true);
  const state = await rooms.getRoomState('tenant-1', room.id);
  assert.equal(state.memory.length, 1);
  assert.equal(state.artifacts.length, 1);
  assert.equal(state.artifacts[0].provenance.runId, 'run-1');

  const handoff = await (
    await tools.get(AGENT_ROOM_TOOL_IDS.handoffPropose)
  ).handler.invoke(
    {
      handoffId: 'handoff-1',
      targetParticipantId: 'agent-2',
      targetAgentRevisionId: 'agent-2@1.0.0:sha256:test',
      instruction: 'Continue the analysis.',
      authorityCeiling: 1,
    },
    {
      ...context,
      metadata: {
        ...context.metadata,
        agentRevisionId: 'agent-1@1.0.0:sha256:test',
      },
    }
  );
  assert.equal(handoff.ok, true);
  assert.equal(handoffCalls[0].sourceRunId, 'run-1');
  assert.equal(handoffCalls[0].sourceParticipantId, participant.id);
});
