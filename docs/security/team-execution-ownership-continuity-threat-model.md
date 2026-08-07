# Team execution ownership continuity threat model

## Protected assets

- current coordinator authority and fencing state;
- execution checkpoint lineage and availability;
- stable dispatch identities and member-side idempotency; and
- Work Contract, membership and artifact bindings.

## Trust boundaries

The authority resolver, checkpoint store and certificate verifier are trusted
local dependencies. A certificate proves availability under one configuration;
it does not grant Work or effect authority. Imported state is untrusted until
all digests, scope bindings and lineage are verified.

## Threats and mitigations

| Threat                              | Mitigation                                                                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Stale coordinator continues writing | Exact authority and membership fence is enforced atomically by every injected durable CAS and effect port.                                   |
| Checkpoint fork                     | One digest per execution revision and authority generation; conflicts fail closed.                                                           |
| Partial or unavailable state        | Publication requires the configured availability certificate.                                                                                |
| Cross-team replay                   | Tenant, mesh, objective, root Work, team and execution bindings.                                                                             |
| Membership rollback                 | Certificate binds epoch and configuration digest.                                                                                            |
| Duplicate member effect             | Recovered pending work retains the original dispatch identifier.                                                                             |
| Secret transfer                     | The trusted execution handoff codec must exclude credentials, hidden reasoning and provider session memory before continuity receives state. |

## Residual risks

A compromised current owner can produce bad but attributable state. Permanent
partitions can halt progress. A non-atomic injected port invalidates the stale
writer guarantee, and continuity does not scan handoff content for secrets.
Exactly-once effects still require shared durable idempotency at the application
effect boundary.
