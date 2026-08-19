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

The second semantic pilot now contains an evaluator-owned `semanticProjection`
in every sample. The fields are present and replay-stable, but their observed
coverage is incomplete:

- role-coherence decision population: 1 observed decision per execution versus
  the registered population of 1,000;
- useful-decision count: 1 observed useful decision per execution;
- unsafe executable decisions: 0 observed; and
- convergence evidence: absent, with reason code
  `convergence_evidence_missing`.

All 64 projections identify `projectionOwner: evaluator` and have status
`incomplete`. The pilot therefore exercises the semantic endpoint surface and
correctly refuses to treat it as complete. It still cannot validate the three
conditions that invalidated V28 because the diagnostic reference runtime emits
one planning/inference decision rather than the registered 1,000-decision
role-coherence horizon and has no evaluator-owned convergence artifact.

A subsequent one-shard semantic smoke (50-agent benign, two seeds) now binds
the observed `network.heal` event as `healOrQuiescenceEventId` while retaining
an explicit null `agreementEventId`, null interaction delta and
`convergence_evidence_missing`. This is the desired evidence shape: the
projection identifies what was observed and refuses to promote a heal event
into convergence agreement. It still does not satisfy the confirmatory
convergence endpoint.

## Decision

**V29 is not ready to freeze.** The infrastructure and artifact path passed,
but the instrument still has a semantic coverage gap. A confirmatory campaign
must not infer role coherence, useful-decision rate or convergence from these
diagnostic samples, from `missionSuccess`, or from the runner's `passed` status.

## Required next change

Extend the diagnostic reference path so that it emits the actual registered
role-coherence horizon (or explicitly register a diagnostic-specific horizon)
and an evaluator-owned convergence artifact with agreement and interaction
delta. Add negative tests for omitted, caller-authored, stale and inconsistent
semantic fields. Repeat the same eight-shard pilot only after the observed
decision population and convergence evidence are complete and reconstructible
from the bundle.
