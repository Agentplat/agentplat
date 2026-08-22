CREATE TABLE __AGENTPLAT_SCHEMA__.human_contributions (
  tenant_id text NOT NULL,
  room_id text NOT NULL,
  contribution_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  status text NOT NULL CHECK (status IN ('requested','assigned','in_progress','completed','canceled','expired')),
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, room_id, contribution_id),
  FOREIGN KEY (tenant_id, room_id) REFERENCES __AGENTPLAT_SCHEMA__.rooms (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE __AGENTPLAT_SCHEMA__.human_contribution_deliveries (
  tenant_id text NOT NULL,
  room_id text NOT NULL,
  delivery_id text NOT NULL,
  contribution_id text GENERATED ALWAYS AS (state->>'contributionId') STORED,
  revision bigint NOT NULL CHECK (revision >= 0),
  status text NOT NULL CHECK (status IN ('pending','processing','synchronized','failed')),
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, room_id, delivery_id),
  FOREIGN KEY (tenant_id, room_id, contribution_id) REFERENCES __AGENTPLAT_SCHEMA__.human_contributions (tenant_id, room_id, contribution_id) ON DELETE CASCADE
);

CREATE INDEX human_contribution_deliveries_queue_idx
  ON __AGENTPLAT_SCHEMA__.human_contribution_deliveries
  (tenant_id, status, (state->>'nextAttemptAt'));

CREATE INDEX human_contribution_deliveries_lease_idx
  ON __AGENTPLAT_SCHEMA__.human_contribution_deliveries
  (tenant_id, (state->>'leaseExpiresAt'))
  WHERE status = 'processing';
