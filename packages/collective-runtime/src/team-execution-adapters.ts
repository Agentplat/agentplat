import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import type { AgentPlatID } from "@agentplat/core";
import type {
  PortableAgentSessionRuntimePortV1,
  PortableAgentSessionSnapshotV1,
  PortableAgentStepOutcomeV1,
  PortableAgentStepRequestV1,
} from "@agentplat/runtime/adapter";
import { normalizeStepRequestV1 } from "@agentplat/runtime/adapter";

import type {
  TeamExecutionArtifactDraftV1,
  TeamExecutionArtifactV1,
  TeamExecutionControlDispositionV1,
  TeamExecutionPolicyRecordV1,
  TeamExecutionRebindRequestV1,
  TeamExecutionReconfigurationInputV1,
  TeamExecutionStateV1,
  TeamExecutionStepDispatchV1,
  TeamExecutionStepStatusV1,
  TeamMemberExecutionPortV1,
} from "./team-execution-contracts.js";
import {
  createTeamExecutionArtifactV1,
  createTeamExecutionControlEvidenceV1,
  createTeamExecutionRebindRequestV1,
  createTeamExecutionStepResultV1,
  validateTeamExecutionArtifactDraftV1,
  validateTeamExecutionRecoverySignalV1,
  validateTeamExecutionStateV1,
  validateTeamExecutionStepDispatchV1,
} from "./team-execution-validation.js";
import type {
  JointWorkContractV1,
  TeamMemberOutcomeV1,
  TeamProposalV1,
  TeamReconfigurationRequestV1,
} from "./team-formation-contracts.js";
import {
  createTeamReconfigurationRequestV1,
  createTeamMemberOutcomeV1,
  validateJointWorkContractV1,
  validateTeamProposalV1,
} from "./team-formation-validation.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

export interface PortableAgentTeamMemberBindingV1 {
  readonly sessionId: AgentPlatID;
  readonly tenantId: AgentPlatID;
  readonly objectiveId: AgentPlatID;
  readonly agentId: AgentPlatID;
  readonly memberId: AgentPlatID;
}

export interface PortableAgentTeamMemberExecutionOptionsV1 {
  readonly executorId: AgentPlatID;
  readonly executorVersion: number;
  readonly implementationId: AgentPlatID;
  readonly sessionRuntime: PortableAgentSessionRuntimePortV1;
  readonly resolveBinding: (
    dispatch: TeamExecutionStepDispatchV1,
  ) => PortableAgentTeamMemberBindingV1;
  readonly mapStepRequest: (input: {
    readonly dispatch: TeamExecutionStepDispatchV1;
    readonly dependencyArtifacts: readonly TeamExecutionArtifactV1[];
    readonly session: PortableAgentSessionSnapshotV1;
  }) => PortableAgentStepRequestV1;
  /** Converts provider output to durable references; raw output is never retained. */
  readonly collectArtifacts: (input: {
    readonly dispatch: TeamExecutionStepDispatchV1;
    readonly dependencyArtifacts: readonly TeamExecutionArtifactV1[];
    readonly outcome: PortableAgentStepOutcomeV1;
  }) => readonly TeamExecutionArtifactDraftV1[];
  readonly collectPeerMessageDigests?: (input: {
    readonly dispatch: TeamExecutionStepDispatchV1;
    readonly outcome: PortableAgentStepOutcomeV1;
  }) => readonly PlanningDigestV1[];
  readonly logicalClock: () => number;
}

/**
 * Adapts the controlled portable-agent step boundary to one team position.
 * The portable runtime remains responsible for provider execution and its
 * pre-step, post-output and pre-action controls.
 */
