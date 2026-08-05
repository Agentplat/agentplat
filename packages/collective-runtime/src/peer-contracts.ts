import type {
  AgentPlatID,
  JsonObject,
  Metadata,
  TenantContext,
} from "@agentplat/core";
import type {
  MissionIntentV1,
  MissionObservationV1,
  PlanFragmentProposalV1,
  PlanViewV1,
  PlanningDigestV1,
} from "@agentplat/collective-planning";
import type { PlanningAdaptiveRoleResultV1 } from "@agentplat/collective-planning/mesh";
import type {
  CreatePortableAgentSessionInputV1,
  PortableAgentAdapterRequirementsV1,
  PortableAgentObservationV1,
  PortableAgentSessionSnapshotV1,
  PortableAgentCheckpointTransferV1,
  PortableAgentStepOptionsV1,
  PortableAgentStepOutcomeV1,
  PortableAgentStepRequestV1,
} from "@agentplat/runtime/adapter";
import type { WorkContractV1 } from "@agentplat/collective-control";

export const COLLECTIVE_PEER_RUNTIME_SCHEMA_VERSION = 1 as const;

export interface CollectivePeerAgentBindingV1 {
  readonly sessionId: AgentPlatID;
  /** Stable collective member that hosts this agent. */
  readonly peerId: AgentPlatID;
  /** Concrete member incarnation; changes after a peer restart. */
  readonly peerInstanceId: AgentPlatID;
  /** Agent identity is independent from the hosting collective member. */
  readonly agentId: AgentPlatID;
  readonly adapterId: AgentPlatID;
  readonly adapterVersion: string;
  readonly requirements: PortableAgentAdapterRequirementsV1;
}

export interface CollectivePeerSessionRuntimePortV1 {
  createSession(
    input: CreatePortableAgentSessionInputV1,
  ): Promise<PortableAgentSessionSnapshotV1>;
  getSession(
    sessionId: AgentPlatID,
  ): Promise<PortableAgentSessionSnapshotV1 | undefined>;
  step(
    sessionId: AgentPlatID,
    request: PortableAgentStepRequestV1,
    options?: PortableAgentStepOptionsV1,
  ): Promise<PortableAgentStepOutcomeV1>;
  close(sessionId: AgentPlatID): Promise<PortableAgentSessionSnapshotV1>;
  exportCheckpoint?(
    sessionId: AgentPlatID,
    options?: PortableAgentStepOptionsV1,
  ): Promise<PortableAgentCheckpointTransferV1>;
  importCheckpoint?(
    sessionId: AgentPlatID,
    transfer: PortableAgentCheckpointTransferV1,
    expectedRevision: number,
    options?: PortableAgentStepOptionsV1,
  ): Promise<PortableAgentSessionSnapshotV1>;
  resume?(
    sessionId: AgentPlatID,
    options?: PortableAgentStepOptionsV1,
  ): Promise<PortableAgentSessionSnapshotV1>;
}

export interface CollectivePeerExecutionCheckpointImportV1 {
  readonly tenant: TenantContext;
  readonly agent: CollectivePeerAgentBindingV1;
  readonly assignment: PlanningAdaptiveRoleResultV1;
  readonly transfer: PortableAgentCheckpointTransferV1;
  readonly signal?: AbortSignal;
  readonly credentials?: Readonly<Record<string, string>>;
  readonly metadata?: Metadata;
}

export interface CollectivePeerCurrentnessRequestV1 {
  readonly schemaVersion: 1;
  readonly phase: "pre_step" | "post_step";
  readonly workContract: WorkContractV1;
  readonly role: PlanningAdaptiveRoleResultV1["roleBinding"];
  readonly logicalTimeMs: number;
}

export type CollectivePeerCurrentnessDecisionV1 =
  | { readonly current: true; readonly reasonCode: "current" }
  | { readonly current: false; readonly reasonCode: string };

