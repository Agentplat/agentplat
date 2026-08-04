import type {
  AgentPlatID,
  JsonObject,
  JsonValue,
  Metadata,
  TenantContext,
} from "@agentplat/core";
import type {
  AgentDefinition,
  AgentProvider,
  AgentRunInput,
  AgentRunResult,
  RuntimeExecutionContext,
} from "./index.js";

export const PORTABLE_AGENT_ADAPTER_SCHEMA_VERSION = 1 as const;

export type PortableAgentKindV1 =
  | "language_model"
  | "vision_language_model"
  | "vision_language_action"
  | "policy"
  | "symbolic"
  | "hybrid"
  | "custom";

export type PortableAgentModalityV1 =
  "text" | "image" | "audio" | "video" | "structured" | "sensor" | "action";

export type PortableAgentInteractionModeV1 =
  "invoke" | "stream" | "observe_act";

export type PortableAgentControlPointV1 =
  "pre_step" | "post_output" | "pre_action";

/**
 * Stable, serializable description of one adapter implementation. The
 * implementation ID is deployment-owned and must change whenever behavior
 * that affects replay or recovery changes.
 */
export interface PortableAgentAdapterManifestV1 {
  readonly schemaVersion: 1;
  readonly adapterId: AgentPlatID;
  readonly adapterVersion: string;
  readonly implementationId: AgentPlatID;
  readonly agentKinds: readonly PortableAgentKindV1[];
  readonly inputModalities: readonly PortableAgentModalityV1[];
  readonly outputModalities: readonly PortableAgentModalityV1[];
  readonly interactionModes: readonly PortableAgentInteractionModeV1[];
  readonly controlPoints: readonly PortableAgentControlPointV1[];
  readonly supportsCancellation: boolean;
  readonly supportsCheckpoint: boolean;
  readonly supportsRestore: boolean;
  readonly maximumObservationBytes: number;
  readonly maximumOutputBytes: number;
  readonly maximumActionBytes: number;
  readonly maximumStepsPerSession: number;
}

export interface PortableAgentAdapterRequirementsV1 {
  readonly agentKinds?: readonly PortableAgentKindV1[];
  readonly inputModalities: readonly PortableAgentModalityV1[];
  readonly outputModalities: readonly PortableAgentModalityV1[];
  readonly interactionMode: PortableAgentInteractionModeV1;
  readonly controlPoints: readonly PortableAgentControlPointV1[];
  readonly requireCancellation?: boolean;
  readonly requireCheckpoint?: boolean;
  readonly requireRestore?: boolean;
}

export type PortableAgentAdapterNegotiationV1 =
  | {
      readonly accepted: true;
      readonly manifest: PortableAgentAdapterManifestV1;
    }
  | {
      readonly accepted: false;
      readonly manifest: PortableAgentAdapterManifestV1;
      readonly missing: readonly string[];
    };

export type PortableAgentSourceZoneV1 =
  | "operator_trusted"
  | "objective_trusted"
  | "local_trusted"
  | "environment_untrusted"
  | "peer_untrusted"
  | "tool_untrusted"
  | "provider_untrusted";

export interface PortableContentReferenceV1 {
  readonly uri: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly contentDigest: string;
}

/** Peer-local input. Exactly one of content or contentReference is present. */
export interface PortableAgentObservationV1 {
  readonly schemaVersion: 1;
  readonly observationId: AgentPlatID;
  readonly sourceZone: PortableAgentSourceZoneV1;
  readonly sourceId: AgentPlatID;
  readonly modality: PortableAgentModalityV1;
  readonly content: JsonValue | null;
  readonly contentReference: PortableContentReferenceV1 | null;
  readonly provenance: Metadata;
  readonly observedAtLogicalMs: number;
}

/**
 * Local role context for a session. It is alignment context, never assignment
 * authority, an action grant, a lease or a fencing token.
 */
export interface PortableAgentRoleBindingV1 {
  readonly schemaVersion: 1;
  readonly roleBindingId: AgentPlatID;
  readonly roleRevision: number;
  readonly predecessorRoleBindingId: AgentPlatID | null;
  readonly objectiveId: AgentPlatID;
  readonly roleKey: string;
  readonly instructions: readonly string[];
  readonly constraints: JsonObject;
  readonly validFromLogicalMs: number;
  readonly validUntilLogicalMs: number;
}

export interface PortableAgentStepRequestV1 {
  readonly schemaVersion: 1;
  readonly stepId: AgentPlatID;
  readonly expectedSessionRevision: number;
  readonly interactionMode: PortableAgentInteractionModeV1;
  readonly observations: readonly PortableAgentObservationV1[];
  readonly input: JsonObject | null;
  readonly requestedOutputModalities: readonly PortableAgentModalityV1[];
  readonly logicalTimeMs: number;
}

