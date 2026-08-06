import {
  collectiveAgreementQuorumThresholdV1,
  createCollectiveAgreementValueV1,
} from "./agreement-codec.js";
import { verifyCollectiveAgreementCommitCertificateV1 } from "./agreement-certificates.js";
import type { CollectiveAgreementSemanticPortV1 } from "./agreement-contracts.js";
import type {
  CertifiedCollectiveTrustDecisionV1,
  CollectiveTrustAgreementSemanticOptionsV1,
  CollectiveTrustCertificationOptionsV1,
  CollectiveTrustCertificationPortV1,
  CollectiveTrustDecisionReconstructionInputV1,
} from "./trust-consensus-contracts.js";
import {
  collectiveTrustSlotIdV1,
  createCertifiedCollectiveTrustDecisionV1,
  validateCertifiedCollectiveTrustDecisionV1,
  validateCollectiveTrustCandidateV1,
} from "./trust-consensus-codec.js";

export function createCollectiveTrustAgreementSemanticPortV1(
  options: CollectiveTrustAgreementSemanticOptionsV1,
): CollectiveAgreementSemanticPortV1 {
  if (
    !options?.policyDomainId ||
    !options.candidates ||
    typeof options.candidates.validate !== "function" ||
    !options.heads ||
    typeof options.heads.head !== "function" ||
    (options.proposerEligibility &&
      typeof options.proposerEligibility.evaluate !== "function") ||
    (options.fallback && typeof options.fallback.evaluate !== "function")
  )
    throw new TypeError("collective trust semantic options are required");
  return Object.freeze({
    evaluate: async (
      input: Parameters<CollectiveAgreementSemanticPortV1["evaluate"]>[0],
    ) => {
      try {
        if (input.value.kind !== "trust_decision")
          return options.fallback
            ? options.fallback.evaluate(input)
            : rejected("unsupported_value_kind");
        if (input.coordinate.policyDomainId !== options.policyDomainId)
          return rejected("trust_policy_domain_mismatch");
        let candidate;
        try {
          candidate = await validateCollectiveTrustCandidateV1(
            input.value.payload,
          );
        } catch {
          return rejected("invalid_trust_candidate");
        }
        if (
          input.value.valueId !== candidate.candidateId ||
          input.coordinate.slotId !== collectiveTrustSlotIdV1(candidate) ||
          input.logicalTimeMs < candidate.observedAtLogicalMs ||
          input.logicalTimeMs >= candidate.validUntilLogicalMs
        )
          return rejected("trust_candidate_binding_invalid");
        const head = await options.heads.head({
          tenantId: candidate.tenantId,
          subjectDigest: candidate.subjectDigest,
          scopeDigest: candidate.scopeDigest,
          policyDigest: candidate.policyDigest,
        });
        if (
          (head?.decisionDigest ?? null) !==
          candidate.previousCertifiedDecisionDigest
        )
          return rejected("trust_candidate_predecessor_mismatch");
        if (
          options.proposerEligibility &&
          (await options.proposerEligibility.evaluate({
            tenantId: candidate.tenantId,
            proposerPeerId: input.proposerPeerId,
            candidateDigest: candidate.candidateDigest,
            logicalTimeMs: input.logicalTimeMs,
          })) !== true
        )
          return rejected("trust_proposer_ineligible");
        const resolution = await options.candidates.validate({
          candidate,
          proposerPeerId: input.proposerPeerId,
          policyDomainId: options.policyDomainId,
          logicalTimeMs: input.logicalTimeMs,
        });
        if (
          typeof resolution.accepted !== "boolean" ||
          typeof resolution.reasonCode !== "string" ||
          resolution.reasonCode.length === 0 ||
          resolution.reasonCode.length > 256
        )
          return rejected("trust_candidate_resolution_invalid");
        return Object.freeze({
          accepted: resolution.accepted,
          reasonCode: resolution.reasonCode,
        });
      } catch {
        return rejected("trust_semantic_unavailable");
      }
    },
  });
}

