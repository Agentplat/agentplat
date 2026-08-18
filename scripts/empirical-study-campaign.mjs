#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign as signBytes,
  verify as verifyBytes,
} from "node:crypto";
import {
  link,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalizePlanningJsonV1,
  digestPlanningJsonV1,
} from "../packages/collective-planning/dist/index.js";
import {
  createNormativeOperationAuthorizationV1,
  validateCollectiveEvaluationCampaignRegistrationV1,
  validateNormativeOperationAuthorizationV1,
  validateNormativeOperationPlanV1,
  validateNormativeRunnerDescriptorV1,
} from "../packages/collective-planning/dist/evaluation.js";
import {
  analyzeCollectiveStatisticalCampaignNormativeV1,
  collectiveStatisticalCampaignNormativeExecutionIdV1,
  createCollectiveStatisticalCampaignNormativeAdapterResolverV1,
  createCollectiveStatisticalCampaignRegisteredProjectorV1,
  createCollectiveStatisticalCampaignRegisteredRunnerV1,
  runCollectiveStatisticalCampaignNormativeOperationV1,
  verifyCollectiveStatisticalCampaignArtifactStreamV1,
} from "../packages/mesh-sim/dist/index.js";
import {
  createLocalCollectiveStatisticalCampaignArtifactReaderV1,
  createLocalCollectiveStatisticalCampaignDeadlineArtifactWriterV1,
  createLocalCollectiveStatisticalCampaignExecutionStoreV1,
  openCollectiveStatisticalCampaignLocalStoreV1,
} from "../packages/mesh-sim-local/dist/index.js";
import {
  buildPublicationBundleManifestV1,
  verifyPublicationBundleV1,
} from "./empirical-publication-bundle.mjs";
import {
  buildEvaluabilityCertificateV1,
  REQUIRED_PUBLICATION_ARTIFACTS_V1,
  verifyEvaluabilityCertificateV1,
} from "./empirical-evaluability-gate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLAN_CONFIRMATION = "DO_NOT_RUN";
const AUTHORIZE_CONFIRMATION = "AUTHORIZE_LOCAL_REGISTERED_CAMPAIGN";
const EXECUTE_CONFIRMATION = "RUN_LOCAL_REGISTERED_SHARD";
const COLLECT_CONFIRMATION = "COLLECT_REGISTERED_240X4";
const AUTHORIZATION_AUDIENCE = "agentplat:local-empirical-campaign-v1";
const EXPECTED_SHARDS = 48;
// A cell contains four complete registered executions.  Five minutes is not
// sufficient for the largest resilient cells on a constrained local machine;
// keep a finite, recovery-safe fence that covers the measured worst case.
const LOCAL_CELL_LEASE_DURATION_MS = 30 * 60 * 1_000;
const CELLS_PER_SHARD = 5;
const PROJECTIONS_PER_SHARD = 20;
const EXPECTED_PROJECTIONS = 960;
const AGGREGATION_SEED = 20_260_810;
const JSON_LIMITS = Object.freeze({
  maximumBytes: 16 * 1024 * 1024,
  maximumDepth: 64,
  maximumNodes: 1_000_000,
  maximumKeysPerObject: 4_096,
  maximumItemsPerArray: 16_384,
});

let options = Object.create(null);
try {
  options = parseOptions(process.argv.slice(2));
  if (options.mode === "plan") await plan();
  else if (options.mode === "authorize") await authorize();
  else if (options.mode === "execute-shard") await executeShard();
  else if (options.mode === "status") await campaignStatus();
  else if (options.mode === "collect") await collect();
  else if (options.mode === "contract-smoke") contractSmoke();
  else fail("empirical_campaign_mode_invalid");
} catch (error) {
  const message = error instanceof Error ? error.message : "";
  process.stderr.write(
    `${JSON.stringify({
      status: "rejected",
      reasonCode: /^[a-z0-9_]{1,180}$/u.test(message)
        ? message
        : "empirical_campaign_failed",
    })}\n`,
  );
  process.exitCode = 2;
}

