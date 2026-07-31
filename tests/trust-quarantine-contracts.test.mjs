import assert from "node:assert/strict";
import test from "node:test";
import {
  createActiveQuarantineRecordV1,
  createQuarantineRecoveryDecisionV1,
  createRecoveredQuarantineRecordV1,
  createReviewRequiredQuarantineRecordV1,
  digestTrustQuarantineEvidenceSetV1,
  digestTrustQuarantineKeyV1,
  digestTrustRecoveryEvidenceSetV1,
  quarantineHeadV1,
  validateQuarantineEvidenceTuplesV1,
  validateQuarantineRecordV1,
  validateQuarantineRecoveryDecisionV1,
} from "../packages/trust/dist/index.js";

const digest = (letter) => letter.repeat(64);
const contentId = (kind, letter) => `${kind}:${digest(letter)}`;
const activationEvidence = [
  {
    kind: "attestation",
    id: contentId("attestation", "a"),
    digest: digest("a"),
  },
  { kind: "claim", id: contentId("claim", "b"), digest: digest("b") },
];
const activeInput = (overrides = {}) => ({
  revision: 1,
  previousRecordId: null,
  tenantId: "tenant-a",
  subjectDigest: digest("c"),
  scopeDigest: digest("d"),
  dimensionId: "integrity",
  policyDigest: digest("e"),
  fusionDecisionId: contentId("fusion-decision", "f"),
  activationEvidence,
  activationDependencyGroupIds: ["group-a"],
  activatedAtLogicalMs: 10,
  reviewIntervalMs: 5,
  ...overrides,
});

test("quarantine keys and evidence sets are exact, ordered, and domain-separated", () => {
  const key = digestTrustQuarantineKeyV1({
    tenantId: "tenant-a",
    subjectDigest: digest("c"),
    scopeDigest: digest("d"),
    dimensionId: "integrity",
    policyDigest: digest("e"),
  });
  assert.notEqual(
    key,
    digestTrustQuarantineKeyV1({
      tenantId: "tenant-a",
      subjectDigest: digest("c"),
      scopeDigest: digest("d"),
      dimensionId: "integrity",
      policyDigest: digest("0"),
    }),
  );
  assert.notEqual(
    digestTrustQuarantineEvidenceSetV1(activationEvidence),
    digestTrustRecoveryEvidenceSetV1(activationEvidence),
  );
  assert.throws(() =>
    validateQuarantineEvidenceTuplesV1([...activationEvidence].reverse()),
  );
  assert.throws(() =>
    validateQuarantineEvidenceTuplesV1([
      { ...activationEvidence[0], digest: digest("9") },
    ]),
  );
  assert.throws(() => digestTrustQuarantineEvidenceSetV1([]));
  assert.doesNotThrow(() => digestTrustRecoveryEvidenceSetV1([]));
});

test("active and review-required revisions are content-bound and monotonic", () => {
  const active = createActiveQuarantineRecordV1(activeInput());
  assert.equal(active.status, "active");
  assert.equal(active.reviewAfterLogicalMs, 15);
  assert.equal(quarantineHeadV1(active).quarantineId, active.quarantineId);
  assert(Object.isFrozen(active));
  assert.throws(() =>
    validateQuarantineRecordV1({ ...active, quarantineKey: digest("0") }),
  );
  assert.throws(() =>
    validateQuarantineRecordV1({
      ...active,
      reasonCodes: ["quarantine_review_required"],
    }),
  );
  assert.throws(() => createReviewRequiredQuarantineRecordV1(active, 14));
  const review = createReviewRequiredQuarantineRecordV1(active, 15);
  assert.equal(review.status, "review_required");
  assert.equal(review.revision, 2);
  assert.equal(review.previousRecordId, active.quarantineId);
  assert.equal(
    review.activationEvidenceSetDigest,
    active.activationEvidenceSetDigest,
  );
  assert.throws(() => createReviewRequiredQuarantineRecordV1(review, 16));
  assert.throws(() =>
    createActiveQuarantineRecordV1(
      activeInput({
        activatedAtLogicalMs: Number.MAX_SAFE_INTEGER,
        reviewIntervalMs: 1,
      }),
    ),
  );
});

