import assert from "node:assert/strict";
import test from "node:test";
import {
  EVIDENCE_TRUST_LIMITS_V1,
  createEvidenceFusionPolicyV1,
  createEvidenceTrustStateV1,
  createTrustEligibilityRequestV1,
  digestEvidenceFusionPolicyV1,
  digestScopeV1,
  digestSubjectV1,
  digestTrustEligibilityRequestV1,
  evaluateEvidenceFusionV1,
  evaluateTrustEligibilityV1,
  reduceEvidenceTrustStateV1,
  validateTrustEligibilityDecisionV1,
} from "../packages/trust/dist/index.js";

const subject = { schemaVersion: 1, kind: "peer", peerId: "peer-a" };
const scope = {
  schemaVersion: 1,
  kind: "standalone",
  tenantId: "tenant-a",
  namespace: "eligibility",
  scopeId: "scope-a",
};

function policy({
  policyVersion = 1,
  parentPolicyDigest = null,
  minimumScoreBasisPoints = 4000,
  maximumUncertaintyBasisPoints = 10000,
  maximumProfileAgeMs = 100,
} = {}) {
  return createEvidenceFusionPolicyV1({
    schemaVersion: 1,
    policyId: "eligibility-policy",
    policyVersion,
    parentPolicyDigest,
    mode: "restrict",
    dimensions: [
      {
        dimensionId: "integrity",
        priorScoreBasisPoints: 5000,
        priorWeightBasisPoints: 1,
        minimumUncertaintyBasisPoints: 0,
        coverageTargetBasisPoints: 1,
        decayIntervalMs: 1,
        decayBasisPointsPerInterval: 1,
        uncertaintyGrowthBasisPointsPerInterval: 1,
        minimumRetainedWeightBasisPoints: 1,
        contradictionUncertaintyBasisPointsPerClaim: 1,
        maximumContradictionUncertaintyBasisPoints: 1000,
        degradedScoreAtOrBelowBasisPoints: 2000,
        degradedUncertaintyAtOrAboveBasisPoints: 8000,
      },
    ],
    criteria: [
      {
        criterionId: "criterion-a",
        dimensionId: "integrity",
        satisfiedValueBasisPoints: 10000,
        violatedValueBasisPoints: 0,
        inconclusiveValueBasisPoints: null,
        baseWeightBasisPoints: 1000,
        maximumClaimWeightBasisPoints: 1000,
        maximumSourceGroupContributionWeightBasisPoints: 1000,
        minimumSupportGroups: 1,
        minimumSupportWeightBasisPoints: 1,
        minimumContradictionGroups: 1,
        minimumContradictionWeightBasisPoints: 1,
        allowClaimSourceAttestation: false,
        contentRequired: false,
        quarantineEligible: false,
        recoveryEligible: false,
        maximumAgeMs: 1000,
        claimAuthority: {
          allowedSourceRelations: ["subject_self"],
          allowedBasisReferences: [
            {
              kind: "external",
              referenceType: "root",
              minimumCount: 1,
              maximumCount: 1,
            },
          ],
        },
        challengeAuthority: {
          allowedSourceRelations: ["target_author"],
          allowedBasisReferences: [
            {
              kind: "external",
              referenceType: "root",
              minimumCount: 1,
              maximumCount: 1,
            },
          ],
          requireResolvedBasis: true,
        },
        challengeResolution: {
          minimumCorroboratingGroups: 1,
          minimumCorroboratingWeightBasisPoints: 1,
          minimumOpposingGroups: 1,
          minimumOpposingWeightBasisPoints: 1,
        },
      },
    ],
    sourceBindings: [
      {
        sourceId: "peer-a",
        sourceKind: "peer",
        dependencyGroupId: "group-a",
        roles: ["challenge", "claim"],
        maximumWeightBasisPoints: 1000,
        validFromLogicalMs: 0,
        validUntilLogicalMs: 1000,
      },
    ],
    dependencyGroups: [
      {
        dependencyGroupId: "group-a",
        maximumAttestationWeightPerClaimBasisPoints: 1000,
        maximumProfileWeightPerDimensionCriterionBasisPoints: 1000,
      },
    ],
    eligibilityRules: [
      {
        ruleId: "delegate",
        maximumProfileAgeMs,
        requirements: [
          {
            dimensionId: "integrity",
            minimumScoreBasisPoints,
            maximumUncertaintyBasisPoints,
          },
        ],
      },
    ],
    quarantinePolicy: { enabled: false, rules: [], maximumActiveRecords: 1 },
    recoveryPolicy: { rules: [] },
    limits: EVIDENCE_TRUST_LIMITS_V1,
    diagnosticsPolicyId: "diag",
    redactionPolicyId: "redact",
  });
}

