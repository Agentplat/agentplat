CREATE TABLE __AGENTPLAT_SCHEMA__.mesh_planning_recovery_states (
  tenant_id text NOT NULL,
  policy_domain_id text NOT NULL,
  mission_id text NOT NULL,
  intent_revision bigint NOT NULL CHECK (intent_revision >= 1),
  intent_digest text NOT NULL CHECK (intent_digest ~ '^sha256:[0-9a-f]{64}$'),
  policy_digest text NOT NULL CHECK (policy_digest ~ '^sha256:[0-9a-f]{64}$'),
  peer_id text NOT NULL,
  peer_instance_id text NOT NULL,
  generation bigint NOT NULL CHECK (generation >= 1),
  high_water_logical_ms bigint NOT NULL CHECK (high_water_logical_ms >= 0),
  plan_revision_high_water bigint NOT NULL CHECK (plan_revision_high_water >= 0),
  fragment_revision_high_water bigint NOT NULL CHECK (fragment_revision_high_water >= 0),
  budget_reservation_high_water bigint NOT NULL CHECK (budget_reservation_high_water >= 0),
  replay_sequence_high_water bigint NOT NULL CHECK (replay_sequence_high_water >= 0),
  assignment_epoch_high_water bigint NOT NULL CHECK (assignment_epoch_high_water >= 0),
  revocation_high_water bigint NOT NULL CHECK (revocation_high_water >= 0),
  state_digest text NOT NULL CHECK (state_digest ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  planning_snapshot jsonb NOT NULL,
  recovery_state jsonb NOT NULL,
  event_head_sequence bigint NOT NULL DEFAULT 0 CHECK (event_head_sequence >= 0),
  event_head_digest text NOT NULL CHECK (event_head_digest ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, policy_domain_id, mission_id, intent_revision, intent_digest, policy_digest, peer_id, peer_instance_id),
  CHECK (jsonb_typeof(planning_snapshot) = 'object'),
  CHECK (jsonb_typeof(recovery_state) = 'object')
);

CREATE TABLE __AGENTPLAT_SCHEMA__.mesh_planning_recovery_events (
  tenant_id text NOT NULL,
  policy_domain_id text NOT NULL,
  mission_id text NOT NULL,
  intent_revision bigint NOT NULL CHECK (intent_revision >= 1),
  intent_digest text NOT NULL CHECK (intent_digest ~ '^sha256:[0-9a-f]{64}$'),
  policy_digest text NOT NULL CHECK (policy_digest ~ '^sha256:[0-9a-f]{64}$'),
  peer_id text NOT NULL,
  peer_instance_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence >= 1),
  event_id text NOT NULL,
  previous_digest text NOT NULL CHECK (previous_digest ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  digest text NOT NULL CHECK (digest ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  state_generation bigint NOT NULL CHECK (state_generation >= 1),
  state_digest text NOT NULL CHECK (state_digest ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  logical_time_ms bigint NOT NULL CHECK (logical_time_ms >= 0),
  kind text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, policy_domain_id, mission_id, intent_revision, intent_digest, policy_digest, peer_id, peer_instance_id, sequence),
  UNIQUE (tenant_id, policy_domain_id, mission_id, intent_revision, intent_digest, policy_digest, peer_id, peer_instance_id, event_id),
  UNIQUE (tenant_id, policy_domain_id, mission_id, intent_revision, intent_digest, policy_digest, peer_id, peer_instance_id, digest),
  CHECK (jsonb_typeof(payload) IN ('object', 'array', 'string', 'number', 'boolean', 'null'))
);

CREATE INDEX mesh_planning_recovery_events_logical_time_idx
  ON __AGENTPLAT_SCHEMA__.mesh_planning_recovery_events
  (tenant_id, policy_domain_id, mission_id, intent_revision, intent_digest, policy_digest, peer_id, peer_instance_id, logical_time_ms, sequence);
