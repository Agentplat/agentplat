import { collectiveQuorumDigestV1 } from "@agentplat/collective-quorum/crypto";
import type { SparseFinalityCertificateV2 } from "@agentplat/collective-quorum/sparse-agreement";
import {
  validateStrategicAllocationPolicyV1,
  validateStrategicAllocationPlanV1,
  type StrategicAllocationPlanV1,
  type StrategicAllocationPolicyV1,
} from "@agentplat/collective-runtime/strategic-allocation";
import type { SemanticMetricVectorV1 } from "@agentplat/inference-control/semantic-alignment";
import {
  invokeSequentialSemanticGuaranteeAppendV1,
  isSequentialSemanticGuaranteeEngineV1,
  type SemanticMetricSampleV1,
  type SequentialSemanticGuaranteeEngineV1,
  type SequentialSemanticGuaranteeV1,
} from "@agentplat/inference-control/semantic-metrics";
import {
  validateAnytimeSemanticGuaranteeV1,
  validateSemanticHorizonDecisionV1,
  type AnytimeSemanticGuaranteeV1,
  type SemanticHorizonDecisionV1,
} from "@agentplat/inference-control/semantic-guarantees";
import {
  InMemorySemanticHorizonBudgetStoreV1,
  SemanticHorizonBudgetLedgerV1,
  type SemanticHorizonBudgetMonotonicAnchorStoreV1,
  type SemanticHorizonBudgetStoreV1,
} from "@agentplat/inference-control/semantic-horizon-budget";
import type {
  CognitiveAgentAdapterContextV2,
  CognitiveOperationReceiptV2,
  CognitiveOperationRequestV2,
  CognitiveOperationResultV2,
} from "@agentplat/runtime/cognitive-adapter";
import { createWebCryptoCognitiveIntegrityV2 } from "@agentplat/runtime/cognitive-adapter";
import {
  invokeOperationalCognitiveRunPreEffectV1,
  isOperationalCognitiveControllerV1,
  reconcileOperationalCognitivePreEffectV1,
  type OperationalCognitiveControllerV1,
} from "@agentplat/inference-control/operational-control";
import type { CollectiveTelemetryCorrelationV1 } from "@agentplat/audit/collective-telemetry";
import type { MissionTaskNodeV1 } from "@agentplat/collective-planning";

import {
  integratedSemanticGuaranteeAcceptedV2,
  verifyIntegratedSemanticAcceptancePolicyV2,
  type IntegratedSemanticAcceptancePolicyV2,
} from "./integrated-host.js";
import {
  createCollectiveHostTelemetryOutboxEntryV1,
  CollectiveHostTelemetryOutboxCapacityErrorV1,
  compareCollectiveHostTelemetryOutboxEntriesV1,
  drainCollectiveHostTelemetryOutboxV1,
  emitCollectiveHostTelemetryV1,
  isCollectiveHostDurableTelemetryPortV1,
  validateCollectiveHostTelemetryOutboxBatchV1,
  validateCollectiveHostTelemetryOutboxEntryV1,
  type CollectiveHostTelemetryDeliveryModeV1,
  type CollectiveHostTelemetryEventV1,
  type CollectiveHostTelemetryOutboxEntryV1,
  type CollectiveHostTelemetryOutboxStoreV1,
  type CollectiveHostTelemetryPortV1,
} from "./collective-telemetry.js";
import type { DistributedPlanningCycleV1 } from "./distributed-planning-runtime.js";
import {
  invokeAnytimeSemanticHorizonCouplingV1,
  isAnytimeSemanticHorizonCouplingV1,
} from "./semantic-horizon-coupling.js";

export interface AssuranceSemanticAssessmentPortV1 {
  assess(input: {
    readonly executionId: string;
    readonly graphDigest: string;
    readonly allocationPlanDigest: string;
    readonly awardDigest: string;
    readonly taskDigest: string;
    readonly request: CognitiveOperationRequestV2;
    readonly result: CognitiveOperationResultV2;
    readonly logicalTimeMs: number;
  }): Promise<{
    readonly assessorId: string;
    readonly assessorImplementationDigest: string;
    readonly metrics: SemanticMetricVectorV1;
    readonly evidenceDigests: readonly string[];
  }>;
}

export interface AssuranceSemanticHorizonPortV1 {
  evaluate(input: {
    readonly stateKey: string;
    readonly sequence: number;
    readonly logicalTimeMs: number;
    readonly metrics: SemanticMetricVectorV1;
    readonly assessmentDigest: string;
  }): Promise<{
    readonly guarantee: AnytimeSemanticGuaranteeV1;
    readonly guaranteeDigest: string;
    readonly decision: SemanticHorizonDecisionV1;
    readonly decisionDigest: string;
  }>;
}

export interface AssuranceCognitiveExecutionPortV1 {
  execute(
    request: CognitiveOperationRequestV2,
    context: CognitiveAgentAdapterContextV2,
  ): Promise<{
    readonly result: CognitiveOperationResultV2;
    readonly receipt: CognitiveOperationReceiptV2;
  }>;
}

