/**
 * Content-free, provider-neutral contracts for a heterogeneous assessor
 * ensemble. Durable records contain only identifiers and digests.
 */
export const HETEROGENEOUS_ASSESSOR_ENSEMBLE_SCHEMA_VERSION_V1 = 1 as const;
export const HETEROGENEOUS_ASSESSOR_ENSEMBLE_STATE_FORMAT_V1 =
  "application/vnd.agentplat.heterogeneous-assessor-ensemble.v1+json" as const;

export const ASSESSOR_ENSEMBLE_AGENT_CLASSES_V1 = Object.freeze([
  "opaque_api_model",
  "token_stream_model",
  "representation_sidecar_model",
  "portable_agent",
  "multimodal_action_agent",
] as const);
export type AssessorEnsembleAgentClassV1 =
  (typeof ASSESSOR_ENSEMBLE_AGENT_CLASSES_V1)[number];

export const ASSESSOR_ENSEMBLE_SURFACES_V1 = Object.freeze([
  "input",
  "output",
  "token",
  "tool",
  "action",
  "sidecar",
] as const);
export type AssessorEnsembleSurfaceV1 =
  (typeof ASSESSOR_ENSEMBLE_SURFACES_V1)[number];

export const ASSESSOR_ENSEMBLE_MODALITIES_V1 = Object.freeze([
  "text",
  "image",
  "audio",
  "video",
  "sensor",
] as const);
export type AssessorEnsembleModalityV1 =
  (typeof ASSESSOR_ENSEMBLE_MODALITIES_V1)[number];

export type AssessorEnsembleVoteDecisionV1 =
  "allow" | "modify" | "block" | "unresolved";
/** Ensemble verdicts preserve a consensus modification recommendation. */
export type AssessorEnsembleDecisionV1 = AssessorEnsembleVoteDecisionV1;
export type AssessorEnsembleExecutionDomainV1 = "inference" | "tool" | "action";

export interface AssessorEnsembleMemberDescriptorV1 {
  readonly schemaVersion: 1;
  readonly assessorId: string;
  readonly assessorVersion: number;
  readonly assessorImplementationDigest: string;
  /** A quorum counts at most one vote from each independence group. */
  readonly independenceGroup: string;
  readonly agentClass: AssessorEnsembleAgentClassV1;
  readonly surfaces: readonly AssessorEnsembleSurfaceV1[];
  readonly modalities: readonly AssessorEnsembleModalityV1[];
  readonly descriptorDigest: string;
}

export interface AssessorEnsemblePolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: string;
  readonly minimumVotes: number;
  readonly minimumIndependenceGroups: number;
  readonly requiredSurfaces: readonly AssessorEnsembleSurfaceV1[];
  readonly requiredModalities: readonly AssessorEnsembleModalityV1[];
  readonly assessorTimeoutMs: number;
  readonly maximumMembers: number;
  readonly maximumCasAttempts: number;
  readonly maximumStep: number;
  readonly maximumLogicalTimeMs: number;
}

/** Content is owned by callers and never part of this request or state. */
export interface AssessorEnsembleRequestV1 {
  readonly schemaVersion: 1;
  readonly invocationId: string;
  readonly bindingDigest: string;
  readonly policyDigest: string;
  readonly signalDigest: string;
  readonly executionDomain: AssessorEnsembleExecutionDomainV1;
  readonly surface: AssessorEnsembleSurfaceV1;
  readonly modalities: readonly AssessorEnsembleModalityV1[];
  readonly step: number;
  readonly logicalTimeMs: number;
  readonly requestDigest: string;
}

export interface AssessorEnsembleVoteV1 {
  readonly schemaVersion: 1;
  /** Prevents a valid vote from being replayed into another invocation. */
  readonly requestDigest: string;
  readonly assessorId: string;
  readonly assessorVersion: number;
  readonly assessorImplementationDigest: string;
  readonly independenceGroup: string;
  readonly decision: AssessorEnsembleVoteDecisionV1;
  readonly reasonCodes: readonly string[];
  readonly evidenceDigests: readonly string[];
  readonly voteDigest: string;
}

export interface AssessorEnsembleVerdictV1 {
  readonly schemaVersion: 1;
  readonly requestDigest: string;
  readonly decision: AssessorEnsembleDecisionV1;
  readonly votes: readonly AssessorEnsembleVoteV1[];
  readonly countedAssessorIds: readonly string[];
  readonly countedIndependenceGroups: readonly string[];
  readonly missingAssessorIds: readonly string[];
  readonly coverageComplete: boolean;
  readonly verdictDigest: string;
}

export interface AssessorEnsemblePortV1 {
  readonly descriptor: AssessorEnsembleMemberDescriptorV1;
  assess(
    request: AssessorEnsembleRequestV1,
  ): Promise<AssessorEnsembleVoteV1> | AssessorEnsembleVoteV1;
}

export interface AssessorEnsembleReservationV1 {
  readonly invocationId: string;
  readonly requestDigest: string;
  readonly step: number;
  readonly executionDomain: AssessorEnsembleExecutionDomainV1;
  readonly logicalTimeMs: number;
}
export interface AssessorEnsembleTerminalV1 {
  readonly invocationId: string;
  readonly requestDigest: string;
  readonly step: number;
  readonly executionDomain: AssessorEnsembleExecutionDomainV1;
  readonly verdict: AssessorEnsembleVerdictV1;
}
export interface AssessorEnsembleStateV1 {
  readonly format: typeof HETEROGENEOUS_ASSESSOR_ENSEMBLE_STATE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly stateKey: string;
  readonly bindingDigest: string;
  readonly policyDigest: string;
  readonly memberSetDigest: string;
  readonly revision: number;
  readonly logicalTimeHighWaterMs: number;
  readonly stepHighWater: number;
  readonly stateDigest: string;
  readonly activeInvocation: AssessorEnsembleReservationV1 | null;
  readonly lastInvocation: AssessorEnsembleTerminalV1 | null;
}
export interface AssessorEnsembleStateStoreV1 {
  read(stateKey: string): Promise<AssessorEnsembleStateV1 | null>;
  compareAndSet(input: {
    readonly stateKey: string;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: string | null;
    readonly next: AssessorEnsembleStateV1;
  }): Promise<boolean>;
}
export interface AssessorEnsembleMonotonicAnchorV1 {
  readAnchor(stateKey: string): Promise<{
    readonly revision: number;
    readonly logicalTimeHighWaterMs: number;
    readonly stepHighWater: number;
  } | null>;
}

/** A narrow adapter for use directly before a tool or action dispatch. */
export interface AssessorEnsembleOperationGateRequestV1 {
  readonly invocationId: string;
  readonly bindingDigest: string;
  readonly signalDigest: string;
  readonly kind: "tool" | "action";
  readonly modalities: readonly AssessorEnsembleModalityV1[];
  readonly step: number;
  readonly logicalTimeMs: number;
}
export interface AssessorEnsembleOperationGateResultV1 {
  readonly allowed: boolean;
  readonly verdict: AssessorEnsembleVerdictV1;
  readonly state: AssessorEnsembleStateV1;
}
