import {
  MESH_SIGNATURE_ALGORITHM,
  canonicalizeMeshJsonBytes,
} from "@agentplat/mesh-protocol";
import type {
  MeshSparseDeliveryV2,
  MeshSparseOverlayDigestV2,
} from "./sparse-overlay-contracts.js";
import type {
  MeshSparseDurableAdmissionV1,
  MeshSparseMembershipPeerV1,
} from "./sparse-overlay-runtime-contracts.js";
import type {
  MeshSparseNextHopTransportV1,
  MeshSparseTransportCatchUpResponseV1,
  MeshSparseTransportEndpointV1,
} from "./sparse-overlay-transport-contracts.js";
import { sha256Base64Url } from "./sha256.js";

/**
 * Authenticated, epoch-bound envelopes for the sparse peer transport.
 *
 * The transport deliberately does not define a directory, PKI or membership
 * protocol. Those decisions are supplied by the authority ports below.  The
 * only persisted evidence is public routing metadata, digests and signatures.
 */
export const MESH_AUTHENTICATED_OVERLAY_TRANSPORT_SCHEMA_VERSION_V1 =
  1 as const;

export type MeshAuthenticatedOverlayOperationV1 =
  "deliver" | "catch_up" | "fetch_causal";

export type MeshAuthenticatedOverlayRejectionCodeV1 =
  | "overlay_mismatch"
  | "recipient_mismatch"
  | "membership_epoch_mismatch"
  | "sender_not_active"
  | "recipient_not_active"
  | "peer_binding_invalid"
  | "key_not_accepted"
  | "key_revoked"
  | "key_not_yet_valid"
  | "key_expired"
  | "rotation_window_expired"
  | "signature_invalid"
  | "payload_digest_invalid"
  | "sequence_replayed"
  | "sequence_future"
  | "logical_time_future"
  | "request_binding_invalid"
  | "response_binding_invalid"
  | "state_rollback_detected"
  | "state_conflict"
  | "unsupported_operation";

export interface MeshAuthenticatedOverlayPeerIdentityV1 {
  readonly peerId: string;
  readonly peerIndex: number;
}

export interface MeshAuthenticatedOverlayProofV1 {
  readonly algorithm: typeof MESH_SIGNATURE_ALGORITHM;
  readonly keyId: string;
  readonly value: string;
}

interface MeshAuthenticatedOverlayBaseEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly overlayId: string;
  readonly membershipEpoch: number;
  readonly sender: MeshAuthenticatedOverlayPeerIdentityV1;
  readonly recipient: MeshAuthenticatedOverlayPeerIdentityV1;
  readonly sequence: number;
  readonly logicalTime: number;
  readonly payloadDigest: MeshSparseOverlayDigestV2;
  readonly proof: MeshAuthenticatedOverlayProofV1;
}

export interface MeshAuthenticatedOverlayRequestEnvelopeV1 extends MeshAuthenticatedOverlayBaseEnvelopeV1 {
  readonly kind: "request";
  readonly requestId: string;
  readonly operation: MeshAuthenticatedOverlayOperationV1;
  readonly body: unknown;
}

export interface MeshAuthenticatedOverlayResponseEnvelopeV1 extends MeshAuthenticatedOverlayBaseEnvelopeV1 {
  readonly kind: "response";
  readonly requestId: string;
  readonly requestDigest: MeshSparseOverlayDigestV2;
  readonly operation: MeshAuthenticatedOverlayOperationV1;
  readonly accepted: boolean;
  readonly reasonCode: MeshAuthenticatedOverlayRejectionCodeV1 | null;
  readonly body: unknown;
}

export type MeshAuthenticatedOverlayEnvelopeV1 =
  | MeshAuthenticatedOverlayRequestEnvelopeV1
  | MeshAuthenticatedOverlayResponseEnvelopeV1;

/** Membership and rotation truth is owned by the caller's certified authority. */
export interface MeshAuthenticatedOverlayMembershipAuthorityPortV1 {
  resolve(input: {
    readonly overlayId: string;
    readonly membershipEpoch: number;
    readonly peerId: string;
    readonly peerIndex: number;
    readonly logicalTime: number;
  }): Promise<{
    readonly active: boolean;
    readonly currentKeyId: string;
    /** A retiring key is accepted only through this explicit inclusive time. */
    readonly previousKeyId?: string;
    readonly previousKeyAcceptUntilLogicalTime?: number;
  } | null>;
}

/** Public-key material and revocation status; private keys never enter this port. */
export interface MeshAuthenticatedOverlayKeyAuthorityPortV1 {
  resolve(input: {
    readonly overlayId: string;
    readonly membershipEpoch: number;
    readonly peerId: string;
    readonly keyId: string;
    readonly logicalTime: number;
  }): Promise<{
    readonly status: "active" | "revoked";
    readonly publicKey: CryptoKey;
    readonly validFromLogicalTime: number;
    readonly validUntilLogicalTime: number;
  } | null>;
}

/** Key custody is intentionally opaque to the overlay transport. */
export interface MeshAuthenticatedOverlaySignerPortV1 {
  readonly keyId: string;
  sign(input: { readonly bytes: Uint8Array }): Promise<Uint8Array>;
}

