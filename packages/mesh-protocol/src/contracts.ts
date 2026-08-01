/** Public protocol contracts shared by parsing and validation. */
/** Exact protocol identifier signed by every Mesh peer. */
export const MESH_PROTOCOL = 'agentplat.mesh' as const;

/** Current wire version emitted by Beta writers. */
export const MESH_WIRE_VERSION = 1 as const;

/** Preceding wire version retained for explicit Alpha compatibility. */
export const MESH_PREVIOUS_WIRE_VERSION = 0 as const;

/** Complete built-in read set in ascending preference order. */
export const MESH_SUPPORTED_WIRE_VERSIONS = Object.freeze([
  MESH_PREVIOUS_WIRE_VERSION,
  MESH_WIRE_VERSION,
] as const);

/** Wire versions understood by this release line. */
export type MeshWireVersion = (typeof MESH_SUPPORTED_WIRE_VERSIONS)[number];

/** Reference signature suite for the initial protocol. */
export const MESH_SIGNATURE_ALGORITHM = 'Ed25519' as const;

/** Closed audience topics recognized by protocol v0. */
export const MESH_AUDIENCE_TOPICS = Object.freeze([
  'membership',
  'capability',
  'objective',
  'work',
  'evidence',
] as const);

/** Closed message registry; later alphas implement additional payload families. */
export const MESH_MESSAGE_TYPES = Object.freeze([
  'peer.hello',
  'peer.card',
  'peer.ping',
  'peer.ping_ack',
  'peer.digest',
  'peer.sync_request',
  'peer.sync_response',
  'peer.goodbye',
  'capability.advertise',
  'capability.withdraw',
  'objective.announce',
  'objective.revise',
  'objective.cancel',
  'work.offer',
  'work.bid',
  'work.award',
  'work.accept',
  'work.decline',
  'work.progress',
  'work.checkpoint',
  'work.result',
  'work.release',
  'work.cancel',
  'lease.renew',
  'lease.takeover_proposal',
  'lease.vote',
  'lease.certificate',
  'evidence.claim',
  'evidence.attest',
  'evidence.challenge',
  'evidence.retract',
  'trust.observation',
] as const);

export type MeshAudienceTopic = (typeof MESH_AUDIENCE_TOPICS)[number];
export type MeshMessageType = (typeof MESH_MESSAGE_TYPES)[number];
export type MeshSignatureAlgorithm = typeof MESH_SIGNATURE_ALGORITHM;

/** JSON value accepted by protocol extensions and future message payloads. */
export type MeshJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly MeshJsonValue[]
  | { readonly [key: string]: MeshJsonValue };

/** Direct peer audience. Transport addresses never imply this value. */
export interface MeshPeerAudience {
  readonly kind: 'peer';
  readonly peerId: string;
}

/** Bounded sender fanout to one closed Mesh topic. */
export interface MeshTopicAudience {
  readonly kind: 'mesh';
  readonly topic: MeshAudienceTopic;
}

export type MeshAudience = MeshPeerAudience | MeshTopicAudience;

/** Peer and process instance that signed one envelope. */
export interface MeshSender {
  readonly peerId: string;
  readonly instanceId: string;
}

/** Signed proof header used to construct the canonical signing document. */
export interface MeshProofHeader {
  readonly algorithm: MeshSignatureAlgorithm;
  readonly keyId: string;
}

/** Complete proof representation carried on the wire. */
export interface MeshProof extends MeshProofHeader {
  readonly value: string;
}

/** Announces liveness for an already admitted Peer Card and instance. */
export interface PeerHelloPayload {
  readonly type: 'peer.hello';
  readonly peerCardId: string;
  readonly cardRevision: number;
}

/** Publishes one bounded revision of a peer's discovery card. */
export interface PeerCardPayload {
  readonly type: 'peer.card';
  readonly peerCardId: string;
  readonly cardRevision: number;
  readonly subjectPeerId: string;
  readonly instanceId: string;
  readonly protocolVersions: readonly number[];
  readonly transportHints: readonly string[];
  readonly capabilityIds: readonly string[];
  readonly validFrom: string;
  readonly validUntil: string;
  readonly previousPeerCardId?: string;
}

