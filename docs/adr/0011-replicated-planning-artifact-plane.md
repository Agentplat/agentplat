# ADR 0011: Replicated planning artifact plane

## Status

Accepted.

## Context

Collective Planning sends a content-addressed fragment reference in every
planning `work.offer`. The owner persists the referenced
`PlanningFragmentRepositoryRecordV1` before queuing the offer, while the
recipient validates the same record before it admits the offer. The only
repository shipped with the portable package is intentionally in-memory.

Authenticated causal synchronization can recover append-only domain records,
but its threshold catch-up protocol is deliberately different from resolving
one exact artifact from the peer that just offered it. Treating a missing
artifact as a terminal rejection makes independent peer processes race: the
signed offer can arrive before its referenced content.

## Decision

Agentplat will provide an opt-in replicated planning artifact plane with four
separate responsibilities:

1. `@agentplat/planning-artifacts` signs immutable artifact publications and
   wraps a `PlanningFragmentRepositoryV1` so every locally produced record is
   also appended to `@agentplat/collective-sync`.
2. Collective Sync gains a membership-bound, point-resolution request for one
   exact `(syncDomain, streamId, sequence)` record. Point resolution proves
   availability and provenance; it does not issue a catch-up certificate or
   establish collective readiness.
3. `@agentplat/planning-artifacts` verifies the producer publication, replays
   it into the normal planning repository and exposes an availability port to
   the peer node runtime.
4. `@agentplat/planning-artifacts-postgres` implements immutable, scope-bound
   planning artifact persistence. A conflicting content reference or domain
   identity fails closed.

The peer node invokes the availability port only after the existing Mesh
processor has authenticated and admitted the envelope far enough to return
`planning_repository_missing`. If resolution succeeds, the original envelope
is processed again through the normal reducer. If the producer or transport is
temporarily unavailable, processing throws and the durable inbox retains the
offer for retry. No synchronization-only mutation may create Work authority.

## Invariants

- Tenant, mesh, policy domain, objective, mission intent, revision, producer
  peer and producer instance are exact and cannot be widened.
- A publication binds the complete canonical repository record, its content
  reference, the producing membership epoch and configuration, and the
  producer key.
- A point-resolved sync record is accepted only from the exact requested
  current member and is still passed through the configured domain adapter.
- The artifact is available before a planning offer is committed; availability
  alone does not grant assignment, execution, quorum or action authority.
- Retries are idempotent. The same content and stream record may repeat; any
  different content at the same identity is a conflict.
- Credentials, private prompts, transient inference context, private
  reasoning and signing material are never planning artifacts.
- Browser-safe packages perform no network, storage, timer or global
  registration work at import time.

## Compatibility

The availability port is optional. Hosts that do not configure it preserve the
existing terminal `planning_repository_missing` behavior. Existing Mesh Wire
V1 messages, planning extensions, repositories and reducers are unchanged.
The point-resolution messages are additive members of the independent
`agentplat.collective-sync` protocol.

## Consequences

Independent peers can exchange planning offers without a shared filesystem or
database. Hosts must still configure authenticated endpoints, key history,
membership and durable repositories. This decision does not add Byzantine
agreement, global fork choice, secret transfer, generic blob storage or
exactly-once external effects.
