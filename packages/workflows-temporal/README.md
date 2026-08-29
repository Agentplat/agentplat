# `@agentplat/workflows-temporal`

Optional Temporal transport for Governed Durable Workflows V1. AgentPlat stores
remain authoritative for definitions, process/task state, signals, outcomes,
idempotency and execution authority. Temporal supplies wakeups, activity retry,
durable timers and history rollover.

`TemporalProcessRunnerV1` commits `start`, `signal` and `cancel` through an
injected authoritative runner before calling Temporal `signalWithStart`.
`TemporalWorkflowReconcilerV1` discovers committed runnable state and recovers a
lost client notification.

The Temporal workflow calls one bounded `advanceProcess` activity, sleeps
without consuming a worker and uses `continueAsNew`. Reconstructing a
`ProcessRunV1`, approval, outcome or authority decision from Temporal history is
unsupported.

Notification failure is visible to the caller after the AgentPlat mutation has
committed. Retrying the same mutation is safe and the reconciler remains the
background recovery path.
