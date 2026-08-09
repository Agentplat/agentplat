import {
  createPeerCredibilityObservationV1,
  type PeerCredibilityRuntimeV1,
  type PeerCredibilityStateV1,
  type PeerSourceDependencyEdgeV1,
} from "@agentplat/trust/peer-credibility";

import { collectiveQuorumDigestV1 } from "./crypto.js";
import type {
  SparseAggregateSignaturePortV2,
  SparseCommitteeAssignmentV2,
} from "./sparse-agreement.js";
import {
  validateSparseAgreementEquivocationEvidenceV1,
  type SparseAgreementEquivocationEvidenceV1,
} from "./sparse-agreement-runtime.js";

export interface SparseEquivocationResponsePolicyV1 {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyVersion: number;
  /** Scope-local credibility domain. This is deliberately not global reputation. */
  readonly scopeDigest: string;
  readonly verifierSourceId: string;
  readonly verifierDependencyGroupId: string;
  readonly criterionId: string;
  readonly failClosedStatuses: readonly ("unknown" | "restricted" | "quarantined")[];
  readonly policyDigest: string;
}

export interface SparseEquivocationResponseV1 {
  readonly schemaVersion: 1;
  readonly evidenceDigest: string;
  readonly assignmentDigest: string;
  readonly subjectPeerId: string;
  readonly observationDigest: string;
  readonly credibilityStateDigest: string;
  readonly credibilityStatus: PeerCredibilityStateV1["status"];
  readonly eligibleForAgreement: boolean;
  readonly evaluatedAtLogicalMs: number;
  readonly responseDigest: string;
}

/**
 * Converts cryptographic equivocation proof into scope-local credibility and
 * an immediately actionable agreement eligibility decision. Replays are
 * idempotent through the evidence-derived observation identifier.
 */
export async function respondToSparseAgreementEquivocationV1(input: {
  readonly evidence: SparseAgreementEquivocationEvidenceV1;
  readonly assignment: SparseCommitteeAssignmentV2;
  readonly signatures: SparseAggregateSignaturePortV2;
  readonly credibility: PeerCredibilityRuntimeV1;
  readonly policy: SparseEquivocationResponsePolicyV1;
  readonly dependencyEdges?: readonly PeerSourceDependencyEdgeV1[];
  readonly evaluatedAtLogicalMs: number;
  readonly crypto?: Crypto;
}): Promise<SparseEquivocationResponseV1> {
  const policy = await validateSparseEquivocationResponsePolicyV1(input.policy, input.crypto);
  integer(input.evaluatedAtLogicalMs, "evaluatedAtLogicalMs", 0, Number.MAX_SAFE_INTEGER);
  const evidence = await validateSparseAgreementEquivocationEvidenceV1({
    evidence: input.evidence,
    assignment: input.assignment,
    signatures: input.signatures,
    crypto: input.crypto,
  });
  const observation = createPeerCredibilityObservationV1({
    schemaVersion: 1,
    observationId: `equivocation:${evidence.evidenceDigest.slice(7, 47)}`,
    scopeDigest: policy.scopeDigest,
    subjectId: evidence.signerPeerId,
    sourceId: policy.verifierSourceId,
    dependencyGroupId: policy.verifierDependencyGroupId,
    criterionId: policy.criterionId,
    outcome: "violated",
    confidenceBasisPoints: 10_000,
    challengeDisposition: "none",
    evidenceDigest: unprefixedDigest(evidence.evidenceDigest),
    observedAtLogicalMs: input.evaluatedAtLogicalMs,
  });
  const state = await input.credibility.observe({
    scopeDigest: policy.scopeDigest,
    subjectId: evidence.signerPeerId,
    observation,
    dependencyEdges: input.dependencyEdges ?? [],
    evaluatedAtLogicalMs: input.evaluatedAtLogicalMs,
  });
  const eligibleForAgreement = sparseAgreementEligibleFromCredibilityV1(state, policy);
  const body = {
    schemaVersion: 1 as const,
    evidenceDigest: evidence.evidenceDigest,
    assignmentDigest: input.assignment.assignmentDigest,
    subjectPeerId: evidence.signerPeerId,
    observationDigest: prefixedDigest(state.observations.find(
      (item) => item.observationId === observation.observationId,
    )?.observationDigest ?? observation.observationDigest),
    credibilityStateDigest: prefixedDigest(state.stateDigest),
    credibilityStatus: state.status,
    eligibleForAgreement,
    evaluatedAtLogicalMs: input.evaluatedAtLogicalMs,
  };
  return immutable({
    ...body,
    responseDigest: await collectiveQuorumDigestV1({
      domain: "sparse-equivocation-response-v1",
      body,
    }, input.crypto),
  });
}

