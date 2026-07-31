import {
  createEvidenceAttestationV1,
  createEvidenceChallengeV1,
  createEvidenceClaimV1,
  createEvidenceRetractionV1,
  createTrustObservationV1,
} from "./evidence.js";
import type {
  EvidenceAttestationV1,
  EvidenceChallengeV1,
  EvidenceClaimV1,
  EvidenceRetractionV1,
  EvidenceScopeV1,
  MeshEvidenceEnvelopeMaterialV1,
  MeshEvidenceWireScopeV1,
  TrustSubjectV1,
  TrustObservationV1,
} from "./types.js";
import {
  assertExactKeys,
  assertIdentifier,
  assertSafeInteger,
  TrustValidationError,
  validateTrustSubjectV1,
} from "./validation.js";

export function normalizeMeshEvidenceScopeV1(
  envelope: MeshEvidenceEnvelopeMaterialV1,
  wireScope: MeshEvidenceWireScopeV1,
): EvidenceScopeV1 {
  assertExactKeys(
    envelope,
    [
      "schemaVersion",
      "tenantId",
      "meshId",
      "objectiveId",
      "senderPeerId",
      "causationId",
    ],
    "mesh envelope material",
  );
  if (envelope.schemaVersion !== 1)
    throw new TrustValidationError("mesh envelope schema is invalid");
  for (const key of ["tenantId", "meshId", "senderPeerId"] as const)
    assertIdentifier(envelope[key], key);
  if (envelope.objectiveId !== null)
    assertIdentifier(envelope.objectiveId, "objectiveId");
  if (envelope.causationId !== null)
    assertIdentifier(envelope.causationId, "causationId");
  if (wireScope.kind === "mesh") {
    if (envelope.objectiveId !== null)
      throw new TrustValidationError("mesh scope forbids objectiveId");
    return {
      schemaVersion: 1,
      kind: "mesh",
      tenantId: envelope.tenantId,
      meshId: envelope.meshId,
    };
  }
  if (envelope.objectiveId === null)
    throw new TrustValidationError("objective scope requires objectiveId");
  assertSafeInteger(wireScope.objectiveRevision, "objectiveRevision", 1);
  if (wireScope.kind === "objective")
    return {
      schemaVersion: 1,
      kind: "objective",
      tenantId: envelope.tenantId,
      meshId: envelope.meshId,
      objectiveId: envelope.objectiveId,
      objectiveRevision: wireScope.objectiveRevision,
    };
  for (const key of ["workItemId", "assignmentAuthorityId"] as const)
    assertIdentifier(wireScope[key], key);
  for (const key of ["workItemRevision", "assignmentEpoch"] as const)
    assertSafeInteger(wireScope[key], key, 1);
  if (
    typeof wireScope.fencingToken !== "string" ||
    wireScope.fencingToken.length === 0
  )
    throw new TrustValidationError("fencingToken is invalid");
  return {
    schemaVersion: 1,
    kind: "work",
    tenantId: envelope.tenantId,
    meshId: envelope.meshId,
    objectiveId: envelope.objectiveId,
    objectiveRevision: wireScope.objectiveRevision,
    workItemId: wireScope.workItemId,
    workItemRevision: wireScope.workItemRevision,
    assignmentEpoch: wireScope.assignmentEpoch,
    assignmentAuthorityId: wireScope.assignmentAuthorityId,
    fencingToken: wireScope.fencingToken,
  };
}

export type MeshEvidenceWireSubjectV1 =
  | { readonly kind: "peer"; readonly peerId: string }
  | {
      readonly kind: "peer_capability";
      readonly peerId: string;
      readonly capabilityKey: string;
      readonly capabilityVersion: string;
      readonly capabilityRevision: number;
    };

export type MeshEvidenceClaimWireV1 = Omit<
  EvidenceClaimV1,
  | "schemaVersion"
  | "claimId"
  | "claimRelationDigest"
  | "rootBasisDigest"
  | "sourceId"
  | "sourceKind"
  | "causationId"
  | "subject"
  | "scope"
  | "assertionDigest"
> & {
  readonly subject: MeshEvidenceWireSubjectV1;
  readonly scope: MeshEvidenceWireScopeV1;
};
export type MeshEvidenceAttestationWireV1 = Omit<
  EvidenceAttestationV1,
  | "schemaVersion"
  | "attestationId"
  | "attestationRelationDigest"
  | "sourceId"
  | "sourceKind"
  | "causationId"
  | "scope"
