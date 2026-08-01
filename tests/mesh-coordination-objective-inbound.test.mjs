import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DEFAULT_MESH_CRYPTO_POLICY,
  createStaticMeshKeyResolver,
  createWebCryptoMeshEnvelopeSigner,
} from '@agentplat/mesh-crypto';
import {
  createMeshCoordinationInboundState,
  createMeshCoordinationState,
  createMeshDiscoveryInboundProcessor,
  createMeshDiscoveryInboundRuntimeState,
  createMeshDiscoveryState,
  createMeshObjectiveInboundProcessor,
  createMeshObjectiveInboundRuntimeState,
  createMeshObjectiveWorkState,
  restoreMeshCoordinationInboundState,
} from '@agentplat/mesh/coordination';
import { MESH_SIGNATURE_ALGORITHM } from '@agentplat/mesh-protocol';

const fixtureRoot = new URL(
  '../packages/mesh-protocol/fixtures/v0/',
  import.meta.url
);
const announceFixture = fixture('objective-announce.json');
const reviseFixture = fixture('objective-revise.json');
const cancelFixture = fixture('objective-cancel.json');
const peerCardFixture = fixture('peer-card.json');
const verifiedAt = '2026-07-30T00:00:01.000Z';
const dualWireSigner = createWebCryptoMeshEnvelopeSigner({
  signingPolicy: { allowedWireVersions: [0, 1] },
});
let keyPair;
let resolver;
let objectiveProcessor;
let discoveryProcessor;

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
  objectiveProcessor = createObjectiveProcessor();
  discoveryProcessor = createMeshDiscoveryInboundProcessor({
    resolver,
    cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
  });
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

function admission(instances = ['instance-a']) {
  return {
    peerId: 'peer-a',
    instanceIds: instances,
    validUntil: '2027-01-01T00:00:00.000Z',
  };
}

