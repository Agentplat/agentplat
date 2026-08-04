ALTER TABLE __AGENTPLAT_SCHEMA__.mesh_outbox
  ADD COLUMN depends_on_effect_id text;

ALTER TABLE __AGENTPLAT_SCHEMA__.mesh_outbox
  ADD CONSTRAINT mesh_outbox_dependency_not_self_check
  CHECK (
    depends_on_effect_id IS NULL
    OR depends_on_effect_id <> effect_id
  );

ALTER TABLE __AGENTPLAT_SCHEMA__.mesh_outbox
  ADD CONSTRAINT mesh_outbox_dependency_scope_fkey
  FOREIGN KEY (
    tenant_id,
    mesh_id,
    peer_id,
    instance_id,
    depends_on_effect_id
  )
  REFERENCES __AGENTPLAT_SCHEMA__.mesh_outbox (
    tenant_id,
    mesh_id,
    peer_id,
    instance_id,
    effect_id
  )
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX mesh_outbox_dependency_idx
  ON __AGENTPLAT_SCHEMA__.mesh_outbox
  (tenant_id, mesh_id, peer_id, instance_id, depends_on_effect_id)
  WHERE depends_on_effect_id IS NOT NULL;
