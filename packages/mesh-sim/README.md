# `@agentplat/mesh-sim`

Deterministic simulation kernel for AgentPlat Mesh peers.

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
  driverId: 'my-coordination-driver-v1',
  projectionId: 'my-safety-projection-v1',
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
for deterministic experiments with 3 through 50 logical peers. It is not a
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

The 50-peer reference topology connects the owner to all other peers. All 50
receive observations; adaptive mode records one local decision per peer, while
centralized mode records one directive per peer. Mesh discovers the 49 remote
peers and respects its existing bounded fanout by offering to and receiving
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

Fault injection, causal replanning, capability withdrawal, decline, crash,
partition/heal, reassignment and stale-result recovery are deliberately outside
this nominal Increment 5 path; they belong to Increment 6.
