import {
  deepFreezePlanning,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import {
  createMultiDomainScenarioManifestV1,
  validateMultiDomainEnvironmentDescriptorV1,
  validateMultiDomainObservationEnvelopeV1,
  validateMultiDomainScenarioManifestV1,
} from "./multi-domain-environment-validation.js";
import { shardedSimulationDigestV1 } from "./sharded-simulation-contracts.js";
import {
  type ScalableEvaluationAccountingInputV1,
  type ScalableEvaluationAccountingReceiptV1,
  type ScalableEvaluationAccountingRecordV1,
  type ScalableEvaluationComparisonV1,
  type ScalableEvaluationCounterDeltaV1,
  type ScalableEvaluationCounterVectorV1,
  type ScalableEvaluationDefinitionV1,
  type ScalableEvaluationDomainCountersV1,
  type ScalableEvaluationDomainV1,
  type ScalableEvaluationEnvironmentBindingV1,
  type ScalableEvaluationEnvironmentInputV1,
  type ScalableEvaluationMetricTargetV1,
  type ScalableEvaluationObservationCountsV1,
  type ScalableEvaluationPartialObservationInputV1,
  type ScalableEvaluationPerturbationV1,
  type ScalableEvaluationPerturbationObservationV1,
  type ScalableEvaluationRecoveryBaselineV1,
  type ScalableEvaluationRecoveryMeasurementReceiptV1,
  type ScalableEvaluationRecoverySampleV1,
  type ScalableEvaluationRecoverySummaryV1,
  type ScalableEvaluationRuntimeRecoveryStateV1,
  type ScalableEvaluationRuntimeStateV1,
  type ScalableEvaluationRuntimeTeamStateV1,
  type ScalableEvaluationSnapshotV1,
  type ScalableEvaluationTeamBindingV1,
  type ScalableEvaluationTeamDescriptorV1,
  type ScalableEvaluationTeamPortV1,
  type ScalableEvaluationTeamSummaryV1,
} from "./scalable-evaluation-contracts.js";
import {
  isVerifiedScalableEvaluationPerturbationReceiptV1,
  isVerifiedScalableEvaluationRecoveryReceiptV1,
} from "./scalable-evaluation-evidence.js";
import {
  isReferenceIntegratedScalableEvaluationTeamPortV1,
  REFERENCE_INTEGRATED_SCALABLE_EVALUATION_IMPLEMENTATION_ID_V1,
} from "./scalable-evaluation-reference-integrated.js";
import {
  scalableEvaluationDigestV1,
  validateScalableEvaluationDefinitionV1,
  validateScalableEvaluationTeamDescriptorV1,
} from "./scalable-evaluation-validation.js";
import type { MultiDomainEnvironmentDescriptorV1 } from "./multi-domain-environment-contracts.js";

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const MAXIMUM_METRICS_PER_BASELINE = 64;
const ACCOUNTING_DOMAINS = ["physical", "social", "cyber"] as const;
const encoder = new TextEncoder();

interface MutableCounters {
  interactions: number;
  messages: number;
  messageBytes: number;
  observations: number;
  actions: number;
  successfulOutcomes: number;
  failedOutcomes: number;
}

interface MutableTeamState {
  readonly descriptor: ScalableEvaluationTeamDescriptorV1;
  sequence: number;
  lastLogicalTime: number;
  chainDigest: PlanningDigestV1;
  readonly counters: MutableCounters;
  readonly byDomain: Record<ScalableEvaluationDomainV1, MutableCounters>;
}

interface MutableRecoveryState {
  readonly perturbationId: string;
  readonly teamId: string;
  readonly domain: ScalableEvaluationDomainV1;
  readonly baseline: ScalableEvaluationRecoveryBaselineV1;
  readonly observedAtLogicalTime: number;
  readonly startingInteractions: number;
  readonly startingMessages: number;
  recoveredAtLogicalTime: number | null;
  withinBaselineTolerance: boolean;
  latestSampleDigest: PlanningDigestV1 | null;
  recoveryInteractions: number;
  recoveryMessages: number;
}

interface ScalableEvaluationRuntimeInvokersV1 {
  readonly definition: ScalableEvaluationDefinitionV1;
  readonly bindTeamEnvironment: InMemoryScalableEvaluationRuntimeV1["bindTeamEnvironmentV1"];
  readonly recordAccounting: InMemoryScalableEvaluationRuntimeV1["recordAccountingV1"];
  readonly recordPartialObservation: InMemoryScalableEvaluationRuntimeV1["recordPartialObservationV1"];
  readonly registerRecoveryBaseline: InMemoryScalableEvaluationRuntimeV1["registerRecoveryBaselineV1"];
  readonly recordPerturbationObservation: InMemoryScalableEvaluationRuntimeV1["recordPerturbationObservationV1"];
  readonly recordRecoverySample: InMemoryScalableEvaluationRuntimeV1["recordRecoverySampleV1"];
  readonly snapshot: InMemoryScalableEvaluationRuntimeV1["snapshotV1"];
  readonly compare: InMemoryScalableEvaluationRuntimeV1["compareV1"];
  readonly exportState: InMemoryScalableEvaluationRuntimeV1["exportStateV1"];
}

const scalableEvaluationRuntimeInvokersV1 = new WeakMap<
  object,
  ScalableEvaluationRuntimeInvokersV1
>();

export class ScalableEvaluationEnvironmentCancelledErrorV1 extends Error {
  constructor() {
    super("scalable evaluation environment opening was cancelled");
    this.name = "ScalableEvaluationEnvironmentCancelledErrorV1";
  }
}

/**
 * Creates and opens one environment only. It does not start sessions, bind
 * shards, invoke teams, or execute a campaign.
 */
export async function openScalableEvaluationEnvironmentV1(
  input: ScalableEvaluationEnvironmentInputV1,
): Promise<ScalableEvaluationEnvironmentBindingV1> {
  assertEnvironmentNotCancelled(input.abortSignal);
  const descriptor = validateMultiDomainEnvironmentDescriptorV1(
    input.adapter.descriptor,
  );
  const definition = validateScalableEvaluationDefinitionV1(
    input.definition,
    descriptor,
  );
  const expected = createMultiDomainScenarioManifestV1({
    descriptor,
    definition: definition.scenario,
  });
  const manifest = validateMultiDomainScenarioManifestV1(
    await input.adapter.createScenario(definition.scenario),
    descriptor,
  );
  assertEnvironmentNotCancelled(input.abortSignal);
  if (
    manifest.manifestDigest !== expected.manifestDigest ||
    manifest.manifestDigest !== definition.scenarioManifestDigest
  )
    fail("environment_scenario_substitution");
  const bridge = await input.adapter.openScenario({ manifest });
  if (
    !bridge ||
    typeof bridge !== "object" ||
    [
      "createSession",
      "startEpisode",
      "bindShardAssignments",
      "pullPartialObservation",
      "requestEffect",
      "deliverCrossShardBatch",
      "checkpoint",
      "restore",
    ].some(
      (method) =>
        typeof (bridge as unknown as Record<string, unknown>)[method] !==
        "function",
    )
  )
    fail("environment_bridge_invalid");
  assertEnvironmentNotCancelled(input.abortSignal);
  return Object.freeze({ schemaVersion: 1, manifest, bridge });
}

function assertEnvironmentNotCancelled(signal?: {
  readonly aborted: boolean;
}): void {
  if (signal?.aborted)
    throw new ScalableEvaluationEnvironmentCancelledErrorV1();
}

/** Binds either implementation to either side without granting evaluator state. */
export function bindScalableEvaluationTeamsV1(input: {
  readonly definition: ScalableEvaluationDefinitionV1;
  readonly ports: readonly [
    ScalableEvaluationTeamPortV1,
    ScalableEvaluationTeamPortV1,
  ];
}): ScalableEvaluationTeamBindingV1 {
  validateDefinitionDigestOnly(input.definition);
  const byId = new Map<string, ScalableEvaluationTeamPortV1>();
  for (const port of input.ports) {
    if (!port || typeof port.stepV1 !== "function") fail("team_port_invalid");
    const descriptor = validateScalableEvaluationTeamDescriptorV1(
      port.descriptor,
    );
    if (
      descriptor.implementationId ===
        REFERENCE_INTEGRATED_SCALABLE_EVALUATION_IMPLEMENTATION_ID_V1 &&
      !isReferenceIntegratedScalableEvaluationTeamPortV1(port)
    )
      fail("reference_integrated_team_port_not_genuine");
    if (byId.has(descriptor.teamId)) fail("team_port_duplicate");
    byId.set(descriptor.teamId, port);
  }
  const left = byId.get(input.definition.matchup.leftTeamId);
  const right = byId.get(input.definition.matchup.rightTeamId);
  if (!left || !right) fail("team_port_missing");
  const expected = new Map(
    input.definition.teams.map((team) => [team.teamId, team] as const),
  );
  for (const port of [left, right]) {
    const registered = expected.get(port.descriptor.teamId);
    if (
      !registered ||
      registered.descriptorDigest !== port.descriptor.descriptorDigest
    )
      fail("team_port_descriptor_mismatch");
  }
  return Object.freeze({
    schemaVersion: 1,
    matchup: input.definition.matchup,
    left,
    right,
  });
}

/**
 * Incremental, provider-neutral evaluation accounting. State grows with two
 * teams, three domains, configured perturbations, and a bounded record tail;
 * it never grows with the declared agent population.
 */
export class InMemoryScalableEvaluationRuntimeV1 {
  readonly #definition: ScalableEvaluationDefinitionV1;
  readonly #descriptor: MultiDomainEnvironmentDescriptorV1;
  readonly #teams = new Map<string, MutableTeamState>();
  readonly #perturbationPlan = new Map<
    string,
    ScalableEvaluationPerturbationV1
  >();
  readonly #baselines = new Map<string, ScalableEvaluationRecoveryBaselineV1>();
  readonly #perturbationObservations = new Map<
    string,
    ScalableEvaluationPerturbationObservationV1
  >();
  readonly #recoveries = new Map<string, MutableRecoveryState>();
  readonly #teamEnvironmentBindings = new Map<
    string,
    { readonly sessionId: string; readonly episodeId: string }
  >();
  readonly #recordTail: (ScalableEvaluationAccountingRecordV1 | undefined)[] =
    [];
  #recordTailCursor = 0;
  #revision = 0;
  #predecessorStateDigest: PlanningDigestV1 | null = null;

  constructor(input: {
    readonly definition: ScalableEvaluationDefinitionV1;
    readonly descriptor: MultiDomainEnvironmentDescriptorV1;
    readonly state?: ScalableEvaluationRuntimeStateV1;
  }) {
    this.#descriptor = validateMultiDomainEnvironmentDescriptorV1(
      input.descriptor,
    );
    this.#definition = validateScalableEvaluationDefinitionV1(
      input.definition,
      this.#descriptor,
    );
    for (const perturbation of this.#definition.perturbations)
      this.#perturbationPlan.set(perturbation.perturbationId, perturbation);
    for (const team of this.#definition.teams) {
      this.#teams.set(team.teamId, {
        descriptor: team,
        sequence: 0,
        lastLogicalTime: 0,
        chainDigest: scalableEvaluationDigestV1("accounting-genesis", {
          definitionDigest: this.#definition.definitionDigest,
          teamId: team.teamId,
        }),
        counters: mutableZeroCounters(),
        byDomain: {
          physical: mutableZeroCounters(),
          social: mutableZeroCounters(),
          cyber: mutableZeroCounters(),
        },
      });
    }
    const invokers: ScalableEvaluationRuntimeInvokersV1 = Object.freeze({
      definition: this.#definition,
      bindTeamEnvironment: canonicalBindTeamEnvironmentV1.bind(this),
      recordAccounting: canonicalRecordAccountingV1.bind(this),
      recordPartialObservation: canonicalRecordPartialObservationV1.bind(this),
      registerRecoveryBaseline: canonicalRegisterRecoveryBaselineV1.bind(this),
      recordPerturbationObservation:
        canonicalRecordPerturbationObservationV1.bind(this),
      recordRecoverySample: canonicalRecordRecoverySampleV1.bind(this),
      snapshot: canonicalSnapshotV1.bind(this),
      compare: canonicalCompareV1.bind(this),
      exportState: canonicalExportStateV1.bind(this),
    });
    scalableEvaluationRuntimeInvokersV1.set(this, invokers);
    Object.defineProperties(this, {
      definition: immutableValue(this.#definition, true),
      bindTeamEnvironmentV1: immutableMethod(invokers.bindTeamEnvironment),
      recordAccountingV1: immutableMethod(invokers.recordAccounting),
      recordPartialObservationV1: immutableMethod(
        invokers.recordPartialObservation,
      ),
      registerRecoveryBaselineV1: immutableMethod(
        invokers.registerRecoveryBaseline,
      ),
      recordPerturbationObservationV1: immutableMethod(
        invokers.recordPerturbationObservation,
      ),
      recordRecoverySampleV1: immutableMethod(invokers.recordRecoverySample),
      snapshotV1: immutableMethod(invokers.snapshot),
      compareV1: immutableMethod(invokers.compare),
      exportStateV1: immutableMethod(invokers.exportState),
    });
    if (input.state) this.#restoreState(input.state);
  }

  get definition(): ScalableEvaluationDefinitionV1 {
    return this.#definition;
  }

  /** Binds evaluator evidence to the exact environment run for one team. */
  bindTeamEnvironmentV1(input: {
    readonly teamId: string;
    readonly sessionId: string;
    readonly episodeId: string;
  }): void {
    this.#team(input.teamId);
    identifier(input.sessionId, "team_environment_session_id");
    identifier(input.episodeId, "team_environment_episode_id");
    const current = this.#teamEnvironmentBindings.get(input.teamId);
    if (current) {
      if (
        current.sessionId !== input.sessionId ||
        current.episodeId !== input.episodeId
      )
        fail("team_environment_binding_changed");
      return;
    }
    if (
      [...this.#teamEnvironmentBindings.values()].some(
        (binding) =>
          binding.sessionId === input.sessionId ||
          binding.episodeId === input.episodeId,
      )
    )
      fail("team_environment_binding_not_isolated");
    this.#advanceRevision();
    this.#teamEnvironmentBindings.set(
      input.teamId,
      freeze({
        sessionId: input.sessionId,
        episodeId: input.episodeId,
      }),
    );
  }

  recordAccountingV1(
    input: ScalableEvaluationAccountingInputV1,
  ): ScalableEvaluationAccountingReceiptV1 {
    const value = validateAccountingInput(input);
    const team = this.#team(value.teamId);
    if (!this.#definition.domains.includes(value.domain))
      fail("accounting_domain_not_in_scenario");
    if (value.sequence !== team.sequence + 1)
      fail("accounting_sequence_invalid");
    if (value.logicalTime < team.lastLogicalTime)
      fail("accounting_logical_time_regression");
    validateActivitySemantics(
      value,
      this.#definition.domains,
      this.#definition.partialObservability.allowCrossDomainAggregation,
    );
    const cumulative = addCounters(team.counters, value);
    const domainCumulative = Object.fromEntries(
      ACCOUNTING_DOMAINS.map((domain) => [
        domain,
        addCounters(team.byDomain[domain], domainDelta(value, domain)),
      ]),
    ) as unknown as Record<ScalableEvaluationDomainV1, MutableCounters>;
    const budget = this.#definition.profile.budget;
    if (cumulative.interactions > budget.maximumInteractions)
      fail("interaction_budget_exceeded");
    if (cumulative.messages > budget.maximumMessages)
      fail("message_budget_exceeded");
    if (cumulative.messageBytes > budget.maximumMessageBytes)
      fail("message_byte_budget_exceeded");
    const previousChainDigest = team.chainDigest;
    const recordBody = {
      ...value,
      previousChainDigest,
    };
    const recordDigest = scalableEvaluationDigestV1(
      "accounting-record",
      recordBody,
    );
    const chainDigest = scalableEvaluationDigestV1("accounting-chain", {
      previousChainDigest,
      recordDigest,
    });
    const record = freeze<ScalableEvaluationAccountingRecordV1>({
      ...recordBody,
      recordDigest,
      chainDigest,
      cumulative: freezeCounters(cumulative),
    });
    this.#advanceRevision();
    assignCounters(team.counters, cumulative);
    for (const domain of ACCOUNTING_DOMAINS)
      assignCounters(team.byDomain[domain], domainCumulative[domain]);
    team.sequence = value.sequence;
    team.lastLogicalTime = value.logicalTime;
    team.chainDigest = chainDigest;
    this.#retain(record);
    return freeze({
      schemaVersion: 1,
      teamId: team.descriptor.teamId,
      sequence: team.sequence,
      recordDigest,
      chainDigest,
      cumulative: freezeCounters(team.counters),
      remainingInteractions:
        budget.maximumInteractions - team.counters.interactions,
      remainingMessages: budget.maximumMessages - team.counters.messages,
      remainingMessageBytes:
        budget.maximumMessageBytes - team.counters.messageBytes,
    });
  }

  /** Validates a public multi-domain delivery before accounting one pull. */
  recordPartialObservationV1(
    input: ScalableEvaluationPartialObservationInputV1,
  ): ScalableEvaluationAccountingReceiptV1 {
    nonNegativeInteger(input.peerIndex, "observation_peer_index");
    if (input.peerIndex >= this.#definition.profile.agentCount)
      fail("observation_peer_out_of_range");
    const delivery = input.delivery;
    if (
      delivery.schemaVersion !== 1 ||
      delivery.peerIndex !== input.peerIndex ||
      delivery.logicalTime !== input.accounting.logicalTime ||
      typeof delivery.requestId !== "string" ||
      delivery.requestId.length === 0 ||
      !Array.isArray(delivery.observations) ||
      delivery.observations.length >
        this.#definition.partialObservability.maximumObservationsPerPull ||
      !(
        delivery.nextCursor === null ||
        (typeof delivery.nextCursor === "string" &&
          delivery.nextCursor.length > 0)
      ) ||
      !DIGEST.test(delivery.deliveryDigest)
    )
      fail("partial_observation_delivery_invalid");
    const { deliveryDigest: ignored, ...deliveryBody } = delivery;
    if (
      shardedSimulationDigestV1(
        "sharded-simulation-observation-delivery-v1",
        deliveryBody,
      ) !== delivery.deliveryDigest
    )
      fail("partial_observation_delivery_digest_invalid");
    if (
      input.accounting.evidenceDigest !== delivery.deliveryDigest ||
      input.observations.length !== delivery.observations.length ||
      scalableEvaluationDigestV1("observation-list", input.observations) !==
        scalableEvaluationDigestV1("observation-list", delivery.observations)
    )
      fail("partial_observation_binding_invalid");
    if (
      encoder.encode(JSON.stringify(delivery.observations)).byteLength >
      this.#definition.scenario.resourceBudget.maximumObservationBytes
    )
      fail("partial_observation_scenario_budget_exceeded");
    const observationCountsByDomain = {
      physical: 0,
      social: 0,
      cyber: 0,
    };
    for (const observation of input.observations) {
      const validated = validateMultiDomainObservationEnvelopeV1(
        observation,
        this.#descriptor,
      );
      if (!this.#definition.domains.includes(validated.domain))
        fail("partial_observation_domain_not_in_scenario");
      if (validated.logicalTime > delivery.logicalTime)
        fail("partial_observation_from_future");
      if (
        !this.#definition.partialObservability.allowCrossDomainAggregation &&
        validated.domain !== input.accounting.domain
      )
        fail("partial_observation_domain_mismatch");
      observationCountsByDomain[validated.domain] += 1;
    }
    return this.recordAccountingV1({
      ...input.accounting,
      kind: "observation",
      interactionCount: 1,
      messageCount: 0,
      messageBytes: 0,
      observationCount: input.observations.length,
      observationCountsByDomain,
      actionCount: 0,
      successfulOutcomeCount: 0,
      failedOutcomeCount: 0,
    });
  }

  registerRecoveryBaselineV1(input: {
    readonly baselineId: string;
    readonly teamId: string;
    readonly domain: ScalableEvaluationDomainV1;
    readonly establishedAtLogicalTime: number;
    readonly metrics: readonly ScalableEvaluationMetricTargetV1[];
  }): ScalableEvaluationRecoveryBaselineV1 {
    identifier(input.baselineId, "baseline_id");
    const team = this.#team(input.teamId);
    this.#domain(input.domain);
    nonNegativeInteger(input.establishedAtLogicalTime, "baseline_logical_time");
    if (input.establishedAtLogicalTime < team.lastLogicalTime)
      fail("baseline_logical_time_regression");
    const metrics = normalizeBaselineMetrics(input.metrics);
    const key = domainKey(input.teamId, input.domain);
    if (
      [...this.#recoveries.values()].some(
        (recovery) =>
          recovery.teamId === input.teamId &&
          recovery.domain === input.domain &&
          !recovery.withinBaselineTolerance,
      )
    )
      fail("baseline_replacement_during_recovery");
    const body = {
      schemaVersion: 1 as const,
      baselineId: input.baselineId,
      teamId: input.teamId,
      domain: input.domain,
      establishedAtLogicalTime: input.establishedAtLogicalTime,
      metrics,
    };
    const baseline = freeze<ScalableEvaluationRecoveryBaselineV1>({
      ...body,
      baselineDigest: scalableEvaluationDigestV1("recovery-baseline", body),
    });
    this.#advanceRevision();
    this.#baselines.set(key, baseline);
    team.lastLogicalTime = input.establishedAtLogicalTime;
    return baseline;
  }

  /**
   * Registers the occurrence at its injection watermark. Calls made after a
   * later accounting record fail closed, so recovery cost starts at injection
   * even when observedAtLogicalTime is later.
   */
  recordPerturbationObservationV1(input: {
    readonly receipt: import("./scalable-evaluation-contracts.js").ScalableEvaluationPerturbationInjectionReceiptV1;
  }): ScalableEvaluationPerturbationObservationV1 {
    const receipt = input.receipt;
    if (!isVerifiedScalableEvaluationPerturbationReceiptV1(receipt))
      fail("perturbation_evidence_not_verified");
    this.#requireTeamEnvironmentBinding(
      receipt.teamId,
      receipt.sessionId,
      receipt.episodeId,
    );
    const perturbation = this.#perturbationPlan.get(receipt.perturbationId);
    if (!perturbation) fail("perturbation_not_registered");
    const team = this.#team(receipt.teamId);
    if (!perturbation.targetTeamIds.includes(receipt.teamId))
      fail("perturbation_team_not_targeted");
    if (
      receipt.evaluationDefinitionDigest !==
        this.#definition.definitionDigest ||
      receipt.scenarioManifestDigest !==
        this.#definition.scenarioManifestDigest ||
      receipt.adapterDescriptorDigest !==
        this.#definition.adapterDescriptorDigest ||
      receipt.perturbationConfigurationDigest !==
        perturbation.configurationDigest ||
      receipt.scheduledAtLogicalTime !== perturbation.scheduledAtLogicalTime
    )
      fail("perturbation_evidence_scope_invalid");
    if (
      receipt.injectedAtLogicalTime < perturbation.scheduledAtLogicalTime ||
      receipt.injectedAtLogicalTime < team.lastLogicalTime
    )
      fail("perturbation_time_invalid");
    const key = recoveryKey(receipt.perturbationId, receipt.teamId);
    if (this.#perturbationObservations.has(key))
      fail("perturbation_observation_duplicate");
    const baseline = this.#baselines.get(
      domainKey(receipt.teamId, perturbation.domain),
    );
    if (
      !baseline ||
      baseline.establishedAtLogicalTime >= receipt.injectedAtLogicalTime
    )
      fail("recovery_baseline_unavailable");
    const body = {
      schemaVersion: 1 as const,
      perturbationId: perturbation.perturbationId,
      teamId: receipt.teamId,
      domain: perturbation.domain,
      scheduledAtLogicalTime: perturbation.scheduledAtLogicalTime,
      injectedAtLogicalTime: receipt.injectedAtLogicalTime,
      observedAtLogicalTime: receipt.injectedAtLogicalTime,
      evidenceDigest: receipt.receiptDigest,
    };
    const observation = freeze<ScalableEvaluationPerturbationObservationV1>({
      ...body,
      observationDigest: scalableEvaluationDigestV1(
        "perturbation-observation",
        body,
      ),
    });
    this.#advanceRevision();
    this.#perturbationObservations.set(key, observation);
    this.#recoveries.set(key, {
      perturbationId: perturbation.perturbationId,
      teamId: receipt.teamId,
      domain: perturbation.domain,
      baseline,
      observedAtLogicalTime: receipt.injectedAtLogicalTime,
      startingInteractions: team.counters.interactions,
      startingMessages: team.counters.messages,
      recoveredAtLogicalTime: null,
      withinBaselineTolerance: false,
      latestSampleDigest: null,
      recoveryInteractions: 0,
      recoveryMessages: 0,
    });
    team.lastLogicalTime = receipt.injectedAtLogicalTime;
    return observation;
  }

  recordRecoverySampleV1(input: {
    readonly measurement: ScalableEvaluationRecoveryMeasurementReceiptV1;
  }): ScalableEvaluationRecoverySampleV1 {
    const measurement = input.measurement;
    if (!isVerifiedScalableEvaluationRecoveryReceiptV1(measurement))
      fail("recovery_evidence_not_verified");
    this.#requireTeamEnvironmentBinding(
      measurement.teamId,
      measurement.sessionId,
      measurement.episodeId,
    );
    const team = this.#team(measurement.teamId);
    const recovery = this.#recoveries.get(
      recoveryKey(measurement.perturbationId, measurement.teamId),
    );
    if (!recovery) fail("recovery_episode_unavailable");
    if (recovery.withinBaselineTolerance)
      fail("recovery_episode_already_complete");
    if (
      measurement.evaluationDefinitionDigest !==
        this.#definition.definitionDigest ||
      measurement.scenarioManifestDigest !==
        this.#definition.scenarioManifestDigest ||
      measurement.adapterDescriptorDigest !==
        this.#definition.adapterDescriptorDigest ||
      measurement.domain !== recovery.domain
    )
      fail("recovery_evidence_scope_invalid");
    const perturbation = this.#perturbationPlan.get(measurement.perturbationId);
    if (
      !perturbation ||
      measurement.perturbationConfigurationDigest !==
        perturbation.configurationDigest ||
      measurement.scheduledAtLogicalTime !== perturbation.scheduledAtLogicalTime
    )
      fail("recovery_evidence_scope_invalid");
    if (
      measurement.logicalTime < recovery.observedAtLogicalTime ||
      measurement.logicalTime < team.lastLogicalTime
    )
      fail("recovery_sample_time_invalid");
    const metrics = normalizeRecoveryMetrics(
      measurement.metrics,
      recovery.baseline.metrics,
    );
    let maximumDistanceBasisPoints = 0;
    let withinBaselineTolerance = true;
    for (let index = 0; index < metrics.length; index += 1) {
      const metric = metrics[index]!;
      const target = recovery.baseline.metrics[index]!;
      const distance = Math.abs(
        metric.valueBasisPoints - target.valueBasisPoints,
      );
      maximumDistanceBasisPoints = Math.max(
        maximumDistanceBasisPoints,
        distance,
      );
      if (distance > target.toleranceBasisPoints)
        withinBaselineTolerance = false;
    }
    const recoveryInteractions =
      team.counters.interactions - recovery.startingInteractions;
    const recoveryMessages = team.counters.messages - recovery.startingMessages;
    const body = {
      schemaVersion: 1 as const,
      sampleId: measurement.sampleId,
      perturbationId: recovery.perturbationId,
      teamId: recovery.teamId,
      domain: recovery.domain,
      logicalTime: measurement.logicalTime,
      metrics,
      maximumDistanceBasisPoints,
      withinBaselineTolerance,
      recoveryInteractions,
      recoveryMessages,
      measurement,
    };
    const sample = freeze<ScalableEvaluationRecoverySampleV1>({
      ...body,
      sampleDigest: scalableEvaluationDigestV1("recovery-sample", body),
    });
    this.#advanceRevision();
    recovery.latestSampleDigest = sample.sampleDigest;
    recovery.withinBaselineTolerance = withinBaselineTolerance;
    recovery.recoveryInteractions = recoveryInteractions;
    recovery.recoveryMessages = recoveryMessages;
    recovery.recoveredAtLogicalTime = withinBaselineTolerance
      ? measurement.logicalTime
      : null;
    team.lastLogicalTime = measurement.logicalTime;
    return sample;
  }

  snapshotV1(): ScalableEvaluationSnapshotV1 {
    const teamSummaries = [...this.#teams.values()]
      .sort((left, right) =>
        left.descriptor.teamId.localeCompare(right.descriptor.teamId),
      )
      .map((team) => this.#teamSummary(team));
    const perturbationObservations = [
      ...this.#perturbationObservations.values(),
    ].sort(
      (left, right) =>
        left.perturbationId.localeCompare(right.perturbationId) ||
        left.teamId.localeCompare(right.teamId),
    );
    const recoverySummaries = [...this.#recoveries.values()]
      .sort(
        (left, right) =>
          left.perturbationId.localeCompare(right.perturbationId) ||
          left.teamId.localeCompare(right.teamId),
      )
      .map(recoverySummary);
    const recentAccountingRecords = this.#orderedRecordTail();
    const body = {
      schemaVersion: 1 as const,
      evaluationDefinitionDigest: this.#definition.definitionDigest,
      profileDigest: this.#definition.profile.profileDigest,
      teamSummaries,
      perturbationObservations,
      recoverySummaries,
      recentAccountingRecords,
    };
    return freeze({
      ...body,
      snapshotDigest: scalableEvaluationDigestV1("snapshot", body),
    });
  }

  compareV1(): ScalableEvaluationComparisonV1 {
    const left = this.#teamSummary(
      this.#team(this.#definition.matchup.leftTeamId),
    );
    const right = this.#teamSummary(
      this.#team(this.#definition.matchup.rightTeamId),
    );
    const leftMinusRight: ScalableEvaluationCounterDeltaV1 = freeze({
      interactions: left.counters.interactions - right.counters.interactions,
      messages: left.counters.messages - right.counters.messages,
      messageBytes: left.counters.messageBytes - right.counters.messageBytes,
      observations: left.counters.observations - right.counters.observations,
      actions: left.counters.actions - right.counters.actions,
      successfulOutcomes:
        left.counters.successfulOutcomes - right.counters.successfulOutcomes,
      failedOutcomes:
        left.counters.failedOutcomes - right.counters.failedOutcomes,
      recoveredEpisodes:
        left.recoveredEpisodeCount - right.recoveredEpisodeCount,
      completedRecoveryInteractions:
        left.completedRecoveryInteractions -
        right.completedRecoveryInteractions,
      completedRecoveryMessages:
        left.completedRecoveryMessages - right.completedRecoveryMessages,
    });
    const body = {
      schemaVersion: 1 as const,
      comparisonKind: "team-vs-team" as const,
      definitionDigest: this.#definition.definitionDigest,
      matchupDigest: this.#definition.matchup.matchupDigest,
      left,
      right,
      leftMinusRight,
    };
    return freeze({
      ...body,
      comparisonDigest: scalableEvaluationDigestV1("comparison", body),
    });
  }

  /** Canonical process-independent state. The record ring remains bounded. */
  exportStateV1(): ScalableEvaluationRuntimeStateV1 {
    const teams = [...this.#teams.values()]
      .sort((left, right) =>
        left.descriptor.teamId.localeCompare(right.descriptor.teamId),
      )
      .map((team): ScalableEvaluationRuntimeTeamStateV1 =>
        freeze({
          schemaVersion: 1,
          descriptor: team.descriptor,
          sequence: team.sequence,
          lastLogicalTime: team.lastLogicalTime,
          chainDigest: team.chainDigest,
          counters: freezeCounters(team.counters),
          countersByDomain: freezeDomainCounters(team.byDomain),
        }),
      );
    const baselines = [...this.#baselines.values()].sort((left, right) =>
      domainKey(left.teamId, left.domain).localeCompare(
        domainKey(right.teamId, right.domain),
      ),
    );
    const perturbationObservations = [
      ...this.#perturbationObservations.values(),
    ].sort((left, right) =>
      recoveryKey(left.perturbationId, left.teamId).localeCompare(
        recoveryKey(right.perturbationId, right.teamId),
      ),
    );
    const recoveries = [...this.#recoveries.values()]
      .sort((left, right) =>
        recoveryKey(left.perturbationId, left.teamId).localeCompare(
          recoveryKey(right.perturbationId, right.teamId),
        ),
      )
      .map((recovery): ScalableEvaluationRuntimeRecoveryStateV1 =>
        freeze({
          schemaVersion: 1,
          perturbationId: recovery.perturbationId,
          teamId: recovery.teamId,
          domain: recovery.domain,
          baseline: recovery.baseline,
          observedAtLogicalTime: recovery.observedAtLogicalTime,
          startingInteractions: recovery.startingInteractions,
          startingMessages: recovery.startingMessages,
          recoveredAtLogicalTime: recovery.recoveredAtLogicalTime,
          withinBaselineTolerance: recovery.withinBaselineTolerance,
          latestSampleDigest: recovery.latestSampleDigest,
          recoveryInteractions: recovery.recoveryInteractions,
          recoveryMessages: recovery.recoveryMessages,
        }),
      );
    const environmentBindings = [...this.#teamEnvironmentBindings]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([teamId, binding]) => freeze({ teamId, ...binding }));
    const body = {
      schemaVersion: 1 as const,
      definitionDigest: this.#definition.definitionDigest,
      adapterDescriptorDigest: this.#descriptor.descriptorDigest,
      revision: this.#revision,
      predecessorStateDigest: this.#predecessorStateDigest,
      teams,
      baselines,
      perturbationObservations,
      recoveries,
      environmentBindings,
      recordTail: Object.freeze(
        this.#recordTail.filter(
          (record): record is ScalableEvaluationAccountingRecordV1 =>
            record !== undefined,
        ),
      ),
      recordTailCursor: this.#recordTailCursor,
    };
    return freeze({
      ...body,
      stateDigest: scalableEvaluationDigestV1("runtime-state", body),
    });
  }

  #restoreState(state: ScalableEvaluationRuntimeStateV1): void {
    const value = validateRuntimeStateV1(
      state,
      this.#definition,
      this.#descriptor.descriptorDigest,
    );
    this.#teams.clear();
    for (const team of value.teams)
      this.#teams.set(team.descriptor.teamId, {
        descriptor: team.descriptor,
        sequence: team.sequence,
        lastLogicalTime: team.lastLogicalTime,
        chainDigest: team.chainDigest,
        counters: { ...team.counters },
        byDomain: {
          physical: { ...team.countersByDomain.physical },
          social: { ...team.countersByDomain.social },
          cyber: { ...team.countersByDomain.cyber },
        },
      });
    this.#baselines.clear();
    for (const baseline of value.baselines)
      this.#baselines.set(
        domainKey(baseline.teamId, baseline.domain),
        baseline,
      );
    this.#perturbationObservations.clear();
    for (const observation of value.perturbationObservations)
      this.#perturbationObservations.set(
        recoveryKey(observation.perturbationId, observation.teamId),
        observation,
      );
    this.#recoveries.clear();
    for (const recovery of value.recoveries)
      this.#recoveries.set(
        recoveryKey(recovery.perturbationId, recovery.teamId),
        { ...recovery },
      );
    this.#teamEnvironmentBindings.clear();
    for (const binding of value.environmentBindings)
      this.#teamEnvironmentBindings.set(binding.teamId, {
        sessionId: binding.sessionId,
        episodeId: binding.episodeId,
      });
    this.#recordTail.length = 0;
    this.#recordTail.push(...value.recordTail);
    this.#recordTailCursor = value.recordTailCursor;
    this.#revision = value.revision;
    this.#predecessorStateDigest = value.predecessorStateDigest;
  }

  #advanceRevision(): void {
    this.#predecessorStateDigest = this.exportStateV1().stateDigest;
    this.#revision += 1;
  }

  #team(teamId: string): MutableTeamState {
    const team = this.#teams.get(teamId);
    if (!team) fail("team_not_registered");
    return team;
  }

  #requireTeamEnvironmentBinding(
    teamId: string,
    sessionId: string,
    episodeId: string,
  ): void {
    const binding = this.#teamEnvironmentBindings.get(teamId);
    if (
      !binding ||
      binding.sessionId !== sessionId ||
      binding.episodeId !== episodeId
    )
      fail("evaluation_evidence_environment_binding_invalid");
  }

  #domain(domain: ScalableEvaluationDomainV1): void {
    if (!this.#definition.domains.includes(domain))
      fail("domain_not_in_scenario");
  }

  #retain(record: ScalableEvaluationAccountingRecordV1): void {
    const limit = this.#definition.profile.budget.maximumRetainedRecords;
    if (this.#recordTail.length < limit) {
      this.#recordTail.push(record);
      return;
    }
    this.#recordTail[this.#recordTailCursor] = record;
    this.#recordTailCursor = (this.#recordTailCursor + 1) % limit;
  }

  #orderedRecordTail(): readonly ScalableEvaluationAccountingRecordV1[] {
    const records = this.#recordTail.filter(
      (record): record is ScalableEvaluationAccountingRecordV1 =>
        record !== undefined,
    );
    if (
      records.length < this.#definition.profile.budget.maximumRetainedRecords ||
      this.#recordTailCursor === 0
    )
      return Object.freeze([...records]);
    return Object.freeze([
      ...records.slice(this.#recordTailCursor),
      ...records.slice(0, this.#recordTailCursor),
    ]);
  }

  #teamSummary(team: MutableTeamState): ScalableEvaluationTeamSummaryV1 {
    const recoveries = [...this.#recoveries.values()].filter(
      (recovery) => recovery.teamId === team.descriptor.teamId,
    );
    const completed = recoveries.filter(
      (recovery) => recovery.withinBaselineTolerance,
    );
    const body = {
      schemaVersion: 1 as const,
      teamId: team.descriptor.teamId,
      architecture: team.descriptor.architecture,
      lastSequence: team.sequence,
      lastLogicalTime: team.lastLogicalTime,
      counters: freezeCounters(team.counters),
      countersByDomain: freezeDomainCounters(team.byDomain),
      accountingChainDigest: team.chainDigest,
      recoveryEpisodeCount: recoveries.length,
      recoveredEpisodeCount: completed.length,
      recoveryRateBasisPoints:
        recoveries.length === 0
          ? 0
          : Math.floor((completed.length * 10_000) / recoveries.length),
      completedRecoveryInteractions: completed.reduce(
        (sum, recovery) =>
          safeAdd(
            sum,
            recovery.recoveryInteractions,
            "completed_recovery_interactions",
          ),
        0,
      ),
      completedRecoveryMessages: completed.reduce(
        (sum, recovery) =>
          safeAdd(
            sum,
            recovery.recoveryMessages,
            "completed_recovery_messages",
          ),
        0,
      ),
    };
    return freeze({
      ...body,
      summaryDigest: scalableEvaluationDigestV1("team-summary", body),
    });
  }
}

