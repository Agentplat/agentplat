import assert from "node:assert/strict";
import {
  IncrementalEvidenceServiceV1,
  InMemoryIncrementalEvidenceStoreV1,
} from "@agentplat/events";
import {
  RoomService,
  InMemoryRoomRepository,
  RoomSituationServiceV1,
  InMemoryRoomSituationStoreV1,
  MemoryProposalServiceV1,
  InMemoryMemoryProposalStoreV1,
  MemoryRevisionServiceV1,
  InMemoryMemoryRevisionStoreV1,
} from "@agentplat/rooms";

// Synthetic fixtures only: no provider, paid inference, credentials or external writes.
const owner = {
  tenantId: "example",
  actor: { actorId: "owner", actorType: "human" },
};
const analyst = {
  tenantId: "example",
  actor: { actorId: "analyst", actorType: "machine" },
};
const clock = () => new Date("2026-10-28T12:00:00.000Z");
const rooms = new RoomService({
  repository: new InMemoryRoomRepository(),
  clock,
});
const sources = [
  {
    source: "personal-mail",
    title: "Check the obligation before its deadline",
    summary: "A new source message contains a personal deadline",
    preference: "Personal deadlines deserve early attention",
    rank: 10,
  },
  {
    source: "support-tickets",
    title: "Respond to the customer ticket",
    summary: "A newly updated support ticket needs a response",
    preference: "Customer response commitments deserve attention",
    rank: 5,
  },
];
const processing = new IncrementalEvidenceServiceV1(
  new InMemoryIncrementalEvidenceStoreV1(),
  {
    authenticate: async (context) => ({
      tenantId: context.tenantId,
      actorId: context.actor.actorId,
    }),
    authorize: async (p, r) =>
      p.tenantId === owner.tenantId &&
      r.consumerId === "assistant" &&
      sources.some((s) => s.source === r.source) &&
      ((p.actorId === "analyst" &&
        ["receive", "read", "claim", "settle", "project"].includes(
          r.operation,
        )) ||
        (p.actorId === "owner" &&
          ["read", "reconcile", "compact"].includes(r.operation))),
  },
  { clock },
);
const situationStore = new InMemoryRoomSituationStoreV1();
const allowedRooms = new Set();
const situations = new RoomSituationServiceV1(
  situationStore,
  {
    authenticate: async (context) => context,
    authorize: async (p, r) =>
      p.tenantId === owner.tenantId &&
      (r.roomIds?.every((id) => allowedRooms.has(id)) ?? true) &&
      (!r.situation || allowedRooms.has(r.situation.primaryRoomId)),
  },
  { clock },
);
const memory = new MemoryRevisionServiceV1(
  new InMemoryMemoryRevisionStoreV1(),
  {
    authenticate: async (context) => context,
    authorize: async (p) =>
      p.actor.actorId === "owner" && p.actor.actorType === "human",
  },
  { clock },
);
const proposalStore = new InMemoryMemoryProposalStoreV1();
const proposals = new MemoryProposalServiceV1(
  proposalStore,
  memory,
  {
    authenticate: async (context) => context,
    authorize: async (p, r) =>
      p.tenantId === owner.tenantId &&
      ((r.operation === "propose" && p.actor.actorId === "analyst") ||
        (["read", "history"].includes(r.operation) &&
          r.proposal?.proposedBy === p.actor.actorId) ||
        (p.actor.actorId === "owner" && p.actor.actorType === "human")),
  },
  { clock },
);
let analyses = 0;

