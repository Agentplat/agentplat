DROP INDEX IF EXISTS __AGENTPLAT_SCHEMA__.mesh_outbox_dependency_idx;

ALTER TABLE __AGENTPLAT_SCHEMA__.mesh_outbox
  DROP CONSTRAINT IF EXISTS mesh_outbox_dependency_scope_fkey,
  DROP CONSTRAINT IF EXISTS mesh_outbox_dependency_not_self_check,
  DROP COLUMN IF EXISTS depends_on_effect_id;
