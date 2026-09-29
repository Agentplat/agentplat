DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM __AGENTPLAT_SCHEMA__.agent_governance_heads WHERE state->>'status' <> 'suspended')
     OR EXISTS (SELECT 1 FROM __AGENTPLAT_SCHEMA__.agent_governance_operations WHERE operation->'result'->>'status' <> 'suspended') THEN
    RAISE EXCEPTION 'execution migration cannot roll back with activation history; preserve or export governed state first';
  END IF;
END $$;
DROP TABLE __AGENTPLAT_SCHEMA__.agent_execution_effects;
DROP TABLE __AGENTPLAT_SCHEMA__.agent_governed_task_bindings;
DROP TABLE __AGENTPLAT_SCHEMA__.agent_execution_budgets;
DROP TABLE __AGENTPLAT_SCHEMA__.agent_execution_limits;
ALTER TABLE __AGENTPLAT_SCHEMA__.agent_governance_heads DROP CONSTRAINT governance_execution_status_v1;
ALTER TABLE __AGENTPLAT_SCHEMA__.agent_governance_heads ADD CONSTRAINT governance_suspended_status_v1 CHECK (state->>'status' = 'suspended');
