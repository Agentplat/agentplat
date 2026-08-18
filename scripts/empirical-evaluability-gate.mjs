import {
  canonicalizePlanningJsonV1,
  digestPlanningJsonV1,
} from "../packages/collective-planning/dist/index.js";
import { collectiveNormativeWilsonLower95V1 } from "../packages/mesh-sim/dist/index.js";

const EXPECTED_SCALES = Object.freeze([50, 100, 250, 500]);
const EXPECTED_SCALE_COUNTS = Object.freeze({
  50: 40,
  100: 40,
  250: 40,
  500: 120,
});
const EXPECTED_STRATA = Object.freeze(["nominal", "benign", "adversarial", "mixed"]);
export const REQUIRED_PUBLICATION_ARTIFACTS_V1 = Object.freeze([
  "source-lock.json",
  "registration.json",
  "operation-plan.json",
  "adapter-descriptor.json",
  "authorization.json",
  "collection-manifest.json",
  "normative-analysis.json",
  "raw-rows.json",
  "paper-tables.json",
  "paper-dataset.csv",
  "analysis-input-projections.json",
]);

export const EVALUABILITY_CERTIFICATE_KIND_V1 =
  "agentplat-empirical-evaluability-certificate-v1";

export function buildEvaluabilityCertificateV1(input) {
  const checks = [];
  const registration = input.registration;
  const plan = input.plan;
  const descriptor = input.descriptor;
  checks.push(check(
    "registration_population",
    registration?.schemaVersion === 1 &&
      registration.cells?.length === 240 &&
      EXPECTED_SCALES.every((scale) => registration.cells.filter((cell) => cell.peerCount === scale).length === EXPECTED_SCALE_COUNTS[scale]) &&
      EXPECTED_STRATA.every((stratum) => registration.cells.filter((cell) => cell.stratum === stratum).length === 60),
    "registration has 240 cells with 60 observations per stratum and 40 per scale",
  ));
  checks.push(check(
    "registered_slots",
    plan?.schemaVersion === 1 &&
      plan.expectedCellCount === 240 &&
      plan.expectedSlotCount === 960 &&
      plan.shards?.length === 48 &&
      plan.shards.every((shard) => shard.cellIds?.length === 5),
    "operation plan has 960 slots across 48 five-cell shards",
  ));
  checks.push(check(
    "evaluator_owned_metrics",
    descriptor?.capabilities?.evaluatorOwnedMetrics === true &&
      descriptor.capabilities.exactReplay === true,
    "descriptor requires evaluator-owned metrics and exact replay",
  ));
  const nominalPerfect = collectiveNormativeWilsonLower95V1(60, 60);
  const nominalOneFailure = collectiveNormativeWilsonLower95V1(59, 60);
  const benignTwoFailures = collectiveNormativeWilsonLower95V1(58, 60);
  checks.push(check(
    "statistical_denominators",
    nominalPerfect >= 0.95 && nominalOneFailure < 0.95 && benignTwoFailures >= 0.90,
    "Wilson denominators and threshold boundaries are executable",
  ));
  checks.push(check(
    "role_coherence_population",
    input.syntheticRoleDecisionCount === 1000 &&
      input.syntheticUsefulDecisionCount / input.syntheticRoleDecisionCount >= 0.70 &&
      input.syntheticUnsafeExecutableCount === 0,
    "role coherence has 1,000 evaluator decisions, useful rate >= 0.70 and zero unsafe decisions",
  ));
  checks.push(check(
    "convergence_evidence",
    input.syntheticConvergenceEvidencePresent === true &&
      Number.isSafeInteger(input.syntheticConvergenceInteractionDelta) &&
      input.syntheticConvergenceInteractionDelta <= 250,
    "convergence evidence is present and within the registered interaction ceiling",
  ));
  checks.push(check(
    "publication_artifact_contract",
    canonical([...REQUIRED_PUBLICATION_ARTIFACTS_V1].sort()) ===
      canonical([...(input.requiredPublicationArtifacts ?? [])].sort()),
    "publication bundle names are fixed before execution",
  ));
  const body = {
    schemaVersion: 1,
    kind: EVALUABILITY_CERTIFICATE_KIND_V1,
    status: checks.every((item) => item.passed) ? "passed" : "failed",
    sourceCommit: input.sourceCommit,
    registrationDigest: registration?.registrationDigest ?? null,
    planDigest: plan?.planDigest ?? null,
    adapterDigest: descriptor?.descriptorDigest ?? null,
    checks,
    statisticalBoundaries: {
      nominalPerfect,
      nominalOneFailure,
      benignTwoFailures,
      nominalThreshold: 0.95,
      benignThreshold: 0.90,
      nominalDenominator: 60,
      benignDenominator: 60,
    },
    requiredPublicationArtifacts: [...REQUIRED_PUBLICATION_ARTIFACTS_V1],
    syntheticFixture: {
      roleDecisionCount: input.syntheticRoleDecisionCount,
      usefulDecisionCount: input.syntheticUsefulDecisionCount,
      unsafeExecutableCount: input.syntheticUnsafeExecutableCount,
      convergenceEvidencePresent: input.syntheticConvergenceEvidencePresent,
      convergenceInteractionDelta: input.syntheticConvergenceInteractionDelta,
    },
  };
  return Object.freeze({
    ...body,
    certificateDigest: digest("evaluability-certificate", body),
  });
}

export function verifyEvaluabilityCertificateV1(certificate, input) {
  const expected = buildEvaluabilityCertificateV1(input);
  if (certificate?.certificateDigest !== expected.certificateDigest)
    fail("evaluability_certificate_digest_invalid");
  if (canonical(certificate) !== canonical(expected))
    fail("evaluability_certificate_content_invalid");
  if (certificate.status !== "passed") fail("evaluability_certificate_failed");
  return expected;
}

function check(id, passed, description) {
  return Object.freeze({ id, passed: Boolean(passed), description });
}

function digest(kind, value) {
  return digestPlanningJsonV1("evaluation-campaign-artifact-v1", {
    schemaVersion: 1,
    kind,
    value,
  });
}

function canonical(value) {
  return canonicalizePlanningJsonV1(value);
}

function fail(reason) {
  throw new TypeError(reason);
}
