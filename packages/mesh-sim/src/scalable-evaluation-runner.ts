import {
  deepFreezePlanning,
  PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";

import { validateMultiDomainActionEnvelopeV1 } from "./multi-domain-environment-validation.js";
import {
  createShardedSimulationAssignmentsV1,
  createShardedSimulationCrossShardMessageBatchV1,
  shardedSimulationAssignmentForPeerV1,
  shardedSimulationFencedActionDigestV1,
  shardedSimulationDigestV1,
  shardedSimulationScaleProfileV1,
  type ShardedSimulationEpisodeV1,
  type ShardedSimulationEffectReceiptV1,
  type ShardedSimulationEnvironmentSessionV1,
} from "./sharded-simulation-contracts.js";
import {
  validateShardedSimulationCrossShardMessageAckV1,
  validateShardedSimulationEffectReceiptV1,
} from "./sharded-simulation-runtime.js";
import {
  bindScalableEvaluationTeamsV1,
  createScalableEvaluationRuntimeV1,
  invokeScalableEvaluationBindTeamEnvironmentV1,
  invokeScalableEvaluationCompareV1,
  invokeScalableEvaluationRecordAccountingV1,
  invokeScalableEvaluationRecordPartialObservationV1,
  invokeScalableEvaluationRecordPerturbationObservationV1,
  invokeScalableEvaluationRecordRecoverySampleV1,
  invokeScalableEvaluationRegisterRecoveryBaselineV1,
  invokeScalableEvaluationSnapshotV1,
  invokeScalableEvaluationExportStateV1,
  openScalableEvaluationEnvironmentV1,
  restoreScalableEvaluationRuntimeV1,
  scalableEvaluationRuntimeDefinitionV1,
  ScalableEvaluationEnvironmentCancelledErrorV1,
} from "./scalable-evaluation-runtime.js";
import {
  assertScalableEvaluationRestartDurabilityDeclarationV1,
  createScalableEvaluationRunnerCheckpointV1,
  scalableEvaluationCheckpointBytesV1,
  validateScalableEvaluationCheckpointStoreCasReceiptV1,
  validateScalableEvaluationRunnerCheckpointV1,
  validateScalableEvaluationTeamCheckpointV1,
  validateScalableEvaluationTeamRestoreReceiptV1,
} from "./scalable-evaluation-durability.js";
import { validateShardedSimulationCheckpointV1 } from "./sharded-simulation-validation.js";
import {
  assertScalableEvaluationEvidenceVerifierV1,
  verifyScalableEvaluationPerturbationInjectionReceiptV1,
  verifyScalableEvaluationRecoveryMeasurementReceiptV1,
} from "./scalable-evaluation-evidence.js";
import type {
  ScalableEvaluationActionAuthorityV1,
  ScalableEvaluationActionSettlementV1,
  ScalableEvaluationActionSettlementReceiptV1,
  ScalableEvaluationAcknowledgedMessageV1,
  ScalableEvaluationDefinitionV1,
  ScalableEvaluationEvidenceVerifierV1,
  ScalableEvaluationExecutionResultV1,
  ScalableEvaluationMessageIngressReceiptV1,
  ScalableEvaluationPerturbationPortV1,
  ScalableEvaluationRecoveryMetricPortV1,
  ScalableEvaluationRunnerRecoveryBaselineV1,
  ScalableEvaluationRunnerStepV1,
  ScalableEvaluationTeamMessageV1,
  ScalableEvaluationTeamPortV1,
  ScalableEvaluationTeamStepOutputV1,
  ScalableEvaluationRunnerInputV1,
  ScalableEvaluationResumableEnvironmentBridgeV1,
  ScalableEvaluationResumableTeamPortV1,
  ScalableEvaluationRunnerCheckpointV1,
  ScalableEvaluationRuntimeStateV1,
} from "./scalable-evaluation-contracts.js";
import {
  scalableEvaluationDigestV1,
  validateScalableEvaluationDefinitionV1,
} from "./scalable-evaluation-validation.js";
import type { MultiDomainEnvironmentAdapterV1 } from "./multi-domain-environment-contracts.js";

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const MAXIMUM_RUNNER_STEPS = 16_384;
const MAXIMUM_MESSAGES_PER_STEP = 1_024;
const MAXIMUM_ACTIONS_PER_STEP = 1_024;
const MAXIMUM_MESSAGE_BYTES_PER_STEP = 16 * 1024 * 1024;
const MAXIMUM_PUBLIC_METADATA_BYTES = 64 * 1024;
const MAXIMUM_PUBLIC_METADATA_DEPTH = 32;
const MAXIMUM_PUBLIC_METADATA_NODES = 16_384;
const MAXIMUM_METRICS_PER_BASELINE = 64;

interface TeamEnvironmentV1 {
  readonly session: ShardedSimulationEnvironmentSessionV1;
  readonly episode: ShardedSimulationEpisodeV1;
}

/**
 * Executes a sparse, bounded schedule. It never expands the declared agent
 * population: a 100K profile retains only two team states and the supplied
 * logical work items.
 */
export async function runScalableEvaluationV1(
  input: ScalableEvaluationRunnerInputV1,
): Promise<ScalableEvaluationExecutionResultV1> {
  if ((input.durableStore === undefined) !== (input.runId === undefined))
    fail("runner_durable_configuration_incomplete");
  if (input.durableStore && input.runId)
    return runRestartDurableScalableEvaluationV1({
      ...input,
      durableStore: input.durableStore,
      runId: input.runId,
    });
  const descriptor = input.adapter.descriptor;
  const definition = validateScalableEvaluationDefinitionV1(
    input.definition,
    descriptor,
  );
  const steps = validateSteps(input.steps, definition);
  if (
    definition.perturbations.some(
      (entry) => entry.scheduledAtLogicalTime > steps.length,
    )
  )
    fail("runner_perturbation_outside_schedule");
  const teams = bindScalableEvaluationTeamsV1({
    definition,
    ports: input.ports,
  });
  const profile = shardedSimulationScaleProfileV1(
    definition.profile.shardedProfileId,
  );
  const assignments = createShardedSimulationAssignmentsV1({
    profile,
    shardCount: input.shardCount,
  });
  const runtime = createScalableEvaluationRuntimeV1({ definition, descriptor });
  const baselineKeys = registerBaselines(
    runtime,
    definition,
    input.recoveryBaselines ?? [],
  );
  requireBaselines(definition, baselineKeys);
  if (definition.perturbations.length > 0) {
    if (
      !input.perturbationPort ||
      typeof input.perturbationPort.injectV1 !== "function"
    )
      fail("runner_perturbation_port_missing");
    if (
      !input.recoveryMetrics ||
      typeof input.recoveryMetrics.sampleV1 !== "function"
    )
      fail("runner_recovery_metrics_missing");
    if (!input.evidenceVerifier) fail("runner_evidence_verifier_missing");
    assertScalableEvaluationEvidenceVerifierV1(input.evidenceVerifier);
  }
  if (
    input.actionAuthority &&
    typeof input.actionAuthority.issueV1 !== "function"
  )
    fail("runner_action_authority_invalid");
  const activeRecoveries = new Set<string>();
  let traceDigest = scalableEvaluationDigestV1(
    "runner-trace-genesis",
    definition.definitionDigest,
  );
  let processedSteps = 0;
  const teamEnvironments: Array<{
    readonly schemaVersion: 1;
    readonly teamId: string;
    readonly sessionDigest: PlanningDigestV1;
    readonly episodeDigest: PlanningDigestV1;
    readonly bindingDigest: PlanningDigestV1;
  }> = [];
  const finish = (
    status: ScalableEvaluationExecutionResultV1["status"],
  ): ScalableEvaluationExecutionResultV1 => {
    const body = {
      schemaVersion: 1 as const,
      status,
      processedSteps,
      teamEnvironments: Object.freeze([...teamEnvironments]),
      traceDigest,
      snapshot: invokeScalableEvaluationSnapshotV1(runtime),
      comparison: invokeScalableEvaluationCompareV1(runtime),
    };
    return Object.freeze({
      ...body,
      resultDigest: scalableEvaluationDigestV1("runner-result", body),
    });
  };
  if (input.abortSignal?.aborted) return finish("cancelled");
  let environment: Awaited<
    ReturnType<typeof openScalableEvaluationEnvironmentV1>
  >;
  try {
    environment = await openScalableEvaluationEnvironmentV1({
      definition,
      adapter: input.adapter,
      abortSignal: input.abortSignal,
    });
  } catch (error) {
    if (error instanceof ScalableEvaluationEnvironmentCancelledErrorV1)
      return finish("cancelled");
    throw error;
  }
  if (input.abortSignal?.aborted) return finish("cancelled");
  const teamEnvironmentMap = new Map<string, TeamEnvironmentV1>();
  const sessionIds = new Set<string>();
  for (const port of [teams.left, teams.right]) {
    if (input.abortSignal?.aborted) return finish("cancelled");
    const sessionRequest = {
      environmentId: descriptor.adapterId,
      logicalTime: 0,
    };
    const session = await environment.bridge.createSession(sessionRequest);
    validateSession(session, sessionRequest);
    if (input.abortSignal?.aborted) return finish("cancelled");
    if (sessionIds.has(session.sessionId))
      fail("runner_team_session_not_isolated");
    sessionIds.add(session.sessionId);
    const episodeRequest = {
      session,
      episodeId: `scalable-evaluation:${definition.evaluationId}:${port.descriptor.teamId}`,
      seed: environment.manifest.seed,
      logicalTime: 0,
    };
    const episode = await environment.bridge.startEpisode(episodeRequest);
    validateEpisode(episode, session, episodeRequest);
    invokeScalableEvaluationBindTeamEnvironmentV1(runtime, {
      teamId: port.descriptor.teamId,
      sessionId: session.sessionId,
      episodeId: episode.episodeId,
    });
    if (input.abortSignal?.aborted) return finish("cancelled");
    await environment.bridge.bindShardAssignments({
      session,
      episode,
      profile,
      assignments,
    });
    teamEnvironmentMap.set(port.descriptor.teamId, { session, episode });
    const body = {
      schemaVersion: 1 as const,
      teamId: port.descriptor.teamId,
      sessionDigest: session.sessionDigest,
      episodeDigest: episode.episodeDigest,
    };
    teamEnvironments.push(
      Object.freeze({
        ...body,
        bindingDigest: scalableEvaluationDigestV1(
          "runner-team-environment",
          body,
        ),
      }),
    );
    if (input.abortSignal?.aborted) return finish("cancelled");
  }
  let status: ScalableEvaluationExecutionResultV1["status"] = "completed";

  for (let index = 0; index < steps.length; index += 1) {
    if (input.abortSignal?.aborted) {
      status = "cancelled";
      break;
    }
    const step = steps[index]!;
    const logicalTime = index + 1;
    const injectionCancelled = await injectPerturbations({
      runtime,
      definition,
      logicalTime,
      activeRecoveries,
      perturbationPort: input.perturbationPort,
      evidenceVerifier: input.evidenceVerifier,
      teamEnvironments: teamEnvironmentMap,
      abortSignal: input.abortSignal,
    });
    if (injectionCancelled) {
      status = "cancelled";
      break;
    }
    for (const port of [teams.left, teams.right]) {
      if (input.abortSignal?.aborted) {
        status = "cancelled";
        break;
      }
      const remaining = remainingFor(runtime, port.descriptor.teamId);
      if (remaining.interactions < 2) {
        status = "budget_exhausted";
        break;
      }
      const teamEnvironment = teamEnvironmentMap.get(port.descriptor.teamId);
      if (!teamEnvironment) fail("runner_team_environment_missing");
      const { session, episode } = teamEnvironment;
      const pull = {
        schemaVersion: 1 as const,
        sessionId: session.sessionId,
        episodeId: episode.episodeId,
        peerIndex: step.peerIndex,
        logicalTime,
        cursor: step.cursor,
        requestId: `evaluation:${definition.evaluationId}:${port.descriptor.teamId}:${index}:observation`,
      };
      const delivery = await environment.bridge.pullPartialObservation(pull);
      if (
        delivery.requestId !== pull.requestId ||
        delivery.peerIndex !== pull.peerIndex ||
        delivery.logicalTime !== pull.logicalTime
      )
        fail("runner_observation_delivery_binding_invalid");
      const observationReceipt =
        invokeScalableEvaluationRecordPartialObservationV1(runtime, {
          accounting: {
            schemaVersion: 1,
            eventId: `${pull.requestId}:accounting`,
            teamId: port.descriptor.teamId,
            sequence: remaining.sequence + 1,
            logicalTime,
            domain: step.domain,
            evidenceDigest: delivery.deliveryDigest,
          },
          peerIndex: step.peerIndex,
          delivery,
          observations: delivery.observations as never,
        });
      if (input.abortSignal?.aborted) {
        traceDigest = scalableEvaluationDigestV1("runner-trace", {
          previousTraceDigest: traceDigest,
          phase: "observation",
          teamId: port.descriptor.teamId,
          peerIndex: step.peerIndex,
          logicalTime,
          deliveryDigest: delivery.deliveryDigest,
          accountingChainDigest: observationReceipt.chainDigest,
        });
        status = "cancelled";
        break;
      }
      const output = await port.stepV1({
        schemaVersion: 1,
        evaluationDefinitionDigest: definition.definitionDigest,
        teamId: port.descriptor.teamId,
        peerIndex: step.peerIndex,
        domain: step.domain,
        logicalTime,
        delivery,
        remainingInteractions: observationReceipt.remainingInteractions,
        remainingMessages: observationReceipt.remainingMessages,
        remainingMessageBytes: observationReceipt.remainingMessageBytes,
      });
      const outputData = validateOutput(
        output,
        definition,
        descriptor,
        port.descriptor.teamId,
        step.peerIndex,
        step.domain,
        logicalTime,
      );
      const messageBytes = outputData.messages.reduce(
        (total, message) => total + message.byteLength,
        0,
      );
      if (
        observationReceipt.remainingInteractions < 1 ||
        outputData.messages.length > observationReceipt.remainingMessages ||
        messageBytes > observationReceipt.remainingMessageBytes
      ) {
        status = "budget_exhausted";
        break;
      }
      const effectReceipts = await dispatchActions({
        output: outputData,
        port,
        evaluationDefinitionDigest: definition.definitionDigest,
        descriptor,
        bridge: environment.bridge,
        session,
        episode,
        teamId: port.descriptor.teamId,
        peerIndex: step.peerIndex,
        logicalTime,
        actionAuthority: input.actionAuthority,
        abortSignal: input.abortSignal,
      });
      const messageDispatch = effectReceipts.cancelled
        ? {
            digests: Object.freeze([]),
            ingressDigests: Object.freeze([]),
            messageCount: 0,
            messageBytes: 0,
            cancelled: true,
          }
        : await dispatchMessages({
            messages: outputData.messages,
            port,
            evaluationDefinitionDigest: definition.definitionDigest,
            assignments,
            bridge: environment.bridge,
            session,
            episode,
            teamId: port.descriptor.teamId,
            peerIndex: step.peerIndex,
            logicalTime,
            prefix: `${definition.evaluationId}:${port.descriptor.teamId}:${index}`,
            abortSignal: input.abortSignal,
          });
      const actionCount = effectReceipts.receipts.length;
      const accepted = effectReceipts.receipts.filter(
        (receipt) => receipt.accepted,
      ).length;
      const accounting = invokeScalableEvaluationRecordAccountingV1(runtime, {
        schemaVersion: 1,
        eventId: `evaluation:${definition.evaluationId}:${port.descriptor.teamId}:${index}:step`,
        teamId: port.descriptor.teamId,
        sequence: observationReceipt.sequence + 1,
        logicalTime,
        domain: step.domain,
        kind:
          actionCount > 0
            ? "action"
            : messageDispatch.messageCount > 0
              ? "message"
              : "decision",
        interactionCount: 1,
        messageCount: messageDispatch.messageCount,
        messageBytes: messageDispatch.messageBytes,
        observationCount: 0,
        observationCountsByDomain: { physical: 0, social: 0, cyber: 0 },
        actionCount,
        successfulOutcomeCount: accepted,
        failedOutcomeCount: actionCount - accepted,
        evidenceDigest: scalableEvaluationDigestV1("runner-step-evidence", {
          outputDigest: outputData.outputDigest,
          effects: effectReceipts.receipts.map(
            (receipt) => receipt.receiptDigest,
          ),
          effectSettlements: effectReceipts.settlementDigests,
          messages: messageDispatch.digests,
          messageIngress: messageDispatch.ingressDigests,
        }),
      });
      const dispatchCancelled =
        effectReceipts.cancelled || messageDispatch.cancelled;
      const recoverySamplingCancelled = dispatchCancelled
        ? false
        : await sampleRecoveries({
            runtime,
            definition,
            activeRecoveries,
            teamId: port.descriptor.teamId,
            logicalTime,
            metrics: input.recoveryMetrics,
            evidenceVerifier: input.evidenceVerifier,
            teamEnvironment,
            abortSignal: input.abortSignal,
          });
      traceDigest = scalableEvaluationDigestV1("runner-trace", {
        previousTraceDigest: traceDigest,
        teamId: port.descriptor.teamId,
        peerIndex: step.peerIndex,
        logicalTime,
        outputDigest: outputData.outputDigest,
        accountingChainDigest: accounting.chainDigest,
      });
      if (dispatchCancelled || recoverySamplingCancelled) {
        status = "cancelled";
        break;
      }
    }
    if (status !== "completed") break;
    processedSteps += 1;
  }
  return finish(status);
}

function validateSteps(
  input: readonly ScalableEvaluationRunnerStepV1[],
  definition: ScalableEvaluationDefinitionV1,
): readonly ScalableEvaluationRunnerStepV1[] {
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    input.length > MAXIMUM_RUNNER_STEPS
  )
    fail("runner_steps_invalid");
  return Object.freeze(
    input.map((step) => {
      if (
        !step ||
        typeof step !== "object" ||
        step.schemaVersion !== 1 ||
        !Number.isSafeInteger(step.peerIndex) ||
        step.peerIndex < 0 ||
        step.peerIndex >= definition.profile.agentCount ||
        !definition.domains.includes(step.domain) ||
        !(
          step.cursor === null ||
          (typeof step.cursor === "string" &&
            step.cursor.length > 0 &&
            step.cursor.length <= 256)
        )
      )
        fail("runner_step_invalid");
      return Object.freeze({
        schemaVersion: 1 as const,
        peerIndex: step.peerIndex,
        domain: step.domain,
        cursor: step.cursor,
      });
    }),
  );
}

