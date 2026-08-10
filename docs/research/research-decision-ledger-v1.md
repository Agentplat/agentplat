# Research decision ledger V1

Status: pre-results decision record. Entries are append-only in meaning;
corrections require a dated superseding entry rather than silent rewriting.

## Frozen decisions

| ID     | Decision                                                                                                        | Rationale                                                                                                    | Evidence location                                          |
| ------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| RD-001 | Separate source completion, conformance, empirical evaluation and operational readiness.                        | Prevents code coverage or simulation from being presented as deployment evidence.                            | Capability baseline governance and research package index. |
| RD-002 | Compare against a fairness-constrained centralized planner with equal admitted information and accounting.      | Avoids an artificially weak baseline or hidden information advantage.                                        | Evaluation contract V2.                                    |
| RD-003 | Use paired seeds across treatments and exact replay as verification, not independent samples.                   | Controls world/fault variation and avoids pseudoreplication.                                                 | Evaluation campaign contract and data dictionary.          |
| RD-004 | Freeze four scales, four strata, 240 paired cells and 960 execution slots.                                      | Provides finite-range scale and resilience coverage with a declared denominator.                             | Statistical campaign operations and machine registration.  |
| RD-005 | Preserve failures, invalid operations, cancellations and exclusions.                                            | Prevents successful-rerun and survivorship bias.                                                             | Empirical validation protocol.                             |
| RD-006 | Use evaluator-derived traces, ledgers and verdicts as endpoint authority.                                       | Prevents a runner from self-reporting success, cost or safety.                                               | Evaluation contract V2.                                    |
| RD-007 | Freeze Wilson, paired bootstrap, Holm, recovery p95 and role-coherence rules before results.                    | Prevents endpoint and analysis shopping.                                                                     | Protocol configuration and data dictionary.                |
| RD-008 | Require zero registered safety violations.                                                                      | Safety failures cannot be averaged away by mission success.                                                  | Protocol analysis policy.                                  |
| RD-009 | Begin with an external-spend ceiling of USD 0 and forbid paid model/cloud/database/egress use.                  | Preserves affordability and makes later paid execution an explicit new authorization.                        | Protocol budget policy.                                    |
| RD-010 | Sign source evidence and scientific registration with a managed non-exportable key; publish the public key.     | Makes the pre-results commitments independently verifiable.                                                  | Source and scientific attestation runbooks/artifacts.      |
| RD-011 | Keep normative execution unavailable until a real adapter and separate authorization exist.                     | A preregistration must not accidentally become execution authority.                                          | Normative operation and scientific registration artifacts. |
| RD-012 | Label post-registration analyses exploratory.                                                                   | Preserves confirmatory interpretation while allowing scientific follow-up.                                   | Paper outline and data dictionary.                         |
| RD-013 | Fix aggregation seed `20260810` before executable preregistration.                                              | Makes all 10,000 bootstrap resamples reproducible without sampling analyst randomness after results exist.   | V2 campaign design and preregistration.                    |
| RD-014 | Execute one authorized shard per command; provide no implicit full-campaign command.                            | Limits accidental work and makes interruption/resumption boundaries explicit.                                | Local empirical campaign CLI.                              |
| RD-015 | Treat immutable shard receipts as the append-only campaign journal.                                             | Avoids a mutable progress file becoming an alternative evidence history.                                     | V2 execution package.                                      |
| RD-016 | Require exact 48-shard and 960-projection closure before statistical collection.                                | Prevents partial data from being presented as the registered study.                                          | V2 collector.                                              |
| RD-017 | Export raw JSON rows, CSV and table-source JSON, while keeping interpretation human-authored.                   | Preserves a canonical evidence source and prevents presentation tooling from silently changing estimands.    | V2 paper artifacts.                                        |
| RD-018 | Keep local compute, operator time and hardware metadata separate from the registered zero external-spend field. | Avoids interpreting zero paid-provider spend as zero total resource cost.                                    | V2 cost boundary.                                          |
| RD-019 | Run long campaigns through a detached, single-worker supervisor with hash-chained operational events.           | Prevents terminal lifetime from becoming an undocumented stopping rule while preserving one-shard authority. | Durable local campaign supervisor V1.                      |

## Evidence known before empirical execution

- Public source-development release: `collective-capability-baseline-v1`.
- Source-development baseline: 11 objectives and 19 capabilities.
- Managed signing identity: the canonical KMS key recorded in the public source
  attestation, with its PEM public key published as a release asset.
- Empirical study status: `not_executed`.
- Empirical result claims: not permitted.
- Production readiness and deployment authority: not granted.

The final scientific-registration digest and target source commit are recorded
in the external preregistration release because adding those self-referential
values to the source tree would change the commit being registered.

## Future decision records

Before changing any of the following, create a new protocol/campaign identity:

- hypotheses, primary endpoints or confirmatory analysis;
- seed list, scale ladder, strata or stopping rule;
- treatment fairness or information access;
- runner, evaluator, environment, monitor or fault definitions;
- interaction accounting or validity classification; or
- source commit used for confirmatory execution.

A budget increase, provider-backed run, cloud deployment or new data class also
requires an explicit cost and governance record even when it does not change
the scientific estimand.
