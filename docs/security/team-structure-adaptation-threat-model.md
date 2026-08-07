# Team structure adaptation threat model

## Protected assets

- approved template catalog and policy;
- execution observation provenance;
- bounded learner state and selection history; and
- separation between advice and execution authority.

## Trust boundaries

Only validated team-execution state may be adapted into an observation. Catalog
approval and role definitions are application policy boundaries. A selection is
untrusted advice until ordinary team formation validates every position.

## Threats and mitigations

| Threat                       | Mitigation                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| Caller injects a reward      | Metrics are derived from exact execution state; no free scalar reward input.       |
| Unsafe template gains weight | Unsafe and failed outcomes never increase preference; unsafe quarantines.          |
| Oscillation                  | Minimum samples, bounded deltas, cooldown and hysteresis.                          |
| Catalog escape               | Exact template digest, permitted role/capability sets and DAG validation.          |
| Replay or rollback           | Observation identity, predecessor digest, CAS revision and monotonic epoch checks. |
| Global monoculture           | State and evidence remain peer-local with bounded exploration.                     |
| Authority escalation         | Selection materializes only a fresh team-formation request at team epoch 1.        |

## Residual risks

Biased local evidence can produce a poor local preference. A malicious catalog
owner can approve unsafe structures. Content-free metrics reduce leakage but do
not prove the truth of a compromised execution adapter.
