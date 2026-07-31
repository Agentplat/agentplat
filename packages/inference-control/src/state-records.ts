import { digestControlJsonV1 } from './canonical.js';
import { validateControlScopeV1 } from './scopes.js';
import type {
  ActionGrantStateV1,
  ActionIdempotencyRecordV1,
  DependencyBindingRecordV1,
  DiagnosticV1,
  InferenceControlLimitsV1,
  MessageIdempotencyRecordV1,
  OutboundMessageAttemptStateV1,
} from './types.js';
import {
  assertDigest,
  assertExactKeys,
  assertOneOf,
  assertSafeInteger,
  assertStrictJsonValue,
  assertString,
} from './validation.js';

export function validateDependencyBindingRecordV1(
  binding: DependencyBindingRecordV1,
): void {
  assertExactKeys(
    binding,
    ['schemaVersion', 'kind', 'bindingId', 'bindingVersion', 'bindingDigest'],
    'dependency binding',
  );
  if (binding.schemaVersion !== 1) throw new TypeError('state_conflict');
  assertOneOf(
    binding.kind,
    [
      'capability',
      'assessor',
      'transformer',
      'action_dispatcher',
      'action_context_resolver',
      'authority_resolver',
      'message_dispatcher',
    ],
    'dependency kind',
  );
  assertString(binding.bindingId, 'bindingId');
  assertSafeInteger(binding.bindingVersion, 'bindingVersion', 1);
  assertDigest(binding.bindingDigest, 'bindingDigest');
}

export function validateActionGrantStateV1(
  grant: ActionGrantStateV1,
  limits: InferenceControlLimitsV1,
): void {
  assertExactKeys(
    grant,
    [
      'schemaVersion',
      'grantId',
      'runId',
      'stateGeneration',
      'scope',
      'scopeDigest',
      'namespace',
      'toolId',
      'operation',
      'actionBindingId',
      'actionBindingVersion',
      'handlerDigest',
      'inputDigest',
      'actionDigest',
      'assessmentRequestId',
      'assessmentId',
      'assessmentTargetDigest',
      'idempotencyKey',
      'issuedAtLogicalMs',
      'expiresAtLogicalMs',
      'singleUse',
      'status',
      'reservation',
    ],
    'grant',
  );
  if (grant.schemaVersion !== 1 || grant.singleUse !== true)
    throw new TypeError('state_conflict');
  for (const [label, value] of [
    ['grantId', grant.grantId],
    ['runId', grant.runId],
    ['namespace', grant.namespace],
    ['toolId', grant.toolId],
    ['operation', grant.operation],
    ['actionBindingId', grant.actionBindingId],
    ['assessmentRequestId', grant.assessmentRequestId],
    ['assessmentId', grant.assessmentId],
    ['idempotencyKey', grant.idempotencyKey],
  ] as const)
    assertString(value, label);
  for (const [label, value] of [
    ['scopeDigest', grant.scopeDigest],
    ['handlerDigest', grant.handlerDigest],
    ['inputDigest', grant.inputDigest],
    ['actionDigest', grant.actionDigest],
    ['assessmentTargetDigest', grant.assessmentTargetDigest],
  ] as const)
    assertDigest(value, label);
  validateControlScopeV1(grant.scope);
  if (digestControlJsonV1('scope', grant.scope) !== grant.scopeDigest)
    throw new TypeError('state_conflict');
  assertSafeInteger(grant.stateGeneration, 'stateGeneration', 1);
  assertSafeInteger(grant.actionBindingVersion, 'actionBindingVersion', 1);
  assertSafeInteger(grant.issuedAtLogicalMs, 'issuedAtLogicalMs');
  assertSafeInteger(grant.expiresAtLogicalMs, 'expiresAtLogicalMs');
  if (
    grant.expiresAtLogicalMs <= grant.issuedAtLogicalMs ||
    grant.expiresAtLogicalMs - grant.issuedAtLogicalMs > limits.maxGrantTtlMs
  )
    throw new TypeError('grant_expired');
  assertOneOf(
    grant.status,
    ['issued', 'reserved', 'dispatched', 'failed', 'indeterminate', 'expired'],
    'grant status',
  );
  if (
    (['issued', 'expired'].includes(grant.status) &&
      grant.reservation !== null) ||
    (!['issued', 'expired'].includes(grant.status) &&
      grant.reservation === null)
  )
    throw new TypeError('state_conflict');
  if (grant.reservation !== null) assertStrictJsonValue(grant.reservation);
}

export function validateActionIdempotencyRecordV1(
  record: ActionIdempotencyRecordV1,
): void {
  assertExactKeys(
    record,
    [
      'schemaVersion',
      'scopeDigest',
      'idempotencyKey',
      'actionDigest',
      'grantId',
      'retainedOutcome',
    ],
    'action idempotency',
  );
  if (record.schemaVersion !== 1) throw new TypeError('state_conflict');
  assertDigest(record.scopeDigest, 'scopeDigest');
  assertString(record.idempotencyKey, 'idempotencyKey');
  assertDigest(record.actionDigest, 'actionDigest');
  assertString(record.grantId, 'grantId');
  assertOneOf(
    record.retainedOutcome,
    ['issued', 'reserved', 'dispatched', 'failed', 'indeterminate', 'expired'],
    'retainedOutcome',
  );
}

