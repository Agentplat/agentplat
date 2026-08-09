import type {
  SemanticAssessorPortV1,
  SemanticControlDispositionV1,
  SemanticControlRequestV1,
  SemanticMetricVectorV1,
} from "./semantic-alignment-contracts.js";
import {
  createSemanticAssessorAssessmentV1,
  createSemanticAssessorDescriptorV1,
} from "./semantic-alignment-validation.js";

export interface SemanticVectorV1 {
  readonly values: readonly number[];
  readonly confidenceBasisPoints: number;
}

export interface SemanticCourseActionVectorV1 extends SemanticVectorV1 {
  readonly digest: string;
}

export interface SemanticContextVectorV1 extends SemanticVectorV1 {
  readonly evidenceDigest: string;
  readonly independenceGroup: string;
}

/** Verified, volatile material resolved from SemanticControlRequestV1.materialHandle. */
export interface SemanticVectorMaterialV1 {
  readonly materialDigest: string;
  readonly output: SemanticVectorV1;
  readonly roleAnchor: SemanticVectorV1;
  readonly missionAnchor: SemanticVectorV1;
  readonly context: readonly SemanticContextVectorV1[];
  readonly candidates: readonly SemanticCourseActionVectorV1[];
  readonly history: readonly SemanticCourseActionVectorV1[];
}

export interface VerifiedSemanticVectorResolverV1 {
  /** Implementations must content-verify materialDigest before returning material. */
  resolveVerified(
    request: SemanticControlRequestV1,
  ): SemanticVectorMaterialV1 | Promise<SemanticVectorMaterialV1>;
}

export interface VectorSemanticAssessorThresholdsV1 {
  readonly minimumRoleCoherenceBasisPoints: number;
  readonly minimumMissionAlignmentBasisPoints: number;
  readonly maximumContextConflictBasisPoints: number;
  readonly maximumUncertaintyBasisPoints: number;
  readonly minimumCourseActionDiversityBasisPoints: number;
  readonly minimumCourseActionNoveltyBasisPoints: number;
}

export interface VectorSemanticAssessorOptionsV1 {
  readonly assessorId: string;
  readonly assessorVersion: number;
  readonly assessorImplementationDigest: string;
  readonly independenceGroup: string;
  readonly resolver: VerifiedSemanticVectorResolverV1;
  readonly thresholds: VectorSemanticAssessorThresholdsV1;
  readonly enforceHardConstraints?: boolean;
  readonly maximumDimensions?: number;
  readonly maximumContextSources?: number;
  readonly maximumCourseActions?: number;
}

/**
 * Model-independent reference assessor. It turns verified representation
 * vectors into role, mission, conflict, uncertainty and exploration metrics.
 */
