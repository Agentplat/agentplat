import {
  COLLECTIVE_EVALUATION_CAMPAIGN_RUNNERS_V1,
  COLLECTIVE_EVALUATION_CAMPAIGN_SCALES_V1,
  COLLECTIVE_EVALUATION_CAMPAIGN_SCHEMA_VERSION_V1,
  COLLECTIVE_EVALUATION_CAMPAIGN_STRATA_V1,
  COLLECTIVE_EVALUATION_DIAGNOSTIC_CAMPAIGN_PROFILE_V1,
  COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1,
  COLLECTIVE_EVALUATION_PREFLIGHT_CAMPAIGN_PROFILE_V1,
  campaignCellIdV1,
  collectiveEvaluationCampaignManifestDigestV1,
  collectiveEvaluationCampaignProfileCellsV1,
  collectiveEvaluationCampaignRegistrationDigestV1,
  createCollectiveEvaluationCampaignManifestV1,
  createCollectiveEvaluationCampaignRegistrationV1,
  validateCollectiveEvaluationCampaignManifestV1,
  validateCollectiveEvaluationCampaignRegistrationV1,
  type CollectiveEvaluationCampaignCellV1,
  type CollectiveEvaluationCampaignManifestEntryV1,
  type CollectiveEvaluationCampaignManifestV1,
  type CollectiveEvaluationCampaignProfileV1,
  type CollectiveEvaluationCampaignRegistrationV1,
  type CollectiveEvaluationCampaignRunnerV1,
  type CollectiveEvaluationCampaignScaleV1,
  type CollectiveEvaluationCampaignStratumV1,
} from "@agentplat/collective-planning/evaluation";
import {
  COLLECTIVE_STATISTICAL_CAMPAIGN_FAULT_FAMILIES_V1,
  COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_ARTIFACT_BYTES_V1,
  COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_BUNDLE_BYTES_V1,
  COLLECTIVE_STATISTICAL_CAMPAIGN_SCALE_LADDER_V1,
  COLLECTIVE_STATISTICAL_CAMPAIGN_SCHEMA_VERSION_V1,
  COLLECTIVE_STATISTICAL_CAMPAIGN_STRATA_V1,
  createCollectiveStatisticalCampaignFaultCoverageV1,
  createCollectiveStatisticalCampaignExecutionArtifactsV1,
  createCollectiveStatisticalCampaignFaultMatrixV1,
  createCollectiveStatisticalCampaignScaleConfigurationV1,
  createCollectiveStatisticalCampaignTopologyV1,
  digestCollectiveStatisticalCampaignArtifactV1,
  digestCollectiveStatisticalCampaignBundleV1,
  digestCollectiveStatisticalCampaignComparisonInputV1,
  digestCollectiveStatisticalCampaignComparisonV1,
  digestCollectiveStatisticalCampaignEvidenceV1,
  digestCollectiveStatisticalCampaignLedgerV1,
  digestCollectiveStatisticalCampaignSampleV1,
  digestCollectiveStatisticalCampaignSummaryV1,
  digestCollectiveStatisticalCampaignTraceV1,
  aggregateCollectiveStatisticalCampaignV1,
  createMemoryCollectiveStatisticalCampaignExecutionStoreV1,
  reconstructCollectiveStatisticalCampaignExecutionV1,
  runCollectiveStatisticalCampaignShardV1,
  validateCollectiveStatisticalCampaignExecutionArtifactsV1,
  validateCollectiveStatisticalCampaignFaultCoverageV1,
  validateCollectiveStatisticalCampaignFaultMatrixV1,
  validateCollectiveStatisticalCampaignScaleConfigurationV1,
  validateCollectiveStatisticalCampaignTopologyV1,
  verifyCollectiveStatisticalCampaignBundleV1,
  type CollectiveStatisticalCampaignArtifactIndexEntryV1,
  type CollectiveStatisticalCampaignArtifactKindV1,
  type CollectiveStatisticalCampaignAggregationInputV1,
  type CollectiveStatisticalCampaignAggregationResultV1,
  type CollectiveStatisticalCampaignAttemptV1,
  type CollectiveStatisticalCampaignBundleBytesV1,
  type CollectiveStatisticalCampaignBundleV1,
  type CollectiveStatisticalCampaignBundleVerificationHooksV1,
  type CollectiveStatisticalCampaignBundleVerificationResultV1,
  type CollectiveStatisticalCampaignCellV1,
  type CollectiveStatisticalCampaignComparisonV1,
  type CollectiveStatisticalCampaignEvidenceV1,
  type CollectiveStatisticalCampaignExecutionArtifactsV1,
  type CollectiveStatisticalCampaignExecutionContextV1,
  type CollectiveStatisticalCampaignExecutionStoreV1,
  type CollectiveStatisticalCampaignExpectedArtifactV1,
  type CollectiveStatisticalCampaignFaultCoverageV1,
  type CollectiveStatisticalCampaignFaultFamilyV1,
  type CollectiveStatisticalCampaignFaultMatrixRowV1,
  type CollectiveStatisticalCampaignFaultMatrixV1,
  type CollectiveStatisticalCampaignLedgerV1,
  type CollectiveStatisticalCampaignRunnerV1,
  type CollectiveStatisticalCampaignSampleV1,
  type CollectiveStatisticalCampaignScaleConfigurationV1,
  type CollectiveStatisticalCampaignScaleV1,
  type CollectiveStatisticalCampaignShardExecutionInputV1,
  type CollectiveStatisticalCampaignShardExecutionResultV1,
  type CollectiveStatisticalCampaignSourceLockV1,
  type CollectiveStatisticalCampaignStratumV1,
  type CollectiveStatisticalCampaignSummaryV1,
  type CollectiveStatisticalCampaignTopologyEdgeV1,
  type CollectiveStatisticalCampaignTopologyV1,
  type CollectiveStatisticalCampaignTraceV1,
} from "@agentplat/mesh-sim";

