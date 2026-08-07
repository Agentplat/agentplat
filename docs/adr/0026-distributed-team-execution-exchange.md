# ADR 0026: Team execution exchange uses authenticated causal Mesh extensions

- Status: accepted
- Date: 2026-08-07

## Context

Team execution defines deterministic dispatch, artifact, result and recovery
records, but the runtime is intentionally transport-neutral. Running a team
across peers requires those records to survive retries and partitions without
turning one coordinator into a global scheduler or treating transport delivery
as execution authority.

Adding new core Mesh message types would change the closed wire registry.
Creating a second signature format would duplicate peer identity, audience,
expiry and replay defenses. Applying a remote record before authentication, or
performing an external effect before durable local admission, would make crash
recovery ambiguous.

## Decision

Add the opt-in, browser-safe
`@agentplat/collective-runtime/team-execution-exchange` entry point.

An exchange message is carried in the signed `extensions` field of an ordinary
Mesh envelope and its key is listed in `criticalExtensions`. Receivers extract
it only from a `VerifiedMeshEnvelope` and bind tenant, mesh, objective, sender,
direct recipient and envelope message identity before local membership policy
is evaluated. The core Mesh message registry remains unchanged.

Each sender owns one append-only stream with a sequence and predecessor digest.
Each peer persists independent source heads, an out-of-order pending set, a
ready/handled inbox and a pending/sent outbox behind compare-and-swap storage.
Missing predecessors are fetched through a narrow recovery port that may return
only envelopes already authenticated by the normal Mesh boundary.

External handlers and outbound publishers receive stable message identifiers
and must use them as durable idempotency keys. A crash may repeat a handler or
publisher call, but cannot silently skip it. The exchange transports
coordination records and content references only; Work Contracts, leases,
epochs, fencing tokens and action controls remain authoritative at the effect
boundary.

## Consequences

- Distributed teams can exchange dispatches, artifact availability, results
  and recovery signals without a central transport coordinator.
- Signed Mesh scope and local membership currentness are both required.
- Out-of-order delivery is retained within explicit local bounds and converges
  when the exact predecessor arrives.
- Availability fails closed when authentication, membership, causal history,
  capacity or artifact availability cannot be established.
- Applications must provide durable CAS storage, an idempotent Mesh signer and
  outbox, membership decisions, artifact storage and idempotent handlers.

## Alternatives considered

### Extend the closed Mesh message registry

Rejected for V1 because it would couple an additive collective-runtime feature
to a wire-version change. A future negotiated core payload can replace the
extension without changing the exchange record or state machine.

### Accept signed-but-unverified envelopes

Rejected because type branding and proof verification are the boundary between
untrusted transport bytes and authenticated peer data.

### Deliver directly from transport callbacks

Rejected because process failure between the effect and acknowledgement would
lose or duplicate work without a durable replay point.
