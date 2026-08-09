import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import {
  COLLECTIVE_DECISION_CERTIFICATION_MODES_V1,
  COLLECTIVE_DECISION_KINDS_V1,
  COLLECTIVE_DECISION_SCHEMA_VERSION_V1,
  COLLECTIVE_DECISION_STATE_FORMAT_V1,
  type CollectiveDecisionCandidateV1,
  type CollectiveDecisionCertificateV1,
  type CollectiveDecisionCompactedHeadV1,
  type CollectiveDecisionEvidenceV1,
  type CollectiveDecisionKindCountMapV1,
  type CollectiveDecisionModeMapV1,
  type CollectiveDecisionPolicyRecordV1,
  type CollectiveDecisionPolicyV1,
  type CollectiveDecisionScopeV1,
  type CollectiveDecisionStateV1,
  type CollectiveDecisionTrustedEvidenceSourceV1,
  type CollectiveDecisionV1,
} from "./collective-decision-contracts.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const MAX_IDENTIFIER_LENGTH = 256;
const kindSet = new Set<string>(COLLECTIVE_DECISION_KINDS_V1);
const modeSet = new Set<string>(COLLECTIVE_DECISION_CERTIFICATION_MODES_V1);
const policyKeys = [
  "certificationModes",
  "maximumAcceptedHeads",
  "maximumCandidateTtlMs",
  "maximumCertificateTtlMs",
  "maximumCompactedHeads",
  "maximumCommitAttempts",
  "minimumByzantineAttestersByKind",
  "minimumTrustedEvidenceByKind",
  "parentPolicyDigest",
  "policyId",
  "policyVersion",
  "schemaVersion",
  "trustedEvidenceSources",
];
const scopeKeys = [
  "meshId",
  "missionIntentId",
  "objectiveId",
  "policyDomainId",
  "scopeDigest",
  "tenantId",
  "workItemId",
  "workItemRevision",
];
const sourceKeys = [
  "schemaVersion",
  "sourceId",
  "sourceImplementationDigest",
  "sourceVersion",
];
const candidateKeys = [
  "candidateDigest",
  "candidateId",
  "decisionKind",
  "epoch",
  "expiresAtLogicalMs",
  "membershipDigest",
  "membershipMemberIds",
  "payloadDigest",
  "preparedAtLogicalMs",
  "proposerId",
  "schemaVersion",
  "scope",
];
const evidenceKeys = [
  "candidateDigest",
  "evidenceDigest",
  "evidenceId",
  "expiresAtLogicalMs",
  "observedAtLogicalMs",
  "schemaVersion",
  "sourceId",
  "sourceImplementationDigest",
  "sourceVersion",
];
const certificateKeys = [
  "attesterIds",
  "candidateDigest",
  "certificateDigest",
  "certificateId",
  "certificationMode",
  "certificationProofDigest",
  "epoch",
  "evidence",
  "expiresAtLogicalMs",
  "issuedAtLogicalMs",
  "issuerId",
  "membershipDigest",
  "schemaVersion",
  "scopeDigest",
];
const decisionKeys = [
  "acceptedAtLogicalMs",
  "candidate",
  "certificate",
  "committedStateRevision",
  "decisionDigest",
  "decisionId",
  "decisionPlaneId",
  "decisionPlaneVersion",
  "expiresAtLogicalMs",
  "implementationId",
  "policyDigest",
  "policyId",
  "policyVersion",
  "priorStateRevision",
  "schemaVersion",
];
const compactedHeadKeys = [
  "candidateDigest",
  "certificateDigest",
  "certificationProofDigest",
  "committedStateRevision",
  "compactedHeadDigest",
  "decisionDigest",
  "decisionId",
  "decisionKind",
  "epoch",
  "schemaVersion",
  "scopeDigest",
];
const stateKeys = [
  "accepted",
  "compacted",
  "decisionPlaneId",
  "decisionPlaneVersion",
  "format",
  "implementationId",
  "logicalTimeHighWaterMs",
  "policyDigest",
  "policyId",
  "policyVersion",
  "revision",
  "schemaVersion",
  "stateDigest",
  "stateKey",
];