/** Requests a direct liveness response from the audience peer. */
export interface PeerPingPayload {
  readonly type: 'peer.ping';
}

/** Responds to one accepted ping named by the envelope causation ID. */
export interface PeerPingAckPayload {
  readonly type: 'peer.ping_ack';
}

/** Retires the sender's current peer card and process instance. */
export interface PeerGoodbyePayload {
  readonly type: 'peer.goodbye';
  readonly peerCardId: string;
  readonly cardRevision: number;
  readonly instanceId: string;
}

/** Publishes one bounded revision of a peer-owned capability. */
export interface CapabilityAdvertisePayload {
  readonly type: 'capability.advertise';
  readonly advertisementId: string;
  readonly capabilityId: string;
  readonly capabilityRevision: number;
  readonly ownerPeerId: string;
  readonly capabilityKey: string;
  readonly version: string;
  readonly variant?: string;
  readonly inputMediaTypes: readonly string[];
  readonly outputMediaTypes: readonly string[];
  readonly attributes: Readonly<Record<string, string>>;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly maximumConcurrency?: number;
  readonly maximumPayloadBytes?: number;
  readonly previousAdvertisementId?: string;
}

/** Withdraws one specific advertised revision of a capability. */
export interface CapabilityWithdrawPayload {
  readonly type: 'capability.withdraw';
  readonly capabilityId: string;
  readonly capabilityRevision: number;
  readonly advertisementId: string;
}

/** Fields shared by complete Objective announcement and revision documents. */
export interface ObjectiveDocumentFields {
  readonly objectiveDocumentId: string;
  readonly objectiveId: string;
  readonly objectiveRevision: number;
  readonly issuerPeerId: string;
  readonly successCriteria: readonly string[];
  readonly permittedCapabilityKeys: readonly string[];
  readonly maximumWorkItems: number;
  readonly maximumConcurrentAssignments: number;
  readonly maximumBudgetUnits: number;
  readonly bidWindowMs: number;
  readonly acceptanceWindowMs: number;
  readonly maximumLeaseDurationMs: number;
  readonly recoveryGraceMs: number;
  readonly maximumLeaseRenewals: number;
  readonly recoveryWitnessPeerIds: readonly string[];
  readonly recoveryWitnessThreshold: number;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly authorizedObserverPeerIds?: readonly string[];
}

/** Exactly one inline summary or external content reference. */
export type ObjectiveDocumentContent =
  | {
      readonly summary: string;
      readonly contentReference?: never;
    }
  | {
      readonly summary?: never;
      readonly contentReference: string;
    };

/** Complete first revision of an objective issued to the mesh. */
export type ObjectiveAnnouncePayload = ObjectiveDocumentFields &
  ObjectiveDocumentContent & {
    readonly type: 'objective.announce';
  };

/** Complete replacement revision of an existing objective document. */
export type ObjectiveRevisePayload = ObjectiveDocumentFields &
  ObjectiveDocumentContent & {
    readonly type: 'objective.revise';
    readonly previousObjectiveDocumentId: string;
  };

/** Cancels one specific objective document revision. */
export interface ObjectiveCancelPayload {
  readonly type: 'objective.cancel';
  readonly cancellationId: string;
  readonly objectiveId: string;
  readonly objectiveRevision: number;
  readonly objectiveDocumentId: string;
}

/** Fields shared by every complete work offer. */
export interface WorkOfferFields {
  readonly offerId: string;
  readonly objectiveId: string;
  readonly objectiveDocumentId: string;
  readonly objectiveRevision: number;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly ownerPeerId: string;
  readonly ownerEpoch: number;
  readonly offerAttempt: number;
  readonly previousOfferId?: string;
  readonly requiredCapabilityKeys: readonly string[];
  readonly matchingAttributes: Readonly<Record<string, string>>;
  readonly completionCriteria: readonly string[];
  readonly budgetReservationUnits: number;
  readonly bidDeadline: string;
  readonly workDeadline: string;
}

/** Exactly one inline work input summary or external content reference. */
export type WorkOfferInput =
  | {
      readonly inputSummary: string;
      readonly inputReference?: never;
    }
  | {
      readonly inputSummary?: never;
      readonly inputReference: string;
    };

