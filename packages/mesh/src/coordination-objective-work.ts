import {
  compareMeshTimestamps,
  validateSignedMeshEnvelope,
  validateMeshEnvelopeContext,
  type ObjectiveAnnouncePayload,
  type ObjectiveCancelPayload,
  type ObjectiveRevisePayload,
  type VerifiedMeshEnvelope,
} from "@agentplat/mesh-protocol";

import type {
  MeshCoordinationDomainRecord,
  MeshCoordinationJournalEntry,
  MeshCoordinationState,
  MeshCoordinationTimer,
} from "./coordination-contracts.js";
import type {
  MeshAcceptedObjectiveCancellation,
  MeshAcceptedObjectiveDocument,
  MeshObjectivePayload,
  MeshObjectiveProjection,
  MeshObjectiveWorkCommand,
  MeshObjectiveWorkDecision,
  MeshObjectiveWorkRejectionCode,
  MeshObjectiveWorkRuntimeState,
  MeshObjectiveWorkState,
  MeshObjectiveWorkTimerDecision,
  MeshObjectiveWorkTimerInput,
  MeshObjectiveWorkTrustedTime,
  MeshVerifiedObjectiveRequest,
  MeshWorkObjectivePolicySnapshot,
  MeshWorkItemProjection,
} from "./coordination-objective-work-contracts.js";
import {
  assertFrozenMeshObjectiveWorkState,
  createMeshObjectiveWorkState,
} from "./coordination-objective-work-state.js";
import {
  logicalDeadline,
  logicalExpiry,
} from "./coordination-objective-work-time.js";
import { assertFrozenMeshCoordinationState } from "./coordination-state.js";
import {
  assertFrozenMeshDiscoveryState,
  createMeshDiscoveryRuntimeState,
} from "./coordination-discovery-state.js";
import {
  assertMeshLogicalTime,
  createFrozenRecord,
  recordEntries,
} from "./state.js";

const digestPattern = /^[A-Za-z0-9_-]{43}$/;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/;
const maximumTimerIdentifierBytes = 768;
const utf8Encoder = new TextEncoder();

/** Composes Objective/Work state with the existing aligned core projections. */
export function createMeshObjectiveWorkRuntimeState(
  coordination: MeshCoordinationState,
  discovery: MeshObjectiveWorkRuntimeState["discovery"],
  objectives: MeshObjectiveWorkState,
): MeshObjectiveWorkRuntimeState {
  createMeshDiscoveryRuntimeState(coordination, discovery);
  assertFrozenMeshObjectiveWorkState(objectives);
  if (
    !sameIdentity(coordination.identity, objectives.identity) ||
    coordination.lastLogicalTime !== objectives.lastLogicalTime
  ) {
    throw new TypeError(
      "Mesh Objective/Work runtime snapshots are not aligned",
    );
  }
  for (const policy of Object.values(objectives.objectivePolicies)) {
    const record =
      coordination.domainRecords[objectivePolicyDomainRecordKey(policy)];
    if (
      !record ||
      record.recordId !== policy.objectiveDocumentId ||
      record.objectiveId !== policy.objectiveId ||
      record.messageId !== policy.acceptedMessageId ||
      record.acceptedAt !== policy.acceptedAt
    ) {
      throw new TypeError("Mesh Objective policy domain record is missing");
    }
  }
  for (const document of Object.values(objectives.objectiveDocuments)) {
    const envelope = document.envelope;
    const payload = envelope.payload;
    const record =
      coordination.domainRecords[objectiveDocumentDomainRecordKey(document)];
    if (
      !record ||
      record.recordId !== payload.objectiveDocumentId ||
      record.objectiveId !== payload.objectiveId ||
      record.messageId !== envelope.messageId ||
      record.acceptedAt !== document.acceptedAt ||
      record.contentDigest !== envelope.payloadHash.slice(7)
    ) {
      throw new TypeError("Mesh accepted Objective document record is missing");
    }
  }
  for (const objective of Object.values(objectives.objectives)) {
    const record =
      coordination.domainRecords[objectiveDomainRecordKey(objective)];
    if (
      !record ||
      record.recordId !== objective.objectiveDocumentId ||
      record.objectiveId !== objective.objectiveId ||
      record.messageId !== objective.acceptedMessageId ||
      record.acceptedAt !== objective.acceptedAt
    ) {
      throw new TypeError("Mesh Objective current domain record is missing");
    }
    if (objective.status === "active") {
      const timer = coordination.timers[objective.expiryTimerId as string];
      if (
        !timer ||
        timer.kind !== "objective.expiry" ||
        timer.generation !== objective.expiryTimerGeneration ||
        timer.dueAt !== objective.expiresAt ||
        timer.domainRecordKey !== record.recordKey
      ) {
        throw new TypeError("Mesh Objective expiry timer binding is invalid");
      }
    }
    if (objective.status === "cancelled") {
      const terminal =
        coordination.domainRecords[objective.terminalRecordKey as string];
      const cancellation = objective.terminalCancellation;
      if (
        !cancellation ||
        !terminal ||
        terminal.recordType !== "objective.cancel" ||
        terminal.objectiveId !== objective.objectiveId ||
        terminal.recordKey !== objective.terminalRecordKey ||
        terminal.recordId !== cancellation.envelope.payload.cancellationId ||
        terminal.messageId !== cancellation.envelope.messageId ||
        terminal.contentDigest !== cancellation.envelope.payloadHash.slice(7) ||
        terminal.acceptedAt !== objective.terminalAt
      ) {
        throw new TypeError("Mesh Objective cancellation binding is invalid");
      }
    }
  }
  const expectedManagedTimerIds = new Set<string>();
  for (const objective of Object.values(objectives.objectives)) {
    if (objective.status === "active") {
      expectedManagedTimerIds.add(objective.expiryTimerId as string);
    }
  }
  for (const workItem of Object.values(objectives.workItems)) {
    const boundObjectiveRecordKey = workObjectiveDomainRecordKey(workItem);
    const boundObjectiveRecord =
      coordination.domainRecords[boundObjectiveRecordKey];
    if (
      !boundObjectiveRecord ||
      boundObjectiveRecord.recordId !== workItem.objectiveDocumentId ||
      boundObjectiveRecord.objectiveId !== workItem.objectiveId ||
      boundObjectiveRecord.messageId !==
        workItem.objectivePolicy.acceptedMessageId ||
      boundObjectiveRecord.acceptedAt !== workItem.objectivePolicy.acceptedAt
    ) {
      throw new TypeError("Mesh Work Item Objective binding is invalid");
    }
    if (workItem.status !== "ready") continue;
    expectedManagedTimerIds.add(workItem.expiryTimerId as string);
    const timer = coordination.timers[workItem.expiryTimerId as string];
    if (
      !timer ||
      timer.kind !== "work.deadline" ||
      timer.generation !== workItem.expiryTimerGeneration ||
      timer.dueAt !== workItem.workDeadlineAt ||
      timer.domainRecordKey !== boundObjectiveRecordKey
    )
      throw new TypeError("Mesh Work Item deadline timer binding is invalid");
  }
  if (
    Object.values(coordination.timers).some(
      (timer) =>
        (timer.kind === "objective.expiry" || timer.kind === "work.deadline") &&
        !expectedManagedTimerIds.has(timer.timerId),
    )
  ) {
    throw new TypeError("Mesh Objective/Work runtime has an orphan timer");
  }
  return Object.freeze({ coordination, discovery, objectives });
}

