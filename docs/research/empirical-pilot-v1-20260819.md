# Agent Mesh instrument pilot V1 — 2026-08-19

Status: completed diagnostic pilot. This record is **not release evidence**, is
not a preregistered confirmatory result, and must not be used to claim that
Agent Mesh outperforms a centralized planner.

## Scope

The pilot used the existing diagnostic reference executor with one clean
worktree at source commit `db1c204`. It covered:

- scales 50 and 100;
- nominal, benign, adversarial and mixed strata;
- two seeds per scale/stratum;
- adaptive and centralized runners; and
- first execution plus exact replay for each runner.

The resulting closure was 8 shards, 16 cells and 64 execution slots. All
slots completed with status `passed`; the diagnostic runner retained
`releaseEvidence: false` throughout.

## Results

The diagnostic collector completed with:

- registration digest: `sha256:3b793dfbdd3fa1f7da4a077df4f4d5f68df88a3421b1b20637615301a9acaa29`;
- bundle digest: `sha256:cd81579ba32af9d71345ab130215d7fc09b1cb157f3a891656516aa361632ed2`;
- verified artifacts: 283;
- verified samples: 64;
- verified paired comparisons: 16;
- bundle verification: `passed`;
- release evidence: `false`.

An archival local copy of the diagnostic bundle is retained at
`output/pilots/agent-mesh-instrument-pilot-v1-20260819.zip`. It is diagnostic
material, not a release artifact or a substitute for the future confirmatory
publication bundle.

All four sample classes were observed 16 times: adaptive first, adaptive
replay, centralized first and centralized replay. Every class had status
`passed`. The comparison artifacts reported both runners passed and the paired
diagnostic predicate passed for all 16 cells. These are bounded diagnostic
observations from a reference runner, not population estimates or evidence of
mission superiority.

## Gate behavior

The first attempt was intentionally made from the ordinary dirty workspace.
The eight shards completed, but collection rejected publication with
`a dirty source lock cannot publish a diagnostic bundle`. The pilot was then
repeated from a clean worktree of the same commit, after which collection
produced and verified the bundle. This confirms that source cleanliness is an
active custody condition rather than a documentation-only claim.

## Interpretation and remaining work

The pilot demonstrates that the diagnostic reference runner can exercise both
scales, all four strata, replay, resilience paths and bundle verification in a
clean source context. It does not validate the statistical evaluability
certificate against the normative 240-cell campaign, calibrate useful-decision
or role-coherence semantics, establish stochastic convergence guarantees, or
support any confirmatory claim. The next step is to inspect the pilot artifact
contents for endpoint semantics and then define the frozen V29 pilot/registration
boundary.

The semantic inspection is recorded separately in
`empirical-pilot-v1-semantic-analysis-20260819.md`. It finds that the
diagnostic runner does not emit role-coherence, useful-decision or convergence
fields, so the pilot validates infrastructure but does not yet validate the
full V28 instrument surface.
