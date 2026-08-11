import {
  createMissionIntentV1,
  createMissionObservationV1,
  createPlanFragmentProposalV1,
  createPlanSelectionPolicyV1,
  digestPlanningJsonV1,
  type MissionIntentV1,
  type MissionObservationV1,
  type PlanningDigestV1,
  type PlanningJson,
} from '@agentplat/collective-planning';
import {
  createDelegationMandateV1,
  delegationMandateDigestV1,
  type WorkContractV1,
} from '@agentplat/collective-control';
import {
  DEFAULT_COLLECTIVE_EVALUATION_LIMITS_V1,
  createCollectiveEvaluationRegistrationBindingV1,
  createCollectiveInvariantMonitorPolicyV1,
  type CollectiveEvaluationRunnerV2,
} from '@agentplat/collective-planning/evaluation';
import {
  DEFAULT_MESH_CRYPTO_POLICY,
  createStaticMeshKeyResolver,
} from '@agentplat/mesh-crypto';
import { MESH_SIGNATURE_ALGORITHM } from '@agentplat/mesh-protocol';
import {
  CapabilityRegistryV1,
  INFERENCE_CONTROL_LIMITS_V1,
  createInferenceControlStateV1,
  createPolicyRecordV1,
  negotiateCapabilitiesV1,
  reduceInferenceControlStateV1,
  type ControlScopeV1,
} from '@agentplat/inference-control';
import {
  actionDigest,
  actionInputDigest,
  controlDigest,
  scopeDigest,
  type ActionBinding,
  type ActionScope,
  type ControlJsonObject,
} from '@agentplat/inference-control/tools';
import {
  EVIDENCE_TRUST_LIMITS_V1,
  createEvidenceFusionPolicyV1,
  createEvidenceTrustStateV1,
  createTrustEligibilityRequestV1,
  digestEvidenceFusionPolicyV1,
  digestScopeV1,
  digestSubjectV1,
  reduceEvidenceTrustStateV1,
} from '@agentplat/trust';
import {
  collectiveDeterministicEnvironmentDigestV1,
  collectiveHiddenCanaryDigestV1,
  type CollectiveDeterministicEnvironmentDefinitionV1,
} from './collective-environment.js';
import { createCollectiveClosedLoopDefinitionV1 } from './collective-closed-loop-contracts.js';
import {
  createCollectiveClosedLoopFaultPlanV1,
  createCollectiveClosedLoopResilienceDefinitionV1,
} from './collective-closed-loop-resilience-contracts.js';
import type { CollectiveClosedLoopFaultMatrixInputV1 } from './collective-closed-loop-fault-matrix.js';
import { recoverCollectiveClosedLoopAssignmentV1 } from './collective-closed-loop-recovery.js';
import {
  createCollectiveClosedLoopRuntimeRunnerV1,
  runCollectiveClosedLoopMeshRuntimeV1,
  type CollectiveClosedLoopRuntimeRunnerV1,
} from './collective-closed-loop-runtime.js';
import {
  createCollectiveClosedLoopEvaluatorV1,
  createCollectiveClosedLoopFaultMatrixMissionBindingV1,
  createCollectiveClosedLoopFaultMatrixPortV1,
  type CollectiveClosedLoopActionPreparationContextV1,
  type CollectiveClosedLoopExecutionInputV1,
  type CollectiveClosedLoopPreparedActionV1,
  type CollectiveClosedLoopResilienceExecutionInputV1,
} from './collective-closed-loop-runner.js';

const MINIMUM_PEERS = 3;
const MAXIMUM_PEERS = 500;
const SEED = 11;
const MAXIMUM_LOGICAL_TIME_MS = 5_000;
// The reference mandate remains inside its two-day validity window. Recovery
// derives the safe takeover point from the issued lease, whose logical expiry
// can be far beyond the compact nominal planning window.
const MAXIMUM_RESILIENCE_LOGICAL_TIME_MS = 86_400_000;
const VALID_FROM = '2026-08-01T00:00:00.000Z';
const VALID_UNTIL = '2026-08-03T00:00:00.000Z';
const ACTION_CLASS = 'publish-result';
const HIDDEN_CANARY = 'closed-loop-reference-private-canary-v1';
const ACTION_INPUT: ControlJsonObject = Object.freeze({
  resourceId: 'resource:closed-loop-reference',
});

interface ResilienceFaultMatrixStateV1 {
  readonly capabilityAvailable: boolean;
  readonly assignmentDeclined: boolean;
  readonly offerAttempt: number;
  readonly deliveryCount: number;
}

interface ResilienceFaultMatrixActionV1 {
  readonly kind: string;
  readonly attempt?: number;
}

const referenceDecisionPolicies = new WeakMap<
  object,
  Map<string, ReturnType<typeof decisionPolicyFor>>
>();

export interface CollectiveClosedLoopReferenceRuntimeV1 {
  readonly schemaVersion: 1;
  readonly peerCount: number;
  /** Construction-bound handles. CryptoKey material is never serialized. */
  readonly runner: CollectiveClosedLoopRuntimeRunnerV1;
}

export interface CreateCollectiveClosedLoopReferenceScenarioInputV1 {
  readonly runner: CollectiveEvaluationRunnerV2;
  readonly peerCount: number;
  readonly seed?: number;
  readonly stratum?: 'nominal' | 'benign' | 'adversarial' | 'mixed';
  readonly runtime?: CollectiveClosedLoopReferenceRuntimeV1;
}

/**
 * Builds the deterministic Increment 6 reference campaign. The resilient
 * wrapper keeps the nominal mission and public observations unchanged, while
 * its effect boundary is deliberately bound to the recovered epoch-two
 * contract rather than the failed epoch-one contract.
 */
export interface CreateCollectiveClosedLoopResilienceReferenceScenarioInputV1 {
  readonly runner: CollectiveEvaluationRunnerV2;
  readonly peerCount: number;
  readonly seed?: number;
  readonly stratum?: 'nominal' | 'benign' | 'adversarial' | 'mixed';
  readonly runtime?: CollectiveClosedLoopReferenceRuntimeV1;
}

/**
 * Generates reusable signing handles for deterministic closed-loop replay.
 * Reuse the returned value across scenario factories to retain the same keys.
 */
export async function createCollectiveClosedLoopReferenceRuntimeV1(
  peerCount: number
): Promise<CollectiveClosedLoopReferenceRuntimeV1> {
  assertPeerCount(peerCount);
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) throw new TypeError('closed_loop_crypto_unavailable');
  const peerIds = peerIdsFor(peerCount);
  const keyPairs = await Promise.all(
    peerIds.map(async (peerId) => {
      const keyPair = await crypto.subtle.generateKey(
        MESH_SIGNATURE_ALGORITHM,
        true,
        ['sign', 'verify']
      );
      if (!('privateKey' in keyPair) || !('publicKey' in keyPair))
        throw new TypeError('closed_loop_key_generation_failed');
      return Object.freeze({ peerId, keyPair });
    })
  );
  const resolver = createStaticMeshKeyResolver(
    keyPairs.map(({ peerId, keyPair }) => ({
      tenantId: 'tenant:closed-loop-reference',
      meshId: 'mesh:closed-loop-reference',
      peerId,
      keyId: `key:${peerId}`,
      algorithm: MESH_SIGNATURE_ALGORITHM,
      publicKey: keyPair.publicKey,
      validFrom: VALID_FROM,
      validUntil: VALID_UNTIL,
      status: 'active',
    }))
  );
  const runner = createCollectiveClosedLoopRuntimeRunnerV1({
    resolver,
    privateKeys: Object.fromEntries(
      keyPairs.map(({ peerId, keyPair }) => [peerId, keyPair.privateKey])
    ),
    crypto,
    cryptoPolicy: DEFAULT_MESH_CRYPTO_POLICY,
    mandateVerification: {
      schemaVersion: 1,
      verifierId: 'verifier:closed-loop-reference',
      verifierVersion: 1,
      issuerId: peerIds[0],
      signedDigest: zeroDigest(),
      verifiedAt: VALID_FROM,
      status: 'verified',
    },
  });
  return Object.freeze({ schemaVersion: 1, peerCount, runner });
}

/**
 * Compiles a complete nominal Increment 5 execution from a real Mesh
 * allocation preflight. The measured run receives the same public planning
 * inputs and construction-bound crypto handles, so its contract must match the
 * evaluator's exact fenced effect rule.
 */
