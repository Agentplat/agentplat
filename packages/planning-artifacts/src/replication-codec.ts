import type { CollectiveQuorumMembershipBindingV1 } from "@agentplat/collective-quorum";
import { planningFragmentContentReferenceV1 } from "@agentplat/collective-planning/mesh";
import {
  collectiveSyncDigestV1,
  type CollectiveSyncMembershipV1,
  type CollectiveSyncSigningV1,
} from "@agentplat/collective-sync";
import type { MeshKeyRecord } from "@agentplat/mesh-crypto";
import {
  MESH_SIGNATURE_ALGORITHM,
  canonicalizeMeshJsonBytes,
  compareMeshTimestamps,
} from "@agentplat/mesh-protocol";

import {
  planningArtifactDigestV1,
  validateSignedPlanningArtifactPublicationV1,
} from "./publication.js";
import {
  PLANNING_ARTIFACT_REPLICATION_MAX_CANONICAL_BYTES_V1,
  PLANNING_ARTIFACT_REPLICATION_MAX_REPLICAS_V1,
  PLANNING_ARTIFACT_REPLICATION_PROTOCOL_V1,
  PLANNING_ARTIFACT_REPLICATION_SCHEMA_VERSION_V1,
  type PlanningArtifactCertificateStorePayloadV1,
  type PlanningArtifactCertificateStoredPayloadV1,
  type PlanningArtifactReplicaStorePayloadV1,
  type PlanningArtifactReplicaStoredPayloadV1,
  type PlanningArtifactReplicaV1,
  type PlanningArtifactReplicationCertificateV1,
  type PlanningArtifactReplicationPayloadV1,
  type PlanningArtifactReplicationPolicyV1,
  type SignedPlanningArtifactReplicationEnvelopeV1,
  type UnsignedPlanningArtifactReplicationEnvelopeV1,
} from "./replication-contracts.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/u;
const MAX_RECEIPT_LIFETIME_MS = 86_400_000;

export function validatePlanningArtifactReplicationPolicyV1(
  value: unknown,
): PlanningArtifactReplicationPolicyV1 {
  if (
    !record(value) ||
    !exact(value, [
      "receiptLifetimeMs",
      "replicaCount",
      "schemaVersion",
      "writeThreshold",
    ]) ||
    value.schemaVersion !== 1 ||
    !positive(value.replicaCount) ||
    value.replicaCount > PLANNING_ARTIFACT_REPLICATION_MAX_REPLICAS_V1 ||
    !positive(value.writeThreshold) ||
    value.writeThreshold > value.replicaCount ||
    !positive(value.receiptLifetimeMs) ||
    value.receiptLifetimeMs > MAX_RECEIPT_LIFETIME_MS
  )
    throw new TypeError("planning_artifact_replication_policy_invalid");
  return Object.freeze({
    schemaVersion: 1,
    replicaCount: value.replicaCount,
    writeThreshold: value.writeThreshold,
    receiptLifetimeMs: value.receiptLifetimeMs,
  });
}

export async function selectPlanningArtifactReplicasV1(input: {
  readonly membership: CollectiveQuorumMembershipBindingV1;
  readonly sourcePeerId: string;
  readonly sourceInstanceId: string;
  readonly fragmentDigest: string;
  readonly policy: PlanningArtifactReplicationPolicyV1;
  readonly crypto?: Crypto;
}): Promise<readonly PlanningArtifactReplicaV1[]> {
  const policy = validatePlanningArtifactReplicationPolicyV1(input.policy);
  if (
    !DIGEST.test(input.fragmentDigest) ||
    !IDENTIFIER.test(input.sourcePeerId) ||
    !IDENTIFIER.test(input.sourceInstanceId) ||
    !boundInstance(input.membership, input.sourcePeerId, input.sourceInstanceId)
  )
    throw new TypeError("planning_artifact_replica_selection_invalid");
  const candidates: Array<PlanningArtifactReplicaV1 & { score: string }> = [];
  for (const peerId of input.membership.memberPeerIds) {
    if (peerId === input.sourcePeerId) continue;
    const instances = input.membership.memberInstances
      .filter((entry) => entry.peerId === peerId)
      .map((entry) => entry.instanceId)
      .sort();
    if (instances.length !== 1 || !instances[0])
      throw new TypeError("planning_artifact_member_instance_ambiguous");
    candidates.push({
      peerId,
      instanceId: instances[0],
      score: await collectiveSyncDigestV1(
        {
          domain: "agentplat.planning-artifact.replica-selection.v1",
          fragmentDigest: input.fragmentDigest,
          membershipConfigurationDigest: input.membership.configurationDigest,
          peerId,
          instanceId: instances[0],
        },
        input.crypto,
      ),
    });
  }
  if (candidates.length < policy.replicaCount)
    throw new Error("planning_artifact_replica_population_insufficient");
  candidates.sort(
    (left, right) =>
      compareCodeUnits(left.score, right.score) ||
      compareCodeUnits(left.peerId, right.peerId) ||
      compareCodeUnits(left.instanceId, right.instanceId),
  );
  return Object.freeze(
    candidates
      .slice(0, policy.replicaCount)
      .map(({ peerId, instanceId }) => Object.freeze({ peerId, instanceId })),
  );
}

