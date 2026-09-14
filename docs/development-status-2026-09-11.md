# Development reconciliation — 2026-09-11

This is a dated reconciliation record, not a production-readiness attestation.

## Reconciliation completed — 2026-09-14 (UTC)

Merged PR #170 (`0ec4f1fa9f02349e38d2dee5a443df694e0d2ee1`) preserves the local Morphogenesis work from PR #169,
integrates the dependency groups from #162 and #151, the workflow artifact
updates from #160, and the Next.js/React and example toolchain updates from
#142 and #161. Lockfile conflicts retain the existing security overrides;
the workspace Hono override advances with the reviewed Hono update.
TypeScript 7 requires explicit Node types in the Redis sessions and local
simulation adapters. All 65 packages are now published as `0.3.0-beta.8` on `next`, from
`0e1e34e8755bfdecf708314130cc2385b4797f95`. The full approved-release
verification passed. See the [distribution record](releases/beta8-distribution-20260914.md).
The final closeout changes documentation only; there is no newer package code
to publish. No PR remained open at the pre-closeout audit.

PR #123 was closed in favor of #170. Its diagnostic horizon and convergence projection are retained with
corrections: ordinary execution remains opt-in, actual planning-state digests
are preserved, peers are counted distinctly and recovery boundaries follow the
latest disruption. The hardcoded historical-source preflight was removed in
favor of the existing source-bound registered preflight. The former draft's
convergence claim is not adopted. See the convergence validation document.

PRs #143, #144, #145, #146, #147 and #168 were closed as superseded by
reconciliation PR #170 and the newer dependency groups. They must not be merged
again and downgrade versions or recreate old lockfiles.

PR #3 was closed as an obsolete alternative to the governed A2A/Registry
implementation already shipped in Beta 7; this does not assert API equivalence
with the abandoned draft. PR #164 was closed by editorial decision without
adopting the optional third-party shipping badge.

## Branch disposition

The historical local branches associated with closed PRs #97, #98, #100,
#102–#108 remain preserved. Their original commits are not all ancestors of
main; the collective baseline was subsequently consolidated in #109. They
are historical references, not merge candidates. The control-plane branch
belongs to merged PR #125. Preserve these branches until their historical
reference value has been reviewed; do not delete unmerged commit objects as
part of cosmetic cleanup. The reconciliation worktrees were removed after integration.
The retained historical runner at `f041284` is clean; its registration and
artifacts are historical evidence, not current-source campaign validation.
Three worktree records point to absent temporary directories; they contain no
active checkout and are retained as historical metadata. Merged local branches
(including the A2A release branch at `68203c2`, already an ancestor of main)
are references, not pending development.

## Explicit remaining validation obligations

| Work | Closure evidence | Current disposition |
| --- | --- | --- |
| Distributed Morphogenesis staging | Authorized execution across the specified failure domains, exact baseline/post-upgrade scenarios, signed receipts, repetitions, fault and recovery gates | Deferred; local checks do not qualify staging |
| Long-duration stability and host-loss recovery | A separately specified prolonged run and real crash/host-loss recovery evidence | Not established |
| Full registered empirical campaign | Current clean-source registration and authorization; verified artifacts for every required shard; analysis against unchanged registered thresholds | Pending; no full-campaign or convergence claim |
| Six Mesh reducer test placeholders | Executable negative cases for execution records, release/cancellation, lease renewal, takeover proposals, votes and certificates, or an exact mapping to equivalent existing tests | Test debt retained in `tests/mesh-reducer.test.mjs`; not silently counted as passing |
| Isolated runner container test | Execute the opt-in read-only/no-network container test with its pinned image | Passed separately on the candidate; ordinary unit runs still omit it |
| Promotion to npm latest | Complete promotion criteria and release-owner decision | No automatic promotion; use coordinated next explicitly |

## Verification boundaries

The local Morphogenesis commit `db13385` passed the complete `pnpm run check`
in a clean worktree with Node 24.20.0. The initial original-checkout audit
rejected historical ignored release tarballs; those artifacts were preserved.
The corrected convergence branch passed 1,361 unit tests, with one skipped
container test and six pre-existing TODO cases. The combined candidate builds and the Next.js production example builds.
The opt-in container isolation test passed separately on Node 20.19.3 with
read-only filesystem and no network. TypeScript 7 removed its legacy parser
API; the release syntax audits now use the pinned Babel 7 parser (development
dependency only), with 18 focused tests covering import and declaration edges.
The combined code at `fda648f` passed the complete `pnpm run check`: 1,364 unit
cases passed, six historical TODO cases remained, and the ordinary container
case was skipped (passed separately as noted above). Package smoke verified
all 65 tarballs and 216 API surfaces through pnpm and independent npm consumers;
the final public TypeScript consumer passed at Beta 8. Production dependency
audit reported zero advisories. npm governance verification passed with no
findings. Before publication, registry inspection found all 65 names but no Beta 8
versions. After publication, all 65 exact versions and `next` tags passed;
all three clean registry consumers passed in the same GitHub workflow.

## Integration and review closure

| Item | Final disposition |
| --- | --- |
| Initial local Morphogenesis work | Preserved in `db13385`, PR #169; integrated through #170 |
| PRs #142, #151, #160, #161, #162, #169 | Included in #170; GitHub records them as merged |
| PRs #123, #143–#147, #168 | Closed in favor of the reviewed corrections/newer dependencies in #170 |
| PR #3 | Closed as obsolete; no claim of draft API equivalence |
| PR #164 | Closed by editorial decision |
| PR #171 | Merged: permanent owner PR-review exception, required CI retained |
| PR #173 | Merged: exact-version Beta 8 npm review exception; temporary settings restored after publication |
| PR #174 | Merged: release artifact retention raised to 30 days |

GitHub does not allow an author to approve their own PR. The explicitly
authorized alternative is the standing `douglas-grishen` review-ruleset bypass
in `pull_request` mode. It leaves the separate required `check` rule intact.
The npm environment again prevents self-review and administrator bypass;
both temporary Beta 8 exception variables were removed. Governance verification
passed after restoration. This distinction is documented in the
[npm security boundary](security/npm-release-security.md).

The original ignored release artifacts were moved out of the checkout into a
local release archive, with 344 SHA-256 entries verified; no original work was
discarded. The first Beta 8 staged cohort was retired in full when its GitHub
artifact expired. All 65 replacement staged tarballs were downloaded and
matched to the new source-bound GitHub artifact before publication. Local
archives preserve the old and new manifests, stage comparison and approval
receipts, distribution report, branch/PR inventory and unchanged `latest` tags.

## Channel decision and historical metadata

`next` is the complete coordinated Beta 8 cohort. `latest` remains unchanged
for all 65 packages. Public checks, package smoke, the reference Next.js build
and clean registry consumers passed, but external downstream validation and
a stable API promotion review are not established. Under the
[release-channel criteria](release-channels.md), publication alone does not
justify promotion. Use `next` explicitly.

The registry also retains 214 historical `agentplat-stage-*` tag entries from
the legacy public publisher. They are public aliases to old versions, not
unapproved private staged packages or missing Beta 8 development. Their
separate maintenance procedure remains documented in the security boundary;
this reconciliation preserved them and all historical versions.

The remaining operational/campaign obligations above have explicit closure
criteria. They are deferred validation and test debt, not undisclosed branches
waiting to ship. Package distribution does not establish production readiness.
