import {
  canonicalizePlanningJsonV1,
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import {
  validateCollectiveEvaluationCampaignRegistrationV1,
  validateNormativeMetricProjectionV1,
  validateNormativeOperationAuthorizationV1,
  verifyNormativeOperationAuthorizationV1,
  validateNormativeOperationPlanV1,
  validateNormativeRunnerDescriptorV1,
  type CollectiveEvaluationCampaignRegistrationV1,
  type NormativeMetricProjectionV1,
  type NormativeOperationAuthorizationV1,
  type NormativeOperationAuthorizationVerifierPortV1,
  type NormativeOperationPlanV1,
  type NormativeRunnerDescriptorV1,
} from "@agentplat/collective-planning/evaluation";

import type {
  CollectiveStatisticalCampaignExecutionArtifactsV1,
  CollectiveStatisticalCampaignRunnerOutputV1,
} from "./collective-statistical-campaign-aggregation.js";
import {
  COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_ARTIFACT_BYTES_V1,
  type CollectiveStatisticalCampaignArtifactIndexEntryV1,
} from "./collective-statistical-campaign-bundle.js";
import {
  runCollectiveStatisticalCampaignShardV1,
  type CollectiveStatisticalCampaignExecutionContextV1,
  type CollectiveStatisticalCampaignExecutionStoreV1,
} from "./collective-statistical-campaign-executor.js";
import type { CollectiveStatisticalCampaignArtifactWriterV1 } from "./collective-statistical-campaign-artifact-stream.js";

export interface CollectiveStatisticalCampaignNormativeRunnerPortV1 {
  readonly schemaVersion: 1;
  executeV1(
    context: CollectiveStatisticalCampaignExecutionContextV1,
  ):
    | CollectiveStatisticalCampaignRunnerOutputV1
    | Promise<CollectiveStatisticalCampaignRunnerOutputV1>;
}

/** This port is intentionally distinct from the runner: it owns projections. */
export interface CollectiveStatisticalCampaignNormativeProjectionPortV1 {
  readonly schemaVersion: 1;
  projectV1(
    input: Readonly<{
      readonly schemaVersion: 1;
      readonly registration: CollectiveEvaluationCampaignRegistrationV1;
      readonly execution: CollectiveStatisticalCampaignExecutionArtifactsV1;
    }>,
  ): NormativeMetricProjectionV1 | Promise<NormativeMetricProjectionV1>;
}

export interface CollectiveStatisticalCampaignResolvedNormativeAdapterV1 {
  readonly schemaVersion: 1;
  readonly descriptorDigest: PlanningDigestV1;
  readonly implementationDigest: PlanningDigestV1;
  readonly evaluatorDigest: PlanningDigestV1;
  readonly runner: CollectiveStatisticalCampaignNormativeRunnerPortV1;
  readonly projector: CollectiveStatisticalCampaignNormativeProjectionPortV1;
}

/** Trusted registry boundary; callers cannot inject runner ports directly. */
export interface CollectiveStatisticalCampaignNormativeAdapterResolverPortV1 {
  readonly schemaVersion: 1;
  resolveRegisteredAdapterV1(
    input: Readonly<{
      readonly schemaVersion: 1;
      readonly purpose: "collective-statistical-campaign-normative-adapter-v1";
      readonly descriptorDigest: PlanningDigestV1;
      readonly implementationDigest: PlanningDigestV1;
      readonly evaluatorDigest: PlanningDigestV1;
      readonly planDigest: PlanningDigestV1;
      readonly authorizationDigest: PlanningDigestV1;
    }>,
  ):
    | CollectiveStatisticalCampaignResolvedNormativeAdapterV1
    | Promise<CollectiveStatisticalCampaignResolvedNormativeAdapterV1>;
}

export interface CollectiveStatisticalCampaignNormativeOperationResultV1 {
  readonly schemaVersion: 1;
  /** Authorization-scoped durable namespace used by state, slots and evidence. */
  readonly executionId: string;
  /** Operator-selected identifier committed by the signed authorization. */
  readonly authorizationExecutionId: string;
  readonly shardIndex: number;
  readonly selectedCellCount: 5;
  readonly executedSlotCount: number;
  readonly resumedSlotCount: number;
  readonly projectionCount: 20;
  readonly projectionArtifactIndexes: readonly CollectiveStatisticalCampaignArtifactIndexEntryV1[];
  readonly projections: readonly NormativeMetricProjectionV1[];
}

/** Recomputes the immutable state/evidence namespace from the signed operation. */
export function collectiveStatisticalCampaignNormativeExecutionIdV1(input: {
  readonly schemaVersion: 1;
  readonly registration: CollectiveEvaluationCampaignRegistrationV1;
  readonly descriptor: NormativeRunnerDescriptorV1;
  readonly plan: NormativeOperationPlanV1;
  readonly authorization: NormativeOperationAuthorizationV1;
}): PlanningDigestV1 {
  if (!input || input.schemaVersion !== 1) fail("execution_binding_invalid");
  const registration = validateCollectiveEvaluationCampaignRegistrationV1(
    input.registration,
  );
  const descriptor = validateNormativeRunnerDescriptorV1(input.descriptor);
  const plan = validateNormativeOperationPlanV1(
    input.plan,
    registration,
    descriptor,
  );
  const authorization = validateNormativeOperationAuthorizationV1(
    input.authorization,
  );
  if (authorization.planDigest !== plan.planDigest)
    fail("execution_binding_invalid");
  return digestPlanningJsonV1("evaluation-campaign-artifact-v1", {
    schemaVersion: 1,
    kind: "collective-statistical-campaign-normative-execution-v1",
    value: {
      planDigest: plan.planDigest,
      authorizationDigest: authorization.authorizationDigest,
    },
  } as unknown as PlanningJson);
}

/**
 * Runs exactly one pre-authorized five-cell normative shard. This is an
 * adapter boundary, not a runner implementation: diagnostic and synthetic
 * adapters are rejected before any durable execution is claimed.
 */
export async function runCollectiveStatisticalCampaignNormativeOperationV1(input: {
  readonly schemaVersion: 1;
  readonly registration: CollectiveEvaluationCampaignRegistrationV1;
  readonly descriptor: NormativeRunnerDescriptorV1;
  readonly plan: NormativeOperationPlanV1;
  readonly authorization: NormativeOperationAuthorizationV1;
  readonly authorizationAudience: string;
  readonly authorizationVerifier: NormativeOperationAuthorizationVerifierPortV1;
  readonly source: Readonly<{
    readonly commit: string;
    readonly treeDigest: string;
    readonly clean: true;
  }>;
  readonly shardIndex: number;
  readonly workerId: string;
  readonly leaseDurationMs: number;
  readonly store: CollectiveStatisticalCampaignExecutionStoreV1;
  readonly artifacts: CollectiveStatisticalCampaignArtifactWriterV1;
  readonly adapterResolver: CollectiveStatisticalCampaignNormativeAdapterResolverPortV1;
  readonly now: () => number;
}): Promise<CollectiveStatisticalCampaignNormativeOperationResultV1> {
  if (!input || input.schemaVersion !== 1) fail("input_invalid");
  const registration = validateCollectiveEvaluationCampaignRegistrationV1(
    input.registration,
  );
  const descriptor = validateNormativeRunnerDescriptorV1(input.descriptor);
  // This comes before validating/mutating the durable executor state.
  if (descriptor.runnerClass !== "normative_candidate")
    fail("adapter_not_normative");
  const plan = validateNormativeOperationPlanV1(
    input.plan,
    registration,
    descriptor,
  );
  const authorization = validateNormativeOperationAuthorizationV1(
    input.authorization,
  );
  validatePorts(input);
  if (
    !Number.isInteger(input.shardIndex) ||
    input.shardIndex < 0 ||
    input.shardIndex >= 48
  )
    fail("shard_invalid");
  const shard = plan.shards[input.shardIndex];
  if (!shard || shard.cellIds.length !== 5) fail("shard_invalid");
  if (
    plan.registrationDigest !== registration.registrationDigest ||
    plan.adapterDigest !== descriptor.descriptorDigest ||
    plan.adapterClass !== descriptor.runnerClass ||
    input.source.clean !== true ||
    input.source.commit !== plan.sourceCommit ||
    input.source.treeDigest !== plan.sourceTreeDigest
  )
    fail("source_or_plan_binding_invalid");
  if (
    authorization.planDigest !== plan.planDigest ||
    authorization.registrationDigest !== registration.registrationDigest ||
    authorization.adapterDigest !== descriptor.descriptorDigest ||
    authorization.sourceCommit !== input.source.commit ||
    authorization.sourceTreeDigest !== input.source.treeDigest ||
    !authorization.shardIndices.includes(input.shardIndex) ||
    authorization.maximumCells < 5
  )
    fail("authorization_invalid");
  await verifyNormativeOperationAuthorizationV1({
    schemaVersion: 1,
    authorization,
    now: new Date(input.now()).toISOString(),
    context: {
      schemaVersion: 1,
      audience: input.authorizationAudience,
      planDigest: plan.planDigest,
      registrationDigest: registration.registrationDigest,
      sourceCommit: input.source.commit,
      sourceTreeDigest: input.source.treeDigest,
      adapterDigest: descriptor.descriptorDigest,
      executionId: authorization.executionId,
      shardIndices: authorization.shardIndices,
      maximumCells: authorization.maximumCells,
    },
    verifier: input.authorizationVerifier,
  });
  const resolvedAdapter = validateResolvedAdapter(
    await input.adapterResolver.resolveRegisteredAdapterV1({
      schemaVersion: 1,
      purpose: "collective-statistical-campaign-normative-adapter-v1",
      descriptorDigest: descriptor.descriptorDigest,
      implementationDigest: descriptor.digests.implementationDigest,
      evaluatorDigest: descriptor.digests.evaluatorDigest,
      planDigest: plan.planDigest,
      authorizationDigest: authorization.authorizationDigest,
    }),
    descriptor,
  );
  const operationExecutionId =
    collectiveStatisticalCampaignNormativeExecutionIdV1({
      schemaVersion: 1,
      registration,
      descriptor,
      plan,
      authorization,
    });

  const shardResult = await runCollectiveStatisticalCampaignShardV1({
    schemaVersion: 1,
    registration,
    executionId: operationExecutionId,
    workerId: input.workerId,
    shard: { schemaVersion: 1, index: input.shardIndex, count: 48 },
    cellIds: shard.cellIds,
    leaseDurationMs: input.leaseDurationMs,
    maximumCells: 5,
    store: input.store,
    now: input.now,
    execute: (context) => resolvedAdapter.runner.executeV1(context),
  });
  if (
    shardResult.selectedCellCount !== 5 ||
    shardResult.executions.length !== 20
  )
    fail("shard_closure_invalid");

  const projections: NormativeMetricProjectionV1[] = [];
  const indexes: CollectiveStatisticalCampaignArtifactIndexEntryV1[] = [];
  const byReplay = new Map<string, string>();
  for (const execution of shardResult.executions) {
    const projection = validateNormativeMetricProjectionV1(
      await resolvedAdapter.projector.projectV1({
        schemaVersion: 1,
        registration,
        execution,
      }),
    );
    validateProjectionBinding(
      registration,
      operationExecutionId,
      descriptor.digests.evaluatorDigest,
      execution,
      projection,
    );
    const pairKey = `${execution.cellId}\u0000${execution.runner}`;
    const replaySignature = canonicalizePlanningJsonV1({
      sampleDigest: execution.sample.sampleDigest,
      traceRecords: execution.trace.records,
      ledgerRecords: execution.ledger.records,
      observations: execution.evidence.observations,
      projection: replayStableProjection(projection),
    } as unknown as PlanningJson);
    const first = byReplay.get(pairKey);
    if (execution.attempt === "first") byReplay.set(pairKey, replaySignature);
    else if (!first || first !== replaySignature) fail("replay_diverged");
    const bytes = new TextEncoder().encode(
      canonicalizePlanningJsonV1(projection as unknown as PlanningJson),
    );
    indexes.push(
      await input.artifacts.putArtifactV1({
        artifactId: `metric-projection:${operationExecutionId}:${execution.cellId}:${execution.runner}:${execution.attempt}`,
        kind: "metric-projection",
        bytes: single(bytes),
        maximumBytes: Math.min(
          descriptor.limits.maximumArtifactBytesPerExecution,
          COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_ARTIFACT_BYTES_V1,
        ),
      }),
    );
    projections.push(projection);
  }
  if (
    projections.length !== 20 ||
    indexes.length !== 20 ||
    byReplay.size !== 10
  )
    fail("projection_closure_invalid");
  return Object.freeze({
    schemaVersion: 1 as const,
    executionId: operationExecutionId,
    authorizationExecutionId: authorization.executionId,
    shardIndex: input.shardIndex,
    selectedCellCount: 5 as const,
    executedSlotCount: shardResult.executedSlotCount,
    resumedSlotCount: shardResult.resumedSlotCount,
    projectionCount: 20 as const,
    projectionArtifactIndexes: Object.freeze(indexes),
    projections: Object.freeze(projections),
  });
}

function validatePorts(
  input: Parameters<
    typeof runCollectiveStatisticalCampaignNormativeOperationV1
  >[0],
): void {
  if (
    !input.adapterResolver ||
    input.adapterResolver.schemaVersion !== 1 ||
    typeof input.adapterResolver.resolveRegisteredAdapterV1 !== "function" ||
    !input.authorizationVerifier ||
    input.authorizationVerifier.schemaVersion !== 1 ||
    typeof input.authorizationVerifier.verifyDetachedAuthorizationV1 !==
      "function" ||
    typeof input.authorizationAudience !== "string" ||
    input.authorizationAudience.length === 0 ||
    !input.artifacts ||
    input.artifacts.schemaVersion !== 1 ||
    typeof input.artifacts.putArtifactV1 !== "function"
  )
    fail("port_invalid");
}

function validateResolvedAdapter(
  input: CollectiveStatisticalCampaignResolvedNormativeAdapterV1,
  descriptor: NormativeRunnerDescriptorV1,
): CollectiveStatisticalCampaignResolvedNormativeAdapterV1 {
  if (
    !input ||
    typeof input !== "object" ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    Object.getOwnPropertySymbols(input).length !== 0 ||
    !sameOwnKeys(input, [
      "descriptorDigest",
      "evaluatorDigest",
      "implementationDigest",
      "projector",
      "runner",
      "schemaVersion",
    ]) ||
    input.schemaVersion !== 1 ||
    input.descriptorDigest !== descriptor.descriptorDigest ||
    input.implementationDigest !== descriptor.digests.implementationDigest ||
    input.evaluatorDigest !== descriptor.digests.evaluatorDigest ||
    !input.runner ||
    input.runner.schemaVersion !== 1 ||
    typeof input.runner.executeV1 !== "function" ||
    !input.projector ||
    input.projector.schemaVersion !== 1 ||
    typeof input.projector.projectV1 !== "function"
  )
    fail("adapter_resolution_invalid");
  return input;
}

function sameOwnKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.getOwnPropertyNames(value).sort();
  const wanted = [...expected].sort();
  return (
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
}

function validateProjectionBinding(
  registration: CollectiveEvaluationCampaignRegistrationV1,
  executionId: string,
  evaluatorDigest: string,
  execution: CollectiveStatisticalCampaignExecutionArtifactsV1,
  projection: NormativeMetricProjectionV1,
): void {
  const cell = registration.cells.find(
    (candidate) => candidate.cellId === execution.cellId,
  );
  if (
    !cell ||
    execution.executionId !== executionId ||
    projection.executionId !== executionId ||
    projection.evaluatorDigest !== evaluatorDigest ||
    projection.runKey !== execution.runKey ||
    projection.attempt !== execution.attempt ||
    projection.registrationDigest !== registration.registrationDigest ||
    projection.cellId !== execution.cellId ||
    projection.seed !== cell.seed ||
    projection.runner !== execution.runner ||
    projection.interactionCeiling !== cell.maximumInteractions ||
    projection.eventBinding.traceDigest !== execution.trace.traceDigest
  )
    fail("projection_binding_invalid");
}

function replayStableProjection(
  projection: NormativeMetricProjectionV1,
): unknown {
  const {
    projectionDigest: _projectionDigest,
    runKey: _runKey,
    attempt: _attempt,
    eventBinding,
    ...body
  } = projection;
  const {
    boundaryEvidenceDigest: _boundaryEvidenceDigest,
    traceDigest: _traceDigest,
    traceRoot: _traceRoot,
    monitorVerdictDigest: _monitorVerdictDigest,
    ...eventIdentity
  } = eventBinding;
  return { ...body, eventBinding: eventIdentity };
}

async function* single(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes;
}
function fail(reason: string): never {
  throw new TypeError(
    `collective_statistical_campaign_normative_operation_${reason}`,
  );
}
