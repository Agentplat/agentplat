import type { RoomHandoff } from "./room-handoff.js";
import {
  resolveAgentContinuityV1,
  sameContinuityV1,
  continuityFenceV1,
  type AgentContinuityFenceV1,
  type AgentContinuityRecordV1,
} from "./agent-continuity.js";
import {
  equalPurposeWorkBindingV1,
  agentPurposeWorkFenceMatchesV1,
  type AgentPurposeControlPortV1,
  type AgentPurposeWorkBindingV1,
  type AgentPurposeExecutionProjectionV1,
} from "./purpose-control.js";
import { AgentPlatError } from "@agentplat/core";
import type { JsonValue } from "@agentplat/core";
import type { RuntimeCheckpoint } from "@agentplat/runtime";
import type { Participant, RoomTask } from "./models.js";
import type { AgentDefinitionRegistry } from "./agent-registry.js";
import {
  governanceDigestV1,
  type AgentGovernanceHeadV1,
  type AgentGovernanceStoreV1,
  type AgentGovernancePrincipalV1,
  type AgentGovernanceActivationPortV1,
} from "./agent-governance.js";

export type AgentExecutionLimitRuleV1 =
  | { kind: "tools"; allowed: string[] }
  | { kind: "operations"; allowed: string[] }
  | { kind: "destinations"; allowed: string[] }
  | { kind: "budget"; budgetId: string; unit: string; maximumUnits: number }
  | {
      kind: "semantic";
      assessorId: string;
      policyRef: string;
      maximumAgeMs: number;
    };
export interface AgentExecutionLimitV1 {
  schemaVersion: 1;
  tenantId: string;
  agentId: string;
  limitId: string;
  rule: AgentExecutionLimitRuleV1;
  createdBy: string;
  createdAt: string;
  digest: string;
}
export interface AgentExecutionBindingV1 {
  continuity?: AgentContinuityFenceV1[];
  purposeControlDigest?: string;
  purposeWork?: AgentPurposeWorkBindingV1;
  tenantId: string;
  agentId: string;
  governanceId: string;
  revision: number;
  authorityEpoch: number;
  configurationDigest: string;
  definitionRevisionId: string;
  profileDigest: string;
}
export interface AgentExecutionProfileV1 {
  supervisionId?: string;
  adapterId: string;
  runtimePlatform: string;
  definitionRevisionId: string;
  preActionCheckpoint: boolean;
  cooperativeAbort: boolean;
  gatewayOnlyEffects: boolean;
  idempotentEffects: boolean;
}
export interface AgentEffectChargeV1 {
  budgetId: string;
  unit: string;
  units: number;
}
export interface AgentEffectDescriptorV1 {
  effectId: string;
  grantId: string;
  reservationId: string;
  dispatchAttemptId: string;
  runId: string;
  downstreamIdempotencyKey: string;
  scopeDigest: string;
  actionDigest: string;
  inputDigest: string;
  toolId: string;
  operation: string;
  destination: string | null;
  charges: AgentEffectChargeV1[];
}
export interface AgentEffectReservationV1 {
  schemaVersion: 1;
  binding: AgentExecutionBindingV1;
  effect: AgentEffectDescriptorV1;
  requestDigest: string;
  budgetAccounts?: Array<{ agentId: string; charges: AgentEffectChargeV1[] }>;
  status: "admitted" | "succeeded" | "indeterminate" | "not_applied";
  semanticEvidenceRefs: string[];
  supervisionDecisionDigests?: string[];
  createdAt: string;
  proofRef: string | null;
}
export type AgentEffectReserveResultV1 =
  | { status: "created" | "replayed"; record: AgentEffectReservationV1 }
  | { status: "denied"; code: string };
export interface AgentGovernedTaskBindingV1 {
  tenantId: string;
  roomId: string;
  taskId: string;
  participantId: string;
  taskDigest: string;
  binding: AgentExecutionBindingV1;
}
export interface AgentExecutionStoreV1 {
  lineage?(t: string, a: string): Promise<AgentContinuityFenceV1[]>;
  purposeReady?(): Promise<boolean>;
  handoff?(
    t: string,
    roomId: string,
    id: string,
  ): Promise<RoomHandoff | undefined>;
  delegationsForRun?(
    t: string,
    a: string,
    runId: string,
  ): Promise<Array<{ handoffId: string; status: string }>>;
  effectsForRun(
    t: string,
    a: string,
    runId: string,
  ): Promise<AgentEffectReservationV1[]>;
  taskBinding(
    t: string,
    roomId: string,
    taskId: string,
  ): Promise<AgentGovernedTaskBindingV1 | undefined>;
  bindTask(record: AgentGovernedTaskBindingV1): Promise<boolean>;
  limit(
    t: string,
    a: string,
    id: string,
  ): Promise<AgentExecutionLimitV1 | undefined>;
  putLimit(
    record: AgentExecutionLimitV1,
    expectedGovernanceRevision: number,
  ): Promise<boolean>;
  effect(
    t: string,
    a: string,
    id: string,
  ): Promise<AgentEffectReservationV1 | undefined>;
  /** Atomically fence active governance and reserve ALL cumulative budget charges. */
  reserve(
    record: AgentEffectReservationV1,
    caps: Array<{
      accountAgentId?: string;
      budgetId: string;
      unit: string;
      maximumUnits: number;
    }>,
  ): Promise<AgentEffectReserveResultV1>;
  /** not_applied refunds once; indeterminate retains the full reservation. Trusted reconciliation only. */
  settle(
    t: string,
    a: string,
    id: string,
    requestDigest: string,
    status: Exclude<AgentEffectReservationV1["status"], "admitted">,
    proofRef: string,
  ): Promise<AgentEffectReservationV1>;
}
export interface AgentExecutionLimitAccessV1<Context> {
  authenticate(context: Context): Promise<AgentGovernancePrincipalV1 | null>;
  authorize(
    p: AgentGovernancePrincipalV1,
    r: {
      agentId: string;
      operation: "limits" | "read";
      rule?: AgentExecutionLimitRuleV1;
    },
  ): Promise<boolean>;
}
export interface AgentSemanticLimitPortV1 {
  assess(input: {
    policyAgentId?: string;
    rule: Extract<AgentExecutionLimitRuleV1, { kind: "semantic" }>;
    binding: AgentExecutionBindingV1;
    effect: AgentEffectDescriptorV1;
  }): Promise<{
    allowed: boolean;
    assessorId: string;
    configurationDigest: string;
    actionDigest: string;
    assessedAt: string;
    evidenceRef: string;
  }>;
}
export interface AgentExecutionSupervisionPortV1 {
  supports(supervisionId: string): boolean;
  assess(input: {
    supervisionId: string;
    policyAgentId: string;
    binding: AgentExecutionBindingV1;
    effect: AgentEffectDescriptorV1;
    logicalTime: string;
  }): Promise<{ allowed: boolean; decisionDigest: string }>;
}
export interface AgentEffectReconciliationPortV1 {
  /** Verify a downstream receipt; never infer not_applied from timeout or tool ok:false. */
  lookup(record: AgentEffectReservationV1): Promise<{
    requestDigest: string;
    outcome: "succeeded" | "not_applied" | "indeterminate";
    proofRef: string;
  }>;
}
export type AgentBudgetTotalsV1 = Record<
  string,
  { unit: string; used: number }
