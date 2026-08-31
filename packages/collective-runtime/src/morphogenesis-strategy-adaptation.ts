import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import type { MorphogenesisOperatorV1 } from "./morphogenesis-contracts.js";
import {
  validateMorphogenesisOperatorOutcomeReceiptV2,
  type MorphogenesisOperatorOutcomeReceiptV2,
} from "./morphogenesis-operator-cycle.js";
import type {
  LocalStrategyCatalogV1,
  LocalStrategyDefinitionV1,
  LocalStrategyFeedbackMetricValueV1,
  LocalStrategyFeedbackSignalV1,
  LocalStrategyScopeV1,
  LocalStrategySelectionDecisionV1,
  LocalStrategySelectionRequestV1,
} from "./strategy-adaptation-contracts.js";
import {
  createLocalStrategyFeedbackSignalV1,
  createLocalStrategySelectionRequestV1,
  validateLocalStrategyCatalogV1,
  validateLocalStrategyDefinitionV1,
  validateLocalStrategySelectionDecisionV1,
} from "./strategy-adaptation-runtime.js";

export interface MorphogenesisStrategyDefinitionV3 {
  readonly schemaVersion: 3;
  readonly strategy: LocalStrategyDefinitionV1;
  readonly morphogenesisPolicyDigest: PlanningDigestV1;
  readonly blueprintCatalogDigest: PlanningDigestV1;
  readonly proposalGeneratorDigest: PlanningDigestV1;
  readonly supportedOperators: readonly MorphogenesisOperatorV1[];
  readonly definitionDigest: PlanningDigestV1;
}

export interface MorphogenesisStrategyCatalogV3 {
  readonly schemaVersion: 3;
  readonly catalogId: AgentPlatID;
  readonly catalogVersion: number;
  readonly parentCatalogDigest: PlanningDigestV1 | null;
  readonly localCatalog: LocalStrategyCatalogV1;
  readonly strategies: readonly MorphogenesisStrategyDefinitionV3[];
  readonly baselineStrategyId: AgentPlatID;
  readonly catalogDigest: PlanningDigestV1;
}

export interface MorphogenesisStrategyContextV3 {
  readonly schemaVersion: 3;
  readonly scopeDigest: PlanningDigestV1;
  readonly morphologyEpoch: number;
  readonly currentSnapshotDigest: PlanningDigestV1;
  readonly needDigest: PlanningDigestV1;
  readonly targetDigest: PlanningDigestV1;
  readonly morphogenesisPolicyDigest: PlanningDigestV1;
  readonly riskDigest: PlanningDigestV1;
  readonly costEnvelopeDigest: PlanningDigestV1;
  readonly deadlineDigest: PlanningDigestV1;
  readonly contextDigest: PlanningDigestV1;
}

export interface MorphogenesisStrategySelectionV3 {
  readonly schemaVersion: 3;
  readonly selectionId: AgentPlatID;
  readonly context: MorphogenesisStrategyContextV3;
  readonly catalogDigest: PlanningDigestV1;
  readonly request: LocalStrategySelectionRequestV1;
  readonly decision: LocalStrategySelectionDecisionV1;
  readonly selectedDefinitionDigest: PlanningDigestV1 | null;
  readonly advisoryOnly: true;
  readonly selectionDigest: PlanningDigestV1;
}

export interface MorphogenesisStrategyExecutionBindingV3 {
  readonly schemaVersion: 3;
  readonly bindingId: AgentPlatID;
  readonly selectionDigest: PlanningDigestV1;
  readonly selectedDefinitionDigest: PlanningDigestV1;
  readonly proposalDigest: PlanningDigestV1;
  readonly planDigest: PlanningDigestV1;
  readonly generatorReceiptDigest: PlanningDigestV1;
  readonly boundAtLogicalMs: number;
  readonly bindingDigest: PlanningDigestV1;
}

