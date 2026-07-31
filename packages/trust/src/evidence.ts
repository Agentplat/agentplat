import type { JsonValue } from "@agentplat/core";
import {
  digestTrustJsonV1,
  sha256TrustBytesV1,
  utf8ByteLengthV1,
} from "./canonical.js";
import type {
  EvidenceAttestationV1,
  EvidenceChallengeV1,
  EvidenceClaimV1,
  EvidenceContentV1,
  EvidenceReferenceV1,
  EvidenceRetractionV1,
  EvidenceScopeV1,
  TrustObservationV1,
  TrustSubjectV1,
} from "./types.js";
import {
  assertExactKeys,
  assertIdentifier,
  assertNullableTrustDigest,
  assertRfc3339OrNull,
  assertSafeInteger,
  assertToken,
  assertTrustDigest,
  TrustValidationError,
  validateEvidenceReferenceV1,
  validateEvidenceScopeV1,
  validateReasonCodeV1,
  validateSortedReferencesV1,
  validateTrustSubjectV1,
} from "./validation.js";

function json(value: unknown): JsonValue {
  return value as JsonValue;
}
function omit<T extends Record<string, unknown>>(
  value: T,
  key: string,
): Record<string, unknown> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}
function assertSource(
  sourceId: unknown,
  sourceKind: unknown,
  causationId: unknown,
): void {
  assertIdentifier(sourceId, "sourceId");
  if (sourceKind !== "local" && sourceKind !== "peer")
    throw new TrustValidationError("sourceKind is invalid");
  if (causationId !== null) assertIdentifier(causationId, "causationId");
}
function assertDigestId(
  value: unknown,
  prefix: string,
  digest: string,
  label: string,
): void {
  if (value !== `${prefix}:${digest}`)
    throw new TrustValidationError(`${label} does not match its digest`);
}
export function digestScopeV1(scope: EvidenceScopeV1): string {
  return digestTrustJsonV1("scope", json(scope));
}
export function digestSubjectV1(subject: TrustSubjectV1): string {
  return digestTrustJsonV1("subject", json(subject));
}
export function digestRootBasisV1(
  references: readonly EvidenceReferenceV1[],
): string {
  return digestTrustJsonV1("root-basis", json(references));
}
export function digestClaimRelationV1(
  claim: Pick<
    EvidenceClaimV1,
    | "sourceId"
    | "sourceKind"
    | "subject"
    | "scope"
    | "criterionId"
    | "rootBasisDigest"
  >,
): string {
  return digestTrustJsonV1(
    "claim-relation",
    json({
      sourceId: claim.sourceId,
      sourceKind: claim.sourceKind,
      subjectDigest: digestSubjectV1(claim.subject),
      scopeDigest: digestScopeV1(claim.scope),
      criterionId: claim.criterionId,
      rootBasisDigest: claim.rootBasisDigest,
    }),
  );
}
export function digestAttestationRelationV1(
  record: Pick<
    EvidenceAttestationV1,
    "sourceId" | "sourceKind" | "claimId" | "claimDigest"
  >,
): string {
  return digestTrustJsonV1(
    "attestation-relation",
    json({
      sourceId: record.sourceId,
      sourceKind: record.sourceKind,
      claimId: record.claimId,
      claimDigest: record.claimDigest,
    }),
  );
}
export function digestChallengeRelationV1(
  record: Pick<
    EvidenceChallengeV1,
    "sourceId" | "sourceKind" | "targetKind" | "targetId" | "targetDigest"
  >,
): string {
  return digestTrustJsonV1(
    "challenge-relation",
    json({
      sourceId: record.sourceId,
      sourceKind: record.sourceKind,
      targetKind: record.targetKind,
      targetId: record.targetId,
      targetDigest: record.targetDigest,
    }),
  );
}
export function digestRetractionRelationV1(
  record: Pick<
    EvidenceRetractionV1,
    "sourceId" | "sourceKind" | "targetKind" | "targetId" | "targetDigest"
  >,
): string {
  return digestTrustJsonV1(
    "retraction-relation",
    json({
      sourceId: record.sourceId,
      sourceKind: record.sourceKind,
      targetKind: record.targetKind,
      targetId: record.targetId,
      targetDigest: record.targetDigest,
    }),
  );
}
export function validateEvidenceContentV1(value: unknown): EvidenceContentV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TrustValidationError("content is invalid");
  const content = value as Record<string, unknown>;
  if (content.kind === "inline_summary") {
    assertExactKeys(
      content,
      ["kind", "mediaType", "summary", "contentDigest", "encodedBytes"],
      "content",
    );
    assertToken(content.mediaType, "mediaType");
    if (typeof content.summary !== "string")
      throw new TrustValidationError("summary is invalid");
    assertTrustDigest(content.contentDigest, "contentDigest");
    assertSafeInteger(content.encodedBytes, "encodedBytes");
    const bytes = utf8ByteLengthV1(content.summary);
    if (
      bytes !== content.encodedBytes ||
      sha256TrustBytesV1(new TextEncoder().encode(content.summary)) !==
        content.contentDigest
    )
      throw new TrustValidationError(
        "inline content does not match its digest",
      );
    return content as unknown as EvidenceContentV1;
  }
  if (content.kind === "reference") {
    assertExactKeys(
      content,
      ["kind", "mediaType", "reference", "contentDigest", "encodedBytes"],
      "content",
    );
    assertToken(content.mediaType, "mediaType");
    const reference = validateEvidenceReferenceV1(content.reference);
    if (reference.kind === "evidence")
      throw new TrustValidationError(
        "evidence references cannot contain content bytes",
      );
    assertTrustDigest(content.contentDigest, "contentDigest");
    assertSafeInteger(content.encodedBytes, "encodedBytes");
    return {
      kind: "reference",
      mediaType: content.mediaType as string,
      reference,
      contentDigest: content.contentDigest as string,
      encodedBytes: content.encodedBytes as number,
    };
  }
  throw new TrustValidationError("content kind is invalid");
}
function validateClaimFields(value: unknown): EvidenceClaimV1 {
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "claimId",
      "claimRelationDigest",
      "rootBasisDigest",
      "sourceId",
      "sourceKind",
      "causationId",
      "subject",
      "scope",
      "criterionId",
      "outcome",
      "assertionDigest",
      "content",
      "basisReferences",
      "observedAt",
    ],
    "claim",
  );
  const claim = value as Record<string, unknown>;
  if (claim.schemaVersion !== 1)
    throw new TrustValidationError("claim schema is invalid");
  assertSource(claim.sourceId, claim.sourceKind, claim.causationId);
  const subject = validateTrustSubjectV1(claim.subject),
    scope = validateEvidenceScopeV1(claim.scope);
  assertToken(claim.criterionId, "criterionId");
  if (
    !["satisfied", "violated", "inconclusive"].includes(claim.outcome as string)
  )
    throw new TrustValidationError("claim outcome is invalid");
  assertTrustDigest(claim.claimRelationDigest, "claimRelationDigest");
  assertTrustDigest(claim.rootBasisDigest, "rootBasisDigest");
  assertTrustDigest(claim.assertionDigest, "assertionDigest");
  const content =
    claim.content === null ? null : validateEvidenceContentV1(claim.content);
  const references = validateSortedReferencesV1(
    claim.basisReferences,
    "basisReferences",
  );
  assertRfc3339OrNull(claim.observedAt, "observedAt");
  return {
    ...claim,
    subject,
    scope,
    content,
    basisReferences: references,
  } as EvidenceClaimV1;
}
export function createEvidenceClaimV1(
  input: Omit<
    EvidenceClaimV1,
    "claimId" | "claimRelationDigest" | "rootBasisDigest" | "assertionDigest"
  >,
): EvidenceClaimV1 {
  const subject = validateTrustSubjectV1(input.subject),
    scope = validateEvidenceScopeV1(input.scope),
    refs = validateSortedReferencesV1(input.basisReferences, "basisReferences");
  const content =
    input.content === null ? null : validateEvidenceContentV1(input.content);
  const rootBasisDigest = digestRootBasisV1(refs);
  const assertionDigest = digestTrustJsonV1(
    "assertion",
    json({
      subject,
      scope,
      criterionId: input.criterionId,
      outcome: input.outcome,
      contentDigest: content?.contentDigest ?? null,
      basisReferences: refs,
    }),
  );
  const core = {
    ...input,
    subject,
    scope,
    content,
    basisReferences: refs,
    rootBasisDigest,
  };
  const claimRelationDigest = digestClaimRelationV1(core);
  const withoutId = { ...core, claimRelationDigest, assertionDigest };
  const digest = digestTrustJsonV1("claim", json(withoutId));
  return validateEvidenceClaimV1({ ...withoutId, claimId: `claim:${digest}` });
}
export function validateEvidenceClaimV1(value: unknown): EvidenceClaimV1 {
  const claim = validateClaimFields(value);
  if (claim.rootBasisDigest !== digestRootBasisV1(claim.basisReferences))
    throw new TrustValidationError("rootBasisDigest does not match");
  const assertion = digestTrustJsonV1(
    "assertion",
    json({
      subject: claim.subject,
      scope: claim.scope,
      criterionId: claim.criterionId,
      outcome: claim.outcome,
      contentDigest: claim.content?.contentDigest ?? null,
      basisReferences: claim.basisReferences,
    }),
  );
  if (
    claim.assertionDigest !== assertion ||
    claim.claimRelationDigest !== digestClaimRelationV1(claim)
  )
    throw new TrustValidationError("claim derived digest does not match");
  const digest = digestTrustJsonV1(
    "claim",
    json(omit(claim as unknown as Record<string, unknown>, "claimId")),
  );
  assertDigestId(claim.claimId, "claim", digest, "claimId");
  return claim;
}
function validateRelationship<
  T extends EvidenceAttestationV1 | EvidenceChallengeV1 | EvidenceRetractionV1,