/**
 * Atomic state plus monotonic-anchor persistence.
 *
 * A production adapter MUST commit `state` and the independently protected
 * anchor as one linearizable transition. It MUST never return a snapshot whose
 * anchor predates the returned state, and MUST reject any transition that
 * would regress the independently protected anchor. This boundary is the
 * anti-rollback trust boundary; callers cannot safely compose two separate
 * compare-and-set operations instead.
 */
export interface MeshAuthenticatedOverlayStateStoreV1 {
  loadCurrent(scope: string): Promise<
    | {
        readonly state: MeshAuthenticatedOverlayStateV1;
        readonly anchor: {
          readonly revision: number;
          readonly stateDigest: MeshSparseOverlayDigestV2;
        };
      }
    | undefined
  >;
  compareAndSet(input: {
    readonly scope: string;
    readonly expected: {
      readonly revision: number;
      readonly stateDigest: MeshSparseOverlayDigestV2;
    } | null;
    readonly next: MeshAuthenticatedOverlayStateV1;
  }): Promise<boolean>;
}

export interface MeshAuthenticatedOverlayInboundCursorV1 {
  readonly peerId: string;
  readonly membershipEpoch: number;
  readonly highestSequence: number;
}

export interface MeshAuthenticatedOverlayStateV1 {
  readonly schemaVersion: 1;
  readonly scope: string;
  readonly overlayId: string;
  readonly localPeer: MeshAuthenticatedOverlayPeerIdentityV1;
  readonly membershipEpoch: number;
  readonly revision: number;
  readonly nextOutboundSequence: number;
  readonly inboundCursors: readonly MeshAuthenticatedOverlayInboundCursorV1[];
  readonly lastLogicalTime: number;
  readonly previousStateDigest: MeshSparseOverlayDigestV2 | null;
  readonly stateDigest: MeshSparseOverlayDigestV2;
}

/** One narrow exchange boundary, adaptable to WebSocket, QUIC, HTTP or local tests. */
export interface MeshAuthenticatedOverlayNetworkPortV1 {
  exchange(input: {
    readonly recipient: MeshAuthenticatedOverlayPeerIdentityV1;
    readonly envelope: MeshAuthenticatedOverlayRequestEnvelopeV1;
    readonly logicalTime: number;
  }): Promise<MeshAuthenticatedOverlayResponseEnvelopeV1>;
}

export interface MeshAuthenticatedOverlayTransportOptionsV1 {
  readonly overlayId: string;
  readonly membershipEpoch: number;
  readonly localPeer: MeshAuthenticatedOverlayPeerIdentityV1;
  readonly signer: MeshAuthenticatedOverlaySignerPortV1;
  readonly membership: MeshAuthenticatedOverlayMembershipAuthorityPortV1;
  readonly keys: MeshAuthenticatedOverlayKeyAuthorityPortV1;
  readonly store: MeshAuthenticatedOverlayStateStoreV1;
  readonly network: MeshAuthenticatedOverlayNetworkPortV1;
  readonly maximumFutureSequence?: number;
  readonly maximumFutureLogicalTime?: number;
  readonly maximumInboundPeers?: number;
  readonly maximumCommitAttempts?: number;
  readonly crypto?: Crypto;
}

export interface MeshAuthenticatedOverlayEndpointOptionsV1 extends Omit<
  MeshAuthenticatedOverlayTransportOptionsV1,
  "network"
> {
  readonly endpoint: MeshSparseTransportEndpointV1;
}

const DEFAULT_LIMITS = Object.freeze({
  maximumFutureSequence: 4_096,
  maximumFutureLogicalTime: 30_000,
  maximumInboundPeers: 4_096,
  maximumCommitAttempts: 8,
});

/**
 * Authenticated next-hop adapter for MeshSparsePeerTransportRuntimeV1.
 * Pass it as that runtime's `nextHop`; the underlying durable overlay remains
 * responsible for queueing, causal recovery and delivery idempotency.
 */
export class MeshAuthenticatedSparseOverlayNextHopTransportV1 implements MeshSparseNextHopTransportV1 {
  readonly #runtime: AuthenticatedOverlayRuntimeV1;

  constructor(options: MeshAuthenticatedOverlayTransportOptionsV1) {
    this.#runtime = new AuthenticatedOverlayRuntimeV1(options);
  }

