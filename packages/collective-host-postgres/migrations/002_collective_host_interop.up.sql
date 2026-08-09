CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_host_interop_idempotency (
  scope_id text NOT NULL,
  idempotency_key text NOT NULL,
  request_digest text NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  reservation_id text NOT NULL,
  reserved_until_logical_ms bigint NOT NULL CHECK (reserved_until_logical_ms >= 0),
  response jsonb NULL CHECK (response IS NULL OR jsonb_typeof(response) = 'object'),
  response_digest text NULL CHECK (response_digest IS NULL OR response_digest ~ '^sha256:[0-9a-f]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (scope_id, idempotency_key),
  CHECK ((response IS NULL) = (response_digest IS NULL))
);

CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_host_interop_sequence_heads (
  scope_id text NOT NULL,
  issuer_id text NOT NULL,
  session_id text NOT NULL,
  operation text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence >= 0),
  request_digest text NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (scope_id, issuer_id, session_id, operation)
);

CREATE INDEX IF NOT EXISTS collective_host_interop_reservation_expiry_idx
  ON __AGENTPLAT_SCHEMA__.collective_host_interop_idempotency
    (scope_id, reserved_until_logical_ms)
  WHERE response IS NULL;
