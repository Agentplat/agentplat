import { readFile } from "node:fs/promises";
import { AgentPlatError } from "@agentplat/core";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
  runPostgresMigrations,
  getPostgresMigrationStatus,
  rollbackPostgresMigration,
  postgresRollbackConfirmation,
} from "@agentplat/postgres";
import type { Pool, PoolClient } from "pg";
import type {
  SharedBudgetStoreV1,
  SharedBudgetScopeV1,
  SharedBudgetTransactionV1,
  SharedBudgetPeriodV1,
  SharedBudgetReservationV1,
  ScheduledFollowupStoreV1,
  ScheduledFollowupScopeV1,
  ScheduledFollowupTransactionV1,
  ScheduledFollowupHeadV1,
  ScheduledActivationV1,
  ScheduledDeliveryV1,
} from "@agentplat/rooms";

function schemaName(schema?: string) {
  return quotePostgresIdentifier(
    normalizePostgresIdentifier(schema ?? defaultPostgresSchema, "schema"),
  );
}
async function atomic<T>(
  pool: Pool,
  lock: unknown,
  work: (client: PoolClient) => Promise<T>,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      JSON.stringify(lock),
    ]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
function check(record: { tenantId: string }, tenantId: string) {
  if (record.tenantId !== tenantId)
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Cross-tenant operation write",
    );
}
export class PostgresSharedBudgetStoreV1 implements SharedBudgetStoreV1 {
  private schema: string;
  constructor(
    private pool: Pool,
    options: { schema?: string } = {},
  ) {
    this.schema = schemaName(options.schema);
  }
  transaction<T>(
    scope: SharedBudgetScopeV1,
    work: (tx: SharedBudgetTransactionV1) => Promise<T>,
  ) {
    scope = structuredClone(scope);
    return atomic(
      this.pool,
      [this.schema, "shared-budget", scope.tenantId, scope.accountId],
      async (client) => {
        const args = [scope.tenantId, scope.accountId];
        const one = async <R>(table: string, id: string) =>
          (
            await client.query(
              `SELECT record FROM ${this.schema}.${table} WHERE tenant_id=$1 AND account_id=$2 AND id=$3`,
              [...args, id],
            )
          ).rows[0]?.record as R | undefined;
        const ensure = (r: SharedBudgetScopeV1) => {
          check(r, scope.tenantId);
          if (r.accountId !== scope.accountId)
            throw new AgentPlatError(
              "VALIDATION_ERROR",
              "Cross-account operation write",
            );
        };
        return work({
          period: (id) =>
            one<SharedBudgetPeriodV1>("shared_budget_periods", id),
          periods: async (start, end) =>
            (
              await client.query(
                `SELECT record FROM ${this.schema}.shared_budget_periods WHERE tenant_id=$1 AND account_id=$2 AND starts_at<$4::timestamptz AND ends_at>$3::timestamptz ORDER BY starts_at`,
                [...args, start, end],
              )
            ).rows.map((r) => r.record),
          putPeriod: async (r) => {
            ensure(r);
            await client.query(
              `INSERT INTO ${this.schema}.shared_budget_periods(tenant_id,account_id,id,starts_at,ends_at,record) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(tenant_id,account_id,id) DO UPDATE SET record=EXCLUDED.record`,
              [...args, r.id, r.startsAt, r.endsAt, JSON.stringify(r)],
            );
          },
          reservation: (id) =>
            one<SharedBudgetReservationV1>("shared_budget_reservations", id),
          reservations: async (periodId, after, limit) =>
            (
              await client.query(
                `SELECT record FROM ${this.schema}.shared_budget_reservations WHERE tenant_id=$1 AND account_id=$2 AND period_id=$3 AND ($4::text IS NULL OR id COLLATE "C">$4::text COLLATE "C") ORDER BY id COLLATE "C" LIMIT $5`,
                [...args, periodId, after ?? null, limit],
              )
            ).rows.map((r) => r.record),
          putReservation: async (r) => {
            ensure(r);
            await client.query(
              `INSERT INTO ${this.schema}.shared_budget_reservations(tenant_id,account_id,id,period_id,status,expires_at,record) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(tenant_id,account_id,id) DO UPDATE SET status=EXCLUDED.status,record=EXCLUDED.record`,
              [
                ...args,
                r.operationId,
                r.periodId,
                r.status,
                r.expiresAt,
                JSON.stringify(r),
              ],
            );
          },
          configuration: (id) => one("shared_budget_configurations", id),
          putConfiguration: async (id, r) => {
            ensure(r.period);
            await client.query(
              `INSERT INTO ${this.schema}.shared_budget_configurations(tenant_id,account_id,id,record) VALUES($1,$2,$3,$4::jsonb)`,
              [...args, id, JSON.stringify(r)],
            );
          },
        });
      },
    );
  }
}
export class PostgresScheduledFollowupStoreV1 implements ScheduledFollowupStoreV1 {
  private schema: string;
  constructor(
    private pool: Pool,
    options: { schema?: string } = {},
  ) {
    this.schema = schemaName(options.schema);
  }
  transaction<T>(
    scope: ScheduledFollowupScopeV1,
    work: (tx: ScheduledFollowupTransactionV1) => Promise<T>,
  ) {
    scope = structuredClone(scope);
    return atomic(
      this.pool,
      [this.schema, "scheduled-followup", scope.tenantId, scope.subjectId],
      async (client) => {
        const args = [scope.tenantId, scope.subjectId];
        const one = async <R>(table: string, id: string) =>
          (
            await client.query(
              `SELECT record FROM ${this.schema}.${table} WHERE tenant_id=$1 AND subject_id=$2 AND id=$3`,
              [...args, id],
            )
          ).rows[0]?.record as R | undefined;
        const ensure = (r: ScheduledFollowupScopeV1) => {
          check(r, scope.tenantId);
          if (r.subjectId !== scope.subjectId)
            throw new AgentPlatError(
              "VALIDATION_ERROR",
              "Cross-subject operation write",
            );
        };
        return work({
          head: () =>
            one<ScheduledFollowupHeadV1>("scheduled_followup_heads", "head"),
          putHead: async (r) => {
            ensure(r);
            await client.query(
              `INSERT INTO ${this.schema}.scheduled_followup_heads(tenant_id,subject_id,id,record) VALUES($1,$2,'head',$3::jsonb) ON CONFLICT(tenant_id,subject_id,id) DO UPDATE SET record=EXCLUDED.record`,
              [...args, JSON.stringify(r)],
            );
          },
          activation: (id) =>
            one<ScheduledActivationV1>("scheduled_activations", id),
          putActivation: async (r) => {
            ensure(r);
            await client.query(
              `INSERT INTO ${this.schema}.scheduled_activations(tenant_id,subject_id,id,room_id,status,at,ready_at,record) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT(tenant_id,subject_id,id) DO UPDATE SET status=EXCLUDED.status,ready_at=EXCLUDED.ready_at,record=EXCLUDED.record`,
              [
                ...args,
                r.id,
                r.roomId,
                r.status,
                r.at,
                r.retryAt && r.retryAt > r.at ? r.retryAt : r.at,
                JSON.stringify(r),
              ],
            );
          },
          delivery: (id) =>
            one<ScheduledDeliveryV1>("scheduled_deliveries", id),
          putDelivery: async (r) => {
            ensure(r);
            await client.query(
              `INSERT INTO ${this.schema}.scheduled_deliveries(tenant_id,subject_id,id,room_id,status,available_at,lease_until,record) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT(tenant_id,subject_id,id) DO UPDATE SET status=EXCLUDED.status,available_at=EXCLUDED.available_at,lease_until=EXCLUDED.lease_until,record=EXCLUDED.record`,
              [
                ...args,
                r.id,
                r.roomId,
                r.status,
                r.availableAt,
                r.claim?.until ?? null,
                JSON.stringify(r),
              ],
            );
          },
          operation: (id) => one("scheduled_followup_operations", id),
          putOperation: async (id, r) => {
            ensure(r.value);
            await client.query(
              `INSERT INTO ${this.schema}.scheduled_followup_operations(tenant_id,subject_id,id,record) VALUES($1,$2,$3,$4::jsonb)`,
              [...args, id, JSON.stringify(r)],
            );
          },
        });
      },
    );
  }
  async due(
    tenantId: string,
    roomIds: string[],
    now: string,
    limit: number,
  ): Promise<ScheduledActivationV1[]> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.scheduled_activations WHERE tenant_id=$1 AND room_id=ANY($2::text[]) AND status='planned' AND ready_at<=$3::timestamptz ORDER BY at,id COLLATE "C" LIMIT $4`,
        [tenantId, roomIds, now, limit],
      )
    ).rows.map((r) => r.record);
  }
  async pending(
    tenantId: string,
    roomIds: string[],
    now: string,
    limit: number,
  ): Promise<ScheduledDeliveryV1[]> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.scheduled_deliveries WHERE tenant_id=$1 AND room_id=ANY($2::text[]) AND ((status='pending' AND available_at<=$3::timestamptz) OR (status='delivering' AND lease_until<=$3::timestamptz)) ORDER BY available_at,id COLLATE "C" LIMIT $4`,
        [tenantId, roomIds, now, limit],
      )
    ).rows.map((r) => r.record);
  }
  async delivery(
    tenantId: string,
    id: string,
  ): Promise<ScheduledDeliveryV1 | undefined> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.scheduled_deliveries WHERE tenant_id=$1 AND id=$2`,
        [tenantId, id],
      )
    ).rows[0]?.record;
  }
  async list(
    tenantId: string,
    roomIds: string[],
    query: {
      status?: ScheduledDeliveryV1["status"];
      after?: string;
      limit: number;
    },
  ): Promise<ScheduledDeliveryV1[]> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.scheduled_deliveries WHERE tenant_id=$1 AND room_id=ANY($2::text[]) AND ($3::text IS NULL OR status=$3) AND ($4::text IS NULL OR id COLLATE "C">$4::text COLLATE "C") ORDER BY id COLLATE "C" LIMIT $5`,
        [
          tenantId,
          roomIds,
          query.status ?? null,
          query.after ?? null,
          query.limit,
        ],
      )
    ).rows.map((r) => r.record);
  }
}

