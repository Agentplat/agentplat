import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, webcrypto as crypto } from 'node:crypto';

import {
  DEFAULT_MESH_CRYPTO_POLICY,
  createStaticMeshKeyResolver,
  signMeshEnvelope,
  verifyMeshEnvelope,
} from '@agentplat/mesh-crypto';
import {
  MESH_SIGNATURE_ALGORITHM,
  canonicalizeMeshPayload,
} from '@agentplat/mesh-protocol';
import {
  createMeshAllocationRuntimeState,
  createMeshAllocationState,
  createMeshCoordinationState,
  createMeshDiscoveryState,
  createMeshObjectiveWorkRuntimeState,
  createMeshObjectiveWorkState,
  evaluateMeshAllocationCommand,
  evaluateMeshAllocationTimer,
  evaluateVerifiedMeshAllocationEnvelope,
  evaluateVerifiedMeshObjectiveEnvelope,
  restoreMeshAllocationState,
} from '@agentplat/mesh/coordination';

const AT = '2026-07-30T00:00:01.000Z';
const RECOVERY_AT = '2026-07-30T00:01:25.000Z';
const peerIds = Object.freeze(['peer-a', 'peer-b', 'peer-c', 'peer-d']);
const identity = Object.freeze({
  tenantId: 'tenant-packed',
  meshId: 'mesh-packed',
  peerId: 'peer-b',
  instanceId: 'instance-peer-b',
  keyId: 'key-b',
});

function messageId(value) {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(12, value);
  return Buffer.from(bytes).toString('base64url');
}

function envelope({
  id,
  type,
  senderPeerId,
  audiencePeerId,
  payload,
  causationId,
  expiresAt,
}) {
  return {
    protocol: 'agentplat.mesh',
    wireVersion: 0,
    messageId: messageId(id),
    tenantId: identity.tenantId,
    meshId: identity.meshId,
    objectiveId: 'objective-packed',
    type,
    sender: { peerId: senderPeerId, instanceId: `instance-${senderPeerId}` },
    audience:
      audiencePeerId === undefined
        ? { kind: 'mesh', topic: 'objective' }
        : { kind: 'peer', peerId: audiencePeerId },
    sequence: id,
    sentAt: type.startsWith('lease.')
      ? RECOVERY_AT
      : '2026-07-30T00:00:00.000Z',
    expiresAt,
    ...(causationId === undefined ? {} : { causationId }),
    payload,
    proof: {
      algorithm: 'Ed25519',
      keyId: `key-${senderPeerId.slice(-1)}`,
      value: '',
    },
  };
}

function withPayloadHash(value) {
  const canonical = canonicalizeMeshPayload(value.payload);
  assert.equal(canonical.ok, true, 'consumer payload must canonicalize');
  return {
    ...value,
    payloadHash: `sha256:${createHash('sha256').update(canonical.value).digest('base64url')}`,
  };
}

async function signed(value, peerId, keys, resolver, verifiedAt = AT) {
  const result = await signMeshEnvelope({
    envelope: withPayloadHash(value),
    privateKey: keys[peerId].privateKey,
  });
  const verified = await verifyMeshEnvelope({
    envelope: result,
    resolver,
    policy: DEFAULT_MESH_CRYPTO_POLICY,
    verifiedAt,
  });
  assert.equal(verified.verified, true, 'consumer envelope must verify');
  return { signed: result, verified: verified.envelope };
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
    tenantId: identity.tenantId,
    meshId: identity.meshId,
    peerId,
    keyId: `key-${peerId.slice(-1)}`,
    algorithm: MESH_SIGNATURE_ALGORITHM,
    publicKey: keys[peerId].publicKey,
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2027-01-01T00:00:00.000Z',
    status: 'active',
  }))
);

