CREATE TABLE __AGENTPLAT_SCHEMA__.workflow_task_definitions (
  tenant_id text NOT NULL,
  task_definition_id text NOT NULL,
  task_definition_version text NOT NULL,
  definition_digest text NOT NULL,
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, task_definition_id, task_definition_version)
);

CREATE TABLE __AGENTPLAT_SCHEMA__.workflow_process_definitions (
  tenant_id text NOT NULL,
  process_id text NOT NULL,
  process_version text NOT NULL,
  definition_digest text NOT NULL,
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, process_id, process_version)
);

CREATE TABLE __AGENTPLAT_SCHEMA__.workflow_process_runs (
  tenant_id text NOT NULL,
  run_id text NOT NULL,
  process_id text NOT NULL,
  process_version text NOT NULL,
  definition_digest text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  state_digest text NOT NULL,
  status text NOT NULL CHECK (
    status IN ('pending', 'running', 'waiting', 'canceling', 'completed', 'failed', 'canceled')
  ),
  subject_type text,
  subject_id text,
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, run_id),
  FOREIGN KEY (tenant_id, process_id, process_version)
    REFERENCES __AGENTPLAT_SCHEMA__.workflow_process_definitions
      (tenant_id, process_id, process_version) ON DELETE RESTRICT,
  CHECK ((subject_type IS NULL) = (subject_id IS NULL))
);

CREATE INDEX workflow_process_runs_status_idx
  ON __AGENTPLAT_SCHEMA__.workflow_process_runs
  (tenant_id, status, updated_at, run_id);
CREATE INDEX workflow_process_runs_subject_idx
  ON __AGENTPLAT_SCHEMA__.workflow_process_runs
  (tenant_id, subject_type, subject_id, updated_at DESC)
  WHERE subject_type IS NOT NULL;

CREATE TABLE __AGENTPLAT_SCHEMA__.workflow_transition_events (
  tenant_id text NOT NULL,
  run_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  predecessor_state_digest text,
  state_digest text NOT NULL,
  status text NOT NULL,
  state jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, run_id, revision),
  FOREIGN KEY (tenant_id, run_id)
    REFERENCES __AGENTPLAT_SCHEMA__.workflow_process_runs
      (tenant_id, run_id) ON DELETE CASCADE
);

CREATE TABLE __AGENTPLAT_SCHEMA__.workflow_task_runs (
  tenant_id text NOT NULL,
  task_run_id text NOT NULL,
  process_run_id text NOT NULL,
  stage_id text NOT NULL,
  attempt integer NOT NULL CHECK (attempt > 0),
  revision bigint NOT NULL CHECK (revision >= 0),
  idempotency_key text NOT NULL,
  input_digest text NOT NULL,
  binding_digest text NOT NULL,
  lease_owner_id text NOT NULL,
  lease_token text NOT NULL,
  lease_generation bigint NOT NULL CHECK (lease_generation >= 0),
  lease_expires_at timestamptz NOT NULL,
  status text NOT NULL CHECK (
    status IN ('claimed', 'running', 'completed', 'failed', 'canceled', 'indeterminate')
  ),
  subject_type text,
  subject_id text,
  state_digest text NOT NULL,
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, task_run_id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, process_run_id)
    REFERENCES __AGENTPLAT_SCHEMA__.workflow_process_runs
      (tenant_id, run_id) ON DELETE CASCADE,
  CHECK ((subject_type IS NULL) = (subject_id IS NULL))
);

CREATE INDEX workflow_task_runs_process_idx
  ON __AGENTPLAT_SCHEMA__.workflow_task_runs
  (tenant_id, process_run_id, created_at, task_run_id);
CREATE INDEX workflow_task_runs_status_idx
  ON __AGENTPLAT_SCHEMA__.workflow_task_runs
  (tenant_id, status, updated_at, task_run_id);
CREATE INDEX workflow_task_runs_lease_idx
  ON __AGENTPLAT_SCHEMA__.workflow_task_runs
  (tenant_id, lease_expires_at, task_run_id)
  WHERE status IN ('claimed', 'running');
