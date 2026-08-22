import assert from 'node:assert/strict';
import test from 'node:test';

import { AgentPlatError } from '@agentplat/core';
import { InMemoryRoomRepository, RoomService } from '@agentplat/rooms';
import { createRoomsApp } from '../dist/index.js';

function fakeService(overrides = {}) {
  return {
    createRoom: async (tenantId, input) => ({
      id: 'room-1',
      tenantId,
      ...input,
    }),
    updateRoom: async () => ({}),
    transitionRoom: async () => ({}),
    listRooms: async () => [],
    getRoomState: async (_tenantId, roomId) => ({ room: { id: roomId } }),
    addParticipant: async () => ({}),
    sendMessage: async () => ({}),
    createTask: async () => ({}),
    runTask: async () => ({}),
    createArtifact: async () => ({}),
    createArtifactVersion: async () => ({}),
    requestApproval: async () => ({}),
    resolveApproval: async () => ({}),
    listEvents: async () => [],
    listEventPage: async () => ({ events: [], hasMore: false }),
    ...overrides,
  };
}

test('health is public and reports readiness', async () => {
  const response = await createRoomsApp({ service: fakeService() }).request(
    '/health'
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('the default authenticator requires the tenant header', async () => {
  const response = await createRoomsApp({ service: fakeService() }).request(
    '/rooms'
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'BAD_REQUEST',
      message: 'Missing required X-Agentplat-Tenant-Id header',
    },
  });
});

test('authenticated tenant wins over a spoofed body tenant', async () => {
  let received;
  const app = createRoomsApp({
    service: fakeService({
      createRoom: async (tenantId, input) => {
        received = { tenantId, input };
        return { id: 'room-1' };
      },
    }),
  });

  const response = await app.request('/rooms', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-agentplat-tenant-id': 'trusted-tenant',
    },
    body: JSON.stringify({ tenantId: 'attacker-tenant', title: 'Planning' }),
  });

  assert.equal(response.status, 201);
  assert.deepEqual(received, {
    tenantId: 'trusted-tenant',
    input: { title: 'Planning' },
  });
  assert.deepEqual(await response.json(), { data: { id: 'room-1' } });
});

test('a custom authenticator replaces trusted-header auth', async () => {
  let tenant;
  const app = createRoomsApp({
    auth: async () => ({ tenantId: 'verified-tenant' }),
    service: fakeService({
      listRooms: async (tenantId) => {
        tenant = tenantId;
        return [];
      },
    }),
  });

  const response = await app.request('/rooms');

  assert.equal(response.status, 200);
  assert.equal(tenant, 'verified-tenant');
});

test('routes lifecycle actions and approval decisions', async () => {
  const calls = [];
  const app = createRoomsApp({
    service: fakeService({
      transitionRoom: async (...args) => calls.push(['transition', ...args]),
      resolveApproval: async (...args) => calls.push(['approval', ...args]),
    }),
  });
  const headers = { 'x-agentplat-tenant-id': 'tenant-1' };

  const pause = await app.request('/rooms/room-1/pause', {
    method: 'POST',
    headers,
  });
  const approve = await app.request('/approvals/approval-1/approve', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ decidedBy: 'human-1' }),
  });

  assert.equal(pause.status, 200);
  assert.equal(approve.status, 200);
  assert.deepEqual(calls, [
    ['transition', 'tenant-1', 'room-1', 'pause', undefined],
    [
      'approval',
      'tenant-1',
      'approval-1',
      'approved',
      { decidedBy: 'human-1' },
    ],
  ]);
});

test('rejects malformed JSON before invoking the service', async () => {
  let called = false;
  const app = createRoomsApp({
    service: fakeService({
      createTask: async () => {
        called = true;
      },
    }),
  });

  const response = await app.request('/rooms/room-1/tasks', {
    method: 'POST',
    headers: { 'x-agentplat-tenant-id': 'tenant-1' },
    body: '{bad json',
  });

  assert.equal(response.status, 400);
  assert.equal(called, false);
  assert.equal((await response.json()).error.code, 'BAD_REQUEST');
});

test('maps domain errors to stable HTTP error envelopes', async () => {
  const app = createRoomsApp({
    service: fakeService({
      getRoomState: async () => {
        throw new AgentPlatError('NOT_FOUND', 'Room not found');
      },
    }),
  });

  const response = await app.request('/rooms/missing', {
    headers: { 'x-agentplat-tenant-id': 'tenant-1' },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: { code: 'NOT_FOUND', message: 'Room not found' },
  });
});

