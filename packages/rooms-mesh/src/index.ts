import type { MeshAllocationInboundDecision } from "@agentplat/mesh/coordination";
import {
  createDelegationMandateProposalV1,
  projectCollectiveDecisionToRoomEvidenceV1,
  type DelegationMandateProposalV1,
} from "@agentplat/collective-control/rooms";
import type {
  CollectiveDecisionRecordV1,
  DelegationMandateStatementV1,
} from "@agentplat/collective-control";
import { computeMeshDurableValueDigest } from "@agentplat/mesh/durability";
import { canonicalizeMeshPayload } from "@agentplat/mesh-protocol";
import type {
  ObjectiveAnnouncePayload,
  WorkCheckpointPayload,
  WorkOfferPayload,
  WorkProgressPayload,
  WorkResultPayload,
} from "@agentplat/mesh-protocol";
import type {
  Approval,
  CreateArtifactInput,
  Room,
  RoomService,
  RoomTask,
} from "@agentplat/rooms";

export interface RoomCollectiveEvidenceProjectionV1 {
  readonly schemaVersion: 1;
  readonly kind: "room.artifact";
  readonly tenantId: string;
  readonly roomId: string;
  readonly input: Readonly<CreateArtifactInput>;
}

/**
 * Turns an explicitly approved Room decision into an unsigned proposal.
 * It performs no signing, mandate installation, persistence or execution.
 */
export function projectApprovedRoomDecisionToMandateProposalV1(input: {
  readonly room: Room;
  readonly approval: Approval;
  readonly proposalId: string;
  readonly statement: DelegationMandateStatementV1;
}): DelegationMandateProposalV1 {
  const { room, approval, statement } = input;
  if (
    !room ||
    !approval ||
    room.status !== "active" ||
    approval.status !== "approved" ||
    approval.tenantId !== room.tenantId ||
    approval.roomId !== room.id ||
    approval.decidedAt === undefined ||
    approval.decidedBy === undefined ||
    statement.tenantId !== room.tenantId
  )
    throw new TypeError("Room approval is not an accepted proposal source");
  return createDelegationMandateProposalV1({
    proposalId: input.proposalId,
    roomDecision: {
      schemaVersion: 1,
      roomId: room.id,
      approvalId: approval.id,
      targetType: approval.targetType,
      targetId: approval.targetId,
      targetVersion: approval.targetVersion ?? null,
      decidedAt: approval.decidedAt,
      decidedBy: approval.decidedBy,
    },
    statement,
  });
}

/** Pure evidence projection containing identifiers and digests only. */
export function projectCollectiveDecisionToRoomArtifactV1(input: {
  readonly room: Room;
  readonly record: CollectiveDecisionRecordV1;
  readonly createdBy?: string;
}): RoomCollectiveEvidenceProjectionV1 {
  if (!input.room || input.room.status !== "active")
    throw new TypeError("Collective evidence requires an active Room");
  const evidence = projectCollectiveDecisionToRoomEvidenceV1({
    roomId: input.room.id,
    record: input.record,
  });
  if (evidence.tenantId !== input.room.tenantId)
    throw new TypeError("Room and collective evidence scopes do not match");
  const stableId = `collective-evidence-${evidence.recordId}`;
  return deepFreeze({
    schemaVersion: 1 as const,
    kind: "room.artifact" as const,
    tenantId: input.room.tenantId,
    roomId: input.room.id,
    input: {
      id: stableId,
      type: "collective-decision-evidence",
      title: `Collective decision ${evidence.decisionKind}`,
      content: evidence as unknown as CreateArtifactInput["content"],
      contentType: "application/json",
      authors: input.createdBy === undefined ? [] : [input.createdBy],
      provenance: {
        sourceMessageIds: [],
        sourceArtifactIds: [],
        sourceMemoryIds: [],
      },
      assumptions: [],
      risks: [],
      ...(input.createdBy === undefined ? {} : { createdBy: input.createdBy }),
      metadata: {
        collectiveControlSchemaVersion: 1,
        policyDomainId: evidence.policyDomainId,
        recordId: evidence.recordId,
        recordDigest: evidence.recordDigest,
      },
    },
  });
}

