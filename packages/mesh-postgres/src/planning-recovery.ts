import {
  assertSnapshotHighWatersNotLoweredV1,
  createCollectivePlanningSnapshotV1,
  restorePlanningReducerSnapshotV1,
  validatePlanningReducerSnapshotV1,
} from "@agentplat/collective-planning";
import type { PlanningReducerSnapshotV1 } from "@agentplat/collective-planning";
import { computeMeshDurableValueDigest } from "@agentplat/mesh/durability";
import { canonicalizeMeshJsonBytes } from "@agentplat/mesh-protocol";
import type { MeshJsonValue } from "@agentplat/mesh-protocol";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool, PoolClient, QueryResultRow } from "pg";

export const PLANNING_RECOVERY_DURABILITY_SCHEMA_VERSION = 1 as const;
export const PLANNING_RECOVERY_DURABILITY_GENESIS_DIGEST =
  "sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/** A stream is permanently bound to one local reducer, intent revision and policy. */
export interface PlanningRecoveryDurableScopeV1 {
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly missionId: string;
  readonly intentRevision: number;
  readonly intentDigest: string;
  readonly policyDigest: string;
  readonly peerId: string;
  readonly peerInstanceId: string;
}

/** Closed recovery state; high-waters fence stale replays, leases and revocations. */
export interface PlanningRecoveryStateV1 {
  readonly schemaVersion: 1;
  readonly assignmentEpochHighWater: number;
  readonly replaySequenceHighWater: number;
  readonly revocationHighWater: number;
  readonly budgetReservationHighWater: number;
  readonly fencingToken: string;
  readonly recoveryDigest: string;
}

export interface PlanningRecoveryDurableHighWatersV1 {
  readonly logicalTimeMs: number;
  readonly intentRevision: number;
  readonly planRevision: number;
  readonly fragmentRevision: number;
  readonly budgetReservationUnits: number;
  readonly replaySequence: number;
  readonly assignmentEpoch: number;
  readonly revocation: number;
}

export interface PlanningRecoveryDurableStateV1 {
  readonly schemaVersion: typeof PLANNING_RECOVERY_DURABILITY_SCHEMA_VERSION;
  readonly scope: PlanningRecoveryDurableScopeV1;
  readonly generation: number;
  readonly planningSnapshot: PlanningReducerSnapshotV1;
  readonly recovery: PlanningRecoveryStateV1;
  readonly highWaters: PlanningRecoveryDurableHighWatersV1;
  readonly stateDigest: string;
}

export interface PlanningRecoveryDurableEventDraftV1 {
  readonly eventId: string;
  readonly kind: string;
  readonly logicalTimeMs: number;
  readonly payload: MeshJsonValue;
}

export interface PlanningRecoveryDurableEventV1 extends PlanningRecoveryDurableEventDraftV1 {
  readonly schemaVersion: 1;
  readonly scope: PlanningRecoveryDurableScopeV1;
  readonly sequence: number;
  readonly previousDigest: string;
  readonly digest: string;
  readonly stateGeneration: number;
  readonly stateDigest: string;
  readonly occurredAt: string;
}

export interface PlanningRecoveryDurableSnapshotV1 {
  readonly schemaVersion: 1;
  readonly state: PlanningRecoveryDurableStateV1;
  readonly eventHeadSequence: number;
  readonly eventHeadDigest: string;
  readonly snapshotDigest: string;
}

export interface PlanningRecoveryDurableStateInputV1 {
  readonly scope: PlanningRecoveryDurableScopeV1;
  readonly generation: number;
  readonly planningSnapshot: PlanningReducerSnapshotV1;
  readonly recovery: PlanningRecoveryStateV1;
}

export interface PlanningRecoveryDurableCommitInputV1 {
  readonly expectedGeneration: number;
  readonly expectedStateDigest: string;
  readonly nextState: PlanningRecoveryDurableStateV1;
  readonly event: PlanningRecoveryDurableEventDraftV1;
}

export type PlanningRecoveryDurableCommitResultV1 =
  | {
      readonly committed: true;
      readonly state: PlanningRecoveryDurableStateV1;
      readonly event: PlanningRecoveryDurableEventV1;
    }
  | {
      readonly committed: false;
      readonly code: "state_conflict" | "rollback_rejected";
    };

export type PlanningRecoveryDurableRestoreResultV1 =
  | {
      readonly restored: true;
      readonly snapshot: PlanningRecoveryDurableSnapshotV1;
    }
  | {
      readonly restored: false;
      readonly code: "existing" | "rollback_rejected";
    };

export interface PlanningRecoveryDurableRepositoryV1 {
  initialize(
    state: PlanningRecoveryDurableStateV1,
  ): Promise<"initialized" | "existing">;
  read(): Promise<PlanningRecoveryDurableSnapshotV1>;
  commit(
    input: PlanningRecoveryDurableCommitInputV1,
  ): Promise<PlanningRecoveryDurableCommitResultV1>;
  restore(
    snapshot: PlanningRecoveryDurableSnapshotV1,
  ): Promise<PlanningRecoveryDurableRestoreResultV1>;
  inspectEvents(input?: {
    readonly afterSequence?: number;
    readonly limit?: number;
  }): Promise<readonly PlanningRecoveryDurableEventV1[]>;
}

