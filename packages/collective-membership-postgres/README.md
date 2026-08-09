# @agentplat/collective-membership-postgres

PostgreSQL durability for `@agentplat/collective-membership`.

The repository stores one peer's independent membership state:

- the current configuration head and complete epoch history;
- one durable proposal choice per source epoch;
- idempotent signed vote responses; and
- certified transition records;
- CAS-protected governed agent lineage; and
- the idempotent governed agent factory ledger.

## Setup

```ts
import { Pool } from "pg";
import {
  PostgresCollectiveMembershipRepositoryV1,
  runMigrations,
} from "@agentplat/collective-membership-postgres";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await runMigrations(pool);

const repository = new PostgresCollectiveMembershipRepositoryV1(pool, {
  tenantId: "tenant.1",
  meshId: "mesh.1",
  peerId: "peer.1",
  policyDomainId: "operations",
});
```

`PostgresAgentLineageStoreV1` and
`PostgresGovernedAgentFactoryStoreV1` share the same tenant or mesh `scopeId`
but use separate state kinds. Both compare the expected revision and reject
logical-time rollback. Run migration `002_governed_agent_states` before using
them.

Run migrations before constructing membership hosts. Rollback is destructive
and requires both the generated confirmation string and
`verifiedBackup: true`.

Each independently running peer must use its own `peerId` scope. Sharing one
scope between peers would merge their vote slots and violate independent
voting semantics.
