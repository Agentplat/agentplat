import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DEFAULT_MESH_CRYPTO_POLICY,
  createStaticMeshKeyResolver,
  signMeshEnvelope,
} from '@agentplat/mesh-crypto';
import {
  advanceMeshDiscoveryState,
  createMeshCoordinationInboundState,
  createMeshCoordinationState,
  createMeshDiscoveryInboundProcessor,
  createMeshDiscoveryInboundRuntimeState,
  createMeshDiscoveryRuntimeState,
  createMeshDiscoveryState,
  restoreMeshCoordinationInboundState,
} from '@agentplat/mesh/coordination';
import { MESH_SIGNATURE_ALGORITHM } from '@agentplat/mesh-protocol';

const fixtureRoot = new URL(
  '../packages/mesh-protocol/fixtures/v0/',
  import.meta.url
);
const peerCardFixture = fixture('peer-card.json');
const capabilityFixture = fixture('capability-advertise.json');
const verifiedAt = '2026-07-30T00:00:01.000Z';
let keyPair;
let resolver;
let processor;

test.before(async () => {
  keyPair = await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
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
      publicKey: keyPair.publicKey,
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2027-01-01T00:00:00.000Z',
      status: 'active',
    },
  ]);
  processor = createProcessor();
});

function fixture(name) {
  return JSON.parse(readFileSync(new URL(name, fixtureRoot), 'utf8'));
}

function messageId(value) {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(12, value);
  return Buffer.from(bytes).toString('base64url');
}

function identity() {
  return {
    tenantId: 'tenant-a',
    meshId: 'mesh-a',
    peerId: 'peer-b',
    instanceId: 'instance-b',
    keyId: 'key-b',
  };
}

function admission(peerId = 'peer-a', instances = ['instance-a']) {
  return {
    peerId,
    instanceIds: instances,
    validUntil: '2027-01-01T00:00:00.000Z',
  };
}

function runtime({
  admittedPeers = [admission()],
  subscriptions = ['membership', 'capability'],
  inboundLimits,
} = {}) {
  const local = identity();
  return createMeshDiscoveryInboundRuntimeState(
    createMeshCoordinationState({ identity: local }),
    createMeshDiscoveryState({ identity: local, admittedPeers, subscriptions }),
    createMeshCoordinationInboundState({
      identity: local,
      limits: inboundLimits,
    })
  );
}

async function signedFixture(
  fixtureValue,
  sequence,
  messageNumber,
  overrides = {}
) {
  const envelope = structuredClone(fixtureValue);
  envelope.messageId = messageId(messageNumber);
  envelope.sequence = sequence;
  Object.assign(envelope, overrides);
  return signMeshEnvelope({ envelope, privateKey: keyPair.privateKey });
}

function request(envelope, overrides = {}) {
  return {
    envelope,
    receivedAt: 1_000,
    verifiedAt,
    ...overrides,
  };
}

function createProcessor(overrides = {}) {
  return createMeshDiscoveryInboundProcessor({
    resolver,
    cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
    ...overrides,
  });
}

function rejected(result, code, state) {
  assert.deepEqual(result, { accepted: false, code, state });
  assert.equal(result.state, state);
  assert.equal('effects' in result, false);
}