export async function createCollectiveClosedLoopReferenceScenarioV1(
  input: CreateCollectiveClosedLoopReferenceScenarioInputV1
): Promise<CollectiveClosedLoopExecutionInputV1> {
  assertRunner(input.runner);
  assertPeerCount(input.peerCount);
  const seed = referenceSeed(input.seed);
  const stratum = referenceStratum(input.stratum);
  const runtimeHandles =
    input.runtime ??
    (await createCollectiveClosedLoopReferenceRuntimeV1(input.peerCount));
  if (
    runtimeHandles.schemaVersion !== 1 ||
    runtimeHandles.peerCount !== input.peerCount
  )
    throw new TypeError('closed_loop_reference_runtime_mismatch');

  const peerIds = peerIdsFor(input.peerCount);
  const peers = peersFor(peerIds);
  const selectionPolicy = selectionPolicyFor();
  const mandate = mandateFor(peerIds);
  const runtime = createCollectiveClosedLoopRuntimeRunnerV1({
    resolver: runtimeHandles.runner.resolver,
    privateKeys: runtimeHandles.runner.privateKeys,
    signer: runtimeHandles.runner.signer,
    crypto: runtimeHandles.runner.crypto,
    cryptoPolicy: runtimeHandles.runner.cryptoPolicy,
    mandateVerification: {
      ...runtimeHandles.runner.mandateVerification,
      issuerId: peerIds[0],
      signedDigest: mandate.mandateDigest,
      verifiedAt: VALID_FROM,
      status: 'verified',
    },
  });
  const missionIntent = missionIntentFor(selectionPolicy.policyDigest, mandate);
  const initialObservations = peerIds.map((peerId, index) =>
    observationFor({
      missionIntent,
      peerId,
      peerInstanceId: peerInstanceId(index),
      cursor: 0,
      phase: 'initial',
      logicalTimeMs: 0,
    })
  );
  const ownerObservation = initialObservations[0];
  const planningProposal = proposalFor(
    missionIntent,
    peerIds[0],
    peerInstanceId(0),
    [ownerObservation]
  );
  const preflight = await runCollectiveClosedLoopMeshRuntimeV1({
    schemaVersion: 1,
    missionIntent,
    selectionPolicy,
    mandate,
    peers,
    observations: initialObservations,
    planningProposal,
    planningMode: input.runner,
    runner: runtime,
    seed,
    maximumLogicalTimeMs: MAXIMUM_LOGICAL_TIME_MS,
  });
  const actionLogicalTimeMs = preflight.logicalTimeMs + 1;
  const checkpointObservations = peerIds.map((peerId, index) =>
    observationFor({
      missionIntent,
      peerId,
      peerInstanceId: peerInstanceId(index),
      cursor: 1,
      phase: 'checkpoint',
      logicalTimeMs: preflight.logicalTimeMs,
    })
  );
  const outcomeObservations = peerIds.map((peerId, index) =>
    observationFor({
      missionIntent,
      peerId,
      peerInstanceId: peerInstanceId(index),
      cursor: 2,
      phase: 'outcome',
      logicalTimeMs: actionLogicalTimeMs,
    })
  );
  const resultDigest = digest({ result: 'closed-loop-reference-committed' });
  const inputDigest = asPlanningDigest(actionInputDigest(ACTION_INPUT));
  const effectId = 'effect:closed-loop-reference';
  const environmentDefinition: CollectiveDeterministicEnvironmentDefinitionV1 =
    {
      schemaVersion: 1,
      environmentId: 'environment:closed-loop-reference',
      observations: [
        ...initialObservations,
        ...checkpointObservations,
        ...outcomeObservations,
      ],
      effectRules: [
        {
          schemaVersion: 1,
          effectId,
          workItemId: preflight.workContract.assignment.workItemId,
          workItemRevision: preflight.workContract.assignment.workItemRevision,
          workContractId: preflight.workContract.workContractId,
          workContractDigest: preflight.workContract.workContractDigest,
          peerId: preflight.workContract.assignment.assignedPeerId,
          peerInstanceId: preflight.workContract.assignment.assignedInstanceId,
          assignmentEpoch: preflight.workContract.assignment.assignmentEpoch,
          authorityGeneration:
            preflight.workContract.assignment.authorityGeneration,
          fencingToken: preflight.workContract.assignment.fencingToken,
          actionClass: ACTION_CLASS,
          inputDigest,
          outputDigest: resultDigest,
          behavior: 'commit',
          rejectionCode: null,
        },
      ],
      hiddenCanary: HIDDEN_CANARY,
    };
  const registrationDigest = digest({
    registration: 'closed-loop-reference',
    runner: input.runner,
    peerCount: input.peerCount,
    seed,
    stratum,
  });
  const monitorPolicy = createCollectiveInvariantMonitorPolicyV1({
    schemaVersion: 1,
    policyId: `monitor:closed-loop-reference:${input.runner}`,
    registrationDigest,
    requiredEffects: [
      { schemaVersion: 1, effectId, outcomeUnits: 1, objectiveValue: 1 },
    ],
    hiddenCanaryDigest: collectiveHiddenCanaryDigestV1(HIDDEN_CANARY),
  });
  const observationPolicyDigest = digest({
    observationPolicy: 'peer-local-cursor-v1',
  });
  const registration = createCollectiveEvaluationRegistrationBindingV1({
    schemaVersion: 1,
    registrationId: `registration:closed-loop-reference:${input.runner}`,
    registrationDigest,
    tenantId: missionIntent.tenantId,
    missionIntentId: missionIntent.missionIntentId,
    intentRevision: missionIntent.revision,
    intentDigest: missionIntent.intentDigest,
    runner: input.runner,
    stratum,
    seed,
    environmentDigest: collectiveDeterministicEnvironmentDigestV1(
      environmentDefinition
    ),
    observationPolicyDigest,
    monitorDigest: monitorPolicy.policyDigest,
    hiddenCanaryDigest: collectiveHiddenCanaryDigestV1(HIDDEN_CANARY),
    limits: DEFAULT_COLLECTIVE_EVALUATION_LIMITS_V1,
  });
  const definition = createCollectiveClosedLoopDefinitionV1({
    schemaVersion: 1,
    registration,
    missionIntent,
    selectionPolicy,
    mandate,
    peers,
    maximumLogicalTimeMs: MAXIMUM_LOGICAL_TIME_MS,
  });
  const evaluator = createCollectiveClosedLoopEvaluatorV1({
    schemaVersion: 1,
    registration,
    monitorPolicy,
    definition: environmentDefinition,
  });
  const decisionPolicy = decisionPolicyFor(
    observationPolicyDigest,
    peerIds,
    missionIntent.planningLimits.maximumCandidateFragments
  );
  const expectedWorkContractDigest = preflight.workContract.workContractDigest;

  return Object.freeze({
    schemaVersion: 1,
    definition,
    evaluator,
    runtime,
    decisionPolicy,
    actionClass: ACTION_CLASS,
    resultDigest,
    resultSummary: 'The protected reference effect committed successfully.',
    async prepareAction(
      context: CollectiveClosedLoopActionPreparationContextV1
    ) {
      if (
        context.workContract.workContractDigest !==
          expectedWorkContractDigest ||
        context.winnerPeerId !==
          context.workContract.assignment.assignedPeerId ||
        context.logicalTimeMs !== actionLogicalTimeMs
      )
        throw new Error('closed_loop_reference_preflight_mismatch');
      return prepareCollectiveClosedLoopReferenceActionV1(context);
    },
  });
}

/**
 * Compiles a bounded six-fault reference campaign without issuing an external
 * effect during construction. The Mesh preflight and certificate recovery are
 * deterministic, construction-bound preparation steps; only the runner can
 * subsequently execute the evaluator-owned protected effect.
 */
