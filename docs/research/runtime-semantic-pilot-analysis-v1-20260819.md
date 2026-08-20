# Runtime semantic pilot analysis

This analysis reads the retained trace artifacts from `agent-mesh-semantic-pilot-v1-20260819-v4` rather than generating new decisions. It is therefore an independent analysis of an existing runtime pilot and does not start V29.

## Observed runtime evidence

- 64 trace artifacts contained one accepted `inference.assessed` event each.
- 32 replay artifacts were excluded from the decision denominator.
- 48 first-execution traces contained observed fault/recovery context.
- 16 first-execution traces were nominal.
- 64 traces reached an accepted committed effect proxy.
- 0 traces contained an explicit unsafe status or violation reason.

| Operational cause proxy | First executions | Unsafe |
|---|---:|---:|
| Fault or recovery context | 48 | 0 |
| Nominal useful path | 16 | 0 |

These are operational proxies derived from trace records, not semantic endpoint labels. The retained runtime traces do not include the semantic metric vector required to distinguish context conflict, uncertainty, diversity, novelty, and controller restriction. Consequently, this analysis cannot legitimately claim a causal semantic classification or extrapolate to 1,000 runtime decisions.

## Implication for the paper

The analysis provides real-runtime evidence that the pilot emits evaluator-readable inference events, fault/recovery context, accepted effects, and replay rows. It also identifies the remaining instrumentation gap precisely: the runtime trace must carry the evaluator-owned semantic metric vector and its evidence binding if causal semantic results are to be computed from live executions. The deterministic 1,000-decision smoke remains a contract/integration result; this 64-decision trace analysis is runtime evidence with a smaller denominator.
