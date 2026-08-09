# `@agentplat/mesh-sim`

Deterministic simulation kernel for AgentPlat Mesh peers.

## Scalable provider-neutral evaluation runner

`runScalableEvaluationV1()` is the executable counterpart to the scalable
evaluation contracts. It opens a multi-domain environment, starts a sharded
session and episode, binds a sparse schedule to both team ports, validates and
accounts public observations, forwards cross-shard messages, and requests
fenced effects for declared actions. The runner keeps only bounded accounting
state, recovery state, and a configured record tail; it never materializes the
declared 500, 5K, or 100K peer population.

Each compared team receives an isolated session and episode with the same
scenario seed, so effects or targeted perturbations from one side cannot alter
the other side's state. Environment effect receipts and cross-shard
acknowledgements are accepted only after exact request/batch binding and digest
recomputation.

The embedding application supplies team implementations. Scheduled
perturbations require a `ScalableEvaluationPerturbationPortV1` and a recovery
metric port, plus an evaluator baseline for every affected team/domain pair.
The simulation provider must return a content-bound injection receipt before
the runtime records the occurrence; a plan entry alone is never reported as an
injected fault. Active recovery is sampled on subsequent logical steps until
its baseline tolerance is actually restored. Declared actions require an
application-owned `ScalableEvaluationActionAuthorityV1`; the runner does not
synthesize fencing authority.

Runs are local and transport-neutral: this package does not start a service,
create a campaign, or deploy infrastructure. An `AbortSignal`-compatible
object returns a `cancelled` result between external calls; budget exhaustion
prevents the next team step before it can create effects or messages.

The kernel uses the production `reduceMeshPeer` function for local commands and
the production `processMeshEnvelope` boundary for every remote delivery. There
is no simulation-only accepted-message path.

The deterministic kernel provides:

- integer logical time and a total-order priority queue;
- versioned `xorshift32-v1` random substreams scoped by caller-defined names;
- explicit event, queue, logical-time and internal-step limits;
- signed message preparation and delivery across configured topology links;
- immutable SHA-256 state and chained trace digests;
- invariant monitors evaluated after every event;
- restorable snapshots containing queue, PRNG and outbound allocator state; and
- replay comparison reporting the first semantic divergence.

Alpha 2 adds a closed, bounded fault-plan schema (`schemaVersion: 1`). Faults
are ordinary serialized simulation events, participate in the configuration
digest and are retained in the trace. The catalog covers peer crash/resume,
named-delivery drop/duplicate/delay/reorder, directed partition/heal and
peer-local wall-clock offsets. They are interpreted only at driver and
transport boundaries: production reducers contain no fault branches, retries
and healing are never implicit, and a crash drops later volatile deliveries.

`peer.resume` means that the same configured peer instance becomes available
again with its retained reducer state and outbound allocator. It is not a fresh
instance restart. A new `instanceId`, reset allocator, key/admission lifecycle,
or durable-state recovery must be supplied as a new explicit configuration;
those production readmission and durable-storage policies remain outside Alpha
2 and are never inferred by the simulator.

## Coordination reducer scenarios

`runMeshReducerScenario()` drives any closed, JSON-serializable event schedule
through a version-identified reducer adapter. This is the Alpha 2 harness for
`MeshAllocationRuntimeState`: adapters dispatch directly to the public
coordination, allocation, execution, timer, and recovery reducers.

```ts
const trace = await runMeshReducerScenario(config, {
  driverId: "my-coordination-driver-v1",
  projectionId: "my-safety-projection-v1",
  reduce({ state, action, logicalTime }) {
    return dispatchToPublicMeshReducer(state, action, logicalTime);
  },
  project(state) {
    return safetyProjection(state);
  },
});
```

The configuration digest binds the schema, seed, initial states, topology,
events, bounds, complete fault plan, driver ID, projection ID, and invariant
names. Runtime callbacks are handles and are excluded. State, effects, and
semantic projections are converted to deeply frozen data before invariant
evaluation and hashing. `replayMeshReducerScenario()` compares chained
semantic records and reports the first divergent record.