  async deliver(
    input: Parameters<MeshSparseNextHopTransportV1["deliver"]>[0],
  ): Promise<MeshSparseDurableAdmissionV1> {
    const response = await this.#request(
      "deliver",
      input.recipient,
      {
        overlayId: input.overlayId,
        membershipDigest: input.membershipDigest,
        sender: input.sender,
        delivery: input.delivery,
        logicalTime: input.logicalTime,
      },
      input.logicalTime,
    );
    return admissionFromResponse(response);
  }

  async catchUp(
    input: Parameters<MeshSparseNextHopTransportV1["catchUp"]>[0],
  ): Promise<MeshSparseTransportCatchUpResponseV1> {
    const response = await this.#request(
      "catch_up",
      input.recipient,
      {
        overlayId: input.overlayId,
        membershipDigest: input.membershipDigest,
        requester: input.requester,
        afterSequence: input.afterSequence,
        maximumItems: input.maximumItems,
        logicalTime: input.logicalTime,
      },
      input.logicalTime,
    );
    if (!response.accepted || !isObject(response.body))
      throw new Error("authenticated_overlay_catch_up_rejected");
    return response.body as unknown as MeshSparseTransportCatchUpResponseV1;
  }

  async fetchCausal(
    input: Parameters<MeshSparseNextHopTransportV1["fetchCausal"]>[0],
  ): Promise<MeshSparseDeliveryV2 | undefined> {
    const response = await this.#request(
      "fetch_causal",
      input.recipient,
      {
        overlayId: input.overlayId,
        membershipDigest: input.membershipDigest,
        requester: input.requester,
        deliveryDigest: input.deliveryDigest,
        logicalTime: input.logicalTime,
      },
      input.logicalTime,
    );
    if (!response.accepted) return undefined;
    return response.body === null
      ? undefined
      : (response.body as MeshSparseDeliveryV2);
  }

  async #request(
    operation: MeshAuthenticatedOverlayOperationV1,
    recipient: MeshSparseMembershipPeerV1,
    body: unknown,
    logicalTime: number,
  ): Promise<MeshAuthenticatedOverlayResponseEnvelopeV1> {
    const target = peerIdentity(recipient, "recipient");
    const envelope = await this.#runtime.createRequest(
      operation,
      target,
      body,
      logicalTime,
    );
    const response = await this.#runtime.network.exchange({
      recipient: target,
      envelope,
      logicalTime,
    });
    await this.#runtime.verifyAndRememberResponse(
      envelope,
      response,
      logicalTime,
    );
    return response;
  }
}

/** Endpoint adapter. It authenticates before invoking the durable overlay endpoint. */
export class MeshAuthenticatedSparseOverlayEndpointV1 {
  readonly #runtime: AuthenticatedOverlayRuntimeV1;
  readonly #endpoint: MeshSparseTransportEndpointV1;

  constructor(options: MeshAuthenticatedOverlayEndpointOptionsV1) {
    this.#runtime = new AuthenticatedOverlayRuntimeV1({
      ...options,
      network: rejectingNetwork(),
    });
    if (!options.endpoint)
      throw new TypeError("sparse overlay endpoint is required");
    this.#endpoint = options.endpoint;
  }

  async receive(input: {
    readonly envelope: MeshAuthenticatedOverlayRequestEnvelopeV1;
    readonly logicalTime: number;
  }): Promise<MeshAuthenticatedOverlayResponseEnvelopeV1> {
    let verified: MeshAuthenticatedOverlayRequestEnvelopeV1;
    try {
      verified = await this.#runtime.verifyAndRememberRequest(
        input.envelope,
        input.logicalTime,
      );
    } catch (error) {
      return this.#runtime.rejection(
        input.envelope,
        rejectionCode(error),
        input.logicalTime,
      );
    }
    try {
      const body = await this.#dispatch(verified);
      return this.#runtime.response(
        verified,
        true,
        null,
        body,
        input.logicalTime,
      );
    } catch {
      return this.#runtime.response(
        verified,
        false,
        "unsupported_operation",
        null,
        input.logicalTime,
      );
    }
  }

  async #dispatch(
    envelope: MeshAuthenticatedOverlayRequestEnvelopeV1,
  ): Promise<unknown> {
    const body = isObject(envelope.body)
      ? envelope.body
      : fail("request_binding_invalid");
    assertDispatchBinding(envelope, body);
    if (envelope.operation === "deliver") {
      const input = body as Parameters<
        MeshSparseTransportEndpointV1["receive"]
      >[0];
      return this.#endpoint.receive(input);
    }
    if (envelope.operation === "catch_up") {
      const input = body as Parameters<
        MeshSparseTransportEndpointV1["catchUp"]
      >[0];
      return this.#endpoint.catchUp(input);
    }
    if (envelope.operation === "fetch_causal") {
      const input = body as Parameters<
        MeshSparseTransportEndpointV1["fetchCausal"]
      >[0];
      return (await this.#endpoint.fetchCausal(input)) ?? null;
    }
    return fail("unsupported_operation");
  }
}

/**
 * Bounded in-memory reference persistence, suitable only for local development.
 * Its anchor shares process memory with the state and is therefore not an
 * independently protected production anti-rollback witness.
 */
export class InMemoryMeshAuthenticatedOverlayStateStoreV1
  implements MeshAuthenticatedOverlayStateStoreV1
{
  readonly #snapshots = new Map<
    string,
    {
      readonly state: MeshAuthenticatedOverlayStateV1;
      readonly anchor: {
        readonly revision: number;
        readonly stateDigest: MeshSparseOverlayDigestV2;
      };
    }
  >();

  async loadCurrent(scope: string): Promise<
    | {
        readonly state: MeshAuthenticatedOverlayStateV1;
        readonly anchor: {
          readonly revision: number;
          readonly stateDigest: MeshSparseOverlayDigestV2;
        };
      }
    | undefined
  > {
    const snapshot = this.#snapshots.get(scope);
    return snapshot ? structuredClone(snapshot) : undefined;
  }

  async compareAndSet(input: {
    readonly scope: string;
    readonly expected: {
      readonly revision: number;
      readonly stateDigest: MeshSparseOverlayDigestV2;
    } | null;
    readonly next: MeshAuthenticatedOverlayStateV1;
  }): Promise<boolean> {
    const current = this.#snapshots.get(input.scope);
    if (
      (current?.anchor.revision ?? null) !== (input.expected?.revision ?? null) ||
      (current?.anchor.stateDigest ?? null) !==
        (input.expected?.stateDigest ?? null)
    )
      return false;
    if (
      input.next.revision !== (current?.state.revision ?? -1) + 1 ||
      input.next.previousStateDigest !== (current?.state.stateDigest ?? null)
    )
      throw new Error("authenticated_overlay_invalid_state_transition");
    this.#snapshots.set(
      input.scope,
      structuredClone({
        state: input.next,
        anchor: {
          revision: input.next.revision,
          stateDigest: input.next.stateDigest,
        },
      }),
    );
    return true;
  }

  snapshot(): readonly MeshAuthenticatedOverlayStateV1[] {
    return Object.freeze(
      [...this.#snapshots.values()].map((snapshot) => snapshot.state),
    );
  }
}

