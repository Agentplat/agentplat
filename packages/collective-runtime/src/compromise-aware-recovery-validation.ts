import type { PlanningDigestV1 } from "@agentplat/collective-planning";
import { computeMeshDurableValueDigest } from "@agentplat/mesh/durability";
import { validateMeshAdaptiveOverlayCertificateV1 } from "@agentplat/mesh/adaptive-overlay";
import type { MeshJsonValue } from "@agentplat/mesh-protocol";

import {
  COMPROMISE_AWARE_RECOVERY_STATE_FORMAT_V1,
  type CompromiseRecoveryPolicyV1,
  type CompromiseRecoveryRequestV1,
  type CompromiseRecoveryScopeV1,
  type CompromiseRecoveryStateV1,
  type CompromiseRecoveryVerdictCertificateV1,
} from "./compromise-aware-recovery-contracts.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

export function validateCompromiseRecoveryScopeV1(
  input: CompromiseRecoveryScopeV1,
): CompromiseRecoveryScopeV1 {
  record(input, "recovery scope");
  return Object.freeze({
    tenantId: identifier(input.tenantId, "scope.tenantId"),
    meshId: identifier(input.meshId, "scope.meshId"),
    missionIntentId: identifier(input.missionIntentId, "scope.missionIntentId"),
    objectiveId: identifier(input.objectiveId, "scope.objectiveId"),
    workItemId: identifier(input.workItemId, "scope.workItemId"),
  });
}

export function validateCompromiseRecoveryPolicyV1(
  input: CompromiseRecoveryPolicyV1,
): CompromiseRecoveryPolicyV1 {
  record(input, "recovery policy");
  if (input.schemaVersion !== 1) fail("recovery policy schema is invalid");
  identifier(input.policyId, "policyId");
  positive(input.policyVersion, "policyVersion", Number.MAX_SAFE_INTEGER);
  planningDigest(input.policyDigest, "policyDigest");
  positive(
    input.maximumVerdictLifetimeMs,
    "maximumVerdictLifetimeMs",
    86_400_000,
  );
  positive(input.maximumTakeoverProposals, "maximumTakeoverProposals", 1_024);
  positive(input.maximumWitnesses, "maximumWitnesses", 1_024);
  positive(input.maximumExcludedPeers, "maximumExcludedPeers", 10_000);
  positive(
    input.maximumCompletedCertificates,
    "maximumCompletedCertificates",
    10_000,
  );
  positive(input.maximumCommitAttempts, "maximumCommitAttempts", 32);
  positive(input.maximumRunSteps, "maximumRunSteps", 32);
  return Object.freeze({ ...input });
}

export function validateCompromiseRecoveryVerdictCertificateV1(
  input: CompromiseRecoveryVerdictCertificateV1,
  policy: CompromiseRecoveryPolicyV1,
): CompromiseRecoveryVerdictCertificateV1 {
  record(input, "recovery verdict");
  if (input.schemaVersion !== 1 || input.disposition !== "exclude")
    fail("recovery verdict schema or disposition is invalid");
  if (
    input.cause !== "confirmed_compromise" &&
    input.cause !== "credential_compromise" &&
    input.cause !== "integrity_failure"
  )
    fail("recovery verdict cause is invalid");
  identifier(input.certificateId, "certificateId");
  validateCompromiseRecoveryScopeV1(input.scope);
  identifier(input.subjectPeerId, "subjectPeerId");
  nonNegative(input.subjectPeerIndex, "subjectPeerIndex");
  identifier(input.sourceId, "sourceId");
  positive(input.sourceVersion, "sourceVersion", Number.MAX_SAFE_INTEGER);
  planningDigest(input.sourceRecordDigest, "sourceRecordDigest");
  planningDigest(input.controlProposalDigest, "controlProposalDigest");
  const peers = identifiers(
    input.independentWitnessPeerIds,
    "independentWitnessPeerIds",
    policy.maximumWitnesses,
  );
  const groups = identifiers(
    input.independentWitnessGroupIds,
    "independentWitnessGroupIds",
    policy.maximumWitnesses,
  );
  if (peers.length !== groups.length)
    fail("recovery witness tuples are misaligned");
  if (peers.includes(input.subjectPeerId))
    fail("recovery subject cannot certify its own exclusion");
  positive(input.witnessThreshold, "witnessThreshold", groups.length);
  if (new Set(groups).size < input.witnessThreshold)
    fail("recovery independent witness threshold is not met");
  validateMeshAdaptiveOverlayCertificateV1(input.sparseExclusionCertificate);
  nonNegative(input.expectedAdaptiveRevision, "expectedAdaptiveRevision");
  nonNegative(input.issuedAtLogicalMs, "issuedAtLogicalMs");
  positive(
    input.expiresAtLogicalMs,
    "expiresAtLogicalMs",
    Number.MAX_SAFE_INTEGER,
  );
  if (
    input.expiresAtLogicalMs <= input.issuedAtLogicalMs ||
    input.expiresAtLogicalMs - input.issuedAtLogicalMs >
      policy.maximumVerdictLifetimeMs
  )
    fail("recovery verdict lifetime is invalid");
  planningDigest(input.certificateDigest, "certificateDigest");
  return Object.freeze({
    ...input,
    independentWitnessPeerIds: peers,
    independentWitnessGroupIds: groups,
  });
}

