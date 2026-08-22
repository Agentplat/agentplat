import { AgentPlatError } from "@agentplat/core";
import type { ISODateTime, JsonObject, JsonValue } from "@agentplat/core";

/** One immutable document included in a knowledge bundle revision. */
export interface KnowledgeDocument {
  documentId: string;
  title: string;
  content: string;
  metadata: JsonObject;
}

/** Content-addressed, tenant-scoped knowledge bundle revision. */
export interface KnowledgeBundleRevision {
  tenantId: string;
  bundleId: string;
  version: string;
  reference: string;
  digest: string;
  documents: KnowledgeDocument[];
  createdAt: ISODateTime;
}

/** Immutable revision persistence and reference resolution boundary. */
export interface KnowledgeBundleStore {
  load(
    tenantId: string,
    reference: string,
  ): Promise<KnowledgeBundleRevision | undefined>;
  list(tenantId: string, bundleId: string): Promise<KnowledgeBundleRevision[]>;
  insert(bundle: KnowledgeBundleRevision): Promise<boolean>;
}

/** Test-oriented in-memory knowledge bundle store. */
export class InMemoryKnowledgeBundleStore implements KnowledgeBundleStore {
  private readonly bundles = new Map<string, KnowledgeBundleRevision>();
  async load(tenantId: string, reference: string) {
    const value = this.bundles.get(`${tenantId}\u0000${reference}`);
    return value ? structuredClone(value) : undefined;
  }
  async list(tenantId: string, bundleId: string) {
    return [...this.bundles.values()]
      .filter(
        (bundle) =>
          bundle.tenantId === tenantId && bundle.bundleId === bundleId,
      )
      .map((bundle) => structuredClone(bundle));
  }
  async insert(bundle: KnowledgeBundleRevision) {
    const key = `${bundle.tenantId}\u0000${bundle.reference}`;
    if (this.bundles.has(key)) return false;
    this.bundles.set(key, structuredClone(bundle));
    return true;
  }
}

/** Validates, stores and resolves immutable knowledge bundle revisions. */
export class KnowledgeBundleRegistry {
  private readonly clock: () => Date;
  constructor(
    private readonly store: KnowledgeBundleStore,
    options: { clock?: () => Date } = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
  }

  async createRevision(input: {
    tenantId: string;
    bundleId: string;
    version: string;
    documents: Array<{
      documentId: string;
      title: string;
      content: string;
      metadata?: JsonObject;
    }>;
  }) {
    required(input.tenantId, "tenantId");
    required(input.bundleId, "bundleId");
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(input.version)) {
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Knowledge bundle version is invalid",
      );
    }
    if (input.documents.length < 1 || input.documents.length > 128) {
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Knowledge bundle must contain 1 to 128 documents",
      );
    }
    const ids = new Set<string>();
    const documents = input.documents.map((document) => {
      required(document.documentId, "documentId");
      required(document.title, "title");
      if (ids.has(document.documentId)) {
        throw new AgentPlatError(
          "CONFLICT",
          "Knowledge document ID is duplicated",
        );
      }
      ids.add(document.documentId);
      if (new TextEncoder().encode(document.content).byteLength > 256 * 1024) {
        throw new AgentPlatError(
          "VALIDATION_ERROR",
          "Knowledge document exceeds 256 KiB",
        );
      }
      return {
        documentId: document.documentId,
        title: document.title,
        content: document.content,
        metadata: document.metadata ?? {},
      };
    });
    const content: JsonObject = {
      schemaVersion: 1,
      bundleId: input.bundleId,
      version: input.version,
      documents,
    };
    const digest = await digestJson("knowledge-bundle-revision-v1", content);
    const reference = `knowledge://${input.bundleId}@${input.version}:${digest}`;
    const bundle: KnowledgeBundleRevision = {
      tenantId: input.tenantId,
      bundleId: input.bundleId,
      version: input.version,
      reference,
      digest,
      documents,
      createdAt: this.clock().toISOString(),
    };
    const existingVersion = (
      await this.store.list(input.tenantId, input.bundleId)
    ).find((candidate) => candidate.version === input.version);
    if (existingVersion) {
      if (existingVersion.digest === digest) return existingVersion;
      throw new AgentPlatError(
        "CONFLICT",
        "Knowledge bundle version is bound to different content",
      );
    }
    if (!(await this.store.insert(bundle))) {
      throw new AgentPlatError(
        "CONFLICT",
        "Knowledge bundle changed concurrently",
      );
    }
    return structuredClone(bundle);
  }

  async get(tenantId: string, reference: string) {
    const bundle = await this.store.load(tenantId, reference);
    if (!bundle)
      throw new AgentPlatError("NOT_FOUND", "Knowledge bundle not found");
    return bundle;
  }

  async readDocument(tenantId: string, reference: string, documentId: string) {
    const bundle = await this.get(tenantId, reference);
    const document = bundle.documents.find(
      (candidate) => candidate.documentId === documentId,
    );
    if (!document)
      throw new AgentPlatError("NOT_FOUND", "Knowledge document not found");
    return structuredClone(document);
  }
}

async function digestJson(domain: string, value: JsonValue) {
  const bytes = new TextEncoder().encode(`${domain}\u0000${canonical(value)}`);
  const result = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
function canonical(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key]!)}`)
    .join(",")}}`;
}
function required(value: string, label: string) {
  if (!value?.trim())
    throw new AgentPlatError("VALIDATION_ERROR", `${label} is required`);
}
