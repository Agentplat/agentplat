import type { MeshKeyResolver } from "@agentplat/mesh-crypto";
import type {
  CollectiveAgreementCatchupBundleV1,
  CollectiveAgreementCommitCertificateV1,
  CollectiveAgreementEquivocationProofV1,
  CollectiveAgreementJointReconfigurationCertificateV1,
  CollectiveAgreementMembershipV1,
  CollectiveAgreementRepositoryV1,
  CollectiveAgreementVoteCertificateV1,
  CollectiveAgreementVotePayloadV1,
  SignedCollectiveAgreementEnvelopeV1,
} from "./agreement-contracts.js";
import {
  collectiveAgreementDigestV1,
  collectiveAgreementEnvelopeIsFreshV1,
  collectiveAgreementQuorumThresholdV1,
  sameCollectiveAgreementCoordinateV1,
  validateCollectiveAgreementCommitCertificateShapeV1,
  validateCollectiveAgreementMembershipV1,
  validateCollectiveAgreementVoteCertificateShapeV1,
  validateCollectiveAgreementValueV1,
  verifyCollectiveAgreementEnvelopeV1,
  verifyCollectiveAgreementLiveEnvelopeV1,
} from "./agreement-codec.js";

export async function createCollectiveAgreementVoteCertificateV1(input: {
  readonly membership: CollectiveAgreementMembershipV1;
  readonly votes: readonly SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>[];
  readonly resolver: MeshKeyResolver;
  readonly verifiedAt: string;
  readonly crypto?: Crypto;
}): Promise<CollectiveAgreementVoteCertificateV1 | null> {
  return assembleCollectiveAgreementVoteCertificateV1(input, true);
}

async function assembleCollectiveAgreementVoteCertificateV1(
  input: {
    readonly membership: CollectiveAgreementMembershipV1;
    readonly votes: readonly SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>[];
    readonly resolver: MeshKeyResolver;
    readonly verifiedAt: string;
    readonly crypto?: Crypto;
  },
  requireFreshVotes: boolean,
): Promise<CollectiveAgreementVoteCertificateV1 | null> {
  const membership = await validateCollectiveAgreementMembershipV1(
    input.membership,
    input.crypto,
  );
  if (
    !membership ||
    input.votes.length < collectiveAgreementQuorumThresholdV1(membership)
  )
    return null;
  const verified = await verifyVotes({ ...input, requireFreshVotes });
  if (verified.length !== input.votes.length || verified.length === 0)
    return null;
  const first = verified[0]!.payload;
  if (
    first.coordinate.membershipEpoch !== membership.epoch ||
    first.coordinate.membershipConfigurationDigest !==
      membership.configurationDigest
  )
    return null;
  const members = new Map(
    membership.validators.map((validator) => [validator.peerId, validator]),
  );
  const seen = new Set<string>();
  for (const vote of verified) {
    const validator = members.get(vote.senderPeerId);
    if (
      !validator ||
      validator.instanceId !== vote.senderInstanceId ||
      validator.keyId !== vote.proof.keyId ||
      vote.payload.voterPeerId !== vote.senderPeerId ||
      seen.has(vote.senderPeerId) ||
      vote.payload.phase !== first.phase ||
      vote.payload.proposalId !== first.proposalId ||
      vote.payload.valueDigest !== first.valueDigest ||
      !sameCollectiveAgreementCoordinateV1(
        vote.payload.coordinate,
        first.coordinate,
      )
    )
      return null;
    seen.add(vote.senderPeerId);
  }
  if (seen.size < collectiveAgreementQuorumThresholdV1(membership)) return null;
  const votes = [...verified].sort((left, right) =>
    left.senderPeerId.localeCompare(right.senderPeerId),
  );
  const body = {
    schemaVersion: 1 as const,
    kind: "vote_certificate" as const,
    phase: first.phase,
    coordinate: first.coordinate,
    proposalId: first.proposalId,
    valueDigest: first.valueDigest,
    votes,
  };
  const certificate = {
    ...body,
    certificateDigest: await collectiveAgreementDigestV1(body, input.crypto),
  };
  return validateCollectiveAgreementVoteCertificateShapeV1(certificate);
}

