import {
  validateMissionIntentV1,
  type MissionIntentV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import { collectiveQuorumDigestV1 } from "@agentplat/collective-quorum/crypto";
import {
  createAssuranceExecutionAuthorityFenceV1,
  type AssuranceExecutionAuthorityFenceV1,
  type PreparedProtectedEffectV1,
  type ProtectedEffectReceiptV1,
} from "@agentplat/collective-host/assurance-coupled-execution";
import type {
  DistributedCollectiveMessageV1,
  DistributedCollectiveSparsePlanePortV1,
} from "@agentplat/collective-host/distributed-protocol";
import {
  isReferenceIntegratedCollectiveStackBoundToPlaneAndRecoveryV1,
  isReferenceIntegratedCollectiveStackV1,
  readReferenceIntegratedCollectiveArtifactV1,
  storeReferenceIntegratedCollectiveArtifactV1,
  type ReferenceIntegratedCollectiveStackV1,
  type ReferenceRecoveryAssignmentAuthorityV1,
} from "@agentplat/collective-host/reference-integrated-stack";
import {
  validateMeshSparseDeliveryV2,
  validateMeshSparseOverlayProfileV2,
  validateMeshSparseUpdateV2,
  invokeMeshSparsePeerPlanePublishV1,
  invokeMeshSparsePeerPlaneReceiveV1,
  isMeshSparsePeerPlaneRuntimeV1,
  MeshSparsePeerPlaneRuntimeV1,
  type MeshSparseDeliveryV2,
  type MeshSparseDeliveryQueuePortV1,
  type MeshSparseOverlayProfileV2,
  type MeshSparsePeerPlaneOptionsV1,
  type MeshSparsePeerPlanePublishResultV1,
} from "@agentplat/mesh/overlay";

import type {
  MultiDomainActionEnvelopeV1,
  MultiDomainEnvironmentDescriptorV1,
  MultiDomainObservationEnvelopeV1,
} from "./multi-domain-environment-contracts.js";
import {
  validateMultiDomainActionEnvelopeV1,
  validateMultiDomainEnvironmentDescriptorV1,
  validateMultiDomainObservationEnvelopeV1,
} from "./multi-domain-environment-validation.js";
import type {
  ScalableEvaluationTeamDescriptorV1,
  ScalableEvaluationAcknowledgedMessageV1,
  ScalableEvaluationActionSettlementReceiptV1,
  ScalableEvaluationActionSettlementV1,
  ScalableEvaluationDefinitionV1,
  ScalableEvaluationMessageIngressReceiptV1,
  ScalableEvaluationTeamMessageV1,
  ScalableEvaluationTeamPortV1,
  ScalableEvaluationTeamStepInputV1,
  ScalableEvaluationTeamStepOutputV1,
} from "./scalable-evaluation-contracts.js";
import {
  scalableEvaluationDigestV1,
  validateScalableEvaluationDefinitionV1,
  validateScalableEvaluationTeamDescriptorV1,
} from "./scalable-evaluation-validation.js";
import {
  validateShardedSimulationCrossShardMessageAckV1,
  validateShardedSimulationEffectReceiptV1,
} from "./sharded-simulation-runtime.js";
import { validateShardedSimulationCrossShardMessageBatchV1 } from "./sharded-simulation-validation.js";

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const MAXIMUM_STEP_MESSAGES = 1_024;
const MAXIMUM_STEP_ACTIONS = 1_024;
const MAXIMUM_STEP_MESSAGE_BYTES = 16 * 1024 * 1024;
const MAXIMUM_INBOUND_MESSAGES_PER_PEER = 65_536;
const MAXIMUM_STEP_JOURNALS_PER_PEER = 64;

export const REFERENCE_INTEGRATED_SCALABLE_EVALUATION_IMPLEMENTATION_ID_V1 =
  "agentplat.reference-integrated-collective-stack.v1" as const;

export interface ReferenceIntegratedScalableEvaluationScopeV1 {
  readonly tenantId: string;
  readonly meshId: string;
  readonly missionIntentId: string;
  readonly objectiveId: string;
}

export interface ReferenceIntegratedScalableEvaluationEgressOptionsV1 {
  /** Real sparse-plane dependencies; the egress installs its nominal capture queue. */
  readonly plane: Omit<MeshSparsePeerPlaneOptionsV1, "deliveryQueue">;
  readonly descriptor: MultiDomainEnvironmentDescriptorV1;
  readonly localPeerId: string;
  readonly recoveryPeerId?: string;
  readonly scope: ReferenceIntegratedScalableEvaluationScopeV1;
  /** Digest of the exact objective binding used by the peer-local mission. */
  readonly objectiveDigest: PlanningDigestV1;
  readonly membershipConfigurationDigest: string;
  readonly membershipEpoch: number;
  readonly assignmentEpoch?: number;
  readonly fencingTokenPrefix?: string;
  readonly maximumCapturedDeliveries?: number;
  readonly maximumCapturedEffects?: number;
  readonly maximumSettledReceipts?: number;
  readonly crypto?: Crypto;
}

interface CapturedDeliveryV1 {
  readonly sequence: number;
  readonly operationId: PlanningDigestV1 | null;
  readonly updateDigest: PlanningDigestV1;
  readonly delivery: MeshSparseDeliveryV2;
  readonly captureDigest: PlanningDigestV1;
}

interface CapturedEffectV1 {
  readonly sequence: number;
  readonly operationId: PlanningDigestV1 | null;
  readonly executionId: string;
  readonly proposalDigest: PlanningDigestV1;
  readonly action: MultiDomainActionEnvelopeV1;
  readonly receipt: ProtectedEffectReceiptV1;
  readonly captureDigest: PlanningDigestV1;
}

interface AssignmentV1 {
  readonly assignedPeerId: string;
  readonly assignmentEpoch: number;
  readonly fencingToken: string;
}

interface EgressBindingV1 {
  readonly plane: MeshSparsePeerPlaneRuntimeV1;
  readonly profile: MeshSparseOverlayProfileV2;
  readonly descriptor: MultiDomainEnvironmentDescriptorV1;
  readonly localPeerIndex: number;
  readonly localPeerId: string;
  readonly recoveryPeerId: string | null;
  readonly scope: ReferenceIntegratedScalableEvaluationScopeV1;
  readonly objectiveDigest: PlanningDigestV1;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly membershipEpoch: number;
  readonly initialAssignmentEpoch: number;
  readonly fencingTokenPrefix: string;
  readonly maximumCapturedDeliveries: number;
  readonly maximumCapturedEffects: number;
  readonly maximumSettledReceipts: number;
  readonly crypto?: Crypto;
  readonly assignments: Map<string, AssignmentV1>;
  readonly deliveries: CapturedDeliveryV1[];
  readonly effects: CapturedEffectV1[];
  readonly effectReceipts: Map<string, ProtectedEffectReceiptV1>;
  readonly deliveryIds: Set<string>;
  readonly settledDeliveries: Map<string, PlanningDigestV1>;
  readonly settledEffects: Map<string, PlanningDigestV1>;
  readonly settledEffectExecutions: Map<string, string>;
  nextDeliverySequence: number;
  nextEffectSequence: number;
  activeOperationId: PlanningDigestV1 | null;
  latestDeliveryCaptureDigest: PlanningDigestV1 | null;
  latestEffectCaptureDigest: PlanningDigestV1 | null;
}

const egressBindings = new WeakMap<object, EgressBindingV1>();
const peerBindings = new WeakMap<object, PeerBindingStateV1>();
const teamPorts = new WeakSet<object>();
const egressPeerOwners = new WeakMap<object, object>();
const stackPeerOwners = new WeakMap<object, object>();
const peerTeamOwners = new WeakMap<object, object>();
const teamPortBindings = new WeakMap<object, TeamPortBindingV1>();

/**
 * Nominal evaluation boundary used as both the stack's sparse plane and its
 * recovery-aware execution authority. Protected commits land in an outbox;
 * only the outer evaluation runner applies them to the environment. Capture
 * state is process-local evaluation state, not a production durable sink.
 */
export class ReferenceIntegratedScalableEvaluationEgressRuntimeV1
  implements
    DistributedCollectiveSparsePlanePortV1,
    ReferenceRecoveryAssignmentAuthorityV1
{
  constructor(options: ReferenceIntegratedScalableEvaluationEgressOptionsV1) {
    if (new.target !== ReferenceIntegratedScalableEvaluationEgressRuntimeV1)
      fail("reference_integrated_egress_subclass_invalid");
    assertOnlyKeys(
      options,
      [
        "plane",
        "descriptor",
        "localPeerId",
        "scope",
        "objectiveDigest",
        "membershipConfigurationDigest",
        "membershipEpoch",
      ],
      [
        "recoveryPeerId",
        "assignmentEpoch",
        "fencingTokenPrefix",
        "maximumCapturedDeliveries",
        "maximumCapturedEffects",
        "maximumSettledReceipts",
        "crypto",
      ],
      "reference_integrated_egress_options",
    );
    if (!options?.plane || typeof options.plane !== "object")
      fail("reference_integrated_plane_invalid");
    const profile = validateMeshSparseOverlayProfileV2(options.plane.profile);
    const descriptor = validateMultiDomainEnvironmentDescriptorV1(
      options.descriptor,
    );
    safeInteger(
      options.plane.localPeerIndex,
      "local_peer_index",
      0,
      profile.maximumPeers - 1,
    );
    const localPeerIndex = options.plane.localPeerIndex;
    identifier(options.localPeerId, "local_peer_id");
    if (options.recoveryPeerId !== undefined)
      identifier(options.recoveryPeerId, "recovery_peer_id");
    const scope = validateScope(options.scope);
    digest(options.objectiveDigest, "objective_digest");
    digest(
      options.membershipConfigurationDigest,
      "membership_configuration_digest",
    );
    safeInteger(options.membershipEpoch, "membership_epoch", 1);
    const assignmentEpoch = options.assignmentEpoch ?? 1;
    safeInteger(assignmentEpoch, "assignment_epoch", 0);
    const fencingTokenPrefix =
      options.fencingTokenPrefix ?? `evaluation-fence:${options.localPeerId}`;
    identifier(fencingTokenPrefix, "fencing_token_prefix");
    const maximumCapturedDeliveries =
      options.maximumCapturedDeliveries ?? 16_384;
    const maximumCapturedEffects = options.maximumCapturedEffects ?? 4_096;
    const maximumSettledReceipts = options.maximumSettledReceipts ?? 65_536;
    safeInteger(
      maximumCapturedDeliveries,
      "maximum_captured_deliveries",
      1,
      1_000_000,
    );
    safeInteger(maximumCapturedEffects, "maximum_captured_effects", 1, 100_000);
    safeInteger(
      maximumSettledReceipts,
      "maximum_settled_receipts",
      1,
      1_000_000,
    );
    const deliveries: CapturedDeliveryV1[] = [];
    const deliveryIds = new Set<string>();
    const deliveryQueue: MeshSparseDeliveryQueuePortV1 = Object.freeze({
      pending: () => 0,
      enqueue: async (
        request: Parameters<MeshSparseDeliveryQueuePortV1["enqueue"]>[0],
      ) => {
        const delivery = validateMeshSparseDeliveryV2(
          profile,
          request.delivery,
        );
        if (
          delivery.senderPeerIndex !== localPeerIndex ||
          request.recipient.peerIndex !== delivery.recipientPeerIndex
        )
          return Object.freeze({
            status: "rejected" as const,
            reasonCode: "evaluation_delivery_binding_invalid",
          });
        if (deliveryIds.has(delivery.deliveryDigest))
          return Object.freeze({ status: "duplicate" as const });
        if (
          deliveryIds.size >=
          maximumCapturedDeliveries + maximumSettledReceipts
        )
          return Object.freeze({
            status: "backpressured" as const,
            reasonCode: "evaluation_delivery_idempotency_window_exhausted",
          });
        if (deliveries.length >= maximumCapturedDeliveries)
          return Object.freeze({
            status: "backpressured" as const,
            reasonCode: "evaluation_delivery_outbox_exhausted",
          });
        const binding = egressBindings.get(this);
        const sequence = binding?.nextDeliverySequence ?? deliveries.length + 1;
        const operationId = binding?.activeOperationId ?? null;
        const body = {
          sequence,
          operationId,
          updateDigest: delivery.update.updateDigest,
          deliveryDigest: delivery.deliveryDigest,
        };
        deliveries.push(
          immutable({
            ...body,
            delivery,
            captureDigest: scalableEvaluationDigestV1(
              "reference-integrated-delivery-capture",
              body,
            ),
          }),
        );
        deliveryIds.add(delivery.deliveryDigest);
        if (binding) {
          binding.nextDeliverySequence += 1;
          binding.latestDeliveryCaptureDigest =
            deliveries.at(-1)!.captureDigest;
        }
        return Object.freeze({ status: "admitted" as const });
      },
    });
    const plane = new MeshSparsePeerPlaneRuntimeV1({
      ...options.plane,
      deliveryQueue,
    });
    if (!isMeshSparsePeerPlaneRuntimeV1(plane))
      fail("reference_integrated_sparse_plane_not_genuine");
    egressBindings.set(this, {
      plane,
      profile,
      descriptor,
      localPeerIndex,
      localPeerId: options.localPeerId,
      recoveryPeerId: options.recoveryPeerId ?? null,
      scope,
      objectiveDigest: options.objectiveDigest,
      membershipConfigurationDigest:
        options.membershipConfigurationDigest as PlanningDigestV1,
      membershipEpoch: options.membershipEpoch,
      initialAssignmentEpoch: assignmentEpoch,
      fencingTokenPrefix,
      maximumCapturedDeliveries,
      maximumCapturedEffects,
      maximumSettledReceipts,
      ...(options.crypto === undefined ? {} : { crypto: options.crypto }),
      assignments: new Map(),
      deliveries,
      effects: [],
      effectReceipts: new Map(),
      deliveryIds,
      settledDeliveries: new Map(),
      settledEffects: new Map(),
      settledEffectExecutions: new Map(),
      nextDeliverySequence: 1,
      nextEffectSequence: 1,
      activeOperationId: null,
      latestDeliveryCaptureDigest: null,
      latestEffectCaptureDigest: null,
    });
    Object.defineProperties(this, {
      publish: {
        value: canonicalEgressPublish.bind(this),
        writable: false,
        configurable: false,
      },
      resolve: {
        value: canonicalEgressResolve.bind(this),
        writable: false,
        configurable: false,
      },
      install: {
        value: canonicalEgressInstall.bind(this),
        writable: false,
        configurable: false,
      },
      reconcile: {
        value: canonicalEgressReconcile.bind(this),
        writable: false,
        configurable: false,
      },
      commit: {
        value: canonicalEgressCommit.bind(this),
        writable: false,
        configurable: false,
      },
    });
    Object.freeze(this);
  }

  async publish(
    input: Parameters<DistributedCollectiveSparsePlanePortV1["publish"]>[0],
  ): Promise<MeshSparsePeerPlanePublishResultV1> {
    const binding = requireEgress(this);
    const captured = Object.freeze({
      topic: input.topic,
      payloadDigest: input.payloadDigest,
      logicalTime: input.logicalTime,
      lifetime: input.lifetime,
      ...(input.fanout === undefined ? {} : { fanout: input.fanout }),
    });
    const result = await invokeMeshSparsePeerPlanePublishV1(
      binding.plane,
      captured,
    );
    const update = validateMeshSparseUpdateV2(binding.profile, result.update);
    if (
      update.originPeerIndex !== binding.localPeerIndex ||
      update.originPeerId !== binding.localPeerId ||
      update.topic !== captured.topic ||
      update.payloadDigest !== captured.payloadDigest ||
      update.createdAtLogicalTime !== captured.logicalTime
    )
      fail("reference_integrated_publish_binding_invalid");
    return result;
  }

  async resolve(
    input: Parameters<ReferenceRecoveryAssignmentAuthorityV1["resolve"]>[0],
  ): Promise<AssuranceExecutionAuthorityFenceV1 | null> {
    const binding = requireEgress(this);
    const payload = input.cognitiveRequest.payload as Record<string, unknown>;
    const missionIntentId = payload.missionIntentId;
    const planningCycleId = payload.planningCycleId;
    if (
      input.localPeerId !== binding.localPeerId ||
      input.cognitiveRequest.tenantId !== binding.scope.tenantId ||
      missionIntentId !== binding.scope.missionIntentId ||
      typeof planningCycleId !== "string"
    )
      return null;
    const assignment = assignmentFor(binding, input.task.taskId);
    if (assignment.assignedPeerId !== binding.localPeerId) return null;
    return createAssuranceExecutionAuthorityFenceV1(
      {
        schemaVersion: 1,
        scope: {
          ...binding.scope,
          objectiveId: planningCycleId,
          workItemId: input.task.taskId,
        },
        executionId: input.executionId,
        awardDigest: input.awardDigest,
        taskDigest: input.task.taskDigest,
        assignedPeerId: assignment.assignedPeerId,
        assignmentEpoch: assignment.assignmentEpoch,
        fencingToken: assignment.fencingToken,
        membershipConfigurationDigest: binding.membershipConfigurationDigest,
        membershipEpoch: binding.membershipEpoch,
      },
      binding.crypto,
    );
  }

  async install(
    input: Parameters<ReferenceRecoveryAssignmentAuthorityV1["install"]>[0],
  ): Promise<{
    readonly assignmentEpoch: number;
    readonly fencingToken: string;
    readonly installedAtLogicalMs: number;
  }> {
    const binding = requireEgress(this);
    const current = assignmentFor(binding, input.workItemId);
    if (
      current.assignedPeerId !== input.excludedPeerId ||
      current.assignmentEpoch !== input.expectedAssignmentEpoch ||
      current.fencingToken !== input.expectedFencingToken ||
      input.nextAssignmentEpoch <= current.assignmentEpoch
    )
      fail("reference_integrated_assignment_install_conflict");
    if (!binding.recoveryPeerId)
      fail("reference_integrated_recovery_peer_unavailable");
    const next = immutable({
      assignedPeerId: binding.recoveryPeerId,
      assignmentEpoch: input.nextAssignmentEpoch,
      fencingToken: `${binding.fencingTokenPrefix}:${input.nextAssignmentEpoch}:${input.operationId}`,
    });
    binding.assignments.set(input.workItemId, next);
    return immutable({
      assignmentEpoch: next.assignmentEpoch,
      fencingToken: next.fencingToken,
      installedAtLogicalMs: input.logicalTimeMs,
    });
  }

  async commit(
    input: Parameters<ReferenceRecoveryAssignmentAuthorityV1["commit"]>[0],
  ): Promise<ProtectedEffectReceiptV1> {
    const binding = requireEgress(this);
    input = Object.freeze({
      executionId: input.executionId,
      effect: immutable(input.effect),
      certificate: immutable(input.certificate),
      authorityFence: immutable(input.authorityFence),
      logicalTimeMs: input.logicalTimeMs,
      signal: input.signal,
    });
    if (input.signal.aborted) fail("reference_integrated_effect_cancelled");
    if (input.effect.schemaVersion !== 1)
      fail("reference_integrated_effect_proposal_invalid");
    identifier(input.effect.effectClass, "effect_class");
    const expectedProposalDigest = await collectiveQuorumDigestV1(
      {
        domain: "assurance-protected-effect-proposal-v1",
        body: {
          schemaVersion: 1,
          effectClass: input.effect.effectClass,
          payload: input.effect.payload,
        },
      },
      binding.crypto,
    );
    if (input.effect.proposalDigest !== expectedProposalDigest)
      fail("reference_integrated_effect_proposal_invalid");
    const prior = binding.effectReceipts.get(input.executionId);
    if (prior) {
      if (
        prior.proposalDigest !== input.effect.proposalDigest ||
        prior.finalityCertificateDigest !== input.certificate.certificateDigest
      )
        fail("reference_integrated_effect_idempotency_conflict");
      return prior;
    }
    if (
      binding.effectReceipts.size >=
      binding.maximumCapturedEffects + binding.maximumSettledReceipts
    )
      fail("reference_integrated_effect_idempotency_window_exhausted");
    await validateAuthorityFence(binding, input.authorityFence, input);
    if (input.certificate.valueDigest !== input.effect.proposalDigest)
      fail("reference_integrated_effect_finality_invalid");
    const action = validateMultiDomainActionEnvelopeV1(
      input.effect.payload,
      binding.descriptor,
    );
    if (binding.effects.length >= binding.maximumCapturedEffects)
      fail("reference_integrated_effect_outbox_exhausted");
    const externalReference = `evaluation-effect:${input.executionId}`;
    const receiptBody = {
      schemaVersion: 1 as const,
      executionId: input.executionId,
      proposalDigest: input.effect.proposalDigest,
      finalityCertificateDigest: input.certificate.certificateDigest,
      status: "committed" as const,
      externalReference,
      reasonCode: "evaluation_outbox_committed",
    };
    const receipt = immutable<ProtectedEffectReceiptV1>({
      ...receiptBody,
      receiptDigest: await collectiveQuorumDigestV1(
        {
          domain: "assurance-protected-effect-receipt-v1",
          body: receiptBody,
        },
        binding.crypto,
      ),
    });
    const sequence = binding.nextEffectSequence;
    const operationId = binding.activeOperationId;
    const captureBody = {
      sequence,
      operationId,
      executionId: input.executionId,
      proposalDigest: input.effect.proposalDigest as PlanningDigestV1,
      action,
      receiptDigest: receipt.receiptDigest,
    };
    const capture = immutable({
      ...captureBody,
      receipt,
      captureDigest: scalableEvaluationDigestV1(
        "reference-integrated-effect-capture",
        captureBody,
      ),
    });
    binding.effects.push(capture);
    binding.nextEffectSequence += 1;
    binding.latestEffectCaptureDigest = capture.captureDigest;
    binding.effectReceipts.set(input.executionId, receipt);
    return receipt;
  }

  async reconcile(
    input: Parameters<ReferenceRecoveryAssignmentAuthorityV1["reconcile"]>[0],
  ): Promise<ProtectedEffectReceiptV1 | null> {
    const binding = requireEgress(this);
    const prior = binding.effectReceipts.get(input.executionId);
    if (!prior) return null;
    if (
      prior.proposalDigest !== input.effect.proposalDigest ||
      prior.finalityCertificateDigest !== input.certificate.certificateDigest ||
      input.authorityFence.executionId !== input.executionId
    )
      fail("reference_integrated_effect_idempotency_conflict");
    return prior;
  }
}

const canonicalEgressPublish =
  ReferenceIntegratedScalableEvaluationEgressRuntimeV1.prototype.publish;
const canonicalEgressResolve =
  ReferenceIntegratedScalableEvaluationEgressRuntimeV1.prototype.resolve;
const canonicalEgressInstall =
  ReferenceIntegratedScalableEvaluationEgressRuntimeV1.prototype.install;
const canonicalEgressReconcile =
  ReferenceIntegratedScalableEvaluationEgressRuntimeV1.prototype.reconcile;
const canonicalEgressCommit =
  ReferenceIntegratedScalableEvaluationEgressRuntimeV1.prototype.commit;

export function isReferenceIntegratedScalableEvaluationEgressV1(
  value: unknown,
): value is ReferenceIntegratedScalableEvaluationEgressRuntimeV1 {
  return Boolean(
    value && typeof value === "object" && egressBindings.has(value),
  );
}

export interface ReferenceIntegratedScalableEvaluationEgressSnapshotV1 {
  readonly schemaVersion: 1;
  readonly localPeerIndex: number;
  readonly localPeerId: string;
  readonly capturedDeliveryCount: number;
  readonly capturedEffectCount: number;
  readonly settledDeliveryCount: number;
  readonly settledEffectCount: number;
  readonly latestDeliveryCaptureDigest: PlanningDigestV1 | null;
  readonly latestEffectCaptureDigest: PlanningDigestV1 | null;
}

/** Read-only bounded evidence about the nominal egress; payloads stay private. */
export function inspectReferenceIntegratedScalableEvaluationEgressV1(
  value: ReferenceIntegratedScalableEvaluationEgressRuntimeV1,
): ReferenceIntegratedScalableEvaluationEgressSnapshotV1 {
  const binding = requireEgress(value);
  return immutable({
    schemaVersion: 1 as const,
    localPeerIndex: binding.localPeerIndex,
    localPeerId: binding.localPeerId,
    capturedDeliveryCount: binding.deliveries.length,
    capturedEffectCount: binding.effects.length,
    settledDeliveryCount: binding.settledDeliveries.size,
    settledEffectCount: binding.settledEffects.size,
    latestDeliveryCaptureDigest: binding.latestDeliveryCaptureDigest,
    latestEffectCaptureDigest: binding.latestEffectCaptureDigest,
  });
}

export interface ReferenceIntegratedScalableEvaluationPeerV1 {
  readonly schemaVersion: 1;
  readonly peerIndex: number;
  readonly stack: ReferenceIntegratedCollectiveStackV1;
  readonly egress: ReferenceIntegratedScalableEvaluationEgressRuntimeV1;
  readonly missionIntent: MissionIntentV1;
  readonly observationSchemaDigest: PlanningDigestV1;
}

type ReferenceIntegratedNodeStateV1 = Awaited<
  ReturnType<ReferenceIntegratedCollectiveStackV1["node"]["load"]>
>;

interface PeerBindingStateV1 extends ReferenceIntegratedScalableEvaluationPeerV1 {
  readonly inbound: Map<string, InboundDeliveryRecordV1>;
  readonly admittedInbound: Map<string, PlanningDigestV1>;
  readonly journals: Map<PlanningDigestV1, StepJournalV1>;
  readonly ingressInFlight: Map<
    string,
    Readonly<{
      inputDigest: PlanningDigestV1;
      result: Promise<ScalableEvaluationMessageIngressReceiptV1>;
    }>
  >;
  retiredThroughLogicalTime: number;
  inFlight: Readonly<{
    inputDigest: PlanningDigestV1;
    result: Promise<ScalableEvaluationTeamStepOutputV1>;
  }> | null;
}

interface ReferenceIntegratedTransportEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly kind: "reference_integrated_sparse_delivery";
  readonly captureSequence: number;
  readonly captureOperationId: PlanningDigestV1;
  readonly captureDigest: PlanningDigestV1;
  readonly delivery: MeshSparseDeliveryV2;
  readonly artifact: DistributedCollectiveMessageV1;
}

