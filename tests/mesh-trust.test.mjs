import assert from "node:assert/strict";
import test from "node:test";

import {
  MESH_PEER_SUBJECT_MAPPING_DIGEST_V1,
  createMeshTrustStateEligibilityConfigV1,
  createMeshEvidenceInboundProcessorV1,
  createMeshEvidenceTrustAdapterV1,
  digestMeshTrustStateEligibilityConfigV1,
  encodeMeshTrustObservationV1,
  filterMeshCapabilityMatchesWithTrustV1,
  filterMeshCapabilityMatchesWithTrustStateV1,
  restoreMeshTrustEligibilityRuntimeStateV1,
  validateMeshEvidenceOriginJournalEntryV1,
} from "@agentplat/mesh/trust";
import {
  createStaticMeshKeyResolver,
  createWebCryptoMeshEnvelopeSigner,
} from "@agentplat/mesh-crypto";
import {
  EVIDENCE_TRUST_LIMITS_V1,
  createEvidenceAttestationV1,
  createEvidenceClaimV1,
  createEvidenceFusionPolicyV1,
  createEvidenceTrustDependencyBindingV1,
  createEvidenceTrustSnapshotV1,
  createEvidenceTrustStateV1,
  createTrustObservationV1,
  deriveApplicableBindingDigests,
  digestEvidenceFusionPolicyV1,
  projectEvidenceLifecycleV1,
  reduceEvidenceTrustStateV1,
  sha256TrustBytesV1,
} from "../packages/trust/dist/index.js";

const compatibilitySigner = createWebCryptoMeshEnvelopeSigner({
  signingPolicy: { allowedWireVersions: [0] },
});

test("Mesh Trust filtering only preserves candidates or returns a subset", () => {
  const candidates = Object.freeze([
    Object.freeze({ peerId: "peer-a", capabilities: Object.freeze([]) }),
    Object.freeze({ peerId: "peer-b", capabilities: Object.freeze([]) }),
  ]);
  const resolver = {
    bindingDigest: "a".repeat(64),
    evaluate: (candidate) =>
      candidate.peerId === "peer-a" ? "eligible" : "restricted",
  };
  const observe = filterMeshCapabilityMatchesWithTrustV1(
    candidates,
    "observe",
    resolver,
  );
  assert.deepEqual(observe.matches, candidates);
  assert.deepEqual(
    observe.diagnostics.map((item) => item.status),
    ["eligible", "restricted"],
  );

  const restrict = filterMeshCapabilityMatchesWithTrustV1(
    candidates,
    "restrict",
    resolver,
  );
  assert.deepEqual(restrict.matches, [candidates[0]]);
  assert.equal(restrict.matches.includes(candidates[1]), false);

  const unavailable = filterMeshCapabilityMatchesWithTrustV1(
    candidates,
    "restrict",
    { bindingDigest: "b".repeat(64), evaluate: () => "unavailable" },
  );
  assert.deepEqual(unavailable.matches, []);
  assert.equal(unavailable.unavailable, true);
});

const meshEligibilityScope = {
  schemaVersion: 1,
  kind: "mesh",
  tenantId: "tenant-a",
  meshId: "mesh-a",
};

function meshEligibilityPolicy(minimumScoreBasisPoints = 4000) {
  return createEvidenceFusionPolicyV1({
    schemaVersion: 1,
    policyId: "mesh-eligibility-policy",
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
        decayIntervalMs: 100,
        decayBasisPointsPerInterval: 1,
        uncertaintyGrowthBasisPointsPerInterval: 1,
        minimumRetainedWeightBasisPoints: 1,
        contradictionUncertaintyBasisPointsPerClaim: 1,
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
          allowedBasisReferences: [],
        },
        challengeAuthority: {
          allowedSourceRelations: ["target_author"],
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
        dependencyGroupId: "peer-a-group",
        roles: ["challenge", "claim"],
        maximumWeightBasisPoints: 1000,
        validFromLogicalMs: 0,
        validUntilLogicalMs: 1000,
      },
    ],
    dependencyGroups: [
      {
        dependencyGroupId: "peer-a-group",
        maximumAttestationWeightPerClaimBasisPoints: 1000,
        maximumProfileWeightPerDimensionCriterionBasisPoints: 1000,
      },
    ],
    eligibilityRules: [
      {
        ruleId: "mesh-match",
        maximumProfileAgeMs: 100,
        requirements: [
          {
            dimensionId: "integrity",
            minimumScoreBasisPoints,
            maximumUncertaintyBasisPoints: 10000,
          },
        ],
      },
    ],
    quarantinePolicy: { enabled: false, rules: [], maximumActiveRecords: 1 },
    recoveryPolicy: { rules: [] },
    limits: EVIDENCE_TRUST_LIMITS_V1,
    diagnosticsPolicyId: "diagnostics",
    redactionPolicyId: "redaction",
  });
}

