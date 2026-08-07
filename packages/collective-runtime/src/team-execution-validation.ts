import {
  digestPlanningJsonV1,
  type PlanningDigestDomainV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import type {
  TeamExecutionArtifactDraftV1,
  TeamExecutionArtifactV1,
  TeamExecutionControlDispositionV1,
  TeamExecutionControlEvidenceV1,
  TeamExecutionEpochHistoryEntryV1,
  TeamExecutionHandoffEnvelopeV1,
  TeamExecutionMetricsV1,
  TeamExecutionPolicyRecordV1,
  TeamExecutionPolicyV1,
  TeamExecutionPositionStateV1,
  TeamExecutionPositionStatusV1,
  TeamExecutionRebindRequestV1,
  TeamExecutionRecordV1,
  TeamExecutionRecoverySignalV1,
  TeamExecutionScopeV1,
  TeamExecutionStartRequestV1,
  TeamExecutionStateV1,
  TeamExecutionStatusV1,
  TeamExecutionStepCommandV1,
  TeamExecutionStepDispatchV1,
  TeamExecutionStepRecordV1,
  TeamExecutionStepResultV1,
  TeamExecutionStepStatusV1,
} from "./team-execution-contracts.js";
import {
  TEAM_EXECUTION_HANDOFF_FORMAT_V1,
  TEAM_EXECUTION_STATE_FORMAT_V1,
} from "./team-execution-contracts.js";
import type {
  JointWorkContractV1,
  TeamMemberContractBindingV1,
  TeamMemberSelectionV1,
  TeamPositionV1,
  TeamProposalV1,
} from "./team-formation-contracts.js";
import {
  validateJointWorkContractV1,
  validateTeamProposalV1,
} from "./team-formation-validation.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const MEDIA_TYPE =
  /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}$/u;
const CONTENT_REFERENCE =
  /^[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\u0000-\u0020]{1,2047}$/u;

export function createTeamExecutionPolicyV1(
  input: TeamExecutionPolicyV1,
): TeamExecutionPolicyRecordV1 {
  const policy = normalizePolicy(input);
  return freeze({
    schemaVersion: 1,
    policy,
    policyDigest: digest("team-execution-policy", policy),
  });
}

export function validateTeamExecutionPolicyV1(
  input: unknown,
): TeamExecutionPolicyRecordV1 {
  const value = exact(
    input,
    ["policy", "policyDigest", "schemaVersion"],
    "team execution policy record",
  );
  schema(value.schemaVersion, "team execution policy record");
  const result = createTeamExecutionPolicyV1(
    value.policy as TeamExecutionPolicyV1,
  );
  if (value.policyDigest !== result.policyDigest)
    fail("team execution policy digest is invalid");
  return result;
}

export function createTeamExecutionScopeV1(input: {
  readonly proposal: TeamProposalV1;
}): TeamExecutionScopeV1 {
  const proposal = validateTeamProposalV1(input.proposal);
  const body = freeze({
    tenantId: proposal.scope.tenantId,
    meshId: proposal.scope.meshId,
    policyDomainId: proposal.scope.policyDomainId,
    missionIntentId: proposal.scope.missionIntentId,
    objectiveId: proposal.scope.objectiveId,
    rootWorkItemId: proposal.scope.rootWorkItemId,
    rootWorkItemRevision: proposal.scope.rootWorkItemRevision,
    teamId: proposal.teamId,
  });
  return freeze({ ...body, scopeDigest: digest("team-execution-scope", body) });
}

export function validateTeamExecutionScopeV1(
  input: unknown,
): TeamExecutionScopeV1 {
  const value = exact(
    input,
    [
      "meshId",
      "missionIntentId",
      "objectiveId",
      "policyDomainId",
      "rootWorkItemId",
      "rootWorkItemRevision",
      "scopeDigest",
      "teamId",
      "tenantId",
    ],
    "team execution scope",
  );
  const body = freeze({
    tenantId: identifier(value.tenantId, "scope.tenantId"),
    meshId: identifier(value.meshId, "scope.meshId"),
    policyDomainId: identifier(value.policyDomainId, "scope.policyDomainId"),
    missionIntentId: identifier(value.missionIntentId, "scope.missionIntentId"),
    objectiveId: identifier(value.objectiveId, "scope.objectiveId"),
    rootWorkItemId: identifier(value.rootWorkItemId, "scope.rootWorkItemId"),
    rootWorkItemRevision: positive(
      value.rootWorkItemRevision,
      "scope.rootWorkItemRevision",
    ),
    teamId: identifier(value.teamId, "scope.teamId"),
  });
  const scopeDigest = digest("team-execution-scope", body);
  if (value.scopeDigest !== scopeDigest)
    fail("team execution scope digest is invalid");
  return freeze({ ...body, scopeDigest });
}

export function validateTeamExecutionArtifactDraftV1(
  input: unknown,
): TeamExecutionArtifactDraftV1 {
  const value = exact(
    input,
    [
      "artifactId",
      "artifactKind",
      "byteLength",
      "contentDigest",
      "contentReference",
      "mediaType",
      "schemaVersion",
    ],
    "team execution artifact draft",
  );
  schema(value.schemaVersion, "team execution artifact draft");
  return freeze({
    schemaVersion: 1,
    artifactId: identifier(value.artifactId, "artifactDraft.artifactId"),
    artifactKind: token(value.artifactKind, "artifactDraft.artifactKind"),
    mediaType: mediaType(value.mediaType, "artifactDraft.mediaType"),
    byteLength: positive(value.byteLength, "artifactDraft.byteLength"),
    contentReference: contentReference(
      value.contentReference,
      "artifactDraft.contentReference",
    ),
    contentDigest: sha(value.contentDigest, "artifactDraft.contentDigest"),
  });
}

export function createTeamExecutionArtifactV1(input: {
  readonly dispatch: TeamExecutionStepDispatchV1;
  readonly draft: TeamExecutionArtifactDraftV1;
  readonly producedAtLogicalMs: number;
}): TeamExecutionArtifactV1 {
  const dispatch = validateTeamExecutionStepDispatchV1(input.dispatch);
  const draft = validateTeamExecutionArtifactDraftV1(input.draft);
  const producedAtLogicalMs = nonNegative(
    input.producedAtLogicalMs,
    "artifact.producedAtLogicalMs",
  );
  if (
    producedAtLogicalMs < dispatch.preparedAtLogicalMs ||
    producedAtLogicalMs > dispatch.validUntilLogicalMs
  )
    fail("team execution artifact time is outside dispatch window");
  const body = freeze({
    schemaVersion: 1 as const,
    artifactId: draft.artifactId,
    executionId: dispatch.executionId,
    executionEpoch: dispatch.executionEpoch,
    teamId: dispatch.teamId,
    teamEpoch: dispatch.teamEpoch,
    producerPositionId: dispatch.positionId,
    producerMemberId: dispatch.memberId,
    producerBindingDigest: dispatch.memberBindingDigest,
    sourceDispatchDigest: dispatch.dispatchDigest,
    artifactKind: draft.artifactKind,
    mediaType: draft.mediaType,
    byteLength: draft.byteLength,
    contentReference: draft.contentReference,
    contentDigest: draft.contentDigest,
    dependencyArtifactDigests: dispatch.dependencyArtifactDigests,
    producedAtLogicalMs,
  });
  return freeze({
    ...body,
    artifactDigest: digest("team-execution-artifact", body),
  });
}

export function validateTeamExecutionArtifactV1(
  input: unknown,
): TeamExecutionArtifactV1 {
  const value = exact(
    input,
    [
      "artifactDigest",
      "artifactId",
      "artifactKind",
      "byteLength",
      "contentDigest",
      "contentReference",
      "dependencyArtifactDigests",
      "executionEpoch",
      "executionId",
      "mediaType",
      "producedAtLogicalMs",
      "producerBindingDigest",
      "producerMemberId",
      "producerPositionId",
      "schemaVersion",
      "sourceDispatchDigest",
      "teamEpoch",
      "teamId",
    ],
    "team execution artifact",
  );
  schema(value.schemaVersion, "team execution artifact");
  const body = freeze({
    schemaVersion: 1 as const,
    artifactId: identifier(value.artifactId, "artifact.artifactId"),
    executionId: identifier(value.executionId, "artifact.executionId"),
    executionEpoch: positive(value.executionEpoch, "artifact.executionEpoch"),
    teamId: identifier(value.teamId, "artifact.teamId"),
    teamEpoch: positive(value.teamEpoch, "artifact.teamEpoch"),
    producerPositionId: identifier(
      value.producerPositionId,
      "artifact.producerPositionId",
    ),
    producerMemberId: identifier(
      value.producerMemberId,
      "artifact.producerMemberId",
    ),
    producerBindingDigest: sha(
      value.producerBindingDigest,
      "artifact.producerBindingDigest",
    ),
    sourceDispatchDigest: sha(
      value.sourceDispatchDigest,
      "artifact.sourceDispatchDigest",
    ),
    artifactKind: token(value.artifactKind, "artifact.artifactKind"),
    mediaType: mediaType(value.mediaType, "artifact.mediaType"),
    byteLength: positive(value.byteLength, "artifact.byteLength"),
    contentReference: contentReference(
      value.contentReference,
      "artifact.contentReference",
    ),
    contentDigest: sha(value.contentDigest, "artifact.contentDigest"),
    dependencyArtifactDigests: digests(
      value.dependencyArtifactDigests,
      "artifact.dependencyArtifactDigests",
      4_096,
    ),
    producedAtLogicalMs: nonNegative(
      value.producedAtLogicalMs,
      "artifact.producedAtLogicalMs",
    ),
  });
  const artifactDigest = digest("team-execution-artifact", body);
  if (value.artifactDigest !== artifactDigest)
    fail("team execution artifact digest is invalid");
  return freeze({ ...body, artifactDigest });
}

