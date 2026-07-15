import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSessionAuditSink,
  InMemoryAuditSink,
  redactAuditDetails,
} from '@agentplat/audit';
import {
  AuthContextTenantResolver,
  StaticAuthProvider,
  hasPermission,
} from '@agentplat/auth';
import { AgentPlatError } from '@agentplat/core';
import { InMemoryEventBus } from '@agentplat/events';
import { InMemoryMemoryStore } from '@agentplat/memory';
import { DefaultAgentRuntime } from '@agentplat/runtime';
import { InMemoryToolRegistry } from '@agentplat/tools';
import { InMemoryWorkflowStore } from '@agentplat/workflows';

const tenant = { tenantId: 'tenant-a' };
const agent = {
  id: 'agent-a',
  tenantId: tenant.tenantId,
  name: 'Agent A',
  platform: 'local',
};

test('DefaultAgentRuntime dispatches runs and streams by normalized platform', async () => {
  const runtime = new DefaultAgentRuntime();
  runtime.registerProvider('LOCAL', {
    async run(_agent, input) {
      return { status: 'completed', output: input.input.toUpperCase() };
    },
    async *stream() {
      yield { type: 'started' };
      yield { type: 'completed' };
    },
  });

  const context = { tenant, agentId: agent.id };
  assert.equal(
    (await runtime.run(agent, { input: 'hello' }, context)).output,
    'HELLO'
  );

  const streamTypes = [];
  for await (const event of runtime.stream(
    agent,
    { input: 'hello' },
    context
  )) {
    streamTypes.push(event.type);
  }
  assert.deepEqual(streamTypes, ['started', 'completed']);
});

test('DefaultAgentRuntime reports missing provider adapters', async () => {
  const runtime = new DefaultAgentRuntime();
  await assert.rejects(
    runtime.run(agent, { input: 'hello' }, { tenant, agentId: agent.id }),
    (error) => error instanceof AgentPlatError && error.code === 'ADAPTER_ERROR'
  );
});

test('InMemoryToolRegistry prevents duplicate registrations', async () => {
  const registry = new InMemoryToolRegistry();
  const definition = {
    id: 'uppercase',
    name: 'Uppercase',
    description: 'Uppercase text',
    parameters: { type: 'object' },
  };
  const handler = {
    async invoke() {
      return { ok: true, value: 'OK' };
    },
  };

  await registry.register(definition, handler);
  assert.equal((await registry.get('uppercase'))?.definition.name, 'Uppercase');
  await assert.rejects(
    registry.register(definition, handler),
    (error) => error.code === 'CONFLICT'
  );
});

test('InMemoryMemoryStore keeps tenant sessions isolated', async () => {
  const store = new InMemoryMemoryStore();
  await store.createSession({
    id: 'session-a',
    tenantId: 'tenant-a',
    agentId: agent.id,
  });
  await store.appendMessage({
    id: 'message-a',
    tenantId: 'tenant-a',
    sessionId: 'session-a',
    role: 'user',
    content: 'hello',
    createdAt: '2026-07-14T12:00:00.000Z',
  });

  assert.equal((await store.listMessages('tenant-a', 'session-a')).length, 1);
  await assert.rejects(
    store.listMessages('tenant-b', 'session-a'),
    (error) => error.code === 'NOT_FOUND'
  );
});

test('InMemoryEventBus delivers typed and wildcard subscriptions', async () => {
  const bus = new InMemoryEventBus();
  const received = [];
  await bus.subscribe('agent.completed', async (event) => {
    received.push(`typed:${event.id}`);
  });
  await bus.subscribe('*', async (event) => {
    received.push(`all:${event.id}`);
  });
  await bus.publish({
    id: 'event-a',
    tenantId: 'tenant-a',
    type: 'agent.completed',
    source: 'test',
    payload: {},
    occurredAt: '2026-07-14T12:00:00.000Z',
  });

  assert.deepEqual(received, ['typed:event-a', 'all:event-a']);
  assert.equal(bus.listPublished().length, 1);
});

test('audit redaction is recursive and is applied by the sink', async () => {
  assert.deepEqual(
    redactAuditDetails({ nested: { apiKey: 'secret', safe: 'value' } }),
    {
      nested: { apiKey: '[REDACTED]', safe: 'value' },
    }
  );

  const sink = new InMemoryAuditSink();
  await sink.write({
    id: 'audit-a',
    tenantId: 'tenant-a',
    action: 'agent.run',
    resource: { type: 'agent', id: agent.id },
    details: { password: 'secret' },
    createdAt: '2026-07-14T12:00:00.000Z',
  });
  assert.equal(sink.list()[0].details.password, '[REDACTED]');
});

test('SessionAuditSink turns session records into redacted append-only audit records', async () => {
  const audit = new InMemoryAuditSink();
  const sink = createSessionAuditSink({ audit });
  await sink.append({
    eventId: 'session-a:1',
    tenantId: 'tenant-a',
    sessionId: 'session-a',
    sequence: 1,
    occurredAt: '2026-07-15T12:00:00.000Z',
    event: {
      type: 'session_started',
      payload: {
        sessionId: 'session-a',
        speakers: [],
        maxRounds: 1,
        historyLimit: 1,
        apiKey: 'must be redacted',
      },
    },
  });
  const record = audit.list()[0];
  assert.equal(record.action, 'session.session_started');
  assert.equal(record.resource.type, 'agent_session');
  assert.equal(record.details.event.payload.apiKey, '[REDACTED]');
});

test('local auth adapters resolve permissions and tenant context', async () => {
  const context = {
    userId: 'user-a',
    tenantId: 'tenant-a',
    userType: 'HUMAN',
    roles: ['operator'],
    permissions: ['agents:run'],
  };
  const provider = new StaticAuthProvider(context);
  const authenticated = await provider.authenticate({ headers: {} });

  assert.equal(hasPermission(authenticated, 'agents:run'), true);
  assert.equal(
    (
      await new AuthContextTenantResolver().resolveTenant(authenticated, {
        headers: {},
      })
    ).tenantId,
    'tenant-a'
  );
});

test('InMemoryWorkflowStore isolates process runs by tenant', async () => {
  const store = new InMemoryWorkflowStore();
  await store.saveProcessRun({
    runId: 'run-a',
    tenantId: 'tenant-a',
    processId: 'process-a',
    status: 'pending',
    stageStates: [],
  });

  assert.equal(
    (await store.getProcessRun('tenant-a', 'run-a'))?.processId,
    'process-a'
  );
  assert.equal(await store.getProcessRun('tenant-b', 'run-a'), undefined);
});
