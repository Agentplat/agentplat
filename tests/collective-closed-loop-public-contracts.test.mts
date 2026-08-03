import {
  collectiveClosedLoopDefinitionDigestV1,
  collectiveClosedLoopFaultPlanDigestV1,
  collectiveClosedLoopResilienceCampaignEvidenceDigestV1,
  collectiveClosedLoopResilienceDefinitionDigestV1,
  collectiveClosedLoopResilienceResultDigestV1,
  createCollectiveClosedLoopEvaluatorV1,
  createCollectiveClosedLoopReferenceRuntimeV1,
  createCollectiveClosedLoopReferenceScenarioV1,
  createCollectiveClosedLoopResilienceReferenceScenarioV1,
  createCollectiveClosedLoopRuntimeRunnerV1,
  createCollectiveClosedLoopDefinitionV1,
  createCollectiveClosedLoopFaultPlanV1,
  createCollectiveClosedLoopFaultMatrixMissionBindingV1,
  createCollectiveClosedLoopFaultMatrixPortV1,
  createCollectiveClosedLoopResilienceCampaignEvidenceV1,
  createCollectiveClosedLoopResilienceDefinitionV1,
  createCollectiveClosedLoopResilienceResultV1,
  createCollectiveClosedLoopRunResultV1,
  replayAdaptiveCollectiveClosedLoopV1,
  replayAdaptiveCollectiveClosedLoopResilienceV1,
  replayCentralizedPlannerClosedLoopV1,
  replayCentralizedPlannerClosedLoopResilienceV1,
  runAdaptiveCollectiveClosedLoopV1,
  runAdaptiveCollectiveClosedLoopResilienceV1,
  runCentralizedPlannerClosedLoopV1,
  runCentralizedPlannerClosedLoopResilienceV1,
  runCollectiveClosedLoopCausalReplanningV1,
  runCollectiveClosedLoopFaultMatrixV1,
  runCollectiveClosedLoopFaultMatrixPortV1,
  runCollectiveClosedLoopActionV1,
  runCollectiveClosedLoopMeshRuntimeV1,
  runPairedCollectiveClosedLoopResilienceCampaignV1,
  validateCollectiveClosedLoopDefinitionV1,
  validateCollectiveClosedLoopFaultPlanV1,
  validateCollectiveClosedLoopResilienceCampaignEvidenceV1,
  validateCollectiveClosedLoopResilienceCampaignEvidenceForResultV1,
  validateCollectiveClosedLoopResilienceDefinitionV1,
  validateCollectiveClosedLoopResilienceResultV1,
  validateCollectiveClosedLoopResilienceResultForDefinitionV1,
  validateCollectiveClosedLoopRunResultV1,
  validateCollectiveCentralizedPlanningDecisionContextV1,
  validateCollectivePlanningDecisionContextV1,
  validateCollectivePlanningDecisionV1,
  type CollectiveClosedLoopDefinitionV1,
  type CollectiveClosedLoopCausalReplanningInputV1,
  type CollectiveClosedLoopFaultMatrixInputV1,
  type CollectiveClosedLoopFaultMatrixMissionBindingV1,
  type CollectiveClosedLoopFaultMatrixPortV1,
  type CollectiveClosedLoopFaultPlanV1,
  type CollectiveClosedLoopResilienceCampaignEvidenceV1,
  type CollectiveClosedLoopResilienceDefinitionV1,
  type CollectiveClosedLoopResilienceResultV1,
  type CollectiveClosedLoopResilienceExecutionInputV1,
  type CollectiveClosedLoopResilienceExecutionResultV1,
  type CollectiveClosedLoopResilienceReplayInputV1,
  type CollectiveClosedLoopResilienceReplayResultV1,
  type CollectiveClosedLoopPairedResilienceCampaignInputV1,
  type CollectiveClosedLoopPairedResilienceCampaignResultV1,
  type CollectiveClosedLoopEvaluatorV1,
  type CollectiveClosedLoopExecutionInputV1,
  type CollectiveClosedLoopExecutionResultV1,
  type CollectiveClosedLoopPeerV1,
  type CollectiveClosedLoopReplayInputV1,
  type CollectiveClosedLoopReplayResultV1,
  type CollectiveClosedLoopReferenceRuntimeV1,
  type CollectiveClosedLoopRuntimeInputV1,
  type CollectiveClosedLoopRuntimeRunnerV1,
  type CollectiveClosedLoopRunResultV1,
  type CollectiveClosedLoopStopReasonV1,
  type CollectiveCentralizedPlanningDecisionContextV1,
  type CollectivePlanningDecisionContextV1,
  type CollectivePlanningDecisionPolicyV1,
  type CollectivePlanningDecisionV1,
} from '@agentplat/mesh-sim';

