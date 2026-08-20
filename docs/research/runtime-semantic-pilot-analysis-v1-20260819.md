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

These are operational proxies derived from trace records, not semantic endpoint labels. The regenerated pilot now persists an evaluator-owned semantic sidecar in `semanticProjection.semanticEvidenceArtifacts`, and the trace `recordDigest` resolves to that sidecar. The reference assessment supplies all six bounded dimensions: role coherence 10,000 bps, mission alignment 10,000 bps, context conflict 0 bps, uncertainty 0 bps, action diversity 8,000 bps, and action novelty 7,500 bps. These values are reference-scenario evidence, not a prevalence estimate for deployment workloads.

## Implication for the paper

The analysis provides real-runtime evidence that the pilot emits evaluator-readable inference events, fault/recovery context, accepted effects, replay rows, and a recoverable six-dimensional semantic sidecar binding. The deterministic 1,000-decision smoke remains a contract/integration result; this runtime trace analysis is evidence with a smaller denominator.
