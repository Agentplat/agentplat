import type { AgentPlatID } from "@agentplat/core";
import type { PlanningDigestV1 } from "@agentplat/collective-planning";

import { compromiseRecoveryDigestV1 } from "./compromise-aware-recovery-validation.js";

export const COMPROMISE_LIFECYCLE_FORMAT_V1 =
  "application/vnd.agentplat.compromise-lifecycle.v1+json" as const;

export type CompromiseLifecycleStatusV1 =
  | "healthy"
  | "suspicious"
  | "restricted"
  | "isolated"
  | "recovered"
  | "expelled";

export interface CompromiseLifecycleEvidenceV1 {
  readonly evidenceId: AgentPlatID;
  readonly evidenceDigest: PlanningDigestV1;
  readonly sourceId: AgentPlatID;
  readonly independenceGroupId: AgentPlatID;
  readonly kind:
    | "credibility_assessment"
    | "quarantine_record"
    | "recovery_certificate"
    | "integrity_attestation"
    | "operator_decision";
  readonly observedAtLogicalMs: number;
}

export interface CompromiseLifecyclePolicyV1 {
  readonly policyId: AgentPlatID;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly evidenceThresholdByStatus: Readonly<Record<
    Exclude<CompromiseLifecycleStatusV1, "healthy">,
    number
  >>;
  readonly maximumEvidencePerTransition: number;
}

export interface CompromiseLifecycleRevocationReceiptV1 {
  readonly receiptId: AgentPlatID;
  readonly revokedSessionIds: readonly AgentPlatID[];
  readonly revokedCredentialDigests: readonly PlanningDigestV1[];
  readonly revokedRoleIds: readonly AgentPlatID[];
  readonly revokedMandateIds: readonly AgentPlatID[];
  readonly revokedEffectIds: readonly AgentPlatID[];
  readonly appliedAtLogicalMs: number;
  readonly receiptDigest: PlanningDigestV1;
}

export interface CompromiseLifecycleRecoveryReceiptV1 {
  readonly receiptId: AgentPlatID;
  readonly recoveryCertificateDigest: PlanningDigestV1;
  readonly priorCredentialEpoch: number;
  readonly credentialEpoch: number;
  readonly authorityAttenuationBasisPoints: number;
  readonly appliedAtLogicalMs: number;
  readonly receiptDigest: PlanningDigestV1;
}

export interface CompromiseLifecycleTransitionV1 {
  readonly transitionId: AgentPlatID;
  readonly incidentId: AgentPlatID;
  readonly subjectPeerId: AgentPlatID;
  readonly from: CompromiseLifecycleStatusV1;
  readonly to: CompromiseLifecycleStatusV1;
  readonly priorEpoch: number;
  readonly epoch: number;
  readonly reasonCode: string;
  readonly evidence: readonly CompromiseLifecycleEvidenceV1[];
  readonly evidenceSetDigest: PlanningDigestV1;
  readonly policyDigest: PlanningDigestV1;
  readonly revocation: CompromiseLifecycleRevocationReceiptV1 | null;
  readonly recovery: CompromiseLifecycleRecoveryReceiptV1 | null;
  readonly decidedAtLogicalMs: number;
  readonly predecessorTransitionDigest: PlanningDigestV1 | null;
  readonly transitionDigest: PlanningDigestV1;
}

export interface CompromiseLifecycleStateV1 {
  readonly format: typeof COMPROMISE_LIFECYCLE_FORMAT_V1;
  readonly schemaVersion: 1;
  readonly incidentId: AgentPlatID;
  readonly subjectPeerId: AgentPlatID;
  readonly status: CompromiseLifecycleStatusV1;
  readonly epoch: number;
  readonly credentialEpoch: number;
  readonly authorityAttenuationBasisPoints: number;
  readonly transitions: readonly CompromiseLifecycleTransitionV1[];
  readonly revokedCredentialDigests: readonly PlanningDigestV1[];
  readonly stateDigest: PlanningDigestV1;
}