export function createVectorSemanticAssessorV1(
  options: VectorSemanticAssessorOptionsV1,
): SemanticAssessorPortV1 {
  validateOptions(options);
  const descriptor = createSemanticAssessorDescriptorV1({
    schemaVersion: 1,
    assessorId: options.assessorId,
    assessorVersion: options.assessorVersion,
    assessorImplementationDigest: options.assessorImplementationDigest,
    independenceGroup: options.independenceGroup,
    basis: "representation_model",
    supportedDimensions: [
      "context_conflict",
      "course_action_diversity",
      "course_action_novelty",
      "mission_alignment",
      "role_coherence",
      "uncertainty",
    ],
  });

  return Object.freeze({
    descriptor,
    async assess(request: SemanticControlRequestV1) {
      const material = await options.resolver.resolveVerified(request);
      validateMaterial(material, request, options);
      const metrics = calculateSemanticMetricVectorV1(material, request);
      const reasons: string[] = [];
      const violations: ("role_constraint" | "mission_constraint")[] = [];
      const thresholds = options.thresholds;
      if (below(metrics.roleCoherenceBps, thresholds.minimumRoleCoherenceBasisPoints)) {
        reasons.push("role_coherence_below_threshold");
        if (options.enforceHardConstraints) violations.push("role_constraint");
      }
      if (below(metrics.missionAlignmentBps, thresholds.minimumMissionAlignmentBasisPoints)) {
        reasons.push("mission_alignment_below_threshold");
        if (options.enforceHardConstraints) violations.push("mission_constraint");
      }
      if (above(metrics.contextConflictBps, thresholds.maximumContextConflictBasisPoints))
        reasons.push("context_conflict_above_threshold");
      if (above(metrics.uncertaintyBps, thresholds.maximumUncertaintyBasisPoints))
        reasons.push("semantic_uncertainty_above_threshold");
      if (below(metrics.courseActionDiversityBps, thresholds.minimumCourseActionDiversityBasisPoints))
        reasons.push("course_action_diversity_below_threshold");
      if (below(metrics.courseActionNoveltyBps, thresholds.minimumCourseActionNoveltyBasisPoints))
        reasons.push("course_action_novelty_below_threshold");

      const recommendation = disposition(metrics, thresholds, violations.length > 0);
      if (reasons.length === 0) reasons.push("vector_semantic_metrics_within_bounds");
      return createSemanticAssessorAssessmentV1({
        schemaVersion: 1,
        requestDigest: request.requestDigest,
        assessorId: descriptor.assessorId,
        assessorVersion: descriptor.assessorVersion,
        assessorImplementationDigest: descriptor.assessorImplementationDigest,
        independenceGroup: descriptor.independenceGroup,
        metrics,
        hardConstraintViolations: [...new Set(violations)].sort(),
        recommendation,
        reasonCodes: [...new Set(reasons)].sort(),
        evidenceDigests: [...new Set(material.context.map((item) => item.evidenceDigest))].sort(),
      });
    },
  });
}

export function calculateSemanticMetricVectorV1(
  material: SemanticVectorMaterialV1,
  request: Pick<
    SemanticControlRequestV1,
    | "candidateCourseActionDigests"
    | "priorCourseActionDigests"
    | "selectedCourseActionDigest"
  >,
): SemanticMetricVectorV1 {
  const roleCoherenceBps = confidenceAdjustedSimilarity(
    material.output,
    material.roleAnchor,
  );
  const missionAlignmentBps = confidenceAdjustedSimilarity(
    material.output,
    material.missionAnchor,
  );
  const independentContext = strongestPerGroup(material.context);
  const contextConflictBps = maximumPairwiseDistance(independentContext);
  const confidenceFloor = Math.min(
    material.output.confidenceBasisPoints,
    material.roleAnchor.confidenceBasisPoints,
    material.missionAnchor.confidenceBasisPoints,
    ...independentContext.map((item) => item.confidenceBasisPoints),
  );
  const contextDispersion = averageDistanceFromCentroid(independentContext);
  const uncertaintyBps = clampBps(
    Math.max(10_000 - confidenceFloor, contextDispersion),
  );
  const candidateByDigest = new Map(material.candidates.map((item) => [item.digest, item]));
  const candidates = request.candidateCourseActionDigests
    .map((item) => candidateByDigest.get(item))
    .filter((item): item is SemanticCourseActionVectorV1 => item !== undefined);
  const historyByDigest = new Map(material.history.map((item) => [item.digest, item]));
  const history = request.priorCourseActionDigests
    .map((item) => historyByDigest.get(item))
    .filter((item): item is SemanticCourseActionVectorV1 => item !== undefined);
  const selected = request.selectedCourseActionDigest === null
    ? null
    : candidateByDigest.get(request.selectedCourseActionDigest) ?? null;

  return Object.freeze({
    roleCoherenceBps,
    missionAlignmentBps,
    contextConflictBps,
    uncertaintyBps,
    courseActionDiversityBps:
      candidates.length < 2 ? null : averagePairwiseDistance(candidates),
    courseActionNoveltyBps:
      selected === null
        ? null
        : history.length === 0
          ? 10_000
          : Math.min(...history.map((item) => vectorDistanceBps(selected, item))),
  });
}

export interface SemanticMetricSampleV1 {
  readonly sequence: number;
  readonly logicalTimeMs: number;
  readonly metrics: SemanticMetricVectorV1;
  readonly assessmentDigest: string;
}