export function planningArtifactPublicationDigestV1(
  publication: unknown,
  crypto?: Crypto,
): Promise<string> {
  return collectiveSyncDigestV1(
    {
      domain: "agentplat.planning-artifact.publication.v1",
      publication,
    },
    crypto,
  );
}

export function planningArtifactCertificateStreamIdV1(
  fragmentDigest: string,
): string {
  if (!DIGEST.test(fragmentDigest))
    throw new TypeError("planning_artifact_certificate_digest_invalid");
  return `planning.artifact.certificate.${fragmentDigest.slice(7)}`;
}

export async function createSignedPlanningArtifactReplicationEnvelopeV1<
  TPayload extends PlanningArtifactReplicationPayloadV1,
>(input: {
  readonly tenantId: string;
  readonly meshId: string;
  readonly policyDomainId: string;
  readonly senderPeerId: string;
  readonly senderInstanceId: string;
  readonly audiencePeerId: string;
  readonly audienceInstanceId: string;
  readonly membership: CollectiveQuorumMembershipBindingV1;
  readonly issuedAt: string;
  readonly expiresAtLogicalMs: number;
  readonly payload: TPayload;
  readonly signing: CollectiveSyncSigningV1;
  readonly crypto?: Crypto;
}): Promise<SignedPlanningArtifactReplicationEnvelopeV1<TPayload>> {
  if (
    input.signing.algorithm !== MESH_SIGNATURE_ALGORITHM ||
    !privateSigningKey(input.signing.privateKey) ||
    !boundInstance(
      input.membership,
      input.senderPeerId,
      input.senderInstanceId,
    ) ||
    !boundInstance(
      input.membership,
      input.audiencePeerId,
      input.audienceInstanceId,
    )
  )
    throw new TypeError("planning_artifact_replication_signing_invalid");
  const base = {
    protocol: PLANNING_ARTIFACT_REPLICATION_PROTOCOL_V1,
    schemaVersion: PLANNING_ARTIFACT_REPLICATION_SCHEMA_VERSION_V1,
    tenantId: input.tenantId,
    meshId: input.meshId,
    policyDomainId: input.policyDomainId,
    senderPeerId: input.senderPeerId,
    senderInstanceId: input.senderInstanceId,
    audiencePeerId: input.audiencePeerId,
    audienceInstanceId: input.audienceInstanceId,
    membershipEpoch: input.membership.epoch,
    membershipConfigurationDigest: input.membership.configurationDigest,
    issuedAt: input.issuedAt,
    expiresAtLogicalMs: input.expiresAtLogicalMs,
    payload: input.payload,
    proof: {
      algorithm: input.signing.algorithm,
      keyId: input.signing.keyId,
    },
  } as const;
  const messageDigest = await collectiveSyncDigestV1(
    {
      domain: "agentplat.planning-artifact.replication-message.v1",
      envelope: base,
    },
    input.crypto,
  );
  const unsigned =
    validateUnsignedPlanningArtifactReplicationEnvelopeV1<TPayload>({
      ...base,
      messageId: `artifact.replication.${messageDigest.slice(7, 47)}`,
    });
  if (!unsigned)
    throw new TypeError("planning_artifact_replication_envelope_invalid");
  const signature = await cryptoOf(input.crypto).subtle.sign(
    MESH_SIGNATURE_ALGORITHM,
    input.signing.privateKey,
    copy(signingBytes(unsigned)),
  );
  const signed = validateSignedPlanningArtifactReplicationEnvelopeV1<TPayload>({
    ...unsigned,
    proof: {
      ...unsigned.proof,
      value: base64url(new Uint8Array(signature)),
    },
  });
  if (!signed)
    throw new TypeError("planning_artifact_replication_signature_invalid");
  return signed;
}