const canonicalBindTeamEnvironmentV1 =
  InMemoryScalableEvaluationRuntimeV1.prototype.bindTeamEnvironmentV1;
const canonicalRecordAccountingV1 =
  InMemoryScalableEvaluationRuntimeV1.prototype.recordAccountingV1;
const canonicalRecordPartialObservationV1 =
  InMemoryScalableEvaluationRuntimeV1.prototype.recordPartialObservationV1;
const canonicalRegisterRecoveryBaselineV1 =
  InMemoryScalableEvaluationRuntimeV1.prototype.registerRecoveryBaselineV1;
const canonicalRecordPerturbationObservationV1 =
  InMemoryScalableEvaluationRuntimeV1.prototype.recordPerturbationObservationV1;
const canonicalRecordRecoverySampleV1 =
  InMemoryScalableEvaluationRuntimeV1.prototype.recordRecoverySampleV1;
const canonicalSnapshotV1 =
  InMemoryScalableEvaluationRuntimeV1.prototype.snapshotV1;
const canonicalCompareV1 =
  InMemoryScalableEvaluationRuntimeV1.prototype.compareV1;
const canonicalExportStateV1 =
  InMemoryScalableEvaluationRuntimeV1.prototype.exportStateV1;

/** Nominal check for the module-owned scalable evaluation runtime. */
export function isInMemoryScalableEvaluationRuntimeV1(
  value: unknown,
): value is InMemoryScalableEvaluationRuntimeV1 {
  return Boolean(
    value &&
    (typeof value === "object" || typeof value === "function") &&
    scalableEvaluationRuntimeInvokersV1.has(value),
  );
}

