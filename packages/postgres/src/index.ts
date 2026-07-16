import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import type { PoolClient, PoolConfig, QueryResultRow } from 'pg';

export const defaultPostgresSchema = 'public';

export interface PostgresPoolOptions extends PoolConfig {
  /** Falls back to DATABASE_URL, then to pg's standard PG* variables. */
  connectionString?: string;
}

/**
 * Create a pg pool without adding an AWS SDK dependency.
 *
 * `pg` accepts TLS options through `ssl` and a password callback through
 * `password`, which allows callers to supply short-lived RDS IAM tokens.
 */
export function createPostgresPool(options: PostgresPoolOptions = {}): Pool {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  return new Pool({
    ...options,
    ...(connectionString ? { connectionString } : {}),
  });
}

export interface PostgresPoolHealth {
  ok: boolean;
  latencyMs: number;
  pool: {
    total: number;
    idle: number;
    waiting: number;
  };
  error?: {
    name: string;
    message: string;
    code?: string;
  };
}

export interface PostgresHealthOptions {
  /** Per-query timeout. Defaults to 2 seconds. */
  timeoutMs?: number;
}

/** Readiness check that exercises a checked-out connection and reports pool pressure. */
export async function checkPostgresPool(
  pool: Pool,
  options: PostgresHealthOptions = {}
): Promise<PostgresPoolHealth> {
  const timeoutMs = positiveInteger(options.timeoutMs ?? 2_000, 'timeoutMs');
  const startedAt = performance.now();
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query(`SET statement_timeout TO ${timeoutMs}`);
    await client.query('SELECT 1');
    return health(pool, true, startedAt);
  } catch (error) {
    const result = health(pool, false, startedAt);
    result.error = safeError(error);
    return result;
  } finally {
    if (client) {
      let resetError: Error | undefined;
      await client.query('RESET statement_timeout').catch((error: unknown) => {
        resetError =
          error instanceof Error ? error : new Error('Failed to reset timeout');
      });
      client.release(resetError);
    }
  }
}

function health(
  pool: Pool,
  ok: boolean,
  startedAt: number
): PostgresPoolHealth {
  return {
    ok,
    latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    pool: {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    },
  };
}

function safeError(error: unknown): NonNullable<PostgresPoolHealth['error']> {
  const value = error instanceof Error ? error : new Error(String(error));
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : undefined;
  return {
    name: value.name,
    message: value.message,
    ...(code ? { code } : {}),
  };
}

/** Restrict identifiers so schema names can be safely interpolated in DDL. */
export function normalizePostgresIdentifier(
  value: string,
  label = 'identifier'
): string {
  const normalized = value.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    throw new TypeError(
      `${label} must start with a letter or underscore and contain only letters, numbers, and underscores`
    );
  }
  if (Buffer.byteLength(normalized, 'utf8') > 63) {
    throw new RangeError(`${label} must be at most 63 UTF-8 bytes`);
  }
  return normalized;
}

export function quotePostgresIdentifier(value: string): string {
  return `"${normalizePostgresIdentifier(value)}"`;
}

export function qualifyPostgresName(schema: string, object: string): string {
  return `${quotePostgresIdentifier(schema)}.${quotePostgresIdentifier(object)}`;
}

/** Replace the explicit schema token used by packaged migration SQL. */
export function renderPostgresSchema(sql: string, schema: string): string {
  return sql.replaceAll(
    '__AGENTPLAT_SCHEMA__',
    quotePostgresIdentifier(schema)
  );
}

export interface PostgresMigration {
  version: number;
  name: string;
  up: string;
  down?: string;
  /** Down SQL destroys or irreversibly rewrites application data. */
  destructiveDown?: boolean;
  /** Optional boolean `present` query for adopting a legacy, pre-ledger migration. */
  adoptIf?: string;
}

export interface PostgresMigrationOptions {
  applicationId: string;
  schema?: string;
  migrations: readonly PostgresMigration[];
  /** Create the application schema if it is absent. Defaults to false. */
  createSchema?: boolean;
}

export interface AppliedPostgresMigration {
  applicationId: string;
  version: number;
  name: string;
  checksum: string;
  appliedAt: string;
}

export interface PostgresMigrationStatus {
  schema: string;
  applicationId: string;
  currentVersion: number;
  availableVersion: number;
  pendingVersions: number[];
  applied: AppliedPostgresMigration[];
}

export interface PostgresRollbackOptions extends PostgresMigrationOptions {
  /** Version currently expected by the operator; prevents rolling back stale state. */
  expectedCurrentVersion: number;
  /** Exact value returned by `postgresRollbackConfirmation`. */
  confirm: string;
  /** Required when the selected down migration is marked destructive. */
  allowDataLoss?: boolean;
}

