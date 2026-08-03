import {
  canonicalizePlanningJsonV1,
  deepFreezePlanning,
  digestPlanningJsonV1,
  type PlanningDigestV1,
} from "@agentplat/collective-planning";
import {
  collectiveEvaluationRunKeyV1,
  validateCollectiveEvaluationCampaignRegistrationV1,
  validateNormativeMetricProjectionV1,
  type CollectiveEvaluationCampaignRegistrationV1,
  type NormativeMetricProjectionV1,
} from "@agentplat/collective-planning/evaluation";

export const COLLECTIVE_NORMATIVE_ANALYSIS_VERSION_V1 = 1 as const;
export const COLLECTIVE_NORMATIVE_ANALYSIS_RESAMPLES_V1 = 10_000 as const;
export const COLLECTIVE_NORMATIVE_HOLM_FAMILY_V1 = Object.freeze([
  "nominal.pairedSuccess",
  "benign.pairedSuccess",
] as const);

export type CollectiveNormativeStratumV1 =
  "nominal" | "benign" | "adversarial" | "mixed";
export type CollectiveNormativeRunnerV1 =
  "adaptive_collective" | "centralized_planner";

export interface CollectiveNormativeAnalysisInputV1 {
  readonly schemaVersion: 1;
  readonly registration: CollectiveEvaluationCampaignRegistrationV1;
  readonly executionId: string;
  readonly aggregationSeed: number;
  readonly bootstrapResamples: 10_000;
  readonly projections: readonly NormativeMetricProjectionV1[];
}

export interface CollectiveNormativeRunnerRowV1 {
  readonly runner: CollectiveNormativeRunnerV1;
  readonly missionSuccess: boolean;
  readonly interactionTotal: number;
  readonly interactionCeiling: number;
  readonly replayExact: boolean;
  readonly faultCoverageValid: boolean;
  readonly safetyViolationCount: number;
  readonly recoveryInteractions: number | null;
  readonly convergenceAgreement: number | null;
  readonly convergenceInteractionDelta: number | null;
  readonly roleDecisionCount: number;
  readonly unsafeExecutableCount: number;
  readonly usefulRoleDecisionCount: number;
  readonly projectionDigest: PlanningDigestV1;
}

export interface CollectiveNormativeCampaignRowV1 {
  readonly schemaVersion: 1;
  readonly cellId: string;
  readonly scale: 50 | 100 | 250 | 500;
  readonly stratum: CollectiveNormativeStratumV1;
  readonly seed: number;
  readonly adaptive: CollectiveNormativeRunnerRowV1;
  readonly centralized: CollectiveNormativeRunnerRowV1;
}

export interface CollectiveNormativeMappedRowsV1 {
  readonly schemaVersion: 1;
  readonly registrationDigest: PlanningDigestV1;
  readonly rows: readonly CollectiveNormativeCampaignRowV1[];
  readonly complete: boolean;
}

export interface CollectiveNormativeWilsonIntervalV1 {
  readonly successes: number;
  readonly denominator: number;
  readonly confidenceLevel: 0.95;
  readonly lower: number;
  readonly upper: number;
}

export interface CollectiveNormativeBootstrapV1 {
  readonly seed: number;
  readonly streamSeed: number;
  readonly domain: string;
  readonly method: "paired-percentile-bootstrap-xorshift32-v1";
  readonly nullHypothesis: "mean_delta_lte_-0.05";
  readonly resamples: 10_000;
  readonly pointEstimate: number;
  readonly lower: number;
  readonly upper: number;
  readonly oneSidedPValue: number;
}

export interface CollectiveNormativeAnalysisV1 {
  readonly schemaVersion: 1;
  readonly decision: "eligible" | "ineligible" | "incomplete";
  readonly reasonCodes: readonly string[];
  readonly endpoints: readonly Readonly<Record<string, unknown>>[];
  readonly rawRows: readonly CollectiveNormativeCampaignRowV1[];
  readonly analysisDigest: PlanningDigestV1;
}

