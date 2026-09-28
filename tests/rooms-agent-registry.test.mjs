import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentDefinitionRegistry,
  InMemoryAgentDefinitionRegistryStore,
  InMemoryRoomExecutionSessionStore,
  RoomExecutionCoordinator,
  resolveAgentInteractionBindingV1,
  validateAgentInteractionBindingV1,
} from '@agentplat/rooms';

function registry() {
  let second = 0;
  return new AgentDefinitionRegistry(
    new InMemoryAgentDefinitionRegistryStore(),
    { clock: () => new Date(Date.UTC(2026, 7, 21, 12, 0, second++)) }
  );
}

test('creates immutable content-addressed agent revisions with separate lifecycle', async () => {
  const service = registry();
  await service.createAgent({
    tenantId: 'tenant-1',
    agentId: 'research-agent',
    name: 'Research Agent',
  });
  const draft = await service.createRevision({
    tenantId: 'tenant-1',
    agentId: 'research-agent',
    version: '1.0.0',
    instructions: 'Research the requested topic.',
    capabilities: ['search', 'analysis', 'search'],
    toolIds: ['web.search'],
    knowledgeRefs: ['knowledge://research-policy-v1'],
    runtimeProfile: { platform: 'portable', model: 'model-a' },
  });

  assert.equal(draft.lifecycle.status, 'draft');
  assert.equal(draft.definition.digest, 'sha256:c16e403b92715393f8ee77dffaecfbcf316d92aa62bff2a38dd8e0399b5a50c6');
  assert.equal(Object.hasOwn(draft.definition, 'interaction'), false);
  assert.equal(resolveAgentInteractionBindingV1(draft.definition).interactionMode, 'instruction');
  assert.match(draft.definition.digest, /^sha256:[a-f0-9]{64}$/);
  assert.match(draft.definition.revisionId, /research-agent@1\.0\.0:sha256:/);
  assert.deepEqual(draft.definition.capabilities, ['analysis', 'search']);

  const replay = await service.createRevision({
    tenantId: 'tenant-1',
    agentId: 'research-agent',
    version: '1.0.0',
    instructions: 'Research the requested topic.',
    capabilities: ['analysis', 'search'],
    toolIds: ['web.search'],
    knowledgeRefs: ['knowledge://research-policy-v1'],
    runtimeProfile: { model: 'model-a', platform: 'portable' },
  });
  assert.equal(replay.definition.revisionId, draft.definition.revisionId);

  await assert.rejects(
    service.createRevision({
      tenantId: 'tenant-1',
      agentId: 'research-agent',
      version: '1.0.0',
      instructions: 'Different instructions.',
      runtimeProfile: { platform: 'portable' },
    }),
    /version is already bound/
  );
});

test('interaction bindings reject malformed inputs instead of silently defaulting', () => {
  for (const value of [null, [], {}, 'purpose',
    { schemaVersion: 2, interactionMode: 'instruction' },
    { schemaVersion: 1, interactionMode: 'unknown' },
    { schemaVersion: 1, interactionMode: 'purpose' },
    { schemaVersion: 1, interactionMode: 'purpose', governanceId: ' ' },
    { schemaVersion: 1, interactionMode: 'purpose', governanceId: 1 },
    { schemaVersion: 1, interactionMode: 'instruction', governanceId: 'g' },
    { schemaVersion: 1, interactionMode: 'purpose', governanceId: 'g', enabled: true },
  ]) assert.throws(() => validateAgentInteractionBindingV1(value), { code: 'VALIDATION_ERROR' });
});

