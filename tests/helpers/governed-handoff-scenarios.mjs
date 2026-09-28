import assert from "node:assert/strict";
import {
  AgentGovernanceServiceV1,
  AgentContinuityServiceV1,
  AgentExecutionControllerV1,
  AgentRoomHandoffCoordinator,
  RoomService,
  createGovernedHandoffRevisionResolverV1,
  createRoomHandoffContinuityEvidenceV1,
  withPurposeHandoffIntakeV1,
  DefaultAgentRoomCoordinationExecutionPort,
} from "@agentplat/rooms";
import { setupAgentExecution } from "./agent-execution-scenarios.mjs";
export async function governedHandoffScenarios({
  governance,
  execution,
  continuity,
  definitions,
  handoffs,
  repository,
}) {
  const root = await setupAgentExecution({
    store: execution,
    governance,
    definitions,
  });
  await definitions.createAgent({
    tenantId: "t",
    agentId: "child",
    name: "Child",
  });
  const draft = await definitions.createRevision({
    tenantId: "t",
    agentId: "child",
    version: "1.0.0",
    instructions: "Bounded delegated work",
    runtimeProfile: { platform: "mock" },
  });
  await definitions.publishRevision("t", draft.definition.revisionId, 0);
  const child = new AgentExecutionControllerV1(
    execution,
    governance,
    definitions,
    { ...root.profile, definitionRevisionId: draft.definition.revisionId },
    [],
    root.semantic,
    root.clock,
  );
  const childGov = new AgentGovernanceServiceV1(
    governance,
    root.access,
    definitions,
    root.clock,
    child,
  );
  await childGov.execute("owner", {
    agentId: "child",
    operationId: "create",
    expectedRevision: null,
    command: {
      kind: "create",
      governanceId: "child-gov",
      ownerId: "owner",
      purpose: "Complete permitted work",
      definitionRevisionId: draft.definition.revisionId,
      origin: {
        kind: "delegation",
        parentAgentId: "agent",
        continuityId: "delegation",
      },
    },
  });
  const router = {
    bindRoomTask: (input) =>
      (input.participant.metadata.agentId === "agent"
        ? root.controller
        : child
      ).bindRoomTask(input),
    openRoom: (input) =>
      (input.participant.metadata.agentId === "agent"
        ? root.controller
        : child
      ).openRoom(input),
    definitionForParticipant: (input) =>
      (input.participant.metadata.agentId === "agent"
        ? root.controller
        : child
      ).definitionForParticipant(input),
  };
  let seq = 0,
    admitted;
  const rooms = new RoomService({
    repository,
    executionGovernance: router,
    requireGovernedExecution: true,
    idGenerator: () => `delegation-${++seq}`,
    runtime: {
      registerProvider() {},
      supportsCheckpoint: () => true,
      async *stream() {},
      async run(_a, _i, context) {
        await context.checkpoint({ checkpoint: "pre_action" });
        if (context.metadata?.agentGovernance?.agentId === "child") {
          admitted = await child.reserve(context.metadata.agentGovernance, {
            ...root.descriptor("delegated-effect", 7),
            runId: context.runId,
          });
          assert.equal(admitted.status, "created");
          await child.recordOutcome(
            admitted.record,
            "indeterminate",
            "external:unknown",
          );
        }
        return { status: "completed", output: "done" };
      },
    },
  });
  const room = await rooms.createRoom("t", {
    title: "Delegation",
    goal: "Bounded delegation",
  });
  const source = await rooms.addParticipant("t", room.id, {
    type: "agent",
    displayName: "Source",
    role: "worker",
    authorityLevel: 1,
    permissions: ["task.run", "handoff.accept", "tool:writer"],
    metadata: { agentId: "agent" },
    runtime: { platform: "mock", instructions: root.definition.instructions },
  });
  const target = await rooms.addParticipant("t", room.id, {
    type: "agent",
    displayName: "Target",
    role: "worker",
    authorityLevel: 1,
    permissions: ["task.run", "handoff.accept", "tool:writer"],
    metadata: { agentId: "child" },
    runtime: { platform: "mock", instructions: draft.definition.instructions },
  });
  const coordinator = new AgentRoomHandoffCoordinator(
    rooms,
    handoffs,
    createGovernedHandoffRevisionResolverV1(definitions, governance),
  );
  const evidence = createRoomHandoffContinuityEvidenceV1({
    handoffs,
    rooms,
    execution,
    sourceController: () => root.controller,
    align: async ({ parent, child }) => ({
      compatible: true,
      parentConfigurationDigest: parent.configurationDigest,
      childConfigurationDigest: child.configurationDigest,
      evidenceDigest: "sha256:" + "a".repeat(64),
      explanation: "Aligned bounded delegation",
      permittedTools: null,
    }),
  });
  const links = new AgentContinuityServiceV1(
    continuity,
    governance,
    root.access,
    evidence,
    root.clock,
  );
  const sourceTask = await rooms.createTask("t", room.id, {
    stepId: "source",
    assignedParticipantId: source.id,
    instruction: "Delegate bounded work",
    expectedArtifactKind: "result",
    expectedOutput: "Result",
    toolIds: ["writer"],
  });
  let h, sourceRunId;
  await rooms.runTask("t", room.id, sourceTask.id, {
    onStarted: async ({ run }) => {
      sourceRunId = run.id;
      h = await coordinator.propose({
        tenantId: "t",
        roomId: room.id,
        handoffId: "handoff",
        sourceParticipantId: source.id,
        sourceRunId: run.id,
        sourceAgentRevisionId: root.definition.revisionId,
        targetParticipantId: target.id,
        targetAgentRevisionId: draft.definition.revisionId,
        instruction: "Delegated instruction",
        authorityCeiling: 1,
      });
      await links.propose("owner", {
        continuityId: "delegation",
        parentAgentId: "agent",
        childAgentId: "child",
        operationId: "propose",
        expectedRevision: null,
        expiresAt: "2099-01-01T00:00:00.000Z",
        evidenceKind: "handoff",
        evidenceRef: JSON.stringify([room.id, h.handoffId]),
      });
      await links.accept("owner", {
        continuityId: "delegation",
        operationId: "accept",
        expectedRevision: 0,
      });
      await childGov.execute("owner", {
        agentId: "child",
        operationId: "prepare",
        expectedRevision: 0,
        command: { kind: "prepare_activation" },
      });
      await childGov.execute("owner", {
        agentId: "child",
        operationId: "activate",
        expectedRevision: 1,
        command: { kind: "activate" },
      });
      const b = await child.open("t", "child");
      assert.equal(
        (await child.reserve(b, root.descriptor("before-handoff-consent", 1)))
          .status,
        "denied",
      );
      h = await coordinator.accept({
        tenantId: "t",
        roomId: room.id,
        handoffId: h.handoffId,
        expectedRevision: h.revision,
        acceptedByParticipantId: target.id,
      });
      // A purpose receiver is delivered as an inception, with no implicit task or run.
      let intake = 0;
      const port = withPurposeHandoffIntakeV1(
        {
          submit: async () => {
            intake++;
          },
        },
        { rooms, handoffs },
      );
      await port.submitHandoff({
        tenantId: "t",
        roomId: room.id,
        agentId: "child",
        handoffId: h.handoffId,
      });
      await port.submitHandoff({
        tenantId: "t",
        roomId: room.id,
        agentId: "child",
        handoffId: h.handoffId,
      });
      assert.equal(intake, 2);
      assert.equal(
        (await rooms.getRoomState("t", room.id)).messages.filter(
          (m) => m.metadata?.handoffId === h.handoffId,
        ).length,
        1,
      );
      assert.equal((await rooms.getRoomState("t", room.id)).tasks.length, 1);
      await assert.rejects(
        rooms.createTask("t", room.id, {
          stepId: "target",
          assignedParticipantId: target.id,
          instruction: "Different work",
          expectedArtifactKind: "result",
          expectedOutput: "Result",
          metadata: { handoffId: h.handoffId },
        }),
        { code: "FORBIDDEN" },
      );
      const task = await rooms.createTask("t", room.id, {
        stepId: "target",
        assignedParticipantId: target.id,
        instruction: h.instruction,
        expectedArtifactKind: "result",
        expectedOutput: "Result",
        toolIds: ["writer"],
        metadata: { handoffId: h.handoffId },
      });
      await rooms.runTask("t", room.id, task.id, {
        onStarted: async ({ run }) => {
          h = await coordinator.bindRun({
            tenantId: "t",
            roomId: room.id,
            handoffId: h.handoffId,
            expectedRevision: h.revision,
            targetTaskId: task.id,
            targetRunId: run.id,
          });
        },
      });
      h = await coordinator.reconcile({
        tenantId: "t",
        roomId: room.id,
        handoffId: h.handoffId,
        expectedRevision: h.revision,
      });
      assert.equal(h.status, "completed");
      assert.equal(
        (await child.reserve(b, root.descriptor("after-handoff-completion", 1)))
          .status,
        "denied",
      );
    },
  });
  assert.ok(admitted);
  assert.equal(
    (await execution.effectsForRun("t", "agent", sourceRunId)).some(
      (e) =>
        e.effect.effectId === "delegated-effect" &&
        e.status === "indeterminate",
    ),
    true,
  );
  assert.equal(
    (
      await root.controller.reserve(
        root.binding,
        root.descriptor("parent-budget-held", 4),
      )
    ).status,
    "denied",
  );
  assert.deepEqual(
    await execution.delegationsForRun("t", "agent", sourceRunId),
    [{ handoffId: "handoff", status: "completed" }],
  );
  await child.reconcile("t", "child", "delegated-effect", {
    lookup: async (r) => ({
      requestDigest: r.requestDigest,
      outcome: "not_applied",
      proofRef: "verified:absent",
    }),
  });
  assert.equal(
    (
      await root.controller.reserve(
        root.binding,
        root.descriptor("refunded-to-parent", 4),
      )
    ).status,
    "created",
  );
}
