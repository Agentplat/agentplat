import assert from "node:assert/strict";
import test from "node:test";

import {
  EVIDENCE_TRUST_LIMITS_V1,
  createEvidenceAttestationV1,
  createEvidenceChallengeV1,
  createEvidenceClaimV1,
  createEvidenceFusionPolicyV1,
  createEvidenceRetractionV1,
  createEvidenceTrustDependencyBindingV1,
  createEvidenceTrustStateV1,
  createTrustEligibilityRequestV1,
  deriveApplicableBindingDigests,
  digestEvidenceFusionDecisionV1,
  digestEvidenceFusionPolicyV1,
  digestScopeV1,
  digestSubjectV1,
  evaluateEvidenceFusionV1,
  evaluateTrustEligibilityV1,
  reduceEvidenceTrustStateV1,
  validateEvidenceTrustStateV1,
  validateEvidenceFusionDecisionV1,
} from "../packages/trust/dist/index.js";

const digest = (letter) => letter.repeat(64);
const subject = { schemaVersion: 1, kind: "peer", peerId: "peer-a" };
const scope = {
  schemaVersion: 1,
  kind: "standalone",
  tenantId: "tenant-a",
  namespace: "fusion",
  scopeId: "scope-a",
};
const policyInput = (overrides = {}) => ({
  schemaVersion: 1,
  policyId: "fusion-policy",
  policyVersion: 1,
  parentPolicyDigest: null,
  mode: "restrict",
  dimensions: [
    {
      dimensionId: "integrity",
      priorScoreBasisPoints: 5000,
      priorWeightBasisPoints: 1000,
      minimumUncertaintyBasisPoints: 0,
      coverageTargetBasisPoints: 1000,
      decayIntervalMs: 100,
      decayBasisPointsPerInterval: 1000,
      uncertaintyGrowthBasisPointsPerInterval: 100,
      minimumRetainedWeightBasisPoints: 100,
      contradictionUncertaintyBasisPointsPerClaim: 100,
      maximumContradictionUncertaintyBasisPoints: 1000,
      degradedScoreAtOrBelowBasisPoints: 1000,
      degradedUncertaintyAtOrAboveBasisPoints: 9000,
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
      maximumSourceGroupContributionWeightBasisPoints: 700,
      minimumSupportGroups: 1,
      minimumSupportWeightBasisPoints: 1,
      minimumContradictionGroups: 1,
      minimumContradictionWeightBasisPoints: 1,
      allowClaimSourceAttestation: false,
      contentRequired: false,
      quarantineEligible: true,
      recoveryEligible: true,
      maximumAgeMs: 10_000,
      claimAuthority: {
        allowedSourceRelations: ["subject_self", "work_assignee"],
        allowedBasisReferences: [
          {
            kind: "external",
            referenceType: "claim-root",
            minimumCount: 1,
            maximumCount: 1,
          },
        ],
      },
      challengeAuthority: {
        allowedSourceRelations: ["subject_self", "target_author"],
        allowedBasisReferences: [
          {
            kind: "external",
            referenceType: "challenge-root",
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
      dependencyGroupId: "author",
      roles: ["attest", "challenge", "claim"],
      maximumWeightBasisPoints: 1000,
      validFromLogicalMs: 0,
      validUntilLogicalMs: 10_000,
    },
    {
      sourceId: "peer-b",
      sourceKind: "peer",
      dependencyGroupId: "b",
      roles: ["attest"],
      maximumWeightBasisPoints: 1000,
      validFromLogicalMs: 0,
      validUntilLogicalMs: 10_000,
    },
    {
      sourceId: "peer-c",
      sourceKind: "peer",
      dependencyGroupId: "c",
      roles: ["attest"],
      maximumWeightBasisPoints: 1000,
      validFromLogicalMs: 0,
      validUntilLogicalMs: 10_000,
    },
    {
      sourceId: "peer-d",
      sourceKind: "peer",
      dependencyGroupId: "author",
      roles: ["claim"],
      maximumWeightBasisPoints: 1000,
      validFromLogicalMs: 0,
      validUntilLogicalMs: 10_000,
    },
  ],
  dependencyGroups: [
    {
      dependencyGroupId: "author",
      maximumAttestationWeightPerClaimBasisPoints: 1000,
      maximumProfileWeightPerDimensionCriterionBasisPoints: 700,
    },
    {
      dependencyGroupId: "b",
      maximumAttestationWeightPerClaimBasisPoints: 700,
      maximumProfileWeightPerDimensionCriterionBasisPoints: 700,
    },
    {
      dependencyGroupId: "c",
      maximumAttestationWeightPerClaimBasisPoints: 700,
      maximumProfileWeightPerDimensionCriterionBasisPoints: 700,
    },
  ],
  eligibilityRules: [
    {
      ruleId: "eligible",
      maximumProfileAgeMs: 10_000,
      requirements: [
        {
          dimensionId: "integrity",
          minimumScoreBasisPoints: 0,
          maximumUncertaintyBasisPoints: 10_000,
        },
      ],
    },
  ],
  quarantinePolicy: {
    enabled: false,
    rules: [
      {
        dimensionId: "integrity",
        activationScoreAtOrBelowBasisPoints: 0,
        minimumNegativeClaimSourceGroups: 1,
        minimumNegativeWeightBasisPoints: 1,
        reviewIntervalMs: 100,
      },
    ],
    maximumActiveRecords: 1,
  },
  recoveryPolicy: {
    rules: [
      {
        dimensionId: "integrity",
        recoveryScoreAtOrAboveBasisPoints: 10_000,
        maximumRecoveryUncertaintyBasisPoints: 0,
        minimumRecoveryClaimSourceGroups: 1,
        minimumRecoveryWeightBasisPoints: 1,
        maximumRecoveryEvidenceAgeMs: 100,
      },
    ],
  },
  limits: EVIDENCE_TRUST_LIMITS_V1,
  diagnosticsPolicyId: "diagnostics",
  redactionPolicyId: "redaction",
  ...overrides,
});
const local = (record, time) => ({
  schemaVersion: 1,
  kind: "record_admitted",
  record,
  origin: "local",
  originBindingDigest: digest("a"),
  originVerifierBindingDigest: null,
  originProofDigest: null,
  effectiveAtLogicalMs: time,
  logicalTimeMs: time,
});
const externalReference = (referenceType, referenceId) => ({
  schemaVersion: 1,
  kind: "external",
  referenceType,
  referenceId,
  referenceDigest: digest(referenceId.slice(-1)),
});
const claim = (
  outcome = "satisfied",
  criterionId = "criterion-a",
  { causationId = null, rootId = "claim-root-a", sourceId = "peer-a" } = {},
) =>
  createEvidenceClaimV1({
    schemaVersion: 1,
    sourceId,
    sourceKind: "peer",
    causationId,
    subject,
    scope,
    criterionId,
    outcome,
    content: null,
    basisReferences: [externalReference("claim-root", rootId)],
    observedAt: null,
  });
const attestation = (target, sourceId, disposition = "support") =>
  createEvidenceAttestationV1({
    schemaVersion: 1,
    sourceId,
    sourceKind: "peer",
    causationId: null,
    scope,
    claimId: target.claimId,
    claimDigest: target.claimId.slice("claim:".length),
    disposition,
    confidenceBasisPoints: 10_000,
    basisReferences: [],
    observedAt: null,
  });
const challenge = (target, kind = "claim") =>
  createEvidenceChallengeV1({
    schemaVersion: 1,
    sourceId: "peer-a",
    sourceKind: "peer",
    causationId: null,
    scope,
    targetKind: kind,
    targetId: kind === "claim" ? target.claimId : target.attestationId,
    targetDigest: (kind === "claim"
      ? target.claimId
      : target.attestationId
    ).slice(`${kind}:`.length),
    reasonCode: "challenge_unresolved",
    basisReferences: [externalReference("challenge-root", "challenge-root-a")],
    observedAt: null,
  });
let setupSequence = 0;
function setup(records = [], input = {}) {
  const policy = createEvidenceFusionPolicyV1(policyInput(input));
  let state = reduceEvidenceTrustStateV1(
    createEvidenceTrustStateV1({
      stateId: `fusion-${(setupSequence += 1)}`,
      limits: input.limits ?? EVIDENCE_TRUST_LIMITS_V1,
    }),
    { schemaVersion: 1, kind: "policy_registered", policy, logicalTimeMs: 0 },
  ).state;
  const policyDigest = digestEvidenceFusionPolicyV1(policy);
  const upstream = createEvidenceTrustDependencyBindingV1({
    schemaVersion: 1,
    bindingName: "fusion-root-resolver",
    bindingVersion: 1,
    parentBindingDigest: null,
    bindingKind: "content_resolver",
    implementationId: "fusion-root-resolver-v1",
    implementationDigest: digest("d"),
    configurationDigest: digest("e"),
    policyDigest,
    subjectMappingDigest: null,
    upstreamBindingDigest: null,
    registeredAtLogicalMs: 0,
    validFromLogicalMs: 0,
    validUntilLogicalMs: null,
  });
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "dependency_binding_registered",
    binding: upstream,
    logicalTimeMs: 0,
  }).state;
  const authority = createEvidenceTrustDependencyBindingV1({
    schemaVersion: 1,
    bindingName: "fusion-causal-authority",
    bindingVersion: 1,
    parentBindingDigest: null,
    bindingKind: "causal_authority",
    implementationId: "fusion-causal-authority-v1",
    implementationDigest: digest("f"),
    configurationDigest: digest("1"),
    policyDigest,
    subjectMappingDigest: digest("2"),
    upstreamBindingDigest: upstream.bindingDigest,
    registeredAtLogicalMs: 0,
    validFromLogicalMs: 0,
    validUntilLogicalMs: null,
  });
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "dependency_binding_registered",
    binding: authority,
    logicalTimeMs: 0,
  }).state;
  const causalRegistry = {
    resolve(bindingDigest) {
      if (bindingDigest !== authority.bindingDigest) return null;
      return {
        authorityBindingDigest: authority.bindingDigest,
        policyDigest,
        upstreamBindingDigest: upstream.bindingDigest,
        verify: () => true,
      };
    },
  };
  for (const [record, time] of records) {
    const isClaimRecord = "outcome" in record;
    const isChallengeRecord = "challengeId" in record;
    const causalRecordId = isClaimRecord
      ? record.claimId
      : isChallengeRecord
        ? record.challengeId
        : null;
    const alreadyPresent = state.records.some(
      (item) => item.recordId === causalRecordId,
    );
    state = reduceEvidenceTrustStateV1(state, local(record, time), {
      causalAuthorityVerifierRegistry: causalRegistry,
    }).state;
    if (alreadyPresent || causalRecordId === null) continue;
    const recordKind = isChallengeRecord ? "challenge" : "claim";
    const recordId = causalRecordId;
    const recordDigest = recordId.slice(`${recordKind}:`.length);
    const target =
      recordKind === "challenge"
        ? state.records.find(
            (item) =>
              item.recordId === record.targetId &&
              item.recordDigest === record.targetDigest,
          )
        : null;
    const targetClaim =
      recordKind === "claim"
        ? record
        : target?.recordKind === "claim"
          ? target.record
          : state.records.find(
              (item) =>
                item.recordId === target?.record.claimId &&
                item.recordDigest === target?.record.claimDigest,
            )?.record;
    const bases = record.basisReferences.map((reference) => ({
      ...reference,
      resolvedDigest: digest("3"),
      trustedEffectiveAtLogicalMs: time,
      resolverBindingDigest: upstream.bindingDigest,
      resolutionProofDigest: digest("4"),
    }));
    state = reduceEvidenceTrustStateV1(
      state,
      {
        schemaVersion: 1,
        kind: "causal_authorization_recorded",
        authorization: {
          schemaVersion: 1,
          recordId,
          recordDigest,
          recordKind,
          policyDigest,
          criterionId: targetClaim.criterionId,
          subjectDigest: digestSubjectV1(targetClaim.subject),
          scopeDigest: digestScopeV1(record.scope),
          targetRecordId: target?.recordId ?? null,
          targetRecordDigest: target?.recordDigest ?? null,
          sourceRelation:
            record.sourceId === targetClaim.subject.peerId
              ? "subject_self"
              : "work_assignee",
          authorityBindingDigest: authority.bindingDigest,
          authorityProofDigest: digest("5"),
          bases,
        },
        logicalTimeMs: time,
      },
      { causalAuthorityVerifierRegistry: causalRegistry },
    ).state;
  }
  const request = {
    tenantId: "tenant-a",
    subject,
    scope,
    policyId: policy.policyId,
    policyVersion: 1,
    policyDigest,
    dependencyBindingDigests: deriveApplicableBindingDigests(
      state,
      policyDigest,
      state.logicalTimeHighWaterMs,
    ),
  };
  return {
    state,
    policy,
    request,
    causalRegistry,
    authority,
    upstream,
  };
}
function admitCausallyAuthorizedClaim(configured, state, record, time) {
  let next = reduceEvidenceTrustStateV1(state, local(record, time), {
    causalAuthorityVerifierRegistry: configured.causalRegistry,
  }).state;
  const recordDigest = record.claimId.slice("claim:".length);
  next = reduceEvidenceTrustStateV1(
    next,
    {
      schemaVersion: 1,
      kind: "causal_authorization_recorded",
      authorization: {
        schemaVersion: 1,
        recordId: record.claimId,
        recordDigest,
        recordKind: "claim",
        policyDigest: configured.request.policyDigest,
        criterionId: record.criterionId,
        subjectDigest: digestSubjectV1(record.subject),
        scopeDigest: digestScopeV1(record.scope),
        targetRecordId: null,
        targetRecordDigest: null,
        sourceRelation:
          record.sourceId === record.subject.peerId
            ? "subject_self"
            : "work_assignee",
        authorityBindingDigest: configured.authority.bindingDigest,
        authorityProofDigest: digest("5"),
        bases: record.basisReferences.map((reference) => ({
          ...reference,
          resolvedDigest: digest("3"),
          trustedEffectiveAtLogicalMs: time,
          resolverBindingDigest: configured.upstream.bindingDigest,
          resolutionProofDigest: digest("4"),
        })),
      },
      logicalTimeMs: time,
    },
    { causalAuthorityVerifierRegistry: configured.causalRegistry },
  ).state;
  return next;
}
function admitCausallyAuthorizedChallenge(configured, state, record, time) {
  let next = reduceEvidenceTrustStateV1(state, local(record, time), {
    causalAuthorityVerifierRegistry: configured.causalRegistry,
  }).state;
  const target = next.records.find(
    (candidate) =>
      candidate.recordId === record.targetId &&
      candidate.recordDigest === record.targetDigest,
  );
  const targetClaim =
    target?.recordKind === "claim"
      ? target
      : next.records.find(
          (candidate) =>
            candidate.recordKind === "claim" &&
            candidate.recordId === target?.record.claimId &&
            candidate.recordDigest === target?.record.claimDigest,
        );
  assert(targetClaim?.recordKind === "claim");
  const recordDigest = record.challengeId.slice("challenge:".length);
  next = reduceEvidenceTrustStateV1(
    next,
    {
      schemaVersion: 1,
      kind: "causal_authorization_recorded",
      authorization: {
        schemaVersion: 1,
        recordId: record.challengeId,
        recordDigest,
        recordKind: "challenge",
        policyDigest: configured.request.policyDigest,
        criterionId: targetClaim.record.criterionId,
        subjectDigest: digestSubjectV1(targetClaim.record.subject),
        scopeDigest: digestScopeV1(record.scope),
        targetRecordId: target.recordId,
        targetRecordDigest: target.recordDigest,
        sourceRelation:
          record.sourceId === targetClaim.record.subject.peerId
            ? "subject_self"
            : "target_author",
        authorityBindingDigest: configured.authority.bindingDigest,
        authorityProofDigest: digest("5"),
        bases: record.basisReferences.map((reference) => ({
          ...reference,
          resolvedDigest: digest("3"),
          trustedEffectiveAtLogicalMs: time,
          resolverBindingDigest: configured.upstream.bindingDigest,
          resolutionProofDigest: digest("4"),
        })),
      },
      logicalTimeMs: time,
    },
    { causalAuthorityVerifierRegistry: configured.causalRegistry },
  ).state;
  return next;
}
const quarantinePolicyOverrides = (limits = EVIDENCE_TRUST_LIMITS_V1) => {
  const basePolicy = policyInput();
  return {
    sourceBindings: [
      ...basePolicy.sourceBindings,
      {
        sourceId: "peer-e",
        sourceKind: "peer",
        dependencyGroupId: "e",
        roles: ["claim"],
        maximumWeightBasisPoints: 1000,
        validFromLogicalMs: 0,
        validUntilLogicalMs: 10_000,
      },
      {
        sourceId: "peer-f",
        sourceKind: "peer",
        dependencyGroupId: "f",
        roles: ["attest"],
        maximumWeightBasisPoints: 1000,
        validFromLogicalMs: 0,
        validUntilLogicalMs: 10_000,
      },
    ],
    dependencyGroups: [
      ...basePolicy.dependencyGroups,
      {
        dependencyGroupId: "e",
        maximumAttestationWeightPerClaimBasisPoints: 1000,
        maximumProfileWeightPerDimensionCriterionBasisPoints: 700,
      },
      {
        dependencyGroupId: "f",
        maximumAttestationWeightPerClaimBasisPoints: 700,
        maximumProfileWeightPerDimensionCriterionBasisPoints: 700,
      },
    ],
    quarantinePolicy: {
      enabled: true,
      rules: [
        {
          dimensionId: "integrity",
          activationScoreAtOrBelowBasisPoints: 6500,
          minimumNegativeClaimSourceGroups: 1,
          minimumNegativeWeightBasisPoints: 500,
          reviewIntervalMs: 10,
        },
      ],
      maximumActiveRecords: 4,
    },
    recoveryPolicy: {
      rules: [
        {
          dimensionId: "integrity",
          recoveryScoreAtOrAboveBasisPoints: 7000,
          maximumRecoveryUncertaintyBasisPoints: 5000,
          minimumRecoveryClaimSourceGroups: 1,
          minimumRecoveryWeightBasisPoints: 500,
          maximumRecoveryEvidenceAgeMs: 100,
        },
      ],
    },
    limits,
  };
};
const classify = (result, target) =>
  result.claimClassifications.find((item) => item.claimId === target.claimId)
    ?.classification;

