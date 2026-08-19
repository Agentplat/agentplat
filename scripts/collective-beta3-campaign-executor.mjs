import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  COLLECTIVE_EVALUATION_DIAGNOSTIC_CAMPAIGN_PROFILE_V1,
  collectiveEvaluationCampaignProfileCellsV1,
  createCollectiveEvaluationCampaignRegistrationV1,
} from "@agentplat/collective-planning/evaluation";
import {
  aggregateCollectiveStatisticalCampaignV1,
  createCollectiveClosedLoopReferenceRuntimeV1,
  createCollectiveClosedLoopReferenceScenarioV1,
  createCollectiveClosedLoopResilienceReferenceScenarioV1,
  createCollectiveStatisticalCampaignFaultMatrixV1,
  createCollectiveStatisticalCampaignScaleConfigurationV1,
  digestCollectiveStatisticalCampaignArtifactV1,
  runAdaptiveCollectiveClosedLoopResilienceV1,
  runAdaptiveCollectiveClosedLoopV1,
  runCentralizedPlannerClosedLoopResilienceV1,
  runCentralizedPlannerClosedLoopV1,
  runCollectiveStatisticalCampaignShardV1,
  validateCollectiveStatisticalCampaignExecutionArtifactsV1,
  verifyCollectiveStatisticalCampaignBundleV1,
} from "@agentplat/mesh-sim";
import {
  createLocalCollectiveStatisticalCampaignExecutionStoreV1,
  openCollectiveStatisticalCampaignLocalStoreV1,
} from "@agentplat/mesh-sim-local";

const strata = Object.freeze(["nominal", "benign", "adversarial", "mixed"]);
const options = parseOptions(process.argv.slice(2));

if (options.mode === "diagnostic") await runDiagnostic(options);
else if (options.mode === "collect-diagnostic")
  await collectDiagnostic(options);
else throw new TypeError("campaign executor mode is invalid");

async function runDiagnostic(options) {
  exactOptionNames(options, [
    "execution-id",
    "mode",
    "output-directory",
    "scale",
    "seed-count",
    "stratum",
  ]);
  const scale = scaleValue(options.scale);
  const stratum = stratumValue(options.stratum);
  const seedCount = seedCountValue(options["seed-count"]);
  const executionId = diagnosticExecutionId(options["execution-id"]);
  const outputDirectory = absoluteDirectory(options["output-directory"]);
  const prepared = prepareRegistration();
  const selectedCells = prepared.registration.cells.filter(
    (cell) =>
      cell.peerCount === scale &&
      cell.stratum === stratum &&
      cell.seed < seedCount,
  );
  if (selectedCells.length !== seedCount)
    throw new TypeError("diagnostic shard does not match registered cells");

  await mkdir(outputDirectory, { recursive: true });
  // This file is published before any runner or local evidence store executes.
  await writeJsonAtomic(
    path.join(outputDirectory, "registration.json"),
    prepared.registration,
  );
  await writeJsonAtomic(
    path.join(outputDirectory, "provenance.json"),
    prepared.provenance,
  );

  const local = await openCollectiveStatisticalCampaignLocalStoreV1({
    root: path.join(outputDirectory, "store"),
  });
  const lock = await local.acquireCampaignLockV1(
    `${prepared.registration.registrationDigest}:${scale}:${stratum}`,
  );
  const store = createLocalCollectiveStatisticalCampaignExecutionStoreV1(local);
  const runtimeByScope = new Map();
  const executions = [];
  let executedSlotCount = 0;
  let resumedSlotCount = 0;
  let failedSlotCount = 0;
  let failure = null;
  try {
    for (const cell of selectedCells) {
      const index = prepared.registration.cells.findIndex(
        (candidate) => candidate.cellId === cell.cellId,
      );
      const result = await runCollectiveStatisticalCampaignShardV1({
        schemaVersion: 1,
        registration: prepared.registration,
        executionId,
        workerId: `worker:diagnostic:${scale}:${stratum}`,
        shard: {
          schemaVersion: 1,
          index,
          count: prepared.registration.cells.length,
        },
        leaseDurationMs: 24 * 60 * 1_000,
        maximumCells: 1,
        store,
        now: () => Date.now(),
        execute: async (context) => {
          const runtimeKey = `${context.cell.cellId}\0${context.runner}`;
          let runtime = runtimeByScope.get(runtimeKey);
          if (runtime === undefined) {
            runtime = await createCollectiveClosedLoopReferenceRuntimeV1(
              context.cell.peerCount,
            );
            runtimeByScope.set(runtimeKey, runtime);
          }
          return executeReferenceDiagnostic(context, runtime);
        },
      });
      executions.push(...result.executions);
      executedSlotCount += result.executedSlotCount;
      resumedSlotCount += result.resumedSlotCount;
      failedSlotCount += result.failedSlotCount;
    }
  } catch (error) {
    failure =
      error instanceof Error ? error.message : "unknown_executor_failure";
  } finally {
    await lock.release();
  }
  if (failure === null && failedSlotCount > 0)
    failure = `${failedSlotCount} diagnostic runner slots failed`;

  const shard = {
    schemaVersion: 1,
    status: failure === null ? "completed" : "failed",
    reasonCode: failure === null ? null : "executor_failed",
    detail: failure,
    releaseEvidence: false,
    diagnosticReferenceRunner: true,
    executionId,
    scale,
    stratum,
    seedCount,
    executedSlotCount,
    resumedSlotCount,
    failedSlotCount,
    registration: prepared.registration,
    provenance: prepared.provenance,
    executions,
  };
  const shardPath = path.join(
    outputDirectory,
    `shard-${scale}-${stratum}.json`,
  );
  await writeJsonAtomic(shardPath, shard);
  process.stdout.write(
    `${JSON.stringify({
      status: shard.status,
      releaseEvidence: false,
      scale,
      stratum,
      seedCount,
      executions: executions.length,
      executedSlotCount,
      resumedSlotCount,
      failedSlotCount,
      registrationDigest: prepared.registration.registrationDigest,
      output: shardPath,
    })}\n`,
  );
  if (failure !== null) process.exitCode = 1;
}

