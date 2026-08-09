import {
  validateEvidenceFusionDecisionV1,
  validateTrustEligibilityDecisionV1,
  validateTrustProfileV1,
} from "@agentplat/trust";

import { collectiveQuorumDigestV1 } from "./crypto.js";
import {
  type CertifiedMissionContextResolutionV1,
  type MissionContextFusionDispositionV1,
  type MissionContextFusionPolicyV1,
  type MissionContextFusionPortV1,
  type MissionContextFusionRequestV1,
  type MissionContextFusionRuntimeOptionsV1,
} from "./mission-context-fusion-contracts.js";
import {
  createCollectiveTrustCandidateV1,
  validateCertifiedCollectiveTrustDecisionV1,
} from "./trust-consensus-codec.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+-=]{0,255}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;
const TRUST_DIGEST = /^[0-9a-f]{64}$/u;
const RESOLUTION_KEYS = [
  "certifiedAtLogicalMs",
  "certifiedTrustDecisionDigest",
  "conservativeScoreBps",
  "consideredRecordCount",
  "contextReferenceDigest",
  "contextSubjectDigest",
  "disposition",
  "environmentCursor",
  "evidenceSetDigest",
  "fusionDecisionDigest",
  "includedRecordCount",
  "independentSourceGroupCount",
  "membershipConfigurationDigest",
  "membershipEpoch",
  "maximumContradictionPressureBps",
  "maximumUncertaintyBps",
  "observedAtLogicalMs",
  "observerInstanceId",
  "observerPeerId",
  "previousResolutionDigest",
  "profileDigest",
  "requestDigest",
  "requestId",
  "requiredDimensionIds",
  "resolutionDigest",
  "resolutionId",
  "schemaVersion",
  "scope",
  "trustPolicyDigest",
  "trustPolicyId",
  "trustPolicyVersion",
  "validUntilLogicalMs",
  "witnessPeerIds",
] as const;

/** Builds the exact content-addressed request accepted by the fusion runtime. */
export async function createMissionContextFusionRequestV1(
  input: Omit<MissionContextFusionRequestV1, "requestDigest">,
  crypto?: Crypto,
): Promise<MissionContextFusionRequestV1> {
  const body = {
    ...input,
    scope: Object.freeze({ ...input.scope }),
    requiredDimensionIds: Object.freeze([...input.requiredDimensionIds]),
  };
  const requestDigest = await collectiveQuorumDigestV1(
    { domain: "mission-context-request", body },
    crypto,
  );
  return Object.freeze({ ...body, requestDigest });
}