export function createPortableAgentTeamMemberExecutionPortV1(
  options: PortableAgentTeamMemberExecutionOptionsV1,
): TeamMemberExecutionPortV1 {
  const executorId = identifier(options.executorId, "executor.executorId");
  const executorVersion = positive(
    options.executorVersion,
    "executor.executorVersion",
  );
  const implementationId = identifier(
    options.implementationId,
    "executor.implementationId",
  );
  if (
    !options.sessionRuntime ||
    typeof options.sessionRuntime.getSession !== "function" ||
    typeof options.sessionRuntime.step !== "function" ||
    typeof options.resolveBinding !== "function" ||
    typeof options.mapStepRequest !== "function" ||
    typeof options.collectArtifacts !== "function" ||
    typeof options.logicalClock !== "function" ||
    (options.collectPeerMessageDigests !== undefined &&
      typeof options.collectPeerMessageDigests !== "function")
  )
    fail("portable team member execution options are invalid");

  return Object.freeze({
    executorId,
    executorVersion,
    implementationId,
    async execute(input: {
      readonly dispatch: TeamExecutionStepDispatchV1;
      readonly dependencyArtifacts: readonly TeamExecutionArtifactV1[];
      readonly signal?: AbortSignal;
    }) {
      const dispatch = validateTeamExecutionStepDispatchV1(input.dispatch);
      const binding = validatePortableBindingV1(
        options.resolveBinding(dispatch),
      );
      if (binding.memberId !== dispatch.memberId)
        fail("portable session binding is outside the selected team member");
      const session = await options.sessionRuntime.getSession(
        binding.sessionId,
      );
      if (!session) fail("portable team member session is unavailable");
      assertPortableSessionBinding(session, binding, dispatch);

      const existing = session.stepRecords.find(
        (record) => record.stepId === dispatch.dispatchId,
      );
      const outcome = existing
        ? Object.freeze({ session, record: existing })
        : await executePortableStepV1({
            options,
            binding,
            dispatch,
            dependencyArtifacts: input.dependencyArtifacts,
            session,
            signal: input.signal,
          });
      assertPortableSessionBinding(outcome.session, binding, dispatch);
      if (
        outcome.record.stepId !== dispatch.dispatchId ||
        outcome.record.stepId !== outcome.record.request.stepId ||
        outcome.record.request.logicalTimeMs !== dispatch.preparedAtLogicalMs ||
        outcome.record.result.sessionId !== binding.sessionId ||
        outcome.record.result.stepId !== outcome.record.stepId ||
        outcome.record.result.status !== outcome.record.status ||
        !outcome.session.stepRecords.some(
          (record) =>
            record.stepId === outcome.record.stepId &&
            record.stepSequence === outcome.record.stepSequence,
        )
      )
        fail("portable step record binding is invalid");

      const completedAtLogicalMs = nonNegative(
        options.logicalClock(),
        "executor.logicalClock",
      );
      if (
        completedAtLogicalMs < dispatch.preparedAtLogicalMs ||
        completedAtLogicalMs >= dispatch.validUntilLogicalMs
      )
        fail("portable step completion is outside the dispatch window");
      const sourceStepRecordDigest = digestPlanningJsonV1(
        "team-execution-source-step-record",
        outcome.record as unknown as PlanningJson,
      );
      const classification = classifyPortableOutcome(outcome);
      const control = createTeamExecutionControlEvidenceV1({
        schemaVersion: 1,
        controlId: outcome.session.controlBinding.controlId,
        controlVersion: outcome.session.controlBinding.controlVersion,
        implementationId: outcome.session.controlBinding.implementationId,
        disposition: classification.disposition,
        reasonCode: classification.controlReasonCode,
        sourceEvidenceDigest: sourceStepRecordDigest,
        evaluatedAtLogicalMs: completedAtLogicalMs,
      });
      const artifacts = options
        .collectArtifacts({
          dispatch,
          dependencyArtifacts: input.dependencyArtifacts,
          outcome,
        })
        .map(validateTeamExecutionArtifactDraftV1)
        .map((draft) =>
          createTeamExecutionArtifactV1({
            dispatch,
            draft,
            producedAtLogicalMs: completedAtLogicalMs,
          }),
        );
      const peerMessageDigests = (
        options.collectPeerMessageDigests?.({ dispatch, outcome }) ?? []
      ).map((value) => digest(value, "executor.peerMessageDigest"));
      return createTeamExecutionStepResultV1({
        dispatch,
        executorId,
        executorVersion,
        executorImplementationId: implementationId,
        status: classification.status,
        artifacts,
        peerMessageDigests,
        control,
        sourceStepRecordDigest,
        reasonCode: classification.resultReasonCode,
        completedAtLogicalMs,
      });
    },
  });
}

