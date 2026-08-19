import {
  canonicalizePlanningJsonV1,
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

export const CONFIRMATORY_SEMANTIC_DECISION_COUNT_V1 = 1_000 as const;

export interface ConfirmatorySemanticDecisionEventV1 {
  readonly schemaVersion: 1;
  readonly projectionOwner: "evaluator";
  readonly decisionId: string;
  readonly executionId: string;
  readonly registrationDigest: PlanningDigestV1;
  readonly traceEventId: string;
  readonly traceDigest: PlanningDigestV1;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly assignmentEpoch: number;
  readonly decisionDigest: PlanningDigestV1;
  readonly disposition: "useful" | "not_useful" | "unsafe";
  readonly evidenceDigest: PlanningDigestV1;
}

export interface ConfirmatorySemanticAgreementCertificateV1 {
  readonly schemaVersion: 1;
  readonly certificateDigest: PlanningDigestV1;
  readonly epoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly decisionRootDigest: PlanningDigestV1;
  readonly proposalDigest: PlanningDigestV1;
  readonly valueDigest: PlanningDigestV1;
  readonly signerSetDigest: PlanningDigestV1;
}

export interface ConfirmatorySemanticHorizonProjectionV1 {
  readonly schemaVersion: 1;
  readonly status: "complete" | "incomplete";
  readonly projectionOwner: "evaluator";
  readonly executionId: string;
  readonly registrationDigest: PlanningDigestV1;
  readonly expectedDecisionCount: 1_000;
  readonly observedDecisionCount: number;
  readonly usefulDecisionCount: number;
  readonly unsafeDecisionCount: number;
  readonly decisionRootDigest: PlanningDigestV1;
  readonly agreementCertificateDigest: PlanningDigestV1 | null;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly decisionIds: readonly string[];
  readonly projectionDigest: PlanningDigestV1;
}

export function projectConfirmatorySemanticHorizonV1(input: {
  readonly executionId: string;
  readonly registrationDigest: PlanningDigestV1;
  readonly membershipEpoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly decisionEvents: readonly ConfirmatorySemanticDecisionEventV1[];
  readonly agreementCertificate: ConfirmatorySemanticAgreementCertificateV1 | null;
}): ConfirmatorySemanticHorizonProjectionV1 {
  validateInput(input);
  const events = [...input.decisionEvents].sort((left, right) =>
    left.decisionId.localeCompare(right.decisionId),
  );
  const ids = new Set<string>();
  for (const event of events) {
    if (ids.has(event.decisionId)) fail("confirmatory_semantic_decision_duplicate");
    ids.add(event.decisionId);
    validateEvent(event, input);
  }
  const decisionRootDigest = digest("decision-root", {
    executionId: input.executionId,
    decisionDigests: events.map((event) => event.decisionDigest),
  });
  const certificate = input.agreementCertificate;
  if (certificate !== null) validateCertificate(certificate, input, decisionRootDigest);
  const body = {
    schemaVersion: 1 as const,
    status:
      events.length === CONFIRMATORY_SEMANTIC_DECISION_COUNT_V1 && certificate !== null
        ? ("complete" as const)
        : ("incomplete" as const),
    projectionOwner: "evaluator" as const,
    executionId: input.executionId,
    registrationDigest: input.registrationDigest,
    expectedDecisionCount: CONFIRMATORY_SEMANTIC_DECISION_COUNT_V1,
    observedDecisionCount: events.length,
    usefulDecisionCount: events.filter((event) => event.disposition === "useful").length,
    unsafeDecisionCount: events.filter((event) => event.disposition === "unsafe").length,
    decisionRootDigest,
    agreementCertificateDigest: certificate?.certificateDigest ?? null,
    membershipEpoch: input.membershipEpoch,
    membershipConfigurationDigest: input.membershipConfigurationDigest,
    decisionIds: events.map((event) => event.decisionId),
  };
  return Object.freeze({
    ...body,
    projectionDigest: digest("confirmatory-semantic-horizon", body),
  });
}

export function replayConfirmatorySemanticHorizonV1(
  input: Parameters<typeof projectConfirmatorySemanticHorizonV1>[0],
  projection: ConfirmatorySemanticHorizonProjectionV1,
): ConfirmatorySemanticHorizonProjectionV1 {
  const replayed = projectConfirmatorySemanticHorizonV1(input);
  if (canonical(replayed) !== canonical(projection))
    fail("confirmatory_semantic_horizon_replay_diverged");
  return replayed;
}

export function createConfirmatorySemanticAgreementCertificateV1(input: {
  readonly epoch: number;
  readonly membershipConfigurationDigest: PlanningDigestV1;
  readonly decisionRootDigest: PlanningDigestV1;
  readonly proposalDigest: PlanningDigestV1;
  readonly valueDigest: PlanningDigestV1;
  readonly signerSetDigest: PlanningDigestV1;
}): ConfirmatorySemanticAgreementCertificateV1 {
  const body = { schemaVersion: 1 as const, ...input };
  return Object.freeze({
    ...body,
    certificateDigest: digest("confirmatory-agreement-certificate", body),
  });
}

function validateInput(input: Parameters<typeof projectConfirmatorySemanticHorizonV1>[0]): void {
  if (!Number.isSafeInteger(input.membershipEpoch) || input.membershipEpoch < 0)
    fail("confirmatory_semantic_membership_epoch_invalid");
  digestValue(input.registrationDigest, "confirmatory_semantic_registration_digest_invalid");
  digestValue(input.membershipConfigurationDigest, "confirmatory_semantic_membership_digest_invalid");
}

function validateEvent(
  event: ConfirmatorySemanticDecisionEventV1,
  input: Parameters<typeof projectConfirmatorySemanticHorizonV1>[0],
): void {
  if (
    event.schemaVersion !== 1 ||
    event.projectionOwner !== "evaluator" ||
    event.executionId !== input.executionId ||
    event.registrationDigest !== input.registrationDigest ||
    event.membershipEpoch !== input.membershipEpoch ||
    event.membershipConfigurationDigest !== input.membershipConfigurationDigest ||
    !Number.isSafeInteger(event.assignmentEpoch) ||
    event.assignmentEpoch < 0 ||
    !["useful", "not_useful", "unsafe"].includes(event.disposition)
  ) fail("confirmatory_semantic_decision_binding_invalid");
  for (const value of [event.traceDigest, event.decisionDigest, event.evidenceDigest])
    digestValue(value, "confirmatory_semantic_decision_digest_invalid");
}

function validateCertificate(
  certificate: ConfirmatorySemanticAgreementCertificateV1,
  input: Parameters<typeof projectConfirmatorySemanticHorizonV1>[0],
  decisionRootDigest: PlanningDigestV1,
): void {
  if (
    certificate.schemaVersion !== 1 ||
    certificate.epoch !== input.membershipEpoch ||
    certificate.membershipConfigurationDigest !== input.membershipConfigurationDigest ||
    certificate.decisionRootDigest !== decisionRootDigest
  ) fail("confirmatory_semantic_agreement_certificate_binding_invalid");
  for (const value of [certificate.proposalDigest, certificate.valueDigest, certificate.signerSetDigest])
    digestValue(value, "confirmatory_semantic_agreement_certificate_digest_invalid");
  const { certificateDigest, ...body } = certificate;
  if (certificateDigest !== digest("confirmatory-agreement-certificate", body))
    fail("confirmatory_semantic_agreement_certificate_digest_invalid");
}

function digest(kind: string, value: unknown): PlanningDigestV1 {
  return digestPlanningJsonV1("evaluation-campaign-artifact-v1", {
    schemaVersion: 1,
    kind,
    value: value as PlanningJson,
  });
}

function digestValue(value: unknown, reason: string): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) fail(reason);
}

function canonical(value: unknown): string {
  return canonicalizePlanningJsonV1(value as PlanningJson);
}

function fail(reason: string): never {
  throw new TypeError(reason);
}
