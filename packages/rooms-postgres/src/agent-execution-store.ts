import {
  agentExecutionFenceMatchesV1,
  agentDelegationHandoffCurrentV1,
  agentPurposeWorkFenceMatchesV1,
  equalPurposeWorkBindingV1,
  type AgentExecutionBindingV1,
  reserveScopedAgentBudgetsV1,
  resolveAgentContinuityV1,
  validateContinuityFenceChainV1,
  sameContinuityV1,
  type AgentContinuityRecordV1,
  type AgentGovernanceHeadV1,
  type AgentContinuityFenceV1,
  type AgentPurposeExecutionProjectionV1,
  settleAgentEffectV1,
  validateEffectReservationV1,
  type AgentExecutionStoreV1,
  type AgentExecutionLimitV1,
  type AgentEffectReservationV1,
  type AgentEffectReserveResultV1,
  type AgentBudgetTotalsV1,
  type AgentGovernedTaskBindingV1,
} from "@agentplat/rooms";
import {
  defaultPostgresSchema,
  normalizePostgresIdentifier,
  quotePostgresIdentifier,
} from "@agentplat/postgres";
import type { Pool, PoolClient } from "pg";

export class PostgresAgentExecutionStoreV1 implements AgentExecutionStoreV1 {
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
  async lineage(t: string, a: string): Promise<AgentContinuityFenceV1[]> {
    return resolveAgentContinuityV1(
      t,
      a,
      async (t, a) =>
        (
          await this.pool.query(
            `SELECT state FROM ${this.schema}.agent_governance_heads WHERE tenant_id=$1 AND agent_id=$2`,
            [t, a],
          )
        ).rows[0]?.state,
      async (t, id) =>
        (
          await this.pool.query(
            `SELECT record FROM ${this.schema}.agent_continuity WHERE tenant_id=$1 AND continuity_id=$2`,
            [t, id],
          )
        ).rows[0]?.record,
      async (t, a, id) =>
        (
          await this.pool.query(
            `SELECT state FROM ${this.schema}.purpose_missions WHERE tenant_id=$1 AND agent_id=$2 AND mission_id=$3`,
            [t, a, id],
          )
        ).rows[0]?.state,
    );
  }
  private async lockBinding(
    c: PoolClient,
    b: AgentExecutionBindingV1,
    runId?: string,
  ) {
    const ids = [
      ...new Set([
        b.agentId,
        ...(b.continuity ?? []).map((x) => x.parentAgentId),
      ]),
    ];
    const heads = new Map<string, AgentGovernanceHeadV1>(
      (
        await c.query(
          `SELECT agent_id,state FROM ${this.schema}.agent_governance_heads WHERE tenant_id=$1 AND agent_id=ANY($2::text[]) ORDER BY agent_id FOR UPDATE`,
          [b.tenantId, ids],
        )
      ).rows.map((r) => [r.agent_id, r.state]),
    );
    if (!agentExecutionFenceMatchesV1(heads.get(b.agentId), b)) return false;
    const links = new Map<string, AgentContinuityRecordV1>(),
      missions = new Map<string, AgentPurposeExecutionProjectionV1>();
    for (const f of b.continuity ?? []) {
      const r = (
        await c.query(
          `SELECT record FROM ${this.schema}.agent_continuity WHERE tenant_id=$1 AND continuity_id=$2`,
          [b.tenantId, f.continuityId],
        )
      ).rows[0]?.record;
      if (r) links.set(f.continuityId, r);
      if (r?.parentWork) {
        const state = (
          await c.query(
            `SELECT state FROM ${this.schema}.purpose_missions WHERE tenant_id=$1 AND agent_id=$2 AND mission_id=$3`,
            [b.tenantId, f.parentAgentId, r.parentWork.missionId],
          )
        ).rows[0]?.state;
        if (state)
          missions.set(
            JSON.stringify([f.parentAgentId, r.parentWork.missionId]),
            state,
          );
      }
    }
    for (const f of b.continuity ?? []) {
      if (f.delegation) {
        const d = f.delegation,
          h = (
            await c.query(
              `SELECT state FROM ${this.schema}.room_handoffs WHERE tenant_id=$1 AND room_id=$2 AND handoff_id=$3 FOR SHARE`,
              [b.tenantId, d.roomId, d.handoffId],
            )
          ).rows[0]?.state;
        if (!agentDelegationHandoffCurrentV1(b, f, h, runId)) return false;
      }
    }
    return validateContinuityFenceChainV1(
      b,
      (id) => heads.get(id),
      (id) => links.get(id),
      (a, id) => missions.get(JSON.stringify([a, id])),
    );
  }
  async purposeReady() {
    await this.pool.query(
      `SELECT mission_id FROM ${this.schema}.purpose_missions LIMIT 0`,
    );
    return true;
  }
  async handoff(t: string, roomId: string, id: string) {
    return (
      await this.pool.query(
        `SELECT state FROM ${this.schema}.room_handoffs WHERE tenant_id=$1 AND room_id=$2 AND handoff_id=$3`,
        [t, roomId, id],
      )
    ).rows[0]?.state;
  }
  async delegationsForRun(t: string, _a: string, runId: string) {
    return (
      await this.pool.query(
        `SELECT handoff_id AS "handoffId",status FROM ${this.schema}.room_handoffs WHERE tenant_id=$1 AND source_run_id=$2`,
        [t, runId],
      )
    ).rows as Array<{ handoffId: string; status: string }>;
  }
  async effectsForRun(
    t: string,
    a: string,
    runId: string,
  ): Promise<AgentEffectReservationV1[]> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.agent_execution_effects WHERE tenant_id=$1 AND ((agent_id=$2 AND record->'effect'->>'runId'=$3) OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(record->'binding'->'continuity','[]'::jsonb)) f WHERE f->>'parentAgentId'=$2 AND f->'delegation'->>'sourceRunId'=$3))`,
        [t, a, runId],
      )
    ).rows.map((r) => r.record);
  }
  private async purposeFence(c: PoolClient, b: AgentExecutionBindingV1) {
    if (!b.purposeControlDigest) return true;
    if (!b.purposeWork) return false;
    const p = (
      await c.query(
        `SELECT state FROM ${this.schema}.purpose_missions WHERE tenant_id=$1 AND agent_id=$2 AND mission_id=$3`,
        [b.tenantId, b.agentId, b.purposeWork.missionId],
      )
    ).rows[0]?.state;
    if (!agentPurposeWorkFenceMatchesV1(p, b)) return false;
    const unresolved = await c.query(
      `SELECT effect_id FROM ${this.schema}.agent_execution_effects WHERE tenant_id=$1 AND agent_id=$2 AND record->'binding'->'purposeWork'->>'missionId'=$3 AND record->'binding'->'purposeWork'->>'planId'<>$4 AND record->>'status' IN ('admitted','indeterminate') LIMIT 1`,
      [b.tenantId, b.agentId, b.purposeWork.missionId, b.purposeWork.planId],
    );
    return unresolved.rows.length === 0;
  }
  async taskBinding(
    t: string,
    roomId: string,
    taskId: string,
  ): Promise<AgentGovernedTaskBindingV1 | undefined> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.agent_governed_task_bindings WHERE tenant_id=$1 AND room_id=$2 AND task_id=$3`,
        [t, roomId, taskId],
      )
    ).rows[0]?.record;
  }
  async bindTask(input: AgentGovernedTaskBindingV1): Promise<boolean> {
    const r = structuredClone(input);
    return this.transaction(async (c) => {
      if (!(await this.lockBinding(c, r.binding))) return false;
      if (!(await this.purposeFence(c, r.binding))) return false;
      const inserted = await c.query(
        `INSERT INTO ${this.schema}.agent_governed_task_bindings (tenant_id,room_id,task_id,agent_id,record) VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT DO NOTHING RETURNING task_id`,
        [r.tenantId, r.roomId, r.taskId, r.binding.agentId, JSON.stringify(r)],
      );
      if (inserted.rowCount === 1) return true;
      const old = (
        await c.query(
          `SELECT record FROM ${this.schema}.agent_governed_task_bindings WHERE tenant_id=$1 AND room_id=$2 AND task_id=$3`,
          [r.tenantId, r.roomId, r.taskId],
        )
      ).rows[0]?.record;
      return (
        old?.taskDigest === r.taskDigest &&
        old.participantId === r.participantId &&
        old.binding.agentId === r.binding.agentId &&
        old.binding.revision === r.binding.revision &&
        old.binding.profileDigest === r.binding.profileDigest &&
        old.binding.purposeControlDigest === r.binding.purposeControlDigest &&
        equalPurposeWorkBindingV1(
          old.binding.purposeWork,
          r.binding.purposeWork,
        ) &&
        sameContinuityV1(old.binding.continuity, r.binding.continuity)
      );
    });
  }
  async limit(
    t: string,
    a: string,
    id: string,
  ): Promise<AgentExecutionLimitV1 | undefined> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.agent_execution_limits WHERE tenant_id=$1 AND agent_id=$2 AND limit_id=$3`,
        [t, a, id],
      )
    ).rows[0]?.record;
  }
  async effect(
    t: string,
    a: string,
    id: string,
  ): Promise<AgentEffectReservationV1 | undefined> {
    return (
      await this.pool.query(
        `SELECT record FROM ${this.schema}.agent_execution_effects WHERE tenant_id=$1 AND agent_id=$2 AND effect_id=$3`,
        [t, a, id],
      )
    ).rows[0]?.record;
  }
  async putLimit(
    input: AgentExecutionLimitV1,
    expected: number,
  ): Promise<boolean> {
    const r = structuredClone(input);
    return this.transaction(async (c) => {
      const h = await this.head(c, r.tenantId, r.agentId);
      if (h?.revision !== expected) return false;
      const inserted = await c.query(
        `INSERT INTO ${this.schema}.agent_execution_limits (tenant_id,agent_id,limit_id,record) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING RETURNING limit_id`,
        [r.tenantId, r.agentId, r.limitId, JSON.stringify(r)],
      );
      if (inserted.rowCount === 1) return true;
      const old = (
        await c.query(
          `SELECT record FROM ${this.schema}.agent_execution_limits WHERE tenant_id=$1 AND agent_id=$2 AND limit_id=$3`,
          [r.tenantId, r.agentId, r.limitId],
        )
      ).rows[0]?.record;
      return old?.digest === r.digest;
    });
  }
  async reserve(
    input: AgentEffectReservationV1,
    inputCaps: Array<{
      accountAgentId?: string;
      budgetId: string;
      unit: string;
      maximumUnits: number;
    }>,
  ): Promise<AgentEffectReserveResultV1> {
    const r = structuredClone(input),
      caps = structuredClone(inputCaps);
    validateEffectReservationV1(r);
    return this.transaction(async (c) => {
      const { tenantId: t, agentId: a } = r.binding,
        current = await this.lockBinding(c, r.binding, r.effect.runId);
      if (!current) return { status: "denied", code: "governance_fence_stale" };
      if (!(await this.purposeFence(c, r.binding)))
        return { status: "denied", code: "purpose_work_stale" };
      const old = (
        await c.query(
          `SELECT record FROM ${this.schema}.agent_execution_effects WHERE tenant_id=$1 AND agent_id=$2 AND effect_id=$3`,
          [t, a, r.effect.effectId],
        )
      ).rows[0]?.record;
      if (old)
        return old.requestDigest === r.requestDigest
          ? { status: "replayed", record: old }
          : { status: "denied", code: "effect_identity_conflict" };
      const accounts: Record<string, AgentBudgetTotalsV1> = {};
      for (const agentId of new Set([
        a,
        ...(r.binding.continuity ?? []).map((x) => x.parentAgentId),
      ]))
        Object.defineProperty(accounts, agentId, {
          value: await this.totals(c, t, agentId),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      const allocations = reserveScopedAgentBudgetsV1(
        accounts,
        r.effect.charges,
        caps,
        a,
      );
      if (!allocations)
        return { status: "denied", code: "budget_exhausted_or_unbound" };
      r.budgetAccounts = allocations;
      for (const [agentId, totals] of Object.entries(accounts))
        await this.saveTotals(c, t, agentId, totals);
      await c.query(
        `INSERT INTO ${this.schema}.agent_execution_effects (tenant_id,agent_id,effect_id,record) VALUES ($1,$2,$3,$4::jsonb)`,
        [t, a, r.effect.effectId, JSON.stringify(r)],
      );
      return { status: "created", record: r };
    });
  }
  async settle(
    t: string,
    a: string,
    id: string,
    requestDigest: string,
    status: Exclude<AgentEffectReservationV1["status"], "admitted">,
    proof: string,
  ): Promise<AgentEffectReservationV1> {
    return this.transaction(async (c) => {
      const peek = (
        await c.query(
          `SELECT record FROM ${this.schema}.agent_execution_effects WHERE tenant_id=$1 AND agent_id=$2 AND effect_id=$3`,
          [t, a, id],
        )
      ).rows[0]?.record;
      if (!peek) throw new Error("execution_effect_missing");
      const ids = [
        ...new Set([
          a,
          ...(peek.budgetAccounts ?? []).map(
            (x: { agentId: string }) => x.agentId,
          ),
        ]),
      ];
      await c.query(
        `SELECT agent_id FROM ${this.schema}.agent_governance_heads WHERE tenant_id=$1 AND agent_id=ANY($2::text[]) ORDER BY agent_id FOR UPDATE`,
        [t, ids],
      );
      const old = (
        await c.query(
          `SELECT record FROM ${this.schema}.agent_execution_effects WHERE tenant_id=$1 AND agent_id=$2 AND effect_id=$3`,
          [t, a, id],
        )
      ).rows[0].record;
      const accounts: Record<string, AgentBudgetTotalsV1> = {};
      for (const agentId of ids)
        Object.defineProperty(accounts, agentId, {
          value: await this.totals(c, t, agentId),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      const next = settleAgentEffectV1(
        old,
        requestDigest,
        status,
        proof,
        accounts[a],
        accounts,
      );
      for (const [agentId, totals] of Object.entries(accounts))
        await this.saveTotals(c, t, agentId, totals);
      await c.query(
        `UPDATE ${this.schema}.agent_execution_effects SET record=$4::jsonb WHERE tenant_id=$1 AND agent_id=$2 AND effect_id=$3`,
        [t, a, id, JSON.stringify(next)],
      );
      return next;
    });
  }
  private async head(c: PoolClient, t: string, a: string) {
    return (
      await c.query(
        `SELECT state FROM ${this.schema}.agent_governance_heads WHERE tenant_id=$1 AND agent_id=$2 FOR UPDATE`,
        [t, a],
      )
    ).rows[0]?.state;
  }
  private async totals(
    c: PoolClient,
    t: string,
    a: string,
  ): Promise<AgentBudgetTotalsV1> {
    return (
      (
        await c.query(
          `SELECT totals FROM ${this.schema}.agent_execution_budgets WHERE tenant_id=$1 AND agent_id=$2`,
          [t, a],
        )
      ).rows[0]?.totals ?? {}
    );
  }
  private async saveTotals(
    c: PoolClient,
    t: string,
    a: string,
    totals: AgentBudgetTotalsV1,
  ) {
    await c.query(
      `INSERT INTO ${this.schema}.agent_execution_budgets (tenant_id,agent_id,totals) VALUES ($1,$2,$3::jsonb) ON CONFLICT (tenant_id,agent_id) DO UPDATE SET totals=EXCLUDED.totals`,
      [t, a, JSON.stringify(totals)],
    );
  }
  private async transaction<T>(
    work: (c: PoolClient) => Promise<T>,
  ): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const r = await work(c);
      await c.query("COMMIT");
      return r;
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally {
      c.release();
    }
  }
}