export interface SemanticMetricBoundV1 {
  readonly sampleCount: number;
  readonly meanBasisPoints: number | null;
  readonly lowerBasisPoints: number | null;
  readonly upperBasisPoints: number | null;
}

export interface SequentialSemanticGuaranteeV1 {
  readonly schemaVersion: 1;
  readonly throughSequence: number;
  readonly throughLogicalTimeMs: number;
  readonly confidenceBasisPoints: number;
  readonly roleCoherence: SemanticMetricBoundV1;
  readonly missionAlignment: SemanticMetricBoundV1;
  readonly contextConflict: SemanticMetricBoundV1;
  readonly uncertainty: SemanticMetricBoundV1;
  readonly courseActionDiversity: SemanticMetricBoundV1;
  readonly courseActionNovelty: SemanticMetricBoundV1;
  readonly evidenceDigests: readonly string[];
}

const sequentialSemanticGuaranteeEngineInvokersV1 = new WeakMap<
  object,
  {
    readonly append: (
      sample: SemanticMetricSampleV1,
    ) => SequentialSemanticGuaranteeV1;
    readonly current: () => SequentialSemanticGuaranteeV1;
  }
>();

/**
 * Produces finite-sample Hoeffding bounds over a bounded, recent horizon.
 * It is deterministic and retains content-free metric samples only.
 */
export class SequentialSemanticGuaranteeEngineV1 {
  readonly #samples: SemanticMetricSampleV1[] = [];

  constructor(
    readonly maximumSamples: number,
    readonly confidenceBasisPoints = 9_500,
  ) {
    integer(maximumSamples, "maximumSamples", 2, 100_000);
    integer(confidenceBasisPoints, "confidenceBasisPoints", 5_001, 9_999);
    const invokers = Object.freeze({
      append: (sample: SemanticMetricSampleV1) => this.#append(sample),
      current: () => this.#current(),
    });
    sequentialSemanticGuaranteeEngineInvokersV1.set(this, invokers);
    Object.defineProperties(this, {
      maximumSamples: immutableValue(maximumSamples),
      confidenceBasisPoints: immutableValue(confidenceBasisPoints),
      append: immutableMethod(invokers.append),
      current: immutableMethod(invokers.current),
    });
  }

  append(sample: SemanticMetricSampleV1): SequentialSemanticGuaranteeV1 {
    return invokeSequentialSemanticGuaranteeAppendV1(this, sample);
  }

  #append(sample: SemanticMetricSampleV1): SequentialSemanticGuaranteeV1 {
    const prior = this.#samples.at(-1);
    if (prior?.sequence === sample.sequence) {
      if (
        prior.assessmentDigest !== sample.assessmentDigest ||
        prior.logicalTimeMs !== sample.logicalTimeMs ||
        semanticMetricTuple(prior.metrics).some((item, index) => item !== semanticMetricTuple(sample.metrics)[index])
      ) throw new TypeError("semantic_sample_equivocation");
      return this.#current();
    }
    validateSample(sample, prior);
    this.#samples.push(Object.freeze(structuredClone(sample)));
    if (this.#samples.length > this.maximumSamples) this.#samples.shift();
    return this.#current();
  }

  current(): SequentialSemanticGuaranteeV1 {
    return invokeSequentialSemanticGuaranteeCurrentV1(this);
  }

  #current(): SequentialSemanticGuaranteeV1 {
    const latest = this.#samples.at(-1);
    if (!latest) throw new TypeError("semantic_guarantee_has_no_samples");
    const metric = (key: keyof SemanticMetricVectorV1) =>
      boundedMetric(this.#samples.map((item) => item.metrics[key]), this.confidenceBasisPoints);
    return Object.freeze({
      schemaVersion: 1,
      throughSequence: latest.sequence,
      throughLogicalTimeMs: latest.logicalTimeMs,
      confidenceBasisPoints: this.confidenceBasisPoints,
      roleCoherence: metric("roleCoherenceBps"),
      missionAlignment: metric("missionAlignmentBps"),
      contextConflict: metric("contextConflictBps"),
      uncertainty: metric("uncertaintyBps"),
      courseActionDiversity: metric("courseActionDiversityBps"),
      courseActionNovelty: metric("courseActionNoveltyBps"),
      evidenceDigests: [...new Set(this.#samples.map((item) => item.assessmentDigest))].sort(),
    });
  }
}

/** Nominal check for the concrete sequential semantic guarantee engine. */
export function isSequentialSemanticGuaranteeEngineV1(
  value: unknown,
): value is SequentialSemanticGuaranteeEngineV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    sequentialSemanticGuaranteeEngineInvokersV1.has(value)
  );
}