function registerBaselines(
  runtime: ReturnType<typeof createScalableEvaluationRuntimeV1>,
  definition: ScalableEvaluationDefinitionV1,
  baselines: readonly ScalableEvaluationRunnerRecoveryBaselineV1[],
): Set<string> {
  if (
    !Array.isArray(baselines) ||
    baselines.length > definition.teams.length * definition.domains.length
  )
    fail("runner_baselines_invalid");
  const keys = new Set<string>();
  for (const baseline of baselines) {
    if (
      !baseline ||
      baseline.schemaVersion !== 1 ||
      !definition.teams.some((team) => team.teamId === baseline.teamId) ||
      !definition.domains.includes(baseline.domain) ||
      keys.has(key(baseline.teamId, baseline.domain))
    )
      fail("runner_baseline_invalid");
    invokeScalableEvaluationRegisterRecoveryBaselineV1(runtime, {
      ...baseline,
      establishedAtLogicalTime: 0,
    });
    keys.add(key(baseline.teamId, baseline.domain));
  }
  return keys;
}

function normalizeRunnerRecoveryBaselinesV1(
  definition: ScalableEvaluationDefinitionV1,
  input: readonly ScalableEvaluationRunnerRecoveryBaselineV1[],
): readonly ScalableEvaluationRunnerRecoveryBaselineV1[] {
  if (
    !Array.isArray(input) ||
    input.length > definition.teams.length * definition.domains.length
  )
    fail("runner_baselines_invalid");
  const keys = new Set<string>();
  const normalized = input.map((baseline) => {
    if (
      !baseline ||
      typeof baseline !== "object" ||
      !exactKeys(baseline, [
        "schemaVersion",
        "baselineId",
        "teamId",
        "domain",
        "metrics",
      ]) ||
      baseline.schemaVersion !== 1 ||
      typeof baseline.baselineId !== "string" ||
      baseline.baselineId.length === 0 ||
      baseline.baselineId.length > 256 ||
      !baseline.baselineId.trim() ||
      !definition.teams.some((team) => team.teamId === baseline.teamId) ||
      !definition.domains.includes(baseline.domain) ||
      keys.has(key(baseline.teamId, baseline.domain)) ||
      !Array.isArray(baseline.metrics) ||
      baseline.metrics.length === 0 ||
      baseline.metrics.length > MAXIMUM_METRICS_PER_BASELINE
    )
      fail("runner_baseline_invalid");
    keys.add(key(baseline.teamId, baseline.domain));
    const metricIds = new Set<string>();
    const metricInput =
      baseline.metrics as readonly ScalableEvaluationRunnerRecoveryBaselineV1["metrics"][number][];
    const metrics = metricInput
      .map(
        (
          metric: ScalableEvaluationRunnerRecoveryBaselineV1["metrics"][number],
        ) => {
          if (
            !metric ||
            typeof metric !== "object" ||
            !exactKeys(metric, [
              "metricId",
              "valueBasisPoints",
              "toleranceBasisPoints",
            ]) ||
            typeof metric.metricId !== "string" ||
            metric.metricId.length === 0 ||
            metric.metricId.length > 256 ||
            !metric.metricId.trim() ||
            metricIds.has(metric.metricId) ||
            !Number.isSafeInteger(metric.valueBasisPoints) ||
            metric.valueBasisPoints < 0 ||
            metric.valueBasisPoints > 10_000 ||
            !Number.isSafeInteger(metric.toleranceBasisPoints) ||
            metric.toleranceBasisPoints < 0 ||
            metric.toleranceBasisPoints > 10_000
          )
            fail("runner_baseline_metric_invalid");
          metricIds.add(metric.metricId);
          return {
            metricId: metric.metricId,
            valueBasisPoints: metric.valueBasisPoints,
            toleranceBasisPoints: metric.toleranceBasisPoints,
          };
        },
      )
      .sort((left, right) => left.metricId.localeCompare(right.metricId));
    return {
      schemaVersion: 1 as const,
      baselineId: baseline.baselineId,
      teamId: baseline.teamId,
      domain: baseline.domain,
      metrics,
    };
  });
  normalized.sort((left, right) =>
    key(left.teamId, left.domain).localeCompare(
      key(right.teamId, right.domain),
    ),
  );
  return deepFreezePlanning(
    normalized as unknown as PlanningJson,
  ) as unknown as readonly ScalableEvaluationRunnerRecoveryBaselineV1[];
}