export function createCollectiveDecisionPolicyV1(
  input: CollectiveDecisionPolicyV1,
): CollectiveDecisionPolicyRecordV1 {
  const value = record(input, policyKeys, "collective decision policy");
  schema(value.schemaVersion, "policy");
  const policy = freeze({
    schemaVersion: COLLECTIVE_DECISION_SCHEMA_VERSION_V1,
    policyId: id(value.policyId, "policyId"),
    policyVersion: positive(value.policyVersion, "policyVersion"),
    parentPolicyDigest: nullableDigest(
      value.parentPolicyDigest,
      "parentPolicyDigest",
    ),
    certificationModes: modeMap(value.certificationModes),
    minimumTrustedEvidenceByKind: countMap(
      value.minimumTrustedEvidenceByKind,
      "minimumTrustedEvidenceByKind",
    ),
    minimumByzantineAttestersByKind: countMap(
      value.minimumByzantineAttestersByKind,
      "minimumByzantineAttestersByKind",
    ),
    trustedEvidenceSources: sources(value.trustedEvidenceSources),
    maximumCandidateTtlMs: positive(
      value.maximumCandidateTtlMs,
      "maximumCandidateTtlMs",
    ),
    maximumCertificateTtlMs: positive(
      value.maximumCertificateTtlMs,
      "maximumCertificateTtlMs",
    ),
    maximumAcceptedHeads: positive(
      value.maximumAcceptedHeads,
      "maximumAcceptedHeads",
    ),
    maximumCompactedHeads: integer(
      value.maximumCompactedHeads,
      "maximumCompactedHeads",
      0,
    ),
    maximumCommitAttempts: positive(
      value.maximumCommitAttempts,
      "maximumCommitAttempts",
    ),
  });
  for (const decisionKind of COLLECTIVE_DECISION_KINDS_V1) {
    const certificationMode = policy.certificationModes[decisionKind];
    if (
      certificationMode === "local" &&
      (policy.minimumTrustedEvidenceByKind[decisionKind] !== 0 ||
        policy.minimumByzantineAttestersByKind[decisionKind] !== 0)
    )
      fail(
        "local certification cannot require evidence or agreement attesters",
      );
    if (
      certificationMode === "evidence" &&
      policy.minimumByzantineAttestersByKind[decisionKind] !== 0
    )
      fail("evidence certification cannot require agreement attesters");
    if (
      policy.minimumTrustedEvidenceByKind[decisionKind] >
      policy.trustedEvidenceSources.length
    )
      fail("policy requires more independent evidence sources than it trusts");
  }
  return freeze({
    schemaVersion: 1,
    policy,
    policyDigest: digest("collective-decision-policy", policy),
  });
}

export function validateCollectiveDecisionPolicyV1(
  input: unknown,
): CollectiveDecisionPolicyRecordV1 {
  const value = record(
    input,
    ["policy", "policyDigest", "schemaVersion"],
    "collective decision policy record",
  );
  schema(value.schemaVersion, "policy record");
  const rebuilt = createCollectiveDecisionPolicyV1(
    value.policy as CollectiveDecisionPolicyV1,
  );
  if (value.policyDigest !== rebuilt.policyDigest)
    fail("collective decision policy digest is invalid");
  return rebuilt;
}

export function createCollectiveDecisionScopeV1(
  input: Omit<CollectiveDecisionScopeV1, "scopeDigest">,
): CollectiveDecisionScopeV1 {
  const value = record(
    input,
    scopeKeys.filter((key) => key !== "scopeDigest"),
    "collective decision scope",
  );
  const body = freeze({
    tenantId: id(value.tenantId, "scope.tenantId"),
    meshId: id(value.meshId, "scope.meshId"),
    policyDomainId: id(value.policyDomainId, "scope.policyDomainId"),
    missionIntentId: id(value.missionIntentId, "scope.missionIntentId"),
    objectiveId: id(value.objectiveId, "scope.objectiveId"),
    workItemId: nullableId(value.workItemId, "scope.workItemId"),
    workItemRevision: nullableInteger(
      value.workItemRevision,
      "scope.workItemRevision",
      0,
    ),
  });
  if ((body.workItemId === null) !== (body.workItemRevision === null))
    fail("scope work item binding is inconsistent");
  return freeze({
    ...body,
    scopeDigest: digest("collective-decision-scope", body),
  });
}

export function validateCollectiveDecisionScopeV1(
  input: unknown,
): CollectiveDecisionScopeV1 {
  const value = record(input, scopeKeys, "collective decision scope");
  const body = { ...value };
  delete body.scopeDigest;
  const rebuilt = createCollectiveDecisionScopeV1(
    body as Omit<CollectiveDecisionScopeV1, "scopeDigest">,
  );
  if (value.scopeDigest !== rebuilt.scopeDigest)
    fail("collective decision scope digest is invalid");
  return rebuilt;
}

