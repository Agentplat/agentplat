import assert from "node:assert/strict";
import test from "node:test";

import { digestPlanningJsonV1 } from "@agentplat/collective-planning";
import {
  InMemoryTeamExecutionArtifactPortV1,
  InMemoryTeamExecutionStoreV1,
  TeamExecutionRuntimeV1,
  createPortableAgentTeamMemberExecutionPortV1,
  createTeamExecutionArtifactV1,
  createTeamExecutionControlEvidenceV1,
  createTeamExecutionPolicyV1,
  createTeamExecutionRebindRequestFromStateV1,
  createTeamExecutionStartRequestV1,
  createTeamExecutionStepCommandV1,
  createTeamExecutionStepResultV1,
  createTeamMemberOutcomeFromExecutionRecoveryV1,
  createTeamReconfigurationRequestFromExecutionV1,
  validateTeamExecutionStateV1,
  validateTeamExecutionStepCommandV1,
} from "@agentplat/collective-runtime/team-execution";
import {
  createJointWorkContractV1,
  createTeamCandidateV1,
  createTeamFormationScopeV1,
  createTeamMemberContractBindingV1,
  createTeamMemberSelectionV1,
  createTeamPositionBidV1,
  createTeamPositionV1,
  createTeamProposalV1,
} from "@agentplat/collective-runtime/team-formation";

const digest = (label) => digestPlanningJsonV1("team-candidate", { label });

const scope = createTeamFormationScopeV1({
  tenantId: "tenant",
  meshId: "mesh",
  policyDomainId: "policy-domain",
  missionIntentId: "mission",
  objectiveId: "objective",
  rootWorkItemId: "work.root",
  rootWorkItemRevision: 1,
});

const positions = [
  createTeamPositionV1({
    schemaVersion: 1,
    positionId: "position.independent",
    workItemId: "work.independent",
    workItemRevision: 1,
    roleKey: "independent",
    requiredCapabilityKeys: ["independent"],
    completionCriteria: ["reference-published"],
    dependsOnPositionIds: [],
    budgetUnits: 30,
    maximumActionBudgetUnits: 10,
  }),
  createTeamPositionV1({
    schemaVersion: 1,
    positionId: "position.source",
    workItemId: "work.source",
    workItemRevision: 1,
    roleKey: "source",
    requiredCapabilityKeys: ["source"],
    completionCriteria: ["reference-published"],
    dependsOnPositionIds: [],
    budgetUnits: 30,
    maximumActionBudgetUnits: 10,
  }),
  createTeamPositionV1({
    schemaVersion: 1,
    positionId: "position.consumer",
    workItemId: "work.consumer",
    workItemRevision: 1,
    roleKey: "consumer",
    requiredCapabilityKeys: ["consumer"],
    completionCriteria: ["reference-published"],
    dependsOnPositionIds: ["position.source"],
    budgetUnits: 30,
    maximumActionBudgetUnits: 10,
  }),
];

const formationRequestDigest = digest("formation-request.1");
const teamId = `team.${digestPlanningJsonV1("team-identity", {
  scopeDigest: scope.scopeDigest,
  formationRequestDigest,
}).slice(7)}`;

