import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  advanceMeshDiscoveryState,
  createMeshCoordinationState,
  createMeshDiscoveryRuntimeState,
  createMeshDiscoveryState,
  evaluateVerifiedMeshDiscoveryEnvelope,
  matchMeshDiscoveryCapabilities,
  restoreMeshCoordinationState,
  restoreMeshDiscoveryState,
  selectMeshDiscoveryTopicRecipients,
} from '@agentplat/mesh/coordination';

const fixtureRoot = new URL(
  '../packages/mesh-protocol/fixtures/v0/',
  import.meta.url
);
const peerCard = fixture('peer-card.json');
const peerGoodbye = fixture('peer-goodbye.json');
const capabilityAdvertise = fixture('capability-advertise.json');
const capabilityWithdraw = fixture('capability-withdraw.json');
const verifiedAt = '2026-07-30T00:00:01.000Z';

function fixture(name) {
  return JSON.parse(readFileSync(new URL(name, fixtureRoot), 'utf8'));
}

function messageId(value) {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(12, value);
  return Buffer.from(bytes).toString('base64url');
}

function payloadHash(value) {
  return `sha256:${Buffer.alloc(32, value).toString('base64url')}`;
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

function admission(peerId, instanceId) {
  return {
    peerId,
    instanceIds: [instanceId],
    validUntil: '2027-01-01T00:00:00.000Z',
  };
}

function runtime({
  admittedPeers = [admission('peer-a', 'instance-a')],
  subscriptions = ['capability', 'membership'],
  limits,
} = {}) {
  const peerIdentity = identity();
  return createMeshDiscoveryRuntimeState(
    createMeshCoordinationState({ identity: peerIdentity }),
    createMeshDiscoveryState({
      identity: peerIdentity,
      admittedPeers,
      subscriptions,
      ...(limits === undefined ? {} : { limits }),
    })
  );
}

function evaluateAt(state, envelope, receivedAt, verificationTime) {
  return evaluateVerifiedMeshDiscoveryEnvelope(state, {
    envelope,
    verifiedAt: verificationTime,
    receivedAt,
  });
}

function evaluate(state, envelope, receivedAt) {
  return evaluateAt(state, envelope, receivedAt, verifiedAt);
}

function envelopeForPeer(base, peerId, instanceId, value) {
  const envelope = structuredClone(base);
  envelope.messageId = messageId(value);
  envelope.sender.peerId = peerId;
  envelope.sender.instanceId = instanceId;
  envelope.payloadHash = payloadHash(value);
  if (envelope.payload.subjectPeerId !== undefined) {
    envelope.payload.subjectPeerId = peerId;
  }
  if (envelope.payload.ownerPeerId !== undefined) {
    envelope.payload.ownerPeerId = peerId;
  }
  if (envelope.payload.instanceId !== undefined) {
    envelope.payload.instanceId = instanceId;
  }
  return envelope;
}

test('discovery admission is explicit, bounded and independently restorable', () => {
  const state = runtime();
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.discovery), true);
  assert.equal(Object.isFrozen(state.discovery.admittedPeers), true);
  assert.equal(Object.getPrototypeOf(state.discovery.admittedPeers), null);
  assert.equal(state.discovery.peerCards['peer-a'], undefined);

  const restored = restoreMeshDiscoveryState(structuredClone(state.discovery));
  assert.deepEqual(restored, state.discovery);
  assert.equal(Object.getPrototypeOf(restored.peerCards), null);
  assert.throws(
    () =>
      restoreMeshDiscoveryState({
        ...structuredClone(state.discovery),
        unexpected: true,
      }),
    /unsupported fields/u
  );
  assert.throws(
    () =>
      createMeshDiscoveryState({
        identity: identity(),
        admittedPeers: [
          admission('peer-a', 'instance-a'),
          admission('peer-a', 'instance-a'),
        ],
      }),
    /Duplicate Mesh discovery admission/u
  );
});

