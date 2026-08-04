import { validatePlanningFragmentRepositoryRecordV1 } from "@agentplat/collective-planning/mesh";
import type { CollectiveQuorumMembershipBindingV1 } from "@agentplat/collective-quorum";
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
  PLANNING_ARTIFACT_MAX_CANONICAL_BYTES_V1,
  type PlanningArtifactScopeV1,
  type SignedPlanningArtifactPublicationV1,
  type UnsignedPlanningArtifactPublicationV1,
} from "./contracts.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/u;

export function planningArtifactStreamIdV1(fragmentDigest: string): string {
  if (!DIGEST.test(fragmentDigest))
    throw new TypeError("planning_artifact_fragment_digest_invalid");
  return `planning.artifact.${fragmentDigest.slice("sha256:".length)}`;
}

export function planningArtifactDigestV1(
  record: unknown,
  injected?: Crypto,
): Promise<string> {
  return collectiveSyncDigestV1(
    { domain: "agentplat.planning-artifact.record.v1", record },
    injected,
  );
}

export async function createPlanningArtifactPublicationV1(input: {
  readonly scope: PlanningArtifactScopeV1;
  readonly record: unknown;
  readonly membership: CollectiveQuorumMembershipBindingV1;
  readonly signing: CollectiveSyncSigningV1;
  readonly issuedAt: string;
  readonly publishedAtLogicalMs: number;
  readonly maximumArtifactBytes?: number;
  readonly crypto?: Crypto;
}): Promise<SignedPlanningArtifactPublicationV1> {
  const record = validatePlanningFragmentRepositoryRecordV1(input.record);
  const maximum = artifactLimit(input.maximumArtifactBytes);
  assertArtifactBytes(record, maximum);
  assertScope(input.scope);
  if (
    input.signing.algorithm !== MESH_SIGNATURE_ALGORITHM ||
    !boundInstance(input.membership, input.scope.peerId, input.scope.instanceId)
  )
    throw new TypeError("planning_artifact_producer_membership_invalid");
  if (
    record.tenantId !== input.scope.tenantId ||
    record.meshId !== input.scope.meshId ||
    record.policyDomainId !== input.scope.policyDomainId ||
    record.sourcePlanView.peerId !== input.scope.peerId ||
    record.sourcePlanView.peerInstanceId !== input.scope.instanceId
  )
    throw new TypeError("planning_artifact_producer_scope_invalid");
  if (
    !timestamp(input.issuedAt) ||
    !logical(input.publishedAtLogicalMs) ||
    !privateSigningKey(input.signing.privateKey)
  )
    throw new TypeError("planning_artifact_signing_input_invalid");
  const unsigned: UnsignedPlanningArtifactPublicationV1 = {
    schemaVersion: 1,
    kind: "planning_artifact",
    tenantId: input.scope.tenantId,
    meshId: input.scope.meshId,
    policyDomainId: input.scope.policyDomainId,
    sourcePeerId: input.scope.peerId,
    sourceInstanceId: input.scope.instanceId,
    membershipEpoch: input.membership.epoch,
    membershipConfigurationDigest: input.membership.configurationDigest,
    contentReference: record.contentReference,
    artifactDigest: await planningArtifactDigestV1(record, input.crypto),
    record,
    issuedAt: input.issuedAt,
    publishedAtLogicalMs: input.publishedAtLogicalMs,
    proof: {
      algorithm: input.signing.algorithm,
      keyId: input.signing.keyId,
    },
  };
  const valid = validateUnsignedPlanningArtifactPublicationV1(unsigned);
  if (!valid) throw new TypeError("planning_artifact_publication_invalid");
  const signature = await cryptoOf(input.crypto).subtle.sign(
    MESH_SIGNATURE_ALGORITHM,
    input.signing.privateKey,
    copy(signingBytes(valid)),
  );
  const signed = validateSignedPlanningArtifactPublicationV1({
    ...valid,
    proof: { ...valid.proof, value: base64url(new Uint8Array(signature)) },
  });
  if (!signed) throw new TypeError("planning_artifact_signature_invalid");
  return signed;
}

