import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  canonicalizePlanningJsonV1,
  digestPlanningJsonV1,
} from "../packages/collective-planning/dist/index.js";
import {
  COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
  collectiveEvaluationCampaignProfileCellsV1,
  createCollectiveEvaluationCampaignRegistrationV1,
  createNormativeOperationPlanV1,
  createNormativeRunnerDescriptorV1,
} from "../packages/collective-planning/dist/evaluation.js";

const CONFIRMATION = "RUN_NORMATIVE_240X4";
const RUNNERS = Object.freeze(["adaptive_collective", "centralized_planner"]);
const ATTEMPTS = Object.freeze(["first", "replay"]);
const INTERACTION_LIMIT = Object.freeze({
  50: 1_000,
  100: 1_600,
  250: 3_000,
  500: 5_000,
});
const JSON_LIMITS = Object.freeze({
  maximumBytes: 16 * 1024 * 1024,
  maximumDepth: 64,
  maximumNodes: 1_000_000,
  maximumKeysPerObject: 4_096,
  maximumItemsPerArray: 16_384,
});
const options = parseOptions(process.argv.slice(2));

if (options.mode === "plan") await plan(options);
else if (
  ["execute-shard", "collect", "analyze", "verify", "attest"].includes(
    options.mode,
  )
)
  await rejectUnregisteredAdapter(options);
else fail("normative_operation_mode_invalid");

async function plan(value) {
  exactOptions(value, [
    "campaign-id",
    "confirm",
    "mode",
    "output-directory",
    "source-sha",
  ]);
  if (!["DO_NOT_RUN", CONFIRMATION].includes(value.confirm))
    fail("normative_plan_confirmation_invalid");
  assertToken(value["campaign-id"], "campaign-id");
  assertCommit(value["source-sha"], "source-sha");
  const source = inspectCleanSource(value["source-sha"]);
  const outputDirectory = absoluteDirectory(value["output-directory"]);
  const commitments = createUnregisteredCommitments(source);
  const registration = createRegistration(
    value["campaign-id"],
    source,
    commitments,
  );
  const adapter = createUnregisteredDescriptor(commitments);
  const operationPlan = createNormativeOperationPlanV1({
    schemaVersion: 1,
    registration,
    sourceCommit: source.sourceCommit,
    sourceTreeDigest: source.sourceTreeDigest,
    adapter,
  });
  const slots = registration.cells.flatMap((cell) =>
    RUNNERS.flatMap((runner) =>
      ATTEMPTS.map((attempt) => ({
        schemaVersion: 1,
        slotId: `${cell.cellId}:${runner}:${attempt}`,
        cellId: cell.cellId,
        runner,
        attempt,
        slotIdentityDigest: artifactDigest("expected-slot", {
          registrationDigest: registration.registrationDigest,
          cellId: cell.cellId,
          runner,
          attempt,
        }),
      })),
    ),
  );
  const expectedBody = {
    schemaVersion: 1,
    kind: "collective_beta3_normative_expected_manifest",
    registrationDigest: registration.registrationDigest,
    planDigest: operationPlan.planDigest,
    cells: registration.cells.map((cell) => ({
      schemaVersion: 1,
      cellId: cell.cellId,
      peerCount: cell.peerCount,
      stratum: cell.stratum,
      seed: cell.seed,
      maximumInteractions: cell.maximumInteractions,
    })),
    slots,
  };
  const expected = {
    ...expectedBody,
    manifestDigest: artifactDigest("expected-manifest", expectedBody),
  };
  const estimateBody = {
    schemaVersion: 1,
    kind: "collective_beta3_normative_cost_estimate",
    registrationDigest: registration.registrationDigest,
    planDigest: operationPlan.planDigest,
    maximumInteractions: 3_296_000,
    calculation:
      "4 slots × (40 cells at 50 × 1,000 + 40 at 100 × 1,600 + 40 at 250 × 3,000 + 120 at 500 × 5,000)",
    cells: 240,
    slots: 960,
    shards: 48,
    cellsPerShard: 5,
    adapterRegistered: false,
    executionPermitted: false,
  };
  const estimate = {
    ...estimateBody,
    estimateDigest: artifactDigest("cost-estimate", estimateBody),
  };
  await mkdir(outputDirectory, { recursive: true });
  await writeJsonImmutable(
    path.join(outputDirectory, "source-lock.json"),
    source,
  );
  await writeJsonImmutable(
    path.join(outputDirectory, "adapter-descriptor.json"),
    adapter,
  );
  await writeJsonImmutable(
    path.join(outputDirectory, "registration.json"),
    registration,
  );
  await writeJsonImmutable(
    path.join(outputDirectory, "operation-plan.json"),
    operationPlan,
  );
  await writeJsonImmutable(
    path.join(outputDirectory, "expected-manifest.json"),
    expected,
  );
  await writeJsonImmutable(
    path.join(outputDirectory, "estimate.json"),
    estimate,
  );
  process.stdout.write(
    `${JSON.stringify({
      status: "planned",
      registrationDigest: registration.registrationDigest,
      planDigest: operationPlan.planDigest,
      maximumInteractions: estimate.maximumInteractions,
      adapterRegistered: false,
    })}\n`,
  );
}

