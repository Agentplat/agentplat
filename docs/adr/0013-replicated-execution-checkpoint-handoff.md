# ADR 0013: Replicated execution checkpoint handoff

## Status

Accepted.

## Context

The collective runtime can fence an expired assignee, certify a recovery
decision and name the last accepted checkpoint in the replacement award. The
portable runtime can checkpoint and restore a session on one host. These two
capabilities do not yet compose: a replacement can receive authority while the
checkpoint application state remains reachable only through the failed host's
content/session adapter.

Planning-artifact availability does not solve this boundary. Plans and
execution state have different authority, privacy, compatibility and lifecycle
requirements. A planning fragment may be broadly replicated inside its policy
domain; an execution checkpoint may contain adapter-owned application state
and must be transferred only through an explicit export policy.

## Decision

AgentPlat will provide an opt-in replicated execution checkpoint handoff
capability with these boundaries.

### Portable transfer boundary

The portable session adapter gains optional checkpoint export and import
operations. Export returns JSON-safe adapter state plus an explicit content
classification. Import binds that state to a target session and returns a new
local checkpoint reference. The runtime validates exact adapter identity,
version, implementation, state digest and step sequence before committing the
target snapshot.

Credentials, private keys, provider tokens, hidden reasoning, raw prompts and
unclassified opaque process state are prohibited. An adapter that cannot
produce the closed transfer contract remains locally restorable but is not
handoff-capable.

### Certified availability boundary

The publisher creates a signed, content-addressed checkpoint artifact bound to:

- tenant, mesh and policy domain;
- source peer and process instance;
- current membership epoch and configuration digest;
- objective, Work revision, assignment epoch, authority and fencing token;
- portable adapter identity, version and implementation;
- checkpoint ID, state digest and through-step sequence;
- role and Work Contract digests.

Deterministic current-membership replicas durably store the artifact and return
signed receipts. A publication becomes recoverable only after the configured
artifact threshold and certificate-custody threshold are both met. The
publisher may then emit `work.checkpoint` using the certified content reference.

Resolution is source-first. If the source is unavailable, the requester obtains
a current, valid certificate from selected replicas and fetches the artifact
only from receipt signers. Every signature, scope, membership, expiry, digest,
adapter and authority binding is revalidated locally.

### Runtime handoff boundary

For an initial assignment, execution behavior is unchanged. For a recovery
award naming `resumeCheckpointId`, the replacement must resolve the exact
certified checkpoint before accepting and import it before its first execution
step. Import does not
grant authority: the current Work Contract, assignment confirmation, lease,
continuity binding, role and fence remain the authority gates.

The old assignee cannot import into or resume the replacement session, and a
valid checkpoint cannot weaken current authority. A failed, missing,
incompatible or stale transfer fails closed without sending an acceptance or
executing a step.

### Packaging

Portable contracts and the in-memory/HTTP implementation are published through
`@agentplat/collective-runtime/checkpoints`. PostgreSQL persistence is published
through `@agentplat/collective-sync-postgres/checkpoints`. Both are opt-in and
leave existing entrypoints unchanged.

## Consequences

- Honest crash recovery can continue productively rather than only reassigning
  authority.
- Adapters must explicitly implement a safe transfer format; local checkpoint
  support alone is insufficient.
- Checkpoint availability and assignment authority stay separate and can evolve
  independently.
- Replication adds bounded storage and network cost proportional to the
  configured replica count.
- This decision does not provide Byzantine agreement, arbitrary binary state
  transfer, cross-adapter migration or exactly-once external effects.