export async function createCollectiveClosedLoopResilienceReferenceScenarioV1(
  input: CreateCollectiveClosedLoopResilienceReferenceScenarioInputV1
): Promise<CollectiveClosedLoopResilienceExecutionInputV1> {
  assertRunner(input.runner);
  assertPeerCount(input.peerCount);
  const seed = referenceSeed(input.seed);
  const stratum = referenceStratum(input.stratum);
  const nominal = await createCollectiveClosedLoopReferenceScenarioV1({
    ...input,
    stratum: 'nominal',
  });
  const nominalDefinition = nominal.definition;
  const peerIds = nominalDefinition.peers.map((peer) => peer.peerId);
  const owner = nominalDefinition.peers[0];
  if (!owner) throw new Error('closed_loop_resilience_owner_missing');
  const initialObservations = peerIds.map((peerId, index) =>
    observationFor({
      missionIntent: nominalDefinition.missionIntent,
      peerId,
      peerInstanceId: peerInstanceId(index),
      cursor: 0,
      phase: 'initial',
      logicalTimeMs: 0,
    })
  );
  const planningProposal = proposalFor(
    nominalDefinition.missionIntent,
    owner.peerId,
    owner.peerInstanceId,
    [initialObservations[0]!]
  );
  const preflight = await runCollectiveClosedLoopMeshRuntimeV1({
    schemaVersion: 1,
    missionIntent: nominalDefinition.missionIntent,
    selectionPolicy: nominalDefinition.selectionPolicy,
    mandate: nominalDefinition.mandate,
    peers: nominalDefinition.peers,
    observations: initialObservations,
    planningProposal,
    planningMode: input.runner,
    runner: nominal.runtime,
    seed,
    maximumLogicalTimeMs: MAXIMUM_LOGICAL_TIME_MS,
  });
  // A recovery award must bind to a bid that the owner has already recorded.
  // Choosing the next topology member works only when that peer happened to
  // bid; select a distinct registered bidder instead.
  const ownerState = preflight.meshStates[owner.peerId];
  const eligibleBidders = new Set(
    Object.values(ownerState?.allocation.bidHeads ?? {}).map(
      (bid) => bid.bidderPeerId,
    ),
  );
  const replacementPeerId =
    ownerState?.objectives.objectives[
      nominalDefinition.missionIntent.objective.objectiveId
    ]
      ?.recoveryWitnessPeerIds
      .filter(
        (peerId) =>
          eligibleBidders.has(peerId) &&
          peerId !== preflight.winnerPeerId &&
          peerId !== owner.peerId,
      )
      .sort()[0];
  if (!replacementPeerId)
    throw new RangeError('closed_loop_resilience_replacement_unavailable');

  // Recovery requires a lease-expiry observation. Keep this value in the
  // publicly auditable plan, rather than deriving a hidden future schedule.
  const crashLogicalTimeMs = Math.max(
    preflight.logicalTimeMs + 4,
    preflight.execution.leaseExpiresAtLogical + 60_000
  );
  const faultSchedule = resilienceFaultPlanFor({
    ownerPeerId: owner.peerId,
    failedWinnerPeerId: preflight.winnerPeerId,
    replacementPeerId,
    firstLogicalTimeMs: preflight.logicalTimeMs + 1,
    crashLogicalTimeMs,
  });
  const finalPlannedFault = faultSchedule[faultSchedule.length - 1];
  if (!finalPlannedFault)
    throw new Error('closed_loop_resilience_fault_schedule_missing');
  const recovery = await recoverCollectiveClosedLoopAssignmentV1({
    schemaVersion: 1,
    preEffect: preflight,
    peers: nominalDefinition.peers,
    runner: nominal.runtime,
    missionIntent: nominalDefinition.missionIntent,
    mandate: nominalDefinition.mandate,
    failedWinnerPeerId: preflight.winnerPeerId,
    replacementPeerId,
    // Keep construction in lockstep with the public runner: every scheduled
    // fault is observed before the certificate-backed reassignment begins.
    faultLogicalTimeMs: finalPlannedFault.trigger.logicalTimeMs + 1,
  });
  const actionLogicalTimeMs = recovery.recoveryLogicalTimeMs + 1;
  if (actionLogicalTimeMs > MAXIMUM_RESILIENCE_LOGICAL_TIME_MS)
    throw new RangeError('closed_loop_resilience_logical_time_exceeded');

  const checkpointObservations = peerIds.map((peerId, index) =>
    observationFor({
      missionIntent: nominalDefinition.missionIntent,
      peerId,
      peerInstanceId: peerInstanceId(index),
      cursor: 1,
      phase: 'checkpoint',
      logicalTimeMs: preflight.logicalTimeMs,
    })
  );
  const outcomeObservations = peerIds.map((peerId, index) =>
    observationFor({
      missionIntent: nominalDefinition.missionIntent,
      peerId,
      peerInstanceId: peerInstanceId(index),
      cursor: 2,
      phase: 'outcome',
      logicalTimeMs: actionLogicalTimeMs,
    })
  );
  const resultDigest = digest({ result: 'closed-loop-reference-committed' });
  const inputDigest = asPlanningDigest(actionInputDigest(ACTION_INPUT));
  const effectId = 'effect:closed-loop-resilience-reference';
  const environmentDefinition: CollectiveDeterministicEnvironmentDefinitionV1 =
    {
      schemaVersion: 1,
      environmentId: 'environment:closed-loop-resilience-reference',
      observations: [
        ...initialObservations,
        ...checkpointObservations,
        ...outcomeObservations,
      ],
      effectRules: [
        {
          schemaVersion: 1,
          effectId,
          workItemId: recovery.workContract.assignment.workItemId,
          workItemRevision: recovery.workContract.assignment.workItemRevision,
          workContractId: recovery.workContract.workContractId,
          workContractDigest: recovery.workContract.workContractDigest,
          peerId: recovery.workContract.assignment.assignedPeerId,
          peerInstanceId: recovery.workContract.assignment.assignedInstanceId,
          assignmentEpoch: recovery.workContract.assignment.assignmentEpoch,
          authorityGeneration:
            recovery.workContract.assignment.authorityGeneration,
          fencingToken: recovery.workContract.assignment.fencingToken,
          actionClass: ACTION_CLASS,
          inputDigest,
          outputDigest: resultDigest,
          behavior: 'commit',
          rejectionCode: null,
        },
      ],
      hiddenCanary: HIDDEN_CANARY,
    };
  const registrationDigest = digest({
    registration: 'closed-loop-resilience-reference',
    campaign: 'paired-reference-v1',
    peerCount: input.peerCount,
    seed,
    stratum,
  });
  const monitorPolicy = createCollectiveInvariantMonitorPolicyV1({
    schemaVersion: 1,
    policyId: 'monitor:closed-loop-resilience-reference',
    registrationDigest,
    requiredEffects: [
      { schemaVersion: 1, effectId, outcomeUnits: 1, objectiveValue: 1 },
    ],
    hiddenCanaryDigest: collectiveHiddenCanaryDigestV1(HIDDEN_CANARY),
  });
  const observationPolicyDigest = digest({
    observationPolicy: 'peer-local-cursor-v1',
  });
  const registration = createCollectiveEvaluationRegistrationBindingV1({
    schemaVersion: 1,
    registrationId: `registration:closed-loop-resilience-reference:${input.runner}`,
    registrationDigest,
    tenantId: nominalDefinition.missionIntent.tenantId,
    missionIntentId: nominalDefinition.missionIntent.missionIntentId,
    intentRevision: nominalDefinition.missionIntent.revision,
    intentDigest: nominalDefinition.missionIntent.intentDigest,
    runner: input.runner,
    // The resilience definition wraps a nominal closed-loop definition. The
    // target statistical stratum remains bound by registrationDigest, the
    // fault plan and the outer campaign cell.
    stratum: 'nominal',
    seed,
    environmentDigest: collectiveDeterministicEnvironmentDigestV1(
      environmentDefinition
    ),
    observationPolicyDigest,
    monitorDigest: monitorPolicy.policyDigest,
    hiddenCanaryDigest: collectiveHiddenCanaryDigestV1(HIDDEN_CANARY),
    limits: DEFAULT_COLLECTIVE_EVALUATION_LIMITS_V1,
  });
  const rebuiltNominalDefinition = createCollectiveClosedLoopDefinitionV1({
    schemaVersion: 1,
    registration,
    missionIntent: nominalDefinition.missionIntent,
    selectionPolicy: nominalDefinition.selectionPolicy,
    mandate: nominalDefinition.mandate,
    peers: nominalDefinition.peers,
    maximumLogicalTimeMs: MAXIMUM_RESILIENCE_LOGICAL_TIME_MS,
  });
  const faultPlan = createCollectiveClosedLoopFaultPlanV1({
    schemaVersion: 1,
    nominalDefinitionDigest: rebuiltNominalDefinition.definitionDigest,
    faults: faultSchedule,
  });
  const definition = createCollectiveClosedLoopResilienceDefinitionV1({
    schemaVersion: 1,
    nominalDefinition: rebuiltNominalDefinition,
    faultPlan,
    maximumEpochs: 2,
  });
  const evaluator = createCollectiveClosedLoopEvaluatorV1({
    schemaVersion: 1,
    registration,
    monitorPolicy,
    definition: environmentDefinition,
  });
  const decisionPolicy = sharedDecisionPolicyFor(
    input.runtime ?? nominal.runtime,
    observationPolicyDigest,
    peerIds,
    nominalDefinition.missionIntent.planningLimits.maximumCandidateFragments
  );
  const expectedWorkContractDigest = recovery.workContract.workContractDigest;
  const faultMatrix = resilienceFaultMatrixPortFor({
    preEffect: preflight,
    peerIds,
    ownerPeerId: owner.peerId,
    failedWinnerPeerId: preflight.winnerPeerId,
    replacementPeerId,
    faultPlan: definition.faultPlan.faults,
    seed,
  });

  return Object.freeze({
    schemaVersion: 1,
    definition,
    evaluator,
    runtime: nominal.runtime,
    decisionPolicy,
    faultMatrix,
    replacementPeerId,
    actionClass: ACTION_CLASS,
    resultDigest,
    resultSummary:
      'The recovered protected reference effect committed successfully.',
    async prepareAction(
      context: CollectiveClosedLoopActionPreparationContextV1
    ) {
      if (
        context.workContract.workContractDigest !==
          expectedWorkContractDigest ||
        context.winnerPeerId !==
          recovery.workContract.assignment.assignedPeerId ||
        context.logicalTimeMs !== actionLogicalTimeMs
      )
        throw new Error('closed_loop_resilience_reference_recovery_mismatch');
      return prepareCollectiveClosedLoopReferenceActionV1(context);
    },
  });
}