declare const peer: CollectiveClosedLoopPeerV1;
declare const definition: CollectiveClosedLoopDefinitionV1;
declare const faultPlan: CollectiveClosedLoopFaultPlanV1;
declare const resilienceDefinition: CollectiveClosedLoopResilienceDefinitionV1;
declare const resilienceResult: CollectiveClosedLoopResilienceResultV1;
declare const resilienceEvidence: CollectiveClosedLoopResilienceCampaignEvidenceV1;
declare const context: CollectivePlanningDecisionContextV1;
declare const centralizedContext: CollectiveCentralizedPlanningDecisionContextV1;
declare const decision: CollectivePlanningDecisionV1;
declare const decisionPolicy: CollectivePlanningDecisionPolicyV1;
declare const result: CollectiveClosedLoopRunResultV1;
declare const evaluator: CollectiveClosedLoopEvaluatorV1;
declare const executionInput: CollectiveClosedLoopExecutionInputV1;
declare const executionResult: CollectiveClosedLoopExecutionResultV1;
declare const replayInput: CollectiveClosedLoopReplayInputV1;
declare const replayResult: CollectiveClosedLoopReplayResultV1;
declare const runtimeInput: CollectiveClosedLoopRuntimeInputV1;
declare const runtimeRunner: CollectiveClosedLoopRuntimeRunnerV1;
declare const referenceRuntime: CollectiveClosedLoopReferenceRuntimeV1;
declare const resilienceExecutionInput: CollectiveClosedLoopResilienceExecutionInputV1;
declare const resilienceExecutionResult: CollectiveClosedLoopResilienceExecutionResultV1;
declare const resilienceReplayInput: CollectiveClosedLoopResilienceReplayInputV1;
declare const resilienceReplayResult: CollectiveClosedLoopResilienceReplayResultV1;
declare const pairedCampaignInput: CollectiveClosedLoopPairedResilienceCampaignInputV1;
declare const pairedCampaignResult: CollectiveClosedLoopPairedResilienceCampaignResultV1;
declare const replanningInput: CollectiveClosedLoopCausalReplanningInputV1;
declare const faultMatrixInput: CollectiveClosedLoopFaultMatrixInputV1<
  unknown,
  unknown
>;
declare const evaluatorConfig: Parameters<
  typeof createCollectiveClosedLoopEvaluatorV1
>[0];
declare const runtimeRunnerInput: Parameters<
  typeof createCollectiveClosedLoopRuntimeRunnerV1
>[0];
declare const actionInput: Parameters<
  typeof runCollectiveClosedLoopActionV1
>[0];
declare const definitionInput: Parameters<
  typeof createCollectiveClosedLoopDefinitionV1
>[0];
declare const faultPlanInput: Parameters<
  typeof createCollectiveClosedLoopFaultPlanV1
>[0];
declare const resilienceDefinitionInput: Parameters<
  typeof createCollectiveClosedLoopResilienceDefinitionV1
>[0];
declare const resilienceResultInput: Parameters<
  typeof createCollectiveClosedLoopResilienceResultV1
>[0];
declare const resilienceEvidenceInput: Parameters<
  typeof createCollectiveClosedLoopResilienceCampaignEvidenceV1
>[0];
declare const resultInput: Parameters<
  typeof createCollectiveClosedLoopRunResultV1
>[0];

const stopReason: CollectiveClosedLoopStopReasonV1 = 'plan_completed';
const definitionDigest =
  collectiveClosedLoopDefinitionDigestV1(definitionInput);
const faultPlanDigest = collectiveClosedLoopFaultPlanDigestV1(faultPlanInput);
const resilienceDefinitionDigest =
  collectiveClosedLoopResilienceDefinitionDigestV1(resilienceDefinitionInput);
const resilienceResultDigest = collectiveClosedLoopResilienceResultDigestV1(
  resilienceResultInput
);
const resilienceEvidenceDigest =
  collectiveClosedLoopResilienceCampaignEvidenceDigestV1(
    resilienceEvidenceInput
  );
const createdDefinition =
  createCollectiveClosedLoopDefinitionV1(definitionInput);
