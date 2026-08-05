# Adaptive Role Realignment V1 acceptance checklist

## Architecture

- [x] Proposal, catalog resolution, evaluation, certification and activation are
      separate trust boundaries.
- [x] A role remains context and never becomes Work or effect authority.
- [x] Existing behavior is opt-in and source compatible.
- [x] Public terminology is provider-neutral and industry-standard.

## Contracts and state

- [x] Requests bind an exact `realignment_required` alignment state.
- [x] Proposals are content-free and reference trusted definition digests.
- [x] Definitions and candidates cannot widen authority ceilings.
- [x] Evaluations bind identity, candidate, definition and lifetime.
- [x] Selection is deterministic over the complete eligible candidate set.
- [x] State is CAS-safe, causal, bounded and replay-validatable.

## Certification and activation

- [x] Certification binds request, selection, candidate and definition.
- [x] The agreement adapter verifies current membership and Byzantine quorum.
- [x] Trust eligibility can restrict proposal or evaluator participation.
- [x] Activation creates only the exact successor role revision.
- [x] Runtime-first partial activation is recoverable and fail-closed.
- [x] Alignment history survives successful realignment.

## Continuity and security

- [x] In-flight state survives exact checkpoint handoff.
- [x] Expiry, replay, substitution and observer failure fail closed.
- [x] Peer content cannot become role instructions.
- [x] Certificate and digest limitations are documented.

## Delivery

- [x] Example and package documentation cover the complete workflow.
- [x] Focused runtime, agreement, adversarial and contract fixtures pass.
- [x] Workspace types, public audit, release verification and pack smoke pass.
- [x] A review-ready pull request contains only this objective.