export interface AssuranceCoupledFinalityPortV1 {
  verifyPlanning(input: {
    readonly certificate: SparseFinalityCertificateV2;
    readonly planningDecisionDigest: string;
    readonly graphDigest: string;
    readonly allocationPlanDigest: string;
    readonly awardDigest: string;
    readonly taskDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
  certifyExecution(input: {
    readonly executionId: string;
    readonly decisionDigest: string;
    readonly graphDigest: string;
    readonly allocationPlanDigest: string;
    readonly awardDigest: string;
    readonly taskDigest: string;
    readonly planningDecisionDigest: string;
    readonly planningFinalityCertificateDigest: string;
    readonly cognitivePayloadDigest: string;
    readonly cognitiveMetadataDigest: string;
    readonly cognitiveAuthorityDigest: string;
    readonly cognitiveRoleBindingDigest: string;
    readonly cognitiveContextBindingDigest: string;
    readonly cognitiveReceiptDigest: string;
    readonly outputDigest: string;
    readonly semanticGuaranteeDigest: string;
    readonly anytimeSemanticGuaranteeDigest: string | null;
    readonly semanticHorizonDecisionDigest: string | null;
    readonly assessmentDigest: string;
    readonly effectProposalDigest: string;
    readonly authorityFenceDigest: string | null;
    readonly logicalTimeMs: number;
  }): Promise<SparseFinalityCertificateV2 | null>;
  verifyExecution(input: {
    readonly certificate: SparseFinalityCertificateV2;
    readonly decisionDigest: string;
    readonly effectProposalDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
}

export interface AssuranceExecutionCurrentnessInputV1 {
  readonly executionId: string;
  readonly localPeerId: string;
  readonly localInstanceId: string;
  readonly graphDigest: string;
  readonly allocationPlanDigest: string;
  readonly awardDigest: string;
  readonly task: MissionTaskNodeV1;
  readonly planningDecisionDigest: string;
  readonly planningFinalityCertificateDigest: string;
  readonly cognitiveRequest: CognitiveOperationRequestV2;
  readonly logicalTimeMs: number;
}

export interface AssuranceExecutionCurrentnessPortV1 {
  verify(input: AssuranceExecutionCurrentnessInputV1): Promise<boolean>;
}

export interface PreparedProtectedEffectV1 {
  readonly schemaVersion: 1;
  readonly effectClass: string;
  readonly payload: unknown;
  readonly proposalDigest: string;
}

export interface ProtectedEffectReceiptV1 {
  readonly schemaVersion: 1;
  readonly executionId: string;
  readonly proposalDigest: string;
  readonly finalityCertificateDigest: string;
  readonly status: "committed" | "refused" | "failed";
  readonly externalReference: string | null;
  readonly reasonCode: string;
  readonly receiptDigest: string;
}

export interface AssuranceProtectedEffectPortV1 {
  /** Pure preparation boundary: this method must not create an external effect. */
  prepare(input: {
    readonly executionId: string;
    readonly taskDigest: string;
    readonly result: CognitiveOperationResultV2;
  }): Promise<
    Omit<PreparedProtectedEffectV1, "schemaVersion" | "proposalDigest">
  >;
  /** Read-only idempotency lookup used to reconcile a commit-start crash. */
  reconcile?(input: {
    readonly executionId: string;
    readonly effect: PreparedProtectedEffectV1;
    readonly certificate: SparseFinalityCertificateV2;
  }): Promise<ProtectedEffectReceiptV1 | null>;
  /** Implementations use executionId as an idempotency key. */
  commit(input: {
    readonly executionId: string;
    readonly effect: PreparedProtectedEffectV1;
    readonly certificate: SparseFinalityCertificateV2;
    readonly signal: AbortSignal;
  }): Promise<ProtectedEffectReceiptV1>;
}

export interface AssuranceExecutionAuthorityFenceV1 {
  readonly schemaVersion: 1;
  readonly scope: {
    readonly tenantId: string;
    readonly meshId: string;
    readonly missionIntentId: string;
    readonly objectiveId: string;
    readonly workItemId: string;
  };
  readonly executionId: string;
  readonly awardDigest: string;
  readonly taskDigest: string;
  readonly assignedPeerId: string;
  readonly assignmentEpoch: number;
  readonly fencingToken: string;
  readonly membershipConfigurationDigest: string;
  readonly membershipEpoch: number;
  readonly authorityDigest: string;
}

export async function createAssuranceExecutionAuthorityFenceV1(
  input: Omit<AssuranceExecutionAuthorityFenceV1, "authorityDigest">,
  crypto?: Crypto,
): Promise<AssuranceExecutionAuthorityFenceV1> {
  if (input.schemaVersion !== 1)
    throw new TypeError(
      "assurance execution authority fence schema is invalid",
    );
  identifier(input.scope.tenantId, "authorityFence.scope.tenantId");
  identifier(input.scope.meshId, "authorityFence.scope.meshId");
  identifier(
    input.scope.missionIntentId,
    "authorityFence.scope.missionIntentId",
  );
  identifier(input.scope.objectiveId, "authorityFence.scope.objectiveId");
  identifier(input.scope.workItemId, "authorityFence.scope.workItemId");
  identifier(input.executionId, "authorityFence.executionId");
  digest(input.awardDigest, "authorityFence.awardDigest");
  digest(input.taskDigest, "authorityFence.taskDigest");
  identifier(input.assignedPeerId, "authorityFence.assignedPeerId");
  integer(
    input.assignmentEpoch,
    "authorityFence.assignmentEpoch",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  identifier(input.fencingToken, "authorityFence.fencingToken");
  digest(
    input.membershipConfigurationDigest,
    "authorityFence.membershipConfigurationDigest",
  );
  integer(
    input.membershipEpoch,
    "authorityFence.membershipEpoch",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const body = freeze(input);
  return freeze({
    ...body,
    authorityDigest: await collectiveQuorumDigestV1(
      {
        domain: "assurance-execution-authority-fence-v1",
        body,
      },
      crypto,
    ),
  });
}

/**
 * One assignment repository owns both resolution and effect commit. `commit`
 * atomically compares the exact assignment epoch/token and membership
 * generation and deduplicates by executionId; a separate pre-commit boolean
 * check is not sufficient.
 */
export interface AssuranceExecutionAuthorityPortV1 {
  resolve(
    input: AssuranceExecutionCurrentnessInputV1,
  ): Promise<AssuranceExecutionAuthorityFenceV1 | null>;
  /** Looks up an already committed execution without requiring a current fence. */
  reconcile(input: {
    readonly executionId: string;
    readonly effect: PreparedProtectedEffectV1;
    readonly certificate: SparseFinalityCertificateV2;
    readonly authorityFence: AssuranceExecutionAuthorityFenceV1;
  }): Promise<ProtectedEffectReceiptV1 | null>;
  commit(input: {
    readonly executionId: string;
    readonly effect: PreparedProtectedEffectV1;
    readonly certificate: SparseFinalityCertificateV2;
    readonly authorityFence: AssuranceExecutionAuthorityFenceV1;
    readonly logicalTimeMs: number;
    readonly signal: AbortSignal;
  }): Promise<ProtectedEffectReceiptV1>;
}

export type AssuranceCoupledExecutionStatusV1 =
  | "planning_binding_unavailable"
  | "computation_refused"
  | "semantic_rejected"
  | "execution_authority_unavailable"
  | "execution_finality_unavailable"
  | "effect_failed"
  | "completed";

class AssuranceSemanticHorizonBudgetUnavailableErrorV1 extends Error {}

export interface AssuranceCoupledExecutionReceiptV1 {
  readonly schemaVersion: 1;
  readonly executionId: string;
  readonly executionInputDigest: string;
  readonly cognitiveContextBindingDigest: string;
  readonly status: AssuranceCoupledExecutionStatusV1;
  readonly graphDigest: string;
  readonly allocationPlanDigest: string;
  readonly awardDigest: string;
  readonly taskDigest: string;
  readonly planningDecisionDigest: string;
  readonly planningFinalityCertificateDigest: string;
  readonly telemetryCorrelation: CollectiveTelemetryCorrelationV1;
  readonly cognitiveResult: CognitiveOperationResultV2 | null;
  readonly cognitiveReceipt: CognitiveOperationReceiptV2 | null;
  readonly assessmentDigest: string | null;
  readonly semanticGuarantee: SequentialSemanticGuaranteeV1 | null;
  readonly anytimeSemanticGuaranteeDigest: string | null;
  readonly semanticHorizonDecision: SemanticHorizonDecisionV1 | null;
  readonly semanticHorizonDecisionDigest: string | null;
  readonly authorityFence: AssuranceExecutionAuthorityFenceV1 | null;
  readonly executionFinality: SparseFinalityCertificateV2 | null;
  readonly effect: PreparedProtectedEffectV1 | null;
  readonly effectReceipt: ProtectedEffectReceiptV1 | null;
  readonly logicalTimeMs: number;
  readonly receiptDigest: string;
}

/**
 * Durable protected-effect saga frontier. `gate_pending` is written before
 * the operational pre-effect gate can durably debit its semantic horizon.
 * `prepared` follows that authorization and precedes the protected effect.
 * `effect_committed` records the validated external receipt before terminal
 * completion.
 */
export interface AssuranceEffectCommitCheckpointV1 {
  readonly schemaVersion: 1;
  readonly phase: "gate_pending" | "prepared" | "effect_committed";
  readonly executionId: string;
  readonly executionInputDigest: string;
  readonly cognitiveContextBindingDigest: string;
  readonly pendingReceipt: AssuranceCoupledExecutionReceiptV1;
  readonly effectReceipt: ProtectedEffectReceiptV1 | null;
  readonly checkpointDigest: string;
}

type AssuranceReceiptValuesV1 = Partial<
  Omit<
    AssuranceCoupledExecutionReceiptV1,
    | "schemaVersion"
    | "executionId"
    | "executionInputDigest"
    | "cognitiveContextBindingDigest"
    | "status"
    | "graphDigest"
    | "allocationPlanDigest"
    | "awardDigest"
    | "taskDigest"
    | "planningDecisionDigest"
    | "planningFinalityCertificateDigest"
    | "telemetryCorrelation"
    | "logicalTimeMs"
    | "receiptDigest"
  >
>;

export interface AssuranceCoupledExecutionRecordV1 {
  readonly schemaVersion: 1;
  readonly executionId: string;
  readonly executionInputDigest: string;
  readonly reservationId: string;
  readonly reservedUntilLogicalMs: number;
  readonly effectCheckpoint: AssuranceEffectCommitCheckpointV1 | null;
  readonly receipt: AssuranceCoupledExecutionReceiptV1 | null;
}

export interface AssuranceCoupledExecutionInputV1 {
  readonly executionId: string;
  readonly graphDigest: string;
  readonly allocationPlan: StrategicAllocationPlanV1;
  readonly planningCycle: DistributedPlanningCycleV1;
  readonly planningEvidenceMessageDigests: readonly string[];
  readonly awardDigest: string;
  readonly task: MissionTaskNodeV1;
  readonly planningDecisionDigest: string;
  readonly planningFinality: SparseFinalityCertificateV2;
  readonly semanticSequence: number;
  readonly cognitiveRequest: CognitiveOperationRequestV2;
  /**
   * Opaque digest of non-secret tenant and actor authority fields. Signal,
   * credential names/values, and actor email are deliberately excluded.
   */
  readonly cognitiveContextBindingDigest: string;
  readonly cognitiveContext: CognitiveAgentAdapterContextV2;
  readonly telemetryCorrelation: CollectiveTelemetryCorrelationV1;
  readonly logicalTimeMs: number;
}

/**
 * Durable idempotency boundary for an assurance-coupled execution. The store
 * must serialize reserve, complete, and release operations per executionId.
 */
export interface AssuranceCoupledExecutionStoreV1 {
  load(executionId: string): Promise<AssuranceCoupledExecutionRecordV1 | null>;
  reserve(input: {
    readonly executionId: string;
    readonly executionInputDigest: string;
    readonly reservationId: string;
    readonly logicalTimeMs: number;
    readonly reservedUntilLogicalMs: number;
  }): Promise<boolean>;
  /** Advances the effect saga without allowing its certified plan to change. */
  checkpointEffect(input: {
    readonly executionId: string;
    readonly executionInputDigest: string;
    readonly reservationId: string;
    readonly checkpoint: AssuranceEffectCommitCheckpointV1;
  }): Promise<boolean>;
  complete(input: {
    readonly executionId: string;
    readonly executionInputDigest: string;
    readonly reservationId: string;
    readonly receipt: AssuranceCoupledExecutionReceiptV1;
  }): Promise<boolean>;
  /** Atomically commits the receipt and its ordered causal telemetry facts. */
  completeWithTelemetry?(input: {
    readonly executionId: string;
    readonly executionInputDigest: string;
    readonly reservationId: string;
    readonly receipt: AssuranceCoupledExecutionReceiptV1;
    readonly telemetry: readonly CollectiveHostTelemetryOutboxEntryV1[];
  }): Promise<boolean>;
  loadPendingTelemetry?(
    limit?: number,
  ): Promise<readonly CollectiveHostTelemetryOutboxEntryV1[]>;
  markTelemetryRecorded?(deliveryDigest: string): Promise<boolean>;
  acknowledgeTelemetry?(deliveryDigest: string): Promise<boolean>;
  release(input: {
    readonly executionId: string;
    readonly executionInputDigest: string;
    readonly reservationId: string;
  }): Promise<boolean>;
}

export class InMemoryAssuranceCoupledExecutionStoreV1 implements AssuranceCoupledExecutionStoreV1 {
  readonly #records = new Map<string, AssuranceCoupledExecutionRecordV1>();
  readonly #telemetry = new Map<string, CollectiveHostTelemetryOutboxEntryV1>();

  constructor(
    readonly maximumCompletedReceipts = 4_096,
    readonly maximumPendingTelemetry = 4_096,
  ) {
    integer(maximumCompletedReceipts, "maximumCompletedReceipts", 1, 100_000);
    integer(maximumPendingTelemetry, "maximumPendingTelemetry", 1, 100_000);
  }

  async load(
    executionId: string,
  ): Promise<AssuranceCoupledExecutionRecordV1 | null> {
    const record = this.#records.get(executionId);
    return record ? freeze(record) : null;
  }

  async reserve(input: {
    readonly executionId: string;
    readonly executionInputDigest: string;
    readonly reservationId: string;
    readonly logicalTimeMs: number;
    readonly reservedUntilLogicalMs: number;
  }): Promise<boolean> {
    const current = this.#records.get(input.executionId);
    if (!current) {
      this.#records.set(
        input.executionId,
        freeze({
          schemaVersion: 1,
          executionId: input.executionId,
          executionInputDigest: input.executionInputDigest,
          reservationId: input.reservationId,
          reservedUntilLogicalMs: input.reservedUntilLogicalMs,
          effectCheckpoint: null,
          receipt: null,
        }),
      );
      return true;
    }
    if (
      current.executionInputDigest !== input.executionInputDigest ||
      current.receipt ||
      current.reservedUntilLogicalMs >= input.logicalTimeMs
    )
      return false;
    this.#records.set(
      input.executionId,
      freeze({
        ...current,
        reservationId: input.reservationId,
        reservedUntilLogicalMs: input.reservedUntilLogicalMs,
      }),
    );
    return true;
  }

  async checkpointEffect(input: {
    readonly executionId: string;
    readonly executionInputDigest: string;
    readonly reservationId: string;
    readonly checkpoint: AssuranceEffectCommitCheckpointV1;
  }): Promise<boolean> {
    const current = this.#records.get(input.executionId);
    if (
      !current ||
      current.receipt ||
      current.executionInputDigest !== input.executionInputDigest ||
      current.reservationId !== input.reservationId
    )
      return false;
    const prior = current.effectCheckpoint;
    if (prior?.checkpointDigest === input.checkpoint.checkpointDigest)
      return true;
    if (!effectCheckpointTransitionAllowedV1(prior, input.checkpoint))
      return false;
    this.#records.set(
      input.executionId,
      freeze({ ...current, effectCheckpoint: input.checkpoint }),
    );
    return true;
  }

  async complete(input: {
    readonly executionId: string;
    readonly executionInputDigest: string;
    readonly reservationId: string;
    readonly receipt: AssuranceCoupledExecutionReceiptV1;
  }): Promise<boolean> {
    const current = this.#records.get(input.executionId);
    if (!current || current.executionInputDigest !== input.executionInputDigest)
      return false;
    if (current.receipt)
      return current.receipt.receiptDigest === input.receipt.receiptDigest;
    if (current.reservationId !== input.reservationId) return false;
    this.#records.set(
      input.executionId,
      freeze({ ...current, receipt: input.receipt }),
    );
    this.#pruneCompleted();
    return true;
  }

  async completeWithTelemetry(input: {
    readonly executionId: string;
    readonly executionInputDigest: string;
    readonly reservationId: string;
    readonly receipt: AssuranceCoupledExecutionReceiptV1;
    readonly telemetry: readonly CollectiveHostTelemetryOutboxEntryV1[];
  }): Promise<boolean> {
    const validated = await validateCollectiveHostTelemetryOutboxBatchV1(
      input.telemetry,
    );
    const expectedLength = input.receipt.semanticHorizonDecisionDigest ? 2 : 1;
    if (
      validated.length !== expectedLength ||
      validated.some(
        (entry) =>
          entry.sourceKind !== "assurance_execution" ||
          entry.sourceId !== input.executionId ||
          entry.sourceSequence !== 1,
      ) ||
      validated[0]!.event.operationDigest !== input.receipt.receiptDigest ||
      (expectedLength === 2 &&
        validated[1]!.event.operationDigest !==
          input.receipt.semanticHorizonDecisionDigest)
    )
      throw new TypeError("assurance telemetry/receipt binding is invalid");
    const current = this.#records.get(input.executionId);
    if (!current || current.executionInputDigest !== input.executionInputDigest)
      return false;
    if (current.receipt) {
      if (current.receipt.receiptDigest !== input.receipt.receiptDigest)
        return false;
      return validated.every((entry) =>
        this.#telemetry.has(entry.deliveryDigest),
      );
    }
    if (current.reservationId !== input.reservationId) return false;
    const fresh = validated.filter(
      (entry) => !this.#telemetry.has(entry.deliveryDigest),
    );
    if (this.#telemetry.size + fresh.length > this.maximumPendingTelemetry)
      throw new CollectiveHostTelemetryOutboxCapacityErrorV1(
        this.maximumPendingTelemetry,
      );
    this.#records.set(
      input.executionId,
      freeze({ ...current, receipt: input.receipt }),
    );
    for (const entry of fresh)
      this.#telemetry.set(entry.deliveryDigest, freeze(entry));
    this.#pruneCompleted();
    return true;
  }

  async loadPendingTelemetry(
    limit = 128,
  ): Promise<readonly CollectiveHostTelemetryOutboxEntryV1[]> {
    const pending = [...this.#telemetry.values()]
      .sort(compareCollectiveHostTelemetryOutboxEntriesV1)
      .slice(0, limit);
    return Promise.all(
      pending.map((entry) =>
        validateCollectiveHostTelemetryOutboxEntryV1(entry),
      ),
    );
  }

  async acknowledgeTelemetry(deliveryDigest: string): Promise<boolean> {
    const current = this.#telemetry.get(deliveryDigest);
    if (!current || current.deliveryState !== "recorded") return false;
    await validateCollectiveHostTelemetryOutboxEntryV1(current);
    const acknowledged = this.#telemetry.delete(deliveryDigest);
    if (acknowledged) this.#pruneCompleted();
    return acknowledged;
  }

  async markTelemetryRecorded(deliveryDigest: string): Promise<boolean> {
    const current = this.#telemetry.get(deliveryDigest);
    if (!current) return false;
    await validateCollectiveHostTelemetryOutboxEntryV1(current);
    if (current.deliveryState === "recorded") return true;
    const recorded = freeze({
      ...current,
      deliveryState: "recorded" as const,
    });
    await validateCollectiveHostTelemetryOutboxEntryV1(recorded);
    this.#telemetry.set(deliveryDigest, recorded);
    return true;
  }

  async release(input: {
    readonly executionId: string;
    readonly executionInputDigest: string;
    readonly reservationId: string;
  }): Promise<boolean> {
    const current = this.#records.get(input.executionId);
    if (
      !current ||
      current.receipt ||
      current.effectCheckpoint ||
      current.executionInputDigest !== input.executionInputDigest ||
      current.reservationId !== input.reservationId
    )
      return false;
    return this.#records.delete(input.executionId);
  }

  #pruneCompleted(): void {
    let completed = [...this.#records.values()].filter(
      (record) => record.receipt !== null,
    ).length;
    if (completed <= this.maximumCompletedReceipts) return;
    for (const [executionId, record] of this.#records) {
      if (!record.receipt) continue;
      if (
        [...this.#telemetry.values()].some(
          (entry) =>
            entry.sourceKind === "assurance_execution" &&
            entry.sourceId === executionId,
        )
      )
        continue;
      this.#records.delete(executionId);
      completed -= 1;
      if (completed <= this.maximumCompletedReceipts) break;
    }
  }
}

interface AssuranceCoupledExecutionInvokersV1 {
  readonly execute: (
    input: AssuranceCoupledExecutionInputV1,
  ) => Promise<AssuranceCoupledExecutionReceiptV1>;
  readonly lookupReceipt: (
    input: AssuranceCoupledExecutionInputV1,
  ) => Promise<AssuranceCoupledExecutionReceiptV1 | null>;
}

const assuranceCoupledExecutionInvokersV1 = new WeakMap<
  object,
  AssuranceCoupledExecutionInvokersV1
>();

/**
 * Computes without side effects, measures the actual result, certifies the
 * result-plus-effect binding, and only then crosses the protected effect port.
 */
export class AssuranceCoupledExecutionRuntimeV1 {
  readonly #store: AssuranceCoupledExecutionStoreV1;
  readonly #assessSemantic: AssuranceSemanticAssessmentPortV1["assess"];
  readonly #prepareEffect: AssuranceProtectedEffectPortV1["prepare"];
  readonly #executeCognitive: AssuranceCognitiveExecutionPortV1["execute"];
  readonly #verifyCurrentness: AssuranceExecutionCurrentnessPortV1["verify"];
  readonly #resolveAuthority: AssuranceExecutionAuthorityPortV1["resolve"];
  readonly #commitAuthority: AssuranceExecutionAuthorityPortV1["commit"];
  readonly #reconcileAuthority: AssuranceExecutionAuthorityPortV1["reconcile"];
  readonly #verifyPlanning: AssuranceCoupledFinalityPortV1["verifyPlanning"];
  readonly #certifyExecution: AssuranceCoupledFinalityPortV1["certifyExecution"];
  readonly #verifyExecution: AssuranceCoupledFinalityPortV1["verifyExecution"];
  readonly #allocationPolicy: StrategicAllocationPolicyV1;
  readonly #semanticAcceptance: IntegratedSemanticAcceptancePolicyV2;
  #semanticPolicyVerification: Promise<IntegratedSemanticAcceptancePolicyV2> | null =
    null;
  readonly #appendSemanticGuarantee: (
    sample: SemanticMetricSampleV1,
  ) => SequentialSemanticGuaranteeV1;
  readonly #semanticHorizon: AssuranceSemanticHorizonPortV1 | null;
  readonly #semanticStateKey: string | null;
  readonly #requireSemanticHorizon: boolean;
  readonly #evaluateSemanticHorizon:
    AssuranceSemanticHorizonPortV1["evaluate"] | null;
  readonly #operationalControl: OperationalCognitiveControllerV1 | null;
  readonly #horizonBudget: SemanticHorizonBudgetLedgerV1 | null;
  readonly #reservationNow: () => number;
  #telemetryDrain: Promise<unknown> = Promise.resolve();

  constructor(
    readonly options: {
      readonly localPeerId: string;
      readonly localInstanceId: string;
      readonly allocationPolicy: StrategicAllocationPolicyV1;
      readonly semanticGuarantees: SequentialSemanticGuaranteeEngineV1;
      readonly semanticAcceptance: IntegratedSemanticAcceptancePolicyV2;
      readonly semanticAssessment: AssuranceSemanticAssessmentPortV1;
      readonly semanticHorizon?: AssuranceSemanticHorizonPortV1;
      readonly semanticStateKey?: string;
      /** Explicit repositories preserve consumed effect budget across restarts. */
      readonly semanticHorizonBudgetStore?: SemanticHorizonBudgetStoreV1;
      readonly semanticHorizonBudgetMonotonicAnchor?: SemanticHorizonBudgetMonotonicAnchorStoreV1;
      readonly semanticHorizonBudgetStateKey?: string;
      readonly semanticHorizonBudgetMaximumCasAttempts?: number;
      /** Closed compositions set this to reject absent or null horizon results. */
      readonly requireSemanticHorizon?: boolean;
      readonly cognitive: AssuranceCognitiveExecutionPortV1;
      readonly currentness: AssuranceExecutionCurrentnessPortV1;
      /** Atomic assignment-fence owner for every protected effect. */
      readonly authority: AssuranceExecutionAuthorityPortV1;
      /** Required by the reference stack; retained as optional for low-level compatibility. */
      readonly operationalControl?: OperationalCognitiveControllerV1;
      readonly finality: AssuranceCoupledFinalityPortV1;
      readonly effects: Pick<AssuranceProtectedEffectPortV1, "prepare">;
      readonly store?: AssuranceCoupledExecutionStoreV1;
      readonly reservationLeaseMs?: number;
      /** Acquisition clock is intentionally outside the immutable execution digest. */
      readonly reservationClock?: () => number;
      readonly reservationIdFactory?: () => string;
      readonly maximumCompletedReceipts?: number;
      readonly maximumPendingTelemetry?: number;
      readonly maximumAssessmentEvidenceDigests?: number;
      /** Optional observability sink; it never grants execution authority. */
      readonly telemetry?: CollectiveHostTelemetryPortV1;
      readonly telemetryDeliveryMode?: CollectiveHostTelemetryDeliveryModeV1;
      readonly crypto?: Crypto;
    },
  ) {
    identifier(options.localPeerId, "localPeerId");
    identifier(options.localInstanceId, "localInstanceId");
    if (
      !options.semanticAssessment ||
      !options.cognitive ||
      !options.currentness ||
      !options.finality ||
      !options.effects
    )
      throw new TypeError("assurance-coupled execution ports are required");
    if (!isSequentialSemanticGuaranteeEngineV1(options.semanticGuarantees))
      throw new TypeError(
        "assurance requires a concrete sequential semantic guarantee engine",
      );
    if (typeof options.currentness.verify !== "function")
      throw new TypeError("assurance execution currentness port is invalid");
    if (typeof options.cognitive.execute !== "function")
      throw new TypeError("assurance cognitive execution port is invalid");
    if (
      typeof options.finality.verifyPlanning !== "function" ||
      typeof options.finality.certifyExecution !== "function" ||
      typeof options.finality.verifyExecution !== "function"
    )
      throw new TypeError("assurance finality port is invalid");
    if (
      !options.authority ||
      typeof options.authority.resolve !== "function" ||
      typeof options.authority.reconcile !== "function" ||
      typeof options.authority.commit !== "function"
    )
      throw new TypeError(
        "assurance protected effects require atomic execution authority",
      );
    if (
      (options.semanticHorizon === undefined) !==
      (options.semanticStateKey === undefined)
    )
      throw new TypeError(
        "assurance semantic horizon port and state key must be configured together",
      );
    if (
      options.semanticHorizonBudgetStateKey !== undefined &&
      options.semanticHorizonBudgetStore === undefined
    )
      throw new TypeError(
        "assurance semantic horizon budget store is required",
      );
    if (
      options.semanticHorizonBudgetStore !== undefined &&
      options.semanticHorizonBudgetMonotonicAnchor === undefined
    )
      throw new TypeError(
        "assurance semantic horizon budget monotonic anchor is required",
      );
    if (
      options.semanticHorizon === undefined &&
      (options.semanticHorizonBudgetStore !== undefined ||
        options.semanticHorizonBudgetStateKey !== undefined)
    )
      throw new TypeError(
        "assurance semantic horizon budget requires horizon control",
      );
    if (
      options.requireSemanticHorizon === true &&
      (options.semanticHorizon === undefined ||
        options.semanticStateKey === undefined)
    )
      throw new TypeError("assurance semantic horizon control is required");
    if (
      options.requireSemanticHorizon === true &&
      !isAnytimeSemanticHorizonCouplingV1(options.semanticHorizon)
    )
      throw new TypeError(
        "assurance requires a concrete anytime semantic horizon coupling",
      );
    if (
      options.requireSemanticHorizon !== undefined &&
      typeof options.requireSemanticHorizon !== "boolean"
    )
      throw new TypeError("requireSemanticHorizon is invalid");
    if (options.semanticStateKey !== undefined)
      identifier(options.semanticStateKey, "semanticStateKey");
    if (
      options.operationalControl !== undefined &&
      !isOperationalCognitiveControllerV1(options.operationalControl)
    )
      throw new TypeError(
        "assurance requires a concrete operational cognitive controller",
      );
    integer(
      options.maximumCompletedReceipts ?? 4_096,
      "maximumCompletedReceipts",
      1,
      100_000,
    );
    integer(
      options.maximumPendingTelemetry ?? 4_096,
      "maximumPendingTelemetry",
      1,
      100_000,
    );
    integer(
      options.reservationLeaseMs ?? 300_000,
      "reservationLeaseMs",
      1,
      Number.MAX_SAFE_INTEGER,
    );
    if (
      options.reservationClock !== undefined &&
      typeof options.reservationClock !== "function"
    )
      throw new TypeError("reservationClock is invalid");
    integer(
      options.maximumAssessmentEvidenceDigests ?? 4_096,
      "maximumAssessmentEvidenceDigests",
      0,
      100_000,
    );
    this.#allocationPolicy = validateStrategicAllocationPolicyV1(
      options.allocationPolicy,
    );
    this.#semanticAcceptance = freeze(options.semanticAcceptance);
    this.#store = captureAssuranceExecutionStoreV1(
      options.store ??
        new InMemoryAssuranceCoupledExecutionStoreV1(
          options.maximumCompletedReceipts ?? 4_096,
          options.maximumPendingTelemetry ?? 4_096,
        ),
    );
    const assessSemantic = options.semanticAssessment.assess;
    if (typeof assessSemantic !== "function")
      throw new TypeError("assurance semantic assessment port is invalid");
    this.#assessSemantic = assessSemantic.bind(options.semanticAssessment);
    const prepareEffect = options.effects.prepare;
    if (typeof prepareEffect !== "function")
      throw new TypeError("assurance protected effect port is invalid");
    this.#prepareEffect = prepareEffect.bind(options.effects);
    this.#executeCognitive = options.cognitive.execute.bind(options.cognitive);
    this.#verifyCurrentness = options.currentness.verify.bind(
      options.currentness,
    );
    this.#resolveAuthority = options.authority.resolve.bind(options.authority);
    this.#reconcileAuthority = options.authority.reconcile.bind(
      options.authority,
    );
    this.#commitAuthority = options.authority.commit.bind(options.authority);
    this.#verifyPlanning = options.finality.verifyPlanning.bind(
      options.finality,
    );
    this.#certifyExecution = options.finality.certifyExecution.bind(
      options.finality,
    );
    this.#verifyExecution = options.finality.verifyExecution.bind(
      options.finality,
    );
    const semanticGuarantees = options.semanticGuarantees;
    this.#appendSemanticGuarantee = (sample) =>
      invokeSequentialSemanticGuaranteeAppendV1(semanticGuarantees, sample);
    const semanticHorizon = options.semanticHorizon ?? null;
    this.#semanticHorizon = semanticHorizon;
    this.#semanticStateKey = options.semanticStateKey ?? null;
    const horizonBudgetStore = semanticHorizon
      ? (options.semanticHorizonBudgetStore ??
        new InMemorySemanticHorizonBudgetStoreV1())
      : null;
    const horizonBudgetStateKey = semanticHorizon
      ? (options.semanticHorizonBudgetStateKey ??
        `${options.semanticStateKey!}:protected-effects`)
      : null;
    this.#horizonBudget =
      horizonBudgetStore && horizonBudgetStateKey
        ? new SemanticHorizonBudgetLedgerV1({
            stateKey: horizonBudgetStateKey,
            store: horizonBudgetStore,
            monotonicAnchor: options.semanticHorizonBudgetMonotonicAnchor,
            maximumCasAttempts: options.semanticHorizonBudgetMaximumCasAttempts,
          })
        : null;
    this.#requireSemanticHorizon = options.requireSemanticHorizon === true;
    this.#evaluateSemanticHorizon = semanticHorizon
      ? isAnytimeSemanticHorizonCouplingV1(semanticHorizon)
        ? (input) =>
            invokeAnytimeSemanticHorizonCouplingV1(semanticHorizon, input)
        : semanticHorizon.evaluate.bind(semanticHorizon)
      : null;
    this.#operationalControl = options.operationalControl ?? null;
    const reservationClock = options.reservationClock ?? Date.now;
    this.#reservationNow = reservationClock.bind(
      options.reservationClock ? options : Date,
    );
    Object.defineProperty(this, "options", {
      value: Object.freeze({
        ...options,
        allocationPolicy: this.#allocationPolicy,
        semanticAcceptance: this.#semanticAcceptance,
        semanticAssessment: Object.freeze({ assess: this.#assessSemantic }),
        effects: Object.freeze({ prepare: this.#prepareEffect }),
        cognitive: Object.freeze({ execute: this.#executeCognitive }),
        currentness: Object.freeze({ verify: this.#verifyCurrentness }),
        finality: Object.freeze({
          verifyPlanning: this.#verifyPlanning,
          certifyExecution: this.#certifyExecution,
          verifyExecution: this.#verifyExecution,
        }),
        authority: Object.freeze({
          resolve: this.#resolveAuthority,
          reconcile: this.#reconcileAuthority,
          commit: this.#commitAuthority,
        }),
        store: this.#store,
        ...(horizonBudgetStore
          ? {
              semanticHorizonBudgetStore: horizonBudgetStore,
              ...(options.semanticHorizonBudgetMonotonicAnchor
                ? {
                    semanticHorizonBudgetMonotonicAnchor:
                      options.semanticHorizonBudgetMonotonicAnchor,
                  }
                : {}),
              semanticHorizonBudgetStateKey: horizonBudgetStateKey!,
            }
          : {}),
      }),
      writable: false,
      configurable: false,
      enumerable: true,
    });
    if (options.telemetryDeliveryMode === "durable_outbox") {
      if (
        !isCollectiveHostDurableTelemetryPortV1(options.telemetry) ||
        typeof this.#store.completeWithTelemetry !== "function" ||
        typeof this.#store.loadPendingTelemetry !== "function" ||
        typeof this.#store.markTelemetryRecorded !== "function" ||
        typeof this.#store.acknowledgeTelemetry !== "function"
      )
        throw new TypeError(
          "durable assurance telemetry outbox capabilities are required",
        );
    }
    const invokers: AssuranceCoupledExecutionInvokersV1 = Object.freeze({
      execute: (input: AssuranceCoupledExecutionInputV1) =>
        this.#execute(input),
      lookupReceipt: (input: AssuranceCoupledExecutionInputV1) =>
        this.#lookupReceipt(input),
    });
    assuranceCoupledExecutionInvokersV1.set(this, invokers);
    Object.defineProperties(this, {
      execute: immutableMethod(invokers.execute),
      lookupReceipt: immutableMethod(invokers.lookupReceipt),
    });
  }

  async execute(
    input: AssuranceCoupledExecutionInputV1,
  ): Promise<AssuranceCoupledExecutionReceiptV1> {
    return invokeAssuranceCoupledExecutionV1(this, input);
  }

  async lookupReceipt(
    input: AssuranceCoupledExecutionInputV1,
  ): Promise<AssuranceCoupledExecutionReceiptV1 | null> {
    return invokeAssuranceCoupledExecutionReceiptLookupV1(this, input);
  }

  async #lookupReceipt(
    input: AssuranceCoupledExecutionInputV1,
  ): Promise<AssuranceCoupledExecutionReceiptV1 | null> {
    identifier(input?.executionId, "executionId");
    digest(
      input.cognitiveContextBindingDigest,
      "cognitiveContextBindingDigest",
    );
    if (
      input.cognitiveContextBindingDigest !==
      (await assuranceCognitiveContextBindingDigestV1(
        input,
        this.options.crypto,
      ))
    )
      throw new TypeError(
        "assurance cognitive context binding digest is invalid",
      );
    const executionInputDigest = await assuranceCoupledExecutionInputDigestV1(
      input,
      this.options.crypto,
    );
    const record = await this.#store.load(input.executionId);
    if (!record) return null;
    if (record.executionInputDigest !== executionInputDigest)
      throw new Error(
        "assurance execution identity was reused with different content",
      );
    if (!record.receipt) return null;
    return validatePersistedAssuranceReceiptV1({
      receipt: record.receipt,
      input,
      executionInputDigest,
      expectedLocalPeerId: this.options.localPeerId,
      verifyExecution: this.#verifyExecution,
      crypto: this.options.crypto,
    });
  }

  async #execute(
    input: AssuranceCoupledExecutionInputV1,
  ): Promise<AssuranceCoupledExecutionReceiptV1> {
    await this.#verifySemanticPolicy();
    identifier(input.executionId, "executionId");
    for (const [label, value] of Object.entries({
      graphDigest: input.graphDigest,
      awardDigest: input.awardDigest,
      taskDigest: input.task.taskDigest,
      planningDecisionDigest: input.planningDecisionDigest,
    }))
      digest(value, label);
    if (input.task.schemaVersion !== 1)
      throw new TypeError("assurance execution task schema is invalid");
    integer(
      input.semanticSequence,
      "semanticSequence",
      1,
      Number.MAX_SAFE_INTEGER,
    );
    integer(input.logicalTimeMs, "logicalTimeMs", 0, Number.MAX_SAFE_INTEGER);
    digest(
      input.cognitiveContextBindingDigest,
      "cognitiveContextBindingDigest",
    );
    if (
      input.cognitiveContextBindingDigest !==
      (await assuranceCognitiveContextBindingDigestV1(
        input,
        this.options.crypto,
      ))
    )
      throw new TypeError(
        "assurance cognitive context binding digest is invalid",
      );
    if (input.cognitiveRequest.logicalTimeMs !== input.logicalTimeMs)
      throw new TypeError(
        "cognitive request logical time is not bound to execution",
      );
    if (
      ["tool", "memory_mutation", "intervention"].includes(
        input.cognitiveRequest.operation,
      )
    )
      throw new TypeError(
        "effectful cognitive operations cannot cross the assurance compute boundary",
      );
    const plan = validateStrategicAllocationPlanV1(
      input.allocationPlan,
      this.#allocationPolicy,
    );
    digest(
      input.planningFinality.certificateDigest,
      "planningFinality.certificateDigest",
    );
    const planningEvidenceMessageDigests = canonicalDigestList(
      input.planningEvidenceMessageDigests,
      "planningEvidenceMessageDigests",
    );
    if (
      JSON.stringify(planningEvidenceMessageDigests) !==
      JSON.stringify(input.planningEvidenceMessageDigests)
    )
      throw new TypeError(
        "planning evidence message digests are not canonical",
      );
    const expectedPlanningDecisionDigest = await collectiveQuorumDigestV1(
      {
        domain: "autonomous-collective-planning-decision-v1",
        body: {
          cycle: input.planningCycle,
          graphDigest: input.graphDigest,
          allocationPlanDigest: plan.planDigest,
          admittedMessageDigests: planningEvidenceMessageDigests,
          logicalTimeMs: input.planningFinality.finalizedAtLogicalMs,
        },
      },
      this.options.crypto,
    );
    if (input.planningDecisionDigest !== expectedPlanningDecisionDigest)
      throw new TypeError(
        "planning decision is not derived from its certified planning inputs",
      );
    if (input.planningFinality.proposalDigest !== input.planningDecisionDigest)
      throw new TypeError(
        "planning finality is not bound to the expected planning decision",
      );
    await validateMaterializedCognitiveRequestV1({
      executionId: input.executionId,
      graphDigest: input.graphDigest,
      allocationPlanDigest: plan.planDigest,
      awardDigest: input.awardDigest,
      task: input.task,
      planningEvidenceMessageDigests,
      planningFinalityCertificateDigest:
        input.planningFinality.certificateDigest,
      planningFinalityCertificateId: input.planningFinality.certificateId,
      planningCycle: input.planningCycle,
      semanticSequence: input.semanticSequence,
      request: input.cognitiveRequest,
      telemetryCorrelation: input.telemetryCorrelation,
      crypto: this.options.crypto,
    });
    const executionInputDigest = await assuranceCoupledExecutionInputDigestV1(
      input,
      this.options.crypto,
    );
    const persisted = await this.#store.load(input.executionId);
    if (persisted?.receipt) {
      if (persisted.executionInputDigest !== executionInputDigest)
        throw new Error(
          "assurance execution identity was reused with different content",
        );
      const receipt = await validatePersistedAssuranceReceiptV1({
        receipt: persisted.receipt,
        input,
        executionInputDigest,
        expectedLocalPeerId: this.options.localPeerId,
        verifyExecution: this.#verifyExecution,
        crypto: this.options.crypto,
      });
      await this.#drainTelemetry();
      return receipt;
    }
    await this.#drainTelemetry();
    if (persisted && persisted.executionInputDigest !== executionInputDigest)
      throw new Error(
        "assurance execution identity is active with different content",
      );
    const reservationId =
      this.options.reservationIdFactory?.() ??
      `reservation:${globalThis.crypto.randomUUID()}`;
    identifier(reservationId, "reservationId");
    const acquisitionNowMs = this.#reservationNow();
    integer(
      acquisitionNowMs,
      "reservationAcquisitionTimeMs",
      0,
      Number.MAX_SAFE_INTEGER,
    );
    const reserved = await this.#store.reserve({
      executionId: input.executionId,
      executionInputDigest,
      reservationId,
      logicalTimeMs: acquisitionNowMs,
      reservedUntilLogicalMs: safeAdd(
        acquisitionNowMs,
        this.options.reservationLeaseMs ?? 300_000,
      ),
    });
    if (!reserved) {
      const concurrent = await this.#store.load(input.executionId);
      if (
        concurrent?.receipt &&
        concurrent.executionInputDigest === executionInputDigest
      ) {
        const receipt = await validatePersistedAssuranceReceiptV1({
          receipt: concurrent.receipt,
          input,
          executionInputDigest,
          expectedLocalPeerId: this.options.localPeerId,
          verifyExecution: this.#verifyExecution,
          crypto: this.options.crypto,
        });
        await this.#drainTelemetry();
        return receipt;
      }
      if (
        concurrent &&
        concurrent.executionInputDigest !== executionInputDigest
      )
        throw new Error(
          "assurance execution identity is active with different content",
        );
      throw new Error("assurance execution is already active");
    }
    const acquired = await this.#store.load(input.executionId);
    if (
      !acquired ||
      acquired.executionInputDigest !== executionInputDigest ||
      acquired.reservationId !== reservationId
    )
      throw new Error("assurance execution reservation was not observable");
    if (acquired.effectCheckpoint)
      return this.#resumeEffectCheckpoint(
        input,
        plan.planDigest,
        executionInputDigest,
        reservationId,
        acquired.effectCheckpoint,
      );
    try {
      const award = plan.awards.find(
        (item) => item.awardDigest === input.awardDigest,
      );
      const planningValid =
        Boolean(award) &&
        award!.taskDigest === input.task.taskDigest &&
        award!.peerId === this.options.localPeerId &&
        award!.peerInstanceId === this.options.localInstanceId &&
        (await this.#verifyPlanning({
          certificate: input.planningFinality,
          planningDecisionDigest: input.planningDecisionDigest,
          graphDigest: input.graphDigest,
          allocationPlanDigest: plan.planDigest,
          awardDigest: input.awardDigest,
          taskDigest: input.task.taskDigest,
          logicalTimeMs: input.logicalTimeMs,
        }));
      if (!planningValid)
        return this.#finish(
          input,
          plan.planDigest,
          executionInputDigest,
          reservationId,
          "planning_binding_unavailable",
          {},
        );

      const cognitive = await this.#executeCognitive(
        input.cognitiveRequest,
        input.cognitiveContext,
      );
      await validateCognitiveExecutionReceiptV1(
        input.cognitiveRequest,
        cognitive.result,
        cognitive.receipt,
        this.options.crypto,
      );
      if (cognitive.result.status !== "completed")
        return this.#finish(
          input,
          plan.planDigest,
          executionInputDigest,
          reservationId,
          "computation_refused",
          {
            cognitiveResult: cognitive.result,
            cognitiveReceipt: cognitive.receipt,
          },
        );
      const assessment = await this.#assessSemantic({
        executionId: input.executionId,
        graphDigest: input.graphDigest,
        allocationPlanDigest: plan.planDigest,
        awardDigest: input.awardDigest,
        taskDigest: input.task.taskDigest,
        request: input.cognitiveRequest,
        result: cognitive.result,
        logicalTimeMs: input.logicalTimeMs,
      });
      identifier(assessment.assessorId, "assessorId");
      digest(
        assessment.assessorImplementationDigest,
        "assessorImplementationDigest",
      );
      if (
        assessment.evidenceDigests.length >
        (this.options.maximumAssessmentEvidenceDigests ?? 4_096)
      )
        throw new RangeError("assurance assessment evidence capacity exceeded");
      assessment.evidenceDigests.forEach((item) =>
        digest(item, "assessmentEvidenceDigest"),
      );
      const assessmentDigest = await collectiveQuorumDigestV1(
        {
          domain: "assurance-semantic-assessment-v1",
          body: {
            executionId: input.executionId,
            graphDigest: input.graphDigest,
            allocationPlanDigest: plan.planDigest,
            awardDigest: input.awardDigest,
            taskDigest: input.task.taskDigest,
            planningDecisionDigest: input.planningDecisionDigest,
            planningFinalityCertificateDigest:
              input.planningFinality.certificateDigest,
            cognitivePayloadDigest: input.cognitiveRequest.payloadDigest,
            cognitiveMetadataDigest: input.cognitiveRequest.metadataDigest,
            cognitiveAuthorityDigest: input.cognitiveRequest.authorityDigest,
            cognitiveRoleBindingDigest:
              input.cognitiveRequest.roleBindingDigest,
            cognitiveContextBindingDigest: input.cognitiveContextBindingDigest,
            cognitiveReceiptDigest: cognitive.receipt.receiptDigest,
            outputDigest: cognitive.result.outputDigest,
            assessorId: assessment.assessorId,
            assessorImplementationDigest:
              assessment.assessorImplementationDigest,
            metrics: assessment.metrics,
            evidenceDigests: [...new Set(assessment.evidenceDigests)].sort(),
            logicalTimeMs: input.logicalTimeMs,
          },
        },
        this.options.crypto,
      );
      const guarantee = this.#appendSemanticGuarantee({
        sequence: input.semanticSequence,
        logicalTimeMs: input.logicalTimeMs,
        metrics: assessment.metrics,
        assessmentDigest,
      });
      if (
        !integratedSemanticGuaranteeAcceptedV2(
          guarantee,
          this.#semanticAcceptance,
        )
      )
        return this.#finish(
          input,
          plan.planDigest,
          executionInputDigest,
          reservationId,
          "semantic_rejected",
          {
            cognitiveResult: cognitive.result,
            cognitiveReceipt: cognitive.receipt,
            assessmentDigest,
            semanticGuarantee: guarantee,
          },
        );

      const horizonInput = {
        stateKey: this.#semanticStateKey!,
        sequence: input.semanticSequence,
        logicalTimeMs: input.logicalTimeMs,
        metrics: assessment.metrics,
        assessmentDigest,
      };
      const horizon = this.#semanticHorizon
        ? await this.#evaluateSemanticHorizon!(horizonInput)
        : null;
      if (this.#requireSemanticHorizon && !horizon)
        throw new TypeError("assurance semantic horizon result is required");
      if (horizon) {
        validateAnytimeSemanticGuaranteeV1(horizon.guarantee);
        validateSemanticHorizonDecisionV1(horizon.decision, horizon.guarantee);
        digest(horizon.guaranteeDigest, "anytimeSemanticGuaranteeDigest");
        digest(horizon.decisionDigest, "semanticHorizonDecisionDigest");
        const [expectedGuaranteeDigest, expectedDecisionDigest] =
          await Promise.all([
            collectiveQuorumDigestV1(
              {
                domain: "anytime-semantic-guarantee-v1",
                body: horizon.guarantee,
              },
              this.options.crypto,
            ),
            collectiveQuorumDigestV1(
              {
                domain: "semantic-horizon-decision-v1",
                body: horizon.decision,
              },
              this.options.crypto,
            ),
          ]);
        if (
          horizon.guaranteeDigest !== expectedGuaranteeDigest ||
          horizon.decisionDigest !== expectedDecisionDigest
        )
          throw new TypeError(
            "assurance semantic horizon evidence digest is invalid",
          );
        if (
          horizon.guarantee.stateDigest !==
            horizon.decision.guaranteeStateDigest ||
          horizon.guarantee.policyDigest !== horizon.decision.policyDigest ||
          horizon.guarantee.assumptionsDigest !==
            horizon.decision.assumptionsDigest ||
          horizon.guarantee.stateKey !== this.#semanticStateKey
        )
          throw new TypeError(
            "assurance semantic horizon decision binding is invalid",
          );
        if (
          horizon.decision.directive === "safe_stop" ||
          horizon.decision.directive === "replan"
        )
          return this.#finish(
            input,
            plan.planDigest,
            executionInputDigest,
            reservationId,
            "semantic_rejected",
            {
              cognitiveResult: cognitive.result,
              cognitiveReceipt: cognitive.receipt,
              assessmentDigest,
              semanticGuarantee: guarantee,
              anytimeSemanticGuaranteeDigest: horizon.guaranteeDigest,
              semanticHorizonDecision: horizon.decision,
              semanticHorizonDecisionDigest: horizon.decisionDigest,
            },
          );
        await this.#horizonBudget!.apply(horizon.guarantee, horizon.decision);
      }

      const prepared = await this.#prepareEffect({
        executionId: input.executionId,
        taskDigest: input.task.taskDigest,
        result: cognitive.result,
      });
      identifier(prepared.effectClass, "effectClass");
      const preparedBody = {
        effectClass: prepared.effectClass,
        payload: prepared.payload,
      };
      const effect = freeze({
        schemaVersion: 1 as const,
        ...preparedBody,
        proposalDigest: await collectiveQuorumDigestV1(
          {
            domain: "assurance-protected-effect-proposal-v1",
            body: { schemaVersion: 1, ...preparedBody },
          },
          this.options.crypto,
        ),
      });
      const semanticGuaranteeDigest = await collectiveQuorumDigestV1(
        {
          domain: "assurance-semantic-guarantee-v1",
          body: {
            sequentialGuarantee: guarantee,
            anytimeSemanticGuaranteeDigest: horizon?.guaranteeDigest ?? null,
            semanticHorizonDecision: horizon?.decision ?? null,
            semanticHorizonDecisionDigest: horizon?.decisionDigest ?? null,
          },
        },
        this.options.crypto,
      );
      const currentnessInput = executionCurrentnessInputV1(
        input,
        plan.planDigest,
        this.options.localPeerId,
        this.options.localInstanceId,
      );
      const resolvedAuthority = await this.#resolveAuthority(currentnessInput);
      if (!resolvedAuthority)
        return this.#finish(
          input,
          plan.planDigest,
          executionInputDigest,
          reservationId,
          "execution_authority_unavailable",
          {
            cognitiveResult: cognitive.result,
            cognitiveReceipt: cognitive.receipt,
            assessmentDigest,
            semanticGuarantee: guarantee,
            anytimeSemanticGuaranteeDigest: horizon?.guaranteeDigest ?? null,
            semanticHorizonDecision: horizon?.decision ?? null,
            semanticHorizonDecisionDigest: horizon?.decisionDigest ?? null,
            effect,
          },
        );
      const authorityFence = await validateExecutionAuthorityFenceV1({
        fence: resolvedAuthority,
        currentness: currentnessInput,
        crypto: this.options.crypto,
      });
      const decisionDigest = await collectiveQuorumDigestV1(
        {
          domain: "assurance-execution-decision-v1",
          body: {
            executionId: input.executionId,
            graphDigest: input.graphDigest,
            allocationPlanDigest: plan.planDigest,
            awardDigest: input.awardDigest,
            taskDigest: input.task.taskDigest,
            planningDecisionDigest: input.planningDecisionDigest,
            planningFinalityCertificateDigest:
              input.planningFinality.certificateDigest,
            cognitivePayloadDigest: input.cognitiveRequest.payloadDigest,
            cognitiveMetadataDigest: input.cognitiveRequest.metadataDigest,
            cognitiveAuthorityDigest: input.cognitiveRequest.authorityDigest,
            cognitiveRoleBindingDigest:
              input.cognitiveRequest.roleBindingDigest,
            cognitiveContextBindingDigest: input.cognitiveContextBindingDigest,
            cognitiveReceiptDigest: cognitive.receipt.receiptDigest,
            outputDigest: cognitive.result.outputDigest,
            assessmentDigest,
            semanticGuaranteeDigest,
            anytimeSemanticGuaranteeDigest: horizon?.guaranteeDigest ?? null,
            semanticHorizonDecisionDigest: horizon?.decisionDigest ?? null,
            effectProposalDigest: effect.proposalDigest,
            authorityFenceDigest: authorityFence?.authorityDigest ?? null,
            logicalTimeMs: input.logicalTimeMs,
          },
        },
        this.options.crypto,
      );
      const executionFinality = await this.#certifyExecution({
        executionId: input.executionId,
        decisionDigest,
        graphDigest: input.graphDigest,
        allocationPlanDigest: plan.planDigest,
        awardDigest: input.awardDigest,
        taskDigest: input.task.taskDigest,
        planningDecisionDigest: input.planningDecisionDigest,
        planningFinalityCertificateDigest:
          input.planningFinality.certificateDigest,
        cognitivePayloadDigest: input.cognitiveRequest.payloadDigest,
        cognitiveMetadataDigest: input.cognitiveRequest.metadataDigest,
        cognitiveAuthorityDigest: input.cognitiveRequest.authorityDigest,
        cognitiveRoleBindingDigest: input.cognitiveRequest.roleBindingDigest,
        cognitiveContextBindingDigest: input.cognitiveContextBindingDigest,
        cognitiveReceiptDigest: cognitive.receipt.receiptDigest,
        outputDigest: cognitive.result.outputDigest,
        semanticGuaranteeDigest,
        anytimeSemanticGuaranteeDigest: horizon?.guaranteeDigest ?? null,
        semanticHorizonDecisionDigest: horizon?.decisionDigest ?? null,
        assessmentDigest,
        effectProposalDigest: effect.proposalDigest,
        authorityFenceDigest: authorityFence?.authorityDigest ?? null,
        logicalTimeMs: input.logicalTimeMs,
      });
      if (
        !executionFinality ||
        executionFinality.proposalDigest !== decisionDigest ||
        !(await this.#verifyExecution({
          certificate: executionFinality,
          decisionDigest,
          effectProposalDigest: effect.proposalDigest,
          logicalTimeMs: input.logicalTimeMs,
        }))
      )
        return this.#finish(
          input,
          plan.planDigest,
          executionInputDigest,
          reservationId,
          "execution_finality_unavailable",
          {
            cognitiveResult: cognitive.result,
            cognitiveReceipt: cognitive.receipt,
            assessmentDigest,
            semanticGuarantee: guarantee,
            anytimeSemanticGuaranteeDigest: horizon?.guaranteeDigest ?? null,
            semanticHorizonDecision: horizon?.decision ?? null,
            semanticHorizonDecisionDigest: horizon?.decisionDigest ?? null,
            authorityFence,
            effect,
          },
        );
      const pendingValues: AssuranceReceiptValuesV1 = {
        cognitiveResult: cognitive.result,
        cognitiveReceipt: cognitive.receipt,
        assessmentDigest,
        semanticGuarantee: guarantee,
        anytimeSemanticGuaranteeDigest: horizon?.guaranteeDigest ?? null,
        semanticHorizonDecision: horizon?.decision ?? null,
        semanticHorizonDecisionDigest: horizon?.decisionDigest ?? null,
        authorityFence,
        executionFinality,
        effect,
      };
      const pendingReceipt = await this.#createReceipt(
        input,
        plan.planDigest,
        executionInputDigest,
        "effect_failed",
        pendingValues,
      );
      const commitEffect = async () => {
        await this.#persistEffectCheckpoint(
          input.executionId,
          executionInputDigest,
          reservationId,
          await createAssuranceEffectCheckpointV1(
            "prepared",
            pendingReceipt,
            null,
            this.options.crypto,
          ),
        );
        if (
          horizon &&
          !(await this.#horizonBudget!.consume(horizon.decision, {
            consumptionId: input.executionId,
            bindingDigest: executionInputDigest,
          }))
        )
          throw new AssuranceSemanticHorizonBudgetUnavailableErrorV1();
        const current = await this.#verifyCurrentness(currentnessInput);
        if (!current)
          throw new Error("assurance execution authority is no longer current");
        return this.#commitAuthority({
          executionId: input.executionId,
          effect,
          certificate: executionFinality,
          authorityFence,
          logicalTimeMs: input.logicalTimeMs,
          signal: input.cognitiveContext.signal,
        });
      };
      const effectBoundaryRequest = effectBoundaryRequestFromPendingV1(
        input,
        plan.planDigest,
        pendingReceipt,
      );
      if (this.#operationalControl)
        await this.#persistEffectCheckpoint(
          input.executionId,
          executionInputDigest,
          reservationId,
          await createAssuranceEffectCheckpointV1(
            "gate_pending",
            pendingReceipt,
            null,
            this.options.crypto,
          ),
        );
      let gatedEffect;
      try {
        gatedEffect = this.#operationalControl
          ? await invokeOperationalCognitiveRunPreEffectV1(
              this.#operationalControl,
              effectBoundaryRequest,
              commitEffect,
            )
          : null;
      } catch (error) {
        if (
          !(error instanceof AssuranceSemanticHorizonBudgetUnavailableErrorV1)
        )
          throw error;
        return this.#finish(
          input,
          plan.planDigest,
          executionInputDigest,
          reservationId,
          "semantic_rejected",
          pendingValues,
        );
      }
      if (gatedEffect && (!gatedEffect.allowed || !gatedEffect.value))
        return this.#finish(
          input,
          plan.planDigest,
          executionInputDigest,
          reservationId,
          "effect_failed",
          {
            cognitiveResult: cognitive.result,
            cognitiveReceipt: cognitive.receipt,
            assessmentDigest,
            semanticGuarantee: guarantee,
            anytimeSemanticGuaranteeDigest: horizon?.guaranteeDigest ?? null,
            semanticHorizonDecision: horizon?.decision ?? null,
            semanticHorizonDecisionDigest: horizon?.decisionDigest ?? null,
            authorityFence,
            executionFinality,
            effect,
          },
        );
      let effectReceipt: ProtectedEffectReceiptV1;
      try {
        effectReceipt = gatedEffect?.value ?? (await commitEffect());
      } catch (error) {
        if (
          !(error instanceof AssuranceSemanticHorizonBudgetUnavailableErrorV1)
        )
          throw error;
        return this.#finish(
          input,
          plan.planDigest,
          executionInputDigest,
          reservationId,
          "semantic_rejected",
          pendingValues,
        );
      }
      const effectValid = await validateEffectReceipt(
        effectReceipt,
        input.executionId,
        effect,
        executionFinality,
        this.options.crypto,
      );
      if (!effectValid)
        throw new TypeError("assurance protected effect receipt is invalid");
      await this.#persistEffectCheckpoint(
        input.executionId,
        executionInputDigest,
        reservationId,
        await createAssuranceEffectCheckpointV1(
          "effect_committed",
          pendingReceipt,
          effectReceipt,
          this.options.crypto,
        ),
      );
      return this.#finish(
        input,
        plan.planDigest,
        executionInputDigest,
        reservationId,
        effectReceipt.status === "committed" ? "completed" : "effect_failed",
        { ...pendingValues, effectReceipt },
      );
    } catch (error) {
      await this.#store.release({
        executionId: input.executionId,
        executionInputDigest,
        reservationId,
      });
      throw error;
    }
  }

  #verifySemanticPolicy(): Promise<IntegratedSemanticAcceptancePolicyV2> {
    this.#semanticPolicyVerification ??=
      verifyIntegratedSemanticAcceptancePolicyV2(
        this.#semanticAcceptance,
        this.options.crypto,
      );
    return this.#semanticPolicyVerification;
  }

  async #persistEffectCheckpoint(
    executionId: string,
    executionInputDigest: string,
    reservationId: string,
    checkpoint: AssuranceEffectCommitCheckpointV1,
  ): Promise<void> {
    if (
      await this.#store.checkpointEffect({
        executionId,
        executionInputDigest,
        reservationId,
        checkpoint,
      })
    )
      return;
    const current = await this.#store.load(executionId);
    if (
      current?.executionInputDigest === executionInputDigest &&
      current.reservationId === reservationId &&
      current.receipt === null &&
      current.effectCheckpoint?.checkpointDigest === checkpoint.checkpointDigest
    )
      return;
    throw new Error("assurance effect checkpoint conflict");
  }

  async #resumeEffectCheckpoint(
    input: AssuranceCoupledExecutionInputV1,
    allocationPlanDigest: string,
    executionInputDigest: string,
    reservationId: string,
    persisted: AssuranceEffectCommitCheckpointV1,
  ): Promise<AssuranceCoupledExecutionReceiptV1> {
    let checkpoint = await validatePersistedAssuranceEffectCheckpointV1({
      checkpoint: persisted,
      input,
      executionInputDigest,
      expectedLocalPeerId: this.options.localPeerId,
      verifyExecution: this.#verifyExecution,
      crypto: this.options.crypto,
    });
    const pending = checkpoint.pendingReceipt;
    const effect = pending.effect!;
    const executionFinality = pending.executionFinality!;
    let effectReceipt = checkpoint.effectReceipt;
    if (checkpoint.phase !== "effect_committed") {
      if (!pending.authorityFence)
        throw new TypeError(
          "persisted assurance effect checkpoint authority is unavailable",
        );
      const persistedAuthorityFence = pending.authorityFence;
      effectReceipt = await this.#reconcileAuthority({
        executionId: input.executionId,
        effect,
        certificate: executionFinality,
        authorityFence: persistedAuthorityFence,
      });
      if (!effectReceipt) {
        const commitPreparedEffect = async () => {
          if (checkpoint.phase === "gate_pending") {
            checkpoint = await createAssuranceEffectCheckpointV1(
              "prepared",
              pending,
              null,
              this.options.crypto,
            );
            await this.#persistEffectCheckpoint(
              input.executionId,
              executionInputDigest,
              reservationId,
              checkpoint,
            );
          }
          if (
            pending.semanticHorizonDecision &&
            !(await this.#horizonBudget!.consume(
              pending.semanticHorizonDecision,
              {
                consumptionId: input.executionId,
                bindingDigest: executionInputDigest,
              },
            ))
          )
            throw new AssuranceSemanticHorizonBudgetUnavailableErrorV1();
          const current = await this.#verifyCurrentness(
            executionCurrentnessInputV1(
              input,
              allocationPlanDigest,
              this.options.localPeerId,
              this.options.localInstanceId,
            ),
          );
          if (!current)
            throw new Error(
              "assurance execution authority is no longer current",
            );
          return this.#commitAuthority({
            executionId: input.executionId,
            effect,
            certificate: executionFinality,
            authorityFence: persistedAuthorityFence,
            logicalTimeMs: input.logicalTimeMs,
            signal: input.cognitiveContext.signal,
          });
        };
        try {
          if (checkpoint.phase === "gate_pending") {
            if (!this.#operationalControl)
              throw new TypeError(
                "persisted operational pre-effect checkpoint requires operational control",
              );
            const boundaryRequest = effectBoundaryRequestFromPendingV1(
              input,
              allocationPlanDigest,
              pending,
            );
            const reconciled = await reconcileOperationalCognitivePreEffectV1(
              this.#operationalControl,
              boundaryRequest,
              commitPreparedEffect,
            );
            if (reconciled.authorized) {
              effectReceipt = reconciled.value;
            } else {
              const gated = await invokeOperationalCognitiveRunPreEffectV1(
                this.#operationalControl,
                boundaryRequest,
                commitPreparedEffect,
              );
              if (!gated.allowed || !gated.value)
                return this.#finish(
                  input,
                  allocationPlanDigest,
                  executionInputDigest,
                  reservationId,
                  "effect_failed",
                  receiptValuesFromPendingV1(pending),
                );
              effectReceipt = gated.value;
            }
          } else {
            effectReceipt = await commitPreparedEffect();
          }
        } catch (error) {
          if (
            !(error instanceof AssuranceSemanticHorizonBudgetUnavailableErrorV1)
          )
            throw error;
          return this.#finish(
            input,
            allocationPlanDigest,
            executionInputDigest,
            reservationId,
            "semantic_rejected",
            receiptValuesFromPendingV1(pending),
          );
        }
      }
      if (
        !effectReceipt ||
        !(await validateEffectReceipt(
          effectReceipt,
          input.executionId,
          effect,
          executionFinality,
          this.options.crypto,
        ))
      )
        throw new TypeError("assurance protected effect receipt is invalid");
      checkpoint = await createAssuranceEffectCheckpointV1(
        "effect_committed",
        pending,
        effectReceipt,
        this.options.crypto,
      );
      await this.#persistEffectCheckpoint(
        input.executionId,
        executionInputDigest,
        reservationId,
        checkpoint,
      );
    }
    if (!effectReceipt)
      throw new TypeError(
        "persisted assurance effect checkpoint receipt is unavailable",
      );
    return this.#finish(
      input,
      allocationPlanDigest,
      executionInputDigest,
      reservationId,
      effectReceipt.status === "committed" ? "completed" : "effect_failed",
      {
        cognitiveResult: pending.cognitiveResult,
        cognitiveReceipt: pending.cognitiveReceipt,
        assessmentDigest: pending.assessmentDigest,
        semanticGuarantee: pending.semanticGuarantee,
        anytimeSemanticGuaranteeDigest: pending.anytimeSemanticGuaranteeDigest,
        semanticHorizonDecision: pending.semanticHorizonDecision,
        semanticHorizonDecisionDigest: pending.semanticHorizonDecisionDigest,
        authorityFence: pending.authorityFence,
        executionFinality,
        effect,
        effectReceipt,
      },
    );
  }

  async #finish(
    input: AssuranceCoupledExecutionInputV1,
    allocationPlanDigest: string,
    executionInputDigest: string,
    reservationId: string,
    status: AssuranceCoupledExecutionStatusV1,
    values: AssuranceReceiptValuesV1,
  ): Promise<AssuranceCoupledExecutionReceiptV1> {
    const receipt = await this.#createReceipt(
      input,
      allocationPlanDigest,
      executionInputDigest,
      status,
      values,
    );
    const telemetry = this.#telemetryEvents(receipt);
    const completedAtomically =
      this.options.telemetryDeliveryMode === "durable_outbox"
        ? await this.#store.completeWithTelemetry!({
            executionId: input.executionId,
            executionInputDigest,
            reservationId,
            receipt,
            telemetry: await Promise.all(
              telemetry.map((event, ordinal) =>
                createCollectiveHostTelemetryOutboxEntryV1({
                  sourceKind: "assurance_execution",
                  sourceId: input.executionId,
                  sourceSequence: 1,
                  ordinal,
                  event,
                  crypto: this.options.crypto,
                }),
              ),
            ),
          })
        : await this.#store.complete({
            executionId: input.executionId,
            executionInputDigest,
            reservationId,
            receipt,
          });
    if (completedAtomically) {
      if (this.options.telemetryDeliveryMode === "durable_outbox")
        await this.#drainTelemetry();
      else await this.#emitTelemetry(receipt);
      return receipt;
    }
    const completed = await this.#store.load(input.executionId);
    if (
      completed?.receipt &&
      completed.executionInputDigest === executionInputDigest &&
      completed.receipt.receiptDigest === receipt.receiptDigest
    ) {
      const validated = await validatePersistedAssuranceReceiptV1({
        receipt: completed.receipt,
        input,
        executionInputDigest,
        expectedLocalPeerId: this.options.localPeerId,
        verifyExecution: this.#verifyExecution,
        crypto: this.options.crypto,
      });
      await this.#drainTelemetry();
      return validated;
    }
    throw new Error("assurance execution completion conflict");
  }

  async #createReceipt(
    input: AssuranceCoupledExecutionInputV1,
    allocationPlanDigest: string,
    executionInputDigest: string,
    status: AssuranceCoupledExecutionStatusV1,
    values: AssuranceReceiptValuesV1,
  ): Promise<AssuranceCoupledExecutionReceiptV1> {
    const body = {
      schemaVersion: 1 as const,
      executionId: input.executionId,
      executionInputDigest,
      cognitiveContextBindingDigest: input.cognitiveContextBindingDigest,
      status,
      graphDigest: input.graphDigest,
      allocationPlanDigest,
      awardDigest: input.awardDigest,
      taskDigest: input.task.taskDigest,
      planningDecisionDigest: input.planningDecisionDigest,
      planningFinalityCertificateDigest:
        input.planningFinality.certificateDigest,
      telemetryCorrelation: input.telemetryCorrelation,
      cognitiveResult: values.cognitiveResult ?? null,
      cognitiveReceipt: values.cognitiveReceipt ?? null,
      assessmentDigest: values.assessmentDigest ?? null,
      semanticGuarantee: values.semanticGuarantee ?? null,
      anytimeSemanticGuaranteeDigest:
        values.anytimeSemanticGuaranteeDigest ?? null,
      semanticHorizonDecision: values.semanticHorizonDecision ?? null,
      semanticHorizonDecisionDigest:
        values.semanticHorizonDecisionDigest ?? null,
      authorityFence: values.authorityFence ?? null,
      executionFinality: values.executionFinality ?? null,
      effect: values.effect ?? null,
      effectReceipt: values.effectReceipt ?? null,
      logicalTimeMs: input.logicalTimeMs,
    };
    const receipt = freeze({
      ...body,
      receiptDigest: await collectiveQuorumDigestV1(
        {
          domain: "assurance-coupled-execution-receipt-v1",
          body,
        },
        this.options.crypto,
      ),
    });
    return receipt;
  }

  async #emitTelemetry(
    receipt: AssuranceCoupledExecutionReceiptV1,
  ): Promise<void> {
    for (const event of this.#telemetryEvents(receipt))
      await emitCollectiveHostTelemetryV1({
        telemetry: this.options.telemetry,
        deliveryMode: this.options.telemetryDeliveryMode,
        event,
      });
  }

  #telemetryEvents(
    receipt: AssuranceCoupledExecutionReceiptV1,
  ): readonly CollectiveHostTelemetryEventV1[] {
    const outcome =
      receipt.status === "completed"
        ? "completed"
        : receipt.status === "execution_finality_unavailable"
          ? "deferred"
          : "rejected";
    const evidenceDigests = [
      receipt.receiptDigest,
      receipt.executionInputDigest,
      receipt.assessmentDigest,
      receipt.anytimeSemanticGuaranteeDigest,
      receipt.semanticHorizonDecisionDigest,
      receipt.authorityFence?.authorityDigest ?? null,
      receipt.executionFinality?.certificateDigest ?? null,
      receipt.effect?.proposalDigest ?? null,
      receipt.effectReceipt?.receiptDigest ?? null,
    ].filter((value): value is string => value !== null);
    const events: CollectiveHostTelemetryEventV1[] = [
      {
        category: "execution",
        operation: "assurance.execution",
        outcome,
        logicalTimeMs: receipt.logicalTimeMs,
        operationDigest: receipt.receiptDigest,
        evidenceDigests,
        correlation: receipt.telemetryCorrelation,
      },
    ];
    if (
      receipt.semanticHorizonDecisionDigest &&
      receipt.semanticHorizonDecision
    ) {
      events.push({
        category: "inference",
        operation: "semantic.horizon",
        outcome:
          receipt.semanticHorizonDecision.directive === "continue"
            ? "accepted"
            : receipt.semanticHorizonDecision.directive === "shorten_horizon"
              ? "deferred"
              : "rejected",
        logicalTimeMs: receipt.logicalTimeMs,
        operationDigest: receipt.semanticHorizonDecisionDigest,
        evidenceDigests: [
          receipt.receiptDigest,
          receipt.anytimeSemanticGuaranteeDigest!,
          receipt.semanticHorizonDecisionDigest,
        ],
        correlation: receipt.telemetryCorrelation,
      });
    }
    return events;
  }

  async #drainTelemetry(): Promise<void> {
    if (this.options.telemetryDeliveryMode !== "durable_outbox") return;
    const store = this.#store as AssuranceCoupledExecutionStoreV1 &
      CollectiveHostTelemetryOutboxStoreV1;
    const drain = this.#telemetryDrain.then(() =>
      drainCollectiveHostTelemetryOutboxV1({
        store,
        telemetry: this.options.telemetry!,
      }),
    );
    this.#telemetryDrain = drain.catch(() => undefined);
    await drain;
  }
}

