CREATE TABLE __AGENTPLAT_SCHEMA__.interop_governed_sessions (
  namespace text NOT NULL,
  record_key text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  record_digest text NOT NULL CHECK (record_digest ~ '^sha256:[0-9a-f]{64}$'),
  logical_time_high_water_ms bigint NOT NULL CHECK (logical_time_high_water_ms >= 0),
  record jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (namespace, record_key),
  CHECK (octet_length(namespace) BETWEEN 1 AND 128),
  CHECK (record_key ~ '^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$')
);

CREATE TABLE __AGENTPLAT_SCHEMA__.interop_outbound_sequence_heads (
  namespace text NOT NULL,
  issuer_id text NOT NULL,
  session_id text NOT NULL,
  current_sequence bigint NOT NULL CHECK (current_sequence >= 0),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (namespace, issuer_id, session_id),
  CHECK (octet_length(namespace) BETWEEN 1 AND 128),
  CHECK (issuer_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$'),
  CHECK (session_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$')
);

CREATE TABLE __AGENTPLAT_SCHEMA__.interop_outbound_sequence_allocations (
  namespace text NOT NULL,
  issuer_id text NOT NULL,
  session_id text NOT NULL,
  idempotency_key text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (namespace, issuer_id, session_id, idempotency_key),
  FOREIGN KEY (namespace, issuer_id, session_id)
    REFERENCES __AGENTPLAT_SCHEMA__.interop_outbound_sequence_heads
      (namespace, issuer_id, session_id)
    ON DELETE CASCADE,
  CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$')
);

CREATE UNIQUE INDEX interop_outbound_sequence_allocations_sequence_uidx
  ON __AGENTPLAT_SCHEMA__.interop_outbound_sequence_allocations
    (namespace, issuer_id, session_id, sequence);