test('Peer Card revisions are causal self-claims and cannot grant admission', () => {
  const initial = runtime();
  const accepted = evaluate(initial, peerCard, 100);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.duplicate, false);
  assert.equal(
    accepted.state.discovery.peerCards['peer-a'].peerCardId,
    'card-a'
  );
  assert.equal(accepted.state.discovery.peerViews['peer-a'].observedAt, 100);
  assert.equal(
    Object.hasOwn(accepted.state.discovery.admittedPeers, 'peer-a'),
    true
  );

  const duplicate = evaluate(accepted.state, peerCard, 101);
  assert.deepEqual(duplicate, {
    accepted: true,
    duplicate: true,
    state: accepted.state,
  });
  assert.equal(duplicate.state, accepted.state);

  const conflict = structuredClone(peerCard);
  conflict.payloadHash = payloadHash(2);
  conflict.payload.transportHints = ['https://conflict.example.test/mesh'];
  const rejectedConflict = evaluate(accepted.state, conflict, 101);
  assert.equal(rejectedConflict.accepted, false);
  assert.equal(rejectedConflict.code, 'domain_record_conflict');
  assert.equal(rejectedConflict.state, accepted.state);

  const refresh = structuredClone(peerCard);
  refresh.messageId = messageId(20);
  refresh.payloadHash = payloadHash(4);
  refresh.causationId = peerCard.messageId;
  refresh.payload.peerCardId = 'card-a-v2';
  refresh.payload.cardRevision = 2;
  refresh.payload.previousPeerCardId = 'card-a';
  const refreshed = evaluate(accepted.state, refresh, 102);
  assert.equal(refreshed.accepted, true);
  assert.equal(refreshed.state.discovery.peerCards['peer-a'].cardRevision, 2);

  const skipped = structuredClone(refresh);
  skipped.messageId = messageId(21);
  skipped.payloadHash = payloadHash(5);
  skipped.causationId = refresh.messageId;
  skipped.payload.peerCardId = 'card-a-v4';
  skipped.payload.cardRevision = 4;
  skipped.payload.previousPeerCardId = 'card-a-v2';
  const rejectedSkip = evaluate(refreshed.state, skipped, 103);
  assert.equal(rejectedSkip.accepted, false);
  assert.equal(rejectedSkip.code, 'peer_card_revision_invalid');

  const unknownCard = envelopeForPeer(
    peerCard,
    'peer-unknown',
    'instance-unknown',
    22
  );
  const rejectedUnknown = evaluate(initial, unknownCard, 100);
  assert.equal(rejectedUnknown.accepted, false);
  assert.equal(rejectedUnknown.code, 'sender_not_admitted');
  assert.equal(rejectedUnknown.state, initial);
});

test('capability revisions, withdrawal and reactivation preserve high-water state', () => {
  const withCard = evaluate(runtime(), peerCard, 100).state;
  const advertised = evaluate(withCard, capabilityAdvertise, 101);
  assert.equal(advertised.accepted, true);
  const key = JSON.stringify(['peer-a', 'capability-a']);
  assert.equal(advertised.state.discovery.capabilities[key].status, 'active');

  const withdrawn = evaluate(advertised.state, capabilityWithdraw, 102);
  assert.equal(withdrawn.accepted, true);
  assert.equal(withdrawn.state.discovery.capabilities[key].status, 'withdrawn');
  assert.equal(
    withdrawn.state.discovery.capabilities[key].acceptedMessageId,
    capabilityWithdraw.messageId
  );

  const duplicateWithdrawal = evaluate(
    withdrawn.state,
    capabilityWithdraw,
    103
  );
  assert.equal(duplicateWithdrawal.accepted, true);
  assert.equal(duplicateWithdrawal.duplicate, true);
  assert.equal(duplicateWithdrawal.state, withdrawn.state);

  const reactivation = structuredClone(capabilityAdvertise);
  reactivation.messageId = messageId(30);
  reactivation.payloadHash = payloadHash(8);
  reactivation.causationId = capabilityWithdraw.messageId;
  reactivation.payload.advertisementId = 'advertisement-a-v2';
  reactivation.payload.capabilityRevision = 2;
  reactivation.payload.previousAdvertisementId = 'advertisement-a';
  const reactivated = evaluate(withdrawn.state, reactivation, 104);
  assert.equal(reactivated.accepted, true);
  assert.equal(reactivated.state.discovery.capabilities[key].status, 'active');
  assert.equal(
    reactivated.state.discovery.capabilities[key].capabilityRevision,
    2
  );

  const staleWithdrawal = structuredClone(capabilityWithdraw);
  staleWithdrawal.messageId = messageId(31);
  staleWithdrawal.payloadHash = payloadHash(9);
  staleWithdrawal.payload.advertisementId = 'advertisement-a-v2';
  const rejected = evaluate(reactivated.state, staleWithdrawal, 105);
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.code, 'capability_predecessor_invalid');
  assert.equal(rejected.state, reactivated.state);
});