async function executeReferenceDiagnostic(context, runtime) {
  const resilient = context.cell.stratum !== "nominal";
  const scenario = resilient
    ? await createCollectiveClosedLoopResilienceReferenceScenarioV1({
        runner: context.runner,
        peerCount: context.cell.peerCount,
        runtime,
      })
    : await createCollectiveClosedLoopReferenceScenarioV1({
        runner: context.runner,
        peerCount: context.cell.peerCount,
        runtime,
      });
  const result = resilient
    ? context.runner === "adaptive_collective"
      ? await runAdaptiveCollectiveClosedLoopResilienceV1(scenario)
      : await runCentralizedPlannerClosedLoopResilienceV1(scenario)
    : context.runner === "adaptive_collective"
      ? await runAdaptiveCollectiveClosedLoopV1(scenario)
      : await runCentralizedPlannerClosedLoopV1(scenario);
  const run = resilient ? result.resilience.run : result.run;
  const passed =
    run.stopReason === "plan_completed" &&
    result.evidence.monitorVerdict.missionSuccess &&
    result.trace.ledger.total <= context.maximumInteractions;
  const reasonCode = passed
    ? null
    : run.stopReason !== "plan_completed"
      ? "runner_not_completed"
      : result.trace.ledger.total > context.maximumInteractions
        ? "interaction_limit_exceeded"
        : "invariant_monitor_failed";
  const semanticProjection = projectDiagnosticSemanticMetrics(
    context,
    result.trace.events,
    result.evidence.monitorVerdict,
  );
  const outcome = resilient
    ? {
        stratum: context.cell.stratum,
        runDigest: run.runDigest,
        resilienceResultDigest: result.resilience.resilienceResultDigest,
        campaignEvidenceDigest: result.campaignEvidence.campaignEvidenceDigest,
        traceDigest: result.trace.traceDigest,
        evidenceDigest: result.evidence.evidenceDigest,
        monitorVerdict: result.evidence.monitorVerdict,
        publicArtifactDigests: result.evidence.publicArtifactDigests,
        faultMatrixBindingDigest: result.faultMatrixBindingDigest,
        stopReason: run.stopReason,
        semanticProjection,
      }
    : {
        stratum: context.cell.stratum,
        runDigest: run.runDigest,
        traceDigest: result.trace.traceDigest,
        evidenceDigest: result.evidence.evidenceDigest,
        monitorVerdict: result.evidence.monitorVerdict,
        publicArtifactDigests: result.evidence.publicArtifactDigests,
        stopReason: run.stopReason,
        semanticProjection,
      };
  return {
    schemaVersion: 1,
    status: passed ? "passed" : "failed",
    reasonCode,
    outcome,
    traceRecords: result.trace.events,
    ledgerRecords: [result.trace.ledger],
    observations: result.observations,
  };
}

