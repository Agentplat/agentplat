import {
  AgentPlatError,
  type AgentPlatID,
  type JsonObject,
  type JsonValue,
  type Metadata,
  type TenantContext,
} from '@agentplat/core';
import type {
  AgentDefinition,
  AgentProvider,
  AgentRunInput,
  AgentRunResult,
  AgentRuntime,
  RuntimeExecutionContext,
} from '@agentplat/runtime';
import type { RunStatus, TaskRun, WorkflowStore } from '@agentplat/workflows';

/** Current major A2A protocol version supported by AgentPlat. */
export const A2A_PROTOCOL_VERSION = '1.0';
export const A2A_AGENT_CARD_PATH = '/.well-known/agent-card.json';

export type A2AProtocolBinding = 'HTTP+JSON' | 'JSONRPC' | 'GRPC';
export type A2AMessageRole = 'ROLE_USER' | 'ROLE_AGENT';
export type A2ATaskState =
  | 'TASK_STATE_SUBMITTED'
  | 'TASK_STATE_WORKING'
  | 'TASK_STATE_COMPLETED'
  | 'TASK_STATE_FAILED'
  | 'TASK_STATE_CANCELED'
  | 'TASK_STATE_REJECTED'
  | 'TASK_STATE_INPUT_REQUIRED'
  | 'TASK_STATE_AUTH_REQUIRED';

export interface A2AAgentSkill {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  examples?: string[];
}

export interface A2AAgentInterface {
  url: string;
  protocolBinding: A2AProtocolBinding;
  protocolVersion: string;
  tenant?: string;
}

/** A2A v1 Agent Card subset used for discovery and HTTP+JSON invocation. */
export interface A2AAgentCard {
  name: string;
  description: string;
  version: string;
  supportedInterfaces: A2AAgentInterface[];
  skills: A2AAgentSkill[];
  defaultInputModes: string[];
  defaultOutputModes: string[];
  capabilities?: JsonObject;
  securitySchemes?: JsonObject;
  extensions?: JsonObject[];
  signatures?: JsonObject[];
}

/** Unified A2A v1 Part; the populated content field discriminates the type. */
export interface A2APart {
  text?: string;
  url?: string;
  raw?: string;
  data?: JsonObject;
  filename?: string;
  mediaType?: string;
}

export interface A2AMessage {
  messageId: string;
  role: A2AMessageRole;
  parts: A2APart[];
  contextId?: string;
  taskId?: string;
  extensions?: string[];
}

export interface A2AArtifact {
  artifactId: string;
  name?: string;
  parts: A2APart[];
  description?: string;
  extensions?: string[];
}

export interface A2ATaskStatus {
  state: A2ATaskState;
  timestamp: string;
  message?: A2AMessage;
}

export interface A2ATask {
  id: string;
  contextId: string;
  status: A2ATaskStatus;
  history?: A2AMessage[];
  artifacts?: A2AArtifact[];
  createdAt: string;
  lastModified: string;
}

/** A2A v1 stream envelope. Exactly one member is present for each event. */
export type A2AStreamEvent =
  | { task: A2ATask }
  | { message: A2AMessage }
  | { statusUpdate: A2ATaskStatusUpdate }
  | { artifactUpdate: A2ATaskArtifactUpdate };

export interface A2ATaskStatusUpdate {
  taskId: string;
  contextId: string;
  status: A2ATaskStatus;
}

export interface A2ATaskArtifactUpdate {
  taskId: string;
  contextId: string;
  artifact: A2AArtifact;
  append?: boolean;
  lastChunk?: boolean;
}

export type A2ASendMessageResult = { message: A2AMessage } | { task: A2ATask };

export interface A2ARequestHeaders {
  [name: string]: string;
}

export interface A2AHttpClientOptions {
  /** A full Agent Card URL or a base agent URL. */
  agentCardUrl: string;
  fetch?: typeof globalThis.fetch;
  /** Supply short-lived OAuth/workload credentials; the client never persists them. */
  headers?: () => A2ARequestHeaders | Promise<A2ARequestHeaders>;
}

/** Dependency-free A2A v1 HTTP+JSON client for discovery, messages and tasks. */
export class A2AHttpClient {
  private card?: A2AAgentCard;
  private readonly fetchImplementation: typeof globalThis.fetch;

  constructor(private readonly options: A2AHttpClientOptions) {
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    if (!this.fetchImplementation) {
      throw new AgentPlatError(
        'ADAPTER_ERROR',
        'An A2A fetch implementation is required'
      );
    }
  }

  async discover(signal?: AbortSignal): Promise<A2AAgentCard> {
    if (this.card) return this.card;
    const response = await this.fetchImplementation(
      agentCardUrl(this.options.agentCardUrl),
      {
        headers: await this.requestHeaders(),
        signal,
      }
    );
    if (!response.ok) {
      throw await a2aHttpError(response, 'Could not discover A2A Agent Card');
    }
    this.card = parseAgentCard(await response.json());
    return this.card;
  }

  async sendMessage(
    message: A2AMessage,
    options: {
      returnImmediately?: boolean;
      tenant?: string;
      signal?: AbortSignal;
    } = {}
  ): Promise<A2ASendMessageResult> {
    const card = await this.discover(options.signal);
    const response = await this.fetchImplementation(
      operationUrl(card, 'message:send'),
      {
        method: 'POST',
        headers: {
          ...(await this.requestHeaders()),
          'content-type': 'application/json',
          'a2a-version': A2A_PROTOCOL_VERSION,
        },
        body: JSON.stringify({
          message: messageToJson(message),
          ...(options.returnImmediately === undefined
            ? {}
            : { returnImmediately: options.returnImmediately }),
          ...(options.tenant ? { tenant: options.tenant } : {}),
        }),
        signal: options.signal,
      }
    );
    if (!response.ok)
      throw await a2aHttpError(response, 'A2A SendMessage failed');
    return parseSendMessageResult(await response.json());
  }

