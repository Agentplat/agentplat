import assert from "node:assert/strict";
import test from "node:test";

import {
  EVIDENCE_TRUST_LIMITS_V1,
  createEvidenceFusionPolicyV1,
  createEvidenceTrustDependencyBindingV1,
  createEvidenceTrustSnapshotV1,
  createEvidenceTrustStateV1,
  digestEvidenceFusionDecisionV1,
  digestEvidenceFusionPolicyV1,
  deriveApplicableBindingDigests,
  evaluateEvidenceFusionV1,
  reduceEvidenceTrustStateV1,
  validateEvidenceTrustStateV1,
  restoreEvidenceTrustSnapshotV1,
  validateEvidenceFusionPolicyV1,
} from "../packages/trust/dist/index.js";

const digest = (letter) => letter.repeat(64);
const limits = { ...EVIDENCE_TRUST_LIMITS_V1 };
const policy = (version = 1, parentPolicyDigest = null) => ({
  schemaVersion: 1,
  policyId: "policy-a",
  policyVersion: version,
  parentPolicyDigest,
  mode: "restrict",
  dimensions: [
    {
      dimensionId: "integrity",
      priorScoreBasisPoints: 5000,
      priorWeightBasisPoints: 1000,
      minimumUncertaintyBasisPoints: 100,
      coverageTargetBasisPoints: 5000,
      decayIntervalMs: 1000,
      decayBasisPointsPerInterval: 10,
      uncertaintyGrowthBasisPointsPerInterval: 10,
      minimumRetainedWeightBasisPoints: 100,
      contradictionUncertaintyBasisPointsPerClaim: 100,
      maximumContradictionUncertaintyBasisPoints: 1000,
      degradedScoreAtOrBelowBasisPoints: 2000,
      degradedUncertaintyAtOrAboveBasisPoints: 8000,
    },
  ],
  criteria: [
    {
      criterionId: "integrity-claim",
      dimensionId: "integrity",
      satisfiedValueBasisPoints: 10000,
      violatedValueBasisPoints: 0,
      inconclusiveValueBasisPoints: null,
      baseWeightBasisPoints: 1000,
      maximumClaimWeightBasisPoints: 2000,
      maximumSourceGroupContributionWeightBasisPoints: 1500,
      minimumSupportGroups: 1,
      minimumSupportWeightBasisPoints: 1,
      minimumContradictionGroups: 1,
      minimumContradictionWeightBasisPoints: 1,
      allowClaimSourceAttestation: false,
      contentRequired: false,
      quarantineEligible: true,
      recoveryEligible: true,
      maximumAgeMs: 10000,
      claimAuthority: {
        allowedSourceRelations: ["subject_self"],
        allowedBasisReferences: [],
      },
      challengeAuthority: {
        allowedSourceRelations: ["subject_self", "target_author"],
        allowedBasisReferences: [],
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
      roles: ["attest", "challenge", "claim"],
      maximumWeightBasisPoints: 1000,
      validFromLogicalMs: 0,
      validUntilLogicalMs: 10000,
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
      ruleId: "eligible-integrity",
      maximumProfileAgeMs: 10000,
      requirements: [
        {
          dimensionId: "integrity",
          minimumScoreBasisPoints: 5000,
          maximumUncertaintyBasisPoints: 5000,
        },
      ],
    },
  ],
  quarantinePolicy: {
    enabled: false,
    rules: [
      {
        dimensionId: "integrity",
        activationScoreAtOrBelowBasisPoints: 1000,
        minimumNegativeClaimSourceGroups: 1,
        minimumNegativeWeightBasisPoints: 1,
        reviewIntervalMs: 1000,
      },
    ],
    maximumActiveRecords: 1,
  },
  recoveryPolicy: {
    rules: [
      {
        dimensionId: "integrity",
        recoveryScoreAtOrAboveBasisPoints: 9000,
        maximumRecoveryUncertaintyBasisPoints: 1000,
        minimumRecoveryClaimSourceGroups: 1,
        minimumRecoveryWeightBasisPoints: 1,
        maximumRecoveryEvidenceAgeMs: 10000,
      },
    ],
  },
  limits,
  diagnosticsPolicyId: "diagnostics-a",
  redactionPolicyId: "redaction-a",
});

const registerPolicy = (state, value, logicalTimeMs = 1) =>
  reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "policy_registered",
    policy: value,
    logicalTimeMs,
  }).state;

test("fusion evaluates a closed, deterministic empty evidence set", () => {
  const registered = createEvidenceFusionPolicyV1(policy());
  const state = registerPolicy(
    createEvidenceTrustStateV1({ stateId: "fusion-empty" }),
    registered,
  );
  const request = {
    tenantId: "tenant-a",
    subject: { schemaVersion: 1, kind: "peer", peerId: "peer-a" },
    scope: {
      schemaVersion: 1,
      kind: "mesh",
      tenantId: "tenant-a",
      meshId: "mesh-a",
    },
    policyId: registered.policyId,
    policyVersion: registered.policyVersion,
    policyDigest: digestEvidenceFusionPolicyV1(registered),
    dependencyBindingDigests: [],
  };
  const first = evaluateEvidenceFusionV1(state, request, 2);
  const second = evaluateEvidenceFusionV1(state, request, 2);
  assert.deepEqual(second, first);
  assert.match(first.fusionDecisionDigest, /^[0-9a-f]{64}$/u);
  assert.deepEqual(first.includedRecordIds, []);
  const reduced = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "fusion_evaluated",
    request,
    logicalTimeMs: 2,
  }).state;
  assert.deepEqual(reduced.fusionDecisions, [first]);
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