export const ROOM_MESH_PROJECTION_SCHEMA_VERSION = 1 as const;

export interface RoomMeshObjectivePolicy {
  readonly objectiveId: string;
  readonly objectiveDocumentId: string;
  readonly objectiveRevision: number;
  readonly issuerPeerId: string;
  readonly successCriteria: readonly string[];
  readonly permittedCapabilityKeys: readonly string[];
  readonly maximumWorkItems: number;
  readonly maximumConcurrentAssignments: number;
  readonly maximumBudgetUnits: number;
  readonly bidWindowMs: number;
  readonly acceptanceWindowMs: number;
  readonly maximumLeaseDurationMs: number;
  readonly recoveryGraceMs: number;
  readonly maximumLeaseRenewals: number;
  readonly recoveryWitnessPeerIds: readonly string[];
  readonly recoveryWitnessThreshold: number;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly authorizedObserverPeerIds?: readonly string[];
  readonly contentReference?: string;
}

export interface RoomMeshObjectiveProjection {
  readonly schemaVersion: typeof ROOM_MESH_PROJECTION_SCHEMA_VERSION;
  readonly binding: {
    readonly tenantId: string;
    readonly roomId: string;
    readonly objectiveId: string;
    readonly objectiveRevision: number;
  };
  readonly payload: ObjectiveAnnouncePayload;
}

export interface RoomMeshWorkPolicy {
  readonly objectiveId: string;
  readonly objectiveDocumentId: string;
  readonly objectiveRevision: number;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly ownerPeerId: string;
  readonly ownerEpoch: number;
  readonly offerId: string;
  readonly offerAttempt: number;
  readonly previousOfferId?: string;
  readonly requiredCapabilityKeys: readonly string[];
  readonly matchingAttributes: Readonly<Record<string, string>>;
  readonly completionCriteria: readonly string[];
  readonly budgetReservationUnits: number;
  readonly bidDeadline: string;
  readonly workDeadline: string;
  readonly inputReference?: string;
}

export interface RoomMeshWorkProjection {
  readonly schemaVersion: typeof ROOM_MESH_PROJECTION_SCHEMA_VERSION;
  readonly binding: {
    readonly tenantId: string;
    readonly roomId: string;
    readonly taskId: string;
    readonly objectiveId: string;
    readonly workItemId: string;
    readonly workItemRevision: number;
  };
  readonly payload: WorkOfferPayload;
}

export interface RoomMeshInboundBinding {
  readonly bridgeId: string;
  readonly tenantId: string;
  readonly roomId: string;
  readonly taskId: string;
  readonly objectiveId: string;
  readonly workItemId: string;
  readonly authorParticipantId?: string;
}

export interface RoomMeshProjectionSource {
  readonly meshId: string;
  readonly messageId: string;
  readonly messageType: "work.progress" | "work.checkpoint" | "work.result";
  readonly senderPeerId: string;
  readonly objectiveId: string;
  readonly workItemId: string;
  readonly assignmentEpoch: number;
  readonly assignmentAuthorityId: string;
  readonly fencingToken: string;
}

export type RoomMeshInboundProjection =
  | {
      readonly schemaVersion: typeof ROOM_MESH_PROJECTION_SCHEMA_VERSION;
      readonly kind: "room.message";
      readonly idempotencyKey: string;
      readonly tenantId: string;
      readonly roomId: string;
      readonly taskId: string;
      readonly source: RoomMeshProjectionSource;
      readonly input: {
        readonly id: string;
        readonly authorParticipantId?: string;
        readonly role: "agent";
        readonly content: string;
        readonly metadata: NonNullable<CreateArtifactInput["metadata"]>;
      };
    }
  | {
      readonly schemaVersion: typeof ROOM_MESH_PROJECTION_SCHEMA_VERSION;
      readonly kind: "room.artifact";
      readonly idempotencyKey: string;
      readonly tenantId: string;
      readonly roomId: string;
      readonly taskId: string;
      readonly source: RoomMeshProjectionSource;
      readonly input: Readonly<CreateArtifactInput>;
    };