/** Applies one already-verified Objective envelope with no key or network I/O. */
export function evaluateVerifiedMeshObjectiveEnvelope(
  state: MeshObjectiveWorkRuntimeState,
  request: MeshVerifiedObjectiveRequest,
): MeshObjectiveWorkDecision {
  assertRuntimeState(state);
  assertObjectiveRequest(request);
  assertMonotonic(state, request.receivedAt);
  const contextFailure = validateContext(state, request);
  if (contextFailure) return reject(state, contextFailure);
  const envelope = request.envelope;
  const issuer = state.objectives.issuerAuthorities[envelope.sender.peerId];
  if (!issuer) {
    return reject(state, "issuer_not_authorized");
  }
  if (!issuer.keyIds.includes(envelope.proof.keyId))
    return reject(state, "issuer_key_not_authorized");
  if (compare(request.verifiedAt, issuer.validUntil) >= 0) {
    return reject(state, "issuer_authority_expired");
  }
  if (envelope.payload.type === "objective.cancel") {
    const current = state.objectives.objectives[envelope.payload.objectiveId];
    if (!current || current.issuerPeerId !== envelope.sender.peerId) {
      return reject(state, "issuer_not_authorized");
    }
  }
  const metadata = domainMetadata(envelope);
  const existing = state.coordination.domainRecords[metadata.recordKey];
  if (existing) {
    return existing.contentDigest === metadata.contentDigest &&
      existing.objectiveId === envelope.payload.objectiveId &&
      existing.messageId === envelope.messageId
      ? Object.freeze({ accepted: true, duplicate: true, state })
      : reject(state, "domain_record_conflict");
  }
  if (
    Object.values(state.coordination.domainRecords).some(
      (record) => record.messageId === envelope.messageId,
    )
  ) {
    return reject(state, "domain_record_conflict");
  }
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

  const evaluated = evaluateObjectivePayload(
    state,
    request,
    metadata.recordKey,
  );
  if ("code" in evaluated) return reject(state, evaluated.code);
  if (state.coordination.localEventSequence >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Mesh coordination event sequence exhausted");
  }
  if (
    evaluated.timer &&
    Object.hasOwn(state.coordination.timers, evaluated.timer.timerId) &&
    evaluated.removeTimerId !== evaluated.timer.timerId
  ) {
    return reject(state, "timer_id_conflict");
  }
  if (
    evaluated.timer &&
    !Object.hasOwn(state.coordination.timers, evaluated.timer.timerId) &&
    Object.keys(state.coordination.timers).length >=
      state.coordination.limits.maximumTimers
  ) {
    return reject(state, "timer_capacity_exceeded");
  }
  const sequence = state.coordination.localEventSequence + 1;
  const record = Object.freeze<MeshCoordinationDomainRecord>({
    recordKey: metadata.recordKey,
    recordType: envelope.payload.type,
    recordId: metadata.recordId,
    contentDigest: metadata.contentDigest,
    messageId: envelope.messageId,
    acceptedAt: request.receivedAt,
    objectiveId: envelope.payload.objectiveId,
  });
  const journal = Object.freeze<MeshCoordinationJournalEntry>({
    sequence,
    occurredAt: request.receivedAt,
    kind: "domain.accepted",
    domainRecordKey: record.recordKey,
  });
  const coordination = Object.freeze({
    ...state.coordination,
    domainRecords: createFrozenRecord([
      ...recordEntries(state.coordination.domainRecords),
      [record.recordKey, record],
    ]),
    timers: evaluated.timer
      ? createFrozenRecord([
          ...recordEntries(state.coordination.timers).filter(
            ([timerId]) =>
              timerId !== evaluated.timer?.timerId &&
              timerId !== evaluated.removeTimerId,
          ),
          [evaluated.timer.timerId, evaluated.timer],
        ])
      : evaluated.removeTimerId
        ? createFrozenRecord(
            recordEntries(state.coordination.timers).filter(
              ([timerId]) => timerId !== evaluated.removeTimerId,
            ),
          )
        : state.coordination.timers,
    journal: Object.freeze([...state.coordination.journal, journal]),
    localEventSequence: sequence,
    lastLogicalTime: request.receivedAt,
  });
  const objectives = Object.freeze({
    ...state.objectives,
    objectives: createFrozenRecord(evaluated.objectives),
    objectiveDocuments:
      evaluated.document === undefined
        ? state.objectives.objectiveDocuments
        : createFrozenRecord([
            ...recordEntries(state.objectives.objectiveDocuments),
            [
              objectivePolicyKey(
                evaluated.document.envelope.payload.objectiveId,
                evaluated.document.envelope.payload.objectiveRevision,
              ),
              evaluated.document,
            ],
          ]),
    objectivePolicies:
      evaluated.policy === undefined
        ? state.objectives.objectivePolicies
        : createFrozenRecord([
            ...recordEntries(state.objectives.objectivePolicies),
            [
              objectivePolicyKey(
                evaluated.policy.objectiveId,
                evaluated.policy.objectiveRevision,
              ),
              evaluated.policy,
            ],
          ]),
    lastLogicalTime: request.receivedAt,
  });
  return Object.freeze({
    accepted: true,
    duplicate: false,
    state: createMeshObjectiveWorkRuntimeState(
      coordination,
      Object.freeze({
        ...state.discovery,
        lastLogicalTime: request.receivedAt,
      }),
      objectives,
    ),
  });
}

