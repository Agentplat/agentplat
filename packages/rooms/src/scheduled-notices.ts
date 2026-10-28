import { AgentPlatError } from "@agentplat/core";
import {
  boundedEventJsonV1,
  compareEventTokensV1,
  eventRecordDigestV1,
  eventTimestampV1,
  eventTokenV1,
} from "@agentplat/events";
import {
  validateConversationReference,
  conversationReference,
} from "./conversations.js";
import type { RoomConversationReference } from "./conversations.js";
import type {
  RoomPlannerEvent,
  RoomPlannerScope,
  RoomPlannerState,
} from "./room-planner-contracts.js";
import { followupPageCursorV1 } from "./followup-records.js";
import {
  MemoryOperationTablesV1,
  operationConflictV1 as conflict,
  operationIntegerV1 as integer,
} from "./operations-records.js";

export interface PreparedNoticeV1 extends RoomConversationReference {
  recipientId: string;
  channel: string;
  title: string;
  body: string;
  actionLabel?: string;
  references: string[];
}
export type ScheduledActionV1 =
  | { kind: "notice"; notice: PreparedNoticeV1 }
  | {
      kind: "planner";
      event: RoomConversationReference & {
        content: string;
        objectiveId?: string;
        references: string[];
      };
    };
export interface ScheduledFollowupScopeV1 {
  tenantId: string;
  subjectId: string;
}
export interface ScheduledFollowupHeadV1 extends ScheduledFollowupScopeV1 {
  roomId: string;
  revision: number;
  subjectRevision: number;
  updatedAt: string;
}
export interface ScheduledActivationV1 extends ScheduledFollowupScopeV1 {
  id: string;
  roomId: string;
  subjectRevision: number;
  scheduleRevision: number;
  key: string;
  at: string;
  retryAt?: string;
  action: ScheduledActionV1;
  actorId: string;
  status: "planned" | "queued" | "canceled";
}
export interface ScheduledDeliveryV1 extends ScheduledFollowupScopeV1 {
  id: string;
  roomId: string;
  subjectRevision: number;
  scheduleRevision?: number;
  key: string;
  action: ScheduledActionV1;
  actorId: string;
  requestDigest: string;
  revision: number;
  status: "pending" | "delivering" | "delivered" | "uncertain" | "canceled";
  createdAt: string;
  availableAt: string;
  updatedAt: string;
  claim?: { token: string; actorId: string; until: string };
  receiptReference?: string;
  proofRefs?: string[];
}
export interface ScheduledFollowupTransactionV1 {
  head(): Promise<ScheduledFollowupHeadV1 | undefined>;
  putHead(record: ScheduledFollowupHeadV1): Promise<void>;
  activation(id: string): Promise<ScheduledActivationV1 | undefined>;
  putActivation(record: ScheduledActivationV1): Promise<void>;
  delivery(id: string): Promise<ScheduledDeliveryV1 | undefined>;
  putDelivery(record: ScheduledDeliveryV1): Promise<void>;
  operation(
    id: string,
  ): Promise<
    | { digest: string; value: ScheduledFollowupHeadV1 | ScheduledDeliveryV1 }
    | undefined
  >;
  putOperation(
    id: string,
    record: {
      digest: string;
      value: ScheduledFollowupHeadV1 | ScheduledDeliveryV1;
    },
  ): Promise<void>;
}
export interface ScheduledFollowupStoreV1 {
  transaction<T>(
    scope: ScheduledFollowupScopeV1,
    work: (tx: ScheduledFollowupTransactionV1) => Promise<T>,
  ): Promise<T>;
  due(
    tenantId: string,
    roomIds: string[],
    now: string,
    limit: number,
  ): Promise<ScheduledActivationV1[]>;
  pending(
    tenantId: string,
    roomIds: string[],
    now: string,
    limit: number,
  ): Promise<ScheduledDeliveryV1[]>;
  delivery(
    tenantId: string,
    id: string,
  ): Promise<ScheduledDeliveryV1 | undefined>;
  list(
    tenantId: string,
    roomIds: string[],
    query: {
      status?: ScheduledDeliveryV1["status"];
      after?: string;
      limit: number;
    },
  ): Promise<ScheduledDeliveryV1[]>;
}
export interface ScheduledFollowupPrincipalV1 {
  tenantId: string;
  actorId: string;
}
export interface ScheduledFollowupAccessV1<Context> {
  authenticate(context: Context): Promise<ScheduledFollowupPrincipalV1 | null>;
  authorize(
    principal: ScheduledFollowupPrincipalV1,
    request: {
      operation:
        "schedule" | "enqueue" | "read" | "activate" | "deliver" | "reconcile";
      roomIds: string[];
      subjectId?: string;
      subjectRevision?: number;
      action?: ScheduledActionV1;
    },
  ): Promise<boolean>;
  /** Reload and verify the subject revision, active state and every destination/reference before effects. */
  isCurrent(
    principal: ScheduledFollowupPrincipalV1,
    record: {
      roomId: string;
      subjectId: string;
      subjectRevision: number;
      action: ScheduledActionV1;
    },
  ): Promise<boolean>;
}
export interface ScheduledDeliveryPortV1 {
  /** Persist/return a real adapter receipt. An uncertain send must not be claimed as delivered. */
  deliver(
    record: ScheduledDeliveryV1,
    call: { idempotencyKey: string; assertCurrent(): Promise<void> },
  ): Promise<{ receiptReference: string }>;
}
export interface ReplaceScheduledFollowupV1 {
  subjectId: string;
  roomId: string;
  subjectRevision: number;
  expectedRevision: number | null;
  operationId: string;
  activations: { key: string; at: string; action: ScheduledActionV1 }[];
}
function scoped(
  record: ScheduledFollowupScopeV1,
  native: ScheduledFollowupScopeV1,
) {
  if (
    record.tenantId !== native.tenantId ||
    record.subjectId !== native.subjectId
  )
    throw new AgentPlatError(
      "ADAPTER_ERROR",
      "Scheduled follow-up scope changed",
    );
}
function validateAction(action: ScheduledActionV1) {
  boundedEventJsonV1(action, 32_768);
  if (action.kind !== "notice" && action.kind !== "planner")
    throw new AgentPlatError("VALIDATION_ERROR", "Invalid scheduled action");
  const value = action.kind === "notice" ? action.notice : action.event;
  const keys =
    action.kind === "notice"
      ? [
          "recipientId",
          "channel",
          "title",
          "body",
          "actionLabel",
          "references",
          "threadId",
          "replyToMessageId",
        ]
      : [
          "content",
          "objectiveId",
          "references",
          "threadId",
          "replyToMessageId",
        ];
  if (
    Object.keys(action).some(
      (k) =>
        !["kind", action.kind === "notice" ? "notice" : "event"].includes(k),
    ) ||
    !value ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Unknown scheduled action fields",
    );
  validateConversationReference(value);
  if (!Array.isArray(value.references) || value.references.length > 64)
    throw new AgentPlatError("VALIDATION_ERROR", "Invalid notice references");
  value.references.forEach(eventTokenV1);
  if (action.kind === "notice") {
    [
      action.notice.recipientId,
      action.notice.channel,
      action.notice.title,
    ].forEach(eventTokenV1);
    if (
      action.notice.title.length > 256 ||
      typeof action.notice.body !== "string" ||
      !action.notice.body.trim() ||
      action.notice.body.length > 8000
    )
      throw new AgentPlatError("VALIDATION_ERROR", "Invalid prepared notice");
    if (action.notice.actionLabel !== undefined)
      eventTokenV1(action.notice.actionLabel);
  } else {
    if (
      typeof action.event.content !== "string" ||
      !action.event.content.trim() ||
      action.event.content.length > 8000
    )
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Invalid activation content",
      );
    if (action.event.objectiveId !== undefined)
      eventTokenV1(action.event.objectiveId);
  }
}
export class InMemoryScheduledFollowupStoreV1 implements ScheduledFollowupStoreV1 {
  private tables = new MemoryOperationTablesV1();
  transaction<T>(
    scope: ScheduledFollowupScopeV1,
    work: (tx: ScheduledFollowupTransactionV1) => Promise<T>,
  ) {
    return this.tables.transaction(
      JSON.stringify([scope.tenantId, scope.subjectId]),
      async (tx) =>
        work({
          head: async () => tx.get("head", "head"),
          putHead: async (r) => {
            tx.put("head", "head", r);
          },
          activation: async (id) => tx.get("activation", id),
          putActivation: async (r) => {
            tx.put("activation", r.id, r);
          },
          delivery: async (id) => tx.get("delivery", id),
          putDelivery: async (r) => {
            tx.put("delivery", r.id, r);
          },
          operation: async (id) => tx.get("operation", id),
          putOperation: async (id, r) => {
            tx.put("operation", id, r);
          },
        }),
    );
  }
  async due(tenantId: string, rooms: string[], now: string, limit: number) {
    return this.tables
      .values<ScheduledActivationV1>("activation")
      .filter(
        (r) =>
          r.tenantId === tenantId &&
          rooms.includes(r.roomId) &&
          r.status === "planned" &&
          r.at <= now &&
          (!r.retryAt || r.retryAt <= now),
      )
      .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
      .slice(0, limit);
  }
  async pending(tenantId: string, rooms: string[], now: string, limit: number) {
    return this.tables
      .values<ScheduledDeliveryV1>("delivery")
      .filter(
        (r) =>
          r.tenantId === tenantId &&
          rooms.includes(r.roomId) &&
          ((r.status === "pending" && r.availableAt <= now) ||
            (r.status === "delivering" && r.claim!.until <= now)),
      )
      .sort(
        (a, b) =>
          a.availableAt.localeCompare(b.availableAt) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, limit);
  }
  async delivery(tenantId: string, id: string) {
    return this.tables
      .values<ScheduledDeliveryV1>("delivery")
      .find((r) => r.tenantId === tenantId && r.id === id);
  }
  async list(
    tenantId: string,
    rooms: string[],
    query: {
      status?: ScheduledDeliveryV1["status"];
      after?: string;
      limit: number;
    },
  ) {
    return this.tables
      .values<ScheduledDeliveryV1>("delivery")
      .filter(
        (r) =>
          r.tenantId === tenantId &&
          rooms.includes(r.roomId) &&
          (!query.status || r.status === query.status) &&
          (!query.after || compareEventTokensV1(r.id, query.after) > 0),
      )
      .sort((a, b) => compareEventTokensV1(a.id, b.id))
      .slice(0, query.limit);
  }
}
/** A timestamp intent and delivery outbox, not an alternate workflow or execution-authority engine. */
export class ScheduledFollowupServiceV1<Context> {
  constructor(
    private store: ScheduledFollowupStoreV1,
    private access: ScheduledFollowupAccessV1<Context>,
    private port: ScheduledDeliveryPortV1,
    private options: {
      clock?: () => Date;
      leaseMs?: number;
      id?: () => string;
    } = {},
  ) {
    integer(options.leaseMs ?? 60_000, 600_000);
    if ((options.leaseMs ?? 60_000) < 1000)
      throw new AgentPlatError("VALIDATION_ERROR", "Invalid delivery lease");
  }
  private now() {
    return (this.options.clock?.() ?? new Date()).toISOString();
  }
  private async principal(context: Context) {
    const p = await this.access.authenticate(context);
    if (!p)
      throw new AgentPlatError(
        "UNAUTHORIZED",
        "Follow-up authentication required",
      );
    eventTokenV1(p.tenantId);
    eventTokenV1(p.actorId);
    return structuredClone(p);
  }
  private async allow(
    p: ScheduledFollowupPrincipalV1,
    operation: Parameters<
      ScheduledFollowupAccessV1<Context>["authorize"]
    >[1]["operation"],
    roomIds: string[],
    record?: {
      subjectId: string;
      subjectRevision: number;
      action?: ScheduledActionV1;
    },
  ) {
    if (
      !roomIds.length ||
      roomIds.length > 50 ||
      new Set(roomIds).size !== roomIds.length
    )
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Select bounded unique Rooms",
      );
    roomIds.forEach(eventTokenV1);
    const request = {
      operation,
      roomIds: [...roomIds],
      ...(record
        ? {
            subjectId: record.subjectId,
            subjectRevision: record.subjectRevision,
            ...(record.action ? { action: record.action } : {}),
          }
        : {}),
    };
    if (
      !(await this.access.authorize(
        structuredClone(p),
        structuredClone(request),
      ))
    )
      throw new AgentPlatError(
        "FORBIDDEN",
        "Scheduled follow-up access denied",
      );
  }
  private async current(
    p: ScheduledFollowupPrincipalV1,
    record: {
      roomId: string;
      subjectId: string;
      subjectRevision: number;
      action: ScheduledActionV1;
    },
  ) {
    return this.access.isCurrent(structuredClone(p), structuredClone(record));
  }
  private async id(
    p: ScheduledFollowupPrincipalV1,
    subjectId: string,
    subjectRevision: number,
    key: string,
  ) {
    return `followup:${await eventRecordDigestV1({ tenantId: p.tenantId, subjectId, subjectRevision, key })}`;
  }
  replace(context: Context, request: ReplaceScheduledFollowupV1) {
    return this.writeSchedule(context, request, false);
  }
  /** Extend an unchanged subject's horizon without invalidating existing milestones. */
  extend(
    context: Context,
    request: ReplaceScheduledFollowupV1 & { expectedRevision: number },
  ) {
    return this.writeSchedule(context, request, true);
  }
  private async writeSchedule(
    context: Context,
    request: ReplaceScheduledFollowupV1,
    extend: boolean,
  ) {
    const input = structuredClone(request);
    boundedEventJsonV1(input, 524_288);
    [input.subjectId, input.operationId].forEach(eventTokenV1);
    integer(input.subjectRevision);
    if (input.subjectRevision < 1) conflict();
    if (input.expectedRevision !== null) integer(input.expectedRevision);
    if (!Array.isArray(input.activations) || input.activations.length > 100)
      throw new AgentPlatError("VALIDATION_ERROR", "Invalid activation batch");
    const p = await this.principal(context);
    await this.allow(p, "schedule", [input.roomId], input);
    const entries = new Map<
      string,
      ReplaceScheduledFollowupV1["activations"][number]
    >();
    for (const item of input.activations) {
      eventTokenV1(item.key);
      eventTimestampV1(item.at);
      validateAction(item.action);
      const prior = entries.get(item.key);
      if (
        prior &&
        (await eventRecordDigestV1(prior)) !== (await eventRecordDigestV1(item))
      )
        conflict("One milestone identity cannot have different contents");
      entries.set(item.key, item);
      await this.allow(p, "schedule", [input.roomId], {
        ...input,
        action: item.action,
      });
    }
    const digest = await eventRecordDigestV1({
        actorId: p.actorId,
        input,
        extend,
      }),
      native = { tenantId: p.tenantId, subjectId: input.subjectId },
      operationKey = `${extend ? "extend" : "replace"}:${input.operationId}`;
    return this.store.transaction(native, async (tx) => {
      const replay = await tx.operation(operationKey);
      if (replay) {
        scoped(replay.value, native);
        if (replay.digest !== digest) conflict();
        return replay.value as ScheduledFollowupHeadV1;
      }
      const old = await tx.head();
      if (old) scoped(old, native);
      if (
        (old?.revision ?? null) !== input.expectedRevision ||
        (old && old.roomId !== input.roomId) ||
        (extend
          ? !old || input.subjectRevision !== old.subjectRevision
          : !!old && input.subjectRevision <= old.subjectRevision)
      )
        conflict("Schedule or subject revision changed");
      const head: ScheduledFollowupHeadV1 = extend
        ? old!
        : {
            ...native,
            roomId: input.roomId,
            revision: (old?.revision ?? 0) + 1,
            subjectRevision: input.subjectRevision,
            updatedAt: this.now(),
          };
      await tx.putHead(head);
      for (const item of entries.values()) {
        const activation: ScheduledActivationV1 = {
          ...native,
          id: await this.id(
            p,
            input.subjectId,
            input.subjectRevision,
            item.key,
          ),
          roomId: input.roomId,
          subjectRevision: input.subjectRevision,
          scheduleRevision: head.revision,
          key: item.key,
          at: item.at,
          action: item.action,
          actorId: p.actorId,
          status: "planned",
        };
        const prior = await tx.activation(activation.id);
        if (prior) {
          scoped(prior, native);
          if (
            prior.at !== activation.at ||
            (await eventRecordDigestV1(prior.action)) !==
              (await eventRecordDigestV1(activation.action))
          )
            conflict("Existing milestone contents are immutable");
        } else await tx.putActivation(activation);
      }
      await tx.putOperation(operationKey, { digest, value: head });
      return head;
    });
  }
  /** Immediate and scheduled notices use the same subject/revision/milestone identity. */
  async enqueue(
    context: Context,
    request: {
      subjectId: string;
      subjectRevision: number;
      roomId: string;
      key: string;
      notice: PreparedNoticeV1;
    },
    expectedTenantId?: string,
  ) {
    const input = structuredClone(request);
    [input.subjectId, input.key].forEach(eventTokenV1);
    integer(input.subjectRevision);
    if (input.subjectRevision < 1) conflict();
    const action: ScheduledActionV1 = { kind: "notice", notice: input.notice };
    validateAction(action);
    const p = await this.principal(context);
    if (expectedTenantId !== undefined && p.tenantId !== expectedTenantId)
      throw new AgentPlatError(
        "FORBIDDEN",
        "Notification tenant differs from caller scope",
      );
    await this.allow(p, "enqueue", [input.roomId], { ...input, action });
    if (!(await this.current(p, { ...input, action })))
      conflict("Notice subject or destination is no longer current");
    const native = { tenantId: p.tenantId, subjectId: input.subjectId },
      id = await this.id(p, input.subjectId, input.subjectRevision, input.key),
      digest = await eventRecordDigestV1({ roomId: input.roomId, action });
    return this.store.transaction(native, async (tx) => {
      const old = await tx.delivery(id);
      if (old) {
        scoped(old, native);
        if (old.requestDigest !== digest)
          conflict("Notice identity has different prepared content");
        return old;
      }
      const activation = await tx.activation(id);
      if (
        activation &&
        (activation.roomId !== input.roomId ||
          (await eventRecordDigestV1(activation.action)) !==
            (await eventRecordDigestV1(action)))
      )
        conflict("Milestone already has different contents");
      const now = this.now(),
        record: ScheduledDeliveryV1 = {
          ...native,
          id,
          roomId: input.roomId,
          subjectRevision: input.subjectRevision,
          key: input.key,
          action,
          actorId: p.actorId,
          requestDigest: digest,
          revision: 1,
          status: activation?.status === "canceled" ? "canceled" : "pending",
          createdAt: now,
          availableAt: [now, activation?.at, activation?.retryAt]
            .filter((value): value is string => value !== undefined)
            .sort()
            .at(-1)!,
          ...(activation
            ? { scheduleRevision: activation.scheduleRevision }
            : {}),
          updatedAt: now,
        };
      await tx.putDelivery(record);
      return record;
    });
  }
  async activateDue(context: Context, roomIds: string[], limit = 50) {
    roomIds = [...roomIds];
    integer(limit, 200);
    if (!limit) conflict();
    const p = await this.principal(context);
    await this.allow(p, "activate", roomIds);
    let queued = 0;
    const failed: { id: string; reason: string }[] = [];
    for (const candidate of await this.store.due(
      p.tenantId,
      roomIds,
      this.now(),
      limit,
    )) {
      if (
        candidate.tenantId !== p.tenantId ||
        !roomIds.includes(candidate.roomId)
      )
        throw new AgentPlatError(
          "ADAPTER_ERROR",
          "Activation query returned another scope",
        );
      let current: boolean;
      try {
        await this.allow(p, "activate", [candidate.roomId], candidate);
        current = await this.current(p, candidate);
      } catch {
        await this.store.transaction(
          { tenantId: p.tenantId, subjectId: candidate.subjectId },
          async (tx) => {
            const record = await tx.activation(candidate.id);
            if (record?.status === "planned") {
              record.retryAt = new Date(
                Date.parse(this.now()) + 30_000,
              ).toISOString();
              await tx.putActivation(record);
            }
          },
        );
        failed.push({
          id: candidate.id,
          reason: "activation_preflight_unavailable",
        });
        continue;
      }
      queued += await this.store.transaction(
        { tenantId: p.tenantId, subjectId: candidate.subjectId },
        async (tx) => {
          const record = await tx.activation(candidate.id),
            head = await tx.head();
          if (!record || record.status !== "planned") return 0;
          scoped(record, candidate);
          if (
            !current ||
            !head ||
            head.revision !== record.scheduleRevision ||
            head.subjectRevision !== record.subjectRevision
          ) {
            record.status = "canceled";
            await tx.putActivation(record);
            return 0;
          }
          if (
            record.at > this.now() ||
            (record.retryAt && record.retryAt > this.now())
          )
            return 0;
          const prior = await tx.delivery(record.id),
            digest = await eventRecordDigestV1({
              roomId: record.roomId,
              action: record.action,
            });
          if (prior && prior.requestDigest !== digest)
            conflict("Scheduled delivery identity changed");
          if (!prior) {
            const now = this.now();
            await tx.putDelivery({
              tenantId: p.tenantId,
              subjectId: record.subjectId,
              id: record.id,
              roomId: record.roomId,
              subjectRevision: record.subjectRevision,
              scheduleRevision: record.scheduleRevision,
              key: record.key,
              action: record.action,
              actorId: record.actorId,
              requestDigest: digest,
              revision: 1,
              status: "pending",
              createdAt: now,
              availableAt: record.at,
              updatedAt: now,
            });
          }
          record.status = "queued";
          await tx.putActivation(record);
          return prior ? 0 : 1;
        },
      );
    }
    return { queued, failed };
  }
  async read(context: Context, id: string) {
    eventTokenV1(id);
    const p = await this.principal(context),
      r = await this.store.delivery(p.tenantId, id);
    if (!r) return undefined;
    if (r.tenantId !== p.tenantId || r.id !== id)
      throw new AgentPlatError("ADAPTER_ERROR", "Delivery identity changed");
    await this.allow(p, "read", [r.roomId], r);
    return r;
  }
  async list(
    context: Context,
    roomIds: string[],
    input: {
      status?: ScheduledDeliveryV1["status"];
      cursor?: string;
      limit?: number;
    } = {},
  ) {
    input = structuredClone(input);
    roomIds = [...roomIds].sort();
    const limit = input.limit ?? 50;
    integer(limit, 200);
    if (!limit) conflict();
    if (
      input.status &&
      !["pending", "delivering", "delivered", "uncertain", "canceled"].includes(
        input.status,
      )
    )
      throw new AgentPlatError("VALIDATION_ERROR", "Invalid notice status");
    const p = await this.principal(context);
    await this.allow(p, "read", roomIds);
    const page = await followupPageCursorV1(
      { tenantId: p.tenantId, roomIds, status: input.status ?? null },
      input.cursor,
      "id",
    );
    const rows = await this.store.list(p.tenantId, roomIds, {
      status: input.status,
      after: page.after as string | undefined,
      limit: limit + 1,
    });
    for (const row of rows) {
      if (row.tenantId !== p.tenantId || !roomIds.includes(row.roomId))
        throw new AgentPlatError(
          "ADAPTER_ERROR",
          "Notice query returned another scope",
        );
      await this.allow(p, "read", [row.roomId], row);
    }
    const items = rows.slice(0, limit);
    return {
      items,
      ...(rows.length > limit ? { cursor: page.encode(items.at(-1)!.id) } : {}),
    };
  }
  private async assertDelivery(
    p: ScheduledFollowupPrincipalV1,
    claim: ScheduledDeliveryV1,
  ) {
    await this.allow(p, "deliver", [claim.roomId], claim);
    if (!(await this.current(p, claim)))
      conflict("Subject, permission or destination changed before delivery");
    await this.store.transaction(
      { tenantId: p.tenantId, subjectId: claim.subjectId },
      async (tx) => {
        const r = await tx.delivery(claim.id),
          head = await tx.head();
        if (
          !r ||
          r.tenantId !== p.tenantId ||
          r.status !== "delivering" ||
          r.claim?.token !== claim.claim?.token ||
          r.claim?.actorId !== p.actorId ||
          r.claim.until <= this.now() ||
          (head && head.subjectRevision > r.subjectRevision) ||
          (r.scheduleRevision !== undefined &&
            head?.revision !== r.scheduleRevision)
        )
          conflict("Delivery claim or schedule changed");
      },
    );
  }
  async deliver(context: Context, id: string) {
    const p = await this.principal(context),
      candidate = await this.read(context, id);
    if (!candidate) return undefined;
    await this.allow(p, "deliver", [candidate.roomId], candidate);
    const valid = await this.current(p, candidate),
      native = { tenantId: p.tenantId, subjectId: candidate.subjectId };
    const claimed = await this.store.transaction(native, async (tx) => {
      const r = await tx.delivery(id),
        head = await tx.head();
      if (!r) return undefined;
      scoped(r, native);
      if (r.status === "delivering" && r.claim!.until <= this.now()) {
        r.status = "uncertain";
        r.revision++;
        r.updatedAt = this.now();
        await tx.putDelivery(r);
        return undefined;
      }
      if (r.status !== "pending" || r.availableAt > this.now())
        return undefined;
      if (
        !valid ||
        (head && head.subjectRevision > r.subjectRevision) ||
        (r.scheduleRevision !== undefined &&
          head?.revision !== r.scheduleRevision)
      ) {
        r.status = "canceled";
        r.revision++;
        r.updatedAt = this.now();
        await tx.putDelivery(r);
        return undefined;
      }
      const now = this.now();
      r.status = "delivering";
      r.revision++;
      r.updatedAt = now;
      r.claim = {
        token: this.options.id?.() ?? globalThis.crypto.randomUUID(),
        actorId: p.actorId,
        until: new Date(
          Date.parse(now) + (this.options.leaseMs ?? 60_000),
        ).toISOString(),
      };
      eventTokenV1(r.claim.token);
      await tx.putDelivery(r);
      return r;
    });
    if (!claimed) return this.read(context, id);
    let invoked = false;
    try {
      await this.assertDelivery(p, claimed);
      invoked = true;
      const output = await this.port.deliver(structuredClone(claimed), {
        idempotencyKey: claimed.id,
        assertCurrent: () => this.assertDelivery(p, claimed),
      });
      eventTokenV1(output.receiptReference);
      return await this.store.transaction(native, async (tx) => {
        const r = await tx.delivery(id);
        if (
          !r ||
          r.status !== "delivering" ||
          r.claim?.token !== claimed.claim?.token
        )
          conflict("Delivery acknowledgement lost its claim");
        r.status = "delivered";
        r.receiptReference = output.receiptReference;
        r.revision++;
        r.updatedAt = this.now();
        await tx.putDelivery(r);
        return r;
      });
    } catch (error) {
      await this.store.transaction(native, async (tx) => {
        const r = await tx.delivery(id);
        if (
          r?.status === "delivering" &&
          r.claim?.token === claimed.claim?.token
        ) {
          r.status = invoked ? "uncertain" : "pending";
          if (!invoked) {
            r.availableAt = new Date(
              Date.parse(this.now()) + 30_000,
            ).toISOString();
            delete r.claim;
          }
          r.revision++;
          r.updatedAt = this.now();
          await tx.putDelivery(r);
        }
      });
      throw error;
    }
  }
  async drain(context: Context, roomIds: string[], limit = 50) {
    roomIds = [...roomIds];
    integer(limit, 200);
    if (!limit) conflict();
    const p = await this.principal(context);
    await this.allow(p, "deliver", roomIds);
    const results: ScheduledDeliveryV1[] = [];
    const failed: { id: string; reason: string }[] = [];
    for (const r of await this.store.pending(
      p.tenantId,
      roomIds,
      this.now(),
      limit,
    )) {
      if (r.tenantId !== p.tenantId || !roomIds.includes(r.roomId))
        throw new AgentPlatError(
          "ADAPTER_ERROR",
          "Delivery query returned another scope",
        );
      try {
        const result = await this.deliver(context, r.id);
        if (result) results.push(result);
      } catch {
        await this.store.transaction(
          { tenantId: p.tenantId, subjectId: r.subjectId },
          async (tx) => {
            const current = await tx.delivery(r.id);
            if (current?.status === "pending") {
              current.availableAt = new Date(
                Date.parse(this.now()) + 30_000,
              ).toISOString();
              current.revision++;
              current.updatedAt = this.now();
              await tx.putDelivery(current);
            }
          },
        );
        failed.push({ id: r.id, reason: "delivery_not_confirmed" });
      }
    }
    return { items: results, failed };
  }
  async reconcile(
    context: Context,
    id: string,
    request: {
      operationId: string;
      expectedRevision: number;
      proofRefs: string[];
      outcome:
        | { kind: "delivered"; receiptReference: string }
        | { kind: "not_sent"; retryAfterMs?: number };
    },
  ) {
    const input = structuredClone(request);
    eventTokenV1(input.operationId);
    integer(input.expectedRevision);
    boundedEventJsonV1(input);
    if (
      !Array.isArray(input.proofRefs) ||
      !input.proofRefs.length ||
      input.proofRefs.length > 32
    )
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Verified delivery proof is required",
      );
    input.proofRefs.forEach(eventTokenV1);
    if (!["delivered", "not_sent"].includes(input.outcome.kind)) conflict();
    if (input.outcome.kind === "delivered")
      eventTokenV1(input.outcome.receiptReference);
    else integer(input.outcome.retryAfterMs ?? 30_000, 86_400_000);
    const p = await this.principal(context),
      r = await this.read(context, id);
    if (!r) conflict();
    await this.allow(p, "reconcile", [r.roomId], r);
    const native = { tenantId: p.tenantId, subjectId: r.subjectId },
      digest = await eventRecordDigestV1({ id, actorId: p.actorId, input });
    return this.store.transaction(native, async (tx) => {
      const replay = await tx.operation(`reconcile:${input.operationId}`);
      if (replay) {
        if (replay.digest !== digest) conflict();
        return replay.value as ScheduledDeliveryV1;
      }
      const current = await tx.delivery(id);
      if (
        !current ||
        current.revision !== input.expectedRevision ||
        !(
          current.status === "uncertain" ||
          (current.status === "delivering" &&
            current.claim!.until <= this.now())
        )
      )
        conflict("Only uncertain deliveries can be reconciled");
      current.status =
        input.outcome.kind === "delivered" ? "delivered" : "pending";
      current.proofRefs = input.proofRefs;
      current.revision++;
      current.updatedAt = this.now();
      if (input.outcome.kind === "delivered")
        current.receiptReference = input.outcome.receiptReference;
      else {
        current.availableAt = new Date(
          Date.parse(this.now()) + (input.outcome.retryAfterMs ?? 30_000),
        ).toISOString();
        delete current.claim;
      }
      await tx.putDelivery(current);
      await tx.putOperation(`reconcile:${input.operationId}`, {
        digest,
        value: current,
      });
      return current;
    });
  }
}