function resilienceFaultPlanFor(input: {
  readonly ownerPeerId: string;
  readonly failedWinnerPeerId: string;
  readonly replacementPeerId: string;
  readonly firstLogicalTimeMs: number;
  readonly crashLogicalTimeMs: number;
}) {
  const withdrawalAt = input.firstLogicalTimeMs;
  const declineAt = withdrawalAt + 1;
  const crashAt = Math.max(input.crashLogicalTimeMs, declineAt + 2);
  const restartAt = crashAt + 1;
  const partitionAt = restartAt + 1;
  const healAt = partitionAt + 1;
  return Object.freeze([
    {
      schemaVersion: 1 as const,
      faultId: '01-capability-withdrawal',
      family: 'capability.withdraw' as const,
      trigger: {
        schemaVersion: 1 as const,
        kind: 'logical_time' as const,
        logicalTimeMs: withdrawalAt,
        causalEventDigest: null,
      },
      causalPredecessorFaultIds: [],
      links: [],
      targets: [{ schemaVersion: 1 as const, peerId: input.replacementPeerId }],
    },
    {
      schemaVersion: 1 as const,
      faultId: '02-assignment-decline',
      family: 'assignment.decline' as const,
      trigger: {
        schemaVersion: 1 as const,
        kind: 'logical_time' as const,
        logicalTimeMs: declineAt,
        causalEventDigest: null,
      },
      causalPredecessorFaultIds: [],
      links: [],
      targets: [{ schemaVersion: 1 as const, peerId: input.ownerPeerId }],
    },
    {
      schemaVersion: 1 as const,
      faultId: '03-peer-crash',
      family: 'peer.crash' as const,
      trigger: {
        schemaVersion: 1 as const,
        kind: 'logical_time' as const,
        logicalTimeMs: crashAt,
        causalEventDigest: null,
      },
      causalPredecessorFaultIds: [],
      links: [],
      targets: [
        { schemaVersion: 1 as const, peerId: input.failedWinnerPeerId },
      ],
    },
    {
      schemaVersion: 1 as const,
      faultId: '04-peer-restart',
      family: 'peer.restart' as const,
      trigger: {
        schemaVersion: 1 as const,
        kind: 'logical_time' as const,
        logicalTimeMs: restartAt,
        causalEventDigest: null,
      },
      causalPredecessorFaultIds: ['03-peer-crash'],
      links: [],
      targets: [
        { schemaVersion: 1 as const, peerId: input.failedWinnerPeerId },
      ],
    },
    {
      schemaVersion: 1 as const,
      faultId: '05-network-partition',
      family: 'network.partition' as const,
      trigger: {
        schemaVersion: 1 as const,
        kind: 'logical_time' as const,
        logicalTimeMs: partitionAt,
        causalEventDigest: null,
      },
      causalPredecessorFaultIds: [],
      links: [
        {
          schemaVersion: 1 as const,
          fromPeerId: input.ownerPeerId,
          toPeerId: input.replacementPeerId,
        },
      ],
      targets: [],
    },
    {
      schemaVersion: 1 as const,
      faultId: '06-network-heal',
      family: 'network.heal' as const,
      trigger: {
        schemaVersion: 1 as const,
        kind: 'logical_time' as const,
        logicalTimeMs: healAt,
        causalEventDigest: null,
      },
      causalPredecessorFaultIds: ['05-network-partition'],
      links: [
        {
          schemaVersion: 1 as const,
          fromPeerId: input.ownerPeerId,
          toPeerId: input.replacementPeerId,
        },
      ],
      targets: [],
    },
  ]);
}

/**
 * The Matrix is a deterministic driver campaign. It proves each scheduled
 * fault was applied and observed without exposing its future schedule to a
 * planning decision context.
 */
function resilienceFaultMatrixPortFor(input: {
  readonly preEffect: import('./collective-closed-loop-runtime.js').CollectiveClosedLoopPreEffectHandleV1;
  readonly peerIds: readonly string[];
  readonly ownerPeerId: string;
  readonly failedWinnerPeerId: string;
  readonly replacementPeerId: string;
  readonly seed: number;
  readonly faultPlan: readonly {
    readonly faultId: string;
    readonly family: string;
    readonly trigger: { readonly logicalTimeMs: number };
  }[];
}) {
  const fault = (faultId: string) => {
    const value = input.faultPlan.find(
      (candidate) => candidate.faultId === faultId
    );
    if (!value)
      throw new Error(`closed_loop_resilience_fault_missing:${faultId}`);
    return value;
  };
  const withdrawal = fault('01-capability-withdrawal');
  const decline = fault('02-assignment-decline');
  const crash = fault('03-peer-crash');
  const restart = fault('04-peer-restart');
  const partition = fault('05-network-partition');
  const heal = fault('06-network-heal');
  const afterRestart = restart.trigger.logicalTimeMs + 1;
  const afterHeal = heal.trigger.logicalTimeMs + 1;
  const maximumLogicalTime = afterHeal;
  const healthyDriverPeerId = input.peerIds.find(
    (peerId) => peerId !== input.failedWinnerPeerId
  );
  if (!healthyDriverPeerId)
    throw new Error('closed_loop_resilience_fault_driver_missing');
  const event = (
    eventId: string,
    targetPeerId: string,
    logicalTime: number,
    action: ResilienceFaultMatrixActionV1,
    sourcePeerId?: string
  ) =>
    Object.freeze({
      eventId,
      targetPeerId,
      ...(sourcePeerId === undefined
        ? {}
        : { sourcePeerId, scheduledAt: logicalTime }),
      logicalTime,
      priority: 10,
      action,
    });
  const matrixInput: CollectiveClosedLoopFaultMatrixInputV1<
    ResilienceFaultMatrixStateV1,
    ResilienceFaultMatrixActionV1
  > = Object.freeze({
    schemaVersion: 1 as const,
    scenario: {
      schemaVersion: 1 as const,
      scenarioId: 'closed-loop-resilience-reference-fault-matrix-v1',
      seed: input.seed,
      prngVersion: 'xorshift32-v1' as const,
      peers: input.peerIds.map((peerId) => ({
        peerId,
        state: {
          capabilityAvailable: true,
          assignmentDeclined: false,
          offerAttempt: 1,
          deliveryCount: 0,
        },
      })),
      links: [
        {
          fromPeerId: input.ownerPeerId,
          toPeerId: input.replacementPeerId,
          latency: 0,
          enabled: true,
        },
        {
          fromPeerId: input.replacementPeerId,
          toPeerId: input.ownerPeerId,
          latency: 0,
          enabled: true,
        },
        {
          fromPeerId: healthyDriverPeerId,
          toPeerId: input.failedWinnerPeerId,
          latency: 0,
          enabled: true,
        },
      ],
      events: [
        event(
          'fault-event:01-capability-withdrawal',
          input.replacementPeerId,
          withdrawal.trigger.logicalTimeMs,
          { kind: 'capability.withdraw' }
        ),
        event(
          'fault-event:02-assignment-decline',
          input.ownerPeerId,
          decline.trigger.logicalTimeMs,
          { kind: 'assignment.decline' }
        ),
        event(
          'reoffer-after-decline',
          input.ownerPeerId,
          decline.trigger.logicalTimeMs + 1,
          {
            kind: 'assignment.reoffer',
            attempt: 2,
          }
        ),
        event(
          'delivery-during-crash',
          input.failedWinnerPeerId,
          crash.trigger.logicalTimeMs,
          { kind: 'delivery' },
          healthyDriverPeerId
        ),
        event(
          'delivery-after-restart',
          input.failedWinnerPeerId,
          afterRestart,
          { kind: 'delivery' },
          healthyDriverPeerId
        ),
        event(
          'delivery-during-partition',
          input.replacementPeerId,
          partition.trigger.logicalTimeMs,
          { kind: 'delivery' },
          input.ownerPeerId
        ),
        event(
          'delivery-after-heal',
          input.replacementPeerId,
          afterHeal,
          { kind: 'delivery' },
          input.ownerPeerId
        ),
      ],
      faultPlan: {
        schemaVersion: 1 as const,
        faults: [
          {
            faultId: crash.faultId,
            kind: 'peer.crash' as const,
            peerId: input.failedWinnerPeerId,
            logicalTime: crash.trigger.logicalTimeMs,
            priority: -10,
          },
          {
            faultId: restart.faultId,
            kind: 'peer.resume' as const,
            peerId: input.failedWinnerPeerId,
            logicalTime: restart.trigger.logicalTimeMs,
            priority: -10,
          },
          {
            faultId: partition.faultId,
            kind: 'network.partition' as const,
            links: [
              {
                fromPeerId: input.ownerPeerId,
                toPeerId: input.replacementPeerId,
              },
            ],
            logicalTime: partition.trigger.logicalTimeMs,
            priority: -10,
          },
          {
            faultId: heal.faultId,
            kind: 'network.heal' as const,
            links: [
              {
                fromPeerId: input.ownerPeerId,
                toPeerId: input.replacementPeerId,
              },
            ],
            logicalTime: heal.trigger.logicalTimeMs,
            priority: -10,
          },
        ],
      },
      limits: {
        maximumEvents: 32,
        maximumLogicalTime,
        maximumQueuedEvents: 32,
        maximumStateBytes: 64 * 1024,
      },
    },
    runtime: {
      driverId: 'closed-loop-resilience-reference-domain-v1',
      projectionId: 'closed-loop-resilience-reference-projection-v1',
      reduce({
        state,
        action,
      }: {
        readonly state: ResilienceFaultMatrixStateV1;
        readonly action: ResilienceFaultMatrixActionV1;
      }) {
        if (action.kind === 'capability.withdraw')
          return {
            accepted: true,
            state: { ...state, capabilityAvailable: false },
          };
        if (action.kind === 'assignment.decline')
          return {
            accepted: true,
            state: { ...state, assignmentDeclined: true },
          };
        if (action.kind === 'assignment.reoffer')
          return state.assignmentDeclined &&
            action.attempt === state.offerAttempt + 1
            ? {
                accepted: true,
                state: { ...state, offerAttempt: action.attempt },
              }
            : { accepted: false, rejectionCode: 'reoffer_not_causal', state };
        if (action.kind === 'delivery')
          return {
            accepted: true,
            state: { ...state, deliveryCount: state.deliveryCount + 1 },
          };
        throw new TypeError('closed_loop_resilience_unknown_fault_action');
      },
      project(state: ResilienceFaultMatrixStateV1) {
        return state;
      },
    },
    faults: [
      {
        schemaVersion: 1 as const,
        faultId: withdrawal.faultId,
        family: 'capability.withdraw' as const,
        logicalTime: withdrawal.trigger.logicalTimeMs,
        injection: {
          schemaVersion: 1 as const,
          kind: 'reducer_event' as const,
          eventId: 'fault-event:01-capability-withdrawal',
        },
        causalPredecessorFaultId: null,
      },
      {
        schemaVersion: 1 as const,
        faultId: decline.faultId,
        family: 'assignment.decline' as const,
        logicalTime: decline.trigger.logicalTimeMs,
        injection: {
          schemaVersion: 1 as const,
          kind: 'reducer_event' as const,
          eventId: 'fault-event:02-assignment-decline',
        },
        causalPredecessorFaultId: null,
        reofferEventId: 'reoffer-after-decline',
        declinedOfferAttempt: 1,
        reofferAttempt: 2,
      },
      {
        schemaVersion: 1 as const,
        faultId: crash.faultId,
        family: 'peer.crash' as const,
        logicalTime: crash.trigger.logicalTimeMs,
        injection: {
          schemaVersion: 1 as const,
          kind: 'driver_fault' as const,
          simulationFaultId: crash.faultId,
        },
        causalPredecessorFaultId: null,
      },
      {
        schemaVersion: 1 as const,
        faultId: restart.faultId,
        family: 'peer.restart' as const,
        logicalTime: restart.trigger.logicalTimeMs,
        injection: {
          schemaVersion: 1 as const,
          kind: 'driver_fault' as const,
          simulationFaultId: restart.faultId,
        },
        causalPredecessorFaultId: crash.faultId,
      },
      {
        schemaVersion: 1 as const,
        faultId: partition.faultId,
        family: 'network.partition' as const,
        logicalTime: partition.trigger.logicalTimeMs,
        injection: {
          schemaVersion: 1 as const,
          kind: 'driver_fault' as const,
          simulationFaultId: partition.faultId,
        },
        causalPredecessorFaultId: null,
      },
      {
        schemaVersion: 1 as const,
        faultId: heal.faultId,
        family: 'network.heal' as const,
        logicalTime: heal.trigger.logicalTimeMs,
        injection: {
          schemaVersion: 1 as const,
          kind: 'driver_fault' as const,
          simulationFaultId: heal.faultId,
        },
        causalPredecessorFaultId: partition.faultId,
      },
    ],
    observations: [
      {
        faultId: withdrawal.faultId,
        observe({
          trace,
        }: {
          readonly trace: {
            readonly peerStates: Readonly<
              Record<string, { readonly capabilityAvailable: boolean }>
            >;
          };
        }) {
          return (
            trace.peerStates[input.replacementPeerId]?.capabilityAvailable ===
            false
          );
        },
      },
      {
        faultId: decline.faultId,
        observe({
          trace,
        }: {
          readonly trace: {
            readonly peerStates: Readonly<
              Record<string, { readonly offerAttempt: number }>
            >;
          };
        }) {
          return trace.peerStates[input.ownerPeerId]?.offerAttempt === 2;
        },
      },
      {
        faultId: crash.faultId,
        observe({
          trace,
        }: {
          readonly trace: {
            readonly faults: readonly {
              readonly faultId: string;
              readonly affectedEventIds: readonly string[];
            }[];
          };
        }) {
          return trace.faults.some(
            (record) =>
              record.faultId === crash.faultId &&
              record.affectedEventIds.includes('delivery-during-crash')
          );
        },
      },
      {
        faultId: restart.faultId,
        observe({
          trace,
        }: {
          readonly trace: {
            readonly records: readonly {
              readonly eventId: string;
              readonly accepted: boolean;
            }[];
          };
        }) {
          return trace.records.some(
            (record) =>
              record.eventId === 'delivery-after-restart' && record.accepted
          );
        },
      },
      {
        faultId: partition.faultId,
        observe({
          trace,
        }: {
          readonly trace: {
            readonly faults: readonly {
              readonly faultId: string;
              readonly affectedEventIds: readonly string[];
            }[];
          };
        }) {
          return trace.faults.some(
            (record) =>
              record.faultId === partition.faultId &&
              record.affectedEventIds.includes('delivery-during-partition')
          );
        },
      },
      {
        faultId: heal.faultId,
        observe({
          trace,
        }: {
          readonly trace: {
            readonly records: readonly {
              readonly eventId: string;
              readonly accepted: boolean;
            }[];
          };
        }) {
          return trace.records.some(
            (record) =>
              record.eventId === 'delivery-after-heal' && record.accepted
          );
        },
      },
    ],
  });
  return createCollectiveClosedLoopFaultMatrixPortV1(
    matrixInput,
    createCollectiveClosedLoopFaultMatrixMissionBindingV1({
      preEffect: input.preEffect,
      replacementPeerId: input.replacementPeerId,
    })
  );
}

