# @agentplat/rooms-temporal

Optional Temporal transport for durable Agent Room coordination. Agent Room
state, leases, operation IDs and recovery remain owned by `@agentplat/rooms`
and its stores; Temporal supplies wakeups, activity retry and history rollover.

Applications bind `runCoordinationCycle` to their
`AgentRoomCoordinationRuntime`, bundle `agentRoomCoordinationWorkflow` in a
Temporal worker and call `TemporalAgentRoomCoordinationAdapter.notify` after a
durable inbox mutation.

```ts
import {
  createTemporalAgentRoomActivities,
  TemporalAgentRoomCoordinationAdapter,
} from "@agentplat/rooms-temporal";

const activities = createTemporalAgentRoomActivities({
  runtime: coordinationRuntime,
  store: coordinationStore,
});

const adapter = new TemporalAgentRoomCoordinationAdapter({
  client: temporalClient,
  taskQueue: "agentplat-agent-rooms",
});

await adapter.notify({
  tenantId,
  roomId,
  coordinationId: `room:${roomId}`,
  expectedRevision,
});
```

Register `activities` on a Temporal worker whose workflow bundle exports
`agentRoomCoordinationWorkflow` from `@agentplat/rooms-temporal/workflow`.
Workflow history contains wakeup and retry coordination only; reconstructing a
Room or deciding authority from Temporal history is unsupported.

Run package contracts with `pnpm test`. With a disposable Temporal Server at
`TEMPORAL_ADDRESS`, `pnpm test:real` exercises signals, activity binding,
worker restart and `continueAsNew`.