const createdFaultPlan = createCollectiveClosedLoopFaultPlanV1(faultPlanInput);
const createdResilienceDefinition =
  createCollectiveClosedLoopResilienceDefinitionV1(resilienceDefinitionInput);
const createdResilienceResult = createCollectiveClosedLoopResilienceResultV1(
  resilienceResultInput
);
const createdResilienceEvidence =
  createCollectiveClosedLoopResilienceCampaignEvidenceV1(
    resilienceEvidenceInput
  );
const validatedDefinition =
  validateCollectiveClosedLoopDefinitionV1(definition);
const validatedFaultPlan = validateCollectiveClosedLoopFaultPlanV1(faultPlan);
const validatedResilienceDefinition =
  validateCollectiveClosedLoopResilienceDefinitionV1(resilienceDefinition);
const validatedResilienceResult =
  validateCollectiveClosedLoopResilienceResultV1(resilienceResult);
const validatedResilienceEvidence =
  validateCollectiveClosedLoopResilienceCampaignEvidenceV1(resilienceEvidence);
const definitionBoundResilienceResult =
  validateCollectiveClosedLoopResilienceResultForDefinitionV1(
    resilienceResult,
    resilienceDefinition
  );
const resultBoundResilienceEvidence =
  validateCollectiveClosedLoopResilienceCampaignEvidenceForResultV1(
    resilienceEvidence,
    resilienceDefinition,
    resilienceResult
  );
const createdResult = createCollectiveClosedLoopRunResultV1(resultInput);
const validatedResult = validateCollectiveClosedLoopRunResultV1(result);
const validatedContext = validateCollectivePlanningDecisionContextV1(context);
const validatedCentralizedContext =
  validateCollectiveCentralizedPlanningDecisionContextV1(centralizedContext);
const validatedDecision = validateCollectivePlanningDecisionV1(decision);
const policyDecision = decisionPolicy.decide(context);
const centralizedPolicyDecision =
  decisionPolicy.decideCentralized(centralizedContext);
const createdEvaluator = createCollectiveClosedLoopEvaluatorV1(evaluatorConfig);
const createdRuntimeRunner =
  createCollectiveClosedLoopRuntimeRunnerV1(runtimeRunnerInput);
const adaptiveExecution = runAdaptiveCollectiveClosedLoopV1(executionInput);
const centralizedExecution = runCentralizedPlannerClosedLoopV1(executionInput);
const adaptiveReplay = replayAdaptiveCollectiveClosedLoopV1(replayInput);
const centralizedReplay = replayCentralizedPlannerClosedLoopV1(replayInput);
const meshRuntime = runCollectiveClosedLoopMeshRuntimeV1(runtimeInput);
const governedAction = runCollectiveClosedLoopActionV1(actionInput);
const createdReferenceRuntime =
  createCollectiveClosedLoopReferenceRuntimeV1(50);
const createdReferenceScenario = createCollectiveClosedLoopReferenceScenarioV1({
  runner: 'adaptive_collective',
  peerCount: 50,
  runtime: referenceRuntime,
});
const createdResilienceReferenceScenario =
  createCollectiveClosedLoopResilienceReferenceScenarioV1({
    runner: 'adaptive_collective',
    peerCount: 50,
    runtime: referenceRuntime,
  });
const adaptiveResilienceExecution = runAdaptiveCollectiveClosedLoopResilienceV1(
  resilienceExecutionInput
);
const centralizedResilienceExecution =
  runCentralizedPlannerClosedLoopResilienceV1(resilienceExecutionInput);
const adaptiveResilienceReplay = replayAdaptiveCollectiveClosedLoopResilienceV1(
  resilienceReplayInput
);
const centralizedResilienceReplay =
  replayCentralizedPlannerClosedLoopResilienceV1(resilienceReplayInput);
const pairedResilienceCampaign =
  runPairedCollectiveClosedLoopResilienceCampaignV1(pairedCampaignInput);
const causalReplanning =
  runCollectiveClosedLoopCausalReplanningV1(replanningInput);
const faultMatrix = runCollectiveClosedLoopFaultMatrixV1(faultMatrixInput);
const faultMatrixMissionBinding: CollectiveClosedLoopFaultMatrixMissionBindingV1 =
  createCollectiveClosedLoopFaultMatrixMissionBindingV1({
    preEffect: resilienceExecutionResult.preEffect,
    replacementPeerId: resilienceExecutionInput.replacementPeerId,
  });
