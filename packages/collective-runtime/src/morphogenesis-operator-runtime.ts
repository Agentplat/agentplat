import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";

import type {
  MorphogenesisCompiledOperatorPlanV2,
  MorphogenesisCompiledStepV2,
} from "./morphogenesis-operator-compiler.js";

export interface MorphogenesisOperatorStepReceiptV2 {
  readonly schemaVersion: 2;
  readonly operationId: AgentPlatID;
  readonly planDigest: PlanningDigestV1;
  readonly stepId: AgentPlatID;
  readonly stepDigest: PlanningDigestV1;
  readonly boundary: MorphogenesisCompiledStepV2["boundary"];
  readonly resultDigest: PlanningDigestV1;
  readonly appliedAtLogicalMs: number;
  readonly receiptDigest: PlanningDigestV1;
}

export type MorphogenesisOperatorStepResolutionV2 =
  | {
      readonly status: "applied";
      readonly receipt: MorphogenesisOperatorStepReceiptV2;
    }
  | { readonly status: "not_applied" }
  | {
      readonly status: "pending";
      readonly evidenceDigest: PlanningDigestV1;
    }
  | {
      readonly status: "indeterminate";
      readonly evidenceDigest: PlanningDigestV1;
    };

export interface MorphogenesisOperatorBoundaryPortV2 {
  execute(input: {
    readonly operationId: AgentPlatID;
    readonly plan: MorphogenesisCompiledOperatorPlanV2;
    readonly step: MorphogenesisCompiledStepV2;
    readonly proposalDigest: PlanningDigestV1;
    readonly authorizationDigest: PlanningDigestV1;
    readonly authorityFenceDigest: PlanningDigestV1;
    readonly priorReceipts: readonly MorphogenesisOperatorStepReceiptV2[];
    readonly logicalTimeMs: number;
    readonly signal?: AbortSignal;
  }): Promise<MorphogenesisOperatorStepResolutionV2>;
  reconcile(input: {
    readonly operationId: AgentPlatID;
    readonly plan: MorphogenesisCompiledOperatorPlanV2;
    readonly step: MorphogenesisCompiledStepV2;
    readonly proposalDigest: PlanningDigestV1;
    readonly authorizationDigest: PlanningDigestV1;
    readonly authorityFenceDigest: PlanningDigestV1;
    readonly priorReceipts: readonly MorphogenesisOperatorStepReceiptV2[];
    readonly logicalTimeMs: number;
    readonly signal?: AbortSignal;
  }): Promise<MorphogenesisOperatorStepResolutionV2>;
}

export interface MorphogenesisOperatorExecutionEventV2 {
  readonly schemaVersion: 2;
  readonly sequence: number;
  readonly type:
    | "initialized"
    | "step_prepared"
    | "step_applied"
    | "step_pending"
    | "step_indeterminate"
    | "completed";
  readonly stepId: AgentPlatID | null;
  readonly evidenceDigest: PlanningDigestV1;
  readonly logicalTimeMs: number;
  readonly previousEventDigest: PlanningDigestV1 | null;
  readonly eventDigest: PlanningDigestV1;
}

export interface MorphogenesisOperatorExecutionStateV2 {
  readonly schemaVersion: 2;
  readonly stateKey: AgentPlatID;
  readonly plan: MorphogenesisCompiledOperatorPlanV2;
  readonly scopeDigest: PlanningDigestV1;
  readonly proposalDigest: PlanningDigestV1;
  readonly decisionDigest: PlanningDigestV1;
  readonly authorizationDigest: PlanningDigestV1;
  readonly authorityFenceDigest: PlanningDigestV1;
  readonly expectedMorphologyEpoch: number;
  readonly status:
    | "prepared"
    | "executing"
    | "completed"
    | "indeterminate";
  readonly nextStepIndex: number;
  readonly pendingStepId: AgentPlatID | null;
  readonly receipts: readonly MorphogenesisOperatorStepReceiptV2[];
  readonly indeterminateEvidenceDigest: PlanningDigestV1 | null;
  readonly events: readonly MorphogenesisOperatorExecutionEventV2[];
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly predecessorStateDigest: PlanningDigestV1 | null;
  readonly stateDigest: PlanningDigestV1;
}