function activatedTeam({
  epoch = 1,
  predecessor = null,
  activatedAt = 5,
  replaceSource = true,
} = {}) {
  const requestDigest =
    epoch === 1 ? formationRequestDigest : digest(`formation-request.${epoch}`);
  const members = positions.map((position, index) => {
    const candidateId =
      epoch > 1 && replaceSource && position.positionId === "position.source"
        ? `candidate.replacement.${epoch}`
        : `candidate.${index}`;
    return createTeamMemberSelectionV1({
      schemaVersion: 1,
      teamId,
      teamEpoch: epoch,
      positionId: position.positionId,
      positionDigest: position.positionDigest,
      candidateId,
      candidateDigest: digest(`${candidateId}.digest`),
      peerId: `peer.${candidateId}`,
      instanceId: `instance.${candidateId}`,
      independenceGroupId: `group.${index}`,
      bidId: `bid.${candidateId}`,
      bidDigest: digest(`bid.${candidateId}`),
      sourceBidDigest: digest(`source-bid.${candidateId}`),
      budgetUnits: 30,
      expectedCompletionAtLogicalMs: 100 + index,
      locallyEvaluatedScoreMicros: 800_000 - index,
    });
  });
  const proposal = createTeamProposalV1({
    schemaVersion: 1,
    teamId,
    teamEpoch: epoch,
    scope,
    policyDigest: digest("formation-policy"),
    membershipEpoch: epoch,
    membershipConfigurationDigest: digest(`membership.${epoch}`),
    formationRequestDigest: requestDigest,
    predecessorJointWorkContractDigest: predecessor,
    positions,
    members,
    totalBudgetUnits: 90,
    expectedCompletionAtLogicalMs: 102,
    proposedAtLogicalMs: activatedAt,
    validUntilLogicalMs: 500,
  });
  const bindings = members.map((member, index) => {
    const position = positions.find(
      (candidate) => candidate.positionId === member.positionId,
    );
    return createTeamMemberContractBindingV1({
      schemaVersion: 1,
      memberId: member.memberId,
      selectionDigest: member.selectionDigest,
      positionId: member.positionId,
      peerId: member.peerId,
      instanceId: member.instanceId,
      workItemId: position.workItemId,
      workItemRevision: position.workItemRevision,
      workContractId: `work-contract.${epoch}.${index}`,
      workContractGeneration: epoch,
      workContractDigest: digest(`work-contract.${epoch}.${index}`),
      assignmentAuthorityId: `authority.${epoch}.${index}`,
      assignmentEpoch: epoch,
      authorityGeneration: epoch,
      fencingToken: `fence.${epoch}.${index}`,
      leaseExpiresAtLogicalMs: 500,
      workDeadline: "2030-01-01T00:00:00.000Z",
      roleKey: position.roleKey,
      requiredCapabilityKeys: position.requiredCapabilityKeys,
      reservedBudgetUnits: 30,
      maximumActionBudgetUnits: 10,
    });
  });
  return {
    proposal,
    joint: createJointWorkContractV1({
      proposal,
      memberContracts: bindings,
      activatedAtLogicalMs: activatedAt,
    }),
  };
}

function policy(overrides = {}) {
  return createTeamExecutionPolicyV1({
    schemaVersion: 1,
    policyId: "team-execution-policy",
    policyVersion: 1,
    parentPolicyDigest: null,
    requireReferencedCompletionArtifact: true,
    requireAllowedControlForProgress: true,
    limits: {
      maximumPositions: 8,
      maximumStepsPerPosition: 8,
      maximumArtifactsPerStep: 4,
      maximumArtifactsPerPosition: 8,
      maximumArtifactDependencies: 8,
      maximumArtifactBytes: 1_024,
      maximumPeerMessagesPerStep: 4,
      maximumTotalPeerMessages: 32,
      maximumRecoveryCount: 4,
      maximumHistoryEntries: 4,
      maximumExecutionDurationMs: 490,
      maximumStepTtlMs: 100,
      maximumCommitAttempts: 4,
    },
    ...overrides,
  });
}

function executor(statusByPosition = {}) {
  let calls = 0;
  const port = {
    executorId: "team-member-executor",
    executorVersion: 1,
    implementationId: "team-member-executor.default",
    async execute({ dispatch }) {
      calls += 1;
      const status = statusByPosition[dispatch.positionId] ?? "completed";
      const completedAtLogicalMs = dispatch.preparedAtLogicalMs + 1;
      const control = createTeamExecutionControlEvidenceV1({
        schemaVersion: 1,
        controlId: "portable-control",
        controlVersion: 1,
        implementationId: "portable-control.default",
        disposition: status === "completed" ? "allow" : "deny",
        reasonCode:
          status === "completed" ? "controls_allowed" : "control_refused",
        sourceEvidenceDigest: digest(`control.${dispatch.dispatchDigest}`),
        evaluatedAtLogicalMs: completedAtLogicalMs,
        validUntilLogicalMs: dispatch.validUntilLogicalMs,
      });
      const artifacts =
        status === "completed"
          ? [
              createTeamExecutionArtifactV1({
                dispatch,
                draft: {
                  schemaVersion: 1,
                  artifactId: `artifact.${dispatch.positionId}.${dispatch.positionStepSequence}`,
                  artifactKind: "position-result",
                  mediaType: "application/json",
                  byteLength: 32,
                  contentReference: `memory://${dispatch.dispatchId}`,
                  contentDigest: digest(`content.${dispatch.dispatchDigest}`),
                },
                producedAtLogicalMs: completedAtLogicalMs,
              }),
            ]
          : [];
      return createTeamExecutionStepResultV1({
        dispatch,
        executorId: port.executorId,
        executorVersion: port.executorVersion,
        executorImplementationId: port.implementationId,
        status,
        artifacts,
        peerMessageDigests: [digest(`message.${dispatch.dispatchDigest}`)],
        control,
        sourceStepRecordDigest: digest(`step.${dispatch.dispatchDigest}`),
        reasonCode:
          status === "completed" ? "position_completed" : "position_unsafe",
        completedAtLogicalMs,
      });
    },
  };
  return {
    port,
    get calls() {
      return calls;
    },
  };
}

