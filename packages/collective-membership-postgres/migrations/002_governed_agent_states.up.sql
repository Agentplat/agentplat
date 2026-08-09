CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_membership_agent_states (
  scope_id text NOT NULL,
  state_kind text NOT NULL CHECK (state_kind IN ('agent-lineage', 'governed-agent-factory')),
  state_key text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  logical_time_high_water_ms bigint NOT NULL CHECK (logical_time_high_water_ms >= 0),
  state_digest text NOT NULL CHECK (state_digest ~ '^sha256:[0-9a-f]{64}$'),
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (scope_id, state_kind, state_key)
);

CREATE INDEX IF NOT EXISTS collective_membership_agent_states_updated_idx
  ON __AGENTPLAT_SCHEMA__.collective_membership_agent_states
    (scope_id, state_kind, updated_at DESC);
