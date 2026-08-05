CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.execution_checkpoint_artifacts (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  instance_id text NOT NULL,
  policy_domain_id text NOT NULL,
  checkpoint_id text NOT NULL,
  artifact_digest text NOT NULL CHECK (artifact_digest ~ '^sha256:[0-9a-f]{64}$'),
  content_reference text NOT NULL,
  artifact jsonb NOT NULL CHECK (jsonb_typeof(artifact) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
               checkpoint_id)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.execution_checkpoint_receipts (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  instance_id text NOT NULL,
  policy_domain_id text NOT NULL,
  request_message_id text NOT NULL,
  checkpoint_id text NOT NULL,
  artifact_digest text NOT NULL CHECK (artifact_digest ~ '^sha256:[0-9a-f]{64}$'),
  receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
               request_message_id)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.execution_checkpoint_certificates (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  instance_id text NOT NULL,
  policy_domain_id text NOT NULL,
  checkpoint_id text NOT NULL,
  certificate_id text NOT NULL,
  certificate_digest text NOT NULL CHECK (certificate_digest ~ '^sha256:[0-9a-f]{64}$'),
  artifact_digest text NOT NULL CHECK (artifact_digest ~ '^sha256:[0-9a-f]{64}$'),
  certificate jsonb NOT NULL CHECK (jsonb_typeof(certificate) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
               checkpoint_id),
  UNIQUE (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
          certificate_id)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.execution_checkpoint_certificate_acks (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  instance_id text NOT NULL,
  policy_domain_id text NOT NULL,
  request_message_id text NOT NULL,
  checkpoint_id text NOT NULL,
  certificate_id text NOT NULL,
  acknowledgement jsonb NOT NULL CHECK (jsonb_typeof(acknowledgement) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
               request_message_id)
);

CREATE INDEX IF NOT EXISTS execution_checkpoint_receipts_checkpoint_idx
  ON __AGENTPLAT_SCHEMA__.execution_checkpoint_receipts
    (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id, checkpoint_id);

CREATE INDEX IF NOT EXISTS execution_checkpoint_acks_certificate_idx
  ON __AGENTPLAT_SCHEMA__.execution_checkpoint_certificate_acks
    (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id, certificate_id);
