import assert from "node:assert/strict";
import test from "node:test";

import {
  COLLECTIVE_EVALUATION_PREFLIGHT_CAMPAIGN_PROFILE_V1,
  collectiveEvaluationRunKeyV1,
  collectiveEvaluationCampaignProfileCellsV1,
  createCollectiveEvaluationCampaignRegistrationV1,
} from "../packages/collective-planning/dist/evaluation.js";
import {
  aggregateCollectiveStatisticalCampaignV1,
  createCollectiveStatisticalCampaignExecutionArtifactsV1,
  digestCollectiveStatisticalCampaignArtifactV1,
  validateCollectiveStatisticalCampaignExecutionArtifactsV1,
  verifyCollectiveStatisticalCampaignBundleV1,
} from "../packages/mesh-sim/dist/index.js";

const digest = (kind, value) =>
  digestCollectiveStatisticalCampaignArtifactV1(kind, value);

function fixture({ failedSlot = null } = {}) {
  const sourceLock = {
    schemaVersion: 1,
    sourceCommit: "a".repeat(40),
    sourceTreeDigest: digest("source-lock", { schemaVersion: 1, tree: "a" }),
    dirtyWorktree: false,
  };
  const provenance = {
    sourceLock,
    packageLock: { schemaVersion: 1, lock: "pnpm" },
    fixture: { schemaVersion: 1, fixture: "paired-resilience" },
    policy: { schemaVersion: 1, policy: "paired" },
    environment: { schemaVersion: 1, environment: "deterministic" },
    observationPolicy: { schemaVersion: 1, observation: "public" },
    monitor: { schemaVersion: 1, monitor: "terminal" },
    hiddenCanary: { schemaVersion: 1, commitment: "hidden" },
  };
  const campaignId = "campaign:aggregation-preflight";
  const registration = createCollectiveEvaluationCampaignRegistrationV1({
    schemaVersion: 1,
    campaignId,
    profile: COLLECTIVE_EVALUATION_PREFLIGHT_CAMPAIGN_PROFILE_V1,
    sourceDigest: digest("source-lock", provenance.sourceLock),
    packageDigest: digest("package-lock", provenance.packageLock),
    fixtureManifestDigest: digest("fixture", provenance.fixture),
    policyDigest: digest("policy", provenance.policy),
    environmentDigest: digest("environment", provenance.environment),
    observationPolicyDigest: digest(
      "observation-policy",
      provenance.observationPolicy,
    ),
    monitorDigest: digest("monitor", provenance.monitor),
    hiddenCanaryDigest: digest("hidden-canary", provenance.hiddenCanary),
    runners: ["adaptive_collective", "centralized_planner"],
    maximumInteractions: 1_000,
    cells: collectiveEvaluationCampaignProfileCellsV1(
      COLLECTIVE_EVALUATION_PREFLIGHT_CAMPAIGN_PROFILE_V1,
      campaignId,
    ).map((cell) => ({
      schemaVersion: 1,
      ...cell,
      maximumInteractions: 1_000,
      scaleConfigurationDigest: digest("registration", {
        kind: "scale",
        cellId: cell.cellId,
      }),
      adaptiveDefinitionDigest: digest("registration", {
        kind: "adaptive",
        cellId: cell.cellId,
      }),
      centralizedDefinitionDigest: digest("registration", {
        kind: "centralized",
        cellId: cell.cellId,
      }),
      faultPlanDigest: digest("registration", {
        kind: "fault-plan",
        cellId: cell.cellId,
      }),
      faultMatrixBindingDigest: digest("registration", {
        kind: "fault-matrix",
        cellId: cell.cellId,
      }),
    })),
  });
  const executions = registration.cells.flatMap((cell) =>
    ["adaptive_collective", "centralized_planner"].flatMap((runner) =>
      ["first", "replay"].map((attempt) => {
        const failed = failedSlot === `${cell.cellId}/${runner}`;
        return createCollectiveStatisticalCampaignExecutionArtifactsV1({
          schemaVersion: 1,
          executionId: "execution:aggregation-preflight",
          runKey: collectiveEvaluationRunKeyV1({
            executionId: "execution:aggregation-preflight",
            registrationDigest: registration.registrationDigest,
            cellId: cell.cellId,
            runner,
            attempt,
          }),
          registrationDigest: registration.registrationDigest,
          cell,
          runner,
          attempt,
          output: {
            schemaVersion: 1,
            status: failed ? "failed" : "passed",
            reasonCode: failed ? "runner_failed" : null,
            outcome: { committed: !failed, runner },
            traceRecords: [{ sequence: 1, runner }],
            ledgerRecords: [{ interactions: 1, runner }],
            observations: [{ observation: failed ? "failed" : "ok", runner }],
          },
        });
      }),
    ),
  );
  const aggregationHooks = {
    computeComparisonStatistics: ({ adaptive, centralized }) => ({
      bothPassed:
        adaptive.status === "passed" && centralized.status === "passed",
    }),
    computeSummaryStatistics: ({ comparisons }) => ({
      total: comparisons.length,
    }),
  };
  const verificationHooks = {
    expectedSourceLock: {
      sourceCommit: sourceLock.sourceCommit,
      sourceTreeDigest: sourceLock.sourceTreeDigest,
    },
    recomputeComparisonStatistics: (_comparison, adaptive, centralized) => ({
      bothPassed:
        adaptive[0].status === "passed" && centralized[0].status === "passed",
    }),
    recomputeSummaryStatistics: (_summary, comparisons) => ({
      total: comparisons.length,
    }),
  };
  return {
    registration,
    provenance,
    executions,
    aggregationHooks,
    verificationHooks,
  };
}