export function createTeamExecutionStepCommandV1(
  input: Omit<TeamExecutionStepCommandV1, "commandDigest">,
): TeamExecutionStepCommandV1 {
  schema(input.schemaVersion, "team execution step command");
  const body = freeze({
    schemaVersion: 1 as const,
    commandId: identifier(input.commandId, "stepCommand.commandId"),
    executionId: identifier(input.executionId, "stepCommand.executionId"),
    executionEpoch: positive(
      input.executionEpoch,
      "stepCommand.executionEpoch",
    ),
    positionId: identifier(input.positionId, "stepCommand.positionId"),
    inputReferenceDigest: sha(
      input.inputReferenceDigest,
      "stepCommand.inputReferenceDigest",
    ),
    logicalTimeMs: nonNegative(
      input.logicalTimeMs,
      "stepCommand.logicalTimeMs",
    ),
    validUntilLogicalMs: positive(
      input.validUntilLogicalMs,
      "stepCommand.validUntilLogicalMs",
    ),
  });
  if (body.validUntilLogicalMs <= body.logicalTimeMs)
    fail("team execution step command window is invalid");
  return freeze({
    ...body,
    commandDigest: digest("team-execution-step-command", body),
  });
}

export function validateTeamExecutionStepCommandV1(
  input: unknown,
): TeamExecutionStepCommandV1 {
  const value = exact(
    input,
    [
      "commandDigest",
      "commandId",
      "executionEpoch",
      "executionId",
      "inputReferenceDigest",
      "logicalTimeMs",
      "positionId",
      "schemaVersion",
      "validUntilLogicalMs",
    ],
    "team execution step command",
  );
  const result = createTeamExecutionStepCommandV1({
    schemaVersion: value.schemaVersion as 1,
    commandId: value.commandId as string,
    executionId: value.executionId as string,
    executionEpoch: value.executionEpoch as number,
    positionId: value.positionId as string,
    inputReferenceDigest: value.inputReferenceDigest as PlanningDigestV1,
    logicalTimeMs: value.logicalTimeMs as number,
    validUntilLogicalMs: value.validUntilLogicalMs as number,
  });
  if (value.commandDigest !== result.commandDigest)
    fail("team execution step command digest is invalid");
  return result;
}

export function createTeamExecutionStepDispatchV1(
  input: Omit<
    TeamExecutionStepDispatchV1,
    "dispatchId" | "dispatchDigest" | "schemaVersion"
  >,
): TeamExecutionStepDispatchV1 {
  const body = freeze({
    schemaVersion: 1 as const,
    commandDigest: sha(input.commandDigest, "dispatch.commandDigest"),
    executionId: identifier(input.executionId, "dispatch.executionId"),
    executionEpoch: positive(input.executionEpoch, "dispatch.executionEpoch"),
    teamId: identifier(input.teamId, "dispatch.teamId"),
    teamEpoch: positive(input.teamEpoch, "dispatch.teamEpoch"),
    jointWorkContractDigest: sha(
      input.jointWorkContractDigest,
      "dispatch.jointWorkContractDigest",
    ),
    positionId: identifier(input.positionId, "dispatch.positionId"),
    positionDigest: sha(input.positionDigest, "dispatch.positionDigest"),
    positionStepSequence: positive(
      input.positionStepSequence,
      "dispatch.positionStepSequence",
    ),
    memberId: identifier(input.memberId, "dispatch.memberId"),
    memberBindingDigest: sha(
      input.memberBindingDigest,
      "dispatch.memberBindingDigest",
    ),
    workItemId: identifier(input.workItemId, "dispatch.workItemId"),
    workItemRevision: positive(
      input.workItemRevision,
      "dispatch.workItemRevision",
    ),
    dependencyArtifactDigests: digests(
      input.dependencyArtifactDigests,
      "dispatch.dependencyArtifactDigests",
      4_096,
    ),
    inputReferenceDigest: sha(
      input.inputReferenceDigest,
      "dispatch.inputReferenceDigest",
    ),
    preparedAtLogicalMs: nonNegative(
      input.preparedAtLogicalMs,
      "dispatch.preparedAtLogicalMs",
    ),
    validUntilLogicalMs: positive(
      input.validUntilLogicalMs,
      "dispatch.validUntilLogicalMs",
    ),
  });
  if (body.validUntilLogicalMs <= body.preparedAtLogicalMs)
    fail("team execution dispatch window is invalid");
  const dispatchDigest = digest("team-execution-step-dispatch", body);
  return freeze({
    ...body,
    dispatchId: `team-dispatch.${dispatchDigest.slice(7)}`,
    dispatchDigest,
  });
}

export function validateTeamExecutionStepDispatchV1(
  input: unknown,
): TeamExecutionStepDispatchV1 {
  const value = exact(
    input,
    [
      "commandDigest",
      "dependencyArtifactDigests",
      "dispatchDigest",
      "dispatchId",
      "executionEpoch",
      "executionId",
      "inputReferenceDigest",
      "jointWorkContractDigest",
      "memberBindingDigest",
      "memberId",
      "positionDigest",
      "positionId",
      "positionStepSequence",
      "preparedAtLogicalMs",
      "schemaVersion",
      "teamEpoch",
      "teamId",
      "validUntilLogicalMs",
      "workItemId",
      "workItemRevision",
    ],
    "team execution step dispatch",
  );
  schema(value.schemaVersion, "team execution step dispatch");
  const result = createTeamExecutionStepDispatchV1({
    commandDigest: value.commandDigest as PlanningDigestV1,
    executionId: value.executionId as string,
    executionEpoch: value.executionEpoch as number,
    teamId: value.teamId as string,
    teamEpoch: value.teamEpoch as number,
    jointWorkContractDigest: value.jointWorkContractDigest as PlanningDigestV1,
    positionId: value.positionId as string,
    positionDigest: value.positionDigest as PlanningDigestV1,
    positionStepSequence: value.positionStepSequence as number,
    memberId: value.memberId as string,
    memberBindingDigest: value.memberBindingDigest as PlanningDigestV1,
    workItemId: value.workItemId as string,
    workItemRevision: value.workItemRevision as number,
    dependencyArtifactDigests:
      value.dependencyArtifactDigests as readonly PlanningDigestV1[],
    inputReferenceDigest: value.inputReferenceDigest as PlanningDigestV1,
    preparedAtLogicalMs: value.preparedAtLogicalMs as number,
    validUntilLogicalMs: value.validUntilLogicalMs as number,
  });
  if (
    value.dispatchId !== result.dispatchId ||
    value.dispatchDigest !== result.dispatchDigest
  )
    fail("team execution step dispatch binding is invalid");
  return result;
}

export function createTeamExecutionControlEvidenceV1(
  input: Omit<TeamExecutionControlEvidenceV1, "evidenceDigest">,
): TeamExecutionControlEvidenceV1 {
  schema(input.schemaVersion, "team execution control evidence");
  const body = freeze({
    schemaVersion: 1 as const,
    controlId: identifier(input.controlId, "control.controlId"),
    controlVersion: positive(input.controlVersion, "control.controlVersion"),
    implementationId: identifier(
      input.implementationId,
      "control.implementationId",
    ),
    disposition: controlDisposition(input.disposition),
    reasonCode: token(input.reasonCode, "control.reasonCode"),
    sourceEvidenceDigest: sha(
      input.sourceEvidenceDigest,
      "control.sourceEvidenceDigest",
    ),
    evaluatedAtLogicalMs: nonNegative(
      input.evaluatedAtLogicalMs,
      "control.evaluatedAtLogicalMs",
    ),
  });
  return freeze({
    ...body,
    evidenceDigest: digest("team-execution-control-evidence", body),
  });
}

export function validateTeamExecutionControlEvidenceV1(
  input: unknown,
): TeamExecutionControlEvidenceV1 {
  const value = exact(
    input,
    [
      "controlId",
      "controlVersion",
      "disposition",
      "evaluatedAtLogicalMs",
      "evidenceDigest",
      "implementationId",
      "reasonCode",
      "schemaVersion",
      "sourceEvidenceDigest",
    ],
    "team execution control evidence",
  );
  const result = createTeamExecutionControlEvidenceV1({
    schemaVersion: value.schemaVersion as 1,
    controlId: value.controlId as string,
    controlVersion: value.controlVersion as number,
    implementationId: value.implementationId as string,
    disposition: value.disposition as TeamExecutionControlDispositionV1,
    reasonCode: value.reasonCode as string,
    sourceEvidenceDigest: value.sourceEvidenceDigest as PlanningDigestV1,
    evaluatedAtLogicalMs: value.evaluatedAtLogicalMs as number,
  });
  if (value.evidenceDigest !== result.evidenceDigest)
    fail("team execution control evidence digest is invalid");
  return result;
}

