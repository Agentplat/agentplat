import {
  AgentCard,
  Message,
  SendMessageRequest,
  StreamResponse,
  ListTasksResponse,
  Task,
  TaskState,
  Role,
} from "@a2a-js/sdk";
import {
  JsonRpcTransportHandler,
  ServerCallContext,
  type A2ARequestHandler,
} from "@a2a-js/sdk/server";
import {
  RequestMalformedError,
  TaskNotFoundError,
  TaskNotCancelableError,
  UnsupportedOperationError,
} from "@a2a-js/sdk/errors";
import type { RegistryPrincipal } from "@agentplat/agent-registry";
import {
  a2aScope,
  type A2AService,
  type A2AStateStore,
  type A2ATaskSnapshot,
  type A2AExecutionRequest,
} from "./contracts.js";
import {
  digest,
  json,
  fromPart,
  toTask,
  paused,
  terminal,
} from "./internal.js";
interface StoredTask {
  snapshot: A2ATaskSnapshot;
  request: A2AExecutionRequest;
  messages: Record<string, string>;
  bound: boolean;
  updatedAt: string;
}
export interface A2AServerOptions {
  service: A2AService;
  store: A2AStateStore;
  authenticate(request: Request): Promise<RegistryPrincipal | undefined>;
  maximumRequestBytes?: number;
  pollIntervalMs?: number;
  /** Errors in background execution/persistence are observable without exposing content remotely. */
  onError?(error: unknown): void;
}
/** One explicitly published agent or Room service. TLS termination belongs to the host. */
export class A2AServer {
  readonly #service: A2AService;
  readonly #store: A2AStateStore;
  readonly #authenticate: A2AServerOptions["authenticate"];
  readonly #onError: (error: unknown) => void;
  readonly #card: AgentCard;
  readonly #maximum: number;
  readonly #poll: number;
  readonly #rpc: JsonRpcTransportHandler;
  constructor(options: A2AServerOptions) {
    const s = options.service;
    const endpoint = new URL(s.endpoint);
    if (
      endpoint.protocol !== "https:" ||
      endpoint.username ||
      endpoint.password ||
      !s.id ||
      !s.skills.length
    )
      throw new Error("invalid_service");
    this.#service = {
      ...structuredClone({
        id: s.id,
        name: s.name,
        description: s.description,
        version: s.version,
        kind: s.kind,
        endpoint: s.endpoint,
        skills: s.skills,
        inputMediaTypes: s.inputMediaTypes,
        outputMediaTypes: s.outputMediaTypes,
      }),
      authorize: s.authorize.bind(s),
      bind: s.bind.bind(s),
      execute: s.execute.bind(s),
      cancel: s.cancel.bind(s),
      reconcile: s.reconcile.bind(s),
    };
    this.#store = {
      get: options.store.get.bind(options.store),
      list: options.store.list.bind(options.store),
      compareAndSet: options.store.compareAndSet.bind(options.store),
    };
    this.#authenticate = options.authenticate;
    this.#onError = options.onError ?? (() => {});
    this.#maximum = options.maximumRequestBytes ?? 1_048_576;
    this.#poll = options.pollIntervalMs ?? 100;
    if (this.#maximum < 1 || this.#poll < 1) throw new Error("invalid_limits");
    this.#card = AgentCard.fromJSON({
      name: s.name,
      description: s.description,
      version: s.version,
      supportedInterfaces: [
        { url: s.endpoint, protocolBinding: "JSONRPC", protocolVersion: "1.0" },
      ],
      capabilities: {
        streaming: true,
        pushNotifications: false,
        extendedAgentCard: false,
      },
      defaultInputModes: s.inputMediaTypes,
      defaultOutputModes: s.outputMediaTypes,
      skills: s.skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        tags: [skill.capability],
      })),
      securitySchemes: {
        bearer: {
          httpAuthSecurityScheme: { scheme: "Bearer", bearerFormat: "" },
        },
      },
      securityRequirements: [{ schemes: { bearer: { list: [] } } }],
    });
    const unsupported = async (): Promise<never> => {
      throw new UnsupportedOperationError();
    };
    const handler: A2ARequestHandler = {
      getAgentCard: async () => this.#card,
      getAuthenticatedExtendedAgentCard: unsupported,
      sendMessage: async (params, ctx) => {
        const task = await this.#send(params, ctx);
        if (params.configuration?.returnImmediately === true)
          return toTask(task.snapshot);
        let snapshot = task.snapshot;
        for await (const event of this.#watch(task.snapshot.taskId, ctx))
          if (event.payload?.$case === "task")
            snapshot = (await this.#load(task.snapshot.taskId, ctx)).value
              .snapshot;
        return toTask(snapshot);
      },
      sendMessageStream: (params, ctx) => this.#sendStream(params, ctx),
      getTask: async (params, ctx) =>
        toTask((await this.#load(params.id, ctx)).value.snapshot),
      cancelTask: async (params, ctx) => this.#cancel(params.id, ctx),
      resubscribe: (params, ctx) => this.#watch(params.id, ctx),
      listTasks: async (params, ctx) => {
        const principal = this.#principal(ctx);
        const all = (await this.#store.list(this.#scope(principal))).map(
          (r) => r.record.value as unknown as StoredTask,
        );
        const filtered = all
          .filter(
            (t) =>
              (!params.contextId ||
                t.snapshot.contextId === params.contextId) &&
              (!params.status ||
                toTask(t.snapshot).status?.state === params.status) &&
              (!params.statusTimestampAfter ||
                t.updatedAt >= params.statusTimestampAfter),
          )
          .sort((a, b) => a.snapshot.taskId.localeCompare(b.snapshot.taskId));
        const size = Math.min(100, Math.max(1, params.pageSize ?? 50));
        const page = filtered
          .filter(
            (t) => !params.pageToken || t.snapshot.taskId > params.pageToken,
          )
          .slice(0, size + 1);
        return ListTasksResponse.fromJSON({
          tasks: page.slice(0, size).map((t) => {
            const task = toTask(t.snapshot);
            if (!params.includeArtifacts) task.artifacts = [];
            return Task.toJSON(task);
          }),
          totalSize: filtered.length,
          pageSize: size,
          nextPageToken:
            page.length > size ? page[size - 1].snapshot.taskId : "",
        });
      },
      createTaskPushNotificationConfig: unsupported,
      getTaskPushNotificationConfig: unsupported,
      listTaskPushNotificationConfigs: unsupported,
      deleteTaskPushNotificationConfig: unsupported,
    };
    this.#rpc = new JsonRpcTransportHandler(handler);
  }
  #scope(principal: RegistryPrincipal) {
    return a2aScope(principal, this.#service.id, "server_task");
  }
  #principal(context: ServerCallContext): RegistryPrincipal {
    if (!context.tenant || !context.user?.isAuthenticated)
      throw new RequestMalformedError();
    return { tenantId: context.tenant, subjectId: context.user.userName };
  }
  async #load(taskId: string, context: ServerCallContext) {
    const record = await this.#store.get(
      this.#scope(this.#principal(context)),
      taskId,
    );
    if (!record) throw new TaskNotFoundError();
    return {
      revision: record.revision,
      value: record.value as unknown as StoredTask,
    };
  }
  async #send(
    params: SendMessageRequest,
    context: ServerCallContext,
  ): Promise<StoredTask> {
    const principal = this.#principal(context),
      message = params.message;
    if (
      !message?.messageId ||
      message.role !== Role.ROLE_USER ||
      !message.parts.length ||
      params.configuration?.taskPushNotificationConfig
    )
      throw new RequestMalformedError();
    if (
      message.parts.some(
        (p) =>
          !this.#service.inputMediaTypes.includes(
            p.mediaType ||
              (p.content?.$case === "text" ? "text/plain" : "application/json"),
          ),
      )
    )
      throw new RequestMalformedError();
    for (const id of message.referenceTaskIds) await this.#load(id, context);
    const scope = this.#scope(principal),
      taskId = message.taskId || digest([scope, message.messageId]);
    const prior = await this.#store.get(scope, taskId);
    const previous = prior?.value as unknown as StoredTask | undefined;
    const hash = digest(json(params));
    if (previous?.messages[message.messageId]) {
      if (previous.messages[message.messageId] !== hash)
        throw new RequestMalformedError();
      return previous;
    }
    if (message.taskId && !previous) throw new TaskNotFoundError();
    if (
      previous &&
      !["input_required", "auth_required"].includes(previous.snapshot.state)
    )
      throw new RequestMalformedError();
    if (
      message.contextId &&
      previous &&
      message.contextId !== previous.snapshot.contextId
    )
      throw new RequestMalformedError();
    if (
      message.contextId &&
      !previous &&
      !(await this.#store.list(scope)).some(
        (r) =>
          (r.record.value as unknown as StoredTask).snapshot.contextId ===
          message.contextId,
      )
    )
      throw new TaskNotFoundError();
    const contextId =
      previous?.snapshot.contextId ||
      message.contextId ||
      digest([scope, "context", taskId]);
    const request: A2AExecutionRequest = {
      principal,
      serviceId: this.#service.id,
      taskId,
      contextId,
      operationId: digest([scope, taskId, message.messageId]),
      message: {
        messageId: message.messageId,
        parts: message.parts.map(fromPart),
        taskId,
        contextId,
      },
      binding: previous?.request.binding ?? {},
    };
    const value: StoredTask = {
      snapshot: {
        taskId,
        contextId,
        state: "submitted",
        artifacts: previous?.snapshot.artifacts ?? [],
      },
      request,
      messages: { ...previous?.messages, [message.messageId]: hash },
      bound: previous?.bound ?? false,
      updatedAt: new Date().toISOString(),
    };
    if (
      !(await this.#store.compareAndSet(
        scope,
        taskId,
        prior?.revision ?? null,
        json(value),
      ))
    ) {
      const winner = (await this.#store.get(scope, taskId))
        ?.value as unknown as StoredTask;
      if (winner?.messages[message.messageId] === hash) return winner;
      throw new RequestMalformedError();
    }
    // Durable reservation precedes bind/execute. Disconnecting a stream does not cancel work.
    void this.#execute(scope, value).catch(this.#onError);
    return value;
  }
  async #update(
    scope: string,
    request: A2AExecutionRequest,
    update: (value: StoredTask) => StoredTask,
  ) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const record = await this.#store.get(scope, request.taskId);
      if (!record) throw new Error("task_missing");
      const value = record.value as unknown as StoredTask;
      if (
        value.request.operationId !== request.operationId ||
        terminal(value.snapshot.state)
      )
        return;
      if (
        await this.#store.compareAndSet(
          scope,
          request.taskId,
          record.revision,
          json({ ...update(value), updatedAt: new Date().toISOString() }),
        )
      )
        return;
    }
    throw new Error("task_revision_conflict");
  }
  async #execute(scope: string, task: StoredTask) {
    let request = task.request;
    try {
      if (!task.bound) {
        request = {
          ...request,
          binding: await this.#service.bind(structuredClone(request)),
        };
        await this.#update(scope, request, (value) => ({
          ...value,
          request,
          bound: true,
        }));
      }
      const current = await this.#store.get(scope, request.taskId);
      if (
        !current ||
        terminal((current.value as unknown as StoredTask).snapshot.state)
      )
        return;
      await this.#update(scope, request, (value) => ({
        ...value,
        snapshot: { ...value.snapshot, state: "working" },
      }));
      for await (const update of this.#service.execute(
        structuredClone(request),
      )) {
        if (
          !(
            update.state in
            {
              submitted: 1,
              working: 1,
              completed: 1,
              failed: 1,
              canceled: 1,
              input_required: 1,
              auth_required: 1,
              rejected: 1,
            }
          )
        )
          throw new Error("invalid_task_state");
        await this.#update(scope, request, (value) => ({
          ...value,
          snapshot: { ...value.snapshot, ...update },
        }));
        if (paused(update.state)) break;
      }
    } catch (error) {
      this.#onError(error);
      await this.#update(scope, request, (value) => ({
        ...value,
        snapshot: { ...value.snapshot, state: "failed" },
      }));
    }
  }
  async *#sendStream(params: SendMessageRequest, context: ServerCallContext) {
    const task = await this.#send(params, context);
    yield* this.#watch(task.snapshot.taskId, context);
  }
  async *#watch(
    taskId: string,
    context: ServerCallContext,
  ): AsyncGenerator<StreamResponse> {
    let revision = 0;
    while (!(context.state.get("signal") as AbortSignal | undefined)?.aborted) {
      const record = await this.#load(taskId, context);
      if (record.revision !== revision) {
        revision = record.revision;
        yield {
          payload: { $case: "task", value: toTask(record.value.snapshot) },
        };
      }
      if (paused(record.value.snapshot.state)) return;
      await new Promise((resolve) => setTimeout(resolve, this.#poll));
    }
  }
  async #cancel(taskId: string, context: ServerCallContext) {
    const task = await this.#load(taskId, context);
    if (task.value.snapshot.state === "canceled")
      return toTask(task.value.snapshot);
    if (terminal(task.value.snapshot.state) || !task.value.bound)
      throw new TaskNotCancelableError();
    if (!(await this.#service.cancel(structuredClone(task.value.request))))
      throw new TaskNotCancelableError();
    await this.#update(
      this.#scope(this.#principal(context)),
      task.value.request,
      (value) => ({
        ...value,
        snapshot: { ...value.snapshot, state: "canceled" },
      }),
    );
    return toTask((await this.#load(taskId, context)).value.snapshot);
  }
  /** Operator recovery: reconcile existing work only; never re-run execute after a crash. */
  async reconcile(
    principal: RegistryPrincipal,
    taskId: string,
  ): Promise<A2ATaskSnapshot> {
    principal = structuredClone(principal);
    if (!(await this.#service.authorize(principal, "reconcile")))
      throw new Error("forbidden");
    const scope = this.#scope(principal),
      record = await this.#store.get(scope, taskId);
    if (!record) throw new Error("task_not_found");
    const task = record.value as unknown as StoredTask;
    if (task.bound && !terminal(task.snapshot.state)) {
      const snapshot = await this.#service.reconcile(
        structuredClone(task.request),
      );
      if (snapshot) {
        if (
          snapshot.taskId !== taskId ||
          snapshot.contextId !== task.snapshot.contextId
        )
          throw new Error("correlation_mismatch");
        await this.#update(scope, task.request, (value) => ({
          ...value,
          snapshot,
        }));
      }
    }
    return (
      (await this.#store.get(scope, taskId))!.value as unknown as StoredTask
    ).snapshot;
  }
  /** Fetch-compatible endpoint. Host mounts this on a dedicated service URL. */
  async handle(request: Request): Promise<Response> {
    const principal = await this.#authenticate(request);
    if (!principal?.tenantId || !principal.subjectId)
      return new Response("Unauthorized", { status: 401 });
    if (request.method === "GET") {
      if (!(await this.#service.authorize(principal, "card")))
        return new Response("Forbidden", { status: 403 });
      return Response.json(AgentCard.toJSON(this.#card));
    }
    if (request.method !== "POST")
      return new Response("Method not allowed", { status: 405 });
    if (request.headers.get("A2A-Version") !== "1.0")
      return Response.json(
        { error: "A2A-Version 1.0 required" },
        { status: 400 },
      );
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (request.body) {
      const reader = request.body.getReader();
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > this.#maximum) {
          await reader.cancel();
          return new Response("Too large", { status: 413 });
        }
        chunks.push(next.value);
      }
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString());
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new Error();
    } catch {
      return new Response("Malformed request", { status: 400 });
    }
    const params = body.params as Record<string, unknown> | undefined;
    if (params?.tenant && params.tenant !== principal.tenantId)
      return new Response("Forbidden", { status: 403 });
    if (!(await this.#service.authorize(principal, String(body.method))))
      return new Response("Forbidden", { status: 403 });
    const streamAbort = new AbortController();
    const context = new ServerCallContext({
      tenant: principal.tenantId,
      user: { isAuthenticated: true, userName: principal.subjectId },
      requestedVersion: "1.0",
      state: new Map([
        ["signal", AbortSignal.any([request.signal, streamAbort.signal])],
      ]),
    });
    const result = await this.#rpc.handle(body, context);
    if (Symbol.asyncIterator in result) {
      const iterator = result[Symbol.asyncIterator]();
      return new Response(
        new ReadableStream({
          async pull(controller) {
            try {
              const next = await iterator.next();
              if (next.done) controller.close();
              else
                controller.enqueue(
                  new TextEncoder().encode(
                    `data: ${JSON.stringify(next.value)}\n\n`,
                  ),
                );
            } catch (e) {
              controller.error(e);
            }
          },
          async cancel() {
            streamAbort.abort();
            await iterator.return?.();
          },
        }),
        {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        },
      );
    }
    return Response.json(result);
  }
}