/** Canonical constructor; it validates the real reducer snapshot before persistence. */
export async function createPlanningRecoveryDurableStateV1(
  input: PlanningRecoveryDurableStateInputV1,
): Promise<PlanningRecoveryDurableStateV1> {
  const value = exactObject(
    input,
    ["scope", "generation", "planningSnapshot", "recovery"],
    "state_input",
  );
  const scope = normalizeScope(value.scope as PlanningRecoveryDurableScopeV1);
  const generation = positiveInteger(value.generation, "generation");
  const planningSnapshot = validatePlanningReducerSnapshotV1(
    value.planningSnapshot,
  );
  assertSnapshotScope(scope, planningSnapshot);
  const recovery = await validatePlanningRecoveryStateV1(value.recovery);
  const highWaters = deriveHighWaters(planningSnapshot, recovery);
  const stateDigest = await digest({
    schemaVersion: 1,
    scope,
    generation,
    planningSnapshot,
    recovery,
    highWaters,
  } as unknown as MeshJsonValue);
  return Object.freeze({
    schemaVersion: 1,
    scope,
    generation,
    planningSnapshot,
    recovery,
    highWaters,
    stateDigest,
  });
}

export async function createPlanningRecoveryStateV1(
  input: Omit<PlanningRecoveryStateV1, "recoveryDigest">,
): Promise<PlanningRecoveryStateV1> {
  const value = exactObject(
    input,
    [
      "schemaVersion",
      "assignmentEpochHighWater",
      "replaySequenceHighWater",
      "revocationHighWater",
      "budgetReservationHighWater",
      "fencingToken",
    ],
    "recovery_state_input",
  );
  if (value.schemaVersion !== 1)
    throw new TypeError("planning_recovery_schema_version_invalid");
  const result = {
    schemaVersion: 1 as const,
    assignmentEpochHighWater: nonNegativeInteger(
      value.assignmentEpochHighWater,
      "assignmentEpochHighWater",
    ),
    replaySequenceHighWater: nonNegativeInteger(
      value.replaySequenceHighWater,
      "replaySequenceHighWater",
    ),
    revocationHighWater: nonNegativeInteger(
      value.revocationHighWater,
      "revocationHighWater",
    ),
    budgetReservationHighWater: nonNegativeInteger(
      value.budgetReservationHighWater,
      "budgetReservationHighWater",
    ),
    fencingToken: identifier(value.fencingToken, "fencingToken"),
  };
  return Object.freeze({
    ...result,
    recoveryDigest: await digest(result as unknown as MeshJsonValue),
  });
}

export async function validatePlanningRecoveryStateV1(
  input: unknown,
): Promise<PlanningRecoveryStateV1> {
  const value = exactObject(
    input,
    [
      "schemaVersion",
      "assignmentEpochHighWater",
      "replaySequenceHighWater",
      "revocationHighWater",
      "budgetReservationHighWater",
      "fencingToken",
      "recoveryDigest",
    ],
    "recovery_state",
  );
  const rebuilt = await createPlanningRecoveryStateV1({
    schemaVersion: value.schemaVersion as 1,
    assignmentEpochHighWater: value.assignmentEpochHighWater as number,
    replaySequenceHighWater: value.replaySequenceHighWater as number,
    revocationHighWater: value.revocationHighWater as number,
    budgetReservationHighWater: value.budgetReservationHighWater as number,
    fencingToken: value.fencingToken as string,
  });
  if (value.recoveryDigest !== rebuilt.recoveryDigest)
    throw new TypeError("planning_recovery_recovery_digest_invalid");
  return rebuilt;
}

export async function validatePlanningRecoveryDurableStateV1(
  input: unknown,
): Promise<PlanningRecoveryDurableStateV1> {
  const value = exactObject(
    input,
    [
      "schemaVersion",
      "scope",
      "generation",
      "planningSnapshot",
      "recovery",
      "highWaters",
      "stateDigest",
    ],
    "state",
  );
  if (value.schemaVersion !== 1)
    throw new TypeError("planning_recovery_schema_version_invalid");
  const rebuilt = await createPlanningRecoveryDurableStateV1({
    scope: value.scope as PlanningRecoveryDurableScopeV1,
    generation: value.generation as number,
    planningSnapshot: value.planningSnapshot as PlanningReducerSnapshotV1,
    recovery: value.recovery as PlanningRecoveryStateV1,
  });
  if (
    !sameJson(value.highWaters, rebuilt.highWaters) ||
    value.stateDigest !== rebuilt.stateDigest
  )
    throw new TypeError("planning_recovery_state_digest_invalid");
  return rebuilt;
}