export function scalableEvaluationRuntimeDefinitionV1(
  runtime: InMemoryScalableEvaluationRuntimeV1,
): ScalableEvaluationDefinitionV1 {
  return requireScalableEvaluationRuntimeInvokersV1(runtime).definition;
}

export function invokeScalableEvaluationBindTeamEnvironmentV1(
  runtime: InMemoryScalableEvaluationRuntimeV1,
  input: Parameters<
    InMemoryScalableEvaluationRuntimeV1["bindTeamEnvironmentV1"]
  >[0],
): void {
  return requireScalableEvaluationRuntimeInvokersV1(
    runtime,
  ).bindTeamEnvironment(input);
}

export function invokeScalableEvaluationRecordAccountingV1(
  runtime: InMemoryScalableEvaluationRuntimeV1,
  input: ScalableEvaluationAccountingInputV1,
): ScalableEvaluationAccountingReceiptV1 {
  return requireScalableEvaluationRuntimeInvokersV1(runtime).recordAccounting(
    input,
  );
}

export function invokeScalableEvaluationRecordPartialObservationV1(
  runtime: InMemoryScalableEvaluationRuntimeV1,
  input: ScalableEvaluationPartialObservationInputV1,
): ScalableEvaluationAccountingReceiptV1 {
  return requireScalableEvaluationRuntimeInvokersV1(
    runtime,
  ).recordPartialObservation(input);
}

