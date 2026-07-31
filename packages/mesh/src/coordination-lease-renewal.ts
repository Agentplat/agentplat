import {
  canonicalizeMeshPayload,
  compareMeshTimestamps,
  validateMeshEnvelopeContext,
  validateSignedMeshEnvelope,
  type LeaseRenewPayload,
  type SignedMeshEnvelope,
} from "@agentplat/mesh-protocol";

import type {
  MeshAllocationDecision,
  MeshAllocationEffect,
  MeshAllocationRuntimeState,
  MeshAllocationTimerDecision,
  MeshAllocationTimerInput,
  MeshLeaseHeadProjection,
  MeshLeaseRenewalEvidence,
  MeshLocalLeaseRenewalCommand,
  MeshVerifiedAllocationRequest,
} from "./coordination-allocation-contracts.js";
import {
  createMeshAllocationRuntimeState,
  restoreMeshAllocationState,
} from "./coordination-allocation-state.js";
import { logicalDeadline } from "./coordination-objective-work-time.js";
import { sha256Base64Url } from "./sha256.js";
import { createFrozenRecord, recordEntries } from "./state.js";

type Authority = Omit<
  MeshLeaseHeadProjection,
  | "executionScopeKey"
  | "originalLeaseExpiresAt"
  | "originalLeaseExpiresAtLogical"
  | "leaseRenewalSequence"
  | "latestLeaseRenewalId"
  | "currentLeaseExpiresAt"
  | "currentLeaseExpiresAtLogical"
  | "status"
  | "expiryTimerId"
  | "expiryTimerGeneration"
> & { readonly leaseExpiresAt: string; readonly leaseExpiresAtLogical: number };

/** Applies a locally signed assignee lease extension before it is dispatched. */
export function evaluateMeshLeaseRenewalCommand(
  state: MeshAllocationRuntimeState,
  command: MeshLocalLeaseRenewalCommand,
  verifiedAt: string,
  receivedAt: number,
): MeshAllocationDecision {
  if (
    !command ||
    typeof command !== "object" ||
    Object.keys(command).sort().join(",") !== "envelope,kind,preparedAt" ||
    command.kind !== "allocation.lease_renew" ||
    !Number.isSafeInteger(command.preparedAt) ||
    command.preparedAt < 0 ||
    command.preparedAt > receivedAt
  )
    throw new TypeError("Invalid Mesh lease renewal command");
  const parsed = validateSignedMeshEnvelope(command.envelope);
  if (!parsed.ok || parsed.value.payload.type !== "lease.renew")
    return reject(state, "lease_renewal_invalid");
  return applyRenewal(
    state,
    parsed.value as SignedMeshEnvelope<LeaseRenewPayload>,
    verifiedAt,
    receivedAt,
    "local",
  );
}

/** Applies one authenticated remote assignee lease extension. */
export function evaluateVerifiedMeshLeaseRenewalEnvelope(
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
    throw new TypeError("Invalid Mesh verified lease renewal request");
  if (request.envelope.payload.type !== "lease.renew")
    return reject(state, "lease_renewal_invalid");
  return applyRenewal(
    state,
    request.envelope as SignedMeshEnvelope<LeaseRenewPayload>,
    request.verifiedAt,
    request.receivedAt,
    "received",
    request.supportedCriticalExtensions,
  );
}