export interface MorphogenesisOperatorExecutionStoreV2 {
  load(stateKey: AgentPlatID): Promise<MorphogenesisOperatorExecutionStateV2 | null>;
  save(input: {
    readonly state: MorphogenesisOperatorExecutionStateV2;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }): Promise<boolean>;
}

export class InMemoryMorphogenesisOperatorExecutionStoreV2
  implements MorphogenesisOperatorExecutionStoreV2
{
  readonly #states = new Map<string, MorphogenesisOperatorExecutionStateV2>();
  async load(stateKey: AgentPlatID) {
    const state = this.#states.get(stateKey);
    return state ? immutable(state) : null;
  }
  async save(input: {
    readonly state: MorphogenesisOperatorExecutionStateV2;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: PlanningDigestV1 | null;
  }) {
    const state = validateMorphogenesisOperatorExecutionStateV2(input.state);
    const current = this.#states.get(state.stateKey);
    if (input.expectedRevision === null) {
      if (current || input.expectedStateDigest !== null || state.revision !== 0)
        return false;
    } else if (
      !current ||
      current.revision !== input.expectedRevision ||
      current.stateDigest !== input.expectedStateDigest ||
      state.revision !== current.revision + 1 ||
      state.predecessorStateDigest !== current.stateDigest ||
      state.logicalTimeHighWaterMs < current.logicalTimeHighWaterMs
    ) return false;
    this.#states.set(state.stateKey, immutable(state));
    return true;
  }
}

export class MorphogenesisOperatorExecutionRuntimeV2 {
  constructor(
    readonly options: {
      readonly store: MorphogenesisOperatorExecutionStoreV2;
      readonly boundaries: MorphogenesisOperatorBoundaryPortV2;
      readonly maximumCommitAttempts?: number;
    },
  ) {
    if (!options.store || !options.boundaries)
      fail("Morphogenesis operator runtime options are required");
  }

  async initialize(input: {
    readonly stateKey: AgentPlatID;
    readonly plan: MorphogenesisCompiledOperatorPlanV2;
    readonly scopeDigest: PlanningDigestV1;
    readonly proposalDigest: PlanningDigestV1;
    readonly decisionDigest: PlanningDigestV1;
    readonly authorizationDigest: PlanningDigestV1;
    readonly authorityFenceDigest: PlanningDigestV1;
    readonly expectedMorphologyEpoch: number;
    readonly logicalTimeMs: number;
  }) {
    assertPlan(input.plan);
    const event = createEvent({
      sequence: 1,
      type: "initialized",
      stepId: null,
      evidenceDigest: input.plan.planDigest,
      logicalTimeMs: input.logicalTimeMs,
      previousEventDigest: null,
    });
    const state = createState({
      stateKey: input.stateKey,
      plan: input.plan,
      scopeDigest: sha(input.scopeDigest, "operator execution scope digest"),
      proposalDigest: input.proposalDigest,
      decisionDigest: input.decisionDigest,
      authorizationDigest: input.authorizationDigest,
      authorityFenceDigest: input.authorityFenceDigest,
      expectedMorphologyEpoch: input.expectedMorphologyEpoch,
      status: "prepared",
      nextStepIndex: 0,
      pendingStepId: null,
      receipts: [],
      indeterminateEvidenceDigest: null,
      events: [event],
      revision: 0,
      logicalTimeHighWaterMs: input.logicalTimeMs,
      predecessorStateDigest: null,
    });
    if (await this.options.store.save({ state, expectedRevision: null, expectedStateDigest: null }))
      return state;
    const retained = await this.options.store.load(state.stateKey);
    if (retained?.stateDigest === state.stateDigest) return retained;
    fail("Morphogenesis operator execution initialization conflicts");
  }