>(value: unknown, kind: "attestation" | "challenge" | "retraction"): T {
  const layouts = {
    attestation: [
      "schemaVersion",
      "attestationId",
      "attestationRelationDigest",
      "sourceId",
      "sourceKind",
      "causationId",
      "scope",
      "claimId",
      "claimDigest",
      "disposition",
      "confidenceBasisPoints",
      "basisReferences",
      "observedAt",
    ],
    challenge: [
      "schemaVersion",
      "challengeId",
      "challengeRelationDigest",
      "sourceId",
      "sourceKind",
      "causationId",
      "scope",
      "targetKind",
      "targetId",
      "targetDigest",
      "reasonCode",
      "basisReferences",
      "observedAt",
    ],
    retraction: [
      "schemaVersion",
      "retractionId",
      "retractionRelationDigest",
      "sourceId",
      "sourceKind",
      "causationId",
      "scope",
      "targetKind",
      "targetId",
      "targetDigest",
      "reasonCode",
      "observedAt",
    ],
  } as const;
  assertExactKeys(value, layouts[kind], kind);
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1)
    throw new TrustValidationError(`${kind} schema is invalid`);
  assertSource(record.sourceId, record.sourceKind, record.causationId);
  const scope = validateEvidenceScopeV1(record.scope);
  assertRfc3339OrNull(record.observedAt, "observedAt");
  if (kind === "attestation") {
    assertIdentifier(record.claimId, "claimId");
    assertTrustDigest(record.claimDigest, "claimDigest");
    if (
      !["support", "contradict", "inconclusive"].includes(
        record.disposition as string,
      )
    )
      throw new TrustValidationError("attestation disposition is invalid");
    assertSafeInteger(record.confidenceBasisPoints, "confidenceBasisPoints");
    if ((record.confidenceBasisPoints as number) > 10_000)
      throw new TrustValidationError("attestation confidence is invalid");
    const refs = validateSortedReferencesV1(
      record.basisReferences,
      "basisReferences",
    );
    assertTrustDigest(
      record.attestationRelationDigest,
      "attestationRelationDigest",
    );
    const result = {
      ...record,
      scope,
      basisReferences: refs,
    } as EvidenceAttestationV1;
    if (
      result.attestationRelationDigest !== digestAttestationRelationV1(result)
    )
      throw new TrustValidationError("attestation relation does not match");
    const digest = digestTrustJsonV1(
      "attestation",
      json(omit(result as unknown as Record<string, unknown>, "attestationId")),
    );
    assertDigestId(
      result.attestationId,
      "attestation",
      digest,
      "attestationId",
    );
    return result as T;
  }
  if (record.targetKind !== "claim" && record.targetKind !== "attestation")
    throw new TrustValidationError(`${kind} target kind is invalid`);
  assertIdentifier(record.targetId, "targetId");
  assertTrustDigest(record.targetDigest, "targetDigest");
  validateReasonCodeV1(record.reasonCode);
  if (kind === "challenge") {
    const refs = validateSortedReferencesV1(
      record.basisReferences,
      "basisReferences",
      true,
    );
    assertTrustDigest(
      record.challengeRelationDigest,
      "challengeRelationDigest",
    );
    const result = {
      ...record,
      scope,
      basisReferences: refs,
    } as EvidenceChallengeV1;
    if (result.challengeRelationDigest !== digestChallengeRelationV1(result))
      throw new TrustValidationError("challenge relation does not match");
    const digest = digestTrustJsonV1(
      "challenge",
      json(omit(result as unknown as Record<string, unknown>, "challengeId")),
    );
    assertDigestId(result.challengeId, "challenge", digest, "challengeId");
    return result as T;
  }
  assertTrustDigest(
    record.retractionRelationDigest,
    "retractionRelationDigest",
  );
  const result = { ...record, scope } as EvidenceRetractionV1;
  if (result.retractionRelationDigest !== digestRetractionRelationV1(result))
    throw new TrustValidationError("retraction relation does not match");
  const digest = digestTrustJsonV1(
    "retraction",
    json(omit(result as unknown as Record<string, unknown>, "retractionId")),
  );
  assertDigestId(result.retractionId, "retraction", digest, "retractionId");
  return result as T;
}
export function validateEvidenceAttestationV1(
  value: unknown,
): EvidenceAttestationV1 {
  return validateRelationship<EvidenceAttestationV1>(value, "attestation");
}
export function validateEvidenceChallengeV1(
  value: unknown,
): EvidenceChallengeV1 {
  return validateRelationship<EvidenceChallengeV1>(value, "challenge");
}
export function validateEvidenceRetractionV1(
  value: unknown,
): EvidenceRetractionV1 {
  return validateRelationship<EvidenceRetractionV1>(value, "retraction");
}
export function createEvidenceAttestationV1(
  input: Omit<
    EvidenceAttestationV1,
    "attestationId" | "attestationRelationDigest"
  >,
): EvidenceAttestationV1 {
  const relation = digestAttestationRelationV1(input);
  const body = { ...input, attestationRelationDigest: relation };
  return validateEvidenceAttestationV1({
    ...body,
    attestationId: `attestation:${digestTrustJsonV1("attestation", json(body))}`,
  });
}
export function createEvidenceChallengeV1(
  input: Omit<EvidenceChallengeV1, "challengeId" | "challengeRelationDigest">,
): EvidenceChallengeV1 {
  const relation = digestChallengeRelationV1(input);
  const body = { ...input, challengeRelationDigest: relation };
  return validateEvidenceChallengeV1({
    ...body,
    challengeId: `challenge:${digestTrustJsonV1("challenge", json(body))}`,
  });
}
export function createEvidenceRetractionV1(
  input: Omit<
    EvidenceRetractionV1,
    "retractionId" | "retractionRelationDigest"
  >,
): EvidenceRetractionV1 {
  const relation = digestRetractionRelationV1(input);
  const body = { ...input, retractionRelationDigest: relation };
  return validateEvidenceRetractionV1({
    ...body,
    retractionId: `retraction:${digestTrustJsonV1("retraction", json(body))}`,
  });
}

