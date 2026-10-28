import { AgentPlatError } from "@agentplat/core";
import {
  boundedEventJsonV1,
  eventRecordDigestV1,
  eventTimestampV1,
  eventTokenV1,
} from "@agentplat/events";

/** Shared journal envelope; domain services own the situation/proposal semantics. */
export interface FollowupRevisionV1 {
  schemaVersion: 1;
  tenantId: string;
  id: string;
  revision: number;
  operationId: string;
  actorId: string;
  requestDigest: string;
  recordedAt: string;
}
export interface FollowupRevisionStoreV1<Record extends FollowupRevisionV1> {
  head(tenantId: string, id: string): Promise<Record | undefined>;
  operation(
    tenantId: string,
    id: string,
    operationId: string,
  ): Promise<Record | undefined>;
  history(
    tenantId: string,
    id: string,
    afterRevision: number,
    limit: number,
  ): Promise<Record[]>;
  commit(record: Record, expectedRevision: number | null): Promise<boolean>;
}
export function validateFollowupRevisionV1(record: FollowupRevisionV1): void {
  if (record.schemaVersion !== 1)
    throw new AgentPlatError(
      "VALIDATION_ERROR",
      "Invalid follow-up schema version",
    );
  [
    record.tenantId,
    record.id,
    record.operationId,
    record.actorId,
    record.requestDigest,
  ].forEach(eventTokenV1);
  eventTimestampV1(record.recordedAt);
  if (!Number.isSafeInteger(record.revision) || record.revision < 1)
    throw new AgentPlatError("VALIDATION_ERROR", "Invalid follow-up revision");
  boundedEventJsonV1(record, 131_072);
}
export function checkedFollowupRecordV1<Record extends FollowupRevisionV1>(
  record: Record | undefined,
  tenantId: string,
  id: string,
): Record | undefined {
  if (record) {
    validateFollowupRevisionV1(record);
    if (record.tenantId !== tenantId || record.id !== id)
      throw new AgentPlatError(
        "ADAPTER_ERROR",
        "Follow-up adapter returned another scope or identity",
      );
  }
  return record;
}
export function followupRevisionFollowsV1(
  record: FollowupRevisionV1,
  previous: FollowupRevisionV1 | undefined,
  expected: number | null,
): boolean {
  validateFollowupRevisionV1(record);
  return (
    (previous?.revision ?? null) === expected &&
    record.revision === (expected ?? 0) + 1 &&
    (!previous ||
      (record.tenantId === previous.tenantId &&
        record.id === previous.id &&
        record.recordedAt >= previous.recordedAt))
  );
}
export async function followupPageCursorV1(
  binding: unknown,
  cursor: string | undefined,
  kind: "id" | "sequence",
) {
  const digest = await eventRecordDigestV1(binding);
  let after: string | number | undefined;
  if (cursor !== undefined)
    try {
      if (typeof cursor !== "string" || cursor.length > 8192) throw Error();
      const decoded = JSON.parse(decodeURIComponent(cursor));
      if (
        decoded.version !== 1 ||
        decoded.binding !== digest ||
        decoded.kind !== kind
      )
        throw Error();
      if (kind === "id") eventTokenV1(decoded.after);
      else if (!Number.isSafeInteger(decoded.after) || decoded.after < 0)
        throw Error();
      after = decoded.after;
    } catch {
      throw new AgentPlatError(
        "VALIDATION_ERROR",
        "Follow-up cursor does not match this authorized query",
      );
    }
  return {
    after,
    encode: (next: string | number | undefined) =>
      next === undefined
        ? cursor
        : encodeURIComponent(
            JSON.stringify({ version: 1, binding: digest, kind, after: next }),
          ),
  };
}
/** Internal storage reuse: no model, permissions or domain transitions live here. */
export class InMemoryFollowupRevisionStoreV1<
  Record extends FollowupRevisionV1,
> implements FollowupRevisionStoreV1<Record> {
  protected readonly records = new Map<string, Record[]>();
  protected key(tenantId: string, id: string) {
    return JSON.stringify([tenantId, id]);
  }
  async head(tenantId: string, id: string) {
    return structuredClone(this.records.get(this.key(tenantId, id))?.at(-1));
  }
  async operation(tenantId: string, id: string, operationId: string) {
    return structuredClone(
      this.records
        .get(this.key(tenantId, id))
        ?.find((r) => r.operationId === operationId),
    );
  }
  async history(tenantId: string, id: string, after: number, limit: number) {
    return structuredClone(
      (this.records.get(this.key(tenantId, id)) ?? [])
        .filter((r) => r.revision > after)
        .slice(0, limit),
    );
  }
  async commit(input: Record, expected: number | null) {
    const record = structuredClone(input),
      key = this.key(record.tenantId, record.id),
      rows = this.records.get(key) ?? [];
    if (
      !followupRevisionFollowsV1(record, rows.at(-1), expected) ||
      rows.some((r) => r.operationId === record.operationId)
    )
      return false;
    this.records.set(key, [...rows, record]);
    return true;
  }
}
