import {
  canonicalizeMeshPayload,
  compareMeshTimestamps,
  validateMeshEnvelopeContext,
  validateSignedMeshEnvelope,
  type SignedMeshEnvelope,
  type VerifiedMeshEnvelope,
  type WorkAcceptPayload,
  type WorkAwardPayload,
  type WorkCancelPayload,
  type WorkCheckpointPayload,
  type WorkProgressPayload,
  type WorkReleasePayload,
  type WorkResultPayload,
} from "@agentplat/mesh-protocol";

import type {
  MeshAllocationDecision,
  MeshAllocationEffect,
  MeshAllocationRejectionCode,
  MeshAllocationRuntimeState,
  MeshExecutionHeadProjection,
  MeshExecutionPayload,
  MeshExecutionRecordProjection,
  MeshExecutionRecordType,
  MeshLeaseHeadProjection,
  MeshLocalExecutionCommand,
  MeshVerifiedAllocationRequest,
} from "./coordination-allocation-contracts.js";
import {
  createMeshAllocationRuntimeState,
  restoreMeshAllocationState,
} from "./coordination-allocation-state.js";
import { sha256Base64Url } from "./sha256.js";
import {
  assertMeshLogicalTime,
  createFrozenRecord,
  recordEntries,
} from "./state.js";

type ExecutionAuthority = Omit<
  MeshExecutionHeadProjection,
  | "executionScopeKey"
  | "phase"
  | "latestProgressId"
  | "latestProgressSequence"
  | "latestCheckpointId"
  | "latestCheckpointSequence"
  | "resultId"
  | "terminalRecordId"
  | "terminalAt"
>;

/** Applies a locally prepared execution lifecycle envelope before dispatch. */
export function evaluateMeshExecutionCommand(
  state: MeshAllocationRuntimeState,
  command: MeshLocalExecutionCommand,
  verifiedAt: string,
  receivedAt: number,
): MeshAllocationDecision {
  assertExecutionRuntime(state, receivedAt);
  if (
    !command ||
    typeof command !== "object" ||
    Object.keys(command).sort().join(",") !== "envelope,kind,preparedAt" ||
    command.kind !== "allocation.execution" ||
    !Number.isSafeInteger(command.preparedAt) ||
    command.preparedAt < 0
  )
    throw new TypeError("Invalid Mesh execution command");
  const parsed = validateSignedMeshEnvelope(command.envelope);
  if (!parsed.ok || !isExecutionPayload(parsed.value.payload))
    return reject(state, "execution_invalid");
  if (command.preparedAt > receivedAt)
    return reject(state, "execution_invalid");
  return applyExecution(
    state,
    parsed.value as SignedMeshEnvelope<MeshExecutionPayload>,
    verifiedAt,
    receivedAt,
    "local",
  );
}

/** Applies one authenticated remote execution lifecycle record. */
export function evaluateVerifiedMeshExecutionEnvelope(
  state: MeshAllocationRuntimeState,
  request: MeshVerifiedAllocationRequest,
): MeshAllocationDecision {
  if (
    !request ||
    typeof request !== "object" ||
    !request.envelope ||
    typeof request.verifiedAt !== "string" ||
    !Number.isSafeInteger(request.receivedAt) ||
    request.receivedAt < 0 ||
    Object.keys(request).some(
      (key) =>
        key !== "envelope" &&
        key !== "verifiedAt" &&
        key !== "receivedAt" &&
        key !== "supportedCriticalExtensions",
    ) ||
    (request.supportedCriticalExtensions !== undefined &&
      (!Array.isArray(request.supportedCriticalExtensions) ||
        request.supportedCriticalExtensions.some(
          (value) => typeof value !== "string" || value.length === 0,
        ) ||
        new Set(request.supportedCriticalExtensions).size !==
          request.supportedCriticalExtensions.length))
  )
    throw new TypeError("Invalid Mesh verified execution request");
  assertExecutionRuntime(state, request.receivedAt);
  if (!isExecutionPayload(request.envelope.payload))
    return reject(state, "execution_invalid");
  return applyExecution(
    state,
    request.envelope as VerifiedMeshEnvelope<MeshExecutionPayload>,
    request.verifiedAt,
    request.receivedAt,
    "received",
    request.supportedCriticalExtensions,
  );
}