export function projectDiagnosticSemanticMetrics(context, traceEvents, monitorVerdict) {
  const events = Array.isArray(traceEvents) ? traceEvents : [];
  const inferenceEvents = events.filter(
    (event) => event.kind === "inference.assessed" && event.status === "accepted",
  );
  const dispatchEvents = events.filter(
    (event) => event.kind === "effect.dispatch" && event.status === "accepted",
  );
  const committedEffects = events.filter(
    (event) => event.kind === "environment.effect.committed" && event.status === "accepted",
  );
  const unsafeExecutableCount = Object.entries(monitorVerdict ?? {})
    .filter(([key]) => key.endsWith("Violations"))
    .reduce((total, [, value]) => total + Number(value ?? 0), 0);
  const roleDecisionCount = inferenceEvents.length;
  const usefulDecisionCount = Math.min(inferenceEvents.length, committedEffects.length);
  const convergenceEvidencePresent = false;
  const body = {
    schemaVersion: 1,
    projectionOwner: "evaluator",
    evaluatorBasis: "trace-and-monitor-v1",
    cellId: context.cell.cellId,
    runner: context.runner,
    attempt: context.attempt,
    registeredDecisionPopulation: 1_000,
    roleDecisionCount,
    usefulDecisionCount,
    usefulDecisionRate: roleDecisionCount === 0 ? null : usefulDecisionCount / roleDecisionCount,
    unsafeExecutableCount,
    convergenceEvidencePresent,
    convergenceAgreement: null,
    convergenceInteractionDelta: null,
    convergenceReasonCode: "convergence_evidence_missing",
    observedInferenceEventIds: inferenceEvents.map((event) => event.eventId),
    observedDispatchEventIds: dispatchEvents.map((event) => event.eventId),
    observedCommittedEffectEventIds: committedEffects.map((event) => event.eventId),
    status:
      roleDecisionCount === 1_000 && convergenceEvidencePresent
        ? "complete"
        : "incomplete",
  };
  return Object.freeze({
    ...body,
    projectionDigest: digest("diagnostic-semantic-projection", body),
  });
}

