import {
  MESH_SIGNATURE_ALGORITHM,
  compareMeshTimestamps,
} from '@agentplat/mesh-protocol';

import type {
  MeshKeyRecord,
  MeshKeyResolver,
  StaticMeshKeyResolverOptions,
} from './contracts.js';

// The public closed-loop reference runtime supports deterministic campaigns
// through 500 peers. Keep the default local key-resolver capacity aligned with
// that admitted topology while retaining an explicit finite bound.
const defaultMaximumRecords = 500;

/**
 * Fixed, bounded key resolver with no callbacks, I/O or hidden network path.
 */
export class StaticMeshKeyResolver implements MeshKeyResolver {
  private readonly records = new Map<string, MeshKeyRecord>();

  constructor(
    records: readonly MeshKeyRecord[],
    options: StaticMeshKeyResolverOptions = {}
  ) {
    const maximumRecords = options.maximumRecords ?? defaultMaximumRecords;
    if (!Number.isSafeInteger(maximumRecords) || maximumRecords < 1) {
      throw new RangeError('maximumRecords must be a positive safe integer');
    }
    if (records.length > maximumRecords) {
      throw new RangeError('Static Mesh key record limit exceeded');
    }
    for (const record of records) {
      assertConfiguredRecord(record);
      const key = recordKey(
        record.tenantId,
        record.meshId,
        record.peerId,
        record.keyId,
        record.algorithm
      );
      if (this.records.has(key)) {
        throw new TypeError('Duplicate static Mesh key binding');
      }
      this.records.set(key, Object.freeze({ ...record }));
    }
  }

  resolve(input: {
    tenantId: string;
    meshId: string;
    peerId: string;
    keyId: string;
    algorithm: typeof MESH_SIGNATURE_ALGORITHM;
  }): MeshKeyRecord | undefined {
    return this.records.get(
      recordKey(
        input.tenantId,
        input.meshId,
        input.peerId,
        input.keyId,
        input.algorithm
      )
    );
  }
}

/** Creates a fixed local resolver without requiring `new`. */
export function createStaticMeshKeyResolver(
  records: readonly MeshKeyRecord[],
  options: StaticMeshKeyResolverOptions = {}
): StaticMeshKeyResolver {
  return new StaticMeshKeyResolver(records, options);
}

function assertConfiguredRecord(record: MeshKeyRecord): void {
  if (
    !record ||
    typeof record.tenantId !== 'string' ||
    typeof record.meshId !== 'string' ||
    typeof record.peerId !== 'string' ||
    typeof record.keyId !== 'string' ||
    record.algorithm !== MESH_SIGNATURE_ALGORITHM ||
    (record.status !== 'active' && record.status !== 'revoked') ||
    !isEd25519Key(record.publicKey, 'public', 'verify')
  ) {
    throw new TypeError('Invalid static Mesh key record');
  }
  const validity = compareMeshTimestamps(record.validFrom, record.validUntil);
  if (!validity.ok || validity.value >= 0) {
    throw new TypeError('Invalid static Mesh key validity interval');
  }
  if (
    record.revokedAt !== undefined &&
    !compareMeshTimestamps(record.revokedAt, record.revokedAt).ok
  ) {
    throw new TypeError('Invalid static Mesh key revocation timestamp');
  }
  if (record.status === 'active' && record.revokedAt !== undefined) {
    throw new TypeError('Active static Mesh key cannot have revokedAt');
  }
  if (record.status === 'revoked') {
    if (record.revokedAt === undefined) {
      throw new TypeError('Revoked static Mesh key requires revokedAt');
    }
    const revokedAfterStart = compareMeshTimestamps(
      record.revokedAt,
      record.validFrom
    );
    const revokedBeforeEnd = compareMeshTimestamps(
      record.revokedAt,
      record.validUntil
    );
    if (
      !revokedAfterStart.ok ||
      !revokedBeforeEnd.ok ||
      revokedAfterStart.value < 0 ||
      revokedBeforeEnd.value >= 0
    ) {
      throw new TypeError('Invalid static Mesh key revocation interval');
    }
  }
}

function isEd25519Key(key: CryptoKey, type: KeyType, usage: KeyUsage): boolean {
  try {
    return (
      !!key &&
      key.type === type &&
      key.algorithm?.name === MESH_SIGNATURE_ALGORITHM &&
      Array.from(key.usages).includes(usage)
    );
  } catch {
    return false;
  }
}

function recordKey(
  tenantId: string,
  meshId: string,
  peerId: string,
  keyId: string,
  algorithm: string
): string {
  return JSON.stringify([tenantId, meshId, peerId, keyId, algorithm]);
}