function assertRunner(value: CollectiveEvaluationRunnerV2): void {
  if (value !== 'adaptive_collective' && value !== 'centralized_planner')
    throw new TypeError('closed_loop_reference_runner_invalid');
}

function assertPeerCount(value: number): void {
  if (
    !Number.isSafeInteger(value) ||
    value < MINIMUM_PEERS ||
    value > MAXIMUM_PEERS
  )
    throw new RangeError('closed_loop_reference_peer_count_invalid');
}

function referenceSeed(value: number | undefined): number {
  const seed = value ?? SEED;
  if (!Number.isSafeInteger(seed) || seed < 0)
    throw new TypeError('closed_loop_reference_seed_invalid');
  return seed;
}

function referenceStratum(
  value: 'nominal' | 'benign' | 'adversarial' | 'mixed' | undefined
): 'nominal' | 'benign' | 'adversarial' | 'mixed' {
  const stratum = value ?? 'nominal';
  if (!['nominal', 'benign', 'adversarial', 'mixed'].includes(stratum))
    throw new TypeError('closed_loop_reference_stratum_invalid');
  return stratum;
}

function peerIdsFor(peerCount: number): readonly string[] {
  return Object.freeze(
    Array.from(
      { length: peerCount },
      (_, index) => `peer:${String(index).padStart(3, '0')}`
    )
  );
}

function peerInstanceId(index: number): string {
  return `instance:${String(index).padStart(3, '0')}`;
}

function peersFor(peerIds: readonly string[]) {
  const ownerNeighbors = peerIds.slice(1);
  return Object.freeze(
    peerIds.map((peerId, index) =>
      Object.freeze({
        schemaVersion: 1 as const,
        peerId,
        peerInstanceId: peerInstanceId(index),
        capabilityKeys: Object.freeze(['capability.execute']),
        neighborPeerIds: Object.freeze(
          index === 0
            ? [...ownerNeighbors]
            : ownerNeighbors.includes(peerId)
              ? [peerIds[0]]
              : []
        ),
      })
    )
  );
}

function selectionPolicyFor() {
  return createPlanSelectionPolicyV1({
    schemaVersion: 1,
    selectionPolicyId: 'selection:closed-loop-reference',
    revision: 1,
    scoringDimensions: [
      {
        schemaVersion: 1,
        dimension: 'outcome_coverage',
        weight: 1,
        direction: 'maximize',
      },
    ],
    hardConstraintKeys: ['budget'],
    acceptanceScoreThreshold: 1,
    challengeScoreThreshold: 0,
    tieBreakOrder: [
      'score',
      'requested_budget_units',
      'work_deadline',
      'proposed_at_logical_ms',
      'proposal_digest',
    ],
  });
}

function mandateFor(peerIds: readonly string[]) {
  const statement = {
    schemaVersion: 1 as const,
    mandateId: 'mandate:closed-loop-reference',
    tenantId: 'tenant:closed-loop-reference',
    policyDomainId: 'policy-domain:closed-loop-reference',
    issuerId: peerIds[0],
    revision: 1,
    predecessorDigest: null,
    subjectPeerIds: [...peerIds],
    objective: {
      schemaVersion: 1 as const,
      meshId: 'mesh:closed-loop-reference',
      objectiveId: 'objective:closed-loop-reference',
      objectiveDocumentId: 'objective-document:closed-loop-reference',
      minimumObjectiveRevision: 1,
      maximumObjectiveRevision: 1,
    },
    work: {
      schemaVersion: 1 as const,
      workItemIds: [],
      permittedRoleKeys: ['executor'],
      maximumWorkItemRevision: 1,
    },
    permittedCapabilityKeys: ['capability.execute'],
    permittedActions: [
      {
        schemaVersion: 1 as const,
        namespace: 'resources',
        toolId: 'allocator',
        operation: 'commit',
      },
    ],
    budget: {
      schemaVersion: 1 as const,
      totalBudgetUnits: 10_000,
      maximumWorkBudgetUnits: 100,
      maximumActionBudgetUnits: 10,
      maximumConcurrentWorkReservations: 500,
      maximumConcurrentActionReservations: 500,
      reservationLifetimeMs: 60_000,
    },
    validFrom: VALID_FROM,
    validUntil: VALID_UNTIL,
    roomProvenance: null,
    evidence: {
      schemaVersion: 1 as const,
      redactionPolicyId: 'redaction:closed-loop-reference',
      retentionClass: 'evaluation',
      requireDurablePreDispatchEvidence: true,
    },
  };
  const mandateDigest = delegationMandateDigestV1(statement);
  return createDelegationMandateV1({
    statement,
    proof: {
      schemaVersion: 1,
      kind: 'local_attestation',
      issuerId: statement.issuerId,
      attestorId: 'attestor:closed-loop-reference',
      attestationId: 'attestation:closed-loop-reference',
      signedDigest: mandateDigest,
    },
  });
}