test("fusion classifies supported, contradicted, contested, and inconclusive deterministically", () => {
  const base = claim();
  for (const [label, records, expected] of [
    [
      "supported",
      [
        [base, 2],
        [attestation(base, "peer-b"), 3],
      ],
      "supported",
    ],
    [
      "contradicted",
      [
        [base, 2],
        [attestation(base, "peer-c", "contradict"), 3],
      ],
      "contradicted",
    ],
    [
      "contested",
      [
        [base, 2],
        [attestation(base, "peer-b"), 3],
        [attestation(base, "peer-c", "contradict"), 4],
      ],
      "contested",
    ],
    ["inconclusive", [[base, 2]], "inconclusive"],
  ]) {
    const { state, request } = setup(records);
    assert.equal(
      classify(evaluateEvidenceFusionV1(state, request, 10), base),
      expected,
      label,
    );
  }
});

test("same source/group cannot satisfy independence and intra-group conflict is excluded", () => {
  const base = claim();
  const bindings = policyInput().sourceBindings.map((binding) =>
    binding.sourceId === "peer-c"
      ? { ...binding, dependencyGroupId: "b" }
      : binding,
  );
  const oneGroup = setup(
    [
      [base, 2],
      [attestation(base, "peer-b"), 3],
      [attestation(base, "peer-c", "contradict"), 4],
    ],
    { sourceBindings: bindings },
  );
  const result = evaluateEvidenceFusionV1(oneGroup.state, oneGroup.request, 10);
  assert.equal(classify(result, base), "contradicted");
  assert.ok(
    result.recordExclusions.some((item) =>
      item.reasonCodes.includes("dependency_group_conflict"),
    ),
  );
});

