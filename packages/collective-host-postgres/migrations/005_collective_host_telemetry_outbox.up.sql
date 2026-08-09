CREATE TABLE IF NOT EXISTS __AGENTPLAT_SCHEMA__.collective_host_telemetry_outbox (
  scope_id text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('autonomous_node', 'assurance_execution')),
  source_id text NOT NULL,
  source_sequence bigint NOT NULL CHECK
    (source_sequence BETWEEN 1 AND 9007199254740991),
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  delivery_digest text NOT NULL CHECK (delivery_digest ~ '^sha256:[0-9a-f]{64}$'),
  delivery_state text NOT NULL CHECK (delivery_state IN ('pending', 'recorded')),
  envelope jsonb NOT NULL CHECK (jsonb_typeof(envelope) = 'object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (scope_id, delivery_digest),
  UNIQUE (scope_id, source_kind, source_id, source_sequence, ordinal),
  CHECK (source_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/+=-]{0,255}$'),
  CHECK (source_kind <> 'autonomous_node' OR ordinal = 0),
  CHECK (source_kind <> 'assurance_execution' OR
    (source_sequence = 1 AND ordinal <= 1))
);

CREATE INDEX IF NOT EXISTS collective_host_telemetry_outbox_pending_idx
  ON __AGENTPLAT_SCHEMA__.collective_host_telemetry_outbox
    (scope_id, source_kind COLLATE "C", source_id COLLATE "C",
     source_sequence, ordinal, delivery_digest COLLATE "C");
