import assert from "node:assert/strict";
import test from "node:test";
import {
  EVIDENCE_TRUST_LIMITS_V1,
  createEvidenceAttestationV1,
  createEvidenceChallengeV1,
  createEvidenceClaimV1,
  createEvidenceFusionPolicyV1,
  createEvidenceTrustDependencyBindingV1,
  createEvidenceTrustStateV1,
  deriveApplicableBindingDigests,
  digestEvidenceFusionPolicyV1,
  digestScopeV1,
  digestSubjectV1,
  evaluateEvidenceFusionV1,
  reduceEvidenceTrustStateV1,
} from "../packages/trust/dist/index.js";

const hex = (x) => x.repeat(64);
const subject = { schemaVersion: 1, kind: "peer", peerId: "peer-a" };
const scope = {
  schemaVersion: 1,
  kind: "standalone",
  tenantId: "tenant-a",
  namespace: "fixed",
  scopeId: "scope-a",
};
const ref = (id) => ({
  schemaVersion: 1,
  kind: "external",
  referenceType: "root",
  referenceId: id,
  referenceDigest: hex("a"),
});
const policy = () =>
  createEvidenceFusionPolicyV1({
    schemaVersion: 1,
    policyId: "fixed-policy",
    policyVersion: 1,
    parentPolicyDigest: null,
    mode: "restrict",
    dimensions: [
      {
        dimensionId: "d",
        priorScoreBasisPoints: 5000,
        priorWeightBasisPoints: 1,
        minimumUncertaintyBasisPoints: 0,
        coverageTargetBasisPoints: 1,
        decayIntervalMs: 100,
        decayBasisPointsPerInterval: 1,
        uncertaintyGrowthBasisPointsPerInterval: 1,
        minimumRetainedWeightBasisPoints: 1,
        contradictionUncertaintyBasisPointsPerClaim: 1,
        maximumContradictionUncertaintyBasisPoints: 1000,
        degradedScoreAtOrBelowBasisPoints: 1,
        degradedUncertaintyAtOrAboveBasisPoints: 9999,
      },
    ],
    criteria: [
      {
        criterionId: "c",
        dimensionId: "d",
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
          allowedSourceRelations: ["subject_self"],
          allowedBasisReferences: [
            {
              kind: "evidence",
              referenceType: "claim",
              minimumCount: 0,
              maximumCount: 1,
            },
            {
              kind: "external",
              referenceType: "root",
              minimumCount: 0,
              maximumCount: 1,
            },
          ],
        },
        challengeAuthority: {
          allowedSourceRelations: ["target_author"],
          allowedBasisReferences: [
            {
              kind: "evidence",
              referenceType: "claim",
              minimumCount: 0,
              maximumCount: 1,
            },
            {
              kind: "external",
              referenceType: "root",
              minimumCount: 0,
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
        dependencyGroupId: "a",
        roles: ["challenge", "claim"],
        maximumWeightBasisPoints: 1000,
        validFromLogicalMs: 0,
        validUntilLogicalMs: 10000,
      },
      {
        sourceId: "peer-b",
        sourceKind: "peer",
        dependencyGroupId: "b",
        roles: ["attest"],
        maximumWeightBasisPoints: 1000,
        validFromLogicalMs: 0,
        validUntilLogicalMs: 10000,
      },
      {
        sourceId: "peer-c",
        sourceKind: "peer",
        dependencyGroupId: "c",
        roles: ["attest"],
        maximumWeightBasisPoints: 1000,
        validFromLogicalMs: 0,
        validUntilLogicalMs: 10000,
      },
      {
        sourceId: "peer-d",
        sourceKind: "peer",
        dependencyGroupId: "b",
        roles: ["attest"],
        maximumWeightBasisPoints: 1000,
        validFromLogicalMs: 0,
        validUntilLogicalMs: 10000,
      },
    ],
    dependencyGroups: ["a", "b", "c"].map((dependencyGroupId) => ({
      dependencyGroupId,
      maximumAttestationWeightPerClaimBasisPoints: 1000,
      maximumProfileWeightPerDimensionCriterionBasisPoints: 1000,
    })),
    eligibilityRules: [],
    quarantinePolicy: { enabled: false, rules: [], maximumActiveRecords: 1 },
    recoveryPolicy: { rules: [] },
    limits: EVIDENCE_TRUST_LIMITS_V1,
    diagnosticsPolicyId: "diag",
    redactionPolicyId: "redact",
  });
const claim = (id, bases = [ref(`root-${id}`)]) =>
  createEvidenceClaimV1({
    schemaVersion: 1,
    sourceId: "peer-a",
    sourceKind: "peer",
    causationId: id,
    subject,
    scope,
    criterionId: "c",
    outcome: "satisfied",
    content: null,
    basisReferences: bases,
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
    claimDigest: target.claimId.slice(6),
    disposition,
    confidenceBasisPoints: 10000,
    basisReferences: [],
    observedAt: null,
  });
const challenge = (target, bases = [ref("challenge-root")], kind = "claim") =>
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
    ).slice(kind.length + 1),
    reasonCode: "challenge_unresolved",
    basisReferences: bases,
    observedAt: null,
  });
