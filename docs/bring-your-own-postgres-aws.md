# Bring your own PostgreSQL on AWS (RDS or Aurora)

This guide deploys AgentPlat adapters into an existing AWS data plane. It does
not create or require DynamoDB, a dedicated RDS cluster, RDS Proxy, or the Agent
Rooms schema.

The minimum reusable topology is:

```text
ECS/Fargate service
  ├─ existing RDS/Aurora PostgreSQL
  │    └─ one schema + roles per application
  ├─ existing Redis/ElastiCache (only for distributed Session stop control)
  └─ existing Secrets Manager or RDS IAM authentication
```

Install only the adapters the application uses:

```sh
pnpm add @agentplat/postgres @agentplat/audit-postgres
# Optional multi-task Session control:
pnpm add @agentplat/sessions-redis redis
# Optional governed Rooms:
pnpm add @agentplat/rooms @agentplat/rooms-postgres
```

## 1. Allocate one schema and role pair per application

Sharing one cluster is safe only when ownership and connection budgets are
explicit. Do not let every application migrate `public` with the cluster admin
role.

Run once as the database administrator, replacing `orders` with an application
slug:

```sql
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

CREATE ROLE agentplat_orders_migrator NOLOGIN;
CREATE ROLE agentplat_orders_runtime NOLOGIN;
CREATE SCHEMA agentplat_orders AUTHORIZATION agentplat_orders_migrator;

GRANT USAGE ON SCHEMA agentplat_orders TO agentplat_orders_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE agentplat_orders_migrator
  IN SCHEMA agentplat_orders
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO agentplat_orders_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE agentplat_orders_migrator
  IN SCHEMA agentplat_orders
  GRANT USAGE, SELECT ON SEQUENCES TO agentplat_orders_runtime;
```

Create separate login roles (or IAM-mapped users) and grant the migrator role
only to the one-off migration identity. The long-running service receives only
the runtime role. AWS recommends revoking broad defaults in `public` and
granting granular PostgreSQL privileges.

AgentPlat adapters qualify every table with the configured schema; they do not
depend on a mutable `search_path`. Every domain row also includes `tenant_id`.
The schema separates applications; `tenant_id` separates customers inside an
application. Always derive tenant identity from authenticated server context,
never from an untrusted request body.

## 2. Require TLS and verify the server

RDS and Aurora publish regional and global CA bundles. Bake the current bundle
into the image or fetch it in the image build, not during every request:

```dockerfile
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/certs/rds-global-bundle.pem
```

```ts
import { readFileSync } from 'node:fs';
import { createPostgresPool } from '@agentplat/postgres';

const pool = createPostgresPool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  application_name: process.env.AGENTPLAT_APP_ID,
  ssl: {
    ca: readFileSync('/app/certs/rds-global-bundle.pem', 'utf8'),
    rejectUnauthorized: true,
  },
  max: Number(process.env.PGPOOL_MAX ?? 8),
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});
```

Do not use `rejectUnauthorized: false`. RDS documents `verify-full` as the mode
that validates both the certificate chain and endpoint hostname. Keep the
bundle current as part of normal base-image maintenance and certificate
rotation tests.

## 3. Choose IAM auth or Secrets Manager

### Option A: RDS IAM authentication

IAM authentication avoids a long-lived database password. RDS tokens last 15
minutes, but an established PostgreSQL connection remains usable; generate a
fresh token whenever `pg` opens a new connection:

```ts
import { Signer } from '@aws-sdk/rds-signer';

const signer = new Signer({
  region: process.env.AWS_REGION,
  hostname: process.env.PGHOST,
  port: Number(process.env.PGPORT ?? 5432),
  username: process.env.PGUSER,
});

const pool = createPostgresPool({
  // host, database, user and verified ssl as above
  password: () => signer.getAuthToken(),
});
```

Grant the ECS **task role** `rds-db:connect` for the exact database resource/user
ARN and grant PostgreSQL role `rds_iam` to the login. Do not put AWS keys in the
task definition. AWS recommends pooling and IAM authentication below roughly
200 new IAM-authenticated connections per second; the application pool keeps
normal workloads far below that.

Use a separate IAM database user/task role for migrations. Runtime tasks should
not be able to assume the migration privileges.

### Option B: Secrets Manager password

Retrieve the secret at startup with `secretsmanager:GetSecretValue`, or inject a
specific JSON key through the ECS `secrets` field. If ECS injects the value as
an environment variable, a later rotation is **not** delivered to a running
task; force a new service deployment after rotation. Direct SDK retrieval lets
the application implement a bounded cache and reconnect strategy.

Never put `DATABASE_URL`, passwords or complete secret JSON in normal ECS
`environment`, logs, health output, migration output or CI artifacts.

