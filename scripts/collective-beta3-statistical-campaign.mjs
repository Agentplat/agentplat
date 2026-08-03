import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
  COLLECTIVE_EVALUATION_PREFLIGHT_CAMPAIGN_PROFILE_V1,
  collectiveEvaluationCampaignProfileCellsV1,
  createCollectiveEvaluationCampaignManifestV1,
  createCollectiveEvaluationCampaignRegistrationV1,
  validateCollectiveEvaluationCampaignManifestV1,
  validateCollectiveEvaluationCampaignRegistrationV1,
} from "@agentplat/collective-planning/evaluation";
import {
  COLLECTIVE_STATISTICAL_CAMPAIGN_SCALE_LADDER_V1,
  createCollectiveStatisticalCampaignFaultMatrixV1,
  createCollectiveStatisticalCampaignScaleConfigurationV1,
  digestCollectiveStatisticalCampaignArtifactV1,
} from "@agentplat/mesh-sim";

const campaignId = "beta3-paired-resilience-preflight-v1";
const profile = COLLECTIVE_EVALUATION_PREFLIGHT_CAMPAIGN_PROFILE_V1;
const schedule = collectiveEvaluationCampaignProfileCellsV1(profile, campaignId);
const normativeSchedule = collectiveEvaluationCampaignProfileCellsV1(
  COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
  "beta3-paired-resilience-normative-v1",
);
const faultMatrix = createCollectiveStatisticalCampaignFaultMatrixV1();
const artifactDigest = (kind, value) =>
  digestCollectiveStatisticalCampaignArtifactV1(kind, value);
const git = (args) =>
  execFileSync("git", args, { encoding: "utf8" }).trim();
const sourceCommit = git(["rev-parse", "HEAD"]);
const sourceTree = git(["rev-parse", "HEAD^{tree}"]);
const sourceDirty =
  git(["status", "--porcelain", "--untracked-files=all"]).length > 0;
const rootPackage = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const sourceLock = Object.freeze({
  schemaVersion: 1,
  sourceCommit,
  sourceTreeDigest: artifactDigest("source-lock", {
    schemaVersion: 1,
    gitTree: sourceTree,
  }),
  dirtyWorktree: sourceDirty,
});
const packageLock = Object.freeze({
  schemaVersion: 1,
  packageVersion: rootPackage.version,
  pnpmLockBlob: git(["rev-parse", "HEAD:pnpm-lock.yaml"]),
});
const commitments = Object.freeze({
  sourceDigest: artifactDigest("source-lock", sourceLock),
  packageDigest: artifactDigest("package-lock", packageLock),
  fixtureManifestDigest: artifactDigest("fixture", {
    schemaVersion: 1,
    fixtureProfile: "beta3-paired-resilience-v1",
  }),
  policyDigest: artifactDigest("policy", {
    schemaVersion: 1,
    policyProfile: "paired-resilience-v1",
  }),
  environmentDigest: artifactDigest("environment", {
    schemaVersion: 1,
    environmentProfile: "public-observation-boundary-v1",
  }),
  observationPolicyDigest: artifactDigest("policy", {
    schemaVersion: 1,
    observationProfile: "peer-scoped-v1",
  }),
  monitorDigest: artifactDigest("monitor", {
    schemaVersion: 1,
    monitorProfile: "independent-terminal-monitor-v1",
  }),
  hiddenCanaryDigest: artifactDigest("monitor", {
    schemaVersion: 1,
    canaryProfile: "digest-only-v1",
  }),
});

const cells = schedule.map((cell) => {
  const configuration = createCollectiveStatisticalCampaignScaleConfigurationV1({
    schemaVersion: 1,
    agentCount: cell.peerCount,
    seed: cell.seed,
    stratum: cell.stratum,
  });
  const definitionDigest = (runner) =>
    artifactDigest("registration", {
      schemaVersion: 1,
      runner,
      configurationDigest: configuration.configurationDigest,
    });
  const faultPlanDigest = artifactDigest("registration", {
    schemaVersion: 1,
    cellId: cell.cellId,
    stratum: cell.stratum,
    configurationDigest: configuration.configurationDigest,
    registeredFaultFamilies: configuration.registeredFaultFamilies,
  });
  const faultMatrixBindingDigest = artifactDigest("registration", {
    schemaVersion: 1,
    cellId: cell.cellId,
    stratum: cell.stratum,
    configurationDigest: configuration.configurationDigest,
    faultPlanDigest,
    faultMatrixDigest: faultMatrix.faultMatrixDigest,
    registeredFaultFamilies: configuration.registeredFaultFamilies,
  });
  return Object.freeze({
    schemaVersion: 1,
    ...cell,
    maximumInteractions: configuration.maximumInteractions,
    scaleConfigurationDigest: configuration.configurationDigest,
    adaptiveDefinitionDigest: definitionDigest("adaptive_collective"),
    centralizedDefinitionDigest: definitionDigest("centralized_planner"),
    faultPlanDigest,
    faultMatrixBindingDigest,
  });
});

const registration = createCollectiveEvaluationCampaignRegistrationV1({
  schemaVersion: 1,
  campaignId,
  profile,
  ...commitments,
  runners: Object.freeze(["adaptive_collective", "centralized_planner"]),
  maximumInteractions: 1_000,
  cells,
});
const manifest = createCollectiveEvaluationCampaignManifestV1(registration, {
  schemaVersion: 1,
  registrationDigest: registration.registrationDigest,
  entries: registration.cells.map(({ cellId }) =>
    Object.freeze({
      schemaVersion: 1,
      cellId,
      status: "failure",
      reasonCode: "not_executed_in_contract_smoke",
      adaptiveResultDigest: null,
      centralizedResultDigest: null,
      adaptiveTraceDigest: null,
      centralizedTraceDigest: null,
      adaptiveLedgerDigest: null,
      centralizedLedgerDigest: null,
      fairnessDigest: null,
      adaptiveCampaignEvidenceDigest: null,
      centralizedCampaignEvidenceDigest: null,
    }),
  ),
});

assert.equal(validateCollectiveEvaluationCampaignRegistrationV1(registration).cells.length, 8);
assert.equal(validateCollectiveEvaluationCampaignManifestV1(manifest, registration).entries.length, 8);
assert.equal(normativeSchedule.length, 240);
assert.deepEqual(
  COLLECTIVE_STATISTICAL_CAMPAIGN_SCALE_LADDER_V1.map((entry) => [
    entry.agentCount,
    entry.directedEdgeCount,
    entry.maximumInteractions,
    entry.pairedSeedsPerStratum,
  ]),
  [
    [50, 300, 1_000, 10],
    [100, 700, 1_600, 10],
    [250, 2_000, 3_000, 10],
    [500, 4_500, 5_000, 30],
  ],
);

process.stdout.write(
  `${JSON.stringify({
    status: "passed",
    scope: "registration_and_artifact_contract_smoke_only",
    releaseEvidence: false,
    sourceCommit,
    sourceDirty,
    preflightCells: registration.cells.length,
    normativeCells: normativeSchedule.length,
    executionSlotsPerCell: 4,
    registrationDigest: registration.registrationDigest,
    manifestDigest: manifest.manifestDigest,
    faultMatrixDigest: faultMatrix.faultMatrixDigest,
  })}\n`,
);
