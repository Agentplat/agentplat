import {
  DEFAULT_MESH_CRYPTO_POLICY,
  StaticMeshKeyResolver,
  WebCryptoMeshEnvelopeSigner,
  WebCryptoMeshEnvelopeVerifier,
  computeMeshPayloadHash,
  createStaticMeshKeyResolver,
  createWebCryptoMeshEnvelopeSigner,
  createWebCryptoMeshEnvelopeVerifier,
  exportMeshEd25519PublicKey,
  importMeshEd25519PublicKey,
  signMeshEnvelope,
  verifyMeshEnvelope,
  type MeshCryptoPolicy,
  type MeshEnvelopeSigner,
  type MeshKeyRecord,
  type MeshKeyResolver,
  type MeshVerifyRequest,
} from '@agentplat/mesh-crypto';
import {
  ALLOW_PREPROVISIONED_MESH_ADMISSION,
  createMeshPeerState,
  processMeshEnvelope,
  reduceMeshPeer,
  type MeshAdmissionPolicy,
  type MeshPeerReducer,
  type MeshPeerState,
} from '@agentplat/mesh';
import {
  createMeshLoopbackTransport,
  type MeshLoopbackTransport,
} from '@agentplat/mesh/loopback';
import {
  DEFAULT_MESH_COORDINATION_INBOUND_LIMITS,
  DEFAULT_MESH_COORDINATION_LIMITS,
  DEFAULT_MESH_DISCOVERY_LIMITS,
  DEFAULT_MESH_OBJECTIVE_WORK_LIMITS,
  advanceMeshDiscoveryState,
  createMeshCoordinationState,
  createMeshCoordinationInboundState,
  createMeshDiscoveryInboundProcessor,
  createMeshObjectiveInboundProcessor,
  createMeshCoordinationTopicDriver,
  createMeshCoordinationObjectiveTopicDriver,
  createMeshDiscoveryInboundRuntimeState,
  createMeshObjectiveInboundRuntimeState,
  createMeshDiscoveryRuntimeState,
  createMeshDiscoveryState,
  createMeshObjectiveWorkRuntimeState,
  createMeshObjectiveWorkState,
  evaluateMeshCoordinationTimer,
  evaluateMeshObjectiveWorkCommand,
  evaluateMeshObjectiveWorkTimer,
  evaluateVerifiedMeshDiscoveryEnvelope,
  evaluateVerifiedMeshObjectiveEnvelope,
  matchMeshDiscoveryCapabilities,
  restoreMeshCoordinationInboundState,
  restoreMeshCoordinationState,
  restoreMeshDiscoveryState,
  restoreMeshObjectiveWorkState,
  selectMeshDiscoveryTopicRecipients,
  type MeshCapabilityMatchResult,
  type MeshCapabilityRequirement,
  type MeshCoordinationInboundState,
  type MeshCoordinationState,
  type MeshCoordinationTimerFiredInput,
  type MeshDiscoveryRuntimeState,
  type MeshDiscoveryInboundDecision,
  type MeshDiscoveryInboundProcessor,
  type MeshDiscoveryInboundProcessorOptions,
  type MeshDiscoveryInboundRequest,
  type MeshDiscoveryInboundRuntimeState,
  type MeshDiscoveryPayload,
  type MeshDiscoveryState,
  type MeshVerifiedDiscoveryRequest,
  type MeshCoordinationTopicClock,
  type MeshCoordinationTopicConfiguration,
  type MeshCoordinationTopicDriver,
  type MeshCoordinationTopicDriverOptions,
  type MeshCoordinationTopicPeer,
  type MeshCoordinationTopicReceipt,
  type MeshCoordinationObjectiveTopicClock,
  type MeshCoordinationObjectiveTopicConfiguration,
  type MeshCoordinationObjectiveTopicDriver,
  type MeshCoordinationObjectiveTopicDriverOptions,
  type MeshCoordinationObjectiveTopicPeer,
  type MeshCoordinationObjectiveTopicReceipt,
  type MeshObjectiveInboundDecision,
  type MeshObjectiveInboundProcessor,
  type MeshObjectiveInboundProcessorOptions,
  type MeshObjectiveInboundRequest,
  type MeshObjectiveInboundRuntimeState,
  type MeshObjectiveWorkRuntimeState,
  type MeshObjectiveWorkCommand,
  type MeshObjectiveWorkDecision,
  type MeshObjectiveWorkRejectionCode,
  type MeshObjectiveWorkState,
  type MeshObjectiveWorkTimerDecision,
  type MeshObjectiveWorkTimerInput,
  type MeshObjectiveWorkTrustedTime,
  type MeshVerifiedObjectiveRequest,
  type MeshWorkObjectivePolicySnapshot,
  type MeshWorkItemProjection,
} from '@agentplat/mesh/coordination';
import {
  createMeshSimulationKernel,
  replayMeshSimulation,
  runMeshSimulation,
  THREE_PEER_SCENARIO_IDS,
  type MeshSimulationConfig,
  type MeshSimulationInvariant,
  type MeshSimulationKernel,
} from '@agentplat/mesh-sim';
import type { MeshSimulationEventInput } from '@agentplat/mesh-sim';
import {
  canonicalizeMeshJson,
  canonicalizeMeshJsonBytes,
  canonicalizeMeshPayload,
  canonicalizeMeshSigningDocument,
  compareMeshTimestamps,
  createMeshSigningDocument,
  DEFAULT_MESH_PROTOCOL_LIMITS,
  MESH_PROTOCOL,
  MESH_SIGNATURE_ALGORITHM,
  MESH_WIRE_VERSION,
  parseMeshJson,
  parseSignedMeshEnvelope,
  validateMeshEnvelopeContext,
  validateSignedMeshEnvelope,
  type LeaseRenewPayload,
  type LeaseTakeoverProposalPayload,
  type LeaseVotePayload,
  type LeaseCertificatePayload,
  type MeshEnvelopeContext,
  type MeshMessagePayload,
  type MeshProtocolResult,
  type PeerCardPayload,
  type PeerGoodbyePayload,
  type PeerHelloPayload,
  type CapabilityAdvertisePayload,
  type CapabilityWithdrawPayload,
  type ObjectiveAnnouncePayload,
  type ObjectiveCancelPayload,
  type ObjectiveRevisePayload,
  type WorkBidPayload,
  type WorkAwardPayload,
  type WorkAcceptPayload,
  type WorkAssignmentAuthorityFields,
  type WorkCancelPayload,
  type WorkExecutionAuthorityFields,
  type WorkDeclinePayload,
  type WorkOfferPayload,
  type WorkProgressPayload,
  type WorkCheckpointPayload,
  type WorkResultPayload,
  type WorkReleasePayload,
  type SignedMeshEnvelope,
  type UnsignedMeshEnvelope,
} from '@agentplat/mesh-protocol';

