DO $$
DECLARE candidate text;
BEGIN
  FOR candidate IN SELECT conname FROM pg_catalog.pg_constraint
    WHERE conrelid = '__AGENTPLAT_SCHEMA__.agent_governance_heads'::regclass
      AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%suspended%'
  LOOP
    EXECUTE 'ALTER TABLE __AGENTPLAT_SCHEMA__.agent_governance_heads DROP CONSTRAINT ' || quote_ident(candidate);
  END LOOP;
END $$;
ALTER TABLE __AGENTPLAT_SCHEMA__.agent_governance_heads
  ADD CONSTRAINT governance_execution_status_v1 CHECK (state->>'status' IN ('suspended','transitioning','active'));
CREATE TABLE __AGENTPLAT_SCHEMA__.agent_execution_limits (
  tenant_id text NOT NULL, agent_id text NOT NULL, limit_id text NOT NULL, record jsonb NOT NULL,
  PRIMARY KEY (tenant_id,agent_id,limit_id),
  FOREIGN KEY (tenant_id,agent_id) REFERENCES __AGENTPLAT_SCHEMA__.agent_governance_heads (tenant_id,agent_id) ON DELETE RESTRICT
);
CREATE TRIGGER agent_execution_limits_immutable
BEFORE UPDATE OR DELETE ON __AGENTPLAT_SCHEMA__.agent_execution_limits
FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_agent_revision_mutation();
CREATE TABLE __AGENTPLAT_SCHEMA__.agent_execution_budgets (
  tenant_id text NOT NULL, agent_id text NOT NULL, totals jsonb NOT NULL,
  PRIMARY KEY (tenant_id,agent_id),
  FOREIGN KEY (tenant_id,agent_id) REFERENCES __AGENTPLAT_SCHEMA__.agent_governance_heads (tenant_id,agent_id) ON DELETE RESTRICT
);
CREATE TABLE __AGENTPLAT_SCHEMA__.agent_execution_effects (
  tenant_id text NOT NULL, agent_id text NOT NULL, effect_id text NOT NULL, record jsonb NOT NULL,
  PRIMARY KEY (tenant_id,agent_id,effect_id),
  FOREIGN KEY (tenant_id,agent_id) REFERENCES __AGENTPLAT_SCHEMA__.agent_governance_heads (tenant_id,agent_id) ON DELETE RESTRICT
);
CREATE TABLE __AGENTPLAT_SCHEMA__.agent_governed_task_bindings (
  tenant_id text NOT NULL, room_id text NOT NULL, task_id text NOT NULL, agent_id text NOT NULL, record jsonb NOT NULL,
  PRIMARY KEY (tenant_id,room_id,task_id),
  FOREIGN KEY (tenant_id,agent_id) REFERENCES __AGENTPLAT_SCHEMA__.agent_governance_heads (tenant_id,agent_id) ON DELETE RESTRICT
);
CREATE TRIGGER agent_governed_task_bindings_immutable
BEFORE UPDATE OR DELETE ON __AGENTPLAT_SCHEMA__.agent_governed_task_bindings
FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_agent_revision_mutation();
