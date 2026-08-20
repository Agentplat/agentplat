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

These are operational proxies derived from trace records, not semantic endpoint labels. The regenerated pilot now persists an evaluator-owned semantic sidecar in `semanticProjection.semanticEvidenceArtifacts`, and the trace `recordDigest` resolves to that sidecar. In the current reference scenario the metrics object is empty, so the run still cannot distinguish context conflict, uncertainty, diversity, novelty, and controller restriction. The binding and recovery path are now present; the assessor must populate the metric vector before causal semantic classification can be claimed.

## Implication for the paper

The analysis provides real-runtime evidence that the pilot emits evaluator-readable inference events, fault/recovery context, accepted effects, replay rows, and a recoverable semantic sidecar binding. The remaining gap is now narrower: the assessor must populate the metric vector in the reference scenario. The deterministic 1,000-decision smoke remains a contract/integration result; this runtime trace analysis is evidence with a smaller denominator.
