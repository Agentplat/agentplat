ALTER TABLE __AGENTPLAT_SCHEMA__.collective_host_assurance_executions
  DROP CONSTRAINT IF EXISTS collective_host_assurance_effect_checkpoint_pair,
  DROP COLUMN IF EXISTS effect_checkpoint_digest,
  DROP COLUMN IF EXISTS effect_checkpoint;