test('goodbye removes routing and matching state without deleting admission', () => {
  const withCard = evaluate(runtime(), peerCard, 100).state;
  const advertised = evaluate(withCard, capabilityAdvertise, 101).state;
  const departed = evaluate(advertised, peerGoodbye, 102);
  assert.equal(departed.accepted, true);
  assert.equal(departed.state.discovery.peerCards['peer-a'].status, 'departed');
  assert.equal(departed.state.discovery.peerViews['peer-a'], undefined);
  assert.equal(
    departed.state.discovery.capabilities[
      JSON.stringify(['peer-a', 'capability-a'])
    ].status,
    'departed'
  );
  assert.equal(
    Object.hasOwn(departed.state.discovery.admittedPeers, 'peer-a'),
    true
  );
  assert.equal(
    Object.keys(departed.state.coordination.domainRecords).length,
    3
  );

  const sameInstanceRefresh = structuredClone(peerCard);
  sameInstanceRefresh.messageId = messageId(35);
  sameInstanceRefresh.payloadHash = payloadHash(10);
  sameInstanceRefresh.causationId = peerGoodbye.messageId;
  sameInstanceRefresh.payload.peerCardId = 'card-a-v2';
  sameInstanceRefresh.payload.cardRevision = 2;
  sameInstanceRefresh.payload.previousPeerCardId = 'card-a';
  const rejectedRefresh = evaluate(departed.state, sameInstanceRefresh, 103);
  assert.equal(rejectedRefresh.accepted, false);
  assert.equal(rejectedRefresh.code, 'peer_card_not_active');
  assert.equal(rejectedRefresh.state, departed.state);
});

test('matching is pure, stable, bounded and never grants execution authority', () => {
  const peerCAdmission = admission('peer-c', 'instance-c');
  let state = runtime({
    admittedPeers: [admission('peer-a', 'instance-a'), peerCAdmission],
  });
  state = evaluate(state, peerCard, 100).state;
  state = evaluate(state, capabilityAdvertise, 101).state;

  const cardC = envelopeForPeer(peerCard, 'peer-c', 'instance-c', 40);
  cardC.payload.peerCardId = 'card-c';
  const capabilityC = envelopeForPeer(
    capabilityAdvertise,
    'peer-c',
    'instance-c',
    41
  );
  capabilityC.payload.advertisementId = 'advertisement-c';
  state = evaluate(state, cardC, 102).state;
  assert.deepEqual(
    selectMeshDiscoveryTopicRecipients(state, 'capability', 102, 2),
    ['peer-a', 'peer-c'],
    'a view-only peer can receive its first capability advertisement'
  );
  state = evaluate(state, capabilityC, 103).state;

  const requirement = {
    capabilityKeys: ['summarize'],
    attributes: { language: 'en' },
    inputMediaType: 'text/plain',
    outputMediaType: 'text/plain',
    fanout: 1,
  };
  const before = state;
  const result = matchMeshDiscoveryCapabilities(state, requirement, 103);
  assert.deepEqual(
    result.matches.map((match) => match.peerId),
    ['peer-a']
  );
  assert.deepEqual(result.evaluations, [
    { peerId: 'peer-a', reason: 'eligible' },
    { peerId: 'peer-c', reason: 'fanout_limited' },
  ]);
  assert.equal(state, before);
  assert.equal('assignmentEpoch' in result.matches[0], false);
  assert.equal('fencingToken' in result.matches[0], false);

  assert.deepEqual(
    selectMeshDiscoveryTopicRecipients(state, 'capability', 103, 1),
    ['peer-a']
  );
  assert.deepEqual(
    selectMeshDiscoveryTopicRecipients(state, 'membership', 103, 2),
    ['peer-a', 'peer-c']
  );
});

