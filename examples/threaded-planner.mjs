import assert from "node:assert/strict";
import {
  BoundedContextBuilder,
  InMemoryRoomRepository,
  InMemoryRoomPlannerStore,
  RoomService,
  conversationReference,
  createAgentRoomPlanner,
  resolveRoomConversation,
} from "@agentplat/rooms";

// Two consumers of the same contracts. No provider connection or paid model call.
for (const example of [
  {
    room: "personal-mail",
    question: "What needs my attention?",
    fact: "A personal obligation is due tomorrow",
    source: "mail.received",
  },
  {
    room: "support",
    question: "Which customer issue needs attention?",
    fact: "A customer ticket needs an answer today",
    source: "ticket.updated",
  },
]) {
  const repository = new InMemoryRoomRepository(),
    rooms = new RoomService({ repository });
  const tenantId = "demo-owner",
    roomId = example.room,
    scope = { tenantId, roomId };
  await rooms.createRoom(tenantId, {
    id: roomId,
    title: roomId,
    goal: "Track relevant matters",
  });
  await rooms.addParticipant(tenantId, roomId, {
    id: "owner",
    type: "human",
    displayName: "Owner",
    role: "owner",
  });
  await rooms.addParticipant(tenantId, roomId, {
    id: "planner",
    type: "agent",
    displayName: "Planner",
    role: "coordinator",
    runtime: { platform: "fixture" },
  });
  const root = await rooms.sendMessage(tenantId, roomId, {
    authorParticipantId: "owner",
    role: "human",
    content: example.question,
    startThread: true,
  });
  const update = await rooms.sendMessage(tenantId, roomId, {
    role: "system",
    content: example.fact,
    replyToMessageId: root.id,
  });
  const event = {
    id: `source:${update.id}`,
    kind: "external",
    actorId: "verified-connector",
    content: update.content,
    ...conversationReference(update),
    provenance: {
      source: example.source,
      eventId: update.id,
      occurredAt: update.createdAt,
    },
  };
  const ports = {
    store: new InMemoryRoomPlannerStore(),
    reservationMicros: { reason: 10, task: 10, direct: 10, review: 10 },
    // A real host supplies authentication, source verification and Room membership checks here.
    authorize: async () => {},
    resolveEvent: async () => event,
    resolveConversation: (s, ref) =>
      resolveRoomConversation(repository, s.tenantId, s.roomId, ref),
    context: async () => {
      const state = await rooms.getRoomState(tenantId, roomId);
      const context = new BoundedContextBuilder().build(
        state,
        {
          tenantId,
          roomId,
          id: "context",
          instruction: example.question,
          expectedOutput: "Answer",
          acceptanceCriteria: [],
          ...conversationReference(update),
        },
        state.participants.find((p) => p.id === "planner"),
      );
      return {
        messages: context.transcript.map((message) => ({
          id: message.id,
          content: message.content,
        })),
      };
    },
    route: async () => [],
    reasoner: {
      propose: async (context) => ({
        proposal: { kind: "respond", content: context.event.content },
        usage: { costMicros: 0, inputTokens: 0, outputTokens: 0 },
      }),
    },
    execute: async () => {
      throw Error("This fixture does not delegate");
    },
    verify: async () => {
      throw Error("This fixture does not produce work");
    },
    deliver: async (_, note) => {
      await rooms.sendMessage(tenantId, roomId, {
        id: note.id,
        idempotent: true,
        role: "agent",
        authorParticipantId: "planner",
        content: note.content,
        ...conversationReference(note),
      });
    },
  };
  const planner = createAgentRoomPlanner(ports);
  await planner.configure(scope, { mode: "execute", budgetLimitMicros: 100 });
  await planner.acceptEvent(scope, event.id);
  await planner.runOnce(scope);
  await createAgentRoomPlanner(ports).runOnce(scope);
  const page = await rooms.listMessages(tenantId, roomId, {
    threadId: root.id,
  });
  assert.equal(page.messages.length, 3);
  assert.ok(page.messages.every((message) => message.threadId === root.id));
  console.log(
    `${example.room}: ${page.messages.length} persisted messages in one thread; ${example.source} is evidence, not a user instruction.`,
  );
}