/** Consumes exactly one generation-fenced Objective or Work deadline timer. */
export function evaluateMeshObjectiveWorkTimer(
  state: MeshObjectiveWorkRuntimeState,
  input: MeshObjectiveWorkTimerInput,
  logicalTime: number,
): MeshObjectiveWorkTimerDecision {
  assertRuntimeState(state);
  assertMeshLogicalTime(logicalTime);
  assertMonotonic(state, logicalTime);
  if (
    !isPlainDataRecord(input) ||
    Object.keys(input).length !== 3 ||
    Object.keys(input).some(
      (key) => !["kind", "timerId", "generation"].includes(key),
    ) ||
    input.kind !== "timer.fired" ||
    typeof input.timerId !== "string" ||
    !identifierPattern.test(input.timerId) ||
    utf8Encoder.encode(input.timerId).byteLength >
      maximumTimerIdentifierBytes ||
    !Number.isSafeInteger(input.generation) ||
    input.generation < 1
  ) {
    throw new TypeError("Invalid Mesh Objective/Work timer input");
  }
  const timer = state.coordination.timers[input.timerId];
  if (!timer) return timerRejection(state, "timer_unknown");
  if (timer.generation !== input.generation) {
    return timerRejection(state, "timer_generation_stale");
  }
  if (logicalTime < timer.dueAt) return timerRejection(state, "timer_not_due");
  if (
    state.coordination.journal.length >=
    state.coordination.limits.maximumJournalEntries
  ) {
    return timerRejection(state, "journal_capacity_exceeded");
  }
  if (state.coordination.localEventSequence >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Mesh coordination event sequence exhausted");
  }
  const objective = Object.values(state.objectives.objectives).find(
    (entry) =>
      entry.status === "active" && entry.expiryTimerId === timer.timerId,
  );
  const workItem = Object.values(state.objectives.workItems).find(
    (entry) =>
      entry.status === "ready" && entry.expiryTimerId === timer.timerId,
  );
  if (
    (timer.kind === "objective.expiry" &&
      (!objective || objective.expiryTimerGeneration !== timer.generation)) ||
    (timer.kind === "work.deadline" &&
      (!workItem || workItem.expiryTimerGeneration !== timer.generation)) ||
    (timer.kind !== "objective.expiry" && timer.kind !== "work.deadline")
  ) {
    throw new TypeError("Mesh Objective/Work timer binding is invalid");
  }
  const journal = Object.freeze<MeshCoordinationJournalEntry>({
    sequence: state.coordination.localEventSequence + 1,
    occurredAt: logicalTime,
    kind: "timer.fired",
    domainRecordKey: timer.domainRecordKey,
    timerId: timer.timerId,
  });
  const coordination = Object.freeze({
    ...state.coordination,
    timers: createFrozenRecord(
      recordEntries(state.coordination.timers).filter(
        ([timerId]) => timerId !== timer.timerId,
      ),
    ),
    journal: Object.freeze([...state.coordination.journal, journal]),
    localEventSequence: state.coordination.localEventSequence + 1,
    lastLogicalTime: logicalTime,
  });
  const objectives = Object.freeze({
    ...state.objectives,
    objectives: objective
      ? createFrozenRecord(
          recordEntries(state.objectives.objectives).map(([key, entry]) => [
            key,
            entry === objective
              ? freezeObjective({
                  ...entry,
                  status: "expired",
                  expiryTimerId: undefined,
                  expiryTimerGeneration: undefined,
                  terminalAt: logicalTime,
                })
              : entry,
          ]),
        )
      : state.objectives.objectives,
    workItems: workItem
      ? createFrozenRecord(
          recordEntries(state.objectives.workItems).map(([key, entry]) => [
            key,
            entry === workItem
              ? freezeWorkItem({
                  ...entry,
                  status: "expired",
                  expiryTimerId: undefined,
                  expiryTimerGeneration: undefined,
                  terminalAt: logicalTime,
                  updatedAt: logicalTime,
                })
              : entry,
          ]),
        )
      : state.objectives.workItems,
    lastLogicalTime: logicalTime,
  });
  return Object.freeze({
    accepted: true,
    timer,
    state: createMeshObjectiveWorkRuntimeState(
      coordination,
      Object.freeze({ ...state.discovery, lastLogicalTime: logicalTime }),
      objectives,
    ),
  });
}

/** Evaluates a local Work command using caller-injected trusted time only. */
export function evaluateMeshObjectiveWorkCommand(
  state: MeshObjectiveWorkRuntimeState,
  command: MeshObjectiveWorkCommand,
  time: MeshObjectiveWorkTrustedTime,
): MeshObjectiveWorkDecision {
  assertRuntimeState(state);
  assertTrustedTime(time);
  assertMonotonic(state, time.receivedAt);
  assertCommand(command);
  if (command.kind !== "work.cancel") {
    assertWorkInput(command.input, state.objectives);
  }
  if (
    state.coordination.journal.length >=
    state.coordination.limits.maximumJournalEntries
  )
    return reject(state, "journal_capacity_exceeded");
  if (state.coordination.localEventSequence >= Number.MAX_SAFE_INTEGER)
    throw new RangeError("Mesh coordination event sequence exhausted");
  const result =
    command.kind === "work.cancel"
      ? cancelWork(state, command, time)
      : upsertWork(state, command, time);
  if ("code" in result) return reject(state, result.code);
  if (
    result.workItem.status === "ready" &&
    Object.hasOwn(
      state.coordination.timers,
      result.workItem.expiryTimerId as string,
    ) &&
    result.previousTimerId !== result.workItem.expiryTimerId
  )
    return reject(state, "timer_id_conflict");
  const sequence = state.coordination.localEventSequence + 1;
  const journal = Object.freeze<MeshCoordinationJournalEntry>({
    sequence,
    occurredAt: time.receivedAt,
    kind: "command.accepted",
    domainRecordKey: objectiveDomainRecordKey(result.objective),
  });
  const nextTimers =
    result.workItem.status === "cancelled"
      ? recordEntries(state.coordination.timers).filter(
          ([timerId]) => timerId !== result.previousTimerId,
        )
      : [
          ...recordEntries(state.coordination.timers).filter(
            ([timerId]) => timerId !== result.previousTimerId,
          ),
          [
            result.workItem.expiryTimerId as string,
            Object.freeze<MeshCoordinationTimer>({
              timerId: result.workItem.expiryTimerId as string,
              kind: "work.deadline",
              dueAt: result.workItem.workDeadlineAt,
              generation: result.workItem.expiryTimerGeneration as number,
              domainRecordKey: objectiveDomainRecordKey(result.objective),
            }),
          ] as const,
        ];
  if (
    result.workItem.status === "ready" &&
    !Object.hasOwn(
      state.coordination.timers,
      result.workItem.expiryTimerId as string,
    ) &&
    Object.keys(state.coordination.timers).length >=
      state.coordination.limits.maximumTimers
  )
    return reject(state, "timer_capacity_exceeded");
  const coordination = Object.freeze({
    ...state.coordination,
    timers: createFrozenRecord(nextTimers),
    journal: Object.freeze([...state.coordination.journal, journal]),
    localEventSequence: sequence,
    lastLogicalTime: time.receivedAt,
  });
  const countedObjective =
    command.kind === "work.create"
      ? freezeObjective({
          ...result.objective,
          workItemCount: result.objective.workItemCount + 1,
        })
      : result.objective;
  const objectives = Object.freeze({
    ...state.objectives,
    objectives: createFrozenRecord([
      ...recordEntries(state.objectives.objectives).filter(
        ([key]) => key !== countedObjective.objectiveId,
      ),
      [countedObjective.objectiveId, countedObjective],
    ]),
    workItems: createFrozenRecord(result.workItems),
    lastLogicalTime: time.receivedAt,
  });
  return Object.freeze({
    accepted: true,
    duplicate: false,
    state: createMeshObjectiveWorkRuntimeState(
      coordination,
      Object.freeze({ ...state.discovery, lastLogicalTime: time.receivedAt }),
      objectives,
    ),
  });
}

