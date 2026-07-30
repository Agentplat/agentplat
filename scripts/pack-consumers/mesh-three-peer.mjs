import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

import {
  ALLOW_PREPROVISIONED_MESH_ADMISSION,
  createMeshPeerState,
  reduceMeshPeer,
} from '@agentplat/mesh';
import { createMeshLoopbackTransport } from '@agentplat/mesh/loopback';
import {
  DEFAULT_MESH_CRYPTO_POLICY,
  createStaticMeshKeyResolver,
  createWebCryptoMeshEnvelopeSigner,
  createWebCryptoMeshEnvelopeVerifier,
} from '@agentplat/mesh-crypto';
import { MESH_SIGNATURE_ALGORITHM } from '@agentplat/mesh-protocol';
import { replayMeshSimulation, runMeshSimulation } from '@agentplat/mesh-sim';

const peerIds = Object.freeze(['peer-a', 'peer-b', 'peer-c']);
const seed = 0x5eed;

function messageId(value) {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(12, value);
  return Buffer.from(bytes).toString('base64url');
}

function messageIds(start) {
  let next = start;
  return Object.freeze({
    nextMessageId() {
      next += 1;
      return messageId(next);
    },
  });
}

function runningState(peerId, peerIndex) {
  const state = createMeshPeerState({
    identity: {
      tenantId: 'tenant-packed',
      meshId: 'mesh-packed',
      peerId,
      instanceId: `instance-${peerId}`,
      keyId: `key-${peerId}`,
    },
    admittedPeers: peerIds
      .filter((candidate) => candidate !== peerId)
      .map((candidate, index) => ({
        peerId: candidate,
        instanceIds: [`instance-${candidate}`],
        peerCardId: `card-${candidate}`,
        acceptedCardMessageId: messageId(9_000 + peerIndex * 10 + index),
        cardRevision: 1,
        validUntil: '2027-01-01T00:00:00Z',
      })),
  });
  return reduceMeshPeer(state, { kind: 'peer.start' }, 0).state;
}

const keys = Object.fromEntries(
  await Promise.all(
    peerIds.map(async (peerId) => [
      peerId,
      await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
        'sign',
        'verify',
      ]),
    ])
  )
);
const resolver = createStaticMeshKeyResolver(
  peerIds.map((peerId) => ({
    tenantId: 'tenant-packed',
    meshId: 'mesh-packed',
    peerId,
    keyId: `key-${peerId}`,
    algorithm: MESH_SIGNATURE_ALGORITHM,
    publicKey: keys[peerId].publicKey,
    validFrom: '2026-01-01T00:00:00Z',
    validUntil: '2027-01-01T00:00:00Z',
    status: 'active',
  }))
);
const signer = createWebCryptoMeshEnvelopeSigner();
const verifier = createWebCryptoMeshEnvelopeVerifier();

const transport = createMeshLoopbackTransport({
  maximumPeers: 3,
  maximumQueueDepth: 8,
});
const peers = Object.fromEntries(
  peerIds.map((peerId, index) => [
    peerId,
    transport.register({
      state: runningState(peerId, index),
      signer,
      verifier,
      resolver,
      cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
      admissionPolicy: ALLOW_PREPROVISIONED_MESH_ADMISSION,
      privateKey: keys[peerId].privateKey,
      clock: {
        now: () => ({
          logicalTime: 1_000,
          timestamp: '2026-07-30T00:00:01.000Z',
        }),
      },
      messageIds: messageIds(1_000 + index * 100),
    }),
  ])
);

const dispatch = await peers['peer-a'].dispatch({
  kind: 'peer.ping',
  peerId: 'peer-b',
});
assert.equal(dispatch.receipts.length, 1);
assert.equal(dispatch.receipts[0].accepted, true);
await transport.idle();
assert.equal(peers['peer-a'].getState().peers['peer-b'].status, 'responsive');
assert.equal(peers['peer-b'].getState().peers['peer-a'].status, 'observed');
assert.equal(
  peers['peer-c'].getState().localEventSequence,
  1,
  'a direct exchange must not mutate the non-audience peer'
);
await transport.close();

const simulation = {
  seed,
  prngVersion: 'xorshift32-v1',
  recordingMode: 'full',
  startTime: '2026-07-30T00:00:00Z',
  peers: peerIds.map((peerId, index) => ({
    peerId,
    state: runningState(peerId, index),
    signer,
    verifier,
    resolver,
    cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
    admissionPolicy: ALLOW_PREPROVISIONED_MESH_ADMISSION,
    privateKey: keys[peerId].privateKey,
  })),
  links: peerIds.flatMap((fromPeerId) =>
    peerIds
      .filter((toPeerId) => toPeerId !== fromPeerId)
      .map((toPeerId) => ({
        fromPeerId,
        toPeerId,
        latency: 5,
        enabled: true,
      }))
  ),
  limits: {
    maximumEvents: 32,
    maximumLogicalTime: 60_000,
    maximumQueuedEvents: 32,
    maximumInternalSteps: 32,
  },
  invariants: [
    {
      name: 'three-peer-bound',
      evaluate({ peerStates }) {
        assert.deepEqual(Object.keys(peerStates).sort(), [...peerIds]);
      },
    },
  ],
};
const events = [
  {
    eventId: 'packed-ping-b',
    targetPeerId: 'peer-a',
    logicalTime: 1_000,
    priority: 0,
    action: {
      kind: 'peer.input',
      input: { kind: 'peer.ping', peerId: 'peer-b' },
    },
  },
];
const trace = await runMeshSimulation(simulation, events);
const replay = await replayMeshSimulation(simulation, events, trace);
assert.equal(trace.metrics.processedEvents, 3);
assert.equal(trace.metrics.deliveredMessages, 2);
assert.equal(trace.peerStates['peer-a'].peers['peer-b'].status, 'responsive');
assert.equal(trace.peerStates['peer-b'].peers['peer-a'].status, 'observed');
assert.equal(trace.peerStates['peer-c'].localEventSequence, 1);
assert.equal(replay.matches, true);
assert.equal(replay.actualChainDigest, trace.chainDigest);

console.log(
  JSON.stringify({
    configurationDigest: trace.configurationDigest,
    events: trace.metrics.processedEvents,
    replay: replay.matches,
    seed,
  })
);
