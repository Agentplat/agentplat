# Heterogeneous Assessor Ensemble Threat Model

## Assets

The protected assets are authorization decisions, evaluator diversity assumptions, signal bindings, durable assessment history, and operator-controlled policy.

## Controls

- Requests bind invocation, execution domain, surface, modalities, logical time, policy, binding, and signal digest.
- Evaluator descriptors bind implementation digests and declared independence groups, surfaces, and modalities.
- Votes bind the exact request digest; votes and verdicts have domain-separated canonical digests and canonical ordering.
- A quorum requires vote count, per-surface/modality coverage and distinct groups. Same-group disagreement, missing, invalid, timed-out, conflicting, or uncovered assessment is unresolved.
- The durable record uses compare-and-set preparation, high-water fields, bounded retries, and a monotonic anchor to reject rollback and replay.
- Tool and action dispatch is allowed only after an `allow` verdict.

## Residual risks

An independence group is an attestation supplied by the application; a malicious operator can label correlated evaluators as distinct. An external durable store must protect its monotonic anchor independently. The runtime does not persist content, but callers remain responsible for keeping content out of identifiers and supplied digests.
