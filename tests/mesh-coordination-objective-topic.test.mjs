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
  createMeshCoordinationObjectiveTopicDriver,
  createMeshCoordinationState,
  createMeshDiscoveryInboundProcessor,
  createMeshDiscoveryInboundRuntimeState,
  createMeshDiscoveryState,
  createMeshObjectiveInboundProcessor,
  createMeshObjectiveInboundRuntimeState,
  createMeshObjectiveWorkState,
} from '@agentplat/mesh/coordination';
import { MESH_SIGNATURE_ALGORITHM } from '@agentplat/mesh-protocol';

const fixtureRoot = new URL(
  '../packages/mesh-protocol/fixtures/v0/',
  import.meta.url
);
const announceFixture = fixture('objective-announce.json');
const peerCardFixture = fixture('peer-card.json');
const verifiedAt = '2026-07-30T00:00:01.000Z';
const dualWireSigner = createWebCryptoMeshEnvelopeSigner({
  signingPolicy: { allowedWireVersions: [0, 1] },
});

function fixture(name) {
  return JSON.parse(readFileSync(new URL(name, fixtureRoot), 'utf8'));
}

function messageId(value) {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(12, value);
  return Buffer.from(bytes).toString('base64url');
}

function identity(peerId, instanceId = `instance-${peerId.slice(-1)}`) {
  return {
    tenantId: 'tenant-a',
    meshId: 'mesh-a',
    peerId,
    instanceId,
    keyId: `key-${peerId.slice(-1)}`,
  };
}

function runtime(
  local,
  admittedPeers,
  subscriptions = ['membership', 'objective']
) {
  const own = typeof local === 'string' ? identity(local) : local;
  return createMeshObjectiveInboundRuntimeState(
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
    createMeshObjectiveWorkState({
      identity: own,
      issuerAuthorities: admittedPeers.map((peerId) => ({
        peerId,
        keyIds: [identity(peerId).keyId],
        validUntil: '2027-01-01T00:00:00.000Z',
      })),
    }),
    createMeshCoordinationInboundState({ identity: own })
  );
}

async function setup({
  bAdmitsA = true,
  bSubscriptions,
  driverOptions = {},
  onDiagnostic,
  processorFor,
  staleBView = false,
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
  const discoveryProcessor = createMeshDiscoveryInboundProcessor({
    resolver,
    cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
  });
  const objectiveProcessor = createMeshObjectiveInboundProcessor({
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
  async function signed(peerId, number, overrides = {}) {
    const envelope = structuredClone(announceFixture);
    const suffix = peerId.slice(-1);
    const objectiveId =
      overrides.objectiveId ?? `objective-${peerId}-${number}`;
    envelope.messageId = messageId(number);
    envelope.sequence = number;
    envelope.objectiveId = objectiveId;
    envelope.sender = { peerId, instanceId: `instance-${suffix}` };
    envelope.proof.keyId = `key-${suffix}`;
    envelope.payload.objectiveId = objectiveId;
    envelope.payload.objectiveDocumentId = `document-${peerId}-${number}`;
    envelope.payload.issuerPeerId = peerId;
    envelope.payload.recoveryWitnessPeerIds = peers.filter(
      (candidate) => candidate !== peerId
    );
    Object.assign(envelope, overrides.envelope);
    Object.assign(envelope.payload, overrides.payload);
    return dualWireSigner.sign({
      envelope,
      privateKey: keys[peerId].privateKey,
    });
  }
  async function learn(receiver, sender, number) {
    const envelope = structuredClone(peerCardFixture);
    const suffix = sender.slice(-1);
    envelope.messageId = messageId(number);
    envelope.sequence = number;
    envelope.sender = { peerId: sender, instanceId: `instance-${suffix}` };
    envelope.proof.keyId = `key-${suffix}`;
    envelope.payload.peerCardId = `card-${suffix}`;
    envelope.payload.subjectPeerId = sender;
    envelope.payload.instanceId = `instance-${suffix}`;
    envelope.payload.transportHints = [`https://${sender}.example.test/mesh`];
    envelope.payload.capabilityIds = [`capability-${suffix}`];
    const result = await discoveryProcessor.process(
      createMeshDiscoveryInboundRuntimeState(
        states[receiver].coordination,
        states[receiver].discovery,
        states[receiver].inbound
      ),
      {
        envelope: await dualWireSigner.sign({
          envelope,
          privateKey: keys[sender].privateKey,
        }),
        verifiedAt,
        receivedAt: number,
      }
    );
    assert.equal(result.accepted, true);
    states[receiver] = createMeshObjectiveInboundRuntimeState(
      result.state.coordination,
      result.state.discovery,
      states[receiver].objectives,
      result.state.inbound
    );
  }
  await learn('peer-a', 'peer-b', 1);
  if (bAdmitsA) await learn('peer-b', 'peer-a', 2);
  await learn('peer-b', 'peer-c', 3);
  await learn('peer-c', 'peer-b', 4);
  let now = staleBView ? 20_000_000_000 : 10;
  const diagnostics = [];
  const driver = createMeshCoordinationObjectiveTopicDriver({
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
        processor:
          processorFor?.(peerId, objectiveProcessor) ?? objectiveProcessor,
      }),
    ])
  );
  return { driver, endpoints, keys, signed, diagnostics, objectiveProcessor };
}