async function plan() {
  exactOptions([
    "campaign-id",
    "confirm",
    "mode",
    "output-directory",
    "source-sha",
  ]);
  if (options.confirm !== PLAN_CONFIRMATION)
    fail("empirical_campaign_plan_confirmation_invalid");
  const campaignId = tokenOption("campaign-id");
  const sourceSha = commitOption("source-sha");
  const outputDirectory = externalDirectoryOption("output-directory");
  execFileSync(
    process.execPath,
    [
      path.join(root, "scripts/collective-beta3-registered-preflight.mjs"),
      "--mode",
      "plan",
      "--campaign-id",
      campaignId,
      "--confirm",
      PLAN_CONFIRMATION,
      "--output-directory",
      outputDirectory,
      "--source-sha",
      sourceSha,
    ],
    { cwd: root, stdio: "inherit" },
  );
  const loaded = await loadPrepared(outputDirectory, campaignId, sourceSha, false);
  const evaluabilityCertificate = buildEvaluabilityCertificateV1(
    evaluabilityInput(loaded),
  );
  if (evaluabilityCertificate.status !== "passed")
    fail("empirical_campaign_evaluability_gate_failed");
  await writeJsonImmutable(
    path.join(outputDirectory, "evaluability-certificate.json"),
    evaluabilityCertificate,
  );
  const body = {
    schemaVersion: 1,
    kind: "agentplat-local-empirical-campaign-design-v1",
    campaignId,
    sourceCommit: sourceSha,
    registrationDigest: loaded.registration.registrationDigest,
    planDigest: loaded.plan.planDigest,
    adapterDigest: loaded.descriptor.descriptorDigest,
    implementationDigest: loaded.descriptor.digests.implementationDigest,
    evaluatorDigest: loaded.descriptor.digests.evaluatorDigest,
    storageClass: "local_content_addressed_immutable",
    orchestrationClass: "authorized_single_shard_resumable",
    expectedShards: EXPECTED_SHARDS,
    cellsPerShard: CELLS_PER_SHARD,
    expectedCells: EXPECTED_SHARDS * CELLS_PER_SHARD,
    projectionsPerShard: PROJECTIONS_PER_SHARD,
    expectedProjections: EXPECTED_PROJECTIONS,
    aggregationSeed: AGGREGATION_SEED,
    maximumExternalSpend: 0,
    cloudComputePermitted: false,
    paidModelCallsPermitted: false,
    authorizationIssued: false,
    executionPermitted: false,
    resultsStatus: "not_collected",
  };
  const design = {
    ...body,
    designDigest: artifactDigest("local-empirical-campaign-design", body),
  };
  await writeJsonImmutable(
    path.join(outputDirectory, "campaign-execution-design.json"),
    design,
  );
  status({
    status: "planned",
    designDigest: design.designDigest,
    adapterDigest: design.adapterDigest,
    expectedShards: EXPECTED_SHARDS,
    expectedProjections: EXPECTED_PROJECTIONS,
    maximumExternalSpend: 0,
    executionPermitted: false,
    evaluabilityCertificateDigest: evaluabilityCertificate.certificateDigest,
  });
}

async function authorize() {
  exactOptions([
    "authorization-id",
    "campaign-id",
    "confirm",
    "execution-id",
    "expires-at",
    "mode",
    "output-directory",
    "private-key",
    "public-key",
    "registration-directory",
    "shard-indices",
    "source-sha",
  ]);
  if (options.confirm !== AUTHORIZE_CONFIRMATION)
    fail("empirical_campaign_authorization_confirmation_required");
  const campaignId = tokenOption("campaign-id");
  const sourceSha = commitOption("source-sha");
  const registrationDirectory = externalDirectoryOption(
    "registration-directory",
  );
  const loaded = await loadPrepared(
    registrationDirectory,
    campaignId,
    sourceSha,
  );
  const shardIndices = shardListOption("shard-indices");
  const expiresAt = timestampOption("expires-at");
  const authorizedAt = new Date();
  if (Date.parse(expiresAt) <= authorizedAt.getTime())
    fail("empirical_campaign_authorization_expiry_invalid");
  const privateKey = createPrivateKey(
    await readTextBounded(externalFileOption("private-key"), 64 * 1024),
  );
  const suppliedPublicKey = canonicalPublicKey(
    await readTextBounded(externalFileOption("public-key"), 64 * 1024),
  );
  const derivedPublicKey = canonicalPublicKey(
    String(createPublicKey(privateKey).export({ type: "spki", format: "pem" })),
  );
  if (derivedPublicKey !== suppliedPublicKey)
    fail("empirical_campaign_signing_key_mismatch");
  const credentialId = credentialIdForPublicKey(suppliedPublicKey);
  const body = {
    schemaVersion: 1,
    authorizationId: tokenOption("authorization-id"),
    issuerId: "operator:local-empirical-campaign",
    audience: AUTHORIZATION_AUDIENCE,
    credentialId,
    signatureAlgorithm: "ed25519",
    planDigest: loaded.plan.planDigest,
    registrationDigest: loaded.registration.registrationDigest,
    sourceCommit: sourceSha,
    sourceTreeDigest: loaded.source.sourceTreeDigest,
    adapterDigest: loaded.descriptor.descriptorDigest,
    executionId: tokenOption("execution-id"),
    shardIndices,
    authorizedAt: authorizedAt.toISOString(),
    expiresAt,
    maximumCells: shardIndices.length * CELLS_PER_SHARD,
  };
  const placeholder = createNormativeOperationAuthorizationV1({
    ...body,
    authentication: {
      schemaVersion: 1,
      credentialId,
      algorithm: "ed25519",
      signature: Buffer.alloc(64).toString("base64url"),
    },
  });
  const signature = signBytes(
    null,
    Buffer.from(placeholder.authorizationDigest, "utf8"),
    privateKey,
  ).toString("base64url");
  const authorization = createNormativeOperationAuthorizationV1({
    ...body,
    authentication: {
      schemaVersion: 1,
      credentialId,
      algorithm: "ed25519",
      signature,
    },
  });
  const outputDirectory = externalDirectoryOption("output-directory");
  await mkdir(outputDirectory, { recursive: true });
  await writeJsonImmutable(
    path.join(outputDirectory, "authorization.json"),
    authorization,
  );
  await writeTextImmutable(
    path.join(outputDirectory, "authorization-public-key.pem"),
    suppliedPublicKey,
  );
  const receiptBody = {
    schemaVersion: 1,
    kind: "agentplat-local-empirical-authorization-receipt-v1",
    authorizationDigest: authorization.authorizationDigest,
    registrationDigest: authorization.registrationDigest,
    planDigest: authorization.planDigest,
    adapterDigest: authorization.adapterDigest,
    evaluabilityCertificateDigest:
      loaded.evaluabilityCertificate.certificateDigest,
    executionId: authorization.executionId,
    shardIndices,
    maximumCells: authorization.maximumCells,
    expiresAt: authorization.expiresAt,
    executionPermitted: true,
    scope: "authorized_local_shards_only",
  };
  await writeJsonImmutable(
    path.join(outputDirectory, "authorization-receipt.json"),
    {
      ...receiptBody,
      receiptDigest: artifactDigest(
        "local-empirical-authorization",
        receiptBody,
      ),
    },
  );
  status({
    status: "authorized",
    authorizationDigest: authorization.authorizationDigest,
    shardCount: shardIndices.length,
    maximumCells: authorization.maximumCells,
    executionPermitted: true,
  });
}