let meshEligibilityFixtureSequence = 0;
function meshEligibilityFixture({
  mode = "restrict",
  minimumScoreBasisPoints = 4000,
} = {}) {
  const policy = meshEligibilityPolicy(minimumScoreBasisPoints);
  const policyDigest = digestEvidenceFusionPolicyV1(policy);
  const rule = policy.eligibilityRules[0];
  const placeholderConfig = {
    schemaVersion: 1,
    mode,
    logicalTimeMs: 0,
    scope: meshEligibilityScope,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    policyDigest,
    maximumProfileAgeMs: rule.maximumProfileAgeMs,
    requirements: rule.requirements,
    subjectMappingDigest: MESH_PEER_SUBJECT_MAPPING_DIGEST_V1,
    meshEligibilityBindingDigest: "a".repeat(64),
    profileResolverBindingDigest: "b".repeat(64),
  };
  const configurationDigest =
    digestMeshTrustStateEligibilityConfigV1(placeholderConfig);
  const profileResolver = createEvidenceTrustDependencyBindingV1({
    schemaVersion: 1,
    bindingName: "mesh-profile-resolver",
    bindingVersion: 1,
    parentBindingDigest: null,
    bindingKind: "profile_resolver",
    implementationId: "mesh-profile-resolver-v1",
    implementationDigest: "c".repeat(64),
    configurationDigest: "d".repeat(64),
    policyDigest,
    subjectMappingDigest: MESH_PEER_SUBJECT_MAPPING_DIGEST_V1,
    upstreamBindingDigest: null,
    registeredAtLogicalMs: 0,
    validFromLogicalMs: 0,
    validUntilLogicalMs: null,
  });
  const meshEligibility = createEvidenceTrustDependencyBindingV1({
    schemaVersion: 1,
    bindingName: "mesh-state-eligibility",
    bindingVersion: 1,
    parentBindingDigest: null,
    bindingKind: "mesh_eligibility",
    implementationId: "mesh-state-eligibility-v1",
    implementationDigest: "e".repeat(64),
    configurationDigest,
    policyDigest,
    subjectMappingDigest: MESH_PEER_SUBJECT_MAPPING_DIGEST_V1,
    upstreamBindingDigest: profileResolver.bindingDigest,
    registeredAtLogicalMs: 0,
    validFromLogicalMs: 0,
    validUntilLogicalMs: null,
  });
  const config = createMeshTrustStateEligibilityConfigV1({
    ...placeholderConfig,
    meshEligibilityBindingDigest: meshEligibility.bindingDigest,
    profileResolverBindingDigest: profileResolver.bindingDigest,
  });
  let state = reduceEvidenceTrustStateV1(
    createEvidenceTrustStateV1({
      stateId: `mesh-eligibility-${mode}-${(meshEligibilityFixtureSequence += 1)}`,
    }),
    {
      schemaVersion: 1,
      kind: "policy_registered",
      policy,
      logicalTimeMs: 0,
    },
  ).state;
  for (const binding of [profileResolver, meshEligibility])
    state = reduceEvidenceTrustStateV1(state, {
      schemaVersion: 1,
      kind: "dependency_binding_registered",
      binding,
      logicalTimeMs: 0,
    }).state;
  const subject = { schemaVersion: 1, kind: "peer", peerId: "peer-a" };
  const request = {
    tenantId: meshEligibilityScope.tenantId,
    subject,
    scope: meshEligibilityScope,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    policyDigest,
    dependencyBindingDigests: deriveApplicableBindingDigests(
      state,
      policyDigest,
      0,
    ),
  };
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "fusion_evaluated",
    request,
    logicalTimeMs: 0,
  }).state;
  const decision = state.fusionDecisions[0];
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: "profile_evaluated",
    fusionDecisionId: decision.fusionDecisionId,
    fusionDecisionDigest: decision.fusionDecisionDigest,
    logicalTimeMs: 0,
  }).state;
  return { state, config, policy, profileResolver, meshEligibility };
}

const meshEligibilityProtector = {
  bindingDigest: "9".repeat(64),
  protect(materialBytes) {
    return {
      algorithmId: "test-sha256",
      keyId: "mesh-eligibility-test-key",
      encoding: "base64url",
      proof: sha256TrustBytesV1(materialBytes),
    };
  },
  verify(materialBytes, proof) {
    return proof.proof === sha256TrustBytesV1(materialBytes);
  },
};