export function invokeScalableEvaluationRegisterRecoveryBaselineV1(
  runtime: InMemoryScalableEvaluationRuntimeV1,
  input: Parameters<
    InMemoryScalableEvaluationRuntimeV1["registerRecoveryBaselineV1"]
  >[0],
): ScalableEvaluationRecoveryBaselineV1 {
  return requireScalableEvaluationRuntimeInvokersV1(
    runtime,
  ).registerRecoveryBaseline(input);
}

export function invokeScalableEvaluationRecordPerturbationObservationV1(
  runtime: InMemoryScalableEvaluationRuntimeV1,
  input: Parameters<
    InMemoryScalableEvaluationRuntimeV1["recordPerturbationObservationV1"]
  >[0],
): ScalableEvaluationPerturbationObservationV1 {
  return requireScalableEvaluationRuntimeInvokersV1(
    runtime,
  ).recordPerturbationObservation(input);
}

export function invokeScalableEvaluationRecordRecoverySampleV1(
  runtime: InMemoryScalableEvaluationRuntimeV1,
  input: Parameters<
    InMemoryScalableEvaluationRuntimeV1["recordRecoverySampleV1"]
  >[0],
): ScalableEvaluationRecoverySampleV1 {
  return requireScalableEvaluationRuntimeInvokersV1(
    runtime,
  ).recordRecoverySample(input);
}

