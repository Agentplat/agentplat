import assert from "node:assert/strict";
import {
  SharedBudgetServiceV1,
  SharedBudgetCallErrorV1,
  runSharedBudgetCallV1,
  ScheduledFollowupServiceV1,
  scheduledPlannerEventV1,
} from "@agentplat/rooms";

const owner = { tenantId: "tenant", actorId: "owner" },
  worker = { tenantId: "tenant", actorId: "worker" };
const usage = (costMicros) => ({
  costMicros,
  inputTokens: 10,
  outputTokens: 2,
});
export function operationsFixture(stores) {
  let now = "2026-10-28T12:00:00.000Z",
    enabled = true,
    failSend = false;
  const subject = new Map([["case", 1]]),
    deliveries = [];
  const access = {
    authenticate: async (p) => p ?? null,
    authorize: async (p, r) =>
      enabled &&
      r.accountId === "pilot" &&
      (p.actorId === "owner" ||
        (p.actorId === "worker" &&
          !["configure", "reconcile"].includes(r.operation))),
  };
  const noticeAccess = {
    authenticate: async (p) => p ?? null,
    authorize: async (p, r) =>
      enabled &&
      r.roomIds.every((id) => ["room", "other"].includes(id)) &&
      (p.actorId === "owner" ||
        (p.actorId === "worker" && r.operation !== "reconcile")),
    isCurrent: async (p, r) =>
      enabled &&
      p.tenantId === "tenant" &&
      subject.get(r.subjectId) === r.subjectRevision,
  };
  const options = { clock: () => new Date(now) };
  const port = {
    deliver: async (record, call) => {
      await call.assertCurrent();
      deliveries.push({ record, key: call.idempotencyKey });
      if (failSend) throw new Error("Transport acknowledgement lost");
      return { receiptReference: `adapter:${record.id}` };
    },
  };
  const budget = new SharedBudgetServiceV1(stores.budget, access, options);
  const followup = new ScheduledFollowupServiceV1(
    stores.followup,
    noticeAccess,
    port,
    options,
  );
  const period = (more = {}) => ({
    accountId: "pilot",
    id: "october",
    operationId: "configure-october",
    expectedRevision: null,
    currency: "USD",
    startsAt: "2026-10-01T03:00:00.000Z",
    endsAt: "2026-11-01T03:00:00.000Z",
    limitMicros: 15,
    categoryLimits: { mail: 12 },
    ...more,
  });
  const call = (operationId, more = {}) => ({
    accountId: "pilot",
    operationId,
    currency: "USD",
    category: "mail",
    maximumMicros: 10,
    reference: `evidence:${operationId}`,
    ...more,
  });
  const notice = {
    recipientId: "owner",
    channel: "push",
    title: "Tax deadline today",
    body: "Review the confirmed payment due today.",
    actionLabel: "Open situation",
    threadId: "thread",
    replyToMessageId: "message",
    references: ["evidence:tax"],
  };
  const plan = (more = {}) => ({
    subjectId: "case",
    subjectRevision: 1,
    roomId: "room",
    operationId: "schedule-1",
    expectedRevision: null,
    activations: [{ key: "due", at: now, action: { kind: "notice", notice } }],
    ...more,
  });
  return {
    stores,
    owner,
    worker,
    access,
    noticeAccess,
    options,
    port,
    budget,
    followup,
    period,
    call,
    notice,
    plan,
    subject,
    deliveries,
    setTime: (v) => {
      now = v;
    },
    disable: () => {
      enabled = false;
    },
    enable: () => {
      enabled = true;
    },
    failSend: (v) => {
      failSend = v;
    },
    reopen: () => ({
      budget: new SharedBudgetServiceV1(stores.budget, access, options),
      followup: new ScheduledFollowupServiceV1(
        stores.followup,
        noticeAccess,
        port,
        options,
      ),
    }),
  };
}

