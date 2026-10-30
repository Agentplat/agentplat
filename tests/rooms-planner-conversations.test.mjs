import test from "node:test";
import assert from "node:assert/strict";
import {
  BoundedContextBuilder,
  InMemoryRoomRepository,
  InMemoryRoomPlannerStore,
  createAgentRoomPlanner,
  resolveRoomConversation,
  conversationReference,
} from "@agentplat/rooms";
import { createConversationFixture } from "./helpers/room-conversation-scenarios.mjs";

const scope = { tenantId: "owner", roomId: "personal" };
const usage = { costMicros: 1, inputTokens: 1, outputTokens: 1 };
async function fixture(overrides = {}) {
  const f = await createConversationFixture(new InMemoryRoomRepository());
  const store = new InMemoryRoomPlannerStore(),
    events = new Map(),
    calls = [],
    delivered = [];
  const ports = {
    store,
    reservationMicros: { reason: 10, task: 10, direct: 10, review: 10 },
    authorize: async () => {},
    resolveEvent: async (_, id) => events.get(id),
    resolveConversation: async (s, ref) =>
      resolveRoomConversation(f.repository, s.tenantId, s.roomId, ref),
    context: async () => ({
      note: "Coordinator context is supplied by the trusted host",
    }),
    route: async (_, event) => event.targetParticipantIds ?? [],
    reasoner: {
      propose: async (c) => ({
        usage,
        proposal: { kind: "respond", content: `Planner: ${c.event.content}` },
      }),
    },
    execute: async (_, task, objective, call) => {
      calls.push({
        task,
        objective,
        conversation: conversationReference(call),
      });
      return {
        usage,
        result: {
          kind: "result",
          content: "Specialist result",
          evidence: [
            { reference: "report", version: "1", sourceIds: ["source"] },
          ],
        },
      };
    },
    verify: async (_, objective, operations, call) => {
      calls.push({ kind: "review", conversation: conversationReference(call) });
      return {
        usage,
        review: {
          reviewerParticipantId: "reviewer",
          evidence: operations[0].result.evidence[0],
          criteria: [
            { criterionId: "c", verdict: "met", explanation: "Checked" },
          ],
        },
      };
    },
    deliver: async (_, note) => delivered.push(note),
    ...overrides,
  };
  const planner = createAgentRoomPlanner(ports);
  await planner.configure(scope, { mode: "execute", budgetLimitMicros: 1000 });
  async function accept(id, more = {}) {
    const message = await f.rooms.getMessage(scope.tenantId, scope.roomId, id);
    events.set(id, {
      id,
      kind: "message",
      actorId: "human",
      content: message.content,
      messageId: id,
      ...conversationReference(message),
      ...more,
    });
    await planner.acceptEvent(scope, id);
  }
  return { ...f, store, events, ports, planner, calls, delivered, accept };
}

test("general messages reach Planner; direct mentions retain thread without another model turn", async () => {
  let reasoning = 0;
  const f = await fixture({
    reasoner: {
      propose: async () => {
        reasoning++;
        return {
          usage,
          proposal: { kind: "respond", content: "Coordinated answer" },
        };
      },
    },
  });
  await f.accept("root");
  await f.planner.runOnce(scope);
  await f.planner.runOnce(scope);
  assert.equal(reasoning, 1);
  assert.equal(f.calls.length, 0);
  assert.equal(f.delivered[0].threadId, "root");
  assert.equal(f.delivered[0].replyToMessageId, "root");
  await f.send("direct", {
    replyToMessageId: "root",
    targetParticipantId: "mail",
  });
  await f.accept("direct", { targetParticipantIds: ["mail"] });
  await f.planner.runOnce(scope);
  await createAgentRoomPlanner(f.ports).runOnce(scope);
  assert.equal(reasoning, 1);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].task.participantId, "mail");
  assert.deepEqual(f.calls[0].conversation, {
    threadId: "root",
    replyToMessageId: "direct",
  });
  assert.equal(f.delivered.at(-1).replyToMessageId, "direct");
  assert.equal(
    (await f.planner.get(scope)).events.some((e) => e.id === "direct"),
    true,
    "Planner retains awareness of direct conversation",
  );
});

