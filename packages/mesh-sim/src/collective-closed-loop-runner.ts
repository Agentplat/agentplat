import {
  createPlanningReducerCommandV1,
  createPlanningReducerStateV1,
  deepFreezePlanning,
  digestPlanningJsonV1,
  reducePlanningCommandV1,
  type MissionObservationV1,
  type PlanningDigestV1,
  type PlanningJson,
  type PlanningReducerStateV1,
} from "@agentplat/collective-planning";
import {
  createCollectiveEnvironmentAdvanceRequestV1,
  createCollectiveEnvironmentInitializationV1,
  createCollectiveEnvironmentObservationRequestV1,
  type CollectiveEnvironmentPortV1,
  type CollectiveEvaluationBoundaryEvidenceV1,
  type CollectiveEvaluationRunnerV2,
  type CollectiveTraceV2,
} from "@agentplat/collective-planning/evaluation";
import type { WorkContractV1 } from "@agentplat/collective-control";
import {
  createCollectiveClosedLoopRunResultV1,
  validateCollectiveClosedLoopDefinitionV1,
  validateCollectiveCentralizedPlanningDecisionContextV1,
  validateCollectivePlanningDecisionContextV1,
  validateCollectivePlanningDecisionV1,
  type CollectiveClosedLoopDefinitionV1,
  type CollectiveClosedLoopRunResultV1,
  type CollectivePlanningDecisionPolicyV1,
  type CollectivePlanningDecisionV1,
} from "./collective-closed-loop-contracts.js";
import {
  COLLECTIVE_CLOSED_LOOP_RESILIENCE_LIMITS_V1,
  createCollectiveClosedLoopResilienceCampaignEvidenceV1,
  createCollectiveClosedLoopResilienceResultV1,
  validateCollectiveClosedLoopResilienceCampaignEvidenceForResultV1,
  validateCollectiveClosedLoopResilienceDefinitionV1,
  validateCollectiveClosedLoopResilienceResultForDefinitionV1,
  type CollectiveClosedLoopResilienceCampaignEvidenceV1,
  type CollectiveClosedLoopResilienceDefinitionV1,
  type CollectiveClosedLoopResilienceResultV1,
} from "./collective-closed-loop-resilience-contracts.js";
import {
  createCollectiveDeterministicEnvironmentHarnessV1,
  type CollectiveDeterministicEnvironmentHarnessConfigV1,
  type CollectiveDeterministicEnvironmentResultV1,
} from "./collective-environment.js";
import {
  runCollectiveClosedLoopActionV1,
  type CollectiveClosedLoopActionInputV1,
  type CollectiveClosedLoopActionResultV1,
  type CollectiveClosedLoopCurrentMeshV1,
} from "./collective-closed-loop-action.js";
import {
  runCollectiveClosedLoopMeshRuntimeV1,
  type CollectiveClosedLoopFinalizedResultV1,
  type CollectiveClosedLoopPreEffectHandleV1,
  type CollectiveClosedLoopRuntimeRunnerV1,
} from "./collective-closed-loop-runtime.js";
import {
  recoverCollectiveClosedLoopAssignmentV1,
  type CollectiveClosedLoopCertifiedRecoveryResultV1,
  type CollectiveClosedLoopRecoveredFinalizedResultV1,
} from "./collective-closed-loop-recovery.js";
import {
  runCollectiveClosedLoopFaultMatrixV1,
  type CollectiveClosedLoopFaultMatrixFaultV1,
  type CollectiveClosedLoopFaultMatrixInputV1,
  type CollectiveClosedLoopFaultMatrixRecordV1,
  type CollectiveClosedLoopFaultMatrixResultV1,
} from "./collective-closed-loop-fault-matrix.js";
import {
  bindCollectiveTraceJournalV2,
  collectiveTraceJournalForOwnerV2,
  createCollectiveTraceJournalV2,
  type CollectiveTraceJournalV2,
} from "./collective-trace-journal.js";
import { bindCollectiveFinalizerEnvironmentV1 } from "./collective-effect-provenance.js";

type RunnerOwnedActionKey =
  | "mandate"
  | "authorityState"
  | "workContract"
  | "mesh"
  | "environment"
  | "effect"
  | "logicalTimeMs"
  | "wallTime";

export type CollectiveClosedLoopPreparedActionV1 = Omit<
  CollectiveClosedLoopActionInputV1,
  RunnerOwnedActionKey
>;

export interface CollectiveClosedLoopActionPreparationContextV1 {
  readonly schemaVersion: 1;
  readonly winnerPeerId: string;
  readonly workContract: WorkContractV1;
  readonly roleBindingDigest: PlanningDigestV1;
  readonly logicalTimeMs: number;
}

export interface CollectiveClosedLoopEvaluatorV1 {
  readonly schemaVersion: 1;
  readonly environment: CollectiveEnvironmentPortV1;
  finalize(
    publicArtifacts?: readonly PlanningJson[],
  ): CollectiveDeterministicEnvironmentResultV1;
}

export interface CollectiveClosedLoopExecutionInputV1 {
  readonly schemaVersion: 1;
  readonly definition: CollectiveClosedLoopDefinitionV1;
  readonly evaluator: CollectiveClosedLoopEvaluatorV1;
  readonly runtime: CollectiveClosedLoopRuntimeRunnerV1;
  readonly decisionPolicy: CollectivePlanningDecisionPolicyV1;
  readonly actionClass: string;
  readonly resultDigest: PlanningDigestV1;
  readonly resultSummary: string;
  prepareAction(
    context: CollectiveClosedLoopActionPreparationContextV1,
  ):
    | CollectiveClosedLoopPreparedActionV1
    | Promise<CollectiveClosedLoopPreparedActionV1>;
}

export interface CollectiveClosedLoopExecutionResultV1 {
  readonly schemaVersion: 1;
  readonly run: CollectiveClosedLoopRunResultV1;
  readonly trace: CollectiveTraceV2;
  readonly evidence: CollectiveEvaluationBoundaryEvidenceV1;
  readonly observations: readonly MissionObservationV1[];
  readonly preEffect: CollectiveClosedLoopPreEffectHandleV1;
  readonly action: CollectiveClosedLoopActionResultV1;
  readonly finalized: CollectiveClosedLoopFinalizedResultV1;
}

export interface CollectiveClosedLoopReplayResultV1 {
  readonly schemaVersion: 1;
  readonly matched: boolean;
  readonly first: CollectiveClosedLoopExecutionResultV1;
  readonly replay: CollectiveClosedLoopExecutionResultV1;
}

export interface CollectiveClosedLoopReplayInputV1 {
  readonly schemaVersion: 1;
  readonly createInput:
    | (() => CollectiveClosedLoopExecutionInputV1)
    | (() => Promise<CollectiveClosedLoopExecutionInputV1>);
}

export interface CollectiveClosedLoopFaultMatrixMissionBindingV1 {
  readonly schemaVersion: 1;
  readonly planningStateRoot: PlanningDigestV1;
  readonly meshStateRoot: PlanningDigestV1;
  readonly workContractDigest: PlanningDigestV1;
  readonly checkpointDigest: PlanningDigestV1;
  readonly assignmentEpoch: number;
  readonly assignmentAuthorityId: string;
  readonly winnerPeerId: string;
  readonly replacementPeerId: string;
}

/**
 * Construction-bound fault driver. The executable input is retained in a
 * private WeakMap, so callers cannot substitute a precomputed matrix result.
 */
export interface CollectiveClosedLoopFaultMatrixPortV1 {
  readonly schemaVersion: 1;
  readonly bindingDigest: PlanningDigestV1;
}

interface CollectiveClosedLoopFaultMatrixEventDescriptorV1 {
  readonly eventId: string;
  readonly targetPeerId: string;
  readonly logicalTime: number;
}

interface CollectiveClosedLoopFaultMatrixSimulationFaultDescriptorV1 {
  readonly faultId: string;
  readonly kind: string;
  readonly logicalTime: number;
  readonly peerId: string | null;
  readonly links: readonly {
    readonly fromPeerId: string;
    readonly toPeerId: string;
  }[];
}

interface CollectiveClosedLoopFaultMatrixRegistrationV1 {
  readonly binding: CollectiveClosedLoopFaultMatrixMissionBindingV1;
  readonly execute: () => Promise<
    CollectiveClosedLoopFaultMatrixResultV1<unknown, unknown>
  >;
  readonly faults: readonly CollectiveClosedLoopFaultMatrixFaultV1[];
  readonly events: readonly CollectiveClosedLoopFaultMatrixEventDescriptorV1[];
  readonly simulationFaults: readonly CollectiveClosedLoopFaultMatrixSimulationFaultDescriptorV1[];
}

const collectiveClosedLoopFaultMatrixRegistrations = new WeakMap<
  object,
  CollectiveClosedLoopFaultMatrixRegistrationV1
>();

export function createCollectiveClosedLoopFaultMatrixMissionBindingV1(input: {
  readonly preEffect: CollectiveClosedLoopPreEffectHandleV1;
  readonly replacementPeerId: string;
}): CollectiveClosedLoopFaultMatrixMissionBindingV1 {
  if (
    !input ||
    typeof input !== "object" ||
    !input.preEffect ||
    input.preEffect.schemaVersion !== 1 ||
    typeof input.replacementPeerId !== "string" ||
    input.replacementPeerId.length === 0
  )
    throw new TypeError("closed_loop_fault_matrix_mission_binding_invalid");
  return deepFreezePlanning({
    schemaVersion: 1,
    planningStateRoot: digestPlanningStates(input.preEffect.planningStates),
    meshStateRoot: digestMeshStates(input.preEffect.meshStates),
    workContractDigest: input.preEffect.workContract.workContractDigest,
    checkpointDigest: digestValue(input.preEffect.checkpoint),
    assignmentEpoch: input.preEffect.execution.assignmentEpoch,
    assignmentAuthorityId: input.preEffect.execution.assignmentAuthorityId,
    winnerPeerId: input.preEffect.winnerPeerId,
    replacementPeerId: input.replacementPeerId,
  });
}

export function createCollectiveClosedLoopFaultMatrixPortV1<
  State,
  Action,
  Effect = unknown,
  Projection = State,
