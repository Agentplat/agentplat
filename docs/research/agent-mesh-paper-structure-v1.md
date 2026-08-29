# Agent Mesh paper structure V1

Status: manuscript structure grounded in the current repository evidence.

## Recommended title

**Agent Mesh: Governed Decentralized Coordination Under Partial Information — Architecture, Reproducible Evaluation, and Lessons from an Inconclusive Preregistered Study**

Shorter alternative:

**Agent Mesh: Bounded and Auditable Coordination for Multi-Agent Systems**

## Central thesis and claim boundary

The paper presents Agent Mesh as a governed coordination substrate for autonomous agents operating with partial information, bounded peer views, explicit authority, causal state, quorum, recovery, and protected-effect controls. Its empirical contribution is an auditable preregistered execution record and the diagnosis of the conditions that prevented confirmatory analytical closure.

The current evidence supports claims about architecture, implementation, deterministic execution closure, provenance, and reproducibility. It does not support a claim that Agent Mesh is generally superior to centralized planning, empirically validated at production scale, or production-ready.

## Reader model and explanation contract

Assume that the reader understands basic software systems but has no prior knowledge of Agent Mesh, multi-agent orchestration, distributed protocols, cryptographic identity, causal consistency, quorum, or fencing.

Every Agent Mesh concept must be introduced with the same five-part pattern:

1. **Plain-language intuition:** what the concept means without specialized vocabulary.
2. **Precise definition:** the exact meaning used by Agent Mesh.
3. **Concrete example:** one step from the running scenario introduced below.
4. **Why it exists:** the failure, ambiguity, or risk it prevents.
5. **Limits:** what the concept does not guarantee.

A term must be defined before it is used to explain another term. Acronyms are expanded on first use. Definitions should remain stable throughout the paper; synonyms that blur distinct concepts should be avoided.

### Running example used throughout the paper

Use one small, non-safety-critical scenario to connect all sections: a five-agent collective prepares a local infrastructure inspection report.

- one agent decomposes the objective;
- two agents inspect different evidence sources;
- one agent checks consistency and provenance;
- one agent is capable of publishing the final report;
- one inspection agent becomes unavailable;
- the collective must reassign its unfinished work without allowing the stale agent to publish later.

The scenario should appear first as a one-paragraph story, then be revisited when explaining messages, capabilities, work allocation, leases, epochs, fencing, evidence, quorum, recovery, and protected effects. It illustrates mechanics only and is not empirical evidence.

## Research questions

- **RQ1 — Scalability:** Does bounded-degree coordination stay within the registered communication and retained-state envelope as collective size increases from 50 to 500 agents?
- **RQ2 — Resilience and safety:** Under localized disruption, can unaffected scopes continue useful progress without violating protected-effect invariants?
- **RQ3 — Recovery:** Does recovery work track affected scopes and required replicas more closely than total collective size?
- **RQ4 — Safety–utility tradeoff:** How do semantic-horizon controls redistribute outcomes among useful decisions, replanning, safe stops, and unsafe executable decisions?
- **RQ5 — Comparative performance:** Under equal information, faults, resource limits, and interaction accounting, how do Agent Mesh outcomes compare with a centralized planner?
- **RQ6 — Evidence eligibility:** Which preregistered requirements prevent a completed execution campaign from becoming a valid empirical claim?

RQ6 should be explicit in this version of the paper because it captures the most important observed result of Campaign V28.

## Proposed manuscript structure

### 1. Abstract — 200–250 words

Use five moves:

1. problem: coordination under partial information, faults, and bounded communication;
2. system: authenticated causal messaging, governed membership, sparse coordination, agreement, recovery, and pre-effect controls;
3. method: paired blocked comparison with a fairness-constrained centralized planner at 50, 100, 250, and 500 agents across four strata;
4. observed result: 48 shards and 960 projections completed with zero recorded execution failures, but the preregistered analysis classified the evidence as ineligible;
5. contribution: architecture, reproducible evaluation machinery, and lessons about separating execution completeness from empirical validity.

Do not state or imply that the campaign validated Agent Mesh performance.

### 2. Introduction — 900–1,100 words

#### 2.1 Motivation

Explain why centralized orchestration becomes problematic when agents have partial observations, heterogeneous capabilities, changing membership, localized faults, and effects requiring explicit authorization.

#### 2.2 Research gap