test('serves cursor-based Room event pages without changing the legacy read', async () => {
  const calls = [];
  const app = createRoomsApp({
    service: fakeService({
      listEvents: async () => [{ id: 'legacy-event' }],
      listEventPage: async (...args) => {
        calls.push(args);
        return {
          events: [{ id: 'paged-event' }],
          nextCursor: 'next',
          hasMore: true,
        };
      },
    }),
  });
  const headers = { 'x-agentplat-tenant-id': 'tenant-1' };

  const legacy = await app.request('/rooms/room-1/events', { headers });
  assert.deepEqual(await legacy.json(), { data: [{ id: 'legacy-event' }] });

  const paged = await app.request(
    '/rooms/room-1/events?cursor=current&limit=25',
    { headers }
  );
  assert.deepEqual(await paged.json(), {
    data: {
      events: [{ id: 'paged-event' }],
      nextCursor: 'next',
      hasMore: true,
    },
  });
  assert.deepEqual(calls, [
    ['tenant-1', 'room-1', { cursor: 'current', limit: 25 }],
  ]);
});

test('execution intervention routes derive the requesting participant from authenticated identity', async () => {
  const calls = [];
  const app = createRoomsApp({
    auth: async () => ({
      tenantId: 'tenant-1',
      actor: { actorId: 'verified-human', actorType: 'human' },
    }),
    service: fakeService(),
    execution: {
      getSession: async (input) => ({ ...input, revision: 2 }),
      listSessionEvents: async () => [{ sequence: 1, type: 'session_opened' }],
      requestIntervention: async (input) => {
        calls.push(input);
        return { sessionId: input.sessionId, revision: 3 };
      },
    },
    executionEventStream: async function* () {
      yield {
        type: 'execution_session_event',
        payload: { sequence: 1, eventType: 'session_opened' },
      };
    },
  });

  const read = await app.request(
    '/rooms/room-1/execution-sessions/execution-1'
  );
  assert.equal(read.status, 200);
  assert.equal((await read.json()).data.revision, 2);

  const events = await app.request(
    '/rooms/room-1/execution-sessions/execution-1/events?after=0'
  );
  assert.deepEqual((await events.json()).data, [
    { sequence: 1, type: 'session_opened' },
  ]);

  const stream = await app.request(
    '/rooms/room-1/execution-sessions/execution-1/events/stream?after=0'
  );
  assert.match(stream.headers.get('content-type'), /text\/event-stream/);
  assert.match(await stream.text(), /agentplat\.execution_session_event/);

  const response = await app.request(
    '/rooms/room-1/execution-sessions/execution-1/interventions',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        expectedRevision: 2,
        operationId: 'intervention-1',
        requestedByParticipantId: 'spoofed-human',
        instruction: 'Use the approved assumptions.',
        checkpoint: 'pre_step',
      }),
    }
  );
  assert.equal(response.status, 202);
  assert.deepEqual(calls, [
    {
      tenantId: 'tenant-1',
      roomId: 'room-1',
      sessionId: 'execution-1',
      expectedRevision: 2,
      operationId: 'intervention-1',
      requestedByParticipantId: 'verified-human',
      instruction: 'Use the approved assumptions.',
      checkpoint: 'pre_step',
    },
  ]);
});

test('agent registry routes derive tenant scope and expose lifecycle transitions', async () => {
  const calls = [];
  const revision = {
    definition: { agentId: 'agent-1', revisionId: 'revision-1' },
    lifecycle: { revision: 0, status: 'draft' },
  };
  const app = createRoomsApp({
    service: fakeService(),
    agentRegistry: {
      createAgent: async (input) => {
        calls.push(['agent', input]);
        return input;
      },
      createRevision: async (input) => {
        calls.push(['revision', input]);
        return revision;
      },
      getRevision: async () => revision,
      listRevisions: async () => [revision],
      publishRevision: async (...args) => {
        calls.push(['publish', ...args]);
        return { ...revision, lifecycle: { revision: 1, status: 'published' } };
      },
      deprecateRevision: async () => ({}),
    },
  });
  const headers = {
    'content-type': 'application/json',
    'x-agentplat-tenant-id': 'tenant-1',
  };
  const created = await app.request('/agents', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      tenantId: 'spoofed',
      agentId: 'agent-1',
      name: 'Agent One',
    }),
  });
  assert.equal(created.status, 201);

  const createdRevision = await app.request('/agents/agent-1/revisions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      version: '1.0.0',
      instructions: 'Complete the task.',
      runtimeProfile: { platform: 'portable' },
    }),
  });
  assert.equal(createdRevision.status, 201);

  const published = await app.request(
    '/agents/agent-1/revisions/revision-1/publish',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ expectedLifecycleRevision: 0 }),
    }
  );
  assert.equal(published.status, 200);
  assert.deepEqual(calls, [
    ['agent', { tenantId: 'tenant-1', agentId: 'agent-1', name: 'Agent One' }],
    [
      'revision',
      {
        tenantId: 'tenant-1',
        agentId: 'agent-1',
        version: '1.0.0',
        instructions: 'Complete the task.',
        runtimeProfile: { platform: 'portable' },
      },
    ],
    ['publish', 'tenant-1', 'revision-1', 0],
  ]);
});