test('expiry is deterministic at its exact logical boundary and fail-closed', () => {
  let state = evaluate(runtime(), peerCard, 100).state;
  state = evaluate(state, capabilityAdvertise, 101).state;
  const expiresAt = state.discovery.peerCards['peer-a'].expiresAt;

  const before = advanceMeshDiscoveryState(state, expiresAt - 1);
  assert.equal(before.accepted, true);
  assert.equal(before.expiredRecords, 0);
  assert.equal(before.state.discovery.peerCards['peer-a'].status, 'active');

  const exact = advanceMeshDiscoveryState(before.state, expiresAt);
  assert.equal(exact.accepted, true);
  assert.equal(exact.expiredRecords, 2);
  assert.equal(exact.state.discovery.peerCards['peer-a'].status, 'expired');
  assert.equal(exact.state.discovery.peerViews['peer-a'], undefined);
  assert.equal(
    exact.state.discovery.capabilities[
      JSON.stringify(['peer-a', 'capability-a'])
    ].status,
    'expired'
  );

  const match = matchMeshDiscoveryCapabilities(
    exact.state,
    { capabilityKeys: ['summarize'], fanout: 1 },
    expiresAt
  );
  assert.deepEqual(match.matches, []);
  assert.deepEqual(match.evaluations, [
    { peerId: 'peer-a', reason: 'peer_view_missing' },
  ]);
});

test('Peer View eviction is deterministic and keeps admission history', () => {
  let state = runtime({
    admittedPeers: [
      admission('peer-a', 'instance-a'),
      admission('peer-c', 'instance-c'),
    ],
    limits: { maximumPeerViews: 1 },
  });
  state = evaluate(state, peerCard, 100).state;
  const cardC = envelopeForPeer(peerCard, 'peer-c', 'instance-c', 50);
  cardC.payload.peerCardId = 'card-c';
  state = evaluate(state, cardC, 101).state;

  assert.deepEqual(Object.keys(state.discovery.peerViews), ['peer-c']);
  assert.deepEqual(Object.keys(state.discovery.peerCards).sort(), [
    'peer-a',
    'peer-c',
  ]);
  assert.deepEqual(Object.keys(state.discovery.admittedPeers).sort(), [
    'peer-a',
    'peer-c',
  ]);

  let tied = runtime({
    admittedPeers: [
      admission('peer-a', 'instance-a'),
      admission('peer-c', 'instance-c'),
    ],
    limits: { maximumPeerViews: 1 },
  });
  const tiedCardC = envelopeForPeer(peerCard, 'peer-c', 'instance-c', 51);
  tiedCardC.payload.peerCardId = 'card-c';
  tied = evaluate(tied, tiedCardC, 100).state;
  tied = evaluate(tied, peerCard, 100).state;
  assert.deepEqual(Object.keys(tied.discovery.peerViews), ['peer-c']);
});