/** Offers one bounded work item for capability-based bidding. */
export type WorkOfferPayload = WorkOfferFields &
  WorkOfferInput & {
    readonly type: 'work.offer';
  };

/** Proposes one capacity and budget reservation for an accepted work offer. */
export interface WorkBidPayload {
  readonly type: 'work.bid';
  readonly bidId: string;
  readonly bidRevision: number;
  readonly previousBidId?: string;
  readonly offerId: string;
  readonly objectiveId: string;
  readonly objectiveDocumentId: string;
  readonly objectiveRevision: number;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly ownerPeerId: string;
  readonly ownerEpoch: number;
  readonly offerAttempt: number;
  readonly bidderPeerId: string;
  readonly advertisementId: string;
  readonly capabilityId: string;
  readonly capabilityRevision: number;
  readonly capacityReservationUnits: number;
  readonly budgetUnits: number;
  readonly bidDeadline: string;
  readonly workDeadline: string;
  readonly expectedCompletionAt: string;
  readonly bidExpiresAt: string;
  readonly assumptions: readonly string[];
}

/** Fields common to both fresh awards and recovery-certified assignments. */
export interface WorkAwardFields {
  readonly type: 'work.award';
  readonly awardId: string;
  readonly offerId: string;
  readonly bidId: string;
  readonly bidRevision: number;
  readonly objectiveId: string;
  readonly objectiveDocumentId: string;
  readonly objectiveRevision: number;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly ownerPeerId: string;
  readonly ownerEpoch: number;
  readonly offerAttempt: number;
  readonly assigneePeerId: string;
  readonly assignmentEpoch: number;
  readonly assignmentAuthorityId: string;
  readonly fencingToken: string;
  readonly budgetReservationUnits: number;
  readonly workDeadline: string;
  readonly leaseStartsAt: string;
  readonly leaseExpiresAt: string;
  readonly acceptanceDeadline: string;
}

/** Assigns work under either the original award or recovery authority. */
export type WorkAwardPayload =
  | (WorkAwardFields & {
      readonly authorityKind: 'award';
      readonly recoveryCertificateId?: never;
      readonly resumeCheckpointId?: never;
    })
  | (WorkAwardFields & {
      readonly authorityKind: 'recovery_certificate';
      readonly recoveryCertificateId: string;
      readonly resumeCheckpointId?: string;
    });

/** Fields echoed by an assignee when responding to one assignment. */
export interface WorkAssignmentResponseFields {
  readonly awardId: string;
  readonly objectiveId: string;
  readonly objectiveDocumentId: string;
  readonly objectiveRevision: number;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly ownerPeerId: string;
  readonly ownerEpoch: number;
  readonly assigneePeerId: string;
  readonly assignmentEpoch: number;
  readonly assignmentAuthorityId: string;
  readonly fencingToken: string;
  readonly acceptanceDeadline: string;
}

/** Accepts one assignment before its bounded response deadline. */
export interface WorkAcceptPayload extends WorkAssignmentResponseFields {
  readonly type: 'work.accept';
  readonly acceptanceId: string;
}

/** Declines one assignment before its bounded response deadline. */
export interface WorkDeclinePayload extends WorkAssignmentResponseFields {
  readonly type: 'work.decline';
  readonly declineId: string;
}

/** Assignment authority echoed by every assignment lifecycle record. */
export interface WorkAssignmentAuthorityFields {
  readonly objectiveId: string;
  readonly objectiveDocumentId: string;
  readonly objectiveRevision: number;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly ownerPeerId: string;
  readonly ownerEpoch: number;
  readonly assigneePeerId: string;
  readonly awardId: string;
  readonly assignmentEpoch: number;
  readonly assignmentAuthorityId: string;
  readonly fencingToken: string;
  readonly leaseExpiresAt: string;
}

/** Accepted assignment authority echoed by every execution record. */
export interface WorkExecutionAuthorityFields extends WorkAssignmentAuthorityFields {
  readonly acceptanceId: string;
}

/** Reports bounded incremental progress under one accepted assignment. */
export interface WorkProgressPayload extends WorkExecutionAuthorityFields {
  readonly type: 'work.progress';
  readonly progressId: string;
  readonly progressSequence: number;
  readonly progressSummary: string;
  readonly checkpointId?: string;
}

