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
  restoreMeshSimulationKernel,
  runMeshSimulation,
} from '@agentplat/mesh-sim';
import {
  MESH_SIGNATURE_ALGORITHM,
  canonicalizeMeshJsonBytes,
} from '@agentplat/mesh-protocol';

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
        await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
          'sign',
          'verify',
        ]),
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
            acceptedCardMessageId: messageId(9_000 + peerIndex * 10 + index),
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

async function scheduledPingDeliveryId(config) {
  const kernel = await createMeshSimulationKernel(config);
  kernel.enqueue(pingB);
  await kernel.step();
  const delivery = kernel
    .snapshot()
    .queuedEvents.find((event) => event.action.kind === 'message.delivery');
  assert.ok(delivery);
  return delivery.eventId;
}

function faultPlan(faults) {
  return { schemaVersion: 1, faults };
}

async function digestSimulationValue(value) {
  const canonical = canonicalizeMeshJsonBytes(value);
  assert.equal(canonical.ok, true);
  return Buffer.from(
    await crypto.subtle.digest('SHA-256', canonical.value)
  ).toString('hex');
}

async function rechainSnapshot(snapshot) {
  let chain = snapshot.configurationDigest;
  for (const record of snapshot.records) {
    const { chainDigest: _discarded, ...base } = record;
    chain = await digestSimulationValue({ previous: chain, record: base });
    record.chainDigest = chain;
  }
  snapshot.chainDigest = chain;
}

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
    (await runMeshSimulation(config, [stoppedPolicy])).records[0].stateDigest,
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

test('configuration reserves enough outbound sequence capacity for every bounded prepare', async () => {
  const { config: baselineConfig } = await simulationConfig();
  const config = {
    ...baselineConfig,
    peers: baselineConfig.peers.map((peer, index) => ({
      ...peer,
      ...(index === 0 ? { outboundSequence: Number.MAX_SAFE_INTEGER } : {}),
    })),
  };

  await assert.rejects(
    createMeshSimulationKernel(config),
    /outbound sequence capacity/u
  );
});

test('an outbound audience outside the configured peers is an explicit restorable drop', async () => {
  const { config: baselineConfig } = await simulationConfig();
  const configuredPeerIds = new Set(['peer-a', 'peer-c']);
  const config = {
    ...baselineConfig,
    peers: baselineConfig.peers.filter(({ peerId }) =>
      configuredPeerIds.has(peerId)
    ),
    links: baselineConfig.links.filter(
      ({ fromPeerId, toPeerId }) =>
        configuredPeerIds.has(fromPeerId) && configuredPeerIds.has(toPeerId)
    ),
  };
  const kernel = await createMeshSimulationKernel(config);
  kernel.enqueue(pingB);
  await kernel.step();
  const snapshot = kernel.snapshot();

  assert.deepEqual(snapshot.records[0].transportOutcome, {
    delivered: 0,
    droppedByCrash: 0,
    droppedByPartition: 0,
    droppedByCrashAndPartition: 0,
    droppedByDestinationMissing: 1,
    deliveries: [
      {
        eventId: `delivery:${snapshot.records[0].transportOutcome.deliveries[0].eventId.slice(
          'delivery:'.length
        )}`,
        fromPeerId: 'peer-a',
        toPeerId: 'peer-b',
        outcome: 'destination_missing',
      },
    ],
  });
  assert.equal(snapshot.metrics.rejectedMessages, 1);
  assert.equal(snapshot.metrics.droppedMessages, 1);
  assert.equal(snapshot.metrics.crashSuppressedEvents, 0);
  assert.equal(snapshot.metrics.partitionSuppressedMessages, 0);

  const restored = await restoreMeshSimulationKernel(
    config,
    structuredClone(snapshot)
  );
  assert.deepEqual(restored.snapshot(), snapshot);
});

