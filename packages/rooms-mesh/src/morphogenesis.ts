import {
  type MorphogenesisExecutionRecordV1,
  type MorphogenesisNeedV1,
  type MorphogenesisProposalV1,
  type MorphogenesisReceiptV1,
  type MorphogenesisLifecycleAgentV1,
  type AgentInstantiationProfileAnyV1,
  type MorphogenesisCompiledOperatorPlanV2,
  type MorphogenesisOperatorExecutionStateV2,
  type MorphogenesisOperatorOutcomeReceiptV2,
  type MorphogenesisScopeV1,
  validateMorphogenesisStrategySelectionV3,
  validateMorphogenesisStrategyRecommendationV3,
  validateMorphogenesisStrategyReviewV3,
  validateMorphogenesisStrategyGovernanceTransitionV3,
  type MorphogenesisStrategySelectionV3,
  type MorphogenesisStrategyRecommendationV3,
  type MorphogenesisStrategyReviewV3,
  type MorphogenesisStrategyGovernanceTransitionV3,
  type MorphologySnapshotV1,
  type TargetMorphologyV1,
} from "@agentplat/collective-runtime/morphogenesis";
import type { JsonObject } from "@agentplat/core";
import { computeMeshDurableValueDigest } from "@agentplat/mesh/durability";
import type {
  AddParticipantInput,
  CreateArtifactInput,
  Room,
  RoomService,
} from "@agentplat/rooms";

export interface MorphogenesisRoomArtifactProjectionV1 {
  readonly schemaVersion: 1;
  readonly kind: "room.artifact";
  readonly tenantId: string;
  readonly roomId: string;
  readonly idempotencyKey: string;
  readonly input: Readonly<CreateArtifactInput>;
}

export interface MorphogenesisRoomMessageProjectionV1 {
  readonly schemaVersion: 1;
  readonly kind: "room.message";
  readonly tenantId: string;
  readonly roomId: string;
  readonly idempotencyKey: string;
  readonly input: Readonly<{
    readonly id: string;
    readonly role: "system";
    readonly content: string;
    readonly metadata: JsonObject;
  }>;
}

export interface MorphogenesisMeshNeedProjectionV1 {
  readonly schemaVersion: 1;
  readonly kind: "morphogenesis.need";
  readonly tenantId: string;
  readonly meshId: string;
  readonly missionId: string;
  readonly objectiveId: string;
  readonly workItemId: string | null;
  readonly morphologyEpoch: number;
  readonly snapshotDigest: `sha256:${string}`;
  readonly needDigest: `sha256:${string}`;
  readonly reasonCode: string;
  readonly evidenceDigests: readonly `sha256:${string}`[];
  readonly boundedViewDigest: `sha256:${string}` | null;
  readonly candidateSearchLimit: number | null;
  readonly requiredCapabilityKeys: readonly string[];
  readonly requestedPositionDigests: readonly `sha256:${string}`[];
  readonly observedSourceHeadDigests: readonly `sha256:${string}`[];
  readonly validUntilLogicalMs: number;
  readonly projectionDigest: `sha256:${string}`;
  readonly unsigned: true;
}

export interface MorphogenesisMeshOperatorPlanProjectionV2 {
  readonly schemaVersion: 2;
  readonly kind: "morphogenesis.operator-plan";
  readonly tenantId: string;
  readonly meshId: string;
  readonly missionId: string;
  readonly objectiveId: string;
  readonly morphologyId: string;
  readonly expectedMorphologyEpoch: number;
  readonly operator: string;
  readonly planDigest: `sha256:${string}`;
  readonly proposalDigest: `sha256:${string}`;
  readonly policyDigest: `sha256:${string}`;
  readonly bindingDigest: `sha256:${string}`;
  readonly stepDigests: readonly `sha256:${string}`[];
  readonly boundaries: readonly string[];
  readonly validUntilLogicalMs: number;
  readonly projectionDigest: `sha256:${string}`;
  readonly unsigned: true;
}

