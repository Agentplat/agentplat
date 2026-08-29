import type { JsonObject } from "@agentplat/core";

import type { AutonomyDigestV1 } from "./canonical.js";

export type AutonomyLevelV1 =
  "blocked" | "propose_only" | "approve_all" | "approve_sample" | "autonomous";

export interface AutonomyPolicyV1 {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly segmentNamespace: string;
  readonly initialLevel: "blocked" | "propose_only";
  readonly maximumLevel: AutonomyLevelV1;
  readonly minimumConcludedOutcomes: number;
  readonly minimumPositiveBasisPoints: number;
  readonly maximumNegativeBasisPoints: number;
  readonly maximumCorrectedBasisPoints: number;
  readonly maximumUnresolvedBasisPoints: number;
  readonly consecutiveHealthyWindows: number;
  readonly promotionCooldownMs: number;
  readonly sampleApprovalBasisPoints: number;
  readonly criticalReasonCodes: readonly string[];
  readonly criticalDegradationLevel: "blocked" | "propose_only" | "approve_all";
  readonly coverageFailureLevel?: "blocked" | "propose_only" | "approve_all";
  readonly maximumDecisionHistory: number;
  readonly policyDigest: AutonomyDigestV1;
}

export type AutonomyPolicyInputV1 = Omit<
  AutonomyPolicyV1,
  "schemaVersion" | "policyDigest"
>;

export interface AutonomyEvidenceCursorV1 {
  readonly recordedAt: string;
  readonly outcomeId: string;
}

export interface AutonomyEvidenceWindowV1 {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly segmentNamespace: string;
  readonly segmentKey: string;
  readonly segmentDigest: AutonomyDigestV1;
  readonly actionType: string;
  readonly sourceId: string;
  readonly sourceRevision: number;
  readonly windowSequence: number;
  readonly observedFrom: string;
  readonly observedThrough: string;
  readonly coverageStatus: "healthy" | "insufficient" | "stale" | "unavailable";
  readonly eligibleTaskRuns: number;
  readonly concludedOutcomes: number;
  readonly positive: number;
  readonly negative: number;
  readonly corrected: number;
  readonly inconclusive: number;
  readonly unresolvedTaskRuns: number;
  readonly reasonCounts: Readonly<Record<string, number>>;
  readonly cursor: AutonomyEvidenceCursorV1 | null;
  readonly evidenceReferenceIds: readonly string[];
  readonly evidenceDigest: AutonomyDigestV1;
}

export type AutonomyEvidenceWindowInputV1 = Omit<
  AutonomyEvidenceWindowV1,
  "schemaVersion" | "segmentDigest" | "evidenceDigest"
>;

export interface AutonomyDecisionHistoryV1 {
  readonly decisionId: string;
  readonly actionProposalDigest: AutonomyDigestV1;
  readonly disposition: AutonomyDecisionDispositionV1;
  readonly level: AutonomyLevelV1;
  readonly reasonCode: string;
  readonly evidenceDigest: AutonomyDigestV1;
  readonly decidedAt: string;
  readonly decisionDigest: AutonomyDigestV1;
}

export interface AutonomyStateV1 {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: AutonomyDigestV1;
  readonly segmentNamespace: string;
  readonly segmentKey: string;
  readonly segmentDigest: AutonomyDigestV1;
  readonly actionType: string;
  readonly revision: number;
  readonly level: AutonomyLevelV1;
  readonly levelEpoch: number;
  readonly consecutiveHealthyWindows: number;
  readonly cooldownUntil: string | null;
  readonly lastEvidenceSequence: number | null;
  readonly lastEvidenceDigest: AutonomyDigestV1 | null;
  readonly lastEvidenceCursor: AutonomyEvidenceCursorV1 | null;
  readonly latestCoverageStatus: AutonomyEvidenceWindowV1["coverageStatus"];
  readonly lastCriticalReasonCode: string | null;
  readonly decisionHistory: readonly AutonomyDecisionHistoryV1[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly stateDigest: AutonomyDigestV1;
}

export type AutonomyDecisionDispositionV1 =
  "deny" | "proposal_only" | "require_approval" | "eligible";

export interface AutonomyDecisionV1 {
  readonly schemaVersion: 1;
  readonly decisionId: string;
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: AutonomyDigestV1;
  readonly segmentDigest: AutonomyDigestV1;
  readonly actionType: string;
  readonly actionProposalDigest: AutonomyDigestV1;
  readonly stateRevision: number | null;
  readonly level: AutonomyLevelV1 | null;
  readonly disposition: AutonomyDecisionDispositionV1;
  readonly sampledForApproval: boolean;
  readonly reasonCode: string;
  readonly evidenceDigest: AutonomyDigestV1 | null;
  readonly decidedAt: string;
  readonly decisionDigest: AutonomyDigestV1;
}

export interface AutonomyEvaluationInputV1 {
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly segmentNamespace: string;
  readonly segmentKey: string;
  readonly actionType: string;
  readonly actionProposalDigest: AutonomyDigestV1;
  readonly evidence: AutonomyEvidenceWindowV1;
  readonly logicalTime: string;
  readonly metadata?: JsonObject;
}

export interface AutonomyStoreV1 {
  registerPolicy(policy: AutonomyPolicyV1): Promise<"created" | "replayed">;
  getPolicy(
    tenantId: string,
    policyDomainId: string,
    policyId: string,
    policyVersion: number,
  ): Promise<AutonomyPolicyV1 | undefined>;
  initializeState(state: AutonomyStateV1): Promise<boolean>;
  loadState(input: {
    readonly tenantId: string;
    readonly policyDomainId: string;
    readonly policyId: string;
    readonly segmentDigest: AutonomyDigestV1;
    readonly actionType: string;
  }): Promise<AutonomyStateV1 | undefined>;
  compareAndSet(input: {
    readonly expectedRevision: number;
    readonly expectedStateDigest: AutonomyDigestV1;
    readonly state: AutonomyStateV1;
    readonly decision: AutonomyDecisionV1;
  }): Promise<boolean>;
  listDecisions(input: {
    readonly tenantId: string;
    readonly policyDomainId: string;
    readonly segmentDigest?: AutonomyDigestV1;
  }): Promise<AutonomyDecisionV1[]>;
}