export interface MorphogenesisStrategyOutcomeMeasurementV3 {
  readonly schemaVersion: 3;
  readonly measurementId: AgentPlatID;
  readonly selectionDigest: PlanningDigestV1;
  readonly executionBindingDigest: PlanningDigestV1;
  readonly operatorOutcomeReceiptDigest: PlanningDigestV1;
  readonly metrics: readonly LocalStrategyFeedbackMetricValueV1[];
  readonly confidenceBps: number;
  readonly sourceId: AgentPlatID;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
  readonly sourceRevision: number;
  readonly provenanceDigest: PlanningDigestV1;
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly observedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly measurementDigest: PlanningDigestV1;
}

export interface MorphogenesisStrategyFeedbackV3 {
  readonly schemaVersion: 3;
  readonly selectionDigest: PlanningDigestV1;
  readonly measurementDigest: PlanningDigestV1;
  readonly outcomeReceiptDigest: PlanningDigestV1;
  readonly localFeedback: LocalStrategyFeedbackSignalV1;
  readonly feedbackDigest: PlanningDigestV1;
}

export function createMorphogenesisStrategyDefinitionV3(input: {
  readonly strategy: LocalStrategyDefinitionV1;
  readonly morphogenesisPolicyDigest: PlanningDigestV1;
  readonly blueprintCatalogDigest: PlanningDigestV1;
  readonly proposalGeneratorDigest: PlanningDigestV1;
  readonly supportedOperators: readonly MorphogenesisOperatorV1[];
}): MorphogenesisStrategyDefinitionV3 {
  const strategy = validateLocalStrategyDefinitionV1(input.strategy);
  if (!strategy.operations.includes("plan_decomposition"))
    fail("Morphogenesis strategy must use the existing plan-decomposition learning operation");
  const supportedOperators = enumIds(input.supportedOperators, OPERATORS, "supported Morphogenesis operators");
  const body = freeze({
    schemaVersion: 3 as const,
    strategy,
    morphogenesisPolicyDigest: sha(input.morphogenesisPolicyDigest),
    blueprintCatalogDigest: sha(input.blueprintCatalogDigest),
    proposalGeneratorDigest: sha(input.proposalGeneratorDigest),
    supportedOperators,
  });
  return freeze({ ...body, definitionDigest: digest("morphogenesis-strategy-definition-v3", body) });
}

export function createMorphogenesisStrategyCatalogV3(input: {
  readonly catalogId: AgentPlatID;
  readonly catalogVersion: number;
  readonly parentCatalogDigest: PlanningDigestV1 | null;
  readonly localCatalog: LocalStrategyCatalogV1;
  readonly strategies: readonly MorphogenesisStrategyDefinitionV3[];
}): MorphogenesisStrategyCatalogV3 {
  const localCatalog = validateLocalStrategyCatalogV1(input.localCatalog);
  const strategies = input.strategies.map(validateDefinition).sort((a, b) =>
    a.strategy.strategyId.localeCompare(b.strategy.strategyId));
  if (strategies.length < 1 || new Set(strategies.map(({ strategy }) => strategy.strategyId)).size !== strategies.length)
    fail("Morphogenesis strategy catalog is empty or duplicated");
  for (const definition of strategies) {
    const retained = localCatalog.strategies.find(({ strategyId }) => strategyId === definition.strategy.strategyId);
    if (!retained || retained.strategyDigest !== definition.strategy.strategyDigest)
      fail("Morphogenesis strategy is not bound to the local adaptation catalog");
  }
  const baselineStrategyId = localCatalog.baselines.plan_decomposition;
  if (!strategies.some(({ strategy }) => strategy.strategyId === baselineStrategyId))
    fail("Morphogenesis strategy baseline is unavailable");
  const body = freeze({
    schemaVersion: 3 as const,
    catalogId: id(input.catalogId),
    catalogVersion: positive(input.catalogVersion),
    parentCatalogDigest: nullableSha(input.parentCatalogDigest),
    localCatalog,
    strategies: freeze(strategies),
    baselineStrategyId,
  });
  return freeze({ ...body, catalogDigest: digest("morphogenesis-strategy-catalog-v3", body) });
}