export function validateUnsignedPlanningArtifactPublicationV1(
  value: unknown,
): UnsignedPlanningArtifactPublicationV1 | null {
  return validatePublication(
    value,
    false,
  ) as UnsignedPlanningArtifactPublicationV1 | null;
}

export function validateSignedPlanningArtifactPublicationV1(
  value: unknown,
): SignedPlanningArtifactPublicationV1 | null {
  return validatePublication(
    value,
    true,
  ) as SignedPlanningArtifactPublicationV1 | null;
}

export async function verifyPlanningArtifactPublicationV1(input: {
  readonly publication: unknown;
  readonly membership: CollectiveSyncMembershipV1;
  readonly logicalTimeMs: number;
  readonly maximumArtifactBytes?: number;
  readonly crypto?: Crypto;
}): Promise<SignedPlanningArtifactPublicationV1 | null> {
  const publication = validateSignedPlanningArtifactPublicationV1(
    input.publication,
  );
  if (
    !publication ||
    !logical(input.logicalTimeMs) ||
    publication.publishedAtLogicalMs > input.logicalTimeMs
  )
    return null;
  const maximum = artifactLimit(input.maximumArtifactBytes);
  try {
    assertArtifactBytes(publication.record, maximum);
  } catch {
    return null;
  }
  if (
    publication.artifactDigest !==
    (await planningArtifactDigestV1(publication.record, input.crypto))
  )
    return null;
  const binding = await input.membership.resolveBinding({
    epoch: publication.membershipEpoch,
    configurationDigest: publication.membershipConfigurationDigest,
    logicalTimeMs: input.logicalTimeMs,
  });
  if (
    !binding ||
    !boundInstance(
      binding,
      publication.sourcePeerId,
      publication.sourceInstanceId,
    )
  )
    return null;
  let key: MeshKeyRecord | undefined;
  try {
    key = input.membership.resolve({
      tenantId: publication.tenantId,
      meshId: publication.meshId,
      peerId: publication.sourcePeerId,
      keyId: publication.proof.keyId,
      algorithm: publication.proof.algorithm,
    });
  } catch {
    return null;
  }
  if (!key || !validKey(key, publication)) return null;
  const signature = decodeBase64Url(publication.proof.value, 64);
  if (!signature) return null;
  try {
    const verified = await cryptoOf(input.crypto).subtle.verify(
      MESH_SIGNATURE_ALGORITHM,
      key.publicKey,
      copy(signature),
      copy(signingBytes(publication)),
    );
    return verified ? publication : null;
  } catch {
    return null;
  }
}

function validatePublication(
  value: unknown,
  signed: boolean,
):
  | SignedPlanningArtifactPublicationV1
  | UnsignedPlanningArtifactPublicationV1
  | null {
  if (!recordValue(value)) return null;
  if (
    !exact(value, [
      "artifactDigest",
      "contentReference",
      "issuedAt",
      "kind",
      "membershipConfigurationDigest",
      "membershipEpoch",
      "meshId",
      "policyDomainId",
      "proof",
      "publishedAtLogicalMs",
      "record",
      "schemaVersion",
      "sourceInstanceId",
      "sourcePeerId",
      "tenantId",
    ]) ||
    value.schemaVersion !== 1 ||
    value.kind !== "planning_artifact" ||
    !identifier(value.tenantId) ||
    !identifier(value.meshId) ||
    !identifier(value.policyDomainId) ||
    !identifier(value.sourcePeerId) ||
    !identifier(value.sourceInstanceId) ||
    !positive(value.membershipEpoch) ||
    !digest(value.membershipConfigurationDigest) ||
    typeof value.contentReference !== "string" ||
    !digest(value.artifactDigest) ||
    !timestamp(value.issuedAt) ||
    !logical(value.publishedAtLogicalMs) ||
    !recordValue(value.proof) ||
    !exact(
      value.proof,
      signed ? ["algorithm", "keyId", "value"] : ["algorithm", "keyId"],
    ) ||
    value.proof.algorithm !== MESH_SIGNATURE_ALGORITHM ||
    !identifier(value.proof.keyId) ||
    (signed && !signatureValue(value.proof.value))
  )
    return null;
  let artifact;
  try {
    artifact = validatePlanningFragmentRepositoryRecordV1(value.record);
  } catch {
    return null;
  }
  if (
    artifact.tenantId !== value.tenantId ||
    artifact.meshId !== value.meshId ||
    artifact.policyDomainId !== value.policyDomainId ||
    artifact.contentReference !== value.contentReference ||
    artifact.sourcePlanView.peerId !== value.sourcePeerId ||
    artifact.sourcePlanView.peerInstanceId !== value.sourceInstanceId
  )
    return null;
  const canonical = canonicalizeMeshJsonBytes(value);
  if (!canonical.ok || canonical.value.byteLength > 1_048_576) return null;
  return deepFreeze({ ...value, record: artifact }) as unknown as
    SignedPlanningArtifactPublicationV1 | UnsignedPlanningArtifactPublicationV1;
}

