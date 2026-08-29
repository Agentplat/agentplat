import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryAgentRoomProjectionCheckpointStore,
  InMemoryRoomRepository,
  RoomService,
} from "@agentplat/rooms";
import {
  InMemoryProcessRunnerV1,
  InMemoryWorkflowStoreV1,
  createProcessDefinitionV1,
} from "@agentplat/workflows";
import {
  AutonomyControllerV1,
  InMemoryAutonomyStoreV1,
  createAutonomyEvidenceWindowV1,
  createAutonomyPolicyV1,
  digestAutonomyJsonV1,
} from "@agentplat/autonomy";
import { createAutonomyGovernedActionGuardV1 } from "@agentplat/autonomy/actions";

import {
  AGENT_ROOM_APPROVAL_GATE_TYPE_V1,
  AgentRoomGateProviderV1,
  WorkflowRoomGateProjectorV1,
  createAgentRoomAutonomyApprovalEvidencePortV1,
  parseWorkflowRoomApprovalIdV1,
} from "../dist/index.js";

test("Room approval wakes and completes the exact workflow gate", async () => {
  const fixture = await setup();
  const artifact = await fixture.rooms.createArtifact(
    "tenant-a",
    fixture.room.id,
    { type: "brief", title: "Brief", content: "v1" },
  );
  await registerGateProcess(fixture, "approve", artifact.id);
  const started = await fixture.runner.start(startInput("approve"));
  assert.equal(started.run.status, "waiting");
  const approval = currentWorkflowApproval(
    await fixture.rooms.getRoomState("tenant-a", fixture.room.id),
    "run:approve",
  );
  assert.equal(approval.targetVersion, 1);
  assert.deepEqual(parseWorkflowRoomApprovalIdV1(approval.id), {
    runId: "run:approve",
    stageId: "review",
    ordinal: 1,
  });
  await fixture.rooms.resolveApproval("tenant-a", approval.id, "approved", {
    decidedBy: fixture.human.id,
  });
  await fixture.projector.project({
    tenantId: "tenant-a",
    roomId: fixture.room.id,
  });
  const completed = await fixture.runner.describe({
    tenantId: "tenant-a",
    runId: "run:approve",
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.stageStates[0].outcome, "approved");
});

test("needs_revision preserves the old decision and opens a new version-bound approval", async () => {
  const fixture = await setup();
  const artifact = await fixture.rooms.createArtifact(
    "tenant-a",
    fixture.room.id,
    { type: "brief", title: "Revision", content: "v1" },
  );
  await registerGateProcess(fixture, "revision", artifact.id);
  await fixture.runner.start(startInput("revision"));
  let state = await fixture.rooms.getRoomState("tenant-a", fixture.room.id);
  const first = currentWorkflowApproval(state, "run:revision");
  await fixture.rooms.resolveApproval("tenant-a", first.id, "needs_revision", {
    decidedBy: fixture.human.id,
    comment: "Revise",
  });
  await fixture.rooms.createArtifactVersion(
    "tenant-a",
    fixture.room.id,
    artifact.id,
    { content: "v2", createdBy: fixture.human.id },
  );
  await fixture.projector.project({
    tenantId: "tenant-a",
    roomId: fixture.room.id,
  });
  state = await fixture.rooms.getRoomState("tenant-a", fixture.room.id);
  const chain = state.approvals.filter((approval) =>
    approval.id.startsWith("workflow-room:run%3Arevision:review:approval:"),
  );
  assert.equal(chain.length, 2);
  assert.equal(chain[0].status, "needs_revision");
  assert.equal(chain[0].targetVersion, 1);
  assert.equal(chain[1].status, "requested");
  assert.equal(chain[1].targetVersion, 2);
  assert.equal(
    (
      await fixture.runner.describe({
        tenantId: "tenant-a",
        runId: "run:revision",
      })
    ).status,
    "waiting",
  );

  await fixture.rooms.resolveApproval("tenant-a", chain[1].id, "approved", {
    decidedBy: fixture.human.id,
  });
  await fixture.projector.project({
    tenantId: "tenant-a",
    roomId: fixture.room.id,
  });
  assert.equal(
    (
      await fixture.runner.describe({
        tenantId: "tenant-a",
        runId: "run:revision",
      })
    ).status,
    "completed",
  );
});

test("gate deadline expires the Room approval and workflow without approval", async () => {
  const fixture = await setup();
  await registerRoomGateProcess(fixture, "expire");
  const started = await fixture.runner.start(startInput("expire"));
  assert.equal(started.run.status, "waiting");
  fixture.setNow(new Date("2026-08-28T12:01:00.000Z"));
  const expired = await fixture.runner.advance({
    tenantId: "tenant-a",
    runId: "run:expire",
    operationId: "operation:expire",
    idempotencyKey: "expire",
    logicalTime: "2026-08-28T12:01:00.000Z",
  });
  assert.equal(expired.run.status, "failed");
  assert.equal(expired.run.stageStates[0].outcome, "expired");
  const approval = currentWorkflowApproval(
    await fixture.rooms.getRoomState("tenant-a", fixture.room.id),
    "run:expire",
  );
  assert.equal(approval.status, "expired");
  assert.equal(approval.expiredBy, "workflow-expiry-worker");
});

test("Room autonomy approval binds the exact action and still composes the base guard", async () => {
  const fixture = await setup();
  const store = new InMemoryAutonomyStoreV1();
  const policy = createAutonomyPolicyV1({
    tenantId: "tenant-a",
    policyDomainId: "policy-domain-a",
    policyId: "policy-a",
    policyVersion: 1,
    segmentNamespace: "risk-band",
    initialLevel: "propose_only",
    maximumLevel: "approve_all",
    minimumConcludedOutcomes: 1,
    minimumPositiveBasisPoints: 10_000,
    maximumNegativeBasisPoints: 0,
    maximumCorrectedBasisPoints: 0,
    maximumUnresolvedBasisPoints: 0,
    consecutiveHealthyWindows: 1,
    promotionCooldownMs: 0,
    sampleApprovalBasisPoints: 10_000,
    criticalReasonCodes: [],
    criticalDegradationLevel: "blocked",
    maximumDecisionHistory: 8,
  });
  await store.registerPolicy(policy);
  const actionDigest = digestAutonomyJsonV1("test-action", "apply");
  const evidence = createAutonomyEvidenceWindowV1({
    tenantId: "tenant-a",
    policyDomainId: "policy-domain-a",
    segmentNamespace: "risk-band",
    segmentKey: "segment-a",
    actionType: "effect.apply",
    sourceId: "outcomes",
    sourceRevision: 1,
    windowSequence: 1,
    observedFrom: "2026-08-28T12:00:00.000Z",
    observedThrough: "2026-08-28T12:00:00.000Z",
    coverageStatus: "healthy",
    eligibleTaskRuns: 1,
    concludedOutcomes: 1,
    positive: 1,
    negative: 0,
    corrected: 0,
    inconclusive: 0,
    unresolvedTaskRuns: 0,
    reasonCounts: {},
    cursor: {
      recordedAt: "2026-08-28T12:00:00.000Z",
      outcomeId: "outcome-a",
    },
    evidenceReferenceIds: [],
  });
  const decision = await new AutonomyControllerV1(store).evaluate({
    tenantId: "tenant-a",
    policyDomainId: "policy-domain-a",
    policyId: "policy-a",
    policyVersion: 1,
    segmentNamespace: "risk-band",
    segmentKey: "segment-a",
    actionType: "effect.apply",
    actionProposalDigest: actionDigest,
    evidence,
    logicalTime: "2026-08-28T12:00:00.000Z",
  });
  assert.equal(decision.disposition, "require_approval");
  const approval = await fixture.rooms.requestApproval(
    "tenant-a",
    fixture.room.id,
    {
      targetType: "action",
      targetId: actionDigest,
      action: "effect.apply",
    },
  );
  await fixture.rooms.resolveApproval("tenant-a", approval.id, "approved", {
    decidedBy: fixture.human.id,
  });
  const guard = createAutonomyGovernedActionGuardV1({
    decision,
    approval: createAgentRoomAutonomyApprovalEvidencePortV1({
      rooms: fixture.rooms,
      roomId: fixture.room.id,
      approvalId: approval.id,
    }),
    base: {
      async check() {
        return { allowed: true, code: "allowed" };
      },
    },
  });
  assert.deepEqual(
    await guard.check({
      stage: "dispatch",
      permit: {},
      scope: null,
      actionDigest,
      logicalTimeMs: Date.parse("2026-08-28T12:00:00.000Z"),
    }),
    { allowed: true, code: "allowed" },
  );
  const wrongApproval = await fixture.rooms.requestApproval(
    "tenant-a",
    fixture.room.id,
    {
      targetType: "action",
      targetId: digestAutonomyJsonV1("test-action", "different"),
      action: "effect.apply",
    },
  );
  await fixture.rooms.resolveApproval(
    "tenant-a",
    wrongApproval.id,
    "approved",
    { decidedBy: fixture.human.id },
  );
  assert.deepEqual(
    await createAgentRoomAutonomyApprovalEvidencePortV1({
      rooms: fixture.rooms,
      roomId: fixture.room.id,
      approvalId: wrongApproval.id,
    }).check({
      decision,
      stage: "dispatch",
      permit: {},
      scope: null,
      actionDigest,
      logicalTimeMs: Date.parse("2026-08-28T12:00:00.000Z"),
    }),
    { allowed: false, code: "room_autonomy_approval_binding_mismatch" },
  );
});

async function setup() {
  let now = new Date("2026-08-28T12:00:00.000Z");
  const rooms = new RoomService({
    repository: new InMemoryRoomRepository(),
    clock: () => now,
  });
  const room = await rooms.createRoom("tenant-a", {
    title: "Workflow review",
    goal: "Review exact artifacts",
  });
  const human = await rooms.addParticipant("tenant-a", room.id, {
    type: "human",
    displayName: "Reviewer",
    role: "reviewer",
    permissions: ["approve"],
    boundaries: [],
  });
  const store = new InMemoryWorkflowStoreV1();
  const gateProvider = new AgentRoomGateProviderV1({
    rooms,
    expirationActorId: "workflow-expiry-worker",
  });
  const runner = new InMemoryProcessRunnerV1(store, { gateProvider });
  const events = {
    async listAfter(input) {
      return (await rooms.listEvents(input.tenantId, input.roomId))
        .map((event, index) => ({
          sequence: index + 1,
          tenantId: event.tenantId,
          roomId: event.roomId,
          source: "events",
          sourceId: event.id,
          sourceRevision: index + 1,
          eventType: event.type,
          payload: event.payload,
          occurredAt: event.occurredAt,
        }))
        .filter((event) => event.sequence > input.afterSequence)
        .slice(0, input.limit);
    },
    async listScopes() {
      return [{ tenantId: "tenant-a", roomId: room.id }];
    },
  };
  const projector = new WorkflowRoomGateProjectorV1({
    events,
    checkpoints: new InMemoryAgentRoomProjectionCheckpointStore(),
    rooms,
    runner,
  });
  return {
    rooms,
    room,
    human,
    runner,
    projector,
    setNow(value) {
      now = value;
    },
  };
}

async function registerGateProcess(fixture, suffix, artifactId) {
  await fixture.runner.registerProcessDefinition(
    "tenant-a",
    gateDefinition(suffix, {
      roomId: fixture.room.id,
      targetType: "artifact",
      targetId: artifactId,
    }),
  );
}

async function registerRoomGateProcess(fixture, suffix) {
  await fixture.runner.registerProcessDefinition(
    "tenant-a",
    gateDefinition(suffix, {
      roomId: fixture.room.id,
      targetType: "room",
      targetId: fixture.room.id,
    }),
  );
}

function gateDefinition(suffix, configuration) {
  return createProcessDefinitionV1({
    processId: `process:${suffix}`,
    version: "1",
    name: suffix,
    stages: [
      {
        schemaVersion: 1,
        stageId: "review",
        name: "Review",
        kind: "gate",
        gateType: AGENT_ROOM_APPROVAL_GATE_TYPE_V1,
        gateDefinitionId: `gate:${suffix}`,
        configuration,
        expiresInMs: 60_000,
        dependsOn: [],
      },
    ],
  });
}

function startInput(suffix) {
  return {
    tenantId: "tenant-a",
    runId: `run:${suffix}`,
    processId: `process:${suffix}`,
    processVersion: "1",
    operationId: `operation:start:${suffix}`,
    idempotencyKey: `start:${suffix}`,
    logicalTime: "2026-08-28T12:00:00.000Z",
  };
}

function currentWorkflowApproval(state, runId) {
  const approvals = state.approvals.filter((approval) => {
    const parsed = parseWorkflowRoomApprovalIdV1(approval.id);
    return parsed?.runId === runId;
  });
  return approvals.at(-1);
}
