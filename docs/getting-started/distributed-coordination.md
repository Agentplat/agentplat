# Distributed coordination

## Requirements and minimum composition

Start with Node.js 22.13+, Git and Corepack-managed pnpm. For local capability
assignment, use framework, collective-runtime and runtime-mock. For the
multi-process example, also use PostgreSQL 16 (Docker Compose v2 or a dedicated
local database), local HTTP ports and the existing Mesh, mesh-crypto,
mesh-protocol, mesh-http and mesh-postgres adapters. The example manifest and
root script are the authoritative dependency list.

## First, try local assignment

From a fresh clone:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm run example:collective
```

Expected: research completes before dependent writing, with results printed by
the deterministic collective. This example does not establish distributed durability.

## Then, run independent peers

```sh
docker compose -f examples/mesh-multiprocess/compose.yaml up -d --wait
corepack pnpm run example:mesh-multiprocess
docker compose -f examples/mesh-multiprocess/compose.yaml down
```

Alternatively set `DATABASE_URL` for a dedicated local PostgreSQL database and
run the same example command without Compose. The launcher creates and removes
its own randomly named schema. Expected: a JSON evidence record for signed peer
messages, duplicate handling and restart recovery across four processes.
See the [example guide](../../examples/mesh-multiprocess/README.md) for port overrides.

## Limits and next step

The example generates ephemeral keys and local credentials. It does not supply
production key custody, global peer discovery or exactly-once delivery.
Do not infer large-scale performance from four local peers.
Next read [Mesh compatibility](../agent-mesh/compatibility.md), the
[capability catalog](../capability-catalog.md) and
[component maturity](../component-maturity.md). Keep advanced controllers opt-in.
