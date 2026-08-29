import {
  DEFAULT_PROCESS_DEFINITION_LIMITS_V1,
  InMemoryProcessWorkerV1,
  InMemoryProcessRunnerV1,
  InMemoryWorkflowStoreV1,
  WORKFLOW_SCHEMA_VERSION_V1,
  WorkflowValidationErrorV1,
  canonicalizeWorkflowJsonV1,
  createInitialProcessRunV1,
  createProcessDefinitionV1,
  createProcessSignalV1,
  createProcessRunSnapshotV1,
  createTaskDefinitionV1,
  createTaskExecutionBindingV1,
  createTaskRunV1,
  digestWorkflowJsonV1,
  sumTaskUsageV1,
  heartbeatTaskRunV1,
  reconcileIndeterminateTaskRunV1,
  takeOverExpiredTaskRunV1,
  topologicalProcessStageIdsV1,
  upgradeLegacyProcessDefinitionV1,
  upgradeLegacyProcessRunV1,
  transitionTaskRunV1,
  validateProcessDefinitionV1,
  validateProcessRunV1,
  validateProcessSignalV1,
  validateTaskDefinitionV1,
  validateTaskExecutionBindingV1,
  validateTaskRunV1,
  validateTaskUsageV1,
  type AdvanceProcessInputV1,
  type AdvancingProcessRunnerV1,
  type CancelProcessInputV1,
  type DescribeProcessInputV1,
  type GateProviderPortV1,
  type LegacyProcessDefinitionInputV1,
  type LegacyProcessRunInputV1,
  type LegacyProcessStageInputV1,
  type LegacyProcessStageStateInputV1,
  type ProcessDefinitionInputV1,
  type ProcessDefinitionLimitsV1,
  type ProcessDefinitionV1,
  type ProcessGateRequestV1,
  type ProcessGateResultV1,
  type ProcessOperationResultV1,
  type ProcessRunnerV1,
  type ProcessRunStatusV1,
  type ProcessRunV1,
  type ProcessSignalInputV1,
  type ProcessSignalV1,
  type ProcessStageDependencyV1,
  type ProcessStageOutcomeV1,
  type ProcessStageStateV1,
  type ProcessStageStatusV1,
  type ProcessStageV1,
  type ProcessTaskExecutionRequestV1,
  type ProcessTaskExecutionResultV1,
  type ProcessWorkerRunInputV1,
  type ProcessWorkerRunResultV1,
  type ProcessWorkerV1,
  type SignalProcessInputV1,
  type StartProcessInputV1,
  type SubjectReferenceV1,
  type TaskDefinitionV1,
  type CreateTaskRunInputV1,
  type TaskExecutionBindingInputV1,
  type TaskExecutionBindingResolverV1,
  type TaskExecutionBindingV1,
  type TaskExecutorPortV1,
  type TaskRetryPolicyV1,
  type TaskRunStatusV1,
  type TaskRunV1,
  type TaskUsageAggregateV1,
  type TaskUsageCostV1,
  type TaskUsageV1,
  type TransitionTaskRunInputV1,
  type WorkflowDigestV1,
  type WorkflowOperationRecordV1,
  type WorkflowStoreV1,
} from "@agentplat/workflows";

void DEFAULT_PROCESS_DEFINITION_LIMITS_V1;
void InMemoryProcessWorkerV1;
void InMemoryProcessRunnerV1;
void InMemoryWorkflowStoreV1;
void WORKFLOW_SCHEMA_VERSION_V1;
void WorkflowValidationErrorV1;
void canonicalizeWorkflowJsonV1;
void createInitialProcessRunV1;
void createProcessDefinitionV1;
void createProcessSignalV1;
void createProcessRunSnapshotV1;
void createTaskDefinitionV1;
void createTaskExecutionBindingV1;
void createTaskRunV1;
void digestWorkflowJsonV1;
void sumTaskUsageV1;
void heartbeatTaskRunV1;
void reconcileIndeterminateTaskRunV1;
void takeOverExpiredTaskRunV1;
void topologicalProcessStageIdsV1;
void upgradeLegacyProcessDefinitionV1;
void upgradeLegacyProcessRunV1;
void transitionTaskRunV1;
void validateProcessDefinitionV1;
void validateProcessRunV1;
void validateProcessSignalV1;
void validateTaskDefinitionV1;
void validateTaskExecutionBindingV1;
void validateTaskRunV1;
void validateTaskUsageV1;

type PublicTypes =
  | AdvanceProcessInputV1
  | AdvancingProcessRunnerV1
  | CancelProcessInputV1
  | DescribeProcessInputV1
  | GateProviderPortV1
  | LegacyProcessDefinitionInputV1
  | LegacyProcessRunInputV1
  | LegacyProcessStageInputV1
  | LegacyProcessStageStateInputV1
  | ProcessDefinitionInputV1
  | ProcessDefinitionLimitsV1
  | ProcessDefinitionV1
  | ProcessGateRequestV1
  | ProcessGateResultV1
  | ProcessOperationResultV1
  | ProcessRunnerV1
  | ProcessRunStatusV1
  | ProcessRunV1
  | ProcessSignalInputV1
  | ProcessSignalV1
  | ProcessStageDependencyV1
  | ProcessStageOutcomeV1
  | ProcessStageStateV1
  | ProcessStageStatusV1
  | ProcessStageV1
  | ProcessTaskExecutionRequestV1
  | ProcessTaskExecutionResultV1
  | ProcessWorkerRunInputV1
  | ProcessWorkerRunResultV1
  | ProcessWorkerV1
  | SignalProcessInputV1
  | StartProcessInputV1
  | SubjectReferenceV1
  | TaskDefinitionV1
  | CreateTaskRunInputV1
  | TaskExecutionBindingInputV1
  | TaskExecutionBindingResolverV1
  | TaskExecutionBindingV1
  | TaskExecutorPortV1
  | TaskRetryPolicyV1
  | TaskRunStatusV1
  | TaskRunV1
  | TaskUsageAggregateV1
  | TaskUsageCostV1
  | TaskUsageV1
  | TransitionTaskRunInputV1
  | WorkflowDigestV1
  | WorkflowOperationRecordV1
  | WorkflowStoreV1;

declare const publicType: PublicTypes;
void publicType;