  async getTask(taskId: string, signal?: AbortSignal): Promise<A2ATask> {
    const card = await this.discover(signal);
    const response = await this.fetchImplementation(
      operationUrl(card, `tasks/${encodeURIComponent(taskId)}`),
      { headers: await this.requestHeaders(), signal }
    );
    if (!response.ok)
      throw await a2aHttpError(response, `Could not get A2A task ${taskId}`);
    return parseTask(await response.json());
  }

  async cancelTask(taskId: string, signal?: AbortSignal): Promise<A2ATask> {
    const card = await this.discover(signal);
    const response = await this.fetchImplementation(
      operationUrl(card, `tasks/${encodeURIComponent(taskId)}:cancel`),
      {
        method: 'POST',
        headers: {
          ...(await this.requestHeaders()),
          'content-type': 'application/json',
          'a2a-version': A2A_PROTOCOL_VERSION,
        },
        signal,
      }
    );
    if (!response.ok)
      throw await a2aHttpError(response, `Could not cancel A2A task ${taskId}`);
    return parseTask(await response.json());
  }

  /** Starts an A2A v1 SSE message stream. Cancel the supplied signal to close it. */
  async *sendStreamingMessage(
    message: A2AMessage,
    options: { tenant?: string; signal?: AbortSignal } = {}
  ): AsyncIterable<A2AStreamEvent> {
    const card = await this.discover(options.signal);
    const response = await this.fetchImplementation(
      operationUrl(card, 'message:stream'),
      {
        method: 'POST',
        headers: {
          ...(await this.requestHeaders()),
          accept: 'text/event-stream',
          'content-type': 'application/json',
          'a2a-version': A2A_PROTOCOL_VERSION,
        },
        body: JSON.stringify({
          message: messageToJson(message),
          ...(options.tenant ? { tenant: options.tenant } : {}),
        }),
        signal: options.signal,
      }
    );
    if (!response.ok)
      throw await a2aHttpError(response, 'A2A SendStreamingMessage failed');
    yield* parseSse(response);
  }

  /** Subscribes to subsequent updates for a non-terminal task via SSE. */
  async *subscribeToTask(
    taskId: string,
    options: { tenant?: string; signal?: AbortSignal } = {}
  ): AsyncIterable<A2AStreamEvent> {
    const card = await this.discover(options.signal);
    const endpoint = new URL(
      `tasks/${encodeURIComponent(taskId)}:subscribe`,
      withTrailingSlash(interfaceUrl(card))
    );
    if (options.tenant) endpoint.searchParams.set('tenant', options.tenant);
    const response = await this.fetchImplementation(endpoint, {
      headers: {
        ...(await this.requestHeaders()),
        accept: 'text/event-stream',
        'a2a-version': A2A_PROTOCOL_VERSION,
      },
      signal: options.signal,
    });
    if (!response.ok)
      throw await a2aHttpError(
        response,
        `Could not subscribe to A2A task ${taskId}`
      );
    yield* parseSse(response);
  }

  private async requestHeaders(): Promise<A2ARequestHeaders> {
    return this.options.headers ? await this.options.headers() : {};
  }
}

export interface A2ARemoteAgentProviderOptions {
  clientForAgent(
    agent: AgentDefinition,
    context: RuntimeExecutionContext
  ): A2AHttpClient | Promise<A2AHttpClient>;
}

/** Adapts a remote A2A agent to the AgentPlat AgentProvider contract. */
export class A2ARemoteAgentProvider implements AgentProvider {
  constructor(private readonly options: A2ARemoteAgentProviderOptions) {}

  async run(
    agent: AgentDefinition,
    input: AgentRunInput,
    context: RuntimeExecutionContext
  ): Promise<AgentRunResult> {
    const client = await this.options.clientForAgent(agent, context);
    const result = await client.sendMessage(
      {
        messageId: context.runId ?? createId('message'),
        role: 'ROLE_USER',
        parts: agentInputToParts(input.input),
        ...(input.conversationId ? { contextId: input.conversationId } : {}),
      },
      {
        tenant: context.tenant.tenantId,
        signal: context.signal,
      }
    );

    if ('message' in result) {
      return {
        runId: context.runId,
        conversationId: result.message.contextId ?? input.conversationId,
        status: 'completed',
        output: partsToText(result.message.parts),
        result: { a2aMessage: messageToJson(result.message) },
      };
    }

    return {
      runId: result.task.id,
      conversationId: result.task.contextId,
      status: a2aStateToRunStatus(result.task.status.state),
      output: result.task.status.message
        ? partsToText(result.task.status.message.parts)
        : taskArtifactsToText(result.task.artifacts),
      result: { a2aTask: taskToJson(result.task) },
    };
  }
}

export interface A2ATaskStore {
  get(tenantId: AgentPlatID, taskId: string): Promise<A2ATask | undefined>;
  save(tenantId: AgentPlatID, task: A2ATask): Promise<void>;
}

/** Optional event transport. Use a shared implementation when server instances scale out. */
export interface A2ATaskEventStore extends A2ATaskStore {
  publish(tenantId: AgentPlatID, event: A2AStreamEvent): Promise<void>;
  subscribe(
    tenantId: AgentPlatID,
    taskId: string,
    listener: (event: A2AStreamEvent) => void
  ): Promise<() => void>;
}

