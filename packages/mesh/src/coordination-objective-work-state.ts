import {
  canonicalizeMeshPayload,
  compareMeshTimestamps,
  validateSignedMeshEnvelope,
  type ObjectiveCancelPayload,
  type SignedMeshEnvelope,
} from "@agentplat/mesh-protocol";

import type { MeshPeerIdentity } from "./contracts.js";
import type {
  MeshAcceptedObjectiveCancellation,
  MeshAcceptedObjectiveDocument,
  MeshObjectiveIssuerAuthority,
  MeshObjectiveProjection,
  MeshObjectiveRevisionPayload,
  MeshObjectiveWorkLimits,
  MeshObjectiveWorkState,
  MeshObjectiveWorkStateOptions,
  MeshWorkObjectivePolicySnapshot,
  MeshWorkItemProjection,
} from "./coordination-objective-work-contracts.js";
import { logicalExpiry } from "./coordination-objective-work-time.js";
import { sha256Base64Url } from "./sha256.js";
import {
  assertMeshLogicalTime,
  assertMeshMessageId,
  createFrozenRecord,
} from "./state.js";

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/;
const utf8Encoder = new TextEncoder();
const identityKeys = ["instanceId", "keyId", "meshId", "peerId", "tenantId"];
const limitKeys = [
  "maximumCriteria",
  "maximumIssuerAuthorities",
  "maximumIssuerKeys",
  "maximumMatchingAttributes",
  "maximumObjectivePolicies",
  "maximumObjectives",
  "maximumProjectionBytes",
  "maximumRequiredCapabilityKeys",
  "maximumWorkItems",
  "maximumWorkItemsPerObjective",
] as const;

/** Fixed upper bounds; configuration can only lower them. */
export const DEFAULT_MESH_OBJECTIVE_WORK_LIMITS: Readonly<MeshObjectiveWorkLimits> =
  Object.freeze({
    maximumIssuerAuthorities: 256,
    maximumIssuerKeys: 32,
    maximumObjectives: 1_024,
    maximumObjectivePolicies: 8_192,
    maximumWorkItems: 8_192,
    maximumWorkItemsPerObjective: 1_024,
    maximumRequiredCapabilityKeys: 32,
    maximumMatchingAttributes: 32,
    maximumCriteria: 32,
    maximumProjectionBytes: 65_536,
  });

/** Creates an empty separately restorable Objective/Work projection. */
export function createMeshObjectiveWorkState(
  options: MeshObjectiveWorkStateOptions,
): MeshObjectiveWorkState {
  assertPlainRecord(options, "state options");
  assertExactKeys(
    options,
    ["identity", "issuerAuthorities", "limits"],
    ["identity"],
  );
  const limits = resolveLimits(options.limits, false);
  const authorities = options.issuerAuthorities ?? [];
  if (
    !Array.isArray(authorities) ||
    authorities.length > limits.maximumIssuerAuthorities
  ) {
    throw new RangeError("Mesh Objective issuer authority limit exceeded");
  }
  return Object.freeze({
    schemaVersion: 1,
    identity: freezeIdentity(options.identity),
    issuerAuthorities: createFrozenRecord(
      authorities.map((authority) => {
        const frozen = freezeIssuerAuthority(authority, limits);
        return [frozen.peerId, frozen] as const;
      }),
      "Duplicate Mesh Objective issuer authority",
    ),
    objectives: createFrozenRecord<MeshObjectiveProjection>([]),
    objectiveDocuments: createFrozenRecord<MeshAcceptedObjectiveDocument>([]),
    objectivePolicies: createFrozenRecord<MeshWorkObjectivePolicySnapshot>([]),
    workItems: createFrozenRecord<MeshWorkItemProjection>([]),
    limits,
    lastLogicalTime: 0,
  });
}

/** Strictly validates and canonicalizes decoded Objective/Work state. */
export function restoreMeshObjectiveWorkState(
  snapshot: unknown,
): MeshObjectiveWorkState {
  const parsed = validateSnapshot(snapshot, true);
  const objectiveDocuments = createFrozenRecord(
    parsed.objectiveDocuments.map(([key, document]) => [
      key,
      freezeAcceptedObjectiveDocument(
        document,
        parsed.limits,
        parsed.lastLogicalTime,
        true,
      ),
    ]),
  );
  const objectivePolicies = createFrozenRecord(
    parsed.objectivePolicies.map(([key, policy]) => [
      key,
      freezeWorkObjectivePolicy(policy, parsed.limits, parsed.lastLogicalTime),
    ]),
  );
  return Object.freeze({
    schemaVersion: 1,
    identity: freezeIdentity(parsed.identity),
    issuerAuthorities: createFrozenRecord(
      parsed.issuerAuthorities.map(([key, authority]) => [
        key,
        freezeIssuerAuthority(authority, parsed.limits),
      ]),
    ),
    objectives: createFrozenRecord(
      parsed.objectives.map(([key, objective]) => [
        key,
        freezeObjective(objective, parsed.limits, parsed.lastLogicalTime, true),
      ]),
    ),
    objectiveDocuments,
    objectivePolicies,
    workItems: createFrozenRecord(
      parsed.workItems.map(([key, workItem]) => {
        const policy = objectivePolicies[
          objectivePolicyKey(workItem.objectiveId, workItem.objectiveRevision)
        ] as MeshWorkObjectivePolicySnapshot;
        return [
          key,
          freezeWorkItem(
            { ...workItem, objectivePolicy: policy },
            parsed.limits,
            parsed.lastLogicalTime,
          ),
        ];
      }),
    ),
    limits: Object.freeze({ ...parsed.limits }),
    lastLogicalTime: parsed.lastLogicalTime,
  });
}