/** Nominal check for the library-owned assurance execution runtime. */
export function isAssuranceCoupledExecutionRuntimeV1(
  value: unknown,
): value is AssuranceCoupledExecutionRuntimeV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    assuranceCoupledExecutionInvokersV1.has(value)
  );
}

/** Invokes the construction-time implementation and ignores public overrides. */
export function invokeAssuranceCoupledExecutionV1(
  runtime: AssuranceCoupledExecutionRuntimeV1,
  input: AssuranceCoupledExecutionInputV1,
): Promise<AssuranceCoupledExecutionReceiptV1> {
  const invokers =
    typeof runtime === "object" && runtime !== null
      ? assuranceCoupledExecutionInvokersV1.get(runtime)
      : undefined;
  if (!invokers)
    throw new TypeError("concrete assurance coupled execution is required");
  return invokers.execute(input);
}

/** Nominal read of an already-completed durable execution. */
export function invokeAssuranceCoupledExecutionReceiptLookupV1(
  runtime: AssuranceCoupledExecutionRuntimeV1,
  input: AssuranceCoupledExecutionInputV1,
): Promise<AssuranceCoupledExecutionReceiptV1 | null> {
  const invokers =
    typeof runtime === "object" && runtime !== null
      ? assuranceCoupledExecutionInvokersV1.get(runtime)
      : undefined;
  if (!invokers)
    throw new TypeError("concrete assurance coupled execution is required");
  return invokers.lookupReceipt(input);
}

