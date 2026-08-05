import type { MeshKeyRecord } from "@agentplat/mesh-crypto";
import {
  MESH_SIGNATURE_ALGORITHM,
  canonicalizeMeshJsonBytes,
  compareMeshTimestamps,
} from "@agentplat/mesh-protocol";
import { normalizeCheckpointTransferV1 } from "@agentplat/runtime/adapter";

import {
  EXECUTION_CHECKPOINT_PROTOCOL_V1,
  type ExecutionCheckpointArtifactV1,
  type ExecutionCheckpointManifestV1,
  type ExecutionCheckpointMembershipBindingV1,
  type ExecutionCheckpointMembershipV1,
  type ExecutionCheckpointPayloadV1,
  type ExecutionCheckpointReplicationCertificateV1,
  type ExecutionCheckpointReplicationPolicyV1,
  type ExecutionCheckpointScopeV1,
  type ExecutionCheckpointSigningV1,
  type SignedExecutionCheckpointEnvelopeV1,
  type SignedExecutionCheckpointPublicationV1,
  type UnsignedExecutionCheckpointEnvelopeV1,
  type UnsignedExecutionCheckpointPublicationV1,
} from "./checkpoint-contracts.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,255}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/u;
const MAXIMUM_ENVELOPE_REMAINING_LIFETIME_MS = 86_400_000;
const FORBIDDEN_TRANSFER_KEY =
  /(?:credential|password|secret|token|api[_-]?key|private[_-]?key|prompt|reasoning|chain[_-]?of[_-]?thought)/iu;

export function validateExecutionCheckpointPolicyV1(
  input: unknown,
): ExecutionCheckpointReplicationPolicyV1 {
  if (
    !record(input) ||
    !exact(input, [
      "schemaVersion",
      "replicaCount",
      "writeThreshold",
      "certificateCustodyThreshold",
      "evidenceLifetimeMs",
      "maximumArtifactBytes",
    ]) ||
    input.schemaVersion !== 1 ||
    !integer(input.replicaCount, 1, 16) ||
    !integer(input.writeThreshold, 1, Number(input.replicaCount)) ||
    !integer(
      input.certificateCustodyThreshold,
      1,
      Number(input.writeThreshold),
    ) ||
    !integer(input.evidenceLifetimeMs, 1_000, 86_400_000) ||
    !integer(input.maximumArtifactBytes, 1_024, 16 * 1_024 * 1_024)
  ) {
    throw new TypeError("execution_checkpoint_policy_invalid");
  }
  return freeze(input as unknown as ExecutionCheckpointReplicationPolicyV1);
}