test('inbound security state restores only strict frozen null-prototype snapshots', () => {
  const state = createMeshCoordinationInboundState({ identity: identity() });
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.replay), true);
  assert.equal(Object.getPrototypeOf(state.replay), null);
  assert.equal(Object.isFrozen(state.messageIds), true);
  assert.equal(Object.getPrototypeOf(state.messageIds), null);
  assert.deepEqual(
    restoreMeshCoordinationInboundState(structuredClone(state)),
    state
  );

  assert.throws(
    () =>
      restoreMeshCoordinationInboundState({
        ...structuredClone(state),
        unexpected: true,
      }),
    /unsupported fields/u
  );
  assert.throws(
    () =>
      restoreMeshCoordinationInboundState({
        ...structuredClone(state),
        replay: {
          '["peer-a","instance-a"]': {
            highestSequence: 1,
            seenOffsets: [0, 0],
          },
        },
      }),
    /replay window is invalid/u
  );
  assert.throws(
    () =>
      createMeshCoordinationInboundState({
        identity: identity(),
        limits: { replayWindowSize: 1 },
      }),
    /weaken protocol replay bounds/u
  );
  assert.throws(
    () =>
      restoreMeshCoordinationInboundState({
        ...structuredClone(state),
        messageIds: {
          [messageId(99)]: Number.MAX_SAFE_INTEGER,
        },
      }),
    /message-id retention is invalid/u
  );

  const aligned = runtime();
  assert.throws(
    () =>
      createMeshDiscoveryInboundRuntimeState(
        aligned.coordination,
        aligned.discovery,
        createMeshCoordinationInboundState({
          identity: { ...identity(), peerId: 'peer-other' },
        })
      ),
    /not aligned/u
  );
  const unadmittedReplay = structuredClone(aligned.inbound);
  unadmittedReplay.replay[JSON.stringify(['peer-other', 'instance-other'])] = {
    highestSequence: 1,
    seenOffsets: [0],
  };
  assert.throws(
    () =>
      createMeshDiscoveryInboundRuntimeState(
        aligned.coordination,
        aligned.discovery,
        restoreMeshCoordinationInboundState(unadmittedReplay)
      ),
    /not admitted/u
  );
});

test('composed inbound accepts a discovery clock lead and enforces the maximum logical time', async () => {
  const initial = runtime();
  const advanced = advanceMeshDiscoveryState(
    createMeshDiscoveryRuntimeState(initial.coordination, initial.discovery),
    10
  );
  assert.equal(advanced.accepted, true);
  const composed = createMeshDiscoveryInboundRuntimeState(
    advanced.state.coordination,
    advanced.state.discovery,
    initial.inbound
  );
  const envelope = await signedFixture(peerCardFixture, 1, 100);
  rejected(
    await processor.process(composed, request(envelope, { receivedAt: 9 })),
    'logical_time_regressed',
    composed
  );
  assert.equal(
    (await processor.process(composed, request(envelope, { receivedAt: 10 })))
      .accepted,
    true
  );
});

test('signed Peer Cards and direct capability declarations enter only through the authenticated boundary', async () => {
  const initial = runtime();
  const card = await signedFixture(peerCardFixture, 1, 1);
  const acceptedCard = await processor.process(initial, request(card));
  assert.equal(acceptedCard.accepted, true);
  assert.equal(acceptedCard.duplicate, false);
  assert.equal(
    acceptedCard.state.discovery.peerCards['peer-a'].cardRevision,
    1
  );
  assert.equal(Object.isFrozen(acceptedCard.state.inbound), true);

  const directCapability = await signedFixture(capabilityFixture, 2, 2, {
    audience: { kind: 'peer', peerId: 'peer-b' },
  });
  const acceptedCapability = await processor.process(
    acceptedCard.state,
    request(directCapability, { receivedAt: 1_001 })
  );
  assert.equal(acceptedCapability.accepted, true);
  assert.equal(
    acceptedCapability.state.discovery.capabilities[
      JSON.stringify(['peer-a', 'capability-a'])
    ].status,
    'active'
  );
  assert.equal('effects' in acceptedCapability, false);
  assert.equal('relay' in acceptedCapability, false);
});

test('context, topic and message-family failures occur before key resolution', async () => {
  const initial = runtime({ subscriptions: ['membership'] });
  const cases = [
    [
      await signedFixture(peerCardFixture, 1, 10, { tenantId: 'tenant-other' }),
      'scope_mismatch',
    ],
    [
      await signedFixture(peerCardFixture, 2, 11, {
        audience: { kind: 'peer', peerId: 'peer-other' },
      }),
      'audience_mismatch',
    ],
    [await signedFixture(capabilityFixture, 3, 12), 'topic_not_subscribed'],
    [
      await signedFixture(peerCardFixture, 4, 13),
      'message_expired',
      { verifiedAt: '2026-07-30T00:02:00.000Z' },
    ],
    [
      await signedFixture(peerCardFixture, 5, 14),
      'message_from_future',
      { verifiedAt: '2026-07-29T23:55:00.000Z' },
    ],
    [
      await signedFixture(peerCardFixture, 6, 15, {
        extensions: { trace: { sampled: true } },
        criticalExtensions: ['trace'],
      }),
      'unknown_critical_extension',
    ],
    [
      await signedFixture(peerCardFixture, 7, 16, {
        type: 'peer.hello',
        payload: { type: 'peer.hello', peerCardId: 'card-a', cardRevision: 1 },
      }),
      'unsupported_message_type',
    ],
  ];
  for (const [envelope, code, requestOverrides = {}] of cases) {
    let calls = 0;
    const countingProcessor = createProcessor({
      resolver: {
        resolve() {
          calls += 1;
          throw new Error('must not resolve contextual failures');
        },
      },
    });
    const result = await countingProcessor.process(
      initial,
      request(envelope, requestOverrides)
    );
    rejected(result, code, initial);
    assert.equal(calls, 0);
  }
});

