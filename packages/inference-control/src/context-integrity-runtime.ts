import type { JsonValue } from "@agentplat/core";

import { canonicalizeControlJsonV1, digestControlJsonV1 } from "./canonical.js";
import {
  CONTEXT_INTEGRITY_MEMORY_TIERS_V1,
  CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
  CONTEXT_INTEGRITY_SOURCE_ZONES_V1,
  CONTEXT_INTEGRITY_STATE_FORMAT_V1,
  type ContextIntegrityAnalyzerV1,
  type ContextIntegrityAssessmentDispositionV1,
  type ContextIntegrityAssessmentV1,
  type ContextIntegrityCheckpointV1,
  type ContextIntegrityDecisionV1,
  type ContextIntegrityEphemeralContentV1,
  type ContextIntegrityEvaluationInputV1,
  type ContextIntegrityFilterBindingV1,
  type ContextIntegrityHeadV1,
  type ContextIntegrityHandoffEnvelopeV1,
  type ContextIntegrityInterventionCountsV1,
  type ContextIntegrityItemActionV1,
  type ContextIntegrityItemDecisionV1,
  type ContextIntegrityItemV1,
  type ContextIntegrityLimitsV1,
  type ContextIntegrityMemoryTierV1,
  type ContextIntegrityPolicyRecordV1,
  type ContextIntegrityPolicyV1,
  type ContextIntegrityPortV1,
  type ContextIntegrityReductionInputV1,
  type ContextIntegrityReductionResultV1,
  type ContextIntegrityRoleProjectionV1,
  type ContextIntegrityRuntimeOptionsV1,
  type ContextIntegrityScopeV1,
  type ContextIntegritySourceZoneV1,
  type ContextIntegrityStateStatusV1,
  type ContextIntegrityStateV1,
  type ContextIntegrityStoreV1,
  type ContextIntegrityTargetKindV1,
  type ContextIntegrityThresholdsV1,
  type ContextIntegrityWindowEntryV1,
  type ContextIntegrityRequestV1,
} from "./context-integrity-contracts.js";
import { sha256Hex } from "./sha256.js";
import {
  assertDigest,
  assertExactKeys,
  assertIdentifier,
  assertOneOf,
  assertSafeInteger,
  assertStrictJsonValue,
  deepFreeze,
  sortedUnique,
} from "./validation.js";

const encoder = new TextEncoder();
const checkpoints = [
  "pre_inference",
  "pre_step",
  "post_output",
  "pre_action",
] as const;
const targetKinds = ["context", "output", "action"] as const;
const assessmentDispositions = [
  "clear",
  "caution",
  "quarantine",
  "deny",
  "unavailable",
] as const;
const itemActions = [
  "admit",
  "restrict",
  "isolate",
  "require_corroboration",
  "deny",
] as const;
const stateStatuses = ["active", "degraded", "paused", "denied"] as const;

const policyKeys = [
  "adverseSignalsToPause",
  "allowEmptyAfterIsolation",
  "allowedFilterBindingDigests",
  "limits",
  "minimumCorroborationGroups",
  "parentPolicyDigest",
  "policyId",
  "policyVersion",
  "recoverySignalsRequired",
  "schemaVersion",
  "thresholds",
  "trustedSourceZones",
];
const policyRecordKeys = ["policy", "policyDigest", "schemaVersion"];
const filterBindingKeys = [
  "filterBindingDigest",
  "filterId",
  "filterImplementationDigest",
  "filterVersion",
  "schemaVersion",
];
const thresholdKeys = [
  "cautionRiskBps",
  "contradictionRiskBps",
  "denyRiskBps",
  "maximumUncertaintyBps",
  "quarantineRiskBps",
];
const limitKeys = [
  "maximumAssessmentTtlMs",
  "maximumCommitAttempts",
  "maximumCorroborationGroupsPerItem",
  "maximumDecisionTtlMs",
  "maximumEvidenceDigestsPerAssessment",
  "maximumItemsPerRequest",
  "maximumReasonCodesPerAssessment",
  "maximumRetainedHeads",
  "maximumSteps",
  "maximumThreatKindsPerAssessment",
  "rollingWindowAssessments",
];
const itemKeys = [
  "claimKeyDigest",
  "claimValueDigest",
  "contentDigest",
  "corroborationGroupIds",
  "expiresAtLogicalMs",
  "itemDigest",
  "itemId",
  "memoryTier",
  "observedAtLogicalMs",
  "provenanceDigest",
  "schemaVersion",
  "sourceId",
  "sourceRevision",
  "sourceVersion",
  "sourceZone",
];
const scopeKeys = ["agentId", "objectiveId", "sessionId", "tenantId"];
const requestKeys = [
  "checkpoint",
  "filterBindingDigest",
  "items",
  "logicalTimeMs",
  "requestDigest",
  "requestId",
  "schemaVersion",
  "scope",
  "targetKind",
];
const contentKeys = ["content", "contentDigest", "itemId", "mediaType"];
const assessmentKeys = [
  "analysisDigest",
  "analyzerId",
  "analyzerImplementationDigest",
  "analyzerRevision",
  "analyzerVersion",
  "assessedAtLogicalMs",
  "assessmentDigest",
  "assessmentId",
  "disposition",
  "evidenceDigests",
  "expiresAtLogicalMs",
  "instructionConflictBps",
  "itemDigest",
  "itemId",
  "reasonCodes",
  "requestDigest",
  "requestId",
  "riskBps",
  "schemaVersion",
  "threatKinds",
  "uncertaintyBps",
];
const headKeys = [
  "analysisDigest",
  "analyzerId",
  "analyzerRevision",
  "assessmentDigest",
  "contentDigest",
  "expiresAtLogicalMs",
  "headKey",
  "itemId",
  "schemaVersion",
  "sourceId",
  "sourceRevision",
  "sourceVersion",
];
const windowKeys = [
  "deniedItems",
  "evaluatedAtLogicalMs",
  "isolatedItems",
  "maximumRiskBps",
  "maximumUncertaintyBps",
  "requestDigest",
  "schemaVersion",
];
const interventionKeys = [
  "corroborationRequired",
  "denied",
  "isolated",
  "restricted",
];
const itemDecisionKeys = [
  "action",
  "assessmentDigest",
  "itemDigest",
  "itemId",
  "reasonCodes",
  "riskBps",
  "schemaVersion",
  "uncertaintyBps",
];
const decisionKeys = [
  "analyzerId",
  "analyzerImplementationDigest",
  "analyzerVersion",
  "committedStateRevision",
  "controllerId",
  "controllerVersion",
  "decisionDigest",
  "decisionId",
  "degraded",
  "disposition",
  "evaluatedAtLogicalMs",
  "expiresAtLogicalMs",
  "filterRequired",
  "implementationId",
  "items",
  "policyDigest",
  "policyId",
  "policyVersion",
  "priorStateRevision",
  "requestDigest",
  "requestId",
  "schemaVersion",
  "stateStatus",
];
const stateKeys = [
  "adverseStreak",
  "analyzerId",
  "analyzerImplementationDigest",
  "analyzerVersion",
  "controllerId",
  "controllerVersion",
  "degraded",
  "format",
  "heads",
  "implementationId",
  "interventionCounts",
  "lastDecision",
  "lastRequestDigest",
  "logicalTimeHighWaterMs",
  "policyDigest",
  "policyId",
  "policyVersion",
  "predecessorStateDigest",
  "recoveryStreak",
  "revision",
  "rollingWindow",
  "schemaVersion",
  "stateDigest",
  "stateKey",
  "status",
  "stepCount",
];
const handoffKeys = [
  "analyzerId",
  "analyzerImplementationDigest",
  "analyzerVersion",
  "contentClass",
  "controllerId",
  "controllerVersion",
  "exportedAtLogicalMs",
  "handoffDigest",
  "implementationId",
  "policyDigest",
  "schemaVersion",
  "sourceState",
  "sourceStateDigest",
  "sourceStateKey",
  "targetStateKey",
];

export function digestContextIntegrityJsonV1(
  domain:
    | "policy"
    | "item"
    | "request"
    | "analysis"
    | "assessment"
    | "head"
    | "decision"
    | "state"
    | "projection"
    | "filter"
    | "handoff",
  value: JsonValue,
): string {
  return `sha256:${sha256Hex(
    encoder.encode(
      `agentplat.inference-control/context-integrity/${domain}/v1\0${canonicalizeControlJsonV1(value)}`,
    ),
  )}`;
}

export function createContextIntegrityPolicyV1(
  input: ContextIntegrityPolicyV1,
): ContextIntegrityPolicyRecordV1 {
  const policy = normalizePolicy(input);
  return freeze({
    schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
    policy,
    policyDigest: digestContextIntegrityJsonV1(
      "policy",
      policy as unknown as JsonValue,
    ),
  });
}

export function validateContextIntegrityPolicyV1(
  input: unknown,
): ContextIntegrityPolicyRecordV1 {
  assertExactKeys(input, policyRecordKeys, "context integrity policy record");
  const value = input as Record<string, unknown>;
  if (value.schemaVersion !== CONTEXT_INTEGRITY_SCHEMA_VERSION_V1)
    fail("context_integrity_policy_schema_invalid");
  const rebuilt = createContextIntegrityPolicyV1(
    value.policy as ContextIntegrityPolicyV1,
  );
  if (value.policyDigest !== rebuilt.policyDigest)
    fail("context_integrity_policy_digest_invalid");
  return rebuilt;
}

