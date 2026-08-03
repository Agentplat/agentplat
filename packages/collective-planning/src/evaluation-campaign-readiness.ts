import type { JsonValue } from "@agentplat/core";

import {
  CollectivePlanningValidationError,
  canonicalizePlanningJsonV1,
  deepFreezePlanning,
  digestPlanningJsonV1,
} from "./canonical.js";
import type { PlanningDigestV1 } from "./contracts.js";
import {
  assertPlanningDigest,
  assertPlanningExactKeys,
  assertPlanningIdentifier,
  assertPlanningSafeInteger,
  assertPlanningToken,
} from "./validation.js";

export const CAMPAIGN_READINESS_SCHEMA_VERSION_V1 = 1 as const;
export const CAMPAIGN_READINESS_MAXIMUM_INTERACTIONS_V1 = 3_296_000 as const;
export const CAMPAIGN_READINESS_MAXIMUM_TRACE_EVENTS_V1 = 96_000_000 as const;
export const CAMPAIGN_READINESS_MAXIMUM_ARTIFACT_BYTES_V1 =
  16_106_127_360 as const;
export const CAMPAIGN_READINESS_MAXIMUM_SHARD_RUNNER_MINUTES_V1 =
  8_640 as const;
export const CAMPAIGN_READINESS_MAXIMUM_CONTROL_RUNNER_MINUTES_V1 =
  170 as const;

export const CAMPAIGN_READINESS_REQUIRED_CONTROL_IDS_V1 = Object.freeze([
  "immutable_source_and_plan",
  "bounded_capacity_estimate",
  "registered_runtime_separation",
  "durable_preflight_closure",
  "portable_node20_consumer",
  "portable_node22_consumer",
  "postgres_durable_consumer",
  "public_evidence_privacy",
  "predispatch_evidence_safety",
  "retention_and_indeterminate_safety",
  "production_dependency_security",
  "integrated_replanning_safety",
] as const);

export const CAMPAIGN_READINESS_CAMPAIGN_OUTCOME_IDS_V1 = Object.freeze([
  "scale_ladder_complete",
  "interaction_ceiling_observed",
  "paired_seed_coverage",
  "strata_complete",
  "sparse_topology_envelope",
  "authority_integrity",
  "evaluation_integrity",
  "exact_replay",
  "nominal_success_bound",
  "benign_success_bound",
  "paired_noninferiority_bound",
  "benign_recovery_latency",
  "planning_agreement",
  "role_coherence",
  "claim_discipline",
] as const);

export const CAMPAIGN_READINESS_RELEASE_OUTCOME_IDS_V1 = Object.freeze([
  "exact_registry_consumers",
  "immutable_release_tag",
  "staging_publication",
  "distribution_tag_promotion",
  "registry_evidence_match",
  "evidence_only_merge",
  "release_ci",
  "rollback_reconciliation",
] as const);

export type CampaignReadinessControlIdV1 =
  (typeof CAMPAIGN_READINESS_REQUIRED_CONTROL_IDS_V1)[number];
export type CampaignReadinessCampaignOutcomeIdV1 =
  (typeof CAMPAIGN_READINESS_CAMPAIGN_OUTCOME_IDS_V1)[number];
export type CampaignReadinessReleaseOutcomeIdV1 =
  (typeof CAMPAIGN_READINESS_RELEASE_OUTCOME_IDS_V1)[number];
export type CampaignReadinessRecommendationV1 =
  "no_go" | "ready_for_operator_authorization";

export interface CampaignCapacityEstimateV1 {
  readonly schemaVersion: 1;
  readonly kind: "campaign_capacity_estimate";
  readonly registrationDigest: PlanningDigestV1;
  readonly operationPlanDigest: PlanningDigestV1;
  readonly adapterDigest: PlanningDigestV1;
  readonly cells: 240;
  readonly slots: 960;
  readonly shards: 48;
  readonly cellsPerShard: 5;
  readonly slotsPerCell: 4;
  readonly maximumConcurrentShards: 2;
  readonly maximumInteractions: 3_296_000;
  readonly maximumTraceEvents: 96_000_000;
  readonly maximumArtifactBytes: 16_106_127_360;
  readonly maximumShardRunnerMinutes: 8_640;
  readonly maximumControlRunnerMinutes: 170;
  readonly paidModelCalls: 0;
  readonly monetaryCostStatus: "requires_operator_rate_card";
  readonly currency: null;
  readonly maximumAmountMinorUnits: null;
  readonly executionPermitted: false;
  readonly fullCampaignPermitted: false;
  readonly estimateDigest: PlanningDigestV1;
}