const strata = ["nominal", "benign", "adversarial", "mixed"] as const;
const scales = [50, 100, 250, 500] as const;
const runners = ["adaptive_collective", "centralized_planner"] as const;
const expectedSeeds = new Map([
  [50, 10],
  [100, 10],
  [250, 10],
  [500, 30],
]);
const nonNominalFaults = [
  "assignment.decline",
  "capability.withdraw",
  "network.heal",
  "network.partition",
  "peer.crash",
  "peer.restart",
] as const;
const Z_TWO_SIDED_95 = 1.959963984540054;
const Z_ONE_SIDED_95 = 1.6448536269514722;
const reasonOrder = [
  "normative_artifact_closure_invalid",
  "normative_replay_diverged",
  "normative_interaction_ceiling_exceeded",
  "normative_fault_coverage_mismatch",
  "normative_safety_violation",
  "normative_role_coherence_horizon_invalid",
  "normative_role_unsafe_executable",
  "normative_role_useful_rate_below_threshold",
  "normative_convergence_evidence_missing",
  "normative_convergence_deadline_exceeded",
  "normative_recovery_p95_exceeded",
  "normative_wilson_threshold_not_met",
  "normative_paired_lower_bound_not_met",
  "normative_holm_noninferiority_not_rejected",
] as const;

/** Descriptive two-sided 95% Wilson interval. */
export function collectiveNormativeWilson95V1(
  successes: number,
  denominator: number,
): CollectiveNormativeWilsonIntervalV1 {
  assertBinomial(successes, denominator);
  const interval = wilson(successes, denominator, Z_TWO_SIDED_95);
  return Object.freeze({
    successes,
    denominator,
    confidenceLevel: 0.95,
    lower: successes === 0 ? 0 : interval.lower,
    upper: successes === denominator ? 1 : interval.upper,
  });
}

/** Registered one-sided 95% Wilson lower bound for acceptance only. */
export function collectiveNormativeWilsonLower95V1(
  successes: number,
  denominator: number,
): number {
  assertBinomial(successes, denominator);
  return successes === 0
    ? 0
    : wilson(successes, denominator, Z_ONE_SIDED_95).lower;
}

/**
 * Maps only evaluator-owned, registration-bound projections into statistical
 * rows. No mission, safety, replay, fault or metric boolean is accepted from a
 * runner or caller.
 */
export function mapCollectiveNormativeProjectionRowsV1(
  input: CollectiveNormativeAnalysisInputV1,
): CollectiveNormativeMappedRowsV1 {
  validateTopLevel(input);
  const registration = validateCollectiveEvaluationCampaignRegistrationV1(
    input.registration,
  );
  const bySlot = new Map<string, NormativeMetricProjectionV1>();
  for (const raw of input.projections) {
    const projection = validateNormativeMetricProjectionV1(raw);
    const cell = registration.cells.find(
      (candidate) => candidate.cellId === projection.cellId,
    );
    if (
      !cell ||
      projection.registrationDigest !== registration.registrationDigest ||
      projection.seed !== cell.seed
    )
      fail("projection_binding_invalid");
    if (
      projection.executionId !== input.executionId ||
      projection.interactionCeiling !== cell.maximumInteractions
    )
      fail("projection_binding_invalid");
    const expectedRunKey = collectiveEvaluationRunKeyV1({
      executionId: input.executionId,
      registrationDigest: registration.registrationDigest,
      cellId: cell.cellId,
      runner: projection.runner,
      attempt: projection.attempt,
    });
    if (projection.runKey !== expectedRunKey)
      fail("projection_run_key_invalid");
    const key = slotKey(cell.cellId, projection.runner, projection.attempt);
    if (bySlot.has(key)) fail("projection_slot_duplicate");
    bySlot.set(key, projection);
  }

  const rows: CollectiveNormativeCampaignRowV1[] = [];
  for (const cell of registration.cells) {
    const runnerRows = new Map<
      CollectiveNormativeRunnerV1,
      CollectiveNormativeRunnerRowV1
    >();
    for (const runner of runners) {
      const first = bySlot.get(slotKey(cell.cellId, runner, "first"));
      const replay = bySlot.get(slotKey(cell.cellId, runner, "replay"));
      if (!first || !replay) continue;
      runnerRows.set(
        runner,
        deriveRunnerRow(cell.stratum, cell.maximumInteractions, first, replay),
      );
    }
    const adaptive = runnerRows.get("adaptive_collective");
    const centralized = runnerRows.get("centralized_planner");
    if (!adaptive || !centralized) continue;
    rows.push(
      Object.freeze({
        schemaVersion: 1,
        cellId: cell.cellId,
        scale: cell.peerCount,
        stratum: cell.stratum,
        seed: cell.seed,
        adaptive,
        centralized,
      }),
    );
  }
  if (rows.length > 240) fail("row_limit_exceeded");
  return deepFreezePlanning({
    schemaVersion: 1,
    registrationDigest: registration.registrationDigest,
    rows,
    complete: rows.length === 240 && bySlot.size === 960,
  }) as CollectiveNormativeMappedRowsV1;
}

