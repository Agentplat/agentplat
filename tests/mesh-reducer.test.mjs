import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';

import {
  DEFAULT_MESH_CRYPTO_POLICY,
  createStaticMeshKeyResolver,
  createWebCryptoMeshEnvelopeVerifier,
  signMeshEnvelope,
} from '@agentplat/mesh-crypto';
import {
  ALLOW_PREPROVISIONED_MESH_ADMISSION,
  createMeshPeerState,
  processMeshEnvelope,
  reduceMeshPeer,
} from '@agentplat/mesh';
import {
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_WIRE_VERSION,
  validateSignedMeshEnvelope,
} from '@agentplat/mesh-protocol';

const acceptedCardMessageId = messageId(9_000);
const verifiedAt = '2026-07-30T00:00:01Z';
let keys;
let keysC;
let resolver;
let verifier;

test.todo(
  'rejects execution records statefully for unauthorized recipients, unresolved causal records, stale authority, expired leases, non-head checkpoints, and duplicate results'
);
test.todo(
  'rejects release and cancellation statefully for unauthorized recipients, unresolved authority, stale epochs, terminal work, duplicate IDs, and invalid accounting'
);
test.todo(
  'rejects lease renewals statefully for unauthorized recipients, unresolved predecessors, stale authority, expired leases, terminal work, sequence forks, and Objective policy limits'
);
test.todo(
  'rejects takeover proposals statefully before recovery grace, from ineligible proposers, to non-witnesses, or against stale lease heads and non-next epochs'
);

test.before(async () => {
  keys = await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
    'sign',
    'verify',
  ]);
  keysC = await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
    'sign',
    'verify',
  ]);
  resolver = createStaticMeshKeyResolver([
    {
      tenantId: 'tenant-a',
      meshId: 'mesh-a',
      peerId: 'peer-a',
      keyId: 'key-a',
      algorithm: MESH_SIGNATURE_ALGORITHM,
      publicKey: keys.publicKey,
      validFrom: '2026-01-01T00:00:00Z',
      validUntil: '2027-01-01T00:00:00Z',
      status: 'active',
    },
    {
      tenantId: 'tenant-a',
      meshId: 'mesh-a',
      peerId: 'peer-c',
      keyId: 'key-c',
      algorithm: MESH_SIGNATURE_ALGORITHM,
      publicKey: keysC.publicKey,
      validFrom: '2026-01-01T00:00:00Z',
      validUntil: '2027-01-01T00:00:00Z',
      status: 'active',
    },
    {
      tenantId: 'tenant-a',
      meshId: 'mesh-a',
      peerId: 'peer-unknown',
      keyId: 'key-unknown',
      algorithm: MESH_SIGNATURE_ALGORITHM,
      publicKey: keys.publicKey,
      validFrom: '2026-01-01T00:00:00Z',
      validUntil: '2027-01-01T00:00:00Z',
      status: 'active',
    },
  ]);
  verifier = createWebCryptoMeshEnvelopeVerifier();
});

function messageId(value) {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(12, value);
  return Buffer.from(bytes).toString('base64url');
}

function admissions(overrides = {}) {
  return [
    {
      peerId: 'peer-a',
      instanceIds: ['instance-a', 'instance-a-2'],
      peerCardId: 'card-a',
      acceptedCardMessageId,
      cardRevision: 1,
      validUntil: '2027-01-01T00:00:00Z',
      ...overrides,
    },
    {
      peerId: 'peer-c',
      instanceIds: ['instance-c'],
      peerCardId: 'card-c',
      acceptedCardMessageId: messageId(9_001),
      cardRevision: 1,
      validUntil: '2027-01-01T00:00:00Z',
    },
  ];
}

function createdState(overrides = {}) {
  return createMeshPeerState({
    identity: {
      tenantId: 'tenant-a',
      meshId: 'mesh-a',
      peerId: 'peer-b',
      instanceId: 'instance-b',
      keyId: 'key-b',
    },
    admittedPeers: admissions(),
    ...overrides,
  });
}

function runningState(overrides = {}) {
  return reduceMeshPeer(createdState(overrides), { kind: 'peer.start' }, 0)
    .state;
}

function unsignedEnvelope(type, sequence, id, overrides = {}) {
  const payload =
    type === 'peer.hello'
      ? {
          type,
          peerCardId: 'card-a',
          cardRevision: 1,
        }
      : { type };
  return {
    protocol: MESH_PROTOCOL,
    wireVersion: MESH_WIRE_VERSION,
    messageId: id,
    tenantId: 'tenant-a',
    meshId: 'mesh-a',
    type,
    sender: {
      peerId: 'peer-a',
      instanceId: 'instance-a',
    },
    audience: {
      kind: 'peer',
      peerId: 'peer-b',
    },
    sequence,
    sentAt: '2026-07-30T00:00:00Z',
    expiresAt:
      type === 'peer.hello' ? '2026-07-30T00:02:00Z' : '2026-07-30T00:00:30Z',
    payload,
    proof: {
      algorithm: MESH_SIGNATURE_ALGORITHM,
      keyId: 'key-a',
    },
    ...(type === 'peer.hello' ? { causationId: acceptedCardMessageId } : {}),
    ...overrides,
  };
}

