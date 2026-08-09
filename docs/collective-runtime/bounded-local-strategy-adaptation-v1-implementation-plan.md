# Bounded Local Strategy Adaptation V1 implementation plan

Status: implemented

## Product outcome

Give each local peer or application coordinator an opt-in way to improve which
pre-registered coordination strategy it uses as conditions change, while
preserving all existing safety and authority boundaries.

V1 learns only a strategy identifier. It does not generate policies, mutate
strategy code, accept raw model rewards, exchange weights globally or execute
effects.

## Closed operation set

- `plan_decomposition`;
- `offer_routing`;
- `bid_submission`;
- `award_selection`; and
- `recovery_selection`.

An application can use the same controller at all five seams or configure only
the operations for which its catalog contains strategies.

## Public package shape

The browser-safe entry point
`@agentplat/collective-runtime/strategy-adaptation` contains:

- strict contracts and canonical SHA-256 digest factories;
- immutable catalog and policy validation;
- a pure selection reducer and a pure feedback reducer;
- bounded multiplicative-weights probability calculation;
- a CAS runtime and reference in-memory store;
- deterministic entropy for tests and simulation;
- content-free safety projection adapters; and
- predecessor-bound state export/import.

The package exports no provider SDK and accepts no model prompt or output.

## Catalog and safety boundary

Every strategy binds an ID, version, implementation digest and closed set of
supported operations. The catalog defines exactly one safe baseline for each
configured operation. Strategy records are sorted and covered by one catalog
digest.

A selection request binds complete scope, operation, trusted logical time,
context digest and the exact catalog strategies the caller has installed.
The safety resolver returns source-bound projections for the policy-required
dimensions:

- `trust`;
- `role`;
- `capability_state`;
- `context_integrity`; and
- `authority`.

Only exact `eligible` projections admit an arm. Restricted, ineligible,
unavailable, missing, expired, future-dated, rolled-back or equivocated state
cannot be promoted. If no non-baseline arm survives, the eligible baseline is
used. If the baseline is not eligible, the controller abstains.

## Learning algorithm

V1 uses integer fixed-point bounded multiplicative weights:

1. normalize current eligible arm weights inside a fixed safe range;
2. reserve the policy exploration budget and distribute it evenly;
3. distribute the remaining budget proportionally to arm weight;
4. raise the safe baseline to its configured probability floor by taking
   basis points from the largest non-baseline arms;
5. assign rounding remainder with stable strategy-ID ordering; and
6. select using the construction-bound entropy draw.

All probabilities are integer basis points and total exactly 10,000. The
decision records the full distribution, draw, entropy binding and evidence
digest. A deterministic SHA-256 counter entropy port provides exact replay for
tests; production integrations supply an unpredictable port.

Feedback metrics are closed, integer values from 0 to 1,000,000. The policy
defines directions and weights. Each independent admitted source supplies the
same metric set plus confidence and provenance. The reducer takes the lower
median for each metric, applies direction, derives one weighted score and clips
the selected arm's multiplicative update. Callers never submit the reward.

## Feedback admission and poisoning resistance

A batch must:

- bind one unconsumed decision, request, operation, scope and selected arm;
- arrive inside the policy feedback window;
- contain only policy-admitted implementation-bound sources;
- satisfy minimum independent-source and confidence thresholds;
- use monotonic source revisions and exact digests; and
- contain the complete policy metric set.

Duplicate identical feedback is idempotent. A same-revision digest conflict is
equivocation: the batch cannot update weights and the selected non-baseline arm
is quarantined. Unknown, stale, insufficient or malformed batches fail closed.

## Rollback, recovery and handoff

An admitted `unsafe` outcome immediately penalizes and quarantines a
non-baseline arm. During the cooling interval, selection falls back to the safe
baseline. Unsafe baseline feedback pauses that operation and yields abstention
until a successor policy/catalog or an explicitly valid state handoff replaces
it.

Snapshots retain bounded arm state, pending decisions, consumed outcome heads,
source revision heads, logical-time high water and predecessor state digest.
Export/import binds controller, policy, catalog, entropy implementation, source
state digest, target state key and export time. Import requires an empty target
or returns the already-imported successor.

## Integration plan

The first integration is a construction-bound dispatcher. It evaluates a
selection request, verifies that the selected ID is installed for the exact
operation, invokes only that implementation and returns the decision alongside
the implementation result. The dispatcher exposes explicit methods for plan
decomposition, offer routing, bid submission, award selection and recovery
selection; it does not infer an operation from arbitrary input.

Trust, role, capability-state and context-integrity adapters accept only their
public content-free decisions and map them to an equal or narrower strategy
safety disposition. Authority remains a separate required source.

Existing collective and peer-node behavior remains unchanged unless the
controller/dispatcher is constructed and called by the application.

## Acceptance

V1 is complete when:

- every public record has exact-key validation and a canonical digest;
- probability, replay and update arithmetic is deterministic and bounded;
- adversarial feedback cannot bypass source, causality, confidence, median,
  currentness or one-time-consumption checks;
- quarantine, baseline rollback, pause and handoff work across restart;
- dispatch covers all five operation seams without creating authority;
- retained arrays remain policy bounded;
- package exports, README examples and the public catalog expose the subpath;
- source and docs use industry terminology only; and
- focused build, public type, unit, audit and packed-consumer checks pass.