The canonical resilience suite covers all nine Alpha 2 cases: partial-view
capability allocation; an untrusted false claim followed by reallocation;
lost bid and acceptance deadlines; duplicate/reorder equivalence; checkpointed
crash recovery; minority partition fencing; no quorum; owner-unavailable
fencing; and identical replay plus controlled divergence. Every case reports a
fixed seed, configuration/fault/chain digests, explicit bounds, and serialized
faults.

`snapshot()` now emits strict schema version 2 with the ordered queue, retained
event IDs, PRNG substreams, fault cursor, current directed topology, peer
availability, wall-clock offsets, peer states, outbound allocators, metrics,
records and configuration/fault/trace digests. Restore is explicit:

```ts
const snapshot = kernel.snapshot();
const resumed = await restoreMeshSimulationKernel(config, snapshot);
const trace = await resumed.runUntilIdle();
```

Restore rejects unknown fields, wrong schemas or configuration/fault digests,
over-limit queues and records, malformed topology/peer indexes, inconsistent
metrics and broken trace chains. The original runtime configuration supplies
cryptographic handles; no key material is serialized.

Fault metrics distinguish applied fault events, crash/resume, drops,
duplicates, delays, reorders, partition/heal operations, clock-offset changes
and events suppressed by crashes or partitions. Full traces include the
normalized fault plan and an applied-fault ledger.

Cryptographic handles, private keys and callbacks are runtime dependencies and
are excluded from configuration digests, snapshots and traces. Replays within
one test or process may reuse the same generated key handles; private material
is never serialized.

## Registered collective evaluation

The Beta 2 evaluation driver builds the versioned resource-allocation and
recovery mission at 4–500 agents. The governed runner executes the portable
authority, Work Contract, budget and permit reducers with local observations;
the fair centralized runner executes the existing `MultiAgentSession`
round-robin scheduler over the same recorded decision policy. Both emit the
same interaction-accounting contract and per-seed digest-bound samples.

`runRegisteredCollectiveEvaluationV1` runs every pre-registered seed twice and
records exact replay. Its fault and adversary schedules are interpreted at
driver boundaries; production reducers contain no experiment bypass. The
500-agent mission remains below 5,000 interactions and records its observed
directed topology instead of inferring an asymptotic claim.

## Deterministic evaluation environment

`createCollectiveDeterministicEnvironmentHarnessV1()` is the reference
implementation of the separate
`@agentplat/collective-planning/evaluation` boundary. The harness returns a
runner-visible `environment`, an evaluator-only `monitor`, and an evaluator-only
`finalize()` operation. Only the environment port should be passed to a runner.

The reference world keeps peer observation queues, authoritative effect state,
idempotency records, terminal predicates and the hidden canary in closures.
Observation cursors are exact-idempotent and conflicting reuse is rejected.
Effects validate the current Work Contract, epoch, authority generation and
fence atomically. Timeouts before commit never enter the effect ledger;
timeouts after commit return an indeterminate first receipt and a committed
receipt on exact retry. Public snapshot handles are backed by evaluator-owned
opaque state, so another harness with the same registration can restore and
replay without serializing hidden values.

Finalization constructs trace V2, replays its interaction ledger, snapshots the
independent monitor and creates boundary evidence. An exceeded interaction
ceiling becomes a terminal mission failure. The historical V1 evaluation
driver and reports remain unchanged.

## Nominal closed-loop execution

The Increment 5 closed-loop surface is an opt-in, nominal-only reference path
for deterministic experiments with 3 through 100 logical peers. It is not a
durable runtime or a production orchestration service. Its hard interaction
limit is 5,000 and its public result contains trace-bound state roots and
artifacts, not caller-supplied success or safety counters.