export function validateUnsignedPlanningArtifactReplicationEnvelopeV1<
  TPayload extends PlanningArtifactReplicationPayloadV1 =
    PlanningArtifactReplicationPayloadV1,
>(
  value: unknown,
): UnsignedPlanningArtifactReplicationEnvelopeV1<TPayload> | null {
  return envelope(
    value,
    false,
  ) as UnsignedPlanningArtifactReplicationEnvelopeV1<TPayload> | null;
}

export function validateSignedPlanningArtifactReplicationEnvelopeV1<
  TPayload extends PlanningArtifactReplicationPayloadV1 =
    PlanningArtifactReplicationPayloadV1,
>(
  value: unknown,
): SignedPlanningArtifactReplicationEnvelopeV1<TPayload> | null {
  return envelope(
    value,
    true,
  ) as SignedPlanningArtifactReplicationEnvelopeV1<TPayload> | null;
}

export async function verifyPlanningArtifactReplicationEnvelopeV1<
  TPayload extends PlanningArtifactReplicationPayloadV1 =
    PlanningArtifactReplicationPayloadV1,
>(input: {
  readonly envelope: unknown;
  readonly membership: CollectiveSyncMembershipV1;
  readonly logicalTimeMs: number;
  readonly requireCurrentMembership?: boolean;
  readonly crypto?: Crypto;
}): Promise<SignedPlanningArtifactReplicationEnvelopeV1<TPayload> | null> {
  const value = validateSignedPlanningArtifactReplicationEnvelopeV1<TPayload>(
    input.envelope,
  );
  if (
    !value ||
    !logical(input.logicalTimeMs) ||
    input.logicalTimeMs > value.expiresAtLogicalMs
  )
    return null;
  const expectedDigest = await collectiveSyncDigestV1(
    {
      domain: "agentplat.planning-artifact.replication-message.v1",
      envelope: messageBase(value),
    },
    input.crypto,
  );
  if (value.messageId !== `artifact.replication.${expectedDigest.slice(7, 47)}`)
    return null;
  const binding = await input.membership.resolveBinding({
    epoch: value.membershipEpoch,
    configurationDigest: value.membershipConfigurationDigest,
    logicalTimeMs: input.logicalTimeMs,
  });
  if (
    !binding ||
    !boundInstance(binding, value.senderPeerId, value.senderInstanceId) ||
    !boundInstance(binding, value.audiencePeerId, value.audienceInstanceId)
  )
    return null;
  if (input.requireCurrentMembership) {
    const current = await input.membership.currentBinding({
      logicalTimeMs: input.logicalTimeMs,
    });
    if (
      !current ||
      current.epoch !== binding.epoch ||
      current.configurationDigest !== binding.configurationDigest
    )
      return null;
  }
  let key: MeshKeyRecord | undefined;
  try {
    key = input.membership.resolve({
      tenantId: value.tenantId,
      meshId: value.meshId,
      peerId: value.senderPeerId,
      keyId: value.proof.keyId,
      algorithm: value.proof.algorithm,
    });
  } catch {
    return null;
  }
  if (!key || !validKey(key, value)) return null;
  const signature = decodeBase64Url(value.proof.value, 64);
  if (!signature) return null;
  try {
    return (await cryptoOf(input.crypto).subtle.verify(
      MESH_SIGNATURE_ALGORITHM,
      key.publicKey,
      copy(signature),
      copy(signingBytes(value)),
    ))
      ? value
      : null;
  } catch {
    return null;
  }
}