function applyExecution(
  state: MeshAllocationRuntimeState,
  envelope: SignedMeshEnvelope<MeshExecutionPayload>,
  verifiedAt: string,
  recordedAt: number,
  direction: "local" | "received",
  supportedCriticalExtensions?: readonly string[],
): MeshAllocationDecision {
  const payload = envelope.payload;
  const recordType = typeFor(payload);
  const recordId = idFor(payload);
  const recordKey = JSON.stringify([payload.type, recordId]);
  const existing = state.allocation.executionRecords[recordId];
  if (existing)
    return existing.direction === direction &&
      sameData(existing.envelope, envelope)
      ? acceptedDuplicate(state)
      : reject(state, "execution_duplicate_conflict");
  if (executionMessageAlreadyRetained(state, envelope.messageId))
    return reject(state, "execution_duplicate_conflict");
  if (state.coordination.domainRecords[recordKey])
    return reject(state, "domain_record_conflict");

  const context = validateMeshEnvelopeContext(envelope, {
    tenantId: state.allocation.identity.tenantId,
    meshId: state.allocation.identity.meshId,
    peerId:
      envelope.audience.kind === "peer"
        ? envelope.audience.peerId
        : state.allocation.identity.peerId,
    receivedAt: verifiedAt,
    ...(supportedCriticalExtensions === undefined
      ? {}
      : { supportedCriticalExtensions }),
  });
  if (!context.ok)
    return reject(state, contextCode(context.issues[0]?.code ?? ""));
  if (!canonicalDigest(envelope)) return reject(state, "execution_invalid");
  if (
    direction === "local" &&
    (envelope.sender.peerId !== state.allocation.identity.peerId ||
      envelope.sender.instanceId !== state.allocation.identity.instanceId ||
      envelope.proof.keyId !== state.allocation.identity.keyId)
  )
    return reject(state, "execution_authority_invalid");

  const authority = resolveAuthority(state, payload);
  if (!authority) return reject(state, "execution_authority_invalid");
  const scope = executionScopeKey(authority);
  const prior = state.allocation.executionHeads[scope];
  if (prior && !sameAuthority(prior, authority))
    return reject(state, "execution_authority_invalid");
  const leaseBound = requiresActiveLease(payload);
  if (
    (leaseBound &&
      (recordedAt >= authority.leaseExpiresAtLogical ||
        compare(verifiedAt, authority.leaseExpiresAt) >= 0)) ||
    recordedAt >= authority.workDeadlineAt ||
    compare(verifiedAt, authority.workDeadline) >= 0
  )
    return reject(state, "execution_deadline_elapsed");
  if (!hasValidAudienceAndRole(state, envelope, authority, direction))
    return reject(state, "execution_authority_invalid");
  if (!hasValidAuthorityFields(payload, authority))
    return reject(state, "execution_authority_invalid");

  const pending =
    payload.type === "work.cancel" &&
    payload.assignmentState === "award_pending";
  if (pending) {
    if (!cancelPendingValid(state, envelope, authority, direction))
      return reject(state, "execution_authority_invalid");
  } else if (!validTransition(state, prior, envelope, authority)) {
    return reject(state, "execution_phase_invalid");
  }

  if (
    Object.keys(state.allocation.executionRecords).length >=
    state.allocation.limits.maximumExecutionRecords
  )
    return reject(state, "execution_capacity_exceeded");
  if (
    Object.values(state.allocation.executionRecords).filter(
      (record) => executionScopeForPayload(record.envelope.payload) === scope,
    ).length >= state.allocation.limits.maximumExecutionRecordsPerAssignment
  )
    return reject(state, "execution_records_per_assignment_exceeded");
  if (
    !prior &&
    !pending &&
    Object.keys(state.allocation.executionHeads).length >=
      state.allocation.limits.maximumExecutionHeads
  )
    return reject(state, "execution_head_capacity_exceeded");
  if (
    Object.keys(state.coordination.domainRecords).length >=
    state.coordination.limits.maximumDomainRecords
  )
    return reject(state, "domain_capacity_exceeded");
  if (
    state.coordination.journal.length >=
    state.coordination.limits.maximumJournalEntries
  )
    return reject(state, "journal_capacity_exceeded");
  if (state.coordination.localEventSequence >= Number.MAX_SAFE_INTEGER)
    throw new RangeError("Mesh coordination event sequence exhausted");

  const executionRecord: MeshExecutionRecordProjection = Object.freeze({
    recordType,
    recordId,
    direction,
    recordedAt,
    validityVerifiedAt: verifiedAt,
    ...(supportedCriticalExtensions === undefined
      ? {}
      : {
          supportedCriticalExtensions: Object.freeze([
            ...supportedCriticalExtensions,
          ]),
        }),
    envelope,
  });
  const nextHead = pending
    ? undefined
    : updateHead(prior, authority, payload, recordId, recordedAt);
  const pendingState = pending
    ? cancelPending(
        state,
        payload as Extract<
          WorkCancelPayload,
          { assignmentState: "award_pending" }
        >,
        recordedAt,
        direction,
      )
    : applyOperationalTransition(state, payload, recordedAt);
  if (!pendingState) return reject(state, "execution_authority_invalid");
  const terminalLeaseHead =
    nextHead !== undefined && nextHead.phase !== "active"
      ? pendingState.allocation.leaseHeads[scope]
      : undefined;
  const terminalLeaseProjection =
    terminalLeaseHead === undefined
      ? undefined
      : withoutLeaseTimer(terminalLeaseHead);
  const allocation = restoreMeshAllocationState({
    ...pendingState.allocation,
    executionRecords: createFrozenRecord([
      ...recordEntries(pendingState.allocation.executionRecords),
      [recordId, executionRecord],
    ]),
    ...(nextHead === undefined
      ? {}
      : {
          executionHeads: createFrozenRecord([
            ...recordEntries(pendingState.allocation.executionHeads).filter(
              ([key]) => key !== scope,
            ),
            [scope, nextHead],
          ]),
        }),
    ...(terminalLeaseProjection === undefined
      ? {}
      : {
          leaseHeads: createFrozenRecord([
            ...recordEntries(pendingState.allocation.leaseHeads).filter(
              ([key]) => key !== scope,
            ),
            [
              scope,
              Object.freeze({
                ...terminalLeaseProjection,
                status: "terminal" as const,
              }),
            ],
          ]),
        }),
    lastLogicalTime: recordedAt,
  });
  const sequence = pendingState.coordination.localEventSequence + 1;
  const coordination = Object.freeze({
    ...pendingState.coordination,
    ...(terminalLeaseHead?.expiryTimerId === undefined
      ? {}
      : {
          timers: createFrozenRecord(
            recordEntries(pendingState.coordination.timers).filter(
              ([timerId]) => timerId !== terminalLeaseHead.expiryTimerId,
            ),
          ),
        }),
    domainRecords: createFrozenRecord([
      ...recordEntries(pendingState.coordination.domainRecords),
      [
        recordKey,
        Object.freeze({
          recordKey,
          recordType: payload.type,
          recordId,
          contentDigest: digest(envelope),
          messageId: envelope.messageId,
          acceptedAt: recordedAt,
          objectiveId: payload.objectiveId,
        }),
      ],
    ]),
    journal: Object.freeze([
      ...pendingState.coordination.journal,
      Object.freeze({
        sequence,
        occurredAt: recordedAt,
        kind:
          direction === "local"
            ? ("command.accepted" as const)
            : ("domain.accepted" as const),
        domainRecordKey: recordKey,
      }),
    ]),
    localEventSequence: sequence,
    lastLogicalTime: recordedAt,
  });
  const next = createMeshAllocationRuntimeState(
    coordination,
    Object.freeze({
      ...pendingState.discovery,
      lastLogicalTime: recordedAt,
    }),
    Object.freeze({
      ...pendingState.objectives,
      lastLogicalTime: recordedAt,
    }),
    allocation,
  );
  const effect: MeshAllocationEffect | undefined =
    direction === "local"
      ? Object.freeze({
          kind: "allocation.execution.dispatch" as const,
          recordId,
          recordType,
          recipientPeerId:
            authority.ownerPeerId === state.allocation.identity.peerId
              ? authority.assigneePeerId
              : authority.ownerPeerId,
          messageId: envelope.messageId,
          envelope,
        })
      : undefined;
  return Object.freeze({
    accepted: true,
    duplicate: false,
    state: next,
    effects: Object.freeze(effect === undefined ? [] : [effect]),
  });
}

