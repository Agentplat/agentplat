# ADR 0014: Byzantine-resilient collective agreement

- Status: accepted
- Date: 2026-08-04

## Context

The existing distributed peer quorum deliberately assumes authenticated,
non-malicious acceptors. Majority intersection protects assignment and recovery
decisions from crashes, retries, reordering and minority partitions, but it does
not make a safety claim when admitted validators sign conflicting values.

Planning heads, recovery choices, assignment confirmations, synchronization
watermarks and validator-set changes need an optional stronger boundary for
deployments whose fault model includes compromised or arbitrarily faulty peers.
That boundary must preserve the current APIs and defaults for deployments that
only need the existing crash-fault protocol.

## Decision

Add an opt-in `@agentplat/collective-quorum/agreement` entry point implementing
round-based signed agreement over canonical values.

### Membership and thresholds

Each coordinate binds the policy domain, semantic slot, height, round,
membership epoch and membership configuration digest. A validator set declares
`f`, contains exactly `3f + 1` sorted unique identities and commits only with
`2f + 1` distinct valid signatures. Validator peer, instance and key identities
are bound together for the epoch.

### Round protocol

The deterministic proposer for `(height, round)` sends one signed proposal.
Eligible validators produce at most one durable prevote and one durable
precommit for that coordinate. A `2f + 1` prevote certificate permits
precommit; a `2f + 1` precommit certificate commits the exact value.

Validators persist their highest round and lock `(round, valueDigest)` before
returning a precommit. A higher-round proposal for a different value is accepted
only when it carries a verified prevote certificate at or above the stored lock.
The repository callback creates a signature inside the same serialized or
transactional decision that checks prior state, so concurrent requests cannot
induce a correct validator to double-sign.

The protocol claims safety with at most `f` Byzantine validators. Progress
requires eventual message delivery, an eventually responsive correct proposer
and at least `2f + 1` responsive validators. Timeout choice and proposer routing
remain deployment concerns; no wall-clock timeout is treated as a certificate.

### Certificates and history

Proposal values are canonical JSON and carry a SHA-256 digest. Vote and commit
certificates retain the signed source envelopes, membership coordinate and
certificate digest. Consecutive values bind the previous commit digest.
Catch-up bundles are bounded ordered sequences whose signatures, membership
bindings, heights and hash chain are verified before storage.

Live admission checks envelope expiry and current key-revocation state.
Historical verification checks that a signature was issued during the key's
valid, pre-revocation interval, so subsequent key rotation does not erase
already committed proof.

### Membership changes

A membership reconfiguration becomes eligible for activation only after the
same value receives a valid commit certificate from both the prior and next
validator sets. The joint certificate binds both full memberships, both quorum
proofs and the activation height. Removal or key rotation cannot therefore be
made authoritative by only one side of the transition.

### Equivocation

Two valid signed votes by the same validator for conflicting proposal/value
coordinates form a portable equivocation proof. The agreement package can map
that proof to an ordinary Trust evidence claim. Trust policy, rather than the
protocol, decides whether the evidence restricts or quarantines a peer.

### Integration and compatibility

The agreement value kinds cover application decisions, assignment
confirmation, recovery selection, planning-slot heads, synchronization
watermarks and membership reconfiguration. Runtime adapters are explicit and
remain disabled unless installed. The existing `@agentplat/collective-quorum`
root entry point, wire protocol, PostgreSQL tables and runtime defaults are not
changed.

## Consequences

- Safety now has an explicit adversary threshold and auditable proof material.
- A seven-validator deployment can continue with two unavailable or faulty
  participants after synchrony is restored.
- Every validator must durably preserve vote and lock state before responding.
- Operational cost is two all-validator exchanges per successful round plus a
  best-effort commit broadcast.
- Applications still define semantic validity; signatures establish agreement,
  not correctness of an application payload.

## Alternatives considered

### Strengthen the existing majority protocol in place

Rejected because it would silently change its fault model, messages and durable
state while risking compatibility for current users.

### Treat a high signature count as agreement

Rejected because signatures without round, lock and double-vote rules do not
prevent conflicting certificates across partitions or proposer changes.

### Depend on one external consensus service

Rejected as the only open-source path. An application may still route the
decision port to an external implementation, but the portable contracts,
verification and reference repositories remain available without a centralized
service.
