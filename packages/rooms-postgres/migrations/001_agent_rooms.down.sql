DROP TRIGGER IF EXISTS events_append_only_delete ON __AGENTPLAT_SCHEMA__.events;
DROP TRIGGER IF EXISTS events_append_only_update ON __AGENTPLAT_SCHEMA__.events;
DROP FUNCTION IF EXISTS __AGENTPLAT_SCHEMA__.agentplat_prevent_event_mutation();
DROP TABLE IF EXISTS __AGENTPLAT_SCHEMA__.events;
DROP TABLE IF EXISTS __AGENTPLAT_SCHEMA__.tool_calls;
DROP TABLE IF EXISTS __AGENTPLAT_SCHEMA__.context_snapshots;
DROP TABLE IF EXISTS __AGENTPLAT_SCHEMA__.runs;
DROP TABLE IF EXISTS __AGENTPLAT_SCHEMA__.memory_entries;
DROP TABLE IF EXISTS __AGENTPLAT_SCHEMA__.policies;
DROP TABLE IF EXISTS __AGENTPLAT_SCHEMA__.approvals;
DROP TRIGGER IF EXISTS artifact_versions_immutable_delete ON __AGENTPLAT_SCHEMA__.artifact_versions;
DROP TRIGGER IF EXISTS artifact_versions_immutable_update ON __AGENTPLAT_SCHEMA__.artifact_versions;
DROP FUNCTION IF EXISTS __AGENTPLAT_SCHEMA__.agentplat_prevent_artifact_version_mutation();
DROP TABLE IF EXISTS __AGENTPLAT_SCHEMA__.artifact_versions;
DROP TABLE IF EXISTS __AGENTPLAT_SCHEMA__.artifacts;
DROP TABLE IF EXISTS __AGENTPLAT_SCHEMA__.tasks;
DROP TABLE IF EXISTS __AGENTPLAT_SCHEMA__.messages;
DROP TABLE IF EXISTS __AGENTPLAT_SCHEMA__.room_participants;
DROP TABLE IF EXISTS __AGENTPLAT_SCHEMA__.participants;
DROP TABLE IF EXISTS __AGENTPLAT_SCHEMA__.rooms;

DO $agentplat$
BEGIN
  IF to_regclass('__AGENTPLAT_SCHEMA__.agentplat_schema_migrations') IS NOT NULL THEN
    DELETE FROM __AGENTPLAT_SCHEMA__.agentplat_schema_migrations
    WHERE name = '001_agent_rooms';
  END IF;
END
$agentplat$;
