import type { JsonValue } from "@agentplat/core";
import { digestControlJsonV1 } from "./canonical.js";
import type { SemanticMetricSampleV1 } from "./semantic-metric-engine.js";
import type { SemanticMetricVectorV1 } from "./semantic-alignment-contracts.js";

export const ANYTIME_SEMANTIC_GUARANTEE_STATE_FORMAT_V1 =
  "agentplat.inference-control.anytime-semantic-guarantee-state.v1" as const;

export const SEMANTIC_GUARANTEE_METRICS_V1 = Object.freeze([
  "roleCoherence",
  "missionAlignment",
  "contextConflict",
  "uncertainty",
  "courseActionDiversity",
  "courseActionNovelty",
] as const);

export type SemanticGuaranteeMetricV1 =
  (typeof SEMANTIC_GUARANTEE_METRICS_V1)[number];
export type SemanticGuaranteeDirectionV1 =
  "higher_is_better" | "lower_is_better";
export type SemanticGuaranteeMissingnessV1 =
  "fail_closed" | "predictable_skip" | "worst_case_imputation";

export interface AnytimeSemanticAssumptionsV1 {
  readonly schemaVersion: 1;
  /** The guarantee targets the average conditional mean, not a stationary population mean. */
  readonly estimand: "average_conditional_mean";
  /** Supports adaptive histories when the centered observations form bounded martingale differences. */
  readonly dependenceModel: "bounded_martingale_differences";
  readonly observationRange: "basis_points_0_10000";
  /** Sampling and skip decisions must be fixed before the current metric value is observed. */
  readonly selectionTiming: "before_metric_observation";
  readonly assumptionEvidenceDigests: readonly string[];
  readonly assumptionsDigest: string;
}

export interface SemanticMetricGuaranteePolicyV1 {
  readonly direction: SemanticGuaranteeDirectionV1;
  /** Absolute family-wise error allocation for this metric, in parts per million. */
  readonly errorBudgetPpm: number;
  readonly missingness: SemanticGuaranteeMissingnessV1;
}

export interface AnytimeSemanticGuaranteePolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  /** Upper bound on the sum of all metric error budgets. */
  readonly familywiseErrorBudgetPpm: number;
  readonly boundMethod: "hoeffding_azuma_two_sided";
  readonly spendingSchedule: "inverse_quadratic_telescoping";
  readonly minimumInferenceSamples: number;
  readonly maximumRetainedEvidenceDigests: number;
  readonly maximumCasAttempts: number;
  readonly metrics: Readonly<
    Record<SemanticGuaranteeMetricV1, SemanticMetricGuaranteePolicyV1>
  >;
  readonly assumptions: AnytimeSemanticAssumptionsV1;
  readonly policyDigest: string;
}

export interface AnytimeSemanticAssumptionsInputV1 {
  readonly assumptionEvidenceDigests: readonly string[];
}

export interface AnytimeSemanticGuaranteePolicyInputV1 {
  readonly policyId: string;
  readonly familywiseErrorBudgetPpm: number;
  readonly minimumInferenceSamples: number;
  readonly maximumRetainedEvidenceDigests?: number;
  readonly maximumCasAttempts?: number;
  readonly metrics: Readonly<
    Record<SemanticGuaranteeMetricV1, SemanticMetricGuaranteePolicyV1>
  >;
  readonly assumptions: AnytimeSemanticAssumptionsInputV1;
}

export interface SemanticMetricAccumulatorV1 {
  readonly reportedCount: number;
  readonly missingCount: number;
  /** Count after the declared missingness transformation. */
  readonly inferenceCount: number;
  readonly sumBasisPoints: number;
  readonly latestWasMissing: boolean;
}

export interface AnytimeSemanticGuaranteeStateV1 {
  readonly format: typeof ANYTIME_SEMANTIC_GUARANTEE_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: string;
  readonly policyDigest: string;
  readonly assumptionsDigest: string;
  readonly revision: number;
  readonly sampleCount: number;
  readonly sequenceHighWater: number;
  readonly logicalTimeHighWaterMs: number;
  readonly lastSampleDigest: string;
  readonly metrics: Readonly<
    Record<SemanticGuaranteeMetricV1, SemanticMetricAccumulatorV1>
  >;
  readonly recentEvidenceDigests: readonly string[];
  readonly predecessorStateDigest: string | null;
  readonly stateDigest: string;
}

export interface AnytimeSemanticGuaranteeStoreV1 {
  load(stateKey: string): Promise<AnytimeSemanticGuaranteeStateV1 | null>;
  /** Production implementations must atomically advance the rollback anchor. */
  compareAndSet(input: {
    readonly stateKey: string;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: string | null;
    readonly next: AnytimeSemanticGuaranteeStateV1;
  }): Promise<boolean>;
}

export interface AnytimeSemanticGuaranteeAnchorV1 {
  readAnchor(stateKey: string): Promise<{
    readonly revision: number;
    readonly sequenceHighWater: number;
    readonly logicalTimeHighWaterMs: number;
    readonly stateDigest: string;
  } | null>;
}

export interface AnytimeSemanticMetricBoundV1 {
  readonly reportedCount: number;
  readonly missingCount: number;
  readonly inferenceCount: number;
  /** Integer sufficient statistic used to verify every emitted bound. */
  readonly sumBasisPoints: number;
  readonly meanBasisPoints: number | null;
  readonly lowerBasisPoints: number | null;
  readonly upperBasisPoints: number | null;
  readonly errorBudgetPpm: number;
  /** Error allocated to the current inference count by the spending schedule. */
  readonly currentLookErrorBudgetPpm: number | null;
  readonly missingness: SemanticGuaranteeMissingnessV1;
  readonly latestWasMissing: boolean;
}

export interface AnytimeSemanticGuaranteeV1 {
  readonly schemaVersion: 1;
  readonly stateKey: string;
  readonly policyDigest: string;
  readonly assumptionsDigest: string;
  readonly stateDigest: string;
  readonly throughSequence: number;
  readonly throughLogicalTimeMs: number;
  readonly familywiseErrorBudgetPpm: number;
  readonly simultaneousConfidenceBasisPoints: number;
  readonly minimumInferenceSamples: number;
  readonly estimand: "average_conditional_mean";
  readonly roleCoherence: AnytimeSemanticMetricBoundV1;
  readonly missionAlignment: AnytimeSemanticMetricBoundV1;
  readonly contextConflict: AnytimeSemanticMetricBoundV1;
  readonly uncertainty: AnytimeSemanticMetricBoundV1;
  readonly courseActionDiversity: AnytimeSemanticMetricBoundV1;
  readonly courseActionNovelty: AnytimeSemanticMetricBoundV1;
  readonly evidenceDigests: readonly string[];
}

