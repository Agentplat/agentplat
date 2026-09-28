CREATE TABLE __AGENTPLAT_SCHEMA__.attention_signal_catalog (
  tenant_id text NOT NULL,
  agent_id text NOT NULL,
  record_id text NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (tenant_id, agent_id, record_id),
  FOREIGN KEY (tenant_id, agent_id) REFERENCES __AGENTPLAT_SCHEMA__.agent_governance_heads (tenant_id, agent_id) ON DELETE RESTRICT
);
CREATE TABLE __AGENTPLAT_SCHEMA__.attention_signal_states (
  tenant_id text NOT NULL,
  agent_id text NOT NULL,
  definition_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  state jsonb NOT NULL,
  PRIMARY KEY (tenant_id, agent_id, definition_id),
  FOREIGN KEY (tenant_id, agent_id, definition_id) REFERENCES __AGENTPLAT_SCHEMA__.attention_signal_catalog (tenant_id, agent_id, record_id) ON DELETE RESTRICT,
  CHECK ((state->>'revision')::bigint = revision)
);
CREATE TRIGGER attention_signal_catalog_immutable
BEFORE UPDATE OR DELETE ON __AGENTPLAT_SCHEMA__.attention_signal_catalog
FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_agent_revision_mutation();
