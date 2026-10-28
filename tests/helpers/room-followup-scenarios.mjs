import assert from "node:assert/strict";
import {
  RoomSituationServiceV1,
  MemoryProposalServiceV1,
  MemoryRevisionServiceV1,
} from "@agentplat/rooms";

export function followupFixture(stores) {
  let now = "2026-10-28T12:00:00.000Z",
    allowed = true;
  const owner = { tenant: "tenant", id: "owner", type: "human" },
    agent = { tenant: "tenant", id: "agent", type: "machine" };
  const authenticate = async (c) =>
    c
      ? { tenantId: c.tenant, actor: { actorId: c.id, actorType: c.type } }
      : null;
  const options = { clock: () => new Date(now) };
  const situationAccess = {
    authenticate,
    authorize: async (p, r) =>
      allowed &&
      p.actor.actorId !== "intruder" &&
      (!r.roomIds ||
        r.roomIds.every((id) => ["room-a", "room-b"].includes(id))) &&
      (!r.situation ||
        (["room-a", "room-b"].includes(r.situation.primaryRoomId) &&
          r.situation.links.every((link) =>
            ["room-a", "room-b"].includes(link.roomId),
          ))),
  };
  const proposalAccess = {
    authenticate,
    authorize: async (p, r) =>
      allowed &&
      p.actor.actorId !== "intruder" &&
      (!r.proposal ||
        r.proposal.audience.kind !== "personal" ||
        r.proposal.audience.subjectId === p.actor.actorId ||
        r.proposal.proposedBy === p.actor.actorId),
  };
  const memoryAccess = { authenticate, authorize: async () => allowed };
  const memory = new MemoryRevisionServiceV1(
    stores.memory,
    memoryAccess,
    options,
  );
  const situations = new RoomSituationServiceV1(
      stores.situations,
      situationAccess,
      options,
    ),
    proposals = new MemoryProposalServiceV1(
      stores.proposals,
      memory,
      proposalAccess,
      options,
    );
  const content = (extra = {}) => ({
    primaryRoomId: "room-a",
    title: "Verify the obligation",
    summary: "Evidence shows a deadline",
    nextAction: "Check the current state",
    status: "open",
    links: [{ roomId: "room-a", threadId: "thread-1", messageId: "message-1" }],
    evidenceRefs: ["mail:1"],
    artifactRefs: ["artifact:1"],
    attributes: { period: "2026-10" },
    deadline: { at: "2026-10-29T12:00:00.000Z", certainty: "confirmed" },
    attention: { rank: 10, reason: "Configured application policy" },
    ...extra,
  });
  const apply = (id, extra = {}) => ({
    id,
    operationId: `create-${id}`,
    expectedRevision: null,
    content: content(),
    cause: {
      kind: "evidence",
      explanation: "A new source message",
      references: ["analysis:1"],
    },
    ...extra,
  });
  const proposal = (id, extra = {}) => ({
    id,
    operationId: `propose-${id}`,
    memoryId: `memory-${id}`,
    expectedMemoryRevision: null,
    subject: { type: "person", id: "owner" },
    audience: { kind: "personal", subjectId: "owner" },
    content: { preference: "Personal deadlines deserve attention" },
    evidenceRefs: ["owner-correction:1"],
    reason: "Repeated explicit correction suggests a preference",
    ...extra,
  });
  const decide = (id) => ({
    id,
    operationId: `accept-${id}`,
    expectedRevision: 1,
    reference: `owner-click:${id}`,
  });
  return {
    ...stores,
    owner,
    agent,
    situations,
    proposals,
    memory,
    proposal,
    decide,
    apply,
    content,
    options,
    situationAccess,
    proposalAccess,
    memoryAccess,
    setTime: (value) => (now = value),
    disable: () => (allowed = false),
    enable: () => (allowed = true),
  };
}

