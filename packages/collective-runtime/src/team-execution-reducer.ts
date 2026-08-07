import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import type {
  TeamExecutionArtifactV1,
  TeamExecutionPolicyRecordV1,
  TeamExecutionPositionStateV1,
  TeamExecutionRebindRequestV1,
  TeamExecutionRecordV1,
  TeamExecutionStartRequestV1,
  TeamExecutionStateV1,
  TeamExecutionStepCommandV1,
  TeamExecutionStepDispatchV1,
  TeamExecutionStepResultV1,
  TeamMemberExecutionPortV1,
} from "./team-execution-contracts.js";
import {
  createTeamExecutionControlEvidenceV1,
  createTeamExecutionEpochHistoryEntryV1,
  createTeamExecutionMetricsV1,
  createTeamExecutionPositionStateV1,
  createTeamExecutionRecordV1,
  createTeamExecutionRecoverySignalV1,
  createTeamExecutionScopeV1,
  createTeamExecutionStateV1,
  createTeamExecutionStepDispatchV1,
  createTeamExecutionStepRecordV1,
  createTeamExecutionStepResultV1,
  deriveTeamExecutionIdV1,
  validateTeamExecutionPolicyV1,
  validateTeamExecutionRebindRequestV1,
  validateTeamExecutionStartRequestV1,
  validateTeamExecutionStateV1,
  validateTeamExecutionStepCommandV1,
  validateTeamExecutionStepResultV1,
} from "./team-execution-validation.js";

export function startTeamExecutionV1(input: {
  readonly state: TeamExecutionStateV1;
  readonly policy: TeamExecutionPolicyRecordV1;
  readonly request: TeamExecutionStartRequestV1;
}): {
  readonly state: TeamExecutionStateV1;
  readonly execution: TeamExecutionRecordV1;
} {
  const policy = validateTeamExecutionPolicyV1(input.policy);
  const state = validateTeamExecutionStateV1(input.state, { policy });
  const request = validateTeamExecutionStartRequestV1(input.request);
  if (state.execution) {
    if (
      state.execution.proposal.proposalDigest ===
        request.proposal.proposalDigest &&
      state.execution.jointWorkContract.jointWorkContractDigest ===
        request.jointWorkContract.jointWorkContractDigest
    )
      return freeze({ state, execution: state.execution });
    fail("team execution state already contains an execution");
  }
  if (request.logicalTimeMs < state.logicalTimeHighWaterMs)
    fail("team execution start logical time rolled back");
  if (
    request.proposal.positions.length > policy.policy.limits.maximumPositions ||
    request.validUntilLogicalMs - request.logicalTimeMs >
      policy.policy.limits.maximumExecutionDurationMs
  )
    fail("team execution start exceeds policy bounds");
  const scope = createTeamExecutionScopeV1({ proposal: request.proposal });
  const bindings = new Map(
    request.jointWorkContract.memberContracts.map((binding) => [
      binding.positionId,
      binding,
    ]),
  );
  const positions = request.proposal.positions.map((position) => {
    const binding = bindings.get(position.positionId)!;
    return createTeamExecutionPositionStateV1({
      schemaVersion: 1,
      positionId: position.positionId,
      positionDigest: position.positionDigest,
      memberId: binding.memberId,
      memberBindingDigest: binding.bindingDigest,
      workItemId: position.workItemId,
      workItemRevision: position.workItemRevision,
      dependsOnPositionIds: position.dependsOnPositionIds,
      status: position.dependsOnPositionIds.length === 0 ? "ready" : "blocked",
      stepSequence: 0,
      latestDispatchDigest: null,
      latestResultDigest: null,
      failureResultDigest: null,
      artifactDigests: freeze([]),
      startedAtLogicalMs: null,
      completedAtLogicalMs: null,
    });
  });
  const execution = createTeamExecutionRecordV1(
    {
      schemaVersion: 1,
      executionId: deriveTeamExecutionIdV1(scope),
      executionEpoch: request.proposal.teamEpoch,
      scope,
      status: "active",
      terminalReasonCode: null,
      proposal: request.proposal,
      jointWorkContract: request.jointWorkContract,
      positions,
      artifacts: freeze([]),
      steps: freeze([]),
      recoverySignal: null,
      metrics: createTeamExecutionMetricsV1({
        schemaVersion: 1,
        totalStepAttempts: 0,
        totalPeerMessages: 0,
        completedPositions: 0,
        recoveryCount: 0,
        lastRecoveryLatencyLogicalMs: null,
        maximumRecoveryLatencyLogicalMs: null,
      }),
      history: freeze([]),
      startedAtLogicalMs: request.logicalTimeMs,
      validUntilLogicalMs: request.validUntilLogicalMs,
      updatedAtLogicalMs: request.logicalTimeMs,
    },
    { policy },
  );
  return freeze({
    state: successorState(state, policy, execution, request.logicalTimeMs),
    execution,
  });
}

