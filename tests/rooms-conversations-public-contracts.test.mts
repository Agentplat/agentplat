import {
  InMemoryRoomRepository,
  RoomService,
  BoundedContextBuilder,
  resolveRoomConversation,
  type RoomConversationReference,
  type RoomMessagePageInput,
  type RoomPlannerEvent,
  type RoomPlannerPorts,
  type RoomContextSelection,
} from "@agentplat/rooms";
import type { RoomConversationReference as PublicConversation } from "@agentplat/framework";
import { PostgresRoomRepository } from "@agentplat/rooms-postgres";

const reference: PublicConversation = {
  threadId: "root",
  replyToMessageId: "prompt",
};
const page: RoomMessagePageInput = { threadId: "root", limit: 20 };
const selection: RoomContextSelection = { scope: "thread", threadId: "root" };
const rooms = new RoomService({
  repository: new InMemoryRoomRepository(),
  contextBuilder: new BoundedContextBuilder({ selectContext: () => selection }),
});
void rooms.sendMessage("tenant", "room", {
  role: "human",
  content: "Start",
  startThread: true,
});
void rooms.sendMessage("tenant", "room", {
  role: "agent",
  content: "Reply",
  ...reference,
});
void rooms.listMessages("tenant", "room", page);
const event: RoomPlannerEvent = {
  id: "event",
  messageId: "prompt",
  kind: "message",
  actorId: "owner",
  content: "Question",
  ...reference,
};
const timer: RoomPlannerEvent = {
  id: "timer",
  kind: "timer",
  actorId: "scheduler",
  content: "Due",
  provenance: {
    source: "clock",
    eventId: "slot",
    occurredAt: "2026-10-28T00:00:00Z",
  },
};
const resolve: NonNullable<RoomPlannerPorts["resolveConversation"]> = (
  scope,
  ref: RoomConversationReference,
) =>
  resolveRoomConversation(
    new InMemoryRoomRepository(),
    scope.tenantId,
    scope.roomId,
    ref,
  );
// @ts-expect-error A thread identity is a string, not a model-provided object.
const invalid: RoomConversationReference = { threadId: { roomId: "other" } };
void event;
void timer;
void resolve;
void invalid;
void PostgresRoomRepository;
