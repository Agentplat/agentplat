import { AgentPlatError } from "@agentplat/core";
import type {
  AgentPlatID,
  JsonObject,
  JsonValue,
  ResourceRef,
  TenantContext,
} from "@agentplat/core";
import type { EventPublisher, AgentPlatEvent } from "@agentplat/events";
import type {
  ToolDefinition,
  ToolHandler,
  ToolRegistry,
} from "@agentplat/tools";

export type ArtifactFormat =
  "markdown" | "text" | "code" | "csv" | "html" | "json";
export interface ArtifactLink {
  readonly executionId?: AgentPlatID;
  readonly runId?: AgentPlatID;
  readonly messageId?: AgentPlatID;
  readonly roomId?: AgentPlatID;
}
export interface ArtifactRevision {
  readonly artifactId: AgentPlatID;
  readonly tenantId: AgentPlatID;
  readonly revision: number;
  readonly content: string;
  readonly byteLength: number;
  readonly digest: string;
  readonly authorId: AgentPlatID;
  readonly createdAt: string;
  readonly expectedPreviousRevision: number | null;
}
export interface Artifact {
  readonly id: AgentPlatID;
  readonly tenantId: AgentPlatID;
  readonly ownerId: AgentPlatID;
  readonly name: string;
  readonly format: ArtifactFormat;
  readonly mimeType: string;
  readonly revision: number;
  readonly authorId: AgentPlatID;
  readonly links: ArtifactLink;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly digest: string;
  readonly byteLength: number;
}
export interface ArtifactDocument {
  readonly artifact: Artifact;
  readonly revision: ArtifactRevision;
}
export interface ArtifactReference extends ResourceRef {
  readonly type: "artifact";
  readonly revision: number;
  readonly name: string;
  readonly format: ArtifactFormat;
  readonly mimeType: string;
  readonly digest: string;
}
export interface ArtifactStore {
  create(input: ArtifactDocument): Promise<boolean>;
  get(
    tenantId: AgentPlatID,
    id: AgentPlatID,
    revision?: number,
  ): Promise<ArtifactDocument | undefined>;
  compareAndSet(
    input: ArtifactDocument,
    expectedRevision: number,
  ): Promise<boolean>;
  listRevisions(
    tenantId: AgentPlatID,
    id: AgentPlatID,
  ): Promise<ArtifactRevision[]>;
  /** Optional atomic artifact+event write supported by durable adapters. */
  createWithEvent?(
    input: ArtifactDocument,
    event: AgentPlatEvent,
  ): Promise<boolean>;
  /** Optional atomic artifact+event CAS supported by durable adapters. */
  compareAndSetWithEvent?(
    input: ArtifactDocument,
    expectedRevision: number,
    event: AgentPlatEvent,
  ): Promise<boolean>;
  /** Deliver queued events at least once; successful event IDs must be acknowledged durably. */
  dispatchOutbox?(
    publisher: EventPublisher,
    options?: { limit?: number },
  ): Promise<number>;
}
export interface ArtifactServiceOptions {
  readonly store: ArtifactStore;
  readonly events?: EventPublisher;
  readonly maximumContentBytes?: number;
  readonly id?: () => AgentPlatID;
  readonly now?: () => Date;
}
export interface CreateArtifactInput extends ArtifactLink {
  readonly name: string;
  readonly format: ArtifactFormat;
  readonly content: string;
  readonly mimeType?: string;
}
export interface UpdateArtifactInput extends ArtifactLink {
  readonly artifactId: AgentPlatID;
  readonly expectedRevision: number;
  readonly content: string;
}

export class ArtifactError extends Error {
  constructor(
    readonly code:
      "invalid" | "not_found" | "forbidden" | "conflict" | "too_large",
    message: string = code,
  ) {
    super(message);
    this.name = "ArtifactError";
  }
}