test('an inbound signed delivery from an unconfigured sender is a restorable partition drop', async () => {
  const { config: baselineConfig } = await simulationConfig();
  const producer = await createMeshSimulationKernel(baselineConfig);
  producer.enqueue(pingB);
  await producer.step();
  const prepared = producer
    .snapshot()
    .queuedEvents.find((event) => event.action.kind === 'message.delivery');
  assert.ok(prepared);

  const configuredPeerIds = new Set(['peer-b', 'peer-c']);
  const config = {
    ...baselineConfig,
    peers: baselineConfig.peers.filter(({ peerId }) =>
      configuredPeerIds.has(peerId)
    ),
    links: baselineConfig.links.filter(
      ({ fromPeerId, toPeerId }) =>
        configuredPeerIds.has(fromPeerId) && configuredPeerIds.has(toPeerId)
    ),
  };
  const kernel = await createMeshSimulationKernel(config);
  kernel.enqueue({
    eventId: 'delivery:external-source',
    targetPeerId: 'peer-b',
    logicalTime: 2_000,
    priority: 0,
    action: {
      kind: 'message.delivery',
      envelope: structuredClone(prepared.action.envelope),
    },
  });
  await kernel.step();
  const snapshot = kernel.snapshot();

  assert.equal(snapshot.records[0].inputDeliverySourcePeerId, 'peer-a');
  assert.equal(snapshot.records[0].accepted, false);
  assert.equal(snapshot.records[0].rejectionCode, 'simulation_partitioned');
  assert.equal(snapshot.metrics.partitionSuppressedMessages, 1);
  const restored = await restoreMeshSimulationKernel(
    config,
    structuredClone(snapshot)
  );
  assert.deepEqual(restored.snapshot(), snapshot);
});

test('public enqueue reserves the fault event namespace without mutation', async () => {
  const { config } = await simulationConfig();
  const kernel = await createMeshSimulationKernel(config);
  const before = kernel.snapshot();

  assert.throws(
    () => kernel.enqueue({ ...pingB, eventId: 'fault:user-controlled' }),
    /reserved namespace/u
  );
  assert.deepEqual(kernel.snapshot(), before);

  kernel.enqueue({ ...pingB, eventId: 'after-reserved-rejection' });
  assert.equal(
    kernel.snapshot().queuedEvents[0].order.insertionSequence,
    before.insertionSequence + 1
  );
});

test('kernel copies mutable configuration and queued actions at its boundary', async () => {
  const { config } = await simulationConfig();
  const mutableState = structuredClone(config.peers[0].state);
  const mutablePolicy = {
    allowedAlgorithms: [...DEFAULT_MESH_CRYPTO_POLICY.allowedAlgorithms],
  };
  const mutableConfig = {
    ...config,
    peers: config.peers.map((peer, index) => ({
      ...peer,
      ...(index === 0
        ? { state: mutableState, cryptoPolicy: mutablePolicy }
        : {}),
    })),
    links: config.links.map((link) => ({ ...link })),
    limits: { ...config.limits },
  };
  const kernel = await createMeshSimulationKernel(mutableConfig);
  const originalLatency = mutableConfig.links[0].latency;
  const originalStatus = mutableState.status;

  mutableConfig.links[0].latency = originalLatency + 1_000;
  mutableConfig.limits.maximumEvents = 1;
  mutableState.status = originalStatus === 'running' ? 'stopped' : 'running';
  mutablePolicy.allowedAlgorithms.length = 0;

  assert.equal(kernel.config.links[0].latency, originalLatency);
  assert.equal(kernel.config.limits.maximumEvents, config.limits.maximumEvents);
  assert.equal(kernel.config.peers[0].state.status, originalStatus);
  assert.deepEqual(
    kernel.config.peers[0].cryptoPolicy.allowedAlgorithms,
    DEFAULT_MESH_CRYPTO_POLICY.allowedAlgorithms
  );
  assert.equal(Object.isFrozen(kernel.config.peers[0].cryptoPolicy), true);
  assert.equal(
    Object.isFrozen(kernel.config.peers[0].cryptoPolicy.allowedAlgorithms),
    true
  );

  const producer = await createMeshSimulationKernel(config);
  producer.enqueue(pingB);
  await producer.step();
  const delivery = producer
    .snapshot()
    .queuedEvents.find((event) => event.action.kind === 'message.delivery');
  assert.ok(delivery);
  const mutableEnvelope = structuredClone(delivery.action.envelope);
  const originalMessageId = mutableEnvelope.messageId;
  kernel.enqueue({
    eventId: 'externally-owned-delivery',
    targetPeerId: delivery.targetPeerId,
    logicalTime: delivery.order.logicalTime,
    priority: delivery.order.priority,
    action: { kind: 'message.delivery', envelope: mutableEnvelope },
  });
  mutableEnvelope.messageId = messageId(999_999);
  mutableEnvelope.payload.peerId = 'peer-c';
  const queuedEnvelope = kernel.snapshot().queuedEvents[0].action.envelope;
  assert.equal(queuedEnvelope.messageId, originalMessageId);
  assert.notEqual(queuedEnvelope.payload.peerId, 'peer-c');
  assert.equal(Object.isFrozen(queuedEnvelope.payload), true);
});