async function executeShard() {
  exactOptions([
    "authorization-directory",
    "campaign-id",
    "confirm",
    "mode",
    "output-directory",
    "registration-directory",
    "shard-index",
    "source-sha",
    "store-directory",
    "worker-id",
  ]);
  if (options.confirm !== EXECUTE_CONFIRMATION)
    fail("empirical_campaign_execution_confirmation_required");
  const campaignId = tokenOption("campaign-id");
  const sourceSha = commitOption("source-sha");
  const loaded = await loadPrepared(
    externalDirectoryOption("registration-directory"),
    campaignId,
    sourceSha,
  );
  const trusted = await loadAuthorization(
    externalDirectoryOption("authorization-directory"),
    loaded,
  );
  const shardIndex = shardOption("shard-index");
  if (!trusted.authorization.shardIndices.includes(shardIndex))
    fail("empirical_campaign_shard_not_authorized");
  const outputDirectory = externalDirectoryOption("output-directory");
  const receiptPath = path.join(
    outputDirectory,
    "shards",
    `shard-${String(shardIndex).padStart(2, "0")}.json`,
  );
  const existing = await readJsonIfPresent(receiptPath);
  if (existing !== null) {
    validateShardReceipt(existing, loaded, trusted.authorization, shardIndex);
    status({
      status: "already_completed",
      shardIndex,
      receiptDigest: existing.receiptDigest,
      executionPermitted: false,
    });
    return;
  }
  const now = () => Date.now();
  const local = await openCollectiveStatisticalCampaignLocalStoreV1({
    root: externalDirectoryOption("store-directory"),
  });
  const executionStore =
    createLocalCollectiveStatisticalCampaignExecutionStoreV1(local, now);
  const artifactWriter =
    createLocalCollectiveStatisticalCampaignDeadlineArtifactWriterV1(
      local,
      now,
    );
  const runner = createCollectiveStatisticalCampaignRegisteredRunnerV1();
  const projector = createCollectiveStatisticalCampaignRegisteredProjectorV1(
    loaded.descriptor.digests.evaluatorDigest,
  );
  const resolver =
    createCollectiveStatisticalCampaignNormativeAdapterResolverV1({
      schemaVersion: 1,
      registrations: [
        {
          schemaVersion: 1,
          descriptor: loaded.descriptor,
          runner,
          projector,
          planDigests: [loaded.plan.planDigest],
          authorizationDigests: [trusted.authorization.authorizationDigest],
        },
      ],
    });
  const campaignLock = await local.acquireCampaignLockV1(
    `empirical:${trusted.authorization.authorizationDigest}`,
  );
  // A supervisor can be interrupted while a shard owns the exclusive local
  // campaign lock.  Do not let SIGTERM tear down the process immediately:
  // finish the fenced operation, release the lock in `finally`, and report a
  // recoverable interruption.  This preserves immutable slot evidence and
  // lets a later supervisor resume without breaking a lock automatically.
  let terminationSignal = null;
  const noteTermination = (signal) => {
    terminationSignal ??= signal;
  };
  process.once("SIGTERM", noteTermination);
  let result;
  try {
    result = await runCollectiveStatisticalCampaignNormativeOperationV1({
      schemaVersion: 1,
      registration: loaded.registration,
      descriptor: loaded.descriptor,
      plan: loaded.plan,
      authorization: trusted.authorization,
      authorizationAudience: AUTHORIZATION_AUDIENCE,
      authorizationVerifier: trusted.verifier,
      source: {
        commit: sourceSha,
        treeDigest: loaded.source.sourceTreeDigest,
        clean: true,
      },
      shardIndex,
      workerId: tokenOption("worker-id"),
      leaseDurationMs: LOCAL_CELL_LEASE_DURATION_MS,
      store: executionStore,
      artifacts: artifactWriter,
      adapterResolver: resolver,
      now,
    });
  } finally {
    await campaignLock.release();
    process.off("SIGTERM", noteTermination);
  }
  if (terminationSignal !== null)
    fail("empirical_campaign_interrupted_after_lock_release");
  const verification =
    await verifyCollectiveStatisticalCampaignArtifactStreamV1({
      schemaVersion: 1,
      artifacts: result.projectionArtifactIndexes,
      reader: createLocalCollectiveStatisticalCampaignArtifactReaderV1(
        local,
        result.projectionArtifactIndexes,
      ),
    });
  if (
    result.selectedCellCount !== CELLS_PER_SHARD ||
    result.projectionCount !== PROJECTIONS_PER_SHARD ||
    verification.artifactCount !== PROJECTIONS_PER_SHARD
  )
    fail("empirical_campaign_shard_closure_invalid");
  const receiptBody = {
    schemaVersion: 1,
    kind: "agentplat-local-empirical-shard-receipt-v1",
    status: "completed",
    sourceCommit: sourceSha,
    registrationDigest: loaded.registration.registrationDigest,
    planDigest: loaded.plan.planDigest,
    adapterDigest: loaded.descriptor.descriptorDigest,
    authorizationDigest: trusted.authorization.authorizationDigest,
    executionId: result.executionId,
    authorizationExecutionId: result.authorizationExecutionId,
    shardIndex,
    selectedCellCount: result.selectedCellCount,
    executedSlotCount: result.executedSlotCount,
    resumedSlotCount: result.resumedSlotCount,
    projectionCount: result.projectionCount,
    verifiedArtifactCount: verification.artifactCount,
    verifiedArtifactBytes: verification.totalBytes,
    projectionArtifactIndexes: result.projectionArtifactIndexes,
    projectionRoot: artifactDigest("local-empirical-projection-root", {
      projectionDigests: result.projections.map(
        (projection) => projection.projectionDigest,
      ),
    }),
    resultsCollected: false,
    empiricalClaimPermitted: false,
  };
  const receipt = {
    ...receiptBody,
    receiptDigest: artifactDigest("local-empirical-shard-receipt", receiptBody),
  };
  await writeJsonImmutable(receiptPath, receipt);
  status({
    status: "completed",
    shardIndex,
    executedSlotCount: result.executedSlotCount,
    resumedSlotCount: result.resumedSlotCount,
    projectionCount: result.projectionCount,
    receiptDigest: receipt.receiptDigest,
    empiricalClaimPermitted: false,
  });
}

