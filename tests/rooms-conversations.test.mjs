import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRoomRepository, RoomService } from "@agentplat/rooms";
import {
  createConversationFixture,
  roomConversationScenarios,
} from "./helpers/room-conversation-scenarios.mjs";

test("Room conversation consumer contract in memory", async (t) => {
  await roomConversationScenarios(t, async () =>
    createConversationFixture(new InMemoryRoomRepository()),
  );
});

test("legacy adapters accept old inputs and reject native conversation loss", async () => {
  const repository = new InMemoryRoomRepository();
  const legacy = new Proxy(repository, {
    get(target, key) {
      if (key === "transaction")
        return (tenant, work) =>
          target.transaction(tenant, (tx) =>
            work(
              new Proxy(tx, {
                get(t, k) {
                  if (k === "conversationVersion") return undefined;
                  return typeof t[k] === "function" ? t[k].bind(t) : t[k];
                },
              }),
            ),
          );
      return typeof target[key] === "function"
        ? target[key].bind(target)
        : target[key];
    },
  });
  const rooms = new RoomService({ repository: legacy });
  const room = await rooms.createRoom("t", {
    title: "Legacy",
    goal: "Keep working",
  });
  await rooms.sendMessage("t", room.id, {
    role: "human",
    content: "Old client",
  });
  await assert.rejects(
    rooms.sendMessage("t", room.id, {
      role: "human",
      content: "New thread",
      startThread: true,
    }),
    (e) => e.code === "ADAPTER_ERROR",
  );
});