interface InboundDeliveryRecordV1 {
  readonly messageId: string;
  readonly transportEnvelopeDigest: PlanningDigestV1;
  readonly admittedAtLogicalTime: number;
  readonly envelope: ReferenceIntegratedTransportEnvelopeV1;
}

type StepJournalPhaseV1 =
  "prepared" | "node_mutated" | "output_staged" | "settled" | "indeterminate";

interface StepJournalV1 {
  readonly requestDigest: PlanningDigestV1;
  readonly inputDigest: PlanningDigestV1;
  readonly logicalTime: number;
  preStateDigest: string | null;
  phase: StepJournalPhaseV1;
  postStateDigest: string | null;
  deliveryCaptureDigests: PlanningDigestV1[];
  effectCaptureDigests: PlanningDigestV1[];
  output: ScalableEvaluationTeamStepOutputV1 | null;
  readonly pendingMessageIds: Set<string>;
  readonly pendingActionIndexes: Set<number>;
  readonly processedInboundMessageIds: Set<string>;
  sessionBinding: Readonly<{
    sessionId: string;
    episodeId: string;
    logicalTime: number;
  }> | null;
}

interface TeamPortBindingV1 {
  readonly descriptor: ScalableEvaluationTeamDescriptorV1;
  readonly evaluationDefinitionDigest: PlanningDigestV1;
  readonly peers: ReadonlyMap<number, PeerBindingStateV1>;
}

