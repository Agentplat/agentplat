import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { runMigrations, PostgresActionGrantRepositoryV1 } from '../../packages/collective-control-postgres/dist/index.js';
import { runActionApprovalMigrationsV1, PostgresActionApprovalRepositoryV1 }
  from '../../packages/collective-control-postgres/dist/action-approvals.js';
import { runActionAdmissionMigrationsV1, PostgresActionAdmissionStoreV1 }
  from '../../packages/collective-control-postgres/dist/action-admission.js';
import { ActionAdmissionServiceV1, createActionAdmissionDispatcherV1 }
  from '../../packages/inference-control/dist/action-admission.js';
import { ActionGateway, actionInputDigest, scopeDigest, issueActionGrantV1, reconcileActionGrantV1 }
  from '../../packages/inference-control/dist/tools.js';
import { approved, grant as prepareGrant, resolver, scope, binding, approver }
  from './action-approval-fixtures.mjs';
import { request, fences, accounts } from './action-admission-scenarios.mjs';

export async function setup(schema, pool) {
  await runMigrations(pool, { schema, createSchema: true });
  const grants = new PostgresActionGrantRepositoryV1(pool, { schema, tenantId: scope.tenantId, gatewayId: 'gateway:persistent' });
  // Existing issued grant must survive installing the optional migrations.
  const legacy = prepareGrant({ targetDigest: `sha256:${'2'.repeat(64)}` }, 'grant:legacy');
  await issueActionGrantV1(grants, legacy);
  const before = await grants.loadGrant(legacy.grantId);
  await runActionApprovalMigrationsV1(pool, { schema });
  await runActionAdmissionMigrationsV1(pool, { schema });
  assert.deepEqual(await grants.loadGrant(legacy.grantId), before);
  const approvals = new PostgresActionApprovalRepositoryV1(pool, { schema, tenantId: scope.tenantId });
  const { record, service: approvalService } = await approved(approvals);
  const store = new PostgresActionAdmissionStoreV1(pool, { schema, tenantId: scope.tenantId });
  const admission = new ActionAdmissionServiceV1(store);
  for (const fence of fences) await admission.configureFence(scope.tenantId, fence);
  for (const account of accounts) await admission.configureBudget(scope.tenantId, account);
  const grant = prepareGrant(record);
  await issueActionGrantV1(grants, grant);
  return { grants, approvals, approvalService, admission, store, record, grant };
}
export function gateway(profile, downstream, onQuote = async () => {}) {
  const dispatcher = createActionAdmissionDispatcherV1({ service: profile.admission,
    downstream: { dispatcherId: binding.dispatcherId, dispatcherVersion: 1, fencingMode: 'local_only', dispatch: downstream },
    quote: async ({ permit, input }) => {
      await onQuote();
      return { ...request('effect:persistent'), tenantId: scope.tenantId,
        gatewayId: permit.gatewayId, scopeDigest: permit.scopeDigest, grantId: permit.grantId,
        dispatchAttemptId: permit.dispatchAttemptId, idempotencyKey: permit.idempotencyKey,
        actionDigest: permit.actionDigest, inputDigest: actionInputDigest(input), nowMs: 3,
        approval: { approvalId: profile.record.approvalId, targetDigest: profile.record.targetDigest } };
    },
  });
  return new ActionGateway(profile.grants, binding, dispatcher,
    { contextResolverId: binding.contextResolverId, contextResolverVersion: 1, async resolve() {
      return { tenant: { tenantId: scope.tenantId }, toolId: binding.toolId, runId: scope.runId }; } },
    { resolverId: 'authority:persistent', resolverVersion: 1, async resolve(s, actionDigest) {
      return { schemaVersion: 1, resolverId: 'authority:persistent', resolverVersion: 1, status: 'current',
        scope: s, scopeDigest: scopeDigest(s), actionDigest, authorityGeneration: null, fencingToken: null }; } },
    resolver(profile.approvals));
}
export async function invoke(gateway) { return gateway.invoke({ schemaVersion: 1, grantId: 'grant:1', input: { value: 2 }, logicalTimeMs: 3 }); }
