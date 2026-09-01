import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import {
  validateMorphogenesisOperatorOutcomeReceiptV2,
  type MorphogenesisOperatorOutcomeReceiptV2,
} from "./morphogenesis-operator-cycle.js";
import {
  validateMorphogenesisStrategyCatalogV3,
  validateMorphogenesisStrategyContextV3,
  validateMorphogenesisStrategyOutcomeMeasurementV3,
  validateMorphogenesisStrategySelectionV3,
  type MorphogenesisStrategyCatalogV3,
  type MorphogenesisStrategyContextV3,
  type MorphogenesisStrategyOutcomeMeasurementV3,
  type MorphogenesisStrategySelectionV3,
} from "./morphogenesis-strategy-adaptation.js";
import type { LocalStrategyFeedbackMetricValueV1 } from "./strategy-adaptation-contracts.js";

export interface MorphogenesisStrategyCounterfactualPolicyV3 {
  readonly schemaVersion: 3;
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly maximumCandidates: number;
  readonly minimumConfidenceBps: number;
  readonly minimumImprovementMicros: number;
  readonly regressionMarginMicros: number;
  readonly safetyFloorMicros: number;
  readonly maximumScenarioTtlMs: number;
  readonly policyDigest: PlanningDigestV1;
}

export interface MorphogenesisStrategyCounterfactualScenarioV3 {
  readonly schemaVersion: 3;
  readonly scenarioId: AgentPlatID;
  readonly context: MorphogenesisStrategyContextV3;
  readonly catalogDigest: PlanningDigestV1;
  readonly candidateStrategyIds: readonly AgentPlatID[];
  readonly simulatorId: AgentPlatID;
  readonly simulatorVersion: number;
  readonly simulatorImplementationDigest: PlanningDigestV1;
  readonly environmentDigest: PlanningDigestV1;
  readonly seedDigest: PlanningDigestV1;
  readonly interactionBudget: number;
  readonly proposedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly scenarioDigest: PlanningDigestV1;
}

export interface MorphogenesisStrategyCounterfactualEstimateV3 {
  readonly schemaVersion: 3;
  readonly scenarioDigest: PlanningDigestV1;
  readonly strategyId: AgentPlatID;
  readonly definitionDigest: PlanningDigestV1;
  readonly simulatorImplementationDigest: PlanningDigestV1;
  readonly seedDigest: PlanningDigestV1;
  readonly disposition: "success" | "failure" | "unsafe" | "indeterminate";
  readonly metrics: readonly LocalStrategyFeedbackMetricValueV1[];
  readonly confidenceBps: number;
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly interactionUnits: number;
  readonly estimatedAtLogicalMs: number;
  readonly estimateDigest: PlanningDigestV1;
}

export interface MorphogenesisStrategyCounterfactualPortV3 {
  readonly simulatorId: AgentPlatID;
  readonly simulatorVersion: number;
  readonly simulatorImplementationDigest: PlanningDigestV1;
  evaluate(input: {
    readonly scenario: MorphogenesisStrategyCounterfactualScenarioV3;
    readonly strategyId: AgentPlatID;
    readonly definitionDigest: PlanningDigestV1;
  }): Promise<MorphogenesisStrategyCounterfactualEstimateV3>;
}

export interface MorphogenesisStrategyCounterfactualReportV3 {
  readonly schemaVersion: 3;
  readonly reportId: AgentPlatID;
  readonly scenarioDigest: PlanningDigestV1;
  readonly actualSelectionDigest: PlanningDigestV1 | null;
  readonly actualOutcomeReceiptDigest: PlanningDigestV1 | null;
  readonly actualMeasurementDigest: PlanningDigestV1 | null;
  readonly estimates: readonly MorphogenesisStrategyCounterfactualEstimateV3[];
  readonly classification: "favorable" | "regression" | "damage" | "inconclusive";
  readonly recommendedAction: "retain" | "explore" | "promote" | "degrade" | "rollback" | "abstain";
  readonly recommendedStrategyId: AgentPlatID | null;
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly evaluatedAtLogicalMs: number;
  readonly advisoryOnly: true;
  readonly reportDigest: PlanningDigestV1;
}

export interface MorphogenesisStrategyCounterfactualStoreV3 {
  load(reportId: AgentPlatID): Promise<MorphogenesisStrategyCounterfactualReportV3 | null>;
  save(report: MorphogenesisStrategyCounterfactualReportV3): Promise<boolean>;
}

