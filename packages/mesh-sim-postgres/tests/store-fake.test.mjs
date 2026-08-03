import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  COLLECTIVE_EVALUATION_DIAGNOSTIC_CAMPAIGN_PROFILE_V1,
  COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
  claimCollectiveEvaluationCellV1,
  collectiveEvaluationCampaignProfileCellsV1,
  createCollectiveEvaluationCampaignExecutionV1,
  createCollectiveEvaluationCampaignRegistrationV1,
} from '../../collective-planning/dist/evaluation.js';
import { canonicalizePlanningJsonV1 } from '../../collective-planning/dist/index.js';
import { digestCollectiveStatisticalCampaignArtifactV1 } from '../../mesh-sim/dist/index.js';
import { PostgresCollectiveStatisticalCampaignStoreV1 } from '../dist/index.js';

const digest = (label) =>
  `sha256:${createHash('sha256').update(label).digest('hex')}`;
const artifactDigest = (kind, value) =>
  digestCollectiveStatisticalCampaignArtifactV1(kind, value);
const jsonHash = (value) =>
  createHash('sha256').update(canonicalizePlanningJsonV1(value)).digest('hex');
function state(
  profile = COLLECTIVE_EVALUATION_DIAGNOSTIC_CAMPAIGN_PROFILE_V1,
  campaignId = 'campaign:store-fake',
  executionId = 'execution:store-fake',
) {
  const c = Object.fromEntries(
    [
      'sourceDigest',
      'packageDigest',
      'fixtureManifestDigest',
      'policyDigest',
      'environmentDigest',
      'observationPolicyDigest',
      'monitorDigest',
      'hiddenCanaryDigest',
    ].map((key) => [key, artifactDigest('registration', { key })]),
  );
  const maximumInteractions =
    profile === COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1
      ? 5_000
      : 1_600;
  const registration = createCollectiveEvaluationCampaignRegistrationV1({
    schemaVersion: 1,
    campaignId,
    profile,
    ...c,
    runners: ['adaptive_collective', 'centralized_planner'],
    maximumInteractions,
    cells: collectiveEvaluationCampaignProfileCellsV1(profile, campaignId).map(
      (cell) => ({
        schemaVersion: 1,
        ...cell,
        maximumInteractions:
          profile === COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1
            ? new Map([
                [50, 1_000],
                [100, 1_600],
                [250, 3_000],
                [500, 5_000],
              ]).get(cell.peerCount)
            : cell.peerCount === 50
              ? 1_000
              : 1_600,
        scaleConfigurationDigest: artifactDigest('registration', {
          kind: 'scale',
          cellId: cell.cellId,
        }),
        adaptiveDefinitionDigest: artifactDigest('registration', {
          kind: 'adaptive',
          cellId: cell.cellId,
        }),
        centralizedDefinitionDigest: artifactDigest('registration', {
          kind: 'centralized',
          cellId: cell.cellId,
        }),
        faultPlanDigest: artifactDigest('registration', {
          kind: 'fault',
          cellId: cell.cellId,
        }),
        faultMatrixBindingDigest: artifactDigest('registration', {
          kind: 'matrix',
          cellId: cell.cellId,
        }),
      }),
    ),
  });
  return createCollectiveEvaluationCampaignExecutionV1({
    schemaVersion: 1,
    executionId,
    registration,
  });
}
class StatePool {
  row = null;
  log = [];
  failUpdate = false;
  async connect() {
    return new StateClient(this);
  }
  async query(sql, values) {
    return this.run(sql, values);
  }
  async run(sql, values = []) {
    this.log.push(sql);
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rowCount: 0, rows: [] };
    if (/SELECT pg_advisory_xact_lock/.test(sql))
      return { rowCount: 1, rows: [{ pg_advisory_xact_lock: null }] };
    if (/SELECT state, state_sha256/.test(sql))
      return this.row
        ? { rowCount: 1, rows: [this.row] }
        : { rowCount: 0, rows: [] };
    if (/INSERT INTO .*mesh_sim_execution_states/.test(sql)) {
      if (this.row) return { rowCount: 0, rows: [] };
      this.row = { state: JSON.parse(values[4]), state_sha256: values[5] };
      return { rowCount: 1, rows: [this.row] };
    }
    if (/UPDATE .*mesh_sim_execution_states/.test(sql)) {
      if (this.failUpdate) throw new Error('forced update failure');
      this.row = { state: JSON.parse(values[4]), state_sha256: values[5] };
      return { rowCount: 1, rows: [this.row] };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  }
}
class StateClient {
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
const store = (pool) =>
  new PostgresCollectiveStatisticalCampaignStoreV1(pool, {
    namespace: 'test-namespace',
  });

test('state CAS commits once, duplicates exactly, and conflicts on a stale digest', async () => {
  const pool = new StatePool(),
    target = store(pool),
    first = state();
  assert.equal(
    await target.compareAndSwapExecutionStateV1({
      executionId: first.executionId,
      expectedExecutionDigest: null,
      state: first,
    }),
    'committed',
  );
  assert.equal(
    await target.compareAndSwapExecutionStateV1({
      executionId: first.executionId,
      expectedExecutionDigest: first.executionDigest,
      state: first,
    }),
    'duplicate',
  );
  assert.equal(
    await target.compareAndSwapExecutionStateV1({
      executionId: first.executionId,
      expectedExecutionDigest: digest('stale'),
      state: first,
    }),
    'conflict',
  );
  assert.deepEqual(
    pool.log.filter((line) => /^(BEGIN|COMMIT|ROLLBACK)$/.test(line)),
    ['BEGIN', 'COMMIT', 'BEGIN', 'COMMIT', 'BEGIN', 'COMMIT'],
  );
});
test('state CAS accepts the complete normative matrix above the generic planning JSON limit', async () => {
  const pool = new StatePool();
  const target = store(pool);
  const large = state(
    COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
    'campaign:store-fake-normative',
    'execution:store-fake-normative',
  );
  assert.ok(Buffer.byteLength(JSON.stringify(large), 'utf8') > 262_144);
  assert.equal(
    await target.compareAndSwapExecutionStateV1({
      executionId: large.executionId,
      expectedExecutionDigest: null,
      state: large,
    }),
    'committed',
  );
  assert.equal(pool.row.state.executionDigest, large.executionDigest);
});
test('corrupt stored state fails closed before it can be accepted', async () => {
  const pool = new StatePool(),
    initial = state();
  pool.row = { state: initial, state_sha256: '0'.repeat(64) };
  await assert.rejects(
    store(pool).readExecutionStateV1({
      executionId: initial.executionId,
      registrationDigest: initial.registrationDigest,
    }),
    /hash mismatch/,
  );
});
test('database failure rolls the CAS transaction back', async () => {
  const pool = new StatePool(),
    initial = state();
  pool.row = { state: initial, state_sha256: jsonHash(initial) };
  pool.failUpdate = true;
  const next = claimCollectiveEvaluationCellV1(initial, {
    executionId: initial.executionId,
    expectedRevision: initial.revision,
    cellId: initial.cells[0].cellId,
    nowMs: 1000,
    lease: {
      workerId: 'worker:fake',
      leaseToken: 'lease:fake',
      expiresAtMs: 2000,
    },
  });
  await assert.rejects(
    store(pool).compareAndSwapExecutionStateV1({
      executionId: initial.executionId,
      expectedExecutionDigest: initial.executionDigest,
      state: next,
    }),
    /forced update failure/,
  );
  assert.ok(pool.log.includes('ROLLBACK'));
  assert.equal(pool.log.at(-1), 'RELEASE');
});
test('fenced commit is an explicit boundary rather than an implicit duplicate rule', () => {
  const methods = Object.getOwnPropertyNames(
    PostgresCollectiveStatisticalCampaignStoreV1.prototype,
  );
  assert.equal(methods.includes('commitExecutionWithFenceV1'), true);
  for (const absent of ['claim', 'renew', 'validateFence'])
    assert.equal(methods.includes(absent), false);
});
