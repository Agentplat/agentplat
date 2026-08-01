import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryRoomRepository, RoomService } from "@agentplat/rooms";
import {
  createCollectiveDecisionRecordV1,
  digestCollectiveJsonV1,
} from "@agentplat/collective-control";
import {
  createMemoryRoomMeshIdempotencyRepository,
  createRoomMeshBridge,
  createRoomServiceMeshSink,
  projectAcceptedMeshWorkToRoom,
  projectApprovedRoomDecisionToMandateProposalV1,
  projectCollectiveDecisionToRoomArtifactV1,
  projectRoomTaskToMeshWork,
  projectRoomToMeshObjective,
} from "@agentplat/rooms-mesh";

function fixture() {
  let sequence = 0;
  const service = new RoomService({
    repository: new InMemoryRoomRepository(),
    idGenerator: () => `room-id-${++sequence}`,
    clock: () => new Date("2026-08-01T00:00:00.000Z"),
  });
  return { service };
}

async function roomAndTask(service) {
  const room = await service.createRoom("tenant-a", {
    id: "room-a",
    title: "Analysis",
    goal: "Produce an evidence-backed analysis",
    metadata: {
      issuerPeerId: "hostile-peer",
      maximumBudgetUnits: 999_999,
      permittedCapabilityKeys: ["admin"],
    },
  });
  const participant = await service.addParticipant("tenant-a", room.id, {
    id: "agent-a",
    type: "agent",
    displayName: "Analyst",
    role: "superuser",
    authorityLevel: 100,
    permissions: ["*"],
    runtime: { platform: "test" },
  });
  const task = await service.createTask("tenant-a", room.id, {
    id: "task-a",
    stepId: "analysis",
    assignedParticipantId: participant.id,
    assignedRole: "owner",
    instruction: "Analyze the supplied evidence",
    expectedOutput: "A concise analysis",
    expectedArtifactKind: "analysis",
    metadata: { ownerPeerId: "hostile-peer", budgetReservationUnits: 99_999 },
  });
  return { room, task, participant };
}

const objectivePolicy = Object.freeze({
  objectiveId: "objective-a",
  objectiveDocumentId: "objective-document-a",
  objectiveRevision: 1,
  issuerPeerId: "peer-owner",
  successCriteria: ["Evidence is cited."],
  permittedCapabilityKeys: ["analysis"],
  maximumWorkItems: 4,
  maximumConcurrentAssignments: 2,
  maximumBudgetUnits: 100,
  bidWindowMs: 60_000,
  acceptanceWindowMs: 30_000,
  maximumLeaseDurationMs: 3_600_000,
  recoveryGraceMs: 60_000,
  maximumLeaseRenewals: 3,
  recoveryWitnessPeerIds: ["peer-witness-a"],
  recoveryWitnessThreshold: 1,
  validFrom: "2026-08-01T00:00:00.000Z",
  validUntil: "2026-08-02T00:00:00.000Z",
});

const workPolicy = Object.freeze({
  objectiveId: "objective-a",
  objectiveDocumentId: "objective-document-a",
  objectiveRevision: 1,
  workItemId: "work-item-a",
  workItemRevision: 1,
  ownerPeerId: "peer-owner",
  ownerEpoch: 1,
  offerId: "offer-a",
  offerAttempt: 1,
  requiredCapabilityKeys: ["analysis"],
  matchingAttributes: { language: "en" },
  completionCriteria: ["Return a concise analysis."],
  budgetReservationUnits: 25,
  bidDeadline: "2026-08-01T00:01:00.000Z",
  workDeadline: "2026-08-01T01:00:00.000Z",
});

function acceptedResult(overrides = {}) {
  return {
    accepted: true,
    duplicate: false,
    envelope: {
      protocol: "agentplat.mesh",
      wireVersion: 0,
      messageId: "RRRRRRRRRRRRRRRRRRRRRA",
      tenantId: "tenant-a",
      meshId: "mesh-a",
      objectiveId: "objective-a",
      type: "work.result",
      sender: { peerId: "peer-worker", instanceId: "worker-1" },
      audience: { kind: "peer", peerId: "peer-owner" },
      sequence: 1,
      sentAt: "2026-08-01T00:00:01.000Z",
      expiresAt: "2026-08-01T00:00:31.000Z",
      causationId: "CCCCCCCCCCCCCCCCCCCCCA",
      payload: {
        type: "work.result",
        resultId: "result-a",
        resultDigest: `sha256:${"A".repeat(43)}`,
        resultSummary: "Evidence supports the proposed conclusion.",
        objectiveId: "objective-a",
        objectiveDocumentId: "objective-document-a",
        objectiveRevision: 1,
        workItemId: "work-item-a",
        workItemRevision: 1,
        ownerPeerId: "peer-owner",
        ownerEpoch: 1,
        assigneePeerId: "peer-worker",
        awardId: "award-a",
        acceptanceId: "acceptance-a",
        assignmentEpoch: 1,
        assignmentAuthorityId: "award-a",
        fencingToken: "award-a",
        leaseExpiresAt: "2026-08-01T00:30:00.000Z",
      },
      proof: {
        algorithm: "Ed25519",
        keyId: "key-worker",
        value: "A".repeat(86),
      },
      ...overrides,
    },
    state: {},
  };
}

