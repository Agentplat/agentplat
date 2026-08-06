import {
  digestTrustEligibilityDecisionV1,
  validateEvidenceFusionDecisionV1,
  validateQuarantineRecoveryDecisionV1,
  validateTrustEligibilityDecisionV1,
  validateTrustProfileV1,
} from "@agentplat/trust";
import { collectiveAgreementDigestV1 } from "./agreement-codec.js";
import type {
  CertifiedCollectiveTrustDecisionV1,
  CollectiveTrustCandidateConstructionInputV1,
  CollectiveTrustCandidateV1,
  CollectiveTrustDispositionV1,
  CollectiveTrustGateDecisionV1,
  CollectiveTrustGateDispositionV1,
  CollectiveTrustGatePolicyV1,
  CollectiveTrustGateReasonV1,
} from "./trust-consensus-contracts.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-=]{0,255}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const TRUST_DIGEST = /^[0-9a-f]{64}$/u;
const CANDIDATE_KEYS = [
  "candidateDigest",
  "candidateId",
  "disposition",
  "eligibilityDecisionDigest",
  "evidenceSetDigest",
  "fusionDecisionDigest",
  "observedAtLogicalMs",
  "policyDigest",
  "policyId",
  "policyVersion",
  "previousCertifiedDecisionDigest",
  "profileDigest",
  "recoveryDecisionDigest",
  "schemaVersion",
  "scopeDigest",
  "subjectDigest",
  "tenantId",
  "validUntilLogicalMs",
] as const;
const DECISION_KEYS = [
  "candidateDigest",
  "candidateId",
  "certifiedAtLogicalMs",
  "decisionDigest",
  "decisionId",
  "disposition",
  "eligibilityDecisionDigest",
  "evidenceSetDigest",
  "fusionDecisionDigest",
  "membershipConfigurationDigest",
  "membershipEpoch",
  "observedAtLogicalMs",
  "policyDigest",
  "policyId",
  "policyVersion",
  "previousCertifiedDecisionDigest",
  "profileDigest",
  "recoveryDecisionDigest",
  "schemaVersion",
  "scopeDigest",
  "sourceCommitDigest",
  "subjectDigest",
  "tenantId",
  "validUntilLogicalMs",
  "witnessPeerIds",
] as const;
const GATE_KEYS = [
  "certifiedDecisionDigest",
  "certifiedDecisionId",
  "disposition",
  "evaluatedAtLogicalMs",
  "gateDecisionDigest",
  "gateDecisionId",
  "localEligibilityDecisionDigest",
  "localEligibilityDecisionId",
  "policyDigest",
  "reasonCode",
  "requireCertificate",
  "schemaVersion",
  "scopeDigest",
  "subjectDigest",
  "tenantId",
] as const;
const DISPOSITIONS: readonly CollectiveTrustDispositionV1[] = [
  "eligible",
  "quarantined",
  "recovery_candidate",
  "restricted",
];
const GATE_DISPOSITIONS: readonly CollectiveTrustGateDispositionV1[] = [
  "eligible",
  "quarantined",
  "restricted",
  "unavailable",
];
const GATE_REASONS: readonly CollectiveTrustGateReasonV1[] = [
  "collective_binding_mismatch",
  "collective_expired",
  "collective_quarantined",
  "collective_recovery_pending",
  "collective_restricted",
  "collective_unavailable",
  "eligible",
  "local_quarantined",
  "local_restricted",
  "local_unavailable",
];

export class CollectiveTrustConsensusValidationErrorV1 extends Error {
  readonly name = "CollectiveTrustConsensusValidationErrorV1";
}