function verifiedMeshEligibilityRuntime(
  trust,
  { generation = 1, previousSnapshotDigest = null } = {},
) {
  const snapshot = createEvidenceTrustSnapshotV1({
    state: trust,
    generation,
    previousSnapshotDigest,
    createdAtLogicalMs: trust.logicalTimeHighWaterMs,
    protector: meshEligibilityProtector,
  });
  const current = Object.freeze({
    schemaVersion: 1,
    identity: Object.freeze({
      tenantId: "tenant-a",
      meshId: "mesh-a",
      peerId: "local-peer",
    }),
    state: Object.freeze({
      authorizationState: Object.freeze({}),
      trust,
      originProofs: Object.freeze({}),
      remoteObservations: Object.freeze({}),
    }),
  });
  const anchor = {
    schemaVersion: 1,
    stateId: snapshot.stateId,
    requiredGeneration: snapshot.generation,
    requiredSnapshotDigest: snapshot.snapshotDigest,
    minimumLogicalHighWaterMs: trust.logicalTimeHighWaterMs,
    protectorBindingDigest: meshEligibilityProtector.bindingDigest,
  };
  return {
    snapshot,
    runtime: restoreMeshTrustEligibilityRuntimeStateV1(
      current,
      snapshot,
      anchor,
      meshEligibilityProtector,
    ),
  };
}

test("state-backed Mesh eligibility binds the exact local profile and only narrows matches", () => {
  const fixture = meshEligibilityFixture();
  const { runtime } = verifiedMeshEligibilityRuntime(fixture.state);
  const candidate = {
    peerId: "peer-a",
    capabilities: [{ capabilityId: "declared-only" }],
  };
  const before = structuredClone(fixture.state);
  const eligible = filterMeshCapabilityMatchesWithTrustStateV1(
    [candidate],
    runtime,
    fixture.config,
  );
  assert.deepEqual(eligible.matches, [candidate]);
  assert.equal(eligible.matches[0], candidate);
  assert.equal(eligible.diagnostics[0].disposition, "eligible");
  assert.match(
    eligible.diagnostics[0].eligibilityDecisionId,
    /^eligibility-decision:[0-9a-f]{64}$/u,
  );
  assert.equal(Object.isFrozen(candidate), false);
  assert.equal(Object.isFrozen(candidate.capabilities), false);
  assert.equal(Object.isFrozen(candidate.capabilities[0]), false);
  assert.deepEqual(fixture.state, before);

  const unknown = Object.freeze({
    peerId: "peer-b",
    capabilities: candidate.capabilities,
  });
  const mixed = filterMeshCapabilityMatchesWithTrustStateV1(
    [candidate, unknown],
    runtime,
    fixture.config,
  );
  assert.deepEqual(mixed.matches, []);
  assert.equal(mixed.unavailable, true);
  assert.equal(mixed.diagnostics[1].disposition, "unavailable");
  assert.deepEqual(mixed.diagnostics[1].reasonCodes, ["profile_unavailable"]);
  const unauthenticated = filterMeshCapabilityMatchesWithTrustStateV1(
    [candidate],
    structuredClone(runtime),
    fixture.config,
  );
  assert.deepEqual(unauthenticated.matches, []);
  assert.equal(unauthenticated.unavailable, true);
  assert.deepEqual(unauthenticated.diagnostics[0].reasonCodes, [
    "state_conflict",
  ]);
  assert.throws(() =>
    filterMeshCapabilityMatchesWithTrustStateV1(
      [candidate, candidate],
      runtime,
      fixture.config,
    ),
  );
});

