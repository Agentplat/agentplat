import {
  InMemoryMissionContinuityStoreV1,
  MissionContinuityRuntimeV1,
  type MissionContinuityPortV1,
  type MissionContinuityRuntimeOptionsV1,
  type MissionContinuityStateV1,
} from "@agentplat/collective-runtime/mission-continuity";
import {
  AttestedMissionControlRuntimeV1,
  type AttestedMissionControlPortV1,
  type AttestedMissionControlRuntimeOptionsV1,
} from "@agentplat/collective-runtime/attested-mission-control";
import {
  HeterogeneousAssessorEnsembleRuntimeV1,
  type HeterogeneousAssessorEnsembleRuntimeOptionsV1,
  type AssessorEnsembleVerdictV1,
} from "@agentplat/inference-control/assessor-ensemble";
import {
  MeshAdaptiveOverlayRuntimeV1,
  type MeshAdaptiveOverlayRuntimeOptionsV1,
  type MeshAdaptiveOverlayStateV1,
} from "@agentplat/mesh/adaptive-overlay";
import {
  buildBenchmarkLeaderboardV1,
  createReferenceMultiDomainEnvironmentAdapterV1,
  runMultiDomainAdapterConformanceV1,
  verifyVerifiedBenchmarkSubmissionV1,
  type BenchmarkTraceEvidenceVerifierV1,
  type MultiDomainAdapterConformanceReportV1,
  type MultiDomainScenarioDefinitionV1,
  type VerifiedBenchmarkLeaderboardV1,
  type VerifiedBenchmarkVerificationV1,
} from "@agentplat/mesh-sim";

declare const continuityOptions: MissionContinuityRuntimeOptionsV1;
declare const controlOptions: AttestedMissionControlRuntimeOptionsV1;
declare const assessorOptions: HeterogeneousAssessorEnsembleRuntimeOptionsV1;
declare const overlayOptions: MeshAdaptiveOverlayRuntimeOptionsV1;
declare const scenarioDefinition: MultiDomainScenarioDefinitionV1;
declare const traceVerifier: BenchmarkTraceEvidenceVerifierV1;
declare const submission: unknown;
declare const suiteManifestDigest: `sha256:${string}`;

const continuity: MissionContinuityPortV1 = new MissionContinuityRuntimeV1(
  continuityOptions,
);
const continuityState: Promise<MissionContinuityStateV1> =
  continuity.loadState();
const control: AttestedMissionControlPortV1 =
  new AttestedMissionControlRuntimeV1(controlOptions);
const assessor = new HeterogeneousAssessorEnsembleRuntimeV1(assessorOptions);
const overlay = new MeshAdaptiveOverlayRuntimeV1(overlayOptions);
const adapter = createReferenceMultiDomainEnvironmentAdapterV1({
  domain: "cyber",
});
const conformance: Promise<MultiDomainAdapterConformanceReportV1> =
  runMultiDomainAdapterConformanceV1({
    adapter,
    definition: scenarioDefinition,
  });
const verification: VerifiedBenchmarkVerificationV1 =
  verifyVerifiedBenchmarkSubmissionV1({
    submission,
    environmentDescriptor: adapter.descriptor,
    suiteManifestDigest,
    evidenceVerifier: traceVerifier,
  });
const leaderboard: VerifiedBenchmarkLeaderboardV1 = buildBenchmarkLeaderboardV1(
  {
    environmentDescriptor: adapter.descriptor,
    suiteManifestDigest,
    evidenceVerifier: traceVerifier,
    submissions: [submission],
  },
);

void InMemoryMissionContinuityStoreV1;
void continuityState;
void control;
void assessor;
void overlay;
void conformance;
void verification;
void leaderboard;

declare const verdict: AssessorEnsembleVerdictV1;
declare const overlayState: MeshAdaptiveOverlayStateV1;
void verdict.requestDigest;
void overlayState.policyDigest;
