import type {
  CollectiveAgreementCertificatePayloadV1,
  CollectiveAgreementClientOptionsV1,
  CollectiveAgreementCommitCertificateV1,
  CollectiveAgreementCommitPayloadV1,
  CollectiveAgreementDecisionInputV1,
  CollectiveAgreementDecisionPortV1,
  CollectiveAgreementMembershipV1,
  CollectiveAgreementProposalPayloadV1,
  CollectiveAgreementRequestPayloadV1,
  CollectiveAgreementVotePayloadV1,
  SignedCollectiveAgreementEnvelopeV1,
} from "./agreement-contracts.js";
import {
  collectiveAgreementDigestV1,
  collectiveAgreementEnvelopeIsFreshV1,
  collectiveAgreementProposerV1,
  collectiveAgreementQuorumThresholdV1,
  sameCollectiveAgreementCoordinateV1,
  validateCollectiveAgreementMembershipV1,
  validateCollectiveAgreementValueV1,
  verifyCollectiveAgreementLiveEnvelopeV1,
} from "./agreement-codec.js";
import {
  createCollectiveAgreementCommitCertificateV1,
  createCollectiveAgreementVoteCertificateV1,
  verifyCollectiveAgreementVoteCertificateV1,
} from "./agreement-certificates.js";
import { createSignedCollectiveAgreementEnvelopeV1 } from "./agreement-messages.js";

/** Proposer-side round coordinator. It has no leader lease or global singleton. */
export class CollectiveAgreementClientV1 implements CollectiveAgreementDecisionPortV1 {
  readonly #requestTimeoutMs: number;
  readonly #maximumEnvelopeTtlMs: number;