export function createTeamExecutionStepResultV1(input: {
  readonly dispatch: TeamExecutionStepDispatchV1;
  readonly executorId: string;
  readonly executorVersion: number;
  readonly executorImplementationId: string;
  readonly status: TeamExecutionStepStatusV1;
  readonly artifacts: readonly TeamExecutionArtifactV1[];
  readonly peerMessageDigests: readonly PlanningDigestV1[];
  readonly control: TeamExecutionControlEvidenceV1;
  readonly sourceStepRecordDigest: PlanningDigestV1;
  readonly reasonCode: string;
  readonly completedAtLogicalMs: number;
}): TeamExecutionStepResultV1 {
  const dispatch = validateTeamExecutionStepDispatchV1(input.dispatch);
  const artifacts = sortedRecords(
    safeArray(input.artifacts, "stepResult.artifacts", 4_096).map(
      validateTeamExecutionArtifactV1,
    ),
    (artifact) => artifact.artifactDigest,
    "step result artifacts",
  );
  const control = validateTeamExecutionControlEvidenceV1(input.control);
  const completedAtLogicalMs = nonNegative(
    input.completedAtLogicalMs,
    "stepResult.completedAtLogicalMs",
  );
  if (completedAtLogicalMs < dispatch.preparedAtLogicalMs)
    fail("team execution step result time rolled back");
  if (
    control.evaluatedAtLogicalMs < dispatch.preparedAtLogicalMs ||
    control.evaluatedAtLogicalMs > completedAtLogicalMs
  )
    fail("team execution control evidence is outside the step window");
  for (const artifact of artifacts) {
    if (
      artifact.executionId !== dispatch.executionId ||
      artifact.executionEpoch !== dispatch.executionEpoch ||
      artifact.teamId !== dispatch.teamId ||
      artifact.teamEpoch !== dispatch.teamEpoch ||
      artifact.producerPositionId !== dispatch.positionId ||
      artifact.producerMemberId !== dispatch.memberId ||
      artifact.producerBindingDigest !== dispatch.memberBindingDigest ||
      artifact.sourceDispatchDigest !== dispatch.dispatchDigest ||
      artifact.producedAtLogicalMs > completedAtLogicalMs ||
      !same(
        artifact.dependencyArtifactDigests,
        dispatch.dependencyArtifactDigests,
      )
    )
      fail("team execution artifact is outside its dispatch");
  }
  const body = freeze({
    schemaVersion: 1 as const,
    dispatchDigest: dispatch.dispatchDigest,
    executorId: identifier(input.executorId, "stepResult.executorId"),
    executorVersion: positive(
      input.executorVersion,
      "stepResult.executorVersion",
    ),
    executorImplementationId: identifier(
      input.executorImplementationId,
      "stepResult.executorImplementationId",
    ),
    status: stepStatus(input.status),
    artifacts,
    peerMessageDigests: digests(
      input.peerMessageDigests,
      "stepResult.peerMessageDigests",
      65_536,
    ),
    control,
    sourceStepRecordDigest: sha(
      input.sourceStepRecordDigest,
      "stepResult.sourceStepRecordDigest",
    ),
    reasonCode: token(input.reasonCode, "stepResult.reasonCode"),
    completedAtLogicalMs,
  });
  const resultDigest = digest("team-execution-step-result", body);
  return freeze({
    ...body,
    resultId: `team-step-result.${resultDigest.slice(7)}`,
    resultDigest,
  });
}

export function validateTeamExecutionStepResultV1(
  input: unknown,
): TeamExecutionStepResultV1 {
  const value = exact(
    input,
    [
      "artifacts",
      "completedAtLogicalMs",
      "control",
      "dispatchDigest",
      "executorId",
      "executorImplementationId",
      "executorVersion",
      "peerMessageDigests",
      "reasonCode",
      "resultDigest",
      "resultId",
      "schemaVersion",
      "sourceStepRecordDigest",
      "status",
    ],
    "team execution step result",
  );
  schema(value.schemaVersion, "team execution step result");
  const body = freeze({
    schemaVersion: 1 as const,
    dispatchDigest: sha(value.dispatchDigest, "stepResult.dispatchDigest"),
    executorId: identifier(value.executorId, "stepResult.executorId"),
    executorVersion: positive(
      value.executorVersion,
      "stepResult.executorVersion",
    ),
    executorImplementationId: identifier(
      value.executorImplementationId,
      "stepResult.executorImplementationId",
    ),
    status: stepStatus(value.status),
    artifacts: sortedRecords(
      safeArray(value.artifacts, "stepResult.artifacts", 4_096).map(
        validateTeamExecutionArtifactV1,
      ),
      (artifact) => artifact.artifactDigest,
      "step result artifacts",
    ),
    peerMessageDigests: digests(
      value.peerMessageDigests,
      "stepResult.peerMessageDigests",
      65_536,
    ),
    control: validateTeamExecutionControlEvidenceV1(value.control),
    sourceStepRecordDigest: sha(
      value.sourceStepRecordDigest,
      "stepResult.sourceStepRecordDigest",
    ),
    reasonCode: token(value.reasonCode, "stepResult.reasonCode"),
    completedAtLogicalMs: nonNegative(
      value.completedAtLogicalMs,
      "stepResult.completedAtLogicalMs",
    ),
  });
  const resultDigest = digest("team-execution-step-result", body);
  if (
    value.resultDigest !== resultDigest ||
    value.resultId !== `team-step-result.${resultDigest.slice(7)}`
  )
    fail("team execution step result binding is invalid");
  return freeze({
    ...body,
    resultId: value.resultId as string,
    resultDigest,
  });
}

export function createTeamExecutionStepRecordV1(input: {
  readonly dispatch: TeamExecutionStepDispatchV1;
  readonly result: TeamExecutionStepResultV1 | null;
}): TeamExecutionStepRecordV1 {
  const dispatch = validateTeamExecutionStepDispatchV1(input.dispatch);
  const result = input.result
    ? validateTeamExecutionStepResultV1(input.result)
    : null;
  if (result && result.dispatchDigest !== dispatch.dispatchDigest)
    fail("team execution step record result is outside dispatch");
  const body = freeze({ schemaVersion: 1 as const, dispatch, result });
  return freeze({
    ...body,
    recordDigest: digest("team-execution-step-record", body),
  });
}

export function validateTeamExecutionStepRecordV1(
  input: unknown,
): TeamExecutionStepRecordV1 {
  const value = exact(
    input,
    ["dispatch", "recordDigest", "result", "schemaVersion"],
    "team execution step record",
  );
  schema(value.schemaVersion, "team execution step record");
  const result = createTeamExecutionStepRecordV1({
    dispatch: value.dispatch as TeamExecutionStepDispatchV1,
    result: value.result as TeamExecutionStepResultV1 | null,
  });
  if (value.recordDigest !== result.recordDigest)
    fail("team execution step record digest is invalid");
  return result;
}

export function createTeamExecutionPositionStateV1(
  input: Omit<TeamExecutionPositionStateV1, "positionStateDigest">,
): TeamExecutionPositionStateV1 {
  schema(input.schemaVersion, "team execution position state");
  const body = freeze({
    schemaVersion: 1 as const,
    positionId: identifier(input.positionId, "positionState.positionId"),
    positionDigest: sha(input.positionDigest, "positionState.positionDigest"),
    memberId: identifier(input.memberId, "positionState.memberId"),
    memberBindingDigest: sha(
      input.memberBindingDigest,
      "positionState.memberBindingDigest",
    ),
    workItemId: identifier(input.workItemId, "positionState.workItemId"),
    workItemRevision: positive(
      input.workItemRevision,
      "positionState.workItemRevision",
    ),
    dependsOnPositionIds: identifiers(
      input.dependsOnPositionIds,
      "positionState.dependsOnPositionIds",
      256,
    ),
    status: positionStatus(input.status),
    stepSequence: nonNegative(input.stepSequence, "positionState.stepSequence"),
    latestDispatchDigest:
      input.latestDispatchDigest === null
        ? null
        : sha(input.latestDispatchDigest, "positionState.latestDispatchDigest"),
    latestResultDigest:
      input.latestResultDigest === null
        ? null
        : sha(input.latestResultDigest, "positionState.latestResultDigest"),
    failureResultDigest:
      input.failureResultDigest === null
        ? null
        : sha(input.failureResultDigest, "positionState.failureResultDigest"),
    artifactDigests: digests(
      input.artifactDigests,
      "positionState.artifactDigests",
      65_536,
    ),
    startedAtLogicalMs:
      input.startedAtLogicalMs === null
        ? null
        : nonNegative(
            input.startedAtLogicalMs,
            "positionState.startedAtLogicalMs",
          ),
    completedAtLogicalMs:
      input.completedAtLogicalMs === null
        ? null
        : nonNegative(
            input.completedAtLogicalMs,
            "positionState.completedAtLogicalMs",
          ),
  });
  validatePositionLifecycle(body);
  return freeze({
    ...body,
    positionStateDigest: digest("team-execution-position-state", body),
  });
}

export function validateTeamExecutionPositionStateV1(
  input: unknown,
): TeamExecutionPositionStateV1 {
  const value = exact(
    input,
    [
      "artifactDigests",
      "completedAtLogicalMs",
      "dependsOnPositionIds",
      "failureResultDigest",
      "latestDispatchDigest",
      "latestResultDigest",
      "memberBindingDigest",
      "memberId",
      "positionDigest",
      "positionId",
      "positionStateDigest",
      "schemaVersion",
      "startedAtLogicalMs",
      "status",
      "stepSequence",
      "workItemId",
      "workItemRevision",
    ],
    "team execution position state",
  );
  const result = createTeamExecutionPositionStateV1({
    schemaVersion: value.schemaVersion as 1,
    positionId: value.positionId as string,
    positionDigest: value.positionDigest as PlanningDigestV1,
    memberId: value.memberId as string,
    memberBindingDigest: value.memberBindingDigest as PlanningDigestV1,
    workItemId: value.workItemId as string,
    workItemRevision: value.workItemRevision as number,
    dependsOnPositionIds: value.dependsOnPositionIds as readonly string[],
    status: value.status as TeamExecutionPositionStatusV1,
    stepSequence: value.stepSequence as number,
    latestDispatchDigest: value.latestDispatchDigest as PlanningDigestV1 | null,
    latestResultDigest: value.latestResultDigest as PlanningDigestV1 | null,
    failureResultDigest: value.failureResultDigest as PlanningDigestV1 | null,
    artifactDigests: value.artifactDigests as readonly PlanningDigestV1[],
    startedAtLogicalMs: value.startedAtLogicalMs as number | null,
    completedAtLogicalMs: value.completedAtLogicalMs as number | null,
  });
  if (value.positionStateDigest !== result.positionStateDigest)
    fail("team execution position state digest is invalid");
  return result;
}

