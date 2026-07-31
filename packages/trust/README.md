# @agentplat/trust

Provider-neutral, browser-safe primitives for deterministic Evidence and Trust
state. The package has no network, clock, persistence, key-discovery or
dispatch dependency.

The root exports strict canonical JSON handling, domain-separated digests,
closed Evidence contracts, immutable empty state and protected snapshot helpers.
`@agentplat/trust/mesh-records` exports pure Mesh-to-local normalizers; callers
must perform authentication and authority checks before admitting their output.

This package supplies no global reputation, identity, admission, lease or action
authority. Those boundaries remain with the application and their existing
packages.
