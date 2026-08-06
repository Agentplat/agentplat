import type { JsonValue } from "@agentplat/core";
import {
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import {
  MESH_SIGNATURE_ALGORITHM,
  canonicalizeMeshJsonBytes,
} from "@agentplat/mesh-protocol";

import {
  PEER_STRATEGY_EVIDENCE_HANDOFF_FORMAT_V1,
  PEER_STRATEGY_EVIDENCE_SCHEMA_VERSION_V1,
  PEER_STRATEGY_EVIDENCE_STATE_FORMAT_V1,
  type PeerStrategyEvidenceAdmissionDecisionV1,
  type PeerStrategyEvidenceAdvisoryPriorV1,
  type PeerStrategyEvidenceBindingV1,
  type PeerStrategyEvidenceCertificateDecisionV1,
  type PeerStrategyEvidenceCertificateV1,
  type PeerStrategyEvidenceCohortV1,
  type PeerStrategyEvidenceEligibilityDecisionV1,
  type PeerStrategyEvidenceExchangePortV1,
  type PeerStrategyEvidenceHandoffEnvelopeV1,
  type PeerStrategyEvidenceIndependencePortV1,
  type PeerStrategyEvidenceMetricValueV1,
  type PeerStrategyEvidenceOutcomeV1,
  type PeerStrategyEvidencePolicyRecordV1,
  type PeerStrategyEvidencePolicyV1,
  type PeerStrategyEvidenceRuntimeOptionsV1,
  type PeerStrategyEvidenceSourceHeadV1,
  type PeerStrategyEvidenceStateV1,
  type PeerStrategyEvidenceStoreV1,
  type SignedPeerStrategyOutcomeAttestationV1,
  type UnsignedPeerStrategyOutcomeAttestationV1,
} from "./strategy-evidence-exchange-contracts.js";
import {
  LOCAL_STRATEGY_FEEDBACK_METRICS_V1,
  LOCAL_STRATEGY_OPERATIONS_V1,
  type LocalStrategyFeedbackMetricV1,
  type LocalStrategyOperationV1,
} from "./strategy-adaptation-contracts.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,255}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/u;
const BPS = 10_000;
const MICROS = 1_000_000;
const operations = new Set<string>(LOCAL_STRATEGY_OPERATIONS_V1);
const metrics = new Set<string>(LOCAL_STRATEGY_FEEDBACK_METRICS_V1);
const outcomes = new Set<string>([
  "success",
  "failure",
  "unsafe",
  "indeterminate",
]);

const cohortKeys = [
  "cohortDigest",
  "contextClassDigest",
  "meshId",
  "missionIntentId",
  "objectiveId",
  "policyDomainId",
  "tenantId",
];
const bindingKeys = [
  "bindingDigest",
  "feedbackSchemaDigest",
  "implementationDigest",
  "operation",
  "strategyDigest",
  "strategyId",
];
const metricKeys = ["metric", "schemaVersion", "valueMicros"];
const limitsKeys = [
  "maximumAttestationTtlMs",
  "maximumAttestations",
  "maximumAttestationsPerPeer",
  "maximumCertificates",
  "maximumCommitAttempts",
  "maximumFeedbackSignalDigests",
  "maximumFutureSkewMs",
  "maximumGossipFanout",
  "maximumGossipHops",
  "maximumReasonCodesPerDecision",
  "maximumSourceHeads",
];
const policyKeys = [
  "feedbackSchemaDigest",
  "limits",
  "maximumPriorInfluenceBps",
  "minimumConfidenceBps",
  "minimumDistinctIndependenceGroups",
  "minimumDistinctPeers",
  "parentPolicyDigest",
  "policyId",
  "policyVersion",
  "schemaVersion",
];
const policyRecordKeys = ["policy", "policyDigest", "schemaVersion"];
const proofHeaderKeys = ["algorithm", "keyId"];
const proofKeys = ["algorithm", "keyId", "value"];
const attestationKeys = [
  "attestationDigest",
  "attestationId",
  "binding",
  "catalogDigest",
  "cohort",
  "confidenceBps",
  "expiresAtLogicalMs",
  "feedbackBatchDigest",
  "feedbackDecisionDigest",
  "feedbackSignalDigests",
  "issuerInstanceId",
  "issuerPeerId",
  "issuerSequence",
  "issuerStreamId",
  "localPolicyDigest",
  "membershipConfigurationDigest",
  "membershipEpoch",
  "metrics",
  "observedAtLogicalMs",
  "outcome",
  "predecessorAttestationDigest",
  "proof",
  "schemaVersion",
  "selectionDecisionDigest",
];
const sourceHeadKeys = [
  "attestationDigest",
  "equivocated",
  "expiresAtLogicalMs",
  "headKey",
  "issuerInstanceId",
  "issuerPeerId",
  "issuerSequence",
  "issuerStreamId",
  "membershipConfigurationDigest",
  "membershipEpoch",
  "schemaVersion",
];
const certificateKeys = [
  "attestationDigests",
  "attesterPeerIds",
  "binding",
  "certificateDigest",
  "certificateId",
  "certifiedAtLogicalMs",
  "cohortDigest",
  "confidenceBps",
  "expiresAtLogicalMs",
  "independenceGroupIds",
  "membershipConfigurationDigest",
  "membershipEpoch",
  "metrics",
  "outcome",
  "policyDigest",
  "schemaVersion",
];
const stateKeys = [
  "attestations",
  "certificates",
  "exchangerId",
  "exchangerVersion",
  "format",
  "implementationId",
  "logicalTimeHighWaterMs",
  "pendingAttestations",
  "policyDigest",
  "policyId",
  "policyVersion",
  "predecessorStateDigest",
  "revision",
  "schemaVersion",
  "sourceHeads",
  "stateDigest",
  "stateKey",
];

export function createPeerStrategyEvidenceCohortV1(
  input: Omit<PeerStrategyEvidenceCohortV1, "cohortDigest">,
): PeerStrategyEvidenceCohortV1 {
  const value = exact(
    input,
    cohortKeys.filter((key) => key !== "cohortDigest"),
    "strategy evidence cohort input",
  );
  const body = freeze({
    tenantId: identifier(value.tenantId, "cohort.tenantId"),
    meshId: identifier(value.meshId, "cohort.meshId"),
    policyDomainId: identifier(
      value.policyDomainId,
      "cohort.policyDomainId",
    ),
    missionIntentId: identifier(
      value.missionIntentId,
      "cohort.missionIntentId",
    ),
    objectiveId: identifier(value.objectiveId, "cohort.objectiveId"),
    contextClassDigest: sha(
      value.contextClassDigest,
      "cohort.contextClassDigest",
    ),
  });
  return freeze({
    ...body,
    cohortDigest: digest("peer-strategy-evidence-cohort", body),
  });
}

export function validatePeerStrategyEvidenceCohortV1(
  input: unknown,
): PeerStrategyEvidenceCohortV1 {
  const value = exact(input, cohortKeys, "strategy evidence cohort");
  const rebuilt = createPeerStrategyEvidenceCohortV1({
    tenantId: value.tenantId as string,
    meshId: value.meshId as string,
    policyDomainId: value.policyDomainId as string,
    missionIntentId: value.missionIntentId as string,
    objectiveId: value.objectiveId as string,
    contextClassDigest: value.contextClassDigest as PlanningDigestV1,
  });
  if (value.cohortDigest !== rebuilt.cohortDigest)
    fail("strategy evidence cohort digest is invalid");
  return rebuilt;
}

export function createPeerStrategyEvidenceBindingV1(
  input: Omit<PeerStrategyEvidenceBindingV1, "bindingDigest">,
): PeerStrategyEvidenceBindingV1 {
  const value = exact(
    input,
    bindingKeys.filter((key) => key !== "bindingDigest"),
    "strategy evidence binding input",
  );
  const body = freeze({
    operation: operation(value.operation),
    strategyId: identifier(value.strategyId, "binding.strategyId"),
    strategyDigest: sha(value.strategyDigest, "binding.strategyDigest"),
    implementationDigest: sha(
      value.implementationDigest,
      "binding.implementationDigest",
    ),
    feedbackSchemaDigest: sha(
      value.feedbackSchemaDigest,
      "binding.feedbackSchemaDigest",
    ),
  });
  return freeze({
    ...body,
    bindingDigest: digest("peer-strategy-evidence-binding", body),
  });
}

export function validatePeerStrategyEvidenceBindingV1(
  input: unknown,
): PeerStrategyEvidenceBindingV1 {
  const value = exact(input, bindingKeys, "strategy evidence binding");
  const rebuilt = createPeerStrategyEvidenceBindingV1({
    operation: value.operation as LocalStrategyOperationV1,
    strategyId: value.strategyId as string,
    strategyDigest: value.strategyDigest as PlanningDigestV1,
    implementationDigest: value.implementationDigest as PlanningDigestV1,
    feedbackSchemaDigest: value.feedbackSchemaDigest as PlanningDigestV1,
  });
  if (value.bindingDigest !== rebuilt.bindingDigest)
    fail("strategy evidence binding digest is invalid");
  return rebuilt;
}

export function createPeerStrategyEvidenceExchangePolicyV1(
  input: PeerStrategyEvidencePolicyV1,
): PeerStrategyEvidencePolicyRecordV1 {
  const value = exact(input, policyKeys, "strategy evidence policy input");
  schema(value.schemaVersion, "strategy evidence policy");
  const limits = normalizeLimits(value.limits);
  const minimumDistinctPeers = positive(
    value.minimumDistinctPeers,
    "policy.minimumDistinctPeers",
  );
  const minimumDistinctIndependenceGroups = positive(
    value.minimumDistinctIndependenceGroups,
    "policy.minimumDistinctIndependenceGroups",
  );
  if (
    minimumDistinctPeers > limits.maximumAttestations ||
    minimumDistinctIndependenceGroups > limits.maximumAttestations
  )
    fail("strategy evidence thresholds exceed retained evidence");
  const policy = freeze({
    schemaVersion: PEER_STRATEGY_EVIDENCE_SCHEMA_VERSION_V1,
    policyId: identifier(value.policyId, "policy.policyId"),
    policyVersion: positive(value.policyVersion, "policy.policyVersion"),
    parentPolicyDigest: nullableSha(
      value.parentPolicyDigest,
      "policy.parentPolicyDigest",
    ),
    feedbackSchemaDigest: sha(
      value.feedbackSchemaDigest,
      "policy.feedbackSchemaDigest",
    ),
    minimumDistinctPeers,
    minimumDistinctIndependenceGroups,
    minimumConfidenceBps: basisPoints(
      value.minimumConfidenceBps,
      "policy.minimumConfidenceBps",
    ),
    maximumPriorInfluenceBps: basisPoints(
      value.maximumPriorInfluenceBps,
      "policy.maximumPriorInfluenceBps",
    ),
    limits,
  });
  return freeze({
    schemaVersion: PEER_STRATEGY_EVIDENCE_SCHEMA_VERSION_V1,
    policy,
    policyDigest: digest("peer-strategy-evidence-policy", policy),
  });
}

export function validatePeerStrategyEvidenceExchangePolicyV1(
  input: unknown,
): PeerStrategyEvidencePolicyRecordV1 {
  const value = exact(input, policyRecordKeys, "strategy evidence policy");
  schema(value.schemaVersion, "strategy evidence policy record");
  const rebuilt = createPeerStrategyEvidenceExchangePolicyV1(
    value.policy as PeerStrategyEvidencePolicyV1,
  );
  if (value.policyDigest !== rebuilt.policyDigest)
    fail("strategy evidence policy digest is invalid");
  return rebuilt;
}

export async function createSignedPeerStrategyOutcomeAttestationV1(
  input: Omit<
    UnsignedPeerStrategyOutcomeAttestationV1,
    "attestationId" | "attestationDigest" | "proof"
  > & {
    readonly signing: {
      readonly keyId: string;
      readonly privateKey: CryptoKey;
    };
    readonly crypto?: Crypto;
  },
): Promise<SignedPeerStrategyOutcomeAttestationV1> {
  const cohort = validatePeerStrategyEvidenceCohortV1(input.cohort);
  const binding = validatePeerStrategyEvidenceBindingV1(input.binding);
  const content = normalizeAttestationContent({ ...input, cohort, binding });
  const attestationDigest = digest(
    "peer-strategy-outcome-attestation",
    content,
  );
  const proof = freeze({
    algorithm: MESH_SIGNATURE_ALGORITHM,
    keyId: identifier(input.signing.keyId, "attestation.proof.keyId"),
  });
  if (!privateKey(input.signing.privateKey))
    fail("strategy evidence signing key is invalid");
  const unsigned = freeze({
    ...content,
    attestationId: `strategy-evidence.${attestationDigest.slice(7)}`,
    attestationDigest,
    proof,
  });
  const bytes = signingBytes(unsigned);
  let signed: ArrayBuffer;
  try {
    signed = await cryptoOf(input.crypto).subtle.sign(
      MESH_SIGNATURE_ALGORITHM,
      input.signing.privateKey,
      bytes,
    );
  } catch {
    fail("strategy evidence signing failed");
  }
  const signature = new Uint8Array(signed);
  if (signature.byteLength !== 64) fail("strategy evidence signature is invalid");
  return validateSignedPeerStrategyOutcomeAttestationV1({
    ...unsigned,
    proof: { ...proof, value: base64url(signature) },
  });
}

export function validateSignedPeerStrategyOutcomeAttestationV1(
  input: unknown,
): SignedPeerStrategyOutcomeAttestationV1 {
  const value = exact(input, attestationKeys, "signed strategy attestation");
  schema(value.schemaVersion, "signed strategy attestation");
  const proofValue = exact(value.proof, proofKeys, "strategy evidence proof");
  if (
    proofValue.algorithm !== MESH_SIGNATURE_ALGORITHM ||
    !SIGNATURE.test(String(proofValue.value))
  )
    fail("strategy evidence proof is invalid");
  const proof = freeze({
    algorithm: MESH_SIGNATURE_ALGORITHM,
    keyId: identifier(proofValue.keyId, "attestation.proof.keyId"),
    value: String(proofValue.value),
  });
  const content = normalizeAttestationContent({
    ...value,
    cohort: validatePeerStrategyEvidenceCohortV1(value.cohort),
    binding: validatePeerStrategyEvidenceBindingV1(value.binding),
  });
  const attestationDigest = digest(
    "peer-strategy-outcome-attestation",
    content,
  );
  if (
    value.attestationDigest !== attestationDigest ||
    value.attestationId !== `strategy-evidence.${attestationDigest.slice(7)}`
  )
    fail("strategy evidence attestation binding is invalid");
  return freeze({
    ...content,
    attestationId: value.attestationId as string,
    attestationDigest,
    proof,
  });
}

export async function verifySignedPeerStrategyOutcomeAttestationV1(input: {
  readonly attestation: unknown;
  readonly publicKey: CryptoKey;
  readonly crypto?: Crypto;
}): Promise<SignedPeerStrategyOutcomeAttestationV1 | null> {
  let attestation: SignedPeerStrategyOutcomeAttestationV1;
  try {
    attestation = validateSignedPeerStrategyOutcomeAttestationV1(
      input.attestation,
    );
  } catch {
    return null;
  }
  if (!publicKey(input.publicKey)) return null;
  const { value, ...proof } = attestation.proof;
  const unsigned = { ...attestation, proof };
  try {
    const verified = await cryptoOf(input.crypto).subtle.verify(
      MESH_SIGNATURE_ALGORITHM,
      input.publicKey,
      decodeBase64Url(value),
      signingBytes(unsigned),
    );
    return verified ? attestation : null;
  } catch {
    return null;
  }
}

export function createPeerStrategyEvidenceStateV1(input: {
  readonly stateKey: string;
  readonly exchangerId: string;
  readonly exchangerVersion: number;
  readonly implementationId: string;
  readonly policy: PeerStrategyEvidencePolicyRecordV1;
  readonly revision?: number;
  readonly logicalTimeHighWaterMs?: number;
  readonly sourceHeads?: readonly PeerStrategyEvidenceSourceHeadV1[];
  readonly attestations?: readonly SignedPeerStrategyOutcomeAttestationV1[];
  readonly pendingAttestations?: readonly SignedPeerStrategyOutcomeAttestationV1[];
  readonly certificates?: readonly PeerStrategyEvidenceCertificateV1[];
  readonly predecessorStateDigest?: PlanningDigestV1 | null;
}): PeerStrategyEvidenceStateV1 {
  const policy = validatePeerStrategyEvidenceExchangePolicyV1(input.policy);
  const attestations = normalizeAttestations(
    input.attestations ?? [],
    policy.policy.limits.maximumAttestations,
    policy.policy.limits.maximumAttestationsPerPeer,
  );
  const sourceHeads = normalizeSourceHeads(
    input.sourceHeads ?? [],
    policy.policy.limits.maximumSourceHeads,
  );
  const pendingAttestations = normalizeAttestations(
    input.pendingAttestations ?? [],
    policy.policy.limits.maximumAttestations,
    policy.policy.limits.maximumAttestationsPerPeer,
  );
  const overlap = new Set(attestations.map(({ attestationDigest }) => attestationDigest));
  if (pendingAttestations.some(({ attestationDigest }) => overlap.has(attestationDigest)))
    fail("strategy evidence pending and admitted attestations overlap");
  const retainedAttestations = [...attestations, ...pendingAttestations];
  if (retainedAttestations.length > policy.policy.limits.maximumAttestations)
    fail("strategy evidence retained attestation limit is exceeded");
  const retainedPerPeer = new Map<string, number>();
  for (const attestation of retainedAttestations) {
    const count = (retainedPerPeer.get(attestation.issuerPeerId) ?? 0) + 1;
    if (count > policy.policy.limits.maximumAttestationsPerPeer)
      fail("strategy evidence retained per-peer limit is exceeded");
    retainedPerPeer.set(attestation.issuerPeerId, count);
  }
  assertAttestationStateConsistency(
    attestations,
    pendingAttestations,
    sourceHeads,
  );
  const certificates = normalizeCertificates(
    input.certificates ?? [],
    policy,
  );
  const body = freeze({
    format: PEER_STRATEGY_EVIDENCE_STATE_FORMAT_V1,
    schemaVersion: PEER_STRATEGY_EVIDENCE_SCHEMA_VERSION_V1,
    stateKey: identifier(input.stateKey, "state.stateKey"),
    exchangerId: identifier(input.exchangerId, "state.exchangerId"),
    exchangerVersion: positive(
      input.exchangerVersion,
      "state.exchangerVersion",
    ),
    implementationId: identifier(
      input.implementationId,
      "state.implementationId",
    ),
    policyId: policy.policy.policyId,
    policyVersion: policy.policy.policyVersion,
    policyDigest: policy.policyDigest,
    revision: nonNegative(input.revision ?? 0, "state.revision"),
    logicalTimeHighWaterMs: nonNegative(
      input.logicalTimeHighWaterMs ?? 0,
      "state.logicalTimeHighWaterMs",
    ),
    sourceHeads,
    attestations,
    pendingAttestations,
    certificates,
    predecessorStateDigest: nullableSha(
      input.predecessorStateDigest ?? null,
      "state.predecessorStateDigest",
    ),
  });
  return freeze({
    ...body,
    stateDigest: digest("peer-strategy-evidence-state", body),
  });
}

export function validatePeerStrategyEvidenceStateV1(
  input: unknown,
  options: { readonly policy: PeerStrategyEvidencePolicyRecordV1 },
): PeerStrategyEvidenceStateV1 {
  const value = exact(input, stateKeys, "strategy evidence state");
  if (
    value.format !== PEER_STRATEGY_EVIDENCE_STATE_FORMAT_V1 ||
    value.schemaVersion !== PEER_STRATEGY_EVIDENCE_SCHEMA_VERSION_V1
  )
    fail("strategy evidence state format is invalid");
  const rebuilt = createPeerStrategyEvidenceStateV1({
    stateKey: value.stateKey as string,
    exchangerId: value.exchangerId as string,
    exchangerVersion: value.exchangerVersion as number,
    implementationId: value.implementationId as string,
    policy: options.policy,
    revision: value.revision as number,
    logicalTimeHighWaterMs: value.logicalTimeHighWaterMs as number,
    sourceHeads: value.sourceHeads as readonly PeerStrategyEvidenceSourceHeadV1[],
    attestations:
      value.attestations as readonly SignedPeerStrategyOutcomeAttestationV1[],
    pendingAttestations:
      value.pendingAttestations as readonly SignedPeerStrategyOutcomeAttestationV1[],
    certificates:
      value.certificates as readonly PeerStrategyEvidenceCertificateV1[],
    predecessorStateDigest:
      value.predecessorStateDigest as PlanningDigestV1 | null,
  });
  if (
    value.policyId !== rebuilt.policyId ||
    value.policyVersion !== rebuilt.policyVersion ||
    value.policyDigest !== rebuilt.policyDigest ||
    value.stateDigest !== rebuilt.stateDigest
  )
    fail("strategy evidence state binding or digest is invalid");
  return rebuilt;
}

export function reducePeerStrategyEvidenceAdmissionV1(input: {
  readonly state: PeerStrategyEvidenceStateV1;
  readonly policy: PeerStrategyEvidencePolicyRecordV1;
  readonly attestation: SignedPeerStrategyOutcomeAttestationV1;
  readonly eligibility: PeerStrategyEvidenceEligibilityDecisionV1;
  readonly logicalTimeMs: number;
}): {
  readonly state: PeerStrategyEvidenceStateV1;
  readonly decision: PeerStrategyEvidenceAdmissionDecisionV1;
} {
  const policy = validatePeerStrategyEvidenceExchangePolicyV1(input.policy);
  const state = validatePeerStrategyEvidenceStateV1(input.state, { policy });
  const attestation = validateSignedPeerStrategyOutcomeAttestationV1(
    input.attestation,
  );
  const logicalTimeMs = nonNegative(input.logicalTimeMs, "admission.logicalTimeMs");
  if (logicalTimeMs < state.logicalTimeHighWaterMs)
    fail("strategy evidence logical time rolled back");
  const eligibility = normalizeEligibility(input.eligibility, attestation);
  const reasonCodes = new Set<string>();
  let status: PeerStrategyEvidenceAdmissionDecisionV1["status"] = "admitted";
  if (
    attestation.cohort.tenantId === "" ||
    attestation.binding.feedbackSchemaDigest !== policy.policy.feedbackSchemaDigest
  ) {
    status = "rejected";
    reasonCodes.add("feedback_schema_mismatch");
  } else if (
    attestation.feedbackSignalDigests.length >
    policy.policy.limits.maximumFeedbackSignalDigests
  ) {
    status = "rejected";
    reasonCodes.add("feedback_provenance_limit_exceeded");
  } else if (
    attestation.observedAtLogicalMs >
    logicalTimeMs + policy.policy.limits.maximumFutureSkewMs
  ) {
    status = "rejected";
    reasonCodes.add("future_dated");
  } else if (attestation.expiresAtLogicalMs <= logicalTimeMs) {
    status = "rejected";
    reasonCodes.add("expired");
  } else if (
    attestation.expiresAtLogicalMs - attestation.observedAtLogicalMs >
    policy.policy.limits.maximumAttestationTtlMs
  ) {
    status = "rejected";
    reasonCodes.add("ttl_exceeded");
  } else if (
    eligibility.disposition !== "eligible" ||
    eligibility.expiresAtLogicalMs <= logicalTimeMs
  ) {
    status = "rejected";
    reasonCodes.add(`eligibility_${eligibility.disposition}`);
  }

  const prunedAttestations = state.attestations.filter(
    ({ expiresAtLogicalMs }) => expiresAtLogicalMs > logicalTimeMs,
  );
  const prunedPendingAttestations = state.pendingAttestations.filter(
    ({ expiresAtLogicalMs }) => expiresAtLogicalMs > logicalTimeMs,
  );
  const prunedCertificates = state.certificates.filter(
    ({ expiresAtLogicalMs }) => expiresAtLogicalMs > logicalTimeMs,
  );
  const prunedHeads = state.sourceHeads.filter(
    ({ expiresAtLogicalMs }) => expiresAtLogicalMs > logicalTimeMs,
  );
  const headKey = sourceHeadKey(attestation);
  const head = prunedHeads.find((candidate) => candidate.headKey === headKey);
  const existing = prunedAttestations.find(
    ({ attestationDigest }) =>
      attestationDigest === attestation.attestationDigest,
  );
  const pending = prunedPendingAttestations.find(
    ({ attestationDigest }) =>
      attestationDigest === attestation.attestationDigest,
  );
  const pendingConflict = prunedPendingAttestations.find(
    (candidate) =>
      candidate.issuerPeerId === attestation.issuerPeerId &&
      candidate.issuerInstanceId === attestation.issuerInstanceId &&
      candidate.issuerStreamId === attestation.issuerStreamId &&
      candidate.issuerSequence === attestation.issuerSequence &&
      candidate.attestationDigest !== attestation.attestationDigest,
  );
  const admittedConflict = prunedAttestations.find(
    (candidate) =>
      candidate.issuerPeerId === attestation.issuerPeerId &&
      candidate.issuerInstanceId === attestation.issuerInstanceId &&
      candidate.issuerStreamId === attestation.issuerStreamId &&
      candidate.issuerSequence === attestation.issuerSequence &&
      candidate.attestationDigest !== attestation.attestationDigest,
  );
  let quarantineSource = false;
  let rotateSource = false;
  if (status === "admitted" && existing) {
    status = "duplicate";
    reasonCodes.add("duplicate_attestation");
  } else if (
    status === "admitted" &&
    (pendingConflict || admittedConflict)
  ) {
    status = "rejected";
    quarantineSource = true;
    reasonCodes.add("source_equivocation");
  } else if (status === "admitted" && head) {
    const newerMembershipEpoch =
      attestation.membershipEpoch > head.membershipEpoch;
    const instanceChanged =
      attestation.issuerInstanceId !== head.issuerInstanceId;
    const streamChanged = attestation.issuerStreamId !== head.issuerStreamId;
    const freshEpochStream =
      newerMembershipEpoch &&
      streamChanged &&
      attestation.issuerSequence === 1 &&
      attestation.predecessorAttestationDigest === null;
    const continuedEpochStream =
      newerMembershipEpoch &&
      !streamChanged &&
      attestation.issuerSequence === head.issuerSequence + 1 &&
      attestation.predecessorAttestationDigest === head.attestationDigest;
    if (
      head.equivocated &&
      !(
        (instanceChanged || streamChanged) &&
        (freshEpochStream || continuedEpochStream)
      )
    ) {
      status = "rejected";
      reasonCodes.add("source_quarantined");
    } else if (attestation.membershipEpoch < head.membershipEpoch) {
      status = "rejected";
      reasonCodes.add("membership_epoch_rollback");
    } else if (
      !newerMembershipEpoch &&
      attestation.membershipConfigurationDigest !==
        head.membershipConfigurationDigest
    ) {
      status = "rejected";
      reasonCodes.add("membership_configuration_conflict");
    } else if (!newerMembershipEpoch && instanceChanged) {
      status = "rejected";
      reasonCodes.add("source_instance_changed");
    } else if (streamChanged && !freshEpochStream) {
      status = "rejected";
      reasonCodes.add("source_stream_changed");
    } else if (freshEpochStream) {
      rotateSource = true;
      reasonCodes.add("source_epoch_rotated");
    } else if (
      newerMembershipEpoch &&
      attestation.issuerSequence <= head.issuerSequence
    ) {
      status = "rejected";
      reasonCodes.add("source_revision_rollback");
    } else if (attestation.issuerSequence < head.issuerSequence) {
      status = "rejected";
      reasonCodes.add("source_revision_rollback");
    } else if (attestation.issuerSequence === head.issuerSequence) {
      status = "rejected";
      quarantineSource = true;
      reasonCodes.add("source_equivocation");
    } else if (attestation.issuerSequence > head.issuerSequence + 1) {
      status = "pending_predecessor";
      reasonCodes.add("predecessor_missing");
    } else if (
      attestation.predecessorAttestationDigest !== head.attestationDigest
    ) {
      status = "rejected";
      quarantineSource = true;
      reasonCodes.add("predecessor_conflict");
    } else if (newerMembershipEpoch && instanceChanged) {
      rotateSource = true;
      reasonCodes.add("source_epoch_rotated");
    }
  } else if (
    status === "admitted" &&
    (attestation.issuerSequence !== 1 ||
      attestation.predecessorAttestationDigest !== null)
  ) {
    status = "pending_predecessor";
    reasonCodes.add("predecessor_missing");
  }

  if (status === "pending_predecessor" && pending)
    reasonCodes.add("pending_attestation_retained");

  const retainedAttestations = [
    ...prunedAttestations,
    ...prunedPendingAttestations,
  ];
  const perPeer = retainedAttestations.filter(
    ({ issuerPeerId }) => issuerPeerId === attestation.issuerPeerId,
  ).length;
  const createsRetention =
    (status === "admitted" || status === "pending_predecessor") &&
    !existing &&
    !pending;
  if (
    createsRetention &&
    (retainedAttestations.length >= policy.policy.limits.maximumAttestations ||
      perPeer >= policy.policy.limits.maximumAttestationsPerPeer)
  ) {
    status = "rejected";
    reasonCodes.add("retention_capacity_exceeded");
  }
  if (
    (status === "admitted" || status === "pending_predecessor") &&
    !head &&
    prunedHeads.length >= policy.policy.limits.maximumSourceHeads
  ) {
    status = "rejected";
    reasonCodes.add("source_head_capacity_exceeded");
  }
  if (status === "admitted") reasonCodes.add("attestation_admitted");
  if (quarantineSource) reasonCodes.add("source_quarantined");

  const priorStateRevision = state.revision;
  const committedStateRevision =
    status === "admitted" ||
    (status === "pending_predecessor" && !pending) ||
    quarantineSource ||
    prunedAttestations.length !== state.attestations.length ||
    prunedPendingAttestations.length !== state.pendingAttestations.length ||
    prunedCertificates.length !== state.certificates.length ||
    prunedHeads.length !== state.sourceHeads.length
      ? priorStateRevision + 1
      : priorStateRevision;
  const decisionBody = freeze({
    schemaVersion: PEER_STRATEGY_EVIDENCE_SCHEMA_VERSION_V1,
    attestationId: attestation.attestationId,
    attestationDigest: attestation.attestationDigest,
    status,
    eligibilityDecisionDigest: eligibility.decisionDigest,
    reasonCodes: boundedReasonCodes(reasonCodes, policy),
    priorStateRevision,
    committedStateRevision,
  });
  const decision = freeze({
    ...decisionBody,
    admissionDecisionDigest: digest(
      "peer-strategy-evidence-admission",
      decisionBody,
    ),
  });
  if (committedStateRevision === priorStateRevision)
    return freeze({ state, decision });
  const nextHeads = new Map(prunedHeads.map((current) => [current.headKey, current]));
  if (quarantineSource) {
    if (head || nextHeads.size < policy.policy.limits.maximumSourceHeads)
      nextHeads.set(headKey, equivocatedSourceHead(attestation, head));
  } else if (status === "admitted") {
    nextHeads.set(headKey, sourceHead(attestation));
  }
  const retainedAdmittedAttestations = quarantineSource || rotateSource
    ? prunedAttestations.filter(
        (candidate) => !sameIssuerPeer(candidate, attestation),
      )
    : prunedAttestations;
  const retainedPendingAttestations = quarantineSource
    ? prunedPendingAttestations.filter(
        (candidate) => !sameIssuerPeer(candidate, attestation),
      )
    : status === "admitted"
      ? prunedPendingAttestations.filter(
          (candidate) =>
            !sameIssuerPeer(candidate, attestation) ||
            (candidate.issuerStreamId === attestation.issuerStreamId &&
              candidate.membershipEpoch >= attestation.membershipEpoch &&
              candidate.issuerSequence > attestation.issuerSequence &&
              (candidate.issuerInstanceId === attestation.issuerInstanceId ||
                candidate.membershipEpoch > attestation.membershipEpoch)),
        )
      : prunedPendingAttestations;
  const nextPendingAttestations =
    status === "admitted"
      ? retainedPendingAttestations.filter(
          ({ attestationDigest }) =>
            attestationDigest !== attestation.attestationDigest,
        )
      : status === "pending_predecessor" && !pending
        ? [...retainedPendingAttestations, attestation].sort(attestationOrder)
        : retainedPendingAttestations;
  const nextState = createPeerStrategyEvidenceStateV1({
    stateKey: state.stateKey,
    exchangerId: state.exchangerId,
    exchangerVersion: state.exchangerVersion,
    implementationId: state.implementationId,
    policy,
    revision: committedStateRevision,
    logicalTimeHighWaterMs: logicalTimeMs,
    sourceHeads: [...nextHeads.values()].sort(headOrder),
    attestations:
      status === "admitted"
        ? [...retainedAdmittedAttestations, attestation].sort(attestationOrder)
        : retainedAdmittedAttestations,
    pendingAttestations: nextPendingAttestations,
    certificates: prunedCertificates,
    predecessorStateDigest: state.predecessorStateDigest,
  });
  return freeze({ state: nextState, decision });
}

export class PeerStrategyEvidenceExchangeRuntimeV1
  implements PeerStrategyEvidenceExchangePortV1
{
  readonly exchangerId: string;
  readonly exchangerVersion: number;
  readonly implementationId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyDigest: PlanningDigestV1;
  readonly #stateKey: string;
  readonly #policy: PeerStrategyEvidencePolicyRecordV1;
  readonly #eligibility: PeerStrategyEvidenceRuntimeOptionsV1["eligibility"];
  readonly #independence: PeerStrategyEvidenceIndependencePortV1;
  readonly #store: PeerStrategyEvidenceStoreV1;

  constructor(options: PeerStrategyEvidenceRuntimeOptionsV1) {
    if (!options || typeof options !== "object")
      fail("strategy evidence runtime options are required");
    this.#stateKey = identifier(options.stateKey, "runtime.stateKey");
    this.exchangerId = identifier(options.exchangerId, "runtime.exchangerId");
    this.exchangerVersion = positive(
      options.exchangerVersion,
      "runtime.exchangerVersion",
    );
    this.implementationId = identifier(
      options.implementationId,
      "runtime.implementationId",
    );
    this.#policy = validatePeerStrategyEvidenceExchangePolicyV1(options.policy);
    this.policyId = this.#policy.policy.policyId;
    this.policyVersion = this.#policy.policy.policyVersion;
    this.policyDigest = this.#policy.policyDigest;
    if (!options.eligibility || typeof options.eligibility.evaluate !== "function")
      fail("strategy evidence eligibility port is required");
    if (!options.independence || typeof options.independence.classify !== "function")
      fail("strategy evidence independence port is required");
    if (
      !options.store ||
      typeof options.store.load !== "function" ||
      typeof options.store.save !== "function"
    )
      fail("strategy evidence store is required");
    this.#eligibility = options.eligibility;
    this.#independence = options.independence;
    this.#store = options.store;
  }

  async admit(input: {
    readonly attestation: SignedPeerStrategyOutcomeAttestationV1;
    readonly logicalTimeMs: number;
  }): Promise<PeerStrategyEvidenceAdmissionDecisionV1> {
    const attestation = validateSignedPeerStrategyOutcomeAttestationV1(
      input.attestation,
    );
    const logicalTimeMs = nonNegative(input.logicalTimeMs, "admit.logicalTimeMs");
    const eligibility = normalizeEligibility(
      await this.#eligibility.evaluate({ attestation, logicalTimeMs }),
      attestation,
    );
    for (
      let attempt = 0;
      attempt < this.#policy.policy.limits.maximumCommitAttempts;
      attempt += 1
    ) {
      const loaded = await this.#store.load(this.#stateKey);
      const state = loaded ? this.#validateState(loaded) : this.#initialState();
      this.#assertRuntimeBinding(state);
      const result = reducePeerStrategyEvidenceAdmissionV1({
        state,
        policy: this.#policy,
        attestation,
        eligibility,
        logicalTimeMs,
      });
      const committedState = await this.#drainReadyPendingState(
        result.state,
        logicalTimeMs,
      );
      if (committedState.revision === state.revision) return result.decision;
      if (
        await this.#store.save({
          state: committedState,
          expectedRevision: loaded ? state.revision : null,
        })
      )
        return result.decision;
    }
    throw new Error("peer_strategy_evidence_admission_commit_conflict");
  }

  async certify(input: {
    readonly cohort: PeerStrategyEvidenceCohortV1;
    readonly binding: PeerStrategyEvidenceBindingV1;
    readonly logicalTimeMs: number;
  }): Promise<PeerStrategyEvidenceCertificateDecisionV1> {
    const cohort = validatePeerStrategyEvidenceCohortV1(input.cohort);
    const binding = validatePeerStrategyEvidenceBindingV1(input.binding);
    const logicalTimeMs = nonNegative(input.logicalTimeMs, "certify.logicalTimeMs");
    for (
      let attempt = 0;
      attempt < this.#policy.policy.limits.maximumCommitAttempts;
      attempt += 1
    ) {
      const loaded = await this.#store.load(this.#stateKey);
      const state = loaded ? this.#validateState(loaded) : this.#initialState();
      this.#assertRuntimeBinding(state);
      if (logicalTimeMs < state.logicalTimeHighWaterMs)
        fail("strategy evidence certification logical time rolled back");
      const eligible = await this.#eligibleEvidence(
        state,
        cohort,
        binding,
        logicalTimeMs,
      );
      const result = buildCertificateDecision({
        state,
        policy: this.#policy,
        cohort,
        binding,
        logicalTimeMs,
        eligible,
      });
      if (result.state.revision === state.revision) return result.decision;
      if (
        await this.#store.save({
          state: result.state,
          expectedRevision: loaded ? state.revision : null,
        })
      )
        return result.decision;
    }
    throw new Error("peer_strategy_evidence_certificate_commit_conflict");
  }

  async resolvePriors(input: {
    readonly cohort: PeerStrategyEvidenceCohortV1;
    readonly binding: PeerStrategyEvidenceBindingV1;
    readonly logicalTimeMs: number;
  }): Promise<readonly PeerStrategyEvidenceAdvisoryPriorV1[]> {
    const decision = await this.certify(input);
    if (!decision.certificate) return freeze([]);
    const certificate = decision.certificate;
    const influenceBps = Math.floor(
      (this.#policy.policy.maximumPriorInfluenceBps *
        certificate.confidenceBps) /
        BPS,
    );
    const body = freeze({
      schemaVersion: PEER_STRATEGY_EVIDENCE_SCHEMA_VERSION_V1,
      strategyId: certificate.binding.strategyId,
      strategyDigest: certificate.binding.strategyDigest,
      certificateDigest: certificate.certificateDigest,
      outcome: certificate.outcome,
      metrics: certificate.metrics,
      confidenceBps: certificate.confidenceBps,
      influenceBps,
      observedAtLogicalMs: certificate.certifiedAtLogicalMs,
      validUntilLogicalMs: certificate.expiresAtLogicalMs,
    });
    return freeze([
      freeze({
        ...body,
        priorDigest: digest("peer-strategy-evidence-prior", body),
      }),
    ]);
  }

  async loadState(): Promise<PeerStrategyEvidenceStateV1> {
    const loaded = await this.#store.load(this.#stateKey);
    return loaded ? this.#validateState(loaded) : this.#initialState();
  }

  async exportHandoff(input: {
    readonly targetStateKey: string;
    readonly logicalTimeMs: number;
  }): Promise<PeerStrategyEvidenceHandoffEnvelopeV1> {
    const targetStateKey = identifier(
      input.targetStateKey,
      "handoff.targetStateKey",
    );
    if (targetStateKey === this.#stateKey)
      fail("strategy evidence handoff target must differ from source");
    const logicalTimeMs = nonNegative(input.logicalTimeMs, "handoff.logicalTimeMs");
    const sourceState = await this.loadState();
    if (logicalTimeMs < sourceState.logicalTimeHighWaterMs)
      fail("strategy evidence handoff logical time rolled back");
    const body = freeze({
      format: PEER_STRATEGY_EVIDENCE_HANDOFF_FORMAT_V1,
      schemaVersion: PEER_STRATEGY_EVIDENCE_SCHEMA_VERSION_V1,
      contentClass: "peer_strategy_evidence_exchange_state" as const,
      exchangerId: this.exchangerId,
      exchangerVersion: this.exchangerVersion,
      implementationId: this.implementationId,
      policyDigest: this.policyDigest,
      sourceStateKey: sourceState.stateKey,
      sourceStateDigest: sourceState.stateDigest,
      targetStateKey,
      exportedAtLogicalMs: logicalTimeMs,
      sourceState,
    });
    return freeze({
      ...body,
      handoffDigest: digest("peer-strategy-evidence-handoff", body),
    });
  }

  async importHandoff(input: {
    readonly handoff: PeerStrategyEvidenceHandoffEnvelopeV1;
    readonly logicalTimeMs: number;
  }): Promise<PeerStrategyEvidenceStateV1> {
    const handoff = validatePeerStrategyEvidenceHandoffV1(input.handoff, {
      policy: this.#policy,
    });
    const logicalTimeMs = nonNegative(input.logicalTimeMs, "handoff.logicalTimeMs");
    if (
      handoff.targetStateKey !== this.#stateKey ||
      handoff.exchangerId !== this.exchangerId ||
      handoff.exchangerVersion !== this.exchangerVersion ||
      handoff.implementationId !== this.implementationId ||
      logicalTimeMs < handoff.exportedAtLogicalMs ||
      logicalTimeMs < handoff.sourceState.logicalTimeHighWaterMs
    )
      fail("strategy evidence handoff binding is invalid");
    const existing = await this.#store.load(this.#stateKey);
    if (existing) {
      const current = this.#validateState(existing);
      if (current.predecessorStateDigest === handoff.sourceStateDigest)
        return current;
      fail("strategy evidence handoff conflicts with existing state");
    }
    const source = handoff.sourceState;
    const restored = createPeerStrategyEvidenceStateV1({
      stateKey: this.#stateKey,
      exchangerId: this.exchangerId,
      exchangerVersion: this.exchangerVersion,
      implementationId: this.implementationId,
      policy: this.#policy,
      revision: 1,
      logicalTimeHighWaterMs: Math.max(
        logicalTimeMs,
        source.logicalTimeHighWaterMs,
      ),
      sourceHeads: source.sourceHeads,
      attestations: source.attestations,
      pendingAttestations: source.pendingAttestations,
      certificates: source.certificates,
      predecessorStateDigest: source.stateDigest,
    });
    const drained = await this.#drainReadyPendingState(restored, logicalTimeMs);
    if (await this.#store.save({ state: drained, expectedRevision: null }))
      return drained;
    const raced = await this.#store.load(this.#stateKey);
    if (raced) {
      const current = this.#validateState(raced);
      if (current.predecessorStateDigest === source.stateDigest) return current;
    }
    fail("strategy evidence handoff conflicts with existing state");
  }

  async #eligibleEvidence(
    state: PeerStrategyEvidenceStateV1,
    cohort: PeerStrategyEvidenceCohortV1,
    binding: PeerStrategyEvidenceBindingV1,
    logicalTimeMs: number,
  ): Promise<
    readonly {
      readonly attestation: SignedPeerStrategyOutcomeAttestationV1;
      readonly independenceGroupId: string;
    }[]
  > {
    const matching = state.attestations.filter(
      (attestation) =>
        attestation.expiresAtLogicalMs > logicalTimeMs &&
        attestation.cohort.cohortDigest === cohort.cohortDigest &&
        attestation.binding.bindingDigest === binding.bindingDigest &&
        attestation.confidenceBps >= this.#policy.policy.minimumConfidenceBps,
    );
    const candidates: {
      readonly attestation: SignedPeerStrategyOutcomeAttestationV1;
      readonly independenceGroupId: string;
    }[] = [];
    for (const attestation of matching) {
      const [eligibility, classification] = await Promise.all([
        this.#eligibility.evaluate({ attestation, logicalTimeMs }),
        this.#independence.classify({ attestation, logicalTimeMs }),
      ]);
      const normalized = normalizeEligibility(eligibility, attestation);
      if (
        normalized.disposition !== "eligible" ||
        normalized.expiresAtLogicalMs <= logicalTimeMs ||
        !classification ||
        classification.expiresAtLogicalMs <= logicalTimeMs
      )
        continue;
      identifier(
        classification.independenceGroupId,
        "independence.independenceGroupId",
      );
      sha(classification.classificationDigest, "independence.classificationDigest");
      candidates.push({
        attestation,
        independenceGroupId: classification.independenceGroupId,
      });
    }
    const byPeer = new Map<string, (typeof candidates)[number]>();
    for (const candidate of candidates.sort(evidenceOrder))
      if (!byPeer.has(candidate.attestation.issuerPeerId))
        byPeer.set(candidate.attestation.issuerPeerId, candidate);
    const byGroup = new Map<string, (typeof candidates)[number]>();
    for (const candidate of [...byPeer.values()].sort(evidenceOrder))
      if (!byGroup.has(candidate.independenceGroupId))
        byGroup.set(candidate.independenceGroupId, candidate);
    return freeze([...byGroup.values()].sort(evidenceOrder));
  }

  async #drainReadyPendingState(
    initialState: PeerStrategyEvidenceStateV1,
    logicalTimeMs: number,
  ): Promise<PeerStrategyEvidenceStateV1> {
    let state = initialState;
    const blocked = new Set<PlanningDigestV1>();
    for (
      let attempt = 0;
      attempt < this.#policy.policy.limits.maximumAttestations;
      attempt += 1
    ) {
      const successor = state.pendingAttestations.find((candidate) => {
        if (blocked.has(candidate.attestationDigest)) return false;
        const head = state.sourceHeads.find(
          (current) => current.headKey === sourceHeadKey(candidate),
        );
        return Boolean(
          head &&
            !head.equivocated &&
            candidate.issuerStreamId === head.issuerStreamId &&
            candidate.issuerSequence === head.issuerSequence + 1 &&
            candidate.predecessorAttestationDigest === head.attestationDigest,
        );
      });
      if (!successor) return state;
      const eligibility = normalizeEligibility(
        await this.#eligibility.evaluate({
          attestation: successor,
          logicalTimeMs,
        }),
        successor,
      );
      const result = reducePeerStrategyEvidenceAdmissionV1({
        state,
        policy: this.#policy,
        attestation: successor,
        eligibility,
        logicalTimeMs,
      });
      state = result.state;
      if (result.decision.status !== "admitted")
        blocked.add(successor.attestationDigest);
    }
    return state;
  }

  #initialState(): PeerStrategyEvidenceStateV1 {
    return createPeerStrategyEvidenceStateV1({
      stateKey: this.#stateKey,
      exchangerId: this.exchangerId,
      exchangerVersion: this.exchangerVersion,
      implementationId: this.implementationId,
      policy: this.#policy,
    });
  }

  #validateState(input: unknown): PeerStrategyEvidenceStateV1 {
    return validatePeerStrategyEvidenceStateV1(input, {
      policy: this.#policy,
    });
  }

  #assertRuntimeBinding(state: PeerStrategyEvidenceStateV1): void {
    if (
      state.stateKey !== this.#stateKey ||
      state.exchangerId !== this.exchangerId ||
      state.exchangerVersion !== this.exchangerVersion ||
      state.implementationId !== this.implementationId
    )
      fail("strategy evidence runtime binding changed");
  }
}