test("state-backed Mesh eligibility preserves observe mode and fails closed on stale or rebound dependencies", () => {
  const fixture = meshEligibilityFixture({ mode: "observe" });
  const verified = verifiedMeshEligibilityRuntime(fixture.state);
  const candidates = Object.freeze([
    Object.freeze({ peerId: "peer-a", capabilities: Object.freeze([]) }),
    Object.freeze({ peerId: "peer-b", capabilities: Object.freeze([]) }),
  ]);
  const observed = filterMeshCapabilityMatchesWithTrustStateV1(
    candidates,
    verified.runtime,
    fixture.config,
  );
  assert.equal(observed.matches[0], candidates[0]);
  assert.equal(observed.matches[1], candidates[1]);
  assert.deepEqual(
    observed.diagnostics.map((item) => item.disposition),
    ["eligible", "unavailable"],
  );

  const unauthenticatedFutureTime = filterMeshCapabilityMatchesWithTrustStateV1(
    [candidates[0]],
    verified.runtime,
    { ...fixture.config, logicalTimeMs: 101 },
  );
  assert.deepEqual(unauthenticatedFutureTime.diagnostics[0].reasonCodes, [
    "state_conflict",
  ]);
  const advanced = reduceEvidenceTrustStateV1(fixture.state, {
    schemaVersion: 1,
    kind: "advance_logical_time",
    logicalTimeMs: 101,
  }).state;
  const advancedVerified = verifiedMeshEligibilityRuntime(advanced, {
    generation: 2,
    previousSnapshotDigest: verified.snapshot.snapshotDigest,
  });
  const stale = filterMeshCapabilityMatchesWithTrustStateV1(
    [candidates[0]],
    advancedVerified.runtime,
    { ...fixture.config, logicalTimeMs: 101 },
  );
  assert.equal(stale.diagnostics[0].disposition, "unavailable");
  assert.deepEqual(stale.diagnostics[0].reasonCodes, ["profile_stale"]);
  const rewound = filterMeshCapabilityMatchesWithTrustStateV1(
    [candidates[0]],
    advancedVerified.runtime,
    fixture.config,
  );
  assert.deepEqual(rewound.diagnostics[0].reasonCodes, ["state_conflict"]);
  assert.throws(() => verifiedMeshEligibilityRuntime(fixture.state));

  const rotationFixture = meshEligibilityFixture({ mode: "observe" });
  const rotationVerified = verifiedMeshEligibilityRuntime(
    rotationFixture.state,
  );
  const { bindingDigest: _previousResolverDigest, ...profileResolverBody } =
    rotationFixture.profileResolver;
  const replacement = createEvidenceTrustDependencyBindingV1({
    ...profileResolverBody,
    bindingVersion: 2,
    parentBindingDigest: rotationFixture.profileResolver.bindingDigest,
    registeredAtLogicalMs: 1,
    validFromLogicalMs: 1,
  });
  const rotated = reduceEvidenceTrustStateV1(rotationFixture.state, {
    schemaVersion: 1,
    kind: "dependency_binding_registered",
    binding: replacement,
    logicalTimeMs: 1,
  }).state;
  const rotatedRuntime = verifiedMeshEligibilityRuntime(rotated, {
    generation: 2,
    previousSnapshotDigest: rotationVerified.snapshot.snapshotDigest,
  }).runtime;
  const rebound = filterMeshCapabilityMatchesWithTrustStateV1(
    [candidates[0]],
    rotatedRuntime,
    { ...rotationFixture.config, logicalTimeMs: 1 },
  );
  assert.equal(rebound.unavailable, true);
  assert.deepEqual(rebound.matches, [candidates[0]]);
  assert.deepEqual(rebound.diagnostics[0].reasonCodes, [
    "dependency_binding_invalid",
  ]);
  const supersededRuntime = filterMeshCapabilityMatchesWithTrustStateV1(
    [candidates[0]],
    rotationVerified.runtime,
    { ...rotationFixture.config, logicalTimeMs: 0 },
  );
  assert.deepEqual(supersededRuntime.matches, [candidates[0]]);
  assert.deepEqual(supersededRuntime.diagnostics[0].reasonCodes, [
    "state_conflict",
  ]);
  assert.throws(() => verifiedMeshEligibilityRuntime(rotationFixture.state));

  assert.throws(() =>
    createMeshTrustStateEligibilityConfigV1({
      ...fixture.config,
      subjectMappingDigest: "f".repeat(64),
    }),
  );
});

test("state-backed Mesh restrict mode excludes a policy-restricted profile without auto-selection", () => {
  const fixture = meshEligibilityFixture({ minimumScoreBasisPoints: 6000 });
  const { runtime } = verifiedMeshEligibilityRuntime(fixture.state);
  const candidate = Object.freeze({
    peerId: "peer-a",
    capabilities: Object.freeze([]),
  });
  const result = filterMeshCapabilityMatchesWithTrustStateV1(
    [candidate],
    runtime,
    fixture.config,
  );
  assert.deepEqual(result.matches, []);
  assert.equal(result.unavailable, false);
  assert.equal(result.diagnostics[0].disposition, "restricted");
  assert.deepEqual(result.diagnostics[0].reasonCodes, [
    "eligibility_restricted",
  ]);
});

test("Mesh Trust rejects a direct payload before it can reach the adapter", async () => {
  let called = false;
  const processor = createMeshEvidenceInboundProcessorV1({
    resolver: { resolve: () => undefined },
    cryptoPolicy: { allowedAlgorithms: ["Ed25519"] },
    adapter: {
      bindingDigest: "a".repeat(64),
      prepare: () => ({ accepted: false, code: "authorization_rejected" }),
      process: () => {
        called = true;
        throw new Error("must not be called");
      },
    },
    originVerifierBindingDigest: "b".repeat(64),
  });
  const state = {
    schemaVersion: 1,
    identity: { tenantId: "tenant-a", meshId: "mesh-a", peerId: "peer-b" },
    state: Object.freeze({}),
  };
  const decision = await processor.process(state, {
    envelope: { type: "evidence.claim" },
    verifiedAt: "2026-07-30T00:00:00.000Z",
    receivedAt: 1,
  });
  assert.equal(decision.accepted, false);
  assert.equal(called, false);
});