export async function createPlanningArtifactReplicationCertificateV1(input: {
  readonly tenantId: string;
  readonly meshId: string;
  readonly policyDomainId: string;
  readonly sourcePeerId: string;
  readonly sourceInstanceId: string;
  readonly membership: CollectiveQuorumMembershipBindingV1;
  readonly publicationDigest: string;
  readonly contentReference: string;
  readonly fragmentDigest: string;
  readonly artifactDigest: string;
  readonly policy: PlanningArtifactReplicationPolicyV1;
  readonly selectedReplicas: readonly PlanningArtifactReplicaV1[];
  readonly receipts: readonly SignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicaStoredPayloadV1>[];
  readonly certifiedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly membershipResolver: CollectiveSyncMembershipV1;
  readonly crypto?: Crypto;
}): Promise<PlanningArtifactReplicationCertificateV1> {
  const policy = validatePlanningArtifactReplicationPolicyV1(input.policy);
  const receipts = Object.freeze(
    [...input.receipts].sort(
      (left, right) =>
        compareCodeUnits(left.senderPeerId, right.senderPeerId) ||
        compareCodeUnits(left.senderInstanceId, right.senderInstanceId),
    ),
  );
  const seed = {
    schemaVersion: 1 as const,
    kind: "planning_artifact_replication" as const,
    tenantId: input.tenantId,
    meshId: input.meshId,
    policyDomainId: input.policyDomainId,
    sourcePeerId: input.sourcePeerId,
    sourceInstanceId: input.sourceInstanceId,
    membershipEpoch: input.membership.epoch,
    membershipConfigurationDigest: input.membership.configurationDigest,
    publicationDigest: input.publicationDigest,
    contentReference: input.contentReference,
    fragmentDigest: input.fragmentDigest,
    artifactDigest: input.artifactDigest,
    policy,
    selectedReplicas: Object.freeze(
      input.selectedReplicas.map((entry) => Object.freeze({ ...entry })),
    ),
    receipts,
    certifiedAtLogicalMs: input.certifiedAtLogicalMs,
    expiresAtLogicalMs: input.expiresAtLogicalMs,
  };
  const certificateDigest = await collectiveSyncDigestV1(
    {
      domain: "agentplat.planning-artifact.replication-certificate.v1",
      certificate: seed,
    },
    input.crypto,
  );
  const certificate = validatePlanningArtifactReplicationCertificateShapeV1({
    ...seed,
    certificateId: `planning.artifact.replication.${certificateDigest.slice(7, 47)}`,
    certificateDigest,
  });
  if (!certificate)
    throw new TypeError("planning_artifact_replication_certificate_invalid");
  const verified = await verifyPlanningArtifactReplicationCertificateV1({
    certificate,
    membership: input.membershipResolver,
    logicalTimeMs: input.certifiedAtLogicalMs,
    requireCurrentMembership: true,
    expectedPolicy: policy,
    crypto: input.crypto,
  });
  if (!verified)
    throw new TypeError("planning_artifact_replication_certificate_invalid");
  return verified;
}

