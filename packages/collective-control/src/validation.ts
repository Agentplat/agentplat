import type { JsonValue } from "@agentplat/core";

import {
  CollectiveControlValidationError,
  collectiveUtf8ByteLengthV1,
  deepFreezeCollective,
  digestCollectiveJsonV1,
} from "./canonical.js";
import type {
  BudgetReservationV1,
  CollectiveDecisionRecordV1,
  CollectiveDigestV1,
  DelegationMandateProofV1,
  DelegationMandateStatementV1,
  DelegationMandateV1,
  DelegationRevocationStatementV1,
  DelegationRevocationV1,
  GovernedActionPermitV1,
  MandateActionPatternV1,
  MandateBudgetPolicyV1,
  MandateEvidencePolicyV1,
  MandateObjectiveSelectorV1,
  MandateRoomProvenanceV1,
  MandateWorkSelectorV1,
  WorkContractAssignmentBindingV1,
  WorkContractMandateBindingV1,
  WorkContractObjectiveBindingV1,
  WorkContractV1,
} from "./contracts.js";

const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const tokenPattern = /^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/u;
const signaturePattern = /^[A-Za-z0-9_-]{16,512}$/u;
const rfc3339Pattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/u;

const mandateStatementKeys = Object.freeze([
  "schemaVersion",
  "mandateId",
  "tenantId",
  "policyDomainId",
  "issuerId",
  "revision",
  "predecessorDigest",
  "subjectPeerIds",
  "objective",
  "work",
  "permittedCapabilityKeys",
  "permittedActions",
  "budget",
  "validFrom",
  "validUntil",
  "roomProvenance",
  "evidence",
]);

export { CollectiveControlValidationError };

export function assertCollectiveExactKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (!isPlainRecord(value))
    throw new CollectiveControlValidationError(
      `${label} must be a plain object`,
    );
  const actual = Object.getOwnPropertyNames(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  )
    throw new CollectiveControlValidationError(`${label} has an invalid shape`);
}

export function assertCollectiveIdentifier(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    collectiveUtf8ByteLengthV1(value) > 256 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    throw new CollectiveControlValidationError(
      `${label} must be a bounded identifier`,
    );
}

export function assertCollectiveToken(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length > 128 ||
    !tokenPattern.test(value)
  )
    throw new CollectiveControlValidationError(`${label} must be a token`);
}

export function assertCollectiveDigest(
  value: unknown,
  label: string,
): asserts value is CollectiveDigestV1 {
  if (typeof value !== "string" || !digestPattern.test(value))
    throw new CollectiveControlValidationError(
      `${label} must be a collective-control digest`,
    );
}

export function assertCollectiveSafeInteger(
  value: unknown,
  label: string,
  minimum = 0,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    throw new CollectiveControlValidationError(
      `${label} must be a safe integer`,
    );
  if (Object.is(value, -0))
    throw new CollectiveControlValidationError(
      `${label} must not be negative zero`,
    );
}

export function assertCollectiveTimestamp(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string")
    throw new CollectiveControlValidationError(
      `${label} must be an RFC 3339 timestamp`,
    );
  const match = rfc3339Pattern.exec(value);
  if (!match)
    throw new CollectiveControlValidationError(
      `${label} must be an RFC 3339 timestamp`,
    );
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === "Z" ? 0 : Number(match[10]);
  const offsetMinute = match[8] === "Z" ? 0 : Number(match[11]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days[month - 1] ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0) ||
    Number.isNaN(Date.parse(value))
  )
    throw new CollectiveControlValidationError(
      `${label} must be an RFC 3339 timestamp`,
    );
}

function assertSchema(value: Record<string, unknown>, label: string): void {
  if (value.schemaVersion !== 1)
    throw new CollectiveControlValidationError(`${label} schema is invalid`);
}

function assertSortedIdentifiers(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  token = false,
): asserts value is readonly string[] {
  assertPlainArray(value, label);
  if (value.length < minimum || value.length > maximum)
    throw new CollectiveControlValidationError(`${label} has invalid length`);
  let previous: string | undefined;
  for (let index = 0; index < value.length; index += 1) {
    if (token) assertCollectiveToken(value[index], `${label}[${index}]`);
    else assertCollectiveIdentifier(value[index], `${label}[${index}]`);
    const current = value[index] as string;
    if (previous !== undefined && previous >= current)
      throw new CollectiveControlValidationError(
        `${label} must be sorted and unique`,
      );
    previous = current;
  }
}