/** Strict assertion shared by Objective and Work evaluators. */
export function assertFrozenMeshObjectiveWorkState(
  state: MeshObjectiveWorkState,
): void {
  validateSnapshot(state, false);
  if (
    !Object.isFrozen(state) ||
    !Object.isFrozen(state.identity) ||
    !Object.isFrozen(state.issuerAuthorities) ||
    !Object.isFrozen(state.objectives) ||
    !Object.isFrozen(state.objectiveDocuments) ||
    !Object.isFrozen(state.objectivePolicies) ||
    !Object.isFrozen(state.workItems) ||
    !Object.isFrozen(state.limits) ||
    Object.getPrototypeOf(state.issuerAuthorities) !== null ||
    Object.getPrototypeOf(state.objectives) !== null ||
    Object.getPrototypeOf(state.objectiveDocuments) !== null ||
    Object.getPrototypeOf(state.objectivePolicies) !== null ||
    Object.getPrototypeOf(state.workItems) !== null ||
    Object.values(state.issuerAuthorities).some(
      (entry) => !Object.isFrozen(entry) || !Object.isFrozen(entry.keyIds),
    ) ||
    Object.values(state.objectives).some(
      (entry) =>
        !Object.isFrozen(entry) ||
        !Object.isFrozen(entry.successCriteria) ||
        !Object.isFrozen(entry.permittedCapabilityKeys) ||
        !Object.isFrozen(entry.recoveryWitnessPeerIds) ||
        (entry.terminalCancellation !== undefined &&
          !isDeepFrozenData(entry.terminalCancellation)) ||
        (entry.authorizedObserverPeerIds !== undefined &&
          !Object.isFrozen(entry.authorizedObserverPeerIds)),
    ) ||
    Object.values(state.objectiveDocuments).some(
      (entry) => !isDeepFrozenData(entry),
    ) ||
    Object.values(state.objectivePolicies).some(
      (entry) =>
        !Object.isFrozen(entry) ||
        !Object.isFrozen(entry.permittedCapabilityKeys),
    ) ||
    Object.values(state.workItems).some(
      (entry) =>
        !Object.isFrozen(entry) ||
        !Object.isFrozen(entry.requiredCapabilityKeys) ||
        !Object.isFrozen(entry.completionCriteria) ||
        !Object.isFrozen(entry.objectivePolicy) ||
        !Object.isFrozen(entry.objectivePolicy.permittedCapabilityKeys) ||
        entry.objectivePolicy !==
          state.objectivePolicies[
            objectivePolicyKey(entry.objectiveId, entry.objectiveRevision)
          ] ||
        !Object.isFrozen(entry.matchingAttributes) ||
        Object.getPrototypeOf(entry.matchingAttributes) !== null,
    )
  ) {
    throw new TypeError(
      "Mesh Objective/Work state must be an immutable snapshot",
    );
  }
}

function validateSnapshot(
  snapshot: unknown,
  verifyDocumentDigests = true,
): {
  readonly identity: MeshPeerIdentity;
  readonly issuerAuthorities: readonly (readonly [
    string,
    MeshObjectiveIssuerAuthority,
  ])[];
  readonly objectives: readonly (readonly [string, MeshObjectiveProjection])[];
  readonly objectiveDocuments: readonly (readonly [
    string,
    MeshAcceptedObjectiveDocument,
  ])[];
  readonly objectivePolicies: readonly (readonly [
    string,
    MeshWorkObjectivePolicySnapshot,
  ])[];
  readonly workItems: readonly (readonly [string, MeshWorkItemProjection])[];
  readonly limits: MeshObjectiveWorkLimits;
  readonly lastLogicalTime: number;
} {
  assertPlainRecord(snapshot, "snapshot");
  assertExactKeys(
    snapshot,
    [
      "identity",
      "issuerAuthorities",
      "lastLogicalTime",
      "limits",
      "objectiveDocuments",
      "objectives",
      "objectivePolicies",
      "schemaVersion",
      "workItems",
    ],
    [
      "identity",
      "issuerAuthorities",
      "lastLogicalTime",
      "limits",
      "objectiveDocuments",
      "objectives",
      "objectivePolicies",
      "schemaVersion",
      "workItems",
    ],
  );
  const candidate = snapshot as unknown as MeshObjectiveWorkState;
  if (candidate.schemaVersion !== 1)
    throw new TypeError("Mesh Objective/Work schema version is unsupported");
  const identity = freezeIdentity(candidate.identity);
  const limits = resolveLimits(candidate.limits, true);
  assertMeshLogicalTime(candidate.lastLogicalTime);
  assertRecord(candidate.issuerAuthorities, "issuer authorities");
  assertRecord(candidate.objectives, "objectives");
  assertRecord(candidate.objectiveDocuments, "Objective documents");
  assertRecord(candidate.objectivePolicies, "Objective policies");
  assertRecord(candidate.workItems, "work items");
  const issuerAuthorities = Object.entries(candidate.issuerAuthorities);
  const objectives = Object.entries(candidate.objectives);
  const objectiveDocuments = Object.entries(candidate.objectiveDocuments);
  const objectivePolicies = Object.entries(candidate.objectivePolicies);
  const workItems = Object.entries(candidate.workItems);
  if (
    issuerAuthorities.length > limits.maximumIssuerAuthorities ||
    objectives.length > limits.maximumObjectives ||
    objectiveDocuments.length > limits.maximumObjectivePolicies ||
    objectivePolicies.length > limits.maximumObjectivePolicies ||
    objectiveDocuments.length !== objectivePolicies.length ||
    workItems.length > limits.maximumWorkItems
  )
    throw new RangeError("Mesh Objective/Work snapshot exceeds its limits");
  for (const [key, authority] of issuerAuthorities) {
    if (key !== authority.peerId)
      throw new TypeError("Mesh Objective issuer authority key is invalid");
    freezeIssuerAuthority(authority, limits);
  }
  const workCounts = new Map<string, number>();
  const objectiveDocumentIds = new Set<string>();
  const objectiveMessageIds = new Set<string>();
  const objectiveTerminalRecordKeys = new Set<string>();
  const objectivePolicyCounts = new Map<string, number>();
  const acceptedDocuments = new Map<string, MeshAcceptedObjectiveDocument>();
  for (const [key, document] of objectiveDocuments) {
    const accepted = freezeAcceptedObjectiveDocument(
      document,
      limits,
      candidate.lastLogicalTime,
      verifyDocumentDigests,
    );
    const payload = accepted.envelope.payload;
    if (
      accepted.envelope.tenantId !== identity.tenantId ||
      accepted.envelope.meshId !== identity.meshId ||
      key !== objectivePolicyKey(payload.objectiveId, payload.objectiveRevision)
    ) {
      throw new TypeError("Mesh accepted Objective document key is invalid");
    }
    acceptedDocuments.set(key, accepted);
  }
  for (const document of acceptedDocuments.values()) {
    validateAcceptedObjectiveChain(document, acceptedDocuments);
  }
  for (const [key, policy] of objectivePolicies) {
    if (
      key !== objectivePolicyKey(policy.objectiveId, policy.objectiveRevision)
    )
      throw new TypeError("Mesh Objective policy key is invalid");
    validateWorkObjectivePolicy(policy, limits, candidate.lastLogicalTime);
    const current = candidate.objectives[policy.objectiveId];
    if (
      !current ||
      policy.objectiveRevision > current.objectiveRevision ||
      !policyMatchesAcceptedDocument(policy, acceptedDocuments.get(key)) ||
      objectiveDocumentIds.has(policy.objectiveDocumentId) ||
      objectiveMessageIds.has(policy.acceptedMessageId)
    ) {
      throw new TypeError("Mesh Objective policy binding is not unique");
    }
    objectiveDocumentIds.add(policy.objectiveDocumentId);
    objectiveMessageIds.add(policy.acceptedMessageId);
    objectivePolicyCounts.set(
      policy.objectiveId,
      (objectivePolicyCounts.get(policy.objectiveId) ?? 0) + 1,
    );
  }
  for (const [key, objective] of objectives) {
    if (key !== objective.objectiveId)
      throw new TypeError("Mesh Objective projection key is invalid");
    validateObjective(
      objective,
      limits,
      candidate.lastLogicalTime,
      verifyDocumentDigests,
    );
    if (
      !policyMatchesObjective(
        candidate.objectivePolicies[
          objectivePolicyKey(objective.objectiveId, objective.objectiveRevision)
        ],
        objective,
      ) ||
      !objectiveMatchesAcceptedDocument(
        objective,
        acceptedDocuments.get(
          objectivePolicyKey(
            objective.objectiveId,
            objective.objectiveRevision,
          ),
        ),
      ) ||
      (objective.terminalCancellation !== undefined &&
        (objective.terminalCancellation.envelope.tenantId !==
          identity.tenantId ||
          objective.terminalCancellation.envelope.meshId !==
            identity.meshId)) ||
      objectivePolicyCounts.get(objective.objectiveId) !==
        objective.objectiveRevision ||
      (objective.terminalCancellation !== undefined &&
        objectiveMessageIds.has(
          objective.terminalCancellation.envelope.messageId,
        )) ||
      (objective.terminalRecordKey !== undefined &&
        objectiveTerminalRecordKeys.has(objective.terminalRecordKey))
    ) {
      throw new TypeError("Mesh Objective projection binding is not unique");
    }
    if (objective.terminalRecordKey !== undefined) {
      objectiveTerminalRecordKeys.add(objective.terminalRecordKey);
    }
    if (objective.terminalCancellation !== undefined) {
      objectiveMessageIds.add(
        objective.terminalCancellation.envelope.messageId,
      );
    }
  }
  for (const [key, workItem] of workItems) {
    if (key !== workKey(workItem.objectiveId, workItem.workItemId)) {
      throw new TypeError("Mesh Work Item projection key is invalid");
    }
    const objective = candidate.objectives[workItem.objectiveId];
    const policy =
      candidate.objectivePolicies[
        objectivePolicyKey(workItem.objectiveId, workItem.objectiveRevision)
      ];
    if (
      !objective ||
      !policy ||
      workItem.objectiveRevision > objective.objectiveRevision ||
      workItem.ownerPeerId !== identity.peerId ||
      !policiesEqual(workItem.objectivePolicy, policy)
    ) {
      throw new TypeError("Mesh Work Item Objective binding is invalid");
    }
    validateWorkItem(workItem, limits, candidate.lastLogicalTime);
    const count = (workCounts.get(workItem.objectiveId) ?? 0) + 1;
    if (count > limits.maximumWorkItemsPerObjective) {
      throw new RangeError("Mesh Work Item per Objective limit exceeded");
    }
    workCounts.set(workItem.objectiveId, count);
  }
  for (const [objectiveId, objective] of objectives) {
    if (objective.workItemCount !== (workCounts.get(objectiveId) ?? 0)) {
      throw new TypeError("Mesh Objective Work Item counter is invalid");
    }
  }
  return {
    identity,
    issuerAuthorities,
    objectives,
    objectiveDocuments,
    objectivePolicies,
    workItems,
    limits,
    lastLogicalTime: candidate.lastLogicalTime,
  };
}