async function executePortableStepV1(input: {
  readonly options: PortableAgentTeamMemberExecutionOptionsV1;
  readonly binding: PortableAgentTeamMemberBindingV1;
  readonly dispatch: TeamExecutionStepDispatchV1;
  readonly dependencyArtifacts: readonly TeamExecutionArtifactV1[];
  readonly session: PortableAgentSessionSnapshotV1;
  readonly signal?: AbortSignal;
}): Promise<PortableAgentStepOutcomeV1> {
  const request = normalizeStepRequestV1(
    input.options.mapStepRequest({
      dispatch: input.dispatch,
      dependencyArtifacts: input.dependencyArtifacts,
      session: input.session,
    }),
    input.session.manifest,
  );
  if (
    request.stepId !== input.dispatch.dispatchId ||
    request.expectedSessionRevision !== input.session.revision ||
    request.logicalTimeMs !== input.dispatch.preparedAtLogicalMs
  )
    fail("portable step request is outside the team dispatch");
  return input.options.sessionRuntime.step(input.binding.sessionId, request, {
    signal: input.signal,
  });
}

/** Records the execution failure on the exact active formation epoch. */
export function createTeamMemberOutcomeFromExecutionRecoveryV1(
  recoverySignal: TeamExecutionReconfigurationInputV1["recoverySignal"],
): TeamMemberOutcomeV1 {
  const signal = validateTeamExecutionRecoverySignalV1(recoverySignal);
  return createTeamMemberOutcomeV1({
    schemaVersion: 1,
    teamId: signal.teamId,
    teamEpoch: signal.teamEpoch,
    jointWorkContractDigest: signal.jointWorkContractDigest,
    memberId: signal.failedMemberId,
    memberBindingDigest: signal.failedMemberBindingDigest,
    status: signal.failureStatus === "unsafe" ? "unsafe" : "failure",
    sourceResultDigest: signal.failureResultDigest,
    observedAtLogicalMs: signal.observedAtLogicalMs,
  });
}

/** Projects an exact execution failure into the existing formation runtime. */
export function createTeamReconfigurationRequestFromExecutionV1(
  input: TeamExecutionReconfigurationInputV1,
): TeamReconfigurationRequestV1 {
  const signal = validateTeamExecutionRecoverySignalV1(input.recoverySignal);
  if (
    signal.jointWorkContractDigest !==
      digest(
        input.currentJointWorkContractDigest,
        "reconfiguration.currentJointWorkContractDigest",
      ) ||
    input.logicalTimeMs < signal.observedAtLogicalMs
  )
    fail("execution recovery signal is outside reconfiguration input");
  return createTeamReconfigurationRequestV1({
    schemaVersion: 1,
    requestId: `team-reconfiguration.${signal.signalDigest.slice(7)}`,
    currentJointWorkContractDigest: signal.jointWorkContractDigest,
    failedMemberId: signal.failedMemberId,
    reasonCode: signal.reasonCode,
    membershipEpoch: input.membershipEpoch,
    membershipConfigurationDigest: input.membershipConfigurationDigest,
    replacementBids: input.replacementBids,
    logicalTimeMs: input.logicalTimeMs,
    validUntilLogicalMs: input.validUntilLogicalMs,
  });
}