export async function verifyCollectiveAgreementVoteCertificateV1(input: {
  readonly certificate: unknown;
  readonly membership: CollectiveAgreementMembershipV1;
  readonly resolver: MeshKeyResolver;
  readonly verifiedAt: string;
  readonly crypto?: Crypto;
}): Promise<CollectiveAgreementVoteCertificateV1 | null> {
  const certificate = validateCollectiveAgreementVoteCertificateShapeV1(
    input.certificate,
  );
  if (!certificate) return null;
  const recreated = await assembleCollectiveAgreementVoteCertificateV1(
    {
      membership: input.membership,
      votes: certificate.votes,
      resolver: input.resolver,
      verifiedAt: input.verifiedAt,
      crypto: input.crypto,
    },
    false,
  );
  return recreated?.certificateDigest === certificate.certificateDigest
    ? certificate
    : null;
}

export async function createCollectiveAgreementCommitCertificateV1(input: {
  readonly membership: CollectiveAgreementMembershipV1;
  readonly value: CollectiveAgreementCommitCertificateV1["value"];
  readonly prevoteCertificate: CollectiveAgreementVoteCertificateV1;
  readonly precommitCertificate: CollectiveAgreementVoteCertificateV1;
  readonly committedAtLogicalMs: number;
  readonly resolver: MeshKeyResolver;
  readonly verifiedAt: string;
  readonly crypto?: Crypto;
}): Promise<CollectiveAgreementCommitCertificateV1 | null> {
  return assembleCollectiveAgreementCommitCertificateV1(input, true);
}

async function assembleCollectiveAgreementCommitCertificateV1(
  input: {
    readonly membership: CollectiveAgreementMembershipV1;
    readonly value: CollectiveAgreementCommitCertificateV1["value"];
    readonly prevoteCertificate: CollectiveAgreementVoteCertificateV1;
    readonly precommitCertificate: CollectiveAgreementVoteCertificateV1;
    readonly committedAtLogicalMs: number;
    readonly resolver: MeshKeyResolver;
    readonly verifiedAt: string;
    readonly crypto?: Crypto;
  },
  requireFreshVotes: boolean,
): Promise<CollectiveAgreementCommitCertificateV1 | null> {
  const [value, prevote, precommit] = await Promise.all([
    validateCollectiveAgreementValueV1(input.value, input.crypto),
    verifyVoteCertificate(
      {
        certificate: input.prevoteCertificate,
        membership: input.membership,
        resolver: input.resolver,
        verifiedAt: input.verifiedAt,
        crypto: input.crypto,
      },
      requireFreshVotes,
    ),
    verifyVoteCertificate(
      {
        certificate: input.precommitCertificate,
        membership: input.membership,
        resolver: input.resolver,
        verifiedAt: input.verifiedAt,
        crypto: input.crypto,
      },
      requireFreshVotes,
    ),
  ]);
  if (
    !value ||
    !prevote ||
    !precommit ||
    prevote.phase !== "prevote" ||
    precommit.phase !== "precommit" ||
    prevote.valueDigest !== value.valueDigest ||
    precommit.valueDigest !== value.valueDigest ||
    prevote.proposalId !== precommit.proposalId ||
    !sameCollectiveAgreementCoordinateV1(
      prevote.coordinate,
      precommit.coordinate,
    ) ||
    !Number.isSafeInteger(input.committedAtLogicalMs) ||
    input.committedAtLogicalMs < 0
  )
    return null;
  const body = {
    schemaVersion: 1 as const,
    kind: "commit_certificate" as const,
    coordinate: prevote.coordinate,
    proposalId: prevote.proposalId,
    value,
    prevoteCertificate: prevote,
    precommitCertificate: precommit,
    committedAtLogicalMs: input.committedAtLogicalMs,
  };
  const certificateDigest = await collectiveAgreementDigestV1(
    body,
    input.crypto,
  );
  const certificate = {
    ...body,
    certificateId: `agreement.commit.${certificateDigest.slice(7, 47)}`,
    certificateDigest,
  };
  return validateCollectiveAgreementCommitCertificateShapeV1(
    certificate,
    input.crypto,
  );
}

