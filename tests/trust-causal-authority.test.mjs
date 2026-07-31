import assert from "node:assert/strict";
import test from "node:test";

import {
  EVIDENCE_TRUST_LIMITS_V1,
  createEvidenceClaimV1,
  createEvidenceCausalAuthorizationV1,
  createEvidenceFusionPolicyV1,
  createEvidenceTrustSnapshotV1,
  createEvidenceTrustDependencyBindingV1,
  createEvidenceTrustStateV1,
  deriveApplicableBindingDigests,
  digestEvidenceCausalAuthorizationV1,
  digestEvidenceFusionPolicyV1,
  digestScopeV1,
  digestSubjectV1,
  evaluateEvidenceFusionV1,
  reduceEvidenceTrustStateV1,
  restoreEvidenceTrustSnapshotV1,
  validateEvidenceCausalAuthorizationV1,
  validateEvidenceTrustStateV1,
} from "../packages/trust/dist/index.js";

const digest = (letter) => letter.repeat(64);
const root = (kind, referenceDigest) => ({
  schemaVersion: 1,
  kind,
  referenceType: `${kind}-root`,
  referenceId: `${kind}-record`,
  referenceDigest,
  resolvedDigest: digest("d"),
  trustedEffectiveAtLogicalMs: 5,
  resolverBindingDigest: digest("e"),
  resolutionProofDigest: digest("f"),
});
const authorization = (bases) => ({
  schemaVersion: 1,
  recordId: "claim:record",
  recordDigest: digest("a"),
  recordKind: "claim",
  policyDigest: digest("b"),
  criterionId: "criterion-a",
  subjectDigest: digest("c"),
  scopeDigest: digest("d"),
  targetRecordId: null,
  targetRecordDigest: null,
  sourceRelation: "work_assignee",
  authorityBindingDigest: digest("e"),
  authorityProofDigest: digest("f"),
  bases,
  authorizedAtLogicalMs: 10,
});
const subject = {
  schemaVersion: 1,
  kind: "peer_capability",
  peerId: "peer-a",
  capabilityKey: "review",
  capabilityVersion: "v1",
  capabilityRevision: 1,
};
const scope = {
  schemaVersion: 1,
  kind: "standalone",
  tenantId: "tenant-a",
  namespace: "causal",
  scopeId: "scope-a",
};
const policyInput = () => ({
  schemaVersion: 1,
  policyId: "causal-policy",
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
      decayBasisPointsPerInterval: 1,
      uncertaintyGrowthBasisPointsPerInterval: 1,
      minimumRetainedWeightBasisPoints: 1,
      contradictionUncertaintyBasisPointsPerClaim: 1,
      maximumContradictionUncertaintyBasisPoints: 1000,
      degradedScoreAtOrBelowBasisPoints: 1,
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
      maximumSourceGroupContributionWeightBasisPoints: 1000,
      minimumSupportGroups: 1,
      minimumSupportWeightBasisPoints: 1,
      minimumContradictionGroups: 1,
      minimumContradictionWeightBasisPoints: 1,
      allowClaimSourceAttestation: false,
      contentRequired: false,
      quarantineEligible: false,
      recoveryEligible: false,
      maximumAgeMs: 10000,
      claimAuthority: {
        allowedSourceRelations: ["work_assignee"],
        allowedBasisReferences: [
          {
            kind: "evidence",
            referenceType: "claim",
            minimumCount: 0,
            maximumCount: 1,
          },
          {
            kind: "external",
            referenceType: "external-root",
            minimumCount: 0,
            maximumCount: 1,
          },
        ],
      },
      challengeAuthority: {
        allowedSourceRelations: ["target_author", "work_assignee"],
        allowedBasisReferences: [
          {
            kind: "external",
            referenceType: "external-root",
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
      roles: ["challenge", "claim"],
      maximumWeightBasisPoints: 1000,
      validFromLogicalMs: 0,
      validUntilLogicalMs: 10000,
    },
  ],
  dependencyGroups: [
    {
      dependencyGroupId: "author",
      maximumAttestationWeightPerClaimBasisPoints: 1000,
      maximumProfileWeightPerDimensionCriterionBasisPoints: 1000,
    },
  ],
  eligibilityRules: [],
  quarantinePolicy: { enabled: false, rules: [], maximumActiveRecords: 1 },
  recoveryPolicy: { rules: [] },
  limits: EVIDENCE_TRUST_LIMITS_V1,
  diagnosticsPolicyId: "diagnostics",
  redactionPolicyId: "redaction",
});
const claim = (bases, outcome = "satisfied") =>
  createEvidenceClaimV1({
    schemaVersion: 1,
    sourceId: "peer-a",
    sourceKind: "peer",
    causationId: null,
    subject,
    scope,
    criterionId: "criterion-a",
    outcome,
    content: null,
    basisReferences: bases,
    observedAt: null,
  });
const externalBasis = () => ({
  schemaVersion: 1,
  kind: "external",
  referenceType: "external-root",
  referenceId: "root-a",
  referenceDigest: digest("a"),
});
const localAdmission = (record, time) => ({
  schemaVersion: 1,
  kind: "record_admitted",
  record,
  origin: "local",
  originBindingDigest: digest("1"),
  originVerifierBindingDigest: null,
  originProofDigest: null,
  effectiveAtLogicalMs: time,
  logicalTimeMs: time,
});
const binding = (
  kind,
  name,
  time,
  policyDigest = null,
  upstreamBindingDigest = null,
  overrides = {},
) =>
  createEvidenceTrustDependencyBindingV1({
    schemaVersion: 1,
    bindingName: name,
    bindingVersion: 1,
    parentBindingDigest: null,
    bindingKind: kind,
    implementationId: name,
    implementationDigest: digest("2"),
    configurationDigest: digest("3"),
    policyDigest,
    subjectMappingDigest: null,
    upstreamBindingDigest,
    registeredAtLogicalMs: time,
    validFromLogicalMs: time,
    validUntilLogicalMs: null,
    ...overrides,
  });
const certificateInput = (
  record,
  policyDigest,
  authorityBindingDigest,
  bases = [externalBasis()],
  overrides = {},
) => ({
  schemaVersion: 1,
  kind: "causal_authorization_recorded",
  authorization: {
    schemaVersion: 1,
    recordId: record.claimId,
    recordDigest: record.claimId.slice("claim:".length),
    recordKind: "claim",
    policyDigest,
    criterionId: "criterion-a",
    subjectDigest: digestSubjectV1(subject),
    scopeDigest: digestScopeV1(scope),
    targetRecordId: null,
    targetRecordDigest: null,
    sourceRelation: "work_assignee",
    authorityBindingDigest,
    authorityProofDigest: digest("4"),
    bases: bases.map((item) =>
      item.kind === "evidence"
        ? {
            ...item,
            resolvedDigest: digest("5"),
            trustedEffectiveAtLogicalMs: 4,
            resolverBindingDigest: null,
            resolutionProofDigest: null,
          }
        : {
            ...item,
            resolvedDigest: digest("5"),
            trustedEffectiveAtLogicalMs: 4,
            resolverBindingDigest: digest("6"),
            resolutionProofDigest: digest("7"),
          },
    ),
    ...overrides,
  },
  logicalTimeMs: 5,
});

function integratedState(authorityOverrides = {}, limits = undefined) {
  const policy = createEvidenceFusionPolicyV1({
    ...policyInput(),
    ...(limits ? { limits } : {}),
  });
  const policyDigest = digestEvidenceFusionPolicyV1(policy);
  const upstream = binding("snapshot_protector", "upstream", 2);
  const authority = binding(
    "causal_authority",
    "authority",
    3,
    policyDigest,
    upstream.bindingDigest,
    authorityOverrides,
  );
  let state = createEvidenceTrustStateV1({
    stateId: "causal-state",
    ...(limits ? { limits } : {}),
  });
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "policy_registered",
    policy,
    logicalTimeMs: 1,
  }).state;
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "dependency_binding_registered",
    binding: upstream,
    logicalTimeMs: 2,
  }).state;
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "dependency_binding_registered",
    binding: authority,
    logicalTimeMs: 3,
  }).state;
  const record = claim([externalBasis()]);
  state = reduceEvidenceTrustStateV1(state, localAdmission(record, 4)).state;
  return { state, record, policy, policyDigest, upstream, authority };
}