declare const registrationInput: Parameters<
  typeof createCollectiveEvaluationCampaignRegistrationV1
>[0];
declare const registration: CollectiveEvaluationCampaignRegistrationV1;
declare const manifestInput: Parameters<
  typeof createCollectiveEvaluationCampaignManifestV1
>[1];
declare const manifest: CollectiveEvaluationCampaignManifestV1;
declare const bundle: CollectiveStatisticalCampaignBundleV1;
declare const bundleBytes: CollectiveStatisticalCampaignBundleBytesV1;
declare const hooks: CollectiveStatisticalCampaignBundleVerificationHooksV1;
declare const comparison: CollectiveStatisticalCampaignComparisonV1;
declare const sampleBody: Omit<
  CollectiveStatisticalCampaignSampleV1,
  "sampleDigest"
>;
declare const traceBody: Omit<
  CollectiveStatisticalCampaignTraceV1,
  "traceDigest"
>;
declare const evidenceBody: Omit<
  CollectiveStatisticalCampaignEvidenceV1,
  "evidenceDigest"
>;
declare const ledgerBody: Omit<
  CollectiveStatisticalCampaignLedgerV1,
  "ledgerDigest"
>;
declare const summaryBody: Omit<
  CollectiveStatisticalCampaignSummaryV1,
  "summaryDigest"
>;

const schema: typeof COLLECTIVE_EVALUATION_CAMPAIGN_SCHEMA_VERSION_V1 = 1;
const statisticalSchema: typeof COLLECTIVE_STATISTICAL_CAMPAIGN_SCHEMA_VERSION_V1 =
  1;
const profile: CollectiveEvaluationCampaignProfileV1 =
  COLLECTIVE_EVALUATION_NORMATIVE_CAMPAIGN_PROFILE_V1;
const diagnosticProfile: CollectiveEvaluationCampaignProfileV1 =
  COLLECTIVE_EVALUATION_DIAGNOSTIC_CAMPAIGN_PROFILE_V1;
const scale: CollectiveEvaluationCampaignScaleV1 = 500;
const stratum: CollectiveEvaluationCampaignStratumV1 = "mixed";
const runner: CollectiveEvaluationCampaignRunnerV1 = "adaptive_collective";
const artifactKind: CollectiveStatisticalCampaignArtifactKindV1 = "summary";
const attempt: CollectiveStatisticalCampaignAttemptV1 = "replay";
const statisticalRunner: CollectiveStatisticalCampaignRunnerV1 =
  "centralized_planner";
const statisticalStratum: CollectiveStatisticalCampaignStratumV1 = "benign";
const faultFamily: CollectiveStatisticalCampaignFaultFamilyV1 = "peer.crash";
const cells = collectiveEvaluationCampaignProfileCellsV1(
  COLLECTIVE_EVALUATION_PREFLIGHT_CAMPAIGN_PROFILE_V1,
  "type-contract",
);
const cellId = campaignCellIdV1("type-contract", 50, "nominal", 0);
const registrationDigest =
  collectiveEvaluationCampaignRegistrationDigestV1(registrationInput);
const createdRegistration =
  createCollectiveEvaluationCampaignRegistrationV1(registrationInput);
const validatedRegistration =
  validateCollectiveEvaluationCampaignRegistrationV1(registration);
const manifestDigest = collectiveEvaluationCampaignManifestDigestV1(
  manifestInput,
  registration,
);
const createdManifest = createCollectiveEvaluationCampaignManifestV1(
  registration,
  manifestInput,
);
const validatedManifest = validateCollectiveEvaluationCampaignManifestV1(
  manifest,
  registration,
);
const scaleConfiguration =
  createCollectiveStatisticalCampaignScaleConfigurationV1({
    schemaVersion: 1,
    agentCount: 50,
    seed: 0,
    stratum: "nominal",
  });
const topology = createCollectiveStatisticalCampaignTopologyV1({
  schemaVersion: 1,
  agentCount: 100,
  seed: 1,
});
const faultMatrix = createCollectiveStatisticalCampaignFaultMatrixV1();
const coverage = createCollectiveStatisticalCampaignFaultCoverageV1({
  schemaVersion: 1,
  stratum: "nominal",
  registeredFaultFamilies: [],
  observedFaultFamilies: [],
});
const verification: Promise<CollectiveStatisticalCampaignBundleVerificationResultV1> =
  verifyCollectiveStatisticalCampaignBundleV1(bundle, bundleBytes, hooks);