export function createMorphogenesisStrategyContextV3(
  input: Omit<MorphogenesisStrategyContextV3, "schemaVersion" | "contextDigest">,
): MorphogenesisStrategyContextV3 {
  const body = freeze({
    schemaVersion: 3 as const,
    scopeDigest: sha(input.scopeDigest),
    morphologyEpoch: positive(input.morphologyEpoch),
    currentSnapshotDigest: sha(input.currentSnapshotDigest),
    needDigest: sha(input.needDigest),
    targetDigest: sha(input.targetDigest),
    morphogenesisPolicyDigest: sha(input.morphogenesisPolicyDigest),
    riskDigest: sha(input.riskDigest),
    costEnvelopeDigest: sha(input.costEnvelopeDigest),
    deadlineDigest: sha(input.deadlineDigest),
  });
  return freeze({ ...body, contextDigest: digest("morphogenesis-strategy-context-v3", body) });
}

export function createMorphogenesisStrategySelectionRequestV3(input: {
  readonly requestId: AgentPlatID;
  readonly scope: LocalStrategyScopeV1;
  readonly context: MorphogenesisStrategyContextV3;
  readonly catalog: MorphogenesisStrategyCatalogV3;
  readonly logicalTimeMs: number;
}): LocalStrategySelectionRequestV1 {
  const catalog = validateCatalog(input.catalog);
  const context = validateContext(input.context);
  if (catalog.strategies.some(({ morphogenesisPolicyDigest }) =>
    morphogenesisPolicyDigest !== context.morphogenesisPolicyDigest))
    fail("Morphogenesis strategy catalog policy is inconsistent with context");
  return createLocalStrategySelectionRequestV1({
    schemaVersion: 1,
    requestId: input.requestId,
    operation: "plan_decomposition",
    scope: input.scope,
    logicalTimeMs: input.logicalTimeMs,
    contextDigest: context.contextDigest,
    availableStrategyIds: catalog.strategies.map(({ strategy }) => strategy.strategyId),
  });
}

export function createMorphogenesisStrategySelectionV3(input: {
  readonly selectionId: AgentPlatID;
  readonly context: MorphogenesisStrategyContextV3;
  readonly catalog: MorphogenesisStrategyCatalogV3;
  readonly request: LocalStrategySelectionRequestV1;
  readonly decision: LocalStrategySelectionDecisionV1;
}): MorphogenesisStrategySelectionV3 {
  const context = validateContext(input.context);
  const catalog = validateCatalog(input.catalog);
  const decision = validateLocalStrategySelectionDecisionV1(input.decision);
  if (decision.requestDigest !== input.request.requestDigest ||
      decision.requestId !== input.request.requestId ||
      input.request.contextDigest !== context.contextDigest ||
      decision.catalogDigest !== catalog.localCatalog.catalogDigest ||
      decision.operation !== "plan_decomposition")
    fail("Morphogenesis strategy selection is substituted");
  const selected = decision.selectedStrategyId === null
    ? null
    : catalog.strategies.find(({ strategy }) => strategy.strategyId === decision.selectedStrategyId) ?? null;
  if ((decision.selectedStrategyId === null) !== (selected === null) ||
      selected && selected.strategy.strategyDigest !== decision.selectedStrategyDigest)
    fail("Morphogenesis selected strategy is unavailable");
  const body = freeze({
    schemaVersion: 3 as const,
    selectionId: id(input.selectionId),
    context,
    catalogDigest: catalog.catalogDigest,
    request: input.request,
    decision,
    selectedDefinitionDigest: selected?.definitionDigest ?? null,
    advisoryOnly: true as const,
  });
  return freeze({ ...body, selectionDigest: digest("morphogenesis-strategy-selection-v3", body) });
}