>(
  input: CollectiveClosedLoopFaultMatrixInputV1<
    State,
    Action,
    Effect,
    Projection
  >,
  binding: CollectiveClosedLoopFaultMatrixMissionBindingV1,
): CollectiveClosedLoopFaultMatrixPortV1 {
  const ownedBinding = validateFaultMatrixMissionBinding(binding);
  const ownedInput: CollectiveClosedLoopFaultMatrixInputV1<
    State,
    Action,
    Effect,
    Projection
  > = Object.freeze({
    schemaVersion: 1,
    scenario: structuredClone(input.scenario),
    runtime: Object.freeze({ ...input.runtime }),
    faults: structuredClone(input.faults),
    observations: Object.freeze(
      input.observations.map((observation) =>
        Object.freeze({
          faultId: observation.faultId,
          observe: observation.observe,
        }),
      ),
    ),
  });
  const port = Object.freeze({
    schemaVersion: 1 as const,
    bindingDigest: digestValue(ownedBinding),
  });
  const events = Object.freeze(
    ownedInput.scenario.events.map((event) =>
      Object.freeze({
        eventId: event.eventId,
        targetPeerId: event.targetPeerId,
        logicalTime: event.logicalTime,
      }),
    ),
  );
  const simulationFaults = Object.freeze(
    ownedInput.scenario.faultPlan.faults.map((fault) =>
      Object.freeze({
        faultId: fault.faultId,
        kind: fault.kind,
        logicalTime: fault.logicalTime,
        peerId: "peerId" in fault ? fault.peerId : null,
        links:
          "links" in fault
            ? Object.freeze(
                fault.links.map((link) =>
                  Object.freeze({
                    fromPeerId: link.fromPeerId,
                    toPeerId: link.toPeerId,
                  }),
                ),
              )
            : Object.freeze([]),
      }),
    ),
  );
  collectiveClosedLoopFaultMatrixRegistrations.set(port, {
    binding: ownedBinding,
    async execute() {
      return runCollectiveClosedLoopFaultMatrixV1(ownedInput);
    },
    faults: Object.freeze([...ownedInput.faults]),
    events,
    simulationFaults,
  });
  return port;
}

export async function runCollectiveClosedLoopFaultMatrixPortV1(
  port: CollectiveClosedLoopFaultMatrixPortV1,
): Promise<CollectiveClosedLoopFaultMatrixResultV1<unknown, unknown>> {
  const registration = collectiveClosedLoopFaultMatrixRegistrations.get(port);
  if (!registration)
    throw new TypeError("closed_loop_fault_matrix_port_not_registered");
  return registration.execute();
}

export interface CollectiveClosedLoopResilienceExecutionInputV1 {
  readonly schemaVersion: 1;
  readonly definition: CollectiveClosedLoopResilienceDefinitionV1;
  readonly evaluator: CollectiveClosedLoopEvaluatorV1;
  readonly runtime: CollectiveClosedLoopRuntimeRunnerV1;
  readonly decisionPolicy: CollectivePlanningDecisionPolicyV1;
  readonly faultMatrix: CollectiveClosedLoopFaultMatrixPortV1;
  readonly replacementPeerId: string;
  readonly actionClass: string;
  readonly resultDigest: PlanningDigestV1;
  readonly resultSummary: string;
  prepareAction(
    context: CollectiveClosedLoopActionPreparationContextV1,
  ):
    | CollectiveClosedLoopPreparedActionV1
    | Promise<CollectiveClosedLoopPreparedActionV1>;
}

export interface CollectiveClosedLoopResilienceExecutionResultV1 {
  readonly schemaVersion: 1;
  readonly resilience: CollectiveClosedLoopResilienceResultV1;
  readonly campaignEvidence: CollectiveClosedLoopResilienceCampaignEvidenceV1;
  readonly trace: CollectiveTraceV2;
  readonly evidence: CollectiveEvaluationBoundaryEvidenceV1;
  readonly observations: readonly MissionObservationV1[];
  readonly preEffect: CollectiveClosedLoopPreEffectHandleV1;
  readonly recovery: CollectiveClosedLoopCertifiedRecoveryResultV1;
  readonly action: CollectiveClosedLoopActionResultV1;
  readonly finalized: CollectiveClosedLoopRecoveredFinalizedResultV1;
  readonly faultMatrixBindingDigest: PlanningDigestV1;
  readonly faultMatrix: CollectiveClosedLoopFaultMatrixResultV1<
    unknown,
    unknown
  >;
}

export interface CollectiveClosedLoopResilienceReplayInputV1 {
  readonly schemaVersion: 1;
  readonly createInput:
    | (() => CollectiveClosedLoopResilienceExecutionInputV1)
    | (() => Promise<CollectiveClosedLoopResilienceExecutionInputV1>);
}

export interface CollectiveClosedLoopResilienceReplayResultV1 {
  readonly schemaVersion: 1;
  readonly matched: boolean;
  readonly first: CollectiveClosedLoopResilienceExecutionResultV1;
  readonly replay: CollectiveClosedLoopResilienceExecutionResultV1;
}

/**
 * Creates the evaluator-owned environment boundary. The returned runner-facing
 * object exposes only the environment port and terminal evidence finalization;
 * the hidden definition and monitor never enter a decision-policy context.
 */
export function createCollectiveClosedLoopEvaluatorV1(
  input: CollectiveDeterministicEnvironmentHarnessConfigV1,
): CollectiveClosedLoopEvaluatorV1 {
  const journal = createCollectiveTraceJournalV2(input.registration);
  const ownedConfig: CollectiveDeterministicEnvironmentHarnessConfigV1 = {
    schemaVersion: 1,
    registration: input.registration,
    monitorPolicy: input.monitorPolicy,
    definition: input.definition,
  };
  bindCollectiveTraceJournalV2(ownedConfig, journal);
  const harness =
    createCollectiveDeterministicEnvironmentHarnessV1(ownedConfig);
  bindCollectiveTraceJournalV2(harness.environment as object, journal);
  return Object.freeze({
    schemaVersion: 1 as const,
    environment: harness.environment,
    finalize(publicArtifacts?: readonly PlanningJson[]) {
      return harness.finalize(publicArtifacts);
    },
  });
}

export function runAdaptiveCollectiveClosedLoopV1(
  input: CollectiveClosedLoopExecutionInputV1,
): Promise<CollectiveClosedLoopExecutionResultV1> {
  return runClosedLoop(input, "adaptive_collective");
}

export function runCentralizedPlannerClosedLoopV1(
  input: CollectiveClosedLoopExecutionInputV1,
): Promise<CollectiveClosedLoopExecutionResultV1> {
  return runClosedLoop(input, "centralized_planner");
}

export async function replayAdaptiveCollectiveClosedLoopV1(
  input: CollectiveClosedLoopReplayInputV1,
): Promise<CollectiveClosedLoopReplayResultV1> {
  return replayClosedLoop(input, runAdaptiveCollectiveClosedLoopV1);
}

export async function replayCentralizedPlannerClosedLoopV1(
  input: CollectiveClosedLoopReplayInputV1,
): Promise<CollectiveClosedLoopReplayResultV1> {
  return replayClosedLoop(input, runCentralizedPlannerClosedLoopV1);
}

export function runAdaptiveCollectiveClosedLoopResilienceV1(
  input: CollectiveClosedLoopResilienceExecutionInputV1,
): Promise<CollectiveClosedLoopResilienceExecutionResultV1> {
  return runResilientClosedLoop(input, "adaptive_collective");
}

export function runCentralizedPlannerClosedLoopResilienceV1(
  input: CollectiveClosedLoopResilienceExecutionInputV1,
): Promise<CollectiveClosedLoopResilienceExecutionResultV1> {
  return runResilientClosedLoop(input, "centralized_planner");
}

export async function replayAdaptiveCollectiveClosedLoopResilienceV1(
  input: CollectiveClosedLoopResilienceReplayInputV1,
): Promise<CollectiveClosedLoopResilienceReplayResultV1> {
  return replayResilientClosedLoop(
    input,
    runAdaptiveCollectiveClosedLoopResilienceV1,
  );
}

export async function replayCentralizedPlannerClosedLoopResilienceV1(
  input: CollectiveClosedLoopResilienceReplayInputV1,
): Promise<CollectiveClosedLoopResilienceReplayResultV1> {
  return replayResilientClosedLoop(
    input,
    runCentralizedPlannerClosedLoopResilienceV1,
  );
}

async function replayResilientClosedLoop(
  input: CollectiveClosedLoopResilienceReplayInputV1,
  execute: (
    value: CollectiveClosedLoopResilienceExecutionInputV1,
  ) => Promise<CollectiveClosedLoopResilienceExecutionResultV1>,
): Promise<CollectiveClosedLoopResilienceReplayResultV1> {
  assertExactRecord(
    input,
    ["schemaVersion", "createInput"],
    "closed-loop resilience replay input",
  );
  if (input.schemaVersion !== 1 || typeof input.createInput !== "function")
    throw new TypeError("closed_loop_resilience_replay_input_invalid");
  const first = await execute(await input.createInput());
  const replay = await execute(await input.createInput());
  const matched =
    first.resilience.resilienceResultDigest ===
      replay.resilience.resilienceResultDigest &&
    first.campaignEvidence.campaignEvidenceDigest ===
      replay.campaignEvidence.campaignEvidenceDigest &&
    first.trace.traceDigest === replay.trace.traceDigest &&
    first.evidence.evidenceDigest === replay.evidence.evidenceDigest &&
    first.faultMatrixBindingDigest === replay.faultMatrixBindingDigest &&
    first.faultMatrix.matrixDigest === replay.faultMatrix.matrixDigest;
  if (!matched) throw new Error("closed_loop_resilience_replay_diverged");
  return Object.freeze({ schemaVersion: 1, matched, first, replay });
}

async function replayClosedLoop(
  input: CollectiveClosedLoopReplayInputV1,
  execute: (
    value: CollectiveClosedLoopExecutionInputV1,
  ) => Promise<CollectiveClosedLoopExecutionResultV1>,
): Promise<CollectiveClosedLoopReplayResultV1> {
  if (input.schemaVersion !== 1 || typeof input.createInput !== "function")
    throw new TypeError("closed_loop_replay_input_invalid");
  const first = await execute(await input.createInput());
  const replay = await execute(await input.createInput());
  const matched =
    first.run.runDigest === replay.run.runDigest &&
    first.trace.traceDigest === replay.trace.traceDigest &&
    first.evidence.evidenceDigest === replay.evidence.evidenceDigest;
  if (!matched) throw new Error("closed_loop_replay_diverged");
  return Object.freeze({ schemaVersion: 1, matched, first, replay });
}