`runAdaptiveCollectiveClosedLoopV1()` and
`runCentralizedPlannerClosedLoopV1()` share the same Mesh, governed-action and
environment boundaries. Both are bound to the registered nominal definition,
intent, policy, mandate, peer topology and evaluator boundary. The centralized
mode records every delivered observation as an accounted directive, retains a
deterministic bounded public subset and calls `decideCentralized()` exactly
once; it does not execute the peer-local decision loop or receive the
evaluator's hidden state, monitor, terminal predicate or a free communication
channel.

Before a planning policy runs, the runner requests observations separately for
each peer. A policy receives only that peer's identity, intent, local
observations, local planning view and logical time. Proposal decisions must be
made by that peer and cite only its delivered observation digests. The runner
does not expose an assignee lookup or allow a proposal or adaptive role to
authorize an effect.

The shared runtime performs real Mesh discovery, capability handling, offer,
bid selection, award, acceptance and checkpoint transitions. The winning bid
is selected by the Mesh allocation reducer. A Work Contract is created while
the accepted assignment is still active, before completion changes the
execution head.

The 50- and 100-peer reference topologies connect the owner to all other peers.
Every peer receives observations; adaptive mode records one local decision per
peer, while centralized mode records one directive per peer. Mesh discovers
the remote peers and respects its existing bounded fanout by offering to and receiving
bids from at most 32 candidates for one Work item. The result publishes those
participant sets instead of treating registration alone as participation.

The one protected action then traverses Trust eligibility, inference assessment
and grant issuance, grant-ledger reservation, governed permit issuance and a
`downstream_atomic` fenced environment effect. Currentness is checked at the
governed boundary, including the Work Contract's exact Trust and inference
policy IDs. Authorization time is runner-derived after the signed checkpoint
and within the mission validity window, and is exposed with the action evidence.
A signed `work.result` is
emitted only after the same evaluator returns the exact committed receipt and
its output digest matches the result digest.

`replayAdaptiveCollectiveClosedLoopV1()` and
`replayCentralizedPlannerClosedLoopV1()` execute fresh inputs twice and require
the run, trace and boundary-evidence digests to match exactly. Cryptographic
handles are runtime dependencies: callers may reuse them for a replay, but
private key material is never included in the serialized definition, trace or
result.

## Resilient closed-loop reference

Increment 6 adds an opt-in resilience wrapper; the nominal runner remains
nominal-only. `CollectiveClosedLoopResilienceDefinitionV1` binds the nominal
definition to a strict, digest-bound fault plan and a bounded epoch count.
Its closed fault vocabulary is capability withdrawal, assignment decline, peer
crash, peer restart, directed partition and directed heal. Every reported fault
has a scheduled, injected and observed digest; a declared-only record is
rejected. A trace-event trigger must resolve to the exact earlier journal event.

`runCollectiveClosedLoopCausalReplanningV1()` is a focused planning primitive:
an accepted successor must cite an explicit trigger observation and the exact
prior semantic-slot head. It records the causal successor and projects its new
Work identity through the planning reducer; it does not promise automatic
replanning for arbitrary runtime failures.

`runCollectiveClosedLoopFaultMatrixV1()` is a deterministic test driver over
the supplied reducer runtime. Its focused conformance coverage processes a
signed capability withdrawal through the real Mesh discovery reducer and an
assignment decline plus causal reoffer through the real allocation reducer.
Crash/resume and partition/heal remain explicit simulator-driver faults, not
special reducer paths.

The resilient runner does not accept an arbitrary callback returning matrix
evidence. `createCollectiveClosedLoopFaultMatrixPortV1()` snapshots the driver
input into a private registration and binds it to the exact nominal planning,
Mesh, Work Contract, checkpoint and assignment state. Execution validates every
fault's family, logical time, target, directed link and predecessor against the
public plan.

