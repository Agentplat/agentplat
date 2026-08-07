# Governed autonomous mission lifecycle threat model

## Assets and boundaries

The lifecycle protects scope identity, authority epoch, fencing token, policy
binding, operation identity, authorization binding, durable state digest chain,
and bounded budgets. Raw mission instructions, model inputs/outputs, and work
artifacts are explicitly outside this state and remain with their owning ports.

## Threats and controls

| Threat                                                   | Control                                                                                                                                                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advisory control proposal is treated as authority        | Reconfiguration is impossible without an action-specific injected authorization.                                                                                                          |
| Recovered proposal is replaced, cross-scoped, or expired | Reconfiguration intent binds its digest; restore checks scope, authority epoch, action, and current-time expiry before authorization or enactment.                                        |
| Cross-mission, cross-work, or old-epoch replay           | Scope digest, work revision, authority epoch, fencing token, operation ID, and intent digest are checked before invocation.                                                               |
| Expired or future authorization                          | Authorization must be issued no later than and expire after the supplied monotonic logical time.                                                                                          |
| Duplicate delivery after process failure                 | A deterministic prepared operation is persisted before port invocation; ports are required to be idempotent on its ID.                                                                    |
| Forged or substituted restored authorization             | Applied outbox records retain authorization/result digests and a required resolver re-verifies every authorization binding before restore proceeds.                                       |
| Store replacement or rollback                            | Save compares both revision and state digest; predecessor digest and logical-time high-water checks reject rollback snapshots. Production stores must maintain a rollback-resistant head. |
| Request substitution before or after mission creation    | Policy and state both bind the initial request ID and plan-input digest; only logical time may advance.                                                                                   |
| Unbounded autonomous activity                            | Immutable policy budgets cap actions, reconfiguration, transitions, and CAS retries. Exhaustion fails closed.                                                                             |
| Payload disclosure through saga persistence              | Contracts retain only stable identifiers and cryptographic digests; validation rejects unbounded payload fields by construction.                                                          |
| Conflicting concurrent actors                            | CAS failure restarts from the durable head. A changed scope, epoch, or fencing token is rejected rather than merged.                                                                      |

## Assumptions

Digest algorithms and authorization issuers are trusted according to the host's
policy. The in-memory store is a reference implementation for tests and local
composition only; it does not provide a durable rollback-resistant head.