export async function createCompromiseRecoveryVerdictCertificateV1(
  input: Omit<CompromiseRecoveryVerdictCertificateV1, "certificateDigest">,
  policy: CompromiseRecoveryPolicyV1,
): Promise<CompromiseRecoveryVerdictCertificateV1> {
  const verdict = {
    ...input,
    certificateDigest: await compromiseRecoveryDigestV1(
      "compromise-verdict",
      input,
    ),
  };
  return validateCompromiseRecoveryVerdictCertificateV1(verdict, policy);
}

export function validateCompromiseRecoveryRequestV1(
  input: CompromiseRecoveryRequestV1,
  policy: CompromiseRecoveryPolicyV1,
): CompromiseRecoveryRequestV1 {
  record(input, "recovery request");
  if (input.schemaVersion !== 1) fail("recovery request schema is invalid");
  identifier(input.recoveryRequestId, "recoveryRequestId");
  validateCompromiseRecoveryScopeV1(input.scope);
  nonNegative(input.objectiveRevision, "objectiveRevision");
  positive(
    input.objectiveExpiresAtLogicalMs,
    "objectiveExpiresAtLogicalMs",
    Number.MAX_SAFE_INTEGER,
  );
  nonNegative(input.workItemRevision, "workItemRevision");
  nonNegative(input.priorAssignmentEpoch, "priorAssignmentEpoch");
  identifier(input.priorFencingToken, "priorFencingToken");
  positive(
    input.proposedAssignmentEpoch,
    "proposedAssignmentEpoch",
    Number.MAX_SAFE_INTEGER,
  );
  if (input.proposedAssignmentEpoch <= input.priorAssignmentEpoch)
    fail("recovery assignment epoch does not advance");
  if (
    !Array.isArray(input.takeoverProposals) ||
    input.takeoverProposals.length < 1 ||
    input.takeoverProposals.length > policy.maximumTakeoverProposals
  )
    fail("recovery takeover proposals are invalid");
  const proposalIds = new Set<string>();
  for (const proposal of input.takeoverProposals) {
    identifier(proposal.takeoverProposalId, "takeoverProposalId");
    identifier(proposal.proposedAssigneePeerId, "proposedAssigneePeerId");
    nonNegative(proposal.acceptedAtLogicalMs, "acceptedAtLogicalMs");
    if (proposalIds.has(proposal.takeoverProposalId))
      fail("recovery takeover proposal is duplicated");
    proposalIds.add(proposal.takeoverProposalId);
  }
  const witnesses = identifiers(
    input.eligibleWitnessPeerIds,
    "eligibleWitnessPeerIds",
    policy.maximumWitnesses,
  );
  positive(
    input.recoveryWitnessThreshold,
    "recoveryWitnessThreshold",
    witnesses.length,
  );
  if (input.checkpointDigest !== null)
    planningDigest(input.checkpointDigest, "checkpointDigest");
  if (input.fallback !== "reauction" && input.fallback !== "replan")
    fail("recovery fallback is invalid");
  planningDigest(input.requestDigest, "requestDigest");
  return Object.freeze({ ...input, eligibleWitnessPeerIds: witnesses });
}

