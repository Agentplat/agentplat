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

Alpha 2 coordination state, discovery projection, inbound replay security state
and Objective/Work projection are separate schema-versioned contracts exposed
only from `@agentplat/mesh/coordination`. They do not extend the closed Alpha 1
peer state, input, effect, root export or loopback contracts. A caller opts into
the composite boundary explicitly and must restore every snapshot through its
strict constructor before use.

The Objective/Work projection is additive schema version `1`. Its composite
timer IDs are stable length-prefixed identifiers, so Objective and Work IDs
containing separators cannot alias. Coordination restoration now accepts these
bounded internal timer identifiers up to 768 UTF-8 bytes; every previously
valid 256-byte timer identifier remains readable. Work Item revisions are
derived by the evaluator rather than supplied by callers. Strict composite
restoration binds Objective-scoped domain metadata through `objectiveId` and
retains the signed envelope and derived policy for every accepted Objective
revision under a hard local limit. Each Work Item is canonicalized to the exact
retained policy head. Restore revalidates the envelope, recomputes its canonical
SHA-256 payload digest and re-derives logical expiry before binding it to the
accepted domain record. RFC 3339 deltas use nanosecond arithmetic and round
positive sub-millisecond remainders up to one logical millisecond. Timer-ID
collisions fail closed; the generic coordination timer evaluator refuses
workflow-owned Objective expiry and Work deadline timers.

The coordination and Objective inbound processors, plus their topic drivers,
are new explicit coordination-subpath APIs. Objective ingress shares the
separate non-evictable replay/message-ID snapshot with discovery and composes
four immutable, identity-aligned snapshots: coordination, discovery, Objective
and inbound security. A discovery-only logical-time advance does not rewrite
the Objective projection; evaluation uses an ephemeral aligned view. The topic
drivers are bounded in-memory reference drivers
with construction-bound clocks and inbound processors; they do not alter Alpha
1 loopback behavior or promise durable delivery. Their endpoint registries are
only process-local route tables. Recipient selection is limited to the sender's
local active Peer View joined to exact current endpoint instances, not global
membership, global fanout or a recipient oracle. Public receipts coarsen
failures while exact codes stay local-only; receiving a message never forwards
it.

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
