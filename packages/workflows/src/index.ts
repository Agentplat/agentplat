import type {
  AgentPlatID,
  ISODateTime,
  JsonObject,
  LifecycleStatus,
  Metadata,
  TenantScoped,
  Timestamped,
} from '@agentplat/core';

export type RunStatus = Extract<
  LifecycleStatus,
  'pending' | 'running' | 'completed' | 'failed' | 'canceled'
>;
export type StageStatus = RunStatus;

export interface TaskDefinition extends Timestamped {
  id: AgentPlatID;
  name: string;
  version: string;
  runtime: 'lambda' | 'fargate' | 'local' | 'external';
  description?: string;
  parameters?: JsonObject;
  status?: LifecycleStatus;
  metadata?: Metadata;
}

export interface TaskRun extends TenantScoped, Timestamped {
  id: AgentPlatID;
  taskDefinitionId: AgentPlatID;
  status: RunStatus;
  payload?: JsonObject;
  result?: JsonObject;
  errorMessage?: string;
  startedAt?: ISODateTime;
  finishedAt?: ISODateTime;
}

export interface ProcessStage {
  id: AgentPlatID;
  name: string;
  taskId: AgentPlatID;
  skillId?: AgentPlatID;
  retryLimit?: number;
  timeoutSec?: number;
  metadata?: Metadata;
}

export interface ProcessDefinition extends Timestamped {
  id: AgentPlatID;
  version: string;
  name: string;
  status: LifecycleStatus;
  description?: string;
  stages: ProcessStage[];
}

export interface ProcessStageState {
  stageId: AgentPlatID;
  taskId: AgentPlatID;
  status: StageStatus;
  taskRunId?: AgentPlatID;
  retryCount?: number;
  startedAt?: ISODateTime;
  finishedAt?: ISODateTime;
  errorMessage?: string;
}

export interface Artifact extends TenantScoped, Timestamped {
  artifactId: AgentPlatID;
  runId?: AgentPlatID;
  type: string;
  uri: string;
  contentType?: string;
  metadata?: Metadata;
}

export interface ProcessRun extends TenantScoped, Timestamped {
  runId: AgentPlatID;
  processId: AgentPlatID;
  processVersion?: string;
  status: RunStatus;
  stageStates: ProcessStageState[];
  artifactIds?: AgentPlatID[];
  childTaskRunIds?: AgentPlatID[];
  input?: JsonObject;
  result?: JsonObject;
  errorMessage?: string;
  startedAt?: ISODateTime;
  finishedAt?: ISODateTime;
}

export interface WorkflowStore {
  getProcessDefinition(
    processId: AgentPlatID
  ): Promise<ProcessDefinition | undefined>;
  getProcessRun(
    tenantId: AgentPlatID,
    runId: AgentPlatID
  ): Promise<ProcessRun | undefined>;
  saveProcessRun(run: ProcessRun): Promise<void>;
  getTaskRun(
    tenantId: AgentPlatID,
    taskRunId: AgentPlatID
  ): Promise<TaskRun | undefined>;
  saveTaskRun(run: TaskRun): Promise<void>;
}

export class InMemoryWorkflowStore implements WorkflowStore {
  private readonly definitions = new Map<AgentPlatID, ProcessDefinition>();
  private readonly processRuns = new Map<string, ProcessRun>();
  private readonly taskRuns = new Map<string, TaskRun>();

  registerProcessDefinition(definition: ProcessDefinition): void {
    this.definitions.set(definition.id, definition);
  }

  async getProcessDefinition(
    processId: AgentPlatID
  ): Promise<ProcessDefinition | undefined> {
    return this.definitions.get(processId);
  }

  async getProcessRun(
    tenantId: AgentPlatID,
    runId: AgentPlatID
  ): Promise<ProcessRun | undefined> {
    return this.processRuns.get(this.runKey(tenantId, runId));
  }

  async saveProcessRun(run: ProcessRun): Promise<void> {
    this.processRuns.set(this.runKey(run.tenantId, run.runId), run);
  }

  async getTaskRun(
    tenantId: AgentPlatID,
    taskRunId: AgentPlatID
  ): Promise<TaskRun | undefined> {
    return this.taskRuns.get(this.runKey(tenantId, taskRunId));
  }

  async saveTaskRun(run: TaskRun): Promise<void> {
    this.taskRuns.set(this.runKey(run.tenantId, run.id), run);
  }

  private runKey(tenantId: AgentPlatID, runId: AgentPlatID): string {
    return `${tenantId}:${runId}`;
  }
}