let state = createMeshAllocationRuntimeState(
  createMeshCoordinationState({ identity }),
  createMeshDiscoveryState({
    identity,
    subscriptions: ['objective'],
    admittedPeers: peerIds
      .filter((peerId) => peerId !== identity.peerId)
      .map((peerId) => ({
        peerId,
        instanceIds: [`instance-${peerId}`],
        validUntil: '2027-01-01T00:00:00.000Z',
      })),
  }),
  createMeshObjectiveWorkState({
    identity,
    issuerAuthorities: [
      {
        peerId: 'peer-a',
        keyIds: ['key-a'],
        validUntil: '2027-01-01T00:00:00.000Z',
      },
    ],
  }),
  createMeshAllocationState({ identity })
);

const objective = await signed(
  envelope({
    id: 1,
    type: 'objective.announce',
    senderPeerId: 'peer-a',
    expiresAt: '2026-07-30T00:05:00.000Z',
    payload: {
      type: 'objective.announce',
      objectiveDocumentId: 'objective-document-packed',
      objectiveId: 'objective-packed',
      objectiveRevision: 1,
      issuerPeerId: 'peer-a',
      summary: 'Verify a packed allocation consumer.',
      successCriteria: ['A signed lifecycle can be verified.'],
      permittedCapabilityKeys: ['summarize'],
      maximumWorkItems: 10,
      maximumConcurrentAssignments: 2,
      maximumBudgetUnits: 1000,
      bidWindowMs: 60_000,
      acceptanceWindowMs: 30_000,
      maximumLeaseDurationMs: 3_600_000,
      recoveryGraceMs: 60_000,
      maximumLeaseRenewals: 3,
      recoveryWitnessPeerIds: ['peer-b', 'peer-c', 'peer-d'],
      recoveryWitnessThreshold: 2,
      validFrom: '2026-07-30T00:00:00.000Z',
      validUntil: '2026-08-29T00:00:00.000Z',
    },
  }),
  'peer-a',
  keys,
  resolver
);
const announced = evaluateVerifiedMeshObjectiveEnvelope(
  createMeshObjectiveWorkRuntimeState(
    state.coordination,
    state.discovery,
    state.objectives
  ),
  { envelope: objective.verified, verifiedAt: AT, receivedAt: 1 }
);
assert.equal(announced.accepted, true, announced.code);
state = createMeshAllocationRuntimeState(
  announced.state.coordination,
  announced.state.discovery,
  announced.state.objectives,
  restoreMeshAllocationState({ ...state.allocation, lastLogicalTime: 1 })
);

const offer = await signed(
  envelope({
    id: 2,
    type: 'work.offer',
    senderPeerId: 'peer-a',
    audiencePeerId: 'peer-b',
    expiresAt: '2026-07-30T00:01:00.000Z',
    payload: {
      type: 'work.offer',
      offerId: 'offer-packed',
      objectiveId: 'objective-packed',
      objectiveDocumentId: 'objective-document-packed',
      objectiveRevision: 1,
      workItemId: 'work-packed',
      workItemRevision: 1,
      ownerPeerId: 'peer-a',
      ownerEpoch: 1,
      offerAttempt: 1,
      requiredCapabilityKeys: ['summarize'],
      matchingAttributes: { language: 'en' },
      inputSummary: 'Summarize the packed consumer input.',
      completionCriteria: ['Return a summary.'],
      budgetReservationUnits: 100,
      bidDeadline: '2026-07-30T00:01:00.000Z',
      workDeadline: '2026-07-30T01:00:00.000Z',
    },
  }),
  'peer-a',
  keys,
  resolver
);
const offered = evaluateVerifiedMeshAllocationEnvelope(state, {
  envelope: offer.verified,
  verifiedAt: AT,
  receivedAt: 2,
});
assert.equal(offered.accepted, true, offered.code);
state = offered.state;

