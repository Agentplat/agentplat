CREATE TABLE __AGENTPLAT_SCHEMA__.agent_room_operational_events (
  sequence bigserial PRIMARY KEY,
  tenant_id text NOT NULL,
  room_id text NOT NULL,
  source text NOT NULL,
  source_id text NOT NULL,
  source_revision bigint,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_room_operational_events_room_sequence_idx
  ON __AGENTPLAT_SCHEMA__.agent_room_operational_events
  (tenant_id, room_id, sequence);

CREATE OR REPLACE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_emit_room_operational_event()
RETURNS trigger AS $$
DECLARE
  source_name text;
  source_identifier text;
  source_rev bigint;
  event_name text;
  record_json jsonb;
BEGIN
  record_json := to_jsonb(NEW);
  source_name := TG_TABLE_NAME;
  source_identifier := CASE TG_TABLE_NAME
    WHEN 'events' THEN record_json->>'id'
    WHEN 'room_coordination_state' THEN record_json->>'coordination_id'
    WHEN 'room_execution_sessions' THEN record_json->>'session_id'
    WHEN 'room_handoffs' THEN record_json->>'handoff_id'
    WHEN 'room_plans' THEN record_json->>'plan_id'
    WHEN 'room_participant_membership' THEN record_json->>'participant_id'
    WHEN 'human_contributions' THEN record_json->>'contribution_id'
    WHEN 'human_contribution_deliveries' THEN record_json->>'delivery_id'
  END;
  source_rev := CASE
    WHEN TG_TABLE_NAME = 'events' THEN (record_json->>'sequence')::bigint
    ELSE (record_json->>'revision')::bigint
  END;
  event_name := CASE
    WHEN TG_TABLE_NAME = 'events' THEN record_json->>'type'
    ELSE COALESCE(record_json->>'status', record_json->'state'->>'status')
  END;
  INSERT INTO __AGENTPLAT_SCHEMA__.agent_room_operational_events
    (tenant_id, room_id, source, source_id, source_revision, event_type, payload, occurred_at)
  VALUES
    (record_json->>'tenant_id', record_json->>'room_id', source_name, source_identifier, source_rev,
     event_name, jsonb_build_object('operation', lower(TG_OP)), now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_operational_outbox
AFTER INSERT ON __AGENTPLAT_SCHEMA__.events
FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_emit_room_operational_event();
CREATE TRIGGER coordination_operational_outbox
AFTER INSERT OR UPDATE ON __AGENTPLAT_SCHEMA__.room_coordination_state
FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_emit_room_operational_event();
CREATE TRIGGER execution_sessions_operational_outbox
AFTER INSERT OR UPDATE ON __AGENTPLAT_SCHEMA__.room_execution_sessions
FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_emit_room_operational_event();
CREATE TRIGGER handoffs_operational_outbox
AFTER INSERT OR UPDATE ON __AGENTPLAT_SCHEMA__.room_handoffs
FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_emit_room_operational_event();
CREATE TRIGGER plans_operational_outbox
AFTER INSERT OR UPDATE ON __AGENTPLAT_SCHEMA__.room_plans
FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_emit_room_operational_event();
CREATE TRIGGER memberships_operational_outbox
AFTER INSERT OR UPDATE ON __AGENTPLAT_SCHEMA__.room_participant_membership
FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_emit_room_operational_event();
CREATE TRIGGER contributions_operational_outbox
AFTER INSERT OR UPDATE ON __AGENTPLAT_SCHEMA__.human_contributions
FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_emit_room_operational_event();
CREATE TRIGGER deliveries_operational_outbox
AFTER INSERT OR UPDATE ON __AGENTPLAT_SCHEMA__.human_contribution_deliveries
FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_emit_room_operational_event();
