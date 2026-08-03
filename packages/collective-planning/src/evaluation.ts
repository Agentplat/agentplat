import type { JsonValue } from "@agentplat/core";

import {
  CollectivePlanningValidationError,
  canonicalizePlanningJsonV1,
  deepFreezePlanning,
  digestPlanningJsonV1,
  planningUtf8ByteLengthV1,
} from "./canonical.js";
import type { PlanningDigestV1, PlanningJson } from "./contracts.js";
import type {
  CollectiveEnvironmentBoundaryAuditV1,
  CollectiveEnvironmentBoundaryFindingV1,
  CollectiveEnvironmentInitializationReceiptV1,
  CollectiveEnvironmentInitializationV1,
  CollectiveEnvironmentObservationReceiptV1,
  CollectiveEnvironmentObservationRequestV1,
  CollectiveEnvironmentPortV1,
  CollectiveEnvironmentAdvanceReceiptV1,
  CollectiveEnvironmentAdvanceRequestV1,
  CollectiveEnvironmentRestoreReceiptV1,
  CollectiveEnvironmentSnapshotHandleV1,
  CollectiveEvaluationBoundaryEvidenceV1,
  CollectiveEvaluationLimitsV1,
  CollectiveEvaluationRegistrationBindingV1,
  CollectiveInteractionKindV2,
  CollectiveInteractionLedgerV2,
  CollectiveInvariantMonitorEventKindV1,
  CollectiveInvariantMonitorEventV1,
  CollectiveInvariantMonitorPolicyV1,
  CollectiveInvariantMonitorSnapshotV1,
  CollectiveInvariantMonitorVerdictV1,
  CollectiveProtectedEffectAttemptV1,
  CollectiveProtectedEffectReceiptV1,
  CollectivePublicArtifactV1,
  CollectiveTraceEventKindV2,
  CollectiveTraceEventV2,
  CollectiveTraceFaultBindingV2,
  CollectiveTraceV2,
  CreateCollectiveTraceEventInputV2,
} from "./evaluation-contracts.js";
import {
  assertPlanningDigest,
  assertPlanningExactKeys,
  assertPlanningIdentifier,
  assertPlanningSafeInteger,
  assertPlanningToken,
  validateMissionObservationV1,
} from "./validation.js";

export * from "./evaluation-contracts.js";

const runnerValues = new Set(["adaptive_collective", "centralized_planner"]);
const stratumValues = new Set(["nominal", "benign", "adversarial", "mixed"]);
const componentValues = new Set([
  "environment",
  "runner",
  "planning",
  "mesh",
  "governance",
  "monitor",
  "fault",
  "evidence",
]);
const statusValues = new Set([
  "accepted",
  "rejected",
  "indeterminate",
  "observed",
]);
const traceKindValues = new Set<CollectiveTraceEventKindV2>([
  "environment.initialized",
  "environment.time.advanced",
  "environment.observation.requested",
  "environment.observation.delivered",
  "environment.observation.rejected",
  "peer.decision.accepted",
  "peer.decision.rejected",
  "runner.directive.delivered",
  "planning.proposal",
  "planning.decision",
  "planning.supersession",
  "mesh.message.prepared",
  "mesh.message.delivered",
  "mesh.message.rejected",
  "work.created",
  "work.revised",
  "work.cancelled",
  "allocation.offer",
  "allocation.bid",
  "allocation.award",
  "allocation.accepted",
  "allocation.declined",
  "lease.renewed",
  "lease.recovered",
  "recovery.directive",
  "work.checkpoint",
  "work.result",
  "trust.assessed",
  "inference.assessed",
  "policy.escalated",
  "authority.grant",
  "authority.reservation",
  "authority.permit",
  "effect.dispatch",
  "environment.effect.attempted",
  "environment.effect.committed",
  "environment.effect.rejected",
  "environment.effect.indeterminate",
  "evidence.appended",
  "evidence.rejected",
  "fault.scheduled",
  "fault.injected",
  "fault.observed",
  "monitor.terminal",
]);
const monitorKindValues = new Set<CollectiveInvariantMonitorEventKindV1>([
  "observation.delivered",
  "effect.committed",
  "effect.duplicate",
  "authorization.violation",
  "plan_authority.violation",
  "stale_fence.violation",
  "hidden_state.violation",
  "global_membership.violation",
  "direct_assignment.violation",
  "synthetic_ledger.violation",
  "constant_metric.violation",
  "canary_leak.violation",
  "terminal.failure",
]);
const LARGE_EVALUATION_JSON_LIMITS = Object.freeze({
  maximumBytes: 67_108_864,
  maximumDepth: 64,
  maximumNodes: 2_000_000,
  maximumKeysPerObject: 4_096,
  maximumItemsPerArray: 262_144,
});

export const DEFAULT_COLLECTIVE_EVALUATION_LIMITS_V1: Readonly<CollectiveEvaluationLimitsV1> =
  deepFreezePlanning({
    schemaVersion: 1,
    maximumTraceEvents: 10_000,
    maximumTraceBytes: 67_108_864,
    maximumInteractions: 5_000,
    maximumCausalParents: 32,
    maximumObservationBatch: 64,
    maximumEnvironmentSnapshots: 128,
    maximumMonitorEvents: 16_384,
    maximumPublicArtifactBytes: 4_194_304,
  });

const limitsKeys = [
  "schemaVersion",
  "maximumTraceEvents",
  "maximumTraceBytes",
  "maximumInteractions",
  "maximumCausalParents",
  "maximumObservationBatch",
  "maximumEnvironmentSnapshots",
  "maximumMonitorEvents",
  "maximumPublicArtifactBytes",
] as const;
const registrationKeys = [
  "schemaVersion",
  "registrationId",
  "registrationDigest",
  "tenantId",
  "missionIntentId",
  "intentRevision",
  "intentDigest",
  "runner",
  "stratum",
  "seed",
  "environmentDigest",
  "observationPolicyDigest",
  "monitorDigest",
  "hiddenCanaryDigest",
  "limits",
  "bindingDigest",
] as const;
const eventKeys = [
  "schemaVersion",
  "eventId",
  "causalParentIds",
  "registrationDigest",
  "seed",
  "runner",
  "logicalTimeMs",
  "tenantId",
  "missionIntentId",
  "peerId",
  "component",
  "kind",
  "status",
  "reasonCode",
  "recordDigest",
  "stateDigestBefore",
  "stateDigestAfter",
  "faultBinding",
  "accountingKind",
  "accountingUnits",
  "previousTraceChainDigest",
  "eventDigest",
  "traceChainDigest",
] as const;
const eventInputKeys = eventKeys.filter(
  (key) =>
    key !== "accountingKind" &&
    key !== "accountingUnits" &&
    key !== "eventDigest" &&
    key !== "traceChainDigest"
);
const ledgerKeys = [
  "schemaVersion",
  "accountingVersion",
  "message",
  "decision",
  "observation",
  "directive",
  "assessment",
  "protected_action",
  "escalation",
  "recovery",
  "total",
  "maximumInteractions",
  "limitExceeded",
  "firstExceededEventId",
  "traceRoot",
  "ledgerDigest",
] as const;

function plainArray(value: unknown, label: string): asserts value is unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length > 0
  )
    throw new CollectivePlanningValidationError(`${label} must be an array`);
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== value.length + 1 || !names.includes("length"))
    throw new CollectivePlanningValidationError(
      `${label} must be a dense array`
    );
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
      throw new CollectivePlanningValidationError(
        `${label} must contain data properties`
      );
  }
}

function enumValue(
  value: unknown,
  values: ReadonlySet<string>,
  label: string
): asserts value is string {
  if (typeof value !== "string" || !values.has(value))
    throw new CollectivePlanningValidationError(`${label} is invalid`);
}

function nullableIdentifier(value: unknown, label: string): void {
  if (value !== null) assertPlanningIdentifier(value, label);
}

function nullableToken(value: unknown, label: string): void {
  if (value !== null) assertPlanningToken(value, label);
}

function nullableDigest(value: unknown, label: string): void {
  if (value !== null) assertPlanningDigest(value, label);
}

function assertReceiptReasonBinding(
  status: string,
  reasonCode: unknown,
  rejectedStatus = "rejected"
): void {
  if ((status === rejectedStatus) !== (reasonCode !== null))
    throw new CollectivePlanningValidationError(
      "receipt status and reasonCode are inconsistent"
    );
}

function clone<T>(value: T): T {
  return deepFreezePlanning(structuredClone(value));
}

function assertDigest(
  domain: Parameters<typeof digestPlanningJsonV1>[0],
  value: Record<string, unknown>,
  key: string
): void {
  assertPlanningDigest(value[key], key);
  const body = { ...value };
  delete body[key];
  if (
    digestPlanningJsonV1(
      domain,
      body as JsonValue,
      LARGE_EVALUATION_JSON_LIMITS
    ) !== value[key]
  )
    throw new CollectivePlanningValidationError(
      `${key} does not match canonical content`
    );
}

function sortedUniqueIdentifiers(
  value: unknown,
  maximum: number,
  label: string
): readonly string[] {
  plainArray(value, label);
  if (value.length > maximum)
    throw new CollectivePlanningValidationError(`${label} exceeds its bound`);
  let previous: string | undefined;
  for (const item of value) {
    assertPlanningIdentifier(item, label);
    if (previous !== undefined && previous >= item)
      throw new CollectivePlanningValidationError(
        `${label} must be sorted and unique`
      );
    previous = item;
  }
  return value as string[];
}

