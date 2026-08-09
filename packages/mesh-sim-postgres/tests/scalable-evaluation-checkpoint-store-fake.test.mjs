import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createScalableEvaluationTeamDescriptorV1,
  createScalableEvaluationRunnerCheckpointV1,
  scalableEvaluationDigestV1,
} from '../../mesh-sim/dist/scalable-evaluation.js';
import { shardedSimulationDigestV1 } from '../../mesh-sim/dist/sharded-simulation.js';
import {
  MAXIMUM_POSTGRES_SCALABLE_EVALUATION_CHECKPOINT_BYTES_V1,
  PostgresScalableEvaluationCheckpointStoreV1,
} from '../dist/index.js';

const digest = (label, value = {}) =>
  scalableEvaluationDigestV1(label, value);

function teamCheckpoint(
  runId,
  descriptor,
  revision,
  logicalTime,
  previousCheckpointDigest = null,
) {
  const teamId = descriptor.teamId;
  const body = {
    schemaVersion: 1,
    operationId: digest('runner-operation', {
      runId,
      phase: 'team-checkpoint',
      scope: { revision, teamId },
    }),
    teamId,
    definitionDigest: digest('definition'),
    descriptorDigest: descriptor.descriptorDigest,
    revision,
    logicalTime,
    previousCheckpointDigest,
    snapshotHandle: `snapshot:${teamId}:${revision}`,
    snapshotDigest: digest('team-snapshot', { teamId, revision }),
  };
  return {
    ...body,
    checkpointDigest: digest('team-durable-checkpoint', body),
  };
}

