import { collectiveQuorumDigestV1 } from "./crypto.js";

export interface SparseAgreementValidatorV2 {
  readonly peerId: string;
  readonly instanceId: string;
  readonly keyId: string;
  readonly eligibilityDigest: string;
  readonly independenceGroupId: string;
}

export interface SparseAgreementMembershipV2 {
  readonly schemaVersion: 2;
  readonly epoch: number;
  readonly configurationDigest: string;
  readonly selectionSeedDigest: string;
  readonly validators: readonly SparseAgreementValidatorV2[];
}

export interface SparseCommitteePolicyV2 {
  readonly schemaVersion: 2;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly committeeSize: number;
  readonly faultThreshold: number;
  readonly reconciliationCommitteeSize: number;
  readonly reconciliationFaultThreshold: number;
  readonly maximumCommittees: number;
  readonly maximumValidatorsPerIndependenceGroup: number;
  readonly policyDigest: string;
}

export interface SparseCommitteeAssignmentV2 {
  readonly schemaVersion: 2;
  readonly committeeId: string;
  readonly purpose: "shard" | "reconciliation";
  readonly shardId: string;
  readonly epoch: number;
  readonly membershipConfigurationDigest: string;
  readonly policyDigest: string;
  readonly validators: readonly SparseAgreementValidatorV2[];
  readonly faultThreshold: number;
  readonly quorumThreshold: number;
  readonly assignmentDigest: string;
}

export interface SparseAgreementShareV2 {
  readonly schemaVersion: 2;
  readonly committeeAssignmentDigest: string;
  readonly coordinateDigest: string;
  readonly proposalDigest: string;
  readonly valueDigest: string;
  readonly phase: "prepare" | "commit" | "reconcile";
  readonly signerPeerId: string;
  readonly signerInstanceId: string;
  readonly signerKeyId: string;
  readonly signature: string;
  readonly shareDigest: string;
}

export interface SparseAggregateSignatureV2 {
  readonly algorithm: string;
  readonly signerPeerIds: readonly string[];
  readonly signerSetDigest: string;
  readonly value: string;
}

export interface SparseCommitteeCertificateV2 {
  readonly schemaVersion: 2;
  readonly certificateId: string;
  readonly assignment: SparseCommitteeAssignmentV2;
  readonly coordinateDigest: string;
  readonly proposalDigest: string;
  readonly valueDigest: string;
  readonly phase: "prepare" | "commit" | "reconcile";
  readonly aggregateSignature: SparseAggregateSignatureV2;
  readonly shareDigests: readonly string[];
  readonly certifiedAtLogicalMs: number;
  readonly certificateDigest: string;
}

export interface SparseFinalityCertificateV2 {
  readonly schemaVersion: 2;
  readonly certificateId: string;
  readonly coordinateDigest: string;
  readonly proposalDigest: string;
  readonly valueDigest: string;
  readonly epoch: number;
  readonly membershipConfigurationDigest: string;
  readonly policyDigest: string;
  readonly requiredShardIds: readonly string[];
  readonly shardCertificateDigests: readonly string[];
  readonly shardCertificateRootDigest: string;
  readonly reconciliationCertificate: SparseCommitteeCertificateV2;
  readonly finalizedAtLogicalMs: number;
  readonly certificateDigest: string;
}

export interface SparseJointReconfigurationCertificateV2 {
  readonly schemaVersion: 2;
  readonly priorMembershipConfigurationDigest: string;
  readonly nextMembershipConfigurationDigest: string;
  readonly priorFinalityCertificate: SparseFinalityCertificateV2;
  readonly nextFinalityCertificate: SparseFinalityCertificateV2;
  readonly certificateDigest: string;
}

export interface SparseAggregateSignaturePortV2 {
  readonly algorithm: string;
  verifyShare(input: {
    readonly validator: SparseAgreementValidatorV2;
    readonly messageDigest: string;
    readonly signature: string;
  }): Promise<boolean>;
  aggregate(input: {
    readonly messageDigest: string;
    readonly shares: readonly SparseAgreementShareV2[];
  }): Promise<SparseAggregateSignatureV2>;
  verifyAggregate(input: {
    readonly messageDigest: string;
    readonly validators: readonly SparseAgreementValidatorV2[];
    readonly signature: SparseAggregateSignatureV2;
  }): Promise<boolean>;
}

