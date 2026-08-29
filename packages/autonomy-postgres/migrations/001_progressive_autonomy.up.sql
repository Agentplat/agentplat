CREATE TABLE __AGENTPLAT_SCHEMA__.autonomy_policies (
  tenant_id text NOT NULL,
  policy_domain_id text NOT NULL,
  policy_id text NOT NULL,
  policy_version bigint NOT NULL CHECK (policy_version > 0),
  policy_digest text NOT NULL,
  policy jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, policy_domain_id, policy_id, policy_version)
);

CREATE TABLE __AGENTPLAT_SCHEMA__.autonomy_states (
  tenant_id text NOT NULL,
  policy_domain_id text NOT NULL,
  policy_id text NOT NULL,
  policy_version bigint NOT NULL CHECK (policy_version > 0),
  policy_digest text NOT NULL,
  segment_digest text NOT NULL,
  action_type text NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0),
  state_digest text NOT NULL,
  level text NOT NULL CHECK (
    level IN ('blocked', 'propose_only', 'approve_all', 'approve_sample', 'autonomous')
  ),
  last_evidence_sequence bigint,
  cooldown_until timestamptz,
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (
    tenant_id, policy_domain_id, policy_id, segment_digest, action_type
  ),
  FOREIGN KEY (tenant_id, policy_domain_id, policy_id, policy_version)
    REFERENCES __AGENTPLAT_SCHEMA__.autonomy_policies
      (tenant_id, policy_domain_id, policy_id, policy_version) ON DELETE RESTRICT
);

CREATE INDEX autonomy_states_level_idx
  ON __AGENTPLAT_SCHEMA__.autonomy_states
  (tenant_id, policy_domain_id, level, updated_at, segment_digest);
CREATE INDEX autonomy_states_evidence_idx
  ON __AGENTPLAT_SCHEMA__.autonomy_states
  (tenant_id, policy_domain_id, last_evidence_sequence, updated_at);
CREATE INDEX autonomy_states_cooldown_idx
  ON __AGENTPLAT_SCHEMA__.autonomy_states
  (tenant_id, cooldown_until, segment_digest)
  WHERE cooldown_until IS NOT NULL;

CREATE TABLE __AGENTPLAT_SCHEMA__.autonomy_decisions (
  tenant_id text NOT NULL,
  policy_domain_id text NOT NULL,
  decision_id text NOT NULL,
  policy_id text NOT NULL,
  policy_version bigint NOT NULL,
  policy_digest text NOT NULL,
  segment_digest text NOT NULL,
  action_type text NOT NULL,
  action_proposal_digest text NOT NULL,
  state_revision bigint CHECK (state_revision IS NULL OR state_revision >= 0),
  disposition text NOT NULL CHECK (
    disposition IN ('deny', 'proposal_only', 'require_approval', 'eligible')
  ),
  decision_digest text NOT NULL,
  decided_at timestamptz NOT NULL,
  decision jsonb NOT NULL,
  PRIMARY KEY (tenant_id, policy_domain_id, decision_id),
  FOREIGN KEY (
    tenant_id, policy_domain_id, policy_id, segment_digest, action_type
  ) REFERENCES __AGENTPLAT_SCHEMA__.autonomy_states
    (tenant_id, policy_domain_id, policy_id, segment_digest, action_type)
    ON DELETE CASCADE
);

CREATE INDEX autonomy_decisions_segment_idx
  ON __AGENTPLAT_SCHEMA__.autonomy_decisions
  (tenant_id, policy_domain_id, segment_digest, decided_at, decision_id);
CREATE INDEX autonomy_decisions_action_idx
  ON __AGENTPLAT_SCHEMA__.autonomy_decisions
  (tenant_id, policy_domain_id, action_proposal_digest, decided_at DESC);