async function runResilientClosedLoop(
  rawInput: CollectiveClosedLoopResilienceExecutionInputV1,
  runner: CollectiveEvaluationRunnerV2,
): Promise<CollectiveClosedLoopResilienceExecutionResultV1> {
  const input = validateResilienceExecutionInput(rawInput, runner);
  const definition = validateCollectiveClosedLoopResilienceDefinitionV1(
    input.definition,
  );
  const nominalDefinition = definition.nominalDefinition;
  const registration = nominalDefinition.registration;
  const journal = journalFor(input.evaluator.environment);

  const initialization = input.evaluator.environment.initialize(
    createCollectiveEnvironmentInitializationV1({
      schemaVersion: 1,
      initializationId: `closed-loop-resilience:${runner}:initialize`,
      registration,
      initializedAtLogicalMs: 0,
    }),
  );
  if (
    initialization.status !== "initialized" &&
    initialization.status !== "idempotent"
  )
    throw new Error(`closed_loop_environment_${initialization.reasonCode}`);

  // Policies receive the nominal definition only. Fault schedules remain on
  // the construction side of the runner and cannot become hidden look-ahead.
  const nominalInput: CollectiveClosedLoopExecutionInputV1 = {
    schemaVersion: 1,
    definition: nominalDefinition,
    evaluator: input.evaluator,
    runtime: input.runtime,
    decisionPolicy: input.decisionPolicy,
    actionClass: input.actionClass,
    resultDigest: input.resultDigest,
    resultSummary: input.resultSummary,
    prepareAction: input.prepareAction,
  };
  const initialObservationBatch = collectObservations(nominalInput, 0);
  const observations = initialObservationBatch.observations;
  const owner = nominalDefinition.peers[0];
  let planningProposal;
  if (runner === "centralized_planner") {
    appendCentralizedDirectives(journal, observations, 0);
    planningProposal = await collectCentralizedDecision(
      nominalInput,
      observations,
      journal,
      owner.peerId,
      owner.peerInstanceId,
      0,
    );
  } else {
    const decisions = await collectDecisions(
      nominalInput,
      observations,
      journal,
      0,
    );
    const ownerDecision = decisions.get(owner.peerId);
    if (!ownerDecision || ownerDecision.kind !== "proposal")
      throw new Error("closed_loop_owner_proposal_required");
    planningProposal = ownerDecision.proposal;
  }

  const instrumentedRuntime: CollectiveClosedLoopRuntimeRunnerV1 =
    Object.freeze({
      signer: input.runtime.signer,
      resolver: input.runtime.resolver,
      cryptoPolicy: input.runtime.cryptoPolicy,
      crypto: input.runtime.crypto,
      privateKeys: input.runtime.privateKeys,
      mandateVerification: input.runtime.mandateVerification,
    });
  bindCollectiveTraceJournalV2(instrumentedRuntime, journal);
  const preEffect = await runCollectiveClosedLoopMeshRuntimeV1({
    schemaVersion: 1,
    missionIntent: nominalDefinition.missionIntent,
    selectionPolicy: nominalDefinition.selectionPolicy,
    mandate: nominalDefinition.mandate,
    peers: nominalDefinition.peers,
    observations,
    planningProposal,
    planningMode: runner,
    runner: instrumentedRuntime,
    seed: registration.seed,
    maximumLogicalTimeMs: Math.min(
      nominalDefinition.maximumLogicalTimeMs,
      registration.limits.maximumInteractions,
    ),
  });
  bindCollectiveFinalizerEnvironmentV1(preEffect, input.evaluator.environment);
  appendRuntimeEvidence(journal, preEffect);

  const checkpointAdvanced = input.evaluator.environment.advance(
    createCollectiveEnvironmentAdvanceRequestV1({
      schemaVersion: 1,
      advanceId: `closed-loop-resilience:${runner}:checkpoint-time`,
      registrationDigest: registration.bindingDigest,
      targetLogicalTimeMs: preEffect.logicalTimeMs,
    }),
  );
  if (
    checkpointAdvanced.status !== "advanced" &&
    checkpointAdvanced.status !== "idempotent"
  )
    throw new Error(`closed_loop_environment_${checkpointAdvanced.reasonCode}`);
  const checkpointObservationBatch = collectObservations(
    nominalInput,
    preEffect.logicalTimeMs,
    initialObservationBatch.cursors,
    "checkpoint",
  );

  const faultBeforePreEffect = definition.faultPlan.faults.find(
    (fault) => fault.trigger.logicalTimeMs < preEffect.logicalTimeMs,
  );
  if (faultBeforePreEffect)
    throw new Error(
      `closed_loop_fault_trigger_before_pre_effect:${faultBeforePreEffect.faultId}`,
    );

  const faultMatrixRegistration = bindFaultMatrixPortToPreEffect(
    input.faultMatrix,
    preEffect,
    input.replacementPeerId,
  );
  const faultMatrix = await faultMatrixRegistration.execute();
  const faultRecords = bindFaultMatrixToPlan(
    definition,
    faultMatrix,
    faultMatrixRegistration,
  );
  let faultLogicalTimeMs = preEffect.logicalTimeMs;
  const faultObservations = definition.faultPlan.faults.map((fault) => {
    const record = faultRecords.get(fault.faultId)!;
    assertFaultCausalTrigger(journal, fault);
    faultLogicalTimeMs = Math.max(
      faultLogicalTimeMs,
      fault.trigger.logicalTimeMs,
    );
    const scheduled = appendFaultEvidence(
      journal,
      faultLogicalTimeMs,
      fault,
      record,
      "fault.scheduled",
      "accepted",
      record.scheduledEventDigest,
    );
    const injected = appendFaultEvidence(
      journal,
      faultLogicalTimeMs,
      fault,
      record,
      "fault.injected",
      "accepted",
      record.injectedEventDigest,
    );
    const observed = appendFaultEvidence(
      journal,
      faultLogicalTimeMs,
      fault,
      record,
      "fault.observed",
      "observed",
      record.observedEventDigest,
    );
    return {
      schemaVersion: 1 as const,
      faultId: fault.faultId,
      scheduledEventDigest: scheduled.eventDigest,
      injectedEventDigest: injected.eventDigest,
      observedEventDigest: observed.eventDigest,
    };
  });

  const recoveryCrashFault = definition.faultPlan.faults.find(
    (fault) =>
      fault.family === "peer.crash" &&
      fault.targets.length === 1 &&
      fault.targets[0]?.peerId === preEffect.winnerPeerId,
  );
  const recoveryRestartFault = definition.faultPlan.faults.find(
    (fault) =>
      fault.family === "peer.restart" &&
      fault.targets.length === 1 &&
      fault.targets[0]?.peerId === preEffect.winnerPeerId &&
      recoveryCrashFault !== undefined &&
      fault.causalPredecessorFaultIds.includes(recoveryCrashFault.faultId),
  );
  if (!recoveryCrashFault || !recoveryRestartFault)
    throw new Error("closed_loop_recovery_fault_cause_missing");

  const recovery = await recoverCollectiveClosedLoopAssignmentV1({
    schemaVersion: 1,
    preEffect,
    peers: nominalDefinition.peers,
    runner: instrumentedRuntime,
    missionIntent: nominalDefinition.missionIntent,
    mandate: nominalDefinition.mandate,
    failedWinnerPeerId: preEffect.winnerPeerId,
    replacementPeerId: input.replacementPeerId,
    faultLogicalTimeMs: Math.max(
      faultLogicalTimeMs + 1,
      preEffect.logicalTimeMs + 1,
    ),
  });
  appendRecoveryEvidence(
    journal,
    preEffect,
    recovery,
    faultMatrix.matrixDigest,
  );
  const staleFault = recoveryRestartFault;
  const staleResultRejection = recovery.staleRejections.find(
    (item) => item.recordType === "work.result",
  );
  if (!staleResultRejection)
    throw new Error("closed_loop_stale_result_evidence_missing");
  const staleFenceDigest = digestValue({
    assignmentEpoch: preEffect.execution.assignmentEpoch,
    assignmentAuthorityId: preEffect.execution.assignmentAuthorityId,
    fencingToken: preEffect.execution.fencingToken,
  });
  const currentFenceDigest = digestValue({
    assignmentEpoch: recovery.execution.assignmentEpoch,
    assignmentAuthorityId: recovery.execution.assignmentAuthorityId,
    fencingToken: recovery.execution.fencingToken,
  });
  const staleRejectionEvent = appendStaleResultRejectionEvidence(
    journal,
    preEffect,
    recovery,
    staleFault,
    staleResultRejection,
    staleFenceDigest,
    currentFenceDigest,
  );

  const actionLogicalTimeMs = recovery.recoveryLogicalTimeMs + 1;
  if (actionLogicalTimeMs > nominalDefinition.maximumLogicalTimeMs)
    throw new RangeError("closed_loop_logical_time_exceeded");
  const advanced = input.evaluator.environment.advance(
    createCollectiveEnvironmentAdvanceRequestV1({
      schemaVersion: 1,
      advanceId: `closed-loop-resilience:${runner}:action-time`,
      registrationDigest: registration.bindingDigest,
      targetLogicalTimeMs: actionLogicalTimeMs,
    }),
  );
  if (advanced.status !== "advanced" && advanced.status !== "idempotent")
    throw new Error(`closed_loop_environment_${advanced.reasonCode}`);

  const recoveredRoleBindingDigest = digestValue({
    schemaVersion: 1,
    kind: "closed-loop-recovered-role-binding",
    priorRoleBindingDigest: preEffect.roleBinding.roleBindingDigest,
    workContractDigest: recovery.workContract.workContractDigest,
  });
  const prepared = await input.prepareAction(
    deepFreezePlanning({
      schemaVersion: 1,
      winnerPeerId: recovery.replacementPeerId,
      workContract: recovery.workContract,
      roleBindingDigest: recoveredRoleBindingDigest,
      logicalTimeMs: actionLogicalTimeMs,
    }),
  );
  assertExactRecord(
    prepared,
    [
      "actionBinding",
      "actionInput",
      "trustState",
      "trustRequest",
      "inferenceState",
      "assessmentRequest",
      "assessment",
      "actionGrant",
      "gatewayId",
      "reservationId",
      "permitId",
      "decisionId",
    ],
    "closed-loop prepared action",
  );
  const authorizedAt = actionWallTime(
    nominalDefinition.missionIntent.validFrom,
    nominalDefinition.missionIntent.validUntil,
    recovery.checkpoint.envelope.sentAt,
    actionLogicalTimeMs,
  );
  if (
    Date.parse(authorizedAt) < Date.parse(recovery.leaseStartsAt) ||
    Date.parse(authorizedAt) >= Date.parse(recovery.execution.leaseExpiresAt)
  )
    throw new Error("closed_loop_recovery_lease_expired_before_action");
  const action = await runCollectiveClosedLoopActionV1({
    ...prepared,
    mandate: nominalDefinition.mandate,
    authorityState: preEffect.authorityState,
    workContract: recovery.workContract,
    mesh: currentMeshForWorkContract(recovery.workContract),
    environment: input.evaluator.environment,
    effect: {
      registrationDigest: registration.bindingDigest,
      missionIntentId: nominalDefinition.missionIntent.missionIntentId,
      intentRevision: nominalDefinition.missionIntent.revision,
      intentDigest: nominalDefinition.missionIntent.intentDigest,
      actionClass: input.actionClass,
    },
    logicalTimeMs: actionLogicalTimeMs,
    wallTime: authorizedAt,
  });
  if (
    !action.effectAttempt ||
    !action.receipt ||
    action.receipt.status !== "committed"
  )
    throw new Error("closed_loop_effect_not_committed");
  const outcomeObservationBatch = collectObservations(
    nominalInput,
    actionLogicalTimeMs,
    checkpointObservationBatch.cursors,
    "outcome",
  );
  const allObservations = Object.freeze([
    ...observations,
    ...checkpointObservationBatch.observations,
    ...outcomeObservationBatch.observations,
  ]);
  const finalized = await recovery.finalizeAfterCommittedEffect({
    effectAttempt: action.effectAttempt,
    effectReceipt: action.receipt,
    resultDigest: input.resultDigest,
    resultSummary: input.resultSummary,
  });
  appendRecoveredFinalizationEvidence(journal, finalized);

  const publicArtifacts = publicArtifactsForRecovery(
    preEffect,
    recovery,
    action,
    finalized,
    input.faultMatrix.bindingDigest,
    faultMatrix,
    checkpointObservationBatch.observations,
    outcomeObservationBatch.observations,
  );
  const planningStateRoots = sortedRoots(
    Object.values(preEffect.planningStates).map(
      (state) => state.planView.stateDigest,
    ),
  );
  const run = createCollectiveClosedLoopRunResultV1({
    schemaVersion: 1,
    registrationBindingDigest: registration.bindingDigest,
    runner,
    stopReason: "plan_completed",
    finalLogicalTimeMs: finalized.logicalTimeMs,
    planningStateRoots,
    meshStateRoots: sortedRoots(
      Object.values(finalized.meshStates).map((state) => digestValue(state)),
    ),
    governanceStateRoots: sortedRoots([
      digestValue(preEffect.authorityState),
      recovery.workContract.workContractDigest,
      action.actionPermit.permitDigest,
      action.executionStateDigest as PlanningDigestV1,
    ]),
    publicArtifacts,
  });
  const epochs = [
    {
      schemaVersion: 1 as const,
      epoch: 1,
      startedAtLogicalMs: 0,
      endedAtLogicalMs: recovery.recoveryLogicalTimeMs,
      planningStateRoot: digestValue(planningStateRoots),
      meshStateRoot: digestMeshStates(preEffect.meshStates),
      governanceStateRoot: digestValue({
        authorityState: preEffect.authorityState,
        workContractDigest: preEffect.workContract.workContractDigest,
      }),
    },
    {
      schemaVersion: 1 as const,
      epoch: 2,
      startedAtLogicalMs: recovery.recoveryLogicalTimeMs,
      endedAtLogicalMs: finalized.logicalTimeMs,
      planningStateRoot: digestValue(planningStateRoots),
      meshStateRoot: digestMeshStates(finalized.meshStates),
      governanceStateRoot: digestValue({
        authorityState: preEffect.authorityState,
        workContractDigest: recovery.workContract.workContractDigest,
        permitDigest: action.actionPermit.permitDigest,
      }),
    },
  ];
  const resilience =
    validateCollectiveClosedLoopResilienceResultForDefinitionV1(
      createCollectiveClosedLoopResilienceResultV1({
        schemaVersion: 1,
        resilienceDefinitionDigest: definition.resilienceDefinitionDigest,
        run,
        epochs,
        faultObservations,
        staleResultRejections: [
          {
            schemaVersion: 1,
            rejectionId: "stale-result-rejection:0001",
            faultId: staleFault.faultId,
            rejectedAtLogicalMs: staleResultRejection.logicalTimeMs,
            staleFenceDigest,
            currentFenceDigest,
            rejectionEventDigest: staleRejectionEvent.eventDigest,
          },
        ],
      }),
      definition,
    );
  const plannedFaultIds = definition.faultPlan.faults.map(
    (fault) => fault.faultId,
  );
  const campaignEvidence =
    validateCollectiveClosedLoopResilienceCampaignEvidenceForResultV1(
      createCollectiveClosedLoopResilienceCampaignEvidenceV1({
        schemaVersion: 1,
        resilienceDefinitionDigest: definition.resilienceDefinitionDigest,
        resilienceResultDigest: resilience.resilienceResultDigest,
        runner,
        seed: registration.seed,
        limits: {
          schemaVersion: 1,
          maximumFaults:
            COLLECTIVE_CLOSED_LOOP_RESILIENCE_LIMITS_V1.maximumFaults,
          maximumEpochs: definition.maximumEpochs,
          maximumInteractions: registration.limits.maximumInteractions,
        },
        scheduledFaultIds: plannedFaultIds,
        injectedFaultIds: plannedFaultIds,
        observedFaultIds: plannedFaultIds,
        staleResultRejectionIds: resilience.staleResultRejections.map(
          (rejection) => rejection.rejectionId,
        ),
      }),
      definition,
      resilience,
    );
  const evaluation = input.evaluator.finalize(publicArtifacts);
  assertResilienceTerminalEvidence(evaluation, run, finalized, faultMatrix);
  return Object.freeze({
    schemaVersion: 1,
    resilience,
    campaignEvidence,
    trace: evaluation.trace,
    evidence: evaluation.evidence,
    observations: allObservations,
    preEffect,
    recovery,
    action,
    finalized,
    faultMatrixBindingDigest: input.faultMatrix.bindingDigest,
    faultMatrix,
  });
}