export async function verifyCollectiveAgreementCommitCertificateV1(input: {
  readonly certificate: unknown;
  readonly membership: CollectiveAgreementMembershipV1;
  readonly resolver: MeshKeyResolver;
  readonly verifiedAt: string;
  readonly crypto?: Crypto;
}): Promise<CollectiveAgreementCommitCertificateV1 | null> {
  const certificate = await validateCollectiveAgreementCommitCertificateShapeV1(
    input.certificate,
    input.crypto,
  );
  if (!certificate) return null;
  const recreated = await assembleCollectiveAgreementCommitCertificateV1(
    {
      membership: input.membership,
      value: certificate.value,
      prevoteCertificate: certificate.prevoteCertificate,
      precommitCertificate: certificate.precommitCertificate,
      committedAtLogicalMs: certificate.committedAtLogicalMs,
      resolver: input.resolver,
      verifiedAt: input.verifiedAt,
      crypto: input.crypto,
    },
    false,
  );
  return recreated?.certificateDigest === certificate.certificateDigest &&
    recreated.certificateId === certificate.certificateId
    ? certificate
    : null;
}

export async function createCollectiveAgreementEquivocationProofV1(input: {
  readonly first: SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>;
  readonly second: SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>;
  readonly crypto?: Crypto;
}): Promise<CollectiveAgreementEquivocationProofV1 | null> {
  const first = input.first;
  const second = input.second;
  if (
    first.senderPeerId !== second.senderPeerId ||
    first.payload.voterPeerId !== second.payload.voterPeerId ||
    first.payload.phase !== second.payload.phase ||
    !sameCollectiveAgreementCoordinateV1(
      first.payload.coordinate,
      second.payload.coordinate,
    ) ||
    (first.payload.valueDigest === second.payload.valueDigest &&
      first.payload.proposalId === second.payload.proposalId)
  )
    return null;
  const ordered = [first, second].sort((left, right) =>
    left.messageId.localeCompare(right.messageId),
  ) as [typeof first, typeof second];
  const body = {
    schemaVersion: 1 as const,
    kind: "equivocation_proof" as const,
    accusedPeerId: first.senderPeerId,
    coordinate: first.payload.coordinate,
    phase: first.payload.phase,
    first: ordered[0],
    second: ordered[1],
  };
  return Object.freeze({
    ...body,
    proofDigest: await collectiveAgreementDigestV1(body, input.crypto),
  });
}

export async function verifyCollectiveAgreementEquivocationProofV1(input: {
  readonly proof: unknown;
  readonly resolver: MeshKeyResolver;
  readonly verifiedAt: string;
  readonly crypto?: Crypto;
}): Promise<CollectiveAgreementEquivocationProofV1 | null> {
  if (
    !exactObject(input.proof, [
      "accusedPeerId",
      "coordinate",
      "first",
      "kind",
      "phase",
      "proofDigest",
      "schemaVersion",
      "second",
    ]) ||
    input.proof.schemaVersion !== 1 ||
    input.proof.kind !== "equivocation_proof" ||
    typeof input.proof.proofDigest !== "string"
  )
    return null;
  const proof =
    input.proof as unknown as CollectiveAgreementEquivocationProofV1;
  const [first, second] = await Promise.all([
    verifyCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>({
      envelope: proof.first,
      resolver: input.resolver,
      verifiedAt: input.verifiedAt,
      crypto: input.crypto,
    }),
    verifyCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>({
      envelope: proof.second,
      resolver: input.resolver,
      verifiedAt: input.verifiedAt,
      crypto: input.crypto,
    }),
  ]);
  if (!first || !second) return null;
  const recreated = await createCollectiveAgreementEquivocationProofV1({
    first,
    second,
    crypto: input.crypto,
  });
  return recreated?.proofDigest === proof.proofDigest ? proof : null;
}