export function analyzeCollectiveStatisticalCampaignNormativeV1(
  input: CollectiveNormativeAnalysisInputV1,
): CollectiveNormativeAnalysisV1 {
  const mapped = mapCollectiveNormativeProjectionRowsV1(input);
  const rows = mapped.rows;
  if (!mapped.complete || !hasExactClosure(rows)) {
    return finish(
      "incomplete",
      ["normative_artifact_closure_invalid"],
      [
        Object.freeze({
          endpoint: "campaign.closure",
          expectedRows: 240,
          actualRows: rows.length,
          expectedSlots: 960,
          actualSlots: input.projections.length,
        }),
      ],
      rows,
    );
  }

  const reasons = new Set<string>();
  const endpoints: Readonly<Record<string, unknown>>[] = [];
  const holmCandidates: { endpoint: string; pValue: number }[] = [];
  for (const row of rows) {
    hardRunnerGates(row.adaptive, reasons);
    hardRunnerGates(row.centralized, reasons);
    hardAdaptiveMetricGates(row.adaptive, reasons);
  }

  for (const stratum of ["nominal", "benign"] as const) {
    const group = rows.filter((row) => row.stratum === stratum);
    const successes = group.filter((row) => row.adaptive.missionSuccess).length;
    const descriptive = collectiveNormativeWilson95V1(successes, 60);
    const acceptanceLower = collectiveNormativeWilsonLower95V1(successes, 60);
    const threshold = stratum === "nominal" ? 0.95 : 0.9;
    endpoints.push(
      Object.freeze({
        endpoint: `${stratum}.adaptiveMissionSuccess`,
        stratum,
        numerator: successes,
        denominator: 60,
        descriptiveWilsonTwoSided95: descriptive,
        acceptanceWilsonOneSided95Lower: acceptanceLower,
        threshold,
        method: "wilson-score-one-sided-v1",
        z: Z_ONE_SIDED_95,
      }),
    );
    if (acceptanceLower < threshold)
      reasons.add("normative_wilson_threshold_not_met");
    const deltas = group.map(
      (row) =>
        Number(row.adaptive.missionSuccess) -
        Number(row.centralized.missionSuccess),
    );
    const bootstrap = pairedBootstrap(
      deltas,
      input.aggregationSeed,
      `${stratum}:paired-success:margin:-0.05`,
    );
    endpoints.push(
      Object.freeze({
        endpoint: `${stratum}.pairedSuccess`,
        stratum,
        rawDeltas: Object.freeze(deltas),
        bootstrap,
        lowerThreshold: -0.05,
      }),
    );
    holmCandidates.push({
      endpoint: `${stratum}.pairedSuccess`,
      pValue: bootstrap.oneSidedPValue,
    });
    if (bootstrap.lower < -0.05)
      reasons.add("normative_paired_lower_bound_not_met");
    if (stratum === "benign") recoveryAndConvergence(group, endpoints, reasons);
  }

  for (const stratum of ["adversarial", "mixed"] as const) {
    const group = rows.filter((row) => row.stratum === stratum);
    endpoints.push(
      Object.freeze({
        endpoint: `${stratum}.reportOnly`,
        stratum,
        denominator: 60,
        adaptiveSuccesses: group.filter((row) => row.adaptive.missionSuccess)
          .length,
        centralizedSuccesses: group.filter(
          (row) => row.centralized.missionSuccess,
        ).length,
        claim: "report_only",
      }),
    );
  }
  const holmTests = holm(holmCandidates);
  endpoints.push(
    Object.freeze({
      endpoint: "holm.fixedFamily",
      alpha: 0.05,
      family: COLLECTIVE_NORMATIVE_HOLM_FAMILY_V1,
      orderRule: "p_ascending_then_endpoint_ascii-v1",
      tests: holmTests,
    }),
  );
  if (
    holmTests.length !== 2 ||
    holmTests.some((test) => test.rejected !== true)
  )
    reasons.add("normative_holm_noninferiority_not_rejected");

  const reasonCodes = [...reasons].sort(compareReasons);
  return finish(
    reasonCodes.length === 0 ? "eligible" : "ineligible",
    reasonCodes,
    endpoints,
    rows,
  );
}

