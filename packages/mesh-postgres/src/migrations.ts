import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  defaultPostgresSchema,
  getPostgresMigrationStatus,
  postgresRollbackConfirmation,
  rollbackPostgresMigration,
  runPostgresMigrations,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type {
  PostgresMigration,
  PostgresMigrationStatus,
} from "@agentplat/postgres";
import type { Pool } from "pg";

const applicationId = "@agentplat/mesh-postgres";
const migrationNames = [
  "001_mesh_durability",
  "002_mesh_compatibility_metadata",
] as const;

export const migrationDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);

export interface MeshPostgresMigrationOptions {
  readonly schema?: string;
  readonly createSchema?: boolean;
}

async function migrations(): Promise<readonly PostgresMigration[]> {
  const sources = await Promise.all(
    migrationNames.flatMap((name) => [
      readFile(
        new URL(`../migrations/${name}.up.sql`, import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(`../migrations/${name}.down.sql`, import.meta.url),
        "utf8",
      ),
    ]),
  );
  return [
    {
      version: 1,
      name: migrationNames[0],
      up: sources[0],
      down: sources[1],
      destructiveDown: true,
      adoptIf: `
        SELECT
          to_regclass('__AGENTPLAT_SCHEMA__.mesh_inbox') IS NOT NULL
          AND to_regclass('__AGENTPLAT_SCHEMA__.mesh_outbox') IS NOT NULL
          AND to_regclass('__AGENTPLAT_SCHEMA__.mesh_journal') IS NOT NULL
          AND to_regclass('__AGENTPLAT_SCHEMA__.mesh_peer_snapshots') IS NOT NULL
          AS present
      `,
    },
    {
      version: 2,
      name: migrationNames[1],
      up: sources[2],
      down: sources[3],
      destructiveDown: true,
      adoptIf: `
        SELECT
          (SELECT count(*) = 13
             FROM information_schema.columns
            WHERE table_schema = '__AGENTPLAT_SCHEMA__'
              AND (table_name, column_name, data_type, is_nullable) IN (
                ('mesh_peer_snapshots', 'wrapper_schema_version', 'smallint', 'NO'),
                ('mesh_peer_snapshots', 'snapshot_format', 'text', 'NO'),
                ('mesh_peer_snapshots', 'snapshot_schema_version', 'integer', 'NO'),
                ('mesh_inbox', 'wrapper_schema_version', 'smallint', 'NO'),
                ('mesh_inbox', 'envelope_format', 'text', 'NO'),
                ('mesh_inbox', 'envelope_wire_version', 'integer', 'NO'),
                ('mesh_inbox', 'envelope_bytes', 'bytea', 'YES'),
                ('mesh_outbox', 'wrapper_schema_version', 'smallint', 'NO'),
                ('mesh_outbox', 'envelope_format', 'text', 'NO'),
                ('mesh_outbox', 'envelope_wire_version', 'integer', 'NO'),
                ('mesh_outbox', 'envelope_bytes', 'bytea', 'YES'),
                ('mesh_journal', 'wrapper_schema_version', 'smallint', 'NO'),
                ('mesh_journal', 'journal_version', 'integer', 'NO')
              ))
          AND (SELECT count(*) = 4
                 FROM information_schema.table_constraints
                WHERE table_schema = '__AGENTPLAT_SCHEMA__'
                  AND (table_name, constraint_name, constraint_type) IN (
                    ('mesh_peer_snapshots', 'mesh_peer_snapshots_compatibility_metadata_check', 'CHECK'),
                    ('mesh_inbox', 'mesh_inbox_compatibility_metadata_check', 'CHECK'),
                    ('mesh_outbox', 'mesh_outbox_compatibility_metadata_check', 'CHECK'),
                    ('mesh_journal', 'mesh_journal_compatibility_metadata_check', 'CHECK')
                  )) AS present
      `,
    },
  ];
}

export interface MeshPostgresCompatibilityStatus {
  readonly legacyInboxRows: number;
  readonly legacyOutboxRows: number;
  readonly legacySnapshotRows: number;
  readonly betaRowsMissingCanonicalBytes: number;
}

export interface MeshPostgresRollbackReadiness {
  readonly incompatibleInboxRows: number;
  readonly incompatibleOutboxRows: number;
  readonly incompatibleSnapshotRows: number;
  readonly incompatibleJournalRows: number;
  readonly incompatibleRows: number;
  readonly readyForAlphaReader: boolean;
}

/** Reports expand-first adoption without mutating application rows. */
export async function getCompatibilityStatus(
  pool: Pool,
  options: MeshPostgresMigrationOptions = {},
): Promise<MeshPostgresCompatibilityStatus> {
  const schema = normalizePostgresIdentifier(
    options.schema ?? defaultPostgresSchema,
    "schema",
  );
  const prefix = `${quotePostgresIdentifier(schema)}.`;
  const result = await pool.query<{
    legacy_inbox: string;
    legacy_outbox: string;
    legacy_snapshots: string;
    beta_missing_bytes: string;
  }>(`
    SELECT
      (SELECT count(*) FROM ${prefix}mesh_inbox WHERE wrapper_schema_version = 1)::text AS legacy_inbox,
      (SELECT count(*) FROM ${prefix}mesh_outbox WHERE wrapper_schema_version = 1)::text AS legacy_outbox,
      (SELECT count(*) FROM ${prefix}mesh_peer_snapshots WHERE wrapper_schema_version = 1)::text AS legacy_snapshots,
      (
        (SELECT count(*) FROM ${prefix}mesh_inbox WHERE wrapper_schema_version = 2 AND envelope_bytes IS NULL)
        +
        (SELECT count(*) FROM ${prefix}mesh_outbox WHERE wrapper_schema_version = 2 AND envelope_bytes IS NULL)
      )::text AS beta_missing_bytes
  `);
  const row = result.rows[0]!;
  return Object.freeze({
    legacyInboxRows: boundedCount(row.legacy_inbox),
    legacyOutboxRows: boundedCount(row.legacy_outbox),
    legacySnapshotRows: boundedCount(row.legacy_snapshots),
    betaRowsMissingCanonicalBytes: boundedCount(row.beta_missing_bytes),
  });
}

/** Counts signed v1 work that an Alpha reader cannot safely resume. */
export async function getRollbackReadiness(
  pool: Pool,
  options: MeshPostgresMigrationOptions = {},
): Promise<MeshPostgresRollbackReadiness> {
  const schema = normalizePostgresIdentifier(
    options.schema ?? defaultPostgresSchema,
    "schema",
  );
  const prefix = `${quotePostgresIdentifier(schema)}.`;
  const result = await pool.query<{
    incompatible_inbox: string;
    incompatible_outbox: string;
    incompatible_snapshots: string;
    incompatible_journal: string;
  }>(`
    SELECT
      (SELECT count(*) FROM ${prefix}mesh_inbox WHERE envelope_wire_version <> 0)::text AS incompatible_inbox,
      (SELECT count(*) FROM ${prefix}mesh_outbox WHERE envelope_wire_version <> 0)::text AS incompatible_outbox,
      (SELECT count(*) FROM ${prefix}mesh_peer_snapshots WHERE wrapper_schema_version = 2)::text AS incompatible_snapshots,
      (SELECT count(*) FROM ${prefix}mesh_journal WHERE wrapper_schema_version = 2)::text AS incompatible_journal
  `);
  const incompatibleInboxRows = boundedCount(
    result.rows[0]!.incompatible_inbox,
  );
  const incompatibleOutboxRows = boundedCount(
    result.rows[0]!.incompatible_outbox,
  );
  const incompatibleSnapshotRows = boundedCount(
    result.rows[0]!.incompatible_snapshots,
  );
  const incompatibleJournalRows = boundedCount(
    result.rows[0]!.incompatible_journal,
  );
  const incompatibleRows =
    incompatibleInboxRows +
    incompatibleOutboxRows +
    incompatibleSnapshotRows +
    incompatibleJournalRows;
  if (!Number.isSafeInteger(incompatibleRows)) {
    throw new RangeError("Mesh rollback row count exceeds safe bounds");
  }
  return Object.freeze({
    incompatibleInboxRows,
    incompatibleOutboxRows,
    incompatibleSnapshotRows,
    incompatibleJournalRows,
    incompatibleRows,
    readyForAlphaReader: incompatibleRows === 0,
  });
}

function boundedCount(value: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError("Mesh compatibility row count exceeds safe bounds");
  }
  return count;
}