function createRegistration(campaignId, source, commitments) {
  const schedule = collectiveEvaluationCampaignProfileCellsV1(
    COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
    campaignId,
  );
  return createCollectiveEvaluationCampaignRegistrationV1({
    schemaVersion: 1,
    campaignId,
    profile: COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
    sourceDigest: source.sourceTreeDigest,
    packageDigest: commitments.packageDigest,
    fixtureManifestDigest: commitments.fixtureManifestDigest,
    policyDigest: commitments.policyDigest,
    environmentDigest: commitments.environmentDigest,
    observationPolicyDigest: commitments.observationPolicyDigest,
    monitorDigest: commitments.monitorDigest,
    hiddenCanaryDigest: commitments.hiddenCanaryDigest,
    runners: ["adaptive_collective", "centralized_planner"],
    maximumInteractions: 5_000,
    cells: schedule.map((cell) => ({
      schemaVersion: 1,
      ...cell,
      maximumInteractions: INTERACTION_LIMIT[cell.peerCount],
      scaleConfigurationDigest: digestPlanningJsonV1(
        "evaluation-campaign-scale-configuration-v1",
        {
          schemaVersion: 1,
          peerCount: cell.peerCount,
          maximumInteractions: INTERACTION_LIMIT[cell.peerCount],
          status: "adapter_unregistered",
        },
      ),
      adaptiveDefinitionDigest: commitments.adaptiveDefinitionDigest,
      centralizedDefinitionDigest: commitments.centralizedDefinitionDigest,
      faultPlanDigest: artifactDigest("fault-plan-unregistered", {
        cellId: cell.cellId,
        stratum: cell.stratum,
        status: "adapter_unregistered",
      }),
      faultMatrixBindingDigest: digestPlanningJsonV1(
        "evaluation-campaign-fault-matrix-v1",
        {
          schemaVersion: 1,
          cellId: cell.cellId,
          stratum: cell.stratum,
          status: "adapter_unregistered",
        },
      ),
    })),
  });
}

function createUnregisteredCommitments(source) {
  return {
    packageDigest: artifactDigest("package-lock", source.packageLock),
    fixtureManifestDigest: artifactDigest("fixture-manifest", {
      status: "adapter_unregistered",
    }),
    policyDigest: artifactDigest("policy", { status: "adapter_unregistered" }),
    environmentDigest: artifactDigest("environment", {
      status: "adapter_unregistered",
    }),
    observationPolicyDigest: artifactDigest("observation-policy", {
      status: "adapter_unregistered",
    }),
    monitorDigest: artifactDigest("monitor", {
      status: "adapter_unregistered",
    }),
    hiddenCanaryDigest: artifactDigest("hidden-canary", {
      status: "adapter_unregistered",
    }),
    adaptiveDefinitionDigest: artifactDigest("adaptive-definition", {
      status: "adapter_unregistered",
    }),
    centralizedDefinitionDigest: artifactDigest("centralized-definition", {
      status: "adapter_unregistered",
    }),
  };
}

function createUnregisteredDescriptor(commitments) {
  return createNormativeRunnerDescriptorV1({
    schemaVersion: 1,
    adapterId: "adapter:unregistered",
    adapterVersion: "0.0.0",
    runnerClass: "diagnostic",
    capabilities: {
      schemaVersion: 1,
      runners: ["adaptive_collective", "centralized_planner"],
      scales: [50, 100, 250, 500],
      strata: ["nominal", "benign", "adversarial", "mixed"],
      traceSchemaVersion: 2,
      accountingVersion: "interaction-accounting-v2",
      environmentPortVersion: 1,
      monitorPortVersion: 1,
      exactReplay: false,
      evaluatorOwnedMetrics: false,
    },
    digests: {
      schemaVersion: 1,
      implementationDigest: artifactDigest("adapter-unregistered", {
        status: "unregistered",
      }),
      evaluatorDigest: artifactDigest("evaluator-unregistered", {
        status: "unregistered",
      }),
      scenarioDefinitionDigest: commitments.fixtureManifestDigest,
      fixtureDigest: commitments.fixtureManifestDigest,
      policyDigest: commitments.policyDigest,
      environmentDigest: commitments.environmentDigest,
      observationPolicyDigest: commitments.observationPolicyDigest,
      monitorDigest: commitments.monitorDigest,
    },
    limits: {
      schemaVersion: 1,
      maximumAgents: 500,
      maximumOutdegree: 9,
      maximumInteractionsPerExecution: 5_000,
      maximumTraceEventsPerExecution: 100_000,
      maximumArtifactBytesPerExecution: 16 * 1024 * 1024,
      maximumConcurrentCells: 1,
    },
  });
}

