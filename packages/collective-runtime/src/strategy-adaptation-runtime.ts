import type { JsonValue } from "@agentplat/core";
import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import {
  LOCAL_STRATEGY_ADAPTATION_HANDOFF_FORMAT_V1,
  LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
  LOCAL_STRATEGY_ADAPTATION_STATE_FORMAT_V1,
  LOCAL_STRATEGY_FEEDBACK_METRICS_V1,
  LOCAL_STRATEGY_OPERATIONS_V1,
  LOCAL_STRATEGY_SAFETY_DIMENSIONS_V1,
  type LocalStrategyAdaptationPolicyRecordV1,
  type LocalStrategyAdaptationPolicyV1,
  type LocalStrategyAdaptationPortV1,
  type LocalStrategyAdaptationRuntimeOptionsV1,
  type LocalStrategyAdaptationStateV1,
  type LocalStrategyAdaptationStoreV1,
  type LocalStrategyArmStateV1,
  type LocalStrategyCatalogV1,
  type LocalStrategyCollectivePriorConfigurationV1,
  type LocalStrategyCollectivePriorSourceV1,
  type LocalStrategyCollectivePriorV1,
  type LocalStrategyDefinitionV1,
  type LocalStrategyEntropyDrawV1,
  type LocalStrategyEntropyPortV1,
  type LocalStrategyFeedbackBatchV1,
  type LocalStrategyFeedbackDecisionV1,
  type LocalStrategyFeedbackHeadV1,
  type LocalStrategyFeedbackMetricPolicyV1,
  type LocalStrategyFeedbackMetricV1,
  type LocalStrategyFeedbackMetricValueV1,
  type LocalStrategyFeedbackOutcomeV1,
  type LocalStrategyFeedbackReductionInputV1,
  type LocalStrategyFeedbackReductionResultV1,
  type LocalStrategyFeedbackSignalV1,
  type LocalStrategyHandoffEnvelopeV1,
  type LocalStrategyOperationStateV1,
  type LocalStrategyOperationV1,
  type LocalStrategyPendingDecisionV1,
  type LocalStrategyProbabilityV1,
  type LocalStrategySafetyDimensionV1,
  type LocalStrategySafetyDispositionV1,
  type LocalStrategySafetyHeadV1,
  type LocalStrategySafetyResolutionPortV1,
  type LocalStrategySafetySignalSourceV1,
  type LocalStrategySafetySignalV1,
  type LocalStrategyScopeV1,
  type LocalStrategySelectionDecisionV1,
  type LocalStrategySelectionReductionInputV1,
  type LocalStrategySelectionReductionResultV1,
  type LocalStrategySelectionRequestV1,
} from "./strategy-adaptation-contracts.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_REASON_LENGTH = 128;
const MICROS = 1_000_000;
const BPS = 10_000;
const operationSet = new Set<string>(LOCAL_STRATEGY_OPERATIONS_V1);
const safetyDimensionSet = new Set<string>(LOCAL_STRATEGY_SAFETY_DIMENSIONS_V1);
const feedbackMetricSet = new Set<string>(LOCAL_STRATEGY_FEEDBACK_METRICS_V1);
const dispositionSet = new Set<string>([
  "eligible",
  "restricted",
  "ineligible",
  "unavailable",
]);
const outcomeSet = new Set<string>([
  "success",
  "failure",
  "unsafe",
  "indeterminate",
]);

const operationKeys = [...LOCAL_STRATEGY_OPERATIONS_V1];
const definitionKeys = [
  "implementationDigest",
  "operations",
  "schemaVersion",
  "strategyDigest",
  "strategyId",
  "strategyVersion",
];
const catalogKeys = [
  "baselines",
  "catalogDigest",
  "catalogId",
  "catalogVersion",
  "parentCatalogDigest",
  "schemaVersion",
  "strategies",
];
const policyKeys = [
  "baselineProbabilityFloorBps",
  "explorationRateBps",
  "feedbackMetrics",
  "feedbackSources",
  "initialWeightMicros",
  "learningRateBps",
  "limits",
  "maximumWeightMicros",
  "minimumFeedbackConfidenceBps",
  "minimumFeedbackSources",
  "minimumWeightMicros",
  "parentPolicyDigest",
  "policyId",
  "policyVersion",
  "quarantineDurationMs",
  "requiredSafetyDimensions",
  "schemaVersion",
  "unsafePenaltyBps",
];
const policyRecordKeys = ["policy", "policyDigest", "schemaVersion"];
const metricPolicyKeys = ["direction", "metric", "schemaVersion", "weight"];
const feedbackSourceKeys = [
  "schemaVersion",
  "sourceId",
  "sourceImplementationDigest",
  "sourceVersion",
];
const limitKeys = [
  "maximumCommitAttempts",
  "maximumDecisionTtlMs",
  "maximumFeedbackDelayMs",
  "maximumFeedbackHeads",
  "maximumPendingDecisions",
  "maximumReasonCodesPerSignal",
  "maximumSafetyHeads",
  "maximumSafetySignalTtlMs",
  "maximumStrategies",
];
const scopeKeys = [
  "meshId",
  "missionIntentId",
  "objectiveId",
  "policyDomainId",
  "tenantId",
  "workItemId",
  "workItemRevision",
];
const requestKeys = [
  "availableStrategyIds",
  "contextDigest",
  "logicalTimeMs",
  "operation",
  "requestDigest",
  "requestId",
  "schemaVersion",
  "scope",
];
const signalKeys = [
  "dimension",
  "disposition",
  "expiresAtLogicalMs",
  "observedAtLogicalMs",
  "reasonCodes",
  "requestDigest",
  "requestId",
  "schemaVersion",
  "signalDigest",
  "signalId",
  "sourceId",
  "sourceImplementationDigest",
  "sourceRevision",
  "sourceVersion",
  "strategyDigest",
  "strategyId",
];
const metricValueKeys = ["metric", "schemaVersion", "valueMicros"];
const feedbackSignalKeys = [
  "confidenceBps",
  "contextDigest",
  "decisionDigest",
  "decisionId",
  "expiresAtLogicalMs",
  "feedbackDigest",
  "feedbackId",
  "metrics",
  "observedAtLogicalMs",
  "operation",
  "outcome",
  "outcomeId",
  "outcomeRevision",
  "provenanceDigest",
  "requestDigest",
  "requestId",
  "schemaVersion",
  "sourceId",
  "sourceImplementationDigest",
  "sourceRevision",
  "sourceVersion",
  "strategyDigest",
  "strategyId",
];
const batchKeys = [
  "batchDigest",
  "batchId",
  "decisionDigest",
  "decisionId",
  "logicalTimeMs",
  "schemaVersion",
  "signals",
];

export function createLocalStrategyDefinitionV1(
  input: Omit<LocalStrategyDefinitionV1, "strategyDigest">,
): LocalStrategyDefinitionV1 {
  const value = record(
    input,
    definitionKeys.filter((key) => key !== "strategyDigest"),
    "local strategy definition input",
  );
  schema(value.schemaVersion, "strategy definition");
  const body = freeze({
    schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
    strategyId: id(value.strategyId, "strategy.strategyId"),
    strategyVersion: positive(
      value.strategyVersion,
      "strategy.strategyVersion",
    ),
    implementationDigest: sha(
      value.implementationDigest,
      "strategy.implementationDigest",
    ),
    operations: enumArray(
      value.operations,
      operationSet,
      "strategy.operations",
      LOCAL_STRATEGY_OPERATIONS_V1.length,
    ) as readonly LocalStrategyOperationV1[],
  });
  if (body.operations.length < 1) fail("strategy operations are empty");
  return freeze({
    ...body,
    strategyDigest: digest("local-strategy-definition", body),
  });
}

export function validateLocalStrategyDefinitionV1(
  input: unknown,
): LocalStrategyDefinitionV1 {
  const value = record(input, definitionKeys, "local strategy definition");
  const { strategyDigest, ...body } = value;
  const rebuilt = createLocalStrategyDefinitionV1(
    body as unknown as Omit<LocalStrategyDefinitionV1, "strategyDigest">,
  );
  if (strategyDigest !== rebuilt.strategyDigest)
    fail("strategy definition digest is invalid");
  return rebuilt;
}

export function createLocalStrategyCatalogV1(
  input: Omit<LocalStrategyCatalogV1, "catalogDigest">,
): LocalStrategyCatalogV1 {
  const value = record(
    input,
    catalogKeys.filter((key) => key !== "catalogDigest"),
    "local strategy catalog input",
  );
  schema(value.schemaVersion, "strategy catalog");
  if (!Array.isArray(value.strategies) || value.strategies.length < 1)
    fail("strategy catalog is empty");
  const strategies = value.strategies
    .map(validateLocalStrategyDefinitionV1)
    .sort((a, b) => compare(a.strategyId, b.strategyId));
  unique(
    strategies.map(({ strategyId }) => strategyId),
    "strategy IDs",
  );
  const baselineValue = record(
    value.baselines,
    operationKeys,
    "strategy baselines",
  );
  const baselines = Object.fromEntries(
    LOCAL_STRATEGY_OPERATIONS_V1.map((current) => [
      current,
      id(baselineValue[current], `baselines.${current}`),
    ]),
  ) as unknown as LocalStrategyCatalogV1["baselines"];
  for (const current of LOCAL_STRATEGY_OPERATIONS_V1) {
    const baseline = strategies.find(
      ({ strategyId }) => strategyId === baselines[current],
    );
    if (!baseline || !baseline.operations.includes(current))
      fail(`baseline does not support ${current}`);
  }
  const body = freeze({
    schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
    catalogId: id(value.catalogId, "catalog.catalogId"),
    catalogVersion: positive(value.catalogVersion, "catalog.catalogVersion"),
    parentCatalogDigest:
      value.parentCatalogDigest === null
        ? null
        : sha(value.parentCatalogDigest, "catalog.parentCatalogDigest"),
    strategies: freeze(strategies),
    baselines: freeze(baselines),
  });
  return freeze({
    ...body,
    catalogDigest: digest("local-strategy-catalog", body),
  });
}

export function validateLocalStrategyCatalogV1(
  input: unknown,
): LocalStrategyCatalogV1 {
  const value = record(input, catalogKeys, "local strategy catalog");
  const { catalogDigest, ...body } = value;
  const rebuilt = createLocalStrategyCatalogV1(
    body as unknown as Omit<LocalStrategyCatalogV1, "catalogDigest">,
  );
  if (catalogDigest !== rebuilt.catalogDigest)
    fail("strategy catalog digest is invalid");
  return rebuilt;
}

export function createLocalStrategyAdaptationPolicyV1(
  input: LocalStrategyAdaptationPolicyV1,
): LocalStrategyAdaptationPolicyRecordV1 {
  const policy = normalizePolicy(input);
  return freeze({
    schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
    policy,
    policyDigest: digest("local-strategy-adaptation-policy", policy),
  });
}

export function validateLocalStrategyAdaptationPolicyV1(
  input: unknown,
): LocalStrategyAdaptationPolicyRecordV1 {
  const value = record(
    input,
    policyRecordKeys,
    "strategy adaptation policy record",
  );
  schema(value.schemaVersion, "strategy adaptation policy record");
  const rebuilt = createLocalStrategyAdaptationPolicyV1(
    value.policy as unknown as LocalStrategyAdaptationPolicyV1,
  );
  if (value.policyDigest !== rebuilt.policyDigest)
    fail("strategy adaptation policy digest is invalid");
  return rebuilt;
}

export function createLocalStrategySelectionRequestV1(
  input: Omit<LocalStrategySelectionRequestV1, "requestDigest">,
): LocalStrategySelectionRequestV1 {
  const value = record(
    input,
    requestKeys.filter((key) => key !== "requestDigest"),
    "local strategy selection request input",
  );
  schema(value.schemaVersion, "strategy selection request");
  const body = freeze({
    schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
    requestId: id(value.requestId, "request.requestId"),
    operation: operation(value.operation),
    scope: normalizeScope(value.scope),
    logicalTimeMs: nonNegative(value.logicalTimeMs, "request.logicalTimeMs"),
    contextDigest: sha(value.contextDigest, "request.contextDigest"),
    availableStrategyIds: ids(
      value.availableStrategyIds,
      "request.availableStrategyIds",
      256,
    ),
  });
  if (body.availableStrategyIds.length < 1)
    fail("selection request has no available strategies");
  return freeze({
    ...body,
    requestDigest: digest("local-strategy-selection-request", body),
  });
}

export function validateLocalStrategySelectionRequestV1(
  input: unknown,
): LocalStrategySelectionRequestV1 {
  const value = record(input, requestKeys, "local strategy selection request");
  const { requestDigest, ...body } = value;
  const rebuilt = createLocalStrategySelectionRequestV1(
    body as unknown as Omit<LocalStrategySelectionRequestV1, "requestDigest">,
  );
  if (requestDigest !== rebuilt.requestDigest)
    fail("strategy selection request digest is invalid");
  return rebuilt;
}

export function createLocalStrategySafetySignalV1(
  input: Omit<LocalStrategySafetySignalV1, "signalDigest">,
): LocalStrategySafetySignalV1 {
  const value = record(
    input,
    signalKeys.filter((key) => key !== "signalDigest"),
    "local strategy safety signal input",
  );
  schema(value.schemaVersion, "strategy safety signal");
  const body = freeze({
    schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
    signalId: id(value.signalId, "signal.signalId"),
    requestId: id(value.requestId, "signal.requestId"),
    requestDigest: sha(value.requestDigest, "signal.requestDigest"),
    strategyId: id(value.strategyId, "signal.strategyId"),
    strategyDigest: sha(value.strategyDigest, "signal.strategyDigest"),
    dimension: safetyDimension(value.dimension),
    disposition: disposition(value.disposition),
    sourceId: id(value.sourceId, "signal.sourceId"),
    sourceVersion: positive(value.sourceVersion, "signal.sourceVersion"),
    sourceImplementationDigest: sha(
      value.sourceImplementationDigest,
      "signal.sourceImplementationDigest",
    ),
    sourceRevision: nonNegative(value.sourceRevision, "signal.sourceRevision"),
    reasonCodes: reasons(value.reasonCodes, 64),
    observedAtLogicalMs: nonNegative(
      value.observedAtLogicalMs,
      "signal.observedAtLogicalMs",
    ),
    expiresAtLogicalMs: positive(
      value.expiresAtLogicalMs,
      "signal.expiresAtLogicalMs",
    ),
  });
  if (body.expiresAtLogicalMs <= body.observedAtLogicalMs)
    fail("strategy safety signal interval is invalid");
  return freeze({
    ...body,
    signalDigest: digest("local-strategy-safety-signal", body),
  });
}

export function validateLocalStrategySafetySignalV1(
  input: unknown,
): LocalStrategySafetySignalV1 {
  const value = record(input, signalKeys, "local strategy safety signal");
  const { signalDigest, ...body } = value;
  const rebuilt = createLocalStrategySafetySignalV1(
    body as unknown as Omit<LocalStrategySafetySignalV1, "signalDigest">,
  );
  if (signalDigest !== rebuilt.signalDigest)
    fail("strategy safety signal digest is invalid");
  return rebuilt;
}

