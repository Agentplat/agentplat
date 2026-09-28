import assert from "node:assert/strict";
import {
  RoomService,
  governanceDigestV1,
  AgentGovernanceServiceV1,
  AgentExecutionControllerV1,
  AgentExecutionLimitServiceV1,
  AgentInceptionServiceV1,
  AttentionSignalServiceV1,
  PurposeMissionServiceV1,
  AgentRoomPlannerBridge,
  HumanContributionCoordinator,
  InMemoryHumanContributionStore,
  AgentRoomHandoffCoordinator,
  InMemoryRoomHandoffStore,
  DefaultAgentRoomCoordinationExecutionPort,
  RoomExecutionCoordinator,
  InMemoryRoomExecutionSessionStore,
  createPurposeRoomInputPortV1,
} from "@agentplat/rooms";

export async function purposeMissionScenarios({
  governance,
  execution,
  missions,
  plans,
  definitions,
  inceptions,
  signals,
  repository,
  effectDriver,
}) {
  let elapsed = 0;
  const base = Date.now(),
    clock = () => new Date(base + elapsed);
  const auth = {
    authenticate: async (token) =>
      ["owner", "agent", "router", "stranger", "other"].includes(token)
        ? { tenantId: token === "other" ? "other" : "t", subjectId: token }
        : null,
    authorize: async () => true,
  };
  const inceptionAccess = {
    ...auth,
    authorize: async (p, r) =>
      r.operation === "assess"
        ? p.subjectId === "agent"
        : r.operation === "submit"
          ? ["owner", "router"].includes(p.subjectId)
          : true,
  };
  const missionAccess = {
    ...auth,
    authorize: async (p, r) =>
      ["evaluate", "review", "work"].includes(r.operation)
        ? p.subjectId === "agent"
        : true,
  };
  const readRooms = new RoomService({ repository, clock });
  const room = await readRooms.createRoom("t", {
    id: "purpose-room",
    title: "Purpose mission",
    goal: "Improve retention",
  });
  const participant = await readRooms.addParticipant("t", room.id, {
    id: "purpose-participant",
    type: "agent",
    displayName: "Retention agent",
    role: "analyst",
    permissions: ["task.run", "tool:writer"],
    metadata: { agentId: "agent" },
    runtime: {
      platform: "mock",
      instructions: "Work toward the governed purpose.",
    },
  });
  await definitions.createAgent({
    tenantId: "t",
    agentId: "agent",
    name: "Retention",
  });
  const def = await definitions.createRevision({
    tenantId: "t",
    agentId: "agent",
    version: "1.0.0",
    instructions: participant.runtime.instructions,
    runtimeProfile: { platform: "mock" },
    interaction: {
      schemaVersion: 1,
      interactionMode: "purpose",
      governanceId: "gov",
    },
  });
  await definitions.publishRevision("t", def.definition.revisionId, 0);
  let decision = "act",
    alignment = "aligned",
    causal = "supported",
    throwOnce = false,
    evaluations = 0,
    providerCalls = 0,
    onRun,
    uncertainEffect,
    expectedPurpose = "Improve retention responsibly";
  const assessors = {
    assessorId: "purpose-assessor-v1",
    outcomeAssessorId: "outcome-assessor-v1",
    align: async () => ({
      verdict: alignment,
      explanation:
        "Plan addresses the retention purpose within its constraints",
    }),
    evaluate: async (input) => {
      evaluations++;
      assert.equal(typeof input.purpose, "string");
      if (throwOnce) {
        throwOnce = false;
        throw Error("evaluator interruption");
      }
      return {
        disposition: decision,
        explanation: "Decision based on the mission and current evidence",
        uncertainty: "Evidence remains bounded to this cohort",
      };
    },
    review: async (input) => ({
      criteria: input.mission.criteria.map((c) => ({
        criterionId: c.criterionId,
        status: "met",
      })),
      coverage: "sufficient",
      purposeContribution: "supported",
      causalAttribution: causal,
      explanation: "Observed outcomes reviewed separately from task completion",
    }),
  };
  const makeService = (accessOverride = missionAccess) =>
    new PurposeMissionServiceV1(
      missions,
      governance,
      plans,
      readRooms,
      inceptions,
      signals,
      execution,
      assessors,
      accessOverride,
      clock,
    );
  const service = makeService();
  const profile = {
    adapterId: "purpose-adapter",
    runtimePlatform: "mock",
    definitionRevisionId: def.definition.revisionId,
    preActionCheckpoint: true,
    cooperativeAbort: true,
    gatewayOnlyEffects: true,
    idempotentEffects: true,
  };
  const controller = new AgentExecutionControllerV1(
    execution,
    governance,
    definitions,
    profile,
    [],
    undefined,
    clock,
    service.control(),
  );
  const government = new AgentGovernanceServiceV1(
    governance,
    auth,
    definitions,
    clock,
    controller,
  );
  let op = 0;
  const govern = async (command) => {
    const h = await governance.load("t", "agent");
    return government.execute("owner", {
      agentId: "agent",
      operationId: `gov-${++op}`,
      expectedRevision: h?.revision ?? null,
      command,
    });
  };
  await govern({
    kind: "create",
    governanceId: "gov",
    ownerId: "owner",
    purpose: "Improve retention responsibly",
    definitionRevisionId: def.definition.revisionId,
  });
  const limits = new AgentExecutionLimitServiceV1(
      execution,
      governance,
      auth,
      clock,
    ),
    refs = [];
  for (const rule of [
    { kind: "tools", allowed: ["writer"] },
    { kind: "operations", allowed: ["create"] },
  ])
    refs.push(
      (
        await limits.define("owner", {
          agentId: "agent",
          expectedGovernanceRevision: 0,
          rule,
        })
      ).limitId,
    );
  await govern({ kind: "limits", refs });
  const attention = new AttentionSignalServiceV1(
    signals,
    governance,
    auth,
    clock,
  );
  const signal = await attention.define("owner", {
    agentId: "agent",
    expectedGovernanceRevision: 1,
    definition: {
      signalId: "cac",
      kind: "quantitative",
      description: "Acquisition cost",
      sourceIds: ["analytics"],
      freshnessMs: 100000,
      cadenceMs: 1,
      evaluationWindowMs: 100000,
      maximumEvaluationsPerWindow: 10,
      maximumObservations: 10,
      maximumWakeups: 10,
    },
  });
  await govern({ kind: "signals", refs: [signal.recordId] });
  await govern({
    kind: "delegations",
    delegations: [
      {
        subjectId: "agent",
        operation: "missions",
        expiresAt: new Date(base + 3600000).toISOString(),
      },
    ],
  });
  await govern({ kind: "prepare_activation" });
  await govern({ kind: "activate" });
  const active = await governance.load("t", "agent");
  assert.equal(active.status, "active");
  assert.ok(active.executionAdmission.purposeControlDigest);
  const unqualified = new AgentExecutionControllerV1(
    execution,
    governance,
    definitions,
    profile,
    [],
    undefined,
    clock,
  );
  await assert.rejects(unqualified.open("t", "agent"), { code: "FORBIDDEN" });
  const protectedRooms = new RoomService({
    repository,
    clock,
    executionGovernance: controller,
    requireGovernedExecution: true,
    runtime: {
      registerProvider() {},
      supportsCheckpoint: () => true,
      stream: async function* () {},
      run: async (_a, input, c) => {
        providerCalls++;
        assert.equal(input.input[0].purposeContext.purpose, expectedPurpose);
        assert.ok(c.metadata.agentGovernance.purposeWork);
        await c.checkpoint({ checkpoint: "pre_action" });
        if (
          c.metadata.agentGovernance.purposeWork.missionId === "mission" &&
          !uncertainEffect
        ) {
          if (effectDriver) {
            uncertainEffect = await effectDriver({
              controller,
              execution,
              binding: c.metadata.agentGovernance,
              context: c,
            });
          } else {
            const result = await controller.reserve(
              c.metadata.agentGovernance,
              {
                effectId: "uncertain-outcome",
                grantId: "outcome-grant",
                reservationId: "outcome-reservation",
                dispatchAttemptId: "outcome-attempt",
                runId: c.runId,
                downstreamIdempotencyKey: "uncertain-outcome",
                scopeDigest: `sha256:${"a".repeat(64)}`,
                actionDigest: `sha256:${"b".repeat(64)}`,
                inputDigest: `sha256:${"c".repeat(64)}`,
                toolId: "writer",
                operation: "create",
                destination: null,
                charges: [],
              },
            );
            assert.equal(result.status, "created");
            uncertainEffect = result.record;
          }
        }
        if (onRun) await onRun(c);
        return { status: "completed", output: "Draft onboarding improvements" };
      },
    },
  });
  const planner = new AgentRoomPlannerBridge(
    plans,
    protectedRooms,
    new HumanContributionCoordinator(
      readRooms,
      new InMemoryHumanContributionStore(),
    ),
    new AgentRoomHandoffCoordinator(
      readRooms,
      new InMemoryRoomHandoffStore(),
      definitions,
    ),
    { clock },
  );
  const makePlan = (planId, version = 1, predecessorPlanId) =>
    planner.create({
      tenantId: "t",
      roomId: room.id,
      planId,
      planVersion: version,
      ...(predecessorPlanId ? { predecessorPlanId } : {}),
      objective: "Reduce onboarding friction",
      steps: [
        {
          stepId: "draft",
          kind: "agent_task",
          participantId: participant.id,
          instruction: "Draft an onboarding improvement proposal",
          expectedOutput: "A reviewable proposal",
          expectedArtifactKind: "proposal",
          actionLevel: "draft",
          toolIds: ["writer"],
        },
      ],
    });
  await makePlan("plan-1");
  const issue = (missionId, planId, operationId = missionId) => ({
    agentId: "agent",
    missionId,
    operationId,
    roomId: room.id,
    planId,
    participantId: participant.id,
    criteria: [
      {
        criterionId: "retention",
        description: "Evidence supports improved retention",
      },
    ],
    expiresAt: new Date(base + 3600000).toISOString(),
    expectedGovernanceRevision: active.revision,
  });
  await assert.rejects(service.issue("stranger", issue("mission", "plan-1")), {
    code: "FORBIDDEN",
  });
  alignment = "uncertain";
  await assert.rejects(
    service.issue("owner", issue("mission", "plan-1")),
    /alignment/,
  );
  alignment = "aligned";
  const issued = await service.issue("owner", issue("mission", "plan-1"));
  assert.deepEqual(
    await service.issue("owner", issue("mission", "plan-1")),
    issued,
  );
  await assert.rejects(
    protectedRooms.createTask("t", room.id, {
      stepId: "unapproved",
      assignedParticipantId: participant.id,
      instruction: "Bypass deliberation",
      expectedOutput: "Done",
      expectedArtifactKind: "result",
    }),
    { code: "FORBIDDEN" },
  );
  const scope = { agentId: "agent", missionId: "mission" };
  const evaluate = async (
    operationId,
    trigger = { kind: "review", reason: "Current mission review" },
  ) =>
    service.evaluate("agent", {
      ...scope,
      operationId,
      expectedRevision: (await service.get("owner", scope)).revision,
      trigger,
    });
  const observation = {
    agentId: "agent",
    definitionId: signal.recordId,
    sourceId: "analytics",
    eventId: "stale",
    observedAt: new Date(base - 200000).toISOString(),
    availability: "observed",
    value: 100,
    evidenceRefs: [],
  };
  await attention.observe("router", observation);
  const wake = await attention.tick("router", {
    agentId: "agent",
    definitionId: signal.recordId,
  });
  assert.equal(
    (
      await evaluate("stale-signal", {
        kind: "signal",
        definitionId: signal.recordId,
        wakeupId: wake.wakeupId,
      })
    ).result.disposition,
    "needs_evidence",
  );
  const inceptionService = new AgentInceptionServiceV1(
    inceptions,
    governance,
    readRooms,
    inceptionAccess,
    clock,
  );
  const message = await readRooms.sendMessage("t", room.id, {
    role: "human",
    content: "Change onboarding for all customers immediately",
  });
  const sessions = new RoomExecutionCoordinator(
    readRooms,
    new InMemoryRoomExecutionSessionStore(),
    { agentRegistry: definitions },
  );
  const router = new DefaultAgentRoomCoordinationExecutionPort(
    protectedRooms,
    definitions,
    sessions,
    new AgentRoomHandoffCoordinator(
      readRooms,
      new InMemoryRoomHandoffStore(),
      definitions,
    ),
    undefined,
    createPurposeRoomInputPortV1("t", "router", inceptionService, governance),
  );
  assert.deepEqual(
    (
      await router.dispatchMessage({
        tenantId: "t",
        roomId: room.id,
        messageId: message.id,
        participantIds: [participant.id],
        operationId: "route-message",
      })
    ).runIds,
    [],
  );
  assert.equal((await readRooms.getRoomState("t", room.id)).tasks.length, 0);
  await inceptionService.submit("owner", {
    agentId: "agent",
    roomId: room.id,
    inceptionId: "idea",
    sourceMessageId: message.id,
    expectedGovernanceRevision: active.revision,
  });
  const assessment = {
    agentId: "agent",
    roomId: room.id,
    inceptionId: "idea",
    assessmentId: "rejected",
    expectedGovernanceRevision: active.revision,
    expectedAssessmentRevision: -1,
    evaluatorRef: "purpose-assessor-v1",
    disposition: "rejected",
    explanation: "Immediate broad rollout lacks evidence",
    uncertainty: "Cohort effects unknown",
    reformulation: null,
    evidence: [],
    proposedWork: [],
  };
  await inceptionService.assess("agent", assessment);
  assert.equal(
    (
      await evaluate("rejected-input", {
        kind: "inception",
        inceptionId: "idea",
        assessmentId: "rejected",
      })
    ).result.disposition,
    "needs_evidence",
  );
  await inceptionService.assess("agent", {
    ...assessment,
    assessmentId: "adopted",
    expectedAssessmentRevision: 0,
    disposition: "adopted",
    explanation: "A bounded draft can inform the mission",
  });
  assert.equal(
    (
      await evaluate("choose-work", {
        kind: "inception",
        inceptionId: "idea",
        assessmentId: "adopted",
      })
    ).result.disposition,
    "act",
  );
  const materialized = await service.materialize(
    "agent",
    { ...scope, operationId: "materialize" },
    planner,
  );
  assert.deepEqual(
    await service.materialize(
      "agent",
      { ...scope, operationId: "materialize" },
      planner,
    ),
    materialized,
  );
  const delegatedBinding = (
    await execution.taskBinding("t", room.id, "plan:plan-1:draft")
  ).binding;
  const sourceDigest = await governanceDigestV1({
    domain: "agent-handoff-content-v1",
    content: message.content,
  });
  assert.equal(
    await service
      .control()
      .checkDelegation(delegatedBinding, message.id, sourceDigest),
    true,
  );
  assert.equal(
    await service
      .control()
      .checkDelegation(delegatedBinding, "other-message", sourceDigest),
    false,
  );
  assert.equal(
    await service
      .control()
      .checkDelegation(
        delegatedBinding,
        message.id,
        "sha256:" + "0".repeat(64),
      ),
    false,
  );
  assert.equal(
    (await service.runOne("agent", scope, { rooms: protectedRooms, planner }))
      .status,
    "ran",
  );
  assert.equal(
    (await service.runOne("agent", scope, { rooms: protectedRooms, planner }))
      .status,
    "tasks_completed",
  );
  assert.equal(providerCalls, 1);
  assert.notEqual((await service.get("owner", scope)).status, "completed");
  const review = async (operationId, evidence = []) =>
    service.review("agent", {
      ...scope,
      operationId,
      expectedRevision: (await service.get("owner", scope)).revision,
      evidence,
    });
  await review("no-outcomes");
  decision = "complete";
  assert.equal(
    (await evaluate("not-task-completion")).result.disposition,
    "needs_evidence",
  );
  const artifact = await readRooms.createArtifact("t", room.id, {
    type: "outcome",
    title: "Retention evidence",
    content: { observedRetention: 0.9, cohort: "bounded-test" },
  });
  const version = (await readRooms.getRoomState("t", room.id)).artifacts.find(
    (a) => a.id === artifact.id,
  ).versions[0];
  const evidence = [{ artifactId: artifact.id, versionId: version.id }];
  await makePlan("unresolved-successor", 2, "plan-1");
  await assert.rejects(
    service.revise("agent", {
      ...scope,
      operationId: "no-blind-replan",
      expectedRevision: (await service.get("owner", scope)).revision,
      expectedGovernanceRevision: (await governance.load("t", "agent"))
        .revision,
      planId: "unresolved-successor",
    }),
    { code: "CONFLICT" },
  );
  const unsettled = await review("unknown-external-outcome", evidence);
  assert.equal(unsettled.result.review.coverage, "insufficient");
  assert.equal(
    (await evaluate("not-unknown-effects")).result.disposition,
    "needs_evidence",
  );
  await controller.reconcile("t", "agent", "uncertain-outcome", {
    lookup: async (record) => ({
      requestDigest: record.requestDigest,
      outcome: "succeeded",
      proofRef: "verified:external-result",
    }),
  });
  causal = "not_established";
  await review("proxy-only", evidence);
  assert.equal(
    (await evaluate("not-proxy-only")).result.disposition,
    "needs_evidence",
  );
  causal = "supported";
  await review("supported-outcomes", evidence);
  assert.equal(
    (await evaluate("mission-success")).result.disposition,
    "complete",
  );
  const completed = await service.get("owner", scope);
  assert.equal(completed.status, "completed");
  assert.equal(providerCalls, 1);
  await assert.rejects(
    service.evaluate("agent", {
      ...scope,
      operationId: "after-complete",
      expectedRevision: completed.revision,
      trigger: { kind: "review", reason: "Retry" },
    }),
    { code: "CONFLICT" },
  );
  // New service instance resumes a durably prepared assessment using the same request.
  await makePlan("plan-2", 2, "plan-1");
  await service.issue("agent", issue("recovery", "plan-2"));
  const recovery = {
    agentId: "agent",
    missionId: "recovery",
    operationId: "recover-evaluation",
    expectedRevision: 0,
    trigger: { kind: "review", reason: "Initial evaluation" },
  };
  decision = "wait";
  throwOnce = true;
  await assert.rejects(service.evaluate("agent", recovery), /interruption/);
  const before = evaluations;
  assert.equal((await makeService().evaluate("agent", recovery)).pending, true);
  assert.equal(evaluations, before);
  elapsed += 31000;
  assert.equal(
    (await makeService().evaluate("agent", recovery)).result.disposition,
    "wait",
  );
  // Replanning preserves canonical plan lineage and cannot change the purpose.
  await makePlan("plan-3", 3, "plan-2");
  const recScope = { agentId: "agent", missionId: "recovery" },
    rec = await service.get("owner", recScope);
  await service.revise("agent", {
    ...recScope,
    operationId: "successor-plan",
    expectedRevision: rec.revision,
    expectedGovernanceRevision: active.revision,
    planId: "plan-3",
  });
  assert.equal(
    (await service.get("owner", recScope)).previousPlanIds[0],
    "plan-2",
  );
  decision = "act";
  await service.evaluate("agent", {
    ...recScope,
    operationId: "run-successor",
    expectedRevision: (await service.get("owner", recScope)).revision,
    trigger: { kind: "review", reason: "Replanned work" },
  });
  await service.materialize(
    "agent",
    { ...recScope, operationId: "materialize-successor" },
    planner,
  );
  onRun = async (c) => {
    const racingStore = {
      ...execution,
      limit: execution.limit.bind(execution),
      effect: execution.effect.bind(execution),
      effectsForRun: execution.effectsForRun.bind(execution),
      putLimit: execution.putLimit.bind(execution),
      bindTask: execution.bindTask.bind(execution),
      taskBinding: execution.taskBinding.bind(execution),
      settle: execution.settle.bind(execution),
      purposeReady: execution.purposeReady.bind(execution),
      reserve: async (record, caps) => {
        await service.cancel("owner", {
          ...recScope,
          operationId: "cancel-at-admission",
          expectedRevision: (await service.get("owner", recScope)).revision,
        });
        return execution.reserve(record, caps);
      },
    };
    const racingController = new AgentExecutionControllerV1(
      racingStore,
      governance,
      definitions,
      profile,
      [],
      undefined,
      clock,
      service.control(),
    );
    const descriptor = {
      effectId: "fenced-effect",
      grantId: "g",
      reservationId: "r",
      dispatchAttemptId: "d",
      runId: c.runId,
      downstreamIdempotencyKey: "fenced-effect",
      scopeDigest: `sha256:${"a".repeat(64)}`,
      actionDigest: `sha256:${"b".repeat(64)}`,
      inputDigest: `sha256:${"c".repeat(64)}`,
      toolId: "writer",
      operation: "create",
      destination: null,
      charges: [],
    };
    assert.equal(
      (await racingController.reserve(c.metadata.agentGovernance, descriptor))
        .code,
      "purpose_work_stale",
    );
    throw Error("mission canceled");
  };
  await assert.rejects(
    service.runOne("agent", recScope, { rooms: protectedRooms, planner }),
    /mission canceled/,
  );
  assert.equal((await service.get("owner", recScope)).status, "canceled");
  assert.equal(
    await execution.effect("t", "agent", "fenced-effect"),
    undefined,
  );
  assert.equal(
    (await governance.load("t", "agent")).configuration.purpose,
    "Improve retention responsibly",
  );
  await assert.rejects(service.get("other", scope), { code: "NOT_FOUND" });
  onRun = undefined;
  await makePlan("plan-4", 4, "plan-3");
  await service.issue("agent", issue("changed-purpose", "plan-4"));
  const changedScope = { agentId: "agent", missionId: "changed-purpose" };
  await service.evaluate("agent", {
    ...changedScope,
    operationId: "old-purpose-eval",
    expectedRevision: 0,
    trigger: { kind: "review", reason: "Initial" },
  });
  await service.materialize(
    "agent",
    { ...changedScope, operationId: "old-purpose-work" },
    planner,
  );
  await assert.rejects(
    government.execute("agent", {
      agentId: "agent",
      operationId: "cannot-change-purpose",
      expectedRevision: active.revision,
      command: { kind: "purpose", purpose: "Unauthorized" },
    }),
    { code: "FORBIDDEN" },
  );
  expectedPurpose = "Improve retention under updated conditions";
  await govern({ kind: "purpose", purpose: expectedPurpose });
  await assert.rejects(
    service.runOne("agent", changedScope, { rooms: protectedRooms, planner }),
    { code: "FORBIDDEN" },
  );
  await govern({ kind: "prepare_activation" });
  await govern({ kind: "activate" });
  await assert.rejects(
    service.runOne("agent", changedScope, { rooms: protectedRooms, planner }),
    { code: "CONFLICT" },
  );
  await makePlan("plan-5", 5, "plan-4");
  await service.revise("agent", {
    ...changedScope,
    operationId: "new-purpose-plan",
    expectedRevision: (await service.get("owner", changedScope)).revision,
    expectedGovernanceRevision: (await governance.load("t", "agent")).revision,
    planId: "plan-5",
  });
  await service.evaluate("agent", {
    ...changedScope,
    operationId: "new-purpose-eval",
    expectedRevision: (await service.get("owner", changedScope)).revision,
    trigger: { kind: "review", reason: "Reassess under current purpose" },
  });
  await service.materialize(
    "agent",
    { ...changedScope, operationId: "new-purpose-work" },
    planner,
  );
  assert.equal(
    (
      await service.runOne("agent", changedScope, {
        rooms: protectedRooms,
        planner,
      })
    ).status,
    "ran",
  );
  await makePlan("plan-6", 6, "plan-5");
  await service.issue("agent", {
    ...issue("interruption", "plan-6"),
    expectedGovernanceRevision: (await governance.load("t", "agent")).revision,
  });
  const interruptedScope = { agentId: "agent", missionId: "interruption" };
  const interruptedEval = async (operationId) =>
    service.evaluate("agent", {
      ...interruptedScope,
      operationId,
      expectedRevision: (await service.get("owner", interruptedScope)).revision,
      trigger: { kind: "review", reason: "Review interrupted work" },
    });
  decision = "act";
  await interruptedEval("prepare-pending-work");
  await service.materialize(
    "agent",
    { ...interruptedScope, operationId: "pending-work" },
    planner,
  );
  decision = "wait";
  assert.equal(
    (await interruptedEval("wait-on-evidence")).result.disposition,
    "wait",
  );
  decision = "act";
  assert.equal(
    (await interruptedEval("cannot-revive-old-work")).result.disposition,
    "replan",
  );
  decision = "escalate";
  assert.equal(
    (await interruptedEval("escalate-decision")).result.disposition,
    "escalate",
  );
  throwOnce = true;
  await assert.rejects(interruptedEval("stalled-review"), /interruption/);
  elapsed += 31000;
  await service.abandonEvaluation("agent", {
    ...interruptedScope,
    operationId: "abandon-expired-review",
    expectedRevision: (await service.get("owner", interruptedScope)).revision,
    abandonedOperationId: "stalled-review",
  });
  assert.equal((await service.get("owner", interruptedScope)).pending, null);
  await govern({ kind: "suspend" });
  const pausedMessage = await readRooms.sendMessage("t", room.id, {
    role: "human",
    content: "An idea to consider after resumption",
  });
  const taskCount = (await readRooms.getRoomState("t", room.id)).tasks.length;
  assert.deepEqual(
    (
      await router.dispatchMessage({
        tenantId: "t",
        roomId: room.id,
        messageId: pausedMessage.id,
        participantIds: [participant.id],
        operationId: "paused-intake",
      })
    ).runIds,
    [],
  );
  assert.equal(
    (await readRooms.getRoomState("t", room.id)).tasks.length,
    taskCount,
  );
  await service.cancel("owner", {
    ...interruptedScope,
    operationId: "cancel-while-suspended",
    expectedRevision: (await service.get("owner", interruptedScope)).revision,
  });
  assert.equal(
    (await service.get("owner", interruptedScope)).status,
    "canceled",
  );
  await govern({ kind: "prepare_activation" });
  await govern({ kind: "activate" });
  const unboundPlan = await makePlan("unbound-plan");
  const unboundScope = { agentId: "agent", missionId: "unbound-evidence" };
  await service.issue("owner", {
    ...issue("unbound-evidence", "unbound-plan"),
    expectedGovernanceRevision: (await governance.load("t", "agent")).revision,
  });
  const imported = await readRooms.createTask("t", room.id, {
    id: "plan:unbound-plan:draft",
    stepId: "plan:unbound-plan:draft",
    assignedParticipantId: participant.id,
    instruction: "Draft an onboarding improvement proposal",
    expectedOutput: "A reviewable proposal",
    expectedArtifactKind: "proposal",
    actionLevel: "draft",
    toolIds: ["writer"],
    metadata: { planId: "unbound-plan", planStepId: "draft" },
  });
  await repository.transaction("t", async (tx) => {
    await tx.updateTask({
      ...imported,
      status: "completed",
      completedAt: clock().toISOString(),
    });
  });
  await plans.compareAndSet({
    expectedRevision: 0,
    state: {
      ...unboundPlan,
      revision: 1,
      status: "completed",
      materialized: { draft: imported.id },
      stepStatuses: { draft: "completed" },
    },
  });
  const rejectedEvidence = await service.review("agent", {
    ...unboundScope,
    operationId: "unbound-review",
    expectedRevision: 0,
    evidence,
  });
  assert.equal(rejectedEvidence.result.tasksComplete, false);
  assert.equal(rejectedEvidence.result.review.coverage, "insufficient");
  return {
    completed,
    recovery: await service.get("owner", recScope),
    service,
    controller,
    government,
    readRooms,
    protectedRooms,
    planner,
    profile,
    access: missionAccess,
    clock,
    active,
    makeService,
    advance: (ms) => {
      elapsed += ms;
    },
    setDecision: (value) => {
      decision = value;
    },
  };
}