void COLLECTIVE_EVALUATION_CAMPAIGN_RUNNERS_V1;
void COLLECTIVE_EVALUATION_CAMPAIGN_SCALES_V1;
void COLLECTIVE_EVALUATION_CAMPAIGN_STRATA_V1;
void COLLECTIVE_STATISTICAL_CAMPAIGN_FAULT_FAMILIES_V1;
void COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_ARTIFACT_BYTES_V1;
void COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_BUNDLE_BYTES_V1;
void COLLECTIVE_STATISTICAL_CAMPAIGN_SCALE_LADDER_V1;
void COLLECTIVE_STATISTICAL_CAMPAIGN_STRATA_V1;
void schema;
void statisticalSchema;
void profile;
void diagnosticProfile;
void scale;
void stratum;
void runner;
void artifactKind;
void attempt;
void statisticalRunner;
void statisticalStratum;
void faultFamily;
void cells;
void cellId;
void registrationDigest;
void createdRegistration;
void validatedRegistration;
void manifestDigest;
void createdManifest;
void validatedManifest;
void scaleConfiguration;
void validateCollectiveStatisticalCampaignScaleConfigurationV1(
  scaleConfiguration,
);
void topology;
void validateCollectiveStatisticalCampaignTopologyV1(topology);
void faultMatrix;
void validateCollectiveStatisticalCampaignFaultMatrixV1(faultMatrix);
void coverage;
void validateCollectiveStatisticalCampaignFaultCoverageV1(coverage);
void verification;
void aggregateCollectiveStatisticalCampaignV1;
void createCollectiveStatisticalCampaignExecutionArtifactsV1;
void createMemoryCollectiveStatisticalCampaignExecutionStoreV1;
void reconstructCollectiveStatisticalCampaignExecutionV1;
void runCollectiveStatisticalCampaignShardV1;
void validateCollectiveStatisticalCampaignExecutionArtifactsV1;
void (null as CollectiveStatisticalCampaignAggregationInputV1 | null);
void (null as CollectiveStatisticalCampaignAggregationResultV1 | null);
void (null as CollectiveStatisticalCampaignExecutionArtifactsV1 | null);
void (null as CollectiveStatisticalCampaignExecutionContextV1 | null);
void (null as CollectiveStatisticalCampaignExecutionStoreV1 | null);
void (null as CollectiveStatisticalCampaignShardExecutionInputV1 | null);
void (null as CollectiveStatisticalCampaignShardExecutionResultV1 | null);
void digestCollectiveStatisticalCampaignArtifactV1;
void digestCollectiveStatisticalCampaignBundleV1;
void digestCollectiveStatisticalCampaignComparisonInputV1;
void digestCollectiveStatisticalCampaignComparisonV1;
void digestCollectiveStatisticalCampaignEvidenceV1(evidenceBody);
void digestCollectiveStatisticalCampaignLedgerV1(ledgerBody);
void digestCollectiveStatisticalCampaignSampleV1(sampleBody);
void digestCollectiveStatisticalCampaignSummaryV1(summaryBody);
void digestCollectiveStatisticalCampaignTraceV1(traceBody);
void (null as CollectiveEvaluationCampaignCellV1 | null);
void (null as CollectiveEvaluationCampaignManifestEntryV1 | null);
void (null as CollectiveStatisticalCampaignArtifactIndexEntryV1 | null);
void (null as CollectiveStatisticalCampaignCellV1 | null);
void (null as CollectiveStatisticalCampaignExpectedArtifactV1 | null);
void (null as CollectiveStatisticalCampaignFaultCoverageV1 | null);
void (null as CollectiveStatisticalCampaignFaultMatrixRowV1 | null);
void (null as CollectiveStatisticalCampaignFaultMatrixV1 | null);
void (null as CollectiveStatisticalCampaignLedgerV1 | null);
void (null as CollectiveStatisticalCampaignScaleConfigurationV1 | null);
void (null as CollectiveStatisticalCampaignScaleV1 | null);
void (null as CollectiveStatisticalCampaignSourceLockV1 | null);
void (null as CollectiveStatisticalCampaignTopologyEdgeV1 | null);
void (null as CollectiveStatisticalCampaignTopologyV1 | null);

// @ts-expect-error the campaign ladder is closed to four registered scales.
createCollectiveStatisticalCampaignTopologyV1({ schemaVersion: 1, agentCount: 51, seed: 0 });
// @ts-expect-error an unregistered runner cannot enter a comparison.
const invalidRunner: CollectiveStatisticalCampaignRunnerV1 = "oracle";
// @ts-expect-error campaign registrations are immutable after they are sealed.
registration.maximumInteractions = 6_000;
// @ts-expect-error bundle artifact indexes are immutable evidence.
bundle.artifacts.pop();
