import type { JsonValue } from "@agentplat/core";
import {
  canonicalTrustJsonBytesV1,
  deepFreeze,
  digestTrustJsonV1,
  TrustValidationError,
} from "./canonical.js";
import type {
  EvidenceTrustLimitsV1,
  EvidenceTrustRollbackAnchorV1,
  EvidenceTrustSnapshotIntegrityProofV1,
  EvidenceTrustSnapshotProtectorV1,
  EvidenceTrustSnapshotV1,
  EvidenceTrustStateV1,
} from "./types.js";
import {
  assertExactKeys,
  assertIdentifier,
  assertSafeInteger,
  assertTrustDigest,
} from "./validation.js";

export const EVIDENCE_TRUST_LIMITS_V1: Readonly<EvidenceTrustLimitsV1> =
  Object.freeze({
    maximumPolicies: 16,
    maximumDimensionsPerPolicy: 16,
    maximumCriteriaPerPolicy: 64,
    maximumSourceBindingsPerPolicy: 256,
    maximumDependencyGroupsPerPolicy: 64,
    maximumClaims: 4096,
    maximumAttestations: 16384,
    maximumChallenges: 4096,
    maximumChallengesPerSourceScope: 64,
    maximumPendingChallengesPerSourceScope: 16,
    maximumRetractions: 4096,
    maximumContentResolutions: 4096,
    maximumContentInvalidations: 4096,
    maximumDependencyBindingVersions: 256,
    maximumPendingRecords: 1024,
    maximumPendingAgeMs: 86_400_000,
    maximumBasisReferencesPerRecord: 32,
    maximumRelationshipDepth: 16,
    maximumConsideredRecordsPerFusion: 1024,
    maximumRetainedFusionDecisions: 4096,
    maximumProfileHeads: 2048,
    maximumProfileRevisionsPerHead: 32,
    maximumQuarantineHeads: 2048,
    maximumDiagnostics: 1024,
    maximumRecordCanonicalBytes: 65_536,
    maximumContentReferenceBytes: 4096,
    maximumInlineSummaryBytes: 4096,
    maximumStateCanonicalBytes: 67_108_864,
    maximumEvidenceAgeMs: 2_592_000_000,
    maximumReviewIntervalMs: 604_800_000,
  });