export async function createCollectiveAgreementJointReconfigurationCertificateV1(input: {
  readonly priorMembership: CollectiveAgreementMembershipV1;
  readonly nextMembership: CollectiveAgreementMembershipV1;
  readonly priorCertificate: CollectiveAgreementCommitCertificateV1;
  readonly nextCertificate: CollectiveAgreementCommitCertificateV1;
  readonly resolver: MeshKeyResolver;
  readonly verifiedAt: string;
  readonly crypto?: Crypto;
}): Promise<CollectiveAgreementJointReconfigurationCertificateV1 | null> {
  const [priorMembership, nextMembership, prior, next] = await Promise.all([
    validateCollectiveAgreementMembershipV1(
      input.priorMembership,
      input.crypto,
    ),
    validateCollectiveAgreementMembershipV1(input.nextMembership, input.crypto),
    verifyCollectiveAgreementCommitCertificateV1({
      certificate: input.priorCertificate,
      membership: input.priorMembership,
      resolver: input.resolver,
      verifiedAt: input.verifiedAt,
      crypto: input.crypto,
    }),
    verifyCollectiveAgreementCommitCertificateV1({
      certificate: input.nextCertificate,
      membership: input.nextMembership,
      resolver: input.resolver,
      verifiedAt: input.verifiedAt,
      crypto: input.crypto,
    }),
  ]);
  if (
    !priorMembership ||
    !nextMembership ||
    !prior ||
    !next ||
    prior.value.kind !== "membership_reconfiguration" ||
    prior.value.valueDigest !== next.value.valueDigest ||
    priorMembership.configurationDigest !==
      prior.coordinate.membershipConfigurationDigest ||
    nextMembership.configurationDigest !==
      next.coordinate.membershipConfigurationDigest ||
    priorMembership.epoch + 1 !== nextMembership.epoch ||
    prior.coordinate.policyDomainId !== next.coordinate.policyDomainId ||
    prior.coordinate.slotId !== next.coordinate.slotId ||
    prior.coordinate.height !== next.coordinate.height
  )
    return null;
  const payload = prior.value.payload;
  if (
    payload.priorConfigurationDigest !== priorMembership.configurationDigest ||
    payload.nextConfigurationDigest !== nextMembership.configurationDigest ||
    payload.activationHeight !== prior.coordinate.height + 1
  )
    return null;
  const body = {
    schemaVersion: 1 as const,
    kind: "joint_reconfiguration_certificate" as const,
    priorMembership,
    nextMembership,
    priorCertificate: prior,
    nextCertificate: next,
  };
  return Object.freeze({
    ...body,
    certificateDigest: await collectiveAgreementDigestV1(body, input.crypto),
  });
}

export async function verifyCollectiveAgreementJointReconfigurationCertificateV1(input: {
  readonly certificate: unknown;
  readonly resolver: MeshKeyResolver;
  readonly verifiedAt: string;
  readonly crypto?: Crypto;
}): Promise<CollectiveAgreementJointReconfigurationCertificateV1 | null> {
  if (
    !exactObject(input.certificate, [
      "certificateDigest",
      "kind",
      "nextCertificate",
      "nextMembership",
      "priorCertificate",
      "priorMembership",
      "schemaVersion",
    ])
  )
    return null;
  const certificate =
    input.certificate as unknown as CollectiveAgreementJointReconfigurationCertificateV1;
  if (
    certificate.schemaVersion !== 1 ||
    certificate.kind !== "joint_reconfiguration_certificate" ||
    typeof certificate.certificateDigest !== "string"
  )
    return null;
  try {
    const recreated =
      await createCollectiveAgreementJointReconfigurationCertificateV1({
        priorMembership: certificate.priorMembership,
        nextMembership: certificate.nextMembership,
        priorCertificate: certificate.priorCertificate,
        nextCertificate: certificate.nextCertificate,
        resolver: input.resolver,
        verifiedAt: input.verifiedAt,
        crypto: input.crypto,
      });
    return recreated?.certificateDigest === certificate.certificateDigest
      ? certificate
      : null;
  } catch {
    return null;
  }
}