export interface PortableAgentOutputV1 {
  readonly schemaVersion: 1;
  readonly outputId: AgentPlatID;
  readonly modality: PortableAgentModalityV1;
  readonly content: JsonValue | null;
  readonly contentReference: PortableContentReferenceV1 | null;
  readonly metadata: Metadata;
}

/** An action proposal is inert data until a separate authority gateway accepts it. */
export interface PortableAgentActionProposalV1 {
  readonly schemaVersion: 1;
  readonly actionId: AgentPlatID;
  readonly actionClass: string;
  readonly input: JsonObject;
  readonly riskClass: "low" | "moderate" | "high";
  readonly metadata: Metadata;
}

export interface PortableAgentCheckpointV1 {
  readonly schemaVersion: 1;
  readonly checkpointId: AgentPlatID;
  readonly sessionId: AgentPlatID;
  readonly adapterId: AgentPlatID;
  readonly adapterVersion: string;
  readonly implementationId: AgentPlatID;
  readonly throughStepSequence: number;
  readonly stateReference: string;
  readonly stateDigest: string;
  readonly createdAt: string;
}

export interface PortableAgentStepResultV1 {
  readonly schemaVersion: 1;
  readonly sessionId: AgentPlatID;
  readonly stepId: AgentPlatID;
  readonly stepSequence: number;
  readonly status: "completed" | "refused" | "paused" | "failed";
  readonly outputs: readonly PortableAgentOutputV1[];
  readonly actionProposals: readonly PortableAgentActionProposalV1[];
  readonly checkpoint: PortableAgentCheckpointV1 | null;
  readonly reasonCode: string | null;
  readonly metadata: Metadata;
}

export interface PortableAgentAdapterStepInputV1 {
  readonly schemaVersion: 1;
  readonly sessionId: AgentPlatID;
  readonly tenantId: AgentPlatID;
  readonly agentId: AgentPlatID;
  readonly stepSequence: number;
  readonly role: PortableAgentRoleBindingV1;
  readonly request: PortableAgentStepRequestV1;
  readonly previousCheckpoint: PortableAgentCheckpointV1 | null;
}

export interface PortableAgentAdapterCheckpointInputV1 {
  readonly schemaVersion: 1;
  readonly sessionId: AgentPlatID;
  readonly tenantId: AgentPlatID;
  readonly agentId: AgentPlatID;
  readonly throughStepSequence: number;
  readonly previousCheckpoint: PortableAgentCheckpointV1 | null;
}

export interface PortableAgentAdapterRestoreInputV1 {
  readonly schemaVersion: 1;
  readonly sessionId: AgentPlatID;
  readonly tenantId: AgentPlatID;
  readonly agentId: AgentPlatID;
  readonly checkpoint: PortableAgentCheckpointV1;
}

export interface PortableAgentAdapterContextV1 {
  readonly tenant: TenantContext;
  readonly agentId: AgentPlatID;
  readonly sessionId: AgentPlatID;
  readonly stepId?: AgentPlatID;
  readonly signal: AbortSignal;
  /** Ephemeral credentials are never persisted or supplied to controls. */
  readonly credentials?: Readonly<Record<string, string>>;
  readonly metadata?: Metadata;
}

export interface PortableAgentAdapterV1 {
  step(
    input: PortableAgentAdapterStepInputV1,
    context: PortableAgentAdapterContextV1,
  ): Promise<PortableAgentStepResultV1>;
  checkpoint?(
    input: PortableAgentAdapterCheckpointInputV1,
    context: PortableAgentAdapterContextV1,
  ): Promise<PortableAgentCheckpointV1>;
  restore?(
    input: PortableAgentAdapterRestoreInputV1,
    context: PortableAgentAdapterContextV1,
  ): Promise<void>;
}

export interface PortableAgentControlRequestV1 {
  readonly schemaVersion: 1;
  readonly checkpoint: PortableAgentControlPointV1;
  readonly manifest: PortableAgentAdapterManifestV1;
  readonly sessionId: AgentPlatID;
  readonly tenantId: AgentPlatID;
  readonly agentId: AgentPlatID;
  readonly role: PortableAgentRoleBindingV1;
  readonly request: PortableAgentStepRequestV1;
  readonly output: PortableAgentOutputV1 | null;
  readonly actionProposal: PortableAgentActionProposalV1 | null;
}

export interface PortableAgentControlDecisionV1 {
  readonly disposition: "allow" | "deny" | "abstain" | "escalate";
  readonly reasonCode: string;
}

export interface PortableAgentControlPortV1 {
  readonly controlId: AgentPlatID;
  readonly controlVersion: number;
  readonly implementationId: AgentPlatID;
  evaluate(
    request: PortableAgentControlRequestV1,
  ): PortableAgentControlDecisionV1 | Promise<PortableAgentControlDecisionV1>;
}