export function prepareTeamExecutionStepV1(input: {
  readonly state: TeamExecutionStateV1;
  readonly policy: TeamExecutionPolicyRecordV1;
  readonly command: TeamExecutionStepCommandV1;
}): {
  readonly state: TeamExecutionStateV1;
  readonly dispatch: TeamExecutionStepDispatchV1;
} {
  const policy = validateTeamExecutionPolicyV1(input.policy);
  const state = validateTeamExecutionStateV1(input.state, { policy });
  const command = validateTeamExecutionStepCommandV1(input.command);
  const execution = state.execution;
  if (!execution) fail("team execution is unavailable");
  const existing = execution.steps.find(
    (step) => step.dispatch.commandDigest === command.commandDigest,
  );
  if (existing) return freeze({ state, dispatch: existing.dispatch });
  if (execution.status !== "active") fail("active team execution is required");
  if (
    command.executionId !== execution.executionId ||
    command.executionEpoch !== execution.executionEpoch
  )
    fail("team execution step command is outside current execution");
  if (command.logicalTimeMs < state.logicalTimeHighWaterMs)
    fail("team execution step logical time rolled back");
  const position = execution.positions.find(
    (value) => value.positionId === command.positionId,
  );
  if (!position || position.status !== "ready")
    fail("team execution position is not ready");
  const binding = execution.jointWorkContract.memberContracts.find(
    (value) => value.positionId === position.positionId,
  )!;
  if (
    command.logicalTimeMs >= execution.validUntilLogicalMs ||
    command.logicalTimeMs >= binding.leaseExpiresAtLogicalMs ||
    command.validUntilLogicalMs > execution.validUntilLogicalMs ||
    command.validUntilLogicalMs > binding.leaseExpiresAtLogicalMs ||
    command.validUntilLogicalMs - command.logicalTimeMs >
      policy.policy.limits.maximumStepTtlMs ||
    position.stepSequence >= policy.policy.limits.maximumStepsPerPosition
  )
    fail("team execution step exceeds time or sequence bounds");
  const dependencyArtifactDigests = execution.positions
    .filter((candidate) =>
      position.dependsOnPositionIds.includes(candidate.positionId),
    )
    .flatMap((candidate) => candidate.artifactDigests)
    .sort(compare);
  if (
    dependencyArtifactDigests.length >
    policy.policy.limits.maximumArtifactDependencies
  )
    fail("team execution step has excessive dependency artifacts");
  const dispatch = createTeamExecutionStepDispatchV1({
    commandDigest: command.commandDigest,
    executionId: execution.executionId,
    executionEpoch: execution.executionEpoch,
    teamId: execution.scope.teamId,
    teamEpoch: execution.proposal.teamEpoch,
    jointWorkContractDigest:
      execution.jointWorkContract.jointWorkContractDigest,
    positionId: position.positionId,
    positionDigest: position.positionDigest,
    positionStepSequence: position.stepSequence + 1,
    memberId: position.memberId,
    memberBindingDigest: position.memberBindingDigest,
    workItemId: position.workItemId,
    workItemRevision: position.workItemRevision,
    dependencyArtifactDigests,
    inputReferenceDigest: command.inputReferenceDigest,
    preparedAtLogicalMs: command.logicalTimeMs,
    validUntilLogicalMs: command.validUntilLogicalMs,
  });
  const nextPositions = execution.positions.map((candidate) =>
    candidate.positionId === position.positionId
      ? createTeamExecutionPositionStateV1({
          ...candidate,
          status: "running",
          stepSequence: dispatch.positionStepSequence,
          latestDispatchDigest: dispatch.dispatchDigest,
          startedAtLogicalMs:
            candidate.startedAtLogicalMs ?? command.logicalTimeMs,
        })
      : candidate,
  );
  const nextExecution = createTeamExecutionRecordV1(
    {
      ...execution,
      positions: nextPositions,
      steps: [
        ...execution.steps,
        createTeamExecutionStepRecordV1({ dispatch, result: null }),
      ],
      metrics: createTeamExecutionMetricsV1({
        ...execution.metrics,
        totalStepAttempts: safeAdd(
          execution.metrics.totalStepAttempts,
          1,
          "team execution step attempts",
        ),
      }),
      updatedAtLogicalMs: command.logicalTimeMs,
    },
    { policy },
  );
  return freeze({
    state: successorState(state, policy, nextExecution, command.logicalTimeMs),
    dispatch,
  });
}