function runtime({
  stateKey = "execution-state",
  memberExecutor = executor(),
  store = new InMemoryTeamExecutionStoreV1(),
} = {}) {
  const artifacts = new InMemoryTeamExecutionArtifactPortV1();
  const policyRecord = policy();
  return {
    artifacts,
    memberExecutor,
    policy: policyRecord,
    controller: new TeamExecutionRuntimeV1({
      stateKey,
      runtimeId: "team-execution",
      runtimeVersion: 1,
      implementationId: "team-execution.default",
      policy: policyRecord,
      executor: memberExecutor.port,
      artifacts,
      store,
    }),
  };
}

async function start(controller, team = activatedTeam()) {
  const execution = await controller.start(
    createTeamExecutionStartRequestV1({
      schemaVersion: 1,
      requestId: "execution-start",
      proposal: team.proposal,
      jointWorkContract: team.joint,
      logicalTimeMs: 10,
      validUntilLogicalMs: 400,
    }),
  );
  return { team, execution };
}

function command(execution, positionId, logicalTimeMs, suffix = positionId) {
  return createTeamExecutionStepCommandV1({
    schemaVersion: 1,
    commandId: `command.${suffix}`,
    executionId: execution.executionId,
    executionEpoch: execution.executionEpoch,
    positionId,
    inputReferenceDigest: digest(`input.${suffix}`),
    logicalTimeMs,
    validUntilLogicalMs: logicalTimeMs + 20,
  });
}

test("executes a dependency graph from durable references and replays idempotently", async () => {
  const context = runtime();
  let { execution } = await start(context.controller);
  assert.deepEqual(
    execution.positions.map(({ positionId, status }) => [positionId, status]),
    [
      ["position.consumer", "blocked"],
      ["position.independent", "ready"],
      ["position.source", "ready"],
    ],
  );

  const independentCommand = command(execution, "position.independent", 20);
  execution = await context.controller.runStep({
    command: independentCommand,
  });
  assert.equal(
    execution.positions.find(
      (value) => value.positionId === "position.consumer",
    ).status,
    "blocked",
  );

  execution = await context.controller.runStep({
    command: command(execution, "position.source", 22),
  });
  assert.equal(
    execution.positions.find(
      (value) => value.positionId === "position.consumer",
    ).status,
    "ready",
  );
  const sourceArtifact = execution.artifacts.find(
    (value) => value.producerPositionId === "position.source",
  );
  const consumerCommand = command(execution, "position.consumer", 24);
  execution = await context.controller.runStep({ command: consumerCommand });

  assert.equal(execution.status, "completed");
  assert.equal(execution.metrics.completedPositions, 3);
  assert.equal(execution.metrics.totalPeerMessages, 3);
  const consumerDispatch = execution.steps.find(
    (value) => value.dispatch.positionId === "position.consumer",
  ).dispatch;
  assert.deepEqual(consumerDispatch.dependencyArtifactDigests, [
    sourceArtifact.artifactDigest,
  ]);
  assert.equal(await context.artifacts.ensureAvailable(sourceArtifact), true);

  const replay = await context.controller.runStep({ command: consumerCommand });
  assert.equal(replay.recordDigest, execution.recordDigest);
  assert.equal(context.memberExecutor.calls, 3);
});

