import type {
  MeshMessagePayload,
  VerifiedMeshEnvelope,
} from "@agentplat/mesh-protocol";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import type {
  JointWorkContractV1,
  TeamActivationRequestV1,
  TeamFormationDecisionV1,
  TeamFormationPortV1,
  TeamFormationRequestV1,
} from "./team-formation-contracts.js";
import type {
  TeamExecutionPolicyRecordV1,
  TeamExecutionPortV1,
  TeamExecutionRecordV1,
  TeamExecutionStartRequestV1,
  TeamExecutionStateV1,
  TeamExecutionStepCommandV1,
} from "./team-execution-contracts.js";
import type {
  TeamExecutionContinuityCheckpointRequestV1,
  TeamExecutionContinuityCheckpointV1,
  TeamExecutionContinuityPortV1,
  TeamExecutionContinuityTakeoverRequestV1,
  TeamExecutionContinuityTakeoverResultV1,
} from "./team-execution-continuity-contracts.js";
import type {
  TeamStructureAdaptationDecisionV1,
  TeamStructureAdaptationPortV1,
  TeamStructureAdaptationRequestV1,
  TeamStructureAdaptationStateV1,
  TeamStructureFormationAdapterInputV1,
  TeamStructureMaterializationV1,
  TeamStructureObservationV1,
  TeamStructurePositionBindingV1,
  TeamStructureTemplateCatalogV1,
} from "./team-structure-adaptation-contracts.js";

/** A transport-neutral, deliberately small host surface for one collective peer. */
export const COLLECTIVE_PEER_HOST_SCHEMA_VERSION = 1 as const;

export type CollectivePeerHostRouteKindV1 = "node" | "exchange";

export type CollectivePeerHostTopologyFreshnessV1 =
  "fresh" | "stale" | "unknown";

export interface CollectivePeerHostRouteV1 {
  readonly kind: CollectivePeerHostRouteKindV1;
  /** A stable, local route name; it does not grant any remote authority. */
  readonly routeId: string;
  readonly criticalExtension: string | null;
}

export interface CollectivePeerHostAdmissionV1 {
  readonly status: "accepted" | "duplicate" | "rejected";
  /** `accepted` and `duplicate` mean an inbox record was durably admitted. */
  readonly durable: boolean;
  readonly reasonCode: string | null;
}

export interface CollectivePeerHostDispatchV1 {
  readonly status: "dispatched" | "idle" | "paused" | "failed";
  readonly reasonCode: string | null;
}

/**
 * A route owns its own durable inbox, CAS and business state. The host only
 * coordinates delivery and retains a minimal replay cursor.
 */
export interface CollectivePeerHostRoutePortV1 {
  readonly route: CollectivePeerHostRouteV1;
  admit(input: {
    readonly envelope: VerifiedMeshEnvelope;
    readonly receivedAt: string;
  }): Promise<CollectivePeerHostAdmissionV1>;
  dispatch(input: {
    readonly signal?: AbortSignal;
  }): Promise<CollectivePeerHostDispatchV1>;
  /** A bounded local estimate used only for host backpressure. */
  pending(): Promise<number> | number;
}

export interface CollectivePeerHostEnvelopeVerifierV1 {
  verify(input: unknown): Promise<VerifiedMeshEnvelope | null>;
}

export interface CollectivePeerHostTopologyPortV1 {
  freshness():
    | Promise<CollectivePeerHostTopologyFreshnessV1>
    | CollectivePeerHostTopologyFreshnessV1;
}

export interface CollectivePeerHostAdmissionClaimV1 {
  readonly messageId: string;
  readonly routeId: string;
  /** Digest of the verified Mesh signing document, including payloadHash. */
  readonly envelopeIdentityDigest: PlanningDigestV1;
  readonly status: "claimed" | "admitted";
  readonly claimedAt: string;
  readonly admittedAt: string | null;
}

export interface CollectivePeerHostClaimOutcomeV1 {
  readonly acquired: boolean;
  readonly claim: CollectivePeerHostAdmissionClaimV1;
}

/**
 * This store must be durable and shared by every worker of one logical host.
 * `claim` atomically binds a message to one route before route admission;
 * `complete` resolves only after the admitted cursor is durable.
 */
export interface CollectivePeerHostClaimPortV1 {
  claim(input: {
    readonly messageId: string;
    readonly routeId: string;
    readonly envelopeIdentityDigest: PlanningDigestV1;
    readonly claimedAt: string;
  }): Promise<CollectivePeerHostClaimOutcomeV1>;
  complete(input: {
    readonly messageId: string;
    readonly routeId: string;
    readonly envelopeIdentityDigest: PlanningDigestV1;
    readonly admittedAt: string;
  }): Promise<CollectivePeerHostAdmissionClaimV1>;
}

