import type {
  MeshAllocationInboundDecision,
  MeshAllocationInboundProcessor,
  MeshAllocationInboundRejectionCode,
  MeshAllocationInboundRequest,
  MeshAllocationInboundRuntimeState,
  MeshDiscoveryState,
  MeshLocalWorkCreateInput,
  MeshObjectiveWorkCommand,
  MeshWorkItemProjection,
} from "@agentplat/mesh/coordination";
import type { MeshJsonValue, WorkOfferPayload } from "@agentplat/mesh-protocol";
import type {
  MeshWorkContractSourceV1,
  WorkContractV1,
} from "@agentplat/collective-control/mesh";

import type {
  AdaptiveRoleBindingV1,
  MissionIntentV1,
  PlanFragmentDecisionV1,
  PlanFragmentProposalV1,
  PlanFragmentV1,
  PlanningDigestV1,
  PlanningReducerStateV1,
  PlanViewV1,
} from "./contracts.js";

/** The only critical extension understood by the planning Mesh facade. */
export const PLANNING_WORK_EXTENSION_KEY_V1 =
  "agentplat.collective-planning.fragment.v1" as const;

/** Content references emitted by the content-addressed fragment repository. */
export const PLANNING_FRAGMENT_REFERENCE_PREFIX_V1 =
  "urn:agentplat:collective-planning:fragment:" as const;

/** Exact discovery profile required before sending a planning offer. */
export const PLANNING_MESH_CAPABILITY_PROFILE_V1 = Object.freeze({
  capabilityKey: PLANNING_WORK_EXTENSION_KEY_V1,
  version: "1",
  variant: "mesh-work-offer",
  inputMediaTypes: Object.freeze([
    "application/vnd.agentplat.collective-planning.fragment.v1+json",
  ]),
  outputMediaTypes: Object.freeze([] as string[]),
  attributes: Object.freeze({
    "agentplat.mesh.critical-extension": PLANNING_WORK_EXTENSION_KEY_V1,
  }),
});

export interface PlanningWorkExtensionV1 {
  readonly schemaVersion: 1;
  readonly missionIntentId: string;
  readonly intentRevision: number;
  readonly intentDigest: PlanningDigestV1;
  readonly proposalDigest: PlanningDigestV1;
  readonly fragmentDigest: PlanningDigestV1;
  readonly semanticSlotKey: string;
  readonly predecessorFragmentDigest: PlanningDigestV1 | null;
  readonly dependencyFragmentDigests: readonly PlanningDigestV1[];
  readonly planViewDigest: PlanningDigestV1;
}

/** Closed, immutable source evidence stored under the offered fragment digest. */
export interface PlanningFragmentRepositoryRecordV1 {
  readonly schemaVersion: 1;
  readonly contentReference: string;
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly meshId: string;
  readonly objectiveId: string;
  readonly missionIntentId: string;
  readonly intentRevision: number;
  readonly intentDigest: PlanningDigestV1;
  readonly proposalDigest: PlanningDigestV1;
  readonly fragmentDigest: PlanningDigestV1;
  readonly proposal: PlanFragmentProposalV1;
  readonly decision: PlanFragmentDecisionV1;
  readonly fragment: PlanFragmentV1;
  readonly sourcePlanView: PlanViewV1;
}

export interface PlanningFragmentRepositoryV1 {
  put(
    record: PlanningFragmentRepositoryRecordV1,
  ):
    | PlanningFragmentRepositoryRecordV1
    | Promise<PlanningFragmentRepositoryRecordV1>;
  get(
    contentReference: string,
  ):
    | PlanningFragmentRepositoryRecordV1
    | null
    | Promise<PlanningFragmentRepositoryRecordV1 | null>;
}

export interface InMemoryPlanningFragmentRepositoryOptionsV1 {
  readonly maximumRecords?: number;
  readonly maximumRecordBytes?: number;
}

export interface PlanningLocalWorkProjectionV1 {
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly work: MeshLocalWorkCreateInput;
  readonly extensionKey: typeof PLANNING_WORK_EXTENSION_KEY_V1;
  readonly extension: PlanningWorkExtensionV1;
  readonly extensions: Readonly<Record<string, MeshJsonValue>>;
  readonly criticalExtensions: readonly [typeof PLANNING_WORK_EXTENSION_KEY_V1];
  readonly repositoryRecord: PlanningFragmentRepositoryRecordV1;
}

export interface PlanningRecipientSelectionInputV1 {
  readonly discovery: MeshDiscoveryState;
  readonly logicalTimeMs: number;
  readonly verifiedAt: string;
  readonly localSupportedCriticalExtensions: readonly string[];
  readonly requiredCapabilityKeys: readonly string[];
  readonly maximumRecipients: number;
}

