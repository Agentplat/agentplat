# Agent Rooms

For direct model adapters, the high-level framework facade and HTTP streaming
helpers, see [portable model execution](./portable-execution.md). Those layers
compose with Rooms but do not replace Room persistence, policy or approvals.

An Agent Room is a tenant-scoped workspace in which humans and agents collaborate toward a goal. It keeps the transcript, structured handoffs, runs, artifacts, approvals, policy decisions, memory provenance and audit events together so applications can expose one coherent unit of work.

The public framework is self-contained: a company can clone this repository, run the reference API and then replace adapters without depending on AgentPlat Cloud.

## Public components

| Package                                                             | Responsibility                                                                                                                              |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@agentplat/rooms`](../packages/rooms/README.md)                   | Domain models, `RoomService`, lifecycle rules, policy and context builders, repository interfaces and a test-oriented in-memory repository. |
| [`@agentplat/rooms-postgres`](../packages/rooms-postgres/README.md) | Production persistence, migrations, tenant-qualified relationships and state/event transactions.                                            |
| [`@agentplat/rooms-api`](../packages/rooms-api/README.md)           | Transport-only Hono application built around an injected Room service and authenticator.                                                    |
| [`@agentplat/runtime-mock`](../packages/runtime-mock/README.md)     | Deterministic provider that turns task context into a draft artifact without a model or network call.                                       |

The Room service also composes the existing runtime, event, tool, MCP and memory contracts. Applications can use the included local adapters or supply their own implementations.

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

The reference assembly in [`examples/rooms-api/src/index.mjs`](../examples/rooms-api/src/index.mjs) is deliberately explicit. A downstream platform can:

- implement `RoomRepository` to use another database while preserving tenant isolation and transaction semantics;
- register an OpenAI, LangGraph or custom provider with `DefaultAgentRuntime` instead of `MockAgentProvider`;
- inject an authenticated tenant resolver into `createRoomsApp`, or mount the domain service behind another transport;
- replace the in-process event bus with Kafka, NATS or another publisher while retaining durable database events;
- register custom tool and MCP adapters, and provide application-specific memory retrieval;
- extend presentation, workflows and product behavior without modifying the Room domain.

Keep adapters responsible for infrastructure concerns. Tenant checks, lifecycle invariants, context assembly, policies, approval state and domain events belong in `RoomService` so every transport behaves consistently.

## Open-core boundary

The Apache-2.0 repository includes the complete self-hosted Room domain, API, PostgreSQL adapter, mock runtime and extension contracts. It never imports private AgentPlat components, and AgentPlat Cloud can consume the same public interfaces as any other downstream application.

Managed hosting, enterprise SSO/SAML/SCIM, advanced RBAC and organization-wide governance, private or premium connectors, billing, fleet operations and advanced analytics are outside the public framework. Trademark use is governed separately by [`TRADEMARKS.md`](../TRADEMARKS.md).