test("causal certificates bind terminal Mesh, Control, and external roots", () => {
  for (const [kind, referenceDigest] of [
    ["mesh_record", "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    ["control_record", `sha256:${"a".repeat(64)}`],
    ["external", digest("a")],
  ]) {
    const value = createEvidenceCausalAuthorizationV1(
      authorization([root(kind, referenceDigest)]),
    );
    assert.equal(
      value.authorizationId,
      `causal-authorization:${value.authorizationDigest}`,
    );
    assert.equal(
      digestEvidenceCausalAuthorizationV1(value),
      value.authorizationDigest,
    );
    assert.deepEqual(validateEvidenceCausalAuthorizationV1(value), value);
  }
});

test("causal certificates fail closed for empty roots, evidence proof spoofing, and order changes", () => {
  assert.throws(() => createEvidenceCausalAuthorizationV1(authorization([])));
  assert.throws(() =>
    createEvidenceCausalAuthorizationV1(
      authorization([
        {
          ...root("external", digest("a")),
          kind: "evidence",
          resolverBindingDigest: digest("e"),
          resolutionProofDigest: digest("f"),
        },
      ]),
    ),
  );
  assert.throws(() =>
    createEvidenceCausalAuthorizationV1(
      authorization([
        root("external", digest("b")),
        root("external", digest("a")),
      ]),
    ),
  );
});

test("causal authority bindings require policy and upstream lineage", () => {
  const binding = createEvidenceTrustDependencyBindingV1({
    schemaVersion: 1,
    bindingName: "historic-work-authority",
    bindingVersion: 1,
    parentBindingDigest: null,
    bindingKind: "causal_authority",
    implementationId: "test-authority",
    implementationDigest: digest("a"),
    configurationDigest: digest("b"),
    policyDigest: digest("c"),
    subjectMappingDigest: null,
    upstreamBindingDigest: digest("d"),
    registeredAtLogicalMs: 1,
    validFromLogicalMs: 1,
    validUntilLogicalMs: null,
  });
  assert.equal(binding.bindingKind, "causal_authority");
  assert.throws(() =>
    createEvidenceTrustDependencyBindingV1({
      ...binding,
      bindingDigest: undefined,
      upstreamBindingDigest: null,
    }),
  );
});

test("reducer retains verified certificates, state validation stays pure, and restore re-verifies", () => {
  const { state, record, policyDigest, authority } = integratedState();
  let calls = 0;
  const registry = {
    resolve: (bindingDigest) => {
      calls += 1;
      return bindingDigest === authority.bindingDigest
        ? {
            authorityBindingDigest: authority.bindingDigest,
            policyDigest,
            upstreamBindingDigest: authority.upstreamBindingDigest,
            verify: () => true,
          }
        : null;
    },
  };
  const input = certificateInput(record, policyDigest, authority.bindingDigest);
  const accepted = reduceEvidenceTrustStateV1(state, input, {
    causalAuthorityVerifierRegistry: registry,
  });
  assert.equal(accepted.state.causalAuthorizations.length, 1);
  assert.equal(calls, 1);
  assert.throws(
    () =>
      reduceEvidenceTrustStateV1(accepted.state, {
        schemaVersion: 1,
        kind: "advance_logical_time",
        logicalTimeMs: 6,
      }),
    /retained causal authority requires verifier registry/u,
  );
  const duplicate = reduceEvidenceTrustStateV1(accepted.state, input, {
    causalAuthorityVerifierRegistry: registry,
  });
  assert.equal(duplicate.effects[0].kind, "causal_authorization_recorded");
  assert.equal(duplicate.effects[0].reasonCode, "duplicate");
  const beforeValidation = calls;
  assert.deepEqual(
    validateEvidenceTrustStateV1(duplicate.state),
    duplicate.state,
  );
  assert.equal(
    calls,
    beforeValidation,
    "state validation must not invoke a verifier",
  );
  const protector = {
    bindingDigest: digest("8"),
    protect: () => ({
      algorithmId: "test",
      keyId: "key",
      encoding: "base64url",
      proof: "proof",
    }),
    verify: () => true,
  };
  const snapshot = createEvidenceTrustSnapshotV1({
    state: duplicate.state,
    generation: 1,
    previousSnapshotDigest: null,
    createdAtLogicalMs: 5,
    protector,
  });
  const anchor = {
    schemaVersion: 1,
    stateId: duplicate.state.stateId,
    requiredGeneration: 1,
    requiredSnapshotDigest: snapshot.snapshotDigest,
    minimumLogicalHighWaterMs: 5,
    protectorBindingDigest: protector.bindingDigest,
  };
  assert.deepEqual(
    restoreEvidenceTrustSnapshotV1(snapshot, anchor, protector, {
      causalAuthorityVerifierRegistry: registry,
    }),
    duplicate.state,
  );
  assert.ok(calls > beforeValidation, "restore must invoke the verifier");
  assert.throws(
    () =>
      restoreEvidenceTrustSnapshotV1(snapshot, anchor, protector, {
        causalAuthorityVerifierRegistry: { resolve: () => null },
      }),
    /causal authority restore/u,
  );
  assert.throws(
    () =>
      restoreEvidenceTrustSnapshotV1(snapshot, anchor, protector, {
        causalAuthorityVerifierRegistry: {
          resolve: () => ({
            authorityBindingDigest: authority.bindingDigest,
            policyDigest,
            upstreamBindingDigest: authority.upstreamBindingDigest,
            verify: () => false,
          }),
        },
      }),
    /causal authority restore/u,
  );
  assert.throws(
    () =>
      restoreEvidenceTrustSnapshotV1(snapshot, anchor, protector, {
        causalAuthorityVerifierRegistry: {
          resolve: () => ({
            authorityBindingDigest: authority.bindingDigest,
            policyDigest,
            upstreamBindingDigest: digest("9"),
            verify: () => true,
          }),
        },
      }),
    /causal authority restore/u,
  );
});

test("reducer rejects stale heads, expiry, future bases, cross-bound certificates, and capacity overflow", () => {
  const cases = [
    [
      "policy",
      (input) => ({
        ...input,
        authorization: { ...input.authorization, policyDigest: digest("9") },
      }),
    ],
    [
      "criterion",
      (input) => ({
        ...input,
        authorization: { ...input.authorization, criterionId: "criterion-b" },
      }),
    ],
    [
      "subject",
      (input) => ({
        ...input,
        authorization: { ...input.authorization, subjectDigest: digest("9") },
      }),
    ],
    [
      "scope",
      (input) => ({
        ...input,
        authorization: { ...input.authorization, scopeDigest: digest("9") },
      }),
    ],
    [
      "target",
      (input) => ({
        ...input,
        authorization: {
          ...input.authorization,
          targetRecordId: "claim:other",
          targetRecordDigest: digest("9"),
        },
      }),
    ],
    [
      "basis",
      (input) => ({
        ...input,
        authorization: {
          ...input.authorization,
          bases: [
            { ...input.authorization.bases[0], referenceId: "other-root" },
          ],
        },
      }),
    ],
    [
      "future basis",
      (input) => ({
        ...input,
        authorization: {
          ...input.authorization,
          bases: [
            { ...input.authorization.bases[0], trustedEffectiveAtLogicalMs: 6 },
          ],
        },
      }),
    ],
  ];
  for (const [name, mutate] of cases) {
    const { state, record, policyDigest, authority } = integratedState();
    const input = mutate(
      certificateInput(record, policyDigest, authority.bindingDigest),
    );
    assert.throws(
      () =>
        reduceEvidenceTrustStateV1(state, input, {
          causalAuthorityVerifierRegistry: {
            resolve: () => ({
              authorityBindingDigest: authority.bindingDigest,
              policyDigest,
              upstreamBindingDigest: authority.upstreamBindingDigest,
              verify: () => true,
            }),
          },
        }),
      undefined,
      name,
    );
  }
  const expired = integratedState({ validUntilLogicalMs: 5 });
  // A certificate itself is well formed, but a binding whose window ended at 5 is rejected.
  assert.throws(() =>
    reduceEvidenceTrustStateV1(
      expired.state,
      certificateInput(
        expired.record,
        expired.policyDigest,
        expired.authority.bindingDigest,
      ),
      {
        causalAuthorityVerifierRegistry: {
          resolve: () => ({
            authorityBindingDigest: expired.authority.bindingDigest,
            policyDigest: expired.policyDigest,
            upstreamBindingDigest: expired.authority.upstreamBindingDigest,
            verify: () => true,
          }),
        },
      },
    ),
  );
  const head = integratedState();
  const { bindingDigest: _headDigest, ...headBody } = head.authority;
  const newer = createEvidenceTrustDependencyBindingV1({
    ...headBody,
    bindingVersion: 2,
    parentBindingDigest: head.authority.bindingDigest,
    registeredAtLogicalMs: 5,
    validFromLogicalMs: 5,
  });
  let headed = reduceEvidenceTrustStateV1(head.state, {
    schemaVersion: 1,
    kind: "dependency_binding_registered",
    binding: newer,
    logicalTimeMs: 5,
  }).state;
  const another = claim([externalBasis()], "violated");
  headed = reduceEvidenceTrustStateV1(headed, localAdmission(another, 6)).state;
  const oldInput = {
    ...certificateInput(
      another,
      head.policyDigest,
      head.authority.bindingDigest,
    ),
    logicalTimeMs: 7,
  };
  assert.throws(() =>
    reduceEvidenceTrustStateV1(headed, oldInput, {
      causalAuthorityVerifierRegistry: {
        resolve: () => ({
          authorityBindingDigest: head.authority.bindingDigest,
          policyDigest: head.policyDigest,
          upstreamBindingDigest: head.authority.upstreamBindingDigest,
          verify: () => true,
        }),
      },
    }),
  );
  const capped = integratedState(
    {},
    { ...EVIDENCE_TRUST_LIMITS_V1, maximumCausalAuthorizations: 1 },
  );
  const capRegistry = {
    causalAuthorityVerifierRegistry: {
      resolve: () => ({
        authorityBindingDigest: capped.authority.bindingDigest,
        policyDigest: capped.policyDigest,
        upstreamBindingDigest: capped.authority.upstreamBindingDigest,
        verify: () => true,
      }),
    },
  };
  let capState = reduceEvidenceTrustStateV1(
    capped.state,
    certificateInput(
      capped.record,
      capped.policyDigest,
      capped.authority.bindingDigest,
    ),
    capRegistry,
  ).state;
  const second = claim([externalBasis()], "violated");
  capState = reduceEvidenceTrustStateV1(
    capState,
    localAdmission(second, 6),
    capRegistry,
  ).state;
  assert.throws(
    () =>
      reduceEvidenceTrustStateV1(
        capState,
        {
          ...certificateInput(
            second,
            capped.policyDigest,
            capped.authority.bindingDigest,
          ),
          logicalTimeMs: 7,
        },
        capRegistry,
      ),
    /capacity/u,
  );
});

test("an evidence-only certificate chain derives its effective terminal root through retained state", () => {
  const {
    state: initial,
    record: leaf,
    policy,
    policyDigest,
    authority,
  } = integratedState();
  const registry = {
    resolve: () => ({
      authorityBindingDigest: authority.bindingDigest,
      policyDigest,
      upstreamBindingDigest: authority.upstreamBindingDigest,
      verify: () => true,
    }),
  };
  let state = reduceEvidenceTrustStateV1(
    initial,
    certificateInput(leaf, policyDigest, authority.bindingDigest),
    { causalAuthorityVerifierRegistry: registry },
  ).state;
  const evidenceBasis = {
    schemaVersion: 1,
    kind: "evidence",
    referenceType: "claim",
    referenceId: leaf.claimId,
    referenceDigest: leaf.claimId.slice("claim:".length),
  };
  const parent = claim([evidenceBasis]);
  state = reduceEvidenceTrustStateV1(state, localAdmission(parent, 6), {
    causalAuthorityVerifierRegistry: registry,
  }).state;
  const parentInput = {
    ...certificateInput(parent, policyDigest, authority.bindingDigest, [
      evidenceBasis,
    ]),
    authorization: {
      ...certificateInput(parent, policyDigest, authority.bindingDigest, [
        evidenceBasis,
      ]).authorization,
      bases: [
        {
          ...certificateInput(parent, policyDigest, authority.bindingDigest, [
            evidenceBasis,
          ]).authorization.bases[0],
          resolvedDigest: leaf.claimId.slice("claim:".length),
          trustedEffectiveAtLogicalMs: 4,
        },
      ],
    },
    logicalTimeMs: 7,
  };
  state = reduceEvidenceTrustStateV1(state, parentInput, {
    causalAuthorityVerifierRegistry: registry,
  }).state;
  const decision = evaluateEvidenceFusionV1(
    state,
    {
      tenantId: scope.tenantId,
      subject,
      scope,
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      policyDigest,
      dependencyBindingDigests: deriveApplicableBindingDigests(
        state,
        policyDigest,
        7,
      ),
    },
    7,
  );
  const parentClassification = decision.claimClassifications.find(
    (item) => item.claimId === parent.claimId,
  );
  assert.ok(parentClassification);
  assert.equal(
    parentClassification.reasonCodes.includes("source_not_effective"),
    false,
  );
});
