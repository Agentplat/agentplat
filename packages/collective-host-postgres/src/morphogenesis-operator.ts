import {
  validateMorphogenesisOperatorExecutionStateV2,
  validateMorphogenesisOperatorOutcomeReceiptV2,
  type MorphogenesisOperatorExecutionStateV2,
  type MorphogenesisOperatorExecutionStoreV2,
  type MorphogenesisOperatorOutcomeReceiptV2,
  type MorphogenesisOperatorOutcomeStoreV2,
} from "@agentplat/collective-runtime/morphogenesis";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool } from "pg";

import type {
  MorphogenesisPostgresRollbackWitnessV1,
  MorphogenesisPostgresStoreOptionsV1,
} from "./morphogenesis.js";

export class PostgresMorphogenesisOperatorExecutionStoreV2
  implements MorphogenesisOperatorExecutionStoreV2
{
  readonly #prefix: string;
  constructor(
    readonly pool: Pool,
    readonly options: MorphogenesisPostgresStoreOptionsV1,
  ) {
    if (!pool || !options.scopeId || !options.rollbackWitness)
      throw new TypeError("Morphogenesis operator PostgreSQL store options are required");
    this.#prefix = prefix(options.schema);
  }
  async load(stateKey: string) {
    const result = await this.pool.query<{
      revision: string | number;
      logical_time_high_water_ms: string | number;
      state_digest: string;
      state: unknown;
    }>(
      `SELECT revision, logical_time_high_water_ms, state_digest, state
         FROM ${this.#prefix}collective_host_runtime_states
        WHERE scope_id=$1 AND state_kind='morphogenesis-operator-execution'
          AND state_key=$2`,
      [this.options.scopeId, stateKey],
    );
    const row = result.rows[0];
    if (!row) return null;
    const state = validateMorphogenesisOperatorExecutionStateV2(row.state);
    if (
      Number(row.revision) !== state.revision ||
      Number(row.logical_time_high_water_ms) !== state.logicalTimeHighWaterMs ||
      row.state_digest !== state.stateDigest ||
      !(await this.options.rollbackWitness.verify({
        scopeId: this.options.scopeId,
        stateKind: "morphogenesis-operator-execution",
        stateKey,
        revision: state.revision,
        digest: state.stateDigest,
      }))
    ) throw new Error("Morphogenesis operator PostgreSQL state or witness diverged");
    return state;
  }
  async save(input: {
    readonly state: MorphogenesisOperatorExecutionStateV2;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: `sha256:${string}` | null;
  }) {
    const state = validateMorphogenesisOperatorExecutionStateV2(input.state);
    const result = input.expectedRevision === null
      ? await this.pool.query(
          `INSERT INTO ${this.#prefix}collective_host_runtime_states
            (scope_id,state_kind,state_key,revision,logical_time_high_water_ms,state_digest,state)
           VALUES ($1,'morphogenesis-operator-execution',$2,$3,$4,$5,$6::jsonb)
           ON CONFLICT DO NOTHING`,
          [this.options.scopeId, state.stateKey, state.revision,
            state.logicalTimeHighWaterMs, state.stateDigest, JSON.stringify(state)],
        )
      : await this.pool.query(
          `UPDATE ${this.#prefix}collective_host_runtime_states
              SET revision=$5,logical_time_high_water_ms=$6,state_digest=$7,
                  state=$8::jsonb,updated_at=transaction_timestamp()
            WHERE scope_id=$1 AND state_kind='morphogenesis-operator-execution'
              AND state_key=$2 AND revision=$3 AND state_digest=$4
              AND logical_time_high_water_ms <= $6`,
          [this.options.scopeId, state.stateKey, input.expectedRevision,
            input.expectedStateDigest, state.revision,
            state.logicalTimeHighWaterMs, state.stateDigest, JSON.stringify(state)],
        );
    if ((result.rowCount ?? 0) !== 1) {
      const retained = await this.load(state.stateKey);
      return retained?.stateDigest === state.stateDigest;
    }
    if (!(await recordWitness(this.options.rollbackWitness, {
      scopeId: this.options.scopeId,
      stateKind: "morphogenesis-operator-execution",
      stateKey: state.stateKey,
      previousRevision: input.expectedRevision,
      previousDigest: input.expectedStateDigest,
      nextRevision: state.revision,
      nextDigest: state.stateDigest,
    }))) throw new Error("Morphogenesis operator rollback witness rejected state");
    return true;
  }
}

export class PostgresMorphogenesisOperatorOutcomeStoreV2
  implements MorphogenesisOperatorOutcomeStoreV2
{
  readonly #prefix: string;
  constructor(
    readonly pool: Pool,
    readonly options: MorphogenesisPostgresStoreOptionsV1,
  ) {
    if (!pool || !options.scopeId || !options.rollbackWitness)
      throw new TypeError("Morphogenesis operator PostgreSQL store options are required");
    this.#prefix = prefix(options.schema);
  }
  async load(planDigest: `sha256:${string}`) {
    const result = await this.pool.query<{ state_digest: string; state: unknown }>(
      `SELECT state_digest,state FROM ${this.#prefix}collective_host_runtime_states
        WHERE scope_id=$1 AND state_kind='morphogenesis-operator-outcome'
          AND state_key=$2`,
      [this.options.scopeId, planDigest],
    );
    const row = result.rows[0];
    if (!row) return null;
    const receipt = validateMorphogenesisOperatorOutcomeReceiptV2(
      row.state as MorphogenesisOperatorOutcomeReceiptV2,
    );
    if (
      row.state_digest !== receipt.receiptDigest ||
      !(await this.options.rollbackWitness.verify({
        scopeId: this.options.scopeId,
        stateKind: "morphogenesis-operator-outcome",
        stateKey: planDigest,
        revision: 0,
        digest: receipt.receiptDigest,
      }))
    ) throw new Error("Morphogenesis operator outcome or witness diverged");
    return receipt;
  }
  async save(input: MorphogenesisOperatorOutcomeReceiptV2) {
    const receipt = validateMorphogenesisOperatorOutcomeReceiptV2(input);
    const result = await this.pool.query(
      `INSERT INTO ${this.#prefix}collective_host_runtime_states
        (scope_id,state_kind,state_key,revision,logical_time_high_water_ms,state_digest,state)
       VALUES ($1,'morphogenesis-operator-outcome',$2,0,$3,$4,$5::jsonb)
       ON CONFLICT DO NOTHING`,
      [this.options.scopeId, receipt.planDigest, receipt.evaluatedAtLogicalMs,
        receipt.receiptDigest, JSON.stringify(receipt)],
    );
    if ((result.rowCount ?? 0) !== 1) {
      const retained = await this.load(receipt.planDigest);
      return retained?.receiptDigest === receipt.receiptDigest;
    }
    if (!(await recordWitness(this.options.rollbackWitness, {
      scopeId: this.options.scopeId,
      stateKind: "morphogenesis-operator-outcome",
      stateKey: receipt.planDigest,
      previousRevision: null,
      previousDigest: null,
      nextRevision: 0,
      nextDigest: receipt.receiptDigest,
    }))) throw new Error("Morphogenesis operator outcome witness rejected receipt");
    return true;
  }
}

function prefix(schema?: string) {
  return `${quotePostgresIdentifier(normalizePostgresIdentifier(
    schema ?? defaultPostgresSchema,
    "schema",
  ))}.`;
}

function recordWitness(
  witness: MorphogenesisPostgresRollbackWitnessV1,
  input: Parameters<MorphogenesisPostgresRollbackWitnessV1["record"]>[0],
) { return witness.record(input); }
