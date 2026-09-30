import { ActionApprovalServiceV1, InMemoryActionApprovalRepositoryV1,
  createActionApprovalTargetV1, createActionApprovalAssessmentResolverV1,
  type ActionApprovalAccessV1 } from '@agentplat/inference-control/action-approvals';
import type { ActionScope, ActionBinding, ActionAssessmentResolver } from '@agentplat/inference-control/tools';
declare const scope: ActionScope;
declare const binding: ActionBinding;
declare const access: ActionApprovalAccessV1<{ session: string }>;
declare const base: ActionAssessmentResolver;
const repository = new InMemoryActionApprovalRepositoryV1();
const service = new ActionApprovalServiceV1(repository, access);
const target = createActionApprovalTargetV1({ scope, binding, input: {}, preconditions: {}, authority: {}, policy: {} });
void service.request({ session: 'verified' }, { approvalId: 'one', target, createdAtMs: 1, expiresAtMs: 1000 });
void createActionApprovalAssessmentResolverV1({ base, repository,
  approvalId: async () => 'one', currentTarget: async () => target });
// @ts-expect-error decisions require authenticated context
void service.decide('actor-id', { tenantId: 'one', approvalId: 'one', targetDigest: 'digest', decision: 'approved', nowMs: 2 });
