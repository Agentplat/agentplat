import test from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryMemoryRevisionStoreV1,
  BoundedContextBuilder,
  readableRoomMemory,
  registerAgentRoomToolBridges,
  AGENT_ROOM_TOOL_IDS,
} from "@agentplat/rooms";
import { InMemoryToolRegistry } from "@agentplat/tools";
import {
  memoryRevisionScenarios,
  memoryRevisionRaceScenarios,
} from "./helpers/memory-revision-scenarios.mjs";
test("memory revisions: isolation, concurrent CAS, immutable history, sharing, validity and retirement", async () => {
  await memoryRevisionScenarios(new InMemoryMemoryRevisionStoreV1());
});
test("legacy context and tool retrieval use identical scoped, unexpired memory", async () => {
  const now = new Date("2026-10-17T12:00:00.000Z");
  const participant = {
    id: "p",
    tenantId: "t",
    type: "agent",
    displayName: "A",
    role: "researcher",
    authorityLevel: 1,
    boundaries: [],
    permissions: [],
    memoryScope: "agent",
  };
  const state = {
    room: { id: "r", tenantId: "t", goal: "test" },
    participants: [participant],
    messages: [],
    artifacts: [],
    policies: [],
    memory: [],
    tasks: [],
  };
  const base = {
    tenantId: "t",
    roomId: "r",
    scope: "room",
    scopeId: "r",
    content: "match",
    source: "test",
    confidence: 1,
    retention: "durable",
    provenance: {},
    createdAt: now.toISOString(),
  };
  state.memory = [
    { ...base, id: "good" },
    {
      ...base,
      id: "expired",
      retention: "until",
      retainUntil: now.toISOString(),
    },
    { ...base, id: "foreign", tenantId: "other" },
    { ...base, id: "other-agent", scope: "agent", scopeId: "other" },
  ];
  assert.deepEqual(
    readableRoomMemory(state, participant, now).map((x) => x.id),
    ["good"],
  );
  const context = new BoundedContextBuilder({ clock: () => now }).build(
    state,
    { id: "task", roomId: "r", acceptanceCriteria: [] },
    participant,
  );
  const registry = new InMemoryToolRegistry();
  await registerAgentRoomToolBridges({
    registry,
    rooms: { getRoomState: async () => state },
    knowledge: {},
    resolveKnowledgeRefs: async () => [],
    clock: () => now,
  });
  const tool = await registry.get(AGENT_ROOM_TOOL_IDS.memorySearch);
  const result = await tool.handler.invoke(
    { query: "match" },
    {
      tenant: { tenantId: "t" },
      toolId: AGENT_ROOM_TOOL_IDS.memorySearch,
      metadata: { roomId: "r", participantId: "p" },
    },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.value.map((x) => x.id),
    context.memory.map((x) => x.id),
  );
});

test("versioned context snapshots and read tools preserve the same evidence and reject forged identity", async () => {
  const {
    MemoryRevisionServiceV1,
    resolveMemoryRevisionSnapshotV1,
    registerMemoryRevisionReadToolV1,
  } = await import("@agentplat/rooms");
  const service = new MemoryRevisionServiceV1(
    new InMemoryMemoryRevisionStoreV1(),
    {
      authenticate: async (user) => ({
        tenantId: "t",
        actor: { actorId: user, actorType: "human" },
      }),
      authorize: async () => true,
    },
  );
  const first = await service.append("alice", {
    memoryId: "p",
    operationId: "create",
    expectedRevision: null,
    subject: { type: "agent", id: "stable" },
    audience: { kind: "personal", subjectId: "alice" },
    content: "concise",
    evidenceRefs: ["message:explicit"],
    observedAt: "2026-01-01T00:00:00.000Z",
    validFrom: "2026-01-01T00:00:00.000Z",
    status: "active",
    reason: "user request",
  });
  const snapshot = await resolveMemoryRevisionSnapshotV1(service, "alice", [
    "p",
  ]);
  const registry = new InMemoryToolRegistry();
  await registerMemoryRevisionReadToolV1({
    registry,
    service,
    context: async () => "alice",
  });
  const tool = await registry.get("agentplat.memory.revisions.read");
  assert.deepEqual(
    (await tool.handler.invoke({ memoryIds: ["p"] }, {})).value,
    snapshot,
  );
  assert.equal(snapshot.references[0].digest, first.digest);
  await assert.rejects(
    tool.handler.invoke({ memoryIds: ["p"], subjectId: "bob" }, {}),
    /memoryIds/,
  );
  await assert.rejects(
    resolveMemoryRevisionSnapshotV1(service, "bob", ["p"]),
    /denied/,
  );
});

