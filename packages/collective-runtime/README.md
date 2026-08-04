# `@agentplat/collective-runtime`

Application-level runtime for building capability-routed AgentPlat collectives.
It composes the public `AgentRuntime` provider registry with an explicit work
plan, bounded policies, observable execution state and revision-checked
persistence.

```ts
import { createCollective } from '@agentplat/collective-runtime';
import { DefaultAgentRuntime } from '@agentplat/runtime';

const runtime = new DefaultAgentRuntime();
runtime.registerProvider('local', provider);

const collective = createCollective({
  collectiveId: 'launch-team',
  tenant: { tenantId: 'acme' },
  runtime,
  objective: {
    objectiveId: 'launch-brief',
    summary: 'Produce a checked launch brief.',
  },
  plan: {
    workItems: [
      {
        workItemId: 'research',
        summary: 'Collect the relevant facts.',
        requiredCapabilityKeys: ['research'],
      },
      {
        workItemId: 'review',
        summary: 'Review the facts and produce the final brief.',
        requiredCapabilityKeys: ['writing'],
        dependsOn: ['research'],
      },
    ],
  },
});

collective
  .register({
    agent: researcher,
    capabilityKeys: ['research'],
    roleKeys: ['analyst'],
  })
  .register({
    agent: writer,
    capabilityKeys: ['writing'],
    roleKeys: ['reviewer'],
  });

collective.subscribe((event) => console.log(event.type, event.payload));
const execution = await collective.run({ executionId: 'launch-run-1' });
```

Every underlying `AgentRuntime.run` receives a stable attempt ID as `runId`.
Providers that can perform external effects should use that value as their
idempotency key. If a process stops after dispatch but before the result is
persisted, `resume(executionId)` replays the same running attempt with the same
`runId`.

## Planning and team formation

Pass either a static `plan` or a `planner` callback. A planner receives the
objective and safe descriptors for the currently registered agents; its plan
is validated, normalized and persisted before execution starts. Dependencies
must form an acyclic graph.

For every ready work item, the runtime selects agents that provide every
required capability and the optional role. It balances current assignment
load, then applies priority and a stable agent-ID tie break. A failed attempt is
replanned to another eligible agent while the configured attempt ceiling
allows it.

## Policy boundary

`authorizeAssignment` and `authorizeResult` are fail-closed callbacks. An
exception, malformed response or explicit denial prevents that decision from
being accepted. Limits bound work count, attempts, concurrency and persisted
result bytes.

```ts
policies: {
  policyId: 'approved-agents-v1',
  maximumConcurrentWorkItems: 4,
  maximumAttemptsPerWorkItem: 3,
  authorizeAssignment: ({ agent, workItem }) => ({
    allow: agent.capabilityKeys.includes('approved'),
    reason: `policy:${workItem.workItemId}`,
  }),
}
```

`policyId` is required whenever a callback is installed. It is persisted and
must match when an execution resumes, preventing a restart from silently
changing the policy implementation.

## Persistence and recovery

`InMemoryCollectiveStateStore` is suitable for local applications and tests.
Production adapters implement `CollectiveStateStore.save` as an atomic
compare-and-swap over `expectedRevision`. State adapters must integrity-protect
snapshots and allow only one active coordinator for an execution.

Abort a run with its `AbortSignal` to persist a `paused` execution. Construct a
new collective with the same configuration, agents and state store, then call
`resume`. Completed dependency results and event history are retained.
Calling `cancel(executionId)` on active local work first signals the provider,
waits for the paused checkpoint, and then persists a terminal cancellation.

This package is a high-level application coordinator. It does not replace the
signed decentralized peer, lease, fencing and certified-recovery protocols in
`@agentplat/mesh`, nor does a collective assignment grant authority for an
external side effect. Applications that need those boundaries compose them in
their provider or transport adapter.