test("only an exact recovered decision can append a recovered revision", () => {
  const active = createActiveQuarantineRecordV1(activeInput());
  const review = createReviewRequiredQuarantineRecordV1(active, 15);
  const recoveryEvidence = [
    { kind: "claim", id: contentId("claim", "1"), digest: digest("1") },
  ];
  const decision = createQuarantineRecoveryDecisionV1({
    schemaVersion: 1,
    quarantineId: review.quarantineId,
    quarantineKey: review.quarantineKey,
    policyDigest: review.policyDigest,
    fusionDecisionId: contentId("fusion-decision", "2"),
    evaluatedAtLogicalMs: 16,
    recoveryEvidenceIds: recoveryEvidence.map((item) => item.id),
    recoveryEvidenceSetDigest:
      digestTrustRecoveryEvidenceSetV1(recoveryEvidence),
    recoveryClaimSourceDependencyGroupIds: ["group-b"],
    effectiveRecoveryWeightBasisPoints: 1,
    scoreBasisPoints: 9000,
    uncertaintyBasisPoints: 1,
    disposition: "recovered",
    reasonCodes: ["quarantine_recovered"],
  });
  assert.match(
    decision.recoveryDecisionId,
    /^recovery-decision:[0-9a-f]{64}$/u,
  );
  assert(Object.isFrozen(decision));
  const recovered = createRecoveredQuarantineRecordV1(review, decision);
  assert.equal(recovered.status, "recovered");
  assert.equal(recovered.revision, 3);
  assert.equal(recovered.previousRecordId, review.quarantineId);
  assert.equal(recovered.recoveryDecisionId, decision.recoveryDecisionId);
  assert.equal(recovered.fusionDecisionId, decision.fusionDecisionId);
  assert.throws(() => createRecoveredQuarantineRecordV1(active, decision));
  assert.throws(() =>
    validateQuarantineRecoveryDecisionV1({
      ...decision,
      disposition: "insufficient",
    }),
  );

  const reactivated = createActiveQuarantineRecordV1(
    activeInput({
      revision: 4,
      previousRecordId: recovered.quarantineId,
      fusionDecisionId: contentId("fusion-decision", "3"),
      activationEvidence: [
        {
          kind: "claim",
          id: contentId("claim", "4"),
          digest: digest("4"),
        },
      ],
      activationDependencyGroupIds: ["group-c"],
      activatedAtLogicalMs: 20,
    }),
  );
  assert.equal(reactivated.revision, 4);
  assert.equal(reactivated.previousRecordId, recovered.quarantineId);
});

test("unavailable recovery decisions are bounded and cannot lift quarantine", () => {
  const active = createActiveQuarantineRecordV1(activeInput());
  const review = createReviewRequiredQuarantineRecordV1(active, 15);
  const unavailable = createQuarantineRecoveryDecisionV1({
    schemaVersion: 1,
    quarantineId: review.quarantineId,
    quarantineKey: review.quarantineKey,
    policyDigest: review.policyDigest,
    fusionDecisionId: review.fusionDecisionId,
    evaluatedAtLogicalMs: 15,
    recoveryEvidenceIds: [],
    recoveryEvidenceSetDigest: digestTrustRecoveryEvidenceSetV1([]),
    recoveryClaimSourceDependencyGroupIds: [],
    effectiveRecoveryWeightBasisPoints: 0,
    scoreBasisPoints: 0,
    uncertaintyBasisPoints: 10000,
    disposition: "unavailable",
    reasonCodes: ["quarantine_recovery_unavailable"],
  });
  assert.equal(unavailable.disposition, "unavailable");
  assert.throws(() => createRecoveredQuarantineRecordV1(review, unavailable));
});
