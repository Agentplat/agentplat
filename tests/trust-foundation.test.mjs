import assert from "node:assert/strict";
import test from "node:test";

import {
  EVIDENCE_TRUST_LIMITS_V1,
  canonicalizeTrustJsonV1,
  createEvidenceAttestationV1,
  createEvidenceChallengeV1,
  createEvidenceClaimV1,
  createEvidenceRetractionV1,
  createEvidenceTrustSnapshotV1,
  createEvidenceTrustStateV1,
  createTrustObservationV1,
  digestTrustJsonV1,
  restoreEvidenceTrustSnapshotV1,
  sha256TrustBytesV1,
  validateEvidenceReferenceV1,
  validateEvidenceScopeV1,
} from "../packages/trust/dist/index.js";
import {
  normalizeMeshEvidenceClaimV1,
  normalizeMeshEvidenceAttestationV1,
  normalizeMeshEvidenceChallengeV1,
  normalizeMeshEvidenceRetractionV1,
  normalizeMeshTrustObservationV1,
} from "../packages/trust/dist/mesh-records.js";

const digest = (character) => character.repeat(64);
const scope = {
  schemaVersion: 1,
  kind: "standalone",
  tenantId: "tenant-a",
  namespace: "test",
  scopeId: "scope-a",
};
const subject = { schemaVersion: 1, kind: "peer", peerId: "peer-a" };