function withoutLeaseTimer(
  head: MeshLeaseHeadProjection,
): Omit<MeshLeaseHeadProjection, "expiryTimerId" | "expiryTimerGeneration"> {
  const {
    expiryTimerId: _expiryTimerId,
    expiryTimerGeneration: _expiryTimerGeneration,
    ...withoutTimer
  } = head;
  return withoutTimer;
}

function resolveAuthority(
  state: MeshAllocationRuntimeState,
  payload: MeshExecutionPayload,
): ExecutionAuthority | undefined {
  const localAward = state.allocation.localAwards[payload.awardId];
  const accepted = state.allocation.assignmentResponses[payload.awardId];
  const reservation =
    localAward && state.allocation.reservations[localAward.reservationId];
  if (
    localAward &&
    accepted?.kind === "work.accept" &&
    reservation?.status === "committed" &&
    localAward.status === "accepted"
  )
    return currentLeaseAuthority(
      state,
      Object.freeze({
        objectiveId: localAward.objectiveId,
        objectiveDocumentId: localAward.objectiveDocumentId,
        objectiveRevision: localAward.objectiveRevision,
        workItemId: localAward.work.workItemId,
        workItemRevision: localAward.work.workItemRevision,
        ownerPeerId: localAward.work.ownerPeerId,
        ownerEpoch: localAward.work.ownerEpoch,
        assigneePeerId: localAward.assigneePeerId,
        awardId: localAward.awardId,
        assignmentEpoch: localAward.assignmentEpoch,
        assignmentAuthorityId: localAward.assignmentAuthorityId,
        fencingToken: localAward.fencingToken,
        acceptanceId: accepted.responseId,
        acceptanceMessageId: accepted.envelope.messageId,
        workDeadline: localAward.workDeadline,
        workDeadlineAt: localAward.work.workDeadlineAt,
        leaseExpiresAt: localAward.leaseExpiresAt,
        leaseExpiresAtLogical: localAward.leaseExpiresAtLogical,
      }),
    );
  const localAuthority = state.allocation.assigneeAuthorities[payload.awardId];
  const response = state.allocation.localAssignmentResponses[payload.awardId];
  if (localAuthority && response?.kind === "work.accept")
    return currentLeaseAuthority(
      state,
      Object.freeze({
        objectiveId: localAuthority.objectiveId,
        objectiveDocumentId: localAuthority.objectiveDocumentId,
        objectiveRevision: localAuthority.objectiveRevision,
        workItemId: localAuthority.workItemId,
        workItemRevision: localAuthority.workItemRevision,
        ownerPeerId: localAuthority.ownerPeerId,
        ownerEpoch: localAuthority.ownerEpoch,
        assigneePeerId: localAuthority.assigneePeerId,
        awardId: localAuthority.awardId,
        assignmentEpoch: localAuthority.assignmentEpoch,
        assignmentAuthorityId: localAuthority.assignmentAuthorityId,
        fencingToken: localAuthority.fencingToken,
        acceptanceId: localAuthority.acceptanceId,
        acceptanceMessageId: response.envelope.messageId,
        workDeadline: localAuthority.workDeadline,
        workDeadlineAt: localAuthority.workDeadlineAt,
        leaseExpiresAt: localAuthority.leaseExpiresAt,
        leaseExpiresAtLogical: localAuthority.leaseExpiresAtLogical,
      }),
    );
  const receivedAward = state.allocation.receivedAwards[payload.awardId];
  const receivedOffer =
    receivedAward && state.allocation.receivedOffers[receivedAward.offerId];
  if (
    receivedAward &&
    receivedOffer &&
    payload.type === "work.cancel" &&
    payload.assignmentState === "award_pending" &&
    receivedAward.status === "awaiting_response"
  ) {
    const award = receivedAward.envelope.payload;
    return Object.freeze({
      objectiveId: award.objectiveId,
      objectiveDocumentId: award.objectiveDocumentId,
      objectiveRevision: award.objectiveRevision,
      workItemId: award.workItemId,
      workItemRevision: award.workItemRevision,
      ownerPeerId: award.ownerPeerId,
      ownerEpoch: award.ownerEpoch,
      assigneePeerId: award.assigneePeerId,
      awardId: award.awardId,
      assignmentEpoch: award.assignmentEpoch,
      assignmentAuthorityId: award.assignmentAuthorityId,
      fencingToken: award.fencingToken,
      acceptanceId: "pending",
      acceptanceMessageId: receivedAward.envelope.messageId,
      workDeadline: receivedOffer.envelope.payload.workDeadline,
      workDeadlineAt: receivedOffer.workDeadlineAt,
      leaseExpiresAt: award.leaseExpiresAt,
      leaseExpiresAtLogical: receivedAward.leaseExpiresAtLogical,
    });
  }
  if (
    localAward &&
    payload.type === "work.cancel" &&
    payload.assignmentState === "award_pending" &&
    localAward.status === "awaiting_acceptance"
  )
    return Object.freeze({
      objectiveId: localAward.objectiveId,
      objectiveDocumentId: localAward.objectiveDocumentId,
      objectiveRevision: localAward.objectiveRevision,
      workItemId: localAward.work.workItemId,
      workItemRevision: localAward.work.workItemRevision,
      ownerPeerId: localAward.work.ownerPeerId,
      ownerEpoch: localAward.work.ownerEpoch,
      assigneePeerId: localAward.assigneePeerId,
      awardId: localAward.awardId,
      assignmentEpoch: localAward.assignmentEpoch,
      assignmentAuthorityId: localAward.assignmentAuthorityId,
      fencingToken: localAward.fencingToken,
      acceptanceId: "pending",
      acceptanceMessageId: localAward.recipientAward.messageId,
      workDeadline: localAward.workDeadline,
      workDeadlineAt: localAward.work.workDeadlineAt,
      leaseExpiresAt: localAward.leaseExpiresAt,
      leaseExpiresAtLogical: localAward.leaseExpiresAtLogical,
    });
  return undefined;
}

