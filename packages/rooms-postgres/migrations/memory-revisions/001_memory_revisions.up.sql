-- Opt-in ledger; legacy Room migration head and memory remain unchanged.
CREATE TABLE __AGENTPLAT_SCHEMA__.memory_revision_heads (
 tenant_id text NOT NULL,
 memory_id text NOT NULL,
 revision bigint NOT NULL CHECK (revision > 0),
 record jsonb NOT NULL,
 PRIMARY KEY (tenant_id,memory_id),
 CHECK (record->>'tenantId' = tenant_id),
 CHECK (record->>'memoryId' = memory_id),
 CHECK ((record->>'revision')::bigint = revision)
);
CREATE TABLE __AGENTPLAT_SCHEMA__.memory_revisions (
 tenant_id text NOT NULL,
 memory_id text NOT NULL,
 revision bigint NOT NULL CHECK (revision > 0),
 operation_id text NOT NULL,
 record jsonb NOT NULL,
 PRIMARY KEY (tenant_id,memory_id,revision),
 UNIQUE (tenant_id,memory_id,operation_id),
 FOREIGN KEY (tenant_id,memory_id) REFERENCES __AGENTPLAT_SCHEMA__.memory_revision_heads (tenant_id,memory_id),
 CHECK (record->>'tenantId' = tenant_id),
 CHECK (record->>'memoryId' = memory_id),
 CHECK (record->>'operationId' = operation_id),
 CHECK ((record->>'revision')::bigint = revision)
);