test('explicit bindings are immutable digest-bound candidates and purpose cannot execute', async () => {
  const store = new InMemoryAgentDefinitionRegistryStore();
  const service = new AgentDefinitionRegistry(store);
  await service.createAgent({ tenantId: 't', agentId: 'a', name: 'Agent' });
  const base = { tenantId: 't', agentId: 'a', version: '1.0.0', instructions: 'Work', runtimeProfile: {} };
  const interaction = { schemaVersion: 1, interactionMode: 'purpose', governanceId: 'gov-1' };
  const candidate = await service.createRevision({ ...base, interaction });
  interaction.governanceId = 'mutated';
  assert.equal(candidate.definition.interaction.governanceId, 'gov-1');
  const replay = await service.createRevision({ ...base, interaction: { governanceId: 'gov-1', interactionMode: 'purpose', schemaVersion: 1 } });
  assert.equal(replay.definition.digest, candidate.definition.digest);
  for (const changed of [undefined, { schemaVersion: 1, interactionMode: 'instruction' }, interaction]) {
    await assert.rejects(service.createRevision({ ...base, interaction: changed }), /different content/);
  }
  await service.publishRevision('t', candidate.definition.revisionId, 0);
  const reopened = new AgentDefinitionRegistry(store);
  assert.equal((await reopened.getRevision('t', candidate.definition.revisionId)).definition.interaction.governanceId, 'gov-1');
  await assert.rejects(reopened.resolvePublishedRevision('t', candidate.definition.revisionId), /qualified purpose mission execution is required/);
  const explicit = await service.createRevision({ ...base, version: '2.0.0', interaction: { schemaVersion: 1, interactionMode: 'instruction' } });
  await service.publishRevision('t', explicit.definition.revisionId, 0);
  assert.equal((await service.resolvePublishedRevision('t', explicit.definition.revisionId)).interaction.interactionMode, 'instruction');
  await assert.rejects(service.createRevision({ ...base, version: '3.0.0', interaction: null }), { code: 'VALIDATION_ERROR' });
});

test('publishes and deprecates revisions with revision-checked lifecycle transitions', async () => {
  const service = registry();
  await service.createAgent({
    tenantId: 'tenant-1',
    agentId: 'agent-1',
    name: 'Agent One',
  });
  const draft = await service.createRevision({
    tenantId: 'tenant-1',
    agentId: 'agent-1',
    version: '1.0.0',
    instructions: 'Complete the task.',
    runtimeProfile: { platform: 'mock' },
  });
  await assert.rejects(
    service.resolvePublishedRevision('tenant-1', draft.definition.revisionId),
    /not published/
  );

  const published = await service.publishRevision(
    'tenant-1',
    draft.definition.revisionId,
    0
  );
  assert.equal(published.lifecycle.status, 'published');
  assert.equal(published.lifecycle.revision, 1);
  assert.equal(
    (
      await service.resolvePublishedRevision(
        'tenant-1',
        draft.definition.revisionId
      )
    ).digest,
    draft.definition.digest
  );

  await assert.rejects(
    service.publishRevision('tenant-1', draft.definition.revisionId, 0),
    /lifecycle conflict/
  );
  const deprecated = await service.deprecateRevision(
    'tenant-1',
    draft.definition.revisionId,
    1
  );
  assert.equal(deprecated.lifecycle.status, 'deprecated');
  await assert.rejects(
    service.resolvePublishedRevision('tenant-1', draft.definition.revisionId),
    /not published/
  );
});

test('execution sessions bind a published revision to the assigned participant and runtime', async () => {
  const definitions = registry();
  await definitions.createAgent({
    tenantId: 'tenant-1',
    agentId: 'agent-1',
    name: 'Agent One',
  });
  const draft = await definitions.createRevision({
    tenantId: 'tenant-1',
    agentId: 'agent-1',
    version: '2.0.0',
    instructions: 'Complete the task.',
    runtimeProfile: { platform: 'portable' },
  });
  await definitions.publishRevision('tenant-1', draft.definition.revisionId, 0);
  const coordinator = new RoomExecutionCoordinator(
    {
      getRoomState: async () => ({
        room: { status: 'active' },
        participants: [
          {
            id: 'participant-1',
            type: 'agent',
            runtime: { platform: 'portable' },
            metadata: { agentId: 'agent-1' },
          },
        ],
        runs: [
          {
            id: 'run-1',
            taskId: 'task-1',
            participantId: 'participant-1',
            status: 'running',
          },
        ],
      }),
    },
    new InMemoryRoomExecutionSessionStore(),
    { agentRegistry: definitions }
  );
  const session = await coordinator.openSession({
    tenantId: 'tenant-1',
    roomId: 'room-1',
    sessionId: 'execution-1',
    runId: 'run-1',
    agentRevisionId: draft.definition.revisionId,
  });
  assert.equal(session.agentRevisionId, draft.definition.revisionId);
  assert.equal(session.agentRevisionDigest, draft.definition.digest);
});