export function createTeamExecutionMetricsV1(
  input: Omit<TeamExecutionMetricsV1, "metricsDigest">,
): TeamExecutionMetricsV1 {
  schema(input.schemaVersion, "team execution metrics");
  const body = freeze({
    schemaVersion: 1 as const,
    totalStepAttempts: nonNegative(
      input.totalStepAttempts,
      "metrics.totalStepAttempts",
    ),
    totalPeerMessages: nonNegative(
      input.totalPeerMessages,
      "metrics.totalPeerMessages",
    ),
    completedPositions: nonNegative(
      input.completedPositions,
      "metrics.completedPositions",
    ),
    recoveryCount: nonNegative(input.recoveryCount, "metrics.recoveryCount"),
    lastRecoveryLatencyLogicalMs:
      input.lastRecoveryLatencyLogicalMs === null
        ? null
        : nonNegative(
            input.lastRecoveryLatencyLogicalMs,
            "metrics.lastRecoveryLatencyLogicalMs",
          ),
    maximumRecoveryLatencyLogicalMs:
      input.maximumRecoveryLatencyLogicalMs === null
        ? null
        : nonNegative(
            input.maximumRecoveryLatencyLogicalMs,
            "metrics.maximumRecoveryLatencyLogicalMs",
          ),
  });
  if (
    (body.recoveryCount === 0) !==
      (body.lastRecoveryLatencyLogicalMs === null &&
        body.maximumRecoveryLatencyLogicalMs === null) ||
    (body.lastRecoveryLatencyLogicalMs !== null &&
      body.maximumRecoveryLatencyLogicalMs !== null &&
      body.lastRecoveryLatencyLogicalMs > body.maximumRecoveryLatencyLogicalMs)
  )
    fail("team execution recovery metrics are invalid");
  return freeze({
    ...body,
    metricsDigest: digest("team-execution-metrics", body),
  });
}

export function validateTeamExecutionMetricsV1(
  input: unknown,
): TeamExecutionMetricsV1 {
  const value = exact(
    input,
    [
      "completedPositions",
      "lastRecoveryLatencyLogicalMs",
      "maximumRecoveryLatencyLogicalMs",
      "metricsDigest",
      "recoveryCount",
      "schemaVersion",
      "totalPeerMessages",
      "totalStepAttempts",
    ],
    "team execution metrics",
  );
  const result = createTeamExecutionMetricsV1({
    schemaVersion: value.schemaVersion as 1,
    totalStepAttempts: value.totalStepAttempts as number,
    totalPeerMessages: value.totalPeerMessages as number,
    completedPositions: value.completedPositions as number,
    recoveryCount: value.recoveryCount as number,
    lastRecoveryLatencyLogicalMs: value.lastRecoveryLatencyLogicalMs as
      number | null,
    maximumRecoveryLatencyLogicalMs: value.maximumRecoveryLatencyLogicalMs as
      number | null,
  });
  if (value.metricsDigest !== result.metricsDigest)
    fail("team execution metrics digest is invalid");
  return result;
}

export function createTeamExecutionRecoverySignalV1(input: {
  readonly dispatch: TeamExecutionStepDispatchV1;
  readonly result: TeamExecutionStepResultV1;
}): TeamExecutionRecoverySignalV1 {
  const dispatch = validateTeamExecutionStepDispatchV1(input.dispatch);
  const result = validateTeamExecutionStepResultV1(input.result);
  if (
    result.dispatchDigest !== dispatch.dispatchDigest ||
    (result.status !== "failed" && result.status !== "unsafe")
  )
    fail("team execution recovery signal requires a failed result");
  const body = freeze({
    schemaVersion: 1 as const,
    executionId: dispatch.executionId,
    executionEpoch: dispatch.executionEpoch,
    teamId: dispatch.teamId,
    teamEpoch: dispatch.teamEpoch,
    jointWorkContractDigest: dispatch.jointWorkContractDigest,
    failedPositionId: dispatch.positionId,
    failedMemberId: dispatch.memberId,
    failedMemberBindingDigest: dispatch.memberBindingDigest,
    failureStatus: result.status,
    failureResultDigest: result.resultDigest,
    reasonCode: result.reasonCode,
    observedAtLogicalMs: result.completedAtLogicalMs,
  });
  const signalDigest = digest("team-execution-recovery-signal", body);
  return freeze({
    ...body,
    signalId: `team-recovery.${signalDigest.slice(7)}`,
    signalDigest,
  });
}

export function validateTeamExecutionRecoverySignalV1(
  input: unknown,
): TeamExecutionRecoverySignalV1 {
  const value = exact(
    input,
    [
      "executionEpoch",
      "executionId",
      "failedMemberBindingDigest",
      "failedMemberId",
      "failedPositionId",
      "failureResultDigest",
      "failureStatus",
      "jointWorkContractDigest",
      "observedAtLogicalMs",
      "reasonCode",
      "schemaVersion",
      "signalDigest",
      "signalId",
      "teamEpoch",
      "teamId",
    ],
    "team execution recovery signal",
  );
  schema(value.schemaVersion, "team execution recovery signal");
  if (value.failureStatus !== "failed" && value.failureStatus !== "unsafe")
    fail("team execution recovery signal status is invalid");
  const body = freeze({
    schemaVersion: 1 as const,
    executionId: identifier(value.executionId, "recovery.executionId"),
    executionEpoch: positive(value.executionEpoch, "recovery.executionEpoch"),
    teamId: identifier(value.teamId, "recovery.teamId"),
    teamEpoch: positive(value.teamEpoch, "recovery.teamEpoch"),
    jointWorkContractDigest: sha(
      value.jointWorkContractDigest,
      "recovery.jointWorkContractDigest",
    ),
    failedPositionId: identifier(
      value.failedPositionId,
      "recovery.failedPositionId",
    ),
    failedMemberId: identifier(value.failedMemberId, "recovery.failedMemberId"),
    failedMemberBindingDigest: sha(
      value.failedMemberBindingDigest,
      "recovery.failedMemberBindingDigest",
    ),
    failureStatus: value.failureStatus as "failed" | "unsafe",
    failureResultDigest: sha(
      value.failureResultDigest,
      "recovery.failureResultDigest",
    ),
    reasonCode: token(value.reasonCode, "recovery.reasonCode"),
    observedAtLogicalMs: nonNegative(
      value.observedAtLogicalMs,
      "recovery.observedAtLogicalMs",
    ),
  });
  const signalDigest = digest("team-execution-recovery-signal", body);
  if (
    value.signalDigest !== signalDigest ||
    value.signalId !== `team-recovery.${signalDigest.slice(7)}`
  )
    fail("team execution recovery signal binding is invalid");
  return freeze({
    ...body,
    signalId: value.signalId as string,
    signalDigest,
  });
}

export function createTeamExecutionEpochHistoryEntryV1(
  input: Omit<TeamExecutionEpochHistoryEntryV1, "historyDigest">,
): TeamExecutionEpochHistoryEntryV1 {
  schema(input.schemaVersion, "team execution epoch history");
  const body = freeze({
    schemaVersion: 1 as const,
    executionEpoch: positive(input.executionEpoch, "history.executionEpoch"),
    teamEpoch: positive(input.teamEpoch, "history.teamEpoch"),
    jointWorkContractDigest: sha(
      input.jointWorkContractDigest,
      "history.jointWorkContractDigest",
    ),
    terminalStateDigest: sha(
      input.terminalStateDigest,
      "history.terminalStateDigest",
    ),
    recoverySignalDigest: sha(
      input.recoverySignalDigest,
      "history.recoverySignalDigest",
    ),
    completedPositionIds: identifiers(
      input.completedPositionIds,
      "history.completedPositionIds",
      256,
    ),
    totalStepAttempts: nonNegative(
      input.totalStepAttempts,
      "history.totalStepAttempts",
    ),
    totalPeerMessages: nonNegative(
      input.totalPeerMessages,
      "history.totalPeerMessages",
    ),
    closedAtLogicalMs: nonNegative(
      input.closedAtLogicalMs,
      "history.closedAtLogicalMs",
    ),
  });
  return freeze({
    ...body,
    historyDigest: digest("team-execution-epoch-history", body),
  });
}

export function validateTeamExecutionEpochHistoryEntryV1(
  input: unknown,
): TeamExecutionEpochHistoryEntryV1 {
  const value = exact(
    input,
    [
      "closedAtLogicalMs",
      "completedPositionIds",
      "executionEpoch",
      "historyDigest",
      "jointWorkContractDigest",
      "recoverySignalDigest",
      "schemaVersion",
      "teamEpoch",
      "terminalStateDigest",
      "totalPeerMessages",
      "totalStepAttempts",
    ],
    "team execution epoch history",
  );
  const result = createTeamExecutionEpochHistoryEntryV1({
    schemaVersion: value.schemaVersion as 1,
    executionEpoch: value.executionEpoch as number,
    teamEpoch: value.teamEpoch as number,
    jointWorkContractDigest: value.jointWorkContractDigest as PlanningDigestV1,
    terminalStateDigest: value.terminalStateDigest as PlanningDigestV1,
    recoverySignalDigest: value.recoverySignalDigest as PlanningDigestV1,
    completedPositionIds: value.completedPositionIds as readonly string[],
    totalStepAttempts: value.totalStepAttempts as number,
    totalPeerMessages: value.totalPeerMessages as number,
    closedAtLogicalMs: value.closedAtLogicalMs as number,
  });
  if (value.historyDigest !== result.historyDigest)
    fail("team execution epoch history digest is invalid");
  return result;
}