export interface CampaignReadinessPlanV1 {
  readonly schemaVersion: 1;
  readonly kind: "campaign_readiness_plan";
  readonly campaignId: string;
  readonly sourceCommit: string;
  readonly sourceTreeDigest: PlanningDigestV1;
  readonly registrationDigest: PlanningDigestV1;
  readonly operationPlanDigest: PlanningDigestV1;
  readonly adapterDigest: PlanningDigestV1;
  readonly capacityEstimateDigest: PlanningDigestV1;
  readonly requiredControlIds: readonly CampaignReadinessControlIdV1[];
  readonly campaignOutcomeIds: readonly CampaignReadinessCampaignOutcomeIdV1[];
  readonly releaseOutcomeIds: readonly CampaignReadinessReleaseOutcomeIdV1[];
  readonly executionPermitted: false;
  readonly fullCampaignPermitted: false;
  readonly readinessPlanDigest: PlanningDigestV1;
}

export interface CampaignReadinessEvidenceReceiptV1 {
  readonly schemaVersion: 1;
  readonly kind: "campaign_readiness_evidence_receipt";
  readonly controlId: CampaignReadinessControlIdV1;
  readonly sourceCommit: string;
  readonly sourceTreeDigest: PlanningDigestV1;
  readonly readinessPlanDigest: PlanningDigestV1;
  readonly status: "passed" | "failed";
  readonly reasonCode: string;
  readonly evidenceDigest: PlanningDigestV1;
  readonly receiptDigest: PlanningDigestV1;
}

export interface CampaignReadinessAssessmentV1 {
  readonly schemaVersion: 1;
  readonly kind: "campaign_readiness_assessment";
  readonly campaignId: string;
  readonly sourceCommit: string;
  readonly sourceTreeDigest: PlanningDigestV1;
  readonly readinessPlanDigest: PlanningDigestV1;
  readonly receiptDigests: readonly PlanningDigestV1[];
  readonly receiptsRoot: PlanningDigestV1;
  readonly passedControlIds: readonly CampaignReadinessControlIdV1[];
  readonly unmetControlIds: readonly CampaignReadinessControlIdV1[];
  readonly pendingCampaignOutcomeIds: readonly CampaignReadinessCampaignOutcomeIdV1[];
  readonly pendingReleaseOutcomeIds: readonly CampaignReadinessReleaseOutcomeIdV1[];
  readonly recommendation: CampaignReadinessRecommendationV1;
  readonly executionPermitted: false;
  readonly fullCampaignPermitted: false;
  readonly assessmentDigest: PlanningDigestV1;
}

