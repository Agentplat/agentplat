import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMeshDiscoveryState,
  createMeshWireVersionPolicy,
  createMeshWireVersionResetDecision,
  recordMeshDiscoveryWireVersionSelection,
  restoreMeshDiscoveryState,
  selectMeshPeerWireVersion,
} from '@agentplat/mesh/coordination';
import {
  MESH_PREVIOUS_WIRE_VERSION,
  MESH_SUPPORTED_WIRE_VERSIONS,
  MESH_WIRE_VERSION,
} from '@agentplat/mesh-protocol';

const scope = Object.freeze({
  tenantId: 'tenant-a',
  meshId: 'mesh-a',
  peerId: 'peer-b',
  instanceId: 'peer-b-1',
});

function peerCard(overrides = {}) {
  return Object.freeze({
    peerId: scope.peerId,
    instanceId: scope.instanceId,
    peerCardId: 'card-b-1',
    cardRevision: 1,
    protocolVersions: Object.freeze([...MESH_SUPPORTED_WIRE_VERSIONS]),
    transportHints: Object.freeze([]),
    capabilityIds: Object.freeze([]),
    validFrom: '2026-08-01T00:00:00Z',
    validUntil: '2026-08-02T00:00:00Z',
    validityVerifiedAt: '2026-08-01T00:00:01Z',
    acceptedMessageId: 'AAAAAAAAAAAAAAAAAAAAAQ',
    acceptedAt: 1,
    expiresAt: 100,
    status: 'active',
    ...overrides,
  });
}

test('wire-version bootstrap defaults to v1 and requires explicit v0 policy', () => {
  const current = selectMeshPeerWireVersion({
    ...scope,
    policy: createMeshWireVersionPolicy(),
  });
  assert.equal(current.selected, true);
  assert.equal(current.binding.wireVersion, MESH_WIRE_VERSION);
  assert.equal(current.binding.source, 'bootstrap');

  const compatibility = selectMeshPeerWireVersion({
    ...scope,
    policy: createMeshWireVersionPolicy({
      bootstraps: [
        {
          peerId: scope.peerId,
          instanceId: scope.instanceId,
          wireVersion: MESH_PREVIOUS_WIRE_VERSION,
        },
      ],
    }),
  });
  assert.equal(compatibility.selected, true);
  assert.equal(compatibility.binding.wireVersion, MESH_PREVIOUS_WIRE_VERSION);
});

test('verified Peer Cards select the highest local intersection', () => {
  const selected = selectMeshPeerWireVersion({
    ...scope,
    policy: createMeshWireVersionPolicy(),
    peerCard: peerCard(),
  });
  assert.equal(selected.selected, true);
  assert.equal(selected.binding.wireVersion, MESH_WIRE_VERSION);
  assert.equal(selected.binding.source, 'verified_peer_card');
  assert.equal(selected.binding.peerCardId, 'card-b-1');

  const unavailable = selectMeshPeerWireVersion({
    ...scope,
    policy: createMeshWireVersionPolicy({
      allowedWireVersions: [MESH_WIRE_VERSION],
    }),
    peerCard: peerCard({ protocolVersions: Object.freeze([7]) }),
  });
  assert.deepEqual(unavailable, {
    selected: false,
    code: 'wire_version_unavailable',
  });
});

test('downgrade high-water survives new cards unless an exact reset is supplied', () => {
  const initial = selectMeshPeerWireVersion({
    ...scope,
    policy: createMeshWireVersionPolicy(),
    peerCard: peerCard(),
  });
  assert.equal(initial.selected, true);
  const lowerCard = peerCard({
    peerCardId: 'card-b-2',
    cardRevision: 2,
    protocolVersions: Object.freeze([MESH_PREVIOUS_WIRE_VERSION]),
  });
  const rejected = selectMeshPeerWireVersion({
    ...scope,
    policy: createMeshWireVersionPolicy(),
    peerCard: lowerCard,
    highWater: initial.highWater,
  });
  assert.deepEqual(rejected, {
    selected: false,
    code: 'wire_version_downgrade',
  });

  const reset = createMeshWireVersionResetDecision({
    ...scope,
    peerCardId: lowerCard.peerCardId,
    cardRevision: lowerCard.cardRevision,
    wireVersion: MESH_PREVIOUS_WIRE_VERSION,
    reason: 'operator-approved compatibility window',
  });
  const accepted = selectMeshPeerWireVersion({
    ...scope,
    policy: createMeshWireVersionPolicy(),
    peerCard: lowerCard,
    highWater: initial.highWater,
    reset,
  });
  assert.equal(accepted.selected, true);
  assert.equal(accepted.binding.resetApplied, true);
  assert.equal(accepted.highWater.wireVersion, MESH_PREVIOUS_WIRE_VERSION);

  const sameCardReset = createMeshWireVersionResetDecision({
    ...scope,
    peerCardId: initial.binding.peerCardId,
    cardRevision: initial.binding.cardRevision,
    wireVersion: MESH_PREVIOUS_WIRE_VERSION,
    reason: 'same lineage must not cross the downgrade fence',
  });
  assert.deepEqual(
    selectMeshPeerWireVersion({
      ...scope,
      policy: createMeshWireVersionPolicy({
        allowedWireVersions: [MESH_PREVIOUS_WIRE_VERSION],
      }),
      peerCard: peerCard({
        protocolVersions: Object.freeze([MESH_PREVIOUS_WIRE_VERSION]),
      }),
      highWater: initial.highWater,
      reset: sameCardReset,
    }),
    { selected: false, code: 'wire_version_downgrade' }
  );
});

