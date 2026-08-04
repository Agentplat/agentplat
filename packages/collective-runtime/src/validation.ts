import type { JsonValue, Metadata } from '@agentplat/core';

import type {
  CollectiveAgentDescriptor,
  CollectiveAgentRegistration,
  CollectiveExecutionSnapshot,
  CollectiveObjective,
  CollectivePlan,
  CollectivePolicies,
  CollectivePolicyLimits,
  CollectiveWorkItem,
} from './contracts.js';
import { CollectiveRuntimeError } from './errors.js';

const DEFAULT_POLICY_LIMITS: CollectivePolicyLimits = Object.freeze({
  maximumWorkItems: 128,
  maximumAttemptsPerWorkItem: 3,
  maximumConcurrentWorkItems: 4,
  maximumResultBytes: 1_048_576,
});

const EXECUTION_STATUSES = new Set([
  'running',
  'paused',
  'completed',
  'failed',
  'canceled',
]);
const WORK_STATUSES = new Set([
  'pending',
  'running',
  'completed',
  'failed',
  'canceled',
]);
const ATTEMPT_STATUSES = new Set(['running', 'completed', 'failed']);
const EVENT_TYPES = new Set([
  'execution.started',
  'execution.resumed',
  'execution.paused',
  'execution.completed',
  'execution.failed',
  'execution.canceled',
  'work.assigned',
  'work.attempt_failed',
  'work.replanned',
  'work.completed',
  'work.failed',
]);

export function requiredIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length > 256 ||
    value.trim() !== value ||
    value.length === 0 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new CollectiveRuntimeError(
      'VALIDATION_ERROR',
      `${label} must be a non-empty identifier`
    );
  }
  return value;
}

export function requiredText(
  value: unknown,
  label: string,
  maximum = 8_192
): string {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > maximum ||
    /\u0000/u.test(value)
  ) {
    throw new CollectiveRuntimeError(
      'VALIDATION_ERROR',
      `${label} must be non-empty bounded text`
    );
  }
  return value;
}

export function normalizedTokens(
  value: unknown,
  label: string,
  maximum = 128
): readonly string[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new CollectiveRuntimeError(
      'VALIDATION_ERROR',
      `${label} must be a bounded array`
    );
  }
  const result = value.map((item, index) =>
    requiredIdentifier(item, `${label}[${index}]`)
  );
  return Object.freeze([...new Set(result)].sort(compareAscii));
}

export function normalizeObjective(
  value: CollectiveObjective
): CollectiveObjective {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CollectiveRuntimeError(
      'VALIDATION_ERROR',
      'objective must be an object'
    );
  }
  const objectiveId = requiredIdentifier(value.objectiveId, 'objectiveId');
  const summary = requiredText(value.summary, 'objective.summary');
  const successCriteria =
    value.successCriteria === undefined
      ? undefined
      : normalizedTextArray(value.successCriteria, 'objective.successCriteria');
  const input =
    value.input === undefined
      ? undefined
      : normalizeJson(value.input, 'objective.input');
  return deepFreeze({
    objectiveId,
    summary,
    ...(input === undefined ? {} : { input }),
    ...(successCriteria === undefined ? {} : { successCriteria }),
  });
}

export function normalizePlan(
  value: CollectivePlan,
  limits: CollectivePolicyLimits
): CollectivePlan {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Array.isArray(value.workItems) ||
    value.workItems.length === 0 ||
    value.workItems.length > limits.maximumWorkItems
  ) {
    throw new CollectiveRuntimeError(
      'VALIDATION_ERROR',
      'plan.workItems must be a non-empty bounded array'
    );
  }
  const workItems = value.workItems.map(normalizeWorkItem);
  const byId = new Map<string, CollectiveWorkItem>();
  for (const workItem of workItems) {
    if (byId.has(workItem.workItemId)) {
      throw new CollectiveRuntimeError(
        'VALIDATION_ERROR',
        `plan contains duplicate work item "${workItem.workItemId}"`
      );
    }
    byId.set(workItem.workItemId, workItem);
  }
  for (const workItem of workItems) {
    for (const dependency of workItem.dependsOn ?? []) {
      if (!byId.has(dependency)) {
        throw new CollectiveRuntimeError(
          'VALIDATION_ERROR',
          `work item "${workItem.workItemId}" depends on unknown work item "${dependency}"`
        );
      }
    }
  }
  assertAcyclic(workItems, byId);
  return deepFreeze({ workItems: [...workItems].sort(workItemOrder) });
}

