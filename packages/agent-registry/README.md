# `@agentplat/agent-registry`

Portable, tenant-scoped capability discovery for local agents, external A2A
agents and Room services. Descriptors reference existing published definitions;
they never store private instructions or credentials.

Construct `AgentRegistry(store, authorizer)` with a verified application
principal. `publish`, `get`, `search`, `resolve` and `withdraw` enforce tenant
scope and revision CAS. Search exposes match/exclusion reasons and a cursor;
eligibility is advisory and never admission into a Room, Mesh or mission.

`InMemoryAgentRegistryStore` supports ephemeral use and tests. Use
`@agentplat/agent-registry-postgres` for durable multi-process deployments.
See the repository's `docs/interop/a2a-agent-registry.md` and
`examples/a2a-registry/demo.mjs`. Run `pnpm test` in this package.

## Installation (developer preview)

```sh
npm install @agentplat/agent-registry@next
```

Keep all `@agentplat/*` dependencies on the same coordinated preview version.