export function validatePlanningArtifactReplicationCertificateShapeV1(
  value: unknown,
): PlanningArtifactReplicationCertificateV1 | null {
  if (
    !record(value) ||
    !exact(value, [
      "artifactDigest",
      "certificateDigest",
      "certificateId",
      "certifiedAtLogicalMs",
      "contentReference",
      "expiresAtLogicalMs",
      "fragmentDigest",
      "kind",
      "membershipConfigurationDigest",
      "membershipEpoch",
      "meshId",
      "policy",
      "policyDomainId",
      "publicationDigest",
      "receipts",
      "schemaVersion",
      "selectedReplicas",
      "sourceInstanceId",
      "sourcePeerId",
      "tenantId",
    ]) ||
    value.schemaVersion !== 1 ||
    value.kind !== "planning_artifact_replication" ||
    !IDENTIFIER.test(String(value.certificateId)) ||
    !DIGEST.test(String(value.certificateDigest)) ||
    !IDENTIFIER.test(String(value.tenantId)) ||
    !IDENTIFIER.test(String(value.meshId)) ||
    !IDENTIFIER.test(String(value.policyDomainId)) ||
    !IDENTIFIER.test(String(value.sourcePeerId)) ||
    !IDENTIFIER.test(String(value.sourceInstanceId)) ||
    !positive(value.membershipEpoch) ||
    !DIGEST.test(String(value.membershipConfigurationDigest)) ||
    !DIGEST.test(String(value.publicationDigest)) ||
    typeof value.contentReference !== "string" ||
    value.contentReference.length < 1 ||
    !DIGEST.test(String(value.fragmentDigest)) ||
    value.contentReference !==
      planningFragmentContentReferenceV1(String(value.fragmentDigest)) ||
    !DIGEST.test(String(value.artifactDigest)) ||
    !logical(value.certifiedAtLogicalMs) ||
    !positive(value.expiresAtLogicalMs) ||
    value.expiresAtLogicalMs <= value.certifiedAtLogicalMs
  )
    return null;
  let policy: PlanningArtifactReplicationPolicyV1;
  try {
    policy = validatePlanningArtifactReplicationPolicyV1(value.policy);
  } catch {
    return null;
  }
  if (
    !Array.isArray(value.selectedReplicas) ||
    value.selectedReplicas.length !== policy.replicaCount ||
    value.selectedReplicas.some(
      (entry) =>
        !record(entry) ||
        !exact(entry, ["instanceId", "peerId"]) ||
        !IDENTIFIER.test(String(entry.peerId)) ||
        !IDENTIFIER.test(String(entry.instanceId)),
    ) ||
    new Set(
      value.selectedReplicas.map(
        (entry) => `${String(entry.peerId)}\u0000${String(entry.instanceId)}`,
      ),
    ).size !== value.selectedReplicas.length ||
    !Array.isArray(value.receipts) ||
    value.receipts.length < policy.writeThreshold ||
    value.receipts.length > value.selectedReplicas.length
  )
    return null;
  const receipts = value.receipts.map((entry) =>
    validateSignedPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicaStoredPayloadV1>(
      entry,
    ),
  );
  if (
    receipts.some((entry) => !entry) ||
    receipts.some((entry) => entry?.payload.type !== "artifact.replica.stored")
  )
    return null;
  const canonical = canonicalizeMeshJsonBytes(value);
  if (
    !canonical.ok ||
    canonical.value.byteLength >
      PLANNING_ARTIFACT_REPLICATION_MAX_CANONICAL_BYTES_V1
  )
    return null;
  return deepFreeze({
    ...value,
    policy,
    selectedReplicas: value.selectedReplicas.map((entry) => ({ ...entry })),
    receipts,
  }) as unknown as PlanningArtifactReplicationCertificateV1;
}

