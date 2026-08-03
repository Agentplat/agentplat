import {
  acceptDelegationMandateV1,
  createCollectiveAuthorityStateV1,
  type CollectiveAuthorityStateV1,
  type DelegationMandateV1,
  type DelegationProofVerificationV1,
  type WorkContractV1,
} from '@agentplat/collective-control';
import {
  DELEGATION_MANDATE_REFERENCE_PREFIX_V1,
  createGovernedMeshObjectiveInboundProcessorV1,
} from '@agentplat/collective-control/mesh';
import {
  createPlanningReducerCommandV1,
  createPlanningReducerStateV1,
  digestPlanningJsonV1,
  reducePlanningCommandV1,
  validateMissionIntentV1,
  validateMissionObservationV1,
  validatePlanFragmentProposalV1,
  validatePlanSelectionPolicyV1,
  type AdaptiveRoleBindingV1,
  type MissionIntentV1,
  type MissionObservationV1,
  type PlanFragmentProposalV1,
  type PlanSelectionPolicyV1,
  type PlanningReducerStateV1,
} from '@agentplat/collective-planning';
import {
  validateCollectiveProtectedEffectAttemptV1,
  validateCollectiveProtectedEffectReceiptV1,
  type CollectiveProtectedEffectAttemptV1,
  type CollectiveProtectedEffectReceiptV1,
} from '@agentplat/collective-planning/evaluation';
import type { CollectiveEvaluationRunnerV2 } from '@agentplat/collective-planning/evaluation';
import {
  InMemoryPlanningFragmentRepositoryV1,
  PLANNING_MESH_CAPABILITY_PROFILE_V1,
  PLANNING_WORK_EXTENSION_KEY_V1,
  createPlanningAdaptiveRoleV1,
  createPlanningLocalWorkProjectionV1,
  planningWorkItemIdV1,
  selectPlanningOfferRecipientsV1,
  type PlanningAdaptiveRoleResultV1,
  type PlanningLocalWorkProjectionV1,
} from '@agentplat/collective-planning/mesh';
import {
  DEFAULT_MESH_CRYPTO_POLICY,
  createWebCryptoMeshEnvelopeSigner,
  verifyMeshEnvelope,
  type MeshCryptoPolicy,
  type MeshEnvelopeSigner,
  type MeshKeyResolver,
} from '@agentplat/mesh-crypto';
import {
  canonicalizeMeshPayload,
  validateSignedMeshEnvelope,
  type MeshMessagePayload,
  type WorkOfferPayload,
  type SignedMeshEnvelope,
  type UnsignedMeshEnvelope,
  type VerifiedMeshEnvelope,
} from '@agentplat/mesh-protocol';
import type { MeshPeerIdentity } from '@agentplat/mesh';
import {
  createMeshAllocationInboundProcessor,
  createMeshAllocationInboundRuntimeState,
  createMeshAllocationRuntimeState,
  createMeshAllocationState,
  createMeshCoordinationInboundState,
  createMeshCoordinationState,
  createMeshDiscoveryRuntimeState,
  createMeshDiscoveryState,
  createMeshObjectiveInboundProcessor,
  createMeshObjectiveInboundRuntimeState,
  createMeshObjectiveWorkRuntimeState,
  createMeshObjectiveWorkState,
  evaluateMeshAllocationCommand,
  evaluateMeshObjectiveWorkCommand,
  evaluateVerifiedMeshDiscoveryEnvelope,
  restoreMeshAllocationState,
  restoreMeshDiscoveryState,
  restoreMeshObjectiveWorkState,
  selectMeshAllocationBid,
  type MeshAllocationInboundRuntimeState,
  type MeshAssignmentFenceHeadProjection,
  type MeshExecutionHeadProjection,
  type MeshExecutionRecordProjection,
  type MeshDiscoveryPayload,
  type MeshObjectiveProjection,
  type MeshWorkItemProjection,
} from '@agentplat/mesh/coordination';
import { collectiveTraceJournalForOwnerV2 } from './collective-trace-journal.js';
import { assertCollectiveEffectReceiptProvenanceV1 } from './collective-effect-provenance.js';

const MINIMUM_PEERS = 3;
const MAXIMUM_PEERS = 100;
const MAXIMUM_NEIGHBORS = 99;
const MAXIMUM_RECIPIENTS = 32;
const MAXIMUM_INTERACTIONS = 5_000;
const WIRE_VERSION = 0 as const;

export interface CollectiveClosedLoopRuntimePeerV1 {
  readonly schemaVersion: 1;
  readonly peerId: string;
  readonly peerInstanceId: string;
  readonly capabilityKeys: readonly string[];
  readonly neighborPeerIds: readonly string[];
}

/** Crypto handles are construction-bound and deliberately absent from digests. */
export interface CollectiveClosedLoopRuntimeRunnerV1 {
  readonly signer: MeshEnvelopeSigner;
  readonly resolver: MeshKeyResolver;
  readonly cryptoPolicy: MeshCryptoPolicy;
  readonly crypto: Crypto;
  readonly privateKeys: Readonly<Record<string, CryptoKey>>;
  readonly mandateVerification: DelegationProofVerificationV1;
}

export interface CollectiveClosedLoopRuntimeInputV1 {
  readonly schemaVersion: 1;
  readonly missionIntent: MissionIntentV1;
  readonly selectionPolicy: PlanSelectionPolicyV1;
  readonly mandate: DelegationMandateV1;
  readonly peers: readonly CollectiveClosedLoopRuntimePeerV1[];
  readonly observations: readonly MissionObservationV1[];
  readonly planningProposal: PlanFragmentProposalV1;
  readonly planningMode: CollectiveEvaluationRunnerV2;
  readonly runner: CollectiveClosedLoopRuntimeRunnerV1;
  readonly seed: number;
  readonly maximumLogicalTimeMs: number;
}

export interface CollectiveClosedLoopFinalizationInputV1 {
  readonly effectAttempt: CollectiveProtectedEffectAttemptV1;
  readonly effectReceipt: CollectiveProtectedEffectReceiptV1;
  readonly resultDigest: string;
  readonly resultSummary: string;
}

export interface CollectiveClosedLoopFinalizedResultV1 {
  readonly schemaVersion: 1;
  readonly winnerPeerId: string;
  readonly discoveredPeerIds: readonly string[];
  readonly offerRecipientPeerIds: readonly string[];
  readonly bidderPeerIds: readonly string[];
  readonly workContract: WorkContractV1;
  readonly roleBinding: AdaptiveRoleBindingV1;
  readonly result: MeshExecutionRecordProjection;
  readonly planningStates: Readonly<Record<string, PlanningReducerStateV1>>;
  readonly meshStates: Readonly<
    Record<string, MeshAllocationInboundRuntimeState>
  >;
  readonly logicalTimeMs: number;
  readonly interactionCount: number;
}

export interface CollectiveClosedLoopPreEffectHandleV1 {
  readonly schemaVersion: 1;
  readonly winnerPeerId: string;
  readonly discoveredPeerIds: readonly string[];
  readonly offerRecipientPeerIds: readonly string[];
  readonly bidderPeerIds: readonly string[];
  readonly workContract: WorkContractV1;
  readonly adaptiveRole: PlanningAdaptiveRoleResultV1;
  readonly roleBinding: AdaptiveRoleBindingV1;
  readonly authorityState: CollectiveAuthorityStateV1;
  readonly objective: MeshObjectiveProjection;
  readonly workItem: MeshWorkItemProjection;
  readonly execution: MeshExecutionHeadProjection;
  readonly fenceHead: MeshAssignmentFenceHeadProjection;
  readonly checkpoint: MeshExecutionRecordProjection;
  readonly planningStates: Readonly<Record<string, PlanningReducerStateV1>>;
  readonly meshStates: Readonly<
    Record<string, MeshAllocationInboundRuntimeState>
  >;
  readonly logicalTimeMs: number;
  readonly interactionCount: number;
  finalizeAfterCommittedEffect(
    input: CollectiveClosedLoopFinalizationInputV1,
  ): Promise<CollectiveClosedLoopFinalizedResultV1>;
}

interface SignedAndVerified<TPayload extends MeshMessagePayload> {
  readonly signed: SignedMeshEnvelope<TPayload, 0>;
  readonly verified: VerifiedMeshEnvelope<TPayload, 0>;
}

interface RuntimeContext {
  readonly input: CollectiveClosedLoopRuntimeInputV1;
  readonly owner: CollectiveClosedLoopRuntimePeerV1;
  readonly peersById: ReadonlyMap<string, CollectiveClosedLoopRuntimePeerV1>;
  readonly sequences: Map<string, number>;
  readonly baseWallTimeMs: number;
  logicalTimeMs: number;
  interactionCount: number;
}