export function settleTeamExecutionStepV1(input: {
  readonly state: TeamExecutionStateV1;
  readonly policy: TeamExecutionPolicyRecordV1;
  readonly executor: Pick<
    TeamMemberExecutionPortV1,
    "executorId" | "executorVersion" | "implementationId"
  >;
  readonly result: TeamExecutionStepResultV1;
}): {
  readonly state: TeamExecutionStateV1;
  readonly execution: TeamExecutionRecordV1;
} {
  const policy = validateTeamExecutionPolicyV1(input.policy);
  const state = validateTeamExecutionStateV1(input.state, { policy });
  const result = validateTeamExecutionStepResultV1(input.result);
  const execution = state.execution;
  if (!execution) fail("team execution is unavailable");
  const record = execution.steps.find(
    (step) => step.dispatch.dispatchDigest === result.dispatchDigest,
  );
  if (!record) fail("team execution step result has no prepared dispatch");
  if (record.result) {
    if (record.result.resultDigest !== result.resultDigest)
      fail("team execution step result conflicts with retained result");
    return freeze({ state, execution });
  }
  if (execution.status !== "active") fail("active team execution is required");
  if (
    result.executorId !== input.executor.executorId ||
    result.executorVersion !== input.executor.executorVersion ||
    result.executorImplementationId !== input.executor.implementationId
  )
    fail("team execution step result executor binding changed");
  if (
    result.completedAtLogicalMs < state.logicalTimeHighWaterMs ||
    (result.completedAtLogicalMs >= record.dispatch.validUntilLogicalMs &&
      (result.status === "progress" ||
        result.status === "completed" ||
        result.status === "paused")) ||
    result.completedAtLogicalMs > execution.validUntilLogicalMs ||
    result.artifacts.length > policy.policy.limits.maximumArtifactsPerStep ||
    result.peerMessageDigests.length >
      policy.policy.limits.maximumPeerMessagesPerStep ||
    (policy.policy.requireAllowedControlForProgress &&
      (result.status === "progress" || result.status === "completed") &&
      result.control.disposition !== "allow")
  )
    fail("team execution step result violates local policy");
  const nextMessageTotal = safeAdd(
    execution.metrics.totalPeerMessages,
    result.peerMessageDigests.length,
    "team execution peer messages",
  );
  if (nextMessageTotal > policy.policy.limits.maximumTotalPeerMessages)
    fail("team execution peer message budget exhausted");
  const dispatch = record.dispatch;
  const position = execution.positions.find(
    (value) => value.positionId === dispatch.positionId,
  )!;
  const nextArtifacts = [...execution.artifacts, ...result.artifacts];
  const positionArtifacts = [
    ...position.artifactDigests,
    ...result.artifacts.map((artifact) => artifact.artifactDigest),
  ].sort(compare);
  if (
    positionArtifacts.length > policy.policy.limits.maximumArtifactsPerPosition
  )
    fail("team execution position artifact limit exceeded");
  if (
    policy.policy.requireReferencedCompletionArtifact &&
    result.status === "completed" &&
    positionArtifacts.length === 0
  )
    fail("team execution completion requires a referenced artifact");
  const nextPosition = createTeamExecutionPositionStateV1({
    ...position,
    status: positionStatusForResult(result.status),
    latestResultDigest: result.resultDigest,
    failureResultDigest:
      result.status === "failed" || result.status === "unsafe"
        ? result.resultDigest
        : null,
    artifactDigests: positionArtifacts,
    completedAtLogicalMs:
      result.status === "completed" ? result.completedAtLogicalMs : null,
  });
  let nextPositions = execution.positions.map((candidate) =>
    candidate.positionId === nextPosition.positionId ? nextPosition : candidate,
  );
  if (result.status === "completed")
    nextPositions = deriveReadiness(nextPositions);
  const failure = result.status === "failed" || result.status === "unsafe";
  const recoverySignal = failure
    ? createTeamExecutionRecoverySignalV1({ dispatch, result })
    : null;
  const allCompleted = nextPositions.every(
    (candidate) => candidate.status === "completed",
  );
  const nextExecution = createTeamExecutionRecordV1(
    {
      ...execution,
      status: failure
        ? "recovery_required"
        : allCompleted
          ? "completed"
          : "active",
      terminalReasonCode: failure
        ? result.reasonCode
        : allCompleted
          ? "all_positions_completed"
          : null,
      positions: nextPositions,
      artifacts: nextArtifacts,
      steps: execution.steps.map((step) =>
        step.dispatch.dispatchDigest === dispatch.dispatchDigest
          ? createTeamExecutionStepRecordV1({ dispatch, result })
          : step,
      ),
      recoverySignal,
      metrics: createTeamExecutionMetricsV1({
        ...execution.metrics,
        totalPeerMessages: nextMessageTotal,
        completedPositions: nextPositions.filter(
          (candidate) => candidate.status === "completed",
        ).length,
      }),
      updatedAtLogicalMs: result.completedAtLogicalMs,
    },
    { policy },
  );
  return freeze({
    state: successorState(
      state,
      policy,
      nextExecution,
      result.completedAtLogicalMs,
    ),
    execution: nextExecution,
  });
}