export function normalizePolicies(value: CollectivePolicies | undefined): {
  limits: CollectivePolicyLimits;
  policies: CollectivePolicies;
  policyId: string;
} {
  const policies = value ?? {};
  const hasCallbacks =
    policies.authorizeAssignment !== undefined ||
    policies.authorizeResult !== undefined;
  if (hasCallbacks && policies.policyId === undefined) {
    throw new CollectiveRuntimeError(
      'VALIDATION_ERROR',
      'policies.policyId is required when policy callbacks are configured'
    );
  }
  const policyId =
    policies.policyId === undefined
      ? 'collective-runtime-default-policy-v1'
      : requiredIdentifier(policies.policyId, 'policies.policyId');
  const limits: CollectivePolicyLimits = Object.freeze({
    maximumWorkItems: positiveInteger(
      policies.maximumWorkItems ?? DEFAULT_POLICY_LIMITS.maximumWorkItems,
      'policies.maximumWorkItems',
      10_000
    ),
    maximumAttemptsPerWorkItem: positiveInteger(
      policies.maximumAttemptsPerWorkItem ??
        DEFAULT_POLICY_LIMITS.maximumAttemptsPerWorkItem,
      'policies.maximumAttemptsPerWorkItem',
      100
    ),
    maximumConcurrentWorkItems: positiveInteger(
      policies.maximumConcurrentWorkItems ??
        DEFAULT_POLICY_LIMITS.maximumConcurrentWorkItems,
      'policies.maximumConcurrentWorkItems',
      1_000
    ),
    maximumResultBytes: positiveInteger(
      policies.maximumResultBytes ?? DEFAULT_POLICY_LIMITS.maximumResultBytes,
      'policies.maximumResultBytes',
      67_108_864
    ),
  });
  for (const [name, policy] of [
    ['authorizeAssignment', policies.authorizeAssignment],
    ['authorizeResult', policies.authorizeResult],
  ] as const) {
    if (policy !== undefined && typeof policy !== 'function') {
      throw new CollectiveRuntimeError(
        'VALIDATION_ERROR',
        `policies.${name} must be a function`
      );
    }
  }
  return { limits, policies, policyId };
}

export function normalizeAgentRegistration(
  value: CollectiveAgentRegistration,
  tenantId: string
): {
  registration: CollectiveAgentRegistration;
  descriptor: CollectiveAgentDescriptor;
} {
  if (!value || typeof value !== 'object' || !value.agent) {
    throw new CollectiveRuntimeError(
      'VALIDATION_ERROR',
      'agent registration is required'
    );
  }
  const agentId = requiredIdentifier(value.agent.id, 'agent.id');
  const agentTenantId = requiredIdentifier(
    value.agent.tenantId,
    'agent.tenantId'
  );
  if (agentTenantId !== tenantId) {
    throw new CollectiveRuntimeError(
      'VALIDATION_ERROR',
      `agent "${agentId}" belongs to a different tenant`
    );
  }
  const name = requiredText(value.agent.name, 'agent.name', 512);
  const platform = requiredIdentifier(value.agent.platform, 'agent.platform');
  const capabilityKeys = normalizedTokens(
    value.capabilityKeys,
    'capabilityKeys'
  );
  const roleKeys = normalizedTokens(value.roleKeys ?? [], 'roleKeys');
  const priority = integer(
    value.priority ?? 0,
    'priority',
    -1_000_000,
    1_000_000
  );
  const descriptor = deepFreeze({
    agentId,
    name,
    platform,
    capabilityKeys,
    roleKeys,
    priority,
  });
  return {
    registration: { ...value, capabilityKeys, roleKeys, priority },
    descriptor,
  };
}