export function createContextIntegrityFilterBindingV1(input: {
  readonly schemaVersion: 1;
  readonly filterId: string;
  readonly filterVersion: number;
  readonly filterImplementationDigest: string;
}): ContextIntegrityFilterBindingV1 {
  assertExactKeys(
    input,
    filterBindingKeys.filter((key) => key !== "filterBindingDigest"),
    "context integrity filter binding input",
  );
  if (input.schemaVersion !== CONTEXT_INTEGRITY_SCHEMA_VERSION_V1)
    fail("context_integrity_filter_binding_schema_invalid");
  const body = freeze({
    schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
    filterId: id(input.filterId, "filterId"),
    filterVersion: positive(input.filterVersion, "filterVersion"),
    filterImplementationDigest: sha(
      input.filterImplementationDigest,
      "filterImplementationDigest",
    ),
  });
  return freeze({
    ...body,
    filterBindingDigest: digestContextIntegrityJsonV1(
      "filter",
      body as unknown as JsonValue,
    ),
  });
}

export function validateContextIntegrityFilterBindingV1(
  input: unknown,
): ContextIntegrityFilterBindingV1 {
  assertExactKeys(input, filterBindingKeys, "context integrity filter binding");
  const value = input as unknown as ContextIntegrityFilterBindingV1;
  const rebuilt = createContextIntegrityFilterBindingV1({
    schemaVersion: value.schemaVersion,
    filterId: value.filterId,
    filterVersion: value.filterVersion,
    filterImplementationDigest: value.filterImplementationDigest,
  });
  if (value.filterBindingDigest !== rebuilt.filterBindingDigest)
    fail("context_integrity_filter_binding_digest_invalid");
  return rebuilt;
}

export function createContextIntegrityItemV1(
  input: Omit<ContextIntegrityItemV1, "itemDigest">,
): ContextIntegrityItemV1 {
  assertExactKeys(
    input,
    itemKeys.filter((key) => key !== "itemDigest"),
    "context integrity item input",
  );
  if (input.schemaVersion !== CONTEXT_INTEGRITY_SCHEMA_VERSION_V1)
    fail("context_integrity_item_schema_invalid");
  const claimKeyDigest = nullableDigest(input.claimKeyDigest, "claimKeyDigest");
  const claimValueDigest = nullableDigest(
    input.claimValueDigest,
    "claimValueDigest",
  );
  if ((claimKeyDigest === null) !== (claimValueDigest === null))
    fail("context_integrity_claim_binding_incomplete");
  const body = freeze({
    schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
    itemId: id(input.itemId, "itemId"),
    sourceZone: sourceZone(input.sourceZone),
    sourceId: id(input.sourceId, "sourceId"),
    sourceVersion: positive(input.sourceVersion, "sourceVersion"),
    sourceRevision: nonNegative(input.sourceRevision, "sourceRevision"),
    memoryTier: memoryTier(input.memoryTier),
    contentDigest: sha(input.contentDigest, "contentDigest"),
    provenanceDigest: sha(input.provenanceDigest, "provenanceDigest"),
    claimKeyDigest,
    claimValueDigest,
    corroborationGroupIds: tokens(
      input.corroborationGroupIds,
      "corroborationGroupIds",
      32,
    ),
    observedAtLogicalMs: nonNegative(
      input.observedAtLogicalMs,
      "observedAtLogicalMs",
    ),
    expiresAtLogicalMs: positive(
      input.expiresAtLogicalMs,
      "expiresAtLogicalMs",
    ),
  } satisfies Omit<ContextIntegrityItemV1, "itemDigest">);
  if (body.expiresAtLogicalMs <= body.observedAtLogicalMs)
    fail("context_integrity_item_window_invalid");
  return freeze({
    ...body,
    itemDigest: digestContextIntegrityJsonV1(
      "item",
      body as unknown as JsonValue,
    ),
  });
}

export function validateContextIntegrityItemV1(
  input: unknown,
): ContextIntegrityItemV1 {
  assertExactKeys(input, itemKeys, "context integrity item");
  const value = input as unknown as ContextIntegrityItemV1;
  const { itemDigest, ...body } = value;
  const rebuilt = createContextIntegrityItemV1(body);
  if (itemDigest !== rebuilt.itemDigest)
    fail("context_integrity_item_digest_invalid");
  return rebuilt;
}

export function createContextIntegrityRequestV1(
  input: Omit<ContextIntegrityRequestV1, "requestDigest">,
): ContextIntegrityRequestV1 {
  assertExactKeys(
    input,
    requestKeys.filter((key) => key !== "requestDigest"),
    "context integrity request input",
  );
  if (input.schemaVersion !== CONTEXT_INTEGRITY_SCHEMA_VERSION_V1)
    fail("context_integrity_request_schema_invalid");
  if (!Array.isArray(input.items) || input.items.length > 256)
    fail("context_integrity_request_items_invalid");
  const items = input.items.map(validateContextIntegrityItemV1);
  assertUnique(
    items.map(({ itemId }) => itemId),
    "context integrity item IDs",
  );
  const body = freeze({
    schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
    requestId: id(input.requestId, "requestId"),
    checkpoint: checkpoint(input.checkpoint),
    targetKind: targetKind(input.targetKind),
    scope: normalizeScope(input.scope),
    logicalTimeMs: nonNegative(input.logicalTimeMs, "logicalTimeMs"),
    filterBindingDigest: nullableDigest(
      input.filterBindingDigest,
      "filterBindingDigest",
    ),
    items: freeze(items),
  } satisfies Omit<ContextIntegrityRequestV1, "requestDigest">);
  if (
    (body.targetKind === "context" &&
      body.checkpoint !== "pre_inference" &&
      body.checkpoint !== "pre_step") ||
    (body.targetKind === "output" && body.checkpoint !== "post_output") ||
    (body.targetKind === "action" && body.checkpoint !== "pre_action")
  )
    fail("context_integrity_checkpoint_target_invalid");
  return freeze({
    ...body,
    requestDigest: digestContextIntegrityJsonV1(
      "request",
      body as unknown as JsonValue,
    ),
  });
}

export function validateContextIntegrityRequestV1(
  input: unknown,
): ContextIntegrityRequestV1 {
  assertExactKeys(input, requestKeys, "context integrity request");
  const value = input as unknown as ContextIntegrityRequestV1;
  const { requestDigest, ...body } = value;
  const rebuilt = createContextIntegrityRequestV1(body);
  if (requestDigest !== rebuilt.requestDigest)
    fail("context_integrity_request_digest_invalid");
  return rebuilt;
}

export function createContextIntegrityEphemeralContentV1(input: {
  readonly itemId: string;
  readonly mediaType: "text" | "json";
  readonly content: JsonValue;
}): ContextIntegrityEphemeralContentV1 {
  assertExactKeys(
    input,
    ["content", "itemId", "mediaType"],
    "context integrity ephemeral content input",
  );
  assertStrictJsonValue(input.content);
  return freeze({
    itemId: id(input.itemId, "content.itemId"),
    mediaType: oneOf(input.mediaType, ["text", "json"], "content.mediaType"),
    content: cloneJson(input.content),
    contentDigest: digestControlJsonV1("context", input.content),
  });
}

export function validateContextIntegrityEphemeralContentV1(
  input: unknown,
): ContextIntegrityEphemeralContentV1 {
  assertExactKeys(input, contentKeys, "context integrity ephemeral content");
  const value = input as unknown as ContextIntegrityEphemeralContentV1;
  const rebuilt = createContextIntegrityEphemeralContentV1({
    itemId: value.itemId,
    mediaType: value.mediaType,
    content: value.content,
  });
  if (value.contentDigest !== rebuilt.contentDigest)
    fail("context_integrity_content_digest_invalid");
  return rebuilt;
}

export function createContextIntegrityAssessmentV1(
  input: Omit<
    ContextIntegrityAssessmentV1,
    "analysisDigest" | "assessmentDigest"
  >,
): ContextIntegrityAssessmentV1 {
  assertExactKeys(
    input,
    assessmentKeys.filter(
      (key) => key !== "analysisDigest" && key !== "assessmentDigest",
    ),
    "context integrity assessment input",
  );
  if (input.schemaVersion !== CONTEXT_INTEGRITY_SCHEMA_VERSION_V1)
    fail("context_integrity_assessment_schema_invalid");
  const assessedAtLogicalMs = nonNegative(
    input.assessedAtLogicalMs,
    "assessedAtLogicalMs",
  );
  const expiresAtLogicalMs = positive(
    input.expiresAtLogicalMs,
    "expiresAtLogicalMs",
  );
  if (expiresAtLogicalMs <= assessedAtLogicalMs)
    fail("context_integrity_assessment_window_invalid");
  const analysisBody = freeze({
    schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
    itemId: id(input.itemId, "assessment.itemId"),
    itemDigest: sha(input.itemDigest, "assessment.itemDigest"),
    analyzerId: id(input.analyzerId, "assessment.analyzerId"),
    analyzerVersion: positive(
      input.analyzerVersion,
      "assessment.analyzerVersion",
    ),
    analyzerImplementationDigest: sha(
      input.analyzerImplementationDigest,
      "assessment.analyzerImplementationDigest",
    ),
    analyzerRevision: nonNegative(
      input.analyzerRevision,
      "assessment.analyzerRevision",
    ),
    disposition: assessmentDisposition(input.disposition),
    riskBps: bps(input.riskBps, "assessment.riskBps"),
    uncertaintyBps: bps(input.uncertaintyBps, "assessment.uncertaintyBps"),
    instructionConflictBps: bps(
      input.instructionConflictBps,
      "assessment.instructionConflictBps",
    ),
    threatKinds: tokens(input.threatKinds, "assessment.threatKinds", 32),
    reasonCodes: tokens(input.reasonCodes, "assessment.reasonCodes", 32),
    evidenceDigests: digests(
      input.evidenceDigests,
      "assessment.evidenceDigests",
      32,
    ),
  });
  const analysisDigest = digestContextIntegrityJsonV1(
    "analysis",
    analysisBody as unknown as JsonValue,
  );
  const body = freeze({
    assessmentId: id(input.assessmentId, "assessmentId"),
    requestId: id(input.requestId, "assessment.requestId"),
    requestDigest: sha(input.requestDigest, "assessment.requestDigest"),
    ...analysisBody,
    assessedAtLogicalMs,
    expiresAtLogicalMs,
    analysisDigest,
  } satisfies Omit<ContextIntegrityAssessmentV1, "assessmentDigest">);
  return freeze({
    ...body,
    assessmentDigest: digestContextIntegrityJsonV1(
      "assessment",
      body as unknown as JsonValue,
    ),
  });
}