test("Room projections use explicit policy and never infer authority from Room data", async () => {
  const { service } = fixture();
  const { room, task } = await roomAndTask(service);
  const objective = projectRoomToMeshObjective({
    room,
    policy: objectivePolicy,
  });
  const work = projectRoomTaskToMeshWork({ room, task, policy: workPolicy });

  assert.equal(objective.payload.issuerPeerId, "peer-owner");
  assert.equal(objective.payload.maximumBudgetUnits, 100);
  assert.deepEqual(objective.payload.permittedCapabilityKeys, ["analysis"]);
  assert.equal(work.payload.ownerPeerId, "peer-owner");
  assert.equal(work.payload.budgetReservationUnits, 25);
  assert.deepEqual(work.payload.requiredCapabilityKeys, ["analysis"]);
  assert.equal(Object.isFrozen(objective), true);
  assert.equal(Object.isFrozen(work.payload), true);

  assert.throws(
    () =>
      projectRoomToMeshObjective({
        room,
        policy: { ...objectivePolicy, issuerPeerId: undefined },
      }),
    /projection is invalid/u,
  );
});

test("accepted Mesh work creates one draft artifact and leaves Room authority untouched", async () => {
  const { service } = fixture();
  const { room, task, participant } = await roomAndTask(service);
  const projection = await projectAcceptedMeshWorkToRoom({
    decision: acceptedResult(),
    binding: {
      bridgeId: "bridge-a",
      tenantId: "tenant-a",
      roomId: room.id,
      taskId: task.id,
      objectiveId: "objective-a",
      workItemId: "work-item-a",
      authorParticipantId: participant.id,
    },
  });
  const bridge = createRoomMeshBridge({
    bridgeId: "bridge-a",
    workerId: "bridge-worker-a",
    idempotency: createMemoryRoomMeshIdempotencyRepository(),
    sink: createRoomServiceMeshSink(service),
  });

  assert.equal((await bridge.apply(projection)).status, "applied");
  assert.equal((await bridge.apply(projection)).status, "duplicate");
  const state = await service.getRoomState("tenant-a", room.id);
  assert.equal(state.artifacts.length, 1);
  assert.equal(state.artifacts[0].status, "draft");
  assert.equal(
    state.artifacts[0].metadata.meshMessageId,
    projection.source.messageId,
  );
  assert.equal(
    state.tasks.find((entry) => entry.id === task.id).status,
    "pending",
  );
  assert.equal(state.approvals.length, 0);
  assert.equal(state.room.status, "active");
});

test("projection scope mismatches and failed sinks are rejected without burning idempotency", async () => {
  await assert.rejects(
    projectAcceptedMeshWorkToRoom({
      decision: acceptedResult({ tenantId: "tenant-other" }),
      binding: {
        bridgeId: "bridge-a",
        tenantId: "tenant-a",
        roomId: "room-a",
        taskId: "task-a",
        objectiveId: "objective-a",
        workItemId: "work-item-a",
      },
    }),
    /scopes do not match/u,
  );

  const projection = await projectAcceptedMeshWorkToRoom({
    decision: acceptedResult(),
    binding: {
      bridgeId: "bridge-a",
      tenantId: "tenant-a",
      roomId: "room-a",
      taskId: "task-a",
      objectiveId: "objective-a",
      workItemId: "work-item-a",
    },
  });
  let attempts = 0;
  const bridge = createRoomMeshBridge({
    bridgeId: "bridge-a",
    workerId: "bridge-worker-a",
    idempotency: createMemoryRoomMeshIdempotencyRepository(),
    sink: {
      async apply() {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary sink failure");
        return { applied: true };
      },
    },
  });
  await assert.rejects(bridge.apply(projection), /temporary sink failure/u);
  assert.equal((await bridge.apply(projection)).status, "applied");
  assert.equal(attempts, 2);
});

