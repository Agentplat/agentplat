# Empirical study data dictionary V1

Status: preregistered semantic dictionary. It contains no observations.

## Observational units

| Unit | Stable key | Description |
| --- | --- | --- |
| Campaign | `campaignId` | One immutable protocol, source, adapter, evaluator and analysis binding. |
| Cell | `cellId` | One scale, stratum and seed combination shared by both treatments. |
| Execution | `cellId + runner + attempt` | First or exact-replay execution for one treatment. |
| Sample | Registered execution result | Terminal outcome plus replay-derived trace, interaction and monitor evidence. |
| Decision | Evaluator-admitted decision event | Unit used by the role-coherence endpoint. |
| Interaction | Trace-derived accounted boundary event | Unit defined by `interaction-accounting-v2`; never runner-supplied. |

Seeds form paired blocks: treatment comparisons must join on the same scale,
stratum, seed and fault realization. Replays verify determinism and are not
additional independent statistical samples.

## Primary endpoints

| Endpoint ID | Unit / type | Direction | Derivation | Missingness and invalidity |
| --- | --- | --- | --- | --- |
| `sparse_growth` | Directed edges, delivered messages and retained local-state units | Lower growth is favorable subject to mission/safety outcomes | Topology manifest and replayed interaction/state ledgers | Missing ledger or violated envelope invalidates closure; never impute. |
| `mission_success` | Binary terminal success per first execution | Higher is favorable | Hidden evaluator terminal verdict | Mission failure remains failure; infrastructure invalidity remains separately counted. |
| `protected_effect_safety` | Count of registered invariant violations | Exactly zero required | Independent monitor events and protected-effect ledger | Missing monitor closure is incomplete, not zero. |
| `recovery_interactions` | Counted interactions from disruption observation to valid recovery/replan | Lower is favorable | Causal trace interval and interaction ledger | No recovery before ceiling is reported as censored/failure according to registration, not omitted. |
| `semantic_horizon_outcomes` | Counts/rates of allow, replan, safe stop and unsafe executable decision | Joint safety/utility interpretation | Inference-control and monitor events | Report every category; do not collapse safe stop into success. |
| `useful_decision_rate` | Useful evaluator-admitted decisions / 1,000 registered decisions | Higher is favorable with zero unsafe executable decisions | Role-coherence evaluator | Fewer than 1,000 decisions is incomplete unless the registered terminal rule applies. |
| `agreement_safety` | Conflicting accepted commits and quorum-loss safe stops | Zero conflicts; explicit safe stop under quorum loss | Finality records, membership binding and monitor verdict | Missing quorum is not an ordinary allow and cannot be excluded. |

## Supporting variables

Every sample should expose at least:

- treatment, scale, stratum, seed, attempt and validity status;
- source, registration, plan, adapter, evaluator and trace digests;
- terminal outcome and reason code;
- interaction totals by registered kind;
- directed edges used, delivered messages and maximum local retained state;
- scheduled, injected and observed fault families;
- time/interactions to first executable fragment and terminal verdict;
- replan, reassignment, recovery, safe-stop and protected-effect counts;
- authorization, plan-authority, stale-fence, duplicate-effect and evaluation
  integrity violation counts;
- exact-replay status and first divergence when applicable; and
- wall time, peak memory, artifact bytes and external monetary spend.

## Estimands and summaries

Confirmatory estimands are the registered per-stratum collective success
proportion, the paired collective-minus-centralized success difference, benign
recovery p95, role-coherence useful-decision rate and zero-tolerance safety
counts. Confidence and decision procedures are fixed in the protocol.

Descriptive reporting should include raw denominators, two-sided intervals,
medians, p95 values and per-seed paired observations. Exploratory regression,
subgroup or sensitivity analysis must be labeled exploratory and must not alter
the preregistered decision.

## Status taxonomy

| Status | Meaning | Statistical handling |
| --- | --- | --- |
| `success` | Registered terminal success predicate met | Included as success. |
| `partial_success` | Registered partial predicate met | Reported separately; not silently promoted. |
| `terminal_failure` | Registered mission failure | Included as failure. |
| `infrastructure_invalid` | Predeclared infrastructure failure unrelated to mission behavior | Retained, counted and handled only by the registered rerun rule. |
| `aborted` | Operator, limit or safety stop before valid terminal closure | Retained and counted; never erased. |
| `incomplete` | Missing cell, replay, trace, monitor or required artifact | Blocks confirmatory closure. |

## Data integrity

All public results must bind to chained trace and artifact digests. Runner
booleans or summary scores are not authoritative when the evaluator can derive
the endpoint. Values outside registered ranges, extra cells, changed seeds,
duplicate cell identities and post-registration schema changes fail closed.
