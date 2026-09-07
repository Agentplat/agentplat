# Persistent human-agent collaboration

Recommended for TypeScript teams building internal platforms. The guided
proposal uses two agents, research dependencies, a human revision request,
versioned output and final approval through the existing Rooms HTTP API.

## Requirements and packages

Use Git and Node.js 22.13+ for the source-clone path. Choose Docker Engine with
Compose v2, or Corepack-managed pnpm and PostgreSQL 16 for local execution.
The server composes Rooms, Rooms API, Rooms PostgreSQL, runtime, runtime-mock
and events; the existing reference app also wires planning and collaboration
services. The optional model adapter is installed but inactive by default.

## Start with Docker

From the repository root:

```sh
cd examples/rooms-api
cp .env.example .env
docker compose up --build -d --wait
node scripts/proposal-demo.mjs
```

## Start with local PostgreSQL

Use a dedicated development database. Set `PGHOST`, `PGPORT`, `PGDATABASE`,
`PGUSER` and, where required, `PGPASSWORD` in your shell. Do not paste production
credentials into the example. From the repository root:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm run build
corepack pnpm --dir examples/rooms-api install --frozen-lockfile --ignore-workspace
corepack pnpm --dir examples/rooms-api migrate
corepack pnpm --dir examples/rooms-api start
```

In another terminal:

```sh
node examples/rooms-api/scripts/proposal-demo.mjs
```

Set `API_URL` if the API is not at `http://localhost:3000`. Set
`AGENTPLAT_TENANT_ID` consistently when running and inspecting a demo.

## Observe the result

The demo prints a Room ID, research artifact, completed tasks, three artifacts
(including the separate revision output), proposal versions 1 and 2, human
approval records and event history. Its automated reviewer represents the
human's API actions; this is a guided script, not an interactive UI.

```sh
node examples/rooms-api/scripts/proposal-demo.mjs inspect ROOM_ID
```

Each run creates a new Room. Data remains in PostgreSQL for inspection. Do not
run the example against a production database.

## Recover interrupted work and check controls

With the same PostgreSQL environment, from the repository root:

```sh
corepack pnpm --dir examples/rooms-api demo:recover
corepack pnpm --dir examples/rooms-api demo:controls
```

Docker users can execute these commands inside the API container:

```sh
docker compose -f examples/rooms-api/compose.yaml exec api pnpm --dir examples/rooms-api demo:recover
docker compose -f examples/rooms-api/compose.yaml exec api pnpm --dir examples/rooms-api demo:controls
```

Recovery forcibly stops a child process after its Room result commits but
before coordination acknowledges it. A successor claims the expired lease,
keeps the operation ID and reuses completed research and draft runs. The
scenario asserts two runs and two artifacts, rather than recomputing them.
The recovery launcher uses and removes its own schema so the API worker cannot
claim its test work. This is one bounded recovery boundary, not arbitrary
provider recovery.

The controls scenario checks human approval, checkpoint denial, incompatible
providers and a retry after a local effect commits. See
[integration controls](integration-controls.md) for the exact guarantees.

## Optional real-model variant

On the API host, set `PROPOSAL_MODEL_MODE=live`, `PROPOSAL_MODEL`,
`PROPOSAL_BASE_URL` (a Chat Completions base URL) and `PROPOSAL_API_KEY`, then
restart the server. A local keyless endpoint requires
`PROPOSAL_ALLOW_KEYLESS=true`. Docker users must explicitly pass these variables
through a local Compose override; the checked-in Compose file stays mock-only.
Run the same proposal demo. Live calls are excluded from automated checks.

The default `mock` mode needs no key and makes no inference calls. Unknown modes
or incomplete live configuration stop startup. The live provider generates
text only: it does not implement a protected external tool loop.

## Limits and next step

The development tenant header is trusted input, not user authentication.
The API host must bind verified identity and actor permissions for deployment.
The ordinary demo uses draft actions; its approvals concern artifacts.
Protected effects are demonstrated separately with explicit checkpoints.
See [integration controls](integration-controls.md),
[component maturity](../component-maturity.md) and, if needed,
[distributed coordination](distributed-coordination.md).