export interface RoomMeshProjectionClaim {
  readonly idempotencyKey: string;
  readonly workerId: string;
  readonly leaseToken: string;
  readonly generation: number;
  readonly expiresAt: number;
}

export type RoomMeshProjectionClaimResult =
  | { readonly status: "claimed"; readonly claim: RoomMeshProjectionClaim }
  | { readonly status: "completed" }
  | { readonly status: "busy" };

export interface RoomMeshIdempotencyRepository {
  claim(input: {
    readonly idempotencyKey: string;
    readonly workerId: string;
    readonly leaseDurationMs: number;
  }): RoomMeshProjectionClaimResult | Promise<RoomMeshProjectionClaimResult>;
  complete(claim: RoomMeshProjectionClaim): boolean | Promise<boolean>;
  abandon(claim: RoomMeshProjectionClaim): boolean | Promise<boolean>;
}

export interface RoomMeshProjectionSink {
  apply(
    projection: RoomMeshInboundProjection,
    idempotencyKey: string,
  ):
    | { readonly applied: boolean; readonly duplicate?: boolean }
    | Promise<{ readonly applied: boolean; readonly duplicate?: boolean }>;
}

export interface RoomMeshBridgeOptions {
  readonly bridgeId: string;
  readonly workerId: string;
  readonly idempotency: RoomMeshIdempotencyRepository;
  readonly sink: RoomMeshProjectionSink;
  readonly leaseDurationMs?: number;
}

export type RoomMeshBridgeApplyResult =
  | { readonly status: "applied" }
  | { readonly status: "duplicate" }
  | { readonly status: "busy" }
  | { readonly status: "claim_lost" };

export interface RoomMeshBridge {
  apply(
    projection: RoomMeshInboundProjection,
  ): Promise<RoomMeshBridgeApplyResult>;
}

/** Pure projection; Room metadata, participants and roles are not authority inputs. */
export function projectRoomToMeshObjective(input: {
  readonly room: Room;
  readonly policy: RoomMeshObjectivePolicy;
}): RoomMeshObjectiveProjection {
  const { room, policy } = input;
  if (!room || room.status !== "active") {
    throw new TypeError("Only an active Room can be projected");
  }
  const payload: ObjectiveAnnouncePayload = {
    type: "objective.announce",
    objectiveDocumentId: policy.objectiveDocumentId,
    objectiveId: policy.objectiveId,
    objectiveRevision: policy.objectiveRevision,
    issuerPeerId: policy.issuerPeerId,
    successCriteria: [...policy.successCriteria],
    permittedCapabilityKeys: [...policy.permittedCapabilityKeys],
    maximumWorkItems: policy.maximumWorkItems,
    maximumConcurrentAssignments: policy.maximumConcurrentAssignments,
    maximumBudgetUnits: policy.maximumBudgetUnits,
    bidWindowMs: policy.bidWindowMs,
    acceptanceWindowMs: policy.acceptanceWindowMs,
    maximumLeaseDurationMs: policy.maximumLeaseDurationMs,
    recoveryGraceMs: policy.recoveryGraceMs,
    maximumLeaseRenewals: policy.maximumLeaseRenewals,
    recoveryWitnessPeerIds: [...policy.recoveryWitnessPeerIds],
    recoveryWitnessThreshold: policy.recoveryWitnessThreshold,
    validFrom: policy.validFrom,
    validUntil: policy.validUntil,
    ...(policy.authorizedObserverPeerIds === undefined
      ? {}
      : { authorizedObserverPeerIds: [...policy.authorizedObserverPeerIds] }),
    ...(policy.contentReference === undefined
      ? { summary: room.goal }
      : { contentReference: policy.contentReference }),
  };
  return Object.freeze({
    schemaVersion: ROOM_MESH_PROJECTION_SCHEMA_VERSION,
    binding: Object.freeze({
      tenantId: room.tenantId,
      roomId: room.id,
      objectiveId: policy.objectiveId,
      objectiveRevision: policy.objectiveRevision,
    }),
    payload: validateAndFreezePayload(payload),
  });
}

