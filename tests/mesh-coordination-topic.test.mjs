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
  createMeshCoordinationInboundState,
  createMeshCoordinationState,
  createMeshCoordinationTopicDriver,
  createMeshDiscoveryInboundProcessor,
  createMeshDiscoveryInboundRuntimeState,
  createMeshDiscoveryState,
} from '@agentplat/mesh/coordination';
import { MESH_SIGNATURE_ALGORITHM } from '@agentplat/mesh-protocol';

const fixtureRoot = new URL(
  '../packages/mesh-protocol/fixtures/v0/',
  import.meta.url
);
const peerCardFixture = fixture('peer-card.json');
const capabilityFixture = fixture('capability-advertise.json');
const verifiedAt = '2026-07-30T00:00:01.000Z';

function fixture(name) {
  return JSON.parse(readFileSync(new URL(name, fixtureRoot), 'utf8'));
}

function messageId(value) {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(12, value);
  return Buffer.from(bytes).toString('base64url');
}

function identity(peerId) {
  return {
    tenantId: 'tenant-a',
    meshId: 'mesh-a',
    peerId,
    instanceId: `instance-${peerId.slice(-1)}`,
    keyId: `key-${peerId.slice(-1)}`,
  };
}

function runtime(
  local,
  admittedPeers,
  subscriptions = ['membership', 'capability']
) {
  const own = typeof local === 'string' ? identity(local) : local;
  return createMeshDiscoveryInboundRuntimeState(
    createMeshCoordinationState({ identity: own }),
    createMeshDiscoveryState({
      identity: own,
      admittedPeers: admittedPeers.map((peerId) => ({
        peerId,
        instanceIds: [identity(peerId).instanceId],
        validUntil: '2027-01-01T00:00:00.000Z',
      })),
      subscriptions,
    }),
    createMeshCoordinationInboundState({ identity: own })
  );
}

async function signed(kind, peerId, number, privateKey) {
  const source = structuredClone(
    kind === 'peer.card' ? peerCardFixture : capabilityFixture
  );
  const suffix = peerId.slice(-1);
  source.messageId = messageId(number);
  source.sequence = number;
  source.sender = { peerId, instanceId: `instance-${suffix}` };
  source.proof.keyId = `key-${suffix}`;
  if (kind === 'peer.card') {
    source.payload.peerCardId = `card-${suffix}`;
    source.payload.subjectPeerId = peerId;
    source.payload.instanceId = `instance-${suffix}`;
    source.payload.transportHints = [`https://${peerId}.example.test/mesh`];
    source.payload.capabilityIds = [`capability-${suffix}`];
  } else {
    source.payload.advertisementId = `advertisement-${suffix}`;
    source.payload.capabilityId = `capability-${suffix}`;
    source.payload.ownerPeerId = peerId;
  }
  return signMeshEnvelope({ envelope: source, privateKey });
}

async function setup({
  bAdmitsA = true,
  bSubscriptions,
  driverOptions = {},
  onDiagnostic,
  processorFor,
} = {}) {
  const peers = ['peer-a', 'peer-b', 'peer-c', 'peer-d'];
  const keys = Object.fromEntries(
    await Promise.all(
      peers.map(async (peerId) => [
        peerId,
        await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
          'sign',
          'verify',
        ]),
      ])
    )
  );
  const resolver = createStaticMeshKeyResolver(
    peers.map((peerId) => ({
      ...identity(peerId),
      algorithm: MESH_SIGNATURE_ALGORITHM,
      publicKey: keys[peerId].publicKey,
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2027-01-01T00:00:00.000Z',
      status: 'active',
    }))
  );
  const processor = createMeshDiscoveryInboundProcessor({
    resolver,
    cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
  });
  const states = {
    'peer-a': runtime('peer-a', ['peer-b']),
    'peer-b': runtime(
      'peer-b',
      bAdmitsA ? ['peer-a', 'peer-c'] : ['peer-c'],
      bSubscriptions
    ),
    'peer-c': runtime('peer-c', ['peer-b']),
    'peer-d': runtime('peer-d', []),
  };
  async function learn(receiver, sender, number) {
    const envelope = await signed(
      'peer.card',
      sender,
      number,
      keys[sender].privateKey
    );
    const result = await processor.process(states[receiver], {
      envelope,
      verifiedAt,
      receivedAt: number,
    });
    assert.equal(result.accepted, true);
    states[receiver] = result.state;
  }
  await learn('peer-a', 'peer-b', 1);
  if (bAdmitsA) await learn('peer-b', 'peer-a', 2);
  await learn('peer-b', 'peer-c', 3);
  await learn('peer-c', 'peer-b', 4);
  let now = 10;
  const diagnostics = [];
  const driver = createMeshCoordinationTopicDriver({
    ...driverOptions,
    tenantId: 'tenant-a',
    meshId: 'mesh-a',
    clock: { now: () => ({ verifiedAt, receivedAt: now++ }) },
    onDiagnostic: (detail) => {
      diagnostics.push(detail);
      onDiagnostic?.(detail);
    },
  });
  const endpoints = Object.fromEntries(
    peers.map((peerId) => [
      peerId,
      driver.register({
        state: states[peerId],
        processor: processorFor?.(peerId, processor) ?? processor,
      }),
    ])
  );
  return { driver, endpoints, keys, signed, diagnostics };
}

