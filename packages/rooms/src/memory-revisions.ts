import { AgentPlatError } from "@agentplat/core";
import type { JsonValue, TenantContext } from "@agentplat/core";

/** Subject is independent of audience; agent IDs are stable registry identities. */
export interface MemorySubjectV1 {
  type: string;
  id: string;
}
export type MemoryAudienceV1 =
  | { kind: "personal"; subjectId: string }
  | {
      kind: "shared";
      scopeType: "organization" | "workspace";
      scopeId: string;
    };
export interface MemoryRevisionInputV1 {
  memoryId: string;
  operationId: string;
  expectedRevision: number | null;
  subject: MemorySubjectV1;
  audience: MemoryAudienceV1;
  content: JsonValue;
  evidenceRefs: string[];
  observedAt: string;
  validFrom: string;
  validUntil?: string;
  retainUntil?: string;
  status: "active" | "retired";
  reason: string;
}
/** Immutable revision also serves as the atomically persisted audit event. */
export interface MemoryRevisionV1 extends Omit<
  MemoryRevisionInputV1,
  "expectedRevision"
> {
  schemaVersion: 1;
  tenantId: string;
  revision: number;
  previousDigest: string | null;
  actorId: string;
  recordedAt: string;
  requestDigest: string;
  digest: string;
}
export interface MemoryRevisionStoreV1 {
  head(
    tenantId: string,
    memoryId: string,
  ): Promise<MemoryRevisionV1 | undefined>;
  revision(
    tenantId: string,
    memoryId: string,
    revision: number,
  ): Promise<MemoryRevisionV1 | undefined>;
  operation(
    tenantId: string,
    memoryId: string,
    operationId: string,
  ): Promise<MemoryRevisionV1 | undefined>;
  /** Atomically persist revision/audit event and head, or neither. */
  commit(
    record: MemoryRevisionV1,
    expectedRevision: number | null,
  ): Promise<boolean>;
}
export interface MemoryRevisionAccessV1<Context> {
  /** Host must verify credentials and memberships, never copy model arguments. */
  authenticate(context: Context): Promise<TenantContext | null>;
  authorize(
    principal: TenantContext,
    request: {
      operation: "read" | "history" | "write" | "share";
      memoryId: string;
      subject: MemorySubjectV1;
      audience: MemoryAudienceV1;
    },
  ): Promise<boolean>;
}

export class InMemoryMemoryRevisionStoreV1 implements MemoryRevisionStoreV1 {
  private records = new Map<string, MemoryRevisionV1[]>();
  async head(t: string, m: string) {
    return copy(this.records.get(key(t, m))?.at(-1));
  }
  async revision(t: string, m: string, r: number) {
    return copy(this.records.get(key(t, m))?.find((x) => x.revision === r));
  }
  async operation(t: string, m: string, op: string) {
    return copy(this.records.get(key(t, m))?.find((x) => x.operationId === op));
  }
  async commit(input: MemoryRevisionV1, expected: number | null) {
    const record = structuredClone(input);
    await validateMemoryRevisionV1(record);
    // Read after async validation; no await between CAS and write.
    const rows = this.records.get(key(record.tenantId, record.memoryId)) ?? [];
    if (
      !memoryRevisionFollowsV1(record, rows.at(-1), expected) ||
      rows.some((r) => r.operationId === record.operationId)
    )
      return false;
    this.records.set(key(record.tenantId, record.memoryId), [...rows, record]);
    return true;
  }
}

