import {
  InMemoryLocalStrategyAdaptationStoreV1,
  LocalStrategyAdaptationRuntimeV1,
  LocalStrategyDispatcherV1,
  createDeterministicLocalStrategyEntropyV1,
  createLocalStrategyAdaptationPolicyV1,
  createLocalStrategyCatalogV1,
  createLocalStrategyDefinitionV1,
  createLocalStrategyFeedbackBatchV1,
  createLocalStrategyFeedbackSignalV1,
  createLocalStrategySafetyResolutionPortV1,
  createLocalStrategySelectionRequestV1,
  type LocalStrategyAdaptationPortV1,
  type LocalStrategyFeedbackDecisionV1,
  type LocalStrategySelectionDecisionV1,
} from "@agentplat/collective-runtime/strategy-adaptation";

void InMemoryLocalStrategyAdaptationStoreV1;
void LocalStrategyAdaptationRuntimeV1;
void LocalStrategyDispatcherV1;
void createDeterministicLocalStrategyEntropyV1;
void createLocalStrategyAdaptationPolicyV1;
void createLocalStrategyCatalogV1;
void createLocalStrategyDefinitionV1;
void createLocalStrategyFeedbackBatchV1;
void createLocalStrategyFeedbackSignalV1;
void createLocalStrategySafetyResolutionPortV1;
void createLocalStrategySelectionRequestV1;

declare const port: LocalStrategyAdaptationPortV1;
declare const selection: LocalStrategySelectionDecisionV1;
declare const feedback: LocalStrategyFeedbackDecisionV1;

const selected: Promise<LocalStrategySelectionDecisionV1> = port.select(
  {} as Parameters<LocalStrategyAdaptationPortV1["select"]>[0],
);
const observed: Promise<LocalStrategyFeedbackDecisionV1> = port.observe(
  {} as Parameters<LocalStrategyAdaptationPortV1["observe"]>[0],
);

void selection;
void feedback;
void selected;
void observed;