function evaluateObjectivePayload(
  state: MeshObjectiveWorkRuntimeState,
  request: MeshVerifiedObjectiveRequest,
  recordKey: string,
):
  | {
      readonly objectives: readonly (readonly [
        string,
        MeshObjectiveProjection,
      ])[];
      readonly timer?: MeshCoordinationTimer;
      readonly removeTimerId?: string;
      readonly document?: MeshAcceptedObjectiveDocument;
      readonly policy?: MeshWorkObjectivePolicySnapshot;
    }
  | { readonly code: MeshObjectiveWorkRejectionCode } {
  const payload = request.envelope.payload;
  const current = state.objectives.objectives[payload.objectiveId];
  if (payload.type === "objective.cancel")
    return evaluateCancel(state, request, current, recordKey);
  const expiry = logicalExpiry(
    payload.validFrom,
    payload.validUntil,
    request.verifiedAt,
    request.receivedAt,
  );
  if (!expiry.ok) {
    return {
      code:
        expiry.reason === "outside_window"
          ? "message_expired"
          : "objective_limit_exceeded",
    };
  }
  if (!current) {
    if (
      payload.type !== "objective.announce" ||
      payload.objectiveRevision !== 1 ||
      request.envelope.causationId !== undefined
    )
      return { code: "objective_revision_invalid" };
    if (
      Object.keys(state.objectives.objectives).length >=
      state.objectives.limits.maximumObjectives
    )
      return { code: "objective_capacity_exceeded" };
  } else {
    if (current.status !== "active") return { code: "objective_terminal" };
    if (
      current.issuerPeerId !== request.envelope.sender.peerId ||
      compare(request.verifiedAt, current.validityVerifiedAt) < 0 ||
      compare(request.verifiedAt, current.validUntil) >= 0 ||
      request.receivedAt >= current.expiresAt
    ) {
      return {
        code:
          current.issuerPeerId !== request.envelope.sender.peerId
            ? "issuer_not_authorized"
            : "objective_terminal",
      };
    }
    if (
      payload.type !== "objective.revise" ||
      payload.objectiveRevision !== current.objectiveRevision + 1
    )
      return { code: "objective_revision_invalid" };
    if (
      payload.previousObjectiveDocumentId !== current.objectiveDocumentId ||
      request.envelope.causationId !== current.acceptedMessageId
    )
      return { code: "objective_predecessor_invalid" };
  }
  if (current?.expiryTimerGeneration === Number.MAX_SAFE_INTEGER)
    return { code: "timer_generation_exhausted" };
  if (
    Object.keys(state.objectives.objectivePolicies).length >=
    state.objectives.limits.maximumObjectivePolicies
  ) {
    return { code: "objective_policy_capacity_exceeded" };
  }
  if (
    Object.values(state.objectives.objectives).some(
      (entry) =>
        entry.objectiveId !== payload.objectiveId &&
        (entry.objectiveDocumentId === payload.objectiveDocumentId ||
          entry.acceptedMessageId === request.envelope.messageId),
    ) ||
    Object.values(state.objectives.objectivePolicies).some(
      (entry) =>
        entry.objectiveDocumentId === payload.objectiveDocumentId ||
        entry.acceptedMessageId === request.envelope.messageId,
    )
  ) {
    return { code: "domain_record_conflict" };
  }
  const timerId = objectiveTimerId(payload.objectiveId);
  const nextGeneration = (current?.expiryTimerGeneration ?? 0) + 1;
  const currentWorkItemCount = current?.workItemCount ?? 0;
  const currentReservedBudgetUnits = current?.reservedBudgetUnits ?? 0;
  const currentCommittedBudgetUnits = current?.committedBudgetUnits ?? 0;
  if (
    current &&
    (payload.maximumWorkItems < currentWorkItemCount ||
      payload.maximumBudgetUnits <
        currentReservedBudgetUnits + currentCommittedBudgetUnits)
  )
    return { code: "objective_limit_below_committed" };
  const objectiveCandidate: MeshObjectiveProjection = {
    objectiveId: payload.objectiveId,
    objectiveDocumentId: payload.objectiveDocumentId,
    objectiveRevision: payload.objectiveRevision,
    issuerPeerId: payload.issuerPeerId,
    issuerKeyId: request.envelope.proof.keyId,
    ...(payload.summary === undefined
      ? { contentReference: payload.contentReference }
      : { summary: payload.summary }),
    successCriteria: payload.successCriteria,
    permittedCapabilityKeys: payload.permittedCapabilityKeys,
    maximumWorkItems: payload.maximumWorkItems,
    maximumConcurrentAssignments: payload.maximumConcurrentAssignments,
    maximumBudgetUnits: payload.maximumBudgetUnits,
    bidWindowMs: payload.bidWindowMs,
    acceptanceWindowMs: payload.acceptanceWindowMs,
    maximumLeaseDurationMs: payload.maximumLeaseDurationMs,
    recoveryGraceMs: payload.recoveryGraceMs,
    maximumLeaseRenewals: payload.maximumLeaseRenewals,
    recoveryWitnessPeerIds: payload.recoveryWitnessPeerIds,
    recoveryWitnessThreshold: payload.recoveryWitnessThreshold,
    validFrom: payload.validFrom,
    validUntil: payload.validUntil,
    ...(payload.authorizedObserverPeerIds === undefined
      ? {}
      : { authorizedObserverPeerIds: payload.authorizedObserverPeerIds }),
    validityVerifiedAt: request.verifiedAt,
    acceptedMessageId: request.envelope.messageId,
    acceptedAt: request.receivedAt,
    expiresAt: expiry.at,
    expiryTimerId: timerId,
    expiryTimerGeneration: nextGeneration,
    workItemCount: currentWorkItemCount,
    reservedBudgetUnits: currentReservedBudgetUnits,
    committedBudgetUnits: currentCommittedBudgetUnits,
    status: "active" as const,
  };
  if (!objectiveWithinLocalLimits(objectiveCandidate, state.objectives)) {
    return { code: "objective_limit_exceeded" };
  }
  const objective = freezeObjective(objectiveCandidate);
  const policy = freezeObjectivePolicy(objective);
  const document = freezeAcceptedObjectiveDocument(request, expiry.at);
  if (
    utf8Encoder.encode(JSON.stringify(document)).byteLength >
    state.objectives.limits.maximumProjectionBytes
  ) {
    return { code: "objective_limit_exceeded" };
  }
  const timer = Object.freeze<MeshCoordinationTimer>({
    timerId,
    kind: "objective.expiry",
    dueAt: expiry.at,
    generation: nextGeneration,
    domainRecordKey: recordKey,
  });
  return {
    objectives: [
      ...recordEntries(state.objectives.objectives).filter(
        ([key]) => key !== payload.objectiveId,
      ),
      [payload.objectiveId, objective],
    ],
    timer,
    document,
    policy,
    ...(current === undefined ? {} : { removeTimerId: current.expiryTimerId }),
  };
}