test("challenge outcomes gate Claim and challenged Attestation contribution", () => {
  const base = claim();
  const support = attestation(base, "peer-b");
  const oppose = attestation(base, "peer-c", "contradict");
  for (const [label, after, expected] of [
    ["unresolved", [], "unavailable"],
    ["dismissed", [[support, 5]], "supported"],
    ["sustained", [[oppose, 5]], "unavailable"],
    [
      "contested",
      [
        [support, 5],
        [oppose, 6],
      ],
      "unavailable",
    ],
  ]) {
    const ch = challenge(base, "claim");
    const { state, request } = setup([[base, 2], [ch, 4], ...after]);
    assert.equal(
      state.records.find((record) => record.recordId === ch.challengeId)
        ?.status,
      "active",
      `${label} challenge lifecycle status`,
    );
    const decision = evaluateEvidenceFusionV1(state, request, 10);
    assert.equal(
      decision.challengeResolutions.length,
      1,
      `${label} resolution`,
    );
    assert.equal(classify(decision, base), expected, label);
  }
  const challengedAttestation = attestation(base, "peer-b");
  const attChallenge = challenge(challengedAttestation, "attestation");
  const { state, request } = setup([
    [base, 2],
    [challengedAttestation, 3],
    [attChallenge, 5],
  ]);
  assert.equal(
    classify(evaluateEvidenceFusionV1(state, request, 10), base),
    "inconclusive",
  );
});

