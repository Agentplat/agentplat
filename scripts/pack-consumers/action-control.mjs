import { createConditionalActionDispatcherV1 } from '@agentplat/inference-control/action-effects';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { recoverReservedActionGrantV1, createActionGrantV1, scopeDigest, actionInputDigest, actionDigest, canonicalControlJson } from '@agentplat/inference-control/tools';
import { createActionApprovalTargetV1, ActionApprovalServiceV1, InMemoryActionApprovalRepositoryV1,
  createActionApprovalAssessmentResolverV1 } from '@agentplat/inference-control/action-approvals';
import { InMemoryActionAdmissionStoreV1, ActionAdmissionServiceV1 } from '@agentplat/inference-control/action-admission';
import { PostgresActionApprovalRepositoryV1, runActionApprovalMigrationsV1 } from '@agentplat/collective-control-postgres/action-approvals';
import { PostgresActionAdmissionStoreV1, runActionAdmissionMigrationsV1 } from '@agentplat/collective-control-postgres/action-admission';
const scope = { schemaVersion: 1, kind: 'standalone', tenantId: 'tenant:packed', runId: 'run:packed', agentId: 'agent:packed',
  organizationId: null, workspaceId: null, policyId: 'policy:packed', policyVersion: 1 };
const binding = { schemaVersion: 1, actionBindingId: 'binding:packed', actionBindingVersion: 1, namespace: 'packed',
  toolId: 'tool:packed', operation: 'write', dispatcherId: 'dispatcher:packed', dispatcherVersion: 1,
  contextResolverId: 'context:packed', contextResolverVersion: 1, fencingMode: 'local_only', handlerDigest: `sha256:${'1'.repeat(64)}` };
const target = createActionApprovalTargetV1({ scope, binding, input: {}, preconditions: { version: 1 }, authority: { epoch: 1 }, policy: { version: 1 } });
const approvals = new InMemoryActionApprovalRepositoryV1();
const access = { resolve: async c => c, canRequest: async () => true, canDecide: async () => true };
const service = new ActionApprovalServiceV1(approvals, access);
const requested = await service.request({ tenantId: scope.tenantId, actorId: scope.agentId, kind: 'agent' }, {
  approvalId: 'approval:packed', target, createdAtMs: 1, expiresAtMs: 1000 });
await service.decide({ tenantId: scope.tenantId, actorId: 'person:packed', kind: 'person' }, {
  tenantId: scope.tenantId, approvalId: requested.approvalId, targetDigest: requested.targetDigest, decision: 'approved', nowMs: 2 });
const grant = createActionGrantV1({ grantId: 'grant:packed', scope, binding, input: {},
  assessmentRequestId: 'assessment-request:packed', assessmentId: 'assessment:packed',
  assessmentTargetDigest: requested.targetDigest, idempotencyKey: 'effect:packed', issuedAtLogicalMs: 3, expiresAtLogicalMs: 100 });
const manual = { schemaVersion: 1, grantId: grant.grantId, stateGeneration: 1, scope, scopeDigest: scopeDigest(scope),
  namespace: binding.namespace, toolId: binding.toolId, operation: binding.operation,
  actionBindingId: binding.actionBindingId, actionBindingVersion: binding.actionBindingVersion, handlerDigest: binding.handlerDigest,
  inputDigest: actionInputDigest({}), actionDigest: '', assessmentRequestId: grant.assessmentRequestId,
  assessmentId: grant.assessmentId, assessmentTargetDigest: grant.assessmentTargetDigest, idempotencyKey: grant.idempotencyKey,
  issuedAtLogicalMs: 3, expiresAtLogicalMs: 100, singleUse: true, status: 'issued', reservation: null };
manual.actionDigest = actionDigest(manual, binding);
assert.equal(canonicalControlJson(grant), canonicalControlJson(manual));
const guard = createActionApprovalAssessmentResolverV1({ repository: approvals,
  base: { assessorId: 'packed', assessorVersion: 1, consumeCurrent: async () => true },
  approvalId: async () => requested.approvalId, currentTarget: async () => target });
assert.equal(await guard.consumeCurrent(grant, 3), true);
const admission = new ActionAdmissionServiceV1(new InMemoryActionAdmissionStoreV1(approvals));
const fences = ['agent','connector','organization'].map(kind => ({ kind, id: kind, active: true, epoch: 1 }));
for (const fence of fences) await admission.configureFence(scope.tenantId, fence);
await admission.configureBudget(scope.tenantId, { accountId: 'shared:period:0', unit: 'operation', maximumUnits: 1,
  periodStartMs: 0, periodEndMs: 100, revision: 1 });
const request = { tenantId: scope.tenantId, effectId: 'effect:packed', gatewayId: 'gateway:packed', scopeDigest: grant.scopeDigest,
  grantId: grant.grantId, dispatchAttemptId: 'attempt:packed', idempotencyKey: grant.idempotencyKey,
  actionDigest: grant.actionDigest, inputDigest: grant.inputDigest, fences,
  charges: [{ accountId: 'shared:period:0', accountRevision: 1, unit: 'operation', units: 1 }], nowMs: 3,
  approval: { approvalId: requested.approvalId, targetDigest: requested.targetDigest } };
assert.equal((await admission.reserve(request)).status, 'admitted');
assert.equal((await admission.reserve(request)).status, 'replayed');
await admission.configureFence(scope.tenantId, { ...fences[0], epoch: 2, active: false });
await assert.rejects(admission.reserve({ ...request, effectId: 'another', grantId: 'another', dispatchAttemptId: 'another', idempotencyKey: 'another', approval: null }));
// Construction/import must not perform database I/O.
const pool = { query() { throw Error('unexpected_database_io'); } };
void new PostgresActionApprovalRepositoryV1(pool, { tenantId: scope.tenantId });
void new PostgresActionAdmissionStoreV1(pool, { tenantId: scope.tenantId });
assert.equal(typeof runActionApprovalMigrationsV1, 'function');
assert.equal(typeof runActionAdmissionMigrationsV1, 'function');
const entry = import.meta.resolve('@agentplat/collective-control-postgres/action-admission');
for (const name of ['001_action_admission', '001_action_approvals'])
  for (const direction of ['up','down'])
    assert.ok((await readFile(new URL(`../migrations/${name}.${direction}.sql`, entry), 'utf8')).length > 0);
console.log('Verified standalone action-control public tarballs, legacy grant bytes, approvals, admission and migration files.');

assert.equal(typeof createConditionalActionDispatcherV1, 'function');

assert.equal(typeof recoverReservedActionGrantV1, 'function');