async function signedClaim(messageId = "AAAAAAAAAAAAAAAAAAAAAQ") {
  const keys = await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ]);
  const claim = createEvidenceClaimV1({
    schemaVersion: 1,
    sourceId: "peer-a",
    sourceKind: "peer",
    causationId: null,
    subject: { schemaVersion: 1, kind: "peer", peerId: "peer-a" },
    scope: {
      schemaVersion: 1,
      kind: "mesh",
      tenantId: "tenant-a",
      meshId: "mesh-a",
    },
    criterionId: "criterion-a",
    outcome: "satisfied",
    content: null,
    basisReferences: [],
    observedAt: null,
  });
  const envelope = await compatibilitySigner.sign({
    envelope: {
      protocol: "agentplat.mesh",
      wireVersion: 0,
      messageId,
      tenantId: "tenant-a",
      meshId: "mesh-a",
      type: "evidence.claim",
      sender: { peerId: "peer-a", instanceId: "instance-a" },
      audience: { kind: "peer", peerId: "peer-b" },
      sequence: 1,
      sentAt: "2026-07-30T00:00:00.000Z",
      expiresAt: "2026-07-30T00:04:00.000Z",
      payload: {
        type: "evidence.claim",
        claimId: claim.claimId,
        subject: { kind: "peer", peerId: "peer-a" },
        scope: { kind: "mesh" },
        criterionId: "criterion-a",
        outcome: "satisfied",
        assertionDigest: claim.assertionDigest,
        content: null,
        basisReferences: [],
        observedAt: null,
      },
      proof: { algorithm: "Ed25519", keyId: "key-a" },
    },
    privateKey: keys.privateKey,
  });
  const resolver = createStaticMeshKeyResolver([
    {
      tenantId: "tenant-a",
      meshId: "mesh-a",
      peerId: "peer-a",
      keyId: "key-a",
      algorithm: "Ed25519",
      publicKey: keys.publicKey,
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
      status: "active",
    },
  ]);
  return { claim, envelope, keys, resolver };
}

async function signTrustPayload(keys, messageId, sequence, payload) {
  return compatibilitySigner.sign({
    envelope: {
      protocol: "agentplat.mesh",
      wireVersion: 0,
      messageId,
      tenantId: "tenant-a",
      meshId: "mesh-a",
      type: payload.type,
      sender: { peerId: "peer-a", instanceId: "instance-a" },
      audience: { kind: "peer", peerId: "peer-b" },
      sequence,
      sentAt: "2026-07-30T00:00:00.000Z",
      expiresAt: "2026-07-30T00:04:00.000Z",
      payload,
      proof: { algorithm: "Ed25519", keyId: "key-a" },
    },
    privateKey: keys.privateKey,
  });
}

test("signed Mesh Evidence reaches a stateful adapter only after crypto, scope and replay checks", async () => {
  const { envelope, resolver } = await signedClaim();
  const seen = new Set();
  let commits = 0;
  const processor = createMeshEvidenceInboundProcessorV1({
    resolver,
    cryptoPolicy: { allowedAlgorithms: ["Ed25519"] },
    originVerifierBindingDigest: "c".repeat(64),
    adapter: {
      bindingDigest: "d".repeat(64),
      prepare: ({ envelope: verified, receivedAt }) => {
        if (
          verified.audience.kind !== "peer" ||
          verified.audience.peerId !== "peer-b"
        )
          return { accepted: false, code: "authorization_rejected" };
        if (seen.has(verified.messageId))
          return { accepted: false, code: "replay_rejected" };
        return {
          accepted: true,
          admissionStateDigest: "e".repeat(64),
          coordinationAuthorityDigests: ["f".repeat(64)],
          replayStateDigest: "a".repeat(64),
          observationCorrelated: false,
          effectiveAtLogicalMs: receivedAt,
        };
      },
      process: ({ envelope: verified, state }) => {
        seen.add(verified.messageId);
        commits += 1;
        return {
          accepted: true,
          duplicate: false,
          state: Object.freeze({ ...state, commits }),
        };
      },
    },
  });
  const initial = {
    schemaVersion: 1,
    identity: { tenantId: "tenant-a", meshId: "mesh-a", peerId: "peer-b" },
    state: Object.freeze({ commits: 0 }),
  };
  const request = {
    envelope,
    verifiedAt: "2026-07-30T00:00:01.000Z",
    receivedAt: 1,
  };
  const accepted = await processor.process(initial, request);
  assert.equal(accepted.accepted, true, JSON.stringify(accepted));
  assert.equal(commits, 1);
  const replay = await processor.process(accepted.state, request);
  assert.deepEqual(replay.accepted, false);
  assert.equal(replay.code, "replay_rejected");
  assert.equal(commits, 1);

  const forged = {
    ...envelope,
    proof: {
      ...envelope.proof,
      value: `${envelope.proof.value.slice(0, -1)}A`,
    },
  };
  const forgedResult = await processor.process(initial, {
    ...request,
    envelope: forged,
  });
  assert.equal(forgedResult.accepted, false);
  assert.equal(commits, 1);
  const wrongTenant = await processor.process(
    { ...initial, identity: { ...initial.identity, tenantId: "tenant-b" } },
    request,
  );
  assert.equal(wrongTenant.accepted, false);
});

