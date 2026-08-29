import type { JsonValue } from "@agentplat/core";

import {
  canonicalizeWorkflowJsonV1,
  cloneWorkflowV1,
  deepFreezeWorkflowV1,
  digestWorkflowJsonV1,
  WorkflowValidationErrorV1,
} from "./v1-canonical.js";
import type {
  AdvanceProcessInputV1,
  AdvancingProcessRunnerV1,
  CancelProcessInputV1,
  DescribeProcessInputV1,
  GateProviderPortV1,
  ProcessDefinitionV1,
  ProcessGateResultV1,
  ProcessOperationResultV1,
  ProcessRunnerV1,
  ProcessRunV1,
  ProcessSignalV1,
  ProcessStageOutcomeV1,
  ProcessStageStateV1,
  ProcessStageV1,
  ProcessTaskExecutionResultV1,
  ProcessWorkerRunInputV1,
  ProcessWorkerRunResultV1,
  ProcessWorkerV1,
  SignalProcessInputV1,
  StartProcessInputV1,
  TaskDefinitionV1,
  TaskExecutionBindingResolverV1,
  TaskExecutorPortV1,
  TaskRunStatusV1,
  TaskRunV1,
  WorkflowDigestV1,
  WorkflowOperationRecordV1,
  WorkflowStoreV1,
} from "./v1-contracts.js";
import {
  topologicalProcessStageIdsV1,
  validateProcessDefinitionV1,
  validateTaskDefinitionV1,
} from "./v1-validation.js";
import {
  createTaskExecutionBindingV1,
  createTaskRunV1,
  heartbeatTaskRunV1,
  takeOverExpiredTaskRunV1,
  transitionTaskRunV1,
  validateTaskRunV1,
} from "./v1-task-runs.js";

const successOutcomes = new Set<ProcessStageOutcomeV1>([
  "succeeded",
  "signal_received",
  "approved",
]);

/** Test-oriented V1 store. It makes no restart or cross-process durability claim. */
export class InMemoryWorkflowStoreV1 implements WorkflowStoreV1 {
  readonly #taskDefinitions = new Map<string, TaskDefinitionV1>();
  readonly #taskRuns = new Map<string, TaskRunV1>();
  readonly #taskRunIdempotency = new Map<string, string>();
  readonly #definitions = new Map<string, ProcessDefinitionV1>();
  readonly #runs = new Map<string, ProcessRunV1>();
  readonly #operations = new Map<string, WorkflowOperationRecordV1>();
  readonly #signals = new Map<string, ProcessSignalV1>();

  async registerTaskDefinition(
    tenantId: string,
    definition: TaskDefinitionV1,
  ): Promise<"created" | "replayed"> {
    token(tenantId, "tenantId");
    const validated = validateTaskDefinitionV1(definition);
    const key = definitionKey(
      tenantId,
      validated.taskDefinitionId,
      validated.version,
    );
    const current = this.#taskDefinitions.get(key);
    if (current) {
      if (current.definitionDigest !== validated.definitionDigest)
        conflict("task definition identity was reused with different bytes");
      return "replayed";
    }
    this.#taskDefinitions.set(key, cloneFrozen(validated));
    return "created";
  }

