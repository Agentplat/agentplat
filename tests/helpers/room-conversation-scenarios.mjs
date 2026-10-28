import assert from "node:assert/strict";
import { BoundedContextBuilder, RoomService } from "@agentplat/rooms";

export async function createConversationFixture(repository) {
  let sequence = 0;
  const rooms = new RoomService({
    repository,
    idGenerator: () => `generated-${++sequence}`,
    clock: () => new Date("2026-10-28T12:00:00.000Z"),
  });
  for (const tenant of ["owner", "other"]) {
    for (const roomId of ["personal", "support"]) {
      await rooms.createRoom(tenant, {
        id: roomId,
        title: roomId,
        goal: "Follow up on incoming matters",
      });
      for (const [id, type] of [
        ["human", "human"],
        ["mail", "agent"],
        ["planner", "agent"],
      ])
        await rooms.addParticipant(tenant, roomId, {
          id,
          type,
          displayName: id,
          role: id,
          ...(type === "agent" ? { runtime: { platform: "mock" } } : {}),
        });
    }
  }
  const send = (id, extra = {}, roomId = "personal", tenant = "owner") =>
    rooms.sendMessage(tenant, roomId, {
      id,
      role: "human",
      authorParticipantId: "human",
      content: id,
      ...extra,
    });
  const root = await send("root", { startThread: true });
  const another = await send("another", { startThread: true });
  return { rooms, repository, send, root, another };
}

