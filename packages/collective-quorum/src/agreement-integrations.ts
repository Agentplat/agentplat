import { createEvidenceClaimV1, sha256TrustBytesV1 } from "@agentplat/trust";
import type { EvidenceClaimV1 } from "@agentplat/trust";
import type { MeshKeyResolver } from "@agentplat/mesh-crypto";
import type {
  CollectiveAgreementClockV1,
  CollectiveAgreementCommitCertificateV1,
  CollectiveAgreementDecisionPortV1,
  CollectiveAgreementEquivocationProofV1,
  CollectiveAgreementMembershipPortV1,
  CollectiveAgreementRepositoryV1,
  CollectiveAgreementRuntimePortsV1,
  CollectiveAgreementVoteCertificateV1,
} from "./agreement-contracts.js";
import {
  verifyCollectiveAgreementCommitCertificateV1,
  verifyCollectiveAgreementEquivocationProofV1,
} from "./agreement-certificates.js";
import {
  collectiveAgreementDigestV1,
  createCollectiveAgreementValueV1,
} from "./agreement-codec.js";

export interface CollectiveAgreementRuntimeAdapterOptionsV1 {
  readonly policyDomainId: string;
  /** May be a local proposer or a transport-backed proposer routing service. */
  readonly agreement: CollectiveAgreementDecisionPortV1;
  readonly membership: CollectiveAgreementMembershipPortV1;
  readonly resolver: MeshKeyResolver;
  readonly clock: CollectiveAgreementClockV1;
  readonly roundFor?: (input: {
    readonly slotId: string;
    readonly logicalTimeMs: number;
  }) => Promise<{
    readonly round: number;
    readonly validRound?: number | null;
    readonly justification?: CollectiveAgreementVoteCertificateV1 | null;
  }>;
  readonly crypto?: Crypto;
}

/**
 * Maps existing assignment and recovery seams onto certified agreement values.
 * Existing runtimes remain unchanged until these ports are explicitly installed.
 */
