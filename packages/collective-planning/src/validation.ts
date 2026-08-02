import type { JsonValue } from "@agentplat/core";

import {
  CollectivePlanningValidationError,
  canonicalizePlanningJsonV1,
  deepFreezePlanning,
  digestPlanningJsonV1,
  planningUtf8ByteLengthV1,
} from "./canonical.js";
import type {
  AdaptiveRoleBindingV1,
  CollectivePlanningSnapshotV1,
  FragmentWorkMappingV1,
  MissionIntentV1,
  MissionObjectiveBindingV1,
  MissionObservationV1,
  PlanFragmentDecisionV1,
  PlanFragmentProposalV1,
  PlanFragmentV1,
  PlanningBudgetReservationV1,
  PlanningBudgetShardV1,
  PlanningDigestV1,
  PlanningDomainHighWaterV1,
  PlanningLimitsV1,
  PlanScoringDimensionV1,
  PlanSelectionPolicyV1,
  PlanSemanticSlotHeadV1,
  PlanTieBreakKeyV1,
  PlanViewV1,
} from "./contracts.js";

const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const tokenPattern = /^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/u;
const proposalIdPattern = /^plan-proposal:[0-9a-f]{64}$/u;
const fragmentIdPattern = /^plan-fragment:[0-9a-f]{64}$/u;
const rfc3339Pattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/u;

const intentKeys = [
  "schemaVersion",
  "missionIntentId",
  "revision",
  "predecessorDigest",
  "tenantId",
  "policyDomainId",
  "objective",
  "mandateDigest",
  "outcomeStatements",
  "permittedResourceClasses",
  "permittedCapabilityKeys",
  "planningLimits",
  "selectionPolicyDigest",
  "validFrom",
  "validUntil",
  "intentDigest",
] as const;

const proposalKeys = [
  "schemaVersion",
  "proposalId",
  "proposalRevision",
  "missionIntentId",
  "intentRevision",
  "intentDigest",
  "proposerPeerId",
  "proposerInstanceId",
  "semanticSlotKey",
  "predecessorFragmentDigest",
  "parentFragmentDigests",
  "dependencyFragmentDigests",
  "outcomeStatements",
  "roleKey",
  "requiredCapabilityKeys",
  "inputReferenceDigest",
  "basisObservationDigests",
  "requestedBudgetUnits",
  "workDeadline",
  "proposedAtLogicalMs",
  "proposalDigest",
] as const;

const fragmentKeys = [
  "schemaVersion",
  "fragmentId",
  "fragmentRevision",
  "previousStateDigest",
  "proposalId",
  "proposalRevision",
  "proposalDigest",
  "decisionDigest",
  "missionIntentId",
  "intentRevision",
  "intentDigest",
  "proposerPeerId",
  "proposerInstanceId",
  "semanticSlotKey",
  "predecessorFragmentDigest",
  "parentFragmentDigests",
  "dependencyFragmentDigests",
  "outcomeStatements",
  "roleKey",
  "requiredCapabilityKeys",
  "inputReferenceDigest",
  "basisObservationDigests",
  "requestedBudgetUnits",
  "workDeadline",
  "proposedAtLogicalMs",
  "acceptancePolicyDigest",
  "acceptedAtLogicalMs",
  "localPlanViewRevision",
  "status",
  "fragmentDigest",
] as const;

const activeFragmentStatuses = new Set([
  "active",
  "offered",
  "assigned",
  "executing",
]);
const observationVisibilities = new Set([
  "public",
  "capability",
  "resource",
  "outcome",
  "failure",
]);
const fragmentStatuses = new Set([
  "candidate",
  "active",
  "offered",
  "assigned",
  "executing",
  "superseded",
  "cancelled",
  "completed",
  "failed",
]);
const scoringDimensions = new Set([
  "outcome_coverage",
  "budget_efficiency",
  "deadline_margin",
  "capability_confidence",
  "dependency_readiness",
  "bounded_risk",
]);
const tieBreakKeys = new Set<PlanTieBreakKeyV1>([
  "score",
  "requested_budget_units",
  "work_deadline",
  "proposed_at_logical_ms",
  "proposal_digest",
]);
const PLAN_VIEW_JSON_LIMITS_V1 = Object.freeze({
  maximumBytes: 67_108_864,
  maximumDepth: 32,
  maximumNodes: 2_000_000,
  maximumKeysPerObject: 256,
  maximumItemsPerArray: 262_144,
});

const forbiddenObservationKeyTerms = Object.freeze([
  "assignment",
  "assignee",
  "assigned",
  "authority",
  "grant",
  "permit",
  "fence",
  "fencing",
  "handler",
  "globalmembership",
  "hiddenstate",
  "hiddenworld",
  "terminalpredicate",
  "futureevents",
  "futurefault",
  "futureschedule",
  "faultschedule",
]);

export { CollectivePlanningValidationError };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function assertPlanningExactKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (!isPlainRecord(value))
    throw new CollectivePlanningValidationError(
      `${label} must be a plain object`,
    );
  if (Object.getOwnPropertySymbols(value).length > 0)
    throw new CollectivePlanningValidationError(
      `${label} may not contain symbol keys`,
    );
  const actual = Object.getOwnPropertyNames(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  )
    throw new CollectivePlanningValidationError(
      `${label} has an invalid shape`,
    );
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
      throw new CollectivePlanningValidationError(
        `${label} must contain enumerable data properties`,
      );
  }
}

function assertFactoryInputKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (!isPlainRecord(value))
    throw new CollectivePlanningValidationError(
      `${label} must be a plain object`,
    );
  if (Object.getOwnPropertySymbols(value).length > 0)
    throw new CollectivePlanningValidationError(
      `${label} may not contain symbol keys`,
    );
  const actual = Object.getOwnPropertyNames(value).sort();
  const allowed = new Set([...required, ...optional]);
  if (
    actual.length < required.length ||
    required.some((key) => !actual.includes(key)) ||
    actual.some((key) => !allowed.has(key))
  )
    throw new CollectivePlanningValidationError(
      `${label} has an invalid shape`,
    );
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
      throw new CollectivePlanningValidationError(
        `${label} must contain enumerable data properties`,
      );
  }
}

function assertPlainArray(
  value: unknown,
  label: string,
): asserts value is unknown[] {
  if (!Array.isArray(value))
    throw new CollectivePlanningValidationError(`${label} must be an array`);
  if (Object.getOwnPropertySymbols(value).length > 0)
    throw new CollectivePlanningValidationError(
      `${label} may not contain symbol keys`,
    );
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== value.length + 1 || !names.includes("length"))
    throw new CollectivePlanningValidationError(
      `${label} may not contain extra or sparse properties`,
    );
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
      throw new CollectivePlanningValidationError(
        `${label} must contain enumerable data`,
      );
  }
}

export function assertPlanningIdentifier(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    planningUtf8ByteLengthV1(value) > 256 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    throw new CollectivePlanningValidationError(
      `${label} must be a bounded identifier`,
    );
}

export function assertPlanningToken(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length > 128 ||
    !tokenPattern.test(value)
  )
    throw new CollectivePlanningValidationError(`${label} must be a token`);
}

export function assertPlanningDigest(
  value: unknown,
  label: string,
): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !digestPattern.test(value))
    throw new CollectivePlanningValidationError(
      `${label} must be a collective-planning digest`,
    );
}

export function assertPlanningSafeInteger(
  value: unknown,
  label: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum ||
    Object.is(value, -0)
  )
    throw new CollectivePlanningValidationError(
      `${label} must be a bounded safe integer`,
    );
}

export function assertPlanningTimestamp(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string")
    throw new CollectivePlanningValidationError(
      `${label} must be an RFC 3339 timestamp`,
    );
  const match = rfc3339Pattern.exec(value);
  if (!match)
    throw new CollectivePlanningValidationError(
      `${label} must be an RFC 3339 timestamp`,
    );
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === "Z" ? 0 : Number(match[10]);
  const offsetMinute = match[8] === "Z" ? 0 : Number(match[11]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days[month - 1] ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0) ||
    Number.isNaN(Date.parse(value))
  )
    throw new CollectivePlanningValidationError(
      `${label} must be an RFC 3339 timestamp`,
    );
}

function assertSchema(value: Record<string, unknown>, label: string): void {
  if (value.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(`${label} schema is invalid`);
}

function assertSortedStrings(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  kind: "identifier" | "token" | "digest" | "text",
): asserts value is readonly string[] {
  assertPlainArray(value, label);
  if (value.length < minimum || value.length > maximum)
    throw new CollectivePlanningValidationError(`${label} has invalid length`);
  let previous: string | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (kind === "identifier")
      assertPlanningIdentifier(item, `${label}[${index}]`);
    else if (kind === "token") assertPlanningToken(item, `${label}[${index}]`);
    else if (kind === "digest")
      assertPlanningDigest(item, `${label}[${index}]`);
    else if (
      typeof item !== "string" ||
      item.length === 0 ||
      planningUtf8ByteLengthV1(item) > 1_024 ||
      /[\u0000\u007f]/u.test(item)
    )
      throw new CollectivePlanningValidationError(
        `${label}[${index}] must be bounded text`,
      );
    const current = item as string;
    if (previous !== undefined && previous >= current)
      throw new CollectivePlanningValidationError(
        `${label} must be sorted and unique`,
      );
    previous = current;
  }
}

function cloneFrozen<T>(value: T): T {
  const canonical = canonicalizePlanningJsonV1(value as unknown as JsonValue);
  return deepFreezePlanning(JSON.parse(canonical) as unknown as T);
}

function withoutKey(
  value: Record<string, unknown>,
  key: string,
): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  for (const [entryKey, entryValue] of Object.entries(value))
    if (entryKey !== key) result[entryKey] = entryValue as JsonValue;
  return result;
}

function assertDigestMatch(
  domain:
    | "mission-intent"
    | "mission-observation"
    | "plan-fragment-proposal"
    | "plan-selection-policy"
    | "plan-fragment-decision"
    | "plan-fragment"
    | "plan-view"
    | "adaptive-role-binding"
    | "collective-planning-snapshot",
  value: Record<string, unknown>,
  digestKey: string,
): void {
  assertPlanningDigest(value[digestKey], digestKey);
  const expected = digestPlanningJsonV1(
    domain,
    withoutKey(value, digestKey),
    domain === "plan-view" ? PLAN_VIEW_JSON_LIMITS_V1 : undefined,
  );
  if (value[digestKey] !== expected)
    throw new CollectivePlanningValidationError(`${digestKey} mismatch`);
}

export function createPlanningLimitsV1(
  input: PlanningLimitsV1,
): PlanningLimitsV1 {
  return validatePlanningLimitsV1(input);
}

