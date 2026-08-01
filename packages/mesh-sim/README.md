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