function evaluateCancel(
  state: MeshObjectiveWorkRuntimeState,
  request: MeshVerifiedObjectiveRequest,
  current: MeshObjectiveProjection | undefined,
  recordKey: string,
):
  | {
      readonly objectives: readonly (readonly [
        string,
        MeshObjectiveProjection,
      ])[];
      readonly removeTimerId: string;
    }
  | { readonly code: MeshObjectiveWorkRejectionCode } {
  const payload = request.envelope.payload as ObjectiveCancelPayload;
  if (
    !current ||
    current.status !== "active" ||
    compare(request.verifiedAt, current.validityVerifiedAt) < 0 ||
    compare(request.verifiedAt, current.validUntil) >= 0 ||
    request.receivedAt >= current.expiresAt ||
    payload.objectiveRevision !== current.objectiveRevision ||
    payload.objectiveDocumentId !== current.objectiveDocumentId ||
    request.envelope.causationId !== current.acceptedMessageId
  )
    return { code: "objective_cancel_invalid" };
  const terminal = freezeObjective({
    ...current,
    status: "cancelled" as const,
    expiryTimerId: undefined,
    expiryTimerGeneration: undefined,
    terminalRecordKey: recordKey,
    terminalCancellation: freezeAcceptedObjectiveCancellation(request),
    terminalAt: request.receivedAt,
  });
  if (
    utf8Encoder.encode(JSON.stringify(terminal)).byteLength >
    state.objectives.limits.maximumProjectionBytes
  ) {
    return { code: "objective_limit_exceeded" };
  }
  return {
    objectives: [
      ...recordEntries(state.objectives.objectives).filter(
        ([key]) => key !== current.objectiveId,
      ),
      [current.objectiveId, terminal],
    ],
    removeTimerId: current.expiryTimerId as string,
  };
}

function upsertWork(
  state: MeshObjectiveWorkRuntimeState,
  command: Exclude<MeshObjectiveWorkCommand, { readonly kind: "work.cancel" }>,
  time: MeshObjectiveWorkTrustedTime,
):
  | {
      readonly objective: MeshObjectiveProjection;
      readonly workItem: MeshWorkItemProjection;
      readonly previousTimerId?: string;
      readonly workItems: readonly (readonly [
        string,
        MeshWorkItemProjection,
      ])[];
    }
  | { readonly code: MeshObjectiveWorkRejectionCode } {
  const input = command.input;
  if (
    !Number.isSafeInteger(input.budgetReservationUnits) ||
    input.budgetReservationUnits < 0
  )
    return { code: "work_limit_exceeded" };
  const objective = state.objectives.objectives[input.objectiveId];
  if (!objective) return { code: "work_objective_missing" };
  if (compare(time.verifiedAt, objective.validityVerifiedAt) < 0) {
    throw new RangeError(
      "Mesh Objective/Work trusted time cannot move backwards",
    );
  }
  if (
    objective.status !== "active" ||
    objective.expiresAt <= time.receivedAt ||
    compare(time.verifiedAt, objective.validUntil) >= 0
  )
    return { code: "work_objective_not_active" };
  const key = workKey(input.objectiveId, input.workItemId);
  const current = state.objectives.workItems[key];
  if (command.kind === "work.create") {
    if (current) return { code: "work_duplicate_conflict" };
    if (
      Object.keys(state.objectives.workItems).length >=
        state.objectives.limits.maximumWorkItems ||
      Object.values(state.objectives.workItems).filter(
        (entry) => entry.objectiveId === input.objectiveId,
      ).length >=
        Math.min(
          state.objectives.limits.maximumWorkItemsPerObjective,
          objective.maximumWorkItems,
        )
    )
      return { code: "work_capacity_exceeded" };
  } else if (
    !current ||
    current.status !== "ready" ||
    command.expectedWorkItemRevision !== current.workItemRevision
  )
    return { code: "work_revision_invalid" };
  if (
    current?.workItemRevision === Number.MAX_SAFE_INTEGER ||
    current?.expiryTimerGeneration === Number.MAX_SAFE_INTEGER
  )
    return {
      code:
        current.workItemRevision === Number.MAX_SAFE_INTEGER
          ? "work_revision_invalid"
          : "timer_generation_exhausted",
    };
  if (
    input.budgetReservationUnits > objective.maximumBudgetUnits ||
    input.requiredCapabilityKeys.some(
      (key) => !objective.permittedCapabilityKeys.includes(key),
    )
  )
    return { code: "work_limit_exceeded" };
  const deadline = logicalDeadline(
    input.workDeadline,
    time.verifiedAt,
    time.receivedAt,
  );
  if (
    deadline === undefined ||
    compare(input.workDeadline, objective.validUntil) > 0 ||
    deadline > objective.expiresAt
  )
    return { code: "work_limit_exceeded" };
  const workItemCandidate: MeshWorkItemProjection = {
    objectiveId: objective.objectiveId,
    objectiveDocumentId: objective.objectiveDocumentId,
    objectiveRevision: objective.objectiveRevision,
    objectivePolicy: state.objectives.objectivePolicies[
      objectivePolicyKey(objective.objectiveId, objective.objectiveRevision)
    ] as MeshWorkObjectivePolicySnapshot,
    workItemId: input.workItemId,
    workItemRevision:
      command.kind === "work.create"
        ? 1
        : (current as MeshWorkItemProjection).workItemRevision + 1,
    ownerPeerId: state.objectives.identity.peerId,
    ownerEpoch: 1,
    requiredCapabilityKeys: input.requiredCapabilityKeys,
    matchingAttributes: input.matchingAttributes ?? Object.create(null),
    completionCriteria: input.completionCriteria,
    ...(input.inputSummary === undefined
      ? { inputReference: input.inputReference }
      : { inputSummary: input.inputSummary }),
    budgetReservationUnits: input.budgetReservationUnits,
    workDeadline: input.workDeadline,
    workDeadlineAt: deadline,
    offerAttempt: 0,
    expiryTimerId: workTimerId(input.objectiveId, input.workItemId),
    expiryTimerGeneration: (current?.expiryTimerGeneration ?? 0) + 1,
    status: "ready" as const,
    createdAt: current?.createdAt ?? time.receivedAt,
    updatedAt: time.receivedAt,
  };
  if (
    utf8Encoder.encode(JSON.stringify(workItemCandidate)).byteLength >
    state.objectives.limits.maximumProjectionBytes
  )
    return { code: "work_limit_exceeded" };
  const workItem = freezeWorkItem(workItemCandidate);
  return {
    objective,
    workItem,
    ...(current === undefined
      ? {}
      : { previousTimerId: current.expiryTimerId }),
    workItems: [
      ...recordEntries(state.objectives.workItems).filter(
        ([entryKey]) => entryKey !== key,
      ),
      [key, workItem],
    ],
  };
}

