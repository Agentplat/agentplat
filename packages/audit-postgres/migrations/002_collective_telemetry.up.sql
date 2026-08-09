CREATE TABLE __AGENTPLAT_SCHEMA__.collective_telemetry_states (
  tenant_id text NOT NULL,
  stream_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  sequence bigint NOT NULL CHECK (sequence >= 0),
  logical_time_high_water_ms bigint NOT NULL CHECK (logical_time_high_water_ms >= 0),
  state_digest text NOT NULL CHECK (state_digest ~ '^sha256:[0-9a-f]{64}$'),
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, stream_id)
);

CREATE TABLE __AGENTPLAT_SCHEMA__.collective_telemetry_events (
  tenant_id text NOT NULL,
  stream_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  event_id text NOT NULL,
  event_digest text NOT NULL CHECK (event_digest ~ '^sha256:[0-9a-f]{64}$'),
  event jsonb NOT NULL CHECK (jsonb_typeof(event) = 'object'),
  PRIMARY KEY (tenant_id, event_id),
  UNIQUE (tenant_id, stream_id, sequence)
);

CREATE INDEX collective_telemetry_states_updated_idx
  ON __AGENTPLAT_SCHEMA__.collective_telemetry_states (tenant_id, updated_at DESC);
CREATE INDEX collective_telemetry_events_stream_idx
  ON __AGENTPLAT_SCHEMA__.collective_telemetry_events (tenant_id, stream_id, sequence);

CREATE TRIGGER collective_telemetry_events_append_only_update
  BEFORE UPDATE ON __AGENTPLAT_SCHEMA__.collective_telemetry_events
  FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_audit_mutation();
CREATE TRIGGER collective_telemetry_events_append_only_delete
  BEFORE DELETE ON __AGENTPLAT_SCHEMA__.collective_telemetry_events
  FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_audit_mutation();
