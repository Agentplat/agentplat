# Standalone governed external actions

**Status:** additive, opt-in source profile; qualification passed in an isolated
checkout on 2026-09-30. Introduced by the coordinated 1.2.0 release; consult the release record for
publication status ([verified distribution](../releases/stable1-2-distribution-20260930.md)). Operational obligations and release
steps remain explicit; no production-scale or universal external guarantee is claimed.

This profile supports hosts such as The Agent Control without requiring Agent Rooms.
Existing ActionGateway, grants, authority/assessment resolvers and dispatchers retain
execution ownership. Existing entry points/default behavior, historical rows and
migration bytes remain unchanged.

## Public surfaces

| Entry point | Responsibility |
| --- | --- |
| `@agentplat/inference-control/tools` | Existing gateway/repositories; additive typed grant preparation and conservative recovery of interrupted reservations |
| `@agentplat/inference-control/action-approvals` | Exact reviewed targets, authenticated independent decisions, persistent monotonic lifecycle and a narrowing assessment resolver |
| `@agentplat/inference-control/action-admission` | Atomic revocation fences, shared resource accounts, effect receipts and verified reconciliation |
| `@agentplat/inference-control/action-effects` | Explicit atomic conditional-write and idempotent receipt contract |
| `@agentplat/collective-control-postgres/action-approvals` | Tenant-scoped durable approval store and separately invoked migration |
| `@agentplat/collective-control-postgres/action-admission` | Transactional admission store and separately invoked migration |

Read [integration.md](integration.md) for composition, trusted ports, migration and
recovery instructions. [release-plan.md](release-plan.md) defines coordinated delivery
and publication. [qualification.md](qualification.md) maps requirements to evidence.

## Guarantees and boundaries

Approval targets bind input, full action binding, trusted preconditions, policy and
revocation versions. Decisions require an authenticated authorized independent person.
Approval does not grant authority or override base denial. Changed facts invalidate;
unavailable facts deny. Expiry/invalidation cannot be undone by a restart or old clock.
One approval cannot authorize multiple logical effects.

Admission atomically verifies active agent/connector/organization epochs and required
approval evidence, then reserves all configured charges or none. Account IDs include
scope and immutable period, with safe-integer units and revisioned limits. Policy
changes/reactivation do not reset consumption. A trusted host selects every applicable
account and quotes an upper bound that the adapter must enforce.

Admission is the linearization point: suspension/invalidation committed first blocks;
admission committed first may finish. The external destination must apply approved
resource preconditions atomically with its write to close the read/write race.
Capabilities are host-attested integration contracts, requiring adapter conformance.
Unsupported destinations must display a weaker profile; no universal interception,
rollback, cancellation or exactly-once promise exists.

Effects begin indeterminate before dispatch. Unknown outcomes retain reservations and
never automatically retry/refund. Terminal not_applied proof refunds once; succeeded
retains cost. A temporary lookup miss is insufficient. Interrupted reserved grants
require proof the original worker stopped or was fenced before conservative recovery.
Recovery never reissues authority. Grant and effect reconciliation are separate
idempotent durable operations, still allowed while suspended.

## Reproduce qualification

Use a disposable PostgreSQL database with schema-creation privileges. Tests only
create/drop isolated UUID-named schemas; no production migration or deployment runs.

```sh
pnpm install --frozen-lockfile
AGENTPLAT_POSTGRES_TEST=1 PGHOST=127.0.0.1 PGDATABASE=postgres \
  pnpm run verify:action-control
```

The focused gate refuses missing database enablement, builds the workspace, checks
public types, requires zero failed/skipped/TODO/cancelled scenarios and runs independent
prepared-tarball consumption. Set connection/authentication for your local database;
connection strings are not written into qualification metadata.

Broader validation separately covers full type checks, unit/adapter suites, public
surface, platform/specification and stable compatibility. Skips/TODOs are reported,
not passed evidence. CI release gates still apply before publication.

## Host obligations

- Verified identity, role checks, policy evaluation, server clock and exact payload
  storage/display; no client tenant IDs, costs or claimed approvers as authority.
- Durable grant-to-approval mapping, trusted facts/quotes and all required accounts;
  required approval references cannot be omitted from admission.
- Adapter-owned idempotency/fencing, conditional writes and terminal receipts;
  actual consumption cannot exceed quotes.
- Credentials, redaction/retention, backups, scheduling, diagnostics and recovery.
- Deployment capacity verification. The reference admission adapter serializes by
  tenant and retains full receipt history; throughput/compaction/partitioning require
  separate operational qualification preserving accounting and idempotency evidence.

Record digests detect accidental corruption, not a malicious infrastructure admin.
MCP routing, UI, business policies, connectors, licensing and commercial portal remain
exclusively owned by The Agent Control. Its npm dependency update follows actual
coordinated publication, not the presence of these source files.