export function validatePlanningLimitsV1(value: unknown): PlanningLimitsV1 {
  assertPlanningExactKeys(
    value,
    [
      "schemaVersion",
      "maximumCandidateFragments",
      "maximumActiveFragments",
      "maximumFragmentsPerPeer",
      "maximumRevisionsPerSemanticSlot",
      "maximumDependencyDepth",
      "maximumDependencyFanout",
      "maximumCapabilityTerms",
      "maximumOutcomeTerms",
      "maximumProposalBytes",
      "maximumSnapshotBytes",
      "maximumTraceBytes",
      "maximumTotalPlanningBudgetUnits",
      "maximumFragmentBudgetUnits",
      "budgetShardPolicy",
      "maximumConcurrentProposals",
      "maximumActiveRoles",
      "proposalLogicalWindowMs",
      "observationLogicalWindowMs",
      "replanningLogicalWindowMs",
    ],
    "planningLimits",
  );
  assertSchema(value, "planningLimits");
  const bounded: ReadonlyArray<readonly [string, number]> = [
    ["maximumCandidateFragments", 65_536],
    ["maximumActiveFragments", 16_384],
    ["maximumFragmentsPerPeer", 16_384],
    ["maximumRevisionsPerSemanticSlot", 4_096],
    ["maximumDependencyDepth", 256],
    ["maximumDependencyFanout", 4_096],
    ["maximumCapabilityTerms", 1_024],
    ["maximumOutcomeTerms", 1_024],
    ["maximumProposalBytes", 262_144],
    ["maximumSnapshotBytes", 67_108_864],
    ["maximumTraceBytes", 268_435_456],
    ["maximumTotalPlanningBudgetUnits", Number.MAX_SAFE_INTEGER],
    ["maximumFragmentBudgetUnits", Number.MAX_SAFE_INTEGER],
    ["maximumConcurrentProposals", 16_384],
    ["maximumActiveRoles", 16_384],
    ["proposalLogicalWindowMs", Number.MAX_SAFE_INTEGER],
    ["observationLogicalWindowMs", Number.MAX_SAFE_INTEGER],
    ["replanningLogicalWindowMs", Number.MAX_SAFE_INTEGER],
  ];
  for (const [key, maximum] of bounded)
    assertPlanningSafeInteger(value[key], `planningLimits.${key}`, 1, maximum);
  if (value.budgetShardPolicy !== "equal_mandate_subjects")
    throw new CollectivePlanningValidationError(
      "planningLimits.budgetShardPolicy is invalid",
    );
  const maximumActiveFragments = value.maximumActiveFragments as number;
  const maximumCandidateFragments = value.maximumCandidateFragments as number;
  const maximumFragmentBudgetUnits = value.maximumFragmentBudgetUnits as number;
  const maximumTotalPlanningBudgetUnits =
    value.maximumTotalPlanningBudgetUnits as number;
  const maximumActiveRoles = value.maximumActiveRoles as number;
  if (maximumActiveFragments > maximumCandidateFragments)
    throw new CollectivePlanningValidationError(
      "active fragment limit exceeds candidate fragment limit",
    );
  if (maximumFragmentBudgetUnits > maximumTotalPlanningBudgetUnits)
    throw new CollectivePlanningValidationError(
      "fragment budget exceeds total planning budget",
    );
  if (maximumActiveRoles > maximumActiveFragments)
    throw new CollectivePlanningValidationError(
      "active role limit exceeds active fragment limit",
    );
  return cloneFrozen(value) as unknown as PlanningLimitsV1;
}

function validateObjective(value: unknown): MissionObjectiveBindingV1 {
  assertPlanningExactKeys(
    value,
    [
      "schemaVersion",
      "meshId",
      "objectiveId",
      "objectiveDocumentId",
      "objectiveRevision",
      "acceptedPolicyDigest",
    ],
    "objective",
  );
  assertSchema(value, "objective");
  assertPlanningIdentifier(value.meshId, "objective.meshId");
  assertPlanningIdentifier(value.objectiveId, "objective.objectiveId");
  assertPlanningIdentifier(
    value.objectiveDocumentId,
    "objective.objectiveDocumentId",
  );
  assertPlanningSafeInteger(
    value.objectiveRevision,
    "objective.objectiveRevision",
    1,
  );
  assertPlanningDigest(
    value.acceptedPolicyDigest,
    "objective.acceptedPolicyDigest",
  );
  return cloneFrozen(value) as unknown as MissionObjectiveBindingV1;
}

export function missionIntentDigestV1(
  intent: Omit<MissionIntentV1, "intentDigest">,
): PlanningDigestV1 {
  return digestPlanningJsonV1("mission-intent", intent as unknown as JsonValue);
}

export function createMissionIntentV1(
  input: Omit<MissionIntentV1, "intentDigest">,
): MissionIntentV1 {
  assertFactoryInputKeys(
    input,
    intentKeys.filter((key) => key !== "intentDigest"),
    [],
    "mission intent input",
  );
  return validateMissionIntentV1({
    ...input,
    intentDigest: missionIntentDigestV1(input),
  });
}

export function validateMissionIntentV1(value: unknown): MissionIntentV1 {
  assertPlanningExactKeys(value, intentKeys, "mission intent");
  assertSchema(value, "mission intent");
  assertPlanningIdentifier(value.missionIntentId, "missionIntentId");
  assertPlanningSafeInteger(value.revision, "revision", 1);
  if (value.revision === 1) {
    if (value.predecessorDigest !== null)
      throw new CollectivePlanningValidationError(
        "initial intent must not have a predecessor",
      );
  } else assertPlanningDigest(value.predecessorDigest, "predecessorDigest");
  assertPlanningIdentifier(value.tenantId, "tenantId");
  assertPlanningIdentifier(value.policyDomainId, "policyDomainId");
  validateObjective(value.objective);
  assertPlanningDigest(value.mandateDigest, "mandateDigest");
  assertSortedStrings(
    value.outcomeStatements,
    "outcomeStatements",
    1,
    1_024,
    "text",
  );
  assertSortedStrings(
    value.permittedResourceClasses,
    "permittedResourceClasses",
    1,
    1_024,
    "token",
  );
  assertSortedStrings(
    value.permittedCapabilityKeys,
    "permittedCapabilityKeys",
    1,
    1_024,
    "token",
  );
  const limits = validatePlanningLimitsV1(value.planningLimits);
  if (
    (value.outcomeStatements as unknown[]).length > limits.maximumOutcomeTerms
  )
    throw new CollectivePlanningValidationError(
      "outcome statements exceed planning limit",
    );
  if (
    (value.permittedCapabilityKeys as unknown[]).length >
    limits.maximumCapabilityTerms
  )
    throw new CollectivePlanningValidationError(
      "capability keys exceed planning limit",
    );
  assertPlanningDigest(value.selectionPolicyDigest, "selectionPolicyDigest");
  assertPlanningTimestamp(value.validFrom, "validFrom");
  assertPlanningTimestamp(value.validUntil, "validUntil");
  if (Date.parse(value.validFrom) >= Date.parse(value.validUntil))
    throw new CollectivePlanningValidationError(
      "mission intent validity interval is invalid",
    );
  assertDigestMatch("mission-intent", value, "intentDigest");
  return cloneFrozen(value) as unknown as MissionIntentV1;
}

export function assertMissionIntentRevisionV1(
  previousInput: unknown,
  nextInput: unknown,
): MissionIntentV1 {
  const previous = validateMissionIntentV1(previousInput);
  const next = validateMissionIntentV1(nextInput);
  if (
    next.missionIntentId !== previous.missionIntentId ||
    next.revision !== previous.revision + 1 ||
    next.predecessorDigest !== previous.intentDigest ||
    next.tenantId !== previous.tenantId ||
    next.policyDomainId !== previous.policyDomainId ||
    next.objective.meshId !== previous.objective.meshId ||
    next.objective.objectiveId !== previous.objective.objectiveId ||
    next.objective.objectiveDocumentId !==
      previous.objective.objectiveDocumentId ||
    next.mandateDigest !== previous.mandateDigest
  )
    throw new CollectivePlanningValidationError(
      "intent revision does not preserve its authority binding",
    );
  const previousResources = new Set(previous.permittedResourceClasses);
  const previousCapabilities = new Set(previous.permittedCapabilityKeys);
  if (
    next.permittedResourceClasses.some(
      (item) => !previousResources.has(item),
    ) ||
    next.permittedCapabilityKeys.some((item) => !previousCapabilities.has(item))
  )
    throw new CollectivePlanningValidationError(
      "intent revision widens its permitted scope",
    );
  const numericLimits = Object.keys(previous.planningLimits).filter(
    (key) => key !== "schemaVersion" && key !== "budgetShardPolicy",
  ) as Array<keyof PlanningLimitsV1>;
  for (const key of numericLimits)
    if (
      (next.planningLimits[key] as number) >
      (previous.planningLimits[key] as number)
    )
      throw new CollectivePlanningValidationError(
        `intent revision widens planning limit ${key}`,
      );
  if (
    next.objective.objectiveRevision < previous.objective.objectiveRevision ||
    Date.parse(next.validFrom) < Date.parse(previous.validFrom) ||
    Date.parse(next.validUntil) > Date.parse(previous.validUntil)
  )
    throw new CollectivePlanningValidationError(
      "intent revision widens its objective or validity interval",
    );
  return next;
}

function assertNoForbiddenObservationKeys(
  value: unknown,
  seen = new Set<object>(),
  normalizedPath = "",
): void {
  if (value === null || typeof value !== "object" || seen.has(value as object))
    return;
  seen.add(value as object);
  if (Array.isArray(value)) {
    for (const item of value)
      assertNoForbiddenObservationKeys(item, seen, normalizedPath);
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key
      .normalize("NFKC")
      .replace(/[^A-Za-z0-9]/gu, "")
      .toLowerCase();
    const nextPath = `${normalizedPath}${normalizedKey}`;
    if (
      forbiddenObservationKeyTerms.some(
        (term) => normalizedKey.includes(term) || nextPath.includes(term),
      )
    )
      throw new CollectivePlanningValidationError(
        `publicValue contains forbidden field ${key}`,
      );
    assertNoForbiddenObservationKeys(item, seen, nextPath);
  }
}

export function missionObservationDigestV1(
  observation: Omit<MissionObservationV1, "observationDigest">,
): PlanningDigestV1 {
  return digestPlanningJsonV1(
    "mission-observation",
    observation as unknown as JsonValue,
  );
}

export function createMissionObservationV1(
  input: Omit<MissionObservationV1, "observationDigest">,
): MissionObservationV1 {
  assertFactoryInputKeys(
    input,
    [
      "schemaVersion",
      "observationId",
      "missionIntentId",
      "intentRevision",
      "intentDigest",
      "observerPeerId",
      "observerInstanceId",
      "environmentCursor",
      "logicalTimeMs",
      "visibility",
      "observationKind",
      "publicValue",
      "contentReferenceDigest",
    ],
    [],
    "mission observation input",
  );
  return validateMissionObservationV1({
    ...input,
    observationDigest: missionObservationDigestV1(input),
  });
}

export function validateMissionObservationV1(
  value: unknown,
): MissionObservationV1 {
  assertPlanningExactKeys(
    value,
    [
      "schemaVersion",
      "observationId",
      "missionIntentId",
      "intentRevision",
      "intentDigest",
      "observerPeerId",
      "observerInstanceId",
      "environmentCursor",
      "logicalTimeMs",
      "visibility",
      "observationKind",
      "publicValue",
      "contentReferenceDigest",
      "observationDigest",
    ],
    "mission observation",
  );
  assertSchema(value, "mission observation");
  assertPlanningIdentifier(value.observationId, "observationId");
  assertPlanningIdentifier(value.missionIntentId, "missionIntentId");
  assertPlanningSafeInteger(value.intentRevision, "intentRevision", 1);
  assertPlanningDigest(value.intentDigest, "intentDigest");
  assertPlanningIdentifier(value.observerPeerId, "observerPeerId");
  assertPlanningIdentifier(value.observerInstanceId, "observerInstanceId");
  assertPlanningIdentifier(value.environmentCursor, "environmentCursor");
  assertPlanningSafeInteger(value.logicalTimeMs, "logicalTimeMs");
  if (!observationVisibilities.has(value.visibility as string))
    throw new CollectivePlanningValidationError("visibility is invalid");
  assertPlanningToken(value.observationKind, "observationKind");
  if ((value.publicValue === null) === (value.contentReferenceDigest === null))
    throw new CollectivePlanningValidationError(
      "observation must contain exactly one public value or content reference",
    );
  if (value.publicValue !== null) {
    canonicalizePlanningJsonV1(value.publicValue as JsonValue, {
      maximumBytes: 65_536,
      maximumDepth: 16,
      maximumNodes: 4_096,
      maximumKeysPerObject: 128,
      maximumItemsPerArray: 1_024,
    });
    assertNoForbiddenObservationKeys(value.publicValue);
  } else
    assertPlanningDigest(
      value.contentReferenceDigest,
      "contentReferenceDigest",
    );
  assertDigestMatch("mission-observation", value, "observationDigest");
  return cloneFrozen(value) as unknown as MissionObservationV1;
}

