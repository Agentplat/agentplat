import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { IncrementalEvidenceServiceV1 } from "@agentplat/events";
import {
  RoomSituationServiceV1,
  MemoryProposalServiceV1,
} from "@agentplat/framework";
import { RoomService, MemoryRevisionServiceV1 } from "@agentplat/rooms";
import {
  createPostgresPool,
  runMigrations,
  PostgresRoomRepository,
  PostgresIncrementalEvidenceStoreV1,
  PostgresRoomSituationStoreV1,
  PostgresMemoryProposalStoreV1,
  PostgresMemoryRevisionStoreV1,
  runMemoryRevisionMigrations,
  runIncrementalEvidenceMigrations,
  runRoomFollowupMigrations,
} from "@agentplat/rooms-postgres";

assert.equal(process.env.AGENTPLAT_POSTGRES_TEST, "1");
const entry = import.meta.resolve("@agentplat/rooms-postgres");
for (const directory of [
  "incremental-evidence/001_incremental_evidence",
  "room-followup/001_room_followup",
])
  for (const direction of ["up", "down"])
    assert.ok(
      (
        await readFile(
          new URL(`../migrations/${directory}.${direction}.sql`, entry),
          "utf8",
        )
      ).length,
    );
const schema = `followup_consumer_${randomUUID().replaceAll("-", "")}`;
let pool = createPostgresPool();
const owner = {
    tenantId: "packed-owner",
    actor: { actorId: "owner", actorType: "human" },
  },
  worker = {
    tenantId: "packed-owner",
    actor: { actorId: "worker", actorType: "machine" },
  };
const clock = () => new Date("2026-10-28T12:00:00.000Z");
const components = () => {
  const memory = new MemoryRevisionServiceV1(
    new PostgresMemoryRevisionStoreV1(pool, { schema }),
    {
      authenticate: async (c) => c,
      authorize: async (p) =>
        p.actor.actorId === "owner" && p.actor.actorType === "human",
    },
    { clock },
  );
  return {
    processing: new IncrementalEvidenceServiceV1(
      new PostgresIncrementalEvidenceStoreV1(pool, { schema }),
      {
        authenticate: async (c) => ({
          tenantId: c.tenantId,
          actorId: c.actor.actorId,
        }),
        authorize: async (p, r) =>
          p.tenantId === owner.tenantId &&
          r.consumerId === "assistant" &&
          r.source === "mail" &&
          ((p.actorId === "worker" &&
            ["receive", "read", "claim", "settle", "project"].includes(
              r.operation,
            )) ||
            (p.actorId === "owner" &&
              ["read", "reconcile", "compact"].includes(r.operation))),
      },
      { clock },
    ),
    situations: new RoomSituationServiceV1(
      new PostgresRoomSituationStoreV1(pool, { schema }),
      {
        authenticate: async (c) => c,
        authorize: async (p) => p.tenantId === owner.tenantId,
      },
      { clock },
    ),
    proposals: new MemoryProposalServiceV1(
      new PostgresMemoryProposalStoreV1(pool, { schema }),
      memory,
      {
        authenticate: async (c) => c,
        authorize: async (p, r) =>
          p.tenantId === owner.tenantId &&
          ((r.operation === "propose" && p.actor.actorId === "worker") ||
            (["read", "history"].includes(r.operation) &&
              r.proposal?.proposedBy === p.actor.actorId) ||
            (p.actor.actorId === "owner" && p.actor.actorType === "human")),
      },
      { clock },
    ),
    memory,
  };
};
try {
  await runMigrations(pool, { schema, createSchema: true });
  await runMemoryRevisionMigrations(pool, { schema });
  await runIncrementalEvidenceMigrations(pool, { schema });
  await runRoomFollowupMigrations(pool, { schema });
  const rooms = new RoomService({
    repository: new PostgresRoomRepository(pool, { schema }),
    clock,
  });
  const room = await rooms.createRoom(owner.tenantId, {
    id: "room",
    title: "Consumer room",
    goal: "Follow up facts",
  });
  const root = await rooms.sendMessage(owner.tenantId, room.id, {
    role: "human",
    content: "Track this matter",
    startThread: true,
  });
  const first = components(),
    scope = { consumerId: "assistant", source: "mail" };
  const batch = {
    ...scope,
    operationId: "intake",
    checkpoint: { expectedRevision: null, position: "cursor-1" },
    events: [
      {
        event: {
          tenantId: owner.tenantId,
          id: "mail-1",
          source: "mail",
          type: "message.received",
          occurredAt: clock().toISOString(),
          payload: { reference: "mail:1" },
        },
        evidence: [
          {
            evidenceId: "1",
            evidenceRevision: "original",
            reference: "mail:1",
          },
        ],
      },
    ],
  };
  await first.processing.receiveBatch(worker, batch);
  const claim = await first.processing.claim(worker, {
    ...scope,
    workerId: "consumer-1",
  });
  const result = await first.processing.complete(
    worker,
    claim,
    { summary: "Known source facts" },
    "analysis:1",
  );
  const key = { ...scope, evidenceId: "1", evidenceRevision: "original" };
  await first.processing.project(
    worker,
    key,
    async ({ operationId, result, resultReference }) => {
      await first.situations.apply(worker, {
        id: "matter",
        operationId,
        expectedRevision: null,
        content: {
          primaryRoomId: room.id,
          title: "A tracked matter",
          summary: result.summary,
          status: "open",
          links: [{ roomId: room.id, threadId: root.id, messageId: root.id }],
          evidenceRefs: [resultReference],
          artifactRefs: [],
          attributes: {},
        },
        cause: {
          kind: "evidence",
          explanation: "Source facts",
          references: [resultReference],
        },
      });
      await first.proposals.propose(worker, {
        id: "preference",
        operationId,
        memoryId: "personal-preference",
        expectedMemoryRevision: null,
        subject: { type: "person", id: "owner" },
        audience: { kind: "personal", subjectId: "owner" },
        content: { attention: "deadlines" },
        evidenceRefs: [resultReference],
        reason: "Pattern requiring review",
      });
    },
  );
  assert.equal(
    await first.memory.read(owner, "personal-preference"),
    undefined,
  );
  const decision = {
    id: "preference",
    operationId: "owner-accept",
    expectedRevision: 1,
    reference: "owner-click:1",
  };
  await assert.rejects(first.proposals.accept(worker, decision));
  await first.proposals.accept(owner, decision);
  await pool.end();
  pool = createPostgresPool();
  const reopened = components();
  assert.equal((await reopened.situations.read(owner, "matter")).revision, 1);
  assert.equal(
    (await reopened.memory.read(owner, "personal-preference")).revision,
    1,
  );
  assert.equal(
    (await reopened.proposals.read(owner, "preference")).status,
    "accepted",
  );
  assert.equal(
    (await reopened.processing.pendingProjections(worker, scope)).length,
    0,
  );
  const replay = {
    ...batch,
    operationId: "duplicate-event",
    checkpoint: undefined,
  };
  assert.equal(
    (await reopened.processing.receiveBatch(worker, replay)).insertedEvidence,
    0,
  );
  assert.equal(
    await reopened.processing.claim(worker, {
      ...scope,
      workerId: "consumer-2",
    }),
    undefined,
  );
  assert.equal(
    (await reopened.processing.read(worker, key)).resultDigest,
    result.resultDigest,
  );
  console.log(
    "Follow-up packed consumer passed evidence checkpoint/receipts, situation projection, reviewed learning, independent migrations and new-pool recovery.",
  );
} finally {
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await pool.end();
}
