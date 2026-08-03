// Compiled-only public consumer contract for the Increment 10 control plane.
import {
  type CollectiveEvaluationCampaignRegistrationV1,
  CAMPAIGN_ELIGIBILITY_REASON_CODES_V1,
  NORMATIVE_OPERATION_EXPECTED_CELL_COUNT_V1,
  NORMATIVE_OPERATION_EXPECTED_SLOT_COUNT_V1,
  NORMATIVE_OPERATION_SHARD_COUNT_V1,
  createCampaignEligibilityAttestationV1,
  createCampaignEligibilityVerifiedClosureProofV1,
  deriveCampaignEligibilityAttestationV1,
  createNormativeMetricProjectionV1,
  createNormativeOperationAuthorizationV1,
  createNormativeOperationPlanV1,
  createNormativeRunnerDescriptorV1,
  validateCampaignEligibilityAttestationV1,
  validateNormativeMetricProjectionV1,
  validateNormativeOperationAuthorizationV1,
  validateNormativeOperationPlanV1,
  validateNormativeRunnerDescriptorV1,
  verifyCampaignEligibilityAttestationV1,
  verifyNormativeOperationAuthorizationV1,
  type CampaignEligibilityAttestationV1,
  type CampaignEligibilityClosureProofVerifierPortV1,
  type CampaignEligibilityVerifiedClosureProofV1,
  type NormativeMetricProjectionV1,
  type NormativeOperationAuthorizationV1,
  type NormativeOperationAuthorizationVerifierPortV1,
  type NormativeOperationPlanV1,
  type NormativeRunnerDescriptorV1,
} from "@agentplat/collective-planning/evaluation";
import {
  COLLECTIVE_NORMATIVE_ANALYSIS_RESAMPLES_V1,
  COLLECTIVE_NORMATIVE_ANALYSIS_VERSION_V1,
  COLLECTIVE_NORMATIVE_HOLM_FAMILY_V1,
  DEFAULT_COLLECTIVE_STATISTICAL_CAMPAIGN_ARTIFACT_STREAM_LIMITS_V1,
  analyzeCollectiveStatisticalCampaignNormativeV1,
  collectiveNormativeWilson95V1,
  collectiveNormativeWilsonLower95V1,
  collectiveStatisticalCampaignNormativeExecutionIdV1,
  mapCollectiveNormativeProjectionRowsV1,
  runCollectiveStatisticalCampaignNormativeOperationV1,
  verifyCollectiveStatisticalCampaignArtifactStreamV1,
  type CollectiveNormativeAnalysisInputV1,
  type CollectiveNormativeAnalysisV1,
  type CollectiveNormativeCampaignRowV1,
  type CollectiveStatisticalCampaignArtifactReaderV1,
  type CollectiveStatisticalCampaignNormativeOperationResultV1,
  type CollectiveStatisticalCampaignNormativeAdapterResolverPortV1,
  type CollectiveStatisticalCampaignNormativeProjectionPortV1,
  type CollectiveStatisticalCampaignResolvedNormativeAdapterV1,
  type CollectiveStatisticalCampaignNormativeRunnerPortV1,
  type CollectiveStatisticalCampaignArtifactStreamVerificationV1,
} from "@agentplat/mesh-sim";

declare const descriptorInput: Parameters<
  typeof createNormativeRunnerDescriptorV1
>[0];
declare const descriptor: NormativeRunnerDescriptorV1;
declare const authorizationInput: Parameters<
  typeof createNormativeOperationAuthorizationV1
>[0];
declare const authorization: NormativeOperationAuthorizationV1;
declare const planInput: Parameters<typeof createNormativeOperationPlanV1>[0];
declare const plan: NormativeOperationPlanV1;
declare const projectionInput: Parameters<
  typeof createNormativeMetricProjectionV1
>[0];
declare const projection: NormativeMetricProjectionV1;
declare const attestationInput: Parameters<
  typeof createCampaignEligibilityAttestationV1
>[0];
declare const attestation: CampaignEligibilityAttestationV1;
declare const closureProofInput: Parameters<
  typeof createCampaignEligibilityVerifiedClosureProofV1
>[0];
declare const closureProof: CampaignEligibilityVerifiedClosureProofV1;
declare const authorizationVerifier: NormativeOperationAuthorizationVerifierPortV1;
declare const closureProofVerifier: CampaignEligibilityClosureProofVerifierPortV1;
declare const operationInput: Parameters<
  typeof runCollectiveStatisticalCampaignNormativeOperationV1
