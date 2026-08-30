# AgentPlat Agent Morphogenesis V2

**Defines:** the additive advanced profile for governed organizational
evolution. **Status:** opt-in source capability; not evidence of production
readiness, organizational improvement or global optimality.

V2 extends, and does not reinterpret, Agent Morphogenesis V1. An application
enables individual advanced capabilities and operators through
`MorphogenesisPolicyV2`; absent those flags, V1 behavior remains unchanged.

## Conformance requirements

A conforming V2 composition:

1. preserves the V1 observation → need → target → proposal → decision →
   execution → evaluation → successor-epoch separation;
2. admits decisions by an authorized agent, authorized person, local policy,
   collective quorum or policy-declared composite route; no route requires a
   person unless policy selects one;
3. treats an agent or person acting as reviewer as a decision principal with
   the same exact scope, independence, mandate, expiry and conflict checks;
4. journals an immutable compiled operator plan and durable execution state
   before crossing an external boundary;
5. reconciles prepared effects by stable operation ID and stops on an
   indeterminate result;
6. evaluates a completed plan into one immutable outcome receipt and advances
   `MorphologyHeadV1` exactly once through CAS;
7. retains only bounded identifiers, counters, enums and digests in control
   state; and
8. uses the existing owning subsystem for every effect rather than creating a
   parallel authority plane.

## Profiles and lineage

`AgentInstantiationProfileV2` supports `catalog`, `derived` and `synthesized`
creation modes. Derived and synthesized profiles bind:

- all parent profile and parent-agent lineage digests;
- an exact material profile and evolution record;
- capability additions/removals and their evidence;
- tool, action, resource and interaction attenuation;
- an authority-attenuation receipt; and
- for synthesis, an independent synthesis certification whose certifier is not
  the synthesizer.

A derived or synthesized profile cannot widen a parent ceiling merely because
the synthesizer proposes it. Newly added capabilities require their declared
attestations. Before factory invocation, the host binds the Morphogenesis
operation, scope, proposal, profile, creation request and creation certificate
in `MorphogenesisAgentCreationMaterialBindingV2`.

## Advanced operators

The V2 operator compiler maps organizational intent to existing governed
boundaries:

| Operator | Required execution boundaries |
| --- | --- |
| `derive_agent` | evolved-profile verification, governed factory/lifecycle, Trust attestation, Team Formation |
| `realign_role` | certified Inference Control role-realignment runtime |
| `reassign_work` | Governed Mission Lifecycle, successor Work receipt, Work/action fence |
| `replace_agent` | successor lifecycle, attestation, Team activation, continuity checkpoint, predecessor fence, drain/retirement or detach |
| `suspend_agent` | continuity checkpoint, Work/action fence, certified Membership exclusion and lineage suspension |
| `resume_agent` | checkpoint verification, active-key proof, certified Membership readmission, Work rebinding |
| `split_team` | Dynamic Topology certification and activation with exact member partition |
| `merge_teams` | Dynamic Topology certification and activation with one complete successor |
| `federate_teams` | Dynamic Topology certification and activation preserving source Teams and adding one federation Team |

Policy gates each operator family and independently limits derived agents,
synthesized agents, creation depth, role changes, Work reassignments,
replacements, suspensions and topology operations.

## First-class integrations

- Governed Mission Lifecycle exposes the explicit, opt-in
  `request_morphogenesis` / `enact_morphogenesis` path. It is not encoded as
  `request_team_adaptation`.
- Agent Rooms project plans, progress and outcomes without gaining approval or
  execution authority.
- Agent Mesh transports bounded, authority-neutral plan projections.
- Collective Membership owns certified suspension, resumption and retirement.
- Team Formation and Work retain Team and individual Work authority.
- Trust and Inference Control own attestation and governed role evolution.
- Interop exposes `morphogenesis.enact` only for an exact stateful admission
  grant and cannot manufacture a decision, authorization, fence or commit.
- Factories remain provider-neutral behind the governed lifecycle contract.

## Durability and replay

Operator execution and outcome stores have in-memory conformance surfaces and
PostgreSQL implementations. PostgreSQL reuses Collective Host runtime state,
checks revision/digest CAS and logical-time high-water, and verifies an external
rollback witness. Exact retries return the retained state or outcome; divergent
replays fail closed.

The process store, morphology head, Membership, Team, Work, role, topology and
factory owners remain distinct. A Workflow or Interop response never replaces
their authoritative receipts.

## Public entry points

- `@agentplat/collective-runtime/morphogenesis`
- `@agentplat/collective-runtime/mission-lifecycle`
- `@agentplat/collective-host/morphogenesis`
- `@agentplat/collective-host/morphogenesis-operator-adapters`
- `@agentplat/collective-host-postgres`
- `@agentplat/rooms-mesh/morphogenesis`
- `@agentplat/interop/morphogenesis`

## Evidence boundary

Source code, type checks and deterministic tests demonstrate API and local
state-machine behavior only. Claims about production safety, latency, cost,
scale, organizational fitness or improved mission outcomes require separate
operational and empirical evidence.
