import test from "node:test";
import assert from "node:assert/strict";
import {
  createAgentRoomPlanner,
  InMemoryRoomPlannerStore,
  roomPlannerBudget,
} from "@agentplat/rooms";

const usage = { costMicros: 2, inputTokens: 10, outputTokens: 5 };
const scope = { tenantId: "initiative-tenant", roomId: "initiative-room" };
async function fixture({
  maximumCalls = 4,
  maximumReadCalls = 3,
  budget = 1000,
  propose,
  execute,
} = {}) {
  let now = new Date("2026-11-12T12:00:00.000Z"),
    granted = true,
    generation = 1;
  const store = new InMemoryRoomPlannerStore(),
    observations = new Map(),
    events = new Map(),
    calls = [],
    deliveries = [];
  const ports = {
    store,
    clock: () => now,
    reservationMicros: { reason: 10, task: 10, review: 10, direct: 10 },
    authorize: async () => {},
    context: async () => ({}),
    route: async () => [],
    resolveEvent: async (_, id) => events.get(id),
    // Initiative work must never reach any generic execution path.
    reasoner: {
      propose: async () => {
        throw Error("generic reasoner used");
      },
    },
    execute: async () => {
      throw Error("generic execution used");
    },
    verify: async () => {
      throw Error("generic verification used");
    },
    deliver: async (_, note) => deliveries.push(note),
    initiatives: {
      resolve: async (_, id) => observations.get(id),
      assertCurrent: async (_, admission) => {
        if (!granted || admission.source.generation !== generation)
          throw Error("source_or_owner_revoked");
      },
      propose: async (context, call) => {
        calls.push("reason");
        await call.assertModelCall();
        await assert.rejects(call.assertModelCall(), /already claimed/);
        if (propose) return propose(context, call);
        if (context.event.kind === "result")
          return {
            proposal: {
              kind: "wait",
              objectiveId: context.event.objectiveId,
              content: "Await engine verification",
            },
            usage,
          };
        return {
          proposal: {
            kind: "plan",
            objectiveId: context.event.objectiveId,
            expectedObjectiveRevision: null,
            title: "Investigate",
            criteria: [{ id: "c", description: "Evidence and draft" }],
            constraints: [],
            tasks: [
              {
                id: "read",
                participantId: "researcher",
                instruction: "Inspect evidence",
                expectedOutput: "Draft",
                dependencies: [],
                actionLevel: "read",
              },
            ],
            content: "Investigating",
          },
          usage,
        };
      },
      execute: async (s, task, objective, call) => {
        calls.push("task");
        await call.assertModelCall();
        if (execute) return execute(s, task, objective, call);
        await assert.rejects(
          call.assertRead("send", scope.roomId),
          /grant|allowance/,
        );
        await assert.rejects(
          call.assertRead("mail.read", "foreign-room"),
          /grant|allowance/,
        );
        await call.assertRead("mail.read", scope.roomId);
        return {
          result: {
            kind: "result",
            content: "Partial cached coverage; draft for owner decision",
            evidence: [
              { reference: "artifact", version: "1", sourceIds: ["source"] },
            ],
          },
          usage,
        };
      },
      verify: async (_, objective, results, call) => {
        calls.push("review");
        await call.assertModelCall();
        return {
          review: {
            reviewerParticipantId: "reviewer",
            evidence: results[0].result.evidence[0],
            criteria: [
              { criterionId: "c", verdict: "met", explanation: "Checked" },
            ],
          },
          usage,
        };
      },
    },
  };
  const planner = createAgentRoomPlanner(ports);
  await planner.configure(scope, {
    mode: "execute",
    budgetLimitMicros: budget,
  });
  function add(id = "first", revision = 1) {
    observations.set(id, {
      id,
      eligible: true,
      reason: "eligible",
      admission: {
        ownerId: "owner",
        policyRef: "policy",
        policyRevision: 1,
        subject: { id: "situation", revision },
        trigger: { kind: "new", eventId: `source:${id}` },
        evidenceRefs: ["source"],
        source: { generation },
        scope: {
          roomIds: [scope.roomId],
          allowedReadTools: ["mail.read"],
          maximumCalls,
          maximumReadCalls,
          maximumCostMicros: 100,
          expiresAt: "2026-11-13T12:00:00.000Z",
          maximumDurationMs: 600000,
        },
        output: "evidence_and_action_draft",
      },
    });
    events.set(`source:${id}`, {
      id: `source:${id}`,
      kind: "external",
      actorId: "gmail",
      content: "Persisted evidence",
      provenance: {
        source: "gmail",
        eventId: id,
        occurredAt: now.toISOString(),
      },
    });
    return id;
  }
  return {
    planner,
    ports,
    store,
    calls,
    deliveries,
    observations,
    events,
    add,
    restart: () => createAgentRoomPlanner(ports),
    revoke: () => {
      granted = false;
    },
    reconnect: () => {
      generation++;
    },
    advance: (ms) => {
      now = new Date(+now + ms);
    },
    async run(n = 6) {
      for (let i = 0; i < n; i++) await planner.runOnce(scope);
      return planner.get(scope);
    },
    async select(id = add()) {
      await planner.observeInitiative(scope, id);
      return planner.selectInitiative(scope, id);
    },
  };
}

