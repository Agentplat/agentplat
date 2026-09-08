# A2A and Agent Registry integration

AgentPlat can discover and invoke external A2A agents and publish individual
agents or Room-backed team services. This is an opt-in developer-preview
integration, using A2A 1.0 JSON-RPC and official JavaScript SDK 1.1.0.

## Packages and initial setup

- `@agentplat/agent-registry`: portable descriptors, authorization port, CAS
  repository, query/match reasons and memory implementation.
- `@agentplat/agent-registry-postgres`: persistent registry and migration ledger.
- `@agentplat/a2a`: discovery, controlled HTTP fetch, client/server and task state.
- Subpaths `@agentplat/a2a/rooms`, `/mesh`, `/morphogenesis`, `/postgres`:
  domain bridges and persistent A2A state. PostgreSQL is not imported by the root.

```ts
import { AgentRegistry } from '@agentplat/agent-registry';
import { PostgresAgentRegistryStore, runMigrations as migrateRegistry }
  from '@agentplat/agent-registry-postgres';
import { PostgresA2AStateStore, runMigrations as migrateA2A }
  from '@agentplat/a2a/postgres';

await migrateRegistry(pool, { schema: 'agents', createSchema: true });
await migrateA2A(pool, { schema: 'agents' });
const registry = new AgentRegistry(
  new PostgresAgentRegistryStore(pool, 'agents'),
  { authorize: async (principal, operation) => policy.allows(principal, operation) },
);
const state = new PostgresA2AStateStore(pool, 'agents');
```

`pool`, `policy` and the verified principal are application-owned dependencies.
Use memory stores only for tests or single-process ephemeral examples. Both
migration modules expose status inspection and destructive-down SQL through the
existing migration contracts; this integration never runs a rollback implicitly.

## Register and find agents

`publish(principal, draft, expectedRevision)` registers a new entry with a null
expected revision, or updates the exact existing revision. `withdraw` advances
that revision and removes execution eligibility. `search` accepts required
capabilities, input/output media types, controls, an exclusive cursor and a page
limit (default 50, maximum 200). Each page returns candidates with match/exclusion
reasons, including withdrawal, expiry, missing capabilities and pending admission.
It does not rank by LLM judgment or grant execution authority. Iterate
`nextCursor` to complete a catalog search.

`describePublishedRoomAgent` reads the existing published definition resolver and
projects capabilities plus the exact agent/revision/digest. It omits private
instructions and runtime profiles. A local reference must still be resolved at
execution time so a deprecated definition cannot execute based on a stale card.

`discoverA2AAgent` fetches a configured card URL and maps only administrator-supplied
skill IDs to canonical capabilities. It returns an **unverified, pending,
availability-unknown** draft. Verification and admission require the application's
administrative workflow. Formats are the intersection of the mapped skills' modes;
a card advertising multiple skills must not widen eligibility accidentally.
A2A descriptors advertise no AgentPlat checkpoint/restore/intervention controls.

The registry rejects undeclared fields. Store credentials in the host's credential
provider, not descriptors, cards, provenance, URL query parameters or artifacts.

## Invoke and reconcile

Construct `A2AClient` with the verified principal, registry, state store, network
policy and mandatory `authorize` callback. Call `send` for an acknowledged task
or immediate message, or consume `sendStream`. Inputs bind an operation ID,
message ID, exact entry revision, capability requirements and local Room/run/work
references. The execution gate must reapply the existing Room or Work controls.

Save the operation ID. `get` reads its persisted outcome; `reconcile` queries a
known remote task; `watch` queries first and then subscribes; `cancel` requests
remote cancellation. Continue an `input_required` or `auth_required` task using a
new operation/message ID and `previousOperationId`. Authentication credentials
remain out of band. The previous task/context correlation is resolved from the
store rather than supplied arbitrarily by a remote caller.

A pending/uncertain duplicate does not resend. If the remote task ID is unknown,
reconciliation reports that persisted state; an operator must investigate the
remote effect before issuing replacement work. A changed card digest requires a
new reviewed registry revision. Known-task reconciliation uses the pinned card,
so retiring a registry entry does not erase the ability to cancel issued work.

