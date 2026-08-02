import {
  collectiveClosedLoopDefinitionDigestV1,
  createCollectiveClosedLoopEvaluatorV1,
  createCollectiveClosedLoopReferenceRuntimeV1,
  createCollectiveClosedLoopReferenceScenarioV1,
  createCollectiveClosedLoopRuntimeRunnerV1,
  createCollectiveClosedLoopDefinitionV1,
  createCollectiveClosedLoopRunResultV1,
  replayAdaptiveCollectiveClosedLoopV1,
  replayCentralizedPlannerClosedLoopV1,
  runAdaptiveCollectiveClosedLoopV1,
  runCentralizedPlannerClosedLoopV1,
  runCollectiveClosedLoopActionV1,
  runCollectiveClosedLoopMeshRuntimeV1,
  validateCollectiveClosedLoopDefinitionV1,
  validateCollectiveClosedLoopRunResultV1,
  validateCollectiveCentralizedPlanningDecisionContextV1,
  validateCollectivePlanningDecisionContextV1,
  validateCollectivePlanningDecisionV1,
  type CollectiveClosedLoopDefinitionV1,
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
declare const evaluatorConfig: Parameters<
  typeof createCollectiveClosedLoopEvaluatorV1
>[0];
declare const runtimeRunnerInput: Parameters<
  typeof createCollectiveClosedLoopRuntimeRunnerV1
>[0];
declare const actionInput: Parameters<typeof runCollectiveClosedLoopActionV1>[0];
declare const definitionInput: Parameters<
  typeof createCollectiveClosedLoopDefinitionV1
>[0];
declare const resultInput: Parameters<
  typeof createCollectiveClosedLoopRunResultV1
>[0];

const stopReason: CollectiveClosedLoopStopReasonV1 = 'plan_completed';
const definitionDigest = collectiveClosedLoopDefinitionDigestV1(definitionInput);
const createdDefinition = createCollectiveClosedLoopDefinitionV1(definitionInput);
const validatedDefinition = validateCollectiveClosedLoopDefinitionV1(definition);
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
const createdRuntimeRunner = createCollectiveClosedLoopRuntimeRunnerV1(
  runtimeRunnerInput,
);
const adaptiveExecution = runAdaptiveCollectiveClosedLoopV1(executionInput);
const centralizedExecution = runCentralizedPlannerClosedLoopV1(executionInput);
const adaptiveReplay = replayAdaptiveCollectiveClosedLoopV1(replayInput);
const centralizedReplay = replayCentralizedPlannerClosedLoopV1(replayInput);
const meshRuntime = runCollectiveClosedLoopMeshRuntimeV1(runtimeInput);
const governedAction = runCollectiveClosedLoopActionV1(actionInput);
const createdReferenceRuntime = createCollectiveClosedLoopReferenceRuntimeV1(50);
const createdReferenceScenario = createCollectiveClosedLoopReferenceScenarioV1({
  runner: 'adaptive_collective',
  peerCount: 50,
  runtime: referenceRuntime,
});

void stopReason;
void definitionDigest;
void createdDefinition;
void validatedDefinition;
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

// Public contract records and their collections are immutable.
// @ts-expect-error definition fields are readonly
definition.maximumLogicalTimeMs = 10;
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

// A run result deliberately carries evidence roots, not a synthesized verdict,
// mutable ledger, or violation list.
// @ts-expect-error missionSuccess is outside the public result contract
result.missionSuccess;
// @ts-expect-error ledger is outside the public result contract
result.ledger;
// @ts-expect-error violations are outside the public result contract
result.violations;