export interface CompromiseLifecycleTransitionRequestV1 {
  readonly transitionId: AgentPlatID;
  readonly to: CompromiseLifecycleStatusV1;
  readonly reasonCode: string;
  readonly evidence: readonly CompromiseLifecycleEvidenceV1[];
  readonly revocation?: CompromiseLifecycleRevocationReceiptV1;
  readonly recovery?: CompromiseLifecycleRecoveryReceiptV1;
  readonly logicalTimeMs: number;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const routes: Readonly<Record<CompromiseLifecycleStatusV1, readonly CompromiseLifecycleStatusV1[]>> = {
  healthy: ["suspicious"],
  suspicious: ["healthy", "restricted"],
  restricted: ["isolated", "recovered"],
  isolated: ["recovered", "expelled"],
  recovered: ["healthy", "suspicious"],
  expelled: [],
};

function fail(message: string): never {
  throw new TypeError(message);
}
function id(value: string, field: string): string {
  if (!ID.test(value)) fail(`${field} is invalid`);
  return value;
}
function digest(value: string, field: string): PlanningDigestV1 {
  if (!DIGEST.test(value)) fail(`${field} is invalid`);
  return value as PlanningDigestV1;
}
function uniqueSorted<T extends string>(values: readonly T[], field: string): readonly T[] {
  const result = [...values].sort();
  if (new Set(result).size !== result.length) fail(`${field} contains duplicates`);
  return Object.freeze(result);
}

export function validateCompromiseLifecyclePolicyV1(
  policy: CompromiseLifecyclePolicyV1,
): CompromiseLifecyclePolicyV1 {
  id(policy.policyId, "policyId");
  if (!Number.isSafeInteger(policy.policyVersion) || policy.policyVersion < 1)
    fail("policyVersion is invalid");
  digest(policy.policyDigest, "policyDigest");
  if (!Number.isSafeInteger(policy.maximumEvidencePerTransition) || policy.maximumEvidencePerTransition < 1)
    fail("maximumEvidencePerTransition is invalid");
  for (const status of ["suspicious", "restricted", "isolated", "recovered", "expelled"] as const) {
    const threshold = policy.evidenceThresholdByStatus[status];
    if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > policy.maximumEvidencePerTransition)
      fail(`evidence threshold for ${status} is invalid`);
  }
  return policy;
}

export async function createInitialCompromiseLifecycleStateV1(input: {
  readonly incidentId: AgentPlatID;
  readonly subjectPeerId: AgentPlatID;
}): Promise<CompromiseLifecycleStateV1> {
  id(input.incidentId, "incidentId");
  id(input.subjectPeerId, "subjectPeerId");
  const base = {
    format: COMPROMISE_LIFECYCLE_FORMAT_V1,
    schemaVersion: 1 as const,
    incidentId: input.incidentId,
    subjectPeerId: input.subjectPeerId,
    status: "healthy" as const,
    epoch: 0,
    credentialEpoch: 0,
    authorityAttenuationBasisPoints: 0,
    transitions: Object.freeze([]) as readonly CompromiseLifecycleTransitionV1[],
    revokedCredentialDigests: Object.freeze([]) as readonly PlanningDigestV1[],
  };
  return Object.freeze({ ...base, stateDigest: await compromiseRecoveryDigestV1("compromise-lifecycle-state", base) });
}