function validateObjective(
  value: MeshObjectiveProjection,
  limits: MeshObjectiveWorkLimits,
  lastLogicalTime: number,
  verifyDigest: boolean,
): void {
  assertPlainRecord(value, "Objective projection");
  assertExactKeys(
    value,
    [
      "acceptanceWindowMs",
      "acceptedAt",
      "acceptedMessageId",
      "bidWindowMs",
      "contentReference",
      "authorizedObserverPeerIds",
      "committedBudgetUnits",
      "expiresAt",
      "expiryTimerGeneration",
      "expiryTimerId",
      "issuerKeyId",
      "issuerPeerId",
      "maximumBudgetUnits",
      "maximumConcurrentAssignments",
      "maximumLeaseDurationMs",
      "maximumLeaseRenewals",
      "maximumWorkItems",
      "objectiveDocumentId",
      "objectiveId",
      "objectiveRevision",
      "permittedCapabilityKeys",
      "recoveryGraceMs",
      "recoveryWitnessPeerIds",
      "recoveryWitnessThreshold",
      "status",
      "successCriteria",
      "summary",
      "terminalAt",
      "terminalCancellation",
      "terminalRecordKey",
      "validFrom",
      "validUntil",
      "validityVerifiedAt",
      "workItemCount",
      "reservedBudgetUnits",
    ],
    [
      "acceptanceWindowMs",
      "acceptedAt",
      "acceptedMessageId",
      "bidWindowMs",
      "expiresAt",
      "issuerKeyId",
      "issuerPeerId",
      "maximumBudgetUnits",
      "maximumConcurrentAssignments",
      "maximumLeaseDurationMs",
      "maximumLeaseRenewals",
      "maximumWorkItems",
      "objectiveDocumentId",
      "objectiveId",
      "objectiveRevision",
      "permittedCapabilityKeys",
      "recoveryGraceMs",
      "recoveryWitnessPeerIds",
      "recoveryWitnessThreshold",
      "status",
      "successCriteria",
      "validFrom",
      "validUntil",
      "validityVerifiedAt",
      "workItemCount",
      "reservedBudgetUnits",
      "committedBudgetUnits",
    ],
  );
  for (const [name, id] of Object.entries({
    objectiveId: value.objectiveId,
    objectiveDocumentId: value.objectiveDocumentId,
    issuerPeerId: value.issuerPeerId,
    issuerKeyId: value.issuerKeyId,
  }))
    assertIdentifier(id, name);
  if (
    !Number.isSafeInteger(value.objectiveRevision) ||
    value.objectiveRevision < 1
  )
    throw new TypeError("Mesh Objective revision is invalid");
  assertStringXor(value.summary, value.contentReference, "Objective content");
  assertStringArray(
    value.successCriteria,
    limits.maximumCriteria,
    "Objective success criteria",
  );
  assertSortedStringArray(
    value.permittedCapabilityKeys,
    limits.maximumRequiredCapabilityKeys,
    "Objective capability keys",
  );
  assertSortedStringArray(
    value.recoveryWitnessPeerIds,
    limits.maximumIssuerAuthorities,
    "Objective witnesses",
    false,
  );
  value.recoveryWitnessPeerIds.forEach((peerId) =>
    assertIdentifier(peerId, "Objective witness peerId"),
  );
  if (
    value.recoveryWitnessPeerIds.length < 3 ||
    value.recoveryWitnessPeerIds.includes(value.issuerPeerId)
  )
    throw new TypeError("Mesh Objective witnesses are invalid");
  if (value.authorizedObserverPeerIds !== undefined)
    assertSortedStringArray(
      value.authorizedObserverPeerIds,
      limits.maximumIssuerAuthorities,
      "Objective observers",
      true,
    );
  value.authorizedObserverPeerIds?.forEach((peerId) =>
    assertIdentifier(peerId, "Objective observer peerId"),
  );
  for (const number of [
    value.maximumWorkItems,
    value.maximumConcurrentAssignments,
    value.maximumBudgetUnits,
    value.bidWindowMs,
    value.acceptanceWindowMs,
    value.maximumLeaseDurationMs,
    value.recoveryGraceMs,
    value.maximumLeaseRenewals,
  ]) {
    if (!Number.isSafeInteger(number) || number < 0)
      throw new TypeError("Mesh Objective policy value is invalid");
  }
  if (
    value.maximumWorkItems < 1 ||
    value.maximumConcurrentAssignments < 1 ||
    value.maximumConcurrentAssignments > value.maximumWorkItems ||
    value.bidWindowMs < 1 ||
    value.acceptanceWindowMs < 1 ||
    value.maximumLeaseDurationMs < 1 ||
    value.recoveryGraceMs < 1 ||
    !Number.isSafeInteger(value.workItemCount) ||
    value.workItemCount < 0 ||
    value.workItemCount > value.maximumWorkItems ||
    !Number.isSafeInteger(value.reservedBudgetUnits) ||
    !Number.isSafeInteger(value.committedBudgetUnits) ||
    value.reservedBudgetUnits < 0 ||
    value.committedBudgetUnits < 0 ||
    value.reservedBudgetUnits + value.committedBudgetUnits >
      value.maximumBudgetUnits
  )
    throw new TypeError("Mesh Objective policy value is invalid");
  if (
    !Number.isSafeInteger(value.recoveryWitnessThreshold) ||
    value.recoveryWitnessThreshold <= value.recoveryWitnessPeerIds.length / 2 ||
    value.recoveryWitnessThreshold > value.recoveryWitnessPeerIds.length
  )
    throw new TypeError("Mesh Objective witness threshold is invalid");
  assertTimestamp(value.validFrom, "Objective validFrom");
  assertTimestamp(value.validUntil, "Objective validUntil");
  assertTimestamp(value.validityVerifiedAt, "Objective validityVerifiedAt");
  assertMeshMessageId(value.acceptedMessageId);
  if (
    compare(value.validFrom, value.validUntil) >= 0 ||
    compare(value.validityVerifiedAt, value.validFrom) < 0 ||
    compare(value.validityVerifiedAt, value.validUntil) >= 0
  )
    throw new TypeError("Mesh Objective validity is invalid");
  for (const number of [value.acceptedAt, value.expiresAt])
    assertMeshLogicalTime(number);
  if (
    value.acceptedAt > lastLogicalTime ||
    value.expiresAt < value.acceptedAt ||
    !["active", "cancelled", "expired"].includes(value.status)
  )
    throw new TypeError("Mesh Objective state is invalid");
  const hasTimer =
    value.expiryTimerId !== undefined ||
    value.expiryTimerGeneration !== undefined;
  if (value.status === "active") {
    if (
      !hasTimer ||
      value.terminalAt !== undefined ||
      value.terminalCancellation !== undefined ||
      value.terminalRecordKey !== undefined
    )
      throw new TypeError("Mesh active Objective timer is invalid");
    assertTimerIdentifier(value.expiryTimerId as string, "Objective timerId");
    if (
      value.expiryTimerId !== objectiveTimerId(value.objectiveId) ||
      !Number.isSafeInteger(value.expiryTimerGeneration) ||
      (value.expiryTimerGeneration as number) < 1
    )
      throw new TypeError("Mesh Objective timer generation is invalid");
  } else if (value.status === "cancelled") {
    if (
      hasTimer ||
      value.terminalAt === undefined ||
      value.terminalCancellation === undefined ||
      value.terminalRecordKey === undefined
    )
      throw new TypeError(
        "Mesh cancelled Objective terminal binding is invalid",
      );
    assertMeshLogicalTime(value.terminalAt);
    assertCancellationRecordKey(value.terminalRecordKey);
    freezeAcceptedObjectiveCancellation(
      value.terminalCancellation,
      value,
      limits,
      verifyDigest,
    );
    if (
      value.terminalAt < value.acceptedAt ||
      value.terminalAt >= value.expiresAt ||
      value.terminalAt > lastLogicalTime
    )
      throw new TypeError("Mesh cancelled Objective time is invalid");
  } else if (
    hasTimer ||
    value.terminalAt === undefined ||
    value.terminalAt < value.expiresAt ||
    value.terminalAt > lastLogicalTime ||
    value.terminalRecordKey !== undefined ||
    value.terminalCancellation !== undefined
  ) {
    throw new TypeError("Mesh expired Objective terminal binding is invalid");
  }
  assertByteBound(value, limits.maximumProjectionBytes, "Objective projection");
}