test("fusion policy has closed shapes, derived digest, exact templates, and component ceilings", () => {
  const valid = createEvidenceFusionPolicyV1(policy());
  assert.equal("policyDigest" in valid, false);
  assert.match(digestEvidenceFusionPolicyV1(valid), /^[0-9a-f]{64}$/u);
  assert.deepEqual(validateEvidenceFusionPolicyV1(valid), valid);
  assert.throws(
    () => createEvidenceFusionPolicyV1({ ...policy(), unexpected: true }),
    /shape/u,
  );
  assert.throws(
    () =>
      createEvidenceFusionPolicyV1({
        ...policy(),
        eligibilityRules: [
          { ...policy().eligibilityRules[0], requirements: [] },
        ],
      }),
    /requirements/u,
  );
  assert.throws(
    () =>
      createEvidenceFusionPolicyV1({
        ...policy(),
        sourceBindings: [
          { ...policy().sourceBindings[0], roles: ["claim", "attest"] },
        ],
      }),
    /ordered/u,
  );
  assert.throws(
    () =>
      createEvidenceFusionPolicyV1({
        ...policy(),
        limits: {
          ...limits,
          maximumCriteriaPerPolicy: limits.maximumCriteriaPerPolicy + 1,
        },
      }),
    /limit/u,
  );
  assert.doesNotThrow(() =>
    createEvidenceFusionPolicyV1({
      ...policy(),
      dimensions: [{ ...policy().dimensions[0], decayIntervalMs: 86_400_000 }],
    }),
  );
  assert.throws(
    () =>
      createEvidenceFusionPolicyV1({
        ...policy(),
        criteria: [
          {
            ...policy().criteria[0],
            minimumSupportWeightBasisPoints: 0,
          },
        ],
      }),
    /minimumSupportWeightBasisPoints/u,
  );
  assert.throws(
    () =>
      createEvidenceFusionPolicyV1({
        ...policy(),
        criteria: [
          {
            ...policy().criteria[0],
            minimumContradictionWeightBasisPoints: 0,
          },
        ],
      }),
    /minimumContradictionWeightBasisPoints/u,
  );
});

test("policy lineage, local heads and reorder converge while fusion arrays remain empty", () => {
  const first = createEvidenceFusionPolicyV1(policy());
  const firstDigest = digestEvidenceFusionPolicyV1(first);
  const second = createEvidenceFusionPolicyV1(policy(2, firstDigest));
  let state = registerPolicy(
    createEvidenceTrustStateV1({ stateId: "policy-state" }),
    first,
  );
  state = registerPolicy(state, second, 2);
  assert.deepEqual(state.policyHeads, [
    {
      policyId: "policy-a",
      policyVersion: 2,
      policyDigest: digestEvidenceFusionPolicyV1(second),
    },
  ]);
  assert.deepEqual(state.fusionDecisions, []);
  assert.deepEqual(state.profiles, []);
  assert.deepEqual(state.quarantines, []);
  assert.throws(
    () =>
      registerPolicy(
        createEvidenceTrustStateV1({ stateId: "bad-parent" }),
        second,
      ),
    /lineage/u,
  );
  assert.throws(
    () => registerPolicy(state, policy(3, digest("f")), 3),
    /lineage/u,
  );
  const independent = createEvidenceFusionPolicyV1({
    ...policy(),
    policyId: "policy-b",
  });
  const left = registerPolicy(
    registerPolicy(
      createEvidenceTrustStateV1({ stateId: "order-left" }),
      first,
    ),
    independent,
    2,
  );
  const right = registerPolicy(
    registerPolicy(
      createEvidenceTrustStateV1({ stateId: "order-right" }),
      independent,
    ),
    first,
    2,
  );
  assert.deepEqual(left.policies, right.policies);
  assert.deepEqual(left.policyHeads, right.policyHeads);
});

test("the 1024-record fusion setup retains one canonical dependency-group cap", () => {
  const configured = createEvidenceFusionPolicyV1(policy());
  assert.equal(configured.limits.maximumConsideredRecordsPerFusion, 1024);
  assert.deepEqual(configured.sourceBindings, [
    {
      sourceId: "peer-a",
      sourceKind: "peer",
      dependencyGroupId: "group-a",
      roles: ["attest", "challenge", "claim"],
      maximumWeightBasisPoints: 1000,
      validFromLogicalMs: 0,
      validUntilLogicalMs: 10000,
    },
  ]);
  assert.equal(
    configured.dependencyGroups[0]
      .maximumProfileWeightPerDimensionCriterionBasisPoints,
    1000,
  );
});