export function createMorphogenesisStrategyOutcomeMeasurementV3(input: {
  readonly measurementId: AgentPlatID;
  readonly selection: MorphogenesisStrategySelectionV3;
  readonly executionBinding: MorphogenesisStrategyExecutionBindingV3;
  readonly outcome: MorphogenesisOperatorOutcomeReceiptV2;
  readonly metrics: readonly LocalStrategyFeedbackMetricValueV1[];
  readonly confidenceBps: number;
  readonly sourceId: AgentPlatID;
  readonly sourceVersion: number;
  readonly sourceImplementationDigest: PlanningDigestV1;
  readonly sourceRevision: number;
  readonly provenanceDigest: PlanningDigestV1;
  readonly evidenceDigests: readonly PlanningDigestV1[];
  readonly observedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
}): MorphogenesisStrategyOutcomeMeasurementV3 {
  validateSelection(input.selection);
  const executionBinding = validateExecutionBinding(input.executionBinding);
  const outcome = validateMorphogenesisOperatorOutcomeReceiptV2(input.outcome);
  if (input.selection.decision.selectedStrategyId === null)
    fail("abstained Morphogenesis strategy selection cannot receive outcome feedback");
  if (executionBinding.selectionDigest !== input.selection.selectionDigest ||
      outcome.planDigest !== executionBinding.planDigest)
    fail("Morphogenesis strategy outcome is not bound to its selected plan");
  const metrics = normalizeMetrics(input.metrics);
  const evidenceDigests = uniqueShas([
    ...input.evidenceDigests,
    ...outcome.outcomeEvidenceDigests,
    outcome.receiptDigest,
  ]);
  const body = freeze({
    schemaVersion: 3 as const,
    measurementId: id(input.measurementId),
    selectionDigest: input.selection.selectionDigest,
    executionBindingDigest: executionBinding.bindingDigest,
    operatorOutcomeReceiptDigest: outcome.receiptDigest,
    metrics,
    confidenceBps: bps(input.confidenceBps),
    sourceId: id(input.sourceId),
    sourceVersion: positive(input.sourceVersion),
    sourceImplementationDigest: sha(input.sourceImplementationDigest),
    sourceRevision: nonNegative(input.sourceRevision),
    provenanceDigest: sha(input.provenanceDigest),
    evidenceDigests,
    observedAtLogicalMs: nonNegative(input.observedAtLogicalMs),
    expiresAtLogicalMs: positive(input.expiresAtLogicalMs),
  });
  if (body.expiresAtLogicalMs <= body.observedAtLogicalMs)
    fail("Morphogenesis strategy measurement interval is invalid");
  return freeze({ ...body, measurementDigest: digest("morphogenesis-strategy-measurement-v3", body) });
}

export function createMorphogenesisStrategyExecutionBindingV3(input: {
  readonly bindingId: AgentPlatID;
  readonly selection: MorphogenesisStrategySelectionV3;
  readonly proposalDigest: PlanningDigestV1;
  readonly planDigest: PlanningDigestV1;
  readonly generatorReceiptDigest: PlanningDigestV1;
  readonly boundAtLogicalMs: number;
}): MorphogenesisStrategyExecutionBindingV3 {
  const selection = validateSelection(input.selection);
  if (!selection.selectedDefinitionDigest)
    fail("abstained Morphogenesis strategy selection cannot bind execution");
  const body = freeze({
    schemaVersion: 3 as const,
    bindingId: id(input.bindingId),
    selectionDigest: selection.selectionDigest,
    selectedDefinitionDigest: selection.selectedDefinitionDigest,
    proposalDigest: sha(input.proposalDigest),
    planDigest: sha(input.planDigest),
    generatorReceiptDigest: sha(input.generatorReceiptDigest),
    boundAtLogicalMs: nonNegative(input.boundAtLogicalMs),
  });
  return freeze({ ...body, bindingDigest: digest("morphogenesis-strategy-execution-binding-v3", body) });
}