async function runClosedLoop(
  rawInput: CollectiveClosedLoopExecutionInputV1,
  runner: CollectiveEvaluationRunnerV2,
): Promise<CollectiveClosedLoopExecutionResultV1> {
  const input = validateExecutionInput(rawInput, runner);
  const definition = validateCollectiveClosedLoopDefinitionV1(input.definition);
  const registration = definition.registration;
  const journal = journalFor(input.evaluator.environment);
  const initialization = input.evaluator.environment.initialize(
    createCollectiveEnvironmentInitializationV1({
      schemaVersion: 1,
      initializationId: `closed-loop:${runner}:initialize`,
      registration,
      initializedAtLogicalMs: 0,
    }),
  );
  if (
    initialization.status !== "initialized" &&
    initialization.status !== "idempotent"
  )
    throw new Error(`closed_loop_environment_${initialization.reasonCode}`);

  const initialObservationBatch = collectObservations(input, 0);
  const observations = initialObservationBatch.observations;
  const owner = definition.peers[0];
  let planningProposal;
  if (runner === "centralized_planner") {
    appendCentralizedDirectives(journal, observations, 0);
    planningProposal = await collectCentralizedDecision(
      input,
      observations,
      journal,
      owner.peerId,
      owner.peerInstanceId,
      0,
    );
  } else {
    const decisions = await collectDecisions(input, observations, journal, 0);
    const ownerDecision = decisions.get(owner.peerId);
    if (!ownerDecision || ownerDecision.kind !== "proposal")
      throw new Error("closed_loop_owner_proposal_required");
    planningProposal = ownerDecision.proposal;
  }

  const instrumentedRuntime: CollectiveClosedLoopRuntimeRunnerV1 =
    Object.freeze({
      signer: input.runtime.signer,
      resolver: input.runtime.resolver,
      cryptoPolicy: input.runtime.cryptoPolicy,
      crypto: input.runtime.crypto,
      privateKeys: input.runtime.privateKeys,
      mandateVerification: input.runtime.mandateVerification,
    });
  bindCollectiveTraceJournalV2(instrumentedRuntime, journal);
  const preEffect = await runCollectiveClosedLoopMeshRuntimeV1({
    schemaVersion: 1,
    missionIntent: definition.missionIntent,
    selectionPolicy: definition.selectionPolicy,
    mandate: definition.mandate,
    peers: definition.peers,
    observations,
    planningProposal,
    planningMode: runner,
    runner: instrumentedRuntime,
    seed: registration.seed,
    maximumLogicalTimeMs: Math.min(
      definition.maximumLogicalTimeMs,
      registration.limits.maximumInteractions,
    ),
  });
  bindCollectiveFinalizerEnvironmentV1(preEffect, input.evaluator.environment);
  appendRuntimeEvidence(journal, preEffect);

  const checkpointAdvanced = input.evaluator.environment.advance(
    createCollectiveEnvironmentAdvanceRequestV1({
      schemaVersion: 1,
      advanceId: `closed-loop:${runner}:checkpoint-time`,
      registrationDigest: registration.bindingDigest,
      targetLogicalTimeMs: preEffect.logicalTimeMs,
    }),
  );
  if (
    checkpointAdvanced.status !== "advanced" &&
    checkpointAdvanced.status !== "idempotent"
  )
    throw new Error(`closed_loop_environment_${checkpointAdvanced.reasonCode}`);
  const checkpointObservationBatch = collectObservations(
    input,
    preEffect.logicalTimeMs,
    initialObservationBatch.cursors,
    "checkpoint",
  );

  const actionLogicalTimeMs = preEffect.logicalTimeMs + 1;
  if (actionLogicalTimeMs > definition.maximumLogicalTimeMs)
    throw new RangeError("closed_loop_logical_time_exceeded");
  const advanced = input.evaluator.environment.advance(
    createCollectiveEnvironmentAdvanceRequestV1({
      schemaVersion: 1,
      advanceId: `closed-loop:${runner}:action-time`,
      registrationDigest: registration.bindingDigest,
      targetLogicalTimeMs: actionLogicalTimeMs,
    }),
  );
  if (advanced.status !== "advanced" && advanced.status !== "idempotent")
    throw new Error(`closed_loop_environment_${advanced.reasonCode}`);

  const prepared = await input.prepareAction(
    deepFreezePlanning({
      schemaVersion: 1,
      winnerPeerId: preEffect.winnerPeerId,
      workContract: preEffect.workContract,
      roleBindingDigest: preEffect.roleBinding.roleBindingDigest,
      logicalTimeMs: actionLogicalTimeMs,
    }),
  );
  assertExactRecord(
    prepared,
    [
      "actionBinding",
      "actionInput",
      "trustState",
      "trustRequest",
      "inferenceState",
      "assessmentRequest",
      "assessment",
      "actionGrant",
      "gatewayId",
      "reservationId",
      "permitId",
      "decisionId",
    ],
    "closed-loop prepared action",
  );
  const action = await runCollectiveClosedLoopActionV1({
    ...prepared,
    mandate: definition.mandate,
    authorityState: preEffect.authorityState,
    workContract: preEffect.workContract,
    mesh: currentMesh(preEffect),
    environment: input.evaluator.environment,
    effect: {
      registrationDigest: registration.bindingDigest,
      missionIntentId: definition.missionIntent.missionIntentId,
      intentRevision: definition.missionIntent.revision,
      intentDigest: definition.missionIntent.intentDigest,
      actionClass: input.actionClass,
    },
    logicalTimeMs: actionLogicalTimeMs,
    wallTime: actionWallTime(
      definition.missionIntent.validFrom,
      definition.missionIntent.validUntil,
      preEffect.checkpoint.envelope.sentAt,
      actionLogicalTimeMs,
    ),
  });
  if (
    !action.effectAttempt ||
    !action.receipt ||
    action.receipt.status !== "committed"
  )
    throw new Error("closed_loop_effect_not_committed");
  const outcomeObservationBatch = collectObservations(
    input,
    actionLogicalTimeMs,
    checkpointObservationBatch.cursors,
    "outcome",
  );
  const allObservations = Object.freeze([
    ...observations,
    ...checkpointObservationBatch.observations,
    ...outcomeObservationBatch.observations,
  ]);

  const finalized = await preEffect.finalizeAfterCommittedEffect({
    effectAttempt: action.effectAttempt,
    effectReceipt: action.receipt,
    resultDigest: input.resultDigest,
    resultSummary: input.resultSummary,
  });
  appendFinalizationEvidence(journal, finalized);

  const publicArtifacts = publicArtifactsFor(
    preEffect,
    action,
    finalized,
    checkpointObservationBatch.observations,
    outcomeObservationBatch.observations,
  );
  const run = createCollectiveClosedLoopRunResultV1({
    schemaVersion: 1,
    registrationBindingDigest: registration.bindingDigest,
    runner,
    stopReason: "plan_completed",
    finalLogicalTimeMs: finalized.logicalTimeMs,
    planningStateRoots: sortedRoots(
      Object.values(finalized.planningStates).map(
        (state) => state.planView.stateDigest,
      ),
    ),
    meshStateRoots: sortedRoots(
      Object.values(finalized.meshStates).map((state) => digestValue(state)),
    ),
    governanceStateRoots: sortedRoots([
      digestValue(preEffect.authorityState),
      preEffect.workContract.workContractDigest,
      action.actionPermit.permitDigest,
      action.executionStateDigest as PlanningDigestV1,
    ]),
    publicArtifacts,
  });
  const evaluation = input.evaluator.finalize(publicArtifacts);
  assertTerminalEvidence(evaluation, run, finalized);
  return Object.freeze({
    schemaVersion: 1,
    run,
    trace: evaluation.trace,
    evidence: evaluation.evidence,
    observations: allObservations,
    preEffect,
    action,
    finalized,
  });
}

