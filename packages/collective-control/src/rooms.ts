import type { JsonValue } from "@agentplat/core";

import { deepFreezeCollective, digestCollectiveJsonV1 } from "./canonical.js";
import type {
  CollectiveDecisionRecordV1,
  CollectiveDigestV1,
  DelegationMandateStatementV1,
  MandateRoomProvenanceV1,
} from "./contracts.js";
import {
  assertCollectiveDigest,
  assertCollectiveExactKeys,
  assertCollectiveIdentifier,
  assertCollectiveTimestamp,
  validateCollectiveDecisionRecordV1,
  validateDelegationMandateStatementV1,
} from "./validation.js";

export type { MandateRoomProvenanceV1 } from "./contracts.js";

/** Contextual Room decision. It is evidence, never installed authority. */
export interface RoomDecisionReferenceV1 extends MandateRoomProvenanceV1 {
  readonly decidedAt: string;
  readonly decidedBy: string;
}

/** Unsigned, inert input for an application-owned mandate issuer. */
export interface DelegationMandateProposalV1 {
  readonly schemaVersion: 1;
  readonly proposalId: string;
  readonly roomDecision: RoomDecisionReferenceV1;
  readonly statement: DelegationMandateStatementV1;
  readonly proposalDigest: CollectiveDigestV1;
}

export interface CollectiveRoomEvidenceV1 {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly roomId: string;
  readonly recordId: string;
  readonly recordDigest: CollectiveDigestV1;
  readonly previousRecordDigest: CollectiveDigestV1 | null;
  readonly decisionKind: CollectiveDecisionRecordV1["kind"];
  readonly reasonCode: string;
  readonly logicalTimeMs: number;
}

export function createDelegationMandateProposalV1(input: {
  readonly proposalId: string;
  readonly roomDecision: RoomDecisionReferenceV1;
  readonly statement: DelegationMandateStatementV1;
}): DelegationMandateProposalV1 {
  assertCollectiveIdentifier(input.proposalId, "proposalId");
  const roomDecision = validateRoomDecisionReferenceV1(input.roomDecision);
  const statement = validateDelegationMandateStatementV1(input.statement);
  if (
    statement.roomProvenance === null ||
    statement.roomProvenance.roomId !== roomDecision.roomId ||
    statement.roomProvenance.approvalId !== roomDecision.approvalId ||
    statement.roomProvenance.targetType !== roomDecision.targetType ||
    statement.roomProvenance.targetId !== roomDecision.targetId ||
    statement.roomProvenance.targetVersion !== roomDecision.targetVersion
  )
    throw new TypeError("Room decision and mandate provenance do not match");
  const body = {
    schemaVersion: 1 as const,
    proposalId: input.proposalId,
    roomDecision,
    statement,
  };
  return deepFreezeCollective({
    ...body,
    proposalDigest: digestCollectiveJsonV1(
      "room-proposal",
      body as unknown as JsonValue,
    ),
  });
}

export function validateDelegationMandateProposalV1(
  value: unknown,
): DelegationMandateProposalV1 {
  assertCollectiveExactKeys(
    value,
    [
      "schemaVersion",
      "proposalId",
      "roomDecision",
      "statement",
      "proposalDigest",
    ],
    "Room mandate proposal",
  );
  if (value.schemaVersion !== 1)
    throw new TypeError("Room mandate proposal schema is invalid");
  assertCollectiveIdentifier(value.proposalId, "proposalId");
  assertCollectiveDigest(value.proposalDigest, "proposalDigest");
  const proposal = createDelegationMandateProposalV1({
    proposalId: value.proposalId,
    roomDecision: value.roomDecision as unknown as RoomDecisionReferenceV1,
    statement: value.statement as unknown as DelegationMandateStatementV1,
  });
  if (proposal.proposalDigest !== value.proposalDigest)
    throw new TypeError("Room mandate proposal digest is invalid");
  return proposal;
}

export function projectCollectiveDecisionToRoomEvidenceV1(input: {
  readonly roomId: string;
  readonly record: CollectiveDecisionRecordV1;
}): CollectiveRoomEvidenceV1 {
  assertCollectiveIdentifier(input.roomId, "roomId");
  const record = validateCollectiveDecisionRecordV1(input.record);
  return deepFreezeCollective({
    schemaVersion: 1 as const,
    tenantId: record.tenantId,
    policyDomainId: record.policyDomainId,
    roomId: input.roomId,
    recordId: record.recordId,
    recordDigest: record.recordDigest,
    previousRecordDigest: record.previousRecordDigest,
    decisionKind: record.kind,
    reasonCode: record.reasonCode,
    logicalTimeMs: record.logicalTimeMs,
  });
}

function validateRoomDecisionReferenceV1(
  value: unknown,
): RoomDecisionReferenceV1 {
  assertCollectiveExactKeys(
    value,
    [
      "schemaVersion",
      "roomId",
      "approvalId",
      "targetType",
      "targetId",
      "targetVersion",
      "decidedAt",
      "decidedBy",
    ],
    "Room decision reference",
  );
  if (value.schemaVersion !== 1)
    throw new TypeError("Room decision reference schema is invalid");
  assertCollectiveIdentifier(value.roomId, "roomId");
  assertCollectiveIdentifier(value.approvalId, "approvalId");
  if (
    !["room", "task", "artifact", "action"].includes(String(value.targetType))
  )
    throw new TypeError("Room decision target type is invalid");
  assertCollectiveIdentifier(value.targetId, "targetId");
  if (
    value.targetVersion !== null &&
    (!Number.isSafeInteger(value.targetVersion) ||
      Number(value.targetVersion) < 1)
  )
    throw new TypeError("Room decision target version is invalid");
  assertCollectiveTimestamp(value.decidedAt, "decidedAt");
  assertCollectiveIdentifier(value.decidedBy, "decidedBy");
  return deepFreezeCollective({
    ...(value as unknown as RoomDecisionReferenceV1),
  });
}