const estimateBodyKeys = [
  "schemaVersion",
  "kind",
  "registrationDigest",
  "operationPlanDigest",
  "adapterDigest",
  "cells",
  "slots",
  "shards",
  "cellsPerShard",
  "slotsPerCell",
  "maximumConcurrentShards",
  "maximumInteractions",
  "maximumTraceEvents",
  "maximumArtifactBytes",
  "maximumShardRunnerMinutes",
  "maximumControlRunnerMinutes",
  "paidModelCalls",
  "monetaryCostStatus",
  "currency",
  "maximumAmountMinorUnits",
  "executionPermitted",
  "fullCampaignPermitted",
] as const;
const estimateKeys = [...estimateBodyKeys, "estimateDigest"] as const;
const planBodyKeys = [
  "schemaVersion",
  "kind",
  "campaignId",
  "sourceCommit",
  "sourceTreeDigest",
  "registrationDigest",
  "operationPlanDigest",
  "adapterDigest",
  "capacityEstimateDigest",
  "requiredControlIds",
  "campaignOutcomeIds",
  "releaseOutcomeIds",
  "executionPermitted",
  "fullCampaignPermitted",
] as const;
const planKeys = [...planBodyKeys, "readinessPlanDigest"] as const;
const receiptBodyKeys = [
  "schemaVersion",
  "kind",
  "controlId",
  "sourceCommit",
  "sourceTreeDigest",
  "readinessPlanDigest",
  "status",
  "reasonCode",
  "evidenceDigest",
] as const;
const receiptKeys = [...receiptBodyKeys, "receiptDigest"] as const;
const assessmentBodyKeys = [
  "schemaVersion",
  "kind",
  "campaignId",
  "sourceCommit",
  "sourceTreeDigest",
  "readinessPlanDigest",
  "receiptDigests",
  "receiptsRoot",
  "passedControlIds",
  "unmetControlIds",
  "pendingCampaignOutcomeIds",
  "pendingReleaseOutcomeIds",
  "recommendation",
  "executionPermitted",
  "fullCampaignPermitted",
] as const;
const assessmentKeys = [...assessmentBodyKeys, "assessmentDigest"] as const;

export function createCampaignCapacityEstimateV1(
  input: Readonly<{
    schemaVersion: 1;
    registrationDigest: PlanningDigestV1;
    operationPlanDigest: PlanningDigestV1;
    adapterDigest: PlanningDigestV1;
  }>,
): CampaignCapacityEstimateV1 {
  assertPlanningExactKeys(
    input,
    [
      "schemaVersion",
      "registrationDigest",
      "operationPlanDigest",
      "adapterDigest",
    ],
    "campaign capacity estimate input",
  );
  const body = normalizeEstimateBody({
    schemaVersion: 1,
    kind: "campaign_capacity_estimate",
    registrationDigest: input.registrationDigest,
    operationPlanDigest: input.operationPlanDigest,
    adapterDigest: input.adapterDigest,
    cells: 240,
    slots: 960,
    shards: 48,
    cellsPerShard: 5,
    slotsPerCell: 4,
    maximumConcurrentShards: 2,
    maximumInteractions: CAMPAIGN_READINESS_MAXIMUM_INTERACTIONS_V1,
    maximumTraceEvents: CAMPAIGN_READINESS_MAXIMUM_TRACE_EVENTS_V1,
    maximumArtifactBytes: CAMPAIGN_READINESS_MAXIMUM_ARTIFACT_BYTES_V1,
    maximumShardRunnerMinutes:
      CAMPAIGN_READINESS_MAXIMUM_SHARD_RUNNER_MINUTES_V1,
    maximumControlRunnerMinutes:
      CAMPAIGN_READINESS_MAXIMUM_CONTROL_RUNNER_MINUTES_V1,
    paidModelCalls: 0,
    monetaryCostStatus: "requires_operator_rate_card",
    currency: null,
    maximumAmountMinorUnits: null,
    executionPermitted: false,
    fullCampaignPermitted: false,
  });
  return freeze({
    ...body,
    estimateDigest: readinessDigest("capacity-estimate", body),
  });
}

export function validateCampaignCapacityEstimateV1(
  input: unknown,
): CampaignCapacityEstimateV1 {
  assertPlanningExactKeys(input, estimateKeys, "campaign capacity estimate");
  const value = input as unknown as CampaignCapacityEstimateV1;
  const body = normalizeEstimateBody(without(value, "estimateDigest"));
  const rebuilt = freeze({
    ...body,
    estimateDigest: readinessDigest("capacity-estimate", body),
  });
  equalCanonical(value, rebuilt, "campaign capacity estimate");
  return rebuilt;
}

