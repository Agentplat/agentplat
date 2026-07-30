# `@agentplat/mesh-protocol`

Closed, bounded and transport-neutral wire contracts for AgentPlat Mesh peers.

The Alpha 1 implementation provides:

- strict UTF-8 and JSON parsing that rejects duplicate decoded keys, malformed
  Unicode, ambiguous syntax and documents outside explicit structural limits;
- deterministic JSON canonicalization for hashing and signing;
- closed-schema validation for `peer.hello`, `peer.ping` and `peer.ping_ack`;
- exact representations for message IDs, SHA-256 payload digests and Ed25519
  proofs;
- receiver-context checks for tenant and Mesh scope, audience, freshness and
  critical-extension support; and
- public, structurally valid conformance fixtures in `fixtures/v0`.

Use `parseSignedMeshEnvelope` with the decompressed `Uint8Array` at a wire
boundary. Accepting bytes rather than pre-decoded text prevents lossy UTF-8
replacement from hiding an invalid representation. The parser performs strict
parsing and static protocol validation and returns a deeply frozen value. Apply
`validateMeshEnvelopeContext` before accepting that value into a local peer.

Use `canonicalizeMeshPayload` to obtain the bytes covered by `payloadHash`.
Use `createMeshSigningDocument` or `canonicalizeMeshSigningDocument` to obtain
the document covered by the envelope proof. The signing document deliberately
excludes the payload and the proof value while retaining the payload digest and
proof header.

This package does not calculate or verify a payload digest, resolve signing
keys, verify signatures, perform replay admission, or mutate peer state. Those
are separate stages so callers cannot confuse structural validity with
cryptographic authenticity or local acceptance.

Importing the package performs no parsing, key resolution, network or storage
operation.
