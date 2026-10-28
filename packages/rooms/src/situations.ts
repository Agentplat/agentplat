import { AgentPlatError } from "@agentplat/core";
import type { JsonObject, TenantContext } from "@agentplat/core";
import {
  boundedEventJsonV1,
  compareEventTokensV1,
  eventRecordDigestV1,
  eventTimestampV1,
  eventTokenV1,
} from "@agentplat/events";
import {
  checkedFollowupRecordV1,
  followupPageCursorV1,
  InMemoryFollowupRevisionStoreV1,
  type FollowupRevisionV1,
  type FollowupRevisionStoreV1,
} from "./followup-records.js";

export type RoomSituationStatusV1 =
  "open" | "waiting" | "snoozed" | "resolved" | "dismissed";
export interface SituationLinkV1 {
  roomId: string;
  threadId?: string;
  messageId?: string;
}
export interface SituationCauseV1 {
  kind: "owner_instruction" | "evidence" | "policy";
  explanation: string;
  references: string[];
}
export interface RoomSituationContentV1 {
  primaryRoomId: string;
  title: string;
  summary: string;
  nextAction?: string;
  status: RoomSituationStatusV1;
  snoozedUntil?: string;
  deadline?: { at: string; certainty: "confirmed" | "inferred" };
  attention?: { rank: number; reason: string };
  ownerReference?: string;
  links: SituationLinkV1[];
  evidenceRefs: string[];
  artifactRefs: string[];
  attributes: JsonObject;
}
export interface RoomSituationV1
  extends RoomSituationContentV1, FollowupRevisionV1 {
  cause: SituationCauseV1;
}
export interface RoomSituationChangeV1 {
  sequence: number;
  record: RoomSituationV1;
}
export interface RoomSituationStoreV1 extends FollowupRevisionStoreV1<RoomSituationV1> {
  list(
    tenantId: string,
    roomIds: string[],
    afterId: string | undefined,
    limit: number,
  ): Promise<RoomSituationV1[]>;
  changes(
    tenantId: string,
    roomIds: string[],
    afterSequence: number,
    limit: number,
  ): Promise<RoomSituationChangeV1[]>;
}
export interface RoomSituationAccessV1<Context> {
  authenticate(context: Context): Promise<TenantContext | null>;
  authorize(
    principal: TenantContext,
    request: {
      operation: "read" | "history" | "apply" | "list";
      situation?: RoomSituationV1;
      roomIds?: string[];
    },
  ): Promise<boolean>;
}
export interface ApplySituationInputV1 {
  id: string;
  operationId: string;
  expectedRevision: number | null;
  content: RoomSituationContentV1;
  cause: SituationCauseV1;
}
function conflict(): never {
  throw new AgentPlatError(
    "CONFLICT",
    "Situation revision or operation changed",
  );
}
function listOfTokens(values: string[], maximum = 128) {
  if (
    !Array.isArray(values) ||
    values.length > maximum ||
    new Set(values).size !== values.length
  )
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Invalid situation references",
    );
  values.forEach(eventTokenV1);
}
function count(value: number, minimum: number, maximum: number) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Invalid situation page/revision",
    );
}
export function validateRoomSituationV1(record: RoomSituationV1): void {
  eventTokenV1(record.primaryRoomId);
  eventTokenV1(record.title);
  if (
    typeof record.summary !== "string" ||
    record.summary.length > 16_000 ||
    (record.nextAction !== undefined &&
      (typeof record.nextAction !== "string" ||
        record.nextAction.length > 8000))
  )
    throw new AgentPlatError("VALIDATION_ERROR", "Invalid situation content");
  if (
    !["open", "waiting", "snoozed", "resolved", "dismissed"].includes(
      record.status,
    )
  )
    throw new AgentPlatError("VALIDATION_ERROR", "Invalid situation status");
  if (record.snoozedUntil) eventTimestampV1(record.snoozedUntil);
  if (record.status === "snoozed" && !record.snoozedUntil)
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Snoozed situation needs a time",
    );
  if (record.status !== "snoozed" && record.snoozedUntil !== undefined)
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Only snoozed situations can have a snooze time",
    );
  if (record.deadline) {
    eventTimestampV1(record.deadline.at);
    if (!["confirmed", "inferred"].includes(record.deadline.certainty))
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Invalid deadline certainty",
      );
  }
  if (
    record.attention &&
    (!Number.isSafeInteger(record.attention.rank) ||
      Math.abs(record.attention.rank) > 1_000_000 ||
      typeof record.attention.reason !== "string" ||
      !record.attention.reason.trim() ||
      record.attention.reason.length > 4000)
  )
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Invalid attention policy result",
    );
  if (record.ownerReference !== undefined) eventTokenV1(record.ownerReference);
  if (!Array.isArray(record.links) || record.links.length > 64)
    throw new AgentPlatError("VALIDATION_ERROR", "Invalid situation links");
  for (const link of record.links) {
    eventTokenV1(link.roomId);
    if (link.threadId !== undefined) eventTokenV1(link.threadId);
    if (link.messageId !== undefined) eventTokenV1(link.messageId);
  }
  listOfTokens(record.evidenceRefs);
  listOfTokens(record.artifactRefs);
  if (
    !record.attributes ||
    Array.isArray(record.attributes) ||
    typeof record.attributes !== "object"
  )
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Situation attributes must be an object",
    );
  if (
    !record.cause ||
    !["owner_instruction", "evidence", "policy"].includes(record.cause.kind) ||
    typeof record.cause.explanation !== "string" ||
    !record.cause.explanation.trim()
  )
    throw new AgentPlatError("VALIDATION_ERROR", "A change needs its cause");
  listOfTokens(record.cause.references);
  if (!record.cause.references.length)
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Situation changes require evidence or owner references",
    );
  boundedEventJsonV1(record, 131_072);
}
export function situationFollowsV1(
  next: RoomSituationV1,
  previous: RoomSituationV1 | undefined,
): boolean {
  validateRoomSituationV1(next);
  return !previous || next.primaryRoomId === previous.primaryRoomId;
}
export class InMemoryRoomSituationStoreV1
  extends InMemoryFollowupRevisionStoreV1<RoomSituationV1>
  implements RoomSituationStoreV1
{
  private sequence = 0;
  private journal: RoomSituationChangeV1[] = [];
  override async commit(record: RoomSituationV1, expected: number | null) {
    validateRoomSituationV1(record);
    if (
      !situationFollowsV1(record, await this.head(record.tenantId, record.id))
    )
      return false;
    if (!(await super.commit(record, expected))) return false;
    this.journal.push({
      sequence: ++this.sequence,
      record: structuredClone(record),
    });
    return true;
  }
  async list(
    tenantId: string,
    roomIds: string[],
    afterId: string | undefined,
    limit: number,
  ) {
    return structuredClone(
      [...this.records.values()]
        .map((rows) => rows.at(-1)!)
        .filter(
          (r) =>
            r.tenantId === tenantId &&
            roomIds.includes(r.primaryRoomId) &&
            (!afterId || compareEventTokensV1(r.id, afterId) > 0),
        )
        .sort((a, b) => compareEventTokensV1(a.id, b.id))
        .slice(0, limit),
    );
  }
  async changes(
    tenantId: string,
    roomIds: string[],
    after: number,
    limit: number,
  ) {
    return structuredClone(
      this.journal
        .filter(
          (e) =>
            e.record.tenantId === tenantId &&
            roomIds.includes(e.record.primaryRoomId) &&
            e.sequence > after,
        )
        .slice(0, limit),
    );
  }
}

