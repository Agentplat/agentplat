# Governed Durable Workflows V1 implementation plan

Status: implemented source baseline for the coordinated `0.3.0-beta.6` cohort.
An isolated clean validation commit passed build, public audit, platform
boundaries and release verification without modifying the user's shared branch.

## Current implementation evidence

`@agentplat/workflows` now exports:

- closed V1 task, process, stage, signal, run, runner, worker and store
  contracts alongside the unchanged legacy API;
- browser-safe canonical JSON, domain-separated SHA-256 digests and strict
  definition validation;
- outcome-aware DAG validation, conditional branch skipping and topological
  ordering;
- immutable task definitions with a separate protected-external executor
  boundary;
- an in-memory CAS store, idempotent process operations and retained signals;
- a deterministic runner for tasks, waits, external signals and generic gates;
- fail-closed gate-provider errors, bounded retry, logical-time checks and
  terminal-state stickiness;
- explicit cancellation with reverse-topological compensation;
- a bounded local worker plus public type and runtime tests;
- revisioned task claims and settlements bound to handler, prompt, model,
  policy, toolset and runtime digests;
- stable task idempotency lookup, currency-safe usage aggregation and retained
  `indeterminate` protected effects; and
- the browser-safe `./outcomes` entry point with delayed attribution,
  distribution summaries and healthy/insufficient/stale/unavailable coverage;
- `@agentplat/workflows-postgres` with ordered migration/rollback controls,
  durable definitions, process/task CAS, operation and signal idempotency,
  transition journaling, operational queries and delayed outcomes; and
- an integration test that migrates an ephemeral PostgreSQL 16 instance,
  reopens repository/runner instances, resumes from a signal, preserves task
  usage/outcomes and admits one winner in a task CAS race; and
- `@agentplat/workflows-conformance`, whose digest-bound complete case report
  runs identically against memory and PostgreSQL and requires a distinct reopen
  plus destructive-test consent for persistence evidence; and
- `@agentplat/workflows-temporal`, which commits through the authoritative
  runner before `signalWithStart`, advances through one bounded activity,
  recovers lost notifications, carries timer position through `continueAsNew`
  and passed a real Temporal worker restart/rollover scenario; and
- `@agentplat/workflows-rooms` plus Agent Room migration 012, providing
  version-bound approval chains, human revision lineage, terminal expiry and a
  checkpointed operational-event projector whose signals only wake the
  canonical gate provider; and
- `@agentplat/autonomy` and `@agentplat/autonomy-postgres`, providing bounded
  evidence windows, one-level promotion, asymmetric/critical degradation,
  stable sampling, unavailable-store denial, workflow-outcome derivation,
  exact Room approval evidence and an atomic CAS decision journal; and
- a machine-enforced platform boundary covering portable imports, manifest
  dependencies, scoped neutral terminology and adapter admission records,
  backed by ADR 0045 and positive/negative verifier tests;
- bounded task leases, heartbeat renewal, generation takeover, cooperative
  abort and stale-owner settlement fencing in memory and PostgreSQL; and
- a coordinated 62-package Beta 6 release line whose pack smoke inventories 200
  API surfaces and runs clean pnpm/npm consumers.

This evidence is source, local test, disposable PostgreSQL and local Temporal
development-server and disposable PostgreSQL behavior only. It does not claim
that any application policy, outcome producer or deployment is safe or
empirically accurate.

## Product outcome

AgentPlat can execute a provider-neutral process that lasts across restarts,
waits for external facts or human decisions, cancels safely, attributes resource
usage and delayed outcomes to the exact execution that produced them, and
changes the required level of human supervision from bounded evidence.

The capability is generic. Its public contracts contain no vocabulary for
sales, incidents, support, finance or any other application domain.

## Architectural boundary

AgentPlat owns:

- process definitions, revisions and validation;
- process and task-run state;
- signal identity, deduplication and consumption;
- waits, gate disposition, cancellation and compensation scheduling;
- execution bindings, usage, delayed outcomes and evidence coverage;
- supervision policy, autonomy state and decisions;
- Room approval references and audit lineage; and
- current authority checks before protected effects.

Applications own:

- the meaning of task types, subjects, signals and outcome reason codes;
- task handlers and downstream effect adapters;
- the mapping from domain objects to opaque subject references;
- gate payload construction and the selection of a Room and target;
- outcome producers and their authorization; and
- autonomy segmentation and policy values.

Infrastructure adapters own:

- PostgreSQL connection, schema and operational configuration;
- Temporal workers, task queues, wakeups, retry and history rollover;
- clocks and timers that wake a runner without deciding the result; and
- authenticated transport into the signal and outcome ports.

No transport event, model output, outcome, Room projection or autonomy score
creates execution authority by itself.

## Package map

| Package or entry point             | Responsibility                                                                                       | Dependencies                | Browser-safe       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------- | ------------------ |
| `@agentplat/workflows`             | V1 contracts, validation, pure reducer, store/runner/worker ports and deterministic in-memory runner | `@agentplat/core`           | yes                |
| `@agentplat/workflows/outcomes`    | delayed outcome, coverage and aggregation contracts plus pure validation                             | package root                | yes                |
| `@agentplat/workflows-postgres`    | definitions, runs, transitions, signals, task claims, usage and outcomes                             | workflows, postgres, `pg`   | no                 |
| `@agentplat/workflows-temporal`    | narrow wakeup/retry/rollover adapter                                                                 | workflows, Temporal SDK     | no                 |
| `@agentplat/workflows-rooms`       | generic gate to Agent Room approval bridge and Room event projector                                  | workflows, rooms            | no                 |
| `@agentplat/autonomy`              | pure policies, evidence windows, decisions, state and controller                                     | core                        | yes                |
| `@agentplat/autonomy/actions`      | supervision guard for existing Action Gateway composition                                            | autonomy, inference-control | yes                |
| `@agentplat/autonomy-postgres`     | autonomy state, evidence cursors and decision journal                                                | autonomy, postgres, `pg`    | no                 |
| `@agentplat/workflows-conformance` | executable store and runner compatibility suites                                                     | workflows                   | no import-time I/O |

