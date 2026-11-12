import assert from "node:assert/strict";
import { ActorRoomConversations } from "../../packages/rooms/dist/index.js";
const access = (actorId) => ({ tenantId: "tenant", roomId: "room", actorId });
const denied = (e) => e.code === "FORBIDDEN";
export async function conversationScenarios(store) {
  const members = new Set(["owner", "alice", "bob"]);
  const api = new ActorRoomConversations(
    store,
    async (a) =>
      a.tenantId === "tenant" && a.roomId === "room" && members.has(a.actorId),
  );
  const conversations = {};
  for (const actor of members) {
    const d = await api.create(access(actor));
    conversations[actor] = d;
    await api.append(access(actor), d.id, { content: `${actor} secret` });
  }
  for (const actor of members) {
    const view = await api.getRoomState(access(actor));
    assert.equal(view.conversations.length, 1);
    assert.equal(view.conversations[0].actorId, actor);
    assert.equal((await api.search(access(actor), "secret")).length, 1);
    for (const other of members)
      if (actor !== other) {
        await assert.rejects(
          api.read(access(actor), conversations[other].id),
          denied,
        );
        await assert.rejects(
          api.append(access(actor), conversations[other].id, {
            content: "forged",
          }),
          denied,
        );
        let invoked = false;
        await assert.rejects(
          api.execute(
            access(actor),
            conversations[other].id,
            { agentId: "agent" },
            async () => {
              invoked = true;
              return "leak";
            },
          ),
          denied,
        );
        assert.equal(invoked, false);
      }
  }
  const alice = conversations.alice;
  const bobMessage = (await api.read(access("bob"), conversations.bob.id))
    .messages[0];
  for (const input of [
    { replyTo: bobMessage.id },
    { references: [bobMessage.id] },
  ]) {
    await assert.rejects(
      api.append(access("alice"), alice.id, { content: "forged", ...input }),
      denied,
    );
    await assert.rejects(
      api.execute(
        access("alice"),
        alice.id,
        { agentId: "agent", ...input },
        async () => assert.fail("must reject before execution"),
      ),
      denied,
    );
  }
  await assert.rejects(
    api.resolveReferences(access("alice"), alice.id, [bobMessage.id]),
    denied,
  );
  const own = (await api.read(access("alice"), alice.id)).messages[0];
  await api.execute(
    access("alice"),
    alice.id,
    { agentId: "shared-agent", replyTo: own.id, references: [own.id] },
    async (ctx) => {
      assert.equal(ctx.access.actorId, "alice");
      assert.deepEqual(
        ctx.messages.map((m) => m.content),
        ["alice secret"],
      );
      return "alice answer";
    },
  );
  assert.equal(
    (await api.context(access("alice"), alice.id, 0)).messages.length,
    0,
  );
  assert.equal(
    (await api.context(access("alice"), alice.id, 1)).messages[0].authorId,
    "shared-agent",
  );
  await assert.rejects(
    api.read({ ...access("alice"), tenantId: "other" }, alice.id),
    denied,
  );
  await assert.rejects(
    api.read({ ...access("alice"), roomId: "other" }, alice.id),
    denied,
  );
  const head = await api.read(access("alice"), alice.id);
  const races = await Promise.all(
    [1, 2].map(() =>
      store.compareAndSet(
        { ...head, revision: head.revision + 1 },
        head.revision,
      ),
    ),
  );
  assert.equal(races.filter(Boolean).length, 1);
  members.delete("alice");
  await assert.rejects(api.read(access("alice"), alice.id), denied);
  await assert.rejects(api.search(access("alice"), ""), denied);
  members.add("alice");
  await assert.rejects(
    api.execute(access("alice"), alice.id, { agentId: "agent" }, async () => {
      members.delete("alice");
      return "revoked output";
    }),
    denied,
  );
  members.add("alice");
  assert.ok(
    !(await api.read(access("alice"), alice.id)).messages.some(
      (m) => m.content === "revoked output",
    ),
  );
  return { api, conversation: await api.read(access("alice"), alice.id) };
}
