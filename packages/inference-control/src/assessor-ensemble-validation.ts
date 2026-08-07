import { canonicalizeControlJsonV1 } from "./canonical.js";
import { sha256Hex } from "./sha256.js";
import {
  assertDigest,
  assertIdentifier,
  assertSafeInteger,
  deepFreeze,
} from "./validation.js";
import {
  ASSESSOR_ENSEMBLE_AGENT_CLASSES_V1,
  ASSESSOR_ENSEMBLE_MODALITIES_V1,
  ASSESSOR_ENSEMBLE_SURFACES_V1,
  type AssessorEnsembleMemberDescriptorV1,
  type AssessorEnsemblePolicyV1,
  type AssessorEnsembleRequestV1,
  type AssessorEnsembleVoteV1,
  type AssessorEnsembleVerdictV1,
} from "./assessor-ensemble-contracts.js";

const encoder = new TextEncoder();
export function digestAssessorEnsembleV1(
  domain: string,
  value: unknown,
): string {
  return `sha256:${sha256Hex(encoder.encode(`agentplat.assessor-ensemble/${domain}/v1\0${canonicalizeControlJsonV1(value as never)}`))}`;
}
function closed<T extends string>(
  values: readonly string[],
  vocabulary: readonly T[],
  label: string,
): readonly T[] {
  const result = [...new Set(values)].sort();
  if (
    !result.length ||
    result.length !== values.length ||
    result.some((v) => !vocabulary.includes(v as T))
  )
    throw new TypeError(`invalid_${label}`);
  return result as unknown as readonly T[];
}
function boundedStrings(
  values: readonly string[],
  label: string,
  maximum: number,
): readonly string[] {
  if (values.length > maximum) throw new RangeError(`${label}_limit_exceeded`);
  const result = [...new Set(values)].sort();
  if (result.length !== values.length)
    throw new TypeError(`${label}_must_be_unique`);
  for (const value of result) assertIdentifier(value, label);
  return result;
}
export function createAssessorEnsembleMemberDescriptorV1(
  input: Omit<AssessorEnsembleMemberDescriptorV1, "descriptorDigest">,
): AssessorEnsembleMemberDescriptorV1 {
  assertIdentifier(input.assessorId, "assessorId");
  assertSafeInteger(input.assessorVersion, "assessorVersion", 1);
  assertDigest(
    input.assessorImplementationDigest,
    "assessorImplementationDigest",
  );
  assertIdentifier(input.independenceGroup, "independenceGroup");
  if (
    !(ASSESSOR_ENSEMBLE_AGENT_CLASSES_V1 as readonly string[]).includes(
      input.agentClass,
    )
  )
    throw new TypeError("invalid_assessor_agent_class");
  const value = {
    ...input,
    schemaVersion: 1 as const,
    surfaces: closed(input.surfaces, ASSESSOR_ENSEMBLE_SURFACES_V1, "surfaces"),
    modalities: closed(
      input.modalities,
      ASSESSOR_ENSEMBLE_MODALITIES_V1,
      "modalities",
    ),
  };
  return deepFreeze({
    ...value,
    descriptorDigest: digestAssessorEnsembleV1("member-descriptor", value),
  });
}
export function assertAssessorEnsembleMemberDescriptorV1(
  value: AssessorEnsembleMemberDescriptorV1,
): void {
  const { descriptorDigest, ...unsigned } = value;
  if (
    descriptorDigest !==
    createAssessorEnsembleMemberDescriptorV1(unsigned).descriptorDigest
  )
    throw new TypeError("assessor_descriptor_digest_mismatch");
}
export function createAssessorEnsemblePolicyV1(
  input: Omit<AssessorEnsemblePolicyV1, "policyDigest">,
): AssessorEnsemblePolicyV1 {
  assertIdentifier(input.policyId, "policyId");
  assertSafeInteger(input.policyVersion, "policyVersion", 1);
  for (const key of [
    "minimumVotes",
    "minimumIndependenceGroups",
    "maximumMembers",
    "maximumCasAttempts",
    "maximumStep",
    "maximumLogicalTimeMs",
  ] as const)
    assertSafeInteger(input[key], key, 1);
  assertSafeInteger(input.assessorTimeoutMs, "assessorTimeoutMs", 1);
  if (
    input.minimumIndependenceGroups > input.minimumVotes ||
    input.minimumVotes > input.maximumMembers
  )
    throw new RangeError("invalid_ensemble_quorum");
  const value = {
    ...input,
    schemaVersion: 1 as const,
    requiredSurfaces: closed(
      input.requiredSurfaces,
      ASSESSOR_ENSEMBLE_SURFACES_V1,
      "required_surfaces",
    ),
    requiredModalities: closed(
      input.requiredModalities,
      ASSESSOR_ENSEMBLE_MODALITIES_V1,
      "required_modalities",
    ),
  };
  return deepFreeze({
    ...value,
    policyDigest: digestAssessorEnsembleV1("policy", value),
  });
}
export function assertAssessorEnsemblePolicyV1(
  value: AssessorEnsemblePolicyV1,
): void {
  const { policyDigest, ...unsigned } = value;
  if (policyDigest !== createAssessorEnsemblePolicyV1(unsigned).policyDigest)
    throw new TypeError("assessor_policy_digest_mismatch");
}
export function createAssessorEnsembleRequestV1(
  input: Omit<AssessorEnsembleRequestV1, "requestDigest">,
): AssessorEnsembleRequestV1 {
  assertIdentifier(input.invocationId, "invocationId");
  for (const key of ["bindingDigest", "policyDigest", "signalDigest"] as const)
    assertDigest(input[key], key);
  if (
    !(["inference", "tool", "action"] as const).includes(input.executionDomain)
  )
    throw new TypeError("invalid_execution_domain");
  if (
    !(ASSESSOR_ENSEMBLE_SURFACES_V1 as readonly string[]).includes(
      input.surface,
    )
  )
    throw new TypeError("invalid_surface");
  assertSafeInteger(input.step, "step", 1);
  assertSafeInteger(input.logicalTimeMs, "logicalTimeMs");
  const value = {
    ...input,
    schemaVersion: 1 as const,
    modalities: closed(
      input.modalities,
      ASSESSOR_ENSEMBLE_MODALITIES_V1,
      "modalities",
    ),
  };
  return deepFreeze({
    ...value,
    requestDigest: digestAssessorEnsembleV1("request", value),
  });
}
export function createAssessorEnsembleVoteV1(
  input: Omit<AssessorEnsembleVoteV1, "voteDigest">,
): AssessorEnsembleVoteV1 {
  assertDigest(input.requestDigest, "requestDigest");
  assertIdentifier(input.assessorId, "assessorId");
  assertSafeInteger(input.assessorVersion, "assessorVersion", 1);
  assertDigest(
    input.assessorImplementationDigest,
    "assessorImplementationDigest",
  );
  assertIdentifier(input.independenceGroup, "independenceGroup");
  if (
    !(["allow", "modify", "block", "unresolved"] as const).includes(
      input.decision,
    )
  )
    throw new TypeError("invalid_vote_decision");
  const value = {
    ...input,
    schemaVersion: 1 as const,
    reasonCodes: boundedStrings(input.reasonCodes, "reasonCodes", 32),
    evidenceDigests: boundedStrings(
      input.evidenceDigests,
      "evidenceDigests",
      32,
    ),
  };
  for (const digest of value.evidenceDigests)
    assertDigest(digest, "evidenceDigest");
  return deepFreeze({
    ...value,
    voteDigest: digestAssessorEnsembleV1("vote", value),
  });
}
export function assertAssessorEnsembleVoteV1(
  value: AssessorEnsembleVoteV1,
): void {
  const { voteDigest, ...unsigned } = value;
  if (voteDigest !== createAssessorEnsembleVoteV1(unsigned).voteDigest)
    throw new TypeError("assessor_vote_digest_mismatch");
}
export function createAssessorEnsembleVerdictV1(
  input: Omit<AssessorEnsembleVerdictV1, "verdictDigest">,
): AssessorEnsembleVerdictV1 {
  assertDigest(input.requestDigest, "requestDigest");
  if (
    !(["allow", "modify", "block", "unresolved"] as const).includes(
      input.decision,
    )
  )
    throw new TypeError("invalid_ensemble_decision");
  const votes = [...input.votes].sort((a, b) =>
    a.assessorId.localeCompare(b.assessorId),
  );
  if (
    votes.length !== input.votes.length ||
    new Set(votes.map((v) => v.assessorId)).size !== votes.length
  )
    throw new TypeError("votes_not_canonical");
  votes.forEach(assertAssessorEnsembleVoteV1);
  if (votes.some((vote) => vote.requestDigest !== input.requestDigest))
    throw new TypeError("vote_request_digest_mismatch");
  const value = {
    ...input,
    schemaVersion: 1 as const,
    votes,
    countedAssessorIds: boundedStrings(
      input.countedAssessorIds,
      "countedAssessorIds",
      256,
    ),
    countedIndependenceGroups: boundedStrings(
      input.countedIndependenceGroups,
      "countedIndependenceGroups",
      256,
    ),
    missingAssessorIds: boundedStrings(
      input.missingAssessorIds,
      "missingAssessorIds",
      256,
    ),
  };
  return deepFreeze({
    ...value,
    verdictDigest: digestAssessorEnsembleV1("verdict", value),
  });
}
export function digestAssessorEnsembleStateV1(
  value: Omit<
    import("./assessor-ensemble-contracts.js").AssessorEnsembleStateV1,
    "stateDigest"
  >,
): string {
  return digestAssessorEnsembleV1("state", value);
}
