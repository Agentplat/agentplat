# Integrating standalone governed actions

The optional source additions are not yet on npm. Install a coordinated published
version when available. No Agent Rooms, Agent Mesh or remote ACL service is required.

## Composition and owners

```text
Authenticated host -> grant repository -> ActionGateway
                    approval assessment ->    |
                                       admission dispatcher
                                              |
                                       conditional dispatcher
                                              |
                                        external executor
```

The host owns verified identity, policy, approver roles, exact request storage/display,
clocks, trusted resource facts and selection of ALL applicable budget accounts.
AgentPlat owns the linkage to a logical effect, currentness, reservations and receipts.

Use the existing PostgresActionGrantRepositoryV1 and existing collective migration
runner for durable grants. Explicitly invoke runActionApprovalMigrationsV1 and
runActionAdmissionMigrationsV1 for the optional stores. Imports/upgrades never invoke
migrations. Old rows and migration bytes remain unchanged. Use one intended tenant
and schema across these stores; missing required storage must deny, not use memory.

## Request and approval

Authenticate the requesting agent in the host, normalize and retain its exact payload,
and read trusted policy/resource facts. createActionApprovalTargetV1 binds input,
complete action binding, resource preconditions and authority/policy versions.

For required review, ActionApprovalServiceV1.request/decide consume authenticated
context. Show the exact retained request in the UI. A purpose, explanation, signal
or claimed actor cannot grant permission. Reevaluation of current policy remains
required: human approval cannot override a hard denial.

Use createActionGrantV1 with the reviewed target digest as assessmentTargetDigest,
then issueActionGrantV1 through the existing repository. Persist the exact grant-to-
approval mapping. The approval assessment resolver narrows the base resolver and
reloads trusted current facts. Changed targets invalidate; unavailable facts deny.

All timestamps come from the host clock. Expired/invalidated decisions never revive;
a changed target requires new reviewed identity. Do not forward agent-supplied times.

## Admission and effect

Configure three active revocation fences (agent, connector, organization) through
trusted administrative operations. Epoch changes invalidate old work. Configure
budgets with explicit safe-integer units, immutable period boundaries, revisions
and stable account IDs that include scope/period. Renewal creates a new account ID;
changes do not reset consumption. Calendar/timezone/rolling policy belongs to the host.

The trusted quote includes all applicable accounts, upper-bound charges, actual
fences and a stable logical effect ID. Adapters must not exceed quoted consumption;
reject operations whose maximum cannot be bounded. Agent-supplied cost is not a fact.

createActionAdmissionDispatcherV1 wraps the existing dispatcher after gateway checks.
Include the persisted approval reference when policy requires one; null is only for
explicitly authorized unreviewed actions. Admission locks approval evidence alongside
fences/budgets. Missing schema or port cannot disable a required check.

For destinations supporting atomic conditional writes AND idempotent terminal receipts,
use createConditionalActionDispatcherV1 as the downstream dispatcher. Resolve the
immutable reviewed constraints, not a permissive fresh baseline. Its execution port
must check conditions and perform the effect atomically at the destination. Receipts
correlate idempotency key, action/input/precondition digests and terminal outcome.
Pin executor identity/version/capability profile in the binding handler digest.
Declarations are contracts; conformance tests must verify the actual adapter.

A destination without conditional writes cannot support the strict precondition
profile. Expose weaker integrations with their race boundary explicitly identified.
Read-before-write alone is insufficient. There is no universal cancellation,
rollback or exactly-once promise for arbitrary external services.

## Recovery

Admission committed first may finish after suspension; suspension committed first
denies. Unknown effects retain all budget holds and never automatically retry/refund.
ActionAdmissionServiceV1.reconcile requires an authoritative receipt bound to the
request digest. not_applied must prove the original attempt cannot later apply;
lookup misses are insufficient. Concurrent refunds happen once.

If a process terminated with a grant still reserved, recoverReservedActionGrantV1
requires the host to prove its original worker stopped or was fenced. It transitions
to indeterminate, never issued. Reconcile the effect receipt and existing grant via
reconcileActionGrantV1 with original reservation/attempt identity. A crash between
those two durable boundaries is handled by repeating reconciliation, not dispatch.
Facts can be reconciled while suspended without restoring execution authority.

## Operations and evidence

The initial admission store serializes by tenant and retains all receipts: a bounded
correctness reference, not production-scale throughput evidence. Compaction/partitioning
must preserve accounting and idempotency receipts. Record digests detect corruption,
not a malicious administrator. Credentials, redaction, scheduling, backup, connectors,
MCP integration and user-facing review workflows remain host responsibilities.

See README.md for verification and release-plan.md for coordinated delivery. Source
qualification and prepared tarballs do not constitute an npm release.
