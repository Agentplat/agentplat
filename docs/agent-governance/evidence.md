# Purpose governance conformance evidence

This is a source compatibility record for the bounded Room composition, not a
capability-baseline promotion, production certification or npm release. The
support scenario replaces the earlier LTV/CAC demonstration by owner choice.

## Contract-to-test mapping

| Contract | Primary evidence |
| --- | --- |
| G01 legacy behavior/digest and unknown modes | `tests/rooms-agent-registry.test.mjs`, `tests/rooms-interaction-public-contracts.test.mts` |
| G02 mixed Room and qualified activation | `tests/rooms-coordination-execution.test.mjs`, `tests/rooms-purpose-missions.test.mjs`, `tests/rooms-governed-handoff.test.mjs` |
| G03 owner command versus message and tenant claims | `tests/rooms-agent-governance.test.mjs`, `packages/rooms-api/test/agent-governance.test.mjs`, support demo |
| G04 delegated fields and mission issuance | `tests/helpers/agent-governance-scenarios.mjs`, `tests/helpers/purpose-mission-scenarios.mjs` |
| G05 CAS/replay and reopen | `packages/rooms-postgres/tests/agent-governance.test.mjs` |
| G06 ownership acceptance and revocation | shared governance scenarios and PostgreSQL governance test |
| G07 inception dispositions and inert adoption | `tests/rooms-agent-inception.test.mjs`, matching PostgreSQL/API tests |
| G08 quantitative/qualitative signals and references | `tests/rooms-attention-signals.test.mjs`, `packages/workflows-rooms/tests/attention-signals.test.mjs` |
| G09 dedupe/freshness/conflict/leases and reopen | shared signal scenarios and `packages/rooms-postgres/tests/attention-signals.test.mjs` |
| G10 limits, semantic guard and concurrent spending | `tests/rooms-agent-execution.test.mjs`, matching PostgreSQL tests; governed Action Gateway tests |
| G11 stale work and uncertain effects | shared execution/mission scenarios, `packages/workflows-rooms/tests/purpose-mission-actions.test.mjs` |
| G12 interrupted activation and governed instruction fallback | `tests/rooms-agent-execution.test.mjs`, configuration/activation PostgreSQL scenarios |
| G13 outcome evidence versus completed tasks | `tests/rooms-purpose-missions.test.mjs`, corresponding API/PostgreSQL/Action Gateway tests |
| G14 origin, delegation, replacement and evolution receipts | continuity and governed-Handoff tests in Rooms/PostgreSQL; `packages/workflows-rooms/tests/governance-autonomy.test.mjs` and `governance-evolution.test.mjs` |
| G15 persistent support demonstration | `tests/purpose-support-demo.test.mjs`, both recovered and escalated variants with separate processes and tamper rejection |
| Existing 012 data through 018 | `packages/rooms-postgres/tests/governance-upgrade.test.mjs`: exact Room/revision preservation, legacy execution before/after, no implicit enrollment |
| Packed public interfaces and migration files | `scripts/pack-consumers/purpose-governance.mjs`, seven public TypeScript fixtures compiled outside the workspace using installed local tarballs |

Tests prove bounded behaviors under their fixtures. They do not prove every
possible concurrency schedule, every external adapter, judgment quality or
production resilience. Actual PostgreSQL tests use isolated schemas and explicit
integration enablement; memory-only tests cannot stand in for durable evidence.

## Reproduce focused qualification

```sh
pnpm build
AGENTPLAT_POSTGRES_TEST=1 PGHOST=127.0.0.1 PGPORT=5432 \
  PGUSER=postgres PGDATABASE=postgres \
  pnpm run verify:purpose-governance /tmp/new-purpose-evidence
pnpm run verify:purpose-consumer
```

The output path must be new, with an existing parent. The focused gate builds the
required package closure, checks public types, runs Rooms/API/PostgreSQL/Workflow
and support-demo tests, rejects skips/TODOs, checks architecture/specification and
adoption links, and records exact commands, TAP logs and source SHA-256 hashes.
Database credentials are not written into the evidence record. Use a disposable
database with schema-creation privileges; tests delete only their own schemas.

Packed verification retains the existing consumer check for Collective Runtime
and Audit and adds the four governance packages, their dependency closure and
TypeScript fixtures. It verifies local tarballs; it deliberately refuses registry
mode because these source additions have not been published. It does not publish
packages or change release flags.

## Broader validation and limits

Objective 10 additionally runs the full workspace build, full type-check, root
unit suite and adapter suite. Infrastructure-specific skipped/TODO tests in those
broader suites must be reported separately; they are not treated as passed.
The focused governance gate requires no skipped tests.

The initial broad run in the development checkout (which also contained the
unpublished optional Jev integration) exposed stale test expectations: six adapter admissions rather than five; 66 catalog entries with
65 publishable packages and one explicitly unpublished assessor; and updated
release-cohort rejection wording. Those development-checkout tests were aligned to its existing policy. The delivery
branch starts from main and excludes the unrelated Jev integration and its test
adjustments. Neither catalog nor release eligibility is widened by this delivery.

See [adoption](adoption.md) for host obligations, incremental rollout, safe
instruction fallback and rollback refusal. The sequential source plan ends with
this qualification; publication and deployment remain separate work.

## Local verification record — 2026-09-28

Environment: Node.js 24.20.0, pnpm 11.25.0, disposable PostgreSQL 16.11 on loopback.
No user databases, deployments, registry publications or release flags were changed.

| Check | Observed result |
| --- | --- |
| Full workspace `pnpm build` | Passed |
| Full workspace `pnpm type-check` | Passed, including public TypeScript fixtures |
| Root `pnpm run test:unit` with PostgreSQL enabled | 1,451 passed, 0 failed, 1 skipped, 6 TODO (1,458 total) |
| Adapter suite with PostgreSQL enabled | 379 passed, 0 failed, 0 skipped across 31 reported test groups |
| Focused purpose qualification | 114 passed, 0 failed/skipped/TODO; includes the explicit 012-to-018 legacy upgrade test |
| Local packed consumer | Passed runtime exports/legacy behavior, seven public TypeScript fixtures and migrations 013–018 |
| Platform/specification/compatibility-source checks | Passed; source presence checks alone are not behavioral proof |
| Adoption documentation and diff whitespace | Passed |

The broad suite's skipped digest-pinned container test and six pre-existing Mesh
work/lease TODO cases are not counted as successful evidence. Local PostgreSQL
coverage does not imply that a live Temporal server or Redis service was exercised.
CI now includes the focused database gate and packed consumer in addition to its
existing checks. The edited workflow was not dispatched remotely in this task.

The default whole-worktree public audit still rejects unrelated, pre-existing
multimedia files under `output/` (unsupported binary types and size limits).
Those files were preserved. An explicitly scoped diagnostic excluding only the
listed multimedia files/directories passed, retaining all 27 frozen exact-file
exceptions. It is **not** a substitute for the default release audit. A clean
publication checkout must pass the normal release gate; no `pnpm run check` or
release-readiness success is claimed here.

## Isolated delivery qualification

The delivery branch is based on `origin/main`, separate from the development
checkout containing optional Jev work. It excludes generated demonstration output,
unrelated multimedia, uncommitted research materials and Jev-specific test changes.
Historical counts above describe the original development checkout, not this
branch's package cohort. The isolated checkout's normal public audit applies with
no multimedia exclusions; delivery check results are recorded in the PR.

The delivery also updates existing overrides from fast-uri 3.1.6 to 3.1.7 and
ip-address 10.4.0 to 10.5.1 to address advisories reported by the production
dependency gate. No audit allowlist or release exception was added.
