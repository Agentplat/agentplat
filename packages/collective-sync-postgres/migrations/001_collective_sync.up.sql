CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_sync_stream_heads (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  instance_id text NOT NULL,
  policy_domain_id text NOT NULL,
  sync_domain text NOT NULL,
  stream_id text NOT NULL,
  head_sequence bigint NOT NULL CHECK (head_sequence >= 0),
  head_digest text,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK ((head_sequence = 0 AND head_digest IS NULL) OR
         (head_sequence > 0 AND head_digest ~ '^sha256:[0-9a-f]{64}$')),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
               sync_domain, stream_id)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_sync_records (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  instance_id text NOT NULL,
  policy_domain_id text NOT NULL,
  sync_domain text NOT NULL,
  stream_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence >= 1),
  predecessor_digest text,
  record_digest text NOT NULL CHECK (record_digest ~ '^sha256:[0-9a-f]{64}$'),
  record jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK ((sequence = 1 AND predecessor_digest IS NULL) OR
         (sequence > 1 AND predecessor_digest ~ '^sha256:[0-9a-f]{64}$')),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
               sync_domain, stream_id, sequence),
  UNIQUE (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
          sync_domain, record_digest),
  FOREIGN KEY (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
               sync_domain, stream_id)
    REFERENCES __AGENTPLAT_SCHEMA__.collective_sync_stream_heads
      (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
       sync_domain, stream_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_sync_sessions (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  instance_id text NOT NULL,
  policy_domain_id text NOT NULL,
  session_id text NOT NULL,
  sync_domain text NOT NULL,
  membership_epoch bigint NOT NULL CHECK (membership_epoch >= 1),
  membership_configuration_digest text NOT NULL
    CHECK (membership_configuration_digest ~ '^sha256:[0-9a-f]{64}$'),
  updated_at_logical_ms bigint NOT NULL CHECK (updated_at_logical_ms >= 0),
  status text NOT NULL CHECK (status IN
    ('discovering', 'transferring', 'certifying', 'ready', 'failed')),
  session jsonb NOT NULL CHECK (jsonb_typeof(session) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
               session_id)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_sync_receipts (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  instance_id text NOT NULL,
  policy_domain_id text NOT NULL,
  message_id text NOT NULL,
  chunk_digest text NOT NULL CHECK (chunk_digest ~ '^sha256:[0-9a-f]{64}$'),
  receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
               message_id)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_sync_certificates (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  instance_id text NOT NULL,
  policy_domain_id text NOT NULL,
  sync_domain text NOT NULL,
  certificate_id text NOT NULL,
  certificate_digest text NOT NULL CHECK (certificate_digest ~ '^sha256:[0-9a-f]{64}$'),
  membership_epoch bigint NOT NULL CHECK (membership_epoch >= 1),
  certified_at_logical_ms bigint NOT NULL CHECK (certified_at_logical_ms >= 0),
  certificate jsonb NOT NULL CHECK (jsonb_typeof(certificate) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
               certificate_id),
  UNIQUE (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
          certificate_digest)
);

CREATE INDEX IF NOT EXISTS collective_sync_records_scan_idx
  ON __AGENTPLAT_SCHEMA__.collective_sync_records
    (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
     sync_domain, stream_id, sequence);

CREATE INDEX IF NOT EXISTS collective_sync_certificates_latest_idx
  ON __AGENTPLAT_SCHEMA__.collective_sync_certificates
    (tenant_id, mesh_id, peer_id, instance_id, policy_domain_id,
     sync_domain, membership_epoch DESC, certified_at_logical_ms DESC);
