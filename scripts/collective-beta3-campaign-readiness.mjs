import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  link,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { digestPlanningJsonV1 } from "../packages/collective-planning/dist/index.js";
import {
  CAMPAIGN_READINESS_MAXIMUM_INTERACTIONS_V1,
  CAMPAIGN_READINESS_REQUIRED_CONTROL_IDS_V1,
  createCampaignCapacityEstimateV1,
  createCampaignReadinessEvidenceReceiptV1,
  createCampaignReadinessPlanV1,
  deriveCampaignReadinessAssessmentV1,
  validateCampaignCapacityEstimateV1,
  validateCampaignReadinessAssessmentV1,
  validateCampaignReadinessEvidenceReceiptV1,
  validateCampaignReadinessPlanV1,
  validateCollectiveEvaluationCampaignRegistrationV1,
  validateNormativeOperationPlanV1,
  validateNormativeRunnerDescriptorV1,
} from "../packages/collective-planning/dist/evaluation.js";

const MAXIMUM_EVIDENCE_BYTES = 64 * 1024 * 1024;
const options = parseOptions(process.argv.slice(2));

try {
  if (options.mode === "plan") await plan(options);
  else if (options.mode === "receipt") await receipt(options);
  else if (options.mode === "preflight") await preflight(options);
  else if (options.mode === "assess") await assess(options);
  else fail("campaign_readiness_mode_invalid");
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ status: "rejected", reasonCode: publicReason(error) })}\n`,
  );
  process.exitCode = 2;
}

async function plan(value) {
  exactOptions(value, [
    "campaign-id",
    "mode",
    "operation-directory",
    "output-directory",
    "source-sha",
  ]);
  assertIdentifier(value["campaign-id"], "campaign_id");
  assertCommit(value["source-sha"], "source_sha");
  assertExactSource(value["source-sha"]);
  const operationDirectory = absoluteDirectory(value["operation-directory"]);
  const outputDirectory = absoluteDirectory(value["output-directory"]);
  const source = await readJson(operationDirectory, "source-lock.json");
  const registration = validateCollectiveEvaluationCampaignRegistrationV1(
    await readJson(operationDirectory, "registration.json"),
  );
  const descriptor = validateNormativeRunnerDescriptorV1(
    await readJson(operationDirectory, "adapter-descriptor.json"),
  );
  const operationPlan = validateNormativeOperationPlanV1(
    await readJson(operationDirectory, "operation-plan.json"),
    registration,
    descriptor,
  );
  validateSourceLock(source, value["source-sha"]);
  if (
    registration.campaignId !== value["campaign-id"] ||
    operationPlan.campaignId !== value["campaign-id"] ||
    operationPlan.sourceCommit !== source.sourceCommit ||
    operationPlan.sourceTreeDigest !== source.sourceTreeDigest ||
    operationPlan.adapterClass !== "normative_candidate" ||
    descriptor.runnerClass !== "normative_candidate" ||
    descriptor.capabilities.exactReplay !== true ||
    descriptor.capabilities.evaluatorOwnedMetrics !== true ||
    descriptor.digests.implementationDigest ===
      descriptor.digests.evaluatorDigest
  )
    fail("campaign_readiness_operation_boundary_invalid");
  const calculatedInteractions = registration.cells.reduce(
    (total, cell) =>
      total + cell.maximumInteractions * operationPlan.slotsPerCell,
    0,
  );
  if (calculatedInteractions !== CAMPAIGN_READINESS_MAXIMUM_INTERACTIONS_V1)
    fail("campaign_readiness_interaction_ceiling_invalid");
  const estimate = createCampaignCapacityEstimateV1({
    schemaVersion: 1,
    registrationDigest: registration.registrationDigest,
    operationPlanDigest: operationPlan.planDigest,
    adapterDigest: descriptor.descriptorDigest,
  });
  const readinessPlan = createCampaignReadinessPlanV1({
    schemaVersion: 1,
    campaignId: registration.campaignId,
    sourceCommit: source.sourceCommit,
    sourceTreeDigest: source.sourceTreeDigest,
    registrationDigest: registration.registrationDigest,
    operationPlanDigest: operationPlan.planDigest,
    adapterDigest: descriptor.descriptorDigest,
    capacityEstimateDigest: estimate.estimateDigest,
  });
  validateCampaignReadinessPlanV1(readinessPlan, estimate);
  await mkdir(outputDirectory, { recursive: true });
  await writeJsonImmutable(
    path.join(outputDirectory, "capacity-estimate.json"),
    estimate,
  );
  await writeJsonImmutable(
    path.join(outputDirectory, "readiness-plan.json"),
    readinessPlan,
  );
  const planningEvidence = Buffer.from(
    JSON.stringify({
      source,
      registrationDigest: registration.registrationDigest,
      operationPlanDigest: operationPlan.planDigest,
      adapterDigest: descriptor.descriptorDigest,
    }),
  );
  const capacityEvidence = Buffer.from(JSON.stringify(estimate));
  const separationEvidence = Buffer.from(
    JSON.stringify({
      descriptorDigest: descriptor.descriptorDigest,
      runnerClass: descriptor.runnerClass,
      implementationDigest: descriptor.digests.implementationDigest,
      evaluatorDigest: descriptor.digests.evaluatorDigest,
      exactReplay: descriptor.capabilities.exactReplay,
      evaluatorOwnedMetrics: descriptor.capabilities.evaluatorOwnedMetrics,
    }),
  );
  for (const [controlId, evidence] of [
    ["immutable_source_and_plan", planningEvidence],
    ["bounded_capacity_estimate", capacityEvidence],
    ["registered_runtime_separation", separationEvidence],
  ]) {
    const evidenceReceipt = createReceipt(
      readinessPlan,
      controlId,
      "passed",
      "verified",
      sha256(evidence),
    );
    await writeJsonImmutable(
      path.join(outputDirectory, `receipt-${controlId}.json`),
      evidenceReceipt,
    );
  }
  writeStatus({
    status: "planned",
    recommendation: "no_go",
    readinessPlanDigest: readinessPlan.readinessPlanDigest,
    capacityEstimateDigest: estimate.estimateDigest,
    maximumInteractions: estimate.maximumInteractions,
    monetaryCostStatus: estimate.monetaryCostStatus,
    executionPermitted: false,
    fullCampaignPermitted: false,
  });
}

async function receipt(value) {
  exactOptions(value, [
    "control-id",
    "evidence-file",
    "mode",
    "output-directory",
    "readiness-directory",
    "reason-code",
    "source-sha",
    "status",
  ]);
  assertCommit(value["source-sha"], "source_sha");
  assertExactSource(value["source-sha"]);
  if (!CAMPAIGN_READINESS_REQUIRED_CONTROL_IDS_V1.includes(value["control-id"]))
    fail("campaign_readiness_control_invalid");
  if (
    [
      "immutable_source_and_plan",
      "bounded_capacity_estimate",
      "registered_runtime_separation",
    ].includes(value["control-id"])
  )
    fail("campaign_readiness_control_requires_dedicated_verifier");
  if (value.status !== "passed" && value.status !== "failed")
    fail("campaign_readiness_status_invalid");
  if (
    value["control-id"] === "durable_preflight_closure" &&
    value.status !== "failed"
  )
    fail("campaign_readiness_control_requires_dedicated_verifier");
  assertToken(value["reason-code"], "reason_code");
  const readinessDirectory = absoluteDirectory(value["readiness-directory"]);
  const outputDirectory = absoluteDirectory(value["output-directory"]);
  const readinessPlan = validateCampaignReadinessPlanV1(
    await readJson(readinessDirectory, "readiness-plan.json"),
    await readJson(readinessDirectory, "capacity-estimate.json"),
  );
  if (readinessPlan.sourceCommit !== value["source-sha"])
    fail("campaign_readiness_source_mismatch");
  const evidencePath = path.resolve(value["evidence-file"]);
  const evidence = await readBounded(evidencePath, MAXIMUM_EVIDENCE_BYTES);
  const evidenceReceipt = createReceipt(
    readinessPlan,
    value["control-id"],
    value.status,
    value["reason-code"],
    sha256(evidence),
  );
  await mkdir(outputDirectory, { recursive: true });
  await writeJsonImmutable(
    path.join(outputDirectory, `receipt-${value["control-id"]}.json`),
    evidenceReceipt,
  );
  writeStatus({
    status: "recorded",
    controlId: evidenceReceipt.controlId,
    controlStatus: evidenceReceipt.status,
    receiptDigest: evidenceReceipt.receiptDigest,
    executionPermitted: false,
    fullCampaignPermitted: false,
  });
}

async function preflight(value) {
  exactOptions(value, [
    "mode",
    "output-directory",
    "preflight-directory",
    "readiness-directory",
    "source-sha",
    "workflow-run-id",
  ]);
  assertCommit(value["source-sha"], "source_sha");
  assertExactSource(value["source-sha"]);
  if (!/^[1-9][0-9]{0,19}$/u.test(value["workflow-run-id"]))
    fail("campaign_readiness_workflow_run_id_invalid");
  const readinessDirectory = absoluteDirectory(value["readiness-directory"]);
  const preflightDirectory = absoluteDirectory(value["preflight-directory"]);
  const outputDirectory = absoluteDirectory(value["output-directory"]);
  const readinessPlan = validateCampaignReadinessPlanV1(
    await readJson(readinessDirectory, "readiness-plan.json"),
    await readJson(readinessDirectory, "capacity-estimate.json"),
  );
  if (readinessPlan.sourceCommit !== value["source-sha"])
    fail("campaign_readiness_source_mismatch");
  const names = (await readdir(preflightDirectory)).sort();
  const receiptNames = names.filter((name) =>
    /^preflight-receipt-[a-f0-9]{64}\.json$/u.test(name),
  );
  if (
    receiptNames.length !== 2 ||
    !names.includes("authorization-receipt.json") ||
    names.some(
      (name) =>
        name.endsWith(".json") &&
        name !== "authorization-receipt.json" &&
        !receiptNames.includes(name),
    )
  )
    fail("campaign_readiness_preflight_receipt_set_invalid");
  const authorization = await readJson(
    preflightDirectory,
    "authorization-receipt.json",
  );
  validateAuthorizationReceipt(authorization, readinessPlan);
  const preflightReceipts = [];
  for (const name of receiptNames) {
    const candidate = await readJson(preflightDirectory, name);
    validatePreflightReceipt(candidate, readinessPlan, authorization);
    preflightReceipts.push(candidate);
  }
  const first = preflightReceipts.find(
    (candidate) =>
      candidate.executedSlotCount === 20 && candidate.resumedSlotCount === 0,
  );
  const resumed = preflightReceipts.find(
    (candidate) =>
      candidate.executedSlotCount === 0 && candidate.resumedSlotCount === 20,
  );
  if (
    !first ||
    !resumed ||
    first.executionId !== resumed.executionId ||
    first.authorizationExecutionId !== resumed.authorizationExecutionId ||
    first.authorizationDigest !== resumed.authorizationDigest ||
    first.projectionRoot !== resumed.projectionRoot
  )
    fail("campaign_readiness_preflight_closure_invalid");
  const evidenceDigest = readinessArtifactDigest(
    "protected-preflight-closure",
    {
      schemaVersion: 1,
      workflowRunId: value["workflow-run-id"],
      authorizationReceiptDigest: authorization.receiptDigest,
      preflightReceiptDigests: preflightReceipts
        .map((candidate) => candidate.receiptDigest)
        .sort(),
    },
  );
  const evidenceReceipt = createReceipt(
    readinessPlan,
    "durable_preflight_closure",
    "passed",
    "verified",
    evidenceDigest,
  );
  await mkdir(outputDirectory, { recursive: true });
  await writeJsonImmutable(
    path.join(outputDirectory, "receipt-durable_preflight_closure.json"),
    evidenceReceipt,
  );
  writeStatus({
    status: "verified",
    controlId: evidenceReceipt.controlId,
    workflowRunId: value["workflow-run-id"],
    receiptDigest: evidenceReceipt.receiptDigest,
    executionPermitted: false,
    fullCampaignPermitted: false,
  });
}

async function assess(value) {
  exactOptions(value, [
    "mode",
    "output-directory",
    "readiness-directory",
    "receipt-directory",
    "source-sha",
  ]);
  assertCommit(value["source-sha"], "source_sha");
  assertExactSource(value["source-sha"]);
  const readinessDirectory = absoluteDirectory(value["readiness-directory"]);
  const receiptDirectory = absoluteDirectory(value["receipt-directory"]);
  const outputDirectory = absoluteDirectory(value["output-directory"]);
  const estimate = validateCampaignCapacityEstimateV1(
    await readJson(readinessDirectory, "capacity-estimate.json"),
  );
  const readinessPlan = validateCampaignReadinessPlanV1(
    await readJson(readinessDirectory, "readiness-plan.json"),
    estimate,
  );
  if (readinessPlan.sourceCommit !== value["source-sha"])
    fail("campaign_readiness_source_mismatch");
  const names = (await readdir(receiptDirectory)).sort();
  const expectedNames = new Set(
    CAMPAIGN_READINESS_REQUIRED_CONTROL_IDS_V1.map(
      (controlId) => `receipt-${controlId}.json`,
    ),
  );
  const unknown = names.filter(
    (name) => name.endsWith(".json") && !expectedNames.has(name),
  );
  if (unknown.length > 0) fail("campaign_readiness_receipt_set_invalid");
  const receipts = [];
  for (const controlId of CAMPAIGN_READINESS_REQUIRED_CONTROL_IDS_V1) {
    const name = `receipt-${controlId}.json`;
    if (!names.includes(name)) continue;
    const candidate = await readJson(receiptDirectory, name);
    const evidenceReceipt = validateCampaignReadinessEvidenceReceiptV1(
      candidate,
      readinessPlan,
    );
    if (evidenceReceipt.controlId !== controlId)
      fail("campaign_readiness_receipt_filename_mismatch");
    receipts.push(evidenceReceipt);
  }
  const assessment = deriveCampaignReadinessAssessmentV1({
    schemaVersion: 1,
    plan: readinessPlan,
    receipts,
  });
  validateCampaignReadinessAssessmentV1(assessment, readinessPlan, receipts);
  await mkdir(outputDirectory, { recursive: true });
  await writeJsonImmutable(
    path.join(outputDirectory, "readiness-assessment.json"),
    assessment,
  );
  writeStatus({
    status: "assessed",
    recommendation: assessment.recommendation,
    passedControls: assessment.passedControlIds.length,
    unmetControls: assessment.unmetControlIds,
    pendingCampaignOutcomes: assessment.pendingCampaignOutcomeIds.length,
    pendingReleaseOutcomes: assessment.pendingReleaseOutcomeIds.length,
    assessmentDigest: assessment.assessmentDigest,
    executionPermitted: false,
    fullCampaignPermitted: false,
  });
}

function createReceipt(
  planValue,
  controlId,
  status,
  reasonCode,
  evidenceDigest,
) {
  return createCampaignReadinessEvidenceReceiptV1({
    schemaVersion: 1,
    controlId,
    sourceCommit: planValue.sourceCommit,
    sourceTreeDigest: planValue.sourceTreeDigest,
    readinessPlanDigest: planValue.readinessPlanDigest,
    status,
    reasonCode,
    evidenceDigest,
  });
}

function validateSourceLock(value, expectedCommit) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schemaVersion !== 1 ||
    value.sourceCommit !== expectedCommit ||
    value.dirtyWorktree !== false ||
    typeof value.sourceTreeDigest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/u.test(value.sourceTreeDigest)
  )
    fail("campaign_readiness_source_lock_invalid");
}

function validateAuthorizationReceipt(value, planValue) {
  exactRecord(value, [
    "schemaVersion",
    "kind",
    "status",
    "authorizationId",
    "authorizationDigest",
    "credentialId",
    "audience",
    "planDigest",
    "adapterDigest",
    "shardIndex",
    "maximumCells",
    "expiresAt",
    "receiptDigest",
  ]);
  const { receiptDigest, ...body } = value;
  if (
    value.schemaVersion !== 1 ||
    value.kind !== "collective_beta3_registered_authorization_receipt" ||
    value.status !== "authorized" ||
    value.planDigest !== planValue.operationPlanDigest ||
    value.adapterDigest !== planValue.adapterDigest ||
    value.shardIndex !== 2 ||
    value.maximumCells !== 5 ||
    readinessArtifactDigest("authorization-receipt", body) !== receiptDigest
  )
    fail("campaign_readiness_preflight_authorization_invalid");
  for (const key of [
    "authorizationDigest",
    "credentialId",
    "audience",
    "authorizationId",
    "expiresAt",
  ])
    if (typeof value[key] !== "string" || value[key].length === 0)
      fail("campaign_readiness_preflight_authorization_invalid");
}

function validatePreflightReceipt(value, planValue, authorization) {
  exactRecord(value, [
    "schemaVersion",
    "kind",
    "status",
    "releaseEvidence",
    "fullCampaignPermitted",
    "sourceCommit",
    "registrationDigest",
    "planDigest",
    "adapterDigest",
    "authorizationDigest",
    "executionId",
    "authorizationExecutionId",
    "shardIndex",
    "selectedCellCount",
    "executedSlotCount",
    "resumedSlotCount",
    "projectionCount",
    "verifiedArtifactCount",
    "verifiedArtifactBytes",
    "projectionRoot",
    "receiptDigest",
  ]);
  const { receiptDigest, ...body } = value;
  if (
    value.schemaVersion !== 1 ||
    value.kind !== "collective_beta3_registered_preflight_receipt" ||
    value.status !== "completed" ||
    value.releaseEvidence !== false ||
    value.fullCampaignPermitted !== false ||
    value.sourceCommit !== planValue.sourceCommit ||
    value.registrationDigest !== planValue.registrationDigest ||
    value.planDigest !== planValue.operationPlanDigest ||
    value.adapterDigest !== planValue.adapterDigest ||
    value.authorizationDigest !== authorization.authorizationDigest ||
    value.shardIndex !== 2 ||
    value.selectedCellCount !== 5 ||
    value.executedSlotCount + value.resumedSlotCount !== 20 ||
    value.projectionCount !== 20 ||
    value.verifiedArtifactCount !== 20 ||
    !Number.isSafeInteger(value.verifiedArtifactBytes) ||
    value.verifiedArtifactBytes < 1 ||
    value.verifiedArtifactBytes > 20 * 16 * 1024 * 1024 ||
    !/^sha256:[a-f0-9]{64}$/u.test(value.projectionRoot) ||
    readinessArtifactDigest("preflight-receipt", body) !== receiptDigest
  )
    fail("campaign_readiness_preflight_receipt_invalid");
  for (const key of ["executionId", "authorizationExecutionId"])
    if (typeof value[key] !== "string" || value[key].length === 0)
      fail("campaign_readiness_preflight_receipt_invalid");
}

function exactRecord(value, keys) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  )
    fail("campaign_readiness_preflight_receipt_invalid");
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    fail("campaign_readiness_preflight_receipt_invalid");
}

function readinessArtifactDigest(kind, value) {
  return digestPlanningJsonV1("evaluation-campaign-artifact-v1", {
    schemaVersion: 1,
    kind,
    value,
  });
}

function assertExactSource(expectedCommit) {
  const actual = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  if (actual !== expectedCommit) fail("campaign_readiness_source_mismatch");
}

async function readJson(directory, name) {
  const bytes = await readBounded(
    path.join(directory, name),
    MAXIMUM_EVIDENCE_BYTES,
  );
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("campaign_readiness_json_invalid");
  }
}

async function readBounded(file, maximumBytes) {
  const bytes = await readFile(file);
  if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes)
    fail("campaign_readiness_evidence_size_invalid");
  return bytes;
}

async function writeJsonImmutable(file, value) {
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  try {
    await link(temporary, file);
  } catch (error) {
    if (error?.code === "EEXIST") {
      const existing = await readFile(file, "utf8");
      const proposed = await readFile(temporary, "utf8");
      if (existing !== proposed) fail("campaign_readiness_artifact_conflict");
    } else throw error;
  } finally {
    await rm(temporary, { force: true });
  }
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
      fail("campaign_readiness_option_syntax_invalid");
    const key = name.slice(2);
    if (key in result) fail("campaign_readiness_option_duplicate");
    result[key] = optionValue;
  }
  return result;
}

function exactOptions(value, expected) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  )
    fail("campaign_readiness_option_set_invalid");
}

function absoluteDirectory(value) {
  if (typeof value !== "string" || !path.isAbsolute(value))
    fail("campaign_readiness_directory_invalid");
  return path.resolve(value);
}

function assertCommit(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/u.test(value))
    fail(`campaign_readiness_${label}_invalid`);
}

function assertIdentifier(value, label) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,255}$/u.test(value)
  )
    fail(`campaign_readiness_${label}_invalid`);
}

function assertToken(value, label) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,127}$/u.test(value)
  )
    fail(`campaign_readiness_${label}_invalid`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function publicReason(error) {
  const message = error instanceof Error ? error.message : "";
  return /^campaign_readiness_[a-z0-9_]{1,160}$/u.test(message)
    ? message
    : "campaign_readiness_failed";
}

function writeStatus(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fail(reasonCode) {
  throw new Error(reasonCode);
}
