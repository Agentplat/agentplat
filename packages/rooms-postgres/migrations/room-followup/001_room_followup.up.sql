CREATE TABLE __AGENTPLAT_SCHEMA__.followup_heads (
 tenant_id text NOT NULL, kind text NOT NULL CHECK(kind IN ('situation','memory_proposal')), id text NOT NULL,
 revision bigint NOT NULL CHECK(revision>=1), record jsonb NOT NULL,
 primary_room_id text, subject_type text, subject_id text,
 PRIMARY KEY(tenant_id,kind,id)
);
CREATE INDEX followup_room_heads ON __AGENTPLAT_SCHEMA__.followup_heads(tenant_id,primary_room_id,id COLLATE "C") WHERE kind='situation';
CREATE INDEX followup_proposal_subjects ON __AGENTPLAT_SCHEMA__.followup_heads(tenant_id,subject_type,subject_id,id COLLATE "C") WHERE kind='memory_proposal';
CREATE TABLE __AGENTPLAT_SCHEMA__.followup_revisions (
 sequence bigserial NOT NULL UNIQUE,
 tenant_id text NOT NULL, kind text NOT NULL CHECK(kind IN ('situation','memory_proposal')), id text NOT NULL,
 revision bigint NOT NULL CHECK(revision>=1), operation_id text NOT NULL, request_digest text NOT NULL,
 record jsonb NOT NULL, primary_room_id text, recorded_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,kind,id,revision), UNIQUE(tenant_id,kind,id,operation_id),
 FOREIGN KEY(tenant_id,kind,id) REFERENCES __AGENTPLAT_SCHEMA__.followup_heads(tenant_id,kind,id) ON DELETE CASCADE
);
CREATE INDEX followup_situation_feed ON __AGENTPLAT_SCHEMA__.followup_revisions(tenant_id,sequence,primary_room_id) WHERE kind='situation';