export async function createSparseCommitteePolicyV2(
  input: Omit<SparseCommitteePolicyV2, "schemaVersion" | "policyDigest">,
  crypto?: Crypto,
): Promise<SparseCommitteePolicyV2> {
  const body = { schemaVersion: 2 as const, ...input };
  validatePolicy(body as SparseCommitteePolicyV2);
  return Object.freeze({
    ...body,
    policyDigest: await collectiveQuorumDigestV1(
      { domain: "sparse-committee-policy-v2", body },
      crypto,
    ),
  });
}

export async function validateSparseCommitteePolicyV2(
  input: SparseCommitteePolicyV2,
  crypto?: Crypto,
): Promise<SparseCommitteePolicyV2> {
  const { policyDigest, schemaVersion: _schemaVersion, ...body } = input;
  const rebuilt = await createSparseCommitteePolicyV2(body, crypto);
  if (rebuilt.policyDigest !== policyDigest)
    throw new TypeError("sparse committee policy digest is invalid");
  return rebuilt;
}

/** Deterministic, seed-bound committee selection with independence-group caps. */
export async function selectSparseCommitteeV2(input: {
  readonly membership: SparseAgreementMembershipV2;
  readonly policy: SparseCommitteePolicyV2;
  readonly purpose: "shard" | "reconciliation";
  readonly shardId: string;
  readonly crypto?: Crypto;
}): Promise<SparseCommitteeAssignmentV2> {
  validateMembership(input.membership);
  await validateSparseCommitteePolicyV2(input.policy, input.crypto);
  identifier(input.shardId, "shardId");
  const size = input.purpose === "shard"
    ? input.policy.committeeSize
    : input.policy.reconciliationCommitteeSize;
  const faultThreshold = input.purpose === "shard"
    ? input.policy.faultThreshold
    : input.policy.reconciliationFaultThreshold;
  const ranked = await Promise.all(input.membership.validators.map(async (validator) => ({
    validator,
    rank: await collectiveQuorumDigestV1({
      domain: "sparse-committee-selection-v2",
      selectionSeedDigest: input.membership.selectionSeedDigest,
      membershipConfigurationDigest: input.membership.configurationDigest,
      policyDigest: input.policy.policyDigest,
      purpose: input.purpose,
      shardId: input.shardId,
      peerId: validator.peerId,
      eligibilityDigest: validator.eligibilityDigest,
    }, input.crypto),
  })));
  ranked.sort((left, right) => left.rank.localeCompare(right.rank) || left.validator.peerId.localeCompare(right.validator.peerId));
  const selected: SparseAgreementValidatorV2[] = [];
  const groups = new Map<string, number>();
  for (const candidate of ranked) {
    const count = groups.get(candidate.validator.independenceGroupId) ?? 0;
    if (count >= input.policy.maximumValidatorsPerIndependenceGroup) continue;
    selected.push(candidate.validator);
    groups.set(candidate.validator.independenceGroupId, count + 1);
    if (selected.length === size) break;
  }
  if (selected.length !== size)
    throw new RangeError("sparse committee cannot satisfy size and independence constraints");
  if (selected.length < 3 * faultThreshold + 1)
    throw new RangeError("sparse committee does not satisfy the declared fault model");
  const body = {
    schemaVersion: 2 as const,
    committeeId: "pending",
    purpose: input.purpose,
    shardId: input.shardId,
    epoch: input.membership.epoch,
    membershipConfigurationDigest: input.membership.configurationDigest,
    policyDigest: input.policy.policyDigest,
    validators: selected.sort((left, right) => left.peerId.localeCompare(right.peerId)),
    faultThreshold,
    quorumThreshold: 2 * faultThreshold + 1,
  };
  const assignmentDigest = await collectiveQuorumDigestV1(
    { ...body, committeeId: null },
    input.crypto,
  );
  return Object.freeze({
    ...body,
    committeeId: `committee:${assignmentDigest.slice(7, 47)}`,
    assignmentDigest,
  });
}