const faultMatrixPort: CollectiveClosedLoopFaultMatrixPortV1 =
  createCollectiveClosedLoopFaultMatrixPortV1(
    faultMatrixInput,
    faultMatrixMissionBinding
  );
const executedFaultMatrixPort =
  runCollectiveClosedLoopFaultMatrixPortV1(faultMatrixPort);

void stopReason;
void definitionDigest;
void faultPlanDigest;
void resilienceDefinitionDigest;
void resilienceResultDigest;
void resilienceEvidenceDigest;
void createdDefinition;
void createdFaultPlan;
void createdResilienceDefinition;
void createdResilienceResult;
void createdResilienceEvidence;
void validatedDefinition;
void validatedFaultPlan;
void validatedResilienceDefinition;
void validatedResilienceResult;
void validatedResilienceEvidence;
void definitionBoundResilienceResult;
void resultBoundResilienceEvidence;
void createdResult;
void validatedResult;
void validatedContext;
void validatedCentralizedContext;
void validatedDecision;
void policyDecision;
void centralizedPolicyDecision;
void evaluator;
void executionResult;
void replayResult;
void runtimeRunner;
void createdEvaluator;
void createdRuntimeRunner;
void adaptiveExecution;
void centralizedExecution;
void adaptiveReplay;
void centralizedReplay;
void meshRuntime;
void governedAction;
void createdReferenceRuntime;
void createdReferenceScenario;
void createdResilienceReferenceScenario;
void resilienceExecutionResult;
void resilienceReplayResult;
void pairedCampaignResult;
void adaptiveResilienceExecution;
void centralizedResilienceExecution;
void adaptiveResilienceReplay;
void centralizedResilienceReplay;
void pairedResilienceCampaign;
void causalReplanning;
void faultMatrix;
void faultMatrixMissionBinding;
void faultMatrixPort;
void executedFaultMatrixPort;

// Public contract records and their collections are immutable.
// @ts-expect-error definition fields are readonly
definition.maximumLogicalTimeMs = 10;
// @ts-expect-error resilience definitions are immutable and bind the nominal definition
resilienceDefinition.maximumEpochs = 3;
// @ts-expect-error fault plans expose only readonly causal schedules
faultPlan.faults.pop();
// @ts-expect-error evidence collections are immutable
resilienceEvidence.observedFaultIds.push('fault:replacement');
// @ts-expect-error stale-result evidence is immutable
resilienceResult.staleResultRejections[0] =
  resilienceResult.staleResultRejections[0];
// @ts-expect-error the peer collection is readonly
definition.peers.push(peer);
// @ts-expect-error peer identities are readonly
peer.peerId = 'peer:replacement';
// @ts-expect-error capability collections are readonly
peer.capabilityKeys.push('capability.admin');
// @ts-expect-error neighbor collections are readonly
peer.neighborPeerIds[0] = 'peer:replacement';
// @ts-expect-error decision context fields are readonly
context.logicalTimeMs = 20;
// @ts-expect-error observations are exposed as a readonly collection
context.observations.pop();
// @ts-expect-error centralized observations are exposed as readonly evidence
centralizedContext.observations.pop();
// @ts-expect-error result fields are readonly
result.stopReason = 'explicit_failure';
// @ts-expect-error state-root collections are readonly
result.planningStateRoots.push(definition.definitionDigest);
// @ts-expect-error artifacts are exposed as a readonly collection
result.publicArtifacts.splice(0, 1);
// @ts-expect-error evaluator ports are immutable construction boundaries
evaluator.environment = executionInput.evaluator.environment;
// @ts-expect-error execution observations are readonly evidence
executionResult.observations.pop();
// @ts-expect-error runtime cryptographic handles cannot be replaced
runtimeRunner.privateKeys = {};
// @ts-expect-error replay results are immutable
replayResult.matched = false;
// @ts-expect-error reference runtime handles are immutable
referenceRuntime.peerCount = 3;
// @ts-expect-error resilient execution evidence is immutable
resilienceExecutionResult.resilience.epochs.pop();
// @ts-expect-error paired campaign results are immutable
pairedCampaignResult.matched = false;

// A run result deliberately carries evidence roots, not a synthesized verdict,
// mutable ledger, or violation list.
// @ts-expect-error missionSuccess is outside the public result contract
result.missionSuccess;
// @ts-expect-error ledger is outside the public result contract
result.ledger;
// @ts-expect-error violations are outside the public result contract
result.violations;
