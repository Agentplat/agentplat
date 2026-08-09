# Governed adaptive sparse overlay threat model

## Assets and boundaries

Protected assets are sparse connectivity bounds, current membership/view bindings, observer independence, durable topology revision, and the distinction between evidence and authority. Observation authentication, membership construction, durable storage, and network delivery are deployment boundaries.

## Threats and controls

| Threat                                             | Control                                                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A health report directly changes routing           | Signals are evidence only; a current threshold certificate is required for apply.                                                                             |
| One actor amplifies reports to reach quorum        | Policies bind peer IDs to observer groups; certification counts distinct groups and rejects duplicate peers.                                                  |
| Replay or stale observations change a newer view   | Signals, proposals, and certificates carry expiry, membership/profile/view/revision binding, and monotonic logical time.                                      |
| A partition introduces incompatible topology       | Reconciliation is idempotent for equal certificates, detects same-revision equivocation, and never accepts an earlier binding.                                |
| A remote chooses its own weak quorum policy        | State binds the locally installed policy digest; proposals and certificates carrying any other policy are rejected.                                           |
| A forged remote certificate is accepted            | Same-position signal/peer/group tuples must cover the exact proposal evidence and the injected verifier must authenticate the exact certificate and proposal. |
| Future-dated evidence is accepted early            | Observation, proposal and certificate issue times must not exceed the current monotonic logical time.                                                         |
| A deleted state snapshot is silently reinitialized | Initialization refuses to proceed when the external monotonic head already exists.                                                                            |
| Adaptation materializes a large graph              | Exclusions are bounded; application deterministically generates only the local O(log N) view from the sparse profile.                                         |
| Store races overwrite a current adaptation         | Every productive transition uses the durable state's revision as a compare-and-swap fence.                                                                    |

## Deployment requirements

Use a durable transactional compare-and-swap store that atomically advances an external monotonic head, protect observer credentials and local policy distribution, bind membership digests to an authenticated membership service, enforce request-size limits before decoding, and retain equivocation evidence for the operator's audit period. The bundled in-memory store is unsuitable for process restarts or multi-node deployment.