export function invokeScalableEvaluationSnapshotV1(
  runtime: InMemoryScalableEvaluationRuntimeV1,
): ScalableEvaluationSnapshotV1 {
  return requireScalableEvaluationRuntimeInvokersV1(runtime).snapshot();
}

export function invokeScalableEvaluationCompareV1(
  runtime: InMemoryScalableEvaluationRuntimeV1,
): ScalableEvaluationComparisonV1 {
  return requireScalableEvaluationRuntimeInvokersV1(runtime).compare();
}

export function invokeScalableEvaluationExportStateV1(
  runtime: InMemoryScalableEvaluationRuntimeV1,
): ScalableEvaluationRuntimeStateV1 {
  return requireScalableEvaluationRuntimeInvokersV1(runtime).exportState();
}

function requireScalableEvaluationRuntimeInvokersV1(
  runtime: InMemoryScalableEvaluationRuntimeV1,
): ScalableEvaluationRuntimeInvokersV1 {
  const invokers = scalableEvaluationRuntimeInvokersV1.get(runtime);
  if (!invokers) fail("runtime_not_genuine");
  return invokers;
}

export function createScalableEvaluationRuntimeV1(input: {
  readonly definition: ScalableEvaluationDefinitionV1;
  readonly descriptor: MultiDomainEnvironmentDescriptorV1;
  readonly state?: ScalableEvaluationRuntimeStateV1;
}): InMemoryScalableEvaluationRuntimeV1 {
  return new InMemoryScalableEvaluationRuntimeV1(input);
}

export function restoreScalableEvaluationRuntimeV1(input: {
  readonly definition: ScalableEvaluationDefinitionV1;
  readonly descriptor: MultiDomainEnvironmentDescriptorV1;
  readonly state: ScalableEvaluationRuntimeStateV1;
}): InMemoryScalableEvaluationRuntimeV1 {
  return new InMemoryScalableEvaluationRuntimeV1(input);
}

