# AgentPlat — DARPA DICE preparation draft

Status: working draft for internal review. Not submitted to DARPA.

## 1. Purpose

Position AgentPlat as an open-core research substrate for DICE, not as a
finished solution to controlled emergence. The proposed DICE work must add
research and produce metric-driven evidence for scalability, adaptability,
resilience and sustained mission/role alignment.

## 2. One-paragraph capability statement

AgentPlat is an open-core, provider-neutral substrate for decentralized
multi-agent systems. It provides authenticated peer coordination, governed
membership and lineage, quorum-based collective decisions, local role and
inference control, checkpointed recovery, bounded fault injection, deterministic
replay and auditable telemetry. Its explicit boundaries separate coordination,
authority, inference control, effects, persistence and evaluation, allowing
heterogeneous agent implementations and simulation environments to be compared
under declared fault models.

## 3. DICE alignment

| DICE concern | AgentPlat evidence to present | Evidence status |
|---|---|---|
| Decentralized coordination | Agent Mesh, causal synchronization, sparse peer views | Source/API capability; empirical DICE-scale evidence still needed |
| Dynamic collective formation | governed membership, lineage, collective runtime and planning | Source/API capability; mission benchmark needed |
| Heterogeneous agents | provider-neutral model and interoperability boundaries | Source/API capability; adaptor demonstration needed |
| Local inference/role control | Context Integrity, Continuous Role Alignment, Adaptive Role Realignment | Source/API capability; long-horizon evaluation needed |
| Failure and compromise resilience | quorum, Byzantine agreement, fencing, recovery and threat model | Source/API capability; adversarial campaign needed |
| Simulation and T&E | `@agentplat/mesh-sim`, bounded fault plans, replay and invariant monitors | Reproducible harness; DICE-common-environment integration needed |
| Observability | redacted audit, telemetry, provenance and evidence ledgers | Source/API capability; evaluation data package needed |

## 4. Proposed research wedge

AgentPlat would serve as the coordination and assurance substrate while a DICE
performer team develops and evaluates new algorithms for:

1. scalable peer-to-peer self-organization under partial views;
2. local inference control that preserves role coherence across long horizons;
3. collective adaptation after agent loss, compromise or degraded communication;
4. statistical guarantees for bounded emergent behavior rather than strict
   single-trajectory determinism;
5. reproducible comparisons against centralized orchestration and ad hoc
   multi-agent composition.

The research claim should be framed as a testable hypothesis, not a product
claim: explicit local coordination and control boundaries can improve
collective scalability and resilience while keeping mission-relevant behavior
observable, bounded and recoverable.

## 5. Suggested evaluation plan

Use paired seeds and identical mission conditions across:

- centralized baseline;
- ad hoc agent composition baseline;
- AgentPlat decentralized substrate without new DICE algorithms;
- AgentPlat plus the proposed DICE coordination/inference methods.

Measure at minimum:

- mission success and completion time;
- interaction and communication cost;
- scale across increasing population and topology sparsity;
- recovery time after crash, partition, loss or compromise;
- false acceptance and false rejection of role/inference interventions;
- role coherence over increasing inference steps;
- safe-stop, quorum-loss and fencing behavior;
- replay fidelity and evidence completeness.

Do not claim 100,000-agent performance from configuration profiles alone. Label
source capabilities, simulation results, and deployment readiness separately.

## 6. First-contact email — evaluation request

To: `DICE@darpa.mil`

Subject: `AgentPlat as a research substrate for DARPA DICE (HR001126S0010)`

Dear DICE Program Team,

We are writing regarding DARPA’s Decentralized Artificial Intelligence through
Controlled Emergence (DICE) program, HR001126S0010.

Over the past months, we have been developing AgentPlat as an open-core,
provider-neutral substrate for decentralized multi-agent systems. We recognize
that it is still a work in progress and is not yet at the level we would want
for a formal DICE proposal. Nevertheless, several parts of the work appear
closely related to DICE, including decentralized peer coordination, governed
membership, quorum-based collective decisions, local role and inference
control, recovery after faults, bounded simulation and auditable telemetry.

We are sharing it because we would appreciate the DICE team’s consideration of
whether this work is technically relevant to the program’s research interests,
or whether any part of it may be useful as a reference, research substrate or
starting point for future work. We are not asking for a meeting or implying
that AgentPlat is a complete solution; we would simply value any evaluation or
direction the team is able to provide.

Repository: https://github.com/Agentplat/agentplat
Documentation: https://doc.agentplat.com
Website: https://agentplat.com

Thank you for considering this early-stage work.

Best regards,

`[Name]`
`[Organization]`
`[Title]`
`[Email]`
`[Phone]`

## 7. Information still needed before formal submission

- legal entity name, country and primary work location;
- US partner/prime or proposed performer-team arrangement;
- principal investigator and key personnel bios;
- access to compute and simulation infrastructure;
- intended DICE technical area(s) and proposed role in the team;
- relevant publications, prior funded work and past performance;
- quantified baseline results from AgentPlat simulations;
- budget, schedule and labor assumptions;
- intellectual-property and open-source licensing position;
- export-control, CUI and facility/personnel-security posture;
- exact compliance with the current BAA templates and submission instructions.

## 8. Immediate next actions

1. Review this draft internally and nominate the technical lead and submitting
   organization.
2. Produce one clean, 5–10 minute reproducible demo with a fault/recovery
   scenario and generated metrics.
3. Fill the missing formal-submission fields above.
4. Send the short email to `DICE@darpa.mil` with a two-page PDF abstract or
   concise technical note.
5. If AgentPlat is not eligible or positioned to lead directly, approach US
   universities, FFRDCs, UARCs, defense contractors and autonomy laboratories
   as a component/subcontracting partner.
