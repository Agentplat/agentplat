import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { JsonObject } from "@agentplat/core";
import {
  type DurableStateStoreV1,
  type IdempotencyLedgerV1,
  type CausalReceiptV1,
  EpochFenceV1,
  idempotentOperationV1,
} from "./durable-runtime-state.js";

export const GOVERNED_COLLECTIVE_RUNTIME_FORMAT_V1 =
  "application/vnd.agentplat.governed-collective-runtime.v1+json" as const;

export type GovernedRuntimeStatusV1 =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "safe_stopped"
  | "failed";

export type GovernedRuntimePhaseV1 =
  | "observe"
  | "partition"
  | "topology"
  | "strategy"
  | "approval"
  | "inference"
  | "effect"
  | "forensics";

export interface GovernedCollectiveRuntimePolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly maximumCycles: number;
  readonly pauseOnDeniedApproval: boolean;
  readonly safeStopOnPhaseFailure: boolean;
}

export interface GovernedCollectiveRuntimeStateV1 {
  readonly format: typeof GOVERNED_COLLECTIVE_RUNTIME_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly missionId: string;
  readonly status: GovernedRuntimeStatusV1;
  readonly epoch: number;
  readonly revision: number;
  readonly cycle: number;
  readonly lastOperationId: string | null;
  readonly lastReceiptDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

export interface GovernedCollectiveRuntimeContextV1 {
  readonly missionId: string;
  readonly operationId: string;
  readonly cycle: number;
  readonly logicalTimeMs: number;
  readonly intent: JsonObject;
  readonly predecessorDigest: PlanningDigestV1 | null;
}

export interface GovernedCollectiveRuntimePhaseResultV1 {
  readonly status?: "applied" | "deferred" | "failed";
  readonly reasonCode?: string;
  readonly evidenceDigest?: PlanningDigestV1;
  readonly effectDigest?: PlanningDigestV1;
  readonly metadata?: JsonObject;
}

export type GovernedCollectiveRuntimePhaseV1Handler = (
  context: GovernedCollectiveRuntimeContextV1,
) => GovernedCollectiveRuntimePhaseResultV1 | Promise<GovernedCollectiveRuntimePhaseResultV1>;

export interface GovernedCollectiveRuntimeOptionsV1 {
  readonly missionId: string;
  readonly policy: GovernedCollectiveRuntimePolicyV1;
  readonly clock?: { now(): number };
  readonly phases: Partial<Record<GovernedRuntimePhaseV1, GovernedCollectiveRuntimePhaseV1Handler>>;
  /** Optional durable boundary. Omitted means the historical in-memory behavior. */
  readonly durableStore?: DurableStateStoreV1<GovernedCollectiveRuntimeStateV1>;
  readonly idempotencyLedger?: IdempotencyLedgerV1;
  readonly stateKey?: string;
}

export interface GovernedCollectiveRuntimeReceiptV1 {
  readonly missionId: string;
  readonly operationId: string;
  readonly cycle: number;
  readonly status: "applied" | "deferred" | "failed";
  readonly completedPhases: readonly GovernedRuntimePhaseV1[];
  readonly phaseDigests: Readonly<Record<string, PlanningDigestV1>>;
  readonly reasonCode: string;
  readonly predecessorDigest: PlanningDigestV1 | null;
  readonly receiptDigest: PlanningDigestV1;
}

export interface GovernedCollectiveRuntimePortV1 {
  state(): GovernedCollectiveRuntimeStateV1;
  run(input: { readonly intent: JsonObject; readonly operationId?: string }): Promise<GovernedCollectiveRuntimeReceiptV1>;
  pause(): GovernedCollectiveRuntimeStateV1;
  resume(): GovernedCollectiveRuntimeStateV1;
  safeStop(reasonCode?: string): GovernedCollectiveRuntimeStateV1;
}

const PHASES: readonly GovernedRuntimePhaseV1[] = ["observe", "partition", "topology", "strategy", "approval", "inference", "effect", "forensics"];
const digest = (value: unknown): PlanningDigestV1 => digestPlanningJsonV1("proposal-identity", value as PlanningJson);
const id = (value: string, field: string): string => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)) throw new TypeError(`invalid_${field}`);
  return value;
};

function stateDigest(state: Omit<GovernedCollectiveRuntimeStateV1, "stateDigest">): PlanningDigestV1 {
  return digest(state);
}

