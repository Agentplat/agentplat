import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { PortableAgentModalityV1 } from "@agentplat/runtime/adapter";

import {
  AUTONOMOUS_MISSION_LOOP_SCHEMA_VERSION_V1,
  AUTONOMOUS_MISSION_LOOP_STATE_FORMAT_V1,
  type AutonomousMissionLoopOperationV1,
  type AutonomousMissionLoopPolicyV1,
  type AutonomousMissionLoopScopeV1,
  type AutonomousMissionLoopStateV1,
} from "./autonomous-mission-loop-contracts.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;
const ACTIONS = new Set(["transport", "plan", "execute", "wait"]);
const STATUSES = new Set(["prepared", "applied", "deferred", "failed"]);
const MODALITIES = new Set<PortableAgentModalityV1>([
  "text",
  "image",
  "audio",
  "video",
  "structured",
  "sensor",
  "action",
]);

export function autonomousMissionLoopDigestV1(
  domain: string,
  value: unknown,
): PlanningDigestV1 {
  return digestPlanningJsonV1("collective-planning-snapshot", {
    domain,
    value,
  } as PlanningJson);
}

export function createAutonomousMissionLoopScopeV1(
  input: Omit<AutonomousMissionLoopScopeV1, "scopeDigest">,
): AutonomousMissionLoopScopeV1 {
  const body = freeze({
    tenantId: id(input.tenantId, "scope.tenantId"),
    meshId: id(input.meshId, "scope.meshId"),
    peerId: id(input.peerId, "scope.peerId"),
    instanceId: id(input.instanceId, "scope.instanceId"),
    missionIntentId: id(input.missionIntentId, "scope.missionIntentId"),
  });
  return freeze({
    ...body,
    scopeDigest: autonomousMissionLoopDigestV1("autonomous-loop-scope", body),
  });
}

export function validateAutonomousMissionLoopScopeV1(
  input: AutonomousMissionLoopScopeV1,
): AutonomousMissionLoopScopeV1 {
  exact(
    input,
    [
      "instanceId",
      "meshId",
      "missionIntentId",
      "peerId",
      "scopeDigest",
      "tenantId",
    ],
    "autonomous loop scope",
  );
  const { scopeDigest, ...body } = input;
  const rebuilt = createAutonomousMissionLoopScopeV1(body);
  if (sha(scopeDigest, "scope.scopeDigest") !== rebuilt.scopeDigest)
    fail("autonomous loop scope digest is invalid");
  return rebuilt;
}

export function validateAutonomousMissionLoopPolicyV1(
  input: AutonomousMissionLoopPolicyV1,
): AutonomousMissionLoopPolicyV1 {
  exact(
    input,
    [
      "executionRetryDelayMs",
      "idleDelayMs",
      "maximumCommitAttempts",
      "maximumCyclesPerRun",
      "maximumRetainedOperations",
      "planWhenIdle",
      "planningAgentIds",
      "planningCooldownMs",
      "policyDigest",
      "policyId",
      "policyVersion",
      "requestedOutputModalities",
      "schemaVersion",
    ],
    "autonomous loop policy",
  );
  if (input.schemaVersion !== AUTONOMOUS_MISSION_LOOP_SCHEMA_VERSION_V1)
    fail("autonomous loop policy schema is invalid");
  if (!Array.isArray(input.planningAgentIds))
    fail("autonomous loop planning agents are invalid");
  const agents = input.planningAgentIds.map((value) =>
    id(value, "policy planning agent"),
  );
  if (
    agents.length < 1 ||
    agents.length > 256 ||
    new Set(agents).size !== agents.length
  )
    fail("autonomous loop planning agents are invalid");
  if (typeof input.planWhenIdle !== "boolean")
    fail("autonomous loop planWhenIdle is invalid");
  if (!Array.isArray(input.requestedOutputModalities))
    fail("autonomous loop output modalities are invalid");
  const modalities = input.requestedOutputModalities.map((value) => {
    const modality = token(value, "policy output modality", 64);
    if (!MODALITIES.has(modality as PortableAgentModalityV1))
      fail("autonomous loop output modality is unsupported");
    return modality as PortableAgentModalityV1;
  });
  if (modalities.length < 1 || modalities.length > 16)
    fail("autonomous loop output modalities are invalid");
  const body = freeze({
    schemaVersion: 1 as const,
    policyId: id(input.policyId, "policy.policyId"),
    policyVersion: positive(input.policyVersion, "policy.policyVersion", 1_000_000),
    planningAgentIds: freeze(agents),
    planWhenIdle: input.planWhenIdle,
    planningCooldownMs: nonNegative(
      input.planningCooldownMs,
      "policy.planningCooldownMs",
      86_400_000,
    ),
    executionRetryDelayMs: nonNegative(
      input.executionRetryDelayMs,
      "policy.executionRetryDelayMs",
      86_400_000,
    ),
    idleDelayMs: positive(input.idleDelayMs, "policy.idleDelayMs", 60_000),
    maximumCyclesPerRun: positive(
      input.maximumCyclesPerRun,
      "policy.maximumCyclesPerRun",
      10_000,
    ),
    maximumCommitAttempts: positive(
      input.maximumCommitAttempts,
      "policy.maximumCommitAttempts",
      64,
    ),
    maximumRetainedOperations: positive(
      input.maximumRetainedOperations,
      "policy.maximumRetainedOperations",
      65_536,
    ),
    requestedOutputModalities: freeze(modalities),
  });
  const digest = autonomousMissionLoopDigestV1("autonomous-loop-policy", body);
  if (sha(input.policyDigest, "policy.policyDigest") !== digest)
    fail("autonomous loop policy digest is invalid");
  return freeze({ ...body, policyDigest: digest });
}