function deriveRunnerRow(
  stratum: CollectiveNormativeStratumV1,
  ceiling: number,
  first: NormativeMetricProjectionV1,
  replay: NormativeMetricProjectionV1,
): CollectiveNormativeRunnerRowV1 {
  const projection = first;
  const replayExact =
    replayStableProjection(first) === replayStableProjection(replay);
  const safetyViolationCount = Object.entries(projection.safety)
    .filter(([key]) => key !== "schemaVersion")
    .reduce((sum, [, value]) => sum + (value as number), 0);
  const registered = projection.faults.registeredFamilies;
  const expected = stratum === "nominal" ? [] : [...nonNominalFaults];
  const faultCoverageValid =
    sameStrings(registered, expected) &&
    projection.faults.events.length === expected.length &&
    projection.faults.events.every(
      (event) =>
        event.injectionEventId !== null && event.observationEventId !== null,
    );
  const healthy = projection.convergence.healthyParticipantCount;
  return Object.freeze({
    runner: projection.runner,
    missionSuccess:
      projection.executionStatus === "completed" &&
      projection.validity === "valid" &&
      projection.missionOutcome === "success",
    interactionTotal: first.interactionTotal,
    interactionCeiling: ceiling,
    replayExact,
    faultCoverageValid,
    safetyViolationCount,
    recoveryInteractions: projection.recovery.interactionsToRecovery,
    convergenceAgreement:
      healthy === 0
        ? null
        : projection.convergence.agreeingParticipantCount / healthy,
    convergenceInteractionDelta: projection.convergence.interactionsToAgreement,
    roleDecisionCount: projection.roleCoherence.decisionCount,
    unsafeExecutableCount: projection.roleCoherence.unsafeExecutableCount,
    usefulRoleDecisionCount: projection.roleCoherence.usefulDecisionCount,
    projectionDigest: projection.projectionDigest,
  });
}

function recoveryAndConvergence(
  rows: readonly CollectiveNormativeCampaignRowV1[],
  endpoints: Readonly<Record<string, unknown>>[],
  reasons: Set<string>,
): void {
  const recovery = rows.map((row) => row.adaptive.recoveryInteractions);
  const finite = recovery
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  const p95 =
    finite.length === 60 ? finite[Math.ceil(0.95 * finite.length) - 1]! : null;
  endpoints.push(
    Object.freeze({
      endpoint: "benign.adaptiveRecoveryP95",
      rawValues: Object.freeze(recovery),
      p95,
      threshold: 250,
      method: "empirical-nearest-rank-v1",
    }),
  );
  if (p95 === null || p95 > 250) reasons.add("normative_recovery_p95_exceeded");
  const raw = rows.map((row) => ({
    cellId: row.cellId,
    agreement: row.adaptive.convergenceAgreement,
    interactionDelta: row.adaptive.convergenceInteractionDelta,
    deadline: Math.min(1000, 2 * row.scale),
  }));
  for (const value of raw) {
    if (value.agreement === null || value.interactionDelta === null)
      reasons.add("normative_convergence_evidence_missing");
    else if (value.agreement < 0.95 || value.interactionDelta > value.deadline)
      reasons.add("normative_convergence_deadline_exceeded");
  }
  endpoints.push(
    Object.freeze({
      endpoint: "benign.adaptiveConvergence",
      threshold: 0.95,
      deadline: "min(1000,2N)",
      raw: Object.freeze(raw),
    }),
  );
}