async function campaignStatus() {
  exactOptions([
    "authorization-directory",
    "campaign-id",
    "mode",
    "output-directory",
    "registration-directory",
    "source-sha",
  ]);
  const loaded = await loadPrepared(
    externalDirectoryOption("registration-directory"),
    tokenOption("campaign-id"),
    commitOption("source-sha"),
  );
  const trusted = await loadAuthorization(
    externalDirectoryOption("authorization-directory"),
    loaded,
    false,
  );
  const completed = await loadShardReceipts(
    externalDirectoryOption("output-directory"),
    loaded,
    trusted.authorization,
  );
  const authorized = trusted.authorization.shardIndices;
  const completedIndices = [...completed.keys()].sort((a, b) => a - b);
  status({
    status:
      completedIndices.length === authorized.length ? "complete" : "partial",
    authorizationDigest: trusted.authorization.authorizationDigest,
    authorizedShards: authorized,
    completedShards: completedIndices,
    missingShards: authorized.filter((index) => !completed.has(index)),
    completedProjectionCount: completedIndices.length * PROJECTIONS_PER_SHARD,
    executionPermitted: false,
    empiricalClaimPermitted: false,
  });
}

async function collect() {
  exactOptions([
    "authorization-directory",
    "campaign-id",
    "confirm",
    "mode",
    "output-directory",
    "registration-directory",
    "source-sha",
    "store-directory",
  ]);
  if (options.confirm !== COLLECT_CONFIRMATION)
    fail("empirical_campaign_collection_confirmation_required");
  const loaded = await loadPrepared(
    externalDirectoryOption("registration-directory"),
    tokenOption("campaign-id"),
    commitOption("source-sha"),
  );
  const trusted = await loadAuthorization(
    externalDirectoryOption("authorization-directory"),
    loaded,
    false,
  );
  if (
    trusted.authorization.shardIndices.length !== EXPECTED_SHARDS ||
    trusted.authorization.shardIndices.some((value, index) => value !== index)
  )
    fail("empirical_campaign_full_authorization_required");
  const outputDirectory = externalDirectoryOption("output-directory");
  const receipts = await loadShardReceipts(
    outputDirectory,
    loaded,
    trusted.authorization,
  );
  if (receipts.size !== EXPECTED_SHARDS)
    fail("empirical_campaign_incomplete_shard_closure");
  const indexes = [...receipts.values()]
    .sort((left, right) => left.shardIndex - right.shardIndex)
    .flatMap((receipt) => receipt.projectionArtifactIndexes);
  if (indexes.length !== EXPECTED_PROJECTIONS)
    fail("empirical_campaign_projection_closure_invalid");
  const local = await openCollectiveStatisticalCampaignLocalStoreV1({
    root: externalDirectoryOption("store-directory"),
  });
  const projections = [];
  const verification =
    await verifyCollectiveStatisticalCampaignArtifactStreamV1({
      schemaVersion: 1,
      artifacts: indexes,
      reader: createLocalCollectiveStatisticalCampaignArtifactReaderV1(
        local,
        indexes,
      ),
      visitArtifactV1(artifact) {
        projections.push(artifact.value);
      },
    });
  if (verification.artifactCount !== EXPECTED_PROJECTIONS)
    fail("empirical_campaign_projection_verification_invalid");
  const executionId = collectiveStatisticalCampaignNormativeExecutionIdV1({
    schemaVersion: 1,
    registration: loaded.registration,
    descriptor: loaded.descriptor,
    plan: loaded.plan,
    authorization: trusted.authorization,
  });
  const analysis = analyzeCollectiveStatisticalCampaignNormativeV1({
    schemaVersion: 1,
    registration: loaded.registration,
    executionId,
    aggregationSeed: AGGREGATION_SEED,
    bootstrapResamples: 10_000,
    projections,
  });
  if (analysis.rawRows.length !== 240 || analysis.decision === "incomplete")
    fail("empirical_campaign_analysis_closure_invalid");
  const resultDirectory = path.join(outputDirectory, "results");
  const receiptRoot = artifactDigest("local-empirical-receipt-root", {
    receiptDigests: [...receipts.values()]
      .sort((left, right) => left.shardIndex - right.shardIndex)
      .map((receipt) => receipt.receiptDigest),
  });
  const manifestBody = {
    schemaVersion: 1,
    kind: "agentplat-local-empirical-collection-manifest-v1",
    sourceCommit: loaded.source.sourceCommit,
    registrationDigest: loaded.registration.registrationDigest,
    planDigest: loaded.plan.planDigest,
    adapterDigest: loaded.descriptor.descriptorDigest,
    authorizationDigest: trusted.authorization.authorizationDigest,
    executionId,
    receiptRoot,
    shardCount: EXPECTED_SHARDS,
    cellCount: 240,
    projectionCount: verification.artifactCount,
    projectionBytes: verification.totalBytes,
    aggregationSeed: AGGREGATION_SEED,
    analysisDigest: analysis.analysisDigest,
    incurredExternalSpend: 0,
    currency: "USD",
    resultsStatus: "collected",
    empiricalClaimPermitted: false,
  };
  const manifest = {
    ...manifestBody,
    manifestDigest: artifactDigest(
      "local-empirical-collection-manifest",
      manifestBody,
    ),
  };
  const tables = {
    schemaVersion: 1,
    kind: "agentplat-paper-table-source-v1",
    registrationDigest: loaded.registration.registrationDigest,
    analysisDigest: analysis.analysisDigest,
    decision: analysis.decision,
    reasonCodes: analysis.reasonCodes,
    endpoints: analysis.endpoints,
    interpretationStatus: "not_authored",
    empiricalClaimPermitted: false,
  };
  await mkdir(resultDirectory, { recursive: true });
  await writeJsonImmutable(
    path.join(resultDirectory, "collection-manifest.json"),
    manifest,
  );
  await writeJsonImmutable(
    path.join(resultDirectory, "source-lock.json"),
    loaded.source,
  );
  await writeJsonImmutable(
    path.join(resultDirectory, "registration.json"),
    loaded.registration,
  );
  await writeJsonImmutable(
    path.join(resultDirectory, "operation-plan.json"),
    loaded.plan,
  );
  await writeJsonImmutable(
    path.join(resultDirectory, "adapter-descriptor.json"),
    loaded.descriptor,
  );
  await writeJsonImmutable(
    path.join(resultDirectory, "authorization.json"),
    trusted.authorization,
  );
  await writeJsonImmutable(
    path.join(resultDirectory, "normative-analysis.json"),
    analysis,
  );
  await writeJsonImmutable(path.join(resultDirectory, "raw-rows.json"), {
    schemaVersion: 1,
    registrationDigest: loaded.registration.registrationDigest,
    analysisDigest: analysis.analysisDigest,
    rows: analysis.rawRows,
  });
  await writeJsonImmutable(
    path.join(resultDirectory, "paper-tables.json"),
    tables,
  );
  await writeTextImmutable(
    path.join(resultDirectory, "paper-dataset.csv"),
    paperCsv(analysis.rawRows),
  );
  await writeJsonImmutable(
    path.join(resultDirectory, "analysis-input-projections.json"),
    {
      schemaVersion: 1,
      executionId,
      aggregationSeed: AGGREGATION_SEED,
      projections,
    },
  );
  const publicationBundle = await buildPublicationBundleManifestV1({
    directory: resultDirectory,
    sourceCommit: loaded.source.sourceCommit,
    registrationDigest: loaded.registration.registrationDigest,
    executionId,
    analysisDigest: analysis.analysisDigest,
    rawRowCount: analysis.rawRows.length,
    projectionCount: projections.length,
  });
  const verifiedPublicationBundle = await verifyPublicationBundleV1(
    resultDirectory,
  );
  if (verifiedPublicationBundle.bundleDigest !== publicationBundle.bundleDigest)
    fail("empirical_campaign_publication_bundle_verification_mismatch");
  status({
    status: "collected",
    manifestDigest: manifest.manifestDigest,
    analysisDigest: analysis.analysisDigest,
    decision: analysis.decision,
    cellCount: 240,
    projectionCount: EXPECTED_PROJECTIONS,
    publicationBundleDigest: verifiedPublicationBundle.bundleDigest,
    incurredExternalSpend: 0,
    empiricalClaimPermitted: false,
  });
}

