import assert from "node:assert/strict";
import {
  SharedBudgetServiceV1,
  InMemorySharedBudgetStoreV1,
  runSharedBudgetCallV1,
  ScheduledFollowupServiceV1,
  InMemoryScheduledFollowupStoreV1,
} from "@agentplat/framework";

// These session identities stand in for a verified host session, never a model-supplied actor.
const sessions = new Map([
  ["owner-session", { tenantId: "demo", actorId: "owner" }],
  ["worker-session", { tenantId: "demo", actorId: "worker" }],
]);
let now = "2026-10-28T12:00:00.000Z";
const clock = () => new Date(now),
  budgetStore = new InMemorySharedBudgetStoreV1(),
  noticeStore = new InMemoryScheduledFollowupStoreV1();
const budget = new SharedBudgetServiceV1(
  budgetStore,
  {
    authenticate: async (session) => sessions.get(session) ?? null,
    authorize: async (p, r) =>
      p.tenantId === "demo" &&
      r.accountId === "shared-account" &&
      (p.actorId === "owner" ||
        (p.actorId === "worker" &&
          ["admit", "settle", "read"].includes(r.operation))),
  },
  { clock },
);
await budget.configure("owner-session", {
  accountId: "shared-account",
  id: "period",
  operationId: "configure",
  expectedRevision: null,
  currency: "USD",
  startsAt: "2026-10-01T00:00:00.000Z",
  endsAt: "2026-11-01T00:00:00.000Z",
  limitMicros: 4_000_000,
  categoryLimits: { mail: 2_000_000 },
});
const subjects = new Map([
    ["mail-obligation", 1],
    ["support-incident", 1],
  ]),
  sent = new Set();
const access = {
  authenticate: async (session) => sessions.get(session) ?? null,
  authorize: async (p, r) =>
    p.tenantId === "demo" &&
    r.roomIds.every((id) => ["mail-room", "support-room"].includes(id)) &&
    (p.actorId === "owner" ||
      (p.actorId === "worker" && r.operation !== "reconcile")),
  // Real hosts reload situation status, subject revision, membership, recipient and source permissions here.
  isCurrent: async (_, r) => subjects.get(r.subjectId) === r.subjectRevision,
};
const port = {
  deliver: async (record, call) => {
    await call.assertCurrent();
    sent.add(call.idempotencyKey);
    console.log(`${record.action.notice.title}: ${record.action.notice.body}`);
    return { receiptReference: `demo:${call.idempotencyKey}` };
  },
};
let followup = new ScheduledFollowupServiceV1(noticeStore, access, port, {
  clock,
});
let analyses = 0;
for (const [subjectId, roomId, category, title] of [
  ["mail-obligation", "mail-room", "mail", "Payment deadline today"],
  [
    "support-incident",
    "support-room",
    "coordination",
    "Incident response due today",
  ],
]) {
  const input = {
    accountId: "shared-account",
    operationId: `analysis:${subjectId}`,
    currency: "USD",
    category,
    maximumMicros: 2_000_000,
    reference: `evidence:${subjectId}`,
  };
  const invoke = async (call) => {
    await call.assertCurrent();
    analyses++;
    return {
      value: { facts: ["Confirmed due date"] },
      usage: { costMicros: 2_000_000, inputTokens: 10, outputTokens: 2 },
    };
  };
  assert.equal(
    (await runSharedBudgetCallV1(budget, "worker-session", input, invoke))
      .admission.admitted,
    true,
  );
  await runSharedBudgetCallV1(budget, "worker-session", input, invoke);
  // A Planner result supplies this prepared content once. The timestamp worker needs no model.
  await followup.replace("owner-session", {
    subjectId,
    roomId,
    subjectRevision: 1,
    operationId: `schedule:${subjectId}`,
    expectedRevision: null,
    activations: [
      {
        key: "due-today",
        at: "2026-10-28T12:01:00.000Z",
        action: {
          kind: "notice",
          notice: {
            recipientId: "owner",
            channel: "demo",
            title,
            body: "Review the confirmed obligation.",
            references: [`evidence:${subjectId}`],
          },
        },
      },
    ],
  });
}
assert.equal(analyses, 2);
assert.equal(
  (await budget.read("owner-session", "shared-account", "period")).spentMicros,
  4_000_000,
);
assert.equal(
  (
    await budget.admit("worker-session", {
      accountId: "shared-account",
      operationId: "deferred-analysis",
      currency: "USD",
      category: "coordination",
      maximumMicros: 1,
      reference: "evidence:deferred",
    })
  ).admitted,
  false,
);
now = "2026-10-28T12:01:00.000Z";
followup = new ScheduledFollowupServiceV1(noticeStore, access, port, { clock });
await followup.activateDue("worker-session", ["mail-room", "support-room"]);
await followup.drain("worker-session", ["mail-room", "support-room"]);
await followup.drain("worker-session", ["mail-room", "support-room"]);
assert.equal(sent.size, 2);
console.log(
  "Two consumers, one shared cost account, two prepared notices after model budget exhaustion. No provider or paid model was used.",
);
