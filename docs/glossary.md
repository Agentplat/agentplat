# AgentPlat Glossary: Implemented Concepts and Runtime Primitives

> **AgentPlat glossary:** definitions of Agent Rooms, Collective Runtime, Agent
> Mesh, Inference Control, Trust, Evidence, portable execution, distributed
> planning, quorum and governed agent operations.

This is the canonical, machine-readable-friendly glossary for AgentPlat's
implemented concepts. Each entry uses the exact public term, a short definition,
and a source of truth in the repository. The glossary is intended for developers,
technical writers, search engines and large language models (LLMs).

## What “implemented” means

In this glossary, **implemented** means that AgentPlat contains a typed public
contract and an executable reference implementation, normally covered by tests.
It does not mean that every deployment has production-grade infrastructure,
performance evidence or universal safety guarantees. See the
[Evidence Boundary](#agentplat-evidence-boundary).

## Canonical platform concepts

### AgentPlat Agent Room

An AgentPlat Agent Room is a durable, tenant-scoped workspace where humans and
agents coordinate through messages, tasks, artifacts, policies, approvals,
handoffs and scoped memory.

Source: [`@agentplat/rooms`](../packages/rooms/README.md),
[Agent Rooms documentation](./agent-rooms.md).

### AgentPlat Collaboration Protocol

The structured collaboration contract for Room messages, artifacts,
participants and typed handoffs.

Source: [Collaboration Protocol](./collaboration-protocol.md).

### AgentPlat Planner

The planning boundary that creates, stores, validates, synchronizes and
revises executable plans and planning artifacts.

Source: [`@agentplat/collective-planning`](../packages/collective-planning/README.md),
[`@agentplat/planning-artifacts`](../packages/planning-artifacts/README.md).

### AgentPlat Handoff

A bounded, typed transfer of execution context and ownership between agents or
execution locations. Handoffs preserve the relevant checkpoint and authority
constraints instead of silently widening authority.

Source: [`@agentplat/rooms`](../packages/rooms/README.md),
[Agent Mesh checkpoint handoff](./agent-mesh/replicated-execution-checkpoint-handoff-v1.md).

### AgentPlat Collective Runtime

The governed runtime for missions, planning, allocation, team formation,
execution, recovery, continuity, adaptation and collective decisions.

Source: [`@agentplat/collective-runtime`](../packages/collective-runtime/README.md),
[Collective Runtime capability matrix](./collective-runtime/development-capability-matrix-v1.md).

### AgentPlat Agent Morphogenesis

The governed, mission-driven evolution of an agent collective's operational
form through bounded successor epochs. Agent Morphogenesis turns authenticated
evidence into an inert organizational-change proposal, routes the exact change
through a policy-selected human, agent, local-policy, collective or composite
decision, and coordinates existing lifecycle, membership, Team, individual
Work, Action Gateway and evidence boundaries. It grants no authority itself.

Source: [`@agentplat/collective-runtime/morphogenesis`](../packages/collective-runtime/README.md#agent-morphogenesis),
[ADR 0046](./adr/0046-agent-morphogenesis.md).

### AgentPlat Agent Mesh

An authenticated peer-to-peer coordination layer with bounded peer views,
causal synchronization, governed membership, sparse overlays, quorum and
recovery protocols.

Source: [`@agentplat/mesh`](../packages/mesh/README.md),
[Agent Mesh glossary](./agent-mesh/glossary.md).

### AgentPlat Inference Control

Policy-bound control around agent inputs, model outputs, tools and protected
effects. It can assess, revise, challenge, pause, redirect or deny an
operation before authority is released.

Source: [`@agentplat/inference-control`](../packages/inference-control/README.md),
[Inference Control plans](./inference-control/).

### AgentPlat Evidence Boundary

The boundary that separates implemented source behavior from integration,
deployment, scale, performance and empirical validation claims.

Source: [`AI.md`](../AI.md),
[capability baseline governance](./collective-runtime/capability-baseline-governance-v1.md).

## Rooms, execution and memory

### Room

A persistent tenant-scoped collaboration container for participants, messages,
tasks, artifacts, policies, plans, sessions and memory references.

### Participant

A human or agent admitted to a Room under an explicit participant identity and
role. Room participation does not by itself create Agent Mesh authority.

### Artifact

A durable, addressable work product with metadata and provenance that can be
referenced by messages, plans, handoffs and execution.

### Scoped memory

Memory whose retrieval and writes are constrained by tenant, Room, session or
other explicit authority scope.

Source: [`@agentplat/memory`](../packages/memory/README.md).

### Portable agent execution

Provider-neutral execution of an agent through a portable runtime contract,
including checkpoints, state, usage, streaming and controlled effects.

Source: [`@agentplat/runtime`](../packages/runtime/README.md),
[portable execution](./portable-execution.md).

### Multi-agent session

A durable or observable conversation/execution involving multiple speakers,
personas, providers, turns, events and fallback behavior.

Source: [`@agentplat/sessions`](../packages/sessions/README.md),
[multi-agent sessions](./multi-agent-sessions.md).

### Checkpoint

A typed execution boundary used to inspect, pause, resume, transfer or recover
an agent operation before or after a significant step, output or protected
action.

### Human-in-the-loop intervention

A durable, auditable human decision or instruction that can steer, approve,
pause, revise or stop an execution.

## Planning, missions and work

### Mission

A governed unit of collective intent with scope, policy, lifecycle, objectives,
budgets, participants, execution state and recovery rules.

### Distributed planning

Message-driven decomposition and dependency reconciliation performed across
peers without requiring a global scheduler or complete global topology.

### Work offer

A request for eligible peers to propose execution of a bounded work item.

### Work bid

A peer's bounded proposal describing capability fit, capacity, estimates and
assumptions for a work item.

### Work award

A signed or certified selection that assigns a work item revision to an
eligible peer or team.

### Lease

Time-bounded authority to execute or coordinate a work item. Lease renewal,
takeover, voting and certificates are used to prevent stale ownership.

### Fencing token

A value that prevents an expired or superseded assignment epoch from committing
state or producing an external effect.

### Team formation

Governed selection and activation of a group of agents for a joint work
contract, including capabilities, roles, commitments and settlement.

### Causal replanning

Replanning driven by ordered, attributable changes in mission state, evidence,
capacity, strategy or execution outcome.

## Mesh, membership and agreement

### Mesh peer

An independently executing runtime instance with identity, keys, policies,
bounded peer state and a local work journal.

### Peer view

The bounded local set of active neighbors and reserve candidates known to one
peer. AgentPlat does not require a complete global peer graph.

### Causal synchronization

Synchronization that preserves predecessor relationships, sequence, scope and
deduplication so peers can catch up and reject conflicting state transitions.

### Sparse overlay

A bounded peer-to-peer routing layer that derives active and reserve views and
propagates digest-only references with controlled fanout, hops and interactions.

### Membership epoch

A monotonically increasing membership generation that binds identity,
eligibility, keys, agreement and certificates to one coherent peer set.

### Quorum

A policy-defined threshold of eligible participants or witnesses required for
an agreement, certificate or recovery decision.

### Byzantine-resilient agreement

Agreement that tolerates bounded adversarial or equivocating participants under
explicit membership, quorum, certificate and fault assumptions.

### Partial-view agreement

Agreement formed from bounded local views and witnesses rather than a globally
replicated membership or edge list.

### Recovery certificate

A signed or threshold-certified record that authorizes recovery or takeover and
fences an older execution epoch.

Source: [Agent Mesh glossary](./agent-mesh/glossary.md),
[`@agentplat/collective-quorum`](../packages/collective-quorum/README.md).

## Trust, evidence and governance

### Trust profile

A local, capability- and scope-bound assessment with multiple dimensions,
uncertainty, provenance and decay. It is not a universal reputation score.

Source: [`@agentplat/trust`](../packages/trust/README.md).

### Evidence claim

A signed or attributable statement about an observation or result, including
its provenance and scope.

### Attestation

Independent support, contradiction or inconclusive evaluation of an evidence
claim.

### Evidence fusion

Policy-bound combination of claims, attestations, source bindings and
dependency groups into a local decision or unresolved result.

### Trust eligibility decision

A local comparison of an exact trust projection against explicit score,
uncertainty, scope and policy requirements.

### Collective trust consensus

A Byzantine-certified collective decision over one content-free, policy-bound
Trust projection. It can narrow a local decision; it cannot create universal
truth or execution authority.

### Authority boundary

An explicit separation between planning, coordination, inference, approval,
trust, execution and external effects.

### Protected effect

An external action that requires exact authorization, valid finality, policy
approval and any required inference or semantic-control evidence.

### Fail closed

Rejecting or withholding an operation when required identity, policy, evidence,
authority, freshness, capacity or continuity conditions are missing or
contradictory.

## Inference Control concepts

### Long-horizon context integrity

A controller that evaluates the complete context set, tracks bounded
content-free risk across long sessions and withholds hostile, stale or
contradictory context before provider invocation.

### Continuous role alignment

A controller that tracks role coherence, uncertainty and context consistency
over portable sessions and applies recovery hysteresis before releasing
protected actions.

### Adaptive role realignment

A governed process that discovers trusted successor candidates, filters
proposers and evaluators, certifies an exact digest and installs one attenuated
successor role revision.

### Inference intervention

A pre-turn, streaming, post-turn, pre-tool or pre-effect control decision that
allows, revises, retries, challenges, pauses, escalates, redirects or denies.

### Semantic metric

A bounded content-free representation of role, context, course or alignment
signals used for policy-controlled assessment.

### Anytime-valid semantic guarantee

A sequential control result that remains valid as evidence accumulates and can
drive continue, shorten, replan or safe-stop decisions.

Source: [`@agentplat/inference-control`](../packages/inference-control/README.md).

## Evaluation and interoperability

### Collective evaluation harness

A versioned runner and report contract for controlled, seeded comparisons of
collective and centralized execution.

### Invariant monitor

A runtime boundary that evaluates required safety and operational invariants
before accepting protected effects or advancing an environment.

### Content-free telemetry

Operational telemetry based on bounded metadata, digests, state and evidence
references rather than raw prompts, outputs or hidden reasoning.

### Interoperability SDK

Versioned contracts for remote agents and simulation environments, including
capability handshakes, signed envelopes, idempotency and checkpoint transfer.

Source: [`@agentplat/interop`](../packages/interop/README.md),
[`@agentplat/mesh-sim`](../packages/mesh-sim/README.md).

## Related canonical resources

- [AI context](./ai/context.md)
- [AI/LLM documentation map](./ai/llms.txt)
- [Agent Mesh glossary](./agent-mesh/glossary.md)
- [AgentPlat specification v1](./specification/agentplat-spec-v1.md)
- [Architecture](./architecture.md)
- [Collective capability baseline](./collective-runtime/development-capability-matrix-v1.md)