function checkpoint(revision, previous = null, overrides = {}) {
  const runId = 'run:postgres-checkpoint';
  const definitionDigest = digest('definition');
  const adapterDescriptorDigest = digest('adapter');
  const scheduleDigest = overrides.scheduleDigest ?? digest('schedule');
  const portsDigest = digest('ports');
  const configurationDigest = digest('configuration');
  const logicalTime = 1;
  const descriptors = ['team:left', 'team:right'].map((teamId) =>
    createScalableEvaluationTeamDescriptorV1({
      teamId,
      architecture: teamId.endsWith('left') ? 'distributed' : 'centralized',
      implementationId: `implementation:${teamId}`,
      implementationVersion: '1',
      implementationDigest: digest('implementation', { teamId }),
    }),
  );
  const environments = descriptors.map((descriptor) => {
    const teamId = descriptor.teamId;
    const team = teamCheckpoint(
      runId,
      descriptor,
      revision,
      logicalTime,
      revision === 1
        ? null
        : digest('prior-team-checkpoint', { teamId, revision }),
    );
    const session = {
      schemaVersion: 1,
      sessionId: `session:${teamId}`,
      environmentId: 'environment:test',
      createdAtLogicalTime: 0,
      sessionDigest: '',
    };
    session.sessionDigest = shardedSimulationDigestV1(
      'sharded-simulation-session-v1',
      {
        schemaVersion: session.schemaVersion,
        sessionId: session.sessionId,
        environmentId: session.environmentId,
        createdAtLogicalTime: session.createdAtLogicalTime,
      },
    );
    const episode = {
      schemaVersion: 1,
      sessionId: session.sessionId,
      episodeId: `episode:${teamId}`,
      seed: 1,
      startedAtLogicalTime: 0,
      episodeDigest: '',
    };
    episode.episodeDigest = shardedSimulationDigestV1(
      'sharded-simulation-episode-v1',
      {
        schemaVersion: episode.schemaVersion,
        sessionId: episode.sessionId,
        episodeId: episode.episodeId,
        seed: episode.seed,
        startedAtLogicalTime: episode.startedAtLogicalTime,
      },
    );
    const anchorBody = {
      schemaVersion: 1,
      anchorId: `anchor:${teamId}:${revision}`,
      revision,
      previousAnchorDigest:
        revision === 1 ? null : digest('prior-anchor', { teamId, revision }),
    };
    const anchor = {
      ...anchorBody,
      anchorDigest: shardedSimulationDigestV1(
        'sharded-simulation-durable-anchor-v1',
        anchorBody,
      ),
    };
    const environmentCheckpointBody = {
      schemaVersion: 1,
      checkpointId: `environment-checkpoint:${teamId}:${revision}`,
      sessionId: session.sessionId,
      episodeId: episode.episodeId,
      revision,
      logicalTime,
      snapshotHandle: `environment-snapshot:${teamId}:${revision}`,
      snapshotDigest: digest('environment-snapshot', { teamId, revision }),
      anchor,
    };
    return {
      teamId,
      session,
      episode,
      environmentCheckpoint: {
        ...environmentCheckpointBody,
        checkpointDigest: shardedSimulationDigestV1(
          'sharded-simulation-checkpoint-v1',
          environmentCheckpointBody,
        ),
      },
      teamCheckpoint: team,
    };
  });
  const zeroCounters = () => ({
    interactions: 0,
    messages: 0,
    messageBytes: 0,
    observations: 0,
    actions: 0,
    successfulOutcomes: 0,
    failedOutcomes: 0,
  });
  const runtimeStateBody = {
    schemaVersion: 1,
    definitionDigest,
    adapterDescriptorDigest,
    revision,
    predecessorStateDigest: digest('runtime-prior', { revision }),
    teams: descriptors.map((descriptor) => ({
      schemaVersion: 1,
      descriptor,
      sequence: 0,
      lastLogicalTime: 0,
      chainDigest: digest('accounting-chain', { teamId: descriptor.teamId }),
      counters: zeroCounters(),
      countersByDomain: {
        physical: zeroCounters(),
        social: zeroCounters(),
        cyber: zeroCounters(),
      },
    })),
    baselines: [],
    perturbationObservations: [],
    recoveries: [],
    environmentBindings: environments.map((entry) => ({
      teamId: entry.teamId,
      sessionId: entry.session.sessionId,
      episodeId: entry.episode.episodeId,
    })),
    recordTail: [],
    recordTailCursor: 0,
  };
  const runtimeState = {
    ...runtimeStateBody,
    stateDigest: digest('runtime-state', runtimeStateBody),
  };
  return createScalableEvaluationRunnerCheckpointV1({
    schemaVersion: 1,
    runId,
    revision,
    previousCheckpointDigest: previous,
    definitionDigest,
    adapterDescriptorDigest,
    scheduleDigest,
    portsDigest,
    configurationDigest,
    phase: revision === 2 ? 'complete' : 'observation',
    stepIndex: revision === 2 ? 1 : 0,
    teamIndex: 0,
    phaseCursor: 0,
    processedSteps: revision === 2 ? 1 : 0,
    logicalTime,
    traceDigest: digest('trace', { revision }),
    activeRecoveries: [],
    runtimeState,
    teamEnvironments: environments,
    saga: overrides.saga ?? {},
  });
}

class CheckpointPool {
  row = null;
  log = [];

  async connect() {
    return new CheckpointClient(this);
  }

  query(sql, values) {
    return this.run(sql, values);
  }

  async run(sql, values = []) {
    this.log.push(sql);
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql))
      return { rowCount: 0, rows: [] };
    if (/SELECT pg_advisory_xact_lock/.test(sql))
      return { rowCount: 1, rows: [{ pg_advisory_xact_lock: null }] };
    if (/FROM .*mesh_sim_scalable_evaluation_checkpoints/.test(sql))
      return this.row
        ? { rowCount: 1, rows: [this.row] }
        : { rowCount: 0, rows: [] };
    if (/INSERT INTO .*mesh_sim_scalable_evaluation_checkpoints/.test(sql)) {
      this.row = row(values);
      return { rowCount: 1, rows: [this.row] };
    }
    if (/UPDATE .*mesh_sim_scalable_evaluation_checkpoints/.test(sql)) {
      this.row = row(values);
      return { rowCount: 1, rows: [this.row] };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  }
}

class CheckpointClient {
  constructor(pool) {
    this.pool = pool;
  }
  query(sql, values) {
    return this.pool.run(sql, values);
  }
  release() {
    this.pool.log.push('RELEASE');
  }
}

