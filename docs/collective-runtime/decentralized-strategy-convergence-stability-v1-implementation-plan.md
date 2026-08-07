# Decentralized Strategy Convergence and Stability V1 implementation plan

Status: implemented

## Product outcome

Let each peer turn compatible collective outcome evidence into a stable,
bounded and locally sovereign adaptation recommendation. Peers can improve in
the same general direction without a leader, global optimizer or requirement
that every node use one identical strategy.

## Public package shape

`@agentplat/collective-runtime/strategy-convergence` contains:

- strict scope, observation, policy, cycle, score, recommendation, state,
  decision and handoff contracts;
- canonical factories and exact validators;
- a pure deterministic stability reducer;
- a compare-and-swap runtime and in-memory reference store;
- an evidence-certificate projection and cycle builder;
- a request-bound local strategy prior adapter; and
- predecessor-bound export and import.

The package contains no provider SDK, model invocation, network client,
strategy implementation or effect executor.

## Stability algorithm

For every content-free scope and operation, the reducer:

1. accepts only unexpired, non-future observations with exact scope and local
   eligible-strategy bindings;
2. deduplicates certificate projections and rejects conflicting projections;
3. selects one highest membership epoch for the complete comparison and rejects
   configuration or evidence-policy conflicts within that epoch;
4. intersects contributing source identities and independence groups to
   prevent coverage amplification across rotating certificates;
5. scores outcomes conservatively, treating failure, unsafe and indeterminate
   evidence as zero positive support;
6. preserves the current credible strategy when it is within the configured
   diversity margin of the leader;
7. otherwise requires a minimum improvement, logical interval and consecutive
   stable cycles before recommending adoption; and
8. suppresses recommendations during partition, unresolved divergence,
   oscillation guards, insufficient evidence and incomplete recovery windows.

## Local adaptation integration

Only a fresh stable recommendation becomes a `LocalStrategyCollectivePriorV1`.
The adapter requires an exact request operation and installed strategy digest,
scales influence by confidence, applies its own maximum and emits no prior if
the local catalog does not contain the recommendation.

The local adaptation controller remains authoritative. Its Trust, role,
capability-state, context-integrity and authority signals can remove the
strategy, and its baseline floor and influence cap are reapplied after the
convergence adapter.

## Partition, recovery and diversity

A partitioned view never recommends a switch. A recovering view uses a longer
stable-cycle threshold. Actual local strategy changes are retained in bounded
history; excessive changes inside the oscillation window activate a timed
guard. A near-optimal current strategy is intentionally retained to reduce
correlated behavior and preserve useful local diversity.

## Persistence and bounds

State is revision checked and policy bound by scopes, strategies,
observations, source IDs, history entries, reason codes and commit attempts.
Each state binds its predecessor digest and logical-time high-water mark.
Handoff imports only into an empty target or an idempotently matching
successor and cannot roll logical time backward.

## Acceptance

V1 is complete when:

- only locally eligible exact strategy bindings may be recommended;
- sustained evidence, time and improvement margins gate adoption;
- partitions, recovery, divergence, unsafe evidence and oscillation fail safe;
- source rotation, duplicate certificates and membership/policy conflicts
  cannot amplify confidence;
- diversity preservation prevents unnecessary uniformity;
- advisory priors remain fresh, confidence-scaled and doubly bounded;
- CAS, idempotency and handoff preserve continuity;
- all collections and retries are policy bounded; and
- public build, types, unit, audit and packed-consumer verification pass.