function requireBaselines(
  definition: ScalableEvaluationDefinitionV1,
  keys: Set<string>,
): void {
  for (const perturbation of definition.perturbations)
    for (const teamId of perturbation.targetTeamIds)
      if (!keys.has(key(teamId, perturbation.domain)))
        fail("runner_baseline_missing");
}

async function injectPerturbations(input: {
  readonly runtime: ReturnType<typeof createScalableEvaluationRuntimeV1>;
  readonly definition: ScalableEvaluationDefinitionV1;
  readonly logicalTime: number;
  readonly activeRecoveries: Set<string>;
  readonly perturbationPort?: ScalableEvaluationPerturbationPortV1;
  readonly evidenceVerifier?: ScalableEvaluationEvidenceVerifierV1;
  readonly teamEnvironments: ReadonlyMap<string, TeamEnvironmentV1>;
  readonly abortSignal?: { readonly aborted: boolean };
}): Promise<boolean> {
  for (const perturbation of input.definition.perturbations) {
    if (perturbation.scheduledAtLogicalTime !== input.logicalTime) continue;
    if (!input.perturbationPort) fail("runner_perturbation_port_missing");
    if (!input.evidenceVerifier) fail("runner_evidence_verifier_missing");
    for (const teamId of perturbation.targetTeamIds) {
      if (input.abortSignal?.aborted) return true;
      const teamEnvironment = input.teamEnvironments.get(teamId);
      if (!teamEnvironment) fail("runner_team_environment_missing");
      const injection =
        await verifyScalableEvaluationPerturbationInjectionReceiptV1({
          receipt: await input.perturbationPort.injectV1({
            evaluationDefinitionDigest: input.definition.definitionDigest,
            perturbation,
            teamId,
            sessionId: teamEnvironment.session.sessionId,
            episodeId: teamEnvironment.episode.episodeId,
            logicalTime: input.logicalTime,
          }),
          verifier: input.evidenceVerifier,
          definition: input.definition,
          perturbation,
          teamId,
          sessionId: teamEnvironment.session.sessionId,
          episodeId: teamEnvironment.episode.episodeId,
          logicalTime: input.logicalTime,
        });
      invokeScalableEvaluationRecordPerturbationObservationV1(input.runtime, {
        receipt: injection,
      });
      input.activeRecoveries.add(key(perturbation.perturbationId, teamId));
      if (input.abortSignal?.aborted) return true;
    }
  }
  return false;
}

async function sampleRecoveries(input: {
  readonly runtime: ReturnType<typeof createScalableEvaluationRuntimeV1>;
  readonly definition: ScalableEvaluationDefinitionV1;
  readonly activeRecoveries: Set<string>;
  readonly teamId: string;
  readonly logicalTime: number;
  readonly metrics?: ScalableEvaluationRecoveryMetricPortV1;
  readonly evidenceVerifier?: ScalableEvaluationEvidenceVerifierV1;
  readonly teamEnvironment: TeamEnvironmentV1;
  readonly abortSignal?: { readonly aborted: boolean };
}): Promise<boolean> {
  if (!input.metrics) return false;
  if (!input.evidenceVerifier) fail("runner_evidence_verifier_missing");
  for (const perturbation of input.definition.perturbations) {
    const recoveryKey = key(perturbation.perturbationId, input.teamId);
    if (!input.activeRecoveries.has(recoveryKey)) continue;
    if (input.abortSignal?.aborted) return true;
    const sampleId = `recovery:${perturbation.perturbationId}:${input.teamId}:${input.logicalTime}`;
    const measurement =
      await verifyScalableEvaluationRecoveryMeasurementReceiptV1({
        receipt: await input.metrics.sampleV1({
          definition: input.definition,
          perturbation,
          teamId: input.teamId,
          domain: perturbation.domain,
          sampleId,
          sessionId: input.teamEnvironment.session.sessionId,
          episodeId: input.teamEnvironment.episode.episodeId,
          logicalTime: input.logicalTime,
        }),
        verifier: input.evidenceVerifier,
        definition: input.definition,
        perturbation,
        teamId: input.teamId,
        sampleId,
        sessionId: input.teamEnvironment.session.sessionId,
        episodeId: input.teamEnvironment.episode.episodeId,
        logicalTime: input.logicalTime,
      });
    const sample = invokeScalableEvaluationRecordRecoverySampleV1(
      input.runtime,
      {
        measurement,
      },
    );
    if (sample.withinBaselineTolerance)
      input.activeRecoveries.delete(recoveryKey);
    if (input.abortSignal?.aborted) return true;
  }
  return false;
}

function remainingFor(
  runtime: ReturnType<typeof createScalableEvaluationRuntimeV1>,
  teamId: string,
): { readonly sequence: number; readonly interactions: number } {
  const summary = invokeScalableEvaluationSnapshotV1(
    runtime,
  ).teamSummaries.find((team) => team.teamId === teamId);
  if (!summary) fail("runner_team_missing");
  return {
    sequence: summary.lastSequence,
    interactions:
      scalableEvaluationRuntimeDefinitionV1(runtime).profile.budget
        .maximumInteractions - summary.counters.interactions,
  };
}

function validateOutput(
  output: ScalableEvaluationTeamStepOutputV1,
  definition: ScalableEvaluationDefinitionV1,
  descriptor: MultiDomainEnvironmentAdapterV1["descriptor"],
  teamId: string,
  peerIndex: number,
  domain: ScalableEvaluationDefinitionV1["domains"][number],
  logicalTime: number,
): ScalableEvaluationTeamStepOutputV1 {
  if (
    !output ||
    typeof output !== "object" ||
    output.schemaVersion !== 1 ||
    output.teamId !== teamId ||
    output.logicalTime !== logicalTime ||
    !Array.isArray(output.messages) ||
    !Array.isArray(output.actions) ||
    output.messages.length > MAXIMUM_MESSAGES_PER_STEP ||
    output.actions.length > MAXIMUM_ACTIONS_PER_STEP ||
    !DIGEST.test(output.outputDigest)
  )
    fail("runner_step_output_invalid");
  const messageIds = new Set<string>();
  let byteLength = 0;
  const messages = output.messages.map((message) =>
    validateMessage(
      message,
      peerIndex,
      definition.profile.agentCount,
      messageIds,
      (next) => {
        byteLength += next;
      },
    ),
  );
  if (byteLength > MAXIMUM_MESSAGE_BYTES_PER_STEP)
    fail("runner_step_message_bytes_exceeded");
  const actions = output.actions.map((action) => {
    const validated = validateMultiDomainActionEnvelopeV1(action, descriptor);
    if (validated.domain !== domain) fail("runner_action_domain_mismatch");
    if (
      jsonBytes(validated) >
      definition.scenario.resourceBudget.maximumActionBytes
    )
      fail("runner_action_scenario_bytes_exceeded");
    return validated;
  });
  const publicMetadata =
    output.publicMetadata === undefined
      ? undefined
      : boundedPublicMetadata(output.publicMetadata);
  const body = {
    schemaVersion: 1 as const,
    teamId: output.teamId,
    logicalTime: output.logicalTime,
    messages,
    actions,
    ...(publicMetadata === undefined ? {} : { publicMetadata }),
  };
  if (
    scalableEvaluationDigestV1("team-step-output", body) !== output.outputDigest
  )
    fail("runner_step_output_digest_invalid");
  return Object.freeze({ ...body, outputDigest: output.outputDigest });
}

function validateMessage(
  message: ScalableEvaluationTeamMessageV1,
  sourcePeerIndex: number,
  agentCount: number,
  ids: Set<string>,
  addBytes: (value: number) => void,
): ScalableEvaluationTeamMessageV1 {
  let transportEnvelope: PlanningJson;
  let transportEnvelopeDigest: PlanningDigestV1;
  let byteLength: number;
  try {
    transportEnvelope = deepFreezePlanning(message.transportEnvelope);
    transportEnvelopeDigest = scalableEvaluationDigestV1(
      "team-message-transport-envelope",
      transportEnvelope,
    );
    byteLength = new TextEncoder().encode(
      JSON.stringify(transportEnvelope),
    ).byteLength;
  } catch {
    fail("runner_team_message_transport_invalid");
  }
  if (
    !message ||
    typeof message !== "object" ||
    !exactKeys(message, [
      "schemaVersion",
      "messageId",
      "sourcePeerIndex",
      "targetPeerIndex",
      "payloadDigest",
      "transportEnvelope",
      "transportEnvelopeDigest",
      "byteLength",
    ]) ||
    message.schemaVersion !== 1 ||
    typeof message.messageId !== "string" ||
    message.messageId.length === 0 ||
    message.messageId.length > 256 ||
    ids.has(message.messageId) ||
    message.sourcePeerIndex !== sourcePeerIndex ||
    !Number.isSafeInteger(message.targetPeerIndex) ||
    message.targetPeerIndex < 0 ||
    message.targetPeerIndex >= agentCount ||
    !DIGEST.test(message.payloadDigest) ||
    message.transportEnvelopeDigest !== transportEnvelopeDigest ||
    !Number.isSafeInteger(message.byteLength) ||
    message.byteLength < 1 ||
    message.byteLength !== byteLength ||
    message.byteLength > MAXIMUM_MESSAGE_BYTES_PER_STEP
  )
    fail("runner_team_message_invalid");
  ids.add(message.messageId);
  addBytes(message.byteLength);
  return Object.freeze({ ...message, transportEnvelope });
}

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function boundedPublicMetadata(value: PlanningJson): PlanningJson {
  let nodes = 0;
  const visit = (current: PlanningJson, depth: number): PlanningJson => {
    nodes += 1;
    if (
      nodes > MAXIMUM_PUBLIC_METADATA_NODES ||
      depth > MAXIMUM_PUBLIC_METADATA_DEPTH
    )
      fail("runner_public_metadata_structure_exceeded");
    if (current === null || typeof current !== "object") return current;
    if (Array.isArray(current))
      return Object.freeze(
        current.map((item) => visit(item, depth + 1)),
      ) as unknown as PlanningJson;
    const output: Record<string, PlanningJson> = {};
    for (const key of Object.keys(current).sort())
      output[key] = visit(current[key]!, depth + 1);
    return Object.freeze(output);
  };
  const snapshot = visit(value, 0);
  if (jsonBytes(snapshot) > MAXIMUM_PUBLIC_METADATA_BYTES)
    fail("runner_public_metadata_bytes_exceeded");
  return snapshot;
}