const ledgerName = '_agentplat_migrations';

/** Apply every pending migration under one schema/application-scoped advisory lock. */
export async function runPostgresMigrations(
  pool: Pool,
  options: PostgresMigrationOptions
): Promise<PostgresMigrationStatus> {
  const normalized = normalizeMigrationOptions(options);
  return withMigrationLock(pool, normalized, async (client) => {
    await ensureMigrationInfrastructure(client, normalized);
    const applied = await readApplied(client, normalized);
    verifyApplied(applied, normalized.migrations);
    for (const migration of normalized.migrations.slice(applied.length)) {
      await client.query('BEGIN');
      try {
        const adopted = migration.adoptIf
          ? await shouldAdopt(client, migration.adoptIf, normalized.schema)
          : false;
        if (!adopted) {
          await client.query(
            renderPostgresSchema(migration.up, normalized.schema)
          );
        }
        await client.query(
          `INSERT INTO ${ledger(normalized.schema)}
             (application_id, version, name, checksum)
           VALUES ($1, $2, $3, $4)`,
          [
            normalized.applicationId,
            migration.version,
            migration.name,
            migrationChecksum(migration.up),
          ]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    }
    return migrationStatus(client, normalized);
  });
}

/** Inspect versions and checksums without applying a migration. */
export async function getPostgresMigrationStatus(
  pool: Pool,
  options: PostgresMigrationOptions
): Promise<PostgresMigrationStatus> {
  const normalized = normalizeMigrationOptions(options);
  const client = await pool.connect();
  try {
    if (!(await schemaExists(client, normalized.schema))) {
      return emptyStatus(normalized);
    }
    if (!(await ledgerExists(client, normalized.schema))) {
      return emptyStatus(normalized);
    }
    const applied = await readApplied(client, normalized);
    verifyApplied(applied, normalized.migrations);
    return statusFrom(normalized, applied);
  } finally {
    client.release();
  }
}

/**
 * Roll back exactly the current top migration after explicit state and data-loss checks.
 * This intentionally cannot roll back several versions in one call.
 */
export async function rollbackPostgresMigration(
  pool: Pool,
  options: PostgresRollbackOptions
): Promise<PostgresMigrationStatus> {
  const normalized = normalizeMigrationOptions(options);
  positiveInteger(options.expectedCurrentVersion, 'expectedCurrentVersion');
  const expectedConfirmation = postgresRollbackConfirmation(
    normalized.applicationId,
    normalized.schema,
    options.expectedCurrentVersion
  );
  if (options.confirm !== expectedConfirmation) {
    throw new Error(
      `Rollback confirmation does not match. Expected: ${expectedConfirmation}`
    );
  }
  return withMigrationLock(pool, normalized, async (client) => {
    await ensureMigrationInfrastructure(client, normalized);
    const applied = await readApplied(client, normalized);
    verifyApplied(applied, normalized.migrations);
    const current = applied.at(-1);
    if (!current || current.version !== options.expectedCurrentVersion) {
      throw new Error(
        `Database is at version ${current?.version ?? 0}, expected ${options.expectedCurrentVersion}`
      );
    }
    const migration = normalized.migrations.find(
      (candidate) => candidate.version === current.version
    );
    if (!migration?.down) {
      throw new Error(`Migration ${current.version} has no down migration`);
    }
    if (migration.destructiveDown && options.allowDataLoss !== true) {
      throw new Error(
        `Migration ${current.version} is destructive; set allowDataLoss only after backup and restore verification`
      );
    }
    await client.query('BEGIN');
    try {
      await client.query(
        renderPostgresSchema(migration.down, normalized.schema)
      );
      await client.query(
        `DELETE FROM ${ledger(normalized.schema)}
         WHERE application_id = $1 AND version = $2`,
        [normalized.applicationId, migration.version]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
    return migrationStatus(client, normalized);
  });
}

export function postgresRollbackConfirmation(
  applicationId: string,
  schema: string,
  version: number
): string {
  return `ROLLBACK ${applicationId} VERSION ${version} FROM ${normalizePostgresIdentifier(schema, 'schema')}`;
}

interface NormalizedMigrationOptions {
  applicationId: string;
  schema: string;
  migrations: PostgresMigration[];
  createSchema: boolean;
}

function normalizeMigrationOptions(
  options: PostgresMigrationOptions
): NormalizedMigrationOptions {
  const applicationId = options.applicationId.trim();
  if (!applicationId) throw new TypeError('applicationId is required');
  const schema = normalizePostgresIdentifier(
    options.schema ?? defaultPostgresSchema,
    'schema'
  );
  const migrations = [...options.migrations].sort(
    (left, right) => left.version - right.version
  );
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error('Migration versions must be contiguous and start at 1');
    }
    if (!migration.name.trim() || !migration.up.trim()) {
      throw new Error(
        `Migration ${migration.version} requires name and up SQL`
      );
    }
  });
  return {
    applicationId,
    schema,
    migrations,
    createSchema: options.createSchema === true,
  };
}

async function withMigrationLock<T>(
  pool: Pool,
  options: NormalizedMigrationOptions,
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  const lock = `agentplat:migrations:${options.schema}:${options.applicationId}`;
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [lock]);
    return await operation(client);
  } finally {
    await client
      .query('SELECT pg_advisory_unlock(hashtext($1))', [lock])
      .catch(() => undefined);
    client.release();
  }
}

