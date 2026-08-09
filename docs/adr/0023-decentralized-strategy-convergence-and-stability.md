# ADR 0023: Strategy convergence is local, evidence-driven and stability bounded

- Status: accepted
- Date: 2026-08-06

## Context

Peer strategy evidence exchange lets a node derive authenticated, content-free
outcome certificates for compatible strategies. A certificate is useful input,
but reacting immediately to whichever strategy currently has the strongest
score would create oscillation, herd behavior and partition-sensitive changes.
Requiring one global strategy or a central optimizer would also erase useful
local diversity and introduce a shared control and failure domain.

The platform needs a deterministic way for each peer to decide whether a
collective trend is sustained enough to inform local adaptation while keeping
catalog, safety, baseline and execution authority entirely local.

## Decision

Add the opt-in, browser-safe
`@agentplat/collective-runtime/strategy-convergence` entry point.

Each controller consumes locally validated projections of strategy evidence
certificates. Observations bind one cohort, operation, implementation,
membership epoch and configuration, evidence policy, source set, aggregate
outcome, confidence and lifetime. The controller never accepts strategy code,
prompts, model outputs, weights, raw rewards or an execution request.

The pure reducer computes conservative scores only for strategies that the
local caller already admitted through its catalog and safety policy. Source
coverage is intersected across contributing certificates so rotating or
replayed source sets cannot amplify independence. Conflicting membership
configurations or evidence policies at the same epoch fail closed.

A different strategy becomes a recommendation only after a policy-defined
minimum time and number of stable cycles, a minimum improvement margin and any
recovery window. Cooldown and an actual-local-transition history suppress
rapid switching. Partitioned views produce no recommendation. Recovering
views require a longer stability window. When the current strategy remains
within the configured diversity margin of the leader, the controller keeps
the local strategy instead of forcing uniformity.

Stable recommendations are advisory priors. The existing local adaptation
controller independently reapplies confidence, maximum influence, baseline
probability and every safety veto. Missing, divergent, oscillating,
partitioned, unsafe or insufficient evidence contributes no prior.

State uses bounded arrays and compare-and-swap revision checks. Handoff binds
the exact policy, implementation, source state digest, target state key and
logical-time high-water mark.

## Consequences

- Peers may reach compatible stable behavior without a leader or global state
  service, but they are not required to select one identical strategy.
- A sustained improvement can inform local adaptation while a temporary
  majority, network partition or score tie cannot cause immediate churn.
- Availability is intentionally reduced during uncertainty; local baselines
  and local-only adaptation continue to operate.
- Deployments must provide a durable atomic store and trustworthy connectivity
  classification. The in-memory store is for composition and simulation.
- Existing applications are unchanged until they explicitly construct the
  controller and install its prior adapter.

## Alternatives considered

### Select the highest certificate score immediately

Rejected because delayed, reordered or transient evidence would cause
oscillation and make local behavior sensitive to scheduling.

### Require every peer to select the same strategy

Rejected because local conditions differ and uniformity increases correlated
failure risk. V1 preserves a policy-defined near-optimal diversity band.

### Elect a central strategy optimizer

Rejected because it creates a new authority path, shared failure domain and
partition dependency that are unnecessary for advisory convergence.