for (const source of sources) {
  const room = await rooms.createRoom(owner.tenantId, {
    title: source.source,
    goal: "Follow up relevant matters",
  });
  allowedRooms.add(room.id);
  await rooms.addParticipant(owner.tenantId, room.id, {
    id: "owner",
    type: "human",
    displayName: "Owner",
    role: "owner",
  });
  const root = await rooms.sendMessage(owner.tenantId, room.id, {
    authorParticipantId: "owner",
    role: "human",
    content: "Help me follow up this topic",
    startThread: true,
  });
  const batch = {
    consumerId: "assistant",
    source: source.source,
    operationId: "intake-1",
    checkpoint: { expectedRevision: null, position: "provider-position-1" },
    events: [
      {
        event: {
          tenantId: owner.tenantId,
          source: source.source,
          id: "new-item",
          type: "item.changed",
          occurredAt: clock().toISOString(),
          payload: { reference: `${source.source}:1` },
        },
        evidence: [
          {
            evidenceId: "1",
            evidenceRevision: "original",
            reference: `${source.source}:1`,
          },
        ],
      },
    ],
  };
  await processing.receiveBatch(analyst, batch);
  const claim = await processing.claim(analyst, {
    consumerId: batch.consumerId,
    source: batch.source,
    workerId: "worker-1",
  });
  await processing.assertCurrent(analyst, claim);
  analyses++;
  // A real extractor returns validated source-backed facts, not owner instructions.
  await processing.complete(
    analyst,
    claim,
    { summary: source.summary },
    `analysis:${source.source}:1`,
  );
  const key = {
    consumerId: batch.consumerId,
    source: batch.source,
    evidenceId: "1",
    evidenceRevision: "original",
  };
  const caseId = `matter:${source.source}:1`,
    proposalId = `preference:${source.source}`;
  let crash = true,
    crashAfterProposal = true;
  const apply = async ({ operationId, result, resultReference }) => {
    await situations.apply(analyst, {
      id: caseId,
      operationId,
      expectedRevision: null,
      content: {
        primaryRoomId: room.id,
        title: source.title,
        summary: result.summary,
        nextAction: "Verify the current state",
        status: "open",
        links: [{ roomId: room.id, threadId: root.id, messageId: root.id }],
        evidenceRefs: [resultReference],
        artifactRefs: [],
        attributes: { domain: source.source },
        attention: {
          rank: source.rank,
          reason: "Application-owned priority rule",
        },
      },
      cause: {
        kind: "evidence",
        explanation: "Validated extractor facts",
        references: [resultReference],
      },
    });
    if (crash) {
      crash = false;
      throw Error("Simulated crash after the first domain write");
    }
    await proposals.propose(analyst, {
      id: proposalId,
      operationId,
      memoryId: proposalId,
      expectedMemoryRevision: null,
      subject: { type: "person", id: "owner" },
      audience: { kind: "personal", subjectId: "owner" },
      content: { preference: source.preference },
      evidenceRefs: [resultReference],
      reason: "Pattern to confirm with the owner",
    });
    if (crashAfterProposal) {
      crashAfterProposal = false;
      throw Error("Simulated crash before projection acknowledgement");
    }
  };
  await assert.rejects(processing.project(analyst, key, apply));
  await assert.rejects(processing.project(analyst, key, apply));
  await processing.project(analyst, key, apply);
  assert.equal(
    (await situations.history(owner, caseId)).length,
    1,
    "the partial write is replayed, not duplicated",
  );
  await processing.receiveBatch(analyst, batch);
  assert.equal(
    await processing.claim(analyst, {
      consumerId: batch.consumerId,
      source: batch.source,
      workerId: "worker-2",
    }),
    undefined,
  );
  assert.equal(
    await memory.read(owner, proposalId),
    undefined,
    "an inferred proposal is not active memory",
  );
  await proposals.accept(owner, {
    id: proposalId,
    operationId: "accept-owner",
    expectedRevision: 1,
    reference: "interactive-owner-acceptance",
  });
  assert.ok(await memory.read(owner, proposalId));
  console.log(
    `${source.source}: one analysis, one situation after recovery, one explicitly accepted memory.`,
  );
}
assert.equal(analyses, 2);
assert.equal(
  (await situations.list(owner, [...allowedRooms])).situations.length,
  2,
);
console.log(
  "Both consumers share processing, situation and memory contracts; domain priority stays in the host.",
);
