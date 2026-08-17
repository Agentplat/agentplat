# Controlled-emergence control plane V1

This document describes the open-core control seams that connect collective
coordination, local inference policy, approval checkpoints, and bounded trust
propagation. The interfaces are provider-neutral and do not grant a
collective decision authority that was not already present in a local policy.

## Control path

1. A validated collective decision is projected through
   `projectCollectiveDecisionToInferencePolicyV1`.
2. The projection intersects context zones, actions, and message channels with
   the local baseline policy and reduces applicable TTLs.
3. The autonomous mission loop evaluates an optional
   `ApprovalCheckpointPolicyV1` before planning and execution. Missing approval
   infrastructure is fail-closed for deferred and required modes.
4. Content crossing agent boundaries can use `PropagatedContentV1`, whose
   content-bound hop chain and forwarding budget make provenance and replay
   checks explicit. Quarantined content cannot be forwarded when policy blocks
   it.

## Safety invariants

- A collective projection can only narrow a validated local policy.
- An expired decision or lease cannot produce an active projection.
- Approval policy is explicit, digest-bound, and independently injectable.
- Notification mode remains executable; deferred and required modes preserve a
  pending outcome when approval is unavailable.
- Propagation envelopes are immutable-by-convention, digest chained, bounded,
  and fail closed when their hop or forwarding budget is exhausted.

The contracts are transport-neutral. Deployments remain responsible for
persisting approval decisions, enforcing effect-time authorization, and
providing the authority that certifies collective decisions.
