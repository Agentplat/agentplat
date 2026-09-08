/** Registry metadata is a discovery claim, never execution authority. */
export type AgentControl = "checkpoint" | "restore" | "intervention";
export type AgentExecutionReference =
  | { kind: "local"; agentId: string; revisionId: string; digest: string }
  | {
      kind: "a2a";
      endpoint: string;
      cardUrl: string;
      cardDigest: string;
      protocolVersion: "1.0";
    }
  | { kind: "room_service"; serviceId: string; policyRevision: string };
export interface AgentRegistryEntry {
  tenantId: string;
  entryId: string;
  ownerId: string;
  name: string;
  revision: number;
  capabilities: string[];
  inputMediaTypes: string[];
  outputMediaTypes: string[];
  controls: AgentControl[];
  execution: AgentExecutionReference;
  provenance: { sourceId: string; sourceRevision: string };
  lifecycle: "active" | "withdrawn";
  availability: "available" | "unavailable" | "unknown";
  verification: "verified" | "unverified" | "rejected";
  admission: "approved" | "pending" | "denied";
  validUntil: string;
}
export type AgentRegistryDraft = Omit<
  AgentRegistryEntry,
  "revision" | "lifecycle"
>;
/** Construct this principal from verified application authentication, never request JSON. */
export interface RegistryPrincipal {
  tenantId: string;
  subjectId: string;
}
export type RegistryOperation = "read" | "publish" | "withdraw";
export interface RegistryAuthorizer {
  authorize(
    principal: RegistryPrincipal,
    operation: RegistryOperation,
    entryId?: string,
  ): Promise<boolean>;
}
export interface AgentRegistryStore {
  get(
    tenantId: string,
    entryId: string,
  ): Promise<AgentRegistryEntry | undefined>;
  /** Stable entry-ID ordering and exclusive cursor. */
  list(
    tenantId: string,
    after: string | undefined,
    limit: number,
  ): Promise<AgentRegistryEntry[]>;
  compareAndSet(
    entry: AgentRegistryEntry,
    expectedRevision: number | null,
  ): Promise<boolean>;
}
export interface AgentSearchQuery {
  capabilities: string[];
  inputMediaTypes?: string[];
  outputMediaTypes?: string[];
  controls?: AgentControl[];
  after?: string;
  limit?: number;
}
export interface AgentSearchCandidate {
  entry: AgentRegistryEntry;
  eligible: boolean;
  reasons: string[];
  grantsAuthority: false;
}
export class AgentRegistryError extends Error {
  constructor(
    readonly code:
      "forbidden" | "invalid" | "conflict" | "not_found" | "ineligible",
    message = code,
  ) {
    super(message);
    this.name = "AgentRegistryError";
  }
}
const copy = <T>(value: T): T => structuredClone(value);
export function validateRegistryEntry(entry: AgentRegistryEntry): void {
  const keys = (value: object, allowed: string[]) => {
    if (Object.keys(value).some((key) => !allowed.includes(key)))
      throw new AgentRegistryError("invalid");
  };
  keys(entry, [
    "tenantId",
    "entryId",
    "ownerId",
    "name",
    "revision",
    "capabilities",
    "inputMediaTypes",
    "outputMediaTypes",
    "controls",
    "execution",
    "provenance",
    "lifecycle",
    "availability",
    "verification",
    "admission",
    "validUntil",
  ]);
  keys(entry.provenance, ["sourceId", "sourceRevision"]);
  keys(
    entry.execution,
    entry.execution.kind === "local"
      ? ["kind", "agentId", "revisionId", "digest"]
      : entry.execution.kind === "room_service"
        ? ["kind", "serviceId", "policyRevision"]
        : ["kind", "endpoint", "cardUrl", "cardDigest", "protocolVersion"],
  );

  const id = (value: unknown) => {
    if (typeof value !== "string" || !value.trim() || value.length > 2048)
      throw new AgentRegistryError("invalid");
  };
  [
    entry.tenantId,
    entry.entryId,
    entry.ownerId,
    entry.name,
    entry.provenance?.sourceId,
    entry.provenance?.sourceRevision,
  ].forEach(id);
  if (
    !Number.isSafeInteger(entry.revision) ||
    entry.revision < 1 ||
    !Number.isFinite(Date.parse(entry.validUntil))
  )
    throw new AgentRegistryError("invalid");
  for (const values of [
    entry.capabilities,
    entry.inputMediaTypes,
    entry.outputMediaTypes,
    entry.controls,
  ]) {
    if (
      !Array.isArray(values) ||
      values.length > 128 ||
      new Set(values).size !== values.length
    )
      throw new AgentRegistryError("invalid");
    values.forEach(id);
  }
  if (
    entry.controls.some(
      (c) => !["checkpoint", "restore", "intervention"].includes(c),
    ) ||
    !["active", "withdrawn"].includes(entry.lifecycle) ||
    !["available", "unavailable", "unknown"].includes(entry.availability) ||
    !["verified", "unverified", "rejected"].includes(entry.verification) ||
    !["approved", "pending", "denied"].includes(entry.admission)
  )
    throw new AgentRegistryError("invalid");
  const execution = entry.execution;
  if (execution.kind === "local")
    [execution.agentId, execution.revisionId, execution.digest].forEach(id);
  else if (execution.kind === "room_service")
    [execution.serviceId, execution.policyRevision].forEach(id);
  else if (execution.kind === "a2a") {
    id(execution.cardDigest);
    for (const url of [execution.endpoint, execution.cardUrl]) {
      const parsed = new URL(url);
      if (
        parsed.protocol !== "https:" ||
        parsed.username ||
        parsed.password ||
        parsed.hash
      )
        throw new AgentRegistryError("invalid");
    }
    if (execution.protocolVersion !== "1.0")
      throw new AgentRegistryError("invalid");
    // A2A alone does not supply these AgentPlat execution operations.
    if (entry.controls.length) throw new AgentRegistryError("invalid");
  } else throw new AgentRegistryError("invalid");
}
export function evaluateRegistryCandidate(
  entry: AgentRegistryEntry,
  query: AgentSearchQuery,
  now: number,
): AgentSearchCandidate {
  const reasons: string[] = [];
  for (const [required, advertised, label] of [
    [query.capabilities, entry.capabilities, "capability"],
    [query.inputMediaTypes ?? [], entry.inputMediaTypes, "input"],
    [query.outputMediaTypes ?? [], entry.outputMediaTypes, "output"],
    [query.controls ?? [], entry.controls, "control"],
  ] as const)
    for (const value of required)
      if (!advertised.includes(value as never))
        reasons.push(`missing_${label}:${value}`);
  if (entry.lifecycle !== "active") reasons.push("withdrawn");
  if (Date.parse(entry.validUntil) <= now) reasons.push("expired");
  if (entry.availability !== "available")
    reasons.push(`availability:${entry.availability}`);
  if (entry.verification !== "verified")
    reasons.push(`verification:${entry.verification}`);
  if (entry.admission !== "approved")
    reasons.push(`admission:${entry.admission}`);
  return {
    entry: copy(entry),
    eligible: reasons.length === 0,
    reasons: reasons.length ? reasons : ["requirements_matched"],
    grantsAuthority: false,
  };
}
export class AgentRegistry {
  readonly #store: AgentRegistryStore;
  readonly #authorize: RegistryAuthorizer["authorize"];
  readonly #clock: () => number;
  constructor(
    store: AgentRegistryStore,
    authorizer: RegistryAuthorizer,
    clock: () => number = Date.now,
  ) {
    this.#store = {
      get: store.get.bind(store),
      list: store.list.bind(store),
      compareAndSet: store.compareAndSet.bind(store),
    };
    this.#authorize = authorizer.authorize.bind(authorizer);
    this.#clock = clock;
  }
  async #check(
    principal: RegistryPrincipal,
    operation: RegistryOperation,
    entryId?: string,
  ) {
    if (
      !principal.tenantId ||
      !principal.subjectId ||
      !(await this.#authorize(copy(principal), operation, entryId))
    )
      throw new AgentRegistryError("forbidden");
  }
  async get(principal: RegistryPrincipal, entryId: string) {
    principal = copy(principal);
    await this.#check(principal, "read", entryId);
    return this.#store.get(principal.tenantId, entryId);
  }
  async publish(
    principal: RegistryPrincipal,
    draft: AgentRegistryDraft,
    expectedRevision: number | null = null,
  ) {
    principal = copy(principal);
    draft = copy(draft);
    if (principal.tenantId !== draft.tenantId)
      throw new AgentRegistryError("forbidden");
    await this.#check(principal, "publish", draft.entryId);
    if (
      expectedRevision !== null &&
      (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
    )
      throw new AgentRegistryError("invalid");
    const entry: AgentRegistryEntry = {
      ...draft,
      revision: (expectedRevision ?? 0) + 1,
      lifecycle: "active",
    };
    validateRegistryEntry(entry);
    if (!(await this.#store.compareAndSet(entry, expectedRevision)))
      throw new AgentRegistryError("conflict");
    return copy(entry);
  }
  async withdraw(
    principal: RegistryPrincipal,
    entryId: string,
    expectedRevision: number,
  ) {
    principal = copy(principal);
    await this.#check(principal, "withdraw", entryId);
    const entry = await this.#store.get(principal.tenantId, entryId);
    if (!entry) throw new AgentRegistryError("not_found");
    if (entry.revision !== expectedRevision)
      throw new AgentRegistryError("conflict");
    const next = {
      ...entry,
      revision: entry.revision + 1,
      lifecycle: "withdrawn" as const,
    };
    if (!(await this.#store.compareAndSet(next, expectedRevision)))
      throw new AgentRegistryError("conflict");
    return next;
  }
  async search(
    principal: RegistryPrincipal,
    query: AgentSearchQuery,
  ): Promise<{ candidates: AgentSearchCandidate[]; nextCursor?: string }> {
    principal = copy(principal);
    query = copy(query);
    await this.#check(principal, "read");
    const limit = query.limit ?? 50;
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 200 ||
      !Array.isArray(query.capabilities)
    )
      throw new AgentRegistryError("invalid");
    for (const values of [
      query.capabilities,
      query.inputMediaTypes ?? [],
      query.outputMediaTypes ?? [],
      query.controls ?? [],
    ]) {
      if (
        !Array.isArray(values) ||
        values.length > 128 ||
        values.some((v) => typeof v !== "string" || !v || v.length > 2048)
      )
        throw new AgentRegistryError("invalid");
    }
    const entries = await this.#store.list(
      principal.tenantId,
      query.after,
      limit + 1,
    );
    return {
      candidates: entries
        .slice(0, limit)
        .map((e) => evaluateRegistryCandidate(e, query, this.#clock())),
      ...(entries.length > limit
        ? { nextCursor: entries[limit - 1].entryId }
        : {}),
    };
  }
  async resolve(
    principal: RegistryPrincipal,
    entryId: string,
    revision: number,
    query: AgentSearchQuery,
  ) {
    const entry = await this.get(principal, entryId);
    if (!entry) throw new AgentRegistryError("not_found");
    if (entry.revision !== revision) throw new AgentRegistryError("conflict");
    if (!evaluateRegistryCandidate(entry, query, this.#clock()).eligible)
      throw new AgentRegistryError("ineligible");
    return entry;
  }
}
export class InMemoryAgentRegistryStore implements AgentRegistryStore {
  readonly #entries = new Map<string, AgentRegistryEntry>();
  async get(tenantId: string, entryId: string) {
    return copy(this.#entries.get(JSON.stringify([tenantId, entryId])));
  }
  async list(tenantId: string, after: string | undefined, limit: number) {
    return copy(
      [...this.#entries.values()]
        .filter((e) => e.tenantId === tenantId && (!after || e.entryId > after))
        .sort((a, b) =>
          a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0,
        )
        .slice(0, limit),
    );
  }
  async compareAndSet(
    entry: AgentRegistryEntry,
    expectedRevision: number | null,
  ) {
    validateRegistryEntry(entry);
    const key = JSON.stringify([entry.tenantId, entry.entryId]);
    if (
      (this.#entries.get(key)?.revision ?? null) !== expectedRevision ||
      entry.revision !== (expectedRevision ?? 0) + 1
    )
      return false;
    this.#entries.set(key, copy(entry));
    return true;
  }
}