/** Explicit local wiring for development; it is a route table, never a directory. */
export class InMemoryMeshAuthenticatedOverlayNetworkV1 implements MeshAuthenticatedOverlayNetworkPortV1 {
  readonly #endpoints = new Map<
    string,
    MeshAuthenticatedSparseOverlayEndpointV1
  >();

  connect(
    peer: MeshAuthenticatedOverlayPeerIdentityV1,
    endpoint: MeshAuthenticatedSparseOverlayEndpointV1,
  ): void {
    const identity = peerIdentity(peer, "peer");
    if (!endpoint)
      throw new TypeError("authenticated overlay endpoint is required");
    this.#endpoints.set(networkKey(identity), endpoint);
  }

  disconnect(peer: MeshAuthenticatedOverlayPeerIdentityV1): void {
    this.#endpoints.delete(networkKey(peerIdentity(peer, "peer")));
  }

  async exchange(input: {
    readonly recipient: MeshAuthenticatedOverlayPeerIdentityV1;
    readonly envelope: MeshAuthenticatedOverlayRequestEnvelopeV1;
    readonly logicalTime: number;
  }): Promise<MeshAuthenticatedOverlayResponseEnvelopeV1> {
    const endpoint = this.#endpoints.get(
      networkKey(peerIdentity(input.recipient, "recipient")),
    );
    if (!endpoint) throw new Error("authenticated_overlay_peer_unavailable");
    return endpoint.receive({
      envelope: input.envelope,
      logicalTime: input.logicalTime,
    });
  }
}

/** Opaque Web Crypto signer adapter; callers retain private-key lifecycle control. */
export class WebCryptoMeshAuthenticatedOverlaySignerV1 implements MeshAuthenticatedOverlaySignerPortV1 {
  constructor(
    readonly keyId: string,
    readonly privateKey: CryptoKey,
    readonly crypto: Crypto = globalThis.crypto,
  ) {
    identifier(keyId, "keyId");
    if (
      !crypto?.subtle ||
      privateKey.type !== "private" ||
      privateKey.algorithm.name !== MESH_SIGNATURE_ALGORITHM ||
      !privateKey.usages.includes("sign")
    )
      throw new TypeError("Web Crypto signing key is invalid");
  }
  async sign(input: { readonly bytes: Uint8Array }): Promise<Uint8Array> {
    return new Uint8Array(
      await this.crypto.subtle.sign(
        MESH_SIGNATURE_ALGORITHM,
        this.privateKey,
        copy(input.bytes),
      ),
    );
  }
}