function assertBoundedStrings(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): asserts value is readonly string[] {
  assertPlainArray(value, label);
  if (value.length < minimum || value.length > maximum)
    throw new CollectiveControlValidationError(`${label} has invalid length`);
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (
      typeof item !== "string" ||
      item.length === 0 ||
      collectiveUtf8ByteLengthV1(item) > 1_024 ||
      /[\u0000\u007f]/u.test(item)
    )
      throw new CollectiveControlValidationError(
        `${label}[${index}] must be bounded text`,
      );
  }
}

function validateObjectiveSelector(value: unknown): MandateObjectiveSelectorV1 {
  assertCollectiveExactKeys(
    value,
    [
      "schemaVersion",
      "meshId",
      "objectiveId",
      "objectiveDocumentId",
      "minimumObjectiveRevision",
      "maximumObjectiveRevision",
    ],
    "objective selector",
  );
  assertSchema(value, "objective selector");
  assertCollectiveIdentifier(value.meshId, "objective.meshId");
  assertCollectiveIdentifier(value.objectiveId, "objective.objectiveId");
  assertCollectiveIdentifier(
    value.objectiveDocumentId,
    "objective.objectiveDocumentId",
  );
  assertCollectiveSafeInteger(
    value.minimumObjectiveRevision,
    "objective.minimumObjectiveRevision",
    1,
  );
  assertCollectiveSafeInteger(
    value.maximumObjectiveRevision,
    "objective.maximumObjectiveRevision",
    1,
  );
  if (value.maximumObjectiveRevision < value.minimumObjectiveRevision)
    throw new CollectiveControlValidationError(
      "objective revision interval is invalid",
    );
  return value as unknown as MandateObjectiveSelectorV1;
}

function validateWorkSelector(value: unknown): MandateWorkSelectorV1 {
  assertCollectiveExactKeys(
    value,
    [
      "schemaVersion",
      "workItemIds",
      "permittedRoleKeys",
      "maximumWorkItemRevision",
    ],
    "work selector",
  );
  assertSchema(value, "work selector");
  assertSortedIdentifiers(value.workItemIds, "work.workItemIds", 0, 4_096);
  assertSortedIdentifiers(
    value.permittedRoleKeys,
    "work.permittedRoleKeys",
    1,
    256,
    true,
  );
  assertCollectiveSafeInteger(
    value.maximumWorkItemRevision,
    "work.maximumWorkItemRevision",
    1,
  );
  return value as unknown as MandateWorkSelectorV1;
}

function validateActionPatterns(
  value: unknown,
): readonly MandateActionPatternV1[] {
  assertPlainArray(value, "permittedActions");
  if (value.length > 1_024)
    throw new CollectiveControlValidationError(
      "permittedActions has invalid length",
    );
  let previous: string | undefined;
  const actions: MandateActionPatternV1[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    assertCollectiveExactKeys(
      item,
      ["schemaVersion", "namespace", "toolId", "operation"],
      `permittedActions[${index}]`,
    );
    assertSchema(item, `permittedActions[${index}]`);
    assertCollectiveToken(
      item.namespace,
      `permittedActions[${index}].namespace`,
    );
    assertCollectiveToken(item.toolId, `permittedActions[${index}].toolId`);
    assertCollectiveToken(
      item.operation,
      `permittedActions[${index}].operation`,
    );
    const key = `${item.namespace}\0${item.toolId}\0${item.operation}`;
    if (previous !== undefined && previous >= key)
      throw new CollectiveControlValidationError(
        "permittedActions must be sorted and unique",
      );
    previous = key;
    actions.push(item as unknown as MandateActionPatternV1);
  }
  return actions;
}

function validateBudget(value: unknown): MandateBudgetPolicyV1 {
  assertCollectiveExactKeys(
    value,
    [
      "schemaVersion",
      "totalBudgetUnits",
      "maximumWorkBudgetUnits",
      "maximumActionBudgetUnits",
      "maximumConcurrentWorkReservations",
      "maximumConcurrentActionReservations",
      "reservationLifetimeMs",
    ],
    "budget",
  );
  assertSchema(value, "budget");
  for (const key of [
    "totalBudgetUnits",
    "maximumWorkBudgetUnits",
    "maximumActionBudgetUnits",
    "maximumConcurrentWorkReservations",
    "maximumConcurrentActionReservations",
    "reservationLifetimeMs",
  ] as const)
    assertCollectiveSafeInteger(value[key], `budget.${key}`, 1);
  const budget = value as unknown as MandateBudgetPolicyV1;
  if (
    budget.maximumWorkBudgetUnits > budget.totalBudgetUnits ||
    budget.maximumActionBudgetUnits > budget.maximumWorkBudgetUnits ||
    budget.reservationLifetimeMs > 24 * 60 * 60 * 1_000
  )
    throw new CollectiveControlValidationError(
      "budget limits are inconsistent",
    );
  return budget;
}