// This file is compiled, not executed. It freezes the direct-package Alpha 1
// surface without re-exporting preview Mesh contracts from Framework. Progress,
// Checkpoint, Result and Lease Renewal assertions are added with their public
// payload contracts; their recipient and authority rules remain stateful.
const helloPayload: PeerHelloPayload = {
  type: 'peer.hello',
  peerCardId: 'card-a',
  cardRevision: 1,
};

const peerCardPayload: PeerCardPayload = {
  type: 'peer.card',
  peerCardId: 'card-a',
  cardRevision: 1,
  subjectPeerId: 'peer-a',
  instanceId: 'instance-a',
  protocolVersions: [0],
  transportHints: ['https://peer-a.example.test/mesh'],
  capabilityIds: ['capability-a'],
  validFrom: '2026-07-30T00:00:00.000Z',
  validUntil: '2026-07-30T00:02:00.000Z',
};

const peerGoodbyePayload: PeerGoodbyePayload = {
  type: 'peer.goodbye',
  peerCardId: 'card-a',
  cardRevision: 1,
  instanceId: 'instance-a',
};

const capabilityAdvertisePayload: CapabilityAdvertisePayload = {
  type: 'capability.advertise',
  advertisementId: 'advertisement-a',
  capabilityId: 'capability-a',
  capabilityRevision: 1,
  ownerPeerId: 'peer-a',
  capabilityKey: 'summarize',
  version: 'v1',
  inputMediaTypes: ['text/plain'],
  outputMediaTypes: ['text/plain'],
  attributes: { language: 'en' },
  validFrom: '2026-07-30T00:00:00.000Z',
  validUntil: '2026-07-30T00:02:00.000Z',
  maximumConcurrency: 1,
  maximumPayloadBytes: 1024,
};

const capabilityWithdrawPayload: CapabilityWithdrawPayload = {
  type: 'capability.withdraw',
  capabilityId: 'capability-a',
  capabilityRevision: 1,
  advertisementId: 'advertisement-a',
};

const objectiveAnnouncePayload: ObjectiveAnnouncePayload = {
  type: 'objective.announce',
  objectiveDocumentId: 'objective-document-a',
  objectiveId: 'objective-a',
  objectiveRevision: 1,
  issuerPeerId: 'peer-a',
  summary: 'Summarize the approved material.',
  successCriteria: ['A concise summary is produced.'],
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
};

const objectiveRevisePayload: ObjectiveRevisePayload = {
  ...objectiveAnnouncePayload,
  type: 'objective.revise',
  objectiveDocumentId: 'objective-document-b',
  objectiveRevision: 2,
  previousObjectiveDocumentId: 'objective-document-a',
};

const objectiveCancelPayload: ObjectiveCancelPayload = {
  type: 'objective.cancel',
  cancellationId: 'cancellation-a',
  objectiveId: 'objective-a',
  objectiveRevision: 2,
  objectiveDocumentId: 'objective-document-b',
};

const workOfferPayload: WorkOfferPayload = {
  type: 'work.offer',
  offerId: 'offer-a',
  objectiveId: 'objective-a',
  objectiveDocumentId: 'objective-document-a',
  objectiveRevision: 1,
  workItemId: 'work-item-a',
  workItemRevision: 1,
  ownerPeerId: 'peer-a',
  ownerEpoch: 1,
  offerAttempt: 1,
  requiredCapabilityKeys: ['summarize'],
  matchingAttributes: { language: 'en' },
  inputSummary: 'Summarize the approved material.',
  completionCriteria: ['Return a concise summary.'],
  budgetReservationUnits: 100,
  bidDeadline: '2026-07-30T00:01:00.000Z',
  workDeadline: '2026-07-30T01:00:00.000Z',
};

const workBidPayload: WorkBidPayload = {
  type: 'work.bid',
  bidId: 'bid-a',
  bidRevision: 1,
  offerId: 'offer-a',
  objectiveId: 'objective-a',
  objectiveDocumentId: 'objective-document-a',
  objectiveRevision: 1,
  workItemId: 'work-item-a',
  workItemRevision: 1,
  ownerPeerId: 'peer-b',
  ownerEpoch: 1,
  offerAttempt: 1,
  bidderPeerId: 'peer-a',
  advertisementId: 'advertisement-a',
  capabilityId: 'capability-a',
  capabilityRevision: 1,
  capacityReservationUnits: 1,
  budgetUnits: 100,
  bidDeadline: '2026-07-30T00:01:00.000Z',
  workDeadline: '2026-07-30T01:00:00.000Z',
  expectedCompletionAt: '2026-07-30T00:30:00.000Z',
  bidExpiresAt: '2026-07-30T00:00:30.000Z',
  assumptions: ['Input is accessible to the assigned peer.'],
};

