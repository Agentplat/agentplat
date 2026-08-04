import { compareMeshTimestamps } from "@agentplat/mesh-protocol";
import type {
  CollectiveMembershipCertificateV1,
  CollectiveMembershipConfigurationV1,
  CollectiveMembershipTransitionProposalV1,
  CollectiveMembershipVotePayloadV1,
  SignedCollectiveMembershipEnvelopeV1,
} from "./contracts.js";
import { validateCollectiveMembershipCertificateShapeV1 } from "./codec.js";
import {
  collectiveMembershipDigestV1,
  verifyCollectiveMembershipEnvelopeV1,
} from "./crypto.js";
import { verifyCollectiveMembershipTransitionProposalV1 } from "./configuration.js";
import { InMemoryCollectiveMembershipRegistryV1 } from "./registry.js";

export async function createCollectiveMembershipCertificateV1(input: {
  readonly current: CollectiveMembershipConfigurationV1;
  readonly proposal: CollectiveMembershipTransitionProposalV1;
  readonly requests: CollectiveMembershipCertificateV1["requests"];
  readonly votes: readonly SignedCollectiveMembershipEnvelopeV1<CollectiveMembershipVotePayloadV1>[];
  readonly certifiedAt: string;
  readonly certifiedAtLogicalMs: number;
  readonly crypto?: Crypto;
}): Promise<CollectiveMembershipCertificateV1> {
  const previousMembers = new Set(
    input.current.members.map(({ peerId }) => peerId),
  );
  const nextMembers = new Set(
    input.proposal.nextConfiguration.members.map(({ peerId }) => peerId),
  );
  const orderedVotes = Object.freeze(
    [...input.votes].sort((left, right) =>
      left.senderPeerId.localeCompare(right.senderPeerId),
    ),
  );
  const orderedRequests = Object.freeze(
    [...input.requests].sort((left, right) =>
      left.audiencePeerId.localeCompare(right.audiencePeerId),
    ),
  );
  const previousQuorumPeerIds = Object.freeze(
    orderedVotes
      .map(({ senderPeerId }) => senderPeerId)
      .filter((peerId) => previousMembers.has(peerId)),
  );
  const nextQuorumPeerIds = Object.freeze(
    orderedVotes
      .map(({ senderPeerId }) => senderPeerId)
      .filter((peerId) => nextMembers.has(peerId)),
  );
  const seed = {
    schemaVersion: 1 as const,
    kind: "membership_transition" as const,
    proposal: input.proposal,
    requests: orderedRequests,
    votes: orderedVotes,
    previousQuorumPeerIds,
    nextQuorumPeerIds,
    certifiedAt: input.certifiedAt,
    certifiedAtLogicalMs: input.certifiedAtLogicalMs,
  };
  const certificateDigest = await collectiveMembershipDigestV1(
    seed,
    input.crypto,
  );
  const certificateId = `membership.certificate.${certificateDigest.slice(7, 47)}`;
  const certificate = validateCollectiveMembershipCertificateShapeV1({
    ...seed,
    certificateId,
    certificateDigest,
  });
  if (!certificate) throw new TypeError("invalid_membership_certificate");
  const verified = await verifyCollectiveMembershipCertificateV1({
    current: input.current,
    certificate,
    crypto: input.crypto,
  });
  if (!verified) throw new TypeError("invalid_membership_certificate");
  return verified;
}

