import assert from "node:assert/strict";
import test from "node:test";
import { createStaticMeshKeyResolver } from "../../mesh-crypto/dist/index.js";
import { MESH_SIGNATURE_ALGORITHM } from "../../mesh-protocol/dist/index.js";
import {
  EVIDENCE_TRUST_LIMITS_V1,
  createEvidenceFusionPolicyV1,
  createEvidenceTrustStateV1,
  createQuarantineRecoveryDecisionV1,
  createTrustEligibilityRequestV1,
  digestEvidenceFusionPolicyV1,
  digestScopeV1,
  digestSubjectV1,
  digestTrustEligibilityDecisionV1,
  evaluateTrustEligibilityV1,
  reduceEvidenceTrustStateV1,
} from "../../trust/dist/index.js";
import {
  CollectiveAgreementClientV1,
  CollectiveAgreementPeerV1,
  InMemoryCollectiveAgreementRepositoryV1,
  InMemoryCollectiveAgreementTransportV1,
  createCollectiveAgreementMembershipV1,
} from "../dist/agreement.js";
import {
  InMemoryCollectiveTrustDecisionRepositoryV1,
  applyCollectiveTrustCommitV1,
  collectiveTrustSlotIdV1,
  createCollectiveTrustAgreementSemanticPortV1,
  createCollectiveTrustCandidateV1,
  createCollectiveTrustCertificationPortV1,
  createCollectiveTrustEligibilityFilterV1,
  createCollectiveTrustInferenceEligibilityResolverV1,
  createCollectiveTrustMeshEligibilityResolverV1,
  evaluateCollectiveTrustGateV1,
  reconstructCertifiedCollectiveTrustDecisionV1,
  validateCollectiveTrustCandidateV1,
} from "../dist/trust-consensus.js";
import { createCertifiedCollectiveTrustDecisionV1 } from "../dist/trust-consensus-codec.js";

const wallTime = "2030-01-01T00:00:00.000Z";
const subject = { schemaVersion: 1, kind: "peer", peerId: "subject.1" };
const scope = {
  schemaVersion: 1,
  kind: "standalone",
  tenantId: "tenant.1",
  namespace: "collective-trust",
  scopeId: "mission.1",
};

test("four validators certify a content-free Trust decision and replay reconstructs it", async () => {
  const trust = trustFixture();
  const repository = new InMemoryCollectiveTrustDecisionRepositoryV1();
  const candidate = await createCollectiveTrustCandidateV1({
    tenantId: "tenant.1",
    profile: trust.profile,
    fusionDecision: trust.fusionDecision,
    eligibilityDecision: trust.eligibilityDecision,
    previousCertifiedDecisionDigest: null,
    validUntilLogicalMs: 500,
  });
  const network = await agreementFixture(repository);
  const certification = certificationPort(network, repository);
  const decision = await certification.certify({
    candidate,
    logicalTimeMs: 100,
  });
  assert.ok(decision);
  assert.equal(decision.disposition, "eligible");
  assert.deepEqual(decision.witnessPeerIds, ["p0", "p1", "p2", "p3"]);
  assert.equal(decision.membershipEpoch, 1);
  assert.equal(
    (await repository.head(headRequest(candidate))).decisionDigest,
    decision.decisionDigest,
  );
  const commit = await network.repositories.p0.getCommit({
    policyDomainId: "policy.1",
    slotId: collectiveTrustSlotIdV1(candidate),
    height: 1,
  });
  assert.ok(commit);
  const replay = await reconstructCertifiedCollectiveTrustDecisionV1({
    policyDomainId: "policy.1",
    candidate,
    previousDecision: null,
    commit,
    membership: network.membership,
    resolver: network.resolver,
    verifiedAt: wallTime,
  });
  assert.deepEqual(replay, decision);
  const restartedRepository = new InMemoryCollectiveTrustDecisionRepositoryV1();
  assert.deepEqual(
    await applyCollectiveTrustCommitV1({
      policyDomainId: "policy.1",
      candidate,
      commit,
      membership: network.membership,
      resolver: network.resolver,
      verifiedAt: wallTime,
      repository: restartedRepository,
    }),
    decision,
  );
  assert.equal(
    (await restartedRepository.head(headRequest(candidate))).decisionDigest,
    decision.decisionDigest,
  );
  assert.equal(
    await repository.save({
      decision,
      expectedHeadDigest: null,
    }),
    "duplicate",
  );
});