export function createLocalStrategyFeedbackSignalV1(
  input: Omit<LocalStrategyFeedbackSignalV1, "feedbackDigest">,
): LocalStrategyFeedbackSignalV1 {
  const value = record(
    input,
    feedbackSignalKeys.filter((key) => key !== "feedbackDigest"),
    "local strategy feedback signal input",
  );
  schema(value.schemaVersion, "strategy feedback signal");
  const metrics = normalizeMetricValues(value.metrics);
  const body = freeze({
    schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
    feedbackId: id(value.feedbackId, "feedback.feedbackId"),
    decisionId: id(value.decisionId, "feedback.decisionId"),
    decisionDigest: sha(value.decisionDigest, "feedback.decisionDigest"),
    requestId: id(value.requestId, "feedback.requestId"),
    requestDigest: sha(value.requestDigest, "feedback.requestDigest"),
    operation: operation(value.operation),
    strategyId: id(value.strategyId, "feedback.strategyId"),
    strategyDigest: sha(value.strategyDigest, "feedback.strategyDigest"),
    contextDigest: sha(value.contextDigest, "feedback.contextDigest"),
    outcomeId: id(value.outcomeId, "feedback.outcomeId"),
    outcomeRevision: positive(
      value.outcomeRevision,
      "feedback.outcomeRevision",
    ),
    outcome: feedbackOutcome(value.outcome),
    metrics,
    confidenceBps: basisPoints(value.confidenceBps, "feedback.confidenceBps"),
    sourceId: id(value.sourceId, "feedback.sourceId"),
    sourceVersion: positive(value.sourceVersion, "feedback.sourceVersion"),
    sourceImplementationDigest: sha(
      value.sourceImplementationDigest,
      "feedback.sourceImplementationDigest",
    ),
    sourceRevision: nonNegative(
      value.sourceRevision,
      "feedback.sourceRevision",
    ),
    provenanceDigest: sha(value.provenanceDigest, "feedback.provenanceDigest"),
    observedAtLogicalMs: nonNegative(
      value.observedAtLogicalMs,
      "feedback.observedAtLogicalMs",
    ),
    expiresAtLogicalMs: positive(
      value.expiresAtLogicalMs,
      "feedback.expiresAtLogicalMs",
    ),
  });
  if (body.expiresAtLogicalMs <= body.observedAtLogicalMs)
    fail("strategy feedback interval is invalid");
  return freeze({
    ...body,
    feedbackDigest: digest("local-strategy-feedback-signal", body),
  });
}

export function validateLocalStrategyFeedbackSignalV1(
  input: unknown,
): LocalStrategyFeedbackSignalV1 {
  const value = record(
    input,
    feedbackSignalKeys,
    "local strategy feedback signal",
  );
  const { feedbackDigest, ...body } = value;
  const rebuilt = createLocalStrategyFeedbackSignalV1(
    body as unknown as Omit<LocalStrategyFeedbackSignalV1, "feedbackDigest">,
  );
  if (feedbackDigest !== rebuilt.feedbackDigest)
    fail("strategy feedback signal digest is invalid");
  return rebuilt;
}

export function createLocalStrategyFeedbackBatchV1(
  input: Omit<LocalStrategyFeedbackBatchV1, "batchDigest">,
): LocalStrategyFeedbackBatchV1 {
  const value = record(
    input,
    batchKeys.filter((key) => key !== "batchDigest"),
    "local strategy feedback batch input",
  );
  schema(value.schemaVersion, "strategy feedback batch");
  if (
    !Array.isArray(value.signals) ||
    value.signals.length < 1 ||
    value.signals.length > 64
  )
    fail("strategy feedback batch signals are invalid");
  const signals = value.signals
    .map(validateLocalStrategyFeedbackSignalV1)
    .sort(feedbackSignalOrder);
  unique(
    signals.map(({ sourceId }) => sourceId),
    "feedback source IDs",
  );
  const decisionId = id(value.decisionId, "batch.decisionId");
  const decisionDigest = sha(value.decisionDigest, "batch.decisionDigest");
  if (
    signals.some(
      (signal) =>
        signal.decisionId !== decisionId ||
        signal.decisionDigest !== decisionDigest,
    )
  )
    fail("feedback batch decision binding is invalid");
  const body = freeze({
    schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
    batchId: id(value.batchId, "batch.batchId"),
    decisionId,
    decisionDigest,
    logicalTimeMs: nonNegative(value.logicalTimeMs, "batch.logicalTimeMs"),
    signals: freeze(signals),
  });
  return freeze({
    ...body,
    batchDigest: digest("local-strategy-feedback-batch", body),
  });
}

export function validateLocalStrategyFeedbackBatchV1(
  input: unknown,
): LocalStrategyFeedbackBatchV1 {
  const value = record(input, batchKeys, "local strategy feedback batch");
  const { batchDigest, ...body } = value;
  const rebuilt = createLocalStrategyFeedbackBatchV1(
    body as unknown as Omit<LocalStrategyFeedbackBatchV1, "batchDigest">,
  );
  if (batchDigest !== rebuilt.batchDigest)
    fail("strategy feedback batch digest is invalid");
  return rebuilt;
}

const armKeys = [
  "cumulativeRewardMicros",
  "feedbackCount",
  "operation",
  "quarantinedUntilLogicalMs",
  "schemaVersion",
  "selectionCount",
  "strategyDigest",
  "strategyId",
  "unsafeCount",
  "weightMicros",
];
const operationStateKeys = [
  "baselineOnlyUntilLogicalMs",
  "operation",
  "paused",
  "schemaVersion",
];
const pendingKeys = [
  "contextDigest",
  "decisionDigest",
  "decisionId",
  "feedbackExpiresAtLogicalMs",
  "operation",
  "requestDigest",
  "requestId",
  "schemaVersion",
  "selectedAtLogicalMs",
  "strategyDigest",
  "strategyId",
];
const safetyHeadKeys = [
  "dimension",
  "expiresAtLogicalMs",
  "headKey",
  "schemaVersion",
  "signalDigest",
  "sourceId",
  "sourceImplementationDigest",
  "sourceRevision",
  "sourceVersion",
  "strategyId",
];
const feedbackHeadKeys = [
  "decisionDigest",
  "feedbackDigest",
  "headKey",
  "outcomeId",
  "schemaVersion",
  "sourceId",
  "sourceImplementationDigest",
  "sourceRevision",
  "sourceVersion",
];
const stateKeys = [
  "arms",
  "catalogDigest",
  "catalogId",
  "catalogVersion",
  "controllerId",
  "controllerVersion",
  "entropyCounter",
  "entropyId",
  "entropyImplementationDigest",
  "entropyVersion",
  "feedbackHeads",
  "format",
  "implementationId",
  "lastDecisionDigest",
  "logicalTimeHighWaterMs",
  "operations",
  "pendingDecisions",
  "policyDigest",
  "policyId",
  "policyVersion",
  "predecessorStateDigest",
  "revision",
  "safetyHeads",
  "schemaVersion",
  "stateDigest",
  "stateKey",
];
const probabilityKeys = [
  "priorDigests",
  "probabilityBps",
  "schemaVersion",
  "signalDigests",
  "strategyDigest",
  "strategyId",
];
const selectionDecisionKeys = [
  "baselineStrategyId",
  "catalogDigest",
  "catalogId",
  "catalogVersion",
  "committedStateRevision",
  "controllerId",
  "controllerVersion",
  "decisionDigest",
  "decisionId",
  "entropyEvidenceDigest",
  "entropyId",
  "entropyImplementationDigest",
  "entropyVersion",
  "evaluatedAtLogicalMs",
  "expiresAtLogicalMs",
  "implementationId",
  "mode",
  "operation",
  "policyDigest",
  "policyId",
  "policyVersion",
  "priorStateRevision",
  "probabilities",
  "reasonCodes",
  "requestDigest",
  "requestId",
  "schemaVersion",
  "selectedStrategyDigest",
  "selectedStrategyId",
  "drawBps",
];
const feedbackDecisionKeys = [
  "batchDigest",
  "batchId",
  "committedStateRevision",
  "decisionDigest",
  "decisionId",
  "feedbackDecisionDigest",
  "feedbackDecisionId",
  "outcome",
  "priorStateRevision",
  "reasonCodes",
  "rewardMicros",
  "schemaVersion",
  "status",
];
const handoffKeys = [
  "catalogDigest",
  "contentClass",
  "controllerId",
  "controllerVersion",
  "entropyImplementationDigest",
  "exportedAtLogicalMs",
  "format",
  "handoffDigest",
  "implementationId",
  "policyDigest",
  "schemaVersion",
  "sourceState",
  "sourceStateDigest",
  "sourceStateKey",
  "targetStateKey",
];

export function createLocalStrategyAdaptationStateV1(input: {
  readonly stateKey: string;
  readonly controllerId: string;
  readonly controllerVersion: number;
  readonly implementationId: string;
  readonly policy: LocalStrategyAdaptationPolicyRecordV1;
  readonly catalog: LocalStrategyCatalogV1;
  readonly entropy: Pick<
    LocalStrategyEntropyPortV1,
    "entropyId" | "entropyVersion" | "entropyImplementationDigest"
  >;
  readonly revision?: number;
  readonly logicalTimeHighWaterMs?: number;
  readonly entropyCounter?: number;
  readonly arms?: readonly LocalStrategyArmStateV1[];
  readonly operations?: readonly LocalStrategyOperationStateV1[];
  readonly pendingDecisions?: readonly LocalStrategyPendingDecisionV1[];
  readonly safetyHeads?: readonly LocalStrategySafetyHeadV1[];
  readonly feedbackHeads?: readonly LocalStrategyFeedbackHeadV1[];
  readonly predecessorStateDigest?: PlanningDigestV1 | null;
  readonly lastDecisionDigest?: PlanningDigestV1 | null;
}): LocalStrategyAdaptationStateV1 {
  const policy = validateLocalStrategyAdaptationPolicyV1(input.policy);
  const catalog = validateLocalStrategyCatalogV1(input.catalog);
  assertCatalogPolicy(catalog, policy);
  const entropy = normalizeEntropyBinding(input.entropy);
  const arms = input.arms
    ? normalizeArms(input.arms, catalog, policy)
    : initialArms(catalog, policy);
  const operations = input.operations
    ? normalizeOperationStates(input.operations)
    : freeze(
        LOCAL_STRATEGY_OPERATIONS_V1.map((current) =>
          freeze({
            schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
            operation: current,
            paused: false,
            baselineOnlyUntilLogicalMs: 0,
          }),
        ).sort((left, right) => compare(left.operation, right.operation)),
      );
  const pendingDecisions = normalizePending(
    input.pendingDecisions ?? [],
    policy.policy.limits.maximumPendingDecisions,
  );
  const safetyHeads = normalizeSafetyHeads(
    input.safetyHeads ?? [],
    policy.policy.limits.maximumSafetyHeads,
  );
  const feedbackHeads = normalizeFeedbackHeads(
    input.feedbackHeads ?? [],
    policy.policy.limits.maximumFeedbackHeads,
  );
  const body = freeze({
    format: LOCAL_STRATEGY_ADAPTATION_STATE_FORMAT_V1,
    schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
    stateKey: id(input.stateKey, "state.stateKey"),
    controllerId: id(input.controllerId, "state.controllerId"),
    controllerVersion: positive(
      input.controllerVersion,
      "state.controllerVersion",
    ),
    implementationId: id(input.implementationId, "state.implementationId"),
    policyId: policy.policy.policyId,
    policyVersion: policy.policy.policyVersion,
    policyDigest: policy.policyDigest,
    catalogId: catalog.catalogId,
    catalogVersion: catalog.catalogVersion,
    catalogDigest: catalog.catalogDigest,
    entropyId: entropy.entropyId,
    entropyVersion: entropy.entropyVersion,
    entropyImplementationDigest: entropy.entropyImplementationDigest,
    revision: nonNegative(input.revision ?? 0, "state.revision"),
    logicalTimeHighWaterMs: nonNegative(
      input.logicalTimeHighWaterMs ?? 0,
      "state.logicalTimeHighWaterMs",
    ),
    entropyCounter: nonNegative(
      input.entropyCounter ?? 0,
      "state.entropyCounter",
    ),
    arms,
    operations,
    pendingDecisions,
    safetyHeads,
    feedbackHeads,
    predecessorStateDigest:
      input.predecessorStateDigest === undefined ||
      input.predecessorStateDigest === null
        ? null
        : sha(input.predecessorStateDigest, "state.predecessorStateDigest"),
    lastDecisionDigest:
      input.lastDecisionDigest === undefined ||
      input.lastDecisionDigest === null
        ? null
        : sha(input.lastDecisionDigest, "state.lastDecisionDigest"),
  });
  return freeze({
    ...body,
    stateDigest: digest("local-strategy-adaptation-state", body),
  });
}

export function validateLocalStrategyAdaptationStateV1(
  input: unknown,
  expected: {
    readonly policy: LocalStrategyAdaptationPolicyRecordV1;
    readonly catalog: LocalStrategyCatalogV1;
    readonly entropy: Pick<
      LocalStrategyEntropyPortV1,
      "entropyId" | "entropyVersion" | "entropyImplementationDigest"
    >;
  },
): LocalStrategyAdaptationStateV1 {
  const value = record(input, stateKeys, "local strategy adaptation state");
  if (value.format !== LOCAL_STRATEGY_ADAPTATION_STATE_FORMAT_V1)
    fail("strategy adaptation state format is invalid");
  schema(value.schemaVersion, "strategy adaptation state");
  const rebuilt = createLocalStrategyAdaptationStateV1({
    stateKey: value.stateKey as string,
    controllerId: value.controllerId as string,
    controllerVersion: value.controllerVersion as number,
    implementationId: value.implementationId as string,
    policy: expected.policy,
    catalog: expected.catalog,
    entropy: expected.entropy,
    revision: value.revision as number,
    logicalTimeHighWaterMs: value.logicalTimeHighWaterMs as number,
    entropyCounter: value.entropyCounter as number,
    arms: value.arms as unknown as readonly LocalStrategyArmStateV1[],
    operations:
      value.operations as unknown as readonly LocalStrategyOperationStateV1[],
    pendingDecisions:
      value.pendingDecisions as unknown as readonly LocalStrategyPendingDecisionV1[],
    safetyHeads:
      value.safetyHeads as unknown as readonly LocalStrategySafetyHeadV1[],
    feedbackHeads:
      value.feedbackHeads as unknown as readonly LocalStrategyFeedbackHeadV1[],
    predecessorStateDigest:
      value.predecessorStateDigest as PlanningDigestV1 | null,
    lastDecisionDigest: value.lastDecisionDigest as PlanningDigestV1 | null,
  });
  if (
    value.policyId !== rebuilt.policyId ||
    value.policyVersion !== rebuilt.policyVersion ||
    value.policyDigest !== rebuilt.policyDigest ||
    value.catalogId !== rebuilt.catalogId ||
    value.catalogVersion !== rebuilt.catalogVersion ||
    value.catalogDigest !== rebuilt.catalogDigest ||
    value.entropyId !== rebuilt.entropyId ||
    value.entropyVersion !== rebuilt.entropyVersion ||
    value.entropyImplementationDigest !== rebuilt.entropyImplementationDigest ||
    value.stateDigest !== rebuilt.stateDigest
  )
    fail("strategy adaptation state binding or digest is invalid");
  return rebuilt;
}