function validateRoomProvenance(
  value: unknown,
): MandateRoomProvenanceV1 | null {
  if (value === null) return null;
  assertCollectiveExactKeys(
    value,
    [
      "schemaVersion",
      "roomId",
      "approvalId",
      "targetType",
      "targetId",
      "targetVersion",
    ],
    "room provenance",
  );
  assertSchema(value, "room provenance");
  assertCollectiveIdentifier(value.roomId, "roomProvenance.roomId");
  assertCollectiveIdentifier(value.approvalId, "roomProvenance.approvalId");
  if (
    !["room", "task", "artifact", "action"].includes(String(value.targetType))
  )
    throw new CollectiveControlValidationError(
      "roomProvenance.targetType is invalid",
    );
  assertCollectiveIdentifier(value.targetId, "roomProvenance.targetId");
  if (value.targetVersion !== null)
    assertCollectiveSafeInteger(
      value.targetVersion,
      "roomProvenance.targetVersion",
      1,
    );
  return value as unknown as MandateRoomProvenanceV1;
}

function validateEvidence(value: unknown): MandateEvidencePolicyV1 {
  assertCollectiveExactKeys(
    value,
    [
      "schemaVersion",
      "redactionPolicyId",
      "retentionClass",
      "requireDurablePreDispatchEvidence",
    ],
    "evidence policy",
  );
  assertSchema(value, "evidence policy");
  assertCollectiveIdentifier(
    value.redactionPolicyId,
    "evidence.redactionPolicyId",
  );
  assertCollectiveToken(value.retentionClass, "evidence.retentionClass");
  if (typeof value.requireDurablePreDispatchEvidence !== "boolean")
    throw new CollectiveControlValidationError(
      "evidence.requireDurablePreDispatchEvidence must be boolean",
    );
  return value as unknown as MandateEvidencePolicyV1;
}

export function validateDelegationMandateStatementV1(
  value: unknown,
): DelegationMandateStatementV1 {
  assertCollectiveExactKeys(value, mandateStatementKeys, "mandate statement");
  assertSchema(value, "mandate statement");
  assertCollectiveIdentifier(value.mandateId, "mandateId");
  assertCollectiveIdentifier(value.tenantId, "tenantId");
  assertCollectiveIdentifier(value.policyDomainId, "policyDomainId");
  assertCollectiveIdentifier(value.issuerId, "issuerId");
  assertCollectiveSafeInteger(value.revision, "revision", 1);
  if (value.revision === 1) {
    if (value.predecessorDigest !== null)
      throw new CollectiveControlValidationError(
        "initial mandate must not have a predecessor",
      );
  } else {
    assertCollectiveDigest(value.predecessorDigest, "predecessorDigest");
  }
  assertSortedIdentifiers(value.subjectPeerIds, "subjectPeerIds", 1, 4_096);
  validateObjectiveSelector(value.objective);
  validateWorkSelector(value.work);
  assertSortedIdentifiers(
    value.permittedCapabilityKeys,
    "permittedCapabilityKeys",
    1,
    1_024,
    true,
  );
  validateActionPatterns(value.permittedActions);
  validateBudget(value.budget);
  assertCollectiveTimestamp(value.validFrom, "validFrom");
  assertCollectiveTimestamp(value.validUntil, "validUntil");
  if (Date.parse(value.validUntil) <= Date.parse(value.validFrom))
    throw new CollectiveControlValidationError(
      "mandate validity interval is invalid",
    );
  validateRoomProvenance(value.roomProvenance);
  validateEvidence(value.evidence);
  return deepFreezeClone(value) as unknown as DelegationMandateStatementV1;
}

export function delegationMandateDigestV1(
  statement: DelegationMandateStatementV1,
): CollectiveDigestV1 {
  const validated = validateDelegationMandateStatementV1(statement);
  return digestCollectiveJsonV1("mandate", validated as unknown as JsonValue);
}

