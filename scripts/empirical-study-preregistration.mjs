#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parseOptions(process.argv.slice(2));
const protocolPath = path.join(root, "config/empirical-study-protocol-v1.json");
const protocol = validateProtocol(await readJson(protocolPath));

if (options.mode === "plan") await plan();
else if (options.mode === "plan-v2") await planV2();
else if (options.mode === "attest") await attest();
else if (options.mode === "verify") await verify();
else if (options.mode === "results-template") await resultsTemplate();
else if (options.mode === "contract-smoke") contractSmoke();
else fail("empirical_preregistration_mode_invalid");

async function plan() {
  exactOptions(["campaign-id", "mode", "output-directory", "source-sha"]);
  const campaignId = tokenOption("campaign-id");
  const sourceSha = commitOption("source-sha");
  const outputDirectory = externalDirectoryOption("output-directory");
  const operationDirectory = path.join(outputDirectory, "normative-operation");
  execFileSync(
    process.execPath,
    [
      path.join(root, "scripts/collective-beta3-normative-operation.mjs"),
      "--mode",
      "plan",
      "--campaign-id",
      campaignId,
      "--confirm",
      "DO_NOT_RUN",
      "--output-directory",
      operationDirectory,
      "--source-sha",
      sourceSha,
    ],
    { cwd: root, stdio: "inherit" },
  );
  const source = await readJson(
    path.join(operationDirectory, "source-lock.json"),
  );
  const campaign = await readJson(
    path.join(operationDirectory, "registration.json"),
  );
  const adapter = await readJson(
    path.join(operationDirectory, "adapter-descriptor.json"),
  );
  const operationPlan = await readJson(
    path.join(operationDirectory, "operation-plan.json"),
  );
  const expectedManifest = await readJson(
    path.join(operationDirectory, "expected-manifest.json"),
  );
  const estimate = await readJson(
    path.join(operationDirectory, "estimate.json"),
  );
  assert(source.sourceCommit === sourceSha, "empirical_source_commit_mismatch");
  assert(source.dirtyWorktree === false, "empirical_source_must_be_clean");
  assert(campaign.campaignId === campaignId, "empirical_campaign_id_mismatch");
  assert(
    operationPlan.adapterClass === "diagnostic",
    "empirical_plan_adapter_must_be_unregistered",
  );
  assert(
    adapter.runnerClass === "diagnostic",
    "empirical_adapter_must_be_unregistered",
  );
  assert(
    adapter.capabilities.exactReplay === false,
    "empirical_adapter_must_not_claim_replay",
  );
  assert(
    adapter.capabilities.evaluatorOwnedMetrics === false,
    "empirical_adapter_must_not_claim_evaluator",
  );
  assert(
    estimate.executionPermitted === false,
    "empirical_estimate_must_not_permit_execution",
  );
  const documentBytes = await readFile(
    path.join(root, protocol.protocolDocument),
  );
  const body = {
    schemaVersion: 1,
    kind: "agentplat-empirical-study-registration-v1",
    protocol,
    protocolDigest: digest("empirical-study-protocol-v1", protocol),
    protocolDocumentDigest: sha256(documentBytes),
    sourceCommit: source.sourceCommit,
    sourceTreeDigest: source.sourceTreeDigest,
    campaignId,
    campaignRegistrationDigest: requiredDigest(campaign.registrationDigest),
    operationPlanDigest: requiredDigest(operationPlan.planDigest),
    expectedManifestDigest: requiredDigest(expectedManifest.manifestDigest),
    capacityEstimateDigest: requiredDigest(estimate.estimateDigest),
    expectedCells: 240,
    expectedExecutionSlots: 960,
    maximumRegisteredInteractions: 3_296_000,
    resultsStatus: "not_collected",
    executionPermitted: false,
  };
  const registration = {
    ...body,
    registrationDigest: digest("empirical-study-registration-v1", body),
  };
  validateRegistration(registration);
  await writeJsonImmutable(
    path.join(outputDirectory, "scientific-registration.json"),
    registration,
  );
  status({
    status: "planned",
    registrationDigest: registration.registrationDigest,
    campaignRegistrationDigest: registration.campaignRegistrationDigest,
    expectedCells: registration.expectedCells,
    expectedExecutionSlots: registration.expectedExecutionSlots,
    maximumExternalSpend:
      registration.protocol.budgetPolicy.maximumExternalSpend,
    executionPermitted: false,
  });
}