const evidence = (record) => ({
  schemaVersion: 1,
  kind: "evidence",
  referenceType: "claim",
  referenceId: record.claimId,
  referenceDigest: record.claimId.slice(6),
});

let serial = 0;
function fixture() {
  const configured = policy(),
    policyDigest = digestEvidenceFusionPolicyV1(configured);
  const upstream = createEvidenceTrustDependencyBindingV1({
    schemaVersion: 1,
    bindingName: "upstream",
    bindingVersion: 1,
    parentBindingDigest: null,
    bindingKind: "content_resolver",
    implementationId: "upstream",
    implementationDigest: hex("b"),
    configurationDigest: hex("c"),
    policyDigest,
    subjectMappingDigest: null,
    upstreamBindingDigest: null,
    registeredAtLogicalMs: 0,
    validFromLogicalMs: 0,
    validUntilLogicalMs: null,
  });
  const authority = createEvidenceTrustDependencyBindingV1({
    schemaVersion: 1,
    bindingName: "authority",
    bindingVersion: 1,
    parentBindingDigest: null,
    bindingKind: "causal_authority",
    implementationId: "authority",
    implementationDigest: hex("d"),
    configurationDigest: hex("e"),
    policyDigest,
    subjectMappingDigest: null,
    upstreamBindingDigest: upstream.bindingDigest,
    registeredAtLogicalMs: 0,
    validFromLogicalMs: 0,
    validUntilLogicalMs: null,
  });
  const options = {
    causalAuthorityVerifierRegistry: {
      resolve: (value) =>
        value === authority.bindingDigest
          ? {
              authorityBindingDigest: authority.bindingDigest,
              policyDigest,
              upstreamBindingDigest: upstream.bindingDigest,
              verify: () => true,
            }
          : null,
    },
  };
  let state = createEvidenceTrustStateV1({ stateId: `fixed-${++serial}` });
  const reduce = (input) =>
    (state = reduceEvidenceTrustStateV1(state, input, options).state);
  reduce({
    schemaVersion: 1,
    kind: "policy_registered",
    policy: configured,
    logicalTimeMs: 0,
  });
  reduce({
    schemaVersion: 1,
    kind: "dependency_binding_registered",
    binding: upstream,
    logicalTimeMs: 0,
  });
  reduce({
    schemaVersion: 1,
    kind: "dependency_binding_registered",
    binding: authority,
    logicalTimeMs: 0,
  });
  const admit = (record, logicalTimeMs, certify = true) => {
    reduce({
      schemaVersion: 1,
      kind: "record_admitted",
      record,
      origin: "local",
      originBindingDigest: hex("f"),
      originVerifierBindingDigest: null,
      originProofDigest: null,
      effectiveAtLogicalMs: logicalTimeMs,
      logicalTimeMs,
    });
    const isClaim = "outcome" in record,
      isChallenge = "challengeId" in record;
    if (!certify || (!isClaim && !isChallenge)) return;
    const id = isChallenge ? record.challengeId : record.claimId,
      digest = id.slice(isChallenge ? 10 : 6),
      target = isChallenge
        ? state.records.find(
            (item) =>
              item.recordId === record.targetId &&
              item.recordDigest === record.targetDigest,
          )
        : null,
      targetClaim = !isChallenge
        ? record
        : target?.recordKind === "claim"
          ? target.record
          : state.records.find(
              (item) =>
                item.recordId === target?.record.claimId &&
                item.recordDigest === target?.record.claimDigest,
            )?.record;
    const bases = record.basisReferences.map((basis) =>
      basis.kind === "evidence"
        ? {
            ...basis,
            resolvedDigest: basis.referenceDigest,
            trustedEffectiveAtLogicalMs:
              state.records.find((item) => item.recordId === basis.referenceId)
                ?.effectiveAtLogicalMs ?? logicalTimeMs,
            resolverBindingDigest: null,
            resolutionProofDigest: null,
          }
        : {
            ...basis,
            resolvedDigest: hex("1"),
            trustedEffectiveAtLogicalMs: logicalTimeMs,
            resolverBindingDigest: upstream.bindingDigest,
            resolutionProofDigest: hex("2"),
          },
    );
    reduce({
      schemaVersion: 1,
      kind: "causal_authorization_recorded",
      authorization: {
        schemaVersion: 1,
        recordId: id,
        recordDigest: digest,
        recordKind: isChallenge ? "challenge" : "claim",
        policyDigest,
        criterionId: targetClaim.criterionId,
        subjectDigest: digestSubjectV1(targetClaim.subject),
        scopeDigest: digestScopeV1(scope),
        targetRecordId: target?.recordId ?? null,
        targetRecordDigest: target?.recordDigest ?? null,
        sourceRelation: isChallenge ? "target_author" : "subject_self",
        authorityBindingDigest: authority.bindingDigest,
        authorityProofDigest: hex("3"),
        bases,
      },
      logicalTimeMs,
    });
  };
  const evaluate = (time) =>
    evaluateEvidenceFusionV1(
      state,
      {
        tenantId: scope.tenantId,
        subject,
        scope,
        policyId: configured.policyId,
        policyVersion: configured.policyVersion,
        policyDigest,
        dependencyBindingDigests: deriveApplicableBindingDigests(
          state,
          policyDigest,
          time,
        ),
      },
      time,
    );
  return {
    admit,
    evaluate,
    get state() {
      return state;
    },
  };
}