export async function createSparseEquivocationResponsePolicyV1(
  input: Omit<SparseEquivocationResponsePolicyV1, "policyDigest">,
  crypto?: Crypto,
): Promise<SparseEquivocationResponsePolicyV1> {
  validatePolicyBody(input);
  const body = immutable(input);
  return immutable({
    ...body,
    policyDigest: await collectiveQuorumDigestV1({
      domain: "sparse-equivocation-response-policy-v1",
      body,
    }, crypto),
  });
}

export async function validateSparseEquivocationResponsePolicyV1(
  input: SparseEquivocationResponsePolicyV1,
  crypto?: Crypto,
): Promise<SparseEquivocationResponsePolicyV1> {
  const { policyDigest, ...body } = input;
  digest(policyDigest, "policyDigest");
  const rebuilt = await createSparseEquivocationResponsePolicyV1(body, crypto);
  if (rebuilt.policyDigest !== policyDigest)
    throw new TypeError("sparse equivocation response policy digest is invalid");
  return rebuilt;
}

export function sparseAgreementEligibleFromCredibilityV1(
  state: PeerCredibilityStateV1,
  policy: SparseEquivocationResponsePolicyV1,
): boolean {
  if (state.scopeDigest !== policy.scopeDigest)
    throw new TypeError("sparse agreement credibility scope is invalid");
  return !(policy.failClosedStatuses as readonly string[]).includes(state.status);
}

function validatePolicyBody(input: Omit<SparseEquivocationResponsePolicyV1, "policyDigest">): void {
  if (input.schemaVersion !== 1)
    throw new TypeError("sparse equivocation response policy schema is invalid");
  identifier(input.policyId, "policyId");
  integer(input.policyVersion, "policyVersion", 1, Number.MAX_SAFE_INTEGER);
  trustDigest(input.scopeDigest, "scopeDigest");
  identifier(input.verifierSourceId, "verifierSourceId");
  identifier(input.verifierDependencyGroupId, "verifierDependencyGroupId");
  identifier(input.criterionId, "criterionId");
  if (!Array.isArray(input.failClosedStatuses) || input.failClosedStatuses.length === 0)
    throw new TypeError("sparse equivocation fail-closed statuses are invalid");
  const canonical = [...new Set(input.failClosedStatuses)].sort();
  if (
    canonical.length !== input.failClosedStatuses.length ||
    canonical.some((value, index) => value !== input.failClosedStatuses[index]) ||
    canonical.some((value) => !["unknown", "restricted", "quarantined"].includes(value))
  ) throw new TypeError("sparse equivocation fail-closed statuses must be canonical");
}

function unprefixedDigest(value: string): string {
  digest(value, "evidenceDigest");
  return value.slice(7);
}

function prefixedDigest(value: string): string {
  trustDigest(value, "trustDigest");
  return `sha256:${value}`;
}

function digest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value))
    throw new TypeError(`${label} is invalid`);
}

function trustDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value))
    throw new TypeError(`${label} is invalid`);
}

function identifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(value))
    throw new TypeError(`${label} is invalid`);
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum)
    throw new TypeError(`${label} is invalid`);
  return value as number;
}

function immutable<T>(value: T): T {
  const clone = structuredClone(value);
  const visit = (item: unknown): void => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return;
    Object.values(item as Record<string, unknown>).forEach(visit);
    Object.freeze(item);
  };
  visit(clone);
  return clone;
}
