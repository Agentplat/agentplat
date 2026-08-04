# `@agentplat/planning-artifacts`

Authenticated, content-addressed publication and exact peer-to-peer recovery of
planning fragment artifacts. Producers persist a validated fragment before
publishing a membership-bound Ed25519 proof. Receivers use an already
authenticated work offer to request only the named causal record, replay it
through the normal immutable repository, and then re-run normal admission.

The point-resolution path establishes availability, not collective readiness;
it never creates a catch-up certificate. Applications should use
`PostgresPlanningFragmentRepositoryV1` from
`@agentplat/planning-artifacts-postgres` for durable peers.