export async function createCollectiveTrustCandidateV1(
  input: CollectiveTrustCandidateConstructionInputV1,
): Promise<CollectiveTrustCandidateV1> {
  allowed(
    input,
    [
      "crypto",
      "eligibilityDecision",
      "fusionDecision",
      "previousCertifiedDecisionDigest",
      "profile",
      "recoveryDecision",
      "tenantId",
      "validUntilLogicalMs",
    ],
    [
      "eligibilityDecision",
      "fusionDecision",
      "previousCertifiedDecisionDigest",
      "profile",
      "tenantId",
      "validUntilLogicalMs",
    ],
    "candidate construction input",
  );
  identifier(input.tenantId, "tenantId");
  const profile = validateTrustProfileV1(input.profile);
  const fusion = validateEvidenceFusionDecisionV1(input.fusionDecision);
  const eligibility = validateTrustEligibilityDecisionV1(
    input.eligibilityDecision,
  );
  if (
    profile.tenantId !== input.tenantId ||
    fusion.tenantId !== input.tenantId ||
    profile.subjectDigest !== fusion.subjectDigest ||
    profile.scopeDigest !== fusion.scopeDigest ||
    profile.policyId !== fusion.policyId ||
    profile.policyVersion !== fusion.policyVersion ||
    profile.policyDigest !== fusion.policyDigest ||
    profile.fusionDecisionDigest !== fusion.fusionDecisionDigest ||
    profile.inputSetDigest !== fusion.inputSetDigest ||
    eligibility.subjectDigest !== profile.subjectDigest ||
    eligibility.scopeDigest !== profile.scopeDigest ||
    eligibility.policyDigest !== profile.policyDigest ||
    eligibility.profileDigest !== profile.profileDigest
  )
    invalid("candidate Trust projections are inconsistent");
  if (eligibility.disposition === "unavailable")
    invalid("unavailable local eligibility cannot form a candidate");
  safeInteger(input.validUntilLogicalMs, "validUntilLogicalMs", 1);
  if (input.validUntilLogicalMs <= eligibility.evaluatedAtLogicalMs)
    invalid("candidate validity window is invalid");
  nullableDigest(
    input.previousCertifiedDecisionDigest,
    "previousCertifiedDecisionDigest",
  );
  let disposition = eligibility.disposition as CollectiveTrustDispositionV1;
  let recoveryDecisionDigest: string | null = null;
  if (input.recoveryDecision) {
    const recovery = validateQuarantineRecoveryDecisionV1(
      input.recoveryDecision,
    );
    if (
      recovery.disposition !== "recovered" ||
      recovery.policyDigest !== profile.policyDigest ||
      recovery.fusionDecisionId !== profile.fusionDecisionId
    )
      invalid("recovery projection is inconsistent");
    disposition = "recovery_candidate";
    recoveryDecisionDigest = recovery.recoveryDecisionDigest;
  }
  const body = {
    schemaVersion: 1 as const,
    tenantId: input.tenantId,
    subjectDigest: profile.subjectDigest,
    scopeDigest: profile.scopeDigest,
    policyId: profile.policyId,
    policyVersion: profile.policyVersion,
    policyDigest: profile.policyDigest,
    profileDigest: profile.profileDigest,
    fusionDecisionDigest: fusion.fusionDecisionDigest,
    eligibilityDecisionDigest: digestTrustEligibilityDecisionV1(eligibility),
    evidenceSetDigest: fusion.inputSetDigest,
    recoveryDecisionDigest,
    disposition,
    previousCertifiedDecisionDigest: input.previousCertifiedDecisionDigest,
    observedAtLogicalMs: eligibility.evaluatedAtLogicalMs,
    validUntilLogicalMs: input.validUntilLogicalMs,
  };
  const candidateDigest = await digestCandidateBody(body, input.crypto);
  return validateCollectiveTrustCandidateV1(
    {
      ...body,
      candidateId: `collective-trust-candidate:${candidateDigest.slice(7)}`,
      candidateDigest,
    },
    input.crypto,
  );
}