async function signedEnvelope(
  type,
  sequence,
  id = messageId(sequence),
  overrides = {}
) {
  const envelope = unsignedEnvelope(type, sequence, id, overrides);
  return signMeshEnvelope({
    envelope,
    privateKey:
      envelope.sender.peerId === 'peer-c' ? keysC.privateKey : keys.privateKey,
  });
}

function process(state, envelope, overrides = {}) {
  return processMeshEnvelope(state, {
    envelope,
    verifiedAt,
    receivedAt: 1_000,
    verifier,
    resolver,
    cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
    admissionPolicy: ALLOW_PREPROVISIONED_MESH_ADMISSION,
    ...overrides,
  });
}

function preparePing(
  state,
  {
    peerId = 'peer-a',
    id = messageId(40),
    requestedAt = 100,
    preparedAt = 101,
    expiresAt = 2_000,
  } = {}
) {
  const requested = reduceMeshPeer(
    state,
    { kind: 'peer.ping', peerId },
    requestedAt
  );
  const preparation = requested.effects.find(
    (effect) => effect.kind === 'message.prepare'
  );
  assert.ok(preparation);
  const prepared = reduceMeshPeer(
    requested.state,
    {
      kind: 'effect.result',
      effectId: preparation.effectId,
      status: 'succeeded',
      preparedMessage: {
        messageId: id,
        type: 'peer.ping',
        audiencePeerId: peerId,
        expiresAt,
      },
    },
    preparedAt
  );
  assert.equal(prepared.effects[0].kind, 'message.deliver');
  return prepared;
}

function expectRejected(result, code, state) {
  assert.deepEqual(result, {
    accepted: false,
    code,
    state,
    effects: [],
  });
  assert.equal(result.state, state);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.effects), true);
}

test('peer state construction is bounded and deeply immutable', () => {
  const state = createdState();
  assert.equal(state.status, 'created');
  assert.equal(state.localEventSequence, 0);
  assert.equal(state.lastLogicalTime, 0);
  assert.deepEqual(Object.keys(state.admittedPeers).sort(), [
    'peer-a',
    'peer-c',
  ]);
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.identity), true);
  assert.equal(Object.isFrozen(state.admittedPeers), true);
  assert.equal(Object.isFrozen(state.pendingPreparations), true);
  assert.equal(Object.isFrozen(state.admittedPeers['peer-a']), true);
  assert.equal(
    Object.isFrozen(state.admittedPeers['peer-a'].instanceIds),
    true
  );
  assert.equal(Object.getPrototypeOf(state.admittedPeers), null);
  assert.throws(
    () =>
      createMeshPeerState({
        identity: state.identity,
        admittedPeers: [admissions()[0], { ...admissions()[0] }],
      }),
    /Duplicate Mesh admitted peerId/u
  );
  assert.throws(
    () =>
      createMeshPeerState({
        identity: state.identity,
        admittedPeers: admissions(),
        limits: { messageIdRetentionMs: 1 },
      }),
    /protocol minimum/u
  );
});

test('peer lifecycle is deterministic and inbound inputs are not public', () => {
  const created = createdState();
  const first = reduceMeshPeer(created, { kind: 'peer.start' }, 10);
  const second = reduceMeshPeer(created, { kind: 'peer.start' }, 10);
  assert.deepEqual(first, second);
  assert.equal(first.state.status, 'running');
  assert.equal(first.effects[0].event.type, 'mesh.peer.started');
  assert.equal(Object.isFrozen(first.state), true);
  assert.equal(Object.isFrozen(first.effects), true);

  assert.throws(
    () =>
      reduceMeshPeer(
        first.state,
        {
          kind: 'message.accepted',
          message: {
            envelope: {},
            receivedAt: 20,
          },
        },
        20
      ),
    /Unsupported Mesh reducer input/u
  );
  const stopped = reduceMeshPeer(
    first.state,
    { kind: 'peer.stop', reason: 'requested' },
    30
  );
  assert.equal(stopped.state.status, 'stopped');
  assert.equal(
    reduceMeshPeer(stopped.state, { kind: 'peer.start' }, 40).state.status,
    'stopped'
  );
  assert.throws(
    () =>
      reduceMeshPeer(
        stopped.state,
        { kind: 'peer.start' },
        stopped.state.lastLogicalTime - 1
      ),
    /cannot move backwards/u
  );
});

