import type {
  AssessorEnsembleDecisionV1,
  AssessorEnsembleModalityV1,
  AssessorEnsembleVerdictV1,
} from "./assessor-ensemble-contracts.js";
import type {
  InferenceInterventionAssessmentV1,
  InferenceInterventionOperationGateResultV1,
} from "./intervention-contracts.js";

export const SEMANTIC_ALIGNMENT_AGILITY_SCHEMA_VERSION_V1 = 1 as const;
export const SEMANTIC_ALIGNMENT_AGILITY_STATE_FORMAT_V1 =
  "application/vnd.agentplat.semantic-alignment-agility.v1+json" as const;

export const SEMANTIC_CONTROL_CHECKPOINTS_V1 = Object.freeze([
  "pre_step",
  "post_output",
  "pre_action",
] as const);
export type SemanticControlCheckpointV1 =
  (typeof SEMANTIC_CONTROL_CHECKPOINTS_V1)[number];

export const SEMANTIC_CONTROL_DIMENSIONS_V1 = Object.freeze([
  "role_coherence",
  "mission_alignment",
  "context_conflict",
  "uncertainty",
  "course_action_diversity",
  "course_action_novelty",
] as const);
export type SemanticControlDimensionV1 =
  (typeof SEMANTIC_CONTROL_DIMENSIONS_V1)[number];

export type SemanticControlDispositionV1 =
  | "allow"
  | "steer"
  | "block"
  | "abstain";
export type SemanticConstraintViolationV1 =
  | "role_constraint"
  | "mission_constraint";
export type SemanticAssessorBasisV1 =
  | "application_semantic_model"
  | "provider_semantic_model"
  | "representation_model"
  | "structured_policy"
  | "reference_digest_heuristic";

export interface SemanticControlThresholdsV1 {
  readonly minimumRoleCoherenceBps: number;
  readonly minimumMissionAlignmentBps: number;
  readonly maximumContextConflictBps: number;
  readonly maximumUncertaintyBps: number;
  readonly minimumCourseActionDiversityBps: number;
  readonly minimumCourseActionNoveltyBps: number;
}

export interface SemanticControlLimitsV1 {
  readonly maximumAssessors: number;
  readonly maximumReasonCodes: number;
  readonly maximumEvidenceDigests: number;
  readonly maximumCourseActionCandidates: number;
  readonly maximumCourseActionHistory: number;
  readonly maximumRetainedDecisions: number;
  readonly maximumCommitAttempts: number;
  readonly maximumSequence: number;
  readonly maximumLogicalTimeMs: number;
  readonly maximumActionPayloadBytes: number;
  readonly actionAuthorizationTtlMs: number;
  readonly assessorTimeoutMs: number;
}

export interface SemanticControlPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly thresholds: SemanticControlThresholdsV1;
  /** Quorum is counted by independence group, never raw assessor count. */
  readonly minimumIndependenceGroups: number;
  readonly minimumGroupsPerDimension: number;
  /** Only these assessors may assert a categorical hard-constraint breach. */
  readonly enforcingAssessorIds: readonly string[];
  readonly limits: SemanticControlLimitsV1;
  readonly policyDigest: string;
}

export interface SemanticControlBindingV1 {
  readonly schemaVersion: 1;
  readonly bindingId: string;
  readonly missionId: string;
  readonly roleId: string;
  readonly agentId: string;
  readonly sessionId: string;
  readonly missionAnchorDigest: string;
  readonly roleAnchorDigest: string;
  readonly authorityDigest: string;
  readonly bindingDigest: string;
}

export interface SemanticAssessorDescriptorV1 {
  readonly schemaVersion: 1;
  readonly assessorId: string;
  readonly assessorVersion: number;
  readonly assessorImplementationDigest: string;
  readonly independenceGroup: string;
  readonly basis: SemanticAssessorBasisV1;
  readonly supportedDimensions: readonly SemanticControlDimensionV1[];
  readonly descriptorDigest: string;
}

/** The handle is volatile; materialDigest is its content-bound durable identity. */
export interface SemanticControlRequestV1 {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly checkpoint: SemanticControlCheckpointV1;
  readonly bindingDigest: string;
  readonly missionAnchorDigest: string;
  readonly roleAnchorDigest: string;
  readonly authorityDigest: string;
  readonly sequence: number;
  readonly step: number;
  readonly logicalTimeMs: number;
  readonly targetDigest: string;
  readonly contextDigest: string;
  readonly selectedCourseActionDigest: string | null;
  readonly candidateCourseActionDigests: readonly string[];
  readonly priorCourseActionDigests: readonly string[];
  readonly modalities: readonly AssessorEnsembleModalityV1[];
  readonly materialDigest: string;
  /** Required only at pre_action and bound to the exact volatile payload. */
  readonly actionPayloadDigest: string | null;
  readonly materialHandle: string;
  readonly requestDigest: string;
}

