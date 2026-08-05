# ADR 0012: Certified multi-source planning availability

## Status

Accepted.

## Context

ADR 0011 lets a recipient recover one authenticated planning artifact from the
peer that produced its work offer. That removes shared-filesystem assumptions,
but the producer remains a single availability dependency. If it disappears
permanently after publishing an offer, another peer may possess neither the
artifact nor evidence identifying an acceptable alternate source.

A general-purpose blob store or shared database would hide this failure behind
new central infrastructure. It would also weaken the existing relationship
between a planning fragment, current membership, producer provenance, and
normal planning admission. Agentplat needs an additive, self-hosted mechanism
that remains compatible with the V1 point-resolution path.

## Decision

Agentplat will provide opt-in certified multi-source availability for planning
artifacts:

1. The producer derives an ordered replica set from the fragment digest,
   current membership configuration, and each candidate peer instance. The
   producer is excluded and ambiguous multi-instance candidates fail closed.
2. Each selected peer receives a bounded, signed store request. It verifies the
   source publication and current membership before durably storing the normal
   artifact and Collective Sync record.
3. A replica returns a signed storage receipt only after both writes succeed.
4. The producer requires the configured receipt threshold, builds an immutable
   replication certificate, persists it, and sends it to the receipt signers.
   `put()` returns only after the configured certificate-storage acknowledgement
   threshold is reached.
5. Resolution remains local-first and source-first. When the source cannot
   answer, the recipient obtains and verifies the certificate from the
   deterministically selected peers, then requests the artifact only from a
   receipt signer. The artifact still passes through the V1 publication,
   repository, and planning-admission checks.

The public policy has three closed fields: `replicaCount`, `writeThreshold`,
and `receiptLifetimeMs`. A certificate binds tenant, mesh, policy domain,
producer peer and instance, membership epoch and configuration, fragment and
artifact digests, content reference, selected replicas, policy, signed
receipts, and its logical validity window.

The implementation is split across:

- `CertifiedReplicatedPlanningFragmentRepositoryV2`, which gates producer
  publication on certified replication;
- `PlanningArtifactReplicationPeerV1` and the in-memory or bounded HTTP
  transports;
- `PlanningArtifactAvailabilitySyncAdapterV2`, which validates artifact and
  certificate sync records;
- `CertifiedPlanningArtifactAvailabilityV2`, which performs exact certified
  fallback;
- immutable in-memory and PostgreSQL evidence repositories.

## Invariants

- Replica selection is deterministic and independent of membership enumeration
  order.
- Only current, exact member instances may issue requests, receipts, or
  acknowledgements.
- A receipt names the exact request, publication, fragment, artifact, content
  reference, producer audience, and membership configuration.
- A certificate is valid only while its membership configuration is current
  and its receipt lifetime has not expired.
- Conflicting evidence at the same immutable identity fails closed; exact
  duplicates are idempotent.
- A successful producer `put()` means both artifact receipt threshold and
  certificate-custody threshold were met.
- A certificate proves signed storage acknowledgements at certification time.
  It does not grant Work authority, prove semantic plan quality, or assert that
  every replica is currently reachable.
- A resolved artifact always re-enters the existing Mesh and planning reducers.
  Availability cannot assign work or authorize an effect.

## Compatibility

Wire V1 work offers and `PlanningArtifactAvailabilityPortV1` are unchanged.
Existing applications may continue using
`ReplicatedPlanningFragmentRepositoryV1` and
`CollectiveSyncPlanningArtifactAvailabilityV1`. Applications opt into V2 by
changing composition, not planning messages or runtime reducers.

Certificates use a separate Collective Sync domain and replication envelopes
use a separate protocol identifier. Neither is interpreted as a Collective
Sync catch-up certificate.

## Consequences

An artifact can remain available after permanent producer loss as long as a
certificate and at least one honest receipt signer remain reachable. The host
must configure membership, keys, endpoints, durable repositories, retention,
and a policy appropriate to its fault assumptions.

Membership changes invalidate old certificates. This profile requires a new
current planning publication rather than silently carrying old availability
evidence into a new configuration. The mechanism provides threshold-signed
custody evidence, not Byzantine consensus, proof of physical media durability,
or a distributed transaction.
