CREATE TABLE __AGENTPLAT_SCHEMA__.rooms (
  tenant_id text NOT NULL,
  id text NOT NULL,
  parent_room_id text,
  title text NOT NULL,
  goal text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  completed_at timestamptz,
  archived_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, parent_room_id) REFERENCES __AGENTPLAT_SCHEMA__.rooms (tenant_id, id) ON DELETE RESTRICT,
  CHECK (parent_room_id IS NULL OR parent_room_id <> id)
);

CREATE INDEX rooms_tenant_status_idx
  ON __AGENTPLAT_SCHEMA__.rooms (tenant_id, status, updated_at DESC);
CREATE INDEX rooms_tenant_parent_idx
  ON __AGENTPLAT_SCHEMA__.rooms (tenant_id, parent_room_id) WHERE parent_room_id IS NOT NULL;

CREATE TABLE __AGENTPLAT_SCHEMA__.participants (
  tenant_id text NOT NULL,
  id text NOT NULL,
  type text NOT NULL CHECK (type IN ('human', 'agent')),
  display_name text NOT NULL,
  role text NOT NULL,
  authority_level integer NOT NULL CHECK (authority_level >= 0),
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  boundaries jsonb NOT NULL DEFAULT '[]'::jsonb,
  memory_scope text CHECK (
    memory_scope IS NULL OR
    memory_scope IN ('ephemeral', 'agent', 'role', 'room', 'artifact', 'organization')
  ),
  runtime jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE __AGENTPLAT_SCHEMA__.room_participants (
  tenant_id text NOT NULL,
  room_id text NOT NULL,
  participant_id text NOT NULL,
  joined_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, room_id, participant_id),
  FOREIGN KEY (tenant_id, room_id) REFERENCES __AGENTPLAT_SCHEMA__.rooms (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, participant_id) REFERENCES __AGENTPLAT_SCHEMA__.participants (tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX room_participants_tenant_participant_idx
  ON __AGENTPLAT_SCHEMA__.room_participants (tenant_id, participant_id, room_id);

CREATE TABLE __AGENTPLAT_SCHEMA__.messages (
  tenant_id text NOT NULL,
  id text NOT NULL,
  room_id text NOT NULL,
  author_participant_id text,
  role text NOT NULL CHECK (role IN ('human', 'agent', 'system', 'tool')),
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, room_id) REFERENCES __AGENTPLAT_SCHEMA__.rooms (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, room_id, author_participant_id)
    REFERENCES __AGENTPLAT_SCHEMA__.room_participants (tenant_id, room_id, participant_id) ON DELETE RESTRICT
);

CREATE INDEX messages_tenant_room_created_idx
  ON __AGENTPLAT_SCHEMA__.messages (tenant_id, room_id, created_at, id);

CREATE TABLE __AGENTPLAT_SCHEMA__.tasks (
  tenant_id text NOT NULL,
  id text NOT NULL,
  room_id text NOT NULL,
  step_id text NOT NULL,
  assigned_participant_id text,
  assigned_role text,
  instruction text NOT NULL,
  expected_output text NOT NULL,
  expected_artifact_kind text NOT NULL,
  dependencies jsonb NOT NULL DEFAULT '[]'::jsonb,
  acceptance_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  action_level text NOT NULL CHECK (action_level IN ('read', 'draft', 'execute', 'external_write')),
  approval_required boolean NOT NULL DEFAULT false,
  tool_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'canceled')),
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, room_id, step_id),
  UNIQUE (tenant_id, room_id, id),
  FOREIGN KEY (tenant_id, room_id) REFERENCES __AGENTPLAT_SCHEMA__.rooms (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, room_id, assigned_participant_id)
    REFERENCES __AGENTPLAT_SCHEMA__.room_participants (tenant_id, room_id, participant_id) ON DELETE RESTRICT
);

CREATE INDEX tasks_tenant_room_status_idx
  ON __AGENTPLAT_SCHEMA__.tasks (tenant_id, room_id, status, created_at, id);