`@agentplat/workflows-rooms` is an adapter package rather than an import from
the workflows root. This prevents Agent Rooms from becoming required by every
process implementation.

## Relationship to existing controls

| Existing capability                        | Reused as                                                       | Not duplicated by this design                             |
| ------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------- |
| Agent Room approvals and artifact versions | human decision and immutable edit lineage                       | no second approval aggregate inside workflows             |
| Agent Room operational stream/checkpoints  | replay-safe decision projection                                 | no polling of external work-management state as authority |
| Runtime checkpoints                        | fail-closed provider control points                             | no new provider-specific checkpoint protocol              |
| Inference Control `ActionGateway`          | final grant, authority recheck, idempotency and effect dispatch | autonomy cannot execute an action                         |
| Collective Control governed actions        | composed mandate/budget/fence enforcement when used             | no new collective authority model                         |
| Trust and Inference Control assessments    | optional current evidence for the normal action path            | outcome statistics do not become trust or safety truth    |
| Outcome-driven team structure adaptation   | bounded adaptation precedent for a different scope              | application supervision does not mutate Agent Mesh teams  |
| AgentPlat Planner                          | planning and materialization inside an Agent Room               | process execution does not replace planning/replanning    |

Progressive autonomy is a separate package because its state is an
application-action supervision policy, not agent role alignment, collective
team adaptation or process scheduling. Its action entry point adapts to the
existing gateway instead of adding a parallel dispatcher.

## Request traceability

| Request                      | Design location                               | Important refinement                                                                    |
| ---------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| WF-01 stages and DAG         | core contracts and Increment 1                | versioned additive contracts; outcome-aware dependencies support alternate branches     |
| WF-02 cancellation           | cancellation and compensation                 | logical exactly-once only; external compensation still needs sink idempotency/fencing   |
| WF-03 task idempotency       | task executions and Store V1                  | retains `indeterminate` after ambiguous external commit                                 |
| WF-04 usage and subject      | task usage and PostgreSQL queries             | checked integer cost grouped by currency; subject remains opaque                        |
| WF-05 runner                 | runner and transition model                   | common bounded `advance` gives memory, workers and Temporal identical semantics         |
| WF-06 PostgreSQL             | PostgreSQL adapter                            | CAS, leases, journals and operational queries are part of correctness, not only storage |
| WF-07 Temporal               | Temporal adapter                              | wakeup/retry transport only; no history-derived state or authority                      |
| WF-08 conformance            | workflows-conformance and verification matrix | distinct-process durability cases separate from in-memory behavior                      |
| GT-01 Room gate              | Agent Room gate bridge                        | generic gate root contract plus separate Room adapter                                   |
| GT-02 Room decision          | projection and artifact lineage               | edits use immutable artifact versions and a new approval                                |
| GT-03 fail-closed expiry     | Room approval changes and threat model        | first revision-checked terminal transition wins; expiry can never approve               |
| AU-01 levels/controller      | progressive autonomy                          | controller decides supervision only and cannot dispatch                                 |
| AU-02 asymmetric degradation | autonomy state transition                     | exact caller-configured critical reasons; no built-in taxonomy                          |
| AU-03 fenced actions         | Action Gateway composition                    | autonomy guard narrows the existing governed path                                       |
| AU-04 fail closed/audit      | store failure and observability               | unavailable state denies unless a current cache can only preserve/narrow                |
| OC-01 delayed attribution    | delayed outcome record                        | binds complete execution digest, not only prompt/model strings                          |
| OC-02 version metrics        | outcome queries                               | generic distributions; `accuracy` requires an explicit denominator policy               |
| OC-03 missing signal         | coverage monitor                              | freezes promotion and may trigger configured degradation                                |
| BD-01 CI boundary            | boundary hygiene                              | dependency rules are primary; terminology scans are scoped and extensible               |
| BD-02 adapter placement      | adapter admission rule                        | provider adapters may live in-tree only behind neutral ports and authority boundaries   |

## Compatibility strategy

The current `ProcessDefinition`, `ProcessStage`, `ProcessRun`, `TaskRun`,
`WorkflowStore` and `InMemoryWorkflowStore` exports remain available during the
current release line. V1 adds explicitly versioned contracts rather than
silently changing the structural meaning of those interfaces.

Provide:

- `upgradeProcessDefinitionV1(legacy)` to create a linear V1 DAG;
- `upgradeProcessRunV1(legacy, definition)` for diagnostic migration only;
- `LegacyWorkflowStoreAdapterV1` for local compatibility where no waiting,
  signals, gates or durable execution are requested; and
- deprecation annotations only after V1 runner conformance is implemented.

The run converter must refuse ambiguous legacy state. It cannot infer an
external effect, signal, approval or exact execution binding that was never
recorded.

## Repository change inventory