test("emits exact recovery evidence and rebinds only the unaffected subgraph", async () => {
  const context = runtime({
    stateKey: "recovery-state",
    memberExecutor: executor({ "position.source": "unsafe" }),
  });
  const initial = await start(context.controller);
  let execution = await context.controller.runStep({
    command: command(initial.execution, "position.independent", 20),
  });
  execution = await context.controller.runStep({
    command: command(execution, "position.source", 22),
  });

  assert.equal(execution.status, "recovery_required");
  assert.equal(execution.recoverySignal.failedPositionId, "position.source");
  assert.equal(
    createTeamMemberOutcomeFromExecutionRecoveryV1(execution.recoverySignal)
      .status,
    "unsafe",
  );

  const replacementCandidate = createTeamCandidateV1({
    schemaVersion: 1,
    candidateId: "candidate.replacement.2",
    peerId: "peer.candidate.replacement.2",
    instanceId: "instance.candidate.replacement.2",
    independenceGroupId: "group.replacement",
    sourceCandidateDigest: digest("replacement.candidate"),
    sourceRequestDigest: digest("replacement.request"),
    sourceDecisionDigest: digest("replacement.decision"),
    eligibleWorkItemId: "work.source",
    eligibleWorkItemRevision: 1,
    requiredCapabilityKeys: ["source"],
  });
  const replacementBid = createTeamPositionBidV1({
    schemaVersion: 1,
    bidId: "bid.replacement.2",
    positionId: "position.source",
    candidate: replacementCandidate,
    sourceBidDigest: digest("replacement.bid.source"),
    capacityReservationUnits: 1,
    budgetUnits: 30,
    expectedCompletionAtLogicalMs: 100,
    locallyEvaluatedScoreMicros: 900_000,
    observedAtLogicalMs: 24,
    validUntilLogicalMs: 100,
  });
  const reconfiguration = createTeamReconfigurationRequestFromExecutionV1({
    recoverySignal: execution.recoverySignal,
    currentJointWorkContractDigest: initial.team.joint.jointWorkContractDigest,
    membershipEpoch: 2,
    membershipConfigurationDigest: digest("membership.2"),
    replacementBids: [replacementBid],
    logicalTimeMs: 25,
    validUntilLogicalMs: 100,
  });
  assert.equal(
    reconfiguration.failedMemberId,
    execution.recoverySignal.failedMemberId,
  );

  const replacement = activatedTeam({
    epoch: 2,
    predecessor: initial.team.joint.jointWorkContractDigest,
    activatedAt: 50,
  });
  const state = await context.controller.loadState();
  const unchanged = activatedTeam({
    epoch: 2,
    predecessor: initial.team.joint.jointWorkContractDigest,
    activatedAt: 49,
    replaceSource: false,
  });
  await assert.rejects(
    context.controller.rebind(
      createTeamExecutionRebindRequestFromStateV1({
        requestId: "execution-rebind.unchanged",
        state,
        policy: context.policy,
        proposal: unchanged.proposal,
        jointWorkContract: unchanged.joint,
        logicalTimeMs: 49,
      }),
    ),
    /member continuity/u,
  );
  const rebindRequest = createTeamExecutionRebindRequestFromStateV1({
    requestId: "execution-rebind.2",
    state,
    policy: context.policy,
    proposal: replacement.proposal,
    jointWorkContract: replacement.joint,
    logicalTimeMs: 50,
  });
  execution = await context.controller.rebind(rebindRequest);

  assert.equal(execution.executionEpoch, 2);
  assert.equal(execution.metrics.recoveryCount, 1);
  assert.equal(execution.history.length, 1);
  assert.equal(
    execution.positions.find(
      (value) => value.positionId === "position.independent",
    ).status,
    "completed",
  );
  assert.equal(
    execution.positions.find((value) => value.positionId === "position.source")
      .status,
    "ready",
  );
  assert.equal(
    execution.positions.find(
      (value) => value.positionId === "position.consumer",
    ).status,
    "blocked",
  );
  assert.deepEqual(
    execution.artifacts.map((value) => value.producerPositionId),
    ["position.independent"],
  );
  assert.equal(
    (await context.controller.rebind(rebindRequest)).recordDigest,
    execution.recordDigest,
  );
});

test("retries a compare-and-swap conflict without changing the transition", async () => {
  const backing = new InMemoryTeamExecutionStoreV1();
  let saves = 0;
  const conflictingStore = {
    load: (stateKey) => backing.load(stateKey),
    async save(input) {
      saves += 1;
      if (saves === 1) return false;
      return backing.save(input);
    },
  };
  const context = runtime({
    stateKey: "cas-conflict-state",
    store: conflictingStore,
  });
  const { execution } = await start(context.controller);

  assert.equal(execution.status, "active");
  assert.equal((await context.controller.loadState()).revision, 1);
  assert.equal(saves, 2);
});

