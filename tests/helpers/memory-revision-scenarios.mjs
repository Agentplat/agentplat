import assert from "node:assert/strict";
import { MemoryRevisionServiceV1 } from "@agentplat/rooms";
export async function memoryRevisionScenarios(store) {
  let now = "2026-10-17T12:00:00.000Z",
    shared = true;
  const access = {
    authenticate: async (c) =>
      c
        ? {
            tenantId: c.tenant ?? "t",
            actor: { actorId: c.user, actorType: "human" },
          }
        : null,
    authorize: async (p, r) =>
      r.audience.kind === "personal" ||
      (shared && ["alice", "bob"].includes(p.actor.actorId)),
  };
  const service = new MemoryRevisionServiceV1(store, access, {
    clock: () => new Date(now),
  });
  const alice = { user: "alice" },
    bob = { user: "bob" };
  const input = {
    memoryId: "preference",
    operationId: "create",
    expectedRevision: null,
    subject: { type: "agent", id: "stable-agent" },
    audience: { kind: "personal", subjectId: "alice" },
    content: { language: "es" },
    evidenceRefs: ["declaration:1"],
    observedAt: now,
    validFrom: now,
    status: "active",
    reason: "explicit preference",
  };
  const [first, replay] = await Promise.all([
    service.append(alice, input),
    service.append(alice, input),
  ]);
  assert.deepEqual(first, replay);
  assert.equal(first.actorId, "alice");
  await assert.rejects(service.read(bob, input.memoryId), /denied/);
  await assert.rejects(service.read(null, input.memoryId), /denied/);
  assert.equal(
    await service.read({ user: "alice", tenant: "other" }, input.memoryId),
    undefined,
  );
  await assert.rejects(
    service.append(alice, { ...input, content: "substituted" }),
    /changed/,
  );
  const updates = await Promise.allSettled(
    ["a", "b"].map((operationId) =>
      service.append(alice, {
        ...input,
        operationId,
        expectedRevision: 1,
        content: operationId,
      }),
    ),
  );
  assert.equal(updates.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal((await store.head("t", "preference")).revision, 2);
  const current = await service.read(alice, "preference");
  current.content = "mutated";
  assert.notEqual((await service.read(alice, "preference")).content, "mutated");
  assert.equal(
    (await service.read(alice, "preference", 1)).content.language,
    "es",
  );
  const sharedRevision = await service.append(alice, {
    ...input,
    operationId: "share",
    expectedRevision: 2,
    audience: { kind: "shared", scopeType: "workspace", scopeId: "w" },
    validUntil: "2026-10-18T00:00:00.000Z",
  });
  assert.equal(
    (await service.read(bob, "preference")).digest,
    sharedRevision.digest,
  );
  // Sharing current content does not expose old personal revisions.
  await assert.rejects(service.read(bob, "preference", 1), /denied/);
  shared = false;
  await assert.rejects(service.read(bob, "preference"), /denied/);
  shared = true;
  now = "2026-10-18T00:00:00.000Z";
  assert.equal(await service.read(bob, "preference"), undefined);
  assert.equal((await service.read(bob, "preference", 3)).revision, 3);
  await service.append(alice, {
    ...input,
    operationId: "retire",
    expectedRevision: 3,
    status: "retired",
    reason: "corrected",
    retainUntil: "2026-10-19T00:00:00.000Z",
  });
  assert.equal(await service.read(alice, "preference"), undefined);
  await assert.rejects(service.read(bob, "preference", 3), /denied/);
  now = "2026-10-19T00:00:00.000Z";
  assert.equal(await service.read(alice, "preference", 1), undefined);
  await assert.rejects(
    service.append(alice, {
      ...input,
      memoryId: "invalid",
      observedAt: "2027-01-01T00:00:00.000Z",
    }),
    /future/,
  );
  await assert.rejects(
    service.append(alice, { ...input, memoryId: "invalid", evidenceRefs: [] }),
    /Evidence/,
  );
  const before = await store.head("t", "preference");
  await assert.rejects(
    store.commit({ ...before, content: "tampered" }, 3),
    /digest/,
  );
  assert.deepEqual(await store.head("t", "preference"), before);
  return before;
}

/** Regression checks shared by memory and PostgreSQL adapters. */
export async function memoryRevisionRaceScenarios(store) {
  let now = "2026-10-17T12:00:00.000Z";
  const access = {
    authenticate: async (user) => ({
      tenantId: "t",
      actor: { actorId: user, actorType: "human" },
    }),
    authorize: async () => true,
  };
  const service = new MemoryRevisionServiceV1(store, access, {
    clock: () => new Date(now),
  });
  const input = {
    memoryId: "read-race",
    operationId: "create",
    expectedRevision: null,
    subject: { type: "agent", id: "stable" },
    audience: { kind: "shared", scopeType: "workspace", scopeId: "w" },
    content: "private after update",
    evidenceRefs: ["explicit:1"],
    observedAt: now,
    validFrom: now,
    status: "active",
    reason: "explicit",
  };
  await service.append("alice", input);
  const reader = new MemoryRevisionServiceV1(
    {
      head: (...args) => store.head(...args),
      operation: (...args) => store.operation(...args),
      commit: (...args) => store.commit(...args),
      revision: async (...args) => {
        await service.append("alice", {
          ...input,
          operationId: "restrict",
          expectedRevision: 1,
          audience: { kind: "personal", subjectId: "alice" },
        });
        return store.revision(...args);
      },
    },
    access,
    { clock: () => new Date(now) },
  );
  await assert.rejects(reader.read("bob", "read-race", 1), {
    code: "CONFLICT",
  });
  await assert.rejects(service.read("bob", "read-race"), { code: "FORBIDDEN" });

  const retained = {
    ...input,
    memoryId: "retained-replay",
    audience: { kind: "personal", subjectId: "alice" },
    retainUntil: "2026-10-18T00:00:00.000Z",
  };
  await service.append("alice", retained);
  now = retained.retainUntil;
  await assert.rejects(service.append("alice", retained), { code: "CONFLICT" });

  const invalid = { ...input, memoryId: "invalid-json" };
  const cycle = {};
  cycle.self = cycle;
  await assert.rejects(
    service.append("alice", { ...invalid, content: cycle }),
    { code: "VALIDATION_ERROR" },
  );
  await assert.rejects(
    service.append("alice", { ...invalid, content: Array(1) }),
    { code: "VALIDATION_ERROR" },
  );
  const extra = [];
  extra.metadata = true;
  await assert.rejects(
    service.append("alice", { ...invalid, content: extra }),
    { code: "VALIDATION_ERROR" },
  );
  assert.equal(await store.head("t", invalid.memoryId), undefined);
}