interface EnvelopeInput<TPayload extends MeshMessagePayload> {
  readonly senderPeerId: string;
  readonly type: TPayload['type'];
  readonly audience:
    | { readonly kind: 'mesh'; readonly topic: string }
    | { readonly kind: 'peer'; readonly peerId: string };
  readonly payload: TPayload;
  readonly objectiveId?: string;
  readonly causationId?: string;
  readonly sentAtOffsetMs?: number;
  readonly expiresAtOffsetMs?: number;
  readonly extensions?: Readonly<Record<string, unknown>>;
  readonly criticalExtensions?: readonly string[];
}

/**
 * Binds externally managed key handles to the closed-loop runtime. Reusing the
 * returned object reuses exactly the same signing authority during replay.
 */
export function createCollectiveClosedLoopRuntimeRunnerV1(input: {
  readonly resolver: MeshKeyResolver;
  readonly privateKeys: Readonly<Record<string, CryptoKey>>;
  readonly mandateVerification: DelegationProofVerificationV1;
  readonly signer?: MeshEnvelopeSigner;
  readonly crypto?: Crypto;
  readonly cryptoPolicy?: MeshCryptoPolicy;
}): CollectiveClosedLoopRuntimeRunnerV1 {
  const crypto = input.crypto ?? globalThis.crypto;
  if (!crypto?.subtle) throw new TypeError('closed_loop_crypto_unavailable');
  return Object.freeze({
    signer:
      input.signer ??
      createWebCryptoMeshEnvelopeSigner({
        signingPolicy: { allowedWireVersions: [WIRE_VERSION] },
      }),
    resolver: input.resolver,
    cryptoPolicy: input.cryptoPolicy ?? DEFAULT_MESH_CRYPTO_POLICY,
    crypto,
    privateKeys: Object.freeze({ ...input.privateKeys }),
    mandateVerification: Object.freeze({ ...input.mandateVerification }),
  });
}

/**
 * Executes the nominal peer-local planning and Mesh allocation spine. It stops
 * after a real checkpoint while assignment authority remains active.
 */
