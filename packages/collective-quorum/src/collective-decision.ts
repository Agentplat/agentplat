import {
  createCollectiveDecisionCertificateV1,
  validateCollectiveDecisionCandidateV1,
  validateCollectiveDecisionCertificateV1,
  validateCollectiveDecisionEvidenceV1,
  validateCollectiveDecisionPolicyV1,
  verifyCollectiveDecisionCertificateV1,
  type CollectiveDecisionCandidateV1,
  type CollectiveDecisionCertificationPortV1,
  type CollectiveDecisionEvidenceV1,
} from "@agentplat/collective-runtime/collective-decision";
import type { MeshKeyResolver } from "@agentplat/mesh-crypto";

import { verifyCollectiveAgreementCommitCertificateV1 } from "./agreement-certificates.js";
import { createCollectiveAgreementValueV1 } from "./agreement-codec.js";
import type {
  CollectiveAgreementClockV1,
  CollectiveAgreementDecisionPortV1,
  CollectiveAgreementMembershipPortV1,
  CollectiveAgreementRepositoryV1,
} from "./agreement-contracts.js";

export interface CollectiveDecisionAgreementCoordinateV1 {
  readonly height: number;
  readonly round: number;
  readonly previousCommitDigest: string | null;
}

export interface CollectiveDecisionAgreementCoordinatePortV1 {
  resolve(input: {
    readonly policyDomainId: string;
    readonly slotId: string;
    readonly candidateDigest: string;
    readonly logicalTimeMs: number;
  }):
    | CollectiveDecisionAgreementCoordinateV1
    | Promise<CollectiveDecisionAgreementCoordinateV1>;
}

export interface CollectiveDecisionEvidencePortV1 {
  resolve(input: {
    readonly candidate: CollectiveDecisionCandidateV1;
    readonly logicalTimeMs: number;
  }):
    | readonly CollectiveDecisionEvidenceV1[]
    | Promise<readonly CollectiveDecisionEvidenceV1[]>;
}

export interface CollectiveDecisionAgreementCertificationOptionsV1 {
  readonly policyDomainId: string;
  readonly issuerId: string;
  readonly agreement: CollectiveAgreementDecisionPortV1;
  /** Durable source of the exact agreement proof referenced by the certificate. */
  readonly repository: Pick<CollectiveAgreementRepositoryV1, "getCommit">;
  readonly membership: CollectiveAgreementMembershipPortV1;
  readonly resolver: MeshKeyResolver;
  readonly clock: CollectiveAgreementClockV1;
  readonly coordinates: CollectiveDecisionAgreementCoordinatePortV1;
  readonly evidence?: CollectiveDecisionEvidencePortV1;
  readonly crypto?: Crypto;
}

/**
 * Adapts a verified Byzantine agreement commit into the generic, content-free
 * decision-plane certificate. The agreement proof digest remains bound for
 * audit and independent re-resolution; neither record grants effect authority.
 */
