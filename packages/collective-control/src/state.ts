import type { JsonValue } from "@agentplat/core";

import { deepFreezeCollective, digestCollectiveJsonV1 } from "./canonical.js";
import type {
  CollectiveAuthorityLimitsV1,
  CollectiveDigestV1,
  DelegationMandateV1,
  DelegationProofVerificationV1,
  DelegationRevocationV1,
} from "./contracts.js";
import {
  CollectiveControlValidationError,
  assertCollectiveDigest,
  assertCollectiveExactKeys,
  assertCollectiveIdentifier,
  assertCollectiveSafeInteger,
  assertCollectiveTimestamp,
  validateDelegationMandateV1,
  validateDelegationRevocationV1,
} from "./validation.js";

export const DEFAULT_COLLECTIVE_AUTHORITY_LIMITS_V1: Readonly<CollectiveAuthorityLimitsV1> =
  Object.freeze({
    maximumMandates: 4_096,
    maximumMandateRevisions: 16_384,
    maximumRevocations: 8_192,
    maximumWorkContracts: 65_536,
    maximumBudgetReservations: 131_072,
    maximumActionPermits: 131_072,
    maximumDecisionRecords: 262_144,
  });

export interface AcceptedDelegationMandateV1 {
  readonly schemaVersion: 1;
  readonly mandate: DelegationMandateV1;
  readonly verification: DelegationProofVerificationV1;
  readonly acceptedAtLogicalMs: number;
}

export interface AcceptedDelegationRevocationV1 {
  readonly schemaVersion: 1;
  readonly revocation: DelegationRevocationV1;
  readonly verification: DelegationProofVerificationV1;
  readonly acceptedAtLogicalMs: number;
}

export interface CollectiveAuthorityStateV1 {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly generation: number;
  readonly highWaterLogicalMs: number;
  readonly mandates: readonly AcceptedDelegationMandateV1[];
  readonly revocations: readonly AcceptedDelegationRevocationV1[];
  readonly limits: CollectiveAuthorityLimitsV1;
  readonly stateDigest: CollectiveDigestV1;
}

export type CollectiveAuthorityRejectionCodeV1 =
  | "logical_time_regressed"
  | "scope_mismatch"
  | "verification_invalid"
  | "mandate_not_yet_valid"
  | "mandate_expired"
  | "mandate_revision_invalid"
  | "mandate_predecessor_invalid"
  | "mandate_revision_conflict"
  | "mandate_issuer_conflict"
  | "mandate_revoked"
  | "mandate_capacity_exceeded"
  | "mandate_revision_capacity_exceeded"
  | "revocation_mandate_missing"
  | "revocation_revision_invalid"
  | "revocation_generation_invalid"
  | "revocation_conflict"
  | "revocation_capacity_exceeded";

export type CollectiveAuthorityDecisionV1 =
  | {
      readonly accepted: true;
      readonly duplicate: boolean;
      readonly state: CollectiveAuthorityStateV1;
    }
  | {
      readonly accepted: false;
      readonly code: CollectiveAuthorityRejectionCodeV1;
      readonly state: CollectiveAuthorityStateV1;
    };

export type MandateAuthorizationDecisionV1 =
  | {
      readonly authorized: true;
      readonly mandate: DelegationMandateV1;
    }
  | {
      readonly authorized: false;
      readonly code:
        | "mandate_missing"
        | "mandate_digest_mismatch"
        | "mandate_not_yet_valid"
        | "mandate_expired"
        | "mandate_revoked";
    };

export function createCollectiveAuthorityStateV1(input: {
  readonly tenantId: string;
  readonly policyDomainId: string;
  readonly limits?: Partial<CollectiveAuthorityLimitsV1>;
}): CollectiveAuthorityStateV1 {
  assertCollectiveIdentifier(input.tenantId, "tenantId");
  assertCollectiveIdentifier(input.policyDomainId, "policyDomainId");
  const limits = validateLimits({
    ...DEFAULT_COLLECTIVE_AUTHORITY_LIMITS_V1,
    ...input.limits,
  });
  return materializeState({
    schemaVersion: 1,
    tenantId: input.tenantId,
    policyDomainId: input.policyDomainId,
    generation: 1,
    highWaterLogicalMs: 0,
    mandates: [],
    revocations: [],
    limits,
  });
}