/** The same consumer contract is exercised against memory and a real SQL adapter. */
export async function roomConversationScenarios(t, setup) {
  const scenarios = {
    async "native replies, direct recipients and exact replay survive reopening"(
      f,
    ) {
      const [a, b] = await Promise.all([
        f.send("reply", {
          idempotent: true,
          replyToMessageId: "root",
          targetParticipantId: "mail",
        }),
        f.send("reply", {
          idempotent: true,
          replyToMessageId: "root",
          targetParticipantId: "mail",
        }),
      ]);
      assert.deepEqual(a, b);
      assert.equal(a.threadId, "root");
      assert.equal(a.replyToMessageId, "root");
      const nested = await f.send("nested", { replyToMessageId: "reply" });
      assert.equal(nested.threadId, "root");
      assert.equal(
        nested.targetParticipantId,
        undefined,
        "replying never infers a direct recipient",
      );
      const reopened = new RoomService({
        repository: f.reopen ? await f.reopen() : f.repository,
      });
      assert.equal(
        (await reopened.getMessage("owner", "personal", "reply"))
          .targetParticipantId,
        "mail",
      );
      assert.deepEqual(
        (
          await reopened.listMessages("owner", "personal", { threadId: "root" })
        ).messages
          .map((m) => m.id)
          .sort(),
        ["nested", "reply", "root"],
      );
      const events = await reopened.listEvents("owner", "personal");
      const created = events.filter(
        (event) =>
          event.type === "message_created" &&
          event.payload.messageId === "reply",
      );
      assert.equal(created.length, 1);
      assert.equal(created[0].payload.threadId, "root");
      for (const changed of [
        { replyToMessageId: "another" },
        { targetParticipantId: "planner" },
        { threadId: "another" },
      ])
        await assert.rejects(
          f.send("reply", {
            idempotent: true,
            replyToMessageId: "root",
            targetParticipantId: "mail",
            ...changed,
          }),
          (e) => ["CONFLICT", "VALIDATION_ERROR"].includes(e.code),
        );
    },
    async "references cannot cross rooms, tenants or roots"(f) {
      await f.send("foreign", { startThread: true }, "support");
      await f.send("other-tenant", { startThread: true }, "personal", "other");
      await f.send("child", { replyToMessageId: "root" });
      for (const invalid of [
        { replyToMessageId: "foreign" },
        { replyToMessageId: "other-tenant" },
        { replyToMessageId: "missing" },
        { threadId: "another", replyToMessageId: "child" },
        { threadId: "child" },
        { threadId: "" },
        { replyToMessageId: null },
        { startThread: true, replyToMessageId: "root" },
        { startThread: "yes" },
        { targetParticipantId: "unknown" },
      ])
        await assert.rejects(f.send("invalid", invalid));
      await assert.rejects(
        f.rooms.getMessage("owner", "support", "root"),
        (e) => e.code === "NOT_FOUND",
      );
      await assert.rejects(
        f.rooms.listMessages("other", "support", { threadId: "root" }),
        (e) => e.code === "NOT_FOUND",
      );
      assert.equal(
        (await f.rooms.listMessages("owner", "personal")).messages.some(
          (m) => m.id === "invalid",
        ),
        false,
      );
    },
    async "keyset pages retain cursor scope and roots after concurrent insertion"(
      f,
    ) {
      await f.send("legacy");
      await f.send("reply-a", { replyToMessageId: "root" });
      await f.send("reply-b", { replyToMessageId: "reply-a" });
      const first = await f.rooms.listMessages("owner", "personal", {
        threadId: "root",
        limit: 1,
      });
      assert.equal(first.hasMore, true);
      await f.send("reply-z", { replyToMessageId: "root" });
      const ids = first.messages.map((m) => m.id);
      let page = first;
      while (page.hasMore) {
        page = await f.rooms.listMessages("owner", "personal", {
          threadId: "root",
          limit: 1,
          cursor: page.nextCursor,
        });
        ids.push(...page.messages.map((m) => m.id));
      }
      assert.equal(new Set(ids).size, 4);
      assert.equal(ids.includes("another"), false);
      for (const query of [{ threadId: "another" }, { rootsOnly: true }, {}])
        await assert.rejects(
          f.rooms.listMessages("owner", "personal", {
            ...query,
            cursor: first.nextCursor,
          }),
        );
      for (const limit of [0, -1, 201, NaN, 1.5])
        await assert.rejects(
          f.rooms.listMessages("owner", "personal", { limit }),
        );
      await assert.rejects(
        f.rooms.listMessages("owner", "personal", { cursor: "invalid" }),
      );
      assert.deepEqual(
        (
          await f.rooms.listMessages("owner", "personal", { rootsOnly: true })
        ).messages
          .map((m) => m.id)
          .sort(),
        ["another", "legacy", "root"],
      );
      const legacyReply = await f.send("legacy-reply", {
        replyToMessageId: "legacy",
      });
      assert.equal(legacyReply.threadId, "legacy");
      assert.equal(
        (await f.rooms.getMessage("owner", "personal", "legacy")).threadId,
        undefined,
      );
    },
    async "specialists receive their thread while trusted coordinator policy can span threads"(
      f,
    ) {
      await f.send("reply", { replyToMessageId: "root" });
      const task = await f.rooms.createTask("owner", "personal", {
        id: "task",
        stepId: "task",
        assignedParticipantId: "mail",
        threadId: "root",
        instruction: "Summarize this conversation",
        expectedOutput: "Summary",
        expectedArtifactKind: "text",
        actionLevel: "read",
      });
      assert.equal(task.replyToMessageId, "root");
      await f.rooms.createArtifact("owner", "personal", {
        id: "own",
        title: "Own thread",
        type: "summary",
        content: "own",
        provenance: { sourceMessageIds: ["root"] },
      });
      await f.rooms.createArtifact("owner", "personal", {
        id: "foreign",
        title: "Another thread",
        type: "summary",
        content: "private",
        provenance: { sourceMessageIds: ["another"] },
      });
      await f.rooms.writeMemory("owner", "personal", {
        id: "own-memory",
        scope: "room",
        content: "own memory",
        source: "owner",
        provenance: { threadId: "root" },
      });
      await f.rooms.writeMemory("owner", "personal", {
        id: "foreign-memory",
        scope: "room",
        content: "private memory",
        source: "owner",
        provenance: { threadId: "another" },
      });
      const state = await f.rooms.getRoomState("owner", "personal");
      const participant = state.participants.find((p) => p.id === "mail");
      const context = new BoundedContextBuilder().build(
        state,
        task,
        participant,
      );
      assert.deepEqual(context.transcript.map((m) => m.id).sort(), [
        "reply",
        "root",
      ]);
      assert.deepEqual(context.provenance.artifactIds, ["own"]);
      assert.deepEqual(context.provenance.memoryIds, ["own-memory"]);
      assert.equal(context.task.threadId, "root");
      const coordinator = new BoundedContextBuilder({
        selectContext: () => ({ scope: "room" }),
      }).build(
        state,
        task,
        state.participants.find((p) => p.id === "planner"),
      );
      assert.equal(
        coordinator.transcript.some((m) => m.id === "another"),
        true,
      );
      const delegated = new BoundedContextBuilder({
        selectContext: () => ({
          scope: "thread",
          messageIds: ["another"],
          artifactIds: ["foreign"],
        }),
      }).build(state, task, participant);
      assert.equal(
        delegated.transcript.some((m) => m.id === "another"),
        true,
      );
      assert.equal(
        delegated.artifacts.some((a) => a.id === "foreign"),
        true,
      );
      assert.throws(() =>
        new BoundedContextBuilder().build(
          state,
          { ...task, tenantId: "other" },
          participant,
        ),
      );
      assert.throws(() =>
        new BoundedContextBuilder({ memoryLimit: 0 }).build(state, task, {
          ...participant,
          id: "intruder",
        }),
      );
      assert.throws(() =>
        new BoundedContextBuilder({
          selectContext: () => ({ scope: "thread", threadId: "missing" }),
        }).build(state, task, participant),
      );
      const reopened = f.reopen ? await f.reopen() : f.repository;
      assert.equal((await reopened.getTask("owner", "task")).threadId, "root");
      await assert.rejects(
        f.rooms.createTask("owner", "support", {
          stepId: "bad",
          threadId: "root",
          instruction: "Bad",
          expectedOutput: "Bad",
          expectedArtifactKind: "text",
        }),
      );
    },
    async "threaded context byte limits do not truncate stored messages"(f) {
      await f.send("large", {
        replyToMessageId: "root",
        content: "large ".repeat(20_000),
      });
      const task = await f.rooms.createTask("owner", "personal", {
        stepId: "bounded",
        threadId: "root",
        instruction: "Summarize",
        expectedOutput: "text",
        expectedArtifactKind: "text",
      });
      const state = await f.rooms.getRoomState("owner", "personal");
      const context = new BoundedContextBuilder({
        maximumContextBytes: 2000,
      }).build(
        state,
        task,
        state.participants.find((p) => p.id === "mail"),
      );
      assert.ok(Buffer.byteLength(JSON.stringify(context)) <= 2000);
      assert.ok(context.transcript.some(message => message.id === task.replyToMessageId));
      assert.equal(context.provenance.omittedMessageCount, 1);
      assert.throws(() => new BoundedContextBuilder({ maximumContextBytes: 2000 }).build(state, { ...task, replyToMessageId: "large" }, state.participants.find(p => p.id === "mail")), /exceeds the byte budget/);
      assert.equal(
        (await f.rooms.getMessage("owner", "personal", "large")).content.length,
        120_000,
      );
      assert.throws(() =>
        new BoundedContextBuilder({ maximumContextBytes: 1 }).build(
          state,
          task,
          state.participants.find((p) => p.id === "mail"),
        ),
      );
    },
    async "timestamp ties use the same UTF-8 ordering in both adapters"(f) {
      const ids = ["z", "é", "\uE000", "😀"];
      for (const id of ids) await f.send(id, { replyToMessageId: "root" });
      const seen = [];
      let cursor, more = true;
      while (more) {
        const page = await f.rooms.listMessages("owner", "personal", { threadId: "root", limit: 1, cursor });
        seen.push(...page.messages.map(message => message.id));
        cursor = page.nextCursor; more = page.hasMore;
      }
      assert.deepEqual(seen, ["root", ...ids].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
    },
  };
  for (const [name, scenario] of Object.entries(scenarios))
    await t.test(name, async () => {
      const fixture = await setup();
      try {
        await scenario(fixture);
      } finally {
        await fixture.dispose?.();
      }
    });
}