export interface PlanFragmentProposalIdentityV1 {
  readonly missionIntentId: string;
  readonly intentRevision: number;
  readonly proposerPeerId: string;
  readonly proposerInstanceId: string;
  readonly semanticSlotKey: string;
  readonly predecessorFragmentDigest: PlanningDigestV1 | null;
  readonly proposalRevision: number;
}

export function derivePlanFragmentProposalIdV1(
  identity: PlanFragmentProposalIdentityV1,
): string {
  assertPlanningExactKeys(
    identity,
    [
      "missionIntentId",
      "intentRevision",
      "proposerPeerId",
      "proposerInstanceId",
      "semanticSlotKey",
      "predecessorFragmentDigest",
      "proposalRevision",
    ],
    "proposal identity",
  );
  assertPlanningIdentifier(identity.missionIntentId, "missionIntentId");
  assertPlanningSafeInteger(identity.intentRevision, "intentRevision", 1);
  assertPlanningIdentifier(identity.proposerPeerId, "proposerPeerId");
  assertPlanningIdentifier(identity.proposerInstanceId, "proposerInstanceId");
  assertPlanningToken(identity.semanticSlotKey, "semanticSlotKey");
  if (identity.predecessorFragmentDigest !== null)
    assertPlanningDigest(
      identity.predecessorFragmentDigest,
      "predecessorFragmentDigest",
    );
  assertPlanningSafeInteger(identity.proposalRevision, "proposalRevision", 1);
  const digest = digestPlanningJsonV1(
    "proposal-identity",
    identity as unknown as JsonValue,
  );
  return `plan-proposal:${digest.slice("sha256:".length)}`;
}

function proposalIdentity(value: {
  readonly missionIntentId: string;
  readonly intentRevision: number;
  readonly proposerPeerId: string;
  readonly proposerInstanceId: string;
  readonly semanticSlotKey: string;
  readonly predecessorFragmentDigest: PlanningDigestV1 | null;
  readonly proposalRevision: number;
}): PlanFragmentProposalIdentityV1 {
  return {
    missionIntentId: value.missionIntentId,
    intentRevision: value.intentRevision,
    proposerPeerId: value.proposerPeerId,
    proposerInstanceId: value.proposerInstanceId,
    semanticSlotKey: value.semanticSlotKey,
    predecessorFragmentDigest: value.predecessorFragmentDigest,
    proposalRevision: value.proposalRevision,
  };
}

export function planFragmentProposalDigestV1(
  proposal: Omit<PlanFragmentProposalV1, "proposalDigest">,
): PlanningDigestV1 {
  return digestPlanningJsonV1(
    "plan-fragment-proposal",
    proposal as unknown as JsonValue,
  );
}

export function createPlanFragmentProposalV1(
  input: Omit<PlanFragmentProposalV1, "proposalDigest" | "proposalId"> & {
    readonly proposalId?: string;
  },
): PlanFragmentProposalV1 {
  assertFactoryInputKeys(
    input,
    proposalKeys.filter(
      (key) => key !== "proposalDigest" && key !== "proposalId",
    ),
    ["proposalId"],
    "plan fragment proposal input",
  );
  const proposalId =
    input.proposalId ?? derivePlanFragmentProposalIdV1(proposalIdentity(input));
  const withoutDigest = { ...input, proposalId };
  return validatePlanFragmentProposalV1({
    ...withoutDigest,
    proposalDigest: planFragmentProposalDigestV1(withoutDigest),
  });
}

function validateProposalFields(value: Record<string, unknown>): void {
  assertSchema(value, "plan fragment proposal");
  if (
    typeof value.proposalId !== "string" ||
    !proposalIdPattern.test(value.proposalId)
  )
    throw new CollectivePlanningValidationError("proposalId is invalid");
  assertPlanningSafeInteger(value.proposalRevision, "proposalRevision", 1);
  assertPlanningIdentifier(value.missionIntentId, "missionIntentId");
  assertPlanningSafeInteger(value.intentRevision, "intentRevision", 1);
  assertPlanningDigest(value.intentDigest, "intentDigest");
  assertPlanningIdentifier(value.proposerPeerId, "proposerPeerId");
  assertPlanningIdentifier(value.proposerInstanceId, "proposerInstanceId");
  assertPlanningToken(value.semanticSlotKey, "semanticSlotKey");
  if (value.predecessorFragmentDigest !== null)
    assertPlanningDigest(
      value.predecessorFragmentDigest,
      "predecessorFragmentDigest",
    );
  assertSortedStrings(
    value.parentFragmentDigests,
    "parentFragmentDigests",
    0,
    4_096,
    "digest",
  );
  assertSortedStrings(
    value.dependencyFragmentDigests,
    "dependencyFragmentDigests",
    0,
    4_096,
    "digest",
  );
  if (
    value.predecessorFragmentDigest !== null &&
    (
      [
        ...(value.parentFragmentDigests as string[]),
        ...(value.dependencyFragmentDigests as string[]),
      ] as string[]
    ).includes(value.predecessorFragmentDigest)
  )
    throw new CollectivePlanningValidationError(
      "predecessor must not also be a parent or dependency",
    );
  const parentSet = new Set(value.parentFragmentDigests as string[]);
  if (
    (value.dependencyFragmentDigests as string[]).some((digest) =>
      parentSet.has(digest),
    )
  )
    throw new CollectivePlanningValidationError(
      "parent and dependency fragment sets must be disjoint",
    );
  assertSortedStrings(
    value.outcomeStatements,
    "outcomeStatements",
    1,
    1_024,
    "text",
  );
  assertPlanningToken(value.roleKey, "roleKey");
  assertSortedStrings(
    value.requiredCapabilityKeys,
    "requiredCapabilityKeys",
    1,
    1_024,
    "token",
  );
  assertPlanningDigest(value.inputReferenceDigest, "inputReferenceDigest");
  assertSortedStrings(
    value.basisObservationDigests,
    "basisObservationDigests",
    1,
    4_096,
    "digest",
  );
  assertPlanningSafeInteger(
    value.requestedBudgetUnits,
    "requestedBudgetUnits",
    1,
  );
  assertPlanningTimestamp(value.workDeadline, "workDeadline");
  assertPlanningSafeInteger(value.proposedAtLogicalMs, "proposedAtLogicalMs");
  const expectedId = derivePlanFragmentProposalIdV1(
    proposalIdentity(value as unknown as PlanFragmentProposalV1),
  );
  if (value.proposalId !== expectedId)
    throw new CollectivePlanningValidationError("proposalId mismatch");
}

export function validatePlanFragmentProposalV1(
  value: unknown,
): PlanFragmentProposalV1 {
  assertPlanningExactKeys(value, proposalKeys, "plan fragment proposal");
  validateProposalFields(value);
  assertDigestMatch("plan-fragment-proposal", value, "proposalDigest");
  return cloneFrozen(value) as unknown as PlanFragmentProposalV1;
}

export function planSelectionPolicyDigestV1(
  policy: Omit<PlanSelectionPolicyV1, "policyDigest">,
): PlanningDigestV1 {
  return digestPlanningJsonV1(
    "plan-selection-policy",
    policy as unknown as JsonValue,
  );
}

export function createPlanSelectionPolicyV1(
  input: Omit<PlanSelectionPolicyV1, "policyDigest">,
): PlanSelectionPolicyV1 {
  assertFactoryInputKeys(
    input,
    [
      "schemaVersion",
      "selectionPolicyId",
      "revision",
      "scoringDimensions",
      "hardConstraintKeys",
      "acceptanceScoreThreshold",
      "challengeScoreThreshold",
      "tieBreakOrder",
    ],
    [],
    "plan selection policy input",
  );
  return validatePlanSelectionPolicyV1({
    ...input,
    policyDigest: planSelectionPolicyDigestV1(input),
  });
}

export function validatePlanSelectionPolicyV1(
  value: unknown,
): PlanSelectionPolicyV1 {
  assertPlanningExactKeys(
    value,
    [
      "schemaVersion",
      "selectionPolicyId",
      "revision",
      "scoringDimensions",
      "hardConstraintKeys",
      "acceptanceScoreThreshold",
      "challengeScoreThreshold",
      "tieBreakOrder",
      "policyDigest",
    ],
    "plan selection policy",
  );
  assertSchema(value, "plan selection policy");
  assertPlanningIdentifier(value.selectionPolicyId, "selectionPolicyId");
  assertPlanningSafeInteger(value.revision, "revision", 1);
  assertPlainArray(value.scoringDimensions, "scoringDimensions");
  if (value.scoringDimensions.length < 1 || value.scoringDimensions.length > 6)
    throw new CollectivePlanningValidationError(
      "scoringDimensions has invalid length",
    );
  let previousDimension: string | undefined;
  let totalWeight = 0;
  for (let index = 0; index < value.scoringDimensions.length; index += 1) {
    const item = value.scoringDimensions[index];
    assertPlanningExactKeys(
      item,
      ["schemaVersion", "dimension", "weight", "direction"],
      `scoringDimensions[${index}]`,
    );
    assertSchema(item, `scoringDimensions[${index}]`);
    if (!scoringDimensions.has(item.dimension as string))
      throw new CollectivePlanningValidationError(
        `scoringDimensions[${index}].dimension is invalid`,
      );
    assertPlanningSafeInteger(
      item.weight,
      `scoringDimensions[${index}].weight`,
      1,
      1_000_000,
    );
    if (item.direction !== "maximize" && item.direction !== "minimize")
      throw new CollectivePlanningValidationError(
        `scoringDimensions[${index}].direction is invalid`,
      );
    const dimension = item.dimension as string;
    if (previousDimension !== undefined && previousDimension >= dimension)
      throw new CollectivePlanningValidationError(
        "scoringDimensions must be sorted and unique",
      );
    previousDimension = dimension;
    totalWeight += item.weight;
    if (!Number.isSafeInteger(totalWeight))
      throw new CollectivePlanningValidationError(
        "scoring dimension weight total is unsafe",
      );
  }
  assertSortedStrings(
    value.hardConstraintKeys,
    "hardConstraintKeys",
    1,
    256,
    "token",
  );
  assertPlanningSafeInteger(
    value.acceptanceScoreThreshold,
    "acceptanceScoreThreshold",
    0,
    1_000_000,
  );
  assertPlanningSafeInteger(
    value.challengeScoreThreshold,
    "challengeScoreThreshold",
    0,
    1_000_000,
  );
  if (value.challengeScoreThreshold > value.acceptanceScoreThreshold)
    throw new CollectivePlanningValidationError(
      "challenge threshold exceeds acceptance threshold",
    );
  assertPlainArray(value.tieBreakOrder, "tieBreakOrder");
  if (value.tieBreakOrder.length !== tieBreakKeys.size)
    throw new CollectivePlanningValidationError(
      "tieBreakOrder must contain every tie-break key",
    );
  const seenTieBreaks = new Set<string>();
  for (let index = 0; index < value.tieBreakOrder.length; index += 1) {
    const item = value.tieBreakOrder[index];
    if (
      typeof item !== "string" ||
      !tieBreakKeys.has(item as PlanTieBreakKeyV1)
    )
      throw new CollectivePlanningValidationError(
        `tieBreakOrder[${index}] is invalid`,
      );
    if (seenTieBreaks.has(item))
      throw new CollectivePlanningValidationError(
        "tieBreakOrder must be unique",
      );
    seenTieBreaks.add(item);
  }
  if (
    value.tieBreakOrder[0] !== "score" ||
    value.tieBreakOrder[value.tieBreakOrder.length - 1] !== "proposal_digest"
  )
    throw new CollectivePlanningValidationError(
      "tieBreakOrder must begin with score and end with proposal_digest",
    );
  assertDigestMatch("plan-selection-policy", value, "policyDigest");
  return cloneFrozen(value) as unknown as PlanSelectionPolicyV1;
}