export interface MorphogenesisAdvancedMeshTransportV2 {
  send(
    projection: MorphogenesisMeshOperatorPlanProjectionV2,
  ): Promise<MorphogenesisAuthenticatedMeshReceiptV1>;
  verify(input: {
    readonly projection: MorphogenesisMeshOperatorPlanProjectionV2;
    readonly receipt: MorphogenesisAuthenticatedMeshReceiptV1;
  }): Promise<boolean>;
}

export class MorphogenesisAdvancedMeshPublisherV2 {
  constructor(readonly transport: MorphogenesisAdvancedMeshTransportV2) {}
  async publish(projection: MorphogenesisMeshOperatorPlanProjectionV2) {
    if (projection.unsigned !== true)
      fail("advanced Morphogenesis Mesh projection must remain unsigned");
    const receipt = await this.transport.send(projection);
    if (
      receipt.projectionDigest !== projection.projectionDigest ||
      !(await this.transport.verify({ projection, receipt }))
    ) fail("advanced Morphogenesis Mesh delivery was not verified");
    return freeze(receipt);
  }
}

export interface MorphogenesisStrategyMeshProjectionV3 {
  readonly schemaVersion: 3;
  readonly kind: "morphogenesis.strategy-recommendation";
  readonly tenantId: string;
  readonly meshId: string;
  readonly missionId: string;
  readonly objectiveId: string;
  readonly morphologyId: string;
  readonly recommendationDigest: `sha256:${string}`;
  readonly action: string;
  readonly targetStrategyId: string;
  readonly replacementStrategyId: string | null;
  readonly catalogDigest: `sha256:${string}`;
  readonly evidenceDigests: readonly `sha256:${string}`[];
  readonly confidenceBps: number;
  readonly reviewRoute: string;
  readonly expiresAtLogicalMs: number;
  readonly projectionDigest: `sha256:${string}`;
  readonly unsigned: true;
}

export interface MorphogenesisStrategyMeshTransportV3 {
  send(projection: MorphogenesisStrategyMeshProjectionV3): Promise<MorphogenesisAuthenticatedMeshReceiptV1>;
  verify(input: {
    readonly projection: MorphogenesisStrategyMeshProjectionV3;
    readonly receipt: MorphogenesisAuthenticatedMeshReceiptV1;
  }): Promise<boolean>;
}

export class MorphogenesisStrategyMeshPublisherV3 {
  constructor(readonly transport: MorphogenesisStrategyMeshTransportV3) {}
  async publish(projection: MorphogenesisStrategyMeshProjectionV3) {
    if (projection.unsigned !== true)
      fail("Morphogenesis strategy Mesh projection must remain authority-neutral");
    const receipt = await this.transport.send(projection);
    if (receipt.projectionDigest !== projection.projectionDigest ||
        !(await this.transport.verify({ projection, receipt })))
      fail("Morphogenesis strategy Mesh delivery was not verified");
    return freeze(receipt);
  }
}

export interface MorphogenesisRoomParticipationReceiptV1 {
  readonly schemaVersion: 1;
  readonly operationId: string;
  readonly tenantId: string;
  readonly roomId: string;
  readonly participantId: string;
  readonly agentDigest: `sha256:${string}`;
  readonly profileDigest: `sha256:${string}`;
  readonly appliedAt: string;
  readonly receiptDigest: `sha256:${string}`;
}

export interface MorphogenesisAuthenticatedMeshReceiptV1 {
  readonly schemaVersion: 1;
  readonly projectionDigest: `sha256:${string}`;
  readonly senderPeerId: string;
  readonly senderInstanceId: string;
  readonly membershipConfigurationDigest: `sha256:${string}`;
  readonly membershipEpoch: number;
  readonly envelopeDigest: `sha256:${string}`;
  readonly sentAtLogicalMs: number;
}

export interface MorphogenesisAuthenticatedMeshTransportV1 {
  send(
    projection: MorphogenesisMeshNeedProjectionV1,
  ): Promise<MorphogenesisAuthenticatedMeshReceiptV1>;
  verify(input: {
    readonly projection: MorphogenesisMeshNeedProjectionV1;
    readonly receipt: MorphogenesisAuthenticatedMeshReceiptV1;
  }): Promise<boolean>;
}

export class MorphogenesisMeshPublisherV1 {
  constructor(readonly transport: MorphogenesisAuthenticatedMeshTransportV1) {}

