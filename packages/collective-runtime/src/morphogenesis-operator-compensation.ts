import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import type { MorphogenesisCompiledStepV2 } from "./morphogenesis-operator-compiler.js";
import {
  validateMorphogenesisOperatorExecutionStateV2,
  type MorphogenesisOperatorExecutionStateV2,
  type MorphogenesisOperatorStepReceiptV2,
} from "./morphogenesis-operator-runtime.js";

export interface MorphogenesisOperatorCompensationReceiptV2 {
  readonly schemaVersion: 2;
  readonly operationId: AgentPlatID;
  readonly executionStateDigest: PlanningDigestV1;
  readonly stepId: AgentPlatID;
  readonly stepReceiptDigest: PlanningDigestV1;
  readonly compensation: Exclude<MorphogenesisCompiledStepV2["compensation"], "none">;
  readonly resultDigest: PlanningDigestV1;
  readonly appliedAtLogicalMs: number;
  readonly receiptDigest: PlanningDigestV1;
}

export type MorphogenesisOperatorCompensationResolutionV2 =
  | { readonly status: "applied"; readonly receipt: MorphogenesisOperatorCompensationReceiptV2 }
  | { readonly status: "pending"; readonly evidenceDigest: PlanningDigestV1 }
  | { readonly status: "indeterminate"; readonly evidenceDigest: PlanningDigestV1 };

export interface MorphogenesisOperatorCompensationBoundaryPortV2 {
  compensate(input: MorphogenesisOperatorCompensationBoundaryInputV2): Promise<MorphogenesisOperatorCompensationResolutionV2>;
  reconcileCompensation(input: MorphogenesisOperatorCompensationBoundaryInputV2): Promise<MorphogenesisOperatorCompensationResolutionV2>;
}

export interface MorphogenesisOperatorCompensationBoundaryInputV2 {
  readonly operationId: AgentPlatID;
  readonly execution: MorphogenesisOperatorExecutionStateV2;
  readonly step: MorphogenesisCompiledStepV2;
  readonly stepReceipt: MorphogenesisOperatorStepReceiptV2;
  readonly priorCompensationReceipts: readonly MorphogenesisOperatorCompensationReceiptV2[];
  readonly logicalTimeMs: number;
  readonly signal?: AbortSignal;
}

