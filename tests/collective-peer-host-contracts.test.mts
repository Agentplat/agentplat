import {
  CollectivePeerHostRuntimeV1,
  type CollectivePeerHostOptionsV1,
  type CollectivePeerHostRoutePortV1,
} from "@agentplat/collective-runtime/host";
import type {
  JointWorkContractV1,
  TeamActivationRequestV1,
  TeamFormationDecisionV1,
  TeamFormationRequestV1,
} from "@agentplat/collective-runtime/team-formation";
import type {
  TeamExecutionPolicyRecordV1,
  TeamExecutionRecordV1,
  TeamExecutionStartRequestV1,
  TeamExecutionStateV1,
  TeamExecutionStepCommandV1,
} from "@agentplat/collective-runtime/team-execution";
import type {
  TeamExecutionContinuityCheckpointRequestV1,
  TeamExecutionContinuityCheckpointV1,
  TeamExecutionContinuityTakeoverRequestV1,
  TeamExecutionContinuityTakeoverResultV1,
} from "@agentplat/collective-runtime/team-execution-continuity";
import type {
  TeamStructureAdaptationDecisionV1,
  TeamStructureAdaptationRequestV1,
  TeamStructureAdaptationStateV1,
  TeamStructureFormationAdapterInputV1,
  TeamStructureMaterializationV1,
  TeamStructureObservationV1,
  TeamStructurePositionBindingV1,
} from "@agentplat/collective-runtime/team-structure-adaptation";

declare const route: CollectivePeerHostRoutePortV1;
declare const options: CollectivePeerHostOptionsV1;
declare const formationRequest: TeamFormationRequestV1;
declare const activationRequest: TeamActivationRequestV1;
declare const executionRequest: TeamExecutionStartRequestV1;
declare const command: TeamExecutionStepCommandV1;
declare const checkpointRequest: TeamExecutionContinuityCheckpointRequestV1;
declare const takeoverRequest: TeamExecutionContinuityTakeoverRequestV1;
declare const observation: TeamStructureObservationV1;
declare const selectionRequest: TeamStructureAdaptationRequestV1;
declare const bindings: readonly TeamStructurePositionBindingV1[];
declare const executionState: TeamExecutionStateV1;
declare const executionPolicy: TeamExecutionPolicyRecordV1;
declare const adaptationDecision: TeamStructureAdaptationDecisionV1;
declare const adaptationMaterialization: TeamStructureMaterializationV1;
declare const formationFromStructure: Omit<
  TeamStructureFormationAdapterInputV1,
  "catalog"
>;

const runtime = new CollectivePeerHostRuntimeV1({
  ...options,
  routes: [route],
});
const formation: Promise<TeamFormationDecisionV1> =
  runtime.form(formationRequest);
const activation: Promise<JointWorkContractV1> =
  runtime.activate(activationRequest);
const execution: Promise<TeamExecutionRecordV1> =
  runtime.execute(executionRequest);
const dispatch: Promise<TeamExecutionRecordV1> = runtime.dispatch({ command });
const checkpoint: Promise<TeamExecutionContinuityCheckpointV1> =
  runtime.checkpoint(checkpointRequest);
const takeover: Promise<TeamExecutionContinuityTakeoverResultV1> =
  runtime.recover(takeoverRequest);
const observed: Promise<TeamStructureAdaptationStateV1> =
  runtime.observe(observation);
const observedExecution: Promise<TeamStructureAdaptationStateV1> =
  runtime.observeExecution({
    observationId: "closed-loop-observation",
    executionState,
    executionPolicy,
    decision: adaptationDecision,
    materialization: adaptationMaterialization,
    observedAtLogicalMs: 10,
  });
const selected: Promise<TeamStructureAdaptationDecisionV1> =
  runtime.select(selectionRequest);
const materialized: TeamStructureMaterializationV1 = runtime.materialize({
  templateId: "approved",
  bindings,
});
const formedFromStructure: Promise<TeamFormationDecisionV1> =
  runtime.formFromStructure(formationFromStructure);
const worker: Promise<void> = runtime.start({
  signal: new AbortController().signal,
});

void [
  formation,
  activation,
  execution,
  dispatch,
  checkpoint,
  takeover,
  observed,
  observedExecution,
  selected,
  materialized,
  formedFromStructure,
  worker,
];
