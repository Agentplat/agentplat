import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, webcrypto as crypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DEFAULT_MESH_CRYPTO_POLICY,
  createStaticMeshKeyResolver,
  createWebCryptoMeshEnvelopeSigner,
} from '@agentplat/mesh-crypto';
import {
  createMeshAllocationInboundProcessor,
  createMeshAllocationInboundRuntimeState,
  createMeshAllocationRuntimeState,
  createMeshAllocationState,
  createMeshCoordinationInboundState,
  createMeshCoordinationState,
  createMeshDiscoveryRuntimeState,
  createMeshDiscoveryState,
  createMeshObjectiveWorkRuntimeState,
  createMeshObjectiveWorkState,
  evaluateMeshAllocationCommand,
  evaluateMeshObjectiveWorkCommand,
  evaluateVerifiedMeshDiscoveryEnvelope,
  evaluateVerifiedMeshAllocationEnvelope,
  evaluateVerifiedMeshObjectiveEnvelope,
  matchMeshDiscoveryCapabilities,
  restoreMeshAllocationState,
} from '@agentplat/mesh/coordination';
import {
  MESH_SIGNATURE_ALGORITHM,
  canonicalizeMeshPayload,
} from '@agentplat/mesh-protocol';

const dualWireSigner = createWebCryptoMeshEnvelopeSigner({
  signingPolicy: { allowedWireVersions: [0, 1] },
});

const fixtureRoot = new URL(
  '../packages/mesh-protocol/fixtures/v0/',
  import.meta.url
);
const bidFixture = fixture('work-bid.json');
const announceFixture = fixture('objective-announce.json');
const offerFixture = fixture('work-offer.json');
const awardFixture = fixture('work-award.json');
const acceptFixture = fixture('work-accept.json');
const progressFixture = fixture('work-progress.json');
const leaseRenewFixture = fixture('lease-renew.json');
const cardFixture = fixture('peer-card.json');
const capabilityFixture = fixture('capability-advertise.json');
const verifiedAt = '2026-07-30T00:00:01.000Z';
let keyPairs;
let resolver;
let processor;