/** Pure projection; assignment fields must come from the explicit Mesh policy. */
export function projectRoomTaskToMeshWork(input: {
  readonly room: Room;
  readonly task: RoomTask;
  readonly policy: RoomMeshWorkPolicy;
}): RoomMeshWorkProjection {
  const { room, task, policy } = input;
  if (
    !room ||
    !task ||
    room.tenantId !== task.tenantId ||
    room.id !== task.roomId ||
    room.status !== "active" ||
    task.status !== "pending"
  ) {
    throw new TypeError("Room task projection scope or lifecycle is invalid");
  }
  const payload: WorkOfferPayload = {
    type: "work.offer",
    offerId: policy.offerId,
    objectiveId: policy.objectiveId,
    objectiveDocumentId: policy.objectiveDocumentId,
    objectiveRevision: policy.objectiveRevision,
    workItemId: policy.workItemId,
    workItemRevision: policy.workItemRevision,
    ownerPeerId: policy.ownerPeerId,
    ownerEpoch: policy.ownerEpoch,
    offerAttempt: policy.offerAttempt,
    ...(policy.previousOfferId === undefined
      ? {}
      : { previousOfferId: policy.previousOfferId }),
    requiredCapabilityKeys: [...policy.requiredCapabilityKeys],
    matchingAttributes: { ...policy.matchingAttributes },
    completionCriteria: [...policy.completionCriteria],
    budgetReservationUnits: policy.budgetReservationUnits,
    bidDeadline: policy.bidDeadline,
    workDeadline: policy.workDeadline,
    ...(policy.inputReference === undefined
      ? { inputSummary: task.instruction }
      : { inputReference: policy.inputReference }),
  };
  return Object.freeze({
    schemaVersion: ROOM_MESH_PROJECTION_SCHEMA_VERSION,
    binding: Object.freeze({
      tenantId: room.tenantId,
      roomId: room.id,
      taskId: task.id,
      objectiveId: policy.objectiveId,
      workItemId: policy.workItemId,
      workItemRevision: policy.workItemRevision,
    }),
    payload: validateAndFreezePayload(payload),
  });
}

/**
 * Projects a caller-asserted verified and accepted Work record into an ordinary
 * Room message or draft artifact. It performs no Room mutation.
 */