  async publish(
    projection: MorphogenesisMeshNeedProjectionV1,
  ): Promise<MorphogenesisAuthenticatedMeshReceiptV1> {
    if (projection.unsigned !== true)
      fail("Morphogenesis Mesh projection must be authority-neutral before send");
    const receipt = await this.transport.send(projection);
    if (
      receipt.projectionDigest !== projection.projectionDigest ||
      receipt.membershipEpoch < 1 ||
      !receipt.senderPeerId ||
      !receipt.senderInstanceId ||
      !(await this.transport.verify({ projection, receipt }))
    )
      fail("authenticated Morphogenesis Mesh delivery was not verified");
    return freeze(receipt);
  }
}

export class MorphogenesisRoomParticipationPortV1 {
  constructor(
    readonly rooms: Pick<RoomService, "addParticipant">,
  ) {}

  async apply(input: {
    readonly operationId: string;
    readonly room: Room;
    readonly agent: MorphogenesisLifecycleAgentV1;
    readonly profile: AgentInstantiationProfileAnyV1;
    readonly actorId?: string;
    readonly appliedAt: string;
  }): Promise<MorphogenesisRoomParticipationReceiptV1> {
    if (
      input.room.status !== "active" ||
      input.room.tenantId !== input.profile.tenantId ||
      input.room.id !== input.profile.roomId ||
      input.agent.roleDefinitionDigest !== input.profile.roleDefinitionDigest ||
      !Number.isFinite(Date.parse(input.appliedAt))
    )
      fail("Morphogenesis Room participant binding is invalid");
    const participantInput: AddParticipantInput = {
      id: input.agent.agentId,
      type: "agent",
      displayName: `Morphogenesis ${input.agent.agentId}`,
      role: "morphogenesis-specialist",
      authorityLevel: 0,
      permissions: [],
      boundaries: [input.profile.missionId],
      memoryScope: "room",
      runtime: { platform: input.profile.adapterId },
      metadata: {
        morphogenesisProfileDigest: input.profile.profileDigest,
        morphogenesisAgentDigest: input.agent.agentDigest,
      },
    };
    const participant = await this.rooms.addParticipant(
      input.room.tenantId,
      input.room.id,
      participantInput,
      input.actorId,
    );
    if (participant.id !== input.agent.agentId)
      fail("Morphogenesis Room participant identity changed");
    const body = {
      schemaVersion: 1 as const,
      operationId: input.operationId,
      tenantId: input.room.tenantId,
      roomId: input.room.id,
      participantId: participant.id,
      agentDigest: input.agent.agentDigest,
      profileDigest: input.profile.profileDigest,
      appliedAt: input.appliedAt,
    };
    return freeze({
      ...body,
      receiptDigest: (await computeMeshDurableValueDigest(
        body as never,
      )) as `sha256:${string}`,
    });
  }
}