test("successors bind both the decision head and prior agreement commit", async () => {
  const trust = trustFixture();
  const repository = new InMemoryCollectiveTrustDecisionRepositoryV1();
  const network = await agreementFixture(repository);
  const certification = certificationPort(network, repository);
  const firstCandidate = await createCollectiveTrustCandidateV1({
    tenantId: "tenant.1",
    profile: trust.profile,
    fusionDecision: trust.fusionDecision,
    eligibilityDecision: trust.eligibilityDecision,
    previousCertifiedDecisionDigest: null,
    validUntilLogicalMs: 500,
  });
  const first = await certification.certify({
    candidate: firstCandidate,
    logicalTimeMs: 100,
  });
  assert.ok(first);
  const secondCandidate = await createCollectiveTrustCandidateV1({
    tenantId: "tenant.1",
    profile: trust.profile,
    fusionDecision: trust.fusionDecision,
    eligibilityDecision: trust.eligibilityDecision,
    previousCertifiedDecisionDigest: first.decisionDigest,
    validUntilLogicalMs: 600,
  });
  const second = await certification.certify({
    candidate: secondCandidate,
    logicalTimeMs: 100,
  });
  assert.ok(second);
  assert.equal(second.previousCertifiedDecisionDigest, first.decisionDigest);
  assert.deepEqual(
    (
      await repository.list({
        ...headRequest(secondCandidate),
        maximumCount: 8,
      })
    ).map((item) => item.decisionDigest),
    [first.decisionDigest, second.decisionDigest],
  );
  const secondCommit = await network.repositories.p0.getCommit({
    policyDomainId: "policy.1",
    slotId: collectiveTrustSlotIdV1(secondCandidate),
    height: 2,
  });
  assert.equal(
    secondCommit.value.previousCommitDigest,
    first.sourceCommitDigest,
  );
  assert.equal(
    await reconstructCertifiedCollectiveTrustDecisionV1({
      policyDomainId: "policy.1",
      candidate: secondCandidate,
      previousDecision: null,
      commit: secondCommit,
      membership: network.membership,
      resolver: network.resolver,
      verifiedAt: wallTime,
    }),
    null,
  );
});

test("semantic validation rejects tamper, stale predecessor and local unavailability", async () => {
  const trust = trustFixture();
  const repository = new InMemoryCollectiveTrustDecisionRepositoryV1();
  const candidate = await createCollectiveTrustCandidateV1({
    tenantId: "tenant.1",
    profile: trust.profile,
    fusionDecision: trust.fusionDecision,
    eligibilityDecision: trust.eligibilityDecision,
    previousCertifiedDecisionDigest: null,
    validUntilLogicalMs: 500,
  });
  await assert.rejects(() =>
    validateCollectiveTrustCandidateV1({
      ...candidate,
      subjectDigest: "f".repeat(64),
    }),
  );
  await assert.rejects(() =>
    validateCollectiveTrustCandidateV1({ ...candidate, rawEvidence: "secret" }),
  );
  const semantic = createCollectiveTrustAgreementSemanticPortV1({
    policyDomainId: "policy.1",
    heads: repository,
    candidates: {
      validate: async () => ({
        accepted: false,
        reasonCode: "local_candidate_unavailable",
      }),
    },
  });
  const value = {
    schemaVersion: 1,
    kind: "trust_decision",
    valueId: candidate.candidateId,
    previousCommitDigest: null,
    payload: candidate,
    valueDigest: agreementDigest("a"),
  };
  assert.deepEqual(
    await semantic.evaluate({
      coordinate: {
        policyDomainId: "policy.1",
        slotId: collectiveTrustSlotIdV1(candidate),
        height: 1,
        round: 0,
        membershipEpoch: 1,
        membershipConfigurationDigest: agreementDigest("b"),
      },
      proposalId: "proposal.1",
      proposerPeerId: "p0",
      value,
      logicalTimeMs: 100,
    }),
    { accepted: false, reasonCode: "local_candidate_unavailable" },
  );
  assert.equal(
    (
      await semantic.evaluate({
        coordinate: {
          policyDomainId: "policy.1",
          slotId: "wrong.slot",
          height: 1,
          round: 0,
          membershipEpoch: 1,
          membershipConfigurationDigest: agreementDigest("b"),
        },
        proposalId: "proposal.1",
        proposerPeerId: "p0",
        value,
        logicalTimeMs: 100,
      })
    ).reasonCode,
    "trust_candidate_binding_invalid",
  );
});

