CREATE TABLE __AGENTPLAT_SCHEMA__.mesh_peer_snapshots (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  instance_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  state jsonb NOT NULL,
  state_digest text NOT NULL CHECK (state_digest ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  committed_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, instance_id)
);

CREATE TABLE __AGENTPLAT_SCHEMA__.mesh_inbox (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  instance_id text NOT NULL,
  message_id text NOT NULL,
  envelope jsonb NOT NULL CHECK (jsonb_typeof(envelope) = 'object'),
  envelope_digest text NOT NULL CHECK (envelope_digest ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'applied', 'rejected')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  received_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  available_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  claim_worker_id text,
  claim_token text,
  claim_generation bigint NOT NULL DEFAULT 0 CHECK (claim_generation >= 0),
  claim_expires_at timestamptz,
  settled_at timestamptz,
  reason_code text,
  PRIMARY KEY (tenant_id, mesh_id, peer_id, instance_id, message_id),
  CHECK (
    (status = 'processing' AND claim_worker_id IS NOT NULL AND claim_token IS NOT NULL AND claim_expires_at IS NOT NULL)
    OR
    (status <> 'processing' AND claim_worker_id IS NULL AND claim_token IS NULL AND claim_expires_at IS NULL)
  )
);

CREATE INDEX mesh_inbox_claim_idx
  ON __AGENTPLAT_SCHEMA__.mesh_inbox
  (tenant_id, mesh_id, peer_id, instance_id, status, available_at, claim_expires_at, received_at);

CREATE TABLE __AGENTPLAT_SCHEMA__.mesh_journal (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  instance_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  entry_id text NOT NULL,
  previous_digest text NOT NULL CHECK (previous_digest ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  digest text NOT NULL CHECK (digest ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  transition_id text NOT NULL,
  inbox_message_id text,
  snapshot_revision bigint NOT NULL CHECK (snapshot_revision >= 0),
  snapshot_digest text NOT NULL CHECK (snapshot_digest ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  kind text NOT NULL,
  reason_code text,
  occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, instance_id, sequence),
  UNIQUE (tenant_id, mesh_id, peer_id, instance_id, entry_id),
  UNIQUE (tenant_id, mesh_id, peer_id, instance_id, digest)
);

CREATE INDEX mesh_journal_transition_idx
  ON __AGENTPLAT_SCHEMA__.mesh_journal
  (tenant_id, mesh_id, peer_id, instance_id, transition_id);

CREATE TABLE __AGENTPLAT_SCHEMA__.mesh_outbox (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  instance_id text NOT NULL,
  effect_id text NOT NULL,
  message_id text NOT NULL,
  target_peer_id text,
  envelope jsonb NOT NULL CHECK (jsonb_typeof(envelope) = 'object'),
  envelope_digest text NOT NULL CHECK (envelope_digest ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivering', 'delivered', 'rejected')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  claim_worker_id text,
  claim_token text,
  claim_generation bigint NOT NULL DEFAULT 0 CHECK (claim_generation >= 0),
  claim_expires_at timestamptz,
  settled_at timestamptz,
  reason_code text,
  PRIMARY KEY (tenant_id, mesh_id, peer_id, instance_id, effect_id),
  UNIQUE (tenant_id, mesh_id, peer_id, instance_id, message_id),
  CHECK (
    (status = 'delivering' AND claim_worker_id IS NOT NULL AND claim_token IS NOT NULL AND claim_expires_at IS NOT NULL)
    OR
    (status <> 'delivering' AND claim_worker_id IS NULL AND claim_token IS NULL AND claim_expires_at IS NULL)
  )
);

CREATE INDEX mesh_outbox_claim_idx
  ON __AGENTPLAT_SCHEMA__.mesh_outbox
  (tenant_id, mesh_id, peer_id, instance_id, status, available_at, claim_expires_at, created_at);

CREATE TABLE __AGENTPLAT_SCHEMA__.mesh_journal_anchors (
  tenant_id text NOT NULL,
  mesh_id text NOT NULL,
  peer_id text NOT NULL,
  instance_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence >= 0),
  digest text NOT NULL CHECK (digest ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  snapshot_revision bigint NOT NULL CHECK (snapshot_revision >= 0),
  snapshot_digest text NOT NULL CHECK (snapshot_digest ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, mesh_id, peer_id, instance_id)
);
