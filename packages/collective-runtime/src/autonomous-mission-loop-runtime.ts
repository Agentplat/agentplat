import type { MeshExecutionHeadProjection } from "@agentplat/mesh/coordination";

import {
  type AutonomousMissionExecutionMaterialV1,
  type AutonomousMissionLoopActionV1,
  type AutonomousMissionLoopCycleResultV1,
  type AutonomousMissionLoopOperationStatusV1,
  type AutonomousMissionLoopOperationV1,
  type AutonomousMissionLoopPortV1,
  type AutonomousMissionLoopRuntimeOptionsV1,
  type AutonomousMissionLoopStateV1,
} from "./autonomous-mission-loop-contracts.js";
import type {
  CollectivePeerNodeExecuteOutcomeV1,
  CollectivePeerNodePlanOutcomeV1,
  CollectivePeerNodeRunOutcomeV1,
  CollectivePeerNodeSnapshotV1,
} from "./node-contracts.js";
import {
  evaluateApprovalCheckpointV1,
  validateApprovalCheckpointPolicyV1,
  type ApprovalCheckpointActionV1,
} from "./approval-checkpoints.js";
import { autonomousMissionLoopDigestV1 } from "./autonomous-mission-loop-validation.js";
import {
  createAutonomousMissionLoopOperationV1,
  createAutonomousMissionLoopStateV1,
  validateAutonomousMissionLoopPolicyV1,
  validateAutonomousMissionLoopScopeV1,
  validateAutonomousMissionLoopStateV1,
} from "./autonomous-mission-loop-validation.js";

interface SelectedAssignmentV1 {
  readonly runnable: MeshExecutionHeadProjection | null;
  readonly awaitingSettlement: boolean;
}

/**
 * Durable local OODA loop for one peer. It advances transport, planning and an
 * accepted assignment without a process-global scheduler or global graph.
 */
export class AutonomousMissionLoopRuntimeV1 implements AutonomousMissionLoopPortV1 {
  readonly #options: AutonomousMissionLoopRuntimeOptionsV1;