The resilient runner starts from the real nominal Mesh state and executes
lease expiry/grace, proposal, witness votes, certificate, recovery award,
replacement acceptance and checkpoint resume through the Mesh reducers. The
replacement receives a Work Contract from the active epoch-two assignment. An
epoch-one progress or result is fenced with `execution_authority_invalid`; a
provenance-bound committed effect receipt is required before the replacement
can emit the epoch-two `work.result`. The evidence retains the real rejected
envelope and the action must occur inside the recovered lease's absolute time
window.

`runPairedCollectiveClosedLoopResilienceCampaignV1()` compares construction
fairness and public-observation digests for adaptive and centralized modes.
Both sides share the same policy implementation and must match environment,
monitor and mission-bound matrix inputs; executed scenario, records and driver
faults are compared again after execution. Exact replay then covers the run,
trace, evidence and matrix. This is a compact deterministic reference campaign,
not the 50–500 agent statistical release campaign.

`peer.restart` in this reference is the simulator's in-memory `peer.resume`:
the configured instance resumes with retained reducer state. It is not a fresh
instance lifecycle, durable restore, production recovery protocol or cloud
deployment.

## Statistical campaign contracts

The package exports deterministic configuration and evidence contracts for the
50/100/250/500-agent ladder. `createCollectiveStatisticalCampaignTopologyV1()`
builds the registered sparse directed topology; scale configuration binds the
exact interaction ceiling and fault-family row. These functions allocate
configuration data only and do not execute a scale campaign.

`verifyCollectiveStatisticalCampaignBundleV1()` is a side-effect-free verifier
for a fully supplied in-memory evidence bundle. It requires the canonical
Collective Planning registration and terminal manifest, the exact four
adaptive/centralized first/replay slots for every registered cell, closed
sample/trace/ledger/evidence indexes, trusted source-lock expectations and
independently recomputed comparison and summary statistics. Replay equality
covers the stable outcome plus trace, ledger and observation records. A failed
execution remains present and forces a failed summary.

Inputs are snapshotted from data descriptors before validation, paths are
logical safe-relative names, and unknown/accessor-bearing shapes fail closed.
Each artifact is capped at 16 MiB and the supplied bundle at 256 MiB before JSON
decoding. The daily command is deliberately a registration/configuration
contract smoke; it is not statistical or scale-execution evidence.

`runCollectiveStatisticalCampaignShardV1()` executes any deterministic subset
of the registered cells and writes an immutable execution record before it
settles the revision-CAS lease state. A restart reads both state and records by
`runKey`, validates their execution identity and complete artifact content, and
continues without rerunning committed slots. An expired running slot is
reconciled from its durable record, or conservatively marked as an indeterminate
external effect when no record exists. Runner exceptions become terminal failed
samples, while the remaining slots still execute. The orchestration store is an
interface; the simulation package does not choose a filesystem, database or
cloud provider.

`aggregateCollectiveStatisticalCampaignV1()` accepts only the exact registered
closure, rejects duplicate or divergent replay slots, materializes the terminal
manifest, recomputes paired comparisons and produces bytes accepted by the
public bundle verifier. It cannot promote a partial shard set.

### Normative analysis and streaming custody

The public surface includes a bounded artifact-stream verifier and deterministic
normative analysis for the registered 240-cell / 960-slot campaign. The stream
verifier reads one indexed artifact at a time, checks exact closure, byte hash
and canonical digest, and applies artifact and total-byte limits before a
visitor receives decoded data. Limits cannot exceed 16,384 artifacts, 16 MiB
per artifact or 256 MiB total, and empty or unbounded chunk streams fail closed.
The analyzer consumes evaluator-owned projections and derives its normalized
rows internally, uses a pre-registered one-sided Wilson acceptance bound plus
descriptive two-sided intervals, and returns an ineligible or incomplete
decision whenever closure or evidence is insufficient.