export function acceptDelegationMandateV1(
  state: CollectiveAuthorityStateV1,
  input: {
    readonly mandate: DelegationMandateV1;
    readonly verification: DelegationProofVerificationV1;
    readonly acceptedAtLogicalMs: number;
  },
): CollectiveAuthorityDecisionV1 {
  const current = validateCollectiveAuthorityStateV1(state);
  const mandate = validateDelegationMandateV1(input.mandate);
  const verification = validateVerification(
    input.verification,
    mandate.statement.issuerId,
    mandate.mandateDigest,
  );
  assertCollectiveSafeInteger(input.acceptedAtLogicalMs, "acceptedAtLogicalMs");
  if (input.acceptedAtLogicalMs < current.highWaterLogicalMs)
    return rejection(current, "logical_time_regressed");
  if (
    mandate.statement.tenantId !== current.tenantId ||
    mandate.statement.policyDomainId !== current.policyDomainId
  )
    return rejection(current, "scope_mismatch");
  const verifiedAt = Date.parse(verification.verifiedAt);
  if (verifiedAt < Date.parse(mandate.statement.validFrom))
    return rejection(current, "mandate_not_yet_valid");
  if (verifiedAt >= Date.parse(mandate.statement.validUntil))
    return rejection(current, "mandate_expired");

  const sameMandate = current.mandates.filter(
    (record) =>
      record.mandate.statement.mandateId === mandate.statement.mandateId,
  );
  const sameRevision = sameMandate.find(
    (record) =>
      record.mandate.statement.revision === mandate.statement.revision,
  );
  if (sameRevision) {
    if (sameRevision.mandate.mandateDigest !== mandate.mandateDigest)
      return rejection(current, "mandate_revision_conflict");
    return acceptance(advanceTime(current, input.acceptedAtLogicalMs), true);
  }

  if (current.mandates.length >= current.limits.maximumMandateRevisions)
    return rejection(current, "mandate_revision_capacity_exceeded");
  if (
    sameMandate.length === 0 &&
    new Set(
      current.mandates.map((record) => record.mandate.statement.mandateId),
    ).size >= current.limits.maximumMandates
  )
    return rejection(current, "mandate_capacity_exceeded");

  if (sameMandate.length === 0) {
    if (
      mandate.statement.revision !== 1 ||
      mandate.statement.predecessorDigest !== null
    )
      return rejection(current, "mandate_revision_invalid");
  } else {
    const head = highestMandate(sameMandate);
    if (head.mandate.statement.issuerId !== mandate.statement.issuerId)
      return rejection(current, "mandate_issuer_conflict");
    if (mandate.statement.revision !== head.mandate.statement.revision + 1)
      return rejection(current, "mandate_revision_invalid");
    if (mandate.statement.predecessorDigest !== head.mandate.mandateDigest)
      return rejection(current, "mandate_predecessor_invalid");
  }

  if (
    current.revocations.some(
      (record) =>
        record.revocation.statement.mandateId === mandate.statement.mandateId &&
        record.revocation.statement.minimumRevokedRevision <=
          mandate.statement.revision,
    )
  )
    return rejection(current, "mandate_revoked");

  const record = deepFreezeCollective({
    schemaVersion: 1 as const,
    mandate,
    verification,
    acceptedAtLogicalMs: input.acceptedAtLogicalMs,
  });
  return acceptance(
    materializeState({
      ...withoutStateDigest(current),
      generation: current.generation + 1,
      highWaterLogicalMs: input.acceptedAtLogicalMs,
      mandates: [...current.mandates, record].sort(compareAcceptedMandates),
    }),
    false,
  );
}