test('scope, subscriptions and capacity reject without mutation', () => {
  const unsubscribed = runtime({ subscriptions: [] });
  const noTopic = evaluate(unsubscribed, peerCard, 100);
  assert.equal(noTopic.accepted, false);
  assert.equal(noTopic.code, 'topic_not_subscribed');
  assert.equal(noTopic.state, unsubscribed);

  const wrongScopeEnvelope = structuredClone(peerCard);
  wrongScopeEnvelope.meshId = 'mesh-other';
  const wrongScope = evaluate(runtime(), wrongScopeEnvelope, 100);
  assert.equal(wrongScope.accepted, false);
  assert.equal(wrongScope.code, 'scope_mismatch');

  const bounded = runtime({
    limits: { maximumPeerCardBytes: 100 },
  });
  const overCapacity = evaluate(bounded, peerCard, 100);
  assert.equal(overCapacity.accepted, false);
  assert.equal(overCapacity.code, 'peer_card_capacity_exceeded');
  assert.equal(overCapacity.state, bounded);

  const capabilityBounded = runtime({
    limits: { maximumCapabilityBytes: 100 },
  });
  const cardAccepted = evaluate(capabilityBounded, peerCard, 100).state;
  const capabilityOverCapacity = evaluate(
    cardAccepted,
    capabilityAdvertise,
    101
  );
  assert.equal(capabilityOverCapacity.accepted, false);
  assert.equal(capabilityOverCapacity.code, 'capability_capacity_exceeded');
  assert.equal(capabilityOverCapacity.state, cardAccepted);
});

test('one admitted instance cannot mutate another instance discovery records', () => {
  const admittedPeer = {
    peerId: 'peer-a',
    instanceIds: ['instance-a', 'instance-a-sibling'],
    validUntil: '2027-01-01T00:00:00.000Z',
  };
  const initial = runtime({ admittedPeers: [admittedPeer] });
  const withCard = evaluate(initial, peerCard, 100).state;

  const siblingAdvertisement = structuredClone(capabilityAdvertise);
  siblingAdvertisement.messageId = messageId(70);
  siblingAdvertisement.payloadHash = payloadHash(11);
  siblingAdvertisement.sender.instanceId = 'instance-a-sibling';
  const rejectedAdvertisement = evaluate(withCard, siblingAdvertisement, 101);
  assert.equal(rejectedAdvertisement.accepted, false);
  assert.equal(rejectedAdvertisement.state, withCard);

  const advertised = evaluate(withCard, capabilityAdvertise, 101).state;
  const siblingWithdrawal = structuredClone(capabilityWithdraw);
  siblingWithdrawal.messageId = messageId(71);
  siblingWithdrawal.payloadHash = payloadHash(12);
  siblingWithdrawal.sender.instanceId = 'instance-a-sibling';
  const rejectedWithdrawal = evaluate(advertised, siblingWithdrawal, 102);
  assert.equal(rejectedWithdrawal.accepted, false);
  assert.equal(rejectedWithdrawal.state, advertised);

  const siblingGoodbye = structuredClone(peerGoodbye);
  siblingGoodbye.messageId = messageId(72);
  siblingGoodbye.payloadHash = payloadHash(13);
  siblingGoodbye.sender.instanceId = 'instance-a-sibling';
  const rejectedGoodbye = evaluate(advertised, siblingGoodbye, 102);
  assert.equal(rejectedGoodbye.accepted, false);
  assert.equal(rejectedGoodbye.state, advertised);
});

test('expired discovery envelopes reject terminal mutations', () => {
  const withCard = evaluate(runtime(), peerCard, 100).state;
  const advertised = evaluate(withCard, capabilityAdvertise, 101).state;

  const expiredGoodbye = evaluateAt(
    advertised,
    peerGoodbye,
    102,
    '2026-07-30T00:01:00.000Z'
  );
  assert.equal(expiredGoodbye.accepted, false);
  assert.equal(expiredGoodbye.state, advertised);

  const expiredWithdrawal = evaluateAt(
    advertised,
    capabilityWithdraw,
    102,
    '2026-07-30T00:02:00.000Z'
  );
  assert.equal(expiredWithdrawal.accepted, false);
  assert.equal(expiredWithdrawal.state, advertised);
});

