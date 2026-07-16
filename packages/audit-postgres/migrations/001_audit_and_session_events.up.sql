CREATE TABLE __AGENTPLAT_SCHEMA__.audit_records (
  tenant_id text NOT NULL,
  id text NOT NULL,
  actor_id text,
  actor_type text CHECK (actor_type IS NULL OR actor_type IN ('human', 'machine', 'system')),
  action text NOT NULL,
  resource jsonb NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX audit_records_tenant_created_idx
  ON __AGENTPLAT_SCHEMA__.audit_records (tenant_id, created_at DESC, id);
CREATE INDEX audit_records_tenant_action_idx
  ON __AGENTPLAT_SCHEMA__.audit_records (tenant_id, action, created_at DESC);

CREATE TABLE __AGENTPLAT_SCHEMA__.session_events (
  tenant_id text NOT NULL,
  session_id text NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  event_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  event jsonb NOT NULL,
  PRIMARY KEY (tenant_id, event_id),
  UNIQUE (tenant_id, session_id, sequence)
);

CREATE INDEX session_events_tenant_session_idx
  ON __AGENTPLAT_SCHEMA__.session_events (tenant_id, session_id, sequence);
CREATE INDEX session_events_tenant_occurred_idx
  ON __AGENTPLAT_SCHEMA__.session_events (tenant_id, occurred_at DESC);

CREATE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AgentPlat audit and session events are append-only';
END;
$$;

CREATE TRIGGER audit_records_append_only_update
  BEFORE UPDATE ON __AGENTPLAT_SCHEMA__.audit_records
  FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_audit_mutation();
CREATE TRIGGER audit_records_append_only_delete
  BEFORE DELETE ON __AGENTPLAT_SCHEMA__.audit_records
  FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_audit_mutation();
CREATE TRIGGER session_events_append_only_update
  BEFORE UPDATE ON __AGENTPLAT_SCHEMA__.session_events
  FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_audit_mutation();
CREATE TRIGGER session_events_append_only_delete
  BEFORE DELETE ON __AGENTPLAT_SCHEMA__.session_events
  FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_audit_mutation();
