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

`signMeshEnvelopeExternally` supports KMS/HSM custody. AgentPlat canonicalizes
and hashes the envelope locally, then passes only the immutable signing bytes,
algorithm and declared key ID to a `MeshExternalSignaturePort`. The returned
value must be an exact 64-byte Ed25519 signature and is revalidated as a normal
Mesh envelope. The port never receives or returns a private key. Provider
adapters must still bind workload identity, canonical key ID, audit retention,
timeouts and rotation policy; an arbitrary remote signing service is not by
itself evidence of independent custody.

The protocol `proof.keyId` remains a bounded opaque Mesh identifier, not a
provider ARN. The external signature port must bind that identifier to the
canonical KMS/HSM resource recorded in deployment evidence; it must never trust
an ARN supplied inside an envelope.

The Beta 1 signer writes v1 by default. Producing a compatibility v0 envelope
requires an immutable construction-bound `signingPolicy` that lists v0; the
signer never relabels an envelope. The verifier reads v0 and v1 by default and
may be narrowed through `allowedWireVersions`. Because `wireVersion` is in the
signing document, copying a valid proof between versions fails verification.

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

Verification establishes payload integrity, signature validity and
authentication of possession of a live locally bound key. It does not provide
confidentiality or establish the truth of a sender claim; it does not admit a
peer, authorize a message, apply replay state or mutate domain state.

Private keys are never protocol payloads, fixtures or telemetry. Signing tests
generate temporary key pairs at runtime; public fixtures contain only a raw
public key and its fixed signed envelope.
