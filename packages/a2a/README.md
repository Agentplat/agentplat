# `@agentplat/a2a`

Opt-in A2A 1.0 JSON-RPC interoperability using official JavaScript SDK 1.1.0.
Public AgentPlat contracts hide SDK wire types. Supports agents and Room team
services, messages, tasks, streaming, continuation, cancellation and reconciliation.

- Root: `A2AClient`, `A2AServer`, `discoverA2AAgent`, controlled network retrieval,
  typed execution ports and `InMemoryA2AStateStore`.
- `/rooms`: published definition projection, Room-backed services and result drafts.
- `/mesh`: existing admission/assignment/lease/fence authorization bridge.
- `/morphogenesis`: Capability State Fusion, canonical recruitment proposals and
  the existing Candidate Discovery port.
- `/postgres`: durable task/correlation/reservation CAS and migration ledger.

Authentication, domain authorization, idempotent local execution bindings and
network egress controls are required host dependencies. Discovery never grants
authority. Unknown remote outcomes are not automatically resent. A2A does not
supply AgentPlat checkpoint, restore or inference intervention.

See `docs/interop/a2a-agent-registry.md`, ADR 0053 and
`examples/a2a-registry/demo.mjs`. Run repository commands `pnpm test:a2a`,
`pnpm example:a2a` and `pnpm verify:a2a-consumer`.

## Installation (developer preview)

```sh
npm install @agentplat/a2a@next
```

Keep all `@agentplat/*` dependencies on the same coordinated preview version.