/**
 * Opaque binding for non-secret tenant and actor authority. This function does
 * not read the abort signal, credentials, or actor email.
 */
export async function assuranceCognitiveContextBindingDigestV1(
  input: Pick<
    AssuranceCoupledExecutionInputV1,
    "cognitiveRequest" | "cognitiveContext"
  >,
  crypto?: Crypto,
): Promise<string> {
  const tenant = input.cognitiveContext?.tenant;
  if (!tenant || typeof tenant !== "object")
    throw new TypeError("assurance cognitive tenant context is required");
  identifier(tenant.tenantId, "cognitiveContext.tenant.tenantId");
  if (tenant.tenantId !== input.cognitiveRequest.tenantId)
    throw new TypeError("assurance cognitive context tenant is invalid");
  if (tenant.organizationId !== undefined)
    identifier(tenant.organizationId, "cognitiveContext.tenant.organizationId");
  if (tenant.workspaceId !== undefined)
    identifier(tenant.workspaceId, "cognitiveContext.tenant.workspaceId");
  const actor = tenant.actor;
  let actorBinding: {
    readonly actorId: string | null;
    readonly actorType: "human" | "machine" | "system";
    readonly roles: readonly string[];
  } | null = null;
  if (actor !== undefined) {
    if (!actor || typeof actor !== "object")
      throw new TypeError("assurance cognitive context actor is invalid");
    if (!["human", "machine", "system"].includes(actor.actorType))
      throw new TypeError("assurance cognitive context actor type is invalid");
    if (actor.actorId !== undefined)
      identifier(actor.actorId, "cognitiveContext.tenant.actor.actorId");
    if (actor.roles !== undefined && !Array.isArray(actor.roles))
      throw new TypeError(
        "assurance cognitive context actor roles are invalid",
      );
    const roles = [...new Set(actor.roles ?? [])].sort();
    roles.forEach((role) =>
      identifier(role, "cognitiveContext.tenant.actor.roles"),
    );
    actorBinding = {
      actorId: actor.actorId ?? null,
      actorType: actor.actorType,
      roles,
    };
  }
  return collectiveQuorumDigestV1(
    {
      domain: "assurance-cognitive-context-binding-v1",
      body: {
        schemaVersion: 1,
        tenantId: tenant.tenantId,
        organizationId: tenant.organizationId ?? null,
        workspaceId: tenant.workspaceId ?? null,
        actor: actorBinding,
        cognitiveAuthorityDigest: input.cognitiveRequest.authorityDigest,
      },
    },
    crypto,
  );
}