export function expireTeamExecutionStepV1(input: {
  readonly state: TeamExecutionStateV1;
  readonly policy: TeamExecutionPolicyRecordV1;
  readonly executor: Pick<
    TeamMemberExecutionPortV1,
    "executorId" | "executorVersion" | "implementationId"
  >;
  readonly dispatchDigest: PlanningDigestV1;
  readonly logicalTimeMs: number;
}): {
  readonly state: TeamExecutionStateV1;
  readonly execution: TeamExecutionRecordV1;
} {
  const policy = validateTeamExecutionPolicyV1(input.policy);
  const state = validateTeamExecutionStateV1(input.state, { policy });
  const execution = state.execution;
  if (!execution) fail("team execution is unavailable");
  const record = execution.steps.find(
    (step) => step.dispatch.dispatchDigest === input.dispatchDigest,
  );
  if (!record) fail("team execution dispatch is unavailable for expiry");
  if (record.result) return freeze({ state, execution });
  if (execution.status !== "active") fail("active team execution is required");
  if (
    !Number.isSafeInteger(input.logicalTimeMs) ||
    input.logicalTimeMs < record.dispatch.validUntilLogicalMs ||
    input.logicalTimeMs < state.logicalTimeHighWaterMs
  )
    fail("team execution dispatch has not expired");
  const control = createTeamExecutionControlEvidenceV1({
    schemaVersion: 1,
    controlId: "team-execution.deadline",
    controlVersion: 1,
    implementationId: "team-execution.deadline.v1",
    disposition: "abstain",
    reasonCode: "step_deadline_exceeded",
    sourceEvidenceDigest: record.dispatch.dispatchDigest,
    evaluatedAtLogicalMs: input.logicalTimeMs,
  });
  const result = createTeamExecutionStepResultV1({
    dispatch: record.dispatch,
    executorId: input.executor.executorId,
    executorVersion: input.executor.executorVersion,
    executorImplementationId: input.executor.implementationId,
    status: "failed",
    artifacts: freeze([]),
    peerMessageDigests: freeze([]),
    control,
    sourceStepRecordDigest: record.dispatch.dispatchDigest,
    reasonCode: "step_deadline_exceeded",
    completedAtLogicalMs: input.logicalTimeMs,
  });
  return settleTeamExecutionStepV1({
    state,
    policy,
    executor: input.executor,
    result,
  });
}