export class InMemoryPeerStrategyEvidenceStoreV1
  implements PeerStrategyEvidenceStoreV1
{
  readonly #states = new Map<string, PeerStrategyEvidenceStateV1>();
  readonly #policy: PeerStrategyEvidencePolicyRecordV1;

  constructor(policy: PeerStrategyEvidencePolicyRecordV1) {
    this.#policy = validatePeerStrategyEvidenceExchangePolicyV1(policy);
  }

  async load(stateKey: string): Promise<PeerStrategyEvidenceStateV1 | null> {
    const state = this.#states.get(stateKey);
    return state
      ? clone(validatePeerStrategyEvidenceStateV1(state, { policy: this.#policy }))
      : null;
  }

  async save(input: {
    readonly state: PeerStrategyEvidenceStateV1;
    readonly expectedRevision: number | null;
  }): Promise<boolean> {
    const state = validatePeerStrategyEvidenceStateV1(input.state, {
      policy: this.#policy,
    });
    const current = this.#states.get(state.stateKey);
    if (
      (input.expectedRevision === null && current) ||
      (input.expectedRevision !== null &&
        (!current || current.revision !== input.expectedRevision))
    )
      return false;
    this.#states.set(state.stateKey, clone(state));
    return true;
  }
}

export function validatePeerStrategyEvidenceCertificateV1(
  input: unknown,
  policyInput?: PeerStrategyEvidencePolicyRecordV1,
): PeerStrategyEvidenceCertificateV1 {
  const value = exact(input, certificateKeys, "strategy evidence certificate");
  schema(value.schemaVersion, "strategy evidence certificate");
  const binding = validatePeerStrategyEvidenceBindingV1(value.binding);
  const body = freeze({
    schemaVersion: PEER_STRATEGY_EVIDENCE_SCHEMA_VERSION_V1,
    policyDigest: sha(value.policyDigest, "certificate.policyDigest"),
    membershipEpoch: positive(
      value.membershipEpoch,
      "certificate.membershipEpoch",
    ),
    membershipConfigurationDigest: sha(
      value.membershipConfigurationDigest,
      "certificate.membershipConfigurationDigest",
    ),
    cohortDigest: sha(value.cohortDigest, "certificate.cohortDigest"),
    binding,
    attestationDigests: digestArray(
      value.attestationDigests,
      "certificate.attestationDigests",
      1024,
    ),
    attesterPeerIds: identifierArray(
      value.attesterPeerIds,
      "certificate.attesterPeerIds",
      1024,
    ),
    independenceGroupIds: identifierArray(
      value.independenceGroupIds,
      "certificate.independenceGroupIds",
      1024,
    ),
    outcome: outcome(value.outcome),
    metrics: normalizeMetricValues(value.metrics),
    confidenceBps: basisPoints(
      value.confidenceBps,
      "certificate.confidenceBps",
    ),
    certifiedAtLogicalMs: nonNegative(
      value.certifiedAtLogicalMs,
      "certificate.certifiedAtLogicalMs",
    ),
    expiresAtLogicalMs: positive(
      value.expiresAtLogicalMs,
      "certificate.expiresAtLogicalMs",
    ),
  });
  if (body.expiresAtLogicalMs <= body.certifiedAtLogicalMs)
    fail("strategy evidence certificate lifetime is invalid");
  if (
    body.attestationDigests.length !== body.attesterPeerIds.length ||
    body.attestationDigests.length !== body.independenceGroupIds.length
  )
    fail("strategy evidence certificate source coverage is invalid");
  const certificateDigest = digest("peer-strategy-evidence-certificate", body);
  if (
    value.certificateDigest !== certificateDigest ||
    value.certificateId !== `strategy-evidence-certificate.${certificateDigest.slice(7)}`
  )
    fail("strategy evidence certificate binding is invalid");
  if (policyInput) {
    const policy = validatePeerStrategyEvidenceExchangePolicyV1(policyInput);
    if (
      body.policyDigest !== policy.policyDigest ||
      body.binding.feedbackSchemaDigest !== policy.policy.feedbackSchemaDigest ||
      body.attestationDigests.length < policy.policy.minimumDistinctPeers ||
      body.independenceGroupIds.length <
        policy.policy.minimumDistinctIndependenceGroups ||
      body.attestationDigests.length > policy.policy.limits.maximumAttestations
    )
      fail("strategy evidence certificate policy binding is invalid");
  }
  return freeze({
    ...body,
    certificateId: value.certificateId as string,
    certificateDigest,
  });
}

export function validatePeerStrategyEvidenceHandoffV1(
  input: unknown,
  options: { readonly policy: PeerStrategyEvidencePolicyRecordV1 },
): PeerStrategyEvidenceHandoffEnvelopeV1 {
  const value = exact(
    input,
    [
      "contentClass",
      "exchangerId",
      "exchangerVersion",
      "exportedAtLogicalMs",
      "format",
      "handoffDigest",
      "implementationId",
      "policyDigest",
      "schemaVersion",
      "sourceState",
      "sourceStateDigest",
      "sourceStateKey",
      "targetStateKey",
    ],
    "strategy evidence handoff",
  );
  if (
    value.format !== PEER_STRATEGY_EVIDENCE_HANDOFF_FORMAT_V1 ||
    value.schemaVersion !== PEER_STRATEGY_EVIDENCE_SCHEMA_VERSION_V1 ||
    value.contentClass !== "peer_strategy_evidence_exchange_state"
  )
    fail("strategy evidence handoff format is invalid");
  const sourceState = validatePeerStrategyEvidenceStateV1(value.sourceState, {
    policy: options.policy,
  });
  const body = freeze({
    format: PEER_STRATEGY_EVIDENCE_HANDOFF_FORMAT_V1,
    schemaVersion: PEER_STRATEGY_EVIDENCE_SCHEMA_VERSION_V1,
    contentClass: "peer_strategy_evidence_exchange_state" as const,
    exchangerId: identifier(value.exchangerId, "handoff.exchangerId"),
    exchangerVersion: positive(
      value.exchangerVersion,
      "handoff.exchangerVersion",
    ),
    implementationId: identifier(
      value.implementationId,
      "handoff.implementationId",
    ),
    policyDigest: sha(value.policyDigest, "handoff.policyDigest"),
    sourceStateKey: identifier(value.sourceStateKey, "handoff.sourceStateKey"),
    sourceStateDigest: sha(
      value.sourceStateDigest,
      "handoff.sourceStateDigest",
    ),
    targetStateKey: identifier(value.targetStateKey, "handoff.targetStateKey"),
    exportedAtLogicalMs: nonNegative(
      value.exportedAtLogicalMs,
      "handoff.exportedAtLogicalMs",
    ),
    sourceState,
  });
  if (
    body.policyDigest !== options.policy.policyDigest ||
    body.sourceStateKey !== sourceState.stateKey ||
    body.sourceStateDigest !== sourceState.stateDigest ||
    body.exchangerId !== sourceState.exchangerId ||
    body.exchangerVersion !== sourceState.exchangerVersion ||
    body.implementationId !== sourceState.implementationId
  )
    fail("strategy evidence handoff state binding is invalid");
  const handoffDigest = digest("peer-strategy-evidence-handoff", body);
  if (value.handoffDigest !== handoffDigest)
    fail("strategy evidence handoff digest is invalid");
  return freeze({ ...body, handoffDigest });
}

function buildCertificateDecision(input: {
  readonly state: PeerStrategyEvidenceStateV1;
  readonly policy: PeerStrategyEvidencePolicyRecordV1;
  readonly cohort: PeerStrategyEvidenceCohortV1;
  readonly binding: PeerStrategyEvidenceBindingV1;
  readonly logicalTimeMs: number;
  readonly eligible: readonly {
    readonly attestation: SignedPeerStrategyOutcomeAttestationV1;
    readonly independenceGroupId: string;
  }[];
}): {
  readonly state: PeerStrategyEvidenceStateV1;
  readonly decision: PeerStrategyEvidenceCertificateDecisionV1;
} {
  const reasonCodes = new Set<string>();
  const epochGroups = new Map<string, typeof input.eligible>();
  for (const candidate of input.eligible) {
    const key = `${candidate.attestation.membershipEpoch}\u0000${candidate.attestation.membershipConfigurationDigest}`;
    epochGroups.set(key, [...(epochGroups.get(key) ?? []), candidate]);
  }
  const selected = [...epochGroups.values()].sort(
    (left, right) =>
      right.length - left.length ||
      (right[0]?.attestation.membershipEpoch ?? 0) -
        (left[0]?.attestation.membershipEpoch ?? 0),
  )[0] ?? [];
  const peers = new Set(selected.map(({ attestation }) => attestation.issuerPeerId));
  const groups = new Set(selected.map(({ independenceGroupId }) => independenceGroupId));
  let certificate: PeerStrategyEvidenceCertificateV1 | null = null;
  let status: PeerStrategyEvidenceCertificateDecisionV1["status"] =
    "insufficient_evidence";
  if (peers.size < input.policy.policy.minimumDistinctPeers)
    reasonCodes.add("insufficient_distinct_peers");
  if (
    groups.size < input.policy.policy.minimumDistinctIndependenceGroups
  )
    reasonCodes.add("insufficient_independence_groups");
  if (
    peers.size >= input.policy.policy.minimumDistinctPeers &&
    groups.size >= input.policy.policy.minimumDistinctIndependenceGroups
  ) {
    const evidence = [...selected].sort(evidenceOrder);
    const first = evidence[0]!.attestation;
    const body = freeze({
      schemaVersion: PEER_STRATEGY_EVIDENCE_SCHEMA_VERSION_V1,
      policyDigest: input.policy.policyDigest,
      membershipEpoch: first.membershipEpoch,
      membershipConfigurationDigest: first.membershipConfigurationDigest,
      cohortDigest: input.cohort.cohortDigest,
      binding: input.binding,
      attestationDigests: freeze(
        evidence.map(({ attestation }) => attestation.attestationDigest).sort(compare),
      ),
      attesterPeerIds: freeze(
        evidence.map(({ attestation }) => attestation.issuerPeerId).sort(compare),
      ),
      independenceGroupIds: freeze(
        evidence.map(({ independenceGroupId }) => independenceGroupId).sort(compare),
      ),
      outcome: aggregateOutcome(evidence.map(({ attestation }) => attestation.outcome)),
      metrics: aggregateMetrics(evidence.map(({ attestation }) => attestation)),
      confidenceBps: lowerMedian(
        evidence.map(({ attestation }) => attestation.confidenceBps),
      ),
      certifiedAtLogicalMs: input.logicalTimeMs,
      expiresAtLogicalMs: Math.min(
        ...evidence.map(({ attestation }) => attestation.expiresAtLogicalMs),
      ),
    });
    const certificateDigest = digest("peer-strategy-evidence-certificate", body);
    certificate = freeze({
      ...body,
      certificateId: `strategy-evidence-certificate.${certificateDigest.slice(7)}`,
      certificateDigest,
    });
    certificate = validatePeerStrategyEvidenceCertificateV1(
      certificate,
      input.policy,
    );
    status = certificate.outcome === "unsafe" ? "unsafe" : "certified";
    reasonCodes.add(
      certificate.outcome === "unsafe"
        ? "unsafe_collective_evidence"
        : "evidence_certified",
    );
  }
  const priorStateRevision = input.state.revision;
  const previous = certificate
    ? input.state.certificates.find(
        (current) =>
          current.cohortDigest === certificate!.cohortDigest &&
          current.binding.bindingDigest === certificate!.binding.bindingDigest,
      )
    : null;
  if (
    certificate &&
    previous &&
    previous.expiresAtLogicalMs > input.logicalTimeMs &&
    same(previous.attestationDigests, certificate.attestationDigests)
  ) {
    certificate = previous;
    status = "idempotent";
    reasonCodes.add("certificate_idempotent");
  }
  if (certificate && previous?.certificateDigest === certificate.certificateDigest) {
    status = "idempotent";
    reasonCodes.add("certificate_idempotent");
  }
  const shouldCommit = Boolean(
    certificate && previous?.certificateDigest !== certificate.certificateDigest,
  );
  const committedStateRevision = shouldCommit
    ? priorStateRevision + 1
    : priorStateRevision;
  const decisionBody = freeze({
    schemaVersion: PEER_STRATEGY_EVIDENCE_SCHEMA_VERSION_V1,
    cohortDigest: input.cohort.cohortDigest,
    bindingDigest: input.binding.bindingDigest,
    status,
    certificate,
    reasonCodes: boundedReasonCodes(reasonCodes, input.policy),
    priorStateRevision,
    committedStateRevision,
  });
  const decision = freeze({
    ...decisionBody,
    certificateDecisionDigest: digest(
      "peer-strategy-evidence-certificate-decision",
      decisionBody,
    ),
  });
  if (!shouldCommit) return freeze({ state: input.state, decision });
  const retained = input.state.certificates.filter(
    (current) =>
      !(
        current.cohortDigest === certificate!.cohortDigest &&
        current.binding.bindingDigest === certificate!.binding.bindingDigest
      ) && current.expiresAtLogicalMs > input.logicalTimeMs,
  );
  if (retained.length >= input.policy.policy.limits.maximumCertificates)
    fail("strategy evidence certificate capacity is exceeded");
  const state = createPeerStrategyEvidenceStateV1({
    stateKey: input.state.stateKey,
    exchangerId: input.state.exchangerId,
    exchangerVersion: input.state.exchangerVersion,
    implementationId: input.state.implementationId,
    policy: input.policy,
    revision: committedStateRevision,
    logicalTimeHighWaterMs: input.logicalTimeMs,
    sourceHeads: input.state.sourceHeads,
    attestations: input.state.attestations,
    pendingAttestations: input.state.pendingAttestations,
    certificates: [...retained, certificate!].sort(certificateOrder),
    predecessorStateDigest: input.state.predecessorStateDigest,
  });
  return freeze({ state, decision });
}

function normalizeAttestationContent(input: Record<string, unknown>): Omit<
  UnsignedPeerStrategyOutcomeAttestationV1,
  "attestationId" | "attestationDigest" | "proof"
> {
  schema(input.schemaVersion, "strategy evidence attestation");
  const observedAtLogicalMs = nonNegative(
    input.observedAtLogicalMs,
    "attestation.observedAtLogicalMs",
  );
  const expiresAtLogicalMs = positive(
    input.expiresAtLogicalMs,
    "attestation.expiresAtLogicalMs",
  );
  if (expiresAtLogicalMs <= observedAtLogicalMs)
    fail("strategy evidence attestation lifetime is invalid");
  const issuerSequence = positive(
    input.issuerSequence,
    "attestation.issuerSequence",
  );
  const predecessorAttestationDigest = nullableSha(
    input.predecessorAttestationDigest,
    "attestation.predecessorAttestationDigest",
  );
  if (
    (issuerSequence === 1 && predecessorAttestationDigest !== null) ||
    (issuerSequence > 1 && predecessorAttestationDigest === null)
  )
    fail("strategy evidence predecessor binding is invalid");
  const cohort = validatePeerStrategyEvidenceCohortV1(input.cohort);
  const binding = validatePeerStrategyEvidenceBindingV1(input.binding);
  return freeze({
    schemaVersion: PEER_STRATEGY_EVIDENCE_SCHEMA_VERSION_V1,
    issuerPeerId: identifier(
      input.issuerPeerId,
      "attestation.issuerPeerId",
    ),
    issuerInstanceId: identifier(
      input.issuerInstanceId,
      "attestation.issuerInstanceId",
    ),
    issuerStreamId: identifier(
      input.issuerStreamId,
      "attestation.issuerStreamId",
    ),
    issuerSequence,
    predecessorAttestationDigest,
    membershipEpoch: positive(
      input.membershipEpoch,
      "attestation.membershipEpoch",
    ),
    membershipConfigurationDigest: sha(
      input.membershipConfigurationDigest,
      "attestation.membershipConfigurationDigest",
    ),
    cohort,
    binding,
    catalogDigest: sha(input.catalogDigest, "attestation.catalogDigest"),
    localPolicyDigest: sha(
      input.localPolicyDigest,
      "attestation.localPolicyDigest",
    ),
    selectionDecisionDigest: sha(
      input.selectionDecisionDigest,
      "attestation.selectionDecisionDigest",
    ),
    feedbackBatchDigest: sha(
      input.feedbackBatchDigest,
      "attestation.feedbackBatchDigest",
    ),
    feedbackDecisionDigest: sha(
      input.feedbackDecisionDigest,
      "attestation.feedbackDecisionDigest",
    ),
    feedbackSignalDigests: digestArray(
      input.feedbackSignalDigests,
      "attestation.feedbackSignalDigests",
      64,
    ),
    outcome: outcome(input.outcome),
    metrics: normalizeMetricValues(input.metrics),
    confidenceBps: basisPoints(
      input.confidenceBps,
      "attestation.confidenceBps",
    ),
    observedAtLogicalMs,
    expiresAtLogicalMs,
  });
}

function normalizeMetricValues(input: unknown): readonly PeerStrategyEvidenceMetricValueV1[] {
  if (!Array.isArray(input) || input.length !== LOCAL_STRATEGY_FEEDBACK_METRICS_V1.length)
    fail("strategy evidence metric coverage is invalid");
  const values = input
    .map((candidate) => {
      const value = exact(candidate, metricKeys, "strategy evidence metric");
      schema(value.schemaVersion, "strategy evidence metric");
      return freeze({
        schemaVersion: PEER_STRATEGY_EVIDENCE_SCHEMA_VERSION_V1,
        metric: metric(value.metric),
        valueMicros: integerRange(
          value.valueMicros,
          "metric.valueMicros",
          0,
          MICROS,
        ),
      });
    })
    .sort((left, right) => compare(left.metric, right.metric));
  if (
    !same(
      values.map(({ metric: current }) => current),
      [...LOCAL_STRATEGY_FEEDBACK_METRICS_V1].sort(compare),
    )
  )
    fail("strategy evidence metric coverage is invalid");
  return freeze(values);
}

function normalizeLimits(input: unknown): PeerStrategyEvidencePolicyV1["limits"] {
  const value = exact(input, limitsKeys, "strategy evidence limits");
  return freeze({
    maximumAttestations: bounded(
      value.maximumAttestations,
      "limits.maximumAttestations",
      65_536,
    ),
    maximumAttestationsPerPeer: bounded(
      value.maximumAttestationsPerPeer,
      "limits.maximumAttestationsPerPeer",
      4096,
    ),
    maximumSourceHeads: bounded(
      value.maximumSourceHeads,
      "limits.maximumSourceHeads",
      65_536,
    ),
    maximumCertificates: bounded(
      value.maximumCertificates,
      "limits.maximumCertificates",
      4096,
    ),
    maximumFeedbackSignalDigests: bounded(
      value.maximumFeedbackSignalDigests,
      "limits.maximumFeedbackSignalDigests",
      256,
    ),
    maximumAttestationTtlMs: bounded(
      value.maximumAttestationTtlMs,
      "limits.maximumAttestationTtlMs",
      604_800_000,
    ),
    maximumFutureSkewMs: integerRange(
      value.maximumFutureSkewMs,
      "limits.maximumFutureSkewMs",
      0,
      86_400_000,
    ),
    maximumReasonCodesPerDecision: bounded(
      value.maximumReasonCodesPerDecision,
      "limits.maximumReasonCodesPerDecision",
      64,
    ),
    maximumCommitAttempts: bounded(
      value.maximumCommitAttempts,
      "limits.maximumCommitAttempts",
      64,
    ),
    maximumGossipFanout: bounded(
      value.maximumGossipFanout,
      "limits.maximumGossipFanout",
      64,
    ),
    maximumGossipHops: bounded(
      value.maximumGossipHops,
      "limits.maximumGossipHops",
      128,
    ),
  });
}

function normalizeEligibility(
  input: unknown,
  attestation: SignedPeerStrategyOutcomeAttestationV1,
): PeerStrategyEvidenceEligibilityDecisionV1 {
  const value = exact(
    input,
    [
      "attestationDigest",
      "decisionDigest",
      "disposition",
      "expiresAtLogicalMs",
      "schemaVersion",
    ],
    "strategy evidence eligibility decision",
  );
  schema(value.schemaVersion, "strategy evidence eligibility decision");
  if (
    value.attestationDigest !== attestation.attestationDigest ||
    !["eligible", "restricted", "ineligible", "unavailable"].includes(
      String(value.disposition),
    )
  )
    fail("strategy evidence eligibility binding is invalid");
  return freeze({
    schemaVersion: PEER_STRATEGY_EVIDENCE_SCHEMA_VERSION_V1,
    attestationDigest: attestation.attestationDigest,
    disposition: value.disposition as PeerStrategyEvidenceEligibilityDecisionV1["disposition"],
    decisionDigest: sha(value.decisionDigest, "eligibility.decisionDigest"),
    expiresAtLogicalMs: positive(
      value.expiresAtLogicalMs,
      "eligibility.expiresAtLogicalMs",
    ),
  });
}

function normalizeAttestations(
  input: readonly SignedPeerStrategyOutcomeAttestationV1[],
  maximum: number,
  maximumPerPeer: number,
): readonly SignedPeerStrategyOutcomeAttestationV1[] {
  if (!Array.isArray(input) || input.length > maximum)
    fail("strategy evidence retained attestations are invalid");
  const values = input
    .map(validateSignedPeerStrategyOutcomeAttestationV1)
    .sort(attestationOrder);
  unique(values.map(({ attestationDigest }) => attestationDigest), "attestations");
  const counts = new Map<string, number>();
  for (const value of values) {
    const count = (counts.get(value.issuerPeerId) ?? 0) + 1;
    if (count > maximumPerPeer)
      fail("strategy evidence per-peer retention is exceeded");
    counts.set(value.issuerPeerId, count);
  }
  return freeze(values);
}

function normalizeSourceHeads(
  input: readonly PeerStrategyEvidenceSourceHeadV1[],
  maximum: number,
): readonly PeerStrategyEvidenceSourceHeadV1[] {
  if (!Array.isArray(input) || input.length > maximum)
    fail("strategy evidence source heads are invalid");
  const values = input
    .map((candidate) => {
      const value = exact(candidate, sourceHeadKeys, "strategy evidence source head");
      schema(value.schemaVersion, "strategy evidence source head");
      if (typeof value.equivocated !== "boolean")
        fail("strategy evidence source head disposition is invalid");
      const body = freeze({
        schemaVersion: PEER_STRATEGY_EVIDENCE_SCHEMA_VERSION_V1,
        issuerPeerId: identifier(value.issuerPeerId, "head.issuerPeerId"),
        issuerInstanceId: identifier(
          value.issuerInstanceId,
          "head.issuerInstanceId",
        ),
        issuerStreamId: identifier(value.issuerStreamId, "head.issuerStreamId"),
        membershipEpoch: positive(value.membershipEpoch, "head.membershipEpoch"),
        membershipConfigurationDigest: sha(
          value.membershipConfigurationDigest,
          "head.membershipConfigurationDigest",
        ),
        issuerSequence: positive(value.issuerSequence, "head.issuerSequence"),
        attestationDigest: sha(value.attestationDigest, "head.attestationDigest"),
        equivocated: value.equivocated,
        expiresAtLogicalMs: positive(
          value.expiresAtLogicalMs,
          "head.expiresAtLogicalMs",
        ),
      });
      const expectedKey = sourceHeadKey(body);
      if (value.headKey !== expectedKey)
        fail("strategy evidence source head key is invalid");
      return freeze({ ...body, headKey: expectedKey });
    })
    .sort(headOrder);
  unique(values.map(({ headKey }) => headKey), "source heads");
  return freeze(values);
}

function assertAttestationStateConsistency(
  admitted: readonly SignedPeerStrategyOutcomeAttestationV1[],
  pending: readonly SignedPeerStrategyOutcomeAttestationV1[],
  heads: readonly PeerStrategyEvidenceSourceHeadV1[],
): void {
  const bySequence = new Map<string, PlanningDigestV1>();
  for (const attestation of [...admitted, ...pending]) {
    const key = sourceSequenceKey(attestation, attestation.issuerSequence);
    const previous = bySequence.get(key);
    if (previous && previous !== attestation.attestationDigest)
      fail("strategy evidence state contains source equivocation");
    bySequence.set(key, attestation.attestationDigest);
  }
  for (const attestation of [...admitted, ...pending]) {
    if (attestation.issuerSequence === 1) continue;
    const predecessor = bySequence.get(
      sourceSequenceKey(attestation, attestation.issuerSequence - 1),
    );
    if (
      predecessor &&
      attestation.predecessorAttestationDigest !== predecessor
    )
      fail("strategy evidence retained causal chain is inconsistent");
  }
  for (const attestation of admitted) {
    const head = heads.find(
      (candidate) => candidate.headKey === sourceHeadKey(attestation),
    );
    if (
      !head ||
      head.equivocated ||
      head.issuerInstanceId !== attestation.issuerInstanceId ||
      head.issuerStreamId !== attestation.issuerStreamId ||
      head.membershipEpoch < attestation.membershipEpoch ||
      head.issuerSequence < attestation.issuerSequence
    )
      fail("strategy evidence admitted chain is inconsistent with its head");
  }
  for (const attestation of pending) {
    if (attestation.issuerSequence === 1)
      fail("strategy evidence initial attestation cannot be pending");
    const head = heads.find(
      (candidate) => candidate.headKey === sourceHeadKey(attestation),
    );
    if (
      head &&
      (head.equivocated ||
        attestation.membershipEpoch < head.membershipEpoch ||
        (attestation.membershipEpoch === head.membershipEpoch &&
          attestation.membershipConfigurationDigest !==
            head.membershipConfigurationDigest) ||
        (attestation.membershipEpoch === head.membershipEpoch &&
          attestation.issuerInstanceId !== head.issuerInstanceId) ||
        head.issuerStreamId !== attestation.issuerStreamId ||
        attestation.issuerSequence <= head.issuerSequence ||
        (attestation.issuerSequence === head.issuerSequence + 1 &&
          attestation.predecessorAttestationDigest !== head.attestationDigest))
    )
      fail("strategy evidence pending chain is inconsistent with its head");
  }
}

function sourceSequenceKey(
  attestation: Pick<
    SignedPeerStrategyOutcomeAttestationV1,
    "issuerPeerId" | "issuerInstanceId" | "issuerStreamId"
  >,
  sequence: number,
): string {
  return [
    attestation.issuerPeerId,
    attestation.issuerInstanceId,
    attestation.issuerStreamId,
    String(sequence),
  ].join("\u0000");
}

function normalizeCertificates(
  input: readonly PeerStrategyEvidenceCertificateV1[],
  policy: PeerStrategyEvidencePolicyRecordV1,
): readonly PeerStrategyEvidenceCertificateV1[] {
  if (!Array.isArray(input) || input.length > policy.policy.limits.maximumCertificates)
    fail("strategy evidence certificates are invalid");
  const values = input
    .map((candidate) => validatePeerStrategyEvidenceCertificateV1(candidate, policy))
    .sort(certificateOrder);
  unique(values.map(({ certificateDigest }) => certificateDigest), "certificates");
  return freeze(values);
}

function aggregateMetrics(
  attestations: readonly SignedPeerStrategyOutcomeAttestationV1[],
): readonly PeerStrategyEvidenceMetricValueV1[] {
  return freeze(
    [...LOCAL_STRATEGY_FEEDBACK_METRICS_V1]
      .sort(compare)
      .map((currentMetric) =>
        freeze({
          schemaVersion: PEER_STRATEGY_EVIDENCE_SCHEMA_VERSION_V1,
          metric: currentMetric,
          valueMicros: lowerMedian(
            attestations.map(
              (attestation) =>
                attestation.metrics.find(({ metric }) => metric === currentMetric)!
                  .valueMicros,
            ),
          ),
        }),
      ),
  );
}

function aggregateOutcome(
  values: readonly PeerStrategyEvidenceOutcomeV1[],
): PeerStrategyEvidenceOutcomeV1 {
  const rank: Record<PeerStrategyEvidenceOutcomeV1, number> = {
    success: 0,
    indeterminate: 1,
    failure: 2,
    unsafe: 3,
  };
  return [...values].sort((left, right) => rank[left] - rank[right])[
    Math.floor(values.length / 2)
  ]!;
}

function lowerMedian(values: readonly number[]): number {
  if (values.length === 0) fail("strategy evidence median is empty");
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor((ordered.length - 1) / 2)]!;
}

function sourceHead(
  attestation: SignedPeerStrategyOutcomeAttestationV1,
): PeerStrategyEvidenceSourceHeadV1 {
  return freeze({
    schemaVersion: PEER_STRATEGY_EVIDENCE_SCHEMA_VERSION_V1,
    headKey: sourceHeadKey(attestation),
    issuerPeerId: attestation.issuerPeerId,
    issuerInstanceId: attestation.issuerInstanceId,
    issuerStreamId: attestation.issuerStreamId,
    membershipEpoch: attestation.membershipEpoch,
    membershipConfigurationDigest: attestation.membershipConfigurationDigest,
    issuerSequence: attestation.issuerSequence,
    attestationDigest: attestation.attestationDigest,
    equivocated: false,
    // Causal heads outlive individual evidence TTLs so restart or delay cannot
    // reopen an old sequence. A newer authenticated membership epoch can
    // rotate the instance or stream without allocating another peer head.
    expiresAtLogicalMs: Number.MAX_SAFE_INTEGER,
  });
}

function sameIssuerPeer(
  left: Pick<
    SignedPeerStrategyOutcomeAttestationV1,
    "issuerPeerId"
  >,
  right: Pick<
    SignedPeerStrategyOutcomeAttestationV1,
    "issuerPeerId"
  >,
): boolean {
  return left.issuerPeerId === right.issuerPeerId;
}

function boundedReasonCodes(
  values: ReadonlySet<string>,
  policy: PeerStrategyEvidencePolicyRecordV1,
): readonly string[] {
  return freeze(
    [...values]
      .sort(compare)
      .slice(0, policy.policy.limits.maximumReasonCodesPerDecision),
  );
}

function equivocatedSourceHead(
  attestation: SignedPeerStrategyOutcomeAttestationV1,
  current?: PeerStrategyEvidenceSourceHeadV1,
): PeerStrategyEvidenceSourceHeadV1 {
  const base = current ?? sourceHead(attestation);
  return freeze({ ...base, equivocated: true });
}

function sourceHeadKey(input: {
  readonly issuerPeerId: string;
}): string {
  const value = digest("peer-strategy-evidence-source-head", {
    issuerPeerId: identifier(input.issuerPeerId, "head.issuerPeerId"),
  });
  return `strategy-evidence-head.${value.slice(7)}`;
}

function attestationOrder(
  left: SignedPeerStrategyOutcomeAttestationV1,
  right: SignedPeerStrategyOutcomeAttestationV1,
): number {
  return (
    compare(left.issuerPeerId, right.issuerPeerId) ||
    compare(left.issuerInstanceId, right.issuerInstanceId) ||
    compare(left.issuerStreamId, right.issuerStreamId) ||
    left.issuerSequence - right.issuerSequence
  );
}

function headOrder(
  left: PeerStrategyEvidenceSourceHeadV1,
  right: PeerStrategyEvidenceSourceHeadV1,
): number {
  return compare(left.headKey, right.headKey);
}

function certificateOrder(
  left: PeerStrategyEvidenceCertificateV1,
  right: PeerStrategyEvidenceCertificateV1,
): number {
  return (
    compare(left.cohortDigest, right.cohortDigest) ||
    compare(left.binding.bindingDigest, right.binding.bindingDigest) ||
    compare(left.certificateDigest, right.certificateDigest)
  );
}

function evidenceOrder(
  left: {
    readonly attestation: SignedPeerStrategyOutcomeAttestationV1;
    readonly independenceGroupId: string;
  },
  right: {
    readonly attestation: SignedPeerStrategyOutcomeAttestationV1;
    readonly independenceGroupId: string;
  },
): number {
  return (
    right.attestation.observedAtLogicalMs -
      left.attestation.observedAtLogicalMs ||
    right.attestation.issuerSequence - left.attestation.issuerSequence ||
    compare(left.attestation.issuerPeerId, right.attestation.issuerPeerId) ||
    compare(left.independenceGroupId, right.independenceGroupId)
  );
}

function signingBytes(value: unknown): Uint8Array<ArrayBuffer> {
  const result = canonicalizeMeshJsonBytes({
    domain: "agentplat.peer-strategy-evidence-attestation.v1",
    attestation: value,
  });
  if (!result.ok) fail("strategy evidence signing document is invalid");
  return Uint8Array.from(result.value);
}

function base64url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function cryptoOf(value?: Crypto): Crypto {
  const crypto = value ?? globalThis.crypto;
  if (!crypto?.subtle) fail("strategy evidence crypto is unavailable");
  return crypto;
}

function privateKey(value: unknown): value is CryptoKey {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as CryptoKey).type === "private" &&
      (value as CryptoKey).algorithm?.name === MESH_SIGNATURE_ALGORITHM,
  );
}

