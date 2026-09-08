import type { Pool } from "pg";
import {
  qualifyPostgresName,
  runPostgresMigrations,
  getPostgresMigrationStatus,
  type PostgresMigration,
} from "@agentplat/postgres";
import type { A2ARecord, A2AStateStore, Json } from "./contracts.js";
export const a2aMigrations: readonly PostgresMigration[] = [
  {
    version: 1,
    name: "a2a_state",
    up: `CREATE TABLE __AGENTPLAT_SCHEMA__.a2a_state (scope text NOT NULL, key text NOT NULL, revision integer NOT NULL CHECK (revision > 0), value jsonb NOT NULL, PRIMARY KEY(scope,key));`,
    down: `DROP TABLE __AGENTPLAT_SCHEMA__.a2a_state;`,
    destructiveDown: true,
  },
];
export function runMigrations(
  pool: Pool,
  options: { schema?: string; createSchema?: boolean } = {},
) {
  return runPostgresMigrations(pool, {
    ...options,
    applicationId: "@agentplat/a2a",
    migrations: a2aMigrations,
  });
}
export function getMigrationStatus(
  pool: Pool,
  options: { schema?: string } = {},
) {
  return getPostgresMigrationStatus(pool, {
    ...options,
    applicationId: "@agentplat/a2a",
    migrations: a2aMigrations,
  });
}
export class PostgresA2AStateStore implements A2AStateStore {
  readonly #table: string;
  constructor(
    readonly pool: Pool,
    schema = "public",
  ) {
    this.#table = qualifyPostgresName(schema, "a2a_state");
  }
  async get(scope: string, key: string): Promise<A2ARecord | undefined> {
    return (
      await this.pool.query(
        `SELECT revision,value FROM ${this.#table} WHERE scope=$1 AND key=$2`,
        [scope, key],
      )
    ).rows[0];
  }
  async list(scope: string) {
    return (
      await this.pool.query(
        `SELECT key,revision,value FROM ${this.#table} WHERE scope=$1 ORDER BY key`,
        [scope],
      )
    ).rows.map((r) => ({
      key: r.key,
      record: { revision: r.revision, value: r.value },
    }));
  }
  async compareAndSet(
    scope: string,
    key: string,
    expectedRevision: number | null,
    value: Json,
  ) {
    const result =
      expectedRevision === null
        ? await this.pool.query(
            `INSERT INTO ${this.#table} (scope,key,revision,value) VALUES ($1,$2,1,$3) ON CONFLICT DO NOTHING`,
            [scope, key, JSON.stringify(value)],
          )
        : await this.pool.query(
            `UPDATE ${this.#table} SET revision=revision+1,value=$3 WHERE scope=$1 AND key=$2 AND revision=$4`,
            [scope, key, JSON.stringify(value), expectedRevision],
          );
    return result.rowCount === 1;
  }
}
