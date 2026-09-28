DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM __AGENTPLAT_SCHEMA__.agent_governance_heads WHERE state->'executionAdmission'->>'purposeControlDigest' IS NOT NULL)
 OR EXISTS (SELECT 1 FROM __AGENTPLAT_SCHEMA__.agent_governance_operations WHERE operation->'result'->'executionAdmission'->>'purposeControlDigest' IS NOT NULL) THEN
  RAISE EXCEPTION 'purpose migration cannot roll back with purpose activation history';
 END IF;
END $$;
DROP INDEX __AGENTPLAT_SCHEMA__.agent_execution_effects_run_idx;
DROP TABLE __AGENTPLAT_SCHEMA__.purpose_mission_history;
DROP TABLE __AGENTPLAT_SCHEMA__.purpose_mission_plans;
DROP TABLE __AGENTPLAT_SCHEMA__.purpose_missions;