Frame the gap as the absence of a single coordination substrate combining bounded peer operation, causal synchronization, governed membership, agreement, recovery, protected effects, and evidence provenance.

#### 2.3 Approach

Introduce Agent Mesh within AgentPlat and distinguish it from Agent Rooms and the higher-level Collective Runtime.

#### 2.4 Contributions

Claim only:

1. a provider-neutral architecture separating evidence, planning, agreement, and execution authority;
2. bounded and authenticated peer-coordination primitives;
3. a fairness-controlled, fail-closed evaluation design with independent monitoring;
4. an evidence chain binding source, preregistration, execution, and analysis; and
5. a transparent report of a completed but analytically ineligible campaign.

End with a concise roadmap of the paper.

### 3. Conceptual primer — 1,400–1,800 words

This section makes the paper self-contained. It should precede formal notation and related work.

#### 3.1 Agent, runtime, and peer

An **agent** is the decision-making software component. A **runtime** is the local execution environment that invokes a model, code, memory, or tools on the agent's behalf. A **Mesh Peer** is the independently executing network participant that gives an agent a protocol identity, local policy, neighbor view, and work journal. These terms are related but not interchangeable: an agent reasons, a runtime executes, and a peer participates in the distributed protocol.

Explain that one process may host a peer, but process placement is an implementation choice rather than the definition of an agent.

#### 3.2 Agent Mesh

In plain language, Agent Mesh is a group of independent participants that coordinate without relying on one participant to hold all state or make every decision. Precisely, it is a set of authenticated Mesh Peers that exchange versioned messages, retain bounded local state, and make policy-constrained local transitions.

Clarify that Agent Mesh is not a shared model, a global brain, a source of global truth, or a promise that every peer sees the same information immediately.

#### 3.3 Local state and partial information

Each peer knows only its own accepted records and a bounded subset of other peers. **Local state** is the information one peer has validated and retained. **Partial information** means no peer is assumed to possess a complete, current view of the collective or environment.

Use the running example: the evidence-inspection peer does not need the publisher's full internal state; it needs only the admitted objective, assigned work, relevant evidence references, and current authority records.

#### 3.4 Peer identity, instance identity, and cryptographic key

A **peer identity** names the continuing protocol participant. An **instance identity** distinguishes one authorized process lifetime of that peer. A **cryptographic key** lets recipients verify that a message was signed by the holder of the corresponding private key.

Explicitly distinguish authentication from authorization: a valid signature proves integrity and key possession; it does not prove that the statement is true, that the peer is admitted, or that the peer may perform an action.

#### 3.5 Admission and governed membership

**Admission** is the local or certified decision that a peer/key binding may participate in a particular tenant and mesh. **Membership** is the ordered, versioned set of admitted peers for a policy domain. A **membership epoch** is one immutable generation of that configuration.

Explain joins, leaves, restarts, revocation, and overlapping key rotation. Introduce joint quorum in plain language: a membership change needs sufficient support from both the old and proposed configurations so that two disconnected groups cannot independently declare themselves the successor.

#### 3.6 Peer Card, capability, and capability advertisement

A **Peer Card** is a signed, expiring declaration of supported protocol versions, addresses, and self-claimed capabilities. A **capability** is a bounded contract describing work a peer can perform. A **capability advertisement** is the signed, expiring claim that a peer currently offers that capability.

State the limit: these are discovery inputs, not proof of competence, trustworthiness, capacity, or permission.

#### 3.7 Peer View and sparse overlay

A **Peer View** is the bounded set of active neighbors and reserve candidates known locally by one peer. The **sparse overlay** is the logical communication graph formed by these partial views. It avoids requiring every peer to retain or communicate directly with every other peer.

Explain active versus reserve peers, bounded fanout, hops, deduplication, and interaction limits. Distinguish a finite sparse envelope from a proof of asymptotic scalability.

#### 3.8 Message envelope and wire protocol

A **message envelope** is the signed container carrying routing scope, sender, sequence, timestamps, payload digest, payload, and proof. The **wire protocol** defines the exact serialized structure and validation rules that permit different implementations to exchange messages consistently.

Explain canonicalization, payload hash, signature, audience, expiry, size limits, closed schemas, and protocol-version compatibility. A short annotated envelope is preferable to a full schema dump.

#### 3.9 Replay protection, idempotency, and delivery semantics

**Replay protection** prevents an old valid message from being accepted again as a new event. **Idempotency** means repeating the same identified operation does not create a second logical effect. **Delivery semantics** describe what the transport may lose, duplicate, delay, or reorder.

