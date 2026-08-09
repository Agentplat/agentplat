CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_host_autonomous_node_advances (
  scope_id text NOT NULL,
  runtime_id text NOT NULL,
  advance_id text NOT NULL,
  expected_revision bigint NOT NULL CHECK (expected_revision >= 0),
  canonical_logical_time_ms bigint NOT NULL CHECK (canonical_logical_time_ms >= 0),
  holder_id text NOT NULL,
  lease_until_logical_ms bigint NOT NULL CHECK (lease_until_logical_ms >= 0),
  fence bigint NOT NULL CHECK (fence >= 1),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (scope_id, runtime_id)
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_host_autonomous_node_commands (
  scope_id text NOT NULL,
  runtime_id text NOT NULL,
  command_id text NOT NULL,
  command_digest text NOT NULL CHECK (command_digest ~ '^sha256:[0-9a-f]{64}$'),
  command_binding jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'completed')),
  result jsonb,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (scope_id, runtime_id, command_id)
);
