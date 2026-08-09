# ADR 0035: Sharded simulation scale interoperability

## Status

Accepted.

## Decision

Mesh simulation exposes a transport-neutral environment bridge and a deterministic logical-peer runner. The closed scale profiles are 500 peers / 5,000 interactions, 5,000 peers / 50,000 interactions, and 100,000 peers / 1,000,000 interactions. They bind to the existing sparse overlay profiles rather than materializing a global graph.

Each shard has arithmetic peer and interaction ranges. Peer ownership is derived from its index in constant time; topology remains sparse and can be generated per peer. A runner streams interaction positions and retains only bounded driver state, so a shard does not own global peer or edge state. Every operational bridge call requires the immutable assignment binding for its session and episode.

The bridge contract covers sessions, episodes, partial-observation pulls and deliveries, fenced actions and effect receipts, checkpoints/restores, logical time, shard assignment, and cross-shard message batches/acks. It is suitable for HTTP or gRPC adapters without coupling the package to a network SDK.

Cross-shard batches and events use bounded deterministic identifiers. The batch factory canonicalizes event order before digesting, making a valid digest independent of transport order; validation uses arithmetic shard membership rather than a shard scan. Delivery is idempotent and rejects batch or event equivocation. Checkpoints use compare-and-swap revisions, an evaluator-owned opaque snapshot handle/digest, and a monotonic durable-anchor chain. Each environment and team child checkpoint must advance exactly one revision and name the exact previously committed child digest. A provider may create a child checkpoint before the runner checkpoint CAS commits; after a crash, reconciliation may therefore restore the last committed predecessor and reproduce the orphan child rather than treating that orphan as authoritative.

Restart durability is opt-in and fail-closed. A runner checkpoint binds the run identifier, evaluation definition, adapter descriptor, full schedule, shard assignments, baselines, participating ports and their durability declarations, and the resulting configuration digest. Its runtime state carries exactly two isolated team/session/episode bindings for a running evaluation. Stable operation identifiers let providers reconcile observations, team steps, actions, settlements, acknowledged messages, perturbations, recovery measurements, and child checkpoints before the runner advances accounting. A configuration substitution, alternate genesis, forked child, revision gap, or equivocal reconciliation result is rejected.

Fault schedules are driver-bound and include failure, restart, partition/heal, compromised or rogue actors, and misleading or conflicting observations. Reducers do not interpret these schedules. The runner records observed fault events at the boundary. Misleading observations cause a mitigated action; conflicting observations cause an explicit resolution action, so the two faults have distinct bridge-visible semantics. Cross-shard delivery is suppressed when either endpoint is failed.

`SHARDED_SIMULATION_LIMITS_V1` is an exported protocol limit for faults, targets per fault, aggregate targets across a schedule, messages per batch, observations per delivery, and identifier length. Both the runner and validation path reject over-limit input before it can expand retained state.

The runner exposes only interaction accounting. An evaluator-owned monitor finalizes bounded mission-success, recovery-to-baseline, and role-coherence counters from authoritative bridge events; a runner emits no verdict and receives no hidden evaluator or environment state.

## Consequences

Local composition uses an in-memory bridge only. Distributed adapters must provide durable anchor storage, request authentication, replay protection, assignment binding, and equivalent deterministic acknowledgment behavior. Restart-durable adapters must retain the committed runner checkpoint and the required predecessor snapshots across child-checkpoint reconciliation, and must implement atomic runner compare-and-swap plus exact operation reconciliation. They must reject start-episode, assignment rebind, and action-ID equivocation; an action digest binds session, episode, peer, fence, and payload. The runner accepts a cross-shard result only when an ACK is accepted and lists exactly the expected event-ID closure; an identical event rebatched under a new batch ID remains acknowledged without reapplying its effect.
