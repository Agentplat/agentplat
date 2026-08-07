# Integrated collective peer host threat model

## Protected assets

- authenticated message classification and durable admission;
- subsystem lifecycle, progress fairness and readiness;
- existing Work, membership, execution and effect authority boundaries; and
- local queues, cursors and observability metadata.

## Trust boundaries

Raw transport input is untrusted until the configured Mesh verifier succeeds.
Subsystem ports retain responsibility for their domain validation, persistence
and authority. Topology is routing information and never proof of membership.

## Threats and mitigations

| Threat                             | Mitigation                                                             |
| ---------------------------------- | ---------------------------------------------------------------------- |
| Message reaches two runtimes       | Deterministic classification requires exactly one route.               |
| Unknown critical semantics ignored | Unknown or ambiguous critical routes fail closed.                      |
| Acknowledgement loses work         | Ack follows durable subsystem admission.                               |
| Stale directory grants access      | Topology freshness only gates readiness and can never grant authority. |
| Worker starvation                  | Per-cycle budgets and rotating deterministic scheduling.               |
| Restart skips queued work          | Subsystem state remains durable and restore precedes readiness.        |
| Host becomes a super-authority     | Commands delegate to existing ports and preserve their checks.         |
| Sensitive logs                     | Status exposes bounded identifiers and counters, not payload content.  |

## Residual risks

A wrongly implemented injected verifier or subsystem port can violate its own
boundary. Permanent dependency failure can keep the host unready. External
effects remain at-least-once unless their application gateway deduplicates them.