export async function createPlanningRecoveryDurableEventV1(input: {
  readonly scope: PlanningRecoveryDurableScopeV1;
  readonly sequence: number;
  readonly previousDigest: string;
  readonly stateGeneration: number;
  readonly stateDigest: string;
  readonly event: PlanningRecoveryDurableEventDraftV1;
  readonly occurredAt: string;
}): Promise<PlanningRecoveryDurableEventV1> {
  const value = exactObject(
    input,
    [
      "scope",
      "sequence",
      "previousDigest",
      "stateGeneration",
      "stateDigest",
      "event",
      "occurredAt",
    ],
    "event_input",
  );
  const scope = normalizeScope(value.scope as PlanningRecoveryDurableScopeV1);
  const event = normalizeEvent(value.event);
  const result = {
    schemaVersion: 1 as const,
    scope,
    sequence: positiveInteger(value.sequence, "sequence"),
    previousDigest: digestString(value.previousDigest, "previousDigest"),
    stateGeneration: positiveInteger(value.stateGeneration, "stateGeneration"),
    stateDigest: digestString(value.stateDigest, "stateDigest"),
    ...event,
    occurredAt: timestamp(value.occurredAt),
  };
  return Object.freeze({
    ...result,
    digest: await digest(result as unknown as MeshJsonValue),
  });
}

export async function verifyPlanningRecoveryDurableJournalV1(input: {
  readonly entries: readonly PlanningRecoveryDurableEventV1[];
  readonly anchorSequence?: number;
  readonly anchorDigest?: string;
  readonly expectedHeadSequence?: number;
  readonly expectedHeadDigest?: string;
}): Promise<boolean> {
  const value = exactObject(
    input,
    [
      "entries",
      "anchorSequence",
      "anchorDigest",
      "expectedHeadSequence",
      "expectedHeadDigest",
    ],
    "journal_input",
    [
      "anchorSequence",
      "anchorDigest",
      "expectedHeadSequence",
      "expectedHeadDigest",
    ],
  );
  if (
    !Array.isArray(value.entries) ||
    (value.anchorSequence === undefined) !== (value.anchorDigest === undefined)
  )
    throw new TypeError("planning_recovery_journal_invalid");
  let sequence =
    value.anchorSequence === undefined
      ? 0
      : nonNegativeInteger(value.anchorSequence, "anchorSequence");
  let head =
    value.anchorDigest === undefined
      ? PLANNING_RECOVERY_DURABILITY_GENESIS_DIGEST
      : digestString(value.anchorDigest, "anchorDigest");
  let scope: PlanningRecoveryDurableScopeV1 | undefined;
  let stateGeneration = 0;
  for (const raw of value.entries) {
    const entry = exactObject(
      raw,
      [
        "schemaVersion",
        "scope",
        "sequence",
        "previousDigest",
        "digest",
        "stateGeneration",
        "stateDigest",
        "eventId",
        "kind",
        "logicalTimeMs",
        "payload",
        "occurredAt",
      ],
      "journal_entry",
    );
    const entryScope = normalizeScope(entry.scope);
    const entryGeneration = positiveInteger(
      entry.stateGeneration,
      "stateGeneration",
    );
    if (
      entry.sequence !== sequence + 1 ||
      entry.previousDigest !== head ||
      (scope !== undefined && !sameJson(scope, entryScope)) ||
      entryGeneration <= stateGeneration
    )
      return false;
    const rebuilt = await createPlanningRecoveryDurableEventV1({
      scope: entry.scope as PlanningRecoveryDurableScopeV1,
      sequence: entry.sequence as number,
      previousDigest: entry.previousDigest as string,
      stateGeneration: entry.stateGeneration as number,
      stateDigest: entry.stateDigest as string,
      event: {
        eventId: entry.eventId as string,
        kind: entry.kind as string,
        logicalTimeMs: entry.logicalTimeMs as number,
        payload: entry.payload as MeshJsonValue,
      },
      occurredAt: entry.occurredAt as string,
    });
    if (entry.schemaVersion !== 1 || entry.digest !== rebuilt.digest)
      return false;
    scope = entryScope;
    stateGeneration = rebuilt.stateGeneration;
    sequence = rebuilt.sequence;
    head = rebuilt.digest;
  }
  return (
    (value.expectedHeadSequence === undefined ||
      value.expectedHeadSequence === sequence) &&
    (value.expectedHeadDigest === undefined ||
      value.expectedHeadDigest === head)
  );
}

