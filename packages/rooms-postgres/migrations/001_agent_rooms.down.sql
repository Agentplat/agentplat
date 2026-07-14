BEGIN;

DROP TRIGGER IF EXISTS events_append_only_delete ON public.events;
DROP TRIGGER IF EXISTS events_append_only_update ON public.events;
DROP FUNCTION IF EXISTS public.agentplat_prevent_event_mutation();
DROP TABLE IF EXISTS public.events;
DROP TABLE IF EXISTS public.tool_calls;
DROP TABLE IF EXISTS public.context_snapshots;
DROP TABLE IF EXISTS public.runs;
DROP TABLE IF EXISTS public.memory_entries;
DROP TABLE IF EXISTS public.policies;
DROP TABLE IF EXISTS public.approvals;
DROP TRIGGER IF EXISTS artifact_versions_immutable_delete ON public.artifact_versions;
DROP TRIGGER IF EXISTS artifact_versions_immutable_update ON public.artifact_versions;
DROP FUNCTION IF EXISTS public.agentplat_prevent_artifact_version_mutation();
DROP TABLE IF EXISTS public.artifact_versions;
DROP TABLE IF EXISTS public.artifacts;
DROP TABLE IF EXISTS public.tasks;
DROP TABLE IF EXISTS public.messages;
DROP TABLE IF EXISTS public.room_participants;
DROP TABLE IF EXISTS public.participants;
DROP TABLE IF EXISTS public.rooms;
DELETE FROM public.agentplat_schema_migrations WHERE name = '001_agent_rooms';

COMMIT;
