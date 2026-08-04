import { compareMeshTimestamps } from "@agentplat/mesh-protocol";
import type {
  CollectiveMembershipCommitAckPayloadV1,
  CollectiveMembershipCommitRequestPayloadV1,
  CollectiveMembershipPayloadV1,
  CollectiveMembershipPeerHandleResultV1,
  CollectiveMembershipPeerOptionsV1,
  CollectiveMembershipResponsePayloadV1,
  CollectiveMembershipVotePayloadV1,
  CollectiveMembershipVoteRequestPayloadV1,
  SignedCollectiveMembershipEnvelopeV1,
  UnsignedCollectiveMembershipEnvelopeV1,
} from "./contracts.js";
import {
  COLLECTIVE_MEMBERSHIP_PROTOCOL_V1,
  COLLECTIVE_MEMBERSHIP_SCHEMA_VERSION_V1,
} from "./contracts.js";
import {
  collectiveMembershipMessageIdV1,
  signCollectiveMembershipEnvelopeV1,
  verifyCollectiveMembershipEnvelopeV1,
} from "./crypto.js";
import { verifyCollectiveMembershipTransitionProposalV1 } from "./configuration.js";
import { verifyCollectiveMembershipCertificateV1 } from "./certificate.js";

const DEFAULT_MAXIMUM_ENVELOPE_TTL_MS = 30_000;

/** Independently hosted voter and transition-commit endpoint. */
export class CollectiveMembershipPeerV1 {
  readonly #maximumEnvelopeTtlMs: number;

  constructor(readonly options: CollectiveMembershipPeerOptionsV1) {
    assertOptions(options);
    this.#maximumEnvelopeTtlMs =
      options.maximumEnvelopeTtlMs ?? DEFAULT_MAXIMUM_ENVELOPE_TTL_MS;
  }

  async handle(
    candidate: unknown,
  ): Promise<CollectiveMembershipPeerHandleResultV1> {
    const now = this.options.clock.now();
    const request = await verifyCollectiveMembershipEnvelopeV1({
      envelope: candidate,
      resolver: this.options.registry,
      verifiedAt: now.wallTime,
      crypto: this.options.crypto,
    });
    if (!request) return { accepted: false, code: "invalid_envelope" };
    if (
      request.tenantId !== this.options.scope.tenantId ||
      request.meshId !== this.options.scope.meshId ||
      request.audiencePeerId !== this.options.scope.peerId
    )
      return { accepted: false, code: "wrong_audience" };
    if (!validEnvelopeTime(request, now.wallTime, this.#maximumEnvelopeTtlMs))
      return { accepted: false, code: "expired" };
    if (request.payload.type === "membership.transition.vote.request")
      return this.#vote(
        request as SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipVoteRequestPayloadV1>,
        now.wallTime,
        now.logicalTimeMs,
      );
    return this.#commit(
      request as SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipCommitRequestPayloadV1>,
      now.wallTime,
      now.logicalTimeMs,
    );
  }