export function bindReferenceIntegratedScalableEvaluationPeerV1(input: {
  readonly peerIndex: number;
  readonly stack: ReferenceIntegratedCollectiveStackV1;
  readonly egress: ReferenceIntegratedScalableEvaluationEgressRuntimeV1;
  readonly missionIntent: MissionIntentV1;
  readonly observationSchemaDigest: PlanningDigestV1;
}): ReferenceIntegratedScalableEvaluationPeerV1 {
  assertOnlyKeys(
    input,
    [
      "peerIndex",
      "stack",
      "egress",
      "missionIntent",
      "observationSchemaDigest",
    ],
    [],
    "reference_integrated_peer_binding",
  );
  if (!isReferenceIntegratedCollectiveStackV1(input.stack))
    fail("reference_integrated_stack_not_genuine");
  if (!isReferenceIntegratedScalableEvaluationEgressV1(input.egress))
    fail("reference_integrated_egress_not_genuine");
  if (
    !isReferenceIntegratedCollectiveStackBoundToPlaneAndRecoveryV1(
      input.stack,
      {
        plane: input.egress,
        recoveryAssignmentAuthority: input.egress,
      },
    )
  )
    fail("reference_integrated_stack_egress_binding_invalid");
  const egress = requireEgress(input.egress);
  safeInteger(
    input.peerIndex,
    "peer_index",
    0,
    egress.profile.maximumPeers - 1,
  );
  if (input.peerIndex !== egress.localPeerIndex)
    fail("reference_integrated_peer_index_mismatch");
  const missionIntent = validateMissionIntentV1(input.missionIntent);
  if (
    missionIntent.tenantId !== egress.scope.tenantId ||
    missionIntent.missionIntentId !== egress.scope.missionIntentId ||
    missionIntent.objective.meshId !== egress.scope.meshId ||
    missionIntent.objective.objectiveId !== egress.scope.objectiveId
  )
    fail("reference_integrated_mission_scope_mismatch");
  if (objectiveScopeDigest(missionIntent) !== egress.objectiveDigest)
    fail("reference_integrated_objective_scope_mismatch");
  digest(input.observationSchemaDigest, "observation_schema_digest");
  if (egressPeerOwners.has(input.egress) || stackPeerOwners.has(input.stack))
    fail("reference_integrated_peer_binding_already_exists");
  const peer = Object.freeze({
    schemaVersion: 1 as const,
    peerIndex: input.peerIndex,
    stack: input.stack,
    egress: input.egress,
    missionIntent,
    observationSchemaDigest: input.observationSchemaDigest,
  });
  peerBindings.set(peer, {
    ...peer,
    inbound: new Map(),
    admittedInbound: new Map(),
    journals: new Map(),
    ingressInFlight: new Map(),
    retiredThroughLogicalTime: -1,
    inFlight: null,
  });
  egressPeerOwners.set(input.egress, peer);
  stackPeerOwners.set(input.stack, peer);
  return peer;
}