export function createAutonomousMissionLoopPolicyV1(
  input: Omit<AutonomousMissionLoopPolicyV1, "policyDigest">,
): AutonomousMissionLoopPolicyV1 {
  const body = { ...input } as AutonomousMissionLoopPolicyV1;
  return validateAutonomousMissionLoopPolicyV1({
    ...body,
    policyDigest: autonomousMissionLoopDigestV1("autonomous-loop-policy", body),
  });
}

export function createAutonomousMissionLoopOperationV1(
  input: Omit<AutonomousMissionLoopOperationV1, "operationDigest">,
): AutonomousMissionLoopOperationV1 {
  const body = normalizeOperation(input);
  return freeze({
    ...body,
    operationDigest: autonomousMissionLoopDigestV1(
      "autonomous-loop-operation",
      body,
    ),
  });
}

export function validateAutonomousMissionLoopOperationV1(
  input: AutonomousMissionLoopOperationV1,
): AutonomousMissionLoopOperationV1 {
  exact(
    input,
    [
      "action",
      "agentId",
      "assignmentAuthorityId",
      "assignmentEpoch",
      "completedAtLogicalMs",
      "materialDigest",
      "operationDigest",
      "operationId",
      "preparedAtLogicalMs",
      "reasonCode",
      "resultDigest",
      "sequence",
      "status",
      "stepId",
      "workItemId",
    ],
    "autonomous loop operation",
  );
  const { operationDigest, ...body } = input;
  const rebuilt = createAutonomousMissionLoopOperationV1(body);
  if (sha(operationDigest, "operation.operationDigest") !== rebuilt.operationDigest)
    fail("autonomous loop operation digest is invalid");
  return rebuilt;
}

export function createAutonomousMissionLoopStateV1(input: {
  readonly stateKey: string;
  readonly scope: AutonomousMissionLoopScopeV1;
  readonly policyDigest: PlanningDigestV1;
  readonly revision?: number;
  readonly logicalTimeHighWaterMs: number;
  readonly cycleSequence?: number;
  readonly operationSequence?: number;
  readonly planningCursor?: number;
  readonly nextPlanningAtLogicalMs?: number;
  readonly nextExecutionAtLogicalMs?: number;
  readonly pendingOperation?: AutonomousMissionLoopOperationV1 | null;
  readonly recentOperations?: readonly AutonomousMissionLoopOperationV1[];
  readonly predecessorStateDigest?: PlanningDigestV1 | null;
}): AutonomousMissionLoopStateV1 {
  const body = {
    format: AUTONOMOUS_MISSION_LOOP_STATE_FORMAT_V1,
    schemaVersion: 1 as const,
    stateKey: id(input.stateKey, "state.stateKey"),
    scope: validateAutonomousMissionLoopScopeV1(input.scope),
    policyDigest: sha(input.policyDigest, "state.policyDigest"),
    revision: nonNegative(input.revision ?? 0, "state.revision"),
    logicalTimeHighWaterMs: nonNegative(
      input.logicalTimeHighWaterMs,
      "state.logicalTimeHighWaterMs",
    ),
    cycleSequence: nonNegative(input.cycleSequence ?? 0, "state.cycleSequence"),
    operationSequence: nonNegative(
      input.operationSequence ?? 0,
      "state.operationSequence",
    ),
    planningCursor: nonNegative(input.planningCursor ?? 0, "state.planningCursor"),
    nextPlanningAtLogicalMs: nonNegative(
      input.nextPlanningAtLogicalMs ?? input.logicalTimeHighWaterMs,
      "state.nextPlanningAtLogicalMs",
    ),
    nextExecutionAtLogicalMs: nonNegative(
      input.nextExecutionAtLogicalMs ?? input.logicalTimeHighWaterMs,
      "state.nextExecutionAtLogicalMs",
    ),
    pendingOperation: input.pendingOperation
      ? validateAutonomousMissionLoopOperationV1(input.pendingOperation)
      : null,
    recentOperations: freeze(
      (input.recentOperations ?? []).map(
        validateAutonomousMissionLoopOperationV1,
      ),
    ),
    predecessorStateDigest: input.predecessorStateDigest
      ? sha(input.predecessorStateDigest, "state.predecessorStateDigest")
      : null,
  };
  return freeze({
    ...body,
    stateDigest: autonomousMissionLoopDigestV1("autonomous-loop-state", body),
  });
}