export function acceptDelegationRevocationV1(
  state: CollectiveAuthorityStateV1,
  input: {
    readonly revocation: DelegationRevocationV1;
    readonly verification: DelegationProofVerificationV1;
    readonly acceptedAtLogicalMs: number;
  },
): CollectiveAuthorityDecisionV1 {
  const current = validateCollectiveAuthorityStateV1(state);
  const revocation = validateDelegationRevocationV1(input.revocation);
  const verification = validateVerification(
    input.verification,
    revocation.statement.issuerId,
    revocation.revocationDigest,
  );
  assertCollectiveSafeInteger(input.acceptedAtLogicalMs, "acceptedAtLogicalMs");
  if (input.acceptedAtLogicalMs < current.highWaterLogicalMs)
    return rejection(current, "logical_time_regressed");
  if (
    revocation.statement.tenantId !== current.tenantId ||
    revocation.statement.policyDomainId !== current.policyDomainId
  )
    return rejection(current, "scope_mismatch");

  const mandateRecord = current.mandates.find(
    (record) =>
      record.mandate.statement.mandateId === revocation.statement.mandateId &&
      record.mandate.statement.revision ===
        revocation.statement.minimumRevokedRevision &&
      record.mandate.mandateDigest === revocation.statement.mandateDigest,
  );
  if (!mandateRecord) return rejection(current, "revocation_mandate_missing");
  if (
    mandateRecord.mandate.statement.issuerId !== revocation.statement.issuerId
  )
    return rejection(current, "verification_invalid");

  const sameMandate = current.revocations.filter(
    (record) =>
      record.revocation.statement.mandateId === revocation.statement.mandateId,
  );
  const sameGeneration = sameMandate.find(
    (record) =>
      record.revocation.statement.generation ===
      revocation.statement.generation,
  );
  if (sameGeneration) {
    if (
      sameGeneration.revocation.revocationDigest !== revocation.revocationDigest
    )
      return rejection(current, "revocation_conflict");
    return acceptance(advanceTime(current, input.acceptedAtLogicalMs), true);
  }
  const expectedGeneration =
    sameMandate.reduce(
      (highest, record) =>
        Math.max(highest, record.revocation.statement.generation),
      0,
    ) + 1;
  if (revocation.statement.generation !== expectedGeneration)
    return rejection(current, "revocation_generation_invalid");
  if (current.revocations.length >= current.limits.maximumRevocations)
    return rejection(current, "revocation_capacity_exceeded");

  const record = deepFreezeCollective({
    schemaVersion: 1 as const,
    revocation,
    verification,
    acceptedAtLogicalMs: input.acceptedAtLogicalMs,
  });
  return acceptance(
    materializeState({
      ...withoutStateDigest(current),
      generation: current.generation + 1,
      highWaterLogicalMs: input.acceptedAtLogicalMs,
      revocations: [...current.revocations, record].sort(
        compareAcceptedRevocations,
      ),
    }),
    false,
  );
}

export function authorizeDelegationMandateAtV1(
  state: CollectiveAuthorityStateV1,
  input: {
    readonly mandateId: string;
    readonly mandateDigest: CollectiveDigestV1;
    readonly at: string;
  },
): MandateAuthorizationDecisionV1 {
  const current = validateCollectiveAuthorityStateV1(state);
  assertCollectiveIdentifier(input.mandateId, "mandateId");
  assertCollectiveDigest(input.mandateDigest, "mandateDigest");
  assertCollectiveTimestamp(input.at, "at");
  const records = current.mandates.filter(
    (record) => record.mandate.statement.mandateId === input.mandateId,
  );
  if (records.length === 0)
    return Object.freeze({ authorized: false, code: "mandate_missing" });
  const head = highestMandate(records).mandate;
  if (head.mandateDigest !== input.mandateDigest)
    return Object.freeze({
      authorized: false,
      code: "mandate_digest_mismatch",
    });
  const at = Date.parse(input.at);
  if (at < Date.parse(head.statement.validFrom))
    return Object.freeze({
      authorized: false,
      code: "mandate_not_yet_valid",
    });
  if (at >= Date.parse(head.statement.validUntil))
    return Object.freeze({ authorized: false, code: "mandate_expired" });
  if (
    current.revocations.some(
      (record) =>
        record.revocation.statement.mandateId === input.mandateId &&
        record.revocation.statement.minimumRevokedRevision <=
          head.statement.revision &&
        Date.parse(record.revocation.statement.effectiveAt) <= at,
    )
  )
    return Object.freeze({ authorized: false, code: "mandate_revoked" });
  return Object.freeze({ authorized: true, mandate: head });
}

