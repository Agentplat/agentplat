DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM __AGENTPLAT_SCHEMA__.agent_governance_heads WHERE state->'configuration'->'origin' IS NOT NULL) THEN
  RAISE EXCEPTION 'continuity migration cannot roll back while governed origins exist';
 END IF;
END $$;
DROP TABLE __AGENTPLAT_SCHEMA__.agent_continuity_operations;
DROP TABLE __AGENTPLAT_SCHEMA__.agent_continuity;