/** Resolves execution only through the current active lease projection. */
function currentLeaseAuthority(
  state: MeshAllocationRuntimeState,
  authority: ExecutionAuthority,
): ExecutionAuthority | undefined {
  const head = state.allocation.leaseHeads[executionScopeKey(authority)];
  if (
    head === undefined ||
    head.acceptanceId !== authority.acceptanceId ||
    head.acceptanceMessageId !== authority.acceptanceMessageId ||
    head.assignmentAuthorityId !== authority.assignmentAuthorityId ||
    head.fencingToken !== authority.fencingToken
  )
    return undefined;
  return Object.freeze({
    ...authority,
    leaseExpiresAt: head.currentLeaseExpiresAt,
    leaseExpiresAtLogical: head.currentLeaseExpiresAtLogical,
  });
}

function validTransition(
  state: MeshAllocationRuntimeState,
  prior: MeshExecutionHeadProjection | undefined,
  envelope: SignedMeshEnvelope<MeshExecutionPayload>,
  authority: ExecutionAuthority,
): boolean {
  const payload = envelope.payload;
  if (prior && prior.phase !== "active") return false;
  if (payload.type === "work.progress")
    return (
      envelope.causationId === authority.acceptanceMessageId &&
      payload.progressSequence === (prior?.latestProgressSequence ?? 0) + 1 &&
      (payload.checkpointId === undefined ||
        payload.checkpointId === prior?.latestCheckpointId)
    );
  if (payload.type === "work.checkpoint")
    return prior?.latestCheckpointId === undefined
      ? payload.checkpointSequence === 1 &&
          payload.previousCheckpointId === undefined &&
          envelope.causationId === authority.acceptanceMessageId
      : payload.checkpointSequence ===
          (prior.latestCheckpointSequence ?? 0) + 1 &&
          payload.previousCheckpointId === prior.latestCheckpointId &&
          envelope.causationId ===
            recordMessageId(state, prior.latestCheckpointId);
  if (payload.type === "work.result")
    return (
      payload.checkpointId === prior?.latestCheckpointId &&
      envelope.causationId ===
        (prior?.latestCheckpointId === undefined
          ? authority.acceptanceMessageId
          : recordMessageId(state, prior.latestCheckpointId))
    );
  if (payload.type === "work.release")
    return (
      envelope.causationId ===
        currentLeaseCausationMessageId(state, authority) &&
      payload.releaseDisposition === "close"
    );
  return (
    payload.assignmentState === "active" &&
    envelope.causationId === currentLeaseCausationMessageId(state, authority)
  );
}