test("dismissed Challenge releases an evidence basis and sustained Challenge blocks its dependent", () => {
  for (const [disposition, expected] of [
    ["support", "dismissed"],
    ["contradict", "sustained"],
  ]) {
    const f = fixture(),
      x = claim(`x-${disposition}`),
      y = claim(`y-${disposition}`);
    f.admit(x, 1);
    f.admit(y, 1);
    const cx = challenge(x),
      c1 = challenge(y, [evidence(x)]);
    f.admit(cx, 2);
    f.admit(c1, 2);
    f.admit(attestation(x, "peer-b", disposition), 3);
    f.admit(attestation(y, "peer-b"), 3);
    const decision = f.evaluate(4);
    const xResolution = decision.challengeResolutions.find(
      (item) => item.targetId === x.claimId,
    );
    const yResolution = decision.challengeResolutions.find(
      (item) => item.targetId === y.claimId,
    );
    assert.equal(xResolution?.result, expected);
    assert.equal(
      yResolution?.result,
      disposition === "support" ? "dismissed" : "unresolved",
    );
  }
});

test("cycles become unresolved, a challenged Attestation only contributes after dismissal, and unauthorised Challenges do not block", () => {
  const f = fixture(),
    x = claim("cycle-x"),
    y = claim("cycle-y");
  f.admit(x, 1);
  f.admit(y, 1);
  f.admit(challenge(x, [evidence(y)]), 2);
  f.admit(challenge(y, [evidence(x)]), 2);
  const cycle = f.evaluate(3);
  assert.equal(cycle.challengeResolutions.length, 2);
  for (const resolution of cycle.challengeResolutions) {
    assert.equal(resolution.result, "unresolved");
    assert.ok(resolution.reasonCodes.includes("challenge_basis_unavailable"));
    assert.ok(resolution.reasonCodes.includes("challenge_unresolved"));
  }
  const g = fixture(),
    target = claim("attested");
  g.admit(target, 1);
  const supported = attestation(target, "peer-b");
  g.admit(supported, 2);
  const against = challenge(supported, [ref("att-root")], "attestation");
  g.admit(against, 3);
  g.admit(attestation(target, "peer-c"), 4);
  const dismissed = g.evaluate(5);
  assert.ok(dismissed.includedRecordIds.includes(supported.attestationId));
  const h = fixture(),
    unauthTarget = claim("unauth");
  h.admit(unauthTarget, 1);
  const unauth = challenge(unauthTarget);
  h.admit(unauth, 2, false);
  const unauthorized = h.evaluate(3);
  assert.equal(
    unauthorized.challengeResolutions.length,
    0,
    "unauthorised Challenge does not block",
  );
});

test("an Attestation dependency group cannot corroborate a Challenge against itself", () => {
  const f = fixture();
  const target = claim("self-corroboration");
  f.admit(target, 1);
  const challenged = attestation(target, "peer-b");
  f.admit(challenged, 2);
  f.admit(challenge(challenged, [ref("self-root")], "attestation"), 3);
  f.admit(attestation(target, "peer-d"), 4);
  const resolution = f
    .evaluate(5)
    .challengeResolutions.find(
      (item) => item.targetId === challenged.attestationId,
    );
  assert.equal(resolution?.result, "unresolved");
  assert.deepEqual(resolution?.corroboratingGroupIds, []);
});

test("a blocked Attestation releases its dependency-group cap to the next candidate", () => {
  const f = fixture();
  const target = claim("cap-reallocation");
  f.admit(target, 1);
  const older = attestation(target, "peer-b");
  const newer = attestation(target, "peer-d");
  f.admit(older, 2);
  f.admit(newer, 3);
  f.admit(challenge(newer, [ref("cap-root")], "attestation"), 4);
  f.admit(attestation(target, "peer-c", "contradict"), 5);
  const decision = f.evaluate(6);
  assert.equal(
    decision.challengeResolutions.find(
      (item) => item.targetId === newer.attestationId,
    )?.result,
    "sustained",
  );
  const classification = decision.claimClassifications.find(
    (item) => item.claimId === target.claimId,
  );
  assert.equal(classification?.supportWeightBasisPoints, 1000);
  assert.ok(
    decision.includedRecordIds.includes(older.attestationId),
    "the older valid candidate receives the released cap",
  );
});
