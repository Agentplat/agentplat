# Authenticated causal state synchronization threat model

## Protected assets

- the integrity and order of causal operational evidence;
- the binding between synchronized state and certified membership;
- the correctness of the local readiness decision;
- tenant, mesh, policy-domain, peer, and instance isolation;
- bounded CPU, memory, network, and database consumption;
- confidentiality of material that is not synchronization-safe.

## Trust boundaries

Peers own independent repositories and signing keys. The membership registry is
the source of current member instances and verification keys. The transport is
untrusted. A serving peer may be stale, faulty, compromised, or selectively
available. Domain adapters are trusted to apply the same semantic validation
and deterministic reducers used by live ingestion.

## Threats and controls

| Threat                                        | V1 control                                                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| forged or cross-tenant response               | Ed25519 signature plus exact scope and audience-instance binding                                                              |
| replay from an old membership epoch           | exact epoch/configuration resolution and certificate invalidation                                                             |
| one peer supplies a false snapshot            | no snapshots; readiness needs matching frontier attestations from a membership threshold                                      |
| fork at one stream sequence                   | unique sequence slot plus predecessor compare-and-set; conflicting digest fails closed                                        |
| chunk truncation, reordering, or substitution | canonical record/chunk digests, contiguous sequence checks, and explicit `hasMore` cursor                                     |
| request amplification                         | member-only requests, fixed expiry, maximum 256 records, maximum 1 MiB, and HTTP body cap                                     |
| crash during import                           | records and frontier commit atomically; the durable cursor is monotonic and a repeated batch re-enters the idempotent reducer |
| readiness survives local mutation             | certificate frontier must equal the live repository frontier                                                                  |
| reducer bypass                                | adapter validation precedes import/replay; served signatures do not imply semantic authority                                  |
| stale joining instance impersonates a peer    | exact peer/instance pair must exist in the resolved membership binding                                                        |
| secret exfiltration                           | JSON-safe allowlisted records; explicit prohibition on credentials, private reasoning, prompts, and key material              |
| equivocation by several members               | diagnosed when observable; Byzantine agreement and fork reconciliation are explicit V1 non-goals                              |

## Failure behavior

Network failure, insufficient identical frontiers, membership drift, corrupt
storage, adapter rejection, or replay failure leaves the session not ready.
Productive operations remain gated. Previously durable local state is not
deleted and an operator can inspect the last session failure code. Rollback of
the PostgreSQL schema requires an exact confirmation, an explicit data-loss
flag, and a verified external backup.

## Residual risk

A threshold of colluding current members can attest a shared false or
selectively incomplete frontier. V1 supplies authenticated provenance and
threshold corroboration, not Byzantine state-machine replication. Availability
also depends on enough current members exposing the requested domain. Future
work may add equivocation evidence, fork-choice policy, erasure coding, and
Byzantine-resilient certification without changing the V1 record semantics.