export async function runCollectiveClosedLoopMeshRuntimeV1(
  rawInput: CollectiveClosedLoopRuntimeInputV1,
): Promise<CollectiveClosedLoopPreEffectHandleV1> {
  const input = validateInput(rawInput);
  const owner = input.peers[0];
  const context: RuntimeContext = {
    input,
    owner,
    peersById: new Map(input.peers.map((peer) => [peer.peerId, peer])),
    sequences: new Map(),
    baseWallTimeMs: Date.parse(input.missionIntent.validFrom),
    logicalTimeMs: 1,
    interactionCount: 0,
  };
  const authorityState = installMandate(input);
  const planning = createPlanning(context);
  let planningStates = planning.states;
  const projection = planning.projection;
  const repository = new InMemoryPlanningFragmentRepositoryV1();
  await repository.put(projection.repositoryRecord);
  const retainedProjection = await repository.get(
    projection.repositoryRecord.contentReference,
  );
  if (
    !retainedProjection ||
    retainedProjection.fragmentDigest !==
      projection.repositoryRecord.fragmentDigest
  )
    throw new Error('closed_loop_planning_repository_mismatch');

  let meshStates: Record<string, MeshAllocationInboundRuntimeState> =
    Object.fromEntries(
      input.peers.map((peer) => [peer.peerId, createPeerMeshState(context, peer)]),
    );
  const allocationInbound = createMeshAllocationInboundProcessor({
    resolver: input.runner.resolver,
    cryptoPolicy: input.runner.cryptoPolicy,
    crypto: input.runner.crypto,
    supportedCriticalExtensions: [PLANNING_WORK_EXTENSION_KEY_V1],
  });

  const discoverablePeers = owner.neighborPeerIds
    .map((peerId) => context.peersById.get(peerId))
    .filter(
      (peer): peer is CollectiveClosedLoopRuntimePeerV1 =>
        peer !== undefined && peer.peerId !== owner.peerId,
    );
  for (const peer of discoverablePeers) {
    meshStates[owner.peerId] = await discoverPeer(
      context,
      meshStates[owner.peerId],
      peer,
    );
  }
  const discoveredPeerIds = Object.freeze(
    discoverablePeers.map((peer) => peer.peerId).sort(),
  );

  const requiredCapabilityKeys = projection.work.requiredCapabilityKeys;
  const recipients = selectPlanningOfferRecipientsV1({
    discovery: meshStates[owner.peerId].discovery,
    logicalTimeMs: context.logicalTimeMs,
    verifiedAt: wallTime(context, 1_000),
    localSupportedCriticalExtensions: [PLANNING_WORK_EXTENSION_KEY_V1],
    requiredCapabilityKeys,
    maximumRecipients: Math.min(MAXIMUM_RECIPIENTS, discoverablePeers.length),
  });
  if (recipients.length === 0)
    throw new Error('closed_loop_no_eligible_recipients');

  const objectiveEnvelope = await signEnvelope(context, {
    senderPeerId: owner.peerId,
    type: 'objective.announce',
    audience: { kind: 'mesh', topic: 'objective' },
    objectiveId: input.missionIntent.objective.objectiveId,
    payload: objectivePayload(context),
    sentAtOffsetMs: 2_000,
    expiresAtOffsetMs: 120_000,
  });
  const objectiveInbound = createGovernedMeshObjectiveInboundProcessorV1({
    processor: createMeshObjectiveInboundProcessor({
      resolver: input.runner.resolver,
      cryptoPolicy: input.runner.cryptoPolicy,
      crypto: input.runner.crypto,
    }),
    authority: { read: () => authorityState },
  });
  for (const peer of input.peers) {
    const receivedAt = advance(context);
    const admitted = await objectiveInbound.process(
      createMeshObjectiveInboundRuntimeState(
        meshStates[peer.peerId].coordination,
        meshStates[peer.peerId].discovery,
        meshStates[peer.peerId].objectives,
        meshStates[peer.peerId].inbound,
      ),
      {
        envelope: objectiveEnvelope.signed,
        verifiedAt: wallTime(context, 3_000),
        receivedAt,
      },
    );
    countInteraction(context, objectiveEnvelope.signed, peer.peerId);
    if (!admitted.accepted)
      throw new Error(`closed_loop_objective_rejected:${admitted.code}`);
    meshStates[peer.peerId] = replaceMeshDomains(
      meshStates[peer.peerId],
      admitted.state,
      receivedAt,
    );
  }

  const workCreatedAt = advance(context);
  const createdWork = evaluateMeshObjectiveWorkCommand(
    createMeshObjectiveWorkRuntimeState(
      meshStates[owner.peerId].coordination,
      meshStates[owner.peerId].discovery,
      meshStates[owner.peerId].objectives,
    ),
    { kind: 'work.create', input: projection.work },
    { verifiedAt: wallTime(context, 4_000), receivedAt: workCreatedAt },
  );
  if (!createdWork.accepted)
    throw new Error(`closed_loop_work_rejected:${createdWork.code}`);
  meshStates[owner.peerId] = replaceMeshDomains(
    meshStates[owner.peerId],
    createdWork.state,
    workCreatedAt,
  );

  const offerId = scopedId(context, 'offer', 1);
  const offerPayload = createOfferPayload(context, projection, offerId);
  const preparedOffers = await Promise.all(
    recipients.map(async (recipient) => ({
      recipientPeerId: recipient.peerId,
      preparedAt: context.logicalTimeMs + 1,
      envelope: (
        await signEnvelope(context, {
          senderPeerId: owner.peerId,
          type: 'work.offer',
          audience: { kind: 'peer', peerId: recipient.peerId },
          objectiveId: input.missionIntent.objective.objectiveId,
          payload: offerPayload,
          extensions: projection.extensions,
          criticalExtensions: projection.criticalExtensions,
          sentAtOffsetMs: 5_000,
          expiresAtOffsetMs: 60_000,
        })
      ).signed,
    })),
  );
  const offeredAt = advance(context);
  const offered = evaluateMeshAllocationCommand(
    allocationRuntime(meshStates[owner.peerId]),
    {
      kind: 'allocation.offer',
      objectiveId: input.missionIntent.objective.objectiveId,
      workItemId: projection.workItemId,
      expectedWorkItemRevision: projection.workItemRevision,
      recipients: preparedOffers.map((prepared) => ({
        ...prepared,
        preparedAt: offeredAt,
      })),
    },
    wallTime(context, 5_000),
    offeredAt,
    [PLANNING_WORK_EXTENSION_KEY_V1],
    recipients.map((recipient) => recipient.peerId),
  );
  if (!offered.accepted)
    throw new Error(`closed_loop_offer_rejected:${offered.code}`);
  meshStates[owner.peerId] = retainInbound(
    meshStates[owner.peerId],
    offered.state,
  );

  for (const prepared of preparedOffers) {
    const admitted = await allocationInbound.process(
      meshStates[prepared.recipientPeerId],
      {
        envelope: prepared.envelope,
        verifiedAt: wallTime(context, 5_000),
        receivedAt: offeredAt,
      },
    );
    countInteraction(context, prepared.envelope, prepared.recipientPeerId);
    if (!admitted.accepted)
      throw new Error(`closed_loop_planning_offer_rejected:${admitted.code}`);
    meshStates[prepared.recipientPeerId] = admitted.state;
  }

  const offersByPeer = new Map(
    preparedOffers.map((prepared) => [prepared.recipientPeerId, prepared]),
  );
  const bidsById = new Map<string, SignedMeshEnvelope>();
  for (const [index, recipient] of recipients.entries()) {
    const peerId = recipient.peerId;
    const preparedOffer = offersByPeer.get(peerId);
    if (!preparedOffer) throw new Error('closed_loop_offer_state_missing');
    const bidId = scopedId(context, `bid-${peerId}`, 1);
    const bidEnvelope = await signEnvelope(context, {
      senderPeerId: peerId,
      type: 'work.bid',
      audience: { kind: 'peer', peerId: owner.peerId },
      objectiveId: input.missionIntent.objective.objectiveId,
      causationId: preparedOffer.envelope.messageId,
      payload: {
        type: 'work.bid',
        bidId,
        bidRevision: 1,
        offerId,
        objectiveId: input.missionIntent.objective.objectiveId,
        objectiveDocumentId:
          input.missionIntent.objective.objectiveDocumentId,
        objectiveRevision: input.missionIntent.objective.objectiveRevision,
        workItemId: projection.workItemId,
        workItemRevision: projection.workItemRevision,
        ownerPeerId: owner.peerId,
        ownerEpoch: 1,
        offerAttempt: 1,
        bidderPeerId: peerId,
        advertisementId: capabilityAdvertisementId(peerId, requiredCapabilityKeys[0]),
        capabilityId: capabilityId(peerId, requiredCapabilityKeys[0]),
        capabilityRevision: 1,
        capacityReservationUnits: 1,
        budgetUnits: 1,
        bidDeadline: offerPayload.bidDeadline,
        workDeadline: offerPayload.workDeadline,
        expectedCompletionAt: wallTime(context, 600_000 + index * 1_000),
        bidExpiresAt: wallTime(context, 50_000),
        assumptions: [],
      },
      sentAtOffsetMs: 6_000,
      expiresAtOffsetMs: 50_000,
    });
    const preparedAt = advance(context);
    const localBid = evaluateMeshAllocationCommand(
      allocationRuntime(meshStates[peerId]),
      {
        kind: 'allocation.bid',
        offerId,
        preparedAt,
        envelope: bidEnvelope.signed,
      },
      wallTime(context, 7_000),
      preparedAt,
    );
    if (!localBid.accepted)
      throw new Error(`closed_loop_local_bid_rejected:${localBid.code}`);
    meshStates[peerId] = retainInbound(meshStates[peerId], localBid.state);
    const receivedAt = advance(context);
    const receivedBid = await allocationInbound.process(
      meshStates[owner.peerId],
      {
        envelope: bidEnvelope.signed,
        verifiedAt: wallTime(context, 7_000),
        receivedAt,
      },
    );
    countInteraction(context, bidEnvelope.signed, owner.peerId);
    if (!receivedBid.accepted)
      throw new Error(`closed_loop_bid_rejected:${receivedBid.code}`);
    meshStates[owner.peerId] = receivedBid.state;
    bidsById.set(bidId, bidEnvelope.signed);
  }

  const selected = selectMeshAllocationBid(
    allocationRuntime(meshStates[owner.peerId]),
    { offerId, evaluatedAt: advance(context) },
  );
  if (selected.reason !== 'selected' || !selected.bid)
    throw new Error(`closed_loop_bid_not_selected:${selected.reason}`);
  const winnerPeerId = selected.bid.bidderPeerId;
  const offerRecipientPeerIds = Object.freeze(
    recipients.map((recipient) => recipient.peerId).sort(),
  );
  const bidderPeerIds = Object.freeze([...offerRecipientPeerIds]);
  const winningBidEnvelope = bidsById.get(selected.bid.bidId);
  if (!winningBidEnvelope)
    throw new Error('closed_loop_selected_bid_evidence_missing');

  const awardId = scopedId(context, 'award', 1);
  const leaseExpiresAt = wallTime(context, 1_800_000);
  const acceptanceDeadline = wallTime(context, 35_000);
  const awardEnvelope = await signEnvelope(context, {
    senderPeerId: owner.peerId,
    type: 'work.award',
    audience: { kind: 'peer', peerId: winnerPeerId },
    objectiveId: input.missionIntent.objective.objectiveId,
    causationId: winningBidEnvelope.messageId,
    payload: {
      type: 'work.award',
      awardId,
      offerId,
      bidId: selected.bid.bidId,
      bidRevision: selected.bid.bidRevision,
      objectiveId: input.missionIntent.objective.objectiveId,
      objectiveDocumentId: input.missionIntent.objective.objectiveDocumentId,
      objectiveRevision: input.missionIntent.objective.objectiveRevision,
      workItemId: projection.workItemId,
      workItemRevision: projection.workItemRevision,
      ownerPeerId: owner.peerId,
      ownerEpoch: 1,
      offerAttempt: 1,
      assigneePeerId: winnerPeerId,
      assignmentEpoch: 1,
      authorityKind: 'award',
      assignmentAuthorityId: awardId,
      fencingToken: awardId,
      budgetReservationUnits: offerPayload.budgetReservationUnits,
      workDeadline: offerPayload.workDeadline,
      leaseStartsAt: wallTime(context, 10_000),
      leaseExpiresAt,
      acceptanceDeadline,
    },
    sentAtOffsetMs: 10_000,
    expiresAtOffsetMs: 35_000,
  });
  const awardedAt = advance(context);
  const awarded = evaluateMeshAllocationCommand(
    allocationRuntime(meshStates[owner.peerId]),
    {
      kind: 'allocation.award',
      offerId,
      bidId: selected.bid.bidId,
      bidRevision: selected.bid.bidRevision,
      recipient: {
        recipientPeerId: winnerPeerId,
        preparedAt: awardedAt,
        envelope: awardEnvelope.signed,
      },
    },
    wallTime(context, 10_000),
    awardedAt,
  );
  if (!awarded.accepted)
    throw new Error(`closed_loop_award_rejected:${awarded.code}`);
  meshStates[owner.peerId] = retainInbound(
    meshStates[owner.peerId],
    awarded.state,
  );
  const receivedAward = await allocationInbound.process(meshStates[winnerPeerId], {
    envelope: awardEnvelope.signed,
    verifiedAt: wallTime(context, 10_000),
    receivedAt: awardedAt,
  });
  countInteraction(context, awardEnvelope.signed, winnerPeerId);
  if (!receivedAward.accepted)
    throw new Error(`closed_loop_received_award_rejected:${receivedAward.code}`);
  meshStates[winnerPeerId] = receivedAward.state;

  const acceptanceId = scopedId(context, 'acceptance', 1);
  const acceptanceEnvelope = await signEnvelope(context, {
    senderPeerId: winnerPeerId,
    type: 'work.accept',
    audience: { kind: 'peer', peerId: owner.peerId },
    objectiveId: input.missionIntent.objective.objectiveId,
    causationId: awardEnvelope.signed.messageId,
    payload: {
      type: 'work.accept',
      acceptanceId,
      awardId,
      objectiveId: input.missionIntent.objective.objectiveId,
      objectiveDocumentId: input.missionIntent.objective.objectiveDocumentId,
      objectiveRevision: input.missionIntent.objective.objectiveRevision,
      workItemId: projection.workItemId,
      workItemRevision: projection.workItemRevision,
      ownerPeerId: owner.peerId,
      ownerEpoch: 1,
      assigneePeerId: winnerPeerId,
      assignmentEpoch: 1,
      assignmentAuthorityId: awardId,
      fencingToken: awardId,
      acceptanceDeadline,
    },
    sentAtOffsetMs: 11_000,
    expiresAtOffsetMs: 35_000,
  });
  const acceptedAt = advance(context);
  const locallyAccepted = evaluateMeshAllocationCommand(
    allocationRuntime(meshStates[winnerPeerId]),
    {
      kind: 'allocation.assignment_response',
      awardId,
      preparedAt: acceptedAt,
      envelope: acceptanceEnvelope.signed,
    },
    wallTime(context, 11_000),
    acceptedAt,
  );
  if (!locallyAccepted.accepted)
    throw new Error(
      `closed_loop_local_acceptance_rejected:${locallyAccepted.code}`,
    );
  meshStates[winnerPeerId] = retainInbound(
    meshStates[winnerPeerId],
    locallyAccepted.state,
  );
  const ownerAccepted = await allocationInbound.process(meshStates[owner.peerId], {
    envelope: acceptanceEnvelope.signed,
    verifiedAt: wallTime(context, 11_000),
    receivedAt: acceptedAt,
  });
  countInteraction(context, acceptanceEnvelope.signed, owner.peerId);
  if (!ownerAccepted.accepted)
    throw new Error(`closed_loop_acceptance_rejected:${ownerAccepted.code}`);
  meshStates[owner.peerId] = ownerAccepted.state;

  const checkpointId = scopedId(context, 'checkpoint', 1);
  const checkpointEnvelope = await signEnvelope(context, {
    senderPeerId: winnerPeerId,
    type: 'work.checkpoint',
    audience: { kind: 'peer', peerId: owner.peerId },
    objectiveId: input.missionIntent.objective.objectiveId,
    causationId: acceptanceEnvelope.signed.messageId,
    payload: {
      type: 'work.checkpoint',
      checkpointId,
      checkpointSequence: 1,
      objectiveId: input.missionIntent.objective.objectiveId,
      objectiveDocumentId: input.missionIntent.objective.objectiveDocumentId,
      objectiveRevision: input.missionIntent.objective.objectiveRevision,
      workItemId: projection.workItemId,
      workItemRevision: projection.workItemRevision,
      ownerPeerId: owner.peerId,
      ownerEpoch: 1,
      assigneePeerId: winnerPeerId,
      awardId,
      acceptanceId,
      assignmentEpoch: 1,
      assignmentAuthorityId: awardId,
      fencingToken: awardId,
      leaseExpiresAt,
      checkpointDigest: await contentDigest(
        input.runner.crypto,
        `${scopedId(context, 'checkpoint-content', 1)}:${projection.workItemId}`,
      ),
      checkpointSummary: 'The governed effect boundary is ready.',
    },
    sentAtOffsetMs: 12_000,
    expiresAtOffsetMs: 60_000,
  });
  const checkpointedAt = advance(context);
  const locallyCheckpointed = evaluateMeshAllocationCommand(
    allocationRuntime(meshStates[winnerPeerId]),
    {
      kind: 'allocation.execution',
      preparedAt: checkpointedAt,
      envelope: checkpointEnvelope.signed,
    },
    wallTime(context, 12_000),
    checkpointedAt,
  );
  if (!locallyCheckpointed.accepted)
    throw new Error(
      `closed_loop_local_checkpoint_rejected:${locallyCheckpointed.code}`,
    );
  meshStates[winnerPeerId] = retainInbound(
    meshStates[winnerPeerId],
    locallyCheckpointed.state,
  );
  const ownerCheckpointed = await allocationInbound.process(
    meshStates[owner.peerId],
    {
      envelope: checkpointEnvelope.signed,
      verifiedAt: wallTime(context, 12_000),
      receivedAt: checkpointedAt,
    },
  );
  countInteraction(context, checkpointEnvelope.signed, owner.peerId);
  if (!ownerCheckpointed.accepted)
    throw new Error(
      `closed_loop_checkpoint_rejected:${ownerCheckpointed.code}`,
    );
  meshStates[owner.peerId] = ownerCheckpointed.state;

  const authorities = currentAuthorities(
    meshStates,
    owner.peerId,
    winnerPeerId,
    input.missionIntent.objective.objectiveId,
    projection.workItemId,
    checkpointId,
  );
  const winnerPlanning = planningStates[owner.peerId];
  const winnerHeadDigest = winnerPlanning.planView.selectedHeads.find(
    (head) => head.semanticSlotKey === planning.proposal.semanticSlotKey,
  )?.fragmentDigest;
  const winnerFragment = winnerPlanning.planView.fragments.find(
    (fragment) => fragment.fragmentDigest === winnerHeadDigest,
  );
  if (!winnerFragment)
    throw new Error('closed_loop_winner_fragment_missing');
  const winnerWorkMapping = winnerPlanning.planView.workMappings.find(
    (mapping) => mapping.fragmentDigest === winnerFragment.fragmentDigest,
  );
  if (!winnerWorkMapping)
    throw new Error('closed_loop_winner_work_mapping_missing');
  const adaptiveRole = createPlanningAdaptiveRoleV1({
    source: {
      workContractId: scopedId(context, 'work-contract', 1),
      identity: identity(context, winnerPeerId),
      objective: authorities.objective,
      workItem: authorities.workItem,
      execution: authorities.execution,
      fenceHead: authorities.fenceHead,
      mandate: input.mandate,
      roleKey: winnerFragment.roleKey,
      trustPolicyId: scopedId(context, 'trust-policy', 1),
      inferencePolicyId: scopedId(context, 'inference-policy', 1),
      maximumActionBudgetUnits:
        input.mandate.statement.budget.maximumActionBudgetUnits,
      createdAtLogicalMs: checkpointedAt,
    },
    missionIntent: input.missionIntent,
    planView: winnerPlanning.planView,
    fragment: winnerFragment,
    repositoryRecord: projection.repositoryRecord,
    extension: projection.extension,
    roleBindingId: scopedId(context, 'role-binding', 1),
    targetStatus: 'assigned',
  });
  planningStates = {
    ...planningStates,
    [owner.peerId]: applyPlanning(winnerPlanning, {
      schemaVersion: 1,
      kind: 'fragment.assignment.observe',
      expectedStateDigest: null,
      fragmentId: winnerFragment.fragmentId,
      previousFragmentDigest: winnerFragment.fragmentDigest,
      expectedWorkMapping: winnerWorkMapping,
      roleBinding: adaptiveRole.roleBinding,
    }),
  };

  const immutablePlanningStates = Object.freeze({ ...planningStates });
  const immutableMeshStates = Object.freeze({ ...meshStates });
  let finalization:
    | Promise<CollectiveClosedLoopFinalizedResultV1>
    | undefined;
  let finalizationBinding: string | undefined;
  const handle: CollectiveClosedLoopPreEffectHandleV1 = Object.freeze({
    schemaVersion: 1,
    winnerPeerId,
    discoveredPeerIds,
    offerRecipientPeerIds,
    bidderPeerIds,
    workContract: adaptiveRole.workContract,
    adaptiveRole,
    roleBinding: adaptiveRole.roleBinding,
    authorityState,
    ...authorities,
    planningStates: immutablePlanningStates,
    meshStates: immutableMeshStates,
    logicalTimeMs: checkpointedAt,
    interactionCount: context.interactionCount,
    async finalizeAfterCommittedEffect(
      finalizeInput: CollectiveClosedLoopFinalizationInputV1,
    ) {
      const attempt = validateCollectiveProtectedEffectAttemptV1(
        finalizeInput.effectAttempt,
      );
      const rawReceipt = finalizeInput.effectReceipt;
      const receipt = validateCollectiveProtectedEffectReceiptV1(rawReceipt);
      assertEffectBoundToWork(attempt, receipt, adaptiveRole.workContract);
      assertCollectiveEffectReceiptProvenanceV1(handle, attempt, rawReceipt);
      if (
        receipt.status !== 'committed' ||
        receipt.outputDigest !== finalizeInput.resultDigest
      )
        throw new Error('closed_loop_effect_not_committed');
      const binding = `${attempt.attemptDigest}:${receipt.receiptDigest}:${finalizeInput.resultDigest}:${finalizeInput.resultSummary}`;
      if (finalization) {
        if (binding !== finalizationBinding)
          throw new Error('closed_loop_finalization_conflict');
        return finalization;
      }
      finalizationBinding = binding;
      finalization = finalizeMeshResult({
        context,
        ownerPeerId: owner.peerId,
        winnerPeerId,
        discoveredPeerIds,
        offerRecipientPeerIds,
        bidderPeerIds,
        workContract: adaptiveRole.workContract,
        roleBinding: adaptiveRole.roleBinding,
        checkpoint: authorities.checkpoint,
        checkpointId,
        awardId,
        acceptanceId,
        leaseExpiresAt,
        resultDigest: finalizeInput.resultDigest,
        resultSummary: finalizeInput.resultSummary,
        planningStates: immutablePlanningStates,
        meshStates: immutableMeshStates,
        allocationInbound,
      });
      return finalization;
    },
  });
  return handle;
}

