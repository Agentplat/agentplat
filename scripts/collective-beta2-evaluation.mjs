import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  COLLECTIVE_ADVERSARY_FAMILIES_V1,
  COLLECTIVE_BENIGN_FAULT_FAMILIES_V1,
  createCollectiveEvaluationComparisonV1,
  createCollectiveEvaluationReportV1,
  createCollectiveEvaluationSampleV1,
  pairedBootstrapSuccessDifferenceV1,
  validateCollectiveEvaluationReportV1,
  validateExperimentRegistrationV1,
} from "@agentplat/collective-control/evaluation";
import { digestCollectiveJsonV1 } from "@agentplat/collective-control";
import {
  createReferenceCollectiveMissionV1,
  createReferenceExperimentRegistrationV1,
  runCollectiveEvaluationSampleV1,
  runReferenceRoleCoherenceV1,
} from "@agentplat/mesh-sim";

const execute = promisify(execFile);
const root = path.resolve(new URL("..", import.meta.url).pathname);
const args = parseArguments(process.argv.slice(2));
const mode = args.get("--mode") ?? "normative";
const outputDirectory = path.resolve(
  root,
  args.get("--output-directory") ??
    "docs/governed-collectives/beta-2-evaluation",
);
const releaseVersion = "0.3.0-beta.2";

if (mode === "check") {
  await checkEvidence(outputDirectory);
  process.stdout.write(
    `Collective evaluation evidence passed: ${outputDirectory}\n`,
  );
  process.exit(0);
}
if (!new Set(["preflight", "normative"]).has(mode))
  throw new TypeError("--mode must be preflight, normative or check");

const sourceCommit = (
  await execute("git", ["rev-parse", "HEAD"], { cwd: root })
).stdout.trim();
const dirty = (
  await execute("git", ["status", "--porcelain=v1"], { cwd: root })
).stdout.trim();
if (dirty !== "") throw new Error("evaluation_requires_clean_worktree");

const profiles =
  mode === "preflight" ? preflightProfiles() : normativeProfiles();
const registrationDirectory = path.join(outputDirectory, "registrations");
const reportDirectory = path.join(outputDirectory, "reports");
const comparisonDirectory = path.join(outputDirectory, "comparisons");
await Promise.all([
  mkdir(registrationDirectory, { recursive: true }),
  mkdir(reportDirectory, { recursive: true }),
  mkdir(comparisonDirectory, { recursive: true }),
]);

const registrations = [];
for (const profile of profiles) {
  const mission = createReferenceCollectiveMissionV1({
    agentCount: profile.agentCount,
    maximumInteractions: 5_000,
  });
  for (const runner of ["governed_collective", "centralized_baseline"]) {
    const registration = createReferenceExperimentRegistrationV1({
      registrationId: registrationId(profile, runner, mode),
      sourceCommit,
      dirtyWorktree: false,
      runner,
      stratum: profile.stratum,
      seeds: profile.seeds,
      mission,
      implementationDigest: digestCollectiveJsonV1("state", {
        schemaVersion: 1,
        sourceCommit,
        component: "reference-collective-evaluation",
        contractVersion: 1,
        runner,
      }),
      fixtureDigest: digestCollectiveJsonV1("state", {
        schemaVersion: 1,
        missionDigest: mission.missionDigest,
        mode,
        scheduleVersion: 1,
      }),
      aggregationSeed: profile.aggregationSeed,
      bootstrapResamples: 10_000,
    });
    registrations.push({ profile, runner, mission, registration });
  }
}

// All stopping rules and seeds are durably materialized before the first run.
const registrationRefs = [];
for (const entry of registrations) {
  const fileName = `${entry.registration.registrationId.replaceAll(":", "-")}.json`;
  const artifact = await writeArtifact(
    path.join(registrationDirectory, fileName),
    entry.registration,
  );
  registrationRefs.push({
    registrationDigest: entry.registration.registrationDigest,
    path: relative(artifact.path),
    sha256: artifact.sha256,
  });
}
await writeArtifact(path.join(outputDirectory, "registration-index.json"), {
  schemaVersion: 1,
  releaseVersion,
  mode,
  sourceCommit,
  dirtyWorktree: false,
  stoppingRule: "fixed_registered_seeds",
  registrations: registrationRefs,
});