export function isReferenceIntegratedScalableEvaluationPeerV1(
  value: unknown,
): value is ReferenceIntegratedScalableEvaluationPeerV1 {
  return Boolean(value && typeof value === "object" && peerBindings.has(value));
}

export function createReferenceIntegratedScalableEvaluationTeamPortV1(input: {
  readonly descriptor: ScalableEvaluationTeamDescriptorV1;
  readonly definition: ScalableEvaluationDefinitionV1;
  readonly peers: readonly ReferenceIntegratedScalableEvaluationPeerV1[];
}): ScalableEvaluationTeamPortV1 {
  assertOnlyKeys(
    input,
    ["descriptor", "definition", "peers"],
    [],
    "reference_integrated_team_options",
  );
  const descriptor = validateScalableEvaluationTeamDescriptorV1(
    input.descriptor,
  );
  if (
    descriptor.implementationId !==
    REFERENCE_INTEGRATED_SCALABLE_EVALUATION_IMPLEMENTATION_ID_V1
  )
    fail("reference_integrated_team_implementation_id_invalid");
  if (!Array.isArray(input.peers) || input.peers.length === 0)
    fail("reference_integrated_peers_missing");
  const peers = new Map<number, PeerBindingStateV1>();
  let definition: ScalableEvaluationDefinitionV1 | null = null;
  let adapterDescriptorDigest: PlanningDigestV1 | null = null;
  let scope: ReferenceIntegratedScalableEvaluationScopeV1 | null = null;
  let objectiveDigest: PlanningDigestV1 | null = null;
  for (const peer of input.peers) {
    const binding = peerBindings.get(peer as object);
    if (!binding) fail("reference_integrated_peer_not_genuine");
    if (peerTeamOwners.has(peer as object))
      fail("reference_integrated_peer_already_owned");
    if (peers.has(binding.peerIndex))
      fail("reference_integrated_peer_duplicate");
    const egress = requireEgress(binding.egress);
    if (definition === null) {
      definition = validateScalableEvaluationDefinitionV1(
        input.definition,
        egress.descriptor,
      );
      adapterDescriptorDigest = egress.descriptor.descriptorDigest;
      scope = egress.scope;
      objectiveDigest = egress.objectiveDigest;
    }
    if (
      !sameEvaluationScope(egress.scope, scope!) ||
      egress.objectiveDigest !== objectiveDigest
    )
      fail("reference_integrated_peer_scope_mismatch");
    if (
      egress.descriptor.descriptorDigest !== adapterDescriptorDigest ||
      egress.profile.profileId !== definition.profile.profileId ||
      binding.peerIndex >= definition.profile.agentCount ||
      !egress.descriptor.observationSchemas.some(
        (schema) => schema.schemaDigest === binding.observationSchemaDigest,
      )
    )
      fail("reference_integrated_peer_definition_mismatch");
    peers.set(binding.peerIndex, binding);
  }
  if (
    !definition ||
    !definition.teams.some(
      (team) => team.descriptorDigest === descriptor.descriptorDigest,
    )
  )
    fail("reference_integrated_team_definition_mismatch");
  const port: ScalableEvaluationTeamPortV1 = Object.freeze({
    descriptor,
    stepV1: (step: ScalableEvaluationTeamStepInputV1) =>
      stepReferenceIntegratedTeamWithJournalV1({
        step,
        descriptor,
        evaluationDefinitionDigest: definition.definitionDigest,
        peers,
      }),
    ingestAcknowledgedMessageV1: (
      acknowledged: ScalableEvaluationAcknowledgedMessageV1,
    ) =>
      ingestAcknowledgedReferenceMessageWithConcurrencyV1({
        acknowledged,
        descriptor,
        evaluationDefinitionDigest: definition.definitionDigest,
        peers,
      }),
    settleActionV1: (settlement: ScalableEvaluationActionSettlementV1) =>
      settleReferenceActionV1({
        settlement,
        descriptor,
        evaluationDefinitionDigest: definition.definitionDigest,
        peers,
      }),
  });
  for (const peer of input.peers) peerTeamOwners.set(peer as object, port);
  teamPortBindings.set(port, {
    descriptor,
    evaluationDefinitionDigest: definition.definitionDigest,
    peers,
  });
  teamPorts.add(port);
  return port;
}

export function isReferenceIntegratedScalableEvaluationTeamPortV1(
  value: unknown,
): value is ScalableEvaluationTeamPortV1 {
  return Boolean(value && typeof value === "object" && teamPorts.has(value));
}

async function ingestAcknowledgedReferenceMessageWithConcurrencyV1(input: {
  readonly acknowledged: ScalableEvaluationAcknowledgedMessageV1;
  readonly descriptor: ScalableEvaluationTeamDescriptorV1;
  readonly evaluationDefinitionDigest: PlanningDigestV1;
  readonly peers: ReadonlyMap<number, PeerBindingStateV1>;
}): Promise<ScalableEvaluationMessageIngressReceiptV1> {
  const source = input.peers.get(input.acknowledged?.message?.sourcePeerIndex);
  if (!source) return ingestAcknowledgedReferenceMessageV1(input);
  const messageId = input.acknowledged.message.messageId;
  const inputDigest = scalableEvaluationDigestV1(
    "reference-integrated-message-ingress-input",
    input.acknowledged as unknown as PlanningJson,
  );
  const prior = source.ingressInFlight.get(messageId);
  if (prior) {
    if (prior.inputDigest !== inputDigest)
      fail("reference_integrated_message_ingress_concurrent_conflict");
    return prior.result;
  }
  const result = ingestAcknowledgedReferenceMessageV1(input);
  source.ingressInFlight.set(messageId, Object.freeze({ inputDigest, result }));
  try {
    return await result;
  } finally {
    if (source.ingressInFlight.get(messageId)?.result === result)
      source.ingressInFlight.delete(messageId);
  }
}