function validateInput(
  input: CollectiveClosedLoopRuntimeInputV1,
): CollectiveClosedLoopRuntimeInputV1 {
  assertExactDataRecord(input, [
    'schemaVersion',
    'missionIntent',
    'selectionPolicy',
    'mandate',
    'peers',
    'observations',
    'planningProposal',
    'planningMode',
    'runner',
    'seed',
    'maximumLogicalTimeMs',
  ], 'closed_loop_runtime_input');
  if (input.schemaVersion !== 1)
    throw new TypeError('closed_loop_schema_version_invalid');
  const missionIntent = validateMissionIntentV1(input.missionIntent);
  const selectionPolicy = validatePlanSelectionPolicyV1(input.selectionPolicy);
  const observations = input.observations.map((observation) =>
    validateMissionObservationV1(observation),
  );
  const planningProposal = validatePlanFragmentProposalV1(
    input.planningProposal,
  );
  if (
    input.planningMode !== 'adaptive_collective' &&
    input.planningMode !== 'centralized_planner'
  )
    throw new TypeError('closed_loop_planning_mode_invalid');
  if (missionIntent.selectionPolicyDigest !== selectionPolicy.policyDigest)
    throw new TypeError('closed_loop_selection_policy_mismatch');
  if (
    input.peers.length < MINIMUM_PEERS ||
    input.peers.length > MAXIMUM_PEERS
  )
    throw new RangeError('closed_loop_peer_count_invalid');
  if (!Number.isSafeInteger(input.seed) || input.seed < 0)
    throw new TypeError('closed_loop_seed_invalid');
  if (
    !Number.isSafeInteger(input.maximumLogicalTimeMs) ||
    input.maximumLogicalTimeMs < 1
  )
    throw new RangeError('closed_loop_logical_time_limit_invalid');
  const peerIds = new Set<string>();
  for (const peer of input.peers) {
    if (
      peer.schemaVersion !== 1 ||
      peer.peerId.length === 0 ||
      peer.peerInstanceId.length === 0 ||
      peerIds.has(peer.peerId) ||
      new Set(peer.capabilityKeys).size !== peer.capabilityKeys.length ||
      new Set(peer.neighborPeerIds).size !== peer.neighborPeerIds.length ||
      peer.neighborPeerIds.length > MAXIMUM_NEIGHBORS ||
      peer.neighborPeerIds.includes(peer.peerId) ||
      !input.runner.privateKeys[peer.peerId]
    )
      throw new TypeError('closed_loop_peer_invalid');
    peerIds.add(peer.peerId);
  }
  for (const peer of input.peers)
    if (peer.neighborPeerIds.some((peerId) => !peerIds.has(peerId)))
      throw new TypeError('closed_loop_neighbor_invalid');
  const owner = input.peers[0];
  const peersById = new Map(input.peers.map((peer) => [peer.peerId, peer]));
  for (const observation of observations) {
    const observer = peersById.get(observation.observerPeerId);
    if (
      !observer ||
      observer.peerInstanceId !== observation.observerInstanceId ||
      observation.missionIntentId !== missionIntent.missionIntentId ||
      observation.intentRevision !== missionIntent.revision ||
      observation.intentDigest !== missionIntent.intentDigest
    )
      throw new TypeError('closed_loop_observation_binding_invalid');
  }
  const eligibleObservationDigests = new Set(
    observations
      .filter(
        (observation) =>
          input.planningMode === 'centralized_planner' ||
          (observation.observerPeerId === owner.peerId &&
            observation.observerInstanceId === owner.peerInstanceId),
      )
      .map((observation) => observation.observationDigest),
  );
  if (
    planningProposal.proposerPeerId !== owner.peerId ||
    planningProposal.proposerInstanceId !== owner.peerInstanceId ||
    planningProposal.missionIntentId !== missionIntent.missionIntentId ||
    planningProposal.intentRevision !== missionIntent.revision ||
    planningProposal.intentDigest !== missionIntent.intentDigest ||
    planningProposal.basisObservationDigests.length === 0 ||
    planningProposal.basisObservationDigests.some(
      (digest) => !eligibleObservationDigests.has(digest),
    )
  )
    throw new TypeError('closed_loop_planning_proposal_binding_invalid');
  if (
    input.mandate.statement.tenantId !== missionIntent.tenantId ||
    input.mandate.statement.policyDomainId !== missionIntent.policyDomainId ||
    input.mandate.statement.issuerId !== owner.peerId ||
    input.mandate.statement.objective.meshId !== missionIntent.objective.meshId ||
    input.mandate.statement.objective.objectiveId !==
      missionIntent.objective.objectiveId ||
    input.mandate.statement.objective.objectiveDocumentId !==
      missionIntent.objective.objectiveDocumentId ||
    input.peers.some(
      (peer) => !input.mandate.statement.subjectPeerIds.includes(peer.peerId),
    ) ||
    input.runner.mandateVerification.signedDigest !== input.mandate.mandateDigest ||
    input.runner.mandateVerification.issuerId !==
      input.mandate.statement.issuerId
  )
    throw new TypeError('closed_loop_authority_binding_invalid');
  const requiredCapability = missionIntent.permittedCapabilityKeys[0];
  if (
    !requiredCapability ||
    owner.neighborPeerIds.every(
      (peerId) =>
        !input.peers
          .find((peer) => peer.peerId === peerId)
          ?.capabilityKeys.includes(requiredCapability),
    )
  )
    throw new TypeError('closed_loop_capability_topology_invalid');
  return Object.freeze({
    ...input,
    missionIntent,
    selectionPolicy,
    observations: Object.freeze(observations),
    planningProposal,
    peers: Object.freeze(input.peers.map((peer) => Object.freeze({ ...peer }))),
  });
}

