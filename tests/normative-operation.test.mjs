import assert from "node:assert/strict";
import test from "node:test";

import {
  COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
  CAMPAIGN_ELIGIBILITY_REASON_CODES_V1,
  createCampaignEligibilityVerifiedClosureProofV1,
  createCampaignEligibilityAttestationV1,
  createCollectiveEvaluationCampaignRegistrationV1,
  createCollectiveEvaluationCampaignExecutionV1,
  collectiveEvaluationCampaignProfileCellsV1,
  createNormativeOperationAuthorizationV1,
  createNormativeOperationPlanV1,
  createNormativeRunnerDescriptorV1,
  deriveCampaignEligibilityAttestationV1,
  validateCampaignEligibilityAttestationV1,
  validateCollectiveEvaluationCampaignExecutionV1,
  validateNormativeOperationAuthorizationV1,
  validateNormativeOperationPlanV1,
  validateNormativeRunnerDescriptorV1,
  verifyCampaignEligibilityAttestationV1,
  verifyNormativeOperationAuthorizationV1,
} from "../packages/collective-planning/dist/evaluation.js";

const digest = (character) => `sha256:${character.repeat(64)}`;

test("seals and validates the complete 240-cell / 960-slot execution state", () => {
  const registered = registration();
  const execution = createCollectiveEvaluationCampaignExecutionV1({
    schemaVersion: 1,
    executionId: "execution:normative-state-limit",
    registration: registered,
  });
  assert.equal(execution.cells.length, 240);
  assert.equal(
    execution.cells.reduce((count, cell) => count + cell.runs.length, 0),
    960,
  );
  assert.equal(
    validateCollectiveEvaluationCampaignExecutionV1(execution).executionDigest,
    execution.executionDigest,
  );
});
const authentication = Object.freeze({
  schemaVersion: 1,
  credentialId: "credential:test",
  algorithm: "ed25519",
  signature: Buffer.alloc(64).toString("base64url"),
});

function registration() {
  const campaignId = "campaign:normative-operation-test";
  return createCollectiveEvaluationCampaignRegistrationV1({
    schemaVersion: 1,
    campaignId,
    profile: COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
    sourceDigest: digest("1"),
    packageDigest: digest("2"),
    fixtureManifestDigest: digest("3"),
    policyDigest: digest("4"),
    environmentDigest: digest("5"),
    observationPolicyDigest: digest("6"),
    monitorDigest: digest("7"),
    hiddenCanaryDigest: digest("8"),
    runners: ["adaptive_collective", "centralized_planner"],
    maximumInteractions: 5_000,
    cells: collectiveEvaluationCampaignProfileCellsV1(
      COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
      campaignId,
    ).map((cell) => ({
      schemaVersion: 1,
      ...cell,
      maximumInteractions:
        cell.peerCount === 50
          ? 1_000
          : cell.peerCount === 100
            ? 1_600
            : cell.peerCount === 250
              ? 3_000
              : 5_000,
      scaleConfigurationDigest: digest("9"),
      adaptiveDefinitionDigest: digest("a"),
      centralizedDefinitionDigest: digest("b"),
      faultPlanDigest: digest("c"),
      faultMatrixBindingDigest: digest("d"),
    })),
  });
}

function descriptor(runnerClass = "normative_candidate") {
  return createNormativeRunnerDescriptorV1({
    schemaVersion: 1,
    adapterId: "adapter:normative:test",
    adapterVersion: "1.0.0",
    runnerClass,
    capabilities: {
      schemaVersion: 1,
      runners: ["adaptive_collective", "centralized_planner"],
      scales: [50, 100, 250, 500],
      strata: ["nominal", "benign", "adversarial", "mixed"],
      traceSchemaVersion: 2,
      accountingVersion: "interaction-accounting-v2",
      environmentPortVersion: 1,
      monitorPortVersion: 1,
      exactReplay: true,
      evaluatorOwnedMetrics: true,
    },
    digests: {
      schemaVersion: 1,
      implementationDigest: digest("1"),
      evaluatorDigest: digest("e"),
      scenarioDefinitionDigest: digest("2"),
      fixtureDigest: digest("3"),
      policyDigest: digest("4"),
      environmentDigest: digest("5"),
      observationPolicyDigest: digest("6"),
      monitorDigest: digest("7"),
    },
    limits: {
      schemaVersion: 1,
      maximumAgents: 500,
      maximumOutdegree: 32,
      maximumInteractionsPerExecution: 5_000,
      maximumTraceEventsPerExecution: 100_000,
      maximumArtifactBytesPerExecution: 67_108_864,
      maximumConcurrentCells: 2,
    },
  });
}

