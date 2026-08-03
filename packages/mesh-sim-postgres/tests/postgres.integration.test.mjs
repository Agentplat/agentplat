import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import {
  COLLECTIVE_EVALUATION_DIAGNOSTIC_CAMPAIGN_PROFILE_V1,
  claimCollectiveEvaluationCellV1,
  collectiveEvaluationCampaignProfileCellsV1,
  createCollectiveEvaluationCampaignExecutionV1,
  createCollectiveEvaluationCampaignRegistrationV1,
  startCollectiveEvaluationRunV1,
} from '../../collective-planning/dist/evaluation.js';
import {
  createCollectiveStatisticalCampaignExecutionArtifactsV1,
  digestCollectiveStatisticalCampaignArtifactV1,
} from '../../mesh-sim/dist/index.js';
import { createPostgresPool } from '../../postgres/dist/index.js';
import {
  PostgresCollectiveStatisticalCampaignStoreV1,
  runMeshSimPostgresMigrationsV1,
} from '../dist/index.js';

const enabled = process.env.AGENTPLAT_POSTGRES_TEST === '1';
const digest = (kind, value) =>
  digestCollectiveStatisticalCampaignArtifactV1(kind, value);

function registrationFixture() {
  const campaignId = `campaign:postgres-fence:${randomUUID()}`;
  const commitment = (kind) => digest('registration', { kind, campaignId });
  const profile = COLLECTIVE_EVALUATION_DIAGNOSTIC_CAMPAIGN_PROFILE_V1;
  return createCollectiveEvaluationCampaignRegistrationV1({
    schemaVersion: 1,
    campaignId,
    profile,
    sourceDigest: commitment('source'),
    packageDigest: commitment('package'),
    fixtureManifestDigest: commitment('fixture'),
    policyDigest: commitment('policy'),
    environmentDigest: commitment('environment'),
    observationPolicyDigest: commitment('observation'),
    monitorDigest: commitment('monitor'),
    hiddenCanaryDigest: commitment('canary'),
    runners: ['adaptive_collective', 'centralized_planner'],
    maximumInteractions: 1_600,
    cells: collectiveEvaluationCampaignProfileCellsV1(profile, campaignId).map(
      (cell) => ({
        schemaVersion: 1,
        ...cell,
        maximumInteractions: cell.peerCount === 50 ? 1_000 : 1_600,
        scaleConfigurationDigest: commitment(`scale:${cell.cellId}`),
        adaptiveDefinitionDigest: commitment(`adaptive:${cell.cellId}`),
        centralizedDefinitionDigest: commitment(`centralized:${cell.cellId}`),
        faultPlanDigest: commitment(`fault:${cell.cellId}`),
        faultMatrixBindingDigest: commitment(`matrix:${cell.cellId}`),
      }),
    ),
  });
}

function runningState(registration, executionId, nowMs, expiresAtMs) {
  const initial = createCollectiveEvaluationCampaignExecutionV1({
    schemaVersion: 1,
    executionId,
    registration,
  });
  const cell = registration.cells[0];
  const claimed = claimCollectiveEvaluationCellV1(initial, {
    executionId,
    expectedRevision: initial.revision,
    cellId: cell.cellId,
    nowMs,
    lease: {
      workerId: 'worker:postgres-current',
      leaseToken: 'lease:postgres-current',
      expiresAtMs,
    },
  });
  const fence = claimed.cells[0].lease;
  assert.ok(fence);
  const running = startCollectiveEvaluationRunV1(claimed, {
    executionId,
    expectedRevision: claimed.revision,
    cellId: cell.cellId,
    runner: 'adaptive_collective',
    attempt: 'first',
    nowMs,
    fence,
  });
  const slot = running.cells[0].runs.find(
    (value) =>
      value.runner === 'adaptive_collective' && value.attempt === 'first',
  );
  assert.ok(slot);
  const execution = createCollectiveStatisticalCampaignExecutionArtifactsV1({
    schemaVersion: 1,
    executionId,
    runKey: slot.runKey,
    registrationDigest: registration.registrationDigest,
    cell,
    runner: 'adaptive_collective',
    attempt: 'first',
    output: {
      schemaVersion: 1,
      status: 'passed',
      reasonCode: null,
      outcome: { status: 'passed' },
      traceRecords: [{ eventId: 'event:postgres' }],
      ledgerRecords: [{ interactions: 1 }],
      observations: [],
    },
  });
  return { initial, cell, running, fence, runKey: slot.runKey, execution };
}