export function createCollectiveTrustCertificationPortV1(
  options: CollectiveTrustCertificationOptionsV1,
): CollectiveTrustCertificationPortV1 {
  if (
    !options?.policyDomainId ||
    !options.agreement ||
    !options.membership ||
    !options.coordinates ||
    !options.repository ||
    !options.resolver ||
    !options.clock
  )
    throw new TypeError("collective trust certification options are required");
  return Object.freeze({
    certify: async (
      input: Parameters<CollectiveTrustCertificationPortV1["certify"]>[0],
    ) => {
      let candidate;
      try {
        candidate = await validateCollectiveTrustCandidateV1(
          input.candidate,
          options.crypto,
        );
      } catch {
        return null;
      }
      try {
        if (
          input.logicalTimeMs < candidate.observedAtLogicalMs ||
          input.logicalTimeMs >= candidate.validUntilLogicalMs
        )
          return null;
        const head = await options.repository.head({
          tenantId: candidate.tenantId,
          subjectDigest: candidate.subjectDigest,
          scopeDigest: candidate.scopeDigest,
          policyDigest: candidate.policyDigest,
        });
        if (
          (head?.decisionDigest ?? null) !==
          candidate.previousCertifiedDecisionDigest
        )
          return null;
        const membership = await options.membership.current({
          policyDomainId: options.policyDomainId,
          logicalTimeMs: input.logicalTimeMs,
        });
        if (!membership) return null;
        const slotId = collectiveTrustSlotIdV1(candidate);
        const coordinate = await options.coordinates.resolve({
          policyDomainId: options.policyDomainId,
          slotId,
          candidateDigest: candidate.candidateDigest,
          previousCertifiedDecisionDigest:
            candidate.previousCertifiedDecisionDigest,
          logicalTimeMs: input.logicalTimeMs,
        });
        if (
          !Number.isSafeInteger(coordinate.height) ||
          coordinate.height < 1 ||
          !Number.isSafeInteger(coordinate.round) ||
          coordinate.round < 0 ||
          !(
            coordinate.previousCommitDigest === null ||
            /^sha256:[0-9a-f]{64}$/u.test(coordinate.previousCommitDigest)
          )
        )
          return null;
        if (
          coordinate.previousCommitDigest !== (head?.sourceCommitDigest ?? null)
        )
          return null;
        const value = await createCollectiveAgreementValueV1({
          kind: "trust_decision",
          valueId: candidate.candidateId,
          previousCommitDigest: coordinate.previousCommitDigest,
          payload: candidate as unknown as Readonly<Record<string, unknown>>,
          crypto: options.crypto,
        });
        const commit = await options.agreement.decide({
          membership,
          policyDomainId: options.policyDomainId,
          slotId,
          height: coordinate.height,
          round: coordinate.round,
          value,
          logicalTimeMs: input.logicalTimeMs,
          signal: input.signal,
        });
        if (!commit) return null;
        return applyCollectiveTrustCommitV1({
          policyDomainId: options.policyDomainId,
          candidate,
          commit,
          membership,
          resolver: options.resolver,
          verifiedAt: options.clock.now().wallTime,
          repository: options.repository,
          crypto: options.crypto,
        });
      } catch {
        return null;
      }
    },
  });
}

/**
 * Projects a verified agreement commit into the local derived head. Every
 * validator or restarted consumer can apply the same commit independently.
 */
