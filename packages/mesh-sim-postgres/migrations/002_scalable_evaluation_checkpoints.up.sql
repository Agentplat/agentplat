CREATE TABLE __AGENTPLAT_SCHEMA__.mesh_sim_scalable_evaluation_checkpoints (
  namespace text NOT NULL CHECK (char_length(namespace) BETWEEN 1 AND 128),
  run_id text NOT NULL CHECK (char_length(run_id) BETWEEN 1 AND 256),
  revision bigint NOT NULL CHECK (revision > 0),
  checkpoint_digest text NOT NULL CHECK (checkpoint_digest ~ '^sha256:[a-f0-9]{64}$'),
  previous_checkpoint_digest text CHECK (previous_checkpoint_digest ~ '^sha256:[a-f0-9]{64}$'),
  definition_digest text NOT NULL CHECK (definition_digest ~ '^sha256:[a-f0-9]{64}$'),
  adapter_descriptor_digest text NOT NULL CHECK (adapter_descriptor_digest ~ '^sha256:[a-f0-9]{64}$'),
  schedule_digest text NOT NULL CHECK (schedule_digest ~ '^sha256:[a-f0-9]{64}$'),
  ports_digest text NOT NULL CHECK (ports_digest ~ '^sha256:[a-f0-9]{64}$'),
  configuration_digest text NOT NULL CHECK (configuration_digest ~ '^sha256:[a-f0-9]{64}$'),
  checkpoint jsonb NOT NULL CHECK (jsonb_typeof(checkpoint) = 'object'),
  checkpoint_sha256 text NOT NULL CHECK (checkpoint_sha256 ~ '^[a-f0-9]{64}$'),
  checkpoint_bytes integer NOT NULL CHECK (checkpoint_bytes BETWEEN 1 AND 67108864),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK (
    (revision = 1 AND previous_checkpoint_digest IS NULL) OR
    (revision > 1 AND previous_checkpoint_digest IS NOT NULL)
  ),
  PRIMARY KEY (namespace, run_id)
);