/** Exactly one inline checkpoint summary or external content reference. */
export type WorkCheckpointContent =
  | {
      readonly checkpointSummary: string;
      readonly checkpointReference?: never;
    }
  | {
      readonly checkpointSummary?: never;
      readonly checkpointReference: string;
    };

/** Persists a content-addressed checkpoint under one accepted assignment. */
export type WorkCheckpointPayload = WorkExecutionAuthorityFields &
  WorkCheckpointContent & {
    readonly type: 'work.checkpoint';
    readonly checkpointId: string;
    readonly checkpointSequence: number;
    readonly previousCheckpointId?: string;
    readonly checkpointDigest: string;
  };

/** Exactly one inline result summary or external content reference. */
export type WorkResultContent =
  | {
      readonly resultSummary: string;
      readonly resultReference?: never;
    }
  | {
      readonly resultSummary?: never;
      readonly resultReference: string;
    };

/** Publishes a content-addressed result under one accepted assignment. */
export type WorkResultPayload = WorkExecutionAuthorityFields &
  WorkResultContent & {
    readonly type: 'work.result';
    readonly resultId: string;
    readonly resultDigest: string;
    readonly checkpointId?: string;
  };

/** Releases an active assignment under owner or assignee authority. */
export interface WorkReleasePayload extends WorkExecutionAuthorityFields {
  readonly type: 'work.release';
  readonly releaseId: string;
  readonly releaseAuthority: 'owner' | 'assignee';
  readonly releaseDisposition: 'reoffer' | 'close';
}

/** Cancels either a pending award or an active accepted assignment. */
export type WorkCancelPayload = WorkAssignmentAuthorityFields & {
  readonly type: 'work.cancel';
  readonly cancellationId: string;
} & (
    | {
        readonly assignmentState: 'award_pending';
        readonly acceptanceId?: never;
      }
    | {
        readonly assignmentState: 'active';
        readonly acceptanceId: string;
      }
  );

/** Extends one accepted assignment lease without changing its authority. */
export interface LeaseRenewPayload extends WorkExecutionAuthorityFields {
  readonly type: 'lease.renew';
  readonly leaseRenewalId: string;
  readonly leaseRenewalSequence: number;
  readonly previousLeaseRenewalId?: string;
  readonly renewedLeaseExpiresAt: string;
}

/** Assignment and lease snapshot shared by candidate and witness proposals. */
export interface LeaseTakeoverProposalFields extends WorkExecutionAuthorityFields {
  readonly type: 'lease.takeover_proposal';
  readonly takeoverProposalId: string;
  readonly proposerPeerId: string;
  readonly proposedAssigneePeerId: string;
  readonly proposedAssignmentEpoch: number;
  readonly leaseRenewalSequence: number;
  readonly latestLeaseRenewalId?: string;
}

/** Proposes the next assignment epoch after one accepted lease expires. */
export type LeaseTakeoverProposalPayload = LeaseTakeoverProposalFields &
  (
    | {
        readonly proposalAuthority: 'candidate';
        readonly candidateConsentProposalId?: never;
      }
    | {
        readonly proposalAuthority: 'witness';
        readonly candidateConsentProposalId: string;
      }
  );

/** Endorses one accepted takeover proposal under configured witness authority. */
export interface LeaseVotePayload {
  readonly type: 'lease.vote';
  readonly leaseVoteId: string;
  readonly takeoverProposalId: string;
  readonly witnessPeerId: string;
  readonly objectiveId: string;
}

/** Certifies one takeover proposal from a bounded set of witness votes. */
export interface LeaseCertificatePayload {
  readonly type: 'lease.certificate';
  readonly certificateId: string;
  readonly certificateAssemblerPeerId: string;
  readonly takeoverProposalId: string;
  readonly leaseVoteIds: readonly string[];
  readonly objectiveId: string;
}

/** One closed subject that Evidence may describe. */
export type MeshEvidenceSubject =
  | {
      readonly kind: 'peer';
      readonly peerId: string;
    }
  | {
      readonly kind: 'peer_capability';
      readonly peerId: string;
      readonly capabilityKey: string;
      readonly capabilityVersion: string;
      readonly capabilityRevision: number;
    };