const bid = await signed(
  envelope({
    id: 3,
    type: 'work.bid',
    senderPeerId: 'peer-b',
    audiencePeerId: 'peer-a',
    causationId: offer.signed.messageId,
    expiresAt: '2026-07-30T00:00:30.000Z',
    payload: {
      type: 'work.bid',
      bidId: 'bid-packed',
      bidRevision: 1,
      offerId: 'offer-packed',
      objectiveId: 'objective-packed',
      objectiveDocumentId: 'objective-document-packed',
      objectiveRevision: 1,
      workItemId: 'work-packed',
      workItemRevision: 1,
      ownerPeerId: 'peer-a',
      ownerEpoch: 1,
      offerAttempt: 1,
      bidderPeerId: 'peer-b',
      advertisementId: 'advertisement-packed',
      capabilityId: 'capability-packed',
      capabilityRevision: 1,
      capacityReservationUnits: 1,
      budgetUnits: 100,
      bidDeadline: '2026-07-30T00:01:00.000Z',
      workDeadline: '2026-07-30T01:00:00.000Z',
      expectedCompletionAt: '2026-07-30T00:30:00.000Z',
      bidExpiresAt: '2026-07-30T00:00:30.000Z',
      assumptions: [],
    },
  }),
  'peer-b',
  keys,
  resolver
);
const bidPrepared = evaluateMeshAllocationCommand(
  state,
  {
    kind: 'allocation.bid',
    offerId: 'offer-packed',
    preparedAt: 3,
    envelope: bid.signed,
  },
  AT,
  3
);
assert.equal(bidPrepared.accepted, true, bidPrepared.code);
state = bidPrepared.state;

const award = await signed(
  envelope({
    id: 4,
    type: 'work.award',
    senderPeerId: 'peer-a',
    audiencePeerId: 'peer-b',
    causationId: bid.signed.messageId,
    expiresAt: '2026-07-30T00:00:12.000Z',
    payload: {
      type: 'work.award',
      awardId: 'award-packed',
      offerId: 'offer-packed',
      bidId: 'bid-packed',
      bidRevision: 1,
      objectiveId: 'objective-packed',
      objectiveDocumentId: 'objective-document-packed',
      objectiveRevision: 1,
      workItemId: 'work-packed',
      workItemRevision: 1,
      ownerPeerId: 'peer-a',
      ownerEpoch: 1,
      offerAttempt: 1,
      assigneePeerId: 'peer-b',
      assignmentEpoch: 1,
      authorityKind: 'award',
      assignmentAuthorityId: 'award-packed',
      fencingToken: 'award-packed',
      budgetReservationUnits: 100,
      workDeadline: '2026-07-30T01:00:00.000Z',
      leaseStartsAt: '2026-07-30T00:00:00.000Z',
      leaseExpiresAt: '2026-07-30T00:00:25.000Z',
      acceptanceDeadline: '2026-07-30T00:00:15.000Z',
    },
  }),
  'peer-a',
  keys,
  resolver
);
const awarded = evaluateVerifiedMeshAllocationEnvelope(state, {
  envelope: award.verified,
  verifiedAt: AT,
  receivedAt: 4,
});
assert.equal(awarded.accepted, true, awarded.code);
state = awarded.state;

const acceptance = await signed(
  envelope({
    id: 5,
    type: 'work.accept',
    senderPeerId: 'peer-b',
    audiencePeerId: 'peer-a',
    causationId: award.signed.messageId,
    expiresAt: '2026-07-30T00:00:12.000Z',
    payload: {
      type: 'work.accept',
      acceptanceId: 'acceptance-packed',
      awardId: 'award-packed',
      objectiveId: 'objective-packed',
      objectiveDocumentId: 'objective-document-packed',
      objectiveRevision: 1,
      workItemId: 'work-packed',
      workItemRevision: 1,
      ownerPeerId: 'peer-a',
      ownerEpoch: 1,
      assigneePeerId: 'peer-b',
      assignmentEpoch: 1,
      assignmentAuthorityId: 'award-packed',
      fencingToken: 'award-packed',
      acceptanceDeadline: '2026-07-30T00:00:15.000Z',
    },
  }),
  'peer-b',
  keys,
  resolver
);
const accepted = evaluateMeshAllocationCommand(
  state,
  {
    kind: 'allocation.assignment_response',
    awardId: 'award-packed',
    preparedAt: 5,
    envelope: acceptance.signed,
  },
  AT,
  5
);
assert.equal(accepted.accepted, true, accepted.code);
state = accepted.state;