State clearly that Agent Mesh does not promise exactly-once network delivery. Safe external behavior additionally depends on downstream idempotency or atomic fence validation.

#### 3.10 Causality and causal synchronization

**Causality** records that one event depends on or was produced because of another. **Causal synchronization** exchanges and validates records while preserving predecessor relationships, so a peer does not treat a revision, acceptance, or recovery certificate as context-free.

Use a three-message example: work offer → bid → award. Explain that timestamps alone do not establish this dependency.

#### 3.11 Objective and policy

An **Objective** is a signed, versioned goal containing constraints, success criteria, permitted capabilities, resource limits, risk policy, timers, and expiry. **Policy** is the explicit set of rules used to decide what records, transitions, and effects are acceptable.

Explain that an objective is more than a natural-language prompt and that a revision is a complete versioned replacement, not an informal edit.

#### 3.12 Work Item and allocation lifecycle

A **Work Item** is a bounded unit derived from an accepted Objective. Explain the allocation sequence in order:

1. a **Work Offer** requests proposals;
2. a **Work Bid** states fit, capacity, estimates, and assumptions;
3. a **Work Award** selects an assignee for an exact revision;
4. acceptance activates the assignment under its declared authority and time bounds.

Use one diagram and the running example. Explain decline, cancellation, reoffer, and why receiving an award is not equivalent to unlimited authority.

#### 3.13 Lease, epoch, fencing token, and assignment authority

A **Lease** is time-bounded authority over a Work Item. An **assignment epoch** is the monotonically increasing generation of that assignment. A **fencing token** is a value that lets state or effect sinks reject an older assignment after recovery. **Assignment authority** is the accepted award or recovery certificate binding the epoch and fence.

Use the failure in the running example: after takeover, the replacement works under epoch 2; a late result from epoch 1 must be rejected even if it was produced by the originally valid assignee.

#### 3.14 Quorum, vote, certificate, and finality

A **quorum** is the policy-required threshold of eligible members whose votes are needed for a collective decision. A **certificate** is the verifiable record that the threshold was met. **Finality** means the protocol has accepted one outcome under a particular membership configuration and declared assumptions.

Explain strict majority before Byzantine thresholds. Distinguish crash/restart tolerance from Byzantine fault tolerance, and state the assumptions for each mechanism rather than calling the whole system “Byzantine-safe.”

#### 3.15 Recovery witness and recovery certificate

A **recovery witness** is a policy-named peer allowed to evaluate a post-expiry takeover. A **recovery certificate** combines the required valid witness votes and advances the assignment epoch, fencing the older authority.

Explain recovery grace, candidate consent, stale witnesses, conflicting votes, quorum loss, and safe stop.

#### 3.16 Work journal, checkpoint, and handoff

A **Work Journal** is the append-only local event history used to reconstruct Work Item state. A **checkpoint** is a bounded, validated snapshot from which work may continue. A **handoff** transfers resumable work context while preserving authority, provenance, and predecessor bindings.

Clarify that a checkpoint is not automatically trusted, current, complete, or authorized merely because it can be deserialized.

#### 3.17 Evidence claim, attestation, challenge, and retraction

An **Evidence Claim** is a signed statement about an observation or result with provenance. An **attestation** independently supports, contradicts, or marks the claim inconclusive. A **challenge** requests bounded review of one exact record. A **retraction** append-only withdraws a record by its original author.

Explain why a signature proves authorship and integrity rather than truth. Challenges must not become negative facts automatically.

#### 3.18 Evidence fusion, trust, eligibility, and quarantine

**Evidence fusion** applies an explicit local policy to admitted claims and attestations. A **Trust Profile** is a local, capability-scoped, multidimensional estimate with uncertainty and decay. An **eligibility decision** compares that exact profile with declared thresholds. **Quarantine** temporarily isolates a peer within a scope after locally verifiable conditions are met.

State that Agent Mesh has no universal trust score or global reputation. Trust may restrict an already bound decision but cannot create membership, assignment, or execution authority.

#### 3.19 Inference Control and semantic horizon

**Inference Control** evaluates context, model output, messages, and proposed actions around an agent execution. A **semantic horizon** is the bounded region in which accumulated evidence supports continuing under the current role, context, and policy. Crossing its configured risk boundary may produce allow, revise, retry, replan, safe stop, escalate, or deny.

