DROP TRIGGER IF EXISTS session_events_append_only_delete ON __AGENTPLAT_SCHEMA__.session_events;
DROP TRIGGER IF EXISTS session_events_append_only_update ON __AGENTPLAT_SCHEMA__.session_events;
DROP TRIGGER IF EXISTS audit_records_append_only_delete ON __AGENTPLAT_SCHEMA__.audit_records;
DROP TRIGGER IF EXISTS audit_records_append_only_update ON __AGENTPLAT_SCHEMA__.audit_records;
DROP FUNCTION IF EXISTS __AGENTPLAT_SCHEMA__.agentplat_prevent_audit_mutation();
DROP TABLE IF EXISTS __AGENTPLAT_SCHEMA__.session_events;
DROP TABLE IF EXISTS __AGENTPLAT_SCHEMA__.audit_records;