export function createCollectiveDecisionCandidateV1(
  input: Omit<CollectiveDecisionCandidateV1, "candidateDigest">,
): CollectiveDecisionCandidateV1 {
  const value = record(
    input,
    candidateKeys.filter((key) => key !== "candidateDigest"),
    "collective decision candidate",
  );
  schema(value.schemaVersion, "candidate");
  const membershipMemberIds = identifiers(
    value.membershipMemberIds,
    "candidate.membershipMemberIds",
  );
  const proposerId = id(value.proposerId, "candidate.proposerId");
  if (!membershipMemberIds.includes(proposerId))
    fail("candidate proposer is outside membership");
  const preparedAtLogicalMs = integer(
    value.preparedAtLogicalMs,
    "candidate.preparedAtLogicalMs",
    0,
  );
  const expiresAtLogicalMs = integer(
    value.expiresAtLogicalMs,
    "candidate.expiresAtLogicalMs",
    preparedAtLogicalMs + 1,
  );
  const body = freeze({
    schemaVersion: 1 as const,
    candidateId: id(value.candidateId, "candidateId"),
    decisionKind: kind(value.decisionKind),
    scope: validateCollectiveDecisionScopeV1(value.scope),
    epoch: integer(value.epoch, "candidate.epoch", 0),
    membershipDigest: sha(value.membershipDigest, "candidate.membershipDigest"),
    membershipMemberIds,
    proposerId,
    payloadDigest: sha(value.payloadDigest, "candidate.payloadDigest"),
    preparedAtLogicalMs,
    expiresAtLogicalMs,
  });
  return freeze({
    ...body,
    candidateDigest: digest("collective-decision-candidate", body),
  });
}

export function validateCollectiveDecisionCandidateV1(
  input: unknown,
): CollectiveDecisionCandidateV1 {
  const value = record(input, candidateKeys, "collective decision candidate");
  const body = { ...value };
  delete body.candidateDigest;
  const rebuilt = createCollectiveDecisionCandidateV1(
    body as Omit<CollectiveDecisionCandidateV1, "candidateDigest">,
  );
  if (value.candidateDigest !== rebuilt.candidateDigest)
    fail("collective decision candidate digest is invalid");
  return rebuilt;
}

export function createCollectiveDecisionEvidenceV1(
  input: Omit<CollectiveDecisionEvidenceV1, "evidenceDigest">,
): CollectiveDecisionEvidenceV1 {
  const value = record(
    input,
    evidenceKeys.filter((key) => key !== "evidenceDigest"),
    "collective decision evidence",
  );
  schema(value.schemaVersion, "evidence");
  const observedAtLogicalMs = integer(
    value.observedAtLogicalMs,
    "evidence.observedAtLogicalMs",
    0,
  );
  const body = freeze({
    schemaVersion: 1 as const,
    evidenceId: id(value.evidenceId, "evidenceId"),
    candidateDigest: sha(value.candidateDigest, "evidence.candidateDigest"),
    sourceId: id(value.sourceId, "evidence.sourceId"),
    sourceVersion: positive(value.sourceVersion, "evidence.sourceVersion"),
    sourceImplementationDigest: sha(
      value.sourceImplementationDigest,
      "evidence.sourceImplementationDigest",
    ),
    observedAtLogicalMs,
    expiresAtLogicalMs: integer(
      value.expiresAtLogicalMs,
      "evidence.expiresAtLogicalMs",
      observedAtLogicalMs + 1,
    ),
  });
  return freeze({
    ...body,
    evidenceDigest: digest("collective-decision-evidence", body),
  });
}

export function validateCollectiveDecisionEvidenceV1(
  input: unknown,
): CollectiveDecisionEvidenceV1 {
  const value = record(input, evidenceKeys, "collective decision evidence");
  const body = { ...value };
  delete body.evidenceDigest;
  const rebuilt = createCollectiveDecisionEvidenceV1(
    body as Omit<CollectiveDecisionEvidenceV1, "evidenceDigest">,
  );
  if (value.evidenceDigest !== rebuilt.evidenceDigest)
    fail("collective decision evidence digest is invalid");
  return rebuilt;
}