function validateRuntimeStateV1(
  input: ScalableEvaluationRuntimeStateV1,
  definition: ScalableEvaluationDefinitionV1,
  descriptorDigest: PlanningDigestV1,
): ScalableEvaluationRuntimeStateV1 {
  if (
    !input ||
    typeof input !== "object" ||
    input.schemaVersion !== 1 ||
    input.definitionDigest !== definition.definitionDigest ||
    input.adapterDescriptorDigest !== descriptorDigest ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 0 ||
    (input.revision === 0) !== (input.predecessorStateDigest === null) ||
    (input.predecessorStateDigest !== null &&
      !DIGEST.test(input.predecessorStateDigest)) ||
    !Array.isArray(input.teams) ||
    input.teams.length !== definition.teams.length ||
    !Array.isArray(input.baselines) ||
    input.baselines.length >
      definition.teams.length * definition.domains.length ||
    !Array.isArray(input.perturbationObservations) ||
    input.perturbationObservations.length >
      definition.perturbations.length * definition.teams.length ||
    !Array.isArray(input.recoveries) ||
    input.recoveries.length >
      definition.perturbations.length * definition.teams.length ||
    !Array.isArray(input.environmentBindings) ||
    (input.revision === 0
      ? input.environmentBindings.length !== 0
      : input.environmentBindings.length !== definition.teams.length) ||
    !Array.isArray(input.recordTail) ||
    input.recordTail.length >
      definition.profile.budget.maximumRetainedRecords ||
    !Number.isSafeInteger(input.recordTailCursor) ||
    input.recordTailCursor < 0 ||
    !DIGEST.test(input.stateDigest)
  )
    fail("runtime_state_invalid");
  const { stateDigest: ignored, ...body } = input;
  if (scalableEvaluationDigestV1("runtime-state", body) !== input.stateDigest)
    fail("runtime_state_digest_invalid");
  const expectedTeams = [...definition.teams].sort((left, right) =>
    left.teamId.localeCompare(right.teamId),
  );
  for (let index = 0; index < input.teams.length; index += 1) {
    const team = input.teams[index]!;
    const expected = expectedTeams[index]!;
    if (
      !team ||
      team.schemaVersion !== 1 ||
      team.descriptor.teamId !== expected.teamId ||
      team.descriptor.descriptorDigest !== expected.descriptorDigest ||
      !Number.isSafeInteger(team.sequence) ||
      team.sequence < 0 ||
      !Number.isSafeInteger(team.lastLogicalTime) ||
      team.lastLogicalTime < 0 ||
      !DIGEST.test(team.chainDigest)
    )
      fail("runtime_state_team_invalid");
    validateStateCounters(team.counters, "runtime_state_team_counters");
    for (const domain of ACCOUNTING_DOMAINS)
      validateStateCounters(
        team.countersByDomain[domain],
        "runtime_state_domain_counters",
      );
    for (const domain of ACCOUNTING_DOMAINS)
      if (
        !definition.domains.includes(domain) &&
        !sameCounters(team.countersByDomain[domain], mutableZeroCounters())
      )
        fail("runtime_state_inactive_domain_counters_invalid");
    for (const counter of [
      "interactions",
      "messages",
      "messageBytes",
      "observations",
      "actions",
      "successfulOutcomes",
      "failedOutcomes",
    ] as const)
      if (
        ACCOUNTING_DOMAINS.reduce(
          (sum, domain) => sum + team.countersByDomain[domain][counter],
          0,
        ) !== team.counters[counter]
      )
        fail("runtime_state_domain_counter_sum_invalid");
    if (
      team.counters.interactions >
        definition.profile.budget.maximumInteractions ||
      team.counters.messages > definition.profile.budget.maximumMessages ||
      team.counters.messageBytes > definition.profile.budget.maximumMessageBytes
    )
      fail("runtime_state_budget_invalid");
  }
  const baselineKeys = new Set<string>();
  const baselinesByKey = new Map<
    string,
    ScalableEvaluationRecoveryBaselineV1
  >();
  for (const baseline of input.baselines) {
    const metrics = normalizeBaselineMetrics(baseline.metrics);
    const baselineBody = {
      schemaVersion: 1 as const,
      baselineId: baseline.baselineId,
      teamId: baseline.teamId,
      domain: baseline.domain,
      establishedAtLogicalTime: baseline.establishedAtLogicalTime,
      metrics,
    };
    const baselineKey = domainKey(baseline.teamId, baseline.domain);
    if (
      !expectedTeams.some((team) => team.teamId === baseline.teamId) ||
      !definition.domains.includes(baseline.domain) ||
      baselineKeys.has(baselineKey) ||
      scalableEvaluationDigestV1("recovery-baseline", baselineBody) !==
        baseline.baselineDigest
    )
      fail("runtime_state_baseline_invalid");
    baselineKeys.add(baselineKey);
    baselinesByKey.set(baselineKey, baseline);
  }
  const observationKeys = new Set<string>();
  const observationsByKey = new Map<
    string,
    ScalableEvaluationPerturbationObservationV1
  >();
  for (const observation of input.perturbationObservations) {
    const perturbation = definition.perturbations.find(
      (entry) => entry.perturbationId === observation.perturbationId,
    );
    const observationKey = recoveryKey(
      observation.perturbationId,
      observation.teamId,
    );
    const { observationDigest, ...observationBody } = observation;
    if (
      observation.schemaVersion !== 1 ||
      !perturbation ||
      !perturbation.targetTeamIds.includes(observation.teamId) ||
      observation.domain !== perturbation.domain ||
      observation.scheduledAtLogicalTime !==
        perturbation.scheduledAtLogicalTime ||
      !Number.isSafeInteger(observation.injectedAtLogicalTime) ||
      observation.injectedAtLogicalTime < observation.scheduledAtLogicalTime ||
      observation.observedAtLogicalTime !== observation.injectedAtLogicalTime ||
      !DIGEST.test(observation.evidenceDigest) ||
      observationKeys.has(observationKey) ||
      scalableEvaluationDigestV1(
        "perturbation-observation",
        observationBody,
      ) !== observationDigest
    )
      fail("runtime_state_perturbation_observation_invalid");
    observationKeys.add(observationKey);
    observationsByKey.set(observationKey, observation);
  }
  const recoveryKeys = new Set<string>();
  for (const recovery of input.recoveries) {
    const recoveryStateKey = recoveryKey(
      recovery.perturbationId,
      recovery.teamId,
    );
    const perturbation = definition.perturbations.find(
      (candidate) => candidate.perturbationId === recovery.perturbationId,
    );
    const observation = observationsByKey.get(recoveryStateKey);
    const team = input.teams.find(
      (candidate) => candidate.descriptor.teamId === recovery.teamId,
    );
    const canonicalBaseline = baselinesByKey.get(
      domainKey(recovery.teamId, recovery.domain),
    );
    if (
      recovery.schemaVersion !== 1 ||
      recoveryKeys.has(recoveryStateKey) ||
      !perturbation ||
      !observation ||
      !team ||
      recovery.domain !== perturbation.domain ||
      observation.domain !== recovery.domain ||
      recovery.baseline.teamId !== recovery.teamId ||
      recovery.baseline.domain !== recovery.domain ||
      !canonicalBaseline ||
      scalableEvaluationDigestV1(
        "runtime-recovery-baseline-binding",
        recovery.baseline,
      ) !==
        scalableEvaluationDigestV1(
          "runtime-recovery-baseline-binding",
          canonicalBaseline,
        ) ||
      !Number.isSafeInteger(recovery.observedAtLogicalTime) ||
      recovery.observedAtLogicalTime !== observation.observedAtLogicalTime ||
      recovery.observedAtLogicalTime > team.lastLogicalTime ||
      !Number.isSafeInteger(recovery.startingInteractions) ||
      recovery.startingInteractions < 0 ||
      recovery.startingInteractions > team.counters.interactions ||
      !Number.isSafeInteger(recovery.startingMessages) ||
      recovery.startingMessages < 0 ||
      recovery.startingMessages > team.counters.messages ||
      !(
        recovery.recoveredAtLogicalTime === null ||
        (Number.isSafeInteger(recovery.recoveredAtLogicalTime) &&
          recovery.recoveredAtLogicalTime >= recovery.observedAtLogicalTime &&
          recovery.recoveredAtLogicalTime <= team.lastLogicalTime)
      ) ||
      typeof recovery.withinBaselineTolerance !== "boolean" ||
      recovery.withinBaselineTolerance !==
        (recovery.recoveredAtLogicalTime !== null) ||
      !Number.isSafeInteger(recovery.recoveryInteractions) ||
      recovery.recoveryInteractions < 0 ||
      recovery.recoveryInteractions >
        team.counters.interactions - recovery.startingInteractions ||
      !Number.isSafeInteger(recovery.recoveryMessages) ||
      recovery.recoveryMessages < 0 ||
      recovery.recoveryMessages >
        team.counters.messages - recovery.startingMessages ||
      (recovery.latestSampleDigest !== null &&
        !DIGEST.test(recovery.latestSampleDigest)) ||
      (recovery.latestSampleDigest === null &&
        (recovery.withinBaselineTolerance ||
          recovery.recoveryInteractions !== 0 ||
          recovery.recoveryMessages !== 0)) ||
      (recovery.withinBaselineTolerance && recovery.latestSampleDigest === null)
    )
      fail("runtime_state_recovery_invalid");
    recoveryKeys.add(recoveryStateKey);
  }
  if (
    recoveryKeys.size !== observationKeys.size ||
    [...observationKeys].some(
      (observationKey) => !recoveryKeys.has(observationKey),
    )
  )
    fail("runtime_state_recovery_set_invalid");
  const bindingTeams = new Set<string>();
  const sessionIds = new Set<string>();
  const episodeIds = new Set<string>();
  for (const binding of input.environmentBindings) {
    identifier(binding.teamId, "runtime_state_binding_team_id");
    identifier(binding.sessionId, "runtime_state_binding_session_id");
    identifier(binding.episodeId, "runtime_state_binding_episode_id");
    if (
      !expectedTeams.some((team) => team.teamId === binding.teamId) ||
      bindingTeams.has(binding.teamId) ||
      sessionIds.has(binding.sessionId) ||
      episodeIds.has(binding.episodeId)
    )
      fail("runtime_state_environment_binding_invalid");
    bindingTeams.add(binding.teamId);
    sessionIds.add(binding.sessionId);
    episodeIds.add(binding.episodeId);
  }
  const tailLimit = definition.profile.budget.maximumRetainedRecords;
  const totalRecordCount = input.teams.reduce(
    (total, team) => safeAdd(total, team.sequence, "runtime_state_sequence"),
    0,
  );
  const expectedTailLength = Math.min(totalRecordCount, tailLimit);
  const expectedTailCursor =
    totalRecordCount <= tailLimit
      ? 0
      : (totalRecordCount - tailLimit) % tailLimit;
  if (
    input.recordTail.length !== expectedTailLength ||
    input.recordTailCursor !== expectedTailCursor
  )
    fail("runtime_state_record_cursor_invalid");
  const orderedTail =
    input.recordTail.length === tailLimit && input.recordTailCursor !== 0
      ? [
          ...input.recordTail.slice(input.recordTailCursor),
          ...input.recordTail.slice(0, input.recordTailCursor),
        ]
      : [...input.recordTail];
  const retainedByTeam = new Map<
    string,
    ScalableEvaluationAccountingRecordV1[]
  >();
  const eventIds = new Set<string>();
  for (const record of orderedTail) {
    const {
      previousChainDigest,
      recordDigest,
      chainDigest,
      cumulative,
      ...accounting
    } = record;
    const validatedAccounting = validateAccountingInput(accounting);
    validateActivitySemantics(
      validatedAccounting,
      definition.domains,
      definition.partialObservability.allowCrossDomainAggregation,
    );
    validateStateCounters(cumulative, "runtime_state_record_cumulative");
    const team = input.teams.find(
      (candidate) => candidate.descriptor.teamId === record.teamId,
    );
    if (
      !team ||
      record.sequence > team.sequence ||
      record.logicalTime > team.lastLogicalTime ||
      eventIds.has(record.eventId) ||
      !DIGEST.test(previousChainDigest) ||
      scalableEvaluationDigestV1("accounting-record", {
        ...accounting,
        previousChainDigest,
      }) !== recordDigest ||
      scalableEvaluationDigestV1("accounting-chain", {
        previousChainDigest,
        recordDigest,
      }) !== chainDigest
    )
      fail("runtime_state_record_invalid");
    eventIds.add(record.eventId);
    const teamRecords = retainedByTeam.get(record.teamId) ?? [];
    const previous = teamRecords.at(-1);
    if (previous) {
      if (
        record.sequence !== previous.sequence + 1 ||
        record.previousChainDigest !== previous.chainDigest ||
        !sameCounters(
          record.cumulative,
          addCounters({ ...previous.cumulative }, validatedAccounting),
        )
      )
        fail("runtime_state_record_continuity_invalid");
    } else if (record.sequence === 1) {
      const genesis = scalableEvaluationDigestV1("accounting-genesis", {
        definitionDigest: definition.definitionDigest,
        teamId: record.teamId,
      });
      if (
        record.previousChainDigest !== genesis ||
        !sameCounters(
          record.cumulative,
          addCounters(mutableZeroCounters(), validatedAccounting),
        )
      )
        fail("runtime_state_record_genesis_invalid");
    }
    teamRecords.push(record);
    retainedByTeam.set(record.teamId, teamRecords);
  }
  for (const team of input.teams) {
    const records = retainedByTeam.get(team.descriptor.teamId) ?? [];
    const latest = records.at(-1);
    const genesis = scalableEvaluationDigestV1("accounting-genesis", {
      definitionDigest: definition.definitionDigest,
      teamId: team.descriptor.teamId,
    });
    if (team.sequence === 0) {
      if (
        team.chainDigest !== genesis ||
        !sameCounters(team.counters, mutableZeroCounters()) ||
        records.length !== 0
      )
        fail("runtime_state_team_genesis_invalid");
    } else if (
      latest &&
      (latest.sequence !== team.sequence ||
        latest.chainDigest !== team.chainDigest ||
        !sameCounters(latest.cumulative, team.counters))
    )
      fail("runtime_state_team_head_invalid");
    if (records.length === team.sequence && records[0]?.sequence === 1) {
      const reconstructed: Record<ScalableEvaluationDomainV1, MutableCounters> =
        {
          physical: mutableZeroCounters(),
          social: mutableZeroCounters(),
          cyber: mutableZeroCounters(),
        };
      for (const record of records) {
        const {
          previousChainDigest: ignoredPrevious,
          recordDigest: ignoredRecord,
          chainDigest: ignoredChain,
          cumulative: ignoredCumulative,
          ...accounting
        } = record;
        const validated = validateAccountingInput(accounting);
        for (const domain of ACCOUNTING_DOMAINS)
          reconstructed[domain] = addCounters(
            reconstructed[domain],
            domainDelta(validated, domain),
          );
      }
      for (const domain of ACCOUNTING_DOMAINS)
        if (!sameCounters(reconstructed[domain], team.countersByDomain[domain]))
          fail("runtime_state_domain_counter_history_invalid");
    }
  }
  const minimumRevision =
    totalRecordCount +
    input.environmentBindings.length +
    input.baselines.length +
    input.perturbationObservations.length;
  if (input.revision < minimumRevision)
    fail("runtime_state_revision_inconsistent");
  if (
    input.environmentBindings.some(
      (binding, index) => binding.teamId !== expectedTeams[index]?.teamId,
    )
  )
    fail("runtime_state_environment_binding_order_invalid");
  if (
    input.teams.some(
      (team, index) => team.descriptor.teamId !== expectedTeams[index]?.teamId,
    )
  )
    fail("runtime_state_team_order_invalid");
  return freeze(input);
}