/** Rebuilds the exact content address before a retained resolution is trusted. */
export async function validateCertifiedMissionContextResolutionV1(
  input: unknown,
  crypto?: Crypto,
): Promise<CertifiedMissionContextResolutionV1> {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).sort().join("\0") !==
      [...RESOLUTION_KEYS].sort().join("\0")
  )
    throw new TypeError("mission context resolution shape is invalid");
  const value = input as CertifiedMissionContextResolutionV1;
  if (value.schemaVersion !== 1)
    throw new TypeError("mission context resolution schema is invalid");
  for (const item of [
    value.requestId,
    value.scope.tenantId,
    value.scope.meshId,
    value.scope.missionIntentId,
    value.scope.policyDomainId,
    value.observerPeerId,
    value.observerInstanceId,
    value.environmentCursor,
    value.trustPolicyId,
  ])
    identifier(item);
  for (const item of [
    value.resolutionDigest,
    value.requestDigest,
    value.scope.intentDigest,
    value.contextReferenceDigest,
    value.certifiedTrustDecisionDigest,
    value.membershipConfigurationDigest,
  ])
    digest(item);
  for (const item of [
    value.scope.scopeDigest,
    value.contextSubjectDigest,
    value.evidenceSetDigest,
    value.profileDigest,
    value.fusionDecisionDigest,
    value.trustPolicyDigest,
  ])
    trustDigest(item);
  if (
    value.previousResolutionDigest !== null &&
    !SHA.test(value.previousResolutionDigest)
  )
    throw new TypeError("mission context resolution predecessor is invalid");
  integer(value.scope.intentRevision, 1);
  integer(value.trustPolicyVersion, 1);
  integer(value.membershipEpoch, 1);
  integer(value.observedAtLogicalMs, 0);
  integer(value.certifiedAtLogicalMs, 0);
  integer(value.validUntilLogicalMs, 1);
  integer(value.consideredRecordCount, 0);
  integer(value.includedRecordCount, 0);
  integer(value.independentSourceGroupCount, 0);
  basis(value.conservativeScoreBps);
  basis(value.maximumUncertaintyBps);
  basis(value.maximumContradictionPressureBps);
  if (
    value.includedRecordCount > value.consideredRecordCount ||
    value.certifiedAtLogicalMs < value.observedAtLogicalMs ||
    value.validUntilLogicalMs <= value.certifiedAtLogicalMs
  )
    throw new TypeError("mission context resolution bounds are invalid");
  if (
    !["admitted", "contested", "quarantined", "rejected"].includes(
      value.disposition,
    )
  )
    throw new TypeError("mission context resolution disposition is invalid");
  const requiredDimensionIds = sortedIdentifiers(
    value.requiredDimensionIds,
    "mission context resolution dimensions",
    false,
  );
  const witnessPeerIds = sortedIdentifiers(
    value.witnessPeerIds,
    "mission context resolution witnesses",
    false,
  );
  const scope = Object.freeze({ ...value.scope });
  const body = {
    schemaVersion: 1 as const,
    requestId: value.requestId,
    requestDigest: value.requestDigest,
    scope,
    contextSubjectDigest: value.contextSubjectDigest,
    contextReferenceDigest: value.contextReferenceDigest,
    observerPeerId: value.observerPeerId,
    observerInstanceId: value.observerInstanceId,
    environmentCursor: value.environmentCursor,
    evidenceSetDigest: value.evidenceSetDigest,
    profileDigest: value.profileDigest,
    fusionDecisionDigest: value.fusionDecisionDigest,
    certifiedTrustDecisionDigest: value.certifiedTrustDecisionDigest,
    trustPolicyId: value.trustPolicyId,
    trustPolicyVersion: value.trustPolicyVersion,
    trustPolicyDigest: value.trustPolicyDigest,
    disposition: value.disposition,
    conservativeScoreBps: value.conservativeScoreBps,
    maximumUncertaintyBps: value.maximumUncertaintyBps,
    maximumContradictionPressureBps:
      value.maximumContradictionPressureBps,
    consideredRecordCount: value.consideredRecordCount,
    includedRecordCount: value.includedRecordCount,
    independentSourceGroupCount: value.independentSourceGroupCount,
    requiredDimensionIds,
    witnessPeerIds,
    membershipEpoch: value.membershipEpoch,
    membershipConfigurationDigest: value.membershipConfigurationDigest,
    previousResolutionDigest: value.previousResolutionDigest,
    observedAtLogicalMs: value.observedAtLogicalMs,
    certifiedAtLogicalMs: value.certifiedAtLogicalMs,
    validUntilLogicalMs: value.validUntilLogicalMs,
  };
  const expected = await collectiveQuorumDigestV1(
    { domain: "mission-context-resolution", body },
    crypto,
  );
  if (
    value.resolutionDigest !== expected ||
    value.resolutionId !== `mission-context:${expected.slice(7, 47)}`
  )
    throw new TypeError("mission context resolution digest is invalid");
  return Object.freeze({
    ...body,
    resolutionId: value.resolutionId,
    resolutionDigest: value.resolutionDigest,
  });
}

/** Certifies a local evidence fusion before exposing any context to planning. */
export class MissionContextFusionRuntimeV1 implements MissionContextFusionPortV1 {
  readonly #options: MissionContextFusionRuntimeOptionsV1;
  readonly #policy: MissionContextFusionPolicyV1;

  constructor(options: MissionContextFusionRuntimeOptionsV1) {
    if (
      !options?.certification ||
      typeof options.certification.certify !== "function" ||
      !options.repository ||
      typeof options.repository.head !== "function" ||
      typeof options.repository.get !== "function" ||
      typeof options.repository.save !== "function" ||
      typeof options.clock?.now !== "function" ||
      typeof options.scopeBinding?.verify !== "function"
    )
      throw new TypeError("mission context fusion ports are required");
    this.#policy = validatePolicy(options.policy);
    this.#options = options;
  }