/** Appends through the engine's construction-time private closure. */
export function invokeSequentialSemanticGuaranteeAppendV1(
  engine: SequentialSemanticGuaranteeEngineV1,
  sample: SemanticMetricSampleV1,
): SequentialSemanticGuaranteeV1 {
  const invoke =
    typeof engine === "object" && engine !== null
      ? sequentialSemanticGuaranteeEngineInvokersV1.get(engine)?.append
      : undefined;
  if (!invoke)
    throw new TypeError("concrete_sequential_semantic_guarantee_engine_required");
  return invoke(sample);
}

/** Reads through the engine's construction-time private closure. */
export function invokeSequentialSemanticGuaranteeCurrentV1(
  engine: SequentialSemanticGuaranteeEngineV1,
): SequentialSemanticGuaranteeV1 {
  const invoke =
    typeof engine === "object" && engine !== null
      ? sequentialSemanticGuaranteeEngineInvokersV1.get(engine)?.current
      : undefined;
  if (!invoke)
    throw new TypeError("concrete_sequential_semantic_guarantee_engine_required");
  return invoke();
}

function immutableValue<T>(value: T): PropertyDescriptor {
  return {
    value,
    writable: false,
    configurable: false,
    enumerable: true,
  };
}

function immutableMethod<T extends (...args: never[]) => unknown>(
  value: T,
): PropertyDescriptor {
  return {
    value,
    writable: false,
    configurable: false,
    enumerable: false,
  };
}

function boundedMetric(
  raw: readonly (number | null)[],
  confidenceBasisPoints: number,
): SemanticMetricBoundV1 {
  const values = raw.filter((item): item is number => item !== null);
  if (values.length === 0)
    return Object.freeze({ sampleCount: 0, meanBasisPoints: null, lowerBasisPoints: null, upperBasisPoints: null });
  const mean = Math.round(values.reduce((sum, item) => sum + item, 0) / values.length);
  const alpha = Math.max(0.0001, 1 - confidenceBasisPoints / 10_000);
  const margin = Math.ceil(10_000 * Math.sqrt(Math.log(2 / alpha) / (2 * values.length)));
  return Object.freeze({
    sampleCount: values.length,
    meanBasisPoints: mean,
    lowerBasisPoints: clampBps(mean - margin),
    upperBasisPoints: clampBps(mean + margin),
  });
}