const workAwardPayload: WorkAwardPayload = {
  type: 'work.award',
  awardId: 'award-a',
  offerId: 'offer-a',
  bidId: 'bid-a',
  bidRevision: 1,
  objectiveId: 'objective-a',
  objectiveDocumentId: 'objective-document-a',
  objectiveRevision: 1,
  workItemId: 'work-item-a',
  workItemRevision: 1,
  ownerPeerId: 'peer-b',
  ownerEpoch: 1,
  offerAttempt: 1,
  assigneePeerId: 'peer-a',
  assignmentEpoch: 1,
  authorityKind: 'award',
  assignmentAuthorityId: 'award-a',
  fencingToken: 'award-a',
  budgetReservationUnits: 100,
  workDeadline: '2026-07-30T01:00:00.000Z',
  leaseStartsAt: '2026-07-30T00:00:00.000Z',
  leaseExpiresAt: '2026-07-30T00:30:00.000Z',
  acceptanceDeadline: '2026-07-30T00:15:00.000Z',
};

const workAcceptPayload: WorkAcceptPayload = {
  type: 'work.accept',
  acceptanceId: 'acceptance-a',
  awardId: 'award-a',
  objectiveId: 'objective-a',
  objectiveDocumentId: 'objective-document-a',
  objectiveRevision: 1,
  workItemId: 'work-item-a',
  workItemRevision: 1,
  ownerPeerId: 'peer-b',
  ownerEpoch: 1,
  assigneePeerId: 'peer-a',
  assignmentEpoch: 1,
  assignmentAuthorityId: 'award-a',
  fencingToken: 'award-a',
  acceptanceDeadline: '2026-07-30T00:15:00.000Z',
};

const workDeclinePayload: WorkDeclinePayload = {
  type: 'work.decline',
  declineId: 'decline-a',
  awardId: 'award-a',
  objectiveId: 'objective-a',
  objectiveDocumentId: 'objective-document-a',
  objectiveRevision: 1,
  workItemId: 'work-item-a',
  workItemRevision: 1,
  ownerPeerId: 'peer-b',
  ownerEpoch: 1,
  assigneePeerId: 'peer-a',
  assignmentEpoch: 1,
  assignmentAuthorityId: 'award-a',
  fencingToken: 'award-a',
  acceptanceDeadline: '2026-07-30T00:15:00.000Z',
};

const workAssignmentAuthorityFields: WorkAssignmentAuthorityFields = {
  objectiveId: 'objective-a',
  objectiveDocumentId: 'objective-document-a',
  objectiveRevision: 1,
  workItemId: 'work-item-a',
  workItemRevision: 1,
  ownerPeerId: 'peer-b',
  ownerEpoch: 1,
  assigneePeerId: 'peer-a',
  awardId: 'award-a',
  assignmentEpoch: 1,
  assignmentAuthorityId: 'award-a',
  fencingToken: 'award-a',
  leaseExpiresAt: '2026-07-30T00:30:00.000Z',
};

const workExecutionAuthorityFields: WorkExecutionAuthorityFields = {
  ...workAssignmentAuthorityFields,
  acceptanceId: 'acceptance-a',
};

const workReleasePayload: WorkReleasePayload = {
  type: 'work.release',
  releaseId: 'release-a',
  releaseAuthority: 'assignee',
  releaseDisposition: 'reoffer',
  ...workExecutionAuthorityFields,
};

const workCancelPendingPayload: WorkCancelPayload = {
  type: 'work.cancel',
  cancellationId: 'work-cancellation-pending-a',
  assignmentState: 'award_pending',
  ...workAssignmentAuthorityFields,
};

