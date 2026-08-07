# Distributed Team Execution Exchange V1 implementation plan

Status: implemented

## Product outcome

Carry team dispatches, reference-only artifact availability, results and exact
recovery signals between authenticated peers while preserving local policy,
causal order and progress across bounded network partitions.

## Public package shape

`@agentplat/collective-runtime/team-execution-exchange` contains:

- exact policy, identity, recipient, message, causal-head, inbox, outbox and
  state contracts;
- four payload kinds: `dispatch`, `artifact_available`, `result` and
  `recovery`;
- canonical content addressing and prototype-safe validators;
- a critical Mesh extension adapter that consumes only verified envelopes;
- a durable compare-and-swap runtime with causal admission, deduplication,
  bounded reordering, inbox handling, outbox delivery and predecessor repair;
- coordinator and member bridges for the existing team-execution runtime; and
- an in-memory CAS store for deterministic simulation.

The package contains no provider SDK, network client, private key, global
scheduler, artifact bytes, credential store, tool executor or new authority.

## Message and trust boundary

The domain message binds its scope, policy, execution and team epochs,
membership configuration, sender member binding, direct recipient, payload
digest, logical validity window, stream sequence and predecessor digest.
Its `messageId` uses Mesh's canonical 128-bit base64url representation so the
same identifier is valid at both domain and signed-envelope boundaries.

The complete message is embedded under
`agentplat.team-execution-exchange.v1` in a Mesh envelope. That key must also be
critical. Admission requires:

1. a `VerifiedMeshEnvelope` from the ordinary Mesh verifier;
2. exact envelope-to-message binding for message identity, tenant, mesh,
   sender, direct audience and objective when the core payload carries one;
3. local scope, policy and recipient binding;
4. local logical-time and TTL bounds; and
5. a current local membership decision matching the sender member, instance,
   epoch, configuration and binding digest.

Signed transport data is necessary but does not grant membership, work or
effect authority.

## Causal delivery and partition repair

Each `(streamId, senderPeerId, senderInstanceId)` has an independent head.
Sequence one has no predecessor; every later record names the exact previous
message digest. The runtime:

- rejects stale heads, forks and sequence equivocation;
- returns exact duplicates without repeating admission;
- retains future records in a bounded pending set;
- moves a complete successor chain to `ready` as soon as its predecessor is
  admitted;
- calls handlers in causal inbox order and marks them `handled` with CAS; and
- fetches only the bounded missing interval through a recovery port whose
  output is passed through normal verified admission.

Handlers and outbound publishers must durably deduplicate `messageId`. A crash
after an external call but before CAS intentionally causes a safe retry.

## Execution integration

The member bridge resolves every dependency artifact by digest, checks local
availability, executes through the existing `TeamMemberExecutionPortV1`,
publishes result artifacts and responds with availability announcements before
the result.

The coordinator bridge checks announced and result artifact availability and
then calls the existing exact `settleStep()` boundary. Recovery signals remain
inputs to application-owned team reconfiguration. Neither bridge executes
tools or bypasses individual Work Contract, lease, fence or action controls.

## Completion criteria

- the public subpath builds and packs independently;
- envelope rebinding, expired messages and stale membership fail closed;
- message-id and same-sequence equivocation fail closed;
- replay is idempotent;
- out-of-order messages drain in exact predecessor order;
- a partition can recover a bounded missing interval;
- coordinator and member adapters retain reference-only execution semantics;
- all state and queues are locally bounded; and
- workspace build, type, unit, terminology and packed-consumer checks pass.
