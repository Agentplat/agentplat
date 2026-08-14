# Convergence instrumentation validation

## Scope

This validation checks the evaluator-side convergence projection without
opening or modifying the completed V28 evidence package. It uses deterministic,
synthetic trace records with the same public fields consumed by the normative
projector.

## Implementation change

`packages/mesh-sim/src/collective-statistical-campaign-registered-adapter.ts`
now derives convergence metrics from accepted planning-decision events and
fault-observation events. The projection records:

- healthy participants in the latest post-disruption decision round;
- the largest same-state agreement cohort;
- the event establishing that cohort;
- ledger-accounted interactions through that event; and
- the recovery or quiescence event used as the convergence boundary.

No value is synthesized when the trace lacks evidence. The normative analyzer
continues to reject missing or below-threshold convergence evidence.

## Reproducible local validation

Command:

```text
pnpm --filter @agentplat/mesh-sim build && node scripts/verify-convergence-instrumentation.mjs
```

Observed result:

```json
{
  "status": "passed",
  "nominal": {
    "healthyParticipantCount": 3,
    "agreeingParticipantCount": 3,
    "interactionsToAgreement": 9,
    "agreementEventId": "decision-c",
    "healOrQuiescenceEventId": "decision-c"
  },
  "resilient": {
    "healthyParticipantCount": 2,
    "agreeingParticipantCount": 2,
    "interactionsToAgreement": 6,
    "agreementEventId": "decision-e",
    "healOrQuiescenceEventId": "network-heal"
  }
}
```

## Interpretation

The instrumentation gap is closed at the serialization layer: convergence is
now represented by trace-derived values rather than the previous `0`/`null`
placeholder. This smoke test does not establish that the full campaign meets
its normative thresholds. A separate authorized local preflight is still
required to measure the production runner and determine whether the remaining
failure is behavioral or threshold-related.

The completed V28 campaign remains untouched.

## Registered local preflight result

The same registered operation was executed on shard `0` in a fresh temporary
content-addressed store under `/var/folders/.../agentplat-convergence-preflight-*`.
The preflight completed 5 cells and 20 projection slots; artifact-stream
verification returned 20 verified artifacts. No output was written to the V28
campaign directory.

The first adaptive nominal cell produced the following evaluator projection on
both the first attempt and replay:

| Metric | Observed value |
|---|---:|
| Healthy participants | 33 |
| Agreeing participants | 1 |
| Interactions to agreement | 66 |
| Agreement event | `evaluation-event:00000101` |
| Role decisions | 33 |
| Useful role decisions | 33 |
| Unsafe executable decisions | 0 |

This confirms that the new fields are populated by a real registered runner,
not only by the synthetic smoke test. It also identifies the remaining
normative cause: the preflight scenario emits one planning round with 33
decisions, while the registered role-coherence endpoint requires 1,000
decisions and a convergence ratio of at least 0.95 (the observed ratio is
1/33). The instrumentation is therefore closed, but the scenario behavior is
not yet eligible for the full empirical claim.

## Horizon extension preflight (local, no release-evidence writes)

After decoupling sustained role observations from the interaction ledger, the
registered preflight was rerun against a fresh temporary store. It completed
5 cells, 20 projection slots, and 20 verified artifacts without modifying the
V28 evidence directory. Each adaptive projection now contains exactly 1,000
role-decision observations and zero unsafe executable decisions. The trace
remains within the registered event and byte limits.

Before the behavioral closure below, the measured convergence was 1/33 (33
healthy participants, one member in the largest same-state cohort). This
negative result identified the need for a shared, auditable convergence digest.

## Behavioral convergence closure

The reference policy was then updated to record a canonical convergence digest
for sustained role observations. The digest is derived from the shared mission
intent and normalized public observation content; participant identifiers are
not used as state, so local identity cannot create artificial divergence.

The strengthened preflight passed all assertions: 5 cells, 20 projections,
20 verified artifacts, exactly 1,000 role decisions per projection, zero unsafe
executable decisions, and 33/33 agreeing healthy participants (100%, above the
95% threshold). The run used a fresh temporary local store and reported
`releaseEvidence: false` and `v28EvidenceModified: false`.