/** Stable digest used by execution and by crash reconciliation lookups. */
export async function assuranceCoupledExecutionInputDigestV1(
  input: AssuranceCoupledExecutionInputV1,
  crypto?: Crypto,
): Promise<string> {
  const planningEvidenceMessageDigests = canonicalDigestList(
    input.planningEvidenceMessageDigests,
    "planningEvidenceMessageDigests",
  );
  return collectiveQuorumDigestV1(
    {
      domain: "assurance-coupled-execution-input-v1",
      body: {
        executionId: input.executionId,
        graphDigest: input.graphDigest,
        allocationPlanDigest: input.allocationPlan.planDigest,
        planningCycle: input.planningCycle,
        planningEvidenceMessageDigests,
        awardDigest: input.awardDigest,
        task: input.task,
        planningDecisionDigest: input.planningDecisionDigest,
        planningFinalityCertificateDigest:
          input.planningFinality.certificateDigest,
        semanticSequence: input.semanticSequence,
        cognitiveRequest: input.cognitiveRequest,
        cognitiveContextBindingDigest: input.cognitiveContextBindingDigest,
        telemetryCorrelation: input.telemetryCorrelation,
        logicalTimeMs: input.logicalTimeMs,
      },
    },
    crypto,
  );
}

function immutableMethod(value: unknown): PropertyDescriptor {
  return {
    value,
    writable: false,
    configurable: false,
    enumerable: false,
  };
}