test('topic delivery is scoped to the sender view, signed, non-forwarding and serialized', async () => {
  const { driver, endpoints, keys, signed, diagnostics } = await setup();
  const fromA = await signed(
    'capability.advertise',
    'peer-a',
    10,
    keys['peer-a'].privateKey
  );
  const [first, duplicate] = await Promise.all([
    endpoints['peer-a'].publish({ envelope: fromA }),
    endpoints['peer-a'].publish({ envelope: fromA }),
  ]);
  assert.deepEqual(
    first.map((receipt) => receipt.target.peerId),
    ['peer-b']
  );
  assert.deepEqual(
    first.map((receipt) => receipt.status),
    ['accepted']
  );
  assert.deepEqual(
    duplicate.map((receipt) => receipt.status),
    ['rejected']
  );
  assert.equal(
    endpoints['peer-b'].getState().discovery.capabilities[
      JSON.stringify(['peer-a', 'capability-a'])
    ].ownerPeerId,
    'peer-a'
  );
  assert.equal(
    endpoints['peer-c'].getState().discovery.capabilities[
      JSON.stringify(['peer-a', 'capability-a'])
    ],
    undefined
  );
  assert.equal(endpoints['peer-d'].getState().inbound.lastLogicalTime, 0);

  const fromB = await signed(
    'capability.advertise',
    'peer-b',
    11,
    keys['peer-b'].privateKey
  );
  const receipts = await endpoints['peer-b'].publish({ envelope: fromB });
  assert.deepEqual(
    receipts.map((receipt) => receipt.target.peerId),
    ['peer-a', 'peer-c']
  );
  assert.equal(
    endpoints['peer-c'].getState().discovery.capabilities[
      JSON.stringify(['peer-b', 'capability-b'])
    ].ownerPeerId,
    'peer-b'
  );
  assert.equal(
    endpoints['peer-a'].getState().discovery.peerViews['peer-c'],
    undefined
  );
  await assert.rejects(
    async () => endpoints['peer-a'].publish({ envelope: fromA, fanout: 0 }),
    /fanout/u
  );
  await assert.rejects(
    async () => endpoints['peer-a'].publish({ envelope: fromA, fanout: 33 }),
    /fanout/u
  );
  for (const mutate of [
    (value) => {
      value.audience = { kind: 'peer', peerId: 'peer-b' };
    },
    (value) => {
      value.audience.topic = 'membership';
    },
    (value) => {
      value.sender.peerId = 'peer-b';
    },
    (value) => {
      value.tenantId = 'tenant-other';
    },
  ]) {
    const invalid = structuredClone(fromA);
    mutate(invalid);
    await assert.rejects(async () =>
      endpoints['peer-a'].publish({ envelope: invalid })
    );
  }
  await driver.idle();
});

