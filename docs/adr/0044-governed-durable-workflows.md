# ADR 0044: Durable workflows remain governed AgentPlat state

- Status: accepted
- Date: 2026-08-28

## Context

`@agentplat/workflows` currently exposes process, stage, task-run and store
contracts plus a deterministic in-memory store. It cannot represent durable
waits, external signals, approval gates, cancellation or an executable runner.
Applications that need a process lasting hours or weeks must therefore own a
second orchestration model or import a workflow engine directly.

Agent Rooms already provide human approvals, versioned artifacts, operational
events and durable coordination. Inference Control and Collective Control
already protect external effects through current authority, idempotency and
fencing. The missing capability is a narrow process runtime that composes those
boundaries without making a scheduler, a workflow-engine history or an
application-specific outcome authoritative.

## Decision

1. Add opt-in V1 contracts to `@agentplat/workflows` while retaining the
   existing public contracts for the current release line. A process definition
   becomes a validated DAG of task, wait, signal and generic gate stages.
2. Add a provider-neutral `ProcessRunnerV1` with idempotent `start`, `signal`,
   `cancel` and read-only `describe` operations. The reference in-memory runner
   uses the same transition reducer as durable adapters.
3. AgentPlat owns process definitions, run revisions, signals, stage outcomes,
   cancellation, usage, outcome attribution and audit events. Every state
   mutation is revision checked. A transport cannot create authority or recover
   canonical state from its own history.
4. Add `@agentplat/workflows-postgres` as the authoritative durable adapter and
   `@agentplat/workflows-temporal` as an optional wakeup, retry and history
   rollover adapter. Temporal invokes one bounded advance activity; it does not
   own process state or protected effects.
5. Add `@agentplat/workflows-rooms` as the integration boundary between generic
   gates and Agent Room approvals. Room decisions reach a run through the
   transactional Room operational stream and an idempotent workflow signal.
   Gate expiry always fails closed.
6. Add `@agentplat/autonomy` as an opt-in, provider-neutral supervision-policy
   controller. It decides whether an action is denied, proposal-only, requires
   human approval or is eligible to proceed without an autonomy approval. It
   never issues an Action Grant or dispatches an effect.
7. Progressive autonomy consumes bounded, delayed outcome evidence attributed
   to the exact task execution revision. Promotion is slow, sampled and
   coverage-gated; degradation is immediate and can be triggered by exact
   caller-configured reason codes. Missing evidence never counts as success.
8. External effects still pass through the existing Action Gateway or governed
   action composition. Logical idempotency in a task run is not presented as an
   exactly-once external-effect guarantee. That guarantee additionally requires
   an atomic idempotency or fencing boundary at the downstream sink.
9. Application vocabulary remains outside platform packages. CI enforces
   package dependency direction and supports a caller-supplied terminology
   denylist. Provider-specific infrastructure adapters remain permitted when
   they preserve AgentPlat authority and expose no business-domain semantics.

## Consequences

- Applications can run a governed long-lived process in memory, with
  PostgreSQL workers or through Temporal without importing Temporal in domain
  code.
- Agent Room approvals become durable process inputs while remaining Room-owned
  human decisions.
- Existing `ProcessDefinition`, `ProcessRun`, `TaskRun` and `WorkflowStore`
  consumers remain source compatible. V1 adapters use the new revisioned
  contracts and explicit conversion helpers.
- Deployments must configure retention, encryption, authenticated signal
  ingress, PostgreSQL transaction isolation and downstream effect fencing.
- Outcomes and autonomy decisions are evidence and policy, not universal truth,
  global reputation or execution authority.
- Conformance results demonstrate behavior of the tested adapters; they do not
  establish production-scale liveness, performance or exactly-once effects.

## Alternatives considered

### Build a durable scheduler inside AgentPlat

Rejected. Timers, worker recovery and history rollover are infrastructure
capabilities. AgentPlat owns the governed state machine and supplies narrow
adapters to infrastructure that already provides them.

### Make Temporal history the process source of truth

Rejected. It would split authority from AgentPlat stores, make backend exchange
nominal and allow transport state to influence governance decisions.

### Put Agent Room fields in workflow stage contracts

Rejected. Generic gate stages use opaque gate type and payload bindings. The
Room adapter owns approval identifiers, participants and artifact versions.

### Let autonomy dispatch actions directly

Rejected. Supervision policy can only narrow whether an existing governed
action is eligible to proceed. Current authority, assessment, grant,
idempotency and fencing remain enforced by the existing action boundary.

### Treat missing outcomes as successful outcomes

Rejected. A broken feedback pipeline would silently promote autonomy precisely
when the system has lost its quality signal.
