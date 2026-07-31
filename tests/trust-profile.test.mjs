import assert from "node:assert/strict";
import test from "node:test";
import {
  createTrustProfileV1,
  deriveTrustProfileStatusV1,
  digestTrustProfileV1,
  digestTrustProfileKeyV1,
  trustProfileHeadV1,
  validateTrustProfileV1,
} from "../packages/trust/dist/profile.js";
import {
  EVIDENCE_TRUST_LIMITS_V1,
  createEvidenceFusionPolicyV1,
  createEvidenceTrustStateV1,
  digestEvidenceFusionPolicyV1,
  evaluateEvidenceFusionV1,
  reduceEvidenceTrustStateV1,
} from "../packages/trust/dist/index.js";

const digest = (value) => value.repeat(64);
const subject = { schemaVersion: 1, kind: "peer", peerId: "peer-a" };
const scope = {
  schemaVersion: 1,
  kind: "standalone",
  tenantId: "tenant-a",
  namespace: "profile",
  scopeId: "scope-a",
};
const dimension = (overrides = {}) => ({
  dimensionId: "integrity",
  scoreBasisPoints: 6000,
  uncertaintyBasisPoints: 100,
  effectiveWeightBasisPoints: 100,
  coverageBasisPoints: 100,
  ageUncertaintyBasisPoints: 0,
  contradictionPressureBasisPoints: 0,
  includedClaimIds: [],
  excludedClaimIds: [],
  claimSourceDependencyGroupIds: [],
  latestQualifyingEffectiveAtLogicalMs: 1,
  ...overrides,
});
const policy = {
  dimensions: [
    {
      dimensionId: "integrity",
      degradedScoreAtOrBelowBasisPoints: 2000,
      degradedUncertaintyAtOrAboveBasisPoints: 8000,
    },
  ],
};
const realPolicy = () =>
  createEvidenceFusionPolicyV1({
    schemaVersion: 1,
    policyId: "profile-policy",
    policyVersion: 1,
    parentPolicyDigest: null,
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
        maximumProfileAgeMs: 100,
        requirements: [
          {
            dimensionId: "integrity",
            minimumScoreBasisPoints: 4000,
            maximumUncertaintyBasisPoints: 10000,
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

test("profile status priority is contested, unknown, degraded, then supported", () => {
  assert.equal(
    deriveTrustProfileStatusV1(
      [
        dimension({
          contradictionPressureBasisPoints: 1,
          effectiveWeightBasisPoints: 0,
        }),
      ],
      policy,
    ),
    "contested",
  );
  assert.equal(
    deriveTrustProfileStatusV1(
      [dimension({ effectiveWeightBasisPoints: 0 })],
      policy,
    ),
    "unknown",
  );
  assert.equal(
    deriveTrustProfileStatusV1([dimension({ scoreBasisPoints: 2000 })], policy),
    "degraded",
  );
  assert.equal(deriveTrustProfileStatusV1([dimension()], policy), "supported");
});

test("profile key is policy-bound and profile validation rejects closed-shape and digest tamper", () => {
  const key = digestTrustProfileKeyV1({
    tenantId: "tenant-a",
    scopeDigest: digest("a"),
    subjectDigest: digest("b"),
    policyDigest: digest("c"),
  });
  assert.notEqual(
    key,
    digestTrustProfileKeyV1({
      tenantId: "tenant-a",
      scopeDigest: digest("a"),
      subjectDigest: digest("b"),
      policyDigest: digest("d"),
    }),
  );
  assert.throws(() =>
    validateTrustProfileV1({ schemaVersion: 1, unexpected: true }),
  );
});

test("create binds an exact public Fusion decision, revision lineage, and profile head", () => {
  const configured = realPolicy(),
    policyDigest = digestEvidenceFusionPolicyV1(configured);
  const state = reduceEvidenceTrustStateV1(
    createEvidenceTrustStateV1({ stateId: "profile-state" }),
    {
      schemaVersion: 1,
      kind: "policy_registered",
      policy: configured,
      logicalTimeMs: 0,
    },
  ).state;
  const decision = evaluateEvidenceFusionV1(
    state,
    {
      tenantId: "tenant-a",
      subject,
      scope,
      policyId: configured.policyId,
      policyVersion: configured.policyVersion,
      policyDigest,
      dependencyBindingDigests: [],
    },
    0,
  );
  // The pure constructor deliberately accepts a decision already retained by callers; this direct public evaluation supplies its exact value.
  const first = createTrustProfileV1({
    fusionDecision: decision,
    policy: configured,
    revision: 1,
    previousProfileId: null,
    previousProfileDigest: null,
    updatedAtLogicalMs: 0,
  });
  assert.equal(first.revision, 1);
  assert.equal(
    trustProfileHeadV1(first).profileKey,
    digestTrustProfileKeyV1({
      tenantId: first.tenantId,
      subjectDigest: first.subjectDigest,
      scopeDigest: first.scopeDigest,
      policyDigest: first.policyDigest,
    }),
  );
  assert.throws(() =>
    createTrustProfileV1({
      fusionDecision: decision,
      policy: configured,
      revision: 1,
      previousProfileId: "profile:x",
      previousProfileDigest: digest("a"),
      updatedAtLogicalMs: 0,
    }),
  );
  assert.throws(() =>
    createTrustProfileV1({
      fusionDecision: decision,
      policy: configured,
      revision: 1,
      previousProfileId: null,
      previousProfileDigest: null,
      updatedAtLogicalMs: 1,
    }),
  );
  assert.throws(() =>
    createTrustProfileV1({
      fusionDecision: { ...decision, tenantId: "other" },
      policy: configured,
      revision: 1,
      previousProfileId: null,
      previousProfileDigest: null,
      updatedAtLogicalMs: 0,
    }),
  );
  assert.throws(() =>
    validateTrustProfileV1({ ...first, profileDigest: digest("f") }),
  );
  assert.throws(() =>
    validateTrustProfileV1({ ...first, status: "supported" }),
  );
  const heavy = {
    ...first,
    dimensions: [
      dimension({
        effectiveWeightBasisPoints: 10001,
        latestQualifyingEffectiveAtLogicalMs: null,
      }),
    ],
  };
  const heavyDigest = digestTrustProfileV1(heavy);
  assert.doesNotThrow(() =>
    validateTrustProfileV1({
      ...heavy,
      profileDigest: heavyDigest,
      profileId: `profile:${heavyDigest}`,
    }),
  );
  assert.throws(() =>
    validateTrustProfileV1({
      ...first,
      dimensions: [dimension({ scoreBasisPoints: -1 })],
    }),
  );
});

test("the reducer appends exact profile heads and a later Fusion binds its predecessor", () => {
  const configured = realPolicy();
  const policyDigest = digestEvidenceFusionPolicyV1(configured);
  const request = {
    tenantId: scope.tenantId,
    subject,
    scope,
    policyId: configured.policyId,
    policyVersion: configured.policyVersion,
    policyDigest,
    dependencyBindingDigests: [],
  };
  let state = reduceEvidenceTrustStateV1(
    createEvidenceTrustStateV1({ stateId: "profile-reducer" }),
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
    request,
    logicalTimeMs: 0,
  }).state;
  const firstDecision = state.fusionDecisions[0];
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "profile_evaluated",
    fusionDecisionId: firstDecision.fusionDecisionId,
    fusionDecisionDigest: firstDecision.fusionDecisionDigest,
    logicalTimeMs: 0,
  }).state;
  assert.equal(state.profiles.length, 1);
  assert.equal(state.profileHeads[0].revision, 1);
  const secondDecision = evaluateEvidenceFusionV1(state, request, 0);
  assert.equal(
    secondDecision.previousProfileDigest,
    state.profileHeads[0].profileDigest,
  );
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "fusion_evaluated",
    request,
    logicalTimeMs: 0,
  }).state;
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "profile_evaluated",
    fusionDecisionId: secondDecision.fusionDecisionId,
    fusionDecisionDigest: secondDecision.fusionDecisionDigest,
    logicalTimeMs: 0,
  }).state;
  assert.equal(state.profiles.length, 2);
  assert.equal(state.profileHeads[0].revision, 2);
  assert.equal(
    state.profiles[1].previousProfileDigest,
    state.profiles[0].profileDigest,
  );
  const tampered = structuredClone(state);
  tampered.profiles[1].previousProfileDigest = digest("f");
  assert.throws(() =>
    reduceEvidenceTrustStateV1(tampered, {
      schemaVersion: 1,
      kind: "advance_logical_time",
      logicalTimeMs: 1,
    }),
  );
});