test("creates the exact immutable 240-cell/960-slot plan in 48 consecutive shards", () => {
  const registered = registration();
  const adapter = descriptor();
  const plan = createNormativeOperationPlanV1({
    schemaVersion: 1,
    registration: registered,
    sourceCommit: "a".repeat(40),
    sourceTreeDigest: digest("e"),
    adapter,
  });

  assert.equal(plan.expectedCellCount, 240);
  assert.equal(plan.expectedSlotCount, 960);
  assert.equal(plan.shards.length, 48);
  assert.ok(
    plan.shards.every(
      (shard) => shard.cellCount === 5 && shard.slotCount === 20,
    ),
  );
  assert.deepEqual(
    plan.shards.flatMap((shard) => shard.cellIds),
    plan.cellIds,
  );
  assert.equal(new Set(plan.cellIds).size, 240);
  assert.equal(
    validateNormativeOperationPlanV1(plan, registered, adapter).planDigest,
    plan.planDigest,
  );
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.shards[0].cellIds), true);

  assert.throws(
    () =>
      validateNormativeOperationPlanV1(
        {
          ...plan,
          shards: [plan.shards[1], plan.shards[0], ...plan.shards.slice(2)],
        },
        registered,
        adapter,
      ),
    /ordered|canonical|partition/u,
  );
  assert.throws(
    () =>
      validateNormativeOperationPlanV1(
        { ...plan, unexpected: true },
        registered,
        adapter,
      ),
    /invalid shape/u,
  );
});