test('the configured cryptographic boundary rejects invalid material and request-level substitution', async () => {
  const initial = runtime();
  const envelope = await signedFixture(peerCardFixture, 1, 20);
  rejected(
    await createProcessor({
      resolver: createStaticMeshKeyResolver([]),
    }).process(initial, request(envelope)),
    'key_not_found',
    initial
  );
  rejected(
    await processor.process(
      initial,
      request({
        ...envelope,
        payloadHash: `sha256:${'A'.repeat(43)}`,
      })
    ),
    'payload_hash_mismatch',
    initial
  );
  const invalidSignatureEnvelope = {
    ...envelope,
    proof: {
      ...envelope.proof,
      value: `${envelope.proof.value[0] === 'A' ? 'B' : 'A'}${envelope.proof.value.slice(1)}`,
    },
  };
  rejected(
    await processor.process(initial, request(invalidSignatureEnvelope)),
    'signature_invalid',
    initial
  );
  const subtle = globalThis.crypto.subtle;
  const mutableCrypto = {
    subtle: {
      digest: subtle.digest.bind(subtle),
      verify: subtle.verify.bind(subtle),
    },
  };
  const cryptoBoundProcessor = createProcessor({ crypto: mutableCrypto });
  mutableCrypto.subtle.verify = async () => true;
  rejected(
    await cryptoBoundProcessor.process(
      initial,
      request(invalidSignatureEnvelope)
    ),
    'signature_invalid',
    initial
  );
  await assert.rejects(
    processor.process(initial, {
      ...request(envelope),
      verifier: {
        async verify() {
          return { verified: true, envelope };
        },
      },
      crypto: globalThis.crypto,
      resolver,
    }),
    /Invalid Mesh discovery inbound request/
  );
});

test('admission, instance and expiry are enforced after verification and before replay mutation', async () => {
  const envelope = await signedFixture(peerCardFixture, 1, 30);
  const unadmitted = runtime({ admittedPeers: [] });
  rejected(
    await processor.process(unadmitted, request(envelope)),
    'sender_not_admitted',
    unadmitted
  );
  const wrongInstanceEnvelope = await signedFixture(peerCardFixture, 2, 31, {
    sender: { peerId: 'peer-a', instanceId: 'instance-other' },
    payload: { ...peerCardFixture.payload, instanceId: 'instance-other' },
  });
  const wrongInstance = runtime();
  rejected(
    await processor.process(wrongInstance, request(wrongInstanceEnvelope)),
    'sender_instance_not_admitted',
    wrongInstance
  );
  const expired = runtime({
    admittedPeers: [{ ...admission(), validUntil: '2026-07-30T00:00:01.000Z' }],
  });
  rejected(
    await processor.process(expired, request(envelope)),
    'sender_admission_expired',
    expired
  );
});

