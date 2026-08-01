import {
  MESH_SUPPORTED_WIRE_VERSIONS,
  MESH_WIRE_VERSION,
  type MeshWireVersion,
} from '@agentplat/mesh-protocol';

import type {
  MeshWireVersionBootstrap,
  MeshWireVersionHighWater,
  MeshWireVersionPolicy,
  MeshWireVersionResetDecision,
  MeshWireVersionSelection,
  MeshWireVersionSelectionBinding,
  MeshWireVersionSelectionInput,
} from './coordination-wire-version-contracts.js';

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/;

/** Snapshots one construction-bound policy; v1 is the only implicit bootstrap. */
export function createMeshWireVersionPolicy(
  input: Partial<MeshWireVersionPolicy> = {}
): MeshWireVersionPolicy {
  assertExactKeys(input, ['allowedWireVersions', 'bootstraps']);
  const allowedWireVersions = freezeVersions(
    input.allowedWireVersions ?? MESH_SUPPORTED_WIRE_VERSIONS
  );
  const bootstraps = input.bootstraps ?? [];
  if (!Array.isArray(bootstraps)) {
    throw new TypeError('Mesh wire-version bootstraps must be an array');
  }
  const seen = new Set<string>();
  const frozenBootstraps = bootstraps.map((entry) => {
    assertExactKeys(
      entry,
      ['instanceId', 'peerId', 'wireVersion'],
      ['instanceId', 'peerId', 'wireVersion']
    );
    assertIdentifier(entry.peerId, 'peerId');
    assertIdentifier(entry.instanceId, 'instanceId');
    assertWireVersion(entry.wireVersion);
    if (!allowedWireVersions.includes(entry.wireVersion)) {
      throw new TypeError('Mesh bootstrap version is not locally allowed');
    }
    const key = JSON.stringify([entry.peerId, entry.instanceId]);
    if (seen.has(key)) {
      throw new TypeError('Duplicate Mesh wire-version bootstrap');
    }
    seen.add(key);
    return Object.freeze({ ...entry });
  });
  return Object.freeze({
    allowedWireVersions,
    bootstraps: Object.freeze(frozenBootstraps),
  });
}

/** Creates a closed, auditable local downgrade-reset decision. */
export function createMeshWireVersionResetDecision(
  input: MeshWireVersionResetDecision
): MeshWireVersionResetDecision {
  assertExactKeys(
    input,
    [
      'cardRevision',
      'instanceId',
      'meshId',
      'peerCardId',
      'peerId',
      'reason',
      'tenantId',
      'wireVersion',
    ],
    [
      'cardRevision',
      'instanceId',
      'meshId',
      'peerCardId',
      'peerId',
      'reason',
      'tenantId',
      'wireVersion',
    ]
  );
  for (const field of [
    'tenantId',
    'meshId',
    'peerId',
    'instanceId',
    'peerCardId',
  ] as const) {
    assertIdentifier(input[field], field);
  }
  if (!Number.isSafeInteger(input.cardRevision) || input.cardRevision < 1) {
    throw new TypeError('Mesh reset cardRevision is invalid');
  }
  assertWireVersion(input.wireVersion);
  if (
    typeof input.reason !== 'string' ||
    input.reason.length < 1 ||
    input.reason.length > 256
  ) {
    throw new TypeError('Mesh reset reason is invalid');
  }
  return Object.freeze({ ...input });
}