async function planV2() {
  exactOptions(["campaign-id", "mode", "output-directory", "source-sha"]);
  const campaignId = tokenOption("campaign-id");
  const sourceSha = commitOption("source-sha");
  const outputDirectory = externalDirectoryOption("output-directory");
  const operationDirectory = path.join(outputDirectory, "registered-operation");
  execFileSync(
    process.execPath,
    [
      path.join(root, "scripts/empirical-study-campaign.mjs"),
      "--mode",
      "plan",
      "--campaign-id",
      campaignId,
      "--confirm",
      "DO_NOT_RUN",
      "--output-directory",
      operationDirectory,
      "--source-sha",
      sourceSha,
    ],
    { cwd: root, stdio: "inherit" },
  );
  const source = await readJson(
    path.join(operationDirectory, "source-lock.json"),
  );
  const campaign = await readJson(
    path.join(operationDirectory, "registration.json"),
  );
  const adapter = await readJson(
    path.join(operationDirectory, "adapter-descriptor.json"),
  );
  const operationPlan = await readJson(
    path.join(operationDirectory, "operation-plan.json"),
  );
  const expectedManifest = await readJson(
    path.join(operationDirectory, "expected-manifest.json"),
  );
  const executionDesign = await readJson(
    path.join(operationDirectory, "campaign-execution-design.json"),
  );
  assert(
    source.sourceCommit === sourceSha,
    "empirical_v2_source_commit_mismatch",
  );
  assert(source.dirtyWorktree === false, "empirical_v2_source_must_be_clean");
  assert(
    campaign.campaignId === campaignId,
    "empirical_v2_campaign_id_mismatch",
  );
  assert(
    adapter.runnerClass === "normative_candidate",
    "empirical_v2_adapter_not_registered_candidate",
  );
  assert(
    adapter.capabilities.exactReplay === true,
    "empirical_v2_exact_replay_missing",
  );
  assert(
    adapter.capabilities.evaluatorOwnedMetrics === true,
    "empirical_v2_evaluator_separation_missing",
  );
  assert(
    operationPlan.adapterClass === "normative_candidate",
    "empirical_v2_plan_adapter_invalid",
  );
  assert(
    executionDesign.authorizationIssued === false,
    "empirical_v2_authorization_must_be_absent",
  );
  assert(
    executionDesign.executionPermitted === false,
    "empirical_v2_execution_must_be_forbidden",
  );
  assert(
    executionDesign.maximumExternalSpend === 0,
    "empirical_v2_external_spend_invalid",
  );
  const documentBytes = await readFile(
    path.join(root, protocol.protocolDocument),
  );
  const body = {
    schemaVersion: 2,
    kind: "agentplat-empirical-study-registration-v2",
    protocol,
    protocolDigest: digest("empirical-study-protocol-v1", protocol),
    protocolDocumentDigest: sha256(documentBytes),
    sourceCommit: source.sourceCommit,
    sourceTreeDigest: source.sourceTreeDigest,
    campaignId,
    campaignRegistrationDigest: requiredDigest(campaign.registrationDigest),
    operationPlanDigest: requiredDigest(operationPlan.planDigest),
    expectedManifestDigest: requiredDigest(expectedManifest.manifestDigest),
    adapterDescriptorDigest: requiredDigest(adapter.descriptorDigest),
    implementationDigest: requiredDigest(adapter.digests.implementationDigest),
    evaluatorDigest: requiredDigest(adapter.digests.evaluatorDigest),
    executionDesignDigest: requiredDigest(executionDesign.designDigest),
    aggregationSeed: 20_260_810,
    expectedShards: 48,
    expectedCells: 240,
    expectedExecutionSlots: 960,
    maximumRegisteredInteractions: 3_296_000,
    authorizationStatus: "not_issued",
    resultsStatus: "not_collected",
    executionPermitted: false,
  };
  const registration = {
    ...body,
    registrationDigest: digest("empirical-study-registration-v2", body),
  };
  validateRegistration(registration);
  await writeJsonImmutable(
    path.join(outputDirectory, "scientific-registration-v2.json"),
    registration,
  );
  status({
    status: "planned",
    schemaVersion: 2,
    registrationDigest: registration.registrationDigest,
    adapterDescriptorDigest: registration.adapterDescriptorDigest,
    expectedShards: registration.expectedShards,
    expectedCells: registration.expectedCells,
    expectedExecutionSlots: registration.expectedExecutionSlots,
    maximumExternalSpend:
      registration.protocol.budgetPolicy.maximumExternalSpend,
    authorizationStatus: registration.authorizationStatus,
    executionPermitted: false,
  });
}