  async resolve(
    raw: MissionContextFusionRequestV1,
  ): Promise<CertifiedMissionContextResolutionV1 | null> {
    const request = await this.#validateRequest(raw);
    const now = this.#now();
    if (
      request.observedAtLogicalMs > now ||
      now >= request.validUntilLogicalMs
    )
      return null;
    if (
      !(await this.#options.scopeBinding.verify({
        scope: request.scope,
        trustScopeDigest: request.fusionDecision.scopeDigest,
        requestDigest: request.requestDigest,
        logicalTimeMs: now,
      }))
    )
      return null;
    const head = await this.#options.repository.head({
      tenantId: request.scope.tenantId,
      missionIntentId: request.scope.missionIntentId,
      contextSubjectDigest: request.contextSubjectDigest,
    });
    if ((head?.resolutionDigest ?? null) !== request.previousResolutionDigest)
      return null;
    if (
      (head?.certifiedTrustDecisionDigest ?? null) !==
      request.previousCertifiedDecisionDigest
    )
      return null;
    const candidate = await createCollectiveTrustCandidateV1({
      tenantId: request.scope.tenantId,
      profile: request.profile,
      fusionDecision: request.fusionDecision,
      eligibilityDecision: request.eligibilityDecision,
      previousCertifiedDecisionDigest:
        request.previousCertifiedDecisionDigest,
      validUntilLogicalMs: request.validUntilLogicalMs,
      crypto: this.#options.crypto,
    });
    const certifiedValue = await this.#options.certification.certify({
      candidate,
      logicalTimeMs: now,
    });
    if (!certifiedValue) return null;
    const certified = await validateCertifiedCollectiveTrustDecisionV1(
      certifiedValue,
      this.#options.crypto,
    );
    if (
      certified.candidateDigest !== candidate.candidateDigest ||
      certified.tenantId !== request.scope.tenantId ||
      certified.subjectDigest !== request.contextSubjectDigest ||
      certified.scopeDigest !== request.scope.scopeDigest ||
      certified.fusionDecisionDigest !==
        request.fusionDecision.fusionDecisionDigest ||
      certified.profileDigest !== request.profile.profileDigest ||
      certified.validUntilLogicalMs !== request.validUntilLogicalMs
    )
      return null;
    const certifiedNow = this.#now(now);
    if (
      certified.certifiedAtLogicalMs < request.observedAtLogicalMs ||
      certified.certifiedAtLogicalMs > certifiedNow ||
      certifiedNow >= certified.validUntilLogicalMs ||
      !(await this.#options.scopeBinding.verify({
        scope: request.scope,
        trustScopeDigest: certified.scopeDigest,
        requestDigest: request.requestDigest,
        logicalTimeMs: certifiedNow,
      }))
    )
      return null;

    const metrics = this.#metrics(request);
    const disposition = this.#disposition(
      certified.disposition,
      metrics.score,
      metrics.uncertainty,
      metrics.contradiction,
      metrics.groups,
    );
    const body = {
      schemaVersion: 1 as const,
      requestId: request.requestId,
      requestDigest: request.requestDigest,
      scope: request.scope,
      contextSubjectDigest: request.contextSubjectDigest,
      contextReferenceDigest: request.contextReferenceDigest,
      observerPeerId: request.observerPeerId,
      observerInstanceId: request.observerInstanceId,
      environmentCursor: request.environmentCursor,
      evidenceSetDigest: request.fusionDecision.inputSetDigest,
      profileDigest: request.profile.profileDigest,
      fusionDecisionDigest: request.fusionDecision.fusionDecisionDigest,
      certifiedTrustDecisionDigest: certified.decisionDigest,
      trustPolicyId: certified.policyId,
      trustPolicyVersion: certified.policyVersion,
      trustPolicyDigest: certified.policyDigest,
      disposition,
      conservativeScoreBps: metrics.score,
      maximumUncertaintyBps: metrics.uncertainty,
      maximumContradictionPressureBps: metrics.contradiction,
      consideredRecordCount:
        request.fusionDecision.consideredRecordIds.length,
      includedRecordCount: request.fusionDecision.includedRecordIds.length,
      independentSourceGroupCount: metrics.groups,
      requiredDimensionIds: request.requiredDimensionIds,
      witnessPeerIds: certified.witnessPeerIds,
      membershipEpoch: certified.membershipEpoch,
      membershipConfigurationDigest:
        certified.membershipConfigurationDigest,
      previousResolutionDigest: request.previousResolutionDigest,
      observedAtLogicalMs: request.observedAtLogicalMs,
      certifiedAtLogicalMs: certified.certifiedAtLogicalMs,
      validUntilLogicalMs: request.validUntilLogicalMs,
    };
    const resolutionDigest = await collectiveQuorumDigestV1(
      { domain: "mission-context-resolution", body },
      this.#options.crypto,
    );
    const resolution = await validateCertifiedMissionContextResolutionV1({
      ...body,
      resolutionId: `mission-context:${resolutionDigest.slice(7, 47)}`,
      resolutionDigest,
    }, this.#options.crypto);
    const saveNow = this.#now(certifiedNow);
    if (
      resolution.certifiedAtLogicalMs > saveNow ||
      saveNow >= resolution.validUntilLogicalMs
    )
      return null;
    const saved = await this.#options.repository.save({
      resolution,
      expectedHeadDigest: request.previousResolutionDigest,
    });
    return saved === "stored" || saved === "duplicate" ? resolution : null;
  }

  async #validateRequest(
    input: MissionContextFusionRequestV1,
  ): Promise<MissionContextFusionRequestV1> {
    if (!input || input.schemaVersion !== 1)
      throw new TypeError("mission context fusion request is invalid");
    for (const value of [
      input.requestId,
      input.scope.tenantId,
      input.scope.meshId,
      input.scope.missionIntentId,
      input.scope.policyDomainId,
      input.observerPeerId,
      input.observerInstanceId,
      input.environmentCursor,
    ])
      identifier(value);
    for (const value of [
      input.scope.intentDigest,
      input.contextReferenceDigest,
      input.requestDigest,
    ])
      digest(value);
    for (const value of [input.scope.scopeDigest, input.contextSubjectDigest])
      trustDigest(value);
    integer(input.scope.intentRevision, 1);
    integer(input.observedAtLogicalMs, 0);
    integer(input.validUntilLogicalMs, 1);
    if (
      input.validUntilLogicalMs <= input.observedAtLogicalMs ||
      input.validUntilLogicalMs - input.observedAtLogicalMs >
        this.#policy.maximumValidityMs
    )
      throw new TypeError("mission context validity window is invalid");
    if (
      input.previousResolutionDigest !== null &&
      !SHA.test(input.previousResolutionDigest)
    )
      throw new TypeError("mission context predecessor is invalid");
    if (
      input.previousCertifiedDecisionDigest !== null &&
      !SHA.test(input.previousCertifiedDecisionDigest)
    )
      throw new TypeError("mission context certified predecessor is invalid");
    if (
      !Array.isArray(input.requiredDimensionIds) ||
      input.requiredDimensionIds.length < 1 ||
      input.requiredDimensionIds.length > 64 ||
      new Set(input.requiredDimensionIds).size !==
        input.requiredDimensionIds.length ||
      input.requiredDimensionIds.some((value, index) => {
        try {
          identifier(value);
          return index > 0 && input.requiredDimensionIds[index - 1]! >= value;
        } catch {
          return true;
        }
      })
    )
      throw new TypeError("mission context dimensions are invalid");
    const fusion = validateEvidenceFusionDecisionV1(input.fusionDecision);
    const profile = validateTrustProfileV1(input.profile);
    const eligibility = validateTrustEligibilityDecisionV1(
      input.eligibilityDecision,
    );
    if (
      fusion.tenantId !== input.scope.tenantId ||
      fusion.scopeDigest !== input.scope.scopeDigest ||
      fusion.subjectDigest !== input.contextSubjectDigest ||
      profile.fusionDecisionDigest !== fusion.fusionDecisionDigest ||
      eligibility.profileDigest !== profile.profileDigest ||
      input.observedAtLogicalMs < eligibility.evaluatedAtLogicalMs ||
      !input.requiredDimensionIds.every((dimensionId) =>
        profile.dimensions.some((dimension) =>
          dimension.dimensionId === dimensionId),
      )
    )
      throw new TypeError("mission context Trust projections are inconsistent");
    const body = { ...input, requestDigest: undefined };
    delete (body as { requestDigest?: string }).requestDigest;
    const expected = await collectiveQuorumDigestV1(
      { domain: "mission-context-request", body },
      this.#options.crypto,
    );
    if (input.requestDigest !== expected)
      throw new TypeError("mission context request digest is invalid");
    return Object.freeze({ ...input, fusionDecision: fusion, profile, eligibilityDecision: eligibility });
  }

  #metrics(request: MissionContextFusionRequestV1): {
    readonly score: number;
    readonly uncertainty: number;
    readonly contradiction: number;
    readonly groups: number;
  } {
    const dimensions = request.profile.dimensions.filter((dimension) =>
      request.requiredDimensionIds.includes(dimension.dimensionId),
    );
    return {
      score: Math.min(...dimensions.map((dimension) => dimension.scoreBasisPoints)),
      uncertainty: Math.max(
        ...dimensions.map((dimension) => dimension.uncertaintyBasisPoints),
      ),
      contradiction: Math.max(
        ...dimensions.map(
          (dimension) => dimension.contradictionPressureBasisPoints,
        ),
      ),
      groups: new Set(
        dimensions.flatMap(
          (dimension) => dimension.claimSourceDependencyGroupIds,
        ),
      ).size,
    };
  }

  #disposition(
    certified: "eligible" | "restricted" | "quarantined" | "recovery_candidate",
    score: number,
    uncertainty: number,
    contradiction: number,
    groups: number,
  ): MissionContextFusionDispositionV1 {
    if (certified === "quarantined") return "quarantined";
    if (certified === "restricted")
      return this.#policy.rejectRestrictedContext ? "rejected" : "contested";
    if (certified === "recovery_candidate") return "contested";
    if (
      score < this.#policy.minimumScoreBps ||
      uncertainty > this.#policy.maximumUncertaintyBps ||
      contradiction > this.#policy.maximumContradictionPressureBps ||
      groups < this.#policy.minimumIndependentSourceGroups
    )
      return "contested";
    return "admitted";
  }

  #now(minimum = 0): number {
    const value = this.#options.clock.now().logicalTimeMs;
    if (!Number.isSafeInteger(value) || value < minimum)
      throw new TypeError("mission context logical clock rolled back");
    return value;
  }
}