export type SemanticHorizonDirectiveV1 =
  "continue" | "shorten_horizon" | "replan" | "safe_stop";

export interface SemanticHorizonThresholdV1 {
  readonly thresholdBasisPoints: number;
  readonly enabled: boolean;
}

export interface SemanticHorizonControlPolicyV1 {
  readonly schemaVersion: 1;
  readonly expectedGuaranteePolicyDigest: string;
  readonly expectedAssumptionsDigest: string;
  readonly nominalHorizonSteps: number;
  readonly cautionHorizonSteps: number;
  readonly replanHorizonSteps: number;
  readonly thresholds: Readonly<
    Record<SemanticGuaranteeMetricV1, SemanticHorizonThresholdV1>
  >;
  readonly controlPolicyDigest: string;
}

export type SemanticHorizonControlPolicyInputV1 = Omit<
  SemanticHorizonControlPolicyV1,
  "schemaVersion" | "controlPolicyDigest"
>;

export interface SemanticHorizonDecisionV1 {
  readonly schemaVersion: 1;
  readonly directive: SemanticHorizonDirectiveV1;
  readonly recommendedHorizonSteps: number;
  readonly replanRequired: boolean;
  readonly reasonCodes: readonly string[];
  readonly guaranteeStateDigest: string;
  readonly policyDigest: string;
  readonly assumptionsDigest: string;
  readonly controlPolicyDigest: string;
}

export interface SemanticHorizonControlPortV1 {
  decide(guarantee: AnytimeSemanticGuaranteeV1): SemanticHorizonDecisionV1;
}

type AnytimeSemanticGuaranteeAppendInputV1 = {
  readonly stateKey: string;
  readonly sample: SemanticMetricSampleV1;
};

const anytimeSemanticGuaranteeEngineInvokersV1 = new WeakMap<
  object,
  {
    readonly append: (
      input: AnytimeSemanticGuaranteeAppendInputV1,
    ) => Promise<AnytimeSemanticGuaranteeV1>;
    readonly current: (stateKey: string) => Promise<AnytimeSemanticGuaranteeV1>;
  }
>();

const semanticHorizonControlInvokersV1 = new WeakMap<
  object,
  (guarantee: AnytimeSemanticGuaranteeV1) => SemanticHorizonDecisionV1
>();

const EXPECTED_DIRECTIONS: Readonly<
  Record<SemanticGuaranteeMetricV1, SemanticGuaranteeDirectionV1>
> = Object.freeze({
  roleCoherence: "higher_is_better",
  missionAlignment: "higher_is_better",
  contextConflict: "lower_is_better",
  uncertainty: "lower_is_better",
  courseActionDiversity: "higher_is_better",
  courseActionNovelty: "higher_is_better",
});

const VECTOR_KEYS: Readonly<
  Record<SemanticGuaranteeMetricV1, keyof SemanticMetricVectorV1>
> = Object.freeze({
  roleCoherence: "roleCoherenceBps",
  missionAlignment: "missionAlignmentBps",
  contextConflict: "contextConflictBps",
  uncertainty: "uncertaintyBps",
  courseActionDiversity: "courseActionDiversityBps",
  courseActionNovelty: "courseActionNoveltyBps",
});

export function createAnytimeSemanticAssumptionsV1(
  input: AnytimeSemanticAssumptionsInputV1,
): AnytimeSemanticAssumptionsV1 {
  const evidence = uniqueDigests(
    input.assumptionEvidenceDigests,
    "assumptionEvidenceDigests",
  );
  const body = {
    schemaVersion: 1 as const,
    estimand: "average_conditional_mean" as const,
    dependenceModel: "bounded_martingale_differences" as const,
    observationRange: "basis_points_0_10000" as const,
    selectionTiming: "before_metric_observation" as const,
    assumptionEvidenceDigests: evidence,
  };
  return deepFreeze({
    ...body,
    assumptionsDigest: digestSemanticGuarantee("assumptions", body),
  });
}

export function createAnytimeSemanticGuaranteePolicyV1(
  input: AnytimeSemanticGuaranteePolicyInputV1,
): AnytimeSemanticGuaranteePolicyV1 {
  const policyId = input.policyId;
  const familywiseErrorBudgetPpm = input.familywiseErrorBudgetPpm;
  const minimumInferenceSamples = input.minimumInferenceSamples;
  const metricInputs = input.metrics;
  const assumptionInputs = input.assumptions;
  identifier(policyId, "policyId");
  integer(familywiseErrorBudgetPpm, "familywiseErrorBudgetPpm", 1, 499_999);
  integer(minimumInferenceSamples, "minimumInferenceSamples", 1, 1_000_000_000);
  const maximumRetainedEvidenceDigests =
    input.maximumRetainedEvidenceDigests ?? 128;
  const maximumCasAttempts = input.maximumCasAttempts ?? 8;
  integer(
    maximumRetainedEvidenceDigests,
    "maximumRetainedEvidenceDigests",
    1,
    10_000,
  );
  integer(maximumCasAttempts, "maximumCasAttempts", 1, 1_000);
  let allocated = 0;
  const metrics = {} as Record<
    SemanticGuaranteeMetricV1,
    SemanticMetricGuaranteePolicyV1
  >;
  for (const metric of SEMANTIC_GUARANTEE_METRICS_V1) {
    const candidate = metricInputs[metric];
    if (!candidate)
      throw new TypeError(`semantic_guarantee_${metric}_direction_invalid`);
    const direction = candidate.direction;
    const errorBudgetPpm = candidate.errorBudgetPpm;
    const missingness = candidate.missingness;
    if (direction !== EXPECTED_DIRECTIONS[metric])
      throw new TypeError(`semantic_guarantee_${metric}_direction_invalid`);
    integer(errorBudgetPpm, `${metric}.errorBudgetPpm`, 1, 499_999);
    if (
      !["fail_closed", "predictable_skip", "worst_case_imputation"].includes(
        missingness,
      )
    )
      throw new TypeError(`semantic_guarantee_${metric}_missingness_invalid`);
    allocated += errorBudgetPpm;
    metrics[metric] = Object.freeze({
      direction,
      errorBudgetPpm,
      missingness,
    });
  }
  if (allocated > familywiseErrorBudgetPpm)
    throw new RangeError(
      "semantic_guarantee_metric_error_budget_exceeds_familywise_budget",
    );
  const assumptions = createAnytimeSemanticAssumptionsV1(assumptionInputs);
  if (
    Object.values(metrics).some(
      (metric) => metric.missingness === "predictable_skip",
    ) &&
    assumptions.assumptionEvidenceDigests.length === 0
  )
    throw new TypeError(
      "semantic_guarantee_predictable_skip_requires_assumption_evidence",
    );
  const body = {
    schemaVersion: 1 as const,
    policyId,
    familywiseErrorBudgetPpm,
    boundMethod: "hoeffding_azuma_two_sided" as const,
    spendingSchedule: "inverse_quadratic_telescoping" as const,
    minimumInferenceSamples,
    maximumRetainedEvidenceDigests,
    maximumCasAttempts,
    metrics,
    assumptions,
  };
  return deepFreeze({
    ...body,
    policyDigest: digestSemanticGuarantee("policy", body),
  });
}