/** Useful for local development and tests; production stores must be tenant-isolated. */
export class InMemoryA2ATaskStore implements A2ATaskEventStore {
  private readonly tasks = new Map<string, A2ATask>();
  private readonly subscribers = new Map<
    string,
    Set<(event: A2AStreamEvent) => void>
  >();

  async get(
    tenantId: AgentPlatID,
    taskId: string
  ): Promise<A2ATask | undefined> {
    return this.tasks.get(`${tenantId}:${taskId}`);
  }

  async save(tenantId: AgentPlatID, task: A2ATask): Promise<void> {
    this.tasks.set(`${tenantId}:${task.id}`, task);
  }

  async publish(tenantId: AgentPlatID, event: A2AStreamEvent): Promise<void> {
    const taskId = streamEventTaskId(event);
    for (const listener of this.subscribers.get(`${tenantId}:${taskId}`) ??
      []) {
      listener(event);
    }
  }

  async subscribe(
    tenantId: AgentPlatID,
    taskId: string,
    listener: (event: A2AStreamEvent) => void
  ): Promise<() => void> {
    const key = `${tenantId}:${taskId}`;
    const listeners = this.subscribers.get(key) ?? new Set();
    listeners.add(listener);
    this.subscribers.set(key, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.subscribers.delete(key);
    };
  }
}

/**
 * Persists A2A task snapshots in the existing WorkflowStore. It deliberately
 * leaves event delivery to a separate A2ATaskEventStore/pub-sub adapter.
 */
export class WorkflowA2ATaskStore implements A2ATaskStore {
  constructor(
    private readonly workflowStore: WorkflowStore,
    private readonly taskDefinitionId: AgentPlatID
  ) {}

  async get(
    tenantId: AgentPlatID,
    taskId: string
  ): Promise<A2ATask | undefined> {
    const run = await this.workflowStore.getTaskRun(tenantId, taskId);
    const snapshot = run?.payload?.a2aTask;
    return snapshot ? parseTask(snapshot) : undefined;
  }

  async save(tenantId: AgentPlatID, task: A2ATask): Promise<void> {
    const run: TaskRun = {
      id: task.id,
      tenantId,
      taskDefinitionId: this.taskDefinitionId,
      status: a2aStateToRunStatus(task.status.state),
      payload: { a2aTask: taskToJson(task) },
      createdAt: task.createdAt,
      updatedAt: task.lastModified,
      ...(isTerminalA2aState(task.status.state)
        ? { finishedAt: task.lastModified }
        : { startedAt: task.createdAt }),
    };
    await this.workflowStore.saveTaskRun(run);
  }
}

/**
 * Worker-facing task lifecycle API. It persists the snapshot before notifying
 * subscribers, so reconnecting clients can always retrieve the latest state.
 */
export class A2ATaskService {
  constructor(private readonly store: A2ATaskStore) {}

  async updateStatus(
    tenantId: AgentPlatID,
    taskId: string,
    status: A2ATaskStatus
  ): Promise<A2ATask> {
    const task = await this.requireTask(tenantId, taskId);
    task.status = status;
    task.lastModified = status.timestamp;
    if (status.message)
      task.history = [...(task.history ?? []), status.message];
    await this.store.save(tenantId, task);
    await this.publish(tenantId, {
      statusUpdate: { taskId, contextId: task.contextId, status },
    });
    return task;
  }

  async appendArtifact(
    tenantId: AgentPlatID,
    taskId: string,
    artifact: A2AArtifact,
    options: { append?: boolean; lastChunk?: boolean; timestamp?: string } = {}
  ): Promise<A2ATask> {
    const task = await this.requireTask(tenantId, taskId);
    const prior = task.artifacts ?? [];
    const artifacts = options.append
      ? prior.map((candidate) =>
          candidate.artifactId === artifact.artifactId
            ? { ...candidate, parts: [...candidate.parts, ...artifact.parts] }
            : candidate
        )
      : [
          ...prior.filter(
            (candidate) => candidate.artifactId !== artifact.artifactId
          ),
          artifact,
        ];
    task.artifacts = artifacts.some(
      (candidate) => candidate.artifactId === artifact.artifactId
    )
      ? artifacts
      : [...artifacts, artifact];
    task.lastModified = options.timestamp ?? new Date().toISOString();
    await this.store.save(tenantId, task);
    await this.publish(tenantId, {
      artifactUpdate: {
        taskId,
        contextId: task.contextId,
        artifact,
        ...(options.append !== undefined ? { append: options.append } : {}),
        ...(options.lastChunk !== undefined
          ? { lastChunk: options.lastChunk }
          : {}),
      },
    });
    return task;
  }

  private async requireTask(
    tenantId: AgentPlatID,
    taskId: string
  ): Promise<A2ATask> {
    const task = await this.store.get(tenantId, taskId);
    if (!task)
      throw new AgentPlatError('NOT_FOUND', `A2A task ${taskId} not found`);
    return task;
  }

  private async publish(
    tenantId: AgentPlatID,
    event: A2AStreamEvent
  ): Promise<void> {
    if (isA2ATaskEventStore(this.store))
      await this.store.publish(tenantId, event);
  }
}

export interface A2AServerExecutionContext {
  tenant: TenantContext;
  credentials?: Record<string, string>;
  metadata?: Metadata;
}