test("the effective gate can only preserve or narrow local eligibility", async () => {
  const trust = trustFixture();
  const eligibleCandidate = await createCollectiveTrustCandidateV1({
    tenantId: "tenant.1",
    profile: trust.profile,
    fusionDecision: trust.fusionDecision,
    eligibilityDecision: trust.eligibilityDecision,
    previousCertifiedDecisionDigest: null,
    validUntilLogicalMs: 500,
  });
  const eligibleCertificate = await derivedDecision(eligibleCandidate);
  assert.equal(
    (
      await evaluateCollectiveTrustGateV1({
        tenantId: "tenant.1",
        localDecision: trust.eligibilityDecision,
        certifiedDecision: eligibleCertificate,
        policy: { schemaVersion: 1, requireCertificate: true },
        logicalTimeMs: 100,
      })
    ).disposition,
    "eligible",
  );
  const restrictedEligibility = eligibilityWithDisposition(
    trust.eligibilityDecision,
    "restricted",
  );
  assert.equal(
    (
      await evaluateCollectiveTrustGateV1({
        tenantId: "tenant.1",
        localDecision: restrictedEligibility,
        certifiedDecision: eligibleCertificate,
        policy: { schemaVersion: 1, requireCertificate: true },
        logicalTimeMs: 100,
      })
    ).reasonCode,
    "local_restricted",
  );
  const restrictedCandidate = await createCollectiveTrustCandidateV1({
    tenantId: "tenant.1",
    profile: trust.profile,
    fusionDecision: trust.fusionDecision,
    eligibilityDecision: restrictedEligibility,
    previousCertifiedDecisionDigest: null,
    validUntilLogicalMs: 500,
  });
  const restrictedCertificate = await derivedDecision(restrictedCandidate);
  const gate = await evaluateCollectiveTrustGateV1({
    tenantId: "tenant.1",
    localDecision: trust.eligibilityDecision,
    certifiedDecision: restrictedCertificate,
    policy: { schemaVersion: 1, requireCertificate: true },
    logicalTimeMs: 100,
  });
  assert.equal(gate.disposition, "restricted");
  assert.equal(gate.reasonCode, "collective_restricted");
  assert.equal(
    (
      await evaluateCollectiveTrustGateV1({
        tenantId: "tenant.1",
        localDecision: trust.eligibilityDecision,
        certifiedDecision: null,
        policy: { schemaVersion: 1, requireCertificate: true },
        logicalTimeMs: 100,
      })
    ).reasonCode,
    "collective_unavailable",
  );
  assert.equal(
    (
      await evaluateCollectiveTrustGateV1({
        tenantId: "tenant.1",
        localDecision: trust.eligibilityDecision,
        certifiedDecision: eligibleCertificate,
        policy: { schemaVersion: 1, requireCertificate: true },
        logicalTimeMs: 500,
      })
    ).reasonCode,
    "collective_expired",
  );
});