export function projectMorphogenesisDiffToRoomArtifactV1(input: {
  readonly room: Room;
  readonly snapshot: MorphologySnapshotV1;
  readonly need: MorphogenesisNeedV1;
  readonly target: TargetMorphologyV1;
  readonly proposal: MorphogenesisProposalV1;
  readonly createdBy?: string;
}): MorphogenesisRoomArtifactProjectionV1 {
  assertRoomScope(input.room, input.snapshot);
  if (
    input.need.currentSnapshotDigest !== input.snapshot.snapshotDigest ||
    input.target.currentSnapshotDigest !== input.snapshot.snapshotDigest ||
    input.proposal.currentSnapshotDigest !== input.snapshot.snapshotDigest ||
    input.proposal.needDigest !== input.need.needDigest ||
    input.proposal.targetDigest !== input.target.targetDigest
  )
    fail("Morphogenesis Room diff bindings are inconsistent");
  const artifactId = `morphogenesis-diff:${input.proposal.proposalId}`;
  const content = Object.freeze({
    schemaVersion: 1,
    morphologyId: input.snapshot.scope.morphologyId,
    currentEpoch: input.snapshot.morphologyEpoch,
    currentSnapshotDigest: input.snapshot.snapshotDigest,
    needId: input.need.needId,
    needDigest: input.need.needDigest,
    reasonCode: input.need.reasonCode,
    targetId: input.target.targetId,
    targetDigest: input.target.targetDigest,
    proposalId: input.proposal.proposalId,
    proposalDigest: input.proposal.proposalDigest,
    decisionRoute: input.proposal.decisionRoute,
    currentPopulation: input.snapshot.population.activeAgents,
    targetPopulation: input.target.estimatedActiveAgents,
    newAgents: input.target.estimatedNewAgents,
    currentComponentDigests: input.snapshot.components.map(
      ({ componentDigest }) => componentDigest,
    ),
    targetPositionDigests: input.target.positions.map(
      ({ positionDigest }) => positionDigest,
    ),
    agentDispositionDigests: input.target.agentDispositions.map(
      ({ dispositionDigest }) => dispositionDigest,
    ),
    invariantDigests: input.target.invariantDigests,
    budgetDigest: input.proposal.budget.budgetDigest,
    expiresAtLogicalMs: input.proposal.expiresAtLogicalMs,
  });
  return freeze({
    schemaVersion: 1,
    kind: "room.artifact",
    tenantId: input.room.tenantId,
    roomId: input.room.id,
    idempotencyKey: artifactId,
    input: {
      id: artifactId,
      type: "agent-morphogenesis-diff",
      title: `Morphogenesis proposal ${input.proposal.proposalId}`,
      content: content as unknown as CreateArtifactInput["content"],
      contentType: "application/json",
      authors: input.createdBy ? [input.createdBy] : [],
      provenance: {
        sourceMessageIds: [],
        sourceArtifactIds: [],
        sourceMemoryIds: [],
      },
      assumptions: [],
      risks: input.target.estimatedNewAgents > 0
        ? ["agent-instantiation-requested"]
        : [],
      ...(input.createdBy ? { createdBy: input.createdBy } : {}),
      metadata: {
        morphogenesisSchemaVersion: 1,
        proposalDigest: input.proposal.proposalDigest,
        snapshotDigest: input.snapshot.snapshotDigest,
        targetDigest: input.target.targetDigest,
      },
    },
  });
}

export function projectMorphogenesisStatusToRoomMessageV1(input: {
  readonly room: Room;
  readonly execution: MorphogenesisExecutionRecordV1;
  readonly createdAt: string;
}): MorphogenesisRoomMessageProjectionV1 {
  if (
    input.room.status !== "active" ||
    input.execution.scope.tenantId !== input.room.tenantId ||
    input.execution.scope.roomId !== input.room.id ||
    !Number.isFinite(Date.parse(input.createdAt))
  )
    fail("Morphogenesis status requires an active matching Room");
  const id = `morphogenesis-status:${input.execution.stateKey}:${input.execution.revision}`;
  return freeze({
    schemaVersion: 1,
    kind: "room.message",
    tenantId: input.room.tenantId,
    roomId: input.room.id,
    idempotencyKey: id,
    input: {
      id,
      role: "system",
      content: `Morphogenesis ${input.execution.phase}`,
      metadata: {
        morphogenesisSchemaVersion: 1,
        executionStateKey: input.execution.stateKey,
        executionRevision: input.execution.revision,
        executionRecordDigest: input.execution.recordDigest,
        phase: input.execution.phase,
        proposalDigest: input.execution.proposalDigest,
        branch: input.execution.branch,
        createdAt: input.createdAt,
      },
    },
  });
}