export function createCollectiveAgreementRuntimePortsV1(
  options: CollectiveAgreementRuntimeAdapterOptionsV1,
): CollectiveAgreementRuntimePortsV1 {
  if (
    !options?.policyDomainId ||
    !options.agreement ||
    !options.membership ||
    !options.resolver ||
    !options.clock
  )
    throw new TypeError("agreement runtime adapter options are required");
  return Object.freeze({
    assignmentConfirmation: {
      confirm: async (
        input: Parameters<
          CollectiveAgreementRuntimePortsV1["assignmentConfirmation"]["confirm"]
        >[0],
      ) => {
        const membership = await options.membership.current({
          policyDomainId: options.policyDomainId,
          logicalTimeMs: input.logicalTimeMs,
        });
        if (!membership) return null;
        const assignment = input.workContract.assignment;
        const slotDigest = await collectiveAgreementDigestV1(
          {
            workContractId: input.workContract.workContractId,
            workContractDigest: input.workContract.workContractDigest,
            assignmentEpoch: assignment.assignmentEpoch,
          },
          options.crypto,
        );
        const slotId = `assignment.${slotDigest.slice(7, 47)}`;
        const value = await createCollectiveAgreementValueV1({
          kind: "assignment_confirmation",
          valueId: input.acceptanceMessageId,
          payload: {
            workContractId: input.workContract.workContractId,
            workContractDigest: input.workContract.workContractDigest,
            objectiveId: input.workContract.objective.objectiveId,
            objectiveRevision: input.workContract.objective.objectiveRevision,
            workItemId: assignment.workItemId,
            workItemRevision: assignment.workItemRevision,
            ownerPeerId: assignment.ownerPeerId,
            assignedPeerId: assignment.assignedPeerId,
            assignedInstanceId: assignment.assignedInstanceId,
            assignmentAuthorityId: assignment.assignmentAuthorityId,
            assignmentEpoch: assignment.assignmentEpoch,
            fencingToken: assignment.fencingToken,
            acceptanceMessageId: input.acceptanceMessageId,
            latestLeaseRenewalId: input.latestLeaseRenewalId,
            eligibleWitnessPeerIds: [...input.eligibleWitnessPeerIds].sort(),
            recoveryWitnessThreshold: input.recoveryWitnessThreshold,
          },
          crypto: options.crypto,
        });
        const certificate = await decide(options, {
          membership,
          policyDomainId: options.policyDomainId,
          slotId,
          value,
          logicalTimeMs: input.logicalTimeMs,
        });
        if (!certificate) return null;
        const certifiedPeerIds = new Set(
          certificate.precommitCertificate.votes.map(
            (vote) => vote.senderPeerId,
          ),
        );
        const confirmedWitnessPeerIds = [...input.eligibleWitnessPeerIds]
          .filter((peerId) => certifiedPeerIds.has(peerId))
          .sort();
        if (
          !certifiedPeerIds.has(assignment.ownerPeerId) ||
          confirmedWitnessPeerIds.length < input.recoveryWitnessThreshold
        )
          return null;
        return Object.freeze({
          schemaVersion: 1 as const,
          confirmationId: certificate.certificateId,
          ownerPeerId: assignment.ownerPeerId,
          acceptanceId: input.acceptanceMessageId,
          assignmentAuthorityId: assignment.assignmentAuthorityId,
          assignmentEpoch: assignment.assignmentEpoch,
          fencingToken: assignment.fencingToken,
          leaseRenewalId: input.latestLeaseRenewalId,
          confirmedLeaseExpiresAt: assignment.workDeadline,
          confirmedWitnessPeerIds,
          confirmedAtLogicalMs: certificate.committedAtLogicalMs,
        });
      },
    },
    recoveryElection: {
      select: async (
        input: Parameters<
          CollectiveAgreementRuntimePortsV1["recoveryElection"]["select"]
        >[0],
      ) => {
        const membership = await options.membership.current({
          policyDomainId: options.policyDomainId,
          logicalTimeMs: input.logicalTimeMs,
        });
        const selected = [...input.proposals].sort(
          (left, right) =>
            left.acceptedAtLogicalMs - right.acceptedAtLogicalMs ||
            left.takeoverProposalId.localeCompare(right.takeoverProposalId) ||
            left.proposedAssigneePeerId.localeCompare(
              right.proposedAssigneePeerId,
            ),
        )[0];
        if (!membership || !selected) return null;
        const slotId = `recovery.${input.scopeDigest.slice(7, 47)}`;
        const value = await createCollectiveAgreementValueV1({
          kind: "recovery_selection",
          valueId: selected.takeoverProposalId,
          payload: {
            scopeDigest: input.scopeDigest,
            objectiveId: input.objectiveId,
            objectiveRevision: input.objectiveRevision,
            objectiveExpiresAtLogicalMs: input.objectiveExpiresAtLogicalMs,
            workItemId: input.workItemId,
            workItemRevision: input.workItemRevision,
            priorAssignmentEpoch: input.priorAssignmentEpoch,
            proposedAssignmentEpoch: input.proposedAssignmentEpoch,
            selectedProposalId: selected.takeoverProposalId,
            selectedAssigneePeerId: selected.proposedAssigneePeerId,
            proposals: [...input.proposals].sort((left, right) =>
              left.takeoverProposalId.localeCompare(right.takeoverProposalId),
            ),
          },
          crypto: options.crypto,
        });
        const certificate = await decide(options, {
          membership,
          policyDomainId: options.policyDomainId,
          slotId,
          value,
          logicalTimeMs: input.logicalTimeMs,
        });
        if (!certificate) return null;
        const certifiedPeerIds = new Set(
          certificate.precommitCertificate.votes.map(
            (vote) => vote.senderPeerId,
          ),
        );
        const certifiedWitnessPeerIds = [...input.eligibleWitnessPeerIds]
          .filter((peerId) => certifiedPeerIds.has(peerId))
          .sort();
        if (certifiedWitnessPeerIds.length < input.recoveryWitnessThreshold)
          return null;
        return Object.freeze({
          schemaVersion: 1 as const,
          electionId: certificate.certificateId,
          electionRound: certificate.coordinate.round,
          scopeDigest: input.scopeDigest,
          selectedProposalId: selected.takeoverProposalId,
          selectedAssigneePeerId: selected.proposedAssigneePeerId,
          certifiedWitnessPeerIds,
          certifiedAtLogicalMs: certificate.committedAtLogicalMs,
          expiresAtLogicalMs: input.objectiveExpiresAtLogicalMs,
        });
      },
    },
  });
}

export async function createCollectiveAgreementPlanningSlotValueV1(input: {
  readonly semanticSlotKey: string;
  readonly selectedProposalDigest: string;
  readonly candidateProposalDigests: readonly string[];
  readonly previousCommitDigest?: string | null;
  readonly crypto?: Crypto;
}) {
  return createCollectiveAgreementValueV1({
    kind: "planning_slot_head",
    valueId: input.semanticSlotKey,
    previousCommitDigest: input.previousCommitDigest,
    payload: {
      semanticSlotKey: input.semanticSlotKey,
      selectedProposalDigest: input.selectedProposalDigest,
      candidateProposalDigests: [...input.candidateProposalDigests].sort(),
    },
    crypto: input.crypto,
  });
}

