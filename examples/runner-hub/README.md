# Local Edge Runner Hub

A generic local backend for testing external runners. Build the source packages:

```sh
pnpm --filter @agentplat/runner-hub... build
```

Use a development PostgreSQL database: starting this example applies the runner migrations to its public schema. Supply a credential and tenant through environment variables, then run:

```sh
DATABASE_URL=postgresql://localhost/your_test_database \
AGENTPLAT_RUNNER_TENANT=test-tenant \
AGENTPLAT_RUNNER_KEY=REPLACE_WITH_YOUR_LOCAL_TEST_CREDENTIAL \
node examples/runner-hub/server.mjs
```

The server listens on `127.0.0.1:3010` (override `PORT` if needed). Both REST and WebSocket requests verify the fixed local key and tenant. Connect an SDK client or extension to `ws://127.0.0.1:3010/ws/runners` with those same settings. Production applications must supply their own verified identity and tenant authorization through the Hub and routes callbacks.

Create tasks through `POST /api/runner-tasks` using `X-Tenant-ID` and `x-agentplat-key`; poll `GET /api/runner-tasks/:id` for the result. For a client registering a `runner.probe` handler with browser capabilities, use:

```json
{"action":"runner.probe","payload":{"value":1},"requiredCapabilities":["browser","chrome-extension"]}
```

This example does not create a client handler or execute application actions. Shutdown releases active leases and closes the database pool. Tasks remain in the database across restarts. Refer to the [Hub integration guide](../../packages/runner-hub/README.md) for protocol, delivery semantics and verification.