export function createTeamExecutionStartRequestV1(
  input: Omit<TeamExecutionStartRequestV1, "requestDigest">,
): TeamExecutionStartRequestV1 {
  schema(input.schemaVersion, "team execution start request");
  const proposal = validateTeamProposalV1(input.proposal);
  const jointWorkContract = validateJointWorkContractV1(
    input.jointWorkContract,
  );
  assertProposalJoint(proposal, jointWorkContract);
  const body = freeze({
    schemaVersion: 1 as const,
    requestId: identifier(input.requestId, "startRequest.requestId"),
    proposal,
    jointWorkContract,
    logicalTimeMs: nonNegative(
      input.logicalTimeMs,
      "startRequest.logicalTimeMs",
    ),
    validUntilLogicalMs: positive(
      input.validUntilLogicalMs,
      "startRequest.validUntilLogicalMs",
    ),
  });
  if (
    body.logicalTimeMs < jointWorkContract.activatedAtLogicalMs ||
    body.logicalTimeMs >= jointWorkContract.validUntilLogicalMs ||
    body.validUntilLogicalMs <= body.logicalTimeMs ||
    body.validUntilLogicalMs > jointWorkContract.validUntilLogicalMs
  )
    fail("team execution start request window is invalid");
  return freeze({
    ...body,
    requestDigest: digest("team-execution-start-request", body),
  });
}

export function validateTeamExecutionStartRequestV1(
  input: unknown,
): TeamExecutionStartRequestV1 {
  const value = exact(
    input,
    [
      "jointWorkContract",
      "logicalTimeMs",
      "proposal",
      "requestDigest",
      "requestId",
      "schemaVersion",
      "validUntilLogicalMs",
    ],
    "team execution start request",
  );
  const result = createTeamExecutionStartRequestV1({
    schemaVersion: value.schemaVersion as 1,
    requestId: value.requestId as string,
    proposal: value.proposal as TeamProposalV1,
    jointWorkContract: value.jointWorkContract as JointWorkContractV1,
    logicalTimeMs: value.logicalTimeMs as number,
    validUntilLogicalMs: value.validUntilLogicalMs as number,
  });
  if (value.requestDigest !== result.requestDigest)
    fail("team execution start request digest is invalid");
  return result;
}

export function createTeamExecutionRebindRequestV1(
  input: Omit<TeamExecutionRebindRequestV1, "requestDigest">,
): TeamExecutionRebindRequestV1 {
  schema(input.schemaVersion, "team execution rebind request");
  const proposal = validateTeamProposalV1(input.proposal);
  const jointWorkContract = validateJointWorkContractV1(
    input.jointWorkContract,
  );
  assertProposalJoint(proposal, jointWorkContract);
  const body = freeze({
    schemaVersion: 1 as const,
    requestId: identifier(input.requestId, "rebindRequest.requestId"),
    expectedStateDigest: sha(
      input.expectedStateDigest,
      "rebindRequest.expectedStateDigest",
    ),
    recoverySignalDigest: sha(
      input.recoverySignalDigest,
      "rebindRequest.recoverySignalDigest",
    ),
    proposal,
    jointWorkContract,
    logicalTimeMs: nonNegative(
      input.logicalTimeMs,
      "rebindRequest.logicalTimeMs",
    ),
  });
  if (
    body.logicalTimeMs < jointWorkContract.activatedAtLogicalMs ||
    body.logicalTimeMs >= jointWorkContract.validUntilLogicalMs
  )
    fail("team execution rebind request time is invalid");
  return freeze({
    ...body,
    requestDigest: digest("team-execution-rebind-request", body),
  });
}

export function validateTeamExecutionRebindRequestV1(
  input: unknown,
): TeamExecutionRebindRequestV1 {
  const value = exact(
    input,
    [
      "expectedStateDigest",
      "jointWorkContract",
      "logicalTimeMs",
      "proposal",
      "recoverySignalDigest",
      "requestDigest",
      "requestId",
      "schemaVersion",
    ],
    "team execution rebind request",
  );
  const result = createTeamExecutionRebindRequestV1({
    schemaVersion: value.schemaVersion as 1,
    requestId: value.requestId as string,
    expectedStateDigest: value.expectedStateDigest as PlanningDigestV1,
    recoverySignalDigest: value.recoverySignalDigest as PlanningDigestV1,
    proposal: value.proposal as TeamProposalV1,
    jointWorkContract: value.jointWorkContract as JointWorkContractV1,
    logicalTimeMs: value.logicalTimeMs as number,
  });
  if (value.requestDigest !== result.requestDigest)
    fail("team execution rebind request digest is invalid");
  return result;
}

export function createTeamExecutionRecordV1(
  input: Omit<TeamExecutionRecordV1, "recordDigest">,
  options: { readonly policy: TeamExecutionPolicyRecordV1 },
): TeamExecutionRecordV1 {
  const policy = validateTeamExecutionPolicyV1(options.policy);
  const record = normalizeExecutionRecord(input, policy);
  return freeze({
    ...record,
    recordDigest: digest("team-execution-record", record),
  });
}

export function validateTeamExecutionRecordV1(
  input: unknown,
  options: { readonly policy: TeamExecutionPolicyRecordV1 },
): TeamExecutionRecordV1 {
  const value = exact(
    input,
    [
      "artifacts",
      "executionEpoch",
      "executionId",
      "history",
      "jointWorkContract",
      "metrics",
      "positions",
      "proposal",
      "recordDigest",
      "recoverySignal",
      "schemaVersion",
      "scope",
      "startedAtLogicalMs",
      "status",
      "steps",
      "terminalReasonCode",
      "updatedAtLogicalMs",
      "validUntilLogicalMs",
    ],
    "team execution record",
  );
  const result = createTeamExecutionRecordV1(
    {
      schemaVersion: value.schemaVersion as 1,
      executionId: value.executionId as string,
      executionEpoch: value.executionEpoch as number,
      scope: value.scope as TeamExecutionScopeV1,
      status: value.status as TeamExecutionStatusV1,
      terminalReasonCode: value.terminalReasonCode as string | null,
      proposal: value.proposal as TeamProposalV1,
      jointWorkContract: value.jointWorkContract as JointWorkContractV1,
      positions: value.positions as readonly TeamExecutionPositionStateV1[],
      artifacts: value.artifacts as readonly TeamExecutionArtifactV1[],
      steps: value.steps as readonly TeamExecutionStepRecordV1[],
      recoverySignal:
        value.recoverySignal as TeamExecutionRecoverySignalV1 | null,
      metrics: value.metrics as TeamExecutionMetricsV1,
      history: value.history as readonly TeamExecutionEpochHistoryEntryV1[],
      startedAtLogicalMs: value.startedAtLogicalMs as number,
      validUntilLogicalMs: value.validUntilLogicalMs as number,
      updatedAtLogicalMs: value.updatedAtLogicalMs as number,
    },
    options,
  );
  if (value.recordDigest !== result.recordDigest)
    fail("team execution record digest is invalid");
  return result;
}

export function createTeamExecutionStateV1(input: {
  readonly stateKey: string;
  readonly runtimeId: string;
  readonly runtimeVersion: number;
  readonly implementationId: string;
  readonly policy: TeamExecutionPolicyRecordV1;
  readonly revision?: number;
  readonly logicalTimeHighWaterMs?: number;
  readonly execution?: TeamExecutionRecordV1 | null;
  readonly predecessorStateDigest?: PlanningDigestV1 | null;
}): TeamExecutionStateV1 {
  const policy = validateTeamExecutionPolicyV1(input.policy);
  const body = freeze({
    format: TEAM_EXECUTION_STATE_FORMAT_V1,
    schemaVersion: 1 as const,
    stateKey: identifier(input.stateKey, "state.stateKey"),
    runtimeId: identifier(input.runtimeId, "state.runtimeId"),
    runtimeVersion: positive(input.runtimeVersion, "state.runtimeVersion"),
    implementationId: identifier(
      input.implementationId,
      "state.implementationId",
    ),
    policyId: policy.policy.policyId,
    policyVersion: policy.policy.policyVersion,
    policyDigest: policy.policyDigest,
    revision: nonNegative(input.revision ?? 0, "state.revision"),
    logicalTimeHighWaterMs: nonNegative(
      input.logicalTimeHighWaterMs ?? 0,
      "state.logicalTimeHighWaterMs",
    ),
    execution: input.execution
      ? validateTeamExecutionRecordV1(input.execution, { policy })
      : null,
    predecessorStateDigest:
      input.predecessorStateDigest === undefined ||
      input.predecessorStateDigest === null
        ? null
        : sha(input.predecessorStateDigest, "state.predecessorStateDigest"),
  });
  if (body.revision === 0) {
    if (body.execution !== null || body.predecessorStateDigest !== null)
      fail("initial team execution state is invalid");
  } else if (body.predecessorStateDigest === null) {
    fail("team execution state predecessor is missing");
  }
  if (
    body.execution &&
    body.execution.updatedAtLogicalMs > body.logicalTimeHighWaterMs
  )
    fail("team execution state logical time is invalid");
  return freeze({ ...body, stateDigest: digest("team-execution-state", body) });
}