export function rebindTeamExecutionV1(input: {
  readonly state: TeamExecutionStateV1;
  readonly policy: TeamExecutionPolicyRecordV1;
  readonly request: TeamExecutionRebindRequestV1;
}): {
  readonly state: TeamExecutionStateV1;
  readonly execution: TeamExecutionRecordV1;
} {
  const policy = validateTeamExecutionPolicyV1(input.policy);
  const state = validateTeamExecutionStateV1(input.state, { policy });
  const request = validateTeamExecutionRebindRequestV1(input.request);
  const execution = state.execution;
  const replayedHistory = execution?.history.find(
    (entry) =>
      entry.terminalStateDigest === request.expectedStateDigest &&
      entry.recoverySignalDigest === request.recoverySignalDigest,
  );
  if (
    execution?.status === "active" &&
    replayedHistory &&
    execution.proposal.proposalDigest === request.proposal.proposalDigest &&
    execution.jointWorkContract.jointWorkContractDigest ===
      request.jointWorkContract.jointWorkContractDigest
  )
    return freeze({ state, execution });
  if (
    !execution ||
    execution.status !== "recovery_required" ||
    !execution.recoverySignal
  )
    fail("team execution recovery state is required");
  if (
    request.expectedStateDigest !== state.stateDigest ||
    request.recoverySignalDigest !== execution.recoverySignal.signalDigest
  )
    fail("team execution rebind predecessor is invalid");
  if (request.logicalTimeMs < state.logicalTimeHighWaterMs)
    fail("team execution rebind logical time rolled back");
  if (
    request.proposal.teamId !== execution.scope.teamId ||
    request.proposal.teamEpoch !== execution.proposal.teamEpoch + 1 ||
    request.proposal.predecessorJointWorkContractDigest !==
      execution.jointWorkContract.jointWorkContractDigest ||
    execution.metrics.recoveryCount >= policy.policy.limits.maximumRecoveryCount
  )
    fail("team execution rebind epoch is invalid");
  const oldPositions = new Map(
    execution.proposal.positions.map((position) => [
      position.positionId,
      position,
    ]),
  );
  if (
    request.proposal.positions.length !== execution.proposal.positions.length ||
    request.proposal.positions.some((position) => {
      const old = oldPositions.get(position.positionId);
      return !old || old.positionDigest !== position.positionDigest;
    })
  )
    fail("team execution rebind changed the position graph");
  const oldMembers = new Map(
    execution.proposal.members.map((member) => [member.positionId, member]),
  );
  for (const member of request.proposal.members) {
    const old = oldMembers.get(member.positionId)!;
    const failed =
      member.positionId === execution.recoverySignal.failedPositionId;
    const sameCandidate =
      member.candidateId === old.candidateId ||
      (member.peerId === old.peerId && member.instanceId === old.instanceId);
    if ((failed && sameCandidate) || (!failed && !sameCandidate))
      fail("team execution rebind member continuity is invalid");
  }
  const invalidated = downstreamClosure(
    execution.recoverySignal.failedPositionId,
    execution.proposal.positions,
  );
  const retainedPositionIds = new Set(
    execution.positions
      .filter(
        (position) =>
          position.status === "completed" &&
          !invalidated.has(position.positionId),
      )
      .map((position) => position.positionId),
  );
  const retainedArtifacts = retainClosedArtifacts(
    execution.artifacts.filter((artifact) =>
      retainedPositionIds.has(artifact.producerPositionId),
    ),
  );
  const retainedArtifactDigests = new Set(
    retainedArtifacts.map((artifact) => artifact.artifactDigest),
  );
  const oldRuntimePositions = new Map(
    execution.positions.map((position) => [position.positionId, position]),
  );
  const bindings = new Map(
    request.jointWorkContract.memberContracts.map((binding) => [
      binding.positionId,
      binding,
    ]),
  );
  let nextPositions = request.proposal.positions.map((position) => {
    const binding = bindings.get(position.positionId)!;
    const old = oldRuntimePositions.get(position.positionId)!;
    const retained = retainedPositionIds.has(position.positionId);
    return createTeamExecutionPositionStateV1({
      schemaVersion: 1,
      positionId: position.positionId,
      positionDigest: position.positionDigest,
      memberId: binding.memberId,
      memberBindingDigest: binding.bindingDigest,
      workItemId: position.workItemId,
      workItemRevision: position.workItemRevision,
      dependsOnPositionIds: position.dependsOnPositionIds,
      status: retained ? "completed" : "blocked",
      stepSequence: retained ? old.stepSequence : 0,
      latestDispatchDigest: retained ? old.latestDispatchDigest : null,
      latestResultDigest: retained ? old.latestResultDigest : null,
      failureResultDigest: null,
      artifactDigests: retained
        ? old.artifactDigests.filter((artifactDigest) =>
            retainedArtifactDigests.has(artifactDigest),
          )
        : freeze([]),
      startedAtLogicalMs: retained ? old.startedAtLogicalMs : null,
      completedAtLogicalMs: retained ? old.completedAtLogicalMs : null,
    });
  });
  nextPositions = deriveReadiness(nextPositions);
  const latency =
    request.logicalTimeMs - execution.recoverySignal.observedAtLogicalMs;
  const historyEntry = createTeamExecutionEpochHistoryEntryV1({
    schemaVersion: 1,
    executionEpoch: execution.executionEpoch,
    teamEpoch: execution.proposal.teamEpoch,
    jointWorkContractDigest:
      execution.jointWorkContract.jointWorkContractDigest,
    terminalStateDigest: state.stateDigest,
    recoverySignalDigest: execution.recoverySignal.signalDigest,
    completedPositionIds: execution.positions
      .filter((position) => position.status === "completed")
      .map((position) => position.positionId),
    totalStepAttempts: execution.metrics.totalStepAttempts,
    totalPeerMessages: execution.metrics.totalPeerMessages,
    closedAtLogicalMs: request.logicalTimeMs,
  });
  const validUntilLogicalMs = Math.min(
    request.jointWorkContract.validUntilLogicalMs,
    execution.startedAtLogicalMs +
      policy.policy.limits.maximumExecutionDurationMs,
  );
  if (validUntilLogicalMs <= request.logicalTimeMs)
    fail("team execution rebind has no remaining execution window");
  const nextExecution = createTeamExecutionRecordV1(
    {
      ...execution,
      executionEpoch: request.proposal.teamEpoch,
      status: "active",
      terminalReasonCode: null,
      proposal: request.proposal,
      jointWorkContract: request.jointWorkContract,
      positions: nextPositions,
      artifacts: retainedArtifacts,
      steps: freeze([]),
      recoverySignal: null,
      metrics: createTeamExecutionMetricsV1({
        ...execution.metrics,
        completedPositions: nextPositions.filter(
          (position) => position.status === "completed",
        ).length,
        recoveryCount: execution.metrics.recoveryCount + 1,
        lastRecoveryLatencyLogicalMs: latency,
        maximumRecoveryLatencyLogicalMs: Math.max(
          latency,
          execution.metrics.maximumRecoveryLatencyLogicalMs ?? 0,
        ),
      }),
      history: [...execution.history, historyEntry].slice(
        -policy.policy.limits.maximumHistoryEntries,
      ),
      validUntilLogicalMs,
      updatedAtLogicalMs: request.logicalTimeMs,
    },
    { policy },
  );
  return freeze({
    state: successorState(state, policy, nextExecution, request.logicalTimeMs),
    execution: nextExecution,
  });
}

