import type { Pool } from "pg";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import {
  validateLocalStrategyAdaptationStateV1,
  validateLocalStrategyAdaptationPolicyV1,
  validateLocalStrategyCatalogV1,
  type LocalStrategyAdaptationPolicyRecordV1,
  type LocalStrategyAdaptationStateV1,
  type LocalStrategyAdaptationStoreV1,
  type LocalStrategyCatalogV1,
  type LocalStrategyEntropyPortV1,
} from "@agentplat/collective-runtime/strategy-adaptation";
import {
  validateMorphogenesisStrategyGovernanceStateV3,
  validateMorphogenesisStrategyCounterfactualReportV3,
  type MorphogenesisStrategyCatalogV3,
  type MorphogenesisStrategyGovernancePolicyV3,
  type MorphogenesisStrategyGovernanceStateV3,
  type MorphogenesisStrategyGovernanceStoreV3,
  type MorphogenesisStrategyCounterfactualReportV3,
  type MorphogenesisStrategyCounterfactualStoreV3,
} from "@agentplat/collective-runtime/morphogenesis";
import {
  validatePeerStrategyEvidenceExchangePolicyV1,
  validatePeerStrategyEvidenceStateV1,
  type PeerStrategyEvidencePolicyRecordV1,
  type PeerStrategyEvidenceStateV1,
  type PeerStrategyEvidenceStoreV1,
} from "@agentplat/collective-runtime/strategy-evidence-exchange";
import {
  validateStrategyConvergencePolicyV1,
  validateStrategyConvergenceStateV1,
  type StrategyConvergencePolicyRecordV1,
  type StrategyConvergenceStateV1,
  type StrategyConvergenceStoreV1,
} from "@agentplat/collective-runtime/strategy-convergence";

import type {
  MorphogenesisPostgresRollbackWitnessV1,
  MorphogenesisPostgresStoreOptionsV1,
} from "./morphogenesis.js";