test("the decision repository preserves its head across conflict, stale and gap writes", async () => {
  const trust = trustFixture();
  const repository = new InMemoryCollectiveTrustDecisionRepositoryV1();
  const network = await agreementFixture(repository);
  const certification = certificationPort(network, repository);
  const firstCandidate = await createCollectiveTrustCandidateV1({
    tenantId: "tenant.1",
    profile: trust.profile,
    fusionDecision: trust.fusionDecision,
    eligibilityDecision: trust.eligibilityDecision,
    previousCertifiedDecisionDigest: null,
    validUntilLogicalMs: 500,
  });
  const first = await certification.certify({
    candidate: firstCandidate,
    logicalTimeMs: 100,
  });
  assert.ok(first);
  const secondCandidate = await createCollectiveTrustCandidateV1({
    tenantId: "tenant.1",
    profile: trust.profile,
    fusionDecision: trust.fusionDecision,
    eligibilityDecision: trust.eligibilityDecision,
    previousCertifiedDecisionDigest: first.decisionDigest,
    validUntilLogicalMs: 600,
  });
  const second = await certification.certify({
    candidate: secondCandidate,
    logicalTimeMs: 100,
  });
  assert.ok(second);
  const forkCandidate = await createCollectiveTrustCandidateV1({
    tenantId: "tenant.1",
    profile: trust.profile,
    fusionDecision: trust.fusionDecision,
    eligibilityDecision: trust.eligibilityDecision,
    previousCertifiedDecisionDigest: first.decisionDigest,
    validUntilLogicalMs: 700,
  });
  const fork = await createCertifiedCollectiveTrustDecisionV1({
    candidate: forkCandidate,
    witnessPeerIds: ["p0", "p1", "p2"],
    membershipEpoch: 1,
    membershipConfigurationDigest: agreementDigest("d"),
    sourceCommitDigest: agreementDigest("e"),
    certifiedAtLogicalMs: 100,
  });
  const expectedHead = second.decisionDigest;
  assert.equal(
    await repository.save({
      decision: fork,
      expectedHeadDigest: first.decisionDigest,
    }),
    "stale_head",
  );
  assert.equal(
    (await repository.head(headRequest(firstCandidate))).decisionDigest,
    expectedHead,
  );
  assert.equal(
    await repository.save({ decision: fork, expectedHeadDigest: expectedHead }),
    "conflict",
  );
  assert.equal(
    (await repository.head(headRequest(firstCandidate))).decisionDigest,
    expectedHead,
  );
  const empty = new InMemoryCollectiveTrustDecisionRepositoryV1();
  assert.equal(
    await empty.save({
      decision: second,
      expectedHeadDigest: first.decisionDigest,
    }),
    "chain_gap",
  );
  assert.equal(await empty.head(headRequest(firstCandidate)), null);
});

test("the generic filter fits existing eligibility ports and returns the original decision only", async () => {
  const trust = trustFixture();
  const candidate = await createCollectiveTrustCandidateV1({
    tenantId: "tenant.1",
    profile: trust.profile,
    fusionDecision: trust.fusionDecision,
    eligibilityDecision: trust.eligibilityDecision,
    previousCertifiedDecisionDigest: null,
    validUntilLogicalMs: 500,
  });
  const certificate = await derivedDecision(candidate);
  const observations = [];
  const filter = createCollectiveTrustEligibilityFilterV1({
    tenantId: (input) => input.tenantId,
    logicalTimeMs: (input) => input.logicalTimeMs,
    local: { evaluate: () => trust.eligibilityDecision },
    collective: { resolve: () => certificate },
    policy: { schemaVersion: 1, requireCertificate: true },
    observe: (decision) => observations.push(decision),
  });
  const result = await filter.evaluate({
    tenantId: "tenant.1",
    logicalTimeMs: 100,
  });
  assert.strictEqual(result, trust.eligibilityDecision);
  assert.equal(observations[0].disposition, "eligible");
  const denied = createCollectiveTrustEligibilityFilterV1({
    tenantId: () => "tenant.1",
    logicalTimeMs: () => 100,
    local: { evaluate: () => trust.eligibilityDecision },
    collective: { resolve: () => null },
    policy: { schemaVersion: 1, requireCertificate: true },
  });
  assert.equal(await denied.evaluate({}), null);
});

