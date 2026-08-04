CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_quorum_assignment_slots (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  policy_domain_id text NOT NULL,
  assignment_slot_digest text NOT NULL CHECK (assignment_slot_digest ~ '^sha256:[0-9a-f]{64}$'),
  value_digest text NOT NULL CHECK (value_digest ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, policy_domain_id, assignment_slot_digest)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_quorum_recovery_acceptors (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  policy_domain_id text NOT NULL,
  scope_digest text NOT NULL CHECK (scope_digest ~ '^sha256:[0-9a-f]{64}$'),
  promised_counter bigint CHECK (promised_counter IS NULL OR promised_counter >= 1),
  promised_proposer_peer_id text,
  accepted_counter bigint CHECK (accepted_counter IS NULL OR accepted_counter >= 1),
  accepted_proposer_peer_id text,
  accepted_value jsonb CHECK (accepted_value IS NULL OR jsonb_typeof(accepted_value) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK ((promised_counter IS NULL) = (promised_proposer_peer_id IS NULL)),
  CHECK ((accepted_counter IS NULL) = (accepted_proposer_peer_id IS NULL)),
  CHECK ((accepted_counter IS NULL) = (accepted_value IS NULL)),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, policy_domain_id, scope_digest)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_quorum_ballot_counters (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  policy_domain_id text NOT NULL,
  scope_digest text NOT NULL CHECK (scope_digest ~ '^sha256:[0-9a-f]{64}$'),
  proposer_peer_id text NOT NULL,
  counter bigint NOT NULL CHECK (counter >= 0),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, policy_domain_id, scope_digest, proposer_peer_id),
  FOREIGN KEY (tenant_id, mesh_id, peer_id, policy_domain_id, scope_digest)
    REFERENCES __AGENTPLAT_SCHEMA__.collective_quorum_recovery_acceptors
      (tenant_id, mesh_id, peer_id, policy_domain_id, scope_digest)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_quorum_responses (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  policy_domain_id text NOT NULL,
  request_message_id text NOT NULL,
  response_type text NOT NULL,
  response_message_id text NOT NULL,
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, policy_domain_id, request_message_id),
  UNIQUE (tenant_id, mesh_id, peer_id, policy_domain_id, response_message_id)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_quorum_certificates (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  policy_domain_id text NOT NULL,
  certificate_id text NOT NULL,
  certificate_kind text NOT NULL,
  scope_digest text NOT NULL CHECK (scope_digest ~ '^sha256:[0-9a-f]{64}$'),
  certificate_digest text NOT NULL CHECK (certificate_digest ~ '^sha256:[0-9a-f]{64}$'),
  certificate jsonb NOT NULL CHECK (jsonb_typeof(certificate) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, policy_domain_id, certificate_id),
  UNIQUE (tenant_id, mesh_id, peer_id, policy_domain_id, certificate_digest)
);

CREATE INDEX IF NOT EXISTS collective_quorum_responses_type_idx
  ON __AGENTPLAT_SCHEMA__.collective_quorum_responses
    (tenant_id, mesh_id, peer_id, policy_domain_id, response_type, created_at);

CREATE INDEX IF NOT EXISTS collective_quorum_certificates_scope_idx
  ON __AGENTPLAT_SCHEMA__.collective_quorum_certificates
    (tenant_id, mesh_id, peer_id, policy_domain_id, scope_digest, created_at);