export function planFragmentDecisionDigestV1(
  decision: Omit<PlanFragmentDecisionV1, "decisionDigest">,
): PlanningDigestV1 {
  return digestPlanningJsonV1(
    "plan-fragment-decision",
    decision as unknown as JsonValue,
  );
}

export function createPlanFragmentDecisionV1(
  input: Omit<PlanFragmentDecisionV1, "decisionDigest">,
): PlanFragmentDecisionV1 {
  assertFactoryInputKeys(
    input,
    [
      "schemaVersion",
      "decisionId",
      "missionIntentId",
      "intentRevision",
      "intentDigest",
      "proposalId",
      "proposalDigest",
      "selectionPolicyDigest",
      "status",
      "reasonCodes",
      "inputCandidateDigests",
      "selectedSemanticSlotHeadDigest",
      "localPlanViewRevision",
      "decidedAtLogicalMs",
      "resultingStateDigest",
    ],
    [],
    "plan fragment decision input",
  );
  return validatePlanFragmentDecisionV1({
    ...input,
    decisionDigest: planFragmentDecisionDigestV1(input),
  });
}

export function validatePlanFragmentDecisionV1(
  value: unknown,
): PlanFragmentDecisionV1 {
  assertPlanningExactKeys(
    value,
    [
      "schemaVersion",
      "decisionId",
      "missionIntentId",
      "intentRevision",
      "intentDigest",
      "proposalId",
      "proposalDigest",
      "selectionPolicyDigest",
      "status",
      "reasonCodes",
      "inputCandidateDigests",
      "selectedSemanticSlotHeadDigest",
      "localPlanViewRevision",
      "decidedAtLogicalMs",
      "resultingStateDigest",
      "decisionDigest",
    ],
    "plan fragment decision",
  );
  assertSchema(value, "plan fragment decision");
  assertPlanningIdentifier(value.decisionId, "decisionId");
  assertPlanningIdentifier(value.missionIntentId, "missionIntentId");
  assertPlanningSafeInteger(value.intentRevision, "intentRevision", 1);
  assertPlanningDigest(value.intentDigest, "intentDigest");
  if (
    typeof value.proposalId !== "string" ||
    !proposalIdPattern.test(value.proposalId)
  )
    throw new CollectivePlanningValidationError("proposalId is invalid");
  assertPlanningDigest(value.proposalDigest, "proposalDigest");
  assertPlanningDigest(value.selectionPolicyDigest, "selectionPolicyDigest");
  if (
    value.status !== "accepted" &&
    value.status !== "challenged" &&
    value.status !== "rejected"
  )
    throw new CollectivePlanningValidationError("decision status is invalid");
  assertSortedStrings(value.reasonCodes, "reasonCodes", 1, 128, "token");
  assertSortedStrings(
    value.inputCandidateDigests,
    "inputCandidateDigests",
    1,
    65_536,
    "digest",
  );
  if (!(value.inputCandidateDigests as string[]).includes(value.proposalDigest))
    throw new CollectivePlanningValidationError(
      "input candidates do not contain the decided proposal",
    );
  if (value.selectedSemanticSlotHeadDigest !== null)
    assertPlanningDigest(
      value.selectedSemanticSlotHeadDigest,
      "selectedSemanticSlotHeadDigest",
    );
  if (
    value.selectedSemanticSlotHeadDigest !== null &&
    !(value.inputCandidateDigests as string[]).includes(
      value.selectedSemanticSlotHeadDigest,
    )
  )
    throw new CollectivePlanningValidationError(
      "selected semantic-slot head is not an input candidate",
    );
  if (
    value.status === "accepted" &&
    value.selectedSemanticSlotHeadDigest === null
  )
    throw new CollectivePlanningValidationError(
      "accepted decision must select a semantic-slot head",
    );
  if (
    value.status === "accepted" &&
    value.selectedSemanticSlotHeadDigest !== value.proposalDigest
  )
    throw new CollectivePlanningValidationError(
      "accepted semantic-slot head must be the accepted proposal digest",
    );
  assertPlanningSafeInteger(
    value.localPlanViewRevision,
    "localPlanViewRevision",
    1,
  );
  assertPlanningSafeInteger(value.decidedAtLogicalMs, "decidedAtLogicalMs");
  assertPlanningDigest(value.resultingStateDigest, "resultingStateDigest");
  assertDigestMatch("plan-fragment-decision", value, "decisionDigest");
  return cloneFrozen(value) as unknown as PlanFragmentDecisionV1;
}

export function derivePlanFragmentIdV1(
  proposalDigest: PlanningDigestV1,
): string {
  assertPlanningDigest(proposalDigest, "proposalDigest");
  return `plan-fragment:${proposalDigest.slice("sha256:".length)}`;
}

export function planFragmentDigestV1(
  fragment: Omit<PlanFragmentV1, "fragmentDigest">,
): PlanningDigestV1 {
  return digestPlanningJsonV1(
    "plan-fragment",
    fragment as unknown as JsonValue,
  );
}

export function createPlanFragmentV1(
  input: Omit<PlanFragmentV1, "fragmentDigest" | "fragmentId"> & {
    readonly fragmentId?: string;
  },
): PlanFragmentV1 {
  assertFactoryInputKeys(
    input,
    fragmentKeys.filter(
      (key) => key !== "fragmentDigest" && key !== "fragmentId",
    ),
    ["fragmentId"],
    "plan fragment input",
  );
  const fragmentId =
    input.fragmentId ?? derivePlanFragmentIdV1(input.proposalDigest);
  const withoutDigest = { ...input, fragmentId };
  return validatePlanFragmentV1({
    ...withoutDigest,
    fragmentDigest: planFragmentDigestV1(withoutDigest),
  });
}

export function validatePlanFragmentV1(value: unknown): PlanFragmentV1 {
  assertPlanningExactKeys(value, fragmentKeys, "plan fragment");
  assertSchema(value, "plan fragment");
  if (
    typeof value.fragmentId !== "string" ||
    !fragmentIdPattern.test(value.fragmentId)
  )
    throw new CollectivePlanningValidationError("fragmentId is invalid");
  assertPlanningSafeInteger(value.fragmentRevision, "fragmentRevision", 1);
  if (value.fragmentRevision === 1) {
    if (value.previousStateDigest !== null)
      throw new CollectivePlanningValidationError(
        "initial fragment state must not have a previous state digest",
      );
  } else assertPlanningDigest(value.previousStateDigest, "previousStateDigest");
  if (
    typeof value.proposalId !== "string" ||
    !proposalIdPattern.test(value.proposalId)
  )
    throw new CollectivePlanningValidationError("proposalId is invalid");
  assertPlanningSafeInteger(value.proposalRevision, "proposalRevision", 1);
  assertPlanningDigest(value.proposalDigest, "proposalDigest");
  assertPlanningDigest(value.decisionDigest, "decisionDigest");
  assertPlanningIdentifier(value.missionIntentId, "missionIntentId");
  assertPlanningSafeInteger(value.intentRevision, "intentRevision", 1);
  assertPlanningDigest(value.intentDigest, "intentDigest");
  assertPlanningIdentifier(value.proposerPeerId, "proposerPeerId");
  assertPlanningIdentifier(value.proposerInstanceId, "proposerInstanceId");
  assertPlanningToken(value.semanticSlotKey, "semanticSlotKey");
  if (value.predecessorFragmentDigest !== null)
    assertPlanningDigest(
      value.predecessorFragmentDigest,
      "predecessorFragmentDigest",
    );
  assertSortedStrings(
    value.parentFragmentDigests,
    "parentFragmentDigests",
    0,
    4_096,
    "digest",
  );
  assertSortedStrings(
    value.dependencyFragmentDigests,
    "dependencyFragmentDigests",
    0,
    4_096,
    "digest",
  );
  if (
    value.predecessorFragmentDigest !== null &&
    (
      [
        ...(value.parentFragmentDigests as string[]),
        ...(value.dependencyFragmentDigests as string[]),
      ] as string[]
    ).includes(value.predecessorFragmentDigest)
  )
    throw new CollectivePlanningValidationError(
      "predecessor must not also be a parent or dependency",
    );
  const parentSet = new Set(value.parentFragmentDigests as string[]);
  if (
    (value.dependencyFragmentDigests as string[]).some((digest) =>
      parentSet.has(digest),
    )
  )
    throw new CollectivePlanningValidationError(
      "parent and dependency fragment sets must be disjoint",
    );
  assertSortedStrings(
    value.outcomeStatements,
    "outcomeStatements",
    1,
    1_024,
    "text",
  );
  assertPlanningToken(value.roleKey, "roleKey");
  assertSortedStrings(
    value.requiredCapabilityKeys,
    "requiredCapabilityKeys",
    1,
    1_024,
    "token",
  );
  assertPlanningDigest(value.inputReferenceDigest, "inputReferenceDigest");
  assertSortedStrings(
    value.basisObservationDigests,
    "basisObservationDigests",
    1,
    4_096,
    "digest",
  );
  assertPlanningSafeInteger(
    value.requestedBudgetUnits,
    "requestedBudgetUnits",
    1,
  );
  assertPlanningTimestamp(value.workDeadline, "workDeadline");
  assertPlanningSafeInteger(value.proposedAtLogicalMs, "proposedAtLogicalMs");
  assertPlanningDigest(value.acceptancePolicyDigest, "acceptancePolicyDigest");
  assertPlanningSafeInteger(value.acceptedAtLogicalMs, "acceptedAtLogicalMs");
  if (value.acceptedAtLogicalMs < value.proposedAtLogicalMs)
    throw new CollectivePlanningValidationError(
      "fragment acceptance precedes its proposal",
    );
  assertPlanningSafeInteger(
    value.localPlanViewRevision,
    "localPlanViewRevision",
    1,
  );
  if (!fragmentStatuses.has(value.status as string))
    throw new CollectivePlanningValidationError("fragment status is invalid");
  if (value.fragmentId !== derivePlanFragmentIdV1(value.proposalDigest))
    throw new CollectivePlanningValidationError("fragmentId mismatch");
  const expectedProposalId = derivePlanFragmentProposalIdV1(
    proposalIdentity(value as unknown as PlanFragmentV1),
  );
  if (value.proposalId !== expectedProposalId)
    throw new CollectivePlanningValidationError("proposalId mismatch");
  const copiedProposal: Omit<PlanFragmentProposalV1, "proposalDigest"> = {
    schemaVersion: 1,
    proposalId: value.proposalId,
    proposalRevision: value.proposalRevision,
    missionIntentId: value.missionIntentId,
    intentRevision: value.intentRevision,
    intentDigest: value.intentDigest,
    proposerPeerId: value.proposerPeerId,
    proposerInstanceId: value.proposerInstanceId,
    semanticSlotKey: value.semanticSlotKey,
    predecessorFragmentDigest: value.predecessorFragmentDigest,
    parentFragmentDigests: value.parentFragmentDigests as PlanningDigestV1[],
    dependencyFragmentDigests:
      value.dependencyFragmentDigests as PlanningDigestV1[],
    outcomeStatements: value.outcomeStatements as string[],
    roleKey: value.roleKey,
    requiredCapabilityKeys: value.requiredCapabilityKeys as string[],
    inputReferenceDigest: value.inputReferenceDigest,
    basisObservationDigests:
      value.basisObservationDigests as PlanningDigestV1[],
    requestedBudgetUnits: value.requestedBudgetUnits,
    workDeadline: value.workDeadline,
    proposedAtLogicalMs: value.proposedAtLogicalMs,
  };
  if (value.proposalDigest !== planFragmentProposalDigestV1(copiedProposal))
    throw new CollectivePlanningValidationError(
      "fragment fields do not match proposalDigest",
    );
  assertDigestMatch("plan-fragment", value, "fragmentDigest");
  if (
    (value.parentFragmentDigests as string[]).includes(
      value.fragmentDigest as string,
    ) ||
    (value.dependencyFragmentDigests as string[]).includes(
      value.fragmentDigest as string,
    ) ||
    value.predecessorFragmentDigest === value.fragmentDigest
  )
    throw new CollectivePlanningValidationError(
      "fragment may not reference itself",
    );
  return cloneFrozen(value) as unknown as PlanFragmentV1;
}