test('Agent Room Handoff routes derive source and acceptance identity', async () => {
  const calls = [];
  const app = createRoomsApp({
    auth: async () => ({
      tenantId: 'tenant-1',
      actor: { actorId: 'verified-agent', actorType: 'machine' },
    }),
    service: fakeService(),
    handoffs: {
      propose: async (input) => {
        calls.push(['propose', input]);
        return { handoffId: input.handoffId, revision: 0 };
      },
      get: async (input) => input,
      accept: async (input) => {
        calls.push(['accept', input]);
        return { handoffId: input.handoffId, revision: 1 };
      },
      reject: async () => ({}),
      bindRun: async () => ({}),
      reconcile: async () => ({}),
    },
  });
  const headers = { 'content-type': 'application/json' };
  const proposed = await app.request('/rooms/room-1/handoffs', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      handoffId: 'handoff-1',
      sourceParticipantId: 'spoofed-agent',
      sourceRunId: 'run-1',
      sourceAgentRevisionId: 'revision-a',
      targetParticipantId: 'agent-b',
      targetAgentRevisionId: 'revision-b',
      instruction: 'Continue the work.',
      authorityCeiling: 2,
    }),
  });
  assert.equal(proposed.status, 201);

  const accepted = await app.request(
    '/rooms/room-1/handoffs/handoff-1/accept',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        expectedRevision: 0,
        acceptedByParticipantId: 'spoofed-agent',
      }),
    }
  );
  assert.equal(accepted.status, 200);
  assert.equal(calls[0][1].sourceParticipantId, 'verified-agent');
  assert.equal(calls[1][1].acceptedByParticipantId, 'verified-agent');
});

test('does not leak unexpected errors', async () => {
  const app = createRoomsApp({
    service: fakeService({
      listRooms: async () => {
        throw new Error('database password appeared here');
      },
    }),
  });

  const response = await app.request('/rooms', {
    headers: { 'x-agentplat-tenant-id': 'tenant-1' },
  });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
});

test('serves the real RoomService aggregate and approval flow', async () => {
  const service = new RoomService({ repository: new InMemoryRoomRepository() });
  const app = createRoomsApp({ service });
  const headers = {
    'content-type': 'application/json',
    'x-agentplat-tenant-id': 'tenant-1',
  };
  const post = (path, body) =>
    app.request(path, { method: 'POST', headers, body: JSON.stringify(body) });

  const roomResponse = await post('/rooms', {
    title: 'Launch room',
    goal: 'Approve a launch brief',
  });
  assert.equal(roomResponse.status, 201);
  const room = (await roomResponse.json()).data;

  const humanResponse = await post(`/rooms/${room.id}/participants`, {
    type: 'human',
    displayName: 'Human approver',
    role: 'owner',
    permissions: ['approve'],
  });
  assert.equal(humanResponse.status, 201);
  const human = (await humanResponse.json()).data;

  const artifactResponse = await post(`/rooms/${room.id}/artifacts`, {
    type: 'brief',
    title: 'Launch brief',
    content: 'Draft launch brief',
    contentType: 'text/plain',
  });
  assert.equal(artifactResponse.status, 201);
  const artifact = (await artifactResponse.json()).data;

  const approvalResponse = await post(`/rooms/${room.id}/approvals`, {
    targetType: 'artifact',
    targetId: artifact.id,
  });
  assert.equal(approvalResponse.status, 201);
  const approval = (await approvalResponse.json()).data;

  const resolvedResponse = await post(`/approvals/${approval.id}/approve`, {
    decidedBy: human.id,
    comment: 'Ready to publish',
  });
  assert.equal(resolvedResponse.status, 200);

  const stateResponse = await app.request(`/rooms/${room.id}`, { headers });
  assert.equal(stateResponse.status, 200);
  const state = (await stateResponse.json()).data;
  assert.equal(state.room.id, room.id);
  assert.equal(state.approvals[0].status, 'approved');
  assert.equal(state.artifacts[0].status, 'approved');
  assert.equal(state.artifacts[0].versions.length, 1);
  assert.deepEqual(
    state.events.map((event) => event.type),
    [
      'room_created',
      'participant_added',
      'artifact_created',
      'approval_requested',
      'approval_granted',
    ]
  );
});

test('invalid runtime JSON returns validation error instead of an internal error', async () => {
  const app = createRoomsApp({
    service: new RoomService({ repository: new InMemoryRoomRepository() }),
  });
  const response = await app.request('/rooms', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-agentplat-tenant-id': 'tenant-1',
    },
    body: JSON.stringify({ title: 123, goal: 'Valid goal' }),
  });

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
});

test('verified actor identity overrides a spoofed approval decider', async () => {
  let received;
  const app = createRoomsApp({
    auth: async () => ({
      tenantId: 'tenant-1',
      actor: { actorId: 'verified-human', actorType: 'human' },
    }),
    service: fakeService({
      resolveApproval: async (...args) => {
        received = args;
        return {};
      },
    }),
  });
  const response = await app.request('/approvals/approval-1/approve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decidedBy: 'spoofed-human' }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(received, [
    'tenant-1',
    'approval-1',
    'approved',
    { decidedBy: 'verified-human' },
  ]);
});