export function validateDelegationMandateProofV1(
  value: unknown,
): DelegationMandateProofV1 {
  if (!isPlainRecord(value))
    throw new CollectiveControlValidationError("mandate proof is invalid");
  if (value.kind === "issuer_signature") {
    assertCollectiveExactKeys(
      value,
      [
        "schemaVersion",
        "kind",
        "issuerId",
        "keyId",
        "algorithm",
        "signedDigest",
        "signature",
      ],
      "mandate proof",
    );
    assertSchema(value, "mandate proof");
    assertCollectiveIdentifier(value.issuerId, "proof.issuerId");
    assertCollectiveIdentifier(value.keyId, "proof.keyId");
    if (value.algorithm !== "Ed25519")
      throw new CollectiveControlValidationError("proof algorithm is invalid");
    assertCollectiveDigest(value.signedDigest, "proof.signedDigest");
    if (
      typeof value.signature !== "string" ||
      !signaturePattern.test(value.signature)
    )
      throw new CollectiveControlValidationError("proof signature is invalid");
  } else if (value.kind === "local_attestation") {
    assertCollectiveExactKeys(
      value,
      [
        "schemaVersion",
        "kind",
        "issuerId",
        "attestorId",
        "attestationId",
        "signedDigest",
      ],
      "mandate proof",
    );
    assertSchema(value, "mandate proof");
    assertCollectiveIdentifier(value.issuerId, "proof.issuerId");
    assertCollectiveIdentifier(value.attestorId, "proof.attestorId");
    assertCollectiveIdentifier(value.attestationId, "proof.attestationId");
    assertCollectiveDigest(value.signedDigest, "proof.signedDigest");
  } else {
    throw new CollectiveControlValidationError("mandate proof kind is invalid");
  }
  return deepFreezeClone(value) as unknown as DelegationMandateProofV1;
}

export function createDelegationMandateV1(input: {
  readonly statement: DelegationMandateStatementV1;
  readonly proof: DelegationMandateProofV1;
}): DelegationMandateV1 {
  const statement = validateDelegationMandateStatementV1(input.statement);
  const mandateDigest = delegationMandateDigestV1(statement);
  const proof = validateDelegationMandateProofV1(input.proof);
  if (
    proof.issuerId !== statement.issuerId ||
    proof.signedDigest !== mandateDigest
  )
    throw new CollectiveControlValidationError(
      "mandate proof binding is invalid",
    );
  return deepFreezeCollective({
    schemaVersion: 1,
    statement,
    mandateDigest,
    proof,
  });
}

export function validateDelegationMandateV1(
  value: unknown,
): DelegationMandateV1 {
  assertCollectiveExactKeys(
    value,
    ["schemaVersion", "statement", "mandateDigest", "proof"],
    "mandate",
  );
  assertSchema(value, "mandate");
  const statement = validateDelegationMandateStatementV1(value.statement);
  assertCollectiveDigest(value.mandateDigest, "mandateDigest");
  const proof = validateDelegationMandateProofV1(value.proof);
  const expected = delegationMandateDigestV1(statement);
  if (
    value.mandateDigest !== expected ||
    proof.signedDigest !== expected ||
    proof.issuerId !== statement.issuerId
  )
    throw new CollectiveControlValidationError("mandate binding is invalid");
  return deepFreezeCollective({
    schemaVersion: 1,
    statement,
    mandateDigest: expected,
    proof,
  });
}

export function validateDelegationRevocationStatementV1(
  value: unknown,
): DelegationRevocationStatementV1 {
  assertCollectiveExactKeys(
    value,
    [
      "schemaVersion",
      "revocationId",
      "tenantId",
      "policyDomainId",
      "issuerId",
      "mandateId",
      "mandateDigest",
      "minimumRevokedRevision",
      "generation",
      "effectiveAt",
      "reasonCode",
    ],
    "revocation statement",
  );
  assertSchema(value, "revocation statement");
  for (const key of [
    "revocationId",
    "tenantId",
    "policyDomainId",
    "issuerId",
    "mandateId",
  ] as const)
    assertCollectiveIdentifier(value[key], key);
  assertCollectiveDigest(value.mandateDigest, "mandateDigest");
  assertCollectiveSafeInteger(
    value.minimumRevokedRevision,
    "minimumRevokedRevision",
    1,
  );
  assertCollectiveSafeInteger(value.generation, "generation", 1);
  assertCollectiveTimestamp(value.effectiveAt, "effectiveAt");
  if (
    ![
      "operator_revoked",
      "policy_superseded",
      "scope_invalidated",
      "security_response",
      "issuer_retired",
    ].includes(String(value.reasonCode))
  )
    throw new CollectiveControlValidationError("revocation reason is invalid");
  return deepFreezeClone(value) as unknown as DelegationRevocationStatementV1;
}

export function delegationRevocationDigestV1(
  statement: DelegationRevocationStatementV1,
): CollectiveDigestV1 {
  return digestCollectiveJsonV1(
    "revocation",
    validateDelegationRevocationStatementV1(statement) as unknown as JsonValue,
  );
}

export function createDelegationRevocationV1(input: {
  readonly statement: DelegationRevocationStatementV1;
  readonly proof: DelegationMandateProofV1;
}): DelegationRevocationV1 {
  const statement = validateDelegationRevocationStatementV1(input.statement);
  const revocationDigest = delegationRevocationDigestV1(statement);
  const proof = validateDelegationMandateProofV1(input.proof);
  if (
    proof.issuerId !== statement.issuerId ||
    proof.signedDigest !== revocationDigest
  )
    throw new CollectiveControlValidationError(
      "revocation proof binding is invalid",
    );
  return deepFreezeCollective({
    schemaVersion: 1,
    statement,
    revocationDigest,
    proof,
  });
}