export function createCampaignReadinessPlanV1(
  input: Readonly<{
    schemaVersion: 1;
    campaignId: string;
    sourceCommit: string;
    sourceTreeDigest: PlanningDigestV1;
    registrationDigest: PlanningDigestV1;
    operationPlanDigest: PlanningDigestV1;
    adapterDigest: PlanningDigestV1;
    capacityEstimateDigest: PlanningDigestV1;
  }>,
): CampaignReadinessPlanV1 {
  assertPlanningExactKeys(
    input,
    [
      "schemaVersion",
      "campaignId",
      "sourceCommit",
      "sourceTreeDigest",
      "registrationDigest",
      "operationPlanDigest",
      "adapterDigest",
      "capacityEstimateDigest",
    ],
    "campaign readiness plan input",
  );
  const body = normalizePlanBody({
    kind: "campaign_readiness_plan",
    ...input,
    requiredControlIds: CAMPAIGN_READINESS_REQUIRED_CONTROL_IDS_V1,
    campaignOutcomeIds: CAMPAIGN_READINESS_CAMPAIGN_OUTCOME_IDS_V1,
    releaseOutcomeIds: CAMPAIGN_READINESS_RELEASE_OUTCOME_IDS_V1,
    executionPermitted: false,
    fullCampaignPermitted: false,
  });
  return freeze({
    ...body,
    readinessPlanDigest: readinessDigest("readiness-plan", body),
  });
}

export function validateCampaignReadinessPlanV1(
  input: unknown,
  estimateInput?: unknown,
): CampaignReadinessPlanV1 {
  assertPlanningExactKeys(input, planKeys, "campaign readiness plan");
  const value = input as unknown as CampaignReadinessPlanV1;
  const body = normalizePlanBody(without(value, "readinessPlanDigest"));
  const rebuilt = freeze({
    ...body,
    readinessPlanDigest: readinessDigest("readiness-plan", body),
  });
  equalCanonical(value, rebuilt, "campaign readiness plan");
  if (estimateInput !== undefined) {
    const estimate = validateCampaignCapacityEstimateV1(estimateInput);
    if (
      estimate.estimateDigest !== rebuilt.capacityEstimateDigest ||
      estimate.registrationDigest !== rebuilt.registrationDigest ||
      estimate.operationPlanDigest !== rebuilt.operationPlanDigest ||
      estimate.adapterDigest !== rebuilt.adapterDigest
    )
      invalid("campaign capacity estimate is outside the readiness plan");
  }
  return rebuilt;
}

export function createCampaignReadinessEvidenceReceiptV1(
  input: Omit<CampaignReadinessEvidenceReceiptV1, "kind" | "receiptDigest">,
): CampaignReadinessEvidenceReceiptV1 {
  assertPlanningExactKeys(
    input,
    receiptBodyKeys.filter((key) => key !== "kind"),
    "campaign readiness evidence receipt input",
  );
  const body = normalizeReceiptBody({
    ...input,
    kind: "campaign_readiness_evidence_receipt",
  });
  return freeze({
    ...body,
    receiptDigest: readinessDigest("evidence-receipt", body),
  });
}

export function validateCampaignReadinessEvidenceReceiptV1(
  input: unknown,
  planInput?: unknown,
): CampaignReadinessEvidenceReceiptV1 {
  assertPlanningExactKeys(
    input,
    receiptKeys,
    "campaign readiness evidence receipt",
  );
  const value = input as unknown as CampaignReadinessEvidenceReceiptV1;
  const body = normalizeReceiptBody(without(value, "receiptDigest"));
  const rebuilt = freeze({
    ...body,
    receiptDigest: readinessDigest("evidence-receipt", body),
  });
  equalCanonical(value, rebuilt, "campaign readiness evidence receipt");
  if (planInput !== undefined) {
    const plan = validateCampaignReadinessPlanV1(planInput);
    if (
      rebuilt.sourceCommit !== plan.sourceCommit ||
      rebuilt.sourceTreeDigest !== plan.sourceTreeDigest ||
      rebuilt.readinessPlanDigest !== plan.readinessPlanDigest
    )
      invalid("campaign readiness receipt is outside the readiness plan");
  }
  return rebuilt;
}

