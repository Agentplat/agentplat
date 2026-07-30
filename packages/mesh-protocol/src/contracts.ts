/** Public protocol contracts shared by parsing and validation. */
/** Exact protocol identifier signed by every Mesh peer. */
export const MESH_PROTOCOL = 'agentplat.mesh' as const;

/** Alpha releases use wire version zero until beta fixtures are frozen. */
export const MESH_WIRE_VERSION = 0 as const;

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

/** Requests a direct liveness response from the audience peer. */
export interface PeerPingPayload {
  readonly type: 'peer.ping';
}

/** Responds to one accepted ping named by the envelope causation ID. */
export interface PeerPingAckPayload {
  readonly type: 'peer.ping_ack';
}

/** Payload subset implemented by the Alpha 1 vertical slice. */
export type MeshMessagePayload =
  PeerHelloPayload | PeerPingPayload | PeerPingAckPayload;

/** Shared fields that participate in envelope identity and signing. */
export interface MeshEnvelopeHeader<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
> {
  readonly protocol: typeof MESH_PROTOCOL;
  readonly wireVersion: typeof MESH_WIRE_VERSION;
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
> extends MeshEnvelopeHeader<TPayload> {
  readonly payload: TPayload;
  readonly proof: MeshProofHeader;
}

/** Structurally complete signed wire envelope. */
export interface MeshEnvelope<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
> extends MeshEnvelopeHeader<TPayload> {
  readonly payloadHash: string;
  readonly payload: TPayload;
  readonly proof: MeshProof;
}

/** Canonical document signed after hashing the payload. */
export type MeshSigningDocument<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
> = Omit<MeshEnvelope<TPayload>, 'payload' | 'proof'> & {
  proof: MeshProofHeader;
};

declare const signedMeshEnvelopeBrand: unique symbol;
declare const verifiedMeshEnvelopeBrand: unique symbol;

/** Envelope produced by an approved signer or strict wire parser. */
export type SignedMeshEnvelope<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
> = Readonly<
  MeshEnvelope<TPayload> & {
    [signedMeshEnvelopeBrand]: true;
  }
>;

/** Signed envelope whose digest and proof have been verified locally. */
export type VerifiedMeshEnvelope<
  TPayload extends MeshMessagePayload = MeshMessagePayload,
> = Readonly<
  SignedMeshEnvelope<TPayload> & {
    [verifiedMeshEnvelopeBrand]: true;
  }
>;

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