test('topic driver snapshots exact endpoints, coarsens failures, bounds batches and drains on close', async () => {
  const { driver, endpoints, keys, signed } = await setup();
  const envelope = await signed(
    'capability.advertise',
    'peer-a',
    20,
    keys['peer-a'].privateKey
  );
  const pending = endpoints['peer-a'].publish({ envelope });
  endpoints['peer-b'].unregister();
  assert.deepEqual(
    (await pending).map((receipt) => receipt.status),
    ['unavailable']
  );
  await driver.idle();
  await driver.close();
  await assert.rejects(
    async () => endpoints['peer-a'].publish({ envelope }),
    /closed/u
  );

  const bounded = createMeshCoordinationTopicDriver({
    tenantId: 'tenant-a',
    meshId: 'mesh-a',
    clock: { now: () => ({ verifiedAt, receivedAt: 100 }) },
    maximumQueueDepth: 1,
    maximumQueuedBytes: 1,
    maximumDeliveriesPerPublish: 1,
  });
  const a = endpoints['peer-a'].getState();
  const b = endpoints['peer-b'].getState();
  const aPeer = bounded.register({
    state: a,
    processor: createMeshDiscoveryInboundProcessor({
      resolver: createStaticMeshKeyResolver([]),
      cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
    }),
  });
  bounded.register({
    state: b,
    processor: createMeshDiscoveryInboundProcessor({
      resolver: createStaticMeshKeyResolver([]),
      cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
    }),
  });
  assert.deepEqual(
    (await aPeer.publish({ envelope, fanout: 1 })).map(
      (receipt) => receipt.status
    ),
    ['rejected']
  );
  await bounded.close();

  const oneEndpoint = createMeshCoordinationTopicDriver({
    tenantId: 'tenant-a',
    meshId: 'mesh-a',
    clock: { now: () => ({ verifiedAt, receivedAt: 100 }) },
    maximumEndpoints: 1,
  });
  oneEndpoint.register({
    state: endpoints['peer-a'].getState(),
    processor: createMeshDiscoveryInboundProcessor({
      resolver: createStaticMeshKeyResolver([]),
      cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
    }),
  });
  assert.throws(
    () =>
      oneEndpoint.register({
        state: endpoints['peer-b'].getState(),
        processor: createMeshDiscoveryInboundProcessor({
          resolver: createStaticMeshKeyResolver([]),
          cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
        }),
      }),
    /capacity/u
  );
  await oneEndpoint.close();
});

test('receiver admission and subscription failures are coarsened but retained in diagnostics', async () => {
  for (const options of [
    { bSubscriptions: ['membership'] },
    { bAdmitsA: false },
  ]) {
    const { driver, endpoints, keys, signed, diagnostics } =
      await setup(options);
    const envelope = await signed(
      'capability.advertise',
      'peer-a',
      30,
      keys['peer-a'].privateKey
    );
    const before = endpoints['peer-b'].getState();
    assert.deepEqual(
      (await endpoints['peer-a'].publish({ envelope })).map(
        (receipt) => receipt.status
      ),
      ['rejected']
    );
    assert.equal(endpoints['peer-b'].getState(), before);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].status, 'rejected');
    assert.match(
      diagnostics[0].code,
      /topic_not_subscribed|sender_not_admitted/u
    );
    await driver.close();
  }
});

test('fanout batches are atomic, pinned to full instances, and close drains admitted work', async () => {
  const saturated = await setup({
    driverOptions: { maximumQueueDepth: 1, maximumQueuedBytes: 1 },
  });
  const fromB = await saturated.signed(
    'capability.advertise',
    'peer-b',
    40,
    saturated.keys['peer-b'].privateKey
  );
  const beforeA = saturated.endpoints['peer-a'].getState();
  const beforeC = saturated.endpoints['peer-c'].getState();
  const saturatedReceipts = await saturated.endpoints['peer-b'].publish({
    envelope: fromB,
  });
  assert.deepEqual(
    saturatedReceipts.map((receipt) => receipt.status),
    ['rejected', 'rejected']
  );
  assert.equal(saturated.endpoints['peer-a'].getState(), beforeA);
  assert.equal(saturated.endpoints['peer-c'].getState(), beforeC);
  await saturated.driver.close();

  const { driver, endpoints, keys, signed } = await setup();
  const envelope = await signed(
    'capability.advertise',
    'peer-a',
    41,
    keys['peer-a'].privateKey
  );
  const pending = endpoints['peer-a'].publish({ envelope });
  endpoints['peer-b'].unregister();
  const replacement = runtime(
    { ...identity('peer-b'), instanceId: 'instance-b-replacement' },
    ['peer-a']
  );
  driver.register({
    state: replacement,
    processor: createMeshDiscoveryInboundProcessor({
      resolver: createStaticMeshKeyResolver([]),
      cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
    }),
  });
  assert.deepEqual(
    (await pending).map((receipt) => receipt.status),
    ['unavailable']
  );
  const closeEnvelope = await signed(
    'capability.advertise',
    'peer-a',
    42,
    keys['peer-a'].privateKey
  );
  const admitted = endpoints['peer-a'].publish({ envelope: closeEnvelope });
  await driver.close();
  assert.deepEqual(
    (await admitted).map((receipt) => receipt.status),
    ['unavailable']
  );

  const draining = await setup();
  const drainEnvelope = await draining.signed(
    'capability.advertise',
    'peer-a',
    43,
    draining.keys['peer-a'].privateKey
  );
  const acceptedWork = draining.endpoints['peer-a'].publish({
    envelope: drainEnvelope,
  });
  const closed = draining.driver.close();
  assert.deepEqual(
    (await acceptedWork).map((receipt) => receipt.status),
    ['accepted']
  );
  await closed;
});