function applyRenewal(
  state: MeshAllocationRuntimeState,
  envelope: SignedMeshEnvelope<LeaseRenewPayload>,
  verifiedAt: string,
  acceptedAt: number,
  direction: "local" | "received",
  supportedCriticalExtensions?: readonly string[],
): MeshAllocationDecision {
  const payload = envelope.payload;
  const existing = state.allocation.leaseRenewals[payload.leaseRenewalId];
  if (existing)
    return sameData(existing.envelope, envelope) &&
      existing.direction === direction
      ? acceptedDuplicate(state)
      : reject(state, "lease_renewal_duplicate_conflict");
  const recordKey = domainKey(payload.leaseRenewalId);
  if (state.coordination.domainRecords[recordKey])
    return reject(state, "domain_record_conflict");
  if (messageIdRetained(state, envelope.messageId))
    return reject(state, "lease_renewal_duplicate_conflict");
  const context = validateMeshEnvelopeContext(envelope, {
    tenantId: state.allocation.identity.tenantId,
    meshId: state.allocation.identity.meshId,
    peerId:
      direction === "local"
        ? payload.ownerPeerId
        : state.allocation.identity.peerId,
    receivedAt: verifiedAt,
    ...(supportedCriticalExtensions === undefined
      ? {}
      : { supportedCriticalExtensions }),
  });
  if (!context.ok || !canonicalDigest(envelope))
    return reject(state, "lease_renewal_invalid");
  const authority = resolveAuthority(state, payload.awardId);
  if (!authority || !sameAuthority(payload, authority))
    return reject(state, "lease_renewal_authority_invalid");
  const scope = scopeKey(authority);
  const prior = state.allocation.leaseHeads[scope];
  if (prior?.status !== "active")
    return reject(state, "lease_renewal_authority_invalid");
  const currentExpiry = prior.currentLeaseExpiresAt;
  const currentExpiryLogical = prior.currentLeaseExpiresAtLogical;
  const objective = state.objectives.objectives[payload.objectiveId];
  const work =
    state.objectives.workItems[
      JSON.stringify([payload.objectiveId, payload.workItemId])
    ];
  const renewedLogical = logicalDeadline(
    payload.renewedLeaseExpiresAt,
    currentExpiry,
    currentExpiryLogical,
  );
  if (
    (direction === "local" &&
      (envelope.sender.peerId !== state.allocation.identity.peerId ||
        envelope.sender.instanceId !== state.allocation.identity.instanceId ||
        envelope.proof.keyId !== state.allocation.identity.keyId)) ||
    envelope.sender.peerId !== authority.assigneePeerId ||
    envelope.audience.kind !== "peer" ||
    envelope.audience.peerId !== authority.ownerPeerId ||
    payload.leaseExpiresAt !== currentExpiry ||
    !objective ||
    objective.status !== "active" ||
    objective.objectiveRevision !== authority.objectiveRevision ||
    objective.objectiveDocumentId !== authority.objectiveDocumentId ||
    (direction === "received" &&
      (!work ||
        work.workItemRevision !== authority.workItemRevision ||
        work.status !== "ready"))
  )
    return reject(state, "lease_renewal_authority_invalid");
  if (
    payload.leaseRenewalSequence > objective.maximumLeaseRenewals ||
    payload.leaseRenewalSequence >
      state.allocation.limits.maximumLeaseRenewals ||
    payload.leaseRenewalSequence !== prior.leaseRenewalSequence + 1 ||
    payload.previousLeaseRenewalId !== prior.latestLeaseRenewalId ||
    envelope.causationId !==
      (prior.latestLeaseRenewalId === undefined
        ? authority.acceptanceMessageId
        : state.allocation.leaseRenewals[prior.latestLeaseRenewalId]?.envelope
            .messageId)
  )
    return reject(state, "lease_renewal_predecessor_invalid");
  if (
    acceptedAt >= currentExpiryLogical ||
    acceptedAt >= authority.workDeadlineAt ||
    compare(verifiedAt, currentExpiry) >= 0 ||
    compare(verifiedAt, authority.workDeadline) >= 0 ||
    renewedLogical === undefined ||
    renewedLogical <= currentExpiryLogical ||
    renewedLogical - currentExpiryLogical > objective.maximumLeaseDurationMs ||
    renewedLogical > authority.workDeadlineAt ||
    renewedLogical > objective.expiresAt ||
    compare(payload.renewedLeaseExpiresAt, authority.workDeadline) > 0 ||
    compare(payload.renewedLeaseExpiresAt, objective.validUntil) > 0
  )
    return reject(state, "lease_renewal_deadline_elapsed");
  if (
    Object.keys(state.allocation.leaseRenewals).length >=
      state.allocation.limits.maximumLeaseRenewals ||
    Object.keys(state.coordination.domainRecords).length >=
      state.coordination.limits.maximumDomainRecords
  )
    return reject(state, "lease_renewal_capacity_exceeded");
  if (
    state.coordination.journal.length >=
    state.coordination.limits.maximumJournalEntries
  )
    return reject(state, "journal_capacity_exceeded");
  if (state.coordination.localEventSequence >= Number.MAX_SAFE_INTEGER)
    throw new RangeError("Mesh coordination event sequence exhausted");
  const timerId = leaseTimerId(scope);
  const oldTimer =
    prior?.expiryTimerId === undefined
      ? undefined
      : state.coordination.timers[prior.expiryTimerId];
  if (!oldTimer && state.coordination.timers[timerId] !== undefined)
    return reject(state, "timer_id_conflict");
  const generation = (oldTimer?.generation ?? 0) + 1;
  if (generation > Number.MAX_SAFE_INTEGER)
    return reject(state, "timer_generation_exhausted");
  if (
    !oldTimer &&
    Object.keys(state.coordination.timers).length >=
      state.coordination.limits.maximumTimers
  )
    return reject(state, "timer_capacity_exceeded");
  const evidence: MeshLeaseRenewalEvidence = Object.freeze({
    leaseRenewalId: payload.leaseRenewalId,
    executionScopeKey: scope,
    leaseRenewalSequence: payload.leaseRenewalSequence,
    ...(payload.previousLeaseRenewalId === undefined
      ? {}
      : { previousLeaseRenewalId: payload.previousLeaseRenewalId }),
    acceptedAt,
    validityVerifiedAt: verifiedAt,
    direction,
    ...(supportedCriticalExtensions === undefined
      ? {}
      : {
          supportedCriticalExtensions: Object.freeze([
            ...supportedCriticalExtensions,
          ]),
        }),
    renewedLeaseExpiresAtLogical: renewedLogical,
    envelope,
  });
  const {
    leaseExpiresAt: _acceptedLeaseExpiresAt,
    leaseExpiresAtLogical: _acceptedLeaseExpiresAtLogical,
    ...headAuthority
  } = authority;
  const head: MeshLeaseHeadProjection = Object.freeze({
    ...headAuthority,
    executionScopeKey: scope,
    originalLeaseExpiresAt: prior.originalLeaseExpiresAt,
    originalLeaseExpiresAtLogical: prior.originalLeaseExpiresAtLogical,
    leaseRenewalSequence: payload.leaseRenewalSequence,
    latestLeaseRenewalId: payload.leaseRenewalId,
    currentLeaseExpiresAt: payload.renewedLeaseExpiresAt,
    currentLeaseExpiresAtLogical: renewedLogical,
    status: "active",
    expiryTimerId: timerId,
    expiryTimerGeneration: generation,
  });
  const execution = state.allocation.executionHeads[scope];
  const allocation = restoreMeshAllocationState({
    ...state.allocation,
    leaseRenewals: createFrozenRecord([
      ...recordEntries(state.allocation.leaseRenewals),
      [payload.leaseRenewalId, evidence],
    ]),
    leaseHeads: createFrozenRecord([
      ...recordEntries(state.allocation.leaseHeads).filter(
        ([key]) => key !== scope,
      ),
      [scope, head],
    ]),
    ...(execution === undefined
      ? {}
      : {
          executionHeads: createFrozenRecord([
            ...recordEntries(state.allocation.executionHeads).filter(
              ([key]) => key !== scope,
            ),
            [
              scope,
              Object.freeze({
                ...execution,
                leaseExpiresAt: head.currentLeaseExpiresAt,
                leaseExpiresAtLogical: head.currentLeaseExpiresAtLogical,
              }),
            ],
          ]),
        }),
    lastLogicalTime: acceptedAt,
  });
  const sequence = state.coordination.localEventSequence + 1;
  const coordination = Object.freeze({
    ...state.coordination,
    timers: createFrozenRecord([
      ...recordEntries(state.coordination.timers).filter(
        ([key]) => key !== timerId,
      ),
      [
        timerId,
        Object.freeze({
          timerId,
          kind: "lease.expiry" as const,
          dueAt: renewedLogical,
          generation,
          domainRecordKey: recordKey,
        }),
      ],
    ]),
    domainRecords: createFrozenRecord([
      ...recordEntries(state.coordination.domainRecords),
      [
        recordKey,
        Object.freeze({
          recordKey,
          recordType: "lease.renew" as const,
          recordId: payload.leaseRenewalId,
          contentDigest: envelope.payloadHash.slice("sha256:".length),
          messageId: envelope.messageId,
          acceptedAt,
          objectiveId: payload.objectiveId,
        }),
      ],
    ]),
    journal: Object.freeze([
      ...state.coordination.journal,
      Object.freeze({
        sequence,
        occurredAt: acceptedAt,
        kind:
          direction === "local"
            ? ("command.accepted" as const)
            : ("domain.accepted" as const),
        domainRecordKey: recordKey,
      }),
    ]),
    localEventSequence: sequence,
    lastLogicalTime: acceptedAt,
  });
  const next = createMeshAllocationRuntimeState(
    coordination,
    Object.freeze({ ...state.discovery, lastLogicalTime: acceptedAt }),
    Object.freeze({ ...state.objectives, lastLogicalTime: acceptedAt }),
    allocation,
  );
  const effect: MeshAllocationEffect | undefined =
    direction === "local"
      ? Object.freeze({
          kind: "allocation.lease_renewal.dispatch" as const,
          leaseRenewalId: payload.leaseRenewalId,
          recipientPeerId: authority.ownerPeerId,
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

/** Consumes only a due, generation-matching lease expiry timer. */
export function evaluateMeshLeaseExpiryTimer(
  state: MeshAllocationRuntimeState,
  input: MeshAllocationTimerInput,
  receivedAt: number,
): MeshAllocationTimerDecision {
  if (
    !input ||
    input.kind !== "timer.fired" ||
    !Number.isSafeInteger(receivedAt) ||
    receivedAt < 0
  )
    throw new TypeError("Invalid Mesh lease expiry timer input");
  const timer = state.coordination.timers[input.timerId];
  if (!timer || timer.kind !== "lease.expiry")
    return Object.freeze({ accepted: false, code: "timer_unknown", state });
  if (timer.generation !== input.generation)
    return Object.freeze({
      accepted: false,
      code: "timer_generation_stale",
      state,
    });
  if (receivedAt < timer.dueAt)
    return Object.freeze({ accepted: false, code: "timer_not_due", state });
  if (
    state.coordination.journal.length >=
    state.coordination.limits.maximumJournalEntries
  )
    return Object.freeze({
      accepted: false,
      code: "journal_capacity_exceeded",
      state,
    });
  if (state.coordination.localEventSequence >= Number.MAX_SAFE_INTEGER)
    throw new RangeError("Mesh coordination event sequence exhausted");
  const entry = Object.entries(state.allocation.leaseHeads).find(
    ([, head]) =>
      head.expiryTimerId === timer.timerId &&
      head.expiryTimerGeneration === timer.generation,
  );
  if (!entry)
    return Object.freeze({ accepted: false, code: "timer_unknown", state });
  const [scope, head] = entry;
  if (
    head.status !== "active" ||
    head.currentLeaseExpiresAtLogical !== timer.dueAt
  )
    return Object.freeze({
      accepted: false,
      code: "timer_generation_stale",
      state,
    });
  const {
    expiryTimerId: _expiryTimerId,
    expiryTimerGeneration: _expiryTimerGeneration,
    ...expiredHead
  } = head;
  const allocation = restoreMeshAllocationState({
    ...state.allocation,
    leaseHeads: createFrozenRecord([
      ...recordEntries(state.allocation.leaseHeads).filter(
        ([key]) => key !== scope,
      ),
      [
        scope,
        Object.freeze({
          ...expiredHead,
          status: "expired" as const,
        }),
      ],
    ]),
    lastLogicalTime: receivedAt,
  });
  const sequence = state.coordination.localEventSequence + 1;
  const coordination = Object.freeze({
    ...state.coordination,
    timers: createFrozenRecord(
      recordEntries(state.coordination.timers).filter(
        ([key]) => key !== timer.timerId,
      ),
    ),
    journal: Object.freeze([
      ...state.coordination.journal,
      Object.freeze({
        sequence,
        occurredAt: receivedAt,
        kind: "timer.fired" as const,
        timerId: timer.timerId,
        domainRecordKey: timer.domainRecordKey,
      }),
    ]),
    localEventSequence: sequence,
    lastLogicalTime: receivedAt,
  });
  return Object.freeze({
    accepted: true,
    timer,
    state: createMeshAllocationRuntimeState(
      coordination,
      Object.freeze({ ...state.discovery, lastLogicalTime: receivedAt }),
      Object.freeze({ ...state.objectives, lastLogicalTime: receivedAt }),
      allocation,
    ),
  });
}

function resolveAuthority(
  state: MeshAllocationRuntimeState,
  awardId: string,
): Authority | undefined {
  const award = state.allocation.localAwards[awardId];
  const response = state.allocation.assignmentResponses[awardId];
  const reservation =
    award && state.allocation.reservations[award.reservationId];
  if (
    award &&
    response?.kind === "work.accept" &&
    reservation?.status === "committed" &&
    award.status === "accepted"
  )
    return Object.freeze({
      objectiveId: award.objectiveId,
      objectiveDocumentId: award.objectiveDocumentId,
      objectiveRevision: award.objectiveRevision,
      workItemId: award.work.workItemId,
      workItemRevision: award.work.workItemRevision,
      ownerPeerId: award.work.ownerPeerId,
      ownerEpoch: award.work.ownerEpoch,
      assigneePeerId: award.assigneePeerId,
      awardId,
      assignmentEpoch: award.assignmentEpoch,
      assignmentAuthorityId: award.assignmentAuthorityId,
      fencingToken: award.fencingToken,
      acceptanceId: response.responseId,
      acceptanceMessageId: response.envelope.messageId,
      workDeadline: award.workDeadline,
      workDeadlineAt: award.work.workDeadlineAt,
      leaseExpiresAt: award.leaseExpiresAt,
      leaseExpiresAtLogical: award.leaseExpiresAtLogical,
    });
  const local = state.allocation.assigneeAuthorities[awardId];
  const localResponse = state.allocation.localAssignmentResponses[awardId];
  if (local && localResponse?.kind === "work.accept")
    return Object.freeze({
      objectiveId: local.objectiveId,
      objectiveDocumentId: local.objectiveDocumentId,
      objectiveRevision: local.objectiveRevision,
      workItemId: local.workItemId,
      workItemRevision: local.workItemRevision,
      ownerPeerId: local.ownerPeerId,
      ownerEpoch: local.ownerEpoch,
      assigneePeerId: local.assigneePeerId,
      awardId: local.awardId,
      assignmentEpoch: local.assignmentEpoch,
      assignmentAuthorityId: local.assignmentAuthorityId,
      fencingToken: local.fencingToken,
      acceptanceId: local.acceptanceId,
      acceptanceMessageId: localResponse.envelope.messageId,
      workDeadline: local.workDeadline,
      workDeadlineAt: local.workDeadlineAt,
      leaseExpiresAt: local.leaseExpiresAt,
      leaseExpiresAtLogical: local.leaseExpiresAtLogical,
    });
  return undefined;
}
function sameAuthority(
  payload: LeaseRenewPayload,
  authority: Authority,
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
    payload.acceptanceId === authority.acceptanceId
  );
}
function scopeKey(
  authority: Pick<
    Authority,
    | "objectiveId"
    | "objectiveRevision"
    | "workItemId"
    | "workItemRevision"
    | "ownerPeerId"
    | "ownerEpoch"
    | "awardId"
    | "assignmentEpoch"
  >,
): string {
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
function leaseTimerId(scope: string): string {
  return `lease.expiry:${sha256Base64Url(new TextEncoder().encode(scope))}`;
}
function domainKey(id: string): string {
  return JSON.stringify(["lease.renew", id]);
}
function compare(left: string, right: string): number {
  const result = compareMeshTimestamps(left, right);
  if (!result.ok) throw new TypeError("Invalid lease timestamp");
  return result.value;
}
function canonicalDigest(
  envelope: SignedMeshEnvelope<LeaseRenewPayload>,
): boolean {
  const canonical = canonicalizeMeshPayload(envelope.payload);
  return (
    canonical.ok &&
    envelope.payloadHash === `sha256:${sha256Base64Url(canonical.value)}`
  );
}
function sameData(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
function messageIdRetained(
  state: MeshAllocationRuntimeState,
  messageId: string,
): boolean {
  return (
    Object.values(state.coordination.domainRecords).some(
      (record) => record.messageId === messageId,
    ) ||
    Object.values(state.allocation.executionRecords).some(
      (record) => record.envelope.messageId === messageId,
    ) ||
    Object.values(state.allocation.leaseRenewals).some(
      (renewal) => renewal.envelope.messageId === messageId,
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
    )
  );
}
function reject(
  state: MeshAllocationRuntimeState,
  code: Exclude<MeshAllocationDecision, { readonly accepted: true }>["code"],
): MeshAllocationDecision {
  return Object.freeze({ accepted: false, code, state });
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
