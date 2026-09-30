import { Pool } from 'pg';
import { PostgresActionGrantRepositoryV1 } from '../../packages/collective-control-postgres/dist/index.js';
import { PostgresActionApprovalRepositoryV1 } from '../../packages/collective-control-postgres/dist/action-approvals.js';
import { PostgresActionAdmissionStoreV1 } from '../../packages/collective-control-postgres/dist/action-admission.js';
import { ActionAdmissionServiceV1 } from '../../packages/inference-control/dist/action-admission.js';
import { scope } from './action-approval-fixtures.mjs';
import { gateway, invoke } from './action-control-fixtures.mjs';
const schema = process.argv[2];
if (!/^control_test_[a-f0-9]+$/.test(schema)) throw Error('invalid_test_schema');
const pool = new Pool({ database: 'postgres', host: '127.0.0.1', connectionString: process.env.DATABASE_URL });
const grants = new PostgresActionGrantRepositoryV1(pool, { schema, tenantId: scope.tenantId, gatewayId: 'gateway:persistent' });
const approvals = new PostgresActionApprovalRepositoryV1(pool, { schema, tenantId: scope.tenantId });
const store = new PostgresActionAdmissionStoreV1(pool, { schema, tenantId: scope.tenantId });
const record = await approvals.load(scope.tenantId, 'approval:1');
const profile = { grants, approvals, store, record, admission: new ActionAdmissionServiceV1(store) };
await invoke(gateway(profile, async () => {
  const state = await store.transaction(scope.tenantId, state => ({ state, result: state }));
  const receipt = state.effects[0];
  await pool.query(`INSERT INTO "${schema}".external_receipts VALUES ($1,$2)`, [receipt.request.effectId, receipt.requestDigest]);
  // Actual process termination before the gateway can settle its reserved grant.
  process.exit(70);
}));
throw Error('worker_should_have_terminated');