function profileState(configured = policy(), stateId = "eligibility-state") {
  const policyDigest = digestEvidenceFusionPolicyV1(configured);
  const fusionRequest = {
    tenantId: scope.tenantId,
    subject,
    scope,
    policyId: configured.policyId,
    policyVersion: configured.policyVersion,
    policyDigest,
    dependencyBindingDigests: [],
  };
  let state = reduceEvidenceTrustStateV1(
    createEvidenceTrustStateV1({ stateId }),
    {
      schemaVersion: 1,
      kind: "policy_registered",
      policy: configured,
      logicalTimeMs: 0,
    },
  ).state;
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "fusion_evaluated",
    request: fusionRequest,
    logicalTimeMs: 0,
  }).state;
  const fusionDecision = state.fusionDecisions[0];
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "profile_evaluated",
    fusionDecisionId: fusionDecision.fusionDecisionId,
    fusionDecisionDigest: fusionDecision.fusionDecisionDigest,
    logicalTimeMs: 0,
  }).state;
  return { state, configured, fusionRequest, profile: state.profiles[0] };
}

function requestFor(fixture, overrides = {}) {
  const rule = fixture.configured.eligibilityRules[0];
  const requestedSubject = overrides.subject ?? fixture.profile.subject;
  const requestedScope = overrides.scope ?? fixture.profile.scope;
  return createTrustEligibilityRequestV1({
    schemaVersion: 1,
    tenantId: overrides.tenantId ?? fixture.profile.tenantId,
    subject: requestedSubject,
    subjectDigest: digestSubjectV1(requestedSubject),
    scope: requestedScope,
    scopeDigest: digestScopeV1(requestedScope),
    policyId: overrides.policyId ?? fixture.profile.policyId,
    policyVersion: overrides.policyVersion ?? fixture.profile.policyVersion,
    policyDigest: overrides.policyDigest ?? fixture.profile.policyDigest,
    profileId: overrides.profileId ?? fixture.profile.profileId,
    profileDigest: overrides.profileDigest ?? fixture.profile.profileDigest,
    maximumProfileAgeMs:
      overrides.maximumProfileAgeMs ?? rule.maximumProfileAgeMs,
    requirements: overrides.requirements ?? rule.requirements,
  });
}

test("eligibility contracts are closed, exact, immutable, and content-bound", () => {
  const fixture = profileState();
  const request = requestFor(fixture);
  assert.equal(digestTrustEligibilityRequestV1(request).length, 64);
  assert(Object.isFrozen(request));
  assert.throws(() =>
    createTrustEligibilityRequestV1({ ...request, unexpected: true }),
  );
  assert.throws(() =>
    createTrustEligibilityRequestV1({
      ...request,
      profileId: "profile:wrong",
    }),
  );
  assert.throws(() =>
    evaluateTrustEligibilityV1(
      fixture.state,
      createTrustEligibilityRequestV1({
        ...request,
        maximumProfileAgeMs: request.maximumProfileAgeMs + 1,
      }),
      0,
    ),
  );
  const decision = evaluateTrustEligibilityV1(fixture.state, request, 0);
  assert.equal(decision.disposition, "eligible");
  assert.deepEqual(decision.reasonCodes, []);
  assert(Object.isFrozen(decision));
  assert.deepEqual(
    evaluateTrustEligibilityV1(fixture.state, request, 0),
    decision,
  );
  assert.throws(() =>
    validateTrustEligibilityDecisionV1({
      ...decision,
      reasonCodes: ["not-a-reason"],
    }),
  );
  assert.throws(() =>
    validateTrustEligibilityDecisionV1({
      ...decision,
      eligibilityDecisionId: "eligibility-decision:wrong",
    }),
  );
});