export function adaptiveRoleBindingDigestV1(
  binding: Omit<AdaptiveRoleBindingV1, "roleBindingDigest">,
): PlanningDigestV1 {
  return digestPlanningJsonV1(
    "adaptive-role-binding",
    binding as unknown as JsonValue,
  );
}

export function createAdaptiveRoleBindingV1(
  input: Omit<AdaptiveRoleBindingV1, "roleBindingDigest">,
): AdaptiveRoleBindingV1 {
  assertFactoryInputKeys(
    input,
    [
      "schemaVersion",
      "roleBindingId",
      "missionIntentId",
      "intentRevision",
      "intentDigest",
      "planViewDigest",
      "fragmentDigest",
      "roleKey",
      "workContractId",
      "workContractDigest",
      "assignedPeerId",
      "assignedInstanceId",
      "assignmentAuthorityId",
      "assignmentEpoch",
      "authorityGeneration",
      "fencingToken",
      "leaseExpiresAtLogicalMs",
      "status",
      "terminalReasonCode",
    ],
    [],
    "adaptive role binding input",
  );
  return validateAdaptiveRoleBindingV1({
    ...input,
    roleBindingDigest: adaptiveRoleBindingDigestV1(input),
  });
}

export function validateAdaptiveRoleBindingV1(
  value: unknown,
): AdaptiveRoleBindingV1 {
  assertPlanningExactKeys(
    value,
    [
      "schemaVersion",
      "roleBindingId",
      "missionIntentId",
      "intentRevision",
      "intentDigest",
      "planViewDigest",
      "fragmentDigest",
      "roleKey",
      "workContractId",
      "workContractDigest",
      "assignedPeerId",
      "assignedInstanceId",
      "assignmentAuthorityId",
      "assignmentEpoch",
      "authorityGeneration",
      "fencingToken",
      "leaseExpiresAtLogicalMs",
      "status",
      "terminalReasonCode",
      "roleBindingDigest",
    ],
    "adaptive role binding",
  );
  assertSchema(value, "adaptive role binding");
  assertPlanningIdentifier(value.roleBindingId, "roleBindingId");
  assertPlanningIdentifier(value.missionIntentId, "missionIntentId");
  assertPlanningSafeInteger(value.intentRevision, "intentRevision", 1);
  assertPlanningDigest(value.intentDigest, "intentDigest");
  assertPlanningDigest(value.planViewDigest, "planViewDigest");
  assertPlanningDigest(value.fragmentDigest, "fragmentDigest");
  assertPlanningToken(value.roleKey, "roleKey");
  assertPlanningIdentifier(value.workContractId, "workContractId");
  assertPlanningDigest(value.workContractDigest, "workContractDigest");
  assertPlanningIdentifier(value.assignedPeerId, "assignedPeerId");
  assertPlanningIdentifier(value.assignedInstanceId, "assignedInstanceId");
  assertPlanningIdentifier(
    value.assignmentAuthorityId,
    "assignmentAuthorityId",
  );
  assertPlanningSafeInteger(value.assignmentEpoch, "assignmentEpoch", 1);
  assertPlanningSafeInteger(
    value.authorityGeneration,
    "authorityGeneration",
    1,
  );
  assertPlanningIdentifier(value.fencingToken, "fencingToken");
  assertPlanningSafeInteger(
    value.leaseExpiresAtLogicalMs,
    "leaseExpiresAtLogicalMs",
    1,
  );
  if (value.status !== "current" && value.status !== "terminal")
    throw new CollectivePlanningValidationError(
      "role binding status is invalid",
    );
  if (value.status === "current") {
    if (value.terminalReasonCode !== null)
      throw new CollectivePlanningValidationError(
        "current role binding cannot have a terminal reason",
      );
  } else assertPlanningToken(value.terminalReasonCode, "terminalReasonCode");
  assertDigestMatch("adaptive-role-binding", value, "roleBindingDigest");
  return cloneFrozen(value) as unknown as AdaptiveRoleBindingV1;
}

function validateSemanticSlotHead(value: unknown): PlanSemanticSlotHeadV1 {
  assertPlanningExactKeys(
    value,
    ["schemaVersion", "semanticSlotKey", "fragmentDigest"],
    "semantic-slot head",
  );
  assertSchema(value, "semantic-slot head");
  assertPlanningToken(value.semanticSlotKey, "semanticSlotKey");
  assertPlanningDigest(value.fragmentDigest, "fragmentDigest");
  return cloneFrozen(value) as unknown as PlanSemanticSlotHeadV1;
}

function validateBudgetShard(value: unknown): PlanningBudgetShardV1 {
  assertPlanningExactKeys(
    value,
    ["schemaVersion", "peerId", "budgetUnits"],
    "planning budget shard",
  );
  assertSchema(value, "planning budget shard");
  assertPlanningIdentifier(value.peerId, "peerId");
  assertPlanningSafeInteger(value.budgetUnits, "budgetUnits");
  return cloneFrozen(value) as unknown as PlanningBudgetShardV1;
}

function validateBudgetReservation(
  value: unknown,
): PlanningBudgetReservationV1 {
  assertPlanningExactKeys(
    value,
    [
      "schemaVersion",
      "reservationId",
      "peerId",
      "proposalDigest",
      "fragmentDigest",
      "units",
      "status",
    ],
    "planning budget reservation",
  );
  assertSchema(value, "planning budget reservation");
  assertPlanningIdentifier(value.reservationId, "reservationId");
  assertPlanningIdentifier(value.peerId, "peerId");
  assertPlanningDigest(value.proposalDigest, "proposalDigest");
  if (value.fragmentDigest !== null)
    assertPlanningDigest(value.fragmentDigest, "fragmentDigest");
  assertPlanningSafeInteger(value.units, "units", 1);
  if (
    value.status !== "reserved" &&
    value.status !== "committed" &&
    value.status !== "released"
  )
    throw new CollectivePlanningValidationError(
      "planning budget reservation status is invalid",
    );
  if (value.status === "committed" && value.fragmentDigest === null)
    throw new CollectivePlanningValidationError(
      "committed planning reservation must name a fragment",
    );
  return cloneFrozen(value) as unknown as PlanningBudgetReservationV1;
}

function validateWorkMapping(value: unknown): FragmentWorkMappingV1 {
  assertPlanningExactKeys(
    value,
    [
      "schemaVersion",
      "fragmentDigest",
      "meshId",
      "objectiveId",
      "workItemId",
      "workItemRevision",
    ],
    "fragment Work mapping",
  );
  assertSchema(value, "fragment Work mapping");
  assertPlanningDigest(value.fragmentDigest, "fragmentDigest");
  assertPlanningIdentifier(value.meshId, "meshId");
  assertPlanningIdentifier(value.objectiveId, "objectiveId");
  assertPlanningIdentifier(value.workItemId, "workItemId");
  assertPlanningSafeInteger(value.workItemRevision, "workItemRevision", 1);
  return cloneFrozen(value) as unknown as FragmentWorkMappingV1;
}

function assertSortedRecords<T>(
  value: unknown,
  label: string,
  maximum: number,
  validator: (item: unknown) => T,
  keyOf: (item: T) => string,
): readonly T[] {
  assertPlainArray(value, label);
  if (value.length > maximum)
    throw new CollectivePlanningValidationError(`${label} has invalid length`);
  const result: T[] = [];
  let previous: string | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const item = validator(value[index]);
    const key = keyOf(item);
    if (previous !== undefined && previous >= key)
      throw new CollectivePlanningValidationError(
        `${label} must be sorted and unique`,
      );
    previous = key;
    result.push(item);
  }
  return result;
}

function assertAcyclicFragments(
  fragments: readonly PlanFragmentV1[],
  maximumDepth: number,
  maximumFanout: number,
): void {
  const records = new Map<string, PlanFragmentV1>(
    fragments.map((fragment) => [fragment.fragmentDigest, fragment]),
  );
  const visiting = new Set<string>();
  const visitedDepth = new Map<string, number>();
  const walk = (digest: string): number => {
    const memoized = visitedDepth.get(digest);
    if (memoized !== undefined) return memoized;
    if (visiting.has(digest))
      throw new CollectivePlanningValidationError(
        "fragment graph contains a cycle",
      );
    const fragment = records.get(digest);
    if (!fragment) return 0;
    visiting.add(digest);
    const edges = new Set<string>([
      ...fragment.parentFragmentDigests,
      ...fragment.dependencyFragmentDigests,
      ...(fragment.predecessorFragmentDigest === null
        ? []
        : [fragment.predecessorFragmentDigest]),
    ]);
    if (edges.size > maximumFanout)
      throw new CollectivePlanningValidationError(
        "fragment dependency fanout exceeds its limit",
      );
    let depth = 1;
    for (const edge of edges) depth = Math.max(depth, 1 + walk(edge));
    visiting.delete(digest);
    if (depth > maximumDepth)
      throw new CollectivePlanningValidationError(
        "fragment dependency depth exceeds its limit",
      );
    visitedDepth.set(digest, depth);
    return depth;
  };
  for (const digest of records.keys()) walk(digest);
}

