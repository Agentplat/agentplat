CREATE TABLE __AGENTPLAT_SCHEMA__.collective_telemetry_monotonic_anchors (
  tenant_id text NOT NULL,
  anchor_key text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  sequence bigint NOT NULL CHECK (sequence >= 0),
  state_digest text NOT NULL CHECK (state_digest ~ '^sha256:[0-9a-f]{64}$'),
  logical_time_high_water_ms bigint NOT NULL CHECK (logical_time_high_water_ms >= 0),
  previous_state_digest text NULL CHECK (
    previous_state_digest IS NULL OR
    previous_state_digest ~ '^sha256:[0-9a-f]{64}$'
  ),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, anchor_key),
  CHECK ((revision = 0) = (previous_state_digest IS NULL)),
  CHECK (revision = sequence)
);

CREATE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_enforce_telemetry_anchor_advance()
RETURNS trigger
LANGUAGE plpgsql
AS $agentplat$
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id OR
     NEW.anchor_key <> OLD.anchor_key OR
     NEW.revision <> OLD.revision + 1 OR
     NEW.sequence <> OLD.sequence + 1 OR
     NEW.previous_state_digest <> OLD.state_digest OR
     NEW.created_at <> OLD.created_at OR
     NEW.logical_time_high_water_ms < OLD.logical_time_high_water_ms THEN
    RAISE EXCEPTION 'collective telemetry monotonic anchor must advance exactly once';
  END IF;
  NEW.updated_at := transaction_timestamp();
  RETURN NEW;
END
$agentplat$;

CREATE TRIGGER collective_telemetry_monotonic_anchors_monotonic_update
  BEFORE UPDATE ON __AGENTPLAT_SCHEMA__.collective_telemetry_monotonic_anchors
  FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_enforce_telemetry_anchor_advance();
CREATE TRIGGER collective_telemetry_monotonic_anchors_append_only_delete
  BEFORE DELETE ON __AGENTPLAT_SCHEMA__.collective_telemetry_monotonic_anchors
  FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_audit_mutation();