test("authenticates exact plan/audience/shard context at an explicit time", async () => {
  const authorization = createNormativeOperationAuthorizationV1({
    schemaVersion: 1,
    authorizationId: "authorization:normative:test",
    issuerId: "operator:test",
    audience: "agentplat:normative-executor",
    credentialId: authentication.credentialId,
    signatureAlgorithm: authentication.algorithm,
    planDigest: digest("f"),
    registrationDigest: registration().registrationDigest,
    sourceCommit: "a".repeat(40),
    sourceTreeDigest: digest("e"),
    adapterDigest: descriptor().descriptorDigest,
    executionId: "execution:normative:test",
    shardIndices: [0, 1, 47],
    authorizedAt: "2026-08-03T12:00:00.000Z",
    expiresAt: "2026-08-04T12:00:00.000Z",
    maximumCells: 15,
    authentication,
  });
  assert.equal(
    validateNormativeOperationAuthorizationV1(authorization)
      .authorizationDigest,
    authorization.authorizationDigest,
  );
  assert.equal(Object.isFrozen(authorization.shardIndices), true);
  const { authorizationDigest: _authorizationDigest, ...authorizationInput } =
    authorization;
  const resigned = createNormativeOperationAuthorizationV1({
    ...authorizationInput,
    authentication: {
      ...authentication,
      signature: Buffer.alloc(64, 1).toString("base64url"),
    },
  });
  assert.equal(resigned.authorizationDigest, authorization.authorizationDigest);
  assert.throws(
    () =>
      createNormativeOperationAuthorizationV1({
        ...authorizationInput,
        shardIndices: [1, 0],
      }),
    /ordered/u,
  );
  assert.throws(
    () =>
      createNormativeOperationAuthorizationV1({
        ...authorizationInput,
        authorizedAt: "2026-08-04T12:00:00.000Z",
        expiresAt: "2026-08-03T12:00:00.000Z",
      }),
    /expiry/u,
  );
  assert.throws(
    () =>
      createNormativeOperationAuthorizationV1({
        ...authorizationInput,
        maximumCells: 5,
      }),
    /maximumCells/u,
  );
  assert.throws(
    () =>
      createNormativeOperationAuthorizationV1({
        ...authorizationInput,
        authentication: { ...authentication, signature: "not-a-signature" },
      }),
    /signature/u,
  );
  assert.throws(
    () =>
      createNormativeOperationAuthorizationV1({
        ...authorizationInput,
        authentication: {
          ...authentication,
          credentialId: "credential:substituted",
        },
      }),
    /identity does not match statement/u,
  );

  const context = {
    schemaVersion: 1,
    audience: authorization.audience,
    planDigest: authorization.planDigest,
    registrationDigest: authorization.registrationDigest,
    sourceCommit: authorization.sourceCommit,
    sourceTreeDigest: authorization.sourceTreeDigest,
    adapterDigest: authorization.adapterDigest,
    executionId: authorization.executionId,
    shardIndices: authorization.shardIndices,
    maximumCells: authorization.maximumCells,
  };
  let verifiedDigest = null;
  const verifier = {
    schemaVersion: 1,
    verifyDetachedAuthorizationV1(input) {
      verifiedDigest = input.authorizationDigest;
      return (
        input.purpose === "normative-operation-authorization-v1" &&
        input.issuerId === authorization.issuerId &&
        input.audience === authorization.audience &&
        input.authentication.signature === authentication.signature
      );
    },
  };
  assert.equal(
    (
      await verifyNormativeOperationAuthorizationV1({
        schemaVersion: 1,
        authorization,
        context,
        now: "2026-08-03T18:00:00.000Z",
        verifier,
      })
    ).authorizationDigest,
    authorization.authorizationDigest,
  );
  assert.equal(verifiedDigest, authorization.authorizationDigest);
  await assert.rejects(
    () =>
      verifyNormativeOperationAuthorizationV1({
        schemaVersion: 1,
        authorization,
        context: { ...context, audience: "agentplat:other" },
        now: "2026-08-03T18:00:00.000Z",
        verifier,
      }),
    /context does not match/u,
  );
  await assert.rejects(
    () =>
      verifyNormativeOperationAuthorizationV1({
        schemaVersion: 1,
        authorization,
        context,
        now: authorization.expiresAt,
        verifier,
      }),
    /not valid/u,
  );
  await assert.rejects(
    () =>
      verifyNormativeOperationAuthorizationV1({
        schemaVersion: 1,
        authorization,
        context,
        now: "2026-08-03T18:00:00.000Z",
        verifier: {
          schemaVersion: 1,
          verifyDetachedAuthorizationV1: () => false,
        },
      }),
    /authentication failed/u,
  );
});

