# Replicated planning artifact plane threat model

## Protected properties

The artifact plane protects:

- exact tenant, mesh and policy-domain isolation;
- immutable content-addressed planning records;
- producer peer, instance, key and membership-epoch provenance;
- normal planning admission and authority checks after retrieval;
- durable retry without accepting an offer before its content exists;
- bounded request, response and repository resource use.

It does not protect credentials, private reasoning, arbitrary user files or
provider state because those values are outside the artifact schema.

## Trust boundaries

The local host trusts its configured PostgreSQL pool, membership/key-history
resolver, private signing key, clock, collective-sync transport and planning
admission policy. Remote members, remote storage, HTTP headers and every
retrieved byte remain untrusted until verification completes.

The source signature authenticates the publication author. The signed
collective-sync response authenticates the peer that served the record. Both
proofs are required so an intermediate cache cannot invent a producer record.

## Threats and controls

| Threat                                             | Control                                                                                            |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Cross-tenant or cross-mesh substitution            | Exact envelope, publication, repository and runtime scope checks                                   |
| A member serves a record for another producer      | Embedded producer signature plus historical membership/key verification                            |
| Correct fragment digest with substituted plan view | Full artifact digest and normal `PlanningFragmentRepositoryRecordV1` validation                    |
| Offer arrives before artifact                      | Durable inbox retry, exact producer point resolution and normal envelope reprocessing              |
| Fetch amplification or arbitrary URL access        | Resolver targets only the authenticated offer sender through configured peer endpoints             |
| Oversized or deeply nested content                 | Collective Sync 1 MiB envelope cap, planning-record canonical byte cap and bounded JSON validation |
| Content-reference reuse                            | Immutable PostgreSQL primary key and canonical equality check                                      |
| Fragment identity reuse with different content     | Scope-bound domain-identity uniqueness and fragment-digest comparison                              |
| Membership or key rotation during fetch            | Request/response bind one membership configuration; publication binds its producing configuration  |
| Replay after restart                               | Content and sync-record idempotence; conflicting duplicates fail closed                            |
| Availability result used as authority              | Runtime always re-enters existing Mesh and planning reducers; resolver cannot construct Work state |
| Network partition                                  | No unsafe fallback; inbox remains retryable until delivery or envelope expiry                      |

## Residual risks

- V1 does not reconcile forks or provide Byzantine consensus. A sufficiently
  colluding membership can still corroborate false causal state.
- A malicious authorized producer can publish a semantically poor but
  well-formed plan. Local planning admission, Trust and downstream controls
  must reject or restrict it.
- Permanent producer loss before another peer obtains the artifact can prevent
  progress. Proactive replication and Byzantine availability certification are
  later layers.
- HTTP authentication, TLS, endpoint discovery, rate limiting and deployment
  isolation remain host responsibilities.
- PostgreSQL backup integrity and rollback detection remain operational
  responsibilities outside this repository adapter.
