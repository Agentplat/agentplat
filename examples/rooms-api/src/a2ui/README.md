# Experimental A2UI proposal review

This source-only pilot adds a restricted A2UI 1.0 custom catalog to the proposal
example. It is not a published AgentPlat package, a general A2UI renderer, or a
claim of A2UI conformance or production qualification.

Protocol references:

- https://a2ui.org/specification/v1.0-a2ui/
- https://a2ui.org/concepts/actions-and-functions/

## Run against the existing PostgreSQL example

Start and migrate rooms-api as described in the example README. Prepare a real
proposal with the deterministic provider and pause at its pending approval:

```sh
PROPOSAL_A2UI_PAUSE=1 node examples/rooms-api/scripts/proposal-demo.mjs
```

The command prints `roomId`, `participantId`, `tenantId` and `approvalId`.
Restart the API process with these variables (replace the example values):

```sh
export A2UI_PILOT_TOKEN=$(openssl rand -hex 32)
export A2UI_PILOT_TENANT_ID=proposal-demo
export A2UI_PILOT_PARTICIPANT_ID=participant-id-from-demo
pnpm --dir examples/rooms-api start
```

The example Compose file forwards these variables to the API service. Set them
in the shell or Compose `.env`, then recreate the API service. The database retains the prepared Room and approval. Open
`http://localhost:3000/experimental/a2ui`, enter the Room ID and token, and connect.
The existing HTTP API and deterministic provider remain available.

The pilot is disabled when `A2UI_PILOT_TOKEN` is absent. A configured pilot fails
startup if tenant, participant or a token of at least 24 characters is missing.
The token maps server-side to one tenant and human participant. Browser/model
inputs cannot supply the identity used to resolve an approval. This is a local
experiment with a shared reviewer credential, not a multi-user identity system.
The reference API's existing development tenant-header authentication remains
independent; deploy with the application's real authentication for broader use.

## Supported interaction and catalog

`agentplat:experimental:proposal-review:v1` is an application-owned catalog ID,
not a URL to fetch. `pilot.mjs` defines and validates its restricted contract:

- `Column`: `id`, `component`, `children` (references to leaf components).
- `Text`: `id`, `component`, `text` (literal string only).
- `Decision`: `id`, `component`, `label`, `decision` (`approve`, `reject`,
  `requestRevision`). This custom component emits an A2UI `action` with a comment.

Messages use A2UI `version: "1.0"` and `createSurface` envelopes. Return events
use `action` with `name`, `surfaceId`, `sourceComponentId`, `timestamp`, `context`.
This is a server-composed UI projection; no LLM UI generation, remote catalogs,
functions, data bindings, HTML execution, A2A negotiation or incremental patches
are enabled. Content is inserted using DOM `textContent`. The application CSP
allows same-origin scripts and blocks embedding and objects.

Each surface is bound to an existing approval and its exact artifact version.
Only pending approvals for current versions are projected. The server calls
`RoomService.resolveApproval`; existing permissions, expiry, transactions and
version checks stay authoritative. Requesting changes records the existing
`needs_revision` approval and artifact state. It does not automatically generate
a revision or create a HumanContribution: these are distinct existing contracts.
Continue revision generation using the existing Room task/API flow, publish the
new version and request a new approval; the view discovers it automatically.

## Recovery, ordering and duplicate decisions

The browser polls every two seconds using full replacement snapshots and an
opaque content cursor. It does not interpret this cursor as a Room event cursor.
A changed snapshot replaces the local rendering lifetime and preserves drafts
for surfaces that remain present; an unchanged snapshot preserves the current
DOM. Explicit Connect creates fresh handlers and clears stale actionable content
until authentication succeeds. Reconnect reconstructs from Room state with no
in-memory surface journal. A sequence guard drops responses for superseded
requests or connections, including failed responses. Requests time out after ten
seconds so an interrupted connection cannot stall polling indefinitely. Draft
comments live only in the page; a full reload requires credentials again and
does not preserve unsent comments. This trades incremental streaming for simple
recovery.

Identical retries reconcile the persisted approval (same participant, decision,
comment and current target version), including after adapter reconstruction.
Conflicting retries return 409. The existing Room transaction owns the decision;
there is no separate idempotency or approval database. Comments are limited to
4,000 characters. An old surface cannot approve a newer version. Core AgentPlat
also forbids creating a version while its approval is pending.

## Verification and evidence boundary

```sh
node --test examples/rooms-api/test/*.test.mjs
node --check examples/rooms-api/src/a2ui/client.js
```

The default suite covers the actual RoomService and Rooms HTTP app, browser-client
session/race regressions through a controlled DOM/network harness, and bounded
HTTP shutdown and worker recovery. The PostgreSQL subprocess test is opt-in:

```sh
A2UI_TEST_DATABASE_URL=postgresql://127.0.0.1:55439/test_database \
  node --test examples/rooms-api/test/*.test.mjs
```

Supply database authentication through the standard `PGUSER` and `PGPASSWORD`
environment variables. Use only a disposable test database: the test runs migrations and retains its
uniquely scoped test Rooms. It crashes and restarts real API processes and checks
pending decisions, version conflicts, duplicate clicks, exact retry after a
restart and Room completion. To additionally stop/start a disposable PostgreSQL
Docker container while the API stays running, explicitly set
`A2UI_TEST_POSTGRES_CONTAINER` to that container's name. The test restores it in a
`finally` block and checks snapshot recovery without restarting the API.

The example handles idle pool errors without printing connection objects and
retries known transient database failures in the coordination worker. HTTP
shutdown stops the worker first, closes idle connections and forcibly closes
remaining HTTP connections after five seconds. This bounds HTTP draining; it
is not a guarantee that arbitrary in-flight external work finishes in five
seconds. Docker forwards the three pilot environment variables.

Real Chrome and PostgreSQL verification was completed on 2026-11-12. See the
[verification record](verification.md) for the observed flow, fixes and limits.
This remains a restricted custom-catalog experiment, not general A2UI conformance
or operational-scale qualification. There are no new schemas or public APIs.