async function dispatchActions(input: {
  readonly output: ScalableEvaluationTeamStepOutputV1;
  readonly port: ScalableEvaluationTeamPortV1;
  readonly evaluationDefinitionDigest: PlanningDigestV1;
  readonly descriptor: MultiDomainEnvironmentAdapterV1["descriptor"];
  readonly bridge: Awaited<
    ReturnType<typeof openScalableEvaluationEnvironmentV1>
  >["bridge"];
  readonly session: ShardedSimulationEnvironmentSessionV1;
  readonly episode: ShardedSimulationEpisodeV1;
  readonly teamId: string;
  readonly peerIndex: number;
  readonly logicalTime: number;
  readonly actionAuthority?: ScalableEvaluationActionAuthorityV1;
  readonly abortSignal?: { readonly aborted: boolean };
}): Promise<{
  readonly receipts: readonly ShardedSimulationEffectReceiptV1[];
  readonly settlementDigests: readonly PlanningDigestV1[];
  readonly cancelled: boolean;
}> {
  const receipts: ShardedSimulationEffectReceiptV1[] = [];
  const settlementDigests: PlanningDigestV1[] = [];
  if (input.abortSignal?.aborted)
    return Object.freeze({
      receipts: Object.freeze(receipts),
      settlementDigests: Object.freeze(settlementDigests),
      cancelled: true,
    });
  if (input.output.actions.length > 0 && !input.actionAuthority)
    fail("runner_action_authority_missing");
  for (let index = 0; index < input.output.actions.length; index += 1) {
    if (input.abortSignal?.aborted)
      return Object.freeze({
        receipts: Object.freeze(receipts),
        settlementDigests: Object.freeze(settlementDigests),
        cancelled: true,
      });
    const authority = input.actionAuthority!.issueV1({
      teamId: input.teamId,
      peerIndex: input.peerIndex,
      logicalTime: input.logicalTime,
      actionIndex: index,
      sessionId: input.session.sessionId,
      episodeId: input.episode.episodeId,
    });
    if (
      !authority ||
      !Number.isSafeInteger(authority.executionEpoch) ||
      authority.executionEpoch < 1 ||
      typeof authority.fenceToken !== "string" ||
      authority.fenceToken.length === 0 ||
      authority.fenceToken.length > 256
    )
      fail("runner_action_authority_invalid");
    if (input.abortSignal?.aborted)
      return Object.freeze({
        receipts: Object.freeze(receipts),
        settlementDigests: Object.freeze(settlementDigests),
        cancelled: true,
      });
    const body = {
      schemaVersion: 1 as const,
      actionId: `evaluation:${input.teamId}:${input.logicalTime}:${index}`,
      sessionId: input.session.sessionId,
      episodeId: input.episode.episodeId,
      peerIndex: input.peerIndex,
      logicalTime: input.logicalTime,
      executionEpoch: authority.executionEpoch,
      fenceToken: authority.fenceToken,
      action: input.output.actions[index]! as unknown as PlanningJson,
    };
    const request = {
      ...body,
      actionDigest: shardedSimulationFencedActionDigestV1(body),
    };
    const receipt = validateShardedSimulationEffectReceiptV1(
      await input.bridge.requestEffect(request),
      request,
    );
    receipts.push(receipt);
    if (input.port.settleActionV1) {
      const settlementInput = Object.freeze({
        schemaVersion: 1 as const,
        evaluationDefinitionDigest: input.evaluationDefinitionDigest,
        teamId: input.teamId,
        sessionId: input.session.sessionId,
        episodeId: input.episode.episodeId,
        peerIndex: input.peerIndex,
        logicalTime: input.logicalTime,
        actionIndex: index,
        outputDigest: input.output.outputDigest,
        action: input.output.actions[index]!,
        request,
        effectReceipt: receipt,
      });
      const settlement = validateActionSettlementReceipt(
        await input.port.settleActionV1(settlementInput),
        settlementInput,
      );
      if (settlement.status !== "settled")
        fail("runner_action_reconciliation_not_canonical");
      settlementDigests.push(settlement.receiptDigest);
    }
    if (input.abortSignal?.aborted)
      return Object.freeze({
        receipts: Object.freeze(receipts),
        settlementDigests: Object.freeze(settlementDigests),
        cancelled: true,
      });
  }
  return Object.freeze({
    receipts: Object.freeze(receipts),
    settlementDigests: Object.freeze(settlementDigests),
    cancelled: false,
  });
}

async function dispatchMessages(input: {
  readonly messages: readonly ScalableEvaluationTeamMessageV1[];
  readonly port: ScalableEvaluationTeamPortV1;
  readonly evaluationDefinitionDigest: PlanningDigestV1;
  readonly assignments: ReturnType<typeof createShardedSimulationAssignmentsV1>;
  readonly bridge: Awaited<
    ReturnType<typeof openScalableEvaluationEnvironmentV1>
  >["bridge"];
  readonly session: ShardedSimulationEnvironmentSessionV1;
  readonly episode: ShardedSimulationEpisodeV1;
  readonly teamId: string;
  readonly peerIndex: number;
  readonly logicalTime: number;
  readonly prefix: string;
  readonly abortSignal?: { readonly aborted: boolean };
}): Promise<{
  readonly digests: readonly PlanningDigestV1[];
  readonly ingressDigests: readonly PlanningDigestV1[];
  readonly messageCount: number;
  readonly messageBytes: number;
  readonly cancelled: boolean;
}> {
  const digests: PlanningDigestV1[] = [];
  const ingressDigests: PlanningDigestV1[] = [];
  if (input.messages.length > 0 && !input.port.ingestAcknowledgedMessageV1)
    fail("runner_team_message_ingress_missing");
  let messageCount = 0;
  let messageBytes = 0;
  for (const message of input.messages) {
    if (input.abortSignal?.aborted)
      return Object.freeze({
        digests: Object.freeze(digests),
        ingressDigests: Object.freeze(ingressDigests),
        messageCount,
        messageBytes,
        cancelled: true,
      });
    const source = shardedSimulationAssignmentForPeerV1(
      input.assignments,
      message.sourcePeerIndex,
    );
    const target = shardedSimulationAssignmentForPeerV1(
      input.assignments,
      message.targetPeerIndex,
    );
    const eventId = `${input.prefix}:${message.messageId}`;
    const batch = createShardedSimulationCrossShardMessageBatchV1({
      batchId: `batch:${eventId}`,
      sessionId: input.session.sessionId,
      episodeId: input.episode.episodeId,
      sourceShardId: source.shardId,
      targetShardId: target.shardId,
      logicalTime: input.logicalTime,
      messages: [
        {
          schemaVersion: 1,
          eventId,
          sourcePeerIndex: message.sourcePeerIndex,
          targetPeerIndex: message.targetPeerIndex,
          logicalTime: input.logicalTime,
          payloadDigest: message.transportEnvelopeDigest,
        },
      ],
    });
    const ack = await input.bridge.deliverCrossShardBatch(batch);
    validateShardedSimulationCrossShardMessageAckV1(
      ack,
      batch.batchId,
      batch.batchDigest,
      [eventId],
    );
    const ingressInput = Object.freeze({
      schemaVersion: 1 as const,
      evaluationDefinitionDigest: input.evaluationDefinitionDigest,
      teamId: input.teamId,
      sessionId: input.session.sessionId,
      episodeId: input.episode.episodeId,
      logicalTime: input.logicalTime,
      eventId,
      batch,
      bridgeAck: ack,
      message,
    });
    const ingress = validateMessageIngressReceipt(
      await input.port.ingestAcknowledgedMessageV1!(ingressInput),
      ingressInput,
    );
    digests.push(ack.ackDigest);
    ingressDigests.push(ingress.receiptDigest);
    messageCount += 1;
    messageBytes += message.byteLength;
    if (input.abortSignal?.aborted)
      return Object.freeze({
        digests: Object.freeze(digests),
        ingressDigests: Object.freeze(ingressDigests),
        messageCount,
        messageBytes,
        cancelled: true,
      });
  }
  return Object.freeze({
    digests: Object.freeze(digests),
    ingressDigests: Object.freeze(ingressDigests),
    messageCount,
    messageBytes,
    cancelled: false,
  });
}

interface DurableSagaV1 {
  readonly delivery?: import("./sharded-simulation-contracts.js").ShardedSimulationPartialObservationDeliveryV1;
  readonly observationReceipt?: import("./scalable-evaluation-contracts.js").ScalableEvaluationAccountingReceiptV1;
  readonly output?: ScalableEvaluationTeamStepOutputV1;
  readonly effectReceipts?: readonly ShardedSimulationEffectReceiptV1[];
  readonly settlementDigests?: readonly PlanningDigestV1[];
  readonly messageDigests?: readonly PlanningDigestV1[];
  readonly ingressDigests?: readonly PlanningDigestV1[];
  readonly messageCount?: number;
  readonly messageBytes?: number;
  readonly status?: ScalableEvaluationExecutionResultV1["status"];
}

interface DurableTeamEnvironmentV1 extends TeamEnvironmentV1 {
  environmentCheckpoint?: import("./sharded-simulation-contracts.js").ShardedSimulationCheckpointV1;
  teamCheckpoint?: import("./scalable-evaluation-contracts.js").ScalableEvaluationTeamCheckpointV1;
}