export class InMemoryAnytimeSemanticGuaranteeStoreV1
  implements AnytimeSemanticGuaranteeStoreV1, AnytimeSemanticGuaranteeAnchorV1
{
  readonly #states = new Map<string, AnytimeSemanticGuaranteeStateV1>();
  readonly #anchors = new Map<
    string,
    {
      revision: number;
      sequenceHighWater: number;
      logicalTimeHighWaterMs: number;
      stateDigest: string;
    }
  >();

  async load(
    stateKey: string,
  ): Promise<AnytimeSemanticGuaranteeStateV1 | null> {
    return this.#states.get(stateKey) ?? null;
  }

  async readAnchor(stateKey: string) {
    return this.#anchors.get(stateKey) ?? null;
  }

  async compareAndSet(input: {
    readonly stateKey: string;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: string | null;
    readonly next: AnytimeSemanticGuaranteeStateV1;
  }): Promise<boolean> {
    const prior = this.#states.get(input.stateKey) ?? null;
    if (
      (prior?.revision ?? null) !== input.expectedRevision ||
      (prior?.stateDigest ?? null) !== input.expectedStateDigest
    )
      return false;
    this.#states.set(input.stateKey, deepFreeze(input.next));
    this.#anchors.set(
      input.stateKey,
      deepFreeze({
        revision: input.next.revision,
        sequenceHighWater: input.next.sequenceHighWater,
        logicalTimeHighWaterMs: input.next.logicalTimeHighWaterMs,
        stateDigest: input.next.stateDigest,
      }),
    );
    return true;
  }
}

export interface AnytimeSemanticGuaranteeEngineOptionsV1 {
  readonly policy: AnytimeSemanticGuaranteePolicyV1;
  readonly store?: AnytimeSemanticGuaranteeStoreV1;
  readonly monotonicAnchor?: AnytimeSemanticGuaranteeAnchorV1;
}

/**
 * Portable confidence-sequence engine. It uses a fixed-time Hoeffding-Azuma
 * bound at each inference count and an inverse-quadratic alpha-spending union
 * bound, making all emitted intervals simultaneous across metrics and time.
 */
export class AnytimeSemanticGuaranteeEngineV1 {
  readonly policy: AnytimeSemanticGuaranteePolicyV1;
  readonly store: AnytimeSemanticGuaranteeStoreV1;
  readonly anchor: AnytimeSemanticGuaranteeAnchorV1;
  readonly #load: AnytimeSemanticGuaranteeStoreV1["load"];
  readonly #compareAndSet: AnytimeSemanticGuaranteeStoreV1["compareAndSet"];
  readonly #readAnchor: AnytimeSemanticGuaranteeAnchorV1["readAnchor"];

  constructor(options: AnytimeSemanticGuaranteeEngineOptionsV1) {
    const policy = validatePolicy(options.policy);
    const store =
      options.store ?? new InMemoryAnytimeSemanticGuaranteeStoreV1();
    const anchor =
      options.monotonicAnchor ??
      (store as unknown as AnytimeSemanticGuaranteeAnchorV1);
    if (
      typeof store.load !== "function" ||
      typeof store.compareAndSet !== "function" ||
      typeof anchor.readAnchor !== "function"
    )
      throw new TypeError(
        "semantic_guarantee_external_monotonic_anchor_required",
      );
    this.policy = policy;
    this.store = store;
    this.anchor = anchor;
    this.#load = store.load.bind(store);
    this.#compareAndSet = store.compareAndSet.bind(store);
    this.#readAnchor = anchor.readAnchor.bind(anchor);
    Object.defineProperties(this, {
      policy: immutableSemanticGuaranteeValue(policy),
      store: immutableSemanticGuaranteeValue(store),
      anchor: immutableSemanticGuaranteeValue(anchor),
    });
    anytimeSemanticGuaranteeEngineInvokersV1.set(
      this,
      Object.freeze({
        append: (input: AnytimeSemanticGuaranteeAppendInputV1) =>
          this.#append(input),
        current: (stateKey: string) => this.#current(stateKey),
      }),
    );
  }

  async append(
    input: AnytimeSemanticGuaranteeAppendInputV1,
  ): Promise<AnytimeSemanticGuaranteeV1> {
    return invokeAnytimeSemanticGuaranteeAppendV1(this, input);
  }