export async function verifyPlanningArtifactReplicationCertificateV1(input: {
  readonly certificate: unknown;
  readonly membership: CollectiveSyncMembershipV1;
  readonly logicalTimeMs: number;
  readonly requireCurrentMembership?: boolean;
  readonly expectedPolicy?: PlanningArtifactReplicationPolicyV1;
  readonly crypto?: Crypto;
}): Promise<PlanningArtifactReplicationCertificateV1 | null> {
  const certificate = validatePlanningArtifactReplicationCertificateShapeV1(
    input.certificate,
  );
  if (
    !certificate ||
    !logical(input.logicalTimeMs) ||
    certificate.certifiedAtLogicalMs > input.logicalTimeMs ||
    input.logicalTimeMs > certificate.expiresAtLogicalMs ||
    certificate.expiresAtLogicalMs - certificate.certifiedAtLogicalMs >
      certificate.policy.receiptLifetimeMs
  )
    return null;
  const { certificateId, certificateDigest, ...seed } = certificate;
  const expectedDigest = await collectiveSyncDigestV1(
    {
      domain: "agentplat.planning-artifact.replication-certificate.v1",
      certificate: seed,
    },
    input.crypto,
  );
  if (
    certificateDigest !== expectedDigest ||
    certificateId !==
      `planning.artifact.replication.${expectedDigest.slice(7, 47)}`
  )
    return null;
  const policy = validatePlanningArtifactReplicationPolicyV1(
    input.expectedPolicy ?? certificate.policy,
  );
  if (!sameJson(policy, certificate.policy)) return null;
  const binding = await input.membership.resolveBinding({
    epoch: certificate.membershipEpoch,
    configurationDigest: certificate.membershipConfigurationDigest,
    logicalTimeMs: input.logicalTimeMs,
  });
  if (
    !binding ||
    !boundInstance(
      binding,
      certificate.sourcePeerId,
      certificate.sourceInstanceId,
    )
  )
    return null;
  if (input.requireCurrentMembership) {
    const current = await input.membership.currentBinding({
      logicalTimeMs: input.logicalTimeMs,
    });
    if (
      !current ||
      current.epoch !== binding.epoch ||
      current.configurationDigest !== binding.configurationDigest
    )
      return null;
  }
  let selected: readonly PlanningArtifactReplicaV1[];
  try {
    selected = await selectPlanningArtifactReplicasV1({
      membership: binding,
      sourcePeerId: certificate.sourcePeerId,
      sourceInstanceId: certificate.sourceInstanceId,
      fragmentDigest: certificate.fragmentDigest,
      policy,
      crypto: input.crypto,
    });
  } catch {
    return null;
  }
  if (!sameJson(selected, certificate.selectedReplicas)) return null;
  const selectedKeys = new Set(
    selected.map((entry) => `${entry.peerId}\u0000${entry.instanceId}`),
  );
  const receiptKeys = new Set<string>();
  for (const candidate of certificate.receipts) {
    const receipt =
      await verifyPlanningArtifactReplicationEnvelopeV1<PlanningArtifactReplicaStoredPayloadV1>(
        {
          envelope: candidate,
          membership: input.membership,
          logicalTimeMs: input.logicalTimeMs,
          crypto: input.crypto,
        },
      );
    if (
      !receipt ||
      receipt.payload.type !== "artifact.replica.stored" ||
      receipt.tenantId !== certificate.tenantId ||
      receipt.meshId !== certificate.meshId ||
      receipt.policyDomainId !== certificate.policyDomainId ||
      receipt.audiencePeerId !== certificate.sourcePeerId ||
      receipt.audienceInstanceId !== certificate.sourceInstanceId ||
      receipt.membershipEpoch !== certificate.membershipEpoch ||
      receipt.membershipConfigurationDigest !==
        certificate.membershipConfigurationDigest ||
      receipt.payload.publicationDigest !== certificate.publicationDigest ||
      receipt.payload.contentReference !== certificate.contentReference ||
      receipt.payload.fragmentDigest !== certificate.fragmentDigest ||
      receipt.payload.artifactDigest !== certificate.artifactDigest ||
      receipt.payload.storedAtLogicalMs > certificate.certifiedAtLogicalMs ||
      receipt.expiresAtLogicalMs < certificate.expiresAtLogicalMs
    )
      return null;
    const key = `${receipt.senderPeerId}\u0000${receipt.senderInstanceId}`;
    if (!selectedKeys.has(key) || receiptKeys.has(key)) return null;
    receiptKeys.add(key);
  }
  return receiptKeys.size >= policy.writeThreshold ? certificate : null;
}

export async function publicationMatchesDigestV1(input: {
  readonly publication: unknown;
  readonly publicationDigest: string;
  readonly crypto?: Crypto;
}): Promise<boolean> {
  const publication = validateSignedPlanningArtifactPublicationV1(
    input.publication,
  );
  return Boolean(
    publication &&
    input.publicationDigest ===
      (await planningArtifactPublicationDigestV1(publication, input.crypto)) &&
    publication.artifactDigest ===
      (await planningArtifactDigestV1(publication.record, input.crypto)),
  );
}