const copy = <T>(value: T): T => structuredClone(value);
const defaultMime: Record<ArtifactFormat, string> = {
  markdown: "text/markdown; charset=utf-8",
  text: "text/plain; charset=utf-8",
  code: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  html: "text/html; charset=utf-8",
  json: "application/json; charset=utf-8",
};
function validateFormat(format: string): asserts format is ArtifactFormat {
  if (!["markdown", "text", "code", "csv", "html", "json"].includes(format))
    throw new ArtifactError("invalid", "unsupported_artifact_format");
}
function validateContent(format: ArtifactFormat, content: string): number {
  if (typeof content !== "string")
    throw new ArtifactError("invalid", "content_must_be_text");
  const bytes = new TextEncoder().encode(content).byteLength;
  if (format === "csv" && content.length > 0) {
    const rows = content
      .replace(/\r\n/g, "\n")
      .split("\n")
      .filter((row) => row.length > 0);
    const columns = rows[0]?.split(",").length ?? 0;
    if (rows.some((row) => row.split(",").length !== columns))
      throw new ArtifactError(
        "invalid",
        "csv_rows_must_have_consistent_columns",
      );
  }
  if (format === "json") {
    try {
      JSON.parse(content);
    } catch {
      throw new ArtifactError("invalid", "json_content_must_be_valid_json");
    }
  }
  return bytes;
}
function randomId(): string {
  return globalThis.crypto.randomUUID();
}
async function digest(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
function reference(doc: ArtifactDocument): ArtifactReference {
  const a = doc.artifact;
  return {
    type: "artifact",
    id: a.id,
    tenantId: a.tenantId,
    revision: a.revision,
    name: a.name,
    format: a.format,
    mimeType: a.mimeType,
    digest: a.digest,
  };
}

export class InMemoryArtifactStore implements ArtifactStore {
  readonly #heads = new Map<string, ArtifactDocument>();
  readonly #revisions = new Map<string, ArtifactDocument[]>();
  readonly #outbox = new Map<string, AgentPlatEvent>();
  #key(tenantId: string, id: string): string {
    return `${tenantId}\0${id}`;
  }
  async create(input: ArtifactDocument): Promise<boolean> {
    const key = this.#key(input.artifact.tenantId, input.artifact.id);
    if (
      this.#heads.has(key) ||
      input.artifact.revision !== 1 ||
      input.revision.revision !== 1
    )
      return false;
    this.#heads.set(key, copy(input));
    this.#revisions.set(key, [copy(input)]);
    return true;
  }
  async createWithEvent(
    input: ArtifactDocument,
    event: AgentPlatEvent,
  ): Promise<boolean> {
    const created = await this.create(input);
    if (created) this.#outbox.set(event.id, copy(event));
    return created;
  }
  async get(
    tenantId: string,
    id: string,
    revision?: number,
  ): Promise<ArtifactDocument | undefined> {
    const key = this.#key(tenantId, id);
    const head = this.#heads.get(key);
    if (!head) return undefined;
    if (revision === undefined || revision === head.artifact.revision)
      return copy(head);
    const item = this.#revisions
      .get(key)
      ?.find((entry) => entry.artifact.revision === revision);
    return item ? copy(item) : undefined;
  }
  async compareAndSet(
    input: ArtifactDocument,
    expectedRevision: number,
  ): Promise<boolean> {
    const key = this.#key(input.artifact.tenantId, input.artifact.id);
    const current = this.#heads.get(key);
    if (
      !current ||
      current.artifact.revision !== expectedRevision ||
      input.artifact.revision !== expectedRevision + 1 ||
      input.revision.expectedPreviousRevision !== expectedRevision
    )
      return false;
    this.#heads.set(key, copy(input));
    this.#revisions.get(key)!.push(copy(input));
    return true;
  }
  async compareAndSetWithEvent(
    input: ArtifactDocument,
    expectedRevision: number,
    event: AgentPlatEvent,
  ): Promise<boolean> {
    const updated = await this.compareAndSet(input, expectedRevision);
    if (updated) this.#outbox.set(event.id, copy(event));
    return updated;
  }
  async dispatchOutbox(
    publisher: EventPublisher,
    options: { limit?: number } = {},
  ): Promise<number> {
    const limit = options.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new TypeError("outbox_limit_invalid");
    let delivered = 0;
    for (const [id, event] of [...this.#outbox].slice(0, limit)) {
      await publisher.publish(copy(event));
      this.#outbox.delete(id);
      delivered += 1;
    }
    return delivered;
  }
  async listRevisions(
    tenantId: string,
    id: string,
  ): Promise<ArtifactRevision[]> {
    return (this.#revisions.get(this.#key(tenantId, id)) ?? []).map((entry) =>
      copy(entry.revision),
    );
  }
}

export class ArtifactService {
  readonly #store: ArtifactStore;
  readonly #events?: EventPublisher;
  readonly #max: number;
  readonly #id: () => string;
  readonly #now: () => Date;
  constructor(options: ArtifactServiceOptions) {
    this.#store = options.store;
    this.#events = options.events;
    this.#max = options.maximumContentBytes ?? 1_000_000;
    this.#id = options.id ?? randomId;
    this.#now = options.now ?? (() => new Date());
    if (!Number.isSafeInteger(this.#max) || this.#max < 1)
      throw new TypeError("maximumContentBytes_must_be_positive");
  }
  async create(
    context: TenantContext,
    input: CreateArtifactInput,
  ): Promise<ArtifactReference> {
    validateFormat(input.format);
    if (!input.name.trim() || input.name.length > 200)
      throw new ArtifactError("invalid", "invalid_artifact_name");
    const byteLength = validateContent(input.format, input.content);
    if (byteLength > this.#max) throw new ArtifactError("too_large");
    const now = this.#now().toISOString();
    const id = this.#id();
    const actorId = context.actor?.actorId;
    if (!actorId)
      throw new ArtifactError("invalid", "verified_actor_id_required");
    if (
      input.mimeType !== undefined &&
      input.mimeType !== defaultMime[input.format]
    )
      throw new ArtifactError("invalid", "mime_type_does_not_match_format");
    const d = await digest(input.content);
    const links = linkFields(input);
    const artifact: Artifact = {
      id,
      tenantId: context.tenantId,
      ownerId: actorId,
      name: input.name.trim(),
      format: input.format,
      mimeType: input.mimeType ?? defaultMime[input.format],
      revision: 1,
      authorId: actorId,
      links,
      createdAt: now,
      updatedAt: now,
      digest: d,
      byteLength,
    };
    const revision: ArtifactRevision = {
      artifactId: id,
      tenantId: context.tenantId,
      revision: 1,
      content: input.content,
      byteLength,
      digest: d,
      authorId: actorId,
      createdAt: now,
      expectedPreviousRevision: null,
    };
    const doc = { artifact, revision };
    const event = this.#event(context.tenantId, "artifact.created", doc);
    const created =
      event && this.#store.createWithEvent
        ? await this.#store.createWithEvent(doc, event)
        : await this.#store.create(doc);
    if (!created) throw new ArtifactError("conflict");
    await this.#deliver(event);
    return reference(doc);
  }
  async read(
    context: TenantContext,
    id: string,
    revision?: number,
  ): Promise<ArtifactDocument> {
    const doc = await this.#store.get(context.tenantId, id, revision);
    if (!doc) throw new ArtifactError("not_found");
    authorizeOwner(context, doc.artifact);
    return doc;
  }
  async update(
    context: TenantContext,
    input: UpdateArtifactInput,
  ): Promise<ArtifactReference> {
    const current = await this.#store.get(context.tenantId, input.artifactId);
    if (!current) throw new ArtifactError("not_found");
    authorizeOwner(context, current.artifact);
    if (
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 1 ||
      input.expectedRevision !== current.artifact.revision
    )
      throw new ArtifactError("conflict", "artifact_revision_conflict");
    const byteLength = validateContent(current.artifact.format, input.content);
    if (byteLength > this.#max) throw new ArtifactError("too_large");
    const authorId = context.actor?.actorId;
    if (!authorId)
      throw new ArtifactError("invalid", "verified_actor_id_required");
    const now = this.#now().toISOString();
    const d = await digest(input.content);
    const revision: ArtifactRevision = {
      artifactId: current.artifact.id,
      tenantId: context.tenantId,
      revision: input.expectedRevision + 1,
      content: input.content,
      byteLength,
      digest: d,
      authorId,
      createdAt: now,
      expectedPreviousRevision: input.expectedRevision,
    };
    const doc: ArtifactDocument = {
      artifact: {
        ...current.artifact,
        revision: revision.revision,
        authorId,
        updatedAt: now,
        digest: d,
        byteLength,
        links: { ...current.artifact.links, ...linkFields(input) },
      },
      revision,
    };
    const event = this.#event(context.tenantId, "artifact.updated", doc);
    const updated =
      event && this.#store.compareAndSetWithEvent
        ? await this.#store.compareAndSetWithEvent(
            doc,
            input.expectedRevision,
            event,
          )
        : await this.#store.compareAndSet(doc, input.expectedRevision);
    if (!updated)
      throw new ArtifactError("conflict", "artifact_revision_conflict");
    await this.#deliver(event);
    return reference(doc);
  }
  #event(
    tenantId: string,
    type: string,
    doc: ArtifactDocument,
  ): AgentPlatEvent | undefined {
    if (!this.#events) return undefined;
    const a = doc.artifact;
    return {
      id: this.#id(),
      tenantId,
      type,
      source: "@agentplat/artifacts",
      subject: { type: "artifact", id: a.id, tenantId },
      payload: { reference: reference(doc) as unknown as JsonValue },
      occurredAt: this.#now().toISOString(),
    };
  }
  async #deliver(event: AgentPlatEvent | undefined): Promise<void> {
    if (!event || !this.#events) return;
    if (this.#store.dispatchOutbox) {
      // The write and event are already committed. A failed delivery remains queued;
      // returning a failed tool result here could cause a duplicate artifact retry.
      try {
        await this.#store.dispatchOutbox(this.#events, { limit: 100 });
      } catch {
        /* durable outbox retains the event */
      }
      return;
    }
    await this.#events.publish(event);
  }
}

/** Retry queued events from an outbox-capable ArtifactStore. Delivery is at least once. */
export function drainArtifactOutbox(
  store: ArtifactStore,
  publisher: EventPublisher,
  options: { limit?: number } = {},
): Promise<number> {
  if (!store.dispatchOutbox)
    throw new TypeError("artifact_store_does_not_support_outbox");
  return store.dispatchOutbox(publisher, options);
}
function authorizeOwner(context: TenantContext, artifact: Artifact): void {
  const actor = context.actor?.actorId;
  if (!actor || actor !== artifact.ownerId)
    throw new ArtifactError("forbidden");
}
function linkFields(input: ArtifactLink): ArtifactLink {
  const result: Record<string, string> = {};
  for (const key of ["executionId", "runId", "messageId", "roomId"] as const) {
    const value = input[key];
    if (value !== undefined) {
      if (typeof value !== "string" || !value.trim() || value.length > 2048)
        throw new ArtifactError("invalid", `invalid_${key}`);
      result[key] = value;
    }
  }
  return result;
}

/** Register opt-in create/read/update tools. Registration is the capability enablement boundary. */
export async function registerArtifactTools(
  registry: ToolRegistry,
  service: ArtifactService,
): Promise<void> {
  const tools: Array<
    [
      ToolDefinition,
      (
        input: JsonObject,
        context: Parameters<ToolHandler["invoke"]>[1],
      ) => Promise<JsonObject>,
    ]
  > = [
    [
      {
        id: "agentplat.artifacts.create",
        name: "create_artifact",
        description:
          "Create a durable Markdown, text, code, CSV, HTML, or JSON artifact. Content is stored as inert text and never executed; HTML preview must be isolated by the application.",
        parameters: {
          type: "object",
          required: ["name", "format", "content"],
          properties: {
            name: { type: "string" },
            format: {
              type: "string",
              enum: ["markdown", "text", "code", "csv", "html", "json"],
            },
            content: { type: "string" },
            mimeType: { type: "string" },
            roomId: { type: "string" },
            messageId: { type: "string" },
          },
          additionalProperties: false,
        },
      },
      async (input, context) => ({
        reference: (await service.create(context.tenant, {
          ...input,
          runId: context.runId,
        } as unknown as CreateArtifactInput)) as unknown as JsonValue,
      }),
    ],
    [
      {
        id: "agentplat.artifacts.read",
        name: "read_artifact",
        description:
          "Read an artifact or exact prior revision in the current tenant.",
        parameters: {
          type: "object",
          required: ["artifactId"],
          properties: {
            artifactId: { type: "string" },
            revision: { type: "number" },
          },
          additionalProperties: false,
        },
      },
      async (input, context) => {
        const doc = await service.read(
          context.tenant,
          String(input.artifactId),
          input.revision as number | undefined,
        );
        return {
          artifact: doc.artifact as unknown as JsonValue,
          revision: doc.revision as unknown as JsonValue,
        };
      },
    ],
    [
      {
        id: "agentplat.artifacts.update",
        name: "update_artifact",
        description:
          "Create a new artifact revision using the expected current revision; stale writes fail with a conflict.",
        parameters: {
          type: "object",
          required: ["artifactId", "expectedRevision", "content"],
          properties: {
            artifactId: { type: "string" },
            expectedRevision: { type: "number" },
            content: { type: "string" },
            roomId: { type: "string" },
            messageId: { type: "string" },
          },
          additionalProperties: false,
        },
      },
      async (input, context) => ({
        reference: (await service.update(
          context.tenant,
          input as unknown as UpdateArtifactInput,
        )) as unknown as JsonValue,
      }),
    ],
  ];
  for (const [definition, invoke] of tools)
    await registry.register(definition, {
      invoke: async (input, context) => {
        try {
          return { ok: true, value: await invoke(input, context) };
        } catch (error) {
          return {
            ok: false,
            errorMessage:
              error instanceof Error
                ? error.message
                : "artifact_operation_failed",
          };
        }
      },
    });
}

export const artifactFormats: readonly ArtifactFormat[] = Object.freeze([
  "markdown",
  "text",
  "code",
  "csv",
  "html",
  "json",
]);