export function validateOutboundMessageAttemptStateV1(
  attempt: OutboundMessageAttemptStateV1,
): void {
  assertExactKeys(
    attempt,
    [
      'schemaVersion',
      'messageAttemptId',
      'runId',
      'messageId',
      'assessmentRequestId',
      'assessmentId',
      'messageDigest',
      'scopeDigest',
      'idempotencyKey',
      'generation',
      'dispatcherId',
      'dispatcherVersion',
      'dispatcherDigest',
      'status',
      'reservation',
      'preparedAtLogicalMs',
      'reservedAtLogicalMs',
      'expiresAtLogicalMs',
    ],
    'message attempt',
  );
  if (attempt.schemaVersion !== 1) throw new TypeError('state_conflict');
  for (const [label, value] of [
    ['messageAttemptId', attempt.messageAttemptId],
    ['runId', attempt.runId],
    ['messageId', attempt.messageId],
    ['assessmentRequestId', attempt.assessmentRequestId],
    ['assessmentId', attempt.assessmentId],
    ['idempotencyKey', attempt.idempotencyKey],
    ['dispatcherId', attempt.dispatcherId],
  ] as const)
    assertString(value, label);
  for (const [label, value] of [
    ['messageDigest', attempt.messageDigest],
    ['scopeDigest', attempt.scopeDigest],
    ['dispatcherDigest', attempt.dispatcherDigest],
  ] as const)
    assertDigest(value, label);
  assertSafeInteger(attempt.generation, 'generation', 1);
  assertSafeInteger(attempt.dispatcherVersion, 'dispatcherVersion', 1);
  assertSafeInteger(attempt.expiresAtLogicalMs, 'expiresAtLogicalMs');
  assertSafeInteger(attempt.preparedAtLogicalMs, 'preparedAtLogicalMs');
  if (attempt.expiresAtLogicalMs <= attempt.preparedAtLogicalMs)
    throw new TypeError('state_conflict');
  assertOneOf(
    attempt.status,
    ['prepared', 'reserved', 'sent', 'failed', 'indeterminate', 'expired'],
    'message status',
  );
  if (
    (['prepared', 'expired'].includes(attempt.status) &&
      (attempt.reservation !== null || attempt.reservedAtLogicalMs !== null)) ||
    (!['prepared', 'expired'].includes(attempt.status) &&
      (attempt.reservation === null || attempt.reservedAtLogicalMs === null))
  )
    throw new TypeError('state_conflict');
  if (attempt.reservation !== null) assertStrictJsonValue(attempt.reservation);
  if (attempt.reservedAtLogicalMs !== null)
    assertSafeInteger(attempt.reservedAtLogicalMs, 'reservedAtLogicalMs');
}

export function validateMessageIdempotencyRecordV1(
  record: MessageIdempotencyRecordV1,
): void {
  assertExactKeys(
    record,
    [
      'schemaVersion',
      'scopeDigest',
      'idempotencyKey',
      'messageDigest',
      'messageAttemptId',
      'retainedOutcome',
    ],
    'message idempotency',
  );
  if (record.schemaVersion !== 1) throw new TypeError('state_conflict');
  assertDigest(record.scopeDigest, 'scopeDigest');
  assertString(record.idempotencyKey, 'idempotencyKey');
  assertDigest(record.messageDigest, 'messageDigest');
  assertString(record.messageAttemptId, 'messageAttemptId');
  assertOneOf(
    record.retainedOutcome,
    ['prepared', 'reserved', 'sent', 'failed', 'indeterminate', 'expired'],
    'retainedOutcome',
  );
}

export function validateDiagnosticV1(diagnostic: DiagnosticV1): void {
  assertExactKeys(
    diagnostic,
    [
      'schemaVersion',
      'diagnosticId',
      'logicalTimeMs',
      'runId',
      'checkpoint',
      'reasonCode',
      'outcome',
      'sizeBucket',
      'correlationId',
    ],
    'diagnostic',
  );
  if (diagnostic.schemaVersion !== 1) throw new TypeError('state_conflict');
  assertString(diagnostic.diagnosticId, 'diagnosticId');
  assertSafeInteger(diagnostic.logicalTimeMs, 'logicalTimeMs');
  if (diagnostic.runId !== null) assertString(diagnostic.runId, 'runId');
  if (diagnostic.checkpoint !== null)
    assertOneOf(
      diagnostic.checkpoint,
      ['pre_run', 'stream', 'post_run', 'pre_tool', 'pre_message'],
      'checkpoint',
    );
  assertOneOf(
    diagnostic.outcome,
    ['accepted', 'withheld', 'denied', 'unavailable'],
    'outcome',
  );
  if (![0, 1, 2, 3, 4].includes(diagnostic.sizeBucket))
    throw new TypeError('state_conflict');
  if (diagnostic.correlationId !== null)
    assertString(diagnostic.correlationId, 'correlationId');
}
