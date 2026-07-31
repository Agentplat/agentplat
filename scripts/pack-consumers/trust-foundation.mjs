import {
  EVIDENCE_TRUST_LIMITS_V1,
  createEvidenceFusionPolicyV1,
  createEvidenceTrustStateV1,
  createTrustEligibilityRequestV1,
  digestEvidenceFusionPolicyV1,
  digestScopeV1,
  digestSubjectV1,
  evaluateTrustEligibilityV1,
  reduceEvidenceTrustStateV1,
} from '@agentplat/trust';

const subject = { schemaVersion: 1, kind: 'peer', peerId: 'peer-consumer' };
const scope = {
  schemaVersion: 1,
  kind: 'standalone',
  tenantId: 'tenant-consumer',
  namespace: 'release',
  scopeId: 'trust-foundation',
};
const policy = createEvidenceFusionPolicyV1({
  schemaVersion: 1,
  policyId: 'consumer-policy',
  policyVersion: 1,
  parentPolicyDigest: null,
  mode: 'restrict',
  dimensions: [
    {
      dimensionId: 'integrity',
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
      criterionId: 'criterion-integrity',
      dimensionId: 'integrity',
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
        allowedSourceRelations: ['subject_self'],
        allowedBasisReferences: [
          {
            kind: 'external',
            referenceType: 'root',
            minimumCount: 1,
            maximumCount: 1,
          },
        ],
      },
      challengeAuthority: {
        allowedSourceRelations: ['target_author'],
        allowedBasisReferences: [
          {
            kind: 'external',
            referenceType: 'root',
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
      sourceId: 'peer-consumer',
      sourceKind: 'peer',
      dependencyGroupId: 'consumer-group',
      roles: ['challenge', 'claim'],
      maximumWeightBasisPoints: 1000,
      validFromLogicalMs: 0,
      validUntilLogicalMs: 1000,
    },
  ],
  dependencyGroups: [
    {
      dependencyGroupId: 'consumer-group',
      maximumAttestationWeightPerClaimBasisPoints: 1000,
      maximumProfileWeightPerDimensionCriterionBasisPoints: 1000,
    },
  ],
  eligibilityRules: [
    {
      ruleId: 'delegate',
      maximumProfileAgeMs: 100,
      requirements: [
        {
          dimensionId: 'integrity',
          minimumScoreBasisPoints: 4000,
          maximumUncertaintyBasisPoints: 10000,
        },
      ],
    },
  ],
  quarantinePolicy: { enabled: false, rules: [], maximumActiveRecords: 1 },
  recoveryPolicy: { rules: [] },
  limits: EVIDENCE_TRUST_LIMITS_V1,
  diagnosticsPolicyId: 'consumer-diagnostics',
  redactionPolicyId: 'consumer-redaction',
});
const policyDigest = digestEvidenceFusionPolicyV1(policy);
const fusionRequest = {
  tenantId: scope.tenantId,
  subject,
  scope,
  policyId: policy.policyId,
  policyVersion: policy.policyVersion,
  policyDigest,
  dependencyBindingDigests: [],
};

let state = reduceEvidenceTrustStateV1(
  createEvidenceTrustStateV1({ stateId: 'trust-consumer-state' }),
  {
    schemaVersion: 1,
    kind: 'policy_registered',
    policy,
    logicalTimeMs: 0,
  },
).state;
state = reduceEvidenceTrustStateV1(state, {
  schemaVersion: 1,
  kind: 'fusion_evaluated',
  request: fusionRequest,
  logicalTimeMs: 0,
}).state;
const fusionDecision = state.fusionDecisions[0];
if (!fusionDecision) throw new Error('Trust consumer did not retain fusion');
state = reduceEvidenceTrustStateV1(state, {
  schemaVersion: 1,
  kind: 'profile_evaluated',
  fusionDecisionId: fusionDecision.fusionDecisionId,
  fusionDecisionDigest: fusionDecision.fusionDecisionDigest,
  logicalTimeMs: 0,
}).state;
const profile = state.profiles[0];
if (!profile) throw new Error('Trust consumer did not retain profile');
const eligibility = evaluateTrustEligibilityV1(
  state,
  createTrustEligibilityRequestV1({
    schemaVersion: 1,
    tenantId: profile.tenantId,
    subject: profile.subject,
    subjectDigest: digestSubjectV1(profile.subject),
    scope: profile.scope,
    scopeDigest: digestScopeV1(profile.scope),
    policyId: profile.policyId,
    policyVersion: profile.policyVersion,
    policyDigest: profile.policyDigest,
    profileId: profile.profileId,
    profileDigest: profile.profileDigest,
    maximumProfileAgeMs: policy.eligibilityRules[0].maximumProfileAgeMs,
    requirements: policy.eligibilityRules[0].requirements,
  }),
  0,
);
if (eligibility.disposition !== 'eligible' || eligibility.reasonCodes.length)
  throw new Error('Trust consumer eligibility did not remain deterministic');

console.log(
  'Verified Trust policy, profile, and eligibility from a clean consumer.',
);