export function projectMorphogenesisReceiptToRoomArtifactV1(input: {
  readonly room: Room;
  readonly receipt: MorphogenesisReceiptV1;
  readonly createdBy?: string;
}): MorphogenesisRoomArtifactProjectionV1 {
  if (
    input.room.status !== "active" ||
    input.receipt.scopeDigest.length < 1
  )
    fail("Morphogenesis receipt requires an active Room");
  const id = `morphogenesis-receipt:${input.receipt.receiptId}`;
  return freeze({
    schemaVersion: 1,
    kind: "room.artifact",
    tenantId: input.room.tenantId,
    roomId: input.room.id,
    idempotencyKey: id,
    input: {
      id,
      type: "agent-morphogenesis-receipt",
      title: `Morphogenesis receipt ${input.receipt.receiptId}`,
      content: input.receipt as unknown as CreateArtifactInput["content"],
      contentType: "application/json",
      authors: input.createdBy ? [input.createdBy] : [],
      provenance: {
        sourceMessageIds: [],
        sourceArtifactIds: [],
        sourceMemoryIds: [],
      },
      assumptions: [],
      risks: [],
      ...(input.createdBy ? { createdBy: input.createdBy } : {}),
      metadata: {
        morphogenesisSchemaVersion: 1,
        receiptDigest: input.receipt.receiptDigest,
        proposalDigest: input.receipt.proposalDigest,
        resultingMorphologyEpoch: input.receipt.resultingMorphologyEpoch,
        disposition: input.receipt.disposition,
      },
    },
  });
}

export async function projectMorphogenesisNeedToMeshV1(input: {
  readonly snapshot: MorphologySnapshotV1;
  readonly need: MorphogenesisNeedV1;
  readonly target: TargetMorphologyV1;
}): Promise<MorphogenesisMeshNeedProjectionV1> {
  if (
    !input.snapshot.scope.meshId ||
    input.need.currentSnapshotDigest !== input.snapshot.snapshotDigest ||
    input.target.currentSnapshotDigest !== input.snapshot.snapshotDigest
  )
    fail("Morphogenesis Mesh need is unavailable or cross-scoped");
  const body = {
    schemaVersion: 1 as const,
    kind: "morphogenesis.need" as const,
    tenantId: input.snapshot.scope.tenantId,
    meshId: input.snapshot.scope.meshId,
    missionId: input.snapshot.scope.missionId,
    objectiveId: input.snapshot.scope.objectiveId,
    workItemId: input.snapshot.scope.workItemId,
    morphologyEpoch: input.snapshot.morphologyEpoch,
    snapshotDigest: input.snapshot.snapshotDigest,
    needDigest: input.need.needDigest,
    reasonCode: input.need.reasonCode,
    evidenceDigests: input.need.evidenceDigests,
    boundedViewDigest: input.need.boundedViewDigest,
    candidateSearchLimit: input.need.candidateSearchLimit,
    requiredCapabilityKeys: Object.freeze([
      ...new Set(
        input.target.positions.flatMap(
          ({ requiredCapabilityKeys }) => requiredCapabilityKeys,
        ),
      ),
    ].sort()),
    requestedPositionDigests: input.target.positions.map(
      ({ positionDigest }) => positionDigest,
    ),
    observedSourceHeadDigests: input.snapshot.sourceHeads.map(
      ({ sourceHeadDigest }) => sourceHeadDigest,
    ),
    validUntilLogicalMs: input.need.expiresAtLogicalMs,
    unsigned: true as const,
  };
  return freeze({
    ...body,
    projectionDigest: (await computeMeshDurableValueDigest(
      body as never,
    )) as `sha256:${string}`,
  });
}

export function projectMorphogenesisOperatorPlanToRoomArtifactV2(input: {
  readonly room: Room;
  readonly scope: MorphogenesisScopeV1;
  readonly plan: MorphogenesisCompiledOperatorPlanV2;
  readonly proposalDigest: `sha256:${string}`;
  readonly expectedMorphologyEpoch: number;
  readonly createdBy?: string;
}): MorphogenesisRoomArtifactProjectionV1 {
  assertAdvancedRoomScope(input.room, input.scope);
  const id = `morphogenesis-operator-plan:${input.plan.planId}`;
  return freeze({
    schemaVersion: 1,
    kind: "room.artifact",
    tenantId: input.room.tenantId,
    roomId: input.room.id,
    idempotencyKey: id,
    input: {
      id,
      type: "agent-morphogenesis-operator-plan",
      title: `Morphogenesis ${input.plan.operator} plan`,
      content: {
        schemaVersion: 2,
        morphologyId: input.scope.morphologyId,
        expectedMorphologyEpoch: input.expectedMorphologyEpoch,
        operator: input.plan.operator,
        planDigest: input.plan.planDigest,
        proposalDigest: input.proposalDigest,
        policyDigest: input.plan.policyDigest,
        bindingDigest: input.plan.bindingDigest,
        steps: input.plan.steps.map((step) => ({
          stepId: step.stepId,
          boundary: step.boundary,
          operation: step.operation,
          effectClass: step.effectClass,
          stepDigest: step.stepDigest,
        })),
        advisoryOnly: true,
      },
      contentType: "application/json",
      authors: input.createdBy ? [input.createdBy] : [],
      provenance: {
        sourceMessageIds: [],
        sourceArtifactIds: [],
        sourceMemoryIds: [],
      },
      assumptions: [],
      risks: ["authority-remains-external"],
      ...(input.createdBy ? { createdBy: input.createdBy } : {}),
      metadata: {
        morphogenesisSchemaVersion: 2,
        planDigest: input.plan.planDigest,
        proposalDigest: input.proposalDigest,
        operator: input.plan.operator,
      },
    },
  });
}