| Area                             | Planned changes                                                                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/workflows`             | retain legacy root exports; add V1 contracts, codecs, digests, validation, reducer, store/runner/worker ports, memory adapters and `./outcomes` export   |
| `packages/rooms`                 | add approval expiry fields/status/event/service operation and any repository methods required for exact approval lookup                                  |
| `packages/rooms-api`             | expose authenticated approval expiry only for an authorized system/operator principal; preserve human-only decision routes                               |
| `packages/rooms-postgres`        | add approval-expiry/index migration, operational-event payload migration and updated row mapping/tests                                                   |
| `packages/workflows-postgres`    | new migrations, CLI, repositories, worker discovery, query surface and restart tests                                                                     |
| `packages/workflows-temporal`    | new client adapter, workflow/activity contracts, reconciler and disposable-service tests                                                                 |
| `packages/workflows-rooms`       | new gate resolver/provider, Room projector, redaction hooks and integration tests                                                                        |
| `packages/autonomy`              | new pure policy/state/controller root and Action Gateway guard subpath                                                                                   |
| `packages/autonomy-postgres`     | new migration/repository package and restart/CAS tests                                                                                                   |
| `packages/workflows-conformance` | new portable runner/store suites and signed/bound report contracts if reports are persisted                                                              |
| `examples`                       | neutral long-running process, Room gate and progressive-supervision examples                                                                             |
| `tests`                          | public type contracts, package exports, architecture/dependency boundaries and end-to-end fault cases                                                    |
| `config/public-packages.json`    | register every new public package, layer, browser entry point and pack-smoke requirement                                                                 |
| root scripts/config              | add focused verification commands, adapter tests, packed consumers and platform-boundary configuration                                                   |
| docs/spec                        | add package READMEs, migration runbooks and compatibility notes; update normative spec only if workflow compatibility becomes a declared AgentPlat level |

The initial implementation should split the current single-file workflows
package into focused modules without changing its root import behavior.

## Core contracts

The following shapes define the intended public semantics. Exact field names
may change only before implementation begins and must then be frozen by public
type tests.

### Definitions and DAG

```ts
type ProcessStageOutcomeV1 =
  | "succeeded"
  | "failed"
  | "timed_out"
  | "canceled"
  | "skipped"
  | "signal_received"
  | "approved"
  | "rejected"
  | "expired";

interface ProcessStageDependencyV1 {
  stageId: string;
  outcomes: readonly ProcessStageOutcomeV1[];
}

interface ProcessStageBaseV1 {
  schemaVersion: 1;
  stageId: string;
  name: string;
  dependsOn: readonly ProcessStageDependencyV1[];
  dependencyMode?: "all" | "any";
  timeoutMs?: number;
  metadata?: JsonObject;
}

type ProcessStageV1 =
  | (ProcessStageBaseV1 & {
      kind: "task";
      taskDefinitionId: string;
      taskDefinitionVersion: string;
      retryPolicy?: TaskRetryPolicyV1;
      compensationForStageId?: string;
    })
  | (ProcessStageBaseV1 & {
      kind: "wait";
      durationMs: number;
    })
  | (ProcessStageBaseV1 & {
      kind: "await_signal";
      signalType: string;
      correlationKey?: string;
    })
  | (ProcessStageBaseV1 & {
      kind: "gate";
      gateType: string;
      gateDefinitionId: string;
      configuration?: JsonObject;
      expiresInMs?: number;
    });

interface ProcessDefinitionV1 {
  schemaVersion: 1;
  processId: string;
  version: string;
  name: string;
  stages: readonly ProcessStageV1[];
  cancellationTriggers?: readonly ProcessCancellationTriggerV1[];
  limits: ProcessDefinitionLimitsV1;
  definitionDigest: `sha256:${string}`;
}
```

Task definitions are separately immutable and versioned:

```ts
interface TaskDefinitionV1 {
  schemaVersion: 1;
  taskDefinitionId: string;
  version: string;
  name: string;
  handlerKey: string;
  effectClass: "internal" | "protected_external";
  actionBinding?: {
    namespace: string;
    toolId: string;
    operation: string;
  };
  limits: TaskDefinitionLimitsV1;
  definitionDigest: `sha256:${string}`;
}
```

`protected_external` requires an action binding and an executor composed with
the existing Action Gateway. `internal` is a declared posture, not proof that a
malicious handler has no hidden effects; hosts remain responsible for which
handlers they register.

A dependency is satisfied only when the referenced stage is terminal with one
of the exact listed outcomes. This permits separate branches for approval,
rejection and expiry without embedding a domain-specific routing language.
Stages with no dependencies are roots. A process completes when every reachable
stage is terminal and no unmatched branch can become reachable. When all
predecessors of a blocked stage are terminal and its dependency predicate can no
longer become true, the reducer marks that stage `skipped`; this decision is
deterministic and journaled.

Validation rejects:

- duplicate stage IDs, missing dependency references and self-dependencies;
- any cycle, including cycles that use compensation stages;
- an empty outcome list or an outcome impossible for the referenced stage kind;
- an unbounded or empty signal/gate identifier;
- invalid timeout, retry, byte, stage-count or fan-out limits;
- compensation of another compensation stage;
- definitions whose terminal reachability is ambiguous; and
- a digest that does not match canonical definition bytes.

Definition registration is immutable by `(tenantId, processId, version)`. Reuse
with identical bytes is idempotent; reuse with a different digest is a conflict.

### Run and stage state

```ts
type ProcessRunStatusV1 =
  | "pending"
  | "running"
  | "waiting"
  | "canceling"
  | "completed"
  | "failed"
  | "canceled";

type ProcessStageStatusV1 =
  "blocked" | "ready" | "running" | "waiting" | "terminal";