  async getTaskDefinition(
    tenantId: string,
    taskDefinitionId: string,
    taskDefinitionVersion: string,
  ): Promise<TaskDefinitionV1 | undefined> {
    return clone(
      this.#taskDefinitions.get(
        definitionKey(tenantId, taskDefinitionId, taskDefinitionVersion),
      ),
    );
  }

  async registerProcessDefinition(
    tenantId: string,
    definition: ProcessDefinitionV1,
  ): Promise<"created" | "replayed"> {
    token(tenantId, "tenantId");
    const validated = validateProcessDefinitionV1(definition);
    const key = definitionKey(tenantId, validated.processId, validated.version);
    const current = this.#definitions.get(key);
    if (current) {
      if (current.definitionDigest !== validated.definitionDigest)
        conflict("process definition identity was reused with different bytes");
      return "replayed";
    }
    this.#definitions.set(key, cloneFrozen(validated));
    return "created";
  }

  async getProcessDefinition(
    tenantId: string,
    processId: string,
    processVersion: string,
  ): Promise<ProcessDefinitionV1 | undefined> {
    return clone(
      this.#definitions.get(definitionKey(tenantId, processId, processVersion)),
    );
  }

  async createTaskRun(runInput: TaskRunV1): Promise<boolean> {
    const run = validateTaskRunV1(runInput);
    const key = taskRunKey(run.tenantId, run.taskRunId);
    const idempotency = taskIdempotencyKey(run.tenantId, run.idempotencyKey);
    const retainedTaskRunId = this.#taskRunIdempotency.get(idempotency);
    if (retainedTaskRunId && retainedTaskRunId !== run.taskRunId)
      conflict("task idempotency identity belongs to another task run");
    const current = this.#taskRuns.get(key);
    if (current) {
      if (current.stateDigest !== run.stateDigest)
        conflict("task run identity was reused with different bytes");
      return false;
    }
    this.#taskRuns.set(key, cloneFrozen(run));
    this.#taskRunIdempotency.set(idempotency, run.taskRunId);
    return true;
  }

  async getTaskRun(
    tenantId: string,
    taskRunId: string,
  ): Promise<TaskRunV1 | undefined> {
    token(tenantId, "tenantId");
    token(taskRunId, "taskRunId");
    return clone(this.#taskRuns.get(taskRunKey(tenantId, taskRunId)));
  }

  async findTaskRunByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<TaskRunV1 | undefined> {
    token(tenantId, "tenantId");
    token(idempotencyKey, "idempotencyKey");
    const taskRunId = this.#taskRunIdempotency.get(
      taskIdempotencyKey(tenantId, idempotencyKey),
    );
    return taskRunId ? this.getTaskRun(tenantId, taskRunId) : undefined;
  }

  async listTaskRuns(input: {
    readonly tenantId: string;
    readonly processRunId?: string;
    readonly status?: TaskRunStatusV1;
    readonly subject?: {
      readonly subjectType: string;
      readonly subjectId: string;
    };
  }): Promise<TaskRunV1[]> {
    token(input.tenantId, "tenantId");
    if (input.processRunId) token(input.processRunId, "processRunId");
    if (
      input.status &&
      ![
        "claimed",
        "running",
        "completed",
        "failed",
        "canceled",
        "indeterminate",
      ].includes(input.status)
    )
      fail("task run status filter is invalid");
    if (input.subject) {
      token(input.subject.subjectType, "subjectType");
      token(input.subject.subjectId, "subjectId");
    }
    return [...this.#taskRuns.values()]
      .filter(
        (run) =>
          run.tenantId === input.tenantId &&
          (!input.processRunId || run.processRunId === input.processRunId) &&
          (!input.status || run.status === input.status) &&
          (!input.subject ||
            (run.subject?.subjectType === input.subject.subjectType &&
              run.subject.subjectId === input.subject.subjectId)),
      )
      .sort((left, right) =>
        left.createdAt === right.createdAt
          ? left.taskRunId.localeCompare(right.taskRunId)
          : left.createdAt.localeCompare(right.createdAt),
      )
      .map((run) => cloneWorkflowV1(run));
  }

  async compareAndSetTaskRun(input: {
    readonly expectedRevision: number;
    readonly expectedStateDigest: WorkflowDigestV1;
    readonly run: TaskRunV1;
  }): Promise<boolean> {
    const next = validateTaskRunV1(input.run);
    const key = taskRunKey(next.tenantId, next.taskRunId);
    const current = this.#taskRuns.get(key);
    if (
      !current ||
      current.revision !== input.expectedRevision ||
      current.stateDigest !== input.expectedStateDigest ||
      next.revision !== input.expectedRevision + 1 ||
      next.idempotencyKey !== current.idempotencyKey ||
      next.binding.bindingDigest !== current.binding.bindingDigest ||
      next.inputDigest !== current.inputDigest
    )
      return false;
    this.#taskRuns.set(key, cloneFrozen(next));
    return true;
  }

  async createProcessRun(run: ProcessRunV1): Promise<boolean> {
    validateProcessRunV1(run);
    const key = runKey(run.tenantId, run.runId);
    if (this.#runs.has(key)) return false;
    this.#runs.set(key, cloneFrozen(run));
    return true;
  }

  async getProcessRun(
    tenantId: string,
    runId: string,
  ): Promise<ProcessRunV1 | undefined> {
    return clone(this.#runs.get(runKey(tenantId, runId)));
  }

  async listRunnableProcessRuns(input: {
    readonly tenantId?: string;
    readonly limit: number;
  }): Promise<ProcessRunV1[]> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1)
      fail("runnable process limit is invalid");
    return [...this.#runs.values()]
      .filter(
        (run) =>
          (!input.tenantId || run.tenantId === input.tenantId) &&
          ["pending", "running", "waiting", "canceling"].includes(run.status),
      )
      .sort((left, right) =>
        left.updatedAt === right.updatedAt
          ? left.runId.localeCompare(right.runId)
          : left.updatedAt.localeCompare(right.updatedAt),
      )
      .slice(0, input.limit)
      .map((run) => cloneWorkflowV1(run));
  }

  async compareAndSetProcessRun(input: {
    readonly expectedRevision: number;
    readonly expectedStateDigest: WorkflowDigestV1;
    readonly run: ProcessRunV1;
  }): Promise<boolean> {
    validateProcessRunV1(input.run);
    const key = runKey(input.run.tenantId, input.run.runId);
    const current = this.#runs.get(key);
    if (
      !current ||
      current.revision !== input.expectedRevision ||
      current.stateDigest !== input.expectedStateDigest ||
      input.run.revision !== input.expectedRevision + 1
    )
      return false;
    this.#runs.set(key, cloneFrozen(input.run));
    return true;
  }

  async getOperation(
    tenantId: string,
    operationKind: WorkflowOperationRecordV1["operationKind"],
    idempotencyKey: string,
  ): Promise<WorkflowOperationRecordV1 | undefined> {
    return clone(
      this.#operations.get(
        operationKey(tenantId, operationKind, idempotencyKey),
      ),
    );
  }

  async saveOperation(record: WorkflowOperationRecordV1): Promise<boolean> {
    const key = operationKey(
      record.tenantId,
      record.operationKind,
      record.idempotencyKey,
    );
    const current = this.#operations.get(key);
    if (current) {
      if (
        current.requestDigest !== record.requestDigest ||
        current.runId !== record.runId
      )
        conflict(
          "workflow idempotency identity was reused with another request",
        );
      return false;
    }
    this.#operations.set(key, cloneFrozen(record));
    return true;
  }

  async countOperations(tenantId: string, runId: string): Promise<number> {
    return [...this.#operations.values()].filter(
      (operation) =>
        operation.tenantId === tenantId && operation.runId === runId,
    ).length;
  }

  async appendSignal(signal: ProcessSignalV1): Promise<"created" | "replayed"> {
    validateProcessSignalV1(signal);
    const key = signalKey(signal.tenantId, signal.runId, signal.signalId);
    const current = this.#signals.get(key);
    if (current) {
      if (current.signalDigest !== signal.signalDigest)
        conflict("workflow signal identity was reused with different bytes");
      return "replayed";
    }
    this.#signals.set(key, cloneFrozen(signal));
    return "created";
  }

  async listSignals(
    tenantId: string,
    runId: string,
  ): Promise<ProcessSignalV1[]> {
    return [...this.#signals.values()]
      .filter(
        (signal) => signal.tenantId === tenantId && signal.runId === runId,
      )
      .sort((left, right) =>
        left.receivedAt === right.receivedAt
          ? left.signalId.localeCompare(right.signalId)
          : left.receivedAt.localeCompare(right.receivedAt),
      )
      .map((signal) => cloneWorkflowV1(signal));
  }
}

export interface InMemoryProcessRunnerV1Options {
  readonly taskExecutor?: TaskExecutorPortV1;
  /** Must compose protected tasks with the existing AgentPlat action boundary. */
  readonly protectedTaskExecutor?: TaskExecutorPortV1;
  readonly taskBindingResolver?: TaskExecutionBindingResolverV1;
  readonly gateProvider?: GateProviderPortV1;
  /** Required to be unique per concurrently active durable worker. */
  readonly workerId?: string;
  readonly taskLeaseDurationMs?: number;
}

/**
 * Deterministic V1 runner for local composition and tests. Effects must honor
 * the stable task idempotency key; this class provides no durable effect fence.
 */
export class InMemoryProcessRunnerV1 implements AdvancingProcessRunnerV1 {
  readonly #locks = new Map<string, Promise<void>>();
  readonly #workerId: string;
  readonly #taskLeaseDurationMs: number;

  constructor(
    readonly store: WorkflowStoreV1 = new InMemoryWorkflowStoreV1(),
    readonly options: InMemoryProcessRunnerV1Options = {},
  ) {
    this.#workerId = options.workerId ?? "in-memory-runner";
    token(this.#workerId, "workerId");
    this.#taskLeaseDurationMs = options.taskLeaseDurationMs ?? 300_000;
    if (
      !Number.isSafeInteger(this.#taskLeaseDurationMs) ||
      this.#taskLeaseDurationMs < 1_000 ||
      this.#taskLeaseDurationMs > 24 * 60 * 60 * 1_000
    )
      fail("taskLeaseDurationMs is invalid");
  }

  async registerProcessDefinition(
    tenantId: string,
    definition: ProcessDefinitionV1,
  ): Promise<"created" | "replayed"> {
    return this.store.registerProcessDefinition(tenantId, definition);
  }

  async registerTaskDefinition(
    tenantId: string,
    definition: TaskDefinitionV1,
  ): Promise<"created" | "replayed"> {
    return this.store.registerTaskDefinition(tenantId, definition);
  }

  async start(input: StartProcessInputV1): Promise<ProcessOperationResultV1> {
    return this.#withLock(input.tenantId, input.runId, async () => {
      validateStartInput(input);
      const requestDigestValue = requestDigest("start", input);
      const replay = await this.#replay(
        input.tenantId,
        "start",
        input.idempotencyKey,
        requestDigestValue,
        input.runId,
      );
      if (replay) return replay;
      const definition = await this.#definition(
        input.tenantId,
        input.processId,
        input.processVersion,
      );
      await this.#assertOperationCapacity(
        definition,
        input.tenantId,
        input.runId,
      );
      await this.#preflightDefinition(input.tenantId, definition);
      const initial = createInitialProcessRunV1(definition, input);
      if (!(await this.store.createProcessRun(initial)))
        conflict("process run already exists");
      const run = await this.#advanceCurrent(
        definition,
        initial,
        input.logicalTime,
        definition.limits.maximumTransitionsPerAdvance,
      );
      await this.store.saveOperation({
        tenantId: input.tenantId,
        operationKind: "start",
        idempotencyKey: input.idempotencyKey,
        requestDigest: requestDigestValue,
        runId: input.runId,
      });
      return frozenResult("applied", run);
    });
  }

  async signal(input: SignalProcessInputV1): Promise<ProcessOperationResultV1> {
    return this.#withLock(input.tenantId, input.runId, async () => {
      validateMutationIdentity(input);
      time(input.logicalTime, "logicalTime");
      const requestDigestValue = requestDigest("signal-operation", input);
      const replay = await this.#replay(
        input.tenantId,
        "signal",
        input.idempotencyKey,
        requestDigestValue,
        input.runId,
      );
      if (replay) return replay;
      const current = await this.#run(input.tenantId, input.runId);
      assertTimeNotBefore(input.logicalTime, current.updatedAt);
      const definition = await this.#definition(
        current.tenantId,
        current.processId,
        current.processVersion,
      );
      await this.#assertOperationCapacity(
        definition,
        input.tenantId,
        input.runId,
      );
      const signal = createProcessSignalV1({
        ...input.signal,
        tenantId: input.tenantId,
        runId: input.runId,
      });
      if (
        new TextEncoder().encode(canonicalizeWorkflowJsonV1(signal as never))
          .byteLength > definition.limits.maximumSignalBytes
      )
        fail("workflow signal exceeds the definition byte limit");
      const signals = await this.store.listSignals(input.tenantId, input.runId);
      if (
        !signals.some((candidate) => candidate.signalId === signal.signalId) &&
        signals.length >= definition.limits.maximumRetainedSignals
      )
        fail("workflow retained signal limit exceeded");
      await this.store.appendSignal(signal);
      let prepared = current;
      const trigger = definition.cancellationTriggers?.find(
        (candidate) =>
          candidate.signalType === signal.signalType &&
          (candidate.correlationKey ?? undefined) ===
            (signal.correlationKey ?? undefined),
      );
      if (trigger && !terminalRun(current.status))
        prepared = cancelDraft(
          definition,
          current,
          input.operationId,
          trigger.reasonCode,
          input.logicalTime,
        );
      const run = await this.#advanceCurrent(
        definition,
        prepared,
        input.logicalTime,
        definition.limits.maximumTransitionsPerAdvance,
        prepared !== current,
      );
      await this.store.saveOperation({
        tenantId: input.tenantId,
        operationKind: "signal",
        idempotencyKey: input.idempotencyKey,
        requestDigest: requestDigestValue,
        runId: input.runId,
      });
      return frozenResult("applied", run);
    });
  }

  async cancel(input: CancelProcessInputV1): Promise<ProcessOperationResultV1> {
    return this.#withLock(input.tenantId, input.runId, async () => {
      validateMutationIdentity(input);
      token(input.reasonCode, "reasonCode");
      time(input.logicalTime, "logicalTime");
      const requestDigestValue = requestDigest("cancel", input);
      const replay = await this.#replay(
        input.tenantId,
        "cancel",
        input.idempotencyKey,
        requestDigestValue,
        input.runId,
      );
      if (replay) return replay;
      const current = await this.#run(input.tenantId, input.runId);
      assertTimeNotBefore(input.logicalTime, current.updatedAt);
      const definition = await this.#definition(
        current.tenantId,
        current.processId,
        current.processVersion,
      );
      await this.#assertOperationCapacity(
        definition,
        input.tenantId,
        input.runId,
      );
      const prepared = terminalRun(current.status)
        ? current
        : cancelDraft(
            definition,
            current,
            input.operationId,
            input.reasonCode,
            input.logicalTime,
          );
      const run =
        prepared === current
          ? current
          : await this.#advanceCurrent(
              definition,
              prepared,
              input.logicalTime,
              definition.limits.maximumTransitionsPerAdvance,
              true,
            );
      await this.store.saveOperation({
        tenantId: input.tenantId,
        operationKind: "cancel",
        idempotencyKey: input.idempotencyKey,
        requestDigest: requestDigestValue,
        runId: input.runId,
      });
      return frozenResult("applied", run);
    });
  }

  async advance(
    input: AdvanceProcessInputV1,
  ): Promise<ProcessOperationResultV1> {
    return this.#withLock(input.tenantId, input.runId, async () => {
      validateMutationIdentity(input);
      time(input.logicalTime, "logicalTime");
      if (
        input.maximumTransitions !== undefined &&
        (!Number.isSafeInteger(input.maximumTransitions) ||
          input.maximumTransitions < 1)
      )
        fail("maximumTransitions is invalid");
      const requestDigestValue = requestDigest("advance", input);
      const replay = await this.#replay(
        input.tenantId,
        "advance",
        input.idempotencyKey,
        requestDigestValue,
        input.runId,
      );
      if (replay) return replay;
      const current = await this.#run(input.tenantId, input.runId);
      assertTimeNotBefore(input.logicalTime, current.updatedAt);
      const definition = await this.#definition(
        current.tenantId,
        current.processId,
        current.processVersion,
      );
      await this.#assertOperationCapacity(
        definition,
        input.tenantId,
        input.runId,
      );
      const maximum = Math.min(
        input.maximumTransitions ??
          definition.limits.maximumTransitionsPerAdvance,
        definition.limits.maximumTransitionsPerAdvance,
      );
      const run = terminalRun(current.status)
        ? current
        : await this.#advanceCurrent(
            definition,
            current,
            input.logicalTime,
            maximum,
          );
      await this.store.saveOperation({
        tenantId: input.tenantId,
        operationKind: "advance",
        idempotencyKey: input.idempotencyKey,
        requestDigest: requestDigestValue,
        runId: input.runId,
      });
      return frozenResult("applied", run);
    });
  }

  async describe(
    input: DescribeProcessInputV1,
  ): Promise<ProcessRunV1 | undefined> {
    token(input.tenantId, "tenantId");
    token(input.runId, "runId");
    return this.store.getProcessRun(input.tenantId, input.runId);
  }

  async #advanceCurrent(
    definition: ProcessDefinitionV1,
    current: ProcessRunV1,
    logicalTime: string,
    maximumTransitions: number,
    forceCommit = false,
  ): Promise<ProcessRunV1> {
    if (terminalRun(current.status)) return current;
    let draft = cloneWorkflowV1(current);
    let transitions = 0;
    if (
      Date.parse(logicalTime) - Date.parse(current.createdAt) >
      definition.limits.maximumRunDurationMs
    ) {
      for (const state of draft.stageStates)
        if (state.status !== "terminal")
          terminal(
            state,
            "timed_out",
            logicalTime,
            "process_duration_exceeded",
          );
      (draft as Mutable<ProcessRunV1>).status = "failed";
      return this.#commitDraft(current, draft, logicalTime);
    }
    while (transitions < maximumTransitions && !terminalRun(draft.status)) {
      const changed = await this.#transitionOne(definition, draft, logicalTime);
      if (!changed) break;
      transitions += 1;
      activateStages(definition, draft, logicalTime);
      settleRunStatus(definition, draft);
    }
    activateStages(definition, draft, logicalTime);
    settleRunStatus(definition, draft);
    if (!forceCommit && sameRunBody(current, draft)) return current;
    return this.#commitDraft(current, draft, logicalTime);
  }

  async #commitDraft(
    current: ProcessRunV1,
    draft: ProcessRunV1,
    logicalTime: string,
  ): Promise<ProcessRunV1> {
    const next = finalizeRun(draft, current.revision + 1, logicalTime);
    if (
      !(await this.store.compareAndSetProcessRun({
        expectedRevision: current.revision,
        expectedStateDigest: current.stateDigest,
        run: next,
      }))
    )
      conflict("process run changed concurrently");
    return next;
  }

  async #transitionOne(
    definition: ProcessDefinitionV1,
    run: ProcessRunV1,
    logicalTime: string,
  ): Promise<boolean> {
    if (run.cancellation) {
      const nextCompensation = run.cancellation.pendingCompensationStageIds[0];
      if (nextCompensation) {
        const state = mutableState(run, nextCompensation);
        if (state.status === "blocked") state.status = "ready";
      }
    }
    for (const stage of definition.stages) {
      const state = mutableState(run, stage.stageId);
      if (state.status === "waiting") {
        if (stage.kind === "task" && state.taskRunId) {
          const taskDefinition = await this.store.getTaskDefinition(
            run.tenantId,
            stage.taskDefinitionId,
            stage.taskDefinitionVersion,
          );
          if (!taskDefinition)
            fail(`task definition is required for stage ${stage.stageId}`);
          const result = await this.#executeTask(
            run,
            stage,
            taskDefinition,
            state.attempt,
            state.taskRunId,
            logicalTime,
          );
          const changed = this.#applyTaskResult(
            run,
            stage,
            state,
            result,
            logicalTime,
          );
          this.#advanceCompensationQueue(run, stage, state);
          return changed;
        }
        if (stage.kind === "wait" && reached(logicalTime, state.waitUntil)) {
          terminal(state, "succeeded", logicalTime);
          return true;
        }
        if (stage.kind === "await_signal") {
          const signal = await this.#matchingSignal(run, stage);
          if (signal) {
            state.consumedSignalId = signal.signalId;
            terminal(state, "signal_received", logicalTime);
            return true;
          }
          if (stage.timeoutMs && reached(logicalTime, state.waitUntil)) {
            terminal(state, "timed_out", logicalTime);
            return true;
          }
        }
        if (stage.kind === "gate") {
          if (stage.expiresInMs && reached(logicalTime, state.waitUntil)) {
            const resolved = await this.#resolveGate(run, stage, logicalTime);
            state.gateRequestId = resolved.gateRequestId;
            terminal(
              state,
              resolved.status === "approved" ||
                resolved.status === "rejected" ||
                resolved.status === "expired"
                ? resolved.status
                : "expired",
              logicalTime,
              resolved.status === "failed"
                ? "gate_provider_unavailable_at_expiry"
                : "reasonCode" in resolved
                  ? resolved.reasonCode
                  : undefined,
            );
            return true;
          }
          const resolved = await this.#resolveGate(run, stage, logicalTime);
          if (resolved.status !== "waiting") {
            state.gateRequestId = resolved.gateRequestId;
            terminal(state, resolved.status, logicalTime, resolved.reasonCode);
            return true;
          }
        }
      }
      if (state.status !== "ready") continue;
      if (stage.kind === "wait") {
        state.status = "waiting";
        state.startedAt ??= logicalTime;
        state.waitUntil = addMilliseconds(logicalTime, stage.durationMs);
        return true;
      }
      if (stage.kind === "await_signal") {
        const signal = await this.#matchingSignal(run, stage);
        if (signal) {
          state.consumedSignalId = signal.signalId;
          state.startedAt ??= logicalTime;
          terminal(state, "signal_received", logicalTime);
        } else {
          state.status = "waiting";
          state.startedAt ??= logicalTime;
          if (stage.timeoutMs)
            state.waitUntil = addMilliseconds(logicalTime, stage.timeoutMs);
        }
        return true;
      }
      if (stage.kind === "gate") {
        state.startedAt ??= logicalTime;
        if (stage.expiresInMs)
          state.waitUntil ??= addMilliseconds(logicalTime, stage.expiresInMs);
        const resolved = await this.#resolveGate(run, stage, logicalTime);
        state.gateRequestId = resolved.gateRequestId;
        if (resolved.status === "waiting") {
          state.status = "waiting";
        } else {
          terminal(state, resolved.status, logicalTime, resolved.reasonCode);
        }
        return true;
      }
      const taskDefinition = await this.store.getTaskDefinition(
        run.tenantId,
        stage.taskDefinitionId,
        stage.taskDefinitionVersion,
      );
      if (!taskDefinition)
        fail(`task definition is required for stage ${stage.stageId}`);
      validateTaskDefinitionV1(taskDefinition);
      state.status = "running";
      state.startedAt ??= logicalTime;
      state.attempt += 1;
      state.taskRunId = `${run.runId}:${stage.stageId}:${state.attempt}`;
      const result = await this.#executeTask(
        run,
        stage,
        taskDefinition,
        state.attempt,
        state.taskRunId,
        logicalTime,
      );
      this.#applyTaskResult(run, stage, state, result, logicalTime);
      this.#advanceCompensationQueue(run, stage, state);
      return true;
    }
    return false;
  }

  #applyTaskResult(
    _run: ProcessRunV1,
    stage: Extract<ProcessStageV1, { kind: "task" }>,
    state: Mutable<ProcessStageStateV1>,
    result: ProcessTaskExecutionResultV1,
    logicalTime: string,
  ): boolean {
    if (result.status === "completed") {
      terminal(state, "succeeded", logicalTime);
      return true;
    }
    if (result.status === "in_flight" || result.status === "indeterminate") {
      const reasonCode = result.reasonCode;
      const changed =
        state.status !== "waiting" || state.reasonCode !== reasonCode;
      state.status = "waiting";
      state.reasonCode = reasonCode;
      return changed;
    }
    const maximumAttempts = stage.retryPolicy?.maximumAttempts ?? 1;
    if (result.retryable && state.attempt < maximumAttempts) {
      state.status = "ready";
      state.reasonCode = result.reasonCode;
      delete state.taskRunId;
      return true;
    }
    terminal(state, "failed", logicalTime, result.reasonCode);
    return true;
  }

  #advanceCompensationQueue(
    run: ProcessRunV1,
    stage: Extract<ProcessStageV1, { kind: "task" }>,
    state: Mutable<ProcessStageStateV1>,
  ): void {
    if (!stage.compensationForStageId || state.outcome === undefined) return;
    const cancellation = run.cancellation;
    if (cancellation?.pendingCompensationStageIds[0] !== stage.stageId) return;
    (run as Mutable<ProcessRunV1>).cancellation = {
      ...cancellation,
      pendingCompensationStageIds:
        state.outcome === "succeeded"
          ? cancellation.pendingCompensationStageIds.slice(1)
          : cancellation.pendingCompensationStageIds,
    };
  }

  async #matchingSignal(
    run: ProcessRunV1,
    stage: Extract<ProcessStageV1, { kind: "await_signal" }>,
  ): Promise<ProcessSignalV1 | undefined> {
    const consumed = new Set(
      run.stageStates
        .map((candidate) => candidate.consumedSignalId)
        .filter((value): value is string => Boolean(value)),
    );
    return (await this.store.listSignals(run.tenantId, run.runId)).find(
      (signal) =>
        !consumed.has(signal.signalId) &&
        signal.signalType === stage.signalType &&
        (stage.correlationKey ?? undefined) ===
          (signal.correlationKey ?? undefined),
    );
  }

  async #resolveGate(
    run: ProcessRunV1,
    stage: Extract<ProcessStageV1, { kind: "gate" }>,
    logicalTime: string,
  ): Promise<ProcessGateResultV1> {
    if (!this.options.gateProvider)
      fail(`gate provider is required for stage ${stage.stageId}`);
    const state = mutableState(run, stage.stageId);
    try {
      return await this.options.gateProvider.resolve({
        tenantId: run.tenantId,
        runId: run.runId,
        stageId: stage.stageId,
        gateType: stage.gateType,
        gateDefinitionId: stage.gateDefinitionId,
        configuration: stage.configuration,
        processInput: run.input,
        requestedAt: state.startedAt ?? logicalTime,
        expiresAt: state.waitUntil,
        logicalTime,
      });
    } catch {
      return {
        status: "failed",
        gateRequestId: `unavailable:${run.runId}:${stage.stageId}`,
        reasonCode: "gate_provider_error",
      };
    }
  }

  async #executeTask(
    processRun: ProcessRunV1,
    stage: Extract<ProcessStageV1, { kind: "task" }>,
    taskDefinitionInput: TaskDefinitionV1,
    attempt: number,
    taskRunId: string,
    logicalTime: string,
  ): Promise<ProcessTaskExecutionResultV1> {
    const taskDefinition = validateTaskDefinitionV1(taskDefinitionInput);
    const executor =
      taskDefinition.effectClass === "protected_external"
        ? this.options.protectedTaskExecutor
        : this.options.taskExecutor;
    if (!executor)
      fail(
        taskDefinition.effectClass === "protected_external"
          ? `protected task executor is required for stage ${stage.stageId}`
          : `task executor is required for stage ${stage.stageId}`,
      );
    let bindingInput = {};
    if (this.options.taskBindingResolver) {
      try {
        bindingInput = await this.options.taskBindingResolver.resolve({
          tenantId: processRun.tenantId,
          runId: processRun.runId,
          stage,
          taskDefinition,
          processInput: processRun.input,
        });
      } catch {
        return {
          status: "failed",
          reasonCode: "task_binding_error",
          retryable: false,
        };
      }
    }
    const binding = createTaskExecutionBindingV1(taskDefinition, bindingInput);
    const idempotencyKey = `workflow-task:${processRun.tenantId}:${processRun.runId}:${stage.stageId}:${attempt}`;
    const inputDigest = digestWorkflowJsonV1(
      "task-run-input",
      json({
        processInput: processRun.input ?? null,
        processRunId: processRun.runId,
        stageId: stage.stageId,
        attempt,
      }),
    );
    let leaseGeneration = 0;
    let leaseToken = taskLeaseToken(this.#workerId, taskRunId, leaseGeneration);
    let leaseExpiresAt = addMilliseconds(
      logicalTime,
      this.#taskLeaseDurationMs,
    );
    let createdHere = false;
    let taskRun = await this.store.getTaskRun(processRun.tenantId, taskRunId);
    if (!taskRun) {
      const created = createTaskRunV1({
        tenantId: processRun.tenantId,
        taskRunId,
        processRunId: processRun.runId,
        stageId: stage.stageId,
        attempt,
        idempotencyKey,
        inputDigest,
        binding,
        ...(processRun.subject ? { subject: processRun.subject } : {}),
        leaseOwnerId: this.#workerId,
        leaseToken,
        leaseGeneration,
        leaseExpiresAt,
        logicalTime,
      });
      if (!(await this.store.createTaskRun(created)))
        conflict("task run changed while it was being claimed");
      taskRun = created;
      createdHere = true;
    } else {
      taskRun = validateTaskRunV1(taskRun);
      if (
        taskRun.processRunId !== processRun.runId ||
        taskRun.stageId !== stage.stageId ||
        taskRun.attempt !== attempt ||
        taskRun.idempotencyKey !== idempotencyKey ||
        taskRun.inputDigest !== inputDigest ||
        taskRun.binding.bindingDigest !== binding.bindingDigest
      )
        conflict("task run replay binding changed");
    }
    if (taskRun.status === "completed")
      return {
        status: "completed",
        ...(taskRun.resultReference
          ? { resultReference: taskRun.resultReference }
          : {}),
        ...(taskRun.resultDigest ? { resultDigest: taskRun.resultDigest } : {}),
        ...(taskRun.usage ? { usage: taskRun.usage } : {}),
      };
    if (taskRun.status === "failed")
      return {
        status: "failed",
        reasonCode: taskRun.reasonCode ?? "task_failed",
        retryable: taskRun.retryable ?? false,
        ...(taskRun.usage ? { usage: taskRun.usage } : {}),
      };
    if (taskRun.status === "canceled")
      return {
        status: "failed",
        reasonCode: taskRun.reasonCode ?? "task_canceled",
        retryable: false,
        ...(taskRun.usage ? { usage: taskRun.usage } : {}),
      };
    if (taskRun.status === "indeterminate")
      return {
        status: "indeterminate",
        reasonCode: taskRun.reasonCode ?? "task_effect_indeterminate",
        ...(taskRun.usage ? { usage: taskRun.usage } : {}),
      };
    if (!createdHere) {
      const expired =
        Date.parse(logicalTime) >= Date.parse(taskRun.leaseExpiresAt);
      if (!expired) {
        if (
          taskRun.leaseOwnerId !== this.#workerId ||
          taskRun.status === "running"
        )
          return {
            status: "in_flight",
            reasonCode: "task_attempt_in_flight",
          };
        leaseGeneration = taskRun.leaseGeneration;
        leaseToken = taskRun.leaseToken;
        leaseExpiresAt = taskRun.leaseExpiresAt;
      } else {
        leaseGeneration = taskRun.leaseGeneration + 1;
        leaseToken = taskLeaseToken(this.#workerId, taskRunId, leaseGeneration);
        leaseExpiresAt = addMilliseconds(
          logicalTime,
          this.#taskLeaseDurationMs,
        );
        const taken = takeOverExpiredTaskRunV1(taskRun, {
          leaseOwnerId: this.#workerId,
          leaseToken,
          logicalTime,
          leaseExpiresAt,
        });
        if (
          !(await this.store.compareAndSetTaskRun({
            expectedRevision: taskRun.revision,
            expectedStateDigest: taskRun.stateDigest,
            run: taken,
          }))
        )
          return {
            status: "in_flight",
            reasonCode: "task_lease_takeover_lost",
          };
        taskRun = taken;
      }
    }
    const running = transitionTaskRunV1(taskRun, {
      status: "running",
      logicalTime,
    });
    await this.#saveTaskTransition(taskRun, running);
    taskRun = running;
    const abort = new AbortController();
    const heartbeat = async (heartbeatInput: {
      readonly logicalTime: string;
    }): Promise<boolean> => {
      const current = await this.store.getTaskRun(
        processRun.tenantId,
        taskRunId,
      );
      if (
        !current ||
        !["claimed", "running"].includes(current.status) ||
        current.leaseToken !== leaseToken ||
        Date.parse(heartbeatInput.logicalTime) >
          Date.parse(current.leaseExpiresAt)
      ) {
        abort.abort();
        return false;
      }
      let next: TaskRunV1;
      try {
        next = heartbeatTaskRunV1(current, {
          leaseToken,
          logicalTime: heartbeatInput.logicalTime,
          leaseExpiresAt: addMilliseconds(
            heartbeatInput.logicalTime,
            this.#taskLeaseDurationMs,
          ),
        });
      } catch {
        abort.abort();
        return false;
      }
      const saved = await this.store.compareAndSetTaskRun({
        expectedRevision: current.revision,
        expectedStateDigest: current.stateDigest,
        run: next,
      });
      if (!saved) abort.abort();
      return saved;
    };
    let result: ProcessTaskExecutionResultV1;
    try {
      result = await executor.execute({
        tenantId: processRun.tenantId,
        runId: processRun.runId,
        stage,
        taskDefinition,
        attempt,
        taskRunId,
        idempotencyKey,
        binding,
        processInput: processRun.input,
        lease: {
          ownerId: this.#workerId,
          token: leaseToken,
          generation: leaseGeneration,
          expiresAt: leaseExpiresAt,
        },
        heartbeat,
        signal: abort.signal,
      });
    } catch {
      result =
        taskDefinition.effectClass === "protected_external"
          ? {
              status: "indeterminate",
              reasonCode: "protected_task_executor_error",
            }
          : {
              status: "failed",
              reasonCode: "task_executor_error",
              retryable: false,
            };
    }
    const latest = await this.store.getTaskRun(processRun.tenantId, taskRunId);
    if (!latest) conflict("task run disappeared before settlement");
    if (
      latest.leaseToken !== leaseToken ||
      latest.leaseGeneration !== leaseGeneration
    ) {
      abort.abort();
      return { status: "in_flight", reasonCode: "task_lease_lost" };
    }
    if (latest.status !== "running") {
      if (latest.status === "completed")
        return {
          status: "completed",
          ...(latest.resultReference
            ? { resultReference: latest.resultReference }
            : {}),
          ...(latest.resultDigest ? { resultDigest: latest.resultDigest } : {}),
          ...(latest.usage ? { usage: latest.usage } : {}),
        };
      if (latest.status === "indeterminate")
        return {
          status: "indeterminate",
          reasonCode: latest.reasonCode ?? "task_effect_indeterminate",
        };
      return {
        status: "failed",
        reasonCode: latest.reasonCode ?? "task_attempt_not_running",
        retryable: latest.retryable ?? false,
      };
    }
    taskRun = latest;
    if (result.status === "in_flight") return result;
    const settlementLogicalTime =
      taskRun.updatedAt > logicalTime ? taskRun.updatedAt : logicalTime;
    let resultDigest =
      result.status === "completed" ? result.resultDigest : undefined;
    if (result.status === "completed" && result.result) {
      const computed = digestWorkflowJsonV1("task-result", result.result);
      if (resultDigest && resultDigest !== computed)
        result = {
          status: "indeterminate",
          reasonCode: "task_result_digest_mismatch",
          ...(result.usage ? { usage: result.usage } : {}),
        };
      else resultDigest = computed;
    }
    const settled = transitionTaskRunV1(taskRun, {
      status: result.status,
      logicalTime: settlementLogicalTime,
      ...(result.status !== "completed"
        ? { reasonCode: result.reasonCode }
        : {}),
      ...(result.status === "failed" && result.retryable !== undefined
        ? { retryable: result.retryable }
        : {}),
      ...(result.usage ? { usage: result.usage } : {}),
      ...(result.status === "completed" && result.resultReference
        ? { resultReference: result.resultReference }
        : {}),
      ...(result.status === "completed" && resultDigest
        ? { resultDigest }
        : {}),
    });
    await this.#saveTaskTransition(taskRun, settled);
    if (result.status === "completed")
      return {
        ...result,
        ...(resultDigest ? { resultDigest } : {}),
      };
    return result;
  }

  async #saveTaskTransition(
    current: TaskRunV1,
    next: TaskRunV1,
  ): Promise<void> {
    if (
      !(await this.store.compareAndSetTaskRun({
        expectedRevision: current.revision,
        expectedStateDigest: current.stateDigest,
        run: next,
      }))
    )
      conflict("task run changed concurrently");
  }

  async #preflightDefinition(
    tenantId: string,
    definition: ProcessDefinitionV1,
  ): Promise<void> {
    if (
      definition.stages.some((stage) => stage.kind === "gate") &&
      !this.options.gateProvider
    )
      fail("gate provider is required by the process definition");
    for (const stage of definition.stages) {
      if (stage.kind !== "task") continue;
      const taskDefinition = await this.store.getTaskDefinition(
        tenantId,
        stage.taskDefinitionId,
        stage.taskDefinitionVersion,
      );
      if (!taskDefinition)
        fail(`task definition is required for stage ${stage.stageId}`);
      const validated = validateTaskDefinitionV1(taskDefinition);
      if (
        validated.effectClass === "protected_external" &&
        !this.options.protectedTaskExecutor
      )
        fail(`protected task executor is required for stage ${stage.stageId}`);
      if (validated.effectClass === "internal" && !this.options.taskExecutor)
        fail(`task executor is required for stage ${stage.stageId}`);
    }
  }

  async #assertOperationCapacity(
    definition: ProcessDefinitionV1,
    tenantId: string,
    runId: string,
  ): Promise<void> {
    if (
      (await this.store.countOperations(tenantId, runId)) >=
      definition.limits.maximumRetainedOperations
    )
      fail("workflow retained operation limit exceeded");
  }

  async #definition(
    tenantId: string,
    processId: string,
    processVersion: string,
  ): Promise<ProcessDefinitionV1> {
    const definition = await this.store.getProcessDefinition(
      tenantId,
      processId,
      processVersion,
    );
    if (!definition) fail("process definition was not found");
    return validateProcessDefinitionV1(definition);
  }

  async #run(tenantId: string, runId: string): Promise<ProcessRunV1> {
    const run = await this.store.getProcessRun(tenantId, runId);
    if (!run) fail("process run was not found");
    return validateProcessRunV1(run);
  }

  async #replay(
    tenantId: string,
    operationKind: WorkflowOperationRecordV1["operationKind"],
    idempotencyKey: string,
    requestDigestValue: WorkflowDigestV1,
    runId: string,
  ): Promise<ProcessOperationResultV1 | undefined> {
    const existing = await this.store.getOperation(
      tenantId,
      operationKind,
      idempotencyKey,
    );
    if (!existing) return undefined;
    if (
      existing.requestDigest !== requestDigestValue ||
      existing.runId !== runId
    )
      conflict("workflow idempotency identity conflicts with retained request");
    return frozenResult("replayed", await this.#run(tenantId, runId));
  }

  async #withLock<T>(
    tenantId: string,
    runId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const key = runKey(tenantId, runId);
    const previous = this.#locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.#locks.set(key, tail);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (this.#locks.get(key) === tail) this.#locks.delete(key);
    }
  }
}