const workCancelActivePayload: WorkCancelPayload = {
  type: 'work.cancel',
  cancellationId: 'work-cancellation-active-a',
  assignmentState: 'active',
  ...workExecutionAuthorityFields,
};
const leaseRenewPayload: LeaseRenewPayload = {
  type: 'lease.renew',
  leaseRenewalId: 'lease-renewal-a',
  leaseRenewalSequence: 1,
  renewedLeaseExpiresAt: '2026-07-30T01:00:00.000Z',
  ...workExecutionAuthorityFields,
};
const invalidLeaseRenewSequence: LeaseRenewPayload = {
  ...leaseRenewPayload,
  // @ts-expect-error renewal sequence is a numeric scalar
  leaseRenewalSequence: '1',
};
const invalidLeaseRenewType: LeaseRenewPayload = {
  ...leaseRenewPayload,
  // @ts-expect-error lease renewal has one closed message type
  type: 'work.release',
};
const leaseTakeoverProposalPayload: LeaseTakeoverProposalPayload = {
  type: 'lease.takeover_proposal',
  takeoverProposalId: 'takeover-proposal-a',
  proposalAuthority: 'witness',
  proposerPeerId: 'peer-b',
  proposedAssigneePeerId: 'peer-c',
  proposedAssignmentEpoch: 2,
  leaseRenewalSequence: 1,
  latestLeaseRenewalId: 'lease-renewal-a',
  ...workExecutionAuthorityFields,
};
const invalidTakeoverProposalAuthority: LeaseTakeoverProposalPayload = {
  ...leaseTakeoverProposalPayload,
  // @ts-expect-error proposal authority is a closed discriminant
  proposalAuthority: 'owner',
};
const invalidTakeoverProposalEpoch: LeaseTakeoverProposalPayload = {
  ...leaseTakeoverProposalPayload,
  // @ts-expect-error proposed epoch is a numeric scalar
  proposedAssignmentEpoch: '2',
};
const leaseVotePayload: LeaseVotePayload = {
  type: 'lease.vote',
  leaseVoteId: 'lease-vote-a',
  takeoverProposalId: 'takeover-proposal-a',
  witnessPeerId: 'peer-c',
  objectiveId: 'objective-a',
};
const invalidLeaseVoteId: LeaseVotePayload = {
  ...leaseVotePayload,
  // @ts-expect-error lease vote identifiers are strings
  leaseVoteId: 1,
};
const invalidLeaseVoteType: LeaseVotePayload = {
  ...leaseVotePayload,
  // @ts-expect-error lease votes have one closed message type
  type: 'lease.certificate',
};
const leaseCertificatePayload: LeaseCertificatePayload = {
  type: 'lease.certificate',
  certificateId: 'certificate-a',
  certificateAssemblerPeerId: 'peer-b',
  takeoverProposalId: 'takeover-proposal-a',
  leaseVoteIds: ['lease-vote-a', 'lease-vote-b'],
  objectiveId: 'objective-a',
};
const invalidLeaseCertificateId: LeaseCertificatePayload = {
  ...leaseCertificatePayload,
  // @ts-expect-error lease certificate identifiers are strings
  certificateId: 1,
};
const invalidLeaseCertificateType: LeaseCertificatePayload = {
  ...leaseCertificatePayload,
  // @ts-expect-error lease certificates have one closed message type
  type: 'lease.vote',
};
// @ts-expect-error pending cancellation cannot name an acceptance
const invalidWorkCancelPending: WorkCancelPayload = {
  ...workCancelPendingPayload,
  acceptanceId: 'acceptance-a',
};
// @ts-expect-error active cancellation requires an accepted assignment
const invalidWorkCancelActive: WorkCancelPayload = {
  type: 'work.cancel',
  cancellationId: 'work-cancellation-invalid-a',
  assignmentState: 'active',
  ...workAssignmentAuthorityFields,
};
const invalidWorkReleaseAuthority: WorkReleasePayload = {
  ...workReleasePayload,
  // @ts-expect-error release authority is a closed discriminant
  releaseAuthority: 'other',
};

const workProgressPayload: WorkProgressPayload = {
  type: 'work.progress',
  progressId: 'progress-a',
  progressSequence: 1,
  objectiveId: 'objective-a',
  objectiveDocumentId: 'objective-document-a',
  objectiveRevision: 1,
  workItemId: 'work-item-a',
  workItemRevision: 1,
  ownerPeerId: 'peer-b',
  ownerEpoch: 1,
  assigneePeerId: 'peer-a',
  awardId: 'award-a',
  acceptanceId: 'acceptance-a',
  assignmentEpoch: 1,
  assignmentAuthorityId: 'award-a',
  fencingToken: 'award-a',
  leaseExpiresAt: '2026-07-30T00:30:00.000Z',
  progressSummary: 'The assigned peer has started the summary.',
};
const workExecutionAuthority: WorkExecutionAuthorityFields =
  workProgressPayload;

const workCheckpointPayload: WorkCheckpointPayload = {
  type: 'work.checkpoint',
  checkpointId: 'checkpoint-a',
  checkpointSequence: 1,
  checkpointDigest: 'sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  objectiveId: 'objective-a',
  objectiveDocumentId: 'objective-document-a',
  objectiveRevision: 1,
  workItemId: 'work-item-a',
  workItemRevision: 1,
  ownerPeerId: 'peer-b',
  ownerEpoch: 1,
  assigneePeerId: 'peer-a',
  awardId: 'award-a',
  acceptanceId: 'acceptance-a',
  assignmentEpoch: 1,
  assignmentAuthorityId: 'award-a',
  fencingToken: 'award-a',
  leaseExpiresAt: '2026-07-30T00:30:00.000Z',
  checkpointSummary: 'Source selection is complete.',
};

const workResultPayload: WorkResultPayload = {
  type: 'work.result',
  resultId: 'result-a',
  resultDigest: 'sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  objectiveId: 'objective-a',
  objectiveDocumentId: 'objective-document-a',
  objectiveRevision: 1,
  workItemId: 'work-item-a',
  workItemRevision: 1,
  ownerPeerId: 'peer-b',
  ownerEpoch: 1,
  assigneePeerId: 'peer-a',
  awardId: 'award-a',
  acceptanceId: 'acceptance-a',
  assignmentEpoch: 1,
  assignmentAuthorityId: 'award-a',
  fencingToken: 'award-a',
  leaseExpiresAt: '2026-07-30T00:30:00.000Z',
  resultSummary: 'A concise summary was produced.',
};
// @ts-expect-error checkpoints carry exactly one content representation
const invalidWorkCheckpointContent: WorkCheckpointPayload = {
  ...workCheckpointPayload,
  checkpointReference: 'reference-a',
};
// @ts-expect-error results carry exactly one content representation
const invalidWorkResultContent: WorkResultPayload = {
  ...workResultPayload,
  resultReference: 'reference-a',
};
const invalidWorkAwardKind: WorkAwardPayload = {
  ...workAwardPayload,
  // @ts-expect-error award authority has a closed discriminant
  authorityKind: 'certificate',
};
// @ts-expect-error Accept requires its stable response ID
const incompleteWorkAccept: WorkAcceptPayload = { type: 'work.accept' };