function validatePlanViewRelationships(
  value: Record<string, unknown>,
  limits?: PlanningLimitsV1,
): void {
  const maximumFragments = limits
    ? Math.min(
        262_144,
        limits.maximumCandidateFragments *
          limits.maximumRevisionsPerSemanticSlot,
      )
    : 65_536;
  const fragments = assertSortedRecords(
    value.fragments,
    "fragments",
    maximumFragments,
    validatePlanFragmentV1,
    (item) =>
      `${item.fragmentId}\u0000${String(item.fragmentRevision).padStart(16, "0")}`,
  );
  const fragmentByDigest = new Map<string, PlanFragmentV1>(
    fragments.map((fragment) => [fragment.fragmentDigest, fragment]),
  );
  const historiesById = new Map<string, PlanFragmentV1[]>();
  for (const fragment of fragments) {
    const history = historiesById.get(fragment.fragmentId) ?? [];
    history.push(fragment);
    historiesById.set(fragment.fragmentId, history);
  }
  const validTransitions: Readonly<Record<string, ReadonlySet<string>>> = {
    candidate: new Set(["active", "superseded", "cancelled", "failed"]),
    active: new Set(["offered", "superseded", "cancelled", "failed"]),
    offered: new Set(["assigned", "superseded", "cancelled", "failed"]),
    assigned: new Set(["executing", "superseded", "cancelled", "failed"]),
    executing: new Set(["superseded", "cancelled", "completed", "failed"]),
    superseded: new Set(),
    cancelled: new Set(),
    completed: new Set(),
    failed: new Set(),
  };
  const latestFragments: PlanFragmentV1[] = [];
  for (const history of historiesById.values()) {
    if (limits && history.length > limits.maximumRevisionsPerSemanticSlot)
      throw new CollectivePlanningValidationError(
        "fragment state history exceeds its revision limit",
      );
    for (let index = 0; index < history.length; index += 1) {
      const current = history[index];
      const previous = history[index - 1];
      if (index === 0) {
        if (
          current.fragmentRevision !== 1 ||
          current.previousStateDigest !== null
        )
          throw new CollectivePlanningValidationError(
            "fragment state history must begin at revision one",
          );
      } else if (
        current.fragmentRevision !== previous.fragmentRevision + 1 ||
        current.previousStateDigest !== previous.fragmentDigest ||
        current.proposalId !== previous.proposalId ||
        current.proposalDigest !== previous.proposalDigest ||
        current.decisionDigest !== previous.decisionDigest ||
        current.missionIntentId !== previous.missionIntentId ||
        current.intentRevision !== previous.intentRevision ||
        current.intentDigest !== previous.intentDigest ||
        current.acceptancePolicyDigest !== previous.acceptancePolicyDigest ||
        current.acceptedAtLogicalMs !== previous.acceptedAtLogicalMs ||
        current.localPlanViewRevision !== previous.localPlanViewRevision ||
        !validTransitions[previous.status].has(current.status)
      )
        throw new CollectivePlanningValidationError(
          "fragment state history has a gap, binding change or invalid transition",
        );
    }
    latestFragments.push(history[history.length - 1]);
  }
  const latestById = new Map(
    latestFragments.map((fragment) => [fragment.fragmentId, fragment]),
  );
  for (const fragment of fragments) {
    if (
      fragment.missionIntentId !== value.missionIntentId ||
      fragment.intentRevision !== value.intentRevision ||
      fragment.intentDigest !== value.intentDigest
    )
      throw new CollectivePlanningValidationError(
        "fragment intent binding differs from plan view",
      );
    if (fragment.predecessorFragmentDigest !== null) {
      const predecessor = fragmentByDigest.get(
        fragment.predecessorFragmentDigest,
      );
      if (
        !predecessor ||
        predecessor.semanticSlotKey !== fragment.semanticSlotKey ||
        predecessor.fragmentId === fragment.fragmentId
      )
        throw new CollectivePlanningValidationError(
          "semantic fragment predecessor relationship is invalid",
        );
    }
    if (
      fragment.parentFragmentDigests.some(
        (digest) => !fragmentByDigest.has(digest),
      )
    )
      throw new CollectivePlanningValidationError(
        "fragment parent references an unknown local fragment",
      );
    if (
      limits &&
      (fragment.dependencyFragmentDigests.length >
        limits.maximumDependencyFanout ||
        fragment.parentFragmentDigests.length >
          limits.maximumDependencyFanout ||
        fragment.outcomeStatements.length > limits.maximumOutcomeTerms ||
        fragment.requiredCapabilityKeys.length >
          limits.maximumCapabilityTerms ||
        fragment.requestedBudgetUnits > limits.maximumFragmentBudgetUnits)
    )
      throw new CollectivePlanningValidationError(
        "fragment exceeds mission planning limits",
      );
  }

  const heads = assertSortedRecords(
    value.selectedHeads,
    "selectedHeads",
    limits?.maximumActiveFragments ?? 16_384,
    validateSemanticSlotHead,
    (item) => item.semanticSlotKey,
  );
  const selectedDigests = new Set<string>();
  for (const head of heads) {
    const fragment = fragmentByDigest.get(head.fragmentDigest);
    if (
      !fragment ||
      latestById.get(fragment.fragmentId)?.fragmentDigest !==
        fragment.fragmentDigest ||
      fragment.semanticSlotKey !== head.semanticSlotKey ||
      !activeFragmentStatuses.has(fragment.status)
    )
      throw new CollectivePlanningValidationError(
        "selected semantic-slot head is not a matching active fragment",
      );
    if (selectedDigests.has(head.fragmentDigest))
      throw new CollectivePlanningValidationError(
        "one fragment cannot head multiple semantic slots",
      );
    selectedDigests.add(head.fragmentDigest);
  }
  const activeFragments = latestFragments.filter((fragment) =>
    activeFragmentStatuses.has(fragment.status),
  );
  if (
    activeFragments.some(
      (fragment) => !selectedDigests.has(fragment.fragmentDigest),
    )
  )
    throw new CollectivePlanningValidationError(
      "every active fragment must be the selected head of its semantic slot",
    );
  if (limits && activeFragments.length > limits.maximumActiveFragments)
    throw new CollectivePlanningValidationError(
      "active fragment count exceeds mission limit",
    );

  assertSortedStrings(
    value.causalFrontierDigests,
    "causalFrontierDigests",
    0,
    maximumFragments,
    "digest",
  );
  const referencedFragmentIds = new Set<string>();
  for (const fragment of latestFragments)
    for (const digest of [
      ...fragment.parentFragmentDigests,
      ...fragment.dependencyFragmentDigests,
      ...(fragment.predecessorFragmentDigest === null
        ? []
        : [fragment.predecessorFragmentDigest]),
    ]) {
      const referenced = fragmentByDigest.get(digest);
      if (referenced && referenced.fragmentId !== fragment.fragmentId)
        referencedFragmentIds.add(referenced.fragmentId);
    }
  const expectedFrontier = latestFragments
    .filter((fragment) => !referencedFragmentIds.has(fragment.fragmentId))
    .map((fragment) => fragment.fragmentDigest)
    .sort();
  const declaredFrontier = value.causalFrontierDigests as string[];
  if (
    declaredFrontier.length !== expectedFrontier.length ||
    declaredFrontier.some((digest, index) => digest !== expectedFrontier[index])
  )
    throw new CollectivePlanningValidationError(
      "causal frontier does not match the latest fragment graph",
    );
  assertSortedStrings(
    value.unresolvedDependencyDigests,
    "unresolvedDependencyDigests",
    0,
    maximumFragments,
    "digest",
  );
  const actualUnresolved = new Set<string>();
  for (const fragment of activeFragments)
    for (const dependency of fragment.dependencyFragmentDigests) {
      const dependencyRecord = fragmentByDigest.get(dependency);
      const dependencyLatest = dependencyRecord
        ? latestById.get(dependencyRecord.fragmentId)
        : undefined;
      if (!dependencyLatest || dependencyLatest.status !== "completed")
        actualUnresolved.add(dependency);
    }
  const declaredUnresolved = value.unresolvedDependencyDigests as string[];
  if (
    declaredUnresolved.length !== actualUnresolved.size ||
    declaredUnresolved.some((digest) => !actualUnresolved.has(digest))
  )
    throw new CollectivePlanningValidationError(
      "unresolved dependency set does not match the active graph",
    );

  const shards = assertSortedRecords(
    value.budgetShards,
    "budgetShards",
    65_536,
    validateBudgetShard,
    (item) => item.peerId,
  );
  const shardByPeer = new Map(shards.map((shard) => [shard.peerId, shard]));
  const reservations = assertSortedRecords(
    value.budgetReservations,
    "budgetReservations",
    maximumFragments,
    validateBudgetReservation,
    (item) => item.reservationId,
  );
  const usedByPeer = new Map<string, number>();
  const reservationByProposal = new Map<string, PlanningBudgetReservationV1>();
  for (const reservation of reservations) {
    if (!shardByPeer.has(reservation.peerId))
      throw new CollectivePlanningValidationError(
        "planning reservation references an unknown budget shard",
      );
    if (
      !(value.proposals as PlanFragmentProposalV1[]).some(
        (proposal) => proposal.proposalDigest === reservation.proposalDigest,
      )
    )
      throw new CollectivePlanningValidationError(
        "planning reservation references an unknown proposal",
      );
    if (
      reservation.fragmentDigest !== null &&
      !fragmentByDigest.has(reservation.fragmentDigest)
    )
      throw new CollectivePlanningValidationError(
        "planning reservation references an unknown fragment",
      );
    if (reservation.fragmentDigest !== null) {
      const fragment = fragmentByDigest.get(reservation.fragmentDigest);
      if (
        !fragment ||
        fragment.proposalDigest !== reservation.proposalDigest ||
        reservation.units !== fragment.requestedBudgetUnits
      )
        throw new CollectivePlanningValidationError(
          "planning reservation differs from its fragment budget request",
        );
    }
    if (reservationByProposal.has(reservation.proposalDigest))
      throw new CollectivePlanningValidationError(
        "proposal has more than one planning reservation",
      );
    reservationByProposal.set(reservation.proposalDigest, reservation);
    if (reservation.status !== "released") {
      const used =
        (usedByPeer.get(reservation.peerId) ?? 0) + reservation.units;
      if (!Number.isSafeInteger(used))
        throw new CollectivePlanningValidationError(
          "planning reservation total is unsafe",
        );
      usedByPeer.set(reservation.peerId, used);
    }
  }
  for (const [peerId, used] of usedByPeer)
    if (used > (shardByPeer.get(peerId)?.budgetUnits ?? 0))
      throw new CollectivePlanningValidationError(
        "planning reservation exceeds its peer budget shard",
      );
  const totalShards = shards.reduce(
    (total, shard) => total + shard.budgetUnits,
    0,
  );
  if (!Number.isSafeInteger(totalShards))
    throw new CollectivePlanningValidationError("budget shard total is unsafe");
  if (limits && totalShards > limits.maximumTotalPlanningBudgetUnits)
    throw new CollectivePlanningValidationError(
      "budget shards exceed total planning budget",
    );
  for (const fragment of latestFragments) {
    const reservation = reservationByProposal.get(fragment.proposalDigest);
    if (
      !reservation ||
      reservation.fragmentDigest !== fragment.fragmentDigest ||
      reservation.units !== fragment.requestedBudgetUnits
    )
      throw new CollectivePlanningValidationError(
        "latest fragment lacks its exact planning reservation",
      );
    if (fragment.status === "candidate" && reservation.status !== "reserved")
      throw new CollectivePlanningValidationError(
        "candidate fragment requires a reserved planning budget",
      );
    if (
      (fragment.status === "active" ||
        fragment.status === "offered" ||
        fragment.status === "assigned" ||
        fragment.status === "executing" ||
        fragment.status === "completed" ||
        fragment.status === "failed") &&
      reservation.status !== "committed"
    )
      throw new CollectivePlanningValidationError(
        "accepted, executing or usage-terminal fragment requires committed budget",
      );
    if (
      (fragment.status === "cancelled" || fragment.status === "superseded") &&
      reservation.status === "reserved"
    )
      throw new CollectivePlanningValidationError(
        "cancelled or superseded fragment cannot retain a reserved budget",
      );
  }

  const mappings = assertSortedRecords(
    value.workMappings,
    "workMappings",
    maximumFragments,
    validateWorkMapping,
    (item) => item.fragmentDigest,
  );
  const mappedWorkIdentities = new Set<string>();
  for (const mapping of mappings) {
    const fragment = fragmentByDigest.get(mapping.fragmentDigest);
    if (
      !fragment ||
      latestById.get(fragment.fragmentId)?.fragmentDigest !==
        fragment.fragmentDigest ||
      (fragment.status !== "offered" &&
        fragment.status !== "assigned" &&
        fragment.status !== "executing") ||
      fragment.dependencyFragmentDigests.some((digest) => {
        const dependency = fragmentByDigest.get(digest);
        return (
          !dependency ||
          latestById.get(dependency.fragmentId)?.status !== "completed"
        );
      })
    )
      throw new CollectivePlanningValidationError(
        "Work mapping must reference a resolved projected non-terminal fragment",
      );
    const workIdentity = `${mapping.meshId}\u0000${mapping.objectiveId}\u0000${mapping.workItemId}\u0000${mapping.workItemRevision}`;
    if (mappedWorkIdentities.has(workIdentity))
      throw new CollectivePlanningValidationError(
        "one Work revision cannot map to multiple fragments",
      );
    mappedWorkIdentities.add(workIdentity);
  }
  const mappingFragmentDigests = new Set(
    mappings.map((mapping) => mapping.fragmentDigest),
  );
  for (const fragment of latestFragments)
    if (
      (fragment.status === "offered" ||
        fragment.status === "assigned" ||
        fragment.status === "executing") &&
      !mappingFragmentDigests.has(fragment.fragmentDigest)
    )
      throw new CollectivePlanningValidationError(
        "projected fragment has no Work mapping",
      );
  const roles = assertSortedRecords(
    value.activeRoleBindings,
    "activeRoleBindings",
    limits?.maximumActiveRoles ?? 16_384,
    validateAdaptiveRoleBindingV1,
    (item) => item.roleBindingId,
  );
  const roleFragmentDigests = new Set<string>();
  for (const role of roles) {
    const fragment = fragmentByDigest.get(role.fragmentDigest);
    if (
      role.status !== "current" ||
      !fragment ||
      latestById.get(fragment.fragmentId)?.fragmentDigest !==
        fragment.fragmentDigest ||
      (fragment.status !== "assigned" && fragment.status !== "executing") ||
      role.roleKey !== fragment.roleKey ||
      role.missionIntentId !== value.missionIntentId ||
      role.intentRevision !== value.intentRevision ||
      role.intentDigest !== value.intentDigest ||
      role.leaseExpiresAtLogicalMs <=
        (value.logicalTimeHighWaterMs as number) ||
      !mappings.some(
        (mapping) => mapping.fragmentDigest === role.fragmentDigest,
      )
    )
      throw new CollectivePlanningValidationError(
        "active role binding is not current for its fragment and intent",
      );
    if (roleFragmentDigests.has(role.fragmentDigest))
      throw new CollectivePlanningValidationError(
        "fragment has more than one active role binding",
      );
    roleFragmentDigests.add(role.fragmentDigest);
  }
  for (const fragment of latestFragments)
    if (
      (fragment.status === "assigned" || fragment.status === "executing") &&
      !roleFragmentDigests.has(fragment.fragmentDigest)
    )
      throw new CollectivePlanningValidationError(
        "assigned fragment has no current adaptive role binding",
      );
  assertAcyclicFragments(
    fragments,
    limits?.maximumDependencyDepth ?? 256,
    limits?.maximumDependencyFanout ?? 4_096,
  );
}

