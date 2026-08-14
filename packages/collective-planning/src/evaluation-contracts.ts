import type {
  MissionObservationV1,
  PlanningDigestV1,
  PlanningJson,
} from "./contracts.js";

export const COLLECTIVE_ENVIRONMENT_PORT_VERSION_V1 = 1 as const;
export const COLLECTIVE_INVARIANT_MONITOR_PORT_VERSION_V1 = 1 as const;
export const COLLECTIVE_TRACE_SCHEMA_VERSION_V2 = 2 as const;
export const COLLECTIVE_INTERACTION_ACCOUNTING_VERSION_V2 =
  "interaction-accounting-v2" as const;

export type CollectiveEvaluationRunnerV2 =
  "adaptive_collective" | "centralized_planner";

export type CollectiveEvaluationStratumV2 =
  "nominal" | "benign" | "adversarial" | "mixed";

export type CollectiveTraceComponentV2 =
  | "environment"
  | "runner"
  | "planning"
  | "mesh"
  | "governance"
  | "monitor"
  | "fault"
  | "evidence";

export type CollectiveTraceEventStatusV2 =
  "accepted" | "rejected" | "indeterminate" | "observed";

export type CollectiveTraceEventKindV2 =
  | "environment.initialized"
  | "environment.time.advanced"
  | "environment.observation.requested"
  | "environment.observation.delivered"
  | "environment.observation.rejected"
  | "peer.decision.accepted"
  | "role.decision.observed"
  | "peer.decision.rejected"
  | "runner.directive.delivered"
  | "planning.proposal"
  | "planning.decision"
  | "planning.supersession"
  | "mesh.message.prepared"
  | "mesh.message.delivered"
  | "mesh.message.rejected"
  | "work.created"
  | "work.revised"
  | "work.cancelled"
  | "allocation.offer"
  | "allocation.bid"
  | "allocation.award"
  | "allocation.accepted"
  | "allocation.declined"
  | "lease.renewed"
  | "lease.recovered"
  | "recovery.directive"
  | "work.checkpoint"
  | "work.result"
  | "trust.assessed"
  | "inference.assessed"
  | "policy.escalated"
  | "authority.grant"
  | "authority.reservation"
  | "authority.permit"
  | "effect.dispatch"
  | "environment.effect.attempted"
  | "environment.effect.committed"
  | "environment.effect.rejected"
  | "environment.effect.indeterminate"
  | "evidence.appended"
  | "evidence.rejected"
  | "fault.scheduled"
  | "fault.injected"
  | "fault.observed"
  | "monitor.terminal";

export type CollectiveInteractionKindV2 =
  | "message"
  | "decision"
  | "observation"
  | "directive"
  | "assessment"
  | "protected_action"
  | "escalation"
  | "recovery";

export interface CollectiveEvaluationLimitsV1 {
  readonly schemaVersion: 1;
  readonly maximumTraceEvents: number;
  readonly maximumTraceBytes: number;
  readonly maximumInteractions: number;
  readonly maximumCausalParents: number;
  readonly maximumObservationBatch: number;
  readonly maximumEnvironmentSnapshots: number;
  readonly maximumMonitorEvents: number;
  readonly maximumPublicArtifactBytes: number;
}

export interface CollectiveEvaluationRegistrationBindingV1 {
  readonly schemaVersion: 1;
  readonly registrationId: string;
  readonly registrationDigest: PlanningDigestV1;
  readonly tenantId: string;
  readonly missionIntentId: string;
  readonly intentRevision: number;
  readonly intentDigest: PlanningDigestV1;
  readonly runner: CollectiveEvaluationRunnerV2;
  readonly stratum: CollectiveEvaluationStratumV2;
  readonly seed: number;
  readonly environmentDigest: PlanningDigestV1;
  readonly observationPolicyDigest: PlanningDigestV1;
  readonly monitorDigest: PlanningDigestV1;
  readonly hiddenCanaryDigest: PlanningDigestV1;
  readonly limits: CollectiveEvaluationLimitsV1;
  readonly bindingDigest: PlanningDigestV1;
}

export interface CollectiveTraceFaultBindingV2 {
  readonly schemaVersion: 1;
  readonly faultFamily: string;
  readonly scheduleId: string;
  readonly injectionId: string;
}