async function ingestAcknowledgedReferenceMessageV1(input: {
  readonly acknowledged: ScalableEvaluationAcknowledgedMessageV1;
  readonly descriptor: ScalableEvaluationTeamDescriptorV1;
  readonly evaluationDefinitionDigest: PlanningDigestV1;
  readonly peers: ReadonlyMap<number, PeerBindingStateV1>;
}): Promise<ScalableEvaluationMessageIngressReceiptV1> {
  const acknowledged = input.acknowledged;
  if (
    !acknowledged ||
    acknowledged.schemaVersion !== 1 ||
    acknowledged.evaluationDefinitionDigest !==
      input.evaluationDefinitionDigest ||
    acknowledged.teamId !== input.descriptor.teamId
  )
    fail("reference_integrated_message_ingress_scope_invalid");
  identifier(acknowledged.sessionId, "message_ingress_session_id");
  identifier(acknowledged.episodeId, "message_ingress_episode_id");
  identifier(acknowledged.eventId, "message_ingress_event_id");
  safeInteger(acknowledged.logicalTime, "message_ingress_logical_time", 0);
  const batch = validateShardedSimulationCrossShardMessageBatchV1(
    acknowledged.batch,
  );
  validateShardedSimulationCrossShardMessageAckV1(
    acknowledged.bridgeAck,
    batch.batchId,
    batch.batchDigest,
    [acknowledged.eventId],
  );
  const bridgeAck = acknowledged.bridgeAck;

  const message = acknowledged.message;
  const source = input.peers.get(message.sourcePeerIndex);
  const target = input.peers.get(message.targetPeerIndex);
  if (!source || !target)
    fail("reference_integrated_message_ingress_peer_invalid");
  const sourceEgress = requireEgress(source.egress);
  const targetEgress = requireEgress(target.egress);
  if (
    !sameEvaluationScope(sourceEgress.scope, targetEgress.scope) ||
    sourceEgress.objectiveDigest !== targetEgress.objectiveDigest
  )
    fail("reference_integrated_message_ingress_scope_invalid");
  const envelope = validateReferenceIntegratedTransportEnvelopeV1(
    message.transportEnvelope,
    sourceEgress.profile,
  );
  const delivery = envelope.delivery;
  if (
    message.messageId !== delivery.deliveryDigest ||
    message.sourcePeerIndex !== delivery.senderPeerIndex ||
    message.targetPeerIndex !== delivery.recipientPeerIndex ||
    message.payloadDigest !== envelope.artifact.messageDigest ||
    envelope.artifact.artifactDigest !== delivery.update.payloadDigest ||
    delivery.update.createdAtLogicalTime > acknowledged.logicalTime ||
    scalableEvaluationDigestV1(
      "team-message-transport-envelope",
      envelope as unknown as PlanningJson,
    ) !== message.transportEnvelopeDigest ||
    new TextEncoder().encode(JSON.stringify(envelope)).byteLength !==
      message.byteLength ||
    batch.sessionId !== acknowledged.sessionId ||
    batch.episodeId !== acknowledged.episodeId ||
    batch.logicalTime !== acknowledged.logicalTime ||
    batch.messages.length !== 1 ||
    batch.messages[0]?.eventId !== acknowledged.eventId ||
    batch.messages[0]?.sourcePeerIndex !== message.sourcePeerIndex ||
    batch.messages[0]?.targetPeerIndex !== message.targetPeerIndex ||
    batch.messages[0]?.logicalTime !== acknowledged.logicalTime ||
    batch.messages[0]?.payloadDigest !== message.transportEnvelopeDigest
  )
    fail("reference_integrated_message_ingress_binding_invalid");
  validateMeshSparseDeliveryV2(targetEgress.profile, delivery);

  const pendingCapture = sourceEgress.deliveries.find(
    (record) => record.delivery.deliveryDigest === message.messageId,
  );
  const settledCapture = sourceEgress.settledDeliveries.get(message.messageId);
  const sourceJournal = findStagedMessageJournalV1(source, message.messageId);
  const stagedMessage = sourceJournal?.output?.messages.find(
    (candidate) => candidate.messageId === message.messageId,
  );
  if (
    !sourceJournal ||
    sourceJournal.logicalTime !== acknowledged.logicalTime ||
    !stagedMessage ||
    stagedMessage.transportEnvelopeDigest !== message.transportEnvelopeDigest ||
    stagedMessage.payloadDigest !== message.payloadDigest ||
    (!pendingCapture && !settledCapture)
  )
    fail("reference_integrated_message_ingress_origin_invalid");
  bindJournalSessionV1(sourceJournal, {
    sessionId: acknowledged.sessionId,
    episodeId: acknowledged.episodeId,
    logicalTime: acknowledged.logicalTime,
  });
  if (
    pendingCapture &&
    (pendingCapture.captureDigest !==
      findDeliveryCaptureDigestV1(source, message.messageId) ||
      pendingCapture.sequence !== envelope.captureSequence ||
      pendingCapture.operationId !== envelope.captureOperationId ||
      pendingCapture.captureDigest !== envelope.captureDigest ||
      pendingCapture.delivery.deliveryDigest !== delivery.deliveryDigest ||
      pendingCapture.delivery.update.updateDigest !==
        delivery.update.updateDigest)
  )
    fail("reference_integrated_message_ingress_origin_invalid");
  if (!pendingCapture && settledCapture !== envelope.captureDigest)
    fail("reference_integrated_message_ingress_origin_invalid");

  const priorInbound = target.inbound.get(message.messageId);
  const priorAdmitted = target.admittedInbound.get(message.messageId);
  if (
    (priorInbound &&
      priorInbound.transportEnvelopeDigest !==
        message.transportEnvelopeDigest) ||
    (priorAdmitted && priorAdmitted !== message.transportEnvelopeDigest)
  )
    fail("reference_integrated_message_ingress_idempotency_conflict");
  const duplicate = Boolean(priorInbound || priorAdmitted);
  if (
    pendingCapture &&
    !sourceEgress.settledDeliveries.has(message.messageId) &&
    sourceEgress.settledDeliveries.size >= sourceEgress.maximumSettledReceipts
  )
    fail("reference_integrated_delivery_idempotency_window_exhausted");
  if (!duplicate) {
    if (target.inbound.size >= MAXIMUM_INBOUND_MESSAGES_PER_PEER)
      fail("reference_integrated_message_ingress_exhausted");
    await storeReferenceIntegratedCollectiveArtifactV1(
      target.stack,
      envelope.artifact,
    );
    target.inbound.set(
      message.messageId,
      immutable({
        messageId: message.messageId,
        transportEnvelopeDigest: message.transportEnvelopeDigest,
        admittedAtLogicalTime: acknowledged.logicalTime,
        envelope,
      }),
    );
  }

  if (pendingCapture) {
    const captureIndex = sourceEgress.deliveries.indexOf(pendingCapture);
    if (captureIndex < 0)
      fail("reference_integrated_delivery_capture_unavailable");
    sourceEgress.deliveries.splice(captureIndex, 1);
    sourceEgress.settledDeliveries.set(
      message.messageId,
      pendingCapture.captureDigest,
    );
  }
  settleJournalMessageV1(source, message.messageId);

  const body = {
    schemaVersion: 1 as const,
    evaluationDefinitionDigest: input.evaluationDefinitionDigest,
    teamId: input.descriptor.teamId,
    sessionId: acknowledged.sessionId,
    episodeId: acknowledged.episodeId,
    logicalTime: acknowledged.logicalTime,
    eventId: acknowledged.eventId,
    messageId: message.messageId,
    transportEnvelopeDigest: message.transportEnvelopeDigest,
    batchDigest: batch.batchDigest,
    bridgeAckDigest: bridgeAck.ackDigest,
    status: duplicate ? ("duplicate" as const) : ("admitted" as const),
  };
  return immutable({
    ...body,
    receiptDigest: scalableEvaluationDigestV1(
      "team-message-ingress-receipt",
      body,
    ),
  });
}

async function settleReferenceActionV1(input: {
  readonly settlement: ScalableEvaluationActionSettlementV1;
  readonly descriptor: ScalableEvaluationTeamDescriptorV1;
  readonly evaluationDefinitionDigest: PlanningDigestV1;
  readonly peers: ReadonlyMap<number, PeerBindingStateV1>;
}): Promise<ScalableEvaluationActionSettlementReceiptV1> {
  const settlement = input.settlement;
  if (
    !settlement ||
    settlement.schemaVersion !== 1 ||
    settlement.evaluationDefinitionDigest !==
      input.evaluationDefinitionDigest ||
    settlement.teamId !== input.descriptor.teamId
  )
    fail("reference_integrated_action_settlement_scope_invalid");
  identifier(settlement.sessionId, "action_settlement_session_id");
  identifier(settlement.episodeId, "action_settlement_episode_id");
  safeInteger(settlement.peerIndex, "action_settlement_peer_index", 0);
  safeInteger(settlement.logicalTime, "action_settlement_logical_time", 0);
  safeInteger(settlement.actionIndex, "action_settlement_index", 0);
  digest(settlement.outputDigest, "action_settlement_output_digest");
  if (
    !settlement.request ||
    settlement.request.schemaVersion !== 1 ||
    settlement.request.actionId !==
      `evaluation:${settlement.teamId}:${settlement.logicalTime}:${settlement.actionIndex}` ||
    settlement.request.sessionId !== settlement.sessionId ||
    settlement.request.episodeId !== settlement.episodeId ||
    settlement.request.peerIndex !== settlement.peerIndex ||
    settlement.request.logicalTime !== settlement.logicalTime ||
    scalableEvaluationDigestV1(
      "reference-integrated-staged-action",
      settlement.request.action,
    ) !==
      scalableEvaluationDigestV1(
        "reference-integrated-staged-action",
        settlement.action as unknown as PlanningJson,
      )
  )
    fail("reference_integrated_action_settlement_request_invalid");
  const receipt = validateShardedSimulationEffectReceiptV1(
    settlement.effectReceipt,
    settlement.request,
  );
  const peer = input.peers.get(settlement.peerIndex);
  if (!peer) fail("reference_integrated_action_settlement_peer_invalid");
  const journal = [...peer.journals.values()].find(
    (candidate) => candidate.output?.outputDigest === settlement.outputDigest,
  );
  const stagedAction = journal?.output?.actions[settlement.actionIndex];
  if (
    !journal ||
    !stagedAction ||
    scalableEvaluationDigestV1(
      "reference-integrated-staged-action",
      stagedAction as unknown as PlanningJson,
    ) !==
      scalableEvaluationDigestV1(
        "reference-integrated-staged-action",
        settlement.action as unknown as PlanningJson,
      )
  )
    fail("reference_integrated_action_settlement_binding_invalid");
  bindJournalSessionV1(journal, {
    sessionId: settlement.sessionId,
    episodeId: settlement.episodeId,
    logicalTime: settlement.logicalTime,
  });
  const captureDigest = journal.effectCaptureDigests[settlement.actionIndex];
  if (!captureDigest)
    fail("reference_integrated_action_settlement_capture_invalid");
  const egress = requireEgress(peer.egress);
  const pendingCapture = egress.effects.find(
    (record) => record.captureDigest === captureDigest,
  );
  const settledReceiptDigest = egress.settledEffects.get(captureDigest);
  if (
    pendingCapture &&
    scalableEvaluationDigestV1(
      "reference-integrated-staged-action",
      pendingCapture.action as unknown as PlanningJson,
    ) !==
      scalableEvaluationDigestV1(
        "reference-integrated-staged-action",
        settlement.action as unknown as PlanningJson,
      )
  )
    fail("reference_integrated_action_settlement_capture_invalid");
  if (
    !pendingCapture &&
    settledReceiptDigest !== settlement.effectReceipt.receiptDigest
  )
    fail("reference_integrated_action_settlement_capture_invalid");
  const duplicate = !pendingCapture;
  if (pendingCapture) {
    if (
      !egress.settledEffects.has(captureDigest) &&
      egress.settledEffects.size >= egress.maximumSettledReceipts
    )
      fail("reference_integrated_effect_idempotency_window_exhausted");
    egress.effects.splice(egress.effects.indexOf(pendingCapture), 1);
    egress.settledEffects.set(
      captureDigest,
      settlement.effectReceipt.receiptDigest,
    );
    egress.settledEffectExecutions.set(
      captureDigest,
      pendingCapture.executionId,
    );
  }
  journal.pendingActionIndexes.delete(settlement.actionIndex);
  settleJournalIfCompleteV1(journal);
  const body = {
    schemaVersion: 1 as const,
    evaluationDefinitionDigest: input.evaluationDefinitionDigest,
    teamId: input.descriptor.teamId,
    sessionId: settlement.sessionId,
    episodeId: settlement.episodeId,
    peerIndex: settlement.peerIndex,
    logicalTime: settlement.logicalTime,
    actionIndex: settlement.actionIndex,
    outputDigest: settlement.outputDigest,
    actionDigest: settlement.request.actionDigest,
    effectReceiptDigest: settlement.effectReceipt.receiptDigest,
    status: duplicate ? ("duplicate" as const) : ("settled" as const),
  };
  return immutable({
    ...body,
    receiptDigest: scalableEvaluationDigestV1(
      "team-action-settlement-receipt",
      body,
    ),
  });
}

