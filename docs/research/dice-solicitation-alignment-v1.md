# DICE solicitation alignment V1

Status: proposal-support mapping. No claim in this document substitutes for the
empirical validation status recorded in the
[research decision ledger](./research-decision-ledger-v1.md) or the
[development capability matrix](../collective-runtime/development-capability-matrix-v1.md).

## Source

DARPA program: **DICE — Decentralized Artificial Intelligence through
Controlled Emergence**. Solicitation `HR001126S0010` (`DARPA-SN-26-72`),
Information Processing Techniques Office, program manager Susmit Jha.
Published 2026-06-10, deadline 2026-08-25. Quotations below are taken verbatim
from the public program page as of 2026-08-13.

> "DICE aims to develop a decentralized AI architecture suitable for rapidly
> evolving, unpredictable, and contested environments. With this architecture,
> AI agents can dynamically form teams using peer-to-peer coordination to
> execute complex missions. This coordination will be robust to failure or
> compromise of individual agents, as well as to 'rogue' AI agents that might
> develop misaligned instrumental goals."

> "The local inference control on each AI agent will ensure role coherence of
> individual agents and constrain the emergent behavior of the collective to
> maintain alignment with commander's intent over the long term, even across
> multiple inference steps."

> "This controlled emergence ensures DICE AI agents remain on mission, maintain
> doctrine, suppress misbehaviors, and remain resilient to agent loss or
> compromise. The program's scope does not include the development and
> deployment of autonomous systems in the real world. The program will use
> simulation environments to demonstrate DICE architectures in Department of
> War-relevant use-cases, targeting measurable gains in scalability,
> adaptability, and resilience against both benign failures and adversarial
> attacks."

## Purpose

An external 10-objective development plan was proposed for AgentPlat, framed
around DICE's stated goal without reference to what the repository already
declares closed. This document maps DICE's own four stated thrusts directly
to the existing
[ADR 0042](../adr/0042-collective-capability-closure.md) and its 19-capability
matrix, so the alignment can be cited by objective ID rather than re-argued
from scratch. It does not replace the 10-objective plan; it shows how much of
that plan's intent already has a reference-integrated implementation, so
proposal effort in the remaining window is not spent re-describing existing
capability under new names.

## Thrust-by-thrust mapping

### 1. Decentralized architecture — dynamic teams via peer-to-peer coordination

| DICE requirement | AgentPlat capability (matrix #) | Public surface |
| --- | --- | --- |
| Peer-to-peer team formation for complex missions | #1 Autonomous local peer host, #7 Decentralized allocation and team formation | `@agentplat/collective-host/autonomous-node`, `@agentplat/collective-host/distributed-planning`, `@agentplat/collective-runtime/distributed-team-allocation` |
| Distributed mission decomposition | #6 Distributed mission decomposition | `@agentplat/collective-planning/distributed-decomposition` |
| No global scheduler or topology oracle | Explicit non-goal / design decision in ADR 0042 | "The composition intentionally provides neither a central scheduler nor a global topology/plan graph." |
| Sparse peer discovery and routing | #2 Sparse peer-to-peer discovery and routing | `@agentplat/mesh/overlay` |
| Durable causal delivery under partition | #3 Durable causal delivery and catch-up | `@agentplat/mesh/overlay-transport`, `@agentplat/collective-host/distributed-protocol` |

### 2. Local inference control — role coherence and constrained emergence

| DICE requirement | AgentPlat capability (matrix #) | Public surface |
| --- | --- | --- |
| Role coherence per agent | #12 Role, objective and context drift detection | `@agentplat/inference-control/role-alignment`, `context-integrity` |
| Constrain emergent collective behavior across multiple inference steps | #5 Operational cognitive control, #16 Anytime statistical guarantees | `@agentplat/inference-control/operational-control`, `semantic-guarantees`, `@agentplat/collective-host/semantic-horizon-coupling` |
| Inference-time intervention | #13 Inference-time intervention | `@agentplat/inference-control/intervention`, `reference-controllers` |
| Alignment with commander's intent over the long term | #11 Autonomous adaptation and local replanning | `@agentplat/collective-host/autonomous-adaptation`, `@agentplat/collective-runtime/autonomous-mission-loop` |
| Heterogeneous agent/model support for this control layer | #14 Heterogeneous open and black-box adapters | `@agentplat/runtime/cognitive-adapter`, `@agentplat/inference-control/cognitive-adapters` |

### 3. Resilience — failure, compromise and "rogue" agents

| DICE requirement | AgentPlat capability (matrix #) | Public surface |
| --- | --- | --- |
| Robust to failure or compromise of individual agents | #10 Mission execution continuity and compromise recovery | `@agentplat/collective-runtime/mission-continuity`, `team-execution-continuity`, `compromise-aware-recovery` |
| Robust to "rogue" agents with misaligned instrumental goals | #9 Adversarial context fusion and local credibility, #4 Autonomous compromise recovery | `@agentplat/collective-quorum/mission-context-fusion`, `collusion-aware-context`, `@agentplat/trust/peer-credibility` |
| Sparse adversarial agreement despite compromised participants | #8 Sparse adversarial agreement | `@agentplat/collective-quorum/sparse-agreement-runtime`, `partial-view-agreement`, `equivocation-response` |
| Governed agent lifecycle (bounds who can act, prevents unbounded rogue creation) | #3 (ADR objectives table) Governed agent lifecycle, #17 Governed creation and termination | `@agentplat/collective-membership/governed-agent-lifecycle`, `agent-factory` |
| Resilient at scale under adversarial and benign fault injection | #19 Scale-safe operation, telemetry and executable invariants | `@agentplat/mesh-sim`, `@agentplat/audit/collective-telemetry`, `@agentplat/collective-runtime/collective-invariants` |

### 4. Theoretical foundations — self-organization and distributed consensus

| DICE requirement | AgentPlat capability (matrix #) | Public surface |
| --- | --- | --- |
| Formal model of decentralized control with stated bounds | #10 (ADR objectives table) Formal decentralized control model | `@agentplat/collective-control/bounded-model`, `bounded-progress-model`, [decentralized control model V1](../collective-runtime/decentralized-control-model-v1.md) |
| Distributed consensus under partial/adversarial views | #8 Sparse adversarial agreement | Same as above; committee convergence from bounded partial validator views |
| Falsifiable, bounded — not a global-optimality claim | Explicit non-goals section, ADR 0042 | "This decision does not guarantee global optimality, availability during a partition, truthful self-reported capability, collusion resistance..." |
| Machine-checkable closure of the theoretical/source claim | Capability baseline governance | `@agentplat/collective-planning/development-evidence`, [capability baseline governance V1](../collective-runtime/capability-baseline-governance-v1.md) |

## What this mapping does not claim

Consistent with the [research decision ledger](./research-decision-ledger-v1.md)
(RD-001) and the evidence-class separation in the
[research package index](./README.md): this mapping is a **source-development
and integration** claim only. It does not assert:

- empirical measurement of scalability, adaptability or resilience gains under
  the simulation environments DICE requires — that is `not_executed` per the
  ledger;
- that the mapped capability names above are the terms a proposal should use
  verbatim without adaptation to the solicitation's required format; or
- that the [10-objective external plan](../transition/) gap list is
  superseded — see the
  [capability gap closure plan](./dice-capability-gap-closure-plan-v1.md) for
  the specific items this mapping does not cover.

## Related record

- [DICE capability gap closure plan V1](./dice-capability-gap-closure-plan-v1.md):
  the genuine (non-terminology) gaps identified against the external plan,
  ranked for the remaining solicitation window.