async function databaseNow(pool) {
  const result = await pool.query(
    'SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now_ms',
  );
  return Number(result.rows[0].now_ms);
}

async function cleanup(pool, namespace) {
  for (const table of [
    'mesh_sim_slot_commits',
    'mesh_sim_execution_states',
    'mesh_sim_artifact_bindings',
    'mesh_sim_artifact_blobs',
  ])
    await pool.query(`DELETE FROM public.${table} WHERE namespace=$1`, [
      namespace,
    ]);
}

async function* oneChunk(value) {
  yield new TextEncoder().encode(JSON.stringify(value));
}

test(
  'PostgreSQL commits only current fenced provenance and rechecks time after a row lock',
  { skip: !enabled, timeout: 30_000 },
  async () => {
    const pool = createPostgresPool({ max: 4 });
    const namespaces = [];
    try {
      await runMeshSimPostgresMigrationsV1(pool);
      const registration = registrationFixture();
      const nowMs = await databaseNow(pool);
      const executionId = `execution:postgres-fence:${randomUUID()}`;
      const namespace = `test:${randomUUID()}`;
      namespaces.push(namespace);
      const fixture = runningState(
        registration,
        executionId,
        nowMs,
        nowMs + 60_000,
      );
      const store = new PostgresCollectiveStatisticalCampaignStoreV1(pool, {
        namespace,
      });
      assert.equal(
        await store.compareAndSwapExecutionStateV1({
          executionId,
          expectedExecutionDigest: null,
          state: fixture.running,
        }),
        'committed',
      );
      const operationExpiresAtMs = nowMs + 120_000;
      const commit = (fence, operationExpiry = operationExpiresAtMs) =>
        store.commitExecutionWithFenceV1({
          executionId,
          registrationDigest: registration.registrationDigest,
          cellId: fixture.cell.cellId,
          runKey: fixture.runKey,
          fence,
          operationExpiresAtMs: operationExpiry,
          execution: fixture.execution,
        });

      for (const stale of [
        { ...fixture.fence, workerId: 'worker:wrong' },
        { ...fixture.fence, leaseToken: 'lease:wrong' },
        { ...fixture.fence, generation: fixture.fence.generation + 1 },
      ])
        assert.equal(await commit(stale), 'stale_fence');
      assert.equal(await commit(fixture.fence, nowMs - 1), 'stale_fence');
      assert.equal(await commit(fixture.fence), 'committed');
      assert.equal(await commit(fixture.fence), 'duplicate');
      assert.deepEqual(
        await store.readExecutionWithFenceV1({
          executionId,
          registrationDigest: registration.registrationDigest,
          cellId: fixture.cell.cellId,
          runKey: fixture.runKey,
          fence: fixture.fence,
          operationExpiresAtMs,
        }),
        fixture.execution,
      );
      await assert.rejects(
        store.readExecutionWithFenceV1({
          executionId,
          registrationDigest: registration.registrationDigest,
          cellId: fixture.cell.cellId,
          runKey: fixture.runKey,
          fence: { ...fixture.fence, workerId: 'worker:wrong' },
          operationExpiresAtMs,
        }),
        /provenance mismatch/,
      );
      await assert.rejects(
        store.readExecutionWithFenceV1({
          executionId,
          registrationDigest: registration.registrationDigest,
          cellId: fixture.cell.cellId,
          runKey: fixture.runKey,
          fence: fixture.fence,
          operationExpiresAtMs: operationExpiresAtMs + 1,
        }),
        /provenance mismatch/,
      );
      await assert.rejects(
        store.commitExecutionV1({
          runKey: fixture.runKey,
          execution: fixture.execution,
        }),
        /unfenced PostgreSQL execution commits are unsupported/,
      );

      const deadlineNamespace = `test:${randomUUID()}`;
      const deadlineExecutionId = `execution:postgres-deadline:${randomUUID()}`;
      namespaces.push(deadlineNamespace);
      const deadlineStore = new PostgresCollectiveStatisticalCampaignStoreV1(
        pool,
        { namespace: deadlineNamespace },
      );
      const deadlineState = createCollectiveEvaluationCampaignExecutionV1({
        schemaVersion: 1,
        executionId: deadlineExecutionId,
        registration,
      });
      assert.equal(
        await deadlineStore.compareAndSwapExecutionStateWithDeadlineV1({
          executionId: deadlineExecutionId,
          expectedExecutionDigest: null,
          operationExpiresAtMs: nowMs - 1,
          state: deadlineState,
        }),
        'expired',
      );
      assert.equal(
        await deadlineStore.readExecutionStateV1({
          executionId: deadlineExecutionId,
          registrationDigest: registration.registrationDigest,
        }),
        null,
      );
      const deadlineWriter = deadlineStore.createArtifactWriterV1();
      const artifact = {
        artifactId: 'metric-projection:deadline-test',
        kind: 'metric-projection',
        bytes: oneChunk({ schemaVersion: 1, status: 'bounded' }),
        maximumBytes: 1_024,
      };
      await assert.rejects(
        deadlineWriter.putArtifactBeforeDeadlineV1({
          ...artifact,
          operationExpiresAtMs: nowMs - 1,
        }),
        /deadline expired/,
      );
      const futureDeadline = nowMs + 120_000;
      await deadlineWriter.putArtifactBeforeDeadlineV1({
        ...artifact,
        bytes: oneChunk({ schemaVersion: 1, status: 'bounded' }),
        operationExpiresAtMs: futureDeadline,
      });
      await assert.rejects(
        deadlineWriter.putArtifactBeforeDeadlineV1({
          ...artifact,
          bytes: oneChunk({ schemaVersion: 1, status: 'bounded' }),
          operationExpiresAtMs: futureDeadline + 1,
        }),
        /binding conflict/,
      );

      const blockedExecutionId = `execution:postgres-clock:${randomUUID()}`;
      const blockedNamespace = `test:${randomUUID()}`;
      namespaces.push(blockedNamespace);
      const blocked = runningState(
        registration,
        blockedExecutionId,
        nowMs,
        nowMs + 250,
      );
      const blockedStore = new PostgresCollectiveStatisticalCampaignStoreV1(
        pool,
        { namespace: blockedNamespace },
      );
      assert.equal(
        await blockedStore.compareAndSwapExecutionStateV1({
          executionId: blockedExecutionId,
          expectedExecutionDigest: null,
          state: blocked.running,
        }),
        'committed',
      );
      const blocker = await pool.connect();
      await blocker.query('BEGIN');
      await blocker.query(
        'SELECT 1 FROM public.mesh_sim_execution_states WHERE namespace=$1 AND execution_id=$2 FOR UPDATE',
        [blockedNamespace, blockedExecutionId],
      );
      const waiting = blockedStore.commitExecutionWithFenceV1({
        executionId: blockedExecutionId,
        registrationDigest: registration.registrationDigest,
        cellId: blocked.cell.cellId,
        runKey: blocked.runKey,
        fence: blocked.fence,
        operationExpiresAtMs: null,
        execution: blocked.execution,
      });
      await new Promise((resolve) => setTimeout(resolve, 350));
      await blocker.query('COMMIT');
      blocker.release();
      assert.equal(await waiting, 'stale_fence');
    } finally {
      for (const namespace of namespaces) await cleanup(pool, namespace);
      await pool.end();
    }
  },
);
