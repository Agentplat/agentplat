import type { JsonObject } from "@agentplat/core";
import {
  InMemoryProcessRunnerV1,
  createProcessDefinitionV1,
  createTaskDefinitionV1,
  digestWorkflowJsonV1,
  type WorkflowStoreV1,
} from "@agentplat/workflows";
import type { RoomPlannerCall, RoomPlannerScope } from "@agentplat/rooms";
import { conversationReference } from "@agentplat/rooms";

/** Persisted result owner. put must be idempotent, reject conflicting values and honor the workflow fence. */
export interface RoomPlannerWorkflowResultStore {
  put(scope: RoomPlannerScope, id: string, result: JsonObject): Promise<void>;
  get(scope: RoomPlannerScope, id: string): Promise<JsonObject | undefined>;
}
/** Adapt Planner calls to existing workflow attempt, lease and binding owners. */
export class RoomPlannerWorkflowCalls {
  readonly runner: InMemoryProcessRunnerV1;
  constructor(
    private readonly options: {
      store: WorkflowStoreV1;
      results: RoomPlannerWorkflowResultStore;
      workerId: string;
      execute(
        scope: RoomPlannerScope,
        payload: JsonObject,
        call: RoomPlannerCall,
      ): Promise<JsonObject>;
      assertCurrent(
        scope: RoomPlannerScope,
        operationId: string,
      ): Promise<void>;
      clock?: () => Date;
    },
  ) {
    this.runner = new InMemoryProcessRunnerV1(options.store, {
      workerId: options.workerId,
      taskExecutor: {
        execute: async (request) => {
          const input = request.processInput!;
          const scope = {
            tenantId: request.tenantId,
            roomId: String(input.roomId),
          };
          const id = String(input.operationId);
          // Never replay a model call after an ambiguous attempt. The result store is checked first.
          const previous = await options.results.get(scope, id);
          if (previous) return { status: "completed", resultReference: id };
          const abort = new AbortController();
          let checking: Promise<void> = Promise.resolve();
          const check = () => {
            checking = checking.then(async () => {
              if (request.signal.aborted || abort.signal.aborted)
                throw new Error("Workflow aborted");
              await options.assertCurrent(scope, id);
              if (!(await request.heartbeat({ logicalTime: this.now() })))
                throw new Error("Workflow lease lost");
            });
            return checking;
          };
          const timer = setInterval(() => {
            void check().catch((error) => abort.abort(error));
          }, 1000);
          try {
            const call: RoomPlannerCall = {
              operationId: id,
              ...conversationReference(input),
              signal: AbortSignal.any([request.signal, abort.signal]),
              assertCurrent: check,
            };
            await call.assertCurrent();
            const result = await options.execute(
              scope,
              input.payload as JsonObject,
              call,
            );
            await call.assertCurrent();
            await options.results.put(scope, id, result);
            return { status: "completed", resultReference: id };
          } catch {
            return {
              status: "indeterminate",
              reasonCode: "planner_call_requires_reconciliation",
            };
          } finally {
            clearInterval(timer);
          }
        },
      },
    });
  }
  private now() {
    return (this.options.clock?.() ?? new Date()).toISOString();
  }
  private runId(scope: RoomPlannerScope, id: string) {
    return digestWorkflowJsonV1("room-planner-call", {
      roomId: scope.roomId,
      id,
    });
  }
  async run(
    scope: RoomPlannerScope,
    call: RoomPlannerCall,
    payload: JsonObject,
  ): Promise<JsonObject> {
    const input = {
      roomId: scope.roomId,
      operationId: call.operationId,
      ...conversationReference(call),
      payload,
    };
    const existing = await this.runner.describe({
      tenantId: scope.tenantId,
      runId: this.runId(scope, call.operationId),
    });
    if (
      existing &&
      digestWorkflowJsonV1("room-planner-input", existing.input ?? null) !==
        digestWorkflowJsonV1("room-planner-input", input)
    )
      throw new Error(
        "Workflow operation identity has different input or conversation",
      );
    const saved = await this.options.results.get(scope, call.operationId);
    if (saved && call.threadId && !existing)
      throw new Error(
        "Threaded workflow result has no persisted conversation binding",
      );
    if (saved) return saved;
    if (existing)
      throw new Error(
        "Existing workflow requires reconciliation; no automatic model replay",
      );
    const task = createTaskDefinitionV1({
      taskDefinitionId: "room-planner-call",
      version: "1",
      name: "Room Planner call",
      handlerKey: "room-planner-call",
      handlerDigest: digestWorkflowJsonV1("room-planner-handler", {
        version: 1,
      }),
      effectClass: "internal",
    });
    const definition = createProcessDefinitionV1({
      processId: "room-planner-call",
      version: "1",
      name: "Room Planner call",
      stages: [
        {
          schemaVersion: 1,
          stageId: "invoke",
          name: "Invoke",
          kind: "task",
          taskDefinitionId: task.taskDefinitionId,
          taskDefinitionVersion: task.version,
          dependsOn: [],
          retryPolicy: { maximumAttempts: 1 },
        },
      ],
    });
    await this.runner.registerTaskDefinition(scope.tenantId, task);
    await this.runner.registerProcessDefinition(scope.tenantId, definition);
    const runId = this.runId(scope, call.operationId);
    await this.runner.start({
      tenantId: scope.tenantId,
      runId,
      processId: definition.processId,
      processVersion: definition.version,
      operationId: `start:${runId}`,
      idempotencyKey: `start:${runId}`,
      logicalTime: this.now(),
      input,
    });
    await call.assertCurrent();
    await this.runner.advance({
      tenantId: scope.tenantId,
      runId,
      operationId: `advance:${runId}`,
      idempotencyKey: `advance:${runId}`,
      logicalTime: this.now(),
    });
    const result = await this.options.results.get(scope, call.operationId);
    if (!result) throw new Error("Workflow result is uncertain");
    return result;
  }
  async reconcile(scope: RoomPlannerScope, operationId: string) {
    return this.options.results.get(scope, operationId);
  }
  async cancel(scope: RoomPlannerScope, operationId: string) {
    const runId = this.runId(scope, operationId);
    const run = await this.runner.describe({ tenantId: scope.tenantId, runId });
    if (run && !["completed", "failed", "canceled"].includes(run.status))
      await this.runner.cancel({
        tenantId: scope.tenantId,
        runId,
        operationId: `cancel:${runId}`,
        idempotencyKey: `cancel:${runId}`,
        reasonCode: "user_intervention",
        logicalTime: this.now(),
      });
  }
}
