import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryWorkflowStoreV1 } from "@agentplat/workflows";
import { RoomPlannerWorkflowCalls } from "@agentplat/workflows-rooms";
import {
  InMemorySharedBudgetStoreV1,
  InMemoryScheduledFollowupStoreV1,
  runSharedBudgetCallV1,
} from "@agentplat/rooms";
import { operationsFixture } from "./helpers/planner-operations-scenarios.mjs";

test("workflow and evidence jobs compose the same budget boundary and stored workflow results replay without another charge", async () => {
  const f = operationsFixture({
    budget: new InMemorySharedBudgetStoreV1(),
    followup: new InMemoryScheduledFollowupStoreV1(),
  });
  await f.budget.configure(f.owner, f.period());
  const workflowStore = new InMemoryWorkflowStoreV1(),
    receipts = new Map(),
    scope = { tenantId: "tenant", roomId: "room" };
  let invocations = 0;
  const options = {
    store: workflowStore,
    workerId: "worker",
    clock: f.options.clock,
    assertCurrent: async () => {},
    results: {
      get: async (_, id) => receipts.get(id),
      put: async (_, id, r) => {
        receipts.set(id, r);
      },
    },
    execute: async (_, payload, call) => {
      const result = await runSharedBudgetCallV1(
        f.budget,
        f.worker,
        f.call(call.operationId, { category: "specialist" }),
        async (budgetCall) => {
          await call.assertCurrent();
          await budgetCall.assertCurrent();
          invocations++;
          return {
            value: {
              content: "Stored report",
              usage: { costMicros: 2, inputTokens: 10, outputTokens: 2 },
            },
            usage: { costMicros: 2, inputTokens: 10, outputTokens: 2 },
          };
        },
      );
      assert.equal(result.admission.admitted, true);
      return result.value;
    },
  };
  const call = {
    operationId: "workflow-job",
    threadId: "thread",
    assertCurrent: async () => {},
  };
  const first = await new RoomPlannerWorkflowCalls(options).run(scope, call, {
    kind: "task",
  });
  const second = await new RoomPlannerWorkflowCalls({
    ...options,
    workerId: "restarted",
  }).run(scope, call, { kind: "task" });
  assert.deepEqual(second, first);
  assert.equal(invocations, 1);
  const evidence = await runSharedBudgetCallV1(
    f.budget,
    f.worker,
    f.call("evidence-job"),
    async () => ({
      value: "Facts",
      usage: { costMicros: 3, inputTokens: 10, outputTokens: 2 },
    }),
  );
  assert.equal(evidence.admission.admitted, true);
  const period = await f.budget.read(f.owner, "pilot", "october");
  assert.equal(period.spentMicros, 5);
  assert.equal(period.heldMicros, 0);
  assert.equal(period.categories.specialist.spentMicros, 2);
  assert.equal(period.categories.mail.spentMicros, 3);
});
