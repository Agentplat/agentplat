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

All 64 projections identify `projectionOwner: evaluator`. In the final full
pilot, 48 non-nominal projections are complete for the diagnostic profile and
16 nominal projections remain incomplete because no heal event exists to
anchor post-heal quiescence. The pilot therefore exercises the semantic
endpoint surface and correctly refuses to treat diagnostic evidence as
confirmatory. It still cannot validate the three conditions that invalidated
V28 because the diagnostic reference runtime emits one planning/inference
decision rather than the registered 1,000-decision role-coherence horizon and
does not produce a distributed agreement certificate.

A subsequent one-shard semantic smoke (50-agent benign, two seeds) now binds
the observed `network.heal` event as `healOrQuiescenceEventId` while retaining
an explicit null `agreementEventId`, null interaction delta and
`convergence_evidence_missing`. This is the desired evidence shape: the
projection identifies what was observed and refuses to promote a heal event
into convergence agreement. It still does not satisfy the confirmatory
convergence endpoint.

The final smoke after classification reports eight samples with
`status: complete_for_diagnostic_profile` and
`confirmatoryStatus: incomplete`. Each sample binds
`evidenceType: post_heal_quiescence_v1`, a heal event, a later quiescence
(`work.result`) event, and an interaction delta of 37. No sample reports an
agreement event; this is intentional because the diagnostic runtime has not
yet produced a distributed agreement certificate.

The full eight-shard pilot was then repeated at commit `5ff26e3`. It produced
64 verified samples and 16 verified comparisons. Post-heal quiescence was
present in 48/64 samples (all non-nominal strata), with an interaction delta
of 37 in every present case. The 16 nominal samples correctly have no
post-heal quiescence because no network heal is registered. No sample has a
non-null `agreementEventId`, and no sample reaches the confirmatory horizon.

The final 50-agent benign smoke at commit `503347f` added a real in-process
sparse-BFT certificate over the post-heal quiescence evidence. All eight
samples received a non-null `agreementCertificateDigest`; replay produced the
same certificate binding for each first/replay pair. The certificate binds a
membership epoch, validator set, proposal/value digests and evidence digests.
`agreementEventId` remains null because the certificate is an evaluator
artifact, not a trace event. This closes the certificate requirement for the
diagnostic quiescence profile, but it does not create the 1,000-decision
confirmatory horizon.

## Decision

**V29 is not ready to freeze.** The infrastructure, artifact path and
post-heal quiescence projection passed at the diagnostic horizon, but the
confirmatory instrument still lacks the 1,000-decision role-coherence horizon
and distributed agreement evidence. A confirmatory campaign must not infer
role coherence, useful-decision rate or convergence from these diagnostic
samples, from `missionSuccess`, or from the runner's `passed` status.

## Required next change

The next change is to connect the confirmatory role-coherence horizon to the
actual semantic control loop and add a distributed agreement certificate
rather than only post-heal quiescence. Add negative tests for omitted,
caller-authored, stale and inconsistent semantic fields. Only after those
artifacts are complete and reconstructible from the bundle should V29 be
frozen.
