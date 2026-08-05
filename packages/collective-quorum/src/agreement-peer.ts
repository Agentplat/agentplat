import type {
  CollectiveAgreementCertificatePayloadV1,
  CollectiveAgreementCommitPayloadV1,
  CollectiveAgreementMembershipV1,
  CollectiveAgreementPeerHandleResultV1,
  CollectiveAgreementPeerOptionsV1,
  CollectiveAgreementProposalPayloadV1,
  CollectiveAgreementResponsePayloadV1,
  CollectiveAgreementVoteCertificateV1,
  CollectiveAgreementVotePayloadV1,
  SignedCollectiveAgreementEnvelopeV1,
} from "./agreement-contracts.js";
import {
  collectiveAgreementEnvelopeIsFreshV1,
  collectiveAgreementProposerV1,
  sameCollectiveAgreementCoordinateV1,
  validateCollectiveAgreementMembershipV1,
  verifyCollectiveAgreementLiveEnvelopeV1,
} from "./agreement-codec.js";
import {
  verifyCollectiveAgreementCommitCertificateV1,
  verifyCollectiveAgreementVoteCertificateV1,
} from "./agreement-certificates.js";
import { createSignedCollectiveAgreementEnvelopeV1 } from "./agreement-messages.js";

/** One independently hosted validator with durable anti-equivocation state. */
export class CollectiveAgreementPeerV1 {
  readonly #maximumEnvelopeTtlMs: number;