export function normalizeMetadata(
  value: Metadata | undefined,
  label: string
): Metadata | undefined {
  if (value === undefined) return undefined;
  const normalized = normalizeJson(value, label);
  if (
    !normalized ||
    typeof normalized !== 'object' ||
    Array.isArray(normalized)
  ) {
    throw new CollectiveRuntimeError(
      'VALIDATION_ERROR',
      `${label} must be an object`
    );
  }
  return normalized as Metadata;
}

export function normalizeJson(value: JsonValue, label: string): JsonValue {
  let nodes = 0;
  const visit = (input: unknown, path: string, depth: number): JsonValue => {
    nodes += 1;
    if (nodes > 100_000 || depth > 32) {
      throw new CollectiveRuntimeError(
        'VALIDATION_ERROR',
        `${label} exceeds JSON limits`
      );
    }
    if (
      input === null ||
      typeof input === 'string' ||
      typeof input === 'boolean'
    ) {
      return input;
    }
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) {
        throw new CollectiveRuntimeError(
          'VALIDATION_ERROR',
          `${path} must be a finite number`
        );
      }
      return input;
    }
    if (Array.isArray(input)) {
      if (input.length > 100_000) {
        throw new CollectiveRuntimeError(
          'VALIDATION_ERROR',
          `${path} is too large`
        );
      }
      return input.map((item, index) =>
        visit(item, `${path}[${index}]`, depth + 1)
      );
    }
    if (!input || typeof input !== 'object') {
      throw new CollectiveRuntimeError(
        'VALIDATION_ERROR',
        `${path} must contain JSON data`
      );
    }
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CollectiveRuntimeError(
        'VALIDATION_ERROR',
        `${path} must be a plain object`
      );
    }
    if (Object.getOwnPropertySymbols(input).length > 0) {
      throw new CollectiveRuntimeError(
        'VALIDATION_ERROR',
        `${path} may not contain symbol keys`
      );
    }
    const output: Record<string, JsonValue> = Object.create(null);
    const keys = Object.getOwnPropertyNames(input).sort(compareAscii);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
        throw new CollectiveRuntimeError(
          'VALIDATION_ERROR',
          `${path}.${key} must be enumerable data`
        );
      }
      output[key] = visit(descriptor.value, `${path}.${key}`, depth + 1);
    }
    return output;
  };
  return deepFreeze(visit(value, label, 0));
}

export function jsonByteLength(value: JsonValue): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function cloneAndFreeze<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

export function assertStoredSnapshot(
  value: CollectiveExecutionSnapshot,
  binding: {
    collectiveId: string;
    tenantId: string;
    objectiveId: string;
    policyId: string;
    executionId?: string;
  }
): void {
  try {
    assertStoredSnapshotValue(value, binding);
  } catch (error) {
    if (
      error instanceof CollectiveRuntimeError &&
      error.code === 'STATE_INVALID'
    ) {
      throw error;
    }
    throw new CollectiveRuntimeError(
      'STATE_INVALID',
      'stored execution state is invalid'
    );
  }
}

