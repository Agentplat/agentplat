CREATE TABLE __AGENTPLAT_SCHEMA__.interop_idempotency_records (
  namespace text NOT NULL,
  idempotency_key text NOT NULL,
  request_digest text NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  reservation_id text NOT NULL,
  reserved_until_logical_ms bigint NOT NULL CHECK (reserved_until_logical_ms >= 0),
  response jsonb NULL CHECK (response IS NULL OR jsonb_typeof(response) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (namespace, idempotency_key),
  CHECK (octet_length(namespace) BETWEEN 1 AND 128),
  CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$'),
  CHECK (reservation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$')
);

CREATE TABLE __AGENTPLAT_SCHEMA__.interop_inbound_sequence_heads (
  namespace text NOT NULL,
  issuer_id text NOT NULL,
  session_id text NOT NULL,
  operation text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  request_digest text NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (namespace, issuer_id, session_id, operation),
  CHECK (octet_length(namespace) BETWEEN 1 AND 128),
  CHECK (issuer_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$'),
  CHECK (session_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$'),
  CHECK (operation ~ '^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$')
);

CREATE TABLE __AGENTPLAT_SCHEMA__.interop_cognitive_sessions (
  namespace text NOT NULL,
  tenant_id text NOT NULL,
  session_id text NOT NULL,
  agent_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  state_digest text NOT NULL CHECK (state_digest ~ '^sha256:[0-9a-f]{64}$'),
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (namespace, session_id),
  UNIQUE (namespace, tenant_id, session_id),
  CHECK (octet_length(namespace) BETWEEN 1 AND 128)
);

CREATE TABLE __AGENTPLAT_SCHEMA__.interop_cognitive_operations (
  namespace text NOT NULL,
  tenant_id text NOT NULL,
  session_id text NOT NULL,
  operation_id text NOT NULL,
  expected_session_revision bigint NOT NULL CHECK (expected_session_revision >= 0),
  status text NOT NULL CHECK (status IN ('prepared', 'applied')),
  journal_revision smallint NOT NULL CHECK (journal_revision IN (0, 1)),
  record_digest text NOT NULL CHECK (record_digest ~ '^sha256:[0-9a-f]{64}$'),
  operation jsonb NOT NULL CHECK (jsonb_typeof(operation) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (namespace, tenant_id, session_id, operation_id),
  UNIQUE (namespace, tenant_id, session_id, expected_session_revision),
  FOREIGN KEY (namespace, tenant_id, session_id)
    REFERENCES __AGENTPLAT_SCHEMA__.interop_cognitive_sessions (namespace, tenant_id, session_id),
  CHECK ((status = 'prepared' AND journal_revision = 0) OR (status = 'applied' AND journal_revision = 1))
);