  async advance(input: {
    readonly stateKey: AgentPlatID;
    readonly logicalTimeMs: number;
    readonly signal?: AbortSignal;
  }): Promise<MorphogenesisOperatorExecutionStateV2> {
    let current = await this.required(input.stateKey);
    if (current.status === "completed" || current.status === "indeterminate")
      return current;
    const step = current.plan.steps[current.nextStepIndex];
    if (!step) return this.#complete(current, input.logicalTimeMs);
    const operationId = `${current.stateKey}:${step.stepId}` as AgentPlatID;
    let resolution: MorphogenesisOperatorStepResolutionV2;
    if (current.status === "executing") {
      if (current.pendingStepId !== step.stepId)
        fail("Morphogenesis operator pending step is inconsistent");
      resolution = await this.options.boundaries.reconcile({
        operationId,
        plan: current.plan,
        step,
        proposalDigest: current.proposalDigest,
        authorizationDigest: current.authorizationDigest,
        authorityFenceDigest: current.authorityFenceDigest,
        priorReceipts: current.receipts,
        logicalTimeMs: input.logicalTimeMs,
        signal: input.signal,
      });
    } else {
      current = await this.#saveNext(current, {
        status: "executing",
        pendingStepId: step.stepId,
        logicalTimeMs: input.logicalTimeMs,
        event: {
          type: "step_prepared",
          stepId: step.stepId,
          evidenceDigest: step.stepDigest,
        },
      });
      resolution = await this.options.boundaries.execute({
        operationId,
        plan: current.plan,
        step,
        proposalDigest: current.proposalDigest,
        authorizationDigest: current.authorizationDigest,
        authorityFenceDigest: current.authorityFenceDigest,
        priorReceipts: current.receipts,
        logicalTimeMs: input.logicalTimeMs,
        signal: input.signal,
      });
    }
    if (resolution.status === "not_applied") {
      resolution = await this.options.boundaries.execute({
        operationId,
        plan: current.plan,
        step,
        proposalDigest: current.proposalDigest,
        authorizationDigest: current.authorizationDigest,
        authorityFenceDigest: current.authorityFenceDigest,
        priorReceipts: current.receipts,
        logicalTimeMs: input.logicalTimeMs,
        signal: input.signal,
      });
    }
    if (resolution.status === "pending")
      return this.#saveNext(current, {
        status: "prepared",
        pendingStepId: null,
        logicalTimeMs: input.logicalTimeMs,
        event: {
          type: "step_pending",
          stepId: step.stepId,
          evidenceDigest: sha(
            resolution.evidenceDigest,
            "pending operator evidence digest",
          ),
        },
      });
    if (resolution.status === "indeterminate")
      return this.#saveNext(current, {
        status: "indeterminate",
        pendingStepId: step.stepId,
        indeterminateEvidenceDigest: sha(
          resolution.evidenceDigest,
          "indeterminate operator evidence digest",
        ),
        logicalTimeMs: input.logicalTimeMs,
        event: {
          type: "step_indeterminate",
          stepId: step.stepId,
          evidenceDigest: resolution.evidenceDigest,
        },
      });
    if (resolution.status !== "applied")
      fail("Morphogenesis operator boundary did not resolve the step");
    const receipt = validateStepReceipt(resolution.receipt, current.plan, step, operationId);
    current = await this.#saveNext(current, {
      status: "prepared",
      nextStepIndex: current.nextStepIndex + 1,
      pendingStepId: null,
      receipts: [...current.receipts, receipt],
      logicalTimeMs: input.logicalTimeMs,
      event: {
        type: "step_applied",
        stepId: step.stepId,
        evidenceDigest: receipt.receiptDigest,
      },
    });
    return current.nextStepIndex === current.plan.steps.length
      ? this.#complete(current, input.logicalTimeMs)
      : current;
  }

  async required(stateKey: AgentPlatID) {
    const state = await this.options.store.load(stateKey);
    if (!state) fail("Morphogenesis operator execution state is unavailable");
    return validateMorphogenesisOperatorExecutionStateV2(state);
  }

  async #complete(current: MorphogenesisOperatorExecutionStateV2, logicalTimeMs: number) {
    if (current.receipts.length !== current.plan.steps.length)
      fail("Morphogenesis operator plan cannot complete with missing receipts");
    return this.#saveNext(current, {
      status: "completed",
      pendingStepId: null,
      logicalTimeMs,
      event: {
        type: "completed",
        stepId: null,
        evidenceDigest: current.plan.planDigest,
      },
    });
  }

  async #saveNext(
    current: MorphogenesisOperatorExecutionStateV2,
    changes: {
      readonly status: MorphogenesisOperatorExecutionStateV2["status"];
      readonly nextStepIndex?: number;
      readonly pendingStepId: AgentPlatID | null;
      readonly receipts?: readonly MorphogenesisOperatorStepReceiptV2[];
      readonly indeterminateEvidenceDigest?: PlanningDigestV1 | null;
      readonly logicalTimeMs: number;
      readonly event: Omit<MorphogenesisOperatorExecutionEventV2, "schemaVersion" | "sequence" | "logicalTimeMs" | "previousEventDigest" | "eventDigest">;
    },
  ) {
    const event = createEvent({
      sequence: current.events.length + 1,
      ...changes.event,
      logicalTimeMs: changes.logicalTimeMs,
      previousEventDigest: current.events.at(-1)!.eventDigest,
    });
    const {
      schemaVersion: _currentSchema,
      stateDigest: _currentStateDigest,
      ...currentBody
    } = current;
    const next = createState({
      ...currentBody,
      status: changes.status,
      nextStepIndex: changes.nextStepIndex ?? current.nextStepIndex,
      pendingStepId: changes.pendingStepId,
      receipts: changes.receipts ?? current.receipts,
      indeterminateEvidenceDigest:
        changes.indeterminateEvidenceDigest ?? current.indeterminateEvidenceDigest,
      events: [...current.events, event],
      revision: current.revision + 1,
      logicalTimeHighWaterMs: Math.max(
        current.logicalTimeHighWaterMs,
        changes.logicalTimeMs,
      ),
      predecessorStateDigest: current.stateDigest,
    });
    if (await this.options.store.save({ state: next, expectedRevision: current.revision, expectedStateDigest: current.stateDigest }))
      return next;
    const retained = await this.options.store.load(current.stateKey);
    if (retained?.stateDigest === next.stateDigest) return retained;
    fail("Morphogenesis operator execution changed concurrently");
  }
}

