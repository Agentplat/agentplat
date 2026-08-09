# Decentralized strategy convergence and stability V1 threat model

## Protected assets

- local strategy catalog, safety eligibility, baselines and execution authority;
- exact cohort, operation, implementation, membership and policy bindings;
- stability, diversity, cooldown, recovery and influence bounds;
- logical-time, revision, history and handoff continuity;
- bounded memory and decision-computation resources; and
- confidentiality of prompts, model outputs, credentials and raw evidence.

## Trust boundaries

The controller trusts its immutable local policy, the caller's locally eligible
strategy set, the evidence-certificate validator, the connectivity classifier
and the compare-and-swap store. It does not trust an observation to grant
membership, safety, catalog presence, strategy availability or authority.

Evidence certificates are authenticated and aggregated by the separate
strategy evidence exchange. This boundary revalidates their closed projection
and applies additional stability rules; it does not repeat identity signing or
Trust evaluation and must not be used with unvalidated synthetic certificates
in production.

## Threats and controls

| Threat                              | Control                                                                                   | Failure behavior              |
| ----------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------- |
| Remote strategy injection           | Recommendations are restricted to caller-supplied locally eligible exact bindings         | Ignore unlisted binding       |
| Cross-scope replay                  | Exact cohort, scope, operation and binding digests                                        | Exclude observation           |
| Stale or future evidence            | Logical-time high-water, TTL and future-skew bounds                                       | Exclude or reject input       |
| Source-set rotation amplification   | Peer and independence-group intersection across contributing certificates                 | Lose credibility              |
| Duplicate certificate amplification | One projection per certificate digest                                                     | Idempotent or conflict        |
| Membership fork                     | One highest epoch and one configuration for the complete comparison view                  | Fail closed                   |
| Evidence-policy mixing              | One evidence-policy digest per aggregated strategy view                                   | Fail closed                   |
| Temporary herd behavior             | Stable-cycle, minimum-interval and improvement-margin requirements                        | Hold local strategy           |
| Strategy oscillation                | Bounded actual-local-transition history and timed guard                                   | Suppress recommendation       |
| Partition-driven switch             | Explicit partition state produces no recommendation                                       | Local-only behavior           |
| Premature reconnect switch          | Longer recovery stability window                                                          | Hold until sustained          |
| Unnecessary monoculture             | Preserve a current credible strategy inside the diversity margin                          | Keep local diversity          |
| Remote safety override              | Stable output is an advisory prior; local adaptation reapplies safety and baseline bounds | Local veto wins               |
| Influence escalation                | Confidence scaling plus convergence and adaptation maximums                               | Clamp influence               |
| Fast-cycle manipulation             | Minimum logical interval between distinct cycles                                          | Reject cycle                  |
| State exhaustion                    | Policy-bounded scopes, strategies, observations, histories and source IDs                 | Reject oversized input        |
| Concurrent or restart rollback      | CAS revision, predecessor digest and logical-time high-water                              | Retry or reject               |
| Handoff fork                        | Empty-target import and exact predecessor binding                                         | Idempotent import or conflict |

## Safety properties

1. A collective observation cannot add a strategy to the local eligible set.
2. A convergence recommendation cannot execute a strategy or grant planning,
   assignment, recovery, action or effect authority.
3. Partitioned, oscillating, divergent, unsafe and insufficient views emit no
   positive prior.
4. Adoption requires sustained evidence across policy-bounded logical time and
   evaluation cycles.
5. Source rotation and duplicate certificates cannot increase independent
   source coverage.
6. A credible current strategy within the diversity margin is retained.
7. Every recommendation is short-lived, confidence-scaled and capped before
   local adaptation applies its own independent cap.
8. State and handoffs contain no prompt, output, credential, strategy code,
   raw Trust evidence or hidden reasoning.

## Residual risks and non-goals

- A sufficiently large set of independently eligible compromised sources can
  still provide misleading structurally valid evidence.
- A malicious local caller can lie about eligibility or connectivity; those
  are explicit trusted inputs and should be backed by local policy adapters.
- V1 establishes bounded local stability behavior, not optimality, real-time
  global consensus or proof that every peer selects the same strategy.
- Extended partitions can keep peers on different strategies indefinitely;
  safety takes precedence over forced convergence.

## Required verification

- exact contract, digest, policy, state, decision and handoff validation;
- hysteresis, interval, improvement, cooldown and oscillation behavior;
- partition and recovery behavior;
- diversity preservation and divergent-view suppression;
- membership/configuration/policy conflict, duplicate and source-rotation cases;
- advisory prior freshness and influence clamping;
- CAS retry, idempotency, restart and predecessor-bound handoff; and
- public type, browser, audit and packed-consumer checks.
