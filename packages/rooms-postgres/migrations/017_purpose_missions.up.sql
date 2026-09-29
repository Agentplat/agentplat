CREATE TABLE __AGENTPLAT_SCHEMA__.purpose_missions (
 tenant_id text NOT NULL,agent_id text NOT NULL,mission_id text NOT NULL,revision bigint NOT NULL CHECK(revision>=0),state jsonb NOT NULL,
 PRIMARY KEY(tenant_id,agent_id,mission_id),
 FOREIGN KEY(tenant_id,agent_id) REFERENCES __AGENTPLAT_SCHEMA__.agent_governance_heads(tenant_id,agent_id) ON DELETE RESTRICT
);
CREATE TABLE __AGENTPLAT_SCHEMA__.purpose_mission_plans (
 tenant_id text NOT NULL,agent_id text NOT NULL,plan_id text NOT NULL,mission_id text NOT NULL,
 PRIMARY KEY(tenant_id,agent_id,plan_id),
 FOREIGN KEY(tenant_id,agent_id,mission_id) REFERENCES __AGENTPLAT_SCHEMA__.purpose_missions(tenant_id,agent_id,mission_id) ON DELETE RESTRICT
);
CREATE TABLE __AGENTPLAT_SCHEMA__.purpose_mission_history (
 tenant_id text NOT NULL,agent_id text NOT NULL,mission_id text NOT NULL,revision bigint NOT NULL,state jsonb NOT NULL,
 PRIMARY KEY(tenant_id,agent_id,mission_id,revision),
 FOREIGN KEY(tenant_id,agent_id,mission_id) REFERENCES __AGENTPLAT_SCHEMA__.purpose_missions(tenant_id,agent_id,mission_id) ON DELETE RESTRICT
);
CREATE TRIGGER purpose_mission_history_immutable BEFORE UPDATE OR DELETE ON __AGENTPLAT_SCHEMA__.purpose_mission_history
 FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_agent_revision_mutation();
CREATE INDEX agent_execution_effects_run_idx ON __AGENTPLAT_SCHEMA__.agent_execution_effects(tenant_id,agent_id,((record->'effect')->>'runId'));