export function validateCollectiveAuthorityStateV1(
  value: unknown,
): CollectiveAuthorityStateV1 {
  assertCollectiveExactKeys(
    value,
    [
      "schemaVersion",
      "tenantId",
      "policyDomainId",
      "generation",
      "highWaterLogicalMs",
      "mandates",
      "revocations",
      "limits",
      "stateDigest",
    ],
    "authority state",
  );
  if (value.schemaVersion !== 1)
    throw new CollectiveControlValidationError(
      "authority state schema is invalid",
    );
  assertCollectiveIdentifier(value.tenantId, "tenantId");
  assertCollectiveIdentifier(value.policyDomainId, "policyDomainId");
  const tenantId = value.tenantId;
  const policyDomainId = value.policyDomainId;
  assertCollectiveSafeInteger(value.generation, "generation", 1);
  assertCollectiveSafeInteger(value.highWaterLogicalMs, "highWaterLogicalMs");
  const generation = value.generation;
  const highWaterLogicalMs = value.highWaterLogicalMs;
  const limits = validateLimits(value.limits);
  assertStateArray(value.mandates, "mandates");
  assertStateArray(value.revocations, "revocations");
  if (
    value.mandates.length > limits.maximumMandateRevisions ||
    value.revocations.length > limits.maximumRevocations
  )
    throw new CollectiveControlValidationError("authority capacity is invalid");
  const mandates = value.mandates.map((item, index) =>
    validateAcceptedMandate(item, index, tenantId, policyDomainId),
  );
  const revocations = value.revocations.map((item, index) =>
    validateAcceptedRevocation(item, index, tenantId, policyDomainId),
  );
  assertSorted(mandates, compareAcceptedMandates, "mandates");
  assertSorted(revocations, compareAcceptedRevocations, "revocations");
  validateAuthorityLineage(mandates, revocations, limits);
  if (
    [...mandates, ...revocations].some(
      (record) => record.acceptedAtLogicalMs > highWaterLogicalMs,
    )
  )
    throw new CollectiveControlValidationError(
      "authority record exceeds the logical-time high-water",
    );
  assertCollectiveDigest(value.stateDigest, "stateDigest");
  const body = {
    schemaVersion: 1 as const,
    tenantId,
    policyDomainId,
    generation,
    highWaterLogicalMs,
    mandates,
    revocations,
    limits,
  };
  const expected = stateDigest(body);
  if (value.stateDigest !== expected)
    throw new CollectiveControlValidationError("state digest is invalid");
  return deepFreezeCollective({ ...body, stateDigest: expected });
}

function validateAcceptedMandate(
  value: unknown,
  index: number,
  tenantId: string,
  policyDomainId: string,
): AcceptedDelegationMandateV1 {
  assertCollectiveExactKeys(
    value,
    ["schemaVersion", "mandate", "verification", "acceptedAtLogicalMs"],
    `mandates[${index}]`,
  );
  if (value.schemaVersion !== 1)
    throw new CollectiveControlValidationError(
      "accepted mandate schema is invalid",
    );
  const mandate = validateDelegationMandateV1(value.mandate);
  const verification = validateVerification(
    value.verification,
    mandate.statement.issuerId,
    mandate.mandateDigest,
  );
  assertCollectiveSafeInteger(
    value.acceptedAtLogicalMs,
    `mandates[${index}].acceptedAtLogicalMs`,
  );
  if (
    mandate.statement.tenantId !== tenantId ||
    mandate.statement.policyDomainId !== policyDomainId
  )
    throw new CollectiveControlValidationError(
      "accepted mandate scope is invalid",
    );
  return deepFreezeCollective({
    schemaVersion: 1,
    mandate,
    verification,
    acceptedAtLogicalMs: value.acceptedAtLogicalMs,
  });
}

function validateAcceptedRevocation(
  value: unknown,
  index: number,
  tenantId: string,
  policyDomainId: string,
): AcceptedDelegationRevocationV1 {
  assertCollectiveExactKeys(
    value,
    ["schemaVersion", "revocation", "verification", "acceptedAtLogicalMs"],
    `revocations[${index}]`,
  );
  if (value.schemaVersion !== 1)
    throw new CollectiveControlValidationError(
      "accepted revocation schema is invalid",
    );
  const revocation = validateDelegationRevocationV1(value.revocation);
  const verification = validateVerification(
    value.verification,
    revocation.statement.issuerId,
    revocation.revocationDigest,
  );
  assertCollectiveSafeInteger(
    value.acceptedAtLogicalMs,
    `revocations[${index}].acceptedAtLogicalMs`,
  );
  if (
    revocation.statement.tenantId !== tenantId ||
    revocation.statement.policyDomainId !== policyDomainId
  )
    throw new CollectiveControlValidationError(
      "accepted revocation scope is invalid",
    );
  return deepFreezeCollective({
    schemaVersion: 1,
    revocation,
    verification,
    acceptedAtLogicalMs: value.acceptedAtLogicalMs,
  });
}