export function cancelTeamExecutionV1(input: {
  readonly state: TeamExecutionStateV1;
  readonly policy: TeamExecutionPolicyRecordV1;
  readonly reasonCode: string;
  readonly logicalTimeMs: number;
}): {
  readonly state: TeamExecutionStateV1;
  readonly execution: TeamExecutionRecordV1;
} {
  const policy = validateTeamExecutionPolicyV1(input.policy);
  const state = validateTeamExecutionStateV1(input.state, { policy });
  const execution = state.execution;
  if (!execution) fail("team execution is unavailable for cancellation");
  if (
    !Number.isSafeInteger(input.logicalTimeMs) ||
    input.logicalTimeMs < state.logicalTimeHighWaterMs ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u.test(input.reasonCode)
  )
    fail("team execution cancellation input is invalid");
  if (execution.status === "cancelled") {
    if (execution.terminalReasonCode !== input.reasonCode)
      fail("team execution cancellation conflicts with retained reason");
    return freeze({ state, execution });
  }
  if (execution.status === "completed")
    fail("completed team execution cannot be cancelled");
  const settledSteps = execution.steps.filter((step) => step.result !== null);
  const settledByPosition = new Map<string, typeof settledSteps>();
  for (const step of settledSteps) {
    const list = settledByPosition.get(step.dispatch.positionId) ?? [];
    settledByPosition.set(step.dispatch.positionId, [...list, step]);
  }
  const positions = execution.positions.map((position) => {
    if (position.status === "completed") return position;
    const settled = settledByPosition.get(position.positionId) ?? [];
    const latest = settled.at(-1);
    return createTeamExecutionPositionStateV1({
      ...position,
      status: "cancelled",
      stepSequence: settled.length,
      latestDispatchDigest: latest?.dispatch.dispatchDigest ?? null,
      latestResultDigest: latest?.result?.resultDigest ?? null,
      failureResultDigest: null,
      completedAtLogicalMs: null,
    });
  });
  const nextExecution = createTeamExecutionRecordV1(
    {
      ...execution,
      status: "cancelled",
      terminalReasonCode: input.reasonCode,
      positions,
      steps: settledSteps,
      recoverySignal: null,
      metrics: createTeamExecutionMetricsV1({
        ...execution.metrics,
        completedPositions: positions.filter(
          (position) => position.status === "completed",
        ).length,
      }),
      updatedAtLogicalMs: input.logicalTimeMs,
    },
    { policy },
  );
  return freeze({
    state: successorState(state, policy, nextExecution, input.logicalTimeMs),
    execution: nextExecution,
  });
}