const applicationId = "@agentplat/planner-operations";
async function migrations() {
  return [
    {
      version: 1,
      name: "001_planner_operations",
      destructiveDown: true,
      up: await readFile(
        new URL(
          "../migrations/planner-operations/001_planner_operations.up.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      down: await readFile(
        new URL(
          "../migrations/planner-operations/001_planner_operations.down.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    },
  ];
}
export async function runPlannerOperationsMigrations(
  pool: Pool,
  options: { schema?: string; createSchema?: boolean } = {},
) {
  return runPostgresMigrations(pool, {
    applicationId,
    ...options,
    migrations: await migrations(),
  });
}
export async function getPlannerOperationsMigrationStatus(
  pool: Pool,
  options: { schema?: string } = {},
) {
  return getPostgresMigrationStatus(pool, {
    applicationId,
    ...options,
    migrations: await migrations(),
  });
}
export function plannerOperationsRollbackConfirmation(
  schema = defaultPostgresSchema,
) {
  return postgresRollbackConfirmation(applicationId, schema, 1);
}
export async function rollbackPlannerOperationsMigrations(
  pool: Pool,
  options: {
    schema?: string;
    expectedCurrentVersion: number;
    confirm: string;
    allowDataLoss?: boolean;
  },
) {
  return rollbackPostgresMigration(pool, {
    applicationId,
    ...options,
    createSchema: false,
    migrations: await migrations(),
  });
}
