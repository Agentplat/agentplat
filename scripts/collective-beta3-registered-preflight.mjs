import { execFileSync, spawn } from 'node:child_process';
import {
  createPrivateKey,
  createPublicKey,
  createHash,
  randomUUID,
  sign as signBytes,
  verify as verifyBytes,
} from 'node:crypto';
import { link, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';

import {
  canonicalizePlanningJsonV1,
  digestPlanningJsonV1,
} from '../packages/collective-planning/dist/index.js';
import {
  COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
  collectiveEvaluationCampaignProfileCellsV1,
  createCollectiveEvaluationCampaignRegistrationV1,
  createNormativeOperationAuthorizationV1,
  createNormativeOperationPlanV1,
  createNormativeRunnerDescriptorV1,
  validateCollectiveEvaluationCampaignRegistrationV1,
  validateNormativeOperationAuthorizationV1,
  validateNormativeOperationPlanV1,
  validateNormativeRunnerDescriptorV1,
} from '../packages/collective-planning/dist/evaluation.js';
import {
  collectiveStatisticalCampaignNormativeExecutionIdV1,
  createCollectiveStatisticalCampaignFaultMatrixV1,
  createCollectiveStatisticalCampaignNormativeAdapterResolverV1,
  createCollectiveStatisticalCampaignRegisteredProjectorV1,
  createCollectiveStatisticalCampaignRegisteredRunnerV1,
  createCollectiveStatisticalCampaignScaleConfigurationV1,
  digestCollectiveStatisticalCampaignArtifactV1,
  runCollectiveStatisticalCampaignNormativeOperationV1,
  verifyCollectiveStatisticalCampaignArtifactStreamV1,
} from '../packages/mesh-sim/dist/index.js';
import {
  PostgresCollectiveStatisticalCampaignStoreV1,
  createPostgresCollectiveStatisticalCampaignArtifactReaderV1,
  runMeshSimPostgresMigrationsV1,
} from '../packages/mesh-sim-postgres/dist/index.js';
import { createPostgresPool } from '../packages/postgres/dist/index.js';

const PREFLIGHT_CONFIRMATION = 'RUN_REGISTERED_PREFLIGHT_5X4';
const PREFLIGHT_SHARD = 2;
const AUTHORIZATION_AUDIENCE = 'agentplat:registered-preflight-v1';
const ADAPTER_ID = 'adapter:mesh-closed-loop-registered';
const ADAPTER_VERSION = '1.0.0';
const ISOLATED_RUNNER_IMAGE =
  'node:20.19.3-bookworm-slim@sha256:fa43945ad45c5f8c50dbea0633d888ddeb739f7d4e06c7696a9d68b54054238a';
const RUNNERS = Object.freeze(['adaptive_collective', 'centralized_planner']);
const ATTEMPTS = Object.freeze(['first', 'replay']);
const JSON_LIMITS = Object.freeze({
  maximumBytes: 16 * 1024 * 1024,
  maximumDepth: 64,
  maximumNodes: 1_000_000,
  maximumKeysPerObject: 4_096,
  maximumItemsPerArray: 16_384,
});

const options = parseOptions(process.argv.slice(2));

try {
  if (options.mode === 'plan') await plan(options);
  else if (options.mode === 'validate') await validateAdapter(options);
  else if (options.mode === 'authorize') await authorize(options);
  else if (options.mode === 'execute') await execute(options);
  else fail('registered_preflight_mode_invalid');
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ status: 'rejected', reasonCode: publicFailureReason(error) })}\n`,
  );
  process.exitCode = 2;
}

function publicFailureReason(error) {
  const message = error instanceof Error ? error.message : '';
  return options.mode === 'execute' &&
    /^(?:preflight|collective_statistical_campaign)_[a-z0-9_]{1,160}$/u.test(
      message,
    )
    ? message
    : 'registered_preflight_failed';
}

async function plan(value) {
  exactOptions(value, [
    'campaign-id',
    'confirm',
    'mode',
    'output-directory',
    'source-sha',
  ]);
  if (value.confirm !== 'DO_NOT_RUN')
    fail('preflight_plan_confirmation_invalid');
  assertToken(value['campaign-id'], 'campaign_id');
  assertCommit(value['source-sha'], 'source_sha');
  const source = inspectCleanSource(value['source-sha']);
  const prepared = createPreparedOperation(value['campaign-id'], source);
  const outputDirectory = absoluteDirectory(value['output-directory']);
  const slots = prepared.registration.cells.flatMap((cell) =>
    RUNNERS.flatMap((runner) =>
      ATTEMPTS.map((attempt) => ({
        schemaVersion: 1,
        slotId: `${cell.cellId}:${runner}:${attempt}`,
        cellId: cell.cellId,
        runner,
        attempt,
        slotIdentityDigest: artifactDigest('expected-slot', {
          registrationDigest: prepared.registration.registrationDigest,
          cellId: cell.cellId,
          runner,
          attempt,
        }),
      })),
    ),
  );
  const expectedBody = {
    schemaVersion: 1,
    kind: 'collective_beta3_registered_expected_manifest',
    registrationDigest: prepared.registration.registrationDigest,
    planDigest: prepared.operationPlan.planDigest,
    cells: prepared.registration.cells.map((cell) => ({
      schemaVersion: 1,
      cellId: cell.cellId,
      peerCount: cell.peerCount,
      stratum: cell.stratum,
      seed: cell.seed,
      maximumInteractions: cell.maximumInteractions,
    })),
    slots,
  };
  const selected = prepared.operationPlan.shards[PREFLIGHT_SHARD];
  if (!selected || selected.cellIds.length !== 5)
    fail('preflight_shard_invalid');
  const preflightBody = {
    schemaVersion: 1,
    kind: 'collective_beta3_registered_preflight',
    registrationDigest: prepared.registration.registrationDigest,
    planDigest: prepared.operationPlan.planDigest,
    adapterDigest: prepared.descriptor.descriptorDigest,
    shardIndex: PREFLIGHT_SHARD,
    cellIds: selected.cellIds,
    cellCount: 5,
    slotCount: 20,
    maximumInteractions: selected.cellIds.reduce((total, cellId) => {
      const cell = prepared.registration.cells.find(
        (candidate) => candidate.cellId === cellId,
      );
      if (!cell) fail('preflight_cell_missing');
      return total + cell.maximumInteractions * 4;
    }, 0),
    fullCampaignPermitted: false,
  };
  const estimateBody = {
    schemaVersion: 1,
    kind: 'collective_beta3_registered_cost_estimate',
    registrationDigest: prepared.registration.registrationDigest,
    planDigest: prepared.operationPlan.planDigest,
    cells: 5,
    slots: 20,
    shards: 1,
    maximumInteractions: preflightBody.maximumInteractions,
    paidProviderCalls: 0,
    adapterDeclared: true,
    adapterRegistered: false,
    executionPermitted: false,
    fullCampaignPermitted: false,
  };
  await mkdir(outputDirectory, { recursive: true });
  for (const [name, artifact] of [
    ['source-lock.json', source],
    ['adapter-descriptor.json', prepared.descriptor],
    ['registration.json', prepared.registration],
    ['operation-plan.json', prepared.operationPlan],
    [
      'expected-manifest.json',
      {
        ...expectedBody,
        manifestDigest: artifactDigest('expected-manifest', expectedBody),
      },
    ],
    [
      'preflight.json',
      {
        ...preflightBody,
        preflightDigest: artifactDigest('registered-preflight', preflightBody),
      },
    ],
    [
      'estimate.json',
      {
        ...estimateBody,
        estimateDigest: artifactDigest('cost-estimate', estimateBody),
      },
    ],
  ])
    await writeJsonImmutable(path.join(outputDirectory, name), artifact);
  writeStatus({
    status: 'planned',
    adapterDeclared: true,
    adapterRegistered: false,
    executionPermitted: false,
    registrationDigest: prepared.registration.registrationDigest,
    planDigest: prepared.operationPlan.planDigest,
    adapterDigest: prepared.descriptor.descriptorDigest,
    shardIndex: PREFLIGHT_SHARD,
    cells: 5,
    slots: 20,
    maximumInteractions: preflightBody.maximumInteractions,
  });
}

async function validateAdapter(value) {
  exactOptions(value, [
    'campaign-id',
    'confirm',
    'mode',
    'output-directory',
    'registration-directory',
    'source-sha',
  ]);
  if (value.confirm !== PREFLIGHT_CONFIRMATION)
    fail('preflight_confirmation_required');
  const loaded = await loadPreparedOperation(value, false);
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
          planDigests: [loaded.operationPlan.planDigest],
        },
      ],
    });
  const resolved = await resolver.resolveRegisteredAdapterV1({
    schemaVersion: 1,
    purpose: 'collective-statistical-campaign-normative-adapter-v1',
    descriptorDigest: loaded.descriptor.descriptorDigest,
    implementationDigest: loaded.descriptor.digests.implementationDigest,
    evaluatorDigest: loaded.descriptor.digests.evaluatorDigest,
    planDigest: loaded.operationPlan.planDigest,
    authorizationDigest: artifactDigest('validation-authorization', {
      planDigest: loaded.operationPlan.planDigest,
    }),
  });
  if (
    resolved.runner === resolved.projector ||
    resolved.descriptorDigest !== loaded.descriptor.descriptorDigest
  )
    fail('preflight_adapter_separation_invalid');
  const receiptBody = {
    schemaVersion: 1,
    kind: 'collective_beta3_registered_adapter_validation',
    status: 'accepted',
    adapterRegistered: true,
    executionPermitted: false,
    sourceCommit: loaded.source.sourceCommit,
    registrationDigest: loaded.registration.registrationDigest,
    planDigest: loaded.operationPlan.planDigest,
    adapterDigest: loaded.descriptor.descriptorDigest,
    implementationDigest: loaded.descriptor.digests.implementationDigest,
    evaluatorDigest: loaded.descriptor.digests.evaluatorDigest,
  };
  const outputDirectory = absoluteDirectory(value['output-directory']);
  await mkdir(outputDirectory, { recursive: true });
  await writeJsonImmutable(
    path.join(outputDirectory, 'adapter-validation-receipt.json'),
    {
      ...receiptBody,
      receiptDigest: artifactDigest('adapter-validation-receipt', receiptBody),
    },
  );
  writeStatus({
    status: 'validated',
    adapterRegistered: true,
    executionPermitted: false,
    adapterDigest: loaded.descriptor.descriptorDigest,
  });
}

async function authorize(value) {
  exactOptions(value, [
    'authorization-id',
    'campaign-id',
    'confirm',
    'execution-id',
    'mode',
    'output-directory',
    'registration-directory',
    'source-sha',
  ]);
  if (value.confirm !== PREFLIGHT_CONFIRMATION)
    fail('preflight_confirmation_required');
  assertToken(value['authorization-id'], 'authorization_id');
  assertToken(value['execution-id'], 'execution_id');
  const loaded = await loadPreparedOperation(value, false);
  const { privateKey, publicKeyPem } = trustedSigningMaterial();
  const credentialId = credentialIdForPublicKey(publicKeyPem);
  const authorizedAt = new Date();
  const expiresAt = new Date(authorizedAt.getTime() + 30 * 60 * 1_000);
  const body = {
    schemaVersion: 1,
    authorizationId: value['authorization-id'],
    issuerId: 'operator:protected-preflight',
    audience: AUTHORIZATION_AUDIENCE,
    credentialId,
    signatureAlgorithm: 'ed25519',
    planDigest: loaded.operationPlan.planDigest,
    registrationDigest: loaded.registration.registrationDigest,
    sourceCommit: loaded.source.sourceCommit,
    sourceTreeDigest: loaded.source.sourceTreeDigest,
    adapterDigest: loaded.descriptor.descriptorDigest,
    executionId: value['execution-id'],
    shardIndices: [PREFLIGHT_SHARD],
    authorizedAt: authorizedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    maximumCells: 5,
  };
  const placeholder = createNormativeOperationAuthorizationV1({
    ...body,
    authentication: {
      schemaVersion: 1,
      credentialId,
      algorithm: 'ed25519',
      signature: Buffer.alloc(64).toString('base64url'),
    },
  });
  const signature = signBytes(
    null,
    Buffer.from(placeholder.authorizationDigest, 'utf8'),
    privateKey,
  ).toString('base64url');
  const authorization = createNormativeOperationAuthorizationV1({
    ...body,
    authentication: {
      schemaVersion: 1,
      credentialId,
      algorithm: 'ed25519',
      signature,
    },
  });
  const outputDirectory = absoluteDirectory(value['output-directory']);
  await mkdir(outputDirectory, { recursive: true });
  await writeJsonImmutable(
    path.join(outputDirectory, 'authorization.json'),
    authorization,
  );
  await writeTextImmutable(
    path.join(outputDirectory, 'authorization-public-key.pem'),
    String(publicKeyPem),
  );
  const receiptBody = {
    schemaVersion: 1,
    kind: 'collective_beta3_registered_authorization_receipt',
    status: 'authorized',
    authorizationId: authorization.authorizationId,
    authorizationDigest: authorization.authorizationDigest,
    credentialId,
    audience: AUTHORIZATION_AUDIENCE,
    planDigest: loaded.operationPlan.planDigest,
    adapterDigest: loaded.descriptor.descriptorDigest,
    shardIndex: PREFLIGHT_SHARD,
    maximumCells: 5,
    expiresAt: authorization.expiresAt,
  };
  await writeJsonImmutable(
    path.join(outputDirectory, 'authorization-receipt.json'),
    {
      ...receiptBody,
      receiptDigest: artifactDigest('authorization-receipt', receiptBody),
    },
  );
  writeStatus({
    status: 'authorized',
    authorizationDigest: authorization.authorizationDigest,
    shardIndex: PREFLIGHT_SHARD,
    maximumCells: 5,
  });
}

async function execute(value) {
  exactOptions(value, [
    'authorization-directory',
    'campaign-id',
    'confirm',
    'mode',
    'output-directory',
    'registration-directory',
    'source-sha',
    'worker-id',
  ]);
  if (value.confirm !== PREFLIGHT_CONFIRMATION)
    fail('preflight_confirmation_required');
  assertToken(value['worker-id'], 'worker_id');
  const loaded = await loadPreparedOperation(value, false);
  const authorizationDirectory = absoluteDirectory(
    value['authorization-directory'],
  );
  const authorization = validateNormativeOperationAuthorizationV1(
    await readJsonBounded(
      path.join(authorizationDirectory, 'authorization.json'),
    ),
  );
  const publicKeyPem = await readTextBounded(
    path.join(authorizationDirectory, 'authorization-public-key.pem'),
    16 * 1024,
  );
  const trustedPublicKeyPem = trustedPublicKey();
  if (canonicalPublicKey(publicKeyPem) !== trustedPublicKeyPem)
    fail('preflight_authorization_trust_anchor_mismatch');
  const expectedCredentialId = credentialIdForPublicKey(trustedPublicKeyPem);
  if (
    authorization.planDigest !== loaded.operationPlan.planDigest ||
    authorization.registrationDigest !==
      loaded.registration.registrationDigest ||
    authorization.adapterDigest !== loaded.descriptor.descriptorDigest ||
    authorization.shardIndices.length !== 1 ||
    authorization.shardIndices[0] !== PREFLIGHT_SHARD ||
    authorization.maximumCells !== 5
  )
    fail('preflight_authorization_binding_invalid');
  if (
    authorization.credentialId !== expectedCredentialId ||
    authorization.authentication.credentialId !== expectedCredentialId ||
    authorization.issuerId !== 'operator:protected-preflight' ||
    authorization.audience !== AUTHORIZATION_AUDIENCE
  )
    fail('preflight_authorization_identity_invalid');
  const signatureValid = verifyBytes(
    null,
    Buffer.from(authorization.authorizationDigest, 'utf8'),
    trustedPublicKeyPem,
    Buffer.from(authorization.authentication.signature, 'base64url'),
  );
  if (!signatureValid) fail('preflight_authorization_signature_invalid');
  const executionNamespace =
    collectiveStatisticalCampaignNormativeExecutionIdV1({
      schemaVersion: 1,
      registration: loaded.registration,
      descriptor: loaded.descriptor,
      plan: loaded.operationPlan,
      authorization,
    });
  const databaseUrl = process.env.AGENTPLAT_PREFLIGHT_DATABASE_URL;
  const databaseUser = process.env.AGENTPLAT_PREFLIGHT_DATABASE_USER;
  const databasePassword = process.env.AGENTPLAT_PREFLIGHT_DATABASE_PASSWORD;
  if (!databaseUrl || !databaseUser || !databasePassword)
    fail('preflight_database_configuration_missing');
  const pool = createPostgresPool({
    ...postgresConnectionConfiguration(
      databaseUrl,
      databaseUser,
      databasePassword,
    ),
    max: 4,
    connectionTimeoutMillis: 10_000,
    application_name: 'agentplat-registered-preflight',
  });
  delete process.env.AGENTPLAT_PREFLIGHT_DATABASE_URL;
  delete process.env.AGENTPLAT_PREFLIGHT_DATABASE_USER;
  delete process.env.AGENTPLAT_PREFLIGHT_DATABASE_PASSWORD;
  let isolatedRunner;
  try {
    await runMeshSimPostgresMigrationsV1(pool, { schema: 'public' });
    const store = new PostgresCollectiveStatisticalCampaignStoreV1(pool, {
      schema: 'public',
      namespace: executionNamespace,
    });
    isolatedRunner = createIsolatedRegisteredRunnerV1();
    const runner = isolatedRunner.runner;
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
            planDigests: [loaded.operationPlan.planDigest],
            authorizationDigests: [authorization.authorizationDigest],
          },
        ],
      });
    const result = await runCollectiveStatisticalCampaignNormativeOperationV1({
      schemaVersion: 1,
      registration: loaded.registration,
      descriptor: loaded.descriptor,
      plan: loaded.operationPlan,
      authorization,
      authorizationAudience: AUTHORIZATION_AUDIENCE,
      authorizationVerifier: {
        schemaVersion: 1,
        verifyDetachedAuthorizationV1(input) {
          return (
            input.authorizationDigest === authorization.authorizationDigest &&
            input.authentication.credentialId ===
              authorization.authentication.credentialId &&
            verifyBytes(
              null,
              Buffer.from(input.authorizationDigest, 'utf8'),
              trustedPublicKeyPem,
              Buffer.from(input.authentication.signature, 'base64url'),
            )
          );
        },
      },
      source: {
        commit: loaded.source.sourceCommit,
        treeDigest: loaded.source.sourceTreeDigest,
        clean: true,
      },
      shardIndex: PREFLIGHT_SHARD,
      workerId: value['worker-id'],
      leaseDurationMs: 5 * 60 * 1_000,
      store,
      artifacts: store.createArtifactWriterV1(),
      adapterResolver: resolver,
      now: () => Date.now(),
    });
    const verification =
      await verifyCollectiveStatisticalCampaignArtifactStreamV1({
        schemaVersion: 1,
        artifacts: result.projectionArtifactIndexes,
        reader: createPostgresCollectiveStatisticalCampaignArtifactReaderV1(
          store,
          result.projectionArtifactIndexes,
        ),
      });
    if (
      result.selectedCellCount !== 5 ||
      result.projectionCount !== 20 ||
      verification.artifactCount !== 20
    )
      fail('preflight_closure_invalid');
    const receiptBody = {
      schemaVersion: 1,
      kind: 'collective_beta3_registered_preflight_receipt',
      status: 'completed',
      releaseEvidence: false,
      fullCampaignPermitted: false,
      sourceCommit: loaded.source.sourceCommit,
      registrationDigest: loaded.registration.registrationDigest,
      planDigest: loaded.operationPlan.planDigest,
      adapterDigest: loaded.descriptor.descriptorDigest,
      authorizationDigest: authorization.authorizationDigest,
      executionId: result.executionId,
      authorizationExecutionId: result.authorizationExecutionId,
      shardIndex: result.shardIndex,
      selectedCellCount: result.selectedCellCount,
      executedSlotCount: result.executedSlotCount,
      resumedSlotCount: result.resumedSlotCount,
      projectionCount: result.projectionCount,
      verifiedArtifactCount: verification.artifactCount,
      verifiedArtifactBytes: verification.totalBytes,
      projectionRoot: artifactDigest('preflight-projection-root', {
        projectionDigests: result.projections.map(
          (projection) => projection.projectionDigest,
        ),
      }),
    };
    const outputDirectory = absoluteDirectory(value['output-directory']);
    await mkdir(outputDirectory, { recursive: true });
    await writeJsonImmutable(
      path.join(
        outputDirectory,
        `preflight-receipt-${createHash('sha256')
          .update(value['worker-id'])
          .digest('hex')}.json`,
      ),
      {
        ...receiptBody,
        receiptDigest: artifactDigest('preflight-receipt', receiptBody),
      },
    );
    writeStatus({
      status: 'completed',
      releaseEvidence: false,
      fullCampaignPermitted: false,
      executionId: result.executionId,
      shardIndex: result.shardIndex,
      executedSlotCount: result.executedSlotCount,
      resumedSlotCount: result.resumedSlotCount,
      projectionCount: result.projectionCount,
      verifiedArtifactCount: verification.artifactCount,
    });
  } finally {
    try {
      await isolatedRunner?.closeV1();
    } finally {
      await pool.end().catch(() => undefined);
    }
  }
}

async function loadPreparedOperation(value, allowPlanConfirmation) {
  assertToken(value['campaign-id'], 'campaign_id');
  assertCommit(value['source-sha'], 'source_sha');
  if (!allowPlanConfirmation && value.confirm !== PREFLIGHT_CONFIRMATION)
    fail('preflight_confirmation_required');
  const source = inspectCleanSource(value['source-sha']);
  const directory = absoluteDirectory(value['registration-directory']);
  const descriptor = validateNormativeRunnerDescriptorV1(
    await readJsonBounded(path.join(directory, 'adapter-descriptor.json')),
  );
  const registration = validateCollectiveEvaluationCampaignRegistrationV1(
    await readJsonBounded(path.join(directory, 'registration.json')),
  );
  const operationPlan = validateNormativeOperationPlanV1(
    await readJsonBounded(path.join(directory, 'operation-plan.json')),
    registration,
    descriptor,
  );
  const sourceLock = await readJsonBounded(
    path.join(directory, 'source-lock.json'),
  );
  const expected = createPreparedOperation(value['campaign-id'], source);
  for (const [actual, rebuilt, reason] of [
    [sourceLock, source, 'preflight_source_lock_changed'],
    [descriptor, expected.descriptor, 'preflight_descriptor_changed'],
    [registration, expected.registration, 'preflight_registration_changed'],
    [operationPlan, expected.operationPlan, 'preflight_plan_changed'],
  ])
    if (
      canonicalizePlanningJsonV1(actual, JSON_LIMITS) !==
      canonicalizePlanningJsonV1(rebuilt, JSON_LIMITS)
    )
      fail(reason);
  return { source, descriptor, registration, operationPlan };
}

function createPreparedOperation(campaignId, source) {
  const commitments = createRegisteredCommitments(source);
  const faultMatrix = createCollectiveStatisticalCampaignFaultMatrixV1();
  const schedule = collectiveEvaluationCampaignProfileCellsV1(
    COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
    campaignId,
  );
  const registration = createCollectiveEvaluationCampaignRegistrationV1({
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
    runners: RUNNERS,
    maximumInteractions: 5_000,
    cells: schedule.map((cell) => {
      const configuration =
        createCollectiveStatisticalCampaignScaleConfigurationV1({
          schemaVersion: 1,
          agentCount: cell.peerCount,
          seed: cell.seed,
          stratum: cell.stratum,
        });
      const faultPlanDigest = artifactDigest('registered-fault-plan', {
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
        adaptiveDefinitionDigest: artifactDigest('runner-definition', {
          runner: 'adaptive_collective',
          adapterVersion: ADAPTER_VERSION,
          configurationDigest: configuration.configurationDigest,
        }),
        centralizedDefinitionDigest: artifactDigest('runner-definition', {
          runner: 'centralized_planner',
          adapterVersion: ADAPTER_VERSION,
          configurationDigest: configuration.configurationDigest,
        }),
        faultPlanDigest,
        faultMatrixBindingDigest: digestPlanningJsonV1(
          'evaluation-campaign-fault-matrix-v1',
          {
            schemaVersion: 1,
            cellId: cell.cellId,
            stratum: cell.stratum,
            configurationDigest: configuration.configurationDigest,
            faultPlanDigest,
            faultMatrixDigest: faultMatrix.faultMatrixDigest,
            registeredFaultFamilies: configuration.registeredFaultFamilies,
          },
        ),
      };
    }),
  });
  const descriptor = createNormativeRunnerDescriptorV1({
    schemaVersion: 1,
    adapterId: ADAPTER_ID,
    adapterVersion: ADAPTER_VERSION,
    runnerClass: 'normative_candidate',
    capabilities: {
      schemaVersion: 1,
      runners: RUNNERS,
      scales: [50, 100, 250, 500],
      strata: ['nominal', 'benign', 'adversarial', 'mixed'],
      traceSchemaVersion: 2,
      accountingVersion: 'interaction-accounting-v2',
      environmentPortVersion: 1,
      monitorPortVersion: 1,
      exactReplay: true,
      evaluatorOwnedMetrics: true,
    },
    digests: {
      schemaVersion: 1,
      implementationDigest: commitments.implementationDigest,
      evaluatorDigest: commitments.evaluatorDigest,
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
  const operationPlan = createNormativeOperationPlanV1({
    schemaVersion: 1,
    registration,
    sourceCommit: source.sourceCommit,
    sourceTreeDigest: source.sourceTreeDigest,
    adapter: descriptor,
  });
  return { commitments, registration, descriptor, operationPlan };
}

function createRegisteredCommitments(source) {
  const common = {
    schemaVersion: 1,
    adapterId: ADAPTER_ID,
    adapterVersion: ADAPTER_VERSION,
    sourceTreeDigest: source.sourceTreeDigest,
    packageLock: source.packageLock,
  };
  return {
    packageDigest: artifactDigest('package-lock', source.packageLock),
    fixtureManifestDigest: artifactDigest('fixture-manifest', {
      ...common,
      profile: 'paired-resilience-registered-v1',
    }),
    policyDigest: artifactDigest('policy', {
      ...common,
      profile: 'bounded-collective-control-v1',
    }),
    environmentDigest: artifactDigest('environment', {
      ...common,
      profile: 'public-observation-protected-effect-v1',
    }),
    observationPolicyDigest: artifactDigest('observation-policy', {
      ...common,
      profile: 'peer-scoped-v1',
    }),
    monitorDigest: artifactDigest('monitor', {
      ...common,
      profile: 'independent-terminal-monitor-v1',
    }),
    hiddenCanaryDigest: artifactDigest('hidden-canary', {
      ...common,
      profile: 'digest-only-v1',
    }),
    implementationDigest: artifactDigest('registered-runner', {
      ...common,
      implementation: 'mesh-closed-loop-runner-v1',
    }),
    evaluatorDigest: artifactDigest('registered-evaluator', {
      ...common,
      implementation: 'trace-projection-evaluator-v1',
    }),
  };
}

function trustedSigningMaterial() {
  const privateEncoded =
    process.env.AGENTPLAT_PREFLIGHT_SIGNING_PRIVATE_KEY_B64;
  const publicKeyPem = trustedPublicKey();
  delete process.env.AGENTPLAT_PREFLIGHT_SIGNING_PRIVATE_KEY_B64;
  if (!privateEncoded || Buffer.byteLength(privateEncoded, 'utf8') > 32 * 1024)
    fail('preflight_signing_key_missing');
  let privateKey;
  try {
    privateKey = createPrivateKey(
      Buffer.from(privateEncoded, 'base64').toString('utf8'),
    );
  } catch {
    fail('preflight_signing_key_invalid');
  }
  const derived = createPublicKey(privateKey).export({
    type: 'spki',
    format: 'pem',
  });
  if (canonicalPublicKey(String(derived)) !== publicKeyPem)
    fail('preflight_signing_key_trust_anchor_mismatch');
  return { privateKey, publicKeyPem };
}

function postgresConnectionConfiguration(databaseUrl, user, password) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    fail('preflight_database_url_invalid');
  }
  if (
    (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    parsed.hostname.length === 0 ||
    parsed.pathname.length < 2 ||
    parsed.pathname.slice(1).includes('/')
  )
    fail('preflight_database_url_invalid');
  let database;
  try {
    database = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    fail('preflight_database_url_invalid');
  }
  const port = parsed.port === '' ? 5432 : Number(parsed.port);
  if (
    !/^[A-Za-z0-9_.-]{1,63}$/u.test(database) ||
    !/^[A-Za-z0-9_.-]{1,63}$/u.test(user) ||
    Buffer.byteLength(password, 'utf8') > 4_096 ||
    !Number.isSafeInteger(port) ||
    port < 1 ||
    port > 65_535
  )
    fail('preflight_database_configuration_invalid');
  return Object.freeze({
    host: parsed.hostname,
    port,
    database,
    user,
    password,
  });
}

function trustedPublicKey() {
  const encoded = process.env.AGENTPLAT_PREFLIGHT_TRUSTED_PUBLIC_KEY_B64;
  delete process.env.AGENTPLAT_PREFLIGHT_TRUSTED_PUBLIC_KEY_B64;
  if (!encoded || Buffer.byteLength(encoded, 'utf8') > 32 * 1024)
    fail('preflight_trusted_key_missing');
  try {
    return canonicalPublicKey(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    fail('preflight_trusted_key_invalid');
  }
}

function canonicalPublicKey(value) {
  try {
    return String(
      createPublicKey(value).export({ type: 'spki', format: 'pem' }),
    );
  } catch {
    fail('preflight_trusted_key_invalid');
  }
}

function credentialIdForPublicKey(publicKeyPem) {
  return `credential:${createHash('sha256')
    .update(publicKeyPem)
    .digest('hex')}`;
}

function createIsolatedRegisteredRunnerV1() {
  const workspaceRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim();
  const child = spawn(
    'docker',
    [
      'run',
      '--rm',
      '-i',
      '--pull',
      'never',
      '--network',
      'none',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--pids-limit',
      '128',
      '--memory',
      '4g',
      '--cpus',
      '2',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,nodev,size=64m',
      '--volume',
      `${workspaceRoot}:/workspace:ro`,
      '--workdir',
      '/workspace',
      ISOLATED_RUNNER_IMAGE,
      'node',
      'scripts/collective-beta3-registered-runner-worker.mjs',
    ],
    {
      cwd: workspaceRoot,
      env: { PATH: process.env.PATH ?? '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  const pending = new Map();
  let nextId = 0;
  let exited = false;
  let stderr = '';
  let exitError = null;
  const exit = new Promise((resolve) => {
    child.once('error', (error) => {
      exitError = error;
    });
    child.once('close', (code, signal) => {
      exited = true;
      if (code !== 0)
        exitError = new TypeError(
          `isolated runner exited unexpectedly (${code ?? signal ?? 'unknown'})${stderr.length > 0 ? `: ${stderr}` : ''}`,
        );
      for (const request of pending.values())
        request.reject(
          exitError ?? new TypeError('isolated runner exited unexpectedly'),
        );
      pending.clear();
      resolve();
    });
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    if (stderr.length < 8_192) stderr += String(chunk).slice(0, 8_192);
  });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  lines.on('line', (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      child.kill('SIGKILL');
      return;
    }
    const request = pending.get(message?.id);
    if (!request) {
      child.kill('SIGKILL');
      return;
    }
    if (message.type === 'renew') {
      void Promise.resolve(request.renewLeaseV1(message.expiresAtMs)).then(
        () =>
          send({
            type: 'renew-result',
            renewalId: message.renewalId,
            ok: true,
          }),
        () =>
          send({
            type: 'renew-result',
            renewalId: message.renewalId,
            ok: false,
          }),
      );
      return;
    }
    if (message.type !== 'result') {
      child.kill('SIGKILL');
      return;
    }
    pending.delete(message.id);
    if (message.ok === true) request.resolve(message.output);
    else request.reject(new TypeError('isolated runner execution failed'));
  });

  function send(message) {
    if (exited || !child.stdin.writable)
      throw exitError ?? new TypeError('isolated runner is unavailable');
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  return Object.freeze({
    runner: Object.freeze({
      schemaVersion: 1,
      executeV1(context) {
        if (pending.size !== 0)
          return Promise.reject(
            new TypeError('isolated runner concurrency is unsupported'),
          );
        const id = ++nextId;
        const { renewLeaseV1, ...serializableContext } = context;
        return new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject, renewLeaseV1 });
          try {
            send({ type: 'execute', id, context: serializableContext });
          } catch (error) {
            pending.delete(id);
            reject(error);
          }
        });
      },
    }),
    async closeV1() {
      if (!exited) {
        if (pending.size !== 0)
          throw new TypeError('isolated runner still has an active execution');
        send({ type: 'close' });
        child.stdin.end();
      }
      await exit;
      if (exitError) throw exitError;
    },
  });
}

function inspectCleanSource(expectedCommit) {
  const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const sourceCommit = git(['rev-parse', 'HEAD']);
  if (sourceCommit !== expectedCommit) fail('preflight_source_commit_mismatch');
  if (git(['status', '--porcelain', '--untracked-files=all']).length > 0)
    fail('preflight_source_worktree_dirty');
  const gitTree = git(['rev-parse', 'HEAD^{tree}']);
  const rootPackage = JSON.parse(
    execFileSync('git', ['show', 'HEAD:package.json'], { encoding: 'utf8' }),
  );
  return {
    schemaVersion: 1,
    sourceCommit,
    sourceTreeDigest: artifactDigest('source-tree', {
      schemaVersion: 1,
      gitTree,
    }),
    dirtyWorktree: false,
    packageLock: {
      schemaVersion: 1,
      packageVersion: rootPackage.version,
      pnpmLockBlob: git(['rev-parse', 'HEAD:pnpm-lock.yaml']),
    },
  };
}

function parseOptions(args) {
  const result = Object.create(null);
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (
      !name?.startsWith('--') ||
      value === undefined ||
      value.startsWith('--')
    )
      fail('preflight_option_syntax_invalid');
    const key = name.slice(2);
    if (key in result) fail('preflight_option_duplicate');
    result[key] = value;
  }
  return result;
}

function exactOptions(value, expected) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((name, index) => name !== wanted[index])
  )
    fail('preflight_option_set_invalid');
}

function assertToken(value, label) {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u.test(value)
  )
    fail(`preflight_${label}_invalid`);
}

function assertCommit(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/u.test(value))
    fail(`preflight_${label}_invalid`);
}

function absoluteDirectory(value) {
  if (typeof value !== 'string' || value.includes('\0'))
    fail('preflight_directory_invalid');
  return path.resolve(value);
}

function artifactDigest(kind, value) {
  return digestPlanningJsonV1(
    'evaluation-campaign-artifact-v1',
    { schemaVersion: 1, kind, value },
    JSON_LIMITS,
  );
}

async function readJsonBounded(file) {
  const text = await readTextBounded(file, JSON_LIMITS.maximumBytes);
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail('preflight_json_invalid');
  }
  canonicalizePlanningJsonV1(value, JSON_LIMITS);
  return value;
}

async function readTextBounded(file, maximumBytes) {
  const bytes = await readFile(file);
  if (bytes.byteLength < 1 || bytes.byteLength > maximumBytes)
    fail('preflight_file_size_invalid');
  try {
    return new TextDecoder('utf8', { fatal: true }).decode(bytes);
  } catch {
    fail('preflight_file_encoding_invalid');
  }
}

async function writeJsonImmutable(file, value) {
  await writeTextImmutable(
    file,
    `${canonicalizePlanningJsonV1(value, JSON_LIMITS)}\n`,
  );
}

async function writeTextImmutable(file, text) {
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporary, text, { flag: 'wx', mode: 0o600 });
    try {
      await link(temporary, file);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if ((await readFile(file, 'utf8')) !== text)
        fail('preflight_immutable_artifact_conflict');
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

function writeStatus(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fail(reason) {
  throw new TypeError(reason);
}