const invalidPeerCardType: PeerCardPayload = {
  ...peerCardPayload,
  // @ts-expect-error closed discriminant rejects another payload family
  type: 'peer.ping',
};
// @ts-expect-error peer goodbye must name its Peer Card
const incompletePeerGoodbye: PeerGoodbyePayload = {
  type: 'peer.goodbye',
  cardRevision: 1,
  instanceId: 'instance-a',
};
const invalidCapabilityRevision: CapabilityAdvertisePayload = {
  ...capabilityAdvertisePayload,
  // @ts-expect-error capability revisions are numeric scalars
  capabilityRevision: '1',
};
const invalidObjectiveRevision: ObjectiveAnnouncePayload = {
  ...objectiveAnnouncePayload,
  // @ts-expect-error objective revisions are numeric scalars
  objectiveRevision: '1',
};
// @ts-expect-error Work Offers carry exactly one input representation
const invalidWorkOfferBothInput: WorkOfferPayload = {
  ...workOfferPayload,
  inputReference: 'content-a',
};
const { inputSummary: _offerInputSummary, ...workOfferWithoutInput } =
  workOfferPayload;
// @ts-expect-error Work Offers require one input representation
const invalidWorkOfferWithoutInput: WorkOfferPayload = workOfferWithoutInput;
const invalidBidRevision: WorkBidPayload = {
  ...workBidPayload,
  // @ts-expect-error bid revisions are numeric scalars
  bidRevision: '1',
};
// @ts-expect-error revisions require their predecessor document ID
const incompleteObjectiveRevise: ObjectiveRevisePayload = {
  ...objectiveAnnouncePayload,
  type: 'objective.revise',
};
// @ts-expect-error Objective documents carry exactly one content representation
const invalidObjectiveAnnounceBothContent: ObjectiveAnnouncePayload = {
  ...objectiveAnnouncePayload,
  contentReference: 'content-a',
};
const { summary: _announceSummary, ...objectiveAnnounceWithoutContent } =
  objectiveAnnouncePayload;
// @ts-expect-error Objective documents require one content representation
const invalidObjectiveAnnounceWithoutContent: ObjectiveAnnouncePayload =
  objectiveAnnounceWithoutContent;
// @ts-expect-error Objective documents carry exactly one content representation
const invalidObjectiveReviseBothContent: ObjectiveRevisePayload = {
  ...objectiveRevisePayload,
  contentReference: 'content-b',
};
const { summary: _reviseSummary, ...objectiveReviseWithoutContent } =
  objectiveRevisePayload;
// @ts-expect-error Objective documents require one content representation
const invalidObjectiveReviseWithoutContent: ObjectiveRevisePayload =
  objectiveReviseWithoutContent;
// @ts-expect-error withdrawal requires the accepted advertisement identifier
const incompleteCapabilityWithdraw: CapabilityWithdrawPayload = {
  type: 'capability.withdraw',
  capabilityId: 'capability-a',
  capabilityRevision: 1,
};

function implementedPayloadType(payload: MeshMessagePayload): string {
  switch (payload.type) {
    case 'peer.hello':
    case 'peer.card':
    case 'peer.ping':
    case 'peer.ping_ack':
    case 'peer.goodbye':
    case 'capability.advertise':
    case 'capability.withdraw':
    case 'objective.announce':
    case 'objective.revise':
    case 'objective.cancel':
    case 'work.offer':
    case 'work.bid':
    case 'work.award':
    case 'work.accept':
    case 'work.decline':
    case 'work.progress':
    case 'work.checkpoint':
    case 'work.result':
    case 'work.release':
    case 'work.cancel':
    case 'lease.renew':
    case 'lease.takeover_proposal':
    case 'lease.vote':
    case 'lease.certificate':
      return payload.type;
    default: {
      const exhaustive: never = payload;
      return exhaustive;
    }
  }
}

const unsignedHello: UnsignedMeshEnvelope<PeerHelloPayload> = {
  protocol: MESH_PROTOCOL,
  wireVersion: MESH_WIRE_VERSION,
  messageId: 'AAAAAAAAAAAAAAAAAAAAAA',
  tenantId: 'tenant-a',
  meshId: 'mesh-a',
  type: 'peer.hello',
  sender: {
    peerId: 'peer-a',
    instanceId: 'instance-a',
  },
  audience: {
    kind: 'peer',
    peerId: 'peer-b',
  },
  sequence: 1,
  sentAt: '2026-07-29T00:00:00.000Z',
  expiresAt: '2026-07-29T00:02:00.000Z',
  payload: helloPayload,
  proof: {
    algorithm: MESH_SIGNATURE_ALGORITHM,
    keyId: 'key-a',
  },
};

const peerState: MeshPeerState = createMeshPeerState({
  identity: {
    tenantId: 'tenant-a',
    meshId: 'mesh-a',
    peerId: 'peer-a',
    instanceId: 'instance-a',
    keyId: 'key-a',
  },
  admittedPeers: [
    {
      peerId: 'peer-b',
      instanceIds: ['instance-b'],
      peerCardId: 'card-b',
      acceptedCardMessageId: 'BBBBBBBBBBBBBBBBBBBBBA',
      cardRevision: 1,
      validUntil: '2027-01-01T00:00:00Z',
    },
  ],
});

const coordinationState: MeshCoordinationState = createMeshCoordinationState({
  identity: peerState.identity,
  limits: DEFAULT_MESH_COORDINATION_LIMITS,
});
const restoredCoordinationState: MeshCoordinationState =
  restoreMeshCoordinationState(coordinationState);
const coordinationTimerInput: MeshCoordinationTimerFiredInput = {
  kind: 'timer.fired',
  timerId: 'objective:objective-a:expiry',
  generation: 1,
};
const coordinationTimerDecision = evaluateMeshCoordinationTimer(
  restoredCoordinationState,
  coordinationTimerInput,
  1
);

void coordinationTimerDecision;

