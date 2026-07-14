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
