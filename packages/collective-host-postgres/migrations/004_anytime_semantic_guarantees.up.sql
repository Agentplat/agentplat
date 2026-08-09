CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_host_semantic_guarantee_states (
  scope_id text NOT NULL,
  state_key text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 1),
  sequence_high_water bigint NOT NULL CHECK (sequence_high_water >= 1),
  logical_time_high_water_ms bigint NOT NULL CHECK (logical_time_high_water_ms >= 0),
  state_digest text NOT NULL CHECK (state_digest ~ '^sha256:[0-9a-f]{64}$'),
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (scope_id, state_key)
);

CREATE INDEX IF NOT EXISTS collective_host_semantic_guarantee_updated_idx
  ON __AGENTPLAT_SCHEMA__.collective_host_semantic_guarantee_states
    (scope_id, updated_at DESC);