function validateExecutionInput(
  input: CollectiveClosedLoopExecutionInputV1,
  runner: CollectiveEvaluationRunnerV2,
): CollectiveClosedLoopExecutionInputV1 {
  assertExactRecord(
    input,
    [
      "schemaVersion",
      "definition",
      "evaluator",
      "runtime",
      "decisionPolicy",
      "actionClass",
      "resultDigest",
      "resultSummary",
      "prepareAction",
    ],
    "closed-loop execution input",
  );
  if (
    input.schemaVersion !== 1 ||
    input.evaluator?.schemaVersion !== 1 ||
    typeof input.evaluator.environment?.initialize !== "function" ||
    typeof input.evaluator.environment?.observe !== "function" ||
    typeof input.evaluator.environment?.applyEffect !== "function" ||
    typeof input.evaluator.environment?.advance !== "function" ||
    typeof input.evaluator.finalize !== "function" ||
    typeof input.decisionPolicy?.decide !== "function" ||
    typeof input.decisionPolicy?.decideCentralized !== "function" ||
    typeof input.prepareAction !== "function" ||
    !/^sha256:[0-9a-f]{64}$/u.test(input.resultDigest) ||
    input.actionClass.length === 0 ||
    input.resultSummary.length === 0
  )
    throw new TypeError("closed_loop_execution_input_invalid");
  const definition = validateCollectiveClosedLoopDefinitionV1(input.definition);
  if (
    definition.registration.runner !== runner ||
    definition.registration.stratum !== "nominal" ||
    input.decisionPolicy.policyDigest !==
      definition.registration.observationPolicyDigest ||
    !Number.isSafeInteger(input.decisionPolicy.policyVersion) ||
    input.decisionPolicy.policyVersion < 1 ||
    input.decisionPolicy.policyId.length === 0
  )
    throw new TypeError("closed_loop_runner_binding_invalid");
  return input;
}

function validateResilienceExecutionInput(
  input: CollectiveClosedLoopResilienceExecutionInputV1,
  runner: CollectiveEvaluationRunnerV2,
): CollectiveClosedLoopResilienceExecutionInputV1 {
  assertExactRecord(
    input,
    [
      "schemaVersion",
      "definition",
      "evaluator",
      "runtime",
      "decisionPolicy",
      "faultMatrix",
      "replacementPeerId",
      "actionClass",
      "resultDigest",
      "resultSummary",
      "prepareAction",
    ],
    "closed-loop resilience execution input",
  );
  if (
    input.schemaVersion !== 1 ||
    input.evaluator?.schemaVersion !== 1 ||
    typeof input.evaluator.environment?.initialize !== "function" ||
    typeof input.evaluator.environment?.observe !== "function" ||
    typeof input.evaluator.environment?.applyEffect !== "function" ||
    typeof input.evaluator.environment?.advance !== "function" ||
    typeof input.evaluator.finalize !== "function" ||
    input.faultMatrix?.schemaVersion !== 1 ||
    !/^sha256:[0-9a-f]{64}$/u.test(input.faultMatrix.bindingDigest) ||
    !collectiveClosedLoopFaultMatrixRegistrations.has(input.faultMatrix) ||
    typeof input.decisionPolicy?.decide !== "function" ||
    typeof input.decisionPolicy?.decideCentralized !== "function" ||
    typeof input.prepareAction !== "function" ||
    typeof input.replacementPeerId !== "string" ||
    input.replacementPeerId.length === 0 ||
    !/^sha256:[0-9a-f]{64}$/u.test(input.resultDigest) ||
    input.actionClass.length === 0 ||
    input.resultSummary.length === 0
  )
    throw new TypeError("closed_loop_resilience_execution_input_invalid");
  const definition = validateCollectiveClosedLoopResilienceDefinitionV1(
    input.definition,
  );
  if (
    definition.nominalDefinition.registration.runner !== runner ||
    definition.nominalDefinition.registration.stratum !== "nominal" ||
    input.decisionPolicy.policyDigest !==
      definition.nominalDefinition.registration.observationPolicyDigest ||
    !Number.isSafeInteger(input.decisionPolicy.policyVersion) ||
    input.decisionPolicy.policyVersion < 1 ||
    input.decisionPolicy.policyId.length === 0 ||
    !definition.nominalDefinition.peers.some(
      (peer) => peer.peerId === input.replacementPeerId,
    )
  )
    throw new TypeError("closed_loop_resilience_runner_binding_invalid");
  return input;
}

function bindFaultMatrixPortToPreEffect(
  port: CollectiveClosedLoopFaultMatrixPortV1,
  preEffect: CollectiveClosedLoopPreEffectHandleV1,
  replacementPeerId: string,
): CollectiveClosedLoopFaultMatrixRegistrationV1 {
  const registration = collectiveClosedLoopFaultMatrixRegistrations.get(port);
  if (!registration)
    throw new TypeError("closed_loop_fault_matrix_port_not_registered");
  const expected = createCollectiveClosedLoopFaultMatrixMissionBindingV1({
    preEffect,
    replacementPeerId,
  });
  if (
    port.bindingDigest !== digestValue(registration.binding) ||
    digestValue(registration.binding) !== digestValue(expected)
  )
    throw new Error("closed_loop_fault_matrix_mission_binding_mismatch");
  return registration;
}

