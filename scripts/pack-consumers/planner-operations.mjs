import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  SharedBudgetServiceV1,
  ScheduledFollowupServiceV1,
  createRoomPlannerSharedBudgetV1,
  createRoomPlannerNoticeDeliveryV1,
} from "@agentplat/framework";
import {
  createAgentRoomPlanner,
  RoomService,
  resolveRoomConversation,
} from "@agentplat/rooms";
import {
  createPostgresPool,
  runMigrations,
  PostgresRoomRepository,
  PostgresRoomPlannerStore,
  PostgresRoomPlannerCallResults,
  PostgresSharedBudgetStoreV1,
  PostgresScheduledFollowupStoreV1,
  runPlannerOperationsMigrations,
  getPlannerOperationsMigrationStatus,
} from "@agentplat/rooms-postgres";
import {
  runMigrations as workflowMigrations,
  PostgresWorkflowStoreV1,
} from "@agentplat/workflows-postgres";
import { RoomPlannerWorkflowCalls } from "@agentplat/workflows-rooms";

assert.equal(process.env.AGENTPLAT_POSTGRES_TEST, "1");
const entry = import.meta.resolve("@agentplat/rooms-postgres");
for (const direction of ["up", "down"])
  assert.ok(
    (
      await readFile(
        new URL(
          `../migrations/planner-operations/001_planner_operations.${direction}.sql`,
          entry,
        ),
        "utf8",
      )
    ).length,
  );
const schema = `operations_consumer_${randomUUID().replaceAll("-", "")}`,
  owner = { tenantId: "consumer", actorId: "owner" },
  worker = { tenantId: "consumer", actorId: "worker" };
let pool = createPostgresPool(),
  now = "2026-10-28T12:00:00.000Z",
  modelCalls = 0,
  failAcknowledgement = true;
const clock = () => new Date(now),
  received = new Set(),
  subjects = new Map([["case", 1]]),
  rooms = new Set();
