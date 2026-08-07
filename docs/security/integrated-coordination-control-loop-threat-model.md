# Integrated coordination-control loop threat model

## Protected assets

- source-bound control evidence and revision heads;
- deterministic proposal selection and stability policy;
- pending proposal delivery; and
- separation between feedback, coordination and execution authority.

## Trust boundaries

Source adapters authenticate and project local records. The loop validates only
content-free projections. Delivery adapters transport advisory proposals;
recipients separately decide whether and how to enact them. The production store
is trusted to keep a monotonic head outside the replaceable snapshot.

## Threats and mitigations

| Threat                                        | Mitigation                                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Fabricated or substituted source              | Closed source/version/implementation bindings and exact record digests.                                     |
| Old evidence restores a permissive state      | Revision-and-digest CAS, source/time high-water checks and a required external monotonic head.              |
| Conflicting evidence is silently selected     | Equivocation and scope conflict fail closed to pause dispatch.                                              |
| Noisy signals cause rapid role or team churn  | Cooldown, hysteresis and recovery margins.                                                                  |
| Backpressure or expiry hides a safety request | Live pending records require acknowledgement; expiry is explicit non-delivery and full outbox fails closed. |
| Feedback loop directly changes authority      | Output is advisory and carries no assignment, Work Contract, lease, fence or effect grant.                  |

## Residual risks

Compromised but correctly bound sources can emit misleading scores. Correlated
sources may not provide true independence. At-least-once delivery before expiry
requires proposal-ID deduplication by the recipient; operators must observe and
handle explicit expired records. A store without its required external monotonic
head can restore an older internally valid prefix.
