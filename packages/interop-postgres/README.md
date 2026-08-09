# @agentplat/interop-postgres

Opt-in PostgreSQL custody for `@agentplat/interop`. It provides atomic CAS
storage for governed session records, inbound exact-response replay custody,
and transactional sequence allocators whose idempotency-key allocations survive
process restarts. It also provides `PostgresCognitiveDurableOperationStoreV2`
for effect-capable heterogeneous cognitive adapters.

```ts
import {
  PostgresGovernedInteropSessionStoreV1,
  PostgresInteropIdempotencyStoreV1,
  PostgresInteropSequenceStoreV1,
  PostgresCognitiveDurableOperationStoreV2,
  PostgresInteropOutboundSequenceStoreV1,
  runMigrations,
} from "@agentplat/interop-postgres";
import { createRestartDurableInteropRouterStoresV1 } from "@agentplat/interop";
import {
  createReferenceGovernedInteropRuntimeV1,
  createRestartDurableGovernedInteropRuntimeStoresV1,
} from "@agentplat/interop/governed-lifecycle";

await runMigrations(pool, { schema: "agentplat", createSchema: true });

const custody = { schema: "agentplat", namespace: "production" };
const store = new PostgresGovernedInteropSessionStoreV1(pool, custody);
const outboundSequences = new PostgresInteropOutboundSequenceStoreV1(
  pool,
  custody,
);
const inboundIdempotency = new PostgresInteropIdempotencyStoreV1(pool, custody);
const inboundSequences = new PostgresInteropSequenceStoreV1(pool, custody);
const cognitiveStore = new PostgresCognitiveDurableOperationStoreV2(pool, custody);

const governed = createReferenceGovernedInteropRuntimeV1({
  // client, lifecycle, capabilityProfile, roleProfile, router, ...
  durableStores: createRestartDurableGovernedInteropRuntimeStoresV1({
    sessionStore: store,
    outboundSequences,
    routerStores: createRestartDurableInteropRouterStoresV1({
      idempotency: inboundIdempotency,
      sequences: inboundSequences,
    }),
  }),
});
```

The reference composition requires the full session, outbound and inbound
custody bundle. Process-local state is available only through its explicit
top-level `localOnly: true` selection.

The caller owns the pool and applies migrations before constructing the
repositories. A namespace isolates independent deployments inside a schema.
`maximumRecordBytes` defaults to 1 MiB. Rollback is destructive and requires
both `verifiedBackup: true` and the normal explicit data-loss confirmation.
