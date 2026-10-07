# @agentplat/runner-hub

Generic tenant-scoped Edge Runner Hub and Distributed Task Dispatcher. The Hub owns external worker sessions and task delivery; it does not replace Agent Mesh coordination, Room approvals, or grant action authority. Applications authorize task creation and execution. This is a source capability with bounded local integration tests, not production-scale validation or a published package claim.

## Connect to the existing HTTP server

```ts
import { createPostgresPool } from '@agentplat/postgres';
import { createRoomsApp } from '@agentplat/rooms-api';
import { serve } from '@hono/node-server';
import { PostgresRunnerRepository, RunnerService, RunnerHub, createRunnerRoutes } from '@agentplat/runner-hub';

const pool = createPostgresPool();
const repository = new PostgresRunnerRepository(pool); // optional second argument: schema
await repository.migrate(); // shared AgentPlat migration ledger; idempotent
const service = new RunnerService(repository);
const runnerRoutes = createRunnerRoutes({
  service,
  authenticate: async request => {
    // Application verifies x-agentplat-key and returns its authorized X-Tenant-ID.
    return authenticateTaskRequest(request);
  },
});
const app = createRoomsApp({ service: roomService, runnerRoutes });
const server = serve({ fetch: app.fetch, port: 3000 });
const hub = new RunnerHub(server, service, {
  authenticate: async (request, tenantId, credential) =>
    verifyRunnerCredentialForTenant(credential, tenantId),
  onError: console.error,
});
// During shutdown: await hub.close(); then close server and pool.
```

The authenticator callbacks are required, and must bind credentials to tenants. The REST adapter mounts `POST /api/runner-tasks`, `GET /api/runner-tasks/:id` and `GET /api/runners`. The tenant comes exclusively from the REST authenticator; body tenant fields cannot override it. Fetch task status with polling. Listing returns persisted online/offline runners. Do not mount these routes behind development-only trusted headers on a publicly accessible server.

Create body: `{ "action": "execute", "payload": {}, "requiredCapabilities": ["browser"], "timeoutSeconds": 60, "maxRetries": 3 }`. API responses use `{ "data": ... }`, with lowercase persisted states `pending`, `leased`, `completed`, `failed`, `cancelled`. There is no cancellation endpoint in this version.

## Wire protocol and persistence

WebSocket path `/ws/runners`; handshake takes `X-Tenant-ID` and `x-agentplat-key`, or `tenantId` and `token` query parameters for browser clients. A connection must send `{ "type": "register", "runner": { "runnerId": "worker", "name": "Worker", "capabilities": [], "concurrencyLimit": 1 } }` within 10 seconds. Successful registration replies `{ "type": "registered" }`. Duplicate active runner IDs within a tenant are rejected; different tenants may share an ID. Server frames are limited to 1 MiB on receipt.

Task delivery: `{ "type": "task", "task": { ... } }`, including `id`, `leaseId`, `leaseExpiresAt`, `action` and `payload`. Receipts: `{ "type": "completed", "taskId": "...", "leaseId": "...", "result": {} }` or `{ "type": "failed", "taskId": "...", "leaseId": "...", "error": "..." }`. Session, tenant, runner, lease token and database expiration fence all receipts. An acknowledged handler error is terminal; disconnection/timeout increases retries and returns to pending, becoming failed when retries reaches maxRetries.

Native WebSocket ping plus application `{ "type": "ping" }` runs every 20s; clients answer `{ "type": "pong" }`. Unresponsive sockets terminate on the next heartbeat cycle. Persisted runner heartbeats expire after 60s, allowing recovery after a Hub process crash. Reaping and pending dispatch run every 5s by default. `hub.tick()` triggers an immediate pass if needed. Expired leases remain locally occupied until the worker sends a receipt or disconnects, so a hung handler cannot consume a retry on that same busy worker. Claims lock the runner to enforce shared concurrency and use `FOR UPDATE SKIP LOCKED` to prevent duplicate task claims across dispatchers. Database time owns leases. A crashed Hub's connections recover after heartbeat expiry; multiple Hubs must share the same database/schema.

SQL migrations are packaged in `migrations/`, use the existing schema token and migration ledger, and include a destructive down migration. Composite runner keys and foreign keys enforce tenant isolation. `session_id`, `lease_id`, and `concurrency_limit` extend the requested schema for session fencing and capacity control.

At-least-once delivery cannot cancel running external effects. Require application idempotency where necessary. Use TLS and redact token query parameters. Task retention, metrics, connection rate limits and execution policy belong to the integrating application. Persisted `cancelled` is reserved; public cancellation is not implemented.

## Verification

```sh
pnpm --filter @agentplat/runner-hub... build
pnpm --filter @agentplat/runner-hub... type-check
RUNNER_TEST_DATABASE_URL=postgresql://localhost/test_database pnpm --filter @agentplat/runner-hub test
```

Integration tests create and remove a unique schema in the supplied PostgreSQL database; without that environment variable only unit tests run. Tests use real WebSocket connections and database leases. No external service or business-specific logic is included.

## External application and npm candidate checks

Run `RUNNER_TEST_DATABASE_URL=postgresql://localhost/test_database pnpm run verify:runner-consumer` from the repository root. It builds and packs both new packages plus their coordinated PostgreSQL adapter, audits their archive contents, installs the exact tarballs into a temporary npm application, checks strict Node (without DOM) and browser declarations, and exercises real HTTP/WebSocket/PostgreSQL behavior. All three adapters are installed from exact tarballs, with registry dependencies for external libraries. The generated tarballs and SHA-512 report are in `release-artifacts/runner-candidate/`. Without the database variable, runtime imports and declaration checks run, and PostgreSQL scenarios are explicitly marked skipped.

The 1.3.0 candidate includes both runner packages in the 68-package coordinated catalog. The existing 1.0.0, 1.1.0 and 1.2.0 distributions remain historical releases. Preparing a candidate does not publish it: the protected workflow must verify all artifacts, and the two new package names require initial npm registration and verified trusted publisher settings. See [npm release security](../../docs/security/npm-release-security.md) and [1.3 preparation](../../docs/releases/1.3.0-preparation.md).

The verifier supports `AGENTPLAT_PREPACKED_TARBALL_DIRECTORY` to consume a prepared artifact set without building, repacking or writing to that directory. Its report goes to `dependency-audit/runner-consumer/` in that mode. Post-publication workflows use `AGENTPLAT_PUBLIC_CONSUMER_SOURCE=registry` to install the exact coordinated version and rerun types, packaged migration and live database/WebSocket checks. The registry byte/provenance verifier remains the separate distribution gate.