test("derives eligibility only from an authenticated closure proof", async () => {
  const candidate = descriptor();
  assert.equal(
    validateNormativeRunnerDescriptorV1(candidate).descriptorDigest,
    candidate.descriptorDigest,
  );
  assert.throws(
    () =>
      validateNormativeRunnerDescriptorV1({ ...candidate, arbitrary: true }),
    /invalid shape/u,
  );

  const common = {
    schemaVersion: 1,
    campaignId: "campaign:normative-operation-test",
    executionId: "execution:normative:test",
    planDigest: digest("f"),
    registrationDigest: registration().registrationDigest,
    bundleDigest: digest("1"),
    sourceCommit: "a".repeat(40),
    sourceTreeDigest: digest("2"),
    adapterClass: "normative_candidate",
    adapterDigest: candidate.descriptorDigest,
    authorizationDigest: digest("3"),
    analyzerDigest: digest("4"),
    analysisPolicyDigest: digest("5"),
    analysisDigest: digest("7"),
    metricProjectionRootDigest: digest("6"),
  };
  const expectedCellIds = Array.from(
    { length: 240 },
    (_, index) => `cell:${index}`,
  );
  const expectedRunKeys = Array.from(
    { length: 960 },
    (_, index) => `run:${index}`,
  );
  const checks = {
    schemaVersion: 1,
    authorizationValid: true,
    sourceLockMatches: true,
    cleanSource: true,
    adapterCapabilitiesMatch: true,
    executionsValid: true,
    replayMatches: true,
    tracesValid: true,
    ledgersMatch: true,
    monitorMatches: true,
    topologyMatches: true,
    faultCoverageComplete: true,
    safetyPassed: true,
    evaluationIntegrityPassed: true,
    thresholdsPassed: true,
    analysisPolicyMatches: true,
    negativeControlsPassed: true,
    artifactLimitsPassed: true,
  };
  const closureProof = createCampaignEligibilityVerifiedClosureProofV1({
    ...common,
    expectedCellIds,
    verifiedCellIds: expectedCellIds,
    expectedRunKeys,
    verifiedRunKeys: expectedRunKeys,
    checks,
    authentication,
  });
  const proofVerifier = {
    schemaVersion: 1,
    verifyClosureProofV1: (input) =>
      input.purpose === "campaign-eligibility-closure-proof-v1" &&
      input.proofDigest === closureProof.proofDigest,
  };
  const eligible = await deriveCampaignEligibilityAttestationV1({
    schemaVersion: 1,
    proof: closureProof,
    createdAt: "2026-08-03T12:00:00.000Z",
    verifier: proofVerifier,
  });
  assert.equal(
    validateCampaignEligibilityAttestationV1(eligible).status,
    "eligible",
  );
  assert.equal(eligible.analyzedCellCount, 240);
  assert.equal(eligible.analyzedSlotCount, 960);
  assert.equal(
    (
      await verifyCampaignEligibilityAttestationV1({
        schemaVersion: 1,
        attestation: eligible,
        proof: closureProof,
        verifier: proofVerifier,
      })
    ).attestationDigest,
    eligible.attestationDigest,
  );

  assert.throws(
    () =>
      createCampaignEligibilityAttestationV1({
        ...common,
        status: "eligible",
        reasonCodes: [],
        analyzedCellCount: 240,
        analyzedSlotCount: 960,
        closureProofDigest: closureProof.proofDigest,
        createdAt: "2026-08-03T12:00:00.000Z",
      }),
    /verified closure derivation/u,
  );
  const diagnosticProof = createCampaignEligibilityVerifiedClosureProofV1({
    ...common,
    adapterClass: "diagnostic",
    expectedCellIds,
    verifiedCellIds: expectedCellIds,
    expectedRunKeys,
    verifiedRunKeys: expectedRunKeys,
    checks,
    authentication,
  });
  const diagnostic = await deriveCampaignEligibilityAttestationV1({
    schemaVersion: 1,
    proof: diagnosticProof,
    createdAt: "2026-08-03T12:00:00.000Z",
    verifier: { schemaVersion: 1, verifyClosureProofV1: () => true },
  });
  assert.equal(diagnostic.status, "ineligible");
  assert.deepEqual(diagnostic.reasonCodes, ["adapter_not_normative"]);

  const incompleteProof = createCampaignEligibilityVerifiedClosureProofV1({
    ...common,
    expectedCellIds,
    verifiedCellIds: expectedCellIds.slice(0, 239),
    expectedRunKeys,
    verifiedRunKeys: expectedRunKeys.slice(0, 959),
    checks,
    authentication,
  });
  const incomplete = await deriveCampaignEligibilityAttestationV1({
    schemaVersion: 1,
    proof: incompleteProof,
    createdAt: "2026-08-03T12:00:00.000Z",
    verifier: { schemaVersion: 1, verifyClosureProofV1: () => true },
  });
  assert.equal(incomplete.status, "incomplete");
  assert.deepEqual(incomplete.reasonCodes, [
    "campaign_incomplete",
    "slot_missing",
  ]);
  await assert.rejects(
    () =>
      deriveCampaignEligibilityAttestationV1({
        schemaVersion: 1,
        proof: closureProof,
        createdAt: "2026-08-03T12:00:00.000Z",
        verifier: { schemaVersion: 1, verifyClosureProofV1: () => false },
      }),
    /authentication failed/u,
  );
  assert.ok(CAMPAIGN_ELIGIBILITY_REASON_CODES_V1.includes("threshold_not_met"));
});