/** Restart-durable path selected only by an explicit store/run identifier pair. */
async function runRestartDurableScalableEvaluationV1(
  input: ScalableEvaluationRunnerInputV1 & {
    readonly durableStore: NonNullable<
      ScalableEvaluationRunnerInputV1["durableStore"]
    >;
    readonly runId: string;
  },
): Promise<ScalableEvaluationExecutionResultV1> {
  const runId = input.runId;
  const durableStore = input.durableStore;
  const adapter = input.adapter;
  const ports = input.ports;
  const shardCount = input.shardCount;
  const perturbationPort = input.perturbationPort;
  const recoveryMetrics = input.recoveryMetrics;
  const evidenceVerifier = input.evidenceVerifier;
  const actionAuthority = input.actionAuthority;
  const abortSignal = input.abortSignal;
  if (!runId || runId.length > 256 || !runId.trim())
    fail("runner_run_id_invalid");
  assertScalableEvaluationRestartDurabilityDeclarationV1(
    durableStore.restartDurabilityV1,
  );
  const descriptor = adapter.descriptor;
  const definition = validateScalableEvaluationDefinitionV1(
    input.definition,
    descriptor,
  );
  const steps = validateSteps(input.steps, definition);
  if (
    definition.perturbations.some(
      (entry) => entry.scheduledAtLogicalTime > steps.length,
    )
  )
    fail("runner_perturbation_outside_schedule");
  const teams = bindScalableEvaluationTeamsV1({
    definition,
    ports,
  });
  const orderedPorts = [teams.left, teams.right] as const;
  for (const port of orderedPorts) assertResumableTeamPort(port);
  const profile = shardedSimulationScaleProfileV1(
    definition.profile.shardedProfileId,
  );
  const assignments = createShardedSimulationAssignmentsV1({
    profile,
    shardCount,
  });
  const baselineInput = normalizeRunnerRecoveryBaselinesV1(
    definition,
    input.recoveryBaselines ?? [],
  );
  if (definition.perturbations.length > 0) {
    if (!perturbationPort || !recoveryMetrics)
      fail("runner_durable_recovery_ports_missing");
    assertResumableExternalPort(
      perturbationPort,
      "reconcileInjectionV1",
      "runner_perturbation_port_not_resumable",
    );
    assertResumableExternalPort(
      recoveryMetrics,
      "reconcileSampleV1",
      "runner_recovery_metrics_not_resumable",
    );
    if (!evidenceVerifier) fail("runner_evidence_verifier_missing");
    assertScalableEvaluationEvidenceVerifierV1(evidenceVerifier);
  }
  const scheduleDigest = scalableEvaluationDigestV1("runner-schedule", steps);
  const portsDigest = scalableEvaluationDigestV1("runner-ports", {
    teams: orderedPorts.map((port) => ({
      descriptorDigest: port.descriptor.descriptorDigest,
      durabilityDeclarationDigest: (
        port as ScalableEvaluationResumableTeamPortV1
      ).restartDurabilityV1.declarationDigest,
    })),
    perturbationDurabilityDeclarationDigest:
      perturbationPort && "restartDurabilityV1" in perturbationPort
        ? (
            perturbationPort.restartDurabilityV1 as import("./scalable-evaluation-contracts.js").ScalableEvaluationRestartDurabilityDeclarationV1
          ).declarationDigest
        : null,
    recoveryDurabilityDeclarationDigest:
      recoveryMetrics && "restartDurabilityV1" in recoveryMetrics
        ? (
            recoveryMetrics.restartDurabilityV1 as import("./scalable-evaluation-contracts.js").ScalableEvaluationRestartDurabilityDeclarationV1
          ).declarationDigest
        : null,
    actionAuthorityDurabilityDeclarationDigest:
      actionAuthority && "restartDurabilityV1" in actionAuthority
        ? (
            actionAuthority.restartDurabilityV1 as import("./scalable-evaluation-contracts.js").ScalableEvaluationRestartDurabilityDeclarationV1
          ).declarationDigest
        : null,
  });
  const configurationBasisDigest = scalableEvaluationDigestV1(
    "runner-durable-configuration-basis",
    {
      runId,
      definitionDigest: definition.definitionDigest,
      adapterDescriptorDigest: descriptor.descriptorDigest,
      scheduleDigest,
      portsDigest,
      shardCount,
      assignmentDigests: assignments.map((entry) => entry.assignmentDigest),
      baselines: baselineInput,
      checkpointStoreDeclarationDigest:
        durableStore.restartDurabilityV1.declarationDigest,
    },
  );
  let environment: Awaited<
    ReturnType<typeof openScalableEvaluationEnvironmentV1>
  >;
  try {
    environment = await openScalableEvaluationEnvironmentV1({
      definition,
      adapter,
      abortSignal,
    });
  } catch (error) {
    if (error instanceof ScalableEvaluationEnvironmentCancelledErrorV1)
      return emptyDurableCancelledResult(definition, descriptor);
    throw error;
  }
  const bridge = assertResumableEnvironmentBridge(environment.bridge);
  const configurationDigest = scalableEvaluationDigestV1(
    "runner-durable-configuration",
    {
      configurationBasisDigest,
      environmentDurabilityDeclarationDigest:
        bridge.restartDurabilityV1.declarationDigest,
    },
  );
  const loadedRaw = await durableStore.loadV1({ runId });
  if (
    loadedRaw &&
    scalableEvaluationCheckpointBytesV1(loadedRaw) >
      durableStore.restartDurabilityV1.maximumCheckpointBytes
  )
    fail("runner_checkpoint_capacity_exceeded");
  const loaded = loadedRaw
    ? validateScalableEvaluationRunnerCheckpointV1(loadedRaw)
    : null;
  if (
    loaded &&
    (loaded.runId !== runId ||
      loaded.definitionDigest !== definition.definitionDigest ||
      loaded.adapterDescriptorDigest !== descriptor.descriptorDigest ||
      loaded.scheduleDigest !== scheduleDigest ||
      loaded.portsDigest !== portsDigest ||
      loaded.configurationDigest !== configurationDigest)
  )
    fail("runner_checkpoint_configuration_mismatch");
  if (
    loaded &&
    (loaded.stepIndex > steps.length ||
      (loaded.phase !== "complete" && loaded.stepIndex === steps.length) ||
      loaded.logicalTime !== Math.min(loaded.stepIndex + 1, steps.length) ||
      loaded.activeRecoveries.some(
        (active) =>
          !definition.perturbations.some((perturbation) =>
            perturbation.targetTeamIds.some(
              (teamId) => key(perturbation.perturbationId, teamId) === active,
            ),
          ),
      ))
  )
    fail("runner_checkpoint_cursor_invalid");

  let runtime = loaded
    ? restoreScalableEvaluationRuntimeV1({
        definition,
        descriptor,
        state: loaded.runtimeState,
      })
    : createScalableEvaluationRuntimeV1({ definition, descriptor });
  let phase: ScalableEvaluationRunnerCheckpointV1["phase"] =
    loaded?.phase ?? "perturbation";
  let stepIndex = loaded?.stepIndex ?? 0;
  let teamIndex = loaded?.teamIndex ?? 0;
  let phaseCursor = loaded?.phaseCursor ?? 0;
  let processedSteps = loaded?.processedSteps ?? 0;
  let traceDigest =
    loaded?.traceDigest ??
    scalableEvaluationDigestV1(
      "runner-trace-genesis",
      definition.definitionDigest,
    );
  let saga = (loaded?.saga ?? {}) as unknown as DurableSagaV1;
  const activeRecoveries = new Set(loaded?.activeRecoveries ?? []);
  let durableRevision = loaded?.revision ?? 0;
  let previousCheckpointDigest = loaded?.checkpointDigest ?? null;
  const teamEnvironmentMap = new Map<string, DurableTeamEnvironmentV1>();

  for (let index = 0; index < orderedPorts.length; index += 1) {
    const port = orderedPorts[index] as ScalableEvaluationResumableTeamPortV1;
    const prior = loaded?.teamEnvironments.find(
      (entry) => entry.teamId === port.descriptor.teamId,
    );
    if (prior)
      validateShardedSimulationCheckpointV1(prior.environmentCheckpoint);
    const sessionRequest = {
      operationId: operationId(runId, "environment-session", {
        teamId: port.descriptor.teamId,
      }),
      environmentId: descriptor.adapterId,
      logicalTime: 0,
    };
    const session = await bridge.reconcileSessionV1(sessionRequest);
    validateSession(session, sessionRequest);
    if (prior && session.sessionDigest !== prior.session.sessionDigest)
      fail("runner_resumed_session_mismatch");
    const episodeRequest = {
      operationId: operationId(runId, "environment-episode", {
        teamId: port.descriptor.teamId,
      }),
      session,
      episodeId: `scalable-evaluation:${definition.evaluationId}:${port.descriptor.teamId}`,
      seed: environment.manifest.seed,
      logicalTime: 0,
    };
    const episode = await bridge.reconcileEpisodeV1(episodeRequest);
    validateEpisode(episode, session, episodeRequest);
    if (prior && episode.episodeDigest !== prior.episode.episodeDigest)
      fail("runner_resumed_episode_mismatch");
    await bridge.reconcileShardAssignmentsV1({
      operationId: operationId(runId, "environment-assignments", {
        teamId: port.descriptor.teamId,
        assignments: assignments.map((entry) => entry.assignmentDigest),
      }),
      session,
      episode,
      profile,
      assignments,
    });
    if (prior) {
      const restoreOperationId = operationId(runId, "environment-restore", {
        checkpointDigest: prior.environmentCheckpoint.checkpointDigest,
      });
      validateEnvironmentRestoreReceipt(
        await bridge.reconcileRestoreV1({
          operationId: restoreOperationId,
          request: {
            schemaVersion: 1,
            checkpoint: prior.environmentCheckpoint,
            expectedAnchorDigest:
              prior.environmentCheckpoint.anchor.anchorDigest,
          },
        }),
        prior.environmentCheckpoint,
      );
      const teamRestoreOperationId = operationId(runId, "team-restore", {
        checkpointDigest: prior.teamCheckpoint.checkpointDigest,
      });
      validateScalableEvaluationTeamRestoreReceiptV1(
        await port.restoreV1({
          operationId: teamRestoreOperationId,
          runId,
          checkpoint: prior.teamCheckpoint,
        }),
        prior.teamCheckpoint,
        teamRestoreOperationId,
      );
    } else {
      invokeScalableEvaluationBindTeamEnvironmentV1(runtime, {
        teamId: port.descriptor.teamId,
        sessionId: session.sessionId,
        episodeId: episode.episodeId,
      });
    }
    teamEnvironmentMap.set(port.descriptor.teamId, {
      session,
      episode,
      ...(prior
        ? {
            environmentCheckpoint: prior.environmentCheckpoint,
            teamCheckpoint: prior.teamCheckpoint,
          }
        : {}),
    });
  }
  if (!loaded) {
    const baselineKeys = registerBaselines(runtime, definition, baselineInput);
    requireBaselines(definition, baselineKeys);
  }

  const persist = async (): Promise<void> => {
    const nextRevision = durableRevision + 1;
    const logicalTime = Math.min(stepIndex + 1, steps.length);
    const checkpointEnvironments: Array<
      ScalableEvaluationRunnerCheckpointV1["teamEnvironments"][number]
    > = [];
    for (const portValue of orderedPorts) {
      const port = portValue as ScalableEvaluationResumableTeamPortV1;
      const current = teamEnvironmentMap.get(port.descriptor.teamId);
      if (!current) fail("runner_team_environment_missing");
      const environmentOperationId = operationId(
        runId,
        "environment-checkpoint",
        { revision: nextRevision, teamId: port.descriptor.teamId },
      );
      const environmentCheckpoint = validateShardedSimulationCheckpointV1(
        await bridge.reconcileCheckpointV1({
          operationId: environmentOperationId,
          session: current.session,
          episode: current.episode,
          expectedRevision: current.environmentCheckpoint?.revision ?? 0,
          logicalTime,
        }),
      );
      if (
        environmentCheckpoint.sessionId !== current.session.sessionId ||
        environmentCheckpoint.episodeId !== current.episode.episodeId ||
        environmentCheckpoint.logicalTime !== logicalTime ||
        environmentCheckpoint.revision !==
          (current.environmentCheckpoint?.revision ?? 0) + 1 ||
        environmentCheckpoint.anchor.previousAnchorDigest !==
          (current.environmentCheckpoint?.anchor.anchorDigest ?? null)
      )
        fail("runner_environment_checkpoint_binding_invalid");
      const teamOperationId = operationId(runId, "team-checkpoint", {
        revision: nextRevision,
        teamId: port.descriptor.teamId,
      });
      const teamCheckpoint = validateScalableEvaluationTeamCheckpointV1(
        await port.checkpointV1({
          operationId: teamOperationId,
          runId,
          definitionDigest: definition.definitionDigest,
          expectedRevision: current.teamCheckpoint?.revision ?? 0,
          logicalTime,
        }),
      );
      if (
        teamCheckpoint.operationId !== teamOperationId ||
        teamCheckpoint.teamId !== port.descriptor.teamId ||
        teamCheckpoint.definitionDigest !== definition.definitionDigest ||
        teamCheckpoint.descriptorDigest !== port.descriptor.descriptorDigest ||
        teamCheckpoint.logicalTime !== logicalTime ||
        teamCheckpoint.revision !==
          (current.teamCheckpoint?.revision ?? 0) + 1 ||
        teamCheckpoint.previousCheckpointDigest !==
          (current.teamCheckpoint?.checkpointDigest ?? null)
      )
        fail("runner_team_checkpoint_binding_invalid");
      current.environmentCheckpoint = environmentCheckpoint;
      current.teamCheckpoint = teamCheckpoint;
      checkpointEnvironments.push({
        teamId: port.descriptor.teamId,
        session: current.session,
        episode: current.episode,
        environmentCheckpoint,
        teamCheckpoint,
      });
    }
    const checkpoint = createScalableEvaluationRunnerCheckpointV1({
      schemaVersion: 1,
      runId,
      revision: nextRevision,
      previousCheckpointDigest,
      definitionDigest: definition.definitionDigest,
      adapterDescriptorDigest: descriptor.descriptorDigest,
      scheduleDigest,
      portsDigest,
      configurationDigest,
      phase,
      stepIndex,
      teamIndex,
      phaseCursor,
      processedSteps,
      logicalTime,
      traceDigest,
      activeRecoveries: Object.freeze([...activeRecoveries].sort()),
      runtimeState: invokeScalableEvaluationExportStateV1(runtime),
      teamEnvironments: Object.freeze(checkpointEnvironments),
      saga: saga as unknown as PlanningJson,
    });
    const maximumCheckpointBytes = Math.min(
      durableStore.restartDurabilityV1.maximumCheckpointBytes,
      bridge.restartDurabilityV1.maximumCheckpointBytes,
      ...orderedPorts.map(
        (port) =>
          (port as ScalableEvaluationResumableTeamPortV1).restartDurabilityV1
            .maximumCheckpointBytes,
      ),
    );
    if (
      scalableEvaluationCheckpointBytesV1(checkpoint) > maximumCheckpointBytes
    )
      fail("runner_checkpoint_capacity_exceeded");
    const receipt = validateScalableEvaluationCheckpointStoreCasReceiptV1(
      await durableStore.compareAndSwapV1({
        runId,
        expectedRevision: durableRevision === 0 ? null : durableRevision,
        checkpoint,
      }),
      checkpoint,
    );
    if (receipt.status === "conflict") fail("runner_checkpoint_cas_conflict");
    durableRevision = checkpoint.revision;
    previousCheckpointDigest = checkpoint.checkpointDigest;
  };

  const finish = (
    status: ScalableEvaluationExecutionResultV1["status"],
  ): ScalableEvaluationExecutionResultV1 => {
    const teamEnvironments = orderedPorts.map((port) => {
      const value = teamEnvironmentMap.get(port.descriptor.teamId);
      if (!value) fail("runner_team_environment_missing");
      const body = {
        schemaVersion: 1 as const,
        teamId: port.descriptor.teamId,
        sessionDigest: value.session.sessionDigest,
        episodeDigest: value.episode.episodeDigest,
      };
      return Object.freeze({
        ...body,
        bindingDigest: scalableEvaluationDigestV1(
          "runner-team-environment",
          body,
        ),
      });
    });
    const body = {
      schemaVersion: 1 as const,
      status,
      processedSteps,
      teamEnvironments: Object.freeze(teamEnvironments),
      traceDigest,
      snapshot: invokeScalableEvaluationSnapshotV1(runtime),
      comparison: invokeScalableEvaluationCompareV1(runtime),
    };
    return Object.freeze({
      ...body,
      resultDigest: scalableEvaluationDigestV1("runner-result", body),
    });
  };

  if (!loaded) await persist();
  while (phase !== "complete") {
    if (abortSignal?.aborted) return finish("cancelled");
    const logicalTime = stepIndex + 1;
    const step = steps[stepIndex];
    if (!step) {
      phase = "complete";
      saga = { status: "completed" };
      await persist();
      break;
    }
    if (phase === "perturbation") {
      const scheduled = definition.perturbations.flatMap((perturbation) =>
        perturbation.scheduledAtLogicalTime === logicalTime
          ? perturbation.targetTeamIds.map((teamId) => ({
              perturbation,
              teamId,
            }))
          : [],
      );
      const target = scheduled[phaseCursor];
      if (!target) {
        phase = "observation";
        teamIndex = 0;
        phaseCursor = 0;
        saga = {};
        await persist();
        continue;
      }
      const teamEnvironment = teamEnvironmentMap.get(target.teamId);
      if (!teamEnvironment) fail("runner_team_environment_missing");
      const operation = operationId(runId, "perturbation", {
        perturbationId: target.perturbation.perturbationId,
        configurationDigest: target.perturbation.configurationDigest,
        teamId: target.teamId,
        logicalTime,
      });
      const port =
        perturbationPort as import("./scalable-evaluation-contracts.js").ScalableEvaluationResumablePerturbationPortV1;
      const receipt =
        await verifyScalableEvaluationPerturbationInjectionReceiptV1({
          receipt: await port.reconcileInjectionV1({
            operationId: operation,
            evaluationDefinitionDigest: definition.definitionDigest,
            perturbation: target.perturbation,
            teamId: target.teamId,
            sessionId: teamEnvironment.session.sessionId,
            episodeId: teamEnvironment.episode.episodeId,
            logicalTime,
          }),
          verifier: evidenceVerifier!,
          definition,
          perturbation: target.perturbation,
          teamId: target.teamId,
          sessionId: teamEnvironment.session.sessionId,
          episodeId: teamEnvironment.episode.episodeId,
          logicalTime,
        });
      invokeScalableEvaluationRecordPerturbationObservationV1(runtime, {
        receipt,
      });
      activeRecoveries.add(
        key(target.perturbation.perturbationId, target.teamId),
      );
      phaseCursor += 1;
      await persist();
      continue;
    }
    const port = orderedPorts[
      teamIndex
    ] as ScalableEvaluationResumableTeamPortV1;
    const teamEnvironment = teamEnvironmentMap.get(port.descriptor.teamId);
    if (!teamEnvironment) fail("runner_team_environment_missing");
    if (phase === "observation") {
      const remaining = remainingFor(runtime, port.descriptor.teamId);
      if (remaining.interactions < 2) {
        phase = "complete";
        saga = { status: "budget_exhausted" };
        await persist();
        break;
      }
      const pull = {
        schemaVersion: 1 as const,
        sessionId: teamEnvironment.session.sessionId,
        episodeId: teamEnvironment.episode.episodeId,
        peerIndex: step.peerIndex,
        logicalTime,
        cursor: step.cursor,
        requestId: operationId(runId, "observation-request", {
          stepIndex,
          teamId: port.descriptor.teamId,
        }),
      };
      const delivery = await bridge.reconcileObservationV1({
        operationId: pull.requestId,
        pull,
      });
      if (
        delivery.requestId !== pull.requestId ||
        delivery.peerIndex !== pull.peerIndex ||
        delivery.logicalTime !== pull.logicalTime
      )
        fail("runner_observation_delivery_binding_invalid");
      const observationReceipt =
        invokeScalableEvaluationRecordPartialObservationV1(runtime, {
          accounting: {
            schemaVersion: 1,
            eventId: `${pull.requestId}:accounting`,
            teamId: port.descriptor.teamId,
            sequence: remaining.sequence + 1,
            logicalTime,
            domain: step.domain,
            evidenceDigest: delivery.deliveryDigest,
          },
          peerIndex: step.peerIndex,
          delivery,
          observations: delivery.observations as never,
        });
      saga = { delivery, observationReceipt };
      phase = "team_step";
      phaseCursor = 0;
      await persist();
      continue;
    }
    if (phase === "team_step") {
      if (!saga.delivery || !saga.observationReceipt)
        fail("runner_checkpoint_saga_invalid");
      const stepInput = {
        schemaVersion: 1 as const,
        evaluationDefinitionDigest: definition.definitionDigest,
        teamId: port.descriptor.teamId,
        peerIndex: step.peerIndex,
        domain: step.domain,
        logicalTime,
        delivery: saga.delivery,
        remainingInteractions: saga.observationReceipt.remainingInteractions,
        remainingMessages: saga.observationReceipt.remainingMessages,
        remainingMessageBytes: saga.observationReceipt.remainingMessageBytes,
      };
      const output = validateOutput(
        await port.reconcileStepV1({
          operationId: operationId(runId, "team-step", {
            stepIndex,
            teamId: port.descriptor.teamId,
            deliveryDigest: saga.delivery.deliveryDigest,
          }),
          step: stepInput,
        }),
        definition,
        descriptor,
        port.descriptor.teamId,
        step.peerIndex,
        step.domain,
        logicalTime,
      );
      const messageBytes = output.messages.reduce(
        (sum, message) => sum + message.byteLength,
        0,
      );
      if (
        saga.observationReceipt.remainingInteractions < 1 ||
        output.messages.length > saga.observationReceipt.remainingMessages ||
        messageBytes > saga.observationReceipt.remainingMessageBytes
      ) {
        phase = "complete";
        saga = { status: "budget_exhausted" };
        await persist();
        break;
      }
      saga = {
        ...saga,
        output,
        effectReceipts: [],
        settlementDigests: [],
        messageDigests: [],
        ingressDigests: [],
        messageCount: 0,
        messageBytes: 0,
      };
      phase = "action";
      phaseCursor = 0;
      await persist();
      continue;
    }
    if (!saga.output || !saga.observationReceipt)
      fail("runner_checkpoint_saga_invalid");
    if (phase === "action") {
      const action = saga.output.actions[phaseCursor];
      if (!action) {
        phase = "message";
        phaseCursor = 0;
        await persist();
        continue;
      }
      const authority = assertResumableActionAuthority(actionAuthority);
      const operation = operationId(runId, "action", {
        stepIndex,
        teamId: port.descriptor.teamId,
        actionIndex: phaseCursor,
        outputDigest: saga.output.outputDigest,
        action: action as unknown as PlanningJson,
      });
      const issued = authority.reconcileV1({
        operationId: operation,
        teamId: port.descriptor.teamId,
        peerIndex: step.peerIndex,
        logicalTime,
        actionIndex: phaseCursor,
        sessionId: teamEnvironment.session.sessionId,
        episodeId: teamEnvironment.episode.episodeId,
      });
      if (
        !issued ||
        !Number.isSafeInteger(issued.executionEpoch) ||
        issued.executionEpoch < 1 ||
        typeof issued.fenceToken !== "string" ||
        !issued.fenceToken ||
        issued.fenceToken.length > 256
      )
        fail("runner_action_authority_invalid");
      const requestBody = {
        schemaVersion: 1 as const,
        actionId: operation,
        sessionId: teamEnvironment.session.sessionId,
        episodeId: teamEnvironment.episode.episodeId,
        peerIndex: step.peerIndex,
        logicalTime,
        executionEpoch: issued.executionEpoch,
        fenceToken: issued.fenceToken,
        action: action as unknown as PlanningJson,
      };
      const request = {
        ...requestBody,
        actionDigest: shardedSimulationFencedActionDigestV1(requestBody),
      };
      const receipt = validateShardedSimulationEffectReceiptV1(
        await bridge.reconcileEffectV1({ operationId: operation, request }),
        request,
      );
      const settlementInput = Object.freeze({
        schemaVersion: 1 as const,
        evaluationDefinitionDigest: definition.definitionDigest,
        teamId: port.descriptor.teamId,
        sessionId: teamEnvironment.session.sessionId,
        episodeId: teamEnvironment.episode.episodeId,
        peerIndex: step.peerIndex,
        logicalTime,
        actionIndex: phaseCursor,
        outputDigest: saga.output.outputDigest,
        action,
        request,
        effectReceipt: receipt,
      });
      const settlement = validateActionSettlementReceipt(
        await port.reconcileActionSettlementV1({
          operationId: operation,
          settlement: settlementInput,
        }),
        settlementInput,
      );
      saga = {
        ...saga,
        effectReceipts: [...(saga.effectReceipts ?? []), receipt],
        settlementDigests: [
          ...(saga.settlementDigests ?? []),
          settlement.receiptDigest,
        ],
      };
      phaseCursor += 1;
      await persist();
      continue;
    }
    if (phase === "message") {
      const message = saga.output.messages[phaseCursor];
      if (!message) {
        phase = "accounting";
        phaseCursor = 0;
        await persist();
        continue;
      }
      const source = shardedSimulationAssignmentForPeerV1(
        assignments,
        message.sourcePeerIndex,
      );
      const target = shardedSimulationAssignmentForPeerV1(
        assignments,
        message.targetPeerIndex,
      );
      const operation = operationId(runId, "message", {
        stepIndex,
        teamId: port.descriptor.teamId,
        messageId: message.messageId,
        outputDigest: saga.output.outputDigest,
        transportEnvelopeDigest: message.transportEnvelopeDigest,
      });
      const batch = createShardedSimulationCrossShardMessageBatchV1({
        batchId: operation,
        sessionId: teamEnvironment.session.sessionId,
        episodeId: teamEnvironment.episode.episodeId,
        sourceShardId: source.shardId,
        targetShardId: target.shardId,
        logicalTime,
        messages: [
          {
            schemaVersion: 1,
            eventId: operation,
            sourcePeerIndex: message.sourcePeerIndex,
            targetPeerIndex: message.targetPeerIndex,
            logicalTime,
            payloadDigest: message.transportEnvelopeDigest,
          },
        ],
      });
      const ack = await bridge.reconcileCrossShardBatchV1({
        operationId: operation,
        batch,
      });
      validateShardedSimulationCrossShardMessageAckV1(
        ack,
        batch.batchId,
        batch.batchDigest,
        [operation],
      );
      if (ack.duplicate) fail("runner_message_reconciliation_not_canonical");
      const ingressInput = Object.freeze({
        schemaVersion: 1 as const,
        evaluationDefinitionDigest: definition.definitionDigest,
        teamId: port.descriptor.teamId,
        sessionId: teamEnvironment.session.sessionId,
        episodeId: teamEnvironment.episode.episodeId,
        logicalTime,
        eventId: operation,
        batch,
        bridgeAck: ack,
        message,
      });
      const ingress = validateMessageIngressReceipt(
        await port.reconcileAcknowledgedMessageV1({
          operationId: operation,
          delivery: ingressInput,
        }),
        ingressInput,
      );
      if (ingress.status !== "admitted")
        fail("runner_message_ingress_reconciliation_not_canonical");
      saga = {
        ...saga,
        messageDigests: [...(saga.messageDigests ?? []), ack.ackDigest],
        ingressDigests: [...(saga.ingressDigests ?? []), ingress.receiptDigest],
        messageCount: (saga.messageCount ?? 0) + 1,
        messageBytes: (saga.messageBytes ?? 0) + message.byteLength,
      };
      phaseCursor += 1;
      await persist();
      continue;
    }
    if (phase === "accounting") {
      const effects = saga.effectReceipts ?? [];
      invokeScalableEvaluationRecordAccountingV1(runtime, {
        schemaVersion: 1,
        eventId: operationId(runId, "step-accounting", {
          stepIndex,
          teamId: port.descriptor.teamId,
        }),
        teamId: port.descriptor.teamId,
        sequence: saga.observationReceipt.sequence + 1,
        logicalTime,
        domain: step.domain,
        kind:
          effects.length > 0
            ? "action"
            : (saga.messageCount ?? 0) > 0
              ? "message"
              : "decision",
        interactionCount: 1,
        messageCount: saga.messageCount ?? 0,
        messageBytes: saga.messageBytes ?? 0,
        observationCount: 0,
        observationCountsByDomain: { physical: 0, social: 0, cyber: 0 },
        actionCount: effects.length,
        successfulOutcomeCount: effects.filter((receipt) => receipt.accepted)
          .length,
        failedOutcomeCount: effects.filter((receipt) => !receipt.accepted)
          .length,
        evidenceDigest: scalableEvaluationDigestV1("runner-step-evidence", {
          outputDigest: saga.output.outputDigest,
          effects: effects.map((receipt) => receipt.receiptDigest),
          effectSettlements: saga.settlementDigests ?? [],
          messages: saga.messageDigests ?? [],
          messageIngress: saga.ingressDigests ?? [],
        }),
      });
      phase = "recovery";
      phaseCursor = 0;
      await persist();
      continue;
    }
    if (phase === "recovery") {
      const recoveries = definition.perturbations.filter((perturbation) =>
        activeRecoveries.has(
          key(perturbation.perturbationId, port.descriptor.teamId),
        ),
      );
      const perturbation = recoveries[phaseCursor];
      if (!perturbation) {
        phase = "advance";
        phaseCursor = 0;
        await persist();
        continue;
      }
      const sampleId = `recovery:${perturbation.perturbationId}:${port.descriptor.teamId}:${logicalTime}`;
      const metrics =
        recoveryMetrics as import("./scalable-evaluation-contracts.js").ScalableEvaluationResumableRecoveryMetricPortV1;
      const operation = operationId(runId, "recovery-sample", {
        sampleId,
      });
      const measurement =
        await verifyScalableEvaluationRecoveryMeasurementReceiptV1({
          receipt: await metrics.reconcileSampleV1({
            operationId: operation,
            definition,
            perturbation,
            teamId: port.descriptor.teamId,
            domain: perturbation.domain,
            sampleId,
            sessionId: teamEnvironment.session.sessionId,
            episodeId: teamEnvironment.episode.episodeId,
            logicalTime,
          }),
          verifier: evidenceVerifier!,
          definition,
          perturbation,
          teamId: port.descriptor.teamId,
          sampleId,
          sessionId: teamEnvironment.session.sessionId,
          episodeId: teamEnvironment.episode.episodeId,
          logicalTime,
        });
      const sample = invokeScalableEvaluationRecordRecoverySampleV1(runtime, {
        measurement,
      });
      if (sample.withinBaselineTolerance)
        activeRecoveries.delete(
          key(perturbation.perturbationId, port.descriptor.teamId),
        );
      phaseCursor += 1;
      await persist();
      continue;
    }
    if (phase === "advance") {
      traceDigest = scalableEvaluationDigestV1("runner-trace", {
        previousTraceDigest: traceDigest,
        teamId: port.descriptor.teamId,
        peerIndex: step.peerIndex,
        logicalTime,
        outputDigest: saga.output.outputDigest,
        accountingChainDigest: invokeScalableEvaluationSnapshotV1(
          runtime,
        ).teamSummaries.find(
          (entry) => entry.teamId === port.descriptor.teamId,
        )!.accountingChainDigest,
      });
      saga = {};
      phaseCursor = 0;
      if (teamIndex === orderedPorts.length - 1) {
        teamIndex = 0;
        stepIndex += 1;
        processedSteps += 1;
        phase = stepIndex >= steps.length ? "complete" : "perturbation";
        if (phase === "complete") saga = { status: "completed" };
      } else {
        teamIndex += 1;
        phase = "observation";
      }
      await persist();
      continue;
    }
    fail("runner_checkpoint_phase_invalid");
  }
  return finish(saga.status ?? "completed");
}