export class PostgresMorphogenesisStrategyCounterfactualStoreV3
  implements MorphogenesisStrategyCounterfactualStoreV3
{
  readonly #prefix: string;
  constructor(
    readonly pool: Pool,
    readonly options: MorphogenesisPostgresStoreOptionsV1,
  ) {
    if (!pool || !options.scopeId || !options.rollbackWitness)
      throw new TypeError("Morphogenesis counterfactual PostgreSQL store options are required");
    this.#prefix = `${quotePostgresIdentifier(normalizePostgresIdentifier(
      options.schema ?? defaultPostgresSchema, "schema",
    ))}.`;
  }
  async load(reportId: string) {
    const result = await this.pool.query<{ state_digest: string; state: unknown }>(
      `SELECT state_digest,state FROM ${this.#prefix}collective_host_runtime_states
        WHERE scope_id=$1 AND state_kind='morphogenesis-strategy-counterfactual'
          AND state_key=$2`,
      [this.options.scopeId, reportId],
    );
    const row = result.rows[0];
    if (!row) return null;
    const report = validateMorphogenesisStrategyCounterfactualReportV3(row.state);
    if (row.state_digest !== report.reportDigest ||
        !(await this.options.rollbackWitness.verify({
          scopeId: this.options.scopeId,
          stateKind: "morphogenesis-strategy-counterfactual",
          stateKey: reportId,
          revision: 0,
          digest: report.reportDigest,
        }))) throw new Error("Morphogenesis counterfactual report or witness diverged");
    return report;
  }
  async save(input: MorphogenesisStrategyCounterfactualReportV3) {
    const report = validateMorphogenesisStrategyCounterfactualReportV3(input);
    const result = await this.pool.query(
      `INSERT INTO ${this.#prefix}collective_host_runtime_states
        (scope_id,state_kind,state_key,revision,logical_time_high_water_ms,state_digest,state)
       VALUES ($1,'morphogenesis-strategy-counterfactual',$2,0,$3,$4,$5::jsonb)
       ON CONFLICT DO NOTHING`,
      [this.options.scopeId, report.reportId, report.evaluatedAtLogicalMs,
        report.reportDigest, JSON.stringify(report)],
    );
    if ((result.rowCount ?? 0) !== 1) {
      const retained = await this.load(report.reportId);
      return retained?.reportDigest === report.reportDigest;
    }
    if (!(await recordWitness(this.options.rollbackWitness, {
      scopeId: this.options.scopeId,
      stateKind: "morphogenesis-strategy-counterfactual",
      stateKey: report.reportId,
      previousRevision: null,
      previousDigest: null,
      nextRevision: 0,
      nextDigest: report.reportDigest,
    }))) throw new Error("Morphogenesis counterfactual witness rejected report");
    return true;
  }
}

export class PostgresLocalStrategyAdaptationStoreV1
  implements LocalStrategyAdaptationStoreV1
{
  readonly #repository: StrategyStateRepository<LocalStrategyAdaptationStateV1>;
  constructor(input: {
    readonly pool: Pool;
    readonly options: MorphogenesisPostgresStoreOptionsV1;
    readonly policy: LocalStrategyAdaptationPolicyRecordV1;
    readonly catalog: LocalStrategyCatalogV1;
    readonly entropy: Pick<LocalStrategyEntropyPortV1,
      "entropyId" | "entropyVersion" | "entropyImplementationDigest">;
  }) {
    const policy = validateLocalStrategyAdaptationPolicyV1(input.policy);
    const catalog = validateLocalStrategyCatalogV1(input.catalog);
    this.#repository = new StrategyStateRepository({
      pool: input.pool,
      options: input.options,
      stateKind: "morphogenesis-strategy-adaptation",
      validate: (value) => validateLocalStrategyAdaptationStateV1(value, {
        policy, catalog, entropy: input.entropy,
      }),
    });
  }
  load(stateKey: string) { return this.#repository.load(stateKey); }
  save(input: { readonly state: LocalStrategyAdaptationStateV1; readonly expectedRevision: number | null }) {
    return this.#repository.save({
      state: input.state,
      expectedRevision: input.expectedRevision,
      expectedStateDigest: null,
    });
  }
}

export class PostgresPeerStrategyEvidenceStoreV1
  implements PeerStrategyEvidenceStoreV1
{
  readonly #repository: StrategyStateRepository<PeerStrategyEvidenceStateV1>;
  constructor(input: {
    readonly pool: Pool;
    readonly options: MorphogenesisPostgresStoreOptionsV1;
    readonly policy: PeerStrategyEvidencePolicyRecordV1;
  }) {
    const policy = validatePeerStrategyEvidenceExchangePolicyV1(input.policy);
    this.#repository = new StrategyStateRepository({
      pool: input.pool, options: input.options,
      stateKind: "morphogenesis-strategy-evidence-exchange",
      validate: (value) => validatePeerStrategyEvidenceStateV1(value, { policy }),
    });
  }
  load(stateKey: string) { return this.#repository.load(stateKey); }
  save(input: { readonly state: PeerStrategyEvidenceStateV1; readonly expectedRevision: number | null }) {
    return this.#repository.save({ state: input.state,
      expectedRevision: input.expectedRevision, expectedStateDigest: null });
  }
}

export class PostgresStrategyConvergenceStoreV1
  implements StrategyConvergenceStoreV1
{
  readonly #repository: StrategyStateRepository<StrategyConvergenceStateV1>;
  constructor(input: {
    readonly pool: Pool;
    readonly options: MorphogenesisPostgresStoreOptionsV1;
    readonly policy: StrategyConvergencePolicyRecordV1;
  }) {
    const policy = validateStrategyConvergencePolicyV1(input.policy);
    this.#repository = new StrategyStateRepository({
      pool: input.pool, options: input.options,
      stateKind: "morphogenesis-strategy-convergence",
      validate: (value) => validateStrategyConvergenceStateV1(value, { policy }),
    });
  }
  load(stateKey: string) { return this.#repository.load(stateKey); }
  save(input: { readonly state: StrategyConvergenceStateV1; readonly expectedRevision: number | null }) {
    return this.#repository.save({ state: input.state,
      expectedRevision: input.expectedRevision, expectedStateDigest: null });
  }
}

export class PostgresMorphogenesisStrategyGovernanceStoreV3
  implements MorphogenesisStrategyGovernanceStoreV3
{
  readonly #repository: StrategyStateRepository<MorphogenesisStrategyGovernanceStateV3>;
  constructor(input: {
    readonly pool: Pool;
    readonly options: MorphogenesisPostgresStoreOptionsV1;
    readonly stateKey: string;
    readonly policy: MorphogenesisStrategyGovernancePolicyV3;
    readonly catalog: MorphogenesisStrategyCatalogV3;
  }) {
    this.#repository = new StrategyStateRepository({
      pool: input.pool,
      options: input.options,
      stateKind: "morphogenesis-strategy-governance",
      validate: (value) => validateMorphogenesisStrategyGovernanceStateV3(
        value as MorphogenesisStrategyGovernanceStateV3,
        { policy: input.policy, catalog: input.catalog, stateKey: input.stateKey },
      ),
    });
  }
  load(stateKey: string) { return this.#repository.load(stateKey); }
  save(input: {
    readonly state: MorphogenesisStrategyGovernanceStateV3;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: `sha256:${string}` | null;
  }) { return this.#repository.save(input); }
}

type StrategyState = {
  readonly stateKey: string;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly stateDigest: `sha256:${string}`;
};

class StrategyStateRepository<T extends StrategyState> {
  readonly #prefix: string;
  constructor(readonly input: {
    readonly pool: Pool;
    readonly options: MorphogenesisPostgresStoreOptionsV1;
    readonly stateKind:
      | "morphogenesis-strategy-adaptation"
      | "morphogenesis-strategy-governance"
      | "morphogenesis-strategy-evidence-exchange"
      | "morphogenesis-strategy-convergence";
    readonly validate: (input: unknown) => T;
  }) {
    if (!input.pool || !input.options.scopeId || !input.options.rollbackWitness)
      throw new TypeError("Morphogenesis strategy PostgreSQL store options are required");
    this.#prefix = `${quotePostgresIdentifier(normalizePostgresIdentifier(
      input.options.schema ?? defaultPostgresSchema, "schema",
    ))}.`;
  }

  async load(stateKey: string): Promise<T | null> {
    return (await this.#row(stateKey))?.state ?? null;
  }

  async save(input: {
    readonly state: T;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: `sha256:${string}` | null;
  }) {
    const state = this.input.validate(input.state);
    let previousDigest = input.expectedStateDigest;
    if (input.expectedRevision !== null && previousDigest === null) {
      const current = await this.#row(state.stateKey);
      if (!current || current.revision !== input.expectedRevision) return false;
      previousDigest = current.state.stateDigest;
    }
    const result = input.expectedRevision === null
      ? await this.input.pool.query(
          `INSERT INTO ${this.#prefix}collective_host_runtime_states
            (scope_id,state_kind,state_key,revision,logical_time_high_water_ms,state_digest,state)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT DO NOTHING`,
          [this.input.options.scopeId, this.input.stateKind, state.stateKey,
            state.revision, state.logicalTimeHighWaterMs, state.stateDigest, JSON.stringify(state)],
        )
      : await this.input.pool.query(
          `UPDATE ${this.#prefix}collective_host_runtime_states
              SET revision=$6,logical_time_high_water_ms=$7,state_digest=$8,
                  state=$9::jsonb,updated_at=transaction_timestamp()
            WHERE scope_id=$1 AND state_kind=$2 AND state_key=$3
              AND revision=$4 AND state_digest=$5
              AND logical_time_high_water_ms <= $7`,
          [this.input.options.scopeId, this.input.stateKind, state.stateKey,
            input.expectedRevision, previousDigest, state.revision,
            state.logicalTimeHighWaterMs, state.stateDigest, JSON.stringify(state)],
        );
    if ((result.rowCount ?? 0) !== 1) {
      const retained = await this.load(state.stateKey);
      return retained?.stateDigest === state.stateDigest;
    }
    if (!(await recordWitness(this.input.options.rollbackWitness, {
      scopeId: this.input.options.scopeId,
      stateKind: this.input.stateKind,
      stateKey: state.stateKey,
      previousRevision: input.expectedRevision,
      previousDigest,
      nextRevision: state.revision,
      nextDigest: state.stateDigest,
    }))) throw new Error("Morphogenesis strategy rollback witness rejected state");
    return true;
  }

  async #row(stateKey: string): Promise<{ readonly revision: number; readonly state: T } | null> {
    const result = await this.input.pool.query<{
      revision: string | number;
      logical_time_high_water_ms: string | number;
      state_digest: string;
      state: unknown;
    }>(
      `SELECT revision,logical_time_high_water_ms,state_digest,state
         FROM ${this.#prefix}collective_host_runtime_states
        WHERE scope_id=$1 AND state_kind=$2 AND state_key=$3`,
      [this.input.options.scopeId, this.input.stateKind, stateKey],
    );
    const row = result.rows[0];
    if (!row) return null;
    const state = this.input.validate(row.state);
    const revision = Number(row.revision);
    if (revision !== state.revision ||
        Number(row.logical_time_high_water_ms) !== state.logicalTimeHighWaterMs ||
        row.state_digest !== state.stateDigest ||
        !(await this.input.options.rollbackWitness.verify({
          scopeId: this.input.options.scopeId,
          stateKind: this.input.stateKind,
          stateKey,
          revision,
          digest: state.stateDigest,
        }))) throw new Error("Morphogenesis strategy PostgreSQL state or witness diverged");
    return { revision, state };
  }
}

function recordWitness(
  witness: MorphogenesisPostgresRollbackWitnessV1,
  input: Parameters<MorphogenesisPostgresRollbackWitnessV1["record"]>[0],
) { return witness.record(input); }