export function reduceLocalStrategySelectionV1(
  input: LocalStrategySelectionReductionInputV1,
): LocalStrategySelectionReductionResultV1 {
  const policy = validateLocalStrategyAdaptationPolicyV1(input.policy);
  const catalog = validateLocalStrategyCatalogV1(input.catalog);
  const state = validateLocalStrategyAdaptationStateV1(input.state, {
    policy,
    catalog,
    entropy: input.state,
  });
  const request = validateLocalStrategySelectionRequestV1(input.request);
  const collectivePriorConfiguration =
    input.collectivePriorConfiguration === null
      ? null
      : normalizeCollectivePriorConfiguration(
          input.collectivePriorConfiguration,
        );
  const collectivePriors = normalizeCollectivePriors(
    input.collectivePriors,
    request,
    collectivePriorConfiguration,
  );
  if (
    request.availableStrategyIds.length > policy.policy.limits.maximumStrategies
  )
    fail("selection request exceeds the policy strategy limit");
  if (request.logicalTimeMs < state.logicalTimeHighWaterMs)
    fail("strategy selection logical time rolled back");
  const supported = catalog.strategies.filter(
    ({ strategyId, operations }) =>
      request.availableStrategyIds.includes(strategyId) &&
      operations.includes(request.operation),
  );
  if (supported.length !== request.availableStrategyIds.length)
    fail("selection request contains unavailable or unsupported strategies");
  const signals = normalizeSafetySignals(
    input.safetySignals,
    policy.policy.limits.maximumReasonCodesPerSignal,
  );
  assertSafetySignalBindings(signals, request, supported);

  const required = policy.policy.requiredSafetyDimensions[request.operation];
  const headMap = new Map(
    state.safetyHeads.map((head) => [head.headKey, head]),
  );
  const eligibility = new Map<
    string,
    {
      readonly eligible: boolean;
      readonly signalDigests: readonly PlanningDigestV1[];
      readonly reasons: readonly string[];
    }
  >();
  let minimumSignalExpiry = Number.MAX_SAFE_INTEGER;
  for (const strategy of supported) {
    let eligible = true;
    const accepted: PlanningDigestV1[] = [];
    const currentReasons = new Set<string>();
    for (const dimension of required) {
      const signal = signals.find(
        (candidate) =>
          candidate.strategyId === strategy.strategyId &&
          candidate.dimension === dimension,
      );
      if (!signal) {
        eligible = false;
        currentReasons.add(`safety_signal_missing:${dimension}`);
        continue;
      }
      const invalidity = signalInvalidity(
        signal,
        request.logicalTimeMs,
        policy,
      );
      if (invalidity) {
        eligible = false;
        currentReasons.add(invalidity);
        continue;
      }
      const key = safetyHeadKey(signal);
      const previous = headMap.get(key);
      if (previous && signal.sourceRevision < previous.sourceRevision) {
        eligible = false;
        currentReasons.add(`safety_signal_revision_rollback:${dimension}`);
        continue;
      }
      if (
        previous &&
        signal.sourceRevision === previous.sourceRevision &&
        signal.signalDigest !== previous.signalDigest
      ) {
        eligible = false;
        currentReasons.add(`safety_signal_equivocation:${dimension}`);
        continue;
      }
      if (
        !previous &&
        headMap.size >= policy.policy.limits.maximumSafetyHeads
      ) {
        eligible = false;
        currentReasons.add("safety_head_capacity_exceeded");
        continue;
      }
      headMap.set(key, safetyHeadFromSignal(signal));
      if (signal.disposition !== "eligible") eligible = false;
      currentReasons.add(`safety_${dimension}_${signal.disposition}`);
      for (const reasonCode of signal.reasonCodes)
        currentReasons.add(reasonCode);
      accepted.push(signal.signalDigest);
      minimumSignalExpiry = Math.min(
        minimumSignalExpiry,
        signal.expiresAtLogicalMs,
      );
    }
    eligibility.set(strategy.strategyId, {
      eligible,
      signalDigests: freeze(accepted.sort(compare)),
      reasons: freeze([...currentReasons].sort(compare)),
    });
  }

  const baselineStrategyId = catalog.baselines[request.operation];
  const operationState = state.operations.find(
    ({ operation: current }) => current === request.operation,
  )!;
  const prunedPending = state.pendingDecisions.filter(
    ({ feedbackExpiresAtLogicalMs }) =>
      feedbackExpiresAtLogicalMs > request.logicalTimeMs,
  );
  const reasonsSet = new Set<string>();
  let candidates = supported.filter((strategy) => {
    const arm = armFor(state.arms, request.operation, strategy.strategyId);
    return (
      eligibility.get(strategy.strategyId)?.eligible === true &&
      arm.quarantinedUntilLogicalMs <= request.logicalTimeMs
    );
  });
  if (operationState.paused) {
    candidates = [];
    reasonsSet.add("operation_paused");
  } else if (
    operationState.baselineOnlyUntilLogicalMs > request.logicalTimeMs
  ) {
    candidates = candidates.filter(
      ({ strategyId }) => strategyId === baselineStrategyId,
    );
    reasonsSet.add("baseline_only_cooling_period");
  }
  if (prunedPending.length >= policy.policy.limits.maximumPendingDecisions) {
    candidates = [];
    reasonsSet.add("pending_decision_capacity_exceeded");
  }
  const baselineEligible = candidates.some(
    ({ strategyId }) => strategyId === baselineStrategyId,
  );
  if (!baselineEligible) {
    candidates = [];
    reasonsSet.add("safe_baseline_unavailable");
  }

  const localProbabilities =
    candidates.length === 0
      ? freeze([] as LocalStrategyProbabilityV1[])
      : computeProbabilities(
          candidates,
          state.arms,
          request.operation,
          baselineStrategyId,
          policy,
          eligibility,
        );
  const priorMix = applyCollectivePriors(
    localProbabilities,
    candidates,
    baselineStrategyId,
    policy.policy.baselineProbabilityFloorBps,
    collectivePriorConfiguration,
    collectivePriors,
  );
  const probabilities = priorMix.probabilities;
  if (priorMix.appliedInfluenceBps > 0) {
    reasonsSet.add("collective_prior_applied");
    reasonsSet.add(`collective_prior_influence_bps:${priorMix.appliedInfluenceBps}`);
  } else if (collectivePriors.length > 0) {
    reasonsSet.add("collective_prior_not_applicable");
  }
  if (probabilities.length > 0 && input.entropyDraw === null)
    fail("entropy draw is required for an eligible selection");
  const entropyDraw =
    input.entropyDraw === null ? null : normalizeEntropyDraw(input.entropyDraw);
  const selectedProbability =
    entropyDraw === null
      ? null
      : selectProbability(probabilities, entropyDraw.drawBps);
  const selected = selectedProbability
    ? catalog.strategies.find(
        ({ strategyId }) => strategyId === selectedProbability.strategyId,
      )!
    : null;
  const highestWeight = candidates
    .map(({ strategyId }) => armFor(state.arms, request.operation, strategyId))
    .sort(
      (a, b) =>
        b.weightMicros - a.weightMicros || compare(a.strategyId, b.strategyId),
    )[0];
  const mode: LocalStrategySelectionDecisionV1["mode"] = !selected
    ? "abstain"
    : selected.strategyId === baselineStrategyId
      ? "baseline"
      : highestWeight?.strategyId === selected.strategyId
        ? "exploit"
        : "explore";
  if (selected) reasonsSet.add(`selection_${mode}`);
  else reasonsSet.add("selection_abstained");

  const priorStateRevision = state.revision;
  const committedStateRevision = priorStateRevision + 1;
  const expiresAtLogicalMs = Math.min(
    request.logicalTimeMs + policy.policy.limits.maximumDecisionTtlMs,
    minimumSignalExpiry,
  );
  const decisionBody = freeze({
    schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
    controllerId: state.controllerId,
    controllerVersion: state.controllerVersion,
    implementationId: state.implementationId,
    policyId: policy.policy.policyId,
    policyVersion: policy.policy.policyVersion,
    policyDigest: policy.policyDigest,
    catalogId: catalog.catalogId,
    catalogVersion: catalog.catalogVersion,
    catalogDigest: catalog.catalogDigest,
    entropyId: state.entropyId,
    entropyVersion: state.entropyVersion,
    entropyImplementationDigest: state.entropyImplementationDigest,
    requestId: request.requestId,
    requestDigest: request.requestDigest,
    operation: request.operation,
    baselineStrategyId,
    selectedStrategyId: selected?.strategyId ?? null,
    selectedStrategyDigest: selected?.strategyDigest ?? null,
    mode,
    probabilities,
    drawBps: entropyDraw?.drawBps ?? null,
    entropyEvidenceDigest: entropyDraw?.evidenceDigest ?? null,
    reasonCodes: freeze([...reasonsSet].sort(compare)),
    evaluatedAtLogicalMs: request.logicalTimeMs,
    expiresAtLogicalMs:
      expiresAtLogicalMs === Number.MAX_SAFE_INTEGER
        ? request.logicalTimeMs + policy.policy.limits.maximumDecisionTtlMs
        : expiresAtLogicalMs,
    priorStateRevision,
    committedStateRevision,
  });
  const decisionDigest = digest(
    "local-strategy-selection-decision",
    decisionBody,
  );
  const decision = freeze({
    ...decisionBody,
    decisionId: `local-strategy-decision.${decisionDigest.slice(7)}`,
    decisionDigest,
  });

  let arms = state.arms;
  let pendingDecisions = freeze(prunedPending);
  if (selected) {
    arms = freeze(
      state.arms.map((arm) =>
        arm.operation === request.operation &&
        arm.strategyId === selected.strategyId
          ? freeze({ ...arm, selectionCount: arm.selectionCount + 1 })
          : arm,
      ),
    );
    pendingDecisions = freeze(
      [
        ...prunedPending,
        freeze({
          schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
          decisionId: decision.decisionId,
          decisionDigest,
          requestId: request.requestId,
          requestDigest: request.requestDigest,
          operation: request.operation,
          strategyId: selected.strategyId,
          strategyDigest: selected.strategyDigest,
          contextDigest: request.contextDigest,
          selectedAtLogicalMs: request.logicalTimeMs,
          feedbackExpiresAtLogicalMs:
            request.logicalTimeMs + policy.policy.limits.maximumFeedbackDelayMs,
        }),
      ].sort(pendingOrder),
    );
  }
  const nextState = createLocalStrategyAdaptationStateV1({
    stateKey: state.stateKey,
    controllerId: state.controllerId,
    controllerVersion: state.controllerVersion,
    implementationId: state.implementationId,
    policy,
    catalog,
    entropy: state,
    revision: committedStateRevision,
    logicalTimeHighWaterMs: request.logicalTimeMs,
    entropyCounter: state.entropyCounter + (entropyDraw ? 1 : 0),
    arms,
    operations: state.operations,
    pendingDecisions,
    safetyHeads: freeze([...headMap.values()].sort(safetyHeadOrder)),
    feedbackHeads: state.feedbackHeads,
    predecessorStateDigest: state.predecessorStateDigest,
    lastDecisionDigest: decisionDigest,
  });
  return freeze({ state: nextState, decision });
}

export function reduceLocalStrategyFeedbackV1(
  input: LocalStrategyFeedbackReductionInputV1,
): LocalStrategyFeedbackReductionResultV1 {
  const policy = validateLocalStrategyAdaptationPolicyV1(input.policy);
  const catalog = validateLocalStrategyCatalogV1(input.catalog);
  const state = validateLocalStrategyAdaptationStateV1(input.state, {
    policy,
    catalog,
    entropy: input.state,
  });
  const batch = validateLocalStrategyFeedbackBatchV1(input.batch);
  if (batch.logicalTimeMs < state.logicalTimeHighWaterMs)
    fail("strategy feedback logical time rolled back");
  const matchingConsumedHeads = state.feedbackHeads.filter(
    ({ decisionDigest }) => decisionDigest === batch.decisionDigest,
  );
  if (
    matchingConsumedHeads.length > 0 &&
    batch.signals.every((signal) =>
      matchingConsumedHeads.some(
        (head) =>
          head.sourceId === signal.sourceId &&
          head.sourceRevision === signal.sourceRevision &&
          head.feedbackDigest === signal.feedbackDigest,
      ),
    )
  ) {
    const decision = feedbackDecision({
      state,
      batch,
      status: "idempotent",
      outcome: aggregateOutcome(batch.signals),
      rewardMicros: null,
      reasonCodes: ["feedback_already_consumed"],
      committedStateRevision: state.revision,
    });
    return freeze({ state, decision });
  }

  const pending = state.pendingDecisions.find(
    ({ decisionDigest }) => decisionDigest === batch.decisionDigest,
  );
  if (!pending) fail("feedback decision is not pending");
  assertFeedbackBindings(batch.signals, pending);
  const sourceBindings = new Map(
    policy.policy.feedbackSources.map((source) => [source.sourceId, source]),
  );
  const headMap = new Map(
    state.feedbackHeads.map((head) => [head.headKey, head]),
  );
  const admitted: LocalStrategyFeedbackSignalV1[] = [];
  const reasonCodes = new Set<string>();
  let equivocation = false;
  const policyMetricKeys = policy.policy.feedbackMetrics.map(
    ({ metric }) => metric,
  );
  for (const signal of batch.signals) {
    const source = sourceBindings.get(signal.sourceId);
    if (
      !source ||
      source.sourceVersion !== signal.sourceVersion ||
      source.sourceImplementationDigest !== signal.sourceImplementationDigest
    ) {
      reasonCodes.add(`feedback_source_not_admitted:${signal.sourceId}`);
      continue;
    }
    if (
      !same(
        signal.metrics.map(({ metric }) => metric),
        policyMetricKeys,
      )
    ) {
      reasonCodes.add(`feedback_metric_set_invalid:${signal.sourceId}`);
      continue;
    }
    if (signal.confidenceBps < policy.policy.minimumFeedbackConfidenceBps) {
      reasonCodes.add(`feedback_confidence_too_low:${signal.sourceId}`);
      continue;
    }
    if (
      signal.observedAtLogicalMs < pending.selectedAtLogicalMs ||
      signal.observedAtLogicalMs > batch.logicalTimeMs ||
      signal.expiresAtLogicalMs <= batch.logicalTimeMs ||
      signal.observedAtLogicalMs - pending.selectedAtLogicalMs >
        policy.policy.limits.maximumFeedbackDelayMs
    ) {
      reasonCodes.add(`feedback_time_invalid:${signal.sourceId}`);
      continue;
    }
    const key = feedbackHeadKey(signal);
    const previous = headMap.get(key);
    if (previous && signal.sourceRevision < previous.sourceRevision) {
      reasonCodes.add(`feedback_revision_rollback:${signal.sourceId}`);
      continue;
    }
    if (
      previous &&
      signal.sourceRevision === previous.sourceRevision &&
      signal.feedbackDigest !== previous.feedbackDigest
    ) {
      equivocation = true;
      reasonCodes.add(`feedback_equivocation:${signal.sourceId}`);
      continue;
    }
    if (
      !previous &&
      headMap.size >= policy.policy.limits.maximumFeedbackHeads
    ) {
      reasonCodes.add("feedback_head_capacity_exceeded");
      continue;
    }
    headMap.set(key, feedbackHeadFromSignal(signal));
    admitted.push(signal);
  }

  const priorStateRevision = state.revision;
  const committedStateRevision = priorStateRevision + 1;
  let status: LocalStrategyFeedbackDecisionV1["status"];
  let outcome: LocalStrategyFeedbackOutcomeV1 | null = null;
  let rewardMicros: number | null = null;
  let arms = state.arms;
  let operations = state.operations;
  let consume = false;

  if (equivocation) {
    status = "rejected";
    consume = true;
    const result = quarantineForEquivocation(
      arms,
      operations,
      pending,
      catalog,
      policy,
      batch.logicalTimeMs,
    );
    arms = result.arms;
    operations = result.operations;
  } else if (admitted.length < policy.policy.minimumFeedbackSources) {
    status = "pending_sources";
    reasonCodes.add("minimum_feedback_sources_not_met");
  } else if (batch.logicalTimeMs >= pending.feedbackExpiresAtLogicalMs) {
    status = "rejected";
    consume = true;
    reasonCodes.add("feedback_window_expired");
  } else {
    outcome = aggregateOutcome(admitted);
    if (outcome === "indeterminate") {
      status = "indeterminate";
      consume = true;
      reasonCodes.add("feedback_indeterminate");
    } else {
      rewardMicros = deriveReward(admitted, policy);
      status = "applied";
      consume = true;
      reasonCodes.add("feedback_applied");
      const result = updateArmFromFeedback({
        arms,
        operations,
        pending,
        outcome,
        rewardMicros,
        logicalTimeMs: batch.logicalTimeMs,
        catalog,
        policy,
      });
      arms = result.arms;
      operations = result.operations;
      for (const reason of result.reasonCodes) reasonCodes.add(reason);
    }
  }

  const pendingDecisions = consume
    ? state.pendingDecisions.filter(
        ({ decisionDigest }) => decisionDigest !== pending.decisionDigest,
      )
    : state.pendingDecisions;
  const decision = feedbackDecision({
    state,
    batch,
    status,
    outcome,
    rewardMicros,
    reasonCodes: [...reasonCodes].sort(compare),
    committedStateRevision,
  });
  const nextState = createLocalStrategyAdaptationStateV1({
    stateKey: state.stateKey,
    controllerId: state.controllerId,
    controllerVersion: state.controllerVersion,
    implementationId: state.implementationId,
    policy,
    catalog,
    entropy: state,
    revision: committedStateRevision,
    logicalTimeHighWaterMs: batch.logicalTimeMs,
    entropyCounter: state.entropyCounter,
    arms,
    operations,
    pendingDecisions,
    safetyHeads: state.safetyHeads,
    feedbackHeads: freeze([...headMap.values()].sort(feedbackHeadOrder)),
    predecessorStateDigest: state.predecessorStateDigest,
    lastDecisionDigest: state.lastDecisionDigest,
  });
  return freeze({ state: nextState, decision });
}

