# Persisted agent governance (source preview)

Configuration is created suspended. Objective 6 adds owner-only preparation and
activation for admitted agents. Objective 7 adds the qualified
[purpose mission profile](missions.md); generic purpose execution remains blocked.
Existing unbound instruction execution is unchanged. See the
[execution profile](execution.md) for adapter admission, limits and effect controls.

## Construct the service

`AgentGovernanceServiceV1` consumes an `AgentGovernanceStoreV1`, an independently
verified `AgentGovernanceAccessV1<Context>`, the existing Agent Definition Registry
an optional clock and an optional activation port. Use `InMemoryAgentGovernanceStoreV1` for ephemeral testing
or `PostgresAgentGovernanceStoreV1` from `@agentplat/rooms-postgres` for persistence.
Apply the current migrations (through 018) before using staged activation.

```ts
const governance = new AgentGovernanceServiceV1(
  store,
  {
    authenticate: async (request: Request) => identityProvider.verify(request),
    authorize: async (principal, operation) => policy.authorize(principal, operation),
  },
  definitions,
);

const head = await governance.execute(authenticatedRequest, {
  agentId: "retention-agent",
  operationId: "enroll-retention-v1",
  expectedRevision: null,
  command: {
    kind: "create",
    governanceId: "retention-governance-v1",
    ownerId: "company-owner",
    purpose: "Improve customer lifetime value within the approved limits",
    definitionRevisionId: publishedCandidateRevisionId,
  },
});
// head.status === "suspended"; head.revision === 0
```

The application supplies `identityProvider` and `policy`; they are not library
exports. Authentication returns `{ tenantId, subjectId }` only after verifying
credentials. Neither request-body IDs nor the development tenant header prove
identity. The authorizer must explicitly permit creation and assignment to the
requested initial owner. Governance then enforces owner/delegate restrictions
in addition to that host policy. Missing/failed authentication or authorization
denies access. Read/history access also requires host authorization.

## Mutations and ownership

Commands are closed, validated objects. Every request has an operation ID and
expected head revision. Exact retries return the recorded result; altered reuse
conflicts. Successful mutation increments revision and authority epoch together.
Clock rollback is rejected. Returned objects cannot mutate stored state.

| Command | Authority / behavior |
| --- | --- |
| `create` | Host-authorized owner assignment; requires a published definition of the same tenant and agent, and matching purpose governance ID. |
| `purpose` | Current owner only. |
| `mode` | Current owner selects a published definition revision; limits are retained and the configuration stays suspended. |
| `signals`, `references`, `limits` | Owner or an unexpired delegate for that operation; stores opaque refs for later domain resolution. |
| `delegations` | Owner replaces the scoped delegation list; removal revokes immediately. Only signals/references/limits/missions/suspend/delegate can be delegated. |
| `suspend` | Owner or suspension delegate records suspended status and advances epoch. The opted-in execution profile fences new work/effects. |
| `prepare_activation` | Owner only; fences work and persists a recoverable transition. |
| `activate` | Owner only; requires successful host admission; purpose mode additionally requires the qualified mission composition. |
| `transfer_start` | Owner proposes a target and canonical ISO expiry. |
| `transfer_accept` | The target authenticates independently and accepts the exact offer at the current revision before expiry. Changes owner, clears all delegates, remains suspended. |
| `transfer_cancel` | Current owner cancels the exact offer. |

Delegations are scoped to the containing tenant/agent and have explicit expiry.
Mission delegates are consumed by the qualified mission service; the configuration
API itself does not issue missions. Platform limits remain outside these editable
agent references. Signal/reference validation and limit enforcement are supplied
by their respective services.

Any intervening mutation cancels an outstanding transfer offer, requiring fresh
consent. Expired offers cannot be accepted and never change ownership. There is
no lost-owner recovery, cross-tenant transfer or implicit resume operation.
An exact replay can return a historical snapshot; use `get` for the current head.

## Persistence and history

The head and immutable operation-result snapshot commit atomically. Each snapshot
contains the complete configuration, its digest, revision/epoch, verified actor
and timestamp (on `result.updatedAt`). These append-only snapshots are the V1
configuration revisions and audit journal; there is no second authoritative
configuration table. `history(context, agentId, afterRevision, limit)` pages in
revision order (default 100, maximum 1000). A future projector can consume this
journal with a durable cursor; no external event delivery is claimed yet.

The memory adapter and PostgreSQL adapter implement identical CAS/replay behavior.
PostgreSQL migration 013 adds heads and operations, tenant/agent keys, unique
operation/revision constraints and update/delete protection for history. Runtime
DB credentials and authorization ports are trusted deployment boundaries.

## HTTP integration

Opt in with `createRoomsApp({ service, agentGovernance: governance })`, where
`governance` authenticates a raw `Request` independently of ordinary Room auth.
The existing app authentication middleware also applies; the governance principal
is authoritative for governance tenant scope, even if a development tenant header
names another tenant.

- `POST /agents/:agentId/governance/operations`: operation ID, expected revision
  and command; agent ID comes from the route. Unknown body fields are rejected.
- `GET /agents/:agentId/governance`: current configuration.
- `GET /agents/:agentId/governance/history?afterRevision=-1&limit=100`: audit history.

These endpoints are separate from messages and inceptions. They do not change
agent definition publication or grant remote execution authority.

## Verified evidence

Shared scenarios run against memory and an isolated PostgreSQL 16 instance:
authentication rejection, tenant isolation, ownership/delegation enforcement,
expiry, concurrent CAS, exact retries, immutable snapshots and two-party transfer.
PostgreSQL tests additionally reopen the pool, reject history mutations, verify
head rollback on journal conflict, and exercise migration rollback/reapply.
HTTP tests verify independent credentials and reject spoofed ownership/body scope.
See the [implementation plan](implementation-plan.md) for remaining work.