test('accepted hello updates liveness after admission and replay state', async () => {
  const state = runningState();
  const envelope = await signedEnvelope('peer.hello', 1);
  const result = await process(state, envelope);

  assert.equal(result.accepted, true);
  assert.equal(result.envelope.messageId, envelope.messageId);
  assert.equal('message' in result, false);
  assert.deepEqual(Object.getOwnPropertySymbols(result), []);
  assert.deepEqual(Object.getOwnPropertySymbols(result.envelope), []);
  assert.throws(
    () =>
      reduceMeshPeer(
        result.state,
        { kind: 'message.accepted', message: result.envelope },
        1_000
      ),
    /Unsupported Mesh reducer input/u
  );
  assert.equal(result.state.peers['peer-a'].status, 'observed');
  assert.equal(result.state.peers['peer-a'].lastObservedAt, 1_000);
  assert.equal(result.state.peers['peer-a'].peerCardId, 'card-a');
  assert.equal(Object.keys(result.state.replay).length, 1);
  assert.equal(
    result.state.messageIds[envelope.messageId],
    1_000 + result.state.limits.messageIdRetentionMs
  );
  assert.deepEqual(
    result.effects.map((effect) => effect.kind),
    ['event.emit']
  );
  assert.equal(result.effects[0].event.type, 'mesh.message.accepted');
  assert.equal('payload' in result.effects[0].event, false);
  assert.equal('proof' in result.effects[0].event, false);
});

test('accepted ping emits an ordered causal acknowledgement intent', async () => {
  const state = runningState();
  const envelope = await signedEnvelope('peer.ping', 1, messageId(11), {
    correlationId: messageId(10),
  });
  const result = await process(state, envelope);

  assert.equal(result.accepted, true);
  assert.deepEqual(
    result.effects.map((effect) => effect.kind),
    ['message.prepare', 'event.emit']
  );
  assert.deepEqual(result.effects[0].intent, {
    type: 'peer.ping_ack',
    audiencePeerId: 'peer-a',
    payload: { type: 'peer.ping_ack' },
    causationId: envelope.messageId,
    correlationId: messageId(10),
    maximumLifetimeMs: 30_000,
  });
  assert.equal(result.state.peers['peer-a'].status, 'observed');
  assert.equal(
    result.state.pendingPreparations[result.effects[0].effectId].type,
    'peer.ping_ack'
  );
});

test('a sent ping is consumed by exactly one matching acknowledgement', async () => {
  const state = runningState();
  const localPingId = messageId(40);
  const withPending = preparePing(state, { id: localPingId }).state;
  assert.equal(withPending.pendingPings[localPingId].peerId, 'peer-a');

  const ack = await signedEnvelope('peer.ping_ack', 1, messageId(41), {
    causationId: localPingId,
  });
  const accepted = await process(withPending, ack);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.state.pendingPings[localPingId], undefined);
  assert.equal(accepted.state.peers['peer-a'].status, 'responsive');
  assert.equal(accepted.state.peers['peer-a'].lastResponsiveAt, 1_000);
  expectRejected(
    await process(accepted.state, ack),
    'message_replayed',
    accepted.state
  );

  const secondAck = await signedEnvelope('peer.ping_ack', 2, messageId(42), {
    causationId: localPingId,
  });
  expectRejected(
    await process(accepted.state, secondAck),
    'causation_rejected',
    accepted.state
  );
});

test('ack causality rejects missing, expired and wrong-peer pings', async () => {
  const state = runningState();
  const ack = await signedEnvelope('peer.ping_ack', 1, messageId(51), {
    causationId: messageId(50),
  });
  expectRejected(await process(state, ack), 'causation_rejected', state);

  const expired = preparePing(state, {
    id: messageId(50),
    expiresAt: 900,
  }).state;
  expectRejected(await process(expired, ack), 'causation_rejected', expired);

  const wrongPeer = preparePing(state, {
    peerId: 'peer-c',
    id: messageId(50),
  }).state;
  expectRejected(
    await process(wrongPeer, ack),
    'causation_rejected',
    wrongPeer
  );
});

test('only an exact pending preparation can create ping causality', () => {
  const state = runningState();
  assert.throws(
    () =>
      reduceMeshPeer(
        state,
        {
          kind: 'effect.result',
          effectId: 'invented',
          status: 'succeeded',
          preparedMessage: {
            messageId: messageId(55),
            type: 'peer.ping',
            audiencePeerId: 'peer-a',
            expiresAt: 2_000,
          },
        },
        100
      ),
    /Unsolicited Mesh preparation result/u
  );

  const requested = reduceMeshPeer(
    state,
    { kind: 'peer.ping', peerId: 'peer-a' },
    100
  );
  const preparation = requested.effects[0];
  assert.equal(preparation.kind, 'message.prepare');
  assert.throws(
    () =>
      reduceMeshPeer(
        requested.state,
        {
          kind: 'effect.result',
          effectId: preparation.effectId,
          status: 'succeeded',
          preparedMessage: {
            messageId: messageId(56),
            type: 'peer.ping',
            audiencePeerId: 'peer-c',
            expiresAt: 2_000,
          },
        },
        101
      ),
    /does not match its effect/u
  );

  const stale = reduceMeshPeer(
    requested.state,
    {
      kind: 'effect.result',
      effectId: preparation.effectId,
      status: 'succeeded',
      preparedMessage: {
        messageId: messageId(57),
        type: 'peer.ping',
        audiencePeerId: 'peer-a',
        expiresAt: 60_000,
      },
    },
    30_100
  );
  assert.equal(stale.state.pendingPings[messageId(57)], undefined);
  assert.equal(
    stale.state.pendingPreparations[preparation.effectId],
    undefined
  );
  assert.deepEqual(
    stale.effects.map((effect) => effect.kind),
    ['event.emit']
  );
});

