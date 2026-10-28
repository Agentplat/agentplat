CREATE TABLE __AGENTPLAT_SCHEMA__.shared_budget_periods (
 tenant_id text NOT NULL,account_id text NOT NULL,id text NOT NULL,
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,account_id,id),CHECK(starts_at<ends_at)
);
CREATE INDEX shared_budget_period_lookup ON __AGENTPLAT_SCHEMA__.shared_budget_periods(tenant_id,account_id,starts_at,ends_at);
CREATE TABLE __AGENTPLAT_SCHEMA__.shared_budget_reservations (
 tenant_id text NOT NULL,account_id text NOT NULL,id text NOT NULL,period_id text NOT NULL,
 status text NOT NULL CHECK(status IN ('running','uncertain','settled','released')),expires_at timestamptz NOT NULL,record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,account_id,id),FOREIGN KEY(tenant_id,account_id,period_id) REFERENCES __AGENTPLAT_SCHEMA__.shared_budget_periods(tenant_id,account_id,id)
);
CREATE INDEX shared_budget_held ON __AGENTPLAT_SCHEMA__.shared_budget_reservations(tenant_id,account_id,period_id,expires_at) WHERE status IN ('running','uncertain');
CREATE INDEX shared_budget_receipts ON __AGENTPLAT_SCHEMA__.shared_budget_reservations(tenant_id,account_id,period_id,id COLLATE "C");
CREATE TABLE __AGENTPLAT_SCHEMA__.shared_budget_configurations (
 tenant_id text NOT NULL,account_id text NOT NULL,id text NOT NULL,record jsonb NOT NULL,PRIMARY KEY(tenant_id,account_id,id)
);
CREATE TABLE __AGENTPLAT_SCHEMA__.scheduled_followup_heads (
 tenant_id text NOT NULL,subject_id text NOT NULL,id text NOT NULL,record jsonb NOT NULL,PRIMARY KEY(tenant_id,subject_id,id)
);
CREATE TABLE __AGENTPLAT_SCHEMA__.scheduled_activations (
 tenant_id text NOT NULL,subject_id text NOT NULL,id text NOT NULL,room_id text NOT NULL,
 status text NOT NULL CHECK(status IN ('planned','queued','canceled')),at timestamptz NOT NULL,ready_at timestamptz NOT NULL,record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,subject_id,id),UNIQUE(tenant_id,id)
);
CREATE INDEX scheduled_activation_due ON __AGENTPLAT_SCHEMA__.scheduled_activations(tenant_id,room_id,ready_at,id COLLATE "C") WHERE status='planned';
CREATE TABLE __AGENTPLAT_SCHEMA__.scheduled_deliveries (
 tenant_id text NOT NULL,subject_id text NOT NULL,id text NOT NULL,room_id text NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','delivering','delivered','uncertain','canceled')),
 available_at timestamptz NOT NULL,lease_until timestamptz,record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,subject_id,id),UNIQUE(tenant_id,id)
);
CREATE INDEX scheduled_delivery_ready ON __AGENTPLAT_SCHEMA__.scheduled_deliveries(tenant_id,room_id,available_at,id COLLATE "C") WHERE status='pending';
CREATE INDEX scheduled_delivery_expired ON __AGENTPLAT_SCHEMA__.scheduled_deliveries(tenant_id,room_id,lease_until) WHERE status='delivering';
CREATE INDEX scheduled_delivery_list ON __AGENTPLAT_SCHEMA__.scheduled_deliveries(tenant_id,room_id,status,id COLLATE "C");
CREATE TABLE __AGENTPLAT_SCHEMA__.scheduled_followup_operations (
 tenant_id text NOT NULL,subject_id text NOT NULL,id text NOT NULL,record jsonb NOT NULL,PRIMARY KEY(tenant_id,subject_id,id)
);
