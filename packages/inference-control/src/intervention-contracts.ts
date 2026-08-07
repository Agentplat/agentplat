/**
 * Provider-neutral contracts for enforcing bounded inference interventions.
 * Payloads are deliberately represented by digests in durable records.
 */
export const HETEROGENEOUS_INFERENCE_INTERVENTION_SCHEMA_VERSION_V1 =
  1 as const;
export const HETEROGENEOUS_INFERENCE_INTERVENTION_STATE_FORMAT_V1 =
  "application/vnd.agentplat.heterogeneous-inference-intervention.v1+json" as const;

export const INFERENCE_INTERVENTION_AGENT_CLASSES_V1 = Object.freeze([
  "opaque_api_model",
  "token_stream_model",
  "representation_sidecar_model",
  "portable_agent",
  "multimodal_action_agent",
] as const);
export type InferenceInterventionAgentClassV1 =
  (typeof INFERENCE_INTERVENTION_AGENT_CLASSES_V1)[number];

/** Closed capability vocabulary. Unknown capabilities are never negotiated. */
export const INFERENCE_INTERVENTION_CAPABILITIES_V1 = Object.freeze([
  "pre_input_filter",
  "context_filter",
  "role_reinforcement",
  "token_assessment",
  "window_assessment",
  "output_gate",
  "tool_gate",
  "action_gate",
  "representation_intervention",
  "multimodal_input_filter",
  "trusted_transformation",
] as const);
export type InferenceInterventionCapabilityV1 =
  (typeof INFERENCE_INTERVENTION_CAPABILITIES_V1)[number];

export type InferenceInterventionDecisionV1 =
  "allow" | "modify" | "block" | "unavailable";

export interface InferenceInterventionAdapterDescriptorV1 {
  readonly schemaVersion: 1;
  readonly adapterId: string;
  readonly adapterVersion: number;
  readonly adapterImplementationDigest: string;
  readonly agentClass: InferenceInterventionAgentClassV1;
  readonly capabilities: readonly InferenceInterventionCapabilityV1[];
  readonly descriptorDigest: string;
}

export interface InferenceInterventionBindingV1 {
  readonly schemaVersion: 1;
  readonly bindingId: string;
  readonly missionId: string;
  readonly agentId: string;
  readonly sessionId: string;
  readonly roleId: string;
  readonly modelOrAdapterId: string;
  readonly modelOrAdapterDigest: string;
  readonly authorityDigest: string;
  readonly fence: number;
  readonly bindingDigest: string;
}

export interface InferenceInterventionBudgetV1 {
  readonly maximumInterventions: number;
  readonly maximumRepresentationRequests: number;
  readonly cooldownLogicalMs: number;
  readonly recoveryClearAssessments: number;
  readonly maximumCasAttempts: number;
}

export interface InferenceInterventionThresholdsV1 {
  readonly blockRiskBps: number;
  readonly interventionRiskBps: number;
  readonly maximumUncertaintyBps: number;
  readonly minimumRoleCoherenceBps: number;
}

export interface InferenceInterventionPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
  readonly requiredCapabilities: readonly InferenceInterventionCapabilityV1[];
  readonly thresholds: InferenceInterventionThresholdsV1;
  readonly budget: InferenceInterventionBudgetV1;
  readonly maximumStep: number;
  readonly maximumWindowTokens: number;
  readonly sidecarTimeoutMs: number;
}

/** Volatile payload supplied to an assessor; it must not be saved by the runtime. */
export interface InferenceInterventionSignalV1 {
  readonly kind:
    | "input"
    | "context"
    | "multimodal_input"
    | "token"
    | "window"
    | "output"
    | "tool"
    | "action";
  readonly content: string;
  readonly contentDigest: string;
}

export interface InferenceInterventionModalityPartV1 {
  readonly kind: "text" | "image" | "audio" | "video" | "sensor";
  readonly contentDigest: string;
  /** Optional volatile locator or provider handle; it is never persisted. */
  readonly payloadHandle?: string;
}

