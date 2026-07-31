import type { JsonValue } from '@agentplat/core';
import {
  canonicalizeControlJsonV1,
  digestControlJsonV1,
  utf8ByteLength,
} from './canonical.js';
import type {
  ContextEntryV1,
  ContextZoneV1,
  InferenceControlPolicyV1,
  PromotionRecordV1,
} from './types.js';
import { validateControlScopeV1 } from './scopes.js';
import {
  assertDigest,
  assertExactKeys,
  assertIdentifier,
  assertOneOf,
  assertSafeInteger,
  assertStrictJsonValue,
  assertString,
  deepFreeze,
} from './validation.js';

const zones = [
  'policy',
  'objective',
  'local_trusted',
  'user_untrusted',
  'peer_untrusted',
  'tool_untrusted',
  'retrieval_untrusted',
  'provider_untrusted',
  'assessor_untrusted',
] as const;
export function validateContextEntryV1(value: unknown): ContextEntryV1 {
  const keys = [
    'schemaVersion',
    'contextEntryId',
    'runId',
    'tenantId',
    'zone',
    'sourceKind',
    'sourceId',
    'sourceVersion',
    'mediaType',
    'content',
    'contentDigest',
    'provenanceDigest',
    'encodedBytes',
    'createdAtLogicalMs',
    'scope',
    'derivation',
  ];
  assertExactKeys(value, keys, 'context entry');
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== 1) throw new TypeError('Unsupported context schema');
  for (const key of [
    'contextEntryId',
    'runId',
    'tenantId',
    'sourceId',
  ] as const)
    assertIdentifier(v[key], key);
  assertOneOf(v.zone, zones, 'zone');
  assertOneOf(
    v.sourceKind,
    ['local', 'user', 'peer', 'tool', 'retrieval', 'provider', 'assessor'],
    'sourceKind',
  );
  if (
    ['policy', 'objective', 'local_trusted'].includes(v.zone as string) &&
    v.sourceKind !== 'local'
  )
    throw new TypeError('context_zone_invalid');
  assertSafeInteger(v.sourceVersion, 'sourceVersion', 1);
  assertOneOf(v.mediaType, ['text', 'json'], 'mediaType');
  if (v.mediaType === 'text') assertString(v.content, 'content');
  else assertStrictJsonValue(v.content);
  assertDigest(v.contentDigest, 'contentDigest');
  assertDigest(v.provenanceDigest, 'provenanceDigest');
  assertSafeInteger(v.encodedBytes, 'encodedBytes');
  assertSafeInteger(v.createdAtLogicalMs, 'createdAtLogicalMs');
  if (v.scope !== null) validateControlScopeV1(v.scope);
  if (v.derivation !== null) validateDerivation(v.derivation);
  const content = v.content as JsonValue;
  const expectedContentDigest = digestControlJsonV1('context', content);
  const expectedEncodedBytes = encodedContentBytes(
    content,
    v.mediaType as 'text' | 'json',
  );
  const expectedProvenanceDigest = digestControlJsonV1(
    'provenance',
    provenanceMaterial(
      v as unknown as Pick<
        ContextEntryV1,
        'sourceKind' | 'sourceId' | 'sourceVersion' | 'derivation'
      >,
    ),
  );
  if (
    v.contentDigest !== expectedContentDigest ||
    v.encodedBytes !== expectedEncodedBytes ||
    v.provenanceDigest !== expectedProvenanceDigest
  )
    throw new TypeError('state_conflict');
  return deepFreeze({ ...v } as unknown as ContextEntryV1);
}
export function createContextEntryV1(
  input: Omit<
    ContextEntryV1,
    'schemaVersion' | 'contentDigest' | 'provenanceDigest' | 'encodedBytes'
  >,
): ContextEntryV1 {
  const content = input.content;
  const encodedBytes = encodedContentBytes(
    content as JsonValue,
    input.mediaType,
  );
  return validateContextEntryV1({
    ...input,
    schemaVersion: 1,
    contentDigest: digestControlJsonV1('context', content as JsonValue),
    provenanceDigest: digestControlJsonV1(
      'provenance',
      provenanceMaterial(input),
    ),
    encodedBytes,
  });
}
export function canAdmitContextEntryV1(
  policy: InferenceControlPolicyV1,
  existing: readonly ContextEntryV1[],
  entry: ContextEntryV1,
): boolean {
  const admitted = validateContextEntryV1(entry);
  const retained = existing.map((item) => validateContextEntryV1(item));
  return (
    policy.allowedContextZones.includes(admitted.zone) &&
    retained.length < policy.limits.maxContextEntriesPerRun &&
    admitted.encodedBytes <= policy.limits.maxContextEntryBytes &&
    retained.reduce((total, item) => total + item.encodedBytes, 0) +
      admitted.encodedBytes <=
      policy.limits.maxContextBytesPerRun
  );
}
export function promoteContextEntryV1(
  source: ContextEntryV1,
  promotion: PromotionRecordV1,
  policy: InferenceControlPolicyV1,
): ContextEntryV1 {
  validateContextEntryV1(source);
  validatePromotion(promotion);
  if (
    !policy.allowedTransformerBindings.some(
      (item) =>
        item.id === promotion.transformerId &&
        item.version === promotion.transformerVersion,
    ) ||
    !policy.allowedContextZones.includes(promotion.targetZone)
  )
    throw new TypeError('context_promotion_denied');
  if (
    promotion.sourceContextEntryId !== source.contextEntryId ||
    promotion.sourceContentDigest !== source.contentDigest ||
    promotion.policyId !== policy.policyId ||
    promotion.policyVersion !== policy.policyVersion
  )
    throw new TypeError('context_promotion_denied');
  return createContextEntryV1({
    ...source,
    contextEntryId: `${source.contextEntryId}:p:${promotion.transformerId}:${promotion.transformerVersion}`,
    zone: promotion.targetZone,
    sourceKind: 'local',
    createdAtLogicalMs: promotion.promotedAtLogicalMs,
    derivation: promotion,
  });
}
export const CONTEXT_ZONES_V1: readonly ContextZoneV1[] = zones;