export interface A2AHttpServerOptions {
  card: A2AAgentCard;
  runtime: AgentRuntime;
  resolveExecutionContext(
    request: Request
  ): Promise<A2AServerExecutionContext | undefined>;
  resolveAgent(
    request: Request,
    context: A2AServerExecutionContext
  ): Promise<AgentDefinition | undefined>;
  taskStore?: A2ATaskStore;
  /** Prefix where A2A HTTP+JSON operations are mounted, e.g. `/a2a`. */
  basePath?: string;
}

/**
 * Fetch-compatible A2A v1 HTTP+JSON server.
 *
 * Completed runs return messages; long-running runs are persisted as tasks.
 * Streaming transports task updates over SSE. The runtime contract is not
 * token-streaming yet, so a synchronous runtime emits its final update once
 * available; an external worker may publish incremental updates through the
 * configured A2ATaskEventStore.
 */
export class A2AHttpServer {
  private readonly taskStore: A2ATaskStore;

  constructor(private readonly options: A2AHttpServerOptions) {
    this.taskStore = options.taskStore ?? new InMemoryA2ATaskStore();
  }

  async handle(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (
      request.method === 'GET' &&
      path === joinBasePath(this.options.basePath, A2A_AGENT_CARD_PATH)
    ) {
      return Response.json(agentCardToJson(this.options.card));
    }

    const requestedVersion = request.headers.get('a2a-version');
    if (
      requestedVersion &&
      !requestedVersion.startsWith(A2A_PROTOCOL_VERSION)
    ) {
      return a2aError(400, 'VERSION_NOT_SUPPORTED', 'Unsupported A2A version');
    }

    const relativePath = removeBasePath(path, this.options.basePath);
    try {
      const context = await this.options.resolveExecutionContext(request);
      if (!context) return a2aError(401, 'UNAUTHENTICATED', 'Unauthenticated');

      if (request.method === 'POST' && relativePath === '/message:send') {
        return this.sendMessage(request, context);
      }
      if (request.method === 'POST' && relativePath === '/message:stream') {
        return this.sendStreamingMessage(request, context);
      }

      const taskMatch = /^\/tasks\/([^/:]+)$/.exec(relativePath);
      if (request.method === 'GET' && taskMatch) {
        return this.getTask(decodeURIComponent(taskMatch[1]), context);
      }

      const cancelMatch = /^\/tasks\/([^/:]+):cancel$/.exec(relativePath);
      if (request.method === 'POST' && cancelMatch) {
        return this.cancelTask(decodeURIComponent(cancelMatch[1]), context);
      }

      const subscribeMatch = /^\/tasks\/([^/:]+):subscribe$/.exec(relativePath);
      if (request.method === 'GET' && subscribeMatch) {
        return this.subscribeToTask(
          decodeURIComponent(subscribeMatch[1]),
          context
        );
      }

      return a2aError(404, 'NOT_FOUND', 'A2A operation not found');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Internal server error';
      return a2aError(500, 'INTERNAL', message);
    }
  }

  private async sendMessage(
    request: Request,
    context: A2AServerExecutionContext,
    forceTask = false
  ): Promise<Response> {
    let body: JsonObject;
    try {
      body = asJsonObject(await request.json());
    } catch {
      return a2aError(400, 'INVALID_ARGUMENT', 'Invalid A2A message request');
    }
    if (
      typeof body.tenant === 'string' &&
      body.tenant !== context.tenant.tenantId
    ) {
      return a2aError(
        403,
        'TENANT_MISMATCH',
        'Requested tenant is not authorized'
      );
    }
    let message: A2AMessage;
    try {
      message = parseMessage(body.message);
    } catch {
      return a2aError(400, 'INVALID_ARGUMENT', 'Invalid A2A message');
    }
    if (message.role !== 'ROLE_USER') {
      return a2aError(
        400,
        'INVALID_ARGUMENT',
        'SendMessage requires a user message'
      );
    }
    const agent = await this.options.resolveAgent(request, context);
    if (!agent) return a2aError(404, 'AGENT_NOT_FOUND', 'Agent not found');

    const runId = createId('run');
    const result = await this.options.runtime.run(
      agent,
      {
        input: partsToAgentInput(message.parts),
        mode: 'invoke',
        ...(message.contextId ? { conversationId: message.contextId } : {}),
      },
      {
        tenant: context.tenant,
        agentId: agent.id,
        runId,
        signal: request.signal,
        ...(context.credentials ? { credentials: context.credentials } : {}),
        ...(context.metadata ? { metadata: context.metadata } : {}),
      }
    );

    const taskContextId = message.contextId ?? runId;
    const outputMessage = resultToMessage(result, taskContextId, runId);
    if (
      result.status === 'completed' &&
      body.returnImmediately !== true &&
      !forceTask
    ) {
      return Response.json({ message: messageToJson(outputMessage) });
    }

    const now = new Date().toISOString();
    const task: A2ATask = {
      id: result.runId ?? runId,
      contextId: taskContextId,
      status: {
        state: runStatusToA2aState(result.status),
        timestamp: now,
        message: outputMessage,
      },
      history: [message, outputMessage],
      createdAt: now,
      lastModified: now,
    };
    await this.taskStore.save(context.tenant.tenantId, task);
    await this.publish(context.tenant.tenantId, { task });
    await this.publish(context.tenant.tenantId, {
      statusUpdate: {
        taskId: task.id,
        contextId: task.contextId,
        status: task.status,
      },
    });
    return Response.json({ task: taskToJson(task) });
  }