export function validateContextIntegrityAssessmentV1(
  input: unknown,
): ContextIntegrityAssessmentV1 {
  assertExactKeys(input, assessmentKeys, "context integrity assessment");
  const value = input as unknown as ContextIntegrityAssessmentV1;
  const { analysisDigest, assessmentDigest, ...body } = value;
  const rebuilt = createContextIntegrityAssessmentV1(body);
  if (
    analysisDigest !== rebuilt.analysisDigest ||
    assessmentDigest !== rebuilt.assessmentDigest
  )
    fail("context_integrity_assessment_digest_invalid");
  return rebuilt;
}

export function createContextIntegrityStateV1(input: {
  readonly stateKey: string;
  readonly controllerId: string;
  readonly controllerVersion: number;
  readonly implementationId: string;
  readonly policy: ContextIntegrityPolicyRecordV1;
  readonly analyzer: Pick<
    ContextIntegrityAnalyzerV1,
    "analyzerId" | "analyzerVersion" | "analyzerImplementationDigest"
  >;
  readonly revision?: number;
  readonly logicalTimeHighWaterMs?: number;
  readonly stepCount?: number;
  readonly status?: ContextIntegrityStateStatusV1;
  readonly degraded?: boolean;
  readonly adverseStreak?: number;
  readonly recoveryStreak?: number;
  readonly interventionCounts?: ContextIntegrityInterventionCountsV1;
  readonly heads?: readonly ContextIntegrityHeadV1[];
  readonly rollingWindow?: readonly ContextIntegrityWindowEntryV1[];
  readonly predecessorStateDigest?: string | null;
  readonly lastRequestDigest?: string | null;
  readonly lastDecision?: ContextIntegrityDecisionV1 | null;
}): ContextIntegrityStateV1 {
  const policy = validateContextIntegrityPolicyV1(input.policy);
  const heads = normalizeHeads(input.heads ?? []);
  if (heads.length > policy.policy.limits.maximumRetainedHeads)
    fail("context_integrity_head_capacity_exceeded");
  const rollingWindow = normalizeWindow(input.rollingWindow ?? []);
  if (rollingWindow.length > policy.policy.limits.rollingWindowAssessments)
    fail("context_integrity_window_capacity_exceeded");
  const lastDecision =
    input.lastDecision === undefined || input.lastDecision === null
      ? null
      : normalizeDecision(input.lastDecision);
  const lastRequestDigest =
    input.lastRequestDigest === undefined || input.lastRequestDigest === null
      ? null
      : sha(input.lastRequestDigest, "state.lastRequestDigest");
  if (
    (lastRequestDigest === null) !== (lastDecision === null) ||
    (lastDecision && lastDecision.requestDigest !== lastRequestDigest)
  )
    fail("context_integrity_retained_decision_invalid");
  const counts = normalizeInterventionCounts(
    input.interventionCounts ?? {
      restricted: 0,
      isolated: 0,
      corroborationRequired: 0,
      denied: 0,
    },
  );
  const body = freeze({
    format: CONTEXT_INTEGRITY_STATE_FORMAT_V1,
    schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
    stateKey: id(input.stateKey, "stateKey"),
    controllerId: id(input.controllerId, "controllerId"),
    controllerVersion: positive(input.controllerVersion, "controllerVersion"),
    implementationId: id(input.implementationId, "implementationId"),
    policyId: policy.policy.policyId,
    policyVersion: policy.policy.policyVersion,
    policyDigest: policy.policyDigest,
    analyzerId: id(input.analyzer.analyzerId, "analyzerId"),
    analyzerVersion: positive(
      input.analyzer.analyzerVersion,
      "analyzerVersion",
    ),
    analyzerImplementationDigest: sha(
      input.analyzer.analyzerImplementationDigest,
      "analyzerImplementationDigest",
    ),
    revision: nonNegative(input.revision ?? 0, "state.revision"),
    logicalTimeHighWaterMs: nonNegative(
      input.logicalTimeHighWaterMs ?? 0,
      "state.logicalTimeHighWaterMs",
    ),
    stepCount: nonNegative(input.stepCount ?? 0, "state.stepCount"),
    status: stateStatus(input.status ?? "active"),
    degraded: boolean(input.degraded ?? false, "state.degraded"),
    adverseStreak: nonNegative(input.adverseStreak ?? 0, "state.adverseStreak"),
    recoveryStreak: nonNegative(
      input.recoveryStreak ?? 0,
      "state.recoveryStreak",
    ),
    interventionCounts: counts,
    heads,
    rollingWindow,
    predecessorStateDigest:
      input.predecessorStateDigest === undefined ||
      input.predecessorStateDigest === null
        ? null
        : sha(input.predecessorStateDigest, "state.predecessorStateDigest"),
    lastRequestDigest,
    lastDecision,
  } satisfies Omit<ContextIntegrityStateV1, "stateDigest">);
  if (body.stepCount > policy.policy.limits.maximumSteps)
    fail("context_integrity_step_capacity_exceeded");
  if (
    body.degraded !== (body.status !== "active") ||
    (body.adverseStreak > 0 && body.recoveryStreak > 0) ||
    body.heads.some(({ analyzerId }) => analyzerId !== body.analyzerId) ||
    body.rollingWindow.length > body.stepCount ||
    (body.rollingWindow.at(-1)?.evaluatedAtLogicalMs ?? 0) >
      body.logicalTimeHighWaterMs ||
    (body.lastDecision !== null &&
      (body.lastDecision.controllerId !== body.controllerId ||
        body.lastDecision.controllerVersion !== body.controllerVersion ||
        body.lastDecision.implementationId !== body.implementationId ||
        body.lastDecision.policyId !== body.policyId ||
        body.lastDecision.policyVersion !== body.policyVersion ||
        body.lastDecision.policyDigest !== body.policyDigest ||
        body.lastDecision.analyzerId !== body.analyzerId ||
        body.lastDecision.analyzerVersion !== body.analyzerVersion ||
        body.lastDecision.analyzerImplementationDigest !==
          body.analyzerImplementationDigest ||
        body.lastDecision.committedStateRevision !== body.revision ||
        body.lastDecision.evaluatedAtLogicalMs > body.logicalTimeHighWaterMs ||
        body.lastDecision.stateStatus !== body.status ||
        body.lastDecision.degraded !== body.degraded))
  )
    fail("context_integrity_state_internal_binding_invalid");
  return freeze({
    ...body,
    stateDigest: digestContextIntegrityJsonV1(
      "state",
      body as unknown as JsonValue,
    ),
  });
}

export function validateContextIntegrityStateV1(
  input: unknown,
  policyValue: ContextIntegrityPolicyRecordV1,
): ContextIntegrityStateV1 {
  assertExactKeys(input, stateKeys, "context integrity state");
  const value = input as unknown as ContextIntegrityStateV1;
  if (
    value.format !== CONTEXT_INTEGRITY_STATE_FORMAT_V1 ||
    value.schemaVersion !== CONTEXT_INTEGRITY_SCHEMA_VERSION_V1
  )
    fail("context_integrity_state_format_invalid");
  const rebuilt = createContextIntegrityStateV1({
    stateKey: value.stateKey,
    controllerId: value.controllerId,
    controllerVersion: value.controllerVersion,
    implementationId: value.implementationId,
    policy: policyValue,
    analyzer: value,
    revision: value.revision,
    logicalTimeHighWaterMs: value.logicalTimeHighWaterMs,
    stepCount: value.stepCount,
    status: value.status,
    degraded: value.degraded,
    adverseStreak: value.adverseStreak,
    recoveryStreak: value.recoveryStreak,
    interventionCounts: value.interventionCounts,
    heads: value.heads,
    rollingWindow: value.rollingWindow,
    predecessorStateDigest: value.predecessorStateDigest,
    lastRequestDigest: value.lastRequestDigest,
    lastDecision: value.lastDecision,
  });
  if (
    value.policyId !== rebuilt.policyId ||
    value.policyVersion !== rebuilt.policyVersion ||
    value.policyDigest !== rebuilt.policyDigest ||
    value.stateDigest !== rebuilt.stateDigest
  )
    fail("context_integrity_state_binding_invalid");
  return rebuilt;
}

