import {
  WORKFLOW_CONFORMANCE_VERSION_V1,
  assertWorkflowConformancePassedV1,
  runWorkflowConformanceV1,
  validateWorkflowConformanceReportV1,
  type WorkflowConformanceCapabilityV1,
  type WorkflowConformanceCaseIdV1,
  type WorkflowConformanceCaseResultV1,
  type WorkflowConformanceControlV1,
  type WorkflowConformanceFactoryV1,
  type WorkflowConformanceOptionsV1,
  type WorkflowConformanceReportV1,
  type WorkflowConformanceRuntimeV1,
  type WorkflowConformanceScopeV1,
} from "@agentplat/workflows-conformance";

void WORKFLOW_CONFORMANCE_VERSION_V1;
void assertWorkflowConformancePassedV1;
void runWorkflowConformanceV1;
void validateWorkflowConformanceReportV1;

type PublicTypes =
  | WorkflowConformanceCapabilityV1
  | WorkflowConformanceCaseIdV1
  | WorkflowConformanceCaseResultV1
  | WorkflowConformanceControlV1
  | WorkflowConformanceFactoryV1
  | WorkflowConformanceOptionsV1
  | WorkflowConformanceReportV1
  | WorkflowConformanceRuntimeV1
  | WorkflowConformanceScopeV1;

declare const publicType: PublicTypes;
void publicType;