test('failed enqueue action validation does not consume insertion sequence', async () => {
  const { config } = await simulationConfig();
  const kernel = await createMeshSimulationKernel(config);
  assert.throws(
    () =>
      kernel.enqueue({
        ...pingB,
        eventId: 'invalid-action',
        action: {
          kind: 'peer.input',
          input: {
            kind: 'peer.stop',
            reason: 'requested',
            nested: { invalid: new Date() },
          },
        },
      }),
    /plain data|contain data|Invalid/u
  );
  kernel.enqueue(pingB);
  const snapshot = kernel.snapshot();
  assert.equal(snapshot.insertionSequence, 1);
  assert.deepEqual(snapshot.eventIds, ['ping-b']);
  await restoreMeshSimulationKernel(config, structuredClone(snapshot));
});

test('same seed and fault plan replay exactly while one fault change diverges', async () => {
  const { config: baselineConfig } = await simulationConfig();
  const deliveryEventId = await scheduledPingDeliveryId(baselineConfig);
  const duplicate = {
    ...baselineConfig,
    faultPlan: faultPlan([
      {
        faultId: 'duplicate-ping',
        kind: 'message.duplicate',
        logicalTime: 1_001,
        priority: 0,
        deliveryEventId,
        copies: 1,
      },
    ]),
  };
  const expected = await runMeshSimulation(duplicate, [pingB]);
  const replay = await replayMeshSimulation(duplicate, [pingB], expected);
  assert.equal(replay.matches, true);
  assert.equal(expected.metrics.faultEvents, 1);
  assert.equal(expected.metrics.duplicatedMessages, 1);
  assert.equal(expected.faultPlan.schemaVersion, 1);
  assert.equal(expected.faults[0].applied, true);
  assert.match(expected.faultPlanDigest, /^[0-9a-f]{64}$/u);

  const dropped = {
    ...baselineConfig,
    faultPlan: faultPlan([
      {
        faultId: 'drop-ping',
        kind: 'message.drop',
        logicalTime: 1_001,
        priority: 0,
        deliveryEventId,
      },
    ]),
  };
  const divergent = await replayMeshSimulation(dropped, [pingB], expected);
  assert.equal(divergent.matches, false);
  assert.equal(divergent.firstDivergence, 0);
  const droppedTrace = await runMeshSimulation(dropped, [pingB]);
  assert.equal(droppedTrace.metrics.droppedMessages, 1);
  assert.equal(droppedTrace.metrics.deliveredMessages, 1);
  assert.equal(droppedTrace.peerStates['peer-a'].peers['peer-b'], undefined);
});

test('uninterrupted execution equals strict v2 snapshot restore with active faults', async () => {
  const { config: baselineConfig } = await simulationConfig();
  const deliveryEventId = await scheduledPingDeliveryId(baselineConfig);
  const config = {
    ...baselineConfig,
    faultPlan: faultPlan([
      {
        faultId: 'partition-a-b',
        kind: 'network.partition',
        logicalTime: 100,
        priority: 0,
        links: [{ fromPeerId: 'peer-a', toPeerId: 'peer-b' }],
      },
      {
        faultId: 'heal-a-b',
        kind: 'network.heal',
        logicalTime: 200,
        priority: 0,
        links: [{ fromPeerId: 'peer-a', toPeerId: 'peer-b' }],
      },
      {
        faultId: 'offset-b',
        kind: 'clock.offset',
        logicalTime: 300,
        priority: 0,
        peerId: 'peer-b',
        offset: 1,
      },
      {
        faultId: 'delay-ping',
        kind: 'message.delay',
        logicalTime: 1_001,
        priority: 0,
        deliveryEventId,
        delay: 5,
      },
    ]),
  };
  const uninterrupted = await runMeshSimulation(config, [pingB]);

  const kernel = await createMeshSimulationKernel(config);
  kernel.enqueue(pingB);
  for (let index = 0; index < 5; index += 1) await kernel.step();
  const snapshot = kernel.snapshot();
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.faultCursor, 4);
  assert.equal(snapshot.clockOffsets['peer-b'], 1);
  assert.equal(snapshot.topology.length, config.links.length);
  assert.equal(snapshot.metrics.delayedMessages, 1);
  assert.equal(snapshot.records.length, 5);
  assert.match(snapshot.configurationDigest, /^[0-9a-f]{64}$/u);

  const restored = await restoreMeshSimulationKernel(
    config,
    structuredClone(snapshot)
  );
  const resumed = await restored.runUntilIdle();
  assert.equal(resumed.chainDigest, uninterrupted.chainDigest);
  assert.deepEqual(resumed.metrics, uninterrupted.metrics);
  assert.deepEqual(resumed.peerStates, uninterrupted.peerStates);
  assert.deepEqual(resumed.records, uninterrupted.records);

  const wrongVersion = structuredClone(snapshot);
  wrongVersion.schemaVersion = 1;
  await assert.rejects(
    restoreMeshSimulationKernel(config, wrongVersion),
    /snapshot/u
  );
  const extraField = structuredClone(snapshot);
  extraField.untrusted = true;
  await assert.rejects(
    restoreMeshSimulationKernel(config, extraField),
    /unsupported/u
  );
  const wrongDigest = structuredClone(snapshot);
  wrongDigest.chainDigest = '0'.repeat(64);
  await assert.rejects(
    restoreMeshSimulationKernel(config, wrongDigest),
    /digest|chain/u
  );
});

