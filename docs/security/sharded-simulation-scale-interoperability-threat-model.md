# Sharded simulation scale interoperability threat model

## Assets and boundaries

Protected assets are private environment state, evaluator verdicts, checkpoint integrity, durable-anchor continuity, action fences, and cross-shard delivery semantics. Logical peers receive only typed partial observations. The environment bridge and evaluator are separate authority boundaries.

## Threats and controls

| Threat                                                                | Control                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hidden environment or evaluator state reaches a runner                | Public observation-delivery contract contains only public projections; evaluator metrics are content-free counters and verdicts are absent.                                                                                                       |
| Duplicate, reordered, or equivocal delivery changes execution         | Batch and event identifiers are deterministic; batches are idempotent, events are canonicalized by ID, and conflicting batch/event content is rejected.                                                                                           |
| Oversized IDs, fault targets, observations, or batches exhaust memory | Exported protocol limits are applied before allocation to IDs, fault schedules, per-fault and aggregate targets, deliveries, and message batches.                                                                                                 |
| Replay or stale action crosses an ownership change                    | Fenced action requests carry execution epoch and fence token; action digests bind session, episode, peer, fence, and payload, while adapters reject action-ID equivocation.                                                                       |
| Session or assignment rebind changes ownership                        | Operational calls require an immutable bound assignment; start-episode and rebind equivocation are rejected and peer membership is arithmetic/constant-time.                                                                                      |
| Checkpoint rollback bypasses later durable state                      | CAS revision, private opaque snapshot digest/handle, logical-time monotonicity, and a monotonic anchor chain require restore against the current anchor.                                                                                          |
| Interaction amplification exhausts resources                          | Every closed profile has an interaction ceiling; the runner fails closed before processing an over-limit request.                                                                                                                                 |
| Failure injection changes reducer semantics                           | Failure, restart, partition/heal, compromised/rogue actor, and observation-deception schedules are interpreted at driver boundaries and recorded as observations. Misleading and conflicting observations select distinct bridge-visible actions. |
| Delivery reaches an unavailable target                                | The runner suppresses cross-shard batches whenever the source or target peer is failed; ACKs must be accepted and exactly enumerate delivered event IDs.                                                                                          |

## Deployment requirements

Network adapters must authenticate callers, bind session and episode identity to authorization and immutable assignments, persist durable anchors atomically, enforce the exported request-size limits, and retain idempotency/equivocation records for the adapter’s replay window. The supplied in-memory bridge is for local composition and is not a durable deployment component.
