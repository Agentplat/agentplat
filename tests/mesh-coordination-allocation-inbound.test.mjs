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
  createMeshAllocationInboundProcessor,
  createMeshAllocationInboundRuntimeState,
  createMeshAllocationState,
  createMeshCoordinationInboundState,
  createMeshCoordinationState,
  createMeshDiscoveryState,
  createMeshObjectiveWorkState,
} from '@agentplat/mesh/coordination';
import { MESH_SIGNATURE_ALGORITHM } from '@agentplat/mesh-protocol';

const fixtureRoot = new URL(
  '../packages/mesh-protocol/fixtures/v0/',
  import.meta.url
);
const bidFixture = fixture('work-bid.json');
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

function runtime({ admittedPeers = [admission()] } = {}) {
  const local = identity();
  return createMeshAllocationInboundRuntimeState(
    createMeshCoordinationState({ identity: local }),
    createMeshDiscoveryState({
      identity: local,
      subscriptions: ['membership'],
      admittedPeers,
    }),
    createMeshObjectiveWorkState({ identity: local }),
    createMeshAllocationState({ identity: local }),
    createMeshCoordinationInboundState({ identity: local })
  );
}

function admission() {
  return {
    peerId: 'peer-a',
    instanceIds: ['instance-a'],
    validUntil: '2027-01-01T00:00:00.000Z',
  };
}

async function signedBid(sequence, number) {
  const envelope = structuredClone(bidFixture);
  envelope.sequence = sequence;
  envelope.messageId = messageId(number);
  return signMeshEnvelope({ envelope, privateKey: keyPair.privateKey });
}

function request(envelope) {
  return { envelope, receivedAt: 1_000, verifiedAt };
}

function createProcessor(overrides = {}) {
  return createMeshAllocationInboundProcessor({
    resolver,
    cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
    ...overrides,
  });
}

test('allocation inbound rejects cryptographic failures before admission', async () => {
  const initial = runtime();
  const envelope = await signedBid(10, 1);
  const result = await createProcessor({
    resolver: createStaticMeshKeyResolver([]),
  }).process(initial, request(envelope));
  assert.deepEqual(result, {
    accepted: false,
    code: 'key_not_found',
    state: initial,
  });
});

test('allocation inbound rejects senders outside discovery admission', async () => {
  const initial = runtime({ admittedPeers: [] });
  const result = await processor.process(
    initial,
    request(await signedBid(10, 2))
  );
  assert.deepEqual(result, {
    accepted: false,
    code: 'sender_not_admitted',
    state: initial,
  });
});

test('allocation domain rejections retain replay accounting and reject replay', async () => {
  const initial = runtime();
  const envelope = await signedBid(10, 3);
  const rejected = await processor.process(initial, request(envelope));
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.code, 'offer_missing');
  assert.equal(rejected.state.coordination, initial.coordination);
  assert.equal(rejected.state.allocation, initial.allocation);
  assert.equal(rejected.state.inbound.lastLogicalTime, 1_000);

  const replay = await processor.process(rejected.state, request(envelope));
  assert.deepEqual(replay, {
    accepted: false,
    code: 'message_replayed',
    state: rejected.state,
  });
});