export function reduceContextIntegrityV1(
  input: ContextIntegrityReductionInputV1,
): ContextIntegrityReductionResultV1 {
  const policy = validateContextIntegrityPolicyV1(input.policy);
  const state = validateContextIntegrityStateV1(input.state, policy);
  const request = validateContextIntegrityRequestV1(input.request);
  assertStateBindings(state, policy);
  if (request.items.length > policy.policy.limits.maximumItemsPerRequest)
    fail("context_integrity_request_capacity_exceeded");
  if (
    state.lastRequestDigest === request.requestDigest &&
    state.lastDecision !== null
  )
    return freeze({ state, decision: state.lastDecision });
  if (state.stepCount >= policy.policy.limits.maximumSteps)
    fail("context_integrity_step_capacity_exceeded");

  const assessments = normalizeAssessments(
    input.assessments,
    policy.policy.limits,
  );
  const byItem = new Map<string, ContextIntegrityAssessmentV1>();
  for (const assessment of assessments) {
    if (byItem.has(assessment.itemId))
      fail("context_integrity_assessment_duplicated");
    byItem.set(assessment.itemId, assessment);
  }
  const itemIds = new Set(request.items.map(({ itemId }) => itemId));
  if ([...byItem.keys()].some((itemId) => !itemIds.has(itemId)))
    fail("context_integrity_assessment_outside_request");

  const contradictionKeys = contradictoryClaimKeys(request.items);
  const headRetentionTime = Math.max(
    state.logicalTimeHighWaterMs,
    request.logicalTimeMs,
  );
  const headMap = new Map(
    state.heads
      .filter(
        ({ expiresAtLogicalMs }) => expiresAtLogicalMs > headRetentionTime,
      )
      .map((head) => [head.headKey, head]),
  );
  const decisions: ContextIntegrityItemDecisionV1[] = [];
  let maximumRiskBps = 0;
  let maximumUncertaintyBps = 0;
  let expiry = safeAdd(
    request.logicalTimeMs,
    policy.policy.limits.maximumDecisionTtlMs,
    "context_integrity_decision_expiry_overflow",
  );
  const logicalRollback = request.logicalTimeMs < state.logicalTimeHighWaterMs;

  for (const item of request.items) {
    const assessment = byItem.get(item.itemId);
    const reasons = new Set<string>();
    let action: ContextIntegrityItemActionV1 = "admit";
    let riskBps = assessment?.riskBps ?? 10_000;
    let uncertaintyBps = assessment?.uncertaintyBps ?? 10_000;
    let acceptedAssessmentDigest: string | null = null;

    if (logicalRollback) {
      action = "isolate";
      reasons.add("logical_time_rollback");
    } else if (
      item.observedAtLogicalMs > request.logicalTimeMs ||
      item.expiresAtLogicalMs <= request.logicalTimeMs
    ) {
      action = "isolate";
      reasons.add(
        item.observedAtLogicalMs > request.logicalTimeMs
          ? "item_future_dated"
          : "item_expired",
      );
    } else if (!assessment) {
      action = "isolate";
      reasons.add("assessment_missing");
    } else if (
      assessment.requestId !== request.requestId ||
      assessment.requestDigest !== request.requestDigest ||
      assessment.itemId !== item.itemId ||
      assessment.itemDigest !== item.itemDigest ||
      assessment.analyzerId !== state.analyzerId ||
      assessment.analyzerVersion !== state.analyzerVersion ||
      assessment.analyzerImplementationDigest !==
        state.analyzerImplementationDigest
    ) {
      fail("context_integrity_assessment_binding_invalid");
    } else if (
      assessment.assessedAtLogicalMs > request.logicalTimeMs ||
      assessment.expiresAtLogicalMs <= request.logicalTimeMs
    ) {
      action = "isolate";
      reasons.add(
        assessment.assessedAtLogicalMs > request.logicalTimeMs
          ? "assessment_future_dated"
          : "assessment_expired",
      );
    } else {
      const headKey = contextIntegrityHeadKeyV1({
        itemId: item.itemId,
        sourceId: item.sourceId,
        analyzerId: assessment.analyzerId,
      });
      const prior = headMap.get(headKey);
      const sourceRollback =
        prior !== undefined &&
        (item.sourceVersion < prior.sourceVersion ||
          (item.sourceVersion === prior.sourceVersion &&
            item.sourceRevision < prior.sourceRevision));
      const sameSourceRevision =
        prior !== undefined &&
        item.sourceVersion === prior.sourceVersion &&
        item.sourceRevision === prior.sourceRevision;
      if (
        prior &&
        (sourceRollback ||
          (sameSourceRevision &&
            assessment.analyzerRevision < prior.analyzerRevision))
      ) {
        action = "isolate";
        reasons.add("assessment_revision_rollback");
      } else if (
        prior &&
        (item.sourceId !== prior.sourceId ||
          (sameSourceRevision && item.contentDigest !== prior.contentDigest) ||
          (sameSourceRevision &&
            assessment.analyzerRevision === prior.analyzerRevision &&
            assessment.analysisDigest !== prior.analysisDigest))
      ) {
        action = "deny";
        reasons.add("assessment_equivocation");
      } else {
        const isNew = !prior;
        if (
          isNew &&
          headMap.size >= policy.policy.limits.maximumRetainedHeads
        ) {
          action = "isolate";
          reasons.add("state_capacity_exceeded");
        } else {
          headMap.set(headKey, headFrom(item, assessment));
          acceptedAssessmentDigest = assessment.assessmentDigest;
          expiry = Math.min(
            expiry,
            item.expiresAtLogicalMs,
            assessment.expiresAtLogicalMs,
          );
          for (const reason of assessment.reasonCodes) reasons.add(reason);
          action = decideItemAction({
            item,
            assessment,
            policy: policy.policy,
            contradictory: item.claimKeyDigest
              ? contradictionKeys.has(item.claimKeyDigest)
              : false,
            reasons,
          });
        }
      }
    }
    maximumRiskBps = Math.max(maximumRiskBps, riskBps);
    maximumUncertaintyBps = Math.max(maximumUncertaintyBps, uncertaintyBps);
    decisions.push(
      freeze({
        schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
        itemId: item.itemId,
        itemDigest: item.itemDigest,
        action,
        riskBps,
        uncertaintyBps,
        reasonCodes: freeze([...reasons].sort(compare)),
        assessmentDigest: acceptedAssessmentDigest,
      }),
    );
  }

  const filterRequired = decisions.some(
    ({ action }) => action === "isolate" || action === "require_corroboration",
  );
  const deniedItems = decisions.filter(
    ({ action }) => action === "deny",
  ).length;
  const isolatedItems = decisions.filter(
    ({ action }) => action === "isolate",
  ).length;
  const corroborationRequired = decisions.filter(
    ({ action }) => action === "require_corroboration",
  ).length;
  const restrictedItems = decisions.filter(
    ({ action }) => action === "restrict",
  ).length;
  const admittedItems =
    decisions.length - deniedItems - isolatedItems - corroborationRequired;
  const filterAllowed =
    request.filterBindingDigest !== null &&
    policy.policy.allowedFilterBindingDigests.includes(
      request.filterBindingDigest,
    );
  const adverse =
    deniedItems > 0 ||
    isolatedItems > 0 ||
    corroborationRequired > 0 ||
    restrictedItems > 0;
  const adverseStreak = adverse ? state.adverseStreak + 1 : 0;
  const recoveryStreak = adverse ? 0 : state.recoveryStreak + 1;
  let status: ContextIntegrityStateStatusV1 = adverse
    ? "degraded"
    : state.status;
  if (state.status === "denied") status = "denied";
  else if (
    deniedItems > 0 &&
    decisions.some(({ reasonCodes }) =>
      reasonCodes.includes("assessment_equivocation"),
    )
  )
    status = "denied";
  else if (
    adverseStreak >= policy.policy.adverseSignalsToPause ||
    (state.status === "paused" &&
      recoveryStreak < policy.policy.recoverySignalsRequired)
  )
    status = "paused";
  else if (!adverse && recoveryStreak >= policy.policy.recoverySignalsRequired)
    status = "active";

  let disposition: ContextIntegrityDecisionV1["disposition"] = "allow";
  if (deniedItems > 0 || status === "denied") disposition = "deny";
  else if (
    status === "paused" ||
    (filterRequired && !filterAllowed) ||
    (filterRequired &&
      admittedItems === 0 &&
      !policy.policy.allowEmptyAfterIsolation)
  )
    disposition = "abstain";

  const priorStateRevision = state.revision;
  const committedStateRevision = state.revision + 1;
  const decisionBody = freeze({
    schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
    controllerId: state.controllerId,
    controllerVersion: state.controllerVersion,
    implementationId: state.implementationId,
    policyId: state.policyId,
    policyVersion: state.policyVersion,
    policyDigest: state.policyDigest,
    analyzerId: state.analyzerId,
    analyzerVersion: state.analyzerVersion,
    analyzerImplementationDigest: state.analyzerImplementationDigest,
    requestId: request.requestId,
    requestDigest: request.requestDigest,
    evaluatedAtLogicalMs: request.logicalTimeMs,
    expiresAtLogicalMs: expiry,
    priorStateRevision,
    committedStateRevision,
    disposition,
    filterRequired,
    stateStatus: status,
    degraded: status !== "active" || adverse,
    items: freeze(decisions),
  } satisfies Omit<
    ContextIntegrityDecisionV1,
    "decisionId" | "decisionDigest"
  >);
  const decisionDigest = digestContextIntegrityJsonV1(
    "decision",
    decisionBody as unknown as JsonValue,
  );
  const decision = freeze({
    ...decisionBody,
    decisionId: `context-integrity-decision.${decisionDigest.slice(7)}`,
    decisionDigest,
  });
  const nextWindow = [
    ...state.rollingWindow,
    freeze({
      schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
      requestDigest: request.requestDigest,
      maximumRiskBps,
      maximumUncertaintyBps,
      isolatedItems: isolatedItems + corroborationRequired,
      deniedItems,
      evaluatedAtLogicalMs: Math.max(
        state.logicalTimeHighWaterMs,
        request.logicalTimeMs,
      ),
    }),
  ].slice(-policy.policy.limits.rollingWindowAssessments);
  const nextState = createContextIntegrityStateV1({
    stateKey: state.stateKey,
    controllerId: state.controllerId,
    controllerVersion: state.controllerVersion,
    implementationId: state.implementationId,
    policy,
    analyzer: state,
    revision: committedStateRevision,
    logicalTimeHighWaterMs: Math.max(
      state.logicalTimeHighWaterMs,
      request.logicalTimeMs,
    ),
    stepCount: state.stepCount + 1,
    status,
    degraded: decision.degraded,
    adverseStreak,
    recoveryStreak,
    interventionCounts: {
      restricted: state.interventionCounts.restricted + restrictedItems,
      isolated: state.interventionCounts.isolated + isolatedItems,
      corroborationRequired:
        state.interventionCounts.corroborationRequired + corroborationRequired,
      denied: state.interventionCounts.denied + deniedItems,
    },
    heads: freeze([...headMap.values()].sort(headOrder)),
    rollingWindow: freeze(nextWindow),
    predecessorStateDigest: state.predecessorStateDigest,
    lastRequestDigest: request.requestDigest,
    lastDecision: decision,
  });
  return freeze({ state: nextState, decision });
}