async function ensureMigrationInfrastructure(
  client: PoolClient,
  options: NormalizedMigrationOptions
): Promise<void> {
  if (!(await schemaExists(client, options.schema))) {
    if (!options.createSchema) {
      throw new Error(
        `PostgreSQL schema "${options.schema}" does not exist; create it with the migration role or set createSchema`
      );
    }
    await client.query(
      `CREATE SCHEMA IF NOT EXISTS ${quotePostgresIdentifier(options.schema)}`
    );
  }
  await ensureLedger(client, options.schema);
}

async function schemaExists(
  client: PoolClient,
  schema: string
): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS present',
    [schema]
  );
  return result.rows[0]?.present === true;
}

async function ensureLedger(client: PoolClient, schema: string): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${ledger(schema)} (
       application_id text NOT NULL,
       version integer NOT NULL CHECK (version > 0),
       name text NOT NULL,
       checksum text NOT NULL,
       applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
       PRIMARY KEY (application_id, version),
       UNIQUE (application_id, name)
     )`
  );
}

async function ledgerExists(
  client: PoolClient,
  schema: string
): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM pg_class class
       JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
       WHERE namespace.nspname = $1 AND class.relname = $2
     ) AS present`,
    [schema, ledgerName]
  );
  return result.rows[0]?.present === true;
}

async function shouldAdopt(
  client: PoolClient,
  sql: string,
  schema: string
): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(
    renderPostgresSchema(sql, schema)
  );
  return result.rows[0]?.present === true;
}

async function readApplied(
  client: PoolClient,
  options: NormalizedMigrationOptions
): Promise<AppliedPostgresMigration[]> {
  const result = await client.query<QueryResultRow & Record<string, unknown>>(
    `SELECT application_id, version, name, checksum, applied_at
     FROM ${ledger(options.schema)}
     WHERE application_id = $1
     ORDER BY version`,
    [options.applicationId]
  );
  return result.rows.map((row) => ({
    applicationId: String(row.application_id),
    version: Number(row.version),
    name: String(row.name),
    checksum: String(row.checksum),
    appliedAt:
      row.applied_at instanceof Date
        ? row.applied_at.toISOString()
        : String(row.applied_at),
  }));
}

function verifyApplied(
  applied: AppliedPostgresMigration[],
  available: PostgresMigration[]
): void {
  for (let index = 0; index < applied.length; index += 1) {
    const record = applied[index];
    const migration = available[index];
    if (!migration || record.version !== migration.version) {
      throw new Error(
        `Applied migration version ${record.version} is unavailable`
      );
    }
    if (
      record.name !== migration.name ||
      record.checksum !== migrationChecksum(migration.up)
    ) {
      throw new Error(
        `Applied migration ${record.version} differs from packaged SQL; never edit an applied migration`
      );
    }
  }
}

async function migrationStatus(
  client: PoolClient,
  options: NormalizedMigrationOptions
): Promise<PostgresMigrationStatus> {
  return statusFrom(options, await readApplied(client, options));
}

function statusFrom(
  options: NormalizedMigrationOptions,
  applied: AppliedPostgresMigration[]
): PostgresMigrationStatus {
  return {
    schema: options.schema,
    applicationId: options.applicationId,
    currentVersion: applied.at(-1)?.version ?? 0,
    availableVersion: options.migrations.at(-1)?.version ?? 0,
    pendingVersions: options.migrations
      .slice(applied.length)
      .map((migration) => migration.version),
    applied,
  };
}

function emptyStatus(
  options: NormalizedMigrationOptions
): PostgresMigrationStatus {
  return statusFrom(options, []);
}

function ledger(schema: string): string {
  return qualifyPostgresName(schema, ledgerName);
}

function migrationChecksum(sql: string): string {
  return createHash('sha256')
    .update(sql.replaceAll('\r\n', '\n'))
    .digest('hex');
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer`);
  }
  return value;
}