function currentLeaseCausationMessageId(
  state: MeshAllocationRuntimeState,
  authority: ExecutionAuthority,
): string {
  const leaseHead = state.allocation.leaseHeads[executionScopeKey(authority)];
  if (leaseHead?.latestLeaseRenewalId === undefined)
    return authority.acceptanceMessageId;
  const renewal =
    state.allocation.leaseRenewals[leaseHead.latestLeaseRenewalId];
  if (renewal === undefined)
    throw new TypeError("Mesh current lease renewal evidence is missing");
  return renewal.envelope.messageId;
}

function requiresActiveLease(payload: MeshExecutionPayload): boolean {
  return (
    payload.type === "work.progress" ||
    payload.type === "work.checkpoint" ||
    payload.type === "work.result" ||
    (payload.type === "work.release" && payload.releaseAuthority === "assignee")
  );
}

function updateHead(
  prior: MeshExecutionHeadProjection | undefined,
  authority: ExecutionAuthority,
  payload: MeshExecutionPayload,
  recordId: string,
  at: number,
): MeshExecutionHeadProjection {
  const head: MeshExecutionHeadProjection = Object.freeze({
    executionScopeKey: executionScopeKey(authority),
    ...authority,
    phase: "active",
    ...(prior?.latestProgressId === undefined
      ? {}
      : { latestProgressId: prior.latestProgressId }),
    ...(prior?.latestProgressSequence === undefined
      ? {}
      : { latestProgressSequence: prior.latestProgressSequence }),
    ...(prior?.latestCheckpointId === undefined
      ? {}
      : { latestCheckpointId: prior.latestCheckpointId }),
    ...(prior?.latestCheckpointSequence === undefined
      ? {}
      : { latestCheckpointSequence: prior.latestCheckpointSequence }),
  });
  if (payload.type === "work.progress")
    return Object.freeze({
      ...head,
      latestProgressId: recordId,
      latestProgressSequence: payload.progressSequence,
    });
  if (payload.type === "work.checkpoint")
    return Object.freeze({
      ...head,
      latestCheckpointId: recordId,
      latestCheckpointSequence: payload.checkpointSequence,
    });
  if (payload.type === "work.result")
    return Object.freeze({
      ...head,
      phase: "completed",
      resultId: recordId,
      terminalRecordId: recordId,
      terminalAt: at,
    });
  return Object.freeze({
    ...head,
    phase: payload.type === "work.release" ? "released" : "cancelled",
    terminalRecordId: recordId,
    terminalAt: at,
  });
}