function successorState(
  state: TeamExecutionStateV1,
  policy: TeamExecutionPolicyRecordV1,
  execution: TeamExecutionRecordV1,
  logicalTimeMs: number,
): TeamExecutionStateV1 {
  return createTeamExecutionStateV1({
    stateKey: state.stateKey,
    runtimeId: state.runtimeId,
    runtimeVersion: state.runtimeVersion,
    implementationId: state.implementationId,
    policy,
    revision: state.revision + 1,
    logicalTimeHighWaterMs: Math.max(
      state.logicalTimeHighWaterMs,
      logicalTimeMs,
    ),
    execution,
    predecessorStateDigest: state.stateDigest,
  });
}

function requiredActiveExecution(
  state: TeamExecutionStateV1,
): TeamExecutionRecordV1 {
  if (!state.execution || state.execution.status !== "active")
    fail("active team execution is required");
  return state.execution;
}

function positionStatusForResult(
  status: TeamExecutionStepResultV1["status"],
): TeamExecutionPositionStateV1["status"] {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "unsafe":
      return "unsafe";
    case "progress":
    case "paused":
      return "ready";
  }
}

function deriveReadiness(
  positions: readonly TeamExecutionPositionStateV1[],
): TeamExecutionPositionStateV1[] {
  const byId = new Map(
    positions.map((position) => [position.positionId, position]),
  );
  return positions.map((position) => {
    if (position.status !== "blocked") return position;
    const ready = position.dependsOnPositionIds.every(
      (positionId) => byId.get(positionId)?.status === "completed",
    );
    return ready
      ? createTeamExecutionPositionStateV1({ ...position, status: "ready" })
      : position;
  });
}

function downstreamClosure(
  failedPositionId: string,
  positions: readonly {
    readonly positionId: string;
    readonly dependsOnPositionIds: readonly string[];
  }[],
): Set<string> {
  const invalidated = new Set([failedPositionId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const position of positions) {
      if (
        !invalidated.has(position.positionId) &&
        position.dependsOnPositionIds.some((dependency) =>
          invalidated.has(dependency),
        )
      ) {
        invalidated.add(position.positionId);
        changed = true;
      }
    }
  }
  return invalidated;
}

function retainClosedArtifacts(
  input: readonly TeamExecutionArtifactV1[],
): readonly TeamExecutionArtifactV1[] {
  let retained = [...input];
  let changed = true;
  while (changed) {
    changed = false;
    const digests = new Set(
      retained.map((artifact) => artifact.artifactDigest),
    );
    const next = retained.filter((artifact) =>
      artifact.dependencyArtifactDigests.every((dependency) =>
        digests.has(dependency),
      ),
    );
    if (next.length !== retained.length) {
      retained = next;
      changed = true;
    }
  }
  return freeze(
    retained.sort((left, right) =>
      compare(left.artifactDigest, right.artifactDigest),
    ),
  );
}

function safeAdd(left: number, right: number, label: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) fail(`${label} exceeds safe integer range`);
  return value;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function fail(message: string): never {
  throw new TypeError(message);
}