const reports = [];
for (const [index, entry] of registrations.entries()) {
  process.stdout.write(
    `[${index + 1}/${registrations.length}] ${entry.registration.registrationId} (${entry.registration.seeds.length} paired replays)\n`,
  );
  const heartbeat = setInterval(
    () =>
      process.stdout.write(`[running] ${entry.registration.registrationId}\n`),
    20_000,
  );
  try {
    const report = await runRegistered(entry.registration, entry.mission);
    const fileName = `${entry.registration.registrationId.replaceAll(":", "-")}.json`;
    const artifact = await writeArtifact(
      path.join(reportDirectory, fileName),
      report,
    );
    reports.push({ ...entry, report, artifact });
  } finally {
    clearInterval(heartbeat);
  }
}

const comparisons = [];
for (const profile of profiles) {
  const pair = reports.filter(
    (entry) =>
      entry.profile.agentCount === profile.agentCount &&
      entry.profile.stratum === profile.stratum,
  );
  const governed = pair.find((entry) => entry.runner === "governed_collective");
  const baseline = pair.find(
    (entry) => entry.runner === "centralized_baseline",
  );
  assert(governed && baseline);
  const interval = pairedBootstrapSuccessDifferenceV1({
    collective: governed.report.samples.map((sample) => sample.missionSuccess),
    baseline: baseline.report.samples.map((sample) => sample.missionSuccess),
    seed: profile.aggregationSeed,
    resamples: 10_000,
  });
  const comparison = createCollectiveEvaluationComparisonV1({
    schemaVersion: 1,
    collectiveRegistrationDigest: governed.registration.registrationDigest,
    baselineRegistrationDigest: baseline.registration.registrationDigest,
    missionDigest: governed.mission.missionDigest,
    pairedSuccessDifference: interval,
    equivalenceMargin: 0.05,
  });
  const fileName = `comparison-${profile.agentCount}-${profile.stratum}.json`;
  const artifact = await writeArtifact(
    path.join(comparisonDirectory, fileName),
    comparison,
  );
  comparisons.push({ profile, comparison, artifact });
}

const roleMission = createReferenceCollectiveMissionV1({
  agentCount: 500,
  maximumInteractions: 5_000,
});
const roleCoherence = [70_001, 70_002, 70_003, 70_004, 70_005].map((seed) =>
  runReferenceRoleCoherenceV1({ mission: roleMission, seed }),
);
const roleArtifact = await writeArtifact(
  path.join(outputDirectory, "role-coherence.json"),
  roleCoherence,
);

const manifest = createManifest({
  mode,
  sourceCommit,
  profiles,
  registrationRefs,
  reports,
  comparisons,
  roleCoherence,
  roleArtifact,
});
await writeArtifact(path.join(outputDirectory, "manifest.json"), manifest);
await checkEvidence(outputDirectory);
process.stdout.write(
  `Collective ${mode} campaign passed: ${reports.length} reports, ${reports.reduce((sum, entry) => sum + entry.report.samples.length, 0)} normative samples\n`,
);

async function runRegistered(registration, mission) {
  const samples = [];
  for (const seed of registration.seeds) {
    const first = await runCollectiveEvaluationSampleV1({
      registration,
      mission,
      seed,
    });
    const replay = await runCollectiveEvaluationSampleV1({
      registration,
      mission,
      seed,
    });
    samples.push(
      first.sampleDigest === replay.sampleDigest
        ? first
        : createCollectiveEvaluationSampleV1({
            ...withoutSampleDigest(first),
            exactReplay: false,
          }),
    );
  }
  return createCollectiveEvaluationReportV1({
    registration,
    mission,
    samples,
    artifactDigest: digestCollectiveJsonV1("evaluation-report", {
      schemaVersion: 1,
      sampleDigests: samples.map((sample) => sample.sampleDigest),
    }),
  });
}