export async function projectAcceptedMeshWorkToRoom(input: {
  readonly decision: MeshAllocationInboundDecision;
  readonly binding: RoomMeshInboundBinding;
}): Promise<RoomMeshInboundProjection> {
  const { decision, binding } = input;
  if (!decision?.accepted) {
    throw new TypeError("Room projection requires an accepted Mesh decision");
  }
  const payload = decision.envelope.payload;
  if (
    payload.type !== "work.progress" &&
    payload.type !== "work.checkpoint" &&
    payload.type !== "work.result"
  ) {
    throw new TypeError("Mesh record cannot be projected into a Room");
  }
  if (
    decision.envelope.tenantId !== binding.tenantId ||
    decision.envelope.objectiveId !== binding.objectiveId ||
    payload.objectiveId !== binding.objectiveId ||
    payload.workItemId !== binding.workItemId
  ) {
    throw new TypeError("Room and Mesh projection scopes do not match");
  }
  assertIdentifier(binding.bridgeId, "bridgeId");
  assertIdentifier(binding.roomId, "roomId");
  assertIdentifier(binding.taskId, "taskId");
  if (binding.authorParticipantId !== undefined) {
    assertIdentifier(binding.authorParticipantId, "authorParticipantId");
  }
  const idempotencyDigest = await computeMeshDurableValueDigest({
    schemaVersion: ROOM_MESH_PROJECTION_SCHEMA_VERSION,
    bridgeId: binding.bridgeId,
    tenantId: binding.tenantId,
    roomId: binding.roomId,
    taskId: binding.taskId,
    meshId: decision.envelope.meshId,
    messageId: decision.envelope.messageId,
    type: payload.type,
  });
  const idempotencyKey = `room-mesh:${idempotencyDigest}`;
  const source = projectionSource(
    decision.envelope.meshId,
    decision.envelope.messageId,
    decision.envelope.sender.peerId,
    payload,
  );
  const metadata = Object.freeze({
    roomMeshProjectionVersion: ROOM_MESH_PROJECTION_SCHEMA_VERSION,
    bridgeId: binding.bridgeId,
    meshId: source.meshId,
    meshMessageId: source.messageId,
    meshMessageType: source.messageType,
    objectiveId: source.objectiveId,
    workItemId: source.workItemId,
    assignmentEpoch: source.assignmentEpoch,
    assignmentAuthorityId: source.assignmentAuthorityId,
    fencingToken: source.fencingToken,
    idempotencyKey,
  });
  const stableId = `mesh-${decision.envelope.messageId}-${payload.type.slice("work.".length)}`;
  if (payload.type === "work.progress") {
    return deepFreeze({
      schemaVersion: ROOM_MESH_PROJECTION_SCHEMA_VERSION,
      kind: "room.message",
      idempotencyKey,
      tenantId: binding.tenantId,
      roomId: binding.roomId,
      taskId: binding.taskId,
      source,
      input: {
        id: stableId,
        ...(binding.authorParticipantId === undefined
          ? {}
          : { authorParticipantId: binding.authorParticipantId }),
        role: "agent",
        content: payload.progressSummary,
        metadata,
      },
    });
  }
  const content = artifactContent(payload);
  return deepFreeze({
    schemaVersion: ROOM_MESH_PROJECTION_SCHEMA_VERSION,
    kind: "room.artifact",
    idempotencyKey,
    tenantId: binding.tenantId,
    roomId: binding.roomId,
    taskId: binding.taskId,
    source,
    input: {
      id: stableId,
      type:
        payload.type === "work.result"
          ? "mesh-work-result"
          : "mesh-work-checkpoint",
      title:
        payload.type === "work.result"
          ? `Work result ${payload.resultId}`
          : `Work checkpoint ${payload.checkpointId}`,
      content,
      contentType: "application/json",
      authors:
        binding.authorParticipantId === undefined
          ? []
          : [binding.authorParticipantId],
      provenance: {
        sourceMessageIds: [],
        sourceArtifactIds: [],
        sourceMemoryIds: [],
      },
      assumptions: [],
      risks: [],
      ...(binding.authorParticipantId === undefined
        ? {}
        : { createdBy: binding.authorParticipantId }),
      metadata,
    },
  });
}

/** In-memory idempotency for local use and tests; no process-global registry. */
export function createMemoryRoomMeshIdempotencyRepository(
  options: {
    readonly clock?: () => number;
    readonly tokenSource?: () => string;
  } = {},
): RoomMeshIdempotencyRepository {
  const clock = options.clock ?? Date.now;
  const tokenSource =
    options.tokenSource ?? (() => globalThis.crypto.randomUUID());
  const records = new Map<
    string,
    | { readonly status: "completed" }
    | { readonly status: "claimed"; readonly claim: RoomMeshProjectionClaim }
  >();
  const repository: RoomMeshIdempotencyRepository = {
    claim(input) {
      assertIdempotencyKey(input.idempotencyKey);
      assertIdentifier(input.workerId, "workerId");
      const leaseDurationMs = positiveInteger(
        input.leaseDurationMs,
        "leaseDurationMs",
        3_600_000,
      );
      const existing = records.get(input.idempotencyKey);
      if (existing?.status === "completed") return { status: "completed" };
      const now = clock();
      if (existing?.status === "claimed" && existing.claim.expiresAt > now) {
        return { status: "busy" };
      }
      const claim = Object.freeze({
        idempotencyKey: input.idempotencyKey,
        workerId: input.workerId,
        leaseToken: tokenSource(),
        generation:
          existing?.status === "claimed" ? existing.claim.generation + 1 : 1,
        expiresAt: now + leaseDurationMs,
      });
      records.set(input.idempotencyKey, { status: "claimed", claim });
      return { status: "claimed", claim };
    },
    complete(claim) {
      const current = records.get(claim.idempotencyKey);
      if (!claimEquals(current, claim) || claim.expiresAt <= clock()) {
        return false;
      }
      records.set(claim.idempotencyKey, { status: "completed" });
      return true;
    },
    abandon(claim) {
      const current = records.get(claim.idempotencyKey);
      if (!claimEquals(current, claim)) return false;
      records.delete(claim.idempotencyKey);
      return true;
    },
  };
  return Object.freeze(repository);
}

