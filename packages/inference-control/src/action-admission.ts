import { validateActionApprovalRecordV1, type ActionApprovalRecordV1, type InMemoryActionApprovalRepositoryV1 } from './action-approvals.js';
import type { ActionDispatcher, ControlJson } from './tools.js';
import { actionInputDigest, controlDigest, boundedCanonicalControlJsonV1 } from './tools.js';

export interface ActionRevocationFenceV1 {
  readonly kind: 'agent' | 'connector' | 'organization';
  readonly id: string;
  readonly epoch: number;
  readonly active: boolean;
}
export interface ActionBudgetAccountV1 {
  readonly accountId: string;
  readonly unit: string;
  readonly periodStartMs: number;
  readonly periodEndMs: number;
  readonly maximumUnits: number;
  readonly revision: number;
}
export interface ActionBudgetChargeV1 {
  readonly accountId: string;
  readonly units: number;
  readonly accountRevision: number;
  readonly unit: string;
}
export interface ActionApprovalAdmissionGuardV1 {
  readonly approvalId: string;
  readonly targetDigest: string;
  readonly boundEffectDigest: string;
  readonly nowMs: number;
}
export interface ActionAdmissionRequestV1 {
  readonly tenantId: string;
  readonly effectId: string;
  readonly gatewayId: string;
  readonly scopeDigest: string;
  readonly grantId: string;
  readonly dispatchAttemptId: string;
  readonly idempotencyKey: string;
  readonly actionDigest: string;
  readonly inputDigest: string;
  readonly fences: readonly ActionRevocationFenceV1[];
  readonly charges: readonly ActionBudgetChargeV1[];
  readonly nowMs: number;
  readonly approval: { readonly approvalId: string; readonly targetDigest: string } | null;
}
export interface ActionEffectReceiptV1 {
  readonly request: ActionAdmissionRequestV1;
  /** Includes all bound facts except observation time, which may advance on retry. */
  readonly requestDigest: string;
  readonly status: 'indeterminate' | 'succeeded' | 'not_applied';
  readonly proofRef: string | null;
}
export interface ActionAdmissionStateV1 {
  readonly tenantId: string;
  readonly highWaterMs: number;
  readonly fences: readonly ActionRevocationFenceV1[];
  readonly budgets: readonly { readonly account: ActionBudgetAccountV1; readonly usedUnits: number }[];
  readonly effects: readonly ActionEffectReceiptV1[];
}
/** The same tenant serialization boundary must cover configuration and reservations. */
export interface ActionAdmissionStoreV1 {
  transaction<T>(tenantId: string, operation: (state: ActionAdmissionStateV1) => {
    readonly state: ActionAdmissionStateV1; readonly result: T;
  }, approval?: ActionApprovalAdmissionGuardV1): Promise<T>;
}
/** Called under the same storage lock/transaction as effect admission. */
export function assertActionApprovalAdmissionV1(record: ActionApprovalRecordV1 | undefined,
  tenantId: string, guard: ActionApprovalAdmissionGuardV1): void {
  if (!record) throw new Error('action_approval_missing');
  validateActionApprovalRecordV1(record);
  if (record.tenantId !== tenantId || record.approvalId !== guard.approvalId ||
      record.status !== 'approved' || record.targetDigest !== guard.targetDigest ||
      record.boundEffectDigest !== guard.boundEffectDigest || guard.nowMs < record.observedAtMs ||
      guard.nowMs >= record.expiresAtMs) throw new Error('action_approval_stale');
}
function integer(value: number, positive = false): boolean {
  return Number.isSafeInteger(value) && value >= (positive ? 1 : 0);
}
function nonempty(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function fenceKey(fence: ActionRevocationFenceV1): string { return JSON.stringify([fence.kind, fence.id]); }
export function actionAdmissionRequestDigestV1(request: ActionAdmissionRequestV1): string {
  const { nowMs: _, ...bound } = request;
  return controlDigest('grant', bound as unknown as ControlJson);
}
function validateFence(fence: ActionRevocationFenceV1): void {
  if (!['agent','connector','organization'].includes(fence.kind) || !nonempty(fence.id) ||
      !integer(fence.epoch, true) || typeof fence.active !== 'boolean') throw new Error('invalid_action_fence');
}
function validateAccount(account: ActionBudgetAccountV1): void {
  if (!nonempty(account.accountId) || !nonempty(account.unit) || !integer(account.revision, true) ||
      !integer(account.maximumUnits) || !integer(account.periodStartMs) || !integer(account.periodEndMs) ||
      account.periodEndMs <= account.periodStartMs) throw new Error('invalid_action_budget');
}
function validateRequest(request: ActionAdmissionRequestV1): void {
  if (![request.tenantId, request.effectId, request.gatewayId, request.grantId, request.dispatchAttemptId, request.idempotencyKey].every(nonempty) ||
      ![request.actionDigest, request.inputDigest, request.scopeDigest].every(x => /^sha256:[0-9a-f]{64}$/.test(x)) ||
      (request.approval !== null && (!request.approval || !nonempty(request.approval.approvalId) ||
        !/^sha256:[0-9a-f]{64}$/.test(request.approval.targetDigest))) ||
      !integer(request.nowMs) || !Array.isArray(request.fences) || request.fences.length !== 3 ||
      new Set(request.fences.map(x => x.kind)).size !== 3 ||
      !Array.isArray(request.charges) || new Set(request.charges.map(x => x.accountId)).size !== request.charges.length)
    throw new Error('invalid_action_admission');
  request.fences.forEach(validateFence);
  for (const charge of request.charges)
    if (!nonempty(charge.accountId) || !nonempty(charge.unit) || !integer(charge.units) || !integer(charge.accountRevision, true))
      throw new Error('invalid_action_charge');
  boundedCanonicalControlJsonV1(request, 65_536, 'action_not_permitted');
}
export function validateActionAdmissionStateV1(state: ActionAdmissionStateV1): void {
  if (!nonempty(state.tenantId) || !integer(state.highWaterMs)) throw new Error('invalid_admission_state');
  const keys = state.fences.map(fenceKey);
  if (new Set(keys).size !== keys.length) throw new Error('invalid_admission_state');
  state.fences.forEach(validateFence);
  if (new Set(state.budgets.map(x => x.account.accountId)).size !== state.budgets.length ||
      new Set(state.effects.map(x => x.request.effectId)).size !== state.effects.length)
    throw new Error('invalid_admission_state');
  for (const budget of state.budgets) { validateAccount(budget.account); if (!integer(budget.usedUnits)) throw new Error('invalid_admission_state'); }
  // Reconstruct accounting, including unknown effects, to reject forged refunds.
  const totals = new Map<string, number>();
  for (const effect of state.effects) {
    validateRequest(effect.request);
    if (effect.request.tenantId !== state.tenantId || effect.request.nowMs > state.highWaterMs ||
        effect.requestDigest !== actionAdmissionRequestDigestV1(effect.request) ||
        !['indeterminate','succeeded','not_applied'].includes(effect.status) ||
        (effect.status === 'indeterminate' ? effect.proofRef !== null : !nonempty(effect.proofRef)))
      throw new Error('invalid_admission_state');
    for (const charge of effect.request.charges) {
      if (!state.budgets.some(x => x.account.accountId === charge.accountId)) throw new Error('invalid_admission_state');
      if (effect.status !== 'not_applied') totals.set(charge.accountId, (totals.get(charge.accountId) ?? 0) + charge.units);
    }
  }
  for (const budget of state.budgets)
    if (budget.usedUnits !== (totals.get(budget.account.accountId) ?? 0)) throw new Error('invalid_admission_state');
}
/** Ephemeral only. Serializes asynchronous callers using one queue per tenant. */
export class InMemoryActionAdmissionStoreV1 implements ActionAdmissionStoreV1 {
  constructor(private readonly approvals?: InMemoryActionApprovalRepositoryV1) {}
  private readonly states = new Map<string, ActionAdmissionStateV1>();
  private readonly queues = new Map<string, Promise<unknown>>();
  transaction<T>(tenantId: string, operation: (state: ActionAdmissionStateV1) => { state: ActionAdmissionStateV1; result: T }, approval?: ActionApprovalAdmissionGuardV1): Promise<T> {
    const task = (this.queues.get(tenantId) ?? Promise.resolve()).catch(() => {}).then(() => {
      const current = this.states.get(tenantId) ?? { tenantId, highWaterMs: 0, fences: [], budgets: [], effects: [] };
      if (approval) assertActionApprovalAdmissionV1(this.approvals?.readForAdmission(tenantId, approval.approvalId), tenantId, approval);
      const next = operation(structuredClone(current));
      if (next.state.tenantId !== tenantId) throw new Error('admission_scope_mismatch');
      validateActionAdmissionStateV1(next.state);
      this.states.set(tenantId, structuredClone(next.state));
      return structuredClone(next.result);
    });
    this.queues.set(tenantId, task); return task;
  }
}
export interface ActionEffectProofV1 {
  readonly requestDigest: string;
  readonly outcome: 'succeeded' | 'not_applied';
  readonly proofRef: string;
}
export class ActionAdmissionServiceV1 {
  constructor(readonly store: ActionAdmissionStoreV1) {}
  /** Trusted administrative host only; never expose directly to agent input. */
  async configureFence(tenantId: string, fence: ActionRevocationFenceV1): Promise<void> {
    const candidate = structuredClone(fence); validateFence(candidate);
    await this.store.transaction(tenantId, state => {
      const previous = state.fences.find(x => fenceKey(x) === fenceKey(candidate));
      if (previous && candidate.epoch <= previous.epoch) throw new Error('fence_epoch_must_advance');
      return { state: { ...state, fences: [...state.fences.filter(x => fenceKey(x) !== fenceKey(candidate)), candidate] }, result: undefined };
    });
  }
  /** Account IDs include scope and immutable period; renewal must create a new ID. */
  async configureBudget(tenantId: string, account: ActionBudgetAccountV1): Promise<void> {
    const candidate = structuredClone(account); validateAccount(candidate);
    await this.store.transaction(tenantId, state => {
      const old = state.budgets.find(x => x.account.accountId === candidate.accountId);
      if (old && (candidate.revision <= old.account.revision || candidate.unit !== old.account.unit ||
          candidate.periodStartMs !== old.account.periodStartMs || candidate.periodEndMs !== old.account.periodEndMs))
        throw new Error('budget_revision_or_period_conflict');
      return { state: { ...state, budgets: [...state.budgets.filter(x => x.account.accountId !== candidate.accountId),
        { account: candidate, usedUnits: old?.usedUnits ?? 0 }] }, result: undefined };
    });
  }
  async reserve(request: ActionAdmissionRequestV1): Promise<{ readonly status: 'admitted' | 'replayed'; readonly receipt: ActionEffectReceiptV1 }> {
    const candidate = structuredClone(request); validateRequest(candidate);
    const guard = candidate.approval ? { ...candidate.approval, nowMs: candidate.nowMs,
      boundEffectDigest: controlDigest('grant', { grantId: candidate.grantId, actionDigest: candidate.actionDigest,
        scopeDigest: candidate.scopeDigest, idempotencyKey: candidate.idempotencyKey }) } : undefined;
    return this.store.transaction<{ status: 'admitted' | 'replayed'; receipt: ActionEffectReceiptV1 }>(candidate.tenantId, state => {
      if (candidate.nowMs < state.highWaterMs) throw new Error('admission_time_rollback');
      const requestDigest = actionAdmissionRequestDigestV1(candidate);
      const old = state.effects.find(x => x.request.effectId === candidate.effectId);
      if (old) {
        if (old.requestDigest !== requestDigest) throw new Error('effect_identity_conflict');
        return { state: { ...state, highWaterMs: candidate.nowMs }, result: { status: 'replayed' as const, receipt: old } };
      }
      if (state.effects.some(x =>
        (x.request.gatewayId === candidate.gatewayId &&
         (x.request.grantId === candidate.grantId || x.request.dispatchAttemptId === candidate.dispatchAttemptId)) ||
        (x.request.scopeDigest === candidate.scopeDigest && x.request.idempotencyKey === candidate.idempotencyKey)))
        throw new Error('effect_dispatch_identity_conflict');
      for (const expected of candidate.fences) {
        const actual = state.fences.find(x => fenceKey(x) === fenceKey(expected));
        if (!actual || !actual.active || !expected.active || actual.epoch !== expected.epoch) throw new Error('action_fence_stale');
      }
      const budgets = state.budgets.map(x => ({ ...x }));
      for (const charge of candidate.charges) {
        const budget = budgets.find(x => x.account.accountId === charge.accountId);
        if (!budget || budget.account.unit !== charge.unit || budget.account.revision !== charge.accountRevision || candidate.nowMs < budget.account.periodStartMs ||
            candidate.nowMs >= budget.account.periodEndMs || !integer(budget.usedUnits + charge.units) ||
            budget.usedUnits + charge.units > budget.account.maximumUnits) throw new Error('action_budget_exhausted_or_stale');
        budget.usedUnits += charge.units;
      }
      const receipt: ActionEffectReceiptV1 = { request: candidate, requestDigest, status: 'indeterminate', proofRef: null };
      return { state: { ...state, highWaterMs: candidate.nowMs, budgets, effects: [...state.effects, receipt] },
        result: { status: 'admitted' as const, receipt } };
    }, guard);
  }
  /** Resolver must prove not_applied means the admitted attempt cannot later apply. */
  async reconcile(tenantId: string, effectId: string,
    resolve: (receipt: ActionEffectReceiptV1) => Promise<ActionEffectProofV1 | null>): Promise<ActionEffectReceiptV1> {
    const initial = await this.store.transaction(tenantId, state => {
      const receipt = state.effects.find(x => x.request.effectId === effectId);
      if (!receipt) throw new Error('unknown_action_effect');
      return { state, result: receipt };
    });
    const proof = await resolve(structuredClone(initial));
    if (!proof || proof.requestDigest !== initial.requestDigest || !nonempty(proof.proofRef) ||
        !['succeeded','not_applied'].includes(proof.outcome)) throw new Error('action_reconciliation_unverified');
    return this.store.transaction(tenantId, state => {
      const current = state.effects.find(x => x.request.effectId === effectId)!;
      if (current.status !== 'indeterminate') {
        if (current.status !== proof.outcome) throw new Error('action_reconciliation_conflict');
        return { state, result: current };
      }
      const next = { ...current, status: proof.outcome, proofRef: proof.proofRef };
      const budgets = state.budgets.map(x => ({ ...x }));
      if (proof.outcome === 'not_applied') for (const charge of current.request.charges) {
        const budget = budgets.find(x => x.account.accountId === charge.accountId)!;
        budget.usedUnits -= charge.units;
      }
      return { state: { ...state, budgets, effects: state.effects.map(x => x.request.effectId === effectId ? next : x) }, result: next };
    });
  }
}
/** Applies admission after the existing gateway checks, without issuing grants. */
export function createActionAdmissionDispatcherV1(options: {
  readonly downstream: ActionDispatcher;
  readonly service: ActionAdmissionServiceV1;
  /** Trusted quote must include all applicable resource accounts and fences. */
  readonly quote: (input: Parameters<ActionDispatcher['dispatch']>[0]) => Promise<ActionAdmissionRequestV1>;
}): ActionDispatcher {
  const downstream = options.downstream, dispatch = downstream.dispatch.bind(downstream);
  return Object.freeze({ dispatcherId: downstream.dispatcherId, dispatcherVersion: downstream.dispatcherVersion,
    fencingMode: downstream.fencingMode,
    async dispatch(input: Parameters<ActionDispatcher['dispatch']>[0]) {
      const request = await options.quote(input);
      if (request.tenantId !== input.context.tenant.tenantId || request.grantId !== input.permit.grantId ||
          request.dispatchAttemptId !== input.permit.dispatchAttemptId || request.idempotencyKey !== input.permit.idempotencyKey ||
          request.gatewayId !== input.permit.gatewayId || request.scopeDigest !== input.permit.scopeDigest ||
          request.actionDigest !== input.permit.actionDigest || request.inputDigest !== actionInputDigest(input.input))
        throw new Error('action_quote_mismatch');
      const admission = await options.service.reserve(request);
      if (admission.status === 'replayed') throw new Error('action_effect_already_admitted');
      // Unknown outcomes retain all accounting. A trusted receipt resolver settles later.
      return dispatch(input);
    },
  });
}
