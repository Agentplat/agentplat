CREATE TABLE __AGENTPLAT_SCHEMA__.mesh_sim_artifact_blobs (
  namespace text NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (namespace, content_sha256)
);
CREATE TABLE __AGENTPLAT_SCHEMA__.mesh_sim_artifact_bindings (
  namespace text NOT NULL,
  artifact_id text NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  binding bytea NOT NULL,
  binding_sha256 text NOT NULL CHECK (binding_sha256 ~ '^[a-f0-9]{64}$'),
  operation_expires_at_ms bigint CHECK (operation_expires_at_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (namespace, artifact_id),
  FOREIGN KEY (namespace, content_sha256) REFERENCES __AGENTPLAT_SCHEMA__.mesh_sim_artifact_blobs(namespace, content_sha256)
);
CREATE TABLE __AGENTPLAT_SCHEMA__.mesh_sim_execution_states (
  namespace text NOT NULL,
  execution_id text NOT NULL,
  registration_digest text NOT NULL,
  execution_digest text NOT NULL,
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  state_sha256 text NOT NULL CHECK (state_sha256 ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (namespace, execution_id)
);
CREATE TABLE __AGENTPLAT_SCHEMA__.mesh_sim_slot_commits (
  namespace text NOT NULL,
  run_key text NOT NULL,
  execution_id text NOT NULL,
  registration_digest text NOT NULL CHECK (registration_digest ~ '^sha256:[a-f0-9]{64}$'),
  cell_id text NOT NULL,
  fence_worker_id text NOT NULL,
  fence_lease_token text NOT NULL,
  fence_generation bigint NOT NULL CHECK (fence_generation > 0),
  fence_expires_at_ms bigint NOT NULL CHECK (fence_expires_at_ms >= 0),
  operation_expires_at_ms bigint CHECK (operation_expires_at_ms >= 0),
  execution jsonb NOT NULL CHECK (jsonb_typeof(execution) = 'object'),
  execution_sha256 text NOT NULL CHECK (execution_sha256 ~ '^[a-f0-9]{64}$'),
  committed_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (namespace, run_key),
  FOREIGN KEY (namespace, execution_id) REFERENCES __AGENTPLAT_SCHEMA__.mesh_sim_execution_states(namespace, execution_id)
);