/** Creates an inert bridge. Applying a projection is always explicit. */
export function createRoomMeshBridge(
  options: RoomMeshBridgeOptions,
): RoomMeshBridge {
  if (!options?.idempotency || !options.sink) {
    throw new TypeError("Room Mesh bridge dependencies are required");
  }
  const bridgeId = assertIdentifier(options.bridgeId, "bridgeId");
  const workerId = assertIdentifier(options.workerId, "workerId");
  const leaseDurationMs = positiveInteger(
    options.leaseDurationMs ?? 30_000,
    "leaseDurationMs",
    3_600_000,
  );
  const bridge: RoomMeshBridge = {
    async apply(projection): Promise<RoomMeshBridgeApplyResult> {
      validateProjection(projection, bridgeId);
      const claimed = await options.idempotency.claim({
        idempotencyKey: projection.idempotencyKey,
        workerId,
        leaseDurationMs,
      });
      if (claimed.status === "completed") {
        return Object.freeze({ status: "duplicate" });
      }
      if (claimed.status === "busy") {
        return Object.freeze({ status: "busy" });
      }
      try {
        const result = await options.sink.apply(
          projection,
          projection.idempotencyKey,
        );
        if (!result || typeof result.applied !== "boolean") {
          throw new TypeError("Room Mesh sink result is invalid");
        }
        const completed = await options.idempotency.complete(claimed.claim);
        if (!completed) return Object.freeze({ status: "claim_lost" });
        return Object.freeze({
          status: result.duplicate ? "duplicate" : "applied",
        });
      } catch (error) {
        await options.idempotency.abandon(claimed.claim);
        throw error;
      }
    },
  };
  return Object.freeze(bridge);
}

/**
 * Applies projections through ordinary Room service methods and deterministic
 * IDs. It never approves artifacts, runs/completes tasks or completes Rooms.
 */
export function createRoomServiceMeshSink(
  service: Pick<RoomService, "getRoomState" | "sendMessage" | "createArtifact">,
): RoomMeshProjectionSink {
  if (!service) throw new TypeError("Room service is required");
  const sink: RoomMeshProjectionSink = {
    async apply(projection, idempotencyKey) {
      if (projection.idempotencyKey !== idempotencyKey) {
        throw new TypeError("Room Mesh sink idempotency key mismatch");
      }
      const state = await service.getRoomState(
        projection.tenantId,
        projection.roomId,
      );
      if (
        projection.kind === "room.message" &&
        state.messages.some((message) => message.id === projection.input.id)
      ) {
        return { applied: false, duplicate: true };
      }
      if (
        projection.kind === "room.artifact" &&
        state.artifacts.some((artifact) => artifact.id === projection.input.id)
      ) {
        return { applied: false, duplicate: true };
      }
      try {
        if (projection.kind === "room.message") {
          await service.sendMessage(
            projection.tenantId,
            projection.roomId,
            projection.input,
          );
        } else {
          await service.createArtifact(
            projection.tenantId,
            projection.roomId,
            projection.input,
          );
        }
        return { applied: true };
      } catch (error) {
        const after = await service.getRoomState(
          projection.tenantId,
          projection.roomId,
        );
        const exists =
          projection.kind === "room.message"
            ? after.messages.some(
                (message) => message.id === projection.input.id,
              )
            : after.artifacts.some(
                (artifact) => artifact.id === projection.input.id,
              );
        if (exists) return { applied: false, duplicate: true };
        throw error;
      }
    },
  };
  return Object.freeze(sink);
}

