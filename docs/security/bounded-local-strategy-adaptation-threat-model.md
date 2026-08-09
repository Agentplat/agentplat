# Bounded Local Strategy Adaptation V1 threat model

## Protected assets

- immutable strategy catalog, operation baselines and implementation bindings;
- exact tenant, Mesh, policy-domain, mission, Objective and optional Work scope;
- current Trust, role, capability-state, context-integrity and authority vetoes;
- causal decision-to-outcome binding and admitted feedback-source identity;
- bounded exploration, reward influence and local retained state;
- logical-time, source-revision, decision-consumption and handoff continuity;
- confidentiality of prompts, outputs, credentials and raw control evidence.

## Trust boundaries

The runtime trusts its configured policy, catalog, safety resolver, entropy
port and atomic state store. Safety and feedback records are projections from
controls or admitted outcome authorities, not remote self-assertions.

Strategy implementations remain outside this boundary. A decision authorizes
only dispatch to one pre-registered local implementation. Planning acceptance,
candidate eligibility, assignment authority, recovery certification and
external effects remain controlled by their existing components.

## Threats and controls

| Threat                             | Control                                                                                 | Failure behavior                          |
| ---------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------- |
| Strategy injection                 | Exact immutable catalog digest and request-bound eligible IDs                           | Reject request or decision                |
| Unsafe exploration                 | Required safety dimensions, exploration ceiling and baseline probability floor          | Remove arm or use baseline                |
| Caller-chosen randomness           | Construction-bound entropy port and draw-evidence digest                                | Reject malformed draw                     |
| Cross-scope replay                 | Request and feedback bind complete scope, operation and context digest                  | Reject feedback                           |
| Fabricated scalar reward           | Reward is derived from closed, clipped metrics                                          | Reject unknown fields or metrics          |
| Single-source outcome manipulation | Policy-bound independent sources, minimum confidence and deterministic median           | Keep decision pending                     |
| Feedback source rollback           | Durable source revision heads                                                           | Reject feedback batch                     |
| Same-revision equivocation         | Source revision plus feedback digest comparison                                         | Quarantine selected arm and do not learn  |
| Duplicate outcome learning         | Pending decision is consumed exactly once                                               | Return prior outcome or reject conflict   |
| Unsafe learned strategy            | Immediate quarantine and baseline-only cooling period                                   | Roll back to baseline                     |
| Unsafe baseline                    | Operation-level pause                                                                   | Abstain until new policy or valid handoff |
| Weight explosion                   | Fixed-point arithmetic, clipping and deterministic normalization                        | Clamp within policy bounds                |
| State exhaustion                   | Bounds on arms, pending decisions, feedback heads, reasons and CAS attempts             | Reject oversized input                    |
| Restart rollback                   | Snapshot digest, logical-time high water and durable CAS state                          | Reject older state/input                  |
| Handoff fork                       | Exact source-state predecessor and empty atomic target                                  | Idempotent import or conflict             |
| Safety-control bypass              | Adapter may only convert equal or narrower dispositions; selection creates no authority | Existing control still vetoes             |
| Sensitive data retention           | Content-free identifiers, scores, dispositions and digests only                         | Unknown/content fields rejected           |

## Safety properties

1. A strategy absent from the policy-bound catalog cannot be selected.
2. A missing or non-eligible required safety dimension cannot increase an
   arm's probability.
3. Total exploration and the baseline probability floor remain policy bounded.
4. Feedback cannot update an arm unless it causally binds one pending decision
   and satisfies the configured independent-source threshold.
5. One unsafe admitted outcome cannot increase the selected arm's weight.
6. A quarantined arm cannot be selected before its exclusive release time.
7. A strategy decision cannot create planning acceptance, Work, authority,
   leases, fencing, recovery certificates, Action Grants or effects.
8. State and handoff snapshots retain no prompt, output, credential, raw Trust
   evidence or hidden model reasoning.

## Residual risks and non-goals

- Compromise of enough admitted feedback sources can produce a structurally
  valid misleading cohort. Deployments should use independent authorities and
  protect implementation bindings.
- The controller provides bounded online adaptation, not proof of global
  optimality or convergence under arbitrary non-stationary adversaries.
- A compromised entropy port can bias exploration. Production deployments
  should use an unpredictable, integrity-protected implementation.
- Conservative baseline or abstention can reduce availability during
  partitions or missing state.
- V1 does not exchange learned weights between peers or build a global model.

## Required verification

- strict catalog, policy, request, signal, feedback, decision and state tamper
  rejection;
- exact probability totals, exploration ceiling and baseline floor;
- deterministic replay with the reference entropy port;
- causal feedback, median reduction, source rollback, equivocation and
  duplicate-consumption cases;
- unsafe quarantine, baseline rollback, pause and cooling behavior;
- CAS retry, retained restart and predecessor-bound handoff;
- adapters for Trust, role, capability-state and context-integrity narrowing;
- opt-in strategy dispatch for planning, offer, bid, award and recovery seams;
- bounded-state, public type, browser traversal, audit and packed-consumer
  checks.