async function stepReferenceIntegratedTeamWithJournalV1(input: {
  readonly step: ScalableEvaluationTeamStepInputV1;
  readonly descriptor: ScalableEvaluationTeamDescriptorV1;
  readonly evaluationDefinitionDigest: PlanningDigestV1;
  readonly peers: ReadonlyMap<number, PeerBindingStateV1>;
}): Promise<ScalableEvaluationTeamStepOutputV1> {
  const step = input.step;
  if (
    !step ||
    step.schemaVersion !== 1 ||
    step.evaluationDefinitionDigest !== input.evaluationDefinitionDigest ||
    step.teamId !== input.descriptor.teamId
  )
    fail("reference_integrated_step_scope_invalid");
  safeInteger(step.peerIndex, "step_peer_index", 0);
  safeInteger(step.logicalTime, "step_logical_time", 0);
  safeInteger(step.remainingInteractions, "remaining_interactions", 0);
  safeInteger(step.remainingMessages, "remaining_messages", 0);
  safeInteger(step.remainingMessageBytes, "remaining_message_bytes", 0);
  const peer = input.peers.get(step.peerIndex);
  if (!peer) fail("reference_integrated_peer_not_bound");
  const egress = requireEgress(peer.egress);
  const observations = step.delivery
    .observations as unknown as readonly MultiDomainObservationEnvelopeV1[];
  for (const rawObservation of observations) {
    const observation = validateMultiDomainObservationEnvelopeV1(
      rawObservation,
      egress.descriptor,
    );
    if (
      observation.domain !== step.domain ||
      observation.schemaDigest !== peer.observationSchemaDigest ||
      observation.logicalTime !== step.logicalTime
    )
      fail("reference_integrated_observation_scope_invalid");
  }
  const requestDigest = step.delivery.deliveryDigest as PlanningDigestV1;
  digest(requestDigest, "step_delivery_digest");
  const stepInputDigest = scalableEvaluationDigestV1(
    "reference-integrated-team-step-input",
    {
      evaluationDefinitionDigest: step.evaluationDefinitionDigest,
      teamId: step.teamId,
      peerIndex: step.peerIndex,
      domain: step.domain,
      logicalTime: step.logicalTime,
      deliveryDigest: requestDigest,
      remainingInteractions: step.remainingInteractions,
      remainingMessages: step.remainingMessages,
      remainingMessageBytes: step.remainingMessageBytes,
    },
  );
  if (peer.inFlight) {
    if (peer.inFlight.inputDigest !== stepInputDigest)
      fail("reference_integrated_step_concurrent_conflict");
    return peer.inFlight.result;
  }
  const result = executeReferenceIntegratedTeamStepV1({
    ...input,
    peer,
    egress,
    requestDigest,
    stepInputDigest,
  });
  peer.inFlight = Object.freeze({ inputDigest: stepInputDigest, result });
  try {
    return await result;
  } finally {
    if (peer.inFlight?.result === result) peer.inFlight = null;
  }
}

async function executeReferenceIntegratedTeamStepV1(input: {
  readonly step: ScalableEvaluationTeamStepInputV1;
  readonly descriptor: ScalableEvaluationTeamDescriptorV1;
  readonly evaluationDefinitionDigest: PlanningDigestV1;
  readonly peers: ReadonlyMap<number, PeerBindingStateV1>;
  readonly peer: PeerBindingStateV1;
  readonly egress: EgressBindingV1;
  readonly requestDigest: PlanningDigestV1;
  readonly stepInputDigest: PlanningDigestV1;
}): Promise<ScalableEvaluationTeamStepOutputV1> {
  const { step, peer, egress, requestDigest, stepInputDigest } = input;
  let journal = peer.journals.get(requestDigest);
  if (journal) {
    if (journal.inputDigest !== stepInputDigest)
      fail("reference_integrated_step_retry_conflict");
    if (journal.phase === "indeterminate")
      fail("reference_integrated_step_indeterminate");
    if (journal.output) return journal.output;
  } else {
    if (step.logicalTime <= peer.retiredThroughLogicalTime)
      fail("reference_integrated_step_retry_window_expired");
    pruneSettledStepJournalsV1(peer);
    if (peer.journals.size >= MAXIMUM_STEP_JOURNALS_PER_PEER)
      fail("reference_integrated_step_journal_exhausted");
    const initial = await peer.stack.node.loadOptional();
    journal = {
      requestDigest,
      inputDigest: stepInputDigest,
      logicalTime: step.logicalTime,
      preStateDigest: initial?.stateDigest ?? null,
      phase: "prepared",
      postStateDigest: null,
      deliveryCaptureDigests: [],
      effectCaptureDigests: [],
      output: null,
      pendingMessageIds: new Set(),
      pendingActionIndexes: new Set(),
      processedInboundMessageIds: new Set(),
      sessionBinding: null,
    };
    peer.journals.set(requestDigest, journal);
  }
  if (!journal) fail("reference_integrated_step_journal_unavailable");

  let state = await peer.stack.node.loadOptional();
  if (journal.phase === "node_mutated") {
    if (!state || state.stateDigest !== journal.postStateDigest) {
      journal.phase = "indeterminate";
      fail("reference_integrated_step_indeterminate");
    }
  } else {
    const currentDigest = state?.stateDigest ?? null;
    if (currentDigest !== journal.preStateDigest) {
      journal.phase = "indeterminate";
      fail("reference_integrated_step_indeterminate");
    }
  }

  if (journal.phase === "prepared") {
    beginEgressCapture(egress, stepInputDigest);
    try {
      if (state === null) {
        state = await mutateNodeForJournalV1({
          peer,
          journal,
          operation: () => peer.stack.node.initialize(0),
        });
        journal.preStateDigest = state.stateDigest;
      }
      state = await drainReferenceIntegratedInboundV1({
        peer,
        egress,
        journal,
        state,
        logicalTime: step.logicalTime,
      });
      journal.preStateDigest = state.stateDigest;
      if (step.logicalTime < state.logicalTimeHighWaterMs)
        fail("reference_integrated_step_time_rollback");
      if (state.intent === null) {
        if (state.status !== "idle")
          fail("reference_integrated_mission_state_invalid");
        state = await mutateNodeForJournalV1({
          peer,
          journal,
          operation: () =>
            peer.stack.node.submitMission({
              intent: peer.missionIntent,
              logicalTimeMs: step.logicalTime,
            }),
        });
      } else {
        if (state.intent.intentDigest !== peer.missionIntent.intentDigest)
          fail("reference_integrated_mission_substitution");
        state = await mutateNodeForJournalV1({
          peer,
          journal,
          operation: () =>
            peer.stack.node.advance({ logicalTimeMs: step.logicalTime }),
        });
      }
      journal.postStateDigest = state.stateDigest;
      journal.deliveryCaptureDigests = egress.deliveries
        .filter((record) => record.operationId === stepInputDigest)
        .map((record) => record.captureDigest);
      journal.effectCaptureDigests = egress.effects
        .filter((record) => record.operationId === stepInputDigest)
        .map((record) => record.captureDigest);
      journal.phase = "node_mutated";
    } catch (error) {
      const capturesExist =
        egress.deliveries.some(
          (record) => record.operationId === stepInputDigest,
        ) ||
        egress.effects.some((record) => record.operationId === stepInputDigest);
      const current = await peer.stack.node.loadOptional().catch(() => null);
      if (
        capturesExist ||
        (current?.stateDigest ?? null) !== journal.preStateDigest
      )
        journal.phase = "indeterminate";
      throw error;
    } finally {
      endEgressCapture(egress, stepInputDigest);
    }
  }

  state = await peer.stack.node.load();
  if (
    journal.phase !== "node_mutated" ||
    state.stateDigest !== journal.postStateDigest
  ) {
    journal.phase = "indeterminate";
    fail("reference_integrated_step_indeterminate");
  }

  const capturedDeliveries = journal.deliveryCaptureDigests.map((identity) => {
    const record = egress.deliveries.find(
      (candidate) => candidate.captureDigest === identity,
    );
    if (!record) fail("reference_integrated_delivery_capture_unavailable");
    return record;
  });
  const capturedEffects = journal.effectCaptureDigests.map((identity) => {
    const record = egress.effects.find(
      (candidate) => candidate.captureDigest === identity,
    );
    if (!record) fail("reference_integrated_effect_capture_unavailable");
    return record;
  });
  const messages = await Promise.all(
    capturedDeliveries.map(async (captured) => {
      const artifact = await readReferenceIntegratedCollectiveArtifactV1(
        peer.stack,
        captured.delivery.update.payloadDigest,
      );
      if (!artifact) fail("reference_integrated_outbox_artifact_missing");
      const message = validateCapturedArtifact(
        artifact,
        captured.delivery.update,
      );
      if (captured.operationId === null)
        fail("reference_integrated_delivery_capture_operation_missing");
      const transportEnvelope =
        immutable<ReferenceIntegratedTransportEnvelopeV1>({
          schemaVersion: 1,
          kind: "reference_integrated_sparse_delivery",
          captureSequence: captured.sequence,
          captureOperationId: captured.operationId,
          captureDigest: captured.captureDigest,
          delivery: captured.delivery,
          artifact: message,
        });
      const transportEnvelopeDigest = scalableEvaluationDigestV1(
        "team-message-transport-envelope",
        transportEnvelope as unknown as PlanningJson,
      );
      const byteLength = new TextEncoder().encode(
        JSON.stringify(transportEnvelope),
      ).byteLength;
      if (byteLength < 1) fail("reference_integrated_message_size_invalid");
      return Object.freeze({
        schemaVersion: 1 as const,
        messageId: captured.delivery.deliveryDigest,
        sourcePeerIndex: captured.delivery.senderPeerIndex,
        targetPeerIndex: captured.delivery.recipientPeerIndex,
        payloadDigest: message.messageDigest as PlanningDigestV1,
        transportEnvelope: transportEnvelope as unknown as PlanningJson,
        transportEnvelopeDigest,
        byteLength,
      } satisfies ScalableEvaluationTeamMessageV1);
    }),
  );
  const messageBytes = messages.reduce(
    (total, message) => total + message.byteLength,
    0,
  );
  if (
    messages.length > Math.min(step.remainingMessages, MAXIMUM_STEP_MESSAGES) ||
    messageBytes >
      Math.min(step.remainingMessageBytes, MAXIMUM_STEP_MESSAGE_BYTES)
  )
    fail("reference_integrated_step_message_budget_exceeded");
  if (capturedEffects.length > MAXIMUM_STEP_ACTIONS)
    fail("reference_integrated_step_action_budget_exceeded");
  const actions = capturedEffects.map((captured) => {
    const execution = state.executionReceipts.find(
      (receipt) => receipt.executionId === captured.executionId,
    );
    if (
      !execution ||
      execution.status !== "completed" ||
      execution.effect?.proposalDigest !== captured.proposalDigest ||
      execution.effectReceipt?.externalReference !==
        captured.receipt.externalReference ||
      execution.effectReceipt.receiptDigest !== captured.receipt.receiptDigest
    )
      fail("reference_integrated_effect_receipt_mismatch");
    if (captured.action.domain !== step.domain)
      fail("reference_integrated_effect_domain_mismatch");
    return captured.action;
  });
  const publicMetadata: PlanningJson = {
    adapterKind: "reference_integrated_collective_stack",
    nodeStateDigest: state.stateDigest,
    outboundDeliveryDigests: capturedDeliveries.map(
      (record) => record.delivery.deliveryDigest,
    ),
    effectCaptureDigests: capturedEffects.map((record) => record.captureDigest),
  };
  const body = {
    schemaVersion: 1 as const,
    teamId: input.descriptor.teamId,
    logicalTime: step.logicalTime,
    messages: Object.freeze(messages),
    actions: Object.freeze(actions),
    publicMetadata,
  };
  const output = immutable<ScalableEvaluationTeamStepOutputV1>({
    ...body,
    outputDigest: scalableEvaluationDigestV1("team-step-output", body),
  });
  journal.output = output;
  for (const message of output.messages)
    journal.pendingMessageIds.add(message.messageId);
  for (let index = 0; index < output.actions.length; index += 1)
    journal.pendingActionIndexes.add(index);
  journal.phase =
    journal.pendingMessageIds.size === 0 &&
    journal.pendingActionIndexes.size === 0
      ? "settled"
      : "output_staged";
  return output;
}