function validatePolicy(input: MissionContextFusionPolicyV1): MissionContextFusionPolicyV1 {
  if (!input || input.schemaVersion !== 1) throw new TypeError("mission context policy is invalid");
  identifier(input.policyId);
  integer(input.policyVersion, 1);
  integer(input.minimumIndependentSourceGroups, 1, 1024);
  basis(input.minimumScoreBps);
  basis(input.maximumUncertaintyBps);
  basis(input.maximumContradictionPressureBps);
  if (typeof input.rejectRestrictedContext !== "boolean") throw new TypeError("mission context restriction policy is invalid");
  integer(input.maximumValidityMs, 1, 86_400_000);
  return Object.freeze({ ...input });
}
function identifier(value: unknown): asserts value is string {
  if (typeof value !== "string" || !ID.test(value)) throw new TypeError("mission context identifier is invalid");
}
function digest(value: unknown): asserts value is string {
  if (typeof value !== "string" || !SHA.test(value)) throw new TypeError("mission context digest is invalid");
}
function trustDigest(value: unknown): asserts value is string {
  if (typeof value !== "string" || !TRUST_DIGEST.test(value))
    throw new TypeError("mission context Trust digest is invalid");
}
function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) throw new TypeError("mission context integer is invalid");
}
function basis(value: unknown): asserts value is number { integer(value, 0, 10_000); }
function sortedIdentifiers(
  values: readonly string[],
  label: string,
  allowEmpty: boolean,
): readonly string[] {
  if (
    !Array.isArray(values) ||
    (!allowEmpty && values.length === 0) ||
    values.length > 1024
  )
    throw new TypeError(`${label} are invalid`);
  const sorted = [...values].sort();
  sorted.forEach(identifier);
  if (
    new Set(sorted).size !== sorted.length ||
    sorted.some((item, index) => item !== values[index])
  )
    throw new TypeError(`${label} must be unique and sorted`);
  return Object.freeze(sorted);
}