const leaseTimer = Object.values(state.coordination.timers).find(
  (timer) => timer.kind === 'lease.expiry'
);
assert.ok(leaseTimer, 'acceptance must materialize a lease expiry timer');
const expired = evaluateMeshAllocationTimer(
  state,
  {
    kind: 'timer.fired',
    timerId: leaseTimer.timerId,
    generation: leaseTimer.generation,
  },
  leaseTimer.dueAt
);
assert.equal(expired.accepted, true, expired.code);
state = expired.state;
const recoveryLogicalTime = leaseTimer.dueAt + 60_000;

const proposal = await signed(
  envelope({
    id: 6,
    type: 'lease.takeover_proposal',
    senderPeerId: 'peer-c',
    audiencePeerId: 'peer-b',
    causationId: acceptance.signed.messageId,
    expiresAt: '2026-07-30T00:02:25.000Z',
    payload: {
      type: 'lease.takeover_proposal',
      takeoverProposalId: 'takeover-packed',
      proposalAuthority: 'candidate',
      proposerPeerId: 'peer-c',
      proposedAssigneePeerId: 'peer-c',
      proposedAssignmentEpoch: 2,
      objectiveId: 'objective-packed',
      objectiveDocumentId: 'objective-document-packed',
      objectiveRevision: 1,
      workItemId: 'work-packed',
      workItemRevision: 1,
      ownerPeerId: 'peer-a',
      ownerEpoch: 1,
      assigneePeerId: 'peer-b',
      awardId: 'award-packed',
      acceptanceId: 'acceptance-packed',
      assignmentEpoch: 1,
      assignmentAuthorityId: 'award-packed',
      fencingToken: 'award-packed',
      leaseExpiresAt: '2026-07-30T00:00:25.000Z',
      leaseRenewalSequence: 0,
    },
  }),
  'peer-c',
  keys,
  resolver,
  RECOVERY_AT
);
const proposed = evaluateVerifiedMeshAllocationEnvelope(state, {
  envelope: proposal.verified,
  verifiedAt: RECOVERY_AT,
  receivedAt: recoveryLogicalTime,
});
assert.equal(proposed.accepted, true, proposed.code);
state = proposed.state;

const localVoteRecipients = await Promise.all(
  [
    [7, 'peer-a'],
    [8, 'peer-c'],
    [9, 'peer-d'],
  ].map(async ([id, recipientPeerId]) => ({
    recipientPeerId,
    preparedAt: recoveryLogicalTime + 7,
    envelope: (
      await signed(
        envelope({
          id,
          type: 'lease.vote',
          senderPeerId: 'peer-b',
          audiencePeerId: recipientPeerId,
          causationId: proposal.signed.messageId,
          expiresAt: '2026-07-30T00:02:25.000Z',
          payload: {
            type: 'lease.vote',
            leaseVoteId: 'vote-packed-peer-b',
            takeoverProposalId: 'takeover-packed',
            witnessPeerId: 'peer-b',
            objectiveId: 'objective-packed',
          },
        }),
        'peer-b',
        keys,
        resolver,
        RECOVERY_AT
      )
    ).signed,
  }))
);
const locallyVoted = evaluateMeshAllocationCommand(
  state,
  { kind: 'allocation.recovery', recipients: localVoteRecipients },
  RECOVERY_AT,
  recoveryLogicalTime + 7
);
assert.equal(locallyVoted.accepted, true, locallyVoted.code);
state = locallyVoted.state;

