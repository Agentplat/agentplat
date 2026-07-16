# `@agentplat/audit-postgres`

PostgreSQL sinks for applications that need durable audit or Session events
without installing the Agent Room schema.

```ts
import { createPostgresPool } from '@agentplat/postgres';
import {
  PostgresAuditSink,
  PostgresSessionEventSink,
  runAuditMigrations,
} from '@agentplat/audit-postgres';

const pool = createPostgresPool();
await runAuditMigrations(pool, { schema: 'agentplat_orders' });

const audit = new PostgresAuditSink(pool, { schema: 'agentplat_orders' });
const sessionEvents = new PostgresSessionEventSink(pool, {
  schema: 'agentplat_orders',
});
```

Both tables are append-only and all writes include `tenant_id`. Sinks redact
secret-like keys recursively before persistence. Deterministic IDs make event
retries idempotent.

The package uses the shared version/checksum ledger from
`@agentplat/postgres`. `migrate:down` is blocked unless the expected version,
exact confirmation string, and explicit data-loss flag are all supplied. It is
not a substitute for a tested RDS snapshot restore.