  async #append(
    input: AnytimeSemanticGuaranteeAppendInputV1,
  ): Promise<AnytimeSemanticGuaranteeV1> {
    identifier(input.stateKey, "stateKey");
    validateSample(input.sample);
    const sampleDigest = digestSemanticGuarantee("sample", input.sample);
    for (
      let attempt = 0;
      attempt < this.policy.maximumCasAttempts;
      attempt += 1
    ) {
      const prior = await this.#load(input.stateKey);
      await this.#assertStateAndAnchor(input.stateKey, prior);
      if (prior && input.sample.sequence === prior.sequenceHighWater) {
        if (sampleDigest !== prior.lastSampleDigest)
          throw new TypeError("semantic_guarantee_sample_equivocation");
        return this.#guaranteeFrom(prior);
      }
      if (
        prior &&
        (input.sample.sequence < prior.sequenceHighWater ||
          input.sample.logicalTimeMs < prior.logicalTimeHighWaterMs)
      )
        throw new TypeError("semantic_guarantee_sample_order_invalid");
      const next = this.#advance(
        input.stateKey,
        prior,
        input.sample,
        sampleDigest,
      );
      if (
        await this.#compareAndSet({
          stateKey: input.stateKey,
          expectedRevision: prior?.revision ?? null,
          expectedStateDigest: prior?.stateDigest ?? null,
          next,
        })
      ) {
        const committed = await this.#load(input.stateKey);
        if (!committed || committed.stateDigest !== next.stateDigest)
          throw new TypeError("semantic_guarantee_commit_not_observable");
        await this.#assertStateAndAnchor(input.stateKey, committed);
        return this.#guaranteeFrom(committed);
      }
    }
    throw new Error("semantic_guarantee_cas_retry_exhausted");
  }

  async current(stateKey: string): Promise<AnytimeSemanticGuaranteeV1> {
    return invokeAnytimeSemanticGuaranteeCurrentV1(this, stateKey);
  }

  async #current(stateKey: string): Promise<AnytimeSemanticGuaranteeV1> {
    identifier(stateKey, "stateKey");
    const state = await this.#load(stateKey);
    if (!state) {
      if (await this.#readAnchor(stateKey))
        throw new TypeError("semantic_guarantee_state_missing_below_anchor");
      throw new TypeError("semantic_guarantee_has_no_samples");
    }
    await this.#assertStateAndAnchor(stateKey, state);
    return this.#guaranteeFrom(state);
  }

  #advance(
    stateKey: string,
    prior: AnytimeSemanticGuaranteeStateV1 | null,
    sample: SemanticMetricSampleV1,
    sampleDigest: string,
  ): AnytimeSemanticGuaranteeStateV1 {
    const metrics = {} as Record<
      SemanticGuaranteeMetricV1,
      SemanticMetricAccumulatorV1
    >;
    for (const metric of SEMANTIC_GUARANTEE_METRICS_V1) {
      const existing = prior?.metrics[metric] ?? emptyAccumulator();
      metrics[metric] = advanceAccumulator(
        existing,
        sample.metrics[VECTOR_KEYS[metric]],
        this.policy.metrics[metric],
      );
    }
    const revision = (prior?.revision ?? 0) + 1;
    const body = {
      format: ANYTIME_SEMANTIC_GUARANTEE_STATE_FORMAT_V1,
      schemaVersion: 1 as const,
      stateKey,
      policyDigest: this.policy.policyDigest,
      assumptionsDigest: this.policy.assumptions.assumptionsDigest,
      revision,
      sampleCount: (prior?.sampleCount ?? 0) + 1,
      sequenceHighWater: sample.sequence,
      logicalTimeHighWaterMs: sample.logicalTimeMs,
      lastSampleDigest: sampleDigest,
      metrics,
      recentEvidenceDigests: appendRecentUnique(
        prior?.recentEvidenceDigests ?? [],
        sample.assessmentDigest,
        this.policy.maximumRetainedEvidenceDigests,
      ),
      predecessorStateDigest: prior?.stateDigest ?? null,
    };
    return deepFreeze({
      ...body,
      stateDigest: digestSemanticGuarantee("state", body),
    });
  }

  #guaranteeFrom(
    state: AnytimeSemanticGuaranteeStateV1,
  ): AnytimeSemanticGuaranteeV1 {
    const metric = (key: SemanticGuaranteeMetricV1) =>
      boundFor(state.metrics[key], this.policy.metrics[key]);
    return deepFreeze({
      schemaVersion: 1,
      stateKey: state.stateKey,
      policyDigest: state.policyDigest,
      assumptionsDigest: state.assumptionsDigest,
      stateDigest: state.stateDigest,
      throughSequence: state.sequenceHighWater,
      throughLogicalTimeMs: state.logicalTimeHighWaterMs,
      familywiseErrorBudgetPpm: this.policy.familywiseErrorBudgetPpm,
      simultaneousConfidenceBasisPoints: Math.floor(
        (1 - this.policy.familywiseErrorBudgetPpm / 1_000_000) * 10_000,
      ),
      minimumInferenceSamples: this.policy.minimumInferenceSamples,
      estimand: "average_conditional_mean",
      roleCoherence: metric("roleCoherence"),
      missionAlignment: metric("missionAlignment"),
      contextConflict: metric("contextConflict"),
      uncertainty: metric("uncertainty"),
      courseActionDiversity: metric("courseActionDiversity"),
      courseActionNovelty: metric("courseActionNovelty"),
      evidenceDigests: state.recentEvidenceDigests,
    });
  }

  async #assertStateAndAnchor(
    stateKey: string,
    state: AnytimeSemanticGuaranteeStateV1 | null,
  ): Promise<void> {
    const anchor = await this.#readAnchor(stateKey);
    if (!state) {
      if (anchor)
        throw new TypeError("semantic_guarantee_state_missing_below_anchor");
      return;
    }
    validateState(state, stateKey, this.policy);
    if (
      !anchor ||
      anchor.revision !== state.revision ||
      anchor.sequenceHighWater !== state.sequenceHighWater ||
      anchor.logicalTimeHighWaterMs !== state.logicalTimeHighWaterMs ||
      anchor.stateDigest !== state.stateDigest
    )
      throw new TypeError("semantic_guarantee_state_anchor_mismatch");
  }
}

/** Nominal check for the concrete time-uniform guarantee engine. */
export function isAnytimeSemanticGuaranteeEngineV1(
  value: unknown,
): value is AnytimeSemanticGuaranteeEngineV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    anytimeSemanticGuaranteeEngineInvokersV1.has(value)
  );
}

/** Appends through the construction-time engine closure. */
export function invokeAnytimeSemanticGuaranteeAppendV1(
  engine: AnytimeSemanticGuaranteeEngineV1,
  input: AnytimeSemanticGuaranteeAppendInputV1,
): Promise<AnytimeSemanticGuaranteeV1> {
  const invoke =
    typeof engine === "object" && engine !== null
      ? anytimeSemanticGuaranteeEngineInvokersV1.get(engine)?.append
      : undefined;
  if (!invoke)
    throw new TypeError("concrete_anytime_semantic_guarantee_engine_required");
  return invoke(input);
}

/** Reads through the construction-time engine closure. */
export function invokeAnytimeSemanticGuaranteeCurrentV1(
  engine: AnytimeSemanticGuaranteeEngineV1,
  stateKey: string,
): Promise<AnytimeSemanticGuaranteeV1> {
  const invoke =
    typeof engine === "object" && engine !== null
      ? anytimeSemanticGuaranteeEngineInvokersV1.get(engine)?.current
      : undefined;
  if (!invoke)
    throw new TypeError("concrete_anytime_semantic_guarantee_engine_required");
  return invoke(stateKey);
}

