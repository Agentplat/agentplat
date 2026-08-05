# ADR 0017: Certified role refinement

## Status

Accepted for V1 implementation.

## Context

Continuous Role Alignment can identify persistent role mismatch and Adaptive
Role Realignment can activate an exact successor from a trusted catalog. Those
controls intentionally reject free-form role synthesis. A long-running agent
can therefore exhaust all suitable catalog entries when its objective,
available evidence or operating context changes in a way that was not known
when the catalog was authored.

A refinement mechanism must not turn model output into executable authority.
It must preserve the current mandate, keep every proposal below the active
authority ceiling, expose an exact reviewable change, require independent
evaluation and collective certification, and retain a safe predecessor for
rollback.

## Decision

Agentplat will add **Certified Role Refinement V1** with the following trust
boundaries:

1. A refinement strategy may produce a structured patch, but the patch is
   untrusted data.
2. The local node deterministically applies the patch to an exact predecessor
   role definition and rejects ambiguous or stale edits.
3. A local semantic validator must attest that the new instructions remain
   within the objective and that constraint replacements are not weaker.
4. Authority can only remain equal or narrow. A patch cannot add capabilities,
   resources or action budget, extend validity, change the role key, skip a
   revision, or detach from its predecessor.
5. Durable coordination state stores only identifiers and digests. Exact
   instructions and constraints remain in a local draft repository.
6. Independent Trust-eligible evaluators score eligible drafts. Selection is
   deterministic over the complete eligible set.
7. A Byzantine-resilient collective agreement certifies the exact predecessor,
   patch, refined definition, selection and authority ceiling.
8. The trusted catalog publishes the selected definition using compare-and-swap
   against the predecessor revision and digest.
9. Portable Agent Runtime activates only the exact published definition.
   Continuous Role Alignment is updated in the same orchestration cycle.
10. The new revision remains provisional until bounded post-activation
    observations confirm it. A hard violation or sustained degradation requires
    a certified rollback and catalog quarantine.
11. Restart and handoff preserve request, selection, certificate, publication,
    monitoring and rollback lineage. A destination re-resolves all definitions
    and drafts locally before continuing.

## Patch model

V1 accepts only these structured changes:

- instruction insertion, replacement or removal with explicit indices and
  expected instruction digests for destructive edits;
- constraint addition at a previously absent JSON Pointer;
- constraint replacement at an existing JSON Pointer with the expected value
  digest and a positive semantic-strengthening decision;
- authority narrowing expressed as complete sorted subsets of the predecessor
  capability and resource sets plus a non-increasing action budget and validity
  bound.

Constraint removal, role-key changes, arbitrary JSON replacement and direct
catalog writes are not valid V1 operations.

## Consequences

- Novel role revisions can be produced without trusting the generating model.
- Peers agree on digests and lineage rather than distributing prompt content.
- Publication and activation become independently auditable and restart-safe.
- Applications must provide a durable draft repository, governed catalog,
  semantic validator, evaluator set, Trust adapter and certification port.
- Rollback is slower than a purely local undo because it is certified. A host
  may still use existing emergency-stop controls while certification completes.

## Explicit non-goals

- model training, fine-tuning or weight mutation;
- granting new capabilities or resources through refinement;
- weakening or deleting constraints;
- allowing peers to send executable role instructions;
- replacing human or application-owned catalog governance;
- making arbitrary model output authoritative;
- physical deployment or environment-specific control logic.
