CREATE TABLE __AGENTPLAT_SCHEMA__.agent_continuity (
 tenant_id text NOT NULL,continuity_id text NOT NULL,parent_agent_id text NOT NULL,child_agent_id text NOT NULL,revision bigint NOT NULL,record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,continuity_id),
 FOREIGN KEY(tenant_id,parent_agent_id) REFERENCES __AGENTPLAT_SCHEMA__.agent_governance_heads(tenant_id,agent_id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,child_agent_id) REFERENCES __AGENTPLAT_SCHEMA__.agent_governance_heads(tenant_id,agent_id) ON DELETE RESTRICT
);
CREATE TABLE __AGENTPLAT_SCHEMA__.agent_continuity_operations (
 tenant_id text NOT NULL,continuity_id text NOT NULL,operation_id text NOT NULL,revision bigint NOT NULL,record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,continuity_id,operation_id),UNIQUE(tenant_id,continuity_id,revision),
 FOREIGN KEY(tenant_id,continuity_id) REFERENCES __AGENTPLAT_SCHEMA__.agent_continuity(tenant_id,continuity_id) ON DELETE RESTRICT
);
CREATE TRIGGER agent_continuity_history_immutable BEFORE UPDATE OR DELETE ON __AGENTPLAT_SCHEMA__.agent_continuity_operations
 FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_agent_revision_mutation();