export class LocalStrategyAdaptationRuntimeV1 implements LocalStrategyAdaptationPortV1 {
  readonly controllerId: string;
  readonly controllerVersion: number;
  readonly implementationId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly catalogId: string;
  readonly catalogVersion: number;
  readonly catalogDigest: PlanningDigestV1;
  readonly #stateKey: string;
  readonly #policy: LocalStrategyAdaptationPolicyRecordV1;
  readonly #catalog: LocalStrategyCatalogV1;
  readonly #safety: LocalStrategySafetyResolutionPortV1;
  readonly #entropy: LocalStrategyEntropyPortV1;
  readonly #store: LocalStrategyAdaptationStoreV1;
  readonly #collectivePrior: {
    readonly configuration: LocalStrategyCollectivePriorConfigurationV1;
    readonly source: LocalStrategyCollectivePriorSourceV1;
  } | null;

  constructor(options: LocalStrategyAdaptationRuntimeOptionsV1) {
    if (!options || typeof options !== "object")
      fail("strategy adaptation runtime options are required");
    this.#stateKey = id(options.stateKey, "runtime.stateKey");
    this.controllerId = id(options.controllerId, "runtime.controllerId");
    this.controllerVersion = positive(
      options.controllerVersion,
      "runtime.controllerVersion",
    );
    this.implementationId = id(
      options.implementationId,
      "runtime.implementationId",
    );
    this.#policy = validateLocalStrategyAdaptationPolicyV1(options.policy);
    this.policyId = this.#policy.policy.policyId;
    this.policyVersion = this.#policy.policy.policyVersion;
    this.policyDigest = this.#policy.policyDigest;
    this.#catalog = validateLocalStrategyCatalogV1(options.catalog);
    assertCatalogPolicy(this.#catalog, this.#policy);
    this.catalogId = this.#catalog.catalogId;
    this.catalogVersion = this.#catalog.catalogVersion;
    this.catalogDigest = this.#catalog.catalogDigest;
    if (!options.safety || typeof options.safety.resolve !== "function")
      fail("strategy safety resolver is required");
    if (!options.entropy || typeof options.entropy.draw !== "function")
      fail("strategy entropy port is required");
    normalizeEntropyBinding(options.entropy);
    if (
      !options.store ||
      typeof options.store.load !== "function" ||
      typeof options.store.save !== "function"
    )
      fail("strategy adaptation store is required");
    this.#safety = options.safety;
    this.#entropy = options.entropy;
    this.#store = options.store;
    if (options.collectivePrior) {
      const configuration = normalizeCollectivePriorConfiguration(
        options.collectivePrior.configuration,
      );
      const source = options.collectivePrior.source;
      if (
        !source ||
        typeof source.resolve !== "function" ||
        source.sourceId !== configuration.sourceId ||
        source.sourceVersion !== configuration.sourceVersion ||
        source.sourceImplementationDigest !==
          configuration.sourceImplementationDigest
      )
        fail("collective strategy prior source binding is invalid");
      this.#collectivePrior = freeze({ configuration, source });
    } else {
      this.#collectivePrior = null;
    }
  }

  async select(
    requestValue: LocalStrategySelectionRequestV1,
  ): Promise<LocalStrategySelectionDecisionV1> {
    const request = validateLocalStrategySelectionRequestV1(requestValue);
    const strategies = this.#catalog.strategies.filter(
      ({ strategyId, operations }) =>
        request.availableStrategyIds.includes(strategyId) &&
        operations.includes(request.operation),
    );
    const requiredDimensions =
      this.#policy.policy.requiredSafetyDimensions[request.operation];
    const signals = await this.#safety.resolve({
      request,
      strategies,
      requiredDimensions,
    });
    const collectivePriors = this.#collectivePrior
      ? await this.#collectivePrior.source.resolve({ request, strategies })
      : freeze([] as LocalStrategyCollectivePriorV1[]);
    for (
      let attempt = 0;
      attempt < this.#policy.policy.limits.maximumCommitAttempts;
      attempt += 1
    ) {
      const loaded = await this.#store.load(this.#stateKey);
      const state = loaded ? this.#validateState(loaded) : this.#initialState();
      this.#assertRuntimeBinding(state);
      const entropyDraw = normalizeEntropyDraw(
        await this.#entropy.draw({
          stateKey: state.stateKey,
          stateRevision: state.revision,
          entropyCounter: state.entropyCounter,
          requestDigest: request.requestDigest,
        }),
      );
      const result = reduceLocalStrategySelectionV1({
        state,
        policy: this.#policy,
        catalog: this.#catalog,
        request,
        safetySignals: signals,
        collectivePriorConfiguration:
          this.#collectivePrior?.configuration ?? null,
        collectivePriors,
        entropyDraw,
      });
      if (
        await this.#store.save({
          state: result.state,
          expectedRevision: loaded ? state.revision : null,
        })
      )
        return result.decision;
    }
    throw new Error("local_strategy_selection_commit_conflict");
  }

  async observe(
    batchValue: LocalStrategyFeedbackBatchV1,
  ): Promise<LocalStrategyFeedbackDecisionV1> {
    const batch = validateLocalStrategyFeedbackBatchV1(batchValue);
    for (
      let attempt = 0;
      attempt < this.#policy.policy.limits.maximumCommitAttempts;
      attempt += 1
    ) {
      const loaded = await this.#store.load(this.#stateKey);
      if (!loaded) fail("strategy adaptation state is missing");
      const state = this.#validateState(loaded);
      this.#assertRuntimeBinding(state);
      const result = reduceLocalStrategyFeedbackV1({
        state,
        policy: this.#policy,
        catalog: this.#catalog,
        batch,
      });
      if (result.state.revision === state.revision) return result.decision;
      if (
        await this.#store.save({
          state: result.state,
          expectedRevision: state.revision,
        })
      )
        return result.decision;
    }
    throw new Error("local_strategy_feedback_commit_conflict");
  }

  async loadState(): Promise<LocalStrategyAdaptationStateV1> {
    const loaded = await this.#store.load(this.#stateKey);
    return loaded ? this.#validateState(loaded) : this.#initialState();
  }

  async exportHandoff(input: {
    readonly targetStateKey: string;
    readonly logicalTimeMs: number;
  }): Promise<LocalStrategyHandoffEnvelopeV1> {
    const targetStateKey = id(input.targetStateKey, "handoff.targetStateKey");
    if (targetStateKey === this.#stateKey)
      fail("strategy handoff target must differ from source");
    const logicalTimeMs = nonNegative(
      input.logicalTimeMs,
      "handoff.logicalTimeMs",
    );
    const sourceState = await this.loadState();
    if (logicalTimeMs < sourceState.logicalTimeHighWaterMs)
      fail("strategy handoff logical time rolled back");
    const body = freeze({
      format: LOCAL_STRATEGY_ADAPTATION_HANDOFF_FORMAT_V1,
      schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
      contentClass: "local_strategy_adaptation_state" as const,
      controllerId: this.controllerId,
      controllerVersion: this.controllerVersion,
      implementationId: this.implementationId,
      policyDigest: this.policyDigest,
      catalogDigest: this.catalogDigest,
      entropyImplementationDigest: this.#entropy.entropyImplementationDigest,
      sourceStateKey: sourceState.stateKey,
      sourceStateDigest: sourceState.stateDigest,
      targetStateKey,
      exportedAtLogicalMs: logicalTimeMs,
      sourceState,
    });
    return freeze({
      ...body,
      handoffDigest: digest("local-strategy-adaptation-handoff", body),
    });
  }

  async importHandoff(input: {
    readonly handoff: LocalStrategyHandoffEnvelopeV1;
    readonly logicalTimeMs: number;
  }): Promise<LocalStrategyAdaptationStateV1> {
    const handoff = validateLocalStrategyHandoffV1(input.handoff, {
      policy: this.#policy,
      catalog: this.#catalog,
      entropy: this.#entropy,
    });
    const logicalTimeMs = nonNegative(
      input.logicalTimeMs,
      "handoff.logicalTimeMs",
    );
    if (
      handoff.targetStateKey !== this.#stateKey ||
      handoff.controllerId !== this.controllerId ||
      handoff.controllerVersion !== this.controllerVersion ||
      handoff.implementationId !== this.implementationId ||
      logicalTimeMs < handoff.exportedAtLogicalMs ||
      logicalTimeMs < handoff.sourceState.logicalTimeHighWaterMs
    )
      fail("strategy handoff binding is invalid");
    const existing = await this.#store.load(this.#stateKey);
    if (existing) {
      const current = this.#validateState(existing);
      if (current.predecessorStateDigest === handoff.sourceStateDigest)
        return current;
      fail("strategy handoff target conflicts with existing state");
    }
    const source = handoff.sourceState;
    const restored = createLocalStrategyAdaptationStateV1({
      stateKey: this.#stateKey,
      controllerId: this.controllerId,
      controllerVersion: this.controllerVersion,
      implementationId: this.implementationId,
      policy: this.#policy,
      catalog: this.#catalog,
      entropy: this.#entropy,
      revision: 1,
      logicalTimeHighWaterMs: Math.max(
        logicalTimeMs,
        source.logicalTimeHighWaterMs,
      ),
      entropyCounter: source.entropyCounter,
      arms: source.arms,
      operations: source.operations,
      pendingDecisions: source.pendingDecisions,
      safetyHeads: source.safetyHeads,
      feedbackHeads: source.feedbackHeads,
      predecessorStateDigest: source.stateDigest,
      lastDecisionDigest: source.lastDecisionDigest,
    });
    if (await this.#store.save({ state: restored, expectedRevision: null }))
      return restored;
    const raced = await this.#store.load(this.#stateKey);
    if (raced) {
      const current = this.#validateState(raced);
      if (current.predecessorStateDigest === source.stateDigest) return current;
    }
    fail("strategy handoff target conflicts with existing state");
  }

  #initialState(): LocalStrategyAdaptationStateV1 {
    return createLocalStrategyAdaptationStateV1({
      stateKey: this.#stateKey,
      controllerId: this.controllerId,
      controllerVersion: this.controllerVersion,
      implementationId: this.implementationId,
      policy: this.#policy,
      catalog: this.#catalog,
      entropy: this.#entropy,
    });
  }

  #validateState(input: unknown): LocalStrategyAdaptationStateV1 {
    return validateLocalStrategyAdaptationStateV1(input, {
      policy: this.#policy,
      catalog: this.#catalog,
      entropy: this.#entropy,
    });
  }

  #assertRuntimeBinding(state: LocalStrategyAdaptationStateV1): void {
    if (
      state.stateKey !== this.#stateKey ||
      state.controllerId !== this.controllerId ||
      state.controllerVersion !== this.controllerVersion ||
      state.implementationId !== this.implementationId
    )
      fail("strategy adaptation runtime binding changed");
  }
}

export class InMemoryLocalStrategyAdaptationStoreV1 implements LocalStrategyAdaptationStoreV1 {
  readonly #states = new Map<string, LocalStrategyAdaptationStateV1>();
  readonly #policy: LocalStrategyAdaptationPolicyRecordV1;
  readonly #catalog: LocalStrategyCatalogV1;
  readonly #entropy: Pick<
    LocalStrategyEntropyPortV1,
    "entropyId" | "entropyVersion" | "entropyImplementationDigest"
  >;

  constructor(input: {
    readonly policy: LocalStrategyAdaptationPolicyRecordV1;
    readonly catalog: LocalStrategyCatalogV1;
    readonly entropy: Pick<
      LocalStrategyEntropyPortV1,
      "entropyId" | "entropyVersion" | "entropyImplementationDigest"
    >;
  }) {
    this.#policy = validateLocalStrategyAdaptationPolicyV1(input.policy);
    this.#catalog = validateLocalStrategyCatalogV1(input.catalog);
    this.#entropy = normalizeEntropyBinding(input.entropy);
  }

  async load(stateKey: string): Promise<LocalStrategyAdaptationStateV1 | null> {
    const value = this.#states.get(id(stateKey, "store.stateKey"));
    return value ? clone(value) : null;
  }

  async save(input: {
    readonly state: LocalStrategyAdaptationStateV1;
    readonly expectedRevision: number | null;
  }): Promise<boolean> {
    const state = validateLocalStrategyAdaptationStateV1(input.state, {
      policy: this.#policy,
      catalog: this.#catalog,
      entropy: this.#entropy,
    });
    const current = this.#states.get(state.stateKey);
    if (
      input.expectedRevision === null
        ? current !== undefined || state.revision !== 1
        : !current ||
          current.revision !== input.expectedRevision ||
          state.revision !== input.expectedRevision + 1
    )
      return false;
    this.#states.set(state.stateKey, clone(state));
    return true;
  }
}

export function createDeterministicLocalStrategyEntropyV1(input: {
  readonly entropyId: string;
  readonly entropyVersion: number;
  readonly entropyImplementationDigest: PlanningDigestV1;
  readonly seedDigest: PlanningDigestV1;
}): LocalStrategyEntropyPortV1 {
  const binding = normalizeEntropyBinding(input);
  const seedDigest = sha(input.seedDigest, "entropy.seedDigest");
  return freeze({
    ...binding,
    async draw(value: {
      readonly stateKey: string;
      readonly stateRevision: number;
      readonly entropyCounter: number;
      readonly requestDigest: PlanningDigestV1;
    }) {
      const evidenceDigest = digest("local-strategy-entropy-draw", {
        seedDigest,
        stateKey: id(value.stateKey, "entropy.stateKey"),
        stateRevision: nonNegative(
          value.stateRevision,
          "entropy.stateRevision",
        ),
        entropyCounter: nonNegative(
          value.entropyCounter,
          "entropy.entropyCounter",
        ),
        requestDigest: sha(value.requestDigest, "entropy.requestDigest"),
      });
      const first52Bits = evidenceDigest.slice(7, 20);
      return freeze({
        drawBps: Number.parseInt(first52Bits, 16) % BPS,
        evidenceDigest,
      });
    },
  });
}

export function createLocalStrategySafetyResolutionPortV1(input: {
  readonly sources: readonly LocalStrategySafetySignalSourceV1[];
}): LocalStrategySafetyResolutionPortV1 {
  if (!input || !Array.isArray(input.sources))
    fail("strategy safety sources are required");
  const sources = new Map<
    LocalStrategySafetyDimensionV1,
    LocalStrategySafetySignalSourceV1
  >();
  for (const source of input.sources) {
    if (!source || typeof source.resolve !== "function")
      fail("strategy safety source is invalid");
    const dimension = safetyDimension(source.dimension);
    if (sources.has(dimension))
      fail("strategy safety source dimension is duplicated");
    sources.set(dimension, source);
  }
  return freeze({
    async resolve({ request, strategies, requiredDimensions }) {
      const normalizedRequest =
        validateLocalStrategySelectionRequestV1(request);
      const normalizedStrategies = strategies.map(
        validateLocalStrategyDefinitionV1,
      );
      const results = await Promise.all(
        normalizedStrategies.flatMap((strategy) =>
          requiredDimensions.map(async (dimension) => {
            const source = sources.get(safetyDimension(dimension));
            if (!source) return null;
            const signal = await source.resolve({
              request: normalizedRequest,
              strategy,
            });
            return signal === null
              ? null
              : validateLocalStrategySafetySignalV1(signal);
          }),
        ),
      );
      return freeze(
        results
          .filter(
            (signal): signal is LocalStrategySafetySignalV1 => signal !== null,
          )
          .sort(safetySignalOrder),
      );
    },
  });
}