function validateSortedIdentifiers(
  value: unknown,
  label: string,
): readonly string[] {
  if (!Array.isArray(value))
    throw new TrustValidationError(`${label} is invalid`);
  const identifiers = value.map((item) => {
    assertIdentifier(item, label);
    return item;
  });
  if (
    identifiers.some(
      (item, index) => index > 0 && identifiers[index - 1] >= item,
    )
  )
    throw new TrustValidationError(`${label} must be sorted and unique`);
  return identifiers;
}

function validateSortedReasonCodes(
  value: unknown,
): readonly TrustObservationV1["reasonCodes"][number][] {
  if (!Array.isArray(value))
    throw new TrustValidationError("reasonCodes is invalid");
  const codes = value.map(validateReasonCodeV1);
  if (codes.some((item, index) => index > 0 && codes[index - 1] >= item))
    throw new TrustValidationError("reasonCodes must be sorted and unique");
  return codes;
}

export function createTrustObservationV1(
  input: Omit<TrustObservationV1, "observationId">,
): TrustObservationV1 {
  const body = validateTrustObservationFields({
    ...input,
    observationId: "pending",
  });
  const { observationId: _ignored, ...withoutId } = body;
  return validateTrustObservationV1({
    ...withoutId,
    observationId: `observation:${digestTrustJsonV1("observation", json(withoutId))}`,
  });
}