/** Feed date activations into the existing Planner inbox; this callback performs no inference. */
export function scheduledPlannerEventV1(
  record: ScheduledDeliveryV1,
): RoomPlannerEvent {
  if (record.action.kind !== "planner")
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Expected a Planner activation",
    );
  const event = record.action.event;
  return {
    id: record.id,
    kind: "timer",
    actorId: record.actorId,
    content: event.content,
    ...conversationReference(event),
    ...(event.objectiveId ? { objectiveId: event.objectiveId } : {}),
    references: [...event.references],
    provenance: {
      source: "agentplat.scheduled-followup",
      eventId: record.id,
      occurredAt: record.createdAt,
    },
  };
}
/** A durable enqueue acknowledgement is distinct from the delivery adapter's final receipt. */
export function createRoomPlannerNoticeDeliveryV1<Context>(options: {
  service: ScheduledFollowupServiceV1<Context>;
  context(scope: RoomPlannerScope): Promise<Context>;
  prepare(
    scope: RoomPlannerScope,
    note: RoomPlannerState["notifications"][number],
  ): Promise<
    | {
        subjectId: string;
        subjectRevision: number;
        key: string;
        notice: PreparedNoticeV1;
      }
    | undefined
  >;
}) {
  return async (
    scope: RoomPlannerScope,
    note: RoomPlannerState["notifications"][number],
  ) => {
    const prepared = await options.prepare(scope, structuredClone(note));
    if (!prepared) return;
    const receipt = await options.service.enqueue(
      await options.context(scope),
      { ...prepared, roomId: scope.roomId },
      scope.tenantId,
    );
    if (receipt.tenantId !== scope.tenantId)
      throw new AgentPlatError(
        "FORBIDDEN",
        "Planner and notification tenant differ",
      );
  };
}