test("a recovery candidate remains restricted after collective certification", async () => {
  const trust = trustFixture();
  const recoveryDecision = createQuarantineRecoveryDecisionV1({
    schemaVersion: 1,
    quarantineId: `quarantine-record:${"1".repeat(64)}`,
    quarantineKey: "2".repeat(64),
    policyDigest: trust.profile.policyDigest,
    fusionDecisionId: trust.fusionDecision.fusionDecisionId,
    evaluatedAtLogicalMs: 0,
    recoveryEvidenceIds: ["evidence.recovery.1"],
    recoveryEvidenceSetDigest: "3".repeat(64),
    recoveryClaimSourceDependencyGroupIds: ["group.recovery.1"],
    effectiveRecoveryWeightBasisPoints: 8_000,
    scoreBasisPoints: 8_500,
    uncertaintyBasisPoints: 1_000,
    disposition: "recovered",
    reasonCodes: ["quarantine_recovered"],
  });
  const candidate = await createCollectiveTrustCandidateV1({
    tenantId: "tenant.1",
    profile: trust.profile,
    fusionDecision: trust.fusionDecision,
    eligibilityDecision: trust.eligibilityDecision,
    recoveryDecision,
    previousCertifiedDecisionDigest: null,
    validUntilLogicalMs: 500,
  });
  assert.equal(candidate.disposition, "recovery_candidate");
  const certificate = await derivedDecision(candidate);
  const gate = await evaluateCollectiveTrustGateV1({
    tenantId: "tenant.1",
    localDecision: trust.eligibilityDecision,
    certifiedDecision: certificate,
    policy: { schemaVersion: 1, requireCertificate: true },
    logicalTimeMs: 100,
  });
  assert.equal(gate.disposition, "restricted");
  assert.equal(gate.reasonCode, "collective_recovery_pending");
});

test("synchronous Mesh and inference adapters consume only precomputed gates", async () => {
  const trust = trustFixture();
  const restrictedEligibility = eligibilityWithDisposition(
    trust.eligibilityDecision,
    "restricted",
  );
  const candidate = await createCollectiveTrustCandidateV1({
    tenantId: "tenant.1",
    profile: trust.profile,
    fusionDecision: trust.fusionDecision,
    eligibilityDecision: restrictedEligibility,
    previousCertifiedDecisionDigest: null,
    validUntilLogicalMs: 500,
  });
  const certificate = await derivedDecision(candidate);
  const gate = await evaluateCollectiveTrustGateV1({
    tenantId: "tenant.1",
    localDecision: trust.eligibilityDecision,
    certifiedDecision: certificate,
    policy: { schemaVersion: 1, requireCertificate: true },
    logicalTimeMs: 100,
  });
  const meshResolver = createCollectiveTrustMeshEligibilityResolverV1({
    bindingDigest: "d".repeat(64),
    local: {
      bindingDigest: "e".repeat(64),
      evaluate: () => "eligible",
    },
    gates: { resolve: () => gate },
  });
  assert.equal(
    meshResolver.evaluate({ peerId: "subject.1", capabilities: [] }),
    "restricted",
  );
  const target = {
    schemaVersion: 1,
    operation: "action",
    tenantId: "tenant.1",
    runId: "run.1",
    scopeDigest: "7".repeat(64),
    targetDigest: "8".repeat(64),
  };
  const inferenceResolver = createCollectiveTrustInferenceEligibilityResolverV1(
    {
      resolverId: "inference.collective.trust.1",
      resolverVersion: 1,
      resolverDigest: "9".repeat(64),
      local: {
        resolverId: "inference.local.trust.1",
        resolverVersion: 1,
        resolverDigest: "a".repeat(64),
        resolve: () => ({
          schemaVersion: 1,
          status: "eligible",
          policyDigest: "b".repeat(64),
          resolverDigest: "a".repeat(64),
          mappingDigest: "c".repeat(64),
          scopeDigest: target.scopeDigest,
          targetDigest: target.targetDigest,
        }),
      },
      gates: { resolve: () => gate },
    },
  );
  const inferenceDecision = inferenceResolver.resolve(target);
  assert.equal(inferenceDecision.status, "restricted");
  assert.equal(inferenceDecision.resolverDigest, "9".repeat(64));
});