function signingBytes(
  publication:
    SignedPlanningArtifactPublicationV1 | UnsignedPlanningArtifactPublicationV1,
): Uint8Array {
  const canonical = canonicalizeMeshJsonBytes({
    ...publication,
    proof: {
      algorithm: publication.proof.algorithm,
      keyId: publication.proof.keyId,
    },
  });
  if (!canonical.ok)
    throw new TypeError("planning_artifact_publication_not_canonical");
  return canonical.value;
}

function validKey(
  key: MeshKeyRecord,
  publication: SignedPlanningArtifactPublicationV1,
): boolean {
  if (
    key.status !== "active" ||
    key.tenantId !== publication.tenantId ||
    key.meshId !== publication.meshId ||
    key.peerId !== publication.sourcePeerId ||
    key.keyId !== publication.proof.keyId ||
    key.algorithm !== publication.proof.algorithm ||
    !publicVerificationKey(key.publicKey)
  )
    return false;
  const from = compareMeshTimestamps(publication.issuedAt, key.validFrom);
  const until = compareMeshTimestamps(publication.issuedAt, key.validUntil);
  return from.ok && until.ok && from.value >= 0 && until.value < 0;
}

function assertArtifactBytes(value: unknown, maximum: number): void {
  const canonical = canonicalizeMeshJsonBytes(value);
  if (!canonical.ok || canonical.value.byteLength > maximum)
    throw new RangeError("planning_artifact_exceeds_byte_limit");
}

function artifactLimit(value: number | undefined): number {
  const limit = value ?? PLANNING_ARTIFACT_MAX_CANONICAL_BYTES_V1;
  if (!Number.isSafeInteger(limit) || limit < 1_024 || limit > 1_048_576)
    throw new TypeError("planning_artifact_byte_limit_invalid");
  return limit;
}

function assertScope(scope: PlanningArtifactScopeV1): void {
  if (
    !scope ||
    !identifier(scope.tenantId) ||
    !identifier(scope.meshId) ||
    !identifier(scope.peerId) ||
    !identifier(scope.instanceId) ||
    !identifier(scope.policyDomainId)
  )
    throw new TypeError("planning_artifact_scope_invalid");
}

function boundInstance(
  membership: CollectiveQuorumMembershipBindingV1,
  peerId: string,
  instanceId: string,
): boolean {
  return membership.memberInstances.some(
    (entry) => entry.peerId === peerId && entry.instanceId === instanceId,
  );
}

function cryptoOf(injected?: Crypto): Crypto {
  const value = injected ?? globalThis.crypto;
  if (!value?.subtle) throw new TypeError("crypto_unavailable");
  return value;
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

function recordValue(value: unknown): value is Record<string, unknown> {
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

function identifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function digest(value: unknown): value is string {
  return typeof value === "string" && DIGEST.test(value);
}

function signatureValue(value: unknown): value is string {
  return typeof value === "string" && SIGNATURE.test(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && compareMeshTimestamps(value, value).ok;
}

function logical(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function positive(value: unknown): value is number {
  return logical(value) && Number(value) > 0;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value as Record<string, unknown>))
    deepFreeze(child);
  return Object.freeze(value);
}
