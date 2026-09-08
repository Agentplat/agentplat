import {
  AgentCard,
  Message,
  SendMessageRequest,
  GetTaskRequest,
  CancelTaskRequest,
  SubscribeToTaskRequest,
  Task,
  Role,
  type StreamResponse,
} from "@a2a-js/sdk";
import { ClientFactory, JsonRpcTransportFactory } from "@a2a-js/sdk/client";
import {
  type AgentRegistry,
  type RegistryPrincipal,
  type AgentRegistryDraft,
  type AgentSearchQuery,
  type AgentRegistryEntry,
} from "@agentplat/agent-registry";
import {
  a2aScope,
  type A2AStateStore,
  type A2AMessageInput,
  type A2ATaskSnapshot,
  type A2AWorkBinding,
  type A2APart,
  type Json,
} from "./contracts.js";
import {
  digest,
  json,
  fromTask,
  fromPart,
  toPart,
  toTask,
  states,
  terminal,
} from "./internal.js";
export interface A2ANetworkPolicy {
  /** Exact destination admission, including DNS/egress policy, for every HTTP request. */
  allow(url: URL, purpose: "card" | "rpc" | "artifact"): Promise<boolean>;
  credentials(url: URL): Promise<Record<string, string>>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maximumResponseBytes?: number;
}
export function createA2AFetch(
  policy: A2ANetworkPolicy,
  purpose: "card" | "rpc" | "artifact",
): typeof fetch {
  const allow = policy.allow.bind(policy),
    credentials = policy.credentials.bind(policy),
    fetchImpl = policy.fetch ?? globalThis.fetch;
  const timeout = policy.timeoutMs ?? 30_000,
    maximum = policy.maximumResponseBytes ?? 10_485_760;
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      !(await allow(new URL(url), purpose))
    )
      throw new Error("destination_denied");
    const headers = new Headers(
      input instanceof Request ? input.headers : undefined,
    );
    new Headers(init?.headers).forEach((v, k) => headers.set(k, v));
    Object.entries(await credentials(new URL(url))).forEach(([k, v]) =>
      headers.set(k, v),
    );
    const response = await fetchImpl(input, {
      ...init,
      headers,
      redirect: "error",
      signal: AbortSignal.any([
        ...(init?.signal ? [init.signal] : []),
        AbortSignal.timeout(timeout),
      ]),
    });
    if (response.status >= 300 && response.status < 400)
      throw new Error("redirect_denied");
    if (!response.body) return response;
    const reader = response.body.getReader();
    let bytes = 0;
    return new Response(
      new ReadableStream({
        async pull(controller) {
          try {
            const next = await reader.read();
            if (next.done) {
              controller.close();
              return;
            }
            bytes += next.value.byteLength;
            if (bytes > maximum) {
              await reader.cancel();
              controller.error(new Error("response_too_large"));
              return;
            }
            controller.enqueue(next.value);
          } catch (error) {
            controller.error(error);
          }
        },
        cancel: (reason) => reader.cancel(reason),
      }),
      {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      },
    );
  };
}
function parseCard(raw: unknown, endpoint?: string) {
  if (!raw || typeof raw !== "object") throw new Error("invalid_card");
  const card = AgentCard.fromJSON(raw);
  const transport = card.supportedInterfaces.find(
    (i) =>
      i.protocolBinding === "JSONRPC" &&
      i.protocolVersion === "1.0" &&
      (!endpoint || i.url === endpoint),
  );
  if (
    !card.name ||
    !card.skills.length ||
    !transport ||
    card.capabilities?.extensions.some((e) => e.required)
  )
    throw new Error("incompatible_card");
  const url = new URL(transport.url);
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw new Error("invalid_endpoint");
  return { card, transport };
}
/** Import an explicitly mapped claim. Administrators verify and admit it separately. */
export async function discoverA2AAgent(input: {
  tenantId: string;
  entryId: string;
  ownerId: string;
  cardUrl: string;
  skillCapabilities: Record<string, string>;
  validUntil: string;
  network: A2ANetworkPolicy;
}): Promise<AgentRegistryDraft> {
  const response = await createA2AFetch(input.network, "card")(input.cardUrl, {
    headers: { "A2A-Version": "1.0" },
  });
  if (!response.ok) throw new Error("card_fetch_failed");
  const raw: unknown = await response.json();
  const { card, transport } = parseCard(raw);
  if (!(await input.network.allow(new URL(transport.url), "rpc")))
    throw new Error("destination_denied");
  const mapped = card.skills.filter((s) =>
    Object.hasOwn(input.skillCapabilities, s.id),
  );
  if (!mapped.length) throw new Error("no_mapped_skills");
  // Use the intersection: one advertised skill must not accidentally widen another's formats.
  const intersection = (sets: string[][]) =>
    sets[0].filter((v) => sets.every((s) => s.includes(v)));
  return {
    tenantId: input.tenantId,
    entryId: input.entryId,
    ownerId: input.ownerId,
    name: card.name,
    capabilities: [
      ...new Set(mapped.map((s) => input.skillCapabilities[s.id])),
    ],
    inputMediaTypes: intersection(
      mapped.map((s) =>
        s.inputModes.length ? s.inputModes : card.defaultInputModes,
      ),
    ),
    outputMediaTypes: intersection(
      mapped.map((s) =>
        s.outputModes.length ? s.outputModes : card.defaultOutputModes,
      ),
    ),
    controls: [],
    execution: {
      kind: "a2a",
      endpoint: transport.url,
      cardUrl: input.cardUrl,
      cardDigest: digest(raw),
      protocolVersion: "1.0",
    },
    provenance: { sourceId: input.cardUrl, sourceRevision: card.version },
    availability: "unknown",
    verification: "unverified",
    admission: "pending",
    validUntil: input.validUntil,
  };
}
export interface A2ADelegation {
  operationId: string;
  entryId: string;
  entryRevision: number;
  requestDigest: string;
  status: "pending" | "uncertain" | "received";
  binding: A2AWorkBinding;
  task?: A2ATaskSnapshot;
  message?: { contextId: string; parts: A2APart[] };
  card: Json;
}
export interface A2ADelegateInput {
  operationId: string;
  entryId: string;
  entryRevision: number;
  requirements: AgentSearchQuery;
  message: Omit<A2AMessageInput, "taskId" | "contextId">;
  previousOperationId?: string;
  binding: A2AWorkBinding;
}
export interface A2AClientOptions {
  principal: RegistryPrincipal;
  registry: AgentRegistry;
  store: A2AStateStore;
  network: A2ANetworkPolicy;
  /** Reapply Room/Work/Membership/lease policy here. No registry decision substitutes for this gate. */
  authorize(input: {
    principal: RegistryPrincipal;
    operation: "send" | "read" | "cancel";
    entryId: string;
    binding: A2AWorkBinding;
  }): Promise<boolean>;
}
export class A2AClient {
  readonly #principal: RegistryPrincipal;
  readonly #registry: AgentRegistry;
  readonly #store: A2AStateStore;
  readonly #cardFetch: typeof fetch;
  readonly #rpcFetch: typeof fetch;
  readonly #authorize: A2AClientOptions["authorize"];
  constructor(options: A2AClientOptions) {
    this.#principal = structuredClone(options.principal);
    this.#registry = options.registry;
    this.#store = {
      get: options.store.get.bind(options.store),
      list: options.store.list.bind(options.store),
      compareAndSet: options.store.compareAndSet.bind(options.store),
    };
    this.#cardFetch = createA2AFetch(options.network, "card");
    this.#rpcFetch = createA2AFetch(options.network, "rpc");
    this.#authorize = options.authorize;
  }
  #scope(entryId: string) {
    return a2aScope(this.#principal, entryId, "outbound");
  }
  async #check(
    operation: "send" | "read" | "cancel",
    entryId: string,
    binding: A2AWorkBinding,
  ) {
    if (
      !(await this.#authorize({
        principal: structuredClone(this.#principal),
        operation,
        entryId,
        binding: structuredClone(binding),
      }))
    )
      throw new Error("execution_denied");
  }
  async #connect(card: Json) {
    const parsed = parseCard(card);
    return new ClientFactory({
      transports: [new JsonRpcTransportFactory({ fetchImpl: this.#rpcFetch })],
    }).createFromAgentCard({
      ...parsed.card,
      supportedInterfaces: [parsed.transport],
    });
  }
  async #prepare(raw: A2ADelegateInput) {
    const input = structuredClone(raw);
    if (
      !input.operationId ||
      !input.message.messageId ||
      !input.message.parts.length
    )
      throw new Error("invalid_message");
    await this.#check("send", input.entryId, input.binding);
    const requestDigest = digest(input),
      scope = this.#scope(input.entryId);
    const existing = await this.#store.get(scope, input.operationId);
    if (existing) {
      const value = existing.value as unknown as A2ADelegation;
      if (value.requestDigest !== requestDigest)
        throw new Error("operation_conflict");
      return { input, value, fresh: false };
    }
    const entry = await this.#registry.resolve(
      this.#principal,
      input.entryId,
      input.entryRevision,
      input.requirements,
    );
    if (entry.execution.kind !== "a2a") throw new Error("not_a2a");
    const response = await this.#cardFetch(entry.execution.cardUrl, {
      headers: { "A2A-Version": "1.0" },
    });
    if (!response.ok) throw new Error("card_fetch_failed");
    const rawCard: unknown = await response.json();
    if (digest(rawCard) !== entry.execution.cardDigest)
      throw new Error("card_revision_changed");
    const { card, transport } = parseCard(rawCard, entry.execution.endpoint);
    let previous: A2ATaskSnapshot | undefined;
    if (input.previousOperationId) {
      const record = await this.#store.get(scope, input.previousOperationId);
      const delegation = record?.value as unknown as A2ADelegation | undefined;
      previous = delegation?.task;
      if (
        !previous ||
        delegation?.entryRevision !== input.entryRevision ||
        !["input_required", "auth_required"].includes(previous.state)
      )
        throw new Error("invalid_continuation");
    }
    // Revalidate after network I/O, immediately before reservation and dispatch.
    await this.#registry.resolve(
      this.#principal,
      input.entryId,
      input.entryRevision,
      input.requirements,
    );
    await this.#check("send", input.entryId, input.binding);
    const value: A2ADelegation = {
      operationId: input.operationId,
      entryId: input.entryId,
      entryRevision: input.entryRevision,
      requestDigest,
      status: "pending",
      binding: input.binding,
      card: json(
        AgentCard.toJSON({ ...card, supportedInterfaces: [transport] }),
      ),
      ...(previous ? { task: previous } : {}),
    };
    const fresh = await this.#store.compareAndSet(
      scope,
      input.operationId,
      null,
      json(value),
    );
    if (!fresh) {
      const winner = (await this.#store.get(scope, input.operationId))!
        .value as unknown as A2ADelegation;
      if (winner.requestDigest !== requestDigest)
        throw new Error("operation_conflict");
      return { input, value: winner, fresh: false };
    }
    return { input, value, fresh: true };
  }
  #params(input: A2ADelegateInput, value: A2ADelegation) {
    return SendMessageRequest.fromJSON({
      message: Message.toJSON({
        messageId: input.message.messageId,
        role: Role.ROLE_USER,
        taskId: value.task?.taskId ?? "",
        contextId: value.task?.contextId ?? "",
        parts: input.message.parts.map(toPart),
        metadata: undefined,
        extensions: [],
        referenceTaskIds: [],
      }),
      configuration: { returnImmediately: true },
    });
  }
  async #save(value: A2ADelegation) {
    const scope = this.#scope(value.entryId);
    for (let attempt = 0; attempt < 8; attempt++) {
      const prior = await this.#store.get(scope, value.operationId);
      if (!prior) throw new Error("operation_missing");
      const old = prior.value as unknown as A2ADelegation;
      if (old.task && terminal(old.task.state)) return old;
      if (
        old.task &&
        value.task &&
        (old.task.taskId !== value.task.taskId ||
          old.task.contextId !== value.task.contextId)
      )
        throw new Error("correlation_mismatch");
      if (
        await this.#store.compareAndSet(
          scope,
          value.operationId,
          prior.revision,
          json(value),
        )
      )
        return value;
    }
    throw new Error("operation_revision_conflict");
  }
  async send(input: A2ADelegateInput): Promise<A2ADelegation> {
    const prepared = await this.#prepare(input);
    let { value } = prepared;
    if (!prepared.fresh) return value;
    try {
      const client = await this.#connect(value.card),
        result = await client.sendMessage(this.#params(prepared.input, value));
      value =
        "id" in result
          ? { ...value, status: "received", task: fromTask(result) }
          : {
              ...value,
              status: "received",
              task: undefined,
              message: {
                contextId: result.contextId,
                parts: result.parts.map(fromPart),
              },
            };
      return await this.#save(value);
    } catch {
      return this.#save({ ...value, status: "uncertain" });
    }
  }
  async *sendStream(input: A2ADelegateInput): AsyncGenerator<A2ADelegation> {
    const prepared = await this.#prepare(input);
    let { value } = prepared;
    if (!prepared.fresh) {
      yield value;
      return;
    }
    try {
      const client = await this.#connect(value.card);
      for await (const event of client.sendMessageStream(
        this.#params(prepared.input, value),
      )) {
        value = await this.#save(this.#event(value, event));
        yield value;
      }
    } catch {
      value = await this.#save({ ...value, status: "uncertain" });
      yield value;
    }
  }
  #event(value: A2ADelegation, event: StreamResponse): A2ADelegation {
    const payload = event.payload;
    if (!payload) throw new Error("invalid_event");
    if (payload.$case === "task")
      return { ...value, status: "received", task: fromTask(payload.value) };
    if (payload.$case === "message")
      return {
        ...value,
        status: "received",
        message: {
          contextId: payload.value.contextId,
          parts: payload.value.parts.map(fromPart),
        },
      };
    const task = value.task;
    if (
      !task ||
      payload.value.taskId !== task.taskId ||
      payload.value.contextId !== task.contextId
    )
      throw new Error("correlation_mismatch");
    if (payload.$case === "statusUpdate") {
      const wire = toTask(task);
      wire.status = payload.value.status;
      return { ...value, status: "received", task: fromTask(wire) };
    }
    const update = payload.value,
      artifact = update.artifact;
    if (!artifact) throw new Error("invalid_artifact");
    const prior = task.artifacts.find((a) => a.id === artifact.artifactId);
    const next = {
      id: artifact.artifactId,
      name: artifact.name,
      parts: [
        ...(update.append ? (prior?.parts ?? []) : []),
        ...artifact.parts.map(fromPart),
      ],
    };
    return {
      ...value,
      status: "received",
      task: {
        ...task,
        artifacts: [...task.artifacts.filter((a) => a.id !== next.id), next],
      },
    };
  }
  async #load(
    entryId: string,
    operationId: string,
    operation: "read" | "cancel",
  ) {
    const record = await this.#store.get(this.#scope(entryId), operationId);
    if (!record) throw new Error("operation_missing");
    const value = record.value as unknown as A2ADelegation;
    await this.#check(operation, entryId, value.binding);
    return value;
  }
  async get(entryId: string, operationId: string) {
    return this.#load(entryId, operationId, "read");
  }
  async reconcile(entryId: string, operationId: string) {
    const value = await this.#load(entryId, operationId, "read");
    if (!value.task) return value;
    const client = await this.#connect(value.card),
      task = await client.getTask(
        GetTaskRequest.fromJSON({ id: value.task.taskId }),
      );
    return this.#save({ ...value, status: "received", task: fromTask(task) });
  }
  async cancel(entryId: string, operationId: string) {
    const value = await this.#load(entryId, operationId, "cancel");
    if (!value.task) throw new Error("remote_task_unknown");
    const client = await this.#connect(value.card),
      task = await client.cancelTask(
        CancelTaskRequest.fromJSON({ id: value.task.taskId }),
      );
    return this.#save({ ...value, status: "received", task: fromTask(task) });
  }
  async *watch(
    entryId: string,
    operationId: string,
  ): AsyncGenerator<A2ADelegation> {
    let value = await this.#load(entryId, operationId, "read");
    if (!value.task) throw new Error("remote_task_unknown");
    // Reconcile first; subscription replay may append artifact chunks a second time.
    value = await this.reconcile(entryId, operationId);
    yield value;
    if (value.task && terminal(value.task.state)) return;
    const client = await this.#connect(value.card);
    try {
      for await (const event of client.resubscribeTask(
        SubscribeToTaskRequest.fromJSON({ id: value.task!.taskId }),
      )) {
        if (event.payload?.$case === "artifactUpdate") {
          value = await this.reconcile(entryId, operationId);
        } else value = await this.#save(this.#event(value, event));
        yield value;
      }
    } catch {
      yield await this.#save({ ...value, status: "uncertain" });
    }
  }
}
/** Explicit retrieval only; parsing/importing an artifact never follows its URL. */
export async function fetchA2AArtifact(
  url: string,
  network: A2ANetworkPolicy,
): Promise<Response> {
  return createA2AFetch(network, "artifact")(url);
}