function envelope(
  value: unknown,
  signed: boolean,
):
  | UnsignedPlanningArtifactReplicationEnvelopeV1
  | SignedPlanningArtifactReplicationEnvelopeV1
  | null {
  if (
    !record(value) ||
    !exact(value, [
      "audienceInstanceId",
      "audiencePeerId",
      "expiresAtLogicalMs",
      "issuedAt",
      "membershipConfigurationDigest",
      "membershipEpoch",
      "meshId",
      "messageId",
      "payload",
      "policyDomainId",
      "proof",
      "protocol",
      "schemaVersion",
      "senderInstanceId",
      "senderPeerId",
      "tenantId",
    ]) ||
    value.protocol !== PLANNING_ARTIFACT_REPLICATION_PROTOCOL_V1 ||
    value.schemaVersion !== PLANNING_ARTIFACT_REPLICATION_SCHEMA_VERSION_V1 ||
    !IDENTIFIER.test(String(value.messageId)) ||
    !IDENTIFIER.test(String(value.tenantId)) ||
    !IDENTIFIER.test(String(value.meshId)) ||
    !IDENTIFIER.test(String(value.policyDomainId)) ||
    !IDENTIFIER.test(String(value.senderPeerId)) ||
    !IDENTIFIER.test(String(value.senderInstanceId)) ||
    !IDENTIFIER.test(String(value.audiencePeerId)) ||
    !IDENTIFIER.test(String(value.audienceInstanceId)) ||
    !positive(value.membershipEpoch) ||
    !DIGEST.test(String(value.membershipConfigurationDigest)) ||
    !timestamp(value.issuedAt) ||
    !positive(value.expiresAtLogicalMs) ||
    !validPayload(value.payload) ||
    !record(value.proof) ||
    !exact(
      value.proof,
      signed ? ["algorithm", "keyId", "value"] : ["algorithm", "keyId"],
    ) ||
    value.proof.algorithm !== MESH_SIGNATURE_ALGORITHM ||
    !IDENTIFIER.test(String(value.proof.keyId)) ||
    (signed && !SIGNATURE.test(String(value.proof.value)))
  )
    return null;
  const canonical = canonicalizeMeshJsonBytes(value);
  if (
    !canonical.ok ||
    canonical.value.byteLength >
      PLANNING_ARTIFACT_REPLICATION_MAX_CANONICAL_BYTES_V1
  )
    return null;
  return deepFreeze(value) as unknown as
    | UnsignedPlanningArtifactReplicationEnvelopeV1
    | SignedPlanningArtifactReplicationEnvelopeV1;
}

function validPayload(
  value: unknown,
): value is PlanningArtifactReplicationPayloadV1 {
  if (!record(value) || typeof value.type !== "string") return false;
  if (value.type === "artifact.replica.store")
    return (
      exact(value, [
        "publication",
        "publicationDigest",
        "requestedAtLogicalMs",
        "type",
      ]) &&
      DIGEST.test(String(value.publicationDigest)) &&
      logical(value.requestedAtLogicalMs) &&
      Boolean(validateSignedPlanningArtifactPublicationV1(value.publication))
    );
  if (value.type === "artifact.replica.stored")
    return (
      exact(value, [
        "artifactDigest",
        "contentReference",
        "fragmentDigest",
        "publicationDigest",
        "requestMessageId",
        "storedAtLogicalMs",
        "type",
      ]) &&
      IDENTIFIER.test(String(value.requestMessageId)) &&
      DIGEST.test(String(value.publicationDigest)) &&
      typeof value.contentReference === "string" &&
      value.contentReference.length > 0 &&
      DIGEST.test(String(value.fragmentDigest)) &&
      DIGEST.test(String(value.artifactDigest)) &&
      logical(value.storedAtLogicalMs)
    );
  if (value.type === "artifact.certificate.store")
    return (
      exact(value, ["certificate", "requestedAtLogicalMs", "type"]) &&
      logical(value.requestedAtLogicalMs) &&
      Boolean(
        validatePlanningArtifactReplicationCertificateShapeV1(
          value.certificate,
        ),
      )
    );
  if (value.type === "artifact.certificate.stored")
    return (
      exact(value, [
        "artifactDigest",
        "certificateId",
        "requestMessageId",
        "storedAtLogicalMs",
        "type",
      ]) &&
      IDENTIFIER.test(String(value.requestMessageId)) &&
      IDENTIFIER.test(String(value.certificateId)) &&
      DIGEST.test(String(value.artifactDigest)) &&
      logical(value.storedAtLogicalMs)
    );
  return false;
}

