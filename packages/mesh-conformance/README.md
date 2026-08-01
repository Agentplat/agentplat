# `@agentplat/mesh-conformance`

Provider-neutral compatibility runners for Agentplat Mesh implementations and
adapters. The package performs no work on import, reads no ambient credentials
and never creates or destroys resources without a caller factory.

The root export owns the closed capability, case and report contracts.
`./protocol`, `./transport`, `./durability` and `./rooms` expose bounded runners.
A passing report describes only the exact artifact, capabilities, fixtures and
cases that were executed; it is not a security certification.

Runners receive an immutable caller seed and abort signal for every isolated
factory invocation. Case, suite and cleanup timeouts are separate outcomes.
Durability and Rooms cases require explicit destructive-test consent; the
durability receipt case also requires reopening the same scope through a
distinct repository instance so an in-memory acknowledgment cannot stand in
for recovery evidence. Cleanup remains caller-owned and is attempted after
success, failure and abort.