  private async sendStreamingMessage(
    request: Request,
    context: A2AServerExecutionContext
  ): Promise<Response> {
    if (!streamingEnabled(this.options.card)) {
      return a2aError(400, 'UNSUPPORTED_OPERATION', 'Streaming is not enabled');
    }
    const response = await this.sendMessage(request, context, true);
    if (!response.ok) return response;
    const result = asJsonObject(await response.json());
    if (result.task) {
      const task = parseTask(result.task);
      return sseResponse([
        { task },
        {
          statusUpdate: {
            taskId: task.id,
            contextId: task.contextId,
            status: task.status,
          },
        },
      ]);
    }
    return sseResponse([{ message: parseMessage(result.message) }]);
  }

  private async getTask(
    taskId: string,
    context: A2AServerExecutionContext
  ): Promise<Response> {
    const task = await this.taskStore.get(context.tenant.tenantId, taskId);
    if (!task) return a2aError(404, 'TASK_NOT_FOUND', 'Task not found');
    return Response.json(taskToJson(task));
  }

  private async cancelTask(
    taskId: string,
    context: A2AServerExecutionContext
  ): Promise<Response> {
    const task = await this.taskStore.get(context.tenant.tenantId, taskId);
    if (!task) return a2aError(404, 'TASK_NOT_FOUND', 'Task not found');
    if (!isTerminalA2aState(task.status.state)) {
      task.status = {
        state: 'TASK_STATE_CANCELED',
        timestamp: new Date().toISOString(),
        message: task.status.message,
      };
      task.lastModified = task.status.timestamp;
      await this.taskStore.save(context.tenant.tenantId, task);
      await this.publish(context.tenant.tenantId, {
        statusUpdate: {
          taskId: task.id,
          contextId: task.contextId,
          status: task.status,
        },
      });
    }
    return Response.json(taskToJson(task));
  }

  private async subscribeToTask(
    taskId: string,
    context: A2AServerExecutionContext
  ): Promise<Response> {
    if (!streamingEnabled(this.options.card)) {
      return a2aError(400, 'UNSUPPORTED_OPERATION', 'Streaming is not enabled');
    }
    const task = await this.taskStore.get(context.tenant.tenantId, taskId);
    if (!task) return a2aError(404, 'TASK_NOT_FOUND', 'Task not found');
    if (isTerminalA2aState(task.status.state)) {
      return a2aError(
        400,
        'UNSUPPORTED_OPERATION',
        'Cannot subscribe to a terminal task'
      );
    }
    if (!isA2ATaskEventStore(this.taskStore)) {
      return a2aError(
        501,
        'UNSUPPORTED_OPERATION',
        'This task store does not provide event subscriptions'
      );
    }
    return subscriptionSseResponse(
      this.taskStore,
      context.tenant.tenantId,
      task
    );
  }

  private async publish(
    tenantId: AgentPlatID,
    event: A2AStreamEvent
  ): Promise<void> {
    if (isA2ATaskEventStore(this.taskStore)) {
      await this.taskStore.publish(tenantId, event);
    }
  }
}

function agentCardUrl(url: string): string {
  return url.includes(A2A_AGENT_CARD_PATH)
    ? url
    : new URL(A2A_AGENT_CARD_PATH.slice(1), withTrailingSlash(url)).toString();
}

function operationUrl(card: A2AAgentCard, operation: string): string {
  return new URL(operation, withTrailingSlash(interfaceUrl(card))).toString();
}

function interfaceUrl(card: A2AAgentCard): string {
  const endpoint = card.supportedInterfaces.find(
    (candidate) =>
      candidate.protocolBinding === 'HTTP+JSON' &&
      candidate.protocolVersion.startsWith(A2A_PROTOCOL_VERSION)
  );
  if (!endpoint) {
    throw new AgentPlatError(
      'ADAPTER_ERROR',
      'A2A Agent Card has no compatible HTTP+JSON interface'
    );
  }
  return endpoint.url;
}

function withTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function removeBasePath(path: string, basePath = ''): string {
  const normalized = basePath === '/' ? '' : basePath.replace(/\/$/, '');
  return normalized && path.startsWith(normalized)
    ? path.slice(normalized.length) || '/'
    : path;
}

function joinBasePath(basePath: string | undefined, path: string): string {
  const normalized = basePath?.replace(/\/$/, '') ?? '';
  return normalized ? `${normalized}${path}` : path;
}

function parseAgentCard(value: unknown): A2AAgentCard {
  const card = asJsonObject(value);
  if (
    typeof card.name !== 'string' ||
    typeof card.description !== 'string' ||
    typeof card.version !== 'string'
  ) {
    throw new AgentPlatError(
      'ADAPTER_ERROR',
      'A2A Agent Card is missing required identity fields'
    );
  }
  if (!Array.isArray(card.supportedInterfaces) || !Array.isArray(card.skills)) {
    throw new AgentPlatError(
      'ADAPTER_ERROR',
      'A2A Agent Card is missing interfaces or skills'
    );
  }
  return {
    name: card.name,
    description: card.description,
    version: card.version,
    supportedInterfaces: card.supportedInterfaces.map(parseAgentInterface),
    skills: card.skills.map(parseAgentSkill),
    defaultInputModes: strings(card.defaultInputModes),
    defaultOutputModes: strings(card.defaultOutputModes),
    ...(isJsonObject(card.capabilities)
      ? { capabilities: card.capabilities }
      : {}),
    ...(isJsonObject(card.securitySchemes)
      ? { securitySchemes: card.securitySchemes }
      : {}),
  };
}