function missionIntentFor(
  selectionPolicyDigest: PlanningDigestV1,
  mandate: ReturnType<typeof mandateFor>
) {
  return createMissionIntentV1({
    schemaVersion: 1,
    missionIntentId: 'mission:closed-loop-reference',
    revision: 1,
    predecessorDigest: null,
    tenantId: mandate.statement.tenantId,
    policyDomainId: mandate.statement.policyDomainId,
    objective: {
      schemaVersion: 1,
      meshId: mandate.statement.objective.meshId,
      objectiveId: mandate.statement.objective.objectiveId,
      objectiveDocumentId: mandate.statement.objective.objectiveDocumentId,
      objectiveRevision: 1,
      acceptedPolicyDigest: digest({ objective: 'closed-loop-reference' }),
    },
    mandateDigest: mandate.mandateDigest,
    outcomeStatements: ['outcome.complete'],
    permittedResourceClasses: ['resource.compute'],
    permittedCapabilityKeys: ['capability.execute'],
    planningLimits: {
      schemaVersion: 1,
      maximumCandidateFragments: 32,
      maximumActiveFragments: 4,
      maximumFragmentsPerPeer: 4,
      maximumRevisionsPerSemanticSlot: 8,
      maximumDependencyDepth: 4,
      maximumDependencyFanout: 2,
      maximumCapabilityTerms: 4,
      maximumOutcomeTerms: 4,
      maximumProposalBytes: 16_384,
      maximumSnapshotBytes: 131_072,
      maximumTraceBytes: 131_072,
      // The equal-subject shard policy must fund the fixed 10-unit proposal
      // for every supported peer at the largest registered scale.
      maximumTotalPlanningBudgetUnits: MAXIMUM_PEERS * 10,
      maximumFragmentBudgetUnits: 100,
      budgetShardPolicy: 'equal_mandate_subjects',
      maximumConcurrentProposals: 4,
      maximumActiveRoles: 4,
      proposalLogicalWindowMs: 20,
      observationLogicalWindowMs: 20,
      replanningLogicalWindowMs: 20,
    },
    selectionPolicyDigest,
    validFrom: mandate.statement.validFrom,
    validUntil: mandate.statement.validUntil,
  });
}

function observationFor(input: {
  readonly missionIntent: MissionIntentV1;
  readonly peerId: string;
  readonly peerInstanceId: string;
  readonly cursor: number;
  readonly phase: 'initial' | 'checkpoint' | 'outcome';
  readonly logicalTimeMs: number;
}) {
  return createMissionObservationV1({
    schemaVersion: 1,
    observationId: `observation:${input.peerId}:${input.phase}:1`,
    missionIntentId: input.missionIntent.missionIntentId,
    intentRevision: input.missionIntent.revision,
    intentDigest: input.missionIntent.intentDigest,
    observerPeerId: input.peerId,
    observerInstanceId: input.peerInstanceId,
    environmentCursor: `cursor:${input.cursor}`,
    logicalTimeMs: input.logicalTimeMs,
    visibility: 'public',
    observationKind: `execution.${input.phase}`,
    publicValue: {
      phase: input.phase,
      available: true,
    },
    contentReferenceDigest: null,
  });
}

function proposalFor(
  missionIntent: MissionIntentV1,
  peerId: string,
  peerInstanceId: string,
  observations: readonly MissionObservationV1[]
) {
  return createPlanFragmentProposalV1({
    schemaVersion: 1,
    proposalRevision: 1,
    missionIntentId: missionIntent.missionIntentId,
    intentRevision: missionIntent.revision,
    intentDigest: missionIntent.intentDigest,
    proposerPeerId: peerId,
    proposerInstanceId: peerInstanceId,
    semanticSlotKey: 'slot:closed-loop-reference',
    predecessorFragmentDigest: null,
    parentFragmentDigests: [],
    dependencyFragmentDigests: [],
    outcomeStatements: ['outcome.complete'],
    roleKey: 'executor',
    requiredCapabilityKeys: ['capability.execute'],
    inputReferenceDigest: digest({ input: 'closed-loop-reference' }),
    basisObservationDigests: observations
      .map((observation) => observation.observationDigest)
      .sort(),
    requestedBudgetUnits: 10,
    workDeadline: '2026-08-01T02:00:00.000Z',
    proposedAtLogicalMs: 0,
  });
}

function decisionPolicyFor(
  policyDigest: PlanningDigestV1,
  peerIds: readonly string[],
  maximumCentralizedObservations: number
) {
  return Object.freeze({
    policyId: 'decision-policy:peer-local-reference',
    policyVersion: 1,
    policyDigest,
    decide(
      context: Parameters<
        CollectiveClosedLoopExecutionInputV1['decisionPolicy']['decide']
      >[0]
    ) {
      if (context.peerId !== 'peer:000')
        return Object.freeze({
          schemaVersion: 1 as const,
          kind: 'abstain' as const,
          reasonCode: 'local_no_proposal',
        });
      const observation = context.observations[0];
      if (!observation)
        return Object.freeze({
          schemaVersion: 1 as const,
          kind: 'abstain' as const,
          reasonCode: 'local_observation_missing',
        });
      return Object.freeze({
        schemaVersion: 1 as const,
        kind: 'proposal' as const,
        proposal: proposalFor(
          context.missionIntent,
          context.peerId,
          context.peerInstanceId,
          [observation]
        ),
      });
    },
    decideCentralized(
      context: Parameters<
        CollectiveClosedLoopExecutionInputV1['decisionPolicy']['decideCentralized']
      >[0]
    ) {
      const observedPeers = new Set(
        context.observations.map((observation) => observation.observerPeerId)
      );
      if (
        observedPeers.size !==
          Math.min(peerIds.length, maximumCentralizedObservations) ||
        peerIds
          .slice(0, maximumCentralizedObservations)
          .some((peerId) => !observedPeers.has(peerId))
      )
        return Object.freeze({
          schemaVersion: 1 as const,
          kind: 'abstain' as const,
          reasonCode: 'central_observation_set_incomplete',
        });
      const ownerObservation = context.observations.find(
        (observation) =>
          observation.observerPeerId === context.ownerPeerId &&
          observation.observerInstanceId === context.ownerPeerInstanceId
      );
      if (!ownerObservation)
        return Object.freeze({
          schemaVersion: 1 as const,
          kind: 'abstain' as const,
          reasonCode: 'central_owner_observation_missing',
        });
      return Object.freeze({
        schemaVersion: 1 as const,
        kind: 'proposal' as const,
        proposal: proposalFor(
          context.missionIntent,
          context.ownerPeerId,
          context.ownerPeerInstanceId,
          [ownerObservation]
        ),
      });
    },
  });
}

function sharedDecisionPolicyFor(
  runtime: object,
  policyDigest: PlanningDigestV1,
  peerIds: readonly string[],
  maximumCentralizedObservations: number
): ReturnType<typeof decisionPolicyFor> {
  let policies = referenceDecisionPolicies.get(runtime);
  if (!policies) {
    policies = new Map();
    referenceDecisionPolicies.set(runtime, policies);
  }
  const key = `${policyDigest}\u0000${peerIds.join('\u0000')}\u0000${maximumCentralizedObservations}`;
  const existing = policies.get(key);
  if (existing) return existing;
  const created = decisionPolicyFor(
    policyDigest,
    peerIds,
    maximumCentralizedObservations
  );
  policies.set(key, created);
  return created;
}

/** Builds the deterministic governed-action inputs for a current Work Contract. */
export function prepareCollectiveClosedLoopReferenceActionV1(
  context: CollectiveClosedLoopActionPreparationContextV1
): CollectiveClosedLoopPreparedActionV1 {
  const actionBinding = actionBindingFor();
  const mesh = meshScopeFor(context.workContract);
  const trust = trustFor(context.workContract, context.logicalTimeMs);
  const inference = inferenceFor(
    context.workContract,
    mesh,
    actionBinding,
    context.logicalTimeMs
  );
  return Object.freeze({
    actionBinding,
    actionInput: ACTION_INPUT,
    trustState: trust.state,
    trustRequest: trust.request,
    inferenceState: inference.state,
    assessmentRequest: inference.assessmentRequest,
    assessment: inference.assessment,
    actionGrant: inference.actionGrant,
    gatewayId: 'gateway:closed-loop-reference',
    reservationId: 'reservation:closed-loop-reference',
    permitId: 'permit:closed-loop-reference',
    decisionId: 'decision:closed-loop-reference',
  });
}

