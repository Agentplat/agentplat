# ADR 0054: explicit resolution of a superseded Morphogenesis execution

Status: implemented, opt-in preview. Historical evidence remains versioned.

## Problem

Morphology-head CAS selects one successor but does not roll back Team or Work
effects of another admitted proposal. The v0.3 paper integration demonstrated
owner cleanup while the losing V1 execution remained `committing_morphology`.
A timeout or a later head alone cannot establish that a proposal never committed.

## Decision

`beginSupersededResolution` reads the authoritative head through the optional
`inspectHead` activation port. It admits only `team_active` or
`committing_morphology`, with no retained activation receipt, and a different
proposal at exactly expected epoch + 1 in the same scope. The observed head is
persisted in an immutable supersession binding by execution CAS. Legacy ports
without inspection fail closed. Later epochs require historical proof outside
this API; the coordinator does not guess.

`advanceSupersededResolution` reuses the existing owner pipeline: checkpoint,
fence authority, drain/detach or retire, release budget, then `superseded`.
Uncertain effects keep their prepared operation identity and reconcile through
the original owner. Missing evidence blocks progress. Cleanup never modifies the
accepted head. The terminal supersession receipt is distinct from a normal
activation/completion receipt, and `complete` refuses supersession executions.

The workflow compensation adapter opts into this exact loser-specific path.
It is not a generic pre-Team cancellation or post-commit rollback facility.
Room projection is optional, tenant-scoped and grants no authority.

## Compatibility and obligations

The execution schema version remains 1; supersession fields are absent from
legacy records so their canonical digests do not change. New phases are emitted
only by the opt-in API. Exhaustive TypeScript consumers must accommodate
`superseding` and `superseded`; use `isMorphogenesisExecutionTerminalV1` when both
successful completion and compensated loss are terminal for the application.
This addition requires a new coordinated preview package release.

Owners still authenticate, deduplicate stable operation IDs, prevent new work
once fenced, and wait for admitted work to drain. The optional original
`fencedAtLogicalMs` result preserves receipt identity across delayed reconciliation;
omission retains legacy behavior. A receipt is evidence, not an authority grant.

## Validation

`tests/morphogenesis-supersession.test.mjs` covers recruitment and creation,
lost acknowledgements, concurrent resolution, ambiguous histories, unavailable
owners, forged receipts, legacy record digests and authority-neutral projection.
`examples/agent-morphogenesis/persistent-local.mjs` exercises real PostgreSQL,
Room approval, Team and Work reducers, head contention and pending work.
Its catalog/membership and reviewers are fixtures; its rollback witness is
process-local. These results are not independent-host recovery evidence.
The bounded TLA+ abstraction under `experiments/morphogenesis-paper/model` is
separate evidence, not a refinement proof of this implementation.