test('message IDs and sender sequences are independently idempotent', async () => {
  const state = runningState();
  const originalId = messageId(60);
  const first = await process(
    state,
    await signedEnvelope('peer.ping', 1, originalId)
  );
  assert.equal(first.accepted, true);

  expectRejected(
    await process(
      first.state,
      await signedEnvelope('peer.ping', 2, originalId)
    ),
    'message_replayed',
    first.state
  );
  expectRejected(
    await process(
      first.state,
      await signedEnvelope('peer.ping', 1, originalId, {
        sender: {
          peerId: 'peer-c',
          instanceId: 'instance-c',
        },
        proof: {
          algorithm: MESH_SIGNATURE_ALGORITHM,
          keyId: 'key-c',
        },
      })
    ),
    'message_replayed',
    first.state
  );
  expectRejected(
    await process(
      first.state,
      await signedEnvelope('peer.ping', 1, messageId(61))
    ),
    'message_replayed',
    first.state
  );
  expectRejected(
    await process(
      first.state,
      await signedEnvelope('peer.ping', 1, originalId, {
        sender: {
          peerId: 'peer-a',
          instanceId: 'instance-a-2',
        },
      })
    ),
    'message_replayed',
    first.state
  );
});

test('replay window accepts reordering inside 2048 and rejects its boundary', async () => {
  const state = runningState();
  const high = await process(
    state,
    await signedEnvelope('peer.ping', 2_050, messageId(70))
  );
  assert.equal(high.accepted, true);

  expectRejected(
    await process(
      high.state,
      await signedEnvelope('peer.ping', 2, messageId(71))
    ),
    'sequence_outside_window',
    high.state
  );
  const inside = await process(
    high.state,
    await signedEnvelope('peer.ping', 3, messageId(72))
  );
  assert.equal(inside.accepted, true);
  const window = Object.values(inside.state.replay)[0];
  assert.deepEqual(window.seenOffsets, [0, 2_047]);
});

test('scope, audience and freshness reject before verification', async () => {
  const state = runningState();
  let caseIndex = 0;
  for (const [overrides, code] of [
    [{ tenantId: 'tenant-other' }, 'scope_mismatch'],
    [{ meshId: 'mesh-other' }, 'scope_mismatch'],
    [{ audience: { kind: 'peer', peerId: 'peer-other' } }, 'audience_mismatch'],
    [
      {
        sentAt: '2026-07-29T23:59:31Z',
        expiresAt: '2026-07-30T00:00:01Z',
      },
      'message_expired',
    ],
    [
      {
        sentAt: '2026-07-30T00:03:00Z',
        expiresAt: '2026-07-30T00:03:30Z',
      },
      'message_from_future',
    ],
  ]) {
    const envelope = await signedEnvelope(
      'peer.ping',
      1,
      messageId(80 + caseIndex),
      overrides
    );
    caseIndex += 1;
    let verifierCalls = 0;
    const result = await process(state, envelope, {
      verifier: {
        verify(request) {
          verifierCalls += 1;
          return verifier.verify(request);
        },
      },
    });
    expectRejected(result, code, state);
    assert.equal(verifierCalls, 0);
  }
});

test('message-specific lifetimes reject before verification', async () => {
  const state = runningState();
  for (const [type, expiresAt, id] of [
    ['peer.hello', '2026-07-30T00:02:00.000000001Z', messageId(90)],
    ['peer.ping', '2026-07-30T00:00:30.000000001Z', messageId(91)],
    ['peer.ping_ack', '2026-07-30T00:00:30.000000001Z', messageId(92)],
  ]) {
    let verifierCalls = 0;
    const valid = await signedEnvelope(type, 1, id, {
      ...(type === 'peer.ping_ack' ? { causationId: messageId(50) } : {}),
    });
    const envelope = { ...valid, expiresAt };
    const result = await process(state, envelope, {
      verifier: {
        verify() {
          verifierCalls += 1;
          throw new Error('must not be invoked');
        },
      },
    });
    expectRejected(result, 'invalid_envelope', state);
    assert.equal(verifierCalls, 0);
  }
});