export async function validateCollectiveTrustCandidateV1(
  value: unknown,
  crypto?: Crypto,
): Promise<CollectiveTrustCandidateV1> {
  exact(value, CANDIDATE_KEYS, "collective trust candidate");
  const candidate = value as unknown as CollectiveTrustCandidateV1;
  if (candidate.schemaVersion !== 1) invalid("candidate schema is invalid");
  identifier(candidate.candidateId, "candidateId");
  identifier(candidate.tenantId, "tenantId");
  identifier(candidate.policyId, "policyId");
  digest(candidate.candidateDigest, "candidateDigest");
  for (const key of [
    "subjectDigest",
    "scopeDigest",
    "policyDigest",
    "profileDigest",
    "fusionDecisionDigest",
    "eligibilityDecisionDigest",
    "evidenceSetDigest",
  ] as const)
    trustDigest(candidate[key], key);
  nullableTrustDigest(
    candidate.recoveryDecisionDigest,
    "recoveryDecisionDigest",
  );
  nullableDigest(
    candidate.previousCertifiedDecisionDigest,
    "previousCertifiedDecisionDigest",
  );
  safeInteger(candidate.policyVersion, "policyVersion", 1);
  safeInteger(candidate.observedAtLogicalMs, "observedAtLogicalMs");
  safeInteger(candidate.validUntilLogicalMs, "validUntilLogicalMs", 1);
  if (candidate.validUntilLogicalMs <= candidate.observedAtLogicalMs)
    invalid("candidate validity window is invalid");
  if (!DISPOSITIONS.includes(candidate.disposition))
    invalid("candidate disposition is invalid");
  if (
    (candidate.disposition === "recovery_candidate") !==
    (candidate.recoveryDecisionDigest !== null)
  )
    invalid("candidate recovery binding is invalid");
  const { candidateId: _id, candidateDigest: _digest, ...body } = candidate;
  const expected = await digestCandidateBody(body, crypto);
  if (
    candidate.candidateDigest !== expected ||
    candidate.candidateId !== `collective-trust-candidate:${expected.slice(7)}`
  )
    invalid("candidate digest is invalid");
  return frozen(candidate);
}

export async function createCertifiedCollectiveTrustDecisionV1(input: {
  readonly candidate: CollectiveTrustCandidateV1;
  readonly witnessPeerIds: readonly string[];
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: string;
  readonly sourceCommitDigest: string;
  readonly certifiedAtLogicalMs: number;
  readonly crypto?: Crypto;
}): Promise<CertifiedCollectiveTrustDecisionV1> {
  const candidate = await validateCollectiveTrustCandidateV1(
    input.candidate,
    input.crypto,
  );
  const witnessPeerIds = sortedIdentifiers(
    input.witnessPeerIds,
    "witnessPeerIds",
  );
  if (witnessPeerIds.length === 0) invalid("decision witnesses are empty");
  safeInteger(input.membershipEpoch, "membershipEpoch", 1);
  digest(input.membershipConfigurationDigest, "membershipConfigurationDigest");
  digest(input.sourceCommitDigest, "sourceCommitDigest");
  safeInteger(input.certifiedAtLogicalMs, "certifiedAtLogicalMs");
  if (
    input.certifiedAtLogicalMs < candidate.observedAtLogicalMs ||
    input.certifiedAtLogicalMs >= candidate.validUntilLogicalMs
  )
    invalid("decision certification time is invalid");
  const body = {
    schemaVersion: 1 as const,
    candidateId: candidate.candidateId,
    candidateDigest: candidate.candidateDigest,
    tenantId: candidate.tenantId,
    subjectDigest: candidate.subjectDigest,
    scopeDigest: candidate.scopeDigest,
    policyId: candidate.policyId,
    policyVersion: candidate.policyVersion,
    policyDigest: candidate.policyDigest,
    profileDigest: candidate.profileDigest,
    fusionDecisionDigest: candidate.fusionDecisionDigest,
    eligibilityDecisionDigest: candidate.eligibilityDecisionDigest,
    evidenceSetDigest: candidate.evidenceSetDigest,
    recoveryDecisionDigest: candidate.recoveryDecisionDigest,
    disposition: candidate.disposition,
    previousCertifiedDecisionDigest: candidate.previousCertifiedDecisionDigest,
    witnessPeerIds,
    membershipEpoch: input.membershipEpoch,
    membershipConfigurationDigest: input.membershipConfigurationDigest,
    sourceCommitDigest: input.sourceCommitDigest,
    observedAtLogicalMs: candidate.observedAtLogicalMs,
    certifiedAtLogicalMs: input.certifiedAtLogicalMs,
    validUntilLogicalMs: candidate.validUntilLogicalMs,
  };
  const decisionDigest = await digestDecisionBody(body, input.crypto);
  return validateCertifiedCollectiveTrustDecisionV1(
    {
      ...body,
      decisionId: `collective-trust-decision:${decisionDigest.slice(7)}`,
      decisionDigest,
    },
    input.crypto,
  );
}