const discoveryState: MeshDiscoveryState = createMeshDiscoveryState({
  identity: peerState.identity,
  admittedPeers: [],
  subscriptions: ['capability', 'membership'],
  limits: DEFAULT_MESH_DISCOVERY_LIMITS,
});
const restoredDiscoveryState: MeshDiscoveryState =
  restoreMeshDiscoveryState(discoveryState);
const objectiveWorkState: MeshObjectiveWorkState = createMeshObjectiveWorkState(
  {
    identity: peerState.identity,
    issuerAuthorities: [
      {
        peerId: 'peer-a',
        keyIds: ['key-a'],
        validUntil: '2027-01-01T00:00:00Z',
      },
    ],
    limits: DEFAULT_MESH_OBJECTIVE_WORK_LIMITS,
  }
);
const restoredObjectiveWorkState: MeshObjectiveWorkState =
  restoreMeshObjectiveWorkState(objectiveWorkState);
const objectivePolicyHistory: Readonly<
  Record<string, MeshWorkObjectivePolicySnapshot>
> = restoredObjectiveWorkState.objectivePolicies;
const maximumObjectivePolicies: number =
  DEFAULT_MESH_OBJECTIVE_WORK_LIMITS.maximumObjectivePolicies;
const objectiveDiscoveryState = createMeshDiscoveryState({
  identity: peerState.identity,
  admittedPeers: [],
  subscriptions: ['objective'],
});
const objectiveWorkRuntime: MeshObjectiveWorkRuntimeState =
  createMeshObjectiveWorkRuntimeState(
    restoredCoordinationState,
    objectiveDiscoveryState,
    restoredObjectiveWorkState
  );
const objectiveWorkTimerInput: MeshObjectiveWorkTimerInput = {
  kind: 'timer.fired',
  timerId: 'objective:11:objective-a:expiry',
  generation: 1,
};
const objectiveWorkTimerDecision: MeshObjectiveWorkTimerDecision =
  evaluateMeshObjectiveWorkTimer(
    objectiveWorkRuntime,
    objectiveWorkTimerInput,
    1
  );
const localWorkCommand: MeshObjectiveWorkCommand = {
  kind: 'work.create',
  input: {
    objectiveId: 'objective-a',
    workItemId: 'work-item-a',
    requiredCapabilityKeys: ['summarize'],
    matchingAttributes: { language: 'en' },
    completionCriteria: ['Return a concise summary.'],
    inputSummary: 'Summarize the approved material.',
    budgetReservationUnits: 0,
    workDeadline: '2026-07-30T01:00:00Z',
  },
};
const objectiveWorkTrustedTime: MeshObjectiveWorkTrustedTime = {
  verifiedAt: '2026-07-30T00:00:01Z',
  receivedAt: 1,
};
const objectiveWorkDecision: MeshObjectiveWorkDecision =
  evaluateMeshObjectiveWorkCommand(
    objectiveWorkRuntime,
    localWorkCommand,
    objectiveWorkTrustedTime
  );
const verifiedObjectiveRequest: MeshVerifiedObjectiveRequest | undefined =
  undefined;
const evaluatedObjectiveRequest: MeshObjectiveWorkDecision | undefined =
  verifiedObjectiveRequest === undefined
    ? undefined
    : evaluateVerifiedMeshObjectiveEnvelope(
        objectiveWorkRuntime,
        verifiedObjectiveRequest
      );
const objectiveWorkRejectionCode: MeshObjectiveWorkRejectionCode | undefined =
  undefined;
const workObjectivePolicy: MeshWorkObjectivePolicySnapshot | undefined =
  undefined;
const workItemProjection: MeshWorkItemProjection | undefined = undefined;
const discoveryRuntimeState: MeshDiscoveryRuntimeState =
  createMeshDiscoveryRuntimeState(
    restoredCoordinationState,
    restoredDiscoveryState
  );
const inboundSecurityState: MeshCoordinationInboundState =
  createMeshCoordinationInboundState({
    identity: peerState.identity,
    limits: DEFAULT_MESH_COORDINATION_INBOUND_LIMITS,
  });
const restoredInboundSecurityState: MeshCoordinationInboundState =
  restoreMeshCoordinationInboundState(inboundSecurityState);
const discoveryInboundRuntimeState: MeshDiscoveryInboundRuntimeState =
  createMeshDiscoveryInboundRuntimeState(
    restoredCoordinationState,
    restoredDiscoveryState,
    restoredInboundSecurityState
  );
const objectiveInboundRuntimeState: MeshObjectiveInboundRuntimeState =
  createMeshObjectiveInboundRuntimeState(
    restoredCoordinationState,
    objectiveDiscoveryState,
    restoredObjectiveWorkState,
    restoredInboundSecurityState
  );
const capabilityRequirement: MeshCapabilityRequirement = {
  capabilityKeys: ['summarize'],
  attributes: { language: 'en' },
  fanout: 1,
};
const capabilityMatches: MeshCapabilityMatchResult =
  matchMeshDiscoveryCapabilities(
    discoveryRuntimeState,
    capabilityRequirement,
    0
  );
const selectedMembershipPeers: readonly string[] =
  selectMeshDiscoveryTopicRecipients(discoveryRuntimeState, 'membership', 0);
const advancedDiscoveryState = advanceMeshDiscoveryState(
  discoveryRuntimeState,
  0
);
const verifiedDiscoveryRequest: MeshVerifiedDiscoveryRequest | undefined =
  undefined;
const evaluatedDiscoveryRequest =
  verifiedDiscoveryRequest === undefined
    ? undefined
    : evaluateVerifiedMeshDiscoveryEnvelope(
        discoveryRuntimeState,
        verifiedDiscoveryRequest
      );