function installMandate(
  input: CollectiveClosedLoopRuntimeInputV1,
): CollectiveAuthorityStateV1 {
  const decision = acceptDelegationMandateV1(
    createCollectiveAuthorityStateV1({
      tenantId: input.missionIntent.tenantId,
      policyDomainId: input.missionIntent.policyDomainId,
    }),
    {
      mandate: input.mandate,
      verification: input.runner.mandateVerification,
      acceptedAtLogicalMs: 1,
    },
  );
  if (!decision.accepted)
    throw new Error(`closed_loop_mandate_rejected:${decision.code}`);
  return decision.state;
}

function createPlanning(context: RuntimeContext): {
  readonly states: Record<string, PlanningReducerStateV1>;
  readonly projection: PlanningLocalWorkProjectionV1;
  readonly proposal: PlanFragmentProposalV1;
} {
  const { input, owner } = context;
  const admittedSubjects = input.peers.map((peer) => ({
    schemaVersion: 1 as const,
    peerId: peer.peerId,
    peerInstanceId: peer.peerInstanceId,
  }));
  const proposal = input.planningProposal;
  const states: Record<string, PlanningReducerStateV1> = {};
  for (const peer of input.peers) {
    let state = createPlanningReducerStateV1({
      schemaVersion: 1,
      peerId: peer.peerId,
      peerInstanceId: peer.peerInstanceId,
      missionIntent: input.missionIntent,
      selectionPolicy: input.selectionPolicy,
      admittedSubjects,
      logicalTimeMs: 1,
    });
    const proposalBasis = new Set(proposal.basisObservationDigests);
    const localObservations =
      input.planningMode === 'centralized_planner' &&
      peer.peerId === owner.peerId
        ? input.observations.filter((observation) =>
            proposalBasis.has(observation.observationDigest),
          )
        : input.observations.filter(
            (observation) =>
              observation.observerPeerId === peer.peerId &&
              observation.observerInstanceId === peer.peerInstanceId,
          );
    for (const observation of localObservations)
      state = applyPlanning(state, {
        schemaVersion: 1,
        kind: 'observation.record',
        expectedStateDigest: null,
        observation,
      });
    states[peer.peerId] = state;
  }
  let ownerState = applyPlanning(states[owner.peerId], {
    schemaVersion: 1,
    kind: 'proposal.record',
    expectedStateDigest: null,
    proposal,
  });
  ownerState = applyPlanning(ownerState, {
    schemaVersion: 1,
    kind: 'slot.evaluate',
    expectedStateDigest: null,
    semanticSlotKey: proposal.semanticSlotKey,
    candidateProposalDigests: [proposal.proposalDigest],
    decidedAtLogicalMs: 1,
  });
  const activeFragment = ownerState.planView.fragments.find(
    (fragment) => fragment.status === 'active',
  );
  if (!activeFragment) throw new Error('closed_loop_active_fragment_missing');
  const workItemId = planningWorkItemIdV1(proposal.proposalDigest);
  ownerState = applyPlanning(ownerState, {
    schemaVersion: 1,
    kind: 'fragment.project-to-work',
    expectedStateDigest: null,
    fragmentId: activeFragment.fragmentId,
    previousFragmentDigest: activeFragment.fragmentDigest,
    workTarget: {
      schemaVersion: 1,
      meshId: input.missionIntent.objective.meshId,
      objectiveId: input.missionIntent.objective.objectiveId,
      workItemId,
      workItemRevision: 1,
    },
    transitionedAtLogicalMs: 1,
  });
  states[owner.peerId] = ownerState;
  const offeredFragment = ownerState.planView.fragments.find(
    (fragment) =>
      fragment.fragmentId === activeFragment.fragmentId &&
      fragment.status === 'offered',
  );
  if (!offeredFragment)
    throw new Error('closed_loop_offered_fragment_missing');
  return {
    states,
    proposal,
    projection: createPlanningLocalWorkProjectionV1({
      missionIntent: input.missionIntent,
      sourcePlanView: ownerState.planView,
      fragment: offeredFragment,
    }),
  };
}