export function deriveCampaignReadinessAssessmentV1(
  input: Readonly<{
    schemaVersion: 1;
    plan: CampaignReadinessPlanV1;
    receipts: readonly CampaignReadinessEvidenceReceiptV1[];
  }>,
): CampaignReadinessAssessmentV1 {
  assertPlanningExactKeys(
    input,
    ["schemaVersion", "plan", "receipts"],
    "campaign readiness assessment input",
  );
  if (input.schemaVersion !== 1) invalid("readiness schema version is invalid");
  const plan = validateCampaignReadinessPlanV1(input.plan);
  if (!Array.isArray(input.receipts))
    invalid("readiness receipts must be an array");
  const byControl = new Map<
    CampaignReadinessControlIdV1,
    CampaignReadinessEvidenceReceiptV1
  >();
  for (const candidate of input.receipts) {
    const receipt = validateCampaignReadinessEvidenceReceiptV1(candidate, plan);
    if (byControl.has(receipt.controlId))
      invalid("campaign readiness receipt control is duplicated");
    byControl.set(receipt.controlId, receipt);
  }
  const ordered = CAMPAIGN_READINESS_REQUIRED_CONTROL_IDS_V1.flatMap(
    (controlId) => {
      const receipt = byControl.get(controlId);
      return receipt === undefined ? [] : [receipt];
    },
  );
  const passedControlIds = CAMPAIGN_READINESS_REQUIRED_CONTROL_IDS_V1.filter(
    (controlId) => byControl.get(controlId)?.status === "passed",
  );
  const unmetControlIds = CAMPAIGN_READINESS_REQUIRED_CONTROL_IDS_V1.filter(
    (controlId) => byControl.get(controlId)?.status !== "passed",
  );
  const receiptDigests = ordered.map((receipt) => receipt.receiptDigest);
  const receiptsRoot = readinessDigest("receipt-closure", {
    schemaVersion: 1,
    readinessPlanDigest: plan.readinessPlanDigest,
    receiptDigests,
  });
  const body = normalizeAssessmentBody({
    schemaVersion: 1,
    kind: "campaign_readiness_assessment",
    campaignId: plan.campaignId,
    sourceCommit: plan.sourceCommit,
    sourceTreeDigest: plan.sourceTreeDigest,
    readinessPlanDigest: plan.readinessPlanDigest,
    receiptDigests,
    receiptsRoot,
    passedControlIds,
    unmetControlIds,
    pendingCampaignOutcomeIds: CAMPAIGN_READINESS_CAMPAIGN_OUTCOME_IDS_V1,
    pendingReleaseOutcomeIds: CAMPAIGN_READINESS_RELEASE_OUTCOME_IDS_V1,
    recommendation:
      unmetControlIds.length === 0
        ? "ready_for_operator_authorization"
        : "no_go",
    executionPermitted: false,
    fullCampaignPermitted: false,
  });
  return freeze({
    ...body,
    assessmentDigest: readinessDigest("readiness-assessment", body),
  });
}

export function validateCampaignReadinessAssessmentV1(
  input: unknown,
  planInput: unknown,
  receiptInputs: readonly unknown[],
): CampaignReadinessAssessmentV1 {
  assertPlanningExactKeys(
    input,
    assessmentKeys,
    "campaign readiness assessment",
  );
  const value = input as unknown as CampaignReadinessAssessmentV1;
  const plan = validateCampaignReadinessPlanV1(planInput);
  if (!Array.isArray(receiptInputs))
    invalid("readiness receipts must be an array");
  const receipts = receiptInputs.map((receipt) =>
    validateCampaignReadinessEvidenceReceiptV1(receipt, plan),
  );
  const rebuilt = deriveCampaignReadinessAssessmentV1({
    schemaVersion: 1,
    plan,
    receipts,
  });
  equalCanonical(value, rebuilt, "campaign readiness assessment");
  return rebuilt;
}