/** Exhaustively validates a portable guarantee before it can authorize control. */
export function validateAnytimeSemanticGuaranteeV1(
  input: AnytimeSemanticGuaranteeV1,
): AnytimeSemanticGuaranteeV1 {
  exactKeys(
    input,
    [
      "assumptionsDigest",
      "contextConflict",
      "courseActionDiversity",
      "courseActionNovelty",
      "estimand",
      "evidenceDigests",
      "familywiseErrorBudgetPpm",
      "minimumInferenceSamples",
      "missionAlignment",
      "policyDigest",
      "roleCoherence",
      "schemaVersion",
      "simultaneousConfidenceBasisPoints",
      "stateDigest",
      "stateKey",
      "throughLogicalTimeMs",
      "throughSequence",
      "uncertainty",
    ],
    "semantic guarantee",
  );
  if (input.schemaVersion !== 1)
    throw new TypeError("semantic_guarantee_schema_invalid");
  identifier(input.stateKey, "guarantee.stateKey");
  digest(input.policyDigest, "guarantee.policyDigest");
  digest(input.assumptionsDigest, "guarantee.assumptionsDigest");
  digest(input.stateDigest, "guarantee.stateDigest");
  integer(
    input.throughSequence,
    "guarantee.throughSequence",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    input.throughLogicalTimeMs,
    "guarantee.throughLogicalTimeMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    input.familywiseErrorBudgetPpm,
    "guarantee.familywiseErrorBudgetPpm",
    1,
    499_999,
  );
  const confidence = Math.floor(
    (1 - input.familywiseErrorBudgetPpm / 1_000_000) * 10_000,
  );
  if (input.simultaneousConfidenceBasisPoints !== confidence)
    throw new TypeError("semantic_guarantee_confidence_invalid");
  integer(
    input.minimumInferenceSamples,
    "guarantee.minimumInferenceSamples",
    1,
    1_000_000_000,
  );
  if (input.estimand !== "average_conditional_mean")
    throw new TypeError("semantic_guarantee_estimand_invalid");
  uniqueDigests(input.evidenceDigests, "guarantee.evidenceDigests", false);
  let sampleCount: number | null = null;
  let allocatedErrorPpm = 0;
  for (const metric of SEMANTIC_GUARANTEE_METRICS_V1) {
    const bound = input[metric];
    exactKeys(
      bound,
      [
        "currentLookErrorBudgetPpm",
        "errorBudgetPpm",
        "inferenceCount",
        "latestWasMissing",
        "lowerBasisPoints",
        "meanBasisPoints",
        "missingCount",
        "missingness",
        "reportedCount",
        "sumBasisPoints",
        "upperBasisPoints",
      ],
      `semantic guarantee ${metric}`,
    );
    integer(
      bound.reportedCount,
      `${metric}.reportedCount`,
      0,
      Number.MAX_SAFE_INTEGER,
    );
    integer(
      bound.missingCount,
      `${metric}.missingCount`,
      0,
      Number.MAX_SAFE_INTEGER,
    );
    const total = bound.reportedCount + bound.missingCount;
    if (!Number.isSafeInteger(total))
      throw new TypeError(`semantic_guarantee_${metric}_count_invalid`);
    if (sampleCount === null) sampleCount = total;
    else if (sampleCount !== total)
      throw new TypeError("semantic_guarantee_metric_sample_counts_differ");
    integer(bound.inferenceCount, `${metric}.inferenceCount`, 0, total);
    if (
      !["fail_closed", "predictable_skip", "worst_case_imputation"].includes(
        bound.missingness,
      ) ||
      typeof bound.latestWasMissing !== "boolean"
    )
      throw new TypeError(`semantic_guarantee_${metric}_missingness_invalid`);
    const expectedInferenceCount =
      bound.missingness === "worst_case_imputation"
        ? total
        : bound.reportedCount;
    if (bound.inferenceCount !== expectedInferenceCount)
      throw new TypeError(
        `semantic_guarantee_${metric}_inference_count_invalid`,
      );
    integer(
      bound.sumBasisPoints,
      `${metric}.sumBasisPoints`,
      0,
      bound.inferenceCount * 10_000,
    );
    integer(bound.errorBudgetPpm, `${metric}.errorBudgetPpm`, 1, 499_999);
    allocatedErrorPpm += bound.errorBudgetPpm;
    validateMetricBound(bound, metric);
  }
  if (allocatedErrorPpm > input.familywiseErrorBudgetPpm)
    throw new TypeError("semantic_guarantee_error_budget_invalid");
  return deepFreeze(input);
}

/** Exhaustively validates a horizon decision and its exact guarantee binding. */
export function validateSemanticHorizonDecisionV1(
  input: SemanticHorizonDecisionV1,
  guarantee: AnytimeSemanticGuaranteeV1,
): SemanticHorizonDecisionV1 {
  validateAnytimeSemanticGuaranteeV1(guarantee);
  exactKeys(
    input,
    [
      "assumptionsDigest",
      "controlPolicyDigest",
      "directive",
      "guaranteeStateDigest",
      "policyDigest",
      "reasonCodes",
      "recommendedHorizonSteps",
      "replanRequired",
      "schemaVersion",
    ],
    "semantic horizon decision",
  );
  if (
    input.schemaVersion !== 1 ||
    !["continue", "shorten_horizon", "replan", "safe_stop"].includes(
      input.directive,
    )
  )
    throw new TypeError("semantic_horizon_decision_directive_invalid");
  integer(
    input.recommendedHorizonSteps,
    "semanticHorizon.recommendedHorizonSteps",
    0,
    1_000_000_000,
  );
  if (
    (input.directive === "safe_stop" && input.recommendedHorizonSteps !== 0) ||
    ((input.directive === "continue" ||
      input.directive === "shorten_horizon") &&
      input.recommendedHorizonSteps === 0)
  )
    throw new TypeError("semantic_horizon_decision_horizon_invalid");
  const replanRequired =
    input.directive === "replan" || input.directive === "safe_stop";
  if (input.replanRequired !== replanRequired)
    throw new TypeError("semantic_horizon_decision_replan_invalid");
  digest(input.guaranteeStateDigest, "decision.guaranteeStateDigest");
  digest(input.policyDigest, "decision.policyDigest");
  digest(input.assumptionsDigest, "decision.assumptionsDigest");
  digest(input.controlPolicyDigest, "decision.controlPolicyDigest");
  if (
    input.guaranteeStateDigest !== guarantee.stateDigest ||
    input.policyDigest !== guarantee.policyDigest ||
    input.assumptionsDigest !== guarantee.assumptionsDigest
  )
    throw new TypeError("semantic_horizon_decision_binding_invalid");
  uniqueTokens(input.reasonCodes, "decision.reasonCodes");
  return deepFreeze(input);
}