test('Objective delivery is signed, sender-local, and explicitly republished', async () => {
  const { driver, endpoints, signed } = await setup();
  const fromA = await signed('peer-a', 10);
  assert.deepEqual(
    (await endpoints['peer-a'].publish({ envelope: fromA })).map((receipt) => [
      receipt.status,
      receipt.target.peerId,
      receipt.target.instanceId,
    ]),
    [['accepted', 'peer-b', 'instance-b']]
  );
  assert.equal(
    endpoints['peer-b'].getState().objectives.objectives['objective-peer-a-10']
      .issuerPeerId,
    'peer-a'
  );
  assert.equal(
    endpoints['peer-c'].getState().objectives.objectives['objective-peer-a-10'],
    undefined
  );
  await assert.rejects(
    async () => endpoints['peer-b'].publish({ envelope: fromA }),
    /sender identity mismatch/u
  );

  const fromB = await signed('peer-b', 11);
  assert.deepEqual(
    (await endpoints['peer-b'].publish({ envelope: fromB })).map((receipt) => [
      receipt.status,
      receipt.target.peerId,
    ]),
    [
      ['accepted', 'peer-a'],
      ['accepted', 'peer-c'],
    ]
  );
  assert.equal(
    endpoints['peer-c'].getState().objectives.objectives['objective-peer-b-11']
      .issuerPeerId,
    'peer-b'
  );
  await driver.close();
});

test('Objective recipient selection ignores partial, stale, unsubscribed, and unadmitted views', async () => {
  const partial = await setup({ staleBView: true });
  assert.deepEqual(
    await partial.endpoints['peer-a'].publish({
      envelope: await partial.signed('peer-a', 20),
    }),
    []
  );
  await partial.driver.close();

  const missing = await setup();
  const missingDriver = createMeshCoordinationObjectiveTopicDriver({
    tenantId: 'tenant-a',
    meshId: 'mesh-a',
    clock: { now: () => ({ verifiedAt, receivedAt: 10 }) },
  });
  const missingA = missingDriver.register({
    state: missing.endpoints['peer-a'].getState(),
    processor: missing.objectiveProcessor,
  });
  assert.deepEqual(
    (
      await missingA.publish({ envelope: await missing.signed('peer-a', 21) })
    ).map((receipt) => receipt.status),
    ['unavailable']
  );
  await missingDriver.close();
  await missing.driver.close();

  for (const options of [
    { bSubscriptions: ['membership'] },
    { bAdmitsA: false },
  ]) {
    const { driver, endpoints, signed, diagnostics } = await setup(options);
    const before = endpoints['peer-b'].getState();
    assert.deepEqual(
      (
        await endpoints['peer-a'].publish({
          envelope: await signed(
            'peer-a',
            options.bAdmitsA === false ? 22 : 21
          ),
        })
      ).map((receipt) => receipt.status),
      ['rejected']
    );
    assert.equal(endpoints['peer-b'].getState(), before);
    assert.equal(diagnostics.length, 1);
    assert.match(
      diagnostics[0].code,
      /topic_not_subscribed|sender_not_admitted/u
    );
    await driver.close();
  }
});

