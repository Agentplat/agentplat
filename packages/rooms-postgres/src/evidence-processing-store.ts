import { readFile } from "node:fs/promises";
import { AgentPlatError } from "@agentplat/core";
import {
  evidenceReceiptFollowsV1,
  validateEvidenceIntakeV1,
  type EvidenceIntakeCommitV1,
  type EvidenceBatchResultV1,
  type EvidenceScopeV1,
  type EvidenceCheckpointV1,
  type EvidenceEventReceiptV1,
  type EvidenceReceiptV1,
  type EvidenceKeyV1,
  type EvidenceReceiptQueryV1,
  type IncrementalEvidenceStoreV1,
} from "@agentplat/events";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
  runPostgresMigrations,
  getPostgresMigrationStatus,
  rollbackPostgresMigration,
  postgresRollbackConfirmation,
} from "@agentplat/postgres";
import type { Pool } from "pg";

const scopeValues = (scope: EvidenceScopeV1) => [
  scope.tenantId,
  scope.consumerId,
  scope.source,
];
const keyValues = (key: EvidenceKeyV1) => [
  ...scopeValues(key),
  key.evidenceId,
  key.evidenceRevision,
];
function conflict(message: string): never {
  throw new AgentPlatError("CONFLICT", message);
}

/** Event, evidence and cursor writes are atomic. Queue state is indexed per receipt. */
export class PostgresIncrementalEvidenceStoreV1 implements IncrementalEvidenceStoreV1 {
  private readonly schema: string;
  constructor(
    private readonly pool: Pool,
    options: { schema?: string } = {},
  ) {
    this.schema = quotePostgresIdentifier(
      normalizePostgresIdentifier(
        options.schema ?? defaultPostgresSchema,
        "schema",
      ),
    );
  }
  async intake(input: EvidenceIntakeCommitV1): Promise<EvidenceBatchResultV1> {
    input = structuredClone(input);
    validateEvidenceIntakeV1(input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Serializes a single source/checkpoint, not unrelated tenant streams.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [JSON.stringify(scopeValues(input))],
      );
      const batch = (
        await client.query(
          `SELECT request_digest,result FROM ${this.schema}.evidence_intake_batches WHERE tenant_id=$1 AND consumer_id=$2 AND source=$3 AND operation_id=$4`,
          [...scopeValues(input), input.operationId],
        )
      ).rows[0];
      if (batch) {
        if (batch.request_digest !== input.requestDigest)
          conflict("Batch identity has different input");
        await client.query("COMMIT");
        return batch.result;
      }
      if (input.checkpoint) {
        const current = (
          await client.query(
            `SELECT revision FROM ${this.schema}.evidence_checkpoints WHERE tenant_id=$1 AND consumer_id=$2 AND source=$3`,
            scopeValues(input),
          )
        ).rows[0];
        if (
          (current ? Number(current.revision) : null) !==
          input.expectedCheckpointRevision
        )
          conflict("Checkpoint changed");
      }
      let insertedEvents = 0,
        insertedEvidence = 0;
      for (const event of input.events) {
        const inserted = await client.query(
          `INSERT INTO ${this.schema}.evidence_events(tenant_id,consumer_id,source,event_id,input_digest,submitted_by,received_at,event_json,evidence_keys) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb) ON CONFLICT DO NOTHING RETURNING event_id`,
          [
            ...scopeValues(input),
            event.eventId,
            event.inputDigest,
            event.submittedBy,
            event.receivedAt,
            JSON.stringify(event.event),
            JSON.stringify(event.evidence),
          ],
        );
        if (inserted.rowCount) insertedEvents++;
        else {
          const old = (
            await client.query(
              `SELECT input_digest FROM ${this.schema}.evidence_events WHERE tenant_id=$1 AND consumer_id=$2 AND source=$3 AND event_id=$4`,
              [...scopeValues(input), event.eventId],
            )
          ).rows[0];
          if (old.input_digest !== event.inputDigest)
            conflict("Event identity has different content or submitter");
        }
      }
      for (const record of input.evidence) {
        const inserted = await client.query(
          `INSERT INTO ${this.schema}.evidence_receipts(tenant_id,consumer_id,source,evidence_id,evidence_revision,input_digest,revision,status,generation,created_at,updated_at,available_at,record) VALUES($1,$2,$3,$4,$5,$6,0,'pending',0,$7,$7,$7,$8::jsonb) ON CONFLICT DO NOTHING RETURNING evidence_id`,
          [
            ...keyValues(record),
            record.inputDigest,
            record.createdAt,
            JSON.stringify(record),
          ],
        );
        if (inserted.rowCount) insertedEvidence++;
        else {
          const old = (
            await client.query(
              `SELECT input_digest FROM ${this.schema}.evidence_receipts WHERE tenant_id=$1 AND consumer_id=$2 AND source=$3 AND evidence_id=$4 AND evidence_revision=$5`,
              keyValues(record),
            )
          ).rows[0];
          if (old.input_digest !== record.inputDigest)
            conflict("Evidence identity has different content");
        }
      }
      if (input.checkpoint)
        await client.query(
          `INSERT INTO ${this.schema}.evidence_checkpoints(tenant_id,consumer_id,source,revision,record) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(tenant_id,consumer_id,source) DO UPDATE SET revision=EXCLUDED.revision,record=EXCLUDED.record`,
          [
            ...scopeValues(input),
            input.checkpoint.revision,
            JSON.stringify(input.checkpoint),
          ],
        );
      const result = {
        insertedEvents,
        insertedEvidence,
        ...(input.checkpoint ? { checkpoint: input.checkpoint } : {}),
      };
      await client.query(
        `INSERT INTO ${this.schema}.evidence_intake_batches(tenant_id,consumer_id,source,operation_id,request_digest,result) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
        [
          ...scopeValues(input),
          input.operationId,
          input.requestDigest,
          JSON.stringify(result),
        ],
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async checkpoint(
    scope: EvidenceScopeV1,
  ): Promise<EvidenceCheckpointV1 | undefined> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.evidence_checkpoints WHERE tenant_id=$1 AND consumer_id=$2 AND source=$3`,
        scopeValues(scope),
      )
    ).rows[0]?.record;
  }
  async get(key: EvidenceKeyV1): Promise<EvidenceReceiptV1 | undefined> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.evidence_receipts WHERE tenant_id=$1 AND consumer_id=$2 AND source=$3 AND evidence_id=$4 AND evidence_revision=$5`,
        keyValues(key),
      )
    ).rows[0]?.record;
  }
  async getEvent(
    scope: EvidenceScopeV1,
    eventId: string,
  ): Promise<EvidenceEventReceiptV1 | undefined> {
    const row = (
      await this.pool.query(
        `SELECT * FROM ${this.schema}.evidence_events WHERE tenant_id=$1 AND consumer_id=$2 AND source=$3 AND event_id=$4`,
        [...scopeValues(scope), eventId],
      )
    ).rows[0];
    if (!row) return undefined;
    return {
      ...scope,
      eventId: row.event_id,
      inputDigest: row.input_digest,
      submittedBy: row.submitted_by,
      receivedAt: new Date(row.received_at).toISOString(),
      evidence: row.evidence_keys,
      ...(row.event_json !== null ? { event: row.event_json } : {}),
    };
  }
  async list(
    scope: EvidenceScopeV1,
    query: EvidenceReceiptQueryV1,
  ): Promise<EvidenceReceiptV1[]> {
    const values: unknown[] = scopeValues(scope),
      conditions = ["tenant_id=$1", "consumer_id=$2", "source=$3"];
    if (query.status) {
      values.push(query.status);
      conditions.push(`status=$${values.length}`);
    }
    if (query.projection) {
      values.push(query.projection);
      conditions.push(`projection=$${values.length}`);
    }
    if (query.leaseExpiredAt) {
      values.push(query.leaseExpiredAt);
      conditions.push(`lease_until<=$${values.length}::timestamptz`);
    }
    if (query.readyAt) {
      values.push(query.readyAt);
      conditions.push(`available_at<=$${values.length}::timestamptz`);
    }
    if (query.uncompactedBefore) {
      values.push(query.uncompactedBefore);
      conditions.push(
        `compacted_at IS NULL AND updated_at<$${values.length}::timestamptz`,
      );
    }
    if (query.after) {
      values.push(
        query.after.createdAt,
        query.after.evidenceId,
        query.after.evidenceRevision,
      );
      conditions.push(
        `(created_at,evidence_id COLLATE "C",evidence_revision COLLATE "C")>($${values.length - 2}::timestamptz,$${values.length - 1}::text COLLATE "C",$${values.length}::text COLLATE "C")`,
      );
    }
    values.push(query.limit);
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.evidence_receipts WHERE ${conditions.join(" AND ")} ORDER BY created_at,evidence_id COLLATE "C",evidence_revision COLLATE "C" LIMIT $${values.length}`,
        values,
      )
    ).rows.map((row) => row.record);
  }
  async compareAndSet(record: EvidenceReceiptV1, expected: number) {
    record = structuredClone(record);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const old = (
        await client.query(
          `SELECT record FROM ${this.schema}.evidence_receipts WHERE tenant_id=$1 AND consumer_id=$2 AND source=$3 AND evidence_id=$4 AND evidence_revision=$5 FOR UPDATE`,
          keyValues(record),
        )
      ).rows[0]?.record;
      if (!old || !evidenceReceiptFollowsV1(record, old, expected)) {
        await client.query("ROLLBACK");
        return false;
      }
      await client.query(
        `UPDATE ${this.schema}.evidence_receipts SET revision=$6,status=$7,generation=$8,lease_until=$9,projection=$10,updated_at=$11,compacted_at=$12,record=$13::jsonb,available_at=$14 WHERE tenant_id=$1 AND consumer_id=$2 AND source=$3 AND evidence_id=$4 AND evidence_revision=$5`,
        [
          ...keyValues(record),
          record.revision,
          record.status,
          record.generation,
          record.lease?.until ?? null,
          record.projection ?? null,
          record.updatedAt,
          record.compactedAt ?? null,
          JSON.stringify(record),
          record.availableAt,
        ],
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async compactEvents(scope: EvidenceScopeV1, before: string, limit: number) {
    return (
      (
        await this.pool.query(
          `WITH selected AS (SELECT e.event_id FROM ${this.schema}.evidence_events e WHERE e.tenant_id=$1 AND e.consumer_id=$2 AND e.source=$3 AND e.received_at<$4::timestamptz AND e.event_json IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(e.evidence_keys) k LEFT JOIN ${this.schema}.evidence_receipts r ON r.tenant_id=e.tenant_id AND r.consumer_id=e.consumer_id AND r.source=e.source AND r.evidence_id=k->>'evidenceId' AND r.evidence_revision=k->>'evidenceRevision' WHERE r.evidence_id IS NULL OR r.status<>'completed' OR r.projection IS DISTINCT FROM 'applied') ORDER BY e.received_at,e.event_id LIMIT $5 FOR UPDATE OF e SKIP LOCKED) UPDATE ${this.schema}.evidence_events e SET event_json=NULL FROM selected s WHERE e.tenant_id=$1 AND e.consumer_id=$2 AND e.source=$3 AND e.event_id=s.event_id`,
          [...scopeValues(scope), before, limit],
        )
      ).rowCount ?? 0
    );
  }
}
const applicationId = "@agentplat/incremental-evidence";
async function migrations() {
  return [
    {
      version: 1,
      name: "001_incremental_evidence",
      destructiveDown: true,
      up: await readFile(
        new URL(
          "../migrations/incremental-evidence/001_incremental_evidence.up.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      down: await readFile(
        new URL(
          "../migrations/incremental-evidence/001_incremental_evidence.down.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    },
  ];
}
export async function runIncrementalEvidenceMigrations(
  pool: Pool,
  options: { schema?: string; createSchema?: boolean } = {},
) {
  return runPostgresMigrations(pool, {
    applicationId,
    ...options,
    migrations: await migrations(),
  });
}
export async function getIncrementalEvidenceMigrationStatus(
  pool: Pool,
  options: { schema?: string } = {},
) {
  return getPostgresMigrationStatus(pool, {
    applicationId,
    ...options,
    migrations: await migrations(),
  });
}
export function incrementalEvidenceRollbackConfirmation(
  schema = defaultPostgresSchema,
) {
  return postgresRollbackConfirmation(applicationId, schema, 1);
}
export async function rollbackIncrementalEvidenceMigrations(
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
