# ADR 0038: Heterogeneous Assessor Ensemble

## Status

Accepted.

## Decision

Inference, tool, and action signals can be assessed by a bounded ensemble of independently identified evaluators. The runtime exchanges only request digests and stores only digests, identifiers, verdicts, and bounded reason/evidence references.

An ensemble policy requires a minimum number of votes, a minimum number of distinct independence groups, declared surface and modality coverage, bounded assessor timeouts, and bounded optimistic-concurrency retries. One group contributes at most one quorum vote, and every required surface and modality must have the configured independent-group coverage. Votes bind the exact request digest. A timeout, missing response, invalid response, same-group disagreement, lack of coverage, or prepared-but-unfinished assessment produces `unresolved`.

The verdict preserves unanimous `allow`, `modify`, or `block`; consumers decide how to apply `modify`. The provided tool/action adapter authorizes dispatch only for `allow`, so modification, block, and unresolved are fail-closed.

Durable state records a prepared invocation before any assessor call and terminalizes it with compare-and-set. A monotonic anchor detects state rollback. Repeating a completed request is idempotent; retrying the exact live prepared invocation resumes that reservation without changing its identity.

## Consequences

Applications supply evaluator implementations and durable storage/anchors. The open-core runtime is deterministic, content-free, provider-neutral, and does not claim that distinct identifiers alone prove real-world independence.
