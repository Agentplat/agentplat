# Team Execution Ownership Continuity V1 implementation plan

Status: implemented

## Product outcome

Allow a current Work owner to recover and continue a team execution after the
previous coordinator disappears, while preserving stable effect identifiers and
rejecting state written under stale authority. Avoiding duplicate effects
requires shared durable idempotency at the application effect boundary.

## Public surface

`@agentplat/collective-runtime/team-execution-continuity` provides:

- exact authority, checkpoint, certificate, state and takeover contracts;
- canonical validation and content addressing;
- an explicit fence-aware execution port for every durable CAS and effect;
- checkpoint publication and successor import flows;
- reconstruction of pending dispatches with stable identifiers; and
- deterministic in-memory continuity-state, membership and availability
  adapters for composition and tests.

## Invariants

- continuity consumes the existing `work_owner` decision and creates no owner;
- every mutation is fenced by holder, instance, generation, head, token and
  membership configuration at the durable state or effect boundary;
- a checkpoint is usable only with matching scope, lineage, membership and
  availability certification;
- two different checkpoint digests for one revision and generation are a fork;
- replay is idempotent and pending dispatch identifiers never change; and
- unavailable or stale authority withholds progress.

## Integration sequence

1. Freeze the structural authority and checkpoint ports.
2. Implement exact validators, CAS state and prepare/certify transitions.
3. Add authority gates and takeover/import adapters.
4. Compose the ports into the peer host without changing team execution V1.
5. Export, pack and document the public surface.

## Completion criteria

A successor can recover a certified checkpoint, resume pending work and reject
the old coordinator. Forked, partial, stale or incompatible checkpoints fail
closed. Existing team-execution and exchange APIs remain source-compatible.
