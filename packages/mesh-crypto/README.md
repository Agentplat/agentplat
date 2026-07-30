# `@agentplat/mesh-crypto`

Provider-neutral Web Crypto contracts for hashing, signing and verifying
AgentPlat Mesh envelopes.

The initial alpha surface defines Ed25519 key records, a bounded synchronous key
resolver, signing and verification requests, and stable rejection codes.
Cryptographic operations are implemented in the next phase.

Key resolution is synchronous by design so ordinary inbound verification cannot
trigger network access. Private keys are never protocol payloads or telemetry.