test.before(async () => {
  keyPairs = Object.fromEntries(
    await Promise.all(
      ['peer-a', 'peer-b'].map(async (peerId) => [
        peerId,
        await crypto.subtle.generateKey(MESH_SIGNATURE_ALGORITHM, true, [
          'sign',
          'verify',
        ]),
      ])
    )
  );
  resolver = createStaticMeshKeyResolver(
    ['peer-a', 'peer-b'].map((peerId) => ({
      tenantId: 'tenant-a',
      meshId: 'mesh-a',
      peerId,
      keyId: `key-${peerId.slice(-1)}`,
      algorithm: MESH_SIGNATURE_ALGORITHM,
      publicKey: keyPairs[peerId].publicKey,
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2027-01-01T00:00:00.000Z',
      status: 'active',
    }))
  );
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
  return dualWireSigner.sign({
    envelope,
    privateKey: keyPairs['peer-a'].privateKey,
  });
}

function hashed(envelope) {
  const copy = structuredClone(envelope);
  const canonical = canonicalizeMeshPayload(copy.payload);
  copy.payloadHash = `sha256:${createHash('sha256').update(canonical.value).digest('base64url')}`;
  return copy;
}

async function signed(envelope, peerId) {
  return dualWireSigner.sign({
    envelope,
    privateKey: keyPairs[peerId].privateKey,
  });
}

/** Builds a real owner-side active assignment through the public reducers. */
async function activeOwnerRuntime() {
  let state = createMeshAllocationRuntimeState(
    createMeshCoordinationState({ identity: identity() }),
    createMeshDiscoveryState({
      identity: identity(),
      subscriptions: ['membership', 'capability', 'objective'],
      admittedPeers: [admission()],
    }),
    createMeshObjectiveWorkState({
      identity: identity(),
      issuerAuthorities: [
        {
          peerId: 'peer-a',
          keyIds: ['key-a'],
          validUntil: '2027-01-01T00:00:00.000Z',
        },
      ],
    }),
    createMeshAllocationState({ identity: identity() })
  );
  const announced = evaluateVerifiedMeshObjectiveEnvelope(
    createMeshObjectiveWorkRuntimeState(
      state.coordination,
      state.discovery,
      state.objectives
    ),
    { envelope: hashed(announceFixture), receivedAt: 1, verifiedAt }
  );
  assert.equal(announced.accepted, true, announced.code);
  state = createMeshAllocationRuntimeState(
    announced.state.coordination,
    announced.state.discovery,
    Object.freeze({ ...announced.state.objectives, lastLogicalTime: 1 }),
    restoreMeshAllocationState({ ...state.allocation, lastLogicalTime: 1 })
  );
  let discovered = evaluateVerifiedMeshDiscoveryEnvelope(
    createMeshDiscoveryRuntimeState(state.coordination, state.discovery),
    { envelope: hashed(cardFixture), receivedAt: 2, verifiedAt }
  );
  assert.equal(discovered.accepted, true, discovered.code);
  state = createMeshAllocationRuntimeState(
    discovered.state.coordination,
    discovered.state.discovery,
    Object.freeze({ ...state.objectives, lastLogicalTime: 2 }),
    restoreMeshAllocationState({ ...state.allocation, lastLogicalTime: 2 })
  );
  discovered = evaluateVerifiedMeshDiscoveryEnvelope(
    createMeshDiscoveryRuntimeState(state.coordination, state.discovery),
    { envelope: hashed(capabilityFixture), receivedAt: 3, verifiedAt }
  );
  assert.equal(discovered.accepted, true, discovered.code);
  state = createMeshAllocationRuntimeState(
    discovered.state.coordination,
    discovered.state.discovery,
    Object.freeze({ ...state.objectives, lastLogicalTime: 3 }),
    restoreMeshAllocationState({ ...state.allocation, lastLogicalTime: 3 })
  );
  const work = evaluateMeshObjectiveWorkCommand(
    createMeshObjectiveWorkRuntimeState(
      state.coordination,
      state.discovery,
      state.objectives
    ),
    {
      kind: 'work.create',
      input: {
        objectiveId: 'objective-a',
        workItemId: 'work-item-a',
        requiredCapabilityKeys: ['summarize'],
        matchingAttributes: { language: 'en' },
        completionCriteria: ['Return a concise summary.'],
        inputSummary: 'Summarize the approved material.',
        budgetReservationUnits: 100,
        workDeadline: '2026-07-30T01:00:00.000Z',
      },
    },
    { receivedAt: 4, verifiedAt }
  );
  assert.equal(work.accepted, true, work.code);
  state = createMeshAllocationRuntimeState(
    work.state.coordination,
    work.state.discovery,
    work.state.objectives,
    restoreMeshAllocationState({
      ...createMeshAllocationState({ identity: identity() }),
      lastLogicalTime: 4,
    })
  );

  const offer = structuredClone(offerFixture);
  Object.assign(offer, {
    messageId: 'OAAAAAAAAAAAAAAAAAAAAA',
    sequence: 20,
    sender: { peerId: 'peer-b', instanceId: 'instance-b' },
    audience: { kind: 'peer', peerId: 'peer-a' },
  });
  Object.assign(offer.payload, { ownerPeerId: 'peer-b', offerId: 'offer-a' });
  offer.proof.keyId = 'key-b';
  const matching = matchMeshDiscoveryCapabilities(
    createMeshDiscoveryRuntimeState(state.coordination, state.discovery),
    {
      capabilityKeys: ['summarize'],
      attributes: { language: 'en' },
      fanout: 1,
    },
    5
  );
  assert.deepEqual(matching.evaluations, [
    { peerId: 'peer-a', reason: 'eligible' },
  ]);
  const offered = evaluateMeshAllocationCommand(
    state,
    {
      kind: 'allocation.offer',
      objectiveId: 'objective-a',
      workItemId: 'work-item-a',
      expectedWorkItemRevision: 1,
      recipients: [
        {
          recipientPeerId: 'peer-a',
          preparedAt: 5,
          envelope: await signed(offer, 'peer-b'),
        },
      ],
    },
    verifiedAt,
    5
  );
  assert.equal(offered.accepted, true, offered.code);

  const bid = structuredClone(bidFixture);
  Object.assign(bid, {
    messageId: 'BAAAAAAAAAAAAAAAAAAAAA',
    sender: { peerId: 'peer-a', instanceId: 'instance-a' },
    audience: { kind: 'peer', peerId: 'peer-b' },
    causationId: offer.messageId,
    expiresAt: '2026-07-30T00:00:30.000Z',
  });
  Object.assign(bid.payload, {
    ownerPeerId: 'peer-b',
    bidderPeerId: 'peer-a',
    offerId: 'offer-a',
    bidExpiresAt: '2026-07-30T00:00:30.000Z',
  });
  bid.proof.keyId = 'key-a';
  const bidded = evaluateVerifiedMeshAllocationEnvelope(offered.state, {
    envelope: await signed(bid, 'peer-a'),
    receivedAt: 6,
    verifiedAt,
  });
  assert.equal(bidded.accepted, true, bidded.code);

  const award = structuredClone(awardFixture);
  Object.assign(award, {
    messageId: 'QAAAAAAAAAAAAAAAAAAAAA',
    sequence: 30,
    sentAt: '2026-07-30T00:00:02.000Z',
    expiresAt: '2026-07-30T00:00:12.000Z',
    causationId: bid.messageId,
  });
  Object.assign(award.payload, {
    awardId: 'award-a',
    offerId: 'offer-a',
    bidId: 'bid-a',
    bidRevision: 1,
    ownerPeerId: 'peer-b',
    assigneePeerId: 'peer-a',
    assignmentEpoch: 1,
    authorityKind: 'award',
    assignmentAuthorityId: 'award-a',
    fencingToken: 'award-a',
    leaseStartsAt: '2026-07-30T00:00:02.000Z',
    leaseExpiresAt: '2026-07-30T00:00:25.000Z',
    acceptanceDeadline: '2026-07-30T00:00:15.000Z',
  });
  award.proof.keyId = 'key-b';
  const awarded = evaluateMeshAllocationCommand(
    bidded.state,
    {
      kind: 'allocation.award',
      offerId: 'offer-a',
      bidId: 'bid-a',
      bidRevision: 1,
      recipient: {
        recipientPeerId: 'peer-a',
        preparedAt: 7,
        envelope: await signed(award, 'peer-b'),
      },
    },
    verifiedAt,
    7
  );
  assert.equal(awarded.accepted, true, awarded.code);

  const accept = structuredClone(acceptFixture);
  Object.assign(accept, {
    messageId: 'RAAAAAAAAAAAAAAAAAAAAA',
    sequence: 31,
    sentAt: '2026-07-30T00:00:03.000Z',
    expiresAt: '2026-07-30T00:00:12.000Z',
    causationId: award.messageId,
  });
  Object.assign(accept.payload, {
    awardId: 'award-a',
    ownerPeerId: 'peer-b',
    assigneePeerId: 'peer-a',
    assignmentEpoch: 1,
    assignmentAuthorityId: 'award-a',
    fencingToken: 'award-a',
    acceptanceDeadline: '2026-07-30T00:00:15.000Z',
  });
  accept.proof.keyId = 'key-a';
  const accepted = evaluateVerifiedMeshAllocationEnvelope(awarded.state, {
    envelope: await signed(accept, 'peer-a'),
    receivedAt: 8,
    verifiedAt,
  });
  assert.equal(accepted.accepted, true, accepted.code);
  return createMeshAllocationInboundRuntimeState(
    accepted.state.coordination,
    accepted.state.discovery,
    accepted.state.objectives,
    accepted.state.allocation,
    createMeshCoordinationInboundState({ identity: identity() })
  );
}

async function signedProgress(messageId = 'NAAAAAAAAAAAAAAAAAAAAA') {
  const progress = structuredClone(progressFixture);
  Object.assign(progress, {
    messageId,
    sequence: 50,
    sentAt: '2026-07-30T00:00:04.000Z',
    expiresAt: '2026-07-30T00:00:14.000Z',
    causationId: 'RAAAAAAAAAAAAAAAAAAAAA',
  });
  Object.assign(progress.payload, {
    leaseExpiresAt: '2026-07-30T00:00:25.000Z',
  });
  return signed(progress, 'peer-a');
}

async function signedLeaseRenew(messageId = 'LAAAAAAAAAAAAAAAAAAAAA') {
  const renewal = structuredClone(leaseRenewFixture);
  Object.assign(renewal, {
    messageId,
    sequence: 51,
    sentAt: '2026-07-30T00:00:04.000Z',
    expiresAt: '2026-07-30T00:00:14.000Z',
    causationId: 'RAAAAAAAAAAAAAAAAAAAAA',
  });
  Object.assign(renewal.payload, {
    leaseExpiresAt: '2026-07-30T00:00:25.000Z',
    renewedLeaseExpiresAt: '2026-07-30T00:00:45.000Z',
  });
  return signed(renewal, 'peer-a');
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

test('allocation inbound rejects revoked and expired keys before replay or the domain reducer', async () => {
  const initial = runtime();
  const key = keyPairs['peer-a'].publicKey;
  const cases = [
    {
      code: 'key_revoked',
      record: {
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: '2027-01-01T00:00:00.000Z',
        status: 'revoked',
        revokedAt: '2026-07-29T00:00:00.000Z',
      },
    },
    {
      code: 'key_expired',
      record: {
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: '2026-07-30T00:00:00.000Z',
        status: 'active',
      },
    },
  ];

  for (const [index, candidate] of cases.entries()) {
    const resolver = createStaticMeshKeyResolver([
      {
        tenantId: 'tenant-a',
        meshId: 'mesh-a',
        peerId: 'peer-a',
        keyId: 'key-a',
        algorithm: MESH_SIGNATURE_ALGORITHM,
        publicKey: key,
        ...candidate.record,
      },
    ]);
    const result = await createProcessor({ resolver }).process(
      initial,
      request(await signedBid(20 + index, 10 + index))
    );

    assert.deepEqual(result, {
      accepted: false,
      code: candidate.code,
      state: initial,
    });
    // These failures have not entered replay accounting or the Allocation reducer.
    assert.equal(result.state.inbound, initial.inbound);
    assert.equal(result.state.allocation, initial.allocation);
  }
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

test('allocation inbound accepts a signed assignee progress record for an active owner', async () => {
  const initial = await activeOwnerRuntime();
  const result = await processor.process(
    initial,
    request(await signedProgress())
  );

  assert.equal(result.accepted, true, result.code);
  assert.equal(
    result.state.allocation.executionRecords['progress-a'].direction,
    'received'
  );
  assert.equal(
    result.state.allocation.executionHeads[
      Object.keys(result.state.allocation.executionHeads)[0]
    ].latestProgressSequence,
    1
  );
  assert.equal(result.state.inbound.lastLogicalTime, 1_000);
});

test('allocation inbound accepts a signed lease renewal once and retains replay protection', async () => {
  const initial = await activeOwnerRuntime();
  const envelope = await signedLeaseRenew();
  const accepted = await processor.process(initial, request(envelope));
  assert.equal(accepted.accepted, true, accepted.code);
  assert.equal(
    accepted.state.allocation.leaseRenewals['lease-renewal-a'].direction,
    'received'
  );
  const [scope] = Object.keys(accepted.state.allocation.leaseHeads);
  assert.equal(
    accepted.state.allocation.leaseHeads[scope].currentLeaseExpiresAt,
    '2026-07-30T00:00:45.000Z'
  );
  const replay = await processor.process(accepted.state, request(envelope));
  assert.equal(replay.accepted, false);
  assert.equal(replay.code, 'message_replayed');
});

test('execution domain rejections retain replay accounting before rejecting the replay', async () => {
  const initial = await activeOwnerRuntime();
  const envelope = structuredClone(
    await signedProgress('MAAAAAAAAAAAAAAAAAAAAA')
  );
  envelope.payload.progressSequence = 2;
  const resigned = await signed(envelope, 'peer-a');

  const rejected = await processor.process(initial, request(resigned));
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.code, 'execution_phase_invalid');
  assert.equal(rejected.state.coordination, initial.coordination);
  assert.equal(rejected.state.allocation, initial.allocation);
  assert.equal(rejected.state.inbound.lastLogicalTime, 1_000);

  const replay = await processor.process(rejected.state, request(resigned));
  assert.deepEqual(replay, {
    accepted: false,
    code: 'message_replayed',
    state: rejected.state,
  });
});