/** Binds an activated replacement contract back to the failed execution. */
export function createTeamExecutionRebindRequestFromStateV1(input: {
  readonly requestId: AgentPlatID;
  readonly state: TeamExecutionStateV1;
  readonly policy: TeamExecutionPolicyRecordV1;
  readonly proposal: TeamProposalV1;
  readonly jointWorkContract: JointWorkContractV1;
  readonly logicalTimeMs: number;
}): TeamExecutionRebindRequestV1 {
  const state = validateTeamExecutionStateV1(input.state, {
    policy: input.policy,
  });
  const proposal = validateTeamProposalV1(input.proposal);
  const jointWorkContract = validateJointWorkContractV1(
    input.jointWorkContract,
  );
  if (!state.execution?.recoverySignal)
    fail("team execution has no recovery signal to rebind");
  return createTeamExecutionRebindRequestV1({
    schemaVersion: 1,
    requestId: input.requestId,
    expectedStateDigest: state.stateDigest,
    recoverySignalDigest: state.execution.recoverySignal.signalDigest,
    proposal,
    jointWorkContract,
    logicalTimeMs: input.logicalTimeMs,
  });
}

function classifyPortableOutcome(outcome: PortableAgentStepOutcomeV1): {
  readonly status: TeamExecutionStepStatusV1;
  readonly disposition: TeamExecutionControlDispositionV1;
  readonly resultReasonCode: string;
  readonly controlReasonCode: string;
} {
  const reason = outcome.record.result.reasonCode;
  switch (outcome.record.status) {
    case "completed":
      return {
        status: "completed",
        disposition: "allow",
        resultReasonCode: reason ?? "portable_step_completed",
        controlReasonCode: "portable_controls_allowed",
      };
    case "refused":
      return {
        status: "unsafe",
        disposition: "deny",
        resultReasonCode: reason ?? "portable_step_refused",
        controlReasonCode: reason ?? "portable_control_denied",
      };
    case "paused":
      return {
        status: "paused",
        disposition: "escalate",
        resultReasonCode: reason ?? "portable_step_paused",
        controlReasonCode: reason ?? "portable_control_escalated",
      };
    case "failed":
      return {
        status: "failed",
        disposition: "abstain",
        resultReasonCode: reason ?? "portable_step_failed",
        controlReasonCode: "portable_control_unavailable",
      };
  }
}

function validatePortableBindingV1(
  input: PortableAgentTeamMemberBindingV1,
): PortableAgentTeamMemberBindingV1 {
  if (!input || typeof input !== "object")
    fail("portable team member binding is required");
  return Object.freeze({
    sessionId: identifier(input.sessionId, "binding.sessionId"),
    tenantId: identifier(input.tenantId, "binding.tenantId"),
    objectiveId: identifier(input.objectiveId, "binding.objectiveId"),
    agentId: identifier(input.agentId, "binding.agentId"),
    memberId: identifier(input.memberId, "binding.memberId"),
  });
}

function assertPortableSessionBinding(
  session: PortableAgentSessionSnapshotV1,
  binding: PortableAgentTeamMemberBindingV1,
  dispatch: TeamExecutionStepDispatchV1,
): void {
  if (
    session.sessionId !== binding.sessionId ||
    session.tenantId !== binding.tenantId ||
    session.objectiveId !== binding.objectiveId ||
    session.agentId !== binding.agentId ||
    session.role.objectiveId !== binding.objectiveId ||
    session.status !== "active" ||
    session.role.validFromLogicalMs > dispatch.preparedAtLogicalMs ||
    session.role.validUntilLogicalMs <= dispatch.preparedAtLogicalMs
  )
    fail("portable session is not active for the team dispatch");
}

function identifier(input: unknown, label: string): AgentPlatID {
  if (typeof input !== "string" || !IDENTIFIER.test(input))
    fail(`${label} is invalid`);
  return input;
}

function digest(input: unknown, label: string): PlanningDigestV1 {
  if (typeof input !== "string" || !DIGEST.test(input))
    fail(`${label} is invalid`);
  return input as PlanningDigestV1;
}

function positive(input: unknown, label: string): number {
  if (!Number.isSafeInteger(input) || (input as number) < 1)
    fail(`${label} is invalid`);
  return input as number;
}

function nonNegative(input: unknown, label: string): number {
  if (!Number.isSafeInteger(input) || (input as number) < 0)
    fail(`${label} is invalid`);
  return input as number;
}

function fail(message: string): never {
  throw new TypeError(message);
}
