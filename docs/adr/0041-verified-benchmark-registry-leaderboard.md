# ADR 0041: Verified Benchmark Registry and Leaderboard

## Status

Accepted.

## Context

Comparing autonomous participants requires more than a reported score. A result must be bound to an environment descriptor, immutable scenario, scale profile, seed, resource budget, exact source/artifact lock, and replayable trace.

## Decision

`@agentplat/mesh-sim` supplies a local, pure registry contract. A suite binds a multi-domain scenario to one of the 500/5K/100K scale profiles and its interaction budget. Participant adapter descriptors are provider-neutral and use open identifiers so third-party implementations do not require a core enum change.

Submissions contain trace facts, not a caller-provided score. `MetricProjectionV2` is derived by the evaluator from those facts. Structural digests alone do not establish provenance, so verification requires a locally trusted evidence-verifier port for both candidate and baseline traces. Every candidate is paired with the suite baseline under the same scenario, seed, and maximum budget. Exact source, artifact, build, trace, and replay digests make substitution detectable.

One leaderboard is bound to one exact suite manifest. Duplicate submissions and replayed trace bindings are ineligible and cannot occupy another rank. The leaderboard excludes all ineligible submissions; they are listed separately with a reason and never receive a rank. Equal scores share a rank and deterministic digest order makes the serialized result stable. V1 ranks the candidate's evaluator-derived absolute projection; the paired baseline is an eligibility control, not a caller-selected relative-score formula.

## Consequences

The module is transport-neutral and needs no service, cloud account, or provider runtime. It intentionally does not claim a benchmark is representative of a production environment; suite authors remain responsible for scenario relevance and evaluator governance.
