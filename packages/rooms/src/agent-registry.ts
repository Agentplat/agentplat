import { AgentPlatError } from "@agentplat/core";
import type { ISODateTime, JsonObject, JsonValue } from "@agentplat/core";

/** Lifecycle of one immutable agent definition revision. */
export type AgentRevisionStatus = "draft" | "published" | "deprecated";

/** Stable tenant-scoped agent identity independent of its revisions. */
export interface RegisteredAgent {
  tenantId: string;
  agentId: string;
  name: string;
  description?: string;
  createdAt: ISODateTime;
}

/** Immutable, content-addressed instructions and runtime configuration. */
export interface AgentDefinitionRevision {
  tenantId: string;
  agentId: string;
  revisionId: string;
  version: string;
  digest: string;
  instructions: string;
  capabilities: string[];
  toolIds: string[];
  knowledgeRefs: string[];
  runtimeProfile: JsonObject;
  metadata: JsonObject;
  createdAt: ISODateTime;
}

/** Compare-and-set lifecycle projection for one agent definition revision. */
export interface AgentRevisionLifecycle {
  tenantId: string;
  agentId: string;
  revisionId: string;
  revision: number;
  status: AgentRevisionStatus;
  updatedAt: ISODateTime;
  publishedAt?: ISODateTime;
  deprecatedAt?: ISODateTime;
}

/** Definition content and its independently revisioned lifecycle. */
export interface RegisteredAgentRevision {
  definition: AgentDefinitionRevision;
  lifecycle: AgentRevisionLifecycle;
}

/** Persistence boundary for stable agents, immutable revisions and lifecycle CAS. */
export interface AgentDefinitionRegistryStore {
  getAgent(
    tenantId: string,
    agentId: string,
  ): Promise<RegisteredAgent | undefined>;
  insertAgent(agent: RegisteredAgent): Promise<boolean>;
  getRevision(
    tenantId: string,
    revisionId: string,
  ): Promise<AgentDefinitionRevision | undefined>;
  listRevisions(
    tenantId: string,
    agentId: string,
  ): Promise<AgentDefinitionRevision[]>;
  insertRevision(revision: AgentDefinitionRevision): Promise<boolean>;
  insertRevisionWithLifecycle(input: {
    definition: AgentDefinitionRevision;
    lifecycle: AgentRevisionLifecycle;
  }): Promise<boolean>;
  getLifecycle(
    tenantId: string,
    revisionId: string,
  ): Promise<AgentRevisionLifecycle | undefined>;
  compareAndSetLifecycle(input: {
    expectedRevision: number | null;
    lifecycle: AgentRevisionLifecycle;
  }): Promise<boolean>;
}

/** Test-oriented in-memory Agent Definition Registry store. */
export class InMemoryAgentDefinitionRegistryStore implements AgentDefinitionRegistryStore {
  private readonly agents = new Map<string, RegisteredAgent>();
  private readonly revisions = new Map<string, AgentDefinitionRevision>();
  private readonly lifecycles = new Map<string, AgentRevisionLifecycle>();

  async getAgent(tenantId: string, agentId: string) {
    return copy(this.agents.get(key(tenantId, agentId)));
  }

  async insertAgent(agent: RegisteredAgent): Promise<boolean> {
    const itemKey = key(agent.tenantId, agent.agentId);
    if (this.agents.has(itemKey)) return false;
    this.agents.set(itemKey, copy(agent)!);
    return true;
  }

  async getRevision(tenantId: string, revisionId: string) {
    return copy(this.revisions.get(key(tenantId, revisionId)));
  }

  async listRevisions(tenantId: string, agentId: string) {
    return [...this.revisions.values()]
      .filter((item) => item.tenantId === tenantId && item.agentId === agentId)
      .sort((left, right) => left.version.localeCompare(right.version))
      .map((item) => copy(item)!);
  }

  async insertRevision(revision: AgentDefinitionRevision): Promise<boolean> {
    const itemKey = key(revision.tenantId, revision.revisionId);
    if (this.revisions.has(itemKey)) return false;
    this.revisions.set(itemKey, copy(revision)!);
    return true;
  }

  async insertRevisionWithLifecycle(input: {
    definition: AgentDefinitionRevision;
    lifecycle: AgentRevisionLifecycle;
  }): Promise<boolean> {
    const revisionKey = key(
      input.definition.tenantId,
      input.definition.revisionId,
    );
    const lifecycleKey = key(
      input.lifecycle.tenantId,
      input.lifecycle.revisionId,
    );
    if (
      this.revisions.has(revisionKey) ||
      this.lifecycles.has(lifecycleKey) ||
      input.lifecycle.revision !== 0
    ) {
      return false;
    }
    this.revisions.set(revisionKey, copy(input.definition)!);
    this.lifecycles.set(lifecycleKey, copy(input.lifecycle)!);
    return true;
  }