async function rejectUnregisteredAdapter(value) {
  requiredAndOptionalOptions(
    value,
    [
      "campaign-id",
      "confirm",
      "execution-id",
      "mode",
      "plan-digest",
      "registration-digest",
      "registration-directory",
      "run-attempt",
      "run-id",
      "source-sha",
    ],
    ["adapter", "shard"],
  );
  const directory = absoluteDirectory(value["registration-directory"]);
  assertToken(value["campaign-id"], "campaign-id");
  assertToken(value["execution-id"], "execution-id");
  assertToken(value["run-id"], "run-id");
  assertToken(value["run-attempt"], "run-attempt");
  assertCommit(value["source-sha"], "source-sha");
  assertDigest(value["registration-digest"], "registration-digest");
  assertDigest(value["plan-digest"], "plan-digest");
  if (
    value.shard !== undefined &&
    !/^(?:[0-9]|[1-3][0-9]|4[0-7])$/u.test(value.shard)
  )
    fail("normative_shard_invalid");
  const adapter = value.adapter;
  const reasonCode =
    value.confirm !== CONFIRMATION
      ? "normative_confirmation_required"
      : adapter === "diagnostic"
        ? "normative_diagnostic_adapter_rejected"
        : adapter === "synthetic"
          ? "normative_synthetic_adapter_rejected"
          : "normative_adapter_unregistered";
  const receipt = {
    schemaVersion: 1,
    kind: "collective_beta3_normative_receipt",
    status: "rejected",
    mode: value.mode,
    campaignId: value["campaign-id"],
    executionId: value["execution-id"],
    runId: value["run-id"],
    runAttempt: value["run-attempt"],
    sourceCommit: value["source-sha"],
    registrationDigest: value["registration-digest"],
    planDigest: value["plan-digest"],
    shard: value.shard === undefined ? null : Number(value.shard),
    reasonCode,
    adapterRegistered: false,
    executionPermitted: false,
  };
  const receiptWithDigest = {
    ...receipt,
    receiptDigest: artifactDigest("operation-receipt", receipt),
  };
  await mkdir(directory, { recursive: true });
  await writeJsonImmutable(
    path.join(
      directory,
      `receipt-${value.mode}-${createHash("sha256")
        .update(canonicalizePlanningJsonV1(receiptWithDigest))
        .digest("hex")}.json`,
    ),
    receiptWithDigest,
  );
  process.stderr.write(`${JSON.stringify(receiptWithDigest)}\n`);
  process.exitCode = 2;
}

function inspectCleanSource(expectedCommit) {
  const git = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  const sourceCommit = git(["rev-parse", "HEAD"]);
  if (sourceCommit !== expectedCommit) fail("normative_source_commit_mismatch");
  if (git(["status", "--porcelain", "--untracked-files=all"]).length > 0)
    fail("normative_source_worktree_dirty");
  const gitTree = git(["rev-parse", "HEAD^{tree}"]);
  const rootPackage = JSON.parse(
    execFileSync("git", ["show", "HEAD:package.json"], { encoding: "utf8" }),
  );
  const packageLock = {
    schemaVersion: 1,
    packageVersion: rootPackage.version,
    pnpmLockBlob: git(["rev-parse", "HEAD:pnpm-lock.yaml"]),
  };
  return {
    schemaVersion: 1,
    sourceCommit,
    sourceTreeDigest: artifactDigest("source-tree", {
      schemaVersion: 1,
      gitTree,
    }),
    dirtyWorktree: false,
    packageLock,
  };
}

function parseOptions(args) {
  const result = Object.create(null);
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const optionValue = args[index + 1];
    if (
      !name?.startsWith("--") ||
      optionValue === undefined ||
      optionValue.startsWith("--")
    )
      fail("normative_option_syntax_invalid");
    const key = name.slice(2);
    if (key in result) fail("normative_option_duplicate");
    result[key] = optionValue;
  }
  return result;
}

function exactOptions(value, expected) {
  const actual = Object.keys(value).sort();
  const names = [...expected].sort();
  if (
    actual.length !== names.length ||
    actual.some((name, index) => name !== names[index])
  )
    fail("normative_option_set_invalid");
}

function requiredAndOptionalOptions(value, required, optional) {
  const actual = Object.keys(value);
  if (
    required.some((key) => !(key in value)) ||
    actual.some((key) => !required.includes(key) && !optional.includes(key))
  )
    fail("normative_option_set_invalid");
}

function assertToken(value, label) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u.test(value)
  )
    fail(`normative_${label}_invalid`);
}

function assertCommit(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/u.test(value))
    fail(`normative_${label}_invalid`);
}

function assertDigest(value, label) {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(value))
    fail(`normative_${label}_invalid`);
}

function absoluteDirectory(value) {
  if (typeof value !== "string" || value.includes("\0"))
    fail("normative_output_directory_invalid");
  return path.resolve(value);
}

function artifactDigest(kind, value) {
  return digestPlanningJsonV1(
    "evaluation-campaign-artifact-v1",
    { schemaVersion: 1, kind, value },
    JSON_LIMITS,
  );
}

async function writeJsonImmutable(file, value) {
  const serialized = `${canonicalizePlanningJsonV1(value, JSON_LIMITS)}\n`;
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporary, serialized, { flag: "wx" });
    try {
      await link(temporary, file);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const existing = await readFile(file, "utf8");
      if (existing !== serialized)
        fail("normative_immutable_artifact_conflict");
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

function fail(reasonCode) {
  throw new TypeError(reasonCode);
}
