import test from "node:test";
import assert from "node:assert/strict";
import {
  ActorRoomConversations,
  InMemoryRoomConversationStore,
} from "../packages/rooms/dist/index.js";

import { conversationScenarios } from "./helpers/actor-conversation-scenarios.mjs";
const access = (actorId) => ({ tenantId: "tenant", roomId: "room", actorId });
const denied = (e) => e.code === "FORBIDDEN";
test("owner and two clients: audience, references, fresh agent context, revocation, CAS", async () => {
  await conversationScenarios(new InMemoryRoomConversationStore());
});
test("explicit migration fails closed and preserves legacy IDs and author attribution", async () => {
  const api = new ActorRoomConversations(
    new InMemoryRoomConversationStore(),
    async () => true,
  );
  const input = {
    tenantId: "tenant",
    roomId: "room",
    conversationId: "legacy",
    humanParticipantIds: ["human"],
    messages: [
      {
        id: "m",
        tenantId: "tenant",
        roomId: "room",
        role: "human",
        authorParticipantId: "human",
        content: "old",
        createdAt: "2026-01-01T00:00:00Z",
      },
    ],
  };
  await assert.rejects(api.backfill(input), denied);
  await assert.rejects(
    api.backfill({ ...input, ownerActorId: "owner", humanParticipantIds: [] }),
    denied,
  );
  await api.backfill({ ...input, ownerActorId: "owner" });
  assert.equal((await api.read(access("owner"), "legacy")).messages[0].id, "m");
  await assert.rejects(api.read(access("bob"), "legacy"), denied);
  await assert.rejects(
    api.backfill({ ...input, ownerActorId: "owner" }),
    (e) => e.code === "CONFLICT",
  );
});