export async function createCollectiveAgreementCatchupBundleV1(input: {
  readonly policyDomainId: string;
  readonly slotId: string;
  readonly fromHeightExclusive: number;
  readonly commits: readonly CollectiveAgreementCommitCertificateV1[];
  readonly crypto?: Crypto;
}): Promise<CollectiveAgreementCatchupBundleV1 | null> {
  const commits = [...input.commits].sort(
    (left, right) => left.coordinate.height - right.coordinate.height,
  );
  if (
    !Number.isSafeInteger(input.fromHeightExclusive) ||
    input.fromHeightExclusive < 0 ||
    commits.length < 1 ||
    commits.length > 1024 ||
    commits.some(
      (commit, index) =>
        commit.coordinate.policyDomainId !== input.policyDomainId ||
        commit.coordinate.slotId !== input.slotId ||
        commit.coordinate.height !== input.fromHeightExclusive + index + 1 ||
        (index > 0 &&
          commit.value.previousCommitDigest !==
            commits[index - 1]!.certificateDigest),
    )
  )
    return null;
  const body = {
    schemaVersion: 1 as const,
    policyDomainId: input.policyDomainId,
    slotId: input.slotId,
    fromHeightExclusive: input.fromHeightExclusive,
    toHeightInclusive: commits.at(-1)!.coordinate.height,
    commits,
  };
  return Object.freeze({
    ...body,
    bundleDigest: await collectiveAgreementDigestV1(body, input.crypto),
  });
}

export async function verifyCollectiveAgreementCatchupBundleV1(input: {
  readonly bundle: unknown;
  readonly membershipFor: (
    commit: CollectiveAgreementCommitCertificateV1,
  ) => Promise<CollectiveAgreementMembershipV1 | null>;
  readonly resolver: MeshKeyResolver;
  readonly verifiedAt: string;
  readonly trustedPreviousCommitDigest?: string | null;
  readonly crypto?: Crypto;
}): Promise<CollectiveAgreementCatchupBundleV1 | null> {
  if (
    !exactObject(input.bundle, [
      "bundleDigest",
      "commits",
      "fromHeightExclusive",
      "policyDomainId",
      "schemaVersion",
      "slotId",
      "toHeightInclusive",
    ]) ||
    input.bundle.schemaVersion !== 1 ||
    typeof input.bundle.policyDomainId !== "string" ||
    typeof input.bundle.slotId !== "string" ||
    !Array.isArray(input.bundle.commits)
  )
    return null;
  const bundle = input.bundle as unknown as CollectiveAgreementCatchupBundleV1;
  let recreated: CollectiveAgreementCatchupBundleV1 | null;
  try {
    recreated = await createCollectiveAgreementCatchupBundleV1({
      policyDomainId: bundle.policyDomainId,
      slotId: bundle.slotId,
      fromHeightExclusive: bundle.fromHeightExclusive,
      commits: bundle.commits,
      crypto: input.crypto,
    });
  } catch {
    return null;
  }
  if (
    !recreated ||
    recreated.bundleDigest !== bundle.bundleDigest ||
    recreated.toHeightInclusive !== bundle.toHeightInclusive ||
    (bundle.commits[0]?.value.previousCommitDigest ?? null) !==
      (input.trustedPreviousCommitDigest ?? null)
  )
    return null;
  for (const commit of bundle.commits) {
    const membership = await input.membershipFor(commit);
    if (
      !membership ||
      !(await verifyCollectiveAgreementCommitCertificateV1({
        certificate: commit,
        membership,
        resolver: input.resolver,
        verifiedAt: input.verifiedAt,
        crypto: input.crypto,
      }))
    )
      return null;
  }
  return bundle;
}

