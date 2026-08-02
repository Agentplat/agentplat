import {
  collectiveClosedLoopDefinitionDigestV1,
  createCollectiveClosedLoopDefinitionV1,
  createCollectiveClosedLoopReferenceRuntimeV1,
  createCollectiveClosedLoopReferenceScenarioV1,
  createCollectiveClosedLoopRunResultV1,
  createCollectiveClosedLoopRuntimeRunnerV1,
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
  type CollectiveClosedLoopActionInputV1,
  type CollectiveClosedLoopActionPreparationContextV1,
  type CollectiveClosedLoopActionResultV1,
  type CollectiveClosedLoopCurrentMeshV1,
  type CollectiveClosedLoopDefinitionV1,
  type CollectiveClosedLoopEffectMetadataV1,
  type CollectiveClosedLoopEvaluatorV1,
  type CollectiveClosedLoopExecutionInputV1,
  type CollectiveClosedLoopExecutionResultV1,
  type CollectiveClosedLoopFinalizationInputV1,
  type CollectiveClosedLoopFinalizedResultV1,
  type CollectiveClosedLoopPeerV1,
  type CollectiveClosedLoopPreEffectHandleV1,
  type CollectiveClosedLoopReferenceRuntimeV1,
  type CollectiveClosedLoopReplayInputV1,
  type CollectiveClosedLoopReplayResultV1,
  type CollectiveClosedLoopRunResultV1,
  type CollectiveClosedLoopRuntimeInputV1,
  type CollectiveClosedLoopRuntimePeerV1,
  type CollectiveClosedLoopRuntimeRunnerV1,
  type CollectiveClosedLoopStopReasonV1,
  type CollectiveCentralizedPlanningDecisionContextV1,
  type CollectivePlanningDecisionContextV1,
  type CollectivePlanningDecisionPolicyV1,
  type CollectivePlanningDecisionV1,
  type CollectiveClosedLoopPreparedActionV1,
  type CreateCollectiveClosedLoopReferenceScenarioInputV1,
} from '@agentplat/mesh-sim';

declare const definitionBody: Omit<
  CollectiveClosedLoopDefinitionV1,
  'definitionDigest'
>;
declare const runBody: Omit<CollectiveClosedLoopRunResultV1, 'runDigest'>;
declare const decisionContext: CollectivePlanningDecisionContextV1;
declare const centralizedDecisionContext: CollectiveCentralizedPlanningDecisionContextV1;
declare const decision: CollectivePlanningDecisionV1;
declare const actionInput: CollectiveClosedLoopActionInputV1;
declare const actionResult: CollectiveClosedLoopActionResultV1;
declare const runtimeInput: CollectiveClosedLoopRuntimeInputV1;
declare const runtimeRunnerInput: Parameters<
  typeof createCollectiveClosedLoopRuntimeRunnerV1
>[0];

const definition = createCollectiveClosedLoopDefinitionV1(definitionBody);
const definitionDigest = collectiveClosedLoopDefinitionDigestV1(definitionBody);
const validatedDefinition = validateCollectiveClosedLoopDefinitionV1(definition);
const run = createCollectiveClosedLoopRunResultV1(runBody);
const validatedRun = validateCollectiveClosedLoopRunResultV1(run);
const validatedContext = validateCollectivePlanningDecisionContextV1(
  decisionContext,
);
const validatedCentralizedContext =
  validateCollectiveCentralizedPlanningDecisionContextV1(
    centralizedDecisionContext,
  );
const validatedDecision = validateCollectivePlanningDecisionV1(decision);
const runtimeRunner = createCollectiveClosedLoopRuntimeRunnerV1(runtimeRunnerInput);
const meshRuntime = runCollectiveClosedLoopMeshRuntimeV1({
  ...runtimeInput,
  runner: runtimeRunner,
});
const protectedAction = runCollectiveClosedLoopActionV1(actionInput);
const authorizedAt: string = actionResult.authorizedAt;

const referenceRuntime: Promise<CollectiveClosedLoopReferenceRuntimeV1> =
  createCollectiveClosedLoopReferenceRuntimeV1(3);
const referenceScenario: Promise<CollectiveClosedLoopExecutionInputV1> =
  referenceRuntime.then((runtime) =>
    createCollectiveClosedLoopReferenceScenarioV1({
      runner: 'adaptive_collective',
      peerCount: 3,
      runtime,
    }),
  );
const adaptiveExecution: Promise<CollectiveClosedLoopExecutionResultV1> =
  referenceScenario.then(runAdaptiveCollectiveClosedLoopV1);
const centralizedExecution: Promise<CollectiveClosedLoopExecutionResultV1> =
  referenceScenario.then(runCentralizedPlannerClosedLoopV1);
const adaptiveReplay: Promise<CollectiveClosedLoopReplayResultV1> =
  referenceRuntime.then((runtime) =>
    replayAdaptiveCollectiveClosedLoopV1({
      schemaVersion: 1,
      createInput: () =>
        createCollectiveClosedLoopReferenceScenarioV1({
          runner: 'adaptive_collective',
          peerCount: 3,
          runtime,
        }),
    }),
  );
const centralizedReplay: Promise<CollectiveClosedLoopReplayResultV1> =
  referenceRuntime.then((runtime) =>
    replayCentralizedPlannerClosedLoopV1({
      schemaVersion: 1,
      createInput: () =>
        createCollectiveClosedLoopReferenceScenarioV1({
          runner: 'centralized_planner',
          peerCount: 3,
          runtime,
        }),
    }),
  );

void definitionDigest;
void validatedDefinition;
void validatedRun;
void validatedContext;
void validatedCentralizedContext;
void validatedDecision;
void meshRuntime;
void protectedAction;
void authorizedAt;
void adaptiveExecution;
void centralizedExecution;
void adaptiveReplay;
void centralizedReplay;
void (null as CollectiveClosedLoopActionPreparationContextV1 | null);
void (null as CollectiveClosedLoopActionResultV1 | null);
void (null as CollectiveClosedLoopCurrentMeshV1 | null);
void (null as CollectiveClosedLoopEffectMetadataV1 | null);
void (null as CollectiveClosedLoopEvaluatorV1 | null);
void (null as CollectiveClosedLoopFinalizationInputV1 | null);
void (null as CollectiveClosedLoopFinalizedResultV1 | null);
void (null as CollectiveClosedLoopPeerV1 | null);
void (null as CollectiveClosedLoopPreEffectHandleV1 | null);
void (null as CollectiveClosedLoopReplayInputV1 | null);
void (null as CollectiveClosedLoopRuntimePeerV1 | null);
void (null as CollectiveClosedLoopRuntimeRunnerV1 | null);
void (null as CollectiveClosedLoopStopReasonV1 | null);
void (null as CollectiveCentralizedPlanningDecisionContextV1 | null);
void (null as CollectivePlanningDecisionPolicyV1 | null);
void (null as CollectiveClosedLoopPreparedActionV1 | null);
void (null as CreateCollectiveClosedLoopReferenceScenarioInputV1 | null);