function hasValidAuthorityFields(
  payload: MeshExecutionPayload,
  authority: ExecutionAuthority,
): boolean {
  return (
    payload.objectiveId === authority.objectiveId &&
    payload.objectiveDocumentId === authority.objectiveDocumentId &&
    payload.objectiveRevision === authority.objectiveRevision &&
    payload.workItemId === authority.workItemId &&
    payload.workItemRevision === authority.workItemRevision &&
    payload.ownerPeerId === authority.ownerPeerId &&
    payload.ownerEpoch === authority.ownerEpoch &&
    payload.assigneePeerId === authority.assigneePeerId &&
    payload.awardId === authority.awardId &&
    payload.assignmentEpoch === authority.assignmentEpoch &&
    payload.assignmentAuthorityId === authority.assignmentAuthorityId &&
    payload.fencingToken === authority.fencingToken &&
    payload.leaseExpiresAt === authority.leaseExpiresAt &&
    (payload.type !== "work.cancel" || payload.assignmentState === "active"
      ? payload.acceptanceId === authority.acceptanceId
      : true)
  );
}

function hasValidAudienceAndRole(
  state: MeshAllocationRuntimeState,
  envelope: SignedMeshEnvelope<MeshExecutionPayload>,
  authority: ExecutionAuthority,
  direction: "local" | "received",
): boolean {
  const sender =
    direction === "local"
      ? state.allocation.identity.peerId
      : envelope.sender.peerId;
  const recipient = envelope.audience;
  if (
    recipient.kind !== "peer" ||
    (direction === "received" &&
      recipient.peerId !== state.allocation.identity.peerId)
  )
    return false;
  const payload = envelope.payload;
  const expectedSender =
    payload.type === "work.release"
      ? payload.releaseAuthority === "owner"
        ? authority.ownerPeerId
        : authority.assigneePeerId
      : payload.type === "work.cancel"
        ? authority.ownerPeerId
        : authority.assigneePeerId;
  const expectedRecipient =
    expectedSender === authority.ownerPeerId
      ? authority.assigneePeerId
      : authority.ownerPeerId;
  return sender === expectedSender && recipient.peerId === expectedRecipient;
}

function cancelPendingValid(
  state: MeshAllocationRuntimeState,
  envelope: SignedMeshEnvelope<MeshExecutionPayload>,
  authority: ExecutionAuthority,
  direction: "local" | "received",
): boolean {
  const payload = envelope.payload;
  if (
    payload.type !== "work.cancel" ||
    payload.assignmentState !== "award_pending"
  )
    return false;
  const award = state.allocation.localAwards[payload.awardId];
  const work =
    award &&
    state.allocation.workAllocations[
      JSON.stringify([award.objectiveId, award.work.workItemId])
    ];
  const reservation =
    award && state.allocation.reservations[award.reservationId];
  const received = state.allocation.receivedAwards[payload.awardId];
  return Boolean(
    direction === "local"
      ? award &&
          work &&
          reservation &&
          award.status === "awaiting_acceptance" &&
          work.phase === "award_pending" &&
          work.activeAwardId === award.awardId &&
          reservation.status === "reserved" &&
          envelope.causationId === award.recipientAward.messageId &&
          payload.assignmentAuthorityId === award.assignmentAuthorityId &&
          authority.ownerPeerId === state.allocation.identity.peerId
      : received &&
          received.status === "awaiting_response" &&
          envelope.causationId === received.envelope.messageId &&
          hasValidAuthorityFields(payload, authority) &&
          authority.assigneePeerId === state.allocation.identity.peerId,
  );
}

function applyOperationalTransition(
  state: MeshAllocationRuntimeState,
  payload: MeshExecutionPayload,
  at: number,
): MeshAllocationRuntimeState {
  const phase =
    payload.type === "work.result"
      ? ("completed" as const)
      : payload.type === "work.release"
        ? ("released" as const)
        : payload.type === "work.cancel"
          ? ("cancelled" as const)
          : undefined;
  if (phase === undefined) return state;
  const key = JSON.stringify([payload.objectiveId, payload.workItemId]);
  const allocationWork = state.allocation.workAllocations[key];
  const objectiveWork = state.objectives.workItems[key];
  if (allocationWork === undefined || objectiveWork === undefined) return state;
  if (
    allocationWork.phase !== "active" ||
    allocationWork.activeAwardId !== payload.awardId ||
    allocationWork.activeAcceptanceId !==
      ("acceptanceId" in payload ? payload.acceptanceId : undefined) ||
    objectiveWork.status !== "ready"
  )
    return state;
  return Object.freeze({
    ...state,
    coordination: Object.freeze({
      ...state.coordination,
      timers: createFrozenRecord(
        recordEntries(state.coordination.timers).filter(
          ([timerId]) => timerId !== objectiveWork.expiryTimerId,
        ),
      ),
    }),
    objectives: Object.freeze({
      ...state.objectives,
      workItems: createFrozenRecord([
        ...recordEntries(state.objectives.workItems).filter(
          ([workKey]) => workKey !== key,
        ),
        [
          key,
          Object.freeze({
            ...objectiveWork,
            status: phase,
            expiryTimerId: undefined,
            expiryTimerGeneration: undefined,
            terminalAt: at,
            updatedAt: at,
          }),
        ],
      ]),
    }),
    allocation: Object.freeze({
      ...state.allocation,
      workAllocations: createFrozenRecord([
        ...recordEntries(state.allocation.workAllocations).filter(
          ([workKey]) => workKey !== key,
        ),
        [
          key,
          Object.freeze({
            ...allocationWork,
            phase,
            updatedAt: at,
          }),
        ],
      ]),
    }),
  });
}

