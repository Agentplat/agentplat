import {
  actionInputDigest, controlDigest, scopeDigest, boundedCanonicalControlJsonV1,
  type ActionBinding, type ActionScope, type ActionGrant,
  isActionScopeV1, type ActionAssessmentResolver, type ControlJson, type ControlJsonObject,
} from './tools.js';

/** Exact reviewed target. Facts and fences must be resolved by a trusted host. */
export interface ActionApprovalTargetV1 {
  readonly schemaVersion: 1;
  readonly scope: ActionScope;
  readonly binding: ActionBinding;
  readonly inputDigest: string;
  readonly preconditionsDigest: string;
  readonly authorityDigest: string;
  readonly policyDigest: string;
}
export interface ActionApprovalRecordV1 {
  readonly schemaVersion: 1;
  readonly approvalId: string;
  readonly tenantId: string;
  readonly requestedBy: string;
  readonly target: ActionApprovalTargetV1;
  readonly targetDigest: string;
  readonly revision: number;
  readonly observedAtMs: number;
  readonly closedAtMs: number | null;
  readonly boundEffectDigest: string | null;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  readonly status: 'pending' | 'approved' | 'rejected' | 'expired' | 'invalidated';
  readonly decidedBy: string | null;
  readonly decidedAtMs: number | null;
}
/** Implementations must scope every operation by tenant and apply CAS atomically. */
export interface ActionApprovalRepositoryV1 {
  create(record: ActionApprovalRecordV1): Promise<ActionApprovalRecordV1>;
  load(tenantId: string, approvalId: string): Promise<ActionApprovalRecordV1 | undefined>;
  compareAndSwap(expected: ActionApprovalRecordV1, next: ActionApprovalRecordV1): Promise<boolean>;
}
export interface ActionApprovalPrincipalV1 {
  readonly tenantId: string;
  readonly actorId: string;
  readonly kind: 'person' | 'agent';
}
export interface ActionApprovalAccessV1<Context> {
  /** Must authenticate context; user-supplied IDs are never sufficient. */
  resolve(context: Context): Promise<ActionApprovalPrincipalV1 | null>;
  canRequest(principal: ActionApprovalPrincipalV1, target: ActionApprovalTargetV1): Promise<boolean>;
  canDecide(principal: ActionApprovalPrincipalV1, record: ActionApprovalRecordV1): Promise<boolean>;
}
const digestPattern = /^sha256:[0-9a-f]{64}$/;
function time(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('invalid_approval_time');
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function immutable<T>(value: T): T {
  const copy = structuredClone(value);
  function freeze(v: unknown): void {
    if (v && typeof v === 'object') {
      for (const item of Object.values(v)) freeze(item);
      Object.freeze(v);
    }
  }
  freeze(copy);
  return copy;
}
export function actionApprovalTargetDigestV1(target: ActionApprovalTargetV1): string {
  // The gateway's scope and binding checks remain authoritative; this digest
  // includes ALL binding dependencies plus host facts, not merely a tool name.
  return controlDigest('grant', target as unknown as ControlJson);
}
export function createActionApprovalTargetV1(input: {
  readonly scope: ActionScope; readonly binding: ActionBinding;
  readonly input: ControlJsonObject; readonly preconditions: ControlJsonObject;
  readonly authority: ControlJsonObject; readonly policy: ControlJsonObject;
}): ActionApprovalTargetV1 {
  boundedCanonicalControlJsonV1(input.input, 65_536, 'action_not_permitted');
  for (const facts of [input.preconditions, input.authority, input.policy])
    boundedCanonicalControlJsonV1(facts, 65_536, 'action_not_permitted');
  const target = immutable({ schemaVersion: 1 as const, scope: input.scope,
    binding: input.binding, inputDigest: actionInputDigest(input.input),
    preconditionsDigest: controlDigest('grant', input.preconditions),
    authorityDigest: controlDigest('grant', input.authority),
    policyDigest: controlDigest('grant', input.policy) });
  assertTarget(target);
  return target;
}
function assertTarget(target: ActionApprovalTargetV1): void {
  if (target.schemaVersion !== 1 || !isActionScopeV1(target.scope) || !text(target.scope.tenantId) ||
      !text(target.scope.agentId) || target.binding.schemaVersion !== 1 ||
      ![target.binding.actionBindingId, target.binding.namespace, target.binding.toolId,
        target.binding.operation, target.binding.dispatcherId, target.binding.contextResolverId].every(text) ||
      ![target.binding.actionBindingVersion, target.binding.dispatcherVersion,
        target.binding.contextResolverVersion].every(x => Number.isSafeInteger(x) && x > 0) ||
      !digestPattern.test(target.binding.handlerDigest) ||
      !['local_only','downstream_atomic'].includes(target.binding.fencingMode) ||
      ![target.inputDigest, target.preconditionsDigest, target.authorityDigest,
        target.policyDigest].every(x => digestPattern.test(x)))
    throw new TypeError('invalid_approval_target');
  // Use the existing canonicalizer to reject non-JSON or unbounded records.
  boundedCanonicalControlJsonV1(target, 65_536, 'action_not_permitted');
}
export function validateActionApprovalRecordV1(record: ActionApprovalRecordV1): void {
  assertTarget(record.target);
  time(record.createdAtMs); time(record.expiresAtMs); time(record.observedAtMs);
  if (record.schemaVersion !== 1 || !text(record.approvalId) || !text(record.requestedBy) ||
      record.tenantId !== record.target.scope.tenantId ||
      record.targetDigest !== actionApprovalTargetDigestV1(record.target) ||
      !Number.isSafeInteger(record.revision) || record.revision < 1 ||
      record.observedAtMs < record.createdAtMs || record.expiresAtMs <= record.createdAtMs ||
      !['pending','approved','rejected','expired','invalidated'].includes(record.status) ||
      (record.boundEffectDigest !== null && !digestPattern.test(record.boundEffectDigest)))
    throw new TypeError('invalid_approval_record');
  if (['pending','approved'].includes(record.status) && record.observedAtMs >= record.expiresAtMs)
    throw new TypeError('invalid_approval_record');
  const decided = record.decidedAtMs !== null;
  if (decided) {
    time(record.decidedAtMs!);
    if (!text(record.decidedBy) || record.decidedBy === record.requestedBy ||
        record.decidedBy === record.target.scope.agentId || record.decidedAtMs! < record.createdAtMs ||
        record.decidedAtMs! >= record.expiresAtMs || record.decidedAtMs! > record.observedAtMs)
      throw new TypeError('invalid_approval_record');
  } else if (record.decidedBy !== null) throw new TypeError('invalid_approval_record');
  if (['approved','rejected'].includes(record.status) && !decided)
    throw new TypeError('invalid_approval_record');
  if (record.status === 'pending' && (decided || record.boundEffectDigest !== null))
    throw new TypeError('invalid_approval_record');
  if (['expired','invalidated'].includes(record.status)) {
    if (record.closedAtMs === null) throw new TypeError('invalid_approval_record');
    time(record.closedAtMs);
    if (record.closedAtMs < record.createdAtMs || record.closedAtMs > record.observedAtMs ||
        (record.status === 'expired' && record.closedAtMs < record.expiresAtMs))
      throw new TypeError('invalid_approval_record');
  } else if (record.closedAtMs !== null) throw new TypeError('invalid_approval_record');
  if (record.revision === 1 && (record.status !== 'pending' || record.observedAtMs !== record.createdAtMs))
    throw new TypeError('invalid_approval_record');
}
export class InMemoryActionApprovalRepositoryV1 implements ActionApprovalRepositoryV1 {
  private readonly records = new Map<string, ActionApprovalRecordV1>();
  private key(tenant: string, id: string): string { return JSON.stringify([tenant, id]); }
  async create(record: ActionApprovalRecordV1): Promise<ActionApprovalRecordV1> {
    validateActionApprovalRecordV1(record);
    if (record.status !== 'pending') throw new Error('approval_must_start_pending');
    const key = this.key(record.tenantId, record.approvalId), old = this.records.get(key);
    if (old) {
      // Return the original lifecycle state on an exact request retry.
      const initial = { ...old, revision: 1, status: 'pending', decidedBy: null, decidedAtMs: null, boundEffectDigest: null, observedAtMs: old.createdAtMs, closedAtMs: null };
      if (controlDigest('grant', initial as unknown as ControlJson) !==
          controlDigest('grant', record as unknown as ControlJson)) throw new Error('approval_identity_conflict');
      return immutable(old);
    }
    this.records.set(key, immutable(record)); return immutable(record);
  }
  /** Synchronous critical-section read for the in-memory admission composition. */
  readForAdmission(tenantId: string, approvalId: string): ActionApprovalRecordV1 | undefined {
    const record = this.records.get(this.key(tenantId, approvalId));
    return record ? immutable(record) : undefined;
  }
  async load(tenantId: string, approvalId: string): Promise<ActionApprovalRecordV1 | undefined> {
    const record = this.records.get(this.key(tenantId, approvalId));
    return record ? immutable(record) : undefined;
  }
  async compareAndSwap(expected: ActionApprovalRecordV1, next: ActionApprovalRecordV1): Promise<boolean> {
    validateActionApprovalTransitionV1(expected, next);
    const key = this.key(expected.tenantId, expected.approvalId), old = this.records.get(key);
    if (!old || controlDigest('grant', old as unknown as ControlJson) !==
      controlDigest('grant', expected as unknown as ControlJson)) return false;
    this.records.set(key, immutable(next)); return true;
  }
}
export function validateActionApprovalTransitionV1(old: ActionApprovalRecordV1, next: ActionApprovalRecordV1): void {
  validateActionApprovalRecordV1(old); validateActionApprovalRecordV1(next);
  const lifecycleAllowed =
    (old.status === 'pending' && ['pending','approved','rejected','expired','invalidated'].includes(next.status)) ||
    (old.status === 'approved' && ['approved','expired','invalidated'].includes(next.status));
  if (next.revision !== old.revision + 1 || next.approvalId !== old.approvalId ||
      next.tenantId !== old.tenantId || next.requestedBy !== old.requestedBy ||
      next.targetDigest !== old.targetDigest || next.createdAtMs !== old.createdAtMs ||
      next.expiresAtMs !== old.expiresAtMs || next.observedAtMs < old.observedAtMs || !lifecycleAllowed ||
      (next.closedAtMs !== null && next.closedAtMs < old.observedAtMs) ||
      (old.status === 'pending' && next.boundEffectDigest !== null) ||
      (old.boundEffectDigest !== null && next.boundEffectDigest !== old.boundEffectDigest) ||
      (old.status !== 'pending' && (old.decidedBy !== next.decidedBy || old.decidedAtMs !== next.decidedAtMs)))
    throw new Error('invalid_approval_transition');
}
/** Host clock only: persists a monotonic observation and irreversible expiry. */
export async function observeActionApprovalV1(repository: ActionApprovalRepositoryV1,
  tenantId: string, approvalId: string, nowMs: number): Promise<ActionApprovalRecordV1 | undefined> {
  time(nowMs);
  for (let attempt = 0; attempt < 8; attempt++) {
    const record = await repository.load(tenantId, approvalId);
    if (!record) return undefined;
    validateActionApprovalRecordV1(record);
    if (nowMs < record.observedAtMs) throw new Error('approval_time_rollback');
    if (!['pending','approved'].includes(record.status)) return record;
    const expired = nowMs >= record.expiresAtMs;
    if (!expired && nowMs === record.observedAtMs) return record;
    const next = { ...record, revision: record.revision + 1, observedAtMs: nowMs,
      status: expired ? 'expired' as const : record.status,
      closedAtMs: expired ? nowMs : null };
    if (await repository.compareAndSwap(record, next)) return immutable(next);
  }
  throw new Error('approval_conflict');
}
export class ActionApprovalServiceV1<Context> {
  constructor(readonly repository: ActionApprovalRepositoryV1,
    private readonly access: ActionApprovalAccessV1<Context>) {}
  async request(context: Context, input: {
    readonly approvalId: string; readonly target: ActionApprovalTargetV1;
    readonly createdAtMs: number; readonly expiresAtMs: number;
  }): Promise<ActionApprovalRecordV1> {
    // Snapshot before asynchronous host callbacks.
    const request = immutable(input);
    const principal = await this.access.resolve(context);
    if (!principal || principal.tenantId !== request.target.scope.tenantId ||
        !(await this.access.canRequest(principal, request.target))) throw new Error('approval_forbidden');
    return this.repository.create({ schemaVersion: 1, approvalId: request.approvalId,
      tenantId: principal.tenantId, requestedBy: principal.actorId, target: request.target,
      targetDigest: actionApprovalTargetDigestV1(request.target), revision: 1,
      createdAtMs: request.createdAtMs, expiresAtMs: request.expiresAtMs,
      status: 'pending', decidedBy: null, decidedAtMs: null, boundEffectDigest: null,
      observedAtMs: request.createdAtMs, closedAtMs: null });
  }
  async decide(context: Context, input: {
    readonly tenantId: string; readonly approvalId: string;
    readonly targetDigest: string; readonly decision: 'approved' | 'rejected'; readonly nowMs: number;
  }): Promise<ActionApprovalRecordV1> {
    const request = immutable(input); time(request.nowMs);
    if (!['approved','rejected'].includes(request.decision)) throw new Error('invalid_approval_decision');
    const principal = await this.access.resolve(context);
    const record = await this.repository.load(request.tenantId, request.approvalId);
    if (!principal || !record || principal.tenantId !== record.tenantId || principal.kind !== 'person' ||
        principal.actorId === record.requestedBy || principal.actorId === record.target.scope.agentId ||
        !(await this.access.canDecide(principal, record))) throw new Error('approval_forbidden');
    if (record.targetDigest !== request.targetDigest) throw new Error('approval_target_mismatch');
    if (request.nowMs < record.observedAtMs) throw new Error('approval_time_rollback');
    if (request.nowMs >= record.expiresAtMs) {
      await observeActionApprovalV1(this.repository, record.tenantId, record.approvalId, request.nowMs);
      throw new Error('approval_expired');
    }
    if (record.status !== 'pending') {
      if (record.status === request.decision && record.decidedBy === principal.actorId) return record;
      throw new Error('approval_not_pending');
    }
    const next = { ...record, revision: record.revision + 1, status: request.decision,
      decidedBy: principal.actorId, decidedAtMs: request.nowMs, observedAtMs: request.nowMs };
    if (!(await this.repository.compareAndSwap(record, next))) throw new Error('approval_conflict');
    return immutable(next);
  }
  async invalidate(context: Context, input: {
    readonly tenantId: string; readonly approvalId: string; readonly targetDigest: string; readonly nowMs: number;
  }): Promise<ActionApprovalRecordV1> {
    const request = immutable(input); time(request.nowMs);
    const principal = await this.access.resolve(context);
    const record = await this.repository.load(request.tenantId, request.approvalId);
    if (!principal || !record || principal.kind !== 'person' || principal.tenantId !== record.tenantId ||
        !(await this.access.canDecide(principal, record))) throw new Error('approval_forbidden');
    if (request.targetDigest !== record.targetDigest) throw new Error('approval_target_mismatch');
    if (request.nowMs < record.observedAtMs) throw new Error('approval_time_rollback');
    if (record.status === 'invalidated') return record;
    const next = { ...record, status: 'invalidated' as const, revision: record.revision + 1,
      observedAtMs: request.nowMs, closedAtMs: request.nowMs };
    if (!(await this.repository.compareAndSwap(record, next))) throw new Error('approval_conflict');
    return immutable(next);
  }
}

/** Narrows an existing assessment resolver; never replaces base authority/policy. */
export function createActionApprovalAssessmentResolverV1(options: {
  readonly base: ActionAssessmentResolver; readonly repository: ActionApprovalRepositoryV1;
  readonly approvalId: (grant: ActionGrant) => Promise<string | null>;
  /** Re-read facts, policies and revocation fences from trusted sources. */
  readonly currentTarget: (grant: ActionGrant, nowMs: number) => Promise<ActionApprovalTargetV1 | null>;
}): ActionAssessmentResolver {
  return Object.freeze({ assessorId: options.base.assessorId, assessorVersion: options.base.assessorVersion,
    async consumeCurrent(grant: ActionGrant, nowMs: number): Promise<boolean> {
      try {
        time(nowMs);
        if (!(await options.base.consumeCurrent(grant, nowMs))) return false;
        const id = await options.approvalId(grant);
        if (!id) return false;
        const record = await observeActionApprovalV1(options.repository, grant.scope.tenantId, id, nowMs);
        if (!record) return false;
        validateActionApprovalRecordV1(record);
        if (record.status !== 'approved' || nowMs < record.createdAtMs || nowMs >= record.expiresAtMs) return false;
        const target = record.target;
        if (scopeDigest(target.scope) !== grant.scopeDigest || target.inputDigest !== grant.inputDigest ||
            target.binding.actionBindingId !== grant.actionBindingId ||
            target.binding.actionBindingVersion !== grant.actionBindingVersion ||
            target.binding.handlerDigest !== grant.handlerDigest ||
            target.binding.namespace !== grant.namespace || target.binding.toolId !== grant.toolId ||
            target.binding.operation !== grant.operation || grant.assessmentTargetDigest !== record.targetDigest) return false;
        const current = await options.currentTarget(grant, nowMs);
        if (!current) return false;
        assertTarget(current);
        if (actionApprovalTargetDigestV1(current) !== record.targetDigest) {
          await options.repository.compareAndSwap(record, { ...record, status: 'invalidated',
            revision: record.revision + 1, closedAtMs: nowMs });
          return false;
        }
        const effectDigest = controlDigest('grant', { grantId: grant.grantId,
          actionDigest: grant.actionDigest, scopeDigest: grant.scopeDigest, idempotencyKey: grant.idempotencyKey });
        if (record.boundEffectDigest !== null) return record.boundEffectDigest === effectDigest;
        const next = { ...record, revision: record.revision + 1, boundEffectDigest: effectDigest };
        if (await options.repository.compareAndSwap(record, next)) return true;
        const latest = await options.repository.load(record.tenantId, record.approvalId);
        return latest?.status === 'approved' && latest.boundEffectDigest === effectDigest;
      } catch { return false; }
    },
  });
}