function assertResumableTeamPort(
  port: ScalableEvaluationTeamPortV1,
): asserts port is ScalableEvaluationResumableTeamPortV1 {
  const value = port as Partial<ScalableEvaluationResumableTeamPortV1>;
  if (
    !value.restartDurabilityV1 ||
    [
      "reconcileStepV1",
      "reconcileAcknowledgedMessageV1",
      "reconcileActionSettlementV1",
      "checkpointV1",
      "restoreV1",
    ].some(
      (method) =>
        typeof (value as Record<string, unknown>)[method] !== "function",
    )
  )
    fail("runner_team_port_not_resumable");
  assertScalableEvaluationRestartDurabilityDeclarationV1(
    value.restartDurabilityV1,
  );
}

function assertResumableExternalPort(
  value: object,
  method: string,
  code: string,
): void {
  const candidate = value as Record<string, unknown>;
  if (!candidate.restartDurabilityV1 || typeof candidate[method] !== "function")
    fail(code);
  assertScalableEvaluationRestartDurabilityDeclarationV1(
    candidate.restartDurabilityV1 as import("./scalable-evaluation-contracts.js").ScalableEvaluationRestartDurabilityDeclarationV1,
  );
}

function assertResumableEnvironmentBridge(
  bridge: Awaited<
    ReturnType<typeof openScalableEvaluationEnvironmentV1>
  >["bridge"],
): ScalableEvaluationResumableEnvironmentBridgeV1 {
  const value =
    bridge as Partial<ScalableEvaluationResumableEnvironmentBridgeV1>;
  if (
    !value.restartDurabilityV1 ||
    [
      "reconcileSessionV1",
      "reconcileEpisodeV1",
      "reconcileShardAssignmentsV1",
      "reconcileObservationV1",
      "reconcileEffectV1",
      "reconcileCrossShardBatchV1",
      "reconcileCheckpointV1",
      "reconcileRestoreV1",
    ].some(
      (method) =>
        typeof (value as Record<string, unknown>)[method] !== "function",
    )
  )
    fail("runner_environment_bridge_not_resumable");
  assertScalableEvaluationRestartDurabilityDeclarationV1(
    value.restartDurabilityV1,
  );
  return value as ScalableEvaluationResumableEnvironmentBridgeV1;
}

