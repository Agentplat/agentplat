import { createActionApprovalTargetV1, ActionApprovalServiceV1,
  InMemoryActionApprovalRepositoryV1, createActionApprovalAssessmentResolverV1,
} from '../../packages/inference-control/dist/action-approvals.js';
import { createActionGrantV1 } from '../../packages/inference-control/dist/tools.js';

export const scope = { schemaVersion: 1, kind: 'standalone', tenantId: 'tenant:1',
  runId: 'run:1', agentId: 'agent:1', organizationId: null, workspaceId: null,
  policyId: 'policy:1', policyVersion: 1 };
export const binding = { schemaVersion: 1, actionBindingId: 'binding:1', actionBindingVersion: 1,
  namespace: 'test', toolId: 'tool:1', operation: 'write', dispatcherId: 'dispatcher:1',
  dispatcherVersion: 1, contextResolverId: 'context:1', contextResolverVersion: 1,
  fencingMode: 'local_only', handlerDigest: `sha256:${'1'.repeat(64)}` };
export function target(overrides = {}) {
  return createActionApprovalTargetV1({ scope, binding, input: { value: 2 },
    preconditions: { version: 1 }, authority: { agent: 1, connector: 1, organization: 1 },
    policy: { version: 1 }, ...overrides });
}
export const requester = { tenantId: 'tenant:1', actorId: 'agent:1', kind: 'agent' };
export const approver = { tenantId: 'tenant:1', actorId: 'person:1', kind: 'person' };
export const access = { async resolve(c) { return c; }, async canRequest() { return true; },
  async canDecide() { return true; } };
export async function approved(repository = new InMemoryActionApprovalRepositoryV1()) {
  const service = new ActionApprovalServiceV1(repository, access);
  const request = await service.request(requester, { approvalId: 'approval:1', target: target(),
    createdAtMs: 1, expiresAtMs: 1000 });
  const record = await service.decide(approver, { tenantId: 'tenant:1', approvalId: request.approvalId,
    targetDigest: request.targetDigest, decision: 'approved', nowMs: 2 });
  return { repository, service, record };
}
export function grant(record, id = 'grant:1') {
  return createActionGrantV1({ grantId: id, scope, binding, input: { value: 2 },
    assessmentRequestId: 'assessment-request:1', assessmentId: 'assessment:1',
    assessmentTargetDigest: record.targetDigest, idempotencyKey: `effect:${id}`,
    issuedAtLogicalMs: 3, expiresAtLogicalMs: 100 });
}
export function resolver(repository, currentTarget = async () => target(), base = true) {
  return createActionApprovalAssessmentResolverV1({ repository,
    base: { assessorId: 'assessor:1', assessorVersion: 1, async consumeCurrent() { return base; } },
    approvalId: async () => 'approval:1', currentTarget });
}
