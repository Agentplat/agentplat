import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemoryCollectiveStateStore,
  createCollective,
} from '@agentplat/collective-runtime';
import { createAgentplat } from '@agentplat/framework';
import { DefaultAgentRuntime } from '@agentplat/runtime';

function agent(id, capability, priority = 0) {
  return {
    agent: {
      id,
      tenantId: 'tenant-a',
      name: id,
      platform: 'test',
    },
    capabilityKeys: [capability],
    priority,
  };
}

function objective() {
  return {
    objectiveId: 'objective-a',
    summary: 'Produce a dependency-aware result.',
  };
}

function sequentialClock() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++));
}

test('framework collective routes dependent work by capability and emits durable events', async () => {
  const calls = [];
  const runtime = new DefaultAgentRuntime();
  runtime.registerProvider('test', {
    async run(agentDefinition, input, context) {
      const work = input.input[1];
      const dependencies = input.input[2];
      calls.push({
        agentId: agentDefinition.id,
        workItemId: work.workItemId,
        dependencyCount: dependencies.results.length,
        runId: context.runId,
      });
      return {
        status: 'completed',
        output: `${agentDefinition.id}:${work.workItemId}`,
        result: { dependencyCount: dependencies.results.length },
      };
    },
  });
  const agentplat = createAgentplat({
    runtime,
    tenant: { tenantId: 'tenant-a' },
    idGenerator: () => 'generated',
    clock: sequentialClock(),
  });
  const collective = agentplat.createCollective({
    collectiveId: 'collective-a',
    objective: objective(),
    plan: {
      workItems: [
        {
          workItemId: 'write',
          summary: 'Write from the research result.',
          requiredCapabilityKeys: ['writing'],
          dependsOn: ['research'],
        },
        {
          workItemId: 'research',
          summary: 'Collect the facts.',
          requiredCapabilityKeys: ['research'],
        },
      ],
    },
  });
  collective.register(agent('researcher', 'research'));
  collective.register(agent('writer', 'writing'));
  const events = [];
  collective.subscribe((event) => events.push(event));
  collective.subscribe(() => {
    throw new Error('observer failure must remain isolated');
  });

  const execution = await collective.run({ executionId: 'execution-a' });

  assert.equal(execution.status, 'completed');
  assert.deepEqual(
    calls.map(({ agentId, workItemId, dependencyCount }) => ({
      agentId,
      workItemId,
      dependencyCount,
    })),
    [
      { agentId: 'researcher', workItemId: 'research', dependencyCount: 0 },
      { agentId: 'writer', workItemId: 'write', dependencyCount: 1 },
    ]
  );
  assert.deepEqual(
    events.map(({ sequence }) => sequence),
    events.map((_, index) => index + 1)
  );
  assert.equal(events.at(-1).type, 'execution.completed');
  assert.equal((await collective.getExecution('execution-a')).revision, 5);
});

test('failed work is replanned to another eligible agent', async () => {
  const runtime = new DefaultAgentRuntime();
  runtime.registerProvider('test', {
    async run(agentDefinition) {
      if (agentDefinition.id === 'primary') {
        return { status: 'failed', errorMessage: 'primary unavailable' };
      }
      return { status: 'completed', output: 'recovered' };
    },
  });
  const collective = createCollective({
    collectiveId: 'collective-replan',
    objective: objective(),
    runtime,
    tenant: { tenantId: 'tenant-a' },
    plan: {
      workItems: [
        {
          workItemId: 'analyze',
          summary: 'Analyze the input.',
          requiredCapabilityKeys: ['analysis'],
        },
      ],
    },
    policies: { maximumAttemptsPerWorkItem: 2 },
    clock: sequentialClock(),
  });
  collective.register(agent('primary', 'analysis', 10));
  collective.register(agent('backup', 'analysis', 0));

  const execution = await collective.run({ executionId: 'execution-replan' });
  const work = execution.workItems[0];

  assert.equal(execution.status, 'completed');
  assert.deepEqual(
    work.attempts.map(({ agentId, status }) => ({ agentId, status })),
    [
      { agentId: 'primary', status: 'failed' },
      { agentId: 'backup', status: 'completed' },
    ]
  );
  assert.ok(execution.events.some(({ type }) => type === 'work.replanned'));
});

test('assignment policy exceptions fail closed before provider dispatch', async () => {
  let calls = 0;
  const runtime = new DefaultAgentRuntime();
  runtime.registerProvider('test', {
    async run() {
      calls += 1;
      return { status: 'completed', output: 'must not run' };
    },
  });
  const collective = createCollective({
    collectiveId: 'collective-policy',
    objective: objective(),
    runtime,
    tenant: { tenantId: 'tenant-a' },
    plan: {
      workItems: [
        {
          workItemId: 'restricted',
          summary: 'Restricted work.',
          requiredCapabilityKeys: ['restricted'],
        },
      ],
    },
    policies: {
      policyId: 'policy-backend-v1',
      authorizeAssignment() {
        throw new Error('policy backend unavailable');
      },
    },
  });
  collective.register(agent('candidate', 'restricted'));

  const execution = await collective.run({ executionId: 'execution-policy' });

  assert.equal(execution.status, 'failed');
  assert.equal(execution.workItems[0].failure.code, 'no_eligible_agent');
  assert.equal(calls, 0);
});