export function projectMorphogenesisOperatorStatusToRoomMessageV2(input: {
  readonly room: Room;
  readonly scope: MorphogenesisScopeV1;
  readonly execution: MorphogenesisOperatorExecutionStateV2;
  readonly createdAt: string;
}): MorphogenesisRoomMessageProjectionV1 {
  assertAdvancedRoomScope(input.room, input.scope);
  if (!Number.isFinite(Date.parse(input.createdAt)))
    fail("advanced Morphogenesis status time is invalid");
  const id = `morphogenesis-operator-status:${input.execution.stateKey}:${input.execution.revision}`;
  return freeze({
    schemaVersion: 1,
    kind: "room.message",
    tenantId: input.room.tenantId,
    roomId: input.room.id,
    idempotencyKey: id,
    input: {
      id,
      role: "system",
      content: `Morphogenesis ${input.execution.plan.operator} ${input.execution.status}`,
      metadata: {
        morphogenesisSchemaVersion: 2,
        operator: input.execution.plan.operator,
        planDigest: input.execution.plan.planDigest,
        executionStateDigest: input.execution.stateDigest,
        revision: input.execution.revision,
        status: input.execution.status,
        nextStepIndex: input.execution.nextStepIndex,
        pendingStepId: input.execution.pendingStepId,
        createdAt: input.createdAt,
      },
    },
  });
}

export function projectMorphogenesisOperatorOutcomeToRoomArtifactV2(input: {
  readonly room: Room;
  readonly scope: MorphogenesisScopeV1;
  readonly receipt: MorphogenesisOperatorOutcomeReceiptV2;
  readonly createdBy?: string;
}): MorphogenesisRoomArtifactProjectionV1 {
  assertAdvancedRoomScope(input.room, input.scope);
  const id = `morphogenesis-operator-outcome:${input.receipt.receiptId}`;
  return freeze({
    schemaVersion: 1,
    kind: "room.artifact",
    tenantId: input.room.tenantId,
    roomId: input.room.id,
    idempotencyKey: id,
    input: {
      id,
      type: "agent-morphogenesis-operator-outcome",
      title: `Morphogenesis outcome ${input.receipt.receiptId}`,
      content: input.receipt as unknown as CreateArtifactInput["content"],
      contentType: "application/json",
      authors: input.createdBy ? [input.createdBy] : [],
      provenance: {
        sourceMessageIds: [],
        sourceArtifactIds: [],
        sourceMemoryIds: [],
      },
      assumptions: [],
      risks: [],
      ...(input.createdBy ? { createdBy: input.createdBy } : {}),
      metadata: {
        morphogenesisSchemaVersion: 2,
        receiptDigest: input.receipt.receiptDigest,
        planDigest: input.receipt.planDigest,
        resultingMorphologyEpoch: input.receipt.resultingMorphologyEpoch,
        disposition: input.receipt.disposition,
      },
    },
  });
}