function assertStoredSnapshotValue(
  value: CollectiveExecutionSnapshot,
  binding: {
    collectiveId: string;
    tenantId: string;
    objectiveId: string;
    policyId: string;
    executionId?: string;
  }
): void {
  if (
    !isPlainRecord(value) ||
    value.schemaVersion !== 1 ||
    !isPlainRecord(value.objective) ||
    !isPlainRecord(value.plan) ||
    !isPlainRecord(value.policyLimits)
  ) {
    throw new CollectiveRuntimeError(
      'STATE_INVALID',
      'stored execution is invalid'
    );
  }
  requiredIdentifier(value.collectiveId, 'stored.collectiveId');
  requiredIdentifier(value.tenantId, 'stored.tenantId');
  requiredIdentifier(value.executionId, 'stored.executionId');
  requiredIdentifier(value.policyId, 'stored.policyId');
  const objective = normalizeObjective(value.objective);
  if (
    value.collectiveId !== binding.collectiveId ||
    value.tenantId !== binding.tenantId ||
    objective.objectiveId !== binding.objectiveId ||
    value.policyId !== binding.policyId ||
    (binding.executionId !== undefined &&
      value.executionId !== binding.executionId)
  ) {
    throw new CollectiveRuntimeError(
      'STATE_INVALID',
      'stored execution binding does not match this collective'
    );
  }
  const policyLimits = normalizePolicies({
    maximumWorkItems: value.policyLimits.maximumWorkItems,
    maximumAttemptsPerWorkItem: value.policyLimits.maximumAttemptsPerWorkItem,
    maximumConcurrentWorkItems: value.policyLimits.maximumConcurrentWorkItems,
    maximumResultBytes: value.policyLimits.maximumResultBytes,
  }).limits;
  if (!sameJson(value.policyLimits, policyLimits)) {
    throw new CollectiveRuntimeError(
      'STATE_INVALID',
      'stored policy limits are invalid'
    );
  }
  const plan = normalizePlan(value.plan, policyLimits);
  if (!sameJson(value.objective, objective) || !sameJson(value.plan, plan)) {
    throw new CollectiveRuntimeError(
      'STATE_INVALID',
      'stored objective or plan is not normalized'
    );
  }
  if (
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !EXECUTION_STATUSES.has(value.status) ||
    !Array.isArray(value.workItems) ||
    !Array.isArray(value.events) ||
    value.workItems.length !== value.plan.workItems.length
  ) {
    throw new CollectiveRuntimeError(
      'STATE_INVALID',
      'stored execution state is invalid'
    );
  }
  requiredTimestamp(value.createdAt, 'stored.createdAt');
  requiredTimestamp(value.updatedAt, 'stored.updatedAt');
  if (value.metadata !== undefined)
    normalizeMetadata(value.metadata, 'stored.metadata');
  if (value.failure !== undefined)
    assertFailure(value.failure, 'stored.failure');
  if (value.completedAt !== undefined)
    requiredTimestamp(value.completedAt, 'stored.completedAt');

  const planIds = plan.workItems.map(({ workItemId }) => workItemId);
  const stateIds = value.workItems.map(({ workItem }) => workItem.workItemId);
  if (JSON.stringify(planIds) !== JSON.stringify(stateIds)) {
    throw new CollectiveRuntimeError(
      'STATE_INVALID',
      'stored work plan is inconsistent'
    );
  }
  let runningWorkItems = 0;
  for (let workIndex = 0; workIndex < value.workItems.length; workIndex += 1) {
    const work = value.workItems[workIndex]!;
    const plannedWork = plan.workItems[workIndex]!;
    if (
      !isPlainRecord(work) ||
      !sameJson(work.workItem, plannedWork) ||
      typeof work.status !== 'string' ||
      !WORK_STATUSES.has(work.status) ||
      !Array.isArray(work.attempts) ||
      work.attempts.length > policyLimits.maximumAttemptsPerWorkItem
    ) {
      throw new CollectiveRuntimeError(
        'STATE_INVALID',
        'stored work state is invalid'
      );
    }
    if (work.failure !== undefined)
      assertFailure(work.failure, 'stored.work.failure');
    if (work.completedAt !== undefined)
      requiredTimestamp(work.completedAt, 'stored.work.completedAt');
    if (work.result !== undefined) {
      if (!isPlainRecord(work.result)) {
        throw new CollectiveRuntimeError(
          'STATE_INVALID',
          'stored work result is invalid'
        );
      }
      normalizeJson(work.result as unknown as JsonValue, 'stored.work.result');
      if (
        jsonByteLength(work.result as unknown as JsonValue) >
        policyLimits.maximumResultBytes
      ) {
        throw new CollectiveRuntimeError(
          'STATE_INVALID',
          'stored work result exceeds its policy limit'
        );
      }
    }
    let runningAttempts = 0;
    for (let index = 0; index < work.attempts.length; index += 1) {
      const attempt = work.attempts[index]!;
      if (
        !isPlainRecord(attempt) ||
        attempt.attemptNumber !== index + 1 ||
        typeof attempt.status !== 'string' ||
        !ATTEMPT_STATUSES.has(attempt.status) ||
        requiredIdentifier(attempt.attemptId, 'stored.attempt.attemptId') !==
          `${value.executionId}:work:${plannedWork.workItemId}:attempt:${index + 1}`
      ) {
        throw new CollectiveRuntimeError(
          'STATE_INVALID',
          'stored attempt sequence is invalid'
        );
      }
      requiredIdentifier(attempt.agentId, 'stored.attempt.agentId');
      requiredTimestamp(attempt.startedAt, 'stored.attempt.startedAt');
      if (attempt.completedAt !== undefined)
        requiredTimestamp(attempt.completedAt, 'stored.attempt.completedAt');
      if (attempt.failure !== undefined)
        assertFailure(attempt.failure, 'stored.attempt.failure');
      if (attempt.status === 'running') runningAttempts += 1;
      if (
        (attempt.status === 'running' &&
          (index !== work.attempts.length - 1 ||
            attempt.completedAt !== undefined ||
            attempt.failure !== undefined)) ||
        (attempt.status === 'completed' &&
          (index !== work.attempts.length - 1 ||
            attempt.completedAt === undefined ||
            attempt.failure !== undefined)) ||
        (attempt.status === 'failed' &&
          (attempt.completedAt === undefined || attempt.failure === undefined))
      ) {
        throw new CollectiveRuntimeError(
          'STATE_INVALID',
          'stored attempt status is inconsistent'
        );
      }
    }
    if (
      runningAttempts > 1 ||
      (work.status === 'pending' && runningAttempts !== 0) ||
      (work.status === 'running' && runningAttempts !== 1) ||
      (work.status === 'completed' &&
        (work.attempts.at(-1)?.status !== 'completed' ||
          work.result === undefined ||
          work.completedAt === undefined)) ||
      (work.status === 'failed' &&
        (runningAttempts !== 0 || work.failure === undefined)) ||
      (work.status === 'canceled' && runningAttempts !== 0)
    ) {
      throw new CollectiveRuntimeError(
        'STATE_INVALID',
        'stored work status is inconsistent'
      );
    }
    if (work.status === 'running') runningWorkItems += 1;
  }
  if (runningWorkItems > policyLimits.maximumConcurrentWorkItems) {
    throw new CollectiveRuntimeError(
      'STATE_INVALID',
      'stored execution exceeds its concurrency limit'
    );
  }
  if (
    value.events.length > 100_000 ||
    value.revision > value.events.length ||
    value.events[0]?.type !== 'execution.started'
  ) {
    throw new CollectiveRuntimeError(
      'STATE_INVALID',
      'stored event history is invalid'
    );
  }
  for (let index = 0; index < value.events.length; index += 1) {
    const event = value.events[index]!;
    if (
      !isPlainRecord(event) ||
      event.schemaVersion !== 1 ||
      event.sequence !== index + 1 ||
      typeof event.type !== 'string' ||
      !EVENT_TYPES.has(event.type) ||
      event.collectiveId !== value.collectiveId ||
      event.executionId !== value.executionId ||
      event.objectiveId !== value.objective.objectiveId
    ) {
      throw new CollectiveRuntimeError(
        'STATE_INVALID',
        'stored event chain is invalid'
      );
    }
    requiredTimestamp(event.occurredAt, 'stored.event.occurredAt');
    if (!isPlainRecord(event.payload)) {
      throw new CollectiveRuntimeError(
        'STATE_INVALID',
        'stored event payload is invalid'
      );
    }
    normalizeJson(
      event.payload as unknown as JsonValue,
      'stored.event.payload'
    );
  }
  const terminal = new Set(['completed', 'failed', 'canceled']).has(
    value.status
  );
  if (
    (terminal && value.completedAt === undefined) ||
    (!terminal && value.completedAt !== undefined) ||
    (value.status === 'completed' &&
      value.workItems.some(({ status }) => status !== 'completed')) ||
    (value.status === 'failed' &&
      (value.failure === undefined ||
        !value.workItems.some(({ status }) => status === 'failed'))) ||
    (value.status === 'canceled' &&
      value.workItems.some(({ status }) =>
        ['pending', 'running'].includes(status)
      ))
  ) {
    throw new CollectiveRuntimeError(
      'STATE_INVALID',
      'stored execution status is inconsistent'
    );
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sameJson(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(normalizeJson(left as JsonValue, 'stored.value')) ===
    JSON.stringify(normalizeJson(right as JsonValue, 'normalized.value'))
  );
}

function requiredTimestamp(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new CollectiveRuntimeError(
      'STATE_INVALID',
      `${label} must be an ISO timestamp`
    );
  }
  return value;
}