export function validateLocalStrategySelectionDecisionV1(
  input: unknown,
): LocalStrategySelectionDecisionV1 {
  const value = record(
    input,
    selectionDecisionKeys,
    "local strategy selection decision",
  );
  schema(value.schemaVersion, "strategy selection decision");
  if (!Array.isArray(value.probabilities) || value.probabilities.length > 256)
    fail("strategy decision probabilities are invalid");
  const probabilities = value.probabilities.map((probabilityValue) => {
    const probability = record(
      probabilityValue,
      probabilityKeys,
      "strategy decision probability",
    );
    schema(probability.schemaVersion, "strategy probability");
    return freeze({
      schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
      strategyId: id(probability.strategyId, "probability.strategyId"),
      strategyDigest: sha(
        probability.strategyDigest,
        "probability.strategyDigest",
      ),
      probabilityBps: basisPoints(
        probability.probabilityBps,
        "probability.probabilityBps",
      ),
      signalDigests: digests(
        probability.signalDigests,
        "probability.signalDigests",
        16,
      ),
      priorDigests: digests(
        probability.priorDigests,
        "probability.priorDigests",
        16,
      ),
    });
  });
  if (
    !same(
      probabilities.map(({ strategyId }) => strategyId),
      [...probabilities].map(({ strategyId }) => strategyId).sort(compare),
    )
  )
    fail("strategy decision probabilities must be sorted");
  unique(
    probabilities.map(({ strategyId }) => strategyId),
    "probability strategy IDs",
  );
  if (
    probabilities.length > 0 &&
    probabilities.reduce((sum, current) => sum + current.probabilityBps, 0) !==
      BPS
  )
    fail("strategy probabilities do not total 10000 basis points");
  const selectedStrategyId = nullableId(
    value.selectedStrategyId,
    "decision.selectedStrategyId",
  );
  const selectedStrategyDigest =
    value.selectedStrategyDigest === null
      ? null
      : sha(value.selectedStrategyDigest, "decision.selectedStrategyDigest");
  if ((selectedStrategyId === null) !== (selectedStrategyDigest === null))
    fail("strategy decision selection binding is incomplete");
  if (
    selectedStrategyId !== null &&
    !probabilities.some(
      (current) =>
        current.strategyId === selectedStrategyId &&
        current.strategyDigest === selectedStrategyDigest,
    )
  )
    fail("selected strategy is absent from the probability distribution");
  const drawBps =
    value.drawBps === null
      ? null
      : integerRange(value.drawBps, "decision.drawBps", 0, BPS - 1);
  const entropyEvidenceDigest =
    value.entropyEvidenceDigest === null
      ? null
      : sha(value.entropyEvidenceDigest, "decision.entropyEvidenceDigest");
  if ((drawBps === null) !== (entropyEvidenceDigest === null))
    fail("strategy decision entropy binding is incomplete");
  const body = freeze({
    schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
    controllerId: id(value.controllerId, "decision.controllerId"),
    controllerVersion: positive(
      value.controllerVersion,
      "decision.controllerVersion",
    ),
    implementationId: id(value.implementationId, "decision.implementationId"),
    policyId: id(value.policyId, "decision.policyId"),
    policyVersion: positive(value.policyVersion, "decision.policyVersion"),
    policyDigest: sha(value.policyDigest, "decision.policyDigest"),
    catalogId: id(value.catalogId, "decision.catalogId"),
    catalogVersion: positive(value.catalogVersion, "decision.catalogVersion"),
    catalogDigest: sha(value.catalogDigest, "decision.catalogDigest"),
    entropyId: id(value.entropyId, "decision.entropyId"),
    entropyVersion: positive(value.entropyVersion, "decision.entropyVersion"),
    entropyImplementationDigest: sha(
      value.entropyImplementationDigest,
      "decision.entropyImplementationDigest",
    ),
    requestId: id(value.requestId, "decision.requestId"),
    requestDigest: sha(value.requestDigest, "decision.requestDigest"),
    operation: operation(value.operation),
    baselineStrategyId: id(
      value.baselineStrategyId,
      "decision.baselineStrategyId",
    ),
    selectedStrategyId,
    selectedStrategyDigest,
    mode: oneOf(
      value.mode,
      ["baseline", "explore", "exploit", "abstain"],
      "decision.mode",
    ) as LocalStrategySelectionDecisionV1["mode"],
    probabilities: freeze(probabilities),
    drawBps,
    entropyEvidenceDigest,
    reasonCodes: reasons(value.reasonCodes, 128),
    evaluatedAtLogicalMs: nonNegative(
      value.evaluatedAtLogicalMs,
      "decision.evaluatedAtLogicalMs",
    ),
    expiresAtLogicalMs: positive(
      value.expiresAtLogicalMs,
      "decision.expiresAtLogicalMs",
    ),
    priorStateRevision: nonNegative(
      value.priorStateRevision,
      "decision.priorStateRevision",
    ),
    committedStateRevision: positive(
      value.committedStateRevision,
      "decision.committedStateRevision",
    ),
  });
  if (
    body.committedStateRevision !== body.priorStateRevision + 1 ||
    body.expiresAtLogicalMs <= body.evaluatedAtLogicalMs ||
    (body.mode === "abstain") !== (body.selectedStrategyId === null) ||
    (body.mode === "baseline" &&
      body.selectedStrategyId !== body.baselineStrategyId)
  )
    fail("strategy decision state revisions are invalid");
  const decisionDigest = digest("local-strategy-selection-decision", body);
  const decisionId = `local-strategy-decision.${decisionDigest.slice(7)}`;
  if (
    value.decisionDigest !== decisionDigest ||
    value.decisionId !== decisionId
  )
    fail("strategy selection decision digest is invalid");
  return freeze({ ...body, decisionId, decisionDigest });
}

export function validateLocalStrategyFeedbackDecisionV1(
  input: unknown,
): LocalStrategyFeedbackDecisionV1 {
  const value = record(
    input,
    feedbackDecisionKeys,
    "local strategy feedback decision",
  );
  schema(value.schemaVersion, "strategy feedback decision");
  const body = freeze({
    schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
    batchId: id(value.batchId, "feedbackDecision.batchId"),
    batchDigest: sha(value.batchDigest, "feedbackDecision.batchDigest"),
    decisionId: id(value.decisionId, "feedbackDecision.decisionId"),
    decisionDigest: sha(
      value.decisionDigest,
      "feedbackDecision.decisionDigest",
    ),
    status: oneOf(
      value.status,
      ["applied", "pending_sources", "indeterminate", "idempotent", "rejected"],
      "feedbackDecision.status",
    ) as LocalStrategyFeedbackDecisionV1["status"],
    outcome: value.outcome === null ? null : feedbackOutcome(value.outcome),
    rewardMicros:
      value.rewardMicros === null
        ? null
        : integerRange(
            value.rewardMicros,
            "feedbackDecision.rewardMicros",
            0,
            MICROS,
          ),
    reasonCodes: reasons(value.reasonCodes, 128),
    priorStateRevision: nonNegative(
      value.priorStateRevision,
      "feedbackDecision.priorStateRevision",
    ),
    committedStateRevision: nonNegative(
      value.committedStateRevision,
      "feedbackDecision.committedStateRevision",
    ),
  });
  if (
    (body.status === "idempotent"
      ? body.committedStateRevision !== body.priorStateRevision
      : body.committedStateRevision !== body.priorStateRevision + 1) ||
    (body.status === "applied") !==
      (body.outcome !== null && body.rewardMicros !== null)
  )
    fail("strategy feedback decision state or outcome is invalid");
  const feedbackDecisionDigest = digest(
    "local-strategy-feedback-decision",
    body,
  );
  const feedbackDecisionId = `local-strategy-feedback-decision.${feedbackDecisionDigest.slice(7)}`;
  if (
    value.feedbackDecisionDigest !== feedbackDecisionDigest ||
    value.feedbackDecisionId !== feedbackDecisionId
  )
    fail("strategy feedback decision digest is invalid");
  return freeze({ ...body, feedbackDecisionId, feedbackDecisionDigest });
}

export function validateLocalStrategyHandoffV1(
  input: unknown,
  expected: {
    readonly policy: LocalStrategyAdaptationPolicyRecordV1;
    readonly catalog: LocalStrategyCatalogV1;
    readonly entropy: Pick<
      LocalStrategyEntropyPortV1,
      "entropyId" | "entropyVersion" | "entropyImplementationDigest"
    >;
  },
): LocalStrategyHandoffEnvelopeV1 {
  const value = record(input, handoffKeys, "local strategy handoff");
  if (
    value.format !== LOCAL_STRATEGY_ADAPTATION_HANDOFF_FORMAT_V1 ||
    value.contentClass !== "local_strategy_adaptation_state"
  )
    fail("strategy handoff format is invalid");
  schema(value.schemaVersion, "strategy handoff");
  const sourceState = validateLocalStrategyAdaptationStateV1(
    value.sourceState,
    expected,
  );
  const body = freeze({
    format: LOCAL_STRATEGY_ADAPTATION_HANDOFF_FORMAT_V1,
    schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
    contentClass: "local_strategy_adaptation_state" as const,
    controllerId: id(value.controllerId, "handoff.controllerId"),
    controllerVersion: positive(
      value.controllerVersion,
      "handoff.controllerVersion",
    ),
    implementationId: id(value.implementationId, "handoff.implementationId"),
    policyDigest: sha(value.policyDigest, "handoff.policyDigest"),
    catalogDigest: sha(value.catalogDigest, "handoff.catalogDigest"),
    entropyImplementationDigest: sha(
      value.entropyImplementationDigest,
      "handoff.entropyImplementationDigest",
    ),
    sourceStateKey: id(value.sourceStateKey, "handoff.sourceStateKey"),
    sourceStateDigest: sha(
      value.sourceStateDigest,
      "handoff.sourceStateDigest",
    ),
    targetStateKey: id(value.targetStateKey, "handoff.targetStateKey"),
    exportedAtLogicalMs: nonNegative(
      value.exportedAtLogicalMs,
      "handoff.exportedAtLogicalMs",
    ),
    sourceState,
  });
  if (
    body.policyDigest !== expected.policy.policyDigest ||
    body.catalogDigest !== expected.catalog.catalogDigest ||
    body.entropyImplementationDigest !==
      expected.entropy.entropyImplementationDigest ||
    body.sourceStateKey !== sourceState.stateKey ||
    body.sourceStateDigest !== sourceState.stateDigest ||
    body.controllerId !== sourceState.controllerId ||
    body.controllerVersion !== sourceState.controllerVersion ||
    body.implementationId !== sourceState.implementationId
  )
    fail("strategy handoff binding is invalid");
  const handoffDigest = digest("local-strategy-adaptation-handoff", body);
  if (value.handoffDigest !== handoffDigest)
    fail("strategy handoff digest is invalid");
  return freeze({ ...body, handoffDigest });
}

function normalizePolicy(
  input: LocalStrategyAdaptationPolicyV1,
): LocalStrategyAdaptationPolicyV1 {
  const value = record(input, policyKeys, "local strategy adaptation policy");
  schema(value.schemaVersion, "strategy adaptation policy");
  const requirementValue = record(
    value.requiredSafetyDimensions,
    operationKeys,
    "strategy safety requirements",
  );
  const requiredSafetyDimensions = Object.fromEntries(
    LOCAL_STRATEGY_OPERATIONS_V1.map((current) => {
      const dimensions = enumArray(
        requirementValue[current],
        safetyDimensionSet,
        `requiredSafetyDimensions.${current}`,
        LOCAL_STRATEGY_SAFETY_DIMENSIONS_V1.length,
      ) as readonly LocalStrategySafetyDimensionV1[];
      if (!dimensions.includes("authority"))
        fail(`authority safety is required for ${current}`);
      return [current, dimensions];
    }),
  ) as unknown as LocalStrategyAdaptationPolicyV1["requiredSafetyDimensions"];
  if (!Array.isArray(value.feedbackMetrics) || value.feedbackMetrics.length < 1)
    fail("feedback metric policy is empty");
  const feedbackMetrics = value.feedbackMetrics
    .map((metricValue) => {
      const metric = record(
        metricValue,
        metricPolicyKeys,
        "feedback metric policy",
      );
      schema(metric.schemaVersion, "feedback metric policy");
      return freeze({
        schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
        metric: feedbackMetric(metric.metric),
        weight: bounded(metric.weight, "feedback metric weight", 10_000),
        direction: oneOf(
          metric.direction,
          ["maximize", "minimize"],
          "feedback metric direction",
        ) as "maximize" | "minimize",
      });
    })
    .sort((a, b) => compare(a.metric, b.metric));
  unique(
    feedbackMetrics.map(({ metric }) => metric),
    "feedback metrics",
  );
  if (!feedbackMetrics.some(({ metric }) => metric === "safety"))
    fail("feedback metric policy must include safety");
  if (!Array.isArray(value.feedbackSources) || value.feedbackSources.length < 1)
    fail("feedback sources are empty");
  const feedbackSources = value.feedbackSources
    .map((sourceValue) => {
      const source = record(
        sourceValue,
        feedbackSourceKeys,
        "feedback source binding",
      );
      schema(source.schemaVersion, "feedback source binding");
      return freeze({
        schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
        sourceId: id(source.sourceId, "feedbackSource.sourceId"),
        sourceVersion: positive(
          source.sourceVersion,
          "feedbackSource.sourceVersion",
        ),
        sourceImplementationDigest: sha(
          source.sourceImplementationDigest,
          "feedbackSource.sourceImplementationDigest",
        ),
      });
    })
    .sort((a, b) => compare(a.sourceId, b.sourceId));
  unique(
    feedbackSources.map(({ sourceId }) => sourceId),
    "feedback source IDs",
  );
  const limitsValue = record(
    value.limits,
    limitKeys,
    "strategy adaptation limits",
  );
  const limits = freeze({
    maximumStrategies: bounded(
      limitsValue.maximumStrategies,
      "limits.maximumStrategies",
      256,
    ),
    maximumPendingDecisions: bounded(
      limitsValue.maximumPendingDecisions,
      "limits.maximumPendingDecisions",
      65_536,
    ),
    maximumSafetyHeads: bounded(
      limitsValue.maximumSafetyHeads,
      "limits.maximumSafetyHeads",
      65_536,
    ),
    maximumFeedbackHeads: bounded(
      limitsValue.maximumFeedbackHeads,
      "limits.maximumFeedbackHeads",
      65_536,
    ),
    maximumReasonCodesPerSignal: bounded(
      limitsValue.maximumReasonCodesPerSignal,
      "limits.maximumReasonCodesPerSignal",
      64,
    ),
    maximumDecisionTtlMs: bounded(
      limitsValue.maximumDecisionTtlMs,
      "limits.maximumDecisionTtlMs",
      86_400_000,
    ),
    maximumSafetySignalTtlMs: bounded(
      limitsValue.maximumSafetySignalTtlMs,
      "limits.maximumSafetySignalTtlMs",
      86_400_000,
    ),
    maximumFeedbackDelayMs: bounded(
      limitsValue.maximumFeedbackDelayMs,
      "limits.maximumFeedbackDelayMs",
      30 * 86_400_000,
    ),
    maximumCommitAttempts: bounded(
      limitsValue.maximumCommitAttempts,
      "limits.maximumCommitAttempts",
      16,
    ),
  });
  const minimumFeedbackSources = bounded(
    value.minimumFeedbackSources,
    "policy.minimumFeedbackSources",
    feedbackSources.length,
  );
  const minimumWeightMicros = bounded(
    value.minimumWeightMicros,
    "policy.minimumWeightMicros",
    1_000_000_000,
  );
  const maximumWeightMicros = bounded(
    value.maximumWeightMicros,
    "policy.maximumWeightMicros",
    1_000_000_000,
  );
  const initialWeightMicros = bounded(
    value.initialWeightMicros,
    "policy.initialWeightMicros",
    1_000_000_000,
  );
  if (
    minimumWeightMicros > initialWeightMicros ||
    initialWeightMicros > maximumWeightMicros
  )
    fail("strategy weight bounds are inconsistent");
  const explorationRateBps = basisPoints(
    value.explorationRateBps,
    "policy.explorationRateBps",
  );
  const baselineProbabilityFloorBps = basisPoints(
    value.baselineProbabilityFloorBps,
    "policy.baselineProbabilityFloorBps",
  );
  if (
    limits.maximumFeedbackHeads < feedbackSources.length ||
    baselineProbabilityFloorBps >
      BPS -
        explorationRateBps +
        Math.floor(explorationRateBps / limits.maximumStrategies)
  )
    fail("strategy policy state or baseline limits are inconsistent");
  return freeze({
    schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
    policyId: id(value.policyId, "policy.policyId"),
    policyVersion: positive(value.policyVersion, "policy.policyVersion"),
    parentPolicyDigest:
      value.parentPolicyDigest === null
        ? null
        : sha(value.parentPolicyDigest, "policy.parentPolicyDigest"),
    requiredSafetyDimensions,
    feedbackMetrics: freeze(feedbackMetrics),
    feedbackSources: freeze(feedbackSources),
    minimumFeedbackSources,
    minimumFeedbackConfidenceBps: basisPoints(
      value.minimumFeedbackConfidenceBps,
      "policy.minimumFeedbackConfidenceBps",
    ),
    learningRateBps: bounded(
      value.learningRateBps,
      "policy.learningRateBps",
      BPS,
    ),
    explorationRateBps,
    baselineProbabilityFloorBps,
    initialWeightMicros,
    minimumWeightMicros,
    maximumWeightMicros,
    unsafePenaltyBps: bounded(
      value.unsafePenaltyBps,
      "policy.unsafePenaltyBps",
      BPS,
    ),
    quarantineDurationMs: bounded(
      value.quarantineDurationMs,
      "policy.quarantineDurationMs",
      30 * 86_400_000,
    ),
    limits,
  });
}

