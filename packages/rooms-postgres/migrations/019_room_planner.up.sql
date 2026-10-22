CREATE TABLE __AGENTPLAT_SCHEMA__.room_planner_states (
  tenant_id text NOT NULL,
  room_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  state jsonb NOT NULL,
  PRIMARY KEY (tenant_id, room_id),
  FOREIGN KEY (tenant_id, room_id) REFERENCES __AGENTPLAT_SCHEMA__.rooms(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE __AGENTPLAT_SCHEMA__.room_planner_history (
  tenant_id text NOT NULL,
  room_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  state jsonb NOT NULL,
  PRIMARY KEY (tenant_id,room_id,revision),
  FOREIGN KEY (tenant_id,room_id) REFERENCES __AGENTPLAT_SCHEMA__.room_planner_states(tenant_id,room_id) ON DELETE CASCADE
);
CREATE TABLE __AGENTPLAT_SCHEMA__.room_planner_call_results (
  tenant_id text NOT NULL,
  room_id text NOT NULL,
  operation_id text NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY (tenant_id,room_id,operation_id),
  FOREIGN KEY (tenant_id,room_id) REFERENCES __AGENTPLAT_SCHEMA__.room_planner_states(tenant_id,room_id) ON DELETE CASCADE
);