test("concrete adapter rolls back provisional replay state when Trust rejects", async () => {
  const { envelope, resolver } = await signedClaim("AAAAAAAAAAAAAAAAAAAAAg");
  const authorization = {
    prepare: ({ authorizationState, receivedAt }) => ({
      accepted: true,
      nextAuthorizationState: { attempts: authorizationState.attempts + 1 },
      admissionStateDigest: "a".repeat(64),
      coordinationAuthorityDigests: [],
      replayStateDigest: "b".repeat(64),
      observationCorrelated: false,
      effectiveAtLogicalMs: receivedAt,
    }),
  };
  const initialComposite = Object.freeze({
    authorizationState: Object.freeze({ attempts: 0 }),
    trust: createEvidenceTrustStateV1({ stateId: "trust-mesh-atomic" }),
    originProofs: Object.freeze({}),
    remoteObservations: Object.freeze({}),
  });
  const state = {
    schemaVersion: 1,
    identity: { tenantId: "tenant-a", meshId: "mesh-a", peerId: "peer-b" },
    state: initialComposite,
  };
  const rejected = createMeshEvidenceInboundProcessorV1({
    resolver,
    cryptoPolicy: { allowedAlgorithms: ["Ed25519"] },
    originVerifierBindingDigest: "e".repeat(64),
    adapter: createMeshEvidenceTrustAdapterV1(
      "d".repeat(64),
      "c".repeat(64),
      authorization,
    ),
  });
  const request = {
    envelope,
    verifiedAt: "2026-07-30T00:00:01.000Z",
    receivedAt: 3,
  };
  const failed = await rejected.process(state, request);
  assert.equal(failed.accepted, false);
  assert.equal(failed.code, "trust_transition_rejected");
  assert.equal(failed.state, state);
  assert.equal(failed.state.state.authorizationState.attempts, 0);
  assert.throws(
    () =>
      createMeshEvidenceTrustAdapterV1(
        "not-a-digest",
        "c".repeat(64),
        authorization,
      ),
    /bindings/u,
  );

  const concreteAdapter = createMeshEvidenceTrustAdapterV1(
    "d".repeat(64),
    "c".repeat(64),
    authorization,
  );
  const acceptedProcessor = createMeshEvidenceInboundProcessorV1({
    resolver,
    cryptoPolicy: { allowedAlgorithms: ["Ed25519"] },
    originVerifierBindingDigest: "c".repeat(64),
    adapter: concreteAdapter,
  });
  const accepted = await acceptedProcessor.process(state, request);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.state.state.authorizationState.attempts, 1);
  assert.equal(accepted.state.state.trust.records.length, 1);
  const [originEntry] = Object.values(accepted.state.state.originProofs);
  assert.equal(validateMeshEvidenceOriginJournalEntryV1(originEntry), true);
  assert.equal(
    JSON.parse(originEntry.canonicalSignedEnvelope).proof.value,
    envelope.proof.value,
  );
  assert.equal(
    validateMeshEvidenceOriginJournalEntryV1({
      ...originEntry,
      canonicalSignedEnvelope: `${originEntry.canonicalSignedEnvelope} `,
    }),
    false,
  );
  const directBypass = concreteAdapter.process({ state: initialComposite });
  assert.equal(directBypass.accepted, false);
  assert.equal(directBypass.code, "trust_transition_rejected");
  assert.equal(directBypass.state, initialComposite);

  const rejectingAdapter = createMeshEvidenceTrustAdapterV1(
    "d".repeat(64),
    "c".repeat(64),
    { prepare: () => ({ accepted: false, code: "authorization_rejected" }) },
  );
  const mismatchedWrapper = createMeshEvidenceInboundProcessorV1({
    resolver,
    cryptoPolicy: { allowedAlgorithms: ["Ed25519"] },
    originVerifierBindingDigest: "c".repeat(64),
    adapter: {
      bindingDigest: rejectingAdapter.bindingDigest,
      prepare: concreteAdapter.prepare,
      process: rejectingAdapter.process,
    },
  });
  const bypassedAuthorization = await mismatchedWrapper.process(state, request);
  assert.equal(bypassedAuthorization.accepted, false);
  assert.equal(bypassedAuthorization.code, "trust_transition_rejected");
  assert.equal(bypassedAuthorization.state, state);
});