export async function createCollectiveAgreementSynchronizationValueV1(input: {
  readonly scopeKind: string;
  readonly scopeKey: string;
  readonly headVersion: number;
  readonly headDigest: string;
  readonly previousCommitDigest?: string | null;
  readonly crypto?: Crypto;
}) {
  return createCollectiveAgreementValueV1({
    kind: "synchronization_watermark",
    valueId: `${input.scopeKind}.${input.scopeKey}`,
    previousCommitDigest: input.previousCommitDigest,
    payload: {
      scopeKind: input.scopeKind,
      scopeKey: input.scopeKey,
      headVersion: input.headVersion,
      headDigest: input.headDigest,
    },
    crypto: input.crypto,
  });
}

export async function createCollectiveAgreementMembershipReconfigurationValueV1(input: {
  readonly valueId: string;
  readonly priorConfigurationDigest: string;
  readonly nextConfigurationDigest: string;
  readonly activationHeight: number;
  readonly previousCommitDigest: string | null;
  readonly crypto?: Crypto;
}) {
  return createCollectiveAgreementValueV1({
    kind: "membership_reconfiguration",
    valueId: input.valueId,
    previousCommitDigest: input.previousCommitDigest,
    payload: {
      priorConfigurationDigest: input.priorConfigurationDigest,
      nextConfigurationDigest: input.nextConfigurationDigest,
      activationHeight: input.activationHeight,
    },
    crypto: input.crypto,
  });
}

export interface CollectiveAgreementCommitReadinessGateOptionsV1 {
  readonly repository: CollectiveAgreementRepositoryV1;
  readonly membership: CollectiveAgreementMembershipPortV1;
  readonly resolver: MeshKeyResolver;
  readonly clock: CollectiveAgreementClockV1;
  readonly slotFor: (input: {
    readonly operation: string;
    readonly scope?: unknown;
    readonly scopeDigest?: string;
  }) => string;
  readonly requiredHeight: (input: {
    readonly operation: string;
    readonly slotId: string;
  }) => number;
  readonly crypto?: Crypto;
}

/** Structural readiness adapter for peer-node and legacy quorum gates. */
export class CollectiveAgreementCommitReadinessGateV1 {
  constructor(
    readonly options: CollectiveAgreementCommitReadinessGateOptionsV1,
  ) {
    if (
      !options?.repository ||
      !options.membership ||
      !options.resolver ||
      !options.clock ||
      typeof options.slotFor !== "function" ||
      typeof options.requiredHeight !== "function"
    )
      throw new TypeError("agreement readiness gate options are required");
  }

  readiness(input: {
    readonly scope: unknown;
    readonly operation: string;
    readonly logicalTimeMs: number;
  }) {
    return this.#check({
      operation: input.operation,
      scope: input.scope,
      logicalTimeMs: input.logicalTimeMs,
    });
  }

  check(input: {
    readonly operation: string;
    readonly policyDomainId: string;
    readonly scopeDigest: string;
    readonly logicalTimeMs: number;
  }) {
    return this.#check({
      operation: input.operation,
      policyDomainId: input.policyDomainId,
      scopeDigest: input.scopeDigest,
      logicalTimeMs: input.logicalTimeMs,
    });
  }

  async #check(input: {
    readonly operation: string;
    readonly scope?: unknown;
    readonly scopeDigest?: string;
    readonly policyDomainId?: string;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly ready: boolean;
    readonly reasonCode: string;
    readonly certificateId: string | null;
  }> {
    const slotId = this.options.slotFor(input);
    const height = this.options.requiredHeight({
      operation: input.operation,
      slotId,
    });
    const commit = await this.options.repository.getCommit({
      policyDomainId:
        input.policyDomainId ??
        (typeof input.scope === "object" &&
        input.scope !== null &&
        "policyDomainId" in input.scope &&
        typeof input.scope.policyDomainId === "string"
          ? input.scope.policyDomainId
          : "unknown"),
      slotId,
      height,
    });
    if (!commit)
      return Object.freeze({
        ready: false,
        reasonCode: "agreement_commit_missing",
        certificateId: null,
      });
    const membership = await this.options.membership.resolve({
      policyDomainId: commit.coordinate.policyDomainId,
      epoch: commit.coordinate.membershipEpoch,
      configurationDigest: commit.coordinate.membershipConfigurationDigest,
      logicalTimeMs: input.logicalTimeMs,
    });
    const verified = membership
      ? await verifyCollectiveAgreementCommitCertificateV1({
          certificate: commit,
          membership,
          resolver: this.options.resolver,
          verifiedAt: this.options.clock.now().wallTime,
          crypto: this.options.crypto,
        })
      : null;
    return verified
      ? Object.freeze({
          ready: true,
          reasonCode: "agreement_commit_ready",
          certificateId: verified.certificateId,
        })
      : Object.freeze({
          ready: false,
          reasonCode: "agreement_commit_invalid_or_stale",
          certificateId: commit.certificateId,
        });
  }
}

