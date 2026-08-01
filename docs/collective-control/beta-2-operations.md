# Governed collective runtime Beta 2 operations

This guide covers the opt-in PostgreSQL adapter. The portable runtime and its
in-memory references do not require PostgreSQL.

## Expand

1. Back up the target database and record the restore procedure.
2. Create a caller-owned `pg.Pool` with least-privilege application
   credentials.
3. Run `runMigrations(pool, { schema, createSchema })` explicitly from a
   deployment job. Import and repository construction never migrate.
4. Confirm `getMigrationStatus` reports current and available version `1`, no
   pending versions, and a matching checksum ledger.
5. Initialize one authority and execution repository per exact
   `tenantId`/`policyDomainId`; initialize each Action Grant repository per
   `tenantId`/`gatewayId`.
6. Start application workers only after migration and initialization succeed.

Migration 1 only creates `collective_*` tables and indexes in the selected
schema. It does not alter Mesh Beta 1 tables, protocol bytes or snapshots.
Caller-owned pools are never closed by the adapter.

## Recovery invariants

- Authority and execution writes use generation plus state-digest CAS. A stale
  worker cannot commit its mirror rows.
- Logical-time high-water marks cannot decrease.
- Action Grant creation is exact-idempotent; a reused key with a different
  action digest is a conflict.
- A response lost after commit is retried with the same identifiers. The
  repository returns the exact durable record instead of repeating the effect.
- `indeterminate` reservations remain charged until explicit downstream proof
  reconciles them.
- Evidence appends lock one scope anchor and verify the previous digest. A
  required evidence failure must prevent dispatch at the portable adapter.

The integration test injects rollback before authority mirror commit, response
loss after Action Grant commit, evidence insert failure, concurrent authority
CAS, concurrent grant creation, cross-tenant reads and chain-prefix retention.
It runs only in an isolated random schema and removes that schema afterward.

## Retention

Run `verifyCollectiveEvidenceChainV1` before export or pruning. Prefix pruning
with `pruneCollectiveEvidenceBeforeV1` is refused while governed work, permits,
grants or indeterminate outcomes remain. The durable anchor retains the digest
immediately preceding the kept suffix, so deletion or reorder within the
retained chain remains detectable.

## Contracting back to Beta 1

1. Stop new governed admission and permit issuance.
2. Revoke or complete active Work Contracts.
3. Reconcile every reserved or indeterminate effect from authoritative
   downstream evidence; never auto-release it.
4. Verify `getCollectiveRollbackReadinessV1(...).ready === true` for every
   tenant/domain/gateway scope.
5. Export evidence anchors and verify an external backup.
6. A Beta 1 application may run while additive `collective_*` tables remain.
   It must not translate governed reservations into legacy Action Grants.

Dropping migration 1 is optional and destructive. `rollbackMigrations` requires
an exact version/confirmation token, an explicit data-loss flag, a verified
backup and a drained scope. Removing one scope's tables while another scope is
active is unsupported; operators must establish global drain across all scopes
before schema rollback.
