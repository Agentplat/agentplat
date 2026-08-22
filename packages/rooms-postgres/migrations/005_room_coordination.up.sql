CREATE TABLE __AGENTPLAT_SCHEMA__.room_coordination_state (
  tenant_id text NOT NULL,
  room_id text NOT NULL,
  coordination_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  status text NOT NULL CHECK (status IN ('idle','routing','executing','waiting_for_human','completed','failed')),
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, room_id, coordination_id),
  FOREIGN KEY (tenant_id, room_id) REFERENCES __AGENTPLAT_SCHEMA__.rooms (tenant_id, id) ON DELETE CASCADE
);