export async function createSparseAgreementShareV2(input: {
  readonly assignment: SparseCommitteeAssignmentV2;
  readonly coordinateDigest: string;
  readonly proposalDigest: string;
  readonly valueDigest: string;
  readonly phase: SparseAgreementShareV2["phase"];
  readonly signerPeerId: string;
  readonly signerInstanceId: string;
  readonly signerKeyId: string;
  readonly signature: string;
  readonly crypto?: Crypto;
}): Promise<SparseAgreementShareV2> {
  await validateSparseCommitteeAssignmentDigestV2(input.assignment, input.crypto);
  quorumDigest(input.coordinateDigest, "coordinateDigest");
  quorumDigest(input.proposalDigest, "proposalDigest");
  quorumDigest(input.valueDigest, "valueDigest");
  identifier(input.signerPeerId, "signerPeerId");
  identifier(input.signerInstanceId, "signerInstanceId");
  identifier(input.signerKeyId, "signerKeyId");
  if (!input.assignment.validators.some((validator) =>
    validator.peerId === input.signerPeerId &&
    validator.instanceId === input.signerInstanceId &&
    validator.keyId === input.signerKeyId,
  )) throw new TypeError("sparse agreement signer is outside the committee");
  if (!token(input.signature, 16_384)) throw new TypeError("sparse agreement signature is invalid");
  const body = {
    schemaVersion: 2 as const,
    committeeAssignmentDigest: input.assignment.assignmentDigest,
    coordinateDigest: input.coordinateDigest,
    proposalDigest: input.proposalDigest,
    valueDigest: input.valueDigest,
    phase: input.phase,
    signerPeerId: input.signerPeerId,
    signerInstanceId: input.signerInstanceId,
    signerKeyId: input.signerKeyId,
    signature: input.signature,
  };
  return Object.freeze({
    ...body,
    shareDigest: await collectiveQuorumDigestV1(body, input.crypto),
  });
}

export async function createSparseCommitteeCertificateV2(input: {
  readonly assignment: SparseCommitteeAssignmentV2;
  readonly membership: SparseAgreementMembershipV2;
  readonly policy: SparseCommitteePolicyV2;
  readonly shares: readonly SparseAgreementShareV2[];
  readonly signatures: SparseAggregateSignaturePortV2;
  readonly certifiedAtLogicalMs: number;
  readonly crypto?: Crypto;
}): Promise<SparseCommitteeCertificateV2 | null> {
  if (!(await validateSelectedSparseCommitteeV2({
    assignment: input.assignment,
    membership: input.membership,
    policy: input.policy,
    crypto: input.crypto,
  }))) return null;
  integer(input.certifiedAtLogicalMs, "certifiedAtLogicalMs", 0, Number.MAX_SAFE_INTEGER);
  if (input.shares.length < input.assignment.quorumThreshold) return null;
  const first = input.shares[0];
  const validators = new Map(input.assignment.validators.map((item) => [item.peerId, item]));
  const seen = new Set<string>();
  const verified: SparseAgreementShareV2[] = [];
  for (const share of input.shares) {
    validateShare(share);
    const { shareDigest, ...shareBody } = share;
    if (await collectiveQuorumDigestV1(shareBody, input.crypto) !== shareDigest) return null;
    const validator = validators.get(share.signerPeerId);
    if (
      !validator ||
      seen.has(share.signerPeerId) ||
      share.committeeAssignmentDigest !== input.assignment.assignmentDigest ||
      share.coordinateDigest !== first.coordinateDigest ||
      share.proposalDigest !== first.proposalDigest ||
      share.valueDigest !== first.valueDigest ||
      share.phase !== first.phase ||
      validator.instanceId !== share.signerInstanceId ||
      validator.keyId !== share.signerKeyId
    ) return null;
    const messageDigest = await sparseShareMessageDigestV2(share, input.crypto);
    if (!(await input.signatures.verifyShare({ validator, messageDigest, signature: share.signature })))
      return null;
    seen.add(share.signerPeerId);
    verified.push(share);
  }
  if (seen.size < input.assignment.quorumThreshold) return null;
  verified.sort((left, right) => left.signerPeerId.localeCompare(right.signerPeerId));
  const messageDigest = await sparseShareMessageDigestV2(first, input.crypto);
  const aggregateSignature = await input.signatures.aggregate({ messageDigest, shares: verified });
  const aggregateValidators = verified.map((share) => validators.get(share.signerPeerId)!);
  if (!(await validateAggregateSignatureV2({
    aggregateSignature,
    messageDigest,
    validators: aggregateValidators,
    signatures: input.signatures,
    crypto: input.crypto,
  })) || !(await input.signatures.verifyAggregate({
    messageDigest,
    validators: aggregateValidators,
    signature: aggregateSignature,
  }))) return null;
  const body = {
    schemaVersion: 2 as const,
    certificateId: "pending",
    assignment: input.assignment,
    coordinateDigest: first.coordinateDigest,
    proposalDigest: first.proposalDigest,
    valueDigest: first.valueDigest,
    phase: first.phase,
    aggregateSignature,
    shareDigests: verified.map((item) => item.shareDigest).sort(),
    certifiedAtLogicalMs: input.certifiedAtLogicalMs,
  };
  const certificateDigest = await collectiveQuorumDigestV1(
    { ...body, certificateId: null },
    input.crypto,
  );
  return Object.freeze({
    ...body,
    certificateId: `committee-certificate:${certificateDigest.slice(7, 47)}`,
    certificateDigest,
  });
}

