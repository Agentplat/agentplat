# ADR 0016: Adaptive role realignment is proposal-separated and certificate-gated

## Status

Accepted for V1 implementation.

## Context

Continuous Role Alignment can retain longitudinal evidence, fence protected
actions and move a session to `realignment_required`. It deliberately does not
decide which role should replace the current one. Portable Agent Runtime can
accept an exact successor role, while Collective Planning already derives
work-bound adaptive roles. There is no public boundary that discovers a safe
successor, certifies the selection and activates it without manual glue.

Accepting free-form role instructions from a peer, model or assessor would
turn untrusted content into execution context. Treating a selected role as an
assignment or action grant would also collapse the separation between planning
and effect authority.

## Decision

Add an opt-in Adaptive Role Realignment V1 boundary with four distinct stages:

1. A content-free request binds the exact `realignment_required` state, current
   role, objective, authority ceiling and logical lifetime.
2. Proposers may name trusted role-definition digests only. They cannot supply
   instructions, constraints, credentials or executable content.
3. Local evaluators resolve those definitions from an application-owned role
   catalog, reject authority widening, and score eligible candidates with
   deterministic integer basis points. Selection is stable and replayable.
4. An application-provided certification port binds the exact request,
   candidate, definition, evaluation set and selection. The built-in
   Collective Quorum adapter requires a current Byzantine-resilient agreement
   certificate before activation.

Activation constructs only the exact next Portable Agent role revision. It
updates Runtime before advancing alignment state. If the second write fails,
the existing role-alignment controller observes the exact successor on the next
control point and completes the transition. A failed Runtime update never
advances alignment state.

The pure contracts and reducer live under
`@agentplat/inference-control/role-realignment`. Portable Agent orchestration is
an explicit adapter subpath. Byzantine agreement integration lives under
`@agentplat/collective-quorum/role-realignment`; importing existing roots does
not enable it.

## Authority boundary

- A role definition is alignment context, never a Work assignment, action
  grant, lease, permit or fencing token.
- The authority ceiling is copied from current locally accepted authority.
  Candidate requirements must be subsets and cannot extend validity or budget.
- Dynamic free-form role synthesis is not accepted in V1. Later refinement may
  propose new catalog revisions through a separate review boundary.
- A certificate proves agreement over a bounded value. It does not prove that
  the role is semantically safe or authorize an external effect.

## Consequences

- A session can recover from detected drift without a human supplying the next
  role binding.
- Peer or model proposals remain ordinary data until local catalog resolution,
  evaluation and certificate verification all succeed.
- Applications must operate a trusted role catalog and semantic agreement port.
- Multi-store activation is recoverable and fail-closed, but is not claimed to
  be one distributed atomic transaction.
- Existing Runtime, Inference Control, Planning, Trust and Quorum behavior is
  unchanged unless applications construct the new adapters.

## Alternatives considered

### Let the alignment assessor rewrite the role

Rejected because assessment and authority would share one compromise domain.

### Accept peer-supplied instructions after quorum agreement

Rejected because agreement among peers does not make untrusted instructions
safe or grant them local policy authority.

### Reset the session after drift

Rejected because reset loses causal evidence and makes realignment an adverse
history erasure mechanism.