function parseAgentInterface(value: unknown): A2AAgentInterface {
  const entry = asJsonObject(value);
  if (
    typeof entry.url !== 'string' ||
    typeof entry.protocolBinding !== 'string' ||
    typeof entry.protocolVersion !== 'string'
  ) {
    throw new AgentPlatError(
      'ADAPTER_ERROR',
      'A2A Agent Card contains an invalid interface'
    );
  }
  if (
    entry.protocolBinding !== 'HTTP+JSON' &&
    entry.protocolBinding !== 'JSONRPC' &&
    entry.protocolBinding !== 'GRPC'
  ) {
    throw new AgentPlatError(
      'ADAPTER_ERROR',
      `Unsupported A2A binding: ${entry.protocolBinding}`
    );
  }
  return {
    url: entry.url,
    protocolBinding: entry.protocolBinding,
    protocolVersion: entry.protocolVersion,
    ...(typeof entry.tenant === 'string' ? { tenant: entry.tenant } : {}),
  };
}

function parseAgentSkill(value: unknown): A2AAgentSkill {
  const skill = asJsonObject(value);
  if (
    typeof skill.id !== 'string' ||
    typeof skill.name !== 'string' ||
    typeof skill.description !== 'string'
  ) {
    throw new AgentPlatError(
      'ADAPTER_ERROR',
      'A2A Agent Card contains an invalid skill'
    );
  }
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    ...(Array.isArray(skill.tags) ? { tags: strings(skill.tags) } : {}),
  };
}

function parseSendMessageResult(value: unknown): A2ASendMessageResult {
  const result = asJsonObject(value);
  if (result.message !== undefined)
    return { message: parseMessage(result.message) };
  if (result.task !== undefined) return { task: parseTask(result.task) };
  if (result.status !== undefined) return { task: parseTask(result) };
  if (result.parts !== undefined) return { message: parseMessage(result) };
  throw new AgentPlatError(
    'ADAPTER_ERROR',
    'A2A SendMessage returned neither a message nor a task'
  );
}

function parseStreamEvent(value: unknown): A2AStreamEvent {
  const event = asJsonObject(value);
  if (event.task !== undefined) return { task: parseTask(event.task) };
  if (event.message !== undefined)
    return { message: parseMessage(event.message) };
  if (event.statusUpdate !== undefined)
    return { statusUpdate: parseStatusUpdate(event.statusUpdate) };
  if (event.artifactUpdate !== undefined)
    return { artifactUpdate: parseArtifactUpdate(event.artifactUpdate) };
  throw new AgentPlatError('ADAPTER_ERROR', 'Invalid A2A stream event');
}

async function* parseSse(response: Response): AsyncIterable<A2AStreamEvent> {
  if (!response.body) {
    throw new AgentPlatError(
      'ADAPTER_ERROR',
      'A2A stream response has no body'
    );
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) yield parseStreamEvent(JSON.parse(data));
      }
    }
    const data = buffer
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (data) yield parseStreamEvent(JSON.parse(data));
  } finally {
    reader.releaseLock();
  }
}

function parseMessage(value: unknown): A2AMessage {
  const message = asJsonObject(value);
  if (
    typeof message.messageId !== 'string' ||
    (message.role !== 'ROLE_USER' && message.role !== 'ROLE_AGENT') ||
    !Array.isArray(message.parts)
  ) {
    throw new AgentPlatError('VALIDATION_ERROR', 'Invalid A2A message');
  }
  return {
    messageId: message.messageId,
    role: message.role,
    parts: message.parts.map(parsePart),
    ...(typeof message.contextId === 'string'
      ? { contextId: message.contextId }
      : {}),
    ...(typeof message.taskId === 'string' ? { taskId: message.taskId } : {}),
  };
}

function parseTask(value: unknown): A2ATask {
  const task = asJsonObject(value);
  const status = asJsonObject(task.status);
  if (
    typeof task.id !== 'string' ||
    typeof task.contextId !== 'string' ||
    typeof status.state !== 'string' ||
    typeof status.timestamp !== 'string'
  ) {
    throw new AgentPlatError('ADAPTER_ERROR', 'Invalid A2A task');
  }
  return {
    id: task.id,
    contextId: task.contextId,
    status: {
      state: parseTaskState(status.state),
      timestamp: status.timestamp,
      ...(status.message ? { message: parseMessage(status.message) } : {}),
    },
    ...(Array.isArray(task.history)
      ? { history: task.history.map(parseMessage) }
      : {}),
    ...(Array.isArray(task.artifacts)
      ? { artifacts: task.artifacts.map(parseArtifact) }
      : {}),
    createdAt:
      typeof task.createdAt === 'string' ? task.createdAt : status.timestamp,
    lastModified:
      typeof task.lastModified === 'string'
        ? task.lastModified
        : status.timestamp,
  };
}

function parseTaskState(value: string): A2ATaskState {
  if (!value.startsWith('TASK_STATE_'))
    throw new AgentPlatError(
      'ADAPTER_ERROR',
      `Unknown A2A task state: ${value}`
    );
  return value as A2ATaskState;
}

function parseStatusUpdate(value: unknown): A2ATaskStatusUpdate {
  const update = asJsonObject(value);
  if (
    typeof update.taskId !== 'string' ||
    typeof update.contextId !== 'string' ||
    !isJsonObject(update.status)
  ) {
    throw new AgentPlatError('ADAPTER_ERROR', 'Invalid A2A task status update');
  }
  const status = update.status;
  if (
    typeof status.state !== 'string' ||
    typeof status.timestamp !== 'string'
  ) {
    throw new AgentPlatError('ADAPTER_ERROR', 'Invalid A2A task status');
  }
  return {
    taskId: update.taskId,
    contextId: update.contextId,
    status: {
      state: parseTaskState(status.state),
      timestamp: status.timestamp,
      ...(status.message ? { message: parseMessage(status.message) } : {}),
    },
  };
}