function sameCounters(
  left: ScalableEvaluationCounterVectorV1,
  right: ScalableEvaluationCounterVectorV1,
): boolean {
  return (
    left.interactions === right.interactions &&
    left.messages === right.messages &&
    left.messageBytes === right.messageBytes &&
    left.observations === right.observations &&
    left.actions === right.actions &&
    left.successfulOutcomes === right.successfulOutcomes &&
    left.failedOutcomes === right.failedOutcomes
  );
}

function validateStateCounters(
  counters: ScalableEvaluationCounterVectorV1,
  label: string,
): void {
  if (!counters || typeof counters !== "object") fail(`${label}_invalid`);
  for (const value of Object.values(counters))
    if (!Number.isSafeInteger(value) || value < 0) fail(`${label}_invalid`);
}

function validateDefinitionDigestOnly(
  definition: ScalableEvaluationDefinitionV1,
): void {
  if (
    !definition ||
    typeof definition !== "object" ||
    definition.schemaVersion !== 1 ||
    !Array.isArray(definition.teams) ||
    definition.teams.length !== 2
  )
    fail("definition_invalid");
  const { definitionDigest, ...body } = definition;
  if (
    !DIGEST.test(definitionDigest) ||
    scalableEvaluationDigestV1("definition", body) !== definitionDigest
  )
    fail("definition_digest_invalid");
}

function recoverySummary(
  recovery: MutableRecoveryState,
): ScalableEvaluationRecoverySummaryV1 {
  const body = {
    schemaVersion: 1 as const,
    perturbationId: recovery.perturbationId,
    teamId: recovery.teamId,
    domain: recovery.domain,
    baselineDigest: recovery.baseline.baselineDigest,
    observedAtLogicalTime: recovery.observedAtLogicalTime,
    recoveredAtLogicalTime: recovery.recoveredAtLogicalTime,
    withinBaselineTolerance: recovery.withinBaselineTolerance,
    recoveryInteractions: recovery.recoveryInteractions,
    recoveryMessages: recovery.recoveryMessages,
    latestSampleDigest: recovery.latestSampleDigest,
  };
  return freeze({
    ...body,
    summaryDigest: scalableEvaluationDigestV1("recovery-summary", body),
  });
}

function normalizeBaselineMetrics(
  input: readonly ScalableEvaluationMetricTargetV1[],
): readonly ScalableEvaluationMetricTargetV1[] {
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    input.length > MAXIMUM_METRICS_PER_BASELINE
  )
    fail("baseline_metrics_invalid");
  const metrics = [...input]
    .map((metric) => {
      if (!metric || typeof metric !== "object")
        fail("baseline_metric_invalid");
      identifier(metric.metricId, "baseline_metric_id");
      basisPoints(metric.valueBasisPoints, "baseline_metric_value");
      basisPoints(metric.toleranceBasisPoints, "baseline_metric_tolerance");
      return {
        metricId: metric.metricId,
        valueBasisPoints: metric.valueBasisPoints,
        toleranceBasisPoints: metric.toleranceBasisPoints,
      };
    })
    .sort((left, right) => left.metricId.localeCompare(right.metricId));
  if (new Set(metrics.map((metric) => metric.metricId)).size !== metrics.length)
    fail("baseline_metric_duplicate");
  return freeze(metrics);
}

