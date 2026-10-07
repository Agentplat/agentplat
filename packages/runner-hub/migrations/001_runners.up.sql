CREATE TABLE __AGENTPLAT_SCHEMA__.agentplat_runners (
 id varchar NOT NULL, tenant_id varchar NOT NULL, name varchar NOT NULL,
 capabilities text[] NOT NULL, concurrency_limit integer NOT NULL CHECK (concurrency_limit > 0),
 status varchar NOT NULL CHECK (status IN ('online','offline')), last_heartbeat timestamptz NOT NULL DEFAULT NOW(),
 metadata jsonb NOT NULL DEFAULT '{}', session_id varchar NOT NULL,
 PRIMARY KEY (tenant_id,id)
);
CREATE TABLE __AGENTPLAT_SCHEMA__.agentplat_runner_tasks (
 id varchar PRIMARY KEY, tenant_id varchar NOT NULL, action varchar NOT NULL, payload jsonb NOT NULL,
 required_capabilities text[] NOT NULL DEFAULT '{}',
 status varchar NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','leased','completed','failed','cancelled')),
 assigned_runner_id varchar, lease_id varchar, lease_expires_at timestamptz,
 retries integer NOT NULL DEFAULT 0 CHECK (retries >= 0), max_retries integer NOT NULL DEFAULT 3 CHECK (max_retries > 0),
 timeout_seconds integer NOT NULL DEFAULT 60 CHECK (timeout_seconds > 0), result jsonb, error text,
 created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW(),
 FOREIGN KEY (tenant_id,assigned_runner_id) REFERENCES __AGENTPLAT_SCHEMA__.agentplat_runners(tenant_id,id)
);
CREATE INDEX runner_task_pending ON __AGENTPLAT_SCHEMA__.agentplat_runner_tasks(tenant_id,created_at) WHERE status='pending';
CREATE INDEX runner_task_expiry ON __AGENTPLAT_SCHEMA__.agentplat_runner_tasks(lease_expires_at) WHERE status='leased';
