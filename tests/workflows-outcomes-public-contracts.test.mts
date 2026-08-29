import {
  InMemoryTaskOutcomeStoreV1,
  WorkflowOutcomeRuntimeV1,
  createTaskOutcomeV1,
  validateOutcomeCoveragePolicyV1,
  validateTaskOutcomeV1,
  type OutcomeCoveragePolicyV1,
  type OutcomeCoverageResultV1,
  type TaskOutcomeGroupByV1,
  type TaskOutcomeInputV1,
  type TaskOutcomeStoreV1,
  type TaskOutcomeSummaryGroupV1,
  type TaskOutcomeV1,
  type TaskOutcomeVerdictV1,
} from "@agentplat/workflows/outcomes";

void InMemoryTaskOutcomeStoreV1;
void WorkflowOutcomeRuntimeV1;
void createTaskOutcomeV1;
void validateOutcomeCoveragePolicyV1;
void validateTaskOutcomeV1;

type PublicTypes =
  | OutcomeCoveragePolicyV1
  | OutcomeCoverageResultV1
  | TaskOutcomeGroupByV1
  | TaskOutcomeInputV1
  | TaskOutcomeStoreV1
  | TaskOutcomeSummaryGroupV1
  | TaskOutcomeV1
  | TaskOutcomeVerdictV1;

declare const publicType: PublicTypes;
void publicType;
