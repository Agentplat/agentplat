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

## Alpha 3 inference-control boundary

`@agentplat/inference-control` is an additive opt-in package. Its root exports
closed policies, context zones, assessments, limits, immutable state and pure
evaluation. Its explicit `/model` and `/runtime` executors use stronger
controlled request/event contracts instead of implementing existing interfaces
that cannot carry context zones or provenance. `/tools` exposes an Action
Gateway rather than a transparently authorized `ToolHandler`; `/messages`
exposes an outbound-message gateway. None changes existing package root
interfaces or defaults.

Control capabilities are separate from `ModelAdapterCapabilities`. Existing
feature declarations for streaming, tools, structured output or vision do not
become enforcement claims. A wrapper must explicitly declare the input,
output, local release-interruption and tool-interception boundaries it exposes.

`AgentStreamEvent` remains unchanged. Controlled runtime wrappers expose a new
event union from the inference-control package; the generic Streaming/SSE
contracts can carry it without extending the existing closed runtime union.

The package does not use `RuntimeExecutionContext.metadata`,
`RuntimeExecutionContext.policies`, `AgentDefinition.capabilities` or tool
metadata as action authority. Action Grants are resolved from a local strict
ledger and typed authority resolver. A direct reference to an unwrapped
provider, adapter, handler or message dispatcher remains outside the opt-in
boundary. The grant input digest is mandatory, and gateway callers cannot
supply the action, handler, assessment or resolver as request data.

The initial grant ledger is local and snapshot-restorable, not a durable
multi-process transaction log or bearer-token protocol. A timeout after action
dispatch becomes indeterminate and is not retried automatically. Exactly-once
external effects remain dependent on a downstream idempotency or fencing
contract. In particular, authority revalidation and reservation authorize the
local dispatch attempt at that instant; preventing a race with a newer
coordinated authority requires atomic downstream fence validation.

Strict inference-control snapshots contain context, buffered content and
authorization state and are classified as sensitive application data. They are
not telemetry and are not persisted by default. Redacted support projections
cannot be restored as authority.

Inference Control is independent of Agent Mesh. Standalone scopes require no
Mesh dependency. A coordinated action policy requires the complete accepted
Objective, Work Item, lease, assignment epoch and fencing-token binding and
revalidates it at grant consumption.

## Alpha 4 Evidence and Trust boundary

`@agentplat/trust` is a new additive, provider-neutral package. Its browser-safe
root exposes strict local Evidence records, frozen Fusion policies, immutable
state, deterministic Fusion Decisions, multidimensional Trust Profiles,
eligibility, quarantine and recovery. It does not import Mesh or Inference
Control and performs no network, persistence, clock, random, migration,
registration or telemetry work on import.

Mesh and Inference Control integrate only through explicit new subpaths. The
Mesh Trust subpath composes existing signature, admission, replay,
Objective/Work, epoch and fencing state with the local Trust reducer. Existing
Mesh root, loopback and coordination processors do not handle Evidence messages
unless the application constructs the Alpha 4 boundary. The Inference Control
Trust subpath wraps already explicit model, action-dispatcher and
message-dispatcher dependencies; it does not add fields to
`InferenceControlPolicyV1`, change Action Grants or re-export Trust from the
package root.

A signature proves record integrity and key possession, not truth. A Trust
Profile is a local, subject-and-scope projection under one exact policy. There
is no global score. Source independence is supplied by locally configured
dependency groups and cannot be inferred from the number of peer IDs.

Trust may only restrict an explicitly bound adapter. It never creates peer
admission, Objective authority, Work assignment, lease, epoch, fencing token,
permission, Action Grant or trusted Context. Missing, stale, excessively
uncertain or mismatched Trust state is `unavailable`; direct legacy APIs remain
outside the opt-in boundary and receive no Trust-derived authority.

Trust state and snapshots begin at independent schema version `1`. They are not
inserted into existing Mesh or Inference Control snapshots. Full snapshots and
unredacted Fusion Decisions are sensitive application data. Redacted audit
projections are non-restorable.

Mesh wire version remains `0`. Alpha 4 implements the already reserved
`evidence.claim`, `evidence.attest`, `evidence.challenge`, `evidence.retract`
and `trust.observation` discriminants with closed schemas. Older nodes reject
them explicitly; no downgrade or generic extension fallback is introduced.
Remote Trust observations are audit-only in V1 and do not recursively
contribute to Fusion.

Alpha 2 coordination state, discovery projection, inbound replay security state
and Objective/Work projection are separate schema-versioned contracts exposed
only from `@agentplat/mesh/coordination`. They do not extend the closed Alpha 1
peer state, input, effect, root export or loopback contracts. A caller opts into
the composite boundary explicitly and must restore every snapshot through its
strict constructor before use.

The Objective/Work projection is additive schema version `2`. Version `1`
snapshots remain readable: restore derives the recovery grace, witness quorum,
lease bounds and acceptance window from each retained signed Objective
document, then rebinds every Work Item to the canonical migrated policy.
Its composite
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

The Allocation projection is additive schema version `6`. Its strict reader
migrates versions `1`–`5` deterministically and does not change Alpha 1 state
or entrypoints. Version 6 adds bounded recovery witness copies, proposal/vote/
certificate graphs, stable fence heads and checkpoint-resume metadata. Restore
revalidates these relationships and fails closed for an incomplete, conflicting
or stale recovery graph; it does not synthesize replacement authority. The
recovery command API distinguishes locally prepared exact fanout from a single
received authenticated copy: each received copy remains independently
verifiable, without asserting delivery to any other recipient.

## Wire compatibility

The npm package version and wire version are independent.

- Alpha uses `wireVersion: 0`.
- Alpha wire changes require new canonical fixtures and a migration note.
- Alpha 2 witness takeover proposals require
  `candidateConsentProposalId`; candidate-authored proposals forbid it. Older
  takeover proposal fixtures fail closed instead of being reinterpreted.
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