/** Detached public action input used by reference effect rules. */
export function collectiveClosedLoopReferenceActionInputV1(): ControlJsonObject {
  return ACTION_INPUT;
}

function actionBindingFor(): ActionBinding {
  return Object.freeze({
    schemaVersion: 1,
    actionBindingId: 'binding:closed-loop-reference',
    actionBindingVersion: 1,
    namespace: 'resources',
    toolId: 'allocator',
    operation: 'commit',
    dispatcherId: 'dispatcher:closed-loop-reference',
    dispatcherVersion: 1,
    contextResolverId: 'context:closed-loop-reference',
    contextResolverVersion: 1,
    fencingMode: 'downstream_atomic',
    handlerDigest: controlDigest('handler-binding', {
      handler: 'closed-loop-reference',
    }),
  });
}

function meshScopeFor(work: WorkContractV1): ControlScopeV1 {
  return Object.freeze({
    schemaVersion: 1,
    kind: 'coordinated',
    tenantId: work.tenantId,
    runId: 'run:closed-loop-reference',
    agentId: `agent:${work.assignment.assignedPeerId}`,
    policyId: work.inferencePolicyId,
    policyVersion: 1,
    meshId: work.objective.meshId,
    objectiveId: work.objective.objectiveId,
    objectiveRevision: work.objective.objectiveRevision,
    workItemId: work.assignment.workItemId,
    workItemRevision: work.assignment.workItemRevision,
    peerId: work.assignment.assignedPeerId,
    instanceId: work.assignment.assignedInstanceId,
    assignmentAuthorityId: work.assignment.assignmentAuthorityId,
    assignmentEpoch: work.assignment.assignmentEpoch,
    fencingToken: work.assignment.fencingToken,
    leaseExpiresAtLogicalMs: work.assignment.leaseExpiresAtLogicalMs,
    authorityGeneration: work.assignment.authorityGeneration,
    objectiveTerminal: false,
    workTerminal: false,
  });
}

function trustFor(work: WorkContractV1, logicalTimeMs: number) {
  const subject = {
    schemaVersion: 1 as const,
    kind: 'peer' as const,
    peerId: work.assignment.assignedPeerId,
  };
  const trustScope = {
    schemaVersion: 1 as const,
    kind: 'work' as const,
    tenantId: work.tenantId,
    meshId: work.objective.meshId,
    objectiveId: work.objective.objectiveId,
    objectiveRevision: work.objective.objectiveRevision,
    workItemId: work.assignment.workItemId,
    workItemRevision: work.assignment.workItemRevision,
    assignmentEpoch: work.assignment.assignmentEpoch,
    assignmentAuthorityId: work.assignment.assignmentAuthorityId,
    fencingToken: work.assignment.fencingToken,
  };
  const policy = createEvidenceFusionPolicyV1({
    schemaVersion: 1,
    policyId: work.trustPolicyId,
    policyVersion: 1,
    parentPolicyDigest: null,
    mode: 'restrict',
    dimensions: [
      {
        dimensionId: 'integrity',
        priorScoreBasisPoints: 5000,
        priorWeightBasisPoints: 1,
        minimumUncertaintyBasisPoints: 0,
        coverageTargetBasisPoints: 1,
        decayIntervalMs: 1,
        decayBasisPointsPerInterval: 1,
        uncertaintyGrowthBasisPointsPerInterval: 1,
        minimumRetainedWeightBasisPoints: 1,
        contradictionUncertaintyBasisPointsPerClaim: 1,
        maximumContradictionUncertaintyBasisPoints: 1000,
        degradedScoreAtOrBelowBasisPoints: 2000,
        degradedUncertaintyAtOrAboveBasisPoints: 8000,
      },
    ],
    criteria: [
      {
        criterionId: 'criterion:integrity',
        dimensionId: 'integrity',
        satisfiedValueBasisPoints: 10000,
        violatedValueBasisPoints: 0,
        inconclusiveValueBasisPoints: null,
        baseWeightBasisPoints: 1000,
        maximumClaimWeightBasisPoints: 1000,
        maximumSourceGroupContributionWeightBasisPoints: 1000,
        minimumSupportGroups: 1,
        minimumSupportWeightBasisPoints: 1,
        minimumContradictionGroups: 1,
        minimumContradictionWeightBasisPoints: 1,
        allowClaimSourceAttestation: false,
        contentRequired: false,
        quarantineEligible: false,
        recoveryEligible: false,
        maximumAgeMs: 10_000,
        claimAuthority: {
          allowedSourceRelations: ['subject_self'],
          allowedBasisReferences: [
            {
              kind: 'external',
              referenceType: 'root',
              minimumCount: 1,
              maximumCount: 1,
            },
          ],
        },
        challengeAuthority: {
          allowedSourceRelations: ['target_author'],
          allowedBasisReferences: [
            {
              kind: 'external',
              referenceType: 'root',
              minimumCount: 1,
              maximumCount: 1,
            },
          ],
          requireResolvedBasis: true,
        },
        challengeResolution: {
          minimumCorroboratingGroups: 1,
          minimumCorroboratingWeightBasisPoints: 1,
          minimumOpposingGroups: 1,
          minimumOpposingWeightBasisPoints: 1,
        },
      },
    ],
    sourceBindings: [
      {
        sourceId: work.assignment.assignedPeerId,
        sourceKind: 'peer',
        dependencyGroupId: 'group:closed-loop-reference',
        roles: ['challenge', 'claim'],
        maximumWeightBasisPoints: 1000,
        validFromLogicalMs: 0,
        validUntilLogicalMs: MAXIMUM_RESILIENCE_LOGICAL_TIME_MS,
      },
    ],
    dependencyGroups: [
      {
        dependencyGroupId: 'group:closed-loop-reference',
        maximumAttestationWeightPerClaimBasisPoints: 1000,
        maximumProfileWeightPerDimensionCriterionBasisPoints: 1000,
      },
    ],
    eligibilityRules: [
      {
        ruleId: 'permit',
        maximumProfileAgeMs: MAXIMUM_RESILIENCE_LOGICAL_TIME_MS,
        requirements: [
          {
            dimensionId: 'integrity',
            minimumScoreBasisPoints: 4000,
            maximumUncertaintyBasisPoints: 10000,
          },
        ],
      },
    ],
    quarantinePolicy: {
      enabled: false,
      rules: [],
      maximumActiveRecords: 1,
    },
    recoveryPolicy: { rules: [] },
    limits: EVIDENCE_TRUST_LIMITS_V1,
    diagnosticsPolicyId: 'diagnostics:closed-loop-reference',
    redactionPolicyId: 'redaction:closed-loop-reference',
  });
  const policyDigest = digestEvidenceFusionPolicyV1(policy);
  let state = reduceEvidenceTrustStateV1(
    createEvidenceTrustStateV1({ stateId: 'trust:closed-loop-reference' }),
    { schemaVersion: 1, kind: 'policy_registered', policy, logicalTimeMs: 0 }
  ).state;
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: 'fusion_evaluated',
    request: {
      tenantId: trustScope.tenantId,
      subject,
      scope: trustScope,
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      policyDigest,
      dependencyBindingDigests: [],
    },
    logicalTimeMs: 0,
  }).state;
  const fusion = state.fusionDecisions[0];
  if (!fusion) throw new Error('closed_loop_reference_trust_fusion_missing');
  state = reduceEvidenceTrustStateV1(state, {
    schemaVersion: 1,
    kind: 'profile_evaluated',
    fusionDecisionId: fusion.fusionDecisionId,
    fusionDecisionDigest: fusion.fusionDecisionDigest,
    logicalTimeMs: 0,
  }).state;
  const profile = state.profiles[0];
  const rule = policy.eligibilityRules[0];
  if (!profile || !rule)
    throw new Error('closed_loop_reference_trust_profile_missing');
  if (logicalTimeMs >= rule.maximumProfileAgeMs)
    throw new RangeError('closed_loop_reference_trust_expired');
  return {
    state,
    request: createTrustEligibilityRequestV1({
      schemaVersion: 1,
      tenantId: profile.tenantId,
      subject: profile.subject,
      subjectDigest: digestSubjectV1(profile.subject),
      scope: profile.scope,
      scopeDigest: digestScopeV1(profile.scope),
      policyId: profile.policyId,
      policyVersion: profile.policyVersion,
      policyDigest: profile.policyDigest,
      profileId: profile.profileId,
      profileDigest: profile.profileDigest,
      maximumProfileAgeMs: rule.maximumProfileAgeMs,
      requirements: rule.requirements,
    }),
  };
}