function contractSmoke() {
  exactOptions(["mode"]);
  if (
    EXPECTED_SHARDS * CELLS_PER_SHARD !== 240 ||
    EXPECTED_SHARDS * PROJECTIONS_PER_SHARD !== EXPECTED_PROJECTIONS ||
    AGGREGATION_SEED !== 20_260_810
  )
    fail("empirical_campaign_contract_invalid");
  status({
    status: "passed",
    scope: "contract_only_no_execution",
    expectedShards: EXPECTED_SHARDS,
    expectedCells: 240,
    expectedProjections: EXPECTED_PROJECTIONS,
    aggregationSeed: AGGREGATION_SEED,
    executionPermitted: false,
  });
}

async function loadPrepared(
  directory,
  campaignId,
  sourceSha,
  requireEvaluability = true,
) {
  const source = inspectCleanSource(sourceSha);
  const sourceLock = await readJsonBounded(
    path.join(directory, "source-lock.json"),
  );
  if (canonical(sourceLock) !== canonical(source))
    fail("empirical_campaign_source_lock_changed");
  const descriptor = validateNormativeRunnerDescriptorV1(
    await readJsonBounded(path.join(directory, "adapter-descriptor.json")),
  );
  if (descriptor.runnerClass !== "normative_candidate")
    fail("empirical_campaign_adapter_not_registered_candidate");
  const registration = validateCollectiveEvaluationCampaignRegistrationV1(
    await readJsonBounded(path.join(directory, "registration.json")),
  );
  if (
    registration.campaignId !== campaignId ||
    registration.cells.length !== 240
  )
    fail("empirical_campaign_registration_binding_invalid");
  const plan = validateNormativeOperationPlanV1(
    await readJsonBounded(path.join(directory, "operation-plan.json")),
    registration,
    descriptor,
  );
  let evaluabilityCertificate = null;
  if (requireEvaluability) {
    evaluabilityCertificate = verifyEvaluabilityCertificateV1(
      await readJsonBounded(path.join(directory, "evaluability-certificate.json")),
      evaluabilityInput({ source, descriptor, registration, plan }),
    );
  }
  if (
    plan.sourceCommit !== sourceSha ||
    plan.sourceTreeDigest !== source.sourceTreeDigest ||
    plan.shards.length !== EXPECTED_SHARDS ||
    plan.shards.some((shard) => shard.cellIds.length !== CELLS_PER_SHARD)
  )
    fail("empirical_campaign_plan_binding_invalid");
  return { source, descriptor, registration, plan, evaluabilityCertificate };
}