test("root de-dup/conflict, caps, exact decay, order, binding set and semantic tamper fail closed", () => {
  const first = claim("satisfied"),
    duplicate = claim("satisfied", "criterion-a", {
      causationId: "duplicate-cause",
      sourceId: "peer-d",
    }),
    conflicting = claim("violated", "criterion-a", { sourceId: "peer-d" });
  const support = attestation(first, "peer-b");
  const duplicateSupport = attestation(duplicate, "peer-c");
  const conflictingSupport = attestation(conflicting, "peer-c");
  const dedup = setup([
    [first, 2],
    [duplicate, 3],
    [support, 4],
    [duplicateSupport, 5],
  ]);
  const decision = evaluateEvidenceFusionV1(dedup.state, dedup.request, 10);
  assert.equal(decision.dimensions[0].includedClaimIds.length, 1);
  const conflict = setup([
    [first, 2],
    [conflicting, 3],
    [support, 4],
    [conflictingSupport, 5],
  ]);
  assert.equal(
    evaluateEvidenceFusionV1(conflict.state, conflict.request, 10).dimensions[0]
      .effectiveWeightBasisPoints,
    0,
  );
  const aged = evaluateEvidenceFusionV1(dedup.state, dedup.request, 104);
  assert.equal(
    aged.claimClassifications.find((item) => item.claimId === first.claimId)
      .retainedWeightBasisPoints,
    9000,
  );
  assert.deepEqual(
    evaluateEvidenceFusionV1(dedup.state, dedup.request, 10),
    decision,
  );
  assert.throws(
    () =>
      evaluateEvidenceFusionV1(
        dedup.state,
        { ...dedup.request, dependencyBindingDigests: [digest("b")] },
        10,
      ),
    /bindings/u,
  );
  assert.throws(
    () =>
      reduceEvidenceTrustStateV1(
        dedup.state,
        {
          schemaVersion: 1,
          kind: "fusion_evaluated",
          request: dedup.request,
          logicalTimeMs: 0,
        },
        { causalAuthorityVerifierRegistry: dedup.causalRegistry },
      ),
    /rollback/u,
  );
  const reduced = reduceEvidenceTrustStateV1(
    dedup.state,
    {
      schemaVersion: 1,
      kind: "fusion_evaluated",
      request: dedup.request,
      logicalTimeMs: 10,
    },
    { causalAuthorityVerifierRegistry: dedup.causalRegistry },
  ).state;
  const tampered = structuredClone(reduced);
  tampered.fusionDecisions[0].dimensions[0].scoreBasisPoints = 1;
  tampered.fusionDecisions[0].fusionDecisionDigest =
    digestEvidenceFusionDecisionV1(tampered.fusionDecisions[0]);
  tampered.fusionDecisions[0].fusionDecisionId = `fusion-decision:${tampered.fusionDecisions[0].fusionDecisionDigest}`;
  assert.throws(
    () => validateEvidenceTrustStateV1(tampered),
    /fusion decision/u,
  );
});