test("initiative observation is deterministic, replica-safe and never drains on enablement", async () => {
  const f = await fixture(),
    id = f.add();
  await Promise.all(
    Array.from({ length: 4 }, () => f.restart().observeInitiative(scope, id)),
  );
  let state = await f.run();
  assert.equal(state.initiatives.length, 1);
  assert.equal(state.events.length, 0);
  assert.equal(f.calls.length, 0);
  await f.planner.configure(scope, { mode: "drain", budgetLimitMicros: 1000 });
  await f.planner.configure(scope, {
    mode: "execute",
    budgetLimitMicros: 1000,
  });
  await f.run();
  assert.equal(f.calls.length, 0);
  await Promise.all(
    Array.from({ length: 4 }, () => f.restart().selectInitiative(scope, id)),
  );
  state = await f.run();
  assert.deepEqual(f.calls, ["reason", "task", "reason", "review"]);
  assert.equal(state.objectives[0].id, `initiative:${id}`);
  assert.equal(state.objectives[0].status, "completed");
  assert.equal(state.initiatives[0].readClaims.length, 1);
  assert.ok(
    state.operations.every((op) => op.initiativeId === id && op.modelClaimedAt),
  );
  assert.equal(roomPlannerBudget(state).spentMicros, 8);
});

test("ID-only observation replay preserves original grant across reconnect; selection revalidates it", async () => {
  const f = await fixture(),
    id = f.add();
  await f.planner.observeInitiative(scope, id);
  f.reconnect();
  f.observations.get(id).admission.source.generation = 2;
  const replay = await f.restart().observeInitiative(scope, id);
  assert.equal(replay.initiatives[0].admission.source.generation, 1);
  const state = await f.planner.selectInitiative(scope, id);
  assert.equal(state.initiatives[0].status, "suppressed");
  assert.match(state.initiatives[0].stopReason, /revoked/);
  assert.equal(state.events.length, 0);
  assert.equal(f.calls.length, 0);
});

test("obsolete eligible revisions coalesce while already selected work retains its identity", async () => {
  const f = await fixture();
  await f.planner.observeInitiative(scope, f.add("old", 1));
  await f.planner.observeInitiative(scope, f.add("new", 2));
  let state = await f.planner.get(scope);
  assert.equal(state.initiatives[0].status, "suppressed");
  assert.equal(state.initiatives[0].stopReason, "superseded_revision");
  await f.planner.selectInitiative(scope, "new");
  await f.planner.observeInitiative(scope, f.add("latest", 3));
  state = await f.planner.get(scope);
  assert.equal(state.initiatives[1].status, "selected");
  assert.equal(state.initiatives[2].status, "eligible");
});

test("budget waits do not start the execution window; expired triggers persist suppression", async () => {
  const f = await fixture({ budget: 5 });
  await f.select();
  let state = await f.run(2);
  assert.equal(f.calls.length, 0);
  assert.equal(state.initiatives[0].startedAt, undefined);
  f.advance(3600000);
  await f.planner.configure(scope, {
    mode: "execute",
    budgetLimitMicros: 1000,
  });
  state = await f.run();
  assert.equal(state.initiatives.length, 1);
  assert.equal(state.objectives[0].status, "completed");
  const g = await fixture();
  const id = g.add();
  await g.planner.observeInitiative(scope, id);
  g.advance(86400001);
  state = await g.planner.selectInitiative(scope, id);
  assert.equal(state.initiatives[0].stopReason, "expired_trigger");
  assert.equal(state.initiatives[0].status, "suppressed");
});

test("model ceilings include coordination and preserve an honest stopped objective", async () => {
  const f = await fixture({ maximumCalls: 1 });
  await f.select();
  const state = await f.run();
  assert.deepEqual(f.calls, ["reason"]);
  assert.equal(state.operations.length, 1);
  assert.equal(state.objectives[0].status, "waiting");
  assert.equal(state.initiatives[0].stopReason, "model_call_ceiling");
  await f.run();
  assert.equal(f.calls.length, 1);
});

