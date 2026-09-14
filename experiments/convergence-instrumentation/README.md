# Convergence instrumentation validation

Status: local checks documented; full revised registered campaign pending.
Evidence class: synthetic instrumentation validation.

## Question and method

Check that convergence derives from accepted post-disruption planning-state
observations, counts distinct peers and uses the appropriate recovery event.
The 1,000-observation diagnostic horizon repeats local observations; it does not
represent 1,000 independent mission executions.

## Reproduction and artifacts

- [Scope and correction record](../../docs/research/convergence-instrumentation-validation-v1.md)
- [Tests](../../tests/convergence-instrumentation.test.mjs)
- [Verification script](../../scripts/verify-convergence-instrumentation.mjs)

After building the workspace, run:

```sh
node --test tests/convergence-instrumentation.test.mjs
node scripts/verify-convergence-instrumentation.mjs
```

## Interpretation and limits

The record rejects the former use of identical mission inputs as proof of
convergence. No 95% convergence result follows from the diagnostic horizon.
The revised registered campaign requires its own clean-source registration,
matching authorization, verified shards and threshold analysis. Historical V28
evidence is unchanged. This entry contains no new campaign result or rerun.

[Back to experiments](../README.md)