export async function applyCollectiveAgreementCatchupBundleV1(input: {
  readonly bundle: CollectiveAgreementCatchupBundleV1;
  readonly repository: CollectiveAgreementRepositoryV1;
  readonly membershipFor: (
    commit: CollectiveAgreementCommitCertificateV1,
  ) => Promise<CollectiveAgreementMembershipV1 | null>;
  readonly resolver: MeshKeyResolver;
  readonly verifiedAt: string;
  readonly crypto?: Crypto;
}): Promise<{ readonly applied: number; readonly finalHeight: number } | null> {
  const previous =
    input.bundle.fromHeightExclusive === 0
      ? undefined
      : await input.repository.getCommit({
          policyDomainId: input.bundle.policyDomainId,
          slotId: input.bundle.slotId,
          height: input.bundle.fromHeightExclusive,
        });
  if (input.bundle.fromHeightExclusive > 0 && !previous) return null;
  const verified = await verifyCollectiveAgreementCatchupBundleV1({
    bundle: input.bundle,
    membershipFor: input.membershipFor,
    resolver: input.resolver,
    verifiedAt: input.verifiedAt,
    trustedPreviousCommitDigest: previous?.certificateDigest ?? null,
    crypto: input.crypto,
  });
  if (!verified) return null;
  let applied = 0;
  for (const commit of verified.commits) {
    const result = await input.repository.saveCommit(commit);
    if (result === "conflict" || result === "chain_gap") return null;
    if (result === "stored") applied += 1;
  }
  return Object.freeze({ applied, finalHeight: verified.toHeightInclusive });
}

async function verifyVotes(input: {
  readonly votes: readonly SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>[];
  readonly resolver: MeshKeyResolver;
  readonly verifiedAt: string;
  readonly requireFreshVotes: boolean;
  readonly crypto?: Crypto;
}): Promise<
  SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>[]
> {
  const votes = await Promise.all(
    input.votes.map((vote) =>
      input.requireFreshVotes
        ? verifyCollectiveAgreementLiveEnvelopeV1<CollectiveAgreementVotePayloadV1>(
            {
              envelope: vote,
              resolver: input.resolver,
              verifiedAt: input.verifiedAt,
              crypto: input.crypto,
            },
          )
        : verifyCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1>(
            {
              envelope: vote,
              resolver: input.resolver,
              verifiedAt: input.verifiedAt,
              crypto: input.crypto,
            },
          ),
    ),
  );
  return votes.filter(
    (
      vote,
    ): vote is SignedCollectiveAgreementEnvelopeV1<CollectiveAgreementVotePayloadV1> =>
      vote !== null &&
      vote.payload.type === "agreement.vote" &&
      (!input.requireFreshVotes ||
        collectiveAgreementEnvelopeIsFreshV1(vote, input.verifiedAt)),
  );
}

async function verifyVoteCertificate(
  input: {
    readonly certificate: unknown;
    readonly membership: CollectiveAgreementMembershipV1;
    readonly resolver: MeshKeyResolver;
    readonly verifiedAt: string;
    readonly crypto?: Crypto;
  },
  requireFreshVotes: boolean,
): Promise<CollectiveAgreementVoteCertificateV1 | null> {
  const certificate = validateCollectiveAgreementVoteCertificateShapeV1(
    input.certificate,
  );
  if (!certificate) return null;
  const recreated = await assembleCollectiveAgreementVoteCertificateV1(
    {
      membership: input.membership,
      votes: certificate.votes,
      resolver: input.resolver,
      verifiedAt: input.verifiedAt,
      crypto: input.crypto,
    },
    requireFreshVotes,
  );
  return recreated?.certificateDigest === certificate.certificateDigest
    ? certificate
    : null;
}

function exactObject(
  candidate: unknown,
  keys: readonly string[],
): candidate is Record<string, unknown> {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
    return false;
  const actual = Object.keys(candidate).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}