test('a peer that is not running rejects before cryptographic work', async () => {
  const state = createdState();
  const envelope = await signedEnvelope('peer.ping', 1, messageId(95));
  let verifierCalls = 0;
  const result = await process(state, envelope, {
    verifier: {
      verify() {
        verifierCalls += 1;
        throw new Error('must not be invoked');
      },
    },
  });
  expectRejected(result, 'peer_not_running', state);
  assert.equal(verifierCalls, 0);
});

test('logical time cannot regress before cryptographic work', async () => {
  const first = await process(
    runningState(),
    await signedEnvelope('peer.ping', 1, messageId(96))
  );
  assert.equal(first.accepted, true);
  let verifierCalls = 0;
  const result = await process(
    first.state,
    await signedEnvelope('peer.ping', 2, messageId(97)),
    {
      receivedAt: 999,
      verifier: {
        verify() {
          verifierCalls += 1;
          throw new Error('must not be invoked');
        },
      },
    }
  );
  expectRejected(result, 'logical_time_regressed', first.state);
  assert.equal(verifierCalls, 0);
});

test('Alpha 2 protocol records stop at the runtime boundary until enabled', async () => {
  const state = runningState();
  const envelope = await signedEnvelope(
    'capability.advertise',
    1,
    messageId(98),
    {
      expiresAt: '2026-07-30T00:02:00Z',
      payload: {
        type: 'capability.advertise',
        advertisementId: 'advertisement-a',
        capabilityId: 'capability-a',
        capabilityRevision: 1,
        ownerPeerId: 'peer-a',
        capabilityKey: 'summarize',
        version: 'v1',
        inputMediaTypes: ['text/plain'],
        outputMediaTypes: ['text/plain'],
        attributes: { language: 'en' },
        validFrom: '2026-07-30T00:00:00Z',
        validUntil: '2026-07-30T00:02:00Z',
      },
    }
  );

  expectRejected(
    await process(state, envelope),
    'unsupported_message_type',
    state
  );
});

test('signed-valid Alpha 2 Objective records stop before the reducer', async () => {
  const state = runningState();
  const payloads = [
    {
      type: 'objective.announce',
      objectiveDocumentId: 'objective-document-a',
      objectiveId: 'objective-a',
      objectiveRevision: 1,
      issuerPeerId: 'peer-a',
      summary: 'Summarize the approved material.',
      successCriteria: ['A concise summary is produced.'],
      permittedCapabilityKeys: ['summarize'],
      maximumWorkItems: 10,
      maximumConcurrentAssignments: 2,
      maximumBudgetUnits: 1000,
      bidWindowMs: 60_000,
      acceptanceWindowMs: 30_000,
      maximumLeaseDurationMs: 3_600_000,
      recoveryGraceMs: 60_000,
      maximumLeaseRenewals: 3,
      recoveryWitnessPeerIds: ['peer-b', 'peer-c', 'peer-d'],
      recoveryWitnessThreshold: 2,
      validFrom: '2026-07-30T00:00:00Z',
      validUntil: '2026-08-29T00:00:00Z',
    },
    {
      type: 'objective.revise',
      objectiveDocumentId: 'objective-document-b',
      objectiveId: 'objective-a',
      objectiveRevision: 2,
      issuerPeerId: 'peer-a',
      summary: 'Summarize the approved material with sources.',
      successCriteria: ['A concise summary includes sources.'],
      permittedCapabilityKeys: ['summarize'],
      maximumWorkItems: 10,
      maximumConcurrentAssignments: 2,
      maximumBudgetUnits: 1000,
      bidWindowMs: 60_000,
      acceptanceWindowMs: 30_000,
      maximumLeaseDurationMs: 3_600_000,
      recoveryGraceMs: 60_000,
      maximumLeaseRenewals: 3,
      recoveryWitnessPeerIds: ['peer-b', 'peer-c', 'peer-d'],
      recoveryWitnessThreshold: 2,
      validFrom: '2026-07-30T00:00:00Z',
      validUntil: '2026-08-29T00:00:00Z',
      previousObjectiveDocumentId: 'objective-document-a',
    },
    {
      type: 'objective.cancel',
      cancellationId: 'cancellation-a',
      objectiveId: 'objective-a',
      objectiveRevision: 2,
      objectiveDocumentId: 'objective-document-b',
    },
  ];
  for (const [index, payload] of payloads.entries()) {
    const envelope = await signedEnvelope(
      payload.type,
      1,
      messageId(130 + index),
      {
        objectiveId: 'objective-a',
        audience: { kind: 'peer', peerId: 'peer-b' },
        expiresAt:
          index === 2 ? '2026-07-30T00:02:00Z' : '2026-07-30T00:05:00Z',
        ...(index === 0 ? {} : { causationId: messageId(120 + index) }),
        payload,
      }
    );
    expectRejected(
      await process(state, envelope),
      'unsupported_message_type',
      state
    );
  }
});

