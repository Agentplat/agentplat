# Certified collective decision plane threat model

## Protected assets

- decision scope, epoch, membership and payload-digest bindings;
- accepted decision heads and their causal history;
- certification policy and trusted evidence-source catalog; and
- separation between coordination decisions and effect authority.

## Trust boundaries

Candidates and evidence are untrusted until validated. Certification adapters
authenticate membership, evidence and agreement proofs. Durable stores own
atomic compare-and-swap and rollback-resistant integrity outside process memory.

## Threats and mitigations

| Threat                                       | Mitigation                                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Candidate replayed in another scope or epoch | Candidate and certificate digests bind scope, epoch and exact membership.                                  |
| Conflicting decision accepted for one slot   | Append-only slot admission rejects a second candidate or certificate.                                      |
| Minority proof presented as agreement        | The concrete agreement adapter cryptographically verifies the commit and current membership.               |
| Untrusted evidence counted                   | Policy uses a closed source/version/implementation catalog and minimum counts.                             |
| Restart restores rewritten history           | State digest, contiguous revisions, accepted-decision validation and a required external integrity anchor. |
| Certified churn exhausts local state         | Separate active-head and permanent-tombstone limits fail closed; archival must preserve replay protection. |
| Decision becomes an action grant             | Contracts contain only identifiers and digests and explicitly carry no lease, fence or effect permission.  |

## Residual risks

A compromised certification adapter can authenticate false evidence. A malicious
policy owner can choose unsafe thresholds. A durable store without an external
rollback anchor can restore an older internally valid snapshot. Reaching the
tombstone limit requires an operator-managed archive or state-generation
rotation that retains prior-slot replay protection.