test("historical Fusion survives later clock advances and retractions", () => {
  const base = claim();
  const support = attestation(base, "peer-b");
  const configured = setup([
    [base, 2],
    [support, 3],
  ]);
  let state = reduceEvidenceTrustStateV1(
    configured.state,
    {
      schemaVersion: 1,
      kind: "fusion_evaluated",
      request: configured.request,
      logicalTimeMs: 10,
    },
    { causalAuthorityVerifierRegistry: configured.causalRegistry },
  ).state;
  const historical = state.fusionDecisions[0];
  state = reduceEvidenceTrustStateV1(
    state,
    {
      schemaVersion: 1,
      kind: "advance_logical_time",
      logicalTimeMs: 11,
    },
    { causalAuthorityVerifierRegistry: configured.causalRegistry },
  ).state;
  const retraction = createEvidenceRetractionV1({
    schemaVersion: 1,
    sourceId: "peer-a",
    sourceKind: "peer",
    causationId: null,
    scope,
    targetKind: "claim",
    targetId: base.claimId,
    targetDigest: base.claimId.slice("claim:".length),
    reasonCode: "evidence_unavailable",
    observedAt: null,
  });
  state = reduceEvidenceTrustStateV1(state, local(retraction, 12), {
    causalAuthorityVerifierRegistry: configured.causalRegistry,
  }).state;
  assert.deepEqual(state.fusionDecisions, [historical]);
  assert.equal(
    state.records.find((item) => item.recordId === base.claimId)?.status,
    "retracted",
  );
  assert.deepEqual(validateEvidenceTrustStateV1(state), state);
});

test("Fusion enforces its record ceiling and standalone canonical order", () => {
  const base = claim();
  const configured = setup([[base, 2]]);
  const oversized = {
    ...configured.state,
    records: Array.from(
      {
        length: configured.policy.limits.maximumConsideredRecordsPerFusion + 1,
      },
      () => configured.state.records[0],
    ),
  };
  assert.throws(
    () => evaluateEvidenceFusionV1(oversized, configured.request, 10),
    /considered-record capacity/u,
  );

  const satisfied = claim("satisfied");
  const violated = claim("violated");
  const conflict = setup([
    [satisfied, 2],
    [violated, 3],
    [attestation(satisfied, "peer-b"), 4],
    [attestation(violated, "peer-c"), 5],
  ]);
  const decision = evaluateEvidenceFusionV1(
    conflict.state,
    conflict.request,
    10,
  );
  assert.equal(decision.claimClassifications.length, 2);
  const reordered = structuredClone(decision);
  reordered.claimClassifications.reverse();
  reordered.fusionDecisionDigest = digestEvidenceFusionDecisionV1(reordered);
  reordered.fusionDecisionId = `fusion-decision:${reordered.fusionDecisionDigest}`;
  assert.throws(
    () => validateEvidenceFusionDecisionV1(reordered),
    /sorted and unique/u,
  );
});

test("1024 distinct Claim roots reach the Fusion ceiling and one dependency group retains its effective cap", () => {
  const seed = claim("satisfied", "criterion-a", {
    causationId: "flood-cause-0000",
    rootId: "flood-root-0000",
  });
  const configured = setup([[seed, 1]]);
  const claimRoots = [
    seed,
    ...Array.from({ length: 1023 }, (_, index) =>
      claim("satisfied", "criterion-a", {
        causationId: `flood-cause-${String(index + 1).padStart(4, "0")}`,
        rootId: `flood-root-${String(index + 1).padStart(4, "0")}`,
      }),
    ),
  ];
  const recordTemplate = configured.state.records[0];
  const atCapacityState = {
    ...configured.state,
    records: claimRoots.map((record) => ({
      ...recordTemplate,
      recordId: record.claimId,
      recordDigest: record.claimId.slice("claim:".length),
      record,
    })),
  };
  const atCapacity = evaluateEvidenceFusionV1(
    atCapacityState,
    configured.request,
    1,
  );
  assert.equal(atCapacity.consideredRecordIds.length, 1024);
  assert.equal(atCapacity.claimClassifications.length, 1024);
  assert.equal(
    new Set(claimRoots.map((record) => record.rootBasisDigest)).size,
    1024,
  );

  const overflowClaim = claim("satisfied", "criterion-a", {
    causationId: "flood-cause-overflow",
    rootId: "flood-root-a",
  });
  const overflow = {
    ...atCapacityState,
    records: [
      ...atCapacityState.records,
      {
        ...recordTemplate,
        recordId: overflowClaim.claimId,
        recordDigest: overflowClaim.claimId.slice("claim:".length),
        record: overflowClaim,
      },
    ],
  };
  assert.throws(
    () => evaluateEvidenceFusionV1(overflow, configured.request, 1),
    /considered-record capacity/u,
  );

  const first = claim("satisfied", "criterion-a", {
    causationId: "cap-first",
    rootId: "cap-root-a",
  });
  const second = claim("satisfied", "criterion-a", {
    causationId: "cap-second",
    rootId: "cap-root-b",
    sourceId: "peer-d",
  });
  const capped = setup([
    [first, 2],
    [attestation(first, "peer-b"), 3],
    [second, 4],
    [attestation(second, "peer-c"), 5],
  ]);
  const cappedDecision = evaluateEvidenceFusionV1(
    capped.state,
    capped.request,
    10,
  );
  assert.equal(cappedDecision.dimensions[0].effectiveWeightBasisPoints, 700);
  assert.equal(cappedDecision.dimensions[0].includedClaimIds.length, 1);
  assert.ok(
    cappedDecision.recordExclusions.some((entry) =>
      entry.reasonCodes.includes("dependency_group_cap_exhausted"),
    ),
  );
  const classification = cappedDecision.claimClassifications[0];
  assert.throws(
    () =>
      validateEvidenceFusionDecisionV1({
        ...cappedDecision,
        claimClassifications: [
          {
            ...classification,
            supportGroupIds: Array.from(
              { length: 65 },
              (_, index) => `oversized-group-${String(index).padStart(2, "0")}`,
            ),
          },
        ],
      }),
    /fusion support groups capacity exceeded/u,
  );
  const allocation = cappedDecision.groupAllocations[0];
  assert.throws(
    () =>
      validateEvidenceFusionDecisionV1({
        ...cappedDecision,
        groupAllocations: [
          {
            ...allocation,
            candidateRecordIds: Array.from(
              { length: 1025 },
              (_, index) => `candidate-${String(index).padStart(4, "0")}`,
            ),
          },
        ],
      }),
    /fusion allocation candidates capacity exceeded/u,
  );
});