export function createMorphogenesisStrategyFeedbackV3(input: {
  readonly feedbackId: AgentPlatID;
  readonly selection: MorphogenesisStrategySelectionV3;
  readonly outcome: MorphogenesisOperatorOutcomeReceiptV2;
  readonly measurement: MorphogenesisStrategyOutcomeMeasurementV3;
  readonly outcomeRevision: number;
}): MorphogenesisStrategyFeedbackV3 {
  const selection = validateSelection(input.selection);
  const outcome = validateMorphogenesisOperatorOutcomeReceiptV2(input.outcome);
  const measurement = validateMeasurement(input.measurement);
  const selectedStrategyId = selection.decision.selectedStrategyId;
  const selectedStrategyDigest = selection.decision.selectedStrategyDigest;
  if (!selectedStrategyId || !selectedStrategyDigest ||
      measurement.selectionDigest !== selection.selectionDigest ||
      measurement.operatorOutcomeReceiptDigest !== outcome.receiptDigest)
    fail("Morphogenesis strategy feedback binding is invalid");
  const localFeedback = createLocalStrategyFeedbackSignalV1({
    schemaVersion: 1,
    feedbackId: input.feedbackId,
    decisionId: selection.decision.decisionId,
    decisionDigest: selection.decision.decisionDigest,
    requestId: selection.request.requestId,
    requestDigest: selection.request.requestDigest,
    operation: "plan_decomposition",
    strategyId: selectedStrategyId,
    strategyDigest: selectedStrategyDigest,
    contextDigest: selection.context.contextDigest,
    outcomeId: outcome.receiptId,
    outcomeRevision: positive(input.outcomeRevision),
    outcome: mapOutcome(outcome.disposition),
    metrics: measurement.metrics,
    confidenceBps: measurement.confidenceBps,
    sourceId: measurement.sourceId,
    sourceVersion: measurement.sourceVersion,
    sourceImplementationDigest: measurement.sourceImplementationDigest,
    sourceRevision: measurement.sourceRevision,
    provenanceDigest: measurement.measurementDigest,
    observedAtLogicalMs: measurement.observedAtLogicalMs,
    expiresAtLogicalMs: measurement.expiresAtLogicalMs,
  });
  const body = freeze({
    schemaVersion: 3 as const,
    selectionDigest: selection.selectionDigest,
    measurementDigest: measurement.measurementDigest,
    outcomeReceiptDigest: outcome.receiptDigest,
    localFeedback,
  });
  return freeze({ ...body, feedbackDigest: digest("morphogenesis-strategy-feedback-v3", body) });
}

