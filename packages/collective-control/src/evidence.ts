import type {
  CollectiveDecisionRecordV1,
  CollectiveDigestV1,
} from "./contracts.js";
import {
  assertCollectiveIdentifier,
  assertCollectiveSafeInteger,
  collectiveDecisionRecordDigestV1,
  validateCollectiveDecisionRecordV1,
} from "./validation.js";

export interface CollectiveEvidenceAnchorV1 {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly recordCount: number;
  readonly latestRecordDigest: CollectiveDigestV1 | null;
}

export interface CollectiveEvidenceAppendResultV1 {
  readonly accepted: boolean;
  readonly durable: boolean;
  readonly code:
    "appended" | "duplicate" | "chain_conflict" | "capacity_exceeded";
  readonly anchor: CollectiveEvidenceAnchorV1;
}

export interface CollectiveEvidenceSinkV1 {
  append(
    record: CollectiveDecisionRecordV1,
  ):
    | CollectiveEvidenceAppendResultV1
    | Promise<CollectiveEvidenceAppendResultV1>;
  anchor(): CollectiveEvidenceAnchorV1 | Promise<CollectiveEvidenceAnchorV1>;
}

export function createCollectiveDecisionRecordV1(
  body: Omit<CollectiveDecisionRecordV1, "recordDigest">,
): CollectiveDecisionRecordV1 {
  return validateCollectiveDecisionRecordV1({
    ...body,
    recordDigest: collectiveDecisionRecordDigestV1(body),
  });
}

/** Bounded, hash-linked reference sink containing redacted digests only. */
export class MemoryCollectiveEvidenceSinkV1 implements CollectiveEvidenceSinkV1 {
  private readonly records: CollectiveDecisionRecordV1[] = [];
  private readonly recordIds = new Map<string, CollectiveDecisionRecordV1>();

  constructor(
    readonly tenantId: string,
    readonly policyDomainId: string,
    readonly maximumRecords = 262_144,
  ) {
    assertCollectiveIdentifier(tenantId, "tenantId");
    assertCollectiveIdentifier(policyDomainId, "policyDomainId");
    assertCollectiveSafeInteger(maximumRecords, "maximumRecords", 1);
    if (maximumRecords > 1_000_000)
      throw new TypeError("maximumRecords is too large");
  }

  append(record: CollectiveDecisionRecordV1): CollectiveEvidenceAppendResultV1 {
    const value = validateCollectiveDecisionRecordV1(record);
    const current = this.anchor();
    if (
      value.tenantId !== this.tenantId ||
      value.policyDomainId !== this.policyDomainId
    )
      return result(false, false, "chain_conflict", current);
    const previous = this.recordIds.get(value.recordId);
    if (previous)
      return previous.recordDigest === value.recordDigest
        ? result(true, true, "duplicate", current)
        : result(false, false, "chain_conflict", current);
    if (this.records.length >= this.maximumRecords)
      return result(false, false, "capacity_exceeded", current);
    if (value.previousRecordDigest !== current.latestRecordDigest)
      return result(false, false, "chain_conflict", current);
    this.records.push(value);
    this.recordIds.set(value.recordId, value);
    return result(true, true, "appended", this.anchor());
  }

  anchor(): CollectiveEvidenceAnchorV1 {
    return Object.freeze({
      schemaVersion: 1,
      tenantId: this.tenantId,
      policyDomainId: this.policyDomainId,
      recordCount: this.records.length,
      latestRecordDigest:
        this.records.length === 0
          ? null
          : this.records[this.records.length - 1]!.recordDigest,
    });
  }

  snapshot(): readonly CollectiveDecisionRecordV1[] {
    return Object.freeze([...this.records]);
  }
}

function result(
  accepted: boolean,
  durable: boolean,
  code: CollectiveEvidenceAppendResultV1["code"],
  anchor: CollectiveEvidenceAnchorV1,
): CollectiveEvidenceAppendResultV1 {
  return Object.freeze({ accepted, durable, code, anchor });
}