function applyPlanning(
  state: PlanningReducerStateV1,
  input: Parameters<typeof createPlanningReducerCommandV1>[0],
): PlanningReducerStateV1 {
  const decision = reducePlanningCommandV1(
    state,
    createPlanningReducerCommandV1(input),
  );
  if (decision.status !== 'applied')
    throw new Error(`closed_loop_planning_rejected:${decision.error?.message}`);
  return decision.state;
}

function createPeerMeshState(
  context: RuntimeContext,
  peer: CollectiveClosedLoopRuntimePeerV1,
): MeshAllocationInboundRuntimeState {
  const local = identity(context, peer.peerId);
  const admittedPeerIds = unique([
    peer.peerId,
    context.owner.peerId,
    ...peer.neighborPeerIds,
  ]);
  return createMeshAllocationInboundRuntimeState(
    createMeshCoordinationState({ identity: local }),
    createMeshDiscoveryState({
      identity: local,
      subscriptions: ['membership', 'capability', 'objective'],
      admittedPeers: admittedPeerIds.map((peerId) => ({
        peerId,
        instanceIds: [context.peersById.get(peerId)?.peerInstanceId ?? 'missing'],
        validUntil: wallTime(context, 86_400_000),
      })),
    }),
    createMeshObjectiveWorkState({
      identity: local,
      issuerAuthorities: [
        {
          peerId: context.owner.peerId,
          keyIds: [keyId(context.owner.peerId)],
          validUntil: wallTime(context, 86_400_000),
        },
      ],
    }),
    createMeshAllocationState({ identity: local }),
    createMeshCoordinationInboundState({ identity: local }),
  );
}

async function discoverPeer(
  context: RuntimeContext,
  ownerState: MeshAllocationInboundRuntimeState,
  peer: CollectiveClosedLoopRuntimePeerV1,
): Promise<MeshAllocationInboundRuntimeState> {
  const capabilityIds = [
    planningCapabilityId(peer.peerId),
    ...peer.capabilityKeys.map((capability) => capabilityId(peer.peerId, capability)),
  ].sort();
  const card = await signEnvelope(context, {
    senderPeerId: peer.peerId,
    type: 'peer.card',
    audience: { kind: 'mesh', topic: 'membership' },
    payload: {
      type: 'peer.card',
      peerCardId: scopedId(context, `card-${peer.peerId}`, 1),
      cardRevision: 1,
      subjectPeerId: peer.peerId,
      instanceId: peer.peerInstanceId,
      protocolVersions: [WIRE_VERSION],
      transportHints: [`https://${peer.peerId}.invalid/mesh`],
      capabilityIds,
      validFrom: wallTime(context, 0),
      validUntil: wallTime(context, 120_000),
    },
    sentAtOffsetMs: 0,
    expiresAtOffsetMs: 120_000,
  });
  ownerState = admitDiscovery(context, ownerState, card.verified, []);
  const planning = await signEnvelope(context, {
    senderPeerId: peer.peerId,
    type: 'capability.advertise',
    audience: { kind: 'mesh', topic: 'capability' },
    payload: {
      type: 'capability.advertise',
      advertisementId: planningAdvertisementId(peer.peerId),
      capabilityId: planningCapabilityId(peer.peerId),
      capabilityRevision: 1,
      ownerPeerId: peer.peerId,
      capabilityKey: PLANNING_MESH_CAPABILITY_PROFILE_V1.capabilityKey,
      version: PLANNING_MESH_CAPABILITY_PROFILE_V1.version,
      variant: PLANNING_MESH_CAPABILITY_PROFILE_V1.variant,
      inputMediaTypes: PLANNING_MESH_CAPABILITY_PROFILE_V1.inputMediaTypes,
      outputMediaTypes: PLANNING_MESH_CAPABILITY_PROFILE_V1.outputMediaTypes,
      attributes: PLANNING_MESH_CAPABILITY_PROFILE_V1.attributes,
      validFrom: wallTime(context, 0),
      validUntil: wallTime(context, 120_000),
      maximumConcurrency: 1,
      maximumPayloadBytes: 262_144,
    },
    sentAtOffsetMs: 0,
    expiresAtOffsetMs: 120_000,
  });
  ownerState = admitDiscovery(context, ownerState, planning.verified, [
    PLANNING_WORK_EXTENSION_KEY_V1,
  ]);
  for (const capabilityKey of peer.capabilityKeys) {
    const capability = await signEnvelope(context, {
      senderPeerId: peer.peerId,
      type: 'capability.advertise',
      audience: { kind: 'mesh', topic: 'capability' },
      payload: {
        type: 'capability.advertise',
        advertisementId: capabilityAdvertisementId(peer.peerId, capabilityKey),
        capabilityId: capabilityId(peer.peerId, capabilityKey),
        capabilityRevision: 1,
        ownerPeerId: peer.peerId,
        capabilityKey,
        version: '1',
        inputMediaTypes: ['application/json'],
        outputMediaTypes: ['application/json'],
        attributes: {},
        validFrom: wallTime(context, 0),
        validUntil: wallTime(context, 120_000),
        maximumConcurrency: 1,
        maximumPayloadBytes: 262_144,
      },
      sentAtOffsetMs: 0,
      expiresAtOffsetMs: 120_000,
    });
    ownerState = admitDiscovery(context, ownerState, capability.verified, []);
  }
  return ownerState;
}

function admitDiscovery(
  context: RuntimeContext,
  state: MeshAllocationInboundRuntimeState,
  envelope: VerifiedMeshEnvelope<MeshDiscoveryPayload>,
  supportedCriticalExtensions: readonly string[],
): MeshAllocationInboundRuntimeState {
  const receivedAt = advance(context);
  const decision = evaluateVerifiedMeshDiscoveryEnvelope(
    createMeshDiscoveryRuntimeState(state.coordination, state.discovery),
    {
      envelope,
      verifiedAt: wallTime(context, 1_000),
      receivedAt,
      ...(supportedCriticalExtensions.length === 0
        ? {}
        : { supportedCriticalExtensions }),
    },
  );
  countInteraction(context, envelope, context.owner.peerId);
  if (!decision.accepted)
    throw new Error(`closed_loop_discovery_rejected:${decision.code}`);
  return replaceMeshDomains(
    state,
    {
      coordination: decision.state.coordination,
      discovery: decision.state.discovery,
      objectives: state.objectives,
    },
    receivedAt,
  );
}

function objectivePayload(context: RuntimeContext) {
  const { missionIntent, mandate } = context.input;
  const witnesses = context.input.peers
    .filter((peer) => peer.peerId !== context.owner.peerId)
    .slice(0, 2)
    .map((peer) => peer.peerId);
  witnesses.push(`witness:${context.input.seed}:external`);
  witnesses.sort();
  return {
    type: 'objective.announce' as const,
    objectiveDocumentId: missionIntent.objective.objectiveDocumentId,
    objectiveId: missionIntent.objective.objectiveId,
    objectiveRevision: missionIntent.objective.objectiveRevision,
    issuerPeerId: context.owner.peerId,
    successCriteria: [...missionIntent.outcomeStatements],
    permittedCapabilityKeys: [...missionIntent.permittedCapabilityKeys],
    maximumWorkItems: Math.min(4, mandate.statement.budget.maximumConcurrentWorkReservations),
    maximumConcurrentAssignments: Math.min(
      2,
      mandate.statement.budget.maximumConcurrentWorkReservations,
    ),
    maximumBudgetUnits: mandate.statement.budget.totalBudgetUnits,
    bidWindowMs: 60_000,
    acceptanceWindowMs: 30_000,
    maximumLeaseDurationMs: 3_600_000,
    recoveryGraceMs: 60_000,
    maximumLeaseRenewals: 3,
    recoveryWitnessPeerIds: witnesses,
    recoveryWitnessThreshold: Math.min(2, witnesses.length - 1),
    contentReference: `${DELEGATION_MANDATE_REFERENCE_PREFIX_V1}${mandate.mandateDigest}`,
    validFrom: missionIntent.validFrom,
    validUntil: earlierTimestamp(missionIntent.validUntil, mandate.statement.validUntil),
  };
}