export interface SemanticMetricVectorV1 {
  readonly roleCoherenceBps: number | null;
  readonly missionAlignmentBps: number | null;
  readonly contextConflictBps: number | null;
  readonly uncertaintyBps: number | null;
  readonly courseActionDiversityBps: number | null;
  readonly courseActionNoveltyBps: number | null;
}

/** Content-free, bounded output from an application/provider semantic port. */
export interface SemanticAssessorAssessmentV1 {
  readonly schemaVersion: 1;
  readonly requestDigest: string;
  readonly assessorId: string;
  readonly assessorVersion: number;
  readonly assessorImplementationDigest: string;
  readonly independenceGroup: string;
  readonly metrics: SemanticMetricVectorV1;
  readonly hardConstraintViolations: readonly SemanticConstraintViolationV1[];
  readonly recommendation: SemanticControlDispositionV1;
  readonly reasonCodes: readonly string[];
  readonly evidenceDigests: readonly string[];
  readonly assessmentDigest: string;
}

export interface SemanticAssessorPortV1 {
  readonly descriptor: SemanticAssessorDescriptorV1;
  /** The port must resolve materialHandle and verify material against the bound digests. */
  assess(
    request: SemanticControlRequestV1,
  ): Promise<SemanticAssessorAssessmentV1> | SemanticAssessorAssessmentV1;
}

export interface SemanticAggregateAssessmentV1 {
  readonly schemaVersion: 1;
  readonly requestDigest: string;
  readonly disposition: SemanticControlDispositionV1;
  readonly metrics: SemanticMetricVectorV1;
  readonly hardConstraintViolations: readonly SemanticConstraintViolationV1[];
  readonly countedAssessorIds: readonly string[];
  readonly countedIndependenceGroups: readonly string[];
  readonly dimensionGroupCounts: Readonly<Record<SemanticControlDimensionV1, number>>;
  readonly missingAssessorIds: readonly string[];
  readonly reasonCodes: readonly string[];
  readonly evidenceDigests: readonly string[];
  readonly assessmentDigest: string;
}

/** Narrow structural port implemented by HeterogeneousAssessorEnsembleRuntimeV1. */
export interface SemanticControlEnsemblePortV1 {
  /** Durable identity used to reconstruct and bind the exact ensemble request. */
  readonly bindingDigest: string;
  readonly policyDigest: string;
  assess(input: {
    readonly invocationId: string;
    readonly signalDigest: string;
    readonly executionDomain: "inference" | "action";
    readonly surface: "input" | "output" | "action";
    readonly modalities: readonly AssessorEnsembleModalityV1[];
    readonly step: number;
    readonly logicalTimeMs: number;
  }): Promise<{ readonly verdict: AssessorEnsembleVerdictV1 }>;
  /** Authenticated durable lookup; a canonical digest alone is insufficient. */
  verifyVerdict(input: {
    readonly requestDigest: string;
    readonly verdictDigest: string;
  }): Promise<boolean>;
}

/** Narrow structural port implemented by HeterogeneousInferenceInterventionRuntimeV1. */
export interface SemanticControlInterventionPortV1 {
  /** Durable identity used to bind the returned terminal intervention state. */
  readonly bindingDigest: string;
  readonly policyDigest: string;
  gateOperation(input: {
    readonly operationId: string;
    readonly kind: "action";
    readonly step: number;
    readonly logicalTimeMs: number;
    readonly payload: string;
  }): Promise<InferenceInterventionOperationGateResultV1>;
  /** Authenticated durable lookup for the exact terminal operation state. */
  verifyOperationGate(input: {
    readonly operationId: string;
    readonly step: number;
    readonly logicalTimeMs: number;
    readonly payload: string;
    readonly stateDigest: string;
    readonly allowed: boolean;
  }): Promise<boolean>;
}