test('snapshot restore bounds and authenticates the fault ledger before copying it', async () => {
  const { config: baselineConfig } = await simulationConfig();
  const deliveryEventId = await scheduledPingDeliveryId(baselineConfig);
  const config = {
    ...baselineConfig,
    faultPlan: faultPlan([
      {
        faultId: 'duplicate-ping-twice',
        kind: 'message.duplicate',
        logicalTime: 1_001,
        priority: 0,
        deliveryEventId,
        copies: 2,
      },
    ]),
  };
  const kernel = await createMeshSimulationKernel(config);
  kernel.enqueue(pingB);
  await kernel.step();
  await kernel.step();
  const snapshot = kernel.snapshot();
  assert.equal(snapshot.faults[0].affectedEventIds.length, 2);

  const malformedCases = [
    [{ invalid: true }],
    ['a', 'b', 'c'],
    [
      snapshot.faults[0].affectedEventIds[0],
      snapshot.faults[0].affectedEventIds[0],
    ],
    ['bogus-but-small', snapshot.faults[0].affectedEventIds[1]],
  ];
  for (const affectedEventIds of malformedCases) {
    const tampered = structuredClone(snapshot);
    tampered.faults[0].affectedEventIds = affectedEventIds;
    await assert.rejects(
      restoreMeshSimulationKernel(config, tampered),
      /affected|eventId|fault record/u
    );
  }
  const notAppliedWithEffects = structuredClone(snapshot);
  notAppliedWithEffects.faults[0].applied = false;
  await assert.rejects(
    restoreMeshSimulationKernel(config, notAppliedWithEffects),
    /affected|fault record/u
  );
});

test('snapshot restore rejects cyclic, accessor-backed, oversized, and invalid actions without executing hooks', async () => {
  const { config } = await simulationConfig();
  const kernel = await createMeshSimulationKernel(config);
  kernel.enqueue(pingB);
  const snapshot = kernel.snapshot();

  const cyclic = structuredClone(snapshot);
  const cyclicEnvelope = {};
  cyclicEnvelope.payload = cyclicEnvelope;
  cyclic.queuedEvents[0].action = {
    kind: 'message.delivery',
    envelope: cyclicEnvelope,
  };
  await assert.rejects(
    restoreMeshSimulationKernel(config, cyclic),
    /data limits|peer input|unsupported/u
  );

  let getterReads = 0;
  const accessorBacked = structuredClone(snapshot);
  Object.defineProperty(
    accessorBacked.queuedEvents[0].action.input,
    'accessor',
    {
      enumerable: true,
      get() {
        getterReads += 1;
        return true;
      },
    }
  );
  await assert.rejects(
    restoreMeshSimulationKernel(config, accessorBacked),
    /data only|peer input|unsupported/u
  );
  assert.equal(getterReads, 0);

  let toJsonCalls = 0;
  const toJsonBacked = structuredClone(snapshot);
  toJsonBacked.queuedEvents[0].action.input.peerId = {
    toJSON() {
      toJsonCalls += 1;
      return 'peer-b';
    },
  };
  await assert.rejects(
    restoreMeshSimulationKernel(config, toJsonBacked),
    /ping peerId|peer input/u
  );
  assert.equal(toJsonCalls, 0);

  const oversized = structuredClone(snapshot);
  oversized.queuedEvents = new Array(config.limits.maximumQueuedEvents + 1);
  await assert.rejects(
    restoreMeshSimulationKernel(config, oversized),
    /snapshot/u
  );

  const invalidAction = structuredClone(snapshot);
  invalidAction.queuedEvents[0].action.input.kind = 'peer.explode';
  await assert.rejects(
    restoreMeshSimulationKernel(config, invalidAction),
    /peer input/u
  );

  let stateGetterReads = 0;
  const stateGetter = structuredClone(snapshot);
  Object.defineProperty(stateGetter.peerStates['peer-a'].identity, 'peerId', {
    enumerable: true,
    get() {
      stateGetterReads += 1;
      return 'peer-a';
    },
  });
  await assert.rejects(
    restoreMeshSimulationKernel(config, stateGetter),
    /data only/u
  );
  assert.equal(stateGetterReads, 0);

  let configGetterReads = 0;
  const getterState = structuredClone(config.peers[0].state);
  Object.defineProperty(getterState, 'identity', {
    enumerable: true,
    get() {
      configGetterReads += 1;
      return config.peers[0].state.identity;
    },
  });
  await assert.rejects(
    createMeshSimulationKernel({
      ...config,
      peers: [
        { ...config.peers[0], state: getterState },
        ...config.peers.slice(1),
      ],
    }),
    /data only/u
  );
  assert.equal(configGetterReads, 0);

  let linkToJsonCalls = 0;
  await assert.rejects(
    createMeshSimulationKernel({
      ...config,
      links: [
        {
          ...config.links[0],
          fromPeerId: {
            toJSON() {
              linkToJsonCalls += 1;
              return 'peer-a';
            },
          },
        },
        ...config.links.slice(1),
      ],
    }),
    /link source peerId/u
  );
  assert.equal(linkToJsonCalls, 0);
});

