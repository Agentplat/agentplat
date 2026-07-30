# Agent Mesh compatibility policy

Agent Mesh is additive to the existing AgentPlat public surface.

## Existing packages

- `@agentplat/runtime` remains the local execution interface. Mesh scheduling
  does not enter `DefaultAgentRuntime`.
- `@agentplat/sessions` retains fixed round-robin defaults and remains the
  centralized deterministic baseline.
- `@agentplat/rooms` remains the durable governance boundary. A later adapter
  may compile Room state into an Objective snapshot and project accepted
  results back into Room artifacts and events.
- `@agentplat/events`, `@agentplat/audit` and `@agentplat/streaming` consume
  accepted Mesh events. They are not peer transports.
- `@agentplat/tools` remains a registry. Inference Control adds an Action
  Gateway instead of granting authority merely because a handler is registered.
- `@agentplat/framework` does not re-export alpha Mesh packages.

Alpha work does not add required fields to existing interfaces, extend existing
closed unions or change default behavior. New packages and explicit subpath
exports are the preferred extension mechanism.

## Wire compatibility

The npm package version and wire version are independent.

- Alpha uses `wireVersion: 0`.
- Alpha wire changes require new canonical fixtures and a migration note.
- The final alpha must read replay fixtures produced by the preceding alpha.
- Beta freezes `wireVersion: 1`.
- Beta and stable releases support negotiated interoperability between the
  current and preceding compatible wire versions.
- Unknown optional extensions are preserved or ignored as documented.
- Unknown critical extensions fail explicitly.
- Incompatible versions never downgrade silently.

## Persistence compatibility

Mesh events and checkpoints carry explicit schema versions. Persistence
adapters are optional and are introduced after the in-memory vertical slice.

Schema changes follow expand, migrate and contract:

1. add backward-readable structures;
2. support old and new reads;
3. migrate idempotently;
4. validate counts, digests and invariants;
5. switch reads;
6. remove old structures in a later release.

Importing a package never runs a migration automatically.

## Feature rollout

Configuration is typed and frozen for one run. Initial defaults keep distributed
execution and enforcement disabled until explicitly selected.

```text
mesh.enabled: false
coordination.mode: shadow
inferenceControl.mode: off
trust.enforcement: observe
peerQuarantine.enabled: false
durableCheckpoints.enabled: false
remoteTools.enabled: false
```

Feature flags choose behavior but do not grant authority. Signatures,
admission, action grants and fencing remain security controls.