export function planViewDigestV1(
  view: Omit<PlanViewV1, "stateDigest">,
): PlanningDigestV1 {
  return digestPlanningJsonV1(
    "plan-view",
    view as unknown as JsonValue,
    PLAN_VIEW_JSON_LIMITS_V1,
  );
}

export function createPlanViewV1(
  input: Omit<PlanViewV1, "stateDigest">,
): PlanViewV1 {
  assertFactoryInputKeys(
    input,
    [
      "schemaVersion",
      "planViewId",
      "tenantId",
      "policyDomainId",
      "peerId",
      "peerInstanceId",
      "missionIntentId",
      "intentRevision",
      "intentDigest",
      "selectionPolicyDigest",
      "revision",
      "proposals",
      "decisions",
      "fragments",
      "selectedHeads",
      "causalFrontierDigests",
      "unresolvedDependencyDigests",
      "budgetShards",
      "budgetReservations",
      "workMappings",
      "activeRoleBindings",
      "logicalTimeHighWaterMs",
    ],
    [],
    "plan view input",
  );
  return validatePlanViewV1({
    ...input,
    stateDigest: planViewDigestV1(input),
  });
}

export function validatePlanViewV1(value: unknown): PlanViewV1 {
  assertPlanningExactKeys(
    value,
    [
      "schemaVersion",
      "planViewId",
      "tenantId",
      "policyDomainId",
      "peerId",
      "peerInstanceId",
      "missionIntentId",
      "intentRevision",
      "intentDigest",
      "selectionPolicyDigest",
      "revision",
      "proposals",
      "decisions",
      "fragments",
      "selectedHeads",
      "causalFrontierDigests",
      "unresolvedDependencyDigests",
      "budgetShards",
      "budgetReservations",
      "workMappings",
      "activeRoleBindings",
      "logicalTimeHighWaterMs",
      "stateDigest",
    ],
    "plan view",
  );
  assertSchema(value, "plan view");
  assertPlanningIdentifier(value.planViewId, "planViewId");
  assertPlanningIdentifier(value.tenantId, "tenantId");
  assertPlanningIdentifier(value.policyDomainId, "policyDomainId");
  assertPlanningIdentifier(value.peerId, "peerId");
  assertPlanningIdentifier(value.peerInstanceId, "peerInstanceId");
  assertPlanningIdentifier(value.missionIntentId, "missionIntentId");
  assertPlanningSafeInteger(value.intentRevision, "intentRevision", 1);
  assertPlanningDigest(value.intentDigest, "intentDigest");
  assertPlanningDigest(value.selectionPolicyDigest, "selectionPolicyDigest");
  assertPlanningSafeInteger(value.revision, "revision");
  const proposals = assertSortedRecords(
    value.proposals,
    "proposals",
    65_536,
    validatePlanFragmentProposalV1,
    (item) =>
      `${item.proposalId}\u0000${String(item.proposalRevision).padStart(16, "0")}`,
  );
  const proposalByDigest = new Map(
    proposals.map((proposal) => [proposal.proposalDigest, proposal]),
  );
  for (const proposal of proposals)
    if (
      proposal.missionIntentId !== value.missionIntentId ||
      proposal.intentRevision !== value.intentRevision ||
      proposal.intentDigest !== value.intentDigest
    )
      throw new CollectivePlanningValidationError(
        "proposal intent binding differs from plan view",
      );
  const decisions = assertSortedRecords(
    value.decisions,
    "decisions",
    65_536,
    validatePlanFragmentDecisionV1,
    (item) => item.decisionId,
  );
  const decisionByDigest = new Map(
    decisions.map((decision) => [decision.decisionDigest, decision]),
  );
  for (const decision of decisions) {
    const proposal = proposalByDigest.get(decision.proposalDigest);
    if (
      !proposal ||
      proposal.proposalId !== decision.proposalId ||
      decision.missionIntentId !== value.missionIntentId ||
      decision.intentRevision !== value.intentRevision ||
      decision.intentDigest !== value.intentDigest ||
      decision.selectionPolicyDigest !== value.selectionPolicyDigest ||
      decision.localPlanViewRevision > (value.revision as number) ||
      decision.decidedAtLogicalMs < proposal.proposedAtLogicalMs
    )
      throw new CollectivePlanningValidationError(
        "decision binding differs from its proposal, policy or plan view",
      );
    for (const candidateDigest of decision.inputCandidateDigests)
      if (!proposalByDigest.has(candidateDigest))
        throw new CollectivePlanningValidationError(
          "decision input candidate is absent from proposal history",
        );
  }
  assertPlanningSafeInteger(
    value.logicalTimeHighWaterMs,
    "logicalTimeHighWaterMs",
  );
  validatePlanViewRelationships(value);
  for (const fragment of value.fragments as PlanFragmentV1[]) {
    const proposal = proposalByDigest.get(fragment.proposalDigest);
    const decision = decisionByDigest.get(fragment.decisionDigest);
    if (
      !proposal ||
      proposal.proposalId !== fragment.proposalId ||
      !decision ||
      decision.status !== "accepted" ||
      decision.proposalId !== fragment.proposalId ||
      decision.proposalDigest !== fragment.proposalDigest ||
      decision.selectedSemanticSlotHeadDigest !== fragment.proposalDigest ||
      decision.selectionPolicyDigest !== fragment.acceptancePolicyDigest ||
      decision.localPlanViewRevision !== fragment.localPlanViewRevision ||
      fragment.acceptedAtLogicalMs < decision.decidedAtLogicalMs
    )
      throw new CollectivePlanningValidationError(
        "fragment is not backed by its exact accepted proposal and decision",
      );
    if (
      fragment.acceptedAtLogicalMs > (value.logicalTimeHighWaterMs as number) ||
      fragment.proposedAtLogicalMs > (value.logicalTimeHighWaterMs as number)
    )
      throw new CollectivePlanningValidationError(
        "fragment logical time exceeds the plan-view high-water",
      );
  }
  for (const decision of decisions)
    if (decision.decidedAtLogicalMs > (value.logicalTimeHighWaterMs as number))
      throw new CollectivePlanningValidationError(
        "decision logical time exceeds the plan-view high-water",
      );
  assertDigestMatch("plan-view", value, "stateDigest");
  return cloneFrozen(value) as unknown as PlanViewV1;
}

function validateDomainHighWater(value: unknown): PlanningDomainHighWaterV1 {
  assertPlanningExactKeys(
    value,
    ["schemaVersion", "domain", "recordId", "revision", "digest"],
    "planning domain high-water",
  );
  assertSchema(value, "planning domain high-water");
  if (
    value.domain !== "observation" &&
    value.domain !== "proposal" &&
    value.domain !== "decision" &&
    value.domain !== "fragment"
  )
    throw new CollectivePlanningValidationError(
      "planning domain high-water domain is invalid",
    );
  assertPlanningIdentifier(value.recordId, "recordId");
  assertPlanningSafeInteger(value.revision, "revision", 1);
  assertPlanningDigest(value.digest, "digest");
  return cloneFrozen(value) as unknown as PlanningDomainHighWaterV1;
}

export function collectivePlanningSnapshotDigestV1(
  snapshot: Omit<CollectivePlanningSnapshotV1, "snapshotDigest">,
): PlanningDigestV1 {
  return digestPlanningJsonV1(
    "collective-planning-snapshot",
    snapshot as unknown as JsonValue,
    {
      maximumBytes: snapshot.missionIntent.planningLimits.maximumSnapshotBytes,
      maximumDepth: 32,
      maximumNodes: 2_000_000,
      maximumKeysPerObject: 256,
      maximumItemsPerArray: Math.max(
        4_096,
        snapshot.missionIntent.planningLimits.maximumCandidateFragments * 4,
      ),
    },
  );
}

export function createCollectivePlanningSnapshotV1(
  input: Omit<CollectivePlanningSnapshotV1, "snapshotDigest">,
): CollectivePlanningSnapshotV1 {
  assertFactoryInputKeys(
    input,
    [
      "format",
      "formatVersion",
      "schemaVersion",
      "snapshotId",
      "tenantId",
      "policyDomainId",
      "peerId",
      "peerInstanceId",
      "missionIntent",
      "selectionPolicy",
      "planView",
      "domainHighWaters",
    ],
    [],
    "collective planning snapshot input",
  );
  return validateCollectivePlanningSnapshotV1({
    ...input,
    snapshotDigest: collectivePlanningSnapshotDigestV1(input),
  });
}

