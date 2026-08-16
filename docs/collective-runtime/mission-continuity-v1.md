# Governed mission continuity v1

The open-core now exposes provider-neutral contracts for long-running mission continuity.

- `@agentplat/collective-control/mandate-continuity` models renewal and attenuation as monotonic mandate transitions. Renewal can extend validity; attenuation cannot broaden subjects, capabilities, budgets, or authority.
- `@agentplat/collective-planning/mission-continuity` models immutable plan branches, evidence-backed branch selection, activation, rollback, abandonment, and expiry with epoch and lineage digests.
- `@agentplat/collective-runtime/mission-continuity-disposition` models checkpoint rollback and safe abandonment, including explicit effect revocation receipts.

Transitions bind mission, objective, mandate/plan predecessor, checkpoint, evidence, approval policy, epoch, and resulting digest. Branches are immutable and activation is explicit. Rollback and abandonment advance the epoch so stale authority cannot be reused; every revoked effect is represented by an auditable receipt.
