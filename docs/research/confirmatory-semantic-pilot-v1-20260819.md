# Confirmatory semantic-horizon pilot report

**Date:** 19 August 2026  
**Execution:** `confirmatory-semantic-horizon-smoke-v1`  
**Command:** `pnpm run verify:confirmatory-semantic-horizon-smoke`

## Purpose

This pilot exercises the evaluator-owned semantic-horizon evidence chain without starting the registered V29 campaign. It uses the existing `SequentialSemanticGuaranteeEngineV1`, the confirmatory projection contract, and the reference `InProcessSparseBftFinalityGatewayV1`.

## Result

The pilot observed exactly 1,000 decisions and reached `complete`. It produced 973 useful decisions, 27 `not_useful` decisions, and zero `unsafe` decisions. The sparse-BFT gateway issued the agreement certificate with four validators. Replay was stable, stale evidence was rejected, and the serialized bundle was rehydrated and reprojected with the same projection digest.

This is deterministic integration evidence, not a V29 campaign, a population estimate, or mission-performance evidence. The 27 non-useful decisions are currently classified by disposition; the pilot does not infer their causal explanation. A follow-up runtime pilot is required to distinguish restrictive control policy from legitimate replanning or evaluator operationalization.

## Exploratory horizon sensitivity

| Horizon | Useful | Rate | Status |
|---:|---:|---:|---|
| 100 | 98 | 0.980 | incomplete (certificate intentionally absent) |
| 250 | 244 | 0.976 | incomplete (certificate intentionally absent) |
| 500 | 487 | 0.974 | incomplete (certificate intentionally absent) |
| 1,000 | 973 | 0.973 | complete |

The sensitivity table is exploratory. It does not change registered thresholds or create additional statistical samples; replays and prefixes are derived from the same deterministic decision stream.

## Reproducibility checks

- Trace-event and decision binding: enforced.
- Registration, membership epoch, and membership configuration binding: enforced.
- Decision-root recomputation: passed.
- Sparse-BFT gateway certificate: passed.
- Exact replay: passed.
- Bundle serialization and recovery: passed.
- Stale evidence rejection: passed.
- V29 campaign: not started.