export function createGovernedCollectiveRuntimeV1(options: GovernedCollectiveRuntimeOptionsV1): GovernedCollectiveRuntimePortV1 {
  const missionId = id(options.missionId, "mission_id");
  if (options.policy.schemaVersion !== 1 || options.policy.maximumCycles < 1) throw new TypeError("invalid_governed_runtime_policy");
  const policy = Object.freeze({ ...options.policy });
  const clock = options.clock ?? { now: () => Date.now() };
  let current: GovernedCollectiveRuntimeStateV1 = makeState({ missionId, status: "idle", epoch: 0, revision: 0, cycle: 0, lastOperationId: null, lastReceiptDigest: null });
  let paused = false;
  const receipts = new Map<string, GovernedCollectiveRuntimeReceiptV1>();
  const durableStore = options.durableStore;
  const ledger = options.idempotencyLedger;
  const stateKey = options.stateKey ?? `governed-runtime:${missionId}`;
  const epochFence = new EpochFenceV1();
  let hydrated = false;
  let hydration: Promise<void> | undefined;
  function makeState(input: Omit<GovernedCollectiveRuntimeStateV1, "format" | "schemaVersion" | "stateDigest">): GovernedCollectiveRuntimeStateV1 {
    const body = { format: GOVERNED_COLLECTIVE_RUNTIME_FORMAT_V1, schemaVersion: 1 as const, ...input };
    return Object.freeze({ ...body, stateDigest: stateDigest(body) });
  }
  function setStatus(status: GovernedRuntimeStatusV1, reason?: string): GovernedCollectiveRuntimeStateV1 {
    current = makeState({ ...current, status, revision: current.revision + 1, epoch: status === "running" ? current.epoch + 1 : current.epoch });
    void reason;
    return current;
  }
  async function ensureHydrated(): Promise<void> {
    if (hydrated) return;
    if (hydration) return hydration;
    hydration = (async () => {
      const record = durableStore ? await durableStore.load(stateKey) : undefined;
      if (record) {
        epochFence.observe(stateKey, record.epoch);
        current = record.state;
      } else {
        epochFence.observe(stateKey, current.epoch);
        if (durableStore) await durableStore.save({ key: stateKey, state: current, expectedRevision: null, epoch: current.epoch });
      }
      hydrated = true;
    })();
    return hydration;
  }
  async function persist(): Promise<void> {
    if (!durableStore) return;
    epochFence.assert(stateKey, current.epoch);
    const record = await durableStore.load(stateKey);
    const expectedRevision = record?.revision ?? null;
    await durableStore.save({ key: stateKey, state: current, expectedRevision, epoch: current.epoch });
  }
  return {
    state: () => current,
    pause: () => { paused = true; return setStatus("paused"); },
    resume: () => { paused = false; return setStatus("idle"); },
    safeStop: (reasonCode = "operator_safe_stop") => setStatus("safe_stopped", reasonCode),
    async run(input) {
      await ensureHydrated();
      const operationId = id(input.operationId ?? `${missionId}:${current.revision + 1}`, "operation_id");
      const operationDigest = digest({ missionId, operationId, intent: input.intent });
      const prior = receipts.get(operationId);
      if (prior) return prior;
      if (ledger) {
        const durablePrior = await ledger.get(operationId);
        if (durablePrior) {
          if (durablePrior.operationDigest !== operationDigest) throw new Error(`idempotency conflict for "${operationId}"`);
          const restored = durablePrior.receipt.metadata?.runtimeReceipt;
          if (restored && typeof restored === "object" && !Array.isArray(restored)) {
            const runtimeReceipt = restored as unknown as GovernedCollectiveRuntimeReceiptV1;
            receipts.set(operationId, runtimeReceipt);
            return runtimeReceipt;
          }
          throw new Error(`idempotency receipt unavailable for "${operationId}"`);
        }
      }
      if (current.status === "safe_stopped" || current.status === "completed") throw new Error("governed_runtime_not_runnable");
      if (paused || current.status === "paused") {
        const receipt = Object.freeze({ missionId, operationId, cycle: current.cycle, status: "deferred" as const, completedPhases: [], phaseDigests: {}, reasonCode: "runtime_paused", predecessorDigest: current.lastReceiptDigest, receiptDigest: digest({ operationId, status: "deferred" }) });
        receipts.set(operationId, receipt); await persist(); return receipt;
      }
      if (current.cycle >= policy.maximumCycles) {
        setStatus("completed");
        const receipt = Object.freeze({ missionId, operationId, cycle: current.cycle, status: "deferred" as const, completedPhases: [], phaseDigests: {}, reasonCode: "cycle_budget_exhausted", predecessorDigest: current.lastReceiptDigest, receiptDigest: digest({ operationId, status: "deferred" }) });
        receipts.set(operationId, receipt); await persist(); return receipt;
      }
      const cycle = current.cycle + 1;
      setStatus("running");
      const contextBase = { missionId, operationId, cycle, logicalTimeMs: clock.now(), intent: Object.freeze({ ...input.intent }), predecessorDigest: current.lastReceiptDigest };
      const completed: GovernedRuntimePhaseV1[] = [];
      const phaseDigests: Record<string, PlanningDigestV1> = {};
      let status: "applied" | "deferred" | "failed" = "applied";
      let reasonCode = "completed";
      for (const phase of PHASES) {
        const handler = options.phases[phase];
        if (!handler) continue;
        try {
          const result = await handler(contextBase);
          if (result.evidenceDigest) phaseDigests[phase] = result.evidenceDigest;
          else if (result.effectDigest) phaseDigests[phase] = result.effectDigest;
          completed.push(phase);
          if (result.status === "deferred" || result.status === "failed") { status = result.status; reasonCode = result.reasonCode ?? `${phase}_${result.status}`; break; }
        } catch (error) {
          status = "failed"; reasonCode = `${phase}_failed`; break;
        }
      }
      const receiptBody = { missionId, operationId, cycle, status, completedPhases: completed, phaseDigests, reasonCode, predecessorDigest: current.lastReceiptDigest };
      const receipt = Object.freeze({ ...receiptBody, receiptDigest: digest(receiptBody) });
      receipts.set(operationId, receipt);
      current = makeState({ ...current, status: status === "failed" && policy.safeStopOnPhaseFailure ? "safe_stopped" : status === "deferred" ? "paused" : "idle", revision: current.revision + 1, cycle, lastOperationId: operationId, lastReceiptDigest: receipt.receiptDigest });
      await persist();
      if (ledger) {
        const causal: CausalReceiptV1 = {
          receiptId: receipt.receiptDigest,
          operationId,
          operationDigest,
          stateKey,
          stateRevision: current.revision,
          epoch: current.epoch,
          parentReceiptDigest: receipt.predecessorDigest,
          status: "applied",
          occurredAt: new Date(clock.now()).toISOString(),
          metadata: { runtimeReceiptDigest: receipt.receiptDigest, runtimeReceipt: receipt as unknown as JsonObject },
        };
        await idempotentOperationV1({ operationId, operationDigest, ledger, apply: async () => causal });
      }
      return receipt;
    },
  };
}