export interface CollectivePeerCurrentnessPortV1 {
  readonly currentnessId: AgentPlatID;
  readonly currentnessVersion: number;
  readonly implementationId: AgentPlatID;
  check(
    request: CollectivePeerCurrentnessRequestV1,
  ):
    | CollectivePeerCurrentnessDecisionV1
    | Promise<CollectivePeerCurrentnessDecisionV1>;
}

/** Agent-produced planning data. Identity, authority and digests are caller-owned. */
export type CollectivePeerPlanDraftV1 =
  | {
      readonly schemaVersion: 1;
      readonly disposition: "abstain";
      readonly reasonCode: string;
    }
  | {
      readonly schemaVersion: 1;
      readonly disposition: "propose";
      readonly proposalRevision: number;
      readonly semanticSlotKey: string;
      readonly predecessorFragmentDigest: PlanningDigestV1 | null;
      readonly parentFragmentDigests: readonly PlanningDigestV1[];
      readonly dependencyFragmentDigests: readonly PlanningDigestV1[];
      readonly outcomeStatements: readonly string[];
      readonly roleKey: string;
      readonly requiredCapabilityKeys: readonly string[];
      readonly inputReferenceDigest: PlanningDigestV1;
      readonly basisObservationDigests: readonly PlanningDigestV1[];
      readonly requestedBudgetUnits: number;
      readonly workDeadline: string;
    };

export interface CollectivePeerPlanInputV1 {
  readonly tenant: TenantContext;
  readonly agent: CollectivePeerAgentBindingV1;
  readonly missionIntent: MissionIntentV1;
  readonly planView: PlanViewV1;
  readonly observations: readonly MissionObservationV1[];
  readonly allowedInputReferenceDigests: readonly PlanningDigestV1[];
  readonly stepId: AgentPlatID;
  readonly logicalTimeMs: number;
  readonly roleValidFromLogicalMs: number;
  readonly roleValidUntilLogicalMs: number;
  readonly signal?: AbortSignal;
  readonly credentials?: Readonly<Record<string, string>>;
  readonly metadata?: Metadata;
}

export type CollectivePeerPlanOutcomeV1 =
  | {
      readonly status: "proposed";
      readonly proposal: PlanFragmentProposalV1;
      readonly session: PortableAgentSessionSnapshotV1;
      readonly step: PortableAgentStepOutcomeV1["record"];
      readonly reasonCode: null;
    }
  | {
      readonly status: "abstained" | "refused" | "paused" | "failed";
      readonly proposal: null;
      readonly session: PortableAgentSessionSnapshotV1;
      readonly step: PortableAgentStepOutcomeV1["record"];
      readonly reasonCode: string;
    };

export interface CollectivePeerExecuteInputV1 {
  readonly tenant: TenantContext;
  readonly agent: CollectivePeerAgentBindingV1;
  readonly assignment: PlanningAdaptiveRoleResultV1;
  readonly stepId: AgentPlatID;
  readonly logicalTimeMs: number;
  readonly observations: readonly PortableAgentObservationV1[];
  readonly input: JsonObject | null;
  readonly requestedOutputModalities: PortableAgentStepRequestV1["requestedOutputModalities"];
  readonly signal?: AbortSignal;
  readonly credentials?: Readonly<Record<string, string>>;
  readonly metadata?: Metadata;
}

export type CollectivePeerExecuteOutcomeV1 =
  | {
      readonly status: "released";
      readonly workContract: WorkContractV1;
      readonly session: PortableAgentSessionSnapshotV1;
      readonly step: PortableAgentStepOutcomeV1["record"];
      readonly reasonCode: null;
    }
  | {
      readonly status: "withheld" | "refused" | "paused" | "failed";
      readonly workContract: WorkContractV1;
      /** Non-releasable agent material is deliberately omitted. */
      readonly session: null;
      readonly step: null;
      readonly reasonCode: string;
    };

export interface CollectivePeerRuntimeOptionsV1 {
  readonly sessions: CollectivePeerSessionRuntimePortV1;
  readonly currentness: CollectivePeerCurrentnessPortV1;
  readonly maximumPlanningContextBytes?: number;
  readonly maximumExecutionContextBytes?: number;
}