test('replay and domain rules retain security state but never apply invalid projections', async () => {
  const initial = runtime({
    admittedPeers: [admission('peer-a', ['instance-a', 'instance-a-2'])],
  });
  const invalidRevision = await signedFixture(peerCardFixture, 1, 40, {
    causationId: messageId(39),
    payload: {
      ...peerCardFixture.payload,
      peerCardId: 'card-a-v2',
      cardRevision: 2,
      previousPeerCardId: 'card-a',
    },
  });
  const invalid = await processor.process(initial, request(invalidRevision));
  assert.equal(invalid.accepted, false);
  assert.equal(invalid.code, 'peer_card_revision_invalid');
  assert.equal(invalid.state.discovery, initial.discovery);
  assert.notEqual(invalid.state.inbound, initial.inbound);
  rejected(
    await processor.process(invalid.state, request(invalidRevision)),
    'message_replayed',
    invalid.state
  );

  const first = await processor.process(
    initial,
    request(await signedFixture(peerCardFixture, 1, 41), { receivedAt: 1_001 })
  );
  assert.equal(first.accepted, true);
  const duplicate = await processor.process(
    first.state,
    request(await signedFixture(peerCardFixture, 2, 42), { receivedAt: 1_002 })
  );
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.duplicate, true);
  const conflict = await processor.process(
    duplicate.state,
    request(
      await signedFixture(peerCardFixture, 3, 43, {
        payload: {
          ...peerCardFixture.payload,
          transportHints: ['https://conflict.example.test/mesh'],
        },
      }),
      { receivedAt: 1_003 }
    )
  );
  assert.equal(conflict.accepted, false);
  assert.equal(conflict.code, 'domain_record_conflict');
  assert.equal(conflict.state.discovery, duplicate.state.discovery);
  assert.notEqual(conflict.state.inbound, duplicate.state.inbound);

  const high = await processor.process(
    initial,
    request(await signedFixture(peerCardFixture, 2_050, 44), {
      receivedAt: 1_004,
    })
  );
  assert.equal(high.accepted, true);
  rejected(
    await processor.process(
      high.state,
      request(await signedFixture(peerCardFixture, 2, 45), {
        receivedAt: 1_005,
      })
    ),
    'sequence_outside_window',
    high.state
  );

  const oneWindow = runtime({
    admittedPeers: [admission('peer-a', ['instance-a', 'instance-a-2'])],
    inboundLimits: { maximumReplayWindows: 1 },
  });
  const oneWindowFirst = await processor.process(
    oneWindow,
    request(await signedFixture(peerCardFixture, 1, 46), {
      receivedAt: 1_006,
    })
  );
  assert.equal(oneWindowFirst.accepted, true);
  const siblingInstance = await signedFixture(peerCardFixture, 1, 47, {
    sender: { peerId: 'peer-a', instanceId: 'instance-a-2' },
    payload: { ...peerCardFixture.payload, instanceId: 'instance-a-2' },
  });
  rejected(
    await processor.process(
      oneWindowFirst.state,
      request(siblingInstance, { receivedAt: 1_007 })
    ),
    'replay_capacity_exceeded',
    oneWindowFirst.state
  );

  const boundedIds = runtime({
    inboundLimits: { maximumTrackedMessageIds: 2_048 },
  });
  const saturatedSnapshot = structuredClone(boundedIds.inbound);
  for (let index = 0; index < 2_048; index += 1) {
    saturatedSnapshot.messageIds[messageId(10_000 + index)] = 10_000;
  }
  const saturated = createMeshDiscoveryInboundRuntimeState(
    boundedIds.coordination,
    boundedIds.discovery,
    restoreMeshCoordinationInboundState(saturatedSnapshot)
  );
  rejected(
    await processor.process(
      saturated,
      request(await signedFixture(peerCardFixture, 1, 48), {
        receivedAt: 1_008,
      })
    ),
    'replay_capacity_exceeded',
    saturated
  );
});

test('processor policy and protocol options are snapshotted at construction', async () => {
  const initial = runtime();
  const envelope = await signedFixture(peerCardFixture, 1, 50);
  const mutablePolicy = { allowedAlgorithms: ['Ed25519'] };
  const mutableOptions = { limits: {} };
  const configuredProcessor = createProcessor({
    cryptoPolicy: mutablePolicy,
    protocolOptions: mutableOptions,
  });
  mutablePolicy.allowedAlgorithms.length = 0;
  mutableOptions.limits.maximumIdBytes = 1;
  const result = await configuredProcessor.process(initial, request(envelope));
  assert.equal(result.accepted, true);
  assert.equal(result.state.inbound.lastLogicalTime, 1_000);
});