export interface CollectiveTraceEventV2 {
  readonly schemaVersion: 2;
  readonly eventId: string;
  readonly causalParentIds: readonly string[];
  readonly registrationDigest: PlanningDigestV1;
  readonly seed: number;
  readonly runner: CollectiveEvaluationRunnerV2;
  readonly logicalTimeMs: number;
  readonly tenantId: string;
  readonly missionIntentId: string;
  readonly peerId: string | null;
  readonly component: CollectiveTraceComponentV2;
  readonly kind: CollectiveTraceEventKindV2;
  readonly status: CollectiveTraceEventStatusV2;
  readonly reasonCode: string | null;
  readonly recordDigest: PlanningDigestV1;
  readonly stateDigestBefore: PlanningDigestV1 | null;
  readonly stateDigestAfter: PlanningDigestV1 | null;
  readonly faultBinding: CollectiveTraceFaultBindingV2 | null;
  readonly accountingKind: CollectiveInteractionKindV2 | null;
  readonly accountingUnits: number;
  readonly previousTraceChainDigest: PlanningDigestV1 | null;
  readonly eventDigest: PlanningDigestV1;
  readonly traceChainDigest: PlanningDigestV1;
}

export interface CollectiveInteractionLedgerV2 {
  readonly schemaVersion: 2;
  readonly accountingVersion: typeof COLLECTIVE_INTERACTION_ACCOUNTING_VERSION_V2;
  readonly message: number;
  readonly decision: number;
  readonly observation: number;
  readonly directive: number;
  readonly assessment: number;
  readonly protected_action: number;
  readonly escalation: number;
  readonly recovery: number;
  readonly total: number;
  readonly maximumInteractions: number;
  readonly limitExceeded: boolean;
  readonly firstExceededEventId: string | null;
  readonly traceRoot: PlanningDigestV1 | null;
  readonly ledgerDigest: PlanningDigestV1;
}

export interface CollectiveTraceV2 {
  readonly format: "agentplat.collective-evaluation.trace";
  readonly schemaVersion: 2;
  readonly registrationDigest: PlanningDigestV1;
  readonly seed: number;
  readonly runner: CollectiveEvaluationRunnerV2;
  readonly events: readonly CollectiveTraceEventV2[];
  readonly ledger: CollectiveInteractionLedgerV2;
  readonly traceRoot: PlanningDigestV1 | null;
  readonly traceDigest: PlanningDigestV1;
}

export interface CreateCollectiveTraceEventInputV2 {
  readonly schemaVersion: 2;
  readonly eventId: string;
  readonly causalParentIds: readonly string[];
  readonly registrationDigest: PlanningDigestV1;
  readonly seed: number;
  readonly runner: CollectiveEvaluationRunnerV2;
  readonly logicalTimeMs: number;
  readonly tenantId: string;
  readonly missionIntentId: string;
  readonly peerId: string | null;
  readonly component: CollectiveTraceComponentV2;
  readonly kind: CollectiveTraceEventKindV2;
  readonly status: CollectiveTraceEventStatusV2;
  readonly reasonCode: string | null;
  readonly recordDigest: PlanningDigestV1;
  readonly stateDigestBefore: PlanningDigestV1 | null;
  readonly stateDigestAfter: PlanningDigestV1 | null;
  readonly faultBinding: CollectiveTraceFaultBindingV2 | null;
  readonly previousTraceChainDigest: PlanningDigestV1 | null;
}

export interface CollectiveEnvironmentInitializationV1 {
  readonly schemaVersion: 1;
  readonly initializationId: string;
  readonly registration: CollectiveEvaluationRegistrationBindingV1;
  readonly initializedAtLogicalMs: number;
  readonly initializationDigest: PlanningDigestV1;
}

export interface CollectiveEnvironmentInitializationReceiptV1 {
  readonly schemaVersion: 1;
  readonly initializationDigest: PlanningDigestV1;
  readonly status: "initialized" | "idempotent" | "rejected";
  readonly reasonCode: string | null;
  readonly logicalTimeMs: number;
  readonly environmentStateDigest: PlanningDigestV1;
  readonly receiptDigest: PlanningDigestV1;
}

export interface CollectiveEnvironmentObservationRequestV1 {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly registrationDigest: PlanningDigestV1;
  readonly missionIntentId: string;
  readonly intentRevision: number;
  readonly intentDigest: PlanningDigestV1;
  readonly peerId: string;
  readonly peerInstanceId: string;
  readonly environmentCursor: string;
  readonly maximumItems: number;
  readonly requestedAtLogicalMs: number;
  readonly requestDigest: PlanningDigestV1;
}

export interface CollectiveEnvironmentObservationReceiptV1 {
  readonly schemaVersion: 1;
  readonly requestDigest: PlanningDigestV1;
  readonly peerId: string;
  readonly peerInstanceId: string;
  readonly environmentCursor: string;
  readonly nextEnvironmentCursor: string;
  readonly observationDigests: readonly PlanningDigestV1[];
  readonly status: "delivered" | "idempotent" | "rejected";
  readonly reasonCode: string | null;
  readonly deliveredAtLogicalMs: number;
  readonly receiptDigest: PlanningDigestV1;
}