function createOfferPayload(
  context: RuntimeContext,
  projection: PlanningLocalWorkProjectionV1,
  offerId: string,
): WorkOfferPayload {
  const objective = context.input.missionIntent.objective;
  if (projection.work.inputReference === undefined)
    throw new Error('closed_loop_work_input_reference_missing');
  return {
    type: 'work.offer' as const,
    offerId,
    objectiveId: objective.objectiveId,
    objectiveDocumentId: objective.objectiveDocumentId,
    objectiveRevision: objective.objectiveRevision,
    workItemId: projection.workItemId,
    workItemRevision: projection.workItemRevision,
    ownerPeerId: context.owner.peerId,
    ownerEpoch: 1,
    offerAttempt: 1,
    requiredCapabilityKeys: projection.work.requiredCapabilityKeys,
    matchingAttributes: projection.work.matchingAttributes ?? {},
    inputReference: projection.work.inputReference,
    completionCriteria: projection.work.completionCriteria,
    budgetReservationUnits: projection.work.budgetReservationUnits,
    bidDeadline: wallTime(context, 60_000),
    workDeadline: projection.work.workDeadline,
  };
}

function currentAuthorities(
  meshStates: Readonly<Record<string, MeshAllocationInboundRuntimeState>>,
  ownerPeerId: string,
  winnerPeerId: string,
  objectiveId: string,
  workItemId: string,
  checkpointId: string,
): {
  readonly objective: MeshObjectiveProjection;
  readonly workItem: MeshWorkItemProjection;
  readonly execution: MeshExecutionHeadProjection;
  readonly fenceHead: MeshAssignmentFenceHeadProjection;
  readonly checkpoint: MeshExecutionRecordProjection;
} {
  const objective = meshStates[ownerPeerId].objectives.objectives[objectiveId];
  const workItem = Object.values(meshStates[ownerPeerId].objectives.workItems).find(
    (candidate) => candidate.workItemId === workItemId,
  );
  const execution = Object.values(
    meshStates[winnerPeerId].allocation.executionHeads,
  ).find(
    (candidate) =>
      candidate.workItemId === workItemId && candidate.phase === 'active',
  );
  const fenceHead = Object.values(
    meshStates[winnerPeerId].allocation.assignmentFenceHeads,
  ).find(
    (candidate) =>
      candidate.workItemId === workItemId && candidate.phase === 'active',
  );
  const checkpoint = meshStates[winnerPeerId].allocation.executionRecords[
    checkpointId
  ];
  if (!objective || !workItem || !execution || !fenceHead || !checkpoint)
    throw new Error('closed_loop_authority_head_missing');
  return { objective, workItem, execution, fenceHead, checkpoint };
}

async function finalizeMeshResult(input: {
  readonly context: RuntimeContext;
  readonly ownerPeerId: string;
  readonly winnerPeerId: string;
  readonly discoveredPeerIds: readonly string[];
  readonly offerRecipientPeerIds: readonly string[];
  readonly bidderPeerIds: readonly string[];
  readonly workContract: WorkContractV1;
  readonly roleBinding: AdaptiveRoleBindingV1;
  readonly checkpoint: MeshExecutionRecordProjection;
  readonly checkpointId: string;
  readonly awardId: string;
  readonly acceptanceId: string;
  readonly leaseExpiresAt: string;
  readonly resultDigest: string;
  readonly resultSummary: string;
  readonly planningStates: Readonly<Record<string, PlanningReducerStateV1>>;
  readonly meshStates: Readonly<Record<string, MeshAllocationInboundRuntimeState>>;
  readonly allocationInbound: ReturnType<typeof createMeshAllocationInboundProcessor>;
}): Promise<CollectiveClosedLoopFinalizedResultV1> {
  const { context, workContract } = input;
  const resultId = scopedId(context, 'result', 1);
  const resultEnvelope = await signEnvelope(context, {
    senderPeerId: input.winnerPeerId,
    type: 'work.result',
    audience: { kind: 'peer', peerId: input.ownerPeerId },
    objectiveId: workContract.objective.objectiveId,
    causationId: input.checkpoint.envelope.messageId,
    payload: {
      type: 'work.result',
      resultId,
      resultDigest: meshContentDigest(input.resultDigest),
      objectiveId: workContract.objective.objectiveId,
      objectiveDocumentId: workContract.objective.objectiveDocumentId,
      objectiveRevision: workContract.objective.objectiveRevision,
      workItemId: workContract.assignment.workItemId,
      workItemRevision: workContract.assignment.workItemRevision,
      ownerPeerId: workContract.assignment.ownerPeerId,
      ownerEpoch: 1,
      assigneePeerId: input.winnerPeerId,
      awardId: input.awardId,
      acceptanceId: input.acceptanceId,
      assignmentEpoch: workContract.assignment.assignmentEpoch,
      assignmentAuthorityId: workContract.assignment.assignmentAuthorityId,
      fencingToken: workContract.assignment.fencingToken,
      leaseExpiresAt: input.leaseExpiresAt,
      checkpointId: input.checkpointId,
      resultSummary: input.resultSummary,
    },
    sentAtOffsetMs: 14_000,
    expiresAtOffsetMs: 90_000,
  });
  const finalizedAt = advance(context);
  const local = evaluateMeshAllocationCommand(
    allocationRuntime(input.meshStates[input.winnerPeerId]),
    {
      kind: 'allocation.execution',
      preparedAt: finalizedAt,
      envelope: resultEnvelope.signed,
    },
    wallTime(context, 14_000),
    finalizedAt,
  );
  if (!local.accepted)
    throw new Error(`closed_loop_local_result_rejected:${local.code}`);
  const nextMeshStates: Record<string, MeshAllocationInboundRuntimeState> = {
    ...input.meshStates,
    [input.winnerPeerId]: retainInbound(
      input.meshStates[input.winnerPeerId],
      local.state,
    ),
  };
  const owner = await input.allocationInbound.process(
    nextMeshStates[input.ownerPeerId],
    {
      envelope: resultEnvelope.signed,
      verifiedAt: wallTime(context, 14_000),
      receivedAt: finalizedAt,
    },
  );
  countInteraction(context, resultEnvelope.signed, input.ownerPeerId);
  if (!owner.accepted)
    throw new Error(`closed_loop_result_rejected:${owner.code}`);
  nextMeshStates[input.ownerPeerId] = owner.state;
  const result = nextMeshStates[input.winnerPeerId].allocation.executionRecords[
    resultId
  ];
  if (!result || result.recordType !== 'result')
    throw new Error('closed_loop_result_evidence_missing');
  return Object.freeze({
    schemaVersion: 1,
    winnerPeerId: input.winnerPeerId,
    discoveredPeerIds: input.discoveredPeerIds,
    offerRecipientPeerIds: input.offerRecipientPeerIds,
    bidderPeerIds: input.bidderPeerIds,
    workContract,
    roleBinding: input.roleBinding,
    result,
    planningStates: input.planningStates,
    meshStates: Object.freeze(nextMeshStates),
    logicalTimeMs: finalizedAt,
    interactionCount: context.interactionCount,
  });
}

function assertEffectBoundToWork(
  attempt: CollectiveProtectedEffectAttemptV1,
  receipt: CollectiveProtectedEffectReceiptV1,
  workContract: WorkContractV1,
): void {
  if (
    receipt.attemptDigest !== attempt.attemptDigest ||
    receipt.idempotencyKey !== attempt.idempotencyKey ||
    attempt.tenantId !== workContract.tenantId ||
    attempt.peerId !== workContract.assignment.assignedPeerId ||
    attempt.peerInstanceId !== workContract.assignment.assignedInstanceId ||
    attempt.workItemId !== workContract.assignment.workItemId ||
    attempt.workItemRevision !== workContract.assignment.workItemRevision ||
    attempt.workContractId !== workContract.workContractId ||
    attempt.workContractDigest !== workContract.workContractDigest ||
    attempt.assignmentEpoch !== workContract.assignment.assignmentEpoch ||
    attempt.authorityGeneration !== workContract.assignment.authorityGeneration ||
    attempt.fencingToken !== workContract.assignment.fencingToken
  )
    throw new Error('closed_loop_effect_binding_mismatch');
}