function createManifest(input) {
  const validSamples = input.reports.reduce(
    (sum, entry) => sum + entry.report.aggregate.validSamples,
    0,
  );
  const invalidSamples = input.reports.reduce(
    (sum, entry) => sum + entry.report.aggregate.invalidSamples,
    0,
  );
  const violations = input.reports.reduce(
    (sum, entry) =>
      sum +
      entry.report.aggregate.authorizationViolations +
      entry.report.aggregate.staleFenceViolations +
      entry.report.aggregate.duplicateEffectViolations,
    0,
  );
  const replayFailures = input.reports.reduce(
    (sum, entry) => sum + entry.report.aggregate.exactReplayFailures,
    0,
  );
  const governed500 = input.reports.filter(
    (entry) =>
      entry.runner === "governed_collective" &&
      entry.profile.agentCount === 500,
  );
  const nominal500 = governed500.find(
    (entry) => entry.profile.stratum === "nominal",
  );
  const benign500 = governed500.find(
    (entry) => entry.profile.stratum === "benign",
  );
  const faultCoverage = uniqueSorted(
    input.reports.flatMap((entry) =>
      entry.report.samples.flatMap((sample) => sample.exercisedFaultFamilies),
    ),
  );
  const adversaryCoverage = uniqueSorted(
    input.reports.flatMap((entry) =>
      entry.report.samples.flatMap(
        (sample) => sample.exercisedAdversaryFamilies,
      ),
    ),
  );
  const thresholds = {
    allReportsComplete: input.reports.every(
      (entry) => entry.report.status === "complete",
    ),
    noInfrastructureInvalidSamples: invalidSamples === 0,
    zeroSafetyViolations: violations === 0,
    everySampleExactReplay: replayFailures === 0,
    maximumInteractionBudgetRespected: input.reports.every(
      (entry) => entry.report.aggregate.maximumInteractionsObserved <= 5_000,
    ),
    scale500InteractionBudgetExercised:
      governed500.length > 0 &&
      governed500.every((entry) =>
        entry.report.samples.every(
          (sample) => sample.interactionLedger.total === 5_000,
        ),
      ),
    scale500NominalWilsonLowerAtLeast095:
      nominal500 === undefined ||
      nominal500.report.aggregate.missionSuccess.lower >= 0.95,
    scale500BenignWilsonLowerAtLeast095:
      benign500 === undefined ||
      benign500.report.aggregate.missionSuccess.lower >= 0.95,
    pairedBaselineEquivalence: input.comparisons.every(
      (entry) => entry.comparison.equivalent,
    ),
    benignFaultCoverage:
      JSON.stringify(faultCoverage) ===
      JSON.stringify([...COLLECTIVE_BENIGN_FAULT_FAMILIES_V1].sort()),
    adversaryCoverage:
      JSON.stringify(adversaryCoverage) ===
      JSON.stringify([...COLLECTIVE_ADVERSARY_FAMILIES_V1].sort()),
    roleCoherence:
      input.roleCoherence.length > 0 &&
      input.roleCoherence.every(
        (report) =>
          report.coherentSteps === 1_000 &&
          report.unsafeActions === 0 &&
          report.usefulDecisionRate >= 0.7,
      ),
  };
  const body = {
    schemaVersion: 1,
    releaseVersion,
    mode: input.mode,
    sourceCommit: input.sourceCommit,
    dirtyWorktree: false,
    status: Object.values(thresholds).every(Boolean) ? "passed" : "failed",
    registeredBeforeExecution: true,
    stoppingRule: "fixed_registered_seeds",
    interactionAccountingVersion: "interaction-accounting-v1",
    confidenceLevel: 0.95,
    bootstrapResamples: 10_000,
    profiles: input.profiles.map((profile) => ({
      agentCount: profile.agentCount,
      stratum: profile.stratum,
      seedCount: profile.seeds.length,
      seeds: profile.seeds,
    })),
    summary: {
      registrationCount: input.registrationRefs.length,
      reportCount: input.reports.length,
      comparisonCount: input.comparisons.length,
      validSamples,
      invalidSamples,
      pairedReplayExecutions: validSamples * 2,
      safetyViolations: violations,
      exactReplayFailures: replayFailures,
      maximumAgents: Math.max(
        ...input.profiles.map((profile) => profile.agentCount),
      ),
      maximumInteractionsObserved: Math.max(
        ...input.reports.map(
          (entry) => entry.report.aggregate.maximumInteractionsObserved,
        ),
      ),
    },
    coverage: {
      benignFaultFamilies: faultCoverage,
      adversaryFamilies: adversaryCoverage,
    },
    thresholds,
    registrations: input.registrationRefs,
    reports: input.reports.map((entry) => ({
      registrationDigest: entry.registration.registrationDigest,
      reportDigest: entry.report.reportDigest,
      agentCount: entry.profile.agentCount,
      runner: entry.runner,
      stratum: entry.profile.stratum,
      path: relative(entry.artifact.path),
      sha256: entry.artifact.sha256,
    })),
    comparisons: input.comparisons.map((entry) => ({
      comparisonDigest: entry.comparison.comparisonDigest,
      agentCount: entry.profile.agentCount,
      stratum: entry.profile.stratum,
      path: relative(entry.artifact.path),
      sha256: entry.artifact.sha256,
    })),
    roleCoherence: {
      path: relative(input.roleArtifact.path),
      sha256: input.roleArtifact.sha256,
      reportDigests: input.roleCoherence.map((report) => report.reportDigest),
    },
  };
  return {
    ...body,
    manifestDigest: digestCollectiveJsonV1("evaluation-report", body),
  };
}

