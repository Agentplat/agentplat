# Agent Rooms

For direct model adapters, the high-level framework facade and HTTP streaming
helpers, see [portable model execution](./portable-execution.md). Those layers
compose with Rooms but do not replace Room persistence, policy or approvals.

An Agent Room is a tenant-scoped workspace in which humans and agents collaborate toward a goal. It keeps the transcript, structured handoffs, runs, artifacts, approvals, policy decisions, memory provenance and audit events together so applications can expose one coherent unit of work.

The public framework is self-contained: a company can clone this repository, run the reference API and then replace adapters without depending on any service operated by AgentPlat.

## Public components

| Package                                                             | Responsibility                                                                                                                              |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@agentplat/rooms`](../packages/rooms/README.md)                   | Domain models, `RoomService`, lifecycle rules, policy and context builders, repository interfaces and a test-oriented in-memory repository. |
| [`@agentplat/rooms-postgres`](../packages/rooms-postgres/README.md) | Production persistence, migrations, tenant-qualified relationships and state/event transactions.                                            |
| [`@agentplat/rooms-api`](../packages/rooms-api/README.md)           | Transport-only Hono application built around an injected Room service and authenticator.                                                    |
| [`@agentplat/runtime-mock`](../packages/runtime-mock/README.md)     | Deterministic provider that turns task context into a draft artifact without a model or network call.                                       |

The Room service also composes the existing runtime, event, tool, MCP and memory contracts. Applications can use the included local adapters or supply their own implementations.

Optional message routing resolves explicit participant references first, then
an injected provider-neutral router, then a declared default participant. The
router can select only from eligible agent participants and never grants task,
tool or effect authority. Applications may use `AgentRoomCoordinator` to bind
this routing decision to a persisted message in an active Agent Room.

For long-running work, the optional `RoomExecutionCoordinator` binds a
revisioned execution session to one active `RoomRun`. Human participants can
request idempotent interventions that an execution adapter later applies or
rejects at its supported checkpoints. Compare-and-set revisions prevent lost
updates, while predecessor-bound recovery preserves the original Room task.

The provider-neutral intervention dispatcher claims pending work under a
bounded lease and delivers it only at the requested Runtime checkpoint.
Delivery through the cognitive Runtime binds the operation to current session,
authority and role revisions; conflicting workers fail the execution-session
CAS. REST event reads and an optional versioned SSE stream expose the durable
transition history to applications.

The optional agent-definition registry separates stable agent identity from
immutable content-addressed revisions and a revision-checked lifecycle. An
execution session configured with the registry accepts only a published
revision whose agent identity and Runtime profile match the assigned Room
participant, then preserves the exact revision ID and digest for replay.

AgentPlat Handoff provides a bounded, attributable transfer between Room agent
participants. It binds source and target runs, exact agent revisions,
Room-scoped context references and a non-expanding authority ceiling. Explicit
target acceptance, revision fencing, depth/cycle guards and predecessor-bound
recovery keep delegation separate from unrestricted conversation forwarding.

The optional coordination runtime connects persisted messages and accepted
Handoffs to application execution through a revisioned inbox. Stable operation
IDs, bounded leases and CAS fencing support retry and restart recovery without
making a workflow engine part of the Agent Room domain.

The default coordination execution adapter turns stable coordination
operations into deterministic Room tasks and policy-checked runs. It fixes the
published agent revision, opens the execution session after durable run claim
but before provider dispatch, and reconciles execution and Handoff state when
the run terminates.

## Run the reference platform

The [`examples/rooms-api`](../examples/rooms-api/README.md) application wires PostgreSQL, `RoomService`, the Hono API, an in-process event bus and the mock runtime. Docker Compose runs the migration before accepting API traffic.

```sh
cd examples/rooms-api
cp .env.example .env
docker compose up --build -d
curl --fail http://localhost:3000/health
bash scripts/demo.sh
```

The demo creates a Room, pauses and resumes it, adds a human and an agent, records a message, runs a structured task, produces a draft artifact, grants human approval, then completes and archives the Room. It prints the final aggregate projection.

To stop the platform, run `docker compose down`. Add `--volumes` only when you also want to delete local PostgreSQL data.

## Tenancy and trust boundary

Every domain and repository operation is scoped by `tenantId`. PostgreSQL relationships use tenant-qualified foreign keys, and the Room API ignores tenant identifiers supplied in request bodies or query parameters.

The reference API resolves tenancy from this header:

```http
X-Agentplat-Tenant-Id: acme
```

That header assumes a trusted caller and is intended for local development or a protected self-hosted boundary. It does not authenticate a user. Before exposing the API to an untrusted network, pass an `auth` implementation to `createRoomsApp` that validates the request with your identity provider and returns a verified `TenantContext`.

## Lifecycle and safeguards

- Rooms follow `active → paused → active → completed → archived`; invalid transitions fail and archived Rooms are read-only.
- Subrooms belong to the same tenant and retain their parent relationship. A parent Room cannot transition to `completed` until every direct subroom is `completed` or `archived`.
- Executable tasks must resolve to an agent participant. Humans can contribute messages, review work and grant approvals, but cannot be selected as a task execution target.
- Artifact versions and audit events are append-only. PostgreSQL commits domain changes and their events in the same transaction, then events can be published after commit.
- Task context is bounded and records provenance for selected messages, artifacts and memory.
- The default policy permits low-risk local/mock work. External writes, non-local runtimes and unapproved tools require an explicit allow policy.
- The mock runtime is deterministic and performs no model or external network calls.

## Replace adapters

Checkpoint-aware Room execution intercepts `pre_step`, `post_output` and
provider-enforced `pre_action` boundaries. Durable human interventions are
applied through the execution session before continuation. Protected tasks
can be configured to fail before provider invocation when the provider cannot
enforce `pre_action`; the opt-in preserves existing release-line defaults.

Human contribution requests represent durable human work rather than
authorization. They support assignment, dependencies, deadlines, structured
results and Room artifact references. Completion can requeue coordination that
was waiting for human input; external work-management systems remain optional
projections behind provider-neutral adapters.

The delivery runtime provides a durable external projection with stable
idempotency keys, lookup-based crash reconciliation, leases, backoff and queue
metrics. External completion never grants authority or completes the AgentPlat
human contribution automatically.

Versioned knowledge bundles provide content-addressed, tenant-scoped documents
bound to published agent revisions. Standard Room tool bridges expose only
authorized bundle references and persist memory/artifact outputs through the
existing Agent Room domain with provenance.

The unified live view exposes coordination, active runs, execution sessions,
Handoffs, human contributions, deliveries and events through a composite
cursor and optional SSE. Coordination failures are durable, categorized,
redacted and retried only when their category and attempt budget permit it.

Typed plans materialize agent tasks, human contributions, approvals and
Handoffs with deterministic identities and predecessor-bound replanning.
Materialization is progressive: a step is created only after every declared
dependency reaches `completed`, and Room events reconcile step and terminal
plan status before unlocking the next steps.
Revisioned participant membership controls routing, Handoff acceptance and
allowed agent revisions without rewriting historical Room participation.

The cross-package authority and persistence boundaries are recorded in
[ADR 0043](./adr/0043-agent-room-operational-coordination-boundaries.md).
Applications upgrading an existing PostgreSQL deployment should follow the
[V1–V11 migration guide](./agent-rooms-postgres-migration.md).

The reference assembly in [`examples/rooms-api/src/index.mjs`](../examples/rooms-api/src/index.mjs) is deliberately explicit. A downstream platform can:

- implement `RoomRepository` to use another database while preserving tenant isolation and transaction semantics;
- register an OpenAI, LangGraph or custom provider with `DefaultAgentRuntime` instead of `MockAgentProvider`;
- inject an authenticated tenant resolver into `createRoomsApp`, or mount the domain service behind another transport;
- replace the in-process event bus with Kafka, NATS or another publisher while retaining durable database events;
- register custom tool and MCP adapters, and provide application-specific memory retrieval;
- extend presentation, workflows and product behavior without modifying the Room domain.

Keep adapters responsible for infrastructure concerns. Tenant checks, lifecycle invariants, context assembly, policies, approval state and domain events belong in `RoomService` so every transport behaves consistently.

## Open-source boundary

The Apache-2.0 repository includes the complete self-hosted Room domain, API, PostgreSQL adapter, mock runtime and extension contracts. It never imports private AgentPlat components. Any adopting application can consume the same public interfaces.

Enterprise SSO/SAML/SCIM, advanced RBAC, organization-wide governance, connectors, billing, fleet operations and analytics are deployment and application concerns outside the public framework. Trademark use is governed separately by [`TRADEMARKS.md`](../TRADEMARKS.md).