function evaluabilityInput(loaded) {
  return {
    sourceCommit: loaded.source.sourceCommit,
    registration: loaded.registration,
    plan: loaded.plan,
    descriptor: loaded.descriptor,
    requiredPublicationArtifacts: REQUIRED_PUBLICATION_ARTIFACTS_V1,
    syntheticRoleDecisionCount: 1_000,
    syntheticUsefulDecisionCount: 700,
    syntheticUnsafeExecutableCount: 0,
    syntheticConvergenceEvidencePresent: true,
    syntheticConvergenceInteractionDelta: 250,
  };
}

async function loadAuthorization(directory, loaded, requireActive = true) {
  const authorization = validateNormativeOperationAuthorizationV1(
    await readJsonBounded(path.join(directory, "authorization.json")),
  );
  const publicKey = canonicalPublicKey(
    await readTextBounded(
      path.join(directory, "authorization-public-key.pem"),
      64 * 1024,
    ),
  );
  if (
    authorization.audience !== AUTHORIZATION_AUDIENCE ||
    authorization.issuerId !== "operator:local-empirical-campaign" ||
    authorization.registrationDigest !==
      loaded.registration.registrationDigest ||
    authorization.planDigest !== loaded.plan.planDigest ||
    authorization.adapterDigest !== loaded.descriptor.descriptorDigest ||
    authorization.sourceCommit !== loaded.source.sourceCommit ||
    authorization.sourceTreeDigest !== loaded.source.sourceTreeDigest ||
    authorization.maximumCells !==
      authorization.shardIndices.length * CELLS_PER_SHARD ||
    authorization.credentialId !== credentialIdForPublicKey(publicKey) ||
    authorization.authentication.credentialId !== authorization.credentialId ||
    !verifyBytes(
      null,
      Buffer.from(authorization.authorizationDigest, "utf8"),
      publicKey,
      Buffer.from(authorization.authentication.signature, "base64url"),
    )
  )
    fail("empirical_campaign_authorization_invalid");
  if (requireActive && Date.now() >= Date.parse(authorization.expiresAt))
    fail("empirical_campaign_authorization_expired");
  return {
    authorization,
    verifier: Object.freeze({
      schemaVersion: 1,
      verifyDetachedAuthorizationV1(input) {
        return (
          input.authorizationDigest === authorization.authorizationDigest &&
          input.authentication.credentialId === authorization.credentialId &&
          verifyBytes(
            null,
            Buffer.from(input.authorizationDigest, "utf8"),
            publicKey,
            Buffer.from(input.authentication.signature, "base64url"),
          )
        );
      },
    }),
  };
}