>;

export class InMemoryAgentExecutionStoreV1 implements AgentExecutionStoreV1 {
  private limits = new Map<string, AgentExecutionLimitV1>();
  private effects = new Map<string, AgentEffectReservationV1>();
  private tasks = new Map<string, AgentGovernedTaskBindingV1>();
  private budgets = new Map<string, AgentBudgetTotalsV1>();
  constructor(
    private readonly governance: {
      executionHead(t: string, a: string): AgentGovernanceHeadV1 | undefined;
    },
    private readonly purpose?: {
      executionMission(
        t: string,
        a: string,
        id: string,
      ): AgentPurposeExecutionProjectionV1 | undefined;
    },
    private readonly continuity?: {
      executionLink(t: string, id: string): AgentContinuityRecordV1 | undefined;
    },
    private readonly handoffs?: {
      executionHandoff(
        t: string,
        roomId: string,
        id: string,
      ): RoomHandoff | undefined;
      executionHandoffsForRun(t: string, runId: string): RoomHandoff[];
    },
  ) {}
  async lineage(t: string, a: string) {
    return resolveAgentContinuityV1(
      t,
      a,
      async (t, a) => this.governance.executionHead(t, a),
      async (t, id) => this.continuity?.executionLink(t, id),
      async (t, a, id) => this.purpose?.executionMission(t, a, id),
    );
  }
  async taskBinding(t: string, roomId: string, taskId: string) {
    return clone(this.tasks.get(key(t, roomId, taskId)));
  }
  private priorPurposeEffectPending(b: AgentExecutionBindingV1) {
    const w = b.purposeWork;
    if (!w) return false;
    return [...this.effects.values()].some(
      (r) =>
        r.binding.tenantId === b.tenantId &&
        r.binding.agentId === b.agentId &&
        r.binding.purposeWork?.missionId === w.missionId &&
        r.binding.purposeWork.planId !== w.planId &&
        ["admitted", "indeterminate"].includes(r.status),
    );
  }
  async bindTask(r: AgentGovernedTaskBindingV1) {
    if (
      !agentExecutionFenceMatchesV1(
        this.governance.executionHead(r.tenantId, r.binding.agentId),
        r.binding,
      )
    )
      return false;
    if (
      r.binding.purposeControlDigest &&
      !agentPurposeWorkFenceMatchesV1(
        this.purpose?.executionMission(
          r.tenantId,
          r.binding.agentId,
          r.binding.purposeWork?.missionId ?? "",
        ),
        r.binding,
      )
    )
      return false;
    if (
      !this.continuityCurrent(r.binding) ||
      this.priorPurposeEffectPending(r.binding)
    )
      return false;
    const k = key(r.tenantId, r.roomId, r.taskId),
      old = this.tasks.get(k);
    if (old)
      return (
        old.taskDigest === r.taskDigest &&
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
    this.tasks.set(k, clone(r));
    return true;
  }
  private continuityCurrent(b: AgentExecutionBindingV1, runId?: string) {
    for (const f of b.continuity ?? [])
      if (
        f.delegation &&
        !agentDelegationHandoffCurrentV1(
          b,
          f,
          this.handoffs?.executionHandoff(
            b.tenantId,
            f.delegation.roomId,
            f.delegation.handoffId,
          ),
          runId,
        )
      )
        return false;
    return validateContinuityFenceChainV1(
      b,
      (t) => this.governance.executionHead(b.tenantId, t),
      (id) => this.continuity?.executionLink(b.tenantId, id),
      (a, id) => this.purpose?.executionMission(b.tenantId, a, id),
    );
  }
  async limit(t: string, a: string, id: string) {
    return clone(this.limits.get(key(t, a, id)));
  }
  async putLimit(r: AgentExecutionLimitV1, expected: number) {
    if (
      this.governance.executionHead(r.tenantId, r.agentId)?.revision !==
      expected
    )
      return false;
    const k = key(r.tenantId, r.agentId, r.limitId),
      old = this.limits.get(k);
    if (old) return old.digest === r.digest;
    this.limits.set(k, clone(r));
    return true;
  }
  async purposeReady() {
    return !!this.purpose;
  }
  async handoff(t: string, roomId: string, id: string) {
    return this.handoffs?.executionHandoff(t, roomId, id);
  }
  async delegationsForRun(t: string, _a: string, runId: string) {
    return (this.handoffs?.executionHandoffsForRun(t, runId) ?? []).map(
      (h) => ({ handoffId: h.handoffId, status: h.status }),
    );
  }
  async effectsForRun(t: string, a: string, runId: string) {
    return clone(
      [...this.effects.values()].filter(
        (r) =>
          r.binding.tenantId === t &&
          ((r.binding.agentId === a && r.effect.runId === runId) ||
            r.binding.continuity?.some(
              (f) =>
                f.parentAgentId === a && f.delegation?.sourceRunId === runId,
            )),
      ),
    );
  }
  async effect(t: string, a: string, id: string) {
    return clone(this.effects.get(key(t, a, id)));
  }
  async reserve(
    input: AgentEffectReservationV1,
    caps: Array<{
      accountAgentId?: string;
      budgetId: string;
      unit: string;
      maximumUnits: number;
    }>,
  ): Promise<AgentEffectReserveResultV1> {
    const r = clone(input);
    validateEffectReservationV1(r);
    if (
      !agentExecutionFenceMatchesV1(
        this.governance.executionHead(r.binding.tenantId, r.binding.agentId),
        r.binding,
      )
    )
      return { status: "denied", code: "governance_fence_stale" };
    if (
      r.binding.purposeControlDigest &&
      !agentPurposeWorkFenceMatchesV1(
        this.purpose?.executionMission(
          r.binding.tenantId,
          r.binding.agentId,
          r.binding.purposeWork?.missionId ?? "",
        ),
        r.binding,
      )
    )
      return { status: "denied", code: "purpose_work_stale" };
    if (!this.continuityCurrent(r.binding, r.effect.runId))
      return { status: "denied", code: "continuity_stale" };
    if (this.priorPurposeEffectPending(r.binding))
      return { status: "denied", code: "purpose_prior_effect_unresolved" };
    const k = key(r.binding.tenantId, r.binding.agentId, r.effect.effectId),
      old = this.effects.get(k);
    if (old) {
      if (old.requestDigest !== r.requestDigest)
        return { status: "denied", code: "effect_identity_conflict" };
      return { status: "replayed", record: clone(old) };
    }
    const accounts: Record<string, AgentBudgetTotalsV1> = {};
    for (const agentId of new Set([
      r.binding.agentId,
      ...(r.binding.continuity ?? []).map((c) => c.parentAgentId),
    ]))
      Object.defineProperty(accounts, agentId, {
        value: clone(this.budgets.get(key(r.binding.tenantId, agentId)) ?? {}),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    const allocations = reserveScopedAgentBudgetsV1(
      accounts,
      r.effect.charges,
      caps,
      r.binding.agentId,
    );
    if (!allocations)
      return { status: "denied", code: "budget_exhausted_or_unbound" };
    r.budgetAccounts = allocations;
    for (const [agentId, totals] of Object.entries(accounts))
      this.budgets.set(key(r.binding.tenantId, agentId), totals);
    this.effects.set(k, r);
    return { status: "created", record: clone(r) };
  }
  async settle(
    t: string,
    a: string,
    id: string,
    d: string,
    status: Exclude<AgentEffectReservationV1["status"], "admitted">,
    proof: string,
  ) {
    const k = key(t, a, id),
      old = this.effects.get(k);
    if (!old) missing();
    const totals = clone(this.budgets.get(key(t, a)) ?? {});
    const accounts: Record<string, AgentBudgetTotalsV1> = {};
    for (const allocation of old.budgetAccounts ?? [
      { agentId: a, charges: old.effect.charges },
    ])
      Object.defineProperty(accounts, allocation.agentId, {
        value: clone(this.budgets.get(key(t, allocation.agentId)) ?? {}),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    const next = settleAgentEffectV1(old, d, status, proof, totals, accounts);
    for (const [agentId, values] of Object.entries(accounts))
      this.budgets.set(key(t, agentId), values);
    this.effects.set(k, next);
    return clone(next);
  }
}

export class AgentExecutionLimitServiceV1<Context> {
  constructor(
    private readonly store: AgentExecutionStoreV1,
    private readonly governance: Pick<AgentGovernanceStoreV1, "load">,
    private readonly access: AgentExecutionLimitAccessV1<Context>,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async define(
    context: Context,
    input: {
      agentId: string;
      expectedGovernanceRevision: number;
      rule: AgentExecutionLimitRuleV1;
    },
  ) {
    const r = clone(input);
    exact(r, ["agentId", "expectedGovernanceRevision", "rule"]);
    id(r.agentId);
    integer(r.expectedGovernanceRevision);
    validateAgentExecutionLimitRuleV1(r.rule);
    const p = await this.principal(context, {
      agentId: r.agentId,
      operation: "limits",
      rule: r.rule,
    });
    const h = await this.governance.load(p.tenantId, r.agentId),
      now = this.clock().toISOString();
    if (!h || h.revision !== r.expectedGovernanceRevision || now < h.updatedAt)
      conflict();
    if (
      h.configuration.ownerId !== p.subjectId &&
      !h.configuration.delegations.some(
        (d) =>
          d.subjectId === p.subjectId &&
          d.operation === "limits" &&
          d.expiresAt > now,
      )
    )
      denied();
    const hash = await digest(r.rule),
      limitId = `limit:${hash}`;
    const record: AgentExecutionLimitV1 = {
      schemaVersion: 1,
      tenantId: p.tenantId,
      agentId: r.agentId,
      limitId,
      rule: r.rule,
      createdBy: p.subjectId,
      createdAt: now,
      digest: hash,
    };
    if (!(await this.store.putLimit(record, h.revision))) conflict();
    return (await this.store.limit(p.tenantId, r.agentId, limitId))!;
  }
  async get(context: Context, input: { agentId: string; limitId: string }) {
    const r = clone(input);
    exact(r, ["agentId", "limitId"]);
    id(r.agentId);
    id(r.limitId);
    const p = await this.principal(context, {
      agentId: r.agentId,
      operation: "read",
    });
    const record = await this.store.limit(p.tenantId, r.agentId, r.limitId);
    if (!record) missing();
    return record;
  }
  private async principal(
    context: Context,
    r: Parameters<AgentExecutionLimitAccessV1<Context>["authorize"]>[1],
  ) {
    try {
      const p = clone(await this.access.authenticate(context));
      if (!p) denied();
      id(p.tenantId);
      id(p.subjectId);
      if (!(await this.access.authorize(clone(p), clone(r)))) denied();
      return p;
    } catch {
      return denied();
    }
  }
}

/** Narrows host execution; this controller creates no Action Grants and owns no tool credentials. */
export class AgentExecutionControllerV1 implements AgentGovernanceActivationPortV1 {
  private readonly profile: AgentExecutionProfileV1;
  private readonly platformLimits: AgentExecutionLimitRuleV1[];
  constructor(
    private readonly store: AgentExecutionStoreV1,
    private readonly governance: Pick<AgentGovernanceStoreV1, "load">,
    private readonly definitions: Pick<AgentDefinitionRegistry, "getRevision">,
    profile: AgentExecutionProfileV1,
    platformLimits: AgentExecutionLimitRuleV1[] = [],
    private readonly semantic?: AgentSemanticLimitPortV1,
    private readonly clock: () => Date = () => new Date(),
    private readonly purpose?: AgentPurposeControlPortV1,
    private readonly supervision?: AgentExecutionSupervisionPortV1,
  ) {
    this.profile = clone(profile);
    this.platformLimits = clone(platformLimits);
    validateProfile(this.profile);
    this.platformLimits.forEach(validateAgentExecutionLimitRuleV1);
  }
  async admit(head: AgentGovernanceHeadV1) {
    if (head.status !== "transitioning") denied();
    if (
      !this.profile.preActionCheckpoint ||
      !this.profile.cooperativeAbort ||
      !this.profile.gatewayOnlyEffects ||
      !this.profile.idempotentEffects
    )
      denied();
    if (head.configuration.interactionMode === "purpose") {
      if (!this.purpose || !(await this.store.purposeReady?.())) denied();
      await this.purpose.admit(clone(head));
    }
    await this.definition(head);
    for (const required of await this.requiredSupervision(head))
      if (!this.supervision?.supports(required.id)) denied();
    const rules = await this.rules(head);
    if (
      !rules.some((r) => r.kind === "tools") ||
      !rules.some((r) => r.kind === "operations") ||
      (rules.some((r) => r.kind === "semantic") && !this.semantic)
    )
      denied();
    return {
      ...(head.configuration.interactionMode === "purpose"
        ? { purposeControlDigest: await this.purpose!.configurationDigest() }
        : {}),
      platformLimits: clone(this.platformLimits),
      ...(this.profile.supervisionId
        ? { supervisionId: this.profile.supervisionId }
        : {}),
      adapterId: this.profile.adapterId,
      profileDigest: await this.profileDigest(),
      definitionRevisionId: head.configuration.definitionRevisionId,
    };
  }
  async open(
    tenantId: string,
    agentId: string,
  ): Promise<AgentExecutionBindingV1> {
    id(tenantId);
    id(agentId);
    const h = await this.governance.load(tenantId, agentId);
    if (!h || !h.executionAdmission) denied();
    const b: AgentExecutionBindingV1 = {
      tenantId,
      agentId,
      ...(h.executionAdmission.purposeControlDigest
        ? { purposeControlDigest: h.executionAdmission.purposeControlDigest }
        : {}),
      ...(h.configuration.origin
        ? { continuity: await this.ancestors(h) }
        : {}),
      governanceId: h.governanceId,
      revision: h.revision,
      authorityEpoch: h.authorityEpoch,
      configurationDigest: h.configurationDigest,
      definitionRevisionId: h.configuration.definitionRevisionId,
      profileDigest: h.executionAdmission.profileDigest,
    };
    await this.assertCurrent(b);
    return b;
  }
  async assertCurrent(binding: AgentExecutionBindingV1): Promise<void> {
    const b = clone(binding),
      h = await this.governance.load(b.tenantId, b.agentId);
    if (
      !agentExecutionFenceMatchesV1(h, b) ||
      b.profileDigest !== (await this.profileDigest()) ||
      this.clock().toISOString() < h!.updatedAt
    )
      denied();
    if (b.purposeControlDigest) {
      if (
        !this.purpose ||
        b.purposeControlDigest !== (await this.purpose.configurationDigest())
      )
        denied();
      if (b.purposeWork && !(await this.purpose.checkWork(b))) denied();
    }
    if (!sameContinuityV1(b.continuity, await this.ancestors(h!))) denied();
    await this.definition(h!);
    await this.rules(h!);
  }
  async reserve(
    binding: AgentExecutionBindingV1,
    effect: AgentEffectDescriptorV1,
  ): Promise<AgentEffectReserveResultV1> {
    const b = clone(binding),
      e = clone(effect);
    validateDescriptor(e);
    await this.assertCurrent(b);
    if (
      b.purposeControlDigest &&
      (!b.purposeWork ||
        !this.purpose ||
        !(await this.purpose.checkEffect(b, e)))
    )
      return { status: "denied", code: "purpose_work_stale" };
    const h = await this.governance.load(b.tenantId, b.agentId);
    if (!agentExecutionFenceMatchesV1(h, b)) denied();
    const rules = await this.scopedRules(h!);
    const caps = new Map<
      string,
      {
        accountAgentId: string;
        budgetId: string;
        unit: string;
        maximumUnits: number;
      }
    >();
    const semanticEvidenceRefs: string[] = [];
    for (const { agentId: accountAgentId, rule } of rules) {
      if (rule.kind === "tools" && !rule.allowed.includes(e.toolId))
        return { status: "denied", code: "tool_limit" };
      if (rule.kind === "operations" && !rule.allowed.includes(e.operation))
        return { status: "denied", code: "operation_limit" };
      if (
        rule.kind === "destinations" &&
        (e.destination === null || !rule.allowed.includes(e.destination))
      )
        return { status: "denied", code: "destination_limit" };
      if (rule.kind === "budget") {
        const budgetKey = JSON.stringify([accountAgentId, rule.budgetId]);
        const old = caps.get(budgetKey);
        if (old && old.unit !== rule.unit) denied();
        caps.set(budgetKey, {
          accountAgentId,
          budgetId: rule.budgetId,
          unit: rule.unit,
          maximumUnits: Math.min(
            old?.maximumUnits ?? rule.maximumUnits,
            rule.maximumUnits,
          ),
        });
      }
      if (rule.kind === "semantic") {
        if (!this.semantic)
          return { status: "denied", code: "semantic_guard_unavailable" };
        let result: Awaited<ReturnType<AgentSemanticLimitPortV1["assess"]>>;
        try {
          result = await this.semantic.assess({
            policyAgentId: accountAgentId,
            rule: clone(rule),
            binding: clone(b),
            effect: clone(e),
          });
        } catch {
          return { status: "denied", code: "semantic_guard_unavailable" };
        }
        const age = this.clock().getTime() - Date.parse(result.assessedAt);
        if (
          result.allowed !== true ||
          result.assessorId !== rule.assessorId ||
          result.configurationDigest !== b.configurationDigest ||
          result.actionDigest !== e.actionDigest ||
          !Number.isFinite(age) ||
          age < 0 ||
          age > rule.maximumAgeMs ||
          !result.evidenceRef
        )
          return { status: "denied", code: "semantic_limit" };
        id(result.evidenceRef);
        semanticEvidenceRefs.push(result.evidenceRef);
      }
    }
    const supervisionDecisionDigests: string[] = [];
    for (const required of await this.requiredSupervision(h!)) {
      if (!this.supervision?.supports(required.id))
        return { status: "denied", code: "supervision_unavailable" };
      let decision: { allowed: boolean; decisionDigest: string };
      try {
        decision = await this.supervision.assess({
          supervisionId: required.id,
          policyAgentId: required.agentId,
          binding: clone(b),
          effect: clone(e),
          logicalTime: this.clock().toISOString(),
        });
      } catch {
        return { status: "denied", code: "supervision_unavailable" };
      }
      if (
        decision.allowed !== true ||
        !/^sha256:[a-f0-9]{64}$/u.test(decision.decisionDigest)
      )
        return { status: "denied", code: "supervision_denied" };
      supervisionDecisionDigests.push(decision.decisionDigest);
    }
    const requestDigest = await digest({ binding: b, effect: e });
    return this.store.reserve(
      {
        schemaVersion: 1,
        binding: b,
        effect: e,
        requestDigest,
        semanticEvidenceRefs,
        ...(supervisionDecisionDigests.length
          ? { supervisionDecisionDigests }
          : {}),
        status: "admitted",
        createdAt: this.clock().toISOString(),
        proofRef: null,
      },
      [...caps.values()],
    );
  }
  async recordOutcome(
    record: AgentEffectReservationV1,
    status: "succeeded" | "indeterminate",
    proofRef: string,
  ) {
    return this.store.settle(
      record.binding.tenantId,
      record.binding.agentId,
      record.effect.effectId,
      record.requestDigest,
      status,
      proofRef,
    );
  }
  async reconcile(
    tenantId: string,
    agentId: string,
    effectId: string,
    port: AgentEffectReconciliationPortV1,
  ) {
    const record = await this.store.effect(tenantId, agentId, effectId);
    if (!record) missing();
    const receipt = await port.lookup(clone(record));
    if (receipt.requestDigest !== record.requestDigest) conflict();
    return this.store.settle(
      tenantId,
      agentId,
      effectId,
      receipt.requestDigest,
      receipt.outcome,
      receipt.proofRef,
    );
  }
  async bindRoomTask(input: {
    tenantId: string;
    participant: Participant;
    task: RoomTask;
  }): Promise<void> {
    const agentId =
      typeof input.participant.metadata?.agentId === "string"
        ? input.participant.metadata.agentId
        : input.participant.id;
    const binding = await this.open(input.tenantId, agentId);
    if (binding.purposeControlDigest) {
      if (!this.purpose) denied();
      binding.purposeWork = await this.purpose.bindTask({ ...input, binding });
    }
    const delegated = binding.continuity?.[0]?.delegation;
    if (delegated) {
      if (
        input.task.roomId !== delegated.roomId ||
        input.participant.id !== delegated.targetParticipantId
      )
        denied();
      if (binding.purposeControlDigest) {
        if (
          !this.purpose?.checkDelegation ||
          !(await this.purpose.checkDelegation(
            binding,
            delegated.inceptionMessageId,
            delegated.inceptionContentDigest,
          ))
        )
          denied();
      } else {
        const h = await this.store.handoff?.(
          input.tenantId,
          delegated.roomId,
          delegated.handoffId,
        );
        if (
          !h ||
          input.task.metadata?.handoffId !== delegated.handoffId ||
          input.task.instruction !== h.instruction
        )
          denied();
      }
    }
    if (
      typeof input.task.metadata?.agentRevisionId === "string" &&
      input.task.metadata.agentRevisionId !== binding.definitionRevisionId
    )
      denied();
    if (
      input.task.tenantId !== input.tenantId ||
      input.participant.tenantId !== input.tenantId
    )
      denied();
    if (
      !(await this.store.bindTask({
        tenantId: input.tenantId,
        roomId: input.task.roomId,
        taskId: input.task.id,
        participantId: input.participant.id,
        taskDigest: await agentRoomTaskExecutionDigestV1(input.task),
        binding,
      }))
    )
      denied();
  }
  async definitionForParticipant(input: {
    tenantId: string;
    participant: Participant;
  }): Promise<string> {
    const agentId =
      typeof input.participant.metadata?.agentId === "string"
        ? input.participant.metadata.agentId
        : input.participant.id;
    const head = await this.governance.load(input.tenantId, agentId);
    if (head?.configuration.interactionMode === "purpose" && this.purpose) {
      // This selection permits inert inception intake while paused, not execution.
      await this.definition(head);
      return head.configuration.definitionRevisionId;
    }
    return (await this.open(input.tenantId, agentId)).definitionRevisionId;
  }
  async openRoom(input: {
    tenantId: string;
    participant: Participant;
    task: RoomTask;
    supportsPreAction: boolean;
  }): Promise<{
    binding: AgentExecutionBindingV1;
    purposeContext?: import("@agentplat/core").JsonObject;
    check(checkpoint: RuntimeCheckpoint): Promise<void>;
  }> {
    if (!input.supportsPreAction) denied();
    const agentId =
      typeof input.participant.metadata?.agentId === "string"
        ? input.participant.metadata.agentId
        : input.participant.id;
    const persisted = await this.store.taskBinding(
      input.tenantId,
      input.task.roomId,
      input.task.id,
    );
    if (
      !persisted ||
      persisted.participantId !== input.participant.id ||
      persisted.binding.agentId !== agentId ||
      persisted.taskDigest !==
        (await agentRoomTaskExecutionDigestV1(input.task))
    )
      denied();
    const b = persisted.binding;
    await this.assertCurrent(b);
    const h = await this.governance.load(input.tenantId, agentId);
    if (!h) denied();
    const definition = await this.definition(h);
    const runtime = clone(input.participant.runtime);
    if (!runtime) denied();
    const { instructions, ...profile } = runtime;
    if (
      instructions !== definition.instructions ||
      (await digest(profile)) !== (await digest(definition.runtimeProfile))
    )
      denied();
    return {
      binding: clone(b),
      ...(b.purposeControlDigest
        ? { purposeContext: await this.purpose!.context(b) }
        : {}),
      check: async () => {
        await this.assertCurrent(b);
        for (const f of b.continuity ?? [])
          if (
            f.delegation &&
            !agentDelegationHandoffCurrentV1(
              b,
              f,
              await this.store.handoff?.(
                b.tenantId,
                f.delegation.roomId,
                f.delegation.handoffId,
              ),
            )
          )
            denied();
      },
    };
  }
  private async definition(h: AgentGovernanceHeadV1) {
    if (
      h.configuration.definitionRevisionId !== this.profile.definitionRevisionId
    )
      denied();
    const r = await this.definitions.getRevision(
      h.tenantId,
      h.configuration.definitionRevisionId,
    );
    if (
      r.lifecycle.status !== "published" ||
      r.definition.agentId !== h.agentId ||
      r.definition.tenantId !== h.tenantId ||
      r.definition.runtimeProfile.platform !== this.profile.runtimePlatform
    )
      denied();
    return r.definition;
  }
  private async requiredSupervision(h: AgentGovernanceHeadV1) {
    const result: Array<{ id: string; agentId: string }> = this.profile
      .supervisionId
      ? [{ id: this.profile.supervisionId, agentId: h.agentId }]
      : [];
    for (const ancestor of await this.ancestors(h)) {
      const parent = await this.governance.load(
        h.tenantId,
        ancestor.parentAgentId,
      );
      if (parent?.executionAdmission?.supervisionId)
        result.push({
          id: parent.executionAdmission.supervisionId,
          agentId: parent.agentId,
        });
    }
    return result;
  }
  private async ancestors(
    h: AgentGovernanceHeadV1,
  ): Promise<AgentContinuityFenceV1[]> {
    if (!h.configuration.origin) return [];
    if (!this.store.lineage) denied();
    return this.store.lineage(h.tenantId, h.agentId);
  }
  private async rules(h: AgentGovernanceHeadV1) {
    return (await this.scopedRules(h)).map((x) => x.rule);
  }
  private async scopedRules(h: AgentGovernanceHeadV1) {
    const records: Array<{ agentId: string; rule: AgentExecutionLimitRuleV1 }> =
      this.platformLimits.map((rule) => ({
        agentId: h.agentId,
        rule: clone(rule),
      }));
    const heads = [h];
    for (const link of await this.ancestors(h)) {
      const parent = await this.governance.load(h.tenantId, link.parentAgentId);
      if (!parent || !parent.executionAdmission?.platformLimits) denied();
      heads.push(parent);
      records.push(
        ...parent.executionAdmission.platformLimits.map((rule) => ({
          agentId: parent.agentId,
          rule: clone(rule),
        })),
      );
      if (link.permittedTools !== null)
        records.push({
          agentId: parent.agentId,
          rule: { kind: "tools", allowed: clone(link.permittedTools) },
        });
    }
    for (const head of heads)
      for (const ref of head.configuration.limitRefs) {
        const record = await this.store.limit(head.tenantId, head.agentId, ref);
        if (
          !record ||
          record.digest !== (await digest(record.rule)) ||
          record.limitId !== `limit:${record.digest}`
        )
          denied();
        records.push({ agentId: head.agentId, rule: record.rule });
      }
    records.forEach((x) => validateAgentExecutionLimitRuleV1(x.rule));
    return records;
  }
  private async profileDigest() {
    return digest({
      profile: this.profile,
      platformLimits: this.platformLimits,
      ...(this.purpose
        ? { purposeControl: await this.purpose.configurationDigest() }
        : {}),
    });
  }
}

export interface RoomExecutionGovernancePortV1 {
  definitionForParticipant(input: {
    tenantId: string;
    participant: Participant;
  }): Promise<string>;
  bindRoomTask(input: {
    tenantId: string;
    participant: Participant;
    task: RoomTask;
  }): Promise<void>;
  openRoom(input: {
    tenantId: string;
    participant: Participant;
    task: RoomTask;
    supportsPreAction: boolean;
  }): Promise<{
    binding: AgentExecutionBindingV1;
    purposeContext?: import("@agentplat/core").JsonObject;
    check(checkpoint: RuntimeCheckpoint): Promise<void>;
  }>;
}
export function agentRoomTaskExecutionDigestV1(task: RoomTask) {
  const {
    createdAt,
    updatedAt,
    completedAt,
    status,
    errorMessage,
    ...content
  } = task;
  return digest(content);
}
export function agentExecutionFenceMatchesV1(
  h: AgentGovernanceHeadV1 | undefined,
  b: AgentExecutionBindingV1,
) {
  return (
    !!h &&
    h.tenantId === b.tenantId &&
    h.agentId === b.agentId &&
    h.status === "active" &&
    (h.configuration.interactionMode === "instruction"
      ? !b.purposeControlDigest
      : !!b.purposeControlDigest &&
        h.executionAdmission?.purposeControlDigest ===
          b.purposeControlDigest) &&
    h.governanceId === b.governanceId &&
    h.revision === b.revision &&
    h.authorityEpoch === b.authorityEpoch &&
    h.configurationDigest === b.configurationDigest &&
    h.configuration.definitionRevisionId === b.definitionRevisionId &&
    h.executionAdmission?.profileDigest === b.profileDigest
  );
}
export function reserveAgentBudgetTotalsV1(
  totals: AgentBudgetTotalsV1,
  charges: AgentEffectChargeV1[],
  caps: Array<{
    accountAgentId?: string;
    budgetId: string;
    unit: string;
    maximumUnits: number;
  }>,
): boolean {
  if (
    charges.length !== caps.length ||
    new Set(charges.map((x) => x.budgetId)).size !== charges.length ||
    new Set(caps.map((x) => x.budgetId)).size !== caps.length
  )
    return false;
  const next: AgentBudgetTotalsV1 = {};
  for (const charge of charges) {
    id(charge.budgetId);
    id(charge.unit);
    integer(charge.units);
    const cap = caps.find((c) => c.budgetId === charge.budgetId);
    if (!cap || cap.unit !== charge.unit) return false;
    integer(cap.maximumUnits);
    const old = Object.hasOwn(totals, charge.budgetId)
      ? totals[charge.budgetId]
      : undefined;
    if (old && old.unit !== charge.unit) return false;
    const used = (old?.used ?? 0) + charge.units;
    if (!Number.isSafeInteger(used) || used > cap.maximumUnits) return false;
    Object.defineProperty(next, charge.budgetId, {
      value: { unit: charge.unit, used },
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  for (const [k, v] of Object.entries(next))
    Object.defineProperty(totals, k, {
      value: v,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  return true;
}
export function settleAgentEffectV1(
  record: AgentEffectReservationV1,
  digestValue: string,
  status: Exclude<AgentEffectReservationV1["status"], "admitted">,
  proofRef: string,
  totals: AgentBudgetTotalsV1,
  accounts?: Record<string, AgentBudgetTotalsV1>,
): AgentEffectReservationV1 {
  if (
    record.requestDigest !== digestValue ||
    !["succeeded", "indeterminate", "not_applied"].includes(status)
  )
    conflict();
  id(proofRef);
  if (record.status === status) return clone(record);
  if (record.status === "succeeded" || record.status === "not_applied")
    conflict();
  if (status === "not_applied")
    for (const allocation of record.budgetAccounts ?? [
      { agentId: record.binding.agentId, charges: record.effect.charges },
    ])
      for (const c of allocation.charges) {
        const target =
          accounts?.[allocation.agentId] ??
          (allocation.agentId === record.binding.agentId ? totals : undefined);
        if (!target) conflict();
        const entry = Object.hasOwn(target, c.budgetId)
          ? target[c.budgetId]
          : undefined;
        if (!entry || entry.unit !== c.unit || entry.used < c.units) conflict();
        entry.used -= c.units;
      }
  return { ...clone(record), status, proofRef };
}
export function validateEffectReservationV1(r: AgentEffectReservationV1) {
  if (r.schemaVersion !== 1 || r.status !== "admitted" || r.proofRef !== null)
    invalid();
  validateDescriptor(r.effect);
  hash(r.requestDigest);
  hash(r.binding.profileDigest);
  integer(r.binding.revision);
  integer(r.binding.authorityEpoch);
}
export function validateAgentExecutionLimitRuleV1(
  r: AgentExecutionLimitRuleV1,
) {
  if (!r || typeof r !== "object") invalid();
  if (
    r.kind === "tools" ||
    r.kind === "operations" ||
    r.kind === "destinations"
  ) {
    exact(r, ["kind", "allowed"]);
    if (
      !Array.isArray(r.allowed) ||
      r.allowed.length > 256 ||
      new Set(r.allowed).size !== r.allowed.length
    )
      invalid();
    r.allowed.forEach(id);
  } else if (r.kind === "budget") {
    exact(r, ["kind", "budgetId", "unit", "maximumUnits"]);
    id(r.budgetId);
    id(r.unit);
    integer(r.maximumUnits);
  } else if (r.kind === "semantic") {
    exact(r, ["kind", "assessorId", "policyRef", "maximumAgeMs"]);
    id(r.assessorId);
    id(r.policyRef);
    integer(r.maximumAgeMs);
    if (r.maximumAgeMs < 1 || r.maximumAgeMs > 3600000) invalid();
  } else invalid();
}
function validateDescriptor(e: AgentEffectDescriptorV1) {
  exact(e, [
    "effectId",
    "grantId",
    "reservationId",
    "dispatchAttemptId",
    "runId",
    "downstreamIdempotencyKey",
    "scopeDigest",
    "actionDigest",
    "inputDigest",
    "toolId",
    "operation",
    "destination",
    "charges",
  ]);
  [
    e.effectId,
    e.grantId,
    e.reservationId,
    e.dispatchAttemptId,
    e.runId,
    e.downstreamIdempotencyKey,
    e.toolId,
    e.operation,
  ].forEach(id);
  [e.scopeDigest, e.actionDigest, e.inputDigest].forEach(hash);
  if (e.destination !== null) id(e.destination);
  if (!Array.isArray(e.charges) || e.charges.length > 32) invalid();
  for (const c of e.charges) {
    exact(c, ["budgetId", "unit", "units"]);
    id(c.budgetId);
    id(c.unit);
    integer(c.units);
  }
}
function validateProfile(p: AgentExecutionProfileV1) {
  exact(p, [
    "adapterId",
    "runtimePlatform",
    "definitionRevisionId",
    "preActionCheckpoint",
    "cooperativeAbort",
    "gatewayOnlyEffects",
    "idempotentEffects",
    ...(p.supervisionId !== undefined ? ["supervisionId"] : []),
  ]);
  if (p.supervisionId !== undefined) id(p.supervisionId);
  id(p.adapterId);
  id(p.runtimePlatform);
  id(p.definitionRevisionId);
  for (const b of [
    p.preActionCheckpoint,
    p.cooperativeAbort,
    p.gatewayOnlyEffects,
    p.idempotentEffects,
  ])
    if (typeof b !== "boolean") invalid();
}
function hash(v: string) {
  if (typeof v !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(v)) invalid();
}
function integer(v: number) {
  if (!Number.isSafeInteger(v) || v < 0 || v >= Number.MAX_SAFE_INTEGER)
    invalid();
}
function id(v: string) {
  if (
    typeof v !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/u.test(v)
  )
    invalid();
}
function exact(v: object, keys: string[]) {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).sort().join(",") !== keys.sort().join(",")
  )
    invalid();
}
function clone<T>(v: T): T {
  return structuredClone(v);
}
function key(...v: string[]) {
  return JSON.stringify(v);
}
function digest(v: unknown) {
  return governanceDigestV1({
    domain: "agent-execution-v1",
    value: JSON.parse(JSON.stringify(v)) as JsonValue,
  });
}
function invalid(): never {
  throw new AgentPlatError(
    "VALIDATION_ERROR",
    "Agent execution input is invalid",
  );
}
function denied(): never {
  throw new AgentPlatError(
    "FORBIDDEN",
    "Agent execution admission or governance denied",
  );
}
function conflict(): never {
  throw new AgentPlatError(
    "CONFLICT",
    "Agent execution revision or outcome conflict",
  );
}
function missing(): never {
  throw new AgentPlatError(
    "NOT_FOUND",
    "Agent execution limit or effect not found",
  );
}

/** Atomically preflight every inherited account before mutating any totals. */
export function reserveScopedAgentBudgetsV1(
  accounts: Record<string, AgentBudgetTotalsV1>,
  charges: AgentEffectChargeV1[],
  caps: Array<{
    accountAgentId?: string;
    budgetId: string;
    unit: string;
    maximumUnits: number;
  }>,
  leaf: string,
): Array<{ agentId: string; charges: AgentEffectChargeV1[] }> | null {
  const ids = new Set(caps.map((c) => c.budgetId));
  if (
    ids.size !== charges.length ||
    new Set(charges.map((c) => c.budgetId)).size !== charges.length ||
    charges.some((c) => !ids.has(c.budgetId))
  )
    return null;
  const staged = clone(accounts),
    allocations = [];
  for (const agentId of new Set(caps.map((c) => c.accountAgentId ?? leaf))) {
    const selected = caps.filter((c) => (c.accountAgentId ?? leaf) === agentId),
      subset = charges.filter((c) =>
        selected.some((cap) => cap.budgetId === c.budgetId),
      );
    if (
      !Object.hasOwn(staged, agentId) ||
      !reserveAgentBudgetTotalsV1(staged[agentId], subset, selected)
    )
      return null;
    allocations.push({ agentId, charges: clone(subset) });
  }
  for (const [id, totals] of Object.entries(staged))
    Object.defineProperty(accounts, id, {
      value: totals,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  return allocations;
}
/** The caller holds every listed governance head lock; link writers use the same ordering. */
export function validateContinuityFenceChainV1(
  b: AgentExecutionBindingV1,
  head: (a: string) => AgentGovernanceHeadV1 | undefined,
  link: (id: string) => AgentContinuityRecordV1 | undefined,
  purpose: (
    a: string,
    id: string,
  ) => AgentPurposeExecutionProjectionV1 | undefined,
): boolean {
  let child = head(b.agentId);
  if (!child) return false;
  const visited = new Set<string>([b.agentId]),
    lineage = b.continuity ?? [];
  if (lineage.length > 8) return false;
  for (const f of lineage) {
    const origin = child.configuration.origin,
      parent = head(f.parentAgentId),
      r = link(f.continuityId);
    if (
      !origin ||
      origin.continuityId !== f.continuityId ||
      origin.parentAgentId !== f.parentAgentId ||
      visited.has(f.parentAgentId) ||
      !parent ||
      !r ||
      r.status !== "accepted" ||
      r.expiresAt <= new Date().toISOString() ||
      r.linkRevision !== f.linkRevision ||
      !sameContinuityV1([f], [continuityFenceV1(r)]) ||
      r.childAgentId !== child.agentId ||
      r.childConfigurationDigest !== child.configurationDigest ||
      parent.status !== "active" ||
      parent.revision !== f.parentRevision ||
      parent.configurationDigest !== f.parentConfigurationDigest ||
      parent.executionAdmission?.profileDigest !== f.parentProfileDigest
    )
      return false;
    if (
      r.parentWork &&
      !agentPurposeWorkFenceMatchesV1(
        purpose(parent.agentId, r.parentWork.missionId),
        {
          tenantId: b.tenantId,
          agentId: parent.agentId,
          governanceId: parent.governanceId,
          revision: parent.revision,
          authorityEpoch: parent.authorityEpoch,
          configurationDigest: parent.configurationDigest,
          definitionRevisionId: parent.configuration.definitionRevisionId,
          profileDigest: parent.executionAdmission.profileDigest,
          purposeControlDigest: parent.executionAdmission.purposeControlDigest,
          purposeWork: r.parentWork,
        },
      )
    )
      return false;
    visited.add(parent.agentId);
    child = parent;
  }
  return !child.configuration.origin;
}

/** Native Handoff state is checked in the same admission transaction as budgets. */
export function agentDelegationHandoffCurrentV1(
  b: AgentExecutionBindingV1,
  f: AgentContinuityFenceV1,
  h: RoomHandoff | undefined,
  runId?: string,
): boolean {
  const d = f.delegation;
  if (!d) return true;
  return (
    !!h &&
    h.tenantId === b.tenantId &&
    h.roomId === d.roomId &&
    h.handoffId === d.handoffId &&
    h.sourceRunId === d.sourceRunId &&
    h.sourceTaskId === d.sourceTaskId &&
    h.targetParticipantId === d.targetParticipantId &&
    h.targetAgentRevisionId === b.definitionRevisionId &&
    ["accepted", "running"].includes(h.status) &&
    (!runId || (h.status === "running" && h.targetRunId === runId))
  );
}