export interface PlanningRecipientV1 {
  readonly peerId: string;
  readonly peerCardId: string;
  readonly cardRevision: number;
  readonly planningCapabilityId: string;
  readonly planningCapabilityRevision: number;
}

export interface PlanningMeshAdmissionInputV1 {
  readonly proposal: PlanFragmentProposalV1;
  readonly sourceDecision: PlanFragmentDecisionV1;
  readonly sourceFragment: PlanFragmentV1;
  readonly sourcePlanView: PlanViewV1;
  readonly extension: PlanningWorkExtensionV1;
  readonly workOffer: WorkOfferPayload;
  readonly workItemId: string;
  readonly workItemRevision: number;
  readonly receivedAtLogicalMs: number;
}

export type PlanningMeshAdmissionDecisionV1 =
  | {
      readonly accepted: true;
      readonly state: PlanningReducerStateV1;
    }
  | {
      readonly accepted: false;
      readonly code: string;
      readonly state: PlanningReducerStateV1;
    };

/** Pure local policy/reducer adapter. Source decisions are evidence, not authority. */
export interface PlanningMeshAdmissionPortV1 {
  evaluate(
    state: PlanningReducerStateV1,
    input: PlanningMeshAdmissionInputV1,
  ): PlanningMeshAdmissionDecisionV1 | Promise<PlanningMeshAdmissionDecisionV1>;
}

export interface PlanningMeshInboundRuntimeStateV1 {
  readonly mesh: MeshAllocationInboundRuntimeState;
  readonly planning: PlanningReducerStateV1;
}

export type PlanningMeshInboundRejectionCodeV1 =
  | MeshAllocationInboundRejectionCode
  | "planning_boundary_invalid"
  | "planning_extension_required"
  | "planning_extension_invalid"
  | "planning_repository_missing"
  | "planning_repository_invalid"
  | "planning_source_invalid"
  | "planning_projection_mismatch"
  | "planning_local_rejected"
  | "planning_local_head_mismatch";

export type PlanningMeshInboundDecisionV1 =
  | {
      readonly accepted: true;
      readonly duplicate: boolean;
      readonly envelope: Extract<
        MeshAllocationInboundDecision,
        { readonly accepted: true }
      >["envelope"];
      readonly state: PlanningMeshInboundRuntimeStateV1;
    }
  | {
      readonly accepted: false;
      readonly code: PlanningMeshInboundRejectionCodeV1;
      readonly state: PlanningMeshInboundRuntimeStateV1;
    };

export interface PlanningMeshInboundProcessorV1 {
  process(
    state: PlanningMeshInboundRuntimeStateV1,
    request: MeshAllocationInboundRequest,
  ): Promise<PlanningMeshInboundDecisionV1>;
}

export interface PlanningMeshInboundProcessorOptionsV1 {
  readonly processor: MeshAllocationInboundProcessor;
  readonly repository: PlanningFragmentRepositoryV1;
  /** Defaults to the production pure-reducer admission adapter. */
  readonly admission?: PlanningMeshAdmissionPortV1;
}

export interface PlanningAdaptiveRoleInputV1 {
  readonly source: MeshWorkContractSourceV1;
  readonly missionIntent: MissionIntentV1;
  readonly planView: PlanViewV1;
  readonly fragment: PlanFragmentV1;
  readonly repositoryRecord: PlanningFragmentRepositoryRecordV1;
  readonly extension: PlanningWorkExtensionV1;
  readonly roleBindingId: string;
  readonly targetStatus: "assigned" | "executing";
}

export interface PlanningAdaptiveRoleResultV1 {
  readonly workContract: WorkContractV1;
  /** Lifecycle candidate whose digest is bound by roleBinding. */
  readonly targetFragment: PlanFragmentV1;
  readonly roleBinding: AdaptiveRoleBindingV1;
}

/** Portable result; callers feed the command to the existing Mesh reducer. */
export interface PlanningMeshWorkLifecycleCommandV1 {
  readonly command: MeshObjectiveWorkCommand;
  readonly fragmentDigest: PlanningDigestV1;
}

export interface PlanningWorkProjectionValidationInputV1 {
  readonly intent: MissionIntentV1;
  readonly record: PlanningFragmentRepositoryRecordV1;
  readonly extension: PlanningWorkExtensionV1;
  readonly offer: WorkOfferPayload;
  readonly currentWork?: MeshWorkItemProjection;
}