function assertFailure(value: unknown, label: string): void {
  if (!isPlainRecord(value)) {
    throw new CollectiveRuntimeError('STATE_INVALID', `${label} is invalid`);
  }
  requiredIdentifier(value.code, `${label}.code`);
  requiredText(value.message, `${label}.message`, 1_024);
}

function normalizeWorkItem(value: CollectiveWorkItem): CollectiveWorkItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CollectiveRuntimeError(
      'VALIDATION_ERROR',
      'work item must be an object'
    );
  }
  const workItemId = requiredIdentifier(value.workItemId, 'workItemId');
  const summary = requiredText(
    value.summary,
    `workItems.${workItemId}.summary`
  );
  const requiredCapabilityKeys = normalizedTokens(
    value.requiredCapabilityKeys,
    `workItems.${workItemId}.requiredCapabilityKeys`
  );
  const roleKey =
    value.roleKey === undefined
      ? undefined
      : requiredIdentifier(value.roleKey, `workItems.${workItemId}.roleKey`);
  const dependsOn = normalizedTokens(
    value.dependsOn ?? [],
    `workItems.${workItemId}.dependsOn`
  );
  if (dependsOn.includes(workItemId)) {
    throw new CollectiveRuntimeError(
      'VALIDATION_ERROR',
      `work item "${workItemId}" cannot depend on itself`
    );
  }
  const input =
    value.input === undefined
      ? undefined
      : normalizeJson(value.input, `workItems.${workItemId}.input`);
  return deepFreeze({
    workItemId,
    summary,
    requiredCapabilityKeys,
    ...(roleKey === undefined ? {} : { roleKey }),
    ...(dependsOn.length === 0 ? {} : { dependsOn }),
    ...(input === undefined ? {} : { input }),
  });
}