test("a bounded burst of unbound identities has zero effective weight", () => {
  const base = claim("satisfied", "criterion-a", {
    causationId: "bound-baseline",
    rootId: "bound-baseline-a",
  });
  const support = attestation(base, "peer-b");
  const baseline = setup([
    [base, 2],
    [support, 3],
  ]);
  const baselineDecision = evaluateEvidenceFusionV1(
    baseline.state,
    baseline.request,
    10,
  );
  const unboundClaims = Array.from({ length: 16 }, (_, index) =>
    claim("satisfied", "criterion-a", {
      causationId: `unbound-cause-${index}`,
      rootId: `unbound-root-${String(index).padStart(2, "0")}`,
      sourceId: `peer-unbound-${String(index).padStart(2, "0")}`,
    }),
  );
  const flooded = setup([
    [base, 2],
    [support, 3],
    ...unboundClaims.map((record, index) => [record, index + 4]),
  ]);
  const decision = evaluateEvidenceFusionV1(
    flooded.state,
    flooded.request,
    100,
  );
  assert.equal(
    decision.dimensions[0].effectiveWeightBasisPoints,
    baselineDecision.dimensions[0].effectiveWeightBasisPoints,
  );
  assert.deepEqual(
    decision.dimensions[0].includedClaimIds,
    baselineDecision.dimensions[0].includedClaimIds,
  );
  for (const record of unboundClaims) {
    const classification = decision.claimClassifications.find(
      (entry) => entry.claimId === record.claimId,
    );
    assert.equal(classification?.effectiveWeightBasisPoints, 0);
    assert.ok(classification?.reasonCodes.includes("source_not_effective"));
  }
});

