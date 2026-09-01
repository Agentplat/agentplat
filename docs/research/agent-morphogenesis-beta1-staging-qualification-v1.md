# Agent Morphogenesis Beta 1 distributed staging qualification V1

**Defines:** the frozen qualification contract that follows the bounded local
operational-readiness result. **Status:** execution pending; this document is a
test plan, not staging or production evidence.

## Objective

Establish whether AgentPlat Agent Morphogenesis preserves authority,
continuity, idempotency, isolation and recovery in a representative distributed
staging deployment. The qualifying deployment must use at least three failure
domains, persistent PostgreSQL and Temporal services, authenticated Agent Mesh
peers, external key custody, an independent rollback witness and centralized
observability.

The approver remains role-based: a policy-eligible agent, a person, or a
qualified quorum may authorize a Morphogenesis decision. No test may weaken
the existing separation between proposer, evaluator, decision authority and
execution authority.

## Two-stage execution

The first stage is a single-host container preflight. It reproduces service
separation, persistent volumes, network boundaries, worker restarts, rolling
versions and restore mechanics cheaply and deterministically. Passing it can
only show that the qualification machinery works; it cannot establish the
distributed staging claim because containers on one host share a failure
domain.

The second stage runs the same machinery across at least three independent
failure domains. Only this stage may establish
`beta1-distributed-staging-profile-established`.

## Frozen gates

Qualification requires all of the following:

1. Run for at least 24 continuous hours, targeting 72 hours, with at least
   1,000 completed Morphogenesis runs and eight concurrent missions.
2. Exercise at least three tenants and two missions per tenant. Cross-tenant
   reads, writes and effects, cross-mission authority use, and cross-scope
   receipt acceptance must remain zero.
3. Repeat the exact 22 canonical scenarios. Repeat every scenario after a
   rolling upgrade and repeat authority-sensitive scenarios during a network
   partition. Missing, duplicate or unknown scenario identities fail closed.
4. Inject network partitions, peer process loss, complete host loss,
   PostgreSQL failover, Temporal worker loss, authorization expiry, external
   key rotation/revocation and rolling version skew.
5. Perform three rolling deployments, two schema upgrade cycles, two
   backup/restore cycles and restore at least once into a clean environment.
6. Preserve mission continuity at 1.0 with zero unauthorized activations,
   duplicate material effects, lost committed receipts or morphology-head
   forks.
7. Prove alert delivery and retain an immutable fault journal, topology and
   image manifests, operation receipts, resource samples, rollback witness and
   a signed analysis bundle.

The machine-readable thresholds are frozen in
`config/agent-morphogenesis-beta1-staging-qualification-v1.json`.

## Execution order

Implementation proceeds through these gates:

1. Build and verify the single-host container preflight.
2. Add isolation, fault injection, rolling upgrade and backup/restore probes.
3. Run a short non-qualifying rehearsal and validate evidence collection.
4. Bind the deployment to real staging failure domains and external key
   custody.
5. Run the 24–72 hour campaign, sign the evidence and issue the qualification
   report.

Every gate is fail-closed. A partial campaign may diagnose the system but may
not be promoted into qualification evidence.

## Claim boundary

The corrected V2 local readiness bundle remains the only completed operational
evidence at the start of this work. Source implementation, container preflight
and staging qualification are distinct evidence states.

Until the full distributed campaign passes:

```text
stagingQualification: not-established
operationalReadiness: beta1-local-profile-established
productionReadiness: not-established
productionClaimPermitted: false
```

After a passing distributed campaign, only the first two fields may become
`beta1-distributed-staging-profile-established` and
`staging-profile-established`. Production readiness and security certification
remain not established. A limited production pilot requires a separate,
explicitly authorized objective and acceptance contract.

The frozen collective capability V1 denominator and the excluded future
capabilities remain unchanged.