const remoteVote = await signed(
  envelope({
    id: 10,
    type: 'lease.vote',
    senderPeerId: 'peer-d',
    audiencePeerId: 'peer-b',
    causationId: proposal.signed.messageId,
    expiresAt: '2026-07-30T00:02:25.000Z',
    payload: {
      type: 'lease.vote',
      leaseVoteId: 'vote-packed-peer-d',
      takeoverProposalId: 'takeover-packed',
      witnessPeerId: 'peer-d',
      objectiveId: 'objective-packed',
    },
  }),
  'peer-d',
  keys,
  resolver,
  RECOVERY_AT
);
const remotelyVoted = evaluateVerifiedMeshAllocationEnvelope(state, {
  envelope: remoteVote.verified,
  verifiedAt: RECOVERY_AT,
  receivedAt: recoveryLogicalTime + 8,
});
assert.equal(remotelyVoted.accepted, true, remotelyVoted.code);
state = remotelyVoted.state;

const certificate = await signed(
  envelope({
    id: 11,
    type: 'lease.certificate',
    senderPeerId: 'peer-c',
    audiencePeerId: 'peer-b',
    causationId: proposal.signed.messageId,
    expiresAt: '2026-07-30T00:02:25.000Z',
    payload: {
      type: 'lease.certificate',
      certificateId: 'certificate-packed',
      certificateAssemblerPeerId: 'peer-c',
      takeoverProposalId: 'takeover-packed',
      leaseVoteIds: ['vote-packed-peer-b', 'vote-packed-peer-d'],
      objectiveId: 'objective-packed',
    },
  }),
  'peer-c',
  keys,
  resolver,
  RECOVERY_AT
);
const certified = evaluateVerifiedMeshAllocationEnvelope(state, {
  envelope: certificate.verified,
  verifiedAt: RECOVERY_AT,
  receivedAt: recoveryLogicalTime + 10,
});
assert.equal(certified.accepted, true, certified.code);
state = certified.state;
const fence = Object.values(state.allocation.assignmentFenceHeads).at(0);
assert.equal(fence?.assignmentEpoch, 2);
assert.equal(fence?.fencingToken, 'certificate-packed');

const staleProgress = await signed(
  envelope({
    id: 12,
    type: 'work.progress',
    senderPeerId: 'peer-b',
    audiencePeerId: 'peer-a',
    causationId: acceptance.signed.messageId,
    expiresAt: '2026-07-30T00:00:12.000Z',
    payload: {
      type: 'work.progress',
      progressId: 'stale-progress-packed',
      progressSequence: 1,
      objectiveId: 'objective-packed',
      objectiveDocumentId: 'objective-document-packed',
      objectiveRevision: 1,
      workItemId: 'work-packed',
      workItemRevision: 1,
      ownerPeerId: 'peer-a',
      ownerEpoch: 1,
      assigneePeerId: 'peer-b',
      awardId: 'award-packed',
      acceptanceId: 'acceptance-packed',
      assignmentEpoch: 1,
      assignmentAuthorityId: 'award-packed',
      fencingToken: 'award-packed',
      leaseExpiresAt: '2026-07-30T00:00:25.000Z',
      progressSummary: 'This stale authority must be fenced.',
    },
  }),
  'peer-b',
  keys,
  resolver
);
const stale = evaluateMeshAllocationCommand(
  state,
  {
    kind: 'allocation.execution',
    preparedAt: recoveryLogicalTime + 11,
    envelope: staleProgress.signed,
  },
  AT,
  recoveryLogicalTime + 11
);
assert.equal(stale.accepted, false);
assert.equal(stale.code, 'execution_authority_invalid');

console.log(
  JSON.stringify({
    assignment: 'offer-bid-award-accept',
    recoveryEpoch: fence.assignmentEpoch,
    staleAuthorityRejected: stale.code,
  })
);
