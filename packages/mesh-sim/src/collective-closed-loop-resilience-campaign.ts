import {
  deepFreezePlanning,
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from '@agentplat/collective-planning';
import {
  runAdaptiveCollectiveClosedLoopResilienceV1,
  runCentralizedPlannerClosedLoopResilienceV1,
  type CollectiveClosedLoopResilienceExecutionInputV1,
  type CollectiveClosedLoopResilienceExecutionResultV1,
  type CollectiveClosedLoopResilienceReplayResultV1,
} from './collective-closed-loop-runner.js';

export interface CollectiveClosedLoopPairedResilienceCampaignInputV1 {
  readonly schemaVersion: 1;
  readonly createAdaptiveInput:
    | (() => CollectiveClosedLoopResilienceExecutionInputV1)
    | (() => Promise<CollectiveClosedLoopResilienceExecutionInputV1>);
  readonly createCentralizedInput:
    | (() => CollectiveClosedLoopResilienceExecutionInputV1)
    | (() => Promise<CollectiveClosedLoopResilienceExecutionInputV1>);
}

export interface CollectiveClosedLoopPairedResilienceCampaignResultV1 {
  readonly schemaVersion: 1;
  readonly matched: true;
  readonly fairnessDigest: PlanningDigestV1;
  readonly publicObservationDigest: PlanningDigestV1;
  readonly adaptive: CollectiveClosedLoopResilienceReplayResultV1;
  readonly centralized: CollectiveClosedLoopResilienceReplayResultV1;
}

/**
 * Runs a construction-fair adaptive/centralized pair and exact replay for
 * each runner. Static inputs are compared before execution. Afterwards, the
 * complete public observation streams must match byte-for-byte by digest.
 */
export async function runPairedCollectiveClosedLoopResilienceCampaignV1(
  input: CollectiveClosedLoopPairedResilienceCampaignInputV1
): Promise<CollectiveClosedLoopPairedResilienceCampaignResultV1> {
  assertPairInput(input);
  const [adaptiveInput, centralizedInput] = await Promise.all([
    input.createAdaptiveInput(),
    input.createCentralizedInput(),
  ]);
  const decisionPolicy = adaptiveInput.decisionPolicy;
  const decide = decisionPolicy.decide;
  const decideCentralized = decisionPolicy.decideCentralized;
  assertDecisionPolicyImplementation(
    centralizedInput,
    decisionPolicy,
    decide,
    decideCentralized
  );
  const fairnessDigest = fairnessDigestFor(adaptiveInput);
  if (fairnessDigestFor(centralizedInput) !== fairnessDigest)
    throw new TypeError('closed_loop_resilience_pair_not_fair');

  const [adaptiveFirst, centralizedFirst] = await Promise.all([
    runAdaptiveCollectiveClosedLoopResilienceV1(adaptiveInput),
    runCentralizedPlannerClosedLoopResilienceV1(centralizedInput),
  ]);
  const publicObservationDigest = assertPublicObservationsMatch(
    adaptiveFirst,
    centralizedFirst
  );
  assertFaultMatrixParity(adaptiveFirst, centralizedFirst);
  assertCentralizedObservationBoundary(centralizedFirst);

  const [adaptiveReplayInput, centralizedReplayInput] = await Promise.all([
    input.createAdaptiveInput(),
    input.createCentralizedInput(),
  ]);
  assertDecisionPolicyImplementation(
    adaptiveReplayInput,
    decisionPolicy,
    decide,
    decideCentralized
  );
  assertDecisionPolicyImplementation(
    centralizedReplayInput,
    decisionPolicy,
    decide,
    decideCentralized
  );
  if (
    fairnessDigestFor(adaptiveReplayInput) !== fairnessDigest ||
    fairnessDigestFor(centralizedReplayInput) !== fairnessDigest
  )
    throw new TypeError('closed_loop_resilience_pair_replay_not_fair');
  const [adaptiveReplay, centralizedReplay] = await Promise.all([
    runAdaptiveCollectiveClosedLoopResilienceV1(adaptiveReplayInput),
    runCentralizedPlannerClosedLoopResilienceV1(centralizedReplayInput),
  ]);
  if (
    resultReplayDigest(adaptiveReplay) !== resultReplayDigest(adaptiveFirst) ||
    resultReplayDigest(centralizedReplay) !==
      resultReplayDigest(centralizedFirst)
  )
    throw new Error('closed_loop_resilience_pair_replay_diverged');
  if (
    assertPublicObservationsMatch(adaptiveReplay, centralizedReplay) !==
      publicObservationDigest ||
    observationDigestFor(adaptiveReplay) !== publicObservationDigest ||
    observationDigestFor(centralizedReplay) !== publicObservationDigest
  )
    throw new Error('closed_loop_resilience_pair_observations_diverged');
  assertFaultMatrixParity(adaptiveReplay, centralizedReplay);
  if (
    faultMatrixExecutionDigest(adaptiveReplay) !==
      faultMatrixExecutionDigest(adaptiveFirst) ||
    faultMatrixExecutionDigest(centralizedReplay) !==
      faultMatrixExecutionDigest(centralizedFirst)
  )
    throw new Error('closed_loop_resilience_pair_matrix_replay_diverged');
  assertCentralizedObservationBoundary(centralizedReplay);

  return Object.freeze({
    schemaVersion: 1,
    matched: true,
    fairnessDigest,
    publicObservationDigest,
    adaptive: Object.freeze({
      schemaVersion: 1,
      matched: true,
      first: adaptiveFirst,
      replay: adaptiveReplay,
    }),
    centralized: Object.freeze({
      schemaVersion: 1,
      matched: true,
      first: centralizedFirst,
      replay: centralizedReplay,
    }),
  });
}

function assertDecisionPolicyImplementation(
  input: CollectiveClosedLoopResilienceExecutionInputV1,
  policy: CollectiveClosedLoopResilienceExecutionInputV1['decisionPolicy'],
  decide: CollectiveClosedLoopResilienceExecutionInputV1['decisionPolicy']['decide'],
  decideCentralized: CollectiveClosedLoopResilienceExecutionInputV1['decisionPolicy']['decideCentralized']
): void {
  if (
    input.decisionPolicy !== policy ||
    input.decisionPolicy.decide !== decide ||
    input.decisionPolicy.decideCentralized !== decideCentralized
  )
    throw new TypeError(
      'closed_loop_resilience_pair_policy_implementation_mismatch'
    );
}

function assertPairInput(
  value: CollectiveClosedLoopPairedResilienceCampaignInputV1
): void {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0 ||
    Object.getOwnPropertyNames(value).sort().join('\0') !==
      ['createAdaptiveInput', 'createCentralizedInput', 'schemaVersion']
        .sort()
        .join('\0') ||
    value.schemaVersion !== 1 ||
    typeof value.createAdaptiveInput !== 'function' ||
    typeof value.createCentralizedInput !== 'function'
  )
    throw new TypeError('closed_loop_resilience_pair_input_invalid');
}