export function validateDelegationRevocationV1(
  value: unknown,
): DelegationRevocationV1 {
  assertCollectiveExactKeys(
    value,
    ["schemaVersion", "statement", "revocationDigest", "proof"],
    "revocation",
  );
  assertSchema(value, "revocation");
  const statement = validateDelegationRevocationStatementV1(value.statement);
  assertCollectiveDigest(value.revocationDigest, "revocationDigest");
  const proof = validateDelegationMandateProofV1(value.proof);
  const expected = delegationRevocationDigestV1(statement);
  if (
    value.revocationDigest !== expected ||
    proof.signedDigest !== expected ||
    proof.issuerId !== statement.issuerId
  )
    throw new CollectiveControlValidationError("revocation binding is invalid");
  return deepFreezeCollective({
    schemaVersion: 1,
    statement,
    revocationDigest: expected,
    proof,
  });
}

function validateMandateBinding(value: unknown): WorkContractMandateBindingV1 {
  assertCollectiveExactKeys(
    value,
    ["schemaVersion", "mandateId", "mandateRevision", "mandateDigest"],
    "work mandate binding",
  );
  assertSchema(value, "work mandate binding");
  assertCollectiveIdentifier(value.mandateId, "work.mandateId");
  assertCollectiveSafeInteger(value.mandateRevision, "work.mandateRevision", 1);
  assertCollectiveDigest(value.mandateDigest, "work.mandateDigest");
  return value as unknown as WorkContractMandateBindingV1;
}

function validateObjectiveBinding(
  value: unknown,
): WorkContractObjectiveBindingV1 {
  assertCollectiveExactKeys(
    value,
    [
      "schemaVersion",
      "meshId",
      "objectiveId",
      "objectiveDocumentId",
      "objectiveRevision",
      "acceptedMessageId",
      "acceptedPolicyDigest",
    ],
    "work objective binding",
  );
  assertSchema(value, "work objective binding");
  for (const key of [
    "meshId",
    "objectiveId",
    "objectiveDocumentId",
    "acceptedMessageId",
  ] as const)
    assertCollectiveIdentifier(value[key], `work.${key}`);
  assertCollectiveSafeInteger(
    value.objectiveRevision,
    "work.objectiveRevision",
    1,
  );
  assertCollectiveDigest(
    value.acceptedPolicyDigest,
    "work.acceptedPolicyDigest",
  );
  return value as unknown as WorkContractObjectiveBindingV1;
}

function validateAssignmentBinding(
  value: unknown,
): WorkContractAssignmentBindingV1 {
  assertCollectiveExactKeys(
    value,
    [
      "schemaVersion",
      "workItemId",
      "workItemRevision",
      "ownerPeerId",
      "assignedPeerId",
      "assignedInstanceId",
      "assignmentAuthorityId",
      "assignmentEpoch",
      "authorityGeneration",
      "fencingToken",
      "leaseExpiresAtLogicalMs",
      "workDeadline",
    ],
    "work assignment binding",
  );
  assertSchema(value, "work assignment binding");
  for (const key of [
    "workItemId",
    "ownerPeerId",
    "assignedPeerId",
    "assignedInstanceId",
    "assignmentAuthorityId",
    "fencingToken",
  ] as const)
    assertCollectiveIdentifier(value[key], `work.${key}`);
  for (const key of [
    "workItemRevision",
    "assignmentEpoch",
    "authorityGeneration",
  ] as const)
    assertCollectiveSafeInteger(value[key], `work.${key}`, 1);
  assertCollectiveSafeInteger(
    value.leaseExpiresAtLogicalMs,
    "work.leaseExpiresAtLogicalMs",
  );
  assertCollectiveTimestamp(value.workDeadline, "work.workDeadline");
  return value as unknown as WorkContractAssignmentBindingV1;
}

export function workContractDigestV1(
  value: Omit<WorkContractV1, "workContractDigest">,
): CollectiveDigestV1 {
  return digestCollectiveJsonV1("work-contract", value as unknown as JsonValue);
}