export function createCollectiveDecisionCertificateV1(
  input: Omit<CollectiveDecisionCertificateV1, "certificateDigest">,
): CollectiveDecisionCertificateV1 {
  const value = record(
    input,
    certificateKeys.filter((key) => key !== "certificateDigest"),
    "collective decision certificate",
  );
  schema(value.schemaVersion, "certificate");
  const issuedAtLogicalMs = integer(
    value.issuedAtLogicalMs,
    "certificate.issuedAtLogicalMs",
    0,
  );
  const body = freeze({
    schemaVersion: 1 as const,
    certificateId: id(value.certificateId, "certificateId"),
    candidateDigest: sha(value.candidateDigest, "certificate.candidateDigest"),
    scopeDigest: sha(value.scopeDigest, "certificate.scopeDigest"),
    epoch: integer(value.epoch, "certificate.epoch", 0),
    membershipDigest: sha(
      value.membershipDigest,
      "certificate.membershipDigest",
    ),
    certificationMode: mode(value.certificationMode),
    issuerId: id(value.issuerId, "certificate.issuerId"),
    attesterIds: identifiers(value.attesterIds, "certificate.attesterIds", 0),
    evidence: evidence(value.evidence),
    certificationProofDigest: nullableDigest(
      value.certificationProofDigest,
      "certificate.certificationProofDigest",
    ),
    issuedAtLogicalMs,
    expiresAtLogicalMs: integer(
      value.expiresAtLogicalMs,
      "certificate.expiresAtLogicalMs",
      issuedAtLogicalMs + 1,
    ),
  });
  if (
    body.certificationMode === "local" &&
    body.certificationProofDigest !== null
  )
    fail("local certification cannot carry an agreement proof digest");
  if (
    body.certificationMode === "byzantine_agreement" &&
    body.certificationProofDigest === null
  )
    fail("Byzantine agreement certification requires a proof digest");
  return freeze({
    ...body,
    certificateDigest: digest("collective-decision-certificate", body),
  });
}

export function validateCollectiveDecisionCertificateV1(
  input: unknown,
): CollectiveDecisionCertificateV1 {
  const value = record(
    input,
    certificateKeys,
    "collective decision certificate",
  );
  const body = { ...value };
  delete body.certificateDigest;
  const rebuilt = createCollectiveDecisionCertificateV1(
    body as Omit<CollectiveDecisionCertificateV1, "certificateDigest">,
  );
  if (value.certificateDigest !== rebuilt.certificateDigest)
    fail("collective decision certificate digest is invalid");
  return rebuilt;
}

