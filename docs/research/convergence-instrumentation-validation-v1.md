# Convergence instrumentation validation

## Scope and evidence boundary

The registered projector derives convergence from accepted, post-disruption
planning-state observations instead of constant zero/null placeholders.
Participants are distinct peers. Repeated records cannot inflate the agreement
cohort, and peers observed after disruption remain in the denominator if they
are absent in the last round. Recovery uses a heal event after the latest
observed disruption, never a heal from an earlier fault cycle.

The registered runner requests a diagnostic 1,000-observation horizon. Ordinary
closed-loop executions retain their default behavior; callers may explicitly
set `roleObservationHorizon` up to 1,000. Repeated decisions use the same local
observations and do not authorize additional effects. They are not independent
mission executions, longitudinal evidence or proof of organizational improvement.

## Review of the former draft

PR #123 used a digest of shared mission inputs as the final convergence state.
Equal inputs do not establish agreement between decisions or planning states.
The corrected implementation retains the actual local planning-state digest.
No 95% convergence claim follows from the diagnostic horizon. Missing or
below-threshold results must remain failures in the normative analyzer.

The former draft also supplied a historical source commit and `clean: true`
while executing current code. Its hardcoded local preflight is replaced by the
existing registered preflight workflow, which validates current source and
requires a matching authorization. Historical V28 evidence is unchanged.
Prior draft observations are not attestations of this revised implementation.

## Verification and remaining work

After building, run `node --test tests/convergence-instrumentation.test.mjs`
and `node scripts/verify-convergence-instrumentation.mjs`. These are synthetic
and local runtime checks only. The full registered campaign remains pending.
Its closure requires clean-source registration, matching implementation and
evaluator digests, valid authorization, verified artifacts for every required
shard, and measured results evaluated against the registered thresholds.
Use `scripts/collective-beta3-registered-preflight.mjs` and the existing empirical
campaign runbooks; do not reuse the historical authorization for changed code.