  constructor(readonly options: CollectiveAgreementPeerOptionsV1) {
    if (!options?.scope?.peerId || !options.repository || !options.membership)
      throw new TypeError("agreement peer options are required");
    this.#maximumEnvelopeTtlMs = options.maximumEnvelopeTtlMs ?? 30_000;
    if (
      !Number.isSafeInteger(this.#maximumEnvelopeTtlMs) ||
      this.#maximumEnvelopeTtlMs < 1 ||
      this.#maximumEnvelopeTtlMs > 300_000
    )
      throw new RangeError("maximumEnvelopeTtlMs is out of range");
  }

  async handle(
    candidate: unknown,
  ): Promise<CollectiveAgreementPeerHandleResultV1> {
    const now = this.options.clock.now();
    const envelope = await verifyCollectiveAgreementLiveEnvelopeV1({
      envelope: candidate,
      resolver: this.options.resolver,
      verifiedAt: now.wallTime,
      maximumTtlMs: this.#maximumEnvelopeTtlMs,
      crypto: this.options.crypto,
    });
    if (!envelope) return rejected("invalid_envelope");
    if (
      envelope.tenantId !== this.options.scope.tenantId ||
      envelope.meshId !== this.options.scope.meshId
    )
      return rejected("wrong_scope");
    if (envelope.audiencePeerId !== this.options.scope.peerId)
      return rejected("wrong_audience");
    if (
      !collectiveAgreementEnvelopeIsFreshV1(
        envelope,
        now.wallTime,
        this.#maximumEnvelopeTtlMs,
      )
    )
      return rejected("expired");
    const coordinate = coordinateOf(envelope.payload);
    const membership = await this.options.membership.resolve({
      policyDomainId: coordinate.policyDomainId,
      epoch: coordinate.membershipEpoch,
      configurationDigest: coordinate.membershipConfigurationDigest,
      logicalTimeMs: now.logicalTimeMs,
    });
    const validMembership = await validateCollectiveAgreementMembershipV1(
      membership,
      this.options.crypto,
    );
    if (!validMembership) return rejected("membership_unavailable");
    if (!memberMatches(validMembership, envelope))
      return rejected("invalid_membership");

    switch (envelope.payload.type) {
      case "agreement.proposal":
        return this.#proposal(
          envelope as SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementProposalPayloadV1>,
          validMembership,
          now,
        );
      case "agreement.certificate":
        return this.#certificate(
          envelope as SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementCertificatePayloadV1>,
          validMembership,
          now,
        );
      case "agreement.commit":
        return this.#commit(
          envelope as SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementCommitPayloadV1>,
          validMembership,
          now,
        );
      default:
        return rejected("invalid_envelope");
    }
  }

  async #proposal(
    envelope: SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementProposalPayloadV1>,
    membership: CollectiveAgreementMembershipV1,
    now: ReturnType<CollectiveAgreementPeerOptionsV1["clock"]["now"]>,
  ): Promise<CollectiveAgreementPeerHandleResultV1> {
    const payload = envelope.payload;
    if (
      payload.proposerPeerId !== envelope.senderPeerId ||
      collectiveAgreementProposerV1({
        membership,
        height: payload.coordinate.height,
        round: payload.coordinate.round,
      }) !== envelope.senderPeerId
    )
      return rejected("invalid_proposer");
    if (payload.justification) {
      const justification = await verifyCollectiveAgreementVoteCertificateV1({
        certificate: payload.justification,
        membership,
        resolver: this.options.resolver,
        verifiedAt: now.wallTime,
        crypto: this.options.crypto,
      });
      if (
        !justification ||
        justification.phase !== "prevote" ||
        justification.valueDigest !== payload.value.valueDigest ||
        justification.coordinate.round !== payload.validRound ||
        justification.coordinate.round >= payload.coordinate.round ||
        !sameHeightSlot(justification, payload)
      )
        return rejected("invalid_certificate");
      await this.#observeCertificate(justification);
    }
    if (!(await this.#ready("proposal", payload.coordinate, now.logicalTimeMs)))
      return rejected("not_ready");
    const semantics = await this.options.semantics.evaluate({
      coordinate: payload.coordinate,
      proposalId: payload.proposalId,
      proposerPeerId: payload.proposerPeerId,
      value: payload.value,
      logicalTimeMs: now.logicalTimeMs,
    });
    if (!semantics.accepted) return rejected("semantic_rejection");
    const result = await this.options.repository.recordLocalVote({
      coordinate: payload.coordinate,
      phase: "prevote",
      proposalId: payload.proposalId,
      valueDigest: payload.value.valueDigest,
      justifiedRound: payload.validRound,
      create: () =>
        this.#vote(
          {
            type: "agreement.vote",
            coordinate: payload.coordinate,
            phase: "prevote",
            proposalId: payload.proposalId,
            voterPeerId: this.options.scope.peerId,
            valueDigest: payload.value.valueDigest,
            votedAtLogicalMs: now.logicalTimeMs,
          },
          envelope.senderPeerId,
          now,
        ),
    });
    return voteResult(result);
  }

  async #certificate(
    envelope: SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementCertificatePayloadV1>,
    membership: CollectiveAgreementMembershipV1,
    now: ReturnType<CollectiveAgreementPeerOptionsV1["clock"]["now"]>,
  ): Promise<CollectiveAgreementPeerHandleResultV1> {
    const certificate = await verifyCollectiveAgreementVoteCertificateV1({
      certificate: envelope.payload.certificate,
      membership,
      resolver: this.options.resolver,
      verifiedAt: now.wallTime,
      crypto: this.options.crypto,
    });
    if (
      !certificate ||
      certificate.phase !== "prevote" ||
      certificate.valueDigest === null ||
      !sameCollectiveAgreementCoordinateV1(
        certificate.coordinate,
        envelope.payload.certificate.coordinate,
      )
    )
      return rejected("invalid_certificate");
    await this.#observeCertificate(certificate);
    if (
      !(await this.#ready(
        "precommit",
        certificate.coordinate,
        now.logicalTimeMs,
      ))
    )
      return rejected("not_ready");
    const result = await this.options.repository.recordLocalVote({
      coordinate: certificate.coordinate,
      phase: "precommit",
      proposalId: certificate.proposalId,
      valueDigest: certificate.valueDigest,
      justifiedRound: certificate.coordinate.round,
      create: () =>
        this.#vote(
          {
            type: "agreement.vote",
            coordinate: certificate.coordinate,
            phase: "precommit",
            proposalId: certificate.proposalId,
            voterPeerId: this.options.scope.peerId,
            valueDigest: certificate.valueDigest,
            votedAtLogicalMs: now.logicalTimeMs,
          },
          envelope.senderPeerId,
          now,
        ),
    });
    return voteResult(result);
  }

  async #commit(
    envelope: SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementCommitPayloadV1>,
    membership: CollectiveAgreementMembershipV1,
    now: ReturnType<CollectiveAgreementPeerOptionsV1["clock"]["now"]>,
  ): Promise<CollectiveAgreementPeerHandleResultV1> {
    const certificate = await verifyCollectiveAgreementCommitCertificateV1({
      certificate: envelope.payload.certificate,
      membership,
      resolver: this.options.resolver,
      verifiedAt: now.wallTime,
      crypto: this.options.crypto,
    });
    if (!certificate) return rejected("invalid_certificate");
    await this.#observeCertificate(certificate.prevoteCertificate);
    await this.#observeCertificate(certificate.precommitCertificate);
    if (
      !(await this.#ready("commit", certificate.coordinate, now.logicalTimeMs))
    )
      return rejected("not_ready");
    const saved = await this.options.repository.saveCommit(certificate);
    if (saved === "conflict") return rejected("commit_conflict");
    if (saved === "chain_gap") return rejected("chain_gap");
    const response = await createSignedCollectiveAgreementEnvelopeV1({
      scope: this.options.scope,
      signing: this.options.signing,
      audiencePeerId: envelope.senderPeerId,
      payload: {
        type: "agreement.ack",
        requestMessageId: envelope.messageId,
        coordinate: certificate.coordinate,
        acknowledgement: "commit_stored",
        acknowledgedAtLogicalMs: now.logicalTimeMs,
      },
      clock: now,
      maximumEnvelopeTtlMs: this.#maximumEnvelopeTtlMs,
      crypto: this.options.crypto,
    });
    return { accepted: true, code: "accepted", response };
  }

  #vote(
    payload: CollectiveAgreementVotePayloadV1,
    audiencePeerId: string,
    now: ReturnType<CollectiveAgreementPeerOptionsV1["clock"]["now"]>,
  ): Promise<
    SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>
  > {
    return createSignedCollectiveAgreementEnvelopeV1({
      scope: this.options.scope,
      signing: this.options.signing,
      audiencePeerId,
      payload,
      clock: now,
      maximumEnvelopeTtlMs: this.#maximumEnvelopeTtlMs,
      crypto: this.options.crypto,
    });
  }

  async #ready(
    operation: "proposal" | "precommit" | "commit",
    coordinate: CollectiveAgreementProposalPayloadV1["coordinate"],
    logicalTimeMs: number,
  ): Promise<boolean> {
    if (!this.options.readiness) return true;
    return (
      await this.options.readiness.check({
        operation,
        coordinate,
        logicalTimeMs,
      })
    ).ready;
  }

  async #observeCertificate(
    certificate: CollectiveAgreementVoteCertificateV1,
  ): Promise<void> {
    for (const vote of certificate.votes) {
      const proof = await this.options.repository.observeVote(vote);
      if (proof) await this.options.equivocation?.report(proof);
    }
  }
}