function parseArtifactUpdate(value: unknown): A2ATaskArtifactUpdate {
  const update = asJsonObject(value);
  if (
    typeof update.taskId !== 'string' ||
    typeof update.contextId !== 'string' ||
    update.artifact === undefined
  ) {
    throw new AgentPlatError('ADAPTER_ERROR', 'Invalid A2A artifact update');
  }
  return {
    taskId: update.taskId,
    contextId: update.contextId,
    artifact: parseArtifact(update.artifact),
    ...(typeof update.append === 'boolean' ? { append: update.append } : {}),
    ...(typeof update.lastChunk === 'boolean'
      ? { lastChunk: update.lastChunk }
      : {}),
  };
}

function parseArtifact(value: unknown): A2AArtifact {
  const artifact = asJsonObject(value);
  if (typeof artifact.artifactId !== 'string' || !Array.isArray(artifact.parts))
    throw new AgentPlatError('ADAPTER_ERROR', 'Invalid A2A artifact');
  return {
    artifactId: artifact.artifactId,
    parts: artifact.parts.map(parsePart),
    ...(typeof artifact.name === 'string' ? { name: artifact.name } : {}),
  };
}

function parsePart(value: unknown): A2APart {
  const part = asJsonObject(value);
  if (typeof part.text === 'string')
    return {
      text: part.text,
      ...(typeof part.mediaType === 'string'
        ? { mediaType: part.mediaType }
        : {}),
    };
  if (typeof part.url === 'string')
    return {
      url: part.url,
      ...(typeof part.filename === 'string' ? { filename: part.filename } : {}),
      ...(typeof part.mediaType === 'string'
        ? { mediaType: part.mediaType }
        : {}),
    };
  if (typeof part.raw === 'string')
    return {
      raw: part.raw,
      ...(typeof part.filename === 'string' ? { filename: part.filename } : {}),
      ...(typeof part.mediaType === 'string'
        ? { mediaType: part.mediaType }
        : {}),
    };
  if (isJsonObject(part.data))
    return {
      data: part.data,
      ...(typeof part.mediaType === 'string'
        ? { mediaType: part.mediaType }
        : {}),
    };
  throw new AgentPlatError('VALIDATION_ERROR', 'Invalid A2A part');
}

function resultToMessage(
  result: AgentRunResult,
  contextId: string | undefined,
  taskId: string
): A2AMessage {
  return {
    messageId: createId('message'),
    role: 'ROLE_AGENT',
    parts: [{ text: result.output ?? result.errorMessage ?? '' }],
    ...(contextId ? { contextId } : {}),
    taskId,
  };
}

function agentInputToParts(input: AgentRunInput['input']): A2APart[] {
  return typeof input === 'string'
    ? [{ text: input }]
    : input.map((data) => ({ data }));
}

function partsToAgentInput(parts: A2APart[]): AgentRunInput['input'] {
  return parts.every((part) => typeof part.text === 'string')
    ? partsToText(parts)
    : parts.map(partToJson);
}

function partsToText(parts: A2APart[]): string {
  return parts
    .map(
      (part) =>
        part.text ?? (part.data ? JSON.stringify(part.data) : (part.url ?? ''))
    )
    .filter(Boolean)
    .join('\n');
}

function taskArtifactsToText(
  artifacts: A2AArtifact[] | undefined
): string | undefined {
  return (
    artifacts
      ?.flatMap((artifact) => artifact.parts)
      .map((part) => part.text ?? '')
      .filter(Boolean)
      .join('\n') || undefined
  );
}

function a2aStateToRunStatus(state: A2ATaskState): RunStatus {
  const map: Record<A2ATaskState, RunStatus> = {
    TASK_STATE_SUBMITTED: 'pending',
    TASK_STATE_WORKING: 'running',
    TASK_STATE_COMPLETED: 'completed',
    TASK_STATE_FAILED: 'failed',
    TASK_STATE_CANCELED: 'canceled',
    TASK_STATE_REJECTED: 'rejected',
    TASK_STATE_INPUT_REQUIRED: 'input_required',
    TASK_STATE_AUTH_REQUIRED: 'auth_required',
  };
  return map[state];
}

function runStatusToA2aState(status: RunStatus): A2ATaskState {
  const map: Record<RunStatus, A2ATaskState> = {
    pending: 'TASK_STATE_SUBMITTED',
    running: 'TASK_STATE_WORKING',
    completed: 'TASK_STATE_COMPLETED',
    failed: 'TASK_STATE_FAILED',
    canceled: 'TASK_STATE_CANCELED',
    rejected: 'TASK_STATE_REJECTED',
    input_required: 'TASK_STATE_INPUT_REQUIRED',
    auth_required: 'TASK_STATE_AUTH_REQUIRED',
  };
  return map[status];
}

function isTerminalA2aState(state: A2ATaskState): boolean {
  return (
    state === 'TASK_STATE_COMPLETED' ||
    state === 'TASK_STATE_FAILED' ||
    state === 'TASK_STATE_CANCELED' ||
    state === 'TASK_STATE_REJECTED'
  );
}

function messageToJson(message: A2AMessage): JsonObject {
  return {
    messageId: message.messageId,
    role: message.role,
    parts: message.parts.map(partToJson),
    ...(message.contextId ? { contextId: message.contextId } : {}),
    ...(message.taskId ? { taskId: message.taskId } : {}),
  };
}