function captureAssuranceExecutionStoreV1(
  store: AssuranceCoupledExecutionStoreV1,
): AssuranceCoupledExecutionStoreV1 {
  const load = store?.load;
  const reserve = store?.reserve;
  const checkpointEffect = store?.checkpointEffect;
  const complete = store?.complete;
  const release = store?.release;
  if (
    typeof load !== "function" ||
    typeof reserve !== "function" ||
    typeof checkpointEffect !== "function" ||
    typeof complete !== "function" ||
    typeof release !== "function"
  )
    throw new TypeError("assurance execution store is invalid");
  const captured: AssuranceCoupledExecutionStoreV1 = {
    load: load.bind(store),
    reserve: reserve.bind(store),
    checkpointEffect: checkpointEffect.bind(store),
    complete: complete.bind(store),
    release: release.bind(store),
  };
  for (const key of [
    "completeWithTelemetry",
    "loadPendingTelemetry",
    "markTelemetryRecorded",
    "acknowledgeTelemetry",
  ] as const) {
    const method = store[key];
    if (method !== undefined) {
      if (typeof method !== "function")
        throw new TypeError(`assurance execution store ${key} is invalid`);
      Object.defineProperty(captured, key, {
        value: method.bind(store),
        writable: false,
        configurable: false,
        enumerable: true,
      });
    }
  }
  return Object.freeze(captured);
}

async function createAssuranceEffectCheckpointV1(
  phase: AssuranceEffectCommitCheckpointV1["phase"],
  pendingReceipt: AssuranceCoupledExecutionReceiptV1,
  effectReceipt: ProtectedEffectReceiptV1 | null,
  crypto?: Crypto,
): Promise<AssuranceEffectCommitCheckpointV1> {
  if (
    pendingReceipt.status !== "effect_failed" ||
    pendingReceipt.effectReceipt !== null ||
    ((phase === "gate_pending" || phase === "prepared") &&
      effectReceipt !== null) ||
    (phase === "effect_committed" && effectReceipt === null)
  )
    throw new TypeError("assurance effect checkpoint phase is invalid");
  const body = {
    schemaVersion: 1 as const,
    phase,
    executionId: pendingReceipt.executionId,
    executionInputDigest: pendingReceipt.executionInputDigest,
    cognitiveContextBindingDigest: pendingReceipt.cognitiveContextBindingDigest,
    pendingReceipt,
    effectReceipt,
  };
  return freeze({
    ...body,
    checkpointDigest: await collectiveQuorumDigestV1(
      { domain: "assurance-effect-commit-checkpoint-v1", body },
      crypto,
    ),
  });
}

function effectCheckpointTransitionAllowedV1(
  prior: AssuranceEffectCommitCheckpointV1 | null,
  next: AssuranceEffectCommitCheckpointV1,
): boolean {
  if (!prior) return next.phase === "gate_pending" || next.phase === "prepared";
  if (prior.pendingReceipt.receiptDigest !== next.pendingReceipt.receiptDigest)
    return false;
  return (
    (prior.phase === "gate_pending" &&
      (next.phase === "prepared" || next.phase === "effect_committed")) ||
    (prior.phase === "prepared" && next.phase === "effect_committed")
  );
}

async function validatePersistedAssuranceEffectCheckpointV1(input: {
  readonly checkpoint: AssuranceEffectCommitCheckpointV1;
  readonly input: AssuranceCoupledExecutionInputV1;
  readonly executionInputDigest: string;
  readonly expectedLocalPeerId: string;
  readonly verifyExecution: AssuranceCoupledFinalityPortV1["verifyExecution"];
  readonly crypto?: Crypto;
}): Promise<AssuranceEffectCommitCheckpointV1> {
  const checkpoint = input.checkpoint;
  assertExactKeys(
    checkpoint as unknown as Record<string, unknown>,
    [
      "checkpointDigest",
      "cognitiveContextBindingDigest",
      "effectReceipt",
      "executionId",
      "executionInputDigest",
      "pendingReceipt",
      "phase",
      "schemaVersion",
    ],
    "persisted assurance effect checkpoint",
  );
  if (
    checkpoint.schemaVersion !== 1 ||
    !["gate_pending", "prepared", "effect_committed"].includes(
      checkpoint.phase,
    ) ||
    checkpoint.executionId !== input.input.executionId ||
    checkpoint.executionInputDigest !== input.executionInputDigest ||
    checkpoint.cognitiveContextBindingDigest !==
      input.input.cognitiveContextBindingDigest ||
    ((checkpoint.phase === "gate_pending" || checkpoint.phase === "prepared") &&
      checkpoint.effectReceipt !== null) ||
    (checkpoint.phase === "effect_committed" &&
      checkpoint.effectReceipt === null)
  )
    throw new TypeError("persisted assurance effect checkpoint is invalid");
  digest(
    checkpoint.checkpointDigest,
    "persistedEffectCheckpoint.checkpointDigest",
  );
  const pendingReceipt = await validatePersistedAssuranceReceiptV1({
    receipt: checkpoint.pendingReceipt,
    input: input.input,
    executionInputDigest: input.executionInputDigest,
    expectedLocalPeerId: input.expectedLocalPeerId,
    verifyExecution: input.verifyExecution,
    crypto: input.crypto,
  });
  if (
    pendingReceipt.status !== "effect_failed" ||
    pendingReceipt.effectReceipt !== null ||
    !pendingReceipt.effect ||
    !pendingReceipt.executionFinality
  )
    throw new TypeError(
      "persisted assurance effect checkpoint evidence is invalid",
    );
  if (
    checkpoint.effectReceipt &&
    !(await validateEffectReceipt(
      checkpoint.effectReceipt,
      checkpoint.executionId,
      pendingReceipt.effect,
      pendingReceipt.executionFinality,
      input.crypto,
    ))
  )
    throw new TypeError(
      "persisted assurance effect checkpoint receipt is invalid",
    );
  const { checkpointDigest, ...body } = checkpoint;
  if (
    checkpointDigest !==
    (await collectiveQuorumDigestV1(
      { domain: "assurance-effect-commit-checkpoint-v1", body },
      input.crypto,
    ))
  )
    throw new TypeError(
      "persisted assurance effect checkpoint digest is invalid",
    );
  return freeze(checkpoint);
}

function executionCurrentnessInputV1(
  input: AssuranceCoupledExecutionInputV1,
  allocationPlanDigest: string,
  localPeerId: string,
  localInstanceId: string,
): AssuranceExecutionCurrentnessInputV1 {
  return freeze({
    executionId: input.executionId,
    localPeerId,
    localInstanceId,
    graphDigest: input.graphDigest,
    allocationPlanDigest,
    awardDigest: input.awardDigest,
    task: input.task,
    planningDecisionDigest: input.planningDecisionDigest,
    planningFinalityCertificateDigest: input.planningFinality.certificateDigest,
    cognitiveRequest: input.cognitiveRequest,
    logicalTimeMs: input.logicalTimeMs,
  });
}

function receiptValuesFromPendingV1(
  pending: AssuranceCoupledExecutionReceiptV1,
): AssuranceReceiptValuesV1 {
  return {
    cognitiveResult: pending.cognitiveResult,
    cognitiveReceipt: pending.cognitiveReceipt,
    assessmentDigest: pending.assessmentDigest,
    semanticGuarantee: pending.semanticGuarantee,
    anytimeSemanticGuaranteeDigest: pending.anytimeSemanticGuaranteeDigest,
    semanticHorizonDecision: pending.semanticHorizonDecision,
    semanticHorizonDecisionDigest: pending.semanticHorizonDecisionDigest,
    authorityFence: pending.authorityFence,
    executionFinality: pending.executionFinality,
    effect: pending.effect,
  };
}

