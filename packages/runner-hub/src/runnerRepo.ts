import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import {
  qualifyPostgresName,
  runPostgresMigrations,
} from "@agentplat/postgres";
import type {
  CreateRunnerTask,
  RunnerRecord,
  RunnerRegistration,
  RunnerTask,
  JsonValue,
} from "@agentplat/runner";
export interface RunnerRepository {
  register(
    tenant: string,
    runner: RunnerRegistration,
    session: string,
  ): Promise<boolean>;
  heartbeat(tenant: string, id: string, session: string): Promise<boolean>;
  disconnect(tenant: string, id: string, session: string): Promise<void>;
  create(tenant: string, input: CreateRunnerTask): Promise<RunnerTask>;
  get(tenant: string, id: string): Promise<RunnerTask | undefined>;
  list(tenant: string): Promise<RunnerRecord[]>;
  claim(
    tenant: string,
    id: string,
    session: string,
  ): Promise<RunnerTask | undefined>;
  complete(
    tenant: string,
    runner: string,
    session: string,
    id: string,
    lease: string,
    status: "completed" | "failed",
    result: JsonValue | null,
    error: string | null,
  ): Promise<boolean>;
  reap(): Promise<void>;
}
function camel<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => key !== "session_id")
      .map(([key, value]) => [
        key === "id" && "capabilities" in row
          ? "runnerId"
          : key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
        value instanceof Date ? value.toISOString() : value,
      ]),
  ) as T;
}
export class PostgresRunnerRepository implements RunnerRepository {
  private runners: string;
  private tasks: string;
  constructor(
    private pool: Pool,
    private schema = "public",
  ) {
    this.runners = qualifyPostgresName(schema, "agentplat_runners");
    this.tasks = qualifyPostgresName(schema, "agentplat_runner_tasks");
  }
  migrate() {
    return runPostgresMigrations(this.pool, {
      applicationId: "agentplat-runner-hub",
      schema: this.schema,
      migrations: [
        {
          version: 1,
          name: "runners",
          up: readFileSync(
            new URL("../migrations/001_runners.up.sql", import.meta.url),
            "utf8",
          ),
          down: readFileSync(
            new URL("../migrations/001_runners.down.sql", import.meta.url),
            "utf8",
          ),
          destructiveDown: true,
        },
      ],
    });
  }
  async register(tenant: string, r: RunnerRegistration, session: string) {
    const q = await this.pool.query(
      `INSERT INTO ${this.runners} (id,tenant_id,name,capabilities,concurrency_limit,status,session_id) VALUES ($1,$2,$3,$4,$5,'online',$6)
      ON CONFLICT (tenant_id,id) DO UPDATE SET name=$3,capabilities=$4,concurrency_limit=$5,status='online',session_id=$6,last_heartbeat=NOW()
      WHERE ${this.runners}.status='offline' OR ${this.runners}.last_heartbeat < NOW()-INTERVAL '60 seconds' RETURNING id`,
      [r.runnerId, tenant, r.name, r.capabilities, r.concurrencyLimit, session],
    );
    return q.rowCount === 1;
  }
  async heartbeat(tenant: string, id: string, session: string) {
    const q = await this.pool.query(
      `UPDATE ${this.runners} SET last_heartbeat=NOW() WHERE tenant_id=$1 AND id=$2 AND session_id=$3 AND status='online' RETURNING id`,
      [tenant, id, session],
    );
    return q.rowCount === 1;
  }
  private releaseWhere(where: string) {
    return `UPDATE ${this.tasks} SET retries=retries+1,status=CASE WHEN retries+1 >= max_retries THEN 'failed' ELSE 'pending' END,assigned_runner_id=NULL,lease_id=NULL,lease_expires_at=NULL,error='Runner disconnected or lease expired',updated_at=NOW() WHERE status='leased' AND (${where})`;
  }
  async disconnect(tenant: string, id: string, session: string) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const q = await c.query(
        `UPDATE ${this.runners} SET status='offline' WHERE tenant_id=$1 AND id=$2 AND session_id=$3 RETURNING id`,
        [tenant, id, session],
      );
      if (q.rowCount)
        await c.query(
          this.releaseWhere("tenant_id=$1 AND assigned_runner_id=$2"),
          [tenant, id],
        );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async create(tenant: string, i: CreateRunnerTask): Promise<RunnerTask> {
    const q = await this.pool.query(
      `INSERT INTO ${this.tasks}(id,tenant_id,action,payload,required_capabilities,timeout_seconds,max_retries) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7) RETURNING *`,
      [
        randomUUID(),
        tenant,
        i.action,
        JSON.stringify(i.payload),
        i.requiredCapabilities ?? [],
        i.timeoutSeconds ?? 60,
        i.maxRetries ?? 3,
      ],
    );
    return camel(q.rows[0]);
  }
  async get(tenant: string, id: string): Promise<RunnerTask | undefined> {
    const q = await this.pool.query(
      `SELECT * FROM ${this.tasks} WHERE tenant_id=$1 AND id=$2`,
      [tenant, id],
    );
    return q.rows[0] ? camel(q.rows[0]) : undefined;
  }
  async list(tenant: string): Promise<RunnerRecord[]> {
    const q = await this.pool.query(
      `SELECT * FROM ${this.runners} WHERE tenant_id=$1 ORDER BY id`,
      [tenant],
    );
    return q.rows.map((row) => camel<RunnerRecord>(row));
  }
  async claim(
    tenant: string,
    id: string,
    session: string,
  ): Promise<RunnerTask | undefined> {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const r = await c.query(
        `SELECT * FROM ${this.runners} WHERE tenant_id=$1 AND id=$2 AND session_id=$3 AND status='online' AND last_heartbeat > NOW()-INTERVAL '60 seconds' FOR UPDATE`,
        [tenant, id, session],
      );
      if (!r.rows[0]) {
        await c.query("COMMIT");
        return;
      }
      const count = await c.query(
        `SELECT count(*)::int AS n FROM ${this.tasks} WHERE tenant_id=$1 AND assigned_runner_id=$2 AND status='leased'`,
        [tenant, id],
      );
      if (count.rows[0].n >= r.rows[0].concurrency_limit) {
        await c.query("COMMIT");
        return;
      }
      const q = await c.query(
        `WITH candidate AS (SELECT id FROM ${this.tasks} WHERE tenant_id=$1 AND status='pending' AND required_capabilities <@ $3::text[] ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
        UPDATE ${this.tasks} t SET status='leased',assigned_runner_id=$2,lease_id=$4,lease_expires_at=NOW()+timeout_seconds*INTERVAL '1 second',error=NULL,updated_at=NOW() FROM candidate WHERE t.id=candidate.id RETURNING t.*`,
        [tenant, id, r.rows[0].capabilities, randomUUID()],
      );
      await c.query("COMMIT");
      return q.rows[0] ? camel(q.rows[0]) : undefined;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async complete(
    tenant: string,
    runner: string,
    session: string,
    id: string,
    lease: string,
    status: "completed" | "failed",
    result: JsonValue | null,
    error: string | null,
  ) {
    const q = await this.pool.query(
      `UPDATE ${this.tasks} t SET status=$6,result=$7::jsonb,error=$8,lease_expires_at=NULL,updated_at=NOW()
      WHERE t.tenant_id=$1 AND t.assigned_runner_id=$2 AND t.id=$4 AND t.lease_id=$5 AND t.status='leased' AND t.lease_expires_at>NOW()
      AND EXISTS(SELECT 1 FROM ${this.runners} r WHERE r.tenant_id=$1 AND r.id=$2 AND r.session_id=$3 AND r.status='online') RETURNING t.id`,
      [
        tenant,
        runner,
        session,
        id,
        lease,
        status,
        JSON.stringify(result),
        error,
      ],
    );
    return q.rowCount === 1;
  }
  async reap() {
    // Runner expiry and task release commit together; runner locks precede task locks as in claim/disconnect.
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        `UPDATE ${this.runners} SET status='offline' WHERE status='online' AND last_heartbeat < NOW()-INTERVAL '60 seconds'`,
      );
      await c.query(
        this.releaseWhere(
          `lease_expires_at<=NOW() OR EXISTS(SELECT 1 FROM ${this.runners} r WHERE r.tenant_id=${this.tasks}.tenant_id AND r.id=${this.tasks}.assigned_runner_id AND r.status='offline')`,
        ),
      );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
}