test('snapshot restore requires globally unique insertion sequences and ordered fault records', async () => {
  const { config } = await simulationConfig();
  const kernel = await createMeshSimulationKernel(config);
  const stop = (eventId, logicalTime, priority = 0) => ({
    eventId,
    targetPeerId: 'peer-a',
    logicalTime,
    priority,
    action: {
      kind: 'peer.input',
      input: { kind: 'peer.stop', reason: 'requested' },
    },
  });
  kernel.enqueue(stop('stop-first', 1));
  kernel.enqueue(stop('stop-second', 2));
  await kernel.step();
  const processedAndQueued = kernel.snapshot();
  const reusedProcessedSequence = structuredClone(processedAndQueued);
  reusedProcessedSequence.queuedEvents[0].order.insertionSequence =
    reusedProcessedSequence.records[0].order.insertionSequence;
  await assert.rejects(
    restoreMeshSimulationKernel(config, reusedProcessedSequence),
    /insertion sequence|queue is not ordered/u
  );
  const oversizedEffects = structuredClone(processedAndQueued);
  oversizedEffects.records[0].effectKinds = new Array(
    config.limits.maximumInternalSteps + 1
  ).fill('event.emit');
  await assert.rejects(
    restoreMeshSimulationKernel(config, oversizedEffects),
    /record/u
  );
  const invalidEffectKind = structuredClone(processedAndQueued);
  invalidEffectKind.records[0].effectKinds = ['host.execute'];
  await assert.rejects(
    restoreMeshSimulationKernel(config, invalidEffectKind),
    /record/u
  );

  const queuedKernel = await createMeshSimulationKernel(config);
  queuedKernel.enqueue(stop('queued-first', 10));
  queuedKernel.enqueue(stop('queued-second', 10, 1));
  const queued = queuedKernel.snapshot();
  const duplicateQueuedSequence = structuredClone(queued);
  duplicateQueuedSequence.queuedEvents[1].order.insertionSequence =
    duplicateQueuedSequence.queuedEvents[0].order.insertionSequence;
  await assert.rejects(
    restoreMeshSimulationKernel(config, duplicateQueuedSequence),
    /insertion sequence/u
  );
  const reversedQueue = structuredClone(queued);
  reversedQueue.queuedEvents.reverse();
  await assert.rejects(
    restoreMeshSimulationKernel(config, reversedQueue),
    /queue is not ordered/u
  );

  const orderedFaultConfig = {
    ...config,
    faultPlan: faultPlan([
      {
        faultId: 'offset-b-one',
        kind: 'clock.offset',
        logicalTime: 1,
        priority: 0,
        peerId: 'peer-b',
        offset: 1,
      },
      {
        faultId: 'offset-b-two',
        kind: 'clock.offset',
        logicalTime: 2,
        priority: 0,
        peerId: 'peer-b',
        offset: 2,
      },
    ]),
  };
  const faultKernel = await createMeshSimulationKernel(orderedFaultConfig);
  await faultKernel.step();
  await faultKernel.step();
  const permutedLedger = structuredClone(faultKernel.snapshot());
  permutedLedger.faults.reverse();
  await assert.rejects(
    restoreMeshSimulationKernel(orderedFaultConfig, permutedLedger),
    /ledger is not ordered/u
  );
});

