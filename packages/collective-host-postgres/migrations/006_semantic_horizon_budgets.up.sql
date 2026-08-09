CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_host_semantic_horizon_budget_states (
  scope_id text NOT NULL,
  state_key text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 1),
  state_digest text NOT NULL CHECK (state_digest ~ '^sha256:[0-9a-f]{64}$'),
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (scope_id, state_key)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_host_semantic_horizon_budget_anchors (
  scope_id text NOT NULL,
  state_key text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 1),
  state_digest text NOT NULL CHECK (state_digest ~ '^sha256:[0-9a-f]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (scope_id, state_key)
);

CREATE INDEX IF NOT EXISTS collective_host_semantic_horizon_budget_updated_idx
  ON __AGENTPLAT_SCHEMA__.collective_host_semantic_horizon_budget_states
    (scope_id, updated_at DESC);
