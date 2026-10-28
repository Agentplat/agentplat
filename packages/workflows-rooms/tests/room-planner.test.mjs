import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryWorkflowStoreV1 } from "@agentplat/workflows";
import { RoomPlannerWorkflowCalls } from "../dist/index.js";
const scope = { tenantId: "tenant", roomId: "room" };
function fixture(handler) {
  const receipts = new Map(),
    store = new InMemoryWorkflowStoreV1();
  let invocations = 0;
  const results = {
    get: async (_, id) => receipts.get(id),
    put: async (_, id, r) => {
      receipts.set(id, r);
    },
  };
  const options = {
    store,
    results,
    workerId: "one",
    assertCurrent: async () => {},
    execute: async (...args) => {
      invocations++;
      return handler(...args);
    },
  };
  return {
    options,
    store,
    get invocations() {
      return invocations;
    },
    calls: new RoomPlannerWorkflowCalls(options),
    call: { operationId: "op", assertCurrent: async () => {} },
  };
}
test("workflow attempts persist receipts and never repeat a completed model call after restart", async () => {
  const f = fixture(async () => ({
    usage: { costMicros: 1 },
    result: { content: "Report" },
  }));
  const first = await f.calls.run(scope, f.call, { kind: "task" });
  assert.deepEqual(
    await new RoomPlannerWorkflowCalls({ ...f.options, workerId: "two" }).run(
      scope,
      f.call,
      { kind: "task" },
    ),
    first,
  );
  assert.equal(f.invocations, 1);
  assert.equal(
    (await f.store.listTaskRuns({ tenantId: scope.tenantId }))[0].status,
    "completed",
  );
});

test("conversation bindings reach workflow calls and reject a replay into another thread", async () => {
  const seen = [];
  const f = fixture(async (_, __, call) => {
    seen.push({
      threadId: call.threadId,
      replyToMessageId: call.replyToMessageId,
    });
    return { usage: { costMicros: 1 }, result: { content: "Report" } };
  });
  const call = { ...f.call, threadId: "root", replyToMessageId: "prompt" };
  await f.calls.run(scope, call, { kind: "task" });
  assert.deepEqual(seen, [{ threadId: "root", replyToMessageId: "prompt" }]);
  await new RoomPlannerWorkflowCalls(f.options).run(scope, call, {
    kind: "task",
  });
  await assert.rejects(
    f.calls.run(scope, { ...call, threadId: "other" }, { kind: "task" }),
    /different input or conversation/,
  );
  assert.equal(f.invocations, 1);
});
test("ambiguous model failure remains indeterminate and cannot be replayed", async () => {
  const f = fixture(async () => {
    throw Error("Disconnected after model invocation");
  });
  await assert.rejects(f.calls.run(scope, f.call, { kind: "task" }));
  await assert.rejects(
    new RoomPlannerWorkflowCalls({ ...f.options, workerId: "two" }).run(
      scope,
      f.call,
      { kind: "task" },
    ),
  );
  assert.equal(f.invocations, 1);
  assert.equal(
    (await f.store.listTaskRuns({ tenantId: scope.tenantId }))[0].status,
    "indeterminate",
  );
});