test('signed-valid Alpha 2 Work and Lease records stop before the reducer', async () => {
  const state = runningState();
  const payloads = [
    {
      type: 'work.offer',
      offerId: 'offer-a',
      objectiveId: 'objective-a',
      objectiveDocumentId: 'objective-document-a',
      objectiveRevision: 1,
      workItemId: 'work-item-a',
      workItemRevision: 1,
      ownerPeerId: 'peer-a',
      ownerEpoch: 1,
      offerAttempt: 1,
      requiredCapabilityKeys: ['summarize'],
      matchingAttributes: { language: 'en' },
      inputSummary: 'Summarize the approved material.',
      completionCriteria: ['Return a concise summary.'],
      budgetReservationUnits: 100,
      bidDeadline: '2026-07-30T00:01:00Z',
      workDeadline: '2026-07-30T01:00:00Z',
    },
    {
      type: 'work.bid',
      bidId: 'bid-a',
      bidRevision: 1,
      offerId: 'offer-a',
      objectiveId: 'objective-a',
      objectiveDocumentId: 'objective-document-a',
      objectiveRevision: 1,
      workItemId: 'work-item-a',
      workItemRevision: 1,
      ownerPeerId: 'peer-b',
      ownerEpoch: 1,
      offerAttempt: 1,
      bidderPeerId: 'peer-a',
      advertisementId: 'advertisement-a',
      capabilityId: 'capability-a',
      capabilityRevision: 1,
      capacityReservationUnits: 1,
      budgetUnits: 100,
      bidDeadline: '2026-07-30T00:01:00Z',
      workDeadline: '2026-07-30T01:00:00Z',
      expectedCompletionAt: '2026-07-30T00:30:00Z',
      bidExpiresAt: '2026-07-30T00:00:30Z',
      assumptions: [],
    },
    {
      type: 'work.award',
      awardId: 'award-a',
      offerId: 'offer-a',
      bidId: 'bid-a',
      bidRevision: 1,
      objectiveId: 'objective-a',
      objectiveDocumentId: 'objective-document-a',
      objectiveRevision: 1,
      workItemId: 'work-item-a',
      workItemRevision: 1,
      ownerPeerId: 'peer-a',
      ownerEpoch: 1,
      offerAttempt: 1,
      assigneePeerId: 'peer-b',
      assignmentEpoch: 1,
      authorityKind: 'award',
      assignmentAuthorityId: 'award-a',
      fencingToken: 'award-a',
      budgetReservationUnits: 100,
      workDeadline: '2026-07-30T01:00:00Z',
      leaseStartsAt: '2026-07-30T00:00:00Z',
      leaseExpiresAt: '2026-07-30T00:30:00Z',
      acceptanceDeadline: '2026-07-30T00:15:00Z',
    },
    {
      type: 'work.accept',
      acceptanceId: 'acceptance-a',
      awardId: 'award-a',
      objectiveId: 'objective-a',
      objectiveDocumentId: 'objective-document-a',
      objectiveRevision: 1,
      workItemId: 'work-item-a',
      workItemRevision: 1,
      ownerPeerId: 'peer-b',
      ownerEpoch: 1,
      assigneePeerId: 'peer-a',
      assignmentEpoch: 1,
      assignmentAuthorityId: 'award-a',
      fencingToken: 'award-a',
      acceptanceDeadline: '2026-07-30T00:15:00Z',
    },
    {
      type: 'work.decline',
      declineId: 'decline-a',
      awardId: 'award-a',
      objectiveId: 'objective-a',
      objectiveDocumentId: 'objective-document-a',
      objectiveRevision: 1,
      workItemId: 'work-item-a',
      workItemRevision: 1,
      ownerPeerId: 'peer-b',
      ownerEpoch: 1,
      assigneePeerId: 'peer-a',
      assignmentEpoch: 1,
      assignmentAuthorityId: 'award-a',
      fencingToken: 'award-a',
      acceptanceDeadline: '2026-07-30T00:15:00Z',
    },
    {
      type: 'work.progress',
      progressId: 'progress-a',
      progressSequence: 1,
      progressSummary: 'The assigned peer has started the summary.',
      objectiveId: 'objective-a',
      objectiveDocumentId: 'objective-document-a',
      objectiveRevision: 1,
      workItemId: 'work-item-a',
      workItemRevision: 1,
      ownerPeerId: 'peer-b',
      ownerEpoch: 1,
      assigneePeerId: 'peer-a',
      awardId: 'award-a',
      acceptanceId: 'acceptance-a',
      assignmentEpoch: 1,
      assignmentAuthorityId: 'award-a',
      fencingToken: 'award-a',
      leaseExpiresAt: '2026-07-30T00:30:00Z',
    },
    {
      type: 'work.checkpoint',
      checkpointId: 'checkpoint-a',
      checkpointSequence: 1,
      checkpointDigest: 'sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      checkpointSummary: 'Source selection is complete.',
      objectiveId: 'objective-a',
      objectiveDocumentId: 'objective-document-a',
      objectiveRevision: 1,
      workItemId: 'work-item-a',
      workItemRevision: 1,
      ownerPeerId: 'peer-b',
      ownerEpoch: 1,
      assigneePeerId: 'peer-a',
      awardId: 'award-a',
      acceptanceId: 'acceptance-a',
      assignmentEpoch: 1,
      assignmentAuthorityId: 'award-a',
      fencingToken: 'award-a',
      leaseExpiresAt: '2026-07-30T00:30:00Z',
    },
    {
      type: 'work.result',
      resultId: 'result-a',
      resultDigest: 'sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      checkpointId: 'checkpoint-a',
      resultSummary: 'A concise summary was produced.',
      objectiveId: 'objective-a',
      objectiveDocumentId: 'objective-document-a',
      objectiveRevision: 1,
      workItemId: 'work-item-a',
      workItemRevision: 1,
      ownerPeerId: 'peer-b',
      ownerEpoch: 1,
      assigneePeerId: 'peer-a',
      awardId: 'award-a',
      acceptanceId: 'acceptance-a',
      assignmentEpoch: 1,
      assignmentAuthorityId: 'award-a',
      fencingToken: 'award-a',
      leaseExpiresAt: '2026-07-30T00:30:00Z',
    },
    {
      type: 'work.release',
      releaseId: 'release-a',
      releaseAuthority: 'assignee',
      releaseDisposition: 'reoffer',
      objectiveId: 'objective-a',
      objectiveDocumentId: 'objective-document-a',
      objectiveRevision: 1,
      workItemId: 'work-item-a',
      workItemRevision: 1,
      ownerPeerId: 'peer-b',
      ownerEpoch: 1,
      assigneePeerId: 'peer-a',
      awardId: 'award-a',
      assignmentEpoch: 1,
      assignmentAuthorityId: 'award-a',
      fencingToken: 'award-a',
      leaseExpiresAt: '2026-07-30T00:30:00Z',
      acceptanceId: 'acceptance-a',
    },
    {
      type: 'work.cancel',
      cancellationId: 'work-cancellation-a',
      assignmentState: 'active',
      objectiveId: 'objective-a',
      objectiveDocumentId: 'objective-document-a',
      objectiveRevision: 1,
      workItemId: 'work-item-a',
      workItemRevision: 1,
      ownerPeerId: 'peer-a',
      ownerEpoch: 1,
      assigneePeerId: 'peer-b',
      awardId: 'award-a',
      assignmentEpoch: 1,
      assignmentAuthorityId: 'award-a',
      fencingToken: 'award-a',
      leaseExpiresAt: '2026-07-30T00:30:00Z',
      acceptanceId: 'acceptance-a',
    },
    {
      type: 'lease.renew',
      leaseRenewalId: 'lease-renewal-a',
      leaseRenewalSequence: 1,
      objectiveId: 'objective-a',
      objectiveDocumentId: 'objective-document-a',
      objectiveRevision: 1,
      workItemId: 'work-item-a',
      workItemRevision: 1,
      ownerPeerId: 'peer-b',
      ownerEpoch: 1,
      assigneePeerId: 'peer-a',
      awardId: 'award-a',
      acceptanceId: 'acceptance-a',
      assignmentEpoch: 1,
      assignmentAuthorityId: 'award-a',
      fencingToken: 'award-a',
      leaseExpiresAt: '2026-07-30T00:30:00Z',
      renewedLeaseExpiresAt: '2026-07-30T01:00:00Z',
    },
    {
      type: 'lease.takeover_proposal',
      takeoverProposalId: 'takeover-proposal-a',
      proposalAuthority: 'witness',
      proposerPeerId: 'peer-a',
      proposedAssigneePeerId: 'peer-c',
      proposedAssignmentEpoch: 2,
      objectiveId: 'objective-a',
      objectiveDocumentId: 'objective-document-a',
      objectiveRevision: 1,
      workItemId: 'work-item-a',
      workItemRevision: 1,
      ownerPeerId: 'peer-a',
      ownerEpoch: 1,
      assigneePeerId: 'peer-b',
      awardId: 'award-a',
      acceptanceId: 'acceptance-a',
      assignmentEpoch: 1,
      assignmentAuthorityId: 'award-a',
      fencingToken: 'award-a',
      leaseExpiresAt: '2026-07-30T00:30:00Z',
      leaseRenewalSequence: 0,
    },
  ];
  for (const [index, payload] of payloads.entries()) {
    const envelope = await signedEnvelope(
      payload.type,
      1,
      messageId(140 + index),
      {
        objectiveId: 'objective-a',
        audience: { kind: 'peer', peerId: 'peer-b' },
        expiresAt: '2026-07-30T00:00:30Z',
        ...(payload.type === 'work.bid' ||
        (payload.type.startsWith('work.') && payload.type !== 'work.offer') ||
        payload.type === 'lease.renew' ||
        payload.type === 'lease.takeover_proposal'
          ? { causationId: messageId(139) }
          : {}),
        payload,
      }
    );
    expectRejected(
      await process(state, envelope),
      'unsupported_message_type',
      state
    );
  }
});