  async getLifecycle(tenantId: string, revisionId: string) {
    return copy(this.lifecycles.get(key(tenantId, revisionId)));
  }

  async compareAndSetLifecycle(input: {
    expectedRevision: number | null;
    lifecycle: AgentRevisionLifecycle;
  }): Promise<boolean> {
    const itemKey = key(input.lifecycle.tenantId, input.lifecycle.revisionId);
    const current = this.lifecycles.get(itemKey);
    if (input.expectedRevision === null) {
      if (current || input.lifecycle.revision !== 0) return false;
    } else if (
      !current ||
      current.revision !== input.expectedRevision ||
      input.lifecycle.revision !== input.expectedRevision + 1
    ) {
      return false;
    }
    this.lifecycles.set(itemKey, copy(input.lifecycle)!);
    return true;
  }
}

/** Validated content used to create an immutable agent definition revision. */
export interface CreateAgentDefinitionRevisionInput {
  tenantId: string;
  agentId: string;
  version: string;
  instructions: string;
  capabilities?: string[];
  toolIds?: string[];
  knowledgeRefs?: string[];
  runtimeProfile: JsonObject;
  metadata?: JsonObject;
}

/** Governs agent identity, immutable definition content and publication state. */
export class AgentDefinitionRegistry {
  private readonly clock: () => Date;

  constructor(
    private readonly store: AgentDefinitionRegistryStore,
    options: { clock?: () => Date } = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
  }

  async createAgent(input: {
    tenantId: string;
    agentId: string;
    name: string;
    description?: string;
  }): Promise<RegisteredAgent> {
    required(input.tenantId, "tenantId");
    required(input.agentId, "agentId");
    required(input.name, "name");
    const agent: RegisteredAgent = {
      tenantId: input.tenantId,
      agentId: input.agentId,
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      createdAt: this.now(),
    };
    if (!(await this.store.insertAgent(agent))) {
      const existing = await this.store.getAgent(input.tenantId, input.agentId);
      if (existing && sameAgent(existing, agent)) return existing;
      throw new AgentPlatError("CONFLICT", "Agent is already registered");
    }
    return copy(agent)!;
  }

  async createRevision(
    input: CreateAgentDefinitionRevisionInput,
  ): Promise<RegisteredAgentRevision> {
    const agent = await this.store.getAgent(input.tenantId, input.agentId);
    if (!agent)
      throw new AgentPlatError("NOT_FOUND", "Registered agent not found");
    version(input.version);
    required(input.instructions, "instructions");
    const content = {
      schemaVersion: 1,
      agentId: input.agentId,
      version: input.version,
      instructions: input.instructions,
      capabilities: normalizedStrings(input.capabilities),
      toolIds: normalizedStrings(input.toolIds),
      knowledgeRefs: normalizedStrings(input.knowledgeRefs),
      runtimeProfile: input.runtimeProfile,
      metadata: input.metadata ?? {},
    } satisfies JsonObject;
    const digest = await digestJson("agent-definition-revision-v1", content);
    const revision: AgentDefinitionRevision = {
      tenantId: input.tenantId,
      agentId: input.agentId,
      revisionId: `${input.agentId}@${input.version}:${digest}`,
      version: input.version,
      digest,
      instructions: input.instructions,
      capabilities: content.capabilities as string[],
      toolIds: content.toolIds as string[],
      knowledgeRefs: content.knowledgeRefs as string[],
      runtimeProfile: copy(input.runtimeProfile)!,
      metadata: copy(input.metadata ?? {})!,
      createdAt: this.now(),
    };
    const existing = await this.store.getRevision(
      input.tenantId,
      revision.revisionId,
    );
    if (existing) {
      const lifecycle = await this.requireLifecycle(
        input.tenantId,
        existing.revisionId,
      );
      return { definition: existing, lifecycle };
    }
    const sameVersion = (
      await this.store.listRevisions(input.tenantId, input.agentId)
    ).find((candidate) => candidate.version === input.version);
    if (sameVersion) {
      throw new AgentPlatError(
        "CONFLICT",
        "Agent revision version is already bound to different content",
      );
    }
    const lifecycle: AgentRevisionLifecycle = {
      tenantId: input.tenantId,
      agentId: input.agentId,
      revisionId: revision.revisionId,
      revision: 0,
      status: "draft",
      updatedAt: revision.createdAt,
    };
    if (
      !(await this.store.insertRevisionWithLifecycle({
        definition: revision,
        lifecycle,
      }))
    ) {
      throw new AgentPlatError(
        "CONFLICT",
        "Agent revision changed concurrently",
      );
    }
    return { definition: copy(revision)!, lifecycle: copy(lifecycle)! };
  }