CREATE INDEX workflow_task_runs_subject_idx
  ON __AGENTPLAT_SCHEMA__.workflow_task_runs
  (tenant_id, subject_type, subject_id, updated_at DESC)
  WHERE subject_type IS NOT NULL;

CREATE TABLE __AGENTPLAT_SCHEMA__.workflow_operations (
  tenant_id text NOT NULL,
  operation_kind text NOT NULL CHECK (
    operation_kind IN ('start', 'signal', 'cancel', 'advance')
  ),
  idempotency_key text NOT NULL,
  request_digest text NOT NULL,
  run_id text NOT NULL,
  operation jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, operation_kind, idempotency_key),
  FOREIGN KEY (tenant_id, run_id)
    REFERENCES __AGENTPLAT_SCHEMA__.workflow_process_runs
      (tenant_id, run_id) ON DELETE CASCADE
);

CREATE TABLE __AGENTPLAT_SCHEMA__.workflow_signals (
  tenant_id text NOT NULL,
  run_id text NOT NULL,
  signal_id text NOT NULL,
  signal_type text NOT NULL,
  correlation_key text,
  signal_digest text NOT NULL,
  received_at timestamptz NOT NULL,
  signal jsonb NOT NULL,
  PRIMARY KEY (tenant_id, run_id, signal_id),
  FOREIGN KEY (tenant_id, run_id)
    REFERENCES __AGENTPLAT_SCHEMA__.workflow_process_runs
      (tenant_id, run_id) ON DELETE CASCADE
);

CREATE INDEX workflow_signals_delivery_idx
  ON __AGENTPLAT_SCHEMA__.workflow_signals
  (tenant_id, run_id, received_at, signal_id);

CREATE TABLE __AGENTPLAT_SCHEMA__.workflow_outcomes (
  tenant_id text NOT NULL,
  outcome_id text NOT NULL,
  task_run_id text NOT NULL,
  binding_digest text NOT NULL,
  outcome_type text NOT NULL,
  verdict text NOT NULL CHECK (
    verdict IN ('positive', 'negative', 'corrected', 'inconclusive')
  ),
  outcome_digest text NOT NULL,
  observed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  outcome jsonb NOT NULL,
  PRIMARY KEY (tenant_id, outcome_id),
  FOREIGN KEY (tenant_id, task_run_id)
    REFERENCES __AGENTPLAT_SCHEMA__.workflow_task_runs
      (tenant_id, task_run_id) ON DELETE RESTRICT
);

CREATE INDEX workflow_outcomes_task_idx
  ON __AGENTPLAT_SCHEMA__.workflow_outcomes
  (tenant_id, task_run_id, recorded_at, outcome_id);
CREATE INDEX workflow_outcomes_type_idx
  ON __AGENTPLAT_SCHEMA__.workflow_outcomes
  (tenant_id, outcome_type, recorded_at, outcome_id);
CREATE INDEX workflow_outcomes_binding_idx
  ON __AGENTPLAT_SCHEMA__.workflow_outcomes
  (tenant_id, binding_digest, observed_at DESC);

CREATE TABLE __AGENTPLAT_SCHEMA__.workflow_gate_requests (
  tenant_id text NOT NULL,
  run_id text NOT NULL,
  stage_id text NOT NULL,
  gate_request_id text NOT NULL,
  gate_type text NOT NULL,
  request_digest text NOT NULL,
  status text NOT NULL CHECK (
    status IN ('waiting', 'approved', 'rejected', 'expired', 'failed')
  ),
  request jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, gate_request_id),
  UNIQUE (tenant_id, run_id, stage_id),
  FOREIGN KEY (tenant_id, run_id)
    REFERENCES __AGENTPLAT_SCHEMA__.workflow_process_runs
      (tenant_id, run_id) ON DELETE CASCADE
);

CREATE TABLE __AGENTPLAT_SCHEMA__.workflow_outcome_expectations (
  tenant_id text NOT NULL,
  expectation_id text NOT NULL,
  expectation_digest text NOT NULL,
  expectation jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, expectation_id)
);

CREATE TABLE __AGENTPLAT_SCHEMA__.workflow_projection_checkpoints (
  tenant_id text NOT NULL,
  projection_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence >= 0),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, projection_id)
);