test('adjacent envelopes, fanout and internal drain steps preserve deterministic delivery', async () => {
  const { driver, endpoints, keys, signed } = await setup({
    driverOptions: { maximumInternalStepsPerDrain: 1 },
  });
  const adjacent = await Promise.all([
    signed('capability.advertise', 'peer-a', 50, keys['peer-a'].privateKey),
    signed('capability.advertise', 'peer-a', 51, keys['peer-a'].privateKey),
  ]);
  const adjacentReceipts = await Promise.all(
    adjacent.map((envelope) => endpoints['peer-a'].publish({ envelope }))
  );
  assert.deepEqual(
    adjacentReceipts.flat().map((receipt) => receipt.status),
    ['accepted', 'accepted']
  );
  await driver.idle();
  await driver.close();
});

test('fanout uses one canonical envelope and one throwing receiver cannot abort siblings', async () => {
  const seen = [];
  const shared = await setup({
    processorFor: (peerId, processor) =>
      peerId === 'peer-a' || peerId === 'peer-c'
        ? {
            process: async (state, request) => {
              seen.push(request.envelope);
              return processor.process(state, request);
            },
          }
        : processor,
  });
  const envelope = await shared.signed(
    'capability.advertise',
    'peer-b',
    60,
    shared.keys['peer-b'].privateKey
  );
  assert.deepEqual(
    (await shared.endpoints['peer-b'].publish({ envelope })).map(
      (receipt) => receipt.status
    ),
    ['accepted', 'accepted']
  );
  assert.equal(seen.length, 2);
  assert.equal(seen[0], seen[1]);
  await shared.driver.close();

  const isolated = await setup({
    onDiagnostic: () => {
      throw new Error('diagnostic observer failure');
    },
    processorFor: (peerId, processor) =>
      peerId === 'peer-a'
        ? {
            process: async () => {
              throw new Error('receiver failure');
            },
          }
        : processor,
  });
  const fromB = await isolated.signed(
    'capability.advertise',
    'peer-b',
    61,
    isolated.keys['peer-b'].privateKey
  );
  assert.deepEqual(
    (await isolated.endpoints['peer-b'].publish({ envelope: fromB })).map(
      (receipt) => receipt.status
    ),
    ['rejected', 'accepted']
  );
  assert.equal(
    isolated.endpoints['peer-c'].getState().discovery.capabilities[
      JSON.stringify(['peer-b', 'capability-b'])
    ].ownerPeerId,
    'peer-b'
  );
  await isolated.driver.close();
});

test('accepted processor results remain bound to the exact queued envelope', async () => {
  const altered = await setup({
    processorFor: (peerId, processor) =>
      peerId === 'peer-b'
        ? {
            process: async (state, request) => {
              const decision = await processor.process(state, request);
              if (!decision.accepted) return decision;
              return Object.freeze({
                ...decision,
                envelope: Object.freeze({
                  ...decision.envelope,
                  sentAt: '2026-07-29T00:00:00.001Z',
                }),
              });
            },
          }
        : processor,
  });
  const envelope = await altered.signed(
    'capability.advertise',
    'peer-a',
    70,
    altered.keys['peer-a'].privateKey
  );
  const before = altered.endpoints['peer-b'].getState();
  assert.deepEqual(
    (await altered.endpoints['peer-a'].publish({ envelope })).map(
      (receipt) => receipt.status
    ),
    ['rejected']
  );
  assert.equal(altered.endpoints['peer-b'].getState(), before);
  assert.equal(altered.diagnostics[0].code, 'endpoint_failed');
  await altered.driver.close();
});

test('idle callers share one bounded quiescence promise', async () => {
  const { driver, endpoints, keys, signed } = await setup();
  const envelope = await signed(
    'capability.advertise',
    'peer-a',
    80,
    keys['peer-a'].privateKey
  );
  const pending = endpoints['peer-a'].publish({ envelope });
  const idle = driver.idle();
  for (let index = 0; index < 1_000; index += 1) {
    assert.equal(driver.idle(), idle);
  }
  assert.deepEqual(
    (await pending).map((receipt) => receipt.status),
    ['accepted']
  );
  await idle;
  await driver.close();
});
