import {
  MESH_DURABLE_LEGACY_OPAQUE_SNAPSHOT_FORMAT,
  computeMeshDurableValueDigest,
} from "@agentplat/mesh/durability";
import type {
  MeshDurableScope,
  MeshDurableSnapshotDescriptor,
} from "@agentplat/mesh/durability";
import type { MeshJsonValue } from "@agentplat/mesh-protocol";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool } from "pg";

export interface MeshPostgresSnapshotBackfillOptions {
  readonly schema?: string;
  readonly batchSize?: number;
  readonly migrationTimeoutMs?: number;
  readonly target: MeshDurableSnapshotDescriptor;
  readonly migrate: (
    input: Readonly<{
      scope: MeshDurableScope;
      state: MeshJsonValue;
      sourceFormat: string;
      sourceSchemaVersion: number;
    }>,
  ) => MeshJsonValue | Promise<MeshJsonValue>;
}

export interface MeshPostgresSnapshotBackfillResult {
  readonly selected: number;
  readonly migrated: number;
  readonly remainingLegacyRows: number;
  readonly complete: boolean;
}

interface SnapshotRow {
  readonly tenant_id: string;
  readonly mesh_id: string;
  readonly peer_id: string;
  readonly instance_id: string;
  readonly state: MeshJsonValue;
  readonly state_digest: string;
  readonly snapshot_format: string;
  readonly snapshot_schema_version: number;
}

/**
 * Migrates one locked, bounded batch of explicitly legacy snapshots. A caller
 * supplies the exact target format and a deterministic content migration.
 */
export async function backfillLegacySnapshots(
  pool: Pool,
  options: MeshPostgresSnapshotBackfillOptions,
): Promise<MeshPostgresSnapshotBackfillResult> {
  if (!pool || typeof pool.connect !== "function") {
    throw new TypeError("A PostgreSQL pool is required");
  }
  if (!options || typeof options !== "object") {
    throw new TypeError("Mesh snapshot backfill options are required");
  }
  const schema = normalizePostgresIdentifier(
    options.schema ?? defaultPostgresSchema,
    "schema",
  );
  const target = normalizeTarget(options.target);
  const batchSize = options.batchSize ?? 100;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
    throw new RangeError("Mesh snapshot backfill batch size is invalid");
  }
  if (typeof options.migrate !== "function") {
    throw new TypeError("Mesh snapshot backfill migration is required");
  }
  const migrationTimeoutMs = options.migrationTimeoutMs ?? 10_000;
  if (
    !Number.isSafeInteger(migrationTimeoutMs) ||
    migrationTimeoutMs < 10 ||
    migrationTimeoutMs > 120_000
  ) {
    throw new RangeError("Mesh snapshot backfill timeout is invalid");
  }
  const prefix = `${quotePostgresIdentifier(schema)}.`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query<SnapshotRow>(
      `SELECT tenant_id, mesh_id, peer_id, instance_id, state, state_digest,
              snapshot_format, snapshot_schema_version
         FROM ${prefix}mesh_peer_snapshots
        WHERE wrapper_schema_version = 1
        ORDER BY tenant_id, mesh_id, peer_id, instance_id
        FOR UPDATE SKIP LOCKED
        LIMIT $1`,
      [batchSize],
    );
    let migrated = 0;
    for (const row of selected.rows) {
      const sourceDigest = await computeMeshDurableValueDigest(row.state);
      if (sourceDigest !== row.state_digest) {
        throw new TypeError("Legacy Mesh snapshot digest does not match");
      }
      const scope = freezeScope(row);
      const input = Object.freeze({
        scope,
        state: deepFreeze(cloneJson(row.state)),
        sourceFormat: String(row.snapshot_format),
        sourceSchemaVersion: safeSchemaVersion(row.snapshot_schema_version),
      });
      const first = await boundedMigration(
        options.migrate(input),
        migrationTimeoutMs,
      );
      const second = await boundedMigration(
        options.migrate(
          Object.freeze({ ...input, state: deepFreeze(cloneJson(row.state)) }),
        ),
        migrationTimeoutMs,
      );
      const firstDigest = await computeMeshDurableValueDigest(first);
      const secondDigest = await computeMeshDurableValueDigest(second);
      if (firstDigest !== secondDigest) {
        throw new TypeError(
          "Mesh snapshot backfill migration is nondeterministic",
        );
      }
      const updated = await client.query(
        `UPDATE ${prefix}mesh_peer_snapshots
            SET state = $5::jsonb,
                state_digest = $6,
                wrapper_schema_version = 2,
                snapshot_format = $7,
                snapshot_schema_version = $8
          WHERE tenant_id = $1 AND mesh_id = $2 AND peer_id = $3
            AND instance_id = $4 AND wrapper_schema_version = 1
            AND state_digest = $9`,
        [
          scope.tenantId,
          scope.meshId,
          scope.peerId,
          scope.instanceId,
          JSON.stringify(first),
          firstDigest,
          target.format,
          target.schemaVersion,
          row.state_digest,
        ],
      );
      if (updated.rowCount !== 1) {
        throw new TypeError("Legacy Mesh snapshot changed during backfill");
      }
      migrated += 1;
    }
    const remaining = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM ${prefix}mesh_peer_snapshots
        WHERE wrapper_schema_version = 1`,
    );
    const remainingLegacyRows = safeCount(remaining.rows[0]!.count);
    await client.query("COMMIT");
    return Object.freeze({
      selected: selected.rows.length,
      migrated,
      remainingLegacyRows,
      complete: remainingLegacyRows === 0,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the migration failure; caller-owned pool recovery is external.
    }
    throw error;
  } finally {
    client.release();
  }
}

function normalizeTarget(
  target: MeshDurableSnapshotDescriptor,
): MeshDurableSnapshotDescriptor {
  if (!target || typeof target !== "object") {
    throw new TypeError("Mesh snapshot backfill target is required");
  }
  const keys = Object.keys(target).sort();
  if (
    keys.length !== 2 ||
    keys[0] !== "format" ||
    keys[1] !== "schemaVersion" ||
    typeof target.format !== "string" ||
    target.format.length < 3 ||
    new TextEncoder().encode(target.format).byteLength > 256 ||
    /[\u0000-\u001f\u007f]/u.test(target.format) ||
    target.format === MESH_DURABLE_LEGACY_OPAQUE_SNAPSHOT_FORMAT
  ) {
    throw new TypeError("Mesh snapshot backfill target is invalid");
  }
  return Object.freeze({
    format: target.format,
    schemaVersion: safeSchemaVersion(target.schemaVersion),
  });
}

async function boundedMigration(
  operation: MeshJsonValue | Promise<MeshJsonValue>,
  timeoutMs: number,
): Promise<MeshJsonValue> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Mesh snapshot backfill migration timed out")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function freezeScope(row: SnapshotRow): MeshDurableScope {
  return Object.freeze({
    tenantId: String(row.tenant_id),
    meshId: String(row.mesh_id),
    peerId: String(row.peer_id),
    instanceId: String(row.instance_id),
  });
}

function safeSchemaVersion(value: number): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > 65_535) {
    throw new RangeError("Mesh snapshot schema version is invalid");
  }
  return number;
}

function safeCount(value: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError("Mesh snapshot backfill row count exceeds bounds");
  }
  return count;
}

function cloneJson(value: MeshJsonValue): MeshJsonValue {
  return JSON.parse(JSON.stringify(value)) as MeshJsonValue;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