export function validateWorkContractV1(value: unknown): WorkContractV1 {
  assertCollectiveExactKeys(
    value,
    [
      "schemaVersion",
      "workContractId",
      "generation",
      "tenantId",
      "policyDomainId",
      "mandate",
      "objective",
      "assignment",
      "roleKey",
      "requiredCapabilityKeys",
      "completionCriteria",
      "inputReferenceDigest",
      "reservedBudgetUnits",
      "maximumActionBudgetUnits",
      "trustPolicyId",
      "inferencePolicyId",
      "createdAtLogicalMs",
      "updatedAtLogicalMs",
      "status",
      "terminalReasonCode",
      "workContractDigest",
    ],
    "work contract",
  );
  assertSchema(value, "work contract");
  for (const key of [
    "workContractId",
    "tenantId",
    "policyDomainId",
    "trustPolicyId",
    "inferencePolicyId",
  ] as const)
    assertCollectiveIdentifier(value[key], key);
  assertCollectiveSafeInteger(value.generation, "generation", 1);
  validateMandateBinding(value.mandate);
  validateObjectiveBinding(value.objective);
  validateAssignmentBinding(value.assignment);
  assertCollectiveToken(value.roleKey, "roleKey");
  assertSortedIdentifiers(
    value.requiredCapabilityKeys,
    "requiredCapabilityKeys",
    1,
    1_024,
    true,
  );
  assertBoundedStrings(value.completionCriteria, "completionCriteria", 1, 256);
  if (value.inputReferenceDigest !== null)
    assertCollectiveDigest(value.inputReferenceDigest, "inputReferenceDigest");
  assertCollectiveSafeInteger(
    value.reservedBudgetUnits,
    "reservedBudgetUnits",
    1,
  );
  assertCollectiveSafeInteger(
    value.maximumActionBudgetUnits,
    "maximumActionBudgetUnits",
    1,
  );
  if (value.maximumActionBudgetUnits > value.reservedBudgetUnits)
    throw new CollectiveControlValidationError("work budget is inconsistent");
  assertCollectiveSafeInteger(value.createdAtLogicalMs, "createdAtLogicalMs");
  assertCollectiveSafeInteger(value.updatedAtLogicalMs, "updatedAtLogicalMs");
  if (value.updatedAtLogicalMs < value.createdAtLogicalMs)
    throw new CollectiveControlValidationError("work logical time regressed");
  if (
    ![
      "proposed",
      "active",
      "completing",
      "completed",
      "revoked",
      "expired",
      "released",
    ].includes(String(value.status))
  )
    throw new CollectiveControlValidationError("work status is invalid");
  const terminal = ["completed", "revoked", "expired", "released"].includes(
    String(value.status),
  );
  if (terminal)
    assertCollectiveToken(value.terminalReasonCode, "terminalReasonCode");
  else if (value.terminalReasonCode !== null)
    throw new CollectiveControlValidationError(
      "non-terminal work cannot have a terminal reason",
    );
  assertCollectiveDigest(value.workContractDigest, "workContractDigest");
  const { workContractDigest: _digest, ...body } = value;
  const expected = workContractDigestV1(
    body as Omit<WorkContractV1, "workContractDigest">,
  );
  if (value.workContractDigest !== expected)
    throw new CollectiveControlValidationError(
      "work contract digest is invalid",
    );
  return deepFreezeClone(value) as unknown as WorkContractV1;
}

export function budgetReservationDigestV1(
  value: Omit<BudgetReservationV1, "reservationDigest">,
): CollectiveDigestV1 {
  return digestCollectiveJsonV1(
    "budget-reservation",
    value as unknown as JsonValue,
  );
}

export function validateBudgetReservationV1(
  value: unknown,
): BudgetReservationV1 {
  assertCollectiveExactKeys(
    value,
    [
      "schemaVersion",
      "reservationId",
      "generation",
      "tenantId",
      "policyDomainId",
      "mandateId",
      "mandateRevision",
      "mandateDigest",
      "workContractId",
      "permitId",
      "idempotencyKey",
      "units",
      "reservedAtLogicalMs",
      "expiresAtLogicalMs",
      "status",
      "outcomeId",
      "reservationDigest",
    ],
    "budget reservation",
  );
  assertSchema(value, "budget reservation");
  for (const key of [
    "reservationId",
    "tenantId",
    "policyDomainId",
    "mandateId",
    "workContractId",
    "permitId",
    "idempotencyKey",
  ] as const)
    assertCollectiveIdentifier(value[key], key);
  for (const key of ["generation", "mandateRevision", "units"] as const)
    assertCollectiveSafeInteger(value[key], key, 1);
  assertCollectiveDigest(value.mandateDigest, "mandateDigest");
  assertCollectiveSafeInteger(value.reservedAtLogicalMs, "reservedAtLogicalMs");
  assertCollectiveSafeInteger(value.expiresAtLogicalMs, "expiresAtLogicalMs");
  if (value.expiresAtLogicalMs <= value.reservedAtLogicalMs)
    throw new CollectiveControlValidationError(
      "budget reservation interval is invalid",
    );
  if (
    !["reserved", "committed", "released", "indeterminate"].includes(
      String(value.status),
    )
  )
    throw new CollectiveControlValidationError("budget status is invalid");
  if (value.status === "reserved") {
    if (value.outcomeId !== null)
      throw new CollectiveControlValidationError(
        "reserved budget cannot have an outcome",
      );
  } else {
    assertCollectiveIdentifier(value.outcomeId, "outcomeId");
  }
  assertCollectiveDigest(value.reservationDigest, "reservationDigest");
  const { reservationDigest: _digest, ...body } = value;
  const expected = budgetReservationDigestV1(
    body as Omit<BudgetReservationV1, "reservationDigest">,
  );
  if (value.reservationDigest !== expected)
    throw new CollectiveControlValidationError(
      "budget reservation digest is invalid",
    );
  return deepFreezeClone(value) as unknown as BudgetReservationV1;
}

