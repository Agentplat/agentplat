CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_agreement_states (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  policy_domain_id text NOT NULL,
  slot_id text NOT NULL,
  height bigint NOT NULL CHECK (height >= 1),
  highest_round bigint NOT NULL CHECK (highest_round >= 0),
  locked_round bigint CHECK (locked_round IS NULL OR locked_round >= 0),
  locked_value_digest text CHECK (locked_value_digest IS NULL OR locked_value_digest ~ '^sha256:[0-9a-f]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK ((locked_round IS NULL) = (locked_value_digest IS NULL)),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, policy_domain_id, slot_id, height)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_agreement_local_votes (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  policy_domain_id text NOT NULL,
  slot_id text NOT NULL,
  height bigint NOT NULL CHECK (height >= 1),
  round bigint NOT NULL CHECK (round >= 0),
  phase text NOT NULL CHECK (phase IN ('prevote', 'precommit')),
  proposal_id text NOT NULL,
  value_digest text CHECK (value_digest IS NULL OR value_digest ~ '^sha256:[0-9a-f]{64}$'),
  vote jsonb NOT NULL CHECK (jsonb_typeof(vote) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, policy_domain_id, slot_id, height, round, phase),
  FOREIGN KEY (tenant_id, mesh_id, peer_id, policy_domain_id, slot_id, height)
    REFERENCES __AGENTPLAT_SCHEMA__.collective_agreement_states
      (tenant_id, mesh_id, peer_id, policy_domain_id, slot_id, height)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_agreement_observed_votes (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  policy_domain_id text NOT NULL,
  slot_id text NOT NULL,
  height bigint NOT NULL CHECK (height >= 1),
  round bigint NOT NULL CHECK (round >= 0),
  phase text NOT NULL CHECK (phase IN ('prevote', 'precommit')),
  voter_peer_id text NOT NULL,
  proposal_id text NOT NULL,
  value_digest text CHECK (value_digest IS NULL OR value_digest ~ '^sha256:[0-9a-f]{64}$'),
  vote jsonb NOT NULL CHECK (jsonb_typeof(vote) = 'object'),
  observed_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, policy_domain_id, slot_id, height, round, phase, voter_peer_id)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_agreement_commits (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  policy_domain_id text NOT NULL,
  slot_id text NOT NULL,
  height bigint NOT NULL CHECK (height >= 1),
  certificate_id text NOT NULL,
  certificate_digest text NOT NULL CHECK (certificate_digest ~ '^sha256:[0-9a-f]{64}$'),
  previous_commit_digest text CHECK (previous_commit_digest IS NULL OR previous_commit_digest ~ '^sha256:[0-9a-f]{64}$'),
  certificate jsonb NOT NULL CHECK (jsonb_typeof(certificate) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, policy_domain_id, slot_id, height),
  UNIQUE (tenant_id, mesh_id, peer_id, policy_domain_id, certificate_id),
  UNIQUE (tenant_id, mesh_id, peer_id, policy_domain_id, certificate_digest)
);

CREATE INDEX IF NOT EXISTS collective_agreement_commits_history_idx
  ON __AGENTPLAT_SCHEMA__.collective_agreement_commits
    (tenant_id, mesh_id, peer_id, policy_domain_id, slot_id, height);
