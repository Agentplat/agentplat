import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import {
  COORDINATION_CONTROL_GUARANTEE_SCHEMA_VERSION_V1,
  COORDINATION_CONTROL_GUARANTEE_STATE_FORMAT_V1,
  type CoordinationControlGuaranteeAnchorV1,
  type CoordinationControlGuaranteeHeadV1,
  type CoordinationControlGuaranteeOutboxRecordV1,
  type CoordinationControlGuaranteePortV1,
  type CoordinationControlGuaranteeProposalV1,
  type CoordinationControlGuaranteeRuntimeOptionsV1,
  type CoordinationControlGuaranteeStoreV1,
  type CoordinationControlGuaranteeStateV1,
  type CoordinationControlGuaranteeV1,
  type CoordinationControlGuaranteeAnchorPortV1,
  type CoordinationControlTargetV1,
} from "./coordination-control-guarantees-contracts.js";
import {
  coordinationControlGuaranteeStateDigestV1,
  executionReceiptMatchesProposal,
  createCoordinationControlGuaranteeProposalV1,
  validateCoordinationControlGuaranteePolicyV1,
  validateCoordinationControlGuaranteeStateV1,
  validateCoordinationControlGuaranteeExecutionReceiptV1,
  validateCoordinationControlGuaranteeV1,
  validateCoordinationControlTargetV1,
} from "./coordination-control-guarantees-validation.js";

interface LoadedCoordinationControlGuaranteeStateV1 {
  readonly state: CoordinationControlGuaranteeStateV1;
  readonly anchor: CoordinationControlGuaranteeAnchorV1 | null;
  readonly expectedRevision: number | null;
  readonly expectedStateDigest: PlanningDigestV1 | null;
}

/**
 * A fail-closed contract gate. It persists accepted control and planning
 * records, calculates their intersection, and emits a durable dispatch gate.
 */