function validateWorkItem(
  value: MeshWorkItemProjection,
  limits: MeshObjectiveWorkLimits,
  lastLogicalTime: number,
): void {
  assertPlainRecord(value, "Work Item projection");
  assertExactKeys(
    value,
    [
      "budgetReservationUnits",
      "completionCriteria",
      "createdAt",
      "expiryTimerGeneration",
      "expiryTimerId",
      "inputReference",
      "inputSummary",
      "matchingAttributes",
      "objectiveDocumentId",
      "objectiveId",
      "objectivePolicy",
      "objectiveRevision",
      "offerAttempt",
      "ownerEpoch",
      "ownerPeerId",
      "requiredCapabilityKeys",
      "status",
      "terminalAt",
      "updatedAt",
      "workDeadline",
      "workDeadlineAt",
      "workItemId",
      "workItemRevision",
    ],
    [
      "budgetReservationUnits",
      "completionCriteria",
      "createdAt",
      "matchingAttributes",
      "objectiveDocumentId",
      "objectiveId",
      "objectivePolicy",
      "objectiveRevision",
      "offerAttempt",
      "ownerEpoch",
      "ownerPeerId",
      "requiredCapabilityKeys",
      "status",
      "updatedAt",
      "workDeadline",
      "workDeadlineAt",
      "workItemId",
      "workItemRevision",
    ],
  );
  for (const [name, id] of Object.entries({
    objectiveId: value.objectiveId,
    objectiveDocumentId: value.objectiveDocumentId,
    workItemId: value.workItemId,
    ownerPeerId: value.ownerPeerId,
  }))
    assertIdentifier(id, name);
  validateWorkObjectivePolicy(value.objectivePolicy, limits, lastLogicalTime);
  if (
    value.objectivePolicy.objectiveId !== value.objectiveId ||
    value.objectivePolicy.objectiveDocumentId !== value.objectiveDocumentId ||
    value.objectivePolicy.objectiveRevision !== value.objectiveRevision ||
    !Number.isSafeInteger(value.objectiveRevision) ||
    value.objectiveRevision < 1 ||
    !Number.isSafeInteger(value.workItemRevision) ||
    value.workItemRevision < 1 ||
    value.ownerEpoch !== 1 ||
    !Number.isSafeInteger(value.offerAttempt) ||
    value.offerAttempt < 0
  )
    throw new TypeError("Mesh Work Item version is invalid");
  assertSortedStringArray(
    value.requiredCapabilityKeys,
    limits.maximumRequiredCapabilityKeys,
    "Work Item capability keys",
    false,
  );
  assertStringArray(
    value.completionCriteria,
    limits.maximumCriteria,
    "Work Item completion criteria",
  );
  assertStringRecord(
    value.matchingAttributes,
    limits.maximumMatchingAttributes,
    "Work Item matching attributes",
  );
  assertStringXor(value.inputSummary, value.inputReference, "Work Item input");
  const hasTimer =
    value.expiryTimerId !== undefined ||
    value.expiryTimerGeneration !== undefined;
  if (
    !Number.isSafeInteger(value.budgetReservationUnits) ||
    value.budgetReservationUnits < 0 ||
    !["ready", "completed", "released", "cancelled", "expired"].includes(
      value.status,
    ) ||
    (value.status === "ready" &&
      (!hasTimer ||
        !Number.isSafeInteger(value.expiryTimerGeneration) ||
        (value.expiryTimerGeneration as number) < 1 ||
        typeof value.expiryTimerId !== "string" ||
        value.expiryTimerId !==
          workTimerId(value.objectiveId, value.workItemId))) ||
    (value.status !== "ready" && hasTimer)
  )
    throw new TypeError("Mesh Work Item fields are invalid");
  assertTimestamp(value.workDeadline, "Work Item deadline");
  for (const number of [value.workDeadlineAt, value.createdAt, value.updatedAt])
    assertMeshLogicalTime(number);
  if (
    value.requiredCapabilityKeys.some(
      (key) => !value.objectivePolicy.permittedCapabilityKeys.includes(key),
    ) ||
    value.budgetReservationUnits > value.objectivePolicy.maximumBudgetUnits ||
    compare(value.workDeadline, value.objectivePolicy.validUntil) > 0 ||
    value.workDeadlineAt > value.objectivePolicy.expiresAt ||
    value.updatedAt < value.objectivePolicy.acceptedAt
  )
    throw new TypeError("Mesh Work Item Objective policy binding is invalid");
  if (
    value.workDeadlineAt < value.createdAt ||
    value.createdAt > value.updatedAt ||
    value.updatedAt > lastLogicalTime ||
    (value.status === "ready" && value.terminalAt !== undefined) ||
    (["completed", "released", "cancelled"].includes(value.status) &&
      (value.terminalAt === undefined ||
        value.terminalAt !== value.updatedAt ||
        value.terminalAt < value.createdAt ||
        value.terminalAt >= value.workDeadlineAt ||
        value.terminalAt > lastLogicalTime)) ||
    (value.status === "expired" &&
      (value.terminalAt === undefined ||
        value.terminalAt !== value.updatedAt ||
        value.terminalAt < value.workDeadlineAt ||
        value.terminalAt > lastLogicalTime))
  )
    throw new TypeError("Mesh Work Item time is invalid");
  assertByteBound(value, limits.maximumProjectionBytes, "Work Item projection");
}