## 4. Budget connections across applications

Application-side pools multiply with replicas:

```text
sum(service desiredCount × PGPOOL_MAX)
  + one-off migration connections
  + administration/monitoring reserve
  < database max_connections budget
```

Start small (`max=4..10` per task), set acquisition and idle timeouts, and alert
on `waiting > 0`. Create one process-wide pool, not one pool per request or
tenant. RDS Proxy is optional: it can help with bursty replica counts, but it is
another paid resource and is not required by AgentPlat. If the client already
has it, align application and proxy pool limits/timeouts and test session
pinning behavior.

## 5. Apply migrations once in CI

Never let every service replica race migrations during startup. Build one image,
run it as an ECS standalone migration task in the same private subnets/security
group as the service, wait for exit code zero, and only then update the ECS
service.

```sh
AGENTPLAT_DB_SCHEMA=agentplat_orders \
pnpm --filter @agentplat/audit-postgres migrate
```

`runAuditMigrations` and `runMigrations` use:

- schema/application-scoped advisory locks;
- monotonically increasing integer versions;
- SHA-256 checksums that reject edited applied SQL;
- one transaction per migration;
- `<schema>._agentplat_migrations`, keyed by adapter and version.

Automated pipelines should run **up only**. A down migration is a break-glass
operation and rolls back one version per invocation. It requires the observed
current version, the exact confirmation returned by the package, and
`AGENTPLAT_ALLOW_DATA_LOSS=true` for destructive SQL. Take an RDS snapshot and
prove restore before using it. Prefer an additive forward fix when old and new
application versions can overlap during a rolling deployment.

For shared RDS, use the expand/contract sequence:

1. add nullable columns/tables/indexes without removing old behavior;
2. deploy code that can read both shapes and writes the new shape;
3. backfill in a bounded job;
4. deploy code that no longer needs the old shape;
5. remove old objects in a later release after rollback windows close.

See [`examples/aws-ecs-rds`](../examples/aws-ecs-rds/README.md) for a Fargate
task definition and GitHub Actions migration gate.

## 6. Persist Sessions without Rooms

The audit adapter creates only `audit_records` and `session_events`:

```ts
import {
  PostgresAuditSink,
  PostgresSessionEventSink,
  runAuditMigrations,
} from '@agentplat/audit-postgres';

await runAuditMigrations(pool, { schema: 'agentplat_orders' });

const audit = new PostgresAuditSink(pool, { schema: 'agentplat_orders' });
const eventSink = new PostgresSessionEventSink(pool, {
  schema: 'agentplat_orders',
});

const session = agentplat.createSession({
  speakers,
  eventSink,
  sinkFailureMode: 'required',
});
```

Mount `@agentplat/rooms-postgres` only when the application needs governed Room
lifecycle, approvals, artifacts and memory. A completed simulation can later
be materialized with `promoteSessionToRoom` rather than copied into a second
custom model.

## 7. Distribute Session stop control with existing Redis

`AbortController` cannot be serialized into DynamoDB or Redis. The Redis adapter
keeps it in the owner task, stores a short `sessionId -> instanceId` lease, and
publishes stop commands to that instance:

```ts
const registry = await createRedisSessionRegistry({
  command: redis,
  subscriber: redis.duplicate(),
  prefix: 'agentplat:orders:prod',
});
```

Use distinct prefixes per application/environment and authenticate every stop
request. Pub/sub is only live control; use the PostgreSQL Session event sink for
durability.

## 8. Health and rollout checks

Liveness should prove only that the process event loop is responsive. Readiness
may call `checkPostgresPool(pool)` and should fail when the application cannot
borrow/query a connection. Expose only a boolean externally; send latency,
`total`, `idle` and `waiting` counts to private metrics.

At deployment time verify:

- the migration task reaches RDS from its subnets/security group;
- runtime and migration identities have different grants;
- TLS verification succeeds with the baked bundle;
- the configured schema matches the application and environment;
- aggregate pool capacity fits the shared cluster budget;
- Redis stop works across two ECS tasks;
- secret rotation or IAM token renewal opens a new connection successfully;
- no DynamoDB environment variable or permission is required.

## AWS references

- [RDS PostgreSQL SSL and certificate verification](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html)
- [RDS CA certificate bundles](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html)
- [RDS IAM database authentication](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.html)
- [RDS PostgreSQL roles and schema privileges](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.Access.html)
- [Retrieve Secrets Manager values with the JavaScript SDK](https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets-javascript.html)
- [Secrets Manager values in ECS tasks](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html)
- [ECS task networking and security groups](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/security-network.html)
- [ECS standalone tasks](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/standalone-tasks.html)
- [RDS Proxy overview](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.html)
