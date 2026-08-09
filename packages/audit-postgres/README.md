# `@agentplat/audit-postgres`

PostgreSQL sinks for applications that need durable audit or Session events
without installing the Agent Room schema.

```ts
import { createPostgresPool } from "@agentplat/postgres";
import {
  PostgresAuditSink,
  PostgresCollectiveTelemetryMonotonicAnchorV1,
  PostgresCollectiveTelemetryStoreV1,
  PostgresSessionEventSink,
  runAuditMigrations,
} from "@agentplat/audit-postgres";

const pool = createPostgresPool();
await runAuditMigrations(pool, { schema: "agentplat_orders" });
const protectedWitnessPool = createPostgresPool({
  connectionString: process.env.TELEMETRY_WITNESS_DATABASE_URL,
});
await runAuditMigrations(protectedWitnessPool, {
  schema: "agentplat_witness",
});

const audit = new PostgresAuditSink(pool, { schema: "agentplat_orders" });
const sessionEvents = new PostgresSessionEventSink(pool, {
  schema: "agentplat_orders",
});

const telemetryStore = new PostgresCollectiveTelemetryStoreV1(pool, {
  schema: "agentplat_orders",
  tenantId: "tenant-a",
});
const telemetryAnchor = new PostgresCollectiveTelemetryMonotonicAnchorV1(
  protectedWitnessPool,
  { schema: "agentplat_witness", tenantId: "tenant-a" },
);
```

Both tables are append-only and all writes include `tenant_id`. Sinks redact
secret-like keys recursively before persistence. Deterministic IDs make event
retries idempotent.

`PostgresCollectiveTelemetryStoreV1` adds revision-and-state-digest CAS for the
signed telemetry chain and an append-only event table. Event identity conflicts
roll the state transaction back instead of accepting an ambiguous replay. The
runtime also requires an independently protected monotonic anchor. Migration
004 and `PostgresCollectiveTelemetryMonotonicAnchorV1` provide one bounded CAS
head per stream. PostgreSQL permits only an exact monotonic successor and
forbids deletion, so storage is bounded by stream count rather than event
count. For rollback separation, construct that adapter with a pool and schema
protected independently from the replaceable application-state pool;
using the same database preserves restart continuity but not backup-domain
separation.

Migration 003 adds bounded, short-lived delivery receipts. A scope lock makes
the receipt-capacity check, telemetry state CAS, append-only event insert and
receipt insert one transaction. The nominal runtime handoff is therefore
idempotent by delivery digest independently of event retention. Runtime and
adapter consumers receive no independent record/release primitives: the
module-owned handoff privately removes the exact receipt only after the source
persists its recorded state, then ACKs that source envelope.
`maximumPendingDeliveryReceipts` defaults to 4096 and exhaustion fails closed.

The package uses the shared version/checksum ledger from
`@agentplat/postgres`. `migrate:down` is blocked unless the expected version,
exact confirmation string, and explicit data-loss flag are all supplied. It is
not a substitute for a tested RDS snapshot restore.