export function validateTeamExecutionStateV1(
  input: unknown,
  options: { readonly policy: TeamExecutionPolicyRecordV1 },
): TeamExecutionStateV1 {
  const value = exact(
    input,
    [
      "execution",
      "format",
      "implementationId",
      "logicalTimeHighWaterMs",
      "policyDigest",
      "policyId",
      "policyVersion",
      "predecessorStateDigest",
      "revision",
      "runtimeId",
      "runtimeVersion",
      "schemaVersion",
      "stateDigest",
      "stateKey",
    ],
    "team execution state",
  );
  if (
    value.format !== TEAM_EXECUTION_STATE_FORMAT_V1 ||
    value.schemaVersion !== 1
  )
    fail("team execution state format is invalid");
  const policy = validateTeamExecutionPolicyV1(options.policy);
  const result = createTeamExecutionStateV1({
    stateKey: value.stateKey as string,
    runtimeId: value.runtimeId as string,
    runtimeVersion: value.runtimeVersion as number,
    implementationId: value.implementationId as string,
    policy,
    revision: value.revision as number,
    logicalTimeHighWaterMs: value.logicalTimeHighWaterMs as number,
    execution: value.execution as TeamExecutionRecordV1 | null,
    predecessorStateDigest:
      value.predecessorStateDigest as PlanningDigestV1 | null,
  });
  if (
    value.policyId !== policy.policy.policyId ||
    value.policyVersion !== policy.policy.policyVersion ||
    value.policyDigest !== policy.policyDigest ||
    value.stateDigest !== result.stateDigest
  )
    fail("team execution state binding is invalid");
  return result;
}

export function createTeamExecutionHandoffV1(input: {
  readonly sourceState: TeamExecutionStateV1;
  readonly targetStateKey: string;
  readonly exportedAtLogicalMs: number;
  readonly policy: TeamExecutionPolicyRecordV1;
}): TeamExecutionHandoffEnvelopeV1 {
  const sourceState = validateTeamExecutionStateV1(input.sourceState, {
    policy: input.policy,
  });
  const body = freeze({
    format: TEAM_EXECUTION_HANDOFF_FORMAT_V1,
    schemaVersion: 1 as const,
    contentClass: "team_execution_state" as const,
    runtimeId: sourceState.runtimeId,
    runtimeVersion: sourceState.runtimeVersion,
    implementationId: sourceState.implementationId,
    policyDigest: sourceState.policyDigest,
    sourceStateKey: sourceState.stateKey,
    sourceStateDigest: sourceState.stateDigest,
    targetStateKey: identifier(input.targetStateKey, "handoff.targetStateKey"),
    exportedAtLogicalMs: nonNegative(
      input.exportedAtLogicalMs,
      "handoff.exportedAtLogicalMs",
    ),
    sourceState,
  });
  if (
    body.targetStateKey === body.sourceStateKey ||
    body.exportedAtLogicalMs < sourceState.logicalTimeHighWaterMs
  )
    fail("team execution handoff target or time is invalid");
  return freeze({
    ...body,
    handoffDigest: digest("team-execution-handoff", body),
  });
}

export function validateTeamExecutionHandoffV1(
  input: unknown,
  options: { readonly policy: TeamExecutionPolicyRecordV1 },
): TeamExecutionHandoffEnvelopeV1 {
  const value = exact(
    input,
    [
      "contentClass",
      "exportedAtLogicalMs",
      "format",
      "handoffDigest",
      "implementationId",
      "policyDigest",
      "runtimeId",
      "runtimeVersion",
      "schemaVersion",
      "sourceState",
      "sourceStateDigest",
      "sourceStateKey",
      "targetStateKey",
    ],
    "team execution handoff",
  );
  if (
    value.format !== TEAM_EXECUTION_HANDOFF_FORMAT_V1 ||
    value.contentClass !== "team_execution_state" ||
    value.schemaVersion !== 1
  )
    fail("team execution handoff format is invalid");
  const sourceState = validateTeamExecutionStateV1(value.sourceState, options);
  const result = createTeamExecutionHandoffV1({
    sourceState,
    targetStateKey: value.targetStateKey as string,
    exportedAtLogicalMs: value.exportedAtLogicalMs as number,
    policy: options.policy,
  });
  if (
    value.runtimeId !== sourceState.runtimeId ||
    value.runtimeVersion !== sourceState.runtimeVersion ||
    value.implementationId !== sourceState.implementationId ||
    value.policyDigest !== sourceState.policyDigest ||
    value.sourceStateKey !== sourceState.stateKey ||
    value.sourceStateDigest !== sourceState.stateDigest ||
    value.handoffDigest !== result.handoffDigest
  )
    fail("team execution handoff binding is invalid");
  return result;
}

export function deriveTeamExecutionIdV1(scope: TeamExecutionScopeV1): string {
  const validated = validateTeamExecutionScopeV1(scope);
  const value = digest("team-execution-identity", {
    scopeDigest: validated.scopeDigest,
  });
  return `team-execution.${value.slice(7)}`;
}

function normalizeExecutionRecord(
  input: Omit<TeamExecutionRecordV1, "recordDigest">,
  policy: TeamExecutionPolicyRecordV1,
): Omit<TeamExecutionRecordV1, "recordDigest"> {
  schema(input.schemaVersion, "team execution record");
  const scope = validateTeamExecutionScopeV1(input.scope);
  const proposal = validateTeamProposalV1(input.proposal);
  const jointWorkContract = validateJointWorkContractV1(
    input.jointWorkContract,
  );
  assertProposalJoint(proposal, jointWorkContract);
  const positions = sortedRecords(
    safeArray(input.positions, "execution.positions", 256).map(
      validateTeamExecutionPositionStateV1,
    ),
    (position) => position.positionId,
    "execution positions",
  );
  const artifacts = sortedRecords(
    safeArray(input.artifacts, "execution.artifacts", 65_536).map(
      validateTeamExecutionArtifactV1,
    ),
    (artifact) => artifact.artifactDigest,
    "execution artifacts",
  );
  const steps = sortedRecords(
    safeArray(input.steps, "execution.steps", 65_536).map(
      validateTeamExecutionStepRecordV1,
    ),
    (step) =>
      `${step.dispatch.positionId}\u0000${step.dispatch.positionStepSequence
        .toString()
        .padStart(16, "0")}\u0000${step.dispatch.dispatchDigest}`,
    "execution steps",
  );
  const history = safeArray(
    input.history,
    "execution.history",
    policy.policy.limits.maximumHistoryEntries,
  ).map(validateTeamExecutionEpochHistoryEntryV1);
  const record = freeze({
    schemaVersion: 1 as const,
    executionId: identifier(input.executionId, "execution.executionId"),
    executionEpoch: positive(input.executionEpoch, "execution.executionEpoch"),
    scope,
    status: executionStatus(input.status),
    terminalReasonCode:
      input.terminalReasonCode === null
        ? null
        : token(input.terminalReasonCode, "execution.terminalReasonCode"),
    proposal,
    jointWorkContract,
    positions,
    artifacts,
    steps,
    recoverySignal: input.recoverySignal
      ? validateTeamExecutionRecoverySignalV1(input.recoverySignal)
      : null,
    metrics: validateTeamExecutionMetricsV1(input.metrics),
    history: freeze(history),
    startedAtLogicalMs: nonNegative(
      input.startedAtLogicalMs,
      "execution.startedAtLogicalMs",
    ),
    validUntilLogicalMs: positive(
      input.validUntilLogicalMs,
      "execution.validUntilLogicalMs",
    ),
    updatedAtLogicalMs: nonNegative(
      input.updatedAtLogicalMs,
      "execution.updatedAtLogicalMs",
    ),
  });
  validateExecutionRelations(record, policy);
  return record;
}