interface ProcessStageStateV1 {
  stageId: string;
  status: ProcessStageStatusV1;
  outcome?: ProcessStageOutcomeV1;
  attempt: number;
  taskRunId?: string;
  waitUntil?: string;
  consumedSignalId?: string;
  gateRequestId?: string;
  startedAt?: string;
  finishedAt?: string;
  reasonCode?: string;
}

interface ProcessRunV1 {
  schemaVersion: 1;
  tenantId: string;
  runId: string;
  processId: string;
  processVersion: string;
  definitionDigest: `sha256:${string}`;
  revision: number;
  status: ProcessRunStatusV1;
  stageStates: readonly ProcessStageStateV1[];
  input?: JsonObject;
  result?: JsonObject;
  subject?: SubjectReferenceV1;
  cancellation?: ProcessCancellationStateV1;
  createdAt: string;
  updatedAt: string;
  stateDigest: `sha256:${string}`;
}
```

Every transition increments `revision` exactly once and binds the predecessor
state digest. Terminal run state is sticky. Logical clock rollback, definition
substitution and a state digest mismatch fail closed.

### Signals

```ts
interface ProcessSignalV1 {
  schemaVersion: 1;
  tenantId: string;
  runId: string;
  signalId: string;
  signalType: string;
  correlationKey?: string;
  payload?: JsonObject;
  sourceType: string;
  sourceId: string;
  sourceRevision?: number;
  receivedAt: string;
  signalDigest: `sha256:${string}`;
}
```

Signal identity is scoped by tenant and run. Exact replay returns the retained
receipt. Reusing an identity with a different digest is a conflict. A signal is
append-only and may be consumed by at most one stage unless the definition
explicitly declares a broadcast signal mode. V1 defaults to single consumption.

Signal ingress must authenticate the caller outside the pure package. A source
label is provenance, not proof of source authorization.

### Task executions, idempotency and usage

```ts
interface TaskExecutionBindingV1 {
  taskDefinitionId: string;
  taskDefinitionVersion: string;
  handlerDigest: `sha256:${string}`;
  promptRevision?: string;
  promptDigest?: `sha256:${string}`;
  modelProvider?: string;
  modelName?: string;
  modelRevision?: string;
  modelConfigurationDigest?: `sha256:${string}`;
  policyDigest?: `sha256:${string}`;
  toolsetDigest?: `sha256:${string}`;
  runtimeImplementationDigest?: `sha256:${string}`;
  bindingDigest: `sha256:${string}`;
}

interface TaskUsageV1 {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  durationMs?: number;
  cost?: { currency: string; micros: number };
}