test("expires prepared work into recovery and preserves exact state handoff", async () => {
  const source = runtime({ stateKey: "handoff-source" });
  const { execution } = await start(source.controller);
  const dispatch = await source.controller.prepareStep(
    command(execution, "position.source", 20, "expiry"),
  );
  const failed = await source.controller.expireStep({
    dispatchDigest: dispatch.dispatchDigest,
    logicalTimeMs: dispatch.validUntilLogicalMs,
  });
  assert.equal(failed.status, "recovery_required");
  assert.equal(failed.recoverySignal.reasonCode, "step_deadline_exceeded");

  const handoff = await source.controller.exportHandoff({
    targetStateKey: "handoff-target",
    logicalTimeMs: 50,
  });
  const target = runtime({ stateKey: "handoff-target" });
  const restored = await target.controller.importHandoff({
    handoff,
    logicalTimeMs: 51,
  });
  assert.equal(restored.execution.recordDigest, failed.recordDigest);
  assert.equal(restored.predecessorStateDigest, handoff.sourceStateDigest);
  assert.equal(
    validateTeamExecutionStateV1(restored, { policy: target.policy })
      .stateDigest,
    restored.stateDigest,
  );
});

test("cancels prepared work without retaining an executable dispatch", async () => {
  const context = runtime({ stateKey: "cancel-state" });
  const { execution } = await start(context.controller);
  await context.controller.prepareStep(
    command(execution, "position.independent", 20, "cancel"),
  );
  const cancelled = await context.controller.cancel({
    reasonCode: "operator_cancelled",
    logicalTimeMs: 21,
  });

  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.terminalReasonCode, "operator_cancelled");
  assert.equal(cancelled.steps.length, 0);
  assert.equal(cancelled.metrics.totalStepAttempts, 1);
  assert.ok(
    cancelled.positions.every(
      (position) =>
        position.status === "cancelled" || position.status === "completed",
    ),
  );
  assert.equal(
    (
      await context.controller.cancel({
        reasonCode: "operator_cancelled",
        logicalTimeMs: 21,
      })
    ).recordDigest,
    cancelled.recordDigest,
  );
  await assert.rejects(
    context.controller.cancel({
      reasonCode: "different_reason",
      logicalTimeMs: 21,
    }),
    /conflicts/u,
  );
});

test("fails closed on non-allow completion and hostile accessor input", async () => {
  const denied = executor();
  denied.port.execute = async ({ dispatch }) => {
    const completedAtLogicalMs = dispatch.preparedAtLogicalMs + 1;
    return createTeamExecutionStepResultV1({
      dispatch,
      executorId: denied.port.executorId,
      executorVersion: denied.port.executorVersion,
      executorImplementationId: denied.port.implementationId,
      status: "completed",
      artifacts: [
        createTeamExecutionArtifactV1({
          dispatch,
          draft: {
            schemaVersion: 1,
            artifactId: "artifact.denied",
            artifactKind: "position-result",
            mediaType: "application/json",
            byteLength: 1,
            contentReference: "memory://denied",
            contentDigest: digest("denied.content"),
          },
          producedAtLogicalMs: completedAtLogicalMs,
        }),
      ],
      peerMessageDigests: [],
      control: createTeamExecutionControlEvidenceV1({
        schemaVersion: 1,
        controlId: "portable-control",
        controlVersion: 1,
        implementationId: "portable-control.default",
        disposition: "deny",
        reasonCode: "control_denied",
        sourceEvidenceDigest: digest("denied.control"),
        evaluatedAtLogicalMs: completedAtLogicalMs,
        validUntilLogicalMs: dispatch.validUntilLogicalMs,
      }),
      sourceStepRecordDigest: digest("denied.step"),
      reasonCode: "completed_without_allow",
      completedAtLogicalMs,
    });
  };
  const context = runtime({
    stateKey: "denied-state",
    memberExecutor: denied,
  });
  const { execution } = await start(context.controller);
  await assert.rejects(
    context.controller.runStep({
      command: command(execution, "position.independent", 20, "denied"),
    }),
    /local policy/u,
  );
  assert.equal(
    (await context.controller.loadState()).execution.status,
    "active",
  );

  const valid = command(execution, "position.source", 22, "hostile");
  let invoked = false;
  const hostile = { ...valid };
  Object.defineProperty(hostile, "positionId", {
    enumerable: true,
    get() {
      invoked = true;
      return "position.source";
    },
  });
  assert.throws(() => validateTeamExecutionStepCommandV1(hostile), /shape/u);
  assert.equal(invoked, false);
});