/** Produces ordinary Trust evidence; policy decides whether it quarantines. */
export async function createCollectiveAgreementEquivocationEvidenceV1(input: {
  readonly proof: CollectiveAgreementEquivocationProofV1;
  readonly resolver: MeshKeyResolver;
  readonly tenantId: string;
  readonly meshId: string;
  readonly reporterPeerId: string;
  readonly observedAt: string;
  readonly crypto?: Crypto;
}): Promise<EvidenceClaimV1> {
  const proof = await verifyCollectiveAgreementEquivocationProofV1({
    proof: input.proof,
    resolver: input.resolver,
    verifiedAt: input.observedAt,
    crypto: input.crypto,
  });
  if (!proof) throw new TypeError("equivocation proof is invalid");
  const references = await Promise.all(
    [proof.first, proof.second].map(async (vote) => ({
      schemaVersion: 1 as const,
      kind: "control_record" as const,
      referenceType: "collective.agreement.vote",
      referenceId: vote.messageId,
      referenceDigest: await collectiveAgreementDigestV1(vote, input.crypto),
    })),
  );
  references.sort((left, right) =>
    `${left.kind}\u0000${left.referenceType}\u0000${left.referenceId}\u0000${left.referenceDigest}`.localeCompare(
      `${right.kind}\u0000${right.referenceType}\u0000${right.referenceId}\u0000${right.referenceDigest}`,
    ),
  );
  const summary = JSON.stringify({
    proofDigest: proof.proofDigest,
    accusedPeerId: proof.accusedPeerId,
    policyDomainId: proof.coordinate.policyDomainId,
    slotId: proof.coordinate.slotId,
    height: proof.coordinate.height,
    round: proof.coordinate.round,
    phase: proof.phase,
  });
  const bytes = new TextEncoder().encode(summary);
  return createEvidenceClaimV1({
    schemaVersion: 1,
    sourceId: input.reporterPeerId,
    sourceKind: "local",
    causationId: null,
    subject: {
      schemaVersion: 1,
      kind: "peer",
      peerId: proof.accusedPeerId,
    },
    scope: {
      schemaVersion: 1,
      kind: "mesh",
      tenantId: input.tenantId,
      meshId: input.meshId,
    },
    criterionId: "collective.agreement.no_equivocation",
    outcome: "violated",
    content: {
      kind: "inline_summary",
      mediaType: "application/json",
      summary,
      contentDigest: sha256TrustBytesV1(bytes),
      encodedBytes: bytes.byteLength,
    },
    basisReferences: references,
    observedAt: input.observedAt,
  });
}

async function decide(
  options: CollectiveAgreementRuntimeAdapterOptionsV1,
  input: {
    readonly membership: NonNullable<
      Awaited<ReturnType<CollectiveAgreementMembershipPortV1["current"]>>
    >;
    readonly policyDomainId: string;
    readonly slotId: string;
    readonly value: Awaited<
      ReturnType<typeof createCollectiveAgreementValueV1>
    >;
    readonly logicalTimeMs: number;
  },
): Promise<CollectiveAgreementCommitCertificateV1 | null> {
  const round = options.roundFor
    ? await options.roundFor({
        slotId: input.slotId,
        logicalTimeMs: input.logicalTimeMs,
      })
    : { round: 0, validRound: null, justification: null };
  const certificate = await options.agreement.decide({
    membership: input.membership,
    policyDomainId: input.policyDomainId,
    slotId: input.slotId,
    height: 1,
    round: round.round,
    value: input.value,
    validRound: round.validRound ?? null,
    justification: round.justification ?? null,
    logicalTimeMs: input.logicalTimeMs,
  });
  if (!certificate) return null;
  const verified = await verifyCollectiveAgreementCommitCertificateV1({
    certificate,
    membership: input.membership,
    resolver: options.resolver,
    verifiedAt: options.clock.now().wallTime,
    crypto: options.crypto,
  });
  return verified &&
    verified.coordinate.policyDomainId === input.policyDomainId &&
    verified.coordinate.slotId === input.slotId &&
    verified.coordinate.height === 1 &&
    verified.coordinate.round === round.round &&
    verified.coordinate.membershipEpoch === input.membership.epoch &&
    verified.coordinate.membershipConfigurationDigest ===
      input.membership.configurationDigest &&
    verified.value.valueDigest === input.value.valueDigest &&
    verified.committedAtLogicalMs <= input.logicalTimeMs
    ? verified
    : null;
}