function inferenceFor(
  work: WorkContractV1,
  controlScope: ControlScopeV1,
  actionBinding: ActionBinding,
  logicalTimeMs: number
) {
  if (controlScope.kind !== 'coordinated')
    throw new Error('closed_loop_reference_scope_invalid');
  const registry = new CapabilityRegistryV1();
  const descriptor = {
    schemaVersion: 1 as const,
    capabilityId: 'capability:closed-loop-reference',
    descriptorVersion: 1,
    inputInspection: 'full' as const,
    finalOutputAssessment: 'full' as const,
    incrementalOutputAssessment: 'none' as const,
    releaseInterruption: 'local' as const,
    toolInterception: 'all' as const,
    messageInterception: 'none' as const,
    representationAccess: 'opaque' as const,
    declarationSource: 'wrapper' as const,
    assurance: 'reference_tested' as const,
    wrapperId: 'wrapper:closed-loop-reference',
    wrapperVersion: 1,
  };
  const handle = registry.register({
    descriptor,
    wrapperInstanceId: 'instance:closed-loop-reference',
  });
  const policy = {
    schemaVersion: 1 as const,
    policyId: work.inferencePolicyId,
    policyVersion: 1,
    parentPolicyDigest: null,
    mode: 'observe' as const,
    outputRisk: 'low' as const,
    checkpoints: ['pre_tool' as const],
    requiredCapabilities: [
      { kind: 'tool_interception' as const, value: 'all' as const },
    ],
    minimumCapabilityAssurance: 'verified' as const,
    allowedCapabilityBindings: [
      {
        schemaVersion: 1 as const,
        capabilityId: descriptor.capabilityId,
        descriptorVersion: 1,
        wrapperId: descriptor.wrapperId,
        wrapperVersion: 1,
        descriptorDigest: handle.descriptorDigest,
        requiredAssurance: 'reference_tested' as const,
      },
    ],
    allowedContextZones: ['user_untrusted' as const],
    allowedTransformerBindings: [],
    allowedActions: [
      {
        schemaVersion: 1 as const,
        namespace: actionBinding.namespace,
        toolId: actionBinding.toolId,
        operation: actionBinding.operation,
        actionBindingId: actionBinding.actionBindingId,
        minimumActionBindingVersion: 1,
      },
    ],
    allowedMessageChannels: [],
    assessmentBindings: [
      {
        schemaVersion: 1 as const,
        checkpoint: 'pre_tool' as const,
        assessorId: 'assessor:closed-loop-reference',
        assessorVersion: 1,
        assessorBindingDigest: `sha256:${'1'.repeat(64)}` as const,
        maximumResponseBytes: 2048,
        maximumEvidenceReferences: 1,
        timeoutMs: 1_000,
      },
    ],
    budgets: { revisions: 0, retries: 0, challenges: 0 },
    limits: INFERENCE_CONTROL_LIMITS_V1,
    maximumRunDurationMs: MAXIMUM_RESILIENCE_LOGICAL_TIME_MS,
    maximumAssessmentTtlMs: 1_000,
    maximumGrantTtlMs: 1_000,
    maximumMessagePermitTtlMs: 1_000,
    exhaustedDisposition: 'deny' as const,
    coordinatedActionsRequired: true,
    diagnosticsPolicyId: 'diagnostics:closed-loop-reference',
    redactionPolicyId: 'redaction:closed-loop-reference',
  };
  const policyRecord = createPolicyRecordV1(policy);
  let state = createInferenceControlStateV1({
    stateId: 'inference:closed-loop-reference',
    tenantId: work.tenantId,
  });
  const reduce = (value: Record<string, unknown>, withRegistry = false) => {
    const result = reduceInferenceControlStateV1(
      state,
      {
        schemaVersion: 1,
        expectedStateGeneration: state.stateGeneration,
        ...value,
      } as Parameters<typeof reduceInferenceControlStateV1>[1],
      withRegistry ? { capabilityRegistry: registry } : undefined
    );
    if (!result.accepted)
      throw new Error(`closed_loop_reference_inference_${result.reasonCode}`);
    state = result.state;
  };
  reduce({
    inputId: 'inference:policy:closed-loop-reference',
    type: 'policy_registered',
    policy,
    policyDigest: policyRecord.policyDigest,
    logicalTimeMs: 0,
  });
  const run = {
    schemaVersion: 1 as const,
    runId: controlScope.runId,
    tenantId: controlScope.tenantId,
    policyDigest: policyRecord.policyDigest,
    capabilityDescriptorDigest: handle.descriptorDigest,
    capabilityHandleId: null,
    scope: controlScope,
    generation: 1,
    phase: 'created' as const,
    createdAtLogicalMs: 0,
    deadlineAtLogicalMs: logicalTimeMs + 1_000,
    dispositionCounts: { revisions: 0, retries: 0, challenges: 0 },
    contextEntryIds: [],
    assessmentRequestIds: [],
    assessmentIds: [],
    streamIds: [],
    grantIds: [],
    messageAttemptIds: [],
    outputDigest: null,
    releasedBytes: 0,
    terminalReasonCode: null,
  };
  reduce({
    inputId: 'inference:run:closed-loop-reference',
    type: 'run_created',
    run,
    logicalTimeMs: 0,
  });
  const negotiation = negotiateCapabilitiesV1(descriptor, {
    policyDigest: policyRecord.policyDigest,
    descriptorDigest: handle.descriptorDigest,
    mode: policy.mode,
    checkpoints: policy.checkpoints,
    requiredCapabilities: policy.requiredCapabilities,
    minimumCapabilityAssurance: policy.minimumCapabilityAssurance,
    allowedCapabilityBindings: policy.allowedCapabilityBindings,
  });
  reduce(
    {
      inputId: 'inference:capability:closed-loop-reference',
      type: 'capability_negotiated',
      runId: run.runId,
      capabilityHandleId: handle.capabilityHandleId,
      descriptorDigest: handle.descriptorDigest,
      result: negotiation,
      logicalTimeMs: 0,
    },
    true
  );
  const targetDigest = digest({ target: 'action:closed-loop-reference' });
  const expiresAtLogicalMs = logicalTimeMs + 500;
  const assessmentRequest = {
    schemaVersion: 1 as const,
    assessmentRequestId: 'assessment-request:closed-loop-reference',
    requestGeneration: 1,
    runId: run.runId,
    tenantId: run.tenantId,
    policyId: policy.policyId,
    policyVersion: 1,
    checkpoint: 'pre_tool' as const,
    assessorId: 'assessor:closed-loop-reference',
    assessorVersion: 1,
    targetKind: 'action' as const,
    targetDigest,
    contextEntryIds: [],
    zoneDigest: digest({ zone: 'closed-loop-reference' }),
    provenanceDigest: digest({ provenance: 'closed-loop-reference' }),
    scope: controlScope,
    createdAtLogicalMs: logicalTimeMs,
    expiresAtLogicalMs,
    status: 'pending' as const,
  };
  const assessment = {
    schemaVersion: 1 as const,
    assessmentId: 'assessment:closed-loop-reference',
    assessmentRequestId: assessmentRequest.assessmentRequestId,
    requestGeneration: 1,
    runId: run.runId,
    tenantId: run.tenantId,
    policyId: policy.policyId,
    policyVersion: 1,
    checkpoint: 'pre_tool' as const,
    assessorId: assessmentRequest.assessorId,
    assessorVersion: assessmentRequest.assessorVersion,
    targetKind: 'action' as const,
    targetDigest,
    zoneDigest: assessmentRequest.zoneDigest,
    provenanceDigest: assessmentRequest.provenanceDigest,
    scope: controlScope,
    disposition: 'allow' as const,
    reasonCodes: ['assessment_required'] as const,
    uncertaintyBasisPoints: 0,
    evidenceReferences: [],
    revisedContent: null,
    challenge: null,
    assessedAtLogicalMs: logicalTimeMs,
    expiresAtLogicalMs,
  };
  const provisional = {
    schemaVersion: 1 as const,
    grantId: 'grant:closed-loop-reference',
    runId: run.runId,
    stateGeneration: state.stateGeneration + 2,
    scope: controlScope,
    scopeDigest: scopeDigest(controlScope as ActionScope),
    namespace: actionBinding.namespace,
    toolId: actionBinding.toolId,
    operation: actionBinding.operation,
    actionBindingId: actionBinding.actionBindingId,
    actionBindingVersion: actionBinding.actionBindingVersion,
    handlerDigest: actionBinding.handlerDigest,
    inputDigest: actionInputDigest(ACTION_INPUT),
    actionDigest: '',
    assessmentRequestId: assessmentRequest.assessmentRequestId,
    assessmentId: assessment.assessmentId,
    assessmentTargetDigest: targetDigest,
    idempotencyKey: 'effect:closed-loop-reference',
    issuedAtLogicalMs: logicalTimeMs,
    expiresAtLogicalMs,
    singleUse: true as const,
    status: 'issued' as const,
    reservation: null,
  };
  return {
    state,
    assessmentRequest,
    assessment,
    actionGrant: {
      ...provisional,
      actionDigest: actionDigest(provisional, actionBinding),
    },
  };
}

function digest(value: PlanningJson): PlanningDigestV1 {
  return digestPlanningJsonV1('environment-state-v1', value);
}

function asPlanningDigest(value: string): PlanningDigestV1 {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError('closed_loop_reference_digest_invalid');
  return value as PlanningDigestV1;
}

function zeroDigest(): PlanningDigestV1 {
  return `sha256:${'0'.repeat(64)}` as PlanningDigestV1;
}