/** In-memory conformance layer. It deliberately shares all validation with PostgreSQL. */
export class InMemoryPlanningRecoveryDurableRepositoryV1 implements PlanningRecoveryDurableRepositoryV1 {
  #snapshot: PlanningRecoveryDurableSnapshotV1 | undefined;
  #events: PlanningRecoveryDurableEventV1[] = [];
  readonly scope: PlanningRecoveryDurableScopeV1;
  constructor(scope: PlanningRecoveryDurableScopeV1) {
    this.scope = normalizeScope(scope);
  }
  async initialize(input: PlanningRecoveryDurableStateV1) {
    const state = await scopedState(this.scope, input);
    if (!this.#snapshot) {
      this.#snapshot = await makeSnapshot(
        state,
        0,
        PLANNING_RECOVERY_DURABILITY_GENESIS_DIGEST,
      );
      return "initialized" as const;
    }
    if (this.#snapshot.state.stateDigest !== state.stateDigest)
      throw new Error("planning_recovery_state_conflict");
    return "existing" as const;
  }
  async read() {
    if (!this.#snapshot) throw new Error("planning_recovery_state_missing");
    return clone(this.#snapshot);
  }
  async commit(
    input: PlanningRecoveryDurableCommitInputV1,
  ): Promise<PlanningRecoveryDurableCommitResultV1> {
    const normalized = await normalizeCommitInput(input);
    const current = await this.read();
    const next = await scopedState(this.scope, normalized.nextState);
    if (
      normalized.expectedGeneration !== current.state.generation ||
      normalized.expectedStateDigest !== current.state.stateDigest
    )
      return Object.freeze({ committed: false, code: "state_conflict" });
    if (!canAdvance(current.state, next, normalized.event))
      return Object.freeze({ committed: false, code: "rollback_rejected" });
    const event = await createPlanningRecoveryDurableEventV1({
      scope: this.scope,
      sequence: current.eventHeadSequence + 1,
      previousDigest: current.eventHeadDigest,
      stateGeneration: next.generation,
      stateDigest: next.stateDigest,
      event: normalized.event,
      occurredAt: new Date(0).toISOString(),
    });
    this.#events.push(event);
    this.#snapshot = await makeSnapshot(next, event.sequence, event.digest);
    return Object.freeze({ committed: true, state: next, event });
  }
  async restore(
    input: PlanningRecoveryDurableSnapshotV1,
  ): Promise<PlanningRecoveryDurableRestoreResultV1> {
    const snapshot = await validateSnapshot(input);
    assertSameScope(this.scope, snapshot.state.scope);
    if (!this.#snapshot) {
      this.#snapshot = snapshot;
      this.#events = [];
      return Object.freeze({ restored: true, snapshot: clone(snapshot) });
    }
    if (this.#snapshot.snapshotDigest === snapshot.snapshotDigest)
      return Object.freeze({ restored: false, code: "existing" });
    return Object.freeze({ restored: false, code: "rollback_rejected" });
  }
  async inspectEvents(
    input: { readonly afterSequence?: number; readonly limit?: number } = {},
  ) {
    const after = nonNegativeInteger(input.afterSequence ?? 0, "afterSequence");
    const limit = positiveInteger(input.limit ?? 100, "limit", 1000);
    return Object.freeze(
      this.#events
        .filter((event) => event.sequence > after)
        .slice(0, limit)
        .map(clone),
    );
  }
}

export interface PostgresPlanningRecoveryDurableRepositoryOptionsV1 extends PlanningRecoveryDurableScopeV1 {
  readonly schema?: string;
}

export class PostgresPlanningRecoveryDurableRepositoryV1 implements PlanningRecoveryDurableRepositoryV1 {
  readonly #scope: PlanningRecoveryDurableScopeV1;
  readonly #prefix: string;
  constructor(
    readonly pool: Pool,
    options: PostgresPlanningRecoveryDurableRepositoryOptionsV1,
  ) {
    if (!pool || typeof pool.connect !== "function")
      throw new TypeError("A PostgreSQL pool is required");
    const values = exactObject(
      options,
      [
        "schema",
        "tenantId",
        "policyDomainId",
        "missionId",
        "intentRevision",
        "intentDigest",
        "policyDigest",
        "peerId",
        "peerInstanceId",
      ],
      "postgres_options",
      ["schema"],
    );
    this.#scope = normalizeScope({
      tenantId: values.tenantId,
      policyDomainId: values.policyDomainId,
      missionId: values.missionId,
      intentRevision: values.intentRevision,
      intentDigest: values.intentDigest,
      policyDigest: values.policyDigest,
      peerId: values.peerId,
      peerInstanceId: values.peerInstanceId,
    });
    this.#prefix = `${quotePostgresIdentifier(normalizePostgresIdentifier((values.schema as string | undefined) ?? defaultPostgresSchema, "schema"))}.`;
  }
  async initialize(input: PlanningRecoveryDurableStateV1) {
    const state = await scopedState(this.#scope, input);
    return this.#transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO ${this.#prefix}mesh_planning_recovery_states (tenant_id,policy_domain_id,mission_id,intent_revision,intent_digest,policy_digest,peer_id,peer_instance_id,generation,high_water_logical_ms,plan_revision_high_water,fragment_revision_high_water,budget_reservation_high_water,replay_sequence_high_water,assignment_epoch_high_water,revocation_high_water,state_digest,planning_snapshot,recovery_state,event_head_sequence,event_head_digest) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19::jsonb,$20,$21) ON CONFLICT DO NOTHING`,
        rowValues(state, 0, PLANNING_RECOVERY_DURABILITY_GENESIS_DIGEST),
      );
      if ((inserted.rowCount ?? 0) === 1) return "initialized" as const;
      if (
        (await this.#readWith(client)).state.stateDigest !== state.stateDigest
      )
        throw new Error("planning_recovery_state_conflict");
      return "existing" as const;
    });
  }
  async read() {
    return this.#readWith(this.pool);
  }
  async commit(
    input: PlanningRecoveryDurableCommitInputV1,
  ): Promise<PlanningRecoveryDurableCommitResultV1> {
    const normalized = await normalizeCommitInput(input);
    const next = await scopedState(this.#scope, normalized.nextState);
    return this.#transaction(async (client) => {
      const current = await this.#readWith(client, true);
      if (
        normalized.expectedGeneration !== current.state.generation ||
        normalized.expectedStateDigest !== current.state.stateDigest
      )
        return Object.freeze({
          committed: false,
          code: "state_conflict" as const,
        });
      if (!canAdvance(current.state, next, normalized.event))
        return Object.freeze({
          committed: false,
          code: "rollback_rejected" as const,
        });
      const event = await createPlanningRecoveryDurableEventV1({
        scope: this.#scope,
        sequence: current.eventHeadSequence + 1,
        previousDigest: current.eventHeadDigest,
        stateGeneration: next.generation,
        stateDigest: next.stateDigest,
        event: normalized.event,
        occurredAt: new Date().toISOString(),
      });
      const updated = await client.query(
        `UPDATE ${this.#prefix}mesh_planning_recovery_states SET generation=$9,high_water_logical_ms=$10,plan_revision_high_water=$11,fragment_revision_high_water=$12,budget_reservation_high_water=$13,replay_sequence_high_water=$14,assignment_epoch_high_water=$15,revocation_high_water=$16,state_digest=$17,planning_snapshot=$18::jsonb,recovery_state=$19::jsonb,event_head_sequence=$20,event_head_digest=$21,updated_at=transaction_timestamp() WHERE tenant_id=$1 AND policy_domain_id=$2 AND mission_id=$3 AND intent_revision=$4 AND intent_digest=$5 AND policy_digest=$6 AND peer_id=$7 AND peer_instance_id=$8 AND generation=$22 AND state_digest=$23 AND high_water_logical_ms <= $10`,
        [
          ...scopeValues(this.#scope),
          ...stateValues(next),
          event.sequence,
          event.digest,
          normalized.expectedGeneration,
          normalized.expectedStateDigest,
        ],
      );
      if ((updated.rowCount ?? 0) !== 1)
        return Object.freeze({
          committed: false,
          code: "state_conflict" as const,
        });
      await client.query(
        `INSERT INTO ${this.#prefix}mesh_planning_recovery_events (tenant_id,policy_domain_id,mission_id,intent_revision,intent_digest,policy_digest,peer_id,peer_instance_id,sequence,event_id,previous_digest,digest,state_generation,state_digest,logical_time_ms,kind,payload,occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18)`,
        [
          ...scopeValues(this.#scope),
          event.sequence,
          event.eventId,
          event.previousDigest,
          event.digest,
          event.stateGeneration,
          event.stateDigest,
          event.logicalTimeMs,
          event.kind,
          JSON.stringify(event.payload),
          event.occurredAt,
        ],
      );
      return Object.freeze({ committed: true, state: next, event });
    });
  }
  async restore(
    input: PlanningRecoveryDurableSnapshotV1,
  ): Promise<PlanningRecoveryDurableRestoreResultV1> {
    const snapshot = await validateSnapshot(input);
    assertSameScope(this.#scope, snapshot.state.scope);
    return this.#transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO ${this.#prefix}mesh_planning_recovery_states (tenant_id,policy_domain_id,mission_id,intent_revision,intent_digest,policy_digest,peer_id,peer_instance_id,generation,high_water_logical_ms,plan_revision_high_water,fragment_revision_high_water,budget_reservation_high_water,replay_sequence_high_water,assignment_epoch_high_water,revocation_high_water,state_digest,planning_snapshot,recovery_state,event_head_sequence,event_head_digest) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19::jsonb,$20,$21) ON CONFLICT DO NOTHING`,
        rowValues(
          snapshot.state,
          snapshot.eventHeadSequence,
          snapshot.eventHeadDigest,
        ),
      );
      if ((inserted.rowCount ?? 0) === 1)
        return Object.freeze({ restored: true, snapshot });
      const current = await this.#readWith(client, true);
      if (current.snapshotDigest === snapshot.snapshotDigest)
        return Object.freeze({ restored: false, code: "existing" as const });
      return Object.freeze({
        restored: false,
        code: "rollback_rejected" as const,
      });
    });
  }
  async inspectEvents(
    input: { readonly afterSequence?: number; readonly limit?: number } = {},
  ) {
    const after = nonNegativeInteger(input.afterSequence ?? 0, "afterSequence");
    const limit = positiveInteger(input.limit ?? 100, "limit", 1000);
    const result = await this.pool.query<Row>(
      `SELECT * FROM ${this.#prefix}mesh_planning_recovery_events WHERE tenant_id=$1 AND policy_domain_id=$2 AND mission_id=$3 AND intent_revision=$4 AND intent_digest=$5 AND policy_digest=$6 AND peer_id=$7 AND peer_instance_id=$8 AND sequence > $9 ORDER BY sequence LIMIT $10`,
      [...scopeValues(this.#scope), after, limit],
    );
    return Object.freeze(
      await Promise.all(result.rows.map((row) => mapEvent(row, this.#scope))),
    );
  }
  async #readWith(
    queryable: Pick<Pool, "query"> | Pick<PoolClient, "query">,
    locked = false,
  ) {
    const result = await queryable.query<Row>(
      `SELECT * FROM ${this.#prefix}mesh_planning_recovery_states WHERE tenant_id=$1 AND policy_domain_id=$2 AND mission_id=$3 AND intent_revision=$4 AND intent_digest=$5 AND policy_digest=$6 AND peer_id=$7 AND peer_instance_id=$8${locked ? " FOR UPDATE" : ""}`,
      scopeValues(this.#scope),
    );
    if (!result.rows[0]) throw new Error("planning_recovery_state_missing");
    return mapSnapshot(result.rows[0], this.#scope);
  }
  async #transaction<T>(work: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

type Row = QueryResultRow & Record<string, unknown>;
async function mapSnapshot(row: Row, scope: PlanningRecoveryDurableScopeV1) {
  const state = await createPlanningRecoveryDurableStateV1({
    scope,
    generation: numberValue(row.generation, "generation"),
    planningSnapshot: row.planning_snapshot as PlanningReducerSnapshotV1,
    recovery: row.recovery_state as PlanningRecoveryStateV1,
  });
  if (
    row.state_digest !== state.stateDigest ||
    !sameJson(rowHighWaters(row), state.highWaters)
  )
    throw new Error("planning_recovery_state_corrupt");
  return makeSnapshot(
    state,
    nonNegativeInteger(
      numberValue(row.event_head_sequence, "eventHeadSequence"),
      "eventHeadSequence",
    ),
    digestString(row.event_head_digest, "eventHeadDigest"),
  );
}
async function mapEvent(row: Row, scope: PlanningRecoveryDurableScopeV1) {
  const event = await createPlanningRecoveryDurableEventV1({
    scope,
    sequence: numberValue(row.sequence, "sequence"),
    previousDigest: String(row.previous_digest),
    stateGeneration: numberValue(row.state_generation, "stateGeneration"),
    stateDigest: String(row.state_digest),
    event: {
      eventId: String(row.event_id),
      kind: String(row.kind),
      logicalTimeMs: numberValue(row.logical_time_ms, "logicalTimeMs"),
      payload: row.payload as MeshJsonValue,
    },
    occurredAt: new Date(String(row.occurred_at)).toISOString(),
  });
  if (event.digest !== row.digest)
    throw new Error("planning_recovery_event_corrupt");
  return event;
}
async function makeSnapshot(
  state: PlanningRecoveryDurableStateV1,
  eventHeadSequence: number,
  eventHeadDigest: string,
) {
  const snapshot = {
    schemaVersion: 1 as const,
    state,
    eventHeadSequence: nonNegativeInteger(
      eventHeadSequence,
      "eventHeadSequence",
    ),
    eventHeadDigest: digestString(eventHeadDigest, "eventHeadDigest"),
  };
  return Object.freeze({
    ...snapshot,
    snapshotDigest: await digest(snapshot as unknown as MeshJsonValue),
  });
}
async function validateSnapshot(input: unknown) {
  const value = exactObject(
    input,
    [
      "schemaVersion",
      "state",
      "eventHeadSequence",
      "eventHeadDigest",
      "snapshotDigest",
    ],
    "snapshot",
  );
  if (value.schemaVersion !== 1)
    throw new TypeError("planning_recovery_snapshot_invalid");
  const snapshot = await makeSnapshot(
    await validatePlanningRecoveryDurableStateV1(value.state),
    value.eventHeadSequence as number,
    value.eventHeadDigest as string,
  );
  if (value.snapshotDigest !== snapshot.snapshotDigest)
    throw new TypeError("planning_recovery_snapshot_digest_invalid");
  return snapshot;
}
async function scopedState(
  scope: PlanningRecoveryDurableScopeV1,
  input: unknown,
) {
  const state = await validatePlanningRecoveryDurableStateV1(input);
  assertSameScope(scope, state.scope);
  return state;
}
async function normalizeCommitInput(input: unknown) {
  const value = exactObject(
    input,
    ["expectedGeneration", "expectedStateDigest", "nextState", "event"],
    "commit_input",
  );
  return Object.freeze({
    expectedGeneration: positiveInteger(
      value.expectedGeneration,
      "expectedGeneration",
    ),
    expectedStateDigest: digestString(
      value.expectedStateDigest,
      "expectedStateDigest",
    ),
    nextState: await validatePlanningRecoveryDurableStateV1(value.nextState),
    event: normalizeEvent(value.event),
  });
}
function canAdvance(
  previous: PlanningRecoveryDurableStateV1,
  next: PlanningRecoveryDurableStateV1,
  event: PlanningRecoveryDurableEventDraftV1,
) {
  if (
    next.generation !== previous.generation + 1 ||
    event.logicalTimeMs < previous.highWaters.logicalTimeMs
  )
    return false;
  try {
    restorePlanningReducerSnapshotV1(
      previous.planningSnapshot.state,
      next.planningSnapshot,
    );
    assertSnapshotHighWatersNotLoweredV1(
      toCollective(previous.planningSnapshot),
      toCollective(next.planningSnapshot),
    );
  } catch {
    return false;
  }
  return (
    highWatersNotLowered(previous.highWaters, next.highWaters) &&
    recoveryCanAdvance(previous.recovery, next.recovery)
  );
}
function toCollective(snapshot: PlanningReducerSnapshotV1) {
  const state = snapshot.state;
  return createCollectivePlanningSnapshotV1({
    format: "agentplat.collective-planning.snapshot",
    formatVersion: 1,
    schemaVersion: 1,
    snapshotId: snapshot.snapshotId,
    tenantId: state.tenantId,
    policyDomainId: state.policyDomainId,
    peerId: state.peerId,
    peerInstanceId: state.peerInstanceId,
    missionIntent: state.missionIntent,
    selectionPolicy: state.selectionPolicy,
    planView: state.planView,
    domainHighWaters: state.recordHighWaters,
  });
}
function highWatersNotLowered(
  a: PlanningRecoveryDurableHighWatersV1,
  b: PlanningRecoveryDurableHighWatersV1,
) {
  return Object.keys(a).every(
    (key) => b[key as keyof typeof b] >= a[key as keyof typeof a],
  );
}
function recoveryCanAdvance(
  previous: PlanningRecoveryStateV1,
  next: PlanningRecoveryStateV1,
) {
  if (next.assignmentEpochHighWater === previous.assignmentEpochHighWater)
    return next.fencingToken === previous.fencingToken;
  return (
    next.assignmentEpochHighWater === previous.assignmentEpochHighWater + 1 &&
    next.fencingToken !== previous.fencingToken
  );
}
function deriveHighWaters(
  snapshot: PlanningReducerSnapshotV1,
  recovery: PlanningRecoveryStateV1,
): PlanningRecoveryDurableHighWatersV1 {
  const state = snapshot.state;
  const fragments = state.planView.fragments;
  const budget = state.planView.budgetReservations.reduce(
    (sum, item) => sum + item.units,
    0,
  );
  if (recovery.budgetReservationHighWater < budget)
    throw new TypeError("planning_recovery_budget_high_water_invalid");
  return Object.freeze({
    logicalTimeMs: state.planView.logicalTimeHighWaterMs,
    intentRevision: state.missionIntent.revision,
    planRevision: state.planView.revision,
    fragmentRevision: fragments.reduce(
      (max, item) => Math.max(max, item.fragmentRevision),
      0,
    ),
    budgetReservationUnits: recovery.budgetReservationHighWater,
    replaySequence: recovery.replaySequenceHighWater,
    assignmentEpoch: recovery.assignmentEpochHighWater,
    revocation: recovery.revocationHighWater,
  });
}
function assertSnapshotScope(
  scope: PlanningRecoveryDurableScopeV1,
  snapshot: PlanningReducerSnapshotV1,
) {
  const state = snapshot.state;
  if (
    scope.tenantId !== state.tenantId ||
    scope.policyDomainId !== state.policyDomainId ||
    scope.missionId !== state.missionIntent.missionIntentId ||
    scope.intentRevision !== state.missionIntent.revision ||
    scope.intentDigest !== state.missionIntent.intentDigest ||
    scope.policyDigest !== state.selectionPolicy.policyDigest ||
    scope.peerId !== state.peerId ||
    scope.peerInstanceId !== state.peerInstanceId
  )
    throw new Error("planning_recovery_scope_mismatch");
}
function normalizeScope(input: unknown): PlanningRecoveryDurableScopeV1 {
  const value = exactObject(
    input,
    [
      "tenantId",
      "policyDomainId",
      "missionId",
      "intentRevision",
      "intentDigest",
      "policyDigest",
      "peerId",
      "peerInstanceId",
    ],
    "scope",
  );
  return Object.freeze({
    tenantId: identifier(value.tenantId, "tenantId"),
    policyDomainId: identifier(value.policyDomainId, "policyDomainId"),
    missionId: identifier(value.missionId, "missionId"),
    intentRevision: positiveInteger(value.intentRevision, "intentRevision"),
    intentDigest: planningDigest(value.intentDigest, "intentDigest"),
    policyDigest: planningDigest(value.policyDigest, "policyDigest"),
    peerId: identifier(value.peerId, "peerId"),
    peerInstanceId: identifier(value.peerInstanceId, "peerInstanceId"),
  });
}
function normalizeEvent(input: unknown): PlanningRecoveryDurableEventDraftV1 {
  const value = exactObject(
    input,
    ["eventId", "kind", "logicalTimeMs", "payload"],
    "event",
  );
  if (!canonicalizeMeshJsonBytes(value.payload).ok)
    throw new TypeError("planning_recovery_payload_invalid");
  return Object.freeze({
    eventId: identifier(value.eventId, "eventId"),
    kind: identifier(value.kind, "kind"),
    logicalTimeMs: nonNegativeInteger(value.logicalTimeMs, "logicalTimeMs"),
    payload: clone(value.payload as MeshJsonValue),
  });
}
function exactObject(
  input: unknown,
  keys: readonly string[],
  name: string,
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (
    !input ||
    typeof input !== "object" ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    Object.getOwnPropertySymbols(input).length
  )
    throw new TypeError(`planning_recovery_${name}_invalid`);
  const names = Object.getOwnPropertyNames(input);
  if (
    names.some((key) => !keys.includes(key)) ||
    keys.some((key) => !optional.includes(key) && !names.includes(key))
  )
    throw new TypeError(`planning_recovery_${name}_keys_invalid`);
  const result: Record<string, unknown> = {};
  for (const key of names) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
      throw new TypeError(`planning_recovery_${name}_accessor_invalid`);
    result[key] = descriptor.value;
  }
  return result;
}
function assertSameScope(
  a: PlanningRecoveryDurableScopeV1,
  b: PlanningRecoveryDurableScopeV1,
) {
  if (!sameJson(a, b)) throw new Error("planning_recovery_scope_mismatch");
}
function scopeValues(scope: PlanningRecoveryDurableScopeV1) {
  return [
    scope.tenantId,
    scope.policyDomainId,
    scope.missionId,
    scope.intentRevision,
    scope.intentDigest,
    scope.policyDigest,
    scope.peerId,
    scope.peerInstanceId,
  ];
}
function stateValues(state: PlanningRecoveryDurableStateV1) {
  const h = state.highWaters;
  return [
    state.generation,
    h.logicalTimeMs,
    h.planRevision,
    h.fragmentRevision,
    h.budgetReservationUnits,
    h.replaySequence,
    h.assignmentEpoch,
    h.revocation,
    state.stateDigest,
    JSON.stringify(state.planningSnapshot),
    JSON.stringify(state.recovery),
  ];
}
function rowValues(
  state: PlanningRecoveryDurableStateV1,
  sequence: number,
  digestValue: string,
) {
  return [
    ...scopeValues(state.scope),
    ...stateValues(state),
    sequence,
    digestValue,
  ];
}
function rowHighWaters(row: Row): PlanningRecoveryDurableHighWatersV1 {
  return {
    logicalTimeMs: numberValue(row.high_water_logical_ms, "logicalTimeMs"),
    intentRevision: numberValue(row.intent_revision, "intentRevision"),
    planRevision: numberValue(row.plan_revision_high_water, "planRevision"),
    fragmentRevision: numberValue(
      row.fragment_revision_high_water,
      "fragmentRevision",
    ),
    budgetReservationUnits: numberValue(
      row.budget_reservation_high_water,
      "budgetReservationUnits",
    ),
    replaySequence: numberValue(
      row.replay_sequence_high_water,
      "replaySequence",
    ),
    assignmentEpoch: numberValue(
      row.assignment_epoch_high_water,
      "assignmentEpoch",
    ),
    revocation: numberValue(row.revocation_high_water, "revocation"),
  };
}
async function digest(value: MeshJsonValue) {
  return computeMeshDurableValueDigest(value);
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function identifier(value: unknown, name: string) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 256 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    throw new TypeError(`planning_recovery_${name}_invalid`);
  return value;
}
function digestString(value: unknown, name: string) {
  if (typeof value !== "string" || !/^sha256:[A-Za-z0-9_-]{43}$/u.test(value))
    throw new TypeError(`planning_recovery_${name}_invalid`);
  return value;
}
function planningDigest(value: unknown, name: string) {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`planning_recovery_${name}_invalid`);
  return value;
}
function positiveInteger(
  value: unknown,
  name: string,
  max = Number.MAX_SAFE_INTEGER,
) {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > max
  )
    throw new RangeError(`planning_recovery_${name}_invalid`);
  return value as number;
}
function nonNegativeInteger(
  value: unknown,
  name: string,
  max = Number.MAX_SAFE_INTEGER,
) {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > max
  )
    throw new RangeError(`planning_recovery_${name}_invalid`);
  return value as number;
}
function numberValue(value: unknown, name: string) {
  return nonNegativeInteger(
    typeof value === "number" ? value : Number(value),
    name,
  );
}
function timestamp(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    throw new TypeError("planning_recovery_timestamp_invalid");
  return new Date(value).toISOString();
}