const limitKeys = Object.keys(
  EVIDENCE_TRUST_LIMITS_V1,
) as (keyof EvidenceTrustLimitsV1)[];
export function validateEvidenceTrustLimitsV1(
  value: unknown,
): EvidenceTrustLimitsV1 {
  assertExactKeys(value, limitKeys, "limits");
  const limits = value as Record<string, unknown>;
  for (const key of limitKeys) {
    assertSafeInteger(limits[key], key, 1);
    if ((limits[key] as number) > EVIDENCE_TRUST_LIMITS_V1[key])
      throw new TrustValidationError(`${key} exceeds V1 ceiling`);
  }
  return deepFreeze(
    structuredClone(limits) as unknown as EvidenceTrustLimitsV1,
  );
}
const stateKeys = [
  "schemaVersion",
  "stateId",
  "limits",
  "logicalTimeHighWaterMs",
  "policies",
  "policyHeads",
  "sourceBindings",
  "dependencyBindings",
  "records",
  "contentResolutions",
  "contentInvalidations",
  "pendingRecords",
  "fusionDecisions",
  "profiles",
  "quarantines",
  "diagnostics",
  "traceDigest",
  "encodedBytes",
] as const;
export function createEvidenceTrustStateV1(input: {
  readonly stateId: string;
  readonly limits?: EvidenceTrustLimitsV1;
}): EvidenceTrustStateV1 {
  assertIdentifier(input.stateId, "stateId");
  const limits = validateEvidenceTrustLimitsV1(
    input.limits ?? EVIDENCE_TRUST_LIMITS_V1,
  );
  const state = {
    schemaVersion: 1 as const,
    stateId: input.stateId,
    limits,
    logicalTimeHighWaterMs: 0,
    policies: [],
    policyHeads: [],
    sourceBindings: [],
    dependencyBindings: [],
    records: [],
    contentResolutions: [],
    contentInvalidations: [],
    pendingRecords: [],
    fusionDecisions: [],
    profiles: [],
    quarantines: [],
    diagnostics: [],
    traceDigest: digestTrustJsonV1("trace", []),
    encodedBytes: 0,
  };
  return validateEvidenceTrustStateV1(state);
}
export function validateEvidenceTrustStateV1(
  value: unknown,
): EvidenceTrustStateV1 {
  assertExactKeys(value, stateKeys, "state");
  const state = value as Record<string, unknown>;
  if (state.schemaVersion !== 1)
    throw new TrustValidationError("state schema is invalid");
  assertIdentifier(state.stateId, "stateId");
  const limits = validateEvidenceTrustLimitsV1(state.limits);
  assertSafeInteger(state.logicalTimeHighWaterMs, "logicalTimeHighWaterMs");
  assertTrustDigest(state.traceDigest, "traceDigest");
  assertSafeInteger(state.encodedBytes, "encodedBytes");
  for (const key of [
    "policies",
    "policyHeads",
    "sourceBindings",
    "dependencyBindings",
    "records",
    "contentResolutions",
    "contentInvalidations",
    "pendingRecords",
    "fusionDecisions",
    "profiles",
    "quarantines",
    "diagnostics",
  ] as const) {
    if (!Array.isArray(state[key]) || state[key].length !== 0)
      throw new TrustValidationError(
        `${key} is unavailable before its increment`,
      );
  }
  const cloned = structuredClone({ ...state, limits }) as EvidenceTrustStateV1;
  const bytes = canonicalTrustJsonBytesV1(cloned as unknown as JsonValue, {
    maximumBytes: limits.maximumStateCanonicalBytes,
    maximumDepth: 64,
    maximumNodes: 100_000,
    maximumKeysPerObject: 256,
    maximumItemsPerArray: 100_000,
  });
  if (bytes.byteLength !== cloned.encodedBytes && cloned.encodedBytes !== 0)
    throw new TrustValidationError("encodedBytes does not match state");
  return deepFreeze(cloned);
}
function snapshotMaterial(
  snapshot: Pick<
    EvidenceTrustSnapshotV1,
    | "stateId"
    | "generation"
    | "previousSnapshotDigest"
    | "createdAtLogicalMs"
    | "snapshotDigest"
    | "stateDigest"
  >,
): Uint8Array {
  return canonicalTrustJsonBytesV1({
    stateId: snapshot.stateId,
    generation: snapshot.generation,
    previousSnapshotDigest: snapshot.previousSnapshotDigest,
    createdAtLogicalMs: snapshot.createdAtLogicalMs,
    snapshotDigest: snapshot.snapshotDigest,
    stateDigest: snapshot.stateDigest,
  });
}
export function createEvidenceTrustSnapshotV1(input: {
  readonly state: EvidenceTrustStateV1;
  readonly generation: number;
  readonly previousSnapshotDigest: string | null;
  readonly createdAtLogicalMs: number;
  readonly protector: EvidenceTrustSnapshotProtectorV1;
}): EvidenceTrustSnapshotV1 {
  const state = validateEvidenceTrustStateV1(input.state);
  assertSafeInteger(input.generation, "generation", 1);
  assertSafeInteger(input.createdAtLogicalMs, "createdAtLogicalMs");
  if (input.previousSnapshotDigest !== null)
    assertTrustDigest(input.previousSnapshotDigest, "previousSnapshotDigest");
  assertTrustDigest(input.protector.bindingDigest, "protector.bindingDigest");
  const stateDigest = digestTrustJsonV1("state", state as unknown as JsonValue);
  const unsigned = {
    schemaVersion: 1 as const,
    stateId: state.stateId,
    generation: input.generation,
    previousSnapshotDigest: input.previousSnapshotDigest,
    createdAtLogicalMs: input.createdAtLogicalMs,
    stateDigest,
    state,
  };
  const snapshotDigest = digestTrustJsonV1(
    "snapshot",
    unsigned as unknown as JsonValue,
  );
  const proof = input.protector.protect(
    snapshotMaterial({ ...unsigned, snapshotDigest }),
  );
  return validateEvidenceTrustSnapshotV1({
    ...unsigned,
    snapshotId: `snapshot:${snapshotDigest}`,
    snapshotDigest,
    integrityProof: {
      protectorBindingDigest: input.protector.bindingDigest,
      ...proof,
    },
  });
}
export function validateEvidenceTrustSnapshotV1(
  value: unknown,
): EvidenceTrustSnapshotV1 {
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "snapshotId",
      "snapshotDigest",
      "stateId",
      "generation",
      "previousSnapshotDigest",
      "createdAtLogicalMs",
      "stateDigest",
      "state",
      "integrityProof",
    ],
    "snapshot",
  );
  const snapshot = value as Record<string, unknown>;
  if (snapshot.schemaVersion !== 1)
    throw new TrustValidationError("snapshot schema is invalid");
  assertIdentifier(snapshot.stateId, "stateId");
  assertSafeInteger(snapshot.generation, "generation", 1);
  assertSafeInteger(snapshot.createdAtLogicalMs, "createdAtLogicalMs");
  if (snapshot.previousSnapshotDigest !== null)
    assertTrustDigest(
      snapshot.previousSnapshotDigest,
      "previousSnapshotDigest",
    );
  assertTrustDigest(snapshot.snapshotDigest, "snapshotDigest");
  assertTrustDigest(snapshot.stateDigest, "stateDigest");
  const state = validateEvidenceTrustStateV1(snapshot.state);
  if (
    state.stateId !== snapshot.stateId ||
    digestTrustJsonV1("state", state as unknown as JsonValue) !==
      snapshot.stateDigest
  )
    throw new TrustValidationError("snapshot state digest is invalid");
  const unsigned = {
    schemaVersion: 1,
    stateId: snapshot.stateId,
    generation: snapshot.generation,
    previousSnapshotDigest: snapshot.previousSnapshotDigest,
    createdAtLogicalMs: snapshot.createdAtLogicalMs,
    stateDigest: snapshot.stateDigest,
    state,
  };
  const expected = digestTrustJsonV1(
    "snapshot",
    unsigned as unknown as JsonValue,
  );
  if (
    snapshot.snapshotId !== `snapshot:${expected}` ||
    snapshot.snapshotDigest !== expected
  )
    throw new TrustValidationError("snapshot digest is invalid");
  assertExactKeys(
    snapshot.integrityProof,
    ["protectorBindingDigest", "algorithmId", "keyId", "encoding", "proof"],
    "integrityProof",
  );
  const proof = snapshot.integrityProof as Record<string, unknown>;
  assertTrustDigest(proof.protectorBindingDigest, "protectorBindingDigest");
  for (const key of ["algorithmId", "keyId", "proof"] as const)
    assertIdentifier(proof[key], key);
  if (proof.encoding !== "base64url")
    throw new TrustValidationError("integrity proof encoding is invalid");
  return deepFreeze({
    ...snapshot,
    state,
    integrityProof: proof,
  } as unknown as EvidenceTrustSnapshotV1);
}
export function restoreEvidenceTrustSnapshotV1(
  snapshotValue: unknown,
  anchor: EvidenceTrustRollbackAnchorV1,
  protector: EvidenceTrustSnapshotProtectorV1,
): EvidenceTrustStateV1 {
  const snapshot = validateEvidenceTrustSnapshotV1(snapshotValue);
  assertExactKeys(
    anchor,
    [
      "schemaVersion",
      "stateId",
      "requiredGeneration",
      "requiredSnapshotDigest",
      "minimumLogicalHighWaterMs",
      "protectorBindingDigest",
    ],
    "rollback anchor",
  );
  if (anchor.schemaVersion !== 1)
    throw new TrustValidationError("rollback anchor schema is invalid");
  assertIdentifier(anchor.stateId, "anchor stateId");
  assertSafeInteger(anchor.requiredGeneration, "requiredGeneration", 1);
  assertTrustDigest(anchor.requiredSnapshotDigest, "requiredSnapshotDigest");
  assertSafeInteger(
    anchor.minimumLogicalHighWaterMs,
    "minimumLogicalHighWaterMs",
  );
  assertTrustDigest(anchor.protectorBindingDigest, "protectorBindingDigest");
  if (
    snapshot.stateId !== anchor.stateId ||
    snapshot.generation !== anchor.requiredGeneration ||
    snapshot.snapshotDigest !== anchor.requiredSnapshotDigest ||
    snapshot.integrityProof.protectorBindingDigest !==
      anchor.protectorBindingDigest ||
    protector.bindingDigest !== anchor.protectorBindingDigest ||
    snapshot.state.logicalTimeHighWaterMs < anchor.minimumLogicalHighWaterMs
  )
    throw new TrustValidationError("snapshot rollback validation failed");
  if (!protector.verify(snapshotMaterial(snapshot), snapshot.integrityProof))
    throw new TrustValidationError("snapshot integrity validation failed");
  return snapshot.state;
}