  async publishRevision(
    tenantId: string,
    revisionId: string,
    expectedLifecycleRevision: number,
  ): Promise<RegisteredAgentRevision> {
    return this.transition(
      tenantId,
      revisionId,
      expectedLifecycleRevision,
      "draft",
      "published",
    );
  }

  async deprecateRevision(
    tenantId: string,
    revisionId: string,
    expectedLifecycleRevision: number,
  ): Promise<RegisteredAgentRevision> {
    return this.transition(
      tenantId,
      revisionId,
      expectedLifecycleRevision,
      "published",
      "deprecated",
    );
  }

  async getRevision(
    tenantId: string,
    revisionId: string,
  ): Promise<RegisteredAgentRevision> {
    const definition = await this.store.getRevision(tenantId, revisionId);
    if (!definition)
      throw new AgentPlatError("NOT_FOUND", "Agent revision not found");
    return {
      definition,
      lifecycle: await this.requireLifecycle(tenantId, revisionId),
    };
  }

  async resolvePublishedRevision(
    tenantId: string,
    revisionId: string,
  ): Promise<AgentDefinitionRevision> {
    const registered = await this.getRevision(tenantId, revisionId);
    if (registered.lifecycle.status !== "published") {
      throw new AgentPlatError("CONFLICT", "Agent revision is not published");
    }
    return registered.definition;
  }

  async listRevisions(
    tenantId: string,
    agentId: string,
  ): Promise<RegisteredAgentRevision[]> {
    if (!(await this.store.getAgent(tenantId, agentId))) {
      throw new AgentPlatError("NOT_FOUND", "Registered agent not found");
    }
    return Promise.all(
      (await this.store.listRevisions(tenantId, agentId)).map(
        async (definition) => ({
          definition,
          lifecycle: await this.requireLifecycle(
            tenantId,
            definition.revisionId,
          ),
        }),
      ),
    );
  }

  private async transition(
    tenantId: string,
    revisionId: string,
    expectedLifecycleRevision: number,
    from: AgentRevisionStatus,
    to: AgentRevisionStatus,
  ): Promise<RegisteredAgentRevision> {
    const registered = await this.getRevision(tenantId, revisionId);
    if (
      registered.lifecycle.revision !== expectedLifecycleRevision ||
      registered.lifecycle.status !== from
    ) {
      throw new AgentPlatError("CONFLICT", "Agent revision lifecycle conflict");
    }
    const now = this.now();
    const lifecycle: AgentRevisionLifecycle = {
      ...registered.lifecycle,
      revision: registered.lifecycle.revision + 1,
      status: to,
      updatedAt: now,
      publishedAt: to === "published" ? now : registered.lifecycle.publishedAt,
      deprecatedAt:
        to === "deprecated" ? now : registered.lifecycle.deprecatedAt,
    };
    if (
      !(await this.store.compareAndSetLifecycle({
        expectedRevision: expectedLifecycleRevision,
        lifecycle,
      }))
    ) {
      throw new AgentPlatError(
        "CONFLICT",
        "Agent revision changed concurrently",
      );
    }
    return { definition: registered.definition, lifecycle };
  }

  private async requireLifecycle(tenantId: string, revisionId: string) {
    const lifecycle = await this.store.getLifecycle(tenantId, revisionId);
    if (!lifecycle) {
      throw new AgentPlatError(
        "NOT_FOUND",
        "Agent revision lifecycle not found",
      );
    }
    return lifecycle;
  }

  private now(): ISODateTime {
    return this.clock().toISOString();
  }
}

function normalizedStrings(input: string[] | undefined): string[] {
  return [
    ...new Set((input ?? []).map((value) => value.trim()).filter(Boolean)),
  ].sort();
}

function required(value: string, name: string): void {
  if (!value?.trim()) {
    throw new AgentPlatError("VALIDATION_ERROR", `${name} is required`);
  }
}

function version(value: string): void {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value)) {
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Agent revision version is invalid",
    );
  }
}

function sameAgent(left: RegisteredAgent, right: RegisteredAgent): boolean {
  return left.name === right.name && left.description === right.description;
}

async function digestJson(domain: string, value: JsonValue): Promise<string> {
  const bytes = new TextEncoder().encode(
    `${domain}\u0000${canonicalJson(value)}`,
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((name) => `${JSON.stringify(name)}:${canonicalJson(value[name]!)}`)
    .join(",")}}`;
}

function key(tenantId: string, id: string): string {
  return `${tenantId}\u0000${id}`;
}

function copy<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}
