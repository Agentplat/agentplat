import { AgentPlatError } from "@agentplat/core";
import type { JsonValue } from "@agentplat/core";
import type { AgentPlatEvent } from "./index.js";
import {
  boundedEventJsonV1,
  canonicalEventJsonV1,
  compareEventTokensV1,
  eventRecordDigestV1,
  eventTimestampV1,
  eventTokenV1,
} from "./record-utils.js";

export interface EvidenceScopeV1 {
  tenantId: string;
  consumerId: string;
  source: string;
}
export interface EvidenceIdentityV1 {
  evidenceId: string;
  evidenceRevision: string;
}
export interface EvidenceReferenceV1 extends EvidenceIdentityV1 {
  reference: string;
}
export interface EvidenceKeyV1 extends EvidenceScopeV1, EvidenceIdentityV1 {}
export interface EvidenceLeaseV1 {
  token: string;
  workerId: string;
  actorId: string;
  until: string;
}
export interface EvidenceReceiptV1 extends EvidenceKeyV1 {
  revision: number;
  reference: string;
  inputDigest: string;
  discoveredEventId: string;
  status: "pending" | "leased" | "completed" | "uncertain";
  generation: number;
  availableAt: string;
  lease?: EvidenceLeaseV1;
  result?: JsonValue;
  resultReference?: string;
  resultDigest?: string;
  projection?: "pending" | "applied";
  reconciliations?: Record<string, string>;
  reason?: string;
  createdAt: string;
  updatedAt: string;
  compactedAt?: string;
}
export interface EvidenceCheckpointV1 extends EvidenceScopeV1 {
  revision: number;
  position: JsonValue;
  updatedAt: string;
}
export interface EvidenceBatchInputV1 {
  consumerId: string;
  source: string;
  operationId: string;
  events: { event: AgentPlatEvent; evidence: EvidenceReferenceV1[] }[];
  checkpoint?: { expectedRevision: number | null; position: JsonValue };
}
export interface EvidenceBatchResultV1 {
  insertedEvents: number;
  insertedEvidence: number;
  checkpoint?: EvidenceCheckpointV1;
}
export interface EvidenceEventReceiptV1 extends EvidenceScopeV1 {
  eventId: string;
  inputDigest: string;
  submittedBy: string;
  receivedAt: string;
  evidence: EvidenceIdentityV1[];
  event?: AgentPlatEvent;
}
export interface EvidenceIntakeCommitV1 extends EvidenceScopeV1 {
  operationId: string;
  requestDigest: string;
  events: EvidenceEventReceiptV1[];
  evidence: EvidenceReceiptV1[];
  checkpoint?: EvidenceCheckpointV1;
  expectedCheckpointRevision?: number | null;
}
export interface EvidenceReceiptQueryV1 {
  status?: EvidenceReceiptV1["status"];
  projection?: "pending" | "applied";
  leaseExpiredAt?: string;
  readyAt?: string;
  uncompactedBefore?: string;
  after?: { createdAt: string; evidenceId: string; evidenceRevision: string };
  limit: number;
}
/** Indexed per-event/per-evidence persistence, never a single growing tenant snapshot. */
export interface IncrementalEvidenceStoreV1 {
  intake(input: EvidenceIntakeCommitV1): Promise<EvidenceBatchResultV1>;
  checkpoint(scope: EvidenceScopeV1): Promise<EvidenceCheckpointV1 | undefined>;
  get(key: EvidenceKeyV1): Promise<EvidenceReceiptV1 | undefined>;
  getEvent(
    scope: EvidenceScopeV1,
    eventId: string,
  ): Promise<EvidenceEventReceiptV1 | undefined>;
  list(
    scope: EvidenceScopeV1,
    query: EvidenceReceiptQueryV1,
  ): Promise<EvidenceReceiptV1[]>;
  compareAndSet(
    record: EvidenceReceiptV1,
    expectedRevision: number,
  ): Promise<boolean>;
  compactEvents(
    scope: EvidenceScopeV1,
    before: string,
    limit: number,
  ): Promise<number>;
}
export interface EvidencePrincipalV1 {
  tenantId: string;
  actorId: string;
}
export interface EvidenceProcessingAccessV1<Context> {
  authenticate(context: Context): Promise<EvidencePrincipalV1 | null>;
  authorize(
    principal: EvidencePrincipalV1,
    request: {
      operation:
        | "receive"
        | "read"
        | "claim"
        | "settle"
        | "reconcile"
        | "project"
        | "compact";
      consumerId: string;
      source: string;
      evidence?: EvidenceIdentityV1;
      batch?: EvidenceBatchInputV1;
      proofRefs?: string[];
      eventId?: string;
    },
  ): Promise<boolean>;
}
export function evidenceKeyV1(key: EvidenceKeyV1): string {
  return JSON.stringify([
    key.tenantId,
    key.consumerId,
    key.source,
    key.evidenceId,
    key.evidenceRevision,
  ]);
}
function scopeKey(scope: EvidenceScopeV1): string {
  return JSON.stringify([scope.tenantId, scope.consumerId, scope.source]);
}
function conflict(message = "Evidence state changed"): never {
  throw new AgentPlatError("CONFLICT", message);
}
function same(a: unknown, b: unknown) {
  return canonicalEventJsonV1(a) === canonicalEventJsonV1(b);
}
function identity(key: EvidenceKeyV1) {
  for (const value of [
    key.tenantId,
    key.consumerId,
    key.source,
    key.evidenceId,
    key.evidenceRevision,
  ])
    eventTokenV1(value);
}
function integer(value: number, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new AgentPlatError("VALIDATION_ERROR", "Invalid evidence integer");
}
export function validateEvidenceReceiptV1(record: EvidenceReceiptV1): void {
  identity(record);
  integer(record.revision);
  integer(record.generation);
  eventTokenV1(record.inputDigest);
  eventTokenV1(record.reference);
  eventTokenV1(record.discoveredEventId);
  eventTimestampV1(record.createdAt);
  eventTimestampV1(record.updatedAt);
  eventTimestampV1(record.availableAt);
  if (!["pending", "leased", "completed", "uncertain"].includes(record.status))
    throw new AgentPlatError("VALIDATION_ERROR", "Invalid evidence status");
  if (record.lease) {
    eventTokenV1(record.lease.token);
    eventTokenV1(record.lease.workerId);
    eventTokenV1(record.lease.actorId);
    eventTimestampV1(record.lease.until);
  }
  if (record.status === "leased" && !record.lease)
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Leased evidence requires a fence",
    );
  if (
    record.status === "completed" &&
    (!record.resultDigest ||
      !record.resultReference ||
      !["pending", "applied"].includes(record.projection!))
  )
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Completed evidence needs a durable result",
    );
  if (
    record.status === "completed" &&
    record.result === undefined &&
    !record.compactedAt
  )
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Completed evidence has no result payload",
    );
  if (
    record.status !== "completed" &&
    (record.result !== undefined || record.resultDigest || record.projection)
  )
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Uncompleted evidence cannot expose a result",
    );
  if (
    record.compactedAt &&
    (record.status !== "completed" ||
      record.projection !== "applied" ||
      record.result !== undefined)
  )
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Only applied results can be compacted",
    );
  boundedEventJsonV1(record, 262_144);
}
export function evidenceReceiptFollowsV1(
  next: EvidenceReceiptV1,
  previous: EvidenceReceiptV1,
  expected: number,
): boolean {
  validateEvidenceReceiptV1(next);
  return (
    next.revision === expected + 1 &&
    previous.revision === expected &&
    evidenceKeyV1(next) === evidenceKeyV1(previous) &&
    next.reference === previous.reference &&
    next.inputDigest === previous.inputDigest &&
    next.discoveredEventId === previous.discoveredEventId &&
    next.createdAt === previous.createdAt &&
    next.updatedAt >= previous.updatedAt &&
    next.generation >= previous.generation &&
    (previous.status !== "completed" ||
      (next.status === "completed" &&
        next.resultDigest === previous.resultDigest &&
        next.resultReference === previous.resultReference &&
        (next.result === undefined
          ? !!next.compactedAt
          : previous.result !== undefined &&
            same(next.result, previous.result)) &&
        (previous.projection !== "applied" || next.projection === "applied")))
  );
}
/** Atomic batch intake must reject conflicts before persisting any event or cursor. */
export function validateEvidenceIntakeV1(input: EvidenceIntakeCommitV1): void {
  for (const value of [
    input.tenantId,
    input.consumerId,
    input.source,
    input.operationId,
    input.requestDigest,
  ])
    eventTokenV1(value);
  if (input.events.length > 100 || input.evidence.length > 1000)
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Evidence batch exceeds bounds",
    );
  for (const event of input.events)
    if (scopeKey(event) !== scopeKey(input))
      throw new AgentPlatError("VALIDATION_ERROR", "Cross-scope event intake");
  for (const record of input.evidence) {
    validateEvidenceReceiptV1(record);
    if (
      scopeKey(record) !== scopeKey(input) ||
      record.status !== "pending" ||
      record.revision !== 0 ||
      record.generation !== 0
    )
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Invalid initial evidence receipt",
      );
  }
  if (
    input.checkpoint &&
    (scopeKey(input.checkpoint) !== scopeKey(input) ||
      input.checkpoint.revision !==
        (input.expectedCheckpointRevision ?? -1) + 1)
  )
    throw new AgentPlatError("VALIDATION_ERROR", "Invalid checkpoint revision");
  boundedEventJsonV1(input, 1_048_576);
}