async function loadShardReceipts(outputDirectory, loaded, authorization) {
  const directory = path.join(outputDirectory, "shards");
  let names = [];
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const receipts = new Map();
  for (const name of names.sort()) {
    if (!/^shard-[0-4][0-9]\.json$/u.test(name))
      fail("empirical_campaign_unknown_shard_artifact");
    const shardIndex = Number(name.slice(6, 8));
    if (shardIndex >= EXPECTED_SHARDS)
      fail("empirical_campaign_shard_receipt_invalid");
    const receipt = await readJsonBounded(path.join(directory, name));
    validateShardReceipt(receipt, loaded, authorization, shardIndex);
    if (receipts.has(shardIndex))
      fail("empirical_campaign_duplicate_shard_receipt");
    receipts.set(shardIndex, receipt);
  }
  return receipts;
}

function validateShardReceipt(receipt, loaded, authorization, shardIndex) {
  const { receiptDigest, ...body } = receipt;
  const expectedExecutionId =
    collectiveStatisticalCampaignNormativeExecutionIdV1({
      schemaVersion: 1,
      registration: loaded.registration,
      descriptor: loaded.descriptor,
      plan: loaded.plan,
      authorization,
    });
  if (
    receipt.schemaVersion !== 1 ||
    receipt.kind !== "agentplat-local-empirical-shard-receipt-v1" ||
    receipt.status !== "completed" ||
    receipt.sourceCommit !== loaded.source.sourceCommit ||
    receipt.registrationDigest !== loaded.registration.registrationDigest ||
    receipt.planDigest !== loaded.plan.planDigest ||
    receipt.adapterDigest !== loaded.descriptor.descriptorDigest ||
    receipt.authorizationDigest !== authorization.authorizationDigest ||
    receipt.executionId !== expectedExecutionId ||
    receipt.authorizationExecutionId !== authorization.executionId ||
    receipt.shardIndex !== shardIndex ||
    receipt.selectedCellCount !== CELLS_PER_SHARD ||
    receipt.projectionCount !== PROJECTIONS_PER_SHARD ||
    receipt.verifiedArtifactCount !== PROJECTIONS_PER_SHARD ||
    !Array.isArray(receipt.projectionArtifactIndexes) ||
    receipt.projectionArtifactIndexes.length !== PROJECTIONS_PER_SHARD ||
    receipt.resultsCollected !== false ||
    receipt.empiricalClaimPermitted !== false ||
    receiptDigest !== artifactDigest("local-empirical-shard-receipt", body)
  )
    fail("empirical_campaign_shard_receipt_invalid");
}