export async function roomFollowupScenarios(t, setup) {
  const scenarios = {
    async "situations retain identity, revisions, exact operations and evidence across views"(
      f,
    ) {
      const input = f.apply("obligation"),
        [first, replay] = await Promise.all([
          f.situations.apply(f.agent, input),
          f.situations.apply(f.agent, input),
        ]);
      assert.deepEqual(first, replay);
      const updated = await f.situations.apply(f.agent, {
        ...input,
        operationId: "new-email",
        expectedRevision: 1,
        content: f.content({
          summary: "A new reply clarifies the deadline",
          links: [...first.links, { roomId: "room-b", threadId: "thread-2" }],
        }),
      });
      assert.equal(updated.id, first.id);
      assert.equal(updated.revision, 2);
      const reopened = new RoomSituationServiceV1(
        f.situationsStore,
        f.situationAccess,
        f.options,
      );
      // The public reconstruction below uses the same durable adapter, not a new empty state.
      assert.equal(
        (await reopened.read(f.owner, "obligation")).links.length,
        2,
      );
      assert.deepEqual(
        (await f.situations.history(f.owner, "obligation")).map(
          (r) => r.operationId,
        ),
        [input.operationId, "new-email"],
      );
      assert.equal(
        (await f.situations.apply(f.agent, input)).revision,
        1,
        "an exact operation replays its immutable receipt",
      );
      await assert.rejects(
        f.situations.apply(f.agent, {
          ...input,
          content: f.content({ title: "Substitution" }),
        }),
      );
      await assert.rejects(
        f.situations.apply(f.agent, {
          ...input,
          operationId: "stale",
          expectedRevision: 1,
        }),
      );
      await assert.rejects(
        f.situations.apply(f.agent, {
          ...input,
          operationId: "move",
          expectedRevision: 2,
          content: f.content({ primaryRoomId: "room-b" }),
        }),
      );
      assert.equal(
        await f.situations.read(
          { ...f.owner, tenant: "foreign" },
          "obligation",
        ),
        undefined,
      );
      await assert.rejects(
        f.situations.read({ ...f.owner, id: "intruder" }, "obligation"),
      );
    },
    async "closing requires evidence or owner instruction; reading and policy never resolve a matter"(
      f,
    ) {
      const input = f.apply("close"),
        first = await f.situations.apply(f.agent, input);
      await f.situations.read(f.owner, "close");
      assert.equal((await f.situations.read(f.owner, "close")).status, "open");
      const closed = {
        ...input,
        operationId: "close-policy",
        expectedRevision: 1,
        content: f.content({ status: "resolved" }),
        cause: {
          kind: "policy",
          explanation: "Absent from the next report",
          references: ["report:2"],
        },
      };
      await assert.rejects(f.situations.apply(f.agent, closed));
      await assert.rejects(
        f.situations.apply(f.agent, {
          ...closed,
          cause: {
            kind: "owner_instruction",
            explanation: "Pretend the owner paid",
            references: ["model:claim"],
          },
        }),
      );
      const resolved = await f.situations.apply(f.owner, {
        ...closed,
        operationId: "owner-paid",
        cause: {
          kind: "owner_instruction",
          explanation: "I confirmed the payment",
          references: ["owner-message:paid"],
        },
      });
      assert.equal(resolved.status, "resolved");
      await assert.rejects(
        f.situations.apply(f.agent, {
          ...input,
          operationId: "reopen-policy",
          expectedRevision: 2,
          cause: {
            kind: "policy",
            explanation: "Still important",
            references: ["policy:1"],
          },
        }),
      );
      const reopened = await f.situations.apply(f.agent, {
        ...input,
        operationId: "new-evidence",
        expectedRevision: 2,
      });
      assert.equal(reopened.status, "open");
      const snoozed = await f.situations.apply(f.owner, {
        ...input,
        operationId: "snooze",
        expectedRevision: 3,
        content: f.content({
          status: "snoozed",
          snoozedUntil: "2026-10-30T08:00:00.000Z",
        }),
        cause: {
          kind: "owner_instruction",
          explanation: "Remind me later",
          references: ["owner-message:snooze"],
        },
      });
      assert.equal(snoozed.status, "snoozed");
      await assert.rejects(
        f.situations.apply(f.owner, {
          ...input,
          operationId: "past-snooze",
          expectedRevision: 4,
          content: f.content({
            status: "snoozed",
            snoozedUntil: "2026-10-27T08:00:00.000Z",
          }),
        }),
      );
      assert.equal(
        (await f.situations.read(f.owner, first.id)).status,
        "snoozed",
      );
    },
    async "authorized multi-room change feeds have bound cursors and include new revisions once"(
      f,
    ) {
      for (const id of ["a", "b", "é", "😀"])
        await f.situations.apply(
          f.agent,
          f.apply(id, {
            content: f.content({
              primaryRoomId: id === "b" ? "room-b" : "room-a",
            }),
          }),
        );
      const first = await f.situations.changes(f.owner, ["room-a", "room-b"], {
        limit: 2,
      });
      assert.equal(first.changes.length, 2);
      const next = await f.situations.changes(f.owner, ["room-b", "room-a"], {
        limit: 2,
        cursor: first.nextCursor,
      });
      assert.equal(next.changes.length, 2);
      assert.equal(
        new Set([...first.changes, ...next.changes].map((r) => r.sequence))
          .size,
        4,
      );
      await assert.rejects(
        f.situations.changes(f.owner, ["room-a"], { cursor: first.nextCursor }),
      );
      await assert.rejects(
        f.situations.changes(
          { ...f.owner, tenant: "foreign" },
          ["room-a", "room-b"],
          { cursor: first.nextCursor },
        ),
      );
      await assert.rejects(f.situations.changes(f.owner, ["forbidden"]));
      await assert.rejects(f.situations.changes(f.owner, []));
      const page = await f.situations.list(f.owner, ["room-a", "room-b"], {
        limit: 2,
      });
      assert.deepEqual(
        page.situations.map((s) => s.id),
        ["a", "b"],
      );
      const last = await f.situations.list(f.owner, ["room-a", "room-b"], {
        limit: 2,
        cursor: page.nextCursor,
      });
      assert.deepEqual(
        last.situations.map((s) => s.id),
        ["é", "😀"],
      );
      const changed = await f.situations.apply(
        f.agent,
        f.apply("a", {
          operationId: "update-a",
          expectedRevision: 1,
          content: f.content({ summary: "New facts" }),
        }),
      );
      const delta = await f.situations.changes(f.owner, ["room-a", "room-b"], {
        cursor: next.nextCursor,
      });
      assert.equal(delta.changes.length, 1);
      assert.equal(delta.changes[0].record.revision, changed.revision);
    },
    async "inferred memory remains pending until a separately authenticated owner accepts"(
      f,
    ) {
      const input = f.proposal("preference");
      await f.proposals.propose(f.agent, input);
      assert.deepEqual(await f.memory.resolve(f.owner, [input.memoryId]), []);
      await assert.rejects(f.proposals.accept(f.agent, f.decide(input.id)));
      await assert.rejects(
        f.proposals.accept({ ...f.owner, type: "machine" }, f.decide(input.id)),
        (e) => e.code === "FORBIDDEN",
      );
      const accepted = await f.proposals.accept(f.owner, f.decide(input.id));
      assert.equal(accepted.status, "accepted");
      const learned = await f.memory.read(f.owner, input.memoryId);
      assert.deepEqual(learned.content, input.content);
      assert.equal(learned.actorId, "owner");
      assert.equal(learned.revision, 1);
      assert.equal(accepted.acceptedMemory.digest, learned.digest);
      assert.equal(
        (await f.proposals.accept(f.owner, f.decide(input.id))).acceptedMemory
          .revision,
        1,
      );
      assert.equal(
        (await f.proposals.propose(f.agent, input)).status,
        "accepted",
      );
      await assert.rejects(
        f.proposals.propose(f.agent, {
          ...input,
          content: "silently change the preference",
        }),
      );
      await assert.rejects(
        f.proposals.reject(f.owner, {
          ...f.decide(input.id),
          operationId: "late-reject",
          expectedRevision: accepted.revision,
        }),
      );
      const history = await f.proposals.history(f.owner, input.id);
      assert.deepEqual(
        history.map((p) => p.status),
        ["pending", "accepting", "accepted"],
      );
    },
    async "rejection and concurrent decisions never install unaccepted preferences"(
      f,
    ) {
      const input = f.proposal("rejected");
      await f.proposals.propose(f.agent, input);
      await f.proposals.reject(f.owner, f.decide(input.id));
      assert.equal(await f.memory.read(f.owner, input.memoryId), undefined);
      await assert.rejects(
        f.proposals.accept(f.owner, {
          ...f.decide(input.id),
          operationId: "accept-rejected",
        }),
      );
      const race = f.proposal("race");
      await f.proposals.propose(f.agent, race);
      const results = await Promise.allSettled([
        f.proposals.accept(f.owner, f.decide(race.id)),
        f.proposals.reject(f.owner, {
          ...f.decide(race.id),
          operationId: "reject-race",
        }),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const decided = await f.proposals.read(f.owner, race.id),
        memory = await f.memory.read(f.owner, race.memoryId);
      assert.equal(!!memory, decided.status === "accepted");
    },
    async "an acceptance recovers after memory commit without installing a second revision"(
      f,
    ) {
      const input = f.proposal("recovery");
      await f.proposals.propose(f.agent, input);
      let lost = true;
      const interrupted = new MemoryProposalServiceV1(
        f.proposalsStore,
        {
          read: (...args) => f.memory.read(...args),
          append: async (...args) => {
            const record = await f.memory.append(...args);
            if (lost) {
              lost = false;
              throw Error("Response lost after memory commit");
            }
            return record;
          },
        },
        f.proposalAccess,
        f.options,
      );
      await assert.rejects(
        interrupted.accept(f.owner, f.decide(input.id)),
        /Response lost/,
      );
      assert.equal(
        (await f.proposals.read(f.owner, input.id)).status,
        "accepting",
      );
      assert.equal((await f.memory.read(f.owner, input.memoryId)).revision, 1);
      const rebuilt = new MemoryProposalServiceV1(
        f.proposalsStore,
        f.memory,
        f.proposalAccess,
        f.options,
      );
      const recovered = await rebuilt.accept(f.owner, f.decide(input.id));
      assert.equal(recovered.status, "accepted");
      assert.equal(recovered.acceptedMemory.revision, 1);
      assert.equal((await f.memory.read(f.owner, input.memoryId)).revision, 1);
    },
    async "a pending proposal cannot overwrite a newer explicit preference"(f) {
      const input = f.proposal("stale");
      await f.proposals.propose(f.agent, input);
      await f.memory.append(f.owner, {
        memoryId: input.memoryId,
        operationId: "explicit",
        expectedRevision: null,
        subject: input.subject,
        audience: input.audience,
        content: { preference: "Explicit correction wins" },
        evidenceRefs: ["owner:explicit"],
        observedAt: "2026-10-28T12:00:00.000Z",
        validFrom: "2026-10-28T12:00:00.000Z",
        status: "active",
        reason: "Explicit owner preference",
      });
      const conflict = await f.proposals.accept(f.owner, f.decide(input.id));
      assert.equal(conflict.status, "conflicted");
      assert.equal(conflict.acceptedMemory, undefined);
      assert.deepEqual((await f.memory.read(f.owner, input.memoryId)).content, {
        preference: "Explicit correction wins",
      });
      assert.equal(
        (await f.proposals.accept(f.owner, f.decide(input.id))).status,
        "conflicted",
      );
    },
    async "acceptance verifies the memory receipt belongs to its exact destination and operation"(
      f,
    ) {
      const input = f.proposal("receipt");
      await f.proposals.propose(f.agent, input);
      const other = await f.memory.append(f.owner, {
        memoryId: "other-memory",
        operationId: "other-operation",
        expectedRevision: null,
        subject: input.subject,
        audience: input.audience,
        content: input.content,
        evidenceRefs: input.evidenceRefs,
        observedAt: "2026-10-28T12:00:00.000Z",
        validFrom: "2026-10-28T12:00:00.000Z",
        status: "active",
        reason: "Unrelated explicit preference",
      });
      const wrong = new MemoryProposalServiceV1(
        f.proposalsStore,
        {
          append: async () => other,
          read: (...args) => f.memory.read(...args),
        },
        f.proposalAccess,
        f.options,
      );
      await assert.rejects(
        wrong.accept(f.owner, f.decide(input.id)),
        (e) => e.code === "ADAPTER_ERROR",
      );
      assert.equal(
        (await f.proposals.read(f.owner, input.id)).status,
        "accepting",
      );
      assert.equal(await f.memory.read(f.owner, input.memoryId), undefined);
    },
    async "proposal authorization, list scope and user retirement survive restart"(
      f,
    ) {
      const input = f.proposal("retire");
      await f.proposals.propose(f.agent, input);
      await f.proposals.accept(f.owner, f.decide(input.id));
      const head = await f.memory.read(f.owner, input.memoryId);
      await f.memory.append(f.owner, {
        memoryId: input.memoryId,
        operationId: "retire",
        expectedRevision: 1,
        subject: input.subject,
        audience: input.audience,
        content: input.content,
        evidenceRefs: ["owner:forget"],
        observedAt: head.observedAt,
        validFrom: head.validFrom,
        status: "retired",
        reason: "Explicit owner retirement",
      });
      assert.deepEqual(await f.memory.resolve(f.owner, [input.memoryId]), []);
      assert.equal(
        (await f.proposals.read(f.owner, input.id)).status,
        "accepted",
        "history remains an audit, not an active memory",
      );
      assert.equal(
        await f.proposals.read({ ...f.owner, tenant: "foreign" }, input.id),
        undefined,
      );
      await assert.rejects(
        f.proposals.read({ ...f.owner, id: "intruder" }, input.id),
      );
      assert.equal(
        (await f.proposals.list(f.owner, input.subject)).proposals.length,
        1,
      );
      f.disable();
      await assert.rejects(f.proposals.read(f.owner, input.id));
      await assert.rejects(f.situations.changes(f.owner, ["room-a"]));
      f.enable();
    },
  };
  for (const [name, run] of Object.entries(scenarios))
    await t.test(name, async () => {
      const resource = await setup();
      const f = followupFixture({
        situations: resource.situations,
        proposals: resource.proposals,
        memory: resource.memory,
      });
      f.situationsStore = resource.situations;
      f.proposalsStore = resource.proposals;
      try {
        await run(f);
      } finally {
        await resource.dispose?.();
      }
    });
}
