CREATE TABLE __AGENTPLAT_SCHEMA__.agent_inceptions (
  tenant_id text NOT NULL,
  agent_id text NOT NULL,
  inception_id text NOT NULL,
  record jsonb NOT NULL,
  PRIMARY KEY (tenant_id, agent_id, inception_id),
  FOREIGN KEY (tenant_id, agent_id) REFERENCES __AGENTPLAT_SCHEMA__.agent_governance_heads (tenant_id, agent_id) ON DELETE RESTRICT
);
CREATE TABLE __AGENTPLAT_SCHEMA__.agent_inception_heads (
  tenant_id text NOT NULL,
  agent_id text NOT NULL,
  inception_id text NOT NULL,
  revision bigint NOT NULL DEFAULT -1 CHECK (revision >= -1),
  assessment_digest text,
  PRIMARY KEY (tenant_id, agent_id, inception_id),
  FOREIGN KEY (tenant_id, agent_id, inception_id) REFERENCES __AGENTPLAT_SCHEMA__.agent_inceptions (tenant_id, agent_id, inception_id) ON DELETE RESTRICT
);
CREATE TABLE __AGENTPLAT_SCHEMA__.agent_inception_assessments (
  tenant_id text NOT NULL,
  agent_id text NOT NULL,
  inception_id text NOT NULL,
  assessment_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  record jsonb NOT NULL,
  PRIMARY KEY (tenant_id, agent_id, inception_id, assessment_id),
  UNIQUE (tenant_id, agent_id, inception_id, revision),
  FOREIGN KEY (tenant_id, agent_id, inception_id) REFERENCES __AGENTPLAT_SCHEMA__.agent_inceptions (tenant_id, agent_id, inception_id) ON DELETE RESTRICT
);
CREATE TRIGGER agent_inceptions_immutable
BEFORE UPDATE OR DELETE ON __AGENTPLAT_SCHEMA__.agent_inceptions
FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_agent_revision_mutation();
CREATE TRIGGER agent_inception_assessments_immutable
BEFORE UPDATE OR DELETE ON __AGENTPLAT_SCHEMA__.agent_inception_assessments
FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_agent_revision_mutation();
