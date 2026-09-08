# ADR 0053 — A2A interoperability and shared Agent Registry

Status: implemented opt-in source surface; operational qualification remains separate.

## Decision

Add `@agentplat/agent-registry`, `@agentplat/agent-registry-postgres` and
`@agentplat/a2a`. The portable registry indexes revisioned descriptors of local
published agents, external A2A agents and explicitly published Room services.
The existing Room Agent Definition Registry remains the owner of instructions,
runtime configuration and published definition revisions. A descriptor is a
claim, not execution authority.

Use A2A protocol 1.0 JSON-RPC over HTTPS through the official `@a2a-js/sdk`
1.1.0. The SDK's wire types remain internal; AgentPlat exposes its own typed
message, artifact, task, service and persistence ports. Agent Cards, tasks,
streaming, cancellation, multi-turn interaction and task reconciliation are
supported. Push notifications, v0.3, gRPC, public registration, federation and
semantic ranking are outside this profile.

## Ownership

- Agent Room owns participants, tasks, drafts, approvals and execution policy.
  An A2A result creates ordinary draft artifacts/messages, never approval or
  automatic Room/task completion.
- Agent Mesh owns admission, assignments, leases and fencing. A local admitted
  peer delegates to an external endpoint through an adapter agent. The external
  endpoint is not represented as an independently admitted Mesh peer.
- Agent Morphogenesis consumes registry candidates through Capability State
  Fusion and its existing Candidate Discovery port. Proposals bind registry
  evidence to the canonical need and proposal. This bridge only proposes
  recruitment; it never creates agents or invokes membership/work owners.
- Hosts authenticate principals, authorize operations, resolve local execution
  bindings, implement effect idempotency, and enforce DNS/egress policy.

## Persistence and failure behavior

Both persistence adapters use the existing PostgreSQL migration ledger and
atomic CAS. Registry lifecycle, availability, verification and admission are
separate fields. Registry reads and writes are tenant-scoped; A2A records also
include subject and service scope. No process-global registry is installed.

Inbound sends reserve their task/operation before resolving the Room/run and
executing. Duplicate bodies return the persisted task; conflicting bodies are
rejected. The execution handler is independent of the SSE consumer. Restart
recovery calls the existing execution owner's reconciliation port. A crash
before a binding is persisted leaves a submitted operation requiring operator
reconciliation; it is not silently executed again.

Outbound requests reserve an operation before sending. Unknown remote outcomes
are retained as uncertain; no automatic resend occurs. A known remote task can
be queried or canceled, including after registry withdrawal, using its pinned
card/endpoint and reapplying network and application policy. External effects
cannot be claimed exactly-once merely because local requests are deduplicated.

## Consequences

Discovery and transport become reusable without moving authority into an Agent
Card. A2A does not imply portable checkpoint, restore or inference intervention;
the v1 A2A descriptor declares none of those controls. Work requiring them is
ineligible. Catalog admission is an administrative decision distinct from
admission into a Room, Mesh or mission.

See [integration guide](../interop/a2a-agent-registry.md) for public APIs,
verification commands and remaining deployment responsibilities. The frozen
Collective Capability Baseline V1 denominator is unchanged.
