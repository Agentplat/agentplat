import test from "node:test";
import assert from "node:assert/strict";
import {
  createAgentRoomPlanner,
  InMemoryRoomPlannerStore,
  roomPlannerBudget,
} from "@agentplat/rooms";
const scope = { tenantId: "t", roomId: "r" };
const usage = { costMicros: 2, inputTokens: 10, outputTokens: 5 };
function fixture(overrides = {}) {
  const store = new InMemoryRoomPlannerStore(),
    events = new Map(),
    calls = [],
    delivered = [];
  let now = new Date("2026-10-15T00:00:00Z");
  const plan = (id) => ({
    kind: "plan",
    objectiveId: id,
    expectedObjectiveRevision: null,
    title: id,
    criteria: [{ id: "c", description: "Verified report" }],
    constraints: [],
    tasks: [
      {
        id: "research",
        participantId: "researcher",
        instruction: "Research with sources",
        expectedOutput: "Report",
        dependencies: [],
        actionLevel: "read",
      },
    ],
    content: `Working on ${id}`,
  });
  const ports = {
    store,
    reservationMicros: { reason: 10, task: 10, review: 10, direct: 10 },
    clock: () => now,
    authorize: async () => {},
    resolveEvent: async (_, id) => events.get(id),
    context: async () => ({}),
    route: async (_, e) => e.targetParticipantIds ?? [],
    reasoner: {
      propose: async (c) => ({
        proposal:
          c.event.kind === "message"
            ? plan(c.event.id)
            : { kind: "respond", content: "Progress recorded" },
        usage,
      }),
    },
    execute: async (_, t, o) => {
      calls.push({ task: t.id, objective: o?.id });
      return {
        result: {
          kind: "result",
          content: "Report",
          evidence: [
            { reference: "artifact", version: "1", sourceIds: ["source"] },
          ],
        },
        usage,
      };
    },
    verify: async () => ({
      review: {
        reviewerParticipantId: "reviewer",
        evidence: {
          reference: "artifact",
          version: "1",
          sourceIds: ["source"],
        },
        criteria: [
          { criterionId: "c", verdict: "met", explanation: "Checked" },
        ],
      },
      usage,
    }),
    deliver: async (_, n) => {
      delivered.push(n.id);
    },
    ...overrides,
  };
  const planner = createAgentRoomPlanner(ports);
  return {
    planner,
    ports,
    store,
    events,
    calls,
    delivered,
    plan,
    advance: (ms) => {
      now = new Date(+now + ms);
    },
    async init(budget = 1000) {
      await planner.configure(scope, {
        mode: "execute",
        budgetLimitMicros: budget,
      });
    },
    async message(id, more = {}) {
      events.set(id, {
        id,
        kind: "message",
        actorId: "human",
        content: `Please produce ${id}`,
        ...more,
      });
      await planner.acceptEvent(scope, id);
    },
  };
}
test("two concurrent objectives, source-backed review and idempotent recovery", async () => {
  const f = fixture();
  await f.init();
  await f.message("a");
  await f.message("b");
  await f.planner.runOnce(scope);
  await f.planner.runOnce(scope);
  for (let i = 0; i < 5; i++) await f.planner.runOnce(scope);
  const state = await f.planner.get(scope);
  assert.deepEqual(
    state.objectives.map((o) => o.status),
    ["completed", "completed"],
  );
  assert.equal(f.calls.length, 2);
  assert.equal(state.operations.filter((o) => o.kind === "review").length, 2);
  const recovered = createAgentRoomPlanner(f.ports);
  await recovered.runOnce(scope);
  assert.equal(f.calls.length, 2);
  await f.planner.acceptEvent(scope, "a");
  await recovered.runOnce(scope);
  assert.equal(f.calls.length, 2);
});
test("explicit references bypass reasoner; shared reservations prevent overspending across workers", async () => {
  let resolve;
  const hold = new Promise((r) => {
    resolve = r;
  });
  const f = fixture({
    execute: async () => {
      await hold;
      return {
        result: { kind: "result", content: "Answer", evidence: [] },
        usage,
      };
    },
  });
  await f.init(10);
  await f.message("a", { targetParticipantIds: ["one", "two"] });
  const first = f.planner.runOnce(scope);
  await new Promise((r) => setTimeout(r, 5));
  await createAgentRoomPlanner(f.ports).runOnce(scope);
  let state = await f.planner.get(scope);
  assert.equal(state.operations.length, 1);
  assert.equal(roomPlannerBudget(state).reservedMicros, 10);
  resolve();
  await first;
  state = await f.planner.get(scope);
  assert.equal(state.objectives.length, 0);
  assert.equal(roomPlannerBudget(state).spentMicros, 2);
  await f.planner.configure(scope, { mode: "execute", budgetLimitMicros: 20 });
  await f.planner.runOnce(scope);
  assert.equal((await f.planner.get(scope)).operations.length, 2);
});
test("uncertain call retains funds after restart and is never silently repeated", async () => {
  let count = 0;
  const f = fixture({
    execute: async () => {
      count++;
      throw new Error("Lost response");
    },
  });
  await f.init(10);
  await f.message("a", { targetParticipantIds: ["one"] });
  await f.planner.runOnce(scope);
  f.advance(400_000);
  await createAgentRoomPlanner(f.ports).runOnce(scope);
  const s = await f.planner.get(scope);
  assert.equal(count, 1);
  assert.equal(s.operations[0].status, "uncertain");
  assert.equal(roomPlannerBudget(s).reservedMicros, 10);
});
test("pause fences late work and stops new execution", async () => {
  let release;
  const hold = new Promise((r) => {
    release = r;
  });
  const f = fixture({
    execute: async () => {
      await hold;
      return {
        result: { kind: "result", content: "Late", evidence: [] },
        usage,
      };
    },
  });
  await f.init();
  await f.message("a");
  const work = f.planner.runOnce(scope);
  await new Promise((r) => setTimeout(r, 5));
  const o = (await f.planner.get(scope)).objectives[0];
  await f.planner.intervene(scope, {
    objectiveId: o.id,
    expectedRevision: o.revision,
    action: "pause",
  });
  release();
  await work;
  const state = await f.planner.get(scope);
  assert.equal(state.objectives[0].status, "paused");
  assert.equal(
    state.operations.find((op) => op.kind === "task").status,
    "rejected",
  );
});
test("review cannot self-certify or omit criterion evidence", async () => {
  const f = fixture({
    verify: async () => ({
      review: {
        reviewerParticipantId: "researcher",
        evidence: { reference: "artifact", version: "1", sourceIds: ["s"] },
        criteria: [{ criterionId: "c", verdict: "met", explanation: "yes" }],
      },
      usage,
    }),
  });
  await f.init();
  await f.message("a");
  for (let i = 0; i < 4; i++) await f.planner.runOnce(scope);
  const s = await f.planner.get(scope);
  assert.notEqual(s.objectives[0].status, "completed");
  assert.equal(
    s.operations.find((op) => op.kind === "review").status,
    "rejected",
  );
});
test("observation records proposals without goals or specialist calls and isolates tenants", async () => {
  const f = fixture();
  await f.init();
  await f.planner.configure(scope, {
    mode: "observe",
    budgetLimitMicros: 1000,
  });
  await f.message("a");
  await f.planner.runOnce(scope);
  const s = await f.planner.get(scope);
  assert.equal(s.objectives.length, 0);
  assert.equal(s.decisions[0].disposition, "observed");
  assert.equal(f.calls.length, 0);
  assert.equal(await f.store.load({ ...scope, tenantId: "other" }), undefined);
  assert.equal(
    await f.store.compareAndSet(0, { ...s, revision: s.revision + 1 }),
    false,
  );
});
test("replan preserves completed identities and rejects changed work atomically", async () => {
  const f = fixture();
  await f.init();
  await f.message("a");
  await f.planner.runOnce(scope);
  let state = await f.planner.get(scope);
  const objective = state.objectives[0],
    oldPlan = objective.activePlanId;
  f.ports.reasoner.propose = async (c) => ({
    proposal:
      c.event.kind === "message"
        ? {
            ...f.plan("a"),
            expectedObjectiveRevision: c.objectives.find((o) => o.id === "a")
              .revision,
            tasks: [{ ...f.plan("a").tasks[0], instruction: "Changed scope" }],
          }
        : { kind: "respond", content: "Recorded" },
    usage,
  });
  await f.message("correction");
  for (let i = 0; i < 3; i++) await f.planner.runOnce(scope);
  state = await f.planner.get(scope);
  assert.equal(state.objectives[0].activePlanId, oldPlan);
  assert.equal(state.objectives[0].plans.length, 1);
  assert.ok(
    state.decisions.some(
      (d) => d.disposition === "rejected" && d.reason.includes("Changed work"),
    ),
  );
});
test("draining while a reasoner is in flight charges usage without creating goals", async () => {
  let release;
  const hold = new Promise((r) => {
    release = r;
  });
  const f = fixture();
  f.ports.reasoner.propose = async () => {
    await hold;
    return { proposal: f.plan("a"), usage };
  };
  await f.init();
  await f.message("a");
  const pending = f.planner.runOnce(scope);
  await new Promise((r) => setTimeout(r, 5));
  await f.planner.configure(scope, { mode: "drain", budgetLimitMicros: 1000 });
  release();
  await pending;
  const state = await f.planner.get(scope);
  assert.equal(state.objectives.length, 0);
  assert.equal(roomPlannerBudget(state).spentMicros, 2);
});
test("invalid reasoner output charges known consumption and never retries automatically", async () => {
  const { RoomPlannerCallError } = await import("@agentplat/rooms");
  let count = 0;
  const f = fixture({
    reasoner: {
      propose: async () => {
        count++;
        throw new RoomPlannerCallError("Invalid JSON", usage);
      },
    },
  });
  await f.init();
  await f.message("a");
  await f.planner.runOnce(scope);
  await f.planner.runOnce(scope);
  const state = await f.planner.get(scope);
  assert.equal(count, 1);
  assert.equal(state.operations[0].status, "rejected");
  assert.equal(roomPlannerBudget(state).spentMicros, 2);
  assert.equal(roomPlannerBudget(state).reservedMicros, 0);
});
test("review cannot substitute a different report version", async () => {
  const f = fixture({
    verify: async () => ({
      review: {
        reviewerParticipantId: "reviewer",
        evidence: {
          reference: "different-report",
          version: "2",
          sourceIds: ["source"],
        },
        criteria: [
          { criterionId: "c", verdict: "met", explanation: "Claimed" },
        ],
      },
      usage,
    }),
  });
  await f.init();
  await f.message("a");
  for (let i = 0; i < 4; i++) await f.planner.runOnce(scope);
  assert.equal((await f.planner.get(scope)).objectives[0].status, "waiting");
});
test("observation consumes explicit-reference events without blocking later proposals", async () => {
  const f = fixture();
  await f.init();
  await f.planner.configure(scope, {
    mode: "observe",
    budgetLimitMicros: 1000,
  });
  await f.message("mention", { targetParticipantIds: ["one"] });
  await f.message("next");
  await f.planner.runOnce(scope);
  await f.planner.runOnce(scope);
  const state = await f.planner.get(scope);
  assert.equal(f.calls.length, 0);
  assert.ok(state.decisions.some((d) => d.eventId === "next"));
});
test("budget reductions cannot discard in-flight reservations", async () => {
  let release;
  const hold = new Promise((r) => {
    release = r;
  });
  const f = fixture({
    execute: async () => {
      await hold;
      return {
        usage,
        result: { kind: "result", content: "answer", evidence: [] },
      };
    },
  });
  await f.init();
  await f.message("a", { targetParticipantIds: ["one"] });
  const pending = f.planner.runOnce(scope);
  await new Promise((r) => setTimeout(r, 5));
  await assert.rejects(
    f.planner.configure(scope, { mode: "execute", budgetLimitMicros: 5 }),
    /reservations/,
  );
  release();
  await pending;
});
test("two workers execute different objectives concurrently within shared Room slots", async () => {
  let release;
  const hold = new Promise((r) => {
    release = r;
  });
  let active = 0,
    maximum = 0;
  const f = fixture({
    execute: async () => {
      active++;
      maximum = Math.max(maximum, active);
      await hold;
      active--;
      return {
        usage,
        result: {
          kind: "result",
          content: "Report",
          evidence: [
            { reference: "artifact", version: "1", sourceIds: ["source"] },
          ],
        },
      };
    },
  });
  await f.init();
  await f.message("a");
  await f.message("b");
  const first = f.planner.runOnce(scope);
  await new Promise((r) => setTimeout(r, 5));
  const second = createAgentRoomPlanner(f.ports).runOnce(scope);
  await new Promise((r) => setTimeout(r, 5));
  await createAgentRoomPlanner(f.ports).runOnce(scope);
  assert.equal(maximum, 2);
  assert.equal(
    (await f.planner.get(scope)).operations.filter(
      (op) => op.status === "running",
    ).length,
    2,
  );
  release();
  await Promise.all([first, second]);
});
test("specialist proposals cannot invent user goals", async () => {
  const f = fixture();
  f.ports.reasoner.propose = async () => ({
    proposal: f.plan("invented"),
    usage,
  });
  await f.init();
  f.events.set("proposal", {
    id: "proposal",
    kind: "specialist",
    actorId: "researcher",
    content: "Start a new unrelated mission",
  });
  await f.planner.recordSpecialistProposal(scope, "proposal");
  await f.planner.runOnce(scope);
  const state = await f.planner.get(scope);
  assert.equal(state.objectives.length, 0);
  assert.equal(state.decisions[0].disposition, "rejected");
});
test("reconciliation releases only known usage without replaying execution", async () => {
  let calls = 0;
  const f = fixture({
    execute: async () => {
      calls++;
      throw Error("lost");
    },
  });
  await f.init();
  await f.message("a", { targetParticipantIds: ["one"] });
  await f.planner.runOnce(scope);
  f.ports.reconcile = async () => ({
    usage,
    result: { kind: "result", content: "Confirmed prior result", evidence: [] },
  });
  await createAgentRoomPlanner(f.ports).runOnce(scope);
  const state = await f.planner.get(scope);
  assert.equal(calls, 1);
  assert.equal(roomPlannerBudget(state).reservedMicros, 0);
  assert.equal(roomPlannerBudget(state).spentMicros, 2);
});
test("repeated challenges stop after three cycles without verified task progress", async () => {
  let count = 0;
  const f = fixture({
    execute: async () => {
      count++;
      return {
        usage,
        result: {
          kind: "challenge",
          content: "The current approach lacks evidence",
          evidence: [],
        },
      };
    },
  });
  f.ports.reasoner.propose = async (context) => {
    const objective = context.objectives.find((o) => o.id === "a");
    return {
      proposal: objective
        ? {
            ...f.plan("a"),
            expectedObjectiveRevision: objective.revision,
            tasks: [
              {
                ...f.plan("a").tasks[0],
                id: `attempt-${objective.plans.length + 1}`,
              },
            ],
          }
        : f.plan("a"),
      usage,
    };
  };
  await f.init();
  await f.message("a");
  for (let i = 0; i < 6; i++) await f.planner.runOnce(scope);
  const objective = (await f.planner.get(scope)).objectives[0];
  assert.equal(objective.status, "waiting");
  assert.ok(objective.noProgressCycles >= 3);
  assert.equal(count, 2);
});
test("equivalent persisted event key order remains idempotent", async () => {
  const f = fixture();
  await f.init();
  await f.message("a");
  const old = await f.store.load(scope);
  old.events[0] = Object.fromEntries(Object.entries(old.events[0]).reverse());
  old.revision++;
  await f.store.compareAndSet(old.revision - 1, old);
  await f.planner.acceptEvent(scope, "a");
  assert.equal((await f.planner.get(scope)).events.length, 1);
});
test("missing usage fields keep the reservation instead of silently charging zero", async () => {
  const f = fixture({
    execute: async () => ({
      usage: { inputTokens: 10, outputTokens: 5 },
      result: { kind: "result", content: "Answer", evidence: [] },
    }),
  });
  await f.init();
  await f.message("a", { targetParticipantIds: ["one"] });
  await f.planner.runOnce(scope);
  const state = await f.planner.get(scope);
  assert.equal(state.operations[0].status, "uncertain");
  assert.equal(roomPlannerBudget(state).reservedMicros, 10);
});
test("overrun drains new admissions even when the returned result is invalid", async () => {
  const f = fixture({
    execute: async () => ({
      usage: { costMicros: 20, inputTokens: 10, outputTokens: 5 },
    }),
  });
  await f.init();
  await f.message("a", { targetParticipantIds: ["one"] });
  await f.planner.runOnce(scope);
  const state = await f.planner.get(scope);
  assert.equal(state.mode, "drain");
  assert.equal(roomPlannerBudget(state).spentMicros, 20);
});
test("explicit references can proceed while a reasoner outcome is uncertain", async () => {
  let calls = 0;
  const f = fixture({
    reasoner: {
      propose: async () => {
        throw Error("lost reasoner response");
      },
    },
    execute: async () => {
      calls++;
      return {
        usage,
        result: { kind: "result", content: "Direct answer", evidence: [] },
      };
    },
  });
  await f.init();
  await f.message("a");
  await f.planner.runOnce(scope);
  await f.message("b", { targetParticipantIds: ["one"] });
  await f.planner.runOnce(scope);
  assert.equal(calls, 1);
});
test("a stale wait decision cannot undo a newer user pause/resume", async () => {
  let release;
  const held = new Promise((r) => {
    release = r;
  });
  const f = fixture();
  await f.init();
  await f.message("a");
  await f.planner.runOnce(scope);
  f.ports.reasoner.propose = async () => {
    await held;
    return {
      proposal: {
        kind: "wait",
        objectiveId: "a",
        content: "Waiting based on earlier state",
      },
      usage,
    };
  };
  const pending = f.planner.runOnce(scope);
  await new Promise((r) => setTimeout(r, 3));
  let o = (await f.planner.get(scope)).objectives[0];
  await f.planner.intervene(scope, {
    objectiveId: "a",
    expectedRevision: o.revision,
    action: "pause",
  });
  o = (await f.planner.get(scope)).objectives[0];
  await f.planner.intervene(scope, {
    objectiveId: "a",
    expectedRevision: o.revision,
    action: "resume",
  });
  release();
  await pending;
  assert.notEqual((await f.planner.get(scope)).objectives[0].status, "waiting");
});
test("whole-plan rejection is repaired using feedback before any specialist executes", async () => {
  const f = fixture();
  let attempts = 0;
  f.ports.admitPlan = async (_, proposal) =>
    proposal.tasks.some((t) => t.participantId === "reviewer")
      ? {
          allowed: false,
          reason:
            "Reserve a separate reviewer; final verification is automatic",
          retryable: true,
        }
      : { allowed: true };
  f.ports.reasoner.propose = async (context) => {
    attempts++;
    const plan = f.plan("a");
    if (!context.feedback?.length)
      plan.tasks.push({
        ...plan.tasks[0],
        id: "review",
        participantId: "reviewer",
      });
    return { proposal: plan, usage };
  };
  await f.init();
  await f.message("a");
  await f.planner.runOnce(scope);
  assert.equal(f.calls.length, 0);
  await f.planner.runOnce(scope);
  assert.equal(f.calls.length, 1);
  assert.equal(attempts, 2);
  const state = await f.planner.get(scope);
  assert.equal(state.events.filter((e) => e.kind === "message").length, 1);
  assert.equal(state.objectives.length, 1);
});
test("an unsatisfiable whole-plan constraint stops after three charged reasoner attempts", async () => {
  const f = fixture({
    admitPlan: async () => ({
      allowed: false,
      reason: "Unsatisfied whole-plan constraint",
      retryable: true,
    }),
  });
  await f.init();
  await f.message("a");
  for (let pass = 0; pass < 8; pass++) await f.planner.runOnce(scope);
  const state = await f.planner.get(scope);
  assert.equal(state.operations.filter((op) => op.kind === "reason").length, 3);
  assert.equal(state.objectives.length, 0);
  assert.equal(roomPlannerBudget(state).spentMicros, 6);
});
test("known malformed reasoning can be repaired in bounded fresh reservations without replaying effects", async () => {
  const { RoomPlannerCallError } = await import("@agentplat/rooms");
  let calls = 0;
  const f = fixture();
  f.ports.reasoner.propose = async (context) => {
    calls++;
    if (!context.feedback?.length)
      throw new RoomPlannerCallError(
        "Return a valid API envelope",
        usage,
        true,
      );
    return {
      proposal: { kind: "respond", content: "Corrected API response" },
      usage,
    };
  };
  await f.init();
  await f.message("a");
  await f.planner.runOnce(scope);
  await f.planner.runOnce(scope);
  const state = await f.planner.get(scope);
  assert.equal(calls, 2);
  assert.equal(roomPlannerBudget(state).spentMicros, 4);
  assert.equal(state.operations[1].status, "completed");
  assert.equal(
    state.notifications.filter((n) => n.id.startsWith("rejected:")).length,
    0,
  );
});
test("specialist-driven replanning never becomes an owner correction", async () => {
  const f = fixture({
    execute: async () => ({
      usage,
      result: {
        kind: "challenge",
        content: "Use a different approach",
        evidence: [],
      },
    }),
  });
  f.ports.reasoner.propose = async (c) => {
    const objective = c.objectives[0];
    return {
      usage,
      proposal: objective
        ? {
            ...f.plan("a"),
            expectedObjectiveRevision: objective.revision,
            tasks: [{ ...f.plan("a").tasks[0], id: "new-method" }],
          }
        : f.plan("a"),
    };
  };
  await f.init();
  await f.message("a");
  await f.planner.runOnce(scope);
  await f.planner.runOnce(scope);
  assert.equal(
    (await f.planner.get(scope)).objectives[0].corrections.length,
    0,
  );
});
test("internal wait-for-review narration cannot stall an already admitted verification", async () => {
  const f = fixture();
  await f.init();
  await f.message("a");
  await f.planner.runOnce(scope);
  f.ports.reasoner.propose = async () => ({
    proposal: {
      kind: "wait",
      objectiveId: "a",
      content: "Waiting for the separate reviewer",
    },
    usage,
  });
  await createAgentRoomPlanner(f.ports).runOnce(scope);
  assert.equal((await f.planner.get(scope)).objectives[0].status, "completed");
});
test("changed task identity is repaired autonomously without replaying the prior completed task", async () => {
  const f = fixture();
  await f.init();
  await f.message("a");
  await f.planner.runOnce(scope);
  f.ports.reasoner.propose = async (context) => {
    if (context.event.kind !== "message")
      return {
        proposal: { kind: "respond", content: "Progress recorded" },
        usage,
      };
    const prior = context.objectives.find((o) => o.id === "a");
    const task = {
      ...f.plan("a").tasks[0],
      id: context.feedback?.length ? "research-v2" : "research",
      instruction: "Use the new owner requirements",
    };
    return {
      proposal: {
        ...f.plan("a"),
        expectedObjectiveRevision: prior.revision,
        tasks: [task],
      },
      usage,
    };
  };
  await f.message("correction");
  for (let pass = 0; pass < 5; pass++) await f.planner.runOnce(scope);
  const state = await f.planner.get(scope);
  assert.equal(state.objectives[0].plans.length, 2);
  assert.deepEqual(
    f.calls.map((c) => c.task),
    ["research", "research-v2"],
  );
  assert.equal(state.objectives[0].status, "completed");
});
test("reasoner receives accepted progress and evidence after reconstruction", async () => {
  const f = fixture();
  await f.init();
  await f.message("a");
  await f.planner.runOnce(scope);
  let witnessed;
  f.ports.reasoner.propose = async (context) => {
    witnessed = context.progress;
    return {
      proposal: { kind: "respond", content: "Recorded actual progress" },
      usage,
    };
  };
  await createAgentRoomPlanner(f.ports).runOnce(scope);
  assert.equal(witnessed[0].status, "completed");
  assert.equal(witnessed[0].resultKind, "result");
  assert.equal(witnessed[0].evidence[0].reference, "artifact");
  assert.equal(f.calls.length, 1);
});
test("late internal receipts for a terminal goal do not invoke the model or block a new user message", async () => {
  const f = fixture();
  await f.init();
  await f.message("a");
  for (let i = 0; i < 4; i++) await f.planner.runOnce(scope);
  f.events.set("late", {
    id: "late",
    kind: "specialist",
    actorId: "researcher",
    objectiveId: "a",
    content: "Late acknowledgement",
  });
  await f.planner.recordSpecialistProposal(scope, "late");
  await f.message("new-user-question");
  let invocations = 0;
  f.ports.reasoner.propose = async () => {
    invocations++;
    return {
      proposal: { kind: "respond", content: "New question answered" },
      usage,
    };
  };
  await f.planner.runOnce(scope);
  assert.equal(invocations, 0);
  await f.planner.runOnce(scope);
  assert.equal(invocations, 1);
  const state = await f.planner.get(scope);
  assert.ok(state.handledEventIds.includes("late"));
  assert.equal(state.objectives[0].status, "completed");
});
test("an unmet review drives bounded corrective work and a new output version", async () => {
  const f = fixture();
  let version = 0,
    reviews = 0;
  f.ports.execute = async () => {
    version++;
    return {
      usage,
      result: {
        kind: "result",
        content: `Report v${version}`,
        evidence: [
          {
            reference: "artifact",
            version: String(version),
            sourceIds: ["source"],
          },
        ],
      },
    };
  };
  f.ports.verify = async (_, objective, results) => {
    reviews++;
    return {
      usage,
      review: {
        reviewerParticipantId: "reviewer",
        evidence: results.at(-1).result.evidence[0],
        criteria: [
          {
            criterionId: "c",
            verdict: reviews === 1 ? "unmet" : "met",
            explanation:
              reviews === 1 ? "Correct citation format" : "Corrected",
          },
        ],
      },
    };
  };
  f.ports.reasoner.propose = async (context) => {
    if (context.event.review) {
      assert.equal(context.reviews.at(-1).review.criteria[0].verdict, "unmet");
      return {
        usage,
        proposal: {
          ...f.plan("a"),
          expectedObjectiveRevision: context.objectives[0].revision,
          tasks: [
            {
              ...f.plan("a").tasks[0],
              id: "correct-citations",
              instruction: "Correct the reviewed format",
            },
          ],
        },
      };
    }
    return {
      usage,
      proposal:
        context.event.kind === "message"
          ? f.plan("a")
          : { kind: "respond", content: "Progress recorded" },
    };
  };
  await f.init();
  await f.message("a");
  for (let pass = 0; pass < 8; pass++) await f.planner.runOnce(scope);
  const state = await f.planner.get(scope);
  assert.equal(state.objectives[0].status, "completed");
  assert.equal(version, 2);
  assert.equal(reviews, 2);
  assert.equal(state.objectives[0].reviewFailures, 0);
});
test("unchanged output is not repeatedly reviewed after failure and interpretation repair is bounded", async () => {
  const f = fixture();
  let reviews = 0;
  f.ports.verify = async () => {
    reviews++;
    return {
      usage,
      review: {
        reviewerParticipantId: "reviewer",
        evidence: {
          reference: "artifact",
          version: "1",
          sourceIds: ["source"],
        },
        criteria: [
          { criterionId: "c", verdict: "unmet", explanation: "Format unmet" },
        ],
      },
    };
  };
  f.ports.reasoner.propose = async (context) => ({
    usage,
    proposal: context.event.review
      ? {
          ...f.plan("a"),
          expectedObjectiveRevision: context.objectives[0].revision,
        }
      : context.event.kind === "message"
        ? f.plan("a")
        : { kind: "respond", content: "Progress" },
  });
  await f.init();
  await f.message("a");
  for (let pass = 0; pass < 9; pass++) await f.planner.runOnce(scope);
  const state = await f.planner.get(scope);
  assert.equal(reviews, 1);
  assert.equal(state.objectives[0].status, "waiting");
  assert.equal(
    state.operations.filter(
      (op) => op.eventId?.startsWith("review-result:") && op.kind === "reason",
    ).length,
    3,
  );
});
test("three failed output revisions stop automatic repair; unknown evidence does not trigger retries", async () => {
  const f = fixture();
  let version = 0;
  f.ports.execute = async () => {
    version++;
    return {
      usage,
      result: {
        kind: "result",
        content: `Report ${version}`,
        evidence: [
          {
            reference: "artifact",
            version: String(version),
            sourceIds: ["source"],
          },
        ],
      },
    };
  };
  f.ports.verify = async (_, o, results) => ({
    usage,
    review: {
      reviewerParticipantId: "reviewer",
      evidence: results.at(-1).result.evidence[0],
      criteria: [
        { criterionId: "c", verdict: "unmet", explanation: "Still unmet" },
      ],
    },
  });
  f.ports.reasoner.propose = async (context) => ({
    usage,
    proposal: context.event.review
      ? {
          ...f.plan("a"),
          expectedObjectiveRevision: context.objectives[0].revision,
          tasks: [{ ...f.plan("a").tasks[0], id: `revision-${version + 1}` }],
        }
      : context.event.kind === "message"
        ? f.plan("a")
        : { kind: "respond", content: "Progress" },
  });
  await f.init();
  await f.message("a");
  for (let pass = 0; pass < 15; pass++) await f.planner.runOnce(scope);
  const state = await f.planner.get(scope);
  assert.equal(version, 3);
  assert.equal(state.objectives[0].reviewFailures, 3);
  assert.equal(state.objectives[0].status, "waiting");
  const unknown = fixture({
    verify: async () => ({
      usage,
      review: {
        reviewerParticipantId: "reviewer",
        evidence: {
          reference: "artifact",
          version: "1",
          sourceIds: ["source"],
        },
        criteria: [
          {
            criterionId: "c",
            verdict: "unknown",
            explanation: "Requires owner evidence",
          },
        ],
      },
    }),
  });
  await unknown.init();
  await unknown.message("a");
  for (let pass = 0; pass < 6; pass++) await unknown.planner.runOnce(scope);
  assert.equal(
    (await unknown.planner.get(scope)).objectives[0].status,
    "waiting",
  );
  assert.equal(
    (await unknown.planner.get(scope)).events.filter((e) => e.review).length,
    0,
  );
});
test("a reviewer completing concurrently does not consume and lose a queued owner correction", async () => {
  const f = fixture();
  await f.init();
  await f.message("a");
  await f.planner.runOnce(scope);
  // First drain the ordinary result event, but leave review in flight while the owner speaks.
  let finishReview;
  const reviewWait = new Promise((r) => {
    finishReview = r;
  });
  f.ports.verify = async () => {
    await reviewWait;
    return {
      usage,
      review: {
        reviewerParticipantId: "reviewer",
        evidence: {
          reference: "artifact",
          version: "1",
          sourceIds: ["source"],
        },
        criteria: [
          { criterionId: "c", verdict: "met", explanation: "Checked" },
        ],
      },
    };
  };
  const review = f.planner.runOnce(scope);
  await new Promise((r) => setTimeout(r, 3));
  await f.message("correction");
  let releaseReasoner;
  const reasoningWait = new Promise((r) => {
    releaseReasoner = r;
  });
  let calls = 0;
  f.ports.reasoner.propose = async (context) => {
    calls++;
    if (calls === 1) await reasoningWait;
    return {
      usage,
      proposal: {
        ...f.plan("a"),
        expectedObjectiveRevision: context.objectives[0].revision,
        tasks: [
          {
            ...f.plan("a").tasks[0],
            id: "owner-corrected",
            instruction: "Incorporate the owner correction",
          },
        ],
      },
    };
  };
  const correction = createAgentRoomPlanner(f.ports).runOnce(scope);
  await new Promise((r) => setTimeout(r, 3));
  finishReview();
  await review;
  releaseReasoner();
  await correction;
  assert.equal(
    (await f.planner.get(scope)).operations.find(
      (op) => op.eventId === "correction",
    ).status,
    "rejected",
  );
  await f.planner.runOnce(scope);
  assert.equal((await f.planner.get(scope)).objectives[0].plans.length, 2);
  assert.equal(calls, 2);
});