function cancelWork(
  state: MeshObjectiveWorkRuntimeState,
  command: Extract<MeshObjectiveWorkCommand, { readonly kind: "work.cancel" }>,
  time: MeshObjectiveWorkTrustedTime,
):
  | {
      readonly objective: MeshObjectiveProjection;
      readonly workItem: MeshWorkItemProjection;
      readonly previousTimerId: string;
      readonly workItems: readonly (readonly [
        string,
        MeshWorkItemProjection,
      ])[];
    }
  | { readonly code: MeshObjectiveWorkRejectionCode } {
  const objective = state.objectives.objectives[command.objectiveId];
  const key = workKey(command.objectiveId, command.workItemId);
  const current = state.objectives.workItems[key];
  if (!objective) return { code: "work_objective_missing" };
  if (compare(time.verifiedAt, objective.validityVerifiedAt) < 0) {
    throw new RangeError(
      "Mesh Objective/Work trusted time cannot move backwards",
    );
  }
  if (
    !current ||
    current.status !== "ready" ||
    current.ownerPeerId !== state.objectives.identity.peerId ||
    current.workItemRevision !== command.expectedWorkItemRevision
  )
    return { code: "work_revision_invalid" };
  const cancelled = freezeWorkItem({
    ...current,
    status: "cancelled" as const,
    expiryTimerId: undefined,
    expiryTimerGeneration: undefined,
    terminalAt: time.receivedAt,
    updatedAt: time.receivedAt,
  });
  return {
    objective,
    workItem: cancelled,
    previousTimerId: current.expiryTimerId as string,
    workItems: [
      ...recordEntries(state.objectives.workItems).filter(
        ([entryKey]) => entryKey !== key,
      ),
      [key, cancelled],
    ],
  };
}

function validateContext(
  state: MeshObjectiveWorkRuntimeState,
  request: MeshVerifiedObjectiveRequest,
): MeshObjectiveWorkRejectionCode | undefined {
  const result = validateMeshEnvelopeContext(request.envelope, {
    tenantId: state.objectives.identity.tenantId,
    meshId: state.objectives.identity.meshId,
    peerId: state.objectives.identity.peerId,
    receivedAt: request.verifiedAt,
    subscribedTopics: state.discovery.subscriptions,
    ...(request.supportedCriticalExtensions === undefined
      ? {}
      : { supportedCriticalExtensions: request.supportedCriticalExtensions }),
  });
  if (!result.ok) {
    const code = result.issues[0]?.code;
    if (code === "scope_mismatch") return "scope_mismatch";
    if (code === "message_expired") return "message_expired";
    if (code === "message_from_future") return "message_from_future";
    if (code === "unknown_critical_extension")
      return "unknown_critical_extension";
    if (code === "invalid_audience") {
      return request.envelope.audience.kind === "mesh" &&
        !state.discovery.subscriptions.includes("objective")
        ? "topic_not_subscribed"
        : "audience_mismatch";
    }
    return "invalid_verified_envelope";
  }
  if (
    request.envelope.payload.type !== "objective.announce" &&
    request.envelope.payload.type !== "objective.revise" &&
    request.envelope.payload.type !== "objective.cancel"
  )
    return "invalid_verified_envelope";
  if (
    request.envelope.payload.type !== "objective.cancel" &&
    request.envelope.sender.peerId !== request.envelope.payload.issuerPeerId
  )
    return "issuer_not_authorized";
  if (
    request.envelope.audience.kind === "mesh" &&
    request.envelope.audience.topic !== "objective"
  )
    return "audience_mismatch";
  const admission =
    state.discovery.admittedPeers[request.envelope.sender.peerId];
  if (!admission) return "sender_not_admitted";
  if (!admission.instanceIds.includes(request.envelope.sender.instanceId))
    return "sender_instance_not_admitted";
  if (compare(request.verifiedAt, admission.validUntil) >= 0)
    return "sender_admission_expired";
  return undefined;
}

