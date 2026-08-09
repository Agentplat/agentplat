import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import type {
  MultiDomainEnvironmentDescriptorV1,
  MultiDomainScenarioManifestV1,
} from "./multi-domain-environment-contracts.js";
import type { ShardedSimulationScaleProfileV1 } from "./sharded-simulation-contracts.js";

/** Public, provider-neutral descriptor. adapterId is intentionally open for third parties. */
export interface EvaluationParticipantDescriptorV1 {
  readonly schemaVersion: 1;
  readonly adapterId: string;
  readonly adapterVersion: number;
  readonly coordinationModel: "centralized" | "collective";
  readonly implementationDigest: PlanningDigestV1;
  readonly capabilities: readonly string[];
  readonly descriptorDigest: PlanningDigestV1;
}

export interface EvaluationParticipantAdapterV1 {
  readonly descriptor: EvaluationParticipantDescriptorV1;
}

/** Locks a replayable build to exact source and artifact bytes without storing either. */
export interface BenchmarkArtifactSourceLockV1 {
  readonly schemaVersion: 1;
  readonly sourceId: string;
  readonly sourceDigest: PlanningDigestV1;
  readonly artifactId: string;
  readonly artifactDigest: PlanningDigestV1;
  readonly buildDigest: PlanningDigestV1;
  readonly lockDigest: PlanningDigestV1;
}

/**
 * A suite is one paired, replayable scenario. The scale profile, seed, and
 * resource budget are copied from the scenario so they cannot drift at score time.
 */
export interface BenchmarkSuiteManifestV1 {
  readonly schemaVersion: 1;
  readonly suiteId: string;
  readonly suiteVersion: number;
  readonly environmentDescriptorDigest: PlanningDigestV1;
  readonly scenarioManifest: MultiDomainScenarioManifestV1;
  readonly scaleProfile: ShardedSimulationScaleProfileV1;
  readonly seed: number;
  readonly resourceBudgetDigest: PlanningDigestV1;
  readonly baselineParticipant: EvaluationParticipantDescriptorV1;
  readonly baselineArtifactLock: BenchmarkArtifactSourceLockV1;
  readonly manifestDigest: PlanningDigestV1;
}

/** Evaluator-visible trace facts. Participants never submit a score projection. */
export interface BenchmarkTraceEvidenceV1 {
  readonly schemaVersion: 1;
  readonly traceId: string;
  readonly participantDescriptorDigest: PlanningDigestV1;
  readonly scenarioManifestDigest: PlanningDigestV1;
  readonly artifactLockDigest: PlanningDigestV1;
  readonly interactionCount: number;
  readonly successfulObjectiveCount: number;
  readonly recoveryToBaselineCount: number;
  readonly roleCoherenceLength: number;
  readonly traceDigest: PlanningDigestV1;
}

/**
 * Trusted evaluator boundary. Structural digests make evidence tamper-evident;
 * this port establishes that the bound evaluator actually observed the run.
 */
export interface BenchmarkTraceEvidenceVerifierV1 {
  readonly verifierId: string;
  verify(input: {
    readonly role: "candidate" | "baseline";
    readonly traceEvidence: BenchmarkTraceEvidenceV1;
    readonly participantDescriptor: EvaluationParticipantDescriptorV1;
    readonly artifactLock: BenchmarkArtifactSourceLockV1;
    readonly suiteManifest: BenchmarkSuiteManifestV1;
  }): boolean;
}

/** Evaluator-only projection. It is derived from BenchmarkTraceEvidenceV1. */
export interface MetricProjectionV2 {
  readonly schemaVersion: 2;
  readonly traceDigest: PlanningDigestV1;
  readonly interactionCount: number;
  readonly successRateBps: number;
  readonly recoveryRateBps: number;
  readonly coherenceRateBps: number;
  readonly compositeScoreBps: number;
  readonly projectionDigest: PlanningDigestV1;
}

export interface PairedBaselineEvidenceV1 {
  readonly schemaVersion: 1;
  readonly participantDescriptor: EvaluationParticipantDescriptorV1;
  readonly artifactLock: BenchmarkArtifactSourceLockV1;
  readonly traceEvidence: BenchmarkTraceEvidenceV1;
  readonly replayDigest: PlanningDigestV1;
}

export interface VerifiedBenchmarkSubmissionV1 {
  readonly schemaVersion: 1;
  readonly submissionId: string;
  readonly participantDescriptor: EvaluationParticipantDescriptorV1;
  readonly artifactLock: BenchmarkArtifactSourceLockV1;
  readonly suiteManifest: BenchmarkSuiteManifestV1;
  readonly traceEvidence: BenchmarkTraceEvidenceV1;
  readonly replayDigest: PlanningDigestV1;
  readonly pairedBaseline: PairedBaselineEvidenceV1;
  readonly submissionDigest: PlanningDigestV1;
}

export type BenchmarkIneligibilityReasonV1 =
  | "submission_invalid"
  | "artifact_lock_mismatch"
  | "trace_binding_mismatch"
  | "budget_exceeded"
  | "replay_binding_mismatch"
  | "baseline_binding_mismatch"
  | "baseline_replay_mismatch"
  | "trace_provenance_unverified"
  | "baseline_provenance_unverified"
  | "baseline_budget_exceeded"
  | "suite_binding_mismatch"
  | "duplicate_submission"
  | "replayed_trace";

export interface VerifiedBenchmarkVerificationV1 {
  readonly schemaVersion: 1;
  readonly eligible: boolean;
  readonly evidenceVerifierId: string;
  readonly submissionDigest: PlanningDigestV1 | null;
  readonly participantDescriptorDigest: PlanningDigestV1 | null;
  readonly metricProjection: MetricProjectionV2 | null;
  readonly reason: BenchmarkIneligibilityReasonV1 | null;
  readonly verificationDigest: PlanningDigestV1;
}

export interface VerifiedBenchmarkLeaderboardEntryV1 {
  readonly schemaVersion: 1;
  readonly rank: number;
  readonly submissionId: string;
  readonly participantDescriptorDigest: PlanningDigestV1;
  readonly metricProjection: MetricProjectionV2;
  readonly entryDigest: PlanningDigestV1;
}

export interface VerifiedBenchmarkIneligibleSubmissionV1 {
  readonly schemaVersion: 1;
  readonly submissionDigest: PlanningDigestV1 | null;
  readonly reason: BenchmarkIneligibilityReasonV1;
  readonly recordDigest: PlanningDigestV1;
}

export interface VerifiedBenchmarkLeaderboardV1 {
  readonly schemaVersion: 1;
  readonly entries: readonly VerifiedBenchmarkLeaderboardEntryV1[];
  /** Deliberately separated: an ineligible submission never has a rank. */
  readonly ineligibleSubmissions: readonly VerifiedBenchmarkIneligibleSubmissionV1[];
  readonly leaderboardDigest: PlanningDigestV1;
}