  async #vote(
    request: SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipVoteRequestPayloadV1>,
    wallTime: string,
    logicalTimeMs: number,
  ): Promise<CollectiveMembershipPeerHandleResultV1> {
    const current = this.options.registry.current();
    const proposal = await verifyCollectiveMembershipTransitionProposalV1({
      current,
      proposal: request.payload.proposal,
      crypto: this.options.crypto,
    });
    if (
      !proposal ||
      request.payload.requestedAtLogicalMs < proposal.proposedAtLogicalMs ||
      request.payload.requestedAtLogicalMs >= proposal.expiresAtLogicalMs ||
      logicalTimeMs >= proposal.expiresAtLogicalMs
    )
      return { accepted: false, code: "transition_rejected" };
    const currentMembers = new Map(
      current.members.map(({ peerId, instanceId }) => [peerId, instanceId]),
    );
    const nextMembers = new Map(
      proposal.nextConfiguration.members.map(({ peerId, instanceId }) => [
        peerId,
        instanceId,
      ]),
    );
    if (
      currentMembers.get(request.senderPeerId) !== request.senderInstanceId ||
      (currentMembers.get(this.options.scope.peerId) !==
        this.options.scope.instanceId &&
        nextMembers.get(this.options.scope.peerId) !==
          this.options.scope.instanceId)
    )
      return { accepted: false, code: "not_member" };
    const response = await this.options.repository.voteTransition({
      fromEpoch: proposal.fromEpoch,
      proposalDigest: proposal.proposalDigest,
      requestMessageId: request.messageId,
      create: async () => {
        const payload: CollectiveMembershipVotePayloadV1 = {
          type: "membership.transition.vote",
          requestMessageId: request.messageId,
          proposalId: proposal.proposalId,
          proposalDigest: proposal.proposalDigest,
          voterPeerId: this.options.scope.peerId,
          fromEpoch: proposal.fromEpoch,
          toEpoch: proposal.toEpoch,
          previousConfigurationDigest: proposal.previousConfigurationDigest,
          nextConfigurationDigest:
            proposal.nextConfiguration.configurationDigest,
          approvedAtLogicalMs: Math.max(
            request.payload.requestedAtLogicalMs,
            logicalTimeMs,
          ),
        };
        return this.#signResponse(
          payload,
          request.senderPeerId,
          wallTime,
          boundedExpiry(
            wallTime,
            request.expiresAt,
            this.#maximumEnvelopeTtlMs,
          ),
        );
      },
    });
    return response
      ? { accepted: true, code: "accepted", response }
      : { accepted: false, code: "vote_conflict" };
  }

  async #commit(
    request: SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipCommitRequestPayloadV1>,
    wallTime: string,
    logicalTimeMs: number,
  ): Promise<CollectiveMembershipPeerHandleResultV1> {
    const certificate = request.payload.certificate;
    const current = this.options.registry.current();
    const previous = this.options.registry.configuration(
      certificate.proposal.fromEpoch,
    );
    if (
      !previous ||
      (current.epoch !== certificate.proposal.fromEpoch &&
        current.epoch !== certificate.proposal.toEpoch)
    )
      return { accepted: false, code: "certificate_rejected" };
    const verified = await verifyCollectiveMembershipCertificateV1({
      current: previous,
      certificate,
      crypto: this.options.crypto,
    });
    if (!verified) return { accepted: false, code: "certificate_rejected" };
    const members = new Map(
      [...previous.members, ...verified.proposal.nextConfiguration.members].map(
        ({ peerId, instanceId }) => [peerId, instanceId],
      ),
    );
    if (
      members.get(request.senderPeerId) !== request.senderInstanceId ||
      members.get(this.options.scope.peerId) !== this.options.scope.instanceId
    )
      return { accepted: false, code: "not_member" };
    const committed = await this.options.repository.commitTransition({
      expectedEpoch: previous.epoch,
      certificate: verified,
    });
    if (!committed) return { accepted: false, code: "certificate_rejected" };
    await this.options.registry.apply(verified.proposal.nextConfiguration);
    const payload: CollectiveMembershipCommitAckPayloadV1 = {
      type: "membership.transition.commit.ack",
      requestMessageId: request.messageId,
      certificateId: verified.certificateId,
      configurationEpoch: verified.proposal.toEpoch,
      configurationDigest:
        verified.proposal.nextConfiguration.configurationDigest,
      committedAtLogicalMs: Math.max(
        request.payload.requestedAtLogicalMs,
        logicalTimeMs,
      ),
    };
    return {
      accepted: true,
      code: "accepted",
      response: await this.#signResponse(
        payload,
        request.senderPeerId,
        wallTime,
        boundedExpiry(wallTime, request.expiresAt, this.#maximumEnvelopeTtlMs),
      ),
    };
  }

  async #signResponse<TPayload extends CollectiveMembershipResponsePayloadV1>(
    payload: TPayload,
    audiencePeerId: string,
    issuedAt: string,
    expiresAt: string,
  ): Promise<SignedCollectiveMembershipEnvelopeV1<TPayload>> {
    const scope = this.options.scope;
    const messageId = await collectiveMembershipMessageIdV1(
      payload.type.replaceAll(".", "-"),
      { payload, audiencePeerId, senderPeerId: scope.peerId, issuedAt },
      this.options.crypto,
    );
    const envelope: UnsignedCollectiveMembershipEnvelopeV1<TPayload> = {
      protocol: COLLECTIVE_MEMBERSHIP_PROTOCOL_V1,
      schemaVersion: COLLECTIVE_MEMBERSHIP_SCHEMA_VERSION_V1,
      messageId,
      tenantId: scope.tenantId,
      meshId: scope.meshId,
      senderPeerId: scope.peerId,
      senderInstanceId: scope.instanceId,
      audiencePeerId,
      issuedAt,
      expiresAt,
      payload,
      proof: {
        algorithm: this.options.signing.algorithm,
        keyId: this.options.signing.keyId,
      },
    };
    return signCollectiveMembershipEnvelopeV1({
      envelope,
      privateKey: this.options.signing.privateKey,
      crypto: this.options.crypto,
    });
  }
}

function assertOptions(options: CollectiveMembershipPeerOptionsV1): void {
  if (
    !options?.scope?.tenantId ||
    !options.scope.meshId ||
    !options.scope.peerId ||
    !options.scope.instanceId ||
    !options.scope.policyDomainId ||
    !options.signing?.privateKey ||
    !options.signing.keyId ||
    !options.registry ||
    !options.repository ||
    !options.clock
  )
    throw new TypeError("Collective membership peer options are required");
  const ttl = options.maximumEnvelopeTtlMs ?? DEFAULT_MAXIMUM_ENVELOPE_TTL_MS;
  if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > 300_000)
    throw new RangeError("maximumEnvelopeTtlMs is out of range");
}

function validEnvelopeTime(
  envelope: SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipPayloadV1>,
  now: string,
  maximumTtlMs: number,
): boolean {
  const expiry = compareMeshTimestamps(now, envelope.expiresAt);
  const maximum = new Date(
    Date.parse(envelope.issuedAt) + maximumTtlMs,
  ).toISOString();
  const bounded = compareMeshTimestamps(envelope.expiresAt, maximum);
  return expiry.ok && expiry.value < 0 && bounded.ok && bounded.value <= 0;
}

function boundedExpiry(
  issuedAt: string,
  requested: string,
  maximumTtlMs: number,
): string {
  const local = new Date(Date.parse(issuedAt) + maximumTtlMs).toISOString();
  const order = compareMeshTimestamps(local, requested);
  return order.ok && order.value < 0 ? local : requested;
}
