import { AgentPlatError } from "@agentplat/core";
import type { JsonValue, TenantContext } from "@agentplat/core";
import {
  boundedEventJsonV1,
  canonicalEventJsonV1,
  compareEventTokensV1,
  eventRecordDigestV1,
  eventTimestampV1,
  eventTokenV1,
} from "@agentplat/events";
import type {
  MemoryAudienceV1,
  MemoryRevisionServiceV1,
  MemorySubjectV1,
} from "./memory-revisions.js";
import { validateMemoryRevisionV1 } from "./memory-revisions.js";
import {
  checkedFollowupRecordV1,
  followupPageCursorV1,
  InMemoryFollowupRevisionStoreV1,
  type FollowupRevisionV1,
  type FollowupRevisionStoreV1,
} from "./followup-records.js";

export interface MemoryProposalInputV1 {
  id: string;
  operationId: string;
  memoryId: string;
  expectedMemoryRevision: number | null;
  subject: MemorySubjectV1;
  audience: MemoryAudienceV1;
  content: JsonValue;
  evidenceRefs: string[];
  reason: string;
}
export interface MemoryProposalV1 extends FollowupRevisionV1 {
  memoryId: string;
  expectedMemoryRevision: number | null;
  subject: MemorySubjectV1;
  audience: MemoryAudienceV1;
  content: JsonValue;
  evidenceRefs: string[];
  reason: string;
  proposedBy: string;
  proposedAt: string;
  status: "pending" | "accepting" | "accepted" | "rejected" | "conflicted";
  decision?: {
    operationId: string;
    requestDigest: string;
    actorId: string;
    startedAt: string;
    reference: string;
    kind: "accept" | "reject";
  };
  acceptedMemory?: { memoryId: string; revision: number; digest: string };
}
export interface MemoryProposalStoreV1 extends FollowupRevisionStoreV1<MemoryProposalV1> {
  list(
    tenantId: string,
    subject: MemorySubjectV1,
    afterId: string | undefined,
    limit: number,
  ): Promise<MemoryProposalV1[]>;
}
export interface MemoryProposalAccessV1<Context> {
  authenticate(context: Context): Promise<TenantContext | null>;
  authorize(
    principal: TenantContext,
    request: {
      operation: "propose" | "read" | "history" | "accept" | "reject" | "list";
      proposal?: MemoryProposalV1;
      subject?: MemorySubjectV1;
    },
  ): Promise<boolean>;
}
export interface MemoryProposalDecisionV1 {
  id: string;
  operationId: string;
  expectedRevision: number;
  reference: string;
}
function conflict(): never {
  throw new AgentPlatError("CONFLICT", "Memory proposal or decision changed");
}
function same(a: unknown, b: unknown) {
  return canonicalEventJsonV1(a) === canonicalEventJsonV1(b);
}
function revision(value: number | null) {
  if (value !== null && (!Number.isSafeInteger(value) || value < 1))
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Invalid expected memory revision",
    );
}
async function decisionOperation(
  id: string,
  operationId: string,
  step: string,
) {
  return `memory-proposal:${await eventRecordDigestV1([id, operationId, step])}`;
}
export function validateMemoryProposalV1(record: MemoryProposalV1): void {
  boundedEventJsonV1(record.content);
  eventTokenV1(record.memoryId);
  eventTokenV1(record.subject?.type);
  eventTokenV1(record.subject?.id);
  eventTokenV1(record.proposedBy);
  revision(record.expectedMemoryRevision);
  eventTimestampV1(record.proposedAt);
  if (
    !record.audience ||
    (record.audience.kind !== "personal" && record.audience.kind !== "shared")
  )
    throw new AgentPlatError("VALIDATION_ERROR", "Invalid proposal audience");
  if (record.audience.kind === "personal")
    eventTokenV1(record.audience.subjectId);
  else {
    if (!["workspace", "organization"].includes(record.audience.scopeType))
      throw new AgentPlatError("VALIDATION_ERROR", "Invalid shared scope");
    eventTokenV1(record.audience.scopeId);
  }
  if (
    !Array.isArray(record.evidenceRefs) ||
    !record.evidenceRefs.length ||
    record.evidenceRefs.length > 128 ||
    typeof record.reason !== "string" ||
    !record.reason.trim() ||
    record.reason.length > 8000
  )
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "A proposal requires evidence and a reason",
    );
  record.evidenceRefs.forEach(eventTokenV1);
  if (
    !["pending", "accepting", "accepted", "rejected", "conflicted"].includes(
      record.status,
    )
  )
    throw new AgentPlatError("VALIDATION_ERROR", "Invalid proposal state");
  if (record.status === "pending" && (record.decision || record.acceptedMemory))
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Pending proposals cannot carry approval",
    );
  if (record.status !== "pending" && !record.decision)
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Proposal decision is missing",
    );
  if (record.status === "accepted" && !record.acceptedMemory)
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Accepted proposal needs a memory receipt",
    );
  if (record.status !== "accepted" && record.acceptedMemory)
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Only accepted proposals may name an applied memory revision",
    );
  boundedEventJsonV1(record, 131_072);
}
export function memoryProposalFollowsV1(
  next: MemoryProposalV1,
  previous: MemoryProposalV1 | undefined,
): boolean {
  validateMemoryProposalV1(next);
  if (!previous) return next.status === "pending";
  for (const key of [
    "memoryId",
    "expectedMemoryRevision",
    "subject",
    "audience",
    "content",
    "evidenceRefs",
    "reason",
    "proposedBy",
    "proposedAt",
  ] as const)
    if (!same(next[key], previous[key])) return false;
  if (previous.decision && !same(next.decision, previous.decision))
    return false;
  return previous.status === "pending"
    ? ["accepting", "rejected"].includes(next.status)
    : previous.status === "accepting"
      ? ["accepted", "conflicted"].includes(next.status)
      : false;
}
export class InMemoryMemoryProposalStoreV1
  extends InMemoryFollowupRevisionStoreV1<MemoryProposalV1>
  implements MemoryProposalStoreV1
{
  override async commit(record: MemoryProposalV1, expected: number | null) {
    if (
      !memoryProposalFollowsV1(
        record,
        await this.head(record.tenantId, record.id),
      )
    )
      return false;
    return super.commit(record, expected);
  }
  async list(
    tenantId: string,
    subject: MemorySubjectV1,
    afterId: string | undefined,
    limit: number,
  ) {
    return structuredClone(
      [...this.records.values()]
        .map((rows) => rows.at(-1)!)
        .filter(
          (r) =>
            r.tenantId === tenantId &&
            same(r.subject, subject) &&
            (!afterId || compareEventTokensV1(r.id, afterId) > 0),
        )
        .sort((a, b) => compareEventTokensV1(a.id, b.id))
        .slice(0, limit),
    );
  }
}