async function collectDiagnostic(options) {
  exactOptionNames(options, [
    "execution-id",
    "input-directory",
    "mode",
    "output-directory",
    "scheduled",
    "seed-count",
    "selected-scale",
    "selected-stratum",
  ]);
  const inputDirectory = absoluteDirectory(options["input-directory"]);
  const outputDirectory = absoluteDirectory(options["output-directory"]);
  const scheduled = booleanValue(options.scheduled, "scheduled");
  const seedCount = seedCountValue(options["seed-count"]);
  const expectedExecutionId = diagnosticExecutionId(options["execution-id"]);
  const selectedScales = scheduled
    ? [50, 100]
    : [scaleValue(options["selected-scale"])];
  const selectedStrata =
    scheduled || options["selected-stratum"] === "all"
      ? [...strata]
      : [stratumValue(options["selected-stratum"])];
  if (scheduled && seedCount !== 2)
    throw new TypeError(
      "scheduled diagnostics require the closed two-seed profile",
    );
  await mkdir(outputDirectory, { recursive: true });

  let collection;
  try {
    const files = (await listFiles(inputDirectory)).filter((file) =>
      /^shard-(50|100)-(nominal|benign|adversarial|mixed)\.json$/u.test(
        path.basename(file),
      ),
    );
    const shards = await Promise.all(
      files.map(async (file) => JSON.parse(await readFile(file, "utf8"))),
    );
    const expectedScopes = selectedScales.flatMap((scale) =>
      selectedStrata.map((stratum) => `${scale}/${stratum}`),
    );
    const byScope = new Map();
    for (const shard of shards) {
      const scope = `${shard.scale}/${shard.stratum}`;
      if (byScope.has(scope))
        throw new TypeError(`duplicate diagnostic shard: ${scope}`);
      byScope.set(scope, shard);
    }
    if (
      byScope.size !== expectedScopes.length ||
      expectedScopes.some((scope) => !byScope.has(scope))
    )
      throw new TypeError("diagnostic shard closure is incomplete");
    const ordered = expectedScopes.map((scope) => byScope.get(scope));
    const registrationDigest = ordered[0]?.registration?.registrationDigest;
    if (
      typeof registrationDigest !== "string" ||
      ordered.some(
        (shard) =>
          shard.status !== "completed" ||
          shard.releaseEvidence !== false ||
          shard.executionId !== expectedExecutionId ||
          shard.seedCount !== seedCount ||
          shard.registration.registrationDigest !== registrationDigest,
      )
    )
      throw new TypeError(
        "diagnostic shards do not share a completed registration",
      );
    const registration = ordered[0].registration;
    const provenance = ordered[0].provenance;
    if (
      ordered.some(
        (shard) =>
          JSON.stringify(shard.provenance) !== JSON.stringify(provenance),
      )
    )
      throw new TypeError("diagnostic shard provenance conflicts");
    const rawExecutions = ordered.flatMap((shard) => shard.executions);
    const expectedCells = registration.cells.filter(
      (cell) =>
        selectedScales.includes(cell.peerCount) &&
        selectedStrata.includes(cell.stratum) &&
        cell.seed < seedCount,
    );
    const expectedExecutionCount = expectedCells.length * 4;
    if (rawExecutions.length !== expectedExecutionCount)
      throw new TypeError("diagnostic execution closure is incomplete");
    const expectedSlots = new Set(
      expectedCells.flatMap((cell) =>
        ["adaptive_collective", "centralized_planner"].flatMap((runner) =>
          ["first", "replay"].map(
            (attempt) => `${cell.cellId}\0${runner}\0${attempt}`,
          ),
        ),
      ),
    );
    const seenSlots = new Set();
    const executions = rawExecutions.map((execution) => {
      const validated =
        validateCollectiveStatisticalCampaignExecutionArtifactsV1(
          registration,
          expectedExecutionId,
          execution,
        );
      const slot = `${validated.cellId}\0${validated.runner}\0${validated.attempt}`;
      if (!expectedSlots.has(slot) || seenSlots.has(slot))
        throw new TypeError("diagnostic execution slot closure is invalid");
      seenSlots.add(slot);
      return validated;
    });
    if (seenSlots.size !== expectedSlots.size)
      throw new TypeError("diagnostic execution slot closure is incomplete");

    collection = {
      schemaVersion: 1,
      status: "passed",
      releaseEvidence: false,
      bundleProduced: false,
      registrationDigest,
      selectedScales,
      selectedStrata,
      seedCount,
      shardCount: ordered.length,
      executionCount: executions.length,
    };
    if (expectedCells.length === registration.cells.length) {
      if (provenance.sourceLock.dirtyWorktree !== false)
        throw new TypeError(
          "a dirty source lock cannot publish a diagnostic bundle",
        );
      const aggregated = await aggregateCollectiveStatisticalCampaignV1({
        schemaVersion: 1,
        registration,
        provenance,
        executions,
        bootstrap: { schemaVersion: 1, seed: 202, resamples: 10_000 },
        hooks: aggregationHooks(),
      });
      const verification = await verifyCollectiveStatisticalCampaignBundleV1(
        aggregated.bundle,
        aggregated.bytes,
        {
          expectedSourceLock: {
            sourceCommit: provenance.sourceLock.sourceCommit,
            sourceTreeDigest: provenance.sourceLock.sourceTreeDigest,
          },
          recomputeComparisonStatistics: comparisonStatistics,
          recomputeSummaryStatistics: summaryStatistics,
        },
      );
      await writeJsonAtomic(
        path.join(outputDirectory, "bundle.json"),
        aggregated.bundle,
      );
      const artifactDirectory = path.join(outputDirectory, "artifacts");
      await mkdir(artifactDirectory, { recursive: true });
      for (const [artifactId, bytes] of Object.entries(aggregated.bytes))
        await writeFile(
          path.join(artifactDirectory, `${safeFileName(artifactId)}.json`),
          bytes,
        );
      collection.bundleProduced = true;
      collection.bundleDigest = aggregated.bundle.bundleDigest;
      collection.verification = verification;
    }
  } catch (error) {
    collection = {
      schemaVersion: 1,
      status: "failed",
      releaseEvidence: false,
      bundleProduced: false,
      reasonCode: "diagnostic_collection_failed",
      detail:
        error instanceof Error ? error.message : "unknown collection error",
    };
    process.exitCode = 1;
  }
  await writeJsonAtomic(
    path.join(outputDirectory, "collection.json"),
    collection,
  );
  process.stdout.write(`${JSON.stringify(collection)}\n`);
}

