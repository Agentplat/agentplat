ALTER TABLE __AGENTPLAT_SCHEMA__.approvals
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN expired_by text,
  ADD COLUMN expired_at timestamptz;

ALTER TABLE __AGENTPLAT_SCHEMA__.approvals
  DROP CONSTRAINT approvals_status_check;
ALTER TABLE __AGENTPLAT_SCHEMA__.approvals
  ADD CONSTRAINT approvals_status_check
  CHECK (status IN ('requested', 'approved', 'rejected', 'needs_revision', 'expired'));
ALTER TABLE __AGENTPLAT_SCHEMA__.approvals
  ADD CONSTRAINT approvals_expired_state_check
  CHECK ((status = 'expired') = (expired_at IS NOT NULL));

CREATE INDEX approvals_requested_expiry_idx
  ON __AGENTPLAT_SCHEMA__.approvals
  (tenant_id, expires_at, room_id, id)
  WHERE status = 'requested' AND expires_at IS NOT NULL;

CREATE OR REPLACE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_emit_room_operational_event()
RETURNS trigger AS $$
DECLARE
  source_name text;
  source_identifier text;
  source_rev bigint;
  event_name text;
  event_payload jsonb;
  event_time timestamptz;
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
  event_payload := CASE
    WHEN TG_TABLE_NAME = 'events'
      THEN COALESCE(record_json->'payload', '{}'::jsonb)
        || jsonb_build_object('operation', lower(TG_OP))
    ELSE jsonb_build_object('operation', lower(TG_OP))
  END;
  event_time := CASE
    WHEN TG_TABLE_NAME = 'events'
      THEN COALESCE((record_json->>'occurred_at')::timestamptz, now())
    ELSE now()
  END;
  INSERT INTO __AGENTPLAT_SCHEMA__.agent_room_operational_events
    (tenant_id, room_id, source, source_id, source_revision, event_type, payload, occurred_at)
  VALUES
    (record_json->>'tenant_id', record_json->>'room_id', source_name, source_identifier,
     source_rev, event_name, event_payload, event_time);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