export async function plannerOperationsScenarios(t, setup) {
  const scenarios = {
    async "an immediate duplicate cannot bring forward an already scheduled future milestone"(
      f,
    ) {
      await f.followup.replace(
        owner,
        f.plan({
          activations: [
            {
              key: "future",
              at: "2026-10-29T12:00:00.000Z",
              action: { kind: "notice", notice: f.notice },
            },
          ],
        }),
      );
      const receipt = await f.followup.enqueue(owner, {
        subjectId: "case",
        subjectRevision: 1,
        roomId: "room",
        key: "future",
        notice: f.notice,
      });
      assert.equal(receipt.availableAt, "2026-10-29T12:00:00.000Z");
      await f.followup.drain(worker, ["room"]);
      assert.equal(f.deliveries.length, 0);
      f.setTime("2026-10-29T12:00:00.000Z");
      await f.followup.activateDue(worker, ["room"]);
      await f.followup.drain(worker, ["room"]);
      assert.equal(f.deliveries.length, 1);
    },
    async "unavailable subject checks back off per item without starving other activations or deliveries"(
      f,
    ) {
      f.subject.set("next", 1);
      const original = f.noticeAccess.isCurrent;
      f.noticeAccess.isCurrent = async (p, r) => {
        if (r.subjectId === "case")
          throw new Error("Subject storage temporarily unavailable");
        return original(p, r);
      };
      await f.followup.replace(owner, f.plan());
      await f.followup.replace(
        owner,
        f.plan({
          subjectId: "next",
          operationId: "next-schedule",
          activations: [
            {
              key: "due",
              at: "2026-10-28T12:00:00.001Z",
              action: { kind: "notice", notice: f.notice },
            },
          ],
        }),
      );
      f.setTime("2026-10-28T12:00:01.000Z");
      const blocked = await f.followup.activateDue(worker, ["room"], 1);
      assert.equal(blocked.failed.length, 1);
      assert.equal(
        (await f.reopen().followup.activateDue(worker, ["room"], 1)).queued,
        1,
      );
      await f.followup.drain(worker, ["room"]);
      assert.equal(f.deliveries.length, 1);
      f.noticeAccess.isCurrent = original;
      await f.followup.enqueue(owner, {
        subjectId: "case",
        subjectRevision: 1,
        roomId: "room",
        key: "direct-old",
        notice: f.notice,
      });
      f.setTime("2026-10-28T12:00:01.001Z");
      await f.followup.enqueue(owner, {
        subjectId: "next",
        subjectRevision: 1,
        roomId: "room",
        key: "direct-new",
        notice: f.notice,
      });
      f.noticeAccess.isCurrent = async (p, r) => {
        if (r.subjectId === "case") throw new Error("Still unavailable");
        return original(p, r);
      };
      assert.equal(
        (await f.followup.drain(worker, ["room"], 1)).failed.length,
        1,
      );
      await f.reopen().followup.drain(worker, ["room"], 1);
      assert.equal(f.deliveries.length, 2);
    },
    async "notice discovery is bounded and its cursor binds Room set, tenant and status"(
      f,
    ) {
      for (const key of ["one", "two", "three"])
        await f.followup.enqueue(owner, {
          subjectId: "case",
          subjectRevision: 1,
          roomId: "room",
          key,
          notice: f.notice,
        });
      const first = await f.followup.list(owner, ["room"], {
        status: "pending",
        limit: 2,
      });
      assert.equal(first.items.length, 2);
      assert.ok(first.cursor);
      const last = await f.followup.list(owner, ["room"], {
        status: "pending",
        limit: 2,
        cursor: first.cursor,
      });
      assert.equal(last.items.length, 1);
      assert.equal(last.cursor, undefined);
      assert.equal(
        new Set([...first.items, ...last.items].map((r) => r.id)).size,
        3,
      );
      for (const [context, rooms, input] of [
        [owner, ["other"], { status: "pending" }],
        [owner, ["room"], { status: "uncertain" }],
        [{ ...owner, tenantId: "foreign" }, ["room"], { status: "pending" }],
      ])
        await assert.rejects(
          f.followup.list(context, rooms, { ...input, cursor: first.cursor }),
        );
    },
    async "an expired in-flight delivery lease never permits a second send"(f) {
      let entered, release;
      const started = new Promise((r) => {
          entered = r;
        }),
        acknowledged = new Promise((r) => {
          release = r;
        });
      let sends = 0;
      const service = new ScheduledFollowupServiceV1(
        f.stores.followup,
        f.noticeAccess,
        {
          deliver: async (_, call) => {
            await call.assertCurrent();
            sends++;
            entered();
            await acknowledged;
            return { receiptReference: "adapter:late-receipt" };
          },
        },
        f.options,
      );
      const queued = await service.enqueue(owner, {
        subjectId: "case",
        subjectRevision: 1,
        roomId: "room",
        key: "expired",
        notice: f.notice,
      });
      const sending = service.deliver(worker, queued.id);
      await started;
      f.setTime("2026-10-28T12:01:01.000Z");
      await f.reopen().followup.drain(worker, ["room"]);
      assert.equal(
        (await f.followup.read(owner, queued.id)).status,
        "uncertain",
      );
      release();
      await assert.rejects(sending);
      await f.followup.drain(worker, ["room"]);
      assert.equal(sends, 1);
    },
    async "budget currency, receipt pages and tenant-bound cursors preserve the admission boundary"(
      f,
    ) {
      await f.budget.configure(owner, f.period());
      assert.equal(
        (
          await f.budget.admit(
            worker,
            f.call("wrong-currency", { currency: "EUR" }),
          )
        ).reason,
        "currency_mismatch",
      );
      await assert.rejects(
        f.budget.admit(
          { ...worker, tenantId: "foreign" },
          f.call("wrong-tenant"),
          "tenant",
        ),
      );
      for (const id of ["a", "z", "é", "📩"])
        await f.budget.admit(worker, f.call(id, { maximumMicros: 1 }));
      const first = await f.budget.reservations(owner, "pilot", "october", {
        limit: 2,
      });
      assert.deepEqual(
        first.items.map((r) => r.operationId),
        ["a", "z"],
      );
      assert.ok(first.cursor);
      const second = await f.budget.reservations(owner, "pilot", "october", {
        limit: 2,
        cursor: first.cursor,
      });
      assert.deepEqual(
        second.items.map((r) => r.operationId),
        ["é", "📩"],
      );
      assert.equal(second.cursor, undefined);
      await assert.rejects(
        f.budget.reservations(owner, "pilot", "november", {
          cursor: first.cursor,
        }),
      );
      await assert.rejects(
        f.budget.reservations(
          { ...owner, tenantId: "foreign" },
          "pilot",
          "october",
          { cursor: first.cursor },
        ),
      );
    },
    async "concurrent admissions share total capacity and category sublimits without double charging"(
      f,
    ) {
      await f.budget.configure(owner, f.period());
      const results = await Promise.all(
        ["mail-a", "mail-b", "mail-c"].map((id) =>
          f.budget.admit(worker, f.call(id, { maximumMicros: 12 })),
        ),
      );
      assert.equal(results.filter((r) => r.admitted).length, 1);
      assert.equal(
        (await f.budget.read(owner, "pilot", "october")).heldMicros,
        12,
      );
      assert.equal(
        (
          await f.budget.admit(
            worker,
            f.call("blocked-category", { maximumMicros: 1 }),
          )
        ).reason,
        "category_limit",
      );
      const coordination = await f.budget.admit(
        worker,
        f.call("coordination", { category: "planner", maximumMicros: 3 }),
      );
      assert.equal(coordination.admitted, true);
      const known = results.find((r) => r.admitted).reservation;
      await Promise.all(
        [1, 2].map(() => f.budget.settle(worker, known, usage(8))),
      );
      const state = await f.reopen().budget.read(owner, "pilot", "october");
      assert.equal(state.spentMicros, 8);
      assert.equal(state.heldMicros, 3);
      assert.equal(state.categories.mail.spentMicros, 8);
      await assert.rejects(f.budget.settle(worker, known, usage(9)));
      assert.equal(
        (
          await f.budget.admit(
            worker,
            f.call(known.operationId, { maximumMicros: 12 }),
          )
        ).reason,
        "already_admitted",
      );
      await assert.rejects(
        f.budget.admit(
          worker,
          f.call(known.operationId, { maximumMicros: 11 }),
        ),
      );
    },
    async "a new period does not reset old identities or release uncertain previous-period reservations"(
      f,
    ) {
      await f.budget.configure(owner, f.period());
      const admitted = await f.budget.admit(worker, f.call("old"));
      await f.budget.uncertain(worker, admitted.reservation);
      await f.budget.configure(
        owner,
        f.period({
          id: "november",
          operationId: "configure-november",
          startsAt: "2026-11-01T03:00:00.000Z",
          endsAt: "2026-12-01T03:00:00.000Z",
        }),
      );
      f.setTime("2026-11-01T02:59:59.999Z");
      assert.equal(
        (await f.budget.admit(worker, f.call("last-october"))).reason,
        "total_limit",
      );
      f.setTime("2026-11-01T03:00:00.000Z");
      assert.equal(
        (await f.reopen().budget.admit(worker, f.call("old"))).reason,
        "already_admitted",
      );
      const next = await f.budget.admit(worker, f.call("new"));
      assert.equal(next.reservation.periodId, "november");
      await f.budget.reconcile(owner, "pilot", "old", {
        proofRefs: ["provider:confirmed-usage"],
        outcome: { kind: "spent", usage: usage(6) },
      });
      await f.budget.settle(worker, admitted.reservation, usage(6));
      assert.equal(
        (await f.budget.read(owner, "pilot", "october")).spentMicros,
        6,
      );
      assert.equal(
        (await f.budget.read(owner, "pilot", "november")).spentMicros,
        0,
      );
      assert.equal(
        (await f.budget.read(owner, "pilot", "november")).heldMicros,
        10,
      );
    },
    async "known failures are charged and uncertain effects cannot automatically run again"(
      f,
    ) {
      await f.budget.configure(owner, f.period());
      let calls = 0;
      await assert.rejects(
        runSharedBudgetCallV1(
          f.budget,
          worker,
          f.call("known-error"),
          async () => {
            calls++;
            throw new SharedBudgetCallErrorV1(
              "Invalid output with known usage",
              usage(2),
            );
          },
        ),
      );
      assert.equal(
        (await f.budget.read(owner, "pilot", "october")).spentMicros,
        2,
      );
      await assert.rejects(
        runSharedBudgetCallV1(f.budget, worker, f.call("unknown"), async () => {
          calls++;
          throw new Error("Provider outcome unknown");
        }),
      );
      assert.equal(
        (await f.budget.read(owner, "pilot", "october")).heldMicros,
        10,
      );
      await runSharedBudgetCallV1(
        f.reopen().budget,
        worker,
        f.call("unknown"),
        async () => {
          calls++;
          return { value: 1, usage: usage(1) };
        },
      );
      assert.equal(calls, 2);
      await assert.rejects(
        f.budget.reconcile(worker, "pilot", "unknown", {
          proofRefs: ["guess"],
          outcome: { kind: "not_started" },
        }),
      );
      await assert.rejects(
        f.budget.reconcile(owner, "pilot", "unknown", {
          proofRefs: [],
          outcome: { kind: "not_started" },
        }),
      );
      await f.budget.reconcile(owner, "pilot", "unknown", {
        proofRefs: ["provider:verified-not-invoked"],
        outcome: { kind: "not_started" },
      });
      assert.equal(
        (await f.budget.read(owner, "pilot", "october")).heldMicros,
        0,
      );
      assert.equal(
        (await f.budget.admit(worker, f.call("unknown"))).admitted,
        false,
      );
    },
    async "configuration is revisioned and cannot erase reservations; overrun charges actual cost and stops admissions"(
      f,
    ) {
      const config = f.period();
      await f.budget.configure(owner, config);
      assert.equal((await f.budget.configure(owner, config)).revision, 1);
      await assert.rejects(
        f.budget.configure(
          owner,
          f.period({ operationId: "overlap", id: "overlap" }),
        ),
      );
      const admitted = await f.budget.admit(worker, f.call("overrun"));
      await assert.rejects(
        f.budget.configure(
          owner,
          f.period({
            operationId: "lower",
            expectedRevision: 1,
            limitMicros: 9,
          }),
        ),
      );
      await f.budget.settle(worker, admitted.reservation, usage(13));
      const state = await f.budget.read(owner, "pilot", "october");
      assert.equal(state.spentMicros, 13);
      assert.equal(state.overrun, true);
      assert.equal(state.heldMicros, 0);
      assert.equal(
        (
          await f.budget.admit(
            worker,
            f.call("blocked", { maximumMicros: 1, category: "planner" }),
          )
        ).reason,
        "overrun",
      );
      await f.budget.configure(
        owner,
        f.period({
          operationId: "acknowledge-pricing",
          expectedRevision: 1,
          limitMicros: 20,
          categoryLimits: { mail: 20 },
          acknowledgeOverrunRefs: ["owner:updated-tariff-and-limits"],
        }),
      );
      assert.equal(
        (
          await f.budget.admit(
            worker,
            f.call("after-review", { maximumMicros: 1 }),
          )
        ).admitted,
        true,
      );
    },
    async "budget authority is independent of payload tenant, category names and a stale lease"(
      f,
    ) {
      await f.budget.configure(owner, f.period());
      await assert.rejects(f.budget.configure(worker, f.period({ id: "no" })));
      assert.equal(
        await f.budget.read(
          { ...owner, tenantId: "foreign" },
          "pilot",
          "october",
        ),
        undefined,
      );
      const admitted = await f.budget.admit(worker, {
        ...f.call("safe", { category: "__proto__", maximumMicros: 1 }),
        tenantId: "foreign",
      });
      assert.equal(admitted.reservation.tenantId, "tenant");
      assert.equal(
        Object.getPrototypeOf(
          (await f.budget.read(owner, "pilot", "october")).categories,
        ),
        Object.prototype,
      );
      await assert.rejects(f.budget.assertCurrent(owner, admitted.reservation));
      f.setTime("2026-10-28T12:06:00.000Z");
      await assert.rejects(
        f.budget.assertCurrent(worker, admitted.reservation),
      );
      assert.equal(
        (await f.budget.read(owner, "pilot", "october")).heldMicros,
        1,
      );
      f.disable();
      await assert.rejects(
        f.budget.settle(worker, admitted.reservation, usage(1)),
      );
    },
    async "coincident milestones, worker races and immediate Master/Room duplicates produce one prepared delivery"(
      f,
    ) {
      const input = f.plan();
      input.activations.push(structuredClone(input.activations[0]));
      await f.followup.replace(owner, input);
      const activated = await Promise.all(
        [f.followup, f.reopen().followup].map((s) =>
          s.activateDue(worker, ["room"]),
        ),
      );
      assert.equal(
        activated.reduce((n, r) => n + r.queued, 0),
        1,
      );
      const immediate = await f.followup.enqueue(worker, {
        subjectId: "case",
        subjectRevision: 1,
        roomId: "room",
        key: "due",
        notice: f.notice,
      });
      await Promise.all(
        [f.followup, f.reopen().followup].map((s) => s.drain(worker, ["room"])),
      );
      assert.equal(f.deliveries.length, 1);
      assert.equal(f.deliveries[0].key, immediate.id);
      assert.equal(
        f.deliveries[0].record.action.notice.title,
        "Tax deadline today",
      );
      assert.equal(
        (await f.reopen().followup.read(owner, immediate.id)).status,
        "delivered",
      );
      assert.equal(
        (
          await f.followup.enqueue(owner, {
            subjectId: "case",
            subjectRevision: 1,
            roomId: "room",
            key: "due",
            notice: f.notice,
          })
        ).id,
        immediate.id,
      );
      await assert.rejects(
        f.followup.enqueue(owner, {
          subjectId: "case",
          subjectRevision: 1,
          roomId: "room",
          key: "due",
          notice: { ...f.notice, title: "Different" },
        }),
      );
      assert.equal(f.deliveries[0].record.action.notice.threadId, "thread");
    },
    async "new subject revisions cancel queued and future reminders; postponement creates a new dated intent"(
      f,
    ) {
      await f.followup.replace(owner, f.plan());
      await f.followup.activateDue(worker, ["room"]);
      f.subject.set("case", 2);
      await f.followup.replace(
        owner,
        f.plan({
          operationId: "postpone",
          expectedRevision: 1,
          subjectRevision: 2,
          activations: [
            {
              key: "due",
              at: "2026-10-29T12:00:00.000Z",
              action: { kind: "notice", notice: f.notice },
            },
          ],
        }),
      );
      await f.followup.drain(worker, ["room"]);
      assert.equal(f.deliveries.length, 0);
      assert.equal((await f.followup.activateDue(worker, ["room"])).queued, 0);
      f.setTime("2026-10-29T12:00:00.000Z");
      assert.equal((await f.followup.activateDue(worker, ["room"])).queued, 1);
      f.subject.set("case", 3);
      await f.followup.replace(
        owner,
        f.plan({
          operationId: "resolved",
          expectedRevision: 2,
          subjectRevision: 3,
          activations: [],
        }),
      );
      await f.followup.drain(worker, ["room"]);
      assert.equal(f.deliveries.length, 0);
      await assert.rejects(
        f.followup.replace(
          owner,
          f.plan({
            operationId: "stale",
            expectedRevision: 3,
            subjectRevision: 2,
          }),
        ),
      );
    },
    async "an unchanged subject extends its reminder horizon without redoing or invalidating existing milestones"(
      f,
    ) {
      await f.followup.replace(owner, f.plan());
      await f.followup.activateDue(worker, ["room"]);
      const extension = f.plan({
        operationId: "extend-horizon",
        expectedRevision: 1,
        activations: [
          {
            key: "tomorrow",
            at: "2026-10-29T12:00:00.000Z",
            action: { kind: "notice", notice: f.notice },
          },
        ],
      });
      assert.equal((await f.followup.extend(owner, extension)).revision, 1);
      assert.equal((await f.followup.extend(owner, extension)).revision, 1);
      await f.followup.drain(worker, ["room"]);
      assert.equal(f.deliveries.length, 1);
      f.setTime("2026-10-29T12:00:00.000Z");
      await f.followup.activateDue(worker, ["room"]);
      await f.followup.drain(worker, ["room"]);
      assert.equal(f.deliveries.length, 2);
      await assert.rejects(
        f.followup.extend(owner, {
          ...extension,
          operationId: "rewrite-milestone",
          activations: [
            { ...extension.activations[0], at: "2026-10-30T12:00:00.000Z" },
          ],
        }),
      );
    },
    async "a lost acknowledgement after the adapter effect does not send the notice again after restart"(
      f,
    ) {
      let loseAck = true;
      const store = {
        ...f.stores.followup,
        due: f.stores.followup.due.bind(f.stores.followup),
        pending: f.stores.followup.pending.bind(f.stores.followup),
        delivery: f.stores.followup.delivery.bind(f.stores.followup),
        transaction: (scope, work) =>
          f.stores.followup.transaction(scope, (tx) =>
            work({
              ...tx,
              putDelivery: async (record) => {
                if (loseAck && record.status === "delivered") {
                  loseAck = false;
                  throw new Error("Lost local acknowledgement");
                }
                return tx.putDelivery(record);
              },
            }),
          ),
      };
      const crashing = new ScheduledFollowupServiceV1(
          store,
          f.noticeAccess,
          f.port,
          f.options,
        ),
        queued = await crashing.enqueue(owner, {
          subjectId: "case",
          subjectRevision: 1,
          roomId: "room",
          key: "ack-gap",
          notice: f.notice,
        });
      await crashing.drain(worker, ["room"]);
      assert.equal(f.deliveries.length, 1);
      const saved = await f.reopen().followup.read(owner, queued.id);
      assert.equal(saved.status, "uncertain");
      await f.followup.drain(worker, ["room"]);
      assert.equal(f.deliveries.length, 1);
      await f.followup.reconcile(owner, queued.id, {
        operationId: "adapter-proof",
        expectedRevision: saved.revision,
        proofRefs: ["adapter:receipt"],
        outcome: { kind: "delivered", receiptReference: "adapter:receipt" },
      });
      await f.followup.drain(worker, ["room"]);
      assert.equal(f.deliveries.length, 1);
    },
    async "uncertain adapter outcomes retain identity, need verified reconciliation, and do not block other deliveries"(
      f,
    ) {
      f.failSend(true);
      const first = await f.followup.enqueue(owner, {
        subjectId: "case",
        subjectRevision: 1,
        roomId: "room",
        key: "first",
        notice: f.notice,
      });
      await f.followup.drain(worker, ["room"]);
      assert.equal(
        (await f.followup.read(owner, first.id)).status,
        "uncertain",
      );
      await f.reopen().followup.drain(worker, ["room"]);
      assert.equal(f.deliveries.length, 1);
      f.failSend(false);
      await f.followup.enqueue(owner, {
        subjectId: "case",
        subjectRevision: 1,
        roomId: "room",
        key: "second",
        notice: f.notice,
      });
      await f.followup.drain(worker, ["room"]);
      assert.equal(f.deliveries.length, 2);
      const uncertain = await f.followup.read(owner, first.id),
        reconciliation = {
          operationId: "provider-receipt",
          expectedRevision: uncertain.revision,
          proofRefs: ["adapter:confirmed"],
          outcome: { kind: "delivered", receiptReference: "adapter:known" },
        };
      await assert.rejects(
        f.followup.reconcile(worker, first.id, reconciliation),
      );
      const settled = await f.followup.reconcile(
        owner,
        first.id,
        reconciliation,
      );
      assert.equal(settled.status, "delivered");
      assert.equal(
        (await f.followup.reconcile(owner, first.id, reconciliation)).revision,
        settled.revision,
      );
      await f.followup.drain(worker, ["room"]);
      assert.equal(f.deliveries.length, 2);
    },
    async "verified non-delivery retries only after its persisted delay and checks permissions again"(
      f,
    ) {
      f.failSend(true);
      const queued = await f.followup.enqueue(owner, {
        subjectId: "case",
        subjectRevision: 1,
        roomId: "room",
        key: "retry",
        notice: f.notice,
      });
      await f.followup.drain(worker, ["room"]);
      const old = await f.followup.read(owner, queued.id);
      await f.followup.reconcile(owner, queued.id, {
        operationId: "not-sent",
        expectedRevision: old.revision,
        proofRefs: ["adapter:verified-no-send"],
        outcome: { kind: "not_sent" },
      });
      f.failSend(false);
      await f.followup.drain(worker, ["room"]);
      assert.equal(f.deliveries.length, 1);
      f.setTime("2026-10-28T12:00:31.000Z");
      f.subject.set("case", 2);
      await f.followup.drain(worker, ["room"]);
      assert.equal(f.deliveries.length, 1);
      assert.equal(
        (await f.followup.read(owner, queued.id)).status,
        "canceled",
      );
    },
    async "timer delivery is provenance-bearing Planner inbox data and prepared notices need no model budget"(
      f,
    ) {
      await f.budget.configure(owner, f.period({ limitMicros: 0 }));
      await f.followup.replace(
        owner,
        f.plan({
          activations: [
            {
              key: "date",
              at: "2026-10-28T12:01:00.000Z",
              action: {
                kind: "planner",
                event: {
                  content: "Review persisted urgency facts",
                  references: ["situation:case"],
                  threadId: "thread",
                },
              },
            },
            {
              key: "notice",
              at: "2026-10-28T12:01:00.000Z",
              action: { kind: "notice", notice: f.notice },
            },
          ],
        }),
      );
      assert.equal((await f.followup.activateDue(worker, ["room"])).queued, 0);
      f.setTime("2026-10-28T12:01:00.000Z");
      await f.followup.activateDue(worker, ["room"]);
      await f.followup.drain(worker, ["room"]);
      assert.equal(f.deliveries.length, 2);
      const event = scheduledPlannerEventV1(
        f.deliveries.find((d) => d.record.action.kind === "planner").record,
      );
      assert.equal(event.kind, "timer");
      assert.equal(event.threadId, "thread");
      assert.equal(event.provenance.source, "agentplat.scheduled-followup");
      assert.equal(event.id, event.provenance.eventId);
      assert.equal(
        (await f.budget.read(owner, "pilot", "october")).spentMicros,
        0,
      );
    },
    async "Room scope and current permissions are checked before enqueue, discovery and delivery"(
      f,
    ) {
      await assert.rejects(
        f.followup.replace(owner, f.plan({ roomId: "forbidden" })),
      );
      const queued = await f.followup.enqueue(owner, {
        subjectId: "case",
        subjectRevision: 1,
        roomId: "room",
        key: "private",
        notice: f.notice,
      });
      assert.equal(
        await f.followup.read({ ...owner, tenantId: "foreign" }, queued.id),
        undefined,
      );
      await assert.rejects(f.followup.drain(worker, ["forbidden"]));
      f.disable();
      await assert.rejects(f.followup.deliver(worker, queued.id));
      assert.equal(f.deliveries.length, 0);
      f.enable();
      await f.followup.drain(worker, ["room"]);
      assert.equal(f.deliveries.length, 1);
    },
  };
  for (const [name, run] of Object.entries(scenarios))
    await t.test(name, async () => {
      const stores = await setup();
      try {
        await run(operationsFixture(stores));
      } finally {
        await stores.dispose?.();
      }
    });
}