export function createSemanticHorizonControlPolicyV1(
  input: SemanticHorizonControlPolicyInputV1,
): SemanticHorizonControlPolicyV1 {
  const expectedGuaranteePolicyDigest = input.expectedGuaranteePolicyDigest;
  const expectedAssumptionsDigest = input.expectedAssumptionsDigest;
  const nominalHorizonSteps = input.nominalHorizonSteps;
  const cautionHorizonSteps = input.cautionHorizonSteps;
  const replanHorizonSteps = input.replanHorizonSteps;
  const thresholdInputs = input.thresholds;
  digest(expectedGuaranteePolicyDigest, "expectedGuaranteePolicyDigest");
  digest(expectedAssumptionsDigest, "expectedAssumptionsDigest");
  integer(nominalHorizonSteps, "nominalHorizonSteps", 1, 1_000_000_000);
  integer(cautionHorizonSteps, "cautionHorizonSteps", 1, nominalHorizonSteps);
  integer(replanHorizonSteps, "replanHorizonSteps", 0, cautionHorizonSteps);
  const thresholds = {} as Record<
    SemanticGuaranteeMetricV1,
    SemanticHorizonThresholdV1
  >;
  for (const metric of SEMANTIC_GUARANTEE_METRICS_V1) {
    const threshold = thresholdInputs[metric];
    if (!threshold)
      throw new TypeError(`semantic_horizon_${metric}_threshold_invalid`);
    const thresholdBasisPoints = threshold.thresholdBasisPoints;
    const enabled = threshold.enabled;
    if (typeof enabled !== "boolean")
      throw new TypeError(`semantic_horizon_${metric}_threshold_invalid`);
    integer(thresholdBasisPoints, `${metric}.thresholdBasisPoints`, 0, 10_000);
    thresholds[metric] = Object.freeze({
      thresholdBasisPoints,
      enabled,
    });
  }
  const body = {
    schemaVersion: 1 as const,
    expectedGuaranteePolicyDigest,
    expectedAssumptionsDigest,
    nominalHorizonSteps,
    cautionHorizonSteps,
    replanHorizonSteps,
    thresholds,
  };
  return deepFreeze({
    ...body,
    controlPolicyDigest: digestSemanticGuarantee(
      "horizon-control-policy",
      body,
    ),
  });
}

export function createSemanticHorizonControlV1(
  raw: SemanticHorizonControlPolicyV1,
): SemanticHorizonControlPortV1 {
  const policy = validateHorizonPolicy(raw);
  const decide = (
    guarantee: AnytimeSemanticGuaranteeV1,
  ): SemanticHorizonDecisionV1 => {
    if (
      guarantee.policyDigest !== policy.expectedGuaranteePolicyDigest ||
      guarantee.assumptionsDigest !== policy.expectedAssumptionsDigest
    )
      throw new TypeError("semantic_horizon_guarantee_binding_invalid");
    const missingFailClosed: string[] = [];
    const insufficient: string[] = [];
    const provenViolation: string[] = [];
    const notYetGuaranteed: string[] = [];
    for (const metric of SEMANTIC_GUARANTEE_METRICS_V1) {
      const threshold = policy.thresholds[metric];
      if (!threshold.enabled) continue;
      const bound = guarantee[metric];
      if (bound.missingCount > 0 && bound.missingness === "fail_closed") {
        missingFailClosed.push(`${metric}_missing_fail_closed`);
        continue;
      }
      if (
        bound.inferenceCount === 0 ||
        bound.inferenceCount < policyMinimum(guarantee, metric)
      ) {
        insufficient.push(`${metric}_insufficient_evidence`);
        continue;
      }
      if (bound.lowerBasisPoints === null || bound.upperBasisPoints === null) {
        insufficient.push(`${metric}_bound_unavailable`);
        continue;
      }
      if (EXPECTED_DIRECTIONS[metric] === "higher_is_better") {
        if (bound.upperBasisPoints < threshold.thresholdBasisPoints)
          provenViolation.push(`${metric}_threshold_violated`);
        else if (bound.lowerBasisPoints < threshold.thresholdBasisPoints)
          notYetGuaranteed.push(`${metric}_threshold_not_guaranteed`);
      } else {
        if (bound.lowerBasisPoints > threshold.thresholdBasisPoints)
          provenViolation.push(`${metric}_threshold_violated`);
        else if (bound.upperBasisPoints > threshold.thresholdBasisPoints)
          notYetGuaranteed.push(`${metric}_threshold_not_guaranteed`);
      }
    }
    let directive: SemanticHorizonDirectiveV1;
    let recommendedHorizonSteps: number;
    if (missingFailClosed.length) {
      directive = "safe_stop";
      recommendedHorizonSteps = 0;
    } else if (provenViolation.length) {
      directive = "replan";
      recommendedHorizonSteps = policy.replanHorizonSteps;
    } else if (insufficient.length || notYetGuaranteed.length) {
      directive = "shorten_horizon";
      recommendedHorizonSteps = policy.cautionHorizonSteps;
    } else {
      directive = "continue";
      recommendedHorizonSteps = policy.nominalHorizonSteps;
    }
    const reasonCodes = [
      ...missingFailClosed,
      ...provenViolation,
      ...insufficient,
      ...notYetGuaranteed,
    ].sort();
    if (!reasonCodes.length)
      reasonCodes.push("semantic_confidence_sequences_within_thresholds");
    return deepFreeze({
      schemaVersion: 1,
      directive,
      recommendedHorizonSteps,
      replanRequired: directive === "replan" || directive === "safe_stop",
      reasonCodes,
      guaranteeStateDigest: guarantee.stateDigest,
      policyDigest: guarantee.policyDigest,
      assumptionsDigest: guarantee.assumptionsDigest,
      controlPolicyDigest: policy.controlPolicyDigest,
    });
  };
  const control: SemanticHorizonControlPortV1 = Object.freeze({
    decide(guarantee: AnytimeSemanticGuaranteeV1): SemanticHorizonDecisionV1 {
      return invokeSemanticHorizonControlV1(control, guarantee);
    },
  });
  semanticHorizonControlInvokersV1.set(control, decide);
  return control;
}

/** Nominal check for a library-created semantic horizon control. */
export function isSemanticHorizonControlV1(
  value: unknown,
): value is SemanticHorizonControlPortV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    semanticHorizonControlInvokersV1.has(value)
  );
}

