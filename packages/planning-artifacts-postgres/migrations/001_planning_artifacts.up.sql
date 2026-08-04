CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.planning_artifacts (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  instance_id text NOT NULL,
  policy_domain_id text NOT NULL,
  content_reference text NOT NULL,
  objective_id text NOT NULL,
  mission_intent_id text NOT NULL,
  intent_revision bigint NOT NULL CHECK (intent_revision >= 1),
  fragment_id text NOT NULL,
  fragment_revision bigint NOT NULL CHECK (fragment_revision >= 1),
  fragment_digest text NOT NULL CHECK (fragment_digest ~ '^sha256:[0-9a-f]{64}$'),
  artifact jsonb NOT NULL CHECK (jsonb_typeof(artifact) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
               content_reference),
  UNIQUE (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
          objective_id, mission_intent_id, intent_revision,
          fragment_id, fragment_revision)
);

CREATE INDEX IF NOT EXISTS planning_artifacts_fragment_digest_idx
  ON __AGENTPLAT_SCHEMA__.planning_artifacts
    (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
     fragment_digest);
