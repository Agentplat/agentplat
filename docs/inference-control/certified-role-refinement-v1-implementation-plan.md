# Certified Role Refinement V1 implementation plan

## Objective

Close the controlled adaptation loop from longitudinal alignment evidence to an
exact, certified and reversible role revision without expanding authority.

## Public package surface

`@agentplat/inference-control/role-refinement` owns:

- policy, request, evidence summary and authority contracts;
- structured instruction and constraint patch contracts;
- local proposal and content-free admitted-candidate contracts;
- deterministic materialization, evaluation, selection and state transitions;
- publication, activation, monitoring, rollback and quarantine records;
- full-state validation and causal digests.

`@agentplat/inference-control/role-refinement/portable-agent` owns:

- refinement strategy, semantic validator and evaluator ports;
- durable draft repository and governed catalog ports;
- Trust, certification, runtime, state-store and observer ports;
- restart-safe orchestration and handoff.

`@agentplat/collective-quorum/role-refinement` owns:

- collective certification for publication and rollback;
- peer-side semantic validation for `role_refinement` agreement values;
- cryptographic verification of commit certificates and Trust-eligible witness
  filtering without weakening the underlying Byzantine quorum.

## Lifecycle

1. Read the Portable Agent session, exact predecessor definition and current
   role-alignment state.
2. Create a request bound to the objective, alignment state, predecessor,
   authority ceiling and evidence summary.
3. Ask bounded refinement strategies for structured patches.
4. Apply each patch deterministically and reject stale or ambiguous edits.
5. Run local semantic validation and authority checks.
6. Store exact patch and definition in the local durable draft repository.
7. Admit only content-free candidate metadata into reducer state.
8. Collect independent, Trust-eligible evaluations.
9. Select the winning candidate deterministically.
10. Obtain an exact collective publication certificate.
11. Publish using catalog compare-and-swap against the predecessor.
12. Activate the exact published definition in Runtime and Role Alignment.
13. Record bounded post-activation observations.
14. Confirm the revision when thresholds are satisfied.
15. On hard violation, sustained degradation or monitoring expiry, obtain a
    rollback certificate, restore the predecessor and quarantine the revision.

## Determinism and canonicalization

- IDs, reason codes and evidence references are bounded and sorted.
- Patch operations use canonical JSON Pointer paths and unique targets.
- Destructive edits include expected digests.
- Instruction edits are applied in deterministic descending index order after
  validation against the unmodified predecessor.
- Constraint edits are applied in sorted pointer order.
- Candidate aggregates use integer basis-point arithmetic.
- Ties break by candidate digest.
- Every transition increments revision by exactly one and emits a causal event.

## Publication guarantees

- Definition ID, catalog ID and role key remain equal to the predecessor.
- Definition revision is exactly predecessor revision plus one.
- `predecessorDefinitionDigest` is exact.
- Capability/resource sets are subsets of the predecessor and authority ceiling.
- Action budget and validity never increase.
- Publication is idempotent for the same certificate and definition digest.
- A competing successor at the expected revision causes a conflict.

## Monitoring and rollback

- A newly activated revision is provisional.
- Observations bind the activation, evaluator, Trust decision and lifetime.
- Confirmation requires the configured independent observation count, minimum
  coherence and contribution, and maximum uncertainty.
- Any hard violation makes rollback immediately eligible.
- Sustained results below rollback thresholds make rollback eligible.
- Rollback is certified, restores the exact predecessor, and quarantines the
  refined digest so it cannot be reused.
- An expired rollback certificate re-enters the certification barrier; only a
  commit newer than that transition can authorize restoration.

## Handoff and restart

- State persistence uses revision compare-and-swap.
- Selection, publication, activation and rollback IDs are bound by the request
  digest and cannot be changed during resume.
- Draft and catalog ports are durable application boundaries.
- Runtime-first or publication-first partial effects are detected and resumed
  idempotently.
- Handoff binds the Portable Agent checkpoint transfer digest and atomically
  moves state to the target session.
- The destination resolves and revalidates predecessor, draft and published
  definitions locally before accepting state.

## Delivery sequence

1. Freeze ADR, threat model and acceptance checklist.
2. Implement core contracts, canonical patching and reducer.
3. Implement Portable Agent ports, in-memory reference stores and orchestrator.
4. Implement collective certification and semantic agreement adapter.
5. Add public subpaths, executable example and package documentation.
6. Add functional, adversarial, restart, handoff, rollback and public-contract
   tests.
7. Run build, type checks, public audit, package verification and full checks.