CREATE TABLE __AGENTPLAT_SCHEMA__.artifacts (
  tenant_id text NOT NULL,
  id text NOT NULL,
  room_id text NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  status text NOT NULL
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'needs_revision')),
  current_version integer NOT NULL CHECK (current_version > 0),
  authors jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, room_id) REFERENCES __AGENTPLAT_SCHEMA__.rooms (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX artifacts_tenant_room_status_idx
  ON __AGENTPLAT_SCHEMA__.artifacts (tenant_id, room_id, status, updated_at DESC);

CREATE TABLE __AGENTPLAT_SCHEMA__.artifact_versions (
  tenant_id text NOT NULL,
  id text NOT NULL,
  artifact_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  content jsonb NOT NULL,
  content_type text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, artifact_id, version),
  FOREIGN KEY (tenant_id, artifact_id) REFERENCES __AGENTPLAT_SCHEMA__.artifacts (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX artifact_versions_tenant_artifact_idx
  ON __AGENTPLAT_SCHEMA__.artifact_versions (tenant_id, artifact_id, version DESC);

CREATE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_artifact_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'artifact versions are immutable';
END;
$$;

CREATE TRIGGER artifact_versions_immutable_update
  BEFORE UPDATE ON __AGENTPLAT_SCHEMA__.artifact_versions
  FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_artifact_version_mutation();
CREATE TRIGGER artifact_versions_immutable_delete
  BEFORE DELETE ON __AGENTPLAT_SCHEMA__.artifact_versions
  FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_artifact_version_mutation();

CREATE TABLE __AGENTPLAT_SCHEMA__.approvals (
  tenant_id text NOT NULL,
  id text NOT NULL,
  room_id text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('room', 'task', 'artifact', 'action')),
  target_id text NOT NULL,
  target_version integer CHECK (target_version IS NULL OR target_version > 0),
  action text,
  status text NOT NULL CHECK (status IN ('requested', 'approved', 'rejected', 'needs_revision')),
  requested_by text,
  decided_by text,
  comment text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  decided_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, room_id) REFERENCES __AGENTPLAT_SCHEMA__.rooms (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX approvals_tenant_room_status_idx
  ON __AGENTPLAT_SCHEMA__.approvals (tenant_id, room_id, status, created_at, id);
CREATE INDEX approvals_tenant_target_idx
  ON __AGENTPLAT_SCHEMA__.approvals (tenant_id, target_type, target_id, created_at DESC);
CREATE UNIQUE INDEX approvals_one_requested_target_idx
  ON __AGENTPLAT_SCHEMA__.approvals (
    tenant_id,
    room_id,
    target_type,
    target_id,
    COALESCE(target_version, 0),
    COALESCE(action, '')
  )
  WHERE status = 'requested';

CREATE TABLE __AGENTPLAT_SCHEMA__.policies (
  tenant_id text NOT NULL,
  id text NOT NULL,
  room_id text NOT NULL,
  name text NOT NULL,
  allowed_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  denied_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_approvals jsonb NOT NULL DEFAULT '[]'::jsonb,
  escalation_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  tool_permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  memory_access_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, room_id) REFERENCES __AGENTPLAT_SCHEMA__.rooms (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX policies_tenant_room_idx
  ON __AGENTPLAT_SCHEMA__.policies (tenant_id, room_id, created_at, id);

CREATE TABLE __AGENTPLAT_SCHEMA__.memory_entries (
  tenant_id text NOT NULL,
  id text NOT NULL,
  room_id text,
  scope text NOT NULL
    CHECK (scope IN ('ephemeral', 'agent', 'role', 'room', 'artifact', 'organization')),
  scope_id text,
  content jsonb NOT NULL,
  source text NOT NULL,
  confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  retention text NOT NULL CHECK (retention IN ('transient', 'session', 'durable', 'until')),
  retain_until timestamptz,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, room_id) REFERENCES __AGENTPLAT_SCHEMA__.rooms (tenant_id, id) ON DELETE CASCADE,
  CHECK (retention <> 'until' OR retain_until IS NOT NULL)
);

CREATE INDEX memory_entries_tenant_scope_idx
  ON __AGENTPLAT_SCHEMA__.memory_entries (tenant_id, scope, scope_id, created_at DESC);
CREATE INDEX memory_entries_tenant_room_idx
  ON __AGENTPLAT_SCHEMA__.memory_entries (tenant_id, room_id, created_at DESC) WHERE room_id IS NOT NULL;

CREATE TABLE __AGENTPLAT_SCHEMA__.runs (
  tenant_id text NOT NULL,
  id text NOT NULL,
  room_id text NOT NULL,
  task_id text NOT NULL,
  participant_id text NOT NULL,
  runtime text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'canceled')),
  output text,
  error_message text,
  token_usage jsonb,
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  started_at timestamptz NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, room_id, id),
  UNIQUE (tenant_id, room_id, task_id, id),
  FOREIGN KEY (tenant_id, room_id) REFERENCES __AGENTPLAT_SCHEMA__.rooms (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, room_id, task_id)
    REFERENCES __AGENTPLAT_SCHEMA__.tasks (tenant_id, room_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, room_id, participant_id)
    REFERENCES __AGENTPLAT_SCHEMA__.room_participants (tenant_id, room_id, participant_id) ON DELETE RESTRICT
);