export function createMorphogenesisStrategyCounterfactualPolicyV3(
  input: Omit<MorphogenesisStrategyCounterfactualPolicyV3, "policyDigest">,
): MorphogenesisStrategyCounterfactualPolicyV3 {
  if (input.schemaVersion !== 3) fail("counterfactual policy version is invalid");
  const body = freeze({
    schemaVersion: 3 as const,
    policyId: id(input.policyId),
    policyVersion: positive(input.policyVersion),
    maximumCandidates: bounded(input.maximumCandidates, 1, 64),
    minimumConfidenceBps: bps(input.minimumConfidenceBps),
    minimumImprovementMicros: nonNegative(input.minimumImprovementMicros),
    regressionMarginMicros: nonNegative(input.regressionMarginMicros),
    safetyFloorMicros: integer(input.safetyFloorMicros),
    maximumScenarioTtlMs: positive(input.maximumScenarioTtlMs),
  });
  return freeze({ ...body, policyDigest: digest("morphogenesis-strategy-counterfactual-policy-v3", body) });
}

export function createMorphogenesisStrategyCounterfactualScenarioV3(input: {
  readonly scenarioId: AgentPlatID;
  readonly context: MorphogenesisStrategyContextV3;
  readonly catalog: MorphogenesisStrategyCatalogV3;
  readonly candidateStrategyIds: readonly AgentPlatID[];
  readonly simulatorId: AgentPlatID;
  readonly simulatorVersion: number;
  readonly simulatorImplementationDigest: PlanningDigestV1;
  readonly environmentDigest: PlanningDigestV1;
  readonly seedDigest: PlanningDigestV1;
  readonly interactionBudget: number;
  readonly proposedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly policy: MorphogenesisStrategyCounterfactualPolicyV3;
}): MorphogenesisStrategyCounterfactualScenarioV3 {
  const context = validateMorphogenesisStrategyContextV3(input.context);
  const catalog = validateMorphogenesisStrategyCatalogV3(input.catalog);
  const policy = validatePolicy(input.policy);
  const candidateStrategyIds = ids(input.candidateStrategyIds, policy.maximumCandidates);
  if (candidateStrategyIds.some((strategyId) =>
    !catalog.strategies.some(({ strategy }) => strategy.strategyId === strategyId)))
    fail("counterfactual candidate is not in the Morphogenesis strategy catalog");
  const body = freeze({
    schemaVersion: 3 as const,
    scenarioId: id(input.scenarioId),
    context,
    catalogDigest: catalog.catalogDigest,
    candidateStrategyIds,
    simulatorId: id(input.simulatorId),
    simulatorVersion: positive(input.simulatorVersion),
    simulatorImplementationDigest: sha(input.simulatorImplementationDigest),
    environmentDigest: sha(input.environmentDigest),
    seedDigest: sha(input.seedDigest),
    interactionBudget: positive(input.interactionBudget),
    proposedAtLogicalMs: nonNegative(input.proposedAtLogicalMs),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs),
  });
  if (body.expiresAtLogicalMs <= body.proposedAtLogicalMs ||
      body.expiresAtLogicalMs - body.proposedAtLogicalMs > policy.maximumScenarioTtlMs)
    fail("counterfactual scenario window is invalid");
  return freeze({ ...body, scenarioDigest: digest("morphogenesis-strategy-counterfactual-scenario-v3", body) });
}

export function createMorphogenesisStrategyCounterfactualEstimateV3(
  input: Omit<MorphogenesisStrategyCounterfactualEstimateV3, "schemaVersion" | "estimateDigest">,
): MorphogenesisStrategyCounterfactualEstimateV3 {
  const body = freeze({
    schemaVersion: 3 as const,
    scenarioDigest: sha(input.scenarioDigest),
    strategyId: id(input.strategyId),
    definitionDigest: sha(input.definitionDigest),
    simulatorImplementationDigest: sha(input.simulatorImplementationDigest),
    seedDigest: sha(input.seedDigest),
    disposition: one<MorphogenesisStrategyCounterfactualEstimateV3["disposition"]>(
      input.disposition, new Set(["success", "failure", "unsafe", "indeterminate"])),
    metrics: metrics(input.metrics),
    confidenceBps: bps(input.confidenceBps),
    evidenceDigests: shas(input.evidenceDigests),
    interactionUnits: nonNegative(input.interactionUnits),
    estimatedAtLogicalMs: nonNegative(input.estimatedAtLogicalMs),
  });
  return freeze({ ...body, estimateDigest: digest("morphogenesis-strategy-counterfactual-estimate-v3", body) });
}