/** Opt-in lifecycle alongside legacy Room memory. No implicit transcript writes. */
export class MemoryRevisionServiceV1<Context> {
  constructor(
    private readonly store: MemoryRevisionStoreV1,
    private readonly access: MemoryRevisionAccessV1<Context>,
    private readonly options: { clock?: () => Date } = {},
  ) {}
  async append(
    context: Context,
    request: MemoryRevisionInputV1,
  ): Promise<MemoryRevisionV1> {
    const input = structuredClone(request);
    validateInput(input);
    const principal = await this.principal(context);
    const tenantId = principal.tenantId,
      actorId = principal.actor!.actorId!;
    await this.allow(principal, "write", input);
    const current = await this.store.head(tenantId, input.memoryId);
    if (current) await validateMemoryRevisionV1(current);
    await this.allowWrite(principal, input, current);
    const requestDigest = await digest({ tenantId, actorId, input });
    const replay = await this.store.operation(
      tenantId,
      input.memoryId,
      input.operationId,
    );
    if (replay) {
      await validateMemoryRevisionV1(replay);
      if (replay.requestDigest !== requestDigest) conflict();
      return this.replay(context, input.memoryId, replay);
    }
    if ((current?.revision ?? null) !== input.expectedRevision) conflict();
    const recordedAt = this.now();
    if (input.observedAt > recordedAt)
      fail("Observation cannot be in the future");
    const { expectedRevision: _, ...body } = input;
    const record: MemoryRevisionV1 = {
      ...body,
      schemaVersion: 1,
      tenantId,
      actorId,
      revision: (current?.revision ?? 0) + 1,
      previousDigest: current?.digest ?? null,
      recordedAt,
      requestDigest,
      digest: "",
    };
    record.digest = await digestRecord(record);
    // Current authorization is evaluated again immediately before admission to commit.
    await this.allowWrite(principal, input, current);
    if (!(await this.store.commit(record, input.expectedRevision))) {
      const raced = await this.store.operation(
        tenantId,
        input.memoryId,
        input.operationId,
      );
      if (raced?.requestDigest === requestDigest)
        return this.replay(context, input.memoryId, raced);
      conflict();
    }
    return structuredClone(record);
  }
  /** Historical reads require both current and historical audience permission. */
  async read(
    context: Context,
    memoryId: string,
    revision?: number,
  ): Promise<MemoryRevisionV1 | undefined> {
    token(memoryId);
    if (
      revision !== undefined &&
      (!Number.isSafeInteger(revision) || revision < 1)
    )
      fail("Invalid revision");
    const principal = await this.principal(context);
    const head = await this.store.head(principal.tenantId, memoryId);
    if (!head) return undefined;
    await validateMemoryRevisionV1(head);
    const operation = revision === undefined ? "read" : "history";
    await this.allow(principal, operation, head);
    const now = this.now();
    if (head.retainUntil && head.retainUntil <= now) return undefined;
    const record =
      revision === undefined
        ? head
        : await this.store.revision(principal.tenantId, memoryId, revision);
    if (!record) return undefined;
    await validateMemoryRevisionV1(record);
    await this.allow(principal, operation, record);
    if (record.retainUntil && record.retainUntil <= now) return undefined;
    if (
      revision === undefined &&
      (record.status !== "active" ||
        record.validFrom > now ||
        (record.validUntil && record.validUntil <= now))
    )
      return undefined;
    // Fence audience/retention changes that raced asynchronous authorization/history I/O.
    const latest = await this.store.head(principal.tenantId, memoryId);
    if (!latest || latest.digest !== head.digest) conflict();
    const finishedAt = this.now();
    if (
      (head.retainUntil && head.retainUntil <= finishedAt) ||
      (record.retainUntil && record.retainUntil <= finishedAt)
    )
      return undefined;
    if (
      revision === undefined &&
      (record.validFrom > finishedAt ||
        (record.validUntil && record.validUntil <= finishedAt))
    )
      return undefined;
    return structuredClone(record);
  }
  private async replay(
    context: Context,
    memoryId: string,
    record: MemoryRevisionV1,
  ) {
    const retained = await this.read(context, memoryId, record.revision);
    if (!retained || retained.digest !== record.digest) conflict();
    return retained;
  }
  /** Same authorized view is used by context and tools. IDs come from host discovery. */
  async resolve(
    context: Context,
    memoryIds: string[],
  ): Promise<MemoryRevisionV1[]> {
    if (
      !Array.isArray(memoryIds) ||
      memoryIds.length > 128 ||
      new Set(memoryIds).size !== memoryIds.length
    )
      fail("Invalid memory references");
    const ids = [...memoryIds];
    const result: MemoryRevisionV1[] = [];
    for (const id of ids) {
      const record = await this.read(context, id);
      if (record) result.push(record);
    }
    return result;
  }
  private async allowWrite(
    principal: TenantContext,
    input: MemoryRevisionInputV1,
    current?: MemoryRevisionV1,
  ) {
    await this.allow(principal, "write", input);
    if (!current) return;
    await this.allow(principal, "write", current);
    if (canonical(current.subject) !== canonical(input.subject))
      fail("Memory subject is immutable");
    if (canonical(current.audience) !== canonical(input.audience)) {
      await this.allow(principal, "share", current);
      await this.allow(principal, "share", input);
    }
  }
  private async principal(context: Context) {
    const p = await this.access.authenticate(context);
    if (!p?.tenantId || !p.actor?.actorId) denied();
    token(p.tenantId);
    token(p.actor.actorId);
    return structuredClone(p);
  }
  private async allow(
    p: TenantContext,
    operation: "read" | "history" | "write" | "share",
    record: Pick<MemoryRevisionV1, "memoryId" | "subject" | "audience">,
  ) {
    // Personal access is deliberately narrow. Delegated personal access requires a future explicit contract.
    if (
      record.audience.kind === "personal" &&
      record.audience.subjectId !== p.actor?.actorId
    )
      denied();
    if (
      !(await this.access.authorize(structuredClone(p), {
        operation,
        memoryId: record.memoryId,
        subject: structuredClone(record.subject),
        audience: structuredClone(record.audience),
      }))
    )
      denied();
  }
  private now() {
    return (this.options.clock?.() ?? new Date()).toISOString();
  }
}