function validateSample(sample: SemanticMetricSampleV1, prior?: SemanticMetricSampleV1): void {
  integer(sample.sequence, "sample.sequence", 1, Number.MAX_SAFE_INTEGER);
  integer(sample.logicalTimeMs, "sample.logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
  if (!/^sha256:[a-f0-9]{64}$/.test(sample.assessmentDigest))
    throw new TypeError("sample.assessmentDigest_invalid");
  if (!sample.metrics || typeof sample.metrics !== "object")
    throw new TypeError("sample.metrics_invalid");
  for (const value of semanticMetricTuple(sample.metrics))
    if (value !== null) integer(value, "sample.metric", 0, 10_000);
  if (prior && (sample.sequence <= prior.sequence || sample.logicalTimeMs < prior.logicalTimeMs))
    throw new TypeError("semantic_sample_order_invalid");
}

function validateOptions(options: VectorSemanticAssessorOptionsV1): void {
  if (!options.resolver || typeof options.resolver.resolveVerified !== "function")
    throw new TypeError("semantic_vector_resolver_required");
  for (const value of Object.values(options.thresholds))
    integer(value, "semantic threshold", 0, 10_000);
  integer(options.maximumDimensions ?? 16_384, "maximumDimensions", 1, 1_000_000);
  integer(options.maximumContextSources ?? 128, "maximumContextSources", 0, 10_000);
  integer(options.maximumCourseActions ?? 512, "maximumCourseActions", 0, 100_000);
}

function validateMaterial(
  material: SemanticVectorMaterialV1,
  request: SemanticControlRequestV1,
  options: VectorSemanticAssessorOptionsV1,
): void {
  if (!material || material.materialDigest !== request.materialDigest)
    throw new TypeError("semantic_vector_material_binding_invalid");
  const maximumDimensions = options.maximumDimensions ?? 16_384;
  const maximumContextSources = options.maximumContextSources ?? 128;
  const maximumCourseActions = options.maximumCourseActions ?? 512;
  const vectors = [
    material.output,
    material.roleAnchor,
    material.missionAnchor,
    ...material.context,
    ...material.candidates,
    ...material.history,
  ];
  if (material.context.length > maximumContextSources)
    throw new RangeError("semantic_context_source_limit_exceeded");
  if (material.candidates.length + material.history.length > maximumCourseActions)
    throw new RangeError("semantic_course_action_limit_exceeded");
  const dimensions = material.output.values.length;
  if (dimensions < 1 || dimensions > maximumDimensions)
    throw new RangeError("semantic_vector_dimension_invalid");
  for (const vector of vectors) validateVector(vector, dimensions);
  const candidateDigests = new Set(material.candidates.map((item) => item.digest));
  const historyDigests = new Set(material.history.map((item) => item.digest));
  if (
    candidateDigests.size !== material.candidates.length ||
    historyDigests.size !== material.history.length ||
    request.candidateCourseActionDigests.some((item) => !candidateDigests.has(item)) ||
    request.priorCourseActionDigests.some((item) => !historyDigests.has(item)) ||
    (request.selectedCourseActionDigest !== null && !candidateDigests.has(request.selectedCourseActionDigest))
  ) throw new TypeError("semantic_course_action_binding_invalid");
  for (const item of [...material.candidates, ...material.history])
    if (!/^sha256:[a-f0-9]{64}$/.test(item.digest)) throw new TypeError("semantic_course_action_digest_invalid");
  const groups = new Set<string>();
  for (const item of material.context) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(item.independenceGroup))
      throw new TypeError("semantic_context_independence_group_invalid");
    if (!/^sha256:[a-f0-9]{64}$/.test(item.evidenceDigest))
      throw new TypeError("semantic_context_evidence_digest_invalid");
    const key = `${item.independenceGroup}\u0000${item.evidenceDigest}`;
    if (groups.has(key)) throw new TypeError("semantic_context_source_duplicate");
    groups.add(key);
  }
}

function validateVector(vector: SemanticVectorV1, dimensions: number): void {
  if (!Array.isArray(vector.values) || vector.values.length !== dimensions)
    throw new TypeError("semantic_vector_shape_invalid");
  integer(vector.confidenceBasisPoints, "vector.confidenceBasisPoints", 0, 10_000);
  if (vector.values.some((item) => !Number.isFinite(item) || Math.abs(item) > 1_000_000))
    throw new TypeError("semantic_vector_value_invalid");
  const magnitude = Math.sqrt(vector.values.reduce((sum, item) => sum + item * item, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0)
    throw new TypeError("semantic_vector_magnitude_invalid");
}

function strongestPerGroup(
  values: readonly SemanticContextVectorV1[],
): readonly SemanticContextVectorV1[] {
  const byGroup = new Map<string, SemanticContextVectorV1>();
  for (const value of values) {
    const current = byGroup.get(value.independenceGroup);
    if (
      !current ||
      value.confidenceBasisPoints > current.confidenceBasisPoints ||
      (value.confidenceBasisPoints === current.confidenceBasisPoints && value.evidenceDigest < current.evidenceDigest)
    ) byGroup.set(value.independenceGroup, value);
  }
  return [...byGroup.values()].sort((left, right) =>
    left.independenceGroup.localeCompare(right.independenceGroup),
  );
}

function confidenceAdjustedSimilarity(left: SemanticVectorV1, right: SemanticVectorV1): number {
  const similarity = vectorSimilarityBps(left, right);
  return Math.round(similarity * Math.min(left.confidenceBasisPoints, right.confidenceBasisPoints) / 10_000);
}

function vectorSimilarityBps(left: SemanticVectorV1, right: SemanticVectorV1): number {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.values.length; index += 1) {
    dot += left.values[index] * right.values[index];
    leftMagnitude += left.values[index] ** 2;
    rightMagnitude += right.values[index] ** 2;
  }
  const cosine = dot / Math.sqrt(leftMagnitude * rightMagnitude);
  return clampBps(Math.round(((Math.max(-1, Math.min(1, cosine)) + 1) / 2) * 10_000));
}