Network policy runs before credentials are attached, for every card/RPC/artifact
request. HTTPS is required, redirects are rejected, response size is bounded
(default 10 MiB) and requests time out (default 30 seconds). The host must enforce
DNS resolution and connection-level egress policy through its supplied fetch or
network infrastructure. `fetchA2AArtifact` is an explicit, separately authorized
operation: importing a result never follows artifact URLs.

## Publish agents and Room services

Mount `A2AServer.handle(Request)` on a dedicated endpoint and the configured
Agent Card URL, conventionally `/.well-known/agent-card.json`. Hosts may route
multiple services to separate configured paths/origins. All requests, including
card reads, require authentication. POST requests require `A2A-Version: 1.0`;
wire tenant values must match the authenticated tenant. Tasks are scoped to the
subject as well as the tenant and service.

`A2AService` supplies descriptive skills, explicit formats, `authorize`, `bind`,
`execute`, `cancel` and `reconcile`. `bind` resolves the local context and run using
the provided deterministic operation ID. It must be idempotent. `execute` is an
async iterator yielding task snapshots (artifact arrays replace prior arrays).
A final or input/auth-required state ends that iteration. An asynchronous owner
may leave a working task and update it through reconciliation. `cancel` returns
true only once the execution owner confirms cancellation. `reconcile` reads
existing work and never creates another run.

`createRoomA2AServer` verifies a writable tenant-scoped Room before execution.
For an individual agent, it additionally requires an exact published definition
revision. For a team service, the host's bind policy resolves/creates the Room
and coordinates its team through the normal Room runtime. Neither service lists
private Rooms in the Agent Card.

The endpoint limits input to 1 MiB by default. Hosts provide request quotas,
audit logging through the execution owners and `onError`, retention policy and
TLS termination. Long-lived external control cannot be inferred from A2A state.

## Domain bridges

`RoomA2ABridge.propose` records discovery candidates as a draft participation
proposal. `delegate` checks the explicit Room binding and authorizes dispatch.
`importResult` reads the client's scoped persisted outcome and writes ordinary
messages/draft artifacts with provenance. Deterministic IDs and content digests
support retry after a committed timeout. RoomService remains the persistence and
policy boundary; no task, approval or Room completion is performed.

`createMeshA2AAuthorizer` consumes current admission, discovery, assignment,
lease and fencing projections from an application-owned reader. Sends require a
live local admission, matching identity and active assignment/lease. Read/cancel
can reconcile issued work after expiry, subject to application policy. The local
adapter's identity is separate from the external registry identity; never turn a
card into a signed Mesh envelope or fabricate admission from discovery.

`selectMorphogenesisRegistryCandidates` feeds candidates into existing Capability
State Fusion and returns content-bound local adapter candidates. Incomplete pages
are identified separately from an uncovered need. `proposeRegistryMorphogenesis`
uses an application compiler to construct the existing canonical need/target and
proposal. The need must include `selectionDigest`; the proposal must belong to
the authenticated mission and contain recruitment operations only. Persisted
outputs remain advisory; later decisions must revalidate revisions and owners.

`createRegistryMorphogenesisDiscovery` implements the existing
`MorphogenesisCandidateDiscoveryPortV1`. It binds scope and declared view, obtains
lineage/current membership through the host evaluator and preserves the existing
candidate result validator. A truncated catalog page yields an incomplete view,
not a claim that no agent exists. Configure the existing Morphogenesis policy to
disable Agent Genesis when using the search-and-propose-only profile.

## Verification and evidence

```sh
pnpm test:a2a
pnpm example:a2a
pnpm verify:a2a-consumer
```

Tests exercise official SDK client/server JSON-RPC/SSE interoperability,
authentication, tenant/subject scope, duplicate/conflicting sends, uncertain
outcomes, continuation, cancellation, registry fences, Room draft preservation,
Mesh fences and canonical Morphogenesis proposals.

The PostgreSQL suite uses an isolated temporary cluster when local PostgreSQL
binaries are available. Set `AGENTPLAT_TEST_PG_BIN` to their directory, or
`AGENTPLAT_A2A_TEST_DATABASE_URL` to a test database where a temporary schema can
be created and dropped. Without either, that integration test is explicitly
skipped; SQL contract tests still run.

This evidence is integration/conformance evidence, not a production-scale
qualification or a change to the frozen Collective Capability Baseline V1.
See [ADR 0053](../adr/0053-a2a-agent-registry.md).
