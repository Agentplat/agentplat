import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentRoomPlannerBridge,
  HumanContributionCoordinator,
  InMemoryAgentRoomPlanStore,
  InMemoryHumanContributionStore,
  InMemoryRoomRepository,
  RoomService,
} from "@agentplat/rooms";

async function fixture() {
  const repository = new InMemoryRoomRepository();
  const rooms = new RoomService({ repository });
  const room = await rooms.createRoom("tenant-1", {
    title: "Planner Room",
    goal: "Materialize a typed plan",
  });
  const agent = await rooms.addParticipant("tenant-1", room.id, {
    type: "agent",
    displayName: "Worker",
    role: "worker",
    runtime: { platform: "mock" },
    permissions: ["human_contribution.request"],
  });
  const human = await rooms.addParticipant("tenant-1", room.id, {
    type: "human",
    displayName: "Reviewer",
    role: "reviewer",
    permissions: ["human_contribution.complete", "approval.resolve"],
  });
  const contributions = new HumanContributionCoordinator(
    rooms,
    new InMemoryHumanContributionStore(),
  );
  const planner = new AgentRoomPlannerBridge(
    new InMemoryAgentRoomPlanStore(),
    rooms,
    contributions,
    { propose: async (input) => ({ handoffId: input.handoffId }) },
  );
  return { repository, rooms, room, agent, human, contributions, planner };
}

test("Planner bridge progressively materializes dependency-complete steps", async () => {
  const { repository, rooms, room, agent, human, contributions, planner } =
    await fixture();
  const plan = await planner.create({
    tenantId: "tenant-1",
    roomId: room.id,
    planId: "plan-1",
    objective: "Produce and review a brief",
    steps: [
      {
        stepId: "draft",
        kind: "agent_task",
        participantId: agent.id,
        instruction: "Draft the brief.",
        expectedOutput: "A brief",
        expectedArtifactKind: "brief",
      },
      {
        stepId: "review",
        kind: "human_contribution",
        requestedByParticipantId: agent.id,
        assignedParticipantId: human.id,
        instruction: "Review the brief.",
        expectedOutput: "Review notes",
        dependencies: ["draft"],
        blocking: true,
      },
      {
        stepId: "approve",
        kind: "approval",
        targetType: "task",
        targetStepId: "draft",
        dependencies: ["review"],
      },
    ],
  });
  const materialized = await planner.materialize({
    tenantId: "tenant-1",
    roomId: room.id,
    planId: plan.planId,
    expectedRevision: 0,
  });
  assert.equal(materialized.status, "active");
  assert.deepEqual(Object.keys(materialized.materialized), ["draft"]);
  let state = await rooms.getRoomState("tenant-1", room.id);
  assert.equal(state.tasks.length, 1);
  assert.equal(state.approvals.length, 0);
  assert.equal((await contributions.list("tenant-1", room.id)).length, 0);

  const task = state.tasks[0];
  await repository.transaction("tenant-1", async (transaction) => {
    await transaction.updateTask({
      ...task,
      status: "completed",
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });
  let [progressed] = await planner.reconcileFromEvent({
    tenantId: "tenant-1",
    roomId: room.id,
    triggerEventId: state.events[0].id,
  });
  assert.equal(progressed.status, "waiting_for_human");
  assert.deepEqual(Object.keys(progressed.materialized), ["draft", "review"]);
  assert.equal((await contributions.list("tenant-1", room.id)).length, 1);

  const contribution = await contributions.get({
    tenantId: "tenant-1",
    roomId: room.id,
    contributionId: progressed.materialized.review,
  });
  await contributions.complete({
    tenantId: "tenant-1",
    roomId: room.id,
    contributionId: contribution.contributionId,
    expectedRevision: contribution.revision,
    participantId: human.id,
    result: { decision: "approved" },
  });
  [progressed] = await planner.reconcileFromEvent({
    tenantId: "tenant-1",
    roomId: room.id,
    triggerEventId: state.events[0].id,
  });
  assert.deepEqual(Object.keys(progressed.materialized), [
    "draft",
    "review",
    "approve",
  ]);
  state = await rooms.getRoomState("tenant-1", room.id);
  assert.equal(state.approvals.length, 1);

  await rooms.resolveApproval(
    "tenant-1",
    progressed.materialized.approve,
    "approved",
    { decidedBy: human.id },
  );
  [progressed] = await planner.reconcileFromEvent({
    tenantId: "tenant-1",
    roomId: room.id,
    triggerEventId: state.events[0].id,
  });
  assert.equal(progressed.status, "completed");
  assert.deepEqual(progressed.stepStatuses, {
    draft: "completed",
    review: "completed",
    approve: "completed",
  });
});

test("replanning must extend an exact predecessor version", async () => {
  const { rooms, room, planner } = await fixture();
  await planner.create({
    tenantId: "tenant-1",
    roomId: room.id,
    planId: "plan-1",
    planVersion: 1,
    objective: "Initial objective",
    steps: [],
  });
  const replanned = await planner.create({
    tenantId: "tenant-1",
    roomId: room.id,
    planId: "plan-2",
    planVersion: 2,
    predecessorPlanId: "plan-1",
    objective: "Revised objective",
    steps: [],
  });
  assert.equal(replanned.predecessorPlanId, "plan-1");
  await assert.rejects(
    planner.create({
      tenantId: "tenant-1",
      roomId: room.id,
      planId: "invalid-plan",
      planVersion: 4,
      predecessorPlanId: "plan-1",
      objective: "Invalid jump",
      steps: [],
    }),
    /does not extend/,
  );
  const state = await rooms.getRoomState("tenant-1", room.id);
  const eventPlan = await planner.replanFromEvent({
    tenantId: "tenant-1",
    roomId: room.id,
    planId: "event-plan",
    predecessorPlanId: "plan-1",
    triggerEventId: state.events[0].id,
    objective: "Event-driven objective",
    steps: [],
  });
  assert.deepEqual(eventPlan.replanTrigger, {
    eventId: state.events[0].id,
    eventType: "room_created",
  });
  const materialized = await planner.materialize({
    tenantId: "tenant-1",
    roomId: room.id,
    planId: eventPlan.planId,
    expectedRevision: eventPlan.revision,
  });
  const reconciled = await planner.reconcileFromEvent({
    tenantId: "tenant-1",
    roomId: room.id,
    triggerEventId: state.events[0].id,
  });
  assert.equal(materialized.status, "active");
  assert.equal(
    reconciled.find((plan) => plan.planId === eventPlan.planId).status,
    "completed",
  );
});