export function verifyCollectiveDecisionCertificateV1(input: {
  readonly candidate: CollectiveDecisionCandidateV1;
  readonly certificate: CollectiveDecisionCertificateV1;
  readonly policy: CollectiveDecisionPolicyRecordV1;
  readonly logicalTimeMs: number;
}): CollectiveDecisionCertificateV1 {
  const candidate = validateCollectiveDecisionCandidateV1(input.candidate);
  const certificate = validateCollectiveDecisionCertificateV1(
    input.certificate,
  );
  const policy = validateCollectiveDecisionPolicyV1(input.policy);
  const now = integer(input.logicalTimeMs, "logicalTimeMs", 0);
  if (
    candidate.expiresAtLogicalMs <= now ||
    certificate.expiresAtLogicalMs <= now
  )
    fail("candidate or certificate is expired");
  if (
    certificate.candidateDigest !== candidate.candidateDigest ||
    certificate.scopeDigest !== candidate.scope.scopeDigest ||
    certificate.epoch !== candidate.epoch ||
    certificate.membershipDigest !== candidate.membershipDigest
  )
    fail("certificate binding does not match candidate");
  const requiredMode = policy.policy.certificationModes[candidate.decisionKind];
  if (certificate.certificationMode !== requiredMode)
    fail("certificate mode is not authorized for decision kind");
  if (
    certificate.issuedAtLogicalMs < candidate.preparedAtLogicalMs ||
    certificate.issuedAtLogicalMs > now ||
    certificate.expiresAtLogicalMs > candidate.expiresAtLogicalMs ||
    certificate.expiresAtLogicalMs - certificate.issuedAtLogicalMs >
      policy.policy.maximumCertificateTtlMs
  )
    fail("certificate time bounds are invalid");
  if (!candidate.membershipMemberIds.includes(certificate.issuerId))
    fail("certificate issuer is outside membership");
  const expectedEvidence =
    policy.policy.minimumTrustedEvidenceByKind[candidate.decisionKind];
  if (certificate.evidence.length < expectedEvidence)
    fail("certificate has insufficient trusted evidence");
  const sourceKeysSeen = new Set<string>();
  for (const item of certificate.evidence) {
    if (
      item.candidateDigest !== candidate.candidateDigest ||
      item.expiresAtLogicalMs <= now ||
      item.expiresAtLogicalMs > certificate.expiresAtLogicalMs
    )
      fail("certificate evidence is stale or unbound");
    const sourceKey = `${item.sourceId}\u0000${item.sourceVersion}\u0000${item.sourceImplementationDigest}`;
    if (sourceKeysSeen.has(sourceKey))
      fail("certificate evidence sources must be independent");
    sourceKeysSeen.add(sourceKey);
    if (
      !policy.policy.trustedEvidenceSources.some(
        (source) =>
          source.sourceId === item.sourceId &&
          source.sourceVersion === item.sourceVersion &&
          source.sourceImplementationDigest === item.sourceImplementationDigest,
      )
    )
      fail("certificate evidence source is not trusted by policy");
  }
  if (requiredMode === "local") {
    if (
      certificate.issuerId !== candidate.proposerId ||
      certificate.attesterIds.length !== 0 ||
      certificate.evidence.length !== 0 ||
      certificate.certificationProofDigest !== null
    )
      fail("local certification is invalid");
  } else if (requiredMode === "evidence") {
    if (certificate.attesterIds.length !== 0)
      fail("evidence certification cannot contain agreement attesters");
  } else {
    const minimum =
      policy.policy.minimumByzantineAttestersByKind[candidate.decisionKind];
    if (
      certificate.certificationProofDigest === null ||
      certificate.attesterIds.length < minimum ||
      certificate.attesterIds.some(
        (memberId) => !candidate.membershipMemberIds.includes(memberId),
      )
    )
      fail("Byzantine agreement attesters are invalid");
  }
  return certificate;
}

export function createCollectiveDecisionV1(
  input: Omit<CollectiveDecisionV1, "decisionDigest">,
): CollectiveDecisionV1 {
  const value = record(
    input,
    decisionKeys.filter((key) => key !== "decisionDigest"),
    "collective decision",
  );
  schema(value.schemaVersion, "decision");
  const acceptedAtLogicalMs = integer(
    value.acceptedAtLogicalMs,
    "decision.acceptedAtLogicalMs",
    0,
  );
  const candidate = validateCollectiveDecisionCandidateV1(value.candidate);
  const certificate = validateCollectiveDecisionCertificateV1(
    value.certificate,
  );
  if (value.expiresAtLogicalMs !== certificate.expiresAtLogicalMs)
    fail("decision expiry must equal certificate expiry");
  const priorStateRevision = integer(
    value.priorStateRevision,
    "decision.priorStateRevision",
    0,
  );
  const committedStateRevision = integer(
    value.committedStateRevision,
    "decision.committedStateRevision",
    priorStateRevision + 1,
  );
  if (committedStateRevision !== priorStateRevision + 1)
    fail("decision state revisions are not consecutive");
  const body = freeze({
    schemaVersion: 1 as const,
    decisionId: id(value.decisionId, "decisionId"),
    decisionPlaneId: id(value.decisionPlaneId, "decisionPlaneId"),
    decisionPlaneVersion: positive(
      value.decisionPlaneVersion,
      "decisionPlaneVersion",
    ),
    implementationId: id(value.implementationId, "implementationId"),
    policyId: id(value.policyId, "decision.policyId"),
    policyVersion: positive(value.policyVersion, "decision.policyVersion"),
    policyDigest: sha(value.policyDigest, "decision.policyDigest"),
    candidate,
    certificate,
    acceptedAtLogicalMs,
    expiresAtLogicalMs: integer(
      value.expiresAtLogicalMs,
      "decision.expiresAtLogicalMs",
      acceptedAtLogicalMs + 1,
    ),
    priorStateRevision,
    committedStateRevision,
  });
  return freeze({
    ...body,
    decisionDigest: digest("collective-decision", body),
  });
}