test('snapshot restore rederives every metric and outbound sequence', async () => {
  const { config } = await simulationConfig();
  const kernel = await createMeshSimulationKernel(config);
  kernel.enqueue(pingB);
  await kernel.step();
  const snapshot = kernel.snapshot();
  await restoreMeshSimulationKernel(config, structuredClone(snapshot));

  for (const metricName of Object.keys(snapshot.metrics)) {
    const tampered = structuredClone(snapshot);
    tampered.metrics[metricName] =
      metricName === 'finalLogicalTime'
        ? tampered.metrics[metricName] + 1
        : Number.MAX_SAFE_INTEGER;
    await assert.rejects(
      restoreMeshSimulationKernel(config, tampered),
      /metrics|logicalTime/u,
      metricName
    );
  }

  const outbound = structuredClone(snapshot);
  outbound.outboundSequences['peer-a'] += 1;
  await assert.rejects(
    restoreMeshSimulationKernel(config, outbound),
    /metrics|sequence|fault state/u
  );
});

test('snapshot restore rejects re-chained transport suppression reclassification', async () => {
  const { config: baselineConfig } = await simulationConfig();
  const config = {
    ...baselineConfig,
    links: baselineConfig.links.map((link) =>
      link.fromPeerId === 'peer-a' && link.toPeerId === 'peer-b'
        ? { ...link, enabled: false }
        : link
    ),
  };
  const kernel = await createMeshSimulationKernel(config);
  kernel.enqueue(pingB);
  await kernel.step();
  const snapshot = structuredClone(kernel.snapshot());
  const record = snapshot.records[0];
  assert.equal(record.transportOutcome.deliveries[0].outcome, 'partition');
  record.transportOutcome.deliveries[0].outcome = 'crash';
  record.transportOutcome.droppedByPartition -= 1;
  record.transportOutcome.droppedByCrash += 1;
  record.metricsDelta.partitionSuppressedMessages -= 1;
  record.metricsDelta.crashSuppressedEvents += 1;
  snapshot.metrics.partitionSuppressedMessages -= 1;
  snapshot.metrics.crashSuppressedEvents += 1;
  await rechainSnapshot(snapshot);

  await assert.rejects(
    restoreMeshSimulationKernel(config, snapshot),
    /transport outcome is inconsistent/u
  );
});

test('snapshot restore rejects a removed delivery attributed to two faults even when re-chained', async () => {
  const { config: baselineConfig } = await simulationConfig();
  const deliveryEventId = await scheduledPingDeliveryId(baselineConfig);
  const config = {
    ...baselineConfig,
    faultPlan: faultPlan([
      {
        faultId: 'drop-victim',
        kind: 'message.drop',
        logicalTime: 1_001,
        priority: 0,
        deliveryEventId,
      },
      {
        faultId: 'partition-after-drop',
        kind: 'network.partition',
        logicalTime: 1_002,
        priority: 0,
        links: [{ fromPeerId: 'peer-a', toPeerId: 'peer-b' }],
      },
    ]),
  };
  const kernel = await createMeshSimulationKernel(config);
  kernel.enqueue(pingB);
  await kernel.step();
  await kernel.step();
  await kernel.step();
  const snapshot = structuredClone(kernel.snapshot());
  const victim = structuredClone(snapshot.faults[0].affectedDeliveries[0]);
  snapshot.faults[1].affectedEventIds.push(victim.eventId);
  snapshot.faults[1].affectedDeliveries.push(victim);
  const partitionRecord = snapshot.records.find(
    ({ faultId }) => faultId === 'partition-after-drop'
  );
  partitionRecord.metricsDelta.droppedMessages += 1;
  partitionRecord.metricsDelta.partitionSuppressedMessages += 1;
  snapshot.metrics.droppedMessages += 1;
  snapshot.metrics.partitionSuppressedMessages += 1;
  await rechainSnapshot(snapshot);

  await assert.rejects(
    restoreMeshSimulationKernel(config, snapshot),
    /multiple faults/u
  );
});