export function governedActionPermitDigestV1(
  value: Omit<GovernedActionPermitV1, "permitDigest">,
): CollectiveDigestV1 {
  return digestCollectiveJsonV1("action-permit", value as unknown as JsonValue);
}

export function validateGovernedActionPermitV1(
  value: unknown,
): GovernedActionPermitV1 {
  const keys = [
    "schemaVersion",
    "permitId",
    "generation",
    "gatewayId",
    "tenantId",
    "policyDomainId",
    "mandateId",
    "mandateRevision",
    "mandateDigest",
    "workContractId",
    "workContractDigest",
    "actionGrantId",
    "actionGrantDigest",
    "actionScopeDigest",
    "assignmentAuthorityId",
    "assignedPeerId",
    "assignedInstanceId",
    "assignmentEpoch",
    "authorityGeneration",
    "fencingToken",
    "namespace",
    "toolId",
    "operation",
    "actionBindingId",
    "actionBindingVersion",
    "handlerDigest",
    "inputDigest",
    "assessmentDigest",
    "trustDecisionDigest",
    "budgetReservationId",
    "budgetUnits",
    "idempotencyKey",
    "issuedAtLogicalMs",
    "expiresAtLogicalMs",
    "status",
    "outcomeId",
    "permitDigest",
  ];
  assertCollectiveExactKeys(value, keys, "governed action permit");
  assertSchema(value, "governed action permit");
  for (const key of [
    "permitId",
    "gatewayId",
    "tenantId",
    "policyDomainId",
    "mandateId",
    "workContractId",
    "actionGrantId",
    "assignmentAuthorityId",
    "assignedPeerId",
    "assignedInstanceId",
    "fencingToken",
    "actionBindingId",
    "budgetReservationId",
    "idempotencyKey",
  ] as const)
    assertCollectiveIdentifier(value[key], key);
  for (const key of ["namespace", "toolId", "operation"] as const)
    assertCollectiveToken(value[key], key);
  for (const key of [
    "generation",
    "mandateRevision",
    "assignmentEpoch",
    "authorityGeneration",
    "actionBindingVersion",
    "budgetUnits",
  ] as const)
    assertCollectiveSafeInteger(value[key], key, 1);
  for (const key of [
    "mandateDigest",
    "workContractDigest",
    "actionGrantDigest",
    "actionScopeDigest",
    "handlerDigest",
    "inputDigest",
    "assessmentDigest",
    "trustDecisionDigest",
    "permitDigest",
  ] as const)
    assertCollectiveDigest(value[key], key);
  assertCollectiveSafeInteger(value.issuedAtLogicalMs, "issuedAtLogicalMs");
  assertCollectiveSafeInteger(value.expiresAtLogicalMs, "expiresAtLogicalMs");
  if (
    value.expiresAtLogicalMs <= value.issuedAtLogicalMs ||
    value.expiresAtLogicalMs - value.issuedAtLogicalMs > 120_000
  )
    throw new CollectiveControlValidationError("permit interval is invalid");
  if (
    ![
      "issued",
      "reserved",
      "dispatching",
      "dispatched",
      "failed",
      "indeterminate",
      "expired",
    ].includes(String(value.status))
  )
    throw new CollectiveControlValidationError("permit status is invalid");
  const terminalOutcome = ["dispatched", "failed", "indeterminate"].includes(
    String(value.status),
  );
  if (terminalOutcome) assertCollectiveIdentifier(value.outcomeId, "outcomeId");
  else if (value.outcomeId !== null)
    throw new CollectiveControlValidationError(
      "non-terminal permit cannot have an outcome",
    );
  const { permitDigest: _digest, ...body } = value;
  const expected = governedActionPermitDigestV1(
    body as Omit<GovernedActionPermitV1, "permitDigest">,
  );
  if (value.permitDigest !== expected)
    throw new CollectiveControlValidationError("permit digest is invalid");
  return deepFreezeClone(value) as unknown as GovernedActionPermitV1;
}

