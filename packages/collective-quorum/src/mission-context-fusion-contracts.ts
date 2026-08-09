import type { MissionObservationV1 } from "@agentplat/collective-planning";
import type {
  EvidenceFusionDecisionV1,
  TrustEligibilityDecisionV1,
  TrustProfileV1,
} from "@agentplat/trust";

import type {
  CertifiedCollectiveTrustDecisionV1,
  CollectiveTrustCertificationPortV1,
} from "./trust-consensus-contracts.js";

export const MISSION_CONTEXT_FUSION_SCHEMA_VERSION_V1 = 1 as const;

export type MissionContextFusionDispositionV1 =
  | "admitted"
  | "contested"
  | "rejected"
  | "quarantined";

export interface MissionContextFusionScopeV1 {
  readonly tenantId: string;
  readonly meshId: string;
  readonly missionIntentId: string;
  readonly intentRevision: number;
  readonly intentDigest: string;
  readonly policyDomainId: string;
  readonly scopeDigest: string;
}

/** Exact Trust projections produced from one bounded context evidence set. */
export interface MissionContextFusionRequestV1 {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly scope: MissionContextFusionScopeV1;
  readonly contextSubjectDigest: string;
  readonly contextReferenceDigest: string;
  readonly observerPeerId: string;
  readonly observerInstanceId: string;
  readonly environmentCursor: string;
  readonly fusionDecision: EvidenceFusionDecisionV1;
  readonly profile: TrustProfileV1;
  readonly eligibilityDecision: TrustEligibilityDecisionV1;
  readonly requiredDimensionIds: readonly string[];
  readonly previousResolutionDigest: string | null;
  readonly previousCertifiedDecisionDigest: string | null;
  readonly observedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
  readonly requestDigest: string;
}

/** Content-free, Byzantine-certified context projection consumed by planning. */
export interface CertifiedMissionContextResolutionV1 {
  readonly schemaVersion: 1;
  readonly resolutionId: string;
  readonly resolutionDigest: string;
  readonly requestId: string;
  readonly requestDigest: string;
  readonly scope: MissionContextFusionScopeV1;
  readonly contextSubjectDigest: string;
  readonly contextReferenceDigest: string;
  readonly observerPeerId: string;
  readonly observerInstanceId: string;
  readonly environmentCursor: string;
  readonly evidenceSetDigest: string;
  readonly profileDigest: string;
  readonly fusionDecisionDigest: string;
  readonly certifiedTrustDecisionDigest: string;
  readonly trustPolicyId: string;
  readonly trustPolicyVersion: number;
  readonly trustPolicyDigest: string;
  readonly disposition: MissionContextFusionDispositionV1;
  readonly conservativeScoreBps: number;
  readonly maximumUncertaintyBps: number;
  readonly maximumContradictionPressureBps: number;
  readonly consideredRecordCount: number;
  readonly includedRecordCount: number;
  readonly independentSourceGroupCount: number;
  readonly requiredDimensionIds: readonly string[];
  readonly witnessPeerIds: readonly string[];
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: string;
  readonly previousResolutionDigest: string | null;
  readonly observedAtLogicalMs: number;
  readonly certifiedAtLogicalMs: number;
  readonly validUntilLogicalMs: number;
}

export type MissionContextFusionSaveResultV1 =
  | "stored"
  | "duplicate"
  | "conflict"
  | "stale_head";

export interface MissionContextFusionRepositoryV1 {
  head(input: {
    readonly tenantId: string;
    readonly missionIntentId: string;
    readonly contextSubjectDigest: string;
  }): Promise<CertifiedMissionContextResolutionV1 | null>;
  get(resolutionDigest: string): Promise<CertifiedMissionContextResolutionV1 | null>;
  save(input: {
    readonly resolution: CertifiedMissionContextResolutionV1;
    readonly expectedHeadDigest: string | null;
  }): Promise<MissionContextFusionSaveResultV1>;
}

export interface MissionContextFusionPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly minimumIndependentSourceGroups: number;
  readonly minimumScoreBps: number;
  readonly maximumUncertaintyBps: number;
  readonly maximumContradictionPressureBps: number;
  readonly rejectRestrictedContext: boolean;
  readonly maximumValidityMs: number;
}

/** Trusted monotonic logical clock used for every certification decision. */
export interface MissionContextFusionClockV1 {
  now(): { readonly logicalTimeMs: number };
}

/**
 * Authenticates the application-owned mapping from the visible mission intent
 * scope to the Trust scope digest. Returning true must mean that the digest
 * cannot be replayed under another mission intent or intent revision.
 */
export interface MissionContextFusionScopeBindingPortV1 {
  verify(input: {
    readonly scope: MissionContextFusionScopeV1;
    readonly trustScopeDigest: string;
    readonly requestDigest: string;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
}

export interface MissionContextFusionRuntimeOptionsV1 {
  readonly policy: MissionContextFusionPolicyV1;
  readonly certification: CollectiveTrustCertificationPortV1;
  readonly repository: MissionContextFusionRepositoryV1;
  readonly clock: MissionContextFusionClockV1;
  readonly scopeBinding: MissionContextFusionScopeBindingPortV1;
  readonly crypto?: Crypto;
}

export interface MissionContextFusionPortV1 {
  resolve(
    request: MissionContextFusionRequestV1,
  ): Promise<CertifiedMissionContextResolutionV1 | null>;
}

export interface MissionContextPlanningObservationInputV1 {
  /** Opaque content address; callers cannot supply resolution material inline. */
  readonly resolutionDigest: string;
  readonly observationId: string;
  readonly observationKind: string;
  readonly logicalTimeMs: number;
}

/**
 * Application-owned certificate authentication boundary used immediately before
 * a certified context is projected into planning. Returning true means the
 * exact retained decision, including membership and commit provenance, has been
 * reauthenticated for the supplied logical time.
 */
export interface MissionContextPlanningCertificationPortV1 {
  reauthenticate(input: {
    readonly resolution: CertifiedMissionContextResolutionV1;
    readonly decision: CertifiedCollectiveTrustDecisionV1;
    readonly logicalTimeMs: number;
  }): Promise<boolean>;
}

export interface MissionContextPlanningAdapterOptionsV1 {
  /** Trusted resolution repository; the current head is checked on every use. */
  readonly repository: Pick<MissionContextFusionRepositoryV1, "get" | "head">;
  /** Trusted content-addressed certificate repository. */
  readonly certifiedDecisions: {
    get(
      decisionDigest: string,
    ): Promise<CertifiedCollectiveTrustDecisionV1 | null>;
  };
  readonly certification: MissionContextPlanningCertificationPortV1;
  readonly scopeBinding: MissionContextFusionScopeBindingPortV1;
  readonly crypto?: Crypto;
}

export interface MissionContextPlanningPortV1 {
  observation(
    input: MissionContextPlanningObservationInputV1,
  ): Promise<MissionObservationV1 | null>;
}

export interface MissionContextCertifiedTrustBindingV1 {
  readonly decision: CertifiedCollectiveTrustDecisionV1;
}
