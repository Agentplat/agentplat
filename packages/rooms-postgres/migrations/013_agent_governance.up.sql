CREATE TABLE __AGENTPLAT_SCHEMA__.agent_governance_heads (
  tenant_id text NOT NULL,
  agent_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  state jsonb NOT NULL,
  PRIMARY KEY (tenant_id, agent_id),
  FOREIGN KEY (tenant_id, agent_id) REFERENCES __AGENTPLAT_SCHEMA__.registered_agents (tenant_id, agent_id) ON DELETE RESTRICT,
  CHECK ((state->>'revision')::bigint = revision),
  CHECK (state->>'status' = 'suspended')
);
CREATE TABLE __AGENTPLAT_SCHEMA__.agent_governance_operations (
  tenant_id text NOT NULL,
  agent_id text NOT NULL,
  operation_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  operation jsonb NOT NULL,
  PRIMARY KEY (tenant_id, agent_id, operation_id),
  UNIQUE (tenant_id, agent_id, revision),
  FOREIGN KEY (tenant_id, agent_id) REFERENCES __AGENTPLAT_SCHEMA__.agent_governance_heads (tenant_id, agent_id) ON DELETE RESTRICT
);
CREATE TRIGGER agent_governance_history_immutable
BEFORE UPDATE OR DELETE ON __AGENTPLAT_SCHEMA__.agent_governance_operations
FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_agent_revision_mutation();