test("host-bound conversation survives delegation, internal results, verification and delivery", async () => {
  const f = await fixture();
  f.ports.reasoner = {
    propose: async (c) => ({
      usage,
      proposal:
        c.event.kind === "message"
          ? {
              kind: "plan",
              objectiveId: "follow-up",
              expectedObjectiveRevision: null,
              title: "Follow up",
              criteria: [{ id: "c", description: "Verified" }],
              constraints: [],
              content: "Delegating only to mail",
              tasks: [
                {
                  id: "extract",
                  participantId: "mail",
                  instruction: "Extract facts",
                  expectedOutput: "Report",
                  actionLevel: "read",
                  dependencies: [],
                  threadId: "another",
                  replyToMessageId: "another",
                },
              ],
            }
          : {
              kind: "wait",
              objectiveId: "follow-up",
              content: "Await verification",
            },
    }),
  };
  f.ports.execute = async (_, task, objective, call) => {
    const roomTask = await f.rooms.createTask("owner", "personal", {
      stepId: "delegated",
      assignedParticipantId: task.participantId,
      instruction: task.instruction,
      expectedOutput: task.expectedOutput,
      expectedArtifactKind: "report",
      actionLevel: "read",
      ...conversationReference(task),
    });
    const state = await f.rooms.getRoomState("owner", "personal");
    const context = new BoundedContextBuilder().build(
      state,
      roomTask,
      state.participants.find((p) => p.id === "mail"),
    );
    assert.equal(
      context.transcript.some((m) => m.id === "another"),
      false,
    );
    assert.equal(
      task.threadId,
      "root",
      "model-provided cross-thread fields cannot redirect execution",
    );
    f.calls.push({ task, conversation: conversationReference(call) });
    return {
      usage,
      result: {
        kind: "result",
        content: "Report",
        evidence: [
          { reference: "report", version: "1", sourceIds: ["source"] },
        ],
      },
    };
  };
  await f.accept("root");
  for (let i = 0; i < 6; i++)
    await createAgentRoomPlanner(f.ports).runOnce(scope);
  const state = await f.planner.get(scope);
  assert.equal(state.objectives[0].status, "completed");
  assert.equal(state.objectives[0].threadId, "root");
  assert.equal(state.objectives[0].plans[0].threadId, "root");
  assert.ok(state.operations.every((op) => op.threadId === "root"));
  assert.ok(state.events.every((event) => event.threadId === "root"));
  assert.ok(f.calls.every((call) => call.conversation.threadId === "root"));
  assert.ok(f.delivered.every((note) => note.threadId === "root"));
});

test("event references are validated against storage and participate in idempotency", async () => {
  const f = await fixture();
  await f.accept("root");
  f.events.set("root", {
    ...f.events.get("root"),
    threadId: "another",
    messageId: "another",
  });
  await assert.rejects(f.planner.acceptEvent(scope, "root"), /identity reused/);
  f.events.set("mismatch", {
    id: "mismatch",
    actorId: "human",
    kind: "message",
    content: "Bad",
    threadId: "root",
    messageId: "another",
  });
  await assert.rejects(f.planner.acceptEvent(scope, "mismatch"));
  const noResolver = createAgentRoomPlanner({
    ...f.ports,
    resolveConversation: undefined,
  });
  await assert.rejects(
    noResolver.acceptEvent(scope, "root"),
    /resolver is required/,
  );
});

test("external events and timers retain provenance without becoming owner objectives or direct commands", async () => {
  const f = await fixture();
  for (const kind of ["external", "timer"]) {
    const event = {
      id: kind,
      kind,
      actorId: "connector",
      content: "A new occurrence",
      provenance: {
        source: "connector",
        eventId: kind,
        occurredAt: "2026-10-28T12:00:00Z",
      },
    };
    f.events.set(kind, event);
    await f.planner.acceptEvent(scope, kind);
  }
  await f.planner.runOnce(scope);
  await f.planner.runOnce(scope);
  assert.equal((await f.planner.get(scope)).objectives.length, 0);
  f.ports.reasoner = { propose: async () => ({ usage, proposal: {
    kind: "plan", objectiveId: "injected-objective", expectedObjectiveRevision: null, title: "Unrequested work", criteria: [{ id: "c", description: "Work" }], constraints: [], content: "Start work",
    tasks: [{ id: "injected-task", participantId: "mail", instruction: "Work", expectedOutput: "Report", actionLevel: "read", dependencies: [] }],
  } }) };
  f.events.set("injected", { ...f.events.get("external"), id: "injected" });
  await f.planner.acceptEvent(scope, "injected");
  await f.planner.runOnce(scope);
  assert.equal((await f.planner.get(scope)).objectives.length, 0, "external evidence cannot acquire owner authority");
  assert.equal(f.calls.length, 0);
  f.events.set("forged", {
    ...f.events.get("external"),
    id: "forged",
    targetParticipantIds: ["mail"],
  });
  await assert.rejects(f.planner.acceptEvent(scope, "forged"));
  f.events.set("missing", {
    id: "missing",
    kind: "external",
    actorId: "collector",
    content: "No provenance",
  });
  await assert.rejects(f.planner.acceptEvent(scope, "missing"));
});