export function validateCollectiveDecisionV1(
  input: unknown,
): CollectiveDecisionV1 {
  const value = record(input, decisionKeys, "collective decision");
  const body = { ...value };
  delete body.decisionDigest;
  const rebuilt = createCollectiveDecisionV1(
    body as Omit<CollectiveDecisionV1, "decisionDigest">,
  );
  if (value.decisionDigest !== rebuilt.decisionDigest)
    fail("collective decision digest is invalid");
  return rebuilt;
}

export function createCollectiveDecisionCompactedHeadV1(
  input: Omit<CollectiveDecisionCompactedHeadV1, "compactedHeadDigest">,
): CollectiveDecisionCompactedHeadV1 {
  const value = record(
    input,
    compactedHeadKeys.filter((key) => key !== "compactedHeadDigest"),
    "collective decision compacted head",
  );
  schema(value.schemaVersion, "compacted head");
  const body = freeze({
    schemaVersion: 1 as const,
    decisionId: id(value.decisionId, "compactedHead.decisionId"),
    scopeDigest: sha(value.scopeDigest, "compactedHead.scopeDigest"),
    decisionKind: kind(value.decisionKind),
    epoch: integer(value.epoch, "compactedHead.epoch", 0),
    candidateDigest: sha(
      value.candidateDigest,
      "compactedHead.candidateDigest",
    ),
    certificateDigest: sha(
      value.certificateDigest,
      "compactedHead.certificateDigest",
    ),
    certificationProofDigest: nullableDigest(
      value.certificationProofDigest,
      "compactedHead.certificationProofDigest",
    ),
    decisionDigest: sha(value.decisionDigest, "compactedHead.decisionDigest"),
    committedStateRevision: positive(
      value.committedStateRevision,
      "compactedHead.committedStateRevision",
    ),
  });
  return freeze({
    ...body,
    compactedHeadDigest: digest("collective-decision-compacted-head", body),
  });
}

export function validateCollectiveDecisionCompactedHeadV1(
  input: unknown,
): CollectiveDecisionCompactedHeadV1 {
  const value = record(
    input,
    compactedHeadKeys,
    "collective decision compacted head",
  );
  const body = { ...value };
  delete body.compactedHeadDigest;
  const rebuilt = createCollectiveDecisionCompactedHeadV1(
    body as Omit<CollectiveDecisionCompactedHeadV1, "compactedHeadDigest">,
  );
  if (value.compactedHeadDigest !== rebuilt.compactedHeadDigest)
    fail("collective decision compacted head digest is invalid");
  return rebuilt;
}

export function createCollectiveDecisionStateV1(
  input: Omit<CollectiveDecisionStateV1, "stateDigest">,
): CollectiveDecisionStateV1 {
  const value = record(
    input,
    stateKeys.filter((key) => key !== "stateDigest"),
    "collective decision state",
  );
  schema(value.schemaVersion, "state");
  if (value.format !== COLLECTIVE_DECISION_STATE_FORMAT_V1)
    fail("collective decision state format is invalid");
  const accepted = decisions(value.accepted);
  const compacted = compactedHeads(value.compacted);
  const slots = new Set<string>();
  for (const current of accepted) {
    const slot = decisionSlotV1(current.candidate);
    if (slots.has(slot)) fail("state contains conflicting accepted decisions");
    slots.add(slot);
  }
  for (const current of compacted) {
    const slot = compactedDecisionSlotV1(current);
    if (slots.has(slot))
      fail("state contains a reopened compacted decision slot");
    slots.add(slot);
  }
  const decisionIds = [
    ...accepted.map((item) => item.decisionId),
    ...compacted.map((item) => item.decisionId),
  ].sort(compare);
  if (
    decisionIds.some(
      (decisionId, index) => index > 0 && decisionIds[index - 1] === decisionId,
    )
  )
    fail("state decision ids must be unique");
  const body = freeze({
    format: COLLECTIVE_DECISION_STATE_FORMAT_V1,
    schemaVersion: 1 as const,
    stateKey: id(value.stateKey, "stateKey"),
    decisionPlaneId: id(value.decisionPlaneId, "decisionPlaneId"),
    decisionPlaneVersion: positive(
      value.decisionPlaneVersion,
      "decisionPlaneVersion",
    ),
    implementationId: id(value.implementationId, "implementationId"),
    policyId: id(value.policyId, "state.policyId"),
    policyVersion: positive(value.policyVersion, "state.policyVersion"),
    policyDigest: sha(value.policyDigest, "state.policyDigest"),
    revision: integer(value.revision, "state.revision", 0),
    logicalTimeHighWaterMs: integer(
      value.logicalTimeHighWaterMs,
      "state.logicalTimeHighWaterMs",
      0,
    ),
    accepted,
    compacted,
  });
  if (
    accepted.some(
      (item) =>
        item.committedStateRevision > body.revision ||
        item.acceptedAtLogicalMs > body.logicalTimeHighWaterMs,
    )
  )
    fail("state acceptance binding is invalid");
  if (accepted.length + compacted.length !== body.revision)
    fail("state revision does not match decision history");
  const committedRevisions = [
    ...accepted.map((item) => item.committedStateRevision),
    ...compacted.map((item) => item.committedStateRevision),
  ].sort((left, right) => left - right);
  if (committedRevisions.some((revision, index) => revision !== index + 1))
    fail("state accepted decision history has a revision gap");
  return freeze({
    ...body,
    stateDigest: digest("collective-decision-state", body),
  });
}

