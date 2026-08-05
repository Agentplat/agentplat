# `@agentplat/planning-artifacts`

Authenticated, content-addressed publication and exact peer-to-peer recovery of
planning fragment artifacts. Producers persist a validated fragment before
publishing a membership-bound Ed25519 proof. Receivers use an already
authenticated work offer to request only the named causal record, replay it
through the normal immutable repository, and then re-run normal admission.

V1 resolves from the producer. The opt-in V2 composition adds deterministic
proactive replicas, signed durable-storage receipts, threshold replication
certificates, and certified fallback when the producer is permanently
unavailable:

- `CertifiedReplicatedPlanningFragmentRepositoryV2` returns only after both
  artifact receipt and certificate-custody thresholds are met;
- `PlanningArtifactReplicationPeerV1` receives signed replica requests;
- `PlanningArtifactReplicationHttpTransportV1` provides bounded HTTP transport;
- `PlanningArtifactAvailabilitySyncAdapterV2` verifies artifact and certificate
  records;
- `CertifiedPlanningArtifactAvailabilityV2` performs local-first, source-first,
  then certified multi-source resolution.

The point-resolution path establishes availability, not collective readiness;
it never creates a Collective Sync catch-up certificate or Work authority.
Applications should use `PostgresPlanningFragmentRepositoryV1` and
`PostgresPlanningArtifactReplicationEvidenceRepositoryV1` from
`@agentplat/planning-artifacts-postgres` for durable peers. See the
[V2 operations guide](../../docs/agent-mesh/certified-multi-source-planning-availability-v2.md)
and [threat model](../../docs/security/certified-planning-availability-threat-model.md).