function validateCapturedArtifact(
  value: unknown,
  update: MeshSparseDeliveryV2["update"],
): DistributedCollectiveMessageV1 {
  if (!value || typeof value !== "object")
    fail("reference_integrated_outbox_artifact_invalid");
  const artifact = value as DistributedCollectiveMessageV1;
  if (
    artifact.schemaVersion !== 1 ||
    artifact.artifactDigest !== update.payloadDigest ||
    !DIGEST.test(artifact.messageDigest)
  )
    fail("reference_integrated_outbox_artifact_invalid");
  return artifact;
}

function beginEgressCapture(
  binding: EgressBindingV1,
  operationId: PlanningDigestV1,
): void {
  if (
    binding.activeOperationId !== null &&
    binding.activeOperationId !== operationId
  )
    fail("reference_integrated_capture_concurrent_conflict");
  binding.activeOperationId = operationId;
}

function endEgressCapture(
  binding: EgressBindingV1,
  operationId: PlanningDigestV1,
): void {
  if (binding.activeOperationId !== operationId)
    fail("reference_integrated_capture_lease_invalid");
  binding.activeOperationId = null;
}

async function mutateNodeForJournalV1(input: {
  readonly peer: PeerBindingStateV1;
  readonly journal: StepJournalV1;
  readonly operation: () => Promise<ReferenceIntegratedNodeStateV1>;
}): Promise<ReferenceIntegratedNodeStateV1> {
  const before = input.journal.preStateDigest;
  try {
    return await input.operation();
  } catch (error) {
    const current = await input.peer.stack.node
      .loadOptional()
      .catch(() => null);
    if ((current?.stateDigest ?? null) !== before)
      input.journal.phase = "indeterminate";
    throw error;
  }
}

async function drainReferenceIntegratedInboundV1(input: {
  readonly peer: PeerBindingStateV1;
  readonly egress: EgressBindingV1;
  readonly journal: StepJournalV1;
  readonly state: ReferenceIntegratedNodeStateV1;
  readonly logicalTime: number;
}): Promise<ReferenceIntegratedNodeStateV1> {
  let state = input.state;
  const records = [...input.peer.inbound.values()].sort((left, right) => {
    const leftArtifact = left.envelope.artifact;
    const rightArtifact = right.envelope.artifact;
    return (
      leftArtifact.logicalTimeMs - rightArtifact.logicalTimeMs ||
      leftArtifact.sequence - rightArtifact.sequence ||
      left.messageId.localeCompare(right.messageId)
    );
  });
  for (const record of records) {
    const delivery = record.envelope.delivery;
    if (
      !input.peer.admittedInbound.has(record.messageId) &&
      input.peer.admittedInbound.size >= MAXIMUM_INBOUND_MESSAGES_PER_PEER
    )
      fail("reference_integrated_inbound_idempotency_window_exhausted");
    if (
      delivery.recipientPeerIndex !== input.peer.peerIndex ||
      delivery.update.createdAtLogicalTime > input.logicalTime ||
      delivery.update.expiresAtLogicalTime <= input.logicalTime
    )
      fail("reference_integrated_inbound_delivery_invalid");
    const planeResult = await invokeMeshSparsePeerPlaneReceiveV1(
      input.egress.plane,
      {
        delivery,
        logicalTime: input.logicalTime,
      },
    );
    if (!planeResult.accepted)
      fail(
        `reference_integrated_plane_receive_${planeResult.reasonCode ?? "rejected"}`,
      );
    const artifact = await readReferenceIntegratedCollectiveArtifactV1(
      input.peer.stack,
      delivery.update.payloadDigest,
    );
    if (
      !artifact ||
      artifact.messageDigest !== record.envelope.artifact.messageDigest
    )
      fail("reference_integrated_inbound_artifact_unavailable");
    const before = state.stateDigest;
    let receive: Awaited<
      ReturnType<ReferenceIntegratedCollectiveStackV1["node"]["receive"]>
    >;
    try {
      receive = await input.peer.stack.node.receive(
        delivery.update,
        input.logicalTime,
      );
    } catch (error) {
      const current = await input.peer.stack.node
        .loadOptional()
        .catch(() => null);
      if ((current?.stateDigest ?? null) !== before)
        input.journal.phase = "indeterminate";
      throw error;
    }
    if (receive.status === "rejected")
      fail(`reference_integrated_receive_${receive.reasonCode}`);
    if (receive.status === "deferred") continue;
    if (receive.status !== "accepted" && receive.status !== "duplicate")
      fail("reference_integrated_receive_status_invalid");
    input.peer.inbound.delete(record.messageId);
    input.peer.admittedInbound.set(
      record.messageId,
      record.transportEnvelopeDigest,
    );
    input.journal.processedInboundMessageIds.add(record.messageId);
    state = await input.peer.stack.node.load();
    input.journal.preStateDigest = state.stateDigest;
  }
  return state;
}