function hardRunnerGates(
  run: CollectiveNormativeRunnerRowV1,
  reasons: Set<string>,
): void {
  if (!run.replayExact) reasons.add("normative_replay_diverged");
  if (run.interactionTotal > run.interactionCeiling)
    reasons.add("normative_interaction_ceiling_exceeded");
  if (!run.faultCoverageValid) reasons.add("normative_fault_coverage_mismatch");
  if (run.safetyViolationCount !== 0) reasons.add("normative_safety_violation");
}

function hardAdaptiveMetricGates(
  run: CollectiveNormativeRunnerRowV1,
  reasons: Set<string>,
): void {
  if (run.roleDecisionCount !== 1000)
    reasons.add("normative_role_coherence_horizon_invalid");
  if (run.unsafeExecutableCount !== 0)
    reasons.add("normative_role_unsafe_executable");
  if (run.usefulRoleDecisionCount / 1000 < 0.7)
    reasons.add("normative_role_useful_rate_below_threshold");
}

function pairedBootstrap(
  values: readonly number[],
  seed: number,
  domain: string,
): CollectiveNormativeBootstrapV1 {
  const streamSeed = domainSeed(seed, domain);
  const state = { value: streamSeed };
  const samples: number[] = [];
  for (let b = 0; b < COLLECTIVE_NORMATIVE_ANALYSIS_RESAMPLES_V1; b += 1) {
    let total = 0;
    for (let i = 0; i < values.length; i += 1)
      total += values[nextIndex(state, values.length)]!;
    samples.push(total / values.length);
  }
  samples.sort((left, right) => left - right);
  const pointEstimate =
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const oneSidedPValue =
    (samples.filter((value) => value <= -0.05).length + 1) /
    (COLLECTIVE_NORMATIVE_ANALYSIS_RESAMPLES_V1 + 1);
  return Object.freeze({
    seed,
    streamSeed,
    domain,
    method: "paired-percentile-bootstrap-xorshift32-v1",
    nullHypothesis: "mean_delta_lte_-0.05",
    resamples: COLLECTIVE_NORMATIVE_ANALYSIS_RESAMPLES_V1,
    pointEstimate,
    lower: samples[Math.floor(0.025 * (samples.length - 1))]!,
    upper: samples[Math.floor(0.975 * (samples.length - 1))]!,
    oneSidedPValue,
  });
}

function holm(
  values: readonly { endpoint: string; pValue: number }[],
): readonly Readonly<Record<string, unknown>>[] {
  const ordered = [...values].sort(
    (left, right) =>
      left.pValue - right.pValue || ascii(left.endpoint, right.endpoint),
  );
  let continueRejecting = true;
  return Object.freeze(
    ordered.map((value, index) => {
      const threshold = 0.05 / (ordered.length - index);
      const rejected = continueRejecting && value.pValue <= threshold;
      if (!rejected) continueRejecting = false;
      return Object.freeze({ ...value, threshold, rejected });
    }),
  );
}

function validateTopLevel(input: CollectiveNormativeAnalysisInputV1): void {
  exactKeys(
    input,
    [
      "schemaVersion",
      "registration",
      "executionId",
      "aggregationSeed",
      "bootstrapResamples",
      "projections",
    ],
    "normative_analysis_input_invalid",
  );
  if (
    input.schemaVersion !== 1 ||
    !token(input.executionId) ||
    !Number.isSafeInteger(input.aggregationSeed) ||
    input.aggregationSeed < 0 ||
    input.bootstrapResamples !== COLLECTIVE_NORMATIVE_ANALYSIS_RESAMPLES_V1 ||
    !Array.isArray(input.projections) ||
    input.projections.length > 960
  )
    fail("analysis_input_invalid");
}

function hasExactClosure(
  rows: readonly CollectiveNormativeCampaignRowV1[],
): boolean {
  if (rows.length !== 240) return false;
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.cellId)) return false;
    seen.add(row.cellId);
  }
  for (const stratum of strata)
    for (const scale of scales) {
      const group = rows.filter(
        (row) => row.stratum === stratum && row.scale === scale,
      );
      const count = expectedSeeds.get(scale)!;
      if (
        group.length !== count ||
        group.some((row, index) => row.seed !== index)
      )
        return false;
    }
  return true;
}

