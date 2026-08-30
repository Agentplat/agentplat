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

The advanced example enables only `team_topology_transformations`, compiles a
`split_team` plan, durably executes its certification and activation steps, and
prints the resulting topology epoch and content-free receipts. The decision
digest is assumed to have been produced by any policy-admitted agent, person or
collective route; the example does not bypass or simulate approval authority.

The lifecycle, discovery, attestation, Team, fencing and external material
ports are deterministic local implementations for the example. They
demonstrate source/API composition, not production deployment, global candidate
absence or organizational improvement.
