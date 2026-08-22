# Agent Room final gap-closure evidence

Date: 2026-08-21

Release candidate: `0.3.0-beta.5`

## Scope

This record tracks the final operational capabilities adopted into AgentPlat
Agent Room using AgentPlat's canonical vocabulary and standard industry terms.
The compared implementation is evidence for useful behavior, not a source of
public names or architectural authority.

## Requirement evidence

| Capability                   | AgentPlat implementation                                                                                                                                                                           | Verification                                                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transactional message intake | `RoomService` persists a Room message, its domain event and its coordination item in one repository transaction.                                                                                   | Rollback and success tests in `tests/rooms-automatic-coordination.test.mjs`; reference scenario requires no manual enqueue.                                                 |
| Continuous coordination      | `AgentRoomCoordinationWorker` provides discovery, bounded concurrency, leases, heartbeat renewal, retries, wakeup, metrics and graceful drain.                                                     | `tests/rooms-coordination-worker.test.mjs`; multiprocess expired-lease recovery.                                                                                            |
| Durable workflow adapter     | `@agentplat/rooms-temporal` keeps Temporal at the adapter boundary and binds activities to the canonical coordination runtime and durable store.                                                   | Temporal Server 1.31.2 drove four persisted coordination items through the canonical runtime across a worker restart and `continueAsNew`; package contract tests.           |
| Typed Handoffs               | The standard tool bridge creates governed AgentPlat Handoff proposals with run, participant and agent-revision provenance. Accepted Handoffs enter coordination through the operational projector. | Tool bridge and projector tests.                                                                                                                                            |
| Planner progress             | Plans materialize governed tasks, approvals, human contributions and Handoffs; dependencies, step progress, terminal status and event-triggered replanning are persisted.                          | Planner bridge and operational projector tests.                                                                                                                             |
| Room-scoped discovery        | AgentRoom LiveView and SSE discover execution sessions, Handoffs, plans, contributions, memberships and deliveries without client-supplied identifiers.                                            | Automatic-discovery LiveView tests and reference scenario.                                                                                                                  |
| Work-management integration  | `@agentplat/work-management-asana` is an optional reference adapter implementing OAuth, stable external identity, create, lookup and update while AgentPlat remains authoritative.                 | Local HTTP contract and security tests cover create, lookup, update, identity stability and error redaction; the opt-in sandbox scenario demonstrates crash reconciliation. |
| Unified operational stream   | PostgreSQL migration 010 emits Room-scoped operational events for all required projections; migration 011 stores projector high-water checkpoints.                                                 | Real PostgreSQL migration, outbox/projector tests, LiveView integration and restart recovery.                                                                               |

## Integrated evidence

- Real PostgreSQL applied migrations 001 through 011 and passed the package's
  apply/rollback integration test.
- The reference scenario completed coordination, one task/run/artifact, one
  human contribution and synchronized delivery, with one plan, two active
  memberships and 15 automatically discovered live events.
- Separate recovery processes recovered coordination, run execution,
  intervention delivery, execution session, Handoff, human contribution and
  work-management delivery without duplicate logical operations.
- Real Temporal Server ran two sequential workers and exercised signals,
  activities, restart and history rollover through `continueAsNew`.
- Workspace type-check, unit/adaptor suite, release verification and package
  smoke verification passed. The package smoke audited 56 tarballs and 190
  public API surfaces.

## Optional provider validation

The Agent Room operational gap is closed. The Asana package is intentionally a
reference implementation for downstream open-source adopters, not required
infrastructure and not part of AgentPlat's runtime authority boundary.

Adopters who use Asana may optionally execute `pnpm --filter
@agentplat/work-management-asana test:sandbox` with `ASANA_ACCESS_TOKEN` and
`ASANA_PROJECT_GID` for a disposable project. The protected `Agent Room Asana
sandbox validation` workflow offers the same opt-in check from an exact `main`
commit. Neither external execution is a condition for Agent Room conformance or
for closing this capability gap.

## Conclusion

All eight adopted capability areas are implemented at their intended AgentPlat
boundary and have proportionate evidence. The reference application operates
without manual coordination assembly, recovery is demonstrated across process
restarts, PostgreSQL and Temporal were exercised against real servers, and the
public type, test, release and package-consumer gates are green.