export interface InferenceInterventionTransformationRequestV1 {
  readonly schemaVersion: 1;
  readonly bindingDigest: string;
  readonly policyDigest: string;
  readonly inputDigest: string;
  readonly signalDigest: string;
  readonly assessmentDigest: string;
  readonly requestDigest: string;
}
export interface InferenceInterventionTransformationReceiptV1 {
  readonly schemaVersion: 1;
  readonly requestDigest: string;
  readonly transformerId: string;
  readonly transformerVersion: number;
  readonly transformerImplementationDigest: string;
  readonly transformedManifestDigest: string;
  readonly receiptDigest: string;
}
/** Trusted local transformation. The transformed payload remains volatile. */
export interface InferenceInterventionTransformationPortV1 {
  readonly transformerId: string;
  readonly transformerVersion: number;
  readonly transformerImplementationDigest: string;
  /** Repeated calls with the same requestDigest must be idempotent. */
  transform(input: {
    readonly request: InferenceInterventionTransformationRequestV1;
    readonly source: string;
    readonly context: readonly string[];
    readonly modalityParts: readonly InferenceInterventionModalityPartV1[];
  }): Promise<{
    readonly input: string;
    readonly context?: readonly string[];
    readonly modalityParts?: readonly InferenceInterventionModalityPartV1[];
    readonly receipt: InferenceInterventionTransformationReceiptV1;
  }>;
}

export interface InferenceInterventionAssessmentV1 {
  readonly schemaVersion: 1;
  readonly assessorId: string;
  readonly assessorVersion: number;
  readonly assessorImplementationDigest: string;
  readonly decision: InferenceInterventionDecisionV1;
  readonly riskBps: number;
  readonly uncertaintyBps: number;
  readonly roleCoherenceBps: number;
  readonly reasonCodes: readonly string[];
  readonly evidenceDigests: readonly string[];
  readonly assessmentDigest: string;
}

export interface InferenceInterventionAssessorPortV1 {
  readonly assessorId: string;
  readonly assessorVersion: number;
  readonly assessorImplementationDigest: string;
  assess(input: {
    readonly binding: InferenceInterventionBindingV1;
    readonly policy: InferenceInterventionPolicyV1;
    readonly step: number;
    readonly signal: InferenceInterventionSignalV1;
  }):
    | Promise<InferenceInterventionAssessmentV1>
    | InferenceInterventionAssessmentV1;
}

/** Transport-neutral contract for a local or remote representation sidecar. */
export interface RepresentationInterventionRequestV1 {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly bindingDigest: string;
  readonly policyDigest: string;
  readonly inputDigest: string;
  readonly step: number;
  readonly requestedAtLogicalMs: number;
  readonly requestDigest: string;
}
export interface RepresentationInterventionReceiptV1 {
  readonly schemaVersion: 1;
  readonly requestDigest: string;
  readonly sidecarId: string;
  readonly sidecarVersion: number;
  readonly sidecarImplementationDigest: string;
  readonly result: "applied" | "not_applied" | "rejected";
  readonly receiptDigest: string;
}
export interface RepresentationInterventionSidecarPortV1 {
  readonly sidecarId: string;
  readonly sidecarVersion: number;
  readonly sidecarImplementationDigest: string;
  /** Must observe an aborted signal before applying; cancellation remains cooperative. */
  intervene(
    request: RepresentationInterventionRequestV1,
    options: { readonly signal: AbortSignal },
  ): Promise<RepresentationInterventionReceiptV1>;
}

export interface InferenceInterventionInvocationV1 {
  readonly invocationId: string;
  readonly executionDomain: "inference" | "tool" | "action";
  readonly binding: InferenceInterventionBindingV1;
  readonly policy: InferenceInterventionPolicyV1;
  readonly step: number;
  readonly logicalTimeMs: number;
  readonly input: string;
  readonly inputDigest: string;
  readonly context: readonly string[];
  readonly modalityParts?: readonly InferenceInterventionModalityPartV1[];
  readonly roleReinforcement: string | null;
  readonly requireRepresentationReceipt: boolean;
}

export interface InferenceInterventionAdapterV1 {
  readonly descriptor: InferenceInterventionAdapterDescriptorV1;
  invoke(
    input: InferenceInterventionInvocationV1,
  ): Promise<InferenceInterventionAdapterResultV1>;
}
export interface InferenceInterventionAdapterResultV1 {
  readonly output?: string;
  readonly tokens?: AsyncIterable<string>;
}