export interface MorphogenesisOperatorCompensationStateV2 {
  readonly schemaVersion: 2;
  readonly stateKey: AgentPlatID;
  readonly execution: MorphogenesisOperatorExecutionStateV2;
  readonly failureEvidenceDigest: PlanningDigestV1;
  readonly status: "prepared" | "compensating" | "completed" | "indeterminate";
  readonly nextCompensationIndex: number;
  readonly pendingStepId: AgentPlatID | null;
  readonly receipts: readonly MorphogenesisOperatorCompensationReceiptV2[];
  readonly indeterminateEvidenceDigest: PlanningDigestV1 | null;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

export interface MorphogenesisOperatorCompensationStoreV2 {
  load(stateKey: AgentPlatID): Promise<MorphogenesisOperatorCompensationStateV2 | null>;
  save(input: {
    readonly state: MorphogenesisOperatorCompensationStateV2;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean>;
}

export class InMemoryMorphogenesisOperatorCompensationStoreV2
  implements MorphogenesisOperatorCompensationStoreV2
{
  readonly #states = new Map<string, MorphogenesisOperatorCompensationStateV2>();
  async load(stateKey: AgentPlatID) {
    const state = this.#states.get(stateKey);
    return state ? immutable(state) : null;
  }
  async save(input: Parameters<MorphogenesisOperatorCompensationStoreV2["save"]>[0]) {
    const state = validateMorphogenesisOperatorCompensationStateV2(input.state);
    const current = this.#states.get(state.stateKey);
    if (input.expectedRevision === null) {
      if (current || input.expectedStateDigest !== null || state.revision !== 0) return false;
    } else if (!current || current.revision !== input.expectedRevision ||
        current.stateDigest !== input.expectedStateDigest ||
        state.revision !== current.revision + 1 ||
        state.predecessorStateDigest !== current.stateDigest ||
        state.logicalTimeHighWaterMs < current.logicalTimeHighWaterMs) return false;
    this.#states.set(state.stateKey, immutable(state));
    return true;
  }
}

export class MorphogenesisOperatorCompensationRuntimeV2 {
  constructor(readonly options: {
    readonly store: MorphogenesisOperatorCompensationStoreV2;
    readonly boundary: MorphogenesisOperatorCompensationBoundaryPortV2;
  }) {
    if (!options?.store || !options?.boundary)
      fail("Morphogenesis compensation runtime options are required");
  }

  async initialize(input: {
    readonly stateKey: AgentPlatID;
    readonly execution: MorphogenesisOperatorExecutionStateV2;
    readonly failureEvidenceDigest: PlanningDigestV1;
    readonly logicalTimeMs: number;
  }): Promise<MorphogenesisOperatorCompensationStateV2> {
    const execution = validateMorphogenesisOperatorExecutionStateV2(input.execution);
    if (execution.status === "completed")
      fail("completed Morphogenesis execution cannot be compensated as pre-commit failure");
    if (compensable(execution).length === 0)
      fail("Morphogenesis execution has no applied compensable step");
    const state = createState({
      stateKey: id(input.stateKey),
      execution,
      failureEvidenceDigest: sha(input.failureEvidenceDigest),
      status: "prepared",
      nextCompensationIndex: 0,
      pendingStepId: null,
      receipts: [],
      indeterminateEvidenceDigest: null,
      revision: 0,
      logicalTimeHighWaterMs: nonNegative(input.logicalTimeMs),
      predecessorStateDigest: null,
    });
    if (await this.options.store.save({ state, expectedRevision: null, expectedStateDigest: null }))
      return state;
    const retained = await this.options.store.load(state.stateKey);
    if (retained?.stateDigest === state.stateDigest) return retained;
    fail("Morphogenesis compensation initialization conflicts");
  }

  async advance(input: {
    readonly stateKey: AgentPlatID;
    readonly logicalTimeMs: number;
    readonly signal?: AbortSignal;
  }): Promise<MorphogenesisOperatorCompensationStateV2> {
    let current = await this.required(input.stateKey);
    if (current.status === "completed" || current.status === "indeterminate") return current;
    const queue = compensable(current.execution);
    const selected = queue[current.nextCompensationIndex];
    if (!selected) return this.#save(current, {
      status: "completed", pendingStepId: null, logicalTimeMs: input.logicalTimeMs,
    });
    const operationId = `${current.stateKey}:${selected.step.stepId}:compensate` as AgentPlatID;
    let resolution: MorphogenesisOperatorCompensationResolutionV2;
    if (current.status === "compensating") {
      if (current.pendingStepId !== selected.step.stepId)
        fail("Morphogenesis pending compensation step is inconsistent");
      resolution = await this.options.boundary.reconcileCompensation({
        operationId, execution: current.execution, step: selected.step,
        stepReceipt: selected.receipt, priorCompensationReceipts: current.receipts,
        logicalTimeMs: input.logicalTimeMs, signal: input.signal,
      });
    } else {
      current = await this.#save(current, {
        status: "compensating", pendingStepId: selected.step.stepId,
        logicalTimeMs: input.logicalTimeMs,
      });
      resolution = await this.options.boundary.compensate({
        operationId, execution: current.execution, step: selected.step,
        stepReceipt: selected.receipt, priorCompensationReceipts: current.receipts,
        logicalTimeMs: input.logicalTimeMs, signal: input.signal,
      });
    }
    if (resolution.status === "pending")
      return this.#save(current, {
        status: "prepared", pendingStepId: null, logicalTimeMs: input.logicalTimeMs,
      });
    if (resolution.status === "indeterminate")
      return this.#save(current, {
        status: "indeterminate", pendingStepId: selected.step.stepId,
        indeterminateEvidenceDigest: sha(resolution.evidenceDigest),
        logicalTimeMs: input.logicalTimeMs,
      });
    const receipt = validateReceipt(resolution.receipt, current.execution, selected.step, selected.receipt, operationId);
    const nextCompensationIndex = current.nextCompensationIndex + 1;
    current = await this.#save(current, {
      status: nextCompensationIndex === queue.length ? "completed" : "prepared",
      pendingStepId: null,
      nextCompensationIndex,
      receipts: [...current.receipts, receipt], logicalTimeMs: input.logicalTimeMs,
    });
    return current;
  }

  async required(stateKey: AgentPlatID) {
    const state = await this.options.store.load(stateKey);
    if (!state) fail("Morphogenesis compensation state is unavailable");
    return validateMorphogenesisOperatorCompensationStateV2(state);
  }

  async #save(
    current: MorphogenesisOperatorCompensationStateV2,
    changes: {
      readonly status: MorphogenesisOperatorCompensationStateV2["status"];
      readonly pendingStepId: AgentPlatID | null;
      readonly nextCompensationIndex?: number;
      readonly receipts?: readonly MorphogenesisOperatorCompensationReceiptV2[];
      readonly indeterminateEvidenceDigest?: PlanningDigestV1 | null;
      readonly logicalTimeMs: number;
    },
  ) {
    const { schemaVersion: _schema, stateDigest: _digest, ...body } = current;
    const next = createState({
      ...body,
      status: changes.status,
      pendingStepId: changes.pendingStepId,
      nextCompensationIndex: changes.nextCompensationIndex ?? current.nextCompensationIndex,
      receipts: changes.receipts ?? current.receipts,
      indeterminateEvidenceDigest: changes.indeterminateEvidenceDigest ?? current.indeterminateEvidenceDigest,
      revision: current.revision + 1,
      logicalTimeHighWaterMs: Math.max(current.logicalTimeHighWaterMs, changes.logicalTimeMs),
      predecessorStateDigest: current.stateDigest,
    });
    if (await this.options.store.save({ state: next, expectedRevision: current.revision, expectedStateDigest: current.stateDigest }))
      return next;
    const retained = await this.options.store.load(current.stateKey);
    if (retained?.stateDigest === next.stateDigest) return retained;
    fail("Morphogenesis compensation changed concurrently");
  }
}