function taskToJson(task: A2ATask): JsonObject {
  return {
    id: task.id,
    contextId: task.contextId,
    status: {
      state: task.status.state,
      timestamp: task.status.timestamp,
      ...(task.status.message
        ? { message: messageToJson(task.status.message) }
        : {}),
    },
    ...(task.history ? { history: task.history.map(messageToJson) } : {}),
    ...(task.artifacts
      ? { artifacts: task.artifacts.map(artifactToJson) }
      : {}),
    createdAt: task.createdAt,
    lastModified: task.lastModified,
  };
}

function agentCardToJson(card: A2AAgentCard): JsonObject {
  return {
    name: card.name,
    description: card.description,
    version: card.version,
    supportedInterfaces: card.supportedInterfaces.map((entry) => ({
      url: entry.url,
      protocolBinding: entry.protocolBinding,
      protocolVersion: entry.protocolVersion,
      ...(entry.tenant ? { tenant: entry.tenant } : {}),
    })),
    skills: card.skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      ...(skill.tags ? { tags: skill.tags } : {}),
    })),
    defaultInputModes: card.defaultInputModes,
    defaultOutputModes: card.defaultOutputModes,
    ...(card.capabilities ? { capabilities: card.capabilities } : {}),
  };
}

function artifactToJson(artifact: A2AArtifact): JsonObject {
  return {
    artifactId: artifact.artifactId,
    parts: artifact.parts.map(partToJson),
    ...(artifact.name ? { name: artifact.name } : {}),
  };
}

function streamEventToJson(event: A2AStreamEvent): JsonObject {
  if ('task' in event) return { task: taskToJson(event.task) };
  if ('message' in event) return { message: messageToJson(event.message) };
  if ('statusUpdate' in event) {
    return {
      statusUpdate: {
        taskId: event.statusUpdate.taskId,
        contextId: event.statusUpdate.contextId,
        status: {
          state: event.statusUpdate.status.state,
          timestamp: event.statusUpdate.status.timestamp,
          ...(event.statusUpdate.status.message
            ? { message: messageToJson(event.statusUpdate.status.message) }
            : {}),
        },
      },
    };
  }
  return {
    artifactUpdate: {
      taskId: event.artifactUpdate.taskId,
      contextId: event.artifactUpdate.contextId,
      artifact: artifactToJson(event.artifactUpdate.artifact),
      ...(event.artifactUpdate.append !== undefined
        ? { append: event.artifactUpdate.append }
        : {}),
      ...(event.artifactUpdate.lastChunk !== undefined
        ? { lastChunk: event.artifactUpdate.lastChunk }
        : {}),
    },
  };
}

function streamEventTaskId(event: A2AStreamEvent): string {
  if ('task' in event) return event.task.id;
  if ('message' in event) return event.message.taskId ?? '';
  return 'statusUpdate' in event
    ? event.statusUpdate.taskId
    : event.artifactUpdate.taskId;
}

function isA2ATaskEventStore(store: A2ATaskStore): store is A2ATaskEventStore {
  return 'publish' in store && 'subscribe' in store;
}

function streamingEnabled(card: A2AAgentCard): boolean {
  return card.capabilities?.streaming === true;
}

function sseResponse(events: A2AStreamEvent[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify(streamEventToJson(event))}\n\n`
            )
          );
        }
        controller.close();
      },
    }),
    {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
    }
  );
}

function subscriptionSseResponse(
  store: A2ATaskEventStore,
  tenantId: AgentPlatID,
  task: A2ATask
): Response {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        const write = (event: A2AStreamEvent) => {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify(streamEventToJson(event))}\n\n`
            )
          );
          if (
            'statusUpdate' in event &&
            isTerminalA2aState(event.statusUpdate.status.state)
          ) {
            unsubscribe?.();
            controller.close();
          }
        };
        write({ task });
        unsubscribe = await store.subscribe(tenantId, task.id, write);
      },
      cancel() {
        unsubscribe?.();
      },
    }),
    {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
    }
  );
}

function partToJson(part: A2APart): JsonObject {
  return {
    ...(part.text !== undefined ? { text: part.text } : {}),
    ...(part.url !== undefined ? { url: part.url } : {}),
    ...(part.raw !== undefined ? { raw: part.raw } : {}),
    ...(part.data !== undefined ? { data: part.data } : {}),
    ...(part.filename ? { filename: part.filename } : {}),
    ...(part.mediaType ? { mediaType: part.mediaType } : {}),
  };
}

function a2aError(status: number, reason: string, message: string): Response {
  return Response.json(
    {
      error: {
        code: status,
        status:
          status === 401
            ? 'UNAUTHENTICATED'
            : status === 404
              ? 'NOT_FOUND'
              : 'INTERNAL',
        message,
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason,
            domain: 'a2a-protocol.org',
          },
        ],
      },
    },
    { status }
  );
}

async function a2aHttpError(
  response: Response,
  fallback: string
): Promise<AgentPlatError> {
  const body = await response.text();
  return new AgentPlatError(
    'ADAPTER_ERROR',
    `${fallback}: HTTP ${response.status}`,
    { statusCode: response.status, details: body.slice(0, 1_000) }
  );
}

function createId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function asJsonObject(value: unknown): JsonObject {
  if (!isJsonObject(value))
    throw new AgentPlatError('VALIDATION_ERROR', 'Expected a JSON object');
  return value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : [];
}
