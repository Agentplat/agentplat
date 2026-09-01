CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.morphogenesis_budget_reservations (
  scope_id text NOT NULL,
  scope_digest text NOT NULL CHECK (scope_digest ~ '^sha256:[0-9a-f]{64}$'),
  reservation_id text NOT NULL,
  request_digest text NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  proposal_digest text NOT NULL CHECK (proposal_digest ~ '^sha256:[0-9a-f]{64}$'),
  expires_at_logical_ms bigint NOT NULL CHECK (expires_at_logical_ms >= 0),
  status text NOT NULL CHECK (status IN ('reserved', 'released', 'expired')),
  revision bigint NOT NULL CHECK (revision IN (0, 1)),
  reservation_digest text NOT NULL CHECK (reservation_digest ~ '^sha256:[0-9a-f]{64}$'),
  reservation jsonb NOT NULL CHECK (jsonb_typeof(reservation) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (scope_id, reservation_id),
  UNIQUE (scope_id, request_digest)
);

CREATE INDEX IF NOT EXISTS morphogenesis_budget_active_idx
  ON __AGENTPLAT_SCHEMA__.morphogenesis_budget_reservations
    (scope_id, expires_at_logical_ms, reservation_id)
  WHERE status = 'reserved';