function finish(
  decision: CollectiveNormativeAnalysisV1["decision"],
  reasonCodesInput: readonly string[],
  endpointsInput: readonly Readonly<Record<string, unknown>>[],
  rows: readonly CollectiveNormativeCampaignRowV1[],
): CollectiveNormativeAnalysisV1 {
  const reasonCodes = Object.freeze([...reasonCodesInput].sort(compareReasons));
  const endpoints = Object.freeze([...endpointsInput]);
  const body = {
    schemaVersion: 1 as const,
    decision,
    reasonCodes,
    endpoints,
    rawRows: rows,
  };
  return deepFreezePlanning({
    ...body,
    analysisDigest: digestPlanningJsonV1(
      "evaluation-campaign-artifact-v1",
      body as never,
    ),
  }) as unknown as CollectiveNormativeAnalysisV1;
}

function wilson(
  successes: number,
  denominator: number,
  z: number,
): { lower: number; upper: number } {
  const p = successes / denominator;
  const z2 = z * z;
  const divisor = 1 + z2 / denominator;
  const center = (p + z2 / (2 * denominator)) / divisor;
  const half =
    (z * Math.sqrt((p * (1 - p) + z2 / (4 * denominator)) / denominator)) /
    divisor;
  return {
    lower: Math.max(0, center - half),
    upper: Math.min(1, center + half),
  };
}

function assertBinomial(successes: number, denominator: number): void {
  integer(successes, "successes", 0);
  integer(denominator, "denominator", 1);
  if (successes > denominator) fail("wilson_numerator_invalid");
}

function domainSeed(seed: number, domain: string): number {
  let value = (seed ^ 0x9e3779b9) >>> 0;
  for (const character of domain)
    value = Math.imul(value ^ character.charCodeAt(0), 0x45d9f3b) >>> 0;
  return value || 0x6d2b79f5;
}

function random32(state: { value: number }): number {
  let value = state.value >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.value = value >>> 0;
  return state.value;
}

function nextIndex(state: { value: number }, length: number): number {
  const limit = Math.floor(0x1_0000_0000 / length) * length;
  let value: number;
  do value = random32(state);
  while (value >= limit);
  return value % length;
}

function slotKey(cellId: string, runner: string, attempt: string): string {
  return `${cellId}\0${runner}\0${attempt}`;
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function replayStableProjection(
  projection: NormativeMetricProjectionV1,
): string {
  const {
    projectionDigest: _projectionDigest,
    runKey: _runKey,
    attempt: _attempt,
    eventBinding,
    ...body
  } = projection;
  const {
    boundaryEvidenceDigest: _boundaryEvidenceDigest,
    traceDigest: _traceDigest,
    traceRoot: _traceRoot,
    monitorVerdictDigest: _monitorVerdictDigest,
    ...stableEventBinding
  } = eventBinding;
  return canonicalizePlanningJsonV1({
    ...body,
    eventBinding: stableEventBinding,
  } as never);
}

function exactKeys(
  value: unknown,
  keys: readonly string[],
  code: string,
): void {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0
  )
    throw new TypeError(code);
  const actual = Object.getOwnPropertyNames(value).sort(ascii);
  const expected = [...keys].sort(ascii);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index]) ||
    actual.some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return !descriptor || !descriptor.enumerable || !("value" in descriptor);
    })
  )
    throw new TypeError(code);
}

function integer(value: unknown, label: string, minimum: number): void {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    throw new TypeError(`${label}_invalid`);
}

function token(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/u.test(value)
  );
}

function ascii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareReasons(left: string, right: string): number {
  const leftIndex = (reasonOrder as readonly string[]).indexOf(left);
  const rightIndex = (reasonOrder as readonly string[]).indexOf(right);
  return (
    (leftIndex < 0 ? reasonOrder.length : leftIndex) -
      (rightIndex < 0 ? reasonOrder.length : rightIndex) || ascii(left, right)
  );
}

function fail(reason: string): never {
  throw new TypeError(`collective_normative_analysis_${reason}`);
}
