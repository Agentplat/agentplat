import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  canonicalizeMeshPayload,
  validateSignedMeshEnvelope,
} from '@agentplat/mesh-protocol';
import {
  createMeshAllocationRuntimeState,
  createMeshAllocationState,
  createMeshCoordinationState,
  createMeshDiscoveryRuntimeState,
  createMeshDiscoveryState,
  createMeshObjectiveWorkRuntimeState,
  createMeshObjectiveWorkState,
  evaluateMeshAllocationCommand,
  evaluateMeshAllocationTimer,
  evaluateMeshObjectiveWorkCommand,
  evaluateVerifiedMeshAllocationEnvelope,
  evaluateVerifiedMeshDiscoveryEnvelope,
  evaluateVerifiedMeshObjectiveEnvelope,
  restoreMeshAllocationState,
} from '@agentplat/mesh/coordination';
import {
  replayMeshReducerScenario,
  runMeshReducerScenario,
} from '@agentplat/mesh-sim';

const fixtures = new URL(
  '../packages/mesh-protocol/fixtures/v0/',
  import.meta.url
);
const fixture = (name) =>
  JSON.parse(readFileSync(new URL(name, fixtures), 'utf8'));
const announceFixture = fixture('objective-announce.json');
const cardFixture = fixture('peer-card.json');
const capabilityFixture = fixture('capability-advertise.json');
const offerFixture = fixture('work-offer.json');
const bidFixture = fixture('work-bid.json');
const awardFixture = fixture('work-award.json');
const acceptFixture = fixture('work-accept.json');
const declineFixture = fixture('work-decline.json');
const checkpointFixture = fixture('work-checkpoint.json');
const progressFixture = fixture('work-progress.json');
const resultFixture = fixture('work-result.json');
const proposalFixture = fixture('lease-takeover-proposal.json');
const voteFixture = fixture('lease-vote.json');
const certificateFixture = fixture('lease-certificate.json');

const INITIAL_AT = '2026-07-30T00:00:04.000Z';
const RECOVERY_AT = '2026-07-30T00:01:30.000Z';
const AWARD_AT = '2026-07-30T00:01:41.000Z';
const PEER_IDS = ['peer-a', 'peer-b', 'peer-c', 'peer-d'];

function messageId(number) {
  const bytes = Buffer.alloc(16);
  bytes.writeUInt32BE(number, 12);
  return bytes.toString('base64url');
}

function identity(peerId) {
  const suffix = peerId.slice(-1);
  return Object.freeze({
    tenantId: 'tenant-a',
    meshId: 'mesh-a',
    peerId,
    instanceId: `instance-${suffix}`,
    keyId: `key-${suffix}`,
  });
}

function hashed(envelope) {
  const value = structuredClone(envelope);
  const canonical = canonicalizeMeshPayload(value.payload);
  assert.equal(canonical.ok, true);
  value.payloadHash = `sha256:${createHash('sha256')
    .update(canonical.value)
    .digest('base64url')}`;
  return value;
}

function directEnvelope(
  source,
  {
    id,
    sequence,
    senderPeerId,
    recipientPeerId,
    causationId,
    sentAt = '2026-07-30T00:00:05.000Z',
    expiresAt = '2026-07-30T00:10:00.000Z',
    payload = {},
  }
) {
  const envelope = structuredClone(source);
  envelope.messageId = id;
  envelope.sequence = sequence;
  envelope.sentAt = sentAt;
  envelope.expiresAt = expiresAt;
  envelope.sender = {
    peerId: senderPeerId,
    instanceId: `instance-${senderPeerId.slice(-1)}`,
  };
  envelope.audience = { kind: 'peer', peerId: recipientPeerId };
  envelope.proof.keyId = `key-${senderPeerId.slice(-1)}`;
  if (causationId === undefined) delete envelope.causationId;
  else envelope.causationId = causationId;
  Object.assign(envelope.payload, payload);
  return hashed(envelope);
}

function verified(envelope, verifiedAt, receivedAt) {
  return { envelope, verifiedAt, receivedAt };
}

function accepted(decision, label) {
  assert.equal(decision.accepted, true, `${label}: ${decision.code}`);
  return decision.state;
}

function withAllocation(state, allocation, logicalTime) {
  return createMeshAllocationRuntimeState(
    state.coordination,
    state.discovery,
    state.objectives,
    restoreMeshAllocationState({
      ...allocation,
      lastLogicalTime: logicalTime,
    })
  );
}

function createPeerRuntime(peerId, threshold = 3) {
  const localIdentity = identity(peerId);
  let state = createMeshAllocationRuntimeState(
    createMeshCoordinationState({ identity: localIdentity }),
    createMeshDiscoveryState({
      identity: localIdentity,
      subscriptions: ['membership', 'capability', 'objective'],
      admittedPeers: PEER_IDS.filter(
        (candidate) => candidate !== peerId || candidate === 'peer-a'
      ).map((candidate) => ({
        peerId: candidate,
        instanceIds: [`instance-${candidate.slice(-1)}`],
        validUntil: '2027-01-01T00:00:00.000Z',
      })),
    }),
    createMeshObjectiveWorkState({
      identity: localIdentity,
      issuerAuthorities: [
        {
          peerId: 'peer-a',
          keyIds: ['key-a'],
          validUntil: '2027-01-01T00:00:00.000Z',
        },
      ],
    }),
    createMeshAllocationState({ identity: localIdentity })
  );
  const announcement = structuredClone(announceFixture);
  announcement.payload.recoveryWitnessThreshold = threshold;
  const objective = evaluateVerifiedMeshObjectiveEnvelope(
    createMeshObjectiveWorkRuntimeState(
      state.coordination,
      state.discovery,
      state.objectives
    ),
    verified(hashed(announcement), INITIAL_AT, 1)
  );
  assert.equal(objective.accepted, true, objective.code);
  state = createMeshAllocationRuntimeState(
    objective.state.coordination,
    objective.state.discovery,
    objective.state.objectives,
    restoreMeshAllocationState({ ...state.allocation, lastLogicalTime: 1 })
  );
  return state;
}

function discoverCandidate(state, peerId, logicalTime) {
  let current = state;
  const suffix = peerId.slice(-1);
  for (const base of [cardFixture, capabilityFixture]) {
    const envelope = structuredClone(base);
    envelope.messageId = messageId(100 + logicalTime);
    envelope.sequence = logicalTime;
    envelope.sender = { peerId, instanceId: `instance-${suffix}` };
    envelope.proof.keyId = `key-${suffix}`;
    if (envelope.payload.ownerPeerId) envelope.payload.ownerPeerId = peerId;
    if (envelope.payload.subjectPeerId) envelope.payload.subjectPeerId = peerId;
    if (envelope.payload.instanceId)
      envelope.payload.instanceId = `instance-${suffix}`;
    if (envelope.payload.peerCardId)
      envelope.payload.peerCardId = `card-${suffix}`;
    if (envelope.payload.capabilityIds)
      envelope.payload.capabilityIds = [`capability-${suffix}`];
    if (envelope.payload.transportHints)
      envelope.payload.transportHints = [`https://${peerId}.example.test/mesh`];
    if (envelope.payload.advertisementId)
      envelope.payload.advertisementId = `advertisement-${suffix}`;
    if (envelope.payload.capabilityId)
      envelope.payload.capabilityId = `capability-${suffix}`;
    const decision = evaluateVerifiedMeshDiscoveryEnvelope(
      createMeshDiscoveryRuntimeState(current.coordination, current.discovery),
      verified(hashed(envelope), INITIAL_AT, logicalTime)
    );
    assert.equal(decision.accepted, true, decision.code);
    current = createMeshAllocationRuntimeState(
      decision.state.coordination,
      decision.state.discovery,
      Object.freeze({
        ...current.objectives,
        lastLogicalTime: logicalTime,
      }),
      restoreMeshAllocationState({
        ...current.allocation,
        lastLogicalTime: logicalTime,
      })
    );
    logicalTime += 1;
  }
  return current;
}