function freezeIssuerAuthority(
  value: MeshObjectiveIssuerAuthority,
  limits: MeshObjectiveWorkLimits,
): MeshObjectiveIssuerAuthority {
  assertPlainRecord(value, "issuer authority");
  assertExactKeys(
    value,
    ["keyIds", "peerId", "validUntil"],
    ["keyIds", "peerId", "validUntil"],
  );
  assertIdentifier(value.peerId, "issuer peerId");
  assertTimestamp(value.validUntil, "issuer validUntil");
  if (
    !isDenseDataArray(value.keyIds) ||
    value.keyIds.length < 1 ||
    value.keyIds.length > limits.maximumIssuerKeys ||
    value.keyIds.some((key) => typeof key !== "string") ||
    new Set(value.keyIds).size !== value.keyIds.length ||
    value.keyIds.some(
      (key, index) => index > 0 && key <= (value.keyIds[index - 1] as string),
    )
  )
    throw new TypeError("Mesh Objective issuer key list is invalid");
  value.keyIds.forEach((key) => assertIdentifier(key, "issuer keyId"));
  return Object.freeze({
    peerId: value.peerId,
    keyIds: Object.freeze([...value.keyIds]),
    validUntil: value.validUntil,
  });
}

function freezeObjective(
  value: MeshObjectiveProjection,
  limits: MeshObjectiveWorkLimits,
  lastLogicalTime: number,
  verifyDigest: boolean,
): MeshObjectiveProjection {
  validateObjective(value, limits, lastLogicalTime, verifyDigest);
  const terminalCancellation =
    value.terminalCancellation === undefined
      ? undefined
      : freezeAcceptedObjectiveCancellation(
          value.terminalCancellation,
          value,
          limits,
          verifyDigest,
        );
  return Object.freeze({
    ...value,
    successCriteria: Object.freeze([...value.successCriteria]),
    permittedCapabilityKeys: Object.freeze([...value.permittedCapabilityKeys]),
    recoveryWitnessPeerIds: Object.freeze([...value.recoveryWitnessPeerIds]),
    ...(terminalCancellation === undefined ? {} : { terminalCancellation }),
    ...(value.authorizedObserverPeerIds === undefined
      ? {}
      : {
          authorizedObserverPeerIds: Object.freeze([
            ...value.authorizedObserverPeerIds,
          ]),
        }),
  });
}
function freezeWorkItem(
  value: MeshWorkItemProjection,
  limits: MeshObjectiveWorkLimits,
  lastLogicalTime: number,
): MeshWorkItemProjection {
  validateWorkItem(value, limits, lastLogicalTime);
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

function freezeAcceptedObjectiveDocument(
  value: MeshAcceptedObjectiveDocument,
  limits: MeshObjectiveWorkLimits,
  lastLogicalTime: number,
  verifyDigest: boolean,
): MeshAcceptedObjectiveDocument {
  assertPlainRecord(value, "accepted Objective document");
  assertExactKeys(
    value,
    ["acceptedAt", "envelope", "expiresAt", "validityVerifiedAt"],
    ["acceptedAt", "envelope", "expiresAt", "validityVerifiedAt"],
  );
  assertTimestamp(
    value.validityVerifiedAt,
    "accepted Objective validityVerifiedAt",
  );
  assertMeshLogicalTime(value.acceptedAt);
  assertMeshLogicalTime(value.expiresAt);
  if (
    value.acceptedAt > lastLogicalTime ||
    value.expiresAt <= value.acceptedAt
  ) {
    throw new TypeError("Mesh accepted Objective document time is invalid");
  }
  const validated = validateSignedMeshEnvelope(value.envelope);
  if (
    !validated.ok ||
    (validated.value.payload.type !== "objective.announce" &&
      validated.value.payload.type !== "objective.revise")
  ) {
    throw new TypeError("Mesh accepted Objective envelope is invalid");
  }
  const envelope =
    validated.value as SignedMeshEnvelope<MeshObjectiveRevisionPayload>;
  if (
    compare(value.validityVerifiedAt, envelope.payload.validFrom) < 0 ||
    compare(value.validityVerifiedAt, envelope.payload.validUntil) >= 0
  ) {
    throw new TypeError("Mesh accepted Objective validity is invalid");
  }
  const expectedExpiry = logicalExpiry(
    envelope.payload.validFrom,
    envelope.payload.validUntil,
    value.validityVerifiedAt,
    value.acceptedAt,
  );
  if (!expectedExpiry.ok || expectedExpiry.at !== value.expiresAt) {
    throw new TypeError("Mesh accepted Objective logical expiry is invalid");
  }
  const canonical = canonicalizeMeshPayload(envelope.payload);
  if (!canonical.ok) {
    throw new TypeError("Mesh accepted Objective payload is invalid");
  }
  if (
    verifyDigest &&
    envelope.payloadHash !== `sha256:${sha256Base64Url(canonical.value)}`
  ) {
    throw new TypeError("Mesh accepted Objective payload digest is invalid");
  }
  const document = Object.freeze({
    envelope,
    validityVerifiedAt: value.validityVerifiedAt,
    acceptedAt: value.acceptedAt,
    expiresAt: value.expiresAt,
  });
  assertByteBound(
    document,
    limits.maximumProjectionBytes,
    "accepted Objective document",
  );
  return document;
}

function freezeAcceptedObjectiveCancellation(
  value: MeshAcceptedObjectiveCancellation,
  objective: MeshObjectiveProjection,
  limits: MeshObjectiveWorkLimits,
  verifyDigest: boolean,
): MeshAcceptedObjectiveCancellation {
  assertPlainRecord(value, "accepted Objective cancellation");
  assertExactKeys(
    value,
    ["envelope", "validityVerifiedAt"],
    ["envelope", "validityVerifiedAt"],
  );
  assertTimestamp(
    value.validityVerifiedAt,
    "accepted Objective cancellation validityVerifiedAt",
  );
  const validated = validateSignedMeshEnvelope(value.envelope);
  if (!validated.ok || validated.value.payload.type !== "objective.cancel") {
    throw new TypeError("Mesh accepted Objective cancellation is invalid");
  }
  const envelope =
    validated.value as SignedMeshEnvelope<ObjectiveCancelPayload>;
  const payload = envelope.payload;
  if (
    payload.objectiveId !== objective.objectiveId ||
    payload.objectiveDocumentId !== objective.objectiveDocumentId ||
    payload.objectiveRevision !== objective.objectiveRevision ||
    envelope.sender.peerId !== objective.issuerPeerId ||
    envelope.causationId !== objective.acceptedMessageId ||
    objective.terminalRecordKey !==
      JSON.stringify(["objective.cancel", payload.cancellationId]) ||
    compare(value.validityVerifiedAt, objective.validityVerifiedAt) < 0 ||
    compare(value.validityVerifiedAt, objective.validUntil) >= 0
  ) {
    throw new TypeError(
      "Mesh accepted Objective cancellation binding is invalid",
    );
  }
  const canonical = canonicalizeMeshPayload(payload);
  if (!canonical.ok) {
    throw new TypeError(
      "Mesh accepted Objective cancellation payload is invalid",
    );
  }
  if (
    verifyDigest &&
    envelope.payloadHash !== `sha256:${sha256Base64Url(canonical.value)}`
  ) {
    throw new TypeError(
      "Mesh accepted Objective cancellation payload digest is invalid",
    );
  }
  const cancellation = Object.freeze({
    envelope,
    validityVerifiedAt: value.validityVerifiedAt,
  });
  assertByteBound(
    cancellation,
    limits.maximumProjectionBytes,
    "accepted Objective cancellation",
  );
  return cancellation;
}

function freezeWorkObjectivePolicy(
  value: MeshWorkObjectivePolicySnapshot,
  limits: MeshObjectiveWorkLimits,
  lastLogicalTime: number,
): MeshWorkObjectivePolicySnapshot {
  validateWorkObjectivePolicy(value, limits, lastLogicalTime);
  return Object.freeze({
    ...value,
    permittedCapabilityKeys: Object.freeze([...value.permittedCapabilityKeys]),
  });
}

function validateAcceptedObjectiveChain(
  document: MeshAcceptedObjectiveDocument,
  documents: ReadonlyMap<string, MeshAcceptedObjectiveDocument>,
): void {
  const { envelope } = document;
  const payload = envelope.payload;
  if (payload.objectiveRevision === 1) {
    if (
      payload.type !== "objective.announce" ||
      envelope.causationId !== undefined
    ) {
      throw new TypeError("Mesh accepted Objective history is invalid");
    }
    return;
  }
  if (payload.type !== "objective.revise") {
    throw new TypeError("Mesh accepted Objective history is invalid");
  }
  const previous = documents.get(
    objectivePolicyKey(payload.objectiveId, payload.objectiveRevision - 1),
  );
  if (
    !previous ||
    previous.envelope.payload.objectiveDocumentId !==
      payload.previousObjectiveDocumentId ||
    previous.envelope.messageId !== envelope.causationId ||
    previous.envelope.sender.peerId !== envelope.sender.peerId ||
    previous.acceptedAt > document.acceptedAt ||
    compare(previous.validityVerifiedAt, document.validityVerifiedAt) > 0
  ) {
    throw new TypeError("Mesh accepted Objective history is invalid");
  }
}

function policyMatchesAcceptedDocument(
  policy: MeshWorkObjectivePolicySnapshot,
  document: MeshAcceptedObjectiveDocument | undefined,
): boolean {
  if (!document) return false;
  const { envelope } = document;
  const payload = envelope.payload;
  return (
    policy.objectiveId === payload.objectiveId &&
    policy.objectiveDocumentId === payload.objectiveDocumentId &&
    policy.objectiveRevision === payload.objectiveRevision &&
    policy.acceptedMessageId === envelope.messageId &&
    policy.acceptedAt === document.acceptedAt &&
    policy.expiresAt === document.expiresAt &&
    policy.maximumBudgetUnits === payload.maximumBudgetUnits &&
    policy.validUntil === payload.validUntil &&
    arraysEqual(policy.permittedCapabilityKeys, payload.permittedCapabilityKeys)
  );
}

function objectiveMatchesAcceptedDocument(
  objective: MeshObjectiveProjection,
  document: MeshAcceptedObjectiveDocument | undefined,
): boolean {
  if (!document) return false;
  const { envelope } = document;
  const payload = envelope.payload;
  return (
    objective.objectiveId === payload.objectiveId &&
    objective.objectiveDocumentId === payload.objectiveDocumentId &&
    objective.objectiveRevision === payload.objectiveRevision &&
    objective.issuerPeerId === payload.issuerPeerId &&
    objective.issuerPeerId === envelope.sender.peerId &&
    objective.issuerKeyId === envelope.proof.keyId &&
    objective.summary === payload.summary &&
    objective.contentReference === payload.contentReference &&
    arraysEqual(objective.successCriteria, payload.successCriteria) &&
    arraysEqual(
      objective.permittedCapabilityKeys,
      payload.permittedCapabilityKeys,
    ) &&
    objective.maximumWorkItems === payload.maximumWorkItems &&
    objective.maximumConcurrentAssignments ===
      payload.maximumConcurrentAssignments &&
    objective.maximumBudgetUnits === payload.maximumBudgetUnits &&
    objective.bidWindowMs === payload.bidWindowMs &&
    objective.acceptanceWindowMs === payload.acceptanceWindowMs &&
    objective.maximumLeaseDurationMs === payload.maximumLeaseDurationMs &&
    objective.recoveryGraceMs === payload.recoveryGraceMs &&
    objective.maximumLeaseRenewals === payload.maximumLeaseRenewals &&
    arraysEqual(
      objective.recoveryWitnessPeerIds,
      payload.recoveryWitnessPeerIds,
    ) &&
    objective.recoveryWitnessThreshold === payload.recoveryWitnessThreshold &&
    arraysEqualOptional(
      objective.authorizedObserverPeerIds,
      payload.authorizedObserverPeerIds,
    ) &&
    objective.validFrom === payload.validFrom &&
    objective.validUntil === payload.validUntil &&
    objective.validityVerifiedAt === document.validityVerifiedAt &&
    objective.acceptedMessageId === envelope.messageId &&
    objective.acceptedAt === document.acceptedAt &&
    objective.expiresAt === document.expiresAt
  );
}

function validateWorkObjectivePolicy(
  value: MeshWorkObjectivePolicySnapshot,
  limits: MeshObjectiveWorkLimits,
  lastLogicalTime: number,
): void {
  assertPlainRecord(value, "Work Objective policy");
  assertExactKeys(
    value,
    [
      "acceptedAt",
      "acceptedMessageId",
      "expiresAt",
      "maximumBudgetUnits",
      "objectiveDocumentId",
      "objectiveId",
      "objectiveRevision",
      "permittedCapabilityKeys",
      "validUntil",
    ],
    [
      "acceptedAt",
      "acceptedMessageId",
      "expiresAt",
      "maximumBudgetUnits",
      "objectiveDocumentId",
      "objectiveId",
      "objectiveRevision",
      "permittedCapabilityKeys",
      "validUntil",
    ],
  );
  assertIdentifier(value.objectiveId, "Work policy objectiveId");
  assertIdentifier(
    value.objectiveDocumentId,
    "Work policy objectiveDocumentId",
  );
  assertMeshMessageId(value.acceptedMessageId);
  if (
    !Number.isSafeInteger(value.objectiveRevision) ||
    value.objectiveRevision < 1 ||
    !Number.isSafeInteger(value.maximumBudgetUnits) ||
    value.maximumBudgetUnits < 0
  )
    throw new TypeError("Mesh Work Objective policy value is invalid");
  assertSortedStringArray(
    value.permittedCapabilityKeys,
    limits.maximumRequiredCapabilityKeys,
    "Work Objective policy capability keys",
  );
  assertTimestamp(value.validUntil, "Work Objective policy validUntil");
  assertMeshLogicalTime(value.acceptedAt);
  assertMeshLogicalTime(value.expiresAt);
  if (value.acceptedAt > lastLogicalTime || value.expiresAt <= value.acceptedAt)
    throw new TypeError("Mesh Work Objective policy time is invalid");
  assertByteBound(
    value,
    limits.maximumProjectionBytes,
    "Objective policy projection",
  );
}

function policyMatchesObjective(
  policy: MeshWorkObjectivePolicySnapshot | undefined,
  objective: MeshObjectiveProjection,
): boolean {
  return (
    policy !== undefined &&
    policy.objectiveId === objective.objectiveId &&
    policy.objectiveDocumentId === objective.objectiveDocumentId &&
    policy.objectiveRevision === objective.objectiveRevision &&
    policy.acceptedMessageId === objective.acceptedMessageId &&
    policy.acceptedAt === objective.acceptedAt &&
    policy.expiresAt === objective.expiresAt &&
    policy.maximumBudgetUnits === objective.maximumBudgetUnits &&
    policy.validUntil === objective.validUntil &&
    arraysEqual(
      policy.permittedCapabilityKeys,
      objective.permittedCapabilityKeys,
    )
  );
}

function policiesEqual(
  left: MeshWorkObjectivePolicySnapshot,
  right: MeshWorkObjectivePolicySnapshot,
): boolean {
  return (
    left.objectiveId === right.objectiveId &&
    left.objectiveDocumentId === right.objectiveDocumentId &&
    left.objectiveRevision === right.objectiveRevision &&
    left.acceptedMessageId === right.acceptedMessageId &&
    left.acceptedAt === right.acceptedAt &&
    left.expiresAt === right.expiresAt &&
    left.maximumBudgetUnits === right.maximumBudgetUnits &&
    left.validUntil === right.validUntil &&
    arraysEqual(left.permittedCapabilityKeys, right.permittedCapabilityKeys)
  );
}

function resolveLimits(
  overrides: Partial<MeshObjectiveWorkLimits> | undefined,
  complete: boolean,
): Readonly<MeshObjectiveWorkLimits> {
  if (overrides !== undefined) {
    assertPlainRecord(overrides, "limits");
    assertExactKeys(overrides, limitKeys, complete ? limitKeys : []);
  }
  const limits = { ...DEFAULT_MESH_OBJECTIVE_WORK_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    const ceiling =
      DEFAULT_MESH_OBJECTIVE_WORK_LIMITS[name as keyof MeshObjectiveWorkLimits];
    if (!Number.isSafeInteger(value) || value < 1 || value > ceiling)
      throw new RangeError(`Mesh Objective/Work limit ${name} is invalid`);
  }
  return Object.freeze(limits);
}
function freezeIdentity(identity: MeshPeerIdentity): MeshPeerIdentity {
  assertPlainRecord(identity, "identity");
  assertExactKeys(identity, identityKeys, identityKeys);
  for (const [name, value] of Object.entries(identity))
    assertIdentifier(value, name);
  return Object.freeze({ ...identity });
}
function assertIdentifier(value: unknown, name: string): void {
  if (
    typeof value !== "string" ||
    !identifierPattern.test(value) ||
    utf8Encoder.encode(value).byteLength > 256
  )
    throw new TypeError(`Invalid Mesh Objective/Work ${name}`);
}
function assertTimerIdentifier(value: unknown, name: string): void {
  if (
    typeof value !== "string" ||
    !identifierPattern.test(value) ||
    utf8Encoder.encode(value).byteLength > 768
  )
    throw new TypeError(`Invalid Mesh Objective/Work ${name}`);
}
function assertTimestamp(value: unknown, name: string): void {
  if (typeof value !== "string" || !compareMeshTimestamps(value, value).ok)
    throw new TypeError(`Invalid Mesh Objective/Work ${name}`);
}
function compare(left: string, right: string): number {
  const result = compareMeshTimestamps(left, right);
  if (!result.ok) throw new TypeError("Invalid Mesh Objective/Work timestamp");
  return result.value;
}
function assertStringArray(
  value: unknown,
  maximum: number,
  name: string,
): asserts value is readonly string[] {
  if (
    !isDenseDataArray(value) ||
    value.length < 1 ||
    value.length > maximum ||
    value.some((entry) => typeof entry !== "string" || entry.length < 1) ||
    new Set(value).size !== value.length
  )
    throw new TypeError(`Invalid Mesh ${name}`);
}
function assertSortedStringArray(
  value: unknown,
  maximum: number,
  name: string,
  allowEmpty = false,
): asserts value is readonly string[] {
  if (allowEmpty && isDenseDataArray(value) && value.length === 0) return;
  assertStringArray(value, maximum, name);
  if (
    value.some(
      (entry, index) => index > 0 && entry <= (value[index - 1] as string),
    )
  )
    throw new TypeError(`Invalid Mesh ${name}`);
}
function assertStringRecord(
  value: unknown,
  maximum: number,
  name: string,
): void {
  assertRecord(value, name);
  const entries = Object.entries(value);
  if (
    entries.length > maximum ||
    entries.some(([key, entry]) => key.length < 1 || typeof entry !== "string")
  )
    throw new TypeError(`Invalid Mesh ${name}`);
}
function assertStringXor(left: unknown, right: unknown, name: string): void {
  if (
    (typeof left === "string" && left.length > 0) ===
    (typeof right === "string" && right.length > 0)
  )
    throw new TypeError(`Invalid Mesh ${name}`);
}
function assertByteBound(value: unknown, maximum: number, name: string): void {
  if (utf8Encoder.encode(JSON.stringify(value)).byteLength > maximum)
    throw new RangeError(`Mesh ${name} exceeds its byte limit`);
}
function assertPlainRecord(
  value: unknown,
  name: string,
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== null &&
      Object.getPrototypeOf(value) !== Object.prototype) ||
    Object.getOwnPropertySymbols(value).length > 0 ||
    Object.values(Object.getOwnPropertyDescriptors(value)).some(
      (descriptor) =>
        !descriptor.enumerable || !Object.hasOwn(descriptor, "value"),
    )
  )
    throw new TypeError(`Mesh Objective/Work ${name} must be a plain record`);
}

function isDenseDataArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value) || Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const names = Object.keys(descriptors);
  if (
    names.length !== value.length + 1 ||
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
function assertRecord(
  value: unknown,
  name: string,
): asserts value is Record<string, unknown> {
  assertPlainRecord(value, name);
}
function assertExactKeys(
  value: object,
  supported: readonly string[],
  required: readonly string[],
): void {
  const allowed = new Set(supported);
  if (
    Object.keys(value).some((key) => !allowed.has(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  )
    throw new TypeError(
      "Mesh Objective/Work value contains unsupported fields",
    );
}
function workKey(objectiveId: string, workItemId: string): string {
  return JSON.stringify([objectiveId, workItemId]);
}
function objectiveTimerId(objectiveId: string): string {
  return `objective:${objectiveId.length}:${objectiveId}:expiry`;
}
function objectivePolicyKey(objectiveId: string, objectiveRevision: number) {
  return JSON.stringify([objectiveId, objectiveRevision]);
}
function workTimerId(objectiveId: string, workItemId: string): string {
  return `work:${objectiveId.length}:${objectiveId}:${workItemId.length}:${workItemId}:deadline`;
}
function arraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => entry === right[index])
  );
}
function arraysEqualOptional(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  return left === undefined
    ? right === undefined
    : right !== undefined && arraysEqual(left, right);
}
function isDeepFrozenData(value: unknown): boolean {
  if (!value || typeof value !== "object") return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every((entry) => isDeepFrozenData(entry));
}
function assertCancellationRecordKey(value: unknown): void {
  if (typeof value !== "string")
    throw new TypeError("Invalid Mesh Objective terminalRecordKey");
  try {
    const parsed = JSON.parse(value);
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      parsed[0] !== "objective.cancel" ||
      typeof parsed[1] !== "string"
    )
      throw new Error();
    assertIdentifier(parsed[1], "Objective cancellationId");
  } catch {
    throw new TypeError("Invalid Mesh Objective terminalRecordKey");
  }
}