export async function executionCheckpointDigestV1(
  value: unknown,
  injected?: Crypto,
): Promise<string> {
  const canonical = canonicalizeMeshJsonBytes(value);
  if (!canonical.ok)
    throw new TypeError("execution_checkpoint_value_not_canonical");
  const hashed = await cryptoOf(injected).subtle.digest(
    "SHA-256",
    canonical.value.slice().buffer,
  );
  return `sha256:${Array.from(new Uint8Array(hashed), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

export function assertExecutionCheckpointTransferSafeV1(state: unknown): void {
  const visit = (value: unknown, depth: number): void => {
    if (depth > 32) throw new TypeError("execution_checkpoint_state_too_deep");
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, depth + 1);
      return;
    }
    if (!record(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_TRANSFER_KEY.test(key))
        throw new TypeError("execution_checkpoint_state_key_prohibited");
      visit(child, depth + 1);
    }
  };
  visit(state, 0);
}

export async function createExecutionCheckpointArtifactV1(input: {
  readonly scope: ExecutionCheckpointScopeV1;
  readonly membership: ExecutionCheckpointMembershipBindingV1;
  readonly transfer: unknown;
  readonly objectiveId: string;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly assignmentEpoch: number;
  readonly assignmentAuthorityId: string;
  readonly fencingToken: string;
  readonly workContractDigest: string;
  readonly roleBindingDigest: string;
  readonly publishedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly maximumArtifactBytes: number;
  readonly crypto?: Crypto;
}): Promise<ExecutionCheckpointArtifactV1> {
  assertScope(input.scope);
  const transfer = normalizeCheckpointTransferV1(input.transfer as never, {
    maximumStateBytes: input.maximumArtifactBytes,
  });
  assertExecutionCheckpointTransferSafeV1(transfer.state);
  if (
    transfer.tenantId !== input.scope.tenantId ||
    !bound(input.membership, input.scope.peerId, input.scope.instanceId) ||
    !id(input.objectiveId) ||
    !id(input.workItemId) ||
    !positive(input.workItemRevision) ||
    !positive(input.assignmentEpoch) ||
    !id(input.assignmentAuthorityId) ||
    !id(input.fencingToken) ||
    !digest(input.workContractDigest) ||
    !digest(input.roleBindingDigest) ||
    !logical(input.publishedAtLogicalMs) ||
    !logical(input.expiresAtLogicalMs) ||
    input.expiresAtLogicalMs <= input.publishedAtLogicalMs
  )
    throw new TypeError("execution_checkpoint_artifact_input_invalid");
  const transferDigest = await executionCheckpointDigestV1(
    { domain: "agentplat.execution-checkpoint.transfer.v1", transfer },
    input.crypto,
  );
  const manifestCore = {
    schemaVersion: 1 as const,
    checkpointId: transfer.checkpoint.checkpointId,
    tenantId: input.scope.tenantId,
    meshId: input.scope.meshId,
    policyDomainId: input.scope.policyDomainId,
    sourcePeerId: input.scope.peerId,
    sourceInstanceId: input.scope.instanceId,
    membershipEpoch: input.membership.epoch,
    membershipConfigurationDigest: input.membership.configurationDigest,
    objectiveId: input.objectiveId,
    workItemId: input.workItemId,
    workItemRevision: input.workItemRevision,
    assignmentEpoch: input.assignmentEpoch,
    assignmentAuthorityId: input.assignmentAuthorityId,
    fencingToken: input.fencingToken,
    workContractDigest: input.workContractDigest,
    roleBindingDigest: input.roleBindingDigest,
    adapterId: transfer.adapterId,
    adapterVersion: transfer.adapterVersion,
    implementationId: transfer.implementationId,
    throughStepSequence: transfer.checkpoint.throughStepSequence,
    stateDigest: transfer.checkpoint.stateDigest,
    transferDigest,
    createdAt: transfer.checkpoint.createdAt,
    publishedAtLogicalMs: input.publishedAtLogicalMs,
    expiresAtLogicalMs: input.expiresAtLogicalMs,
  };
  const artifactDigest = await executionCheckpointDigestV1(
    {
      domain: "agentplat.execution-checkpoint.artifact.v1",
      manifest: manifestCore,
      transfer,
    },
    input.crypto,
  );
  const artifact: ExecutionCheckpointArtifactV1 = {
    schemaVersion: 1,
    manifest: {
      ...manifestCore,
      contentReference: `execution-checkpoint:${artifactDigest}`,
    },
    transfer,
    artifactDigest,
  };
  const validated = await validateExecutionCheckpointArtifactV1(
    artifact,
    input.maximumArtifactBytes,
    input.crypto,
  );
  if (!validated) throw new TypeError("execution_checkpoint_artifact_invalid");
  return validated;
}

export async function validateExecutionCheckpointArtifactV1(
  input: unknown,
  maximumArtifactBytes = 16 * 1_024 * 1_024,
  injected?: Crypto,
): Promise<ExecutionCheckpointArtifactV1 | null> {
  if (
    !record(input) ||
    !exact(input, [
      "schemaVersion",
      "manifest",
      "transfer",
      "artifactDigest",
    ]) ||
    input.schemaVersion !== 1 ||
    !digest(input.artifactDigest) ||
    !record(input.manifest)
  )
    return null;
  const manifest = validateManifest(input.manifest);
  if (!manifest) return null;
  let transfer;
  try {
    transfer = normalizeCheckpointTransferV1(input.transfer as never, {
      maximumStateBytes: maximumArtifactBytes,
    });
    assertExecutionCheckpointTransferSafeV1(transfer.state);
  } catch {
    return null;
  }
  if (
    manifest.checkpointId !== transfer.checkpoint.checkpointId ||
    manifest.tenantId !== transfer.tenantId ||
    manifest.objectiveId !== transfer.objectiveId ||
    manifest.adapterId !== transfer.adapterId ||
    manifest.adapterVersion !== transfer.adapterVersion ||
    manifest.implementationId !== transfer.implementationId ||
    manifest.throughStepSequence !== transfer.checkpoint.throughStepSequence ||
    manifest.stateDigest !== transfer.checkpoint.stateDigest ||
    manifest.createdAt !== transfer.checkpoint.createdAt ||
    manifest.contentReference !== `execution-checkpoint:${input.artifactDigest}`
  )
    return null;
  const transferDigest = await executionCheckpointDigestV1(
    { domain: "agentplat.execution-checkpoint.transfer.v1", transfer },
    injected,
  );
  if (transferDigest !== manifest.transferDigest) return null;
  const { contentReference: _ignored, ...manifestCore } = manifest;
  const artifactDigest = await executionCheckpointDigestV1(
    {
      domain: "agentplat.execution-checkpoint.artifact.v1",
      manifest: manifestCore,
      transfer,
    },
    injected,
  );
  if (artifactDigest !== input.artifactDigest) return null;
  const canonical = canonicalizeMeshJsonBytes(input);
  if (!canonical.ok || canonical.value.byteLength > maximumArtifactBytes)
    return null;
  return freeze({
    schemaVersion: 1,
    manifest,
    transfer,
    artifactDigest,
  });
}

export async function createExecutionCheckpointPublicationV1(input: {
  readonly artifact: ExecutionCheckpointArtifactV1;
  readonly signing: ExecutionCheckpointSigningV1;
  readonly maximumArtifactBytes: number;
  readonly crypto?: Crypto;
}): Promise<SignedExecutionCheckpointPublicationV1> {
  const artifact = await validateExecutionCheckpointArtifactV1(
    input.artifact,
    input.maximumArtifactBytes,
    input.crypto,
  );
  if (
    !artifact ||
    input.signing.algorithm !== MESH_SIGNATURE_ALGORITHM ||
    !id(input.signing.keyId) ||
    !privateKey(input.signing.privateKey)
  )
    throw new TypeError("execution_checkpoint_publication_input_invalid");
  const unsigned: UnsignedExecutionCheckpointPublicationV1 = {
    schemaVersion: 1,
    kind: "execution_checkpoint",
    artifact,
    proof: {
      algorithm: input.signing.algorithm,
      keyId: input.signing.keyId,
    },
  };
  const signature = await cryptoOf(input.crypto).subtle.sign(
    MESH_SIGNATURE_ALGORITHM,
    input.signing.privateKey,
    bytes(unsigned),
  );
  return freeze({
    ...unsigned,
    proof: { ...unsigned.proof, value: base64url(new Uint8Array(signature)) },
  });
}

export async function verifyExecutionCheckpointPublicationV1(input: {
  readonly publication: unknown;
  readonly membership: ExecutionCheckpointMembershipV1;
  readonly logicalTimeMs: number;
  readonly maximumArtifactBytes: number;
  readonly crypto?: Crypto;
}): Promise<SignedExecutionCheckpointPublicationV1 | null> {
  const value = input.publication;
  if (
    !record(value) ||
    !exact(value, ["schemaVersion", "kind", "artifact", "proof"]) ||
    value.schemaVersion !== 1 ||
    value.kind !== "execution_checkpoint" ||
    !proof(value.proof)
  )
    return null;
  const artifact = await validateExecutionCheckpointArtifactV1(
    value.artifact,
    input.maximumArtifactBytes,
    input.crypto,
  );
  if (
    !artifact ||
    artifact.manifest.publishedAtLogicalMs > input.logicalTimeMs ||
    artifact.manifest.expiresAtLogicalMs <= input.logicalTimeMs
  )
    return null;
  const membership = await input.membership.resolveBinding({
    epoch: artifact.manifest.membershipEpoch,
    configurationDigest: artifact.manifest.membershipConfigurationDigest,
    logicalTimeMs: input.logicalTimeMs,
  });
  if (
    !membership ||
    !bound(
      membership,
      artifact.manifest.sourcePeerId,
      artifact.manifest.sourceInstanceId,
    )
  )
    return null;
  const key = resolveKey(input.membership, artifact.manifest, value.proof);
  if (!key || !validKey(key, artifact.manifest, value.proof.keyId)) return null;
  const decoded = decode(value.proof.value);
  if (!decoded) return null;
  try {
    const verified = await cryptoOf(input.crypto).subtle.verify(
      MESH_SIGNATURE_ALGORITHM,
      key.publicKey,
      decoded,
      bytes({
        schemaVersion: 1,
        kind: "execution_checkpoint",
        artifact,
        proof: { algorithm: value.proof.algorithm, keyId: value.proof.keyId },
      }),
    );
    return verified
      ? freeze({
          schemaVersion: 1,
          kind: "execution_checkpoint",
          artifact,
          proof: value.proof,
        } as SignedExecutionCheckpointPublicationV1)
      : null;
  } catch {
    return null;
  }
}

export async function createExecutionCheckpointEnvelopeV1<
  TPayload extends ExecutionCheckpointPayloadV1,
>(
  input: Omit<
    UnsignedExecutionCheckpointEnvelopeV1<TPayload>,
    "protocol" | "schemaVersion" | "proof"
  > & {
    readonly signing: ExecutionCheckpointSigningV1;
    readonly crypto?: Crypto;
  },
): Promise<SignedExecutionCheckpointEnvelopeV1<TPayload>> {
  if (
    input.signing.algorithm !== MESH_SIGNATURE_ALGORITHM ||
    !id(input.signing.keyId) ||
    !privateKey(input.signing.privateKey)
  )
    throw new TypeError("execution_checkpoint_signing_key_invalid");
  const unsigned: UnsignedExecutionCheckpointEnvelopeV1<TPayload> = {
    protocol: EXECUTION_CHECKPOINT_PROTOCOL_V1,
    schemaVersion: 1,
    messageId: input.messageId,
    tenantId: input.tenantId,
    meshId: input.meshId,
    policyDomainId: input.policyDomainId,
    senderPeerId: input.senderPeerId,
    senderInstanceId: input.senderInstanceId,
    audiencePeerId: input.audiencePeerId,
    audienceInstanceId: input.audienceInstanceId,
    membershipEpoch: input.membershipEpoch,
    membershipConfigurationDigest: input.membershipConfigurationDigest,
    issuedAt: input.issuedAt,
    expiresAtLogicalMs: input.expiresAtLogicalMs,
    payload: input.payload,
    proof: { algorithm: input.signing.algorithm, keyId: input.signing.keyId },
  };
  if (!validateEnvelopeShape(unsigned, false))
    throw new TypeError("execution_checkpoint_envelope_invalid");
  const signed = await cryptoOf(input.crypto).subtle.sign(
    MESH_SIGNATURE_ALGORITHM,
    input.signing.privateKey,
    bytes(unsigned),
  );
  return freeze({
    ...unsigned,
    proof: { ...unsigned.proof, value: base64url(new Uint8Array(signed)) },
  });
}

export async function verifyExecutionCheckpointEnvelopeV1<
  TPayload extends ExecutionCheckpointPayloadV1,
>(input: {
  readonly envelope: unknown;
  readonly membership: ExecutionCheckpointMembershipV1;
  readonly logicalTimeMs: number;
  readonly requireCurrentMembership?: boolean;
  readonly crypto?: Crypto;
}): Promise<SignedExecutionCheckpointEnvelopeV1<TPayload> | null> {
  const envelope = validateEnvelopeShape(input.envelope, true);
  if (
    !envelope ||
    envelope.expiresAtLogicalMs <= input.logicalTimeMs ||
    envelope.expiresAtLogicalMs - input.logicalTimeMs >
      MAXIMUM_ENVELOPE_REMAINING_LIFETIME_MS
  )
    return null;
  const binding = input.requireCurrentMembership
    ? await input.membership.currentBinding({
        logicalTimeMs: input.logicalTimeMs,
      })
    : await input.membership.resolveBinding({
        epoch: envelope.membershipEpoch,
        configurationDigest: envelope.membershipConfigurationDigest,
        logicalTimeMs: input.logicalTimeMs,
      });
  if (
    !binding ||
    binding.epoch !== envelope.membershipEpoch ||
    binding.configurationDigest !== envelope.membershipConfigurationDigest ||
    !bound(binding, envelope.senderPeerId, envelope.senderInstanceId) ||
    !bound(binding, envelope.audiencePeerId, envelope.audienceInstanceId)
  )
    return null;
  const key = input.membership.resolve({
    tenantId: envelope.tenantId,
    meshId: envelope.meshId,
    peerId: envelope.senderPeerId,
    keyId: envelope.proof.keyId,
    algorithm: envelope.proof.algorithm,
  });
  if (!key || !validEnvelopeKey(key, envelope)) return null;
  const decoded = decode(envelope.proof.value);
  if (!decoded) return null;
  try {
    const verified = await cryptoOf(input.crypto).subtle.verify(
      MESH_SIGNATURE_ALGORITHM,
      key.publicKey,
      decoded,
      bytes({
        ...envelope,
        proof: {
          algorithm: envelope.proof.algorithm,
          keyId: envelope.proof.keyId,
        },
      }),
    );
    return verified
      ? (envelope as SignedExecutionCheckpointEnvelopeV1<TPayload>)
      : null;
  } catch {
    return null;
  }
}

export async function createExecutionCheckpointCertificateV1(input: {
  readonly artifact: ExecutionCheckpointArtifactV1;
  readonly policy: ExecutionCheckpointReplicationPolicyV1;
  readonly selectedReplicas: readonly {
    readonly peerId: string;
    readonly instanceId: string;
  }[];
  readonly receipts: ExecutionCheckpointReplicationCertificateV1["receipts"];
  readonly certifiedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly crypto?: Crypto;
}): Promise<ExecutionCheckpointReplicationCertificateV1> {
  const policy = validateExecutionCheckpointPolicyV1(input.policy);
  const body = {
    schemaVersion: 1 as const,
    kind: "execution_checkpoint_replication" as const,
    checkpointId: input.artifact.manifest.checkpointId,
    tenantId: input.artifact.manifest.tenantId,
    meshId: input.artifact.manifest.meshId,
    policyDomainId: input.artifact.manifest.policyDomainId,
    sourcePeerId: input.artifact.manifest.sourcePeerId,
    sourceInstanceId: input.artifact.manifest.sourceInstanceId,
    membershipEpoch: input.artifact.manifest.membershipEpoch,
    membershipConfigurationDigest:
      input.artifact.manifest.membershipConfigurationDigest,
    artifactDigest: input.artifact.artifactDigest,
    contentReference: input.artifact.manifest.contentReference,
    policy,
    selectedReplicas: freeze([...input.selectedReplicas]),
    receipts: freeze([...input.receipts]),
    certifiedAtLogicalMs: input.certifiedAtLogicalMs,
    expiresAtLogicalMs: input.expiresAtLogicalMs,
  };
  const certificateDigest = await executionCheckpointDigestV1(
    { domain: "agentplat.execution-checkpoint.certificate.v1", body },
    input.crypto,
  );
  const certificate = {
    ...body,
    certificateId: `checkpoint.certificate.${certificateDigest.slice(7, 39)}`,
    certificateDigest,
  };
  const valid = await validateExecutionCheckpointCertificateV1(
    certificate,
    input.crypto,
  );
  if (!valid) throw new TypeError("execution_checkpoint_certificate_invalid");
  return valid;
}

export async function validateExecutionCheckpointCertificateV1(
  input: unknown,
  injected?: Crypto,
): Promise<ExecutionCheckpointReplicationCertificateV1 | null> {
  if (!record(input)) return null;
  const expected = [
    "schemaVersion",
    "kind",
    "certificateId",
    "certificateDigest",
    "checkpointId",
    "tenantId",
    "meshId",
    "policyDomainId",
    "sourcePeerId",
    "sourceInstanceId",
    "membershipEpoch",
    "membershipConfigurationDigest",
    "artifactDigest",
    "contentReference",
    "policy",
    "selectedReplicas",
    "receipts",
    "certifiedAtLogicalMs",
    "expiresAtLogicalMs",
  ];
  if (
    !exact(input, expected) ||
    input.schemaVersion !== 1 ||
    input.kind !== "execution_checkpoint_replication" ||
    !id(input.certificateId) ||
    !digest(input.certificateDigest) ||
    !id(input.checkpointId) ||
    !id(input.tenantId) ||
    !id(input.meshId) ||
    !id(input.policyDomainId) ||
    !id(input.sourcePeerId) ||
    !id(input.sourceInstanceId) ||
    !positive(input.membershipEpoch) ||
    !digest(input.membershipConfigurationDigest) ||
    !digest(input.artifactDigest) ||
    input.contentReference !== `execution-checkpoint:${input.artifactDigest}` ||
    !logical(input.certifiedAtLogicalMs) ||
    !logical(input.expiresAtLogicalMs) ||
    Number(input.expiresAtLogicalMs) <= Number(input.certifiedAtLogicalMs) ||
    !Array.isArray(input.selectedReplicas) ||
    !Array.isArray(input.receipts)
  )
    return null;
  let policy: ExecutionCheckpointReplicationPolicyV1;
  try {
    policy = validateExecutionCheckpointPolicyV1(input.policy);
  } catch {
    return null;
  }
  const replicas = input.selectedReplicas.map((value) => {
    if (
      !record(value) ||
      !exact(value, ["peerId", "instanceId"]) ||
      !id(value.peerId) ||
      !id(value.instanceId)
    )
      return null;
    return freeze({ peerId: value.peerId, instanceId: value.instanceId });
  });
  if (
    replicas.some((value) => value === null) ||
    replicas.length !== policy.replicaCount ||
    new Set(replicas.map((value) => value?.peerId)).size !== replicas.length ||
    input.receipts.length < policy.writeThreshold
  )
    return null;
  const receipts: ExecutionCheckpointReplicationCertificateV1["receipts"][number][] =
    [];
  for (const value of input.receipts) {
    const receipt = validateEnvelopeShape(value, true);
    if (
      !receipt ||
      receipt.payload.type !== "checkpoint.artifact.stored" ||
      receipt.payload.checkpointId !== input.checkpointId ||
      receipt.payload.artifactDigest !== input.artifactDigest ||
      receipt.tenantId !== input.tenantId ||
      receipt.meshId !== input.meshId ||
      receipt.policyDomainId !== input.policyDomainId ||
      receipt.membershipEpoch !== input.membershipEpoch ||
      receipt.membershipConfigurationDigest !==
        input.membershipConfigurationDigest ||
      !replicas.some(
        (replica) =>
          replica?.peerId === receipt.senderPeerId &&
          replica.instanceId === receipt.senderInstanceId,
      )
    )
      return null;
    receipts.push(
      receipt as ExecutionCheckpointReplicationCertificateV1["receipts"][number],
    );
  }
  if (
    new Set(receipts.map((receipt) => receipt.senderPeerId)).size !==
    receipts.length
  )
    return null;
  const body = {
    schemaVersion: 1 as const,
    kind: "execution_checkpoint_replication" as const,
    checkpointId: input.checkpointId as string,
    tenantId: input.tenantId as string,
    meshId: input.meshId as string,
    policyDomainId: input.policyDomainId as string,
    sourcePeerId: input.sourcePeerId as string,
    sourceInstanceId: input.sourceInstanceId as string,
    membershipEpoch: input.membershipEpoch as number,
    membershipConfigurationDigest:
      input.membershipConfigurationDigest as string,
    artifactDigest: input.artifactDigest as string,
    contentReference: input.contentReference as string,
    policy,
    selectedReplicas:
      replicas as ExecutionCheckpointReplicationCertificateV1["selectedReplicas"],
    receipts,
    certifiedAtLogicalMs: input.certifiedAtLogicalMs as number,
    expiresAtLogicalMs: input.expiresAtLogicalMs as number,
  };
  const certificateDigest = await executionCheckpointDigestV1(
    { domain: "agentplat.execution-checkpoint.certificate.v1", body },
    injected,
  );
  if (
    certificateDigest !== input.certificateDigest ||
    input.certificateId !==
      `checkpoint.certificate.${certificateDigest.slice(7, 39)}`
  )
    return null;
  return freeze({
    ...body,
    certificateId: input.certificateId as string,
    certificateDigest,
  });
}

function validateManifest(
  value: Record<string, unknown>,
): ExecutionCheckpointManifestV1 | null {
  if (
    !exact(value, [
      "schemaVersion",
      "checkpointId",
      "tenantId",
      "meshId",
      "policyDomainId",
      "sourcePeerId",
      "sourceInstanceId",
      "membershipEpoch",
      "membershipConfigurationDigest",
      "objectiveId",
      "workItemId",
      "workItemRevision",
      "assignmentEpoch",
      "assignmentAuthorityId",
      "fencingToken",
      "workContractDigest",
      "roleBindingDigest",
      "adapterId",
      "adapterVersion",
      "implementationId",
      "throughStepSequence",
      "stateDigest",
      "transferDigest",
      "contentReference",
      "createdAt",
      "publishedAtLogicalMs",
      "expiresAtLogicalMs",
    ])
  )
    return null;
  if (
    value.schemaVersion !== 1 ||
    !id(value.checkpointId) ||
    !id(value.tenantId) ||
    !id(value.meshId) ||
    !id(value.policyDomainId) ||
    !id(value.sourcePeerId) ||
    !id(value.sourceInstanceId) ||
    !positive(value.membershipEpoch) ||
    !digest(value.membershipConfigurationDigest) ||
    !id(value.objectiveId) ||
    !id(value.workItemId) ||
    !positive(value.workItemRevision) ||
    !positive(value.assignmentEpoch) ||
    !id(value.assignmentAuthorityId) ||
    !id(value.fencingToken) ||
    !digest(value.workContractDigest) ||
    !digest(value.roleBindingDigest) ||
    !id(value.adapterId) ||
    typeof value.adapterVersion !== "string" ||
    value.adapterVersion.length < 1 ||
    value.adapterVersion.length > 128 ||
    !id(value.implementationId) ||
    !logical(value.throughStepSequence) ||
    typeof value.stateDigest !== "string" ||
    value.stateDigest.length < 1 ||
    value.stateDigest.length > 256 ||
    !digest(value.transferDigest) ||
    typeof value.contentReference !== "string" ||
    !timestamp(value.createdAt) ||
    !logical(value.publishedAtLogicalMs) ||
    !logical(value.expiresAtLogicalMs) ||
    Number(value.expiresAtLogicalMs) <= Number(value.publishedAtLogicalMs)
  )
    return null;
  return freeze(value as unknown as ExecutionCheckpointManifestV1);
}

function validateEnvelopeShape(
  value: unknown,
  signed: boolean,
): SignedExecutionCheckpointEnvelopeV1 | null {
  if (
    !record(value) ||
    !exact(value, [
      "protocol",
      "schemaVersion",
      "messageId",
      "tenantId",
      "meshId",
      "policyDomainId",
      "senderPeerId",
      "senderInstanceId",
      "audiencePeerId",
      "audienceInstanceId",
      "membershipEpoch",
      "membershipConfigurationDigest",
      "issuedAt",
      "expiresAtLogicalMs",
      "payload",
      "proof",
    ])
  )
    return null;
  if (
    value.protocol !== EXECUTION_CHECKPOINT_PROTOCOL_V1 ||
    value.schemaVersion !== 1 ||
    !id(value.messageId) ||
    !id(value.tenantId) ||
    !id(value.meshId) ||
    !id(value.policyDomainId) ||
    !id(value.senderPeerId) ||
    !id(value.senderInstanceId) ||
    !id(value.audiencePeerId) ||
    !id(value.audienceInstanceId) ||
    !positive(value.membershipEpoch) ||
    !digest(value.membershipConfigurationDigest) ||
    !timestamp(value.issuedAt) ||
    !logical(value.expiresAtLogicalMs) ||
    !record(value.payload) ||
    !payloadShape(value.payload) ||
    !record(value.proof) ||
    !exact(
      value.proof,
      signed ? ["algorithm", "keyId", "value"] : ["algorithm", "keyId"],
    ) ||
    value.proof.algorithm !== MESH_SIGNATURE_ALGORITHM ||
    !id(value.proof.keyId) ||
    (signed && !signature(value.proof.value))
  )
    return null;
  return freeze(value as unknown as SignedExecutionCheckpointEnvelopeV1);
}

function payloadShape(value: Record<string, unknown>): boolean {
  switch (value.type) {
    case "checkpoint.artifact.store":
      return exact(value, ["type", "publication"]);
    case "checkpoint.certificate.store":
      return exact(value, ["type", "certificate"]);
    case "checkpoint.certificate.get":
      return exact(value, ["type", "checkpointId"]) && id(value.checkpointId);
    case "checkpoint.artifact.get":
      return (
        exact(value, ["type", "checkpointId", "artifactDigest"]) &&
        id(value.checkpointId) &&
        digest(value.artifactDigest)
      );
    case "checkpoint.artifact.stored":
      return (
        exact(value, [
          "type",
          "requestMessageId",
          "checkpointId",
          "artifactDigest",
          "storedAtLogicalMs",
        ]) &&
        id(value.requestMessageId) &&
        id(value.checkpointId) &&
        digest(value.artifactDigest) &&
        logical(value.storedAtLogicalMs)
      );
    case "checkpoint.certificate.stored":
      return (
        exact(value, [
          "type",
          "requestMessageId",
          "checkpointId",
          "certificateId",
          "storedAtLogicalMs",
        ]) &&
        id(value.requestMessageId) &&
        id(value.checkpointId) &&
        id(value.certificateId) &&
        logical(value.storedAtLogicalMs)
      );
    case "checkpoint.certificate.found":
      return (
        exact(value, [
          "type",
          "requestMessageId",
          "checkpointId",
          "certificate",
        ]) &&
        id(value.requestMessageId) &&
        id(value.checkpointId)
      );
    case "checkpoint.artifact.found":
      return (
        exact(value, [
          "type",
          "requestMessageId",
          "checkpointId",
          "artifact",
        ]) &&
        id(value.requestMessageId) &&
        id(value.checkpointId)
      );
    default:
      return false;
  }
}

function bytes(value: unknown): ArrayBuffer {
  const canonical = canonicalizeMeshJsonBytes(value);
  if (!canonical.ok) throw new TypeError("execution_checkpoint_not_canonical");
  return canonical.value.slice().buffer;
}

function resolveKey(
  membership: ExecutionCheckpointMembershipV1,
  manifest: ExecutionCheckpointManifestV1,
  proofValue: { algorithm: typeof MESH_SIGNATURE_ALGORITHM; keyId: string },
): MeshKeyRecord | undefined {
  try {
    return membership.resolve({
      tenantId: manifest.tenantId,
      meshId: manifest.meshId,
      peerId: manifest.sourcePeerId,
      keyId: proofValue.keyId,
      algorithm: proofValue.algorithm,
    });
  } catch {
    return undefined;
  }
}

function validKey(
  key: MeshKeyRecord,
  manifest: ExecutionCheckpointManifestV1,
  keyId: string,
): boolean {
  const from = compareMeshTimestamps(manifest.createdAt, key.validFrom);
  const until = compareMeshTimestamps(manifest.createdAt, key.validUntil);
  return (
    key.status === "active" &&
    key.tenantId === manifest.tenantId &&
    key.meshId === manifest.meshId &&
    key.peerId === manifest.sourcePeerId &&
    key.keyId === keyId &&
    publicKey(key.publicKey) &&
    from.ok &&
    until.ok &&
    from.value >= 0 &&
    until.value < 0
  );
}

function validEnvelopeKey(
  key: MeshKeyRecord,
  envelope: SignedExecutionCheckpointEnvelopeV1,
): boolean {
  const from = compareMeshTimestamps(envelope.issuedAt, key.validFrom);
  const until = compareMeshTimestamps(envelope.issuedAt, key.validUntil);
  return (
    key.status === "active" &&
    key.tenantId === envelope.tenantId &&
    key.meshId === envelope.meshId &&
    key.peerId === envelope.senderPeerId &&
    key.keyId === envelope.proof.keyId &&
    publicKey(key.publicKey) &&
    from.ok &&
    until.ok &&
    from.value >= 0 &&
    until.value < 0
  );
}

function assertScope(scope: ExecutionCheckpointScopeV1): void {
  if (
    !scope ||
    !id(scope.tenantId) ||
    !id(scope.meshId) ||
    !id(scope.policyDomainId) ||
    !id(scope.peerId) ||
    !id(scope.instanceId)
  )
    throw new TypeError("execution_checkpoint_scope_invalid");
}
function bound(
  binding: ExecutionCheckpointMembershipBindingV1,
  peerId: string,
  instanceId: string,
): boolean {
  return binding.memberInstances.some(
    (entry) => entry.peerId === peerId && entry.instanceId === instanceId,
  );
}
function validProofBase(
  value: unknown,
): value is { algorithm: typeof MESH_SIGNATURE_ALGORITHM; keyId: string } {
  return (
    record(value) &&
    value.algorithm === MESH_SIGNATURE_ALGORITHM &&
    id(value.keyId)
  );
}
function proof(value: unknown): value is {
  algorithm: typeof MESH_SIGNATURE_ALGORITHM;
  keyId: string;
  value: string;
} {
  return (
    validProofBase(value) && signature((value as Record<string, unknown>).value)
  );
}
function privateKey(value: CryptoKey): boolean {
  return (
    value?.type === "private" &&
    value.algorithm?.name === MESH_SIGNATURE_ALGORITHM &&
    value.usages.includes("sign")
  );
}
function publicKey(value: CryptoKey): boolean {
  return (
    value?.type === "public" &&
    value.algorithm?.name === MESH_SIGNATURE_ALGORITHM &&
    value.usages.includes("verify")
  );
}
function cryptoOf(value?: Crypto): Crypto {
  const resolved = value ?? globalThis.crypto;
  if (!resolved?.subtle) throw new TypeError("crypto_unavailable");
  return resolved;
}
function base64url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/=/gu, "")
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_");
}
function decode(value: string): ArrayBuffer | null {
  try {
    const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
    const bytes = Uint8Array.from(
      atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4)),
      (entry) => entry.charCodeAt(0),
    );
    return bytes.byteLength === 64 ? bytes.buffer : null;
  } catch {
    return null;
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((entry, index) => entry === expected[index])
  );
}
function id(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}
function digest(value: unknown): value is string {
  return typeof value === "string" && DIGEST.test(value);
}
function signature(value: unknown): value is string {
  return typeof value === "string" && SIGNATURE.test(value);
}
function integer(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    Number.isSafeInteger(value) &&
    Number(value) >= minimum &&
    Number(value) <= maximum
  );
}
function logical(value: unknown): value is number {
  return integer(value, 0, Number.MAX_SAFE_INTEGER);
}
function positive(value: unknown): value is number {
  return integer(value, 1, Number.MAX_SAFE_INTEGER);
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && compareMeshTimestamps(value, value).ok;
}
function freeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value as Record<string, unknown>))
    freeze(child);
  return Object.freeze(value);
}
