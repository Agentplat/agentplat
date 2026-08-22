CREATE TABLE __AGENTPLAT_SCHEMA__.knowledge_bundle_revisions (
  tenant_id text NOT NULL,
  bundle_id text NOT NULL,
  version text NOT NULL,
  reference text NOT NULL,
  digest text NOT NULL CHECK (digest ~ '^sha256:[a-f0-9]{64}$'),
  bundle jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, reference),
  UNIQUE (tenant_id, bundle_id, version)
);

CREATE OR REPLACE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_knowledge_bundle_mutation()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'knowledge bundle revisions are immutable'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER knowledge_bundle_revisions_immutable_update
BEFORE UPDATE ON __AGENTPLAT_SCHEMA__.knowledge_bundle_revisions
FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_knowledge_bundle_mutation();
CREATE TRIGGER knowledge_bundle_revisions_immutable_delete
BEFORE DELETE ON __AGENTPLAT_SCHEMA__.knowledge_bundle_revisions
FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_knowledge_bundle_mutation();
