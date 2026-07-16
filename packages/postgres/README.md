# `@agentplat/postgres`

Shared PostgreSQL primitives for AgentPlat adapters. The package intentionally
depends only on `pg`: applications opt into AWS SDKs, secret sources and
deployment tooling themselves.

```ts
import { checkPostgresPool, createPostgresPool } from '@agentplat/postgres';

const pool = createPostgresPool({
  application_name: 'agentplat-orders',
  max: 10,
  ssl: { rejectUnauthorized: true, ca: rdsCaBundle },
  password: () => currentRdsIamToken(),
});

const readiness = await checkPostgresPool(pool);
```

`checkPostgresPool` runs `SELECT 1` and returns latency plus total, idle and
waiting connection counts. Do not expose database errors on a public endpoint;
map only `ok` to the external readiness response.

## Versioned migrations

`runPostgresMigrations` stores package/application-scoped versions and SHA-256
checksums in `<schema>._agentplat_migrations`. It rejects missing, reordered or
edited applied migrations and serializes deploys with an advisory lock.

Rollback is deliberately one version at a time. It requires the observed
current version, an exact confirmation string, and `allowDataLoss: true` for a
destructive down migration. Back up and test restore before supplying those
values in production.

Schema identifiers use a strict portable subset and are always quoted. Use one
schema per application when several AgentPlat apps share one cluster, then keep
`tenant_id` as the isolation key inside each application schema.