test("portable-agent adapter binds the controlled session and returns references only", async () => {
  const team = activatedTeam();
  const context = runtime();
  const { execution } = await start(context.controller, team);
  const dispatch = await context.controller.prepareStep(
    command(execution, "position.independent", 20, "portable"),
  );
  const member = team.proposal.members.find(
    (value) => value.positionId === dispatch.positionId,
  );
  const role = {
    schemaVersion: 1,
    roleBindingId: "role.binding",
    roleRevision: 1,
    predecessorRoleBindingId: null,
    objectiveId: "objective",
    roleKey: "independent",
    instructions: [],
    constraints: {},
    validFromLogicalMs: 0,
    validUntilLogicalMs: 500,
  };
  const baseSession = {
    schemaVersion: 1,
    sessionId: "portable.session",
    tenantId: "tenant",
    agentId: "agent.independent",
    objectiveId: "objective",
    manifest: {
      schemaVersion: 1,
      adapterId: "adapter.independent",
      adapterVersion: "1.0.0",
      implementationId: "adapter.independent.default",
      agentKinds: ["hybrid"],
      inputModalities: ["structured"],
      outputModalities: ["structured"],
      interactionModes: ["invoke"],
      controlPoints: ["post_output", "pre_action", "pre_step"],
      supportsCancellation: true,
      supportsCheckpoint: false,
      supportsRestore: false,
      maximumObservationBytes: 1_024,
      maximumOutputBytes: 1_024,
      maximumActionBytes: 1_024,
      maximumStepsPerSession: 8,
    },
    controlBinding: {
      controlId: "portable-control",
      controlVersion: 1,
      implementationId: "portable-control.default",
    },
    role,
    status: "active",
    revision: 0,
    nextStepSequence: 1,
    stepRecords: [],
    checkpoint: null,
    metadata: {},
    createdAt: "2030-01-01T00:00:00.000Z",
    updatedAt: "2030-01-01T00:00:00.000Z",
    closedAt: null,
  };
  const request = {
    schemaVersion: 1,
    stepId: dispatch.dispatchId,
    expectedSessionRevision: 0,
    interactionMode: "invoke",
    observations: [],
    input: null,
    requestedOutputModalities: ["structured"],
    logicalTimeMs: 20,
  };
  const result = {
    schemaVersion: 1,
    sessionId: "portable.session",
    stepId: dispatch.dispatchId,
    stepSequence: 1,
    status: "completed",
    outputs: [],
    actionProposals: [],
    checkpoint: null,
    reasonCode: null,
    metadata: {},
  };
  const record = {
    schemaVersion: 1,
    stepId: dispatch.dispatchId,
    stepSequence: 1,
    roleBindingId: "role.binding",
    roleRevision: 1,
    interactionMode: "invoke",
    status: "completed",
    request,
    result,
    startedAt: "2030-01-01T00:00:00.000Z",
    completedAt: "2030-01-01T00:00:01.000Z",
  };
  let currentSession = baseSession;
  let portableStepCalls = 0;
  const sessionRuntime = {
    async getSession() {
      return currentSession;
    },
    async step() {
      portableStepCalls += 1;
      currentSession = {
        ...baseSession,
        revision: 1,
        nextStepSequence: 2,
        stepRecords: [record],
      };
      return {
        record,
        session: currentSession,
      };
    },
  };
  const portableExecutor = createPortableAgentTeamMemberExecutionPortV1({
    executorId: "portable-team-executor",
    executorVersion: 1,
    implementationId: "portable-team-executor.default",
    sessionRuntime,
    resolveBinding: () => ({
      sessionId: "portable.session",
      tenantId: "tenant",
      objectiveId: "objective",
      agentId: "agent.independent",
      memberId: member.memberId,
    }),
    mapStepRequest: () => request,
    collectArtifacts: () => [
      {
        schemaVersion: 1,
        artifactId: "artifact.portable",
        artifactKind: "position-result",
        mediaType: "application/json",
        byteLength: 12,
        contentReference: "memory://portable-result",
        contentDigest: digest("portable.result"),
      },
    ],
    logicalClock: () => 21,
  });
  const adapted = await portableExecutor.execute({
    dispatch,
    dependencyArtifacts: [],
  });

  assert.equal(adapted.status, "completed");
  assert.equal(adapted.control.disposition, "allow");
  assert.equal(
    adapted.artifacts[0].contentReference,
    "memory://portable-result",
  );
  assert.equal("outputs" in adapted, false);
  assert.equal(
    (
      await portableExecutor.execute({
        dispatch,
        dependencyArtifacts: [],
      })
    ).resultDigest,
    adapted.resultDigest,
  );
  assert.equal(portableStepCalls, 1);
});