CREATE INDEX runs_tenant_room_started_idx
  ON __AGENTPLAT_SCHEMA__.runs (tenant_id, room_id, started_at DESC);
CREATE INDEX runs_tenant_task_started_idx
  ON __AGENTPLAT_SCHEMA__.runs (tenant_id, task_id, started_at DESC);

CREATE TABLE __AGENTPLAT_SCHEMA__.context_snapshots (
  tenant_id text NOT NULL,
  id text NOT NULL,
  room_id text NOT NULL,
  task_id text NOT NULL,
  run_id text NOT NULL,
  context jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, room_id) REFERENCES __AGENTPLAT_SCHEMA__.rooms (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, room_id, task_id)
    REFERENCES __AGENTPLAT_SCHEMA__.tasks (tenant_id, room_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, room_id, task_id, run_id)
    REFERENCES __AGENTPLAT_SCHEMA__.runs (tenant_id, room_id, task_id, id) ON DELETE CASCADE
);

CREATE INDEX context_snapshots_tenant_room_created_idx
  ON __AGENTPLAT_SCHEMA__.context_snapshots (tenant_id, room_id, created_at DESC);

CREATE TABLE __AGENTPLAT_SCHEMA__.tool_calls (
  tenant_id text NOT NULL,
  id text NOT NULL,
  room_id text NOT NULL,
  run_id text NOT NULL,
  tool_id text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  status text NOT NULL CHECK (status IN ('requested', 'completed', 'failed', 'denied')),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  created_at timestamptz NOT NULL,
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, room_id) REFERENCES __AGENTPLAT_SCHEMA__.rooms (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, room_id, run_id)
    REFERENCES __AGENTPLAT_SCHEMA__.runs (tenant_id, room_id, id) ON DELETE CASCADE
);

CREATE INDEX tool_calls_tenant_run_created_idx
  ON __AGENTPLAT_SCHEMA__.tool_calls (tenant_id, run_id, created_at, id);

CREATE TABLE __AGENTPLAT_SCHEMA__.events (
  sequence bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id text NOT NULL,
  id text NOT NULL,
  room_id text NOT NULL,
  type text NOT NULL,
  source text NOT NULL,
  subject jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  actor_id text,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, sequence),
  FOREIGN KEY (tenant_id, room_id) REFERENCES __AGENTPLAT_SCHEMA__.rooms (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX events_tenant_room_sequence_idx
  ON __AGENTPLAT_SCHEMA__.events (tenant_id, room_id, sequence);
CREATE INDEX events_tenant_type_occurred_idx
  ON __AGENTPLAT_SCHEMA__.events (tenant_id, type, occurred_at DESC);

CREATE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'events are append-only';
END;
$$;

CREATE TRIGGER events_append_only_update
  BEFORE UPDATE ON __AGENTPLAT_SCHEMA__.events
  FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_event_mutation();
CREATE TRIGGER events_append_only_delete
  BEFORE DELETE ON __AGENTPLAT_SCHEMA__.events
  FOR EACH ROW EXECUTE FUNCTION __AGENTPLAT_SCHEMA__.agentplat_prevent_event_mutation();