async function agreementFixture(repository) {
  const peerIds = ["p0", "p1", "p2", "p3"];
  const keys = Object.create(null);
  const records = [];
  for (const peerId of peerIds) {
    const pair = await crypto.subtle.generateKey(
      MESH_SIGNATURE_ALGORITHM,
      true,
      ["sign", "verify"],
    );
    keys[peerId] = pair;
    records.push({
      tenantId: "tenant.1",
      meshId: "mesh.1",
      peerId,
      keyId: `key.${peerId}`,
      algorithm: MESH_SIGNATURE_ALGORITHM,
      publicKey: pair.publicKey,
      validFrom: "2029-01-01T00:00:00.000Z",
      validUntil: "2031-01-01T00:00:00.000Z",
      status: "active",
    });
  }
  const membership = await createCollectiveAgreementMembershipV1({
    epoch: 1,
    faultThreshold: 1,
    validators: peerIds.map((peerId) => ({
      peerId,
      instanceId: `instance.${peerId}`,
      keyId: `key.${peerId}`,
    })),
  });
  const resolver = createStaticMeshKeyResolver(records);
  const membershipPort = {
    current: async () => membership,
    resolve: async (input) =>
      input.epoch === membership.epoch &&
      input.configurationDigest === membership.configurationDigest
        ? membership
        : null,
  };
  const transport = new InMemoryCollectiveAgreementTransportV1();
  const repositories = Object.create(null);
  const clock = { now: () => ({ wallTime, logicalTimeMs: 100 }) };
  const semantics = createCollectiveTrustAgreementSemanticPortV1({
    policyDomainId: "policy.1",
    heads: repository,
    candidates: {
      validate: async () => ({ accepted: true, reasonCode: "accepted" }),
    },
  });
  for (const peerId of peerIds) {
    repositories[peerId] = new InMemoryCollectiveAgreementRepositoryV1();
    transport.register(
      peerId,
      new CollectiveAgreementPeerV1({
        scope: agreementScope(peerId),
        signing: agreementSigning(keys[peerId], peerId),
        resolver,
        membership: membershipPort,
        repository: repositories[peerId],
        semantics,
        clock,
      }),
    );
  }
  const client = new CollectiveAgreementClientV1({
    scope: agreementScope("p0"),
    signing: agreementSigning(keys.p0, "p0"),
    resolver,
    membership: membershipPort,
    repository: repositories.p0,
    transport,
    clock,
    requestTimeoutMs: 100,
  });
  return {
    membership,
    membershipPort,
    resolver,
    repositories,
    client,
    clock,
  };
}

function certificationPort(network, repository) {
  return createCollectiveTrustCertificationPortV1({
    policyDomainId: "policy.1",
    agreement: network.client,
    membership: network.membershipPort,
    resolver: network.resolver,
    clock: network.clock,
    repository,
    coordinates: {
      resolve: async ({ previousCertifiedDecisionDigest }) => {
        if (!previousCertifiedDecisionDigest)
          return { height: 1, round: 0, previousCommitDigest: null };
        const previous = await repository.get(previousCertifiedDecisionDigest);
        return {
          height: 2,
          round: 3,
          previousCommitDigest: previous.sourceCommitDigest,
        };
      },
    },
  });
}