async function signEnvelope<TPayload extends MeshMessagePayload>(
  context: RuntimeContext,
  input: EnvelopeInput<TPayload>,
): Promise<SignedAndVerified<TPayload>> {
  const peer = context.peersById.get(input.senderPeerId);
  const privateKey = context.input.runner.privateKeys[input.senderPeerId];
  if (!peer || !privateKey)
    throw new Error('closed_loop_signing_identity_missing');
  const sequence = (context.sequences.get(peer.peerId) ?? 0) + 1;
  context.sequences.set(peer.peerId, sequence);
  const payloadHash = await payloadDigest(context.input.runner.crypto, input.payload);
  const envelope = {
    protocol: 'agentplat.mesh',
    wireVersion: WIRE_VERSION,
    messageId: deterministicMessageId(
      context.input.seed,
      context.input.peers.findIndex((candidate) => candidate.peerId === peer.peerId),
      sequence,
    ),
    tenantId: context.input.missionIntent.tenantId,
    meshId: context.input.missionIntent.objective.meshId,
    ...(input.objectiveId === undefined
      ? {}
      : { objectiveId: input.objectiveId }),
    type: input.type,
    sender: { peerId: peer.peerId, instanceId: peer.peerInstanceId },
    audience: input.audience,
    sequence,
    sentAt: wallTime(context, input.sentAtOffsetMs ?? 0),
    expiresAt: wallTime(context, input.expiresAtOffsetMs ?? 120_000),
    ...(input.causationId === undefined
      ? {}
      : { causationId: input.causationId }),
    ...(input.extensions === undefined ? {} : { extensions: input.extensions }),
    ...(input.criticalExtensions === undefined
      ? {}
      : { criticalExtensions: input.criticalExtensions }),
    payloadHash,
    payload: input.payload,
    proof: { algorithm: 'Ed25519' as const, keyId: keyId(peer.peerId), value: '' },
  } as UnsignedMeshEnvelope<TPayload, 0>;
  const preflight = validateSignedMeshEnvelope(
    {
      ...envelope,
      payloadHash: `sha256:${'A'.repeat(43)}`,
      proof: { ...envelope.proof, value: 'A'.repeat(86) },
    },
    { acceptedWireVersions: [WIRE_VERSION] },
  );
  if (!preflight.ok)
    throw new Error(
      `closed_loop_envelope_invalid:${input.type}:${preflight.issues
        .map((issue) => `${issue.code}:${issue.path}`)
        .join(',')}`,
    );
  const signed = await context.input.runner.signer.sign({ envelope, privateKey });
  const verified = await verifyMeshEnvelope({
    envelope: signed,
    resolver: context.input.runner.resolver,
    policy: context.input.runner.cryptoPolicy,
    verifiedAt: wallTime(context, Math.max(input.sentAtOffsetMs ?? 0, 1_000)),
    crypto: context.input.runner.crypto,
  });
  if (!verified.verified)
    throw new Error(`closed_loop_signature_rejected:${verified.code}`);
  return Object.freeze({ signed, verified: verified.envelope });
}

function replaceMeshDomains(
  state: MeshAllocationInboundRuntimeState,
  domains: Pick<
    MeshAllocationInboundRuntimeState,
    'coordination' | 'discovery' | 'objectives'
  >,
  logicalTimeMs: number,
): MeshAllocationInboundRuntimeState {
  return createMeshAllocationInboundRuntimeState(
    domains.coordination,
    restoreMeshDiscoveryState({
      ...domains.discovery,
      lastLogicalTime: logicalTimeMs,
    }),
    restoreMeshObjectiveWorkState({
      ...domains.objectives,
      lastLogicalTime: logicalTimeMs,
    }),
    restoreMeshAllocationState({
      ...state.allocation,
      lastLogicalTime: logicalTimeMs,
    }),
    state.inbound,
  );
}

function retainInbound(
  state: MeshAllocationInboundRuntimeState,
  domains: ReturnType<typeof createMeshAllocationRuntimeState>,
): MeshAllocationInboundRuntimeState {
  return createMeshAllocationInboundRuntimeState(
    domains.coordination,
    domains.discovery,
    domains.objectives,
    domains.allocation,
    state.inbound,
  );
}

function allocationRuntime(state: MeshAllocationInboundRuntimeState) {
  return createMeshAllocationRuntimeState(
    state.coordination,
    state.discovery,
    state.objectives,
    state.allocation,
  );
}

function identity(context: RuntimeContext, peerId: string): MeshPeerIdentity {
  const peer = context.peersById.get(peerId);
  if (!peer) throw new Error('closed_loop_peer_missing');
  return Object.freeze({
    tenantId: context.input.missionIntent.tenantId,
    meshId: context.input.missionIntent.objective.meshId,
    peerId,
    instanceId: peer.peerInstanceId,
    keyId: keyId(peerId),
  });
}

function advance(context: RuntimeContext): number {
  context.logicalTimeMs += 1;
  if (context.logicalTimeMs > context.input.maximumLogicalTimeMs)
    throw new RangeError('closed_loop_logical_time_exceeded');
  return context.logicalTimeMs;
}

function countInteraction(
  context: RuntimeContext,
  record: SignedMeshEnvelope | VerifiedMeshEnvelope,
  peerId: string,
): void {
  context.interactionCount += 1;
  if (context.interactionCount > MAXIMUM_INTERACTIONS)
    throw new RangeError('closed_loop_interaction_limit_exceeded');
  const journal = collectiveTraceJournalForOwnerV2(
    context.input.runner as object,
  );
  if (!journal) return;
  journal.append({
    logicalTimeMs: context.logicalTimeMs,
    peerId,
    component: 'mesh',
    kind: 'mesh.message.delivered',
    status: 'accepted',
    reasonCode: null,
    recordDigest: digestPlanningJsonV1(
      'environment-state-v1',
      {
        messageId: record.messageId,
        type: record.type,
        payloadHash: record.payloadHash,
        sequence: record.sequence,
      },
    ),
    stateDigestBefore: null,
    stateDigestAfter: null,
    faultBinding: null,
  });
}

function assertExactDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
  errorCode: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(errorCode);
  const prototype = Object.getPrototypeOf(value);
  const actual = Object.getOwnPropertyNames(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0 ||
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    throw new TypeError(errorCode);
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
      throw new TypeError(errorCode);
  }
}

function wallTime(context: RuntimeContext, offsetMs: number): string {
  return new Date(context.baseWallTimeMs + offsetMs).toISOString();
}

function earlierTimestamp(left: string, right: string): string {
  return Date.parse(left) <= Date.parse(right) ? left : right;
}

function scopedId(context: RuntimeContext, kind: string, revision: number): string {
  return `${kind}:${context.input.seed}:${revision}`;
}

function keyId(peerId: string): string {
  return `key:${peerId}`;
}

function planningCapabilityId(peerId: string): string {
  return `capability:planning:${peerId}`;
}

function planningAdvertisementId(peerId: string): string {
  return `advertisement:planning:${peerId}`;
}

function capabilityId(peerId: string, capabilityKey: string): string {
  return `capability:${peerId}:${capabilityKey}`;
}

function capabilityAdvertisementId(
  peerId: string,
  capabilityKey: string,
): string {
  return `advertisement:${peerId}:${capabilityKey}`;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function deterministicMessageId(
  seed: number,
  peerOrdinal: number,
  sequence: number,
): string {
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, seed >>> 0);
  view.setUint32(4, peerOrdinal >>> 0);
  view.setUint32(8, Math.floor(seed / 0x1_0000_0000) >>> 0);
  view.setUint32(12, sequence >>> 0);
  return base64Url(bytes);
}

async function payloadDigest(
  crypto: Crypto,
  payload: MeshMessagePayload,
): Promise<string> {
  const canonical = canonicalizeMeshPayload(payload);
  if (!canonical.ok) throw new TypeError('closed_loop_payload_invalid');
  const bytes = Uint8Array.from(canonical.value);
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer);
  return `sha256:${base64Url(new Uint8Array(digest))}`;
}

async function contentDigest(crypto: Crypto, value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return `sha256:${base64Url(new Uint8Array(digest))}`;
}

function meshContentDigest(value: string): string {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError('closed_loop_result_digest_invalid');
  const hex = value.slice('sha256:'.length);
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1)
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return `sha256:${base64Url(bytes)}`;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}