test("uncertain dispatch retains its operation, model claim and reservation across restart", async () => {
  const f = await fixture({
    propose: async () => {
      throw Error("provider response lost");
    },
  });
  await f.select();
  await f.run(1);
  f.advance(400000);
  await f.restart().runOnce(scope);
  const state = await f.run();
  assert.deepEqual(f.calls, ["reason"]);
  assert.equal(state.operations[0].status, "uncertain");
  assert.ok(state.operations[0].modelClaimedAt);
  assert.equal(roomPlannerBudget(state).reservedMicros, 10);
});

test("revocation fences reads and late publication while retaining known usage", async () => {
  let enter, release;
  const entered = new Promise((r) => {
      enter = r;
    }),
    held = new Promise((r) => {
      release = r;
    });
  const f = await fixture({
    propose: async (_, call) => {
      enter(call);
      await held;
      return { proposal: { kind: "respond", content: "Stale draft" }, usage };
    },
  });
  await f.select();
  const running = f.planner.runOnce(scope),
    call = await entered;
  f.revoke();
  await assert.rejects(call.assertRead("mail.read", scope.roomId), /revoked/);
  release();
  await running;
  const state = await f.run();
  assert.equal(f.deliveries.length, 0);
  assert.equal(state.objectives.length, 0);
  assert.equal(roomPlannerBudget(state).spentMicros, 2);
  assert.equal(state.operations[0].status, "rejected");
});

test("external payloads cannot forge initiative authority or widen an admitted objective", async () => {
  const f = await fixture({
    propose: async () => ({
      proposal: {
        kind: "plan",
        objectiveId: "unrestricted",
        expectedObjectiveRevision: null,
        title: "Escalate",
        criteria: [{ id: "c", description: "c" }],
        constraints: [],
        tasks: [
          {
            id: "write",
            participantId: "researcher",
            instruction: "Send",
            expectedOutput: "Sent",
            dependencies: [],
            actionLevel: "draft",
          },
        ],
        content: "Send",
      },
      usage,
    }),
  });
  const id = f.add();
  f.events.get(`source:${id}`).initiativeId = id;
  await assert.rejects(
    f.planner.acceptEvent(scope, `source:${id}`),
    /authority/,
  );
  delete f.events.get(`source:${id}`).initiativeId;
  await f.select(id);
  const state = await f.run();
  assert.equal(state.objectives.length, 0);
  assert.equal(state.operations[0].status, "rejected");
  assert.match(state.operations[0].error, /redirect|restricted/);
});

test("read ceilings persist partial stop without refunding consumed claims", async () => {
  const f = await fixture({
    maximumReadCalls: 1,
    execute: async (_, __, ___, call) => {
      await call.assertRead("mail.read", scope.roomId);
      await assert.rejects(
        call.assertRead("mail.read", scope.roomId),
        /allowance/,
      );
      return {
        result: {
          kind: "blocked",
          content: "Only partial evidence was available",
          evidence: [],
        },
        usage,
      };
    },
  });
  await f.select();
  const state = await f.run();
  assert.equal(state.initiatives[0].readClaims.length, 1);
  assert.equal(state.initiatives[0].stopReason, "read_call_ceiling");
  assert.equal(state.objectives[0].status, "waiting");
  assert.equal(roomPlannerBudget(state).spentMicros, 4);
  await assert.rejects(
    f.planner.assertInitiativePublication(scope, "first"),
    /read_call_ceiling/,
  );
});

test("another initiative cannot interleave with an active investigation", async () => {
  const f = await fixture();
  await f.select(f.add("first"));
  await f.select(f.add("second", 2));
  await f.run(1);
  let state = await f.planner.get(scope);
  assert.ok(state.operations.every((op) => op.initiativeId === "first"));
  await f.run(1);
  state = await f.planner.get(scope);
  assert.equal(
    state.objectives.find((o) => o.initiativeId === "first").status,
    "completed",
  );
  assert.ok(state.operations.every((op) => op.initiativeId === "first"));
  await f.run();
  state = await f.planner.get(scope);
  assert.equal(
    state.objectives.find((o) => o.initiativeId === "second").status,
    "completed",
  );
});

