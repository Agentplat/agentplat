# Agent Room Planner 1.4.0 adoption

Status: coordinated release preparation. Publication is complete only when the
protected workflow verifies the full 68-package registry cohort and its exact
artifact manifest. This guide does not authorize production migrations or flags.

## Cohort and verification

AgentPlat 1.3.0 is already published and does not contain Room Planner. The old
Grishen preview used different 1.3.0 source tarballs; those artifacts cannot be
replaced in npm. The new 1.4.0 cohort combines the reviewed current main baseline,
its opt-in memory profile and the Planner source from PR #221. Local uncommitted
Event intake, research and other unrelated changes are excluded.

All 68 packages must use the same release version. The Grishen dependency closure
is a consumer verification set, not a partial substitute for the coordinated
release. Preserve published 1.3.0 and the historical 1.1.0 model-study manifests.
The historical synthetic qualification does not qualify new package bytes or
establish open-web reliability.

`pnpm run verify:planner-consumer` imports the actual packed or registry APIs:

- `@agentplat/rooms`: Planner engine, reasoner, budget and usage helpers.
- `@agentplat/framework`: the same server-side Planner factory and public types.
- `@agentplat/rooms-postgres`: Planner state/history and call-result stores,
  packaged migration 019 and atomic idempotent message intake.
- `@agentplat/workflows-rooms`: `RoomPlannerWorkflowCalls`.
- `@agentplat/workflows-postgres`: the existing process/task store and ledger 001.

The fixture requires `AGENTPLAT_POSTGRES_TEST=1` and uses a random test schema. It
applies Rooms then workflows, repeats both migrations, checks pending versions,
persists Planner events and receipts, and reconstructs workflow calls without
reinvoking completed work. It makes no paid model or external connector call.
With `AGENTPLAT_PREPACKED_TARBALL_DIRECTORY`, it consumes the already prepared
archives. With `AGENTPLAT_PUBLIC_CONSUMER_SOURCE=registry`, it installs the exact
release version from npm and repeats the same assertions and public type check.

## Safe order for Grishen Agents

1. Complete required source CI and the protected full-scope release dry-run.
   Review the artifact manifest and exact tarballs, publish through the protected
   OIDC workflow, then require registry byte/signature/provenance/tag verification
   and clean registry consumers before changing Grishen's dependency pins.
2. Update Grishen's exact AgentPlat versions and npm lockfile to the verified
   cohort. Remove its CI source-preview installation. Run a clean `npm ci`, types,
   build, policy/PWA regressions and both PostgreSQL Planner integrations. Keep
   production enablement absent or false.
3. Rehearse the intended upgrade on a non-production database restored from an
   appropriate backup. Confirm the target schema and the two distinct application
   ledgers. Check existing Room/workflow reads, idempotent nonce recovery and
   completed-call reconstruction after upgrade. Retain the backup/restore plan.
4. A separately authorized production maintenance window must drain old app
   instances and workers before the migration. Apply the verified
   `@agentplat/rooms-postgres` migrations through version 19 first, then the
   `@agentplat/workflows-postgres` migration through version 1, using the same
   intended schema and `createSchema: false`. Inspect both statuses and require
   no pending versions before starting the updated application.
5. Start the updated app with Planner disabled. Verify ordinary Room and workflow
   behavior. Only after the published cohort's qualification and migrations pass
   may a separately authorized pilot enable observation and then limited execution.
   Configure authenticated read-only research sources, explicit prices and a
   positive persistent Room budget before admission.

The migration status reader rejects versions absent from its packaged SQL. A new
adapter sees migration 019 as pending before upgrade; an old adapter rejects 019
after upgrade. A feature flag alone does not make mixed old/new schema consumers
safe. Do not merge an automatically deployed consumer PR before its migration
window is authorized and coordinated.

Planner requires Rooms 019 and workflows 001. The optional memory ledger remains
independent and is applied only for applications adopting that profile.
Constructing the Planner stores never migrates automatically.

## Withdrawal and recovery

Drain new admissions and retain pause/report reads, uncertain reservations and
durable receipts. Stop rollout on any migration/checksum or consumer-check failure.
Never delete ledger rows or use destructive down migrations as an ordinary
application rollback. Restore the tested compatible database/application pair
through the approved recovery procedure when necessary.

Publication and deterministic PostgreSQL tests establish distribution and bounded
integration behavior. They do not authorize production changes or qualify model
judgment on new briefs and sources.