test("approved Room decisions produce inert mandate proposals only", async () => {
  const { service } = fixture();
  const { room } = await roomAndTask(service);
  const approval = {
    id: "approval-a",
    tenantId: room.tenantId,
    roomId: room.id,
    targetType: "room",
    targetId: room.id,
    status: "approved",
    requestedBy: "participant-requester",
    decidedBy: "participant-human",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    decidedAt: "2026-08-01T00:00:00.000Z",
  };
  const statement = {
    schemaVersion: 1,
    mandateId: "mandate:room-a",
    tenantId: room.tenantId,
    policyDomainId: "policy-domain:room-a",
    issuerId: "issuer:room-a",
    revision: 1,
    predecessorDigest: null,
    subjectPeerIds: ["peer:worker-a"],
    objective: {
      schemaVersion: 1,
      meshId: "mesh:room-a",
      objectiveId: "objective:room-a",
      objectiveDocumentId: "objective-document:room-a",
      minimumObjectiveRevision: 1,
      maximumObjectiveRevision: 1,
    },
    work: {
      schemaVersion: 1,
      workItemIds: [],
      permittedRoleKeys: ["executor"],
      maximumWorkItemRevision: 1,
    },
    permittedCapabilityKeys: ["analysis"],
    permittedActions: [
      {
        schemaVersion: 1,
        namespace: "documents",
        toolId: "writer",
        operation: "draft",
      },
    ],
    budget: {
      schemaVersion: 1,
      totalBudgetUnits: 100,
      maximumWorkBudgetUnits: 50,
      maximumActionBudgetUnits: 10,
      maximumConcurrentWorkReservations: 2,
      maximumConcurrentActionReservations: 2,
      reservationLifetimeMs: 60_000,
    },
    validFrom: "2026-08-01T00:00:00.000Z",
    validUntil: "2026-08-02T00:00:00.000Z",
    roomProvenance: {
      schemaVersion: 1,
      roomId: room.id,
      approvalId: approval.id,
      targetType: approval.targetType,
      targetId: approval.targetId,
      targetVersion: null,
    },
    evidence: {
      schemaVersion: 1,
      redactionPolicyId: "redaction:room-a",
      retentionClass: "standard",
      requireDurablePreDispatchEvidence: true,
    },
  };

  const proposal = projectApprovedRoomDecisionToMandateProposalV1({
    room,
    approval,
    proposalId: "proposal:room-a",
    statement,
  });
  assert.match(proposal.proposalDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(proposal.roomDecision.approvalId, approval.id);
  assert.equal("proof" in proposal, false);
  assert.equal("mandateDigest" in proposal, false);

  assert.throws(
    () =>
      projectApprovedRoomDecisionToMandateProposalV1({
        room,
        approval: { ...approval, status: "requested" },
        proposalId: "proposal:rejected",
        statement,
      }),
    /not an accepted proposal source/u,
  );
});

test("collective decisions project to bounded digest-only Room artifacts", async () => {
  const { service } = fixture();
  const { room } = await roomAndTask(service);
  const digest = (label) => digestCollectiveJsonV1("state", { label });
  const record = createCollectiveDecisionRecordV1({
    schemaVersion: 1,
    recordId: "record:room-a",
    tenantId: room.tenantId,
    policyDomainId: "policy-domain:room-a",
    kind: "effect.dispatch",
    accepted: false,
    reasonCode: "policy_denied",
    logicalTimeMs: 42,
    mandateId: "mandate:room-a",
    mandateDigest: digest("mandate"),
    workContractId: "work-contract:room-a",
    workContractDigest: digest("work"),
    permitId: "permit:room-a",
    permitDigest: digest("permit"),
    assignmentAuthorityId: "authority:room-a",
    assignmentEpoch: 1,
    fencingToken: "fence:room-a:1",
    budgetDeltaKind: "none",
    budgetDeltaUnits: 0,
    inputDigest: digest("input:canary-is-only-in-the-digest-source"),
    actionDigest: digest("action"),
    assessmentDigest: digest("assessment"),
    trustDecisionDigest: digest("trust"),
    previousRecordDigest: null,
  });
  const projection = projectCollectiveDecisionToRoomArtifactV1({
    room,
    record,
  });
  assert.equal(projection.kind, "room.artifact");
  assert.equal(projection.input.content.recordDigest, record.recordDigest);
  assert.equal(JSON.stringify(projection).includes("canary-is-only"), false);
  const before = await service.getRoomState(room.tenantId, room.id);
  assert.equal(before.artifacts.length, 0);
});