test("sharing requires explicit authorization and unavailable access never commits", async () => {
  const { MemoryRevisionServiceV1 } = await import("@agentplat/rooms");
  const store = new InMemoryMemoryRevisionStoreV1();
  let unavailable = false;
  const service = new MemoryRevisionServiceV1(store, {
    authenticate: async () => ({
      tenantId: "t",
      actor: { actorId: "alice", actorType: "human" },
    }),
    authorize: async (_, r) => {
      if (unavailable) throw Error("unavailable");
      return r.operation !== "share";
    },
  });
  const request = {
    memoryId: "preference",
    operationId: "create",
    expectedRevision: null,
    subject: { type: "agent", id: "a" },
    audience: { kind: "personal", subjectId: "alice" },
    content: "brief",
    evidenceRefs: ["declaration:1"],
    observedAt: "2026-01-01T00:00:00.000Z",
    validFrom: "2026-01-01T00:00:00.000Z",
    status: "active",
    reason: "explicit",
  };
  await service.append({}, request);
  await assert.rejects(
    service.append(
      {},
      {
        ...request,
        operationId: "share",
        expectedRevision: 1,
        audience: { kind: "shared", scopeType: "workspace", scopeId: "w" },
      },
    ),
    /denied/,
  );
  unavailable = true;
  await assert.rejects(
    service.append(
      {},
      { ...request, operationId: "edit", expectedRevision: 1 },
    ),
    /unavailable/,
  );
  assert.equal((await store.head("t", "preference")).revision, 1);
});

test("memory reads fence concurrent audience changes and replays respect retention", async () => {
  await memoryRevisionRaceScenarios(new InMemoryMemoryRevisionStoreV1());
});

test("read expiry and sharing policy are checked after asynchronous admission work", async () => {
  const { MemoryRevisionServiceV1 } = await import("@agentplat/rooms");
  let now = "2026-10-17T12:00:00.000Z",
    readChecks = 0,
    shareChecks = 0;
  const store = new InMemoryMemoryRevisionStoreV1();
  const service = new MemoryRevisionServiceV1(
    store,
    {
      authenticate: async () => ({
        tenantId: "t",
        actor: { actorId: "alice", actorType: "human" },
      }),
      authorize: async (_, r) => {
        if (r.operation === "read" && ++readChecks === 2)
          now = "2026-10-17T14:00:00.000Z";
        if (r.operation === "share") return ++shareChecks <= 2;
        return true;
      },
    },
    { clock: () => new Date(now) },
  );
  const input = {
    memoryId: "expired-in-flight",
    operationId: "create",
    expectedRevision: null,
    subject: { type: "agent", id: "a" },
    audience: { kind: "personal", subjectId: "alice" },
    content: "brief",
    evidenceRefs: ["explicit:1"],
    observedAt: now,
    validFrom: now,
    validUntil: "2026-10-17T13:00:00.000Z",
    status: "active",
    reason: "explicit",
  };
  await service.append({}, input);
  assert.equal(await service.read({}, input.memoryId), undefined);
  await assert.rejects(
    service.append(
      {},
      {
        ...input,
        operationId: "share",
        expectedRevision: 1,
        audience: { kind: "shared", scopeType: "workspace", scopeId: "w" },
      },
    ),
    { code: "FORBIDDEN" },
  );
  assert.equal((await store.head("t", input.memoryId)).revision, 1);
});