export function createMorphogenesisOperatorCompensationReceiptV2(
  input: Omit<MorphogenesisOperatorCompensationReceiptV2, "schemaVersion" | "receiptDigest">,
): MorphogenesisOperatorCompensationReceiptV2 {
  if (!new Set(["terminate_unenrolled", "detach_successor", "restore_predecessor_before_commit"]).has(input.compensation))
    fail("Morphogenesis compensation kind is invalid");
  const body = Object.freeze({
    schemaVersion: 2 as const,
    operationId: id(input.operationId),
    executionStateDigest: sha(input.executionStateDigest),
    stepId: id(input.stepId),
    stepReceiptDigest: sha(input.stepReceiptDigest),
    compensation: input.compensation,
    resultDigest: sha(input.resultDigest),
    appliedAtLogicalMs: nonNegative(input.appliedAtLogicalMs),
  });
  return Object.freeze({ ...body, receiptDigest: digest("morphogenesis-operator-compensation-receipt-v2", body) });
}

export function validateMorphogenesisOperatorCompensationStateV2(
  input: unknown,
): MorphogenesisOperatorCompensationStateV2 {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("Morphogenesis compensation state is invalid");
  const value = input as MorphogenesisOperatorCompensationStateV2;
  const execution = validateMorphogenesisOperatorExecutionStateV2(value.execution);
  const { stateDigest, ...body } = value;
  if (value.schemaVersion !== 2 || stateDigest !== digest("morphogenesis-operator-compensation-state-v2", body))
    fail("Morphogenesis compensation state digest is invalid");
  id(value.stateKey);
  sha(value.failureEvidenceDigest);
  if (!new Set(["prepared", "compensating", "completed", "indeterminate"]).has(value.status) ||
      execution.status === "completed" || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
      !Number.isSafeInteger(value.logicalTimeHighWaterMs) || value.logicalTimeHighWaterMs < 0)
    fail("Morphogenesis compensation state fields are invalid");
  if ((value.predecessorStateDigest === null) !== (value.revision === 0))
    fail("Morphogenesis compensation predecessor is invalid");
  if (value.predecessorStateDigest !== null) sha(value.predecessorStateDigest);
  const queue = compensable(execution);
  if (!Number.isSafeInteger(value.nextCompensationIndex) || value.nextCompensationIndex < 0 ||
      value.nextCompensationIndex > queue.length || value.receipts.length !== value.nextCompensationIndex)
    fail("Morphogenesis compensation progress is invalid");
  value.receipts.forEach((receipt, index) => {
    const selected = queue[index]!;
    validateReceipt(receipt, execution, selected.step, selected.receipt,
      `${value.stateKey}:${selected.step.stepId}:compensate` as AgentPlatID);
  });
  const selected = queue[value.nextCompensationIndex];
  if (value.status === "compensating"
    ? !selected || value.pendingStepId !== selected.step.stepId
    : value.status === "indeterminate"
      ? !selected || value.pendingStepId !== selected.step.stepId || value.indeterminateEvidenceDigest === null
      : value.pendingStepId !== null || value.indeterminateEvidenceDigest !== null)
    fail("Morphogenesis compensation pending state is invalid");
  if (value.indeterminateEvidenceDigest !== null) sha(value.indeterminateEvidenceDigest);
  if ((value.status === "completed") !== (value.nextCompensationIndex === queue.length))
    fail("Morphogenesis compensation completion is invalid");
  if (value.receipts.some(({ appliedAtLogicalMs }) => appliedAtLogicalMs > value.logicalTimeHighWaterMs))
    fail("Morphogenesis compensation receipt time is invalid");
  return immutable(value);
}

