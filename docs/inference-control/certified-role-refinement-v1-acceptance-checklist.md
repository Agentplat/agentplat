# Certified Role Refinement V1 acceptance checklist

## Design and public surface

- [x] ADR, threat model, implementation plan and guide are public.
- [x] Core and Portable Agent subpaths export provider-neutral V1 contracts.
- [x] Collective certification exports a dedicated public subpath.
- [x] Public files use only industry terminology.

## Patch and authority safety

- [x] Exact predecessor identity, revision and digest are required.
- [x] Patch operations are canonical, bounded and deterministic.
- [x] Stale expected instruction/value digests are rejected.
- [x] Constraint removal and duplicate operation targets are rejected.
- [x] Role identity cannot change and revision increments by exactly one.
- [x] Capabilities, resources, action budget and validity cannot widen.
- [x] A positive local semantic decision is required before admission.

## Selection and certification

- [x] Durable coordination state contains no role instructions or constraints.
- [x] Proposers, evaluators and witnesses require valid Trust decisions.
- [x] Selection is deterministic over the complete eligible candidate set.
- [x] Collective certification binds predecessor, patch, definition, selection,
      authority ceiling, membership epoch and source certificate.
- [x] Trust filtering never reduces the Byzantine quorum requirement.

## Publication and activation

- [x] Exact draft content is resolved from a local durable repository.
- [x] Catalog publication uses compare-and-swap and is idempotent.
- [x] Runtime and Role Alignment activate only the exact published definition.
- [x] Partial publication/activation recovers safely after restart.
- [x] Restart rejects substituted selection, publication, activation or rollback
      identifiers before any external effect.

## Monitoring, rollback and handoff

- [x] Provisional revisions require bounded post-activation observations.
- [x] Valid observations can confirm a revision.
- [x] Hard violations and sustained degradation require rollback.
- [x] Rollback is certified, restores the exact predecessor and quarantines the
      refined definition.
- [x] Expired rollback certificates require fresh certification before any
      restoration effect.
- [x] A crash after catalog quarantine resumes from the durable rolled-back
      state and closes the terminal transition idempotently.
- [x] Monitoring and rollback lineage survive restart and session handoff.
- [x] Observer failures cannot affect enforcement state.

## Delivery

- [x] Functional and adversarial tests cover the complete lifecycle.
- [x] The executable example confirms a healthy refinement and a rollback path.
- [x] Build, type checks, public audit, package verification and full checks pass.
- [x] A review-ready PR contains only the scoped objective.