test('crash, resume, reorder and minority partition remain deterministic and bounded', async () => {
  const { config: baselineConfig } = await simulationConfig();
  const deliveryEventId = await scheduledPingDeliveryId(baselineConfig);
  const reorderedConfig = {
    ...baselineConfig,
    faultPlan: faultPlan([
      {
        faultId: 'reorder-ping',
        kind: 'message.reorder',
        logicalTime: 1_001,
        priority: 0,
        deliveryEventId,
        newLogicalTime: 1_010,
        newPriority: -1,
      },
    ]),
  };
  const reordered = await runMeshSimulation(reorderedConfig, [pingB]);
  assert.equal(reordered.metrics.reorderedMessages, 1);
  assert.equal(
    reordered.records.find((record) => record.eventId === deliveryEventId).order
      .logicalTime,
    1_010
  );

  const crashedConfig = {
    ...baselineConfig,
    faultPlan: faultPlan([
      {
        faultId: 'crash-b',
        kind: 'peer.crash',
        logicalTime: 1_001,
        priority: 0,
        peerId: 'peer-b',
      },
      {
        faultId: 'resume-b',
        kind: 'peer.resume',
        logicalTime: 1_100,
        priority: 0,
        peerId: 'peer-b',
      },
    ]),
  };
  const crashed = await runMeshSimulation(crashedConfig, [pingB]);
  assert.equal(crashed.metrics.peerCrashes, 1);
  assert.equal(crashed.metrics.peerResumes, 1);
  assert.equal(crashed.metrics.crashSuppressedEvents, 1);
  assert.equal(crashed.peerStates['peer-a'].peers['peer-b'], undefined);

  const partitionedConfig = {
    ...baselineConfig,
    faultPlan: faultPlan([
      {
        faultId: 'minority-partition',
        kind: 'network.partition',
        logicalTime: 999,
        priority: 0,
        links: [
          { fromPeerId: 'peer-a', toPeerId: 'peer-b' },
          { fromPeerId: 'peer-b', toPeerId: 'peer-a' },
        ],
      },
      {
        faultId: 'minority-heal',
        kind: 'network.heal',
        logicalTime: 2_000,
        priority: 0,
        links: [
          { fromPeerId: 'peer-a', toPeerId: 'peer-b' },
          { fromPeerId: 'peer-b', toPeerId: 'peer-a' },
        ],
      },
    ]),
  };
  const partitioned = await runMeshSimulation(partitionedConfig, [pingB]);
  assert.equal(partitioned.metrics.processedEvents, 3);
  assert.equal(partitioned.metrics.partitionSuppressedMessages, 1);
  assert.equal(partitioned.metrics.deliveredMessages, 0);
  assert.equal(partitioned.peerStates['peer-a'].peers['peer-b'], undefined);
  assert.equal(partitioned.metrics.finalLogicalTime, 2_000);
});

test('partition drops in-flight delivery and heal requires an explicit retry', async () => {
  const { config: baselineConfig } = await simulationConfig();
  const config = {
    ...baselineConfig,
    faultPlan: faultPlan([
      {
        faultId: 'partition-in-flight-a-b',
        kind: 'network.partition',
        logicalTime: 1_001,
        priority: 0,
        links: [{ fromPeerId: 'peer-a', toPeerId: 'peer-b' }],
      },
      {
        faultId: 'heal-after-drop-a-b',
        kind: 'network.heal',
        logicalTime: 2_000,
        priority: 0,
        links: [{ fromPeerId: 'peer-a', toPeerId: 'peer-b' }],
      },
    ]),
  };
  const kernel = await createMeshSimulationKernel(config);
  kernel.enqueue(pingB);
  await kernel.step();
  const inFlight = kernel
    .snapshot()
    .queuedEvents.find((event) => event.action.kind === 'message.delivery');
  assert.ok(inFlight);
  const retryEnvelope = structuredClone(inFlight.action.envelope);

  await kernel.step();
  const partitioned = kernel.snapshot();
  assert.equal(
    partitioned.queuedEvents.some(
      ({ eventId }) => eventId === inFlight.eventId
    ),
    false
  );
  assert.equal(
    partitioned.faults[0].affectedEventIds.includes(inFlight.eventId),
    true
  );
  assert.equal(partitioned.metrics.partitionSuppressedMessages, 1);
  assert.equal(partitioned.metrics.droppedMessages, 1);

  await kernel.step();
  assert.equal(
    kernel
      .snapshot()
      .queuedEvents.some(({ eventId }) => eventId === inFlight.eventId),
    false,
    'heal must not resurrect a dropped delivery'
  );
  kernel.enqueue({
    eventId: 'delivery:explicit-retry-after-heal',
    targetPeerId: 'peer-b',
    logicalTime: 2_001,
    priority: 0,
    action: { kind: 'message.delivery', envelope: retryEnvelope },
  });
  const trace = await kernel.runUntilIdle();
  assert.equal(
    trace.records.some(({ eventId }) => eventId === inFlight.eventId),
    false
  );
  assert.equal(
    trace.records.find(
      ({ eventId }) => eventId === 'delivery:explicit-retry-after-heal'
    ).accepted,
    true
  );
});

