# Research package index

Status: living index for paper preparation. No empirical result is claimed.

This directory preserves the decisions and reporting structure needed to turn
the collective-control evaluation into a reproducible paper. The normative
contracts remain in the runtime and adaptive-mission documentation; these files
organize that material for research communication.

## Core records

- [Paper outline V1](./collective-control-paper-outline-v1.md): working title,
  research questions, contribution boundaries, methods and planned figures.
- [Data dictionary V1](./empirical-study-data-dictionary-v1.md): observational
  units, endpoints, estimands, units, directionality and missing-data rules.
- [Research decision ledger V1](./research-decision-ledger-v1.md): decisions
  frozen before results and the evidence that future claims must cite.
- [Local empirical execution package V2](./local-empirical-execution-package-v2.md):
  registered adapter, signed authorization, shard resumption, immutable
  evidence and paper-oriented result exports.
- [Durable local campaign supervisor V1](./durable-local-campaign-supervisor-v1.md):
  detached sequential execution, heartbeat, pause/resume/stop controls,
  hash-chained operational events and an incremental paper report.
- [Empirical validation protocol V1](../collective-runtime/empirical-validation-protocol-v1.md):
  authoritative hypotheses, study design, statistical plan and cost gates.
- [Evaluation contract V2](../adaptive-mission/evaluation-contract-v2.md):
  runner, environment, trace, accounting and hidden-monitor boundary.
- [Statistical campaign operations](../adaptive-mission/beta-3-statistical-campaign-operations.md):
  normative ladder, acceptance analysis and artifact custody.

## Evidence classes

The paper must keep four evidence classes separate:

1. architecture and formal assumptions;
2. source-development evidence and signed release attestations;
3. deterministic conformance and replay evidence; and
4. empirical measurements from the registered study.

A stronger evidence class cannot be inferred from a weaker one. In particular,
source completion is not an empirical result, simulator evidence is not an
operational deployment result, and a successful sample is not a population
claim without the registered aggregate analysis.

## Publication discipline

Before the first empirical sample, publish the signed scientific registration,
results template and public verification key. After execution begins, retain
every registered sample, invalid operation record, cancellation and exclusion.
Update paper results from machine-verifiable artifacts rather than manually
transcribed summaries.

Authorship, venue, funding, conflicts, acknowledgements, ethics statements and
data-availability wording remain intentionally unset until the responsible
people make those decisions.