function assertCatalogPolicy(
  catalog: LocalStrategyCatalogV1,
  policy: LocalStrategyAdaptationPolicyRecordV1,
): void {
  if (catalog.strategies.length > policy.policy.limits.maximumStrategies)
    fail("strategy catalog exceeds the policy strategy limit");
  const requiredHeadCount = catalog.strategies.reduce((total, strategy) => {
    const dimensions = new Set<LocalStrategySafetyDimensionV1>();
    for (const currentOperation of strategy.operations)
      for (const dimension of policy.policy.requiredSafetyDimensions[
        currentOperation
      ])
        dimensions.add(dimension);
    return total + dimensions.size;
  }, 0);
  if (requiredHeadCount > policy.policy.limits.maximumSafetyHeads)
    fail("strategy catalog exceeds the policy safety-head capacity");
}

function normalizeScope(input: unknown): LocalStrategyScopeV1 {
  const value = record(input, scopeKeys, "local strategy scope");
  const workItemId = nullableId(value.workItemId, "scope.workItemId");
  const workItemRevision =
    value.workItemRevision === null
      ? null
      : positive(value.workItemRevision, "scope.workItemRevision");
  if ((workItemId === null) !== (workItemRevision === null))
    fail("strategy Work scope is incomplete");
  return freeze({
    tenantId: id(value.tenantId, "scope.tenantId"),
    meshId: id(value.meshId, "scope.meshId"),
    policyDomainId: id(value.policyDomainId, "scope.policyDomainId"),
    missionIntentId: id(value.missionIntentId, "scope.missionIntentId"),
    objectiveId: id(value.objectiveId, "scope.objectiveId"),
    workItemId,
    workItemRevision,
  });
}

function normalizeMetricValues(
  input: unknown,
): readonly LocalStrategyFeedbackMetricValueV1[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 16)
    fail("feedback metric values are invalid");
  const values = input
    .map((metricValue) => {
      const value = record(
        metricValue,
        metricValueKeys,
        "feedback metric value",
      );
      schema(value.schemaVersion, "feedback metric value");
      return freeze({
        schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
        metric: feedbackMetric(value.metric),
        valueMicros: integerRange(
          value.valueMicros,
          "feedback.valueMicros",
          0,
          MICROS,
        ),
      });
    })
    .sort((a, b) => compare(a.metric, b.metric));
  unique(
    values.map(({ metric }) => metric),
    "feedback metric values",
  );
  return freeze(values);
}

function normalizeEntropyBinding(
  input: Pick<
    LocalStrategyEntropyPortV1,
    "entropyId" | "entropyVersion" | "entropyImplementationDigest"
  >,
): Pick<
  LocalStrategyEntropyPortV1,
  "entropyId" | "entropyVersion" | "entropyImplementationDigest"
> {
  if (!input || typeof input !== "object") fail("entropy binding is required");
  return freeze({
    entropyId: id(input.entropyId, "entropy.entropyId"),
    entropyVersion: positive(input.entropyVersion, "entropy.entropyVersion"),
    entropyImplementationDigest: sha(
      input.entropyImplementationDigest,
      "entropy.entropyImplementationDigest",
    ),
  });
}

function normalizeEntropyDraw(input: unknown): LocalStrategyEntropyDrawV1 {
  const value = record(
    input,
    ["drawBps", "evidenceDigest"],
    "strategy entropy draw",
  );
  return freeze({
    drawBps: integerRange(value.drawBps, "entropy.drawBps", 0, BPS - 1),
    evidenceDigest: sha(value.evidenceDigest, "entropy.evidenceDigest"),
  });
}

function initialArms(
  catalog: LocalStrategyCatalogV1,
  policy: LocalStrategyAdaptationPolicyRecordV1,
): readonly LocalStrategyArmStateV1[] {
  return freeze(
    catalog.strategies
      .flatMap((strategy) =>
        strategy.operations.map((currentOperation) =>
          freeze({
            schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
            operation: currentOperation,
            strategyId: strategy.strategyId,
            strategyDigest: strategy.strategyDigest,
            weightMicros: policy.policy.initialWeightMicros,
            selectionCount: 0,
            feedbackCount: 0,
            cumulativeRewardMicros: 0,
            unsafeCount: 0,
            quarantinedUntilLogicalMs: 0,
          }),
        ),
      )
      .sort(armOrder),
  );
}

function normalizeArms(
  input: readonly LocalStrategyArmStateV1[],
  catalog: LocalStrategyCatalogV1,
  policy: LocalStrategyAdaptationPolicyRecordV1,
): readonly LocalStrategyArmStateV1[] {
  if (!Array.isArray(input) || input.length > 256 * 5)
    fail("strategy arms are invalid");
  const arms = input
    .map((armValue) => {
      const value = record(armValue, armKeys, "strategy arm");
      schema(value.schemaVersion, "strategy arm");
      const currentOperation = operation(value.operation);
      const strategyId = id(value.strategyId, "arm.strategyId");
      const strategy = catalog.strategies.find(
        (current) => current.strategyId === strategyId,
      );
      if (!strategy || !strategy.operations.includes(currentOperation))
        fail("strategy arm catalog binding is invalid");
      const strategyDigest = sha(value.strategyDigest, "arm.strategyDigest");
      if (strategyDigest !== strategy.strategyDigest)
        fail("strategy arm digest binding is invalid");
      return freeze({
        schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
        operation: currentOperation,
        strategyId,
        strategyDigest,
        weightMicros: integerRange(
          value.weightMicros,
          "arm.weightMicros",
          policy.policy.minimumWeightMicros,
          policy.policy.maximumWeightMicros,
        ),
        selectionCount: nonNegative(value.selectionCount, "arm.selectionCount"),
        feedbackCount: nonNegative(value.feedbackCount, "arm.feedbackCount"),
        cumulativeRewardMicros: nonNegative(
          value.cumulativeRewardMicros,
          "arm.cumulativeRewardMicros",
        ),
        unsafeCount: nonNegative(value.unsafeCount, "arm.unsafeCount"),
        quarantinedUntilLogicalMs: nonNegative(
          value.quarantinedUntilLogicalMs,
          "arm.quarantinedUntilLogicalMs",
        ),
      });
    })
    .sort(armOrder);
  const expected = catalog.strategies
    .flatMap((strategy) =>
      strategy.operations.map(
        (currentOperation) => `${currentOperation}\u0000${strategy.strategyId}`,
      ),
    )
    .sort(compare);
  const actual = arms
    .map(
      ({ operation: currentOperation, strategyId }) =>
        `${currentOperation}\u0000${strategyId}`,
    )
    .sort(compare);
  if (!same(expected, actual)) fail("strategy arm coverage is incomplete");
  return freeze(arms);
}

function normalizeOperationStates(
  input: readonly LocalStrategyOperationStateV1[],
): readonly LocalStrategyOperationStateV1[] {
  if (
    !Array.isArray(input) ||
    input.length !== LOCAL_STRATEGY_OPERATIONS_V1.length
  )
    fail("strategy operation states are invalid");
  const values = input
    .map((stateValue) => {
      const value = record(
        stateValue,
        operationStateKeys,
        "strategy operation state",
      );
      schema(value.schemaVersion, "strategy operation state");
      if (typeof value.paused !== "boolean")
        fail("strategy operation paused flag is invalid");
      return freeze({
        schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
        operation: operation(value.operation),
        paused: value.paused,
        baselineOnlyUntilLogicalMs: nonNegative(
          value.baselineOnlyUntilLogicalMs,
          "operation.baselineOnlyUntilLogicalMs",
        ),
      });
    })
    .sort((a, b) => compare(a.operation, b.operation));
  unique(
    values.map(({ operation: current }) => current),
    "operation states",
  );
  if (
    !same(
      values.map(({ operation: current }) => current),
      [...LOCAL_STRATEGY_OPERATIONS_V1].sort(compare),
    )
  )
    fail("strategy operation state coverage is incomplete");
  return freeze(values);
}

function normalizePending(
  input: readonly LocalStrategyPendingDecisionV1[],
  maximum: number,
): readonly LocalStrategyPendingDecisionV1[] {
  if (!Array.isArray(input) || input.length > maximum)
    fail("strategy pending decisions are invalid");
  const values = input
    .map((pendingValue) => {
      const value = record(
        pendingValue,
        pendingKeys,
        "strategy pending decision",
      );
      schema(value.schemaVersion, "strategy pending decision");
      const selectedAtLogicalMs = nonNegative(
        value.selectedAtLogicalMs,
        "pending.selectedAtLogicalMs",
      );
      const feedbackExpiresAtLogicalMs = positive(
        value.feedbackExpiresAtLogicalMs,
        "pending.feedbackExpiresAtLogicalMs",
      );
      if (feedbackExpiresAtLogicalMs <= selectedAtLogicalMs)
        fail("strategy pending feedback interval is invalid");
      return freeze({
        schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
        decisionId: id(value.decisionId, "pending.decisionId"),
        decisionDigest: sha(value.decisionDigest, "pending.decisionDigest"),
        requestId: id(value.requestId, "pending.requestId"),
        requestDigest: sha(value.requestDigest, "pending.requestDigest"),
        operation: operation(value.operation),
        strategyId: id(value.strategyId, "pending.strategyId"),
        strategyDigest: sha(value.strategyDigest, "pending.strategyDigest"),
        contextDigest: sha(value.contextDigest, "pending.contextDigest"),
        selectedAtLogicalMs,
        feedbackExpiresAtLogicalMs,
      });
    })
    .sort(pendingOrder);
  unique(
    values.map(({ decisionDigest }) => decisionDigest),
    "pending decision digests",
  );
  return freeze(values);
}

function normalizeSafetyHeads(
  input: readonly LocalStrategySafetyHeadV1[],
  maximum: number,
): readonly LocalStrategySafetyHeadV1[] {
  if (!Array.isArray(input) || input.length > maximum)
    fail("strategy safety heads are invalid");
  const values = input
    .map((headValue) => {
      const value = record(headValue, safetyHeadKeys, "strategy safety head");
      schema(value.schemaVersion, "strategy safety head");
      const body = freeze({
        schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
        headKey: id(value.headKey, "safetyHead.headKey"),
        strategyId: id(value.strategyId, "safetyHead.strategyId"),
        dimension: safetyDimension(value.dimension),
        sourceId: id(value.sourceId, "safetyHead.sourceId"),
        sourceVersion: positive(
          value.sourceVersion,
          "safetyHead.sourceVersion",
        ),
        sourceImplementationDigest: sha(
          value.sourceImplementationDigest,
          "safetyHead.sourceImplementationDigest",
        ),
        sourceRevision: nonNegative(
          value.sourceRevision,
          "safetyHead.sourceRevision",
        ),
        signalDigest: sha(value.signalDigest, "safetyHead.signalDigest"),
        expiresAtLogicalMs: positive(
          value.expiresAtLogicalMs,
          "safetyHead.expiresAtLogicalMs",
        ),
      });
      if (body.headKey !== safetyHeadKey(body))
        fail("strategy safety head key is invalid");
      return body;
    })
    .sort(safetyHeadOrder);
  unique(
    values.map(({ headKey }) => headKey),
    "safety head keys",
  );
  return freeze(values);
}

function normalizeFeedbackHeads(
  input: readonly LocalStrategyFeedbackHeadV1[],
  maximum: number,
): readonly LocalStrategyFeedbackHeadV1[] {
  if (!Array.isArray(input) || input.length > maximum)
    fail("strategy feedback heads are invalid");
  const values = input
    .map((headValue) => {
      const value = record(
        headValue,
        feedbackHeadKeys,
        "strategy feedback head",
      );
      schema(value.schemaVersion, "strategy feedback head");
      const body = freeze({
        schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
        headKey: id(value.headKey, "feedbackHead.headKey"),
        sourceId: id(value.sourceId, "feedbackHead.sourceId"),
        sourceVersion: positive(
          value.sourceVersion,
          "feedbackHead.sourceVersion",
        ),
        sourceImplementationDigest: sha(
          value.sourceImplementationDigest,
          "feedbackHead.sourceImplementationDigest",
        ),
        sourceRevision: nonNegative(
          value.sourceRevision,
          "feedbackHead.sourceRevision",
        ),
        feedbackDigest: sha(
          value.feedbackDigest,
          "feedbackHead.feedbackDigest",
        ),
        decisionDigest: sha(
          value.decisionDigest,
          "feedbackHead.decisionDigest",
        ),
        outcomeId: id(value.outcomeId, "feedbackHead.outcomeId"),
      });
      if (body.headKey !== feedbackHeadKey(body))
        fail("strategy feedback head key is invalid");
      return body;
    })
    .sort(feedbackHeadOrder);
  unique(
    values.map(({ headKey }) => headKey),
    "feedback head keys",
  );
  return freeze(values);
}

function normalizeSafetySignals(
  input: readonly LocalStrategySafetySignalV1[],
  maximumReasonCodes: number,
): readonly LocalStrategySafetySignalV1[] {
  if (!Array.isArray(input) || input.length > 256 * 5)
    fail("strategy safety signals are invalid");
  const values = input
    .map(validateLocalStrategySafetySignalV1)
    .sort(safetySignalOrder);
  for (const signal of values)
    if (signal.reasonCodes.length > maximumReasonCodes)
      fail("strategy safety signal exceeds the reason-code limit");
  unique(
    values.map(
      ({ strategyId, dimension }) => `${strategyId}\u0000${dimension}`,
    ),
    "strategy safety signal dimensions",
  );
  return freeze(values);
}

function assertSafetySignalBindings(
  signals: readonly LocalStrategySafetySignalV1[],
  request: LocalStrategySelectionRequestV1,
  strategies: readonly LocalStrategyDefinitionV1[],
): void {
  for (const signal of signals) {
    const strategy = strategies.find(
      ({ strategyId }) => strategyId === signal.strategyId,
    );
    if (
      !strategy ||
      signal.strategyDigest !== strategy.strategyDigest ||
      signal.requestId !== request.requestId ||
      signal.requestDigest !== request.requestDigest
    )
      fail("strategy safety signal binding is invalid");
  }
}