export async function validateCertifiedCollectiveTrustDecisionV1(
  value: unknown,
  crypto?: Crypto,
): Promise<CertifiedCollectiveTrustDecisionV1> {
  exact(value, DECISION_KEYS, "certified collective trust decision");
  const decision = value as unknown as CertifiedCollectiveTrustDecisionV1;
  if (decision.schemaVersion !== 1) invalid("decision schema is invalid");
  for (const key of [
    "decisionId",
    "candidateId",
    "tenantId",
    "policyId",
  ] as const)
    identifier(decision[key], key);
  for (const key of [
    "decisionDigest",
    "candidateDigest",
    "membershipConfigurationDigest",
    "sourceCommitDigest",
  ] as const)
    digest(decision[key], key);
  for (const key of [
    "subjectDigest",
    "scopeDigest",
    "policyDigest",
    "profileDigest",
    "fusionDecisionDigest",
    "eligibilityDecisionDigest",
    "evidenceSetDigest",
  ] as const)
    trustDigest(decision[key], key);
  nullableTrustDigest(
    decision.recoveryDecisionDigest,
    "recoveryDecisionDigest",
  );
  nullableDigest(
    decision.previousCertifiedDecisionDigest,
    "previousCertifiedDecisionDigest",
  );
  if (!DISPOSITIONS.includes(decision.disposition))
    invalid("decision disposition is invalid");
  if (
    (decision.disposition === "recovery_candidate") !==
    (decision.recoveryDecisionDigest !== null)
  )
    invalid("decision recovery binding is invalid");
  safeInteger(decision.policyVersion, "policyVersion", 1);
  safeInteger(decision.membershipEpoch, "membershipEpoch", 1);
  safeInteger(decision.observedAtLogicalMs, "observedAtLogicalMs");
  safeInteger(decision.certifiedAtLogicalMs, "certifiedAtLogicalMs");
  safeInteger(decision.validUntilLogicalMs, "validUntilLogicalMs", 1);
  if (
    decision.certifiedAtLogicalMs < decision.observedAtLogicalMs ||
    decision.validUntilLogicalMs <= decision.certifiedAtLogicalMs
  )
    invalid("decision validity window is invalid");
  const witnesses = sortedIdentifiers(
    decision.witnessPeerIds,
    "witnessPeerIds",
  );
  if (witnesses.length === 0) invalid("decision witnesses are empty");
  await validateCollectiveTrustCandidateV1(
    {
      schemaVersion: 1,
      candidateId: decision.candidateId,
      candidateDigest: decision.candidateDigest,
      tenantId: decision.tenantId,
      subjectDigest: decision.subjectDigest,
      scopeDigest: decision.scopeDigest,
      policyId: decision.policyId,
      policyVersion: decision.policyVersion,
      policyDigest: decision.policyDigest,
      profileDigest: decision.profileDigest,
      fusionDecisionDigest: decision.fusionDecisionDigest,
      eligibilityDecisionDigest: decision.eligibilityDecisionDigest,
      evidenceSetDigest: decision.evidenceSetDigest,
      recoveryDecisionDigest: decision.recoveryDecisionDigest,
      disposition: decision.disposition,
      previousCertifiedDecisionDigest: decision.previousCertifiedDecisionDigest,
      observedAtLogicalMs: decision.observedAtLogicalMs,
      validUntilLogicalMs: decision.validUntilLogicalMs,
    },
    crypto,
  );
  const { decisionId: _id, decisionDigest: _digest, ...body } = decision;
  const expected = await digestDecisionBody(body, crypto);
  if (
    decision.decisionDigest !== expected ||
    decision.decisionId !== `collective-trust-decision:${expected.slice(7)}`
  )
    invalid("decision digest is invalid");
  return frozen({ ...decision, witnessPeerIds: witnesses });
}

