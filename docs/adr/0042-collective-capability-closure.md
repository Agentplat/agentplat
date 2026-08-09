# ADR 0042: Collective capability closure

- Status: Accepted
- Date: 2026-08-07

## Context

Collective operation needs a coherent boundary from local peer communication
through mission planning, evidence fusion, allocation, team activation,
recovery, control assessment and heterogeneous execution. Individual modules
must remain independently deployable, but their composition cannot let a
proposal, certificate, score, allocation, or model result become execution
authority.

## Decision

The platform composes eight provider-neutral capabilities through explicit
ports and digest-bound records:

1. Operational Sparse Peer Plane V1 maintains bounded local peer views and
   dissemination; it has no global membership oracle or graph scheduler.
2. Autonomous Mission Planning Loop V1 derives local planning and re-planning
   inputs from admitted evidence and current Work state. Its durable state and
   independently protected monotonic anchor advance as one CAS; a missing or
   divergent pair fails closed and is never reconstructed from the snapshot.
3. Certified Context Fusion V1 accepts bounded Trust fusion, profile and
   eligibility projections, authenticates their mission-scope binding, and
   emits a certified planning context or an unresolved result.
4. Distributed Team Allocation V2 advances a durable allocation saga from
   planning positions through admitted mechanism events, a certified roster
   decision, team formation and activation. The exact decision record is
   retained and reauthenticated before formation and activation; a canonical
   authorization digest binds it to the exact allocation-state/auction/round
   fence, allocation plan and persisted formation command. An explicit effect
   boundary atomically consumes that fence and supports idempotent activation
   reconciliation and cancellation after crashes or plan advancement. Formed
   members must correspond one-to-one to the retained plan-derived bids, with
   canonical initial team/member/selection identities. A durable formation
   committed before a coordinator crash is reconciled from the current Team
   proposal by exact request and proposal digest. `lastDecision` is only a
   direct-response comparison aid when there is no Team proposal to reconcile,
   since another request can overwrite it without terminating the Team. Cleanup
   uses proposal-conditional CAS cancellation and cannot cancel a replacement
   Team. A durable request tombstone, bound to formation authorization and
   request validity, is committed before authorization clearing or withdrawal;
   `form()` checks it inside its creation CAS. Unexpired tombstones survive
   handoff, expired entries compact only below the logical-time high-water, and
   exhausted capacity fails closed. Activation cleanup revokes the exact
   activation-boundary contract, invalidates the request, then closes the exact
   Formation Team. A rejection or expired activation results in cancellation
   where necessary, an authenticated withdrawal and another allocation round.
5. Compromise-Aware Recovery V1 requires a verified compromise verdict,
   rotates the assignment fence, certifies a takeover and then selects an
   exact checkpoint restore, reauction or replanning path. A crash-replayed
   sparse exclusion recognizes the exact already-applied certificate before
   rejecting the original expected revision and retains the original receipt.
6. Semantic Alignment & Agility Control V1 evaluates bounded control signals;
   an adverse, malformed, unbound or unresolved result restricts dispatch or
   requests adaptation. An allow becomes effect-usable only through an
   authenticated receipt lookup bound to the current policy, assessor set,
   consumer, exact sink identity/key, full action target, state revision and
   expiry. Portable
   heterogeneous actions cross the composed action gateway, which also proves
   the exact portable step/proposal was durably committed, rather than using a
   provider proposal or a pre-commit receipt as authority. Both direct and
   portable dispatch require an authenticated effect sink that atomically keys
   the effect by authorization digest and returns the original receipt on an
   exact retry. All replicas of that authorized sink identity share one atomic
   idempotency store. Direct-dispatch and gateway effect time comes from a
   trusted monotonic source independent of request logical time.
7. Coordination-Control Guarantee Contract V1 intersects verified local
   guarantees with planning targets and emits an enforceable allow/deny gate
   plus a bounded effective planning window. Projection into team execution
   requires an authenticated durable delivery receipt and a locally configured
   control identity; a caller-supplied proposal digest is not authorization.
8. Heterogeneous Agent Composition V1 binds provider-specific agents behind
   portable execution, assessment and intervention ports; adapter output is
   never authority by itself.

## Operational extension

The public composition also includes the concrete runtime surfaces needed to
operate those contracts without introducing a central coordinator:

- an authenticated, causal, content-addressed collective message protocol with
  durable at-least-once delivery;
- message-driven decomposition, bid commitment/reveal, allocation and
  settlement;
- persistent sparse round/view agreement, shard reconciliation, equivocation
  evidence and finality assembly;
- deterministic committee convergence from bounded partial validator views;
- black-box and representation-aware cognitive adapters, including a bounded
  local chat-completions HTTP port;
- an assurance-coupled execution boundary that measures the actual result and
  certifies the exact proposed effect before idempotent commit;
- sustained mission, strategy, role and team adaptation with diversity,
  hysteresis, safety review, finality and compensating rollback;
- PostgreSQL state/artifact adapters and WebCrypto Ed25519 ports; and
- a versioned interoperability SDK for portable agents and simulation
  environments with handshake, signed envelopes, idempotency and checkpoint
  transfer;
- an authenticated overlay envelope bound to current membership epoch, key,
  sequence and payload, with explicit rotation windows and rollback-resistant
  replay state;
- governed agent creation with attenuated parent authority, budget and quota
  reservation, key custody and attestation;
- anytime-valid semantic guarantees that directly shorten, replan or stop the
  protected execution horizon;
- signed content-free operational telemetry emitted after durable host
  transitions; and
- an executable pre-effect invariant guard for finality uniqueness, authority,
  budget conservation, lineage attenuation and monotonic coordinates.

Every durable coordinator uses immutable records, canonical digests,
revision-based compare-and-set, stable operation identifiers and logical-time
high-waters. Current Work Contracts, assignments, leases, authority epochs and
fencing tokens remain the only execution-authority path. Certified decision
and allocation records remain coordination data until the existing authority
boundaries validate an activation or action.
Certified context is likewise projected into planning only after an opaque
resolution handle is resolved at the current head and its exact collective
certificate is reauthenticated at the use boundary.

## Consequences

- Production deployments must supply authenticated ingress, certificate and
  membership verification, durable CAS storage, monotonic rollback witnesses
  where required, trusted logical time, current Work Contract lookup, and
  idempotent/fenced effect sinks.
- Ports are provider-neutral. Concrete PostgreSQL, WebCrypto, HTTP inference
  and interoperability adapters are supplied, while deployments still own
  identity policy, key custody, endpoint behavior and liveness. Authenticated
  transport and operational telemetry reference implementations are supplied,
  while deployments still own their authoritative membership/key sources and
  durable signing material.
- Missing, stale, conflicting, unauthenticated, capacity-exhausted or
  rollback-detected inputs fail closed. The normal result is deny, pause,
  abstain, recovery-required, or replanning-required rather than a best-effort
  continuation.
- The composition intentionally provides neither a central scheduler nor a
  global topology/plan graph. Each peer acts from bounded local state and
  admitted records.

## Non-goals

This decision does not guarantee global optimality, availability during a
partition, truthful self-reported capability, collusion resistance, semantic
correctness of a model, universal compromise detection, atomic rollback of an
external effect, or the behavior and availability of any deployed provider,
model, database, transport or simulator endpoint.
