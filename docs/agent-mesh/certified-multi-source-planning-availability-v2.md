# Certified multi-source planning availability V2

This capability removes the planning-artifact producer as a single recovery
source while preserving the existing content-addressed and authority-safe
planning flow.

## Composition

All participating peers use the same immutable policy:

```ts
const replicationPolicy = {
  schemaVersion: 1,
  replicaCount: 3,
  writeThreshold: 2,
  receiptLifetimeMs: 60_000,
} as const;
```

`replicaCount` is the number of non-producer members selected for an artifact.
`writeThreshold` is both the minimum signed storage receipts and the minimum
certificate-storage acknowledgements required before producer `put()` returns.
`receiptLifetimeMs` bounds how long the resulting certificate may be used.

The producer wraps its normal repository:

```ts
const fragments = new CertifiedReplicatedPlanningFragmentRepositoryV2({
  scope,
  repository: artifactRepository,
  evidenceRepository,
  syncRepository,
  membership,
  signing,
  clock,
  replicationTransport,
  replicationPolicy,
});
```

Each peer exposes `PlanningArtifactReplicationPeerV1` through either a host
transport or `handlePlanningArtifactReplicationHttpRequestV1`. The reference
HTTP client accepts construction-bound HTTP or HTTPS endpoints, rejects URL
credentials and absolute path overrides, does not follow redirects, and bounds
request and response bodies. Channel authentication and TLS remain host
responsibilities and do not replace signed envelopes.

The receiver configures `PlanningArtifactAvailabilitySyncAdapterV2` on its
Collective Sync client and supplies `CertifiedPlanningArtifactAvailabilityV2`
to the existing collective runtime `planningArtifacts` port. No runtime fork or
new work-offer extension is required.

For durable peers, use both PostgreSQL repositories in the same peer scope:

```ts
const artifactRepository = new PostgresPlanningFragmentRepositoryV1(pool, {
  schema,
  ...scope,
});

const evidenceRepository =
  new PostgresPlanningArtifactReplicationEvidenceRepositoryV1(pool, {
    schema,
    ...scope,
  });
```

Run `@agentplat/planning-artifacts-postgres` migrations before constructing
them. Migration 2 adds immutable receipts, certificates, and certificate
acknowledgements.

## Producer flow

1. Validate and durably store the planning fragment locally.
2. Publish the signed V1 artifact record to local Collective Sync storage.
3. Select replicas by hashing the fragment digest, membership configuration,
   peer ID, and exact peer instance.
4. Send signed store requests concurrently.
5. Verify and retain signed receipts. Fail if fewer than `writeThreshold`
   succeed.
6. Create and store the replication certificate.
7. Send the certificate to each receipt signer. Fail if fewer than
   `writeThreshold` confirm durable certificate custody.
8. Return from `put()`. The normal planning runtime may now publish the offer.

Failure is intentionally fail-closed. A failed attempt may leave immutable
local or replica data that makes a retry idempotent, but it does not report a
certified `put()`.

## Receiver flow

Resolution has three stages:

1. Accept an already valid local record if it exactly matches the authenticated
   offer metadata.
2. Try the V1 exact request against the producer.
3. If the producer cannot answer, derive the replica set from current
   membership, obtain a valid certificate, and try only the peers whose signed
   receipts appear in that certificate.

Every retrieved publication is reverified and replayed through the normal
immutable repository. The runtime then processes the original work offer again
through ordinary admission. A certificate never bypasses that path.

## Operational rules

- Configure at least `replicaCount + 1` eligible peer IDs, including the
  producer. Every candidate peer ID must have exactly one current member
  instance in this profile.
- Choose `writeThreshold` from the number of storage acknowledgements required
  by the deployment's fault model. `1` improves liveness but provides no
  redundancy against losing that replica.
- Keep logical time and current membership resolution consistent across peers.
- Retain artifacts and evidence for at least the certificate validity period.
- Monitor replication-threshold and certificate-threshold failures separately.
- After a membership change, issue a current planning publication; old
  certificates fail current-membership verification.
- Protect PostgreSQL backups, endpoint routing, channel credentials, private
  signing keys, and key history as deployment assets.

Run the local end-to-end scenario with:

```sh
DATABASE_URL=postgresql://... pnpm run example:planning-artifacts-multiprocess
```

It starts five independent peers, certifies two replicas, stops the producer,
resolves from a previously empty receiver, restarts that receiver, and verifies
durable artifact and certificate custody.
