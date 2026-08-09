import {
  deepFreezePlanning,
  type PlanningJson,
} from "@agentplat/collective-planning";

import type {
  ScalableEvaluationCheckpointStoreCasReceiptV1,
  ScalableEvaluationRestartDurabilityDeclarationV1,
  ScalableEvaluationRunnerCheckpointV1,
  ScalableEvaluationTeamCheckpointV1,
  ScalableEvaluationTeamRestoreReceiptV1,
} from "./scalable-evaluation-contracts.js";
import { scalableEvaluationDigestV1 } from "./scalable-evaluation-validation.js";
import {
  shardedSimulationDigestV1,
  type ShardedSimulationEnvironmentSessionV1,
  type ShardedSimulationEpisodeV1,
} from "./sharded-simulation-contracts.js";
import { validateShardedSimulationCheckpointV1 } from "./sharded-simulation-validation.js";

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const MAXIMUM_DURABLE_CHECKPOINT_BYTES = 64 * 1024 * 1024;
const declarations = new WeakSet<object>();

/** Creates the nominal declaration required at every restart boundary. */
export function createScalableEvaluationRestartDurabilityDeclarationV1(input: {
  readonly providerId: string;
  readonly continuityId: string;
  readonly maximumCheckpointBytes: number;
}): ScalableEvaluationRestartDurabilityDeclarationV1 {
  identifier(input.providerId, "durability_provider_id");
  identifier(input.continuityId, "durability_continuity_id");
  if (
    !Number.isSafeInteger(input.maximumCheckpointBytes) ||
    input.maximumCheckpointBytes < 1 ||
    input.maximumCheckpointBytes > MAXIMUM_DURABLE_CHECKPOINT_BYTES
  )
    fail("durability_checkpoint_capacity_invalid");
  const body = {
    schemaVersion: 1 as const,
    protocol: "scalable-evaluation-restart-v1" as const,
    providerId: input.providerId,
    continuityId: input.continuityId,
    maximumCheckpointBytes: input.maximumCheckpointBytes,
  };
  const declaration = freeze({
    ...body,
    declarationDigest: scalableEvaluationDigestV1(
      "restart-durability-declaration",
      body,
    ),
  });
  declarations.add(declaration);
  return declaration;
}

/** A structurally forged declaration is intentionally not sufficient. */
export function assertScalableEvaluationRestartDurabilityDeclarationV1(
  value: ScalableEvaluationRestartDurabilityDeclarationV1,
): void {
  if (!value || typeof value !== "object" || !declarations.has(value))
    fail("restart_durability_declaration_not_genuine");
  const { declarationDigest, ...body } = value;
  if (
    value.schemaVersion !== 1 ||
    value.protocol !== "scalable-evaluation-restart-v1" ||
    !DIGEST.test(declarationDigest) ||
    scalableEvaluationDigestV1("restart-durability-declaration", body) !==
      declarationDigest
  )
    fail("restart_durability_declaration_invalid");
}

export function createScalableEvaluationRunnerCheckpointV1(
  body: Omit<ScalableEvaluationRunnerCheckpointV1, "checkpointDigest">,
): ScalableEvaluationRunnerCheckpointV1 {
  const value = freeze({
    ...body,
    checkpointDigest: scalableEvaluationDigestV1(
      "runner-durable-checkpoint",
      body,
    ),
  });
  return validateScalableEvaluationRunnerCheckpointV1(value);
}

