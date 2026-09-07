# Add human approval to a multi-agent workflow

Use an AgentPlat Agent Room when people need to review versioned agent work.
An artifact approval records a review decision. A protected action additionally
needs task approval and a checkpoint wired into the provider's execution path.
These are separate controls.

## Run the example

Use the current source checkout, Node.js 22.13+, Corepack-managed pnpm and
PostgreSQL 16, or Docker Engine with Compose v2. Follow the installation and
database setup in [persistent collaboration](persistent-collaboration.md).
The example uses deterministic providers and requires no model key.

From the repository root, with the API running:

```sh
node examples/rooms-api/scripts/proposal-demo.mjs
```

The scripted reviewer requests a revision, inspects the new proposal version
and approves it. The printed Room ID lets you inspect the retained decisions:

```sh
node examples/rooms-api/scripts/proposal-demo.mjs inspect ROOM_ID
```

Replace `ROOM_ID` with the actual output. This is a scripted human API role,
not a deployed review UI or a live participant study.

## Gate an effect

With the same development PostgreSQL environment:

```sh
corepack pnpm --dir examples/rooms-api demo:controls
```

For the Docker path:

```sh
docker compose -f examples/rooms-api/compose.yaml exec api pnpm --dir examples/rooms-api demo:controls
```

The [executable source](../../examples/rooms-api/scripts/protected-action-demo.mjs)
asserts that approval is required before execution, an incompatible provider
is rejected, and checkpoint denial prevents the local effect. It also retries
after a local receipt commits and checks that only one fixed-payload receipt
exists. A nonzero exit is a failed scenario; retain its error when reporting it.

The host constructs `RoomService` with `requireProtectedActionCheckpoints: true`.
The provider must declare `pre_action` support and await the checkpoint before
each protected effect. See [integration controls](integration-controls.md) for
the configuration and verified-identity integration points.

## Adoption boundary

The library option is opt-in. It cannot intercept arbitrary provider code.
Your host owns authentication, actor authorization and effect-specific
idempotency. The fixed local sink does not prove exactly-once behavior for an
external service. The effect schema is removed after the scenario; Room history
remains in the development database.

Read [component maturity](../component-maturity.md) and the
[validation record](validation.md) before choosing a release. The scenario
checks control behavior, not model quality or production readiness.
