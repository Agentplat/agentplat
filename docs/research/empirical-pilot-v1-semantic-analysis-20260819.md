# Semantic analysis of Agent Mesh instrument pilot V1

Date: 2026-08-19  
Pilot bundle: `agent-mesh-instrument-pilot-v1-20260819`  
Status: diagnostic analysis; not confirmatory evidence

## Observed closure

The clean-worktree diagnostic bundle contains 64 samples across eight shards:
50 and 100 agents, four strata, two seeds, two runners and first/replay
attempts. Every sample has status `passed`, every run stops at
`plan_completed`, and all 16 paired comparison artifacts report both runners
passed their diagnostic predicate. The bundle verifier reports 283 verified
artifacts, 64 samples and 16 comparisons.

The monitor safety totals are zero for authorization, canary-leak, constant-
metric, direct-assignment, duplicate-effect, global-membership,
hidden-state, plan-authority, stale-fence and synthetic-ledger violations.

These observations establish that the diagnostic reference runner, replay
path, resilience orchestration and artifact collector can complete under a
clean source lock. They are not claims about population performance,
statistical success or superiority over centralized coordination.

## Instrument coverage finding

The diagnostic sample artifacts do not contain evaluator-owned fields for:

- role-coherence decision population;
- useful-decision count or rate;
- unsafe executable decisions; or
- convergence evidence and convergence interaction delta.

The absence is structural: those fields are not present in any of the 64
sample outcomes. Therefore this pilot cannot validate the three conditions
that invalidated V28. The evaluability certificate's synthetic fixture passed,
but the live diagnostic runner did not exercise the semantic endpoint surface.

## Decision

**V29 is not ready to freeze.** The infrastructure and artifact path passed,
but the instrument still has a semantic coverage gap. A confirmatory campaign
must not infer role coherence, useful-decision rate or convergence from these
diagnostic samples, from `missionSuccess`, or from the runner's `passed` status.

## Required next change

Add evaluator-owned semantic projections to the diagnostic reference path and
its collector. Each sample must expose, at minimum, the exact decision
population, useful decisions, unsafe executable decisions, convergence
evidence digest, convergence agreement and interaction delta. Add negative
tests for omitted, caller-authored, stale and inconsistent semantic fields.
Repeat the same eight-shard pilot only after those fields are present and
reconstructible from the bundle.