function prepareRegistration() {
  const git = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  const sourceCommit = git(["rev-parse", "HEAD"]);
  const sourceTree = git(["rev-parse", "HEAD^{tree}"]);
  const dirtyWorktree =
    git(["status", "--porcelain", "--untracked-files=all"]).length > 0;
  const runIdentity = process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? "1"}`
    : sourceCommit.slice(0, 12);
  const campaignId = `campaign:diagnostic:${runIdentity}`;
  const sourceLock = {
    schemaVersion: 1,
    sourceCommit,
    sourceTreeDigest: digest("source-lock", {
      schemaVersion: 1,
      gitTree: sourceTree,
    }),
    dirtyWorktree,
  };
  const rootPackage = JSON.parse(
    execFileSync("git", ["show", "HEAD:package.json"], { encoding: "utf8" }),
  );
  const provenance = {
    sourceLock,
    packageLock: {
      schemaVersion: 1,
      packageVersion: rootPackage.version,
      pnpmLockBlob: git(["rev-parse", "HEAD:pnpm-lock.yaml"]),
    },
    fixture: {
      schemaVersion: 1,
      fixtureProfile: "beta3-diagnostic-reference-v1",
    },
    policy: { schemaVersion: 1, policyProfile: "paired-diagnostic-v1" },
    environment: {
      schemaVersion: 1,
      environmentProfile: "deterministic-reference-v1",
    },
    observationPolicy: {
      schemaVersion: 1,
      observationProfile: "public-reference-v1",
    },
    monitor: { schemaVersion: 1, monitorProfile: "terminal-reference-v1" },
    hiddenCanary: { schemaVersion: 1, canaryProfile: "digest-only-v1" },
  };
  const faultMatrix = createCollectiveStatisticalCampaignFaultMatrixV1();
  const schedule = collectiveEvaluationCampaignProfileCellsV1(
    COLLECTIVE_EVALUATION_DIAGNOSTIC_CAMPAIGN_PROFILE_V1,
    campaignId,
  );
  const cells = schedule.map((cell) => {
    const configuration =
      createCollectiveStatisticalCampaignScaleConfigurationV1({
        schemaVersion: 1,
        agentCount: cell.peerCount,
        seed: cell.seed,
        stratum: cell.stratum,
      });
    const definitionDigest = (runner) =>
      digest("registration", {
        schemaVersion: 1,
        diagnosticReferenceRunner: true,
        runner,
        configurationDigest: configuration.configurationDigest,
      });
    const faultPlanDigest = digest("registration", {
      schemaVersion: 1,
      cellId: cell.cellId,
      stratum: cell.stratum,
      configurationDigest: configuration.configurationDigest,
      registeredFaultFamilies: configuration.registeredFaultFamilies,
    });
    return {
      schemaVersion: 1,
      ...cell,
      maximumInteractions: configuration.maximumInteractions,
      scaleConfigurationDigest: configuration.configurationDigest,
      adaptiveDefinitionDigest: definitionDigest("adaptive_collective"),
      centralizedDefinitionDigest: definitionDigest("centralized_planner"),
      faultPlanDigest,
      faultMatrixBindingDigest: digest("registration", {
        schemaVersion: 1,
        cellId: cell.cellId,
        configurationDigest: configuration.configurationDigest,
        faultPlanDigest,
        faultMatrixDigest: faultMatrix.faultMatrixDigest,
      }),
    };
  });
  const registration = createCollectiveEvaluationCampaignRegistrationV1({
    schemaVersion: 1,
    campaignId,
    profile: COLLECTIVE_EVALUATION_DIAGNOSTIC_CAMPAIGN_PROFILE_V1,
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
    maximumInteractions: 1_600,
    cells,
  });
  return { registration, provenance };
}

function aggregationHooks() {
  return {
    computeComparisonStatistics: ({ adaptive, centralized }) =>
      comparisonStatistics(null, [adaptive], [centralized]),
    computeSummaryStatistics: ({ comparisons }) =>
      summaryStatistics(null, comparisons),
  };
}

function comparisonStatistics(_comparison, adaptive, centralized) {
  return {
    adaptivePassed: adaptive[0].status === "passed",
    centralizedPassed: centralized[0].status === "passed",
    pairedPass:
      adaptive[0].status === "passed" && centralized[0].status === "passed",
  };
}

function summaryStatistics(_summary, comparisons) {
  return {
    comparisonCount: comparisons.length,
    pairedPassCount: comparisons.filter(
      (comparison) => comparison.statistics.pairedPass === true,
    ).length,
  };
}

function digest(kind, value) {
  return digestCollectiveStatisticalCampaignArtifactV1(kind, value);
}

function parseOptions(args) {
  const result = Object.create(null);
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (
      !name?.startsWith("--") ||
      value === undefined ||
      value.startsWith("--")
    )
      throw new TypeError(
        "campaign executor arguments must be --name value pairs",
      );
    const key = name.slice(2);
    if (key in result)
      throw new TypeError(`duplicate campaign executor option: ${key}`);
    result[key] = value;
  }
  return result;
}

function exactOptionNames(value, expected) {
  const actual = Object.keys(value).sort();
  const names = [...expected].sort();
  if (
    actual.length !== names.length ||
    actual.some((name, index) => name !== names[index])
  )
    throw new TypeError("campaign executor option set is invalid");
}

function scaleValue(value) {
  if (value !== "50" && value !== "100")
    throw new TypeError("diagnostic scale must be 50 or 100");
  return Number(value);
}

function stratumValue(value) {
  if (!strata.includes(value))
    throw new TypeError("diagnostic stratum is invalid");
  return value;
}

function seedCountValue(value) {
  if (value !== "1" && value !== "2")
    throw new TypeError("diagnostic seed count must be one or two");
  return Number(value);
}

function diagnosticExecutionId(value) {
  if (
    typeof value !== "string" ||
    value.length > 128 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
  )
    throw new TypeError("diagnostic execution id is invalid");
  return `execution:diagnostic:${value}`;
}

function booleanValue(value, label) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new TypeError(`${label} must be true or false`);
}

function absoluteDirectory(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0"))
    throw new TypeError("output directory is invalid");
  return path.resolve(value);
}

async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temp, `${JSON.stringify(value)}\n`, { flag: "wx" });
  await rename(temp, file);
}

async function listFiles(root) {
  const result = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) result.push(file);
    }
  };
  await visit(root);
  return result;
}

function safeFileName(value) {
  return value.replace(/[^A-Za-z0-9._-]/gu, "_");
}