export async function createCompromiseRecoveryRequestV1(
  input: Omit<CompromiseRecoveryRequestV1, "requestDigest">,
  policy: CompromiseRecoveryPolicyV1,
): Promise<CompromiseRecoveryRequestV1> {
  const request = {
    ...input,
    requestDigest: await compromiseRecoveryDigestV1(
      "compromise-recovery-request",
      input,
    ),
  };
  return validateCompromiseRecoveryRequestV1(request, policy);
}

export function assertCompromiseRecoveryStateShapeV1(
  input: CompromiseRecoveryStateV1,
): CompromiseRecoveryStateV1 {
  record(input, "recovery state");
  if (
    input.format !== COMPROMISE_AWARE_RECOVERY_STATE_FORMAT_V1 ||
    input.schemaVersion !== 1
  )
    fail("recovery state format is invalid");
  identifier(input.stateKey, "stateKey");
  validateCompromiseRecoveryScopeV1(input.scope);
  planningDigest(input.policyDigest, "policyDigest");
  nonNegative(input.revision, "revision");
  nonNegative(input.logicalTimeHighWaterMs, "logicalTimeHighWaterMs");
  if (
    !Array.isArray(input.excludedPeerIds) ||
    !Array.isArray(input.excludedPeerIndexes)
  )
    fail("recovery exclusion heads are invalid");
  if (
    !Array.isArray(input.completedCertificateDigests) ||
    !Array.isArray(input.supersededCertificates)
  )
    fail("recovery completion history is invalid");
  input.completedCertificateDigests.forEach((value) =>
    planningDigest(value, "completedCertificateDigest"),
  );
  input.supersededCertificates.forEach((value) => {
    record(value, "recovery supersession");
    planningDigest(
      value.supersededCertificateDigest,
      "supersededCertificateDigest",
    );
    planningDigest(
      value.supersedingCertificateDigest,
      "supersedingCertificateDigest",
    );
  });
  if (input.predecessorStateDigest !== null)
    planningDigest(input.predecessorStateDigest, "predecessorStateDigest");
  planningDigest(input.stateDigest, "stateDigest");
  return input;
}

export async function compromiseRecoveryDigestV1(
  domain: string,
  value: unknown,
): Promise<PlanningDigestV1> {
  identifier(domain, "digest domain");
  const base64 = await computeMeshDurableValueDigest(
    JSON.parse(JSON.stringify({ domain, value })) as MeshJsonValue,
  );
  const bytes = base64UrlBytes(base64.slice(7));
  if (bytes.length !== 32) fail("recovery digest encoding is invalid");
  return `sha256:${Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

export function sameCompromiseRecoveryScopeV1(
  left: CompromiseRecoveryScopeV1,
  right: CompromiseRecoveryScopeV1,
): boolean {
  return (
    left.tenantId === right.tenantId &&
    left.meshId === right.meshId &&
    left.missionIntentId === right.missionIntentId &&
    left.objectiveId === right.objectiveId &&
    left.workItemId === right.workItemId
  );
}

function base64UrlBytes(value: string): Uint8Array {
  try {
    const padded =
      value.replace(/-/gu, "+").replace(/_/gu, "/") +
      "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (entry) => entry.charCodeAt(0));
  } catch {
    fail("recovery digest encoding is invalid");
  }
}

function identifiers(
  input: readonly string[],
  label: string,
  maximum: number,
): readonly string[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > maximum)
    fail(`${label} is invalid`);
  const result = input.map((value) => identifier(value, label));
  if (new Set(result).size !== result.length)
    fail(`${label} contains duplicates`);
  return Object.freeze(result);
}

function planningDigest(
  value: unknown,
  label: string,
): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !DIGEST.test(value))
    fail(`${label} is invalid`);
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > 256 || !ID.test(value))
    fail(`${label} is invalid`);
  return value;
}

function positive(
  value: unknown,
  label: string,
  maximum: number,
): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > maximum
  )
    fail(`${label} is invalid`);
}

function nonNegative(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail(`${label} is invalid`);
}

function record(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} is required`);
}

function fail(message: string): never {
  throw new TypeError(message);
}