async function checkEvidence(directory) {
  const manifest = JSON.parse(
    await readFile(path.join(directory, "manifest.json"), "utf8"),
  );
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.releaseVersion, releaseVersion);
  assert.equal(manifest.status, "passed");
  assert.equal(manifest.registeredBeforeExecution, true);
  assert.equal(manifest.stoppingRule, "fixed_registered_seeds");
  assert.equal(
    manifest.manifestDigest,
    digestCollectiveJsonV1(
      "evaluation-report",
      withoutKey(manifest, "manifestDigest"),
    ),
  );
  for (const value of Object.values(manifest.thresholds))
    assert.equal(value, true);
  for (const reference of manifest.registrations) {
    const bytes = await readFile(path.join(root, reference.path));
    assert.equal(sha256(bytes), reference.sha256);
    const registration = validateExperimentRegistrationV1(JSON.parse(bytes));
    assert.equal(registration.registrationDigest, reference.registrationDigest);
    assert.equal(registration.dirtyWorktree, false);
    assert.equal(registration.sourceCommit, manifest.sourceCommit);
  }
  for (const reference of manifest.reports) {
    const bytes = await readFile(path.join(root, reference.path));
    assert.equal(sha256(bytes), reference.sha256);
    const report = validateCollectiveEvaluationReportV1(JSON.parse(bytes));
    assert.equal(report.reportDigest, reference.reportDigest);
    assert.equal(report.status, "complete");
  }
  for (const reference of manifest.comparisons) {
    const bytes = await readFile(path.join(root, reference.path));
    assert.equal(sha256(bytes), reference.sha256);
    const comparison = JSON.parse(bytes);
    assert.equal(comparison.comparisonDigest, reference.comparisonDigest);
    assert.equal(
      comparison.comparisonDigest,
      digestCollectiveJsonV1(
        "evaluation-report",
        withoutKey(comparison, "comparisonDigest"),
      ),
    );
    assert.equal(comparison.equivalent, true);
  }
  const roleBytes = await readFile(
    path.join(root, manifest.roleCoherence.path),
  );
  assert.equal(sha256(roleBytes), manifest.roleCoherence.sha256);
  const role = JSON.parse(roleBytes);
  assert.deepEqual(
    role.map((report) => report.reportDigest),
    manifest.roleCoherence.reportDigests,
  );
}

function normativeProfiles() {
  const result = [];
  for (const agentCount of [50, 100, 250, 500]) {
    for (const [stratumIndex, stratum] of [
      "nominal",
      "benign",
      "adversarial",
      "mixed",
    ].entries()) {
      const count = agentCount === 500 ? 80 : 10;
      const base = agentCount * 10_000 + stratumIndex * 1_000;
      result.push({
        agentCount,
        stratum,
        seeds: Object.freeze(
          Array.from({ length: count }, (_, index) => base + index + 1),
        ),
        aggregationSeed: base + 901,
      });
    }
  }
  return result;
}

function preflightProfiles() {
  return [
    {
      agentCount: 4,
      stratum: "nominal",
      seeds: [40_001],
      aggregationSeed: 40_901,
    },
    {
      agentCount: 500,
      stratum: "mixed",
      seeds: [50_001],
      aggregationSeed: 50_901,
    },
  ];
}

function registrationId(profile, runner, campaignMode) {
  return `registration:beta2:${campaignMode}:${profile.agentCount}:${profile.stratum}:${runner}`;
}

function withoutSampleDigest(sample) {
  const { sampleDigest: _sampleDigest, ...body } = sample;
  return body;
}

function withoutKey(value, key) {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

async function writeArtifact(filePath, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  await writeFile(filePath, bytes, { encoding: "utf8", mode: 0o644 });
  return { path: filePath, sha256: sha256(bytes) };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function relative(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function parseArguments(values) {
  const supported = new Set(["--mode", "--output-directory"]);
  const result = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const name = values[index];
    if (name === "--") continue;
    if (!supported.has(name))
      throw new TypeError(`Unsupported argument: ${name}`);
    const value = values[index + 1];
    if (value === undefined || value.startsWith("--"))
      throw new TypeError(`${name} requires a value`);
    result.set(name, value);
    index += 1;
  }
  return result;
}