  constructor(readonly options: CollectiveAgreementClientOptionsV1) {
    if (!options?.scope?.peerId || !options.transport || !options.repository)
      throw new TypeError("agreement client options are required");
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
    this.#maximumEnvelopeTtlMs = options.maximumEnvelopeTtlMs ?? 30_000;
    if (
      !Number.isSafeInteger(this.#requestTimeoutMs) ||
      this.#requestTimeoutMs < 1 ||
      this.#requestTimeoutMs > 300_000
    )
      throw new RangeError("requestTimeoutMs is out of range");
  }

  async decide(
    input: CollectiveAgreementDecisionInputV1,
  ): Promise<CollectiveAgreementCommitCertificateV1 | null> {
    const membership = await this.#membership(input);
    const value = await validateCollectiveAgreementValueV1(
      input.value,
      this.options.crypto,
    );
    if (!membership || !value) return null;
    if (
      collectiveAgreementProposerV1({
        membership,
        height: input.height,
        round: input.round,
      }) !== this.options.scope.peerId
    )
      return null;
    if (!(await this.#validChain(input, value.previousCommitDigest)))
      return null;
    const coordinate = Object.freeze({
      policyDomainId: input.policyDomainId,
      slotId: input.slotId,
      height: input.height,
      round: input.round,
      membershipEpoch: membership.epoch,
      membershipConfigurationDigest: membership.configurationDigest,
    });
    const validRound = input.validRound ?? null;
    const justification = input.justification ?? null;
    const verifiedJustification = justification
      ? await verifyCollectiveAgreementVoteCertificateV1({
          certificate: justification,
          membership,
          resolver: this.options.resolver,
          verifiedAt: this.options.clock.now().wallTime,
          crypto: this.options.crypto,
        })
      : null;
    if (
      (validRound === null) !== (justification === null) ||
      (justification &&
        (!verifiedJustification ||
          verifiedJustification.phase !== "prevote" ||
          verifiedJustification.valueDigest !== value.valueDigest ||
          verifiedJustification.coordinate.round !== validRound ||
          verifiedJustification.coordinate.round >= coordinate.round ||
          verifiedJustification.coordinate.policyDomainId !==
            coordinate.policyDomainId ||
          verifiedJustification.coordinate.slotId !== coordinate.slotId ||
          verifiedJustification.coordinate.height !== coordinate.height ||
          verifiedJustification.coordinate.membershipEpoch !==
            coordinate.membershipEpoch ||
          verifiedJustification.coordinate.membershipConfigurationDigest !==
            coordinate.membershipConfigurationDigest))
    )
      return null;
    const proposalCore = {
      coordinate,
      proposerPeerId: this.options.scope.peerId,
      valueDigest: value.valueDigest,
      validRound,
      justificationDigest: verifiedJustification?.certificateDigest ?? null,
    };
    const proposalDigest = await collectiveAgreementDigestV1(
      proposalCore,
      this.options.crypto,
    );
    const proposal: CollectiveAgreementProposalPayloadV1 = Object.freeze({
      type: "agreement.proposal",
      proposalId: `agreement.proposal.${proposalDigest.slice(7, 47)}`,
      coordinate,
      proposerPeerId: this.options.scope.peerId,
      value,
      validRound,
      justification: verifiedJustification,
      proposedAtLogicalMs: input.logicalTimeMs,
    });
    const prevotes = await this.#exchangeForVotes({
      membership,
      requestFor: (peerId) => this.#request(peerId, proposal),
      phase: "prevote",
      proposalId: proposal.proposalId,
      valueDigest: value.valueDigest,
      coordinate,
      signal: input.signal,
    });
    if (prevotes.length < collectiveAgreementQuorumThresholdV1(membership))
      return null;
    const prevoteCertificate = await createCollectiveAgreementVoteCertificateV1(
      {
        membership,
        votes: prevotes,
        resolver: this.options.resolver,
        verifiedAt: this.options.clock.now().wallTime,
        crypto: this.options.crypto,
      },
    );
    if (!prevoteCertificate) return null;
    const certificatePayload: CollectiveAgreementCertificatePayloadV1 =
      Object.freeze({
        type: "agreement.certificate",
        certificate: prevoteCertificate,
        deliveredAtLogicalMs: input.logicalTimeMs,
      });
    const precommits = await this.#exchangeForVotes({
      membership,
      requestFor: (peerId) => this.#request(peerId, certificatePayload),
      phase: "precommit",
      proposalId: proposal.proposalId,
      valueDigest: value.valueDigest,
      coordinate,
      signal: input.signal,
    });
    if (precommits.length < collectiveAgreementQuorumThresholdV1(membership))
      return null;
    const precommitCertificate =
      await createCollectiveAgreementVoteCertificateV1({
        membership,
        votes: precommits,
        resolver: this.options.resolver,
        verifiedAt: this.options.clock.now().wallTime,
        crypto: this.options.crypto,
      });
    if (!precommitCertificate) return null;
    const commit = await createCollectiveAgreementCommitCertificateV1({
      membership,
      value,
      prevoteCertificate,
      precommitCertificate,
      committedAtLogicalMs: input.logicalTimeMs,
      resolver: this.options.resolver,
      verifiedAt: this.options.clock.now().wallTime,
      crypto: this.options.crypto,
    });
    if (!commit) return null;
    const saved = await this.options.repository.saveCommit(commit);
    if (saved === "conflict" || saved === "chain_gap") return null;
    const commitPayload: CollectiveAgreementCommitPayloadV1 = Object.freeze({
      type: "agreement.commit",
      certificate: commit,
      deliveredAtLogicalMs: input.logicalTimeMs,
    });
    await Promise.allSettled(
      membership.validators.map(async ({ peerId }) => {
        const request = await this.#request(peerId, commitPayload);
        await this.#exchange(peerId, request, input.signal);
      }),
    );
    return commit;
  }

  async #membership(
    input: CollectiveAgreementDecisionInputV1,
  ): Promise<CollectiveAgreementMembershipV1 | null> {
    const candidate = await validateCollectiveAgreementMembershipV1(
      input.membership,
      this.options.crypto,
    );
    if (!candidate) return null;
    const resolved = await this.options.membership.resolve({
      policyDomainId: input.policyDomainId,
      epoch: candidate.epoch,
      configurationDigest: candidate.configurationDigest,
      logicalTimeMs: input.logicalTimeMs,
    });
    const membership = await validateCollectiveAgreementMembershipV1(
      resolved,
      this.options.crypto,
    );
    return membership?.configurationDigest === candidate.configurationDigest &&
      membership.validators.some(
        (validator) =>
          validator.peerId === this.options.scope.peerId &&
          validator.instanceId === this.options.scope.instanceId &&
          validator.keyId === this.options.signing.keyId,
      )
      ? membership
      : null;
  }

  async #validChain(
    input: CollectiveAgreementDecisionInputV1,
    previousCommitDigest: string | null,
  ): Promise<boolean> {
    if (input.height === 1) return previousCommitDigest === null;
    const previous = await this.options.repository.getCommit({
      policyDomainId: input.policyDomainId,
      slotId: input.slotId,
      height: input.height - 1,
    });
    return previous?.certificateDigest === previousCommitDigest;
  }

  async #exchangeForVotes(input: {
    readonly membership: CollectiveAgreementMembershipV1;
    readonly requestFor: (
      peerId: string,
    ) => Promise<
      SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementRequestPayloadV1>
    >;
    readonly phase: "prevote" | "precommit";
    readonly proposalId: string;
    readonly valueDigest: string;
    readonly coordinate: CollectiveAgreementProposalPayloadV1["coordinate"];
    readonly signal?: AbortSignal;
  }): Promise<
    SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>[]
  > {
    const responses = await Promise.allSettled(
      input.membership.validators.map(async ({ peerId }) => {
        const request = await input.requestFor(peerId);
        return this.#exchange(peerId, request, input.signal);
      }),
    );
    const votes = new Map<
      string,
      SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>
    >();
    for (const response of responses) {
      if (response.status !== "fulfilled" || !response.value) continue;
      const verified =
        await verifyCollectiveAgreementLiveEnvelopeV1<CollectiveAgreementVotePayloadV1>(
          {
            envelope: response.value,
            resolver: this.options.resolver,
            verifiedAt: this.options.clock.now().wallTime,
            maximumTtlMs: this.#maximumEnvelopeTtlMs,
            crypto: this.options.crypto,
          },
        );
      if (
        !verified ||
        !collectiveAgreementEnvelopeIsFreshV1(
          verified,
          this.options.clock.now().wallTime,
          this.#maximumEnvelopeTtlMs,
        ) ||
        verified.payload.type !== "agreement.vote" ||
        verified.audiencePeerId !== this.options.scope.peerId ||
        verified.payload.voterPeerId !== verified.senderPeerId ||
        verified.payload.phase !== input.phase ||
        verified.payload.proposalId !== input.proposalId ||
        verified.payload.valueDigest !== input.valueDigest ||
        !sameCollectiveAgreementCoordinateV1(
          verified.payload.coordinate,
          input.coordinate,
        ) ||
        !input.membership.validators.some(
          (validator) =>
            validator.peerId === verified.senderPeerId &&
            validator.instanceId === verified.senderInstanceId &&
            validator.keyId === verified.proof.keyId,
        )
      )
        continue;
      const proof = await this.options.repository.observeVote(verified);
      if (proof) {
        votes.delete(verified.senderPeerId);
        await this.options.equivocation?.report(proof);
        continue;
      }
      if (!votes.has(verified.senderPeerId))
        votes.set(verified.senderPeerId, verified);
    }
    return [...votes.values()];
  }

  #request<TPayload extends CollectiveAgreementRequestPayloadV1>(
    peerId: string,
    payload: TPayload,
  ): Promise<SignedCollectiveAgreementEnvelopeV1<TPayload>> {
    return createSignedCollectiveAgreementEnvelopeV1({
      scope: this.options.scope,
      signing: this.options.signing,
      audiencePeerId: peerId,
      payload,
      clock: this.options.clock.now(),
      maximumEnvelopeTtlMs: this.#maximumEnvelopeTtlMs,
      crypto: this.options.crypto,
    });
  }

  async #exchange<TRequest extends CollectiveAgreementRequestPayloadV1>(
    peerId: string,
    request: SignedCollectiveAgreementEnvelopeV1<TRequest>,
    parentSignal?: AbortSignal,
  ) {
    const controller = new AbortController();
    const abort = () => controller.abort(parentSignal?.reason);
    parentSignal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(
      () => controller.abort(new Error("agreement_request_timeout")),
      this.#requestTimeoutMs,
    );
    try {
      return await this.options.transport.exchange({
        peerId,
        request,
        signal: controller.signal,
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", abort);
    }
  }
}