  constructor(options: AutonomousMissionLoopRuntimeOptionsV1) {
    if (!options?.node || !options?.executionMaterial || !options?.store)
      throw new TypeError("autonomous mission loop ports are required");
    if (
      typeof options.node.restore !== "function" ||
      typeof options.node.runOnce !== "function" ||
      typeof options.node.plan !== "function" ||
      typeof options.node.execute !== "function" ||
      typeof options.executionMaterial.resolve !== "function" ||
      typeof options.store.loadCurrent !== "function" ||
      typeof options.store.save !== "function" ||
      typeof options.clock?.now !== "function"
    )
      throw new TypeError("autonomous mission loop port is invalid");
    stableIdentifier(options.stateKey, "stateKey");
    stableIdentifier(options.anchorKey, "anchorKey");
    this.#options = {
      ...options,
      scope: validateAutonomousMissionLoopScopeV1(options.scope),
      policy: validateAutonomousMissionLoopPolicyV1(options.policy),
      ...(options.approval
        ? {
            approval: {
              ...options.approval,
              policy: validateApprovalCheckpointPolicyV1(options.approval.policy),
            },
          }
        : {}),
    };
  }

  async loadState(): Promise<AutonomousMissionLoopStateV1> {
    const current = await this.#options.store.loadCurrent({
      stateKey: this.#options.stateKey,
      anchorKey: this.#options.anchorKey,
    });
    const found = current.state;
    const anchor = current.anchor;
    if (found) {
      const state = validateAutonomousMissionLoopStateV1(
        found,
        this.#options.policy,
      );
      this.#assertBinding(state);
      if (
        !anchor ||
        anchor.stateKey !== state.stateKey ||
        anchor.revision !== state.revision ||
        anchor.stateDigest !== state.stateDigest ||
        anchor.logicalTimeHighWaterMs !== state.logicalTimeHighWaterMs
      )
        throw new TypeError("autonomous mission loop anchor mismatch");
      return state;
    }
    if (anchor)
      throw new TypeError("autonomous mission loop state rollback detected");
    const now = this.#now();
    const initial = createAutonomousMissionLoopStateV1({
      stateKey: this.#options.stateKey,
      scope: this.#options.scope,
      policyDigest: this.#options.policy.policyDigest,
      logicalTimeHighWaterMs: now,
    });
    if (
      await this.#options.store.save({
        state: initial,
        anchorKey: this.#options.anchorKey,
        expectedRevision: null,
        expectedStateDigest: null,
      })
    )
      return initial;
    const raced = await this.#options.store.loadCurrent({
      stateKey: this.#options.stateKey,
      anchorKey: this.#options.anchorKey,
    });
    if (!raced.state)
      throw new Error("autonomous mission loop initialization contention");
    return this.loadState();
  }

  async runCycle(
    input: { readonly signal?: AbortSignal } = {},
  ): Promise<AutonomousMissionLoopCycleResultV1> {
    let state = await this.loadState();
    if (input.signal?.aborted)
      return this.#result({
        action: "wait",
        status: "deferred",
        reasonCode: "aborted",
        operation: null,
        nodeRevision: (await this.#options.node.restore()).durableRevision,
        state,
      });
    const now = this.#now(state.logicalTimeHighWaterMs);
    if (state.pendingOperation)
      return this.#resume(state, now, input.signal);

    let transport: CollectivePeerNodeRunOutcomeV1 | null = null;
    try {
      transport = await this.#options.node.runOnce(input.signal);
    } catch (error) {
      return this.#recordImmediate({
        state,
        now,
        action: "transport",
        status: "failed",
        reasonCode: reason(error, "transport_failed"),
        transport: null,
        nodeRevision: (await this.#options.node.restore()).durableRevision,
      });
    }

    const snapshot = await this.#options.node.restore();
    const selected = this.#assignment(snapshot, now);
    let action: AutonomousMissionLoopActionV1 = "wait";
    let agentId: string | null = null;
    let assignment: MeshExecutionHeadProjection | null = null;
    let reasonCode = "idle";
    if (selected.runnable && now >= state.nextExecutionAtLogicalMs) {
      action = "execute";
      assignment = selected.runnable;
      reasonCode = "active_assignment";
    } else if (selected.awaitingSettlement) {
      reasonCode = "execution_release_awaiting_settlement";
    } else if (
      this.#options.policy.planWhenIdle &&
      now >= state.nextPlanningAtLogicalMs
    ) {
      action = "plan";
      agentId = this.#options.policy.planningAgentIds[
        state.planningCursor % this.#options.policy.planningAgentIds.length
      ]!;
      reasonCode = "planning_due";
    } else if (this.#transportDidWork(transport)) {
      action = "transport";
      reasonCode = "transport_progress";
    }

    if (action === "wait" || action === "transport")
      return this.#recordImmediate({
        state,
        now,
        action,
        status: "applied",
        reasonCode,
        transport,
        nodeRevision: snapshot.durableRevision,
      });

    const sequence = state.operationSequence + 1;
    const operationId = `mission-loop.${this.#options.scope.peerId}.${sequence}`;
    const stepId =
      action === "plan"
        ? `mission-loop.plan.${sequence}`
        : `mission-loop.execute.${sequence}`;
    let material: AutonomousMissionExecutionMaterialV1 | null = null;
    if (action === "execute") {
      try {
        material = await this.#options.executionMaterial.resolve({
          operationId,
          scope: this.#options.scope,
          snapshot,
          assignment: assignment!,
          logicalTimeMs: now,
          ...(input.signal ? { signal: input.signal } : {}),
        });
      } catch (error) {
        return this.#recordImmediate({
          state,
          now,
          action: "wait",
          status: "deferred",
          reasonCode: reason(error, "execution_material_unavailable"),
          transport,
          nodeRevision: snapshot.durableRevision,
        });
      }
      if (!material)
        return this.#recordImmediate({
          state,
          now,
          action: "wait",
          status: "deferred",
          reasonCode: "execution_material_unavailable",
          transport,
          nodeRevision: snapshot.durableRevision,
        });
      this.#assertMaterial(material);
    }

    const prepared = createAutonomousMissionLoopOperationV1({
      operationId,
      sequence,
      action,
      agentId,
      workItemId: assignment?.workItemId ?? null,
      assignmentAuthorityId: assignment?.assignmentAuthorityId ?? null,
      assignmentEpoch: assignment?.assignmentEpoch ?? null,
      stepId,
      materialDigest: material?.materialDigest ?? null,
      preparedAtLogicalMs: now,
      completedAtLogicalMs: null,
      status: "prepared",
      reasonCode,
      resultDigest: null,
    });
    state = await this.#prepare(state, prepared, now);
    return this.#invoke({ state, operation: prepared, material, transport, signal: input.signal });
  }

  async run(
    input: { readonly maximumCycles?: number; readonly signal?: AbortSignal } = {},
  ): Promise<readonly AutonomousMissionLoopCycleResultV1[]> {
    const maximumCycles = input.maximumCycles ?? this.#options.policy.maximumCyclesPerRun;
    if (
      !Number.isSafeInteger(maximumCycles) ||
      maximumCycles < 1 ||
      maximumCycles > this.#options.policy.maximumCyclesPerRun
    )
      throw new TypeError("autonomous mission loop cycle limit is invalid");
    const results: AutonomousMissionLoopCycleResultV1[] = [];
    for (let cycle = 0; cycle < maximumCycles; cycle += 1) {
      if (input.signal?.aborted) break;
      const result = await this.runCycle(
        input.signal ? { signal: input.signal } : {},
      );
      results.push(result);
      if (result.status === "deferred" && result.reasonCode === "aborted") break;
    }
    return Object.freeze(results);
  }

  async start(input: { readonly signal: AbortSignal }): Promise<void> {
    if (!input?.signal)
      throw new TypeError("autonomous mission loop signal is required");
    while (!input.signal.aborted) {
      const result = await this.runCycle({ signal: input.signal });
      if (input.signal.aborted) break;
      if (result.action === "wait" || result.status !== "applied")
        await delay(this.#options.policy.idleDelayMs, input.signal);
    }
  }

  async #resume(
    state: AutonomousMissionLoopStateV1,
    now: number,
    signal?: AbortSignal,
  ): Promise<AutonomousMissionLoopCycleResultV1> {
    const operation = state.pendingOperation!;
    let material: AutonomousMissionExecutionMaterialV1 | null = null;
    if (operation.action === "execute") {
      const current = await this.#preparedAssignment(operation, now);
      if (!current)
        return this.#complete({
          state,
          operation,
          now,
          status: "deferred",
          reasonCode: "prepared_assignment_no_longer_current",
          resultDigest: null,
          nodeRevision: (await this.#options.node.restore()).durableRevision,
        });
      material = await this.#options.executionMaterial.resolve({
        operationId: operation.operationId,
        scope: this.#options.scope,
        snapshot: current.snapshot,
        assignment: current.assignment,
        logicalTimeMs: now,
        ...(signal ? { signal } : {}),
      });
      if (!material || material.materialDigest !== operation.materialDigest)
        return this.#complete({
          state,
          operation,
          now,
          status: "failed",
          reasonCode: "execution_material_replay_mismatch",
          resultDigest: null,
          nodeRevision: current.snapshot.durableRevision,
        });
      this.#assertMaterial(material);
    }
    return this.#invoke({ state, operation, material, transport: null, signal });
  }

  async #invoke(input: {
    readonly state: AutonomousMissionLoopStateV1;
    readonly operation: AutonomousMissionLoopOperationV1;
    readonly material: AutonomousMissionExecutionMaterialV1 | null;
    readonly transport: CollectivePeerNodeRunOutcomeV1 | null;
    readonly signal?: AbortSignal;
  }): Promise<AutonomousMissionLoopCycleResultV1> {
    let planning: CollectivePeerNodePlanOutcomeV1 | null = null;
    let execution: CollectivePeerNodeExecuteOutcomeV1 | null = null;
    let status: Exclude<AutonomousMissionLoopOperationStatusV1, "prepared"> = "failed";
    let reasonCode = "operation_failed";
    let resultDigest = null;
    let nodeRevision = (await this.#options.node.restore()).durableRevision;
    const approval = this.#options.approval;
    if (approval && (input.operation.action === "plan" || input.operation.action === "execute")) {
      const action = input.operation.action as ApprovalCheckpointActionV1;
      const requestBody = {
        schemaVersion: 1 as const,
        approvalId: `approval.${input.operation.operationId}`,
        operationId: input.operation.operationId,
        action,
        scopeDigest: this.#options.scope.scopeDigest,
        policyDigest: approval.policy.policyDigest,
        requestedAtLogicalMs: input.operation.preparedAtLogicalMs,
      };
      const request = Object.freeze({
        ...requestBody,
        requestDigest: autonomousMissionLoopDigestV1("approval-checkpoint-request", requestBody),
      });
      const decision = await evaluateApprovalCheckpointV1({ policy: approval.policy, port: approval.port, request });
      if (decision.status !== "approved") {
        const completed = await this.#complete({
          state: input.state,
          operation: input.operation,
          now: this.#now(input.state.logicalTimeHighWaterMs),
          status: decision.status,
          reasonCode: decision.reasonCode,
          resultDigest: autonomousMissionLoopDigestV1("approval-checkpoint-decision", decision),
          nodeRevision,
        });
        return Object.freeze({ ...completed, transport: input.transport, planning: null, execution: null });
      }
    }
    if (input.operation.action === "execute") {
      const invocationNow = this.#now(input.state.logicalTimeHighWaterMs);
      const current = await this.#preparedAssignment(
        input.operation,
        invocationNow,
      );
      if (!current) {
        const completed = await this.#complete({
          state: input.state,
          operation: input.operation,
          now: invocationNow,
          status: "deferred",
          reasonCode: "prepared_assignment_no_longer_current",
          resultDigest: null,
          nodeRevision,
        });
        return Object.freeze({
          ...completed,
          transport: input.transport,
          planning,
          execution,
        });
      }
      nodeRevision = current.snapshot.durableRevision;
    }
    try {
      if (input.operation.action === "plan") {
        planning = await this.#options.node.plan({
          agentId: input.operation.agentId!,
          stepId: input.operation.stepId!,
          logicalTimeMs: input.operation.preparedAtLogicalMs,
          ...(input.signal ? { signal: input.signal } : {}),
        });
        nodeRevision = planning.durableRevision;
        status = planning.status === "failed" ? "failed" :
          planning.status === "paused" || planning.status === "refused" ? "deferred" : "applied";
        reasonCode = "reasonCode" in planning ? planning.reasonCode : planning.status;
        resultDigest = autonomousMissionLoopDigestV1("autonomous-loop-plan-result", planning);
      } else if (input.operation.action === "execute") {
        if (!input.material)
          throw new TypeError("prepared execution material is unavailable");
        /*
         * preparedAtLogicalMs is intentionally replay-stable because it is
         * part of command identity. Immediately above we revalidated the same
         * local assignee, active phase, lease/deadline and authority/epoch at a
         * fresh clock reading; node.execute then re-derives the assignment and
         * applies its existing pre/post currentness checks around execution.
         */
        execution = await this.#options.node.execute({
          workItemId: input.operation.workItemId!,
          stepId: input.operation.stepId!,
          logicalTimeMs: input.operation.preparedAtLogicalMs,
          observations: input.material.observations,
          input: input.material.input,
          requestedOutputModalities:
            input.material.requestedOutputModalities ??
            this.#options.policy.requestedOutputModalities,
          ...(input.signal ? { signal: input.signal } : {}),
        });
        nodeRevision = execution.durableRevision;
        status = execution.status === "committed" ? "applied" :
          execution.status === "failed" ? "failed" : "deferred";
        reasonCode = "reasonCode" in execution ? execution.reasonCode : execution.status;
        resultDigest = autonomousMissionLoopDigestV1(
          "autonomous-loop-execution-result",
          execution,
        );
      } else {
        throw new TypeError("prepared autonomous operation is not invokable");
      }
    } catch (error) {
      status = input.signal?.aborted ? "deferred" : "failed";
      reasonCode = reason(error, input.signal?.aborted ? "aborted" : "operation_failed");
    }
    const completed = await this.#complete({
      state: input.state,
      operation: input.operation,
      now: this.#now(input.state.logicalTimeHighWaterMs),
      status,
      reasonCode,
      resultDigest,
      nodeRevision,
    });
    return Object.freeze({ ...completed, transport: input.transport, planning, execution });
  }

  async #prepare(
    state: AutonomousMissionLoopStateV1,
    operation: AutonomousMissionLoopOperationV1,
    now: number,
  ): Promise<AutonomousMissionLoopStateV1> {
    const next = createAutonomousMissionLoopStateV1({
      ...state,
      revision: state.revision + 1,
      logicalTimeHighWaterMs: now,
      operationSequence: operation.sequence,
      pendingOperation: operation,
      predecessorStateDigest: state.stateDigest,
    });
    if (!(await this.#save(state, next)))
      throw new Error("autonomous mission loop prepare contention");
    return next;
  }

  async #complete(input: {
    readonly state: AutonomousMissionLoopStateV1;
    readonly operation: AutonomousMissionLoopOperationV1;
    readonly now: number;
    readonly status: Exclude<AutonomousMissionLoopOperationStatusV1, "prepared">;
    readonly reasonCode: string;
    readonly resultDigest: ReturnType<typeof autonomousMissionLoopDigestV1> | null;
    readonly nodeRevision: number;
  }): Promise<AutonomousMissionLoopCycleResultV1> {
    const terminal = createAutonomousMissionLoopOperationV1({
      ...input.operation,
      completedAtLogicalMs: input.now,
      status: input.status,
      reasonCode: boundedReason(input.reasonCode),
      resultDigest: input.resultDigest,
    });
    let current = input.state;
    for (let attempt = 0; attempt < this.#options.policy.maximumCommitAttempts; attempt += 1) {
      if (
        !current.pendingOperation ||
        current.pendingOperation.operationDigest !== input.operation.operationDigest
      ) {
        const retained = current.recentOperations.find(
          (entry) => entry.operationId === terminal.operationId,
        );
        if (retained)
          return this.#result({
            action: retained.action,
            status: retained.status === "failed" ? "failed" : retained.status === "deferred" ? "deferred" : "applied",
            reasonCode: retained.reasonCode,
            operation: retained,
            nodeRevision: input.nodeRevision,
            state: current,
          });
        throw new Error("autonomous mission loop pending operation changed");
      }
      const recent = [...current.recentOperations, terminal].slice(
        -this.#options.policy.maximumRetainedOperations,
      );
      const next = createAutonomousMissionLoopStateV1({
        ...current,
        revision: current.revision + 1,
        logicalTimeHighWaterMs: input.now,
        cycleSequence: current.cycleSequence + 1,
        planningCursor:
          terminal.action === "plan"
            ? current.planningCursor + 1
            : current.planningCursor,
        nextPlanningAtLogicalMs:
          terminal.action === "plan"
            ? input.now + this.#options.policy.planningCooldownMs
            : current.nextPlanningAtLogicalMs,
        nextExecutionAtLogicalMs:
          terminal.action === "execute" && terminal.status !== "applied"
            ? input.now + this.#options.policy.executionRetryDelayMs
            : current.nextExecutionAtLogicalMs,
        pendingOperation: null,
        recentOperations: recent,
        predecessorStateDigest: current.stateDigest,
      });
      if (await this.#save(current, next))
        return this.#result({
          action: terminal.action,
          status: input.status === "failed" ? "failed" : input.status === "deferred" ? "deferred" : "applied",
          reasonCode: terminal.reasonCode,
          operation: terminal,
          nodeRevision: input.nodeRevision,
          state: next,
        });
      current = await this.loadState();
    }
    throw new Error("autonomous mission loop completion contention");
  }

  async #recordImmediate(input: {
    readonly state: AutonomousMissionLoopStateV1;
    readonly now: number;
    readonly action: "transport" | "wait";
    readonly status: "applied" | "deferred" | "failed";
    readonly reasonCode: string;
    readonly transport: CollectivePeerNodeRunOutcomeV1 | null;
    readonly nodeRevision: number;
  }): Promise<AutonomousMissionLoopCycleResultV1> {
    const sequence = input.state.operationSequence + 1;
    const prepared = createAutonomousMissionLoopOperationV1({
      operationId: `mission-loop.${this.#options.scope.peerId}.${sequence}`,
      sequence,
      action: input.action,
      agentId: null,
      workItemId: null,
      assignmentAuthorityId: null,
      assignmentEpoch: null,
      stepId: null,
      materialDigest: null,
      preparedAtLogicalMs: input.now,
      completedAtLogicalMs: null,
      status: "prepared",
      reasonCode: input.reasonCode,
      resultDigest: null,
    });
    const state = await this.#prepare(input.state, prepared, input.now);
    const resultDigest = input.transport
      ? autonomousMissionLoopDigestV1("autonomous-loop-transport-result", input.transport)
      : null;
    const result = await this.#complete({
      state,
      operation: prepared,
      now: input.now,
      status: input.status,
      reasonCode: input.reasonCode,
      resultDigest,
      nodeRevision: input.nodeRevision,
    });
    return Object.freeze({ ...result, transport: input.transport });
  }

  #assignment(
    snapshot: CollectivePeerNodeSnapshotV1,
    now: number,
  ): SelectedAssignmentV1 {
    const active = Object.values(
      snapshot.state.runtime.mesh.allocation.executionHeads,
    )
      .filter(
        (candidate) =>
          candidate.assigneePeerId === this.#options.scope.peerId &&
          candidate.phase === "active" &&
          candidate.leaseExpiresAtLogical > now &&
          candidate.workDeadlineAt > now,
      )
      .sort((left, right) =>
        left.workItemId < right.workItemId
          ? -1
          : left.workItemId > right.workItemId
            ? 1
            : left.assignmentEpoch - right.assignmentEpoch,
      );
    let awaitingSettlement = false;
    for (const candidate of active) {
      const release = snapshot.state.releases.find(
        (entry) =>
          entry.workItemId === candidate.workItemId &&
          entry.assignmentAuthorityId === candidate.assignmentAuthorityId &&
          entry.assignmentEpoch === candidate.assignmentEpoch,
      );
      if (release) {
        awaitingSettlement = true;
        continue;
      }
      return Object.freeze({ runnable: candidate, awaitingSettlement });
    }
    return Object.freeze({ runnable: null, awaitingSettlement });
  }

  async #preparedAssignment(
    operation: AutonomousMissionLoopOperationV1,
    now: number,
  ): Promise<{
    readonly snapshot: CollectivePeerNodeSnapshotV1;
    readonly assignment: MeshExecutionHeadProjection;
  } | null> {
    const snapshot = await this.#options.node.restore();
    const assignment = Object.values(
      snapshot.state.runtime.mesh.allocation.executionHeads,
    ).find(
      (candidate) =>
        candidate.workItemId === operation.workItemId &&
        candidate.assigneePeerId === this.#options.scope.peerId &&
        candidate.phase === "active" &&
        candidate.leaseExpiresAtLogical > now &&
        candidate.workDeadlineAt > now &&
        candidate.assignmentAuthorityId === operation.assignmentAuthorityId &&
        candidate.assignmentEpoch === operation.assignmentEpoch,
    );
    if (!assignment) return null;
    const released = snapshot.state.releases.some(
      (entry) =>
        entry.workItemId === assignment.workItemId &&
        entry.assignmentAuthorityId === assignment.assignmentAuthorityId &&
        entry.assignmentEpoch === assignment.assignmentEpoch,
    );
    return released ? null : Object.freeze({ snapshot, assignment });
  }

  #transportDidWork(value: CollectivePeerNodeRunOutcomeV1): boolean {
    return (
      value.transport.inbox.claimed > 0 ||
      value.transport.outbox.claimed > 0 ||
      value.reconciliation.status !== "idle"
    );
  }

  #assertMaterial(value: AutonomousMissionExecutionMaterialV1): void {
    if (
      !value ||
      !/^sha256:[0-9a-f]{64}$/u.test(value.materialDigest) ||
      !Array.isArray(value.observations) ||
      (value.requestedOutputModalities !== undefined &&
        !Array.isArray(value.requestedOutputModalities))
    )
      throw new TypeError("autonomous mission execution material is invalid");
  }

  #assertBinding(state: AutonomousMissionLoopStateV1): void {
    if (
      state.stateKey !== this.#options.stateKey ||
      state.scope.scopeDigest !== this.#options.scope.scopeDigest ||
      state.policyDigest !== this.#options.policy.policyDigest
    )
      throw new TypeError("autonomous mission loop state binding mismatch");
  }

  async #save(
    current: AutonomousMissionLoopStateV1,
    next: AutonomousMissionLoopStateV1,
  ): Promise<boolean> {
    return this.#options.store.save({
      state: next,
      anchorKey: this.#options.anchorKey,
      expectedRevision: current.revision,
      expectedStateDigest: current.stateDigest,
    });
  }

  #now(minimum = 0): number {
    const value = this.#options.clock.now().logicalTimeMs;
    if (!Number.isSafeInteger(value) || value < minimum)
      throw new TypeError("autonomous mission loop logical clock rolled back");
    return value;
  }

  #result(input: {
    readonly action: AutonomousMissionLoopActionV1;
    readonly status: "applied" | "deferred" | "failed";
    readonly reasonCode: string;
    readonly operation: AutonomousMissionLoopOperationV1 | null;
    readonly nodeRevision: number;
    readonly state: AutonomousMissionLoopStateV1;
  }): AutonomousMissionLoopCycleResultV1 {
    return Object.freeze({
      ...input,
      transport: null,
      planning: null,
      execution: null,
    });
  }
}

function boundedReason(value: string): string {
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/gu, "_");
  return normalized.slice(0, 256) || "unspecified";
}

function stableIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length > 256 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]*$/u.test(value)
  )
    throw new TypeError(`autonomous mission loop ${label} is invalid`);
  return value;
}

function reason(error: unknown, fallback: string): string {
  return boundedReason(error instanceof Error && error.message ? error.message : fallback);
}

function delay(durationMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, durationMs);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}
