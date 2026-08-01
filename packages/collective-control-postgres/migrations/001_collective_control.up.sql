CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_authority_states (
  tenant_id text NOT NULL,
  policy_domain_id text NOT NULL,
  generation bigint NOT NULL CHECK (generation >= 1),
  high_water_logical_ms bigint NOT NULL CHECK (high_water_logical_ms >= 0),
  state_digest text NOT NULL CHECK (state_digest ~ '^sha256:[0-9a-f]{64}$'),
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, policy_domain_id)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_execution_states (
  tenant_id text NOT NULL,
  policy_domain_id text NOT NULL,
  generation bigint NOT NULL CHECK (generation >= 1),
  high_water_logical_ms bigint NOT NULL CHECK (high_water_logical_ms >= 0),
  state_digest text NOT NULL CHECK (state_digest ~ '^sha256:[0-9a-f]{64}$'),
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, policy_domain_id)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_mandates (
  tenant_id text NOT NULL,
  policy_domain_id text NOT NULL,
  mandate_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 1),
  mandate_digest text NOT NULL CHECK (mandate_digest ~ '^sha256:[0-9a-f]{64}$'),
  record jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object'),
  PRIMARY KEY (tenant_id, policy_domain_id, mandate_id, revision),
  UNIQUE (tenant_id, policy_domain_id, mandate_digest)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_revocations (
  tenant_id text NOT NULL,
  policy_domain_id text NOT NULL,
  mandate_id text NOT NULL,
  generation bigint NOT NULL CHECK (generation >= 1),
  revocation_digest text NOT NULL CHECK (revocation_digest ~ '^sha256:[0-9a-f]{64}$'),
  record jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object'),
  PRIMARY KEY (tenant_id, policy_domain_id, mandate_id, generation),
  UNIQUE (tenant_id, policy_domain_id, revocation_digest)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_work_contracts (
  tenant_id text NOT NULL,
  policy_domain_id text NOT NULL,
  work_contract_id text NOT NULL,
  generation bigint NOT NULL CHECK (generation >= 1),
  status text NOT NULL,
  work_contract_digest text NOT NULL CHECK (work_contract_digest ~ '^sha256:[0-9a-f]{64}$'),
  record jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object'),
  PRIMARY KEY (tenant_id, policy_domain_id, work_contract_id)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_budget_reservations (
  tenant_id text NOT NULL,
  policy_domain_id text NOT NULL,
  reservation_id text NOT NULL,
  generation bigint NOT NULL CHECK (generation >= 1),
  status text NOT NULL,
  reservation_digest text NOT NULL CHECK (reservation_digest ~ '^sha256:[0-9a-f]{64}$'),
  record jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object'),
  PRIMARY KEY (tenant_id, policy_domain_id, reservation_id)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_action_permits (
  tenant_id text NOT NULL,
  policy_domain_id text NOT NULL,
  permit_id text NOT NULL,
  generation bigint NOT NULL CHECK (generation >= 1),
  status text NOT NULL,
  permit_digest text NOT NULL CHECK (permit_digest ~ '^sha256:[0-9a-f]{64}$'),
  record jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object'),
  PRIMARY KEY (tenant_id, policy_domain_id, permit_id)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_grant_clocks (
  tenant_id text NOT NULL,
  gateway_id text NOT NULL,
  high_water_logical_ms bigint NOT NULL CHECK (high_water_logical_ms >= 0),
  PRIMARY KEY (tenant_id, gateway_id)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_action_grants (
  tenant_id text NOT NULL,
  gateway_id text NOT NULL,
  grant_id text NOT NULL,
  scope_digest text NOT NULL CHECK (scope_digest ~ '^sha256:[0-9a-f]{64}$'),
  idempotency_key text NOT NULL,
  action_digest text NOT NULL CHECK (action_digest ~ '^sha256:[0-9a-f]{64}$'),
  state_generation bigint NOT NULL CHECK (state_generation >= 1),
  grant_digest text NOT NULL CHECK (grant_digest ~ '^sha256:[0-9a-f]{64}$'),
  status text NOT NULL,
  grant_record jsonb NOT NULL CHECK (jsonb_typeof(grant_record) = 'object'),
  idempotency jsonb NOT NULL CHECK (jsonb_typeof(idempotency) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, gateway_id, grant_id),
  UNIQUE (tenant_id, gateway_id, scope_digest, idempotency_key)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_evidence_anchors (
  tenant_id text NOT NULL,
  policy_domain_id text NOT NULL,
  record_count bigint NOT NULL CHECK (record_count >= 0),
  latest_record_digest text CHECK (latest_record_digest IS NULL OR latest_record_digest ~ '^sha256:[0-9a-f]{64}$'),
  retained_from_sequence bigint NOT NULL DEFAULT 1 CHECK (retained_from_sequence >= 1),
  retained_predecessor_digest text CHECK (retained_predecessor_digest IS NULL OR retained_predecessor_digest ~ '^sha256:[0-9a-f]{64}$'),
  PRIMARY KEY (tenant_id, policy_domain_id)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_evidence_records (
  tenant_id text NOT NULL,
  policy_domain_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence >= 1),
  record_id text NOT NULL,
  previous_record_digest text CHECK (previous_record_digest IS NULL OR previous_record_digest ~ '^sha256:[0-9a-f]{64}$'),
  record_digest text NOT NULL CHECK (record_digest ~ '^sha256:[0-9a-f]{64}$'),
  record jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object'),
  PRIMARY KEY (tenant_id, policy_domain_id, sequence),
  UNIQUE (tenant_id, policy_domain_id, record_id),
  UNIQUE (tenant_id, policy_domain_id, record_digest)
);

CREATE INDEX IF NOT EXISTS collective_work_contracts_status_idx
  ON __AGENTPLAT_SCHEMA__.collective_work_contracts (tenant_id, policy_domain_id, status);
CREATE INDEX IF NOT EXISTS collective_action_permits_status_idx
  ON __AGENTPLAT_SCHEMA__.collective_action_permits (tenant_id, policy_domain_id, status);
CREATE INDEX IF NOT EXISTS collective_action_grants_status_idx
  ON __AGENTPLAT_SCHEMA__.collective_action_grants (tenant_id, gateway_id, status);