class AuthenticatedOverlayRuntimeV1 {
  readonly network: MeshAuthenticatedOverlayNetworkPortV1;
  readonly #options: MeshAuthenticatedOverlayTransportOptionsV1;
  readonly #limits: Readonly<{
    maximumFutureSequence: number;
    maximumFutureLogicalTime: number;
    maximumInboundPeers: number;
    maximumCommitAttempts: number;
  }>;
  readonly #scope: string;

  constructor(options: MeshAuthenticatedOverlayTransportOptionsV1) {
    if (!options || typeof options !== "object")
      throw new TypeError("authenticated overlay options are required");
    identifier(options.overlayId, "overlayId");
    integer(options.membershipEpoch, "membershipEpoch", 0);
    peerIdentity(options.localPeer, "localPeer");
    identifier(options.signer?.keyId, "signer.keyId");
    if (
      !options.membership ||
      !options.keys ||
      !options.store ||
      !options.network
    )
      throw new TypeError(
        "authenticated overlay authority, state and network ports are required",
      );
    if (
      typeof options.membership.resolve !== "function" ||
      typeof options.keys.resolve !== "function" ||
      typeof options.store.loadCurrent !== "function" ||
      typeof options.store.compareAndSet !== "function" ||
      typeof options.network.exchange !== "function"
    )
      throw new TypeError("authenticated overlay port is invalid");
    this.#options = options;
    this.network = options.network;
    this.#limits = Object.freeze({
      maximumFutureSequence: positive(
        options.maximumFutureSequence,
        DEFAULT_LIMITS.maximumFutureSequence,
        "maximumFutureSequence",
      ),
      maximumFutureLogicalTime: positive(
        options.maximumFutureLogicalTime,
        DEFAULT_LIMITS.maximumFutureLogicalTime,
        "maximumFutureLogicalTime",
      ),
      maximumInboundPeers: positive(
        options.maximumInboundPeers,
        DEFAULT_LIMITS.maximumInboundPeers,
        "maximumInboundPeers",
      ),
      maximumCommitAttempts: positive(
        options.maximumCommitAttempts,
        DEFAULT_LIMITS.maximumCommitAttempts,
        "maximumCommitAttempts",
      ),
    });
    this.#scope = `authenticated-overlay:${options.overlayId}:${options.localPeer.peerId}:${options.membershipEpoch}`;
  }

  async createRequest(
    operation: MeshAuthenticatedOverlayOperationV1,
    recipient: MeshAuthenticatedOverlayPeerIdentityV1,
    body: unknown,
    logicalTime: number,
  ): Promise<MeshAuthenticatedOverlayRequestEnvelopeV1> {
    await this.#assertLocalSigningKey(logicalTime);
    const sequence = await this.#reserveOutbound(logicalTime);
    const payloadDigest = digest(body);
    const unsigned = {
      schemaVersion: 1 as const,
      kind: "request" as const,
      requestId: `authenticated-overlay:${this.#options.localPeer.peerId}:${sequence}`,
      overlayId: this.#options.overlayId,
      membershipEpoch: this.#options.membershipEpoch,
      sender: this.#options.localPeer,
      recipient,
      sequence,
      logicalTime,
      payloadDigest,
      operation,
      body,
      proof: {
        algorithm: MESH_SIGNATURE_ALGORITHM,
        keyId: this.#options.signer.keyId,
      },
    };
    return {
      ...unsigned,
      proof: {
        ...unsigned.proof,
        value: encode(
          await this.#options.signer.sign({ bytes: canonical(unsigned) }),
        ),
      },
    };
  }

  async verifyAndRememberRequest(
    envelope: MeshAuthenticatedOverlayRequestEnvelopeV1,
    logicalTime: number,
  ): Promise<MeshAuthenticatedOverlayRequestEnvelopeV1> {
    await this.#verifyAndRemember(envelope, logicalTime, "request");
    return envelope;
  }

  async verifyAndRememberResponse(
    request: MeshAuthenticatedOverlayRequestEnvelopeV1,
    response: MeshAuthenticatedOverlayResponseEnvelopeV1,
    logicalTime: number,
  ): Promise<void> {
    await this.#verifyEnvelope(response, logicalTime, "response");
    if (
      response.requestId !== request.requestId ||
      response.operation !== request.operation ||
      response.requestDigest !== digest(request) ||
      !samePeer(response.recipient, request.sender) ||
      !samePeer(response.sender, request.recipient)
    )
      fail("response_binding_invalid");
    // Do not consume a peer's sequence until this response is correlated to
    // the exact authenticated request that triggered it.
    await this.#rememberInbound(response, logicalTime);
  }

  async response(
    request: MeshAuthenticatedOverlayRequestEnvelopeV1,
    accepted: boolean,
    reasonCode: MeshAuthenticatedOverlayRejectionCodeV1 | null,
    body: unknown,
    logicalTime: number,
  ): Promise<MeshAuthenticatedOverlayResponseEnvelopeV1> {
    await this.#assertLocalSigningKey(logicalTime);
    const sequence = await this.#reserveOutbound(logicalTime);
    const unsigned = {
      schemaVersion: 1 as const,
      kind: "response" as const,
      requestId: request.requestId,
      requestDigest: digest(request),
      operation: request.operation,
      accepted,
      reasonCode,
      body,
      overlayId: this.#options.overlayId,
      membershipEpoch: this.#options.membershipEpoch,
      sender: this.#options.localPeer,
      recipient: request.sender,
      sequence,
      logicalTime,
      payloadDigest: digest(body),
      proof: {
        algorithm: MESH_SIGNATURE_ALGORITHM,
        keyId: this.#options.signer.keyId,
      },
    };
    return {
      ...unsigned,
      proof: {
        ...unsigned.proof,
        value: encode(
          await this.#options.signer.sign({ bytes: canonical(unsigned) }),
        ),
      },
    };
  }

  async rejection(
    request: MeshAuthenticatedOverlayRequestEnvelopeV1,
    reasonCode: MeshAuthenticatedOverlayRejectionCodeV1,
    logicalTime: number,
  ): Promise<MeshAuthenticatedOverlayResponseEnvelopeV1> {
    return this.response(request, false, reasonCode, null, logicalTime);
  }

  async #verifyAndRemember(
    envelope: MeshAuthenticatedOverlayEnvelopeV1,
    logicalTime: number,
    expectedKind: "request" | "response",
  ): Promise<void> {
    await this.#verifyEnvelope(envelope, logicalTime, expectedKind);
    await this.#rememberInbound(envelope, logicalTime);
  }

  async #verifyEnvelope(
    envelope: MeshAuthenticatedOverlayEnvelopeV1,
    logicalTime: number,
    expectedKind: "request" | "response",
  ): Promise<void> {
    integer(logicalTime, "logicalTime", 0);
    if (
      !envelope ||
      envelope.kind !== expectedKind ||
      envelope.schemaVersion !== 1
    )
      fail("request_binding_invalid");
    if (envelope.overlayId !== this.#options.overlayId)
      fail("overlay_mismatch");
    if (envelope.membershipEpoch !== this.#options.membershipEpoch)
      fail("membership_epoch_mismatch");
    if (!samePeer(envelope.recipient, this.#options.localPeer))
      fail("recipient_mismatch");
    peerIdentity(envelope.sender, "sender");
    peerIdentity(envelope.recipient, "recipient");
    integer(envelope.sequence, "sequence", 1);
    integer(envelope.logicalTime, "envelope logicalTime", 0);
    if (
      envelope.logicalTime >
      logicalTime + this.#limits.maximumFutureLogicalTime
    )
      fail("logical_time_future");
    const recipientMembership = await this.#options.membership.resolve({
      overlayId: this.#options.overlayId,
      membershipEpoch: this.#options.membershipEpoch,
      ...this.#options.localPeer,
      logicalTime,
    });
    if (!recipientMembership?.active) fail("recipient_not_active");
    if (
      !validDigest(envelope.payloadDigest) ||
      digest(envelope.body) !== envelope.payloadDigest
    )
      fail("payload_digest_invalid");
    if (
      envelope.proof?.algorithm !== MESH_SIGNATURE_ALGORITHM ||
      !identifier(envelope.proof?.keyId, "proof.keyId") ||
      !base64(envelope.proof?.value)
    )
      fail("signature_invalid");
    await this.#assertRemoteKey(envelope, logicalTime);
    const bytes = canonical({
      ...envelope,
      proof: {
        algorithm: envelope.proof.algorithm,
        keyId: envelope.proof.keyId,
      },
    });
    const key = await this.#options.keys.resolve({
      overlayId: envelope.overlayId,
      membershipEpoch: envelope.membershipEpoch,
      peerId: envelope.sender.peerId,
      keyId: envelope.proof.keyId,
      logicalTime,
    });
    if (!key || key.status !== "active")
      fail(key?.status === "revoked" ? "key_revoked" : "key_not_accepted");
    const verified = await crypto(this.#options.crypto).subtle.verify(
      MESH_SIGNATURE_ALGORITHM,
      key.publicKey,
      copy(decode(envelope.proof.value)),
      copy(bytes),
    );
    if (!verified) fail("signature_invalid");
  }

  async #assertLocalSigningKey(logicalTime: number): Promise<void> {
    const membership = await this.#options.membership.resolve({
      overlayId: this.#options.overlayId,
      membershipEpoch: this.#options.membershipEpoch,
      ...this.#options.localPeer,
      logicalTime,
    });
    if (!membership?.active) fail("sender_not_active");
    if (membership.currentKeyId !== this.#options.signer.keyId)
      fail("key_not_accepted");
    const key = await this.#options.keys.resolve({
      overlayId: this.#options.overlayId,
      membershipEpoch: this.#options.membershipEpoch,
      peerId: this.#options.localPeer.peerId,
      keyId: this.#options.signer.keyId,
      logicalTime,
    });
    if (!key || key.status === "revoked")
      fail(key?.status === "revoked" ? "key_revoked" : "key_not_accepted");
    if (logicalTime < key.validFromLogicalTime) fail("key_not_yet_valid");
    if (logicalTime >= key.validUntilLogicalTime) fail("key_expired");
  }

  async #assertRemoteKey(
    envelope: MeshAuthenticatedOverlayEnvelopeV1,
    logicalTime: number,
  ): Promise<void> {
    const membership = await this.#options.membership.resolve({
      overlayId: envelope.overlayId,
      membershipEpoch: envelope.membershipEpoch,
      ...envelope.sender,
      logicalTime,
    });
    if (!membership?.active) fail("sender_not_active");
    const isCurrent = membership.currentKeyId === envelope.proof.keyId;
    const isPrevious = membership.previousKeyId === envelope.proof.keyId;
    if (!isCurrent && !isPrevious) fail("key_not_accepted");
    if (
      isPrevious &&
      (membership.previousKeyAcceptUntilLogicalTime === undefined ||
        logicalTime > membership.previousKeyAcceptUntilLogicalTime)
    )
      fail("rotation_window_expired");
    const key = await this.#options.keys.resolve({
      overlayId: envelope.overlayId,
      membershipEpoch: envelope.membershipEpoch,
      peerId: envelope.sender.peerId,
      keyId: envelope.proof.keyId,
      logicalTime,
    });
    if (!key || key.status === "revoked")
      fail(key?.status === "revoked" ? "key_revoked" : "key_not_accepted");
    if (logicalTime < key.validFromLogicalTime) fail("key_not_yet_valid");
    if (logicalTime >= key.validUntilLogicalTime) fail("key_expired");
  }

  async #reserveOutbound(logicalTime: number): Promise<number> {
    let sequence = 0;
    await this.#mutate(logicalTime, (state) => {
      sequence = state.nextOutboundSequence;
      return stateWith(state, {
        nextOutboundSequence: sequence + 1,
        lastLogicalTime: Math.max(state.lastLogicalTime, logicalTime),
      });
    });
    return sequence;
  }

  async #rememberInbound(
    envelope: MeshAuthenticatedOverlayEnvelopeV1,
    logicalTime: number,
  ): Promise<void> {
    await this.#mutate(logicalTime, (state) => {
      const current = state.inboundCursors.find(
        (cursor) =>
          cursor.peerId === envelope.sender.peerId &&
          cursor.membershipEpoch === envelope.membershipEpoch,
      );
      const highest = current?.highestSequence ?? 0;
      if (envelope.sequence <= highest) fail("sequence_replayed");
      if (envelope.sequence > highest + this.#limits.maximumFutureSequence)
        fail("sequence_future");
      if (
        !current &&
        state.inboundCursors.length >= this.#limits.maximumInboundPeers
      )
        fail("state_conflict");
      const replacement: MeshAuthenticatedOverlayInboundCursorV1 =
        Object.freeze({
          peerId: envelope.sender.peerId,
          membershipEpoch: envelope.membershipEpoch,
          highestSequence: envelope.sequence,
        });
      return stateWith(state, {
        inboundCursors: Object.freeze(
          [
            ...state.inboundCursors.filter((cursor) => cursor !== current),
            replacement,
          ].sort(
            (left, right) =>
              left.peerId.localeCompare(right.peerId) ||
              left.membershipEpoch - right.membershipEpoch,
          ),
        ),
        lastLogicalTime: Math.max(state.lastLogicalTime, logicalTime),
      });
    });
  }

  async #mutate(
    logicalTime: number,
    operation: (
      state: MeshAuthenticatedOverlayStateV1,
    ) => MeshAuthenticatedOverlayStateV1,
  ): Promise<void> {
    for (
      let attempt = 0;
      attempt < this.#limits.maximumCommitAttempts;
      attempt += 1
    ) {
      const current = await this.#restore(logicalTime);
      const next = operation(current);
      if (
        !(await this.#options.store.compareAndSet({
          scope: this.#scope,
          expected: {
            revision: current.revision,
            stateDigest: current.stateDigest,
          },
          next,
        }))
      )
        continue;
      return;
    }
    fail("state_conflict");
  }

  async #restore(
    logicalTime: number,
  ): Promise<MeshAuthenticatedOverlayStateV1> {
    const snapshot = await this.#options.store.loadCurrent(this.#scope);
    if (snapshot) {
      const validated = validateState(snapshot.state, this.#scope, this.#options);
      if (
        snapshot.anchor.revision !== validated.revision ||
        snapshot.anchor.stateDigest !== validated.stateDigest
      )
        fail("state_rollback_detected");
      return validated;
    }
    const initial = stateWith(
      {
        schemaVersion: 1,
        scope: this.#scope,
        overlayId: this.#options.overlayId,
        localPeer: this.#options.localPeer,
        membershipEpoch: this.#options.membershipEpoch,
        revision: -1,
        nextOutboundSequence: 1,
        inboundCursors: [],
        lastLogicalTime: logicalTime,
        previousStateDigest: null,
        stateDigest: "sha256:bootstrap",
      },
      {},
    );
    if (
      await this.#options.store.compareAndSet({
        scope: this.#scope,
        expected: null,
        next: initial,
      }))
      return initial;
    const raced = await this.#options.store.loadCurrent(this.#scope);
    if (!raced) fail("state_conflict");
    const validated = validateState(raced.state, this.#scope, this.#options);
    if (
      raced.anchor.revision !== validated.revision ||
      raced.anchor.stateDigest !== validated.stateDigest
    )
      fail("state_rollback_detected");
    return validated;
  }
}