/** Decides through the immutable policy closure. */
export function invokeSemanticHorizonControlV1(
  control: SemanticHorizonControlPortV1,
  guarantee: AnytimeSemanticGuaranteeV1,
): SemanticHorizonDecisionV1 {
  const invoke =
    typeof control === "object" && control !== null
      ? semanticHorizonControlInvokersV1.get(control)
      : undefined;
  if (!invoke)
    throw new TypeError("concrete_semantic_horizon_control_required");
  validateAnytimeSemanticGuaranteeV1(guarantee);
  return validateSemanticHorizonDecisionV1(invoke(guarantee), guarantee);
}

function policyMinimum(
  guarantee: AnytimeSemanticGuaranteeV1,
  _metric: SemanticGuaranteeMetricV1,
): number {
  return guarantee.minimumInferenceSamples;
}

function boundFor(
  accumulator: SemanticMetricAccumulatorV1,
  policy: SemanticMetricGuaranteePolicyV1,
): AnytimeSemanticMetricBoundV1 {
  const count = accumulator.inferenceCount;
  if (count === 0)
    return deepFreeze({
      ...accumulator,
      meanBasisPoints: null,
      lowerBasisPoints: null,
      upperBasisPoints: null,
      errorBudgetPpm: policy.errorBudgetPpm,
      currentLookErrorBudgetPpm: null,
      missingness: policy.missingness,
    });
  const exactMean = accumulator.sumBasisPoints / count;
  const mean = Math.round(exactMean);
  const lookErrorBudgetPpm = policy.errorBudgetPpm / count / (count + 1);
  const alpha = lookErrorBudgetPpm / 1_000_000;
  const margin = 10_000 * Math.sqrt(Math.log(2 / alpha) / (2 * count));
  return deepFreeze({
    ...accumulator,
    meanBasisPoints: mean,
    lowerBasisPoints: clampBps(Math.floor(exactMean - margin)),
    upperBasisPoints: clampBps(Math.ceil(exactMean + margin)),
    errorBudgetPpm: policy.errorBudgetPpm,
    currentLookErrorBudgetPpm: lookErrorBudgetPpm,
    missingness: policy.missingness,
  });
}

function advanceAccumulator(
  prior: SemanticMetricAccumulatorV1,
  value: number | null,
  policy: SemanticMetricGuaranteePolicyV1,
): SemanticMetricAccumulatorV1 {
  if (value !== null)
    return deepFreeze({
      reportedCount: prior.reportedCount + 1,
      missingCount: prior.missingCount,
      inferenceCount: prior.inferenceCount + 1,
      sumBasisPoints: prior.sumBasisPoints + value,
      latestWasMissing: false,
    });
  const impute = policy.missingness === "worst_case_imputation";
  const worst = policy.direction === "higher_is_better" ? 0 : 10_000;
  return deepFreeze({
    reportedCount: prior.reportedCount,
    missingCount: prior.missingCount + 1,
    inferenceCount: prior.inferenceCount + (impute ? 1 : 0),
    sumBasisPoints: prior.sumBasisPoints + (impute ? worst : 0),
    latestWasMissing: true,
  });
}

function emptyAccumulator(): SemanticMetricAccumulatorV1 {
  return Object.freeze({
    reportedCount: 0,
    missingCount: 0,
    inferenceCount: 0,
    sumBasisPoints: 0,
    latestWasMissing: false,
  });
}

