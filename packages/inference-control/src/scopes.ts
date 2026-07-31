import type { ControlScopeV1 } from './types.js';
import {
  assertControlToken,
  assertExactKeys,
  assertIdentifier,
  assertSafeInteger,
  deepFreeze,
} from './validation.js';

const standaloneKeys = [
  'schemaVersion',
  'kind',
  'tenantId',
  'runId',
  'agentId',
  'organizationId',
  'workspaceId',
  'policyId',
  'policyVersion',
] as const;

const coordinatedKeys = [
  'schemaVersion',
  'kind',
  'tenantId',
  'runId',
  'agentId',
  'policyId',
  'policyVersion',
  'meshId',
  'objectiveId',
  'objectiveRevision',
  'workItemId',
  'workItemRevision',
  'peerId',
  'instanceId',
  'assignmentAuthorityId',
  'assignmentEpoch',
  'fencingToken',
  'leaseExpiresAtLogicalMs',
  'authorityGeneration',
  'objectiveTerminal',
  'workTerminal',
] as const;

export function validateControlScopeV1(value: unknown): ControlScopeV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('grant_scope_mismatch');
  const scope = value as Record<string, unknown>;
  if (scope.kind === 'standalone') {
    assertExactKeys(scope, standaloneKeys, 'standalone scope');
    if (scope.schemaVersion !== 1) throw new TypeError('grant_scope_mismatch');
    for (const key of ['tenantId', 'runId', 'agentId', 'policyId'] as const)
      assertIdentifier(scope[key], key);
    for (const key of ['organizationId', 'workspaceId'] as const)
      if (scope[key] !== null) assertIdentifier(scope[key], key);
    assertSafeInteger(scope.policyVersion, 'policyVersion', 1);
    return deepFreeze(structuredClone(scope) as unknown as ControlScopeV1);
  }
  assertExactKeys(scope, coordinatedKeys, 'coordinated scope');
  if (scope.kind !== 'coordinated' || scope.schemaVersion !== 1)
    throw new TypeError('grant_scope_mismatch');
  for (const key of [
    'tenantId',
    'runId',
    'agentId',
    'policyId',
    'meshId',
    'objectiveId',
    'workItemId',
    'peerId',
    'instanceId',
    'assignmentAuthorityId',
  ] as const)
    assertIdentifier(scope[key], key);
  assertControlToken(scope.fencingToken, 'fencingToken');
  for (const key of [
    'policyVersion',
    'objectiveRevision',
    'workItemRevision',
    'assignmentEpoch',
    'leaseExpiresAtLogicalMs',
    'authorityGeneration',
  ] as const)
    assertSafeInteger(scope[key], key, 1);
  if (
    typeof scope.objectiveTerminal !== 'boolean' ||
    typeof scope.workTerminal !== 'boolean'
  )
    throw new TypeError('grant_scope_mismatch');
  return deepFreeze(structuredClone(scope) as unknown as ControlScopeV1);
}