test("signed Attestation can arrive before its Claim and later becomes active", async () => {
  const {
    claim,
    envelope: claimEnvelope,
    keys,
    resolver,
  } = await signedClaim("AAAAAAAAAAAAAAAAAAAABQ");
  const claimDigest = claim.claimId.slice("claim:".length);
  const attestation = createEvidenceAttestationV1({
    schemaVersion: 1,
    sourceId: "peer-a",
    sourceKind: "peer",
    causationId: null,
    scope: claim.scope,
    claimId: claim.claimId,
    claimDigest,
    disposition: "support",
    confidenceBasisPoints: 10_000,
    basisReferences: [],
    observedAt: null,
  });
  const attestationEnvelope = await signTrustPayload(
    keys,
    "AAAAAAAAAAAAAAAAAAAABg",
    2,
    {
      type: "evidence.attest",
      attestationId: attestation.attestationId,
      scope: { kind: "mesh" },
      claimId: claim.claimId,
      claimDigest,
      disposition: "support",
      confidenceBasisPoints: 10_000,
      basisReferences: [],
      observedAt: null,
    },
  );
  const authorization = {
    prepare: ({ authorizationState, receivedAt }) => {
      let correlationReads = 0;
      return Object.defineProperty(
        {
          accepted: true,
          nextAuthorizationState: {
            accepted: authorizationState.accepted + 1,
          },
          admissionStateDigest: "a".repeat(64),
          coordinationAuthorityDigests: [],
          replayStateDigest: "b".repeat(64),
          effectiveAtLogicalMs: receivedAt,
        },
        "observationCorrelated",
        {
          enumerable: true,
          get: () => {
            if (correlationReads++ === 0) return false;
            throw new Error("preparation was read more than once");
          },
        },
      );
    },
  };
  const processor = createMeshEvidenceInboundProcessorV1({
    resolver,
    cryptoPolicy: { allowedAlgorithms: ["Ed25519"] },
    originVerifierBindingDigest: "c".repeat(64),
    adapter: createMeshEvidenceTrustAdapterV1(
      "d".repeat(64),
      "c".repeat(64),
      authorization,
    ),
  });
  const initial = {
    schemaVersion: 1,
    identity: { tenantId: "tenant-a", meshId: "mesh-a", peerId: "peer-b" },
    state: Object.freeze({
      authorizationState: Object.freeze({ accepted: 0 }),
      trust: createEvidenceTrustStateV1({ stateId: "trust-mesh-reorder" }),
      originProofs: Object.freeze({}),
      remoteObservations: Object.freeze({}),
    }),
  };
  const pending = await processor.process(initial, {
    envelope: attestationEnvelope,
    verifiedAt: "2026-07-30T00:00:01.000Z",
    receivedAt: 6,
  });
  assert.equal(pending.accepted, true, JSON.stringify(pending));
  assert.equal(
    projectEvidenceLifecycleV1(pending.state.state.trust).records[0].status,
    "pending",
  );
  const resolved = await processor.process(pending.state, {
    envelope: claimEnvelope,
    verifiedAt: "2026-07-30T00:00:01.000Z",
    receivedAt: 7,
  });
  assert.equal(resolved.accepted, true, JSON.stringify(resolved));
  const statuses = projectEvidenceLifecycleV1(
    resolved.state.state.trust,
  ).records.map((record) => record.status);
  assert.deepEqual(statuses, ["active", "active"]);
  assert.equal(resolved.state.state.authorizationState.accepted, 2);
});

test("signed TrustObservation stays isolated from local Evidence and Fusion state", async () => {
  const { claim, envelope, keys, resolver } = await signedClaim(
    "AAAAAAAAAAAAAAAAAAAABw",
  );
  const authorization = {
    prepare: ({ authorizationState, receivedAt }) => {
      let correlationReads = 0;
      return Object.defineProperty(
        {
          accepted: true,
          nextAuthorizationState: {
            accepted: authorizationState.accepted + 1,
          },
          admissionStateDigest: "a".repeat(64),
          coordinationAuthorityDigests: [],
          replayStateDigest: "b".repeat(64),
          effectiveAtLogicalMs: receivedAt,
        },
        "observationCorrelated",
        {
          enumerable: true,
          get: () => {
            if (correlationReads++ === 0) return false;
            throw new Error("preparation was read more than once");
          },
        },
      );
    },
  };
  const processor = createMeshEvidenceInboundProcessorV1({
    resolver,
    cryptoPolicy: { allowedAlgorithms: ["Ed25519"] },
    originVerifierBindingDigest: "c".repeat(64),
    adapter: createMeshEvidenceTrustAdapterV1(
      "d".repeat(64),
      "c".repeat(64),
      authorization,
    ),
  });
  const initial = {
    schemaVersion: 1,
    identity: { tenantId: "tenant-a", meshId: "mesh-a", peerId: "peer-b" },
    state: Object.freeze({
      authorizationState: Object.freeze({ accepted: 0 }),
      trust: createEvidenceTrustStateV1({ stateId: "trust-mesh-observation" }),
      originProofs: Object.freeze({}),
      remoteObservations: Object.freeze({}),
    }),
  };
  const admitted = await processor.process(initial, {
    envelope,
    verifiedAt: "2026-07-30T00:00:01.000Z",
    receivedAt: 8,
  });
  assert.equal(admitted.accepted, true, JSON.stringify(admitted));
  const trustBefore = admitted.state.state.trust;
  const observation = createTrustObservationV1({
    schemaVersion: 1,
    observerId: "peer-a",
    observerKind: "peer",
    causationId: null,
    subject: claim.subject,
    scope: claim.scope,
    policyId: "policy-a",
    policyVersion: 1,
    policyDigest: "e".repeat(64),
    profileDigest: "f".repeat(64),
    fusionDecisionDigest: "9".repeat(64),
    dimensionId: "integrity",
    scoreBand: "high",
    uncertaintyBand: "low",
    disposition: "eligible",
    evidenceIds: [claim.claimId],
    observedAt: "2026-07-30T00:00:00.000Z",
    validUntil: "2026-07-30T00:01:00.000Z",
    reasonCodes: ["accepted"],
  });
  const observationEnvelope = await signTrustPayload(
    keys,
    "AAAAAAAAAAAAAAAAAAAACA",
    2,
    encodeMeshTrustObservationV1(observation),
  );
  const observed = await processor.process(admitted.state, {
    envelope: observationEnvelope,
    verifiedAt: "2026-07-30T00:00:01.000Z",
    receivedAt: 9,
  });
  assert.equal(observed.accepted, true, JSON.stringify(observed));
  assert.equal(observed.observation, true);
  assert.equal(observed.state.state.trust, trustBefore);
  assert.equal(observed.state.state.trust.records.length, 1);
  assert.equal(observed.state.state.trust.fusionDecisions.length, 0);
  assert.equal(observed.state.state.authorizationState.accepted, 2);
  assert.equal(
    observed.state.state.remoteObservations[observation.observationId]
      .correlated,
    false,
  );
});

