CREATE TABLE __AGENTPLAT_SCHEMA__.room_handoffs (
  tenant_id text NOT NULL,
  room_id text NOT NULL,
  handoff_id text NOT NULL,
  predecessor_handoff_id text,
  source_run_id text NOT NULL,
  target_run_id text,
  revision bigint NOT NULL CHECK (revision >= 0),
  status text NOT NULL CHECK (status IN ('proposed','accepted','rejected','running','completed','failed')),
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, room_id, handoff_id),
  FOREIGN KEY (tenant_id, room_id) REFERENCES __AGENTPLAT_SCHEMA__.rooms (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, source_run_id) REFERENCES __AGENTPLAT_SCHEMA__.runs (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, target_run_id) REFERENCES __AGENTPLAT_SCHEMA__.runs (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, room_id, predecessor_handoff_id) REFERENCES __AGENTPLAT_SCHEMA__.room_handoffs (tenant_id, room_id, handoff_id) ON DELETE RESTRICT
);

CREATE INDEX room_handoffs_tenant_room_status_idx
  ON __AGENTPLAT_SCHEMA__.room_handoffs (tenant_id, room_id, status, updated_at);
