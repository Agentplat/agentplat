# Replicated Planning Artifact Plane V1

## Objective

Allow independently hosted peers to resolve, verify, persist and replay the
immutable planning fragment referenced by an authenticated `work.offer`,
without sharing a filesystem or database.

## Components

- `@agentplat/planning-artifacts`: signed publications, collective-sync domain
  adapter, replicated repository decorator and runtime availability resolver.
- `@agentplat/planning-artifacts-postgres`: transactional implementation of
  `PlanningFragmentRepositoryV1`.
- `@agentplat/collective-sync`: bounded point resolution for an exact causal
  record from one authenticated current member.
- `@agentplat/collective-runtime`: optional availability gate and durable
  retry/reprocessing path.

## Publication flow

1. Planning creates a validated `PlanningFragmentRepositoryRecordV1`.
2. The replicated repository stores it durably.
3. The repository signs a publication bound to the current member instance,
   membership configuration and complete artifact digest.
4. The publication is appended as sequence one of a deterministic artifact
   stream in `planning.artifacts.v1`.
5. Only after the append commits may the node queue the `work.offer`.

## Resolution flow

1. The normal Mesh and planning inbound processor authenticates the offer and
   reports `planning_repository_missing`.
2. The node asks the optional availability port for the exact content
   reference, fragment and producer named by that already-authenticated offer.
3. Collective Sync requests the deterministic artifact stream from that
   producer. The request and response bind the current membership epoch,
   configuration, peer instances and audience.
4. The planning domain adapter verifies the embedded publication proof,
   complete artifact digest and normal planning record schema, then stores it.
5. The node processes the original offer again through the unchanged reducer.

Point resolution is intentionally not a readiness certificate. Planning,
assignment, execution and quorum gates continue to use their existing
authority and causal-currentness evidence.

## Stable identifiers and limits

- sync domain: `planning.artifacts.v1`;
- one stream per fragment digest;
- one immutable record at sequence `1`;
- collective-sync request/response maximum: 1 MiB canonical JSON;
- default planning artifact maximum: 262,144 canonical UTF-8 bytes;
- signed request/response lifetime: bounded by Collective Sync, 30 seconds by
  default.

## Failure semantics

- missing producer or temporary transport failure: durable retry;
- unknown current member, wrong instance or changed membership: fail closed;
- invalid signature, scope, digest, schema or source binding: fail closed;
- exact duplicate: idempotent success;
- conflicting content reference, stream or domain identity: persistent
  conflict requiring operator investigation;
- direct repository hosts without the availability port: existing terminal
  `planning_repository_missing` behavior.

## Non-goals

- generic blob storage;
- prompts, secrets, credentials or private reasoning transfer;
- global discovery or public artifact enumeration;
- Byzantine agreement or fork choice;
- provider SDKs, model execution or hosted infrastructure;
- changing Mesh Wire V1 or the planning work extension.