export async function projectMorphogenesisOperatorPlanToMeshV2(input: {
  readonly scope: MorphogenesisScopeV1;
  readonly plan: MorphogenesisCompiledOperatorPlanV2;
  readonly proposalDigest: `sha256:${string}`;
  readonly expectedMorphologyEpoch: number;
  readonly validUntilLogicalMs: number;
}): Promise<MorphogenesisMeshOperatorPlanProjectionV2> {
  if (!input.scope.meshId || input.validUntilLogicalMs <= input.plan.compiledAtLogicalMs)
    fail("advanced Morphogenesis Mesh plan is unavailable or expired");
  const body = {
    schemaVersion: 2 as const,
    kind: "morphogenesis.operator-plan" as const,
    tenantId: input.scope.tenantId,
    meshId: input.scope.meshId,
    missionId: input.scope.missionId,
    objectiveId: input.scope.objectiveId,
    morphologyId: input.scope.morphologyId,
    expectedMorphologyEpoch: input.expectedMorphologyEpoch,
    operator: input.plan.operator,
    planDigest: input.plan.planDigest,
    proposalDigest: input.proposalDigest,
    policyDigest: input.plan.policyDigest,
    bindingDigest: input.plan.bindingDigest,
    stepDigests: input.plan.steps.map(({ stepDigest }) => stepDigest),
    boundaries: Object.freeze([
      ...new Set(input.plan.steps.map(({ boundary }) => boundary)),
    ].sort()),
    validUntilLogicalMs: input.validUntilLogicalMs,
    unsigned: true as const,
  };
  return freeze({
    ...body,
    projectionDigest: (await computeMeshDurableValueDigest(
      body as never,
    )) as `sha256:${string}`,
  });
}

export function projectMorphogenesisStrategySelectionToRoomArtifactV3(input: {
  readonly room: Room;
  readonly scope: MorphogenesisScopeV1;
  readonly selection: MorphogenesisStrategySelectionV3;
  readonly createdBy?: string;
}): MorphogenesisRoomArtifactProjectionV1 {
  assertAdvancedRoomScope(input.room, input.scope);
  const selection = validateMorphogenesisStrategySelectionV3(input.selection);
  const id = `morphogenesis-strategy-selection:${selection.selectionId}`;
  return strategyRoomArtifact(input.room, id, "agent-morphogenesis-strategy-selection",
    "Morphogenesis strategy selection", selection.selectionDigest,
    selection as unknown as CreateArtifactInput["content"], input.createdBy);
}

export function projectMorphogenesisStrategyRecommendationToRoomArtifactV3(input: {
  readonly room: Room;
  readonly scope: MorphogenesisScopeV1;
  readonly recommendation: MorphogenesisStrategyRecommendationV3;
  readonly createdBy?: string;
}): MorphogenesisRoomArtifactProjectionV1 {
  assertAdvancedRoomScope(input.room, input.scope);
  const recommendation = validateMorphogenesisStrategyRecommendationV3(input.recommendation);
  const id = `morphogenesis-strategy-recommendation:${recommendation.recommendationId}`;
  return strategyRoomArtifact(input.room, id, "agent-morphogenesis-strategy-recommendation",
    `Morphogenesis strategy ${recommendation.action} recommendation`,
    recommendation.recommendationDigest,
    recommendation as unknown as CreateArtifactInput["content"], input.createdBy);
}

export function projectMorphogenesisStrategyReviewToRoomMessageV3(input: {
  readonly room: Room;
  readonly scope: MorphogenesisScopeV1;
  readonly review: MorphogenesisStrategyReviewV3;
  readonly createdAt: string;
}): MorphogenesisRoomMessageProjectionV1 {
  assertAdvancedRoomScope(input.room, input.scope);
  const review = validateMorphogenesisStrategyReviewV3(input.review);
  if (!Number.isFinite(Date.parse(input.createdAt))) fail("Morphogenesis strategy review time is invalid");
  const id = `morphogenesis-strategy-review:${review.reviewId}`;
  return freeze({
    schemaVersion: 1,
    kind: "room.message",
    tenantId: input.room.tenantId,
    roomId: input.room.id,
    idempotencyKey: id,
    input: {
      id,
      role: "system",
      content: `Morphogenesis strategy review ${review.disposition}`,
      metadata: {
        morphogenesisStrategySchemaVersion: 3,
        recommendationDigest: review.recommendationDigest,
        reviewDigest: review.reviewDigest,
        route: review.route,
        actorType: review.actorType,
        disposition: review.disposition,
        createdAt: input.createdAt,
        authorityGranted: false,
      },
    },
  });
}