void capabilityMatches;
void selectedMembershipPeers;
void advancedDiscoveryState;
void evaluatedDiscoveryRequest;
void discoveryInboundRuntimeState;

const contractReducer: MeshPeerReducer = (state) => ({
  state,
  effects: [],
});

const admissionPolicy: MeshAdmissionPolicy = {
  isPeerAdmitted: ({ senderPeerId }) => senderPeerId === 'peer-b',
};

const simulationConfig: MeshSimulationConfig = {
  seed: 1,
  prngVersion: 'xorshift32-v1',
  recordingMode: 'digest',
  startTime: '2026-07-29T00:00:00Z',
  peers: [
    {
      peerId: 'peer-a',
      state: peerState,
      signer: {} as MeshEnvelopeSigner,
      verifier: {} as WebCryptoMeshEnvelopeVerifier,
      resolver: {} as MeshKeyResolver,
      cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
      admissionPolicy,
      privateKey: {} as CryptoKey,
    },
  ],
  links: [],
  limits: {
    maximumEvents: 100,
    maximumLogicalTime: 1_000,
    maximumQueuedEvents: 100,
    maximumInternalSteps: 100,
  },
};

const invariant: MeshSimulationInvariant = {
  name: 'bounded queue',
  evaluate: ({ queuedEvents }) => {
    if (queuedEvents > simulationConfig.limits.maximumQueuedEvents) {
      throw new Error('queue limit exceeded');
    }
  },
};

const signer: MeshEnvelopeSigner | undefined = undefined;
const resolver: MeshKeyResolver | undefined = undefined;
const verifierInput: MeshVerifyRequest | undefined = undefined;
const contractPrivateKey = {} as CryptoKey;
const contractPublicKey = {} as CryptoKey;
const keyRecord: MeshKeyRecord = {
  tenantId: 'tenant-a',
  meshId: 'mesh-a',
  peerId: 'peer-a',
  keyId: 'key-a',
  algorithm: MESH_SIGNATURE_ALGORITHM,
  publicKey: contractPublicKey,
  validFrom: '2026-01-01T00:00:00Z',
  validUntil: '2027-01-01T00:00:00Z',
  status: 'active',
};
const cryptoPolicy: MeshCryptoPolicy = DEFAULT_MESH_CRYPTO_POLICY;
const revocationBypassPolicy: MeshCryptoPolicy = {
  allowedAlgorithms: [MESH_SIGNATURE_ALGORITHM],
  // @ts-expect-error live verification exposes no revocation bypass
  rejectRevokedKeys: false,
};
// @ts-expect-error revoked records require an explicit revocation timestamp
const incompleteRevokedRecord: MeshKeyRecord = {
  ...keyRecord,
  status: 'revoked',
};
const staticResolver = createStaticMeshKeyResolver([keyRecord]);
const staticResolverClass: StaticMeshKeyResolver = staticResolver;
const referenceSigner: WebCryptoMeshEnvelopeSigner =
  createWebCryptoMeshEnvelopeSigner();
const referenceVerifier: WebCryptoMeshEnvelopeVerifier =
  createWebCryptoMeshEnvelopeVerifier();
const digestPromise = computeMeshPayloadHash({ payload: helloPayload });
const importedPublicKey = importMeshEd25519PublicKey(new Uint8Array(32));
const exportedPublicKey = exportMeshEd25519PublicKey(contractPublicKey);
const signedPromise = signMeshEnvelope({
  envelope: unsignedHello,
  privateKey: contractPrivateKey,
});
const signedEnvelope: SignedMeshEnvelope | undefined = undefined;
const envelopeContext: MeshEnvelopeContext = {
  tenantId: 'tenant-a',
  meshId: 'mesh-a',
  peerId: 'peer-b',
  receivedAt: '2026-07-29T00:00:01.000Z',
};
const parsedJson = parseMeshJson('{"bounded":true}');
const canonicalJson = canonicalizeMeshJson({ bounded: true });
const canonicalBytes = canonicalizeMeshJsonBytes({ bounded: true });
const timestampOrder = compareMeshTimestamps(
  '2026-07-29T00:00:00Z',
  '2026-07-29T00:00:01Z'
);
const parsedEnvelope = parseSignedMeshEnvelope(new Uint8Array());
// @ts-expect-error wire parsing requires bytes so UTF-8 failures stay visible
parseSignedMeshEnvelope('{}');
const validatedEnvelope = validateSignedMeshEnvelope({});
const canonicalPayload = canonicalizeMeshPayload(helloPayload);
const expectedResult: MeshProtocolResult<unknown> = parsedJson;
const signedForContract = {} as SignedMeshEnvelope<PeerHelloPayload>;
const signedDiscoveryForContract =
  {} as SignedMeshEnvelope<MeshDiscoveryPayload>;
const discoveryInboundProcessorOptions: MeshDiscoveryInboundProcessorOptions = {
  resolver: staticResolver,
  cryptoPolicy,
};
const discoveryInboundProcessor: MeshDiscoveryInboundProcessor =
  createMeshDiscoveryInboundProcessor(discoveryInboundProcessorOptions);
const discoveryInboundRequest: MeshDiscoveryInboundRequest = {
  envelope: signedDiscoveryForContract,
  verifiedAt: '2026-07-29T00:00:01Z',
  receivedAt: 1,
};
const discoveryInboundPromise: Promise<MeshDiscoveryInboundDecision> =
  discoveryInboundProcessor.process(
    discoveryInboundRuntimeState,
    discoveryInboundRequest
  );
const signedObjectiveForContract =
  {} as SignedMeshEnvelope<ObjectiveAnnouncePayload>;
