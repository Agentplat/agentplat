import {
  createCollectiveClosedLoopReferenceRuntimeV1,
  createCollectiveClosedLoopResilienceReferenceScenarioV1,
  replayAdaptiveCollectiveClosedLoopResilienceV1,
  replayCentralizedPlannerClosedLoopResilienceV1,
  runAdaptiveCollectiveClosedLoopResilienceV1,
  runCentralizedPlannerClosedLoopResilienceV1,
  runPairedCollectiveClosedLoopResilienceCampaignV1,
  type CollectiveClosedLoopFaultMatrixPortV1,
  type CollectiveClosedLoopPairedResilienceCampaignInputV1,
  type CollectiveClosedLoopPairedResilienceCampaignResultV1,
  type CollectiveClosedLoopResilienceCampaignEvidenceV1,
  type CollectiveClosedLoopResilienceDefinitionV1,
  type CollectiveClosedLoopResilienceExecutionInputV1,
  type CollectiveClosedLoopResilienceExecutionResultV1,
  type CollectiveClosedLoopResilienceReplayInputV1,
  type CollectiveClosedLoopResilienceReplayResultV1,
  type CollectiveClosedLoopResilienceResultV1,
  type CreateCollectiveClosedLoopResilienceReferenceScenarioInputV1,
} from '@agentplat/mesh-sim';

const runtime = createCollectiveClosedLoopReferenceRuntimeV1(3);
const adaptiveInput: Promise<CollectiveClosedLoopResilienceExecutionInputV1> =
  runtime.then((referenceRuntime) =>
    createCollectiveClosedLoopResilienceReferenceScenarioV1({
      runner: 'adaptive_collective',
      peerCount: 3,
      runtime: referenceRuntime,
    })
  );
const centralizedInput: Promise<CollectiveClosedLoopResilienceExecutionInputV1> =
  runtime.then((referenceRuntime) =>
    createCollectiveClosedLoopResilienceReferenceScenarioV1({
      runner: 'centralized_planner',
      peerCount: 3,
      runtime: referenceRuntime,
    })
  );

const adaptiveRun: Promise<CollectiveClosedLoopResilienceExecutionResultV1> =
  adaptiveInput.then(runAdaptiveCollectiveClosedLoopResilienceV1);
const centralizedRun: Promise<CollectiveClosedLoopResilienceExecutionResultV1> =
  centralizedInput.then(runCentralizedPlannerClosedLoopResilienceV1);

const adaptiveReplayInput: CollectiveClosedLoopResilienceReplayInputV1 = {
  schemaVersion: 1,
  createInput: () => adaptiveInput,
};
const adaptiveReplay: Promise<CollectiveClosedLoopResilienceReplayResultV1> =
  replayAdaptiveCollectiveClosedLoopResilienceV1(adaptiveReplayInput);
const centralizedReplay: Promise<CollectiveClosedLoopResilienceReplayResultV1> =
  replayCentralizedPlannerClosedLoopResilienceV1({
    schemaVersion: 1,
    createInput: () => centralizedInput,
  });

const pairedInput: CollectiveClosedLoopPairedResilienceCampaignInputV1 = {
  schemaVersion: 1,
  createAdaptiveInput: () => adaptiveInput,
  createCentralizedInput: () => centralizedInput,
};
const paired: Promise<CollectiveClosedLoopPairedResilienceCampaignResultV1> =
  runPairedCollectiveClosedLoopResilienceCampaignV1(pairedInput);

void adaptiveRun;
void centralizedRun;
void adaptiveReplay;
void centralizedReplay;
void paired;
void (null as CollectiveClosedLoopFaultMatrixPortV1 | null);
void (null as CollectiveClosedLoopResilienceCampaignEvidenceV1 | null);
void (null as CollectiveClosedLoopResilienceDefinitionV1 | null);
void (null as CollectiveClosedLoopResilienceResultV1 | null);
void (null as CreateCollectiveClosedLoopResilienceReferenceScenarioInputV1 | null);
