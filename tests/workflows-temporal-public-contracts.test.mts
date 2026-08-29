import {
  TemporalProcessRunnerV1,
  TemporalWorkflowNotifierV1,
  TemporalWorkflowReconcilerV1,
  createTemporalWorkflowActivitiesV1,
  type TemporalProcessCycleInputV1,
  type TemporalProcessCycleResultV1,
  type TemporalWorkflowActivitiesV1,
  type TemporalWorkflowNotifierOptionsV1,
} from "@agentplat/workflows-temporal";
import {
  governedProcessWorkflowV1,
  notifyWorkflowProcessV1,
  type TemporalWorkflowProcessInputV1,
} from "@agentplat/workflows-temporal/workflow";

void TemporalProcessRunnerV1;
void TemporalWorkflowNotifierV1;
void TemporalWorkflowReconcilerV1;
void createTemporalWorkflowActivitiesV1;
void governedProcessWorkflowV1;
void notifyWorkflowProcessV1;

type PublicTypes =
  | TemporalProcessCycleInputV1
  | TemporalProcessCycleResultV1
  | TemporalWorkflowActivitiesV1
  | TemporalWorkflowNotifierOptionsV1
  | TemporalWorkflowProcessInputV1;

declare const publicType: PublicTypes;
void publicType;