export function projectMorphogenesisStrategyTransitionToRoomArtifactV3(input: {
  readonly room: Room;
  readonly scope: MorphogenesisScopeV1;
  readonly transition: MorphogenesisStrategyGovernanceTransitionV3;
  readonly createdBy?: string;
}): MorphogenesisRoomArtifactProjectionV1 {
  assertAdvancedRoomScope(input.room, input.scope);
  const transition = validateMorphogenesisStrategyGovernanceTransitionV3(input.transition);
  const id = `morphogenesis-strategy-transition:${transition.transitionDigest}`;
  return strategyRoomArtifact(input.room, id, "agent-morphogenesis-strategy-transition",
    `Morphogenesis strategy ${transition.action} transition`, transition.transitionDigest,
    transition as unknown as CreateArtifactInput["content"], input.createdBy);
}

export async function projectMorphogenesisStrategyRecommendationToMeshV3(input: {
  readonly scope: MorphogenesisScopeV1;
  readonly recommendation: MorphogenesisStrategyRecommendationV3;
}): Promise<MorphogenesisStrategyMeshProjectionV3> {
  const recommendation = validateMorphogenesisStrategyRecommendationV3(input.recommendation);
  if (!input.scope.meshId) fail("Morphogenesis strategy Mesh scope is unavailable");
  const body = freeze({
    schemaVersion: 3 as const,
    kind: "morphogenesis.strategy-recommendation" as const,
    tenantId: input.scope.tenantId,
    meshId: input.scope.meshId,
    missionId: input.scope.missionId,
    objectiveId: input.scope.objectiveId,
    morphologyId: input.scope.morphologyId,
    recommendationDigest: recommendation.recommendationDigest,
    action: recommendation.action,
    targetStrategyId: recommendation.targetStrategyId,
    replacementStrategyId: recommendation.replacementStrategyId,
    catalogDigest: recommendation.catalogDigest,
    evidenceDigests: recommendation.evidenceDigests,
    confidenceBps: recommendation.confidenceBps,
    reviewRoute: recommendation.reviewRoute,
    expiresAtLogicalMs: recommendation.expiresAtLogicalMs,
    unsigned: true as const,
  });
  return freeze({
    ...body,
    projectionDigest: (await computeMeshDurableValueDigest(body as never)) as `sha256:${string}`,
  });
}

function strategyRoomArtifact(
  room: Room,
  id: string,
  type: string,
  title: string,
  subjectDigest: `sha256:${string}`,
  content: CreateArtifactInput["content"],
  createdBy?: string,
): MorphogenesisRoomArtifactProjectionV1 {
  return freeze({
    schemaVersion: 1,
    kind: "room.artifact",
    tenantId: room.tenantId,
    roomId: room.id,
    idempotencyKey: id,
    input: {
      id,
      type,
      title,
      content,
      contentType: "application/json",
      authors: createdBy ? [createdBy] : [],
      provenance: { sourceMessageIds: [], sourceArtifactIds: [], sourceMemoryIds: [] },
      assumptions: [],
      risks: ["authority-remains-external"],
      ...(createdBy ? { createdBy } : {}),
      metadata: {
        morphogenesisStrategySchemaVersion: 3,
        subjectDigest,
        advisoryOnly: true,
      },
    },
  });
}

function assertAdvancedRoomScope(room: Room, scope: MorphogenesisScopeV1) {
  if (
    room.status !== "active" ||
    room.tenantId !== scope.tenantId ||
    room.id !== scope.roomId
  ) fail("advanced Morphogenesis projection requires an active matching Room");
}

function assertRoomScope(room: Room, snapshot: MorphologySnapshotV1): void {
  if (
    room.status !== "active" ||
    snapshot.scope.tenantId !== room.tenantId ||
    snapshot.scope.roomId !== room.id
  )
    fail("Morphogenesis projection requires an active matching Room");
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.getOwnPropertyNames(value))
      freeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

function fail(message: string): never {
  throw new TypeError(message);
}