function normalizeEstimateBody(
  input: Omit<CampaignCapacityEstimateV1, "estimateDigest">,
): Omit<CampaignCapacityEstimateV1, "estimateDigest"> {
  assertPlanningExactKeys(
    input,
    estimateBodyKeys,
    "campaign capacity estimate body",
  );
  if (
    input.schemaVersion !== 1 ||
    input.kind !== "campaign_capacity_estimate" ||
    input.cells !== 240 ||
    input.slots !== 960 ||
    input.shards !== 48 ||
    input.cellsPerShard !== 5 ||
    input.slotsPerCell !== 4 ||
    input.maximumConcurrentShards !== 2 ||
    input.maximumInteractions !== CAMPAIGN_READINESS_MAXIMUM_INTERACTIONS_V1 ||
    input.maximumTraceEvents !== CAMPAIGN_READINESS_MAXIMUM_TRACE_EVENTS_V1 ||
    input.maximumArtifactBytes !==
      CAMPAIGN_READINESS_MAXIMUM_ARTIFACT_BYTES_V1 ||
    input.maximumShardRunnerMinutes !==
      CAMPAIGN_READINESS_MAXIMUM_SHARD_RUNNER_MINUTES_V1 ||
    input.maximumControlRunnerMinutes !==
      CAMPAIGN_READINESS_MAXIMUM_CONTROL_RUNNER_MINUTES_V1 ||
    input.paidModelCalls !== 0 ||
    input.monetaryCostStatus !== "requires_operator_rate_card" ||
    input.currency !== null ||
    input.maximumAmountMinorUnits !== null ||
    input.executionPermitted !== false ||
    input.fullCampaignPermitted !== false
  )
    invalid("campaign capacity estimate exceeds or changes the fixed envelope");
  assertPlanningDigest(input.registrationDigest, "registrationDigest");
  assertPlanningDigest(input.operationPlanDigest, "operationPlanDigest");
  assertPlanningDigest(input.adapterDigest, "adapterDigest");
  return freeze({ ...input });
}

function normalizePlanBody(
  input: Omit<CampaignReadinessPlanV1, "readinessPlanDigest">,
): Omit<CampaignReadinessPlanV1, "readinessPlanDigest"> {
  assertPlanningExactKeys(input, planBodyKeys, "campaign readiness plan body");
  if (
    input.schemaVersion !== 1 ||
    input.kind !== "campaign_readiness_plan" ||
    input.executionPermitted !== false ||
    input.fullCampaignPermitted !== false
  )
    invalid("campaign readiness plan boundary is invalid");
  assertPlanningIdentifier(input.campaignId, "campaignId");
  commit(input.sourceCommit);
  assertPlanningDigest(input.sourceTreeDigest, "sourceTreeDigest");
  assertPlanningDigest(input.registrationDigest, "registrationDigest");
  assertPlanningDigest(input.operationPlanDigest, "operationPlanDigest");
  assertPlanningDigest(input.adapterDigest, "adapterDigest");
  assertPlanningDigest(input.capacityEstimateDigest, "capacityEstimateDigest");
  exactValues(
    input.requiredControlIds,
    CAMPAIGN_READINESS_REQUIRED_CONTROL_IDS_V1,
    "requiredControlIds",
  );
  exactValues(
    input.campaignOutcomeIds,
    CAMPAIGN_READINESS_CAMPAIGN_OUTCOME_IDS_V1,
    "campaignOutcomeIds",
  );
  exactValues(
    input.releaseOutcomeIds,
    CAMPAIGN_READINESS_RELEASE_OUTCOME_IDS_V1,
    "releaseOutcomeIds",
  );
  return freeze({ ...input });
}

function normalizeReceiptBody(
  input: Omit<CampaignReadinessEvidenceReceiptV1, "receiptDigest">,
): Omit<CampaignReadinessEvidenceReceiptV1, "receiptDigest"> {
  assertPlanningExactKeys(
    input,
    receiptBodyKeys,
    "campaign readiness receipt body",
  );
  if (
    input.schemaVersion !== 1 ||
    input.kind !== "campaign_readiness_evidence_receipt" ||
    !CAMPAIGN_READINESS_REQUIRED_CONTROL_IDS_V1.includes(input.controlId) ||
    (input.status !== "passed" && input.status !== "failed")
  )
    invalid("campaign readiness receipt boundary is invalid");
  commit(input.sourceCommit);
  assertPlanningDigest(input.sourceTreeDigest, "sourceTreeDigest");
  assertPlanningDigest(input.readinessPlanDigest, "readinessPlanDigest");
  assertPlanningToken(input.reasonCode, "reasonCode");
  assertPlanningDigest(input.evidenceDigest, "evidenceDigest");
  return freeze({ ...input });
}

