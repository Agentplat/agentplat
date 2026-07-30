import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';

import {
  DEFAULT_MESH_CRYPTO_POLICY,
  createStaticMeshKeyResolver,
  createWebCryptoMeshEnvelopeSigner,
  createWebCryptoMeshEnvelopeVerifier,
  signMeshEnvelope,
} from '@agentplat/mesh-crypto';
import {
  createMeshPeerState,
  reduceMeshPeer,
} from '@agentplat/mesh';
import { createMeshLoopbackTransport } from '@agentplat/mesh/loopback';
import {
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_WIRE_VERSION,
} from '@agentplat/mesh-protocol';

const clock = Object.freeze({
  now: () =>
    Object.freeze({
      logicalTime: 1_000,
      timestamp: '2026-07-30T00:00:01.000Z',
    }),
});

function messageId(value) {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(12, value);
  return Buffer.from(bytes).toString('base64url');
}

function messageIds(start) {
  let next = start;
  return {
    nextMessageId() {
      next += 1;
      return messageId(next);
    },
  };
}

async function fixture(maximumQueueDepth = 32) {
  const identities = ['peer-a', 'peer-b', 'peer-c'];
  const keys = Object.fromEntries(
    await Promise.all(
      identities.map(async (peerId) => [
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
    identities.map((peerId) => ({
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
  const transport = createMeshLoopbackTransport({ maximumQueueDepth });
  const captured = Object.create(null);
  const peers = Object.create(null);

  for (const [index, peerId] of identities.entries()) {
    const admittedPeers = identities
      .filter((candidate) => candidate !== peerId)
      .map((candidate, candidateIndex) => ({
        peerId: candidate,
        instanceIds: [`instance-${candidate}`],
        peerCardId: `card-${candidate}`,
        acceptedCardMessageId: messageId(
          9_000 + index * 10 + candidateIndex
        ),
        cardRevision: 1,
        validUntil: '2027-01-01T00:00:00Z',
      }));
    const created = createMeshPeerState({
      identity: {
        tenantId: 'tenant-a',
        meshId: 'mesh-a',
        peerId,
        instanceId: `instance-${peerId}`,
        keyId: `key-${peerId}`,
      },
      admittedPeers,
    });
    const running = reduceMeshPeer(created, { kind: 'peer.start' }, 0).state;
    peers[peerId] = transport.register({
      state: running,
      signer: {
        async sign(request) {
          const envelope = await signer.sign(request);
          captured[peerId] = envelope;
          return envelope;
        },
      },
      verifier,
      resolver,
      cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
      privateKey: keys[peerId].privateKey,
      clock,
      messageIds: messageIds(1_000 + index * 100),
    });
  }
  return { transport, peers, keys, resolver, captured };
}

test('signed loopback completes a causal ping round trip', async () => {
  const { transport, peers } = await fixture();
  const result = await peers['peer-a'].dispatch({
    kind: 'peer.ping',
    peerId: 'peer-b',
  });
  assert.equal(result.receipts.length, 1);
  assert.equal(result.receipts[0].accepted, true);
  await transport.idle();

  assert.equal(peers['peer-b'].getState().peers['peer-a'].status, 'observed');
  assert.equal(peers['peer-a'].getState().peers['peer-b'].status, 'responsive');
  assert.deepEqual(Object.keys(peers['peer-a'].getState().pendingPings), []);
  assert.equal(peers['peer-a'].snapshot().outboundSequence, 1);
  assert.equal(peers['peer-b'].snapshot().outboundSequence, 1);
  const closing = transport.close();
  assert.equal(transport.close(), closing);
  await closing;
});

test('queue depth one hands its processing slot to a causal response', async () => {
  const { transport, peers } = await fixture(1);
  const result = await peers['peer-a'].dispatch({
    kind: 'peer.ping',
    peerId: 'peer-b',
  });
  assert.equal(result.receipts[0].accepted, true);
  await transport.idle();

  assert.equal(peers['peer-a'].getState().peers['peer-b'].status, 'responsive');
  assert.deepEqual(Object.keys(peers['peer-a'].getState().pendingPings), []);
  assert.equal(peers['peer-b'].snapshot().outboundSequence, 1);
  await transport.close();
});

test('concurrent duplicate delivery commits only one inbound transition', async () => {
  const { transport, peers, keys, resolver } = await fixture();
  const envelope = await signMeshEnvelope({
    envelope: {
      protocol: MESH_PROTOCOL,
      wireVersion: MESH_WIRE_VERSION,
      messageId: messageId(4_000),
      tenantId: 'tenant-a',
      meshId: 'mesh-a',
      type: 'peer.ping',
      sender: { peerId: 'peer-a', instanceId: 'instance-peer-a' },
      audience: { kind: 'peer', peerId: 'peer-b' },
      sequence: 1,
      sentAt: '2026-07-30T00:00:00Z',
      expiresAt: '2026-07-30T00:00:30Z',
      payload: { type: 'peer.ping' },
      proof: {
        algorithm: MESH_SIGNATURE_ALGORITHM,
        keyId: 'key-peer-a',
      },
    },
    privateKey: keys['peer-a'].privateKey,
  });
  assert.ok(resolver);

  const [first, second] = await Promise.all([
    transport.deliver(envelope),
    transport.deliver(envelope),
  ]);
  assert.equal(first.accepted, true);
  assert.deepEqual(second, {
    accepted: false,
    messageId: envelope.messageId,
    reasonCode: 'message_replayed',
    target: {
      tenantId: 'tenant-a',
      meshId: 'mesh-a',
      peerId: 'peer-b',
    },
  });
  await transport.idle();
  assert.equal(
    peers['peer-b'].getState().localEventSequence,
    3,
    'start, one accepted ping and one prepared acknowledgement'
  );
  assert.equal(Object.keys(peers['peer-b'].getState().messageIds).length, 1);
  await transport.close();
});

test('duplicate injection, queue bounds and direct audiences fail closed', async () => {
  const { transport, peers, captured } = await fixture();
  await peers['peer-a'].dispatch({ kind: 'peer.ping', peerId: 'peer-b' });
  await transport.idle();
  const ping = captured['peer-a'];
  const duplicates = await transport.injectDuplicate(ping, 2);
  assert.equal(duplicates.length, 3);
  assert.deepEqual(
    duplicates.map((receipt) =>
      receipt.accepted ? 'accepted' : receipt.reasonCode
    ),
    ['message_replayed', 'message_replayed', 'message_replayed']
  );

  const nonDirect = await transport.deliver({
    ...ping,
    audience: { kind: 'mesh', topic: 'membership' },
  });
  assert.equal(nonDirect.accepted, false);
  assert.equal(nonDirect.reasonCode, 'audience_not_direct');
  assert.equal(Object.isFrozen(transport.inspectQueue()), true);
  await transport.close();

  const bounded = await fixture(1);
  const first = bounded.transport.deliver(ping);
  const second = await bounded.transport.deliver(ping);
  assert.equal(second.accepted, false);
  assert.equal(second.reasonCode, 'queue_capacity_exceeded');
  await first;
  await bounded.transport.close();
});

test('registration uses composite scope and observability cannot reverse state', async () => {
  const { transport, peers, keys, resolver } = await fixture();
  const base = peers['peer-b'].getState();
  const otherScope = createMeshPeerState({
    identity: {
      ...base.identity,
      tenantId: 'tenant-other',
    },
    admittedPeers: [],
  });
  const registered = transport.register({
    state: reduceMeshPeer(otherScope, { kind: 'peer.start' }, 0).state,
    signer: createWebCryptoMeshEnvelopeSigner(),
    verifier: createWebCryptoMeshEnvelopeVerifier(),
    resolver,
    cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
    privateKey: keys['peer-b'].privateKey,
    clock,
    messageIds: messageIds(8_000),
    onEffect() {
      throw new Error('telemetry unavailable');
    },
  });
  assert.equal(registered.address.peerId, 'peer-b');
  assert.equal(registered.address.tenantId, 'tenant-other');
  await peers['peer-a'].dispatch({ kind: 'peer.ping', peerId: 'peer-b' });
  await transport.idle();
  assert.equal(registered.getState().localEventSequence, 1);
  assert.deepEqual(Object.keys(registered.getState().peers), []);
  assert.throws(
    () =>
      transport.register({
        state: base,
        signer: createWebCryptoMeshEnvelopeSigner(),
        verifier: createWebCryptoMeshEnvelopeVerifier(),
        resolver,
        cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
        privateKey: keys['peer-b'].privateKey,
        clock,
      }),
    /Duplicate Mesh loopback peer registration/u
  );
  await transport.close();
});