export function validateScalableEvaluationRunnerCheckpointV1(
  value: ScalableEvaluationRunnerCheckpointV1,
): ScalableEvaluationRunnerCheckpointV1 {
  if (
    !value ||
    typeof value !== "object" ||
    value.schemaVersion !== 1 ||
    !identifierValue(value.runId) ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    (value.revision === 1) !== (value.previousCheckpointDigest === null) ||
    (value.previousCheckpointDigest !== null &&
      !DIGEST.test(value.previousCheckpointDigest)) ||
    !DIGEST.test(value.definitionDigest) ||
    !DIGEST.test(value.adapterDescriptorDigest) ||
    !DIGEST.test(value.scheduleDigest) ||
    !DIGEST.test(value.portsDigest) ||
    !DIGEST.test(value.configurationDigest) ||
    !new Set([
      "perturbation",
      "observation",
      "team_step",
      "action",
      "message",
      "accounting",
      "recovery",
      "advance",
      "complete",
    ]).has(value.phase) ||
    !Number.isSafeInteger(value.stepIndex) ||
    value.stepIndex < 0 ||
    !Number.isSafeInteger(value.teamIndex) ||
    value.teamIndex < 0 ||
    value.teamIndex > 1 ||
    !Number.isSafeInteger(value.phaseCursor) ||
    value.phaseCursor < 0 ||
    !Number.isSafeInteger(value.processedSteps) ||
    value.processedSteps < 0 ||
    value.processedSteps > value.stepIndex ||
    !Number.isSafeInteger(value.logicalTime) ||
    value.logicalTime < 0 ||
    !DIGEST.test(value.traceDigest) ||
    !Array.isArray(value.activeRecoveries) ||
    value.activeRecoveries.length > 8_192 ||
    new Set(value.activeRecoveries).size !== value.activeRecoveries.length ||
    !Array.isArray(value.teamEnvironments) ||
    value.teamEnvironments.length !== 2 ||
    !DIGEST.test(value.checkpointDigest)
  )
    fail("runner_checkpoint_invalid");
  validateRunnerRuntimeStateEnvelopeV1(value);
  for (const recovery of value.activeRecoveries)
    identifier(recovery, "runner_checkpoint_recovery_key");
  const expectedActiveRecoveries = value.runtimeState.recoveries
    .filter((recovery) => !recovery.withinBaselineTolerance)
    .map((recovery) => `${recovery.perturbationId}\u0000${recovery.teamId}`)
    .sort();
  const actualActiveRecoveries = [...value.activeRecoveries].sort();
  if (
    expectedActiveRecoveries.length !== actualActiveRecoveries.length ||
    expectedActiveRecoveries.some(
      (recovery, index) => recovery !== actualActiveRecoveries[index],
    )
  )
    fail("runner_checkpoint_active_recoveries_invalid");
  const teamIds = new Set<string>();
  const sessionIds = new Set<string>();
  const episodeIds = new Set<string>();
  const runtimeBindings = new Map(
    value.runtimeState.environmentBindings.map((binding) => [
      binding.teamId,
      binding,
    ]),
  );
  const runtimeTeams = new Map(
    value.runtimeState.teams.map((team) => [team.descriptor.teamId, team]),
  );
  for (const environment of value.teamEnvironments) {
    if (
      !environment ||
      typeof environment !== "object" ||
      !exactKeys(environment, [
        "teamId",
        "session",
        "episode",
        "environmentCheckpoint",
        "teamCheckpoint",
      ])
    )
      fail("runner_checkpoint_team_environment_invalid");
    identifier(environment.teamId, "runner_checkpoint_team_id");
    if (teamIds.has(environment.teamId))
      fail("runner_checkpoint_team_duplicate");
    teamIds.add(environment.teamId);
    const session = validateRunnerEnvironmentSessionV1(environment.session);
    const episode = validateRunnerEnvironmentEpisodeV1(
      environment.episode,
      session,
    );
    const environmentCheckpoint = validateShardedSimulationCheckpointV1(
      environment.environmentCheckpoint,
    );
    const teamCheckpoint = validateScalableEvaluationTeamCheckpointV1(
      environment.teamCheckpoint,
    );
    const runtimeBinding = runtimeBindings.get(environment.teamId);
    const runtimeTeam = runtimeTeams.get(environment.teamId);
    if (
      sessionIds.has(session.sessionId) ||
      episodeIds.has(episode.episodeId) ||
      !runtimeBinding ||
      !runtimeTeam ||
      runtimeBinding.sessionId !== session.sessionId ||
      runtimeBinding.episodeId !== episode.episodeId ||
      environmentCheckpoint.sessionId !== session.sessionId ||
      environmentCheckpoint.episodeId !== episode.episodeId ||
      environmentCheckpoint.revision !== value.revision ||
      environmentCheckpoint.logicalTime !== value.logicalTime ||
      (environmentCheckpoint.revision === 1) !==
        (environmentCheckpoint.anchor.previousAnchorDigest === null) ||
      teamCheckpoint.operationId !==
        scalableEvaluationDigestV1("runner-operation", {
          runId: value.runId,
          phase: "team-checkpoint",
          scope: { revision: value.revision, teamId: environment.teamId },
        }) ||
      teamCheckpoint.teamId !== environment.teamId ||
      teamCheckpoint.definitionDigest !== value.definitionDigest ||
      teamCheckpoint.descriptorDigest !==
        runtimeTeam.descriptor.descriptorDigest ||
      teamCheckpoint.revision !== value.revision ||
      teamCheckpoint.logicalTime !== value.logicalTime
    )
      fail("runner_checkpoint_team_environment_binding_invalid");
    sessionIds.add(session.sessionId);
    episodeIds.add(episode.episodeId);
  }
  if (
    runtimeBindings.size !== teamIds.size ||
    runtimeTeams.size !== teamIds.size ||
    [...runtimeBindings.keys()].some((teamId) => !teamIds.has(teamId)) ||
    [...runtimeTeams.keys()].some((teamId) => !teamIds.has(teamId))
  )
    fail("runner_checkpoint_team_environment_set_invalid");
  const { checkpointDigest, ...body } = value;
  if (
    scalableEvaluationDigestV1("runner-durable-checkpoint", body) !==
    checkpointDigest
  )
    fail("runner_checkpoint_digest_invalid");
  return freeze(value);
}

