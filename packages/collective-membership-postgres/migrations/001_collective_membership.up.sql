CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_membership_heads (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  policy_domain_id text NOT NULL,
  current_epoch bigint NOT NULL CHECK (current_epoch >= 1),
  current_configuration_digest text NOT NULL
    CHECK (current_configuration_digest ~ '^sha256:[0-9a-f]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, policy_domain_id)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_membership_configurations (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  policy_domain_id text NOT NULL,
  epoch bigint NOT NULL CHECK (epoch >= 1),
  configuration_digest text NOT NULL
    CHECK (configuration_digest ~ '^sha256:[0-9a-f]{64}$'),
  previous_configuration_digest text,
  configuration jsonb NOT NULL CHECK (jsonb_typeof(configuration) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, policy_domain_id, epoch),
  UNIQUE (tenant_id, mesh_id, peer_id, policy_domain_id, configuration_digest),
  FOREIGN KEY (tenant_id, mesh_id, peer_id, policy_domain_id)
    REFERENCES __AGENTPLAT_SCHEMA__.collective_membership_heads
      (tenant_id, mesh_id, peer_id, policy_domain_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_membership_vote_slots (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  policy_domain_id text NOT NULL,
  from_epoch bigint NOT NULL CHECK (from_epoch >= 1),
  proposal_digest text NOT NULL CHECK (proposal_digest ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, policy_domain_id, from_epoch),
  FOREIGN KEY (tenant_id, mesh_id, peer_id, policy_domain_id)
    REFERENCES __AGENTPLAT_SCHEMA__.collective_membership_heads
      (tenant_id, mesh_id, peer_id, policy_domain_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_membership_responses (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  policy_domain_id text NOT NULL,
  request_message_id text NOT NULL,
  response_message_id text NOT NULL,
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, policy_domain_id, request_message_id),
  UNIQUE (tenant_id, mesh_id, peer_id, policy_domain_id, response_message_id),
  FOREIGN KEY (tenant_id, mesh_id, peer_id, policy_domain_id)
    REFERENCES __AGENTPLAT_SCHEMA__.collective_membership_heads
      (tenant_id, mesh_id, peer_id, policy_domain_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_membership_certificates (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  policy_domain_id text NOT NULL,
  certificate_id text NOT NULL,
  certificate_digest text NOT NULL CHECK (certificate_digest ~ '^sha256:[0-9a-f]{64}$'),
  from_epoch bigint NOT NULL CHECK (from_epoch >= 1),
  to_epoch bigint NOT NULL CHECK (to_epoch = from_epoch + 1),
  certificate jsonb NOT NULL CHECK (jsonb_typeof(certificate) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, policy_domain_id, certificate_id),
  UNIQUE (tenant_id, mesh_id, peer_id, policy_domain_id, certificate_digest),
  FOREIGN KEY (tenant_id, mesh_id, peer_id, policy_domain_id)
    REFERENCES __AGENTPLAT_SCHEMA__.collective_membership_heads
      (tenant_id, mesh_id, peer_id, policy_domain_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS collective_membership_configurations_epoch_idx
  ON __AGENTPLAT_SCHEMA__.collective_membership_configurations
    (tenant_id, mesh_id, peer_id, policy_domain_id, epoch DESC);

CREATE INDEX IF NOT EXISTS collective_membership_certificates_epoch_idx
  ON __AGENTPLAT_SCHEMA__.collective_membership_certificates
    (tenant_id, mesh_id, peer_id, policy_domain_id, to_epoch DESC);