/**
 * Binds same-value shard commits under a separately selected reconciliation
 * committee. The reconciliation certificate signs the exact shard root.
 */
export async function createSparseFinalityCertificateV2(input: {
  readonly requiredShardIds: readonly string[];
  readonly shardCertificates: readonly SparseCommitteeCertificateV2[];
  readonly reconciliationCertificate: SparseCommitteeCertificateV2;
  readonly membership: SparseAgreementMembershipV2;
  readonly policy: SparseCommitteePolicyV2;
  readonly signatures: SparseAggregateSignaturePortV2;
  readonly finalizedAtLogicalMs: number;
  readonly crypto?: Crypto;
}): Promise<SparseFinalityCertificateV2 | null> {
  const requiredShardIds = canonicalIdentifiers(input.requiredShardIds, "requiredShardIds");
  if (requiredShardIds.length === 0 || requiredShardIds.length > input.policy.maximumCommittees) return null;
  const shards = [...input.shardCertificates].sort((left, right) =>
    left.assignment.shardId.localeCompare(right.assignment.shardId),
  );
  for (const certificate of [...shards, input.reconciliationCertificate])
    if (!(await validateSparseCommitteeCertificateV2({
      certificate,
      membership: input.membership,
      policy: input.policy,
      signatures: input.signatures,
      crypto: input.crypto,
    }))) return null;
  if (
    shards.length !== requiredShardIds.length ||
    shards.some((certificate, index) =>
      certificate.assignment.purpose !== "shard" ||
      certificate.assignment.shardId !== requiredShardIds[index] ||
      certificate.phase !== "commit",
    )
  ) return null;
  const first = shards[0];
  if (shards.some((certificate) =>
    certificate.coordinateDigest !== first.coordinateDigest ||
    certificate.proposalDigest !== first.proposalDigest ||
    certificate.valueDigest !== first.valueDigest ||
    certificate.assignment.epoch !== first.assignment.epoch ||
    certificate.assignment.membershipConfigurationDigest !== first.assignment.membershipConfigurationDigest ||
    certificate.assignment.policyDigest !== first.assignment.policyDigest,
  )) return null;
  const shardCertificateDigests = shards.map((item) => item.certificateDigest).sort();
  const shardCertificateRootDigest = await collectiveQuorumDigestV1({
    domain: "sparse-shard-certificate-root-v2",
    coordinateDigest: first.coordinateDigest,
    proposalDigest: first.proposalDigest,
    valueDigest: first.valueDigest,
    requiredShardIds,
    shardCertificateDigests,
  }, input.crypto);
  const reconciliation = input.reconciliationCertificate;
  if (
    reconciliation.assignment.purpose !== "reconciliation" ||
    reconciliation.phase !== "reconcile" ||
    reconciliation.coordinateDigest !== first.coordinateDigest ||
    reconciliation.proposalDigest !== first.proposalDigest ||
    reconciliation.valueDigest !== shardCertificateRootDigest ||
    reconciliation.assignment.epoch !== first.assignment.epoch ||
    reconciliation.assignment.membershipConfigurationDigest !== first.assignment.membershipConfigurationDigest ||
    reconciliation.assignment.policyDigest !== first.assignment.policyDigest
  ) return null;
  integer(input.finalizedAtLogicalMs, "finalizedAtLogicalMs", reconciliation.certifiedAtLogicalMs, Number.MAX_SAFE_INTEGER);
  const body = {
    schemaVersion: 2 as const,
    certificateId: "pending",
    coordinateDigest: first.coordinateDigest,
    proposalDigest: first.proposalDigest,
    valueDigest: first.valueDigest,
    epoch: first.assignment.epoch,
    membershipConfigurationDigest: first.assignment.membershipConfigurationDigest,
    policyDigest: first.assignment.policyDigest,
    requiredShardIds,
    shardCertificateDigests,
    shardCertificateRootDigest,
    reconciliationCertificate: reconciliation,
    finalizedAtLogicalMs: input.finalizedAtLogicalMs,
  };
  const certificateDigest = await collectiveQuorumDigestV1(
    { ...body, certificateId: null },
    input.crypto,
  );
  return Object.freeze({
    ...body,
    certificateId: `sparse-finality:${certificateDigest.slice(7, 47)}`,
    certificateDigest,
  });
}