test("score failure is restricted while excessive uncertainty is unavailable", () => {
  const restricted = profileState(
    policy({ minimumScoreBasisPoints: 6000 }),
    "eligibility-restricted",
  );
  const restrictedDecision = evaluateTrustEligibilityV1(
    restricted.state,
    requestFor(restricted),
    0,
  );
  assert.equal(restrictedDecision.disposition, "restricted");
  assert.deepEqual(restrictedDecision.reasonCodes, ["eligibility_restricted"]);
  assert.equal(restrictedDecision.requirementResults[0].met, false);

  const uncertain = profileState(
    policy({ maximumUncertaintyBasisPoints: 9999 }),
    "eligibility-uncertain",
  );
  const unavailableDecision = evaluateTrustEligibilityV1(
    uncertain.state,
    requestFor(uncertain),
    0,
  );
  assert.equal(unavailableDecision.disposition, "unavailable");
  assert.deepEqual(unavailableDecision.reasonCodes, ["profile_unavailable"]);
  assert.equal(
    unavailableDecision.requirementResults[0].observedUncertaintyBasisPoints,
    10000,
  );
});

test("stale, mismatched, and historical profiles never become eligible", () => {
  const fixture = profileState();
  const request = requestFor(fixture);
  const stale = evaluateTrustEligibilityV1(fixture.state, request, 101);
  assert.equal(stale.disposition, "unavailable");
  assert.deepEqual(stale.reasonCodes, ["profile_stale"]);
  assert.throws(() => evaluateTrustEligibilityV1(fixture.state, request, -1));

  const otherSubject = {
    schemaVersion: 1,
    kind: "peer",
    peerId: "peer-b",
  };
  const crossSubject = evaluateTrustEligibilityV1(
    fixture.state,
    requestFor(fixture, { subject: otherSubject }),
    0,
  );
  assert.equal(crossSubject.disposition, "unavailable");
  assert.deepEqual(crossSubject.reasonCodes, ["profile_unavailable"]);

  let state = reduceEvidenceTrustStateV1(fixture.state, {
    schemaVersion: 1,
    kind: "fusion_evaluated",
    request: fixture.fusionRequest,
    logicalTimeMs: 0,
  }).state;
  const nextFusion = state.fusionDecisions.find(
    (candidate) =>
      candidate.previousProfileDigest === fixture.profile.profileDigest,
  );
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "profile_evaluated",
    fusionDecisionId: nextFusion.fusionDecisionId,
    fusionDecisionDigest: nextFusion.fusionDecisionDigest,
    logicalTimeMs: 0,
  }).state;
  const historical = evaluateTrustEligibilityV1(state, request, 0);
  assert.equal(historical.disposition, "unavailable");
  assert.deepEqual(historical.reasonCodes, ["profile_unavailable"]);
});

test("a rotated policy head makes an exact historical request unavailable", () => {
  const fixture = profileState();
  const request = requestFor(fixture);
  const nextPolicy = policy({
    policyVersion: 2,
    parentPolicyDigest: digestEvidenceFusionPolicyV1(fixture.configured),
  });
  const rotated = reduceEvidenceTrustStateV1(fixture.state, {
    schemaVersion: 1,
    kind: "policy_registered",
    policy: nextPolicy,
    logicalTimeMs: 1,
  }).state;
  const decision = evaluateTrustEligibilityV1(rotated, request, 1);
  assert.equal(decision.disposition, "unavailable");
  assert.deepEqual(decision.reasonCodes, ["policy_mismatch"]);
  assert.equal(decision.profileDigest, fixture.profile.profileDigest);
  assert.throws(() =>
    evaluateEvidenceFusionV1(rotated, fixture.fusionRequest, 1),
  );
  assert.throws(() =>
    reduceEvidenceTrustStateV1(rotated, {
      schemaVersion: 1,
      kind: "fusion_evaluated",
      request: fixture.fusionRequest,
      logicalTimeMs: 1,
    }),
  );
  assert.doesNotThrow(() =>
    reduceEvidenceTrustStateV1(rotated, {
      schemaVersion: 1,
      kind: "advance_logical_time",
      logicalTimeMs: 2,
    }),
  );
});

test("public Fusion still binds the exact current profile head", () => {
  const fixture = profileState();
  const decision = evaluateEvidenceFusionV1(
    fixture.state,
    fixture.fusionRequest,
    0,
  );
  assert.equal(decision.previousProfileDigest, fixture.profile.profileDigest);
  const pending = reduceEvidenceTrustStateV1(fixture.state, {
    schemaVersion: 1,
    kind: "fusion_evaluated",
    request: fixture.fusionRequest,
    logicalTimeMs: 0,
  }).state;
  assert.equal(
    evaluateTrustEligibilityV1(pending, requestFor(fixture), 0).disposition,
    "unavailable",
  );
});
