# Source qualification and completion audit — 2026-09-30

Environment: isolated `codex/standalone-action-control` checkout, Node 24.20.0,
pnpm 11.25.0, disposable schemas in local PostgreSQL. No cloud resources or npm
publications were changed. Existing research/output work was excluded and preserved.

| Goal requirement | Authoritative source/scenario | Observed result |
| --- | --- | --- |
| No mandatory Agent Rooms | Standalone scope in composed gateway and independent consumer | Passed; the profile composes existing grant/gateway owners |
| Exact approval and preconditions | `action-approvals.ts`, approval tests and conditional-write PostgreSQL scenario | Input, binding, facts, policy and authority versions remain linked; altered targets invalidate |
| Independent authenticated review | Approval service host access port and unauthorized/self-approval scenarios | Missing identity, foreign tenant, agents and requester self-approval deny |
| Revalidation and revocation | Approval guard under admission transaction; epoch/account checks | Invalidation during quotation produces no charge/effect; stale agent/connector/organization epochs deny |
| Shared limits and explicit periods | Shared admission scenarios in memory and PostgreSQL | Competing reservations cannot exceed caps; all charges reserve together; units/revisions/periods checked |
| Uncertain results and refunds | Durable receipts and concurrent reconciliation scenarios | Unknown holds remain; terminal verified not_applied refunds once; contradictory proof cannot rewrite outcome |
| Restart and actual worker loss | Pool reopen plus hard process termination scenario | Reserved grant stays reserved until verified recovery; reconciliation succeeds without redispatch |
| Atomic destination preconditions | `action-effects.ts` and real conditional SQL write fixture | Resource changed after review produces terminal not_applied, no write, verified refund |
| Backward compatibility | Stable verifier, legacy grant bytes, old-row migration scenario and regression suites | Existing exports/types/default behavior preserved; old issued grant byte-identical after optional migration |
| Independent artifact consumption | `verify:action-control-consumer` | Runtime entry points, public types and optional SQL files verified from installed tarballs outside workspace |
| Reviewable delivery | Isolated branch and source qualification/host guide | Only scoped feature files; source APIs remain unpublished |
| Coordinated publication plan | `release-plan.md` | Fresh version and exact-artifact release process specified; publication is a later authorized operation |
| Product separation | Feature file set and integration guide | No MCP gateway, UI, business connectors, licenses or portal implemented in AgentPlat |

## Executed checks

| Check | Result |
| --- | --- |
| Full workspace build | Passed |
| Full workspace type checks + public TypeScript fixtures | Passed |
| Focused `verify:action-control` | 46 passed, zero failures/skips/TODO/cancelled; includes PostgreSQL and independent tarballs |
| Full root unit suite | 1,480 passed, 0 failed, 1 skipped, 6 TODO (1,487 total) |
| Adapter suite with PostgreSQL enabled | 380 passed, zero failures/skips/TODO across 31 summary groups |
| Normal public-surface audit | Passed; no added exclusions/exceptions |
| Platform boundaries and specification | Passed |
| Stable compatibility | Passed: 65 baseline packages, 216 baseline entry points, 83 unchanged type contracts, 222 current entry points |
| Diff whitespace | Passed |

The broad unit suite's skipped container test and six existing Mesh work/lease TODOs
are not counted as successful evidence. Adapter success does not establish a live
Temporal/Redis deployment; individual suite labels and enablement define coverage.
Neither source qualification nor tests constitute a production-scale certificate.
The complete release `pnpm run check` and remote CI remain required by the publication
process and have not been claimed here.

Working-session logs are `/tmp/agentplat-action-control-{build,types,qualification,
consumer,unit-isolated,adapters,public-audit}.log`. Source hashes and summaries are
recorded in `qualification.json`. Run the qualification gate to reproduce the
focused result; run the broader repository commands for their full scope.

## Explicit operational boundaries

Host identity/policy/clock/fact/quote ports are trusted integration boundaries.
Conditional-execution and idempotency declarations must be substantiated by each
real destination adapter. Weaker destinations cannot acquire atomic guarantees
from library flags. Upper-bound accounting and no automatic unknown-effect retry
remain mandatory in the composed profile.

Admission committed before suspension or invalidation may finish. Receipt-based
reconciliation is allowed while suspended. Recovery requires the original worker
stopped or fenced, not merely an observation timeout. No new action grant is issued
by approval, budget reservation, recovery or reconciliation.

The initial admission adapter is tenant-serialized with growing retained history.
Storage scaling and compaction are deployment work requiring preserved receipts and
accounting. This limitation is explicit rather than a claim of validated scale.

The requested source-support scope is verified. Registry publication, ACL adoption,
remote CI/release gates and production deployment are later steps, not implied by
this completion audit.
