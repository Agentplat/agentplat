import {
  WorkflowValidationErrorV1,
  validateProcessDefinitionV1,
  validateProcessRunV1,
  validateProcessSignalV1,
  validateTaskDefinitionV1,
  validateTaskRunV1,
  type ProcessDefinitionV1,
  type ProcessRunV1,
  type ProcessSignalV1,
  type SubjectReferenceV1,
  type TaskDefinitionV1,
  type TaskRunStatusV1,
  type TaskRunV1,
  type WorkflowDigestV1,
  type WorkflowOperationRecordV1,
  type WorkflowStoreV1,
} from "@agentplat/workflows";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool, PoolClient } from "pg";

export interface PostgresWorkflowStoreOptionsV1 {
  readonly schema?: string;
}

interface JsonRow {
  readonly value: unknown;
}

/** PostgreSQL implementation of the portable WorkflowStoreV1 contract. */
export class PostgresWorkflowStoreV1 implements WorkflowStoreV1 {
  readonly #prefix: string;

  constructor(
    readonly pool: Pool,
    options: PostgresWorkflowStoreOptionsV1 = {},
  ) {
    if (!pool) throw new TypeError("PostgreSQL workflow pool is required");
    this.#prefix = `${quotePostgresIdentifier(
      normalizePostgresIdentifier(
        options.schema ?? defaultPostgresSchema,
        "schema",
      ),
    )}.`;
  }

  async registerTaskDefinition(
    tenantId: string,
    definitionInput: TaskDefinitionV1,
  ): Promise<"created" | "replayed"> {
    required(tenantId, "tenantId");
    const definition = validateTaskDefinitionV1(definitionInput);
    const result = await this.pool.query(
      `INSERT INTO ${this.#prefix}workflow_task_definitions
        (tenant_id, task_definition_id, task_definition_version,
         definition_digest, definition)
       VALUES ($1,$2,$3,$4,$5::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        tenantId,
        definition.taskDefinitionId,
        definition.version,
        definition.definitionDigest,
        JSON.stringify(definition),
      ],
    );
    if ((result.rowCount ?? 0) === 1) return "created";
    const current = await this.getTaskDefinition(
      tenantId,
      definition.taskDefinitionId,
      definition.version,
    );
    if (!current || current.definitionDigest !== definition.definitionDigest)
      conflict("workflow_task_definition_conflict");
    return "replayed";
  }

  async getTaskDefinition(
    tenantId: string,
    taskDefinitionId: string,
    taskDefinitionVersion: string,
  ): Promise<TaskDefinitionV1 | undefined> {
    required(tenantId, "tenantId");
    required(taskDefinitionId, "taskDefinitionId");
    required(taskDefinitionVersion, "taskDefinitionVersion");
    const result = await this.pool.query<JsonRow>(
      `SELECT definition AS value
         FROM ${this.#prefix}workflow_task_definitions
        WHERE tenant_id=$1 AND task_definition_id=$2
          AND task_definition_version=$3`,
      [tenantId, taskDefinitionId, taskDefinitionVersion],
    );
    return result.rows[0]
      ? validateTaskDefinitionV1(result.rows[0].value as TaskDefinitionV1)
      : undefined;
  }

  async registerProcessDefinition(
    tenantId: string,
    definitionInput: ProcessDefinitionV1,
  ): Promise<"created" | "replayed"> {
    required(tenantId, "tenantId");
    const definition = validateProcessDefinitionV1(definitionInput);
    const result = await this.pool.query(
      `INSERT INTO ${this.#prefix}workflow_process_definitions
        (tenant_id, process_id, process_version, definition_digest, definition)
       VALUES ($1,$2,$3,$4,$5::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        tenantId,
        definition.processId,
        definition.version,
        definition.definitionDigest,
        JSON.stringify(definition),
      ],
    );
    if ((result.rowCount ?? 0) === 1) return "created";
    const current = await this.getProcessDefinition(
      tenantId,
      definition.processId,
      definition.version,
    );
    if (!current || current.definitionDigest !== definition.definitionDigest)
      conflict("workflow_process_definition_conflict");
    return "replayed";
  }

  async getProcessDefinition(
    tenantId: string,
    processId: string,
    processVersion: string,
  ): Promise<ProcessDefinitionV1 | undefined> {
    required(tenantId, "tenantId");
    required(processId, "processId");
    required(processVersion, "processVersion");
    const result = await this.pool.query<JsonRow>(
      `SELECT definition AS value
         FROM ${this.#prefix}workflow_process_definitions
        WHERE tenant_id=$1 AND process_id=$2 AND process_version=$3`,
      [tenantId, processId, processVersion],
    );
    return result.rows[0]
      ? validateProcessDefinitionV1(result.rows[0].value as ProcessDefinitionV1)
      : undefined;
  }

  async createProcessRun(runInput: ProcessRunV1): Promise<boolean> {
    const run = validateProcessRunV1(runInput);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO ${this.#prefix}workflow_process_runs
          (tenant_id,run_id,process_id,process_version,definition_digest,
           revision,state_digest,status,subject_type,subject_id,state,
           created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)
         ON CONFLICT DO NOTHING`,
        processRunValues(run),
      );
      if ((result.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        return false;
      }
      await this.#appendTransition(client, run, null);
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async getProcessRun(
    tenantId: string,
    runId: string,
  ): Promise<ProcessRunV1 | undefined> {
    required(tenantId, "tenantId");
    required(runId, "runId");
    const result = await this.pool.query<JsonRow>(
      `SELECT state AS value FROM ${this.#prefix}workflow_process_runs
        WHERE tenant_id=$1 AND run_id=$2`,
      [tenantId, runId],
    );
    return result.rows[0]
      ? validateProcessRunV1(result.rows[0].value as ProcessRunV1)
      : undefined;
  }

  async listRunnableProcessRuns(input: {
    readonly tenantId?: string;
    readonly limit: number;
  }): Promise<ProcessRunV1[]> {
    limit(input.limit, "limit", 1_000);
    const values: unknown[] = [];
    const tenant = input.tenantId
      ? `tenant_id=$${values.push(input.tenantId)}`
      : "TRUE";
    values.push(input.limit);
    const result = await this.pool.query<JsonRow>(
      `SELECT state AS value FROM ${this.#prefix}workflow_process_runs
        WHERE ${tenant} AND status IN ('pending','running','waiting','canceling')
        ORDER BY updated_at,run_id LIMIT $${values.length}`,
      values,
    );
    return result.rows.map((row) =>
      validateProcessRunV1(row.value as ProcessRunV1),
    );
  }

  async listProcessRuns(input: {
    readonly tenantId: string;
    readonly status?: ProcessRunV1["status"];
    readonly updatedBefore?: string;
    readonly limit?: number;
  }): Promise<ProcessRunV1[]> {
    required(input.tenantId, "tenantId");
    const maximum = input.limit ?? 100;
    limit(maximum, "limit", 1_000);
    const values: unknown[] = [input.tenantId];
    const conditions = ["tenant_id=$1"];
    if (input.status) {
      conditions.push(`status=$${values.push(input.status)}`);
    }
    if (input.updatedBefore) {
      conditions.push(`updated_at<$${values.push(input.updatedBefore)}`);
    }
    values.push(maximum);
    const result = await this.pool.query<JsonRow>(
      `SELECT state AS value FROM ${this.#prefix}workflow_process_runs
        WHERE ${conditions.join(" AND ")}
        ORDER BY updated_at,run_id LIMIT $${values.length}`,
      values,
    );
    return result.rows.map((row) =>
      validateProcessRunV1(row.value as ProcessRunV1),
    );
  }

  async compareAndSetProcessRun(input: {
    readonly expectedRevision: number;
    readonly expectedStateDigest: WorkflowDigestV1;
    readonly run: ProcessRunV1;
  }): Promise<boolean> {
    const run = validateProcessRunV1(input.run);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE ${this.#prefix}workflow_process_runs SET
          process_id=$3,process_version=$4,definition_digest=$5,revision=$6,
          state_digest=$7,status=$8,subject_type=$9,subject_id=$10,
          state=$11::jsonb,updated_at=$12
         WHERE tenant_id=$1 AND run_id=$2 AND revision=$13 AND state_digest=$14
           AND process_id=$3 AND process_version=$4 AND definition_digest=$5`,
        [
          ...processRunUpdateValues(run),
          input.expectedRevision,
          input.expectedStateDigest,
        ],
      );
      if ((result.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        return false;
      }
      await this.#appendTransition(client, run, input.expectedStateDigest);
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async createTaskRun(runInput: TaskRunV1): Promise<boolean> {
    const run = validateTaskRunV1(runInput);
    const result = await this.pool.query(
      `INSERT INTO ${this.#prefix}workflow_task_runs
        (tenant_id,task_run_id,process_run_id,stage_id,attempt,revision,
         idempotency_key,input_digest,binding_digest,lease_owner_id,lease_token,
         lease_generation,lease_expires_at,status,subject_type,subject_id,
         state_digest,state,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20)
       ON CONFLICT DO NOTHING`,
      taskRunValues(run),
    );
    if ((result.rowCount ?? 0) === 1) return true;
    const current = await this.getTaskRun(run.tenantId, run.taskRunId);
    if (current) {
      if (current.stateDigest !== run.stateDigest)
        conflict("workflow_task_run_identity_conflict");
      return false;
    }
    const idempotent = await this.findTaskRunByIdempotencyKey(
      run.tenantId,
      run.idempotencyKey,
    );
    if (idempotent) conflict("workflow_task_idempotency_conflict");
    conflict("workflow_task_run_insert_conflict");
  }

  async getTaskRun(
    tenantId: string,
    taskRunId: string,
  ): Promise<TaskRunV1 | undefined> {
    required(tenantId, "tenantId");
    required(taskRunId, "taskRunId");
    const result = await this.pool.query<JsonRow>(
      `SELECT state AS value FROM ${this.#prefix}workflow_task_runs
        WHERE tenant_id=$1 AND task_run_id=$2`,
      [tenantId, taskRunId],
    );
    return result.rows[0]
      ? validateTaskRunV1(result.rows[0].value as TaskRunV1)
      : undefined;
  }

  async findTaskRunByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<TaskRunV1 | undefined> {
    required(tenantId, "tenantId");
    required(idempotencyKey, "idempotencyKey");
    const result = await this.pool.query<JsonRow>(
      `SELECT state AS value FROM ${this.#prefix}workflow_task_runs
        WHERE tenant_id=$1 AND idempotency_key=$2`,
      [tenantId, idempotencyKey],
    );
    return result.rows[0]
      ? validateTaskRunV1(result.rows[0].value as TaskRunV1)
      : undefined;
  }

  async listTaskRuns(input: {
    readonly tenantId: string;
    readonly processRunId?: string;
    readonly status?: TaskRunStatusV1;
    readonly subject?: SubjectReferenceV1;
  }): Promise<TaskRunV1[]> {
    required(input.tenantId, "tenantId");
    const values: unknown[] = [input.tenantId];
    const conditions = ["tenant_id=$1"];
    if (input.processRunId)
      conditions.push(`process_run_id=$${values.push(input.processRunId)}`);
    if (input.status) conditions.push(`status=$${values.push(input.status)}`);
    if (input.subject) {
      conditions.push(
        `subject_type=$${values.push(input.subject.subjectType)}`,
      );
      conditions.push(`subject_id=$${values.push(input.subject.subjectId)}`);
    }
    const result = await this.pool.query<JsonRow>(
      `SELECT state AS value FROM ${this.#prefix}workflow_task_runs
        WHERE ${conditions.join(" AND ")} ORDER BY created_at,task_run_id`,
      values,
    );
    return result.rows.map((row) => validateTaskRunV1(row.value as TaskRunV1));
  }

  async listStuckTaskRuns(input: {
    readonly tenantId: string;
    readonly updatedBefore: string;
    readonly limit?: number;
  }): Promise<TaskRunV1[]> {
    required(input.tenantId, "tenantId");
    const maximum = input.limit ?? 100;
    limit(maximum, "limit", 1_000);
    const result = await this.pool.query<JsonRow>(
      `SELECT state AS value FROM ${this.#prefix}workflow_task_runs
        WHERE tenant_id=$1 AND status IN ('claimed','running','indeterminate')
          AND updated_at<$2
        ORDER BY updated_at,task_run_id LIMIT $3`,
      [input.tenantId, input.updatedBefore, maximum],
    );
    return result.rows.map((row) => validateTaskRunV1(row.value as TaskRunV1));
  }

  async listExpiredTaskRuns(input: {
    readonly tenantId: string;
    readonly logicalTime: string;
    readonly limit?: number;
  }): Promise<TaskRunV1[]> {
    required(input.tenantId, "tenantId");
    const maximum = input.limit ?? 100;
    limit(maximum, "limit", 1_000);
    const result = await this.pool.query<JsonRow>(
      `SELECT state AS value FROM ${this.#prefix}workflow_task_runs
        WHERE tenant_id=$1 AND status IN ('claimed','running')
          AND lease_expires_at<=$2
        ORDER BY lease_expires_at,task_run_id LIMIT $3`,
      [input.tenantId, input.logicalTime, maximum],
    );
    return result.rows.map((row) => validateTaskRunV1(row.value as TaskRunV1));
  }

  async compareAndSetTaskRun(input: {
    readonly expectedRevision: number;
    readonly expectedStateDigest: WorkflowDigestV1;
    readonly run: TaskRunV1;
  }): Promise<boolean> {
    const run = validateTaskRunV1(input.run);
    const result = await this.pool.query(
      `UPDATE ${this.#prefix}workflow_task_runs SET
        process_run_id=$3,stage_id=$4,attempt=$5,revision=$6,
        idempotency_key=$7,input_digest=$8,binding_digest=$9,
        lease_owner_id=$10,lease_token=$11,lease_generation=$12,
        lease_expires_at=$13,status=$14,subject_type=$15,subject_id=$16,
        state_digest=$17,state=$18::jsonb,updated_at=$19
       WHERE tenant_id=$1 AND task_run_id=$2 AND revision=$20
         AND state_digest=$21 AND process_run_id=$3 AND stage_id=$4
         AND attempt=$5 AND idempotency_key=$7 AND input_digest=$8
         AND binding_digest=$9`,
      [
        ...taskRunUpdateValues(run),
        input.expectedRevision,
        input.expectedStateDigest,
      ],
    );
    return (result.rowCount ?? 0) === 1;
  }

  async getOperation(
    tenantId: string,
    operationKind: WorkflowOperationRecordV1["operationKind"],
    idempotencyKey: string,
  ): Promise<WorkflowOperationRecordV1 | undefined> {
    const result = await this.pool.query<JsonRow>(
      `SELECT operation AS value FROM ${this.#prefix}workflow_operations
        WHERE tenant_id=$1 AND operation_kind=$2 AND idempotency_key=$3`,
      [tenantId, operationKind, idempotencyKey],
    );
    return result.rows[0] ? validateOperation(result.rows[0].value) : undefined;
  }

  async saveOperation(
    recordInput: WorkflowOperationRecordV1,
  ): Promise<boolean> {
    const record = validateOperation(recordInput);
    const result = await this.pool.query(
      `INSERT INTO ${this.#prefix}workflow_operations
        (tenant_id,operation_kind,idempotency_key,request_digest,run_id,operation)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT DO NOTHING`,
      [
        record.tenantId,
        record.operationKind,
        record.idempotencyKey,
        record.requestDigest,
        record.runId,
        JSON.stringify(record),
      ],
    );
    if ((result.rowCount ?? 0) === 1) return true;
    const current = await this.getOperation(
      record.tenantId,
      record.operationKind,
      record.idempotencyKey,
    );
    if (
      !current ||
      current.requestDigest !== record.requestDigest ||
      current.runId !== record.runId
    )
      conflict("workflow_operation_idempotency_conflict");
    return false;
  }

  async countOperations(tenantId: string, runId: string): Promise<number> {
    const result = await this.pool.query<{ readonly count: string | number }>(
      `SELECT count(*) AS count FROM ${this.#prefix}workflow_operations
        WHERE tenant_id=$1 AND run_id=$2`,
      [tenantId, runId],
    );
    const count = Number(result.rows[0]?.count ?? 0);
    if (!Number.isSafeInteger(count) || count < 0)
      throw new TypeError("workflow_operation_count_invalid");
    return count;
  }

  async appendSignal(
    signalInput: ProcessSignalV1,
  ): Promise<"created" | "replayed"> {
    const signal = validateProcessSignalV1(signalInput);
    const result = await this.pool.query(
      `INSERT INTO ${this.#prefix}workflow_signals
        (tenant_id,run_id,signal_id,signal_type,correlation_key,signal_digest,
         received_at,signal)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT DO NOTHING`,
      [
        signal.tenantId,
        signal.runId,
        signal.signalId,
        signal.signalType,
        signal.correlationKey ?? null,
        signal.signalDigest,
        signal.receivedAt,
        JSON.stringify(signal),
      ],
    );
    if ((result.rowCount ?? 0) === 1) return "created";
    const current = (
      await this.pool.query<JsonRow>(
        `SELECT signal AS value FROM ${this.#prefix}workflow_signals
          WHERE tenant_id=$1 AND run_id=$2 AND signal_id=$3`,
        [signal.tenantId, signal.runId, signal.signalId],
      )
    ).rows[0];
    if (
      !current ||
      validateProcessSignalV1(current.value as ProcessSignalV1).signalDigest !==
        signal.signalDigest
    )
      conflict("workflow_signal_idempotency_conflict");
    return "replayed";
  }

  async listSignals(
    tenantId: string,
    runId: string,
  ): Promise<ProcessSignalV1[]> {
    const result = await this.pool.query<JsonRow>(
      `SELECT signal AS value FROM ${this.#prefix}workflow_signals
        WHERE tenant_id=$1 AND run_id=$2 ORDER BY received_at,signal_id`,
      [tenantId, runId],
    );
    return result.rows.map((row) =>
      validateProcessSignalV1(row.value as ProcessSignalV1),
    );
  }

  async #appendTransition(
    client: PoolClient,
    run: ProcessRunV1,
    predecessorStateDigest: WorkflowDigestV1 | null,
  ): Promise<void> {
    await client.query(
      `INSERT INTO ${this.#prefix}workflow_transition_events
        (tenant_id,run_id,revision,predecessor_state_digest,state_digest,
         status,state,occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [
        run.tenantId,
        run.runId,
        run.revision,
        predecessorStateDigest,
        run.stateDigest,
        run.status,
        JSON.stringify(run),
        run.updatedAt,
      ],
    );
  }
}

function processRunValues(run: ProcessRunV1): unknown[] {
  return [
    run.tenantId,
    run.runId,
    run.processId,
    run.processVersion,
    run.definitionDigest,
    run.revision,
    run.stateDigest,
    run.status,
    run.subject?.subjectType ?? null,
    run.subject?.subjectId ?? null,
    JSON.stringify(run),
    run.createdAt,
    run.updatedAt,
  ];
}

function processRunUpdateValues(run: ProcessRunV1): unknown[] {
  return [
    run.tenantId,
    run.runId,
    run.processId,
    run.processVersion,
    run.definitionDigest,
    run.revision,
    run.stateDigest,
    run.status,
    run.subject?.subjectType ?? null,
    run.subject?.subjectId ?? null,
    JSON.stringify(run),
    run.updatedAt,
  ];
}

function taskRunValues(run: TaskRunV1): unknown[] {
  return [
    run.tenantId,
    run.taskRunId,
    run.processRunId,
    run.stageId,
    run.attempt,
    run.revision,
    run.idempotencyKey,
    run.inputDigest,
    run.binding.bindingDigest,
    run.leaseOwnerId,
    run.leaseToken,
    run.leaseGeneration,
    run.leaseExpiresAt,
    run.status,
    run.subject?.subjectType ?? null,
    run.subject?.subjectId ?? null,
    run.stateDigest,
    JSON.stringify(run),
    run.createdAt,
    run.updatedAt,
  ];
}

function taskRunUpdateValues(run: TaskRunV1): unknown[] {
  return [
    run.tenantId,
    run.taskRunId,
    run.processRunId,
    run.stageId,
    run.attempt,
    run.revision,
    run.idempotencyKey,
    run.inputDigest,
    run.binding.bindingDigest,
    run.leaseOwnerId,
    run.leaseToken,
    run.leaseGeneration,
    run.leaseExpiresAt,
    run.status,
    run.subject?.subjectType ?? null,
    run.subject?.subjectId ?? null,
    run.stateDigest,
    JSON.stringify(run),
    run.updatedAt,
  ];
}

function validateOperation(input: unknown): WorkflowOperationRecordV1 {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new TypeError("workflow_operation_invalid");
  const value = input as Record<string, unknown>;
  const expected = [
    "tenantId",
    "operationKind",
    "idempotencyKey",
    "requestDigest",
    "runId",
  ].sort();
  const actual = Object.getOwnPropertyNames(value).sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index]) ||
    typeof value.tenantId !== "string" ||
    !["start", "signal", "cancel", "advance"].includes(
      String(value.operationKind),
    ) ||
    typeof value.idempotencyKey !== "string" ||
    typeof value.runId !== "string" ||
    typeof value.requestDigest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/u.test(value.requestDigest)
  )
    throw new TypeError("workflow_operation_invalid");
  return Object.freeze({ ...value }) as unknown as WorkflowOperationRecordV1;
}

function required(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 160)
    throw new TypeError(`workflow_${label}_invalid`);
}

function limit(value: unknown, label: string, maximum: number): void {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > maximum
  )
    throw new RangeError(`workflow_${label}_invalid`);
}

function conflict(message: string): never {
  throw new WorkflowValidationErrorV1(message);
}