export interface CollectiveEnvironmentObservationResultV1 {
  readonly receipt: CollectiveEnvironmentObservationReceiptV1;
  readonly observations: readonly MissionObservationV1[];
}

export interface CollectiveProtectedEffectAttemptV1 {
  readonly schemaVersion: 1;
  readonly attemptId: string;
  readonly idempotencyKey: string;
  readonly registrationDigest: PlanningDigestV1;
  readonly tenantId: string;
  readonly missionIntentId: string;
  readonly intentRevision: number;
  readonly intentDigest: PlanningDigestV1;
  readonly peerId: string;
  readonly peerInstanceId: string;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly workContractId: string;
  readonly workContractDigest: PlanningDigestV1;
  readonly assignmentEpoch: number;
  readonly authorityGeneration: number;
  readonly fencingToken: string;
  readonly actionClass: string;
  readonly inputDigest: PlanningDigestV1;
  readonly attemptedAtLogicalMs: number;
  readonly attemptDigest: PlanningDigestV1;
}

export interface CollectiveProtectedEffectReceiptV1 {
  readonly schemaVersion: 1;
  readonly attemptDigest: PlanningDigestV1;
  readonly idempotencyKey: string;
  readonly effectId: string | null;
  readonly status: "committed" | "rejected" | "indeterminate";
  readonly reasonCode: string | null;
  readonly outputDigest: PlanningDigestV1 | null;
  readonly observedAtLogicalMs: number;
  readonly receiptDigest: PlanningDigestV1;
}

export interface CollectiveEnvironmentAdvanceRequestV1 {
  readonly schemaVersion: 1;
  readonly advanceId: string;
  readonly registrationDigest: PlanningDigestV1;
  readonly targetLogicalTimeMs: number;
  readonly advanceDigest: PlanningDigestV1;
}

export interface CollectiveEnvironmentAdvanceReceiptV1 {
  readonly schemaVersion: 1;
  readonly advanceDigest: PlanningDigestV1;
  readonly status: "advanced" | "idempotent" | "rejected";
  readonly reasonCode: string | null;
  readonly logicalTimeMs: number;
  readonly environmentStateDigest: PlanningDigestV1;
  readonly receiptDigest: PlanningDigestV1;
}

export interface CollectiveEnvironmentSnapshotHandleV1 {
  readonly format: "agentplat.collective-environment.snapshot-handle";
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly registrationDigest: PlanningDigestV1;
  readonly seed: number;
  readonly logicalTimeMs: number;
  readonly eventCount: number;
  readonly traceRoot: PlanningDigestV1 | null;
  readonly environmentStateDigest: PlanningDigestV1;
  readonly snapshotDigest: PlanningDigestV1;
}

export interface CollectiveEnvironmentRestoreReceiptV1 {
  readonly schemaVersion: 1;
  readonly snapshotDigest: PlanningDigestV1;
  readonly status: "restored" | "idempotent" | "rejected";
  readonly reasonCode: string | null;
  readonly logicalTimeMs: number;
  readonly environmentStateDigest: PlanningDigestV1;
  readonly receiptDigest: PlanningDigestV1;
}

export interface CollectiveEnvironmentLifecyclePortV1 {
  initialize(
    input: CollectiveEnvironmentInitializationV1
  ): CollectiveEnvironmentInitializationReceiptV1;
}

export interface CollectiveEnvironmentObservationPortV1 {
  observe(
    request: CollectiveEnvironmentObservationRequestV1
  ): CollectiveEnvironmentObservationResultV1;
}

export interface CollectiveEnvironmentEffectPortV1 {
  applyEffect(
    attempt: CollectiveProtectedEffectAttemptV1
  ): CollectiveProtectedEffectReceiptV1;
}

export interface CollectiveEnvironmentLogicalTimePortV1 {
  advance(
    request: CollectiveEnvironmentAdvanceRequestV1
  ): CollectiveEnvironmentAdvanceReceiptV1;
}

export interface CollectiveEnvironmentSnapshotPortV1 {
  snapshot(): CollectiveEnvironmentSnapshotHandleV1;
  restore(
    snapshot: CollectiveEnvironmentSnapshotHandleV1
  ): CollectiveEnvironmentRestoreReceiptV1;
}

export interface CollectiveEnvironmentPortV1
  extends
    CollectiveEnvironmentLifecyclePortV1,
    CollectiveEnvironmentObservationPortV1,
    CollectiveEnvironmentEffectPortV1,
    CollectiveEnvironmentLogicalTimePortV1,
    CollectiveEnvironmentSnapshotPortV1 {
  readonly version: typeof COLLECTIVE_ENVIRONMENT_PORT_VERSION_V1;
}