export async function createSparseJointReconfigurationCertificateV2(input: {
  readonly priorMembership: SparseAgreementMembershipV2;
  readonly nextMembership: SparseAgreementMembershipV2;
  readonly priorPolicy: SparseCommitteePolicyV2;
  readonly nextPolicy: SparseCommitteePolicyV2;
  readonly priorSignatures: SparseAggregateSignaturePortV2;
  readonly nextSignatures: SparseAggregateSignaturePortV2;
  readonly priorFinalityCertificate: SparseFinalityCertificateV2;
  readonly nextFinalityCertificate: SparseFinalityCertificateV2;
  readonly priorShardCertificates: readonly SparseCommitteeCertificateV2[];
  readonly nextShardCertificates: readonly SparseCommitteeCertificateV2[];
  readonly crypto?: Crypto;
}): Promise<SparseJointReconfigurationCertificateV2> {
  validateMembership(input.priorMembership);
  validateMembership(input.nextMembership);
  if (
    !(await validateSparseFinalityCertificateV2({
      certificate: input.priorFinalityCertificate,
      shardCertificates: input.priorShardCertificates,
      membership: input.priorMembership,
      policy: input.priorPolicy,
      signatures: input.priorSignatures,
      crypto: input.crypto,
    })) ||
    !(await validateSparseFinalityCertificateV2({
      certificate: input.nextFinalityCertificate,
      shardCertificates: input.nextShardCertificates,
      membership: input.nextMembership,
      policy: input.nextPolicy,
      signatures: input.nextSignatures,
      crypto: input.crypto,
    }))
  ) throw new TypeError("sparse joint reconfiguration certificate validation failed");
  if (
    input.nextMembership.epoch !== input.priorMembership.epoch + 1 ||
    input.priorFinalityCertificate.membershipConfigurationDigest !== input.priorMembership.configurationDigest ||
    input.nextFinalityCertificate.membershipConfigurationDigest !== input.nextMembership.configurationDigest ||
    input.priorFinalityCertificate.coordinateDigest !== input.nextFinalityCertificate.coordinateDigest ||
    input.priorFinalityCertificate.proposalDigest !== input.nextFinalityCertificate.proposalDigest ||
    input.priorFinalityCertificate.valueDigest !== input.nextFinalityCertificate.valueDigest
  ) throw new TypeError("sparse joint reconfiguration binding is invalid");
  const body = {
    schemaVersion: 2 as const,
    priorMembershipConfigurationDigest: input.priorMembership.configurationDigest,
    nextMembershipConfigurationDigest: input.nextMembership.configurationDigest,
    priorFinalityCertificate: input.priorFinalityCertificate,
    nextFinalityCertificate: input.nextFinalityCertificate,
  };
  return Object.freeze({
    ...body,
    certificateDigest: await collectiveQuorumDigestV1(body, input.crypto),
  });
}

export async function sparseShareMessageDigestV2(
  share: Pick<
    SparseAgreementShareV2,
    "committeeAssignmentDigest" | "coordinateDigest" | "proposalDigest" | "valueDigest" | "phase"
  >,
  crypto?: Crypto,
): Promise<string> {
  return collectiveQuorumDigestV1({
    domain: "sparse-agreement-share-message-v2",
    committeeAssignmentDigest: share.committeeAssignmentDigest,
    coordinateDigest: share.coordinateDigest,
    proposalDigest: share.proposalDigest,
    valueDigest: share.valueDigest,
    phase: share.phase,
  }, crypto);
}

export async function validateSparseCommitteeAssignmentDigestV2(
  assignment: SparseCommitteeAssignmentV2,
  crypto?: Crypto,
): Promise<SparseCommitteeAssignmentV2> {
  validateAssignment(assignment);
  const { assignmentDigest, ...body } = assignment;
  const actual = await collectiveQuorumDigestV1(
    { ...body, committeeId: null },
    crypto,
  );
  if (
    actual !== assignmentDigest ||
    assignment.committeeId !== `committee:${actual.slice(7, 47)}`
  ) throw new TypeError("sparse committee assignment digest is invalid");
  return assignment;
}