function publicKey(value: unknown): value is CryptoKey {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as CryptoKey).type === "public" &&
      (value as CryptoKey).algorithm?.name === MESH_SIGNATURE_ALGORITHM,
  );
}

function operation(input: unknown): LocalStrategyOperationV1 {
  if (typeof input !== "string" || !operations.has(input))
    fail("strategy evidence operation is invalid");
  return input as LocalStrategyOperationV1;
}

function metric(input: unknown): LocalStrategyFeedbackMetricV1 {
  if (typeof input !== "string" || !metrics.has(input))
    fail("strategy evidence metric is invalid");
  return input as LocalStrategyFeedbackMetricV1;
}

function outcome(input: unknown): PeerStrategyEvidenceOutcomeV1 {
  if (typeof input !== "string" || !outcomes.has(input))
    fail("strategy evidence outcome is invalid");
  return input as PeerStrategyEvidenceOutcomeV1;
}

function schema(input: unknown, label: string): void {
  if (input !== PEER_STRATEGY_EVIDENCE_SCHEMA_VERSION_V1)
    fail(`${label} schema is invalid`);
}

function identifier(input: unknown, label: string): string {
  if (typeof input !== "string" || !IDENTIFIER.test(input))
    fail(`${label} is invalid`);
  return input;
}