export type CollectiveInvariantMonitorEventKindV1 =
  | "observation.delivered"
  | "effect.committed"
  | "effect.duplicate"
  | "authorization.violation"
  | "plan_authority.violation"
  | "stale_fence.violation"
  | "hidden_state.violation"
  | "global_membership.violation"
  | "direct_assignment.violation"
  | "synthetic_ledger.violation"
  | "constant_metric.violation"
  | "canary_leak.violation"
  | "terminal.failure";

export interface CollectiveInvariantRequiredEffectV1 {
  readonly schemaVersion: 1;
  readonly effectId: string;
  readonly outcomeUnits: number;
  readonly objectiveValue: number;
}

export interface CollectiveInvariantMonitorPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly registrationDigest: PlanningDigestV1;
  readonly requiredEffects: readonly CollectiveInvariantRequiredEffectV1[];
  readonly hiddenCanaryDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
}

export interface CollectiveInvariantMonitorEventV1 {
  readonly schemaVersion: 1;
  readonly monitorEventId: string;
  readonly registrationDigest: PlanningDigestV1;
  readonly traceEventId: string | null;
  readonly logicalTimeMs: number;
  readonly kind: CollectiveInvariantMonitorEventKindV1;
  readonly effectId: string | null;
  readonly violationCode: string | null;
  readonly recordDigest: PlanningDigestV1;
  readonly previousMonitorEventDigest: PlanningDigestV1 | null;
  readonly monitorEventDigest: PlanningDigestV1;
}

export interface CollectiveInvariantMonitorVerdictV1 {
  readonly schemaVersion: 1;
  readonly registrationDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly traceRoot: PlanningDigestV1 | null;
  readonly monitorEventRoot: PlanningDigestV1 | null;
  readonly missionSuccess: boolean;
  readonly partialSuccessUnits: number;
  readonly objectiveValue: number;
  readonly authorizationViolations: number;
  readonly planAuthorityViolations: number;
  readonly staleFenceViolations: number;
  readonly duplicateEffectViolations: number;
  readonly hiddenStateViolations: number;
  readonly globalMembershipViolations: number;
  readonly directAssignmentViolations: number;
  readonly syntheticLedgerViolations: number;
  readonly constantMetricViolations: number;
  readonly canaryLeakViolations: number;
  readonly terminalReason: string;
  readonly firstViolationEventId: string | null;
  readonly verdictDigest: PlanningDigestV1;
}

export interface CollectiveInvariantMonitorSnapshotV1 {
  readonly format: "agentplat.collective-invariant-monitor.snapshot";
  readonly schemaVersion: 1;
  readonly registrationDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly events: readonly CollectiveInvariantMonitorEventV1[];
  readonly traceRoot: PlanningDigestV1 | null;
  readonly snapshotDigest: PlanningDigestV1;
}

export interface CollectiveInvariantMonitorV1 {
  readonly version: typeof COLLECTIVE_INVARIANT_MONITOR_PORT_VERSION_V1;
  record(event: CollectiveInvariantMonitorEventV1): void;
  finalize(
    traceRoot: PlanningDigestV1 | null
  ): CollectiveInvariantMonitorVerdictV1;
  snapshot(
    traceRoot: PlanningDigestV1 | null
  ): CollectiveInvariantMonitorSnapshotV1;
  restore(snapshot: CollectiveInvariantMonitorSnapshotV1): void;
}

export interface CollectiveEvaluationBoundaryEvidenceV1 {
  readonly format: "agentplat.collective-evaluation.boundary-evidence";
  readonly schemaVersion: 1;
  readonly registration: CollectiveEvaluationRegistrationBindingV1;
  readonly trace: CollectiveTraceV2;
  readonly monitorPolicy: CollectiveInvariantMonitorPolicyV1;
  readonly monitorEvents: readonly CollectiveInvariantMonitorEventV1[];
  readonly monitorVerdict: CollectiveInvariantMonitorVerdictV1;
  readonly publicArtifactDigests: readonly PlanningDigestV1[];
  readonly evidenceDigest: PlanningDigestV1;
}

export type CollectiveEnvironmentBoundaryFindingCodeV1 =
  | "runner_port_shape_invalid"
  | "runner_port_forbidden_member"
  | "hidden_canary_exposed"
  | "trace_ledger_mismatch"
  | "monitor_verdict_mismatch";

export interface CollectiveEnvironmentBoundaryFindingV1 {
  readonly schemaVersion: 1;
  readonly code: CollectiveEnvironmentBoundaryFindingCodeV1;
  readonly detail: string;
}

export interface CollectiveEnvironmentBoundaryAuditV1 {
  readonly schemaVersion: 1;
  readonly passed: boolean;
  readonly findings: readonly CollectiveEnvironmentBoundaryFindingV1[];
}

export type CollectivePublicArtifactV1 = PlanningJson;
