CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_host_assurance_executions (
  scope_id text NOT NULL,
  execution_id text NOT NULL,
  execution_input_digest text NOT NULL CHECK (execution_input_digest ~ '^sha256:[0-9a-f]{64}$'),
  reservation_id text NOT NULL,
  reserved_until_logical_ms bigint NOT NULL CHECK (reserved_until_logical_ms >= 0),
  receipt jsonb NULL CHECK (receipt IS NULL OR jsonb_typeof(receipt) = 'object'),
  receipt_digest text NULL CHECK (receipt_digest IS NULL OR receipt_digest ~ '^sha256:[0-9a-f]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (scope_id, execution_id),
  CHECK ((receipt IS NULL) = (receipt_digest IS NULL))
);

CREATE INDEX IF NOT EXISTS collective_host_assurance_reservation_expiry_idx
  ON __AGENTPLAT_SCHEMA__.collective_host_assurance_executions
    (scope_id, reserved_until_logical_ms)
  WHERE receipt IS NULL;

CREATE INDEX IF NOT EXISTS collective_host_assurance_completed_idx
  ON __AGENTPLAT_SCHEMA__.collective_host_assurance_executions
    (scope_id, updated_at DESC)
  WHERE receipt IS NOT NULL;