Explain why useful-decision rate and safe-stop rate must be reported together: eliminating all actions would look safe but provide no utility.

#### 3.20 Protected effect, Action Gateway, grant, and permit

A **protected effect** changes external state, such as publishing a report, writing to a database, sending a message, or invoking a consequential tool. The **Action Gateway** is the local enforcement boundary through which such an effect must pass. An **Action Grant** is short-lived scoped authority for one action. A **Governed Action Permit** binds that grant to the current work contract, resource limits, policy, assignment epoch, and fencing token.

Emphasize that having a tool handler, producing a plan, winning a vote, or generating convincing text does not itself authorize an effect.

#### 3.21 Control, data, and observability planes

The **control plane** configures or starts the mesh but need not own steady-state coordination. The **data/coordination plane** carries peer protocol records and local state transitions. The **observability plane** receives metrics and audit events without deciding protocol behavior.

Explain why telemetry must not silently become authority and why control-plane failure need not imply immediate loss of peer-to-peer coordination.

#### 3.22 Safe stop, failure, invalid execution, and incomplete evidence

Define these outcomes separately:

- **safe stop:** progress is deliberately halted because required authority or confidence is unavailable;
- **mission failure:** a valid execution reaches a registered unsuccessful terminal state;
- **infrastructure invalidity:** the experiment cannot support inference because execution infrastructure violated a preregistered condition;
- **incomplete evidence:** a required trace, replay, monitor verdict, cell, or artifact is missing.

This distinction is required both for system behavior and for interpreting the empirical study.

### 4. Background and related work — 900–1,200 words

Organize the literature by problem, not by product:

- multi-agent orchestration and planning;
- decentralized and peer-to-peer coordination;
- distributed systems: causal consistency, membership, quorum, and Byzantine agreement;
- agent safety, authority, and pre-effect control;
- evaluation and reproducibility of agentic systems.

The comparison should identify which guarantees each approach assumes or provides. Avoid treating “multi-agent” and “distributed” as synonyms.

### 5. System model and assumptions — 700–900 words

Define:

- peer, instance, tenant, mesh, objective, and membership epoch;
- bounded local peer view and permitted information;
- signed message envelope, causal predecessor, and replay window;
- planning evidence versus execution authority;
- protected effect and effect fence;
- safety and liveness assumptions;
- trust, key-distribution, and fault assumptions.

State explicitly that a valid signature proves key possession, not admission or authority, and that liveness depends on the registered topology, quorum, storage, and transport assumptions.

### 6. Agent Mesh architecture — 1,600–2,000 words

#### 6.1 End-to-end lifecycle

Begin with a two-page narrative tracing one Objective from issuance through discovery, offer, bid, award, execution, evidence production, protected effect, peer failure, and recovery. This establishes the whole before decomposing it into mechanisms.

#### 6.2 Authenticated wire protocol

Describe deterministic serialization, Ed25519 signatures, tenant/mesh scoping, bounded parsing, expiry, replay protection, and closed message types.

#### 6.3 Governed membership and identity lifecycle

Cover admission, instance restart, key rotation/revocation, membership epochs, and lineage.

#### 6.4 Causal synchronization and replicated state

Explain causal records, deduplication, recovery, checkpoints, and the limits of historical verification.

#### 6.5 Sparse collective coordination

Explain bounded active/reserve views, deterministic fanout, hop and interaction ceilings, and why finite-range measurements are not an asymptotic proof.

#### 6.6 Planning, allocation, and agreement

Show how planning fragments, bids/awards, quorum certificates, and finality compose without granting implicit execution rights.

#### 6.7 Evidence, trust, and inference control

Show explicitly how these mechanisms provide different inputs to a decision: evidence records observations, Trust evaluates source eligibility locally, and Inference Control evaluates the current context/output/action. None independently creates execution authority.

#### 6.8 Protected-effect boundary

Explain how policy, semantic-horizon decisions, fences, assurance checkpoints, and independent audit precede external effects.

#### 6.9 Failure and recovery paths

Describe quorum loss, stale state, peer failure, partition, handoff, replanning, safe stop, and restart behavior.

### 7. Evaluation methodology — 1,300–1,600 words

#### 7.1 Study design

Paired, blocked simulation. Each scale/stratum/seed cell runs both `adaptive_collective` and `centralized_planner` with the same observations, response tape, fault realization, interaction ceiling, logical-time ceiling, and protected-effect boundary.