export async function validateSelectedSparseCommitteeV2(input: {
  readonly assignment: SparseCommitteeAssignmentV2;
  readonly membership: SparseAgreementMembershipV2;
  readonly policy: SparseCommitteePolicyV2;
  readonly crypto?: Crypto;
}): Promise<boolean> {
  await validateSparseCommitteeAssignmentDigestV2(input.assignment, input.crypto);
  validateMembership(input.membership);
  await validateSparseCommitteePolicyV2(input.policy, input.crypto);
  if (
    input.assignment.epoch !== input.membership.epoch ||
    input.assignment.membershipConfigurationDigest !== input.membership.configurationDigest ||
    input.assignment.policyDigest !== input.policy.policyDigest
  ) return false;
  const expected = await selectSparseCommitteeV2({
    membership: input.membership,
    policy: input.policy,
    purpose: input.assignment.purpose,
    shardId: input.assignment.shardId,
    crypto: input.crypto,
  });
  return expected.assignmentDigest === input.assignment.assignmentDigest;
}

export async function sparseAggregateSignerSetDigestV2(
  algorithm: string,
  signerPeerIds: readonly string[],
  crypto?: Crypto,
): Promise<string> {
  if (!token(algorithm, 256)) throw new TypeError("sparse aggregate algorithm is invalid");
  const canonical = canonicalIdentifiers(signerPeerIds, "signerPeerIds");
  return collectiveQuorumDigestV1({
    domain: "sparse-aggregate-signer-set-v2",
    algorithm,
    signerPeerIds: canonical,
  }, crypto);
}

export async function validateSparseCommitteeCertificateV2(input: {
  readonly certificate: SparseCommitteeCertificateV2;
  readonly membership: SparseAgreementMembershipV2;
  readonly policy: SparseCommitteePolicyV2;
  readonly signatures: SparseAggregateSignaturePortV2;
  readonly crypto?: Crypto;
}): Promise<boolean> {
  const certificate = input.certificate;
  if (!certificate || certificate.schemaVersion !== 2) return false;
  if (!(await validateSelectedSparseCommitteeV2({
    assignment: certificate.assignment,
    membership: input.membership,
    policy: input.policy,
    crypto: input.crypto,
  }))) return false;
  quorumDigest(certificate.coordinateDigest, "coordinateDigest");
  quorumDigest(certificate.proposalDigest, "proposalDigest");
  quorumDigest(certificate.valueDigest, "valueDigest");
  quorumDigest(certificate.certificateDigest, "certificateDigest");
  integer(certificate.certifiedAtLogicalMs, "certifiedAtLogicalMs", 0, Number.MAX_SAFE_INTEGER);
  if (
    !["prepare", "commit", "reconcile"].includes(certificate.phase) ||
    (certificate.assignment.purpose === "reconciliation") !== (certificate.phase === "reconcile")
  ) return false;
  const shareDigests = [...certificate.shareDigests].sort();
  if (
    shareDigests.length < certificate.assignment.quorumThreshold ||
    new Set(shareDigests).size !== shareDigests.length ||
    shareDigests.some((item, index) => item !== certificate.shareDigests[index])
  ) return false;
  shareDigests.forEach((item) => quorumDigest(item, "shareDigest"));
  const signerPeerIds = canonicalIdentifiers(
    certificate.aggregateSignature.signerPeerIds,
    "signerPeerIds",
  );
  if (signerPeerIds.length < certificate.assignment.quorumThreshold) return false;
  const validatorsById = new Map(certificate.assignment.validators.map((item) => [item.peerId, item]));
  const validators = signerPeerIds.map((item) => validatorsById.get(item));
  if (validators.some((item) => item === undefined)) return false;
  const messageDigest = await sparseShareMessageDigestV2({
    committeeAssignmentDigest: certificate.assignment.assignmentDigest,
    coordinateDigest: certificate.coordinateDigest,
    proposalDigest: certificate.proposalDigest,
    valueDigest: certificate.valueDigest,
    phase: certificate.phase,
  }, input.crypto);
  if (!(await validateAggregateSignatureV2({
    aggregateSignature: certificate.aggregateSignature,
    messageDigest,
    validators: validators as SparseAgreementValidatorV2[],
    signatures: input.signatures,
    crypto: input.crypto,
  }))) return false;
  if (!(await input.signatures.verifyAggregate({
    messageDigest,
    validators: validators as SparseAgreementValidatorV2[],
    signature: certificate.aggregateSignature,
  }))) return false;
  const { certificateDigest, ...body } = certificate;
  const actual = await collectiveQuorumDigestV1(
    { ...body, certificateId: null },
    input.crypto,
  );
  return actual === certificateDigest && certificate.certificateId === `committee-certificate:${actual.slice(7, 47)}`;
}

