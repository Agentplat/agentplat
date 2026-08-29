# DICE capability gap closure plan V1

Status: pre-implementation prioritization. No code has changed as a result of
this document. See the
[DICE solicitation alignment](./dice-solicitation-alignment-v1.md) for what is
already covered and the
[research decision ledger](./research-decision-ledger-v1.md) for the
evidence-class rules this plan must not blur.

## Method

Five read-only agents compared the external 10-objective plan's ~140
capability bullets against the current source tree, citing concrete
file/export evidence for each. ~85% of bullets map to an existing,
reference-integrated capability under a different name (see the alignment
document). The remainder — approximately 25 items — are genuine gaps: no
amount of renaming closes them, they require new code. This plan ranks those
25 against the literal language of solicitation `HR001126S0010` and the
remaining time to its 2026-08-25 deadline (12 days as of 2026-08-13), not
against the external plan's own ordering.

Ranking criteria, in priority order:

1. **Direct textual match** to a DICE requirement ("rogue AI agents",
   "remaining under our control", "resilient... to agent loss or compromise",
   "theory of self-organizing systems and distributed consensus algorithms").
2. **Reviewer visibility** — whether a reviewer evaluating this specific
   solicitation would look for the capability by name.
3. **Bounded effort** — whether the gap is a seam/interface addition on top of
   existing contracts, versus a new subsystem or a reversal of an existing
   design decision.

## Tier 1 — recommended for this cycle

| Gap | DICE language it answers | Existing anchor point | Effort | Why now |
| --- | --- | --- | --- | --- |
| Coordination-control → inference-control bridge (Objective 5): a typed projection so a team/role assignment change deterministically updates allowed context zones, memory scope, tool scope and authority in `inference-control`, instead of the two layers only being independently certifiable. | "The local inference control on each AI agent will ensure role coherence... and constrain the emergent behavior of the collective" — this is the single sentence DICE is named for. | `coordination-control-guarantees-contracts.ts` (disposition/gate) and `role-realignment.ts` (certified role change) already exist independently; the gap is the missing typed bridge between them. | M | This is not one gap among 25 — it is the closest thing to DICE's own thesis statement that the repo does not yet demonstrate end-to-end. |
| Propagated prompt-injection containment (Objective 7): a mechanism that bounds/quarantines adversarial content propagating across mesh hops, distinct from source-credibility scoring. | "'rogue' AI agents that might develop misaligned instrumental goals" and "resilience... against... adversarial attacks." | `trust/quarantine.ts`, `collusion-aware-context.ts` already quarantine *sources*; nothing currently bounds propagation of adversarial *content* through an otherwise-credible chain. | S–M | Explicitly named in the program description; currently a documented non-implementation (one ADR mention, no code), which is a specific, fixable, high-visibility absence. |
| Configurable approval-checkpoint policy (Objective 10): an explicit autonomous / notify / deferred-approval / mandatory-approval mode gating `autonomous-mission-loop-runtime.ts`, instead of the loop running with no approval gate by construction. | "remaining under our control" and "aligned with commander's intent over the long term." | `GOVERNED_MISSION_CONTROL_ACTIONS_V1` already has a control-plane vocabulary (continue/pause/restrict); missing is an approval-mode *policy* consumed by the autonomous loop. | S–M | Directly answers the "remaining under control" framing with a concrete, demoable gate rather than an implicit property of the current design. |
| Pluggable allocation/negotiation strategy interface (Objective 2) and pluggable evidence-fusion strategy interface (Objective 6), minimally as one interface plus the existing algorithm as its first implementation. | "theory of self-organizing systems and distributed consensus algorithms" — DARPA's own theoretical-foundations thrust asks for generality, not one fixed mechanism. | `mechanism-allocation-reducer.ts` / `team-formation-reducer.ts` and `trust/fusion.ts` each hardcode one algorithm today. | S (interface + wrap current algorithm) / L (if a second concrete algorithm is also required) | Cheapest way to turn "one fixed algorithm" into a defensible theoretical-generality claim; can stop at the interface if time runs out.

## Tier 2 — real gaps, defer past this cycle unless time remains

| Gap | Why it is real | Why it waits |
| --- | --- | --- |
| Unified 6-state compromise lifecycle (Objective 7): consolidate `PeerCredibilityStatusV1`, `QuarantineStatusV1` and `CompromiseRecoveryStageV1` into one healthy→suspicious→restricted→isolated→recovered→expelled model. | State model is genuinely fragmented across three enums today. | Mostly a refactor/consolidation, not new capability; lower reviewer visibility than the Tier 1 items covering the same "resilience to compromise" ground. |
| Forensic incident preservation (Objective 7): signed, immutable export of raw evidence for post-hoc audit, beyond current retain-until-ack. | No code found beyond retention-until-acknowledgment. | Valuable for an eventual empirical campaign, not for a simulation-scope proposal deadline. |
| Local leader election/replacement, team split/merge, nested/federated teams (Objective 3). | Confirmed absent by grep across collective-runtime/collective-membership. | Self-organization thrust is already evidenced by team formation + strategy convergence (Tier-1-adjacent, already covered); these add breadth, not a missing core claim. |
| Cross-team authority-concentration policy and unified organizational lineage (Objective 3). | `AgentLineageRecordV1` and `TeamEpochHistoryEntryV1` are disjoint, narrower records. | Same reasoning — additive, not foundational. |
| Mandate renewal for long missions, plan rollback/branching, safe abandonment of unviable objectives (Objective 10). | `DelegationMandateV1` only expires, never renews; "rollback" in the repo means anti-regression, never intentional branching. | Relevant to "sustained long-time-horizon missions" language but a larger design surface than the approval-checkpoint gate; do only if Tier 1 lands with days to spare. |
| Configurable availability-vs-consistency policy for the mesh (Objective 9). | ADR 0042 states the current fail-closed/CP bias as an explicit non-goal reversal target. | This is a reversal of a stated design decision, not an additive seam — higher risk of destabilizing existing capability-matrix claims under deadline pressure. |

## Out of scope for this cycle (explicit, not silent)

Per the external plan's own anti-scope-creep rule ("un hallazgo que no se
mapee requiere reemplazar alcance, no añadir automáticamente otro objetivo"),
the following confirmed gaps are recorded as known and deliberately
unaddressed before 2026-08-25, not omitted by oversight:

- logit-level control adapters and literal semantic-entropy/instrumental-
  objective terminology (Objective 4) — the existing confidence/coherence
  proxies already answer the functional requirement; the gap is naming, not
  capability;
- audio/video modality wiring into the simulation/environment adapter path,
  dedicated physical-action envelopes, VLA/RL/symbolic-planner adapter
  classes, TA3-style portability (Objective 8) — DICE's scope is
  simulation-only and does not itself name these modalities or that
  environment;
- bandwidth/prioritization accounting, non-memory transport adapters
  (WebSocket/broker/DTN), local-file or embedded-database persistence
  backends (Objective 9) — production/deployment hardening, out of scope for
  a program whose stated scope excludes real-world deployment.

## What this plan does not authorize

Consistent with the [research decision ledger](./research-decision-ledger-v1.md),
this document orders candidate work; it does not itself authorize an
implementation change. Any Tier 1 item moves to code only on explicit
direction, following the repository's normal ADR and capability-matrix update
discipline once implemented.