function normalizeAssessmentBody(
  input: Omit<CampaignReadinessAssessmentV1, "assessmentDigest">,
): Omit<CampaignReadinessAssessmentV1, "assessmentDigest"> {
  assertPlanningExactKeys(
    input,
    assessmentBodyKeys,
    "campaign readiness assessment body",
  );
  if (
    input.schemaVersion !== 1 ||
    input.kind !== "campaign_readiness_assessment" ||
    input.executionPermitted !== false ||
    input.fullCampaignPermitted !== false
  )
    invalid("campaign readiness assessment boundary is invalid");
  assertPlanningIdentifier(input.campaignId, "campaignId");
  commit(input.sourceCommit);
  assertPlanningDigest(input.sourceTreeDigest, "sourceTreeDigest");
  assertPlanningDigest(input.readinessPlanDigest, "readinessPlanDigest");
  assertPlanningDigest(input.receiptsRoot, "receiptsRoot");
  digestArray(input.receiptDigests, "receiptDigests");
  orderedSubset(input.passedControlIds, "passedControlIds");
  orderedSubset(input.unmetControlIds, "unmetControlIds");
  if (
    input.passedControlIds.length + input.unmetControlIds.length !==
      CAMPAIGN_READINESS_REQUIRED_CONTROL_IDS_V1.length ||
    input.passedControlIds.some((id) => input.unmetControlIds.includes(id))
  )
    invalid("campaign readiness control partition is invalid");
  exactValues(
    input.pendingCampaignOutcomeIds,
    CAMPAIGN_READINESS_CAMPAIGN_OUTCOME_IDS_V1,
    "pendingCampaignOutcomeIds",
  );
  exactValues(
    input.pendingReleaseOutcomeIds,
    CAMPAIGN_READINESS_RELEASE_OUTCOME_IDS_V1,
    "pendingReleaseOutcomeIds",
  );
  const expectedRecommendation =
    input.unmetControlIds.length === 0
      ? "ready_for_operator_authorization"
      : "no_go";
  if (input.recommendation !== expectedRecommendation)
    invalid("campaign readiness recommendation is not derived");
  return freeze({ ...input });
}

function readinessDigest(kind: string, value: unknown): PlanningDigestV1 {
  return digestPlanningJsonV1("evaluation-campaign-artifact-v1", {
    schemaVersion: 1,
    kind,
    value,
  } as JsonValue);
}

function exactValues<T extends string>(
  actual: readonly T[],
  expected: readonly T[],
  label: string,
): void {
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  )
    invalid(`${label} must match the closed ordered set`);
}

function orderedSubset(
  actual: readonly CampaignReadinessControlIdV1[],
  label: string,
): void {
  if (!Array.isArray(actual)) invalid(`${label} must be an array`);
  let previous = -1;
  for (const value of actual) {
    const index = CAMPAIGN_READINESS_REQUIRED_CONTROL_IDS_V1.indexOf(value);
    if (index <= previous) invalid(`${label} must be an ordered unique subset`);
    previous = index;
  }
}

function digestArray(value: readonly PlanningDigestV1[], label: string): void {
  if (!Array.isArray(value)) invalid(`${label} must be an array`);
  for (const digest of value) assertPlanningDigest(digest, label);
}

function commit(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/u.test(value))
    invalid("sourceCommit must be a 40-hex commit");
}

function without<T extends object, K extends keyof T>(
  value: T,
  key: K,
): Omit<T, K> {
  const result = { ...value };
  delete result[key];
  return result;
}

function freeze<T>(value: T): T {
  return deepFreezePlanning(value as JsonValue) as T;
}

function equalCanonical(left: unknown, right: unknown, label: string): void {
  if (
    canonicalizePlanningJsonV1(left as JsonValue) !==
    canonicalizePlanningJsonV1(right as JsonValue)
  )
    invalid(`${label} does not match canonical content`);
}

function invalid(message: string): never {
  throw new CollectivePlanningValidationError(message);
}