test('partition ledgers restore when a delivery eventId equals its link key', async () => {
  const { config: baselineConfig } = await simulationConfig();
  const producer = await createMeshSimulationKernel(baselineConfig);
  producer.enqueue(pingB);
  await producer.step();
  const prepared = producer
    .snapshot()
    .queuedEvents.find((event) => event.action.kind === 'message.delivery');
  assert.ok(prepared);

  const collidingId = JSON.stringify(['peer-a', 'peer-b']);
  const config = {
    ...baselineConfig,
    faultPlan: faultPlan([
      {
        faultId: 'partition-colliding-delivery',
        kind: 'network.partition',
        logicalTime: 10,
        priority: 0,
        links: [{ fromPeerId: 'peer-a', toPeerId: 'peer-b' }],
      },
    ]),
  };
  const kernel = await createMeshSimulationKernel(config);
  kernel.enqueue({
    eventId: collidingId,
    targetPeerId: 'peer-b',
    logicalTime: 20,
    priority: 0,
    action: {
      kind: 'message.delivery',
      envelope: structuredClone(prepared.action.envelope),
    },
  });
  await kernel.step();
  const snapshot = kernel.snapshot();

  assert.deepEqual(snapshot.faults[0].affectedLinkIds, [collidingId]);
  assert.deepEqual(snapshot.faults[0].affectedEventIds, [collidingId]);
  assert.equal(snapshot.faults[0].affectedDeliveries[0].eventId, collidingId);
  const restored = await restoreMeshSimulationKernel(
    config,
    structuredClone(snapshot)
  );
  assert.deepEqual(restored.snapshot(), snapshot);
});

test('fault plan bounds and closed schemas fail before simulation', async () => {
  const { config } = await simulationConfig();
  await assert.rejects(
    createMeshSimulationKernel({
      ...config,
      faultPlan: { schemaVersion: 2, faults: [] },
    }),
    /fault plan/u
  );
  await assert.rejects(
    createMeshSimulationKernel({
      ...config,
      faultPlan: {
        schemaVersion: 1,
        faults: [
          {
            faultId: 'too-many-copies',
            kind: 'message.duplicate',
            logicalTime: 1,
            priority: 0,
            deliveryEventId: 'delivery:any',
            copies: 17,
          },
        ],
      },
    }),
    /duplicate bound/u
  );
  await assert.rejects(
    createMeshSimulationKernel({
      ...config,
      faultPlan: {
        schemaVersion: 1,
        faults: [
          {
            faultId: 'unknown-link',
            kind: 'network.partition',
            logicalTime: 1,
            priority: 0,
            links: [{ fromPeerId: 'peer-a', toPeerId: 'peer-a' }],
          },
        ],
      },
    }),
    /fault link/u
  );
  await assert.rejects(
    createMeshSimulationKernel({
      ...config,
      faultPlan: {
        schemaVersion: 1,
        faults: [
          {
            faultId: 'extra-field',
            kind: 'peer.crash',
            logicalTime: 1,
            priority: 0,
            peerId: 'peer-a',
            ignored: true,
          },
        ],
      },
    }),
    /unsupported/u
  );

  const configuredFault = {
    faultId: 'configured-crash',
    kind: 'peer.crash',
    logicalTime: 1,
    priority: 0,
    peerId: 'peer-a',
  };
  const plannedConfig = {
    ...config,
    faultPlan: { schemaVersion: 1, faults: [configuredFault] },
  };
  const plannedKernel = await createMeshSimulationKernel(plannedConfig);
  assert.throws(
    () =>
      plannedKernel.enqueue({
        eventId: 'unplanned-fault',
        targetPeerId: 'peer-b',
        logicalTime: 1,
        priority: 0,
        action: {
          kind: 'fault.apply',
          fault: { ...configuredFault, faultId: 'injected-crash' },
        },
      }),
    /configured fault plan/u
  );
  const tamperedSnapshot = structuredClone(plannedKernel.snapshot());
  tamperedSnapshot.queuedEvents[0].action.fault.peerId = 'peer-b';
  await assert.rejects(
    restoreMeshSimulationKernel(plannedConfig, tamperedSnapshot),
    /fault queue/u
  );
});