export interface InferenceInterventionStateV1 {
  readonly format: typeof HETEROGENEOUS_INFERENCE_INTERVENTION_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: string;
  readonly bindingDigest: string;
  readonly policyDigest: string;
  readonly adapterDescriptorDigest: string;
  readonly revision: number;
  readonly stateDigest: string;
  readonly logicalTimeHighWaterMs: number;
  readonly stepHighWater: number;
  readonly fence: number;
  readonly interventionsUsed: number;
  readonly representationRequestsUsed: number;
  readonly cooldownUntilLogicalMs: number;
  readonly consecutiveClearAssessments: number;
  readonly lastInvocationDigest: string | null;
  readonly activeInvocation: InferenceInterventionReservationV1 | null;
  readonly lastInvocation: InferenceInterventionTerminalV1 | null;
  readonly unresolvedEffect: InferenceInterventionUnresolvedEffectV1 | null;
}
export interface InferenceInterventionReservationV1 {
  readonly invocationId: string;
  readonly invocationDigest: string;
  readonly step: number;
  readonly executionDomain: "inference" | "tool" | "action";
}
export interface InferenceInterventionTerminalV1 {
  readonly invocationId: string;
  readonly invocationDigest: string;
  readonly step: number;
  readonly executionDomain: "inference" | "tool" | "action";
  readonly decision: "allowed" | "blocked";
  readonly outputDigest: string | null;
}
export interface InferenceInterventionUnresolvedEffectV1 {
  readonly kind: "prepared_crash" | "sidecar_ambiguous";
  readonly invocationId: string;
  readonly invocationDigest: string;
  readonly executionDomain: "inference" | "tool" | "action";
  readonly step: number;
  readonly sidecarRequestDigest: string | null;
}

export interface InferenceInterventionReconciliationRequestV1 {
  readonly schemaVersion: 1;
  readonly stateKey: string;
  readonly bindingDigest: string;
  readonly policyDigest: string;
  readonly invocationId: string;
  readonly invocationDigest: string;
  readonly executionDomain: "inference" | "tool" | "action";
  readonly step: number;
  readonly unresolvedKind: "prepared_crash" | "sidecar_ambiguous";
  readonly sidecarRequestDigest: string | null;
  readonly resolution:
    "confirmed_not_applied" | "confirmed_applied_and_contained";
  readonly authorizationDigest: string;
  readonly reconciledAtLogicalMs: number;
  readonly requestDigest: string;
}
export interface InferenceInterventionReconciliationReceiptV1 {
  readonly schemaVersion: 1;
  readonly requestDigest: string;
  readonly reconcilerId: string;
  readonly reconcilerVersion: number;
  readonly reconcilerImplementationDigest: string;
  readonly resolution: InferenceInterventionReconciliationRequestV1["resolution"];
  readonly receiptDigest: string;
}
export interface InferenceInterventionReconciliationPortV1 {
  readonly reconcilerId: string;
  readonly reconcilerVersion: number;
  readonly reconcilerImplementationDigest: string;
  reconcile(
    request: InferenceInterventionReconciliationRequestV1,
  ): Promise<InferenceInterventionReconciliationReceiptV1>;
}
export interface InferenceInterventionReconcileInputV1 {
  readonly invocationId: string;
  readonly invocationDigest: string;
  readonly executionDomain: "inference" | "tool" | "action";
  readonly step: number;
  readonly resolution: InferenceInterventionReconciliationRequestV1["resolution"];
  readonly authorizationDigest: string;
  readonly logicalTimeMs: number;
}
export interface InferenceInterventionStateStoreV1 {
  read(stateKey: string): Promise<InferenceInterventionStateV1 | null>;
  compareAndSet(input: {
    readonly stateKey: string;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: string | null;
    readonly next: InferenceInterventionStateV1;
  }): Promise<boolean>;
}
/** Separate append-only or independently protected high-water source. */
export interface InferenceInterventionMonotonicAnchorV1 {
  readAnchor(stateKey: string): Promise<{
    readonly revision: number;
    readonly interventionsUsed: number;
    readonly representationRequestsUsed: number;
  } | null>;
}

export interface InferenceInterventionResultV1 {
  readonly decision: "allowed" | "blocked";
  readonly output: string | null;
  readonly outputDigest: string | null;
  readonly receipt: RepresentationInterventionReceiptV1 | null;
  readonly assessments: readonly InferenceInterventionAssessmentV1[];
  readonly state: InferenceInterventionStateV1;
}

/** Call immediately before dispatching a tool or real-world action. */
export interface InferenceInterventionOperationGateRequestV1 {
  readonly operationId: string;
  readonly kind: "tool" | "action";
  readonly step: number;
  readonly logicalTimeMs: number;
  readonly payload: string;
}
export interface InferenceInterventionOperationGateResultV1 {
  readonly allowed: boolean;
  readonly assessments: readonly InferenceInterventionAssessmentV1[];
  readonly state: InferenceInterventionStateV1;
}