test('paused execution resumes the same running attempt and idempotency key', async () => {
  const store = new InMemoryCollectiveStateStore();
  const attemptIds = [];
  let started;
  const startedPromise = new Promise((resolve) => {
    started = resolve;
  });
  const firstRuntime = new DefaultAgentRuntime();
  firstRuntime.registerProvider('test', {
    async run(_agent, _input, context) {
      attemptIds.push(context.runId);
      started();
      await new Promise((resolve, reject) => {
        context.signal.addEventListener(
          'abort',
          () => reject(new Error('aborted')),
          { once: true }
        );
      });
      return { status: 'completed', output: 'unreachable' };
    },
  });
  const configuration = {
    collectiveId: 'collective-resume',
    objective: objective(),
    tenant: { tenantId: 'tenant-a' },
    plan: {
      workItems: [
        {
          workItemId: 'recoverable',
          summary: 'Recover this work.',
          requiredCapabilityKeys: ['recovery'],
        },
      ],
    },
    stateStore: store,
    clock: sequentialClock(),
  };
  const first = createCollective({ ...configuration, runtime: firstRuntime });
  first.register(agent('worker', 'recovery'));
  const controller = new AbortController();
  const run = first.run({
    executionId: 'execution-resume',
    signal: controller.signal,
  });
  await startedPromise;
  controller.abort();
  const paused = await run;

  assert.equal(paused.status, 'paused');
  assert.equal(paused.workItems[0].attempts[0].status, 'running');

  const secondRuntime = new DefaultAgentRuntime();
  secondRuntime.registerProvider('test', {
    async run(_agent, _input, context) {
      attemptIds.push(context.runId);
      return { status: 'completed', output: 'recovered' };
    },
  });
  const second = createCollective({ ...configuration, runtime: secondRuntime });
  second.register(agent('worker', 'recovery'));
  const completed = await second.resume('execution-resume');

  assert.equal(completed.status, 'completed');
  assert.equal(completed.workItems[0].attempts.length, 1);
  assert.deepEqual(attemptIds, [attemptIds[0], attemptIds[0]]);
  assert.ok(completed.events.some(({ type }) => type === 'execution.paused'));
  assert.ok(completed.events.some(({ type }) => type === 'execution.resumed'));
});

test('cancel interrupts active work and persists a terminal checkpoint', async () => {
  let started;
  const startedPromise = new Promise((resolve) => {
    started = resolve;
  });
  const runtime = new DefaultAgentRuntime();
  runtime.registerProvider('test', {
    async run(_agent, _input, context) {
      started();
      await new Promise((resolve, reject) => {
        context.signal.addEventListener(
          'abort',
          () => reject(new Error('canceled')),
          { once: true }
        );
      });
      return { status: 'completed', output: 'unreachable' };
    },
  });
  const collective = createCollective({
    collectiveId: 'collective-cancel',
    objective: objective(),
    runtime,
    tenant: { tenantId: 'tenant-a' },
    plan: {
      workItems: [
        {
          workItemId: 'interruptible',
          summary: 'Interrupt this work.',
          requiredCapabilityKeys: ['interruptible'],
        },
      ],
    },
  });
  collective.register(agent('worker', 'interruptible'));
  const running = collective.run({ executionId: 'execution-cancel' });
  await startedPromise;

  const canceled = await collective.cancel('execution-cancel');
  const interrupted = await running;

  assert.equal(interrupted.status, 'paused');
  assert.equal(canceled.status, 'canceled');
  assert.equal(canceled.workItems[0].status, 'canceled');
  assert.equal(
    canceled.workItems[0].attempts[0].failure.code,
    'execution_canceled'
  );
  assert.equal(
    (await collective.getExecution('execution-cancel')).status,
    'canceled'
  );
});

test('in-memory store rejects stale revisions', async () => {
  const store = new InMemoryCollectiveStateStore();
  const runtime = new DefaultAgentRuntime();
  runtime.registerProvider('test', {
    async run() {
      return { status: 'completed', output: 'ok' };
    },
  });
  const collective = createCollective({
    collectiveId: 'collective-store',
    objective: objective(),
    runtime,
    tenant: { tenantId: 'tenant-a' },
    plan: {
      workItems: [
        {
          workItemId: 'one',
          summary: 'One work item.',
          requiredCapabilityKeys: ['one'],
        },
      ],
    },
    stateStore: store,
  });
  collective.register(agent('worker', 'one'));
  const execution = await collective.run({ executionId: 'execution-store' });

  await assert.rejects(
    () => store.save({ ...execution, revision: execution.revision + 1 }, 0),
    (error) => error.code === 'STATE_CONFLICT'
  );
});

test('resume rejects a different policy deployment identity', async () => {
  const store = new InMemoryCollectiveStateStore();
  const runtime = new DefaultAgentRuntime();
  runtime.registerProvider('test', {
    async run() {
      return { status: 'completed', output: 'ok' };
    },
  });
  const configuration = {
    collectiveId: 'collective-policy-binding',
    objective: objective(),
    runtime,
    tenant: { tenantId: 'tenant-a' },
    plan: {
      workItems: [
        {
          workItemId: 'bound',
          summary: 'Policy-bound work.',
          requiredCapabilityKeys: ['bound'],
        },
      ],
    },
    stateStore: store,
  };
  const first = createCollective({
    ...configuration,
    policies: {
      policyId: 'policy-deployment-a',
      authorizeAssignment: () => ({ allow: true }),
    },
  });
  first.register(agent('worker', 'bound'));
  await first.run({ executionId: 'execution-policy-binding' });

  const second = createCollective({
    ...configuration,
    policies: {
      policyId: 'policy-deployment-b',
      authorizeAssignment: () => ({ allow: true }),
    },
  });
  second.register(agent('worker', 'bound'));

  await assert.rejects(
    () => second.resume('execution-policy-binding'),
    (error) => error.code === 'STATE_INVALID'
  );
});
