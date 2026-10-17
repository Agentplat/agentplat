# Persistent memory review and consumer verification — 2026-10-17

Disposition: ready for code review on local branch `codex/persistent-memory-review`.
No remote PR, package publication, merge or deployment was performed.

## Scoped change

Memory can now be retrieved across conversations using a stable agent subject and
an independently authorized personal/shared audience. Corrections and retirement
preserve immutable revisions; execution evidence pins the exact memory and
instruction revisions. Reviewed definition selection reuses Room approvals and
existing governance, preserving suspension and explicit readmission.

The branch starts at `0142d6e607eec75c0464c13949df8c2d95b48f1e` and contains only
memory, review, examples, tests, packaging and documentation changes. It was
assembled in a managed clean worktree rather than committing the original dirty
checkout. Existing Planner, Event ingress, Runner, Action Control, research and
lockfile modifications from that checkout were excluded.

Implementation commits:

- `1916d72d`: persistent memory, reviewed changes and npm/pnpm consumer verification.
- `eb681e20c0c8dfd039dfc9f912aba3976c0da49f`: canonical evaluator expiry validation.

The final consumer bundle was built at the second commit with a clean working tree.
Subsequent documentation records the verification and does not change its bytes.

## Contract review corrections

| Finding | Correction and evidence |
| --- | --- |
| An operation replay could return a revision beyond retention or without historical read permission. | Replay uses the authenticated historical read path and current-head retention rules. Shared adapter regressions reject expired replay. |
| Audience could change while a historical read awaited I/O/authorization. | Reads fence the final head digest and recheck expiry before returning. A deterministic concurrent restriction test runs against both stores. |
| Sharing permission could change before write admission. | Recheck writes and both share audiences immediately before CAS commit. Regression denies an otherwise valid sharing change. |
| Sparse/cyclic JSON could have different in-memory and persisted JSON meaning. | Reject sparse arrays, extra array properties, cycles and excessive nesting; validate request as well as revision digests. |
| Governance history did not identify the reviewed proposal, and alternate approval reuse could replay the same logical operation. | Optional typed `mode.review` is included in the existing request digest and immutable operation history. Conflicting review binding reuse fails; PostgreSQL retains it after reopen. |
| Proposal/approval or evidence could change/expire while evaluation was pending. | Reload proposal/approval after evaluation and recheck expiry at admission. Regression tests exercise concurrent proposal replacement and both expiry cases. |
| Offset timestamps could compare incorrectly as strings. | Evaluator expiry must be canonical UTC; an offset timestamp cannot pass the lexical UTC comparison. |

The optional governance field is additive. Legacy owner commands and existing
stored operations without it remain valid. It adds audit coordinates, not another
authority owner. Direct owner configuration and execution admission retain their
existing responsibilities.

## Checks completed

- Full clean-worktree `pnpm build` passed.
- Full `pnpm type-check`, including public contract type tests, passed.
- General unit suite: 1,478 cases, 1,465 passed, 7 skipped, 6 declared TODO, zero
  failures. The final expiry refinement also passed its eight definition-change
  tests explicitly.
- Four real PostgreSQL tests passed: memory conformance/races/migrations,
  construction without I/O, exact reviewed-definition audit after pool reopen,
  and existing governance transaction/history/rollback behavior.
- Twenty-five packed packages passed installed-file comparison, strict public
  declaration checking and the real PostgreSQL consumer in four isolated installs:
  pnpm install, frozen pnpm install, npm install and npm ci.
- Independent replay of the final sealed bundle using npm ci passed.
- Four integrity tests rejected altered fixtures and unsealed configuration for
  both consumers before installation or database execution.
- Platform boundary checks and `git diff --check` passed.

No live model or external effect was invoked. Database fixtures use their own
fresh random schemas and remove them. The original consumer application and its
schema were not accessed during this work.

## Exact reproducible bundle

[Bundle receipt and per-package hashes](../../release-artifacts/memory-preview/2026-10-17T23-22-00.044Z-596575b1a4f2/bundle.json)

- Source commit: `eb681e20c0c8dfd039dfc9f912aba3976c0da49f`, dirty flag `false`.
- Selected-source SHA-256: `596575b1a4f26c0167104b01cc55bc9e11b6c5885c1c38b9e5c8082f4d4bdb41`.
- Sealed-bundle SHA-256: `61b67050833c3775e11230b7476880081ec9a7b2a1c62eb421a51bf5361dbbd2`.
- Node `v24.20.0`, pnpm `11.25.0`, npm `11.19.0`.
- Twenty-five local source-preview packages with coordinated manifest version
  `1.1.0`. Their identity is the receipt/hash, not the mutable registry version.

Replay from this branch using a configured local/test PostgreSQL connection:

```sh
AGENTPLAT_POSTGRES_TEST=1 PGDATABASE=postgres \
  node scripts/verify-memory-consumer.mjs \
  --verify release-artifacts/memory-preview/2026-10-17T23-22-00.044Z-596575b1a4f2 \
  --manager npm
```

Generated artifacts are ignored by Git and must be retained/transferred as a whole.
This receipt supersedes the earlier dirty-checkout preview for adoption.

## Review/consumer boundary

The [integration guide](../getting-started/persistent-memory-consumer.md) describes
identity ports, explicit migrations, error handling, exact context evidence and
package-manager overrides. The application still must integrate its own Cognito
and membership rules, catalog/skill revisions, UI, complete application lockfile,
worker and notification policy, migrations and deployment checks.

Retention filters service reads; physical deletion and historical execution
snapshots need a host retention policy. Memory resolution is per record, not a
transactional multi-record snapshot. Room/evaluator checks and governance CAS are
separate admission boundaries rather than a distributed transaction. Stronger
cross-domain revocation requires host coordination. Local integration evidence
is not a production-scale readiness or model-quality claim.

## Proposed PR description

**Title:** Add governed persistent memory and reproducible npm/pnpm consumers

Agents can retain explicitly authorized personal/shared memory across conversations,
correct or retire it, and bind execution evidence to immutable revisions. This
adds an opt-in PostgreSQL ledger and composes reviewed definition selection with
existing Room approvals and governance; legacy memory/context reads also share
expiry and scope checks.

Validation includes the clean monorepo build/types, unit suite, real PostgreSQL
regressions and a sealed 25-package cohort installed with pnpm and npm ci. Product
identity, UI, source collection and deployment remain consumer-owned.