function row(values) {
  return {
    run_id: values[1],
    revision: values[2],
    checkpoint_digest: values[3],
    previous_checkpoint_digest: values[4],
    definition_digest: values[5],
    adapter_descriptor_digest: values[6],
    schedule_digest: values[7],
    ports_digest: values[8],
    configuration_digest: values[9],
    checkpoint: JSON.parse(values[10]),
    checkpoint_sha256: values[11],
    checkpoint_bytes: values[12],
  };
}

const store = (pool, options = {}) =>
  new PostgresScalableEvaluationCheckpointStoreV1(pool, {
    namespace: 'test-checkpoints',
    ...options,
  });

test('checkpoint CAS survives store reconstruction and distinguishes duplicate from conflict', async () => {
  const pool = new CheckpointPool();
  const firstStore = store(pool);
  const first = checkpoint(1);
  assert.equal(
    (
      await firstStore.compareAndSwapV1({
        runId: first.runId,
        expectedRevision: null,
        checkpoint: first,
      })
    ).status,
    'stored',
  );
  assert.equal(
    (
      await firstStore.compareAndSwapV1({
        runId: first.runId,
        expectedRevision: null,
        checkpoint: structuredClone(first),
      })
    ).status,
    'duplicate',
  );
  const reconstructed = store(pool);
  assert.equal(
    reconstructed.restartDurabilityV1.declarationDigest,
    firstStore.restartDurabilityV1.declarationDigest,
  );
  assert.deepEqual(await reconstructed.loadV1({ runId: first.runId }), first);
  const second = checkpoint(2, first.checkpointDigest);
  assert.equal(
    (
      await reconstructed.compareAndSwapV1({
        runId: second.runId,
        expectedRevision: 1,
        checkpoint: second,
      })
    ).status,
    'stored',
  );
  const stale = checkpoint(2, first.checkpointDigest, {
    scheduleDigest: digest('substituted-schedule'),
  });
  const conflict = await reconstructed.compareAndSwapV1({
    runId: stale.runId,
    expectedRevision: 1,
    checkpoint: stale,
  });
  assert.equal(conflict.status, 'conflict');
  assert.equal(conflict.currentRevision, 2);
  assert.ok(pool.log.some((sql) => /pg_advisory_xact_lock/.test(sql)));
  assert.ok(pool.log.some((sql) => /FOR UPDATE/.test(sql)));
});

test('stored checkpoint tampering and column substitution fail closed', async () => {
  const pool = new CheckpointPool();
  const target = store(pool);
  const first = checkpoint(1);
  await target.compareAndSwapV1({
    runId: first.runId,
    expectedRevision: null,
    checkpoint: first,
  });
  const originalHash = pool.row.checkpoint_sha256;
  pool.row.checkpoint_sha256 = '0'.repeat(64);
  await assert.rejects(
    target.loadV1({ runId: first.runId }),
    /content hash mismatch/,
  );
  pool.row.checkpoint_sha256 = originalHash;
  pool.row.configuration_digest = digest('substituted-configuration');
  await assert.rejects(
    target.loadV1({ runId: first.runId }),
    /column binding mismatch/,
  );
});

test('checkpoint limits reject invalid declarations and oversized state before SQL', async () => {
  const pool = new CheckpointPool();
  assert.throws(
    () =>
      store(pool, {
        maximumCheckpointBytes:
          MAXIMUM_POSTGRES_SCALABLE_EVALUATION_CHECKPOINT_BYTES_V1 + 1,
      }),
    /maximumCheckpointBytes is invalid/,
  );
  const bounded = store(pool, { maximumCheckpointBytes: 1_024 });
  const large = checkpoint(1, null, { saga: { data: 'x'.repeat(2_048) } });
  await assert.rejects(
    bounded.compareAndSwapV1({
      runId: large.runId,
      expectedRevision: null,
      checkpoint: large,
    }),
    /checkpoint exceeds configured/,
  );
  assert.equal(pool.log.length, 0);
});