function assertAcyclic(
  workItems: readonly CollectiveWorkItem[],
  byId: ReadonlyMap<string, CollectiveWorkItem>
): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (workItemId: string): void => {
    if (visited.has(workItemId)) return;
    if (visiting.has(workItemId)) {
      throw new CollectiveRuntimeError(
        'VALIDATION_ERROR',
        `plan contains a dependency cycle at "${workItemId}"`
      );
    }
    visiting.add(workItemId);
    for (const dependency of byId.get(workItemId)?.dependsOn ?? [])
      visit(dependency);
    visiting.delete(workItemId);
    visited.add(workItemId);
  };
  for (const workItem of workItems) visit(workItem.workItemId);
}

function normalizedTextArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length > 128) {
    throw new CollectiveRuntimeError(
      'VALIDATION_ERROR',
      `${label} must be a bounded array`
    );
  }
  return Object.freeze([
    ...new Set(
      value.map((item, index) => requiredText(item, `${label}[${index}]`))
    ),
  ]);
}

function positiveInteger(
  value: unknown,
  label: string,
  maximum: number
): number {
  return integer(value, label, 1, maximum);
}

function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new CollectiveRuntimeError(
      'VALIDATION_ERROR',
      `${label} must be an integer from ${minimum} through ${maximum}`
    );
  }
  return value as number;
}

function workItemOrder(
  left: CollectiveWorkItem,
  right: CollectiveWorkItem
): number {
  return compareAscii(left.workItemId, right.workItemId);
}

export function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}