export function validateContextIntegrityDecisionV1(input: {
  readonly decision: unknown;
  readonly request: ContextIntegrityRequestV1;
  readonly expected: Pick<
    ContextIntegrityPortV1,
    | "controllerId"
    | "controllerVersion"
    | "implementationId"
    | "policyId"
    | "policyVersion"
    | "policyDigest"
    | "analyzerId"
    | "analyzerVersion"
    | "analyzerImplementationDigest"
  >;
  readonly logicalTimeMs: number;
}): ContextIntegrityDecisionV1 {
  const request = validateContextIntegrityRequestV1(input.request);
  const decision = normalizeDecision(input.decision);
  if (
    decision.controllerId !== input.expected.controllerId ||
    decision.controllerVersion !== input.expected.controllerVersion ||
    decision.implementationId !== input.expected.implementationId ||
    decision.policyId !== input.expected.policyId ||
    decision.policyVersion !== input.expected.policyVersion ||
    decision.policyDigest !== input.expected.policyDigest ||
    decision.analyzerId !== input.expected.analyzerId ||
    decision.analyzerVersion !== input.expected.analyzerVersion ||
    decision.analyzerImplementationDigest !==
      input.expected.analyzerImplementationDigest ||
    decision.requestId !== request.requestId ||
    decision.requestDigest !== request.requestDigest ||
    decision.evaluatedAtLogicalMs !== request.logicalTimeMs ||
    decision.expiresAtLogicalMs <= input.logicalTimeMs ||
    decision.items.length !== request.items.length ||
    decision.items.some(
      (itemDecision, index) =>
        itemDecision.itemId !== request.items[index]?.itemId ||
        itemDecision.itemDigest !== request.items[index]?.itemDigest,
    )
  )
    fail("context_integrity_decision_binding_invalid");
  return decision;
}

export class ContextIntegrityRuntimeV1 implements ContextIntegrityPortV1 {
  readonly controllerId: string;
  readonly controllerVersion: number;
  readonly implementationId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
  readonly analyzerId: string;
  readonly analyzerVersion: number;
  readonly analyzerImplementationDigest: string;
  readonly #policy: ContextIntegrityPolicyRecordV1;
  readonly #analyzer: ContextIntegrityAnalyzerV1;
  readonly #store: ContextIntegrityStoreV1;

  constructor(options: ContextIntegrityRuntimeOptionsV1) {
    if (!options || typeof options !== "object")
      fail("context_integrity_runtime_options_required");
    this.controllerId = id(options.controllerId, "controllerId");
    this.controllerVersion = positive(
      options.controllerVersion,
      "controllerVersion",
    );
    this.implementationId = id(options.implementationId, "implementationId");
    this.#policy = validateContextIntegrityPolicyV1(options.policy);
    this.policyId = this.#policy.policy.policyId;
    this.policyVersion = this.#policy.policy.policyVersion;
    this.policyDigest = this.#policy.policyDigest;
    if (!options.analyzer || typeof options.analyzer.analyze !== "function")
      fail("context_integrity_analyzer_required");
    this.analyzerId = id(options.analyzer.analyzerId, "analyzerId");
    this.analyzerVersion = positive(
      options.analyzer.analyzerVersion,
      "analyzerVersion",
    );
    this.analyzerImplementationDigest = sha(
      options.analyzer.analyzerImplementationDigest,
      "analyzerImplementationDigest",
    );
    if (
      !options.store ||
      typeof options.store.load !== "function" ||
      typeof options.store.save !== "function"
    )
      fail("context_integrity_store_required");
    this.#analyzer = options.analyzer;
    this.#store = options.store;
  }