export function validateCollectiveEvaluationLimitsV1(
  value: unknown
): CollectiveEvaluationLimitsV1 {
  assertPlanningExactKeys(value, limitsKeys, "evaluation limits");
  if (value.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(
      "evaluation limits schema is invalid"
    );
  assertPlanningSafeInteger(
    value.maximumTraceEvents,
    "maximumTraceEvents",
    1,
    262_144
  );
  assertPlanningSafeInteger(
    value.maximumTraceBytes,
    "maximumTraceBytes",
    1_024,
    67_108_864
  );
  assertPlanningSafeInteger(
    value.maximumInteractions,
    "maximumInteractions",
    1,
    10_000_000
  );
  assertPlanningSafeInteger(
    value.maximumCausalParents,
    "maximumCausalParents",
    1,
    32
  );
  assertPlanningSafeInteger(
    value.maximumObservationBatch,
    "maximumObservationBatch",
    1,
    4_096
  );
  assertPlanningSafeInteger(
    value.maximumEnvironmentSnapshots,
    "maximumEnvironmentSnapshots",
    1,
    10_000
  );
  assertPlanningSafeInteger(
    value.maximumMonitorEvents,
    "maximumMonitorEvents",
    1,
    262_144
  );
  assertPlanningSafeInteger(
    value.maximumPublicArtifactBytes,
    "maximumPublicArtifactBytes",
    1_024,
    67_108_864
  );
  return clone(value as unknown as CollectiveEvaluationLimitsV1);
}

export function createCollectiveEvaluationRegistrationBindingV1(
  input: Omit<CollectiveEvaluationRegistrationBindingV1, "bindingDigest">
): CollectiveEvaluationRegistrationBindingV1 {
  assertPlanningExactKeys(
    input,
    registrationKeys.filter((key) => key !== "bindingDigest"),
    "registration binding input"
  );
  return validateCollectiveEvaluationRegistrationBindingV1({
    ...input,
    bindingDigest: digestPlanningJsonV1(
      "evaluation-registration-binding",
      input as unknown as JsonValue
    ),
  });
}

export function validateCollectiveEvaluationRegistrationBindingV1(
  value: unknown
): CollectiveEvaluationRegistrationBindingV1 {
  assertPlanningExactKeys(value, registrationKeys, "registration binding");
  if (value.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(
      "registration binding schema is invalid"
    );
  assertPlanningIdentifier(value.registrationId, "registrationId");
  assertPlanningDigest(value.registrationDigest, "registrationDigest");
  assertPlanningIdentifier(value.tenantId, "tenantId");
  assertPlanningIdentifier(value.missionIntentId, "missionIntentId");
  assertPlanningSafeInteger(value.intentRevision, "intentRevision", 1);
  assertPlanningDigest(value.intentDigest, "intentDigest");
  enumValue(value.runner, runnerValues, "runner");
  enumValue(value.stratum, stratumValues, "stratum");
  assertPlanningSafeInteger(value.seed, "seed", 0);
  assertPlanningDigest(value.environmentDigest, "environmentDigest");
  assertPlanningDigest(
    value.observationPolicyDigest,
    "observationPolicyDigest"
  );
  assertPlanningDigest(value.monitorDigest, "monitorDigest");
  assertPlanningDigest(value.hiddenCanaryDigest, "hiddenCanaryDigest");
  validateCollectiveEvaluationLimitsV1(value.limits);
  assertDigest("evaluation-registration-binding", value, "bindingDigest");
  return clone(value as unknown as CollectiveEvaluationRegistrationBindingV1);
}

export function collectiveTraceAccountingV2(
  kind: CollectiveTraceEventKindV2
): Readonly<{
  accountingKind: CollectiveInteractionKindV2 | null;
  accountingUnits: number;
}> {
  enumValue(kind, traceKindValues, "trace event kind");
  const map: Partial<
    Record<CollectiveTraceEventKindV2, CollectiveInteractionKindV2>
  > = {
    "environment.observation.delivered": "observation",
    "peer.decision.accepted": "decision",
    "peer.decision.rejected": "decision",
    "runner.directive.delivered": "directive",
    "mesh.message.delivered": "message",
    "trust.assessed": "assessment",
    "inference.assessed": "assessment",
    "environment.effect.attempted": "protected_action",
    "policy.escalated": "escalation",
    "recovery.directive": "recovery",
  };
  const accountingKind = map[kind] ?? null;
  return Object.freeze({
    accountingKind,
    accountingUnits: accountingKind === null ? 0 : 1,
  });
}

function expectedTraceComponentV2(
  kind: CollectiveTraceEventKindV2
): CollectiveTraceEventV2["component"] {
  if (kind.startsWith("environment.")) return "environment";
  if (kind.startsWith("peer.") || kind.startsWith("runner.")) return "runner";
  if (kind.startsWith("planning.")) return "planning";
  if (
    kind.startsWith("mesh.") ||
    kind.startsWith("work.") ||
    kind.startsWith("allocation.") ||
    kind.startsWith("lease.") ||
    kind === "recovery.directive" ||
    kind === "work.checkpoint" ||
    kind === "work.result"
  )
    return "mesh";
  if (
    kind.startsWith("trust.") ||
    kind.startsWith("inference.") ||
    kind.startsWith("policy.") ||
    kind.startsWith("authority.") ||
    kind === "effect.dispatch"
  )
    return "governance";
  if (kind.startsWith("evidence.")) return "evidence";
  if (kind.startsWith("fault.")) return "fault";
  return "monitor";
}

function assertAccountedTraceStatusV2(
  kind: CollectiveTraceEventKindV2,
  status: CollectiveTraceEventV2["status"]
): void {
  const required: Partial<
    Record<CollectiveTraceEventKindV2, CollectiveTraceEventV2["status"]>
  > = {
    "environment.observation.delivered": "accepted",
    "peer.decision.accepted": "accepted",
    "peer.decision.rejected": "rejected",
    "runner.directive.delivered": "accepted",
    "mesh.message.delivered": "accepted",
    "environment.effect.attempted": "observed",
    "policy.escalated": "accepted",
    "recovery.directive": "accepted",
  };
  const expected = required[kind];
  if (expected !== undefined && status !== expected)
    throw new CollectivePlanningValidationError(
      "accounted trace event status is not canonical"
    );
  if (
    (kind === "trust.assessed" || kind === "inference.assessed") &&
    status !== "observed" &&
    status !== "accepted"
  )
    throw new CollectivePlanningValidationError(
      "assessment trace event status is not canonical"
    );
}

function validateFaultBinding(
  value: unknown
): CollectiveTraceFaultBindingV2 | null {
  if (value === null) return null;
  assertPlanningExactKeys(
    value,
    ["schemaVersion", "faultFamily", "scheduleId", "injectionId"],
    "fault binding"
  );
  if (value.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(
      "fault binding schema is invalid"
    );
  assertPlanningToken(value.faultFamily, "faultFamily");
  assertPlanningIdentifier(value.scheduleId, "scheduleId");
  assertPlanningIdentifier(value.injectionId, "injectionId");
  return clone(value as unknown as CollectiveTraceFaultBindingV2);
}

function validateEventBody(
  value: Record<string, unknown>,
  maximumCausalParents = 32
): void {
  if (value.schemaVersion !== 2)
    throw new CollectivePlanningValidationError(
      "trace event schema is invalid"
    );
  assertPlanningIdentifier(value.eventId, "eventId");
  sortedUniqueIdentifiers(
    value.causalParentIds,
    maximumCausalParents,
    "causalParentIds"
  );
  if ((value.causalParentIds as string[]).includes(value.eventId as string))
    throw new CollectivePlanningValidationError(
      "trace event may not be its own parent"
    );
  assertPlanningDigest(value.registrationDigest, "registrationDigest");
  assertPlanningSafeInteger(value.seed, "seed", 0);
  enumValue(value.runner, runnerValues, "runner");
  assertPlanningSafeInteger(value.logicalTimeMs, "logicalTimeMs", 0);
  assertPlanningIdentifier(value.tenantId, "tenantId");
  assertPlanningIdentifier(value.missionIntentId, "missionIntentId");
  nullableIdentifier(value.peerId, "peerId");
  enumValue(value.component, componentValues, "component");
  enumValue(value.kind, traceKindValues, "kind");
  enumValue(value.status, statusValues, "status");
  if (
    value.component !==
    expectedTraceComponentV2(value.kind as CollectiveTraceEventKindV2)
  )
    throw new CollectivePlanningValidationError(
      "trace event component does not match its kind"
    );
  assertAccountedTraceStatusV2(
    value.kind as CollectiveTraceEventKindV2,
    value.status as CollectiveTraceEventV2["status"]
  );
  nullableToken(value.reasonCode, "reasonCode");
  assertPlanningDigest(value.recordDigest, "recordDigest");
  nullableDigest(value.stateDigestBefore, "stateDigestBefore");
  nullableDigest(value.stateDigestAfter, "stateDigestAfter");
  validateFaultBinding(value.faultBinding);
  nullableDigest(value.previousTraceChainDigest, "previousTraceChainDigest");
}

export function createCollectiveTraceEventV2(
  input: CreateCollectiveTraceEventInputV2
): CollectiveTraceEventV2 {
  assertPlanningExactKeys(input, eventInputKeys, "trace event input");
  validateEventBody(input);
  const accounting = collectiveTraceAccountingV2(input.kind);
  const body = { ...input, ...accounting };
  const eventDigest = digestPlanningJsonV1(
    "collective-trace-event-v2",
    body as unknown as JsonValue
  );
  const traceChainDigest = digestPlanningJsonV1("collective-trace-chain-v2", {
    previousTraceChainDigest: input.previousTraceChainDigest,
    eventDigest,
  });
  return validateCollectiveTraceEventV2({
    ...body,
    eventDigest,
    traceChainDigest,
  });
}

export function validateCollectiveTraceEventV2(
  value: unknown,
  maximumCausalParents = 32
): CollectiveTraceEventV2 {
  assertPlanningExactKeys(value, eventKeys, "trace event");
  validateEventBody(value, maximumCausalParents);
  const accounting = collectiveTraceAccountingV2(
    value.kind as CollectiveTraceEventKindV2
  );
  if (
    value.accountingKind !== accounting.accountingKind ||
    value.accountingUnits !== accounting.accountingUnits
  )
    throw new CollectivePlanningValidationError(
      "trace event accounting is not canonical"
    );
  assertPlanningDigest(value.eventDigest, "eventDigest");
  assertPlanningDigest(value.traceChainDigest, "traceChainDigest");
  const eventBody = { ...value };
  delete eventBody.eventDigest;
  delete eventBody.traceChainDigest;
  if (
    digestPlanningJsonV1(
      "collective-trace-event-v2",
      eventBody as JsonValue
    ) !== value.eventDigest
  )
    throw new CollectivePlanningValidationError(
      "eventDigest does not match canonical content"
    );
  const chain = digestPlanningJsonV1("collective-trace-chain-v2", {
    previousTraceChainDigest:
      value.previousTraceChainDigest as PlanningDigestV1 | null,
    eventDigest: value.eventDigest as PlanningDigestV1,
  });
  if (chain !== value.traceChainDigest)
    throw new CollectivePlanningValidationError(
      "traceChainDigest does not match canonical content"
    );
  return clone(value as unknown as CollectiveTraceEventV2);
}

export function replayCollectiveInteractionLedgerV2(
  eventsInput: readonly CollectiveTraceEventV2[],
  maximumInteractions: number
): CollectiveInteractionLedgerV2 {
  plainArray(eventsInput, "trace events");
  assertPlanningSafeInteger(
    maximumInteractions,
    "maximumInteractions",
    1,
    10_000_000
  );
  const counts: Record<CollectiveInteractionKindV2, number> = {
    message: 0,
    decision: 0,
    observation: 0,
    directive: 0,
    assessment: 0,
    protected_action: 0,
    escalation: 0,
    recovery: 0,
  };
  let total = 0;
  let firstExceededEventId: string | null = null;
  let traceRoot: PlanningDigestV1 | null = null;
  let previousLogicalTime = 0;
  const seen = new Set<string>();
  if (eventsInput.length > 262_144)
    throw new CollectivePlanningValidationError("trace event limit exceeded");
  for (const input of eventsInput) {
    const event = validateCollectiveTraceEventV2(input);
    if (
      event.previousTraceChainDigest !== traceRoot ||
      event.logicalTimeMs < previousLogicalTime ||
      seen.has(event.eventId) ||
      event.causalParentIds.some((id) => !seen.has(id))
    )
      throw new CollectivePlanningValidationError(
        "interaction ledger requires an append-only trace"
      );
    seen.add(event.eventId);
    traceRoot = event.traceChainDigest;
    previousLogicalTime = event.logicalTimeMs;
    if (event.accountingKind !== null) {
      counts[event.accountingKind] += event.accountingUnits;
      total += event.accountingUnits;
      if (total > maximumInteractions && firstExceededEventId === null)
        firstExceededEventId = event.eventId;
    }
  }
  const body = {
    schemaVersion: 2 as const,
    accountingVersion: "interaction-accounting-v2" as const,
    ...counts,
    total,
    maximumInteractions,
    limitExceeded: firstExceededEventId !== null,
    firstExceededEventId,
    traceRoot,
  };
  return deepFreezePlanning({
    ...body,
    ledgerDigest: digestPlanningJsonV1("interaction-ledger-v2", body),
  });
}

export function validateCollectiveInteractionLedgerV2(
  value: unknown
): CollectiveInteractionLedgerV2 {
  assertPlanningExactKeys(value, ledgerKeys, "interaction ledger");
  if (
    value.schemaVersion !== 2 ||
    value.accountingVersion !== "interaction-accounting-v2"
  )
    throw new CollectivePlanningValidationError(
      "interaction ledger version is invalid"
    );
  const kinds: CollectiveInteractionKindV2[] = [
    "message",
    "decision",
    "observation",
    "directive",
    "assessment",
    "protected_action",
    "escalation",
    "recovery",
  ];
  let total = 0;
  for (const kind of kinds) {
    assertPlanningSafeInteger(value[kind], kind, 0);
    total += value[kind] as number;
  }
  assertPlanningSafeInteger(value.total, "total", 0);
  assertPlanningSafeInteger(
    value.maximumInteractions,
    "maximumInteractions",
    1
  );
  if (
    value.total !== total ||
    value.limitExceeded !== total > (value.maximumInteractions as number)
  )
    throw new CollectivePlanningValidationError(
      "interaction ledger totals are inconsistent"
    );
  nullableIdentifier(value.firstExceededEventId, "firstExceededEventId");
  if (value.limitExceeded !== (value.firstExceededEventId !== null))
    throw new CollectivePlanningValidationError(
      "interaction ledger exceedance witness is inconsistent"
    );
  nullableDigest(value.traceRoot, "traceRoot");
  assertDigest("interaction-ledger-v2", value, "ledgerDigest");
  return clone(value as unknown as CollectiveInteractionLedgerV2);
}

export function createCollectiveTraceV2(
  registrationInput: CollectiveEvaluationRegistrationBindingV1,
  eventsInput: readonly CollectiveTraceEventV2[]
): CollectiveTraceV2 {
  const registration =
    validateCollectiveEvaluationRegistrationBindingV1(registrationInput);
  plainArray(eventsInput, "trace events");
  if (eventsInput.length > registration.limits.maximumTraceEvents)
    throw new CollectivePlanningValidationError("trace event limit exceeded");
  const events: CollectiveTraceEventV2[] = [];
  const seen = new Set<string>();
  let previous: PlanningDigestV1 | null = null;
  let previousLogicalTime = 0;
  for (const item of eventsInput) {
    const event = validateCollectiveTraceEventV2(
      item,
      registration.limits.maximumCausalParents
    );
    if (
      event.registrationDigest !== registration.bindingDigest ||
      event.seed !== registration.seed ||
      event.runner !== registration.runner ||
      event.tenantId !== registration.tenantId ||
      event.missionIntentId !== registration.missionIntentId
    )
      throw new CollectivePlanningValidationError(
        "trace event is outside its registration binding"
      );
    if (event.previousTraceChainDigest !== previous)
      throw new CollectivePlanningValidationError(
        "trace chain is not append-only"
      );
    if (event.logicalTimeMs < previousLogicalTime)
      throw new CollectivePlanningValidationError(
        "trace logical time regressed"
      );
    if (
      seen.has(event.eventId) ||
      event.causalParentIds.some((id) => !seen.has(id))
    )
      throw new CollectivePlanningValidationError(
        "trace event identity or causal parent is invalid"
      );
    seen.add(event.eventId);
    previous = event.traceChainDigest;
    previousLogicalTime = event.logicalTimeMs;
    events.push(event);
  }
  const ledger = replayCollectiveInteractionLedgerV2(
    events,
    registration.limits.maximumInteractions
  );
  const body = {
    format: "agentplat.collective-evaluation.trace" as const,
    schemaVersion: 2 as const,
    registrationDigest: registration.bindingDigest,
    seed: registration.seed,
    runner: registration.runner,
    events,
    ledger,
    traceRoot: previous,
  };
  const result = deepFreezePlanning({
    ...body,
    traceDigest: digestPlanningJsonV1(
      "collective-trace-v2",
      body as unknown as JsonValue,
      {
        maximumBytes: registration.limits.maximumTraceBytes,
        maximumDepth: 32,
        maximumNodes: 2_000_000,
        maximumKeysPerObject: 256,
        maximumItemsPerArray: 262_144,
      }
    ),
  });
  return result;
}

export function validateCollectiveTraceV2(
  value: unknown,
  registrationInput: CollectiveEvaluationRegistrationBindingV1
): CollectiveTraceV2 {
  assertPlanningExactKeys(
    value,
    [
      "format",
      "schemaVersion",
      "registrationDigest",
      "seed",
      "runner",
      "events",
      "ledger",
      "traceRoot",
      "traceDigest",
    ],
    "collective trace"
  );
  const registration =
    validateCollectiveEvaluationRegistrationBindingV1(registrationInput);
  const expected = createCollectiveTraceV2(
    registration,
    value.events as CollectiveTraceEventV2[]
  );
  const limits = {
    ...LARGE_EVALUATION_JSON_LIMITS,
    maximumBytes: registration.limits.maximumTraceBytes,
  };
  if (
    canonicalizePlanningJsonV1(value as JsonValue, limits) !==
    canonicalizePlanningJsonV1(expected as unknown as JsonValue, limits)
  )
    throw new CollectivePlanningValidationError(
      "collective trace does not match replay"
    );
  return expected;
}

export function assertCollectiveTraceSuccessionV2(
  previousInput: CollectiveTraceV2,
  nextInput: CollectiveTraceV2,
  registration: CollectiveEvaluationRegistrationBindingV1
): CollectiveTraceV2 {
  const previous = validateCollectiveTraceV2(previousInput, registration);
  const next = validateCollectiveTraceV2(nextInput, registration);
  if (next.events.length < previous.events.length)
    throw new CollectivePlanningValidationError(
      "trace succession may not truncate events"
    );
  for (let index = 0; index < previous.events.length; index += 1)
    if (previous.events[index].eventDigest !== next.events[index].eventDigest)
      throw new CollectivePlanningValidationError(
        "trace succession rewrites history"
      );
  return next;
}

function createDigested<T>(
  input: Record<string, unknown>,
  inputKeys: readonly string[],
  digestKey: string,
  domain: Parameters<typeof digestPlanningJsonV1>[0],
  validator: (value: unknown) => T,
  label: string
): T {
  assertPlanningExactKeys(input, inputKeys, `${label} input`);
  return validator({
    ...input,
    [digestKey]: digestPlanningJsonV1(
      domain,
      input as JsonValue,
      LARGE_EVALUATION_JSON_LIMITS
    ),
  });
}

const initializationKeys = [
  "schemaVersion",
  "initializationId",
  "registration",
  "initializedAtLogicalMs",
  "initializationDigest",
] as const;
const initializationReceiptKeys = [
  "schemaVersion",
  "initializationDigest",
  "status",
  "reasonCode",
  "logicalTimeMs",
  "environmentStateDigest",
  "receiptDigest",
] as const;
const observationRequestKeys = [
  "schemaVersion",
  "requestId",
  "registrationDigest",
  "missionIntentId",
  "intentRevision",
  "intentDigest",
  "peerId",
  "peerInstanceId",
  "environmentCursor",
  "maximumItems",
  "requestedAtLogicalMs",
  "requestDigest",
] as const;
const observationReceiptKeys = [
  "schemaVersion",
  "requestDigest",
  "peerId",
  "peerInstanceId",
  "environmentCursor",
  "nextEnvironmentCursor",
  "observationDigests",
  "status",
  "reasonCode",
  "deliveredAtLogicalMs",
  "receiptDigest",
] as const;
const effectAttemptKeys = [
  "schemaVersion",
  "attemptId",
  "idempotencyKey",
  "registrationDigest",
  "tenantId",
  "missionIntentId",
  "intentRevision",
  "intentDigest",
  "peerId",
  "peerInstanceId",
  "workItemId",
  "workItemRevision",
  "workContractId",
  "workContractDigest",
  "assignmentEpoch",
  "authorityGeneration",
  "fencingToken",
  "actionClass",
  "inputDigest",
  "attemptedAtLogicalMs",
  "attemptDigest",
] as const;
const effectReceiptKeys = [
  "schemaVersion",
  "attemptDigest",
  "idempotencyKey",
  "effectId",
  "status",
  "reasonCode",
  "outputDigest",
  "observedAtLogicalMs",
  "receiptDigest",
] as const;
const advanceKeys = [
  "schemaVersion",
  "advanceId",
  "registrationDigest",
  "targetLogicalTimeMs",
  "advanceDigest",
] as const;
const advanceReceiptKeys = [
  "schemaVersion",
  "advanceDigest",
  "status",
  "reasonCode",
  "logicalTimeMs",
  "environmentStateDigest",
  "receiptDigest",
] as const;
const snapshotKeys = [
  "format",
  "schemaVersion",
  "snapshotId",
  "registrationDigest",
  "seed",
  "logicalTimeMs",
  "eventCount",
  "traceRoot",
  "environmentStateDigest",
  "snapshotDigest",
] as const;
const restoreReceiptKeys = [
  "schemaVersion",
  "snapshotDigest",
  "status",
  "reasonCode",
  "logicalTimeMs",
  "environmentStateDigest",
  "receiptDigest",
] as const;

export function createCollectiveEnvironmentInitializationV1(
  input: Omit<CollectiveEnvironmentInitializationV1, "initializationDigest">
): CollectiveEnvironmentInitializationV1 {
  return createDigested(
    input as unknown as Record<string, unknown>,
    initializationKeys.filter((key) => key !== "initializationDigest"),
    "initializationDigest",
    "environment-initialization-v1",
    validateCollectiveEnvironmentInitializationV1,
    "environment initialization"
  );
}

export function validateCollectiveEnvironmentInitializationV1(
  value: unknown
): CollectiveEnvironmentInitializationV1 {
  assertPlanningExactKeys(
    value,
    initializationKeys,
    "environment initialization"
  );
  if (value.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(
      "environment initialization schema is invalid"
    );
  assertPlanningIdentifier(value.initializationId, "initializationId");
  validateCollectiveEvaluationRegistrationBindingV1(value.registration);
  assertPlanningSafeInteger(
    value.initializedAtLogicalMs,
    "initializedAtLogicalMs",
    0
  );
  assertDigest("environment-initialization-v1", value, "initializationDigest");
  return clone(value as unknown as CollectiveEnvironmentInitializationV1);
}

export function createCollectiveEnvironmentInitializationReceiptV1(
  input: Omit<CollectiveEnvironmentInitializationReceiptV1, "receiptDigest">
): CollectiveEnvironmentInitializationReceiptV1 {
  return createDigested(
    input as unknown as Record<string, unknown>,
    initializationReceiptKeys.filter((key) => key !== "receiptDigest"),
    "receiptDigest",
    "environment-initialization-receipt-v1",
    validateCollectiveEnvironmentInitializationReceiptV1,
    "environment initialization receipt"
  );
}

export function validateCollectiveEnvironmentInitializationReceiptV1(
  value: unknown
): CollectiveEnvironmentInitializationReceiptV1 {
  assertPlanningExactKeys(
    value,
    initializationReceiptKeys,
    "environment initialization receipt"
  );
  if (value.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(
      "environment initialization receipt schema is invalid"
    );
  assertPlanningDigest(value.initializationDigest, "initializationDigest");
  enumValue(
    value.status,
    new Set(["initialized", "idempotent", "rejected"]),
    "status"
  );
  nullableToken(value.reasonCode, "reasonCode");
  assertReceiptReasonBinding(value.status as string, value.reasonCode);
  assertPlanningSafeInteger(value.logicalTimeMs, "logicalTimeMs", 0);
  assertPlanningDigest(value.environmentStateDigest, "environmentStateDigest");
  assertDigest("environment-initialization-receipt-v1", value, "receiptDigest");
  return clone(
    value as unknown as CollectiveEnvironmentInitializationReceiptV1
  );
}

export function createCollectiveEnvironmentObservationRequestV1(
  input: Omit<CollectiveEnvironmentObservationRequestV1, "requestDigest">
): CollectiveEnvironmentObservationRequestV1 {
  return createDigested(
    input as unknown as Record<string, unknown>,
    observationRequestKeys.filter((key) => key !== "requestDigest"),
    "requestDigest",
    "environment-observation-request-v1",
    validateCollectiveEnvironmentObservationRequestV1,
    "environment observation request"
  );
}

export function validateCollectiveEnvironmentObservationRequestV1(
  value: unknown
): CollectiveEnvironmentObservationRequestV1 {
  assertPlanningExactKeys(
    value,
    observationRequestKeys,
    "environment observation request"
  );
  if (value.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(
      "environment observation request schema is invalid"
    );
  assertPlanningIdentifier(value.requestId, "requestId");
  assertPlanningDigest(value.registrationDigest, "registrationDigest");
  assertPlanningIdentifier(value.missionIntentId, "missionIntentId");
  assertPlanningSafeInteger(value.intentRevision, "intentRevision", 1);
  assertPlanningDigest(value.intentDigest, "intentDigest");
  assertPlanningIdentifier(value.peerId, "peerId");
  assertPlanningIdentifier(value.peerInstanceId, "peerInstanceId");
  assertPlanningToken(value.environmentCursor, "environmentCursor");
  assertPlanningSafeInteger(value.maximumItems, "maximumItems", 1, 4_096);
  assertPlanningSafeInteger(
    value.requestedAtLogicalMs,
    "requestedAtLogicalMs",
    0
  );
  assertDigest("environment-observation-request-v1", value, "requestDigest");
  return clone(value as unknown as CollectiveEnvironmentObservationRequestV1);
}

export function createCollectiveEnvironmentObservationReceiptV1(
  input: Omit<CollectiveEnvironmentObservationReceiptV1, "receiptDigest">
): CollectiveEnvironmentObservationReceiptV1 {
  return createDigested(
    input as unknown as Record<string, unknown>,
    observationReceiptKeys.filter((key) => key !== "receiptDigest"),
    "receiptDigest",
    "environment-observation-receipt-v1",
    validateCollectiveEnvironmentObservationReceiptV1,
    "environment observation receipt"
  );
}

export function validateCollectiveEnvironmentObservationReceiptV1(
  value: unknown
): CollectiveEnvironmentObservationReceiptV1 {
  assertPlanningExactKeys(
    value,
    observationReceiptKeys,
    "environment observation receipt"
  );
  if (value.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(
      "environment observation receipt schema is invalid"
    );
  assertPlanningDigest(value.requestDigest, "requestDigest");
  assertPlanningIdentifier(value.peerId, "peerId");
  assertPlanningIdentifier(value.peerInstanceId, "peerInstanceId");
  assertPlanningToken(value.environmentCursor, "environmentCursor");
  assertPlanningToken(value.nextEnvironmentCursor, "nextEnvironmentCursor");
  plainArray(value.observationDigests, "observationDigests");
  if (value.observationDigests.length > 4_096)
    throw new CollectivePlanningValidationError(
      "observationDigests exceeds its bound"
    );
  for (const digest of value.observationDigests)
    assertPlanningDigest(digest, "observationDigest");
  enumValue(
    value.status,
    new Set(["delivered", "idempotent", "rejected"]),
    "status"
  );
  nullableToken(value.reasonCode, "reasonCode");
  assertReceiptReasonBinding(value.status as string, value.reasonCode);
  assertPlanningSafeInteger(
    value.deliveredAtLogicalMs,
    "deliveredAtLogicalMs",
    0
  );
  if (
    value.status === "rejected" &&
    (value.observationDigests as unknown[]).length !== 0
  )
    throw new CollectivePlanningValidationError(
      "rejected observation receipt may not deliver observations"
    );
  if (
    value.status !== "rejected" &&
    (value.observationDigests as unknown[]).length === 0
  )
    throw new CollectivePlanningValidationError(
      "delivered observation receipt must contain observations"
    );
  if (
    value.status === "rejected" &&
    value.nextEnvironmentCursor !== value.environmentCursor
  )
    throw new CollectivePlanningValidationError(
      "rejected observation receipt may not advance its cursor"
    );
  assertDigest("environment-observation-receipt-v1", value, "receiptDigest");
  return clone(value as unknown as CollectiveEnvironmentObservationReceiptV1);
}

export function validateCollectiveEnvironmentObservationResultV1(
  value: unknown
): {
  readonly receipt: CollectiveEnvironmentObservationReceiptV1;
  readonly observations: readonly ReturnType<
    typeof validateMissionObservationV1
  >[];
} {
  assertPlanningExactKeys(
    value,
    ["receipt", "observations"],
    "environment observation result"
  );
  const receipt = validateCollectiveEnvironmentObservationReceiptV1(
    value.receipt
  );
  plainArray(value.observations, "observations");
  const observations = value.observations.map(validateMissionObservationV1);
  if (
    observations.length !== receipt.observationDigests.length ||
    observations.some(
      (item, index) =>
        item.observationDigest !== receipt.observationDigests[index] ||
        item.observerPeerId !== receipt.peerId ||
        item.observerInstanceId !== receipt.peerInstanceId
    )
  )
    throw new CollectivePlanningValidationError(
      "observation result does not match its receipt"
    );
  return deepFreezePlanning({ receipt, observations });
}

export function createCollectiveProtectedEffectAttemptV1(
  input: Omit<CollectiveProtectedEffectAttemptV1, "attemptDigest">
): CollectiveProtectedEffectAttemptV1 {
  return createDigested(
    input as unknown as Record<string, unknown>,
    effectAttemptKeys.filter((key) => key !== "attemptDigest"),
    "attemptDigest",
    "protected-effect-attempt-v1",
    validateCollectiveProtectedEffectAttemptV1,
    "protected effect attempt"
  );
}

export function validateCollectiveProtectedEffectAttemptV1(
  value: unknown
): CollectiveProtectedEffectAttemptV1 {
  assertPlanningExactKeys(value, effectAttemptKeys, "protected effect attempt");
  if (value.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(
      "protected effect attempt schema is invalid"
    );
  assertPlanningIdentifier(value.attemptId, "attemptId");
  assertPlanningToken(value.idempotencyKey, "idempotencyKey");
  assertPlanningDigest(value.registrationDigest, "registrationDigest");
  for (const key of [
    "tenantId",
    "missionIntentId",
    "peerId",
    "peerInstanceId",
    "workItemId",
    "workContractId",
  ])
    assertPlanningIdentifier(value[key], key);
  assertPlanningSafeInteger(value.intentRevision, "intentRevision", 1);
  assertPlanningDigest(value.intentDigest, "intentDigest");
  assertPlanningSafeInteger(value.workItemRevision, "workItemRevision", 1);
  assertPlanningDigest(value.workContractDigest, "workContractDigest");
  assertPlanningSafeInteger(value.assignmentEpoch, "assignmentEpoch", 1);
  assertPlanningSafeInteger(
    value.authorityGeneration,
    "authorityGeneration",
    1
  );
  assertPlanningToken(value.fencingToken, "fencingToken");
  assertPlanningToken(value.actionClass, "actionClass");
  assertPlanningDigest(value.inputDigest, "inputDigest");
  assertPlanningSafeInteger(
    value.attemptedAtLogicalMs,
    "attemptedAtLogicalMs",
    0
  );
  assertDigest("protected-effect-attempt-v1", value, "attemptDigest");
  return clone(value as unknown as CollectiveProtectedEffectAttemptV1);
}

export function createCollectiveProtectedEffectReceiptV1(
  input: Omit<CollectiveProtectedEffectReceiptV1, "receiptDigest">
): CollectiveProtectedEffectReceiptV1 {
  return createDigested(
    input as unknown as Record<string, unknown>,
    effectReceiptKeys.filter((key) => key !== "receiptDigest"),
    "receiptDigest",
    "protected-effect-receipt-v1",
    validateCollectiveProtectedEffectReceiptV1,
    "protected effect receipt"
  );
}

export function validateCollectiveProtectedEffectReceiptV1(
  value: unknown
): CollectiveProtectedEffectReceiptV1 {
  assertPlanningExactKeys(value, effectReceiptKeys, "protected effect receipt");
  if (value.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(
      "protected effect receipt schema is invalid"
    );
  assertPlanningDigest(value.attemptDigest, "attemptDigest");
  assertPlanningToken(value.idempotencyKey, "idempotencyKey");
  nullableIdentifier(value.effectId, "effectId");
  enumValue(
    value.status,
    new Set(["committed", "rejected", "indeterminate"]),
    "status"
  );
  nullableToken(value.reasonCode, "reasonCode");
  if ((value.status !== "committed") !== (value.reasonCode !== null))
    throw new CollectivePlanningValidationError(
      "effect receipt status and reasonCode are inconsistent"
    );
  nullableDigest(value.outputDigest, "outputDigest");
  assertPlanningSafeInteger(
    value.observedAtLogicalMs,
    "observedAtLogicalMs",
    0
  );
  if (
    value.status === "committed" &&
    (value.effectId === null || value.outputDigest === null)
  )
    throw new CollectivePlanningValidationError(
      "committed effect receipt requires effect and output digests"
    );
  if (
    value.status === "rejected" &&
    (value.effectId !== null || value.outputDigest !== null)
  )
    throw new CollectivePlanningValidationError(
      "rejected effect receipt may not expose an effect"
    );
  if (
    value.status === "indeterminate" &&
    (value.effectId !== null || value.outputDigest !== null)
  )
    throw new CollectivePlanningValidationError(
      "indeterminate effect receipt may not expose an effect"
    );
  assertDigest("protected-effect-receipt-v1", value, "receiptDigest");
  return clone(value as unknown as CollectiveProtectedEffectReceiptV1);
}

export function createCollectiveEnvironmentAdvanceRequestV1(
  input: Omit<CollectiveEnvironmentAdvanceRequestV1, "advanceDigest">
): CollectiveEnvironmentAdvanceRequestV1 {
  return createDigested(
    input as unknown as Record<string, unknown>,
    advanceKeys.filter((key) => key !== "advanceDigest"),
    "advanceDigest",
    "environment-advance-v1",
    validateCollectiveEnvironmentAdvanceRequestV1,
    "environment advance request"
  );
}

export function validateCollectiveEnvironmentAdvanceRequestV1(
  value: unknown
): CollectiveEnvironmentAdvanceRequestV1 {
  assertPlanningExactKeys(value, advanceKeys, "environment advance request");
  if (value.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(
      "environment advance schema is invalid"
    );
  assertPlanningIdentifier(value.advanceId, "advanceId");
  assertPlanningDigest(value.registrationDigest, "registrationDigest");
  assertPlanningSafeInteger(
    value.targetLogicalTimeMs,
    "targetLogicalTimeMs",
    0
  );
  assertDigest("environment-advance-v1", value, "advanceDigest");
  return clone(value as unknown as CollectiveEnvironmentAdvanceRequestV1);
}

export function createCollectiveEnvironmentAdvanceReceiptV1(
  input: Omit<CollectiveEnvironmentAdvanceReceiptV1, "receiptDigest">
): CollectiveEnvironmentAdvanceReceiptV1 {
  return createDigested(
    input as unknown as Record<string, unknown>,
    advanceReceiptKeys.filter((key) => key !== "receiptDigest"),
    "receiptDigest",
    "environment-advance-receipt-v1",
    validateCollectiveEnvironmentAdvanceReceiptV1,
    "environment advance receipt"
  );
}

export function validateCollectiveEnvironmentAdvanceReceiptV1(
  value: unknown
): CollectiveEnvironmentAdvanceReceiptV1 {
  assertPlanningExactKeys(
    value,
    advanceReceiptKeys,
    "environment advance receipt"
  );
  if (value.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(
      "environment advance receipt schema is invalid"
    );
  assertPlanningDigest(value.advanceDigest, "advanceDigest");
  enumValue(
    value.status,
    new Set(["advanced", "idempotent", "rejected"]),
    "status"
  );
  nullableToken(value.reasonCode, "reasonCode");
  assertReceiptReasonBinding(value.status as string, value.reasonCode);
  assertPlanningSafeInteger(value.logicalTimeMs, "logicalTimeMs", 0);
  assertPlanningDigest(value.environmentStateDigest, "environmentStateDigest");
  assertDigest("environment-advance-receipt-v1", value, "receiptDigest");
  return clone(value as unknown as CollectiveEnvironmentAdvanceReceiptV1);
}

export function createCollectiveEnvironmentSnapshotHandleV1(
  input: Omit<CollectiveEnvironmentSnapshotHandleV1, "snapshotDigest">
): CollectiveEnvironmentSnapshotHandleV1 {
  return createDigested(
    input as unknown as Record<string, unknown>,
    snapshotKeys.filter((key) => key !== "snapshotDigest"),
    "snapshotDigest",
    "environment-snapshot-handle-v1",
    validateCollectiveEnvironmentSnapshotHandleV1,
    "environment snapshot handle"
  );
}

export function validateCollectiveEnvironmentSnapshotHandleV1(
  value: unknown
): CollectiveEnvironmentSnapshotHandleV1 {
  assertPlanningExactKeys(value, snapshotKeys, "environment snapshot handle");
  if (
    value.format !== "agentplat.collective-environment.snapshot-handle" ||
    value.schemaVersion !== 1
  )
    throw new CollectivePlanningValidationError(
      "environment snapshot format is invalid"
    );
  assertPlanningIdentifier(value.snapshotId, "snapshotId");
  assertPlanningDigest(value.registrationDigest, "registrationDigest");
  assertPlanningSafeInteger(value.seed, "seed", 0);
  assertPlanningSafeInteger(value.logicalTimeMs, "logicalTimeMs", 0);
  assertPlanningSafeInteger(value.eventCount, "eventCount", 0);
  nullableDigest(value.traceRoot, "traceRoot");
  assertPlanningDigest(value.environmentStateDigest, "environmentStateDigest");
  assertDigest("environment-snapshot-handle-v1", value, "snapshotDigest");
  return clone(value as unknown as CollectiveEnvironmentSnapshotHandleV1);
}

export function createCollectiveEnvironmentRestoreReceiptV1(
  input: Omit<CollectiveEnvironmentRestoreReceiptV1, "receiptDigest">
): CollectiveEnvironmentRestoreReceiptV1 {
  return createDigested(
    input as unknown as Record<string, unknown>,
    restoreReceiptKeys.filter((key) => key !== "receiptDigest"),
    "receiptDigest",
    "environment-restore-receipt-v1",
    validateCollectiveEnvironmentRestoreReceiptV1,
    "environment restore receipt"
  );
}

export function validateCollectiveEnvironmentRestoreReceiptV1(
  value: unknown
): CollectiveEnvironmentRestoreReceiptV1 {
  assertPlanningExactKeys(
    value,
    restoreReceiptKeys,
    "environment restore receipt"
  );
  if (value.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(
      "environment restore receipt schema is invalid"
    );
  assertPlanningDigest(value.snapshotDigest, "snapshotDigest");
  enumValue(
    value.status,
    new Set(["restored", "idempotent", "rejected"]),
    "status"
  );
  nullableToken(value.reasonCode, "reasonCode");
  assertReceiptReasonBinding(value.status as string, value.reasonCode);
  assertPlanningSafeInteger(value.logicalTimeMs, "logicalTimeMs", 0);
  assertPlanningDigest(value.environmentStateDigest, "environmentStateDigest");
  assertDigest("environment-restore-receipt-v1", value, "receiptDigest");
  return clone(value as unknown as CollectiveEnvironmentRestoreReceiptV1);
}

const monitorPolicyKeys = [
  "schemaVersion",
  "policyId",
  "registrationDigest",
  "requiredEffects",
  "hiddenCanaryDigest",
  "policyDigest",
] as const;
const monitorEventKeys = [
  "schemaVersion",
  "monitorEventId",
  "registrationDigest",
  "traceEventId",
  "logicalTimeMs",
  "kind",
  "effectId",
  "violationCode",
  "recordDigest",
  "previousMonitorEventDigest",
  "monitorEventDigest",
] as const;
const monitorVerdictKeys = [
  "schemaVersion",
  "registrationDigest",
  "policyDigest",
  "traceRoot",
  "monitorEventRoot",
  "missionSuccess",
  "partialSuccessUnits",
  "objectiveValue",
  "authorizationViolations",
  "planAuthorityViolations",
  "staleFenceViolations",
  "duplicateEffectViolations",
  "hiddenStateViolations",
  "globalMembershipViolations",
  "directAssignmentViolations",
  "syntheticLedgerViolations",
  "constantMetricViolations",
  "canaryLeakViolations",
  "terminalReason",
  "firstViolationEventId",
  "verdictDigest",
] as const;
const monitorSnapshotKeys = [
  "format",
  "schemaVersion",
  "registrationDigest",
  "policyDigest",
  "events",
  "traceRoot",
  "snapshotDigest",
] as const;

export function createCollectiveInvariantMonitorPolicyV1(
  input: Omit<CollectiveInvariantMonitorPolicyV1, "policyDigest">
): CollectiveInvariantMonitorPolicyV1 {
  return createDigested(
    input as unknown as Record<string, unknown>,
    monitorPolicyKeys.filter((key) => key !== "policyDigest"),
    "policyDigest",
    "invariant-monitor-policy-v1",
    validateCollectiveInvariantMonitorPolicyV1,
    "invariant monitor policy"
  );
}

export function validateCollectiveInvariantMonitorPolicyV1(
  value: unknown
): CollectiveInvariantMonitorPolicyV1 {
  assertPlanningExactKeys(value, monitorPolicyKeys, "invariant monitor policy");
  if (value.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(
      "invariant monitor policy schema is invalid"
    );
  assertPlanningIdentifier(value.policyId, "policyId");
  assertPlanningDigest(value.registrationDigest, "registrationDigest");
  plainArray(value.requiredEffects, "requiredEffects");
  if (value.requiredEffects.length < 1 || value.requiredEffects.length > 4_096)
    throw new CollectivePlanningValidationError(
      "requiredEffects has invalid length"
    );
  let previous: string | undefined;
  for (const effect of value.requiredEffects) {
    assertPlanningExactKeys(
      effect,
      ["schemaVersion", "effectId", "outcomeUnits", "objectiveValue"],
      "required effect"
    );
    if (effect.schemaVersion !== 1)
      throw new CollectivePlanningValidationError(
        "required effect schema is invalid"
      );
    assertPlanningIdentifier(effect.effectId, "effectId");
    assertPlanningSafeInteger(effect.outcomeUnits, "outcomeUnits", 1);
    assertPlanningSafeInteger(effect.objectiveValue, "objectiveValue", 1);
    if (previous !== undefined && previous >= effect.effectId)
      throw new CollectivePlanningValidationError(
        "requiredEffects must be sorted and unique"
      );
    previous = effect.effectId;
  }
  assertPlanningDigest(value.hiddenCanaryDigest, "hiddenCanaryDigest");
  assertDigest("invariant-monitor-policy-v1", value, "policyDigest");
  return clone(value as unknown as CollectiveInvariantMonitorPolicyV1);
}

export function createCollectiveInvariantMonitorEventV1(
  input: Omit<CollectiveInvariantMonitorEventV1, "monitorEventDigest">
): CollectiveInvariantMonitorEventV1 {
  return createDigested(
    input as unknown as Record<string, unknown>,
    monitorEventKeys.filter((key) => key !== "monitorEventDigest"),
    "monitorEventDigest",
    "invariant-monitor-event-v1",
    validateCollectiveInvariantMonitorEventV1,
    "invariant monitor event"
  );
}

export function validateCollectiveInvariantMonitorEventV1(
  value: unknown
): CollectiveInvariantMonitorEventV1 {
  assertPlanningExactKeys(value, monitorEventKeys, "invariant monitor event");
  if (value.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(
      "invariant monitor event schema is invalid"
    );
  assertPlanningIdentifier(value.monitorEventId, "monitorEventId");
  assertPlanningDigest(value.registrationDigest, "registrationDigest");
  nullableIdentifier(value.traceEventId, "traceEventId");
  assertPlanningSafeInteger(value.logicalTimeMs, "logicalTimeMs", 0);
  enumValue(value.kind, monitorKindValues, "kind");
  nullableIdentifier(value.effectId, "effectId");
  nullableToken(value.violationCode, "violationCode");
  assertPlanningDigest(value.recordDigest, "recordDigest");
  nullableDigest(
    value.previousMonitorEventDigest,
    "previousMonitorEventDigest"
  );
  const kind = value.kind as CollectiveInvariantMonitorEventKindV1;
  if (
    (kind === "effect.committed" || kind === "effect.duplicate") !==
    (value.effectId !== null)
  )
    throw new CollectivePlanningValidationError(
      "monitor effect event has invalid effect binding"
    );
  if (kind.endsWith(".violation") !== (value.violationCode !== null))
    throw new CollectivePlanningValidationError(
      "monitor violation event has invalid violation binding"
    );
  assertDigest("invariant-monitor-event-v1", value, "monitorEventDigest");
  return clone(value as unknown as CollectiveInvariantMonitorEventV1);
}

export function replayCollectiveInvariantMonitorV1(
  policyInput: CollectiveInvariantMonitorPolicyV1,
  eventsInput: readonly CollectiveInvariantMonitorEventV1[],
  traceRoot: PlanningDigestV1 | null
): CollectiveInvariantMonitorVerdictV1 {
  const policy = validateCollectiveInvariantMonitorPolicyV1(policyInput);
  nullableDigest(traceRoot, "traceRoot");
  plainArray(eventsInput, "monitor events");
  if (eventsInput.length > 262_144)
    throw new CollectivePlanningValidationError("monitor event limit exceeded");
  const events: CollectiveInvariantMonitorEventV1[] = [];
  let previous: PlanningDigestV1 | null = null;
  let previousLogicalTime = 0;
  const seenIds = new Set<string>();
  for (const input of eventsInput) {
    const event = validateCollectiveInvariantMonitorEventV1(input);
    if (
      event.registrationDigest !== policy.registrationDigest ||
      event.previousMonitorEventDigest !== previous ||
      event.logicalTimeMs < previousLogicalTime ||
      seenIds.has(event.monitorEventId)
    )
      throw new CollectivePlanningValidationError(
        "monitor event chain is invalid"
      );
    seenIds.add(event.monitorEventId);
    previous = event.monitorEventDigest;
    previousLogicalTime = event.logicalTimeMs;
    events.push(event);
  }
  const required = new Map(
    policy.requiredEffects.map((item) => [item.effectId, item])
  );
  const committed = new Set<string>();
  const violations = {
    authorizationViolations: 0,
    planAuthorityViolations: 0,
    staleFenceViolations: 0,
    duplicateEffectViolations: 0,
    hiddenStateViolations: 0,
    globalMembershipViolations: 0,
    directAssignmentViolations: 0,
    syntheticLedgerViolations: 0,
    constantMetricViolations: 0,
    canaryLeakViolations: 0,
  };
  const violationMap: Partial<
    Record<CollectiveInvariantMonitorEventKindV1, keyof typeof violations>
  > = {
    "authorization.violation": "authorizationViolations",
    "plan_authority.violation": "planAuthorityViolations",
    "stale_fence.violation": "staleFenceViolations",
    "effect.duplicate": "duplicateEffectViolations",
    "hidden_state.violation": "hiddenStateViolations",
    "global_membership.violation": "globalMembershipViolations",
    "direct_assignment.violation": "directAssignmentViolations",
    "synthetic_ledger.violation": "syntheticLedgerViolations",
    "constant_metric.violation": "constantMetricViolations",
    "canary_leak.violation": "canaryLeakViolations",
  };
  let firstViolationEventId: string | null = null;
  let terminalFailure = false;
  for (const event of events) {
    if (event.kind === "effect.committed" && event.effectId !== null) {
      if (committed.has(event.effectId)) {
        violations.duplicateEffectViolations += 1;
        firstViolationEventId ??= event.monitorEventId;
      } else committed.add(event.effectId);
    }
    if (event.kind === "terminal.failure") {
      terminalFailure = true;
      firstViolationEventId ??= event.monitorEventId;
    }
    const counter = violationMap[event.kind];
    if (counter !== undefined) {
      violations[counter] += 1;
      firstViolationEventId ??= event.monitorEventId;
    }
  }
  let partialSuccessUnits = 0;
  let objectiveValue = 0;
  let allRequired = true;
  for (const item of required.values()) {
    if (committed.has(item.effectId)) {
      partialSuccessUnits += item.outcomeUnits;
      objectiveValue += item.objectiveValue;
      if (
        !Number.isSafeInteger(partialSuccessUnits) ||
        !Number.isSafeInteger(objectiveValue)
      )
        throw new CollectivePlanningValidationError(
          "monitor outcome totals exceed the safe integer range"
        );
    } else allRequired = false;
  }
  const violationTotal = Object.values(violations).reduce(
    (sum, count) => sum + count,
    0
  );
  const missionSuccess =
    allRequired && violationTotal === 0 && !terminalFailure;
  const terminalReason = missionSuccess
    ? "success"
    : terminalFailure
      ? "terminal_failure"
      : violationTotal > 0
        ? "invariant_violation"
        : "incomplete";
  const body = {
    schemaVersion: 1 as const,
    registrationDigest: policy.registrationDigest,
    policyDigest: policy.policyDigest,
    traceRoot,
    monitorEventRoot: previous,
    missionSuccess,
    partialSuccessUnits,
    objectiveValue,
    ...violations,
    terminalReason,
    firstViolationEventId,
  };
  return deepFreezePlanning({
    ...body,
    verdictDigest: digestPlanningJsonV1("invariant-monitor-verdict-v1", body),
  });
}

export function validateCollectiveInvariantMonitorVerdictV1(
  value: unknown
): CollectiveInvariantMonitorVerdictV1 {
  assertPlanningExactKeys(
    value,
    monitorVerdictKeys,
    "invariant monitor verdict"
  );
  if (value.schemaVersion !== 1)
    throw new CollectivePlanningValidationError(
      "invariant monitor verdict schema is invalid"
    );
  assertPlanningDigest(value.registrationDigest, "registrationDigest");
  assertPlanningDigest(value.policyDigest, "policyDigest");
  nullableDigest(value.traceRoot, "traceRoot");
  nullableDigest(value.monitorEventRoot, "monitorEventRoot");
  if (typeof value.missionSuccess !== "boolean")
    throw new CollectivePlanningValidationError(
      "missionSuccess must be boolean"
    );
  for (const key of monitorVerdictKeys.filter(
    (key) =>
      key.endsWith("Violations") ||
      key === "partialSuccessUnits" ||
      key === "objectiveValue"
  ))
    assertPlanningSafeInteger(value[key], key, 0);
  enumValue(
    value.terminalReason,
    new Set([
      "success",
      "terminal_failure",
      "invariant_violation",
      "incomplete",
    ]),
    "terminalReason"
  );
  nullableIdentifier(value.firstViolationEventId, "firstViolationEventId");
  const violationTotal = monitorVerdictKeys
    .filter((key) => key.endsWith("Violations"))
    .reduce((sum, key) => sum + (value[key] as number), 0);
  const terminalReason = value.terminalReason as string;
  if (
    value.missionSuccess !== (terminalReason === "success") ||
    (terminalReason === "success" &&
      (violationTotal !== 0 || value.firstViolationEventId !== null)) ||
    (terminalReason === "invariant_violation" &&
      (violationTotal === 0 || value.firstViolationEventId === null)) ||
    (terminalReason === "terminal_failure" &&
      value.firstViolationEventId === null) ||
    (terminalReason === "incomplete" &&
      (violationTotal !== 0 || value.firstViolationEventId !== null))
  )
    throw new CollectivePlanningValidationError(
      "monitor verdict terminal state is inconsistent"
    );
  assertDigest("invariant-monitor-verdict-v1", value, "verdictDigest");
  return clone(value as unknown as CollectiveInvariantMonitorVerdictV1);
}

export function createCollectiveInvariantMonitorSnapshotV1(
  policyInput: CollectiveInvariantMonitorPolicyV1,
  eventsInput: readonly CollectiveInvariantMonitorEventV1[],
  traceRoot: PlanningDigestV1 | null
): CollectiveInvariantMonitorSnapshotV1 {
  const policy = validateCollectiveInvariantMonitorPolicyV1(policyInput);
  replayCollectiveInvariantMonitorV1(policy, eventsInput, traceRoot);
  const body = {
    format: "agentplat.collective-invariant-monitor.snapshot" as const,
    schemaVersion: 1 as const,
    registrationDigest: policy.registrationDigest,
    policyDigest: policy.policyDigest,
    events: eventsInput.map(validateCollectiveInvariantMonitorEventV1),
    traceRoot,
  };
  return deepFreezePlanning({
    ...body,
    snapshotDigest: digestPlanningJsonV1(
      "invariant-monitor-snapshot-v1",
      body as unknown as JsonValue,
      LARGE_EVALUATION_JSON_LIMITS
    ),
  });
}

export function validateCollectiveInvariantMonitorSnapshotV1(
  value: unknown,
  policyInput: CollectiveInvariantMonitorPolicyV1
): CollectiveInvariantMonitorSnapshotV1 {
  assertPlanningExactKeys(
    value,
    monitorSnapshotKeys,
    "invariant monitor snapshot"
  );
  const expected = createCollectiveInvariantMonitorSnapshotV1(
    policyInput,
    value.events as CollectiveInvariantMonitorEventV1[],
    value.traceRoot as PlanningDigestV1 | null
  );
  if (
    canonicalizePlanningJsonV1(value as JsonValue) !==
    canonicalizePlanningJsonV1(expected as unknown as JsonValue)
  )
    throw new CollectivePlanningValidationError(
      "invariant monitor snapshot does not match replay"
    );
  return expected;
}

export function createCollectiveInvariantMonitorV1(
  policyInput: CollectiveInvariantMonitorPolicyV1,
  maximumEvents = 16_384
): import("./evaluation-contracts.js").CollectiveInvariantMonitorV1 {
  const policy = validateCollectiveInvariantMonitorPolicyV1(policyInput);
  assertPlanningSafeInteger(maximumEvents, "maximumEvents", 1, 262_144);
  let events: CollectiveInvariantMonitorEventV1[] = [];
  const port = Object.create(
    null
  ) as import("./evaluation-contracts.js").CollectiveInvariantMonitorV1;
  Object.defineProperties(port, {
    version: { value: 1, enumerable: true },
    record: {
      enumerable: true,
      value(input: CollectiveInvariantMonitorEventV1): void {
        if (events.length >= maximumEvents)
          throw new CollectivePlanningValidationError(
            "monitor event limit exceeded"
          );
        const event = validateCollectiveInvariantMonitorEventV1(input);
        const previous = events.at(-1)?.monitorEventDigest ?? null;
        if (
          event.registrationDigest !== policy.registrationDigest ||
          event.previousMonitorEventDigest !== previous
        )
          throw new CollectivePlanningValidationError(
            "monitor event is outside the current chain"
          );
        replayCollectiveInvariantMonitorV1(policy, [...events, event], null);
        events = [...events, event];
      },
    },
    finalize: {
      enumerable: true,
      value(
        traceRoot: PlanningDigestV1 | null
      ): CollectiveInvariantMonitorVerdictV1 {
        return replayCollectiveInvariantMonitorV1(policy, events, traceRoot);
      },
    },
    snapshot: {
      enumerable: true,
      value(
        traceRoot: PlanningDigestV1 | null
      ): CollectiveInvariantMonitorSnapshotV1 {
        return createCollectiveInvariantMonitorSnapshotV1(
          policy,
          events,
          traceRoot
        );
      },
    },
    restore: {
      enumerable: true,
      value(input: CollectiveInvariantMonitorSnapshotV1): void {
        const snapshot = validateCollectiveInvariantMonitorSnapshotV1(
          input,
          policy
        );
        if (events.length > snapshot.events.length)
          throw new CollectivePlanningValidationError(
            "monitor snapshot restore may not roll back events"
          );
        for (let index = 0; index < events.length; index += 1)
          if (
            events[index].monitorEventDigest !==
            snapshot.events[index].monitorEventDigest
          )
            throw new CollectivePlanningValidationError(
              "monitor snapshot restore may not rewrite events"
            );
        events = [...snapshot.events];
      },
    },
  });
  return Object.freeze(port);
}

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const c = index + 2 < bytes.length ? bytes[index + 2] : 0;
    result += alphabet[a >> 2];
    result += alphabet[((a & 3) << 4) | (b >> 4)];
    result +=
      index + 1 < bytes.length ? alphabet[((b & 15) << 2) | (c >> 6)] : "=";
    result += index + 2 < bytes.length ? alphabet[c & 63] : "=";
  }
  return result;
}

export function collectiveHiddenCanaryDigestV1(
  hiddenCanary: string
): PlanningDigestV1 {
  if (
    typeof hiddenCanary !== "string" ||
    planningUtf8ByteLengthV1(hiddenCanary) < 8
  )
    throw new CollectivePlanningValidationError(
      "hidden canary must contain at least eight UTF-8 bytes"
    );
  return digestPlanningJsonV1("environment-state-v1", { hiddenCanary });
}

export function scanCollectivePublicArtifactForCanaryV1(
  artifact: CollectivePublicArtifactV1,
  hiddenCanary: string,
  maximumBytes = DEFAULT_COLLECTIVE_EVALUATION_LIMITS_V1.maximumPublicArtifactBytes
): boolean {
  collectiveHiddenCanaryDigestV1(hiddenCanary);
  assertPlanningSafeInteger(maximumBytes, "maximumBytes", 1_024, 67_108_864);
  const canonical = canonicalizePlanningJsonV1(artifact, {
    maximumBytes,
    maximumDepth: 64,
    maximumNodes: 2_000_000,
    maximumKeysPerObject: 4_096,
    maximumItemsPerArray: 262_144,
  });
  const bytes = new TextEncoder().encode(hiddenCanary);
  const hex = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const base64 = bytesToBase64(bytes);
  const base64Url = base64.replace(/\+/gu, "-").replace(/\//gu, "_");
  const escapedCanary = canonicalizePlanningJsonV1(hiddenCanary).slice(1, -1);
  const normalized = canonical.toLowerCase();
  return (
    canonical.includes(hiddenCanary) ||
    canonical.includes(escapedCanary) ||
    normalized.includes(hex) ||
    canonical.includes(base64) ||
    canonical.includes(base64.replace(/=+$/u, "")) ||
    canonical.includes(base64Url) ||
    canonical.includes(base64Url.replace(/=+$/u, ""))
  );
}

export function auditCollectiveEnvironmentPortV1(
  port: unknown
): CollectiveEnvironmentBoundaryAuditV1 {
  const findings: CollectiveEnvironmentBoundaryFindingV1[] = [];
  const expected = [
    "advance",
    "applyEffect",
    "initialize",
    "observe",
    "restore",
    "snapshot",
    "version",
  ];
  if (port === null || typeof port !== "object" || Array.isArray(port)) {
    findings.push({
      schemaVersion: 1,
      code: "runner_port_shape_invalid",
      detail: "runner port must be a frozen object",
    });
  } else {
    const prototype = Object.getPrototypeOf(port);
    const names = Object.getOwnPropertyNames(port).sort();
    const symbols = Object.getOwnPropertySymbols(port);
    if (
      (prototype !== null && prototype !== Object.prototype) ||
      names.length !== expected.length ||
      names.some((name, index) => name !== expected[index]) ||
      symbols.length > 0 ||
      !Object.isFrozen(port)
    )
      findings.push({
        schemaVersion: 1,
        code: "runner_port_shape_invalid",
        detail: "runner port must expose only the registered frozen surface",
      });
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(port, name);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        findings.push({
          schemaVersion: 1,
          code: "runner_port_shape_invalid",
          detail: `runner port member ${name} must be an enumerable data property`,
        });
        continue;
      }
      if (name !== "version" && typeof descriptor.value !== "function")
        findings.push({
          schemaVersion: 1,
          code: "runner_port_shape_invalid",
          detail: `runner port member ${name} must be a function`,
        });
      if (
        name !== "version" &&
        typeof descriptor.value === "function" &&
        (Object.getOwnPropertyNames(descriptor.value).sort().join(",") !==
          "length,name" ||
          Object.getOwnPropertySymbols(descriptor.value).length > 0)
      )
        findings.push({
          schemaVersion: 1,
          code: "runner_port_forbidden_member",
          detail: `runner port function ${name} exposes attached state`,
        });
      if (
        /oracle|hidden|canary|monitor|ledger|truth|membership|direct|assign/iu.test(
          name
        )
      )
        findings.push({
          schemaVersion: 1,
          code: "runner_port_forbidden_member",
          detail: `runner port member ${name} exposes evaluator-only state`,
        });
    }
    const versionDescriptor = Object.getOwnPropertyDescriptor(port, "version");
    if (
      !versionDescriptor ||
      !("value" in versionDescriptor) ||
      versionDescriptor.value !== 1
    )
      findings.push({
        schemaVersion: 1,
        code: "runner_port_shape_invalid",
        detail: "runner port version is invalid",
      });
  }
  return deepFreezePlanning({
    schemaVersion: 1,
    passed: findings.length === 0,
    findings,
  });
}

export interface CreateCollectiveEvaluationBoundaryEvidenceInputV1 {
  readonly registration: CollectiveEvaluationRegistrationBindingV1;
  readonly trace: CollectiveTraceV2;
  readonly monitorPolicy: CollectiveInvariantMonitorPolicyV1;
  readonly monitorEvents: readonly CollectiveInvariantMonitorEventV1[];
  readonly publicArtifacts: readonly CollectivePublicArtifactV1[];
  readonly hiddenCanary: string;
}

export function assertCollectiveMonitorTraceBindingsV1(
  events: readonly CollectiveInvariantMonitorEventV1[],
  trace: CollectiveTraceV2
): void {
  const traceById = new Map(
    trace.events.map((event) => [event.eventId, event])
  );
  for (const event of events) {
    if (event.traceEventId === null) {
      if (
        event.kind === "effect.committed" ||
        event.kind === "observation.delivered" ||
        event.kind === "terminal.failure"
      )
        throw new CollectivePlanningValidationError(
          "monitor event requires a trace witness"
        );
      continue;
    }
    const traceEvent = traceById.get(event.traceEventId);
    if (traceEvent === undefined)
      throw new CollectivePlanningValidationError(
        "monitor event references an unknown trace event"
      );
    if (traceEvent.logicalTimeMs !== event.logicalTimeMs)
      throw new CollectivePlanningValidationError(
        "monitor event logical time does not match its trace event"
      );
    if (
      event.kind === "effect.committed" &&
      traceEvent.kind !== "environment.effect.committed" &&
      !(
        traceEvent.kind === "environment.effect.indeterminate" &&
        traceEvent.reasonCode === "timeout_after_commit"
      )
    )
      throw new CollectivePlanningValidationError(
        "committed monitor event lacks a committed trace witness"
      );
    if (
      event.kind === "observation.delivered" &&
      traceEvent.kind !== "environment.observation.delivered"
    )
      throw new CollectivePlanningValidationError(
        "observation monitor event lacks a delivery trace witness"
      );
    if (
      event.kind === "terminal.failure" &&
      traceEvent.kind !== "monitor.terminal"
    )
      throw new CollectivePlanningValidationError(
        "terminal monitor event lacks a terminal trace witness"
      );
  }
}

export function createCollectiveEvaluationBoundaryEvidenceV1(
  input: CreateCollectiveEvaluationBoundaryEvidenceInputV1
): CollectiveEvaluationBoundaryEvidenceV1 {
  assertPlanningExactKeys(
    input,
    [
      "registration",
      "trace",
      "monitorPolicy",
      "monitorEvents",
      "publicArtifacts",
      "hiddenCanary",
    ],
    "evaluation boundary evidence input"
  );
  const registration = validateCollectiveEvaluationRegistrationBindingV1(
    input.registration
  );
  if (
    collectiveHiddenCanaryDigestV1(input.hiddenCanary) !==
    registration.hiddenCanaryDigest
  )
    throw new CollectivePlanningValidationError(
      "hidden canary is outside its registration binding"
    );
  const trace = validateCollectiveTraceV2(input.trace, registration);
  const monitorPolicy = validateCollectiveInvariantMonitorPolicyV1(
    input.monitorPolicy
  );
  if (
    monitorPolicy.registrationDigest !== registration.registrationDigest ||
    monitorPolicy.hiddenCanaryDigest !== registration.hiddenCanaryDigest ||
    monitorPolicy.policyDigest !== registration.monitorDigest
  )
    throw new CollectivePlanningValidationError(
      "monitor policy is outside its registration binding"
    );
  plainArray(input.monitorEvents, "monitorEvents");
  if (input.monitorEvents.length > registration.limits.maximumMonitorEvents)
    throw new CollectivePlanningValidationError("monitor event limit exceeded");
  const monitorEvents = input.monitorEvents.map(
    validateCollectiveInvariantMonitorEventV1
  );
  assertCollectiveMonitorTraceBindingsV1(monitorEvents, trace);
  plainArray(input.publicArtifacts, "publicArtifacts");
  if (
    input.publicArtifacts.some((artifact) =>
      scanCollectivePublicArtifactForCanaryV1(
        artifact,
        input.hiddenCanary,
        registration.limits.maximumPublicArtifactBytes
      )
    )
  )
    throw new CollectivePlanningValidationError(
      "hidden canary leaked into a public artifact"
    );
  const monitorVerdict = replayCollectiveInvariantMonitorV1(
    monitorPolicy,
    monitorEvents,
    trace.traceRoot
  );
  const publicArtifactDigests = input.publicArtifacts.map((artifact) =>
    digestPlanningJsonV1("evaluation-public-artifact-v1", artifact)
  );
  const body = {
    format: "agentplat.collective-evaluation.boundary-evidence" as const,
    schemaVersion: 1 as const,
    registration,
    trace,
    monitorPolicy,
    monitorEvents,
    monitorVerdict,
    publicArtifactDigests,
  };
  return deepFreezePlanning({
    ...body,
    evidenceDigest: digestPlanningJsonV1(
      "evaluation-boundary-evidence-v1",
      body as unknown as JsonValue,
      {
        maximumBytes: registration.limits.maximumTraceBytes,
        maximumDepth: 64,
        maximumNodes: 2_000_000,
        maximumKeysPerObject: 4_096,
        maximumItemsPerArray: 262_144,
      }
    ),
  });
}

export function validateCollectiveEvaluationBoundaryEvidenceV1(
  value: unknown,
  hiddenCanary: string
): CollectiveEvaluationBoundaryEvidenceV1 {
  assertPlanningExactKeys(
    value,
    [
      "format",
      "schemaVersion",
      "registration",
      "trace",
      "monitorPolicy",
      "monitorEvents",
      "monitorVerdict",
      "publicArtifactDigests",
      "evidenceDigest",
    ],
    "evaluation boundary evidence"
  );
  if (
    value.format !== "agentplat.collective-evaluation.boundary-evidence" ||
    value.schemaVersion !== 1
  )
    throw new CollectivePlanningValidationError(
      "evaluation boundary evidence format is invalid"
    );
  const registration = validateCollectiveEvaluationRegistrationBindingV1(
    value.registration
  );
  if (
    collectiveHiddenCanaryDigestV1(hiddenCanary) !==
    registration.hiddenCanaryDigest
  )
    throw new CollectivePlanningValidationError(
      "hidden canary is outside its registration binding"
    );
  const trace = validateCollectiveTraceV2(value.trace, registration);
  const policy = validateCollectiveInvariantMonitorPolicyV1(
    value.monitorPolicy
  );
  if (
    policy.registrationDigest !== registration.registrationDigest ||
    policy.hiddenCanaryDigest !== registration.hiddenCanaryDigest ||
    policy.policyDigest !== registration.monitorDigest
  )
    throw new CollectivePlanningValidationError(
      "monitor policy is outside its registration binding"
    );
  plainArray(value.monitorEvents, "monitorEvents");
  if (value.monitorEvents.length > registration.limits.maximumMonitorEvents)
    throw new CollectivePlanningValidationError("monitor event limit exceeded");
  const events = value.monitorEvents.map(
    validateCollectiveInvariantMonitorEventV1
  );
  assertCollectiveMonitorTraceBindingsV1(events, trace);
  const verdict = replayCollectiveInvariantMonitorV1(
    policy,
    events,
    trace.traceRoot
  );
  if (
    canonicalizePlanningJsonV1(verdict as unknown as JsonValue) !==
    canonicalizePlanningJsonV1(value.monitorVerdict as JsonValue)
  )
    throw new CollectivePlanningValidationError(
      "monitor verdict does not match event replay"
    );
  plainArray(value.publicArtifactDigests, "publicArtifactDigests");
  for (const digest of value.publicArtifactDigests)
    assertPlanningDigest(digest, "publicArtifactDigest");
  if (
    scanCollectivePublicArtifactForCanaryV1(
      value as unknown as PlanningJson,
      hiddenCanary,
      registration.limits.maximumTraceBytes
    )
  )
    throw new CollectivePlanningValidationError(
      "hidden canary leaked into boundary evidence"
    );
  const evidenceBody = { ...value };
  delete evidenceBody.evidenceDigest;
  assertPlanningDigest(value.evidenceDigest, "evidenceDigest");
  if (
    digestPlanningJsonV1(
      "evaluation-boundary-evidence-v1",
      evidenceBody as JsonValue,
      {
        ...LARGE_EVALUATION_JSON_LIMITS,
        maximumBytes: registration.limits.maximumTraceBytes,
      }
    ) !== value.evidenceDigest
  )
    throw new CollectivePlanningValidationError(
      "evidenceDigest does not match canonical content"
    );
  return clone(value as unknown as CollectiveEvaluationBoundaryEvidenceV1);
}

export function assertCollectiveEnvironmentPortV1(
  port: unknown
): asserts port is CollectiveEnvironmentPortV1 {
  const audit = auditCollectiveEnvironmentPortV1(port);
  if (!audit.passed)
    throw new CollectivePlanningValidationError(
      audit.findings.map((finding) => finding.detail).join("; ")
    );
}

export * from "./evaluation-campaign.js";
export * from "./evaluation-campaign-readiness.js";
export * from "./evaluation-execution.js";
export * from "./evaluation-normative-operation.js";