#### 7.2 Treatments and fairness contract

Explain what each treatment can observe and do. Emphasize that the centralized baseline receives no hidden state or future-fault access and pays the same accounted boundary interactions.

#### 7.3 Factors and sample plan

- scales: 50, 100, 250, and 500 logical agents;
- strata: nominal, benign, adversarial, and mixed;
- 240 paired experimental cells;
- first execution plus exact replay for each treatment;
- 960 total projections across 48 authorized shards;
- fixed aggregation seed: `20260810`.

#### 7.4 Endpoints

Define mission success, protected-effect safety, sparse growth, recovery interactions, semantic-horizon outcomes, useful-decision rate, agreement safety, and exact replay.

#### 7.5 Statistical analysis

Report preregistered Wilson lower bounds, paired deterministic bootstrap, Holm correction, nearest-rank p95 recovery, the 1,000-decision role-coherence horizon, and zero-tolerance safety rules.

#### 7.6 Independent evaluation and validity

Explain why the hidden monitor, rather than either runner, owns terminal predicates, hidden world state, canaries, and endpoint derivation.

#### 7.7 Reproducibility and execution controls

Describe frozen source identity, signed authorization, content-addressed objects, immutable receipts, hash-chained events, sequential shard execution, replay, and registered execution limits.

### 8. Results — 1,000–1,300 words

Separate results into three layers.

#### 8.1 Execution closure

Report:

- 48/48 authorized shards completed;
- 960/960 projections completed;
- 960 succeeded and 0 recorded execution failures;
- 2 supervisor recoveries retained in the operational event chain;
- 102 hash-chained operational events;
- 3,840 content-addressed objects;
- recorded aggregate shard wall time of 10 h 27 m 38 s;

These are execution and provenance results, not comparative performance results.

#### 8.2 Confirmatory analytical decision

State prominently that the normative result was **ineligible** and that empirical claim permission was **false**. Report all three reason codes:

1. `normative_role_coherence_horizon_invalid`;
2. `normative_role_useful_rate_below_threshold`;
3. `normative_convergence_evidence_missing`.

#### 8.3 Endpoint results and exploratory diagnosis

Populate only from `normative-analysis.json`, `paper-tables.json`, and canonical raw rows when those artifacts are available in the publication package. Any post hoc diagnosis of why a criterion failed must be labeled exploratory. Do not reconstruct missing endpoint values from prose summaries.

### 9. Discussion — 900–1,100 words

#### 9.1 What the evidence establishes

The pipeline can execute and collect the registered campaign completely, preserve interruptions, and enforce an analytical eligibility gate.

#### 9.2 What the evidence does not establish

It does not yet establish comparative advantage, the preregistered role-coherence property, convergence, production safety, or operational scalability.

#### 9.3 Architectural lessons

Discuss the tradeoffs of bounded local state, explicit authority, safe stops, quorum dependence, and auditability.

#### 9.4 Methodological lessons from ineligibility

Explain why execution success and scientific validity must remain separate. Discuss whether the role-coherence horizon was operationalized correctly, why useful-decision rate fell below threshold, and what evidence was absent for convergence—without changing thresholds retrospectively.

#### 9.5 When centralized coordination may be preferable

Identify conditions such as reliable global visibility, low fault rates, small teams, strict latency requirements, or low coordination complexity.

### 10. Threats to validity — 600–800 words

Address:

- simulator fidelity and recorded-response limitations;
- finite 50–500 scale ladder;
- declared rather than exhaustive fault families;
- fairness-constrained baseline scope;
- evaluator and monitor correctness;
- construct validity of useful-decision and convergence measures;
- one local Apple Silicon environment;
- implementation maturity and external validity;
- possible mismatch between logical-agent scale and deployed runtime behavior.

### 11. Ethics, safety, and governance — 300–500 words

Cover the separation between evidence and execution authority, protected-effect gating, sensitive-data exclusions, prompt/reasoning non-publication, key custody, and responsible disclosure. Add the venue-specific ethics determination after human review.

### 12. Reproducibility and artifact availability — 300–500 words

List the frozen commit, registration and authorization digests, public verification key, collection manifest, normative analysis, receipt root, raw rows, analysis implementation, environment description, and any unavailable artifact with a reason. A digest is useful only when the referenced artifact is accessible to reviewers.

### 13. Conclusion — 250–350 words

