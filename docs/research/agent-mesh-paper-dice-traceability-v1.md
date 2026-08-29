# Agent Mesh paper — DICE traceability audit V1

Status: internal evidence audit for the publication manuscript. This file is not part of the paper.

## Evidence classes

- **Source:** public contract or reference implementation exists.
- **Integrated:** a concrete composition connects the capability to an operational path and rejects caller-authored substitutes.
- **Conformance:** deterministic fixture, bounded-state check, or contract test exists; this is not mission-performance evidence.
- **Empirical:** measurement from a registered evaluation.
- **Operational:** evidence from a target deployment.

## Traceability matrix

| DICE-relevant concern | Paper location | Authoritative repository evidence | Highest supported class | Limitation retained in paper |
| --- | --- | --- | --- | --- |
| Peer-to-peer coordination without a global scheduler | §§3.2, 3.5, 5, 6 | ADR 0042; capability matrix #1–3; sparse overlay contract | Integrated | No global optimality or availability under permanent partition |
| Sparse partial views | §§3.5, 5.5, 6.2 | `docs/agent-mesh/sparse-collective-scale-v2.md`; capability matrix #2 | Conformance | Profiles are not mission-performance evidence |
| Distributed decomposition and allocation | §§3.10, 5, 5.1, 5.3 | capability matrix #6–7; ADR 0042 allocation path | Integrated | No empirical allocation-quality or global-optimality claim |
| Dynamic Team and role adaptation | §§5.3, 6.1 | capability matrix #11 and #15; ADR 0042 operational extension | Integrated | No empirical Team-complexity, novelty, split/merge, or adaptation-quality result |
| Sparse adversarial agreement | §§3.12, 5, 6.2 | capability matrix #8; distributed control model | Integrated | Threshold and committee assumptions are explicit; not every quorum is Byzantine consensus |
| Conflicting information and local credibility | §§3.14, 5, 5.1 | capability matrix #9; Trust and context-fusion surfaces | Integrated | No global truth, reputation, collusion-resistance, or universal propagated-content containment |
| Failure and compromise recovery | §§3.13, 5.3, 6.1 | capability matrix #10; ADR 0042 compromise-aware recovery | Integrated | Compromise must first be established by a verified verdict; universal detection is not claimed |
| Local inference control | §§3.15, 5, 5.1, 6.1 | capability matrix #12–13; operational cognitive control objective | Integrated | V28 role-coherence evidence is ineligible |
| Statistical semantic horizon | §§3.15, 5, 5.1 | capability matrix #16; semantic-horizon coupling | Integrated | Source enforces decisions; empirical safety–utility outcome remains unproven |
| Coordination and control composition | §§5.1–5.3, 6.1 | ADR 0042 guarantees contract and reference stack | Integrated | No universal projection from every Team/role change into every adapter's context, memory, tool, and authority scopes |
| Heterogeneous agent support | §§3.1, 5, 5.4 | capability matrix #14 and #18; `packages/interop/README.md` | Integrated | Portability contract exists; multi-family empirical demonstration does not |
| Governed agent creation and retirement | §§3.3, 5 | capability matrix #4 and #17; collective-membership README | Integrated | Requires real key custody, identity, membership, storage, and endpoint providers |
| Protected effects and assurance | §§3.16, 5.1, 6 | ADR 0042 planning-to-effect bridge; executable invariant statements | Integrated/conformance | Downstream systems must atomically honor idempotency and fencing |
| Causal observability and replay | §§3.8, 3.17, 5, 7.5 | capability matrix #8 integrated objective and #19 capability; V28 appendix | Integrated plus empirical execution closure | Telemetry is non-authoritative; replay does not prove semantic correctness |
| Simulation interoperability | §§5.4, 7 | `packages/interop/README.md`; capability matrix #18–19 | Integrated | No evidence of integration with an external common evaluation environment |
| Scale ladder | §§5.5, 7.2, 8, 10 | sparse-scale V2; empirical protocol; V28 appendix | Conformance at configured profiles; empirical through 500-agent registered ladder only | No empirical mission claim at 5,000 or 100,000 peers |
| Controlled emergence | §5.2 | synthesis of ADR 0042, control model, capability matrix, and paper claim boundary | Architectural definition | No eligible empirical convergence or global-emergence result |

## V28 statement audit

The paper may state only the following V28 observations from the checked-in appendix:

- 48 of 48 authorized shards completed;
- 960 of 960 registered projections completed;
- 960 recorded projection successes and no recorded projection failure;
- two supervisor recoveries and 102 hash-chained operational events;
- 3,840 content-addressed objects;
- recorded aggregate shard wall time of 10 h 27 min 38 s;
- normative decision `ineligible` and empirical claim permission false; and
- the three exact reason codes recorded in the appendix.

The paper must not infer per-stratum mission success, comparative superiority, protected-effect safety, recovery distribution, convergence, or role coherence from those execution-closure values.

## Publication audit rule

Every future substantive statement added to §§5–8 must identify its evidence class. A source or conformance statement must not be rewritten as an empirical or operational claim without new authoritative artifacts.
