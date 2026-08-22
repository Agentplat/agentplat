CREATE TABLE __AGENTPLAT_SCHEMA__.agent_room_projection_checkpoints (
  projection_id text PRIMARY KEY,
  sequence bigint NOT NULL CHECK (sequence >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