function validateRunnerRuntimeStateEnvelopeV1(
  value: ScalableEvaluationRunnerCheckpointV1,
): void {
  const state = value.runtimeState;
  if (
    !state ||
    typeof state !== "object" ||
    state.schemaVersion !== 1 ||
    state.definitionDigest !== value.definitionDigest ||
    state.adapterDescriptorDigest !== value.adapterDescriptorDigest ||
    !Number.isSafeInteger(state.revision) ||
    state.revision < 1 ||
    !DIGEST.test(state.predecessorStateDigest ?? "") ||
    !Array.isArray(state.teams) ||
    state.teams.length !== 2 ||
    !Array.isArray(state.baselines) ||
    !Array.isArray(state.perturbationObservations) ||
    !Array.isArray(state.recoveries) ||
    !Array.isArray(state.environmentBindings) ||
    state.environmentBindings.length !== 2 ||
    !Array.isArray(state.recordTail) ||
    !Number.isSafeInteger(state.recordTailCursor) ||
    state.recordTailCursor < 0 ||
    !DIGEST.test(state.stateDigest)
  )
    fail("runner_checkpoint_runtime_state_invalid");
  const { stateDigest, ...body } = state;
  if (scalableEvaluationDigestV1("runtime-state", body) !== stateDigest)
    fail("runner_checkpoint_runtime_state_digest_invalid");
  const teamIds = state.teams.map((team) => team?.descriptor?.teamId);
  const bindingTeamIds = state.environmentBindings.map(
    (binding) => binding?.teamId,
  );
  if (
    teamIds.some((teamId) => !identifierValue(teamId)) ||
    new Set(teamIds).size !== 2 ||
    bindingTeamIds.some((teamId) => !identifierValue(teamId)) ||
    new Set(bindingTeamIds).size !== 2 ||
    teamIds.some((teamId) => !bindingTeamIds.includes(teamId))
  )
    fail("runner_checkpoint_runtime_team_set_invalid");
}

function validateRunnerEnvironmentSessionV1(
  value: ShardedSimulationEnvironmentSessionV1,
): ShardedSimulationEnvironmentSessionV1 {
  if (
    !value ||
    typeof value !== "object" ||
    !exactKeys(value, [
      "schemaVersion",
      "sessionId",
      "environmentId",
      "createdAtLogicalTime",
      "sessionDigest",
    ]) ||
    value.schemaVersion !== 1 ||
    !identifierValue(value.sessionId) ||
    !identifierValue(value.environmentId) ||
    !Number.isSafeInteger(value.createdAtLogicalTime) ||
    value.createdAtLogicalTime < 0 ||
    !DIGEST.test(value.sessionDigest)
  )
    fail("runner_checkpoint_environment_session_invalid");
  const { sessionDigest, ...body } = value;
  if (
    shardedSimulationDigestV1("sharded-simulation-session-v1", body) !==
    sessionDigest
  )
    fail("runner_checkpoint_environment_session_digest_invalid");
  return value;
}