function validateDefinition(value: MorphogenesisStrategyDefinitionV3) {
  const rebuilt = createMorphogenesisStrategyDefinitionV3(value);
  if (rebuilt.definitionDigest !== value.definitionDigest) fail("Morphogenesis strategy definition digest is invalid");
  return rebuilt;
}
export function validateMorphogenesisStrategyDefinitionV3(value: MorphogenesisStrategyDefinitionV3) {
  return validateDefinition(value);
}
function validateCatalog(value: MorphogenesisStrategyCatalogV3) {
  const rebuilt = createMorphogenesisStrategyCatalogV3(value);
  if (rebuilt.catalogDigest !== value.catalogDigest) fail("Morphogenesis strategy catalog digest is invalid");
  return rebuilt;
}
export function validateMorphogenesisStrategyCatalogV3(value: MorphogenesisStrategyCatalogV3) {
  return validateCatalog(value);
}
function validateContext(value: MorphogenesisStrategyContextV3) {
  const { schemaVersion: _schema, contextDigest: _digest, ...body } = value;
  const rebuilt = createMorphogenesisStrategyContextV3(body);
  if (value.schemaVersion !== 3 || rebuilt.contextDigest !== value.contextDigest) fail("Morphogenesis strategy context is invalid");
  return rebuilt;
}
export function validateMorphogenesisStrategyContextV3(value: MorphogenesisStrategyContextV3) {
  return validateContext(value);
}
function validateSelection(value: MorphogenesisStrategySelectionV3) {
  if (!value || value.schemaVersion !== 3 || value.advisoryOnly !== true) fail("Morphogenesis strategy selection is invalid");
  const { selectionDigest, ...body } = value;
  if (selectionDigest !== digest("morphogenesis-strategy-selection-v3", body)) fail("Morphogenesis strategy selection digest is invalid");
  return value;
}
export function validateMorphogenesisStrategySelectionV3(value: MorphogenesisStrategySelectionV3) {
  return validateSelection(value);
}
function validateMeasurement(value: MorphogenesisStrategyOutcomeMeasurementV3) {
  if (!value || value.schemaVersion !== 3) fail("Morphogenesis strategy measurement is invalid");
  const { measurementDigest, ...body } = value;
  if (measurementDigest !== digest("morphogenesis-strategy-measurement-v3", body)) fail("Morphogenesis strategy measurement digest is invalid");
  return value;
}
export function validateMorphogenesisStrategyOutcomeMeasurementV3(value: MorphogenesisStrategyOutcomeMeasurementV3) {
  return validateMeasurement(value);
}
function validateExecutionBinding(value: MorphogenesisStrategyExecutionBindingV3) {
  if (!value || value.schemaVersion !== 3) fail("Morphogenesis strategy execution binding is invalid");
  const { bindingDigest, ...body } = value;
  if (bindingDigest !== digest("morphogenesis-strategy-execution-binding-v3", body)) fail("Morphogenesis strategy execution binding digest is invalid");
  return value;
}
function normalizeMetrics(values: readonly LocalStrategyFeedbackMetricValueV1[]) {
  const expected = ["latency_efficiency", "mission_progress", "recovery_quality", "resource_efficiency", "safety"];
  const metrics = values.map((item) => freeze({ schemaVersion: 1 as const, metric: item.metric, valueMicros: integer(item.valueMicros) }))
    .sort((a, b) => a.metric.localeCompare(b.metric));
  if (JSON.stringify(metrics.map(({ metric }) => metric)) !== JSON.stringify(expected))
    fail("Morphogenesis strategy measurement requires every comparable metric exactly once");
  return freeze(metrics);
}
function mapOutcome(value: MorphogenesisOperatorOutcomeReceiptV2["disposition"]): "success" | "failure" | "unsafe" | "indeterminate" {
  return value === "success" ? "success"
    : value === "successor_recovery_required" ? "unsafe"
      : value === "indeterminate" ? "indeterminate" : "failure";
}
const OPERATORS = new Set(["recruit_existing", "instantiate_agent", "derive_agent", "realign_role", "reassign_work", "replace_agent", "split_team", "merge_teams", "federate_teams", "detach_agent", "suspend_agent", "resume_agent", "retire_agent"]);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown): AgentPlatID { if (typeof value !== "string" || !ID.test(value)) fail("Morphogenesis strategy ID is invalid"); return value as AgentPlatID; }
function sha(value: unknown): PlanningDigestV1 { if (typeof value !== "string" || !SHA.test(value)) fail("Morphogenesis strategy digest is invalid"); return value as PlanningDigestV1; }
function nullableSha(value: unknown): PlanningDigestV1 | null { return value === null ? null : sha(value); }
function positive(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 1) fail("Morphogenesis strategy positive integer is invalid"); return value as number; }
function nonNegative(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0) fail("Morphogenesis strategy non-negative integer is invalid"); return value as number; }
function integer(value: unknown): number { if (!Number.isSafeInteger(value)) fail("Morphogenesis strategy metric is invalid"); return value as number; }
function bps(value: unknown): number { const result = nonNegative(value); if (result > 10_000) fail("Morphogenesis strategy confidence is invalid"); return result; }
function uniqueShas(values: readonly unknown[]): readonly PlanningDigestV1[] { const result = [...new Set(values.map(sha))].sort(); if (result.length < 1 || result.length > 256) fail("Morphogenesis strategy evidence is invalid"); return freeze(result); }
function enumIds<T extends string>(values: readonly T[], allowed: ReadonlySet<string>, label: string): readonly T[] { if (!Array.isArray(values)) fail(`${label} are invalid`); const result = [...new Set(values)].sort(); if (result.length < 1 || result.length !== values.length || result.some((item) => !allowed.has(item))) fail(`${label} are invalid`); return freeze(result); }
function digest(domain: string, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain as never, value as PlanningJson); }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value as Record<string, unknown>)) freeze(item); } return value; }
function fail(message: string): never { throw new TypeError(message); }