function prepareWorkStates(threshold = 3) {
  const states = Object.fromEntries(
    PEER_IDS.map((peerId) => [peerId, createPeerRuntime(peerId, threshold)])
  );
  states['peer-a'] = discoverCandidate(states['peer-a'], 'peer-b', 2);
  states['peer-a'] = discoverCandidate(states['peer-a'], 'peer-c', 4);
  const work = evaluateMeshObjectiveWorkCommand(
    createMeshObjectiveWorkRuntimeState(
      states['peer-a'].coordination,
      states['peer-a'].discovery,
      states['peer-a'].objectives
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
    { verifiedAt: INITIAL_AT, receivedAt: 6 }
  );
  assert.equal(work.accepted, true, work.code);
  states['peer-a'] = createMeshAllocationRuntimeState(
    work.state.coordination,
    work.state.discovery,
    work.state.objectives,
    restoreMeshAllocationState({
      ...states['peer-a'].allocation,
      lastLogicalTime: 6,
    })
  );
  return states;
}

function allocationEnvelopes({
  offerId = 'offer-a',
  offerAttempt = 1,
  previousOfferId,
  previousOfferByPeer,
  assigneePeerId = 'peer-b',
  numberBase = 200,
  authority = 'award-a',
  timeOffsetMs = 0,
}) {
  const shifted = (timestamp) =>
    new Date(Date.parse(timestamp) + timeOffsetMs).toISOString();
  const offerByPeer = {};
  for (const [offset, recipientPeerId] of ['peer-b', 'peer-c'].entries()) {
    offerByPeer[recipientPeerId] = directEnvelope(offerFixture, {
      id: messageId(numberBase + offset),
      sequence: numberBase + offset,
      senderPeerId: 'peer-a',
      recipientPeerId,
      causationId: previousOfferByPeer?.[recipientPeerId]?.messageId,
      sentAt: shifted('2026-07-30T00:00:00.000Z'),
      expiresAt: shifted('2026-07-30T00:01:00.000Z'),
      payload: {
        offerId,
        offerAttempt,
        ownerPeerId: 'peer-a',
        bidDeadline: shifted('2026-07-30T00:01:00.000Z'),
        ...(previousOfferId === undefined ? {} : { previousOfferId }),
      },
    });
  }
  const suffix = assigneePeerId.slice(-1);
  const bid = directEnvelope(bidFixture, {
    id: messageId(numberBase + 10),
    sequence: numberBase + 10,
    senderPeerId: assigneePeerId,
    recipientPeerId: 'peer-a',
    causationId: offerByPeer[assigneePeerId].messageId,
    sentAt: shifted('2026-07-30T00:00:01.000Z'),
    expiresAt: shifted('2026-07-30T00:01:00.000Z'),
    payload: {
      bidId:
        offerAttempt === 1 ? `bid-${suffix}` : `bid-${suffix}-${offerAttempt}`,
      offerId,
      ownerPeerId: 'peer-a',
      bidderPeerId: assigneePeerId,
      offerAttempt,
      advertisementId: `advertisement-${suffix}`,
      capabilityId: `capability-${suffix}`,
      bidDeadline: shifted('2026-07-30T00:01:00.000Z'),
      bidExpiresAt: shifted('2026-07-30T00:01:00.000Z'),
    },
  });
  const awardId = authority;
  const award = directEnvelope(awardFixture, {
    id: messageId(numberBase + 20),
    sequence: numberBase + 20,
    senderPeerId: 'peer-a',
    recipientPeerId: assigneePeerId,
    causationId: bid.messageId,
    sentAt: shifted('2026-07-30T00:00:02.000Z'),
    expiresAt: shifted('2026-07-30T00:00:12.000Z'),
    payload: {
      awardId,
      offerId,
      bidId: bid.payload.bidId,
      offerAttempt,
      ownerPeerId: 'peer-a',
      assigneePeerId,
      assignmentAuthorityId: authority,
      fencingToken: authority,
      leaseStartsAt: shifted('2026-07-30T00:00:02.000Z'),
      leaseExpiresAt: shifted('2026-07-30T00:00:25.000Z'),
      acceptanceDeadline: shifted('2026-07-30T00:00:15.000Z'),
    },
  });
  const acceptance = directEnvelope(acceptFixture, {
    id: messageId(numberBase + 30),
    sequence: numberBase + 30,
    senderPeerId: assigneePeerId,
    recipientPeerId: 'peer-a',
    causationId: award.messageId,
    sentAt: shifted('2026-07-30T00:00:03.000Z'),
    expiresAt: shifted('2026-07-30T00:00:12.000Z'),
    payload: {
      acceptanceId:
        offerAttempt === 1 && assigneePeerId === 'peer-b'
          ? 'acceptance-a'
          : `acceptance-${suffix}-${offerAttempt}`,
      awardId,
      ownerPeerId: 'peer-a',
      assigneePeerId,
      assignmentAuthorityId: authority,
      fencingToken: authority,
      acceptanceDeadline: shifted('2026-07-30T00:00:15.000Z'),
    },
  });
  return { offerByPeer, bid, award, acceptance };
}

function reducerAction(command, verifiedAt = INITIAL_AT) {
  return { kind: 'allocation.command', command, verifiedAt };
}

function inboundAction(envelope, verifiedAt = INITIAL_AT) {
  return { kind: 'allocation.inbound', envelope, verifiedAt };
}

function timerAction(timerId, generation) {
  return { kind: 'allocation.timer', timerId, generation };
}

function scenarioEvent(
  eventId,
  targetPeerId,
  logicalTime,
  action,
  sourcePeerId
) {
  return {
    eventId,
    targetPeerId,
    ...(sourcePeerId === undefined ? {} : { sourcePeerId }),
    logicalTime,
    priority: 10,
    action,
  };
}

const scenarioRuntime = {
  driverId: 'agentplat-alpha2-coordination-reducers-v1',
  projectionId: 'agentplat-alpha2-safety-projection-v1',
  reduce({ state, action, logicalTime, clockOffset }) {
    let decision;
    if (action.kind === 'allocation.command') {
      decision = evaluateMeshAllocationCommand(
        state,
        action.command,
        new Date(Date.parse(action.verifiedAt) + clockOffset).toISOString(),
        logicalTime
      );
    } else if (action.kind === 'allocation.inbound') {
      decision = evaluateVerifiedMeshAllocationEnvelope(
        state,
        verified(
          action.envelope,
          new Date(Date.parse(action.verifiedAt) + clockOffset).toISOString(),
          logicalTime
        )
      );
    } else if (action.kind === 'allocation.timer') {
      decision = evaluateMeshAllocationTimer(
        state,
        {
          kind: 'timer.fired',
          timerId: action.timerId,
          generation: action.generation,
        },
        logicalTime
      );
    } else {
      throw new TypeError(`unknown Alpha 2 scenario action: ${action.kind}`);
    }
    return decision.accepted
      ? {
          state: decision.state,
          accepted: true,
          effects: decision.effects ?? [],
        }
      : {
          state: decision.state,
          accepted: false,
          rejectionCode: decision.code,
        };
  },
  project(state) {
    return compact({
      capabilities: Object.fromEntries(
        Object.entries(state.discovery.capabilities).map(([key, value]) => [
          key,
          {
            ownerPeerId: value.ownerPeerId,
            capabilityKey: value.capabilityKey,
          },
        ])
      ),
      work: Object.fromEntries(
        Object.entries(state.allocation.workAllocations).map(([key, value]) => [
          key,
          {
            phase: value.phase,
            activeOfferId: value.activeOfferId,
            activeAwardId: value.activeAwardId,
            activeAcceptanceId: value.activeAcceptanceId,
          },
        ])
      ),
      offers: Object.keys(state.allocation.localOffers).sort(),
      awards: Object.fromEntries(
        Object.entries(state.allocation.localAwards).map(([key, value]) => [
          key,
          {
            status: value.status,
            assigneePeerId: value.assigneePeerId,
            assignmentEpoch: value.assignmentEpoch,
          },
        ])
      ),
      authorities: Object.fromEntries(
        Object.entries(state.allocation.assigneeAuthorities).map(
          ([key, value]) => [
            key,
            {
              assigneePeerId: value.assigneePeerId,
              assignmentEpoch: value.assignmentEpoch,
              assignmentAuthorityId: value.assignmentAuthorityId,
            },
          ]
        )
      ),
      fences: Object.fromEntries(
        Object.entries(state.allocation.assignmentFenceHeads).map(
          ([key, value]) => [
            key,
            {
              phase: value.phase,
              assigneePeerId: value.assigneePeerId,
              assignmentEpoch: value.assignmentEpoch,
              assignmentAuthorityId: value.assignmentAuthorityId,
            },
          ]
        )
      ),
      execution: Object.fromEntries(
        Object.entries(state.allocation.executionHeads).map(([key, value]) => [
          key,
          {
            phase: value.phase,
            latestCheckpointId: value.latestCheckpointId,
            resultId: value.resultId,
          },
        ])
      ),
      certificates: Object.keys(state.allocation.recoveryCertificates).sort(),
      objective: Object.fromEntries(
        Object.entries(state.objectives.objectives).map(([key, value]) => [
          key,
          {
            reservedBudgetUnits: value.reservedBudgetUnits,
            committedBudgetUnits: value.committedBudgetUnits,
          },
        ])
      ),
    });
  },
  invariants: [
    {
      name: 'one-authority-per-fence-and-nonnegative-budget',
      evaluate({ peerStates, queuedEvents }) {
        assert.equal(queuedEvents <= 256, true);
        for (const state of Object.values(peerStates)) {
          for (const objective of Object.values(state.objectives.objectives)) {
            assert.equal(objective.reservedBudgetUnits >= 0, true);
            assert.equal(objective.committedBudgetUnits >= 0, true);
          }
          for (const fence of Object.values(
            state.allocation.assignmentFenceHeads
          )) {
            const matching = Object.values(
              state.allocation.assigneeAuthorities
            ).filter(
              (authority) =>
                authority.objectiveId === fence.objectiveId &&
                authority.workItemId === fence.workItemId &&
                authority.ownerPeerId === fence.ownerPeerId &&
                authority.ownerEpoch === fence.ownerEpoch &&
                authority.assignmentEpoch === fence.assignmentEpoch &&
                authority.assignmentAuthorityId === fence.assignmentAuthorityId
            );
            assert.equal(matching.length <= 1, true);
          }
        }
      },
    },
  ],
};

function compact(value) {
  return JSON.parse(JSON.stringify(value));
}

function links(peerIds = PEER_IDS) {
  return peerIds.flatMap((fromPeerId) =>
    peerIds
      .filter((toPeerId) => toPeerId !== fromPeerId)
      .map((toPeerId) => ({
        fromPeerId,
        toPeerId,
        latency: 0,
        enabled: true,
      }))
  );
}

function config(scenarioId, states, events, faults = [], seed = 0xa12fa017) {
  return {
    schemaVersion: 1,
    scenarioId,
    seed,
    prngVersion: 'xorshift32-v1',
    peers: Object.entries(states).map(([peerId, state]) => ({
      peerId,
      state,
    })),
    links: links(Object.keys(states)),
    events,
    faultPlan: { schemaVersion: 1, faults },
    limits: {
      maximumEvents: 256,
      maximumLogicalTime: 1_000_000,
      maximumQueuedEvents: 256,
      maximumStateBytes: 8 * 1024 * 1024,
    },
  };
}

function allocationEvents(records, { result = true } = {}) {
  const executionOffset =
    Date.parse(records.award.sentAt) - Date.parse('2026-07-30T00:00:02.000Z');
  const executionVerifiedAt = new Date(
    Date.parse('2026-07-30T00:00:06.000Z') + executionOffset
  ).toISOString();
  const recipients = Object.entries(records.offerByPeer).map(
    ([recipientPeerId, envelope]) => ({
      recipientPeerId,
      preparedAt: 7,
      envelope,
    })
  );
  const events = [
    scenarioEvent(
      'offer.local',
      'peer-a',
      7,
      reducerAction({
        kind: 'allocation.offer',
        objectiveId: 'objective-a',
        workItemId: 'work-item-a',
        expectedWorkItemRevision: 1,
        recipients,
      })
    ),
    scenarioEvent(
      'offer.to-b',
      'peer-b',
      8,
      inboundAction(records.offerByPeer['peer-b']),
      'peer-a'
    ),
    scenarioEvent(
      'offer.to-c',
      'peer-c',
      8,
      inboundAction(records.offerByPeer['peer-c']),
      'peer-a'
    ),
    scenarioEvent(
      'bid.local',
      records.bid.sender.peerId,
      9,
      reducerAction({
        kind: 'allocation.bid',
        offerId: records.bid.payload.offerId,
        preparedAt: 9,
        envelope: records.bid,
      })
    ),
    scenarioEvent(
      'bid.to-owner',
      'peer-a',
      10,
      inboundAction(records.bid),
      records.bid.sender.peerId
    ),
    scenarioEvent(
      'award.local',
      'peer-a',
      11,
      reducerAction({
        kind: 'allocation.award',
        offerId: records.award.payload.offerId,
        bidId: records.bid.payload.bidId,
        bidRevision: 1,
        recipient: {
          recipientPeerId: records.award.payload.assigneePeerId,
          preparedAt: 11,
          envelope: records.award,
        },
      })
    ),
    scenarioEvent(
      'award.to-assignee',
      records.award.payload.assigneePeerId,
      12,
      inboundAction(records.award),
      'peer-a'
    ),
    scenarioEvent(
      'accept.local',
      records.acceptance.sender.peerId,
      13,
      reducerAction({
        kind: 'allocation.assignment_response',
        awardId: records.award.payload.awardId,
        preparedAt: 13,
        envelope: records.acceptance,
      })
    ),
    scenarioEvent(
      'accept.to-owner',
      'peer-a',
      14,
      inboundAction(records.acceptance),
      records.acceptance.sender.peerId
    ),
  ];
  if (!result) return events;
  const resultEnvelope = directEnvelope(resultFixture, {
    id: messageId(500),
    sequence: 500,
    senderPeerId: records.acceptance.sender.peerId,
    recipientPeerId: 'peer-a',
    causationId: records.acceptance.messageId,
    sentAt: executionVerifiedAt,
    expiresAt: new Date(
      Date.parse('2026-07-30T00:00:20.000Z') + executionOffset
    ).toISOString(),
    payload: {
      resultId: 'result-a',
      ownerPeerId: 'peer-a',
      assigneePeerId: records.acceptance.sender.peerId,
      awardId: records.award.payload.awardId,
      acceptanceId: records.acceptance.payload.acceptanceId,
      assignmentAuthorityId: records.award.payload.assignmentAuthorityId,
      fencingToken: records.award.payload.fencingToken,
      leaseExpiresAt: records.award.payload.leaseExpiresAt,
    },
  });
  delete resultEnvelope.payload.checkpointId;
  const canonicalResult = hashed(resultEnvelope);
  events.push(
    scenarioEvent(
      'result.local',
      records.acceptance.sender.peerId,
      15,
      reducerAction(
        {
          kind: 'allocation.execution',
          preparedAt: 15,
          envelope: canonicalResult,
        },
        executionVerifiedAt
      )
    ),
    scenarioEvent(
      'result.to-owner',
      'peer-a',
      16,
      inboundAction(canonicalResult, executionVerifiedAt),
      records.acceptance.sender.peerId
    )
  );
  return events;
}

function recoveryRecipients(
  source,
  peerIds,
  { id, sequence, senderPeerId, causationId, payload, preparedAt }
) {
  return peerIds.map((recipientPeerId, offset) => ({
    recipientPeerId,
    preparedAt,
    envelope: directEnvelope(source, {
      id: typeof id === 'function' ? id(offset) : id,
      sequence: sequence + offset,
      senderPeerId,
      recipientPeerId,
      causationId,
      sentAt: RECOVERY_AT,
      expiresAt: '2026-07-30T00:02:30.000Z',
      payload,
    }),
  }));
}

function expireActiveLease(state) {
  const timer = Object.values(state.coordination.timers).find(
    (candidate) => candidate.kind === 'lease.expiry'
  );
  assert.ok(timer, 'active lease timer is retained');
  const decision = evaluateMeshAllocationTimer(
    state,
    {
      kind: 'timer.fired',
      timerId: timer.timerId,
      generation: timer.generation,
    },
    timer.dueAt
  );
  assert.equal(decision.accepted, true, decision.code);
  return { state: decision.state, dueAt: timer.dueAt };
}

function prepareExpiredRecoveryBaseline(threshold = 3) {
  const states = prepareWorkStates(threshold);
  const initial = allocationEnvelopes({});
  const recipients = Object.entries(initial.offerByPeer).map(
    ([recipientPeerId, envelope]) => ({
      recipientPeerId,
      preparedAt: 7,
      envelope,
    })
  );
  states['peer-a'] = accepted(
    evaluateMeshAllocationCommand(
      states['peer-a'],
      {
        kind: 'allocation.offer',
        objectiveId: 'objective-a',
        workItemId: 'work-item-a',
        expectedWorkItemRevision: 1,
        recipients,
      },
      INITIAL_AT,
      7
    ),
    'recovery offer'
  );
  for (const peerId of ['peer-b', 'peer-c'])
    states[peerId] = accepted(
      evaluateVerifiedMeshAllocationEnvelope(
        states[peerId],
        verified(initial.offerByPeer[peerId], INITIAL_AT, 7)
      ),
      `${peerId} receives recovery offer`
    );
  states['peer-b'] = accepted(
    evaluateMeshAllocationCommand(
      states['peer-b'],
      {
        kind: 'allocation.bid',
        offerId: 'offer-a',
        preparedAt: 8,
        envelope: initial.bid,
      },
      INITIAL_AT,
      8
    ),
    'initial recovery bid'
  );
  states['peer-a'] = accepted(
    evaluateVerifiedMeshAllocationEnvelope(
      states['peer-a'],
      verified(initial.bid, INITIAL_AT, 8)
    ),
    'owner receives initial recovery bid'
  );
  const candidateBid = directEnvelope(bidFixture, {
    id: messageId(211),
    sequence: 211,
    senderPeerId: 'peer-c',
    recipientPeerId: 'peer-a',
    causationId: initial.offerByPeer['peer-c'].messageId,
    sentAt: '2026-07-30T00:00:01.000Z',
    expiresAt: '2026-07-30T00:01:00.000Z',
    payload: {
      bidId: 'bid-c',
      ownerPeerId: 'peer-a',
      bidderPeerId: 'peer-c',
      advertisementId: 'advertisement-c',
      capabilityId: 'capability-c',
      bidExpiresAt: '2026-07-30T00:01:00.000Z',
    },
  });
  states['peer-c'] = accepted(
    evaluateMeshAllocationCommand(
      states['peer-c'],
      {
        kind: 'allocation.bid',
        offerId: 'offer-a',
        preparedAt: 9,
        envelope: candidateBid,
      },
      INITIAL_AT,
      9
    ),
    'candidate recovery bid'
  );
  states['peer-a'] = accepted(
    evaluateVerifiedMeshAllocationEnvelope(
      states['peer-a'],
      verified(candidateBid, INITIAL_AT, 9)
    ),
    'owner receives candidate recovery bid'
  );
  states['peer-a'] = accepted(
    evaluateMeshAllocationCommand(
      states['peer-a'],
      {
        kind: 'allocation.award',
        offerId: 'offer-a',
        bidId: 'bid-b',
        bidRevision: 1,
        recipient: {
          recipientPeerId: 'peer-b',
          preparedAt: 10,
          envelope: initial.award,
        },
      },
      INITIAL_AT,
      10
    ),
    'initial recovery award'
  );
  states['peer-b'] = accepted(
    evaluateVerifiedMeshAllocationEnvelope(
      states['peer-b'],
      verified(initial.award, INITIAL_AT, 11)
    ),
    'assignee receives initial recovery award'
  );

  const witnessAwards = {};
  for (const [peerId, number] of [
    ['peer-c', 221],
    ['peer-d', 222],
  ]) {
    witnessAwards[peerId] = directEnvelope(awardFixture, {
      id: messageId(number),
      sequence: number,
      senderPeerId: 'peer-a',
      recipientPeerId: peerId,
      causationId: initial.bid.messageId,
      sentAt: initial.award.sentAt,
      expiresAt: initial.award.expiresAt,
      payload: structuredClone(initial.award.payload),
    });
    states[peerId] = accepted(
      evaluateVerifiedMeshAllocationEnvelope(
        states[peerId],
        verified(witnessAwards[peerId], INITIAL_AT, 11)
      ),
      `${peerId} retains award witness copy`
    );
  }

  states['peer-b'] = accepted(
    evaluateMeshAllocationCommand(
      states['peer-b'],
      {
        kind: 'allocation.assignment_response',
        awardId: 'award-a',
        preparedAt: 12,
        envelope: initial.acceptance,
      },
      INITIAL_AT,
      12
    ),
    'initial recovery acceptance'
  );
  states['peer-a'] = accepted(
    evaluateVerifiedMeshAllocationEnvelope(
      states['peer-a'],
      verified(initial.acceptance, INITIAL_AT, 12)
    ),
    'owner receives initial recovery acceptance'
  );
  const witnessAcceptances = {};
  for (const [peerId, number] of [
    ['peer-c', 231],
    ['peer-d', 232],
  ]) {
    witnessAcceptances[peerId] = directEnvelope(acceptFixture, {
      id: messageId(number),
      sequence: number,
      senderPeerId: 'peer-b',
      recipientPeerId: peerId,
      causationId: witnessAwards[peerId].messageId,
      sentAt: initial.acceptance.sentAt,
      expiresAt: initial.acceptance.expiresAt,
      payload: structuredClone(initial.acceptance.payload),
    });
    states[peerId] = accepted(
      evaluateVerifiedMeshAllocationEnvelope(
        states[peerId],
        verified(witnessAcceptances[peerId], INITIAL_AT, 12)
      ),
      `${peerId} retains acceptance witness copy`
    );
  }

  const checkpoint = directEnvelope(checkpointFixture, {
    id: messageId(240),
    sequence: 240,
    senderPeerId: 'peer-b',
    recipientPeerId: 'peer-a',
    causationId: initial.acceptance.messageId,
    sentAt: '2026-07-30T00:00:05.000Z',
    expiresAt: '2026-07-30T00:00:20.000Z',
    payload: {
      ownerPeerId: 'peer-a',
      assigneePeerId: 'peer-b',
      leaseExpiresAt: '2026-07-30T00:00:25.000Z',
    },
  });
  states['peer-b'] = accepted(
    evaluateMeshAllocationCommand(
      states['peer-b'],
      {
        kind: 'allocation.execution',
        preparedAt: 13,
        envelope: checkpoint,
      },
      '2026-07-30T00:00:05.000Z',
      13
    ),
    'initial checkpoint'
  );
  states['peer-a'] = accepted(
    evaluateVerifiedMeshAllocationEnvelope(
      states['peer-a'],
      verified(checkpoint, '2026-07-30T00:00:05.000Z', 13)
    ),
    'owner receives initial checkpoint'
  );
  const witnessCheckpoints = {};
  for (const [peerId, number] of [
    ['peer-c', 241],
    ['peer-d', 242],
  ]) {
    witnessCheckpoints[peerId] = directEnvelope(checkpointFixture, {
      id: messageId(number),
      sequence: number,
      senderPeerId: 'peer-b',
      recipientPeerId: peerId,
      causationId: witnessAcceptances[peerId].messageId,
      sentAt: checkpoint.sentAt,
      expiresAt: checkpoint.expiresAt,
      payload: structuredClone(checkpoint.payload),
    });
    states[peerId] = accepted(
      evaluateVerifiedMeshAllocationEnvelope(
        states[peerId],
        verified(witnessCheckpoints[peerId], '2026-07-30T00:00:05.000Z', 13)
      ),
      `${peerId} retains checkpoint witness copy`
    );
  }
  const expiries = [];
  for (const peerId of PEER_IDS) {
    const expired = expireActiveLease(states[peerId]);
    states[peerId] = expired.state;
    expiries.push(expired.dueAt);
  }
  return {
    states,
    recoveryTime: Math.max(...expiries) + 60_000,
    evidence: {
      initial,
      candidateBid,
      checkpoint,
      witnessAwards,
      witnessAcceptances,
      witnessCheckpoints,
    },
  };
}

function createRecoverySchedule(
  baseline,
  {
    assemblerPeerId = 'peer-a',
    includeVotes = ['peer-b', 'peer-c', 'peer-d'],
    includeCertificate = true,
    includeActivation = true,
    includeCompletion = true,
  } = {}
) {
  const { recoveryTime, evidence } = baseline;
  const proposalRecipients = recoveryRecipients(
    proposalFixture,
    ['peer-a', 'peer-b', 'peer-d'],
    {
      id: (offset) => messageId(300 + offset),
      sequence: 300,
      senderPeerId: 'peer-c',
      causationId: evidence.witnessAcceptances['peer-c'].messageId,
      payload: {
        takeoverProposalId: 'takeover-proposal-a',
        proposalAuthority: 'candidate',
        proposerPeerId: 'peer-c',
        proposedAssigneePeerId: 'peer-c',
        proposedAssignmentEpoch: 2,
        ownerPeerId: 'peer-a',
        assigneePeerId: 'peer-b',
        leaseExpiresAt: '2026-07-30T00:00:25.000Z',
        leaseRenewalSequence: 0,
      },
      preparedAt: recoveryTime,
    }
  ).map((recipient) => {
    const copy = structuredClone(recipient);
    delete copy.envelope.payload.candidateConsentProposalId;
    delete copy.envelope.payload.latestLeaseRenewalId;
    copy.envelope = hashed(copy.envelope);
    return copy;
  });
  const events = [
    scenarioEvent(
      'recovery.proposal.local',
      'peer-c',
      recoveryTime,
      reducerAction(
        { kind: 'allocation.recovery', recipients: proposalRecipients },
        RECOVERY_AT
      )
    ),
    ...proposalRecipients.map((recipient, index) =>
      scenarioEvent(
        `recovery.proposal.to-${recipient.recipientPeerId}`,
        recipient.recipientPeerId,
        recoveryTime + 1,
        inboundAction(recipient.envelope, RECOVERY_AT),
        'peer-c'
      )
    ),
  ];
  const proposalByPeer = Object.fromEntries(
    proposalRecipients.map((recipient) => [
      recipient.recipientPeerId,
      recipient.envelope,
    ])
  );
  const voteBundles = {};
  for (const [index, witnessPeerId] of includeVotes.entries()) {
    const recipients = PEER_IDS.filter((peerId) => peerId !== witnessPeerId);
    const proposalEnvelope =
      witnessPeerId === 'peer-c'
        ? proposalRecipients[0].envelope
        : proposalByPeer[witnessPeerId];
    const number = 330 + index * 10;
    const voteRecipients = recoveryRecipients(voteFixture, recipients, {
      id: (offset) => messageId(number + offset),
      sequence: number,
      senderPeerId: witnessPeerId,
      causationId: proposalEnvelope.messageId,
      payload: {
        leaseVoteId: `lease-vote-${witnessPeerId.slice(-1)}`,
        takeoverProposalId: 'takeover-proposal-a',
        witnessPeerId,
      },
      preparedAt: recoveryTime + 2 + index,
    });
    voteBundles[witnessPeerId] = voteRecipients;
    events.push(
      scenarioEvent(
        `recovery.vote.${witnessPeerId}.local`,
        witnessPeerId,
        recoveryTime + 2 + index,
        reducerAction(
          { kind: 'allocation.recovery', recipients: voteRecipients },
          RECOVERY_AT
        )
      ),
      ...voteRecipients.map((recipient) =>
        scenarioEvent(
          `recovery.vote.${witnessPeerId}.to-${recipient.recipientPeerId}`,
          recipient.recipientPeerId,
          recoveryTime + 6 + index,
          inboundAction(recipient.envelope, RECOVERY_AT),
          witnessPeerId
        )
      )
    );
  }
  let certificateRecipients;
  if (includeCertificate) {
    const certificatePeerIds = PEER_IDS.filter(
      (peerId) => peerId !== assemblerPeerId
    );
    const assemblerProposal =
      assemblerPeerId === 'peer-c'
        ? proposalRecipients[0].envelope
        : proposalByPeer[assemblerPeerId];
    certificateRecipients = recoveryRecipients(
      certificateFixture,
      certificatePeerIds,
      {
        id: (offset) => messageId(400 + offset),
        sequence: 400,
        senderPeerId: assemblerPeerId,
        causationId: assemblerProposal.messageId,
        payload: {
          certificateId: 'certificate-a',
          certificateAssemblerPeerId: assemblerPeerId,
          takeoverProposalId: 'takeover-proposal-a',
          leaseVoteIds: includeVotes
            .map((peerId) => `lease-vote-${peerId.slice(-1)}`)
            .sort(),
        },
        preparedAt: recoveryTime + 12,
      }
    );
    events.push(
      scenarioEvent(
        'recovery.certificate.local',
        assemblerPeerId,
        recoveryTime + 12,
        reducerAction(
          {
            kind: 'allocation.recovery',
            recipients: certificateRecipients,
          },
          RECOVERY_AT
        )
      ),
      ...certificateRecipients.map((recipient) =>
        scenarioEvent(
          `recovery.certificate.to-${recipient.recipientPeerId}`,
          recipient.recipientPeerId,
          recoveryTime + 13,
          inboundAction(recipient.envelope, RECOVERY_AT),
          assemblerPeerId
        )
      )
    );
  }
  if (!includeCertificate || !includeActivation)
    return { events, proposalRecipients, voteBundles, certificateRecipients };

  const candidateCertificate = (
    assemblerPeerId === 'peer-c'
      ? certificateRecipients.find(
          ({ recipientPeerId }) => recipientPeerId === 'peer-a'
        )
      : certificateRecipients.find(
          ({ recipientPeerId }) => recipientPeerId === 'peer-c'
        )
  ).envelope;
  const recoveryAward = directEnvelope(awardFixture, {
    id: messageId(450),
    sequence: 450,
    senderPeerId: 'peer-a',
    recipientPeerId: 'peer-c',
    causationId:
      assemblerPeerId === 'peer-a'
        ? candidateCertificate.messageId
        : certificateRecipients.find(
            ({ recipientPeerId }) => recipientPeerId === 'peer-a'
          ).envelope.messageId,
    sentAt: '2026-07-30T00:01:40.000Z',
    expiresAt: '2026-07-30T00:02:00.000Z',
    payload: {
      awardId: 'award-recovery',
      bidId: 'bid-c',
      ownerPeerId: 'peer-a',
      assigneePeerId: 'peer-c',
      assignmentEpoch: 2,
      authorityKind: 'recovery_certificate',
      recoveryCertificateId: 'certificate-a',
      assignmentAuthorityId: 'certificate-a',
      fencingToken: 'certificate-a',
      resumeCheckpointId: 'checkpoint-a',
      leaseStartsAt: '2026-07-30T00:01:40.000Z',
      leaseExpiresAt: '2026-07-30T00:20:00.000Z',
      acceptanceDeadline: '2026-07-30T00:02:00.000Z',
    },
  });
  const recoveryAcceptance = directEnvelope(acceptFixture, {
    id: messageId(460),
    sequence: 460,
    senderPeerId: 'peer-c',
    recipientPeerId: 'peer-a',
    causationId: recoveryAward.messageId,
    sentAt: '2026-07-30T00:01:42.000Z',
    expiresAt: '2026-07-30T00:02:00.000Z',
    payload: {
      acceptanceId: 'acceptance-recovery',
      awardId: 'award-recovery',
      ownerPeerId: 'peer-a',
      assigneePeerId: 'peer-c',
      assignmentEpoch: 2,
      assignmentAuthorityId: 'certificate-a',
      fencingToken: 'certificate-a',
      acceptanceDeadline: '2026-07-30T00:02:00.000Z',
    },
  });
  const resumedCheckpoint = directEnvelope(checkpointFixture, {
    id: messageId(470),
    sequence: 470,
    senderPeerId: 'peer-c',
    recipientPeerId: 'peer-a',
    causationId: recoveryAcceptance.messageId,
    sentAt: '2026-07-30T00:01:43.000Z',
    expiresAt: '2026-07-30T00:02:10.000Z',
    payload: {
      checkpointId: 'checkpoint-recovered',
      checkpointSequence: 2,
      previousCheckpointId: 'checkpoint-a',
      ownerPeerId: 'peer-a',
      assigneePeerId: 'peer-c',
      awardId: 'award-recovery',
      acceptanceId: 'acceptance-recovery',
      assignmentEpoch: 2,
      assignmentAuthorityId: 'certificate-a',
      fencingToken: 'certificate-a',
      leaseExpiresAt: '2026-07-30T00:20:00.000Z',
    },
  });
  events.push(
    scenarioEvent(
      'recovery.award.local',
      'peer-a',
      recoveryTime + 20,
      reducerAction(
        {
          kind: 'allocation.recovery_award',
          certificateId: 'certificate-a',
          recipient: {
            recipientPeerId: 'peer-c',
            preparedAt: recoveryTime + 20,
            envelope: recoveryAward,
          },
        },
        AWARD_AT
      )
    ),
    scenarioEvent(
      'recovery.award.to-candidate',
      'peer-c',
      recoveryTime + 21,
      inboundAction(recoveryAward, AWARD_AT),
      'peer-a'
    ),
    scenarioEvent(
      'recovery.accept.local',
      'peer-c',
      recoveryTime + 22,
      reducerAction(
        {
          kind: 'allocation.assignment_response',
          awardId: 'award-recovery',
          preparedAt: recoveryTime + 22,
          envelope: recoveryAcceptance,
        },
        AWARD_AT
      )
    ),
    scenarioEvent(
      'recovery.accept.to-owner',
      'peer-a',
      recoveryTime + 23,
      inboundAction(recoveryAcceptance, AWARD_AT),
      'peer-c'
    ),
    scenarioEvent(
      'recovery.checkpoint.local',
      'peer-c',
      recoveryTime + 24,
      reducerAction(
        {
          kind: 'allocation.execution',
          preparedAt: recoveryTime + 24,
          envelope: resumedCheckpoint,
        },
        '2026-07-30T00:01:43.000Z'
      )
    ),
    scenarioEvent(
      'recovery.checkpoint.to-owner',
      'peer-a',
      recoveryTime + 25,
      inboundAction(resumedCheckpoint, '2026-07-30T00:01:43.000Z'),
      'peer-c'
    )
  );
  let result;
  if (includeCompletion) {
    result = directEnvelope(resultFixture, {
      id: messageId(480),
      sequence: 480,
      senderPeerId: 'peer-c',
      recipientPeerId: 'peer-a',
      causationId: resumedCheckpoint.messageId,
      sentAt: '2026-07-30T00:01:44.000Z',
      expiresAt: '2026-07-30T00:02:10.000Z',
      payload: {
        resultId: 'result-recovered',
        ownerPeerId: 'peer-a',
        assigneePeerId: 'peer-c',
        awardId: 'award-recovery',
        acceptanceId: 'acceptance-recovery',
        assignmentEpoch: 2,
        assignmentAuthorityId: 'certificate-a',
        fencingToken: 'certificate-a',
        leaseExpiresAt: '2026-07-30T00:20:00.000Z',
        checkpointId: 'checkpoint-recovered',
      },
    });
    events.push(
      scenarioEvent(
        'recovery.result.local',
        'peer-c',
        recoveryTime + 26,
        reducerAction(
          {
            kind: 'allocation.execution',
            preparedAt: recoveryTime + 26,
            envelope: result,
          },
          '2026-07-30T00:01:44.000Z'
        )
      ),
      scenarioEvent(
        'recovery.result.to-owner',
        'peer-a',
        recoveryTime + 27,
        inboundAction(result, '2026-07-30T00:01:44.000Z'),
        'peer-c'
      )
    );
  }
  return {
    events,
    proposalRecipients,
    voteBundles,
    certificateRecipients,
    recoveryAward,
    recoveryAcceptance,
    resumedCheckpoint,
    result,
  };
}

test('scenario 1: capability allocation crosses partial views and completes', async () => {
  const states = prepareWorkStates();
  assert.deepEqual(
    Object.values(states['peer-a'].discovery.capabilities)
      .map((entry) => entry.ownerPeerId)
      .sort(),
    ['peer-b', 'peer-c']
  );
  assert.equal(
    Object.keys(states['peer-b'].discovery.capabilities).length,
    0,
    'partial views are not promoted to global knowledge'
  );
  const records = allocationEnvelopes({});
  const prefixTrace = await runMeshReducerScenario(
    config(
      'capability-allocation-debug-prefix',
      prepareWorkStates(),
      allocationEvents(records, { result: false }).slice(0, 5)
    ),
    scenarioRuntime
  );
  const debugOwner = prefixTrace.peerStates['peer-a'];
  const debugOffer = debugOwner.allocation.localOffers['offer-a'];
  const debugBid = Object.values(debugOwner.allocation.bidHeads)[0];
  const debugReservation =
    debugOwner.allocation.reservations[debugOffer.reservationId];
  const parsedDebugAward = validateSignedMeshEnvelope(records.award);
  assert.equal(
    parsedDebugAward.ok,
    true,
    parsedDebugAward.ok ? '' : JSON.stringify(parsedDebugAward)
  );
  assert.deepEqual(
    {
      audience: records.award.audience.peerId,
      bidder: debugBid.bidderPeerId,
      causation: records.award.causationId,
      bidMessage: debugBid.acceptedMessageId,
      budget: records.award.payload.budgetReservationUnits,
      reserved: debugReservation.budgetReservationUnits,
      workDeadline: records.award.payload.workDeadline,
      expectedWorkDeadline: debugOffer.work.workDeadline,
      offerAttempt: records.award.payload.offerAttempt,
      expectedOfferAttempt: debugOffer.offerAttempt,
    },
    {
      audience: 'peer-b',
      bidder: 'peer-b',
      causation: records.bid.messageId,
      bidMessage: records.bid.messageId,
      budget: 100,
      reserved: 100,
      workDeadline: '2026-07-30T01:00:00.000Z',
      expectedWorkDeadline: '2026-07-30T01:00:00.000Z',
      offerAttempt: 1,
      expectedOfferAttempt: 1,
    }
  );
  const trace = await runMeshReducerScenario(
    config(
      'capability-allocation-partial-views',
      states,
      allocationEvents(records)
    ),
    scenarioRuntime
  );
  assert.equal(
    trace.metrics.rejectedReducerCalls,
    0,
    JSON.stringify(
      trace.records
        .filter(({ accepted }) => !accepted)
        .map(({ eventId, rejectionCode }) => [eventId, rejectionCode])
    )
  );
  assert.equal(
    Object.values(trace.projections['peer-a'].work)[0].phase,
    'completed'
  );
  assert.equal(
    Object.values(trace.projections['peer-a'].execution)[0].phase,
    'completed'
  );
  assert.match(trace.configurationDigest, /^[0-9a-f]{64}$/u);
  assert.match(trace.chainDigest, /^[0-9a-f]{64}$/u);
});

test('scenario 2: false capability claim fails and reallocates without becoming authority', async () => {
  const states = prepareWorkStates();
  const first = allocationEnvelopes({});
  const offered = evaluateMeshAllocationCommand(
    states['peer-a'],
    {
      kind: 'allocation.offer',
      objectiveId: 'objective-a',
      workItemId: 'work-item-a',
      expectedWorkItemRevision: 1,
      recipients: Object.entries(first.offerByPeer).map(
        ([recipientPeerId, envelope]) => ({
          recipientPeerId,
          preparedAt: 7,
          envelope,
        })
      ),
    },
    INITIAL_AT,
    7
  );
  states['peer-a'] = accepted(offered, 'false-claim offer');
  for (const peerId of ['peer-b', 'peer-c'])
    states[peerId] = accepted(
      evaluateVerifiedMeshAllocationEnvelope(
        states[peerId],
        verified(first.offerByPeer[peerId], INITIAL_AT, 8)
      ),
      `${peerId} receives false-claim offer`
    );
  const firstTimer = Object.values(states['peer-a'].coordination.timers).find(
    (timer) => timer.kind === 'work.bid_deadline'
  );
  assert.ok(firstTimer);
  const firstTrace = await runMeshReducerScenario(
    config('false-claim-failure', states, [
      scenarioEvent(
        'false-claim.bid-deadline',
        'peer-a',
        firstTimer.dueAt,
        timerAction(firstTimer.timerId, firstTimer.generation)
      ),
    ]),
    scenarioRuntime
  );
  assert.equal(
    Object.keys(firstTrace.peerStates['peer-b'].allocation.assigneeAuthorities)
      .length,
    0,
    'a self-claimed capability does not create execution authority'
  );
  assert.equal(
    Object.values(firstTrace.projections['peer-a'].work)[0].phase,
    'ready'
  );

  const second = allocationEnvelopes({
    offerId: 'offer-b',
    offerAttempt: 2,
    previousOfferId: 'offer-a',
    previousOfferByPeer: first.offerByPeer,
    assigneePeerId: 'peer-c',
    numberBase: 600,
    authority: 'award-b',
    timeOffsetMs: 60_000,
  });
  const secondEvents = allocationEvents(second).map((event) => ({
    ...event,
    eventId: `retry.${event.eventId}`,
    logicalTime: event.logicalTime + 60_000,
    action:
      event.action.kind !== 'allocation.command'
        ? {
            ...event.action,
            verifiedAt: event.eventId.startsWith('result.')
              ? event.action.verifiedAt
              : new Date(
                  Date.parse(event.action.verifiedAt) + 60_000
                ).toISOString(),
          }
        : {
            ...event.action,
            verifiedAt: event.eventId.startsWith('result.')
              ? event.action.verifiedAt
              : new Date(
                  Date.parse(event.action.verifiedAt) + 60_000
                ).toISOString(),
            command: {
              ...event.action.command,
              ...('preparedAt' in event.action.command
                ? { preparedAt: event.logicalTime + 60_000 }
                : {}),
              ...('recipients' in event.action.command
                ? {
                    recipients: event.action.command.recipients.map(
                      (recipient) => ({
                        ...recipient,
                        preparedAt: event.logicalTime + 60_000,
                      })
                    ),
                  }
                : {}),
              ...('recipient' in event.action.command
                ? {
                    recipient: {
                      ...event.action.command.recipient,
                      preparedAt: event.logicalTime + 60_000,
                    },
                  }
                : {}),
            },
          },
  }));
  const retryTrace = await runMeshReducerScenario(
    config('false-claim-reallocation', firstTrace.peerStates, secondEvents),
    scenarioRuntime
  );
  assert.equal(
    retryTrace.metrics.rejectedReducerCalls,
    0,
    JSON.stringify(
      retryTrace.records
        .filter(({ accepted }) => !accepted)
        .map(({ eventId, rejectionCode }) => [eventId, rejectionCode])
    )
  );
  assert.equal(
    Object.values(retryTrace.projections['peer-a'].work)[0].phase,
    'completed'
  );
  assert.equal(
    Object.values(retryTrace.projections['peer-a'].awards).at(-1)
      .assigneePeerId,
    'peer-c'
  );
});

test('scenario 3: lost bid and acceptance release only when their deadlines fire', async () => {
  const states = prepareWorkStates();
  const records = allocationEnvelopes({});
  const preOffer = evaluateMeshAllocationCommand(
    states['peer-a'],
    {
      kind: 'allocation.offer',
      objectiveId: 'objective-a',
      workItemId: 'work-item-a',
      expectedWorkItemRevision: 1,
      recipients: Object.entries(records.offerByPeer).map(
        ([recipientPeerId, envelope]) => ({
          recipientPeerId,
          preparedAt: 7,
          envelope,
        })
      ),
    },
    INITIAL_AT,
    7
  );
  states['peer-a'] = accepted(preOffer, 'pre-offer');
  states['peer-b'] = accepted(
    evaluateVerifiedMeshAllocationEnvelope(
      states['peer-b'],
      verified(records.offerByPeer['peer-b'], INITIAL_AT, 8)
    ),
    'pre-offer receipt'
  );
  const bidTimer = Object.values(states['peer-a'].coordination.timers).find(
    (timer) => timer.kind === 'work.bid_deadline'
  );
  assert.ok(bidTimer);
  const lostBidEvents = [
    scenarioEvent(
      'lost.bid.local',
      'peer-b',
      9,
      reducerAction({
        kind: 'allocation.bid',
        offerId: 'offer-a',
        preparedAt: 9,
        envelope: records.bid,
      })
    ),
    scenarioEvent(
      'lost.bid.delivery',
      'peer-a',
      10,
      inboundAction(records.bid),
      'peer-b'
    ),
    scenarioEvent(
      'bid.deadline',
      'peer-a',
      bidTimer.dueAt,
      timerAction(bidTimer.timerId, bidTimer.generation)
    ),
  ];
  const lostBid = await runMeshReducerScenario(
    config('lost-bid-deadline', states, lostBidEvents, [
      {
        faultId: 'drop-bid',
        kind: 'message.drop',
        logicalTime: 9,
        priority: 0,
        deliveryEventId: 'lost.bid.delivery',
      },
    ]),
    scenarioRuntime
  );
  assert.equal(
    Object.values(lostBid.projections['peer-a'].work)[0].phase,
    'ready'
  );
  assert.equal(lostBid.metrics.faultEvents, 1);
  assert.equal(
    lostBid.records.find(({ eventId }) => eventId === 'bid.deadline').accepted,
    true
  );

  const awardable = prepareWorkStates();
  const prefix = allocationEvents(records, { result: false }).slice(0, 7);
  const awardTrace = await runMeshReducerScenario(
    config('acceptance-loss-prefix', awardable, prefix),
    scenarioRuntime
  );
  const acceptanceTimer = Object.values(
    awardTrace.peerStates['peer-a'].coordination.timers
  ).find((timer) => timer.kind === 'work.acceptance_deadline');
  assert.ok(acceptanceTimer);
  const lostAcceptance = await runMeshReducerScenario(
    config(
      'lost-acceptance-deadline',
      awardTrace.peerStates,
      [
        scenarioEvent(
          'lost.accept.local',
          'peer-b',
          13,
          reducerAction({
            kind: 'allocation.assignment_response',
            awardId: 'award-a',
            preparedAt: 13,
            envelope: records.acceptance,
          })
        ),
        scenarioEvent(
          'lost.accept.delivery',
          'peer-a',
          14,
          inboundAction(records.acceptance),
          'peer-b'
        ),
        scenarioEvent(
          'accept.deadline',
          'peer-a',
          acceptanceTimer.dueAt,
          timerAction(acceptanceTimer.timerId, acceptanceTimer.generation)
        ),
      ],
      [
        {
          faultId: 'drop-acceptance',
          kind: 'message.drop',
          logicalTime: 13,
          priority: 0,
          deliveryEventId: 'lost.accept.delivery',
        },
      ]
    ),
    scenarioRuntime
  );
  assert.equal(
    Object.values(lostAcceptance.projections['peer-a'].work)[0].phase,
    'ready'
  );
  assert.equal(
    lostAcceptance.peerStates['peer-a'].objectives.objectives['objective-a']
      .reservedBudgetUnits,
    0
  );
});

test('scenario 4: duplicate and reorder preserve the ordered semantic projection', async () => {
  const records = allocationEnvelopes({});
  const orderedConfig = config(
    'ordered-allocation',
    prepareWorkStates(),
    allocationEvents(records)
  );
  const ordered = await runMeshReducerScenario(orderedConfig, scenarioRuntime);
  const deliveryEvents = orderedConfig.events.filter(
    (event) => event.sourcePeerId !== undefined
  );
  const duplicateFaults = deliveryEvents.map((event, index) => ({
    faultId: `duplicate-${index}`,
    kind: 'message.duplicate',
    logicalTime: Math.max(0, event.logicalTime - 1),
    priority: index,
    deliveryEventId: event.eventId,
    copies: 1,
  }));
  duplicateFaults.push({
    faultId: 'reorder-offer-c',
    kind: 'message.reorder',
    logicalTime: 0,
    priority: -10,
    deliveryEventId: 'offer.to-c',
    newLogicalTime: 9,
    newPriority: 5,
  });
  const perturbed = await runMeshReducerScenario(
    config(
      'duplicate-reordered-allocation',
      prepareWorkStates(),
      allocationEvents(records),
      duplicateFaults
    ),
    scenarioRuntime
  );
  assert.deepEqual(perturbed.projections, ordered.projections);
  assert.equal(perturbed.metrics.rejectedReducerCalls > 0, true);
  const appliedDuplicateFaults = perturbed.faults.filter(
    ({ kind }) => kind === 'message.duplicate'
  );
  assert.equal(appliedDuplicateFaults.length, deliveryEvents.length);
  assert.equal(
    appliedDuplicateFaults.every(({ applied }) => applied),
    true
  );
});

test('scenario 5: crash after checkpoint recovers epoch two, resumes, and completes', async () => {
  const baseline = prepareExpiredRecoveryBaseline(2);
  const schedule = createRecoverySchedule(baseline, {
    includeVotes: ['peer-c', 'peer-d'],
  });
  const trace = await runMeshReducerScenario(
    config(
      'assignee-crash-certified-resume',
      baseline.states,
      schedule.events,
      [
        {
          faultId: 'crash-old-assignee',
          kind: 'peer.crash',
          peerId: 'peer-b',
          logicalTime: baseline.recoveryTime,
          priority: -20,
        },
      ],
      0x50000005
    ),
    scenarioRuntime
  );
  assert.equal(trace.faults[0].applied, true);
  assert.equal(trace.faults[0].affectedEventIds.length > 0, true);
  assert.equal(
    trace.records.some(
      ({ rejectionCode }) => rejectionCode === 'simulation_peer_crashed'
    ),
    false
  );
  const owner = trace.peerStates['peer-a'];
  const ownerFence = Object.values(owner.allocation.assignmentFenceHeads)[0];
  assert.deepEqual(
    {
      phase: ownerFence.phase,
      assignmentEpoch: ownerFence.assignmentEpoch,
      assignmentAuthorityId: ownerFence.assignmentAuthorityId,
      assigneePeerId: ownerFence.assigneePeerId,
    },
    {
      phase: 'terminal',
      assignmentEpoch: 2,
      assignmentAuthorityId: 'certificate-a',
      assigneePeerId: 'peer-c',
    }
  );
  assert.equal(
    owner.allocation.executionRecords['checkpoint-recovered'].envelope.payload
      .previousCheckpointId,
    'checkpoint-a'
  );
  assert.equal(
    owner.allocation.executionRecords['result-recovered'].envelope.payload
      .checkpointId,
    'checkpoint-recovered'
  );
  assert.equal(
    Object.values(owner.allocation.executionHeads).find(
      ({ assignmentEpoch }) => assignmentEpoch === 2
    ).resultId,
    'result-recovered'
  );
  assert.deepEqual(
    {
      reserved: owner.objectives.objectives['objective-a'].reservedBudgetUnits,
      committed:
        owner.objectives.objectives['objective-a'].committedBudgetUnits,
    },
    { reserved: 0, committed: 100 }
  );
  assert.deepEqual(
    trace.records
      .filter(
        ({ kind, accepted, rejectionCode }) =>
          kind === 'reducer' && !accepted && rejectionCode !== undefined
      )
      .map(({ eventId, rejectionCode }) => [eventId, rejectionCode]),
    []
  );
  const [fenceKey] = Object.keys(owner.allocation.assignmentFenceHeads);
  const missingFence = structuredClone(owner.allocation);
  delete missingFence.assignmentFenceHeads[fenceKey];
  assert.throws(
    () =>
      createMeshAllocationRuntimeState(
        owner.coordination,
        owner.discovery,
        owner.objectives,
        restoreMeshAllocationState(missingFence)
      ),
    /fence|authority|lifecycle|recovery|head relation/iu
  );
  const fakeFence = structuredClone(owner.allocation);
  Object.assign(fakeFence.assignmentFenceHeads[fenceKey], {
    assignmentEpoch: 1,
    assignmentAuthorityId: 'award-a',
    fencingToken: 'award-a',
    assigneePeerId: 'peer-b',
  });
  assert.throws(
    () =>
      createMeshAllocationRuntimeState(
        owner.coordination,
        owner.discovery,
        owner.objectives,
        restoreMeshAllocationState(fakeFence)
      ),
    /fence|authority|lifecycle|recovery|head relation/iu
  );
});

test('scenario 6: minority partition cannot commit stale work and majority recovers', async () => {
  const baseline = prepareExpiredRecoveryBaseline(2);
  const schedule = createRecoverySchedule(baseline, {
    includeVotes: ['peer-c', 'peer-d'],
    includeCompletion: false,
  });
  const isolatedLinks = PEER_IDS.filter(
    (peerId) => peerId !== 'peer-b'
  ).flatMap((peerId) => [
    { fromPeerId: 'peer-b', toPeerId: peerId },
    { fromPeerId: peerId, toPeerId: 'peer-b' },
  ]);
  const staleProgress = directEnvelope(progressFixture, {
    id: messageId(700),
    sequence: 700,
    senderPeerId: 'peer-b',
    recipientPeerId: 'peer-a',
    causationId: baseline.evidence.checkpoint.messageId,
    sentAt: '2026-07-30T00:00:06.000Z',
    expiresAt: '2026-07-30T00:00:20.000Z',
    payload: {
      progressId: 'progress-stale',
      progressSequence: 1,
      checkpointId: 'checkpoint-a',
      ownerPeerId: 'peer-a',
      assigneePeerId: 'peer-b',
      leaseExpiresAt: '2026-07-30T00:00:25.000Z',
    },
  });
  const staleResult = directEnvelope(resultFixture, {
    id: messageId(701),
    sequence: 701,
    senderPeerId: 'peer-b',
    recipientPeerId: 'peer-a',
    causationId: baseline.evidence.checkpoint.messageId,
    sentAt: '2026-07-30T00:00:07.000Z',
    expiresAt: '2026-07-30T00:00:20.000Z',
    payload: {
      resultId: 'result-stale',
      checkpointId: 'checkpoint-a',
      ownerPeerId: 'peer-a',
      assigneePeerId: 'peer-b',
      leaseExpiresAt: '2026-07-30T00:00:25.000Z',
    },
  });
  const healAt = baseline.recoveryTime + 28;
  const events = [
    ...schedule.events,
    scenarioEvent(
      'minority.stale-progress.partitioned',
      'peer-a',
      baseline.recoveryTime + 26,
      inboundAction(staleProgress, '2026-07-30T00:00:10.000Z'),
      'peer-b'
    ),
    scenarioEvent(
      'minority.stale-result.partitioned',
      'peer-a',
      baseline.recoveryTime + 27,
      inboundAction(staleResult, '2026-07-30T00:00:10.000Z'),
      'peer-b'
    ),
    {
      ...scenarioEvent(
        'minority.stale-progress.retry',
        'peer-a',
        healAt + 1,
        inboundAction(staleProgress, '2026-07-30T00:00:10.000Z'),
        'peer-b'
      ),
      scheduledAt: healAt,
    },
    {
      ...scenarioEvent(
        'minority.stale-result.retry',
        'peer-a',
        healAt + 2,
        inboundAction(staleResult, '2026-07-30T00:00:10.000Z'),
        'peer-b'
      ),
      scheduledAt: healAt,
    },
  ];
  const trace = await runMeshReducerScenario(
    config(
      'minority-partition-stale-fenced',
      baseline.states,
      events,
      [
        {
          faultId: 'partition-old-assignee',
          kind: 'network.partition',
          links: isolatedLinks,
          logicalTime: baseline.recoveryTime,
          priority: -20,
        },
        {
          faultId: 'heal-old-assignee',
          kind: 'network.heal',
          links: isolatedLinks,
          logicalTime: healAt,
          priority: -20,
        },
      ],
      0x60000006
    ),
    scenarioRuntime
  );
  assert.deepEqual(
    trace.faults.map(({ kind, applied }) => [kind, applied]),
    [
      ['network.partition', true],
      ['network.heal', true],
    ]
  );
  assert.equal(
    trace.records.some(
      ({ eventId }) => eventId === 'minority.stale-progress.partitioned'
    ),
    false
  );
  assert.equal(
    trace.faults[0].affectedEventIds.includes(
      'minority.stale-progress.partitioned'
    ),
    true
  );
  for (const eventId of [
    'minority.stale-progress.retry',
    'minority.stale-result.retry',
  ])
    assert.equal(
      trace.records.find((record) => record.eventId === eventId).rejectionCode,
      'execution_authority_invalid'
    );
  const owner = trace.peerStates['peer-a'];
  assert.equal(owner.allocation.executionRecords['progress-stale'], undefined);
  assert.equal(owner.allocation.executionRecords['result-stale'], undefined);
  assert.equal(
    Object.values(owner.allocation.assignmentFenceHeads)[0]
      .assignmentAuthorityId,
    'certificate-a'
  );
});

test('scenario 7: no quorum creates no certificate or new authority', async () => {
  const baseline = prepareExpiredRecoveryBaseline(3);
  const schedule = createRecoverySchedule(baseline, {
    includeVotes: ['peer-c', 'peer-d'],
    includeActivation: false,
  });
  const trace = await runMeshReducerScenario(
    config(
      'no-recovery-quorum',
      baseline.states,
      schedule.events,
      [],
      0x70000007
    ),
    scenarioRuntime
  );
  const certificate = trace.records.find(
    ({ eventId }) => eventId === 'recovery.certificate.local'
  );
  assert.equal(certificate.accepted, false);
  assert.equal(certificate.rejectionCode, 'recovery_quorum_insufficient');
  for (const state of Object.values(trace.peerStates)) {
    assert.equal(Object.keys(state.allocation.recoveryCertificates).length, 0);
    assert.equal(
      Object.values(state.allocation.assigneeAuthorities).some(
        ({ assignmentEpoch }) => assignmentEpoch === 2
      ),
      false
    );
    assert.equal(
      Object.values(state.allocation.assignmentFenceHeads)[0]?.phase,
      'expired'
    );
  }
});

test('scenario 8: witnesses fence while owner is unavailable and activation waits for return', async () => {
  const prefixBaseline = prepareExpiredRecoveryBaseline(2);
  const prefixSchedule = createRecoverySchedule(prefixBaseline, {
    assemblerPeerId: 'peer-c',
    includeVotes: ['peer-c', 'peer-d'],
    includeActivation: false,
  });
  const prefix = await runMeshReducerScenario(
    config(
      'owner-unavailable-fence-only',
      prefixBaseline.states,
      prefixSchedule.events,
      [
        {
          faultId: 'crash-owner',
          kind: 'peer.crash',
          peerId: 'peer-a',
          logicalTime: prefixBaseline.recoveryTime,
          priority: -20,
        },
      ],
      0x80000008
    ),
    scenarioRuntime
  );
  for (const peerId of ['peer-b', 'peer-c', 'peer-d']) {
    const fence = Object.values(
      prefix.peerStates[peerId].allocation.assignmentFenceHeads
    )[0];
    assert.equal(fence.phase, 'recovering');
    assert.equal(fence.assignmentEpoch, 2);
    assert.equal(fence.assignmentAuthorityId, 'certificate-a');
    assert.equal(
      Object.values(
        prefix.peerStates[peerId].allocation.assigneeAuthorities
      ).some(({ assignmentEpoch }) => assignmentEpoch === 2),
      false
    );
  }

  const baseline = prepareExpiredRecoveryBaseline(2);
  const schedule = createRecoverySchedule(baseline, {
    assemblerPeerId: 'peer-c',
    includeVotes: ['peer-c', 'peer-d'],
  });
  const proposalToOwner = schedule.proposalRecipients.find(
    ({ recipientPeerId }) => recipientPeerId === 'peer-a'
  ).envelope;
  const voteCToOwner = schedule.voteBundles['peer-c'].find(
    ({ recipientPeerId }) => recipientPeerId === 'peer-a'
  ).envelope;
  const voteDToOwner = schedule.voteBundles['peer-d'].find(
    ({ recipientPeerId }) => recipientPeerId === 'peer-a'
  ).envelope;
  const certificateToOwner = schedule.certificateRecipients.find(
    ({ recipientPeerId }) => recipientPeerId === 'peer-a'
  ).envelope;
  const resumeAt = baseline.recoveryTime + 14;
  const reissuedPostResumeWork = schedule.events
    .filter(({ eventId }) =>
      [
        'recovery.accept.to-owner',
        'recovery.checkpoint.to-owner',
        'recovery.result.to-owner',
      ].includes(eventId)
    )
    .map((event) => ({
      ...event,
      eventId: `owner-return.${event.eventId}.retry`,
      scheduledAt: event.logicalTime - 1,
    }));
  const retryEvents = [
    {
      ...scenarioEvent(
        'owner-return.proposal.retry',
        'peer-a',
        resumeAt + 1,
        inboundAction(proposalToOwner, RECOVERY_AT),
        'peer-c'
      ),
      scheduledAt: resumeAt,
    },
    {
      ...scenarioEvent(
        'owner-return.vote-c.retry',
        'peer-a',
        resumeAt + 2,
        inboundAction(voteCToOwner, RECOVERY_AT),
        'peer-c'
      ),
      scheduledAt: resumeAt,
    },
    {
      ...scenarioEvent(
        'owner-return.vote-d.retry',
        'peer-a',
        resumeAt + 3,
        inboundAction(voteDToOwner, RECOVERY_AT),
        'peer-d'
      ),
      scheduledAt: resumeAt,
    },
    {
      ...scenarioEvent(
        'owner-return.certificate.retry',
        'peer-a',
        resumeAt + 4,
        inboundAction(certificateToOwner, RECOVERY_AT),
        'peer-c'
      ),
      scheduledAt: resumeAt,
    },
    ...reissuedPostResumeWork,
  ];
  const fullTrace = await runMeshReducerScenario(
    config(
      'owner-return-activates-certified-recovery',
      baseline.states,
      [...schedule.events, ...retryEvents],
      [
        {
          faultId: 'crash-owner',
          kind: 'peer.crash',
          peerId: 'peer-a',
          logicalTime: baseline.recoveryTime,
          priority: -20,
        },
        {
          faultId: 'resume-owner-same-snapshot',
          kind: 'peer.resume',
          peerId: 'peer-a',
          logicalTime: resumeAt,
          priority: -20,
        },
      ],
      0x80000009
    ),
    scenarioRuntime
  );
  assert.equal(
    fullTrace.records.find(
      ({ eventId }) => eventId === 'owner-return.certificate.retry'
    ).accepted,
    true
  );
  const ownerFence = Object.values(
    fullTrace.peerStates['peer-a'].allocation.assignmentFenceHeads
  )[0];
  assert.equal(ownerFence.phase, 'terminal');
  assert.equal(ownerFence.assignmentEpoch, 2);
  assert.equal(ownerFence.assignmentAuthorityId, 'certificate-a');
  assert.equal(
    Object.values(
      fullTrace.peerStates['peer-c'].allocation.assigneeAuthorities
    ).some(
      ({ assignmentEpoch, assignmentAuthorityId }) =>
        assignmentEpoch === 2 && assignmentAuthorityId === 'certificate-a'
    ),
    true
  );
});

test('scenario 9: identical replay matches and one controlled fault reports first divergence', async () => {
  const records = allocationEnvelopes({});
  const baselineConfig = config(
    'deterministic-replay-alpha2',
    prepareWorkStates(),
    allocationEvents(records),
    [],
    0x90000009
  );
  const expected = await runMeshReducerScenario(
    baselineConfig,
    scenarioRuntime
  );
  const replay = await replayMeshReducerScenario(
    baselineConfig,
    scenarioRuntime,
    expected
  );
  assert.deepEqual(replay, {
    matches: true,
    expectedChainDigest: expected.chainDigest,
    actualChainDigest: expected.chainDigest,
  });
  const divergentConfig = config(
    'deterministic-replay-alpha2',
    prepareWorkStates(),
    allocationEvents(records),
    [
      {
        faultId: 'drop-controlled-bid',
        kind: 'message.drop',
        logicalTime: 9,
        priority: 0,
        deliveryEventId: 'bid.to-owner',
      },
    ],
    0x90000009
  );
  const divergent = await replayMeshReducerScenario(
    divergentConfig,
    scenarioRuntime,
    expected
  );
  assert.equal(divergent.matches, false);
  assert.equal(Number.isSafeInteger(divergent.firstDivergence), true);
  assert.notEqual(divergent.actualChainDigest, expected.chainDigest);
  assert.match(expected.configurationDigest, /^[0-9a-f]{64}$/u);
  assert.match(expected.faultPlanDigest, /^[0-9a-f]{64}$/u);
});

test('generic reducer runner rejects open schemas and out-of-bound faults', async () => {
  const basicRuntime = {
    driverId: 'closed-runner-test-v1',
    projectionId: 'closed-runner-projection-v1',
    reduce({ state, action }) {
      assert.equal(Object.isFrozen(action), true);
      assert.equal(Object.isFrozen(action.nested), true);
      return {
        accepted: true,
        state: { count: state.count + action.delta },
      };
    },
    project(state) {
      return { nested: { count: state.count } };
    },
  };
  const basicConfig = {
    schemaVersion: 1,
    scenarioId: 'closed-runner',
    seed: 1,
    prngVersion: 'xorshift32-v1',
    peers: [{ peerId: 'peer-a', state: { count: 0 } }],
    links: [],
    events: [
      {
        eventId: 'increment',
        targetPeerId: 'peer-a',
        logicalTime: 1,
        priority: 0,
        action: { delta: 1, nested: { value: true } },
      },
    ],
    faultPlan: { schemaVersion: 1, faults: [] },
    limits: {
      maximumEvents: 8,
      maximumLogicalTime: 100,
      maximumQueuedEvents: 8,
      maximumStateBytes: 1024,
    },
  };
  await assert.rejects(
    runMeshReducerScenario({ ...basicConfig, unsupported: true }, basicRuntime),
    /unsupported fields/u
  );
  await assert.rejects(
    runMeshReducerScenario(
      {
        ...basicConfig,
        events: [{ ...basicConfig.events[0], unsupported: true }],
      },
      basicRuntime
    ),
    /unsupported fields/u
  );
  await assert.rejects(
    runMeshReducerScenario(
      {
        ...basicConfig,
        faultPlan: {
          schemaVersion: 1,
          faults: [
            {
              faultId: 'offset',
              kind: 'clock.offset',
              peerId: 'peer-a',
              logicalTime: 0,
              priority: 0,
              offset: 86_400_001,
            },
          ],
        },
      },
      basicRuntime
    ),
    /clock offset limit/u
  );
  await assert.rejects(
    runMeshReducerScenario(
      {
        ...basicConfig,
        faultPlan: {
          schemaVersion: 1,
          faults: [
            {
              faultId: 'open-fault',
              kind: 'message.drop',
              logicalTime: 0,
              priority: 0,
              deliveryEventId: 'increment',
              unsupported: true,
            },
          ],
        },
      },
      basicRuntime
    ),
    /unsupported fields/u
  );
  await assert.rejects(
    runMeshReducerScenario(
      {
        ...basicConfig,
        faultPlan: {
          schemaVersion: 1,
          faults: Array.from({ length: 4_097 }, (_, index) => ({
            faultId: `fault-${index}`,
            kind: 'message.drop',
            logicalTime: 0,
            priority: index,
            deliveryEventId: 'increment',
          })),
        },
      },
      basicRuntime
    ),
    /collections/u
  );
  await assert.rejects(
    runMeshReducerScenario(
      {
        ...basicConfig,
        peers: [
          ...basicConfig.peers,
          { peerId: 'peer-b', state: { count: 0 } },
        ],
        faultPlan: {
          schemaVersion: 1,
          faults: [
            {
              faultId: 'too-many-links',
              kind: 'network.partition',
              logicalTime: 0,
              priority: 0,
              links: Array.from({ length: 4_097 }, () => ({
                fromPeerId: 'peer-a',
                toPeerId: 'peer-b',
              })),
            },
          ],
        },
      },
      basicRuntime
    ),
    /partition link limit/u
  );
  await assert.rejects(
    runMeshReducerScenario(
      {
        ...basicConfig,
        faultPlan: {
          schemaVersion: 1,
          faults: [
            {
              faultId: 'fresh-restart-is-not-resume',
              kind: 'peer.restart',
              peerId: 'peer-a',
              logicalTime: 0,
              priority: 0,
            },
          ],
        },
      },
      basicRuntime
    ),
    /Unsupported.*fault kind/u
  );
  await assert.rejects(
    runMeshReducerScenario(
      {
        ...basicConfig,
        events: [{ ...basicConfig.events[0], sourcePeerId: 'peer-a' }],
        faultPlan: {
          schemaVersion: 1,
          faults: [
            {
              faultId: 'reorder',
              kind: 'message.reorder',
              logicalTime: 0,
              priority: 0,
              deliveryEventId: 'increment',
              newLogicalTime: 1.5,
              newPriority: 0,
            },
          ],
        },
      },
      basicRuntime
    ),
    /reorder/u
  );
  await assert.rejects(
    runMeshReducerScenario(
      {
        ...basicConfig,
        peers: [
          ...basicConfig.peers,
          { peerId: 'peer-b', state: { count: 0 } },
        ],
        links: [
          {
            fromPeerId: 'peer-a',
            toPeerId: 'peer-b',
            latency: 0,
            enabled: true,
          },
          {
            fromPeerId: 'peer-a',
            toPeerId: 'peer-b',
            latency: 0,
            enabled: true,
          },
        ],
      },
      basicRuntime
    ),
    /Duplicate.*link/u
  );
  await assert.rejects(
    runMeshReducerScenario(
      {
        ...basicConfig,
        faultPlan: {
          schemaVersion: 1,
          faults: [
            {
              faultId: 'local-command-is-not-a-message',
              kind: 'message.drop',
              logicalTime: 0,
              priority: 0,
              deliveryEventId: 'increment',
            },
          ],
        },
      },
      basicRuntime
    ),
    /not a delivery/u
  );

  const transportConfig = {
    ...basicConfig,
    peers: [...basicConfig.peers, { peerId: 'peer-b', state: { count: 0 } }],
    links: [
      {
        fromPeerId: 'peer-a',
        toPeerId: 'peer-b',
        latency: 0,
        enabled: true,
      },
    ],
    events: [
      {
        eventId: 'delivery',
        sourcePeerId: 'peer-a',
        targetPeerId: 'peer-b',
        logicalTime: 90,
        priority: 0,
        action: { delta: 1, nested: { value: true } },
      },
    ],
  };
  await assert.rejects(
    runMeshReducerScenario(
      {
        ...transportConfig,
        events: [
          {
            ...transportConfig.events[0],
            scheduledAt: transportConfig.events[0].logicalTime + 1,
          },
        ],
      },
      basicRuntime
    ),
    /event/u
  );
  for (const fault of [
    {
      faultId: 'delay-after-drop-still-bounded',
      kind: 'message.delay',
      logicalTime: 1,
      priority: 0,
      deliveryEventId: 'delivery',
      delay: 11,
    },
    {
      faultId: 'reorder-after-drop-still-bounded',
      kind: 'message.reorder',
      logicalTime: 1,
      priority: 0,
      deliveryEventId: 'delivery',
      newLogicalTime: 101,
      newPriority: 0,
    },
  ])
    await assert.rejects(
      runMeshReducerScenario(
        {
          ...transportConfig,
          faultPlan: {
            schemaVersion: 1,
            faults: [
              {
                faultId: 'drop-first',
                kind: 'message.drop',
                logicalTime: 0,
                priority: 0,
                deliveryEventId: 'delivery',
              },
              fault,
            ],
          },
        },
        basicRuntime
      ),
      /delay|reorder/u
    );
  await assert.rejects(
    runMeshReducerScenario(
      {
        ...transportConfig,
        links: [],
        faultPlan: {
          schemaVersion: 1,
          faults: [
            {
              faultId: 'missing-topology-link',
              kind: 'network.partition',
              logicalTime: 0,
              priority: 0,
              links: [{ fromPeerId: 'peer-a', toPeerId: 'peer-b' }],
            },
          ],
        },
      },
      basicRuntime
    ),
    /not configured/u
  );
});

test('generic reducer runner crash discards queued deliveries but preserves local work across resume', async () => {
  const reducedEventIds = [];
  const trace = await runMeshReducerScenario(
    {
      schemaVersion: 1,
      scenarioId: 'crash-discards-volatile-delivery',
      seed: 3,
      prngVersion: 'xorshift32-v1',
      peers: [
        { peerId: 'peer-a', state: { count: 0 } },
        { peerId: 'peer-b', state: { count: 0 } },
      ],
      links: [
        {
          fromPeerId: 'peer-a',
          toPeerId: 'peer-b',
          latency: 0,
          enabled: true,
        },
      ],
      events: [
        {
          eventId: 'local-after-resume',
          targetPeerId: 'peer-b',
          logicalTime: 15,
          priority: 0,
          action: { delta: 1 },
        },
        {
          eventId: 'volatile-delivery',
          sourcePeerId: 'peer-a',
          targetPeerId: 'peer-b',
          logicalTime: 20,
          priority: 0,
          action: { delta: 100 },
        },
        {
          eventId: 'post-resume-retry',
          sourcePeerId: 'peer-a',
          scheduledAt: 12,
          targetPeerId: 'peer-b',
          logicalTime: 20,
          priority: 1,
          action: { delta: 10 },
        },
      ],
      faultPlan: {
        schemaVersion: 1,
        faults: [
          {
            faultId: 'crash-b',
            kind: 'peer.crash',
            peerId: 'peer-b',
            logicalTime: 5,
            priority: 0,
          },
          {
            faultId: 'resume-b',
            kind: 'peer.resume',
            peerId: 'peer-b',
            logicalTime: 10,
            priority: 0,
          },
          {
            faultId: 'premature-drop',
            kind: 'message.drop',
            deliveryEventId: 'post-resume-retry',
            logicalTime: 11,
            priority: 0,
          },
        ],
      },
      limits: {
        maximumEvents: 8,
        maximumLogicalTime: 100,
        maximumQueuedEvents: 8,
        maximumStateBytes: 1024,
      },
    },
    {
      driverId: 'volatile-delivery-crash-v1',
      projectionId: 'volatile-delivery-projection-v1',
      reduce({ state, action }) {
        reducedEventIds.push(action.delta);
        return {
          accepted: true,
          state: { count: state.count + action.delta },
        };
      },
      project(state) {
        return state;
      },
    }
  );

  assert.deepEqual(trace.faults[0].affectedEventIds, ['volatile-delivery']);
  assert.equal(
    trace.records.some(({ eventId }) => eventId === 'volatile-delivery'),
    false
  );
  assert.equal(trace.faults[2].applied, false);
  assert.equal(
    trace.records.some(({ eventId }) => eventId === 'post-resume-retry'),
    true
  );
  assert.deepEqual(reducedEventIds, [1, 10]);
  assert.equal(trace.peerStates['peer-b'].count, 11);
});

test('generic reducer runner deep-freezes state, effects, and projections before invariants', async () => {
  let invariantCalls = 0;
  const trace = await runMeshReducerScenario(
    {
      schemaVersion: 1,
      scenarioId: 'deep-freeze-runner',
      seed: 2,
      prngVersion: 'xorshift32-v1',
      peers: [{ peerId: 'peer-a', state: { nested: { count: 0 } } }],
      links: [],
      events: [
        {
          eventId: 'increment',
          targetPeerId: 'peer-a',
          logicalTime: 1,
          priority: 0,
          action: { nested: { delta: 1 } },
        },
      ],
      faultPlan: { schemaVersion: 1, faults: [] },
      limits: {
        maximumEvents: 4,
        maximumLogicalTime: 10,
        maximumQueuedEvents: 4,
        maximumStateBytes: 1024,
      },
    },
    {
      driverId: 'deep-freeze-test-v1',
      projectionId: 'deep-freeze-projection-v1',
      reduce({ state, action }) {
        assert.equal(Object.isFrozen(state.nested), true);
        assert.equal(Object.isFrozen(action.nested), true);
        return {
          accepted: true,
          state: {
            nested: { count: state.nested.count + action.nested.delta },
          },
          effects: [{ nested: { emitted: true } }],
        };
      },
      project(state) {
        return { nested: { count: state.nested.count } };
      },
      invariants: [
        {
          name: 'immutable-projection',
          evaluate({ peerStates, projections }) {
            invariantCalls += 1;
            assert.equal(Object.isFrozen(peerStates['peer-a'].nested), true);
            assert.equal(Object.isFrozen(projections['peer-a'].nested), true);
            assert.throws(() => {
              projections['peer-a'].nested.count = 99;
            }, TypeError);
          },
        },
      ],
    }
  );
  assert.equal(invariantCalls, 1);
  assert.equal(trace.peerStates['peer-a'].nested.count, 1);
  assert.equal(Object.isFrozen(trace.projections['peer-a'].nested), true);
});

test('generic reducer runner snapshots mutable inputs before its first await and never executes getters', async () => {
  const initialState = { nested: { count: 0 } };
  const action = { nested: { delta: 1 } };
  const runtime = {
    driverId: 'mutable-boundary-v1',
    projectionId: 'mutable-boundary-projection-v1',
    reduce({ state, action: input }) {
      return {
        accepted: true,
        state: {
          nested: { count: state.nested.count + input.nested.delta },
        },
      };
    },
    project(state) {
      return state;
    },
  };
  const mutableConfig = {
    schemaVersion: 1,
    scenarioId: 'mutable-boundary',
    seed: 4,
    prngVersion: 'xorshift32-v1',
    peers: [{ peerId: 'peer-a', state: initialState }],
    links: [],
    events: [
      {
        eventId: 'increment',
        targetPeerId: 'peer-a',
        logicalTime: 1,
        priority: 0,
        action,
      },
    ],
    faultPlan: { schemaVersion: 1, faults: [] },
    limits: {
      maximumEvents: 4,
      maximumLogicalTime: 10,
      maximumQueuedEvents: 4,
      maximumStateBytes: 1024,
    },
  };
  const running = runMeshReducerScenario(mutableConfig, runtime);
  initialState.nested.count = 100;
  action.nested.delta = 100;
  runtime.driverId = 'mutated-after-call';
  const trace = await running;
  assert.equal(trace.peerStates['peer-a'].nested.count, 1);

  const pristine = await runMeshReducerScenario(
    {
      ...mutableConfig,
      peers: [{ peerId: 'peer-a', state: { nested: { count: 0 } } }],
      events: [
        {
          ...mutableConfig.events[0],
          action: { nested: { delta: 1 } },
        },
      ],
    },
    { ...runtime, driverId: 'mutable-boundary-v1' }
  );
  assert.equal(trace.configurationDigest, pristine.configurationDigest);

  let getterReads = 0;
  const getterAction = { nested: {} };
  Object.defineProperty(getterAction.nested, 'delta', {
    enumerable: true,
    get() {
      getterReads += 1;
      return 1;
    },
  });
  await assert.rejects(
    runMeshReducerScenario(
      {
        ...mutableConfig,
        peers: [{ peerId: 'peer-a', state: { nested: { count: 0 } } }],
        events: [
          {
            ...mutableConfig.events[0],
            action: getterAction,
          },
        ],
      },
      { ...runtime, driverId: 'mutable-boundary-v1' }
    ),
    /plain data/u
  );
  assert.equal(getterReads, 0);
});

test('generic reducer runner rejects duplicate IDs that exceed the event ID bound', async () => {
  const longEventId = 'e'.repeat(750);
  await assert.rejects(
    runMeshReducerScenario(
      {
        schemaVersion: 1,
        scenarioId: 'bounded-duplicate-id',
        seed: 5,
        prngVersion: 'xorshift32-v1',
        peers: [
          { peerId: 'peer-a', state: { count: 0 } },
          { peerId: 'peer-b', state: { count: 0 } },
        ],
        links: [
          {
            fromPeerId: 'peer-a',
            toPeerId: 'peer-b',
            latency: 0,
            enabled: true,
          },
        ],
        events: [
          {
            eventId: longEventId,
            sourcePeerId: 'peer-a',
            targetPeerId: 'peer-b',
            logicalTime: 1,
            priority: 0,
            action: { delta: 1 },
          },
        ],
        faultPlan: {
          schemaVersion: 1,
          faults: [
            {
              faultId: 'duplicate-bound',
              kind: 'message.duplicate',
              logicalTime: 0,
              priority: 0,
              deliveryEventId: longEventId,
              copies: 1,
            },
          ],
        },
        limits: {
          maximumEvents: 4,
          maximumLogicalTime: 10,
          maximumQueuedEvents: 4,
          maximumStateBytes: 1024,
        },
      },
      {
        driverId: 'duplicate-bound-v1',
        projectionId: 'duplicate-bound-projection-v1',
        reduce({ state, action: input }) {
          return {
            accepted: true,
            state: { count: state.count + input.delta },
          };
        },
        project(state) {
          return state;
        },
      }
    ),
    /duplicate eventId/u
  );
  await assert.rejects(
    runMeshReducerScenario(
      {
        schemaVersion: 1,
        scenarioId: 'bounded-fault-event-id',
        seed: 6,
        prngVersion: 'xorshift32-v1',
        peers: [{ peerId: 'peer-a', state: { count: 0 } }],
        links: [],
        events: [],
        faultPlan: {
          schemaVersion: 1,
          faults: [
            {
              faultId: 'f'.repeat(765),
              kind: 'peer.crash',
              peerId: 'peer-a',
              logicalTime: 0,
              priority: 0,
            },
          ],
        },
        limits: {
          maximumEvents: 2,
          maximumLogicalTime: 10,
          maximumQueuedEvents: 2,
          maximumStateBytes: 1024,
        },
      },
      {
        driverId: 'fault-id-bound-v1',
        projectionId: 'fault-id-bound-projection-v1',
        reduce({ state }) {
          return { accepted: true, state };
        },
        project(state) {
          return state;
        },
      }
    ),
    /fault eventId/u
  );
});