async function validatePersistedAssuranceReceiptV1(input: {
  readonly receipt: AssuranceCoupledExecutionReceiptV1;
  readonly input: AssuranceCoupledExecutionInputV1;
  readonly executionInputDigest: string;
  readonly expectedLocalPeerId: string;
  readonly verifyExecution: AssuranceCoupledFinalityPortV1["verifyExecution"];
  readonly crypto?: Crypto;
}): Promise<AssuranceCoupledExecutionReceiptV1> {
  const receipt = input.receipt;
  assertExactKeys(
    receipt as unknown as Record<string, unknown>,
    [
      "allocationPlanDigest",
      "anytimeSemanticGuaranteeDigest",
      "assessmentDigest",
      "authorityFence",
      "awardDigest",
      "cognitiveContextBindingDigest",
      "cognitiveReceipt",
      "cognitiveResult",
      "effect",
      "effectReceipt",
      "executionFinality",
      "executionId",
      "executionInputDigest",
      "graphDigest",
      "logicalTimeMs",
      "planningDecisionDigest",
      "planningFinalityCertificateDigest",
      "receiptDigest",
      "schemaVersion",
      "semanticGuarantee",
      "semanticHorizonDecision",
      "semanticHorizonDecisionDigest",
      "status",
      "taskDigest",
      "telemetryCorrelation",
    ],
    "persisted assurance receipt",
  );
  if (
    receipt.schemaVersion !== 1 ||
    receipt.executionId !== input.input.executionId ||
    receipt.executionInputDigest !== input.executionInputDigest ||
    receipt.cognitiveContextBindingDigest !==
      input.input.cognitiveContextBindingDigest ||
    receipt.graphDigest !== input.input.graphDigest ||
    receipt.allocationPlanDigest !== input.input.allocationPlan.planDigest ||
    receipt.awardDigest !== input.input.awardDigest ||
    receipt.taskDigest !== input.input.task.taskDigest ||
    receipt.planningDecisionDigest !== input.input.planningDecisionDigest ||
    receipt.planningFinalityCertificateDigest !==
      input.input.planningFinality.certificateDigest ||
    receipt.logicalTimeMs !== input.input.logicalTimeMs ||
    JSON.stringify(receipt.telemetryCorrelation) !==
      JSON.stringify(input.input.telemetryCorrelation) ||
    ![
      "planning_binding_unavailable",
      "computation_refused",
      "semantic_rejected",
      "execution_authority_unavailable",
      "execution_finality_unavailable",
      "effect_failed",
      "completed",
    ].includes(receipt.status)
  )
    throw new TypeError("persisted assurance receipt binding is invalid");
  identifier(input.expectedLocalPeerId, "persistedReceipt.expectedLocalPeerId");
  for (const [label, value] of Object.entries({
    receiptDigest: receipt.receiptDigest,
    executionInputDigest: receipt.executionInputDigest,
    cognitiveContextBindingDigest: receipt.cognitiveContextBindingDigest,
    graphDigest: receipt.graphDigest,
    allocationPlanDigest: receipt.allocationPlanDigest,
    awardDigest: receipt.awardDigest,
    taskDigest: receipt.taskDigest,
    planningDecisionDigest: receipt.planningDecisionDigest,
    planningFinalityCertificateDigest:
      receipt.planningFinalityCertificateDigest,
  }))
    digest(value, `persistedReceipt.${label}`);
  if (
    (receipt.cognitiveResult === null) !==
    (receipt.cognitiveReceipt === null)
  )
    throw new TypeError("persisted assurance cognitive evidence is incomplete");
  if (receipt.cognitiveResult && receipt.cognitiveReceipt)
    await validateCognitiveExecutionReceiptV1(
      input.input.cognitiveRequest,
      receipt.cognitiveResult,
      receipt.cognitiveReceipt,
      input.crypto,
    );
  if (receipt.assessmentDigest !== null)
    digest(receipt.assessmentDigest, "persistedReceipt.assessmentDigest");
  if (receipt.semanticGuarantee)
    validateSequentialGuaranteeForReceiptV1(receipt.semanticGuarantee);
  if (
    (receipt.semanticHorizonDecision === null) !==
      (receipt.semanticHorizonDecisionDigest === null) ||
    (receipt.semanticHorizonDecision === null) !==
      (receipt.anytimeSemanticGuaranteeDigest === null)
  )
    throw new TypeError("persisted assurance horizon evidence is incomplete");
  if (
    receipt.semanticHorizonDecision &&
    receipt.semanticHorizonDecisionDigest &&
    receipt.anytimeSemanticGuaranteeDigest
  ) {
    validatePersistedSemanticHorizonDecisionV1(receipt.semanticHorizonDecision);
    digest(
      receipt.anytimeSemanticGuaranteeDigest,
      "persistedReceipt.anytimeSemanticGuaranteeDigest",
    );
    digest(
      receipt.semanticHorizonDecisionDigest,
      "persistedReceipt.semanticHorizonDecisionDigest",
    );
    if (
      receipt.semanticHorizonDecisionDigest !==
      (await collectiveQuorumDigestV1(
        {
          domain: "semantic-horizon-decision-v1",
          body: receipt.semanticHorizonDecision,
        },
        input.crypto,
      ))
    )
      throw new TypeError(
        "persisted assurance horizon decision digest is invalid",
      );
  }
  if (receipt.authorityFence)
    await validateExecutionAuthorityFenceV1({
      fence: receipt.authorityFence,
      currentness: {
        executionId: input.input.executionId,
        localPeerId: input.expectedLocalPeerId,
        localInstanceId: "persisted:validation",
        graphDigest: input.input.graphDigest,
        allocationPlanDigest: receipt.allocationPlanDigest,
        awardDigest: input.input.awardDigest,
        task: input.input.task,
        planningDecisionDigest: input.input.planningDecisionDigest,
        planningFinalityCertificateDigest:
          input.input.planningFinality.certificateDigest,
        cognitiveRequest: input.input.cognitiveRequest,
        logicalTimeMs: input.input.logicalTimeMs,
      },
      crypto: input.crypto,
    });
  if (receipt.executionFinality)
    digest(
      receipt.executionFinality.certificateDigest,
      "persistedReceipt.executionFinality.certificateDigest",
    );
  if (receipt.effect) {
    identifier(
      receipt.effect.effectClass,
      "persistedReceipt.effect.effectClass",
    );
    digest(
      receipt.effect.proposalDigest,
      "persistedReceipt.effect.proposalDigest",
    );
    const expectedProposalDigest = await collectiveQuorumDigestV1(
      {
        domain: "assurance-protected-effect-proposal-v1",
        body: {
          schemaVersion: receipt.effect.schemaVersion,
          effectClass: receipt.effect.effectClass,
          payload: receipt.effect.payload,
        },
      },
      input.crypto,
    );
    if (receipt.effect.proposalDigest !== expectedProposalDigest)
      throw new TypeError("persisted assurance effect proposal is invalid");
  }
  if (receipt.effectReceipt) {
    if (
      !receipt.effect ||
      !receipt.executionFinality ||
      !(await validateEffectReceipt(
        receipt.effectReceipt,
        receipt.executionId,
        receipt.effect,
        receipt.executionFinality,
        input.crypto,
      ))
    )
      throw new TypeError("persisted assurance effect receipt is invalid");
  }
  validatePersistedAssuranceEvidenceMatrixV1(receipt);
  if (receipt.executionFinality && receipt.effect) {
    if (
      !receipt.cognitiveReceipt ||
      !receipt.cognitiveResult ||
      !receipt.assessmentDigest ||
      !receipt.semanticGuarantee
    )
      throw new TypeError(
        "persisted assurance finality evidence is incomplete",
      );
    const semanticGuaranteeDigest = await collectiveQuorumDigestV1(
      {
        domain: "assurance-semantic-guarantee-v1",
        body: {
          sequentialGuarantee: receipt.semanticGuarantee,
          anytimeSemanticGuaranteeDigest:
            receipt.anytimeSemanticGuaranteeDigest,
          semanticHorizonDecision: receipt.semanticHorizonDecision,
          semanticHorizonDecisionDigest: receipt.semanticHorizonDecisionDigest,
        },
      },
      input.crypto,
    );
    const decisionDigest = await collectiveQuorumDigestV1(
      {
        domain: "assurance-execution-decision-v1",
        body: {
          executionId: receipt.executionId,
          graphDigest: receipt.graphDigest,
          allocationPlanDigest: receipt.allocationPlanDigest,
          awardDigest: receipt.awardDigest,
          taskDigest: receipt.taskDigest,
          planningDecisionDigest: receipt.planningDecisionDigest,
          planningFinalityCertificateDigest:
            receipt.planningFinalityCertificateDigest,
          cognitivePayloadDigest: input.input.cognitiveRequest.payloadDigest,
          cognitiveMetadataDigest: input.input.cognitiveRequest.metadataDigest,
          cognitiveAuthorityDigest:
            input.input.cognitiveRequest.authorityDigest,
          cognitiveRoleBindingDigest:
            input.input.cognitiveRequest.roleBindingDigest,
          cognitiveContextBindingDigest:
            input.input.cognitiveContextBindingDigest,
          cognitiveReceiptDigest: receipt.cognitiveReceipt.receiptDigest,
          outputDigest: receipt.cognitiveResult.outputDigest,
          assessmentDigest: receipt.assessmentDigest,
          semanticGuaranteeDigest,
          anytimeSemanticGuaranteeDigest:
            receipt.anytimeSemanticGuaranteeDigest,
          semanticHorizonDecisionDigest: receipt.semanticHorizonDecisionDigest,
          effectProposalDigest: receipt.effect.proposalDigest,
          authorityFenceDigest: receipt.authorityFence?.authorityDigest ?? null,
          logicalTimeMs: receipt.logicalTimeMs,
        },
      },
      input.crypto,
    );
    if (
      receipt.executionFinality.proposalDigest !== decisionDigest ||
      !(await input.verifyExecution({
        certificate: receipt.executionFinality,
        decisionDigest,
        effectProposalDigest: receipt.effect.proposalDigest,
        logicalTimeMs: receipt.logicalTimeMs,
      }))
    )
      throw new TypeError("persisted assurance execution finality is invalid");
  }
  const { receiptDigest, ...body } = receipt;
  if (
    receiptDigest !==
    (await collectiveQuorumDigestV1(
      { domain: "assurance-coupled-execution-receipt-v1", body },
      input.crypto,
    ))
  )
    throw new TypeError("persisted assurance receipt digest is invalid");
  return freeze(receipt);
}

function validatePersistedAssuranceEvidenceMatrixV1(
  receipt: AssuranceCoupledExecutionReceiptV1,
): void {
  const hasCognitive =
    receipt.cognitiveResult !== null && receipt.cognitiveReceipt !== null;
  const hasSemantic =
    receipt.assessmentDigest !== null && receipt.semanticGuarantee !== null;
  const hasHorizon = receipt.semanticHorizonDecision !== null;
  const hasEffect = receipt.effect !== null;
  const hasFinality = receipt.executionFinality !== null;
  const hasEffectReceipt = receipt.effectReceipt !== null;
  if (
    (hasSemantic && !hasCognitive) ||
    (hasHorizon && !hasSemantic) ||
    (receipt.authorityFence !== null && !hasEffect) ||
    (hasFinality && (!hasEffect || !hasSemantic)) ||
    (hasEffectReceipt && (!hasEffect || !hasFinality))
  )
    throw new TypeError("persisted assurance evidence order is invalid");
  switch (receipt.status) {
    case "planning_binding_unavailable":
      if (
        hasCognitive ||
        hasSemantic ||
        hasHorizon ||
        hasEffect ||
        receipt.authorityFence ||
        hasFinality ||
        hasEffectReceipt
      )
        throw new TypeError("persisted planning rejection evidence is invalid");
      break;
    case "computation_refused":
      if (
        !hasCognitive ||
        receipt.cognitiveResult!.status === "completed" ||
        hasSemantic ||
        hasHorizon ||
        hasEffect ||
        receipt.authorityFence ||
        hasFinality ||
        hasEffectReceipt
      )
        throw new TypeError(
          "persisted computation refusal evidence is invalid",
        );
      break;
    case "execution_authority_unavailable":
      if (
        !hasCognitive ||
        !hasSemantic ||
        !hasEffect ||
        receipt.authorityFence ||
        hasFinality ||
        hasEffectReceipt
      )
        throw new TypeError(
          "persisted authority rejection evidence is invalid",
        );
      break;
    case "execution_finality_unavailable":
      if (
        !hasCognitive ||
        !hasSemantic ||
        !hasEffect ||
        hasFinality ||
        hasEffectReceipt
      )
        throw new TypeError("persisted finality rejection evidence is invalid");
      break;
    case "effect_failed":
      if (
        !hasCognitive ||
        !hasSemantic ||
        !hasEffect ||
        !hasFinality ||
        receipt.effectReceipt?.status === "committed"
      )
        throw new TypeError("persisted effect failure evidence is invalid");
      break;
    case "completed":
      if (
        !hasCognitive ||
        receipt.cognitiveResult!.status !== "completed" ||
        !hasSemantic ||
        !hasEffect ||
        !hasFinality ||
        !hasEffectReceipt ||
        receipt.effectReceipt!.status !== "committed"
      )
        throw new TypeError(
          "persisted completed assurance receipt is incomplete",
        );
      break;
    case "semantic_rejected":
      if (!hasCognitive || !hasSemantic || hasEffectReceipt)
        throw new TypeError("persisted semantic rejection evidence is invalid");
      break;
  }
}

function validatePersistedSemanticHorizonDecisionV1(
  decision: SemanticHorizonDecisionV1,
): void {
  assertExactKeys(
    decision as unknown as Record<string, unknown>,
    [
      "assumptionsDigest",
      "controlPolicyDigest",
      "directive",
      "guaranteeStateDigest",
      "policyDigest",
      "reasonCodes",
      "recommendedHorizonSteps",
      "replanRequired",
      "schemaVersion",
    ],
    "persisted semantic horizon decision",
  );
  if (
    decision.schemaVersion !== 1 ||
    !["continue", "shorten_horizon", "replan", "safe_stop"].includes(
      decision.directive,
    )
  )
    throw new TypeError("persisted semantic horizon directive is invalid");
  integer(
    decision.recommendedHorizonSteps,
    "persistedDecision.recommendedHorizonSteps",
    0,
    1_000_000_000,
  );
  if (
    (decision.directive === "safe_stop" &&
      decision.recommendedHorizonSteps !== 0) ||
    ((decision.directive === "continue" ||
      decision.directive === "shorten_horizon") &&
      decision.recommendedHorizonSteps === 0) ||
    decision.replanRequired !==
      (decision.directive === "replan" || decision.directive === "safe_stop")
  )
    throw new TypeError("persisted semantic horizon decision is inconsistent");
  for (const [label, value] of Object.entries({
    guaranteeStateDigest: decision.guaranteeStateDigest,
    policyDigest: decision.policyDigest,
    assumptionsDigest: decision.assumptionsDigest,
    controlPolicyDigest: decision.controlPolicyDigest,
  }))
    digest(value, `persistedDecision.${label}`);
  if (!Array.isArray(decision.reasonCodes))
    throw new TypeError("persisted semantic horizon reason codes are invalid");
  const canonical = [...new Set(decision.reasonCodes)].sort();
  if (
    JSON.stringify(canonical) !== JSON.stringify(decision.reasonCodes) ||
    canonical.some(
      (reason) =>
        typeof reason !== "string" ||
        !/^[a-z0-9][a-z0-9_.:-]{0,127}$/u.test(reason),
    )
  )
    throw new TypeError("persisted semantic horizon reason codes are invalid");
}

