# Anytime semantic guarantees V1

`@agentplat/inference-control/semantic-guarantees` turns the bounded semantic
metric stream into a portable confidence sequence and a conservative mission
control signal. It is provider-neutral, browser-safe and stores no model text,
vectors or action payloads.

## Statistical contract

For each metric `m`, policy assigns an absolute error budget `delta_m` in parts
per million. At inference count `n`, the engine uses
`delta_(m,n) = delta_m / (n * (n + 1))` in a two-sided Hoeffding-Azuma bound.
Because `sum(n >= 1) 1/(n*(n+1)) = 1`, a union bound covers every count for
that metric. Requiring the sum of metric budgets to be no greater than the
family-wise budget extends the coverage to every metric and every emitted
count. Calling `current()` repeatedly does not spend more error: the schedule
is indexed by inference count, not query count.

Coverage is for the running average of conditional means. It requires:

- every transformed observation to remain in `[0, 10,000]` basis points;
- the centered sequence to be bounded martingale differences relative to the
  history available before each observation;
- sampling and predictable-skip decisions to be made before the current metric
  value is observed; and
- policy, assumptions and supporting evidence to remain bound to their exact
  digests.

The contract does not assume stationarity. It also does not establish
independence or calibration by itself; deployments must support those
assumptions with the evidence digests carried by policy.

## Missing metrics

Each metric declares one policy before collection starts:

- `fail_closed` records the missing observation, excludes it from inference and
  makes the horizon controller return `safe_stop`. It cannot silently recover
  after a later non-missing sample.
- `worst_case_imputation` inserts `0` for higher-is-better metrics and `10,000`
  for lower-is-better metrics. This is conservative for the declared direction.
- `predictable_skip` records and excludes the observation. Policy construction
  requires at least one assumption-evidence digest. Coverage applies only if
  observability was determined predictably, before the hidden value.

Changing policy requires a new state key. Existing accumulators cannot be
reinterpreted under a new missingness rule, metric direction or error budget.

## Durable state and rollback boundary

`AnytimeSemanticGuaranteeStoreV1` provides load plus revision/state-digest CAS.
`AnytimeSemanticGuaranteeAnchorV1` exposes the monotonic revision, sequence,
logical-time and state-digest head. Production storage must advance both
atomically. The runtime rejects missing state below an anchor, mismatched
heads, reordered samples and a different payload reusing the latest sequence.

The in-memory implementation is for local integration only. It does not make
state durable across process loss. A deployment adapter must also serialize
updates for a state key or provide equivalent transactional CAS behavior.

State retains cumulative integer sums and counts, the last sample digest and a
bounded set of recent assessment digests. It does not retain raw semantic
material. Once an evidence digest is evicted, the external evidence system is
responsible for historical availability.

## Actionable control signal

`createSemanticHorizonControlPolicyV1` binds thresholds to the exact guarantee
policy and assumption digests. `createSemanticHorizonControlV1` then returns:

- `continue` when every enabled threshold is supported by the simultaneous
  interval;
- `shorten_horizon` while evidence is insufficient or an interval still
  crosses a threshold;
- `replan` when the interval proves a threshold violation at the configured
  confidence; or
- `safe_stop` after any fail-closed missing observation.

A `replan` or `safe_stop` decision does not itself cancel work, revoke an
effect permit or authorize a replacement plan. The receiving control plane
must enforce the returned horizon and route replanning through its normal
authority, fencing and idempotency boundaries.

The operational controller and reference assurance effect path consume
`recommendedHorizonSteps` as a non-refilling budget while a
`shorten_horizon` decision remains active. Repeated shortened decisions take
the minimum of the remaining and newly recommended budget. Each actual model
turn, tool dispatch or protected-effect attempt consumes one unit. At zero,
the callback is not invoked and the path returns a replan-required or semantic
rejection outcome. A validated `continue` decision clears the shortened mode;
`replan` and `safe_stop` still reject immediately.

## Deliberate limits

- The guarantee covers the transformed metric stream, not latent world state,
  causal effects, task success or future unseen observations.
- Worst-case imputation is direction-specific and can be very conservative.
- Predictable skipping is unsafe when missingness depends on the hidden value.
- No runtime check can prove the martingale assumption or assessor calibration.
- The V1 bound favors auditability and conservative validity over statistical
  tightness; more efficient confidence sequences can be added under a new,
  explicitly digested method identifier.
- Threshold selection, error-budget selection and assumption evidence must be
  fixed before inspecting the stream used for the guarantee.