test('admission and authority failures preserve the original state', async () => {
  const cases = [
    {
      state: runningState(),
      envelope: () =>
        signedEnvelope('peer.hello', 1, messageId(100), {
          payload: {
            type: 'peer.hello',
            peerCardId: 'card-other',
            cardRevision: 1,
          },
        }),
      code: 'message_not_authorized',
    },
    {
      state: runningState(),
      envelope: () =>
        signedEnvelope('peer.hello', 1, messageId(105), {
          payload: {
            type: 'peer.hello',
            peerCardId: 'card-a',
            cardRevision: 2,
          },
        }),
      code: 'message_not_authorized',
    },
    {
      state: runningState(),
      envelope: () =>
        signedEnvelope('peer.hello', 1, messageId(106), {
          causationId: messageId(8_999),
        }),
      code: 'message_not_authorized',
    },
    {
      state: runningState({
        admittedPeers: admissions({
          validUntil: verifiedAt,
        }),
      }),
      envelope: () => signedEnvelope('peer.ping', 1, messageId(101)),
      code: 'sender_admission_expired',
    },
    {
      state: runningState(),
      envelope: () =>
        signedEnvelope('peer.ping', 1, messageId(102), {
          sender: { peerId: 'peer-a', instanceId: 'instance-unknown' },
        }),
      code: 'sender_instance_not_admitted',
    },
    {
      state: runningState(),
      envelope: () =>
        signedEnvelope('peer.ping', 1, messageId(104), {
          sender: {
            peerId: 'peer-unknown',
            instanceId: 'instance-unknown',
          },
          proof: {
            algorithm: MESH_SIGNATURE_ALGORITHM,
            keyId: 'key-unknown',
          },
        }),
      code: 'sender_not_admitted',
    },
  ];
  for (const entry of cases) {
    const result = await process(entry.state, await entry.envelope());
    expectRejected(result, entry.code, entry.state);
  }

  const state = runningState();
  const envelope = await signedEnvelope('peer.ping', 1, messageId(103));
  for (const decision of [
    () => false,
    () => 'true',
    () => Promise.resolve(true),
    () => {
      throw new Error('policy store failed');
    },
  ]) {
    const result = await process(state, envelope, {
      admissionPolicy: { isPeerAdmitted: decision },
    });
    expectRejected(result, 'message_not_authorized', state);
  }
});