test('Objective batches are atomic, FIFO, and pinned to selected endpoints', async () => {
  const saturated = await setup({
    driverOptions: { maximumQueueDepth: 1, maximumQueuedBytes: 1 },
  });
  const beforeA = saturated.endpoints['peer-a'].getState();
  const beforeC = saturated.endpoints['peer-c'].getState();
  assert.deepEqual(
    (
      await saturated.endpoints['peer-b'].publish({
        envelope: await saturated.signed('peer-b', 30),
      })
    ).map((receipt) => receipt.status),
    ['rejected', 'rejected']
  );
  assert.equal(saturated.endpoints['peer-a'].getState(), beforeA);
  assert.equal(saturated.endpoints['peer-c'].getState(), beforeC);
  await saturated.driver.close();

  const seen = [];
  const fifo = await setup({
    processorFor: (peerId, processor) =>
      peerId === 'peer-b'
        ? {
            process: async (state, request) => {
              seen.push(request.envelope.messageId);
              return processor.process(state, request);
            },
          }
        : processor,
  });
  const first = await fifo.signed('peer-a', 31);
  const second = await fifo.signed('peer-a', 32);
  assert.deepEqual(
    (
      await Promise.all([
        fifo.endpoints['peer-a'].publish({ envelope: first }),
        fifo.endpoints['peer-a'].publish({ envelope: second }),
      ])
    )
      .flat()
      .map((receipt) => receipt.status),
    ['accepted', 'accepted']
  );
  assert.deepEqual(seen, [first.messageId, second.messageId]);
  await fifo.driver.close();

  const pinned = await setup();
  const pending = pinned.endpoints['peer-a'].publish({
    envelope: await pinned.signed('peer-a', 33),
  });
  pinned.endpoints['peer-b'].unregister();
  pinned.driver.register({
    state: runtime(identity('peer-b', 'instance-b-replacement'), ['peer-a']),
    processor: pinned.objectiveProcessor,
  });
  assert.deepEqual(
    (await pending).map((receipt) => receipt.status),
    ['unavailable']
  );
  await pinned.driver.close();
});