function validateSequentialGuaranteeForReceiptV1(
  guarantee: SequentialSemanticGuaranteeV1,
): void {
  if (!guarantee || guarantee.schemaVersion !== 1)
    throw new TypeError("persisted sequential semantic guarantee is invalid");
  integer(
    guarantee.throughSequence,
    "persistedGuarantee.throughSequence",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    guarantee.throughLogicalTimeMs,
    "persistedGuarantee.throughLogicalTimeMs",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  integer(
    guarantee.confidenceBasisPoints,
    "persistedGuarantee.confidenceBasisPoints",
    0,
    10_000,
  );
  canonicalDigestList(
    guarantee.evidenceDigests,
    "persistedGuarantee.evidenceDigests",
  );
  for (const key of [
    "roleCoherence",
    "missionAlignment",
    "contextConflict",
    "uncertainty",
    "courseActionDiversity",
    "courseActionNovelty",
  ] as const) {
    const bound = guarantee[key];
    integer(
      bound.sampleCount,
      `${key}.sampleCount`,
      0,
      Number.MAX_SAFE_INTEGER,
    );
    for (const [label, value] of Object.entries({
      meanBasisPoints: bound.meanBasisPoints,
      lowerBasisPoints: bound.lowerBasisPoints,
      upperBasisPoints: bound.upperBasisPoints,
    }))
      if (value !== null) integer(value, `${key}.${label}`, 0, 10_000);
    const values = [
      bound.meanBasisPoints,
      bound.lowerBasisPoints,
      bound.upperBasisPoints,
    ];
    if (
      (values.every((value) => value === null) && bound.sampleCount !== 0) ||
      (values.some((value) => value === null) &&
        !values.every((value) => value === null)) ||
      (values.every((value) => value !== null) &&
        (bound.sampleCount === 0 ||
          bound.lowerBasisPoints! > bound.meanBasisPoints! ||
          bound.meanBasisPoints! > bound.upperBasisPoints!))
    )
      throw new TypeError(`persisted semantic guarantee ${key} is invalid`);
  }
}

async function validateMaterializedCognitiveRequestV1(input: {
  readonly executionId: string;
  readonly graphDigest: string;
  readonly allocationPlanDigest: string;
  readonly awardDigest: string;
  readonly task: MissionTaskNodeV1;
  readonly planningEvidenceMessageDigests: readonly string[];
  readonly planningFinalityCertificateDigest: string;
  readonly planningFinalityCertificateId: string;
  readonly planningCycle: DistributedPlanningCycleV1;
  readonly semanticSequence: number;
  readonly request: CognitiveOperationRequestV2;
  readonly telemetryCorrelation: CollectiveTelemetryCorrelationV1;
  readonly crypto?: Crypto;
}): Promise<void> {
  const request = input.request;
  if (!request || request.schemaVersion !== 2 || request.operation !== "plan")
    throw new TypeError(
      "assurance cognitive request is not a materialized plan operation",
    );
  const payload = request.payload as Record<string, unknown>;
  const task = payload.task as Record<string, unknown> | undefined;
  const awardStem = input.awardDigest.slice("sha256:".length, 47);
  const expectedTask = materializedTaskPayloadV1(input.task);
  assertExactKeys(
    payload,
    [
      "admittedMessageDigests",
      "allocationPlanDigest",
      "awardDigest",
      "catalogDigest",
      "catalogEntryId",
      "decompositionGraphDigest",
      "missionIntentDigest",
      "missionIntentId",
      "planningCycleId",
      "task",
    ],
    "cognitive request payload",
  );
  if (!task)
    throw new TypeError("cognitive request task payload is unavailable");
  assertExactKeys(task, Object.keys(expectedTask), "cognitive request task");
  assertExactKeys(
    request.metadata as Record<string, unknown>,
    [
      "admittedMessageDigests",
      "catalogDigest",
      "operationalBindingDigest",
      "operationalObservationSequence",
      "requestedToolNames",
    ],
    "cognitive request metadata",
  );
  if (
    input.executionId !== `execution:${awardStem}` ||
    request.operationId !== `task:${awardStem}` ||
    request.sessionId !== `session:${awardStem}` ||
    request.expectedRevision !== 0 ||
    payload.decompositionGraphDigest !== input.graphDigest ||
    payload.allocationPlanDigest !== input.allocationPlanDigest ||
    payload.awardDigest !== input.awardDigest ||
    JSON.stringify(task) !== JSON.stringify(expectedTask) ||
    JSON.stringify(payload.admittedMessageDigests) !==
      JSON.stringify(input.planningEvidenceMessageDigests) ||
    JSON.stringify(request.metadata.admittedMessageDigests) !==
      JSON.stringify(input.planningEvidenceMessageDigests) ||
    request.metadata.catalogDigest !== payload.catalogDigest ||
    payload.missionIntentId !== input.planningCycle.missionIntentId ||
    payload.missionIntentDigest !== input.planningCycle.intentDigest ||
    payload.planningCycleId !== input.planningCycle.cycleId ||
    request.controlPlaneDigest !== input.planningFinalityCertificateDigest
  )
    throw new TypeError(
      "cognitive request is not bound to the certified award",
    );
  const missionId = payload.missionIntentId;
  const cycleId = payload.planningCycleId;
  if (typeof missionId !== "string" || typeof cycleId !== "string")
    throw new TypeError("cognitive request lacks mission causal coordinates");
  identifier(missionId, "cognitiveRequest.payload.missionIntentId");
  identifier(cycleId, "cognitiveRequest.payload.planningCycleId");
  identifier(
    input.planningFinalityCertificateId,
    "planningFinality.certificateId",
  );
  const expectedCorrelation: CollectiveTelemetryCorrelationV1 = {
    missionId,
    cycleId,
    decisionId: input.planningFinalityCertificateId,
    effectId: input.executionId,
  };
  if (
    JSON.stringify(input.telemetryCorrelation) !==
    JSON.stringify(expectedCorrelation)
  )
    throw new TypeError(
      "execution telemetry correlation is not derived from certified state",
    );
  const requestedToolNames = request.metadata.requestedToolNames;
  if (!Array.isArray(requestedToolNames) || requestedToolNames.length !== 0)
    throw new TypeError(
      "assurance plan materialization cannot contain implicit tools",
    );
  if (
    request.metadata.operationalObservationSequence !==
    input.semanticSequence * 3 - 2
  )
    throw new TypeError(
      "cognitive observation sequence is not bound to execution",
    );
  const integrity = createWebCryptoCognitiveIntegrityV2();
  if (
    request.payloadDigest !==
      (await integrity.digest(
        "cognitive-operation-payload-v2",
        request.payload,
      )) ||
    request.metadataDigest !==
      (await integrity.digest(
        "cognitive-operation-metadata-v2",
        request.metadata,
      ))
  )
    throw new TypeError("cognitive request content digest is invalid");
  const operationalBindingDigest = request.metadata.operationalBindingDigest;
  digest(operationalBindingDigest, "metadata.operationalBindingDigest");
  const expectedBinding = await collectiveQuorumDigestV1(
    {
      domain: "reference-operational-task-binding-v1",
      body: {
        payload: request.payload,
        authorityDigest: request.authorityDigest,
        roleBindingDigest: request.roleBindingDigest,
        planningFinalityCertificateDigest:
          input.planningFinalityCertificateDigest,
      },
    },
    input.crypto,
  );
  if (operationalBindingDigest !== expectedBinding)
    throw new TypeError("cognitive operational binding digest is invalid");
}

async function validateCognitiveExecutionReceiptV1(
  request: CognitiveOperationRequestV2,
  result: CognitiveOperationResultV2,
  receipt: CognitiveOperationReceiptV2,
  crypto?: Crypto,
): Promise<void> {
  if (
    !result ||
    result.schemaVersion !== 2 ||
    result.operationId !== request.operationId
  )
    throw new TypeError("cognitive result is not bound to its request");
  const integrity = createWebCryptoCognitiveIntegrityV2();
  if (
    result.outputDigest !==
    (await integrity.digest("cognitive-operation-output-v2", result.output))
  )
    throw new TypeError("cognitive result output digest is invalid");
  if (
    !receipt ||
    receipt.schemaVersion !== 2 ||
    receipt.operationId !== request.operationId ||
    receipt.operation !== request.operation ||
    receipt.sessionId !== request.sessionId ||
    receipt.agentId !== request.agentId ||
    receipt.revision !== request.expectedRevision + 1 ||
    receipt.logicalTimeMs !== request.logicalTimeMs ||
    receipt.payloadDigest !== request.payloadDigest ||
    receipt.metadataDigest !== request.metadataDigest ||
    receipt.outputDigest !== result.outputDigest ||
    receipt.authorityDigest !== request.authorityDigest ||
    receipt.roleBindingDigest !== request.roleBindingDigest ||
    receipt.controlPlaneDigest !== request.controlPlaneDigest ||
    receipt.status !== result.status ||
    receipt.reasonCode !== result.reasonCode ||
    receipt.controlSurface !== result.controlSurface
  )
    throw new TypeError("cognitive receipt is not bound to request and result");
  identifier(receipt.implementationId, "cognitiveReceipt.implementationId");
  digest(receipt.previousStateDigest, "cognitiveReceipt.previousStateDigest");
  digest(receipt.receiptDigest, "cognitiveReceipt.receiptDigest");
  const expectedPreviousStateDigest = await collectiveQuorumDigestV1(
    {
      domain: "reference-operational-cognitive-predecessor-v1",
      body: {
        sessionId: request.sessionId,
        expectedRevision: request.expectedRevision,
      },
    },
    crypto,
  );
  const { receiptDigest, ...receiptBody } = receipt;
  const expectedReceiptDigest = await collectiveQuorumDigestV1(
    {
      domain: "reference-operational-cognitive-receipt-v1",
      body: receiptBody,
    },
    crypto,
  );
  if (
    receipt.previousStateDigest !== expectedPreviousStateDigest ||
    receiptDigest !== expectedReceiptDigest
  )
    throw new TypeError("cognitive receipt content digest is invalid");
}

function materializedTaskPayloadV1(
  task: MissionTaskNodeV1,
): Record<string, unknown> {
  return {
    schemaVersion: task.schemaVersion,
    taskId: task.taskId,
    taskDigest: task.taskDigest,
    semanticSlotKey: task.semanticSlotKey,
    outcomeIndex: task.outcomeIndex,
    stepKey: task.stepKey,
    roleKey: task.roleKey,
    requiredCapabilityKeys: task.requiredCapabilityKeys,
    dependencyTaskDigests: task.dependencyTaskDigests,
    budgetUnits: task.budgetUnits,
    confidenceBasisPoints: task.confidenceBasisPoints,
    proposerPeerId: task.proposerPeerId,
    proposerInstanceId: task.proposerInstanceId,
    basisObservationDigests: task.basisObservationDigests,
    predecessorTaskDigest: task.predecessorTaskDigest,
  };
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} is invalid`);
  const actual = Object.keys(value).sort();
  const canonicalExpected = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(canonicalExpected))
    throw new TypeError(`${label} schema is not closed`);
}

function canonicalDigestList(
  values: readonly string[],
  label: string,
): readonly string[] {
  if (!Array.isArray(values)) throw new TypeError(`${label} is invalid`);
  const canonical = [...new Set(values)].sort();
  canonical.forEach((item) => digest(item, label));
  return Object.freeze(canonical);
}

function effectBoundaryRequestFromPendingV1(
  input: AssuranceCoupledExecutionInputV1,
  allocationPlanDigest: string,
  pending: AssuranceCoupledExecutionReceiptV1,
) {
  if (
    !pending.effect ||
    !pending.executionFinality ||
    !pending.assessmentDigest
  )
    throw new TypeError(
      "persisted operational pre-effect checkpoint evidence is incomplete",
    );
  return {
    operationId: input.executionId,
    observationSequence: operationalEffectSequence(input.semanticSequence),
    step: input.semanticSequence,
    logicalTimeMs: input.logicalTimeMs,
    bindingDigest: pending.executionFinality.proposalDigest,
    payload: JSON.stringify({
      effectClass: pending.effect.effectClass,
      proposalDigest: pending.effect.proposalDigest,
      finalityCertificateDigest: pending.executionFinality.certificateDigest,
      authorityFenceDigest: pending.authorityFence?.authorityDigest ?? null,
    }),
    contextItemDigests: [
      input.graphDigest,
      allocationPlanDigest,
      input.awardDigest,
      input.task.taskDigest,
      pending.assessmentDigest,
      ...(pending.authorityFence
        ? [pending.authorityFence.authorityDigest]
        : []),
    ].sort(),
    allowedToolNames: [],
  };
}

function operationalEffectSequence(semanticSequence: number): number {
  const sequence = semanticSequence * 3;
  return integer(
    sequence,
    "operationalEffectSequence",
    3,
    Number.MAX_SAFE_INTEGER,
  );
}

export async function validateExecutionAuthorityFenceV1(input: {
  readonly fence: AssuranceExecutionAuthorityFenceV1;
  readonly currentness: AssuranceExecutionCurrentnessInputV1;
  readonly crypto?: Crypto;
}): Promise<AssuranceExecutionAuthorityFenceV1> {
  const fence = input.fence;
  const payload = input.currentness.cognitiveRequest.payload as Record<
    string,
    unknown
  >;
  if (
    !fence ||
    fence.schemaVersion !== 1 ||
    fence.executionId !== input.currentness.executionId ||
    fence.awardDigest !== input.currentness.awardDigest ||
    fence.taskDigest !== input.currentness.task.taskDigest ||
    fence.assignedPeerId !== input.currentness.localPeerId ||
    fence.scope.tenantId !== input.currentness.cognitiveRequest.tenantId ||
    fence.scope.missionIntentId !== payload.missionIntentId ||
    fence.scope.objectiveId !== payload.planningCycleId ||
    fence.scope.workItemId !== input.currentness.task.taskId
  )
    throw new TypeError(
      "assurance execution authority fence binding is invalid",
    );
  identifier(fence.scope.tenantId, "authorityFence.scope.tenantId");
  identifier(fence.scope.meshId, "authorityFence.scope.meshId");
  identifier(
    fence.scope.missionIntentId,
    "authorityFence.scope.missionIntentId",
  );
  identifier(fence.scope.objectiveId, "authorityFence.scope.objectiveId");
  identifier(fence.scope.workItemId, "authorityFence.scope.workItemId");
  identifier(fence.executionId, "authorityFence.executionId");
  digest(fence.awardDigest, "authorityFence.awardDigest");
  digest(fence.taskDigest, "authorityFence.taskDigest");
  identifier(fence.assignedPeerId, "authorityFence.assignedPeerId");
  integer(
    fence.assignmentEpoch,
    "authorityFence.assignmentEpoch",
    0,
    Number.MAX_SAFE_INTEGER,
  );
  identifier(fence.fencingToken, "authorityFence.fencingToken");
  digest(
    fence.membershipConfigurationDigest,
    "authorityFence.membershipConfigurationDigest",
  );
  integer(
    fence.membershipEpoch,
    "authorityFence.membershipEpoch",
    1,
    Number.MAX_SAFE_INTEGER,
  );
  digest(fence.authorityDigest, "authorityFence.authorityDigest");
  const { authorityDigest, ...body } = fence;
  if (
    authorityDigest !==
    (await collectiveQuorumDigestV1(
      {
        domain: "assurance-execution-authority-fence-v1",
        body,
      },
      input.crypto,
    ))
  )
    throw new TypeError(
      "assurance execution authority fence digest is invalid",
    );
  return freeze(fence);
}

async function validateEffectReceipt(
  receipt: ProtectedEffectReceiptV1,
  executionId: string,
  effect: PreparedProtectedEffectV1,
  certificate: SparseFinalityCertificateV2,
  crypto?: Crypto,
): Promise<boolean> {
  if (
    !receipt ||
    receipt.schemaVersion !== 1 ||
    receipt.executionId !== executionId ||
    receipt.proposalDigest !== effect.proposalDigest ||
    receipt.finalityCertificateDigest !== certificate.certificateDigest ||
    !["committed", "refused", "failed"].includes(receipt.status)
  )
    return false;
  if (
    (receipt.externalReference !== null &&
      (typeof receipt.externalReference !== "string" ||
        receipt.externalReference.length > 4_096)) ||
    typeof receipt.reasonCode !== "string" ||
    !/^[a-z0-9][a-z0-9_.:-]{0,127}$/u.test(receipt.reasonCode)
  )
    return false;
  const { receiptDigest, ...body } = receipt;
  digest(receiptDigest, "effectReceiptDigest");
  return (
    receiptDigest ===
    (await collectiveQuorumDigestV1(
      {
        domain: "assurance-protected-effect-receipt-v1",
        body,
      },
      crypto,
    ))
  );
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u.test(value)
  )
    throw new TypeError(`${label} is invalid`);
}

function digest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} is invalid`);
}

function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  )
    throw new RangeError(`${label} is invalid`);
  return value as number;
}

function safeAdd(left: number, right: number): number {
  return integer(
    left + right,
    "reservedUntilLogicalMs",
    1,
    Number.MAX_SAFE_INTEGER,
  );
}

function freeze<T>(value: T): T {
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