export function createMorphogenesisOperatorStepReceiptV2(
  input: Omit<MorphogenesisOperatorStepReceiptV2, "schemaVersion" | "receiptDigest">,
) {
  const body = freeze({
    schemaVersion: 2 as const,
    operationId: id(input.operationId, "operator step operation ID"),
    planDigest: sha(input.planDigest, "operator plan digest"),
    stepId: id(input.stepId, "operator step ID"),
    stepDigest: sha(input.stepDigest, "operator step digest"),
    boundary: input.boundary,
    resultDigest: sha(input.resultDigest, "operator step result digest"),
    appliedAtLogicalMs: nonNegative(input.appliedAtLogicalMs, "operator step time"),
  });
  return freeze({ ...body, receiptDigest: digest("morphogenesis-operator-step-receipt-v2", body) });
}

export function validateMorphogenesisOperatorExecutionStateV2(input: unknown): MorphogenesisOperatorExecutionStateV2 {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("Morphogenesis operator execution state is invalid");
  const value = input as MorphogenesisOperatorExecutionStateV2;
  const { stateDigest, ...body } = value;
  if (value.schemaVersion !== 2 || stateDigest !== digest("morphogenesis-operator-execution-state-v2", body))
    fail("Morphogenesis operator execution state digest is invalid");
  assertPlan(value.plan);
  validateEvents(value.events);
  if (value.nextStepIndex < 0 || value.nextStepIndex > value.plan.steps.length || value.receipts.length !== value.nextStepIndex)
    fail("Morphogenesis operator execution progress is invalid");
  return immutable(value);
}