export interface CollectivePeerHostClockV1 {
  now(): string;
}

export interface CollectivePeerHostLimitsV1 {
  readonly maximumPendingPerRoute: number;
  readonly maximumDrainSteps: number;
  readonly maximumConcurrentDispatches: number;
}

export interface CollectivePeerHostStructurePortsV1 {
  readonly adaptation: TeamStructureAdaptationPortV1;
  readonly catalog: TeamStructureTemplateCatalogV1;
}

export interface CollectivePeerHostOptionsV1 {
  readonly hostId: string;
  readonly routes: readonly CollectivePeerHostRoutePortV1[];
  readonly claims: CollectivePeerHostClaimPortV1;
  readonly topology: CollectivePeerHostTopologyPortV1;
  readonly clock: CollectivePeerHostClockV1;
  readonly limits?: Partial<CollectivePeerHostLimitsV1>;
  readonly verifier?: CollectivePeerHostEnvelopeVerifierV1;
  readonly knownCriticalExtensions?: readonly string[];
  readonly formation?: TeamFormationPortV1;
  readonly execution?: TeamExecutionPortV1;
  readonly continuity?: TeamExecutionContinuityPortV1;
  readonly structure?: CollectivePeerHostStructurePortsV1;
}

export type CollectivePeerHostReceiveInputV1 =
  | { readonly envelope: VerifiedMeshEnvelope; readonly receivedAt?: string }
  | { readonly unverifiedEnvelope: unknown; readonly receivedAt?: string };

export type CollectivePeerHostReceiveOutcomeV1 =
  | {
      readonly status: "acknowledged";
      readonly route: CollectivePeerHostRouteV1;
      readonly duplicate: boolean;
    }
  | {
      readonly status: "rejected" | "backpressured";
      readonly reasonCode: string;
    };

export interface CollectivePeerHostStatusV1 {
  readonly schemaVersion: 1;
  readonly lifecycle: "new" | "restored" | "running" | "draining" | "stopped";
  readonly topology: CollectivePeerHostTopologyFreshnessV1;
  readonly activeDispatches: number;
  readonly nextRouteId: string | null;
}

export interface CollectivePeerHostDrainOutcomeV1 {
  readonly attempted: number;
  readonly dispatched: number;
  readonly paused: boolean;
  readonly failed: number;
}

export interface CollectivePeerHostFacadeV1 {
  form(request: TeamFormationRequestV1): Promise<TeamFormationDecisionV1>;
  activate(request: TeamActivationRequestV1): Promise<JointWorkContractV1>;
  execute(request: TeamExecutionStartRequestV1): Promise<TeamExecutionRecordV1>;
  dispatch(input: {
    readonly command: TeamExecutionStepCommandV1;
    readonly signal?: AbortSignal;
  }): Promise<TeamExecutionRecordV1>;
  checkpoint(
    request: TeamExecutionContinuityCheckpointRequestV1,
  ): Promise<TeamExecutionContinuityCheckpointV1>;
  recover(
    request: TeamExecutionContinuityTakeoverRequestV1,
  ): Promise<TeamExecutionContinuityTakeoverResultV1>;
  observe(
    observation: TeamStructureObservationV1,
  ): Promise<TeamStructureAdaptationStateV1>;
  observeExecution(input: {
    readonly observationId: string;
    readonly executionState: TeamExecutionStateV1;
    readonly executionPolicy: TeamExecutionPolicyRecordV1;
    readonly decision: TeamStructureAdaptationDecisionV1;
    readonly materialization: TeamStructureMaterializationV1;
    readonly observedAtLogicalMs: number;
  }): Promise<TeamStructureAdaptationStateV1>;
  select(
    request: TeamStructureAdaptationRequestV1,
  ): Promise<TeamStructureAdaptationDecisionV1>;
  materialize(input: {
    readonly templateId: string;
    readonly bindings: readonly TeamStructurePositionBindingV1[];
  }): TeamStructureMaterializationV1;
  formFromStructure(
    input: Omit<TeamStructureFormationAdapterInputV1, "catalog">,
  ): Promise<TeamFormationDecisionV1>;
}

export type CollectivePeerHostEnvelopeV1 =
  VerifiedMeshEnvelope<MeshMessagePayload>;