function normalizeRecoveryMetrics(
  input: readonly Readonly<{
    metricId: string;
    valueBasisPoints: number;
  }>[],
  targets: readonly ScalableEvaluationMetricTargetV1[],
): readonly Readonly<{ metricId: string; valueBasisPoints: number }>[] {
  if (!Array.isArray(input) || input.length !== targets.length)
    fail("recovery_metrics_invalid");
  const metrics = [...input]
    .map((metric) => {
      if (!metric || typeof metric !== "object")
        fail("recovery_metric_invalid");
      identifier(metric.metricId, "recovery_metric_id");
      basisPoints(metric.valueBasisPoints, "recovery_metric_value");
      return {
        metricId: metric.metricId,
        valueBasisPoints: metric.valueBasisPoints,
      };
    })
    .sort((left, right) => left.metricId.localeCompare(right.metricId));
  for (let index = 0; index < targets.length; index += 1)
    if (metrics[index]!.metricId !== targets[index]!.metricId)
      fail("recovery_metric_set_mismatch");
  return freeze(metrics);
}

function validateAccountingInput(
  input: ScalableEvaluationAccountingInputV1,
): ScalableEvaluationAccountingInputV1 {
  if (!input || typeof input !== "object" || input.schemaVersion !== 1)
    fail("accounting_input_invalid");
  identifier(input.eventId, "accounting_event_id");
  identifier(input.teamId, "accounting_team_id");
  positiveInteger(input.sequence, "accounting_sequence");
  nonNegativeInteger(input.logicalTime, "accounting_logical_time");
  if (!new Set(["physical", "social", "cyber"]).has(input.domain))
    fail("accounting_domain_invalid");
  if (
    !new Set(["observation", "message", "decision", "action", "recovery"]).has(
      input.kind,
    )
  )
    fail("accounting_kind_invalid");
  for (const [label, value] of [
    ["interaction_count", input.interactionCount],
    ["message_count", input.messageCount],
    ["message_bytes", input.messageBytes],
    ["observation_count", input.observationCount],
    ["action_count", input.actionCount],
    ["successful_outcome_count", input.successfulOutcomeCount],
    ["failed_outcome_count", input.failedOutcomeCount],
  ] as const)
    nonNegativeInteger(value, label);
  positiveInteger(input.interactionCount, "interaction_count");
  const observationCountsByDomain = normalizeObservationCounts(
    input.observationCountsByDomain,
  );
  digest(input.evidenceDigest, "accounting_evidence_digest");
  return freeze({
    schemaVersion: 1,
    eventId: input.eventId,
    teamId: input.teamId,
    sequence: input.sequence,
    logicalTime: input.logicalTime,
    domain: input.domain,
    kind: input.kind,
    interactionCount: input.interactionCount,
    messageCount: input.messageCount,
    messageBytes: input.messageBytes,
    observationCount: input.observationCount,
    observationCountsByDomain,
    actionCount: input.actionCount,
    successfulOutcomeCount: input.successfulOutcomeCount,
    failedOutcomeCount: input.failedOutcomeCount,
    evidenceDigest: input.evidenceDigest,
  });
}

function validateActivitySemantics(
  input: ScalableEvaluationAccountingInputV1,
  activeDomains: readonly ScalableEvaluationDomainV1[],
  allowCrossDomainAggregation: boolean,
): void {
  const observationTotal = ACCOUNTING_DOMAINS.reduce(
    (sum, domain) =>
      safeAdd(
        sum,
        input.observationCountsByDomain[domain],
        "observation_count",
      ),
    0,
  );
  if (
    (input.messageCount === 0) !== (input.messageBytes === 0) ||
    input.messageBytes < input.messageCount ||
    observationTotal !== input.observationCount ||
    ACCOUNTING_DOMAINS.some(
      (domain) =>
        !activeDomains.includes(domain) &&
        input.observationCountsByDomain[domain] !== 0,
    ) ||
    (!allowCrossDomainAggregation &&
      ACCOUNTING_DOMAINS.some(
        (domain) =>
          domain !== input.domain &&
          input.observationCountsByDomain[domain] !== 0,
      )) ||
    safeAdd(
      input.successfulOutcomeCount,
      input.failedOutcomeCount,
      "outcome_count",
    ) > input.interactionCount
  )
    fail("accounting_counts_inconsistent");
  if (input.kind === "message" && input.messageCount === 0)
    fail("message_activity_empty");
  if (input.kind === "action" && input.actionCount === 0)
    fail("action_activity_empty");
}

function normalizeObservationCounts(
  input: ScalableEvaluationObservationCountsV1,
): ScalableEvaluationObservationCountsV1 {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).sort().join("\u0000") !==
      [...ACCOUNTING_DOMAINS].sort().join("\u0000")
  )
    fail("observation_domain_counts_invalid");
  for (const domain of ACCOUNTING_DOMAINS)
    nonNegativeInteger(input[domain], `observation_${domain}_count`);
  return freeze({
    physical: input.physical,
    social: input.social,
    cyber: input.cyber,
  });
}

function domainDelta(
  input: ScalableEvaluationAccountingInputV1,
  domain: ScalableEvaluationDomainV1,
): ScalableEvaluationAccountingInputV1 {
  const primary = domain === input.domain;
  return {
    ...input,
    interactionCount: primary ? input.interactionCount : 0,
    messageCount: primary ? input.messageCount : 0,
    messageBytes: primary ? input.messageBytes : 0,
    observationCount: input.observationCountsByDomain[domain],
    actionCount: primary ? input.actionCount : 0,
    successfulOutcomeCount: primary ? input.successfulOutcomeCount : 0,
    failedOutcomeCount: primary ? input.failedOutcomeCount : 0,
  };
}

function mutableZeroCounters(): MutableCounters {
  return {
    interactions: 0,
    messages: 0,
    messageBytes: 0,
    observations: 0,
    actions: 0,
    successfulOutcomes: 0,
    failedOutcomes: 0,
  };
}

function addCounters(
  current: MutableCounters,
  delta: ScalableEvaluationAccountingInputV1,
): MutableCounters {
  return {
    interactions: safeAdd(
      current.interactions,
      delta.interactionCount,
      "interaction_count",
    ),
    messages: safeAdd(current.messages, delta.messageCount, "message_count"),
    messageBytes: safeAdd(
      current.messageBytes,
      delta.messageBytes,
      "message_bytes",
    ),
    observations: safeAdd(
      current.observations,
      delta.observationCount,
      "observation_count",
    ),
    actions: safeAdd(current.actions, delta.actionCount, "action_count"),
    successfulOutcomes: safeAdd(
      current.successfulOutcomes,
      delta.successfulOutcomeCount,
      "successful_outcome_count",
    ),
    failedOutcomes: safeAdd(
      current.failedOutcomes,
      delta.failedOutcomeCount,
      "failed_outcome_count",
    ),
  };
}

function assignCounters(
  target: MutableCounters,
  source: MutableCounters,
): void {
  target.interactions = source.interactions;
  target.messages = source.messages;
  target.messageBytes = source.messageBytes;
  target.observations = source.observations;
  target.actions = source.actions;
  target.successfulOutcomes = source.successfulOutcomes;
  target.failedOutcomes = source.failedOutcomes;
}

function freezeCounters(
  counters: MutableCounters,
): ScalableEvaluationCounterVectorV1 {
  return freeze({ ...counters });
}

function freezeDomainCounters(
  counters: Record<ScalableEvaluationDomainV1, MutableCounters>,
): ScalableEvaluationDomainCountersV1 {
  return freeze({
    physical: freezeCounters(counters.physical),
    social: freezeCounters(counters.social),
    cyber: freezeCounters(counters.cyber),
  });
}

function domainKey(teamId: string, domain: ScalableEvaluationDomainV1): string {
  return `${teamId}\u0000${domain}`;
}

function recoveryKey(perturbationId: string, teamId: string): string {
  return `${perturbationId}\u0000${teamId}`;
}

function safeAdd(left: number, right: number, label: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) fail(`${label}_overflow`);
  return result;
}

function identifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 256 ||
    !value.trim()
  )
    fail(`${label}_invalid`);
}

function digest(
  value: unknown,
  label: string,
): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !DIGEST.test(value))
    fail(`${label}_invalid`);
}

function positiveInteger(
  value: unknown,
  label: string,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0)
    fail(`${label}_invalid`);
}

function nonNegativeInteger(
  value: unknown,
  label: string,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail(`${label}_invalid`);
}

function basisPoints(value: unknown, label: string): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > 10_000
  )
    fail(`${label}_invalid`);
}

function freeze<T>(value: T): T {
  return deepFreezePlanning(value as unknown as PlanningJson) as unknown as T;
}

function immutableMethod<T extends (...args: never[]) => unknown>(
  value: T,
): PropertyDescriptor {
  return immutableValue(value, false);
}

function immutableValue(
  value: unknown,
  enumerable: boolean,
): PropertyDescriptor {
  return {
    value,
    writable: false,
    configurable: false,
    enumerable,
  };
}

function fail(code: string): never {
  throw new TypeError(`scalable_evaluation_${code}`);
}
