# `@agentplat/mesh-protocol`

Closed, bounded and transport-neutral wire contracts for AgentPlat Mesh peers.

The initial alpha surface reserves the signed envelope, membership message
payloads, protocol limits and structured error model. Parser, canonicalization
and conformance behavior are added behind these contracts in the next
implementation phase.

Importing the package performs no parsing, key resolution, network or storage
operation.