function inspectCleanSource(expectedCommit) {
  const git = (args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const sourceCommit = git(["rev-parse", "HEAD"]);
  if (sourceCommit !== expectedCommit)
    fail("empirical_campaign_source_commit_mismatch");
  if (git(["status", "--porcelain", "--untracked-files=all"]).length > 0)
    fail("empirical_campaign_source_worktree_dirty");
  const rootPackage = JSON.parse(git(["show", "HEAD:package.json"]));
  return {
    schemaVersion: 1,
    sourceCommit,
    sourceTreeDigest: artifactDigest("source-tree", {
      schemaVersion: 1,
      gitTree: git(["rev-parse", "HEAD^{tree}"]),
    }),
    dirtyWorktree: false,
    packageLock: {
      schemaVersion: 1,
      packageVersion: rootPackage.version,
      pnpmLockBlob: git(["rev-parse", "HEAD:pnpm-lock.yaml"]),
    },
  };
}

function paperCsv(rows) {
  const header = [
    "cell_id",
    "scale",
    "stratum",
    "seed",
    "adaptive_mission_success",
    "adaptive_interactions",
    "adaptive_replay_exact",
    "adaptive_safety_violations",
    "adaptive_recovery_interactions",
    "adaptive_convergence_agreement",
    "adaptive_convergence_interactions",
    "adaptive_role_decisions",
    "adaptive_useful_role_decisions",
    "centralized_mission_success",
    "centralized_interactions",
    "centralized_replay_exact",
    "centralized_safety_violations",
  ];
  const values = rows.map((row) => [
    row.cellId,
    row.scale,
    row.stratum,
    row.seed,
    row.adaptive.missionSuccess,
    row.adaptive.interactionTotal,
    row.adaptive.replayExact,
    row.adaptive.safetyViolationCount,
    row.adaptive.recoveryInteractions,
    row.adaptive.convergenceAgreement,
    row.adaptive.convergenceInteractionDelta,
    row.adaptive.roleDecisionCount,
    row.adaptive.usefulRoleDecisionCount,
    row.centralized.missionSuccess,
    row.centralized.interactionTotal,
    row.centralized.replayExact,
    row.centralized.safetyViolationCount,
  ]);
  return `${[header, ...values].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value) {
  if (value === null) return "";
  const text = String(value);
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseOptions(args) {
  const result = Object.create(null);
  const values = args.filter((value) => value !== "--");
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (
      !name?.startsWith("--") ||
      value === undefined ||
      value.startsWith("--")
    )
      fail("empirical_campaign_option_syntax_invalid");
    const key = name.slice(2);
    if (key in result) fail("empirical_campaign_option_duplicate");
    result[key] = value;
  }
  return result;
}

function exactOptions(expected) {
  const actual = Object.keys(options).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((name, index) => name !== wanted[index])
  )
    fail("empirical_campaign_option_set_invalid");
}

function tokenOption(name) {
  const value = options[name];
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u.test(value)
  )
    fail(`empirical_campaign_${name}_invalid`);
  return value;
}

function commitOption(name) {
  const value = options[name];
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/u.test(value))
    fail(`empirical_campaign_${name}_invalid`);
  return value;
}

function shardOption(name) {
  const value = Number(options[name]);
  if (!Number.isSafeInteger(value) || value < 0 || value >= EXPECTED_SHARDS)
    fail(`empirical_campaign_${name}_invalid`);
  return value;
}

function shardListOption(name) {
  const text = options[name];
  if (
    typeof text !== "string" ||
    !/^(?:[0-9]|[1-3][0-9]|4[0-7])(?:,(?:[0-9]|[1-3][0-9]|4[0-7]))*$/u.test(
      text,
    )
  )
    fail(`empirical_campaign_${name}_invalid`);
  const values = text.split(",").map(Number);
  if (
    new Set(values).size !== values.length ||
    values.some((value, index) => index > 0 && value <= values[index - 1])
  )
    fail(`empirical_campaign_${name}_invalid`);
  return values;
}

function timestampOption(name) {
  const value = options[name];
  if (typeof value !== "string" || new Date(value).toISOString() !== value)
    fail(`empirical_campaign_${name}_invalid`);
  return value;
}

function pathOption(name) {
  const value = options[name];
  if (typeof value !== "string" || value.includes("\0"))
    fail(`empirical_campaign_${name}_invalid`);
  return path.resolve(value);
}

function externalDirectoryOption(name) {
  const value = pathOption(name);
  const relative = path.relative(root, value);
  if (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  )
    fail(`empirical_campaign_${name}_must_be_external`);
  return value;
}

function externalFileOption(name) {
  const value = pathOption(name);
  const relative = path.relative(root, value);
  if (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  )
    fail(`empirical_campaign_${name}_must_be_external`);
  return value;
}

function canonicalPublicKey(value) {
  try {
    return String(
      createPublicKey(value).export({ type: "spki", format: "pem" }),
    );
  } catch {
    fail("empirical_campaign_public_key_invalid");
  }
}

function credentialIdForPublicKey(value) {
  return `credential:${createHash("sha256").update(value).digest("hex")}`;
}

async function readJsonBounded(file) {
  const bytes = await readFile(file);
  if (bytes.byteLength < 2 || bytes.byteLength > JSON_LIMITS.maximumBytes)
    fail("empirical_campaign_json_size_invalid");
  try {
    return JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes));
  } catch {
    fail("empirical_campaign_json_invalid");
  }
}

async function readJsonIfPresent(file) {
  try {
    return await readJsonBounded(file);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readTextBounded(file, maximumBytes) {
  const value = await readFile(file, "utf8");
  if (
    Buffer.byteLength(value, "utf8") < 1 ||
    Buffer.byteLength(value, "utf8") > maximumBytes
  )
    fail("empirical_campaign_text_size_invalid");
  return value;
}

async function writeJsonImmutable(file, value) {
  await writeTextImmutable(file, `${canonical(value)}\n`);
}

async function writeTextImmutable(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporary, value, { flag: "wx" });
    try {
      await link(temporary, file);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if ((await readFile(file, "utf8")) !== value)
        fail("empirical_campaign_immutable_artifact_conflict");
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

function artifactDigest(kind, value) {
  return digestPlanningJsonV1(
    "evaluation-campaign-artifact-v1",
    {
      schemaVersion: 1,
      kind,
      value,
    },
    JSON_LIMITS,
  );
}

function canonical(value) {
  return canonicalizePlanningJsonV1(value, JSON_LIMITS);
}

function status(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fail(reason) {
  throw new TypeError(reason);
}
