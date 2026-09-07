# Resume agent coordination after a process failure

Use persistent coordination when an agent process can stop after saving its
work but before acknowledging completion. The AgentPlat example recovers that
specific boundary with the same operation identity and completed Room runs.

## Run the failure scenario

Use the current source checkout, Node.js 22.13+, Corepack-managed pnpm and
PostgreSQL 16, or Docker Engine with Compose v2. First complete the build and
database setup in [persistent collaboration](persistent-collaboration.md).
No real model or external tool service is involved.

From the repository root, with the development PostgreSQL variables set:

```sh
corepack pnpm --dir examples/rooms-api demo:recover
```

For the Docker path, after starting its API container:

```sh
docker compose -f examples/rooms-api/compose.yaml exec api pnpm --dir examples/rooms-api demo:recover
```

## What the scenario does

1. Creates a private temporary PostgreSQL schema and starts a child worker.
2. Stops that child after the Room result commits, before coordination acknowledgement.
3. Starts a successor after the coordination lease expires.
4. Checks the retained operation and run identities and asserts two completed
   runs and two artifacts, reusing completed research and drafting work.
5. Removes the scenario schema during cleanup.

Read the [launcher](../../examples/rooms-api/scripts/proposal-recovery.mjs) and
[worker](../../examples/rooms-api/scripts/proposal-recovery-worker.mjs) for the
failure injection and assertions. A successful exit means those assertions
passed. Preserve error output and environment details for a failed run.

## What to carry into your application

Persist coordination and results together through their documented adapters.
Keep stable work identities across retries. Configure lease ownership and
expiry rather than starting a second uncoordinated execution after a timeout.
Test your own crash boundaries, including ambiguous external outcomes.

This scenario does not establish recovery of an arbitrary in-flight provider
request, exactly-once external effects, availability under all failures or a
throughput claim. See [integration controls](integration-controls.md) for
effect-specific responsibilities and [distributed coordination](distributed-coordination.md)
when independent peers and AgentPlat Agent Mesh are required.

The [validation record](validation.md) identifies the executed environment.
The [component maturity matrix](../component-maturity.md) separates source
behavior from registry distribution and operational evidence.