function validateExecutionRelations(
  record: Omit<TeamExecutionRecordV1, "recordDigest">,
  policy: TeamExecutionPolicyRecordV1,
): void {
  if (
    record.executionId !== deriveTeamExecutionIdV1(record.scope) ||
    record.scope.teamId !== record.proposal.teamId ||
    record.executionEpoch !== record.proposal.teamEpoch ||
    record.startedAtLogicalMs > record.updatedAtLogicalMs ||
    record.validUntilLogicalMs <= record.startedAtLogicalMs ||
    record.validUntilLogicalMs > record.jointWorkContract.validUntilLogicalMs ||
    record.validUntilLogicalMs - record.startedAtLogicalMs >
      policy.policy.limits.maximumExecutionDurationMs ||
    record.positions.length !== record.proposal.positions.length ||
    record.positions.length > policy.policy.limits.maximumPositions
  )
    fail("team execution record scope or window is invalid");
  const proposalPositions = new Map(
    record.proposal.positions.map((position) => [
      position.positionId,
      position,
    ]),
  );
  const proposalMembers = new Map(
    record.proposal.members.map((member) => [member.positionId, member]),
  );
  const bindings = new Map(
    record.jointWorkContract.memberContracts.map((binding) => [
      binding.positionId,
      binding,
    ]),
  );
  const runtimePositions = new Map(
    record.positions.map((position) => [position.positionId, position]),
  );
  for (const positionState of record.positions) {
    const position = proposalPositions.get(positionState.positionId);
    const member = proposalMembers.get(positionState.positionId);
    const binding = bindings.get(positionState.positionId);
    if (
      !position ||
      !member ||
      !binding ||
      positionState.positionDigest !== position.positionDigest ||
      positionState.memberId !== binding.memberId ||
      positionState.memberBindingDigest !== binding.bindingDigest ||
      positionState.workItemId !== position.workItemId ||
      positionState.workItemRevision !== position.workItemRevision ||
      !same(
        positionState.dependsOnPositionIds,
        position.dependsOnPositionIds,
      ) ||
      positionState.stepSequence >
        policy.policy.limits.maximumStepsPerPosition ||
      positionState.artifactDigests.length >
        policy.policy.limits.maximumArtifactsPerPosition
    )
      fail("team execution position binding is invalid");
    const dependenciesComplete = position.dependsOnPositionIds.every(
      (positionId) => runtimePositions.get(positionId)?.status === "completed",
    );
    if (
      (positionState.status === "ready" && !dependenciesComplete) ||
      (positionState.status === "blocked" && dependenciesComplete)
    )
      fail("team execution position readiness is invalid");
  }
  const artifacts = new Map(
    record.artifacts.map((artifact) => [artifact.artifactDigest, artifact]),
  );
  const artifactIds = new Set<string>();
  for (const artifact of record.artifacts) {
    const producer = runtimePositions.get(artifact.producerPositionId);
    if (
      artifact.executionId !== record.executionId ||
      artifact.executionEpoch > record.executionEpoch ||
      artifact.teamId !== record.scope.teamId ||
      artifact.teamEpoch > record.proposal.teamEpoch ||
      artifact.byteLength > policy.policy.limits.maximumArtifactBytes ||
      artifact.dependencyArtifactDigests.length >
        policy.policy.limits.maximumArtifactDependencies ||
      artifact.dependencyArtifactDigests.some(
        (artifactDigest) => !artifacts.has(artifactDigest),
      ) ||
      artifactIds.has(artifact.artifactId) ||
      !producer ||
      !producer.artifactDigests.includes(artifact.artifactDigest) ||
      (artifact.executionEpoch === record.executionEpoch &&
        (artifact.teamEpoch !== record.proposal.teamEpoch ||
          artifact.producerMemberId !== producer.memberId ||
          artifact.producerBindingDigest !== producer.memberBindingDigest))
    )
      fail("team execution artifact retention is invalid");
    artifactIds.add(artifact.artifactId);
  }
  for (const position of record.positions) {
    if (
      position.artifactDigests.some((artifactDigest) => {
        const artifact = artifacts.get(artifactDigest);
        return !artifact || artifact.producerPositionId !== position.positionId;
      }) ||
      (policy.policy.requireReferencedCompletionArtifact &&
        position.status === "completed" &&
        position.artifactDigests.length === 0)
    )
      fail("team execution position artifacts are invalid");
  }
  const pendingByPosition = new Map<string, number>();
  let currentMessages = 0;
  for (const step of record.steps) {
    const dispatch = step.dispatch;
    const position = runtimePositions.get(dispatch.positionId);
    if (
      !position ||
      dispatch.executionId !== record.executionId ||
      dispatch.executionEpoch !== record.executionEpoch ||
      dispatch.teamId !== record.scope.teamId ||
      dispatch.teamEpoch !== record.proposal.teamEpoch ||
      dispatch.jointWorkContractDigest !==
        record.jointWorkContract.jointWorkContractDigest ||
      dispatch.positionDigest !== position.positionDigest ||
      dispatch.memberId !== position.memberId ||
      dispatch.memberBindingDigest !== position.memberBindingDigest ||
      dispatch.validUntilLogicalMs - dispatch.preparedAtLogicalMs >
        policy.policy.limits.maximumStepTtlMs ||
      dispatch.dependencyArtifactDigests.length >
        policy.policy.limits.maximumArtifactDependencies
    )
      fail("team execution step dispatch retention is invalid");
    if (!step.result) {
      pendingByPosition.set(
        dispatch.positionId,
        (pendingByPosition.get(dispatch.positionId) ?? 0) + 1,
      );
    } else {
      if (
        step.result.dispatchDigest !== dispatch.dispatchDigest ||
        step.result.artifacts.length >
          policy.policy.limits.maximumArtifactsPerStep ||
        step.result.peerMessageDigests.length >
          policy.policy.limits.maximumPeerMessagesPerStep ||
        step.result.artifacts.some(
          (artifact) => !artifacts.has(artifact.artifactDigest),
        ) ||
        (policy.policy.requireAllowedControlForProgress &&
          (step.result.status === "progress" ||
            step.result.status === "completed") &&
          step.result.control.disposition !== "allow")
      )
        fail("team execution step result retention is invalid");
      currentMessages = safeAdd(
        currentMessages,
        step.result.peerMessageDigests.length,
        "team execution peer messages",
      );
    }
  }
  const latestHistory = record.history.at(-1);
  const expectedStepAttempts = safeAdd(
    latestHistory?.totalStepAttempts ?? 0,
    record.steps.length,
    "team execution step attempts",
  );
  const expectedPeerMessages = safeAdd(
    latestHistory?.totalPeerMessages ?? 0,
    currentMessages,
    "team execution peer messages",
  );
  if (
    [...pendingByPosition.values()].some((count) => count !== 1) ||
    record.positions.some(
      (position) =>
        (position.status === "running") !==
        (pendingByPosition.get(position.positionId) === 1),
    ) ||
    (record.status === "cancelled"
      ? record.metrics.totalStepAttempts < expectedStepAttempts
      : record.metrics.totalStepAttempts !== expectedStepAttempts) ||
    record.metrics.totalPeerMessages !== expectedPeerMessages ||
    record.metrics.totalPeerMessages >
      policy.policy.limits.maximumTotalPeerMessages ||
    record.metrics.completedPositions !==
      record.positions.filter((position) => position.status === "completed")
        .length ||
    record.metrics.recoveryCount > policy.policy.limits.maximumRecoveryCount ||
    record.history.length > policy.policy.limits.maximumHistoryEntries
  )
    fail("team execution metrics or pending dispatch state is invalid");
  for (const [index, entry] of record.history.entries()) {
    const previous = record.history[index - 1];
    if (
      entry.executionEpoch >= record.executionEpoch ||
      entry.teamEpoch >= record.proposal.teamEpoch ||
      (previous !== undefined &&
        (entry.executionEpoch <= previous.executionEpoch ||
          entry.teamEpoch <= previous.teamEpoch ||
          entry.totalStepAttempts < previous.totalStepAttempts ||
          entry.totalPeerMessages < previous.totalPeerMessages))
    )
      fail("team execution epoch history ordering is invalid");
  }
  const failures = record.positions.filter(
    (position) => position.status === "failed" || position.status === "unsafe",
  );
  if (
    (record.status === "completed" &&
      record.positions.some((position) => position.status !== "completed")) ||
    (record.status === "recovery_required" &&
      (failures.length !== 1 || !record.recoverySignal)) ||
    (record.status !== "recovery_required" && record.recoverySignal !== null) ||
    (record.status === "cancelled" &&
      record.positions.some(
        (position) =>
          position.status !== "completed" && position.status !== "cancelled",
      )) ||
    (record.status === "active" &&
      (failures.length > 0 ||
        record.positions.every(
          (position) => position.status === "completed",
        ))) ||
    (record.status === "active" && record.terminalReasonCode !== null) ||
    (record.status !== "active" && record.terminalReasonCode === null) ||
    (record.status === "completed" &&
      record.terminalReasonCode !== "all_positions_completed") ||
    (record.status === "recovery_required" &&
      record.terminalReasonCode !== record.recoverySignal?.reasonCode)
  )
    fail("team execution lifecycle status is invalid");
  if (record.recoverySignal) {
    const failed = failures[0]!;
    if (
      record.recoverySignal.executionId !== record.executionId ||
      record.recoverySignal.executionEpoch !== record.executionEpoch ||
      record.recoverySignal.failedPositionId !== failed.positionId ||
      record.recoverySignal.failedMemberId !== failed.memberId ||
      record.recoverySignal.failureResultDigest !== failed.failureResultDigest
    )
      fail("team execution recovery signal is outside current failure");
  }
}

function normalizePolicy(input: unknown): TeamExecutionPolicyV1 {
  const value = exact(
    input,
    [
      "limits",
      "parentPolicyDigest",
      "policyId",
      "policyVersion",
      "requireAllowedControlForProgress",
      "requireReferencedCompletionArtifact",
      "schemaVersion",
    ],
    "team execution policy",
  );
  schema(value.schemaVersion, "team execution policy");
  const limitsValue = exact(
    value.limits,
    [
      "maximumArtifactBytes",
      "maximumArtifactDependencies",
      "maximumArtifactsPerPosition",
      "maximumArtifactsPerStep",
      "maximumCommitAttempts",
      "maximumExecutionDurationMs",
      "maximumHistoryEntries",
      "maximumPeerMessagesPerStep",
      "maximumPositions",
      "maximumRecoveryCount",
      "maximumStepTtlMs",
      "maximumStepsPerPosition",
      "maximumTotalPeerMessages",
    ],
    "team execution limits",
  );
  const limits = freeze({
    maximumPositions: boundedPositive(
      limitsValue.maximumPositions,
      "limits.maximumPositions",
      256,
    ),
    maximumStepsPerPosition: boundedPositive(
      limitsValue.maximumStepsPerPosition,
      "limits.maximumStepsPerPosition",
      100_000,
    ),
    maximumArtifactsPerStep: boundedPositive(
      limitsValue.maximumArtifactsPerStep,
      "limits.maximumArtifactsPerStep",
      1_024,
    ),
    maximumArtifactsPerPosition: boundedPositive(
      limitsValue.maximumArtifactsPerPosition,
      "limits.maximumArtifactsPerPosition",
      65_536,
    ),
    maximumArtifactDependencies: boundedPositive(
      limitsValue.maximumArtifactDependencies,
      "limits.maximumArtifactDependencies",
      4_096,
    ),
    maximumArtifactBytes: boundedPositive(
      limitsValue.maximumArtifactBytes,
      "limits.maximumArtifactBytes",
      67_108_864,
    ),
    maximumPeerMessagesPerStep: boundedPositive(
      limitsValue.maximumPeerMessagesPerStep,
      "limits.maximumPeerMessagesPerStep",
      65_536,
    ),
    maximumTotalPeerMessages: boundedPositive(
      limitsValue.maximumTotalPeerMessages,
      "limits.maximumTotalPeerMessages",
      10_000_000,
    ),
    maximumRecoveryCount: boundedPositive(
      limitsValue.maximumRecoveryCount,
      "limits.maximumRecoveryCount",
      10_000,
    ),
    maximumHistoryEntries: boundedPositive(
      limitsValue.maximumHistoryEntries,
      "limits.maximumHistoryEntries",
      10_000,
    ),
    maximumExecutionDurationMs: boundedPositive(
      limitsValue.maximumExecutionDurationMs,
      "limits.maximumExecutionDurationMs",
      Number.MAX_SAFE_INTEGER,
    ),
    maximumStepTtlMs: boundedPositive(
      limitsValue.maximumStepTtlMs,
      "limits.maximumStepTtlMs",
      Number.MAX_SAFE_INTEGER,
    ),
    maximumCommitAttempts: boundedPositive(
      limitsValue.maximumCommitAttempts,
      "limits.maximumCommitAttempts",
      64,
    ),
  });
  if (
    limits.maximumArtifactsPerStep > limits.maximumArtifactsPerPosition ||
    limits.maximumStepTtlMs > limits.maximumExecutionDurationMs
  )
    fail("team execution limits are inconsistent");
  return freeze({
    schemaVersion: 1,
    policyId: identifier(value.policyId, "policy.policyId"),
    policyVersion: positive(value.policyVersion, "policy.policyVersion"),
    parentPolicyDigest:
      value.parentPolicyDigest === null
        ? null
        : sha(value.parentPolicyDigest, "policy.parentPolicyDigest"),
    requireReferencedCompletionArtifact: booleanValue(
      value.requireReferencedCompletionArtifact,
      "policy.requireReferencedCompletionArtifact",
    ),
    requireAllowedControlForProgress: booleanValue(
      value.requireAllowedControlForProgress,
      "policy.requireAllowedControlForProgress",
    ),
    limits,
  });
}