test("Trust canonical JSON and SHA-256 are deterministic and browser-safe", () => {
  assert.equal(
    canonicalizeTrustJsonV1({ z: 1, a: ["x", null] }),
    '{"a":["x",null],"z":1}',
  );
  assert.equal(
    sha256TrustBytesV1(new TextEncoder().encode("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(
    sha256TrustBytesV1(new Uint8Array()),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  assert.equal(
    sha256TrustBytesV1(new TextEncoder().encode("a".repeat(1_000))),
    "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3",
  );
  assert.equal(
    digestTrustJsonV1("scope", scope),
    digestTrustJsonV1("scope", { ...scope }),
  );
  assert.throws(
    () => canonicalizeTrustJsonV1({ invalid: undefined }),
    /non-JSON/u,
  );
  assert.throws(
    () => canonicalizeTrustJsonV1(Object.assign([], { 2: "sparse" })),
    /sparse/u,
  );
  const hidden = { visible: true };
  Object.defineProperty(hidden, "hidden", { value: true, enumerable: false });
  assert.throws(() => canonicalizeTrustJsonV1(hidden), /enumerable/u);
  const arrayWithExtra = ["value"];
  arrayWithExtra.extra = "smuggled";
  assert.throws(() => canonicalizeTrustJsonV1(arrayWithExtra), /extra/u);
  assert.throws(
    () => canonicalizeTrustJsonV1({ [Symbol("smuggled")]: true }),
    /symbol/u,
  );
});

test("Trust validates exact scopes, typed references and one-over limits", () => {
  assert.deepEqual(validateEvidenceScopeV1(scope), scope);
  assert.throws(
    () => validateEvidenceScopeV1({ ...scope, unexpected: true }),
    /invalid shape/u,
  );
  assert.deepEqual(
    validateEvidenceReferenceV1({
      schemaVersion: 1,
      kind: "external",
      referenceType: "document",
      referenceId: "doc-a",
      referenceDigest: digest("b"),
    }),
    {
      schemaVersion: 1,
      kind: "external",
      referenceType: "document",
      referenceId: "doc-a",
      referenceDigest: digest("b"),
    },
  );
  assert.throws(
    () =>
      validateEvidenceReferenceV1({
        schemaVersion: 1,
        kind: "mesh_record",
        referenceType: "work.result",
        referenceId: "message-a",
        referenceDigest: digest("b"),
      }),
    /digest/u,
  );
  assert.throws(
    () =>
      createEvidenceTrustStateV1({
        stateId: "state-a",
        limits: {
          ...EVIDENCE_TRUST_LIMITS_V1,
          maximumClaims: EVIDENCE_TRUST_LIMITS_V1.maximumClaims + 1,
        },
      }),
    /ceiling/u,
  );
});

test("Trust derives content-bound claim IDs and pure Mesh normalizers preserve causation", () => {
  const claim = createEvidenceClaimV1({
    schemaVersion: 1,
    sourceId: "source-a",
    sourceKind: "local",
    causationId: null,
    subject,
    scope,
    criterionId: "criterion-a",
    outcome: "satisfied",
    content: null,
    basisReferences: [
      {
        schemaVersion: 1,
        kind: "external",
        referenceType: "document",
        referenceId: "doc-a",
        referenceDigest: digest("c"),
      },
    ],
    observedAt: null,
  });
  assert.match(claim.claimId, /^claim:[0-9a-f]{64}$/u);
  const envelope = {
    schemaVersion: 1,
    tenantId: "tenant-a",
    meshId: "mesh-a",
    objectiveId: null,
    senderPeerId: "peer-a",
    causationId: "message-a",
  };
  const meshBasis = [
    {
      schemaVersion: 1,
      kind: "external",
      referenceType: "document",
      referenceId: "doc-a",
      referenceDigest: digest("d"),
    },
  ];
  const expectedMeshClaim = createEvidenceClaimV1({
    schemaVersion: 1,
    sourceId: "peer-a",
    sourceKind: "peer",
    causationId: "message-a",
    subject,
    scope: {
      schemaVersion: 1,
      kind: "mesh",
      tenantId: "tenant-a",
      meshId: "mesh-a",
    },
    criterionId: "criterion-a",
    outcome: "satisfied",
    content: null,
    basisReferences: meshBasis,
    observedAt: null,
  });
  const normalized = normalizeMeshEvidenceClaimV1(envelope, {
    subject: { kind: "peer", peerId: "peer-a" },
    scope: { kind: "mesh" },
    criterionId: "criterion-a",
    outcome: "satisfied",
    content: null,
    basisReferences: meshBasis,
    observedAt: null,
  });
  assert.equal(normalized.sourceId, "peer-a");
  assert.equal(normalized.causationId, "message-a");
  assert.equal(normalized.scope.kind, "mesh");
  assert.deepEqual(normalized, expectedMeshClaim);

  const claimDigest = expectedMeshClaim.claimId.slice("claim:".length);
  const expectedAttestation = createEvidenceAttestationV1({
    schemaVersion: 1,
    sourceId: "peer-a",
    sourceKind: "peer",
    causationId: "message-a",
    scope: expectedMeshClaim.scope,
    claimId: expectedMeshClaim.claimId,
    claimDigest,
    disposition: "support",
    confidenceBasisPoints: 10_000,
    basisReferences: [],
    observedAt: null,
  });
  assert.deepEqual(
    normalizeMeshEvidenceAttestationV1(envelope, {
      scope: { kind: "mesh" },
      claimId: expectedMeshClaim.claimId,
      claimDigest,
      disposition: "support",
      confidenceBasisPoints: 10_000,
      basisReferences: [],
      observedAt: null,
    }),
    expectedAttestation,
  );

  const expectedChallenge = createEvidenceChallengeV1({
    schemaVersion: 1,
    sourceId: "peer-a",
    sourceKind: "peer",
    causationId: "message-a",
    scope: expectedMeshClaim.scope,
    targetKind: "claim",
    targetId: expectedMeshClaim.claimId,
    targetDigest: claimDigest,
    reasonCode: "challenge_unresolved",
    basisReferences: meshBasis,
    observedAt: null,
  });
  assert.deepEqual(
    normalizeMeshEvidenceChallengeV1(envelope, {
      scope: { kind: "mesh" },
      targetKind: "claim",
      targetId: expectedMeshClaim.claimId,
      targetDigest: claimDigest,
      reasonCode: "challenge_unresolved",
      basisReferences: meshBasis,
      observedAt: null,
    }),
    expectedChallenge,
  );

  const expectedRetraction = createEvidenceRetractionV1({
    schemaVersion: 1,
    sourceId: "peer-a",
    sourceKind: "peer",
    causationId: "message-a",
    scope: expectedMeshClaim.scope,
    targetKind: "claim",
    targetId: expectedMeshClaim.claimId,
    targetDigest: claimDigest,
    reasonCode: "accepted",
    observedAt: null,
  });
  assert.deepEqual(
    normalizeMeshEvidenceRetractionV1(envelope, {
      scope: { kind: "mesh" },
      targetKind: "claim",
      targetId: expectedMeshClaim.claimId,
      targetDigest: claimDigest,
      reasonCode: "accepted",
      observedAt: null,
    }),
    expectedRetraction,
  );

  const expectedObservation = createTrustObservationV1({
    schemaVersion: 1,
    observerId: "peer-a",
    observerKind: "peer",
    causationId: "message-a",
    subject,
    scope: {
      schemaVersion: 1,
      kind: "mesh",
      tenantId: "tenant-a",
      meshId: "mesh-a",
    },
    policyId: "policy-a",
    policyVersion: 1,
    policyDigest: digest("e"),
    profileDigest: digest("f"),
    fusionDecisionDigest: digest("a"),
    dimensionId: "integrity",
    scoreBand: "high",
    uncertaintyBand: "low",
    disposition: "eligible",
    evidenceIds: [expectedMeshClaim.claimId],
    observedAt: "2026-01-01T00:00:00Z",
    validUntil: "2026-01-01T00:01:00Z",
    reasonCodes: ["accepted"],
  });
  assert.equal(
    normalizeMeshTrustObservationV1(envelope, {
      subject: { kind: "peer", peerId: "peer-a" },
      scope: { kind: "mesh" },
      policyId: "policy-a",
      policyVersion: 1,
      policyDigest: digest("e"),
      profileDigest: digest("f"),
      fusionDecisionDigest: digest("a"),
      dimensionId: "integrity",
      scoreBand: "high",
      uncertaintyBand: "low",
      disposition: "eligible",
      evidenceIds: [expectedMeshClaim.claimId],
      observedAt: "2026-01-01T00:00:00Z",
      validUntil: "2026-01-01T00:01:00Z",
      reasonCodes: ["accepted"],
    }).observationId,
    expectedObservation.observationId,
  );
});

test("Trust snapshots require the matching external protector and rollback anchor", () => {
  const protectorBindingDigest = digest("e");
  const protector = {
    bindingDigest: protectorBindingDigest,
    protect(bytes) {
      return {
        algorithmId: "test",
        keyId: "key-a",
        encoding: "base64url",
        proof: String(bytes.byteLength),
      };
    },
    verify(bytes, proof) {
      return proof.proof === String(bytes.byteLength);
    },
  };
  const state = createEvidenceTrustStateV1({ stateId: "state-a" });
  assert.equal(Object.isFrozen(state), true);
  const snapshot = createEvidenceTrustSnapshotV1({
    state,
    generation: 1,
    previousSnapshotDigest: null,
    createdAtLogicalMs: 0,
    protector,
  });
  const restored = restoreEvidenceTrustSnapshotV1(
    snapshot,
    {
      schemaVersion: 1,
      stateId: "state-a",
      requiredGeneration: 1,
      requiredSnapshotDigest: snapshot.snapshotDigest,
      minimumLogicalHighWaterMs: 0,
      protectorBindingDigest,
    },
    protector,
  );
  assert.equal(restored.stateId, "state-a");
  assert.throws(
    () =>
      restoreEvidenceTrustSnapshotV1(
        snapshot,
        {
          schemaVersion: 1,
          stateId: "state-a",
          requiredGeneration: 2,
          requiredSnapshotDigest: snapshot.snapshotDigest,
          minimumLogicalHighWaterMs: 0,
          protectorBindingDigest,
        },
        protector,
      ),
    /rollback/u,
  );
});
