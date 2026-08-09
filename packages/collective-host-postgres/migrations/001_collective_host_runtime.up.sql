CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_host_runtime_states (
  scope_id text NOT NULL,
  state_kind text NOT NULL,
  state_key text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  logical_time_high_water_ms bigint NOT NULL CHECK (logical_time_high_water_ms >= 0),
  state_digest text NOT NULL CHECK (state_digest ~ '^sha256:[0-9a-f]{64}$'),
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (scope_id, state_kind, state_key)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_host_protocol_artifacts (
  scope_id text NOT NULL,
  artifact_digest text NOT NULL CHECK (artifact_digest ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  message_digest text NOT NULL CHECK (message_digest ~ '^sha256:[0-9a-f]{64}$'),
  artifact jsonb NOT NULL CHECK (jsonb_typeof(artifact) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (scope_id, artifact_digest),
  UNIQUE (scope_id, message_digest)
);

CREATE INDEX IF NOT EXISTS collective_host_runtime_updated_idx
  ON __AGENTPLAT_SCHEMA__.collective_host_runtime_states
    (scope_id, state_kind, updated_at DESC);