function createState(input: Omit<MorphogenesisOperatorExecutionStateV2, "schemaVersion" | "stateDigest"> & { stateDigest?: undefined }) {
  const { stateDigest: _ignored, ...value } = input;
  const body = freeze({ schemaVersion: 2 as const, ...value });
  return freeze({ ...body, stateDigest: digest("morphogenesis-operator-execution-state-v2", body) });
}
function createEvent(input: Omit<MorphogenesisOperatorExecutionEventV2, "schemaVersion" | "eventDigest">) { const body = freeze({ schemaVersion: 2 as const, ...input }); return freeze({ ...body, eventDigest: digest("morphogenesis-operator-execution-event-v2", body) }); }
function validateEvents(events: readonly MorphogenesisOperatorExecutionEventV2[]) { let previous: PlanningDigestV1 | null = null; for (const [index, event] of events.entries()) { const { eventDigest, ...body } = event; if (event.sequence !== index + 1 || event.previousEventDigest !== previous || eventDigest !== digest("morphogenesis-operator-execution-event-v2", body)) fail("Morphogenesis operator event chain is invalid"); previous = eventDigest; } }
function validateStepReceipt(receipt: MorphogenesisOperatorStepReceiptV2, plan: MorphogenesisCompiledOperatorPlanV2, step: MorphogenesisCompiledStepV2, operationId: AgentPlatID) { const result = createMorphogenesisOperatorStepReceiptV2({ operationId: receipt.operationId, planDigest: receipt.planDigest, stepId: receipt.stepId, stepDigest: receipt.stepDigest, boundary: receipt.boundary, resultDigest: receipt.resultDigest, appliedAtLogicalMs: receipt.appliedAtLogicalMs }); if (JSON.stringify(receipt) !== JSON.stringify(result) || result.operationId !== operationId || result.planDigest !== plan.planDigest || result.stepId !== step.stepId || result.stepDigest !== step.stepDigest || result.boundary !== step.boundary) fail("Morphogenesis operator step receipt is invalid"); return result; }
function assertPlan(plan: MorphogenesisCompiledOperatorPlanV2) { const { planDigest, ...body } = plan; if (plan.schemaVersion !== 2 || plan.advisoryOnly !== true || planDigest !== digest("morphogenesis-compiled-operator-plan-v2", body)) fail("Morphogenesis compiled operator plan is invalid"); }
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+=-]{0,255}$/u; const SHA = /^sha256:[0-9a-f]{64}$/u;
function id(value: unknown, label: string): AgentPlatID { if (typeof value !== "string" || !ID.test(value)) fail(`${label} is invalid`); return value as AgentPlatID; } function sha(value: unknown, label: string): PlanningDigestV1 { if (typeof value !== "string" || !SHA.test(value)) fail(`${label} is invalid`); return value as PlanningDigestV1; } function nonNegative(value: unknown, label: string): number { if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${label} is invalid`); return value as number; } function digest(domain: string, value: unknown): PlanningDigestV1 { return digestPlanningJsonV1(domain as never, value as PlanningJson); } function immutable<T>(value: T): T { return freeze(structuredClone(value)); } function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const key of Object.getOwnPropertyNames(value)) freeze((value as Record<string, unknown>)[key]); } return value; } function fail(message: string): never { throw new TypeError(message); }