function signalInvalidity(
  signal: LocalStrategySafetySignalV1,
  logicalTimeMs: number,
  policy: LocalStrategyAdaptationPolicyRecordV1,
): string | null {
  if (signal.observedAtLogicalMs > logicalTimeMs)
    return `safety_signal_future_dated:${signal.dimension}`;
  if (signal.expiresAtLogicalMs <= logicalTimeMs)
    return `safety_signal_expired:${signal.dimension}`;
  if (
    signal.expiresAtLogicalMs - signal.observedAtLogicalMs >
    policy.policy.limits.maximumSafetySignalTtlMs
  )
    return `safety_signal_ttl_exceeded:${signal.dimension}`;
  return null;
}

export function createLocalStrategyCollectivePriorV1(
  input: Omit<LocalStrategyCollectivePriorV1, "priorDigest">,
): LocalStrategyCollectivePriorV1 {
  const value = record(
    input,
    [
      "certificateDigest",
      "confidenceBps",
      "expiresAtLogicalMs",
      "observedAtLogicalMs",
      "operation",
      "outcome",
      "requestDigest",
      "requestId",
      "requestedInfluenceBps",
      "schemaVersion",
      "scoreMicros",
      "sourceId",
      "sourceImplementationDigest",
      "sourceVersion",
      "strategyDigest",
      "strategyId",
    ],
    "collective strategy prior input",
  );
  schema(value.schemaVersion, "collective strategy prior");
  const observedAtLogicalMs = nonNegative(
    value.observedAtLogicalMs,
    "prior.observedAtLogicalMs",
  );
  const expiresAtLogicalMs = positive(
    value.expiresAtLogicalMs,
    "prior.expiresAtLogicalMs",
  );
  if (expiresAtLogicalMs <= observedAtLogicalMs)
    fail("collective strategy prior lifetime is invalid");
  const body = freeze({
    schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
    requestId: id(value.requestId, "prior.requestId"),
    requestDigest: sha(value.requestDigest, "prior.requestDigest"),
    operation: operation(value.operation),
    strategyId: id(value.strategyId, "prior.strategyId"),
    strategyDigest: sha(value.strategyDigest, "prior.strategyDigest"),
    sourceId: id(value.sourceId, "prior.sourceId"),
    sourceVersion: positive(value.sourceVersion, "prior.sourceVersion"),
    sourceImplementationDigest: sha(
      value.sourceImplementationDigest,
      "prior.sourceImplementationDigest",
    ),
    certificateDigest: sha(
      value.certificateDigest,
      "prior.certificateDigest",
    ),
    outcome: oneOf(
      value.outcome,
      ["success", "failure", "unsafe", "indeterminate"],
      "prior.outcome",
    ) as LocalStrategyCollectivePriorV1["outcome"],
    scoreMicros: integerRange(
      value.scoreMicros,
      "prior.scoreMicros",
      0,
      MICROS,
    ),
    confidenceBps: basisPoints(
      value.confidenceBps,
      "prior.confidenceBps",
    ),
    requestedInfluenceBps: basisPoints(
      value.requestedInfluenceBps,
      "prior.requestedInfluenceBps",
    ),
    observedAtLogicalMs,
    expiresAtLogicalMs,
  });
  return freeze({
    ...body,
    priorDigest: digest("local-strategy-collective-prior", body),
  });
}

export function validateLocalStrategyCollectivePriorV1(
  input: unknown,
): LocalStrategyCollectivePriorV1 {
  const value = record(
    input,
    [
      "certificateDigest",
      "confidenceBps",
      "expiresAtLogicalMs",
      "observedAtLogicalMs",
      "operation",
      "outcome",
      "priorDigest",
      "requestDigest",
      "requestId",
      "requestedInfluenceBps",
      "schemaVersion",
      "scoreMicros",
      "sourceId",
      "sourceImplementationDigest",
      "sourceVersion",
      "strategyDigest",
      "strategyId",
    ],
    "collective strategy prior",
  );
  const { priorDigest, ...body } = value;
  const rebuilt = createLocalStrategyCollectivePriorV1(
    body as unknown as Omit<LocalStrategyCollectivePriorV1, "priorDigest">,
  );
  if (priorDigest !== rebuilt.priorDigest)
    fail("collective strategy prior digest is invalid");
  return rebuilt;
}

function normalizeCollectivePriorConfiguration(
  input: unknown,
): LocalStrategyCollectivePriorConfigurationV1 {
  const value = record(
    input,
    [
      "maximumInfluenceBps",
      "maximumPriorTtlMs",
      "minimumConfidenceBps",
      "sourceId",
      "sourceImplementationDigest",
      "sourceVersion",
    ],
    "collective strategy prior configuration",
  );
  return freeze({
    sourceId: id(value.sourceId, "priorConfiguration.sourceId"),
    sourceVersion: positive(
      value.sourceVersion,
      "priorConfiguration.sourceVersion",
    ),
    sourceImplementationDigest: sha(
      value.sourceImplementationDigest,
      "priorConfiguration.sourceImplementationDigest",
    ),
    minimumConfidenceBps: basisPoints(
      value.minimumConfidenceBps,
      "priorConfiguration.minimumConfidenceBps",
    ),
    maximumInfluenceBps: basisPoints(
      value.maximumInfluenceBps,
      "priorConfiguration.maximumInfluenceBps",
    ),
    maximumPriorTtlMs: bounded(
      value.maximumPriorTtlMs,
      "priorConfiguration.maximumPriorTtlMs",
      30 * 86_400_000,
    ),
  });
}

function normalizeCollectivePriors(
  input: readonly LocalStrategyCollectivePriorV1[],
  request: LocalStrategySelectionRequestV1,
  configuration: LocalStrategyCollectivePriorConfigurationV1 | null,
): readonly LocalStrategyCollectivePriorV1[] {
  if (!Array.isArray(input) || input.length > 16)
    fail("collective strategy priors are invalid");
  if (configuration === null) {
    if (input.length > 0)
      fail("collective strategy priors are not configured");
    return freeze([]);
  }
  const values = input
    .map(validateLocalStrategyCollectivePriorV1)
    .sort((left, right) => compare(left.strategyId, right.strategyId));
  unique(
    values.map(({ strategyId }) => strategyId),
    "collective prior strategy IDs",
  );
  for (const prior of values)
    if (
      prior.requestId !== request.requestId ||
      prior.requestDigest !== request.requestDigest ||
      prior.operation !== request.operation ||
      prior.sourceId !== configuration.sourceId ||
      prior.sourceVersion !== configuration.sourceVersion ||
      prior.sourceImplementationDigest !==
        configuration.sourceImplementationDigest ||
      prior.observedAtLogicalMs > request.logicalTimeMs ||
      prior.expiresAtLogicalMs <= request.logicalTimeMs ||
      prior.expiresAtLogicalMs - prior.observedAtLogicalMs >
        configuration.maximumPriorTtlMs
    )
      fail("collective strategy prior binding is invalid");
  return freeze(values);
}

function applyCollectivePriors(
  probabilities: readonly LocalStrategyProbabilityV1[],
  strategies: readonly LocalStrategyDefinitionV1[],
  baselineStrategyId: string,
  baselineFloorBps: number,
  configuration: LocalStrategyCollectivePriorConfigurationV1 | null,
  priors: readonly LocalStrategyCollectivePriorV1[],
): {
  readonly probabilities: readonly LocalStrategyProbabilityV1[];
  readonly appliedInfluenceBps: number;
} {
  if (!configuration || probabilities.length === 0 || priors.length === 0)
    return freeze({ probabilities, appliedInfluenceBps: 0 });
  const eligible = new Map(strategies.map((strategy) => [strategy.strategyId, strategy]));
  const favorable = priors.filter((prior) => {
    const strategy = eligible.get(prior.strategyId);
    return (
      prior.outcome === "success" &&
      prior.scoreMicros > 0 &&
      prior.confidenceBps >= configuration.minimumConfidenceBps &&
      prior.requestedInfluenceBps > 0 &&
      strategy?.strategyDigest === prior.strategyDigest
    );
  });
  if (favorable.length === 0)
    return freeze({ probabilities, appliedInfluenceBps: 0 });
  const requestedInfluenceBps = Math.min(
    configuration.maximumInfluenceBps,
    ...favorable.map(({ requestedInfluenceBps }) => requestedInfluenceBps),
  );
  const confidenceBps = Math.min(
    ...favorable.map(({ confidenceBps }) => confidenceBps),
  );
  const appliedInfluenceBps = Math.floor(
    (requestedInfluenceBps * confidenceBps) / BPS,
  );
  if (appliedInfluenceBps === 0)
    return freeze({ probabilities, appliedInfluenceBps: 0 });
  const rawWeights = new Map(
    favorable.map((prior) => [
      prior.strategyId,
      prior.scoreMicros * prior.confidenceBps,
    ]),
  );
  const totalWeight = [...rawWeights.values()].reduce(
    (sum, weight) => sum + weight,
    0,
  );
  const entries = probabilities.map((probability) => {
    const raw = rawWeights.get(probability.strategyId) ?? 0;
    const targetNumerator = raw * BPS;
    const targetBps = Math.floor(targetNumerator / totalWeight);
    const mixedNumerator =
      probability.probabilityBps * (BPS - appliedInfluenceBps) +
      targetBps * appliedInfluenceBps;
    return {
      probability,
      probabilityBps: Math.floor(mixedNumerator / BPS),
      remainder: mixedNumerator % BPS,
    };
  });
  let missing =
    BPS - entries.reduce((sum, entry) => sum + entry.probabilityBps, 0);
  for (const entry of [...entries].sort(
    (left, right) =>
      right.remainder - left.remainder ||
      compare(left.probability.strategyId, right.probability.strategyId),
  )) {
    if (missing <= 0) break;
    entry.probabilityBps += 1;
    missing -= 1;
  }
  const baseline = entries.find(
    ({ probability }) => probability.strategyId === baselineStrategyId,
  );
  if (!baseline) fail("collective strategy prior removed the safe baseline");
  let deficit = Math.max(0, baselineFloorBps - baseline.probabilityBps);
  for (const entry of [...entries]
    .filter(({ probability }) => probability.strategyId !== baselineStrategyId)
    .sort(
      (left, right) =>
        right.probabilityBps - left.probabilityBps ||
        compare(left.probability.strategyId, right.probability.strategyId),
    )) {
    if (deficit <= 0) break;
    const transfer = Math.min(deficit, entry.probabilityBps);
    entry.probabilityBps -= transfer;
    baseline.probabilityBps += transfer;
    deficit -= transfer;
  }
  if (deficit > 0)
    fail("collective strategy prior violates the baseline probability floor");
  const priorDigests = freeze(
    favorable.map(({ priorDigest }) => priorDigest).sort(compare),
  );
  return freeze({
    appliedInfluenceBps,
    probabilities: freeze(
      entries.map(({ probability, probabilityBps }) =>
        freeze({ ...probability, probabilityBps, priorDigests }),
      ),
    ),
  });
}