function trustFixture() {
  const configured = trustPolicy();
  const policyDigest = digestEvidenceFusionPolicyV1(configured);
  const fusionRequest = {
    tenantId: "tenant.1",
    subject,
    scope,
    policyId: configured.policyId,
    policyVersion: configured.policyVersion,
    policyDigest,
    dependencyBindingDigests: [],
  };
  let state = reduceEvidenceTrustStateV1(
    createEvidenceTrustStateV1({ stateId: "collective-trust-state" }),
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
  const profile = state.profiles[0];
  const rule = configured.eligibilityRules[0];
  const request = createTrustEligibilityRequestV1({
    schemaVersion: 1,
    tenantId: "tenant.1",
    subject,
    subjectDigest: digestSubjectV1(subject),
    scope,
    scopeDigest: digestScopeV1(scope),
    policyId: configured.policyId,
    policyVersion: configured.policyVersion,
    policyDigest,
    profileId: profile.profileId,
    profileDigest: profile.profileDigest,
    maximumProfileAgeMs: rule.maximumProfileAgeMs,
    requirements: rule.requirements,
  });
  return {
    profile,
    fusionDecision,
    eligibilityDecision: evaluateTrustEligibilityV1(state, request, 0),
  };
}

function trustPolicy() {
  return createEvidenceFusionPolicyV1({
    schemaVersion: 1,
    policyId: "trust.policy.1",
    policyVersion: 1,
    parentPolicyDigest: null,
    mode: "restrict",
    dimensions: [
      {
        dimensionId: "integrity",
        priorScoreBasisPoints: 5_000,
        priorWeightBasisPoints: 1,
        minimumUncertaintyBasisPoints: 0,
        coverageTargetBasisPoints: 1,
        decayIntervalMs: 1,
        decayBasisPointsPerInterval: 1,
        uncertaintyGrowthBasisPointsPerInterval: 1,
        minimumRetainedWeightBasisPoints: 1,
        contradictionUncertaintyBasisPointsPerClaim: 1,
        maximumContradictionUncertaintyBasisPoints: 1_000,
        degradedScoreAtOrBelowBasisPoints: 2_000,
        degradedUncertaintyAtOrAboveBasisPoints: 8_000,
      },
    ],
    criteria: [
      {
        criterionId: "criterion.1",
        dimensionId: "integrity",
        satisfiedValueBasisPoints: 10_000,
        violatedValueBasisPoints: 0,
        inconclusiveValueBasisPoints: null,
        baseWeightBasisPoints: 1_000,
        maximumClaimWeightBasisPoints: 1_000,
        maximumSourceGroupContributionWeightBasisPoints: 1_000,
        minimumSupportGroups: 1,
        minimumSupportWeightBasisPoints: 1,
        minimumContradictionGroups: 1,
        minimumContradictionWeightBasisPoints: 1,
        allowClaimSourceAttestation: false,
        contentRequired: false,
        quarantineEligible: false,
        recoveryEligible: false,
        maximumAgeMs: 1_000,
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
        sourceId: "subject.1",
        sourceKind: "peer",
        dependencyGroupId: "group.1",
        roles: ["challenge", "claim"],
        maximumWeightBasisPoints: 1_000,
        validFromLogicalMs: 0,
        validUntilLogicalMs: 1_000,
      },
    ],
    dependencyGroups: [
      {
        dependencyGroupId: "group.1",
        maximumAttestationWeightPerClaimBasisPoints: 1_000,
        maximumProfileWeightPerDimensionCriterionBasisPoints: 1_000,
      },
    ],
    eligibilityRules: [
      {
        ruleId: "participate",
        maximumProfileAgeMs: 1_000,
        requirements: [
          {
            dimensionId: "integrity",
            minimumScoreBasisPoints: 4_000,
            maximumUncertaintyBasisPoints: 10_000,
          },
        ],
      },
    ],
    quarantinePolicy: { enabled: false, rules: [], maximumActiveRecords: 1 },
    recoveryPolicy: { rules: [] },
    limits: EVIDENCE_TRUST_LIMITS_V1,
    diagnosticsPolicyId: "diagnostics.1",
    redactionPolicyId: "redaction.1",
  });
}

function eligibilityWithDisposition(decision, disposition) {
  const body = {
    ...decision,
    eligibilityDecisionId: "pending",
    disposition,
    reasonCodes: disposition === "restricted" ? ["eligibility_restricted"] : [],
  };
  return {
    ...body,
    eligibilityDecisionId: `eligibility-decision:${digestTrustEligibilityDecisionV1(body)}`,
  };
}

async function derivedDecision(candidate) {
  const repository = new InMemoryCollectiveTrustDecisionRepositoryV1();
  const network = await agreementFixture(repository);
  return certificationPort(network, repository).certify({
    candidate,
    logicalTimeMs: 100,
  });
}

function headRequest(candidate) {
  return {
    tenantId: candidate.tenantId,
    subjectDigest: candidate.subjectDigest,
    scopeDigest: candidate.scopeDigest,
    policyDigest: candidate.policyDigest,
  };
}

function agreementScope(peerId) {
  return {
    tenantId: "tenant.1",
    meshId: "mesh.1",
    peerId,
    instanceId: `instance.${peerId}`,
  };
}

function agreementSigning(pair, peerId) {
  return {
    privateKey: pair.privateKey,
    keyId: `key.${peerId}`,
    algorithm: MESH_SIGNATURE_ALGORITHM,
  };
}

function agreementDigest(character) {
  return `sha256:${character.repeat(64)}`;
}
