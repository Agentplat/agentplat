ALTER TABLE __AGENTPLAT_SCHEMA__.mesh_peer_snapshots
  ADD COLUMN wrapper_schema_version smallint,
  ADD COLUMN snapshot_format text,
  ADD COLUMN snapshot_schema_version integer;

ALTER TABLE __AGENTPLAT_SCHEMA__.mesh_inbox
  ADD COLUMN wrapper_schema_version smallint,
  ADD COLUMN envelope_format text,
  ADD COLUMN envelope_wire_version integer,
  ADD COLUMN envelope_bytes bytea;

ALTER TABLE __AGENTPLAT_SCHEMA__.mesh_outbox
  ADD COLUMN wrapper_schema_version smallint,
  ADD COLUMN envelope_format text,
  ADD COLUMN envelope_wire_version integer,
  ADD COLUMN envelope_bytes bytea;

ALTER TABLE __AGENTPLAT_SCHEMA__.mesh_journal
  ADD COLUMN wrapper_schema_version smallint,
  ADD COLUMN journal_version integer;

UPDATE __AGENTPLAT_SCHEMA__.mesh_peer_snapshots
   SET wrapper_schema_version = 1,
       snapshot_format = 'application/json; profile=legacy-opaque',
       snapshot_schema_version = 0
 WHERE wrapper_schema_version IS NULL;

UPDATE __AGENTPLAT_SCHEMA__.mesh_inbox
   SET wrapper_schema_version = 1,
       envelope_format = 'application/json; profile=legacy-jsonb',
       envelope_wire_version = (envelope ->> 'wireVersion')::integer
 WHERE wrapper_schema_version IS NULL;

UPDATE __AGENTPLAT_SCHEMA__.mesh_outbox
   SET wrapper_schema_version = 1,
       envelope_format = 'application/json; profile=legacy-jsonb',
       envelope_wire_version = (envelope ->> 'wireVersion')::integer
 WHERE wrapper_schema_version IS NULL;

UPDATE __AGENTPLAT_SCHEMA__.mesh_journal
   SET wrapper_schema_version = 1,
       journal_version = 1
 WHERE wrapper_schema_version IS NULL;

ALTER TABLE __AGENTPLAT_SCHEMA__.mesh_peer_snapshots
  ALTER COLUMN wrapper_schema_version SET NOT NULL,
  ALTER COLUMN snapshot_format SET NOT NULL,
  ALTER COLUMN snapshot_schema_version SET NOT NULL;

ALTER TABLE __AGENTPLAT_SCHEMA__.mesh_inbox
  ALTER COLUMN wrapper_schema_version SET NOT NULL,
  ALTER COLUMN envelope_format SET NOT NULL,
  ALTER COLUMN envelope_wire_version SET NOT NULL;

ALTER TABLE __AGENTPLAT_SCHEMA__.mesh_outbox
  ALTER COLUMN wrapper_schema_version SET NOT NULL,
  ALTER COLUMN envelope_format SET NOT NULL,
  ALTER COLUMN envelope_wire_version SET NOT NULL;

ALTER TABLE __AGENTPLAT_SCHEMA__.mesh_journal
  ALTER COLUMN wrapper_schema_version SET NOT NULL,
  ALTER COLUMN journal_version SET NOT NULL;

ALTER TABLE __AGENTPLAT_SCHEMA__.mesh_peer_snapshots
  ADD CONSTRAINT mesh_peer_snapshots_compatibility_metadata_check CHECK (
    wrapper_schema_version IN (1, 2)
    AND snapshot_format IS NOT NULL
    AND octet_length(snapshot_format) BETWEEN 3 AND 256
    AND snapshot_format !~ '[[:cntrl:]]'
    AND snapshot_schema_version BETWEEN 0 AND 65535
    AND (
      (wrapper_schema_version = 1
       AND snapshot_format = 'application/json; profile=legacy-opaque'
       AND snapshot_schema_version = 0)
      OR
      (wrapper_schema_version = 2
       AND snapshot_format <> 'application/json; profile=legacy-opaque')
    )
  );

ALTER TABLE __AGENTPLAT_SCHEMA__.mesh_inbox
  ADD CONSTRAINT mesh_inbox_compatibility_metadata_check CHECK (
    wrapper_schema_version IN (1, 2)
    AND envelope_wire_version IN (0, 1)
    AND (
      (wrapper_schema_version = 1
       AND envelope_format = 'application/json; profile=legacy-jsonb'
       AND envelope_wire_version = 0
       AND envelope_bytes IS NULL)
      OR
      (wrapper_schema_version = 2
       AND envelope_format = 'application/vnd.agentplat.mesh-envelope+json'
       AND envelope_bytes IS NOT NULL
       AND octet_length(envelope_bytes) BETWEEN 1 AND 262144)
    )
  );

ALTER TABLE __AGENTPLAT_SCHEMA__.mesh_outbox
  ADD CONSTRAINT mesh_outbox_compatibility_metadata_check CHECK (
    wrapper_schema_version IN (1, 2)
    AND envelope_wire_version IN (0, 1)
    AND (
      (wrapper_schema_version = 1
       AND envelope_format = 'application/json; profile=legacy-jsonb'
       AND envelope_wire_version = 0
       AND envelope_bytes IS NULL)
      OR
      (wrapper_schema_version = 2
       AND envelope_format = 'application/vnd.agentplat.mesh-envelope+json'
       AND envelope_bytes IS NOT NULL
       AND octet_length(envelope_bytes) BETWEEN 1 AND 262144)
    )
  );

ALTER TABLE __AGENTPLAT_SCHEMA__.mesh_journal
  ADD CONSTRAINT mesh_journal_compatibility_metadata_check CHECK (
    wrapper_schema_version IN (1, 2)
    AND journal_version = 1
  );