test("quarantine activates atomically, requires explicit review, recovers from new disjoint evidence, and reactivates only from newer negatives", () => {
  const lifecycleLimits = {
    ...EVIDENCE_TRUST_LIMITS_V1,
    maximumQuarantineRevisionsPerHead: 5,
  };
  const negative = claim("violated");
  const configured = setup(
    [
      [negative, 2],
      [attestation(negative, "peer-b"), 3],
    ],
    quarantinePolicyOverrides(lifecycleLimits),
  );
  const options = {
    causalAuthorityVerifierRegistry: configured.causalRegistry,
  };
  const materializeProfile = (stateValue, logicalTimeMs) => {
    let next = reduceEvidenceTrustStateV1(
      stateValue,
      {
        schemaVersion: 1,
        kind: "fusion_evaluated",
        request: configured.request,
        logicalTimeMs,
      },
      options,
    ).state;
    const decision = next.fusionDecisions.find(
      (candidate) => candidate.evaluatedAtLogicalMs === logicalTimeMs,
    );
    next = reduceEvidenceTrustStateV1(
      next,
      {
        schemaVersion: 1,
        kind: "profile_evaluated",
        fusionDecisionId: decision.fusionDecisionId,
        fusionDecisionDigest: decision.fusionDecisionDigest,
        logicalTimeMs,
      },
      options,
    ).state;
    const profile = next.profiles.find(
      (candidate) => candidate.fusionDecisionId === decision.fusionDecisionId,
    );
    return { state: next, decision, profile };
  };
  const eligibilityFor = (stateValue, profile, logicalTimeMs) => {
    const rule = configured.policy.eligibilityRules[0];
    return evaluateTrustEligibilityV1(
      stateValue,
      createTrustEligibilityRequestV1({
        schemaVersion: 1,
        tenantId: scope.tenantId,
        subject,
        subjectDigest: digestSubjectV1(subject),
        scope,
        scopeDigest: digestScopeV1(scope),
        policyId: configured.policy.policyId,
        policyVersion: configured.policy.policyVersion,
        policyDigest: configured.request.policyDigest,
        profileId: profile.profileId,
        profileDigest: profile.profileDigest,
        maximumProfileAgeMs: rule.maximumProfileAgeMs,
        requirements: rule.requirements,
      }),
      logicalTimeMs,
    );
  };

  let materialized = materializeProfile(configured.state, 4);
  let state = materialized.state;
  assert.equal(state.quarantineHeads[0].status, "active");
  assert.equal(state.quarantines[0].activationEvidenceIds.length, 2);
  assert.equal(
    eligibilityFor(state, materialized.profile, 4).disposition,
    "quarantined",
  );
  state = reduceEvidenceTrustStateV1(
    state,
    {
      schemaVersion: 1,
      kind: "advance_logical_time",
      logicalTimeMs: 13,
    },
    options,
  ).state;
  assert.equal(state.quarantineHeads[0].status, "active");
  state = reduceEvidenceTrustStateV1(
    state,
    {
      schemaVersion: 1,
      kind: "advance_logical_time",
      logicalTimeMs: 14,
    },
    options,
  ).state;
  assert.equal(state.quarantineHeads[0].status, "review_required");
  assert.equal(state.quarantineHeads[0].revision, 2);

  const activationChallenge = challenge(negative);
  state = admitCausallyAuthorizedChallenge(
    configured,
    state,
    activationChallenge,
    15,
  );
  const overlappingPositive = claim("satisfied", "criterion-a", {
    sourceId: "peer-d",
    rootId: "claim-root-1",
  });
  state = admitCausallyAuthorizedClaim(
    configured,
    state,
    overlappingPositive,
    16,
  );
  state = reduceEvidenceTrustStateV1(
    state,
    local(attestation(overlappingPositive, "peer-f"), 17),
    options,
  ).state;
  materialized = materializeProfile(state, 18);
  state = materialized.state;
  const reviewHead = state.quarantineHeads[0];
  state = reduceEvidenceTrustStateV1(
    state,
    {
      schemaVersion: 1,
      kind: "quarantine_reviewed",
      quarantineKey: reviewHead.quarantineKey,
      quarantineId: reviewHead.quarantineId,
      fusionDecisionId: materialized.decision.fusionDecisionId,
      fusionDecisionDigest: materialized.decision.fusionDecisionDigest,
      profileId: materialized.profile.profileId,
      profileDigest: materialized.profile.profileDigest,
      logicalTimeMs: 18,
    },
    options,
  ).state;
  assert.equal(state.recoveryDecisions.length, 1);
  assert.equal(state.recoveryDecisions[0].disposition, "insufficient");
  assert(
    state.recoveryDecisions[0].reasonCodes.includes("challenge_unresolved"),
  );
  assert.deepEqual(
    state.recoveryDecisions[0].recoveryClaimSourceDependencyGroupIds,
    [],
  );
  assert.equal(state.quarantineHeads[0].status, "review_required");
  assert.equal(
    eligibilityFor(state, materialized.profile, 18).disposition,
    "quarantined",
  );

  state = reduceEvidenceTrustStateV1(
    state,
    local(attestation(negative, "peer-c", "contradict"), 19),
    options,
  ).state;
  const positive = claim("satisfied", "criterion-a", {
    sourceId: "peer-e",
    rootId: "claim-root-2",
  });
  state = admitCausallyAuthorizedClaim(configured, state, positive, 20);
  state = reduceEvidenceTrustStateV1(
    state,
    local(attestation(positive, "peer-f"), 21),
    options,
  ).state;
  materialized = materializeProfile(state, 22);
  state = materialized.state;
  const secondReviewHead = state.quarantineHeads[0];
  state = reduceEvidenceTrustStateV1(
    state,
    {
      schemaVersion: 1,
      kind: "quarantine_reviewed",
      quarantineKey: secondReviewHead.quarantineKey,
      quarantineId: secondReviewHead.quarantineId,
      fusionDecisionId: materialized.decision.fusionDecisionId,
      fusionDecisionDigest: materialized.decision.fusionDecisionDigest,
      profileId: materialized.profile.profileId,
      profileDigest: materialized.profile.profileDigest,
      logicalTimeMs: 22,
    },
    options,
  ).state;
  assert.equal(state.recoveryDecisions.length, 2);
  const recoveredDecision = state.recoveryDecisions.find(
    (candidate) => candidate.disposition === "recovered",
  );
  assert.deepEqual(recoveredDecision.recoveryClaimSourceDependencyGroupIds, [
    "e",
  ]);
  assert.equal(state.quarantineHeads[0].status, "recovered");
  assert.equal(state.quarantineHeads[0].revision, 3);
  assert.equal(
    eligibilityFor(state, materialized.profile, 22).disposition,
    "eligible",
  );

  materialized = materializeProfile(state, 23);
  state = materialized.state;
  assert.equal(state.quarantineHeads[0].status, "recovered");
  const newerNegative = claim("violated", "criterion-a", {
    rootId: "claim-root-6",
  });
  state = admitCausallyAuthorizedClaim(configured, state, newerNegative, 24);
  state = reduceEvidenceTrustStateV1(
    state,
    local(attestation(newerNegative, "peer-b"), 25),
    options,
  ).state;
  materialized = materializeProfile(state, 26);
  state = materialized.state;
  assert.equal(state.quarantineHeads[0].status, "active");
  assert.equal(state.quarantineHeads[0].revision, 4);
  assert.equal(
    state.quarantines.at(-1).activationEvidenceIds.includes(negative.claimId),
    false,
  );
  assert.equal(
    state.quarantines
      .at(-1)
      .activationEvidenceIds.includes(newerNegative.claimId),
    true,
  );
  assert.equal(
    eligibilityFor(state, materialized.profile, 26).disposition,
    "quarantined",
  );
  const futureConflictingSibling = claim("violated", "criterion-a", {
    sourceId: "peer-e",
    rootId: "claim-root-2",
  });
  state = admitCausallyAuthorizedClaim(
    configured,
    state,
    futureConflictingSibling,
    27,
  );
  assert.equal(
    state.records.find((record) => record.recordId === positive.claimId)
      ?.status,
    "conflicted",
  );
  assert.equal(
    state.records.find(
      (record) => record.recordId === futureConflictingSibling.claimId,
    )?.status,
    "conflicted",
  );
  assert.equal(
    state.recoveryDecisions.find(
      (candidate) => candidate.disposition === "recovered",
    )?.recoveryDecisionId,
    recoveredDecision.recoveryDecisionId,
  );
  state = reduceEvidenceTrustStateV1(
    state,
    {
      schemaVersion: 1,
      kind: "advance_logical_time",
      logicalTimeMs: 36,
    },
    options,
  ).state;
  assert.equal(state.quarantineHeads[0].status, "review_required");
  assert.equal(state.quarantineHeads[0].revision, 5);
  assert.deepEqual(validateEvidenceTrustStateV1(state), state);
});