export async function transitionCompromiseLifecycleV1(input: {
  readonly state: CompromiseLifecycleStateV1;
  readonly policy: CompromiseLifecyclePolicyV1;
  readonly request: CompromiseLifecycleTransitionRequestV1;
}): Promise<CompromiseLifecycleStateV1> {
  const { state, request } = input;
  const policy = validateCompromiseLifecyclePolicyV1(input.policy);
  if (!routes[state.status].includes(request.to))
    fail(`transition ${state.status} -> ${request.to} is not allowed`);
  id(request.transitionId, "transitionId");
  id(request.reasonCode, "reasonCode");
  if (!Number.isSafeInteger(request.logicalTimeMs) || request.logicalTimeMs < 0)
    fail("logicalTimeMs is invalid");
  if (request.evidence.length > policy.maximumEvidencePerTransition)
    fail("evidence capacity exceeded");
  const evidence = [...request.evidence].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
  const evidenceIds = new Set<string>();
  const groups = new Set<string>();
  for (const item of evidence) {
    id(item.evidenceId, "evidenceId"); id(item.sourceId, "sourceId"); id(item.independenceGroupId, "independenceGroupId");
    digest(item.evidenceDigest, "evidenceDigest");
    if (!Number.isSafeInteger(item.observedAtLogicalMs) || item.observedAtLogicalMs < 0 || item.observedAtLogicalMs > request.logicalTimeMs)
      fail("evidence logical time is invalid");
    if (evidenceIds.has(item.evidenceId)) fail("evidence is duplicated");
    evidenceIds.add(item.evidenceId); groups.add(item.independenceGroupId);
  }
  if (request.to !== "healthy" && groups.size < policy.evidenceThresholdByStatus[request.to])
    fail("independent evidence threshold is not met");
  const needsRevocation = request.to === "isolated" || request.to === "expelled";
  if (needsRevocation !== (request.revocation !== undefined))
    fail(needsRevocation ? "revocation receipt is required" : "revocation receipt is not allowed");
  const needsRecovery = request.to === "recovered";
  if (needsRecovery !== (request.recovery !== undefined))
    fail(needsRecovery ? "recovery receipt is required" : "recovery receipt is not allowed");
  if (request.recovery) {
    if (request.recovery.priorCredentialEpoch !== state.credentialEpoch || request.recovery.credentialEpoch <= state.credentialEpoch)
      fail("recovery credential epoch does not advance");
    if (request.recovery.authorityAttenuationBasisPoints < 1 || request.recovery.authorityAttenuationBasisPoints > 10_000)
      fail("recovery authority attenuation is invalid");
    digest(request.recovery.recoveryCertificateDigest, "recoveryCertificateDigest");
    digest(request.recovery.receiptDigest, "recovery.receiptDigest");
  }
  if (request.revocation) digest(request.revocation.receiptDigest, "revocation.receiptDigest");
  const evidenceSetDigest = await compromiseRecoveryDigestV1("compromise-lifecycle-evidence-set", evidence);
  const previous = state.transitions.at(-1) ?? null;
  const transitionBase = {
    transitionId: request.transitionId, incidentId: state.incidentId, subjectPeerId: state.subjectPeerId,
    from: state.status, to: request.to, priorEpoch: state.epoch, epoch: state.epoch + 1,
    reasonCode: request.reasonCode, evidence: Object.freeze(evidence), evidenceSetDigest,
    policyDigest: policy.policyDigest, revocation: request.revocation ?? null, recovery: request.recovery ?? null,
    decidedAtLogicalMs: request.logicalTimeMs, predecessorTransitionDigest: previous?.transitionDigest ?? null,
  };
  const transition = Object.freeze({ ...transitionBase, transitionDigest: await compromiseRecoveryDigestV1("compromise-lifecycle-transition", transitionBase) });
  const revoked = uniqueSorted([
    ...state.revokedCredentialDigests,
    ...(request.revocation?.revokedCredentialDigests ?? []),
  ], "revokedCredentialDigests");
  const nextBase = {
    ...state, status: request.to, epoch: state.epoch + 1,
    credentialEpoch: request.recovery?.credentialEpoch ?? state.credentialEpoch,
    authorityAttenuationBasisPoints: request.recovery?.authorityAttenuationBasisPoints ?? state.authorityAttenuationBasisPoints,
    transitions: Object.freeze([...state.transitions, transition]), revokedCredentialDigests: revoked,
  };
  const { stateDigest: _prior, ...digestible } = nextBase;
  return Object.freeze({ ...nextBase, stateDigest: await compromiseRecoveryDigestV1("compromise-lifecycle-state", digestible) });
}

/** Compatibility bridge for existing trust quarantine and recovery outputs. */
export function compromiseLifecycleEvidenceFromTrustV1(input: {
  readonly recordId: AgentPlatID;
  readonly recordDigest: PlanningDigestV1;
  readonly sourceId: AgentPlatID;
  readonly independenceGroupId: AgentPlatID;
  readonly recovered: boolean;
  readonly logicalTimeMs: number;
}): CompromiseLifecycleEvidenceV1 {
  return Object.freeze({
    evidenceId: input.recordId,
    evidenceDigest: input.recordDigest,
    sourceId: input.sourceId,
    independenceGroupId: input.independenceGroupId,
    kind: input.recovered ? "recovery_certificate" : "quarantine_record",
    observedAtLogicalMs: input.logicalTimeMs,
  });
}

/** Existing compromise-aware recovery certificates become lifecycle evidence without translation loss. */
export function compromiseLifecycleEvidenceFromRecoveryV1(input: {
  readonly certificateId: AgentPlatID;
  readonly certificateDigest: PlanningDigestV1;
  readonly sourceId: AgentPlatID;
  readonly independenceGroupId: AgentPlatID;
  readonly issuedAtLogicalMs: number;
}): CompromiseLifecycleEvidenceV1 {
  return Object.freeze({
    evidenceId: input.certificateId,
    evidenceDigest: input.certificateDigest,
    sourceId: input.sourceId,
    independenceGroupId: input.independenceGroupId,
    kind: "recovery_certificate",
    observedAtLogicalMs: input.issuedAtLogicalMs,
  });
}

export function isCredentialReplayBlockedV1(
  state: CompromiseLifecycleStateV1,
  credentialDigest: PlanningDigestV1,
  credentialEpoch: number,
): boolean {
  return credentialEpoch < state.credentialEpoch || state.revokedCredentialDigests.includes(credentialDigest);
}
