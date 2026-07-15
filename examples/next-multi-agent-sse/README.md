# Next.js multi-agent SSE reference

This App Router example is the complete browser path for an ephemeral AgentPlat
session: server creation, `toNextSseResponse`, client abort, validated SSE
parsing and a reducer-backed UI.

It uses `@agentplat/runtime-mock` by default, so it makes no model or network
calls beyond the local Next.js server.

```sh
cd examples/next-multi-agent-sse
pnpm install
pnpm dev
```

Open `http://localhost:3000`, run the negotiation and use **Cancel** to abort
the active stream, **Stop after turn** to invoke the registered cooperative
stop route, or **Continue** to restart with exported history. The example also
contains the `POST /api/sessions/:sessionId/stop` route backed by a local
`createSessionRegistry()`. Replace that registry with a shared implementation
and authenticate the route in production.

Replace the mock registration in `app/api/simulate/route.ts` with an
OpenAI-compatible adapter when connecting a real model; keep the same session,
SSE and UI contracts. Add `createSessionAuditSink({ audit:
createConsoleAuditSink() })` to the server session options to print redacted
ephemeral audit records beside the stream during development.

The example converts each SSE envelope with `envelopeToEvent` before dispatching
to the reducer. For production controls, use three distinct recipes from the
[session guide](../../docs/multi-agent-sessions.md): hard abort via `signal`,
cooperative stop via a server-owned `stopSignal`, and a new invocation with
`history` to resume from completed turns. The `@agentplat/framework/browser`
entrypoint provides `createSessionStreamController` when an application wants
the same client glue without a React dependency.