/** Bounded local worker. Durable adapters add leases and cross-process fencing. */
export class InMemoryProcessWorkerV1 implements ProcessWorkerV1 {
  #draining = false;
  constructor(
    readonly store: WorkflowStoreV1,
    readonly runner: AdvancingProcessRunnerV1,
  ) {}

  async runOnce(
    input: ProcessWorkerRunInputV1,
  ): Promise<ProcessWorkerRunResultV1> {
    if (this.#draining)
      return deepFreezeWorkflowV1({ inspected: 0, advancedRunIds: [] });
    time(input.logicalTime, "logicalTime");
    if (input.tenantId) token(input.tenantId, "tenantId");
    const limit = input.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000)
      fail("worker run limit is invalid");
    const runs = await this.store.listRunnableProcessRuns({
      tenantId: input.tenantId,
      limit,
    });
    const advancedRunIds: string[] = [];
    for (const run of runs) {
      const identity = `worker:${run.runId}:${run.revision}:${input.logicalTime}`;
      const result = await this.runner.advance({
        tenantId: run.tenantId,
        runId: run.runId,
        operationId: identity,
        idempotencyKey: identity,
        logicalTime: input.logicalTime,
        ...(input.maximumTransitionsPerRun !== undefined
          ? { maximumTransitions: input.maximumTransitionsPerRun }
          : {}),
      });
      if (result.run.revision !== run.revision) advancedRunIds.push(run.runId);
    }
    return deepFreezeWorkflowV1({
      inspected: runs.length,
      advancedRunIds,
    });
  }