function cancelPending(
  state: MeshAllocationRuntimeState,
  payload: Extract<WorkCancelPayload, { assignmentState: "award_pending" }>,
  at: number,
  direction: "local" | "received",
): MeshAllocationRuntimeState | undefined {
  if (direction === "received") {
    const received = state.allocation.receivedAwards[payload.awardId];
    if (!received) return undefined;
    return Object.freeze({
      ...state,
      coordination: Object.freeze({
        ...state.coordination,
        timers: createFrozenRecord(
          recordEntries(state.coordination.timers).filter(
            ([key]) => key !== received.acceptanceDeadlineTimerId,
          ),
        ),
      }),
      allocation: Object.freeze({
        ...state.allocation,
        receivedAwards: createFrozenRecord([
          ...recordEntries(state.allocation.receivedAwards).filter(
            ([key]) => key !== received.awardId,
          ),
          [
            received.awardId,
            Object.freeze({ ...received, status: "cancelled" as const }),
          ],
        ]),
      }),
    });
  }
  const award = state.allocation.localAwards[payload.awardId];
  if (!award) return undefined;
  const workKey = JSON.stringify([award.objectiveId, award.work.workItemId]);
  const work = state.allocation.workAllocations[workKey];
  const reservation = state.allocation.reservations[award.reservationId];
  const objective = state.objectives.objectives[award.objectiveId];
  if (!work || !reservation || !objective) return undefined;
  const coordination = Object.freeze({
    ...state.coordination,
    timers: createFrozenRecord(
      recordEntries(state.coordination.timers).filter(
        ([key]) => key !== award.acceptanceDeadlineTimerId,
      ),
    ),
  });
  const allocation = Object.freeze({
    ...state.allocation,
    workAllocations: createFrozenRecord([
      ...recordEntries(state.allocation.workAllocations).filter(
        ([key]) => key !== workKey,
      ),
      [
        workKey,
        Object.freeze({
          ...work,
          phase: "ready" as const,
          activeAwardId: undefined,
          reservationId: undefined,
          updatedAt: at,
        }),
      ],
    ]),
    localAwards: createFrozenRecord([
      ...recordEntries(state.allocation.localAwards).filter(
        ([key]) => key !== award.awardId,
      ),
      [
        award.awardId,
        Object.freeze({ ...award, status: "cancelled" as const }),
      ],
    ]),
    reservations: createFrozenRecord([
      ...recordEntries(state.allocation.reservations).filter(
        ([key]) => key !== reservation.reservationId,
      ),
      [
        reservation.reservationId,
        Object.freeze({
          ...reservation,
          status: "released" as const,
          releasedAt: at,
        }),
      ],
    ]),
  });
  const objectives = Object.freeze({
    ...state.objectives,
    objectives: createFrozenRecord([
      ...recordEntries(state.objectives.objectives).filter(
        ([key]) => key !== objective.objectiveId,
      ),
      [
        objective.objectiveId,
        Object.freeze({
          ...objective,
          reservedBudgetUnits:
            objective.reservedBudgetUnits - reservation.budgetReservationUnits,
        }),
      ],
    ]),
  });
  return Object.freeze({
    coordination,
    discovery: state.discovery,
    objectives,
    allocation,
  });
}

