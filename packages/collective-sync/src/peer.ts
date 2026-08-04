import { MESH_SIGNATURE_ALGORITHM } from "@agentplat/mesh-protocol";
import type {
  CollectiveSyncAttestationPayloadV1,
  CollectiveSyncChunkPayloadV1,
  CollectiveSyncFrontierResponsePayloadV1,
  CollectiveSyncPayloadV1,
  CollectiveSyncReceiptAckPayloadV1,
  CollectiveSyncRequestPayloadV1,
  CollectiveSyncResponsePayloadV1,
  CollectiveSyncScopeV1,
  CollectiveSyncSigningV1,
  SignedCollectiveSyncEnvelopeV1,
  UnsignedCollectiveSyncEnvelopeV1,
  CollectiveSyncClockV1,
  CollectiveSyncMembershipV1,
  CollectiveSyncRepositoryV1,
} from "./contracts.js";
import {
  COLLECTIVE_SYNC_PROTOCOL_V1,
  COLLECTIVE_SYNC_SCHEMA_VERSION_V1,
} from "./contracts.js";
import {
  verifyCollectiveSyncEnvelopeV1,
  signCollectiveSyncEnvelopeV1,
  collectiveSyncMessageIdV1,
} from "./crypto.js";
import {
  collectiveSyncChunkDigestV1,
  verifyCollectiveSyncFrontierV1,
} from "./records.js";

export interface CollectiveSyncPeerOptionsV1 {
  readonly scope: CollectiveSyncScopeV1;
  readonly signing: CollectiveSyncSigningV1;
  readonly membership: CollectiveSyncMembershipV1;
  readonly repository: CollectiveSyncRepositoryV1;
  readonly clock: CollectiveSyncClockV1;
  readonly responseTtlMs?: number;
  /** Largest signed request lifetime accepted from another member. */
  readonly maximumEnvelopeTtlMs?: number;
}