Conclude that Agent Mesh contributes an implementable and auditable model for bounded decentralized coordination, while Campaign V28 demonstrates reproducible execution closure rather than confirmatory empirical validation. Name the next study requirements: repair or justify the role-coherence horizon, meet or reassess the preregistered useful-decision criterion through a new registration, and provide complete convergence evidence.

## Tables

| ID | Content | Evidence status |
| --- | --- | --- |
| T1 | Components, state, authority, failure behavior, and assumptions | Source-backed |
| T2 | Information and action parity between both treatments | Protocol-backed |
| T3 | Scale, strata, seeds, ceilings, cells, replays, and shards | Preregistered |
| T4 | Execution closure and provenance metrics | Observed in V28 |
| T5 | Confirmatory eligibility criteria and observed decision | Observed in V28 |
| T6 | Per-stratum endpoint estimates, intervals, and missing/invalid counts | Populate from normative artifacts only |
| T7 | Paired treatment deltas and multiplicity-adjusted decisions | Populate from normative artifacts only |
| T8 | Safety, replay, recovery, communication, coherence, and resource outcomes | Populate from normative artifacts only |

## Figures

| ID | Figure | Purpose |
| --- | --- | --- |
| F1 | Layered architecture and pre-effect authority flow | Explain the system boundary |
| F2 | Lifecycle of a signed message from admission to effect decision | Explain trust and authority separation |
| F3 | Paired blocked experimental design and hidden monitor | Explain fairness and endpoint ownership |
| F4 | Evidence chain from source commit to analytical decision | Explain reproducibility and fail-closed eligibility |
| F5 | Interactions and retained state versus collective size | Finite-range scalability result, if eligible data exist |
| F6 | Paired mission-outcome differences by stratum | Comparative result, if eligible data exist |
| F7 | Recovery-work distributions after disruption | Resilience result, if eligible data exist |
| F8 | Useful decisions, replans, safe stops, and unsafe decisions | Show safety and utility jointly |

## Suggested abstract draft

Coordinating autonomous agents under partial information requires more than task routing: membership, evidence, agreement, recovery, and execution authority must remain explicit under bounded communication and faults. We present Agent Mesh, a provider-neutral coordination substrate that combines authenticated causal messaging, governed membership, sparse peer views, distributed planning and agreement, and fail-closed protected-effect controls. We evaluate the system using a preregistered paired, blocked simulation against a fairness-constrained centralized planner at 50, 100, 250, and 500 logical agents across nominal, benign, adversarial, and mixed conditions. Campaign V28 completed all 48 authorized shards and 960 projections with zero recorded execution failures, while preserving immutable receipts, content-addressed evidence, exact-replay records, and a hash-chained operational log. However, the preregistered analysis classified the collected evidence as ineligible for an empirical claim because the role-coherence horizon was invalid, useful-decision rate was below threshold, and convergence evidence was missing. We therefore report execution closure and reproducibility, not comparative superiority. The result illustrates both the architectural value of separating evidence from execution authority and the methodological importance of separating completed experiments from analytically valid claims.

## Writing rules for the manuscript

- Use “observed under the registered conditions,” not “proves,” “guarantees,” or “scales universally.”
- Report counts before percentages and distinguish mission failure, safe stop, aborted execution, and infrastructure invalidity.
- Keep architecture evidence, source conformance, simulation measurements, and production claims in separate paragraphs and tables.
- Present the ineligibility decision in the abstract, results, discussion, and conclusion—not only in an appendix.
- Keep confirmatory and exploratory analyses visibly separate.
- Never infer a zero safety count when monitor closure or evidence is missing.
- Cite machine-verifiable artifacts for every numerical statement.
- Introduce no Agent Mesh term only through a table, diagram, or code listing; each needs a prose definition.
- Use one concept per paragraph when first introducing terminology.
- Put formal notation after the intuitive explanation, never before it.
- For every guarantee, state its assumptions and failure behavior in the same subsection.
- Prefer a small worked example to an exhaustive enumeration of message fields.
- End each architecture subsection with a one-sentence “What this does not guarantee” boundary.

## Human decisions still required

- target venue and its length/template;
- author order, affiliations, and CRediT roles;
- related-work corpus and citation style;
- funding, conflict-of-interest, and ethics statements;
- public artifact repository and DOI;
- whether Campaign V28 is the main empirical study or a pilot preceding a newly registered campaign.
