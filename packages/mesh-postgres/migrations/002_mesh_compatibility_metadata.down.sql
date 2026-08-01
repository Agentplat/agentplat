ALTER TABLE __AGENTPLAT_SCHEMA__.mesh_journal
  DROP CONSTRAINT mesh_journal_compatibility_metadata_check,
  DROP COLUMN journal_version,
  DROP COLUMN wrapper_schema_version;

ALTER TABLE __AGENTPLAT_SCHEMA__.mesh_outbox
  DROP CONSTRAINT mesh_outbox_compatibility_metadata_check,
  DROP COLUMN envelope_bytes,
  DROP COLUMN envelope_wire_version,
  DROP COLUMN envelope_format,
  DROP COLUMN wrapper_schema_version;

ALTER TABLE __AGENTPLAT_SCHEMA__.mesh_inbox
  DROP CONSTRAINT mesh_inbox_compatibility_metadata_check,
  DROP COLUMN envelope_bytes,
  DROP COLUMN envelope_wire_version,
  DROP COLUMN envelope_format,
  DROP COLUMN wrapper_schema_version;

ALTER TABLE __AGENTPLAT_SCHEMA__.mesh_peer_snapshots
  DROP CONSTRAINT mesh_peer_snapshots_compatibility_metadata_check,
  DROP COLUMN snapshot_schema_version,
  DROP COLUMN snapshot_format,
  DROP COLUMN wrapper_schema_version;
