# @agentplat/artifacts

Optional tenant-scoped artifact lifecycle for AgentPlat. It provides durable
artifact metadata, immutable content revisions, explicit create/read/update
operations, runtime tools, and reference-only events. Markdown, plain text,
source code, CSV, HTML and JSON are supported as inert UTF-8 text; AgentPlat
never executes artifact content. JSON artifacts are syntax-checked on create
and update, then retained in their original text form.

## Use with a runtime

Create an `ArtifactService` with an `ArtifactStore`, then explicitly register
its tools into the same `ToolRegistry` you pass as
`RuntimeExecutionContext.tools`. If the app does not register the tools, agents
do not receive artifact capability. The verified `TenantContext` supplied to
tool invocation scopes every lookup and write. This baseline restricts reads
and updates to the creating owner inside the tenant; applications can wrap
registration or supply a store/authorization layer for broader Room policies.

```ts
const store = new InMemoryArtifactStore(); // local development and tests
const events = new InMemoryEventBus();
const artifacts = new ArtifactService({
  store,
  events,
  maximumContentBytes: 1_000_000,
});
await registerArtifactTools(toolRegistry, artifacts);
// Pass toolRegistry in RuntimeExecutionContext.tools when running the agent.
```

Application code can call `service.read(tenantContext, artifactId)` to resolve
the current content and metadata, or request an exact revision. Tool writes
require `expectedRevision`; stale concurrent updates return a conflict. Every
successful write creates a new immutable revision and publishes
`artifact.created` or `artifact.updated` with an addressable reference, digest,
MIME type, format and revision. Events deliberately omit content so consumers
fetch it through their authorized application path.

## Storage and delivery adapters

`ArtifactStore` defines create, tenant-scoped read, compare-and-set update and
revision history. A production adapter must implement create and update
atomically, make `(tenantId, artifactId)` its ownership key, enforce expected
revision in the same transaction as the write, and retain immutable revision
content. `InMemoryArtifactStore` is suitable for deterministic local use only;
it does not survive process restart or coordinate multiple processes. The
[`@agentplat/artifacts-postgres` adapter](../artifacts-postgres/README.md)
persists heads and revision history with transactional CAS.
`EventPublisher` is the existing `@agentplat/events` contract. For reliable
delivery, the PostgreSQL adapter writes the reference event to its outbox in
the same transaction as the artifact revision. Its dispatcher retries pending
events with at-least-once semantics; downstream consumers should deduplicate by
`event.id`. Applications can call `drainArtifactOutbox(store, publisher)` from
a worker. Other durable adapters can implement the optional atomic event and
dispatch methods on `ArtifactStore`.

## Format extensions

Artifact lifecycle and format generation are separate boundaries. Future PDF,
XLSX and PPTX adapters can produce validated content and MIME metadata without
changing the revision/store/tool contracts. JSON is syntax-validated as
`application/json` without interpreting its values. HTML is supported as an
inert artifact (`text/html`); preview rendering belongs to the consuming
application and must use an isolated origin or a strict sandbox. This package
does not generate documents or render previews.

## Agents.Grishen integration

The current Agents.Grishen web app already has compatible integration points:
`src/server/db.ts` owns the shared PostgreSQL pool, `DB_SCHEMA` and `TENANT_ID`;
`src/server/agent-runtime.ts` constructs the AgentPlat runtime and resolves
per-speaker permissions; `src/server/tool-runtime.ts` adapts OpenAI Responses
tool calls; and `src/server/pwa/worker.ts` runs background work. A concrete app
integration can:

1. Pin both new packages to the coordinated AgentPlat version in
   `Doot_React_v2.2.0/Admin/web/package.json` and lockfile.
2. Reuse the server pool and configured schema with
   `new PostgresArtifactStore(pool, DB_SCHEMA)`. Add its explicit migration to
   the app's existing `db:migrate` operation; `getRoomService()` already fails
   closed when the Room migration ledger has pending versions.
3. Register only the artifact function definitions permitted for a given user
   and Room. Route their calls through `toolAdapter`'s `InternalToolExecutor`
   to `ArtifactService`, passing the authenticated user as owner and the Room,
   message and run IDs from server-side execution context. Do not accept those
   authority fields from model arguments.
4. Run `drainArtifactOutbox` from a background worker or a dedicated process,
   and deduplicate downstream effects by `event.id`. An outbox event gives the
   client a persistent reference; the app API must recheck room ownership
   before returning content.
5. Add a client artifact panel and authorized download route. Render HTML only
   on an isolated origin or in a strict sandbox with a restrictive CSP.

The app still owns per-user/Room policy, auth, quotas/retention, API delivery,
preview/download UI and PDF/XLSX/PPTX generation. Existing text/Markdown
responses and MCP/HTTP grants remain independent; artifact capability is
additive and opt-in. The repository under `../agents-grishen` was inspected to
identify these integration points, but it is not modified by this package
change.

Run `pnpm --filter @agentplat/artifacts test` for focused tests and
`node examples/artifacts-agent/demo.mjs` after building this package.
