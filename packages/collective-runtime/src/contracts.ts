import type {
  AgentPlatID,
  JsonObject,
  JsonValue,
  Metadata,
  TenantContext,
} from '@agentplat/core';
import type { AgentDefinition, AgentRuntime } from '@agentplat/runtime';

export const COLLECTIVE_RUNTIME_SCHEMA_VERSION = 1 as const;

export type CollectiveExecutionStatus =
  'running' | 'paused' | 'completed' | 'failed' | 'canceled';

export type CollectiveWorkStatus =
  'pending' | 'running' | 'completed' | 'failed' | 'canceled';

export type CollectiveAttemptStatus = 'running' | 'completed' | 'failed';

export interface CollectiveObjective {
  readonly objectiveId: AgentPlatID;
  readonly summary: string;
  readonly input?: JsonValue;
  readonly successCriteria?: readonly string[];
}

export interface CollectiveWorkItem {
  readonly workItemId: AgentPlatID;
  readonly summary: string;
  readonly requiredCapabilityKeys: readonly string[];
  readonly roleKey?: string;
  readonly dependsOn?: readonly AgentPlatID[];
  readonly input?: JsonValue;
}

export interface CollectivePlan {
  readonly workItems: readonly CollectiveWorkItem[];
}

export interface CollectiveAgentRegistration {
  readonly agent: AgentDefinition;
  readonly capabilityKeys: readonly string[];
  readonly roleKeys?: readonly string[];
  /** Higher values win after current assignment load. Defaults to zero. */
  readonly priority?: number;
}

/** Safe registry view supplied to planners, policies and callers. */
export interface CollectiveAgentDescriptor {
  readonly agentId: AgentPlatID;
  readonly name: string;
  readonly platform: string;
  readonly capabilityKeys: readonly string[];
  readonly roleKeys: readonly string[];
  readonly priority: number;
}

export interface CollectivePlannerContext {
  readonly collectiveId: AgentPlatID;
  readonly tenant: TenantContext;
  readonly objective: CollectiveObjective;
  readonly agents: readonly CollectiveAgentDescriptor[];
}

export type CollectivePlanner = (
  context: CollectivePlannerContext
) => CollectivePlan | Promise<CollectivePlan>;

export interface CollectivePolicyDecision {
  readonly allow: boolean;
  readonly reason?: string;
}

export interface CollectiveAssignmentPolicyContext {
  readonly collectiveId: AgentPlatID;
  readonly executionId: AgentPlatID;
  readonly objective: CollectiveObjective;
  readonly workItem: CollectiveWorkItem;
  readonly agent: CollectiveAgentDescriptor;
  readonly attemptNumber: number;
  readonly dependencyResults: Readonly<
    Record<AgentPlatID, CollectiveWorkResult>
  >;
}

export interface CollectiveResultPolicyContext {
  readonly collectiveId: AgentPlatID;
  readonly executionId: AgentPlatID;
  readonly objective: CollectiveObjective;
  readonly workItem: CollectiveWorkItem;
  readonly agent: CollectiveAgentDescriptor;
  readonly attemptNumber: number;
  readonly result: CollectiveWorkResult;
}

export type CollectiveAssignmentPolicy = (
  context: CollectiveAssignmentPolicyContext
) => CollectivePolicyDecision | Promise<CollectivePolicyDecision>;

export type CollectiveResultPolicy = (
  context: CollectiveResultPolicyContext
) => CollectivePolicyDecision | Promise<CollectivePolicyDecision>;

export interface CollectivePolicyLimits {
  readonly maximumWorkItems: number;
  readonly maximumAttemptsPerWorkItem: number;
  readonly maximumConcurrentWorkItems: number;
  readonly maximumResultBytes: number;
}

export interface CollectivePolicies extends Partial<CollectivePolicyLimits> {
  /**
   * Stable deployment identity for policy callbacks. Required when either
   * callback is configured and checked again during resume.
   */
  readonly policyId?: AgentPlatID;
  /** Exceptions and malformed decisions deny the assignment. */
  readonly authorizeAssignment?: CollectiveAssignmentPolicy;
  /** Exceptions and malformed decisions deny result acceptance. */
  readonly authorizeResult?: CollectiveResultPolicy;
}

export interface CollectiveWorkResult {
  readonly output?: string;
  readonly result?: JsonObject;
  readonly metadata?: Metadata;
}

