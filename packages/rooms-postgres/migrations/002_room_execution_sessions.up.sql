CREATE TABLE __AGENTPLAT_SCHEMA__.room_execution_sessions (
  tenant_id text NOT NULL,
  room_id text NOT NULL,
  session_id text NOT NULL,
  run_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, room_id, session_id),
  FOREIGN KEY (tenant_id, room_id) REFERENCES __AGENTPLAT_SCHEMA__.rooms (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, run_id) REFERENCES __AGENTPLAT_SCHEMA__.runs (tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX room_execution_sessions_tenant_run_idx
  ON __AGENTPLAT_SCHEMA__.room_execution_sessions (tenant_id, run_id);