  async drain(): Promise<void> {
    this.#draining = true;
  }
}

export function createInitialProcessRunV1(
  definition: ProcessDefinitionV1,
  input: StartProcessInputV1,
): ProcessRunV1 {
  validateProcessDefinitionV1(definition);
  validateStartInput(input);
  const compensationIds = new Set(
    definition.stages
      .filter(
        (stage): stage is Extract<ProcessStageV1, { kind: "task" }> =>
          stage.kind === "task" && Boolean(stage.compensationForStageId),
      )
      .map((stage) => stage.stageId),
  );
  const body: Omit<ProcessRunV1, "stateDigest"> = {
    schemaVersion: 1,
    tenantId: input.tenantId,
    runId: input.runId,
    processId: definition.processId,
    processVersion: definition.version,
    definitionDigest: definition.definitionDigest,
    revision: 0,
    status: "running",
    stageStates: definition.stages.map((stage) => ({
      stageId: stage.stageId,
      status:
        !compensationIds.has(stage.stageId) && stage.dependsOn.length === 0
          ? "ready"
          : "blocked",
      attempt: 0,
    })),
    ...(input.input ? { input: cloneWorkflowV1(input.input) } : {}),
    ...(input.subject ? { subject: cloneWorkflowV1(input.subject) } : {}),
    createdAt: input.logicalTime,
    updatedAt: input.logicalTime,
  };
  return deepFreezeWorkflowV1({
    ...body,
    stateDigest: processRunDigest(body),
  });
}