test("dependency bindings enforce kind policy/link lineage and survive snapshot restore", () => {
  const registeredPolicy = createEvidenceFusionPolicyV1(policy());
  const policyDigest = digestEvidenceFusionPolicyV1(registeredPolicy);
  let state = registerPolicy(
    createEvidenceTrustStateV1({ stateId: "binding-state" }),
    registeredPolicy,
  );
  const content = createEvidenceTrustDependencyBindingV1({
    schemaVersion: 1,
    bindingName: "resolver-a",
    bindingVersion: 1,
    parentBindingDigest: null,
    bindingKind: "content_resolver",
    implementationId: "resolver-impl",
    implementationDigest: digest("a"),
    configurationDigest: digest("b"),
    policyDigest,
    subjectMappingDigest: null,
    upstreamBindingDigest: null,
    registeredAtLogicalMs: 2,
    validFromLogicalMs: 2,
    validUntilLogicalMs: null,
  });
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "dependency_binding_registered",
    binding: content,
    logicalTimeMs: 2,
  }).state;
  const { bindingDigest: _contentDigest, ...contentBody } = content;
  const contentV2 = createEvidenceTrustDependencyBindingV1({
    ...contentBody,
    bindingVersion: 2,
    parentBindingDigest: content.bindingDigest,
    implementationDigest: digest("f"),
    registeredAtLogicalMs: 3,
    validFromLogicalMs: 3,
    validUntilLogicalMs: 4,
  });
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "dependency_binding_registered",
    binding: contentV2,
    logicalTimeMs: 3,
  }).state;
  const wrapper = createEvidenceTrustDependencyBindingV1({
    ...contentBody,
    bindingName: "model-a",
    bindingKind: "model_boundary",
    implementationId: "model-impl",
    implementationDigest: digest("c"),
    configurationDigest: digest("d"),
    upstreamBindingDigest: content.bindingDigest,
    registeredAtLogicalMs: 4,
    validFromLogicalMs: 4,
  });
  // The constructor is intentionally fed only body fields; omit the old digest.
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "dependency_binding_registered",
    binding: wrapper,
    logicalTimeMs: 4,
  }).state;
  assert.equal(state.dependencyBindingHeads.length, 2);
  assert.equal(
    state.dependencyBindingHeads.find(
      (head) => head.bindingName === "resolver-a",
    ).bindingDigest,
    contentV2.bindingDigest,
  );
  assert.deepEqual(deriveApplicableBindingDigests(state, policyDigest, 2), [
    content.bindingDigest,
  ]);
  assert.deepEqual(deriveApplicableBindingDigests(state, policyDigest, 3), [
    contentV2.bindingDigest,
  ]);
  assert.throws(
    () => deriveApplicableBindingDigests(state, policyDigest, 4),
    /head is unavailable/u,
  );
  assert.throws(
    () =>
      reduceEvidenceTrustStateV1(state, {
        schemaVersion: 1,
        kind: "dependency_binding_registered",
        binding: createEvidenceTrustDependencyBindingV1({
          ...contentBody,
          bindingVersion: 3,
          parentBindingDigest: content.bindingDigest,
          registeredAtLogicalMs: 5,
          validFromLogicalMs: 5,
        }),
        logicalTimeMs: 5,
      }),
    /lineage/u,
  );
  assert.throws(
    () =>
      createEvidenceTrustDependencyBindingV1({
        ...contentBody,
        bindingName: "protector-a",
        bindingKind: "snapshot_protector",
        policyDigest,
      }),
    /nullability/u,
  );
  assert.throws(
    () =>
      createEvidenceTrustDependencyBindingV1({
        ...contentBody,
        bindingName: "broken-wrapper",
        bindingKind: "model_boundary",
        upstreamBindingDigest: null,
      }),
    /upstream/u,
  );
  assert.throws(
    () =>
      createEvidenceTrustDependencyBindingV1({
        ...contentBody,
        bindingName: "origin-verifier-a",
        bindingKind: "verified_mesh_origin_verifier",
        policyDigest: null,
        upstreamBindingDigest: null,
      }),
    /upstream/u,
  );
  const protector = {
    bindingDigest: digest("e"),
    protect: () => ({
      algorithmId: "test",
      keyId: "key-a",
      encoding: "base64url",
      proof: "proof",
    }),
    verify: () => true,
  };
  const snapshot = createEvidenceTrustSnapshotV1({
    state,
    generation: 1,
    previousSnapshotDigest: null,
    createdAtLogicalMs: 4,
    protector,
  });
  assert.deepEqual(
    restoreEvidenceTrustSnapshotV1(
      snapshot,
      {
        schemaVersion: 1,
        stateId: state.stateId,
        requiredGeneration: 1,
        requiredSnapshotDigest: snapshot.snapshotDigest,
        minimumLogicalHighWaterMs: 4,
        protectorBindingDigest: protector.bindingDigest,
      },
      protector,
    ),
    state,
  );
});
