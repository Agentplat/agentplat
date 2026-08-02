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
  const harness = createCollectiveDeterministicEnvironmentHarnessV1(ownedConfig);
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

  const instrumentedRuntime: CollectiveClosedLoopRuntimeRunnerV1 = Object.freeze({
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
  bindCollectiveFinalizerEnvironmentV1(
    preEffect,
    input.evaluator.environment,
  );
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
  assertExactRecord(prepared, [
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
  ], "closed-loop prepared action");
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
  if (!action.effectAttempt || !action.receipt || action.receipt.status !== "committed")
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
  assertExactRecord(input, [
    "schemaVersion",
    "definition",
    "evaluator",
    "runtime",
    "decisionPolicy",
    "actionClass",
    "resultDigest",
    "resultSummary",
    "prepareAction",
  ], "closed-loop execution input");
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
    }
    else if (result.receipt.reasonCode !== "cursor_exhausted")
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
    const state = localPlanningState(input.definition, peer.peerId, localObservations);
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
    assertDecisionIsLocal(decision, context.observations, peer.peerId, peer.peerInstanceId, input.definition);
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
  const peer = definition.peers.find((candidate) => candidate.peerId === peerId);
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
  const localDigests = new Set(observations.map((item) => item.observationDigest));
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
  const deliveredDigests = observations
    .map((observation) => observation.observationDigest)
    .sort();
  const proposal = decision.proposal;
  if (
    proposal.proposerPeerId !== ownerPeerId ||
    proposal.proposerInstanceId !== ownerPeerInstanceId ||
    proposal.missionIntentId !== definition.missionIntent.missionIntentId ||
    proposal.intentRevision !== definition.missionIntent.revision ||
    proposal.intentDigest !== definition.missionIntent.intentDigest ||
    proposal.basisObservationDigests.length !== deliveredDigests.length ||
    proposal.basisObservationDigests.some(
      (digest, index) => digest !== deliveredDigests[index],
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
  const roots = Object.values(value.meshStates).map((state) => digestValue(state));
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
    stateDigestAfter: digestValue(value.meshStates),
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

function journalFor(environment: CollectiveEnvironmentPortV1): CollectiveTraceJournalV2 {
  const journal = collectiveTraceJournalForOwnerV2(environment as object);
  if (!journal) throw new TypeError("closed_loop_evaluator_not_instrumented");
  return journal;
}

function append(
  journal: CollectiveTraceJournalV2,
  input: {
    readonly logicalTimeMs: number;
    readonly peerId: string | null;
    readonly component: Parameters<CollectiveTraceJournalV2["append"]>[0]["component"];
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

function sortedRoots(values: readonly PlanningDigestV1[]): readonly PlanningDigestV1[] {
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
