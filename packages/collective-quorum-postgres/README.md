# `@agentplat/collective-quorum-postgres`

PostgreSQL durability for `@agentplat/collective-quorum`.

Migration V2 also provides transactional vote, lock, observed-vote and commit
storage for the opt-in `@agentplat/collective-quorum/agreement` protocol. Import
`PostgresCollectiveAgreementRepositoryV1` from
`@agentplat/collective-quorum-postgres/agreement`. Existing root repository
contracts and tables remain available.

The repository keeps these peer-local facts transactionally:

- one non-equivocating semantic assignment value per lease slot;
- the highest promised recovery ballot;
- the last accepted recovery ballot and value;
- per-proposer monotonic ballot counters;
- idempotent signed responses and assembled certificates.

Run migrations before constructing the peer host:

```ts
import {
  PostgresCollectiveQuorumRepositoryV1,
  runMigrations,
} from "@agentplat/collective-quorum-postgres";

await runMigrations(pool, { schema: "agentplat", createSchema: true });

const repository = new PostgresCollectiveQuorumRepositoryV1(pool, {
  schema: "agentplat",
  tenantId,
  meshId,
  peerId,
  policyDomainId,
});
```

Each independently running peer must use its own `peerId` scope. Sharing a
database is optional; the database is persistence infrastructure, not a global
coordinator. Transactions take row locks only within one peer and one decision
scope.

Rollback is destructive and requires `verifiedBackup: true` plus the exact
confirmation token returned by `rollbackConfirmation`.
