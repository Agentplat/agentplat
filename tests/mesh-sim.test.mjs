import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';

import {
  DEFAULT_MESH_CRYPTO_POLICY,
  createStaticMeshKeyResolver,
  createWebCryptoMeshEnvelopeSigner,
  createWebCryptoMeshEnvelopeVerifier,
} from '@agentplat/mesh-crypto';
import {
  ALLOW_PREPROVISIONED_MESH_ADMISSION,
  createMeshPeerState,
  reduceMeshPeer,
} from '@agentplat/mesh';
import {
  createMeshSimulationKernel,
  replayMeshSimulation,
  runMeshSimulation,
} from '@agentplat/mesh-sim';
import { MESH_SIGNATURE_ALGORITHM } from '@agentplat/mesh-protocol';

function messageId(value) {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(12, value);
  return Buffer.from(bytes).toString('base64url');
}

async function simulationConfig(overrides = {}) {
  const ids = ['peer-a', 'peer-b', 'peer-c'];
  const keys = Object.fromEntries(
    await Promise.all(
      ids.map(async (peerId) => [
        peerId,
        await crypto.subtle.generateKey(
          MESH_SIGNATURE_ALGORITHM,
          true,
          ['sign', 'verify']
        ),
      ])
    )
  );
  const resolver = createStaticMeshKeyResolver(
    ids.map((peerId) => ({
      tenantId: 'tenant-a',
      meshId: 'mesh-a',
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
  let invariantCalls = 0;
  const config = {
    seed: 0x5eed,
    prngVersion: 'xorshift32-v1',
    recordingMode: 'full',
    startTime: '2026-07-30T00:00:00Z',
    peers: ids.map((peerId, peerIndex) => {
      const state = createMeshPeerState({
        identity: {
          tenantId: 'tenant-a',
          meshId: 'mesh-a',
          peerId,
          instanceId: `instance-${peerId}`,
          keyId: `key-${peerId}`,
        },
        admittedPeers: ids
          .filter((candidate) => candidate !== peerId)
          .map((candidate, index) => ({
            peerId: candidate,
            instanceIds: [`instance-${candidate}`],
            peerCardId: `card-${candidate}`,
            acceptedCardMessageId: messageId(
              9_000 + peerIndex * 10 + index
            ),
            cardRevision: 1,
            validUntil: '2027-01-01T00:00:00Z',
          })),
      });
      return {
        peerId,
        state: reduceMeshPeer(state, { kind: 'peer.start' }, 0).state,
        signer,
        verifier,
        resolver,
        cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
        admissionPolicy: ALLOW_PREPROVISIONED_MESH_ADMISSION,
        privateKey: keys[peerId].privateKey,
      };
    }),
    links: ids.flatMap((fromPeerId) =>
      ids
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
        name: 'bounded-and-frozen',
        evaluate({ peerStates, queuedEvents }) {
          invariantCalls += 1;
          assert.equal(Object.isFrozen(peerStates), true);
          assert.equal(queuedEvents <= 32, true);
        },
      },
    ],
    ...overrides,
  };
  return { config, invariantCalls: () => invariantCalls };
}

const pingB = Object.freeze({
  eventId: 'ping-b',
  targetPeerId: 'peer-a',
  logicalTime: 1_000,
  priority: 0,
  action: Object.freeze({
    kind: 'peer.input',
    input: Object.freeze({ kind: 'peer.ping', peerId: 'peer-b' }),
  }),
});

test('three-peer simulation performs signed delivery and causal response', async () => {
  const { config, invariantCalls } = await simulationConfig();
  const trace = await runMeshSimulation(config, [pingB]);

  assert.equal(trace.metrics.processedEvents, 3);
  assert.equal(trace.metrics.deliveredMessages, 2);
  assert.equal(trace.metrics.rejectedMessages, 0);
  assert.equal(trace.peerStates['peer-a'].peers['peer-b'].status, 'responsive');
  assert.equal(trace.peerStates['peer-b'].peers['peer-a'].status, 'observed');
  assert.equal(trace.records.length, 3);
  assert.equal(trace.records[0].inputKind, 'peer.input');
  assert.equal(trace.records[1].inputKind, 'message.delivery');
  assert.match(trace.records[0].actionDigest, /^[0-9a-f]{64}$/u);
  assert.match(trace.records[0].effectsDigest, /^[0-9a-f]{64}$/u);
  assert.equal(invariantCalls(), 3);
  assert.match(trace.configurationDigest, /^[0-9a-f]{64}$/u);
  assert.match(trace.chainDigest, /^[0-9a-f]{64}$/u);
});

test('same seed and configuration replay exactly and report divergence', async () => {
  const { config } = await simulationConfig();
  const expected = await runMeshSimulation(config, [pingB]);
  const replay = await replayMeshSimulation(config, [pingB], expected);
  assert.deepEqual(replay, {
    matches: true,
    expectedChainDigest: expected.chainDigest,
    actualChainDigest: expected.chainDigest,
  });

  const changed = {
    ...pingB,
    eventId: 'ping-c',
    action: {
      kind: 'peer.input',
      input: { kind: 'peer.ping', peerId: 'peer-c' },
    },
  };
  const divergent = await replayMeshSimulation(config, [changed], expected);
  assert.equal(divergent.matches, false);
  assert.equal(divergent.firstDivergence, 0);

  const stoppedRequested = {
    eventId: 'stop-a',
    targetPeerId: 'peer-a',
    logicalTime: 1_000,
    priority: 0,
    action: {
      kind: 'peer.input',
      input: { kind: 'peer.stop', reason: 'requested' },
    },
  };
  const stoppedPolicy = {
    ...stoppedRequested,
    action: {
      kind: 'peer.input',
      input: { kind: 'peer.stop', reason: 'policy' },
    },
  };
  const requestedTrace = await runMeshSimulation(config, [stoppedRequested]);
  const semanticDivergence = await replayMeshSimulation(
    config,
    [stoppedPolicy],
    requestedTrace
  );
  assert.equal(
    requestedTrace.records[0].stateDigest,
    (
      await runMeshSimulation(config, [stoppedPolicy])
    ).records[0].stateDigest,
    'the regression requires identical resulting state'
  );
  assert.equal(semanticDivergence.matches, false);
  assert.equal(semanticDivergence.firstDivergence, 0);
});

test('queue, time and event limits fail closed with deterministic snapshots', async () => {
  const { config } = await simulationConfig({
    limits: {
      maximumEvents: 1,
      maximumLogicalTime: 2_000,
      maximumQueuedEvents: 1,
      maximumInternalSteps: 32,
    },
  });
  const kernel = await createMeshSimulationKernel(config);
  kernel.enqueue(pingB);
  assert.throws(
    () => kernel.enqueue({ ...pingB, eventId: 'second' }),
    /queue limit/u
  );
  const snapshot = kernel.snapshot();
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(snapshot.queuedEvents.length, 1);
  await assert.rejects(kernel.runUntilIdle(), /event limit/u);
  const afterLimit = kernel.snapshot();
  assert.equal(afterLimit.queuedEvents.length, 1);
  assert.match(afterLimit.queuedEvents[0].eventId, /^delivery:/u);
});