function assertResumableActionAuthority(
  value: ScalableEvaluationActionAuthorityV1 | undefined,
): import("./scalable-evaluation-contracts.js").ScalableEvaluationResumableActionAuthorityV1 {
  if (!value) fail("runner_action_authority_missing");
  const candidate = value as Partial<
    import("./scalable-evaluation-contracts.js").ScalableEvaluationResumableActionAuthorityV1
  >;
  if (
    !candidate.restartDurabilityV1 ||
    typeof candidate.reconcileV1 !== "function"
  )
    fail("runner_action_authority_not_resumable");
  assertScalableEvaluationRestartDurabilityDeclarationV1(
    candidate.restartDurabilityV1,
  );
  return candidate as import("./scalable-evaluation-contracts.js").ScalableEvaluationResumableActionAuthorityV1;
}

function operationId(
  runId: string,
  phase: string,
  scope: PlanningJson,
): string {
  return scalableEvaluationDigestV1("runner-operation", {
    runId,
    phase,
    scope,
  });
}

function validateEnvironmentRestoreReceipt(
  value: import("./sharded-simulation-contracts.js").ShardedSimulationRestoreReceiptV1,
  checkpoint: import("./sharded-simulation-contracts.js").ShardedSimulationCheckpointV1,
): void {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.checkpointId !== checkpoint.checkpointId ||
    value.restoredRevision !== checkpoint.revision ||
    value.restoredLogicalTime < checkpoint.logicalTime ||
    !DIGEST.test(value.receiptDigest)
  )
    fail("runner_environment_restore_receipt_invalid");
  const { receiptDigest, ...body } = value;
  if (
    shardedSimulationDigestV1("sharded-simulation-restore-receipt-v1", body) !==
    receiptDigest
  )
    fail("runner_environment_restore_receipt_digest_invalid");
}