export class InMemoryIncrementalEvidenceStoreV1 implements IncrementalEvidenceStoreV1 {
  private events = new Map<string, EvidenceEventReceiptV1>();
  private evidence = new Map<string, EvidenceReceiptV1>();
  private checkpoints = new Map<string, EvidenceCheckpointV1>();
  private batches = new Map<
    string,
    { digest: string; result: EvidenceBatchResultV1 }
  >();
  async intake(input: EvidenceIntakeCommitV1) {
    input = structuredClone(input);
    validateEvidenceIntakeV1(input);
    const batchKey = JSON.stringify([scopeKey(input), input.operationId]),
      prior = this.batches.get(batchKey);
    if (prior) {
      if (prior.digest !== input.requestDigest)
        conflict("Batch identity has different input");
      return structuredClone(prior.result);
    }
    if (
      input.checkpoint &&
      (this.checkpoints.get(scopeKey(input))?.revision ?? null) !==
        input.expectedCheckpointRevision
    )
      conflict("Checkpoint changed");
    const newEvents = new Map<string, EvidenceEventReceiptV1>(),
      newEvidence = new Map<string, EvidenceReceiptV1>();
    for (const event of input.events) {
      const key = JSON.stringify([scopeKey(event), event.eventId]),
        old = newEvents.get(key) ?? this.events.get(key);
      if (old && old.inputDigest !== event.inputDigest)
        conflict("Event identity has different content or submitter");
      if (!old) newEvents.set(key, event);
    }
    for (const record of input.evidence) {
      const key = evidenceKeyV1(record),
        old = newEvidence.get(key) ?? this.evidence.get(key);
      if (old && old.inputDigest !== record.inputDigest)
        conflict("Evidence identity has different content");
      if (!old) newEvidence.set(key, record);
    }
    for (const [key, event] of newEvents) this.events.set(key, event);
    for (const [key, record] of newEvidence) this.evidence.set(key, record);
    if (input.checkpoint)
      this.checkpoints.set(scopeKey(input), input.checkpoint);
    const result = {
      insertedEvents: newEvents.size,
      insertedEvidence: newEvidence.size,
      ...(input.checkpoint ? { checkpoint: input.checkpoint } : {}),
    };
    this.batches.set(batchKey, { digest: input.requestDigest, result });
    return structuredClone(result);
  }
  async checkpoint(scope: EvidenceScopeV1) {
    return structuredClone(this.checkpoints.get(scopeKey(scope)));
  }
  async get(key: EvidenceKeyV1) {
    return structuredClone(this.evidence.get(evidenceKeyV1(key)));
  }
  async getEvent(scope: EvidenceScopeV1, eventId: string) {
    return structuredClone(
      this.events.get(JSON.stringify([scopeKey(scope), eventId])),
    );
  }
  async list(scope: EvidenceScopeV1, query: EvidenceReceiptQueryV1) {
    const position = (r: EvidenceIdentityV1 & { createdAt: string }) => [
      r.createdAt,
      r.evidenceId,
      r.evidenceRevision,
    ];
    const compare = (a: string[], b: string[]) => {
      for (let i = 0; i < a.length; i++)
        if (a[i] !== b[i]) return compareEventTokensV1(a[i], b[i]);
      return 0;
    };
    return structuredClone(
      [...this.evidence.values()]
        .filter(
          (r) =>
            scopeKey(r) === scopeKey(scope) &&
            (!query.status || r.status === query.status) &&
            (!query.projection || r.projection === query.projection) &&
            (!query.readyAt || r.availableAt <= query.readyAt) &&
            (!query.leaseExpiredAt ||
              (r.lease && r.lease.until <= query.leaseExpiredAt)) &&
            (!query.uncompactedBefore ||
              (!r.compactedAt && r.updatedAt < query.uncompactedBefore)) &&
            (!query.after || compare(position(r), position(query.after)) > 0),
        )
        .sort((a, b) => compare(position(a), position(b)))
        .slice(0, query.limit),
    );
  }
  async compareAndSet(input: EvidenceReceiptV1, expected: number) {
    const record = structuredClone(input),
      key = evidenceKeyV1(record),
      old = this.evidence.get(key);
    if (!old || !evidenceReceiptFollowsV1(record, old, expected)) return false;
    this.evidence.set(key, record);
    return true;
  }
  async compactEvents(scope: EvidenceScopeV1, before: string, limit: number) {
    let count = 0;
    for (const [key, event] of this.events)
      if (
        count < limit &&
        scopeKey(event) === scopeKey(scope) &&
        event.receivedAt < before &&
        event.event !== undefined &&
        event.evidence.every((identity) => {
          const record = this.evidence.get(
            evidenceKeyV1({ ...scope, ...identity }),
          );
          return (
            record?.status === "completed" && record.projection === "applied"
          );
        })
      ) {
        const next = { ...event };
        delete next.event;
        this.events.set(key, next);
        count++;
      }
    return count;
  }
}