async function aggregate(value) {
  return aggregateCollectiveStatisticalCampaignV1({
    schemaVersion: 1,
    registration: value.registration,
    provenance: value.provenance,
    executions: value.executions,
    bootstrap: { schemaVersion: 1, seed: 202, resamples: 10_000 },
    hooks: value.aggregationHooks,
  });
}

test("aggregates a complete resumable execution into a verifier-compatible bundle", async () => {
  const value = fixture();
  const result = await aggregate(value);
  assert.equal(result.manifest.entries.length, 8);
  assert.equal(result.bundle.cells.length, 8);
  assert.equal(result.bundle.expectedArtifacts.length, 147);
  assert.equal(result.summary.status, "passed");
  const verified = await verifyCollectiveStatisticalCampaignBundleV1(
    result.bundle,
    result.bytes,
    value.verificationHooks,
  );
  assert.equal(verified.status, "passed");
  assert.equal(verified.sampleCount, 32);
  assert.equal(verified.comparisonCount, 8);
});

test("retains terminal runner failures in manifest and summary", async () => {
  const baseline = fixture();
  const failedSlot = `${baseline.registration.cells[0].cellId}/adaptive_collective`;
  const value = fixture({ failedSlot });
  const result = await aggregate(value);
  assert.equal(result.manifest.entries[0].status, "failure");
  assert.equal(result.manifest.entries[0].reasonCode, "runner_failed");
  assert.equal(result.summary.status, "failed");
  const verified = await verifyCollectiveStatisticalCampaignBundleV1(
    result.bundle,
    result.bytes,
    value.verificationHooks,
  );
  assert.equal(verified.status, "failed");
});

test("rejects missing, duplicate and replay-divergent execution slots", async () => {
  const missing = fixture();
  missing.executions.pop();
  await assert.rejects(
    () => aggregate(missing),
    /incomplete_execution_closure/u,
  );

  const duplicate = fixture();
  duplicate.executions.push(duplicate.executions[0]);
  await assert.rejects(() => aggregate(duplicate), /duplicate_slot/u);

  const divergent = fixture();
  const replayIndex = divergent.executions.findIndex(
    (entry) =>
      entry.cellId === divergent.registration.cells[0].cellId &&
      entry.runner === "adaptive_collective" &&
      entry.attempt === "replay",
  );
  const replay = divergent.executions[replayIndex];
  divergent.executions[replayIndex] =
    createCollectiveStatisticalCampaignExecutionArtifactsV1({
      schemaVersion: 1,
      executionId: replay.executionId,
      runKey: replay.runKey,
      registrationDigest: divergent.registration.registrationDigest,
      cell: divergent.registration.cells[0],
      runner: replay.runner,
      attempt: replay.attempt,
      output: {
        schemaVersion: 1,
        status: "passed",
        reasonCode: null,
        outcome: { committed: true, runner: replay.runner, changed: true },
        traceRecords: replay.trace.records,
        ledgerRecords: replay.ledger.records,
        observations: replay.evidence.observations,
      },
    });
  await assert.rejects(() => aggregate(divergent), /replay_diverged/u);
});

test("validates a collected slot against the expected execution identity", () => {
  const value = fixture();
  assert.equal(
    validateCollectiveStatisticalCampaignExecutionArtifactsV1(
      value.registration,
      "execution:aggregation-preflight",
      value.executions[0],
    ).runKey,
    value.executions[0].runKey,
  );
  assert.throws(
    () =>
      validateCollectiveStatisticalCampaignExecutionArtifactsV1(
        value.registration,
        "execution:foreign",
        value.executions[0],
      ),
    /execution_identity_mismatch/u,
  );
});
