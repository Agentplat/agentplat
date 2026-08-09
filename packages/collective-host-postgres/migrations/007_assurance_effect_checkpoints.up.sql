ALTER TABLE __AGENTPLAT_SCHEMA__.collective_host_assurance_executions
  ADD COLUMN IF NOT EXISTS effect_checkpoint jsonb NULL
    CHECK (effect_checkpoint IS NULL OR jsonb_typeof(effect_checkpoint) = 'object'),
  ADD COLUMN IF NOT EXISTS effect_checkpoint_digest text NULL
    CHECK (effect_checkpoint_digest IS NULL OR effect_checkpoint_digest ~ '^sha256:[0-9a-f]{64}$');

ALTER TABLE __AGENTPLAT_SCHEMA__.collective_host_assurance_executions
  ADD CONSTRAINT collective_host_assurance_effect_checkpoint_pair
  CHECK ((effect_checkpoint IS NULL) = (effect_checkpoint_digest IS NULL));