export async function validateSparseFinalityCertificateV2(input: {
  readonly certificate: SparseFinalityCertificateV2;
  readonly shardCertificates: readonly SparseCommitteeCertificateV2[];
  readonly membership: SparseAgreementMembershipV2;
  readonly policy: SparseCommitteePolicyV2;
  readonly signatures: SparseAggregateSignaturePortV2;
  readonly crypto?: Crypto;
}): Promise<boolean> {
  if (!input.certificate || input.certificate.schemaVersion !== 2) return false;
  const rebuilt = await createSparseFinalityCertificateV2({
    requiredShardIds: input.certificate.requiredShardIds,
    shardCertificates: input.shardCertificates,
    reconciliationCertificate: input.certificate.reconciliationCertificate,
    membership: input.membership,
    policy: input.policy,
    signatures: input.signatures,
    finalizedAtLogicalMs: input.certificate.finalizedAtLogicalMs,
    crypto: input.crypto,
  });
  return rebuilt !== null && rebuilt.certificateDigest === input.certificate.certificateDigest;
}

async function validateAggregateSignatureV2(input: {
  readonly aggregateSignature: SparseAggregateSignatureV2;
  readonly messageDigest: string;
  readonly validators: readonly SparseAgreementValidatorV2[];
  readonly signatures: SparseAggregateSignaturePortV2;
  readonly crypto?: Crypto;
}): Promise<boolean> {
  const signature = input.aggregateSignature;
  if (!signature || signature.algorithm !== input.signatures.algorithm || !token(signature.value, 65_536))
    return false;
  const signerPeerIds = canonicalIdentifiers(signature.signerPeerIds, "signerPeerIds");
  if (
    signerPeerIds.length !== input.validators.length ||
    signerPeerIds.some((item, index) => item !== [...input.validators].sort((left, right) => left.peerId.localeCompare(right.peerId))[index]?.peerId)
  ) return false;
  quorumDigest(signature.signerSetDigest, "signerSetDigest");
  return signature.signerSetDigest === await sparseAggregateSignerSetDigestV2(
    signature.algorithm,
    signerPeerIds,
    input.crypto,
  );
}

function validateMembership(membership: SparseAgreementMembershipV2): void {
  if (!membership || membership.schemaVersion !== 2)
    throw new TypeError("sparse agreement membership schema is invalid");
  integer(membership.epoch, "epoch", 1, Number.MAX_SAFE_INTEGER);
  quorumDigest(membership.configurationDigest, "configurationDigest");
  quorumDigest(membership.selectionSeedDigest, "selectionSeedDigest");
  if (membership.validators.length < 4 || membership.validators.length > 1_000_000)
    throw new RangeError("sparse agreement membership size is invalid");
  const peers = new Set<string>();
  for (const validator of membership.validators) {
    identifier(validator.peerId, "peerId");
    identifier(validator.instanceId, "instanceId");
    identifier(validator.keyId, "keyId");
    identifier(validator.independenceGroupId, "independenceGroupId");
    quorumDigest(validator.eligibilityDigest, "eligibilityDigest");
    if (peers.has(validator.peerId)) throw new TypeError("sparse membership peer duplicated");
    peers.add(validator.peerId);
  }
}