function computeProbabilities(
  strategies: readonly LocalStrategyDefinitionV1[],
  arms: readonly LocalStrategyArmStateV1[],
  currentOperation: LocalStrategyOperationV1,
  baselineStrategyId: string,
  policy: LocalStrategyAdaptationPolicyRecordV1,
  eligibility: ReadonlyMap<
    string,
    {
      readonly signalDigests: readonly PlanningDigestV1[];
    }
  >,
): readonly LocalStrategyProbabilityV1[] {
  const ordered = [...strategies].sort((a, b) =>
    compare(a.strategyId, b.strategyId),
  );
  const weights = ordered.map(
    ({ strategyId }) => armFor(arms, currentOperation, strategyId).weightMicros,
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const exploration = policy.policy.explorationRateBps;
  const exploitation = BPS - exploration;
  const explorationBase = Math.floor(exploration / ordered.length);
  let explorationRemainder = exploration % ordered.length;
  const probabilities = ordered.map((strategy, index) => {
    const explorationShare =
      explorationBase + (explorationRemainder-- > 0 ? 1 : 0);
    const proportional = Math.floor(
      (weights[index]! * exploitation) / totalWeight,
    );
    return {
      strategy,
      probabilityBps: explorationShare + proportional,
      explorationShare,
      remainder: (weights[index]! * exploitation) % totalWeight,
    };
  });
  let missing =
    BPS -
    probabilities.reduce((sum, current) => sum + current.probabilityBps, 0);
  for (const current of [...probabilities].sort(
    (a, b) =>
      b.remainder - a.remainder ||
      compare(a.strategy.strategyId, b.strategy.strategyId),
  )) {
    if (missing <= 0) break;
    current.probabilityBps += 1;
    missing -= 1;
  }
  const baseline = probabilities.find(
    ({ strategy }) => strategy.strategyId === baselineStrategyId,
  );
  if (!baseline) fail("safe baseline is absent from the eligible strategy set");
  let deficit = Math.max(
    0,
    policy.policy.baselineProbabilityFloorBps - baseline.probabilityBps,
  );
  for (const current of [...probabilities]
    .filter(({ strategy }) => strategy.strategyId !== baselineStrategyId)
    .sort(
      (a, b) =>
        b.probabilityBps - a.probabilityBps ||
        compare(a.strategy.strategyId, b.strategy.strategyId),
    )) {
    if (deficit <= 0) break;
    const transferable = Math.max(
      0,
      current.probabilityBps - current.explorationShare,
    );
    const transfer = Math.min(deficit, transferable);
    current.probabilityBps -= transfer;
    baseline.probabilityBps += transfer;
    deficit -= transfer;
  }
  if (deficit > 0)
    fail("baseline probability floor cannot be satisfied by this policy");
  return freeze(
    probabilities.map(({ strategy, probabilityBps }) =>
      freeze({
        schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
        strategyId: strategy.strategyId,
        strategyDigest: strategy.strategyDigest,
        probabilityBps,
        signalDigests:
          eligibility.get(strategy.strategyId)?.signalDigests ?? freeze([]),
        priorDigests: freeze([] as PlanningDigestV1[]),
      }),
    ),
  );
}

function selectProbability(
  probabilities: readonly LocalStrategyProbabilityV1[],
  drawBps: number,
): LocalStrategyProbabilityV1 | null {
  let upper = 0;
  for (const probability of probabilities) {
    upper += probability.probabilityBps;
    if (drawBps < upper) return probability;
  }
  return null;
}

function assertFeedbackBindings(
  signals: readonly LocalStrategyFeedbackSignalV1[],
  pending: LocalStrategyPendingDecisionV1,
): void {
  for (const signal of signals)
    if (
      signal.decisionId !== pending.decisionId ||
      signal.decisionDigest !== pending.decisionDigest ||
      signal.requestId !== pending.requestId ||
      signal.requestDigest !== pending.requestDigest ||
      signal.operation !== pending.operation ||
      signal.strategyId !== pending.strategyId ||
      signal.strategyDigest !== pending.strategyDigest ||
      signal.contextDigest !== pending.contextDigest
    )
      fail("strategy feedback causal binding is invalid");
  const first = signals[0]!;
  if (
    signals.some(
      (signal) =>
        signal.outcomeId !== first.outcomeId ||
        signal.outcomeRevision !== first.outcomeRevision,
    )
  )
    fail("feedback sources do not describe the same outcome revision");
}

function aggregateOutcome(
  signals: readonly LocalStrategyFeedbackSignalV1[],
): LocalStrategyFeedbackOutcomeV1 {
  const ranks: Record<LocalStrategyFeedbackOutcomeV1, number> = {
    success: 0,
    indeterminate: 1,
    failure: 2,
    unsafe: 3,
  };
  const ordered = signals
    .map(({ outcome }) => outcome)
    .sort((a, b) => ranks[a] - ranks[b] || compare(a, b));
  return ordered[Math.floor((ordered.length - 1) / 2)]!;
}

function deriveReward(
  signals: readonly LocalStrategyFeedbackSignalV1[],
  policy: LocalStrategyAdaptationPolicyRecordV1,
): number {
  let weighted = 0;
  let weights = 0;
  for (const metricPolicy of policy.policy.feedbackMetrics) {
    const values = signals
      .map((signal) =>
        signal.metrics.find(({ metric }) => metric === metricPolicy.metric),
      )
      .filter(
        (value): value is LocalStrategyFeedbackMetricValueV1 =>
          value !== undefined,
      )
      .map(({ valueMicros }) => valueMicros)
      .sort((a, b) => a - b);
    if (values.length !== signals.length)
      fail(`feedback metric is missing: ${metricPolicy.metric}`);
    const median = values[Math.floor((values.length - 1) / 2)]!;
    const directed =
      metricPolicy.direction === "maximize" ? median : MICROS - median;
    weighted += directed * metricPolicy.weight;
    weights += metricPolicy.weight;
  }
  return Math.floor(weighted / weights);
}

function updateArmFromFeedback(input: {
  readonly arms: readonly LocalStrategyArmStateV1[];
  readonly operations: readonly LocalStrategyOperationStateV1[];
  readonly pending: LocalStrategyPendingDecisionV1;
  readonly outcome: LocalStrategyFeedbackOutcomeV1;
  readonly rewardMicros: number;
  readonly logicalTimeMs: number;
  readonly catalog: LocalStrategyCatalogV1;
  readonly policy: LocalStrategyAdaptationPolicyRecordV1;
}): {
  readonly arms: readonly LocalStrategyArmStateV1[];
  readonly operations: readonly LocalStrategyOperationStateV1[];
  readonly reasonCodes: readonly string[];
} {
  const baseline = input.catalog.baselines[input.pending.operation];
  const reasons: string[] = [];
  let operations = input.operations;
  const arms = input.arms.map((arm) => {
    if (
      arm.operation !== input.pending.operation ||
      arm.strategyId !== input.pending.strategyId
    )
      return arm;
    let weightMicros: number;
    let quarantinedUntilLogicalMs = arm.quarantinedUntilLogicalMs;
    let unsafeCount = arm.unsafeCount;
    if (input.outcome === "unsafe") {
      weightMicros = Math.max(
        input.policy.policy.minimumWeightMicros,
        mulDiv(
          arm.weightMicros,
          BPS - input.policy.policy.unsafePenaltyBps,
          BPS,
        ),
      );
      unsafeCount += 1;
      if (arm.strategyId === baseline) {
        operations = freeze(
          input.operations.map((current) =>
            current.operation === input.pending.operation
              ? freeze({ ...current, paused: true })
              : current,
          ),
        );
        reasons.push("unsafe_baseline_paused_operation");
      } else {
        quarantinedUntilLogicalMs =
          input.logicalTimeMs + input.policy.policy.quarantineDurationMs;
        operations = freeze(
          input.operations.map((current) =>
            current.operation === input.pending.operation
              ? freeze({
                  ...current,
                  baselineOnlyUntilLogicalMs: Math.max(
                    current.baselineOnlyUntilLogicalMs,
                    quarantinedUntilLogicalMs,
                  ),
                })
              : current,
          ),
        );
        reasons.push("unsafe_strategy_quarantined");
        reasons.push("operation_rolled_back_to_baseline");
      }
    } else {
      const centered = input.rewardMicros - Math.floor(MICROS / 2);
      const delta = mulDiv(
        mulDiv(arm.weightMicros, input.policy.policy.learningRateBps, BPS),
        centered,
        MICROS,
      );
      weightMicros = Math.min(
        input.policy.policy.maximumWeightMicros,
        Math.max(
          input.policy.policy.minimumWeightMicros,
          arm.weightMicros + delta,
        ),
      );
    }
    return freeze({
      ...arm,
      weightMicros,
      feedbackCount: arm.feedbackCount + 1,
      cumulativeRewardMicros: arm.cumulativeRewardMicros + input.rewardMicros,
      unsafeCount,
      quarantinedUntilLogicalMs,
    });
  });
  return freeze({
    arms: freeze(arms),
    operations,
    reasonCodes: freeze(reasons.sort(compare)),
  });
}

function quarantineForEquivocation(
  arms: readonly LocalStrategyArmStateV1[],
  operations: readonly LocalStrategyOperationStateV1[],
  pending: LocalStrategyPendingDecisionV1,
  catalog: LocalStrategyCatalogV1,
  policy: LocalStrategyAdaptationPolicyRecordV1,
  logicalTimeMs: number,
): {
  readonly arms: readonly LocalStrategyArmStateV1[];
  readonly operations: readonly LocalStrategyOperationStateV1[];
} {
  const baseline = catalog.baselines[pending.operation];
  if (pending.strategyId === baseline)
    return freeze({
      arms,
      operations: freeze(
        operations.map((current) =>
          current.operation === pending.operation
            ? freeze({ ...current, paused: true })
            : current,
        ),
      ),
    });
  const until = logicalTimeMs + policy.policy.quarantineDurationMs;
  return freeze({
    arms: freeze(
      arms.map((arm) =>
        arm.operation === pending.operation &&
        arm.strategyId === pending.strategyId
          ? freeze({ ...arm, quarantinedUntilLogicalMs: until })
          : arm,
      ),
    ),
    operations: freeze(
      operations.map((current) =>
        current.operation === pending.operation
          ? freeze({
              ...current,
              baselineOnlyUntilLogicalMs: Math.max(
                current.baselineOnlyUntilLogicalMs,
                until,
              ),
            })
          : current,
      ),
    ),
  });
}

function feedbackDecision(input: {
  readonly state: LocalStrategyAdaptationStateV1;
  readonly batch: LocalStrategyFeedbackBatchV1;
  readonly status: LocalStrategyFeedbackDecisionV1["status"];
  readonly outcome: LocalStrategyFeedbackOutcomeV1 | null;
  readonly rewardMicros: number | null;
  readonly reasonCodes: readonly string[];
  readonly committedStateRevision: number;
}): LocalStrategyFeedbackDecisionV1 {
  const body = freeze({
    schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
    batchId: input.batch.batchId,
    batchDigest: input.batch.batchDigest,
    decisionId: input.batch.decisionId,
    decisionDigest: input.batch.decisionDigest,
    status: input.status,
    outcome: input.outcome,
    rewardMicros: input.rewardMicros,
    reasonCodes: freeze([...input.reasonCodes].sort(compare)),
    priorStateRevision: input.state.revision,
    committedStateRevision: input.committedStateRevision,
  });
  const feedbackDecisionDigest = digest(
    "local-strategy-feedback-decision",
    body,
  );
  return freeze({
    ...body,
    feedbackDecisionId: `local-strategy-feedback-decision.${feedbackDecisionDigest.slice(7)}`,
    feedbackDecisionDigest,
  });
}

function safetyHeadFromSignal(
  signal: LocalStrategySafetySignalV1,
): LocalStrategySafetyHeadV1 {
  return freeze({
    schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
    headKey: safetyHeadKey(signal),
    strategyId: signal.strategyId,
    dimension: signal.dimension,
    sourceId: signal.sourceId,
    sourceVersion: signal.sourceVersion,
    sourceImplementationDigest: signal.sourceImplementationDigest,
    sourceRevision: signal.sourceRevision,
    signalDigest: signal.signalDigest,
    expiresAtLogicalMs: signal.expiresAtLogicalMs,
  });
}

function feedbackHeadFromSignal(
  signal: LocalStrategyFeedbackSignalV1,
): LocalStrategyFeedbackHeadV1 {
  return freeze({
    schemaVersion: LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1,
    headKey: feedbackHeadKey(signal),
    sourceId: signal.sourceId,
    sourceVersion: signal.sourceVersion,
    sourceImplementationDigest: signal.sourceImplementationDigest,
    sourceRevision: signal.sourceRevision,
    feedbackDigest: signal.feedbackDigest,
    decisionDigest: signal.decisionDigest,
    outcomeId: signal.outcomeId,
  });
}

function safetyHeadKey(input: {
  readonly strategyId: string;
  readonly dimension: LocalStrategySafetyDimensionV1;
  readonly sourceId: string;
}): string {
  const value = digest("local-strategy-safety-head", {
    strategyId: id(input.strategyId, "safetyHead.strategyId"),
    dimension: safetyDimension(input.dimension),
    sourceId: id(input.sourceId, "safetyHead.sourceId"),
  });
  return `local-strategy-safety-head.${value.slice(7)}`;
}

function feedbackHeadKey(input: { readonly sourceId: string }): string {
  const value = digest("local-strategy-feedback-head", {
    sourceId: id(input.sourceId, "feedbackHead.sourceId"),
  });
  return `local-strategy-feedback-head.${value.slice(7)}`;
}

function armFor(
  arms: readonly LocalStrategyArmStateV1[],
  currentOperation: LocalStrategyOperationV1,
  strategyId: string,
): LocalStrategyArmStateV1 {
  const arm = arms.find(
    (current) =>
      current.operation === currentOperation &&
      current.strategyId === strategyId,
  );
  if (!arm) fail("strategy arm is missing");
  return arm;
}

function armOrder(
  left: LocalStrategyArmStateV1,
  right: LocalStrategyArmStateV1,
): number {
  return (
    compare(left.operation, right.operation) ||
    compare(left.strategyId, right.strategyId)
  );
}

function pendingOrder(
  left: LocalStrategyPendingDecisionV1,
  right: LocalStrategyPendingDecisionV1,
): number {
  return (
    left.selectedAtLogicalMs - right.selectedAtLogicalMs ||
    compare(left.decisionDigest, right.decisionDigest)
  );
}

function safetySignalOrder(
  left: LocalStrategySafetySignalV1,
  right: LocalStrategySafetySignalV1,
): number {
  return (
    compare(left.strategyId, right.strategyId) ||
    compare(left.dimension, right.dimension) ||
    compare(left.sourceId, right.sourceId)
  );
}

function safetyHeadOrder(
  left: LocalStrategySafetyHeadV1,
  right: LocalStrategySafetyHeadV1,
): number {
  return compare(left.headKey, right.headKey);
}

function feedbackSignalOrder(
  left: LocalStrategyFeedbackSignalV1,
  right: LocalStrategyFeedbackSignalV1,
): number {
  return compare(left.sourceId, right.sourceId);
}

function feedbackHeadOrder(
  left: LocalStrategyFeedbackHeadV1,
  right: LocalStrategyFeedbackHeadV1,
): number {
  return compare(left.headKey, right.headKey);
}

function mulDiv(left: number, right: number, divisor: number): number {
  const result = (BigInt(left) * BigInt(right)) / BigInt(divisor);
  const number = Number(result);
  if (!Number.isSafeInteger(number)) fail("fixed-point arithmetic overflowed");
  return number;
}

function operation(input: unknown): LocalStrategyOperationV1 {
  if (typeof input !== "string" || !operationSet.has(input))
    fail("strategy operation is invalid");
  return input as LocalStrategyOperationV1;
}

function safetyDimension(input: unknown): LocalStrategySafetyDimensionV1 {
  if (typeof input !== "string" || !safetyDimensionSet.has(input))
    fail("strategy safety dimension is invalid");
  return input as LocalStrategySafetyDimensionV1;
}

function disposition(input: unknown): LocalStrategySafetyDispositionV1 {
  if (typeof input !== "string" || !dispositionSet.has(input))
    fail("strategy safety disposition is invalid");
  return input as LocalStrategySafetyDispositionV1;
}

function feedbackMetric(input: unknown): LocalStrategyFeedbackMetricV1 {
  if (typeof input !== "string" || !feedbackMetricSet.has(input))
    fail("strategy feedback metric is invalid");
  return input as LocalStrategyFeedbackMetricV1;
}

function feedbackOutcome(input: unknown): LocalStrategyFeedbackOutcomeV1 {
  if (typeof input !== "string" || !outcomeSet.has(input))
    fail("strategy feedback outcome is invalid");
  return input as LocalStrategyFeedbackOutcomeV1;
}

function schema(input: unknown, label: string): void {
  if (input !== LOCAL_STRATEGY_ADAPTATION_SCHEMA_VERSION_V1)
    fail(`${label} schema is invalid`);
}

function id(input: unknown, label: string): string {
  if (
    typeof input !== "string" ||
    input.length < 1 ||
    input.length > MAX_IDENTIFIER_LENGTH ||
    !IDENTIFIER.test(input)
  )
    fail(`${label} is invalid`);
  return input;
}

function nullableId(input: unknown, label: string): string | null {
  return input === null ? null : id(input, label);
}

function sha(input: unknown, label: string): PlanningDigestV1 {
  if (typeof input !== "string" || !DIGEST.test(input))
    fail(`${label} is invalid`);
  return input as PlanningDigestV1;
}

function positive(input: unknown, label: string): number {
  return integerRange(input, label, 1, Number.MAX_SAFE_INTEGER);
}

function nonNegative(input: unknown, label: string): number {
  return integerRange(input, label, 0, Number.MAX_SAFE_INTEGER);
}

function bounded(input: unknown, label: string, maximum: number): number {
  return integerRange(input, label, 1, maximum);
}

function basisPoints(input: unknown, label: string): number {
  return integerRange(input, label, 0, BPS);
}

function integerRange(
  input: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(input) ||
    (input as number) < minimum ||
    (input as number) > maximum
  )
    fail(`${label} is invalid`);
  return input as number;
}

function ids(
  input: unknown,
  label: string,
  maximum: number,
): readonly string[] {
  if (!Array.isArray(input) || input.length > maximum)
    fail(`${label} is invalid`);
  const values = input.map((value, index) => id(value, `${label}[${index}]`));
  const sorted = [...values].sort(compare);
  if (!same(values, sorted)) fail(`${label} must be sorted`);
  unique(values, label);
  return freeze(values);
}

function digests(
  input: unknown,
  label: string,
  maximum: number,
): readonly PlanningDigestV1[] {
  if (!Array.isArray(input) || input.length > maximum)
    fail(`${label} is invalid`);
  const values = input.map((value, index) => sha(value, `${label}[${index}]`));
  const sorted = [...values].sort(compare);
  if (!same(values, sorted)) fail(`${label} must be sorted`);
  unique(values, label);
  return freeze(values);
}

function reasons(input: unknown, maximum: number): readonly string[] {
  if (!Array.isArray(input) || input.length > maximum)
    fail("reason codes are invalid");
  const values = input.map((value) => {
    if (
      typeof value !== "string" ||
      value.length < 1 ||
      value.length > MAX_REASON_LENGTH ||
      !IDENTIFIER.test(value)
    )
      fail("reason code is invalid");
    return value;
  });
  const sorted = [...values].sort(compare);
  if (!same(values, sorted)) fail("reason codes must be sorted");
  unique(values, "reason codes");
  return freeze(values);
}

function enumArray(
  input: unknown,
  allowed: ReadonlySet<string>,
  label: string,
  maximum: number,
): readonly string[] {
  if (!Array.isArray(input) || input.length > maximum)
    fail(`${label} is invalid`);
  const values = input.map((value) => {
    if (typeof value !== "string" || !allowed.has(value))
      fail(`${label} is invalid`);
    return value;
  });
  const sorted = [...values].sort(compare);
  if (!same(values, sorted)) fail(`${label} must be sorted`);
  unique(values, label);
  return freeze(values);
}

function oneOf(
  input: unknown,
  allowed: readonly string[],
  label: string,
): string {
  if (typeof input !== "string" || !allowed.includes(input))
    fail(`${label} is invalid`);
  return input;
}

function record(
  input: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null) ||
    Object.getOwnPropertySymbols(input).length > 0
  )
    fail(`${label} is invalid`);
  const value = input as Record<string, unknown>;
  const actual = Object.keys(value).sort(compare);
  const expected = [...expectedKeys].sort(compare);
  if (!same(actual, expected)) fail(`${label} fields are invalid`);
  return value;
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label} are duplicated`);
}

function same(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function digest(domain: string, value: unknown): PlanningDigestV1 {
  return digestPlanningJsonV1(
    domain as Parameters<typeof digestPlanningJsonV1>[0],
    value as unknown as PlanningJson,
  );
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>))
      freeze(nested);
    Object.freeze(value);
  }
  return value;
}

function clone<T extends JsonValue | object>(value: T): T {
  return freeze(structuredClone(value));
}

function fail(message: string): never {
  throw new TypeError(message);
}