function compensable(execution: MorphogenesisOperatorExecutionStateV2) {
  return [...execution.receipts].reverse().flatMap((receipt) => {
    const step = execution.plan.steps.find(({ stepId }) => stepId === receipt.stepId);
    if (!step) fail("Morphogenesis compensation step is unavailable");
    return step.compensation === "none" ? [] : [{ step, receipt }];
  });
}
function validateReceipt(receipt: MorphogenesisOperatorCompensationReceiptV2, execution: MorphogenesisOperatorExecutionStateV2, step: MorphogenesisCompiledStepV2, applied: MorphogenesisOperatorStepReceiptV2, operationId: AgentPlatID) {
  const result = createMorphogenesisOperatorCompensationReceiptV2({
    operationId: receipt.operationId, executionStateDigest: receipt.executionStateDigest,
    stepId: receipt.stepId, stepReceiptDigest: receipt.stepReceiptDigest,
    compensation: receipt.compensation, resultDigest: receipt.resultDigest,
    appliedAtLogicalMs: receipt.appliedAtLogicalMs,
  });
  if (JSON.stringify(receipt) !== JSON.stringify(result) || receipt.operationId !== operationId ||
      receipt.executionStateDigest !== execution.stateDigest || receipt.stepId !== step.stepId ||
      receipt.stepReceiptDigest !== applied.receiptDigest || receipt.compensation !== step.compensation)
    fail("Morphogenesis compensation receipt is invalid");
  return result;
}
function createState(input: Omit<MorphogenesisOperatorCompensationStateV2, "schemaVersion" | "stateDigest">) {
  const body = Object.freeze({ schemaVersion: 2 as const, ...input });
  return Object.freeze({ ...body, stateDigest: digest("morphogenesis-operator-compensation-state-v2", body) });
}
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+=-]{0,255}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown): AgentPlatID { if (typeof value !== "string" || !ID.test(value)) fail("Morphogenesis compensation ID is invalid"); return value as AgentPlatID; }
function sha(value: unknown): PlanningDigestV1 { if (typeof value !== "string" || !SHA.test(value)) fail("Morphogenesis compensation digest is invalid"); return value as PlanningDigestV1; }
function nonNegative(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0) fail("Morphogenesis compensation time is invalid"); return value as number; }
function digest(domain: string, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain as never, value as PlanningJson); }
function immutable<T>(value: T): T { return deepFreeze(structuredClone(value)); }
function deepFreeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item); } return value; }
function fail(message: string): never { throw new TypeError(message); }