function bindFaultMatrixToPlan(
  definition: CollectiveClosedLoopResilienceDefinitionV1,
  result: CollectiveClosedLoopFaultMatrixResultV1<unknown, unknown>,
  registration: CollectiveClosedLoopFaultMatrixRegistrationV1,
): ReadonlyMap<string, CollectiveClosedLoopFaultMatrixRecordV1> {
  const records = result.records;
  const expectedDriverFaultIds = registration.faults
    .filter((fault) => fault.injection.kind === "driver_fault")
    .map((fault) =>
      fault.injection.kind === "driver_fault"
        ? fault.injection.simulationFaultId
        : "",
    )
    .sort();
  const configuredDriverFaultIds = registration.simulationFaults
    .map((fault) => fault.faultId)
    .sort();
  const executedDriverFaultIds = result.trace.faults
    .map((fault) => fault.faultId)
    .sort();
  if (
    result.schemaVersion !== 1 ||
    result.scenarioDigest !== result.trace.configurationDigest ||
    !/^sha256:[0-9a-f]{64}$/u.test(result.matrixDigest) ||
    result.trace.records.length === 0 ||
    registration.faults.length !== definition.faultPlan.faults.length ||
    !sameStringSet(expectedDriverFaultIds, configuredDriverFaultIds) ||
    !sameStringSet(expectedDriverFaultIds, executedDriverFaultIds) ||
    result.trace.faults.some((fault) => !fault.applied)
  )
    throw new Error("closed_loop_fault_matrix_result_invalid");
  if (records.length !== definition.faultPlan.faults.length)
    throw new Error("closed_loop_fault_matrix_coverage_invalid");
  const byId = new Map(
    records.map((record) => [record.faultId, record] as const),
  );
  if (byId.size !== records.length)
    throw new Error("closed_loop_fault_matrix_duplicate_fault");
  for (const fault of definition.faultPlan.faults) {
    const record = byId.get(fault.faultId);
    const declared = registration.faults.find(
      (candidate) => candidate.faultId === fault.faultId,
    );
    if (
      !record ||
      !declared ||
      record.schemaVersion !== 1 ||
      record.family !== fault.family ||
      declared.family !== fault.family ||
      declared.logicalTime !== fault.trigger.logicalTimeMs ||
      declared.causalPredecessorFaultId !==
        (fault.causalPredecessorFaultIds[0] ?? null) ||
      fault.causalPredecessorFaultIds.length > 1 ||
      record.observed !== true ||
      !/^sha256:[0-9a-f]{64}$/u.test(record.scheduledEventDigest) ||
      !/^sha256:[0-9a-f]{64}$/u.test(record.injectedEventDigest) ||
      !/^sha256:[0-9a-f]{64}$/u.test(record.observedEventDigest)
    )
      throw new Error(
        `closed_loop_fault_matrix_binding_invalid:${fault.faultId}`,
      );
    const injected = result.trace.records.find(
      (candidate) => candidate.eventId === record.injectedRecordId,
    );
    if (
      !injected ||
      !injected.accepted ||
      injected.order.logicalTime !== fault.trigger.logicalTimeMs
    )
      throw new Error(
        `closed_loop_fault_matrix_trace_binding_invalid:${fault.faultId}`,
      );
    assertFaultMatrixTargetBinding(fault, declared, registration);
  }
  return byId;
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function assertFaultMatrixTargetBinding(
  fault: CollectiveClosedLoopResilienceDefinitionV1["faultPlan"]["faults"][number],
  declared: CollectiveClosedLoopFaultMatrixFaultV1,
  registration: CollectiveClosedLoopFaultMatrixRegistrationV1,
): void {
  const injection = declared.injection;
  if (injection.kind === "reducer_event") {
    const event = registration.events.find(
      (candidate) => candidate.eventId === injection.eventId,
    );
    if (
      !event ||
      event.logicalTime !== fault.trigger.logicalTimeMs ||
      fault.targets.length !== 1 ||
      fault.targets[0]?.peerId !== event.targetPeerId ||
      fault.links.length !== 0
    )
      throw new Error(
        `closed_loop_fault_matrix_target_binding_invalid:${fault.faultId}`,
      );
    return;
  }
  const simulationFault = registration.simulationFaults.find(
    (candidate) => candidate.faultId === injection.simulationFaultId,
  );
  const expectedKind =
    fault.family === "peer.restart" ? "peer.resume" : fault.family;
  if (
    !simulationFault ||
    simulationFault.kind !== expectedKind ||
    simulationFault.logicalTime !== fault.trigger.logicalTimeMs
  )
    throw new Error(
      `closed_loop_fault_matrix_driver_binding_invalid:${fault.faultId}`,
    );
  if (fault.family === "peer.crash" || fault.family === "peer.restart") {
    if (
      fault.targets.length !== 1 ||
      fault.targets[0]?.peerId !== simulationFault.peerId ||
      fault.links.length !== 0
    )
      throw new Error(
        `closed_loop_fault_matrix_target_binding_invalid:${fault.faultId}`,
      );
    return;
  }
  const plannedLinks = [...fault.links]
    .map((link) => `${link.fromPeerId}\u0000${link.toPeerId}`)
    .sort();
  const actualLinks = [...simulationFault.links]
    .map((link) => `${link.fromPeerId}\u0000${link.toPeerId}`)
    .sort();
  if (
    fault.targets.length !== 0 ||
    plannedLinks.length !== actualLinks.length ||
    plannedLinks.some((link, index) => link !== actualLinks[index])
  )
    throw new Error(
      `closed_loop_fault_matrix_link_binding_invalid:${fault.faultId}`,
    );
}

function assertFaultCausalTrigger(
  journal: CollectiveTraceJournalV2,
  fault: CollectiveClosedLoopResilienceDefinitionV1["faultPlan"]["faults"][number],
): void {
  if (fault.trigger.kind !== "trace_event") return;
  const causal = journal.events.find(
    (event) => event.eventDigest === fault.trigger.causalEventDigest,
  );
  if (
    !causal ||
    causal.logicalTimeMs > fault.trigger.logicalTimeMs ||
    causal.kind === "fault.scheduled" ||
    causal.kind === "fault.injected" ||
    causal.kind === "fault.observed"
  )
    throw new Error(`closed_loop_fault_causal_event_missing:${fault.faultId}`);
}

function validateFaultMatrixMissionBinding(
  value: CollectiveClosedLoopFaultMatrixMissionBindingV1,
): CollectiveClosedLoopFaultMatrixMissionBindingV1 {
  assertExactRecord(
    value,
    [
      "schemaVersion",
      "planningStateRoot",
      "meshStateRoot",
      "workContractDigest",
      "checkpointDigest",
      "assignmentEpoch",
      "assignmentAuthorityId",
      "winnerPeerId",
      "replacementPeerId",
    ],
    "closed-loop fault matrix mission binding",
  );
  if (
    value.schemaVersion !== 1 ||
    !/^sha256:[0-9a-f]{64}$/u.test(value.planningStateRoot) ||
    !/^sha256:[0-9a-f]{64}$/u.test(value.meshStateRoot) ||
    !/^sha256:[0-9a-f]{64}$/u.test(value.workContractDigest) ||
    !/^sha256:[0-9a-f]{64}$/u.test(value.checkpointDigest) ||
    !Number.isSafeInteger(value.assignmentEpoch) ||
    value.assignmentEpoch < 1 ||
    value.assignmentAuthorityId.length === 0 ||
    value.winnerPeerId.length === 0 ||
    value.replacementPeerId.length === 0 ||
    value.winnerPeerId === value.replacementPeerId
  )
    throw new TypeError("closed_loop_fault_matrix_mission_binding_invalid");
  return deepFreezePlanning(value);
}

function appendFaultEvidence(
  journal: CollectiveTraceJournalV2,
  logicalTimeMs: number,
  fault: CollectiveClosedLoopResilienceDefinitionV1["faultPlan"]["faults"][number],
  record: CollectiveClosedLoopFaultMatrixRecordV1,
  kind: "fault.scheduled" | "fault.injected" | "fault.observed",
  status: "accepted" | "observed",
  recordDigest: PlanningDigestV1,
) {
  return journal.append({
    logicalTimeMs,
    peerId: fault.targets[0]?.peerId ?? null,
    component: "fault",
    kind,
    status,
    reasonCode: null,
    recordDigest,
    stateDigestBefore: null,
    stateDigestAfter: null,
    faultBinding: {
      schemaVersion: 1,
      faultFamily: fault.family,
      scheduleId: fault.faultId,
      injectionId: record.injectedRecordId,
    },
  });
}

function collectObservations(
  input: CollectiveClosedLoopExecutionInputV1,
  logicalTimeMs: number,
  priorCursors: Readonly<Record<string, string>> = Object.freeze({}),
  phase = "initial",
): Readonly<{
  observations: readonly MissionObservationV1[];
  cursors: Readonly<Record<string, string>>;
}> {
  const registration = input.definition.registration;
  const observations: MissionObservationV1[] = [];
  const cursors: Record<string, string> = { ...priorCursors };
  for (const peer of input.definition.peers) {
    const environmentCursor = priorCursors[peer.peerId] ?? "cursor:0";
    const result = input.evaluator.environment.observe(
      createCollectiveEnvironmentObservationRequestV1({
        schemaVersion: 1,
        requestId: `closed-loop:observe:${peer.peerId}:${phase}:${logicalTimeMs}`,
        registrationDigest: registration.bindingDigest,
        missionIntentId: input.definition.missionIntent.missionIntentId,
        intentRevision: input.definition.missionIntent.revision,
        intentDigest: input.definition.missionIntent.intentDigest,
        peerId: peer.peerId,
        peerInstanceId: peer.peerInstanceId,
        environmentCursor,
        maximumItems: registration.limits.maximumObservationBatch,
        requestedAtLogicalMs: logicalTimeMs,
      }),
    );
    if (result.receipt.status === "delivered") {
      observations.push(...result.observations);
      cursors[peer.peerId] = result.receipt.nextEnvironmentCursor;
    } else if (result.receipt.status === "idempotent") {
      observations.push(...result.observations);
      cursors[peer.peerId] = result.receipt.nextEnvironmentCursor;
    } else if (result.receipt.reasonCode !== "cursor_exhausted")
      throw new Error(`closed_loop_observation_${result.receipt.reasonCode}`);
  }
  return Object.freeze({
    observations: Object.freeze(observations),
    cursors: Object.freeze(cursors),
  });
}

async function collectDecisions(
  input: CollectiveClosedLoopExecutionInputV1,
  observations: readonly MissionObservationV1[],
  journal: CollectiveTraceJournalV2,
  logicalTimeMs: number,
): Promise<ReadonlyMap<string, CollectivePlanningDecisionV1>> {
  const decisions = new Map<string, CollectivePlanningDecisionV1>();
  for (const peer of input.definition.peers) {
    const localObservations = observations.filter(
      (observation) =>
        observation.observerPeerId === peer.peerId &&
        observation.observerInstanceId === peer.peerInstanceId,
    );
    const state = localPlanningState(
      input.definition,
      peer.peerId,
      localObservations,
    );
    const context = validateCollectivePlanningDecisionContextV1({
      schemaVersion: 1,
      peerId: peer.peerId,
      peerInstanceId: peer.peerInstanceId,
      missionIntent: input.definition.missionIntent,
      observations: localObservations,
      planView: state.planView,
      logicalTimeMs,
    });
    const decision = validateCollectivePlanningDecisionV1(
      await input.decisionPolicy.decide(context),
    );
    assertDecisionIsLocal(
      decision,
      context.observations,
      peer.peerId,
      peer.peerInstanceId,
      input.definition,
    );
    decisions.set(peer.peerId, decision);
    append(journal, {
      logicalTimeMs,
      peerId: peer.peerId,
      component: "runner",
      kind: "peer.decision.accepted",
      recordDigest: digestValue(decision),
      stateDigestBefore: state.planView.stateDigest,
      stateDigestAfter: state.planView.stateDigest,
    });
    if (decision.kind === "proposal")
      append(journal, {
        logicalTimeMs,
        peerId: peer.peerId,
        component: "planning",
        kind: "planning.proposal",
        recordDigest: decision.proposal.proposalDigest,
        stateDigestBefore: state.planView.stateDigest,
        stateDigestAfter: state.planView.stateDigest,
      });
  }
  return decisions;
}

async function collectCentralizedDecision(
  input: CollectiveClosedLoopExecutionInputV1,
  observations: readonly MissionObservationV1[],
  journal: CollectiveTraceJournalV2,
  ownerPeerId: string,
  ownerPeerInstanceId: string,
  logicalTimeMs: number,
) {
  const retainedObservations = [...observations]
    .sort((left, right) => {
      const leftKey = `${left.observerPeerId}\u0000${left.observerInstanceId}\u0000${left.observationDigest}`;
      const rightKey = `${right.observerPeerId}\u0000${right.observerInstanceId}\u0000${right.observationDigest}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    })
    .slice(
      0,
      input.definition.missionIntent.planningLimits.maximumCandidateFragments,
    );
  const context = validateCollectiveCentralizedPlanningDecisionContextV1({
    schemaVersion: 1,
    ownerPeerId,
    ownerPeerInstanceId,
    missionIntent: input.definition.missionIntent,
    observations: retainedObservations,
    logicalTimeMs,
  });
  const decision = validateCollectivePlanningDecisionV1(
    await input.decisionPolicy.decideCentralized(context),
  );
  if (decision.kind !== "proposal")
    throw new Error("closed_loop_centralized_proposal_required");
  assertCentralizedDecision(
    decision,
    retainedObservations,
    ownerPeerId,
    ownerPeerInstanceId,
    input.definition,
  );
  append(journal, {
    logicalTimeMs,
    peerId: null,
    component: "planning",
    kind: "planning.decision",
    recordDigest: digestValue(decision),
    stateDigestBefore: null,
    stateDigestAfter: null,
  });
  append(journal, {
    logicalTimeMs,
    peerId: ownerPeerId,
    component: "planning",
    kind: "planning.proposal",
    recordDigest: decision.proposal.proposalDigest,
    stateDigestBefore: null,
    stateDigestAfter: null,
  });
  return decision.proposal;
}

function localPlanningState(
  definition: CollectiveClosedLoopDefinitionV1,
  peerId: string,
  observations: readonly MissionObservationV1[],
): PlanningReducerStateV1 {
  const peer = definition.peers.find(
    (candidate) => candidate.peerId === peerId,
  );
  if (!peer) throw new Error("closed_loop_peer_missing");
  let state = createPlanningReducerStateV1({
    schemaVersion: 1,
    peerId: peer.peerId,
    peerInstanceId: peer.peerInstanceId,
    missionIntent: definition.missionIntent,
    selectionPolicy: definition.selectionPolicy,
    admittedSubjects: definition.peers.map((subject) => ({
      schemaVersion: 1,
      peerId: subject.peerId,
      peerInstanceId: subject.peerInstanceId,
    })),
    logicalTimeMs: 0,
  });
  for (const observation of observations) {
    const result = reducePlanningCommandV1(
      state,
      createPlanningReducerCommandV1({
        schemaVersion: 1,
        kind: "observation.record",
        expectedStateDigest: null,
        observation,
      }),
    );
    if (result.status !== "applied")
      throw new Error(`closed_loop_planning_${result.error?.message}`);
    state = result.state;
  }
  return state;
}

function assertDecisionIsLocal(
  decision: CollectivePlanningDecisionV1,
  observations: readonly MissionObservationV1[],
  peerId: string,
  peerInstanceId: string,
  definition: CollectiveClosedLoopDefinitionV1,
): void {
  if (decision.kind !== "proposal") return;
  const localDigests = new Set(
    observations.map((item) => item.observationDigest),
  );
  const proposal = decision.proposal;
  if (
    proposal.proposerPeerId !== peerId ||
    proposal.proposerInstanceId !== peerInstanceId ||
    proposal.missionIntentId !== definition.missionIntent.missionIntentId ||
    proposal.intentRevision !== definition.missionIntent.revision ||
    proposal.intentDigest !== definition.missionIntent.intentDigest ||
    proposal.basisObservationDigests.length === 0 ||
    proposal.basisObservationDigests.some((digest) => !localDigests.has(digest))
  )
    throw new TypeError("closed_loop_decision_not_peer_local");
}

function assertCentralizedDecision(
  decision: CollectivePlanningDecisionV1,
  observations: readonly MissionObservationV1[],
  ownerPeerId: string,
  ownerPeerInstanceId: string,
  definition: CollectiveClosedLoopDefinitionV1,
): void {
  if (decision.kind !== "proposal") return;
  const deliveredDigests = new Set(
    observations.map((observation) => observation.observationDigest),
  );
  const proposal = decision.proposal;
  if (
    proposal.proposerPeerId !== ownerPeerId ||
    proposal.proposerInstanceId !== ownerPeerInstanceId ||
    proposal.missionIntentId !== definition.missionIntent.missionIntentId ||
    proposal.intentRevision !== definition.missionIntent.revision ||
    proposal.intentDigest !== definition.missionIntent.intentDigest ||
    proposal.basisObservationDigests.length === 0 ||
    proposal.basisObservationDigests.some(
      (digest) => !deliveredDigests.has(digest),
    )
  )
    throw new TypeError("closed_loop_centralized_decision_not_auditable");
}

function appendCentralizedDirectives(
  journal: CollectiveTraceJournalV2,
  observations: readonly MissionObservationV1[],
  logicalTimeMs: number,
): void {
  for (const observation of observations)
    append(journal, {
      logicalTimeMs,
      peerId: observation.observerPeerId,
      component: "runner",
      kind: "runner.directive.delivered",
      recordDigest: observation.observationDigest,
      stateDigestBefore: null,
      stateDigestAfter: null,
    });
}

function appendRuntimeEvidence(
  journal: CollectiveTraceJournalV2,
  value: CollectiveClosedLoopPreEffectHandleV1,
): void {
  const roots = Object.values(value.meshStates).map((state) =>
    digestValue(state),
  );
  const stateRoot = digestValue(roots);
  for (const [kind, recordDigest] of [
    ["work.created", digestValue(value.workItem)],
    ["allocation.offer", digestValue(value.workItem)],
    ["allocation.award", value.workContract.workContractDigest],
    ["allocation.accepted", digestValue(value.execution)],
    ["work.checkpoint", digestValue(value.checkpoint)],
  ] as const)
    append(journal, {
      logicalTimeMs: value.logicalTimeMs,
      peerId: value.winnerPeerId,
      component: "mesh",
      kind,
      recordDigest,
      stateDigestBefore: stateRoot,
      stateDigestAfter: stateRoot,
    });
}

function appendFinalizationEvidence(
  journal: CollectiveTraceJournalV2,
  value: CollectiveClosedLoopFinalizedResultV1,
): void {
  append(journal, {
    logicalTimeMs: value.logicalTimeMs,
    peerId: value.winnerPeerId,
    component: "mesh",
    kind: "work.result",
    recordDigest: digestValue(value.result),
    stateDigestBefore: null,
    stateDigestAfter: digestMeshStates(value.meshStates),
  });
}

function appendRecoveryEvidence(
  journal: CollectiveTraceJournalV2,
  preEffect: CollectiveClosedLoopPreEffectHandleV1,
  recovery: CollectiveClosedLoopCertifiedRecoveryResultV1,
  faultMatrixDigest: PlanningDigestV1,
): void {
  const stateBefore = digestMeshStates(preEffect.meshStates);
  const stateAfter = digestMeshStates(recovery.meshStates);
  for (const [kind, recordDigest] of [
    [
      "recovery.directive",
      digestValue({
        takeoverProposalId: recovery.takeoverProposalId,
        leaseVoteIds: recovery.leaseVoteIds,
        certificateId: recovery.certificateId,
        causalFaultMatrixDigest: faultMatrixDigest,
      }),
    ],
    ["lease.recovered", digestValue(recovery.fenceHead)],
    ["work.checkpoint", digestValue(recovery.checkpoint)],
  ] as const)
    append(journal, {
      logicalTimeMs: recovery.recoveryLogicalTimeMs,
      peerId: recovery.replacementPeerId,
      component: "mesh",
      kind,
      recordDigest,
      stateDigestBefore: stateBefore,
      stateDigestAfter: stateAfter,
    });
}

function appendStaleResultRejectionEvidence(
  journal: CollectiveTraceJournalV2,
  preEffect: CollectiveClosedLoopPreEffectHandleV1,
  recovery: CollectiveClosedLoopCertifiedRecoveryResultV1,
  fault: CollectiveClosedLoopResilienceDefinitionV1["faultPlan"]["faults"][number],
  staleRejection: CollectiveClosedLoopCertifiedRecoveryResultV1["staleRejections"][number],
  staleFenceDigest: PlanningDigestV1,
  currentFenceDigest: PlanningDigestV1,
) {
  const reasonCode = staleRejection.rejectionCode;
  const currentStateDigest = digestMeshStates(recovery.meshStates);
  return journal.append({
    logicalTimeMs: staleRejection.logicalTimeMs,
    peerId: preEffect.winnerPeerId,
    component: "mesh",
    kind: "mesh.message.rejected",
    status: "rejected",
    reasonCode,
    recordDigest: digestValue(staleRejection.envelope),
    stateDigestBefore: currentStateDigest,
    stateDigestAfter: currentStateDigest,
    faultBinding: {
      schemaVersion: 1,
      faultFamily: fault.family,
      scheduleId: fault.faultId,
      injectionId: staleRejection.recordId,
    },
  });
}

function appendRecoveredFinalizationEvidence(
  journal: CollectiveTraceJournalV2,
  value: CollectiveClosedLoopRecoveredFinalizedResultV1,
): void {
  append(journal, {
    logicalTimeMs: value.logicalTimeMs,
    peerId: value.winnerPeerId,
    component: "mesh",
    kind: "work.result",
    recordDigest: digestValue(value.result),
    stateDigestBefore: null,
    stateDigestAfter: digestMeshStates(value.meshStates),
  });
}

function currentMesh(
  value: CollectiveClosedLoopPreEffectHandleV1,
): CollectiveClosedLoopCurrentMeshV1 {
  return Object.freeze({
    meshId: value.workContract.objective.meshId,
    objectiveId: value.workContract.objective.objectiveId,
    objectiveRevision: value.workContract.objective.objectiveRevision,
    workItemId: value.workContract.assignment.workItemId,
    workItemRevision: value.workContract.assignment.workItemRevision,
    assignedPeerId: value.workContract.assignment.assignedPeerId,
    assignedInstanceId: value.workContract.assignment.assignedInstanceId,
    assignmentAuthorityId: value.workContract.assignment.assignmentAuthorityId,
    assignmentEpoch: value.workContract.assignment.assignmentEpoch,
    authorityGeneration: value.workContract.assignment.authorityGeneration,
    fencingToken: value.workContract.assignment.fencingToken,
    leaseExpiresAtLogicalMs:
      value.workContract.assignment.leaseExpiresAtLogicalMs,
    objectiveTerminal: false,
    workTerminal: false,
  });
}

function currentMeshForWorkContract(
  workContract: WorkContractV1,
): CollectiveClosedLoopCurrentMeshV1 {
  return Object.freeze({
    meshId: workContract.objective.meshId,
    objectiveId: workContract.objective.objectiveId,
    objectiveRevision: workContract.objective.objectiveRevision,
    workItemId: workContract.assignment.workItemId,
    workItemRevision: workContract.assignment.workItemRevision,
    assignedPeerId: workContract.assignment.assignedPeerId,
    assignedInstanceId: workContract.assignment.assignedInstanceId,
    assignmentAuthorityId: workContract.assignment.assignmentAuthorityId,
    assignmentEpoch: workContract.assignment.assignmentEpoch,
    authorityGeneration: workContract.assignment.authorityGeneration,
    fencingToken: workContract.assignment.fencingToken,
    leaseExpiresAtLogicalMs: workContract.assignment.leaseExpiresAtLogicalMs,
    objectiveTerminal: false,
    workTerminal: false,
  });
}

function actionWallTime(
  validFrom: string,
  validUntil: string,
  checkpointSentAt: string,
  logicalTimeMs: number,
): string {
  const lowerBoundMs = Date.parse(validFrom);
  const upperBoundMs = Date.parse(validUntil);
  const checkpointMs = Date.parse(checkpointSentAt);
  const logicalWallTimeMs = lowerBoundMs + logicalTimeMs;
  const authorizedAtMs = Math.max(logicalWallTimeMs, checkpointMs + 1);
  if (
    !Number.isSafeInteger(logicalTimeMs) ||
    logicalTimeMs < 0 ||
    !Number.isFinite(lowerBoundMs) ||
    !Number.isFinite(upperBoundMs) ||
    !Number.isFinite(checkpointMs) ||
    upperBoundMs <= lowerBoundMs ||
    checkpointMs < lowerBoundMs ||
    checkpointMs >= upperBoundMs ||
    !Number.isSafeInteger(authorizedAtMs) ||
    authorizedAtMs >= upperBoundMs
  )
    throw new RangeError("closed_loop_action_time_invalid");
  return new Date(authorizedAtMs).toISOString();
}

function publicArtifactsFor(
  preEffect: CollectiveClosedLoopPreEffectHandleV1,
  action: CollectiveClosedLoopActionResultV1,
  finalized: CollectiveClosedLoopFinalizedResultV1,
  checkpointObservations: readonly MissionObservationV1[],
  outcomeObservations: readonly MissionObservationV1[],
): readonly PlanningJson[] {
  return deepFreezePlanning([
    {
      schemaVersion: 1,
      kind: "closed-loop-assignment",
      winnerPeerId: preEffect.winnerPeerId,
      workContractId: preEffect.workContract.workContractId,
      workContractDigest: preEffect.workContract.workContractDigest,
      roleBindingDigest: preEffect.roleBinding.roleBindingDigest,
    },
    {
      schemaVersion: 1,
      kind: "closed-loop-mesh-participation",
      ownerPeerId: preEffect.workContract.assignment.ownerPeerId,
      discoveredPeerIds: preEffect.discoveredPeerIds,
      offerRecipientPeerIds: preEffect.offerRecipientPeerIds,
      bidderPeerIds: preEffect.bidderPeerIds,
    },
    {
      schemaVersion: 1,
      kind: "closed-loop-protected-effect",
      permitDigest: action.actionPermit.permitDigest,
      receiptDigest: action.receipt?.receiptDigest ?? null,
      status: action.receipt?.status ?? "missing",
    },
    {
      schemaVersion: 1,
      kind: "closed-loop-checkpoint-observations",
      observationDigests: checkpointObservations
        .map((observation) => observation.observationDigest)
        .sort(),
    },
    {
      schemaVersion: 1,
      kind: "closed-loop-outcome-observations",
      observationDigests: outcomeObservations
        .map((observation) => observation.observationDigest)
        .sort(),
    },
    {
      schemaVersion: 1,
      kind: "closed-loop-work-result",
      resultDigest: digestValue(finalized.result),
      logicalTimeMs: finalized.logicalTimeMs,
      interactionCount: finalized.interactionCount,
    },
  ] as PlanningJson[]);
}

function publicArtifactsForRecovery(
  preEffect: CollectiveClosedLoopPreEffectHandleV1,
  recovery: CollectiveClosedLoopCertifiedRecoveryResultV1,
  action: CollectiveClosedLoopActionResultV1,
  finalized: CollectiveClosedLoopRecoveredFinalizedResultV1,
  faultMatrixBindingDigest: PlanningDigestV1,
  faultMatrix: CollectiveClosedLoopFaultMatrixResultV1<unknown, unknown>,
  checkpointObservations: readonly MissionObservationV1[],
  outcomeObservations: readonly MissionObservationV1[],
): readonly PlanningJson[] {
  return deepFreezePlanning([
    {
      schemaVersion: 1,
      kind: "closed-loop-recovered-assignment",
      failedPeerId: recovery.failedWinnerPeerId,
      winnerPeerId: recovery.replacementPeerId,
      priorWorkContractDigest: preEffect.workContract.workContractDigest,
      workContractId: recovery.workContract.workContractId,
      workContractDigest: recovery.workContract.workContractDigest,
      assignmentEpoch: recovery.workContract.assignment.assignmentEpoch,
      certificateId: recovery.certificateId,
    },
    {
      schemaVersion: 1,
      kind: "closed-loop-fault-matrix",
      missionBindingDigest: faultMatrixBindingDigest,
      scenarioDigest: faultMatrix.scenarioDigest,
      matrixDigest: faultMatrix.matrixDigest,
      faultIds: faultMatrix.records.map((record) => record.faultId).sort(),
      observedEventDigests: faultMatrix.records
        .map((record) => record.observedEventDigest)
        .sort(),
    },
    {
      schemaVersion: 1,
      kind: "closed-loop-stale-authority-fencing",
      rejectionCodes: recovery.staleRejectionCodes,
      priorAssignmentEpoch: preEffect.execution.assignmentEpoch,
      currentAssignmentEpoch: recovery.execution.assignmentEpoch,
    },
    {
      schemaVersion: 1,
      kind: "closed-loop-protected-effect",
      permitDigest: action.actionPermit.permitDigest,
      receiptDigest: action.receipt?.receiptDigest ?? null,
      status: action.receipt?.status ?? "missing",
    },
    {
      schemaVersion: 1,
      kind: "closed-loop-checkpoint-observations",
      observationDigests: checkpointObservations
        .map((observation) => observation.observationDigest)
        .sort(),
    },
    {
      schemaVersion: 1,
      kind: "closed-loop-outcome-observations",
      observationDigests: outcomeObservations
        .map((observation) => observation.observationDigest)
        .sort(),
    },
    {
      schemaVersion: 1,
      kind: "closed-loop-work-result",
      resultDigest: digestValue(finalized.result),
      logicalTimeMs: finalized.logicalTimeMs,
      interactionCount: finalized.interactionCount,
    },
  ] as PlanningJson[]);
}

function assertTerminalEvidence(
  evaluation: CollectiveDeterministicEnvironmentResultV1,
  run: CollectiveClosedLoopRunResultV1,
  finalized: CollectiveClosedLoopFinalizedResultV1,
): void {
  if (
    evaluation.trace.runner !== run.runner ||
    evaluation.trace.registrationDigest !== run.registrationBindingDigest ||
    evaluation.trace.ledger.limitExceeded ||
    evaluation.trace.ledger.total >
      evaluation.evidence.registration.limits.maximumInteractions ||
    finalized.interactionCount >
      evaluation.evidence.registration.limits.maximumInteractions
  )
    throw new Error("closed_loop_terminal_evidence_invalid");
}

function assertResilienceTerminalEvidence(
  evaluation: CollectiveDeterministicEnvironmentResultV1,
  run: CollectiveClosedLoopRunResultV1,
  finalized: CollectiveClosedLoopRecoveredFinalizedResultV1,
  faultMatrix: CollectiveClosedLoopFaultMatrixResultV1<unknown, unknown>,
): void {
  if (
    evaluation.trace.runner !== run.runner ||
    evaluation.trace.registrationDigest !== run.registrationBindingDigest ||
    evaluation.trace.ledger.limitExceeded ||
    evaluation.trace.ledger.total >
      evaluation.evidence.registration.limits.maximumInteractions ||
    finalized.interactionCount >
      evaluation.evidence.registration.limits.maximumInteractions ||
    faultMatrix.records.length >
      COLLECTIVE_CLOSED_LOOP_RESILIENCE_LIMITS_V1.maximumFaults ||
    faultMatrix.trace.records.length > 5_000
  )
    throw new Error("closed_loop_resilience_terminal_evidence_invalid");
}

function journalFor(
  environment: CollectiveEnvironmentPortV1,
): CollectiveTraceJournalV2 {
  const journal = collectiveTraceJournalForOwnerV2(environment as object);
  if (!journal) throw new TypeError("closed_loop_evaluator_not_instrumented");
  return journal;
}

function append(
  journal: CollectiveTraceJournalV2,
  input: {
    readonly logicalTimeMs: number;
    readonly peerId: string | null;
    readonly component: Parameters<
      CollectiveTraceJournalV2["append"]
    >[0]["component"];
    readonly kind: Parameters<CollectiveTraceJournalV2["append"]>[0]["kind"];
    readonly recordDigest: PlanningDigestV1;
    readonly stateDigestBefore: PlanningDigestV1 | null;
    readonly stateDigestAfter: PlanningDigestV1 | null;
  },
): void {
  journal.append({
    ...input,
    status: "accepted",
    reasonCode: null,
    faultBinding: null,
  });
}

function sortedRoots(
  values: readonly PlanningDigestV1[],
): readonly PlanningDigestV1[] {
  return Object.freeze([...new Set(values)].sort());
}

function digestValue(value: unknown): PlanningDigestV1 {
  return digestPlanningJsonV1(
    "environment-state-v1",
    planningJsonProjection(value),
    {
      maximumBytes: 67_108_864,
      maximumDepth: 64,
      maximumNodes: 2_000_000,
      maximumKeysPerObject: 4_096,
      maximumItemsPerArray: 262_144,
    },
  );
}

function digestMeshStates(
  states: Readonly<Record<string, unknown>>,
): PlanningDigestV1 {
  return digestStateCollection(states);
}

function digestPlanningStates(
  states: Readonly<Record<string, unknown>>,
): PlanningDigestV1 {
  return digestStateCollection(states);
}

function digestStateCollection(
  states: Readonly<Record<string, unknown>>,
): PlanningDigestV1 {
  return digestValue(
    Object.entries(states)
      .map(([peerId, state]) => ({ peerId, stateDigest: digestValue(state) }))
      .sort((left, right) => left.peerId.localeCompare(right.peerId)),
  );
}

function planningJsonProjection(
  value: unknown,
  seen: WeakSet<object> = new WeakSet<object>(),
): PlanningJson {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return value as PlanningJson;
  if (typeof value !== "object")
    throw new TypeError("closed_loop_state_not_json_projectable");
  if (seen.has(value))
    throw new TypeError("closed_loop_state_projection_cycle");
  seen.add(value);
  if (Array.isArray(value)) {
    const projected = value.map((item) => planningJsonProjection(item, seen));
    seen.delete(value);
    return projected;
  }
  const projected: Record<string, PlanningJson> = Object.create(null);
  for (const key of Object.keys(value).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor))
      throw new TypeError("closed_loop_state_projection_accessor");
    if (descriptor.value !== undefined)
      projected[key] = planningJsonProjection(descriptor.value, seen);
  }
  seen.delete(value);
  return projected;
}

function assertExactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} must be a plain record`);
  const prototype = Object.getPrototypeOf(value);
  const actual = Object.getOwnPropertyNames(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0 ||
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    throw new TypeError(`${label} has an invalid shape`);
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
      throw new TypeError(`${label} must contain enumerable data properties`);
  }
}
