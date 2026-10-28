import assert from "node:assert/strict";
import {
  createAgentRoomPlanner,
  InMemoryRoomPlannerStore,
  createRoomPlannerSharedBudgetV1,
} from "@agentplat/rooms";
import { operationsFixture } from "./planner-operations-scenarios.mjs";
const usage = { costMicros: 2, inputTokens: 10, outputTokens: 2 };
function plannerFixture(f, more = {}) {
  const store = new InMemoryRoomPlannerStore(),
    events = new Map(),
    invocations = [],
    receipts = new Map();
  const budget = createRoomPlannerSharedBudgetV1({
    service: f.budget,
    bindingId: "pilot-account-v1",
    context: async () => f.worker,
    accountId: () => "pilot",
    currency: "USD",
    category: (_, operation) => operation.kind,
  });
  const ports = {
    store,
    sharedBudget: budget,
    clock: f.options.clock,
    reservationMicros: { reason: 4, task: 4, review: 4, direct: 4 },
    authorize: async () => {},
    resolveEvent: async (_, id) => events.get(id),
    context: async () => ({}),
    route: async (_, event) => event.targetParticipantIds ?? [],
    reasoner: {
      propose: async (context, call) => {
        await call.assertCurrent();
        invocations.push("reason");
        const result = {
          usage,
          proposal:
            context.event.content === "plan"
              ? {
                  kind: "plan",
                  objectiveId: context.event.id,
                  expectedObjectiveRevision: null,
                  title: "Report",
                  criteria: [
                    { id: "verified", description: "Confirmed facts" },
                  ],
                  constraints: [],
                  tasks: [
                    {
                      id: "research",
                      participantId: "specialist",
                      instruction: "Research",
                      expectedOutput: "Facts",
                      dependencies: [],
                      actionLevel: "read",
                    },
                  ],
                  content: "Research planned",
                }
              : { kind: "respond", content: "Current facts" },
        };
        receipts.set(call.operationId, result);
        return result;
      },
    },
    execute: async (_, __, objective, call) => {
      await call.assertCurrent();
      invocations.push(objective ? "task" : "direct");
      const result = {
        usage,
        result: {
          kind: "result",
          content: "Known facts",
          evidence: [
            {
              reference: "artifact:report",
              version: "1",
              sourceIds: ["source"],
            },
          ],
        },
      };
      receipts.set(call.operationId, result);
      return result;
    },
    verify: async (_, __, ___, call) => {
      await call.assertCurrent();
      invocations.push("review");
      return {
        usage,
        review: {
          reviewerParticipantId: "reviewer",
          evidence: {
            reference: "artifact:report",
            version: "1",
            sourceIds: ["source"],
          },
          criteria: [
            {
              criterionId: "verified",
              verdict: "met",
              explanation: "Verified",
            },
          ],
        },
      };
    },
    reconcile: async (_, op) => receipts.get(op.id),
    deliver: async () => {},
    ...more,
  };
  return {
    store,
    ports,
    events,
    invocations,
    receipts,
    planner: createAgentRoomPlanner(ports),
    async init(roomId) {
      const scope = { tenantId: "tenant", roomId };
      await this.planner.configure(scope, {
        mode: "execute",
        budgetLimitMicros: 1000,
      });
      return scope;
    },
    async event(scope, id, content = "question", extra = {}) {
      events.set(id, {
        id,
        kind: "message",
        actorId: "owner",
        content,
        ...extra,
      });
      await this.planner.acceptEvent(scope, id);
    },
  };
}
export async function plannerBudgetIntegrationScenarios(t, setup) {
  const scenarios = {
    async "Planner reasoning, specialists, review and direct mentions charge the same account exactly once"(
      f,
    ) {
      await f.budget.configure(
        f.owner,
        f.period({ limitMicros: 100, categoryLimits: { task: 40 } }),
      );
      const p = plannerFixture(f),
        scope = await p.init("room");
      await p.event(scope, "report", "plan");
      for (let i = 0; i < 8; i++) await p.planner.runOnce(scope);
      assert.equal(
        (await p.planner.get(scope)).objectives[0].status,
        "completed",
      );
      const other = await p.init("other");
      await p.event(other, "mention", "question", {
        targetParticipantIds: ["specialist"],
      });
      await p.planner.runOnce(other);
      for (const kind of ["reason", "task", "review", "direct"])
        assert.ok(p.invocations.includes(kind), kind);
      const period = await f.budget.read(f.owner, "pilot", "october");
      assert.equal(period.spentMicros, p.invocations.length * 2);
      assert.equal(period.heldMicros, 0);
      assert.equal(
        (await f.budget.reservations(f.owner, "pilot", "october")).items.length,
        p.invocations.length,
      );
    },
    async "a shared limit preserves queued Planner work and a new period admits it without resetting counters"(
      f,
    ) {
      await f.budget.configure(f.owner, f.period({ limitMicros: 4 }));
      let entered, finish;
      const entering = new Promise((r) => {
          entered = r;
        }),
        holding = new Promise((r) => {
          finish = r;
        });
      const p = plannerFixture(f, {
        reasoner: {
          propose: async () => {
            entered();
            await holding;
            return {
              usage: { ...usage, costMicros: 4 },
              proposal: { kind: "respond", content: "Known answer" },
            };
          },
        },
      });
      const first = await p.init("room"),
        second = await p.init("other");
      await p.event(first, "first");
      await p.event(second, "second");
      const running = p.planner.runOnce(first);
      await entering;
      await p.planner.runOnce(second);
      assert.equal((await p.planner.get(second)).operations.length, 0);
      assert.equal((await p.planner.get(second)).events.length, 1);
      finish();
      await running;
      await p.planner.runOnce(second);
      assert.equal((await p.planner.get(second)).operations.length, 0);
      await f.budget.configure(
        f.owner,
        f.period({
          id: "november",
          operationId: "next-month",
          startsAt: "2026-11-01T03:00:00.000Z",
          endsAt: "2026-12-01T03:00:00.000Z",
          limitMicros: 4,
        }),
      );
      f.setTime("2026-11-01T03:00:00.000Z");
      await p.planner.runOnce(second);
      assert.equal(
        (await p.planner.get(second)).operations[0].status,
        "completed",
      );
      assert.equal(
        (await f.budget.read(f.owner, "pilot", "october")).spentMicros,
        4,
      );
      assert.equal(
        (await f.budget.read(f.owner, "pilot", "november")).spentMicros,
        4,
      );
    },
    async "a configured Planner cannot bypass its shared account when the port is removed or rebound"(
      f,
    ) {
      await f.budget.configure(f.owner, f.period());
      const p = plannerFixture(f),
        scope = await p.init("room");
      await p.event(scope, "private");
      const missing = createAgentRoomPlanner({
        ...p.ports,
        sharedBudget: undefined,
      });
      await assert.rejects(missing.runOnce(scope), /budget/i);
      await assert.rejects(
        missing.configure(scope, { mode: "execute", budgetLimitMicros: 1000 }),
        /budget/i,
      );
      const rebound = createAgentRoomPlanner({
        ...p.ports,
        sharedBudget: { ...p.ports.sharedBudget, bindingId: "other-account" },
      });
      await assert.rejects(rebound.runOnce(scope));
      assert.equal(p.invocations.length, 0);
    },
    async "a crash between shared admission and local attachment holds capacity and never repeats inference"(
      f,
    ) {
      await f.budget.configure(f.owner, f.period());
      const p = plannerFixture(f),
        scope = await p.init("room");
      await p.event(scope, "admission-gap");
      let crash = true;
      const compare = p.store.compareAndSet.bind(p.store);
      p.store.compareAndSet = async (rev, state) => {
        if (crash && state.operations.some((op) => op.sharedBudget)) {
          crash = false;
          throw new Error("Local store unavailable after admission");
        }
        return compare(rev, state);
      };
      await p.planner.runOnce(scope);
      assert.equal(p.invocations.length, 0);
      assert.equal(
        (await p.planner.get(scope)).operations[0].status,
        "uncertain",
      );
      assert.equal(
        (await f.budget.read(f.owner, "pilot", "october")).heldMicros,
        4,
      );
      await createAgentRoomPlanner(p.ports).runOnce(scope);
      assert.equal(p.invocations.length, 0);
      assert.equal(
        (await f.budget.read(f.owner, "pilot", "october")).heldMicros,
        4,
      );
    },
    async "a crash after shared settlement recovers the known result without a second account charge"(
      f,
    ) {
      await f.budget.configure(f.owner, f.period());
      const p = plannerFixture(f),
        scope = await p.init("room");
      await p.event(scope, "projection-gap");
      let crash = true;
      const compare = p.store.compareAndSet.bind(p.store);
      p.store.compareAndSet = async (rev, state) => {
        if (crash && state.operations.some((op) => op.usage)) {
          crash = false;
          throw new Error("Local result projection failed");
        }
        return compare(rev, state);
      };
      await p.planner.runOnce(scope);
      assert.equal(p.invocations.length, 1);
      assert.equal(
        (await f.budget.read(f.owner, "pilot", "october")).spentMicros,
        2,
      );
      await createAgentRoomPlanner(p.ports).runOnce(scope);
      assert.equal(p.invocations.length, 1);
      assert.equal(
        (await p.planner.get(scope)).operations[0].status,
        "completed",
      );
      assert.equal(
        (await f.budget.read(f.owner, "pilot", "october")).spentMicros,
        2,
      );
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