test('cryptographic rejection never invokes admission', async () => {
  const state = runningState();
  const envelope = await signedEnvelope('peer.ping', 1, messageId(110));
  const tampered = validateSignedMeshEnvelope({
    ...envelope,
    proof: {
      ...envelope.proof,
      value: `${envelope.proof.value[0] === 'A' ? 'B' : 'A'}${envelope.proof.value.slice(1)}`,
    },
  });
  assert.equal(tampered.ok, true);
  let admissionCalls = 0;
  const result = await process(state, tampered.value, {
    admissionPolicy: {
      isPeerAdmitted() {
        admissionCalls += 1;
        return true;
      },
    },
  });
  expectRejected(result, 'signature_invalid', state);
  assert.equal(admissionCalls, 0);
});

test('replay capacity fails closed and prunes only expired IDs', async () => {
  const base = runningState({
    limits: {
      maximumTrackedMessageIds: 2_048,
    },
  });
  const activeEntries = Array.from({ length: 2_048 }, (_, index) => [
    messageId(20_000 + index),
    2_000,
  ]);
  const activeState = Object.freeze({
    ...base,
    messageIds: frozenRecord(activeEntries),
  });
  const envelope = await signedEnvelope('peer.ping', 1, messageId(30_000));
  expectRejected(
    await process(activeState, envelope),
    'replay_capacity_exceeded',
    activeState
  );

  const expiringState = Object.freeze({
    ...base,
    messageIds: frozenRecord(activeEntries.map(([id]) => [id, 1_000])),
  });
  const accepted = await process(expiringState, envelope);
  assert.equal(accepted.accepted, true);
  assert.deepEqual(Object.keys(accepted.state.messageIds), [
    envelope.messageId,
  ]);
});

test('the coordinator rejects non-canonical frozen security snapshots', async () => {
  const state = runningState();
  const envelope = await signedEnvelope('peer.ping', 1, messageId(120));
  const forgedWindow = Object.freeze({
    highestSequence: 1,
    seenOffsets: Object.freeze([0]),
  });
  const forged = Object.freeze({
    ...state,
    replay: frozenRecord([['["peer-a","instance-rogue"]', forgedWindow]]),
  });
  await assert.rejects(
    process(forged, envelope),
    /Mesh replay state is not canonical/u
  );
});

function frozenRecord(entries) {
  const record = Object.create(null);
  for (const [key, value] of entries) record[key] = value;
  return Object.freeze(record);
}