test('restore rejects fabricated discovery links and inflated expiry', () => {
  let state = evaluate(runtime(), peerCard, 100).state;
  state = evaluate(state, capabilityAdvertise, 101).state;
  const capabilityKey = JSON.stringify(['peer-a', 'capability-a']);

  const unlistedCapability = structuredClone(state.discovery);
  unlistedCapability.peerCards['peer-a'].capabilityIds = [];
  assert.throws(
    () => restoreMeshDiscoveryState(unlistedCapability),
    /binding|Peer Card|capability/iu
  );

  const inflatedExpiry = structuredClone(state.discovery);
  inflatedExpiry.peerCards['peer-a'].expiresAt += 1;
  inflatedExpiry.peerViews['peer-a'].expiresAt += 1;
  assert.throws(
    () => restoreMeshDiscoveryState(inflatedExpiry),
    /expiry|Peer Card|snapshot/iu
  );

  const inconsistentCoordination = structuredClone(state.coordination);
  const capabilityRecordKey = JSON.stringify([
    'capability.advertise',
    'advertisement-a',
  ]);
  inconsistentCoordination.domainRecords[capabilityRecordKey].messageId =
    messageId(73);
  const restoredCoordination = restoreMeshCoordinationState(
    inconsistentCoordination
  );
  assert.throws(
    () =>
      createMeshDiscoveryRuntimeState(restoredCoordination, state.discovery),
    /aligned|binding|domain record|runtime/iu
  );

  assert.equal(state.discovery.capabilities[capabilityKey].status, 'active');
});

test('idempotency requires the same accepted message and sender binding', () => {
  const initial = runtime({
    admittedPeers: [
      admission('peer-a', 'instance-a'),
      admission('peer-c', 'instance-c'),
    ],
  });
  const accepted = evaluate(initial, peerCard, 100).state;

  const differentMessage = structuredClone(peerCard);
  differentMessage.messageId = messageId(74);
  const rejectedMessage = evaluate(accepted, differentMessage, 101);
  assert.equal(rejectedMessage.accepted, false);
  assert.equal(rejectedMessage.state, accepted);

  const differentSender = structuredClone(peerCard);
  differentSender.messageId = messageId(75);
  differentSender.sender.peerId = 'peer-c';
  differentSender.sender.instanceId = 'instance-c';
  const rejectedSender = evaluate(accepted, differentSender, 101);
  assert.equal(rejectedSender.accepted, false);
  assert.equal(rejectedSender.state, accepted);
});

test('matching requirements are strict and explicitly bounded', () => {
  const state = runtime();
  const valid = { capabilityKeys: ['summarize'], fanout: 1 };

  assert.throws(
    () =>
      matchMeshDiscoveryCapabilities(state, { ...valid, unexpected: true }, 0),
    /requirement|unsupported/iu
  );

  const inherited = Object.assign(Object.create({ inherited: true }), valid);
  assert.throws(
    () => matchMeshDiscoveryCapabilities(state, inherited, 0),
    /requirement|record|prototype/iu
  );

  assert.throws(
    () =>
      matchMeshDiscoveryCapabilities(
        state,
        {
          capabilityKeys: Array.from(
            { length: 65 },
            (_, index) => `capability-${index}`
          ),
          fanout: 1,
        },
        0
      ),
    /bound|limit|requirement/iu
  );

  assert.throws(
    () =>
      matchMeshDiscoveryCapabilities(
        state,
        {
          capabilityKeys: ['x'.repeat(65_537)],
          fanout: 1,
        },
        0
      ),
    /bound|limit|requirement/iu
  );

  assert.throws(
    () =>
      matchMeshDiscoveryCapabilities(
        state,
        {
          ...valid,
          attributes: Object.fromEntries(
            Array.from({ length: 1_000 }, (_, index) => [
              `attribute-${index}`,
              'value',
            ])
          ),
        },
        0
      ),
    /bound|limit|requirement/iu
  );
});

test('topic selection rejects logical-time regression', () => {
  const state = evaluate(runtime(), peerCard, 100).state;
  assert.throws(
    () =>
      selectMeshDiscoveryTopicRecipients(
        state,
        'membership',
        state.discovery.lastLogicalTime - 1
      ),
    /logical time|backwards|regress/iu
  );
});