function vectorDistanceBps(left: SemanticVectorV1, right: SemanticVectorV1): number {
  return 10_000 - vectorSimilarityBps(left, right);
}

function maximumPairwiseDistance(values: readonly SemanticVectorV1[]): number {
  if (values.length < 2) return 0;
  let maximum = 0;
  for (let left = 0; left < values.length; left += 1)
    for (let right = left + 1; right < values.length; right += 1)
      maximum = Math.max(maximum, vectorDistanceBps(values[left], values[right]));
  return maximum;
}

function averagePairwiseDistance(values: readonly SemanticVectorV1[]): number {
  let total = 0;
  let pairs = 0;
  for (let left = 0; left < values.length; left += 1)
    for (let right = left + 1; right < values.length; right += 1) {
      total += vectorDistanceBps(values[left], values[right]);
      pairs += 1;
    }
  return pairs === 0 ? 0 : Math.round(total / pairs);
}

function averageDistanceFromCentroid(values: readonly SemanticVectorV1[]): number {
  if (values.length < 2) return 0;
  const centroidValues = values[0].values.map((_, dimension) =>
    values.reduce((sum, item) => sum + item.values[dimension], 0) / values.length,
  );
  if (Math.sqrt(centroidValues.reduce((sum, item) => sum + item * item, 0)) <= Number.EPSILON)
    return 10_000;
  const centroid = { values: centroidValues, confidenceBasisPoints: 10_000 };
  return Math.round(values.reduce((sum, item) => sum + vectorDistanceBps(item, centroid), 0) / values.length);
}

function semanticMetricTuple(metrics: SemanticMetricVectorV1): readonly (number | null)[] {
  return [
    metrics.roleCoherenceBps,
    metrics.missionAlignmentBps,
    metrics.contextConflictBps,
    metrics.uncertaintyBps,
    metrics.courseActionDiversityBps,
    metrics.courseActionNoveltyBps,
  ];
}

function disposition(
  metrics: SemanticMetricVectorV1,
  thresholds: VectorSemanticAssessorThresholdsV1,
  hardViolation: boolean,
): SemanticControlDispositionV1 {
  if (hardViolation) return "block";
  if (
    above(metrics.contextConflictBps, thresholds.maximumContextConflictBasisPoints) ||
    above(metrics.uncertaintyBps, thresholds.maximumUncertaintyBasisPoints)
  ) return "abstain";
  if (
    below(metrics.roleCoherenceBps, thresholds.minimumRoleCoherenceBasisPoints) ||
    below(metrics.missionAlignmentBps, thresholds.minimumMissionAlignmentBasisPoints) ||
    below(metrics.courseActionDiversityBps, thresholds.minimumCourseActionDiversityBasisPoints) ||
    below(metrics.courseActionNoveltyBps, thresholds.minimumCourseActionNoveltyBasisPoints)
  ) return "steer";
  return "allow";
}

function below(value: number | null, threshold: number): boolean {
  return value !== null && value < threshold;
}

function above(value: number | null, threshold: number): boolean {
  return value !== null && value > threshold;
}

function clampBps(value: number): number {
  return Math.max(0, Math.min(10_000, Math.round(value)));
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum)
    throw new RangeError(`${label}_invalid`);
  return value as number;
}