export interface PortableAgentStepRecordV1 {
  readonly schemaVersion: 1;
  readonly stepId: AgentPlatID;
  readonly stepSequence: number;
  readonly roleBindingId: AgentPlatID;
  readonly roleRevision: number;
  readonly interactionMode: PortableAgentInteractionModeV1;
  readonly status: PortableAgentStepResultV1["status"];
  readonly request: PortableAgentStepRequestV1;
  readonly result: PortableAgentStepResultV1;
  readonly startedAt: string;
  readonly completedAt: string;
}

export type PortableAgentSessionStatusV1 =
  "active" | "paused" | "closed" | "failed";

export interface PortableAgentSessionSnapshotV1 {
  readonly schemaVersion: 1;
  readonly sessionId: AgentPlatID;
  readonly tenantId: AgentPlatID;
  readonly agentId: AgentPlatID;
  readonly objectiveId: AgentPlatID;
  readonly manifest: PortableAgentAdapterManifestV1;
  readonly controlBinding: {
    readonly controlId: AgentPlatID;
    readonly controlVersion: number;
    readonly implementationId: AgentPlatID;
  };
  readonly role: PortableAgentRoleBindingV1;
  readonly status: PortableAgentSessionStatusV1;
  readonly revision: number;
  readonly nextStepSequence: number;
  readonly stepRecords: readonly PortableAgentStepRecordV1[];
  readonly checkpoint: PortableAgentCheckpointV1 | null;
  readonly metadata: Metadata;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly closedAt: string | null;
}

/** Atomic revision-checked persistence boundary. */
export interface PortableAgentStateStoreV1 {
  load(
    sessionId: AgentPlatID,
  ): Promise<PortableAgentSessionSnapshotV1 | undefined>;
  save(
    snapshot: PortableAgentSessionSnapshotV1,
    expectedRevision: number | null,
  ): Promise<void>;
}

export interface CreatePortableAgentSessionInputV1 {
  readonly sessionId: AgentPlatID;
  readonly tenant: TenantContext;
  readonly agentId: AgentPlatID;
  readonly adapterId: AgentPlatID;
  readonly adapterVersion: string;
  readonly requirements: PortableAgentAdapterRequirementsV1;
  readonly role: PortableAgentRoleBindingV1;
  readonly metadata?: Metadata;
}

export interface PortableAgentStepOptionsV1 {
  readonly signal?: AbortSignal;
  /** Current tenant context is ephemeral; only tenantId is persisted. */
  readonly tenant?: TenantContext;
  readonly credentials?: Readonly<Record<string, string>>;
  readonly metadata?: Metadata;
}

export interface PortableAgentStepOutcomeV1 {
  readonly session: PortableAgentSessionSnapshotV1;
  readonly record: PortableAgentStepRecordV1;
}

export interface PortableAgentSessionRuntimeOptionsV1 {
  readonly registry: PortableAgentAdapterRegistryPortV1;
  readonly control: PortableAgentControlPortV1;
  readonly stateStore?: PortableAgentStateStoreV1;
  readonly maximumSessionSnapshotBytes?: number;
  readonly clock?: () => Date;
}

export interface PortableAgentAdapterRegistryPortV1 {
  resolve(input: {
    readonly adapterId: AgentPlatID;
    readonly adapterVersion: string;
  }):
    | {
        readonly manifest: PortableAgentAdapterManifestV1;
        readonly adapter: PortableAgentAdapterV1;
      }
    | undefined;
  negotiate(
    manifest: PortableAgentAdapterManifestV1,
    requirements: PortableAgentAdapterRequirementsV1,
  ): PortableAgentAdapterNegotiationV1;
}

export interface AgentRuntimePortableAdapterOptionsV1 {
  readonly manifest: PortableAgentAdapterManifestV1;
  readonly runtime: {
    run(
      agent: AgentDefinition,
      input: AgentRunInput,
      context: RuntimeExecutionContext,
    ): Promise<AgentRunResult>;
  };
  readonly agent: AgentDefinition;
}

export interface PortableAgentProviderOptionsV1 {
  readonly sessionRuntime: PortableAgentSessionRuntimePortV1;
  readonly resolveSessionId: (agent: AgentDefinition) => AgentPlatID;
  readonly mapInput?: (input: AgentRunInput) => JsonObject;
  readonly logicalClock?: () => number;
}

export interface PortableAgentSessionRuntimePortV1 {
  getSession(
    sessionId: AgentPlatID,
  ): Promise<PortableAgentSessionSnapshotV1 | undefined>;
  step(
    sessionId: AgentPlatID,
    request: PortableAgentStepRequestV1,
    options?: PortableAgentStepOptionsV1,
  ): Promise<PortableAgentStepOutcomeV1>;
}

export type PortableAgentProviderV1 = AgentProvider;