/** Selects the highest authenticated common version and enforces high-water. */
export function selectMeshPeerWireVersion(
  input: MeshWireVersionSelectionInput
): MeshWireVersionSelection {
  assertSelectionInput(input);
  const peerCard = input.peerCard;
  let selectedVersion: MeshWireVersion | undefined;
  let source: MeshWireVersionSelectionBinding['source'];
  let explicitBootstrap = false;

  if (peerCard === undefined) {
    const bootstrap = input.policy.bootstraps.find(
      (candidate) =>
        candidate.peerId === input.peerId &&
        candidate.instanceId === input.instanceId
    );
    explicitBootstrap = bootstrap !== undefined;
    selectedVersion = bootstrap?.wireVersion ?? MESH_WIRE_VERSION;
    source = 'bootstrap';
    if (!input.policy.allowedWireVersions.includes(selectedVersion)) {
      return unavailable();
    }
  } else {
    if (
      !Object.isFrozen(peerCard) ||
      !Object.isFrozen(peerCard.protocolVersions) ||
      peerCard.status !== 'active' ||
      peerCard.peerId !== input.peerId ||
      peerCard.instanceId !== input.instanceId ||
      !validAdvertisedVersions(peerCard.protocolVersions)
    ) {
      return Object.freeze({
        selected: false,
        code: 'peer_card_unavailable',
      });
    }
    const advertised = new Set(peerCard.protocolVersions);
    selectedVersion = [...input.policy.allowedWireVersions]
      .reverse()
      .find((version) => advertised.has(version));
    source = 'verified_peer_card';
    if (selectedVersion === undefined) return unavailable();
  }

  const highWater = input.highWater;
  if (highWater !== undefined) assertHighWater(highWater, input);
  const downgrade =
    highWater !== undefined && selectedVersion < highWater.wireVersion;
  const resetApplied =
    downgrade &&
    ((peerCard !== undefined &&
      resetMatches(input.reset, input, peerCard, highWater, selectedVersion)) ||
      (peerCard === undefined &&
        explicitBootstrap &&
        highWater !== undefined &&
        highWater.instanceId !== input.instanceId));
  if (downgrade && !resetApplied) {
    return Object.freeze({
      selected: false,
      code: 'wire_version_downgrade',
    });
  }

  const binding = Object.freeze({
    tenantId: input.tenantId,
    meshId: input.meshId,
    peerId: input.peerId,
    instanceId: input.instanceId,
    ...(peerCard === undefined
      ? {}
      : {
          peerCardId: peerCard.peerCardId,
          cardRevision: peerCard.cardRevision,
        }),
    wireVersion: selectedVersion,
    ...(highWater === undefined
      ? {}
      : { previousHighWater: highWater.wireVersion }),
    source,
    resetApplied: resetApplied === true,
  }) satisfies MeshWireVersionSelectionBinding;
  const nextHighWater = Object.freeze({
    tenantId: binding.tenantId,
    meshId: binding.meshId,
    peerId: binding.peerId,
    instanceId: binding.instanceId,
    ...(binding.peerCardId === undefined
      ? {}
      : {
          peerCardId: binding.peerCardId,
          cardRevision: binding.cardRevision,
        }),
    wireVersion:
      resetApplied || highWater === undefined
        ? binding.wireVersion
        : (Math.max(
            highWater.wireVersion,
            binding.wireVersion
          ) as MeshWireVersion),
  }) satisfies MeshWireVersionHighWater;
  return Object.freeze({ selected: true, binding, highWater: nextHighWater });
}

function unavailable(): MeshWireVersionSelection {
  return Object.freeze({
    selected: false,
    code: 'wire_version_unavailable',
  });
}

function resetMatches(
  reset: MeshWireVersionResetDecision | undefined,
  input: MeshWireVersionSelectionInput,
  peerCard: NonNullable<MeshWireVersionSelectionInput['peerCard']>,
  highWater: MeshWireVersionHighWater | undefined,
  selectedVersion: MeshWireVersion
): boolean {
  const newerLineage =
    highWater === undefined ||
    highWater.peerCardId === undefined ||
    highWater.instanceId !== input.instanceId ||
    (peerCard.peerCardId !== highWater.peerCardId &&
      highWater.cardRevision !== undefined &&
      peerCard.cardRevision > highWater.cardRevision);
  return (
    reset !== undefined &&
    Object.isFrozen(reset) &&
    newerLineage &&
    reset.tenantId === input.tenantId &&
    reset.meshId === input.meshId &&
    reset.peerId === input.peerId &&
    reset.instanceId === input.instanceId &&
    reset.peerCardId === peerCard.peerCardId &&
    reset.cardRevision === peerCard.cardRevision &&
    selectedVersion === reset.wireVersion
  );
}