/** Inference proposes; a separately authenticated human accepts into the existing memory ledger. */
export class MemoryProposalServiceV1<Context> {
  constructor(
    private readonly store: MemoryProposalStoreV1,
    private readonly memory: Pick<
      MemoryRevisionServiceV1<Context>,
      "append" | "read"
    >,
    private readonly access: MemoryProposalAccessV1<Context>,
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
    if (record) validateMemoryProposalV1(record);
    return record;
  }
  private async operation(tenantId: string, id: string, operationId: string) {
    const record = checkedFollowupRecordV1(
      await this.store.operation(tenantId, id, operationId),
      tenantId,
      id,
    );
    if (record) {
      validateMemoryProposalV1(record);
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
        "Proposal authentication required",
      );
    eventTokenV1(p.tenantId);
    eventTokenV1(p.actor.actorId);
    return structuredClone(p);
  }
  private async allow(
    p: TenantContext,
    operation: "propose" | "read" | "history" | "accept" | "reject" | "list",
    proposal?: MemoryProposalV1,
    subject?: MemorySubjectV1,
  ) {
    if (
      proposal &&
      ["read", "history"].includes(operation) &&
      proposal.audience.kind === "personal" &&
      proposal.audience.subjectId !== p.actor?.actorId &&
      proposal.proposedBy !== p.actor?.actorId
    )
      throw new AgentPlatError(
        "FORBIDDEN",
        "Personal proposal belongs to another owner",
      );
    if (
      !(await this.access.authorize(structuredClone(p), {
        operation,
        ...(proposal ? { proposal: structuredClone(proposal) } : {}),
        ...(subject ? { subject: structuredClone(subject) } : {}),
      }))
    )
      throw new AgentPlatError("FORBIDDEN", "Memory proposal access denied");
  }
  async propose(context: Context, request: MemoryProposalInputV1) {
    const input = structuredClone(request);
    eventTokenV1(input.id);
    eventTokenV1(input.operationId);
    boundedEventJsonV1(input);
    const p = await this.principal(context),
      now = this.now();
    const record: MemoryProposalV1 = {
      ...input,
      schemaVersion: 1,
      tenantId: p.tenantId,
      revision: 1,
      actorId: p.actor!.actorId!,
      requestDigest: await eventRecordDigestV1({
        tenantId: p.tenantId,
        actorId: p.actor!.actorId,
        input,
      }),
      recordedAt: now,
      proposedBy: p.actor!.actorId!,
      proposedAt: now,
      status: "pending",
    };
    validateMemoryProposalV1(record);
    await this.allow(p, "propose", record);
    const prior = await this.head(p.tenantId, input.id);
    if (prior) {
      const original = await this.operation(
        p.tenantId,
        input.id,
        input.operationId,
      );
      if (!original || original.requestDigest !== record.requestDigest)
        conflict();
      await this.allow(p, "read", prior);
      return prior;
    }
    await this.allow(p, "propose", record);
    if (!(await this.store.commit(record, null))) {
      const original = await this.operation(
          p.tenantId,
          input.id,
          input.operationId,
        ),
        raced = await this.head(p.tenantId, input.id);
      if (original?.requestDigest === record.requestDigest && raced) {
        await this.allow(p, "read", raced);
        return raced;
      }
      conflict();
    }
    return record;
  }
  async read(context: Context, id: string) {
    eventTokenV1(id);
    const p = await this.principal(context),
      record = await this.head(p.tenantId, id);
    if (!record) return undefined;
    await this.allow(p, "read", record);
    return record;
  }
  private assertHumanDecision(p: TenantContext, proposal: MemoryProposalV1) {
    if (
      p.actor?.actorType !== "human" ||
      (proposal.audience.kind === "personal" &&
        proposal.audience.subjectId !== p.actor.actorId)
    )
      throw new AgentPlatError(
        "FORBIDDEN",
        "A separately authenticated owner must decide personal learning",
      );
  }
  async accept(
    context: Context,
    request: MemoryProposalDecisionV1,
  ): Promise<MemoryProposalV1> {
    const input = structuredClone(request);
    eventTokenV1(input.id);
    eventTokenV1(input.operationId);
    eventTokenV1(input.reference);
    revision(input.expectedRevision);
    const p = await this.principal(context);
    let current = await this.head(p.tenantId, input.id);
    if (!current)
      throw new AgentPlatError("NOT_FOUND", "Memory proposal not found");
    this.assertHumanDecision(p, current);
    await this.allow(p, "accept", current);
    const digest = await eventRecordDigestV1({
      tenantId: p.tenantId,
      actorId: p.actor!.actorId,
      input,
      kind: "accept",
    });
    if (current.decision) {
      if (
        current.decision.requestDigest !== digest ||
        current.decision.actorId !== p.actor!.actorId
      )
        conflict();
      if (["accepted", "conflicted"].includes(current.status)) return current;
      if (current.status !== "accepting") conflict();
    } else {
      if (
        current.status !== "pending" ||
        current.revision !== input.expectedRevision
      )
        conflict();
      const next: MemoryProposalV1 = {
        ...current,
        revision: current.revision + 1,
        operationId: await decisionOperation(
          input.id,
          input.operationId,
          "start",
        ),
        actorId: p.actor!.actorId!,
        requestDigest: digest,
        recordedAt: this.now(),
        status: "accepting",
        decision: {
          operationId: input.operationId,
          requestDigest: digest,
          actorId: p.actor!.actorId!,
          startedAt: this.now(),
          reference: input.reference,
          kind: "accept",
        },
      };
      await this.allow(p, "accept", next);
      if (!(await this.store.commit(next, current.revision))) {
        const raced = await this.head(p.tenantId, input.id);
        if (!raced?.decision || raced.decision.requestDigest !== digest)
          conflict();
        current = raced;
      } else current = next;
      if (current.status === "accepted" || current.status === "conflicted")
        return current;
    }
    // This write is internal and idempotent, not a repeat of model inference.
    const memoryOperation = await decisionOperation(
      current.id,
      current.decision!.operationId,
      "memory",
    );
    const expectedEvidenceRefs = [
      ...new Set([
        ...current.evidenceRefs,
        current.decision!.reference,
        `proposal:${await eventRecordDigestV1({ tenantId: p.tenantId, id: current.id })}`,
      ]),
    ];
    let applied;
    try {
      await this.allow(p, "accept", current);
      applied = await this.memory.append(context, {
        memoryId: current.memoryId,
        operationId: memoryOperation,
        expectedRevision: current.expectedMemoryRevision,
        subject: current.subject,
        audience: current.audience,
        content: current.content,
        evidenceRefs: expectedEvidenceRefs,
        observedAt: current.proposedAt,
        validFrom: current.decision!.startedAt,
        status: "active",
        reason: current.reason,
      });
    } catch (error) {
      // A different immutable revision proves this acceptance cannot later win that slot.
      if (error instanceof AgentPlatError && error.code === "CONFLICT") {
        const slot = await this.memory.read(
          context,
          current.memoryId,
          (current.expectedMemoryRevision ?? 0) + 1,
        );
        if (slot && slot.operationId !== memoryOperation) {
          const conflicted: MemoryProposalV1 = {
            ...current,
            revision: current.revision + 1,
            operationId: await decisionOperation(
              current.id,
              input.operationId,
              "conflict",
            ),
            requestDigest: digest,
            recordedAt: this.now(),
            status: "conflicted",
          };
          if (!(await this.store.commit(conflicted, current.revision))) {
            const raced = await this.head(p.tenantId, current.id);
            if (
              raced?.status === "conflicted" &&
              raced.decision?.requestDigest === digest
            )
              return raced;
            conflict();
          }
          return conflicted;
        }
      }
      throw error;
    }
    const accepted: MemoryProposalV1 = {
      ...current,
      revision: current.revision + 1,
      operationId: await decisionOperation(
        current.id,
        input.operationId,
        "finish",
      ),
      requestDigest: digest,
      recordedAt: this.now(),
      status: "accepted",
      acceptedMemory: {
        memoryId: applied.memoryId,
        revision: applied.revision,
        digest: applied.digest,
      },
    };
    await validateMemoryRevisionV1(applied);
    if (
      applied.tenantId !== p.tenantId ||
      applied.memoryId !== current.memoryId ||
      applied.operationId !== memoryOperation ||
      applied.revision !== (current.expectedMemoryRevision ?? 0) + 1 ||
      applied.actorId !== current.decision!.actorId ||
      !same(applied.subject, current.subject) ||
      !same(applied.audience, current.audience) ||
      !same(applied.content, current.content) ||
      !same(applied.evidenceRefs, expectedEvidenceRefs) ||
      applied.observedAt !== current.proposedAt ||
      applied.validFrom !== current.decision!.startedAt ||
      applied.reason !== current.reason ||
      applied.validUntil !== undefined ||
      applied.retainUntil !== undefined ||
      applied.status !== "active"
    )
      throw new AgentPlatError(
        "ADAPTER_ERROR",
        "Memory receipt does not bind the accepted proposal",
      );
    await this.allow(p, "accept", accepted);
    if (!(await this.store.commit(accepted, current.revision))) {
      const raced = await this.head(p.tenantId, current.id);
      if (
        raced?.status === "accepted" &&
        raced.decision?.requestDigest === digest &&
        raced.acceptedMemory?.digest === applied.digest
      )
        return raced;
      conflict();
    }
    return accepted;
  }
  async reject(context: Context, request: MemoryProposalDecisionV1) {
    const input = structuredClone(request);
    eventTokenV1(input.id);
    eventTokenV1(input.operationId);
    eventTokenV1(input.reference);
    revision(input.expectedRevision);
    const p = await this.principal(context),
      current = await this.head(p.tenantId, input.id);
    if (!current)
      throw new AgentPlatError("NOT_FOUND", "Memory proposal not found");
    this.assertHumanDecision(p, current);
    await this.allow(p, "reject", current);
    const digest = await eventRecordDigestV1({
      tenantId: p.tenantId,
      actorId: p.actor!.actorId,
      input,
      kind: "reject",
    });
    if (current.decision) {
      if (
        current.status === "rejected" &&
        current.decision.requestDigest === digest
      )
        return current;
      conflict();
    }
    if (
      current.status !== "pending" ||
      current.revision !== input.expectedRevision
    )
      conflict();
    const rejected: MemoryProposalV1 = {
      ...current,
      revision: current.revision + 1,
      operationId: await decisionOperation(
        current.id,
        input.operationId,
        "reject",
      ),
      actorId: p.actor!.actorId!,
      requestDigest: digest,
      recordedAt: this.now(),
      status: "rejected",
      decision: {
        operationId: input.operationId,
        requestDigest: digest,
        actorId: p.actor!.actorId!,
        startedAt: this.now(),
        reference: input.reference,
        kind: "reject",
      },
    };
    if (!(await this.store.commit(rejected, current.revision))) {
      const raced = await this.head(p.tenantId, current.id);
      if (
        raced?.status === "rejected" &&
        raced.decision?.requestDigest === digest
      )
        return raced;
      conflict();
    }
    return rejected;
  }
  async list(
    context: Context,
    subject: MemorySubjectV1,
    input: { cursor?: string; limit?: number } = {},
  ) {
    input = structuredClone(input);
    const limit = input.limit ?? 50;
    subject = structuredClone(subject);
    eventTokenV1(subject.type);
    eventTokenV1(subject.id);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)
      throw new AgentPlatError("VALIDATION_ERROR", "Invalid proposal page");
    const p = await this.principal(context);
    await this.allow(p, "list", undefined, subject);
    const page = await followupPageCursorV1(
      { tenantId: p.tenantId, subject, kind: "memory-proposals" },
      input.cursor,
      "id",
    );
    const rows = await this.store.list(
      p.tenantId,
      subject,
      page.after as string | undefined,
      limit + 1,
    );
    for (const proposal of rows) await this.allow(p, "read", proposal);
    const proposals = rows.slice(0, limit);
    return {
      proposals,
      nextCursor: page.encode(proposals.at(-1)?.id),
      hasMore: rows.length > limit,
    };
  }
  async history(context: Context, id: string, afterRevision = 0, limit = 50) {
    eventTokenV1(id);
    if (
      !Number.isSafeInteger(afterRevision) ||
      afterRevision < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 200
    )
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Invalid proposal history page",
      );
    const p = await this.principal(context),
      head = await this.head(p.tenantId, id);
    if (!head) return [];
    await this.allow(p, "history", head);
    const rows = await this.store.history(p.tenantId, id, afterRevision, limit);
    for (const row of rows) await this.allow(p, "history", row);
    return rows;
  }
}