const budgetAccess = {
  authenticate: async (c) => c ?? null,
  authorize: async (p, r) =>
    p.tenantId === "consumer" &&
    r.accountId === "one-account" &&
    (p.actorId === "owner" ||
      (p.actorId === "worker" &&
        ["read", "admit", "settle"].includes(r.operation))),
};
const noticeAccess = {
  authenticate: async (c) => c ?? null,
  authorize: async (p, r) =>
    p.tenantId === "consumer" &&
    r.roomIds.every((id) => rooms.has(id)) &&
    (p.actorId === "owner" ||
      (p.actorId === "worker" && r.operation !== "reconcile")),
  isCurrent: async (_, r) =>
    subjects.get(r.subjectId) === r.subjectRevision && rooms.has(r.roomId),
};
const port = {
  deliver: async (r, call) => {
    await call.assertCurrent();
    received.add(call.idempotencyKey);
    if (failAcknowledgement) {
      failAcknowledgement = false;
      throw new Error("Adapter acknowledgement unknown");
    }
    return { receiptReference: `adapter:${r.id}` };
  },
};
const components = () => ({
  budget: new SharedBudgetServiceV1(
    new PostgresSharedBudgetStoreV1(pool, { schema }),
    budgetAccess,
    { clock },
  ),
  followup: new ScheduledFollowupServiceV1(
    new PostgresScheduledFollowupStoreV1(pool, { schema }),
    noticeAccess,
    port,
    { clock },
  ),
});
try {
  await runMigrations(pool, { schema, createSchema: true });
  await workflowMigrations(pool, { schema });
  await runPlannerOperationsMigrations(pool, { schema });
  assert.deepEqual(
    (await getPlannerOperationsMigrationStatus(pool, { schema }))
      .pendingVersions,
    [],
  );
  const roomService = new RoomService({
      repository: new PostgresRoomRepository(pool, { schema }),
    }),
    room = await roomService.createRoom("consumer", {
      title: "Urgent matters",
    goal: "Verify shared cost admission and prepared reminders",
    });
  rooms.add(room.id);
  const root = await roomService.sendMessage("consumer", room.id, {
    id: "root",
    role: "human",
    content: "Review this situation",
    startThread: true,
  });
  const scope = { tenantId: "consumer", roomId: room.id };
  let c = components();
  await c.budget.configure(owner, {
    accountId: "one-account",
    id: "october",
    operationId: "configure-october",
    expectedRevision: null,
    currency: "USD",
    startsAt: "2026-10-01T00:00:00.000Z",
    endsAt: "2026-11-01T00:00:00.000Z",
    limitMicros: 10,
    categoryLimits: { reason: 10 },
  });
  const createPlanner = () => {
    c = components();
    const results = new PostgresRoomPlannerCallResults(pool, { schema });
    let instance;
    const workflow = new RoomPlannerWorkflowCalls({
      store: new PostgresWorkflowStoreV1(pool, { schema }),
      results,
      workerId: "worker",
      clock,
      assertCurrent: (scope, id) => instance.assertCurrent(scope, id),
      execute: async (_, payload, call) => {
        await call.assertCurrent();
        modelCalls++;
        return {
          proposal: {
            kind: "respond",
            content: "Payment deadline today. Confirm the prepared payment.",
          },
          usage: { costMicros: 10, inputTokens: 10, outputTokens: 2 },
        };
      },
    });
    instance = createAgentRoomPlanner({
      store: new PostgresRoomPlannerStore(pool, { schema }),
      clock,
      reservationMicros: { reason: 10, task: 10, review: 10, direct: 10 },
      authorize: async () => {},
      sharedBudget: createRoomPlannerSharedBudgetV1({
        service: c.budget,
        bindingId: "one-account-v1",
        currency: "USD",
        context: async () => worker,
        accountId: () => "one-account",
        category: (_, op) => op.kind,
      }),
      resolveEvent: async () => ({
        id: "prompt",
        messageId: root.id,
        threadId: root.id,
        kind: "message",
        actorId: "owner",
        content: "Review this situation",
      }),
      resolveConversation: (_, ref) =>
        resolveRoomConversation(
          new PostgresRoomRepository(pool, { schema }),
          "consumer",
          room.id,
          ref,
        ),
      context: async () => ({}),
      route: async () => [],
      reasoner: {
        propose: async (_, call) =>
          workflow.run(scope, call, { kind: "reason" }),
      },
      execute: async () => {
        throw new Error("No task expected");
      },
      verify: async () => {
        throw new Error("No review expected");
      },
      reconcile: (_, op) => results.get(scope, op.id),
      deliver: createRoomPlannerNoticeDeliveryV1({
        service: c.followup,
        context: async () => worker,
        prepare: async (_, note) => ({
          subjectId: "case",
          subjectRevision: 1,
          key: "planner-answer",
          notice: {
            recipientId: "owner",
            channel: "test",
            title: "Payment deadline today",
            body: note.content,
            threadId: root.id,
            replyToMessageId: root.id,
            references: ["evidence:payment"],
          },
        }),
      }),
    });
    return instance;
  };
  let planner = createPlanner();
  await planner.configure(scope, { mode: "execute", budgetLimitMicros: 1000 });
  await planner.acceptEvent(scope, "prompt");
  await planner.runOnce(scope);
  await planner.runOnce(scope);
  assert.equal(modelCalls, 1);
  const [queued] = (
    await c.followup.list(worker, [room.id], { status: "pending" })
  ).items;
  assert.ok(queued);
  await c.followup.drain(worker, [room.id]);
  assert.equal((await c.followup.read(owner, queued.id)).status, "uncertain");
  // New pools/process objects retain the same account, workflow result and unknown delivery.
  await pool.end();
  pool = createPostgresPool();
  planner = createPlanner();
  await planner.runOnce(scope);
  await c.followup.drain(worker, [room.id]);
  assert.equal(modelCalls, 1);
  assert.equal(received.size, 1);
  const unknown = await c.followup.read(owner, queued.id);
  await c.followup.reconcile(owner, unknown.id, {
    operationId: "adapter-query",
    expectedRevision: unknown.revision,
    proofRefs: ["adapter:confirmed-id"],
    outcome: { kind: "delivered", receiptReference: `adapter:${unknown.id}` },
  });
  const period = await c.budget.read(owner, "one-account", "october");
  assert.equal(period.spentMicros, 10);
  assert.equal(period.heldMicros, 0);
  await c.followup.replace(owner, {
    subjectId: "case",
    subjectRevision: 1,
    roomId: room.id,
    expectedRevision: null,
    operationId: "reminder",
    activations: [
      {
        key: "due",
        at: "2026-10-28T12:01:00.000Z",
        action: {
          kind: "notice",
          notice: {
            recipientId: "owner",
            channel: "test",
            title: "Payment deadline today",
            body: "Review the confirmed obligation.",
            threadId: root.id,
            references: ["evidence:payment"],
          },
        },
      },
    ],
  });
  now = "2026-10-28T12:01:00.000Z";
  await c.followup.activateDue(worker, [room.id]);
  await c.followup.drain(worker, [room.id]);
  await c.followup.drain(worker, [room.id]);
  assert.equal(received.size, 2);
  assert.equal(modelCalls, 1);
  assert.equal(
    (await c.budget.read(owner, "one-account", "october")).spentMicros,
    10,
  );
  console.log(
    "Planner operations packed consumer passed shared cost admission, workflow receipts, native threads, prepared notices, exhausted-budget delivery and new-pool reconciliation.",
  );
} finally {
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await pool.end();
}
