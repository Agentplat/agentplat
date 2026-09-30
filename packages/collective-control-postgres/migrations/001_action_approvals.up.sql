CREATE TABLE __AGENTPLAT_SCHEMA__.action_approvals_v1 (
  tenant_id text NOT NULL,
  approval_id text NOT NULL,
  record jsonb NOT NULL,
  record_digest text NOT NULL,
  PRIMARY KEY (tenant_id, approval_id),
  CHECK (record->>'tenantId' = tenant_id),
  CHECK (record->>'approvalId' = approval_id)
);
