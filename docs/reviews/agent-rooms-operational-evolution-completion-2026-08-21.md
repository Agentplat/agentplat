# Agent Rooms operational evolution — completion evidence

**Date:** 2026-08-21  
**Release line:** `0.3.0-beta.4`  
**Scope:** eight-part Agent Rooms operational objective

## Completion matrix

| #   | Requirement                                                 | Implemented evidence                                                    | Verification evidence                                                                                                                   |
| --- | ----------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | PostgreSQL reference application and deterministic provider | `examples/rooms-api/src/index.mjs`, `scripts/end-to-end.mjs`            | Real PostgreSQL scenario completed routing, run, artifact, human contribution, delivery, plan, membership and live view                 |
| 2   | Multiprocess restart recovery                               | `scripts/restart-recovery*.mjs`                                         | Separate prepare/recover processes restored coordination, expired run, intervention, Handoff, contribution and delivery with stable IDs |
| 3   | Unified incremental live view and SSE                       | `packages/rooms/src/live-view.ts`, Rooms API `/live` routes             | Composite cursor and stream tests in `tests/rooms-live-view.test.mjs`                                                                   |
| 4   | Durable classified errors and retry                         | `packages/rooms/src/coordination-runtime.ts`                            | Redaction, category, backoff, attempt and stable-operation tests in `tests/rooms-coordination-runtime.test.mjs`                         |
| 5   | Typed Planner bridge and event-driven replanning            | `packages/rooms/src/planner-bridge.ts`, PostgreSQL migration V8         | Task/contribution/approval materialization and Room-event-bound replan tests                                                            |
| 6   | Participant lifecycle and routing eligibility               | `packages/rooms/src/participant-membership.ts`, PostgreSQL migration V9 | Enabled/suspended routing tests and Handoff/revision eligibility integration                                                            |
| 7   | Optional Temporal adapter                                   | `@agentplat/rooms-temporal`                                             | Signal-with-start test, isolated package build and packed declaration consumer                                                          |
| 8   | Real external Work Management provider                      | `@agentplat/work-management-asana`                                      | HTTP contract test covers OAuth bearer, project binding and Asana external GID idempotency                                              |

## Cross-cutting verification

- Root unit suite: 1,228 tests; 1,221 passed, 1 expected skip, 6 todo, 0 failed.
- Full workspace type-check: passed across 56 public packages.
- Release verification: 56 publishable manifests passed.
- Pack smoke: 56 tarballs and 190 packed API surfaces passed pnpm/npm isolated consumption.
- PostgreSQL 16: migrations V1–V9 applied and rolled back successfully.
- `git diff --check`: passed.

`audit:public` remains affected by unrelated pre-existing, untracked binary and
large empirical artifacts under `docs/` and `output/`. Those files were not
created or modified by this objective; all catalog, release, type, package and
functional gates covering the changed surfaces passed.

## Evidence boundary

These results establish implemented source behavior and deterministic local
integration. They do not establish production availability, third-party SLA,
performance at scale or live Asana account validation. The Asana adapter is
implemented against the official task and Custom External Data API contracts;
deployment still requires an OAuth app, approved scopes and project access.