function assertProposalJoint(
  proposal: TeamProposalV1,
  joint: JointWorkContractV1,
): void {
  if (
    joint.teamId !== proposal.teamId ||
    joint.teamEpoch !== proposal.teamEpoch ||
    joint.proposalDigest !== proposal.proposalDigest ||
    joint.predecessorJointWorkContractDigest !==
      proposal.predecessorJointWorkContractDigest ||
    joint.scopeDigest !== proposal.scope.scopeDigest ||
    joint.memberContracts.length !== proposal.members.length
  )
    fail("joint Work Contract is outside team proposal");
  const positions = new Map(
    proposal.positions.map((position) => [position.positionId, position]),
  );
  const members = new Map(
    proposal.members.map((member) => [member.positionId, member]),
  );
  for (const binding of joint.memberContracts) {
    const position = positions.get(binding.positionId);
    const member = members.get(binding.positionId);
    if (
      !position ||
      !member ||
      !memberBindingMatches(position, member, binding)
    )
      fail("joint Work Contract member is outside team proposal");
  }
}

function memberBindingMatches(
  position: TeamPositionV1,
  member: TeamMemberSelectionV1,
  binding: TeamMemberContractBindingV1,
): boolean {
  return (
    binding.memberId === member.memberId &&
    binding.selectionDigest === member.selectionDigest &&
    binding.peerId === member.peerId &&
    binding.instanceId === member.instanceId &&
    binding.workItemId === position.workItemId &&
    binding.workItemRevision === position.workItemRevision &&
    binding.roleKey === position.roleKey &&
    position.requiredCapabilityKeys.every((key) =>
      binding.requiredCapabilityKeys.includes(key),
    )
  );
}

function validatePositionLifecycle(
  value: Omit<TeamExecutionPositionStateV1, "positionStateDigest">,
): void {
  if (
    (value.stepSequence === 0) !== (value.latestDispatchDigest === null) ||
    (value.latestResultDigest !== null &&
      value.latestDispatchDigest === null) ||
    (value.status === "running" && value.latestDispatchDigest === null) ||
    ((value.status === "failed" || value.status === "unsafe") &&
      (value.failureResultDigest === null ||
        value.failureResultDigest !== value.latestResultDigest)) ||
    (value.status !== "failed" &&
      value.status !== "unsafe" &&
      value.failureResultDigest !== null) ||
    (value.status === "completed" && value.completedAtLogicalMs === null) ||
    (value.status !== "completed" && value.completedAtLogicalMs !== null) ||
    (value.startedAtLogicalMs !== null &&
      value.completedAtLogicalMs !== null &&
      value.completedAtLogicalMs < value.startedAtLogicalMs)
  )
    fail("team execution position lifecycle is invalid");
}

function executionStatus(input: unknown): TeamExecutionStatusV1 {
  if (
    input !== "active" &&
    input !== "completed" &&
    input !== "recovery_required" &&
    input !== "cancelled"
  )
    fail("team execution status is invalid");
  return input;
}

function positionStatus(input: unknown): TeamExecutionPositionStatusV1 {
  if (
    input !== "blocked" &&
    input !== "ready" &&
    input !== "running" &&
    input !== "completed" &&
    input !== "failed" &&
    input !== "unsafe" &&
    input !== "cancelled"
  )
    fail("team execution position status is invalid");
  return input;
}

function stepStatus(input: unknown): TeamExecutionStepStatusV1 {
  if (
    input !== "progress" &&
    input !== "completed" &&
    input !== "failed" &&
    input !== "unsafe" &&
    input !== "paused"
  )
    fail("team execution step status is invalid");
  return input;
}

function controlDisposition(input: unknown): TeamExecutionControlDispositionV1 {
  if (
    input !== "allow" &&
    input !== "deny" &&
    input !== "abstain" &&
    input !== "escalate"
  )
    fail("team execution control disposition is invalid");
  return input;
}

function schema(input: unknown, label: string): void {
  if (input !== 1) fail(`${label} schemaVersion is invalid`);
}

function exact(
  input: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null) ||
    Object.getOwnPropertySymbols(input).length > 0
  )
    fail(`${label} is invalid`);
  const value = input as Record<string, unknown>;
  const actual = Object.getOwnPropertyNames(value).sort(compare);
  const expected = [...keys].sort(compare);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    fail(`${label} shape is invalid`);
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
      fail(`${label} shape is invalid`);
  }
  return value;
}

function safeArray(input: unknown, label: string, maximum: number): unknown[] {
  if (!Array.isArray(input) || input.length > maximum)
    fail(`${label} is invalid`);
  const descriptor = Object.getOwnPropertyDescriptor(input, "length");
  if (!descriptor || !("value" in descriptor)) fail(`${label} is invalid`);
  return input;
}

function sortedRecords<T>(
  values: readonly T[],
  key: (value: T) => string,
  label: string,
): readonly T[] {
  const result = [...values].sort((left, right) =>
    compare(key(left), key(right)),
  );
  if (
    result.some(
      (value, index) => index > 0 && key(result[index - 1]!) === key(value),
    )
  )
    fail(`${label} contains duplicates`);
  return freeze(result);
}

function identifiers(
  input: unknown,
  label: string,
  maximum: number,
): readonly string[] {
  const values = safeArray(input, label, maximum).map((value, index) =>
    identifier(value, `${label}[${index}]`),
  );
  return sortedRecords(values, (value) => value, label);
}

function digests(
  input: unknown,
  label: string,
  maximum: number,
): readonly PlanningDigestV1[] {
  const values = safeArray(input, label, maximum).map((value, index) =>
    sha(value, `${label}[${index}]`),
  );
  return sortedRecords(values, (value) => value, label);
}

function identifier(input: unknown, label: string): string {
  if (typeof input !== "string" || !IDENTIFIER.test(input))
    fail(`${label} is invalid`);
  return input;
}

function token(input: unknown, label: string): string {
  if (typeof input !== "string" || !TOKEN.test(input))
    fail(`${label} is invalid`);
  return input;
}

function mediaType(input: unknown, label: string): string {
  if (typeof input !== "string" || !MEDIA_TYPE.test(input))
    fail(`${label} is invalid`);
  return input;
}

function contentReference(input: unknown, label: string): string {
  if (typeof input !== "string" || !CONTENT_REFERENCE.test(input))
    fail(`${label} is invalid`);
  return input;
}

function sha(input: unknown, label: string): PlanningDigestV1 {
  if (typeof input !== "string" || !DIGEST.test(input))
    fail(`${label} is invalid`);
  return input as PlanningDigestV1;
}

function positive(input: unknown, label: string): number {
  if (!Number.isSafeInteger(input) || (input as number) < 1)
    fail(`${label} is invalid`);
  return input as number;
}

function boundedPositive(
  input: unknown,
  label: string,
  maximum: number,
): number {
  const value = positive(input, label);
  if (value > maximum) fail(`${label} exceeds its limit`);
  return value;
}

function nonNegative(input: unknown, label: string): number {
  if (!Number.isSafeInteger(input) || (input as number) < 0)
    fail(`${label} is invalid`);
  return input as number;
}

function booleanValue(input: unknown, label: string): boolean {
  if (typeof input !== "boolean") fail(`${label} is invalid`);
  return input;
}

function safeAdd(left: number, right: number, label: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) fail(`${label} exceeds safe integer range`);
  return value;
}

function same(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function digest(
  domain: PlanningDigestDomainV1,
  value: unknown,
): PlanningDigestV1 {
  return digestPlanningJsonV1(domain, value as PlanningJson);
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function fail(message: string): never {
  throw new TypeError(message);
}