export async function applyCollectiveTrustCommitV1(input: {
  readonly policyDomainId: string;
  readonly candidate: import("./trust-consensus-contracts.js").CollectiveTrustCandidateV1;
  readonly commit: import("./agreement-contracts.js").CollectiveAgreementCommitCertificateV1;
  readonly membership: import("./agreement-contracts.js").CollectiveAgreementMembershipV1;
  readonly resolver: import("@agentplat/mesh-crypto").MeshKeyResolver;
  readonly verifiedAt: string;
  readonly repository: import("./trust-consensus-contracts.js").CollectiveTrustDecisionRepositoryV1;
  readonly crypto?: Crypto;
}): Promise<CertifiedCollectiveTrustDecisionV1 | null> {
  let candidate;
  try {
    candidate = await validateCollectiveTrustCandidateV1(
      input.candidate,
      input.crypto,
    );
  } catch {
    return null;
  }
  try {
    const previous = await input.repository.head({
      tenantId: candidate.tenantId,
      subjectDigest: candidate.subjectDigest,
      scopeDigest: candidate.scopeDigest,
      policyDigest: candidate.policyDigest,
    });
    if (
      (previous?.decisionDigest ?? null) !==
      candidate.previousCertifiedDecisionDigest
    )
      return null;
    const decision = await reconstructCertifiedCollectiveTrustDecisionV1({
      policyDomainId: input.policyDomainId,
      candidate,
      previousDecision: previous,
      commit: input.commit,
      membership: input.membership,
      resolver: input.resolver,
      verifiedAt: input.verifiedAt,
      crypto: input.crypto,
    });
    if (!decision) return null;
    const saved = await input.repository.save({
      decision,
      expectedHeadDigest: candidate.previousCertifiedDecisionDigest,
    });
    return saved === "stored" || saved === "duplicate" ? decision : null;
  } catch {
    return null;
  }
}

export async function reconstructCertifiedCollectiveTrustDecisionV1(
  input: CollectiveTrustDecisionReconstructionInputV1,
): Promise<CertifiedCollectiveTrustDecisionV1 | null> {
  let candidate;
  try {
    candidate = await validateCollectiveTrustCandidateV1(
      input.candidate,
      input.crypto,
    );
  } catch {
    return null;
  }
  let previous: CertifiedCollectiveTrustDecisionV1 | null = null;
  if (input.previousDecision) {
    try {
      previous = await validateCertifiedCollectiveTrustDecisionV1(
        input.previousDecision,
        input.crypto,
      );
    } catch {
      return null;
    }
  }
  if (
    (previous?.decisionDigest ?? null) !==
      candidate.previousCertifiedDecisionDigest ||
    (previous &&
      (previous.tenantId !== candidate.tenantId ||
        previous.subjectDigest !== candidate.subjectDigest ||
        previous.scopeDigest !== candidate.scopeDigest ||
        previous.policyDigest !== candidate.policyDigest))
  )
    return null;
  const commit = await verifyCollectiveAgreementCommitCertificateV1({
    certificate: input.commit,
    membership: input.membership,
    resolver: input.resolver,
    verifiedAt: input.verifiedAt,
    crypto: input.crypto,
  });
  if (
    !commit ||
    commit.value.kind !== "trust_decision" ||
    commit.value.valueId !== candidate.candidateId ||
    commit.coordinate.policyDomainId !== input.policyDomainId ||
    commit.coordinate.slotId !== collectiveTrustSlotIdV1(candidate) ||
    commit.coordinate.membershipEpoch !== input.membership.epoch ||
    commit.coordinate.membershipConfigurationDigest !==
      input.membership.configurationDigest ||
    commit.value.previousCommitDigest !==
      (previous?.sourceCommitDigest ?? null) ||
    commit.committedAtLogicalMs < candidate.observedAtLogicalMs ||
    commit.committedAtLogicalMs >= candidate.validUntilLogicalMs
  )
    return null;
  let committedCandidate;
  try {
    committedCandidate = await validateCollectiveTrustCandidateV1(
      commit.value.payload,
      input.crypto,
    );
  } catch {
    return null;
  }
  if (committedCandidate.candidateDigest !== candidate.candidateDigest)
    return null;
  const witnesses = [
    ...new Set(
      commit.precommitCertificate.votes.map((vote) => vote.senderPeerId),
    ),
  ].sort(compare);
  if (witnesses.length < collectiveAgreementQuorumThresholdV1(input.membership))
    return null;
  try {
    return await createCertifiedCollectiveTrustDecisionV1({
      candidate,
      witnessPeerIds: witnesses,
      membershipEpoch: input.membership.epoch,
      membershipConfigurationDigest: input.membership.configurationDigest,
      sourceCommitDigest: commit.certificateDigest,
      certifiedAtLogicalMs: commit.committedAtLogicalMs,
      crypto: input.crypto,
    });
  } catch {
    return null;
  }
}

function rejected(reasonCode: string) {
  return Object.freeze({ accepted: false, reasonCode });
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