export function validateAutonomousMissionLoopStateV1(
  input: AutonomousMissionLoopStateV1,
  policy: AutonomousMissionLoopPolicyV1,
): AutonomousMissionLoopStateV1 {
  exact(
    input,
    [
      "cycleSequence",
      "format",
      "logicalTimeHighWaterMs",
      "nextExecutionAtLogicalMs",
      "nextPlanningAtLogicalMs",
      "operationSequence",
      "pendingOperation",
      "planningCursor",
      "policyDigest",
      "predecessorStateDigest",
      "recentOperations",
      "revision",
      "schemaVersion",
      "scope",
      "stateDigest",
      "stateKey",
    ],
    "autonomous loop state",
  );
  if (
    input.format !== AUTONOMOUS_MISSION_LOOP_STATE_FORMAT_V1 ||
    input.schemaVersion !== AUTONOMOUS_MISSION_LOOP_SCHEMA_VERSION_V1 ||
    input.policyDigest !== policy.policyDigest ||
    !Array.isArray(input.recentOperations) ||
    input.recentOperations.length > policy.maximumRetainedOperations
  )
    fail("autonomous loop state binding is invalid");
  const { stateDigest, ...body } = input;
  const rebuilt = createAutonomousMissionLoopStateV1(body);
  if (sha(stateDigest, "state.stateDigest") !== rebuilt.stateDigest)
    fail("autonomous loop state digest is invalid");
  if (
    rebuilt.pendingOperation &&
    rebuilt.pendingOperation.status !== "prepared"
  )
    fail("autonomous loop pending operation is not prepared");
  return rebuilt;
}

function normalizeOperation(
  input: Omit<AutonomousMissionLoopOperationV1, "operationDigest">,
) {
  if (!ACTIONS.has(input.action) || !STATUSES.has(input.status))
    fail("autonomous loop operation action or status is invalid");
  const prepared = nonNegative(
    input.preparedAtLogicalMs,
    "operation.preparedAtLogicalMs",
  );
  const completed = nullableNonNegative(
    input.completedAtLogicalMs,
    "operation.completedAtLogicalMs",
  );
  if (
    (input.status === "prepared" && completed !== null) ||
    (input.status !== "prepared" && completed === null) ||
    (completed !== null && completed < prepared)
  )
    fail("autonomous loop operation completion is invalid");
  const body = {
    operationId: id(input.operationId, "operation.operationId"),
    sequence: positive(input.sequence, "operation.sequence"),
    action: input.action,
    agentId: nullableId(input.agentId, "operation.agentId"),
    workItemId: nullableId(input.workItemId, "operation.workItemId"),
    assignmentAuthorityId: nullableId(
      input.assignmentAuthorityId,
      "operation.assignmentAuthorityId",
    ),
    assignmentEpoch: nullablePositive(
      input.assignmentEpoch,
      "operation.assignmentEpoch",
    ),
    stepId: nullableId(input.stepId, "operation.stepId"),
    materialDigest: nullableSha(
      input.materialDigest,
      "operation.materialDigest",
    ),
    preparedAtLogicalMs: prepared,
    completedAtLogicalMs: completed,
    status: input.status,
    reasonCode: token(input.reasonCode, "operation.reasonCode", 256),
    resultDigest: nullableSha(input.resultDigest, "operation.resultDigest"),
  };
  if (body.action === "plan" && !body.agentId)
    fail("autonomous loop plan operation has no agent");
  if (
    body.action === "execute" &&
    (!body.workItemId ||
      !body.assignmentAuthorityId ||
      body.assignmentEpoch === null ||
      !body.stepId)
  )
    fail("autonomous loop execute operation binding is incomplete");
  return freeze(body);
}

function exact(value: unknown, keys: readonly string[], label: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} is invalid`);
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i]))
    fail(`${label} has invalid keys`);
}
function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !ID.test(value)) fail(`${label} is invalid`);
  return value;
}
function nullableId(value: unknown, label: string): string | null {
  return value === null ? null : id(value, label);
}
function sha(value: unknown, label: string): PlanningDigestV1 {
  if (typeof value !== "string" || !SHA.test(value)) fail(`${label} is invalid`);
  return value as PlanningDigestV1;
}
function nullableSha(value: unknown, label: string): PlanningDigestV1 | null {
  return value === null ? null : sha(value, label);
}
function nonNegative(value: unknown, label: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum)
    fail(`${label} is invalid`);
  return value as number;
}
function positive(value: unknown, label: string, maximum = Number.MAX_SAFE_INTEGER): number {
  const result = nonNegative(value, label, maximum);
  if (result < 1) fail(`${label} is invalid`);
  return result;
}
function nullablePositive(value: unknown, label: string): number | null {
  return value === null ? null : positive(value, label);
}
function nullableNonNegative(value: unknown, label: string): number | null {
  return value === null ? null : nonNegative(value, label);
}
function token(value: unknown, label: string, maximum: number): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    fail(`${label} is invalid`);
  return value;
}
function fail(message: string): never {
  throw new TypeError(message);
}
function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
