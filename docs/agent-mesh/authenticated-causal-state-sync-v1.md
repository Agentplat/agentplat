# Authenticated causal state synchronization V1

## Capability

This capability lets a joining, restarted, or partition-healed collective peer
recover missed causal evidence from current members. It uses signed selective
anti-entropy rather than leader-owned snapshots. The result is a durable,
auditable readiness certificate tied to an exact membership epoch and local
frontier.

## Public components

- `@agentplat/collective-sync`: contracts, validation, canonical digests,
  signatures, peer/client orchestration, in-memory persistence, readiness gate,
  and HTTP transport/handler.
- `@agentplat/collective-sync-postgres`: transactional persistence and guarded
  schema lifecycle.
- optional `CollectivePeerNodeSynchronizationPortV1`: fail-closed productive
  runtime integration and exact-predecessor recovery.

## Host integration

Each synchronization domain must define an adapter that validates imported
records and replays them through the same reducers used for live messages. A
host should use narrow domains such as one mission intent or one policy-scoped
planning surface. It must not publish private prompts, credentials, private
reasoning, signing keys, or raw transient model context.

The host publishes accepted live evidence into the append-only repository,
starts or resumes catch-up on join/restart, and exposes readiness through the
node synchronization port. Existing deployments remain unchanged until this
optional port is configured.

## Operational sequence

```mermaid
sequenceDiagram
  participant T as Target peer
  participant M as Membership registry
  participant S1 as Source peer 1
  participant S2 as Source peer 2
  participant R as Domain reducer
  T->>M: resolve current epoch and instances
  T->>S1: signed frontier request
  T->>S2: signed frontier request
  S1-->>T: signed frontier F
  S2-->>T: signed frontier F
  loop bounded chunks
    T->>S1: request records after durable cursor
    S1-->>T: signed chunk bound to F
    T->>T: validate and atomically commit records + frontier
    T->>R: normal idempotent reducer replay
    T->>T: persist monotonic session cursor
  end
  T->>S1: request frontier attestation
  T->>S2: request frontier attestation
  S1-->>T: signed attestation F
  S2-->>T: signed attestation F
  T->>T: persist catch-up certificate
  T-->>T: productive readiness enabled
```

## Non-goals

V1 does not provide global snapshots, secret replication, arbitrary fork
merging, Byzantine consensus, state compaction, or a new Mesh wire version.
