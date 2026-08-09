# ADR 0037: Governed adaptive sparse overlay

## Status

Accepted.

## Decision

The mesh provides an opt-in adaptive overlay runtime for changing one peer's sparse routing view from content-free health or policy signals. A signal is authenticated evidence, not authority. It is admissible only after a caller-supplied verifier accepts it; a view changes only after a current, policy-bound certificate reaches the configured threshold of independent observer groups.

Every signal, proposal, certificate, and application binds the overlay identity, local peer index, membership digest, sparse-profile digest, current view digest, and topology revision. Signals expire. Durable state advances with compare-and-swap and monotonic logical time. The state binds the locally installed policy digest; neither a proposal nor a remote certificate may introduce its own quorum policy. A conflicting signal, proposal, or certificate is recorded as equivocation and does not select a topology.

The proposal only supplies a bounded list of excluded peer indexes. Application regenerates the local view deterministically through the existing sparse-overlay constructor, using the local topology seed and a revision increment. It does not receive or retain a global graph. The closed profiles retain their existing O(log N) active and reserve neighbor bounds at 500, 5,000, and 100,000 peers.

Partition reconciliation accepts a structurally valid certificate only when its binding and policy are still local and current, its same-position signal/observer/group tuples cover the exact proposal evidence, and the external certificate verifier authenticates those endorsements. Equal certificates are idempotent. Future-dated, equivocal, or earlier-revision evidence is rejected without rollback.

## Consequences

Deployments provide durable atomic CAS storage, atomically advance its external monotonic head, install policy locally, and authenticate observations and certificate endorsements with deployment-appropriate keys. The in-memory store is only a composition aid. Membership management remains external: applications compute and bind a membership digest before requesting overlay adaptation. Neither health signals nor observer reports grant membership, execution, or policy authority.