async function attest() {
  exactOptions([
    "aws-profile",
    "aws-region",
    "issuer-id",
    "kms-key-id",
    "mode",
    "output",
    "registration",
  ]);
  const registration = validateRegistration(
    await readJson(pathOption("registration")),
  );
  const output = externalFileOption("output");
  const issuerId = tokenOption("issuer-id");
  const material = await kmsPublicKey(textOption("kms-key-id"));
  const signature = kmsSign(
    material.keyId,
    Buffer.from(registration.registrationDigest, "utf8"),
  );
  const body = {
    schemaVersion: 1,
    kind: "agentplat-empirical-study-registration-attestation-v1",
    issuerId,
    keyId: material.keyId,
    algorithm: "Ed25519",
    publicKeyFingerprint: sha256(material.publicKeyBytes),
    registration,
    signedDigest: registration.registrationDigest,
  };
  const attestation = {
    ...body,
    signature,
    attestationDigest: digest("empirical-study-registration-attestation-v1", {
      ...body,
      signature,
    }),
  };
  await writeJsonImmutable(output, attestation);
  status({
    status: "attested",
    registrationDigest: registration.registrationDigest,
    attestationDigest: attestation.attestationDigest,
    keyId: material.keyId,
    executionPermitted: false,
  });
}

async function verify() {
  exactOptions(["attestation", "issuer-id", "key-id", "mode", "public-key"]);
  const attestation = await verifyAttestation();
  status({
    status: "verified",
    registrationDigest: attestation.registration.registrationDigest,
    attestationDigest: attestation.attestationDigest,
    resultsStatus: attestation.registration.resultsStatus,
    executionPermitted: false,
  });
}

async function resultsTemplate() {
  exactOptions([
    "attestation",
    "issuer-id",
    "key-id",
    "mode",
    "output",
    "public-key",
  ]);
  const attestation = await verifyAttestation();
  const registration = attestation.registration;
  const body = {
    schemaVersion: 1,
    kind: "agentplat-empirical-study-results-template-v1",
    registrationDigest: registration.registrationDigest,
    registrationAttestationDigest: attestation.attestationDigest,
    campaignId: registration.campaignId,
    expectedCells: registration.expectedCells,
    expectedExecutionSlots: registration.expectedExecutionSlots,
    studyStatus: "not_executed",
    missingRegisteredCells: registration.expectedCells,
    invalidSampleCount: 0,
    excludedSampleCount: 0,
    incurredExternalSpend: 0,
    currency: registration.protocol.budgetPolicy.currency,
    endpointResults: registration.protocol.primaryEndpoints.map(
      (endpointId) => ({
        schemaVersion: 1,
        endpointId,
        status: "not_reported",
        numerator: null,
        denominator: null,
        estimate: null,
        interval: null,
        decision: "not_evaluated",
      }),
    ),
    hypothesisResults: registration.protocol.hypotheses.map((hypothesis) => ({
      schemaVersion: 1,
      hypothesisId: hypothesis.id,
      status: "not_evaluated",
      evidenceDigest: null,
      conclusion: null,
    })),
    limitations: [],
    artifactDigests: [],
    empiricalClaimPermitted: false,
  };
  const template = {
    ...body,
    templateDigest: digest("empirical-study-results-template-v1", body),
  };
  await writeJsonImmutable(externalFileOption("output"), template);
  status({
    status: "template_created",
    registrationDigest: registration.registrationDigest,
    templateDigest: template.templateDigest,
    studyStatus: template.studyStatus,
    empiricalClaimPermitted: false,
  });
}