export async function evaluateCollectiveTrustGateV1(input: {
  readonly tenantId: string;
  readonly localDecision: import("@agentplat/trust").TrustEligibilityDecisionV1;
  readonly certifiedDecision: CertifiedCollectiveTrustDecisionV1 | null;
  readonly policy: CollectiveTrustGatePolicyV1;
  readonly logicalTimeMs: number;
  readonly crypto?: Crypto;
}): Promise<CollectiveTrustGateDecisionV1> {
  identifier(input.tenantId, "tenantId");
  exact(input.policy, ["requireCertificate", "schemaVersion"], "gate policy");
  if (
    input.policy.schemaVersion !== 1 ||
    typeof input.policy.requireCertificate !== "boolean"
  )
    invalid("gate policy is invalid");
  safeInteger(input.logicalTimeMs, "logicalTimeMs");
  const local = validateTrustEligibilityDecisionV1(input.localDecision);
  const certified = input.certifiedDecision
    ? await validateCertifiedCollectiveTrustDecisionV1(
        input.certifiedDecision,
        input.crypto,
      )
    : null;
  let disposition: CollectiveTrustGateDispositionV1;
  let reasonCode: CollectiveTrustGateReasonV1;
  if (local.disposition === "unavailable") {
    disposition = "unavailable";
    reasonCode = "local_unavailable";
  } else if (local.disposition === "quarantined") {
    disposition = "quarantined";
    reasonCode = "local_quarantined";
  } else if (local.disposition === "restricted") {
    disposition = "restricted";
    reasonCode = "local_restricted";
  } else if (!certified) {
    disposition = input.policy.requireCertificate ? "unavailable" : "eligible";
    reasonCode = input.policy.requireCertificate
      ? "collective_unavailable"
      : "eligible";
  } else if (
    certified.tenantId !== input.tenantId ||
    certified.subjectDigest !== local.subjectDigest ||
    certified.scopeDigest !== local.scopeDigest ||
    certified.policyDigest !== local.policyDigest
  ) {
    disposition = "unavailable";
    reasonCode = "collective_binding_mismatch";
  } else if (
    input.logicalTimeMs < certified.certifiedAtLogicalMs ||
    input.logicalTimeMs >= certified.validUntilLogicalMs
  ) {
    disposition = input.policy.requireCertificate ? "unavailable" : "eligible";
    reasonCode = input.policy.requireCertificate
      ? "collective_expired"
      : "eligible";
  } else if (certified.disposition === "quarantined") {
    disposition = "quarantined";
    reasonCode = "collective_quarantined";
  } else if (certified.disposition === "restricted") {
    disposition = "restricted";
    reasonCode = "collective_restricted";
  } else if (certified.disposition === "recovery_candidate") {
    disposition = "restricted";
    reasonCode = "collective_recovery_pending";
  } else {
    disposition = "eligible";
    reasonCode = "eligible";
  }
  const body = {
    schemaVersion: 1 as const,
    tenantId: input.tenantId,
    subjectDigest: local.subjectDigest,
    scopeDigest: local.scopeDigest,
    policyDigest: local.policyDigest,
    localEligibilityDecisionId: local.eligibilityDecisionId,
    localEligibilityDecisionDigest: digestTrustEligibilityDecisionV1(local),
    certifiedDecisionId: certified?.decisionId ?? null,
    certifiedDecisionDigest: certified?.decisionDigest ?? null,
    requireCertificate: input.policy.requireCertificate,
    evaluatedAtLogicalMs: input.logicalTimeMs,
    disposition,
    reasonCode,
  };
  const gateDecisionDigest = await collectiveAgreementDigestV1(
    { domain: "agentplat.collective-trust.gate.v1", value: body },
    input.crypto,
  );
  return validateCollectiveTrustGateDecisionV1(
    {
      ...body,
      gateDecisionId: `collective-trust-gate:${gateDecisionDigest.slice(7)}`,
      gateDecisionDigest,
    },
    input.crypto,
  );
}