function stateWith(
  state: MeshAuthenticatedOverlayStateV1,
  change: Partial<
    Omit<
      MeshAuthenticatedOverlayStateV1,
      | "schemaVersion"
      | "scope"
      | "overlayId"
      | "localPeer"
      | "membershipEpoch"
      | "revision"
      | "previousStateDigest"
      | "stateDigest"
    >
  >,
): MeshAuthenticatedOverlayStateV1 {
  const base = {
    ...state,
    ...change,
    revision: state.revision + 1,
    previousStateDigest: state.revision < 0 ? null : state.stateDigest,
  };
  const stateDigest = digest(withoutStateDigest(base));
  return Object.freeze({ ...base, stateDigest });
}

function validateState(
  state: MeshAuthenticatedOverlayStateV1,
  scope: string,
  options: MeshAuthenticatedOverlayTransportOptionsV1,
): MeshAuthenticatedOverlayStateV1 {
  if (
    !state ||
    state.schemaVersion !== 1 ||
    state.scope !== scope ||
    state.overlayId !== options.overlayId ||
    state.membershipEpoch !== options.membershipEpoch ||
    !samePeer(state.localPeer, options.localPeer) ||
    !validDigest(state.stateDigest) ||
    state.revision < 0 ||
    state.nextOutboundSequence < 1
  )
    fail("state_rollback_detected");
  const calculated = digest(withoutStateDigest(state));
  if (calculated !== state.stateDigest) fail("state_rollback_detected");
  return state;
}

