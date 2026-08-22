CREATE TABLE __AGENTPLAT_SCHEMA__.room_participant_membership (
  tenant_id text NOT NULL,
  room_id text NOT NULL,
  participant_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  status text NOT NULL CHECK (status IN ('invited','enabled','suspended','left')),
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, room_id, participant_id),
  FOREIGN KEY (tenant_id, room_id, participant_id) REFERENCES __AGENTPLAT_SCHEMA__.room_participants (tenant_id, room_id, participant_id) ON DELETE CASCADE
);
CREATE INDEX room_participant_membership_routing_idx
  ON __AGENTPLAT_SCHEMA__.room_participant_membership
  (tenant_id, room_id, status, ((state->>'routingEligible')));