export async function verifyCollectiveMembershipCertificateV1(input: {
  readonly current: CollectiveMembershipConfigurationV1;
  readonly certificate: unknown;
  readonly crypto?: Crypto;
}): Promise<CollectiveMembershipCertificateV1 | null> {
  const certificate = validateCollectiveMembershipCertificateShapeV1(
    input.certificate,
  );
  if (!certificate) return null;
  const proposal = await verifyCollectiveMembershipTransitionProposalV1({
    current: input.current,
    proposal: certificate.proposal,
    crypto: input.crypto,
  });
  if (!proposal) return null;
  const resolver = await InMemoryCollectiveMembershipRegistryV1.create({
    configurations: [input.current, proposal.nextConfiguration],
    crypto: input.crypto,
  });
  const currentMembers = new Set(
    input.current.members.map(({ peerId }) => peerId),
  );
  const currentInstances = new Map(
    input.current.members.map(({ peerId, instanceId }) => [peerId, instanceId]),
  );
  const nextMembers = new Set(
    proposal.nextConfiguration.members.map(({ peerId }) => peerId),
  );
  const nextInstances = new Map(
    proposal.nextConfiguration.members.map(({ peerId, instanceId }) => [
      peerId,
      instanceId,
    ]),
  );
  const requests = new Map<string, SignedCollectiveMembershipEnvelopeV1>();
  let requesterPeerId: string | undefined;
  let requesterInstanceId: string | undefined;
  for (const candidate of certificate.requests) {
    const request = await verifyCollectiveMembershipEnvelopeV1({
      envelope: candidate,
      resolver,
      verifiedAt: certificate.certifiedAt,
      crypto: input.crypto,
    });
    const requestProposal =
      request?.payload.type === "membership.transition.vote.request"
        ? await verifyCollectiveMembershipTransitionProposalV1({
            current: input.current,
            proposal: request.payload.proposal,
            crypto: input.crypto,
          })
        : null;
    if (
      !request ||
      !requestProposal ||
      request.payload.type !== "membership.transition.vote.request" ||
      requestProposal.proposalDigest !== proposal.proposalDigest ||
      request.payload.requestedAtLogicalMs < proposal.proposedAtLogicalMs ||
      request.payload.requestedAtLogicalMs >= proposal.expiresAtLogicalMs ||
      !currentMembers.has(request.senderPeerId) ||
      currentInstances.get(request.senderPeerId) !== request.senderInstanceId ||
      !withinEnvelope(certificate.certifiedAt, request) ||
      requests.has(request.messageId) ||
      (requesterPeerId !== undefined &&
        requesterPeerId !== request.senderPeerId) ||
      (requesterInstanceId !== undefined &&
        requesterInstanceId !== request.senderInstanceId)
    )
      return null;
    requesterPeerId = request.senderPeerId;
    requesterInstanceId = request.senderInstanceId;
    requests.set(request.messageId, request);
  }
  if (
    !requesterPeerId ||
    certificate.certifiedAtLogicalMs < proposal.proposedAtLogicalMs ||
    certificate.certifiedAtLogicalMs >= proposal.expiresAtLogicalMs
  )
    return null;

  const voters = new Set<string>();
  for (const candidate of certificate.votes) {
    const vote =
      await verifyCollectiveMembershipEnvelopeV1<CollectiveMembershipVotePayloadV1>(
        {
          envelope: candidate,
          resolver,
          verifiedAt: certificate.certifiedAt,
          crypto: input.crypto,
        },
      );
    const request = vote
      ? requests.get(vote.payload.requestMessageId)
      : undefined;
    if (
      !vote ||
      !request ||
      vote.payload.type !== "membership.transition.vote" ||
      vote.audiencePeerId !== requesterPeerId ||
      request.audiencePeerId !== vote.senderPeerId ||
      vote.payload.requestMessageId !== request.messageId ||
      vote.payload.proposalId !== proposal.proposalId ||
      vote.payload.proposalDigest !== proposal.proposalDigest ||
      vote.payload.voterPeerId !== vote.senderPeerId ||
      vote.payload.fromEpoch !== proposal.fromEpoch ||
      vote.payload.toEpoch !== proposal.toEpoch ||
      vote.payload.previousConfigurationDigest !==
        proposal.previousConfigurationDigest ||
      vote.payload.nextConfigurationDigest !==
        proposal.nextConfiguration.configurationDigest ||
      vote.payload.approvedAtLogicalMs < proposal.proposedAtLogicalMs ||
      vote.payload.approvedAtLogicalMs >= proposal.expiresAtLogicalMs ||
      voters.has(vote.senderPeerId) ||
      (!currentMembers.has(vote.senderPeerId) &&
        !nextMembers.has(vote.senderPeerId)) ||
      (currentInstances.get(vote.senderPeerId) !== vote.senderInstanceId &&
        nextInstances.get(vote.senderPeerId) !== vote.senderInstanceId) ||
      !withinEnvelope(certificate.certifiedAt, vote)
    )
      return null;
    voters.add(vote.senderPeerId);
  }
  const previous = [...voters]
    .filter((peerId) => currentMembers.has(peerId))
    .sort();
  const next = [...voters].filter((peerId) => nextMembers.has(peerId)).sort();
  if (
    requests.size !== voters.size ||
    previous.length < input.current.quorumThreshold ||
    next.length < proposal.nextConfiguration.quorumThreshold ||
    JSON.stringify(previous) !==
      JSON.stringify(certificate.previousQuorumPeerIds) ||
    JSON.stringify(next) !== JSON.stringify(certificate.nextQuorumPeerIds)
  )
    return null;
  const { certificateId, certificateDigest, ...seed } = certificate;
  const expected = await collectiveMembershipDigestV1(seed, input.crypto);
  return expected === certificateDigest &&
    certificateId === `membership.certificate.${expected.slice(7, 47)}`
    ? certificate
    : null;
}

function withinEnvelope(
  timestamp: string,
  envelope: { readonly issuedAt: string; readonly expiresAt: string },
): boolean {
  const issued = compareMeshTimestamps(timestamp, envelope.issuedAt);
  const expires = compareMeshTimestamps(timestamp, envelope.expiresAt);
  return issued.ok && expires.ok && issued.value >= 0 && expires.value < 0;
}
