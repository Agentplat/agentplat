/** Provider-neutral, content-free governance contracts for local sparse-overlay adaptation. */
export const MESH_ADAPTIVE_OVERLAY_SCHEMA_VERSION_V1 = 1 as const;

export type MeshAdaptiveOverlayDigestV1 = `sha256:${string}`;
export type MeshAdaptiveOverlayDecisionV1 =
  | "observed"
  | "certified"
  | "applied"
  | "duplicate"
  | "stale"
  | "conflict"
  | "rejected";

/** Current topology bindings that every signal and certificate must carry. */
export interface MeshAdaptiveOverlayBindingV1 {
  readonly schemaVersion: 1;
  readonly overlayId: string;
  readonly localPeerIndex: number;
  readonly membershipDigest: MeshAdaptiveOverlayDigestV1;
  readonly profileDigest: MeshAdaptiveOverlayDigestV1;
  readonly viewDigest: MeshAdaptiveOverlayDigestV1;
  readonly revision: number;
  readonly bindingDigest: MeshAdaptiveOverlayDigestV1;
}

/** An authenticated observation. Its subject is deliberately a digest, never payload content. */
export interface MeshAdaptiveOverlaySignalV1 {
  readonly schemaVersion: 1;
  readonly signalId: string;
  readonly binding: MeshAdaptiveOverlayBindingV1;
  readonly observerPeerId: string;
  readonly observerGroupId: string;
  /** Exact peer whose local reachability is being evaluated. */
  readonly subjectPeerIndex: number;
  readonly subjectDigest: MeshAdaptiveOverlayDigestV1;
  readonly kind: "unreachable" | "degraded" | "policy_violation";
  readonly observedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly authentication: {
    readonly algorithm: string;
    readonly value: string;
  };
  readonly signalDigest: MeshAdaptiveOverlayDigestV1;
}

export interface MeshAdaptiveOverlayObserverV1 {
  readonly peerId: string;
  readonly groupId: string;
}

/** The threshold counts independent observer groups, not raw reports. */
export interface MeshAdaptiveOverlayPolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyRevision: number;
  readonly observers: readonly MeshAdaptiveOverlayObserverV1[];
  readonly independentGroupThreshold: number;
  readonly maximumSignalLifetimeMs: number;
  readonly maximumExcludedNeighbors: number;
  readonly validUntilLogicalMs: number;
  readonly policyDigest: MeshAdaptiveOverlayDigestV1;
}

/** A proposal is a request for a local deterministic view refresh, not authority to mutate topology. */
export interface MeshAdaptiveOverlayProposalV1 {
  readonly schemaVersion: 1;
  readonly proposalId: string;
  readonly binding: MeshAdaptiveOverlayBindingV1;
  readonly policy: MeshAdaptiveOverlayPolicyV1;
  readonly excludedNeighborIndexes: readonly number[];
  readonly signalDigests: readonly MeshAdaptiveOverlayDigestV1[];
  readonly proposedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly proposalDigest: MeshAdaptiveOverlayDigestV1;
}

export interface MeshAdaptiveOverlayCertificateV1 {
  readonly schemaVersion: 1;
  readonly certificateId: string;
  readonly proposalId: string;
  readonly proposalDigest: MeshAdaptiveOverlayDigestV1;
  readonly binding: MeshAdaptiveOverlayBindingV1;
  readonly policy: MeshAdaptiveOverlayPolicyV1;
  readonly policyDigest: MeshAdaptiveOverlayDigestV1;
  /** Same-index tuples: signal digest, authenticating peer, independence group. */
  readonly signalDigests: readonly MeshAdaptiveOverlayDigestV1[];
  readonly observerPeerIds: readonly string[];
  readonly observerGroupIds: readonly string[];
  readonly issuedAtLogicalMs: number;
  readonly expiresAtLogicalMs: number;
  readonly certificateDigest: MeshAdaptiveOverlayDigestV1;
}

export interface MeshAdaptiveOverlayAppliedViewV1 {
  readonly schemaVersion: 1;
  readonly certificateDigest: MeshAdaptiveOverlayDigestV1;
  readonly binding: MeshAdaptiveOverlayBindingV1;
  readonly resultingViewDigest: MeshAdaptiveOverlayDigestV1;
  readonly resultingRevision: number;
  readonly appliedAtLogicalMs: number;
  readonly applicationDigest: MeshAdaptiveOverlayDigestV1;
}

export interface MeshAdaptiveOverlayStateV1 {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly policyDigest: MeshAdaptiveOverlayDigestV1;
  readonly currentBinding: MeshAdaptiveOverlayBindingV1;
  readonly applied: MeshAdaptiveOverlayAppliedViewV1 | null;
  readonly signals: readonly MeshAdaptiveOverlaySignalV1[];
  readonly proposals: readonly MeshAdaptiveOverlayProposalV1[];
  readonly certificates: readonly MeshAdaptiveOverlayCertificateV1[];
  readonly conflicts: readonly MeshAdaptiveOverlayDigestV1[];
  readonly lastLogicalTimeMs: number;
  readonly stateDigest: MeshAdaptiveOverlayDigestV1;
}

export interface MeshAdaptiveOverlayStoreV1 {
  load(overlayId: string): Promise<MeshAdaptiveOverlayStateV1 | undefined>;
  compareAndSwap(input: {
    readonly overlayId: string;
    readonly expectedRevision: number | null;
    readonly expectedStateDigest: MeshAdaptiveOverlayDigestV1 | null;
    readonly next: MeshAdaptiveOverlayStateV1;
  }): Promise<boolean>;
}

export interface MeshAdaptiveOverlaySignalVerifierV1 {
  readonly verifierId: string;
  verify(signal: MeshAdaptiveOverlaySignalV1): boolean | Promise<boolean>;
}

/** Authenticates a remotely issued certificate and its exact proposal. */
export interface MeshAdaptiveOverlayCertificateVerifierV1 {
  readonly verifierId: string;
  verify(input: {
    readonly certificate: MeshAdaptiveOverlayCertificateV1;
    readonly proposal: MeshAdaptiveOverlayProposalV1;
  }): boolean | Promise<boolean>;
}

/** Rollback-resistant head kept outside the replaceable state snapshot. */
export interface MeshAdaptiveOverlayMonotonicAnchorV1 {
  readAnchor(overlayId: string): Promise<
    | {
        readonly revision: number;
        readonly bindingRevision: number;
        readonly lastLogicalTimeMs: number;
        readonly stateDigest: MeshAdaptiveOverlayDigestV1;
      }
    | undefined
  >;
}

export interface MeshAdaptiveOverlayRuntimeOptionsV1 {
  /** Locally installed authority; remote proposals cannot replace it. */
  readonly policy: MeshAdaptiveOverlayPolicyV1;
  readonly store: MeshAdaptiveOverlayStoreV1;
  readonly verifier: MeshAdaptiveOverlaySignalVerifierV1;
  readonly certificateVerifier: MeshAdaptiveOverlayCertificateVerifierV1;
  readonly monotonicAnchor?: MeshAdaptiveOverlayMonotonicAnchorV1;
  readonly maximumSignals?: number;
  readonly maximumProposals?: number;
  readonly maximumCertificates?: number;
}

export interface MeshAdaptiveOverlayResultV1 {
  readonly decision: MeshAdaptiveOverlayDecisionV1;
  readonly reasonCode: string;
  readonly state: MeshAdaptiveOverlayStateV1;
  readonly certificate?: MeshAdaptiveOverlayCertificateV1;
  readonly applied?: MeshAdaptiveOverlayAppliedViewV1;
}