/** Creates and validates an exact externally-derived V1 process snapshot. */
export function createProcessRunSnapshotV1(
  bodyInput: Omit<ProcessRunV1, "stateDigest">,
): ProcessRunV1 {
  const body = cloneWorkflowV1(bodyInput);
  return validateProcessRunV1(
    deepFreezeWorkflowV1({
      ...body,
      stateDigest: processRunDigest(body),
    }),
  );
}

export function createProcessSignalV1(
  input: Omit<ProcessSignalV1, "schemaVersion" | "signalDigest">,
): ProcessSignalV1 {
  token(input.tenantId, "tenantId");
  token(input.runId, "runId");
  token(input.signalId, "signalId");
  token(input.signalType, "signalType");
  if (input.correlationKey) token(input.correlationKey, "correlationKey");
  token(input.sourceType, "sourceType");
  token(input.sourceId, "sourceId");
  if (
    input.sourceRevision !== undefined &&
    (!Number.isSafeInteger(input.sourceRevision) || input.sourceRevision < 0)
  )
    fail("sourceRevision is invalid");
  time(input.receivedAt, "receivedAt");
  const body = { schemaVersion: 1 as const, ...input };
  const signal: ProcessSignalV1 = {
    ...body,
    signalDigest: digestWorkflowJsonV1("process-signal", json(body)),
  };
  return deepFreezeWorkflowV1(cloneWorkflowV1(signal));
}