/** Signed-envelope-relative scope expanded by the Trust normalizer. */
export type MeshEvidenceScope =
  | { readonly kind: 'mesh' }
  | { readonly kind: 'objective'; readonly objectiveRevision: number }
  | {
      readonly kind: 'work';
      readonly objectiveRevision: number;
      readonly workItemId: string;
      readonly workItemRevision: number;
      readonly assignmentEpoch: number;
      readonly assignmentAuthorityId: string;
      readonly fencingToken: string;
    };

/** Immutable typed basis or content reference used by Mesh Evidence. */
export interface MeshEvidenceReference {
  readonly schemaVersion: 1;
  readonly kind: 'evidence' | 'mesh_record' | 'control_record' | 'external';
  readonly referenceType: string;
  readonly referenceId: string;
  readonly referenceDigest: string;
}

/** Optional Evidence content. The reducer never dereferences this wire value. */
export type MeshEvidenceContent =
  | {
      readonly kind: 'inline_summary';
      readonly mediaType: string;
      readonly summary: string;
      readonly contentDigest: string;
      readonly encodedBytes: number;
    }
  | {
      readonly kind: 'reference';
      readonly mediaType: string;
      readonly reference: MeshEvidenceReference;
      readonly contentDigest: string;
      readonly encodedBytes: number;
    };

/** Immutable localizable claim emitted by the signed Evidence wire family. */
export interface EvidenceClaimPayload {
  readonly type: 'evidence.claim';
  readonly claimId: string;
  readonly subject: MeshEvidenceSubject;
  readonly scope: MeshEvidenceScope;
  readonly criterionId: string;
  readonly outcome: 'satisfied' | 'violated' | 'inconclusive';
  readonly assertionDigest: string;
  readonly content: MeshEvidenceContent | null;
  readonly basisReferences: readonly MeshEvidenceReference[];
  readonly observedAt: string | null;
}

/** Independent support, contradiction or inconclusive evaluation of one claim. */
export interface EvidenceAttestationPayload {
  readonly type: 'evidence.attest';
  readonly attestationId: string;
  readonly scope: MeshEvidenceScope;
  readonly claimId: string;
  readonly claimDigest: string;
  readonly disposition: 'support' | 'contradict' | 'inconclusive';
  readonly confidenceBasisPoints: number;
  readonly basisReferences: readonly MeshEvidenceReference[];
  readonly observedAt: string | null;
}

/** Bounded request to challenge one exact Claim or Attestation. */
export interface EvidenceChallengePayload {
  readonly type: 'evidence.challenge';
  readonly challengeId: string;
  readonly scope: MeshEvidenceScope;
  readonly targetKind: 'claim' | 'attestation';
  readonly targetId: string;
  readonly targetDigest: string;
  readonly reasonCode: string;
  readonly basisReferences: readonly MeshEvidenceReference[];
  readonly observedAt: string | null;
}

/** Append-only withdrawal by the original author of one exact target. */
export interface EvidenceRetractionPayload {
  readonly type: 'evidence.retract';
  readonly retractionId: string;
  readonly scope: MeshEvidenceScope;
  readonly targetKind: 'claim' | 'attestation';
  readonly targetId: string;
  readonly targetDigest: string;
  readonly reasonCode: string;
  readonly observedAt: string | null;
}

/** Redacted remote observation that is never a Fusion input in V1. */
export interface TrustObservationPayload {
  readonly type: 'trust.observation';
  readonly observationId: string;
  readonly subject: MeshEvidenceSubject;
  readonly scope: MeshEvidenceScope;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
  readonly profileDigest: string;
  readonly fusionDecisionDigest: string;
  readonly dimensionId: string;
  readonly scoreBand: 'unknown' | 'low' | 'medium' | 'high';
  readonly uncertaintyBand: 'low' | 'medium' | 'high';
  readonly disposition:
    'eligible' | 'restricted' | 'quarantined' | 'unavailable';
  readonly evidenceIds: readonly string[];
  readonly observedAt: string;
  readonly validUntil: string;
  readonly reasonCodes: readonly string[];
}