`runCollectiveStatisticalCampaignNormativeOperationV1()` executes exactly one
authorized five-cell shard through a trusted registry resolver. The resolved
runner implementation and evaluator digests must match the authorized
descriptor before mutation, direct runner/projector injection is not accepted,
every projection must retain that evaluator binding, and state/slot/evidence
identity is derived from the exact plan and stable authenticated authorization
digest. A caller can
recompute the namespace with
`collectiveStatisticalCampaignNormativeExecutionIdV1()`.

This is a control-plane capability only: it does not execute the 50–500-agent
campaign, invoke a provider, or claim that the campaign has passed.

## Progressive scale execution surface

`COLLECTIVE_PROGRESSIVE_SCALE_PROFILES_V1` defines three closed industry
profiles. They progress from 500 participants and 5,000 interactions to 5,000
participants and 50,000 interactions, then to 100,000 participants and
1,000,000 interactions. The profiles also bind the role-coherence horizon,
benign or Byzantine affected population, recovery-work class and physical,
social or cyber scenario domains. Existing V1 campaign contracts remain
unchanged.

`createCollectiveProgressiveScalePlanV1()` produces an immutable execution plan
whose sparse topology is an algorithmic descriptor. A worker derives one
peer's O(log N) neighbors and affected-population membership on demand; the
plan never materializes the global peer or edge set. Peer and interaction
ranges are exact, non-overlapping shards, and the implicit affine permutation
selects the configured affected population without a global membership list.

`runCollectiveProgressiveScaleShardV1()` binds a provider-neutral executor ID
and version to one exact shard. Results retain interaction, recovery-work,
mission-success and digest-only event-stream evidence. The aggregate report
requires an exact shard closure, the registered role-coherence horizon, the
complete affected population, restored mission success and the profile's
quadratic, N log N or linear recovery ceiling. These APIs make large-scale
execution pluggable and bounded; constructing a plan or a conformant-shaped
report is not evidence that a large campaign was actually executed.

`createCollectiveProgressiveScaleOverlayBindingV2()` connects each execution
tier to the production `@agentplat/mesh/overlay` profile with the same peer,
interaction and sparse-degree bounds. The additive
`createCollectiveProgressiveScalePeerRoutingV2()` helper constructs one peer's
bounded active/reserve view and exact outbound interaction quota without
materializing the plan's global population or topology. Existing progressive
scale V1 artifacts and digests are unchanged.

## Sharded simulation and scale interoperability

The root package also exports a transport-neutral environment bridge and three
closed logical-peer profiles: 500/5,000 interactions, 5,000/50,000 and
100,000/1,000,000. `createShardedSimulationAssignmentsV1()` partitions peers
and interactions without materializing a global topology, while
`shardedSimulationAssignmentForPeerV1()` resolves a peer's shard in constant
time.

Runner-visible ports cover partial observations, fenced effects, cross-shard
message batches and opaque evaluator-owned checkpoints. Success, recovery and
role-coherence metrics are available only through the separate evaluator port;
a runner cannot supply those verdicts. The in-memory bridge is a reference
composition surface, not a distributed deployment or scale claim.

Fault schedules are closed, bounded inputs interpreted at the driver boundary.
Failures, restarts, partitions, compromised or rogue actors and misleading or
conflicting observations alter the simulated interaction path and every
scheduled fault must be observed. External HTTP or gRPC bridges must return
exact digest-bound envelopes and preserve durable checkpoint anchors.

## Multi-domain environment adapters

The root export includes open descriptors and manifests for physical, social,
cyber and hybrid environments. A manifest binds implementation, schemas,
scenario, profile, seed, population, topology/transition/visibility/fault
policies and resource budgets. The reference bridge applies those scenario
budgets and population bounds before runner-visible operations.

`runMultiDomainAdapterConformanceV1()` rejects substitution of the requested
definition and exercises deterministic observations, undeclared capability and
stale-fence denial, checkpoint/restore after mutation, out-of-population
actions and byte bounds. Passing black-box conformance is a contract signal,
not proof of simulator fidelity or a completed scale run.

## Verified benchmark registry