function domainMetadata(envelope: VerifiedMeshEnvelope<MeshObjectivePayload>): {
  readonly recordKey: string;
  readonly recordId: string;
  readonly contentDigest: string;
} {
  const recordId =
    envelope.payload.type === "objective.cancel"
      ? envelope.payload.cancellationId
      : envelope.payload.objectiveDocumentId;
  const contentDigest = envelope.payloadHash.startsWith("sha256:")
    ? envelope.payloadHash.slice(7)
    : "";
  if (!digestPattern.test(contentDigest))
    throw new TypeError("Invalid verified Mesh Objective payload digest");
  return {
    recordKey: JSON.stringify([envelope.payload.type, recordId]),
    recordId,
    contentDigest,
  };
}
function freezeAcceptedObjectiveDocument(
  request: MeshVerifiedObjectiveRequest,
  expiresAt: number,
): MeshAcceptedObjectiveDocument {
  const validated = validateSignedMeshEnvelope(request.envelope);
  if (
    !validated.ok ||
    (validated.value.payload.type !== "objective.announce" &&
      validated.value.payload.type !== "objective.revise")
  ) {
    throw new TypeError("Invalid verified Mesh Objective envelope");
  }
  return Object.freeze({
    envelope: validated.value as MeshAcceptedObjectiveDocument["envelope"],
    validityVerifiedAt: request.verifiedAt,
    acceptedAt: request.receivedAt,
    expiresAt,
  });
}
function freezeAcceptedObjectiveCancellation(
  request: MeshVerifiedObjectiveRequest,
): MeshAcceptedObjectiveCancellation {
  const validated = validateSignedMeshEnvelope(request.envelope);
  if (!validated.ok || validated.value.payload.type !== "objective.cancel") {
    throw new TypeError("Invalid verified Mesh Objective cancellation");
  }
  return Object.freeze({
    envelope: validated.value as MeshAcceptedObjectiveCancellation["envelope"],
    validityVerifiedAt: request.verifiedAt,
  });
}
function objectiveDocumentDomainRecordKey(
  document: MeshAcceptedObjectiveDocument,
): string {
  const payload = document.envelope.payload;
  return JSON.stringify([payload.type, payload.objectiveDocumentId]);
}
function objectiveDomainRecordKey(objective: MeshObjectiveProjection): string {
  return JSON.stringify([
    objective.objectiveRevision === 1
      ? "objective.announce"
      : "objective.revise",
    objective.objectiveDocumentId,
  ]);
}
function workObjectiveDomainRecordKey(
  workItem: MeshWorkItemProjection,
): string {
  return JSON.stringify([
    workItem.objectiveRevision === 1
      ? "objective.announce"
      : "objective.revise",
    workItem.objectiveDocumentId,
  ]);
}
function objectivePolicyDomainRecordKey(
  policy: MeshWorkObjectivePolicySnapshot,
): string {
  return JSON.stringify([
    policy.objectiveRevision === 1 ? "objective.announce" : "objective.revise",
    policy.objectiveDocumentId,
  ]);
}
function objectiveTimerId(objectiveId: string): string {
  return `objective:${objectiveId.length}:${objectiveId}:expiry`;
}
function workTimerId(objectiveId: string, workItemId: string): string {
  return `work:${objectiveId.length}:${objectiveId}:${workItemId.length}:${workItemId}:deadline`;
}
function workKey(objectiveId: string, workItemId: string): string {
  return JSON.stringify([objectiveId, workItemId]);
}
function objectivePolicyKey(objectiveId: string, objectiveRevision: number) {
  return JSON.stringify([objectiveId, objectiveRevision]);
}
function compare(left: string, right: string): number {
  const result = compareMeshTimestamps(left, right);
  if (!result.ok) throw new TypeError("Invalid Mesh Objective timestamp");
  return result.value;
}
function freezeObjective(
  value: MeshObjectiveProjection,
): MeshObjectiveProjection {
  return Object.freeze({
    ...value,
    successCriteria: Object.freeze([...value.successCriteria]),
    permittedCapabilityKeys: Object.freeze([...value.permittedCapabilityKeys]),
    recoveryWitnessPeerIds: Object.freeze([...value.recoveryWitnessPeerIds]),
    ...(value.authorizedObserverPeerIds === undefined
      ? {}
      : {
          authorizedObserverPeerIds: Object.freeze([
            ...value.authorizedObserverPeerIds,
          ]),
        }),
  });
}
function freezeObjectivePolicy(
  objective: MeshObjectiveProjection,
): MeshWorkObjectivePolicySnapshot {
  return Object.freeze({
    objectiveId: objective.objectiveId,
    objectiveDocumentId: objective.objectiveDocumentId,
    objectiveRevision: objective.objectiveRevision,
    acceptedMessageId: objective.acceptedMessageId,
    acceptedAt: objective.acceptedAt,
    expiresAt: objective.expiresAt,
    permittedCapabilityKeys: Object.freeze([
      ...objective.permittedCapabilityKeys,
    ]),
    maximumBudgetUnits: objective.maximumBudgetUnits,
    validUntil: objective.validUntil,
  });
}
function freezeWorkItem(value: MeshWorkItemProjection): MeshWorkItemProjection {
  const attributes = Object.create(null) as Record<string, string>;
  for (const [key, entry] of Object.entries(value.matchingAttributes))
    attributes[key] = entry;
  return Object.freeze({
    ...value,
    requiredCapabilityKeys: Object.freeze([...value.requiredCapabilityKeys]),
    completionCriteria: Object.freeze([...value.completionCriteria]),
    objectivePolicy: value.objectivePolicy,
    matchingAttributes: Object.freeze(attributes),
  });
}

function objectiveWithinLocalLimits(
  value: MeshObjectiveProjection,
  state: MeshObjectiveWorkState,
): boolean {
  return (
    value.successCriteria.length <= state.limits.maximumCriteria &&
    new Set(value.successCriteria).size === value.successCriteria.length &&
    value.permittedCapabilityKeys.length <=
      state.limits.maximumRequiredCapabilityKeys &&
    value.recoveryWitnessPeerIds.length <=
      state.limits.maximumIssuerAuthorities &&
    !value.recoveryWitnessPeerIds.includes(value.issuerPeerId) &&
    (value.authorizedObserverPeerIds?.length ?? 0) <=
      state.limits.maximumIssuerAuthorities &&
    utf8Encoder.encode(JSON.stringify(value)).byteLength <=
      state.limits.maximumProjectionBytes
  );
}
function reject(
  state: MeshObjectiveWorkRuntimeState,
  code: MeshObjectiveWorkRejectionCode,
): MeshObjectiveWorkDecision {
  return Object.freeze({ accepted: false, code, state });
}

function timerRejection(
  state: MeshObjectiveWorkRuntimeState,
  code:
    | "timer_unknown"
    | "timer_generation_stale"
    | "timer_not_due"
    | "journal_capacity_exceeded",
): MeshObjectiveWorkTimerDecision {
  return Object.freeze({ accepted: false, code, state });
}
function assertRuntimeState(state: MeshObjectiveWorkRuntimeState): void {
  if (
    !isPlainDataRecord(state) ||
    !Object.isFrozen(state) ||
    Object.keys(state).length !== 3 ||
    Object.keys(state).some(
      (key) => !["coordination", "discovery", "objectives"].includes(key),
    )
  )
    throw new TypeError("Mesh Objective/Work runtime state is required");
  assertFrozenMeshCoordinationState(state.coordination);
  assertFrozenMeshDiscoveryState(state.discovery);
  assertFrozenMeshObjectiveWorkState(state.objectives);
  createMeshObjectiveWorkRuntimeState(
    state.coordination,
    state.discovery,
    state.objectives,
  );
}
function assertMonotonic(
  state: MeshObjectiveWorkRuntimeState,
  logicalTime: number,
): void {
  if (
    logicalTime < state.coordination.lastLogicalTime ||
    logicalTime < state.discovery.lastLogicalTime ||
    logicalTime < state.objectives.lastLogicalTime
  )
    throw new RangeError(
      "Mesh Objective/Work logical time cannot move backwards",
    );
}
function assertObjectiveRequest(request: MeshVerifiedObjectiveRequest): void {
  if (
    !isPlainDataRecord(request) ||
    Object.keys(request).some(
      (key) =>
        ![
          "envelope",
          "receivedAt",
          "supportedCriticalExtensions",
          "verifiedAt",
        ].includes(key),
    ) ||
    !Object.hasOwn(request, "envelope") ||
    !Object.hasOwn(request, "verifiedAt") ||
    !Object.hasOwn(request, "receivedAt")
  )
    throw new TypeError("Mesh verified Objective request is required");
  assertTrustedTime({
    verifiedAt: request.verifiedAt,
    receivedAt: request.receivedAt,
  });
  if (
    request.supportedCriticalExtensions !== undefined &&
    (!isDenseDataArray(request.supportedCriticalExtensions) ||
      request.supportedCriticalExtensions.length > 256 ||
      request.supportedCriticalExtensions.some(
        (entry) =>
          typeof entry !== "string" ||
          entry.length < 1 ||
          utf8Encoder.encode(entry).byteLength > 256,
      ) ||
      new Set(request.supportedCriticalExtensions).size !==
        request.supportedCriticalExtensions.length)
  )
    throw new TypeError("Mesh Objective critical extensions are invalid");
}
function assertTrustedTime(time: MeshObjectiveWorkTrustedTime): void {
  if (
    !isPlainDataRecord(time) ||
    Object.keys(time).some(
      (key) => key !== "verifiedAt" && key !== "receivedAt",
    ) ||
    !Object.hasOwn(time, "verifiedAt") ||
    !Object.hasOwn(time, "receivedAt") ||
    typeof time.verifiedAt !== "string" ||
    !compareMeshTimestamps(time.verifiedAt, time.verifiedAt).ok
  )
    throw new TypeError("Mesh Objective/Work trusted time is invalid");
  assertMeshLogicalTime(time.receivedAt);
}
function assertCommand(command: MeshObjectiveWorkCommand): void {
  if (
    !isPlainDataRecord(command) ||
    !["work.create", "work.revise", "work.cancel"].includes(command.kind)
  )
    throw new TypeError("Mesh Objective/Work command is invalid");
  const keys = Object.keys(command);
  const allowed =
    command.kind === "work.create"
      ? ["kind", "input"]
      : command.kind === "work.revise"
        ? ["expectedWorkItemRevision", "input", "kind"]
        : ["expectedWorkItemRevision", "kind", "objectiveId", "workItemId"];
  if (
    keys.length !== allowed.length ||
    keys.some((key) => !allowed.includes(key))
  )
    throw new TypeError(
      "Mesh Objective/Work command contains unsupported fields",
    );
  if (command.kind === "work.cancel") {
    assertIdentifier(command.objectiveId, "work cancel objectiveId");
    assertIdentifier(command.workItemId, "work cancel workItemId");
  }
  if (
    command.kind !== "work.create" &&
    (!Number.isSafeInteger(command.expectedWorkItemRevision) ||
      command.expectedWorkItemRevision < 1)
  ) {
    throw new TypeError("Mesh Objective/Work expected revision is invalid");
  }
}
function assertWorkInput(
  input: unknown,
  state: MeshObjectiveWorkState,
): asserts input is Exclude<
  MeshObjectiveWorkCommand,
  { readonly kind: "work.cancel" }