export interface CollectiveFailure {
  readonly code: string;
  readonly message: string;
}

export interface CollectiveAttemptSnapshot {
  readonly attemptId: AgentPlatID;
  readonly attemptNumber: number;
  readonly agentId: AgentPlatID;
  readonly status: CollectiveAttemptStatus;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly failure?: CollectiveFailure;
}

export interface CollectiveWorkSnapshot {
  readonly workItem: CollectiveWorkItem;
  readonly status: CollectiveWorkStatus;
  readonly attempts: readonly CollectiveAttemptSnapshot[];
  readonly result?: CollectiveWorkResult;
  readonly failure?: CollectiveFailure;
  readonly completedAt?: string;
}

export type CollectiveEventType =
  | 'execution.started'
  | 'execution.resumed'
  | 'execution.paused'
  | 'execution.completed'
  | 'execution.failed'
  | 'execution.canceled'
  | 'work.assigned'
  | 'work.attempt_failed'
  | 'work.replanned'
  | 'work.completed'
  | 'work.failed';

export interface CollectiveEvent {
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly type: CollectiveEventType;
  readonly collectiveId: AgentPlatID;
  readonly executionId: AgentPlatID;
  readonly objectiveId: AgentPlatID;
  readonly occurredAt: string;
  readonly payload: JsonObject;
}

export interface CollectiveExecutionSnapshot {
  readonly schemaVersion: 1;
  readonly collectiveId: AgentPlatID;
  readonly tenantId: AgentPlatID;
  readonly executionId: AgentPlatID;
  readonly objective: CollectiveObjective;
  readonly plan: CollectivePlan;
  readonly policyId: AgentPlatID;
  readonly policyLimits: CollectivePolicyLimits;
  readonly status: CollectiveExecutionStatus;
  readonly revision: number;
  readonly workItems: readonly CollectiveWorkSnapshot[];
  readonly events: readonly CollectiveEvent[];
  readonly metadata?: Metadata;
  readonly failure?: CollectiveFailure;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
}

/**
 * Revision-checked persistence boundary. Implementations must atomically
 * compare `expectedRevision` and store the supplied next snapshot.
 */
export interface CollectiveStateStore {
  load(
    executionId: AgentPlatID
  ): Promise<CollectiveExecutionSnapshot | undefined>;
  save(
    snapshot: CollectiveExecutionSnapshot,
    expectedRevision: number | null
  ): Promise<void>;
}

export interface CreateCollectiveOptions {
  readonly collectiveId: AgentPlatID;
  readonly objective: CollectiveObjective;
  /** Exactly one of `plan` or `planner` is required. */
  readonly plan?: CollectivePlan;
  /** Exactly one of `plan` or `planner` is required. */
  readonly planner?: CollectivePlanner;
  readonly runtime: AgentRuntime;
  readonly tenant: TenantContext;
  readonly policies?: CollectivePolicies;
  readonly stateStore?: CollectiveStateStore;
  /** Execution-only credentials; never persisted or emitted. */
  readonly credentials?: Record<string, string>;
  /** Provider policies forwarded to each underlying AgentRuntime call. */
  readonly runtimePolicies?: JsonObject;
  readonly idGenerator?: () => AgentPlatID;
  readonly clock?: () => Date;
}

export interface CollectiveRunOptions {
  readonly executionId?: AgentPlatID;
  readonly signal?: AbortSignal;
  readonly metadata?: Metadata;
}

export type CollectiveEventListener = (event: CollectiveEvent) => void;

export interface Collective {
  readonly collectiveId: AgentPlatID;
  readonly objective: CollectiveObjective;

  register(registration: CollectiveAgentRegistration): Collective;
  unregister(agentId: AgentPlatID): boolean;
  listAgents(): readonly CollectiveAgentDescriptor[];
  subscribe(listener: CollectiveEventListener): () => void;
  run(options?: CollectiveRunOptions): Promise<CollectiveExecutionSnapshot>;
  resume(
    executionId: AgentPlatID,
    options?: Pick<CollectiveRunOptions, 'signal'>
  ): Promise<CollectiveExecutionSnapshot>;
  cancel(executionId: AgentPlatID): Promise<CollectiveExecutionSnapshot>;
  getExecution(
    executionId: AgentPlatID
  ): Promise<CollectiveExecutionSnapshot | undefined>;
}