Benchmark suites bind one exact multi-domain scenario, scale profile, seed,
budget and centralized baseline. Candidate metrics are derived from trace
facts; callers cannot submit a score. Verification additionally requires a
trusted evaluator evidence port for candidate and baseline trace provenance.

Leaderboards are suite-specific, deterministic and exclude invalid,
over-budget, duplicate or replayed-trace submissions from ranking. Source,
artifact and build locks are digest references: deployments remain responsible
for custody, evaluator independence and environment relevance.

## Scalable evaluation runtime

The `./scalable-evaluation` export provides a provider-neutral configuration
and accounting layer over the existing sharded simulation and multi-domain
environment contracts. Its `standard-500`, `large-5000`, and
`frontier-100000` profiles bind 500/5,000, 5,000/50,000, and
100,000/1,000,000 agent/interaction envelopes. Message count, message bytes,
interaction count, and the bounded retained-record tail are explicit budgets;
creating these values does not allocate agents or start a run.

Definitions bind physical, social, or cyber scenario manifests to an explicit
partial-observation policy and the benign, Byzantine, rogue, or context
poisoning perturbations selected by the evaluator. Target selectors stay
private and are represented publicly by cardinality and digest, preventing a
100,000-agent profile from materializing a global target list.

`InMemoryScalableEvaluationRuntimeV1` accepts strictly sequenced accounting
records and keeps aggregate counters by team and domain. The full history is
committed by a chain digest while only the configured tail remains in memory.
With the closed two-team, three-domain contract, retained state is
O(teams + domains + perturbations + tail) and is independent of the declared
agent population.
Recovery episodes compare provider-measured basis-point samples with a
pre-perturbation baseline and report the accounted interactions and messages
needed to return within tolerance. Injection and recovery receipts are signed
with Ed25519 and bind the exact definition, scenario, environment adapter,
provider authorization, team, session, episode, perturbation schedule and
sample identity. `WebCryptoScalableEvaluationEvidenceVerifierV1` captures the
platform verifier and its authorization/key resolvers at construction; caller
supplied crypto, structural boolean verifiers and non-canonical signatures are
rejected. The accounting runtime accepts only receipts branded by that verified
path, so a provider cannot turn an unsigned metric array into recovery evidence.

Both sides of a `team-vs-team` matchup implement the same
`ScalableEvaluationTeamPortV1`. A centralized controller can occupy either
side as a replaceable reference without receiving hidden environment state,
and the comparison output contains signed deltas rather than an inferred
winner. Environment binding validates the exact multi-domain scenario before
returning its bridge; it does not start sessions, invoke team callbacks, or
execute an evaluation campaign.

`runScalableEvaluationV1()` routes every team message through the environment
delivery ingress, including messages whose source and destination currently
share a shard. Accounting advances only after an exact digest-bound ACK names
every expected event; there is no local synthetic-delivery shortcut. A message
also carries a complete bounded `transportEnvelope` and its digest. The batch
commits that envelope digest, the ACK commits the exact `batchDigest`, and only
after validating that complete binding does the runner hand the envelope to
the team's acknowledged-message ingress. A port that emits messages but
supplies no ingress fails closed.

The reference integrated adapter connects genuine
`@agentplat/collective-host/reference-integrated-stack` instances to the same
team port. `ReferenceIntegratedScalableEvaluationEgressRuntimeV1` installs a
real sparse peer plane with a nominal delivery queue, preserving the exact
recipient indexes chosen by the overlay. The same egress is the stack's
recovery-aware assignment authority: protected commits stop in an idempotent
action outbox, and the outer runner is the only component that applies those
actions to the evaluation environment. Peer binding checks the stack's private
construction brand and exact plane/authority object identities; callback-shaped
lookalikes, effect mappers and invented routing targets are not accepted. The
reserved implementation ID
`agentplat.reference-integrated-collective-stack.v1` is accepted only from this
nominal factory path.