function validateTrustObservationFields(value: unknown): TrustObservationV1 {
  assertExactKeys(
    value,
    [
      "schemaVersion",
      "observationId",
      "observerId",
      "observerKind",
      "causationId",
      "subject",
      "scope",
      "policyId",
      "policyVersion",
      "policyDigest",
      "profileDigest",
      "fusionDecisionDigest",
      "dimensionId",
      "scoreBand",
      "uncertaintyBand",
      "disposition",
      "evidenceIds",
      "observedAt",
      "validUntil",
      "reasonCodes",
    ],
    "observation",
  );
  const observation = value as Record<string, unknown>;
  if (observation.schemaVersion !== 1)
    throw new TrustValidationError("observation schema is invalid");
  assertIdentifier(observation.observerId, "observerId");
  if (
    observation.observerKind !== "local" &&
    observation.observerKind !== "peer"
  )
    throw new TrustValidationError("observerKind is invalid");
  if (observation.causationId !== null)
    assertIdentifier(observation.causationId, "causationId");
  const subject = validateTrustSubjectV1(observation.subject);
  const scope = validateEvidenceScopeV1(observation.scope);
  assertIdentifier(observation.policyId, "policyId");
  assertSafeInteger(observation.policyVersion, "policyVersion", 1);
  for (const key of [
    "policyDigest",
    "profileDigest",
    "fusionDecisionDigest",
  ] as const)
    assertTrustDigest(observation[key], key);
  assertToken(observation.dimensionId, "dimensionId");
  if (
    !["unknown", "low", "medium", "high"].includes(
      observation.scoreBand as string,
    )
  )
    throw new TrustValidationError("scoreBand is invalid");
  if (
    !["low", "medium", "high"].includes(observation.uncertaintyBand as string)
  )
    throw new TrustValidationError("uncertaintyBand is invalid");
  if (
    !["eligible", "restricted", "quarantined", "unavailable"].includes(
      observation.disposition as string,
    )
  )
    throw new TrustValidationError("disposition is invalid");
  const evidenceIds = validateSortedIdentifiers(
    observation.evidenceIds,
    "evidenceIds",
  );
  const reasonCodes = validateSortedReasonCodes(observation.reasonCodes);
  assertRfc3339OrNull(observation.observedAt, "observedAt");
  assertRfc3339OrNull(observation.validUntil, "validUntil");
  if (
    observation.observedAt === null ||
    observation.validUntil === null ||
    Date.parse(observation.validUntil as string) <=
      Date.parse(observation.observedAt as string)
  )
    throw new TrustValidationError("observation validity is invalid");
  return {
    ...observation,
    subject,
    scope,
    evidenceIds,
    reasonCodes,
  } as unknown as TrustObservationV1;
}

export function validateTrustObservationV1(value: unknown): TrustObservationV1 {
  const observation = validateTrustObservationFields(value);
  const { observationId, ...withoutId } = observation;
  assertDigestId(
    observationId,
    "observation",
    digestTrustJsonV1("observation", json(withoutId)),
    "observationId",
  );
  return observation;
}
