# Development reconciliation — 2026-09-11

This is a dated reconciliation record, not a production-readiness attestation.

## Integration candidate

The reconciliation branch preserves the local Morphogenesis work from PR #169,
integrates the dependency groups from #162 and #151, the workflow artifact
updates from #160, and the Next.js/React and example toolchain updates from
#142 and #161. Lockfile conflicts retain the existing security overrides;
the workspace Hono override advances with the reviewed Hono update.
TypeScript 7 requires explicit Node types in the Redis sessions and local
simulation adapters. The coordinated release candidate is `0.3.0-beta.8`.
Publication is pending artifact preparation, governance, review and npm 2FA.

PR #123's diagnostic horizon and convergence projection are retained with
corrections: ordinary execution remains opt-in, actual planning-state digests
are preserved, peers are counted distinctly and recovery boundaries follow the
latest disruption. The hardcoded historical-source preflight was removed in
favor of the existing source-bound registered preflight. The former draft's
convergence claim is not adopted. See the convergence validation document.

After integration is verified, #143, #144, #145, #146, #147 and #168 can be
closed as superseded by the newer dependency groups. They must not be merged
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
part of cosmetic cleanup. Active reconciliation worktrees are temporary and
must be cleaned up after their commits reach main.

## Explicit remaining validation obligations

| Work | Closure evidence | Current disposition |
| --- | --- | --- |
| Distributed Morphogenesis staging | Authorized execution across the specified failure domains, exact baseline/post-upgrade scenarios, signed receipts, repetitions, fault and recovery gates | Deferred; local checks do not qualify staging |
| Long-duration stability and host-loss recovery | A separately specified prolonged run and real crash/host-loss recovery evidence | Not established |
| Full registered empirical campaign | Current clean-source registration and authorization; verified artifacts for every required shard; analysis against unchanged registered thresholds | Pending; no full-campaign or convergence claim |
| Six Mesh reducer test placeholders | Executable negative cases for execution records, release/cancellation, lease renewal, takeover proposals, votes and certificates, or an exact mapping to equivalent existing tests | Test debt retained in `tests/mesh-reducer.test.mjs`; not silently counted as passing |
| Isolated runner container test | Execute the opt-in read-only/no-network container test with its pinned image | Environment-dependent; local unit runs omit it |
| Promotion to npm latest | Complete promotion criteria and release-owner decision | No automatic promotion; use coordinated next explicitly |

## Verification boundaries

The local Morphogenesis commit `db13385` passed the complete `pnpm run check`
in a clean worktree with Node 24.20.0. The initial original-checkout audit
rejected historical ignored release tarballs; those artifacts were preserved.
The corrected convergence branch passed 1,361 unit tests, with one skipped
container test and six pre-existing TODO cases. The combined candidate must
pass its own clean check, CI and consumers before integration/publication.
