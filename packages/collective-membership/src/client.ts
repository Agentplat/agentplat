import { compareMeshTimestamps } from "@agentplat/mesh-protocol";
import type {
  CollectiveMembershipCertificateV1,
  CollectiveMembershipClientOptionsV1,
  CollectiveMembershipCommitRequestPayloadV1,
  CollectiveMembershipRequestPayloadV1,
  CollectiveMembershipResponsePayloadV1,
  CollectiveMembershipTransitionProposalV1,
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
import { createCollectiveMembershipCertificateV1 } from "./certificate.js";
import { InMemoryCollectiveMembershipRegistryV1 } from "./registry.js";

const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_MAXIMUM_ENVELOPE_TTL_MS = 30_000;

/** Per-transition proposer; any current member may initiate the next epoch. */
export class CollectiveMembershipClientV1 {
  readonly #requestTimeoutMs: number;
  readonly #maximumEnvelopeTtlMs: number;

  constructor(readonly options: CollectiveMembershipClientOptionsV1) {
    assertOptions(options);
    this.#requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.#maximumEnvelopeTtlMs =
      options.maximumEnvelopeTtlMs ?? DEFAULT_MAXIMUM_ENVELOPE_TTL_MS;
  }

  async transition(
    candidate: CollectiveMembershipTransitionProposalV1,
  ): Promise<CollectiveMembershipCertificateV1 | null> {
    const current = this.options.registry.current();
    const proposal = await verifyCollectiveMembershipTransitionProposalV1({
      current,
      proposal: candidate,
      crypto: this.options.crypto,
    });
    const now = this.options.clock.now();
    if (
      !proposal ||
      !current.members.some(
        ({ peerId, instanceId }) =>
          peerId === this.options.scope.peerId &&
          instanceId === this.options.scope.instanceId,
      ) ||
      now.logicalTimeMs < proposal.proposedAtLogicalMs ||
      now.logicalTimeMs >= proposal.expiresAtLogicalMs
    )
      return null;
    const union = unionPeerIds(current, proposal.nextConfiguration);
    const preview = await InMemoryCollectiveMembershipRegistryV1.create({
      configurations: [current, proposal.nextConfiguration],
      crypto: this.options.crypto,
    });
    const votePayload: CollectiveMembershipVoteRequestPayloadV1 = {
      type: "membership.transition.vote.request",
      proposal,
      requestedAtLogicalMs: now.logicalTimeMs,
    };
    const exchanges = await this.#exchangeMany(votePayload, union, preview);
    const valid = exchanges
      .filter(({ peerId, request, response }) =>
        validVote(proposal, peerId, request, response),
      )
      .sort((left, right) => left.peerId.localeCompare(right.peerId));
    const currentMembers = new Set(current.members.map(({ peerId }) => peerId));
    const nextMembers = new Set(
      proposal.nextConfiguration.members.map(({ peerId }) => peerId),
    );
    if (
      valid.filter(({ peerId }) => currentMembers.has(peerId)).length <
        current.quorumThreshold ||
      valid.filter(({ peerId }) => nextMembers.has(peerId)).length <
        proposal.nextConfiguration.quorumThreshold
    )
      return null;
    const certifiedAt = this.options.clock.now();
    const certificate = await createCollectiveMembershipCertificateV1({
      current,
      proposal,
      requests: valid.map(({ request }) => request),
      votes: valid.map(
        ({ response }) =>
          response as SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipVotePayloadV1>,
      ),
      certifiedAt: certifiedAt.wallTime,
      certifiedAtLogicalMs: certifiedAt.logicalTimeMs,
      crypto: this.options.crypto,
    });
    await this.options.repository.saveCertificate(certificate);
    const commitPayload: CollectiveMembershipCommitRequestPayloadV1 = {
      type: "membership.transition.commit.request",
      certificate,
      requestedAtLogicalMs: certifiedAt.logicalTimeMs,
    };
    await this.#exchangeMany(commitPayload, union, preview);
    const committed = await this.options.repository.commitTransition({
      expectedEpoch: current.epoch,
      certificate,
    });
    if (!committed) return null;
    await this.options.registry.apply(proposal.nextConfiguration);
    return certificate;
  }

  async #exchangeMany<TRequest extends CollectiveMembershipRequestPayloadV1>(
    payload: TRequest,
    peerIds: readonly string[],
    resolver: InMemoryCollectiveMembershipRegistryV1,
  ): Promise<readonly ExchangeResult<TRequest>[]> {
    return Promise.all(
      peerIds.map(async (peerId) => {
        const request = await this.#signRequest(payload, peerId);
        let candidate: SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipResponsePayloadV1> | null =
          null;
        try {
          candidate = await this.options.transport.exchange({
            peerId,
            request,
            signal: AbortSignal.timeout(this.#requestTimeoutMs),
          });
        } catch {
          candidate = null;
        }
        const response = candidate
          ? await this.#verifyResponse(candidate, peerId, resolver)
          : null;
        return Object.freeze({ peerId, request, response });
      }),
    );
  }

  async #signRequest<TPayload extends CollectiveMembershipRequestPayloadV1>(
    payload: TPayload,
    audiencePeerId: string,
  ): Promise<SignedCollectiveMembershipEnvelopeV1<TPayload>> {
    const now = this.options.clock.now();
    const expiresAt = new Date(
      Date.parse(now.wallTime) + this.#maximumEnvelopeTtlMs,
    ).toISOString();
    const messageId = await collectiveMembershipMessageIdV1(
      payload.type.replaceAll(".", "-"),
      {
        payload,
        audiencePeerId,
        senderPeerId: this.options.scope.peerId,
        issuedAt: now.wallTime,
      },
      this.options.crypto,
    );
    const envelope: UnsignedCollectiveMembershipEnvelopeV1<TPayload> = {
      protocol: COLLECTIVE_MEMBERSHIP_PROTOCOL_V1,
      schemaVersion: COLLECTIVE_MEMBERSHIP_SCHEMA_VERSION_V1,
      messageId,
      tenantId: this.options.scope.tenantId,
      meshId: this.options.scope.meshId,
      senderPeerId: this.options.scope.peerId,
      senderInstanceId: this.options.scope.instanceId,
      audiencePeerId,
      issuedAt: now.wallTime,
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

  async #verifyResponse(
    candidate: SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipResponsePayloadV1>,
    peerId: string,
    resolver: InMemoryCollectiveMembershipRegistryV1,
  ): Promise<SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipResponsePayloadV1> | null> {
    const now = this.options.clock.now();
    const response =
      await verifyCollectiveMembershipEnvelopeV1<CollectiveMembershipResponsePayloadV1>(
        {
          envelope: candidate,
          resolver,
          verifiedAt: now.wallTime,
          crypto: this.options.crypto,
        },
      );
    const expiry = response
      ? compareMeshTimestamps(now.wallTime, response.expiresAt)
      : null;
    return response &&
      response.tenantId === this.options.scope.tenantId &&
      response.meshId === this.options.scope.meshId &&
      response.senderPeerId === peerId &&
      resolver.instanceIds(peerId).includes(response.senderInstanceId) &&
      response.audiencePeerId === this.options.scope.peerId &&
      expiry?.ok &&
      expiry.value < 0
      ? response
      : null;
  }
}

interface ExchangeResult<
  TRequest extends CollectiveMembershipRequestPayloadV1,
> {
  readonly peerId: string;
  readonly request: SignedCollectiveMembershipEnvelopeV1<TRequest>;
  readonly response: SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipResponsePayloadV1> | null;
}

function validVote(
  proposal: CollectiveMembershipTransitionProposalV1,
  peerId: string,
  request: SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipVoteRequestPayloadV1>,
  response: SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipResponsePayloadV1> | null,
): boolean {
  const vote = response?.payload;
  return Boolean(
    vote &&
    vote.type === "membership.transition.vote" &&
    request.audiencePeerId === peerId &&
    vote.requestMessageId === request.messageId &&
    vote.proposalId === proposal.proposalId &&
    vote.proposalDigest === proposal.proposalDigest &&
    vote.voterPeerId === peerId &&
    vote.fromEpoch === proposal.fromEpoch &&
    vote.toEpoch === proposal.toEpoch &&
    vote.approvedAtLogicalMs >= proposal.proposedAtLogicalMs &&
    vote.approvedAtLogicalMs < proposal.expiresAtLogicalMs &&
    vote.previousConfigurationDigest === proposal.previousConfigurationDigest &&
    vote.nextConfigurationDigest ===
      proposal.nextConfiguration.configurationDigest,
  );
}

function unionPeerIds(
  current: { readonly members: readonly { readonly peerId: string }[] },
  next: { readonly members: readonly { readonly peerId: string }[] },
): readonly string[] {
  return Object.freeze(
    [
      ...new Set(
        [...current.members, ...next.members].map(({ peerId }) => peerId),
      ),
    ].sort(),
  );
}

function assertOptions(options: CollectiveMembershipClientOptionsV1): void {
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
    !options.clock ||
    !options.transport
  )
    throw new TypeError("Collective membership client options are required");
  const timeout = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const ttl = options.maximumEnvelopeTtlMs ?? DEFAULT_MAXIMUM_ENVELOPE_TTL_MS;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300_000)
    throw new RangeError("requestTimeoutMs is out of range");
  if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > 300_000)
    throw new RangeError("maximumEnvelopeTtlMs is out of range");
}
