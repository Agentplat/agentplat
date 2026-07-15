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
the active stream. Replace the mock registration in `app/api/simulate/route.ts`
with an OpenAI-compatible adapter when connecting a real model; keep the same
session, SSE and UI contracts.