/** Structurally implemented protocol payload subset. */
export type MeshMessagePayload =
  | PeerHelloPayload
  | PeerCardPayload
  | PeerPingPayload
  | PeerPingAckPayload
  | PeerGoodbyePayload
  | CapabilityAdvertisePayload
  | CapabilityWithdrawPayload
  | ObjectiveAnnouncePayload
  | ObjectiveRevisePayload
  | ObjectiveCancelPayload
  | WorkOfferPayload
  | WorkBidPayload
  | WorkAwardPayload
  | WorkAcceptPayload
  | WorkDeclinePayload
  | WorkProgressPayload
  | WorkCheckpointPayload
  | WorkResultPayload
  | WorkReleasePayload
  | WorkCancelPayload
  | LeaseRenewPayload
  | LeaseTakeoverProposalPayload
  | LeaseVotePayload
  | LeaseCertificatePayload
  | EvidenceClaimPayload
  | EvidenceAttestationPayload
  | EvidenceChallengePayload
  | EvidenceRetractionPayload
  | TrustObservationPayload;

/** Shared fields that participate in envelope identity and signing. */
export interface MeshEnvelopeHeader<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
  TWireVersion extends MeshWireVersion = MeshWireVersion,
> {
  readonly protocol: typeof MESH_PROTOCOL;
  readonly wireVersion: TWireVersion;
  readonly messageId: string;
  readonly tenantId: string;
  readonly meshId: string;
  readonly objectiveId?: string;
  readonly type: TPayload['type'];
  readonly sender: MeshSender;
  readonly audience: MeshAudience;
  readonly sequence: number;
  readonly sentAt: string;
  readonly expiresAt: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly extensions?: Readonly<Record<string, MeshJsonValue>>;
  readonly criticalExtensions?: readonly string[];
}

/** Producer input before payload hashing and signature generation. */
export interface UnsignedMeshEnvelope<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
  TWireVersion extends MeshWireVersion = MeshWireVersion,
> extends MeshEnvelopeHeader<TPayload, TWireVersion> {
  readonly payload: TPayload;
  readonly proof: MeshProofHeader;
}

/** Structurally complete signed wire envelope. */
export interface MeshEnvelope<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
  TWireVersion extends MeshWireVersion = MeshWireVersion,
> extends MeshEnvelopeHeader<TPayload, TWireVersion> {
  readonly payloadHash: string;
  readonly payload: TPayload;
  readonly proof: MeshProof;
}

/** Canonical document signed after hashing the payload. */
export type MeshSigningDocument<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
  TWireVersion extends MeshWireVersion = MeshWireVersion,
> = Omit<MeshEnvelope<TPayload, TWireVersion>, 'payload' | 'proof'> & {
  proof: MeshProofHeader;
};

declare const signedMeshEnvelopeBrand: unique symbol;
declare const verifiedMeshEnvelopeBrand: unique symbol;

/** Envelope produced by an approved signer or strict wire parser. */
export type SignedMeshEnvelope<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
  TWireVersion extends MeshWireVersion = MeshWireVersion,
> = Readonly<
  MeshEnvelope<TPayload, TWireVersion> & {
    [signedMeshEnvelopeBrand]: true;
  }
>;

/** Signed envelope whose digest and proof have been verified locally. */
export type VerifiedMeshEnvelope<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
  TWireVersion extends MeshWireVersion = MeshWireVersion,
> = Readonly<
  SignedMeshEnvelope<TPayload, TWireVersion> & {
    [verifiedMeshEnvelopeBrand]: true;
  }
>;

/** Explicit compatibility aliases for version-narrowed consumers. */
export type MeshEnvelopeV0<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
> = MeshEnvelope<TPayload, typeof MESH_PREVIOUS_WIRE_VERSION>;
export type MeshEnvelopeV1<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
> = MeshEnvelope<TPayload, typeof MESH_WIRE_VERSION>;
export type SignedMeshEnvelopeV0<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
> = SignedMeshEnvelope<TPayload, typeof MESH_PREVIOUS_WIRE_VERSION>;
export type SignedMeshEnvelopeV1<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
> = SignedMeshEnvelope<TPayload, typeof MESH_WIRE_VERSION>;
export type UnsignedMeshEnvelopeV0<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
> = UnsignedMeshEnvelope<TPayload, typeof MESH_PREVIOUS_WIRE_VERSION>;
export type UnsignedMeshEnvelopeV1<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
> = UnsignedMeshEnvelope<TPayload, typeof MESH_WIRE_VERSION>;
export type VerifiedMeshEnvelopeV0<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
> = VerifiedMeshEnvelope<TPayload, typeof MESH_PREVIOUS_WIRE_VERSION>;
export type VerifiedMeshEnvelopeV1<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
> = VerifiedMeshEnvelope<TPayload, typeof MESH_WIRE_VERSION>;