export function validateProcessSignalV1(
  signal: ProcessSignalV1,
): ProcessSignalV1 {
  const { signalDigest, ...body } = signal;
  if (
    !/^sha256:[0-9a-f]{64}$/u.test(signalDigest) ||
    signalDigest !== digestWorkflowJsonV1("process-signal", json(body))
  )
    fail("workflow signal digest is invalid");
  return createProcessSignalV1(body);
}

export function validateProcessRunV1(run: ProcessRunV1): ProcessRunV1 {
  token(run.tenantId, "tenantId");
  token(run.runId, "runId");
  token(run.processId, "processId");
  token(run.processVersion, "processVersion");
  digest(run.definitionDigest, "definitionDigest");
  digest(run.stateDigest, "stateDigest");
  if (!Number.isSafeInteger(run.revision) || run.revision < 0)
    fail("process run revision is invalid");
  if (
    ![
      "pending",
      "running",
      "waiting",
      "canceling",
      "completed",
      "failed",
      "canceled",
    ].includes(run.status)
  )
    fail("process run status is invalid");
  if (!Array.isArray(run.stageStates) || run.stageStates.length < 1)
    fail("process run stage states are invalid");
  const ids = new Set<string>();
  for (const state of run.stageStates) {
    token(state.stageId, "run stageId");
    if (ids.has(state.stageId)) fail("run stage state is duplicated");
    ids.add(state.stageId);
    if (!Number.isSafeInteger(state.attempt) || state.attempt < 0)
      fail("run stage attempt is invalid");
    if (
      !["blocked", "ready", "running", "waiting", "terminal"].includes(
        state.status,
      )
    )
      fail("run stage status is invalid");
    if (state.status === "terminal" && !state.outcome)
      fail("terminal run stage requires an outcome");
  }
  time(run.createdAt, "createdAt");
  time(run.updatedAt, "updatedAt");
  const { stateDigest, ...body } = run;
  if (stateDigest !== processRunDigest(body))
    fail("process run state digest does not match");
  return deepFreezeWorkflowV1(cloneWorkflowV1(run));
}