function projectionSource(
  meshId: string,
  messageId: string,
  senderPeerId: string,
  payload: WorkProgressPayload | WorkCheckpointPayload | WorkResultPayload,
): RoomMeshProjectionSource {
  return Object.freeze({
    meshId,
    messageId,
    messageType: payload.type,
    senderPeerId,
    objectiveId: payload.objectiveId,
    workItemId: payload.workItemId,
    assignmentEpoch: payload.assignmentEpoch,
    assignmentAuthorityId: payload.assignmentAuthorityId,
    fencingToken: payload.fencingToken,
  });
}

function artifactContent(
  payload: WorkCheckpointPayload | WorkResultPayload,
): CreateArtifactInput["content"] {
  if (payload.type === "work.result") {
    return {
      kind: "mesh_work_result",
      resultId: payload.resultId,
      resultDigest: payload.resultDigest,
      ...(payload.resultSummary === undefined
        ? { resultReference: payload.resultReference }
        : { resultSummary: payload.resultSummary }),
      ...(payload.checkpointId === undefined
        ? {}
        : { checkpointId: payload.checkpointId }),
    };
  }
  return {
    kind: "mesh_work_checkpoint",
    checkpointId: payload.checkpointId,
    checkpointSequence: payload.checkpointSequence,
    checkpointDigest: payload.checkpointDigest,
    ...(payload.previousCheckpointId === undefined
      ? {}
      : { previousCheckpointId: payload.previousCheckpointId }),
    ...(payload.checkpointSummary === undefined
      ? { checkpointReference: payload.checkpointReference }
      : { checkpointSummary: payload.checkpointSummary }),
  };
}

function validateAndFreezePayload<
  T extends ObjectiveAnnouncePayload | WorkOfferPayload,
>(payload: T): T {
  const canonical = canonicalizeMeshPayload(payload);
  if (!canonical.ok) {
    throw new TypeError(
      `Room Mesh projection is invalid: ${canonical.issues[0]?.code ?? "invalid_payload"}`,
    );
  }
  return deepFreeze(payload);
}

function validateProjection(
  projection: RoomMeshInboundProjection,
  bridgeId: string,
): void {
  if (
    !projection ||
    projection.schemaVersion !== ROOM_MESH_PROJECTION_SCHEMA_VERSION ||
    (projection.kind !== "room.message" &&
      projection.kind !== "room.artifact") ||
    projection.input.metadata?.bridgeId !== bridgeId
  ) {
    throw new TypeError("Room Mesh projection does not belong to this bridge");
  }
  assertIdempotencyKey(projection.idempotencyKey);
}

function claimEquals(
  current:
    | { readonly status: "completed" }
    | { readonly status: "claimed"; readonly claim: RoomMeshProjectionClaim }
    | undefined,
  claim: RoomMeshProjectionClaim,
): boolean {
  return (
    current?.status === "claimed" &&
    current.claim.workerId === claim.workerId &&
    current.claim.leaseToken === claim.leaseToken &&
    current.claim.generation === claim.generation
  );
}

function assertIdempotencyKey(value: string): void {
  if (
    typeof value !== "string" ||
    !/^room-mesh:sha256:[A-Za-z0-9_-]{43}$/u.test(value)
  ) {
    throw new TypeError("Room Mesh idempotency key is invalid");
  }
}

function assertIdentifier(value: string, label: string): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    new TextEncoder().encode(value).byteLength > 256 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@-]*$/u.test(value)
  ) {
    throw new TypeError(`Room Mesh ${label} is invalid`);
  }
  return value;
}

function positiveInteger(
  value: number,
  label: string,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`Room Mesh ${label} is outside its range`);
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}