function contractSmoke() {
  exactOptions(["mode"]);
  const body = {
    schemaVersion: 1,
    kind: "agentplat-empirical-study-registration-v1",
    protocol,
    protocolDigest: digest("empirical-study-protocol-v1", protocol),
    protocolDocumentDigest: zeroDigest("document"),
    sourceCommit: "0".repeat(40),
    sourceTreeDigest: zeroDigest("source"),
    campaignId: "campaign:contract-smoke",
    campaignRegistrationDigest: zeroDigest("campaign"),
    operationPlanDigest: zeroDigest("operation"),
    expectedManifestDigest: zeroDigest("manifest"),
    capacityEstimateDigest: zeroDigest("estimate"),
    expectedCells: 240,
    expectedExecutionSlots: 960,
    maximumRegisteredInteractions: 3_296_000,
    resultsStatus: "not_collected",
    executionPermitted: false,
  };
  const registration = validateRegistration({
    ...body,
    registrationDigest: digest("empirical-study-registration-v1", body),
  });
  const v2Body = {
    schemaVersion: 2,
    kind: "agentplat-empirical-study-registration-v2",
    protocol,
    protocolDigest: digest("empirical-study-protocol-v1", protocol),
    protocolDocumentDigest: zeroDigest("document-v2"),
    sourceCommit: "0".repeat(40),
    sourceTreeDigest: zeroDigest("source-v2"),
    campaignId: "campaign:contract-smoke-v2",
    campaignRegistrationDigest: zeroDigest("campaign-v2"),
    operationPlanDigest: zeroDigest("operation-v2"),
    expectedManifestDigest: zeroDigest("manifest-v2"),
    adapterDescriptorDigest: zeroDigest("adapter-v2"),
    implementationDigest: zeroDigest("implementation-v2"),
    evaluatorDigest: zeroDigest("evaluator-v2"),
    executionDesignDigest: zeroDigest("design-v2"),
    aggregationSeed: 20_260_810,
    expectedShards: 48,
    expectedCells: 240,
    expectedExecutionSlots: 960,
    maximumRegisteredInteractions: 3_296_000,
    authorizationStatus: "not_issued",
    resultsStatus: "not_collected",
    executionPermitted: false,
  };
  const registrationV2 = validateRegistration({
    ...v2Body,
    registrationDigest: digest("empirical-study-registration-v2", v2Body),
  });
  status({
    status: "passed",
    scope: "contract_only_no_execution",
    registrationDigest: registration.registrationDigest,
    registrationV2Digest: registrationV2.registrationDigest,
    executionPermitted: false,
  });
}