>[0];
declare const normativeRunner: CollectiveStatisticalCampaignNormativeRunnerPortV1;
declare const normativeProjector: CollectiveStatisticalCampaignNormativeProjectionPortV1;
declare const adapterResolver: CollectiveStatisticalCampaignNormativeAdapterResolverPortV1;
declare const resolvedAdapter: CollectiveStatisticalCampaignResolvedNormativeAdapterV1;
declare const rows: readonly CollectiveNormativeCampaignRowV1[];
declare const registration: CollectiveEvaluationCampaignRegistrationV1;
declare const projections: readonly NormativeMetricProjectionV1[];
declare const reader: CollectiveStatisticalCampaignArtifactReaderV1;

const analysisInput: CollectiveNormativeAnalysisInputV1 = {
  schemaVersion: COLLECTIVE_NORMATIVE_ANALYSIS_VERSION_V1,
  registration,
  executionId: "execution:public-type-test",
  aggregationSeed: 0,
  bootstrapResamples: COLLECTIVE_NORMATIVE_ANALYSIS_RESAMPLES_V1,
  projections,
};
const analysis: CollectiveNormativeAnalysisV1 =
  analyzeCollectiveStatisticalCampaignNormativeV1(analysisInput);
const streamVerification: Promise<CollectiveStatisticalCampaignArtifactStreamVerificationV1> =
  verifyCollectiveStatisticalCampaignArtifactStreamV1({
    schemaVersion: 1,
    artifacts: [],
    reader,
  });
const operation: Promise<CollectiveStatisticalCampaignNormativeOperationResultV1> =
  runCollectiveStatisticalCampaignNormativeOperationV1(operationInput);
const operationExecutionId =
  collectiveStatisticalCampaignNormativeExecutionIdV1({
    schemaVersion: 1,
    registration,
    descriptor,
    plan,
    authorization,
  });
const authorizationVerification = verifyNormativeOperationAuthorizationV1({
  schemaVersion: 1,
  authorization,
  now: "2026-01-01T00:00:00.000Z",
  context: {
    schemaVersion: 1,
    audience: authorization.audience,
    planDigest: authorization.planDigest,
    registrationDigest: authorization.registrationDigest,
    sourceCommit: authorization.sourceCommit,
    sourceTreeDigest: authorization.sourceTreeDigest,
    adapterDigest: authorization.adapterDigest,
    executionId: authorization.executionId,
    shardIndices: authorization.shardIndices,
    maximumCells: authorization.maximumCells,
  },
  verifier: authorizationVerifier,
});
const derivedAttestation = deriveCampaignEligibilityAttestationV1({
  schemaVersion: 1,
  proof: closureProof,
  createdAt: "2026-01-01T00:00:00.000Z",
  verifier: closureProofVerifier,
});
const verifiedAttestation = verifyCampaignEligibilityAttestationV1({
  schemaVersion: 1,
  attestation,
  proof: closureProof,
  verifier: closureProofVerifier,
});

void CAMPAIGN_ELIGIBILITY_REASON_CODES_V1;
void NORMATIVE_OPERATION_EXPECTED_CELL_COUNT_V1;
void NORMATIVE_OPERATION_EXPECTED_SLOT_COUNT_V1;
void NORMATIVE_OPERATION_SHARD_COUNT_V1;
void DEFAULT_COLLECTIVE_STATISTICAL_CAMPAIGN_ARTIFACT_STREAM_LIMITS_V1;
void COLLECTIVE_NORMATIVE_HOLM_FAMILY_V1;
void mapCollectiveNormativeProjectionRowsV1(analysisInput);
void collectiveNormativeWilson95V1(60, 60);
void collectiveNormativeWilsonLower95V1(60, 60);
void validateNormativeRunnerDescriptorV1(descriptor);
void validateNormativeOperationAuthorizationV1(authorization);
void validateNormativeOperationPlanV1(plan, undefined as never, descriptor);
void validateNormativeMetricProjectionV1(projection);
void validateCampaignEligibilityAttestationV1(attestation);
void descriptorInput;
void authorizationInput;
void planInput;
void projectionInput;
void attestationInput;
void closureProofInput;
void analysis;
void streamVerification;
void operation;
void operationExecutionId;
void authorizationVerification;
void derivedAttestation;
void verifiedAttestation;
void normativeRunner;
void normativeProjector;
void adapterResolver;
void resolvedAdapter;
