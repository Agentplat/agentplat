CREATE TABLE __AGENTPLAT_SCHEMA__.room_plans (
  tenant_id text NOT NULL,
  room_id text NOT NULL,
  plan_id text NOT NULL,
  plan_version bigint NOT NULL CHECK (plan_version > 0),
  predecessor_plan_id text,
  revision bigint NOT NULL CHECK (revision >= 0),
  status text NOT NULL CHECK (status IN ('draft','materializing','active','waiting_for_human','completed','failed')),
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, room_id, plan_id),
  FOREIGN KEY (tenant_id, room_id) REFERENCES __AGENTPLAT_SCHEMA__.rooms (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, room_id, predecessor_plan_id) REFERENCES __AGENTPLAT_SCHEMA__.room_plans (tenant_id, room_id, plan_id) ON DELETE RESTRICT
);
