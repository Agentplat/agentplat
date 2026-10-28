import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRoomRepository } from "@agentplat/rooms";
import { createRoomsApp } from "../dist/index.js";
import { createConversationFixture } from "../../../tests/helpers/room-conversation-scenarios.mjs";

test("opt-in conversation routes preserve native links and scope cursors to the authenticated tenant", async () => {
  const { rooms } = await createConversationFixture(
    new InMemoryRoomRepository(),
  );
  const app = createRoomsApp({ service: rooms, conversations: rooms });
  const headers = {
    "x-agentplat-tenant-id": "owner",
    "content-type": "application/json",
  };
  const sent = await app.request("/rooms/personal/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: "reply",
      role: "human",
      content: "A reply",
      replyToMessageId: "root",
    }),
  });
  assert.equal(sent.status, 201);
  assert.equal((await sent.json()).data.threadId, "root");
  const page = await app.request(
    "/rooms/personal/messages?threadId=root&limit=1",
    { headers },
  );
  assert.equal(page.status, 200);
  const data = (await page.json()).data;
  assert.equal(data.messages.length, 1);
  assert.equal(data.hasMore, true);
  const mismatch = await app.request(
    `/rooms/personal/messages?threadId=another&cursor=${encodeURIComponent(data.nextCursor)}`,
    { headers },
  );
  assert.equal(mismatch.status, 400);
  const cross = await app.request("/rooms/support/messages/root", { headers });
  assert.equal(cross.status, 404);
  assert.equal(
    (await app.request("/rooms/personal/messages?rootsOnly=yes", { headers }))
      .status,
    400,
  );
  assert.equal(
    (
      await createRoomsApp({ service: rooms }).request(
        "/rooms/personal/messages",
        { headers },
      )
    ).status,
    404,
  );
});