  async evaluate(
    input: ContextIntegrityEvaluationInputV1,
  ): Promise<ContextIntegrityDecisionV1> {
    assertExactKeys(
      input,
      ["contents", "request", "stateKey"],
      "context integrity evaluation",
    );
    const stateKey = id(input.stateKey, "stateKey");
    const request = validateContextIntegrityRequestV1(input.request);
    if (
      request.items.length > this.#policy.policy.limits.maximumItemsPerRequest
    )
      fail("context_integrity_request_capacity_exceeded");
    const contents = normalizeContents(input.contents, request);
    let loaded = await this.#store.load(stateKey);
    let logicalRollback = false;
    if (loaded) {
      const retained = validateContextIntegrityStateV1(loaded, this.#policy);
      assertRuntimeStateBinding(retained, this);
      if (
        retained.lastRequestDigest === request.requestDigest &&
        retained.lastDecision !== null
      )
        return retained.lastDecision;
      logicalRollback = request.logicalTimeMs < retained.logicalTimeHighWaterMs;
    }
    const assessmentResults = await Promise.all(
      request.items.map(async (item) => {
        if (
          logicalRollback ||
          item.observedAtLogicalMs > request.logicalTimeMs ||
          item.expiresAtLogicalMs <= request.logicalTimeMs
        )
          return null;
        return validateContextIntegrityAssessmentV1(
          await this.#analyzer.analyze({
            request,
            item,
            content: contents.get(item.itemId)!,
          }),
        );
      }),
    );
    const assessments = assessmentResults.filter(
      (assessment): assessment is ContextIntegrityAssessmentV1 =>
        assessment !== null,
    );
    for (
      let attempt = 0;
      attempt < this.#policy.policy.limits.maximumCommitAttempts;
      attempt += 1
    ) {
      if (attempt > 0) loaded = await this.#store.load(stateKey);
      const state = loaded
        ? validateContextIntegrityStateV1(loaded, this.#policy)
        : createContextIntegrityStateV1({
            stateKey,
            controllerId: this.controllerId,
            controllerVersion: this.controllerVersion,
            implementationId: this.implementationId,
            policy: this.#policy,
            analyzer: this,
          });
      assertRuntimeStateBinding(state, this);
      const result = reduceContextIntegrityV1({
        state,
        policy: this.#policy,
        request,
        assessments,
      });
      if (result.state.revision === state.revision) return result.decision;
      if (
        await this.#store.save({
          state: result.state,
          expectedRevision: loaded ? state.revision : null,
        })
      )
        return result.decision;
    }
    throw new Error("context_integrity_commit_conflict");
  }

  async getState(
    stateKeyValue: string,
  ): Promise<ContextIntegrityStateV1 | null> {
    const stateKey = id(stateKeyValue, "stateKey");
    const state = await this.#store.load(stateKey);
    if (!state) return null;
    const validated = validateContextIntegrityStateV1(state, this.#policy);
    assertRuntimeStateBinding(validated, this);
    return validated;
  }

  async exportHandoff(input: {
    readonly sourceStateKey: string;
    readonly targetStateKey: string;
    readonly logicalTimeMs: number;
  }): Promise<ContextIntegrityHandoffEnvelopeV1> {
    assertExactKeys(
      input,
      ["logicalTimeMs", "sourceStateKey", "targetStateKey"],
      "context integrity handoff export",
    );
    const sourceStateKey = id(input.sourceStateKey, "sourceStateKey");
    const targetStateKey = id(input.targetStateKey, "targetStateKey");
    if (sourceStateKey === targetStateKey)
      fail("context_integrity_handoff_target_invalid");
    const logicalTimeMs = nonNegative(input.logicalTimeMs, "logicalTimeMs");
    const sourceState = await this.getState(sourceStateKey);
    if (!sourceState) fail("context_integrity_handoff_source_missing");
    if (logicalTimeMs < sourceState.logicalTimeHighWaterMs)
      fail("context_integrity_handoff_time_rollback");
    const body = freeze({
      schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
      contentClass: "context_integrity_state" as const,
      controllerId: this.controllerId,
      controllerVersion: this.controllerVersion,
      implementationId: this.implementationId,
      policyDigest: this.policyDigest,
      analyzerId: this.analyzerId,
      analyzerVersion: this.analyzerVersion,
      analyzerImplementationDigest: this.analyzerImplementationDigest,
      sourceStateKey,
      sourceStateDigest: sourceState.stateDigest,
      targetStateKey,
      exportedAtLogicalMs: logicalTimeMs,
      sourceState,
    } satisfies Omit<ContextIntegrityHandoffEnvelopeV1, "handoffDigest">);
    return freeze({
      ...body,
      handoffDigest: digestContextIntegrityJsonV1(
        "handoff",
        body as unknown as JsonValue,
      ),
    });
  }

  async importHandoff(input: {
    readonly handoff: ContextIntegrityHandoffEnvelopeV1;
    readonly targetStateKey: string;
    readonly logicalTimeMs: number;
  }): Promise<ContextIntegrityStateV1> {
    assertExactKeys(
      input,
      ["handoff", "logicalTimeMs", "targetStateKey"],
      "context integrity handoff import",
    );
    const targetStateKey = id(input.targetStateKey, "targetStateKey");
    const logicalTimeMs = nonNegative(input.logicalTimeMs, "logicalTimeMs");
    const handoff = validateContextIntegrityHandoffV1(
      input.handoff,
      this.#policy,
    );
    if (
      handoff.controllerId !== this.controllerId ||
      handoff.controllerVersion !== this.controllerVersion ||
      handoff.implementationId !== this.implementationId ||
      handoff.policyDigest !== this.policyDigest ||
      handoff.analyzerId !== this.analyzerId ||
      handoff.analyzerVersion !== this.analyzerVersion ||
      handoff.analyzerImplementationDigest !==
        this.analyzerImplementationDigest ||
      handoff.targetStateKey !== targetStateKey
    )
      fail("context_integrity_handoff_binding_invalid");
    if (
      logicalTimeMs < handoff.exportedAtLogicalMs ||
      logicalTimeMs < handoff.sourceState.logicalTimeHighWaterMs
    )
      fail("context_integrity_handoff_time_rollback");
    const existing = await this.getState(targetStateKey);
    if (existing) {
      if (existing.predecessorStateDigest === handoff.sourceStateDigest)
        return existing;
      fail("context_integrity_handoff_target_conflict");
    }
    const source = handoff.sourceState;
    const restored = createContextIntegrityStateV1({
      stateKey: targetStateKey,
      controllerId: this.controllerId,
      controllerVersion: this.controllerVersion,
      implementationId: this.implementationId,
      policy: this.#policy,
      analyzer: this,
      revision: 1,
      logicalTimeHighWaterMs: logicalTimeMs,
      stepCount: source.stepCount,
      status: source.status,
      degraded: source.degraded,
      adverseStreak: source.adverseStreak,
      recoveryStreak: source.recoveryStreak,
      interventionCounts: source.interventionCounts,
      heads: source.heads,
      rollingWindow: source.rollingWindow,
      predecessorStateDigest: source.stateDigest,
      lastRequestDigest: null,
      lastDecision: null,
    });
    if (await this.#store.save({ state: restored, expectedRevision: null }))
      return restored;
    const raced = await this.getState(targetStateKey);
    if (raced?.predecessorStateDigest === handoff.sourceStateDigest)
      return raced;
    fail("context_integrity_handoff_target_conflict");
  }
}

export function validateContextIntegrityHandoffV1(
  input: unknown,
  policyValue: ContextIntegrityPolicyRecordV1,
): ContextIntegrityHandoffEnvelopeV1 {
  assertExactKeys(input, handoffKeys, "context integrity handoff");
  const value = input as unknown as ContextIntegrityHandoffEnvelopeV1;
  if (
    value.schemaVersion !== CONTEXT_INTEGRITY_SCHEMA_VERSION_V1 ||
    value.contentClass !== "context_integrity_state"
  )
    fail("context_integrity_handoff_format_invalid");
  const sourceState = validateContextIntegrityStateV1(
    value.sourceState,
    policyValue,
  );
  const body = freeze({
    schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
    contentClass: "context_integrity_state" as const,
    controllerId: id(value.controllerId, "handoff.controllerId"),
    controllerVersion: positive(
      value.controllerVersion,
      "handoff.controllerVersion",
    ),
    implementationId: id(value.implementationId, "handoff.implementationId"),
    policyDigest: sha(value.policyDigest, "handoff.policyDigest"),
    analyzerId: id(value.analyzerId, "handoff.analyzerId"),
    analyzerVersion: positive(value.analyzerVersion, "handoff.analyzerVersion"),
    analyzerImplementationDigest: sha(
      value.analyzerImplementationDigest,
      "handoff.analyzerImplementationDigest",
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
  } satisfies Omit<ContextIntegrityHandoffEnvelopeV1, "handoffDigest">);
  if (
    body.sourceState.stateKey !== body.sourceStateKey ||
    body.sourceState.stateDigest !== body.sourceStateDigest ||
    body.sourceState.controllerId !== body.controllerId ||
    body.sourceState.controllerVersion !== body.controllerVersion ||
    body.sourceState.implementationId !== body.implementationId ||
    body.sourceState.policyDigest !== body.policyDigest ||
    body.sourceState.analyzerId !== body.analyzerId ||
    body.sourceState.analyzerVersion !== body.analyzerVersion ||
    body.sourceState.analyzerImplementationDigest !==
      body.analyzerImplementationDigest ||
    body.sourceStateKey === body.targetStateKey
  )
    fail("context_integrity_handoff_binding_invalid");
  const handoffDigest = digestContextIntegrityJsonV1(
    "handoff",
    body as unknown as JsonValue,
  );
  if (value.handoffDigest !== handoffDigest)
    fail("context_integrity_handoff_digest_invalid");
  return freeze({ ...body, handoffDigest });
}

export class InMemoryContextIntegrityStoreV1 implements ContextIntegrityStoreV1 {
  readonly #states = new Map<string, ContextIntegrityStateV1>();
  readonly #policy: ContextIntegrityPolicyRecordV1;

  constructor(policy: ContextIntegrityPolicyRecordV1) {
    this.#policy = validateContextIntegrityPolicyV1(policy);
  }

  async load(stateKeyValue: string): Promise<ContextIntegrityStateV1 | null> {
    const state = this.#states.get(id(stateKeyValue, "stateKey"));
    return state ? cloneJson(state) : null;
  }

  async save(input: {
    readonly state: ContextIntegrityStateV1;
    readonly expectedRevision: number | null;
  }): Promise<boolean> {
    assertExactKeys(
      input,
      ["expectedRevision", "state"],
      "context integrity store save",
    );
    const state = validateContextIntegrityStateV1(input.state, this.#policy);
    const current = this.#states.get(state.stateKey);
    if (
      input.expectedRevision === null
        ? current !== undefined || state.revision !== 1
        : !current ||
          current.revision !== input.expectedRevision ||
          state.revision !== input.expectedRevision + 1
    )
      return false;
    this.#states.set(state.stateKey, cloneJson(state));
    return true;
  }
}

export function projectContextIntegrityRoleV1(
  stateValue: ContextIntegrityStateV1,
  policyValue: ContextIntegrityPolicyRecordV1,
): ContextIntegrityRoleProjectionV1 {
  const state = validateContextIntegrityStateV1(stateValue, policyValue);
  const latest = state.rollingWindow.at(-1);
  const uncertaintyBps = latest?.maximumUncertaintyBps ?? 10_000;
  const riskBps = latest?.maximumRiskBps ?? 10_000;
  const roleStatus: ContextIntegrityRoleProjectionV1["roleStatus"] =
    state.status === "denied"
      ? "denied"
      : state.status === "paused"
        ? "paused"
        : state.degraded
          ? "realignment_required"
          : state.status === "active"
            ? "active"
            : "unavailable";
  const body = freeze({
    roleStatus,
    degraded: state.degraded,
    coherenceBps: Math.max(0, 10_000 - riskBps),
    uncertaintyBps,
  });
  return freeze({
    ...body,
    projectionDigest: digestContextIntegrityJsonV1(
      "projection",
      body as unknown as JsonValue,
    ),
  });
}

export function contextIntegrityHeadKeyV1(input: {
  readonly itemId: string;
  readonly sourceId: string;
  readonly analyzerId: string;
}): string {
  id(input.sourceId, "head.sourceId");
  const digest = digestContextIntegrityJsonV1("head", {
    analyzerId: id(input.analyzerId, "head.analyzerId"),
    itemId: id(input.itemId, "head.itemId"),
  });
  return `context-integrity-head.${digest.slice(7)}`;
}

function normalizePolicy(
  input: ContextIntegrityPolicyV1,
): ContextIntegrityPolicyV1 {
  assertExactKeys(input, policyKeys, "context integrity policy");
  if (input.schemaVersion !== CONTEXT_INTEGRITY_SCHEMA_VERSION_V1)
    fail("context_integrity_policy_schema_invalid");
  const thresholds = normalizeThresholds(input.thresholds);
  const limits = normalizeLimits(input.limits);
  const trustedSourceZones = input.trustedSourceZones.map(sourceZone);
  sortedUnique(trustedSourceZones, "trustedSourceZones");
  const allowedFilterBindingDigests = digests(
    input.allowedFilterBindingDigests,
    "allowedFilterBindingDigests",
    32,
  );
  const minimumCorroborationGroups = bounded(
    input.minimumCorroborationGroups,
    "minimumCorroborationGroups",
    limits.maximumCorroborationGroupsPerItem,
    0,
  );
  return freeze({
    schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
    policyId: id(input.policyId, "policyId"),
    policyVersion: positive(input.policyVersion, "policyVersion"),
    parentPolicyDigest: nullableDigest(
      input.parentPolicyDigest,
      "parentPolicyDigest",
    ),
    trustedSourceZones: freeze(trustedSourceZones),
    allowedFilterBindingDigests,
    thresholds,
    minimumCorroborationGroups,
    adverseSignalsToPause: bounded(
      input.adverseSignalsToPause,
      "adverseSignalsToPause",
      10_000,
      1,
    ),
    recoverySignalsRequired: bounded(
      input.recoverySignalsRequired,
      "recoverySignalsRequired",
      10_000,
      1,
    ),
    allowEmptyAfterIsolation: boolean(
      input.allowEmptyAfterIsolation,
      "allowEmptyAfterIsolation",
    ),
    limits,
  });
}

function normalizeThresholds(
  input: ContextIntegrityThresholdsV1,
): ContextIntegrityThresholdsV1 {
  assertExactKeys(input, thresholdKeys, "context integrity thresholds");
  const value = freeze({
    cautionRiskBps: bps(input.cautionRiskBps, "cautionRiskBps"),
    quarantineRiskBps: bps(input.quarantineRiskBps, "quarantineRiskBps"),
    denyRiskBps: bps(input.denyRiskBps, "denyRiskBps"),
    maximumUncertaintyBps: bps(
      input.maximumUncertaintyBps,
      "maximumUncertaintyBps",
    ),
    contradictionRiskBps: bps(
      input.contradictionRiskBps,
      "contradictionRiskBps",
    ),
  });
  if (
    value.cautionRiskBps >= value.quarantineRiskBps ||
    value.quarantineRiskBps >= value.denyRiskBps
  )
    fail("context_integrity_threshold_order_invalid");
  return value;
}

function normalizeLimits(
  input: ContextIntegrityLimitsV1,
): ContextIntegrityLimitsV1 {
  assertExactKeys(input, limitKeys, "context integrity limits");
  return freeze({
    maximumItemsPerRequest: bounded(
      input.maximumItemsPerRequest,
      "maximumItemsPerRequest",
      256,
      1,
    ),
    maximumRetainedHeads: bounded(
      input.maximumRetainedHeads,
      "maximumRetainedHeads",
      65_536,
      1,
    ),
    rollingWindowAssessments: bounded(
      input.rollingWindowAssessments,
      "rollingWindowAssessments",
      1_024,
      1,
    ),
    maximumReasonCodesPerAssessment: bounded(
      input.maximumReasonCodesPerAssessment,
      "maximumReasonCodesPerAssessment",
      32,
      1,
    ),
    maximumThreatKindsPerAssessment: bounded(
      input.maximumThreatKindsPerAssessment,
      "maximumThreatKindsPerAssessment",
      32,
      1,
    ),
    maximumEvidenceDigestsPerAssessment: bounded(
      input.maximumEvidenceDigestsPerAssessment,
      "maximumEvidenceDigestsPerAssessment",
      32,
      1,
    ),
    maximumCorroborationGroupsPerItem: bounded(
      input.maximumCorroborationGroupsPerItem,
      "maximumCorroborationGroupsPerItem",
      32,
      1,
    ),
    maximumSteps: bounded(input.maximumSteps, "maximumSteps", 1_000_000, 1),
    maximumAssessmentTtlMs: bounded(
      input.maximumAssessmentTtlMs,
      "maximumAssessmentTtlMs",
      86_400_000,
      1,
    ),
    maximumDecisionTtlMs: bounded(
      input.maximumDecisionTtlMs,
      "maximumDecisionTtlMs",
      86_400_000,
      1,
    ),
    maximumCommitAttempts: bounded(
      input.maximumCommitAttempts,
      "maximumCommitAttempts",
      16,
      1,
    ),
  });
}

function normalizeScope(
  input: ContextIntegrityScopeV1,
): ContextIntegrityScopeV1 {
  assertExactKeys(input, scopeKeys, "context integrity scope");
  return freeze({
    tenantId: id(input.tenantId, "scope.tenantId"),
    sessionId: id(input.sessionId, "scope.sessionId"),
    agentId: id(input.agentId, "scope.agentId"),
    objectiveId: id(input.objectiveId, "scope.objectiveId"),
  });
}

function normalizeAssessments(
  input: readonly ContextIntegrityAssessmentV1[],
  limits: ContextIntegrityLimitsV1,
): readonly ContextIntegrityAssessmentV1[] {
  if (!Array.isArray(input) || input.length > limits.maximumItemsPerRequest)
    fail("context_integrity_assessments_invalid");
  return freeze(
    input.map((value) => {
      const assessment = validateContextIntegrityAssessmentV1(value);
      if (
        assessment.reasonCodes.length >
          limits.maximumReasonCodesPerAssessment ||
        assessment.threatKinds.length >
          limits.maximumThreatKindsPerAssessment ||
        assessment.evidenceDigests.length >
          limits.maximumEvidenceDigestsPerAssessment ||
        assessment.expiresAtLogicalMs - assessment.assessedAtLogicalMs >
          limits.maximumAssessmentTtlMs
      )
        fail("context_integrity_assessment_capacity_exceeded");
      return assessment;
    }),
  );
}

function normalizeContents(
  input: readonly ContextIntegrityEphemeralContentV1[],
  request: ContextIntegrityRequestV1,
): ReadonlyMap<string, ContextIntegrityEphemeralContentV1> {
  if (!Array.isArray(input) || input.length !== request.items.length)
    fail("context_integrity_content_coverage_invalid");
  const contents = input.map(validateContextIntegrityEphemeralContentV1);
  assertUnique(
    contents.map(({ itemId }) => itemId),
    "context integrity content IDs",
  );
  const byId = new Map(contents.map((content) => [content.itemId, content]));
  for (const item of request.items) {
    const content = byId.get(item.itemId);
    if (!content || content.contentDigest !== item.contentDigest)
      fail("context_integrity_content_binding_invalid");
  }
  return byId;
}

function normalizeHeads(
  input: readonly ContextIntegrityHeadV1[],
): readonly ContextIntegrityHeadV1[] {
  if (!Array.isArray(input) || input.length > 65_536)
    fail("context_integrity_heads_invalid");
  const heads = input.map((head) => {
    assertExactKeys(head, headKeys, "context integrity head");
    if (head.schemaVersion !== CONTEXT_INTEGRITY_SCHEMA_VERSION_V1)
      fail("context_integrity_head_schema_invalid");
    const normalized = freeze({
      schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
      headKey: id(head.headKey, "headKey"),
      itemId: id(head.itemId, "head.itemId"),
      sourceId: id(head.sourceId, "head.sourceId"),
      sourceVersion: positive(head.sourceVersion, "head.sourceVersion"),
      sourceRevision: nonNegative(head.sourceRevision, "head.sourceRevision"),
      contentDigest: sha(head.contentDigest, "head.contentDigest"),
      analyzerId: id(head.analyzerId, "head.analyzerId"),
      analyzerRevision: nonNegative(
        head.analyzerRevision,
        "head.analyzerRevision",
      ),
      analysisDigest: sha(head.analysisDigest, "head.analysisDigest"),
      assessmentDigest: sha(head.assessmentDigest, "head.assessmentDigest"),
      expiresAtLogicalMs: positive(
        head.expiresAtLogicalMs,
        "head.expiresAtLogicalMs",
      ),
    });
    if (
      normalized.headKey !==
      contextIntegrityHeadKeyV1({
        itemId: normalized.itemId,
        sourceId: normalized.sourceId,
        analyzerId: normalized.analyzerId,
      })
    )
      fail("context_integrity_head_key_invalid");
    return normalized;
  });
  heads.sort(headOrder);
  sortedUnique(
    heads.map(({ headKey }) => headKey),
    "context integrity head keys",
  );
  return freeze(heads);
}

function normalizeWindow(
  input: readonly ContextIntegrityWindowEntryV1[],
): readonly ContextIntegrityWindowEntryV1[] {
  if (!Array.isArray(input) || input.length > 1_024)
    fail("context_integrity_window_invalid");
  let priorTime = -1;
  return freeze(
    input.map((entry) => {
      assertExactKeys(entry, windowKeys, "context integrity window entry");
      if (entry.schemaVersion !== CONTEXT_INTEGRITY_SCHEMA_VERSION_V1)
        fail("context_integrity_window_schema_invalid");
      const normalized = freeze({
        schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
        requestDigest: sha(entry.requestDigest, "window.requestDigest"),
        maximumRiskBps: bps(entry.maximumRiskBps, "window.maximumRiskBps"),
        maximumUncertaintyBps: bps(
          entry.maximumUncertaintyBps,
          "window.maximumUncertaintyBps",
        ),
        isolatedItems: nonNegative(entry.isolatedItems, "window.isolatedItems"),
        deniedItems: nonNegative(entry.deniedItems, "window.deniedItems"),
        evaluatedAtLogicalMs: nonNegative(
          entry.evaluatedAtLogicalMs,
          "window.evaluatedAtLogicalMs",
        ),
      });
      if (normalized.evaluatedAtLogicalMs < priorTime)
        fail("context_integrity_window_time_rollback");
      priorTime = normalized.evaluatedAtLogicalMs;
      return normalized;
    }),
  );
}

function normalizeInterventionCounts(
  input: ContextIntegrityInterventionCountsV1,
): ContextIntegrityInterventionCountsV1 {
  assertExactKeys(
    input,
    interventionKeys,
    "context integrity intervention counts",
  );
  return freeze({
    restricted: nonNegative(input.restricted, "counts.restricted"),
    isolated: nonNegative(input.isolated, "counts.isolated"),
    corroborationRequired: nonNegative(
      input.corroborationRequired,
      "counts.corroborationRequired",
    ),
    denied: nonNegative(input.denied, "counts.denied"),
  });
}

function normalizeDecision(input: unknown): ContextIntegrityDecisionV1 {
  assertExactKeys(input, decisionKeys, "context integrity decision");
  const value = input as unknown as ContextIntegrityDecisionV1;
  if (value.schemaVersion !== CONTEXT_INTEGRITY_SCHEMA_VERSION_V1)
    fail("context_integrity_decision_schema_invalid");
  if (!Array.isArray(value.items) || value.items.length > 256)
    fail("context_integrity_decision_items_invalid");
  const items = value.items.map((item) => {
    assertExactKeys(item, itemDecisionKeys, "context integrity item decision");
    if (item.schemaVersion !== CONTEXT_INTEGRITY_SCHEMA_VERSION_V1)
      fail("context_integrity_item_decision_schema_invalid");
    return freeze({
      schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
      itemId: id(item.itemId, "decision.itemId"),
      itemDigest: sha(item.itemDigest, "decision.itemDigest"),
      action: oneOf(item.action, itemActions, "decision.action"),
      riskBps: bps(item.riskBps, "decision.riskBps"),
      uncertaintyBps: bps(item.uncertaintyBps, "decision.uncertaintyBps"),
      reasonCodes: tokens(item.reasonCodes, "decision.reasonCodes", 64),
      assessmentDigest: nullableDigest(
        item.assessmentDigest,
        "decision.assessmentDigest",
      ),
    });
  });
  assertUnique(
    items.map(({ itemId }) => itemId),
    "context integrity decision item IDs",
  );
  const body = freeze({
    schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
    controllerId: id(value.controllerId, "decision.controllerId"),
    controllerVersion: positive(
      value.controllerVersion,
      "decision.controllerVersion",
    ),
    implementationId: id(value.implementationId, "decision.implementationId"),
    policyId: id(value.policyId, "decision.policyId"),
    policyVersion: positive(value.policyVersion, "decision.policyVersion"),
    policyDigest: sha(value.policyDigest, "decision.policyDigest"),
    analyzerId: id(value.analyzerId, "decision.analyzerId"),
    analyzerVersion: positive(
      value.analyzerVersion,
      "decision.analyzerVersion",
    ),
    analyzerImplementationDigest: sha(
      value.analyzerImplementationDigest,
      "decision.analyzerImplementationDigest",
    ),
    requestId: id(value.requestId, "decision.requestId"),
    requestDigest: sha(value.requestDigest, "decision.requestDigest"),
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
    disposition: oneOf(
      value.disposition,
      ["allow", "abstain", "deny"],
      "decision.disposition",
    ),
    filterRequired: boolean(value.filterRequired, "decision.filterRequired"),
    stateStatus: stateStatus(value.stateStatus),
    degraded: boolean(value.degraded, "decision.degraded"),
    items: freeze(items),
  } satisfies Omit<
    ContextIntegrityDecisionV1,
    "decisionId" | "decisionDigest"
  >);
  const expectedFilterRequired = body.items.some(
    ({ action }) => action === "isolate" || action === "require_corroboration",
  );
  if (
    body.committedStateRevision !== body.priorStateRevision + 1 ||
    body.expiresAtLogicalMs <= body.evaluatedAtLogicalMs ||
    body.filterRequired !== expectedFilterRequired ||
    body.degraded !== (body.stateStatus !== "active") ||
    (body.items.some(({ action }) => action === "deny") &&
      body.disposition !== "deny") ||
    (body.disposition === "allow" &&
      (body.stateStatus === "paused" || body.stateStatus === "denied"))
  )
    fail("context_integrity_decision_revision_invalid");
  const decisionDigest = digestContextIntegrityJsonV1(
    "decision",
    body as unknown as JsonValue,
  );
  const decisionId = `context-integrity-decision.${decisionDigest.slice(7)}`;
  if (
    value.decisionId !== decisionId ||
    value.decisionDigest !== decisionDigest
  )
    fail("context_integrity_decision_digest_invalid");
  return freeze({ ...body, decisionId, decisionDigest });
}

function decideItemAction(input: {
  readonly item: ContextIntegrityItemV1;
  readonly assessment: ContextIntegrityAssessmentV1;
  readonly policy: ContextIntegrityPolicyV1;
  readonly contradictory: boolean;
  readonly reasons: Set<string>;
}): ContextIntegrityItemActionV1 {
  const { item, assessment, policy, reasons } = input;
  if (
    assessment.disposition === "deny" ||
    assessment.riskBps >= policy.thresholds.denyRiskBps
  ) {
    reasons.add("risk_denied");
    return "deny";
  }
  if (input.contradictory) {
    reasons.add("claim_contradiction");
    return assessment.riskBps >= policy.thresholds.contradictionRiskBps
      ? "isolate"
      : "require_corroboration";
  }
  if (
    item.claimKeyDigest !== null &&
    item.corroborationGroupIds.length < policy.minimumCorroborationGroups &&
    !policy.trustedSourceZones.includes(item.sourceZone)
  ) {
    reasons.add("corroboration_insufficient");
    return "require_corroboration";
  }
  if (
    assessment.disposition === "quarantine" ||
    assessment.disposition === "unavailable" ||
    assessment.riskBps >= policy.thresholds.quarantineRiskBps ||
    assessment.uncertaintyBps > policy.thresholds.maximumUncertaintyBps
  ) {
    reasons.add(
      assessment.uncertaintyBps > policy.thresholds.maximumUncertaintyBps
        ? "uncertainty_excessive"
        : "risk_quarantined",
    );
    return "isolate";
  }
  if (
    assessment.disposition === "caution" ||
    assessment.riskBps >= policy.thresholds.cautionRiskBps
  ) {
    reasons.add("risk_restricted");
    return "restrict";
  }
  reasons.add("context_admitted");
  return "admit";
}

function contradictoryClaimKeys(
  items: readonly ContextIntegrityItemV1[],
): ReadonlySet<string> {
  const values = new Map<string, Set<string>>();
  const groups = new Map<string, Set<string>>();
  for (const item of items) {
    if (!item.claimKeyDigest || !item.claimValueDigest) continue;
    const claimValues = values.get(item.claimKeyDigest) ?? new Set<string>();
    claimValues.add(item.claimValueDigest);
    values.set(item.claimKeyDigest, claimValues);
    const claimGroups = groups.get(item.claimKeyDigest) ?? new Set<string>();
    for (const groupId of item.corroborationGroupIds) claimGroups.add(groupId);
    groups.set(item.claimKeyDigest, claimGroups);
  }
  return new Set(
    [...values.entries()]
      .filter(
        ([key, claimValues]) =>
          claimValues.size > 1 && (groups.get(key)?.size ?? 0) > 1,
      )
      .map(([key]) => key),
  );
}

function headFrom(
  item: ContextIntegrityItemV1,
  assessment: ContextIntegrityAssessmentV1,
): ContextIntegrityHeadV1 {
  return freeze({
    schemaVersion: CONTEXT_INTEGRITY_SCHEMA_VERSION_V1,
    headKey: contextIntegrityHeadKeyV1({
      itemId: item.itemId,
      sourceId: item.sourceId,
      analyzerId: assessment.analyzerId,
    }),
    itemId: item.itemId,
    sourceId: item.sourceId,
    sourceVersion: item.sourceVersion,
    sourceRevision: item.sourceRevision,
    contentDigest: item.contentDigest,
    analyzerId: assessment.analyzerId,
    analyzerRevision: assessment.analyzerRevision,
    analysisDigest: assessment.analysisDigest,
    assessmentDigest: assessment.assessmentDigest,
    expiresAtLogicalMs: item.expiresAtLogicalMs,
  });
}

function assertStateBindings(
  state: ContextIntegrityStateV1,
  policy: ContextIntegrityPolicyRecordV1,
): void {
  if (
    state.policyId !== policy.policy.policyId ||
    state.policyVersion !== policy.policy.policyVersion ||
    state.policyDigest !== policy.policyDigest
  )
    fail("context_integrity_policy_binding_changed");
}

function assertRuntimeStateBinding(
  state: ContextIntegrityStateV1,
  runtime: Pick<
    ContextIntegrityPortV1,
    | "controllerId"
    | "controllerVersion"
    | "implementationId"
    | "analyzerId"
    | "analyzerVersion"
    | "analyzerImplementationDigest"
  >,
): void {
  if (
    state.controllerId !== runtime.controllerId ||
    state.controllerVersion !== runtime.controllerVersion ||
    state.implementationId !== runtime.implementationId ||
    state.analyzerId !== runtime.analyzerId ||
    state.analyzerVersion !== runtime.analyzerVersion ||
    state.analyzerImplementationDigest !== runtime.analyzerImplementationDigest
  )
    fail("context_integrity_runtime_binding_changed");
}

function checkpoint(input: unknown): ContextIntegrityCheckpointV1 {
  return oneOf(input, checkpoints, "checkpoint");
}

function targetKind(input: unknown): ContextIntegrityTargetKindV1 {
  return oneOf(input, targetKinds, "targetKind");
}

function sourceZone(input: unknown): ContextIntegritySourceZoneV1 {
  return oneOf(input, CONTEXT_INTEGRITY_SOURCE_ZONES_V1, "sourceZone");
}

function memoryTier(input: unknown): ContextIntegrityMemoryTierV1 {
  return oneOf(input, CONTEXT_INTEGRITY_MEMORY_TIERS_V1, "memoryTier");
}

function assessmentDisposition(
  input: unknown,
): ContextIntegrityAssessmentDispositionV1 {
  return oneOf(input, assessmentDispositions, "assessment disposition");
}

function stateStatus(input: unknown): ContextIntegrityStateStatusV1 {
  return oneOf(input, stateStatuses, "state status");
}

function id(input: unknown, label: string): string {
  assertIdentifier(input, label);
  return input;
}

function sha(input: unknown, label: string): string {
  assertDigest(input, label);
  return input;
}

function nullableDigest(input: unknown, label: string): string | null {
  return input === null ? null : sha(input, label);
}

function positive(input: unknown, label: string): number {
  assertSafeInteger(input, label, 1);
  return input;
}

function nonNegative(input: unknown, label: string): number {
  assertSafeInteger(input, label, 0);
  return input;
}

function bps(input: unknown, label: string): number {
  const value = nonNegative(input, label);
  if (value > 10_000) fail(`${label}_out_of_range`);
  return value;
}

function bounded(
  input: unknown,
  label: string,
  maximum: number,
  minimum: number,
): number {
  assertSafeInteger(input, label, minimum);
  if (input > maximum) fail(`${label}_exceeds_hard_maximum`);
  return input;
}

function boolean(input: unknown, label: string): boolean {
  if (typeof input !== "boolean") fail(`${label}_invalid`);
  return input;
}

function oneOf<T extends string>(
  input: unknown,
  values: readonly T[],
  label: string,
): T {
  assertOneOf(input, values, label);
  return input;
}

function tokens(
  input: unknown,
  label: string,
  maximum: number,
): readonly string[] {
  if (!Array.isArray(input) || input.length > maximum) fail(`${label}_invalid`);
  const values = input.map((value, index) => id(value, `${label}[${index}]`));
  sortedUnique(values, label);
  return freeze(values);
}

function digests(
  input: unknown,
  label: string,
  maximum: number,
): readonly string[] {
  if (!Array.isArray(input) || input.length > maximum) fail(`${label}_invalid`);
  const values = input.map((value, index) => sha(value, `${label}[${index}]`));
  sortedUnique(values, label);
  return freeze(values);
}

function headOrder(
  left: ContextIntegrityHeadV1,
  right: ContextIntegrityHeadV1,
): number {
  return compare(left.headKey, right.headKey);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label}_duplicated`);
}

function safeAdd(left: number, right: number, reason: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) fail(reason);
  return result;
}

function freeze<T>(value: T): T {
  return deepFreeze(value);
}

function cloneJson<T>(value: T): T {
  return freeze(JSON.parse(JSON.stringify(value)) as T);
}

function fail(message: string): never {
  throw new TypeError(message);
}
