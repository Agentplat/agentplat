import {
  createRoleAlignmentPolicyRecordV1,
  createRoleAlignmentRoleAnchorV1,
  createRoleAlignmentStateV1,
  observeRoleAlignmentSignalV1,
  type RoleAlignmentDecisionV1,
  type RoleAlignmentPolicyV1,
  type RoleAlignmentSignalV1,
  type RoleAlignmentStateV1,
} from '@agentplat/inference-control/role-alignment';
import {
  createRoleAlignmentPortableAgentControlV1,
  type CreateRoleAlignmentPortableAgentControlV1,
  type RoleAlignmentAssessmentRequestV1,
  type RoleAlignmentAssessmentV1,
  type RoleAlignmentHandoffEnvelopeV1,
  type RoleAlignmentPortableAgentControlV1,
  type RoleAlignmentStateStoreV1,
} from '@agentplat/inference-control/role-alignment/portable-agent';

declare const policy: RoleAlignmentPolicyV1;
declare const signal: RoleAlignmentSignalV1;
declare const state: RoleAlignmentStateV1;
declare const options: CreateRoleAlignmentPortableAgentControlV1;
declare const store: RoleAlignmentStateStoreV1;
declare const request: RoleAlignmentAssessmentRequestV1;
declare const assessment: RoleAlignmentAssessmentV1;
declare const handoff: RoleAlignmentHandoffEnvelopeV1;

const policyRecord = createRoleAlignmentPolicyRecordV1(policy);
const anchor = createRoleAlignmentRoleAnchorV1({
  tenantId: 'tenant',
  sessionId: 'session',
  agentId: 'agent',
  objectiveId: 'objective',
  roleBindingId: 'role',
  roleRevision: 1,
  predecessorRoleBindingId: null,
  roleKey: 'observer',
  roleContent: {},
});
const created = createRoleAlignmentStateV1({
  controllerId: 'control',
  controllerVersion: 1,
  implementationId: 'build',
  policy,
  roleAnchor: anchor,
  createdAtLogicalMs: 0,
});
const decision: RoleAlignmentDecisionV1 = observeRoleAlignmentSignalV1(
  state,
  { expectedRevision: state.revision, signal },
  policy
).decision;
const control: RoleAlignmentPortableAgentControlV1 =
  createRoleAlignmentPortableAgentControlV1(options);

void policyRecord;
void created;
void decision;
void control;
void store;
void request;
void assessment;
void handoff;