interface TaskRunV1 {
  schemaVersion: 1;
  tenantId: string;
  taskRunId: string;
  processRunId: string;
  stageId: string;
  attempt: number;
  idempotencyKey: string;
  inputDigest: `sha256:${string}`;
  status:
    | "claimed"
    | "running"
    | "completed"
    | "failed"
    | "canceled"
    | "indeterminate";
  binding: TaskExecutionBindingV1;
  subject?: SubjectReferenceV1;
  usage?: TaskUsageV1;
  resultReference?: string;
  resultDigest?: `sha256:${string}`;
  startedAt?: string;
  finishedAt?: string;
}
```

`SubjectReferenceV1` contains only bounded opaque `subjectType` and `subjectId`
strings. Platform code can group those values but cannot interpret them.

The stable task idempotency key identifies one logical attempt. A replay with
the same input and binding returns its retained result. A changed input or
binding is a conflict. If a crash occurs after an external commit but before a
local receipt, the task remains `indeterminate` until the application reconciles
through the same downstream idempotency identity.

AgentPlat only claims an exactly-once logical transition. Exactly-once external
behavior requires the handler and downstream sink to atomically enforce the
same identity or a current fence.

Usage validation uses non-negative safe integers. `totalTokens`, when present
with both components, must equal their sum. Cost aggregation never combines
different currencies. Overflow fails rather than truncating or rounding.

## Runner and transition model

### Public port

```ts
interface ProcessRunnerV1 {
  start(input: StartProcessInputV1): Promise<ProcessOperationResultV1>;
  signal(input: SignalProcessInputV1): Promise<ProcessOperationResultV1>;
  cancel(input: CancelProcessInputV1): Promise<ProcessOperationResultV1>;
  describe(input: DescribeProcessInputV1): Promise<ProcessRunV1 | undefined>;
}
```

Every mutation input includes tenant, operation ID, an idempotency key and a
canonical request digest. `start` binds an exact definition version. `signal`
never accepts an implicit "latest" run. `cancel` carries an opaque reason code,
not free-form authority instructions.

`ProcessOperationResultV1` states whether the request was applied, replayed or
rejected as a conflict and returns the resulting run revision. It does not
report a waiting process as failed.

`ProcessWorkerV1` is the infrastructure-neutral polling worker. It discovers
bounded ready runs, claims leases, calls `advance`, renews heartbeats and drains
gracefully. A PostgreSQL deployment can use this worker without Temporal. The
in-memory runner advances synchronously until it reaches waiting, terminal or a
configured fairness bound.

### Internal advance boundary

The common runtime exposes one bounded internal operation:

```ts
advance(input: {
  tenantId: string;
  runId: string;
  expectedRevision: number;
  leaseToken: string;
  logicalTime: string;
  maximumTransitions: number;
}): Promise<AdvanceProcessResultV1>
```

One advance call performs at most the configured number of pure transitions
and at most one effectful task dispatch. The result indicates the next wakeup,
whether ready work remains and the current revision. This prevents one noisy
run from monopolizing a worker and gives both in-process and Temporal adapters
the same semantics.

### Task and gate ports

The runner receives construction-bound ports:

- `TaskExecutorPortV1` executes or reconciles one exact `TaskRunV1` claim;
- `GateRequestResolverPortV1` resolves one exact runtime gate request from the
  immutable stage configuration, process input and prior result references;
- `GateProviderPortV1` creates or loads that exact generic gate request;
- `ProcessClockV1` provides trusted monotonic and wall-clock values;
- `ProcessObserverV1` receives immutable content-bounded events but cannot
  influence transitions; and
- an optional current-authority resolver narrows task dispatch eligibility.

Provider errors are classified as transient, permanent, indeterminate or
policy denial. Unknown errors become indeterminate for a possibly committed
effect and permanent for a provably pre-dispatch failure.

The core package does not implement a string-template or expression language
for dynamic task and gate inputs. Applications provide construction-bound,
versioned resolvers whose identity and output digest are retained on the task
or gate record. This avoids evaluating application expressions inside a
portable platform definition.

## Cancellation and compensation

Cancellation triggers may be:

- an explicit `cancel` operation;
- an exact signal type and optional correlation key;
- a process deadline; or
- a caller-registered terminal source state delivered as an authenticated
  signal.

When accepted, cancellation atomically moves the run to `canceling`, prevents
all unclaimed normal stages from becoming ready and requests cooperative abort
for leased tasks. Already committed external effects are not undone
automatically.

Compensations are ordinary task stages marked with `compensationForStageId`.
They use their own stable idempotency identity, execute only if the referenced
stage reached `succeeded`, and are scheduled in reverse topological order.
Logical compensation is at-most-one successful task result per identity;
external exactly-once behavior has the same downstream requirement as any other
effect.

Cancellation reaches `canceled` only when all required compensations are
terminal. A failed or indeterminate compensation leaves the run in a
diagnosable non-success state and never re-enables normal pending stages.

## Store V1

The legacy `WorkflowStore` is insufficient for concurrent execution. Add a
closed `WorkflowStoreV1` contract with operations for:

- immutable definition registration and exact-version lookup;
- atomic start-key claim plus initial run creation;
- run load, tenant-scoped listing and stuck-run filtering;
- revision and predecessor-digest checked transition commit;
- append-only operation, signal and transition journals;
- atomic signal identity claim and consumption;
- task-run identity claim, lease, heartbeat, settlement and reconciliation;
- gate request identity and retained disposition;
- usage and outcome append; and
- explicit retention-safe diagnostic reads.

A transition commit atomically writes the next run, affected task/gate records,
signal consumption, usage and transition event. Observers and Temporal wakeups
occur only after commit and are replay-safe.

The in-memory store implements the same semantic contract and conformance
cases. It makes no restart-durability or multi-process claim.

## PostgreSQL adapter

Create `@agentplat/workflows-postgres` with ordered migrations, migration
status, explicit rollback confirmation, repository implementations and a CLI
consistent with other PostgreSQL packages.

### Tables

| Table                             | Key and purpose                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| `workflow_definitions`            | immutable `(tenant_id, process_id, process_version)` plus definition JSON and digest     |
| `workflow_runs`                   | `(tenant_id, run_id)`, revision, state JSON, state digest, status, wakeup and timestamps |
| `workflow_start_keys`             | `(tenant_id, idempotency_key)` with request digest and run ID                            |
| `workflow_operations`             | exact mutation idempotency, request digest, retained result and timestamps               |
| `workflow_signals`                | `(tenant_id, run_id, signal_id)`, source binding, digest and optional consumer stage     |
| `workflow_task_runs`              | logical attempts, binding, idempotency, lease, status, usage and result references       |
| `workflow_gate_requests`          | generic gate identity, provider type, request digest, status and provider reference      |
| `workflow_transition_events`      | append-only run-revision journal with predecessor and next state digests                 |
| `workflow_outcomes`               | delayed outcome records bound to exact task run and execution binding                    |
| `workflow_outcome_expectations`   | optional expected coverage windows by tenant and opaque action type                      |
| `workflow_projection_checkpoints` | compare-and-set projector high waters                                                    |

Recommended indexes cover ready runs by `next_wakeup_at`, stuck leased tasks,
run status and update time, task idempotency, opaque subjects, execution binding
digest, outcome observation time and coverage expectation.

### Transaction and isolation rules

- Every query is tenant scoped.
- Transition CAS is a single `UPDATE ... WHERE revision = expectedRevision AND
state_digest = predecessorDigest` transaction.
- Start, signal and operation idempotency use unique keys plus request digests;
  `ON CONFLICT DO NOTHING` is followed by exact retained-record comparison.
- Claims use database time, bounded leases and `SKIP LOCKED` only for discovery;
  state correctness still uses CAS.
- A lease token cannot be reused after expiry or ownership change.
- Down migrations refuse to run without the package-specific confirmation and
  document data loss.
- JSON records are validated after read and before use; database presence is not
  schema validity.

## Temporal adapter

`@agentplat/workflows-temporal` implements `ProcessRunnerV1` as a client adapter
and exports one workflow plus one activity contract.

The Temporal workflow:

1. receives only tenant ID, run ID, expected revision and rollover counters;
2. waits for a signal or a returned `nextWakeupAt`;
3. calls `advanceProcess` with a fresh lease token and bounded transition count;
4. immediately loops when ready work remains;
5. sleeps without consuming a worker while waiting;
6. uses `continueAsNew` at a configured cycle/history threshold; and
7. terminates only after the authoritative run is terminal.

The Temporal client adapter first commits `start`, `signal` or `cancel` through
the authoritative runner and only then starts or notifies the Temporal
workflow. If that notification fails, a bounded reconciler discovers committed
ready runs and starts/notifies the matching workflow. A Temporal workflow can
therefore be absent or duplicated as a wakeup mechanism without losing or
duplicating a logical AgentPlat transition.

The activity loads and changes state through `WorkflowStoreV1`. Temporal
signals are wakeup hints; the durable AgentPlat signal is appended before the
wakeup. Duplicate, delayed or missing wakeup hints cannot change process
semantics. Polling/list-ready recovery covers a committed signal whose wakeup
notification was lost.

Reconstructing `ProcessRunV1`, gate decisions, authority or outcomes from
Temporal history is unsupported.

## Agent Room gate bridge

### Generic gate registration

`@agentplat/workflows-rooms` registers a `gateType` such as
`agentplat.room.approval.v1` with `GateProviderPortV1`. The generic workflow
definition stores a resolver identity and bounded static configuration. At
runtime the construction-bound resolver combines that configuration with the
exact run and prior result references, then the adapter validates its output
into:

```ts
interface AgentRoomGateRequestV1 {
  tenantId: string;
  runId: string;
  stageId: string;
  roomId: string;
  targetType: "room" | "task" | "artifact" | "action";
  targetId: string;
  action?: string;
  requestedBy?: string;
  expiresAt?: string;
}
```

The created gate record retains `approvalId`, artifact `targetVersion` when
applicable, Room event cursor and an exact request digest. Repeated creation
returns the existing approval only when every binding matches.

### Room approval changes

Extend the Room approval contract with:

- optional `expiresAt`;
- terminal `expired` status;
- a dedicated revision-safe `expireApproval` service operation that can only
  move `requested` to `expired`; and
- an `approval_expired` event.

`@agentplat/rooms-postgres` receives an ordered migration that adds
`expires_at`, extends the approval status constraint and indexes requested
approval deadlines. A following operational-stream migration retains the
bounded payload of Room domain events in `agent_room_operational_events`; the
current stream records event type and ID but not the approval ID contained in
the source event payload. Existing rows remain valid and the bridge starts from
an explicit checkpoint after the migration.

Human `resolveApproval` continues to allow only `approved`, `rejected` and
`needs_revision`. Expiry is a system transition authorized by the host and
never becomes approval.

Approval with edits is represented through existing versioned artifacts:

1. the reviewer returns `needs_revision` with a comment;
2. the human or application creates a new `ArtifactVersion`;
3. a new approval binds the new exact artifact version; and
4. only approval of that version emits the `approved` gate outcome.

The first approval is immutable evidence. V1 does not mutate reviewed content
or encode edited content inside an approval payload.

### Projection and wakeup

A `WorkflowRoomGateProjectorV1` reads the transactional Agent Room operational
stream after a CAS checkpoint. For each approval event it loads the exact Room
approval, verifies tenant, Room, target and version bindings, then appends a
workflow signal with identity derived from approval ID, status and decision
timestamp. The signal payload contains bounded references and comments or
artifact diff references according to a caller redaction policy.

The projector is eventually consistent across Room and workflow stores.
Idempotent signals make replay safe. When both use one PostgreSQL database, a
future optimized adapter may share a transaction, but V1 does not require or
claim cross-package atomicity.

On an expiry/decision race, the first valid terminal Room approval transition
wins. A gate timeout that cannot prove approval takes the `expired` branch.

## Delayed outcome loop

### Outcome record

```ts
interface TaskOutcomeV1 {
  schemaVersion: 1;
  tenantId: string;
  outcomeId: string;
  taskRunId: string;
  taskExecutionBindingDigest: `sha256:${string}`;
  outcomeType: string;
  verdict: "positive" | "negative" | "corrected" | "inconclusive";
  reasonCode?: string;
  severity?: "ordinary" | "critical";
  scoreBasisPoints?: number;
  sourceType: string;
  sourceId: string;
  observedAt: string;
  recordedAt: string;
  evidenceReferenceIds: readonly string[];
  outcomeDigest: `sha256:${string}`;
}
```

Outcome type, reason code and source type are opaque bounded strings. The
platform validates and groups them but has no built-in commercial or domain
meaning. `severity: critical` is accepted only from an authorized outcome
producer; progressive autonomy still uses the exact policy-configured reason
set rather than trusting arbitrary severity labels.

An outcome append verifies that the task run exists, the execution binding
digest matches its immutable binding and observation time is not before task
start. Exact replay is idempotent; conflicting outcome identity fails.

### Queries

The outcome store exposes:

- counts by execution binding, prompt revision, model revision and opaque
  subject type;
- verdict and reason-code distributions;
- optional score aggregates with sample counts and explicit missing-score
  counts;
- coverage counts and observation lag; and
- an ordered evidence window with a stable cursor for autonomy consumption.

The API calls a metric `accuracy` only when the caller provides a policy that
maps exact outcome types/verdicts into a binary denominator. Generic platform
queries return distributions rather than implying that every outcome is a
correctness label.

### Absence-of-signal monitor

`OutcomeCoveragePolicyV1` specifies opaque action/segment selectors, expected
minimum sample count, maximum observation lag, maximum unresolved proportion
and a bounded window. The monitor returns `healthy`, `insufficient`, `stale` or
`unavailable`; it never synthesizes positive outcomes.

`stale` and `unavailable` freeze promotion. A caller policy may additionally
degrade supervision. Historical positive evidence cannot keep promoting after
its coverage window has expired.

## Progressive autonomy

### Scope and non-authority

`@agentplat/autonomy` controls required human supervision for a caller-provided
segment. It does not allocate work, select tools, issue grants, approve content
or execute actions. Its output can only narrow the path to an existing governed
action.

### Levels

```ts
type AutonomyLevelV1 =
  "blocked" | "propose_only" | "approve_all" | "approve_sample" | "autonomous";