test("throwing or malformed construction-bound preparation preserves state", async () => {
  const { envelope, resolver } = await signedClaim("AAAAAAAAAAAAAAAAAAAAAw");
  const state = {
    schemaVersion: 1,
    identity: { tenantId: "tenant-a", meshId: "mesh-a", peerId: "peer-b" },
    state: Object.freeze({ marker: 1 }),
  };
  for (const prepare of [
    () => null,
    () =>
      Object.defineProperty({}, "accepted", {
        get: () => {
          throw new Error("closed");
        },
      }),
    () => {
      throw new Error("closed");
    },
    ({ receivedAt }) => ({
      accepted: true,
      admissionStateDigest: "not-a-digest",
      coordinationAuthorityDigests: [],
      replayStateDigest: "a".repeat(64),
      observationCorrelated: false,
      effectiveAtLogicalMs: receivedAt,
    }),
    ({ receivedAt }) => ({
      accepted: true,
      admissionStateDigest: "d".repeat(64),
      coordinationAuthorityDigests: [],
      replayStateDigest: "e".repeat(64),
      observationCorrelated: "false",
      effectiveAtLogicalMs: receivedAt,
    }),
  ]) {
    const processor = createMeshEvidenceInboundProcessorV1({
      resolver,
      cryptoPolicy: { allowedAlgorithms: ["Ed25519"] },
      originVerifierBindingDigest: "b".repeat(64),
      adapter: {
        bindingDigest: "c".repeat(64),
        prepare,
        process: () => {
          throw new Error("must not commit");
        },
      },
    });
    const result = await processor.process(state, {
      envelope,
      verifiedAt: "2026-07-30T00:00:01.000Z",
      receivedAt: 4,
    });
    assert.equal(result.accepted, false);
    assert.equal(result.state, state);
  }
});

test("throwing or malformed adapter transitions preserve state", async () => {
  const { envelope, resolver } = await signedClaim("AAAAAAAAAAAAAAAAAAAABA");
  const state = {
    schemaVersion: 1,
    identity: { tenantId: "tenant-a", meshId: "mesh-a", peerId: "peer-b" },
    state: Object.freeze({ marker: 1 }),
  };
  const prepare = ({ receivedAt }) => ({
    accepted: true,
    admissionStateDigest: "a".repeat(64),
    coordinationAuthorityDigests: [],
    replayStateDigest: "b".repeat(64),
    observationCorrelated: false,
    effectiveAtLogicalMs: receivedAt,
  });
  for (const process of [
    () => {
      throw new Error("closed");
    },
    () => ({ accepted: true, duplicate: "false", state: { marker: 2 } }),
    () => ({
      accepted: false,
      code: "trust_transition_rejected",
      state: Object.freeze({ marker: 1 }),
    }),
  ]) {
    const processor = createMeshEvidenceInboundProcessorV1({
      resolver,
      cryptoPolicy: { allowedAlgorithms: ["Ed25519"] },
      originVerifierBindingDigest: "c".repeat(64),
      adapter: { bindingDigest: "d".repeat(64), prepare, process },
    });
    const result = await processor.process(state, {
      envelope,
      verifiedAt: "2026-07-30T00:00:01.000Z",
      receivedAt: 5,
    });
    assert.equal(result.accepted, false);
    assert.equal(result.code, "trust_transition_rejected");
    assert.equal(result.state, state);
  }
});