test('a peer restart retains high-water and only explicit new-instance bootstrap can reset it', () => {
  const highWater = Object.freeze({
    ...scope,
    peerCardId: 'card-b-1',
    cardRevision: 1,
    wireVersion: MESH_WIRE_VERSION,
  });
  const restarted = { ...scope, instanceId: 'peer-b-2' };
  assert.deepEqual(
    selectMeshPeerWireVersion({
      ...restarted,
      policy: createMeshWireVersionPolicy({
        allowedWireVersions: [MESH_PREVIOUS_WIRE_VERSION],
      }),
      highWater,
    }),
    { selected: false, code: 'wire_version_unavailable' }
  );
  const reset = selectMeshPeerWireVersion({
    ...restarted,
    policy: createMeshWireVersionPolicy({
      allowedWireVersions: [MESH_PREVIOUS_WIRE_VERSION],
      bootstraps: [
        {
          peerId: restarted.peerId,
          instanceId: restarted.instanceId,
          wireVersion: MESH_PREVIOUS_WIRE_VERSION,
        },
      ],
    }),
    highWater,
  });
  assert.equal(reset.selected, true);
  assert.equal(reset.binding.resetApplied, true);
  assert.equal(reset.highWater.instanceId, restarted.instanceId);
  assert.equal(reset.highWater.wireVersion, MESH_PREVIOUS_WIRE_VERSION);
});

test('inactive and wrong-instance Peer Cards are never negotiation authority', () => {
  for (const card of [
    peerCard({ status: 'expired' }),
    peerCard({ instanceId: 'peer-b-2' }),
  ]) {
    assert.deepEqual(
      selectMeshPeerWireVersion({
        ...scope,
        policy: createMeshWireVersionPolicy(),
        peerCard: card,
      }),
      { selected: false, code: 'peer_card_unavailable' }
    );
  }
});

test('discovery snapshots migrate schema 1 and retain scoped high-water', () => {
  const state = createMeshDiscoveryState({
    identity: {
      tenantId: scope.tenantId,
      meshId: scope.meshId,
      peerId: 'peer-a',
      instanceId: 'peer-a-1',
      keyId: 'key-a',
    },
    admittedPeers: [
      {
        peerId: scope.peerId,
        instanceIds: [scope.instanceId],
        validUntil: '2027-01-01T00:00:00Z',
      },
    ],
  });
  assert.equal(state.schemaVersion, 2);
  const legacy = structuredClone(state);
  legacy.schemaVersion = 1;
  delete legacy.wireVersionHighWaters;
  const migrated = restoreMeshDiscoveryState(legacy);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(Object.keys(migrated.wireVersionHighWaters).length, 0);
  assert.equal(Object.getPrototypeOf(migrated.wireVersionHighWaters), null);

  const selection = selectMeshPeerWireVersion({
    ...scope,
    policy: createMeshWireVersionPolicy(),
  });
  assert.equal(selection.selected, true);
  const recorded = recordMeshDiscoveryWireVersionSelection(migrated, selection);
  const key = scope.peerId;
  assert.equal(
    recorded.wireVersionHighWaters[key].wireVersion,
    MESH_WIRE_VERSION
  );
  assert.deepEqual(
    restoreMeshDiscoveryState(structuredClone(recorded)),
    recorded
  );
});