function fairnessDigestFor(
  input: CollectiveClosedLoopResilienceExecutionInputV1
): PlanningDigestV1 {
  const definition = input.definition;
  const nominal = definition.nominalDefinition;
  const registration = nominal.registration;
  return digest('collective-closed-loop-resilience-fairness-v1', {
    schemaVersion: 1,
    missionIntent: nominal.missionIntent,
    selectionPolicy: nominal.selectionPolicy,
    mandate: nominal.mandate,
    peers: nominal.peers,
    maximumLogicalTimeMs: nominal.maximumLogicalTimeMs,
    evaluation: {
      tenantId: registration.tenantId,
      missionIntentId: registration.missionIntentId,
      intentRevision: registration.intentRevision,
      intentDigest: registration.intentDigest,
      stratum: registration.stratum,
      seed: registration.seed,
      environmentDigest: registration.environmentDigest,
      monitorDigest: registration.monitorDigest,
      observationPolicyDigest: registration.observationPolicyDigest,
      hiddenCanaryDigest: registration.hiddenCanaryDigest,
      limits: registration.limits,
    },
    faultPlan: definition.faultPlan.faults,
    faultMatrixBindingDigest: input.faultMatrix.bindingDigest,
    maximumEpochs: definition.maximumEpochs,
    replacementPeerId: input.replacementPeerId,
    actionClass: input.actionClass,
    resultDigest: input.resultDigest,
    resultSummary: input.resultSummary,
    decisionPolicy: {
      policyId: input.decisionPolicy.policyId,
      policyVersion: input.decisionPolicy.policyVersion,
      policyDigest: input.decisionPolicy.policyDigest,
    },
  } as unknown as PlanningJson);
}