function activateStages(
  definition: ProcessDefinitionV1,
  run: ProcessRunV1,
  logicalTime: string,
): void {
  if (run.cancellation) return;
  const compensation = new Set(
    definition.stages
      .filter((stage) => stage.kind === "task" && stage.compensationForStageId)
      .map((stage) => stage.stageId),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const stage of definition.stages) {
      if (compensation.has(stage.stageId)) continue;
      const state = mutableState(run, stage.stageId);
      if (state.status !== "blocked") continue;
      if (stage.dependsOn.length === 0) {
        state.status = "ready";
        changed = true;
        continue;
      }
      const matches = stage.dependsOn.map((dependency) => {
        const source = mutableState(run, dependency.stageId);
        return {
          terminal: source.status === "terminal",
          matches:
            source.status === "terminal" &&
            Boolean(source.outcome) &&
            dependency.outcomes.includes(source.outcome!),
        };
      });
      const mode = stage.dependencyMode ?? "all";
      const satisfied =
        mode === "all"
          ? matches.every((candidate) => candidate.matches)
          : matches.some((candidate) => candidate.matches);
      if (satisfied) {
        state.status = "ready";
        changed = true;
        continue;
      }
      const impossible =
        mode === "all"
          ? matches.some(
              (candidate) => candidate.terminal && !candidate.matches,
            )
          : matches.every((candidate) => candidate.terminal);
      if (impossible) {
        terminal(state, "skipped", logicalTime);
        changed = true;
      }
    }
  }
}

function settleRunStatus(
  definition: ProcessDefinitionV1,
  run: ProcessRunV1,
): void {
  const mutable = run as Mutable<ProcessRunV1>;
  if (run.cancellation) {
    const compensationStates = definition.stages
      .filter((stage) => stage.kind === "task" && stage.compensationForStageId)
      .map((stage) => mutableState(run, stage.stageId));
    if (
      compensationStates.some(
        (state) => state.status === "terminal" && state.outcome === "failed",
      )
    ) {
      mutable.status = "failed";
      return;
    }
    mutable.status =
      run.cancellation.pendingCompensationStageIds.length === 0
        ? "canceled"
        : "canceling";
    return;
  }
  if (
    run.stageStates.some((state) => ["ready", "running"].includes(state.status))
  ) {
    mutable.status = "running";
    return;
  }
  if (run.stageStates.some((state) => state.status === "waiting")) {
    mutable.status = "waiting";
    return;
  }
  if (run.stageStates.some((state) => state.status === "blocked")) {
    mutable.status = "failed";
    return;
  }
  const byId = new Map(
    definition.stages.map((stage) => [stage.stageId, stage]),
  );
  const activeLeaves = definition.stages.filter((stage) => {
    const state = mutableState(run, stage.stageId);
    if (state.outcome === "skipped") return false;
    return !definition.stages.some((candidate) => {
      const candidateState = mutableState(run, candidate.stageId);
      if (candidateState.outcome === "skipped") return false;
      return candidate.dependsOn.some(
        (dependency) =>
          dependency.stageId === stage.stageId &&
          Boolean(state.outcome) &&
          dependency.outcomes.includes(state.outcome!),
      );
    });
  });
  if (
    activeLeaves.length === 0 ||
    activeLeaves.some((stage) => !byId.has(stage.stageId))
  )
    mutable.status = "failed";
  else
    mutable.status = activeLeaves.every((stage) =>
      successOutcomes.has(mutableState(run, stage.stageId).outcome!),
    )
      ? "completed"
      : "failed";
}