function emptyDurableCancelledResult(
  definition: ScalableEvaluationDefinitionV1,
  descriptor: MultiDomainEnvironmentAdapterV1["descriptor"],
): ScalableEvaluationExecutionResultV1 {
  const runtime = createScalableEvaluationRuntimeV1({ definition, descriptor });
  const body = {
    schemaVersion: 1 as const,
    status: "cancelled" as const,
    processedSteps: 0,
    teamEnvironments: Object.freeze([]),
    traceDigest: scalableEvaluationDigestV1(
      "runner-trace-genesis",
      definition.definitionDigest,
    ),
    snapshot: invokeScalableEvaluationSnapshotV1(runtime),
    comparison: invokeScalableEvaluationCompareV1(runtime),
  };
  return Object.freeze({
    ...body,
    resultDigest: scalableEvaluationDigestV1("runner-result", body),
  });
}

function validateMessageIngressReceipt(
  value: ScalableEvaluationMessageIngressReceiptV1,
  input: ScalableEvaluationAcknowledgedMessageV1,
): ScalableEvaluationMessageIngressReceiptV1 {
  if (
    !value ||
    typeof value !== "object" ||
    !exactKeys(value, [
      "schemaVersion",
      "evaluationDefinitionDigest",
      "teamId",
      "sessionId",
      "episodeId",
      "logicalTime",
      "eventId",
      "messageId",
      "transportEnvelopeDigest",
      "batchDigest",
      "bridgeAckDigest",
      "status",
      "receiptDigest",
    ]) ||
    value.schemaVersion !== 1 ||
    value.evaluationDefinitionDigest !== input.evaluationDefinitionDigest ||
    value.teamId !== input.teamId ||
    value.sessionId !== input.sessionId ||
    value.episodeId !== input.episodeId ||
    value.logicalTime !== input.logicalTime ||
    value.eventId !== input.eventId ||
    value.messageId !== input.message.messageId ||
    value.transportEnvelopeDigest !== input.message.transportEnvelopeDigest ||
    value.batchDigest !== input.batch.batchDigest ||
    value.bridgeAckDigest !== input.bridgeAck.ackDigest ||
    (value.status !== "admitted" && value.status !== "duplicate") ||
    !DIGEST.test(value.receiptDigest)
  )
    fail("runner_team_message_ingress_receipt_invalid");
  const { receiptDigest: ignored, ...body } = value;
  if (
    scalableEvaluationDigestV1("team-message-ingress-receipt", body) !==
    value.receiptDigest
  )
    fail("runner_team_message_ingress_receipt_digest_invalid");
  return Object.freeze({ ...value });
}

function validateActionSettlementReceipt(
  value: ScalableEvaluationActionSettlementReceiptV1,
  input: ScalableEvaluationActionSettlementV1,
): ScalableEvaluationActionSettlementReceiptV1 {
  if (
    !value ||
    typeof value !== "object" ||
    !exactKeys(value, [
      "schemaVersion",
      "evaluationDefinitionDigest",
      "teamId",
      "sessionId",
      "episodeId",
      "peerIndex",
      "logicalTime",
      "actionIndex",
      "outputDigest",
      "actionDigest",
      "effectReceiptDigest",
      "status",
      "receiptDigest",
    ]) ||
    value.schemaVersion !== 1 ||
    value.evaluationDefinitionDigest !== input.evaluationDefinitionDigest ||
    value.teamId !== input.teamId ||
    value.sessionId !== input.sessionId ||
    value.episodeId !== input.episodeId ||
    value.peerIndex !== input.peerIndex ||
    value.logicalTime !== input.logicalTime ||
    value.actionIndex !== input.actionIndex ||
    value.outputDigest !== input.outputDigest ||
    value.actionDigest !== input.request.actionDigest ||
    value.effectReceiptDigest !== input.effectReceipt.receiptDigest ||
    (value.status !== "settled" && value.status !== "duplicate") ||
    !DIGEST.test(value.receiptDigest)
  )
    fail("runner_team_action_settlement_receipt_invalid");
  const { receiptDigest: ignored, ...body } = value;
  if (
    scalableEvaluationDigestV1("team-action-settlement-receipt", body) !==
    value.receiptDigest
  )
    fail("runner_team_action_settlement_receipt_digest_invalid");
  return Object.freeze({ ...value });
}

function validateSession(
  value: ShardedSimulationEnvironmentSessionV1,
  expected: { readonly environmentId: string; readonly logicalTime: number },
): void {
  if (
    !value ||
    !exactKeys(value, [
      "schemaVersion",
      "sessionId",
      "environmentId",
      "createdAtLogicalTime",
      "sessionDigest",
    ]) ||
    value.schemaVersion !== 1 ||
    typeof value.sessionId !== "string" ||
    value.sessionId.length === 0 ||
    value.sessionId.length > 256 ||
    value.environmentId !== expected.environmentId ||
    value.createdAtLogicalTime !== expected.logicalTime ||
    !DIGEST.test(value.sessionDigest)
  )
    fail("runner_session_invalid");
  const { sessionDigest: ignored, ...body } = value;
  if (
    shardedSimulationDigestV1("sharded-simulation-session-v1", body) !==
    value.sessionDigest
  )
    fail("runner_session_digest_invalid");
}
function validateEpisode(
  value: ShardedSimulationEpisodeV1,
  session: ShardedSimulationEnvironmentSessionV1,
  expected: {
    readonly episodeId: string;
    readonly seed: number;
    readonly logicalTime: number;
  },
): void {
  if (
    !value ||
    !exactKeys(value, [
      "schemaVersion",
      "sessionId",
      "episodeId",
      "seed",
      "startedAtLogicalTime",
      "episodeDigest",
    ]) ||
    value.schemaVersion !== 1 ||
    value.sessionId !== session.sessionId ||
    value.episodeId !== expected.episodeId ||
    value.seed !== expected.seed ||
    value.startedAtLogicalTime !== expected.logicalTime ||
    !DIGEST.test(value.episodeDigest)
  )
    fail("runner_episode_invalid");
  const { episodeDigest: ignored, ...body } = value;
  if (
    shardedSimulationDigestV1("sharded-simulation-episode-v1", body) !==
    value.episodeDigest
  )
    fail("runner_episode_digest_invalid");
}
function exactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((item, index) => item === expected[index])
  );
}
function key(left: string, right: string): string {
  return `${left}\u0000${right}`;
}
function fail(code: string): never {
  throw new TypeError(`scalable_evaluation_${code}`);
}