function validateVerification(
  value: unknown,
  expectedIssuer: string,
  expectedDigest: CollectiveDigestV1,
): DelegationProofVerificationV1 {
  assertCollectiveExactKeys(
    value,
    [
      "schemaVersion",
      "verifierId",
      "verifierVersion",
      "issuerId",
      "signedDigest",
      "verifiedAt",
      "status",
    ],
    "proof verification",
  );
  if (value.schemaVersion !== 1 || value.status !== "verified")
    throw new CollectiveControlValidationError("proof verification is invalid");
  assertCollectiveIdentifier(value.verifierId, "verifierId");
  assertCollectiveSafeInteger(value.verifierVersion, "verifierVersion", 1);
  assertCollectiveIdentifier(value.issuerId, "issuerId");
  assertCollectiveDigest(value.signedDigest, "signedDigest");
  assertCollectiveTimestamp(value.verifiedAt, "verifiedAt");
  if (
    value.issuerId !== expectedIssuer ||
    value.signedDigest !== expectedDigest
  )
    throw new CollectiveControlValidationError(
      "proof verification binding is invalid",
    );
  return deepFreezeCollective({
    ...value,
  }) as unknown as DelegationProofVerificationV1;
}

function validateAuthorityLineage(
  mandates: readonly AcceptedDelegationMandateV1[],
  revocations: readonly AcceptedDelegationRevocationV1[],
  limits: CollectiveAuthorityLimitsV1,
): void {
  const mandateIds = new Set(
    mandates.map((item) => item.mandate.statement.mandateId),
  );
  if (mandateIds.size > limits.maximumMandates)
    throw new CollectiveControlValidationError("mandate capacity is invalid");
  for (const mandateId of mandateIds) {
    const records = mandates.filter(
      (item) => item.mandate.statement.mandateId === mandateId,
    );
    const issuerId = records[0].mandate.statement.issuerId;
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      const statement = record.mandate.statement;
      if (
        statement.revision !== index + 1 ||
        statement.issuerId !== issuerId ||
        (index === 0
          ? statement.predecessorDigest !== null
          : statement.predecessorDigest !==
            records[index - 1].mandate.mandateDigest)
      )
        throw new CollectiveControlValidationError(
          "mandate revision lineage is invalid",
        );
      const verifiedAt = Date.parse(record.verification.verifiedAt);
      if (
        verifiedAt < Date.parse(statement.validFrom) ||
        verifiedAt >= Date.parse(statement.validUntil)
      )
        throw new CollectiveControlValidationError(
          "mandate verification time is invalid",
        );
    }
  }
  const revocationMandateIds = new Set(
    revocations.map((item) => item.revocation.statement.mandateId),
  );
  for (const mandateId of revocationMandateIds) {
    const records = revocations.filter(
      (item) => item.revocation.statement.mandateId === mandateId,
    );
    for (let index = 0; index < records.length; index += 1) {
      const statement = records[index].revocation.statement;
      if (statement.generation !== index + 1)
        throw new CollectiveControlValidationError(
          "revocation generation lineage is invalid",
        );
      const mandate = mandates.find(
        (item) =>
          item.mandate.statement.mandateId === mandateId &&
          item.mandate.statement.revision ===
            statement.minimumRevokedRevision &&
          item.mandate.mandateDigest === statement.mandateDigest &&
          item.mandate.statement.issuerId === statement.issuerId,
      );
      if (!mandate)
        throw new CollectiveControlValidationError(
          "revocation mandate binding is invalid",
        );
    }
  }
}