function cancelDraft(
  definition: ProcessDefinitionV1,
  current: ProcessRunV1,
  operationId: string,
  reasonCode: string,
  logicalTime: string,
): ProcessRunV1 {
  const draft = cloneWorkflowV1(current);
  const mutable = draft as Mutable<ProcessRunV1>;
  const states = new Map(
    draft.stageStates.map((state) => [state.stageId, state]),
  );
  const topological = topologicalProcessStageIdsV1(definition);
  const compensationsByTarget = new Map<string, string>();
  for (const stage of definition.stages)
    if (stage.kind === "task" && stage.compensationForStageId)
      compensationsByTarget.set(stage.compensationForStageId, stage.stageId);
  const pendingCompensationStageIds = [...topological]
    .reverse()
    .filter(
      (stageId) =>
        states.get(stageId)?.outcome === "succeeded" &&
        compensationsByTarget.has(stageId),
    )
    .map((stageId) => compensationsByTarget.get(stageId)!);
  for (const state of draft.stageStates) {
    const stage = definition.stages.find(
      (candidate) => candidate.stageId === state.stageId,
    )!;
    if (stage.kind === "task" && stage.compensationForStageId) continue;
    if (state.status !== "terminal") terminal(state, "canceled", logicalTime);
  }
  mutable.cancellation = {
    operationId,
    reasonCode,
    requestedAt: logicalTime,
    pendingCompensationStageIds,
  };
  mutable.status = pendingCompensationStageIds.length
    ? "canceling"
    : "canceled";
  return draft;
}

function finalizeRun(
  draft: ProcessRunV1,
  revision: number,
  logicalTime: string,
): ProcessRunV1 {
  const { stateDigest: _stateDigest, ...currentBody } = draft;
  const body: Omit<ProcessRunV1, "stateDigest"> = {
    ...currentBody,
    revision,
    updatedAt: logicalTime,
  };
  return deepFreezeWorkflowV1({ ...body, stateDigest: processRunDigest(body) });
}

function processRunDigest(
  body: Omit<ProcessRunV1, "stateDigest">,
): WorkflowDigestV1 {
  return digestWorkflowJsonV1("process-run-state", json(body));
}

function terminal(
  state: ProcessStageStateV1,
  outcome: ProcessStageOutcomeV1,
  logicalTime: string,
  reasonCode?: string,
): void {
  const mutable = state as Mutable<ProcessStageStateV1>;
  mutable.status = "terminal";
  mutable.outcome = outcome;
  mutable.finishedAt = logicalTime;
  if (reasonCode) mutable.reasonCode = reasonCode;
}

function mutableState(
  run: ProcessRunV1,
  stageId: string,
): Mutable<ProcessStageStateV1> {
  const state = run.stageStates.find(
    (candidate) => candidate.stageId === stageId,
  );
  if (!state) fail(`process run is missing stage state ${stageId}`);
  return state as Mutable<ProcessStageStateV1>;
}

function sameRunBody(left: ProcessRunV1, right: ProcessRunV1): boolean {
  return (
    canonicalizeWorkflowJsonV1(jsonWithoutDigest(left)) ===
    canonicalizeWorkflowJsonV1(jsonWithoutDigest(right))
  );
}

function jsonWithoutDigest(run: ProcessRunV1): JsonValue {
  const { stateDigest: _stateDigest, ...body } = run;
  return json(body);
}

function requestDigest(domain: string, input: unknown): WorkflowDigestV1 {
  return digestWorkflowJsonV1(domain, json(input));
}

function validateStartInput(input: StartProcessInputV1): void {
  validateMutationIdentity(input);
  token(input.processId, "processId");
  token(input.processVersion, "processVersion");
  time(input.logicalTime, "logicalTime");
  if (input.subject) {
    token(input.subject.subjectType, "subjectType");
    token(input.subject.subjectId, "subjectId");
  }
}

function validateMutationIdentity(input: {
  readonly tenantId: string;
  readonly runId: string;
  readonly operationId: string;
  readonly idempotencyKey: string;
}): void {
  token(input.tenantId, "tenantId");
  token(input.runId, "runId");
  token(input.operationId, "operationId");
  token(input.idempotencyKey, "idempotencyKey");
}

function assertTimeNotBefore(current: string, previous: string): void {
  if (Date.parse(current) < Date.parse(previous))
    fail("workflow logical time moved backwards");
}

function addMilliseconds(value: string, milliseconds: number): string {
  const result = Date.parse(value) + milliseconds;
  if (!Number.isSafeInteger(result)) fail("workflow wait time overflowed");
  return new Date(result).toISOString();
}

function reached(current: string, target?: string): boolean {
  return Boolean(target) && Date.parse(current) >= Date.parse(target!);
}

function terminalRun(status: ProcessRunV1["status"]): boolean {
  return ["completed", "failed", "canceled"].includes(status);
}

function frozenResult(
  disposition: ProcessOperationResultV1["disposition"],
  run: ProcessRunV1,
): ProcessOperationResultV1 {
  return deepFreezeWorkflowV1({ disposition, run: cloneWorkflowV1(run) });
}

function definitionKey(
  tenantId: string,
  processId: string,
  processVersion: string,
): string {
  return `${tenantId}\0${processId}\0${processVersion}`;
}

function runKey(tenantId: string, runId: string): string {
  return `${tenantId}\0${runId}`;
}

function operationKey(
  tenantId: string,
  kind: WorkflowOperationRecordV1["operationKind"],
  idempotencyKey: string,
): string {
  return `${tenantId}\0${kind}\0${idempotencyKey}`;
}

function signalKey(tenantId: string, runId: string, signalId: string): string {
  return `${tenantId}\0${runId}\0${signalId}`;
}

function taskRunKey(tenantId: string, taskRunId: string): string {
  return `${tenantId}\0${taskRunId}`;
}

function taskIdempotencyKey(tenantId: string, idempotencyKey: string): string {
  return `${tenantId}\0${idempotencyKey}`;
}

function taskLeaseToken(
  workerId: string,
  taskRunId: string,
  generation: number,
): string {
  return `task-lease:${digestWorkflowJsonV1(
    "task-lease",
    json({ workerId, taskRunId, generation }),
  )}`;
}

function clone<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : cloneWorkflowV1(value);
}

function cloneFrozen<T>(value: T): T {
  return deepFreezeWorkflowV1(cloneWorkflowV1(value));
}

function json(value: unknown): JsonValue {
  canonicalizeWorkflowJsonV1(value as JsonValue);
  return value as JsonValue;
}

function token(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    fail(`${label} is invalid`);
}

function time(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    fail(`${label} is invalid`);
}

function digest(
  value: unknown,
  label: string,
): asserts value is WorkflowDigestV1 {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    fail(`${label} is invalid`);
}

function conflict(message: string): never {
  throw new WorkflowValidationErrorV1(message);
}

function fail(message: string): never {
  throw new WorkflowValidationErrorV1(message);
}

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
