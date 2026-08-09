# ADR 0030: Certified collective decision plane

- Status: accepted
- Date: 2026-08-07

## Context

Collective planning, team formation, execution continuity, team structure and
strategy adaptation can each produce high-impact changes. A caller needs one
durable way to bind each proposed change to its authority scope, membership
epoch and content-free payload digest before accepting it. That boundary must
be usable with local certification, trusted evidence, or Byzantine agreement
without making the runtime depend on a particular transport or consensus
implementation.

## Decision

Add the opt-in `@agentplat/collective-runtime/collective-decision` entry point.
It supports six decision kinds: plan fragments, team rosters, execution
takeovers, team structures, role transitions and strategy changes. A closed
policy maps every kind to exactly one certification mode: local, evidence, or
Byzantine agreement. The concrete signed-agreement adapter is exported from
`@agentplat/collective-quorum/collective-decision`.

Candidates carry only identifiers and digests. Their digest binds the scope,
epoch, membership digest and member set, proposer, external payload digest and
logical-time expiry. Certificates repeat those bindings and contain only
immutable evidence references or member attester identifiers. Byzantine
agreement certificates also require the digest of their externally retained
agreement proof; local certificates prohibit one. Evidence certificates may
optionally carry a digest for an externally retained source-aggregation proof.
Policy-owned
trusted-evidence sources and minimum evidence or attester counts are checked
before a certificate may be committed.

The runtime exposes a narrow injected certification port and an atomic
revision-CAS store port. The certification adapter is the authentication and
agreement-proof boundary: it must validate signatures, membership proof and
evidence authenticity before returning a certificate. The decision plane then
revalidates the certificate's immutable bindings and policy restrictions, and
calls the adapter's authentication method, before committing an append-only
accepted head. Restore repeats authentication for every retained certificate.
Acceptance slots are keyed by scope, decision kind and epoch. A slot cannot
accept a different candidate or certificate, and state carries a logical-time
high-water mark to reject rollback. Expired full records compact to permanent
digest-bound tombstones, releasing the active-head budget without reopening an
accepted slot. Policy bounds both active heads and permanent tombstones; the
runtime fails closed before either limit is exceeded. An in-memory CAS store is
provided only for tests and local simulations.

## Consequences

- Certification technology stays replaceable and provider-neutral.
- Decisions fail closed on stale time, scope mismatch, untrusted evidence,
  insufficient agreement, revision conflicts and equivocation.
- The plane retains no decision payloads, model output, credentials, keys or
  effect authority.
- Durable store adapters must preserve CAS semantics and accepted heads within
  their configured policy bounds, state-digest integrity, and a
  rollback-resistant persistence anchor. Restored accepted decisions are
  reverified against the active policy at their original acceptance time.
- When the tombstone limit is reached, durable archival and rotation to a new
  `stateKey` and policy epoch is an external administrative operation. The
  archive and new generation must preserve replay protection for every prior
  slot; tombstones cannot be silently deleted or treated as reusable slots.

## Alternatives considered

Embedding agreement logic in this runtime was rejected because it would couple
every consumer to one consensus protocol and create a dependency cycle.
Delegating safety entirely to downstream subsystem stores was rejected because
cross-domain decisions would have inconsistent membership and rollback rules.

See the [threat
model](../security/certified-collective-decision-plane-threat-model.md).