/** A matter is not an execution objective. Business urgency and source verification are host policy. */
export class RoomSituationServiceV1<Context> {
  constructor(
    private readonly store: RoomSituationStoreV1,
    private readonly access: RoomSituationAccessV1<Context>,
    private readonly options: { clock?: () => Date } = {},
  ) {}
  private now() {
    return (this.options.clock?.() ?? new Date()).toISOString();
  }
  private async head(tenantId: string, id: string) {
    const record = checkedFollowupRecordV1(
      await this.store.head(tenantId, id),
      tenantId,
      id,
    );
    if (record) validateRoomSituationV1(record);
    return record;
  }
  private async operation(tenantId: string, id: string, operationId: string) {
    const record = checkedFollowupRecordV1(
      await this.store.operation(tenantId, id, operationId),
      tenantId,
      id,
    );
    if (record) {
      validateRoomSituationV1(record);
      if (record.operationId !== operationId)
        throw new AgentPlatError(
          "ADAPTER_ERROR",
          "Follow-up operation identity mismatch",
        );
    }
    return record;
  }
  private async principal(context: Context) {
    const p = await this.access.authenticate(context);
    if (!p?.tenantId || !p.actor?.actorId)
      throw new AgentPlatError(
        "UNAUTHORIZED",
        "Situation authentication required",
      );
    eventTokenV1(p.tenantId);
    eventTokenV1(p.actor.actorId);
    return structuredClone(p);
  }
  private async allow(
    p: TenantContext,
    operation: "read" | "history" | "apply" | "list",
    situation?: RoomSituationV1,
    roomIds?: string[],
  ) {
    if (
      !(await this.access.authorize(structuredClone(p), {
        operation,
        ...(situation ? { situation: structuredClone(situation) } : {}),
        ...(roomIds ? { roomIds: [...roomIds] } : {}),
      }))
    )
      throw new AgentPlatError("FORBIDDEN", "Situation access denied");
  }
  async apply(
    context: Context,
    request: ApplySituationInputV1,
  ): Promise<RoomSituationV1> {
    const input = structuredClone(request);
    eventTokenV1(input.id);
    eventTokenV1(input.operationId);
    if (input.expectedRevision !== null)
      count(input.expectedRevision, 1, Number.MAX_SAFE_INTEGER - 1);
    const p = await this.principal(context),
      current = await this.head(p.tenantId, input.id),
      now = this.now();
    const record: RoomSituationV1 = {
      ...input.content,
      schemaVersion: 1,
      cause: input.cause,
      id: input.id,
      tenantId: p.tenantId,
      revision: (input.expectedRevision ?? 0) + 1,
      operationId: input.operationId,
      actorId: p.actor!.actorId!,
      recordedAt: now,
      requestDigest: await eventRecordDigestV1({
        tenantId: p.tenantId,
        actorId: p.actor!.actorId,
        input,
      }),
    };
    validateRoomSituationV1(record);
    if (
      record.cause.kind === "owner_instruction" &&
      p.actor?.actorType !== "human"
    )
      throw new AgentPlatError(
        "FORBIDDEN",
        "A model or connector cannot impersonate an owner instruction",
      );
    await this.allow(p, "apply", record);
    if (current) await this.allow(p, "apply", current);
    const replay = await this.operation(
      p.tenantId,
      input.id,
      input.operationId,
    );
    if (replay) {
      if (replay.requestDigest !== record.requestDigest) conflict();
      await this.allow(p, "read", replay);
      return replay;
    }
    if ((current?.revision ?? null) !== input.expectedRevision) conflict();
    if (current && record.primaryRoomId !== current.primaryRoomId)
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Primary Room is immutable; use related links",
      );
    if (
      ["resolved", "dismissed"].includes(record.status) &&
      record.cause.kind === "policy"
    )
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Absence, reading or policy alone cannot close a situation",
      );
    if (
      current &&
      ["resolved", "dismissed"].includes(current.status) &&
      !["resolved", "dismissed"].includes(record.status) &&
      record.cause.kind === "policy"
    )
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Reopening needs explicit new evidence or owner instruction",
      );
    if (record.status === "snoozed" && record.snoozedUntil! <= now)
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Snooze time must be in the future",
      );
    await this.allow(p, "apply", record);
    if (!(await this.store.commit(record, input.expectedRevision))) {
      const raced = await this.operation(
        p.tenantId,
        input.id,
        input.operationId,
      );
      if (raced?.requestDigest === record.requestDigest) {
        await this.allow(p, "read", raced);
        return raced;
      }
      conflict();
    }
    return structuredClone(record);
  }
  async read(context: Context, id: string) {
    eventTokenV1(id);
    const p = await this.principal(context),
      record = await this.head(p.tenantId, id);
    if (!record) return undefined;
    await this.allow(p, "read", record);
    const latest = await this.head(p.tenantId, id);
    if (!latest || latest.revision !== record.revision) conflict();
    return record;
  }
  async history(context: Context, id: string, afterRevision = 0, limit = 50) {
    count(afterRevision, 0, Number.MAX_SAFE_INTEGER);
    count(limit, 1, 200);
    const p = await this.principal(context),
      current = await this.head(p.tenantId, id);
    if (!current) return [];
    await this.allow(p, "history", current);
    const rows = await this.store.history(p.tenantId, id, afterRevision, limit);
    for (const row of rows) await this.allow(p, "history", row);
    const latest = await this.head(p.tenantId, id);
    if (!latest || latest.revision !== current.revision) conflict();
    return rows;
  }
  async list(
    context: Context,
    roomIds: string[],
    input: { cursor?: string; limit?: number } = {},
  ) {
    input = structuredClone(input);
    const limit = input.limit ?? 50;
    roomIds = [...roomIds].sort();
    listOfTokens(roomIds, 50);
    if (!roomIds.length)
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Explicit authorized Rooms are required",
      );
    count(limit, 1, 200);
    const p = await this.principal(context);
    await this.allow(p, "list", undefined, roomIds);
    const page = await followupPageCursorV1(
      { tenantId: p.tenantId, roomIds, kind: "situations" },
      input.cursor,
      "id",
    );
    const rows = await this.store.list(
      p.tenantId,
      roomIds,
      page.after as string | undefined,
      limit + 1,
    );
    for (const row of rows) {
      await this.allow(p, "read", row);
      const latest = await this.head(p.tenantId, row.id);
      if (latest) await this.allow(p, "read", latest);
    }
    const situations = rows.slice(0, limit);
    return {
      situations,
      nextCursor: page.encode(situations.at(-1)?.id),
      hasMore: rows.length > limit,
    };
  }
  async changes(
    context: Context,
    roomIds: string[],
    input: { cursor?: string; limit?: number } = {},
  ) {
    input = structuredClone(input);
    const limit = input.limit ?? 50;
    roomIds = [...roomIds].sort();
    listOfTokens(roomIds, 50);
    if (!roomIds.length)
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Explicit authorized Rooms are required",
      );
    count(limit, 1, 200);
    const p = await this.principal(context);
    await this.allow(p, "list", undefined, roomIds);
    const page = await followupPageCursorV1(
      { tenantId: p.tenantId, roomIds, kind: "situation-changes" },
      input.cursor,
      "sequence",
    );
    const changes = await this.store.changes(
      p.tenantId,
      roomIds,
      (page.after as number | undefined) ?? 0,
      limit + 1,
    );
    for (const change of changes) {
      await this.allow(p, "read", change.record);
      const head = await this.head(p.tenantId, change.record.id);
      if (head) await this.allow(p, "read", head);
    }
    const selected = changes.slice(0, limit);
    return {
      changes: selected,
      nextCursor: page.encode(selected.at(-1)?.sequence ?? page.after ?? 0),
      hasMore: changes.length > limit,
    };
  }
}