> & { readonly scope: MeshEvidenceWireScopeV1 };
export type MeshEvidenceChallengeWireV1 = Omit<
  EvidenceChallengeV1,
  | "schemaVersion"
  | "challengeId"
  | "challengeRelationDigest"
  | "sourceId"
  | "sourceKind"
  | "causationId"
  | "scope"
> & { readonly scope: MeshEvidenceWireScopeV1 };
export type MeshEvidenceRetractionWireV1 = Omit<
  EvidenceRetractionV1,
  | "schemaVersion"
  | "retractionId"
  | "retractionRelationDigest"
  | "sourceId"
  | "sourceKind"
  | "causationId"
  | "scope"
> & { readonly scope: MeshEvidenceWireScopeV1 };
export type MeshTrustObservationWireV1 = Omit<
  TrustObservationV1,
  | "schemaVersion"
  | "observationId"
  | "observerId"
  | "observerKind"
  | "causationId"
  | "subject"
  | "scope"
> & {
  readonly subject: MeshEvidenceWireSubjectV1;
  readonly scope: MeshEvidenceWireScopeV1;
};

function normalizeMeshEvidenceSubjectV1(
  subject: MeshEvidenceWireSubjectV1,
): TrustSubjectV1 {
  return validateTrustSubjectV1({ schemaVersion: 1, ...subject });
}

export function normalizeMeshEvidenceClaimV1(
  envelope: MeshEvidenceEnvelopeMaterialV1,
  wire: MeshEvidenceClaimWireV1,
): EvidenceClaimV1 {
  return createEvidenceClaimV1({
    ...wire,
    schemaVersion: 1,
    sourceId: envelope.senderPeerId,
    sourceKind: "peer",
    causationId: envelope.causationId,
    subject: normalizeMeshEvidenceSubjectV1(wire.subject),
    scope: normalizeMeshEvidenceScopeV1(envelope, wire.scope),
  });
}
export function normalizeMeshEvidenceAttestationV1(
  envelope: MeshEvidenceEnvelopeMaterialV1,
  wire: MeshEvidenceAttestationWireV1,
): EvidenceAttestationV1 {
  return createEvidenceAttestationV1({
    ...wire,
    schemaVersion: 1,
    sourceId: envelope.senderPeerId,
    sourceKind: "peer",
    causationId: envelope.causationId,
    scope: normalizeMeshEvidenceScopeV1(envelope, wire.scope),
  });
}
export function normalizeMeshEvidenceChallengeV1(
  envelope: MeshEvidenceEnvelopeMaterialV1,
  wire: MeshEvidenceChallengeWireV1,
): EvidenceChallengeV1 {
  return createEvidenceChallengeV1({
    ...wire,
    schemaVersion: 1,
    sourceId: envelope.senderPeerId,
    sourceKind: "peer",
    causationId: envelope.causationId,
    scope: normalizeMeshEvidenceScopeV1(envelope, wire.scope),
  });
}
export function normalizeMeshEvidenceRetractionV1(
  envelope: MeshEvidenceEnvelopeMaterialV1,
  wire: MeshEvidenceRetractionWireV1,
): EvidenceRetractionV1 {
  return createEvidenceRetractionV1({
    ...wire,
    schemaVersion: 1,
    sourceId: envelope.senderPeerId,
    sourceKind: "peer",
    causationId: envelope.causationId,
    scope: normalizeMeshEvidenceScopeV1(envelope, wire.scope),
  });
}

/** Normalizes a signed redacted projection; callers must never feed it to Fusion. */
export function normalizeMeshTrustObservationV1(
  envelope: MeshEvidenceEnvelopeMaterialV1,
  wire: MeshTrustObservationWireV1,
): TrustObservationV1 {
  return createTrustObservationV1({
    ...wire,
    schemaVersion: 1,
    observerId: envelope.senderPeerId,
    observerKind: "peer",
    causationId: envelope.causationId,
    subject: normalizeMeshEvidenceSubjectV1(wire.subject),
    scope: normalizeMeshEvidenceScopeV1(envelope, wire.scope),
  });
}