export function createCollectiveDecisionAgreementCertificationPortV1(
  options: CollectiveDecisionAgreementCertificationOptionsV1,
): CollectiveDecisionCertificationPortV1 {
  validateOptions(options);
  return Object.freeze({
    async certify(
      input: Parameters<CollectiveDecisionCertificationPortV1["certify"]>[0],
    ) {
      const candidate = validateCollectiveDecisionCandidateV1(input.candidate);
      const policy = validateCollectiveDecisionPolicyV1(input.policy);
      if (
        policy.policy.certificationModes[candidate.decisionKind] !==
        "byzantine_agreement"
      )
        throw new TypeError(
          "collective decision does not require Byzantine agreement",
        );
      if (candidate.scope.policyDomainId !== options.policyDomainId)
        throw new TypeError("collective decision policy domain does not match");

      const reading = options.clock.now();
      if (
        !Number.isSafeInteger(reading.logicalTimeMs) ||
        reading.logicalTimeMs < candidate.preparedAtLogicalMs ||
        reading.logicalTimeMs >= candidate.expiresAtLogicalMs
      )
        throw new TypeError("collective decision candidate is not current");
      const membership = await options.membership.current({
        policyDomainId: options.policyDomainId,
        logicalTimeMs: reading.logicalTimeMs,
      });
      if (!membership)
        throw new TypeError("agreement membership is unavailable");
      const memberIds = membership.validators
        .map((validator) => validator.peerId)
        .sort(compare);
      if (
        membership.epoch !== candidate.epoch ||
        membership.configurationDigest !== candidate.membershipDigest ||
        memberIds.length !== candidate.membershipMemberIds.length ||
        memberIds.some(
          (memberId, index) =>
            memberId !== candidate.membershipMemberIds[index],
        ) ||
        !memberIds.includes(options.issuerId)
      )
        throw new TypeError("collective decision membership does not match");

      const slotId = decisionSlot(candidate);
      const coordinate = await options.coordinates.resolve({
        policyDomainId: options.policyDomainId,
        slotId,
        candidateDigest: candidate.candidateDigest,
        logicalTimeMs: reading.logicalTimeMs,
      });
      validateCoordinate(coordinate);
      const value = await createCollectiveAgreementValueV1({
        kind: agreementKind(candidate.decisionKind),
        valueId: candidate.candidateId,
        previousCommitDigest: coordinate.previousCommitDigest,
        payload: {
          candidateDigest: candidate.candidateDigest,
          decisionKind: candidate.decisionKind,
          epoch: candidate.epoch,
          membershipDigest: candidate.membershipDigest,
          payloadDigest: candidate.payloadDigest,
          scopeDigest: candidate.scope.scopeDigest,
        },
        crypto: options.crypto,
      });
      const unverified = await options.agreement.decide({
        membership,
        policyDomainId: options.policyDomainId,
        slotId,
        height: coordinate.height,
        round: coordinate.round,
        value,
        logicalTimeMs: reading.logicalTimeMs,
      });
      const commit = unverified
        ? await verifyCollectiveAgreementCommitCertificateV1({
            certificate: unverified,
            membership,
            resolver: options.resolver,
            verifiedAt: reading.wallTime,
            crypto: options.crypto,
          })
        : null;
      if (
        !commit ||
        commit.value.valueDigest !== value.valueDigest ||
        commit.coordinate.policyDomainId !== options.policyDomainId ||
        commit.coordinate.slotId !== slotId ||
        commit.coordinate.membershipEpoch !== membership.epoch ||
        commit.coordinate.membershipConfigurationDigest !==
          membership.configurationDigest
      )
        throw new TypeError("collective decision agreement was not certified");

      const evidence = Object.freeze(
        (options.evidence
          ? await options.evidence.resolve({
              candidate,
              logicalTimeMs: reading.logicalTimeMs,
            })
          : []
        ).map(validateCollectiveDecisionEvidenceV1),
      );
      const attesterIds = [
        ...new Set(
          commit.precommitCertificate.votes.map((vote) => vote.senderPeerId),
        ),
      ].sort(compare);
      return createCollectiveDecisionCertificateV1({
        schemaVersion: 1,
        certificateId: `collective-decision.${commit.certificateId}`,
        candidateDigest: candidate.candidateDigest,
        scopeDigest: candidate.scope.scopeDigest,
        epoch: candidate.epoch,
        membershipDigest: candidate.membershipDigest,
        certificationMode: "byzantine_agreement",
        issuerId: options.issuerId,
        attesterIds,
        evidence,
        certificationProofDigest: planningDigest(commit.certificateDigest),
        issuedAtLogicalMs: commit.committedAtLogicalMs,
        expiresAtLogicalMs: Math.min(
          candidate.expiresAtLogicalMs,
          commit.committedAtLogicalMs + policy.policy.maximumCertificateTtlMs,
        ),
      });
    },
    async verify(
      input: Parameters<CollectiveDecisionCertificationPortV1["verify"]>[0],
    ): Promise<boolean> {
      try {
        const candidate = validateCollectiveDecisionCandidateV1(
          input.candidate,
        );
        const policy = validateCollectiveDecisionPolicyV1(input.policy);
        const certificate = validateCollectiveDecisionCertificateV1(
          input.certificate,
        );
        if (
          policy.policy.certificationModes[candidate.decisionKind] !==
            "byzantine_agreement" ||
          candidate.scope.policyDomainId !== options.policyDomainId ||
          certificate.certificationMode !== "byzantine_agreement" ||
          certificate.certificationProofDigest === null
        )
          return false;
        verifyCollectiveDecisionCertificateV1({
          candidate,
          certificate,
          policy,
          logicalTimeMs: input.logicalTimeMs,
        });

        const coordinate = await options.coordinates.resolve({
          policyDomainId: options.policyDomainId,
          slotId: decisionSlot(candidate),
          candidateDigest: candidate.candidateDigest,
          logicalTimeMs: input.logicalTimeMs,
        });
        validateCoordinate(coordinate);
        const slotId = decisionSlot(candidate);
        const persisted = await options.repository.getCommit({
          policyDomainId: options.policyDomainId,
          slotId,
          height: coordinate.height,
        });
        if (!persisted) return false;

        const membership = await options.membership.resolve({
          policyDomainId: options.policyDomainId,
          epoch: persisted.coordinate.membershipEpoch,
          configurationDigest:
            persisted.coordinate.membershipConfigurationDigest,
          logicalTimeMs: input.logicalTimeMs,
        });
        if (!membership) return false;
        const memberIds = membership.validators
          .map((validator) => validator.peerId)
          .sort(compare);
        if (
          membership.epoch !== candidate.epoch ||
          membership.configurationDigest !== candidate.membershipDigest ||
          memberIds.length !== candidate.membershipMemberIds.length ||
          memberIds.some(
            (memberId, index) =>
              memberId !== candidate.membershipMemberIds[index],
          )
        )
          return false;

        const reading = options.clock.now();
        const commit = await verifyCollectiveAgreementCommitCertificateV1({
          certificate: persisted,
          membership,
          resolver: options.resolver,
          verifiedAt: reading.wallTime,
          crypto: options.crypto,
        });
        if (!commit) return false;
        const expectedValue = await createCollectiveAgreementValueV1({
          kind: agreementKind(candidate.decisionKind),
          valueId: candidate.candidateId,
          previousCommitDigest: coordinate.previousCommitDigest,
          payload: {
            candidateDigest: candidate.candidateDigest,
            decisionKind: candidate.decisionKind,
            epoch: candidate.epoch,
            membershipDigest: candidate.membershipDigest,
            payloadDigest: candidate.payloadDigest,
            scopeDigest: candidate.scope.scopeDigest,
          },
          crypto: options.crypto,
        });
        const attesterIds = [
          ...new Set(
            commit.precommitCertificate.votes.map((vote) => vote.senderPeerId),
          ),
        ].sort(compare);
        if (
          commit.coordinate.policyDomainId !== options.policyDomainId ||
          commit.coordinate.slotId !== slotId ||
          commit.coordinate.height !== coordinate.height ||
          commit.coordinate.round !== coordinate.round ||
          commit.coordinate.membershipEpoch !== candidate.epoch ||
          commit.coordinate.membershipConfigurationDigest !==
            candidate.membershipDigest ||
          commit.value.valueDigest !== expectedValue.valueDigest ||
          commit.certificateDigest !== certificate.certificationProofDigest ||
          certificate.certificateId !==
            `collective-decision.${commit.certificateId}` ||
          certificate.issuerId !== options.issuerId ||
          certificate.issuedAtLogicalMs !== commit.committedAtLogicalMs ||
          certificate.expiresAtLogicalMs !==
            Math.min(
              candidate.expiresAtLogicalMs,
              commit.committedAtLogicalMs +
                policy.policy.maximumCertificateTtlMs,
            ) ||
          !same(attesterIds, certificate.attesterIds)
        )
          return false;

        const resolvedEvidence = (
          options.evidence
            ? await options.evidence.resolve({
                candidate,
                logicalTimeMs: input.logicalTimeMs,
              })
            : []
        )
          .map(validateCollectiveDecisionEvidenceV1)
          .sort((left, right) =>
            compare(left.evidenceDigest, right.evidenceDigest),
          );
        const certificateEvidence = [...certificate.evidence].sort(
          (left, right) => compare(left.evidenceDigest, right.evidenceDigest),
        );
        return same(
          resolvedEvidence.map((item) => item.evidenceDigest),
          certificateEvidence.map((item) => item.evidenceDigest),
        );
      } catch {
        return false;
      }
    },
  });
}