function runtime({
  subscriptions = ['objective', 'membership'],
  admittedPeers = [admission()],
  authorities = [
    {
      peerId: 'peer-a',
      keyIds: ['key-a'],
      validUntil: '2027-01-01T00:00:00.000Z',
    },
  ],
  inboundLimits,
  objectiveLimits,
} = {}) {
  const local = identity();
  return createMeshObjectiveInboundRuntimeState(
    createMeshCoordinationState({ identity: local }),
    createMeshDiscoveryState({ identity: local, subscriptions, admittedPeers }),
    createMeshObjectiveWorkState({
      identity: local,
      issuerAuthorities: authorities,
      ...(objectiveLimits === undefined ? {} : { limits: objectiveLimits }),
    }),
    createMeshCoordinationInboundState({
      identity: local,
      ...(inboundLimits === undefined ? {} : { limits: inboundLimits }),
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
  return dualWireSigner.sign({
    envelope,
    privateKey: keyPair.privateKey,
  });
}

function request(envelope, overrides = {}) {
  return { envelope, receivedAt: 1_000, verifiedAt, ...overrides };
}

function createObjectiveProcessor(overrides = {}) {
  return createMeshObjectiveInboundProcessor({
    resolver,
    cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
    ...overrides,
  });
}

function rejected(result, code, state) {
  assert.deepEqual(result, { accepted: false, code, state });
}

test('authenticated Objective announce, revise and cancel apply in causal order', async () => {
  const initial = runtime();
  const announce = await signedFixture(announceFixture, 6, 1);
  const announced = await objectiveProcessor.process(
    initial,
    request(announce)
  );
  assert.equal(announced.accepted, true);
  assert.equal(announced.duplicate, false);
  assert.deepEqual(announced.envelope, announce);
  assert.equal(
    announced.state.objectives.objectives['objective-a'].objectiveRevision,
    1
  );

  const revised = await objectiveProcessor.process(
    announced.state,
    request(
      await signedFixture(reviseFixture, 7, 2, { causationId: messageId(1) }),
      { receivedAt: 1_001 }
    )
  );
  assert.equal(revised.accepted, true);
  assert.equal(
    revised.state.objectives.objectives['objective-a'].objectiveRevision,
    2
  );

  const cancelled = await objectiveProcessor.process(
    revised.state,
    request(
      await signedFixture(cancelFixture, 8, 3, { causationId: messageId(2) }),
      { receivedAt: 1_002 }
    )
  );
  assert.equal(cancelled.accepted, true);
  assert.equal(
    cancelled.state.objectives.objectives['objective-a'].status,
    'cancelled'
  );
  assert.equal(cancelled.state.inbound.lastLogicalTime, 1_002);
});

test('Objective context and family failures occur before key resolution', async () => {
  const initial = runtime({ subscriptions: ['membership'] });
  const cases = [
    [
      await signedFixture(announceFixture, 6, 10, { tenantId: 'tenant-other' }),
      'scope_mismatch',
    ],
    [await signedFixture(announceFixture, 7, 11), 'topic_not_subscribed'],
    [await signedFixture(peerCardFixture, 8, 12), 'unsupported_message_type'],
  ];
  for (const [envelope, code] of cases) {
    let calls = 0;
    const processor = createObjectiveProcessor({
      resolver: {
        resolve() {
          calls += 1;
          throw new Error('context should reject before resolving a key');
        },
      },
    });
    rejected(
      await processor.process(initial, request(envelope)),
      code,
      initial
    );
    assert.equal(calls, 0);
  }
});

test('Objective cryptographic validation rejects invalid material and rebound substitutions', async () => {
  const initial = runtime();
  const envelope = await signedFixture(announceFixture, 6, 20);
  rejected(
    await createObjectiveProcessor({
      resolver: createStaticMeshKeyResolver([]),
    }).process(initial, request(envelope)),
    'key_not_found',
    initial
  );
  rejected(
    await objectiveProcessor.process(
      initial,
      request({ ...envelope, payloadHash: `sha256:${'A'.repeat(43)}` })
    ),
    'payload_hash_mismatch',
    initial
  );
  const invalidSignature = {
    ...envelope,
    proof: {
      ...envelope.proof,
      value: `${envelope.proof.value[0] === 'A' ? 'B' : 'A'}${envelope.proof.value.slice(1)}`,
    },
  };
  rejected(
    await objectiveProcessor.process(initial, request(invalidSignature)),
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
  const cryptoBoundProcessor = createObjectiveProcessor({
    crypto: mutableCrypto,
  });
  mutableCrypto.subtle.verify = async () => true;
  rejected(
    await cryptoBoundProcessor.process(initial, request(invalidSignature)),
    'signature_invalid',
    initial
  );
});

test('Objective ingress requires the exact admitted instance and authorized issuer key', async () => {
  const wrongInstance = await signedFixture(announceFixture, 6, 30, {
    sender: { peerId: 'peer-a', instanceId: 'replacement-instance' },
  });
  const initial = runtime();
  rejected(
    await objectiveProcessor.process(initial, request(wrongInstance)),
    'sender_instance_not_admitted',
    initial
  );

  const noAuthority = runtime({ authorities: [] });
  rejected(
    await objectiveProcessor.process(
      noAuthority,
      request(await signedFixture(announceFixture, 6, 31))
    ),
    'issuer_not_authorized',
    noAuthority
  );
  const wrongKey = runtime({
    authorities: [
      {
        peerId: 'peer-a',
        keyIds: ['key-other'],
        validUntil: '2027-01-01T00:00:00.000Z',
      },
    ],
  });
  rejected(
    await objectiveProcessor.process(
      wrongKey,
      request(await signedFixture(announceFixture, 6, 32))
    ),
    'issuer_key_not_authorized',
    wrongKey
  );
});

test('Objective and discovery messages share message-id and sequence replay protection', async () => {
  const initial = runtime();
  const announced = await objectiveProcessor.process(
    initial,
    request(await signedFixture(announceFixture, 6, 40))
  );
  assert.equal(announced.accepted, true);
  const discoveryAfterObjective = createMeshDiscoveryInboundRuntimeState(
    announced.state.coordination,
    announced.state.discovery,
    announced.state.inbound
  );
  rejected(
    await discoveryProcessor.process(
      discoveryAfterObjective,
      request(await signedFixture(peerCardFixture, 6, 41), {
        receivedAt: 1_001,
      })
    ),
    'message_replayed',
    discoveryAfterObjective
  );

  const discoveryInitial = createMeshDiscoveryInboundRuntimeState(
    initial.coordination,
    initial.discovery,
    initial.inbound
  );
  const discovered = await discoveryProcessor.process(
    discoveryInitial,
    request(await signedFixture(peerCardFixture, 20, 42))
  );
  assert.equal(discovered.accepted, true);
  const objectiveAfterDiscovery = createMeshObjectiveInboundRuntimeState(
    discovered.state.coordination,
    discovered.state.discovery,
    initial.objectives,
    discovered.state.inbound
  );
  rejected(
    await objectiveProcessor.process(
      objectiveAfterDiscovery,
      request(await signedFixture(announceFixture, 21, 42), {
        receivedAt: 1_001,
      })
    ),
    'message_replayed',
    objectiveAfterDiscovery
  );
});

test('post-replay Objective domain rejection advances only inbound security state', async () => {
  const initial = runtime();
  const invalidRevision = await signedFixture(reviseFixture, 7, 50);
  const rejectedRevision = await objectiveProcessor.process(
    initial,
    request(invalidRevision)
  );
  assert.equal(rejectedRevision.accepted, false);
  assert.equal(rejectedRevision.code, 'objective_revision_invalid');
  assert.equal(rejectedRevision.state.coordination, initial.coordination);
  assert.equal(rejectedRevision.state.discovery, initial.discovery);
  assert.equal(rejectedRevision.state.objectives, initial.objectives);
  assert.notEqual(rejectedRevision.state.inbound, initial.inbound);
  rejected(
    await objectiveProcessor.process(
      rejectedRevision.state,
      request(invalidRevision)
    ),
    'message_replayed',
    rejectedRevision.state
  );
});

test('Objective inbound snapshots survive JSON round-trip and reject tampering or weakened bounds', () => {
  const initial = runtime();
  const restoredInbound = restoreMeshCoordinationInboundState(
    JSON.parse(JSON.stringify(initial.inbound))
  );
  const restored = createMeshObjectiveInboundRuntimeState(
    initial.coordination,
    initial.discovery,
    initial.objectives,
    restoredInbound
  );
  assert.deepEqual(restored, initial);
  assert.equal(Object.isFrozen(restored), true);

  assert.throws(
    () =>
      restoreMeshCoordinationInboundState({
        ...JSON.parse(JSON.stringify(initial.inbound)),
        unexpected: true,
      }),
    /unsupported fields/u
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
      createMeshObjectiveInboundRuntimeState(
        initial.coordination,
        initial.discovery,
        initial.objectives,
        createMeshCoordinationInboundState({
          identity: { ...identity(), peerId: 'peer-other' },
        })
      ),
    /not aligned/u
  );
});