function sha(input: unknown, label: string): PlanningDigestV1 {
  if (typeof input !== "string" || !DIGEST.test(input)) fail(`${label} is invalid`);
  return input as PlanningDigestV1;
}

function nullableSha(input: unknown, label: string): PlanningDigestV1 | null {
  return input === null ? null : sha(input, label);
}

function positive(input: unknown, label: string): number {
  return integerRange(input, label, 1, Number.MAX_SAFE_INTEGER);
}

function nonNegative(input: unknown, label: string): number {
  return integerRange(input, label, 0, Number.MAX_SAFE_INTEGER);
}

function bounded(input: unknown, label: string, maximum: number): number {
  return integerRange(input, label, 1, maximum);
}

function basisPoints(input: unknown, label: string): number {
  return integerRange(input, label, 0, BPS);
}

function integerRange(
  input: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(input) ||
    (input as number) < minimum ||
    (input as number) > maximum
  )
    fail(`${label} is invalid`);
  return input as number;
}

function digestArray(
  input: unknown,
  label: string,
  maximum: number,
): readonly PlanningDigestV1[] {
  if (!Array.isArray(input) || input.length > maximum) fail(`${label} is invalid`);
  const values = input.map((value, index) => sha(value, `${label}[${index}]`));
  if (!same(values, [...values].sort(compare))) fail(`${label} must be sorted`);
  unique(values, label);
  return freeze(values);
}

function identifierArray(
  input: unknown,
  label: string,
  maximum: number,
): readonly string[] {
  if (!Array.isArray(input) || input.length > maximum) fail(`${label} is invalid`);
  const values = input.map((value, index) =>
    identifier(value, `${label}[${index}]`),
  );
  if (!same(values, [...values].sort(compare))) fail(`${label} must be sorted`);
  unique(values, label);
  return freeze(values);
}

function exact(
  input: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null) ||
    Object.getOwnPropertySymbols(input).length > 0
  )
    fail(`${label} is invalid`);
  const value = input as Record<string, unknown>;
  if (!same(Object.keys(value).sort(compare), [...expectedKeys].sort(compare)))
    fail(`${label} fields are invalid`);
  return value;
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label} are duplicated`);
}

function same(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function digest(domain: string, value: unknown): PlanningDigestV1 {
  return digestPlanningJsonV1(
    domain as Parameters<typeof digestPlanningJsonV1>[0],
    value as unknown as PlanningJson,
  );
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>))
      freeze(nested);
    Object.freeze(value);
  }
  return value;
}

function clone<T extends JsonValue | object>(value: T): T {
  return freeze(structuredClone(value));
}

function fail(message: string): never {
  throw new TypeError(message);
}