/** Durable analysis receipts. Model execution and provider cursors remain host adapters. */
export class IncrementalEvidenceServiceV1<Context> {
  constructor(
    private readonly store: IncrementalEvidenceStoreV1,
    private readonly access: EvidenceProcessingAccessV1<Context>,
    private readonly options: { clock?: () => Date; id?: () => string } = {},
  ) {}
  private now() {
    return (this.options.clock?.() ?? new Date()).toISOString();
  }
  private async principal(context: Context) {
    const p = await this.access.authenticate(context);
    if (!p)
      throw new AgentPlatError(
        "UNAUTHORIZED",
        "Evidence authentication required",
      );
    eventTokenV1(p.tenantId);
    eventTokenV1(p.actorId);
    return structuredClone(p);
  }
  private async allow(
    p: EvidencePrincipalV1,
    operation: Parameters<
      EvidenceProcessingAccessV1<Context>["authorize"]
    >[1]["operation"],
    scope: Omit<EvidenceScopeV1, "tenantId">,
    extra: {
      evidence?: EvidenceIdentityV1;
      batch?: EvidenceBatchInputV1;
      proofRefs?: string[];
      eventId?: string;
    } = {},
  ) {
    eventTokenV1(scope.consumerId);
    eventTokenV1(scope.source);
    const details = structuredClone(extra);
    if (details.evidence)
      details.evidence = {
        evidenceId: details.evidence.evidenceId,
        evidenceRevision: details.evidence.evidenceRevision,
      };
    if (
      !(await this.access.authorize(structuredClone(p), {
        operation,
        consumerId: scope.consumerId,
        source: scope.source,
        ...details,
      }))
    )
      throw new AgentPlatError("FORBIDDEN", "Evidence operation denied");
  }
  private checkScope(record: EvidenceReceiptV1, scope: EvidenceScopeV1) {
    validateEvidenceReceiptV1(record);
    if (scopeKey(record) !== scopeKey(scope))
      throw new AgentPlatError(
        "ADAPTER_ERROR",
        "Evidence adapter returned another scope",
      );
  }
  private async receipt(
    p: EvidencePrincipalV1,
    key: Omit<EvidenceKeyV1, "tenantId">,
  ) {
    const identityKey = {
      tenantId: p.tenantId,
      consumerId: key.consumerId,
      source: key.source,
      evidenceId: key.evidenceId,
      evidenceRevision: key.evidenceRevision,
    };
    identity(identityKey);
    const record = await this.store.get(identityKey);
    if (record) {
      this.checkScope(record, identityKey);
      if (evidenceKeyV1(record) !== evidenceKeyV1(identityKey))
        throw new AgentPlatError(
          "ADAPTER_ERROR",
          "Evidence adapter returned another identity",
        );
    }
    return record;
  }
  async receiveBatch(
    context: Context,
    request: EvidenceBatchInputV1,
  ): Promise<EvidenceBatchResultV1> {
    const input = structuredClone(request);
    boundedEventJsonV1(input, 1_048_576);
    eventTokenV1(input.operationId);
    if (!Array.isArray(input.events) || input.events.length > 100)
      throw new AgentPlatError("VALIDATION_ERROR", "Invalid evidence batch");
    const p = await this.principal(context);
    await this.allow(p, "receive", input, { batch: input });
    const scope = {
        tenantId: p.tenantId,
        consumerId: input.consumerId,
        source: input.source,
      },
      now = this.now();
    const commit: EvidenceIntakeCommitV1 = {
      ...scope,
      operationId: input.operationId,
      requestDigest: await eventRecordDigestV1({ actorId: p.actorId, input }),
      events: [],
      evidence: [],
    };
    for (const item of input.events) {
      const event = item.event;
      eventTokenV1(event.id);
      eventTokenV1(event.type);
      eventTimestampV1(event.occurredAt);
      boundedEventJsonV1(event);
      if (
        !event.payload ||
        typeof event.payload !== "object" ||
        Array.isArray(event.payload)
      )
        throw new AgentPlatError(
          "VALIDATION_ERROR",
          "Event payload must be an object",
        );
      if (
        event.tenantId !== p.tenantId ||
        event.source !== input.source ||
        !Array.isArray(item.evidence) ||
        item.evidence.length > 100
      )
        throw new AgentPlatError(
          "VALIDATION_ERROR",
          "Invalid event source or evidence references",
        );
      commit.events.push({
        ...scope,
        eventId: event.id,
        event,
        evidence: item.evidence.map((d) => ({
          evidenceId: d.evidenceId,
          evidenceRevision: d.evidenceRevision,
        })),
        submittedBy: p.actorId,
        receivedAt: now,
        inputDigest: await eventRecordDigestV1({
          actorId: p.actorId,
          event,
          evidence: item.evidence,
        }),
      });
      for (const descriptor of item.evidence) {
        eventTokenV1(descriptor.evidenceId);
        eventTokenV1(descriptor.evidenceRevision);
        eventTokenV1(descriptor.reference);
        const reference: EvidenceReferenceV1 = {
          evidenceId: descriptor.evidenceId,
          evidenceRevision: descriptor.evidenceRevision,
          reference: descriptor.reference,
        };
        commit.evidence.push({
          ...scope,
          ...reference,
          inputDigest: await eventRecordDigestV1(reference),
          discoveredEventId: event.id,
          revision: 0,
          status: "pending",
          generation: 0,
          availableAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    if (input.checkpoint) {
      if (input.checkpoint.expectedRevision !== null)
        integer(input.checkpoint.expectedRevision);
      commit.expectedCheckpointRevision = input.checkpoint.expectedRevision;
      commit.checkpoint = {
        ...scope,
        revision: (input.checkpoint.expectedRevision ?? -1) + 1,
        position: input.checkpoint.position,
        updatedAt: now,
      };
    }
    await this.allow(p, "receive", input, { batch: input });
    return this.store.intake(commit);
  }
  async checkpoint(context: Context, scope: Omit<EvidenceScopeV1, "tenantId">) {
    scope = structuredClone(scope);
    const p = await this.principal(context);
    await this.allow(p, "read", scope);
    const checkpoint = await this.store.checkpoint({
      ...scope,
      tenantId: p.tenantId,
    });
    if (
      checkpoint &&
      scopeKey(checkpoint) !== scopeKey({ ...scope, tenantId: p.tenantId })
    )
      throw new AgentPlatError(
        "ADAPTER_ERROR",
        "Checkpoint adapter returned another scope",
      );
    return checkpoint;
  }
  async read(context: Context, key: Omit<EvidenceKeyV1, "tenantId">) {
    key = structuredClone(key);
    const p = await this.principal(context);
    await this.allow(p, "read", key, { evidence: key });
    const record = await this.receipt(p, key);
    if (record) {
      validateEvidenceReceiptV1(record);
      if (
        evidenceKeyV1(record) !==
        evidenceKeyV1({ ...key, tenantId: p.tenantId })
      )
        throw new AgentPlatError(
          "ADAPTER_ERROR",
          "Evidence lookup returned another scope",
        );
    }
    return record;
  }
  async readEvent(
    context: Context,
    scope: Omit<EvidenceScopeV1, "tenantId">,
    eventId: string,
  ) {
    scope = structuredClone(scope);
    eventTokenV1(eventId);
    const p = await this.principal(context);
    await this.allow(p, "read", scope, { eventId });
    const event = await this.store.getEvent(
      { ...scope, tenantId: p.tenantId },
      eventId,
    );
    if (event) {
      if (
        event.tenantId !== p.tenantId ||
        event.consumerId !== scope.consumerId ||
        event.source !== scope.source ||
        event.eventId !== eventId
      )
        throw new AgentPlatError(
          "ADAPTER_ERROR",
          "Event lookup returned another scope",
        );
      for (const evidence of event.evidence)
        await this.allow(p, "read", scope, { evidence });
    }
    return event;
  }
  async pendingProjections(
    context: Context,
    scope: Omit<EvidenceScopeV1, "tenantId">,
    limit = 100,
  ) {
    scope = structuredClone(scope);
    integer(limit, 1, 200);
    const p = await this.principal(context);
    await this.allow(p, "project", scope);
    const rows = await this.store.list(
      { ...scope, tenantId: p.tenantId },
      { status: "completed", projection: "pending", limit },
    );
    for (const record of rows) {
      this.checkScope(record, { ...scope, tenantId: p.tenantId });
      await this.allow(p, "project", scope, { evidence: record });
    }
    return rows;
  }
  async claim(
    context: Context,
    input: Omit<EvidenceScopeV1, "tenantId"> & {
      workerId: string;
      leaseMs?: number;
    },
  ) {
    input = structuredClone(input);
    eventTokenV1(input.workerId);
    const leaseMs = input.leaseMs ?? 300_000;
    integer(leaseMs, 1000, 600_000);
    const p = await this.principal(context),
      scope = {
        tenantId: p.tenantId,
        consumerId: input.consumerId,
        source: input.source,
      };
    await this.allow(p, "claim", scope);
    const now = this.now();
    for (const expired of await this.store.list(scope, {
      status: "leased",
      leaseExpiredAt: now,
      limit: 100,
    })) {
      this.checkScope(expired, scope);
      await this.allow(p, "claim", scope, { evidence: expired });
      await this.store.compareAndSet(
        {
          ...expired,
          revision: expired.revision + 1,
          status: "uncertain",
          reason: "analysis_lease_expired",
          updatedAt: now,
        },
        expired.revision,
      );
    }
    for (let attempt = 0; attempt < 16; attempt++) {
      const candidate = (
        await this.store.list(scope, {
          status: "pending",
          readyAt: this.now(),
          limit: 1,
        })
      )[0];
      if (!candidate) return undefined;
      this.checkScope(candidate, scope);
      const record: EvidenceReceiptV1 = {
        ...candidate,
        status: "leased",
        revision: candidate.revision + 1,
        generation: candidate.generation + 1,
        lease: {
          token: this.options.id?.() ?? globalThis.crypto.randomUUID(),
          workerId: input.workerId,
          actorId: p.actorId,
          until: new Date(Date.parse(now) + leaseMs).toISOString(),
        },
        updatedAt: now,
      };
      await this.allow(p, "claim", scope, { evidence: record });
      record.updatedAt = this.now();
      record.lease!.until = new Date(
        Date.parse(record.updatedAt) + leaseMs,
      ).toISOString();
      if (await this.store.compareAndSet(record, candidate.revision))
        return record;
    }
    conflict("Evidence claim contention");
  }
  async assertCurrent(context: Context, claim: EvidenceReceiptV1) {
    claim = structuredClone(claim);
    const p = await this.principal(context);
    await this.allow(p, "settle", claim, { evidence: claim });
    if (p.tenantId !== claim.tenantId)
      throw new AgentPlatError("FORBIDDEN", "Cross-tenant claim");
    const current = await this.receipt(p, claim);
    if (
      !current ||
      current.status !== "leased" ||
      current.generation !== claim.generation ||
      !same(current.lease, claim.lease) ||
      current.lease!.actorId !== p.actorId ||
      current.lease!.until <= this.now()
    )
      conflict("Evidence lease lost; reconcile the outcome");
    return current;
  }
  async complete(
    context: Context,
    claim: EvidenceReceiptV1,
    result: JsonValue,
    resultReference: string,
  ) {
    claim = structuredClone(claim);
    result = structuredClone(result);
    boundedEventJsonV1(result);
    eventTokenV1(resultReference);
    const digest = await eventRecordDigestV1({ result, resultReference });
    const prior = await this.read(context, claim);
    if (
      prior?.status === "completed" &&
      prior.generation === claim.generation &&
      same(prior.lease, claim.lease) &&
      prior.resultDigest === digest
    ) {
      const p = await this.principal(context);
      await this.allow(p, "settle", claim, { evidence: claim });
      if (p.tenantId !== claim.tenantId || p.actorId !== prior.lease?.actorId)
        throw new AgentPlatError(
          "FORBIDDEN",
          "Claim belongs to another worker",
        );
      return prior;
    }
    const current = await this.assertCurrent(context, claim);
    const next: EvidenceReceiptV1 = {
      ...current,
      revision: current.revision + 1,
      status: "completed",
      result,
      resultReference,
      resultDigest: digest,
      projection: "pending",
      updatedAt: this.now(),
    };
    if (!(await this.store.compareAndSet(next, current.revision))) {
      const raced = await this.read(context, claim);
      if (
        raced?.status === "completed" &&
        raced.generation === claim.generation &&
        same(raced.lease, claim.lease) &&
        raced.resultDigest === digest
      )
        return raced;
      conflict();
    }
    return next;
  }
  async fail(
    context: Context,
    claim: EvidenceReceiptV1,
    outcome: "not_started" | "uncertain",
    reason: string,
    retryAfterMs = 30_000,
  ) {
    claim = structuredClone(claim);
    eventTokenV1(reason);
    integer(retryAfterMs, 0, 86_400_000);
    if (!["not_started", "uncertain"].includes(outcome))
      throw new AgentPlatError("VALIDATION_ERROR", "Invalid failure outcome");
    const current = await this.assertCurrent(context, claim);
    const now = this.now();
    const next: EvidenceReceiptV1 = {
      ...current,
      revision: current.revision + 1,
      status: outcome === "not_started" ? "pending" : "uncertain",
      reason,
      availableAt:
        outcome === "not_started"
          ? new Date(Date.parse(now) + retryAfterMs).toISOString()
          : current.availableAt,
      updatedAt: now,
    };
    if (!(await this.store.compareAndSet(next, current.revision))) conflict();
    return next;
  }
  async acknowledgeProjection(
    context: Context,
    key: Omit<EvidenceKeyV1, "tenantId">,
    resultDigest: string,
  ) {
    key = structuredClone(key);
    const p = await this.principal(context);
    await this.allow(p, "project", key, { evidence: key });
    const current = await this.receipt(p, key);
    if (
      !current ||
      current.status !== "completed" ||
      current.resultDigest !== resultDigest
    )
      conflict("Projection does not match the stored result");
    if (current.projection === "applied") return current;
    const next = {
      ...current,
      projection: "applied" as const,
      revision: current.revision + 1,
      updatedAt: this.now(),
    };
    if (!(await this.store.compareAndSet(next, current.revision))) {
      const raced = await this.receipt(p, key);
      if (
        raced?.status === "completed" &&
        raced.projection === "applied" &&
        raced.resultDigest === resultDigest
      )
        return raced;
      conflict();
    }
    return next;
  }
  /** The callback performs idempotent domain writes, not inference. It can replay after a crash. */
  async project(
    context: Context,
    key: Omit<EvidenceKeyV1, "tenantId">,
    apply: (input: {
      key: EvidenceKeyV1;
      operationId: string;
      result: JsonValue;
      resultReference: string;
    }) => Promise<void>,
  ) {
    key = structuredClone(key);
    const p = await this.principal(context);
    await this.allow(p, "project", key, { evidence: key });
    const current = await this.receipt(p, key);
    if (!current || current.status !== "completed")
      conflict("Analysis result is not ready for projection");
    if (current.projection === "applied") return current;
    if (current.result === undefined)
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Unapplied analysis payload is missing",
      );
    const identity: EvidenceKeyV1 = {
      tenantId: current.tenantId,
      consumerId: current.consumerId,
      source: current.source,
      evidenceId: current.evidenceId,
      evidenceRevision: current.evidenceRevision,
    };
    const operationId = `projection:${await eventRecordDigestV1({ identity, resultDigest: current.resultDigest })}`;
    await this.allow(p, "project", key, { evidence: key });
    await apply({
      key: identity,
      operationId,
      result: structuredClone(current.result),
      resultReference: current.resultReference!,
    });
    return this.acknowledgeProjection(context, key, current.resultDigest!);
  }
  async reconcile(
    context: Context,
    input: Omit<EvidenceKeyV1, "tenantId"> & {
      operationId: string;
      expectedGeneration: number;
      proofRefs: string[];
      outcome:
        | { kind: "completed"; result: JsonValue; resultReference: string }
        | { kind: "not_started" };
    },
  ) {
    input = structuredClone(input);
    eventTokenV1(input.operationId);
    integer(input.expectedGeneration);
    if (
      !Array.isArray(input.proofRefs) ||
      !input.proofRefs.length ||
      input.proofRefs.length > 32
    )
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Reconciliation needs verified proof references",
      );
    input.proofRefs.forEach(eventTokenV1);
    boundedEventJsonV1(input, 131_072);
    if (!["completed", "not_started"].includes(input.outcome.kind))
      throw new AgentPlatError("VALIDATION_ERROR", "Invalid reconciliation");
    if (input.outcome.kind === "completed")
      boundedEventJsonV1(input.outcome.result);
    const p = await this.principal(context);
    await this.allow(p, "reconcile", input, {
      evidence: input,
      proofRefs: input.proofRefs,
    });
    const current = await this.receipt(p, input);
    if (!current) conflict();
    const digest = await eventRecordDigestV1({ actorId: p.actorId, input }),
      prior =
        current.reconciliations &&
        Object.hasOwn(current.reconciliations, input.operationId)
          ? current.reconciliations[input.operationId]
          : undefined;
    if (prior) {
      if (prior !== digest) conflict("Reconciliation identity changed");
      return current;
    }
    if (
      current.generation !== input.expectedGeneration ||
      !(
        current.status === "uncertain" ||
        (current.status === "leased" && current.lease!.until <= this.now())
      )
    )
      conflict("Only uncertain outcomes can be reconciled");
    const next: EvidenceReceiptV1 = {
      ...current,
      revision: current.revision + 1,
      generation: current.generation + 1,
      status: input.outcome.kind === "completed" ? "completed" : "pending",
      availableAt: this.now(),
      reconciliations: {
        ...current.reconciliations,
        [input.operationId]: digest,
      },
      updatedAt: this.now(),
    };
    if (input.outcome.kind === "completed") {
      eventTokenV1(input.outcome.resultReference);
      next.result = input.outcome.result;
      next.resultReference = input.outcome.resultReference;
      next.resultDigest = await eventRecordDigestV1({
        result: next.result,
        resultReference: next.resultReference,
      });
      next.projection = "pending";
    }
    if (!(await this.store.compareAndSet(next, current.revision))) conflict();
    return next;
  }
  async compact(
    context: Context,
    scope: Omit<EvidenceScopeV1, "tenantId">,
    before: string,
    limit = 100,
  ) {
    scope = structuredClone(scope);
    eventTimestampV1(before);
    integer(limit, 1, 200);
    const p = await this.principal(context);
    await this.allow(p, "compact", scope);
    if (before > this.now())
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Cannot compact future evidence",
      );
    const fullScope = { ...scope, tenantId: p.tenantId };
    let results = 0;
    for (const current of await this.store.list(fullScope, {
      status: "completed",
      projection: "applied",
      uncompactedBefore: before,
      limit,
    }))
      if (!current.compactedAt && current.updatedAt < before) {
        this.checkScope(current, fullScope);
        await this.allow(p, "compact", scope, { evidence: current });
        const next = {
          ...current,
          revision: current.revision + 1,
          compactedAt: this.now(),
          updatedAt: this.now(),
        };
        delete next.result;
        if (await this.store.compareAndSet(next, current.revision)) results++;
      }
    return {
      results,
      events: await this.store.compactEvents(fullScope, before, limit),
    };
  }
}