>["input"] {
  const supported = [
    "budgetReservationUnits",
    "completionCriteria",
    "inputReference",
    "inputSummary",
    "matchingAttributes",
    "objectiveId",
    "requiredCapabilityKeys",
    "workDeadline",
    "workItemId",
  ];
  const required = [
    "budgetReservationUnits",
    "completionCriteria",
    "objectiveId",
    "requiredCapabilityKeys",
    "workDeadline",
    "workItemId",
  ];
  if (
    !isPlainDataRecord(input) ||
    Object.keys(input).some((key) => !supported.includes(key)) ||
    required.some((key) => !Object.hasOwn(input, key))
  )
    throw new TypeError("Mesh Objective/Work input is invalid");
  assertIdentifier(input.objectiveId, "Work Item objectiveId");
  assertIdentifier(input.workItemId, "Work Item workItemId");
  assertBoundedStringArray(
    input.requiredCapabilityKeys,
    state.limits.maximumRequiredCapabilityKeys,
    "Work Item capability keys",
    true,
  );
  assertBoundedStringArray(
    input.completionCriteria,
    state.limits.maximumCriteria,
    "Work Item completion criteria",
    false,
  );
  const attributes = input.matchingAttributes ?? Object.create(null);
  if (!isPlainDataRecord(attributes)) {
    throw new TypeError("Mesh Work Item matching attributes are invalid");
  }
  const attributeEntries = Object.entries(attributes);
  if (
    attributeEntries.length > state.limits.maximumMatchingAttributes ||
    attributeEntries.some(
      ([key, value]) =>
        key.length < 1 ||
        typeof value !== "string" ||
        value.length < 1 ||
        utf8Encoder.encode(key).byteLength >
          state.limits.maximumProjectionBytes ||
        utf8Encoder.encode(value).byteLength >
          state.limits.maximumProjectionBytes,
    )
  ) {
    throw new TypeError("Mesh Work Item matching attributes are invalid");
  }
  const hasSummary =
    typeof input.inputSummary === "string" && input.inputSummary.length > 0;
  const hasReference =
    typeof input.inputReference === "string" && input.inputReference.length > 0;
  if (
    hasSummary === hasReference ||
    (input.inputSummary !== undefined && !hasSummary) ||
    (input.inputReference !== undefined && !hasReference)
  ) {
    throw new TypeError("Mesh Work Item input content is invalid");
  }
  const content = input.inputSummary ?? input.inputReference;
  if (
    utf8Encoder.encode(content as string).byteLength >
    state.limits.maximumProjectionBytes
  ) {
    throw new TypeError("Mesh Work Item input content is invalid");
  }
  if (typeof input.budgetReservationUnits !== "number") {
    throw new TypeError("Mesh Work Item budget is invalid");
  }
  if (
    typeof input.workDeadline !== "string" ||
    !compareMeshTimestamps(input.workDeadline, input.workDeadline).ok
  ) {
    throw new TypeError("Mesh Work Item deadline is invalid");
  }
}
function sameIdentity(
  left: MeshObjectiveWorkState["identity"],
  right: MeshObjectiveWorkState["identity"],
): boolean {
  return (
    left.tenantId === right.tenantId &&
    left.meshId === right.meshId &&
    left.peerId === right.peerId &&
    left.instanceId === right.instanceId &&
    left.keyId === right.keyId
  );
}
function assertIdentifier(
  value: unknown,
  name: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    !identifierPattern.test(value) ||
    utf8Encoder.encode(value).byteLength > 256
  ) {
    throw new TypeError(`Invalid Mesh Objective/Work ${name}`);
  }
}
function assertBoundedStringArray(
  value: unknown,
  maximum: number,
  name: string,
  sorted: boolean,
): asserts value is readonly string[] {
  if (
    !isDenseDataArray(value) ||
    value.length < 1 ||
    value.length > maximum ||
    value.some(
      (entry) =>
        typeof entry !== "string" ||
        entry.length < 1 ||
        utf8Encoder.encode(entry).byteLength > 65_536,
    )
  ) {
    throw new TypeError(`Invalid Mesh ${name}`);
  }
  const strings = value as readonly string[];
  if (
    new Set(strings).size !== strings.length ||
    (sorted &&
      strings.some(
        (entry, index) => index > 0 && entry <= (strings[index - 1] as string),
      ))
  ) {
    throw new TypeError(`Invalid Mesh ${name}`);
  }
}
function isPlainDataRecord(value: unknown): value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== null &&
      Object.getPrototypeOf(value) !== Object.prototype) ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    return false;
  }
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(
    (descriptor) => descriptor.enumerable && Object.hasOwn(descriptor, "value"),
  );
}
function isDenseDataArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value) || Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.keys(descriptors).length !== value.length + 1 ||
    !Object.hasOwn(descriptors, "length")
  ) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.hasOwn(descriptor, "value")
    ) {
      return false;
    }
  }
  return true;
}