export async function validateCollectiveTrustGateDecisionV1(
  value: unknown,
  crypto?: Crypto,
): Promise<CollectiveTrustGateDecisionV1> {
  exact(value, GATE_KEYS, "collective trust gate decision");
  const gate = value as unknown as CollectiveTrustGateDecisionV1;
  if (gate.schemaVersion !== 1) invalid("gate schema is invalid");
  for (const key of [
    "gateDecisionId",
    "tenantId",
    "localEligibilityDecisionId",
  ] as const)
    identifier(gate[key], key);
  digest(gate.gateDecisionDigest, "gateDecisionDigest");
  for (const key of [
    "subjectDigest",
    "scopeDigest",
    "policyDigest",
    "localEligibilityDecisionDigest",
  ] as const)
    trustDigest(gate[key], key);
  nullableIdentifier(gate.certifiedDecisionId, "certifiedDecisionId");
  nullableDigest(gate.certifiedDecisionDigest, "certifiedDecisionDigest");
  if (
    (gate.certifiedDecisionId === null) !==
    (gate.certifiedDecisionDigest === null)
  )
    invalid("gate certificate binding is invalid");
  if (typeof gate.requireCertificate !== "boolean")
    invalid("gate requirement is invalid");
  safeInteger(gate.evaluatedAtLogicalMs, "evaluatedAtLogicalMs");
  if (!GATE_DISPOSITIONS.includes(gate.disposition))
    invalid("gate disposition is invalid");
  if (!GATE_REASONS.includes(gate.reasonCode))
    invalid("gate reason is invalid");
  const { gateDecisionId: _id, gateDecisionDigest: _digest, ...body } = gate;
  const expected = await collectiveAgreementDigestV1(
    { domain: "agentplat.collective-trust.gate.v1", value: body },
    crypto,
  );
  if (
    gate.gateDecisionDigest !== expected ||
    gate.gateDecisionId !== `collective-trust-gate:${expected.slice(7)}`
  )
    invalid("gate digest is invalid");
  return frozen(gate);
}

export function collectiveTrustSlotIdV1(value: {
  readonly subjectDigest: string;
  readonly scopeDigest: string;
  readonly policyDigest: string;
}): string {
  trustDigest(value.subjectDigest, "subjectDigest");
  trustDigest(value.scopeDigest, "scopeDigest");
  trustDigest(value.policyDigest, "policyDigest");
  return `trust.${value.subjectDigest.slice(0, 20)}.${value.scopeDigest.slice(0, 20)}.${value.policyDigest.slice(0, 20)}`;
}

async function digestCandidateBody(value: unknown, crypto?: Crypto) {
  return collectiveAgreementDigestV1(
    { domain: "agentplat.collective-trust.candidate.v1", value },
    crypto,
  );
}

async function digestDecisionBody(value: unknown, crypto?: Crypto) {
  return collectiveAgreementDigestV1(
    { domain: "agentplat.collective-trust.decision.v1", value },
    crypto,
  );
}

function exact(value: unknown, keys: readonly string[], label: string): void {
  if (
    !plain(value) ||
    Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")
  )
    invalid(`${label} shape is invalid`);
}

function allowed(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  label: string,
): void {
  if (!plain(value)) invalid(`${label} shape is invalid`);
  const actual = Object.keys(value);
  if (
    actual.some((key) => !allowedKeys.includes(key)) ||
    requiredKeys.some((key) => !actual.includes(key))
  )
    invalid(`${label} shape is invalid`);
}

function plain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(
    (descriptor) => "value" in descriptor,
  );
}

function identifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !IDENTIFIER.test(value))
    invalid(`${label} is invalid`);
}

function nullableIdentifier(
  value: unknown,
  label: string,
): asserts value is string | null {
  if (value !== null) identifier(value, label);
}

function digest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !DIGEST.test(value))
    invalid(`${label} is invalid`);
}

function trustDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !TRUST_DIGEST.test(value))
    invalid(`${label} is invalid`);
}

function nullableDigest(
  value: unknown,
  label: string,
): asserts value is string | null {
  if (value !== null) digest(value, label);
}

function nullableTrustDigest(
  value: unknown,
  label: string,
): asserts value is string | null {
  if (value !== null) trustDigest(value, label);
}

function safeInteger(value: unknown, label: string, minimum = 0): void {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    invalid(`${label} is invalid`);
}

function sortedIdentifiers(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) invalid(`${label} is invalid`);
  const result = value.map((item) => {
    identifier(item, label);
    return item;
  });
  if (result.some((item, index) => index > 0 && result[index - 1]! >= item))
    invalid(`${label} must be sorted and unique`);
  return result;
}

function frozen<T>(value: T): T {
  const clone = structuredClone(value);
  const visit = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== "object") return;
    for (const child of Object.values(candidate)) visit(child);
    Object.freeze(candidate);
  };
  visit(clone);
  return clone;
}

function invalid(message: string): never {
  throw new CollectiveTrustConsensusValidationErrorV1(message);
}
