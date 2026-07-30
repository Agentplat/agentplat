# `@agentplat/mesh-crypto`

Provider-neutral Web Crypto contracts for hashing, signing and verifying
AgentPlat Mesh envelopes.

The Alpha 1 implementation provides:

- canonical SHA-256 payload digests;
- Ed25519 signing and verification through Web Crypto;
- stable fail-closed signing and verification errors;
- exact tenant, mesh, peer, key and algorithm binding;
- inclusive `validFrom`, exclusive `validUntil` and explicit revocation checks;
- a fixed, bounded `StaticMeshKeyResolver`; and
- public verification fixtures under `fixtures/v0`.

Use `signMeshEnvelope` for the reference outbound path and
`verifyMeshEnvelope` for the inbound cryptographic boundary. Injectable class
implementations are available through `createWebCryptoMeshEnvelopeSigner` and
`createWebCryptoMeshEnvelopeVerifier`.

Key resolution is synchronous by design so ordinary inbound verification cannot
trigger network access. `StaticMeshKeyResolver` rejects duplicate bindings and
configurations above its explicit record limit.

`verifiedAt` is trusted local time supplied by the caller; key validity and
revocation never depend on the sender-controlled envelope timestamp. Live
verification always rejects revoked keys. A separate historical-verification
API may be introduced later, but historical results must never re-enter live
admission or a reducer.

Public-key import and export use the provider-neutral raw 32-byte Ed25519
representation. Private-key import and export are intentionally outside this
package's public surface.

Verification establishes payload integrity, signature validity and a live
local key binding. It does not admit a peer, authorize a message, apply replay
state or mutate domain state.

Private keys are never protocol payloads, fixtures or telemetry. Signing tests
generate temporary key pairs at runtime; public fixtures contain only a raw
public key and its fixed signed envelope.
