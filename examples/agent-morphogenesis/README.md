# Agent Morphogenesis reference example

This example runs the first AgentPlat Agent Morphogenesis vertical slice with
provider-neutral in-memory application ports.

It demonstrates:

- bounded Agent Mesh candidate discovery;
- preference for an eligible existing agent;
- catalog-backed creation when the declared view has no eligible candidate;
- an authorized-agent or authorized-person decision binding;
- a simulated process stop after creation succeeded but before acknowledgement;
- recovery with a fresh Morphogenesis runtime over the retained store;
- the fixed Governed Durable Workflows catalog-lifecycle DAG;
- successor Team/individual Work evidence;
- morphology-head activation, checkpoint, authority fence, detach/retire,
  budget release and final receipt; and
- content-free transition telemetry.

Build the required packages and run both branches:

```sh
pnpm --filter @agentplat/collective-planning build
pnpm --filter @agentplat/workflows build
pnpm --filter @agentplat/collective-runtime build
pnpm --filter @agentplat/collective-host build
node examples/agent-morphogenesis/demo.mjs
```

Select one branch and decision route:

```sh
node examples/agent-morphogenesis/demo.mjs recruit authorized_agent
node examples/agent-morphogenesis/demo.mjs create authorized_person
```

Run the additive V2 Dynamic Topology example:

```sh
node examples/agent-morphogenesis/advanced.mjs
```

Run the V3 governed strategy-adaptation example:

```sh
node examples/agent-morphogenesis/strategy-adaptation.mjs
```

Run the V4 Agent Mesh collective-intelligence composition example:

```sh
node examples/agent-morphogenesis/collective-strategy-intelligence.mjs
```

Run the V5 governed strategy-synthesis example:

```sh
node examples/agent-morphogenesis/governed-strategy-synthesis.mjs
```

Run the V6 governed Agent Genesis example:

```sh
node examples/agent-morphogenesis/governed-agent-genesis.mjs
```

Run the V7 governed organizational-evolution example:

```sh
node examples/agent-morphogenesis/governed-organizational-evolution.mjs
```

Run the V8 constitutional-continuity example:

```sh
node examples/agent-morphogenesis/constitutional-continuity.mjs
```

It selects from an immutable catalog through the existing bounded learner,
binds the selected generator to an operator plan, converts one observed outcome
into comparable feedback and applies a separately reviewed promotion. It does
not claim that the selected strategy improves real missions.

The advanced example enables only `team_topology_transformations`, compiles a
`split_team` plan, durably executes its certification and activation steps, and
prints the resulting topology epoch and content-free receipts. The decision
digest is assumed to have been produced by any policy-admitted agent, person or
collective route; the example does not bypass or simulate approval authority.

The lifecycle, discovery, attestation, Team, fencing and external material
ports are deterministic local implementations for the example. They
demonstrate source/API composition, not production deployment, global candidate
absence or organizational improvement.

## Persistent owner integration and superseded resolution

```sh
pnpm --filter @agentplat/collective-host-postgres... --filter @agentplat/collective-control-postgres... --filter @agentplat/rooms-mesh... --filter @agentplat/workflows-rooms... --filter @agentplat/runtime-mock... build
node examples/agent-morphogenesis/persistent-local.mjs /tmp/morphogenesis-persistent-new
```

Requires Docker. The output directory must not exist. The wrapper creates a
PostgreSQL 18 container bound to an ephemeral loopback port and removes it on
exit. It makes no model or paid-service calls. Raw evidence and configuration
are retained in the selected directory.

The example connects PostgreSQL Room approvals to actual Team Formation and
Work reducers. Two approved proposals compete for one head. The loser uses
`beginSupersededResolution` and `advanceSupersededResolution`, recovers a lost
fence acknowledgement, releases its work and budget, and records `superseded`.
The winner cannot detach until a previously admitted job finishes. A separate
case rejects work after mandate expiry despite a still-valid organizational
decision. Room artifacts expose the two different terminal outcomes.

The admission/draining adapter is application code. Catalog observations,
membership and scripted reviewers are fixtures, and the rollback witness is
process-local. Replace those boundaries for a real deployment; this example does
not demonstrate host-loss recovery, production identity or external ActionGateway
effects. See [ADR 0054](../../docs/adr/0054-morphogenesis-superseded-resolution.md)
for API compatibility, direct-successor proof and owner obligations.