function executionScopeKey(authority: ExecutionAuthority): string {
  return JSON.stringify([
    authority.objectiveId,
    authority.objectiveRevision,
    authority.workItemId,
    authority.workItemRevision,
    authority.ownerPeerId,
    authority.ownerEpoch,
    authority.awardId,
    authority.assignmentEpoch,
  ]);
}
function executionScopeForPayload(payload: MeshExecutionPayload): string {
  return JSON.stringify([
    payload.objectiveId,
    payload.objectiveRevision,
    payload.workItemId,
    payload.workItemRevision,
    payload.ownerPeerId,
    payload.ownerEpoch,
    payload.awardId,
    payload.assignmentEpoch,
  ]);
}
function recordMessageId(
  state: MeshAllocationRuntimeState,
  id: string | undefined,
): string | undefined {
  return id === undefined
    ? undefined
    : state.allocation.executionRecords[id]?.envelope.messageId;
}
function compare(left: string, right: string): number {
  const result = compareMeshTimestamps(left, right);
  if (!result.ok) throw new TypeError("Invalid execution timestamp");
  return result.value;
}
function typeFor(payload: MeshExecutionPayload): MeshExecutionRecordType {
  return payload.type.slice("work.".length) as MeshExecutionRecordType;
}
function idFor(payload: MeshExecutionPayload): string {
  switch (payload.type) {
    case "work.progress":
      return payload.progressId;
    case "work.checkpoint":
      return payload.checkpointId;
    case "work.result":
      return payload.resultId;
    case "work.release":
      return payload.releaseId;
    case "work.cancel":
      return payload.cancellationId;
  }
}
function isExecutionPayload(payload: unknown): payload is MeshExecutionPayload {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    [
      "work.progress",
      "work.checkpoint",
      "work.result",
      "work.release",
      "work.cancel",
    ].includes((payload as { type?: unknown }).type as string),
  );
}
function sameAuthority(
  head: MeshExecutionHeadProjection,
  authority: ExecutionAuthority,
): boolean {
  return (
    executionScopeKey(head) === executionScopeKey(authority) &&
    head.fencingToken === authority.fencingToken &&
    head.acceptanceId === authority.acceptanceId &&
    head.acceptanceMessageId === authority.acceptanceMessageId &&
    head.leaseExpiresAtLogical === authority.leaseExpiresAtLogical &&
    head.workDeadlineAt === authority.workDeadlineAt
  );
}
function canonicalDigest(
  envelope: SignedMeshEnvelope<MeshExecutionPayload>,
): boolean {
  const canonical = canonicalizeMeshPayload(envelope.payload);
  return (
    canonical.ok &&
    envelope.payloadHash === `sha256:${sha256Base64Url(canonical.value)}`
  );
}
function digest(envelope: SignedMeshEnvelope<MeshExecutionPayload>): string {
  const canonical = canonicalizeMeshPayload(envelope.payload);
  if (!canonical.ok) throw new TypeError("Invalid execution payload");
  return sha256Base64Url(canonical.value);
}
function contextCode(code: string): MeshAllocationRejectionCode {
  return [
    "scope_mismatch",
    "message_expired",
    "message_from_future",
    "unknown_critical_extension",
  ].includes(code)
    ? (code as MeshAllocationRejectionCode)
    : "invalid_verified_envelope";
}
function sameData(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
function executionMessageAlreadyRetained(
  state: MeshAllocationRuntimeState,
  messageId: string,
): boolean {
  return (
    Object.values(state.coordination.domainRecords).some(
      (record) => record.messageId === messageId,
    ) ||
    Object.values(state.allocation.localOffers).some((offer) =>
      Object.values(offer.recipientOffers).some(
        (prepared) => prepared.messageId === messageId,
      ),
    ) ||
    Object.values(state.allocation.acceptedBidEvidence).some(
      (record) => record.envelope.messageId === messageId,
    ) ||
    Object.values(state.allocation.localAwards).some(
      (record) => record.recipientAward.messageId === messageId,
    ) ||
    Object.values(state.allocation.assignmentResponses).some(
      (record) => record.envelope.messageId === messageId,
    ) ||
    Object.values(state.allocation.receivedOffers).some(
      (record) => record.envelope.messageId === messageId,
    ) ||
    Object.values(state.allocation.localBids).some(
      (record) => record.envelope.messageId === messageId,
    ) ||
    Object.values(state.allocation.receivedAwards).some(
      (record) => record.envelope.messageId === messageId,
    ) ||
    Object.values(state.allocation.localAssignmentResponses).some(
      (record) => record.envelope.messageId === messageId,
    ) ||
    Object.values(state.allocation.executionRecords).some(
      (record) => record.envelope.messageId === messageId,
    )
  );
}
function acceptedDuplicate(
  state: MeshAllocationRuntimeState,
): MeshAllocationDecision {
  return Object.freeze({
    accepted: true,
    duplicate: true,
    state,
    effects: Object.freeze([]),
  });
}
function reject(
  state: MeshAllocationRuntimeState,
  code: MeshAllocationRejectionCode,
): MeshAllocationDecision {
  return Object.freeze({ accepted: false, code, state });
}

function assertExecutionRuntime(
  state: MeshAllocationRuntimeState,
  time: number,
): void {
  createMeshAllocationRuntimeState(
    state.coordination,
    state.discovery,
    state.objectives,
    state.allocation,
  );
  assertMeshLogicalTime(time);
  if (
    time < state.coordination.lastLogicalTime ||
    time < state.discovery.lastLogicalTime ||
    time < state.objectives.lastLogicalTime ||
    time < state.allocation.lastLogicalTime
  )
    throw new RangeError("Mesh execution logical time cannot move backwards");
}