export class CoordinationControlGuaranteeRuntimeV1
  implements CoordinationControlGuaranteePortV1
{
  readonly #options: CoordinationControlGuaranteeRuntimeOptionsV1;

  constructor(options: CoordinationControlGuaranteeRuntimeOptionsV1) {
    if (!options || !options.store || !options.monotonicAnchor || !options.verification)
      throw new TypeError("control guarantee runtime ports are required");
    if (!options.stateKey || !options.anchorKey || !options.scope)
      throw new TypeError("control guarantee runtime identity is required");
    if (
      typeof options.store.load !== "function" || typeof options.store.save !== "function" ||
      typeof options.monotonicAnchor.load !== "function" || typeof options.monotonicAnchor.save !== "function" ||
      typeof options.verification.verifyGuarantee !== "function" || typeof options.verification.verifyTarget !== "function"
    ) throw new TypeError("control guarantee runtime ports are invalid");
    this.#options = { ...options, policy: validateCoordinationControlGuaranteePolicyV1(options.policy) };
  }

  async publishGuarantee(input: {
    readonly logicalTimeMs: number;
    readonly guarantee: CoordinationControlGuaranteeV1;
  }): Promise<CoordinationControlGuaranteeProposalV1> {
    const guarantee = validateCoordinationControlGuaranteeV1(input.guarantee);
    const verified = await this.#verifyGuarantee(guarantee);
    return this.#commit(input.logicalTimeMs, (state) => {
      const sourceError = guaranteeSourceError(state.guaranteeHead, guarantee.controlId, guarantee.sourceRevision, guarantee.sourceRecordDigest, guarantee.guaranteeDigest);
      const accepted = verified && sameScope(guarantee.scope, this.#options.scope) && !sourceError;
      return {
      guarantee: accepted ? guarantee : null,
      rejectReason: accepted
        ? undefined
        : sourceError ??
          (verified
            ? "guarantee_scope_mismatch"
            : "guarantee_verification_failed"),
      preserveGuarantee: !accepted,
      target: state.latestTarget,
      };
    });
  }

  async publishTarget(input: {
    readonly logicalTimeMs: number;
    readonly target: CoordinationControlTargetV1;
  }): Promise<CoordinationControlGuaranteeProposalV1> {
    const target = validateCoordinationControlTargetV1(input.target);
    const verified = await this.#verifyTarget(target);
    return this.#commit(input.logicalTimeMs, (state) => {
      const sourceError = guaranteeSourceError(state.targetHead, target.planningId, target.planningRevision, target.planningRecordDigest, target.targetDigest);
      const accepted = verified && sameScope(target.scope, this.#options.scope) && !sourceError;
      return {
      guarantee: state.latestGuarantee,
      target: accepted ? target : null,
      rejectReason: accepted
        ? undefined
        : sourceError ??
          (verified ? "target_scope_mismatch" : "target_verification_failed"),
      preserveTarget: !accepted,
      };
    });
  }

  async negotiate(input: {
    readonly logicalTimeMs: number;
  }): Promise<CoordinationControlGuaranteeProposalV1> {
    return this.#commit(input.logicalTimeMs, (state) => ({
      guarantee: state.latestGuarantee,
      target: state.latestTarget,
    }));
  }

  /**
   * Delivers an anchored persisted gate signal at least once. Dispatch adapters
   * must durably deduplicate by proposalId.
   */
  async dispatchPending(logicalTimeMs: number): Promise<CoordinationControlGuaranteeProposalV1 | null> {
    logicalTime(logicalTimeMs);
    if (!this.#options.dispatch) return null;
    for (let attempt = 0; attempt < this.#options.policy.maximumCommitAttempts; attempt += 1) {
      const loaded = await this.#loadAnchored();
      if (!loaded) throw new Error("control guarantee monotonic state is unavailable");
      if (logicalTimeMs < loaded.state.logicalTimeHighWaterMs) throw new TypeError("control guarantee logical time rollback");
      const current = loaded.state.outbox.find((entry) => entry.status === "pending");
      if (!current) return null;
      if (current.proposal.expiresAtLogicalMs <= logicalTimeMs) {
        const outbox = loaded.state.outbox.map((entry) => entry.proposal.proposalId === current.proposal.proposalId ? { ...entry, status: "expired" as const, receipt: null } : entry);
        const next = this.#advance(loaded.state, { logicalTimeHighWaterMs: logicalTimeMs, outbox });
        if (await this.#save(next, loaded)) { await this.#advanceAnchor(next, loaded.anchor); return null; }
        continue;
      }
      const dispatched = await this.#options.dispatch.dispatch({ proposal: current.proposal });
      if (dispatched.status !== "delivered") return null;
      const receipt = validateCoordinationControlGuaranteeExecutionReceiptV1(dispatched.receipt);
      if (!executionReceiptMatchesProposal(receipt, current.proposal) || receipt.deliveredAtLogicalMs > logicalTimeMs)
        throw new TypeError("control guarantee delivery receipt binding is invalid");
      const outbox = loaded.state.outbox.map((entry) => entry.proposal.proposalId === current.proposal.proposalId ? { ...entry, status: "delivered" as const, receipt } : entry);
      const next = this.#advance(loaded.state, { logicalTimeHighWaterMs: logicalTimeMs, outbox });
      if (await this.#save(next, loaded)) { await this.#advanceAnchor(next, loaded.anchor); return current.proposal; }
    }
    throw new Error("control guarantee delivery contention exceeded limit");
  }

  async #commit(
    logicalTimeMs: number,
    update: (state: CoordinationControlGuaranteeStateV1) => {
      readonly guarantee: CoordinationControlGuaranteeV1 | null;
      readonly target: CoordinationControlTargetV1 | null;
      readonly rejectReason?: string;
      readonly preserveGuarantee?: boolean;
      readonly preserveTarget?: boolean;
    },
  ): Promise<CoordinationControlGuaranteeProposalV1> {
    logicalTime(logicalTimeMs);
    for (let attempt = 0; attempt < this.#options.policy.maximumCommitAttempts; attempt += 1) {
      const loaded = await this.#loadAnchored();
      if (!loaded) return this.#blocked(logicalTimeMs, "monotonic_state_unavailable", null, null);
      if (logicalTimeMs < loaded.state.logicalTimeHighWaterMs) throw new TypeError("control guarantee logical time rollback");
      const change = update(loaded.state);
      const guarantee = change.preserveGuarantee ? loaded.state.latestGuarantee : change.guarantee;
      const target = change.preserveTarget ? loaded.state.latestTarget : change.target;
      const proposal = this.#evaluate(logicalTimeMs, guarantee, target, change.rejectReason, loaded.state.revision + 1);
      const pending = loaded.state.outbox.filter((entry) => entry.status === "pending");
      if (pending.length >= this.#options.policy.maximumOutboxRecords)
        throw new Error("control guarantee pending outbox capacity exhausted");
      const settledCapacity = this.#options.policy.maximumOutboxRecords - pending.length - 1;
      const settled = settledCapacity > 0 ? loaded.state.outbox.filter((entry) => entry.status !== "pending").slice(-settledCapacity) : [];
      const next = this.#advance(loaded.state, {
        logicalTimeHighWaterMs: logicalTimeMs,
        guaranteeHead: guarantee ? guaranteeHead(guarantee.controlId, guarantee.sourceRevision, guarantee.sourceRecordDigest, guarantee.guaranteeDigest) : null,
        targetHead: target ? guaranteeHead(target.planningId, target.planningRevision, target.planningRecordDigest, target.targetDigest) : null,
        latestGuarantee: guarantee,
        latestTarget: target,
        lastProposal: proposal,
        outbox: [...settled, ...pending, { proposal, status: "pending" as const, receipt: null }],
      });
      if (await this.#save(next, loaded)) { await this.#advanceAnchor(next, loaded.anchor); return proposal; }
    }
    throw new Error("control guarantee state contention exceeded limit");
  }

  #evaluate(
    now: number,
    guarantee: CoordinationControlGuaranteeV1 | null,
    target: CoordinationControlTargetV1 | null,
    rejection: string | undefined,
    sequence: number,
  ): CoordinationControlGuaranteeProposalV1 {
    if (rejection) return this.#blocked(now, rejection, guarantee, target, sequence);
    if (!guarantee) return this.#blocked(now, "missing_verified_guarantee", null, target, sequence);
    if (!target) return this.#blocked(now, "missing_verified_target", guarantee, null, sequence);
    if (!fresh(now, guarantee.observedAtLogicalMs, guarantee.validUntilLogicalMs, this.#options.policy.maximumGuaranteeAgeMs)) return this.#blocked(now, "stale_guarantee", guarantee, target, sequence);
    if (!fresh(now, target.issuedAtLogicalMs, target.validUntilLogicalMs, this.#options.policy.maximumTargetAgeMs)) return this.#blocked(now, "stale_target", guarantee, target, sequence);
    const reasons: string[] = [];
    if (guarantee.alignmentBps < target.minimumAlignmentBps) reasons.push("alignment_target_unmet");
    if (guarantee.coherenceBps < target.minimumCoherenceBps) reasons.push("coherence_target_unmet");
    if (guarantee.agilityBps < target.minimumAgilityBps) reasons.push("agility_target_unmet");
    if (guarantee.confidenceBps < target.minimumConfidenceBps) reasons.push("confidence_target_unmet");
    if (guarantee.riskBps > target.maximumRiskBps) reasons.push("risk_bound_exceeded");
    if (guarantee.uncertaintyBps > target.maximumUncertaintyBps) reasons.push("uncertainty_bound_exceeded");
    if (!containsAll(guarantee.contextAssumptionDigests, target.requiredContextAssumptionDigests)) reasons.push("context_assumption_unsupported");
    if (!containsAll(guarantee.threatAssumptionDigests, target.requiredThreatAssumptionDigests)) reasons.push("threat_assumption_unsupported");
    if (!containsAll(guarantee.supportedCheckpointDigests, target.requiredCheckpointDigests)) reasons.push("checkpoint_unsupported");
    if (!containsAll(guarantee.supportedActions, target.requiredActions)) reasons.push("action_unsupported");
    const window = Math.min(guarantee.coherenceHorizonMs, target.plannedHorizonMs, guarantee.validUntilLogicalMs - now, target.validUntilLogicalMs - now);
    if (window < 1) reasons.push("effective_window_exhausted");
    if (reasons.length) return this.#replan(now, reasons, guarantee, target, sequence);
    return createCoordinationControlGuaranteeProposalV1({
      schemaVersion: COORDINATION_CONTROL_GUARANTEE_SCHEMA_VERSION_V1,
      proposalId: `${this.#options.stateKey}.guarantee.${now}.${sequence}`,
      scope: this.#options.scope, status: "admitted", disposition: "allow", action: "continue", effectivePlanningWindowMs: window,
      guaranteeDigest: guarantee.guaranteeDigest, targetDigest: target.targetDigest, reasonCodes: ["control_target_admitted"],
      evaluatedAtLogicalMs: now, expiresAtLogicalMs: expiry(now, Math.min(window, this.#options.policy.maximumProposalTtlMs)),
    });
  }

  #replan(now: number, reasons: readonly string[], guarantee: CoordinationControlGuaranteeV1 | null, target: CoordinationControlTargetV1 | null, sequence: number): CoordinationControlGuaranteeProposalV1 {
    return this.#proposal(now, "replan_required", "deny", "request_replanning", reasons, guarantee, target, sequence);
  }
  #blocked(now: number, reason: string, guarantee: CoordinationControlGuaranteeV1 | null, target: CoordinationControlTargetV1 | null, sequence = 0): CoordinationControlGuaranteeProposalV1 {
    return this.#proposal(now, "blocked", "deny", "pause_dispatch", [reason], guarantee, target, sequence);
  }
  #proposal(now: number, status: "replan_required" | "blocked", disposition: "deny", action: "request_replanning" | "pause_dispatch", reasons: readonly string[], guarantee: CoordinationControlGuaranteeV1 | null, target: CoordinationControlTargetV1 | null, sequence: number): CoordinationControlGuaranteeProposalV1 {
    return createCoordinationControlGuaranteeProposalV1({
      schemaVersion: COORDINATION_CONTROL_GUARANTEE_SCHEMA_VERSION_V1,
      proposalId: `${this.#options.stateKey}.guarantee.${now}.${sequence}`,
      scope: this.#options.scope, status, disposition, action, effectivePlanningWindowMs: 0,
      guaranteeDigest: guarantee?.guaranteeDigest ?? null, targetDigest: target?.targetDigest ?? null,
      reasonCodes: [...new Set(reasons)].sort(), evaluatedAtLogicalMs: now,
      expiresAtLogicalMs: expiry(now, this.#options.policy.maximumProposalTtlMs),
    });
  }

  async #verifyGuarantee(guarantee: CoordinationControlGuaranteeV1): Promise<boolean> { try { return (await this.#options.verification.verifyGuarantee({ guarantee })) === true; } catch { return false; } }
  async #verifyTarget(target: CoordinationControlTargetV1): Promise<boolean> { try { return (await this.#options.verification.verifyTarget({ target })) === true; } catch { return false; } }
  async #load(): Promise<LoadedCoordinationControlGuaranteeStateV1 | null> {
    const [stored, anchor] = await Promise.all([this.#options.store.load(this.#options.stateKey), this.#options.monotonicAnchor.load(this.#options.anchorKey)]);
    if (!stored) return anchor ? null : { state: this.#initial(), anchor: null, expectedRevision: null, expectedStateDigest: null };
    const state = validateCoordinationControlGuaranteeStateV1(stored);
    if (state.stateKey !== this.#options.stateKey || !sameScope(state.scope, this.#options.scope) || state.policyDigest !== this.#options.policy.policyDigest) return null;
    return { state, anchor, expectedRevision: state.revision, expectedStateDigest: state.stateDigest };
  }
  /**
   * A state may be one committed revision ahead of its anchor only after an
   * interrupted state-then-anchor commit. Repair that exact successor before
   * use; any other divergence can be rollback or an unprovable skipped state.
   */
  async #loadAnchored(): Promise<LoadedCoordinationControlGuaranteeStateV1 | null> {
    for (let attempt = 0; attempt < this.#options.policy.maximumCommitAttempts; attempt += 1) {
      const loaded = await this.#load();
      if (!loaded) return null;
      if (loaded.expectedRevision === null)
        return loaded.anchor === null ? loaded : null;
      const anchor = loaded.anchor;
      if (loaded.expectedStateDigest === null) return null;
      if (!anchor) {
        if (
          loaded.state.revision !== 1 ||
          loaded.state.predecessorStateDigest !== this.#initial().stateDigest
        )
          return null;
        if (await this.#options.monotonicAnchor.save({
          anchorKey: this.#options.anchorKey,
          anchor: this.#anchor(loaded.state),
          expectedRevision: null,
          expectedStateDigest: null,
        }))
          continue;
        continue;
      }
      if (
        anchor.stateRevision === loaded.state.revision &&
        anchor.stateDigest === loaded.state.stateDigest &&
        anchor.logicalTimeHighWaterMs === loaded.state.logicalTimeHighWaterMs
      )
        return loaded;
      if (
        anchor.stateRevision > loaded.state.revision ||
        anchor.logicalTimeHighWaterMs > loaded.state.logicalTimeHighWaterMs ||
        anchor.stateRevision === loaded.state.revision ||
        anchor.stateRevision + 1 !== loaded.state.revision ||
        loaded.state.predecessorStateDigest !== anchor.stateDigest
      )
        return null;
      if (await this.#options.monotonicAnchor.save({
        anchorKey: this.#options.anchorKey,
        anchor: this.#anchor(loaded.state),
        expectedRevision: anchor.stateRevision,
        expectedStateDigest: anchor.stateDigest,
      }))
        continue;
    }
    return null;
  }
  async #save(state: CoordinationControlGuaranteeStateV1, loaded: Pick<LoadedCoordinationControlGuaranteeStateV1, "expectedRevision" | "expectedStateDigest">): Promise<boolean> { return this.#options.store.save({ state: validateCoordinationControlGuaranteeStateV1(state), expectedRevision: loaded.expectedRevision, expectedStateDigest: loaded.expectedStateDigest }); }
  async #advanceAnchor(state: CoordinationControlGuaranteeStateV1, prior: CoordinationControlGuaranteeAnchorV1 | null): Promise<void> {
    if (await this.#options.monotonicAnchor.save({ anchorKey: this.#options.anchorKey, anchor: this.#anchor(state), expectedRevision: prior?.stateRevision ?? null, expectedStateDigest: prior?.stateDigest ?? null })) return;
    const current = await this.#options.monotonicAnchor.load(this.#options.anchorKey);
    if (current && (current.stateRevision > state.revision || (current.stateRevision === state.revision && current.stateDigest === state.stateDigest && current.logicalTimeHighWaterMs === state.logicalTimeHighWaterMs))) return;
    throw new Error("control guarantee monotonic anchor update failed");
  }
  #anchor(state: CoordinationControlGuaranteeStateV1): CoordinationControlGuaranteeAnchorV1 { return Object.freeze({ stateRevision: state.revision, stateDigest: state.stateDigest, logicalTimeHighWaterMs: state.logicalTimeHighWaterMs }); }
  #initial(): CoordinationControlGuaranteeStateV1 {
    const body = { format: COORDINATION_CONTROL_GUARANTEE_STATE_FORMAT_V1, schemaVersion: 1 as const, stateKey: this.#options.stateKey, scope: this.#options.scope, policyDigest: this.#options.policy.policyDigest, revision: 0, logicalTimeHighWaterMs: 0, guaranteeHead: null, targetHead: null, latestGuarantee: null, latestTarget: null, lastProposal: null, outbox: [] as readonly CoordinationControlGuaranteeOutboxRecordV1[], predecessorStateDigest: null };
    return Object.freeze({ ...body, stateDigest: coordinationControlGuaranteeStateDigestV1(body) });
  }
  #advance(state: CoordinationControlGuaranteeStateV1, changes: Partial<Omit<CoordinationControlGuaranteeStateV1, "format" | "schemaVersion" | "stateKey" | "scope" | "policyDigest" | "revision" | "predecessorStateDigest" | "stateDigest">>): CoordinationControlGuaranteeStateV1 {
    const body = { ...state, ...changes, revision: state.revision + 1, predecessorStateDigest: state.stateDigest };
    const { stateDigest: _ignored, ...unsigned } = body;
    return Object.freeze({ ...unsigned, stateDigest: coordinationControlGuaranteeStateDigestV1(unsigned) });
  }
}

export class InMemoryCoordinationControlGuaranteeStoreV1
  implements CoordinationControlGuaranteeStoreV1
{
  readonly #states = new Map<string, CoordinationControlGuaranteeStateV1>();
  async load(stateKey: string): Promise<CoordinationControlGuaranteeStateV1 | null> { const state = this.#states.get(stateKey); return state ? validateCoordinationControlGuaranteeStateV1(structuredClone(state)) : null; }
  async save(input: { readonly state: CoordinationControlGuaranteeStateV1; readonly expectedRevision: number | null; readonly expectedStateDigest: PlanningDigestV1 | null }): Promise<boolean> { const state = validateCoordinationControlGuaranteeStateV1(input.state); const current = this.#states.get(state.stateKey) ?? null; if ((current?.revision ?? null) !== input.expectedRevision || (current?.stateDigest ?? null) !== input.expectedStateDigest) return false; this.#states.set(state.stateKey, structuredClone(state)); return true; }
}

export class InMemoryCoordinationControlGuaranteeAnchorV1
  implements CoordinationControlGuaranteeAnchorPortV1
{
  readonly #anchors = new Map<string, CoordinationControlGuaranteeAnchorV1>();
  async load(anchorKey: string): Promise<CoordinationControlGuaranteeAnchorV1 | null> { return this.#anchors.get(anchorKey) ?? null; }
  async save(input: { readonly anchorKey: string; readonly anchor: CoordinationControlGuaranteeAnchorV1; readonly expectedRevision: number | null; readonly expectedStateDigest: PlanningDigestV1 | null }): Promise<boolean> { const current = this.#anchors.get(input.anchorKey) ?? null; if ((current?.stateRevision ?? null) !== input.expectedRevision || (current?.stateDigest ?? null) !== input.expectedStateDigest || input.anchor.stateRevision < (current?.stateRevision ?? -1) || input.anchor.logicalTimeHighWaterMs < (current?.logicalTimeHighWaterMs ?? -1)) return false; this.#anchors.set(input.anchorKey, Object.freeze({ ...input.anchor })); return true; }
}

function guaranteeHead(sourceId: string, sourceRevision: number, sourceRecordDigest: PlanningDigestV1, recordDigest: PlanningDigestV1): CoordinationControlGuaranteeHeadV1 { return Object.freeze({ sourceId, sourceRevision, sourceRecordDigest, recordDigest }); }
function guaranteeSourceError(head: CoordinationControlGuaranteeHeadV1 | null, sourceId: string, revision: number, sourceRecordDigest: PlanningDigestV1, recordDigest: PlanningDigestV1): string | null {
  if (!head) return null;
  if (head.sourceId !== sourceId) return "source_identity_changed";
  if (revision < head.sourceRevision) return "source_rollback";
  if (revision === head.sourceRevision && (head.sourceRecordDigest !== sourceRecordDigest || head.recordDigest !== recordDigest)) return "source_equivocation";
  return null;
}
function fresh(now: number, observed: number, until: number, maximumAge: number): boolean { return now >= observed && now < until && now - observed <= maximumAge; }
function containsAll<T>(available: readonly T[], required: readonly T[]): boolean { const values = new Set(available); return required.every((item) => values.has(item)); }
function sameScope(left: CoordinationControlGuaranteeV1["scope"], right: CoordinationControlGuaranteeV1["scope"]): boolean { return left.tenantId === right.tenantId && left.coordinationId === right.coordinationId && left.missionIntentId === right.missionIntentId && left.teamId === right.teamId && left.workItemId === right.workItemId; }
function logicalTime(value: number): void { if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("control guarantee logical time must be non-negative"); }
function expiry(now: number, ttl: number): number { if (now > Number.MAX_SAFE_INTEGER - ttl) throw new TypeError("control guarantee logical time cannot advance"); return now + ttl; }
