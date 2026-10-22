import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRoomRepository, RoomService } from "@agentplat/rooms";
import { InMemoryEventBus } from "@agentplat/events";

test("idempotent Room messages replay once, preserve provenance and isolate Room/tenant identities", async () => {
  const repository = new InMemoryRoomRepository(),
    eventPublisher = new InMemoryEventBus();
  const service = new RoomService({ repository, eventPublisher });
  const room = await service.createRoom("a", {
    title: "Messages",
    goal: "Persist once",
  });
  const input = {
    id: "nonce",
    idempotent: true,
    role: "human",
    content: "Do this",
    metadata: { nested: { b: 2, a: 1 } },
  };
  const results = await Promise.all([
    service.sendMessage("a", room.id, input),
    service.sendMessage("a", room.id, input),
  ]);
  assert.deepEqual(results[0], results[1]);
  const reopened = new RoomService({ repository, eventPublisher });
  assert.deepEqual(
    await reopened.sendMessage("a", room.id, {
      ...input,
      metadata: { nested: { a: 1, b: 2 } },
    }),
    results[0],
  );
  assert.equal((await reopened.getRoomState("a", room.id)).messages.length, 1);
  assert.equal(
    eventPublisher.listPublished().filter((e) => e.type === "message_created")
      .length,
    1,
  );
  for (const changed of [
    { content: "Other" },
    { role: "system" },
    { metadata: { nested: { a: 2, b: 2 } } },
  ])
    await assert.rejects(
      reopened.sendMessage("a", room.id, { ...input, ...changed }),
      (e) => e.code === "CONFLICT",
    );
  const another = await reopened.createRoom("a", {
    title: "Other room",
    goal: "Stay separate",
  });
  await assert.rejects(
    reopened.sendMessage("a", another.id, input),
    (e) => e.code === "CONFLICT",
  );
  const tenantRoom = await reopened.createRoom("b", {
    title: "Other tenant",
    goal: "Stay separate",
  });
  await reopened.sendMessage("b", tenantRoom.id, input);
  await assert.rejects(
    reopened.sendMessage("b", room.id, input),
    (e) => e.code === "NOT_FOUND",
  );
});

test("idempotent intake requires an explicit identity and fails closed for legacy repositories", async () => {
  const base = new InMemoryRoomRepository();
  const repository = base,
    transact = base.transaction.bind(base);
  repository.transaction = (tenant, work) =>
    transact(tenant, (tx) => {
      tx.insertMessageIfAbsent = undefined;
      return work(tx);
    });
  const service = new RoomService({ repository });
  const room = await service.createRoom("t", {
    title: "Legacy",
    goal: "Keep existing behavior",
  });
  const input = { role: "human", content: "Message", idempotent: true };
  await assert.rejects(
    service.sendMessage("t", room.id, input),
    (e) => e.code === "VALIDATION_ERROR",
  );
  await assert.rejects(
    service.sendMessage("t", room.id, { ...input, id: "m" }),
    (e) => e.code === "ADAPTER_ERROR",
  );
  await service.sendMessage("t", room.id, {
    role: "human",
    content: "Legacy message",
  });
  assert.equal((await service.getRoomState("t", room.id)).messages.length, 1);
});