export interface SemanticControlDecisionV1 {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly requestDigest: string;
  readonly checkpoint: SemanticControlCheckpointV1;
  readonly disposition: SemanticControlDispositionV1;
  readonly proceed: boolean;
  readonly aggregate: SemanticAggregateAssessmentV1;
  readonly ensembleDecision: AssessorEnsembleDecisionV1 | null;
  readonly ensembleVerdictDigest: string | null;
  readonly interventionAllowed: boolean | null;
  readonly interventionAssessmentDigests: readonly string[];
  readonly reasonCodes: readonly string[];
  readonly priorStateRevision: number;
  readonly committedStateRevision: number;
  readonly decisionDigest: string;
}

export interface SemanticControlDecisionRecordV1 {
  readonly schemaVersion: 1;
  readonly requestDigest: string;
  readonly checkpoint: SemanticControlCheckpointV1;
  readonly sequence: number;
  readonly disposition: SemanticControlDispositionV1;
  readonly aggregateAssessmentDigest: string;
  readonly decisionDigest: string;
}

export interface SemanticControlStateV1 {
  readonly format: typeof SEMANTIC_ALIGNMENT_AGILITY_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: string;
  readonly bindingDigest: string;
  readonly policyDigest: string;
  readonly assessorSetDigest: string;
  readonly revision: number;
  readonly sequenceHighWater: number;
  readonly logicalTimeHighWaterMs: number;
  readonly courseActionHistory: readonly string[];
  readonly recentDecisions: readonly SemanticControlDecisionRecordV1[];
  readonly lastDecision: SemanticControlDecisionV1 | null;
  readonly predecessorStateDigest: string | null;
  readonly stateDigest: string;
}

export interface SemanticControlStateStoreV1 {
  load(stateKey: string): Promise<SemanticControlStateV1 | null>;
  /** Production save must atomically advance the anchor exposed below. */
  save(input: {
    readonly state: SemanticControlStateV1;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: string | null;
  }): Promise<boolean>;
}

export interface SemanticControlMonotonicAnchorV1 {
  readAnchor(stateKey: string): Promise<{
    readonly revision: number;
    readonly sequenceHighWater: number;
    readonly logicalTimeHighWaterMs: number;
    readonly stateDigest: string;
  } | null>;
}

export interface SemanticControlEvaluationInputV1 {
  readonly request: SemanticControlRequestV1;
  /** Volatile; its digest must equal request.actionPayloadDigest at pre_action. */
  readonly interventionPayload?: string;
}

/** Canonical claims submitted to a trusted receipt authority after an allow. */
export interface SemanticActionAuthorizationClaimsV1 {
  readonly schemaVersion: 1;
  readonly authorizationId: string;
  readonly requestDigest: string;
  readonly decisionDigest: string;
  readonly bindingDigest: string;
  readonly authorityDigest: string;
  readonly policyDigest: string;
  readonly assessorSetDigest: string;
  readonly effectConsumerDigest: string;
  /** Exact shared idempotency domain authorized to perform the effect. */
  readonly sinkId: string;
  readonly sinkKeyDigest: string;
  readonly targetDigest: string;
  readonly materialDigest: string;
  readonly actionPayloadDigest: string;
  readonly sequence: number;
  readonly committedStateRevision: number;
  readonly validFromLogicalTimeMs: number;
  readonly validUntilLogicalTimeMs: number;
  readonly claimsDigest: string;
}

/**
 * Content-free authenticated receipt delivered to an action sink. Its digest
 * is only authoritative after lookup through the configured authority port.
 */
export interface SemanticActionAuthorizationV1 {
  readonly schemaVersion: 1;
  readonly claims: SemanticActionAuthorizationClaimsV1;
  readonly issuerId: string;
  readonly issuerKeyDigest: string;
  readonly authorizationDigest: string;
}

/** Trusted durable lookup/signature boundary; raw SHA digests are not proof. */
export interface SemanticActionAuthorizationAuthorityV1 {
  readonly issuerId: string;
  readonly issuerKeyDigest: string;
  issue(
    claims: SemanticActionAuthorizationClaimsV1,
  ): Promise<SemanticActionAuthorizationV1>;
  lookupAndVerify(input: {
    readonly authorizationId: string;
    readonly authorizationDigest?: string;
    readonly expectedClaimsDigest?: string;
    readonly effectConsumerDigest: string;
    readonly sinkId: string;
    readonly sinkKeyDigest: string;
    readonly currentLogicalTimeMs: number;
    readonly currentStateRevision: number;
  }): Promise<SemanticActionAuthorizationV1 | null>;
}

export interface SemanticActionAuthorizationBoundaryV1 {
  readonly effectConsumerDigest: string;
  /** All replicas for this identity must share one atomic idempotency store. */
  readonly sinkId: string;
  readonly sinkKeyDigest: string;
  readonly authority: SemanticActionAuthorizationAuthorityV1;
}