```

- `blocked`: deny the protected operation.
- `propose_only`: allow creation of a proposal/artifact but deny the effect.
- `approve_all`: require a current exact human approval for every effect.
- `approve_sample`: deterministically select some effects for approval; an
  unselected effect is merely eligible for the normal action boundary.
- `autonomous`: no autonomy-specific human approval is required; every other
  authority and safety check still applies.

### Policy and segment identity

The application resolves domain state into an opaque bounded `segmentKey` and
`segmentDigest`. AgentPlat never evaluates caller functions such as
`segmentBy`. The policy binds:

- policy ID, version and digest;
- initial level and maximum level ceiling;
- exact allowed segment namespace;
- minimum concluded outcomes and minimum positive proportion per promotion;
- maximum negative, corrected and unresolved proportions;
- evidence window, maximum age and minimum coverage;
- cooldown and consecutive healthy-window count;
- deterministic sampling basis points;
- exact critical reason codes;
- immediate and ordinary degradation rules; and
- unavailability behavior.

A new segment defaults to `blocked` or `propose_only`; it can never start as
`autonomous`. Policy updates cannot widen existing state without reevaluation
under the new digest.

### State and transition

Autonomy state binds tenant, segment, action type, policy, current level,
revision, evidence cursor, consecutive healthy windows, cooldown, latest
coverage status, last critical outcome, bounded decision tail and state digest.

Promotion moves at most one level per eligible window and requires all policy
conditions. Demotion can move multiple levels immediately. One configured
critical outcome can set the policy floor in one transition. Replays are
idempotent; stale cursors, reordered evidence, policy substitution and logical
time rollback fail closed.

Sampling is deterministic over the action proposal digest, policy digest,
segment digest and sampling epoch. Retrying the same action cannot resample
until it avoids review.

### Store failure

The safe default on an unavailable autonomy store is `deny`, not
`approve_all`: requiring approval would still widen a segment whose current
level may be `blocked` or `propose_only`. A deployment may use a signed or
otherwise trusted cached decision only while its exact policy, segment, action,
level and expiry remain current. An eligible cached `approve_all` decision can
require approval; no cached decision may increase autonomy after expiry.

### PostgreSQL autonomy state

`@agentplat/autonomy-postgres` owns separate tables for immutable policy
registrations, revisioned segment state, evidence-consumption identities and an
append-only decision journal. Segment state is keyed by tenant, policy domain,
action type and segment digest; clear-text segment keys are optional diagnostic
data and can be omitted by policy. State writes compare revision, predecessor
digest, policy digest and evidence cursor in one transaction. An index exposes
segments whose evidence window or cached decision is approaching expiry.

The autonomy adapter reads outcomes through the provider-neutral evidence
window port. It does not join directly to workflow tables, so a deployment may
provide an independently authorized outcome store without changing controller
semantics.

### Action Gateway composition

`@agentplat/autonomy/actions` supplies an `AutonomySupervisionGuardV1` for the
existing governed action path:

1. resolve and validate the exact action proposal and segment;
2. obtain the current autonomy decision;
3. deny `blocked` and external execution under `propose_only`;
4. require and validate an exact Room approval when selected;
5. pass the unchanged action proposal into the existing authority, assessment,
   Action Grant and fencing path; and
6. journal the autonomy decision and final effect receipt separately.

An approval decision does not become an Action Grant. A later authority,
assessment or fence failure still denies execution.

## Boundary hygiene

Add `config/platform-boundaries.json` and
`scripts/verify-platform-boundaries.mjs` during implementation.

The verifier enforces:

- platform packages cannot import applications, examples or unpublished local
  aliases;
- adapter packages can depend inward on portable contracts, while portable
  packages cannot depend on provider adapters;
- workflows root cannot import Rooms, Temporal, PostgreSQL or vendor SDKs;
- autonomy root cannot import Rooms, workflow adapters or effect dispatchers;
- test fixtures in portable packages use configured neutral terminology; and
- a deployment can provide an additional denylist without committing customer
  vocabulary to AgentPlat.

The existing public secret and terminology audit remains in place. The new
boundary verifier complements it with dependency direction and scoped source
checks; it does not scan every documentation sentence for ambiguous words.

Provider-specific adapters may remain in the monorepo when they:

- implement a public provider-neutral port;
- keep AgentPlat state authoritative;
- do not interpret application-domain entities;
- isolate vendor dependencies and credentials; and
- pass the corresponding conformance suite.

This rule documents why a work-management projection adapter can belong while a
CRM domain model or domain workflow cannot.

## Observability and audit

Every process mutation emits a bounded event containing tenant/run/stage IDs,
revision, operation ID, outcome/reason code, execution or policy digest and
timestamps. Raw prompts, outputs, credentials and unrestricted signal payloads
are not copied into audit records.

Required operational queries include:

- runs by status and next wakeup;
- runs with expired leases or no progress after a threshold;
- pending and expired gates;
- indeterminate task effects awaiting reconciliation;
- cancellation and compensation progress;
- usage by process, task binding and opaque subject;
- outcome coverage and lag; and
- autonomy levels, promotions, degradations and evidence cursor health.

Observer failure cannot change the committed process transition. Durable audit
requirements use an outbox or transactionally appended transition journal,
not a best-effort callback.

## Limits and retention

Every definition and policy sets or inherits closed maximums for stages,
dependencies, signal bytes, retained unconsumed signals, operations, attempts,
run duration, gate duration, evidence references, outcome window, autonomy
segments and journal tail.

Compaction may remove terminal task payloads and old transition bodies only
after retaining immutable digests, totals, terminal identities, outcome
bindings, active idempotency records and the predecessor information required
for live recovery. Active, waiting, indeterminate or outcome-eligible records
cannot be compacted prematurely.

## Delivery increments

### Increment 0 — freeze contracts and evidence boundary

- accept ADR, implementation plan, threat model and acceptance checklist;
- freeze V1 terminology, digests, limits and explicit non-goals;
- add public type tests and negative definition fixtures; and
- decide the supported legacy migration window.

Exit: contracts are reviewable without Temporal, PostgreSQL or a domain app.

### Increment 1 — pure DAG and in-memory runtime

- add definition validation and canonical digests;
- implement run creation, reachability, waits, signals and terminal reduction;
- implement cancellation and compensation scheduling;
- add `ProcessRunnerV1`, common advance runtime and in-memory store/runner; and
- cover deterministic clocks, retries and conflict paths.

Exit: a complete process runs with no infrastructure import.

### Increment 2 — task integrity, usage and outcomes

- add task claims, execution bindings and reconciliation;
- add token, duration and currency-safe cost accounting;
- add opaque subject aggregation;
- add delayed outcome append, attribution, query and coverage monitor; and
- prove that missing outcomes freeze promotion inputs.

Exit: an outcome recorded weeks later resolves the exact immutable task binding.

### Increment 3 — PostgreSQL durability and conformance

- create package, migrations, CLI and repositories;
- implement CAS, operation/signal/task idempotency and leases;
- implement operational queries and retention guards;
- create `@agentplat/workflows-conformance`; and
- run the same store/runner cases against memory and PostgreSQL, including a
  distinct-process restart.

Exit: durable restart, duplicate operations and lease takeover pass.

### Increment 4 — Agent Room gates

- extend Room approval expiry semantics and events;
- implement the gate provider and operational event projector;
- preserve artifact revision/edit lineage;
- add approval, rejection, revision and expiry race tests; and
- add a Room/workflow integration example with neutral terminology.

Exit: a waiting run consumes no worker and resumes only from a valid terminal
Room decision or the explicit expiry branch.

### Increment 5 — Temporal adapter

- implement client, workflow and advance activity bindings;
- test worker restart during task execution and long waits;
- test lost/duplicate wakeups, activity retry and `continueAsNew`; and
- run conformance against a disposable Temporal service in protected CI.

Exit: a 90-day simulated process crosses history rollover while PostgreSQL
remains the only canonical state.

### Increment 6 — progressive autonomy

- implement policies, state reducer, deterministic sampling and CAS store port;
- add PostgreSQL adapter and evidence cursor journal;
- integrate Room approval evidence and the existing Action Gateway;
- cover critical demotion, stale coverage and unavailable-store behavior; and
- add operator inspection without raw domain payloads.

Exit: promotion cannot occur without current minimum evidence and no decision
can bypass ordinary action authority.

### Increment 7 — boundary enforcement and release

- add dependency/vocabulary boundary verifier;
- register all packages, exports, public type tests and packed consumers;
- update docs, examples, package map and release checks;
- run workspace build, type-check, tests, public audit and conformance; and
- publish under the prerelease tag before any stable API claim.

Exit: a clean packed consumer can exchange memory, PostgreSQL and Temporal
runners without application code importing an infrastructure SDK.

## Verification matrix

| Invariant                              |     Memory |               PostgreSQL |               Temporal |                      Rooms |                              Autonomy |
| -------------------------------------- | ---------: | -----------------------: | ---------------------: | -------------------------: | ------------------------------------: |
| definition DAG and branch validation   |        yes | retained-read validation |        same definition |                gate branch |                                   n/a |
| duplicate start/signal/cancel conflict |        yes |          unique + digest | duplicate wakeup inert | duplicate Room event inert |              duplicate evidence inert |
| restart and lease takeover             |   no claim |                 required |               required |          projector restart |                   state-store restart |
| terminal state is sticky               |        yes |                      yes |   history cannot alter |        late decision inert | action result cannot promote directly |
| expiry never approves                  |        yes |                      yes |   timer is wakeup only |  required adversarial case |            approval evidence required |
| external exactly-once limitation       | documented |   indeterminate retained |    retry-safe identity |                        n/a |                gateway still required |
| delayed outcome exact binding          |        yes |                 required |                    n/a |          edit lineage refs |                       evidence cursor |
| missing outcomes freeze promotion      |    monitor |          monitor restart |                    n/a |                        n/a |                              required |
| critical degradation is immediate      |        n/a |                      n/a |                    n/a |   optional evidence source |                              required |
| unavailable control fails closed       |        n/a |             store errors |        activity errors |              bridge errors |               deny/cached-narrow only |

## Explicit non-goals

V1 does not provide:

- a general-purpose durable scheduler or workflow language;
- reconstruction of canonical state from Temporal history;
- exactly-once external effects without downstream atomic support;
- automatic reversal of committed effects;
- a universal outcome taxonomy, quality score or definition of accuracy;
- a model-generated autonomy policy or automatic segment discovery;
- a global reputation or autonomy level shared across tenants;
- execution authority from an outcome, score, approval projection or transport;
- atomic transactions across independently configured Room and workflow stores;
- production-scale latency, availability or long-duration validation from unit
  and conformance tests; or
- application-domain entities, connectors or business rules.

## Completion definition

The capability is implemented only when every item in the acceptance checklist
is evidenced by source and tests, public packages pass packed-consumer checks,
and documentation continues to separate source/conformance behavior from
deployment and empirical claims.