function coordinateOf(payload: {
  readonly type: string;
  readonly coordinate?: CollectiveAgreementProposalPayloadV1["coordinate"];
  readonly certificate?: {
    readonly coordinate: CollectiveAgreementProposalPayloadV1["coordinate"];
  };
}): CollectiveAgreementProposalPayloadV1["coordinate"] {
  if (payload.coordinate) return payload.coordinate;
  if (payload.certificate) return payload.certificate.coordinate;
  throw new TypeError("agreement payload coordinate is missing");
}

function memberMatches(
  membership: CollectiveAgreementMembershipV1,
  envelope: SignedCollectiveAgreementEnvelopeV1,
): boolean {
  const validator = membership.validators.find(
    (item) => item.peerId === envelope.senderPeerId,
  );
  return Boolean(
    validator &&
    validator.instanceId === envelope.senderInstanceId &&
    validator.keyId === envelope.proof.keyId,
  );
}

function sameHeightSlot(
  certificate: CollectiveAgreementVoteCertificateV1,
  proposal: CollectiveAgreementProposalPayloadV1,
): boolean {
  return (
    certificate.coordinate.policyDomainId ===
      proposal.coordinate.policyDomainId &&
    certificate.coordinate.slotId === proposal.coordinate.slotId &&
    certificate.coordinate.height === proposal.coordinate.height &&
    certificate.coordinate.membershipEpoch ===
      proposal.coordinate.membershipEpoch &&
    certificate.coordinate.membershipConfigurationDigest ===
      proposal.coordinate.membershipConfigurationDigest
  );
}

function rejected(
  code: Exclude<CollectiveAgreementPeerHandleResultV1["code"], "accepted">,
): CollectiveAgreementPeerHandleResultV1 {
  return { accepted: false, code };
}

function voteResult(
  result: Awaited<
    ReturnType<
      CollectiveAgreementPeerOptionsV1["repository"]["recordLocalVote"]
    >
  >,
): CollectiveAgreementPeerHandleResultV1 {
  if (result.status === "signed" || result.status === "duplicate")
    return { accepted: true, code: "accepted", response: result.vote };
  if (result.status === "locked") return rejected("locked");
  if (result.status === "stale_round") return rejected("stale_round");
  return rejected("conflicting_vote");
}