export function memoryRevisionFollowsV1(
  next: MemoryRevisionV1,
  previous: MemoryRevisionV1 | undefined,
  expected: number | null,
): boolean {
  return (
    (previous?.revision ?? null) === expected &&
    next.revision === (expected ?? 0) + 1 &&
    next.previousDigest === (previous?.digest ?? null) &&
    (!previous ||
      (next.tenantId === previous.tenantId &&
        next.memoryId === previous.memoryId &&
        next.recordedAt >= previous.recordedAt &&
        canonical(next.subject) === canonical(previous.subject)))
  );
}
export async function validateMemoryRevisionV1(
  record: MemoryRevisionV1,
): Promise<void> {
  exact(
    record,
    [
      "schemaVersion",
      "tenantId",
      "memoryId",
      "operationId",
      "subject",
      "audience",
      "content",
      "evidenceRefs",
      "observedAt",
      "validFrom",
      "status",
      "reason",
      "revision",
      "previousDigest",
      "actorId",
      "recordedAt",
      "requestDigest",
      "digest",
    ],
    ["validUntil", "retainUntil"],
  );
  if (
    record.schemaVersion !== 1 ||
    !Number.isSafeInteger(record.revision) ||
    record.revision < 1
  )
    fail("Invalid memory revision");
  const input: MemoryRevisionInputV1 = {
    memoryId: record.memoryId,
    operationId: record.operationId,
    expectedRevision: record.revision === 1 ? null : record.revision - 1,
    subject: record.subject,
    audience: record.audience,
    content: record.content,
    evidenceRefs: record.evidenceRefs,
    observedAt: record.observedAt,
    validFrom: record.validFrom,
    ...(record.validUntil !== undefined
      ? { validUntil: record.validUntil }
      : {}),
    ...(record.retainUntil !== undefined
      ? { retainUntil: record.retainUntil }
      : {}),
    status: record.status,
    reason: record.reason,
  };
  validateInput(input);
  token(record.tenantId);
  token(record.actorId);
  timestamp(record.recordedAt);
  if (
    record.observedAt > record.recordedAt ||
    record.requestDigest !==
      (await digest({
        tenantId: record.tenantId,
        actorId: record.actorId,
        input,
      })) ||
    (record.revision === 1
      ? record.previousDigest !== null
      : !isDigest(record.previousDigest)) ||
    record.digest !== (await digestRecord(record))
  )
    fail("Invalid memory revision digest or time");
}
function validateInput(i: MemoryRevisionInputV1) {
  exact(
    i,
    [
      "memoryId",
      "operationId",
      "expectedRevision",
      "subject",
      "audience",
      "content",
      "evidenceRefs",
      "observedAt",
      "validFrom",
      "status",
      "reason",
    ],
    ["validUntil", "retainUntil"],
  );
  exact(i.subject, ["type", "id"]);
  if (i.audience?.kind === "personal") exact(i.audience, ["kind", "subjectId"]);
  else exact(i.audience, ["kind", "scopeType", "scopeId"]);
  token(i.memoryId);
  token(i.operationId);
  token(i.subject?.type);
  token(i.subject?.id);
  token(i.reason);
  if (
    i.expectedRevision !== null &&
    (!Number.isSafeInteger(i.expectedRevision) || i.expectedRevision < 1)
  )
    fail("Invalid expected revision");
  if (i.audience?.kind === "personal") token(i.audience.subjectId);
  else if (
    i.audience?.kind === "shared" &&
    ["organization", "workspace"].includes(i.audience.scopeType)
  )
    token(i.audience.scopeId);
  else fail("Invalid memory audience");
  if (!["active", "retired"].includes(i.status)) fail("Invalid memory status");
  if (
    !Array.isArray(i.evidenceRefs) ||
    i.evidenceRefs.length < 1 ||
    i.evidenceRefs.length > 64 ||
    new Set(i.evidenceRefs).size !== i.evidenceRefs.length
  )
    fail("Evidence references required");
  i.evidenceRefs.forEach(token);
  timestamp(i.observedAt);
  timestamp(i.validFrom);
  if (i.validUntil !== undefined) {
    timestamp(i.validUntil);
    if (i.validUntil <= i.validFrom) fail("Invalid validity interval");
  }
  if (i.retainUntil !== undefined) timestamp(i.retainUntil);
  if (new TextEncoder().encode(canonical(i)).byteLength > 65536)
    fail("Memory revision exceeds 64 KiB");
}
function canonical(v: unknown, seen = new Set<object>(), depth = 0): string {
  if (depth > 64) fail("Memory JSON exceeds 64 levels");
  if (v === null || typeof v === "string" || typeof v === "boolean")
    return JSON.stringify(v);
  if (typeof v === "number" && Number.isFinite(v)) return JSON.stringify(v);
  if (typeof v !== "object" || !v || seen.has(v))
    fail("Expected acyclic JSON data");
  if (Object.getOwnPropertySymbols(v).length) fail("Expected JSON data");
  seen.add(v);
  try {
    if (Array.isArray(v)) {
      if (
        Object.keys(v).length !== v.length ||
        !Array.from({ length: v.length }, (_, i) => Object.hasOwn(v, i)).every(
          Boolean,
        )
      )
        fail("Sparse arrays and array properties are not JSON data");
      return (
        "[" + v.map((item) => canonical(item, seen, depth + 1)).join(",") + "]"
      );
    }
    if (Object.getPrototypeOf(v) !== Object.prototype)
      fail("Expected JSON object");
    return (
      "{" +
      Object.keys(v)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            canonical((v as Record<string, unknown>)[k], seen, depth + 1),
        )
        .join(",") +
      "}"
    );
  } finally {
    seen.delete(v);
  }
}
async function digest(v: unknown) {
  const bytes = new TextEncoder().encode(
    "agentplat-memory-revision-v1\0" + canonical(v),
  );
  return (
    "sha256:" +
    [...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes))]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
  );
}
async function digestRecord(r: MemoryRevisionV1) {
  const { digest: _, ...body } = r;
  return digest(body);
}
function token(v: unknown): asserts v is string {
  if (
    typeof v !== "string" ||
    !v.trim() ||
    v.length > 1024 ||
    /[\u0000-\u001f\u007f]/u.test(v)
  )
    fail("Invalid memory identifier or reason");
}
function timestamp(v: unknown): asserts v is string {
  if (
    typeof v !== "string" ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString() !== v
  )
    fail("Expected canonical UTC timestamp");
}
function isDigest(v: unknown) {
  return typeof v === "string" && /^sha256:[0-9a-f]{64}$/u.test(v);
}
function key(t: string, m: string) {
  return JSON.stringify([t, m]);
}
function copy<T>(v: T): T {
  return v === undefined ? v : structuredClone(v);
}
function fail(message: string): never {
  throw new AgentPlatError("VALIDATION_ERROR", message);
}
function denied(): never {
  throw new AgentPlatError("FORBIDDEN", "Memory access denied");
}
function conflict(): never {
  throw new AgentPlatError("CONFLICT", "Memory revision or operation changed");
}

function exact(value: unknown, required: string[], optional: string[] = []) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getOwnPropertySymbols(value).length ||
    required.some((k) => !Object.hasOwn(value, k)) ||
    Object.keys(value).some(
      (k) => !required.includes(k) && !optional.includes(k),
    )
  )
    fail("Unexpected memory contract shape");
}