function validateRunnerEnvironmentEpisodeV1(
  value: ShardedSimulationEpisodeV1,
  session: ShardedSimulationEnvironmentSessionV1,
): ShardedSimulationEpisodeV1 {
  if (
    !value ||
    typeof value !== "object" ||
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
    !identifierValue(value.episodeId) ||
    !Number.isSafeInteger(value.seed) ||
    !Number.isSafeInteger(value.startedAtLogicalTime) ||
    value.startedAtLogicalTime < 0 ||
    !DIGEST.test(value.episodeDigest)
  )
    fail("runner_checkpoint_environment_episode_invalid");
  const { episodeDigest, ...body } = value;
  if (
    shardedSimulationDigestV1("sharded-simulation-episode-v1", body) !==
    episodeDigest
  )
    fail("runner_checkpoint_environment_episode_digest_invalid");
  return value;
}

function exactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((entry, index) => entry === expected[index])
  );
}

export function validateScalableEvaluationTeamCheckpointV1(
  value: ScalableEvaluationTeamCheckpointV1,
): ScalableEvaluationTeamCheckpointV1 {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    !identifierValue(value.operationId) ||
    !identifierValue(value.teamId) ||
    !DIGEST.test(value.definitionDigest) ||
    !DIGEST.test(value.descriptorDigest) ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    !Number.isSafeInteger(value.logicalTime) ||
    value.logicalTime < 0 ||
    (value.revision === 1) !== (value.previousCheckpointDigest === null) ||
    (value.previousCheckpointDigest !== null &&
      !DIGEST.test(value.previousCheckpointDigest)) ||
    !identifierValue(value.snapshotHandle) ||
    !DIGEST.test(value.snapshotDigest) ||
    !DIGEST.test(value.checkpointDigest)
  )
    fail("team_checkpoint_invalid");
  const { checkpointDigest, ...body } = value;
  if (
    scalableEvaluationDigestV1("team-durable-checkpoint", body) !==
    checkpointDigest
  )
    fail("team_checkpoint_digest_invalid");
  return freeze(value);
}

export function validateScalableEvaluationTeamRestoreReceiptV1(
  value: ScalableEvaluationTeamRestoreReceiptV1,
  checkpoint: ScalableEvaluationTeamCheckpointV1,
  operationId: string,
): ScalableEvaluationTeamRestoreReceiptV1 {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.operationId !== operationId ||
    value.teamId !== checkpoint.teamId ||
    value.checkpointDigest !== checkpoint.checkpointDigest ||
    value.restoredRevision !== checkpoint.revision ||
    !DIGEST.test(value.receiptDigest)
  )
    fail("team_restore_receipt_invalid");
  const { receiptDigest, ...body } = value;
  if (
    scalableEvaluationDigestV1("team-restore-receipt", body) !== receiptDigest
  )
    fail("team_restore_receipt_digest_invalid");
  return freeze(value);
}

export function validateScalableEvaluationCheckpointStoreCasReceiptV1(
  value: ScalableEvaluationCheckpointStoreCasReceiptV1,
  checkpoint: ScalableEvaluationRunnerCheckpointV1,
): ScalableEvaluationCheckpointStoreCasReceiptV1 {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.runId !== checkpoint.runId ||
    value.revision !== checkpoint.revision ||
    value.checkpointDigest !== checkpoint.checkpointDigest ||
    !new Set(["stored", "duplicate", "conflict"]).has(value.status) ||
    !(
      value.currentRevision === null ||
      (Number.isSafeInteger(value.currentRevision) &&
        value.currentRevision >= 1)
    ) ||
    ((value.status === "stored" || value.status === "duplicate") &&
      value.currentRevision !== checkpoint.revision) ||
    !DIGEST.test(value.receiptDigest)
  )
    fail("checkpoint_store_receipt_invalid");
  const { receiptDigest, ...body } = value;
  if (
    scalableEvaluationDigestV1("checkpoint-store-cas-receipt", body) !==
    receiptDigest
  )
    fail("checkpoint_store_receipt_digest_invalid");
  return freeze(value);
}

export function scalableEvaluationCheckpointBytesV1(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function identifier(value: unknown, label: string): asserts value is string {
  if (!identifierValue(value)) fail(`${label}_invalid`);
}

function identifierValue(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    Boolean(value.trim())
  );
}

function freeze<T>(value: T): T {
  return deepFreezePlanning(value as unknown as PlanningJson) as unknown as T;
}

function fail(code: string): never {
  throw new TypeError(`scalable_evaluation_${code}`);
}