/** Explicit parser and protocol bounds. */
export interface MeshProtocolLimits {
  readonly maximumEnvelopeBytes: number;
  readonly maximumPayloadBytes: number;
  readonly maximumNestingDepth: number;
  readonly maximumTotalObjectKeys: number;
  readonly maximumObjectKeys: number;
  readonly maximumTotalArrayItems: number;
  readonly maximumArrayItems: number;
  readonly maximumStringBytes: number;
  readonly maximumExtensions: number;
  readonly maximumCriticalExtensions: number;
  readonly maximumIdBytes: number;
  readonly maximumLifetimeMs: number;
  readonly clockSkewAllowanceMs: number;
  readonly replayWindowSize: number;
}

/** Default bounds from the protocol v0 design contract. */
export const DEFAULT_MESH_PROTOCOL_LIMITS: Readonly<MeshProtocolLimits> =
  Object.freeze({
    maximumEnvelopeBytes: 262_144,
    maximumPayloadBytes: 196_608,
    maximumNestingDepth: 32,
    maximumTotalObjectKeys: 2_048,
    maximumObjectKeys: 256,
    maximumTotalArrayItems: 4_096,
    maximumArrayItems: 1_024,
    maximumStringBytes: 65_536,
    maximumExtensions: 16,
    maximumCriticalExtensions: 8,
    maximumIdBytes: 256,
    maximumLifetimeMs: 10 * 60 * 1_000,
    clockSkewAllowanceMs: 2 * 60 * 1_000,
    replayWindowSize: 2_048,
  });

/** Stable fail-closed protocol errors safe for redacted telemetry. */
export type MeshProtocolErrorCode =
  | 'invalid_json'
  | 'invalid_json_value'
  | 'duplicate_object_key'
  | 'structural_limit_exceeded'
  | 'unknown_envelope_field'
  | 'invalid_protocol'
  | 'unsupported_wire_version'
  | 'invalid_identifier'
  | 'invalid_message_id'
  | 'invalid_sequence'
  | 'invalid_timestamp'
  | 'invalid_lifetime'
  | 'invalid_audience'
  | 'type_payload_mismatch'
  | 'invalid_payload'
  | 'invalid_payload_hash'
  | 'invalid_proof'
  | 'invalid_extension'
  | 'unknown_critical_extension'
  | 'scope_mismatch'
  | 'message_expired'
  | 'message_from_future'
  | 'unsupported_message_type';

/** Bounded issue returned without echoing the rejected payload. */
export interface MeshProtocolIssue {
  readonly code: MeshProtocolErrorCode;
  readonly path?: string;
}

/** Optional limit overrides used by pure parsing and serialization helpers. */
export interface MeshProtocolOptions {
  readonly limits?: Partial<MeshProtocolLimits>;
  /** Optional read-policy narrowing; unsupported versions cannot be added. */
  readonly acceptedWireVersions?: readonly MeshWireVersion[];
}

/** Local context applied after structural envelope validation. */
export interface MeshEnvelopeContext {
  readonly tenantId: string;
  readonly meshId: string;
  readonly peerId: string;
  readonly receivedAt: string;
  readonly subscribedTopics?: readonly MeshAudienceTopic[];
  readonly supportedCriticalExtensions?: readonly string[];
}

/** Exact chronological ordering between two valid protocol timestamps. */
export type MeshTimestampOrder = -1 | 0 | 1;

/** Generic validation result used across parsing and protocol stages. */
export type MeshProtocolResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
    }
  | {
      readonly ok: false;
      readonly issues: readonly MeshProtocolIssue[];
    };