export async function runMigrations(
  pool: Pool,
  options: MeshPostgresMigrationOptions = {},
): Promise<PostgresMigrationStatus> {
  return runPostgresMigrations(pool, {
    applicationId,
    schema: options.schema,
    createSchema: options.createSchema,
    migrations: await migrations(),
  });
}

export async function getMigrationStatus(
  pool: Pool,
  options: MeshPostgresMigrationOptions = {},
): Promise<PostgresMigrationStatus> {
  return getPostgresMigrationStatus(pool, {
    applicationId,
    schema: options.schema,
    migrations: await migrations(),
  });
}

export function rollbackConfirmation(
  schema = defaultPostgresSchema,
  version = 2,
): string {
  return postgresRollbackConfirmation(applicationId, schema, version);
}

export async function rollbackMigrations(
  pool: Pool,
  options: MeshPostgresMigrationOptions & {
    readonly expectedCurrentVersion: number;
    readonly confirm: string;
    readonly allowDataLoss?: boolean;
    /** Confirms a restorable snapshot exists outside this migration. */
    readonly verifiedBackup?: boolean;
    /** Explicitly accepts that Alpha readers cannot resume retained v1 rows. */
    readonly allowIncompatibleRows?: boolean;
  },
): Promise<PostgresMigrationStatus> {
  if (options.expectedCurrentVersion === 2) {
    if (options.verifiedBackup !== true) {
      throw new TypeError(
        "Mesh migration rollback requires a verified external backup",
      );
    }
    const readiness = await getRollbackReadiness(pool, options);
    if (
      !readiness.readyForAlphaReader &&
      options.allowIncompatibleRows !== true
    ) {
      throw new TypeError(
        "Mesh migration rollback requires drained v1 rows or an explicit loss decision",
      );
    }
  }
  return rollbackPostgresMigration(pool, {
    applicationId,
    schema: options.schema,
    createSchema: false,
    migrations: await migrations(),
    expectedCurrentVersion: options.expectedCurrentVersion,
    confirm: options.confirm,
    allowDataLoss: options.allowDataLoss,
  });
}