function agreementKind(
  kind: CollectiveDecisionCandidateV1["decisionKind"],
):
  | "application"
  | "planning_slot_head"
  | "recovery_selection"
  | "role_reconfiguration" {
  if (kind === "plan_fragment") return "planning_slot_head";
  if (kind === "execution_takeover") return "recovery_selection";
  if (kind === "role_transition") return "role_reconfiguration";
  return "application";
}

function decisionSlot(candidate: CollectiveDecisionCandidateV1): string {
  return `collective-decision.${candidate.decisionKind}.${candidate.scope.scopeDigest.slice(7, 31)}.${candidate.epoch}`;
}

function validateOptions(
  options: CollectiveDecisionAgreementCertificationOptionsV1,
): void {
  if (
    !options ||
    typeof options.policyDomainId !== "string" ||
    !options.policyDomainId ||
    typeof options.issuerId !== "string" ||
    !options.issuerId ||
    typeof options.agreement?.decide !== "function" ||
    typeof options.repository?.getCommit !== "function" ||
    typeof options.membership?.current !== "function" ||
    typeof options.membership?.resolve !== "function" ||
    typeof options.resolver?.resolve !== "function" ||
    typeof options.clock?.now !== "function" ||
    typeof options.coordinates?.resolve !== "function" ||
    (options.evidence !== undefined &&
      typeof options.evidence.resolve !== "function")
  )
    throw new TypeError(
      "collective decision agreement certification options are invalid",
    );
}

function validateCoordinate(
  coordinate: CollectiveDecisionAgreementCoordinateV1,
): void {
  if (
    !coordinate ||
    !Number.isSafeInteger(coordinate.height) ||
    coordinate.height < 1 ||
    !Number.isSafeInteger(coordinate.round) ||
    coordinate.round < 0 ||
    (coordinate.previousCommitDigest !== null &&
      typeof coordinate.previousCommitDigest !== "string")
  )
    throw new TypeError("collective decision agreement coordinate is invalid");
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function same(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function planningDigest(value: string): `sha256:${string}` {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError("agreement certificate digest is invalid");
  return value as `sha256:${string}`;
}
