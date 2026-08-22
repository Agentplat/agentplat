# Agent Room operational release pull request

## Summary

This release turns AgentPlat Agent Room into a durable operational runtime while
preserving the existing domain authority boundary. It adds transactional
message intake, continuous coordination, execution sessions and checkpoints,
typed AgentPlat Handoffs, progressive plans, human contributions, knowledge
bundles, automatic live discovery and a unified PostgreSQL operational stream.

Two optional adapters are introduced:

- `@agentplat/rooms-temporal` uses Temporal for wakeup, retry and history
  rollover while PostgreSQL and Agent Room stores remain authoritative;
- `@agentplat/work-management-asana` demonstrates idempotent external human
  task projection without importing external completion authority.

## Compatibility

- Existing `RoomService` message behavior remains unchanged unless
  `automaticCoordination` is enabled.
- Repository coordination methods, runtime checkpoints and task-run hooks are
  additive and optional.
- New API routes are registered only when their corresponding service is
  injected.
- No existing package export or route is removed or renamed.
- All 56 public packages move together to `0.3.0-beta.5` under npm `next`.

## Database migration

Deployments must apply PostgreSQL migrations V2–V11 in order before starting
the new worker cohort. Down migrations are destructive; use a tested backup and
prefer a forward fix. Full instructions are in
`docs/agent-rooms-postgres-migration.md`.

## Verification

- [x] External public terminology audit
- [x] Clean-checkout `pnpm check`
- [x] PostgreSQL V1–V11 apply and rollback
- [x] Reference end-to-end scenario
- [x] Multiprocess restart recovery
- [x] Temporal Server activity binding, signals, restart and `continueAsNew`
- [x] 56 coordinated manifests at `0.3.0-beta.5`
- [x] 56 tarballs and 190 packed API surfaces
- [x] Public packed consumer
- [x] Publication dry-run under `next` with no registry mutation

## Evidence boundaries

The checks establish source behavior, packaging and deterministic integration.
They do not claim production availability, third-party service-level behavior
or live Asana account validation. Asana remains an optional reference adapter.