export function collectiveDecisionRecordDigestV1(
  value: Omit<CollectiveDecisionRecordV1, "recordDigest">,
): CollectiveDigestV1 {
  return digestCollectiveJsonV1(
    "decision-record",
    value as unknown as JsonValue,
  );
}

export function validateCollectiveDecisionRecordV1(
  value: unknown,
): CollectiveDecisionRecordV1 {
  assertCollectiveExactKeys(
    value,
    [
      "schemaVersion",
      "recordId",
      "tenantId",
      "policyDomainId",
      "kind",
      "accepted",
      "reasonCode",
      "logicalTimeMs",
      "mandateId",
      "mandateDigest",
      "workContractId",
      "workContractDigest",
      "permitId",
      "permitDigest",
      "assignmentAuthorityId",
      "assignmentEpoch",
      "fencingToken",
      "budgetDeltaKind",
      "budgetDeltaUnits",
      "inputDigest",
      "actionDigest",
      "assessmentDigest",
      "trustDecisionDigest",
      "previousRecordDigest",
      "recordDigest",
    ],
    "decision record",
  );
  assertSchema(value, "decision record");
  for (const key of ["recordId", "tenantId", "policyDomainId"] as const)
    assertCollectiveIdentifier(value[key], key);
  if (
    ![
      "mandate.accept",
      "mandate.revise",
      "mandate.revoke",
      "objective.accept",
      "objective.reject",
      "work.open",
      "work.refresh",
      "work.terminate",
      "permit.issue",
      "permit.reserve",
      "effect.dispatch",
      "effect.reconcile",
    ].includes(String(value.kind))
  )
    throw new CollectiveControlValidationError("decision kind is invalid");
  if (typeof value.accepted !== "boolean")
    throw new CollectiveControlValidationError("accepted must be boolean");
  assertCollectiveToken(value.reasonCode, "reasonCode");
  assertCollectiveSafeInteger(value.logicalTimeMs, "logicalTimeMs");
  for (const key of [
    "mandateId",
    "workContractId",
    "permitId",
    "assignmentAuthorityId",
    "fencingToken",
  ] as const)
    if (value[key] !== null) assertCollectiveIdentifier(value[key], key);
  for (const key of [
    "mandateDigest",
    "workContractDigest",
    "permitDigest",
    "inputDigest",
    "actionDigest",
    "assessmentDigest",
    "trustDecisionDigest",
    "previousRecordDigest",
    "recordDigest",
  ] as const)
    if (value[key] !== null) assertCollectiveDigest(value[key], key);
  if (value.assignmentEpoch !== null)
    assertCollectiveSafeInteger(value.assignmentEpoch, "assignmentEpoch", 1);
  if (
    !["none", "reserve", "commit", "release", "retain_indeterminate"].includes(
      String(value.budgetDeltaKind),
    )
  )
    throw new CollectiveControlValidationError("budgetDeltaKind is invalid");
  assertCollectiveSafeInteger(value.budgetDeltaUnits, "budgetDeltaUnits");
  if ((value.budgetDeltaKind === "none") !== (value.budgetDeltaUnits === 0))
    throw new CollectiveControlValidationError("budget delta is inconsistent");
  const { recordDigest: _digest, ...body } = value;
  const expected = collectiveDecisionRecordDigestV1(
    body as Omit<CollectiveDecisionRecordV1, "recordDigest">,
  );
  if (value.recordDigest !== expected)
    throw new CollectiveControlValidationError("record digest is invalid");
  return deepFreezeClone(value) as unknown as CollectiveDecisionRecordV1;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Object.getOwnPropertySymbols(value).length === 0 &&
    Object.values(Object.getOwnPropertyDescriptors(value)).every(
      (descriptor) =>
        "value" in descriptor && descriptor.enumerable && !descriptor.get,
    )
  );
}

function assertPlainArray(
  value: unknown,
  label: string,
): asserts value is readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    throw new CollectiveControlValidationError(
      `${label} must be a plain array`,
    );
  if (Object.getOwnPropertySymbols(value).length > 0)
    throw new CollectiveControlValidationError(
      `${label} may not contain symbol keys`,
    );
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== value.length + 1 || !names.includes("length"))
    throw new CollectiveControlValidationError(
      `${label} may not contain extra or sparse properties`,
    );
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
      throw new CollectiveControlValidationError(
        `${label} must contain enumerable data`,
      );
  }
}

function deepFreezeClone<T>(value: T): T {
  return deepFreezeCollective(
    JSON.parse(JSON.stringify(value)) as unknown as T,
  );
}