/** Authenticated member-only responder for frontier, chunk, receipt, and attestation exchange. */
export class CollectiveSyncPeerV1 {
  readonly #ttl: number;
  readonly #maximumEnvelopeTtl: number;
  constructor(readonly options: CollectiveSyncPeerOptionsV1) {
    if (
      !options?.scope ||
      !options.repository ||
      !options.membership ||
      !options.clock ||
      !options.signing
    )
      throw new TypeError("collective sync peer options are required");
    if (options.signing.algorithm !== MESH_SIGNATURE_ALGORITHM)
      throw new TypeError("collective sync requires Ed25519");
    this.#ttl = bounded(
      options.responseTtlMs ?? 30_000,
      1_000,
      300_000,
      "responseTtlMs",
    );
    this.#maximumEnvelopeTtl = bounded(
      options.maximumEnvelopeTtlMs ?? 30_000,
      1_000,
      300_000,
      "maximumEnvelopeTtlMs",
    );
  }

  async handle(
    input: unknown,
  ): Promise<SignedCollectiveSyncEnvelopeV1<CollectiveSyncResponsePayloadV1> | null> {
    const now = this.options.clock.now();
    const request =
      await verifyCollectiveSyncEnvelopeV1<CollectiveSyncRequestPayloadV1>({
        envelope: input,
        resolver: this.options.membership,
        verifiedAt: now.wallTime,
      });
    if (
      !request ||
      !this.#scopeMatches(request) ||
      !validEnvelopeTime(
        request.issuedAt,
        request.expiresAt,
        now.wallTime,
        this.#maximumEnvelopeTtl,
      )
    )
      return null;
    const binding = await this.options.membership.resolveBinding({
      epoch: request.payload.membershipEpoch,
      configurationDigest: request.payload.membershipConfigurationDigest,
      logicalTimeMs: now.logicalTimeMs,
    });
    if (
      !binding ||
      !boundInstance(
        binding.memberInstances,
        request.senderPeerId,
        request.senderInstanceId,
      ) ||
      !boundInstance(
        binding.memberInstances,
        this.options.scope.peerId,
        this.options.scope.instanceId,
      )
    )
      return null;
    const response = await this.#respond(request, binding, now.logicalTimeMs);
    if (!response) return null;
    return this.#sign(request, response, now.wallTime);
  }

  async #respond(
    request: SignedCollectiveSyncEnvelopeV1<CollectiveSyncRequestPayloadV1>,
    binding: Awaited<
      ReturnType<CollectiveSyncMembershipV1["resolveBinding"]>
    > & {},
    logicalTimeMs: number,
  ): Promise<CollectiveSyncResponsePayloadV1 | null> {
    const payload = request.payload;
    if (payload.type === "sync.frontier.request") {
      if (payload.localFrontier.syncDomain !== payload.syncDomain) return null;
      const frontier = await this.options.repository.frontier({
        syncDomain: payload.syncDomain,
        membership: binding,
      });
      return Object.freeze<CollectiveSyncFrontierResponsePayloadV1>({
        type: "sync.frontier.response",
        requestMessageId: request.messageId,
        sessionId: payload.sessionId,
        sourcePeerId: this.options.scope.peerId,
        membershipEpoch: binding.epoch,
        membershipConfigurationDigest: binding.configurationDigest,
        frontier,
        respondedAtLogicalMs: logicalTimeMs,
      });
    }
    if (payload.type === "sync.chunk.request") {
      const sourceFrontier = await this.options.repository.frontier({
        syncDomain: payload.syncDomain,
        membership: binding,
      });
      if (sourceFrontier.frontierDigest !== payload.targetFrontierDigest)
        return null;
      const chunk = await this.options.repository.readAfter({
        syncDomain: payload.syncDomain,
        membership: binding,
        cursors: payload.cursors,
        maximumRecords: payload.maximumRecords,
        maximumBytes: payload.maximumBytes,
      });
      const chunkDigest = await collectiveSyncChunkDigestV1({
        sessionId: payload.sessionId,
        sourceFrontierDigest: sourceFrontier.frontierDigest,
        records: chunk.records,
        nextCursors: chunk.nextCursors,
        hasMore: chunk.hasMore,
      });
      return Object.freeze<CollectiveSyncChunkPayloadV1>({
        type: "sync.chunk",
        requestMessageId: request.messageId,
        sessionId: payload.sessionId,
        syncDomain: payload.syncDomain,
        membershipEpoch: binding.epoch,
        membershipConfigurationDigest: binding.configurationDigest,
        sourceFrontier,
        records: chunk.records,
        nextCursors: chunk.nextCursors,
        hasMore: chunk.hasMore,
        chunkDigest,
        respondedAtLogicalMs: logicalTimeMs,
      });
    }
    if (payload.type === "sync.receipt") {
      await this.options.repository.saveReceipt(
        request as SignedCollectiveSyncEnvelopeV1<typeof payload>,
      );
      return Object.freeze<CollectiveSyncReceiptAckPayloadV1>({
        type: "sync.receipt.ack",
        requestMessageId: request.messageId,
        sessionId: payload.sessionId,
        membershipEpoch: binding.epoch,
        membershipConfigurationDigest: binding.configurationDigest,
        chunkDigest: payload.chunkDigest,
        acceptedAtLogicalMs: logicalTimeMs,
      });
    }
    const frontier = await verifyCollectiveSyncFrontierV1(payload.frontier);
    const local = await this.options.repository.frontier({
      syncDomain: payload.syncDomain,
      membership: binding,
    });
    if (
      !frontier ||
      frontier.frontierDigest !== local.frontierDigest ||
      payload.targetPeerId !== request.senderPeerId ||
      payload.targetInstanceId !== request.senderInstanceId
    )
      return null;
    return Object.freeze<CollectiveSyncAttestationPayloadV1>({
      type: "sync.attestation",
      requestMessageId: request.messageId,
      sessionId: payload.sessionId,
      syncDomain: payload.syncDomain,
      targetPeerId: payload.targetPeerId,
      targetInstanceId: payload.targetInstanceId,
      attesterPeerId: this.options.scope.peerId,
      membershipEpoch: binding.epoch,
      membershipConfigurationDigest: binding.configurationDigest,
      frontierDigest: frontier.frontierDigest,
      attestedAtLogicalMs: logicalTimeMs,
    });
  }

  async #sign<TPayload extends CollectiveSyncPayloadV1>(
    request: SignedCollectiveSyncEnvelopeV1,
    payload: TPayload,
    issuedAt: string,
  ): Promise<SignedCollectiveSyncEnvelopeV1<TPayload>> {
    const messageId = await collectiveSyncMessageIdV1("response", {
      requestMessageId: request.messageId,
      senderPeerId: this.options.scope.peerId,
      payload,
    });
    const envelope: UnsignedCollectiveSyncEnvelopeV1<TPayload> = {
      protocol: COLLECTIVE_SYNC_PROTOCOL_V1,
      schemaVersion: COLLECTIVE_SYNC_SCHEMA_VERSION_V1,
      messageId,
      tenantId: this.options.scope.tenantId,
      meshId: this.options.scope.meshId,
      policyDomainId: this.options.scope.policyDomainId,
      senderPeerId: this.options.scope.peerId,
      senderInstanceId: this.options.scope.instanceId,
      audiencePeerId: request.senderPeerId,
      audienceInstanceId: request.senderInstanceId,
      issuedAt,
      expiresAt: new Date(Date.parse(issuedAt) + this.#ttl).toISOString(),
      payload,
      proof: {
        algorithm: this.options.signing.algorithm,
        keyId: this.options.signing.keyId,
      },
    };
    return signCollectiveSyncEnvelopeV1({
      envelope,
      privateKey: this.options.signing.privateKey,
    });
  }

  #scopeMatches(envelope: SignedCollectiveSyncEnvelopeV1): boolean {
    const scope = this.options.scope;
    return (
      envelope.tenantId === scope.tenantId &&
      envelope.meshId === scope.meshId &&
      envelope.policyDomainId === scope.policyDomainId &&
      envelope.audiencePeerId === scope.peerId &&
      envelope.audienceInstanceId === scope.instanceId
    );
  }
}

function boundInstance(
  instances: readonly {
    readonly peerId: string;
    readonly instanceId: string;
  }[],
  peerId: string,
  instanceId: string,
): boolean {
  return instances.some(
    (entry) => entry.peerId === peerId && entry.instanceId === instanceId,
  );
}
function bounded(
  value: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new TypeError(`${name} is out of range`);
  return value;
}

function validEnvelopeTime(
  issuedAt: string,
  expiresAt: string,
  now: string,
  maximumTtlMs: number,
): boolean {
  const issued = Date.parse(issuedAt);
  const expires = Date.parse(expiresAt);
  const current = Date.parse(now);
  return (
    Number.isFinite(issued) &&
    Number.isFinite(expires) &&
    Number.isFinite(current) &&
    current < expires &&
    expires - issued <= maximumTtlMs
  );
}