test("owner follow-up cannot shed initiative restrictions from the objective", async () => {
  const f = await fixture();
  await f.select();
  await f.run(1);
  const state = await f.planner.get(scope),
    objective = state.objectives[0];
  f.events.set("owner-followup", {
    id: "owner-followup",
    kind: "message",
    actorId: "owner",
    content: "Please expand the work",
  });
  f.ports.reasoner.propose = async () => ({
    proposal: {
      kind: "plan",
      objectiveId: objective.id,
      expectedObjectiveRevision: objective.revision,
      title: "Expanded",
      criteria: [{ id: "c", description: "More" }],
      constraints: [],
      tasks: [
        {
          id: "expanded",
          participantId: "researcher",
          instruction: "Draft",
          expectedOutput: "Draft",
          dependencies: [],
          actionLevel: "draft",
        },
      ],
      content: "Expand",
    },
    usage,
  });
  await f.planner.acceptEvent(scope, "owner-followup");
  await f.run(3);
  const current = await f.planner.get(scope);
  assert.ok(
    current.operations.some(
      (op) =>
        op.eventId === "owner-followup" &&
        op.status === "rejected" &&
        /unrestricted/.test(op.error),
    ),
  );
  assert.equal(current.objectives[0].initiativeId, "first");
});

test("publication fence rejects stale authority after result completion", async () => {
  const f = await fixture();
  await f.select();
  await f.run();
  assert.equal(
    (await f.planner.assertInitiativePublication(scope, "first")).subject
      .revision,
    1,
  );
  f.revoke();
  await assert.rejects(
    f.planner.assertInitiativePublication(scope, "first"),
    /revoked/,
  );
});

test("pause/resume preserves initiative provenance, original grant and consumed caps", async () => {
  const f = await fixture({ budget: 11 });
  await f.select();
  await f.run(1);
  let state = await f.planner.get(scope);
  const objective = state.objectives[0];
  assert.equal(state.operations.length, 1); // Initial reasoning fits; the task still waits for Room budget.
  await f.planner.intervene(scope, {
    objectiveId: objective.id,
    expectedRevision: objective.revision,
    action: "pause",
  });
  await f.run(1);
  assert.equal(f.calls.length, 1);
  state = await f.planner.get(scope);
  await f.planner.intervene(scope, {
    objectiveId: objective.id,
    expectedRevision: state.objectives[0].revision,
    action: "resume",
  });
  state = await f.planner.get(scope);
  assert.ok(
    state.events
      .filter((event) => event.kind === "resume")
      .every((event) => event.initiativeId === "first"),
  );
  await f.planner.configure(scope, {
    mode: "execute",
    budgetLimitMicros: 1000,
  });
  state = await f.run();
  assert.ok(
    state.operations.every((operation) => operation.initiativeId === "first"),
  );
  assert.ok(state.operations.length <= 4);
  assert.equal(state.initiatives[0].admission.source.generation, 1);
  assert.equal(state.initiatives[0].startedAt, "2026-11-12T12:00:00.000Z");
});

test("selected initiatives cannot invoke inference after switching to native observe mode", async () => {
  const f = await fixture();
  await f.select();
  await f.planner.configure(scope, {
    mode: "observe",
    budgetLimitMicros: 1000,
  });
  let state = await f.run();
  assert.equal(f.calls.length, 0);
  assert.equal(state.operations.length, 0);
  assert.equal(state.initiatives[0].status, "selected");
  await f.planner.configure(scope, {
    mode: "execute",
    budgetLimitMicros: 1000,
  });
  state = await f.run();
  assert.equal(state.objectives[0].status, "completed");
});

test("persisted events explicitly targeting initiative objectives inherit their native grant", async () => {
  const f = await fixture();
  await f.select();
  await f.run(1);
  const state = await f.planner.get(scope),
    objectiveId = state.objectives[0].id;
  f.events.set("targeted-followup", {
    id: "targeted-followup",
    kind: "message",
    actorId: "owner",
    objectiveId,
    content: "Continue this investigation",
  });
  await f.planner.acceptEvent(scope, "targeted-followup");
  assert.equal(
    (await f.planner.get(scope)).events.find(
      (event) => event.id === "targeted-followup",
    ).initiativeId,
    "first",
  );
  await f.run();
  assert.ok(
    (await f.planner.get(scope)).operations.every(
      (operation) => operation.initiativeId === "first",
    ),
  );
  f.events.set("targeted-direct", {
    id: "targeted-direct",
    kind: "message",
    actorId: "owner",
    objectiveId,
    targetParticipantIds: ["researcher"],
    content: "Bypass bounded work",
  });
  await assert.rejects(
    f.planner.acceptEvent(scope, "targeted-direct"),
    /direct routing/,
  );
});