function assertSelectionInput(input: MeshWireVersionSelectionInput): void {
  assertExactKeys(
    input,
    [
      'highWater',
      'instanceId',
      'meshId',
      'peerCard',
      'peerId',
      'policy',
      'reset',
      'tenantId',
    ],
    ['instanceId', 'meshId', 'peerId', 'policy', 'tenantId']
  );
  for (const field of ['tenantId', 'meshId', 'peerId', 'instanceId'] as const) {
    assertIdentifier(input[field], field);
  }
  if (
    !input.policy ||
    !Object.isFrozen(input.policy) ||
    !Object.isFrozen(input.policy.allowedWireVersions) ||
    !Object.isFrozen(input.policy.bootstraps) ||
    input.policy.bootstraps.some((entry) => !Object.isFrozen(entry))
  ) {
    throw new TypeError(
      'Mesh wire-version policy must be an immutable snapshot'
    );
  }
}

function assertHighWater(
  highWater: MeshWireVersionHighWater,
  input: MeshWireVersionSelectionInput
): void {
  assertExactKeys(
    highWater,
    [
      'cardRevision',
      'instanceId',
      'meshId',
      'peerCardId',
      'peerId',
      'tenantId',
      'wireVersion',
    ],
    ['instanceId', 'meshId', 'peerId', 'tenantId', 'wireVersion']
  );
  for (const field of ['tenantId', 'meshId', 'peerId', 'instanceId'] as const) {
    assertIdentifier(highWater[field], `high-water ${field}`);
  }
  if (
    (highWater.peerCardId === undefined) !==
      (highWater.cardRevision === undefined) ||
    (highWater.peerCardId !== undefined &&
      !identifierPattern.test(highWater.peerCardId)) ||
    (highWater.cardRevision !== undefined &&
      (!Number.isSafeInteger(highWater.cardRevision) ||
        highWater.cardRevision < 1))
  ) {
    throw new TypeError('Mesh wire-version high-water lineage is invalid');
  }
  if (
    highWater.tenantId !== input.tenantId ||
    highWater.meshId !== input.meshId ||
    highWater.peerId !== input.peerId
  ) {
    throw new TypeError('Mesh wire-version high-water scope mismatch');
  }
  assertWireVersion(highWater.wireVersion);
}

function validAdvertisedVersions(versions: readonly number[]): boolean {
  if (versions.length < 1 || versions.length > 8) return false;
  let previous: number | undefined;
  for (const version of versions) {
    if (
      !Number.isSafeInteger(version) ||
      version < 0 ||
      (previous !== undefined && version <= previous)
    ) {
      return false;
    }
    previous = version;
  }
  return true;
}

function freezeVersions(
  versions: readonly MeshWireVersion[]
): readonly MeshWireVersion[] {
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new TypeError('Mesh wire-version policy cannot be empty');
  }
  const result: MeshWireVersion[] = [];
  for (const version of versions) {
    assertWireVersion(version);
    if (result.includes(version)) {
      throw new TypeError('Duplicate Mesh wire-version policy entry');
    }
    result.push(version);
  }
  return Object.freeze(result.sort((left, right) => left - right));
}

function assertWireVersion(value: unknown): asserts value is MeshWireVersion {
  if (!MESH_SUPPORTED_WIRE_VERSIONS.includes(value as MeshWireVersion)) {
    throw new TypeError('Unsupported Mesh wire version');
  }
}

function assertIdentifier(
  value: unknown,
  field: string
): asserts value is string {
  if (typeof value !== 'string' || !identifierPattern.test(value)) {
    throw new TypeError(`Mesh wire-version ${field} is invalid`);
  }
}

function assertExactKeys(
  value: unknown,
  allowed: readonly string[],
  required: readonly string[] = []
): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Mesh wire-version input must be a record');
  }
  const keys = Object.keys(value);
  if (
    keys.some((key) => !allowed.includes(key)) ||
    required.some((key) => !keys.includes(key))
  ) {
    throw new TypeError('Mesh wire-version input shape is invalid');
  }
}
