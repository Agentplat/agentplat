CREATE TABLE __AGENTPLAT_SCHEMA__.evidence_events (
 tenant_id text NOT NULL, consumer_id text NOT NULL, source text NOT NULL, event_id text NOT NULL,
 input_digest text NOT NULL, submitted_by text NOT NULL, received_at timestamptz NOT NULL, event_json jsonb,evidence_keys jsonb NOT NULL,
 PRIMARY KEY(tenant_id,consumer_id,source,event_id)
);
CREATE INDEX evidence_events_compact ON __AGENTPLAT_SCHEMA__.evidence_events(tenant_id,consumer_id,source,received_at,event_id) WHERE event_json IS NOT NULL;
CREATE TABLE __AGENTPLAT_SCHEMA__.evidence_receipts (
 tenant_id text NOT NULL, consumer_id text NOT NULL, source text NOT NULL,
 evidence_id text NOT NULL, evidence_revision text NOT NULL, input_digest text NOT NULL,
 revision bigint NOT NULL CHECK(revision>=0), generation bigint NOT NULL CHECK(generation>=0),
 status text NOT NULL CHECK(status IN ('pending','leased','completed','uncertain')),
 projection text CHECK(projection IN ('pending','applied')), lease_until timestamptz,
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, available_at timestamptz NOT NULL, compacted_at timestamptz, record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,consumer_id,source,evidence_id,evidence_revision)
);
CREATE INDEX evidence_queue ON __AGENTPLAT_SCHEMA__.evidence_receipts(tenant_id,consumer_id,source,status,created_at,evidence_id COLLATE "C",evidence_revision COLLATE "C");
CREATE INDEX evidence_ready ON __AGENTPLAT_SCHEMA__.evidence_receipts(tenant_id,consumer_id,source,available_at) WHERE status='pending';
CREATE INDEX evidence_projection_queue ON __AGENTPLAT_SCHEMA__.evidence_receipts(tenant_id,consumer_id,source,projection,created_at) WHERE status='completed' AND projection='pending';
CREATE INDEX evidence_expired_leases ON __AGENTPLAT_SCHEMA__.evidence_receipts(tenant_id,consumer_id,source,lease_until) WHERE status='leased';
CREATE INDEX evidence_result_compaction ON __AGENTPLAT_SCHEMA__.evidence_receipts(tenant_id,consumer_id,source,updated_at) WHERE status='completed' AND projection='applied' AND compacted_at IS NULL;
CREATE TABLE __AGENTPLAT_SCHEMA__.evidence_checkpoints (
 tenant_id text NOT NULL, consumer_id text NOT NULL, source text NOT NULL,
 revision bigint NOT NULL CHECK(revision>=0), record jsonb NOT NULL,
 PRIMARY KEY(tenant_id,consumer_id,source)
);
CREATE TABLE __AGENTPLAT_SCHEMA__.evidence_intake_batches (
 tenant_id text NOT NULL, consumer_id text NOT NULL, source text NOT NULL, operation_id text NOT NULL,
 request_digest text NOT NULL, result jsonb NOT NULL,
 PRIMARY KEY(tenant_id,consumer_id,source,operation_id)
);