function admissionFromResponse(
  response: MeshAuthenticatedOverlayResponseEnvelopeV1,
): MeshSparseDurableAdmissionV1 {
  if (!response.accepted || !isObject(response.body))
    return Object.freeze({
      status: "rejected",
      reasonCode: response.reasonCode ?? "authenticated_overlay_rejected",
    });
  const result = response.body as MeshSparseDurableAdmissionV1;
  if (
    result.status === "admitted" ||
    result.status === "duplicate" ||
    result.status === "backpressured" ||
    result.status === "rejected"
  )
    return result;
  return Object.freeze({
    status: "rejected",
    reasonCode: "authenticated_overlay_response_invalid",
  });
}

function rejectingNetwork(): MeshAuthenticatedOverlayNetworkPortV1 {
  return {
    async exchange() {
      throw new Error("endpoint_has_no_outbound_network");
    },
  };
}
function peerIdentity(
  value: unknown,
  label: string,
): MeshAuthenticatedOverlayPeerIdentityV1 {
  if (!isObject(value)) throw new TypeError(`${label} is invalid`);
  return Object.freeze({
    peerId: identifier(value.peerId, `${label}.peerId`),
    peerIndex: integer(value.peerIndex, `${label}.peerIndex`, 0),
  });
}
function samePeer(
  left: MeshAuthenticatedOverlayPeerIdentityV1,
  right: MeshAuthenticatedOverlayPeerIdentityV1,
): boolean {
  return left.peerId === right.peerId && left.peerIndex === right.peerIndex;
}
function networkKey(peer: MeshAuthenticatedOverlayPeerIdentityV1): string {
  return `${peer.peerIndex}:${peer.peerId}`;
}
function assertDispatchBinding(
  envelope: MeshAuthenticatedOverlayRequestEnvelopeV1,
  body: Record<string, unknown>,
): void {
  if (
    body.overlayId !== envelope.overlayId ||
    body.logicalTime !== envelope.logicalTime
  )
    fail("request_binding_invalid");
  const actor = envelope.operation === "deliver" ? body.sender : body.requester;
  if (
    !isObject(actor) ||
    actor.peerId !== envelope.sender.peerId ||
    actor.peerIndex !== envelope.sender.peerIndex
  )
    fail("request_binding_invalid");
  if (envelope.operation === "deliver") {
    const delivery = body.delivery as { senderPeerIndex?: unknown } | undefined;
    if (!delivery || delivery.senderPeerIndex !== envelope.sender.peerIndex)
      fail("request_binding_invalid");
  }
}
function withoutStateDigest(
  state:
    | Omit<MeshAuthenticatedOverlayStateV1, "stateDigest">
    | MeshAuthenticatedOverlayStateV1,
) {
  const { stateDigest: _stateDigest, ...unsigned } =
    state as MeshAuthenticatedOverlayStateV1;
  return unsigned;
}
function identifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 256 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)
  )
    throw new TypeError(`${label} is invalid`);
  return value;
}
function integer(value: unknown, label: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    throw new TypeError(`${label} is invalid`);
  return value as number;
}
function positive(
  value: number | undefined,
  fallback: number,
  label: string,
): number {
  return integer(value ?? fallback, label, 1);
}
function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function canonical(value: unknown): Uint8Array {
  const result = canonicalizeMeshJsonBytes(value);
  if (!result.ok)
    throw new TypeError("authenticated overlay canonicalization failed");
  return result.value;
}
function digest(value: unknown): MeshSparseOverlayDigestV2 {
  const bytes = canonical(value);
  return `sha256:${sha256(bytes)}`;
}
function validDigest(value: unknown): value is MeshSparseOverlayDigestV2 {
  return typeof value === "string" && /^sha256:[A-Za-z0-9_-]{43}$/u.test(value);
}
function sha256(bytes: Uint8Array): string {
  return sha256Base64Url(bytes);
}
function encode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/=/gu, "")
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_");
}
function decode(value: string): Uint8Array {
  if (!base64(value)) fail("signature_invalid");
  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const binary = atob(
    normalized + "=".repeat((4 - (normalized.length % 4)) % 4),
  );
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
function base64(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]+$/u.test(value);
}
function copy(value: Uint8Array): ArrayBuffer {
  return value.slice().buffer;
}
function crypto(injected?: Crypto): Crypto {
  const value = injected ?? globalThis.crypto;
  if (!value?.subtle) throw new TypeError("Web Crypto is unavailable");
  return value;
}
function fail(code: MeshAuthenticatedOverlayRejectionCodeV1): never {
  const error = new Error(code);
  error.name = "MeshAuthenticatedOverlayTransportErrorV1";
  throw error;
}
function rejectionCode(
  error: unknown,
): MeshAuthenticatedOverlayRejectionCodeV1 {
  const message =
    error instanceof Error ? error.message : "unsupported_operation";
  return isRejection(message) ? message : "unsupported_operation";
}
function isRejection(
  value: string,
): value is MeshAuthenticatedOverlayRejectionCodeV1 {
  return [
    "overlay_mismatch",
    "recipient_mismatch",
    "membership_epoch_mismatch",
    "sender_not_active",
    "recipient_not_active",
    "peer_binding_invalid",
    "key_not_accepted",
    "key_revoked",
    "key_not_yet_valid",
    "key_expired",
    "rotation_window_expired",
    "signature_invalid",
    "payload_digest_invalid",
    "sequence_replayed",
    "sequence_future",
    "logical_time_future",
    "request_binding_invalid",
    "response_binding_invalid",
    "state_rollback_detected",
    "state_conflict",
    "unsupported_operation",
  ].includes(value);
}
