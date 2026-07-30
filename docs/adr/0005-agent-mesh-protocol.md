# ADR 0005: Agent Mesh uses bounded signed envelopes

- Status: Accepted
- Date: 2026-07-29

## Context

Application events and SSE envelopes do not provide peer identity, audience
binding, expiry, replay protection or message-level authorization. Reusing them
as a peer protocol would make malformed or stale input indistinguishable from
accepted domain events.

The protocol must be transport-neutral, deterministic to serialize, safe to
parse under explicit limits and honest about delivery behavior.

## Decision

Create `@agentplat/mesh-protocol` for wire contracts, strict parsers, schemas,
message authority and conformance fixtures. Create `@agentplat/mesh-crypto` for
reference hashing and signature implementations.

Alpha releases use `wireVersion: 0`. The first beta freezes `wireVersion: 1`
after canonical fixtures and compatibility tests are stable.

Every envelope binds:

- protocol and wire version;
- tenant, mesh and optional objective;
- message ID, sender, instance and audience;
- sender sequence, issue time and expiry;
- message type and payload digest;
- key ID, signature algorithm and signature;
- correlation, causation and declared extensions.

Audience is an explicit direct peer or Mesh topic. Protocol v0 performs bounded
sender fanout but no transitive envelope forwarding. A peer that propagates
information emits a new signed message with its own identity, sequence, expiry
and causation reference.

The reference cryptographic suite uses canonical JSON, SHA-256, UTF-8,
base64url without padding and Ed25519 through Web Crypto. Local policy chooses
which suites are accepted; the sender cannot select an unapproved algorithm.

Peer and Objective issuer keys are available through a preprovisioned binding
or a separate attested enrollment flow before ordinary envelopes are accepted.
A self-signed Peer Card proves key possession but does not grant admission.
Unknown-key verification never triggers network I/O in the inbound path.

Inbound processing is ordered:

1. transport and decompression limits;
2. strict JSON parsing and structural limits;
3. protocol, scope, audience and time validation;
4. payload digest and signature verification;
5. key binding, validity and revocation checks;
6. peer admission and message-specific authorization;
7. replay, idempotency and causal validation;
8. atomic inbox acceptance;
9. reducer transition and redacted local event emission.

Only an accepted, branded envelope may reach a domain reducer.

Delivery is at-least-once. Duplication, reordering, delay and cooperative
cancellation are expected. Idempotency and fencing protect state changes and
reduce duplicate external actions. Effectively-once external effects
additionally require downstream idempotency or fencing; the protocol does not
claim exactly-once delivery.

## Consequences

- Application event and streaming contracts remain unchanged.
- Transport authentication does not replace message identity.
- Invalid messages cannot reserve durable replay state before signature
  verification.
- Outputs larger than protocol limits travel through authorized content
  references.
- The verifier performs no network I/O on the inbound path.
- Signatures authenticate possession of a key and protect integrity. Accepted
  identity additionally requires key binding and local admission; signatures do
  not establish truth, confidentiality or correct model behavior.