/**
 * Content-free stable receipt returned for both first use and retries. Its
 * digest is authoritative only after `SemanticActionEffectSinkV1.verifyReceipt`.
 */
export interface SemanticActionEffectReceiptV1 {
  readonly schemaVersion: 1;
  readonly authorizationDigest: string;
  readonly effectConsumerDigest: string;
  readonly sinkId: string;
  readonly sinkKeyDigest: string;
  readonly outcomeDigest: string;
  readonly committedAtLogicalTimeMs: number;
  readonly receiptDigest: string;
}

/**
 * The sink must atomically key the external effect by authorizationDigest.
 * Exact retries return the original receipt without repeating the effect.
 */
export interface SemanticActionEffectSinkV1 {
  readonly sinkId: string;
  readonly sinkKeyDigest: string;
  readonly effectConsumerDigest: string;
  applyOnce(input: {
    readonly authorization: SemanticActionAuthorizationV1;
    readonly targetDigest: string;
    readonly actionPayloadDigest: string;
  }): Promise<SemanticActionEffectReceiptV1>;
  verifyReceipt(receipt: SemanticActionEffectReceiptV1): Promise<boolean>;
}

export interface SemanticControlRuntimeOptionsV1 {
  readonly binding: SemanticControlBindingV1;
  readonly policy: SemanticControlPolicyV1;
  readonly assessors: readonly SemanticAssessorPortV1[];
  readonly store?: SemanticControlStateStoreV1;
  readonly monotonicAnchor?: SemanticControlMonotonicAnchorV1;
  readonly ensemble?: SemanticControlEnsemblePortV1;
  readonly intervention?: SemanticControlInterventionPortV1;
  readonly actionAuthorization?: SemanticActionAuthorizationBoundaryV1;
}

export interface SemanticControlRuntimePortV1 {
  evaluate(input: SemanticControlEvaluationInputV1): Promise<SemanticControlDecisionV1>;
  preStep(input: SemanticControlEvaluationInputV1): Promise<SemanticControlDecisionV1>;
  postOutput(input: SemanticControlEvaluationInputV1): Promise<SemanticControlDecisionV1>;
  preAction(input: SemanticControlEvaluationInputV1): Promise<SemanticControlDecisionV1>;
  runStep<T>(
    input: SemanticControlEvaluationInputV1,
    run: () => Promise<T> | T,
  ): Promise<{ readonly decision: SemanticControlDecisionV1; readonly value: T | null }>;
  releaseOutput<T>(
    input: SemanticControlEvaluationInputV1,
    release: () => Promise<T> | T,
  ): Promise<{ readonly decision: SemanticControlDecisionV1; readonly value: T | null }>;
  authorizeAction(
    input: SemanticControlEvaluationInputV1,
  ): Promise<{ readonly decision: SemanticControlDecisionV1; readonly authorization: SemanticActionAuthorizationV1 | null }>;
  verifyActionAuthorization(input: {
    readonly authorizationId: string;
    readonly authorizationDigest?: string;
    readonly expectedTargetDigest: string;
    readonly expectedActionPayloadDigest: string;
    /** Must originate from a trusted monotonic logical-time source. */
    readonly currentLogicalTimeMs: number;
  }): Promise<SemanticActionAuthorizationV1>;
  dispatchAuthorizedAction(
    input: {
      readonly authorizationId: string;
      readonly authorizationDigest?: string;
      readonly expectedTargetDigest: string;
      readonly expectedActionPayloadDigest: string;
      /** Must originate from a trusted monotonic logical-time source. */
      readonly currentLogicalTimeMs: number;
    },
    sink: SemanticActionEffectSinkV1,
  ): Promise<{ readonly authorization: SemanticActionAuthorizationV1; readonly effectReceipt: SemanticActionEffectReceiptV1 }>;
  dispatchAction(
    input: SemanticControlEvaluationInputV1,
    /** Trusted time of the effect attempt, independent of request.logicalTimeMs. */
    currentLogicalTimeMs: number,
    sink: SemanticActionEffectSinkV1,
  ): Promise<{ readonly decision: SemanticControlDecisionV1; readonly authorization: SemanticActionAuthorizationV1 | null; readonly effectReceipt: SemanticActionEffectReceiptV1 | null }>;
  getState(): Promise<SemanticControlStateV1 | null>;
}

export type SemanticInterventionAssessmentDigestSourceV1 =
  Pick<InferenceInterventionAssessmentV1, "assessmentDigest">;