The delivery capture and action outbox in this reference egress are bounded,
in-memory state for one evaluation process. They are not a production durable
transport or protected-effect sink, so this particular port remains suitable
only for the non-durable runner path. `runScalableEvaluationV1()` also has an
explicit restart-durable mode: supply both `durableStore` and `runId`, plus
restart-durable environment, team, perturbation, recovery and action-authority
ports. The runner rejects a partial declaration or a callback-shaped claim.
Providers opt in with a module-created
`ScalableEvaluationRestartDurabilityDeclarationV1`; the declaration identity
and the exact definition, adapter descriptor, sparse schedule, assignments,
shard count, baselines and team descriptors are bound into the checkpoint
configuration digest.

`ScalableEvaluationDurableCheckpointStoreV1` is provider-neutral and advances
one run by revision-and-digest CAS. A checkpoint carries the exact phase,
logical step/team/cursor, trace predecessor, active recoveries, a bounded
one-step saga, both environment checkpoints, both team checkpoints and the
canonical `ScalableEvaluationRuntimeStateV1`. Runtime state is independently
hash-chained by revision and predecessor and includes the two team states,
global and per-domain counters, baselines, perturbation observations,
recoveries, environment bindings and the configured accounting-record ring
with its physical cursor. Restore validates the definition and adapter binding
before installing any state.

The durable phase journal covers perturbation, observation, team step, each
action, each message, accounting, recovery and trace advance. Every external
operation has a stable content-derived operation ID and is reconciled before
the next phase is committed. Durable environment and team providers must be
able to restore the last committed checkpoint even if a newer orphan
checkpoint was created before a process failed, and must return the same
idempotent receipt when that operation is reconciled. Missing continuity,
restore or reconciliation fails closed; the runner never assumes process
memory or repeats an unreceipted effect.

The nominal transport envelope contains the exact `MeshSparseDeliveryV2` and
its authenticated content-addressed collective artifact; no callback rebuilds
either value. Post-ACK ingress validates their complete binding, stores and
re-reads the artifact through the genuine destination stack, then admits the
delivery to a bounded peer inbox. At the next peer step, ingress always calls
`MeshSparsePeerPlaneRuntimeV1.receive()` first, so routing, expiry, deduplication
and relay semantics run before `node.receive()` performs protocol and artifact
admission. Deferred causal predecessors remain queued rather than being
reported as delivered protocol state.

Each peer is owned by exactly one nominal team port, and mission binding checks
tenant, mesh, mission intent and objective together. A bounded per-step journal
records `prepared`, `node_mutated`, `output_staged`, `settled` or
`indeterminate`: exact retries return the staged output, while any mutation
that cannot be reconciled fails closed and is never executed again. Delivery
captures are released only after the target ingress receipt is bound to the
exact batch and ACK; effect captures are released only after the corresponding
terminal fenced environment request and receipt. This makes pending outbox
capacity reusable. The pending inbox and admitted-message idempotency window
are each capped at 65,536 entries, while each peer retains 64 step journals.
Terminal journals and their settlement records are pruned as the window rolls;
retries older than that window fail closed instead of re-executing. Egress
settlement retention is also explicitly bounded by `maximumSettledReceipts`.
These reference journals and receipts provide exact retry only inside one
evaluation process. Cross-process recovery uses the opt-in durable runner path
above and therefore requires implementations of its explicit checkpoint,
restore and reconciliation ports; the in-memory reference egress does not
claim those capabilities.

Durable state does not expand the declared population. A run remains limited
to two teams, three accounting domains, at most 16,384 sparse schedule steps,
1,024 actions and 1,024 messages (16 MiB total message bytes) per step, and a
single retained step saga. Public metadata remains capped at 64 KiB, depth 32
and 16,384 nodes. Runtime record retention is exactly
`maximumRetainedRecords`; durability declarations may advertise at most 64 MiB
per checkpoint, and the runner enforces the smallest capacity declared by the
store, environment bridge and either team port.