function encodedContentBytes(
  content: JsonValue,
  mediaType: 'text' | 'json',
): number {
  return utf8ByteLength(
    mediaType === 'text'
      ? (content as string)
      : canonicalizeControlJsonV1(content),
  );
}

function provenanceMaterial(
  entry: Pick<
    ContextEntryV1,
    'sourceKind' | 'sourceId' | 'sourceVersion' | 'derivation'
  >,
): JsonValue {
  return {
    sourceKind: entry.sourceKind,
    sourceId: entry.sourceId,
    sourceVersion: entry.sourceVersion,
    derivation: entry.derivation as JsonValue | null,
  };
}

function validateDerivation(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('context derivation must be an object');
  const record = value as Record<string, unknown>;
  if (Object.hasOwn(record, 'transformerId')) {
    assertExactKeys(
      value,
      [
        'sourceContextEntryId',
        'sourceContentDigest',
        'transformerId',
        'transformerVersion',
        'policyId',
        'policyVersion',
        'targetZone',
        'promotedAtLogicalMs',
      ],
      'context promotion',
    );
    for (const key of [
      'sourceContextEntryId',
      'transformerId',
      'policyId',
    ] as const)
      assertIdentifier(record[key], key);
    assertDigest(record.sourceContentDigest, 'sourceContentDigest');
    for (const key of ['transformerVersion', 'policyVersion'] as const)
      assertSafeInteger(record[key], key, 1);
    assertOneOf(
      record.targetZone,
      [
        'local_trusted',
        'user_untrusted',
        'peer_untrusted',
        'tool_untrusted',
        'retrieval_untrusted',
        'provider_untrusted',
        'assessor_untrusted',
      ],
      'targetZone',
    );
    assertSafeInteger(record.promotedAtLogicalMs, 'promotedAtLogicalMs');
    return;
  }
  assertExactKeys(
    value,
    [
      'sourceContextEntryId',
      'sourceContentDigest',
      'assessmentRequestId',
      'assessmentId',
      'assessorId',
      'assessorVersion',
      'targetZone',
      'createdAtLogicalMs',
    ],
    'assessor revision',
  );
  for (const key of [
    'sourceContextEntryId',
    'assessmentRequestId',
    'assessmentId',
    'assessorId',
  ] as const)
    assertIdentifier(record[key], key);
  assertDigest(record.sourceContentDigest, 'sourceContentDigest');
  assertSafeInteger(record.assessorVersion, 'assessorVersion', 1);
  assertOneOf(record.targetZone, ['assessor_untrusted'], 'targetZone');
  assertSafeInteger(record.createdAtLogicalMs, 'createdAtLogicalMs');
}

function validatePromotion(value: PromotionRecordV1): void {
  validateDerivation(value);
}