function messageBase(
  value:
    | UnsignedPlanningArtifactReplicationEnvelopeV1
    | SignedPlanningArtifactReplicationEnvelopeV1,
): Omit<UnsignedPlanningArtifactReplicationEnvelopeV1, "messageId"> {
  return {
    protocol: value.protocol,
    schemaVersion: value.schemaVersion,
    tenantId: value.tenantId,
    meshId: value.meshId,
    policyDomainId: value.policyDomainId,
    senderPeerId: value.senderPeerId,
    senderInstanceId: value.senderInstanceId,
    audiencePeerId: value.audiencePeerId,
    audienceInstanceId: value.audienceInstanceId,
    membershipEpoch: value.membershipEpoch,
    membershipConfigurationDigest: value.membershipConfigurationDigest,
    issuedAt: value.issuedAt,
    expiresAtLogicalMs: value.expiresAtLogicalMs,
    payload: value.payload,
    proof: {
      algorithm: value.proof.algorithm,
      keyId: value.proof.keyId,
    },
  };
}

function signingBytes(
  value:
    | UnsignedPlanningArtifactReplicationEnvelopeV1
    | SignedPlanningArtifactReplicationEnvelopeV1,
): Uint8Array {
  const canonical = canonicalizeMeshJsonBytes({
    ...value,
    proof: {
      algorithm: value.proof.algorithm,
      keyId: value.proof.keyId,
    },
  });
  if (!canonical.ok)
    throw new TypeError("planning_artifact_replication_not_canonical");
  return canonical.value;
}

function validKey(
  key: MeshKeyRecord,
  envelope: SignedPlanningArtifactReplicationEnvelopeV1,
): boolean {
  if (
    key.status !== "active" ||
    key.tenantId !== envelope.tenantId ||
    key.meshId !== envelope.meshId ||
    key.peerId !== envelope.senderPeerId ||
    key.keyId !== envelope.proof.keyId ||
    key.algorithm !== envelope.proof.algorithm ||
    !publicVerificationKey(key.publicKey)
  )
    return false;
  const from = compareMeshTimestamps(envelope.issuedAt, key.validFrom);
  const until = compareMeshTimestamps(envelope.issuedAt, key.validUntil);
  return from.ok && until.ok && from.value >= 0 && until.value < 0;
}

function boundInstance(
  binding: CollectiveQuorumMembershipBindingV1,
  peerId: string,
  instanceId: string,
): boolean {
  return binding.memberInstances.some(
    (entry) => entry.peerId === peerId && entry.instanceId === instanceId,
  );
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function privateSigningKey(key: CryptoKey): boolean {
  return (
    key?.type === "private" &&
    key.algorithm?.name === MESH_SIGNATURE_ALGORITHM &&
    Array.from(key.usages).includes("sign")
  );
}

function publicVerificationKey(key: CryptoKey): boolean {
  return (
    key?.type === "public" &&
    key.algorithm?.name === MESH_SIGNATURE_ALGORITHM &&
    Array.from(key.usages).includes("verify")
  );
}

function cryptoOf(injected?: Crypto): Crypto {
  const value = injected ?? globalThis.crypto;
  if (!value?.subtle) throw new TypeError("crypto_unavailable");
  return value;
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && compareMeshTimestamps(value, value).ok;
}

function positive(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function logical(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function record(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exact(value: Record<string, any>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function sameJson(left: unknown, right: unknown): boolean {
  const a = canonicalizeMeshJsonBytes(left);
  const b = canonicalizeMeshJsonBytes(right);
  if (!a.ok || !b.ok || a.value.byteLength !== b.value.byteLength) return false;
  return a.value.every((byte, index) => byte === b.value[index]);
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value as Record<string, unknown>))
    deepFreeze(child);
  return Object.freeze(value);
}

function base64url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/=/gu, "")
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_");
}

function decodeBase64Url(value: string, bytes: number): Uint8Array | null {
  try {
    if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
    const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
    const decoded = Uint8Array.from(
      atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4)),
      (entry) => entry.charCodeAt(0),
    );
    return decoded.byteLength === bytes ? decoded : null;
  } catch {
    return null;
  }
}

function copy(value: Uint8Array): ArrayBuffer {
  return value.slice().buffer;
}