const objectiveInboundProcessorOptions: MeshObjectiveInboundProcessorOptions = {
  resolver: staticResolver,
  cryptoPolicy,
};
const objectiveInboundProcessor: MeshObjectiveInboundProcessor =
  createMeshObjectiveInboundProcessor(objectiveInboundProcessorOptions);
const objectiveInboundRequest: MeshObjectiveInboundRequest = {
  envelope: signedObjectiveForContract,
  verifiedAt: '2026-07-29T00:00:01Z',
  receivedAt: 1,
};
const objectiveInboundPromise: Promise<MeshObjectiveInboundDecision> =
  objectiveInboundProcessor.process(
    objectiveInboundRuntimeState,
    objectiveInboundRequest
  );
const topicClock: MeshCoordinationTopicClock = {
  now: () => ({ verifiedAt: '2026-07-29T00:00:01Z', receivedAt: 1 }),
};
const topicDriverOptions: MeshCoordinationTopicDriverOptions = {
  tenantId: 'tenant-a',
  meshId: 'mesh-a',
  clock: topicClock,
};
const topicDriver: MeshCoordinationTopicDriver =
  createMeshCoordinationTopicDriver(topicDriverOptions);
const topicConfiguration: MeshCoordinationTopicConfiguration =
  topicDriver.configuration;
const topicPeer: MeshCoordinationTopicPeer = topicDriver.register({
  state: discoveryInboundRuntimeState,
  processor: discoveryInboundProcessor,
});
const topicReceipts: Promise<readonly MeshCoordinationTopicReceipt[]> =
  topicPeer.publish({ envelope: signedDiscoveryForContract });
const objectiveTopicClock: MeshCoordinationObjectiveTopicClock = {
  now: () => ({ verifiedAt: '2026-07-29T00:00:01Z', receivedAt: 1 }),
};
const objectiveTopicDriverOptions: MeshCoordinationObjectiveTopicDriverOptions =
  {
    tenantId: 'tenant-a',
    meshId: 'mesh-a',
    clock: objectiveTopicClock,
  };
const objectiveTopicDriver: MeshCoordinationObjectiveTopicDriver =
  createMeshCoordinationObjectiveTopicDriver(objectiveTopicDriverOptions);
const objectiveTopicConfiguration: MeshCoordinationObjectiveTopicConfiguration =
  objectiveTopicDriver.configuration;
const objectiveTopicPeer: MeshCoordinationObjectiveTopicPeer =
  objectiveTopicDriver.register({
    state: objectiveInboundRuntimeState,
    processor: objectiveInboundProcessor,
  });
const objectiveTopicReceipts: Promise<
  readonly MeshCoordinationObjectiveTopicReceipt[]
> = objectiveTopicPeer.publish({ envelope: signedObjectiveForContract });
const verificationPromise = verifyMeshEnvelope({
  envelope: signedForContract,
  resolver: staticResolver,
  policy: cryptoPolicy,
  verifiedAt: '2026-07-29T00:00:01Z',
});
const reducerTransition = reduceMeshPeer(peerState, { kind: 'peer.start' }, 0);
const inboundPromise = processMeshEnvelope(peerState, {
  envelope: signedForContract,
  verifiedAt: '2026-07-29T00:00:01Z',
  receivedAt: 1,
  verifier: referenceVerifier,
  resolver: staticResolver,
  cryptoPolicy,
  admissionPolicy: ALLOW_PREPROVISIONED_MESH_ADMISSION,
});
const signingDocument = createMeshSigningDocument(signedForContract);
const signingBytes = canonicalizeMeshSigningDocument(signedForContract);
const contextValidation = validateMeshEnvelopeContext(
  signedForContract,
  envelopeContext
);
const loopback: MeshLoopbackTransport | undefined = undefined;
const kernel: MeshSimulationKernel | undefined = undefined;
const loopbackRuntime = createMeshLoopbackTransport();
const simulationEvents: readonly MeshSimulationEventInput[] = [];
const simulationKernelPromise = createMeshSimulationKernel(simulationConfig);
const simulationRunPromise = runMeshSimulation(
  simulationConfig,
  simulationEvents
);
const simulationReplayPromise = simulationRunPromise.then((trace) =>
  replayMeshSimulation(simulationConfig, simulationEvents, trace)
);

void unsignedHello;
void implementedPayloadType;
void admissionPolicy;
void DEFAULT_MESH_PROTOCOL_LIMITS;
void THREE_PEER_SCENARIO_IDS;
void invariant;
void signer;
void resolver;
void verifierInput;
void contractPrivateKey;
void contractPublicKey;
void keyRecord;
void cryptoPolicy;
void revocationBypassPolicy;
void incompleteRevokedRecord;
void staticResolverClass;
void discoveryInboundPromise;
void objectiveInboundPromise;
void topicConfiguration;
void topicReceipts;
void objectiveTopicConfiguration;
void objectiveTopicReceipts;
void referenceSigner;
void referenceVerifier;
void digestPromise;
void importedPublicKey;
void exportedPublicKey;
void signedPromise;
void verificationPromise;
void reducerTransition;
void inboundPromise;
void signedEnvelope;
void envelopeContext;
void canonicalJson;
void canonicalBytes;
void timestampOrder;
void parsedEnvelope;
void validatedEnvelope;
void canonicalPayload;
void expectedResult;
void signingDocument;
void signingBytes;
void contextValidation;
void loopback;
void kernel;
void loopbackRuntime;
void simulationKernelPromise;
void simulationRunPromise;
void simulationReplayPromise;
void objectiveWorkTimerDecision;
void objectiveWorkDecision;
void evaluatedObjectiveRequest;
void objectiveWorkRejectionCode;
void workObjectivePolicy;
void workItemProjection;
void objectivePolicyHistory;
void maximumObjectivePolicies;