async function verifyAttestation() {
  const value = await readJson(pathOption("attestation"));
  exactKeys(
    value,
    [
      "algorithm",
      "attestationDigest",
      "issuerId",
      "keyId",
      "kind",
      "publicKeyFingerprint",
      "registration",
      "schemaVersion",
      "signature",
      "signedDigest",
    ],
    "empirical_attestation_shape_invalid",
  );
  assert(value.schemaVersion === 1, "empirical_attestation_schema_invalid");
  assert(
    value.kind === "agentplat-empirical-study-registration-attestation-v1",
    "empirical_attestation_kind_invalid",
  );
  assert(
    value.algorithm === "Ed25519",
    "empirical_attestation_algorithm_invalid",
  );
  assert(
    value.issuerId === tokenOption("issuer-id"),
    "empirical_attestation_issuer_mismatch",
  );
  assert(
    value.keyId === textOption("key-id"),
    "empirical_attestation_key_mismatch",
  );
  const registration = validateRegistration(value.registration);
  assert(
    value.signedDigest === registration.registrationDigest,
    "empirical_signed_digest_mismatch",
  );
  const signature = Buffer.from(requiredText(value.signature), "base64url");
  assert(signature.byteLength === 64, "empirical_signature_invalid");
  const publicPem = await readFile(pathOption("public-key"), "utf8");
  const publicDer = pemPublicBytes(publicPem);
  assert(
    value.publicKeyFingerprint === sha256(publicDer),
    "empirical_public_key_fingerprint_mismatch",
  );
  const publicKey = await globalThis.crypto.subtle.importKey(
    "spki",
    publicDer,
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  const valid = await globalThis.crypto.subtle.verify(
    { name: "Ed25519" },
    publicKey,
    signature,
    Buffer.from(registration.registrationDigest, "utf8"),
  );
  assert(valid, "empirical_signature_verification_failed");
  const { attestationDigest, ...body } = value;
  assert(
    attestationDigest ===
      digest("empirical-study-registration-attestation-v1", body),
    "empirical_attestation_digest_mismatch",
  );
  return { ...value, registration };
}

function validateProtocol(value) {
  exactKeys(
    value,
    [
      "analysisPolicy",
      "budgetPolicy",
      "claimBoundary",
      "hypotheses",
      "kind",
      "primaryEndpoints",
      "protocolDocument",
      "protocolId",
      "researchQuestion",
      "scales",
      "schemaVersion",
      "strata",
      "title",
      "treatments",
    ],
    "empirical_protocol_shape_invalid",
  );
  assert(value.schemaVersion === 1, "empirical_protocol_schema_invalid");
  assert(
    value.kind === "agentplat-empirical-study-protocol-v1",
    "empirical_protocol_kind_invalid",
  );
  assert(
    value.protocolId === "agentplat-collective-control-empirical-study-v1",
    "empirical_protocol_id_invalid",
  );
  assert(
    canonical(value.treatments) ===
      canonical(["adaptive_collective", "centralized_planner"]),
    "empirical_treatments_invalid",
  );
  assert(
    canonical(value.scales) === canonical([50, 100, 250, 500]),
    "empirical_scales_invalid",
  );
  assert(
    canonical(value.strata) ===
      canonical(["nominal", "benign", "adversarial", "mixed"]),
    "empirical_strata_invalid",
  );
  assert(
    Array.isArray(value.hypotheses) && value.hypotheses.length === 5,
    "empirical_hypotheses_invalid",
  );
  for (const hypothesis of value.hypotheses) {
    exactKeys(
      hypothesis,
      ["id", "primaryEndpointIds", "statement"],
      "empirical_hypothesis_shape_invalid",
    );
    assert(
      typeof hypothesis.statement === "string" &&
        hypothesis.statement.length > 0,
      "empirical_hypothesis_statement_invalid",
    );
    assert(
      Array.isArray(hypothesis.primaryEndpointIds) &&
        hypothesis.primaryEndpointIds.length > 0,
      "empirical_hypothesis_endpoints_invalid",
    );
  }
  assert(
    canonical(value.hypotheses.map((item) => item.id)) ===
      canonical(["H1", "H2", "H3", "H4", "H5"]),
    "empirical_hypothesis_ids_invalid",
  );
  assert(
    Array.isArray(value.primaryEndpoints) &&
      value.primaryEndpoints.length === 7,
    "empirical_endpoints_invalid",
  );
  exactKeys(
    value.analysisPolicy,
    [
      "benignRecoveryP95MaximumInteractions",
      "benignWilsonLowerBound",
      "bootstrapResamples",
      "familywiseAlpha",
      "familywiseMethod",
      "maximumSafetyViolations",
      "minimumUsefulDecisionRate",
      "nominalWilsonLowerBound",
      "pairedSuccessLowerMargin",
      "roleCoherenceDecisionCount",
    ],
    "empirical_analysis_policy_shape_invalid",
  );
  exactKeys(
    value.budgetPolicy,
    [
      "cloudComputePermitted",
      "currency",
      "dataEgressSpendPermitted",
      "managedDatabasePermitted",
      "maximumExternalSpend",
      "paidModelCallsPermitted",
    ],
    "empirical_budget_policy_shape_invalid",
  );
  exactKeys(
    value.claimBoundary,
    [
      "deploymentAuthorityGranted",
      "empiricalResultClaimPermitted",
      "productionReadinessClaimPermitted",
      "securityCertificationClaimPermitted",
      "sourceDevelopmentClaimPermitted",
    ],
    "empirical_claim_boundary_shape_invalid",
  );
  assert(
    value.analysisPolicy.bootstrapResamples === 10_000,
    "empirical_bootstrap_policy_invalid",
  );
  assert(
    value.analysisPolicy.familywiseMethod === "holm",
    "empirical_familywise_policy_invalid",
  );
  assert(
    value.analysisPolicy.maximumSafetyViolations === 0,
    "empirical_safety_policy_invalid",
  );
  assert(
    value.budgetPolicy.currency === "USD" &&
      value.budgetPolicy.maximumExternalSpend === 0,
    "empirical_budget_policy_invalid",
  );
  for (const key of [
    "paidModelCallsPermitted",
    "cloudComputePermitted",
    "managedDatabasePermitted",
    "dataEgressSpendPermitted",
  ])
    assert(
      value.budgetPolicy[key] === false,
      "empirical_budget_policy_invalid",
    );
  assert(
    value.claimBoundary.empiricalResultClaimPermitted === false,
    "empirical_claim_boundary_invalid",
  );
  assert(
    value.claimBoundary.deploymentAuthorityGranted === false,
    "empirical_claim_boundary_invalid",
  );
  assert(
    value.claimBoundary.productionReadinessClaimPermitted === false,
    "empirical_claim_boundary_invalid",
  );
  assert(
    value.claimBoundary.securityCertificationClaimPermitted === false,
    "empirical_claim_boundary_invalid",
  );
  assert(
    value.protocolDocument ===
      "docs/collective-runtime/empirical-validation-protocol-v1.md",
    "empirical_protocol_document_invalid",
  );
  return structuredClone(value);
}

function validateRegistration(value) {
  if (
    value?.schemaVersion === 2 ||
    value?.kind === "agentplat-empirical-study-registration-v2"
  )
    return validateRegistrationV2(value);
  exactKeys(
    value,
    [
      "campaignId",
      "campaignRegistrationDigest",
      "capacityEstimateDigest",
      "executionPermitted",
      "expectedCells",
      "expectedExecutionSlots",
      "expectedManifestDigest",
      "kind",
      "maximumRegisteredInteractions",
      "operationPlanDigest",
      "protocol",
      "protocolDigest",
      "protocolDocumentDigest",
      "registrationDigest",
      "resultsStatus",
      "schemaVersion",
      "sourceCommit",
      "sourceTreeDigest",
    ],
    "empirical_registration_shape_invalid",
  );
  assert(value.schemaVersion === 1, "empirical_registration_schema_invalid");
  assert(
    value.kind === "agentplat-empirical-study-registration-v1",
    "empirical_registration_kind_invalid",
  );
  const normalizedProtocol = validateProtocol(value.protocol);
  assert(
    canonical(normalizedProtocol) === canonical(protocol),
    "empirical_protocol_not_repository_version",
  );
  assert(
    value.protocolDigest ===
      digest("empirical-study-protocol-v1", normalizedProtocol),
    "empirical_protocol_digest_mismatch",
  );
  assert(
    /^[a-f0-9]{40}$/u.test(value.sourceCommit),
    "empirical_source_commit_invalid",
  );
  for (const key of [
    "protocolDocumentDigest",
    "sourceTreeDigest",
    "campaignRegistrationDigest",
    "operationPlanDigest",
    "expectedManifestDigest",
    "capacityEstimateDigest",
  ])
    requiredDigest(value[key]);
  assert(value.expectedCells === 240, "empirical_expected_cells_invalid");
  assert(
    value.expectedExecutionSlots === 960,
    "empirical_expected_slots_invalid",
  );
  assert(
    value.maximumRegisteredInteractions === 3_296_000,
    "empirical_interaction_ceiling_invalid",
  );
  assert(
    value.resultsStatus === "not_collected",
    "empirical_results_status_invalid",
  );
  assert(
    value.executionPermitted === false,
    "empirical_execution_must_be_forbidden",
  );
  const { registrationDigest, ...body } = value;
  assert(
    registrationDigest === digest("empirical-study-registration-v1", body),
    "empirical_registration_digest_mismatch",
  );
  return structuredClone(value);
}

function validateRegistrationV2(value) {
  exactKeys(
    value,
    [
      "adapterDescriptorDigest",
      "aggregationSeed",
      "authorizationStatus",
      "campaignId",
      "campaignRegistrationDigest",
      "evaluatorDigest",
      "executionDesignDigest",
      "executionPermitted",
      "expectedCells",
      "expectedExecutionSlots",
      "expectedManifestDigest",
      "expectedShards",
      "implementationDigest",
      "kind",
      "maximumRegisteredInteractions",
      "operationPlanDigest",
      "protocol",
      "protocolDigest",
      "protocolDocumentDigest",
      "registrationDigest",
      "resultsStatus",
      "schemaVersion",
      "sourceCommit",
      "sourceTreeDigest",
    ],
    "empirical_v2_registration_shape_invalid",
  );
  assert(value.schemaVersion === 2, "empirical_v2_registration_schema_invalid");
  assert(
    value.kind === "agentplat-empirical-study-registration-v2",
    "empirical_v2_registration_kind_invalid",
  );
  const normalizedProtocol = validateProtocol(value.protocol);
  assert(
    canonical(normalizedProtocol) === canonical(protocol),
    "empirical_v2_protocol_not_repository_version",
  );
  assert(
    value.protocolDigest ===
      digest("empirical-study-protocol-v1", normalizedProtocol),
    "empirical_v2_protocol_digest_mismatch",
  );
  assert(
    /^[a-f0-9]{40}$/u.test(value.sourceCommit),
    "empirical_v2_source_commit_invalid",
  );
  for (const key of [
    "protocolDocumentDigest",
    "sourceTreeDigest",
    "campaignRegistrationDigest",
    "operationPlanDigest",
    "expectedManifestDigest",
    "adapterDescriptorDigest",
    "implementationDigest",
    "evaluatorDigest",
    "executionDesignDigest",
  ])
    requiredDigest(value[key]);
  assert(
    value.aggregationSeed === 20_260_810,
    "empirical_v2_aggregation_seed_invalid",
  );
  assert(value.expectedShards === 48, "empirical_v2_expected_shards_invalid");
  assert(value.expectedCells === 240, "empirical_v2_expected_cells_invalid");
  assert(
    value.expectedExecutionSlots === 960,
    "empirical_v2_expected_slots_invalid",
  );
  assert(
    value.maximumRegisteredInteractions === 3_296_000,
    "empirical_v2_interaction_ceiling_invalid",
  );
  assert(
    value.authorizationStatus === "not_issued",
    "empirical_v2_authorization_status_invalid",
  );
  assert(
    value.resultsStatus === "not_collected",
    "empirical_v2_results_status_invalid",
  );
  assert(
    value.executionPermitted === false,
    "empirical_v2_execution_must_be_forbidden",
  );
  const { registrationDigest, ...body } = value;
  assert(
    registrationDigest === digest("empirical-study-registration-v2", body),
    "empirical_v2_registration_digest_mismatch",
  );
  return structuredClone(value);
}

async function kmsPublicKey(requestedKeyId) {
  const response = awsJson([
    "kms",
    "get-public-key",
    "--key-id",
    requestedKeyId,
  ]);
  assert(
    response.KeySpec === "ECC_NIST_EDWARDS25519",
    "empirical_kms_key_spec_invalid",
  );
  assert(
    response.KeyUsage === "SIGN_VERIFY",
    "empirical_kms_key_usage_invalid",
  );
  assert(
    response.SigningAlgorithms?.includes("ED25519_SHA_512"),
    "empirical_kms_algorithm_invalid",
  );
  const publicKeyBytes = Buffer.from(
    requiredText(response.PublicKey),
    "base64",
  );
  await globalThis.crypto.subtle.importKey(
    "spki",
    publicKeyBytes,
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  return { keyId: requiredText(response.KeyId), publicKeyBytes };
}

function kmsSign(keyId, message) {
  const response = awsJson([
    "kms",
    "sign",
    "--key-id",
    keyId,
    "--message",
    message.toString("base64"),
    "--message-type",
    "RAW",
    "--signing-algorithm",
    "ED25519_SHA_512",
  ]);
  assert(response.KeyId === keyId, "empirical_kms_signing_key_mismatch");
  const signature = Buffer.from(requiredText(response.Signature), "base64");
  assert(signature.byteLength === 64, "empirical_kms_signature_invalid");
  return signature.toString("base64url");
}

function awsJson(args) {
  const prefix = [];
  if (options["aws-profile"])
    prefix.push("--profile", textOption("aws-profile"));
  if (options["aws-region"]) prefix.push("--region", textOption("aws-region"));
  const output = execFileSync("aws", [...prefix, ...args, "--output", "json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(output);
}

function pemPublicBytes(value) {
  assert(
    value.includes("-----BEGIN PUBLIC KEY-----") &&
      value.includes("-----END PUBLIC KEY-----"),
    "empirical_public_key_pem_invalid",
  );
  const encoded = value.replace(
    /-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/gu,
    "",
  );
  const bytes = Buffer.from(encoded, "base64");
  assert(bytes.byteLength > 0, "empirical_public_key_pem_invalid");
  return bytes;
}

function parseOptions(args) {
  const result = Object.create(null);
  const values = args.filter((value) => value !== "--");
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (
      !name?.startsWith("--") ||
      value === undefined ||
      value.startsWith("--")
    )
      fail("empirical_option_syntax_invalid");
    const key = name.slice(2);
    if (key in result) fail("empirical_option_duplicate");
    result[key] = value;
  }
  return result;
}

function exactOptions(expected) {
  const actual = Object.keys(options).sort();
  const wanted = [...expected].sort();
  assert(
    canonical(actual) === canonical(wanted),
    "empirical_option_set_invalid",
  );
}

function textOption(name) {
  const value = options[name];
  assert(
    typeof value === "string" &&
      value.length > 0 &&
      value.length <= 512 &&
      value.trim() === value,
    `empirical_${name}_invalid`,
  );
  return value;
}

function tokenOption(name) {
  const value = textOption(name);
  assert(
    /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u.test(value),
    `empirical_${name}_invalid`,
  );
  return value;
}

function commitOption(name) {
  const value = textOption(name);
  assert(/^[a-f0-9]{40}$/u.test(value), `empirical_${name}_invalid`);
  return value;
}

function pathOption(name) {
  const value = textOption(name);
  assert(!value.includes("\0"), `empirical_${name}_invalid`);
  return path.resolve(value);
}

function externalDirectoryOption(name) {
  const value = pathOption(name);
  assert(isOutsideRoot(value), `empirical_${name}_must_be_external`);
  return value;
}

function externalFileOption(name) {
  const value = pathOption(name);
  assert(isOutsideRoot(value), `empirical_${name}_must_be_external`);
  return value;
}

function isOutsideRoot(value) {
  const relative = path.relative(root, value);
  return relative.startsWith("..") || path.isAbsolute(relative);
}

async function readJson(file) {
  return JSON.parse(await readFile(path.resolve(file), "utf8"));
}

async function writeJsonImmutable(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${canonical(value)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

function exactKeys(value, keys, reason) {
  assert(value && typeof value === "object" && !Array.isArray(value), reason);
  assert(
    canonical(Object.keys(value).sort()) === canonical([...keys].sort()),
    reason,
  );
}

function requiredText(value) {
  assert(
    typeof value === "string" && value.length > 0,
    "empirical_text_invalid",
  );
  return value;
}

function requiredDigest(value) {
  assert(
    typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value),
    "empirical_digest_invalid",
  );
  return value;
}

function zeroDigest(label) {
  return sha256(Buffer.from(label));
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function digest(domain, value) {
  return sha256(Buffer.from(`${domain}\0${canonical(value)}`, "utf8"));
}

function canonical(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  return value;
}

function status(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function assert(condition, reason) {
  if (!condition) fail(reason);
}

function fail(reason) {
  throw new Error(reason);
}
