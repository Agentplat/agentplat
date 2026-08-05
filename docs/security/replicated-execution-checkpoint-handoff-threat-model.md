# Replicated execution checkpoint handoff threat model

## Protected assets

- portable application state required to resume accepted Work;
- checkpoint lineage, digest, step sequence and adapter compatibility;
- assignment epoch, authority and fencing integrity;
- tenant, mesh, policy-domain and member-instance isolation;
- confidentiality of credentials, prompts, hidden reasoning and key material;
- bounded CPU, memory, storage and network consumption.

## Trust boundaries

Each peer owns independent session, content and evidence repositories. The
portable adapter is trusted to export only allowed application state and to
import it faithfully. The transport, remote peers and stored remote artifacts
are untrusted. Certified membership is the source of current member instances
and verification keys. Existing Mesh authority remains the only execution
authority.

## Threats and controls

| Threat                                           | Control                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| forged or cross-scope artifact                   | Ed25519 signatures plus exact tenant, mesh, policy-domain, peer and instance binding                          |
| checkpoint substituted under a valid ID          | content-addressed artifact, manifest digest, state digest and exact checkpoint relation                       |
| stale assignment state imported                  | Work revision, assignment epoch, authority ID and fence must match the recovery award and current authority   |
| incompatible adapter state                       | exact adapter ID, version and implementation binding before import                                            |
| source disappears after publication              | deterministic replicas, signed durable receipts and certificate custody threshold                             |
| replica returns corrupt content                  | canonical artifact digest and transfer-state digest are recomputed locally                                    |
| incomplete replication advertised as recoverable | `work.checkpoint` publication is gated on a valid availability certificate                                    |
| replay across membership epochs                  | current membership/configuration resolution and explicit certificate expiry                                   |
| old assignee resumes after recovery              | currentness, lease, assignment epoch and fence checks remain mandatory before every step, action and commit   |
| secret or reasoning exfiltration                 | closed JSON-safe transfer contract, prohibited content classes and adapter-owned export allowlist             |
| request amplification                            | bounded replica count, expiry, request/response bytes and HTTP body limits                                    |
| redirect or endpoint confusion                   | exact configured HTTPS/HTTP endpoint policy, fixed paths and redirects rejected                               |
| crash during import                              | adapter import precedes one revision-checked target-session commit; retries are idempotent by transfer digest |
| conflicting checkpoint lineage                   | exact predecessor, sequence and accepted `resumeCheckpointId` checks fail closed                              |
| colluding receipt signers                        | retained as residual risk; Byzantine agreement is a separate opt-in capability                                |

## Failure behavior

Missing certificates, insufficient custody, membership drift, unavailable
replicas, digest mismatch, incompatible adapters, import rejection, stale
authority or storage conflicts leave the target session unchanged and not ready
for execution. Evidence is retained for diagnosis. Existing local checkpoints
remain valid for local restore, but are never reported as transferable without
certified availability.

## Residual risk

A threshold of colluding current replicas can certify deliberately incorrect
state if the source adapter exported it and all cryptographic relations remain
valid. The later collective-agreement capability addresses conflicting signed
decisions and equivocation; it cannot determine semantic truth inside opaque
application state. Deployment operators remain responsible for encryption at
rest, protected backups and endpoint authentication in addition to document
signatures.
