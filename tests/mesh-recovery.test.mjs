import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { canonicalizeMeshPayload } from '@agentplat/mesh-protocol';
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
const checkpointFixture = fixture('work-checkpoint.json');
const progressFixture = fixture('work-progress.json');
const proposalFixture = fixture('lease-takeover-proposal.json');
const voteFixture = fixture('lease-vote.json');
const certificateFixture = fixture('lease-certificate.json');

const INITIAL_AT = '2026-07-30T00:00:04.000Z';
const RECOVERY_AT = '2026-07-30T00:01:30.000Z';
const AWARD_AT = '2026-07-30T00:01:41.000Z';

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

function runtimeWithAllocation(state, allocation, logicalTime) {
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

function createPeerRuntime(peerId) {
  const localIdentity = identity(peerId);
  let state = createMeshAllocationRuntimeState(
    createMeshCoordinationState({ identity: localIdentity }),
    createMeshDiscoveryState({
      identity: localIdentity,
      subscriptions: ['membership', 'capability', 'objective'],
      admittedPeers: ['peer-a', 'peer-b', 'peer-c', 'peer-d']
        .filter((candidate) => candidate !== peerId || candidate === 'peer-a')
        .map((candidate) => ({
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
  announcement.payload.recoveryWitnessThreshold = 3;
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
    envelope.sender = {
      peerId,
      instanceId: `instance-${suffix}`,
    };
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

test('expired witnessed work is fenced, recovered once, and resumes from its checkpoint', () => {
  const states = {
    a: createPeerRuntime('peer-a'),
    b: createPeerRuntime('peer-b'),
    c: createPeerRuntime('peer-c'),
    d: createPeerRuntime('peer-d'),
  };

  states.a = discoverCandidate(states.a, 'peer-b', 2);
  states.a = discoverCandidate(states.a, 'peer-c', 4);
  const work = evaluateMeshObjectiveWorkCommand(
    createMeshObjectiveWorkRuntimeState(
      states.a.coordination,
      states.a.discovery,
      states.a.objectives
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
  states.a = createMeshAllocationRuntimeState(
    work.state.coordination,
    work.state.discovery,
    work.state.objectives,
    restoreMeshAllocationState({
      ...states.a.allocation,
      lastLogicalTime: 6,
    })
  );

  const offers = ['peer-b', 'peer-c'].map((recipientPeerId, offset) => ({
    recipientPeerId,
    preparedAt: 7,
    envelope: directEnvelope(offerFixture, {
      id: messageId(200 + offset),
      sequence: 20 + offset,
      senderPeerId: 'peer-a',
      recipientPeerId,
      sentAt: '2026-07-30T00:00:00.000Z',
      expiresAt: '2026-07-30T00:01:00.000Z',
      payload: { ownerPeerId: 'peer-a' },
    }),
  }));
  const offered = evaluateMeshAllocationCommand(
    states.a,
    {
      kind: 'allocation.offer',
      objectiveId: 'objective-a',
      workItemId: 'work-item-a',
      expectedWorkItemRevision: 1,
      recipients: offers,
    },
    INITIAL_AT,
    7
  );
  states.a = accepted(offered, 'offer');
  assert.deepEqual(
    offered.effects.map((effect) => effect.recipientPeerId),
    ['peer-b', 'peer-c']
  );
  states.b = accepted(
    evaluateVerifiedMeshAllocationEnvelope(
      states.b,
      verified(offers[0].envelope, INITIAL_AT, 7)
    ),
    'peer-b receives offer'
  );
  states.c = accepted(
    evaluateVerifiedMeshAllocationEnvelope(
      states.c,
      verified(offers[1].envelope, INITIAL_AT, 7)
    ),
    'peer-c receives offer'
  );

  const bids = {};
  for (const [key, peerId, offer, number] of [
    ['b', 'peer-b', offers[0], 210],
    ['c', 'peer-c', offers[1], 211],
  ]) {
    const suffix = peerId.slice(-1);
    bids[key] = directEnvelope(bidFixture, {
      id: messageId(number),
      sequence: number,
      senderPeerId: peerId,
      recipientPeerId: 'peer-a',
      causationId: offer.envelope.messageId,
      sentAt: '2026-07-30T00:00:01.000Z',
      expiresAt: '2026-07-30T00:01:00.000Z',
      payload: {
        bidId: `bid-${suffix}`,
        ownerPeerId: 'peer-a',
        bidderPeerId: peerId,
        advertisementId: `advertisement-${suffix}`,
        capabilityId: `capability-${suffix}`,
        bidExpiresAt: '2026-07-30T00:01:00.000Z',
      },
    });
    states[key] = accepted(
      evaluateMeshAllocationCommand(
        states[key],
        {
          kind: 'allocation.bid',
          offerId: 'offer-a',
          preparedAt: 8,
          envelope: bids[key],
        },
        INITIAL_AT,
        8
      ),
      `${peerId} prepares bid`
    );
  }
  states.a = accepted(
    evaluateVerifiedMeshAllocationEnvelope(
      states.a,
      verified(bids.b, INITIAL_AT, 8)
    ),
    'owner receives peer-b bid'
  );
  states.a = accepted(
    evaluateVerifiedMeshAllocationEnvelope(
      states.a,
      verified(bids.c, INITIAL_AT, 9)
    ),
    'owner receives peer-c bid'
  );

  const initialAward = directEnvelope(awardFixture, {
    id: messageId(220),
    sequence: 220,
    senderPeerId: 'peer-a',
    recipientPeerId: 'peer-b',
    causationId: bids.b.messageId,
    sentAt: '2026-07-30T00:00:02.000Z',
    expiresAt: '2026-07-30T00:00:12.000Z',
    payload: {
      bidId: 'bid-b',
      ownerPeerId: 'peer-a',
      assigneePeerId: 'peer-b',
      leaseStartsAt: '2026-07-30T00:00:02.000Z',
      leaseExpiresAt: '2026-07-30T00:00:25.000Z',
      acceptanceDeadline: '2026-07-30T00:00:15.000Z',
    },
  });
  states.a = accepted(
    evaluateMeshAllocationCommand(
      states.a,
      {
        kind: 'allocation.award',
        offerId: 'offer-a',
        bidId: 'bid-b',
        bidRevision: 1,
        recipient: {
          recipientPeerId: 'peer-b',
          preparedAt: 10,
          envelope: initialAward,
        },
      },
      INITIAL_AT,
      10
    ),
    'initial award'
  );
  states.b = accepted(
    evaluateVerifiedMeshAllocationEnvelope(
      states.b,
      verified(initialAward, INITIAL_AT, 11)
    ),
    'assignee receives initial award'
  );

  const witnessAwards = {};
  for (const [key, peerId, number] of [
    ['c', 'peer-c', 221],
    ['d', 'peer-d', 222],
  ]) {
    witnessAwards[key] = directEnvelope(awardFixture, {
      id: messageId(number),
      sequence: number,
      senderPeerId: 'peer-a',
      recipientPeerId: peerId,
      causationId: bids.b.messageId,
      sentAt: '2026-07-30T00:00:02.000Z',
      expiresAt: '2026-07-30T00:00:12.000Z',
      payload: structuredClone(initialAward.payload),
    });
    states[key] = accepted(
      evaluateVerifiedMeshAllocationEnvelope(
        states[key],
        verified(witnessAwards[key], INITIAL_AT, 11)
      ),
      `${peerId} retains award witness copy`
    );
  }

  const initialAcceptance = directEnvelope(acceptFixture, {
    id: messageId(230),
    sequence: 230,
    senderPeerId: 'peer-b',
    recipientPeerId: 'peer-a',
    causationId: initialAward.messageId,
    sentAt: '2026-07-30T00:00:03.000Z',
    expiresAt: '2026-07-30T00:00:12.000Z',
    payload: {
      ownerPeerId: 'peer-a',
      assigneePeerId: 'peer-b',
      acceptanceDeadline: '2026-07-30T00:00:15.000Z',
    },
  });
  states.b = accepted(
    evaluateMeshAllocationCommand(
      states.b,
      {
        kind: 'allocation.assignment_response',
        awardId: 'award-a',
        preparedAt: 12,
        envelope: initialAcceptance,
      },
      INITIAL_AT,
      12
    ),
    'initial acceptance'
  );
  states.a = accepted(
    evaluateVerifiedMeshAllocationEnvelope(
      states.a,
      verified(initialAcceptance, INITIAL_AT, 12)
    ),
    'owner receives initial acceptance'
  );

  const witnessAcceptances = {};
  for (const [key, peerId, number] of [
    ['c', 'peer-c', 231],
    ['d', 'peer-d', 232],
  ]) {
    witnessAcceptances[key] = directEnvelope(acceptFixture, {
      id: messageId(number),
      sequence: number,
      senderPeerId: 'peer-b',
      recipientPeerId: peerId,
      causationId: witnessAwards[key].messageId,
      sentAt: '2026-07-30T00:00:03.000Z',
      expiresAt: '2026-07-30T00:00:12.000Z',
      payload: structuredClone(initialAcceptance.payload),
    });
    states[key] = accepted(
      evaluateVerifiedMeshAllocationEnvelope(
        states[key],
        verified(witnessAcceptances[key], INITIAL_AT, 12)
      ),
      `${peerId} retains acceptance witness copy`
    );
  }

  const initialCheckpoint = directEnvelope(checkpointFixture, {
    id: messageId(240),
    sequence: 240,
    senderPeerId: 'peer-b',
    recipientPeerId: 'peer-a',
    causationId: initialAcceptance.messageId,
    sentAt: '2026-07-30T00:00:05.000Z',
    expiresAt: '2026-07-30T00:00:20.000Z',
    payload: {
      ownerPeerId: 'peer-a',
      assigneePeerId: 'peer-b',
      leaseExpiresAt: '2026-07-30T00:00:25.000Z',
    },
  });
  states.b = accepted(
    evaluateMeshAllocationCommand(
      states.b,
      {
        kind: 'allocation.execution',
        preparedAt: 13,
        envelope: initialCheckpoint,
      },
      '2026-07-30T00:00:05.000Z',
      13
    ),
    'initial checkpoint'
  );
  states.a = accepted(
    evaluateVerifiedMeshAllocationEnvelope(
      states.a,
      verified(initialCheckpoint, '2026-07-30T00:00:05.000Z', 13)
    ),
    'owner receives initial checkpoint'
  );

  const witnessCheckpoints = {};
  for (const [key, peerId, number] of [
    ['c', 'peer-c', 241],
    ['d', 'peer-d', 242],
  ]) {
    witnessCheckpoints[key] = directEnvelope(checkpointFixture, {
      id: messageId(number),
      sequence: number,
      senderPeerId: 'peer-b',
      recipientPeerId: peerId,
      causationId: witnessAcceptances[key].messageId,
      sentAt: '2026-07-30T00:00:05.000Z',
      expiresAt: '2026-07-30T00:00:20.000Z',
      payload: structuredClone(initialCheckpoint.payload),
    });
    states[key] = accepted(
      evaluateVerifiedMeshAllocationEnvelope(
        states[key],
        verified(witnessCheckpoints[key], '2026-07-30T00:00:05.000Z', 13)
      ),
      `${peerId} retains checkpoint witness copy`
    );
  }
  assert.equal(
    Object.values(states.c.allocation.witnessAssignments)[0].latestCheckpoint
      .recordId,
    'checkpoint-a'
  );
  assert.equal(
    Object.values(states.d.allocation.witnessAssignments)[0].latestCheckpoint
      .recordId,
    'checkpoint-a'
  );

  const committedBeforeRecovery = {
    reserved: states.a.objectives.objectives['objective-a'].reservedBudgetUnits,
    committed:
      states.a.objectives.objectives['objective-a'].committedBudgetUnits,
  };
  assert.deepEqual(committedBeforeRecovery, {
    reserved: 0,
    committed: 100,
  });

  const expiries = [];
  for (const key of ['a', 'b', 'c', 'd']) {
    const expired = expireActiveLease(states[key]);
    states[key] = expired.state;
    expiries.push(expired.dueAt);
    assert.equal(
      Object.values(states[key].allocation.assignmentFenceHeads)[0].phase,
      'expired'
    );
  }
  const recoveryTime = Math.max(...expiries) + 60_000;

  const proposalPayload = {
    takeoverProposalId: 'takeover-proposal-a',
    proposalAuthority: 'candidate',
    proposerPeerId: 'peer-c',
    proposedAssigneePeerId: 'peer-c',
    proposedAssignmentEpoch: 2,
    ownerPeerId: 'peer-a',
    assigneePeerId: 'peer-b',
    leaseExpiresAt: '2026-07-30T00:00:25.000Z',
    leaseRenewalSequence: 0,
  };
  delete proposalPayload.candidateConsentProposalId;
  const proposalMessageId = messageId(300);
  const proposalRecipients = recoveryRecipients(
    proposalFixture,
    ['peer-a', 'peer-b', 'peer-d'],
    {
      id: (offset) => messageId(300 + offset),
      sequence: 300,
      senderPeerId: 'peer-c',
      causationId: witnessAcceptances.c.messageId,
      payload: proposalPayload,
      preparedAt: recoveryTime,
    }
  );
  for (const recipient of proposalRecipients) {
    delete recipient.envelope.payload.candidateConsentProposalId;
    delete recipient.envelope.payload.latestLeaseRenewalId;
    recipient.envelope = hashed(recipient.envelope);
  }
  const proposalCommand = {
    kind: 'allocation.recovery',
    recipients: proposalRecipients,
  };
  const beforeGrace = evaluateMeshAllocationCommand(
    states.c,
    {
      kind: 'allocation.recovery',
      recipients: proposalRecipients.map((recipient) => ({
        ...recipient,
        preparedAt: recoveryTime - 1,
      })),
    },
    RECOVERY_AT,
    recoveryTime - 1
  );
  assert.equal(beforeGrace.accepted, false);
  assert.equal(beforeGrace.code, 'recovery_grace_not_elapsed');
  assert.equal(beforeGrace.state, states.c);
  const proposedInReverseOrder = evaluateMeshAllocationCommand(
    states.c,
    {
      kind: 'allocation.recovery',
      recipients: [...proposalRecipients].reverse(),
    },
    RECOVERY_AT,
    recoveryTime
  );
  assert.equal(
    proposedInReverseOrder.accepted,
    true,
    proposedInReverseOrder.code
  );
  const proposed = evaluateMeshAllocationCommand(
    states.c,
    proposalCommand,
    RECOVERY_AT,
    recoveryTime
  );
  states.c = accepted(proposed, 'candidate takeover proposal');
  assert.deepEqual(proposedInReverseOrder, proposed);
  assert.deepEqual(
    proposed.effects
      .map((effect) => [
        effect.recipientPeerId,
        effect.envelope.audience.peerId,
      ])
      .sort(),
    [
      ['peer-a', 'peer-a'],
      ['peer-b', 'peer-b'],
      ['peer-d', 'peer-d'],
    ]
  );
  assert.equal(
    new Set(proposed.effects.map((effect) => effect.messageId)).size,
    proposed.effects.length
  );
  const duplicateProposal = evaluateMeshAllocationCommand(
    states.c,
    proposalCommand,
    RECOVERY_AT,
    recoveryTime
  );
  assert.equal(duplicateProposal.accepted, true);
  assert.equal(duplicateProposal.duplicate, true);
  assert.equal(duplicateProposal.state, states.c);

  const conflictRecipients = recoveryRecipients(
    proposalFixture,
    ['peer-a', 'peer-b', 'peer-d'],
    {
      id: (offset) =>
        offset === 0 ? proposalMessageId : messageId(310 + offset),
      sequence: 310,
      senderPeerId: 'peer-c',
      causationId: witnessAcceptances.c.messageId,
      payload: {
        ...proposalPayload,
        takeoverProposalId: 'takeover-proposal-conflict',
      },
      preparedAt: recoveryTime + 1,
    }
  );
  for (const recipient of conflictRecipients) {
    delete recipient.envelope.payload.candidateConsentProposalId;
    delete recipient.envelope.payload.latestLeaseRenewalId;
    recipient.envelope = hashed(recipient.envelope);
  }
  const conflict = evaluateMeshAllocationCommand(
    states.c,
    { kind: 'allocation.recovery', recipients: conflictRecipients },
    RECOVERY_AT,
    recoveryTime + 1
  );
  assert.equal(conflict.accepted, false);
  assert.equal(conflict.code, 'recovery_duplicate_conflict');
  assert.equal(conflict.state, states.c);

  for (const effect of proposed.effects) {
    const key = effect.recipientPeerId.slice(-1);
    states[key] = accepted(
      evaluateVerifiedMeshAllocationEnvelope(
        states[key],
        verified(effect.envelope, RECOVERY_AT, recoveryTime)
      ),
      `${effect.recipientPeerId} receives proposal copy`
    );
  }

  const votes = {};
  for (const [key, witnessPeerId, recipients, number] of [
    ['b', 'peer-b', ['peer-a', 'peer-c', 'peer-d'], 330],
    ['d', 'peer-d', ['peer-a', 'peer-b', 'peer-c'], 340],
  ]) {
    const proposalCopy =
      key === 'b' ? proposalRecipients[1] : proposalRecipients[2];
    const voteRecipients = recoveryRecipients(voteFixture, recipients, {
      id: (offset) => messageId(number + offset),
      sequence: number,
      senderPeerId: witnessPeerId,
      causationId: proposalCopy.envelope.messageId,
      payload: {
        leaseVoteId: `lease-vote-${key}`,
        takeoverProposalId: 'takeover-proposal-a',
        witnessPeerId,
      },
      preparedAt: recoveryTime + 2,
    });
    const decision = evaluateMeshAllocationCommand(
      states[key],
      { kind: 'allocation.recovery', recipients: voteRecipients },
      RECOVERY_AT,
      recoveryTime + 2
    );
    states[key] = accepted(decision, `${witnessPeerId} votes`);
    votes[key] = { decision, recipients: voteRecipients };
  }
  assert.notEqual(
    votes.b.recipients[0].envelope.payload.leaseVoteId,
    votes.d.recipients[0].envelope.payload.leaseVoteId
  );

  const equivocationRecipients = recoveryRecipients(
    voteFixture,
    ['peer-a', 'peer-c', 'peer-d'],
    {
      id: (offset) => messageId(350 + offset),
      sequence: 350,
      senderPeerId: 'peer-b',
      causationId: proposalRecipients[1].envelope.messageId,
      payload: {
        leaseVoteId: 'lease-vote-b-equivocation',
        takeoverProposalId: 'takeover-proposal-a',
        witnessPeerId: 'peer-b',
      },
      preparedAt: recoveryTime + 3,
    }
  );
  const equivocation = evaluateMeshAllocationCommand(
    states.b,
    { kind: 'allocation.recovery', recipients: equivocationRecipients },
    RECOVERY_AT,
    recoveryTime + 3
  );
  assert.equal(equivocation.accepted, false);
  assert.equal(equivocation.code, 'recovery_vote_conflict');

  for (const { decision } of Object.values(votes)) {
    for (const effect of decision.effects) {
      const key = effect.recipientPeerId.slice(-1);
      states[key] = accepted(
        evaluateVerifiedMeshAllocationEnvelope(
          states[key],
          verified(effect.envelope, RECOVERY_AT, recoveryTime + 3)
        ),
        `${effect.recipientPeerId} receives ${effect.envelope.payload.leaseVoteId}`
      );
    }
  }

  const insufficientCertificateRecipients = recoveryRecipients(
    certificateFixture,
    ['peer-b', 'peer-c', 'peer-d'],
    {
      id: (offset) => messageId(355 + offset),
      sequence: 355,
      senderPeerId: 'peer-a',
      causationId: proposalMessageId,
      payload: {
        certificateId: 'certificate-insufficient',
        certificateAssemblerPeerId: 'peer-a',
        takeoverProposalId: 'takeover-proposal-a',
        leaseVoteIds: ['lease-vote-b', 'lease-vote-d'],
      },
      preparedAt: recoveryTime + 4,
    }
  );
  const insufficientCertificate = evaluateMeshAllocationCommand(
    states.a,
    {
      kind: 'allocation.recovery',
      recipients: insufficientCertificateRecipients,
    },
    RECOVERY_AT,
    recoveryTime + 4
  );
  assert.equal(insufficientCertificate.accepted, false);
  assert.equal(insufficientCertificate.code, 'recovery_quorum_insufficient');
  assert.equal(insufficientCertificate.state, states.a);

  const candidateVoteRecipients = recoveryRecipients(
    voteFixture,
    ['peer-a', 'peer-b', 'peer-d'],
    {
      id: (offset) => messageId(365 + offset),
      sequence: 365,
      senderPeerId: 'peer-c',
      causationId: proposalMessageId,
      payload: {
        leaseVoteId: 'lease-vote-c',
        takeoverProposalId: 'takeover-proposal-a',
        witnessPeerId: 'peer-c',
      },
      preparedAt: recoveryTime + 5,
    }
  );
  const candidateVote = evaluateMeshAllocationCommand(
    states.c,
    {
      kind: 'allocation.recovery',
      recipients: candidateVoteRecipients,
    },
    RECOVERY_AT,
    recoveryTime + 5
  );
  states.c = accepted(candidateVote, 'candidate witness vote');
  for (const effect of candidateVote.effects) {
    const key = effect.recipientPeerId.slice(-1);
    states[key] = accepted(
      evaluateVerifiedMeshAllocationEnvelope(
        states[key],
        verified(effect.envelope, RECOVERY_AT, recoveryTime + 5)
      ),
      `${effect.recipientPeerId} receives lease-vote-c`
    );
  }

  const certificateRecipients = recoveryRecipients(
    certificateFixture,
    ['peer-b', 'peer-c', 'peer-d'],
    {
      id: (offset) => messageId(360 + offset),
      sequence: 360,
      senderPeerId: 'peer-a',
      causationId: proposalMessageId,
      payload: {
        certificateId: 'certificate-a',
        certificateAssemblerPeerId: 'peer-a',
        takeoverProposalId: 'takeover-proposal-a',
        leaseVoteIds: ['lease-vote-b', 'lease-vote-c', 'lease-vote-d'],
      },
      preparedAt: recoveryTime + 6,
    }
  );
  const certified = evaluateMeshAllocationCommand(
    states.a,
    { kind: 'allocation.recovery', recipients: certificateRecipients },
    RECOVERY_AT,
    recoveryTime + 6
  );
  states.a = accepted(certified, 'quorum certificate');
  for (const effect of certified.effects) {
    const key = effect.recipientPeerId.slice(-1);
    states[key] = accepted(
      evaluateVerifiedMeshAllocationEnvelope(
        states[key],
        verified(effect.envelope, RECOVERY_AT, recoveryTime + 6)
      ),
      `${effect.recipientPeerId} receives certificate`
    );
  }
  const ownerFence = Object.values(states.a.allocation.assignmentFenceHeads)[0];
  assert.deepEqual(
    {
      phase: ownerFence.phase,
      assignmentEpoch: ownerFence.assignmentEpoch,
      assignmentAuthorityId: ownerFence.assignmentAuthorityId,
      fencingToken: ownerFence.fencingToken,
      assigneePeerId: ownerFence.assigneePeerId,
    },
    {
      phase: 'recovering',
      assignmentEpoch: 2,
      assignmentAuthorityId: 'certificate-a',
      fencingToken: 'certificate-a',
      assigneePeerId: 'peer-c',
    }
  );

  const staleProgress = directEnvelope(progressFixture, {
    id: messageId(370),
    sequence: 370,
    senderPeerId: 'peer-b',
    recipientPeerId: 'peer-a',
    causationId: initialAcceptance.messageId,
    sentAt: '2026-07-30T00:00:06.000Z',
    expiresAt: '2026-07-30T00:00:20.000Z',
    payload: {
      ownerPeerId: 'peer-a',
      assigneePeerId: 'peer-b',
      leaseExpiresAt: '2026-07-30T00:00:25.000Z',
    },
  });
  const stale = evaluateVerifiedMeshAllocationEnvelope(
    states.a,
    verified(staleProgress, '2026-07-30T00:00:10.000Z', recoveryTime + 7)
  );
  assert.equal(stale.accepted, false);
  assert.equal(stale.code, 'execution_authority_invalid');

  const certificateForCandidate = certificateRecipients[1].envelope;
  const recoveryAward = directEnvelope(awardFixture, {
    id: messageId(380),
    sequence: 380,
    senderPeerId: 'peer-a',
    recipientPeerId: 'peer-c',
    causationId: certificateForCandidate.messageId,
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
  const awardedRecovery = evaluateMeshAllocationCommand(
    states.a,
    {
      kind: 'allocation.recovery_award',
      certificateId: 'certificate-a',
      recipient: {
        recipientPeerId: 'peer-c',
        preparedAt: recoveryTime + 8,
        envelope: recoveryAward,
      },
    },
    AWARD_AT,
    recoveryTime + 8
  );
  states.a = accepted(awardedRecovery, 'recovery award');
  assert.deepEqual(
    {
      reserved:
        states.a.objectives.objectives['objective-a'].reservedBudgetUnits,
      committed:
        states.a.objectives.objectives['objective-a'].committedBudgetUnits,
    },
    committedBeforeRecovery
  );
  states.c = accepted(
    evaluateVerifiedMeshAllocationEnvelope(
      states.c,
      verified(recoveryAward, AWARD_AT, recoveryTime + 9)
    ),
    'replacement receives recovery award'
  );

  const recoveryAcceptance = directEnvelope(acceptFixture, {
    id: messageId(390),
    sequence: 390,
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
  states.c = accepted(
    evaluateMeshAllocationCommand(
      states.c,
      {
        kind: 'allocation.assignment_response',
        awardId: 'award-recovery',
        preparedAt: recoveryTime + 10,
        envelope: recoveryAcceptance,
      },
      AWARD_AT,
      recoveryTime + 10
    ),
    'epoch two acceptance'
  );
  states.a = accepted(
    evaluateVerifiedMeshAllocationEnvelope(
      states.a,
      verified(recoveryAcceptance, AWARD_AT, recoveryTime + 10)
    ),
    'owner receives epoch two acceptance'
  );
  assert.equal(
    Object.values(states.a.allocation.assignmentFenceHeads)[0].phase,
    'active'
  );
  assert.deepEqual(
    {
      reserved:
        states.a.objectives.objectives['objective-a'].reservedBudgetUnits,
      committed:
        states.a.objectives.objectives['objective-a'].committedBudgetUnits,
    },
    committedBeforeRecovery
  );

  const resumedCheckpoint = directEnvelope(checkpointFixture, {
    id: messageId(400),
    sequence: 400,
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
  states.c = accepted(
    evaluateMeshAllocationCommand(
      states.c,
      {
        kind: 'allocation.execution',
        preparedAt: recoveryTime + 11,
        envelope: resumedCheckpoint,
      },
      '2026-07-30T00:01:43.000Z',
      recoveryTime + 11
    ),
    'resumed checkpoint'
  );
  states.a = accepted(
    evaluateVerifiedMeshAllocationEnvelope(
      states.a,
      verified(resumedCheckpoint, '2026-07-30T00:01:43.000Z', recoveryTime + 11)
    ),
    'owner receives resumed checkpoint'
  );
  assert.equal(
    states.a.allocation.executionRecords['checkpoint-recovered'].envelope
      .payload.previousCheckpointId,
    'checkpoint-a'
  );

  const tampered = structuredClone(states.a.allocation);
  tampered.recoveryCertificates['certificate-a'].takeoverProposalId =
    'missing-proposal';
  assert.throws(
    () => restoreMeshAllocationState(tampered),
    /recovery|certificate|proposal/u
  );
});