test("quarantine revision exhaustion emits unavailable and retains the review restriction", () => {
  for (const validMaximum of [1, 3, 4, 32])
    assert.doesNotThrow(() =>
      createEvidenceTrustStateV1({
        stateId: `valid-quarantine-revisions-${validMaximum}`,
        limits: {
          ...EVIDENCE_TRUST_LIMITS_V1,
          maximumQuarantineRevisionsPerHead: validMaximum,
        },
      }),
    );
  const limits = {
    ...EVIDENCE_TRUST_LIMITS_V1,
    maximumQuarantineRevisionsPerHead: 1,
  };
  const negative = claim("violated");
  const configured = setup(
    [
      [negative, 2],
      [attestation(negative, "peer-b"), 3],
    ],
    quarantinePolicyOverrides(limits),
  );
  const options = {
    causalAuthorityVerifierRegistry: configured.causalRegistry,
  };
  const materialize = (stateValue, logicalTimeMs) => {
    let next = reduceEvidenceTrustStateV1(
      stateValue,
      {
        schemaVersion: 1,
        kind: "fusion_evaluated",
        request: configured.request,
        logicalTimeMs,
      },
      options,
    ).state;
    const decision = next.fusionDecisions.find(
      (candidate) => candidate.evaluatedAtLogicalMs === logicalTimeMs,
    );
    next = reduceEvidenceTrustStateV1(
      next,
      {
        schemaVersion: 1,
        kind: "profile_evaluated",
        fusionDecisionId: decision.fusionDecisionId,
        fusionDecisionDigest: decision.fusionDecisionDigest,
        logicalTimeMs,
      },
      options,
    ).state;
    return {
      state: next,
      decision,
      profile: next.profiles.find(
        (candidate) => candidate.fusionDecisionId === decision.fusionDecisionId,
      ),
    };
  };

  let materialized = materialize(configured.state, 4);
  const reviewTransition = reduceEvidenceTrustStateV1(
    materialized.state,
    {
      schemaVersion: 1,
      kind: "advance_logical_time",
      logicalTimeMs: 14,
    },
    options,
  );
  let state = reviewTransition.state;
  assert(
    reviewTransition.effects.some(
      (effect) => effect.kind === "quarantine_review_required",
    ),
  );
  assert.equal(state.quarantineHeads[0].status, "active");
  assert.equal(state.quarantineHeads[0].revision, 1);
  assert.equal(state.quarantines.length, 1);
  const retraction = createEvidenceRetractionV1({
    schemaVersion: 1,
    sourceId: "peer-a",
    sourceKind: "peer",
    causationId: null,
    scope,
    targetKind: "claim",
    targetId: negative.claimId,
    targetDigest: negative.claimId.slice("claim:".length),
    reasonCode: "evidence_unavailable",
    observedAt: null,
  });
  state = reduceEvidenceTrustStateV1(
    state,
    local(retraction, 15),
    options,
  ).state;
  const positive = claim("satisfied", "criterion-a", {
    sourceId: "peer-e",
    rootId: "claim-root-7",
  });
  state = admitCausallyAuthorizedClaim(configured, state, positive, 16);
  state = reduceEvidenceTrustStateV1(
    state,
    local(attestation(positive, "peer-f"), 17),
    options,
  ).state;
  materialized = materialize(state, 18);
  state = materialized.state;
  const eligibilityRule = configured.policy.eligibilityRules[0];
  const eligibility = evaluateTrustEligibilityV1(
    state,
    createTrustEligibilityRequestV1({
      schemaVersion: 1,
      tenantId: scope.tenantId,
      subject,
      subjectDigest: digestSubjectV1(subject),
      scope,
      scopeDigest: digestScopeV1(scope),
      policyId: configured.policy.policyId,
      policyVersion: configured.policy.policyVersion,
      policyDigest: configured.request.policyDigest,
      profileId: materialized.profile.profileId,
      profileDigest: materialized.profile.profileDigest,
      maximumProfileAgeMs: eligibilityRule.maximumProfileAgeMs,
      requirements: eligibilityRule.requirements,
    }),
    18,
  );
  assert.equal(eligibility.disposition, "quarantined");
  assert(eligibility.reasonCodes.includes("quarantine_review_required"));
  assert.equal(eligibility.reasonCodes.includes("quarantine_activated"), false);
  const head = state.quarantineHeads[0];
  state = reduceEvidenceTrustStateV1(
    state,
    {
      schemaVersion: 1,
      kind: "quarantine_reviewed",
      quarantineKey: head.quarantineKey,
      quarantineId: head.quarantineId,
      fusionDecisionId: materialized.decision.fusionDecisionId,
      fusionDecisionDigest: materialized.decision.fusionDecisionDigest,
      profileId: materialized.profile.profileId,
      profileDigest: materialized.profile.profileDigest,
      logicalTimeMs: 18,
    },
    options,
  ).state;
  const recovery = state.recoveryDecisions.at(-1);
  assert.equal(recovery.disposition, "unavailable");
  assert(recovery.reasonCodes.includes("quarantine_recovery_unavailable"));
  assert.deepEqual(recovery.recoveryClaimSourceDependencyGroupIds, ["e"]);
  assert(recovery.effectiveRecoveryWeightBasisPoints >= 500);
  assert(recovery.scoreBasisPoints >= 7000);
  assert.equal(state.quarantines.length, 1);
  assert.equal(state.quarantineHeads[0].status, "active");
  assert.deepEqual(validateEvidenceTrustStateV1(state), state);
});
