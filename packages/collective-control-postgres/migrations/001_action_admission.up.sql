CREATE TABLE __AGENTPLAT_SCHEMA__.action_admission_states_v1 (
  tenant_id text PRIMARY KEY,
  record jsonb NOT NULL,
  record_digest text NOT NULL,
  CHECK (record->>'tenantId' = tenant_id)
);