function assertFaultMatrixParity(
  adaptive: CollectiveClosedLoopResilienceExecutionResultV1,
  centralized: CollectiveClosedLoopResilienceExecutionResultV1
): void {
  if (
    adaptive.faultMatrix.scenarioDigest !==
      centralized.faultMatrix.scenarioDigest ||
    adaptive.faultMatrix.matrixDigest !==
      centralized.faultMatrix.matrixDigest ||
    adaptive.faultMatrixBindingDigest !==
      centralized.faultMatrixBindingDigest ||
    faultMatrixExecutionDigest(adaptive) !==
      faultMatrixExecutionDigest(centralized)
  )
    throw new TypeError('closed_loop_resilience_pair_matrix_not_fair');
}

function faultMatrixExecutionDigest(
  result: CollectiveClosedLoopResilienceExecutionResultV1
): PlanningDigestV1 {
  return digest('collective-closed-loop-resilience-matrix-execution-v1', {
    schemaVersion: 1,
    scenarioDigest: result.faultMatrix.scenarioDigest,
    matrixDigest: result.faultMatrix.matrixDigest,
    missionBindingDigest: result.faultMatrixBindingDigest,
    records: result.faultMatrix.records,
    faults: result.faultMatrix.trace.faults,
  } as unknown as PlanningJson);
}

function assertPublicObservationsMatch(
  adaptive: CollectiveClosedLoopResilienceExecutionResultV1,
  centralized: CollectiveClosedLoopResilienceExecutionResultV1
): PlanningDigestV1 {
  const adaptiveDigest = observationDigestFor(adaptive);
  if (observationDigestFor(centralized) !== adaptiveDigest)
    throw new TypeError('closed_loop_resilience_pair_observations_not_fair');
  return adaptiveDigest;
}

function observationDigestFor(
  result: CollectiveClosedLoopResilienceExecutionResultV1
): PlanningDigestV1 {
  return digest(
    'collective-closed-loop-resilience-public-observations-v1',
    result.observations as unknown as PlanningJson
  );
}

function assertCentralizedObservationBoundary(
  result: CollectiveClosedLoopResilienceExecutionResultV1
): void {
  const initialObservationDigests = result.observations
    .filter((observation) => observation.logicalTimeMs === 0)
    .map((observation) => observation.observationDigest)
    .sort();
  const deliveredDirectiveDigests = result.trace.events
    .filter((event) => event.kind === 'runner.directive.delivered')
    .map((event) => event.recordDigest)
    .sort();
  if (
    initialObservationDigests.length !== deliveredDirectiveDigests.length ||
    initialObservationDigests.some(
      (digestValue, index) => digestValue !== deliveredDirectiveDigests[index]
    )
  )
    throw new TypeError('closed_loop_centralized_observation_boundary_invalid');
}

function resultReplayDigest(
  result: CollectiveClosedLoopResilienceExecutionResultV1
): PlanningDigestV1 {
  return digest('collective-closed-loop-resilience-replay-binding-v1', {
    resilienceResultDigest: result.resilience.resilienceResultDigest,
    campaignEvidenceDigest: result.campaignEvidence.campaignEvidenceDigest,
    traceDigest: result.trace.traceDigest,
    evidenceDigest: result.evidence.evidenceDigest,
    matrixExecutionDigest: faultMatrixExecutionDigest(result),
  });
}

function digest(domain: string, value: PlanningJson): PlanningDigestV1 {
  return digestPlanningJsonV1(
    'environment-state-v1',
    deepFreezePlanning({ domain, value }),
    {
      maximumBytes: 67_108_864,
      maximumDepth: 64,
      maximumNodes: 2_000_000,
      maximumKeysPerObject: 4_096,
      maximumItemsPerArray: 262_144,
    }
  );
}