export class MorphogenesisStrategyCounterfactualRuntimeV3 {
  readonly #policy: MorphogenesisStrategyCounterfactualPolicyV3;
  readonly #catalog: MorphogenesisStrategyCatalogV3;
  constructor(readonly options: {
    readonly policy: MorphogenesisStrategyCounterfactualPolicyV3;
    readonly catalog: MorphogenesisStrategyCatalogV3;
    readonly simulator: MorphogenesisStrategyCounterfactualPortV3;
    readonly store: MorphogenesisStrategyCounterfactualStoreV3;
  }) {
    this.#policy = validatePolicy(options.policy);
    this.#catalog = validateMorphogenesisStrategyCatalogV3(options.catalog);
    if (!options?.simulator || typeof options.simulator.evaluate !== "function" ||
        !options.store || typeof options.store.load !== "function" ||
        typeof options.store.save !== "function")
      fail("counterfactual simulator and store are required");
  }

  async evaluate(input: {
    readonly reportId: AgentPlatID;
    readonly scenario: MorphogenesisStrategyCounterfactualScenarioV3;
    readonly actual?: {
      readonly selection: MorphogenesisStrategySelectionV3;
      readonly outcome: MorphogenesisOperatorOutcomeReceiptV2;
      readonly measurement: MorphogenesisStrategyOutcomeMeasurementV3;
    };
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisStrategyCounterfactualReportV3> {
    const scenario = validateScenario(input.scenario, this.#policy, this.#catalog);
    const retained = await this.options.store.load(input.reportId);
    if (retained) {
      const report = validateMorphogenesisStrategyCounterfactualReportV3(retained);
      const actualSelectionDigest = input.actual?.selection.selectionDigest ?? null;
      if (report.scenarioDigest !== scenario.scenarioDigest ||
          report.actualSelectionDigest !== actualSelectionDigest)
        fail("counterfactual report replay diverged");
      return report;
    }
    if (scenario.expiresAtLogicalMs <= input.logicalTimeMs)
      fail("counterfactual scenario is expired");
    if (this.options.simulator.simulatorId !== scenario.simulatorId ||
        this.options.simulator.simulatorVersion !== scenario.simulatorVersion ||
        this.options.simulator.simulatorImplementationDigest !== scenario.simulatorImplementationDigest)
      fail("counterfactual simulator binding is invalid");
    const estimates: MorphogenesisStrategyCounterfactualEstimateV3[] = [];
    let interactions = 0;
    for (const strategyId of scenario.candidateStrategyIds) {
      const definition = this.#catalog.strategies.find(({ strategy }) => strategy.strategyId === strategyId)!;
      const estimate = validateEstimate(await this.options.simulator.evaluate({
        scenario,
        strategyId,
        definitionDigest: definition.definitionDigest,
      }));
      if (estimate.scenarioDigest !== scenario.scenarioDigest ||
          estimate.strategyId !== strategyId || estimate.definitionDigest !== definition.definitionDigest ||
          estimate.simulatorImplementationDigest !== scenario.simulatorImplementationDigest ||
          estimate.seedDigest !== scenario.seedDigest)
        fail("counterfactual estimate is substituted");
      interactions += estimate.interactionUnits;
      if (interactions > scenario.interactionBudget)
        fail("counterfactual interaction budget is exhausted");
      estimates.push(estimate);
    }
    const actual = input.actual ? validateActual(input.actual, scenario) : null;
    const assessment = assess(estimates, actual, this.#catalog.baselineStrategyId, this.#policy);
    const evidenceDigests = shas([
      ...estimates.map(({ estimateDigest }) => estimateDigest),
      ...(actual ? [actual.outcome.receiptDigest, actual.measurement.measurementDigest] : []),
    ]);
    const report = createMorphogenesisStrategyCounterfactualReportV3({
      reportId: id(input.reportId),
      scenarioDigest: scenario.scenarioDigest,
      actualSelectionDigest: actual?.selection.selectionDigest ?? null,
      actualOutcomeReceiptDigest: actual?.outcome.receiptDigest ?? null,
      actualMeasurementDigest: actual?.measurement.measurementDigest ?? null,
      estimates: freeze(estimates),
      classification: assessment.classification,
      recommendedAction: assessment.recommendedAction,
      recommendedStrategyId: assessment.recommendedStrategyId,
      evidenceDigests,
      evaluatedAtLogicalMs: nonNegative(input.logicalTimeMs),
    });
    if (!(await this.options.store.save(report))) {
      const raced = await this.options.store.load(report.reportId);
      if (!raced || validateMorphogenesisStrategyCounterfactualReportV3(raced).reportDigest !== report.reportDigest)
        fail("counterfactual report commit conflicts");
    }
    return report;
  }
}

export function createMorphogenesisStrategyCounterfactualReportV3(
  input: Omit<MorphogenesisStrategyCounterfactualReportV3,
    "schemaVersion" | "advisoryOnly" | "reportDigest">,
): MorphogenesisStrategyCounterfactualReportV3 {
  const estimates = input.estimates.map(validateEstimate).sort((a, b) =>
    a.strategyId.localeCompare(b.strategyId));
  if (estimates.length < 1 || estimates.length > 64 ||
      new Set(estimates.map(({ strategyId }) => strategyId)).size !== estimates.length)
    fail("counterfactual report estimates are invalid");
  const actualDigests = [input.actualSelectionDigest,
    input.actualOutcomeReceiptDigest, input.actualMeasurementDigest];
  if (actualDigests.some((value) => value === null) &&
      actualDigests.some((value) => value !== null))
    fail("counterfactual actual evidence binding is incomplete");
  const recommendedAction = one<MorphogenesisStrategyCounterfactualReportV3["recommendedAction"]>(
    input.recommendedAction,
    new Set(["retain", "explore", "promote", "degrade", "rollback", "abstain"]));
  const recommendedStrategyId = input.recommendedStrategyId === null
    ? null : id(input.recommendedStrategyId);
  if ((recommendedAction === "abstain") !== (recommendedStrategyId === null))
    fail("counterfactual report recommendation binding is invalid");
  const body = freeze({
    schemaVersion: 3 as const,
    reportId: id(input.reportId),
    scenarioDigest: sha(input.scenarioDigest),
    actualSelectionDigest: input.actualSelectionDigest === null ? null : sha(input.actualSelectionDigest),
    actualOutcomeReceiptDigest: input.actualOutcomeReceiptDigest === null ? null : sha(input.actualOutcomeReceiptDigest),
    actualMeasurementDigest: input.actualMeasurementDigest === null ? null : sha(input.actualMeasurementDigest),
    estimates: freeze(estimates),
    classification: one<MorphogenesisStrategyCounterfactualReportV3["classification"]>(
      input.classification, new Set(["favorable", "regression", "damage", "inconclusive"])),
    recommendedAction,
    recommendedStrategyId,
    evidenceDigests: shas(input.evidenceDigests),
    evaluatedAtLogicalMs: nonNegative(input.evaluatedAtLogicalMs),
    advisoryOnly: true as const,
  });
  return freeze({ ...body,
    reportDigest: digest("morphogenesis-strategy-counterfactual-report-v3", body) });
}

export function validateMorphogenesisStrategyCounterfactualReportV3(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("counterfactual report is invalid");
  const value = input as MorphogenesisStrategyCounterfactualReportV3;
  const { schemaVersion: _schema, advisoryOnly: _advisory, reportDigest, ...body } = value;
  const rebuilt = createMorphogenesisStrategyCounterfactualReportV3(body);
  if (value.schemaVersion !== 3 || value.advisoryOnly !== true ||
      reportDigest !== rebuilt.reportDigest)
    fail("counterfactual report digest is invalid");
  return rebuilt;
}

export class InMemoryMorphogenesisStrategyCounterfactualStoreV3
  implements MorphogenesisStrategyCounterfactualStoreV3
{
  readonly #reports = new Map<string, MorphogenesisStrategyCounterfactualReportV3>();
  async load(reportId: AgentPlatID) {
    const value = this.#reports.get(reportId);
    return value ? freeze(structuredClone(value)) : null;
  }
  async save(input: MorphogenesisStrategyCounterfactualReportV3) {
    const report = validateMorphogenesisStrategyCounterfactualReportV3(input);
    const current = this.#reports.get(report.reportId);
    if (current) return current.reportDigest === report.reportDigest;
    this.#reports.set(report.reportId, report);
    return true;
  }
}

export class DeterministicMorphogenesisStrategyCounterfactualPortV3
  implements MorphogenesisStrategyCounterfactualPortV3
{
  readonly #estimates: ReadonlyMap<string, MorphogenesisStrategyCounterfactualEstimateV3>;
  constructor(readonly input: {
    readonly simulatorId: AgentPlatID;
    readonly simulatorVersion: number;
    readonly simulatorImplementationDigest: PlanningDigestV1;
    readonly estimates: readonly MorphogenesisStrategyCounterfactualEstimateV3[];
  }) {
    this.simulatorId = id(input.simulatorId);
    this.simulatorVersion = positive(input.simulatorVersion);
    this.simulatorImplementationDigest = sha(input.simulatorImplementationDigest);
    this.#estimates = new Map(input.estimates.map((estimate) => {
      const valid = validateEstimate(estimate);
      return [`${valid.scenarioDigest}:${valid.strategyId}`, valid];
    }));
  }
  readonly simulatorId: AgentPlatID;
  readonly simulatorVersion: number;
  readonly simulatorImplementationDigest: PlanningDigestV1;
  async evaluate(input: { readonly scenario: MorphogenesisStrategyCounterfactualScenarioV3; readonly strategyId: AgentPlatID }) {
    const estimate = this.#estimates.get(`${input.scenario.scenarioDigest}:${input.strategyId}`);
    if (!estimate) fail("deterministic counterfactual estimate is unavailable");
    return estimate;
  }
}

function assess(estimates: readonly MorphogenesisStrategyCounterfactualEstimateV3[], actual: ReturnType<typeof validateActual> | null, baselineId: AgentPlatID, policy: MorphogenesisStrategyCounterfactualPolicyV3) {
  const eligible = estimates.filter((item) => item.disposition === "success" &&
    item.confidenceBps >= policy.minimumConfidenceBps && metric(item.metrics, "safety") >= policy.safetyFloorMicros);
  const leader = [...eligible].sort((a, b) => score(b.metrics) - score(a.metrics) || a.strategyId.localeCompare(b.strategyId))[0] ?? null;
  const baseline = estimates.find(({ strategyId }) => strategyId === baselineId) ?? null;
  if (actual?.outcome.disposition === "successor_recovery_required" ||
      actual && metric(actual.measurement.metrics, "safety") < policy.safetyFloorMicros)
    return { classification: "damage" as const, recommendedAction: "rollback" as const,
      recommendedStrategyId: baseline?.strategyId ?? null };
  if (actual && baseline && score(baseline.metrics) - score(actual.measurement.metrics) >= policy.regressionMarginMicros)
    return { classification: "regression" as const, recommendedAction: "degrade" as const,
      recommendedStrategyId: baseline.strategyId };
  if (!leader) return { classification: "inconclusive" as const,
    recommendedAction: "abstain" as const, recommendedStrategyId: null };
  if (actual) {
    const selected = actual.selection.decision.selectedStrategyId;
    if (leader.strategyId === selected)
      return { classification: "favorable" as const, recommendedAction: "retain" as const,
        recommendedStrategyId: selected };
    if (score(leader.metrics) - score(actual.measurement.metrics) >= policy.minimumImprovementMicros)
      return { classification: "favorable" as const, recommendedAction: "promote" as const,
        recommendedStrategyId: leader.strategyId };
  }
  return { classification: "inconclusive" as const, recommendedAction: "explore" as const,
    recommendedStrategyId: leader.strategyId };
}
function validateActual(value: { readonly selection: MorphogenesisStrategySelectionV3; readonly outcome: MorphogenesisOperatorOutcomeReceiptV2; readonly measurement: MorphogenesisStrategyOutcomeMeasurementV3 }, scenario: MorphogenesisStrategyCounterfactualScenarioV3) { const selection = validateMorphogenesisStrategySelectionV3(value.selection); const outcome = validateMorphogenesisOperatorOutcomeReceiptV2(value.outcome); const measurement = validateMorphogenesisStrategyOutcomeMeasurementV3(value.measurement); if (selection.context.contextDigest !== scenario.context.contextDigest || measurement.selectionDigest !== selection.selectionDigest || measurement.operatorOutcomeReceiptDigest !== outcome.receiptDigest) fail("counterfactual actual outcome binding is invalid"); return { selection, outcome, measurement }; }
function validatePolicy(value: MorphogenesisStrategyCounterfactualPolicyV3) { const { policyDigest, ...body } = value; const rebuilt = createMorphogenesisStrategyCounterfactualPolicyV3(body); if (policyDigest !== rebuilt.policyDigest) fail("counterfactual policy digest is invalid"); return rebuilt; }
function validateScenario(value: MorphogenesisStrategyCounterfactualScenarioV3, policy: MorphogenesisStrategyCounterfactualPolicyV3, catalog: MorphogenesisStrategyCatalogV3) { const { schemaVersion: _schema, scenarioDigest, ...body } = value; const rebuilt = createMorphogenesisStrategyCounterfactualScenarioV3({ ...body, catalog, policy }); if (value.schemaVersion !== 3 || scenarioDigest !== rebuilt.scenarioDigest) fail("counterfactual scenario digest is invalid"); return rebuilt; }
function validateEstimate(value: MorphogenesisStrategyCounterfactualEstimateV3) { const { schemaVersion: _schema, estimateDigest, ...body } = value; const rebuilt = createMorphogenesisStrategyCounterfactualEstimateV3(body); if (value.schemaVersion !== 3 || estimateDigest !== rebuilt.estimateDigest) fail("counterfactual estimate digest is invalid"); return rebuilt; }
function metrics(values: readonly LocalStrategyFeedbackMetricValueV1[]) { const result = values.map((item) => freeze({ schemaVersion: 1 as const, metric: item.metric, valueMicros: integer(item.valueMicros) })).sort((a, b) => a.metric.localeCompare(b.metric)); const expected = ["latency_efficiency", "mission_progress", "recovery_quality", "resource_efficiency", "safety"]; if (JSON.stringify(result.map(({ metric }) => metric)) !== JSON.stringify(expected)) fail("counterfactual metrics are invalid"); return freeze(result); }
function metric(values: readonly LocalStrategyFeedbackMetricValueV1[], name: string) { return values.find(({ metric }) => metric === name)?.valueMicros ?? 0; } function score(values: readonly LocalStrategyFeedbackMetricValueV1[]) { return values.reduce((sum, item) => sum + item.valueMicros, 0); }
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+=-]{0,255}$/u; const SHA = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown): AgentPlatID { if (typeof value !== "string" || !ID.test(value)) fail("counterfactual ID is invalid"); return value as AgentPlatID; } function sha(value: unknown): PlanningDigestV1 { if (typeof value !== "string" || !SHA.test(value)) fail("counterfactual digest is invalid"); return value as PlanningDigestV1; } function positive(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 1) fail("counterfactual positive integer is invalid"); return value as number; } function nonNegative(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0) fail("counterfactual non-negative integer is invalid"); return value as number; } function integer(value: unknown): number { if (!Number.isSafeInteger(value)) fail("counterfactual metric is invalid"); return value as number; } function bounded(value: unknown, minimum: number, maximum: number) { const result = positive(value); if (result < minimum || result > maximum) fail("counterfactual bound is invalid"); return result; } function bps(value: unknown) { const result = nonNegative(value); if (result > 10_000) fail("counterfactual basis points are invalid"); return result; } function one<T extends string>(value: unknown, allowed: ReadonlySet<string>): T { if (typeof value !== "string" || !allowed.has(value)) fail("counterfactual disposition is invalid"); return value as T; } function ids(values: readonly AgentPlatID[], maximum: number) { const result = [...new Set(values.map(id))].sort(); if (result.length < 1 || result.length > maximum || result.length !== values.length) fail("counterfactual strategy IDs are invalid"); return freeze(result); } function shas(values: readonly unknown[]) { const result = [...new Set(values.map(sha))].sort(); if (result.length < 1 || result.length > 256) fail("counterfactual evidence is invalid"); return freeze(result); } function digest(domain: string, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain as never, value as PlanningJson); } function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value as Record<string, unknown>)) freeze(item); } return value; } function fail(message: string): never { throw new TypeError(message); }
