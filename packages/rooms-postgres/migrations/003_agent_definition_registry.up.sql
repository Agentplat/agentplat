CREATE TABLE __AGENTPLAT_SCHEMA__.registered_agents (
  tenant_id text NOT NULL,
  agent_id text NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, agent_id)
);

CREATE TABLE __AGENTPLAT_SCHEMA__.agent_definition_revisions (
  tenant_id text NOT NULL,
  agent_id text NOT NULL,
  revision_id text NOT NULL,
  version text NOT NULL,
  digest text NOT NULL CHECK (digest ~ '^sha256:[a-f0-9]{64}$'),
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, revision_id),
  UNIQUE (tenant_id, agent_id, version),
  FOREIGN KEY (tenant_id, agent_id) REFERENCES __AGENTPLAT_SCHEMA__.registered_agents (tenant_id, agent_id) ON DELETE RESTRICT
);

CREATE TABLE __AGENTPLAT_SCHEMA__.agent_revision_lifecycle (
  tenant_id text NOT NULL,
  agent_id text NOT NULL,
  revision_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  status text NOT NULL CHECK (status IN ('draft', 'published', 'deprecated')),
  lifecycle jsonb NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, revision_id),
  FOREIGN KEY (tenant_id, revision_id) REFERENCES __AGENTPLAT_SCHEMA__.agent_definition_revisions (tenant_id, revision_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, agent_id) REFERENCES __AGENTPLAT_SCHEMA__.registered_agents (tenant_id, agent_id) ON DELETE RESTRICT
);

CREATE INDEX agent_definition_revisions_tenant_agent_idx
  ON __AGENTPLAT_SCHEMA__.agent_definition_revisions (tenant_id, agent_id, version);

CREATE OR REPLACE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_agent_revision_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'agent definition revisions are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_definition_revisions_immutable_update
BEFORE UPDATE ON __AGENTPLAT_SCHEMA__.agent_definition_revisions
FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_agent_revision_mutation();

CREATE TRIGGER agent_definition_revisions_immutable_delete
BEFORE DELETE ON __AGENTPLAT_SCHEMA__.agent_definition_revisions
FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_agent_revision_mutation();