test('Objective delivery coarsens local failures and isolates observer errors', async () => {
  for (const processorFor of [
    (_peerId, processor) => ({
      process: async () => {
        throw new Error('receiver failure');
      },
    }),
    (_peerId, processor) => ({
      process: async (state, request) => {
        const decision = await processor.process(state, request);
        return Object.freeze({ ...decision, unexpected: true });
      },
    }),
    (_peerId, processor) => ({
      process: async (state, request) => {
        const decision = await processor.process(state, request);
        return Object.freeze({
          accepted: false,
          code: 'forged_rejection',
          state: decision.state,
        });
      },
    }),
    (_peerId, processor) => ({
      process: async (state, request) => {
        const decision = await processor.process(state, request);
        if (!decision.accepted) return decision;
        return Object.freeze({ ...decision, state });
      },
    }),
    (_peerId, processor) => ({
      process: async (state, request) => {
        const decision = await processor.process(state, request);
        if (!decision.accepted) return decision;
        return Object.freeze({
          ...decision,
          envelope: Object.freeze({
            ...decision.envelope,
            sentAt: '2026-07-30T00:00:00.001Z',
          }),
        });
      },
    }),
  ]) {
    const failed = await setup({
      onDiagnostic: () => {
        throw new Error('observer failure');
      },
      processorFor: (peerId, processor) =>
        peerId === 'peer-b' ? processorFor(peerId, processor) : processor,
    });
    assert.deepEqual(
      (
        await failed.endpoints['peer-a'].publish({
          envelope: await failed.signed(
            'peer-a',
            40 + failed.diagnostics.length
          ),
        })
      ).map((receipt) => receipt.status),
      ['rejected']
    );
    assert.equal(failed.diagnostics[0].code, 'endpoint_failed');
    await failed.driver.close();
  }

  const siblings = await setup({
    onDiagnostic: () => {
      throw new Error('observer failure');
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
  assert.deepEqual(
    (
      await siblings.endpoints['peer-b'].publish({
        envelope: await siblings.signed('peer-b', 50),
      })
    ).map((receipt) => receipt.status),
    ['rejected', 'accepted']
  );
  assert.equal(
    siblings.endpoints['peer-c'].getState().objectives.objectives[
      'objective-peer-b-50'
    ].issuerPeerId,
    'peer-b'
  );
  await siblings.driver.close();
});

test('public Objective diagnostics are closed, redacted, and cannot change delivery', async () => {
  const sensitiveMarkers = Object.freeze([
    'private-material-must-not-serialize',
    'credential-material-must-not-serialize',
    'raw-sensitive-content-must-not-serialize',
    'private-reasoning-must-not-serialize',
  ]);
  const failingReceiver = (peerId, processor) =>
    peerId === 'peer-b'
      ? {
          process: async () => {
            throw new Error(JSON.stringify(sensitiveMarkers));
          },
        }
      : processor;
  const observed = await setup({ processorFor: failingReceiver });
  const beforeObserved = observed.endpoints['peer-b'].getState();
  const observedReceipt = await observed.endpoints['peer-a'].publish({
    envelope: await observed.signed('peer-a', 55),
  });

  assert.deepEqual(
    observedReceipt.map((receipt) => receipt.status),
    ['rejected']
  );
  assert.equal(observed.endpoints['peer-b'].getState(), beforeObserved);
  assert.equal(observed.diagnostics.length, 1);
  const serialized = JSON.stringify(observed.diagnostics[0]);
  assert.deepEqual(Object.keys(JSON.parse(serialized)).sort(), [
    'code',
    'messageId',
    'status',
    'target',
  ]);
  assert.deepEqual(Object.keys(JSON.parse(serialized).target).sort(), [
    'instanceId',
    'meshId',
    'peerId',
    'tenantId',
  ]);
  for (const value of sensitiveMarkers) {
    assert.equal(serialized.includes(value), false);
  }

  const throwingSink = await setup({
    onDiagnostic: () => {
      throw new Error('sink failure');
    },
    processorFor: failingReceiver,
  });
  const beforeThrowing = throwingSink.endpoints['peer-b'].getState();
  const throwingReceipt = await throwingSink.endpoints['peer-a'].publish({
    envelope: await throwingSink.signed('peer-a', 55),
  });
  assert.deepEqual(throwingReceipt, observedReceipt);
  assert.equal(throwingSink.endpoints['peer-b'].getState(), beforeThrowing);

  await observed.driver.close();
  await throwingSink.driver.close();
});

test('Objective close drains admitted work and rejects later publication', async () => {
  const { driver, endpoints, signed } = await setup();
  const accepted = endpoints['peer-a'].publish({
    envelope: await signed('peer-a', 60),
  });
  const closed = driver.close();
  assert.deepEqual(
    (await accepted).map((receipt) => receipt.status),
    ['accepted']
  );
  await closed;
  await assert.rejects(
    async () =>
      endpoints['peer-a'].publish({ envelope: await signed('peer-a', 61) }),
    /closed/u
  );
});