function assertStateArray(
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

function validateLimits(value: unknown): CollectiveAuthorityLimitsV1 {
  assertCollectiveExactKeys(
    value,
    [
      "maximumMandates",
      "maximumMandateRevisions",
      "maximumRevocations",
      "maximumWorkContracts",
      "maximumBudgetReservations",
      "maximumActionPermits",
      "maximumDecisionRecords",
    ],
    "authority limits",
  );
  for (const key of Object.keys(value))
    assertCollectiveSafeInteger(value[key], `limits.${key}`, 1);
  const limits = value as unknown as CollectiveAuthorityLimitsV1;
  if (
    limits.maximumMandateRevisions < limits.maximumMandates ||
    limits.maximumMandates >
      DEFAULT_COLLECTIVE_AUTHORITY_LIMITS_V1.maximumMandates ||
    limits.maximumMandateRevisions >
      DEFAULT_COLLECTIVE_AUTHORITY_LIMITS_V1.maximumMandateRevisions ||
    limits.maximumRevocations >
      DEFAULT_COLLECTIVE_AUTHORITY_LIMITS_V1.maximumRevocations ||
    limits.maximumWorkContracts >
      DEFAULT_COLLECTIVE_AUTHORITY_LIMITS_V1.maximumWorkContracts ||
    limits.maximumBudgetReservations >
      DEFAULT_COLLECTIVE_AUTHORITY_LIMITS_V1.maximumBudgetReservations ||
    limits.maximumActionPermits >
      DEFAULT_COLLECTIVE_AUTHORITY_LIMITS_V1.maximumActionPermits ||
    limits.maximumDecisionRecords >
      DEFAULT_COLLECTIVE_AUTHORITY_LIMITS_V1.maximumDecisionRecords
  )
    throw new CollectiveControlValidationError(
      "authority limits exceed hard bounds",
    );
  return deepFreezeCollective({ ...limits });
}

function materializeState(
  body: Omit<CollectiveAuthorityStateV1, "stateDigest">,
): CollectiveAuthorityStateV1 {
  const frozen = deepFreezeCollective({
    ...body,
    mandates: [...body.mandates],
    revocations: [...body.revocations],
    limits: { ...body.limits },
  });
  return deepFreezeCollective({ ...frozen, stateDigest: stateDigest(frozen) });
}

function stateDigest(
  body: Omit<CollectiveAuthorityStateV1, "stateDigest">,
): CollectiveDigestV1 {
  return digestCollectiveJsonV1("state", body as unknown as JsonValue);
}

function withoutStateDigest(
  state: CollectiveAuthorityStateV1,
): Omit<CollectiveAuthorityStateV1, "stateDigest"> {
  const { stateDigest: _stateDigest, ...body } = state;
  return body;
}

function advanceTime(
  state: CollectiveAuthorityStateV1,
  logicalTime: number,
): CollectiveAuthorityStateV1 {
  if (logicalTime === state.highWaterLogicalMs) return state;
  return materializeState({
    ...withoutStateDigest(state),
    generation: state.generation + 1,
    highWaterLogicalMs: logicalTime,
  });
}

function highestMandate(
  records: readonly AcceptedDelegationMandateV1[],
): AcceptedDelegationMandateV1 {
  return records.reduce((highest, record) =>
    record.mandate.statement.revision > highest.mandate.statement.revision
      ? record
      : highest,
  );
}

function compareAcceptedMandates(
  left: AcceptedDelegationMandateV1,
  right: AcceptedDelegationMandateV1,
): number {
  return (
    compareAscii(
      left.mandate.statement.mandateId,
      right.mandate.statement.mandateId,
    ) || left.mandate.statement.revision - right.mandate.statement.revision
  );
}

function compareAcceptedRevocations(
  left: AcceptedDelegationRevocationV1,
  right: AcceptedDelegationRevocationV1,
): number {
  return (
    compareAscii(
      left.revocation.statement.mandateId,
      right.revocation.statement.mandateId,
    ) ||
    left.revocation.statement.generation - right.revocation.statement.generation
  );
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertSorted<T>(
  values: readonly T[],
  compare: (left: T, right: T) => number,
  label: string,
): void {
  for (let index = 1; index < values.length; index += 1)
    if (compare(values[index - 1], values[index]) >= 0)
      throw new CollectiveControlValidationError(
        `${label} must be sorted and unique`,
      );
}

function acceptance(
  state: CollectiveAuthorityStateV1,
  duplicate: boolean,
): CollectiveAuthorityDecisionV1 {
  return Object.freeze({ accepted: true, duplicate, state });
}

function rejection(
  state: CollectiveAuthorityStateV1,
  code: CollectiveAuthorityRejectionCodeV1,
): CollectiveAuthorityDecisionV1 {
  return Object.freeze({ accepted: false, code, state });
}