function validateReferenceIntegratedTransportEnvelopeV1(
  value: unknown,
  profile: MeshSparseOverlayProfileV2,
): ReferenceIntegratedTransportEnvelopeV1 {
  const record = exactRecord(
    value,
    [
      "schemaVersion",
      "kind",
      "captureSequence",
      "captureOperationId",
      "captureDigest",
      "delivery",
      "artifact",
    ],
    "reference_integrated_transport_envelope",
  );
  if (
    record.schemaVersion !== 1 ||
    record.kind !== "reference_integrated_sparse_delivery"
  )
    fail("reference_integrated_transport_envelope_invalid");
  safeInteger(record.captureSequence, "transport_capture_sequence", 1);
  digest(record.captureOperationId, "transport_capture_operation_id");
  digest(record.captureDigest, "transport_capture_digest");
  const delivery = validateMeshSparseDeliveryV2(profile, record.delivery);
  if (
    scalableEvaluationDigestV1("reference-integrated-delivery-capture", {
      sequence: record.captureSequence,
      operationId: record.captureOperationId,
      updateDigest: delivery.update.updateDigest,
      deliveryDigest: delivery.deliveryDigest,
    }) !== record.captureDigest
  )
    fail("reference_integrated_transport_capture_invalid");
  const artifact = validateCapturedArtifact(record.artifact, delivery.update);
  return immutable({
    schemaVersion: 1,
    kind: "reference_integrated_sparse_delivery",
    captureSequence: record.captureSequence,
    captureOperationId: record.captureOperationId,
    captureDigest: record.captureDigest,
    delivery,
    artifact,
  });
}

function findStagedMessageJournalV1(
  peer: PeerBindingStateV1,
  messageId: string,
): StepJournalV1 | null {
  const matches = [...peer.journals.values()].filter((journal) =>
    journal.output?.messages.some((message) => message.messageId === messageId),
  );
  if (matches.length > 1) fail("reference_integrated_message_journal_conflict");
  return matches[0] ?? null;
}

function findDeliveryCaptureDigestV1(
  peer: PeerBindingStateV1,
  messageId: string,
): PlanningDigestV1 | null {
  const matches = [...peer.journals.values()].flatMap((journal) => {
    const messageIndex = journal.output?.messages.findIndex(
      (message) => message.messageId === messageId,
    );
    return messageIndex === undefined || messageIndex < 0
      ? []
      : [journal.deliveryCaptureDigests[messageIndex]!];
  });
  if (matches.length > 1)
    fail("reference_integrated_delivery_capture_journal_conflict");
  return matches[0] ?? null;
}

function settleJournalMessageV1(
  peer: PeerBindingStateV1,
  messageId: string,
): void {
  const journals = [...peer.journals.values()].filter((journal) =>
    journal.output?.messages.some((message) => message.messageId === messageId),
  );
  if (journals.length !== 1)
    fail("reference_integrated_message_journal_unavailable");
  journals[0]!.pendingMessageIds.delete(messageId);
  settleJournalIfCompleteV1(journals[0]!);
}

function settleJournalIfCompleteV1(journal: StepJournalV1): void {
  if (
    journal.output &&
    journal.pendingMessageIds.size === 0 &&
    journal.pendingActionIndexes.size === 0
  )
    journal.phase = "settled";
}

function pruneSettledStepJournalsV1(peer: PeerBindingStateV1): void {
  while (peer.journals.size >= MAXIMUM_STEP_JOURNALS_PER_PEER) {
    const settled = [...peer.journals.values()]
      .filter((journal) => journal.phase === "settled")
      .sort(
        (left, right) =>
          left.logicalTime - right.logicalTime ||
          left.requestDigest.localeCompare(right.requestDigest),
      )[0];
    if (!settled) return;
    const egress = requireEgress(peer.egress);
    for (const message of settled.output?.messages ?? []) {
      egress.settledDeliveries.delete(message.messageId);
      egress.deliveryIds.delete(message.messageId);
    }
    for (const captureDigest of settled.effectCaptureDigests) {
      const executionId = egress.settledEffectExecutions.get(captureDigest);
      if (executionId) egress.effectReceipts.delete(executionId);
      egress.settledEffectExecutions.delete(captureDigest);
      egress.settledEffects.delete(captureDigest);
    }
    for (const messageId of settled.processedInboundMessageIds)
      peer.admittedInbound.delete(messageId);
    peer.journals.delete(settled.requestDigest);
    peer.retiredThroughLogicalTime = Math.max(
      peer.retiredThroughLogicalTime,
      settled.logicalTime,
    );
  }
}

function bindJournalSessionV1(
  journal: StepJournalV1,
  binding: {
    readonly sessionId: string;
    readonly episodeId: string;
    readonly logicalTime: number;
  },
): void {
  if (journal.logicalTime !== binding.logicalTime)
    fail("reference_integrated_journal_session_binding_invalid");
  if (journal.sessionBinding) {
    if (
      journal.sessionBinding.sessionId !== binding.sessionId ||
      journal.sessionBinding.episodeId !== binding.episodeId ||
      journal.sessionBinding.logicalTime !== binding.logicalTime
    )
      fail("reference_integrated_journal_session_binding_invalid");
    return;
  }
  journal.sessionBinding = Object.freeze({ ...binding });
}

function assignmentFor(
  binding: EgressBindingV1,
  workItemId: string,
): AssignmentV1 {
  identifier(workItemId, "work_item_id");
  const existing = binding.assignments.get(workItemId);
  if (existing) return existing;
  const assignment = immutable({
    assignedPeerId: binding.localPeerId,
    assignmentEpoch: binding.initialAssignmentEpoch,
    fencingToken: `${binding.fencingTokenPrefix}:${binding.initialAssignmentEpoch}:${workItemId}`,
  });
  binding.assignments.set(workItemId, assignment);
  return assignment;
}

async function validateAuthorityFence(
  binding: EgressBindingV1,
  fence: AssuranceExecutionAuthorityFenceV1,
  input: {
    readonly executionId: string;
    readonly effect: PreparedProtectedEffectV1;
    readonly logicalTimeMs: number;
  },
): Promise<void> {
  const assignment = assignmentFor(binding, fence.scope.workItemId);
  if (
    fence.executionId !== input.executionId ||
    fence.scope.tenantId !== binding.scope.tenantId ||
    fence.scope.meshId !== binding.scope.meshId ||
    fence.scope.missionIntentId !== binding.scope.missionIntentId ||
    fence.assignedPeerId !== assignment.assignedPeerId ||
    fence.assignmentEpoch !== assignment.assignmentEpoch ||
    fence.fencingToken !== assignment.fencingToken ||
    fence.membershipConfigurationDigest !==
      binding.membershipConfigurationDigest ||
    fence.membershipEpoch !== binding.membershipEpoch ||
    !DIGEST.test(fence.awardDigest) ||
    !DIGEST.test(fence.taskDigest) ||
    !DIGEST.test(input.effect.proposalDigest)
  )
    fail("reference_integrated_effect_authority_invalid");
  safeInteger(input.logicalTimeMs, "effect_logical_time", 0);
  const { authorityDigest, ...body } = fence;
  const rebuilt = await createAssuranceExecutionAuthorityFenceV1(
    body,
    binding.crypto,
  );
  if (authorityDigest !== rebuilt.authorityDigest)
    fail("reference_integrated_effect_authority_invalid");
}

function validateScope(
  input: ReferenceIntegratedScalableEvaluationScopeV1,
): ReferenceIntegratedScalableEvaluationScopeV1 {
  if (!input || typeof input !== "object")
    fail("reference_integrated_scope_invalid");
  const value = exactRecord(
    input,
    ["tenantId", "meshId", "missionIntentId", "objectiveId"],
    "reference_integrated_scope",
  );
  const tenantId = value.tenantId;
  const meshId = value.meshId;
  const missionIntentId = value.missionIntentId;
  const objectiveId = value.objectiveId;
  identifier(tenantId, "tenantId");
  identifier(meshId, "meshId");
  identifier(missionIntentId, "missionIntentId");
  identifier(objectiveId, "objectiveId");
  return immutable({
    tenantId,
    meshId,
    missionIntentId,
    objectiveId,
  });
}

function objectiveScopeDigest(
  missionIntent: MissionIntentV1,
): PlanningDigestV1 {
  return scalableEvaluationDigestV1(
    "reference-integrated-objective-scope",
    missionIntent.objective as unknown as PlanningJson,
  );
}

function sameEvaluationScope(
  left: ReferenceIntegratedScalableEvaluationScopeV1,
  right: ReferenceIntegratedScalableEvaluationScopeV1,
): boolean {
  return (
    left.tenantId === right.tenantId &&
    left.meshId === right.meshId &&
    left.missionIntentId === right.missionIntentId &&
    left.objectiveId === right.objectiveId
  );
}

function requireEgress(
  value: ReferenceIntegratedScalableEvaluationEgressRuntimeV1,
): EgressBindingV1 {
  const binding = egressBindings.get(value);
  if (!binding) fail("reference_integrated_egress_not_genuine");
  return binding;
}

function exactRecord(
  input: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail(`${label}_invalid`);
  const actual = Object.keys(input).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    fail(`${label}_invalid`);
  return input as Record<string, unknown>;
}

function assertOnlyKeys(
  input: unknown,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): asserts input is Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail(`${label}_invalid`);
  const keys = Object.keys(input);
  if (
    required.some((key) => !keys.includes(key)) ||
    keys.some((key) => !required.includes(key) && !optional.includes(key))
  )
    fail(`${label}_invalid`);
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+=-]{0,255}$/u.test(value)
  )
    fail(`${label}_invalid`);
}

function digest(
  value: unknown,
  label: string,
): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !DIGEST.test(value))
    fail(`${label}_invalid`);
}

function safeInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  )
    fail(`${label}_invalid`);
}

function immutable<T>(value: T): T {
  const clone = structuredClone(value);
  const visit = (item: unknown): void => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return;
    for (const child of Object.values(item as Record<string, unknown>))
      visit(child);
    Object.freeze(item);
  };
  visit(clone);
  return clone;
}

function fail(code: string): never {
  throw new TypeError(code);
}
