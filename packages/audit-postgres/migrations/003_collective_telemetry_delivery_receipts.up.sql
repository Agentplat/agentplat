CREATE TABLE __AGENTPLAT_SCHEMA__.collective_telemetry_delivery_receipts (
  tenant_id text NOT NULL,
  stream_id text NOT NULL,
  delivery_digest text NOT NULL CHECK (delivery_digest ~ '^sha256:[0-9a-f]{64}$'),
  record_input_digest text NOT NULL CHECK (record_input_digest ~ '^sha256:[0-9a-f]{64}$'),
  event_digest text NOT NULL CHECK (event_digest ~ '^sha256:[0-9a-f]{64}$'),
  sequence bigint NOT NULL CHECK (sequence > 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, stream_id, delivery_digest),
  FOREIGN KEY (tenant_id, stream_id)
    REFERENCES __AGENTPLAT_SCHEMA__.collective_telemetry_states (tenant_id, stream_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, stream_id, sequence)
    REFERENCES __AGENTPLAT_SCHEMA__.collective_telemetry_events
      (tenant_id, stream_id, sequence)
    ON DELETE RESTRICT
);

CREATE INDEX collective_telemetry_delivery_receipts_capacity_idx
  ON __AGENTPLAT_SCHEMA__.collective_telemetry_delivery_receipts
    (tenant_id, created_at ASC);