export function validateCollectivePlanningSnapshotV1(
  value: unknown,
): CollectivePlanningSnapshotV1 {
  assertPlanningExactKeys(
    value,
    [
      "format",
      "formatVersion",
      "schemaVersion",
      "snapshotId",
      "tenantId",
      "policyDomainId",
      "peerId",
      "peerInstanceId",
      "missionIntent",
      "selectionPolicy",
      "planView",
      "domainHighWaters",
      "snapshotDigest",
    ],
    "collective planning snapshot",
  );
  if (
    value.format !== "agentplat.collective-planning.snapshot" ||
    value.formatVersion !== 1
  )
    throw new CollectivePlanningValidationError("snapshot format is invalid");
  assertSchema(value, "collective planning snapshot");
  assertPlanningIdentifier(value.snapshotId, "snapshotId");
  assertPlanningIdentifier(value.tenantId, "tenantId");
  assertPlanningIdentifier(value.policyDomainId, "policyDomainId");
  assertPlanningIdentifier(value.peerId, "peerId");
  assertPlanningIdentifier(value.peerInstanceId, "peerInstanceId");
  const intent = validateMissionIntentV1(value.missionIntent);
  const policy = validatePlanSelectionPolicyV1(value.selectionPolicy);
  const view = validatePlanViewV1(value.planView);
  if (
    value.tenantId !== intent.tenantId ||
    value.policyDomainId !== intent.policyDomainId ||
    value.tenantId !== view.tenantId ||
    value.policyDomainId !== view.policyDomainId ||
    value.peerId !== view.peerId ||
    value.peerInstanceId !== view.peerInstanceId ||
    intent.missionIntentId !== view.missionIntentId ||
    intent.revision !== view.intentRevision ||
    intent.intentDigest !== view.intentDigest ||
    intent.selectionPolicyDigest !== policy.policyDigest ||
    policy.policyDigest !== view.selectionPolicyDigest
  )
    throw new CollectivePlanningValidationError(
      "snapshot identity, intent, policy and plan-view bindings differ",
    );
  validatePlanViewRelationships(
    value.planView as Record<string, unknown>,
    intent.planningLimits,
  );
  if (view.proposals.length > intent.planningLimits.maximumCandidateFragments)
    throw new CollectivePlanningValidationError(
      "snapshot proposal count exceeds mission limit",
    );
  const permittedCapabilities = new Set(intent.permittedCapabilityKeys);
  for (const proposal of view.proposals) {
    const proposalBytes = planningUtf8ByteLengthV1(
      canonicalizePlanningJsonV1(proposal as unknown as JsonValue),
    );
    if (
      proposalBytes > intent.planningLimits.maximumProposalBytes ||
      proposal.parentFragmentDigests.length >
        intent.planningLimits.maximumDependencyFanout ||
      proposal.dependencyFragmentDigests.length >
        intent.planningLimits.maximumDependencyFanout ||
      proposal.outcomeStatements.length >
        intent.planningLimits.maximumOutcomeTerms ||
      proposal.requiredCapabilityKeys.length >
        intent.planningLimits.maximumCapabilityTerms ||
      proposal.requiredCapabilityKeys.some(
        (capability) => !permittedCapabilities.has(capability),
      ) ||
      proposal.requestedBudgetUnits >
        intent.planningLimits.maximumFragmentBudgetUnits ||
      Date.parse(proposal.workDeadline) < Date.parse(intent.validFrom) ||
      Date.parse(proposal.workDeadline) > Date.parse(intent.validUntil)
    )
      throw new CollectivePlanningValidationError(
        "proposal exceeds mission scope or planning limits",
      );
  }
  for (const mapping of view.workMappings)
    if (
      mapping.meshId !== intent.objective.meshId ||
      mapping.objectiveId !== intent.objective.objectiveId
    )
      throw new CollectivePlanningValidationError(
        "Work mapping differs from the mission Objective",
      );
  const perPeer = new Map<string, number>();
  const perSlot = new Map<string, number>();
  const decidedProposalDigests = new Set(
    view.decisions.map((decision) => decision.proposalDigest),
  );
  const pendingProposalCount = view.proposals.filter(
    (proposal) => !decidedProposalDigests.has(proposal.proposalDigest),
  ).length;
  const latestFragmentById = new Map<string, PlanFragmentV1>();
  for (const fragment of view.fragments) {
    const current = latestFragmentById.get(fragment.fragmentId);
    if (!current || current.fragmentRevision < fragment.fragmentRevision)
      latestFragmentById.set(fragment.fragmentId, fragment);
  }
  for (const fragment of latestFragmentById.values()) {
    perPeer.set(
      fragment.proposerPeerId,
      (perPeer.get(fragment.proposerPeerId) ?? 0) + 1,
    );
  }
  for (const proposal of view.proposals)
    perSlot.set(
      proposal.semanticSlotKey,
      (perSlot.get(proposal.semanticSlotKey) ?? 0) + 1,
    );
  if (
    [...perPeer.values()].some(
      (count) => count > intent.planningLimits.maximumFragmentsPerPeer,
    ) ||
    [...perSlot.values()].some(
      (count) => count > intent.planningLimits.maximumRevisionsPerSemanticSlot,
    ) ||
    pendingProposalCount > intent.planningLimits.maximumConcurrentProposals
  )
    throw new CollectivePlanningValidationError(
      "snapshot fragment records exceed a per-peer, per-slot or concurrency limit",
    );
  const highWaters = assertSortedRecords(
    value.domainHighWaters,
    "domainHighWaters",
    intent.planningLimits.maximumCandidateFragments * 4,
    validateDomainHighWater,
    (item) => `${item.domain}\u0000${item.recordId}`,
  );
  const highWaterByKey = new Map(
    highWaters.map((item) => [`${item.domain}\u0000${item.recordId}`, item]),
  );
  const observationHighWaterDigests = new Set(
    highWaters
      .filter((item) => item.domain === "observation")
      .map((item) => item.digest),
  );
  for (const proposal of view.proposals) {
    const proposalWater = highWaterByKey.get(
      `proposal\u0000${proposal.proposalId}`,
    );
    if (
      !proposalWater ||
      proposalWater.revision !== proposal.proposalRevision ||
      proposalWater.digest !== proposal.proposalDigest
    )
      throw new CollectivePlanningValidationError(
        "snapshot domain high-waters do not cover proposal history",
      );
    if (
      proposal.basisObservationDigests.some(
        (digest) => !observationHighWaterDigests.has(digest),
      )
    )
      throw new CollectivePlanningValidationError(
        "snapshot domain high-waters do not cover proposal observations",
      );
  }
  for (const decision of view.decisions) {
    const decisionWater = highWaterByKey.get(
      `decision\u0000${decision.decisionId}`,
    );
    if (
      !decisionWater ||
      decisionWater.revision !== decision.localPlanViewRevision ||
      decisionWater.digest !== decision.decisionDigest
    )
      throw new CollectivePlanningValidationError(
        "snapshot domain high-waters do not cover decision history",
      );
  }
  for (const fragment of latestFragmentById.values()) {
    const fragmentWater = highWaterByKey.get(
      `fragment\u0000${fragment.fragmentId}`,
    );
    if (
      !fragmentWater ||
      fragmentWater.revision !== fragment.fragmentRevision ||
      fragmentWater.digest !== fragment.fragmentDigest
    )
      throw new CollectivePlanningValidationError(
        "snapshot domain high-waters do not cover fragment history",
      );
  }
  assertPlanningDigest(value.snapshotDigest, "snapshotDigest");
  const snapshotWithoutDigest = withoutKey(
    value,
    "snapshotDigest",
  ) as unknown as Omit<CollectivePlanningSnapshotV1, "snapshotDigest">;
  if (
    value.snapshotDigest !==
    collectivePlanningSnapshotDigestV1(snapshotWithoutDigest)
  )
    throw new CollectivePlanningValidationError("snapshotDigest mismatch");
  return cloneFrozen(value) as unknown as CollectivePlanningSnapshotV1;
}

function assertSelectionPolicyNotWidenedV1(
  previous: PlanSelectionPolicyV1,
  next: PlanSelectionPolicyV1,
): void {
  if (
    previous.selectionPolicyId !== next.selectionPolicyId ||
    next.revision < previous.revision
  )
    throw new CollectivePlanningValidationError(
      "snapshot selection policy identity or revision regressed",
    );
  if (next.revision === previous.revision) {
    if (next.policyDigest !== previous.policyDigest)
      throw new CollectivePlanningValidationError(
        "same selection policy revision has a different digest",
      );
    return;
  }
  if (next.revision !== previous.revision + 1)
    throw new CollectivePlanningValidationError(
      "snapshot selection policy revision has a gap",
    );
  if (
    canonicalizePlanningJsonV1(
      previous.scoringDimensions as unknown as JsonValue,
    ) !==
      canonicalizePlanningJsonV1(
        next.scoringDimensions as unknown as JsonValue,
      ) ||
    canonicalizePlanningJsonV1(
      previous.tieBreakOrder as unknown as JsonValue,
    ) !==
      canonicalizePlanningJsonV1(next.tieBreakOrder as unknown as JsonValue) ||
    next.acceptanceScoreThreshold < previous.acceptanceScoreThreshold ||
    next.challengeScoreThreshold < previous.challengeScoreThreshold
  )
    throw new CollectivePlanningValidationError(
      "snapshot selection policy revision widens scoring or thresholds",
    );
  const nextConstraints = new Set(next.hardConstraintKeys);
  if (
    previous.hardConstraintKeys.some(
      (constraint) => !nextConstraints.has(constraint),
    )
  )
    throw new CollectivePlanningValidationError(
      "snapshot selection policy revision removes a hard constraint",
    );
}

function activeRolesByFragmentId(
  snapshot: CollectivePlanningSnapshotV1,
): Map<string, AdaptiveRoleBindingV1> {
  const fragmentIdByDigest = new Map(
    snapshot.planView.fragments.map((fragment) => [
      fragment.fragmentDigest,
      fragment.fragmentId,
    ]),
  );
  const result = new Map<string, AdaptiveRoleBindingV1>();
  for (const role of snapshot.planView.activeRoleBindings) {
    const fragmentId = fragmentIdByDigest.get(role.fragmentDigest);
    if (fragmentId) result.set(fragmentId, role);
  }
  return result;
}

export function assertSnapshotHighWatersNotLoweredV1(
  previousInput: unknown,
  nextInput: unknown,
): CollectivePlanningSnapshotV1 {
  const previous = validateCollectivePlanningSnapshotV1(previousInput);
  const next = validateCollectivePlanningSnapshotV1(nextInput);
  if (
    previous.tenantId !== next.tenantId ||
    previous.policyDomainId !== next.policyDomainId ||
    previous.peerId !== next.peerId ||
    previous.peerInstanceId !== next.peerInstanceId ||
    previous.missionIntent.missionIntentId !==
      next.missionIntent.missionIntentId
  )
    throw new CollectivePlanningValidationError(
      "snapshots belong to different planning domains",
    );
  if (next.missionIntent.revision === previous.missionIntent.revision) {
    if (next.missionIntent.intentDigest !== previous.missionIntent.intentDigest)
      throw new CollectivePlanningValidationError(
        "same mission intent revision has a different digest",
      );
  } else
    assertMissionIntentRevisionV1(previous.missionIntent, next.missionIntent);
  assertSelectionPolicyNotWidenedV1(
    previous.selectionPolicy,
    next.selectionPolicy,
  );
  const nextByKey = new Map(
    next.domainHighWaters.map((item) => [
      `${item.domain}\u0000${item.recordId}`,
      item,
    ]),
  );
  for (const item of previous.domainHighWaters) {
    const candidate = nextByKey.get(`${item.domain}\u0000${item.recordId}`);
    if (!candidate)
      throw new CollectivePlanningValidationError(
        "snapshot lowers or conflicts with a domain high-water",
      );
    if (item.domain === "fragment") {
      if (
        candidate.revision < item.revision ||
        (candidate.revision === item.revision &&
          candidate.digest !== item.digest)
      )
        throw new CollectivePlanningValidationError(
          "snapshot lowers or conflicts with a fragment high-water",
        );
    } else if (
      candidate.revision !== item.revision ||
      candidate.digest !== item.digest
    )
      throw new CollectivePlanningValidationError(
        "snapshot mutates an immutable domain record",
      );
  }
  if (
    next.planView.revision < previous.planView.revision ||
    next.planView.logicalTimeHighWaterMs <
      previous.planView.logicalTimeHighWaterMs
  )
    throw new CollectivePlanningValidationError(
      "snapshot lowers its plan-view high-water",
    );
  if (
    next.planView.revision === previous.planView.revision &&
    next.planView.stateDigest !== previous.planView.stateDigest
  )
    throw new CollectivePlanningValidationError(
      "same plan-view revision has a different state digest",
    );
  const previousRoles = activeRolesByFragmentId(previous);
  const nextRoles = activeRolesByFragmentId(next);
  for (const [fragmentId, previousRole] of previousRoles) {
    const nextRole = nextRoles.get(fragmentId);
    if (!nextRole) continue;
    if (
      nextRole.assignmentEpoch < previousRole.assignmentEpoch ||
      nextRole.authorityGeneration < previousRole.authorityGeneration
    )
      throw new CollectivePlanningValidationError(
        "snapshot lowers adaptive-role assignment authority",
      );
    if (
      nextRole.assignmentEpoch === previousRole.assignmentEpoch &&
      nextRole.authorityGeneration === previousRole.authorityGeneration &&
      (nextRole.assignedPeerId !== previousRole.assignedPeerId ||
        nextRole.assignedInstanceId !== previousRole.assignedInstanceId ||
        nextRole.assignmentAuthorityId !== previousRole.assignmentAuthorityId ||
        nextRole.fencingToken !== previousRole.fencingToken ||
        nextRole.workContractId !== previousRole.workContractId ||
        nextRole.workContractDigest !== previousRole.workContractDigest)
    )
      throw new CollectivePlanningValidationError(
        "same adaptive-role authority counters have conflicting bindings",
      );
  }
  return next;
}
