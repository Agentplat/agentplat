# Dynamic organizational topology v1

The open-core exposes a deterministic, evidence-backed seam for reorganizing a collective while preserving epoch and lineage continuity.

## Public surfaces

- `@agentplat/collective-membership/coordinator-election` provides min-hash coordinator selection, replacement terms, voter quorum, and transition verification.
- `@agentplat/collective-runtime/team-topology-transformation` models split, merge, and federation requests with versioned topology state and predecessor lineage.
- `@agentplat/collective-runtime/topology-governance` validates authority concentration and coordinates prepare, activate, and rollback receipts.

Every accepted transition binds the previous topology digest, next epoch, member set, policy, evidence digest, and strategy identity. Activation is two-phase: a proposal must pass evidence and authority gates before it can become active; failed activation can be rolled back only with a receipt bound to the prepared transition.

The implementation is intentionally provider-neutral. Durable storage, authenticated transport, and external key custody remain environment boundaries, while the state transitions and validation rules are library-owned and reproducible.
