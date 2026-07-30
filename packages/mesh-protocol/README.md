# `@agentplat/mesh-protocol`

Closed, bounded and transport-neutral wire contracts for AgentPlat Mesh peers.

The implementation provides:

- strict UTF-8 and JSON parsing that rejects duplicate decoded keys, malformed
  Unicode, ambiguous syntax and documents outside explicit structural limits;
- deterministic JSON canonicalization for hashing and signing;
- closed-schema validation for `peer.hello`, `peer.ping` and `peer.ping_ack`;
- closed, bounded Alpha 2 discovery and capability records for `peer.card`,
  `peer.goodbye`, `capability.advertise` and `capability.withdraw`;
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

Objective, Work Item, lease, evidence, trust and peer-sync message families
remain reserved until their closed payload contracts are implemented. They fail
explicitly rather than entering a generic payload path.

## Frozen limits

Protocol v0 applies these structural limits before a payload can enter a
reducer:

| Limit                                  |             Maximum |
| -------------------------------------- | ------------------: |
| Decompressed envelope                  | 262,144 UTF-8 bytes |
| Payload                                | 196,608 UTF-8 bytes |
| Nesting depth                          |                  32 |
| Total object keys / keys in one object |         2,048 / 256 |
| Total array items / items in one array |       4,096 / 1,024 |
| One string                             |  65,536 UTF-8 bytes |
| Extensions / critical extensions       |              16 / 8 |
| Identifier                             |     256 UTF-8 bytes |
| Envelope lifetime                      |          10 minutes |
| Clock-skew allowance                   |           2 minutes |
| Replay window                          |     2,048 sequences |

The implemented Alpha 2 discovery and capability payloads additionally freeze
these narrower limits:

| Field                                          | Rule                                                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `protocolVersions`                             | 1–8 sorted unique non-negative safe integers and must include `0`                                                           |
| Peer Card transport hints                      | At most 8 sorted unique non-empty strings; 2,048 UTF-8 bytes each and 8,192 bytes in aggregate                              |
| Peer Card capability IDs                       | At most 32 sorted unique identifiers                                                                                        |
| Capability key                                 | Non-empty; at most 4,096 UTF-8 bytes                                                                                        |
| Capability version and optional variant        | Non-empty; at most 128 UTF-8 bytes each                                                                                     |
| Input or output media types                    | At most 16 sorted unique non-empty strings per collection; 128 UTF-8 bytes each                                             |
| Capability attributes                          | At most 32 entries; non-empty keys up to 128 UTF-8 bytes, non-empty values up to 1,024 bytes, and 16,384 bytes in aggregate |
| Peer Card or capability-advertisement validity | Greater than zero and at most exactly 24 hours                                                                              |

Every collection marked sorted and unique uses ascending lexicographic order
over UTF-16 code units, matching the JCS/RFC 8785 property-name ordering rule.
This is intentionally not Unicode code-point order; duplicate adjacent values
are rejected.

Envelope TTL is 30 seconds for `peer.ping` and `peer.ping_ack`, 60 seconds for
`peer.goodbye`, and 120 seconds for `peer.hello`, `peer.card`,
`capability.advertise` and `capability.withdraw`. These family limits are also
bounded by the global ten-minute maximum.

Alpha 2 domain-limit, ordering, validity, self-binding and predecessor
violations return `invalid_payload`. Envelope lifetime violations return
`invalid_lifetime`; generic parser structural-limit violations return
`structural_limit_exceeded`.

Importing the package performs no parsing, key resolution, network or storage
operation.