function validateState(
  state: AnytimeSemanticGuaranteeStateV1,
  stateKey: string,
  policy: AnytimeSemanticGuaranteePolicyV1,
): void {
  if (
    state.format !== ANYTIME_SEMANTIC_GUARANTEE_STATE_FORMAT_V1 ||
    state.schemaVersion !== 1 ||
    state.stateKey !== stateKey ||
    state.policyDigest !== policy.policyDigest ||
    state.assumptionsDigest !== policy.assumptions.assumptionsDigest
  )
    throw new TypeError("semantic_guarantee_state_binding_invalid");
  integer(state.revision, "state.revision", 1, Number.MAX_SAFE_INTEGER);
  integer(state.sampleCount, "state.sampleCount", 1, Number.MAX_SAFE_INTEGER);
  if (state.revision !== state.sampleCount)
    throw new TypeError("semantic_guarantee_state_revision_invalid");
  integer(
    state.sequenceHighWater,
    "state.sequenceHighWater",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    state.logicalTimeHighWaterMs,
    "state.logicalTimeHighWaterMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  digest(state.lastSampleDigest, "state.lastSampleDigest");
  if (state.predecessorStateDigest !== null)
    digest(state.predecessorStateDigest, "state.predecessorStateDigest");
  if (
    state.recentEvidenceDigests.length > policy.maximumRetainedEvidenceDigests
  )
    throw new TypeError("semantic_guarantee_evidence_bound_exceeded");
  uniqueDigests(
    state.recentEvidenceDigests,
    "state.recentEvidenceDigests",
    false,
  );
  for (const metric of SEMANTIC_GUARANTEE_METRICS_V1) {
    const value = state.metrics[metric];
    if (!value)
      throw new TypeError(`semantic_guarantee_${metric}_state_missing`);
    integer(
      value.reportedCount,
      `${metric}.reportedCount`,
      0,
      state.sampleCount,
    );
    integer(value.missingCount, `${metric}.missingCount`, 0, state.sampleCount);
    integer(
      value.inferenceCount,
      `${metric}.inferenceCount`,
      0,
      state.sampleCount,
    );
    integer(
      value.sumBasisPoints,
      `${metric}.sumBasisPoints`,
      0,
      value.inferenceCount * 10_000,
    );
    if (value.reportedCount + value.missingCount !== state.sampleCount)
      throw new TypeError(`semantic_guarantee_${metric}_count_invalid`);
    const expectedInferenceCount =
      policy.metrics[metric].missingness === "worst_case_imputation"
        ? state.sampleCount
        : value.reportedCount;
    if (value.inferenceCount !== expectedInferenceCount)
      throw new TypeError(
        `semantic_guarantee_${metric}_inference_count_invalid`,
      );
  }
  const { stateDigest, ...body } = state;
  digest(stateDigest, "state.stateDigest");
  if (digestSemanticGuarantee("state", body) !== stateDigest)
    throw new TypeError("semantic_guarantee_state_digest_invalid");
}

function validatePolicy(
  policy: AnytimeSemanticGuaranteePolicyV1,
): AnytimeSemanticGuaranteePolicyV1 {
  const schemaVersion = policy.schemaVersion;
  const policyDigest = policy.policyDigest;
  const assumptions = policy.assumptions;
  const recreated = createAnytimeSemanticGuaranteePolicyV1({
    policyId: policy.policyId,
    familywiseErrorBudgetPpm: policy.familywiseErrorBudgetPpm,
    minimumInferenceSamples: policy.minimumInferenceSamples,
    maximumRetainedEvidenceDigests: policy.maximumRetainedEvidenceDigests,
    maximumCasAttempts: policy.maximumCasAttempts,
    metrics: policy.metrics,
    assumptions: {
      assumptionEvidenceDigests: assumptions.assumptionEvidenceDigests,
    },
  });
  if (
    schemaVersion !== 1 ||
    policy.boundMethod !== "hoeffding_azuma_two_sided" ||
    policy.spendingSchedule !== "inverse_quadratic_telescoping" ||
    policyDigest !== recreated.policyDigest ||
    assumptions.assumptionsDigest !== recreated.assumptions.assumptionsDigest
  )
    throw new TypeError("semantic_guarantee_policy_digest_invalid");
  return recreated;
}

function validateHorizonPolicy(
  policy: SemanticHorizonControlPolicyV1,
): SemanticHorizonControlPolicyV1 {
  const schemaVersion = policy.schemaVersion;
  const controlPolicyDigest = policy.controlPolicyDigest;
  const recreated = createSemanticHorizonControlPolicyV1({
    expectedGuaranteePolicyDigest: policy.expectedGuaranteePolicyDigest,
    expectedAssumptionsDigest: policy.expectedAssumptionsDigest,
    nominalHorizonSteps: policy.nominalHorizonSteps,
    cautionHorizonSteps: policy.cautionHorizonSteps,
    replanHorizonSteps: policy.replanHorizonSteps,
    thresholds: policy.thresholds,
  });
  if (
    schemaVersion !== 1 ||
    controlPolicyDigest !== recreated.controlPolicyDigest
  )
    throw new TypeError("semantic_horizon_control_policy_digest_invalid");
  return recreated;
}

function validateSample(sample: SemanticMetricSampleV1): void {
  if (
    !sample ||
    typeof sample !== "object" ||
    !sample.metrics ||
    typeof sample.metrics !== "object"
  )
    throw new TypeError("semantic_guarantee_sample_invalid");
  integer(sample.sequence, "sample.sequence", 1, Number.MAX_SAFE_INTEGER);
  integer(
    sample.logicalTimeMs,
    "sample.logicalTimeMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  digest(sample.assessmentDigest, "sample.assessmentDigest");
  for (const key of Object.values(VECTOR_KEYS)) {
    const value = sample.metrics[key];
    if (value !== null) integer(value, `sample.metrics.${key}`, 0, 10_000);
  }
}

function immutableSemanticGuaranteeValue(value: unknown): PropertyDescriptor {
  return {
    value,
    writable: false,
    configurable: false,
    enumerable: true,
  };
}

function validateMetricBound(
  bound: AnytimeSemanticMetricBoundV1,
  metric: SemanticGuaranteeMetricV1,
): void {
  if (bound.missingCount === 0 && bound.latestWasMissing)
    throw new TypeError(`semantic_guarantee_${metric}_latest_missing_invalid`);
  if (bound.inferenceCount === 0) {
    if (
      bound.sumBasisPoints !== 0 ||
      bound.meanBasisPoints !== null ||
      bound.lowerBasisPoints !== null ||
      bound.upperBasisPoints !== null ||
      bound.currentLookErrorBudgetPpm !== null
    )
      throw new TypeError(`semantic_guarantee_${metric}_empty_bound_invalid`);
    return;
  }
  const count = bound.inferenceCount;
  const exactMean = bound.sumBasisPoints / count;
  const expectedMean = Math.round(exactMean);
  const expectedLook = bound.errorBudgetPpm / count / (count + 1);
  if (
    typeof bound.currentLookErrorBudgetPpm !== "number" ||
    !Number.isFinite(bound.currentLookErrorBudgetPpm) ||
    bound.currentLookErrorBudgetPpm !== expectedLook
  )
    throw new TypeError(`semantic_guarantee_${metric}_look_budget_invalid`);
  const alpha = expectedLook / 1_000_000;
  const margin = 10_000 * Math.sqrt(Math.log(2 / alpha) / (2 * count));
  const expectedLower = clampBps(Math.floor(exactMean - margin));
  const expectedUpper = clampBps(Math.ceil(exactMean + margin));
  if (
    bound.meanBasisPoints !== expectedMean ||
    bound.lowerBasisPoints !== expectedLower ||
    bound.upperBasisPoints !== expectedUpper
  )
    throw new TypeError(`semantic_guarantee_${metric}_bound_invalid`);
}

function exactKeys(
  value: unknown,
  expected: readonly string[],
  name: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${name}_invalid`);
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (
    actual.length !== canonical.length ||
    actual.some((key, index) => key !== canonical[index])
  )
    throw new TypeError(`${name}_keys_invalid`);
}

function uniqueTokens(values: readonly string[], name: string): void {
  if (!Array.isArray(values) || values.length < 1 || values.length > 128)
    throw new TypeError(`${name}_invalid`);
  const prior = new Set<string>();
  for (const value of values) {
    identifier(value, name);
    if (prior.has(value)) throw new TypeError(`${name}_contains_duplicates`);
    prior.add(value);
  }
  if (values.some((value, index) => index > 0 && values[index - 1]! > value))
    throw new TypeError(`${name}_not_canonical`);
}

function digestSemanticGuarantee(domain: string, value: unknown): string {
  return digestControlJsonV1("state", {
    semanticGuaranteeDomain: domain,
    value,
  } as JsonValue);
}

function uniqueDigests(
  values: readonly string[],
  name: string,
  sort = true,
): readonly string[] {
  if (!Array.isArray(values)) throw new TypeError(`${name}_must_be_array`);
  for (const value of values) digest(value, name);
  const unique = [...new Set(values)];
  if (unique.length !== values.length)
    throw new TypeError(`${name}_contains_duplicates`);
  return Object.freeze(sort ? unique.sort() : unique);
}

function appendRecentUnique(
  prior: readonly string[],
  next: string,
  maximum: number,
): readonly string[] {
  return Object.freeze(
    [...prior.filter((value) => value !== next), next].slice(-maximum),
  );
}

function digest(value: string, name: string): void {
  if (!/^sha256:[a-f0-9]{64}$/.test(value))
    throw new TypeError(`${name}_invalid`);
}

function identifier(value: string, name: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(value))
    throw new TypeError(`${name}_invalid`);
}

function integer(
  value: number,
  name: string,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new RangeError(`${name}_invalid`);
}

function clampBps(value: number): number {
  return Math.max(0, Math.min(10_000, value));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
  }
  return value;
}