function validatePolicy(policy: Omit<SparseCommitteePolicyV2, "policyDigest"> | SparseCommitteePolicyV2): void {
  if (!policy || policy.schemaVersion !== 2) throw new TypeError("sparse committee policy schema is invalid");
  identifier(policy.policyId, "policyId");
  integer(policy.policyVersion, "policyVersion", 1, Number.MAX_SAFE_INTEGER);
  integer(policy.committeeSize, "committeeSize", 4, 100_000);
  integer(policy.faultThreshold, "faultThreshold", 1, 33_333);
  integer(policy.reconciliationCommitteeSize, "reconciliationCommitteeSize", 4, 100_000);
  integer(policy.reconciliationFaultThreshold, "reconciliationFaultThreshold", 1, 33_333);
  integer(policy.maximumCommittees, "maximumCommittees", 1, 100_000);
  integer(policy.maximumValidatorsPerIndependenceGroup, "maximumValidatorsPerIndependenceGroup", 1, 100_000);
  if ("policyDigest" in policy) quorumDigest(policy.policyDigest, "policyDigest");
  if (policy.committeeSize < 3 * policy.faultThreshold + 1 || policy.reconciliationCommitteeSize < 3 * policy.reconciliationFaultThreshold + 1)
    throw new RangeError("sparse committee policy fault model is invalid");
}

function validateAssignment(assignment: SparseCommitteeAssignmentV2): void {
  if (!assignment || assignment.schemaVersion !== 2)
    throw new TypeError("sparse committee assignment schema is invalid");
  identifier(assignment.committeeId, "committeeId");
  if (assignment.purpose !== "shard" && assignment.purpose !== "reconciliation")
    throw new TypeError("sparse committee purpose is invalid");
  identifier(assignment.shardId, "shardId");
  quorumDigest(assignment.assignmentDigest, "assignmentDigest");
  quorumDigest(assignment.membershipConfigurationDigest, "membershipConfigurationDigest");
  quorumDigest(assignment.policyDigest, "policyDigest");
  integer(assignment.epoch, "epoch", 1, Number.MAX_SAFE_INTEGER);
  integer(assignment.faultThreshold, "faultThreshold", 1, Number.MAX_SAFE_INTEGER);
  integer(assignment.quorumThreshold, "quorumThreshold", 1, Number.MAX_SAFE_INTEGER);
  if (assignment.validators.length === 0) throw new TypeError("sparse committee validators are unavailable");
  const peers = new Set<string>();
  let priorPeerId: string | null = null;
  for (const validator of assignment.validators) {
    identifier(validator.peerId, "peerId");
    identifier(validator.instanceId, "instanceId");
    identifier(validator.keyId, "keyId");
    identifier(validator.independenceGroupId, "independenceGroupId");
    quorumDigest(validator.eligibilityDigest, "eligibilityDigest");
    if (peers.has(validator.peerId) || (priorPeerId !== null && priorPeerId.localeCompare(validator.peerId) >= 0))
      throw new TypeError("sparse committee validators must be canonical and unique");
    peers.add(validator.peerId);
    priorPeerId = validator.peerId;
  }
  if (assignment.validators.length < 3 * assignment.faultThreshold + 1 || assignment.quorumThreshold !== 2 * assignment.faultThreshold + 1)
    throw new TypeError("sparse committee assignment threshold is invalid");
}

function validateShare(share: SparseAgreementShareV2): void {
  if (!share || share.schemaVersion !== 2) throw new TypeError("sparse agreement share schema is invalid");
  quorumDigest(share.committeeAssignmentDigest, "committeeAssignmentDigest");
  quorumDigest(share.coordinateDigest, "coordinateDigest");
  quorumDigest(share.proposalDigest, "proposalDigest");
  quorumDigest(share.valueDigest, "valueDigest");
  quorumDigest(share.shareDigest, "shareDigest");
  if (!["prepare", "commit", "reconcile"].includes(share.phase))
    throw new TypeError("sparse agreement phase is invalid");
  identifier(share.signerPeerId, "signerPeerId");
  identifier(share.signerInstanceId, "signerInstanceId");
  identifier(share.signerKeyId, "signerKeyId");
  if (!token(share.signature, 16_384)) throw new TypeError("sparse agreement signature is invalid");
}

function canonicalIdentifiers(values: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(values) || values.length > 100_000) throw new TypeError(`${label} is invalid`);
  values.forEach((item) => identifier(item, label));
  const result = [...new Set(values)].sort();
  if (result.length !== values.length || result.some((item, index) => item !== values[index]))
    throw new TypeError(`${label} must be canonical`);
  return Object.freeze(result);
}

function identifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/.test(value))
    throw new TypeError(`${label} is invalid`);
}

function quorumDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value))
    throw new TypeError(`${label} is invalid`);
}

function token(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f]/.test(value);
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum)
    throw new RangeError(`${label} is invalid`);
  return value as number;
}