export function validateCollectiveDecisionStateV1(
  input: unknown,
): CollectiveDecisionStateV1 {
  const value = record(input, stateKeys, "collective decision state");
  const body = { ...value };
  delete body.stateDigest;
  const rebuilt = createCollectiveDecisionStateV1(
    body as Omit<CollectiveDecisionStateV1, "stateDigest">,
  );
  if (value.stateDigest !== rebuilt.stateDigest)
    fail("collective decision state digest is invalid");
  return rebuilt;
}

export function decisionSlotV1(
  candidate: CollectiveDecisionCandidateV1,
): string {
  const value = validateCollectiveDecisionCandidateV1(candidate);
  return `${value.scope.scopeDigest}\u0000${value.decisionKind}\u0000${value.epoch}`;
}

export function compactedDecisionSlotV1(
  head: CollectiveDecisionCompactedHeadV1,
): string {
  const value = validateCollectiveDecisionCompactedHeadV1(head);
  return `${value.scopeDigest}\u0000${value.decisionKind}\u0000${value.epoch}`;
}

function modeMap(input: unknown): CollectiveDecisionModeMapV1 {
  const value = record(
    input,
    [...COLLECTIVE_DECISION_KINDS_V1],
    "certificationModes",
  );
  const output: Record<string, string> = {};
  for (const current of COLLECTIVE_DECISION_KINDS_V1)
    output[current] = mode(value[current]);
  return freeze(output) as CollectiveDecisionModeMapV1;
}
function countMap(
  input: unknown,
  label: string,
): CollectiveDecisionKindCountMapV1 {
  const value = record(input, [...COLLECTIVE_DECISION_KINDS_V1], label);
  const output: Record<string, number> = {};
  for (const current of COLLECTIVE_DECISION_KINDS_V1)
    output[current] = integer(value[current], `${label}.${current}`, 0);
  return freeze(output) as CollectiveDecisionKindCountMapV1;
}
function sources(
  input: unknown,
): readonly CollectiveDecisionTrustedEvidenceSourceV1[] {
  if (!Array.isArray(input)) fail("trustedEvidenceSources must be an array");
  const values = input
    .map((item) => {
      const value = record(item, sourceKeys, "trusted evidence source");
      schema(value.schemaVersion, "trusted evidence source");
      return freeze({
        schemaVersion: 1 as const,
        sourceId: id(value.sourceId, "sourceId"),
        sourceVersion: positive(value.sourceVersion, "sourceVersion"),
        sourceImplementationDigest: sha(
          value.sourceImplementationDigest,
          "sourceImplementationDigest",
        ),
      });
    })
    .sort((left, right) => sourceKey(left).localeCompare(sourceKey(right)));
  if (
    values.some(
      (item, index) =>
        index > 0 && sourceKey(values[index - 1]!) === sourceKey(item),
    )
  )
    fail("trustedEvidenceSources must be unique");
  return freeze(values);
}
function evidence(input: unknown): readonly CollectiveDecisionEvidenceV1[] {
  if (!Array.isArray(input)) fail("certificate evidence must be an array");
  const values = input
    .map(validateCollectiveDecisionEvidenceV1)
    .sort((left, right) =>
      left.evidenceDigest.localeCompare(right.evidenceDigest),
    );
  if (
    values.some(
      (item, index) =>
        index > 0 && values[index - 1]!.evidenceDigest === item.evidenceDigest,
    )
  )
    fail("certificate evidence must be unique");
  return freeze(values);
}
function decisions(input: unknown): readonly CollectiveDecisionV1[] {
  if (!Array.isArray(input)) fail("state accepted must be an array");
  const values = input
    .map(validateCollectiveDecisionV1)
    .sort((left, right) =>
      decisionSlotV1(left.candidate).localeCompare(
        decisionSlotV1(right.candidate),
      ),
    );
  if (
    values.some(
      (item, index) =>
        index > 0 &&
        decisionSlotV1(values[index - 1]!.candidate) ===
          decisionSlotV1(item.candidate),
    )
  )
    fail("state accepted must be unique by slot");
  return freeze(values);
}
function compactedHeads(
  input: unknown,
): readonly CollectiveDecisionCompactedHeadV1[] {
  if (!Array.isArray(input)) fail("state compacted must be an array");
  const values = input
    .map(validateCollectiveDecisionCompactedHeadV1)
    .sort(
      (left, right) =>
        left.committedStateRevision - right.committedStateRevision,
    );
  if (
    values.some(
      (item, index) =>
        index > 0 &&
        values[index - 1]!.committedStateRevision ===
          item.committedStateRevision,
    )
  )
    fail("state compacted revisions must be unique");
  return freeze(values);
}
function identifiers(
  input: unknown,
  label: string,
  minimum = 1,
): readonly string[] {
  if (!Array.isArray(input) || input.length < minimum)
    fail(`${label} must contain at least ${minimum} values`);
  const values = input.map((item) => id(item, label)).sort(compare);
  if (values.some((item, index) => index > 0 && values[index - 1] === item))
    fail(`${label} must be unique`);
  return freeze(values);
}
function id(input: unknown, label: string): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.length > MAX_IDENTIFIER_LENGTH ||
    !IDENTIFIER.test(input)
  )
    fail(`${label} is invalid`);
  return input;
}
function nullableId(input: unknown, label: string): string | null {
  return input === null ? null : id(input, label);
}
function sha(input: unknown, label: string): PlanningDigestV1 {
  if (typeof input !== "string" || !DIGEST.test(input))
    fail(`${label} is invalid`);
  return input as PlanningDigestV1;
}
function nullableDigest(
  input: unknown,
  label: string,
): PlanningDigestV1 | null {
  return input === null ? null : sha(input, label);
}
function positive(input: unknown, label: string): number {
  return integer(input, label, 1);
}
function integer(input: unknown, label: string, minimum: number): number {
  if (!Number.isSafeInteger(input) || (input as number) < minimum)
    fail(`${label} is invalid`);
  return input as number;
}
function nullableInteger(
  input: unknown,
  label: string,
  minimum: number,
): number | null {
  return input === null ? null : integer(input, label, minimum);
}
function kind(input: unknown): CollectiveDecisionCandidateV1["decisionKind"] {
  if (typeof input !== "string" || !kindSet.has(input))
    fail("decision kind is invalid");
  return input as CollectiveDecisionCandidateV1["decisionKind"];
}
function mode(
  input: unknown,
): CollectiveDecisionCertificateV1["certificationMode"] {
  if (typeof input !== "string" || !modeSet.has(input))
    fail("certification mode is invalid");
  return input as CollectiveDecisionCertificateV1["certificationMode"];
}
function schema(input: unknown, label: string): void {
  if (input !== COLLECTIVE_DECISION_SCHEMA_VERSION_V1)
    fail(`${label} schema is invalid`);
}
function sourceKey(value: CollectiveDecisionTrustedEvidenceSourceV1): string {
  return `${value.sourceId}\u0000${value.sourceVersion}\u0000${value.sourceImplementationDigest}`;
}
function record(
  input: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null)
  )
    fail(`${label} must be an object`);
  const actual = Object.getOwnPropertyNames(input).sort(compare);
  const expected = [...keys].sort(compare);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    fail(`${label} has unexpected properties`);
  return input as Record<string, unknown>;
}
/**
 * The planning package intentionally closes its digest-domain registry. Keep
 * this additive module independent of that registry by using its canonical
 * snapshot domain and binding this module's record type inside the digest body.
 */
function digest(domain: string, value: unknown): PlanningDigestV1 {
  return digestPlanningJsonV1("collective-planning-snapshot", {
    collectiveDecisionRecordType: domain,
    value,
  } as PlanningJson);
}
function freeze<T>(value: T): T {
  return Object.freeze(value);
}
function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function fail(message: string): never {
  throw new TypeError(message);
}
