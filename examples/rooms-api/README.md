# Agent Room API reference application

This is the smallest deployable Agentplat application: a Hono API backed by
PostgreSQL, the public Room domain service, an in-process event bus, and the
deterministic mock runtime. It makes no external model calls and imports no
Agentplat Cloud or other private code.

Use it as a runnable example, a local development server, or the starting
point for a self-hosted agentic platform. Each infrastructure boundary is
injected in [`src/index.mjs`](./src/index.mjs), so applications can replace the
database, runtime, event publisher, or HTTP authentication without changing
the Room domain.

## Start with Docker

Requirements: Docker Engine with Compose v2.

```sh
cd examples/rooms-api
cp .env.example .env
docker compose up --build -d
docker compose logs -f api
```

Compose starts PostgreSQL, waits for it to become healthy, applies the public
Room migration once, and only then starts the API. Check it from another
terminal:

```sh
curl --fail http://localhost:3000/health
bash scripts/demo.sh
```

The demo runs the complete vertical slice and prints the resulting Room
projection. It needs `curl` and `jq`. Override its defaults with `API_URL` and
`AGENTPLAT_TENANT_ID`.

Stop the application without deleting data:

```sh
docker compose down
```

To delete the local PostgreSQL volume and start from an empty database:

```sh
docker compose down --volumes
```

## Run directly on Node.js

Requirements: Node.js 20+, pnpm 8+, and a reachable PostgreSQL instance.
From the repository root:

```sh
corepack pnpm install
corepack pnpm run build
corepack pnpm --dir examples/rooms-api install --frozen-lockfile --ignore-workspace
```

Then load the local settings and run the migration:

```sh
cd examples/rooms-api
cp .env.example .env
set -a
. ./.env
set +a
corepack pnpm migrate
corepack pnpm start
```

The example manifest uses local `link:` dependencies so a fresh clone runs the
code in this repository. A downstream application should replace those links
with released `@agentplat/*` version ranges.

## Configuration

| Variable       | Default                   | Purpose                                                                                  |
| -------------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| `PORT`         | `3000`                    | HTTP port when running the Node application directly.                                    |
| `HOST`         | `0.0.0.0`                 | HTTP bind address.                                                                       |
| `DATABASE_URL` | unset                     | Optional PostgreSQL connection URL. Store credential-bearing values in a secret manager. |
| `PGHOST`       | PostgreSQL client default | Database hostname when `DATABASE_URL` is unset.                                          |
| `PGPORT`       | `5432`                    | Database port.                                                                           |
| `PGDATABASE`   | operating-system user     | Database name.                                                                           |
| `PGUSER`       | operating-system user     | Database user.                                                                           |
| `PGPASSWORD`   | unset                     | Database password.                                                                       |
| `API_PORT`     | `3000`                    | Host and container API port used by Compose.                                             |
| `POSTGRES_*`   | values in `.env.example`  | Bootstrap settings for the Compose PostgreSQL container.                                 |

The migration command is idempotent. The container uses the standard `PG*`
variables so credentials do not need to be embedded in a URL.

## HTTP API

`GET /health` is public. Every other endpoint requires a trusted tenant header:

```http
X-Agentplat-Tenant-Id: acme
```

The header is deliberately simple for local and self-hosted development. It is
not end-user authentication and must not be exposed directly to an untrusted
network. Production applications should pass a verified authenticator to
`createRoomsApp` and derive `tenantId` from their identity provider.

The reference API exposes:

- `POST /rooms` and `GET /rooms`
- `GET /rooms/:roomId` and `PATCH /rooms/:roomId`
- `POST /rooms/:roomId/pause|resume|complete|archive`
- `POST /rooms/:roomId/participants`
- `POST /rooms/:roomId/messages`
- `POST /rooms/:roomId/tasks`
- `POST /rooms/:roomId/tasks/:taskId/run`
- `POST /rooms/:roomId/artifacts`
- `POST /rooms/:roomId/artifacts/:artifactId/versions`
- `POST /rooms/:roomId/approvals`
- `POST /approvals/:approvalId/approve|reject|request-revision`
- `GET /rooms/:roomId/events`

Successful responses use `{ "data": ... }`. Errors use
`{ "error": { "code", "message", "details"? } }`. Tenant identifiers in a
body or query string are ignored; the authenticated/header tenant always wins.

`GET /rooms/:roomId` returns the full aggregate projection: Room, child Rooms,
participants, transcript, tasks, artifacts and immutable versions, approvals,
policies, memory, context snapshots, runs, tool calls, and ordered events.

## Replace an adapter

The assembly in `src/index.mjs` is intentionally explicit:

- Replace `PostgresRoomRepository` with another implementation of the public
  `RoomRepository` interface.
- Register a real provider on `DefaultAgentRuntime` instead of
  `MockAgentProvider`. The Room service remains provider-neutral.
- Replace `InMemoryEventBus` with a durable publisher such as a downstream
  Kafka or NATS adapter. Domain events are already persisted transactionally.
- Pass `auth` to `createRoomsApp` to map verified identities to a
  `TenantContext`.
- Build custom tool, MCP, and memory adapters against the corresponding public
  Agentplat contracts.

The default policy only allows low-risk local/mock execution. External writes,
privileged actions, and unapproved tools remain denied until an application
adds an explicit Room policy.
