import {
  canonicalizePlanningJsonV1,
  deepFreezePlanning,
  type PlanningJson,
} from "@agentplat/collective-planning";
import {
  collectiveEvaluationRunKeyV1,
  createCollectiveEvaluationCampaignManifestV1,
  validateCollectiveEvaluationCampaignRegistrationV1,
  type CollectiveEvaluationCampaignCellV1,
  type CollectiveEvaluationCampaignManifestV1,
  type CollectiveEvaluationCampaignRegistrationV1,
} from "@agentplat/collective-planning/evaluation";

import {
  digestCollectiveStatisticalCampaignArtifactV1,
  digestCollectiveStatisticalCampaignBundleV1,
  digestCollectiveStatisticalCampaignComparisonInputV1,
  digestCollectiveStatisticalCampaignComparisonV1,
  digestCollectiveStatisticalCampaignEvidenceV1,
  digestCollectiveStatisticalCampaignLedgerV1,
  digestCollectiveStatisticalCampaignSampleV1,
  digestCollectiveStatisticalCampaignSummaryV1,
  digestCollectiveStatisticalCampaignTraceV1,
  type CollectiveStatisticalCampaignArtifactIndexEntryV1,
  type CollectiveStatisticalCampaignArtifactKindV1,
  type CollectiveStatisticalCampaignAttemptV1,
  type CollectiveStatisticalCampaignBundleBytesV1,
  type CollectiveStatisticalCampaignBundleV1,
  type CollectiveStatisticalCampaignComparisonV1,
  type CollectiveStatisticalCampaignEvidenceV1,
  type CollectiveStatisticalCampaignExpectedArtifactV1,
  type CollectiveStatisticalCampaignLedgerV1,
  type CollectiveStatisticalCampaignRunnerV1,
  type CollectiveStatisticalCampaignSampleV1,
  type CollectiveStatisticalCampaignSourceLockV1,
  type CollectiveStatisticalCampaignSummaryV1,
  type CollectiveStatisticalCampaignTraceV1,
} from "./collective-statistical-campaign-bundle.js";

const runners = Object.freeze([
  "adaptive_collective",
  "centralized_planner",
] as const);
const attempts = Object.freeze(["first", "replay"] as const);
const encoder = new TextEncoder();

export interface CollectiveStatisticalCampaignRunnerOutputV1 {
  readonly schemaVersion: 1;
  readonly status: "passed" | "failed";
  /** Required and tokenized only when status is failed. */
  readonly reasonCode: string | null;
  readonly outcome: PlanningJson;
  readonly traceRecords: readonly PlanningJson[];
  readonly ledgerRecords: readonly PlanningJson[];
  readonly observations: readonly PlanningJson[];
}

export interface CollectiveStatisticalCampaignExecutionArtifactsV1 {
  readonly schemaVersion: 1;
  readonly executionId: string;
  readonly runKey: string;
  readonly cellId: string;
  readonly seed: number;
  readonly runner: CollectiveStatisticalCampaignRunnerV1;
  readonly attempt: CollectiveStatisticalCampaignAttemptV1;
  readonly reasonCode: string | null;
  readonly sampleArtifactId: string;
  readonly sample: CollectiveStatisticalCampaignSampleV1;
  readonly traceArtifactId: string;
  readonly trace: CollectiveStatisticalCampaignTraceV1;
  readonly ledgerArtifactId: string;
  readonly ledger: CollectiveStatisticalCampaignLedgerV1;
  readonly evidenceArtifactId: string;
  readonly evidence: CollectiveStatisticalCampaignEvidenceV1;
}

export interface CollectiveStatisticalCampaignProvenanceArtifactsV1 {
  readonly sourceLock: CollectiveStatisticalCampaignSourceLockV1;
  readonly packageLock: PlanningJson;
  readonly fixture: PlanningJson;
  readonly policy: PlanningJson;
  readonly environment: PlanningJson;
  readonly observationPolicy: PlanningJson;
  readonly monitor: PlanningJson;
  readonly hiddenCanary: PlanningJson;
}

export interface CollectiveStatisticalCampaignAggregationHooksV1 {
  readonly computeComparisonStatistics: (
    input: Readonly<{
      schemaVersion: 1;
      cell: CollectiveEvaluationCampaignCellV1;
      adaptive: CollectiveStatisticalCampaignSampleV1;
      centralized: CollectiveStatisticalCampaignSampleV1;
    }>,
  ) => PlanningJson;
  readonly computeSummaryStatistics: (
    input: Readonly<{
      schemaVersion: 1;
      registration: CollectiveEvaluationCampaignRegistrationV1;
      comparisons: readonly CollectiveStatisticalCampaignComparisonV1[];
    }>,
  ) => PlanningJson;
}

export interface CollectiveStatisticalCampaignAggregationInputV1 {
  readonly schemaVersion: 1;
  readonly registration: CollectiveEvaluationCampaignRegistrationV1;
  readonly provenance: CollectiveStatisticalCampaignProvenanceArtifactsV1;
  readonly executions: readonly CollectiveStatisticalCampaignExecutionArtifactsV1[];
  readonly bootstrap: Readonly<{
    readonly schemaVersion: 1;
    readonly seed: number;
    readonly resamples: number;
  }>;
  readonly hooks: CollectiveStatisticalCampaignAggregationHooksV1;
}

export interface CollectiveStatisticalCampaignAggregationResultV1 {
  readonly schemaVersion: 1;
  readonly manifest: CollectiveEvaluationCampaignManifestV1;
  readonly comparisons: readonly CollectiveStatisticalCampaignComparisonV1[];
  readonly summary: CollectiveStatisticalCampaignSummaryV1;
  readonly bundle: CollectiveStatisticalCampaignBundleV1;
  readonly bytes: CollectiveStatisticalCampaignBundleBytesV1;
}

/** Rebuilds one stored slot and rejects any execution, runKey or cell mismatch. */
export function validateCollectiveStatisticalCampaignExecutionArtifactsV1(
  registrationInput: CollectiveEvaluationCampaignRegistrationV1,
  executionId: string,
  execution: CollectiveStatisticalCampaignExecutionArtifactsV1,
): CollectiveStatisticalCampaignExecutionArtifactsV1 {
  const registration =
    validateCollectiveEvaluationCampaignRegistrationV1(registrationInput);
  if (execution.executionId !== executionId)
    throw new TypeError(
      "collective_statistical_campaign_execution_identity_mismatch",
    );
  return validateExecution(registration, execution);
}

/**
 * Converts one isolated runner result into the four immutable artifacts used by
 * the public bundle. The artifact ids are derived from the registered slot and
 * do not depend on worker identity, lease generation or filesystem layout.
 */
export function createCollectiveStatisticalCampaignExecutionArtifactsV1(
  input: Readonly<{
    schemaVersion: 1;
    executionId: string;
    runKey: string;
    registrationDigest: string;
    cell: CollectiveEvaluationCampaignCellV1;
    runner: CollectiveStatisticalCampaignRunnerV1;
    attempt: CollectiveStatisticalCampaignAttemptV1;
    output: CollectiveStatisticalCampaignRunnerOutputV1;
  }>,
): CollectiveStatisticalCampaignExecutionArtifactsV1 {
  if (input.schemaVersion !== 1 || input.cell.schemaVersion !== 1)
    throw new TypeError(
      "collective_statistical_campaign_execution_input_invalid",
    );
  requireRunner(input.runner);
  requireAttempt(input.attempt);
  requireOutput(input.output);
  const expectedRunKey = collectiveEvaluationRunKeyV1({
    executionId: input.executionId,
    registrationDigest: input.registrationDigest as never,
    cellId: input.cell.cellId,
    runner: input.runner,
    attempt: input.attempt,
  });
  if (input.runKey !== expectedRunKey)
    throw new TypeError("collective_statistical_campaign_run_key_invalid");
  const slotToken = input.registrationDigest.replace(/^sha256:/u, "");
  if (!/^[0-9a-f]{64}$/u.test(slotToken))
    throw new TypeError(
      "collective_statistical_campaign_registration_digest_invalid",
    );
  const scope = `${slotToken}:${input.cell.peerCount}:${input.cell.stratum}:${input.cell.seed}:${input.runner}:${input.attempt}`;
  const sampleArtifactId = `sample:${scope}`;
  const traceArtifactId = `trace:${scope}`;
  const ledgerArtifactId = `ledger:${scope}`;
  const evidenceArtifactId = `evidence:${scope}`;
  const sampleBody = {
    schemaVersion: 1 as const,
    cellId: input.cell.cellId,
    seed: input.cell.seed,
    runner: input.runner,
    attempt: input.attempt,
    status: input.output.status,
    traceArtifactId,
    ledgerArtifactId,
    evidenceArtifactId,
    outcome: ownJson(input.output.outcome),
  };
  const sample = deepFreezePlanning({
    ...sampleBody,
    sampleDigest: digestCollectiveStatisticalCampaignSampleV1(sampleBody),
  });
  const traceBody = {
    schemaVersion: 1 as const,
    sampleArtifactId,
    records: ownJsonArray(input.output.traceRecords),
  };
  const trace = deepFreezePlanning({
    ...traceBody,
    traceDigest: digestCollectiveStatisticalCampaignTraceV1(traceBody),
  });
  const ledgerBody = {
    schemaVersion: 1 as const,
    sampleArtifactId,
    records: ownJsonArray(input.output.ledgerRecords),
  };
  const ledger = deepFreezePlanning({
    ...ledgerBody,
    ledgerDigest: digestCollectiveStatisticalCampaignLedgerV1(ledgerBody),
  });
  const evidenceBody = {
    schemaVersion: 1 as const,
    sampleArtifactId,
    sampleDigest: sample.sampleDigest,
    observations: ownJsonArray(input.output.observations),
  };
  const evidence = deepFreezePlanning({
    ...evidenceBody,
    evidenceDigest: digestCollectiveStatisticalCampaignEvidenceV1(evidenceBody),
  });
  return deepFreezePlanning({
    schemaVersion: 1 as const,
    executionId: input.executionId,
    runKey: input.runKey,
    cellId: input.cell.cellId,
    seed: input.cell.seed,
    runner: input.runner,
    attempt: input.attempt,
    reasonCode: input.output.reasonCode,
    sampleArtifactId,
    sample,
    traceArtifactId,
    trace,
    ledgerArtifactId,
    ledger,
    evidenceArtifactId,
    evidence,
  });
}

/**
 * Produces the final immutable manifest and exact-closure evidence bundle.
 * Partial executions, duplicate slots and divergent replays fail closed.
 */
export async function aggregateCollectiveStatisticalCampaignV1(
  input: CollectiveStatisticalCampaignAggregationInputV1,
): Promise<CollectiveStatisticalCampaignAggregationResultV1> {
  if (input.schemaVersion !== 1)
    throw new TypeError(
      "collective_statistical_campaign_aggregation_input_invalid",
    );
  const registration = validateCollectiveEvaluationCampaignRegistrationV1(
    input.registration,
  );
  requireBootstrap(input.bootstrap);
  if (
    !input.hooks ||
    typeof input.hooks.computeComparisonStatistics !== "function" ||
    typeof input.hooks.computeSummaryStatistics !== "function"
  )
    throw new TypeError(
      "collective_statistical_campaign_aggregation_hooks_invalid",
    );
  assertProvenance(registration, input.provenance);

  const executionBySlot = new Map<
    string,
    CollectiveStatisticalCampaignExecutionArtifactsV1
  >();
  let executionId: string | null = null;
  for (const execution of input.executions) {
    if (executionId === null) executionId = execution.executionId;
    else if (execution.executionId !== executionId)
      throw new TypeError(
        "collective_statistical_campaign_execution_identity_mismatch",
      );
    const key = slotKey(execution.cellId, execution.runner, execution.attempt);
    if (executionBySlot.has(key))
      throw new TypeError(
        `collective_statistical_campaign_duplicate_slot:${key}`,
      );
    executionBySlot.set(
      key,
      validateCollectiveStatisticalCampaignExecutionArtifactsV1(
        registration,
        executionId,
        execution,
      ),
    );
  }
  const expectedSlotCount =
    registration.cells.length * runners.length * attempts.length;
  if (executionBySlot.size !== expectedSlotCount)
    throw new TypeError(
      "collective_statistical_campaign_incomplete_execution_closure",
    );

  for (const cell of registration.cells) {
    for (const runner of runners) {
      const first = executionBySlot.get(slotKey(cell.cellId, runner, "first"));
      const replay = executionBySlot.get(
        slotKey(cell.cellId, runner, "replay"),
      );
      if (!first || !replay)
        throw new TypeError(
          "collective_statistical_campaign_missing_replay_pair",
        );
      if (
        first.sample.sampleDigest !== replay.sample.sampleDigest ||
        json(first.trace.records) !== json(replay.trace.records) ||
        json(first.ledger.records) !== json(replay.ledger.records) ||
        json(first.evidence.observations) !== json(replay.evidence.observations)
      )
        throw new TypeError(
          `collective_statistical_campaign_replay_diverged:${cell.cellId}:${runner}`,
        );
    }
  }

  const artifactValues = new Map<
    string,
    Readonly<{
      kind: CollectiveStatisticalCampaignArtifactKindV1;
      value: PlanningJson;
      expectation: CollectiveStatisticalCampaignExpectedArtifactV1;
    }>
  >();
  const add = (
    artifactId: string,
    kind: CollectiveStatisticalCampaignArtifactKindV1,
    value: PlanningJson,
    scope: Partial<
      Pick<
        CollectiveStatisticalCampaignExpectedArtifactV1,
        "cellId" | "seed" | "runner" | "attempt"
      >
    > = {},
  ) => {
    if (artifactValues.has(artifactId))
      throw new TypeError(
        `collective_statistical_campaign_duplicate_artifact:${artifactId}`,
      );
    const expectation = deepFreezePlanning({
      schemaVersion: 1 as const,
      artifactId,
      kind,
      cellId: scope.cellId ?? null,
      seed: scope.seed ?? null,
      runner: scope.runner ?? null,
      attempt: scope.attempt ?? null,
    });
    artifactValues.set(
      artifactId,
      deepFreezePlanning({ kind, value: ownJson(value), expectation }),
    );
  };

  add(
    "global:source-lock",
    "source-lock",
    input.provenance.sourceLock as unknown as PlanningJson,
  );
  add("global:package-lock", "package-lock", input.provenance.packageLock);
  add("global:fixture", "fixture", input.provenance.fixture);
  add("global:policy", "policy", input.provenance.policy);
  add("global:environment", "environment", input.provenance.environment);
  add(
    "global:observation-policy",
    "observation-policy",
    input.provenance.observationPolicy,
  );
  add("global:monitor", "monitor", input.provenance.monitor);
  add("global:hidden-canary", "hidden-canary", input.provenance.hiddenCanary);
  add(
    "global:registration",
    "registration",
    registration as unknown as PlanningJson,
  );

  for (const cell of registration.cells) {
    for (const runner of runners) {
      for (const attempt of attempts) {
        const execution = executionBySlot.get(
          slotKey(cell.cellId, runner, attempt),
        )!;
        const scope = {
          cellId: cell.cellId,
          seed: cell.seed,
          runner,
          attempt,
        } as const;
        add(
          execution.sampleArtifactId,
          "sample",
          execution.sample as unknown as PlanningJson,
          scope,
        );
        add(
          execution.traceArtifactId,
          "trace",
          execution.trace as unknown as PlanningJson,
          scope,
        );
        add(
          execution.ledgerArtifactId,
          "ledger",
          execution.ledger as unknown as PlanningJson,
          scope,
        );
        add(
          execution.evidenceArtifactId,
          "evidence",
          execution.evidence as unknown as PlanningJson,
          scope,
        );
      }
    }
  }

  const comparisons: CollectiveStatisticalCampaignComparisonV1[] = [];
  const comparisonIdByCell = new Map<string, string>();
  for (const cell of registration.cells) {
    const adaptive = executionBySlot.get(
      slotKey(cell.cellId, "adaptive_collective", "first"),
    )!;
    const centralized = executionBySlot.get(
      slotKey(cell.cellId, "centralized_planner", "first"),
    )!;
    const statistics = ownJson(
      input.hooks.computeComparisonStatistics(
        deepFreezePlanning({
          schemaVersion: 1 as const,
          cell,
          adaptive: adaptive.sample,
          centralized: centralized.sample,
        }),
      ),
    );
    const body = {
      schemaVersion: 1 as const,
      cellId: cell.cellId,
      adaptiveSampleArtifactIds: Object.freeze([adaptive.sampleArtifactId]),
      centralizedSampleArtifactIds: Object.freeze([
        centralized.sampleArtifactId,
      ]),
      bootstrap: deepFreezePlanning({ ...input.bootstrap }),
      statistics,
      inputDigest: digestCollectiveStatisticalCampaignComparisonInputV1({
        cellId: cell.cellId,
        adaptiveSampleDigests: [adaptive.sample.sampleDigest],
        centralizedSampleDigests: [centralized.sample.sampleDigest],
        bootstrap: input.bootstrap,
      }),
    };
    const comparison = deepFreezePlanning({
      ...body,
      comparisonDigest: digestCollectiveStatisticalCampaignComparisonV1(body),
    });
    const artifactId = `comparison:${registration.registrationDigest.replace(/^sha256:/u, "")}:${cell.peerCount}:${cell.stratum}:${cell.seed}`;
    comparisonIdByCell.set(cell.cellId, artifactId);
    comparisons.push(comparison);
    add(artifactId, "comparison", comparison as unknown as PlanningJson, {
      cellId: cell.cellId,
    });
  }

  const manifest = createCollectiveEvaluationCampaignManifestV1(registration, {
    schemaVersion: 1,
    registrationDigest: registration.registrationDigest,
    entries: registration.cells.map((cell) => {
      const cellExecutions = runners.flatMap((runner) =>
        attempts.map((attempt) =>
          executionBySlot.get(slotKey(cell.cellId, runner, attempt))!,
        ),
      );
      const failed = cellExecutions.find(
        (execution) => execution.sample.status === "failed",
      );
      if (failed)
        return deepFreezePlanning({
          schemaVersion: 1 as const,
          cellId: cell.cellId,
          status: "failure" as const,
          reasonCode: failed.reasonCode ?? "runner_failed",
          adaptiveResultDigest: null,
          centralizedResultDigest: null,
          adaptiveTraceDigest: null,
          centralizedTraceDigest: null,
          adaptiveLedgerDigest: null,
          centralizedLedgerDigest: null,
          fairnessDigest: null,
          adaptiveCampaignEvidenceDigest: null,
          centralizedCampaignEvidenceDigest: null,
        });
      const adaptive = executionBySlot.get(
        slotKey(cell.cellId, "adaptive_collective", "first"),
      )!;
      const centralized = executionBySlot.get(
        slotKey(cell.cellId, "centralized_planner", "first"),
      )!;
      const comparison = comparisons.find(
        (value) => value.cellId === cell.cellId,
      )!;
      return deepFreezePlanning({
        schemaVersion: 1 as const,
        cellId: cell.cellId,
        status: "success" as const,
        reasonCode: null,
        adaptiveResultDigest: adaptive.sample.sampleDigest,
        centralizedResultDigest: centralized.sample.sampleDigest,
        adaptiveTraceDigest: adaptive.trace.traceDigest,
        centralizedTraceDigest: centralized.trace.traceDigest,
        adaptiveLedgerDigest: adaptive.ledger.ledgerDigest,
        centralizedLedgerDigest: centralized.ledger.ledgerDigest,
        fairnessDigest: comparison.comparisonDigest,
        adaptiveCampaignEvidenceDigest: adaptive.evidence.evidenceDigest,
        centralizedCampaignEvidenceDigest: centralized.evidence.evidenceDigest,
      });
    }),
  });
  add("global:manifest", "manifest", manifest as unknown as PlanningJson);

  const summaryBody = {
    schemaVersion: 1 as const,
    comparisonArtifactIds: Object.freeze(
      registration.cells.map((cell) => comparisonIdByCell.get(cell.cellId)!),
    ),
    status: manifest.entries.some((entry) => entry.status === "failure")
      ? ("failed" as const)
      : ("passed" as const),
    statistics: ownJson(
      input.hooks.computeSummaryStatistics(
        deepFreezePlanning({
          schemaVersion: 1 as const,
          registration,
          comparisons: Object.freeze([...comparisons]),
        }),
      ),
    ),
  };
  const summary = deepFreezePlanning({
    ...summaryBody,
    summaryDigest: digestCollectiveStatisticalCampaignSummaryV1(summaryBody),
  });
  add("global:summary", "summary", summary as unknown as PlanningJson);

  const expectedArtifacts = Object.freeze(
    [...artifactValues.values()].map((entry) => entry.expectation),
  );
  const artifacts: CollectiveStatisticalCampaignArtifactIndexEntryV1[] = [];
  const bytes: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  for (const [artifactId, entry] of artifactValues) {
    const serialized = json(entry.value);
    const encoded = encoder.encode(serialized);
    bytes[artifactId] = serialized;
    artifacts.push(
      deepFreezePlanning({
        schemaVersion: 1 as const,
        artifactId,
        kind: entry.kind,
        path: `${entry.kind}/${artifactId}.json`,
        byteLength: encoded.byteLength,
        sha256: await sha256(encoded),
        canonicalDigest: digestCollectiveStatisticalCampaignArtifactV1(
          entry.kind,
          entry.value,
        ),
      }),
    );
  }
  const bundleBody = {
    schemaVersion: 1 as const,
    campaignId: registration.campaignId,
    sourceLockArtifactId: "global:source-lock",
    registrationArtifactId: "global:registration",
    manifestArtifactId: "global:manifest",
    cells: Object.freeze(
      registration.cells.map((cell) =>
        deepFreezePlanning({
          schemaVersion: 1 as const,
          cellId: cell.cellId,
          comparisonArtifactId: comparisonIdByCell.get(cell.cellId)!,
        }),
      ),
    ),
    expectedArtifacts,
    artifacts: Object.freeze(artifacts),
    summaryArtifactId: "global:summary",
  };
  const bundle = deepFreezePlanning({
    ...bundleBody,
    bundleDigest: digestCollectiveStatisticalCampaignBundleV1(bundleBody),
  });
  return deepFreezePlanning({
    schemaVersion: 1 as const,
    manifest,
    comparisons: Object.freeze(comparisons),
    summary,
    bundle,
    bytes: Object.freeze(bytes),
  });
}

function assertProvenance(
  registration: CollectiveEvaluationCampaignRegistrationV1,
  provenance: CollectiveStatisticalCampaignProvenanceArtifactsV1,
): void {
  const bindings = [
    ["source-lock", provenance.sourceLock, registration.sourceDigest],
    ["package-lock", provenance.packageLock, registration.packageDigest],
    ["fixture", provenance.fixture, registration.fixtureManifestDigest],
    ["policy", provenance.policy, registration.policyDigest],
    ["environment", provenance.environment, registration.environmentDigest],
    [
      "observation-policy",
      provenance.observationPolicy,
      registration.observationPolicyDigest,
    ],
    ["monitor", provenance.monitor, registration.monitorDigest],
    ["hidden-canary", provenance.hiddenCanary, registration.hiddenCanaryDigest],
  ] as const;
  for (const [kind, value, expectedDigest] of bindings) {
    const digest = digestCollectiveStatisticalCampaignArtifactV1(
      kind,
      value as PlanningJson,
    );
    if (digest !== expectedDigest)
      throw new TypeError(
        `collective_statistical_campaign_provenance_mismatch:${kind}`,
      );
  }
}

function validateExecution(
  registration: CollectiveEvaluationCampaignRegistrationV1,
  execution: CollectiveStatisticalCampaignExecutionArtifactsV1,
): CollectiveStatisticalCampaignExecutionArtifactsV1 {
  if (execution.schemaVersion !== 1)
    throw new TypeError("collective_statistical_campaign_execution_invalid");
  requireRunner(execution.runner);
  requireAttempt(execution.attempt);
  const cell = registration.cells.find(
    (value) => value.cellId === execution.cellId,
  );
  if (!cell || cell.seed !== execution.seed)
    throw new TypeError(
      "collective_statistical_campaign_execution_not_registered",
    );
  const rebuilt = createCollectiveStatisticalCampaignExecutionArtifactsV1({
    schemaVersion: 1,
    executionId: execution.executionId,
    runKey: execution.runKey,
    registrationDigest: registration.registrationDigest,
    cell,
    runner: execution.runner,
    attempt: execution.attempt,
    output: {
      schemaVersion: 1,
      status: execution.sample.status,
      reasonCode: execution.reasonCode,
      outcome: execution.sample.outcome,
      traceRecords: execution.trace.records,
      ledgerRecords: execution.ledger.records,
      observations: execution.evidence.observations,
    },
  });
  if (json(rebuilt) !== json(execution))
    throw new TypeError(
      "collective_statistical_campaign_execution_artifacts_invalid",
    );
  return rebuilt;
}

function requireOutput(
  output: CollectiveStatisticalCampaignRunnerOutputV1,
): void {
  if (
    !output ||
    output.schemaVersion !== 1 ||
    (output.status !== "passed" && output.status !== "failed") ||
    (output.status === "passed" && output.reasonCode !== null) ||
    (output.status === "failed" && !reasonCode(output.reasonCode)) ||
    !Array.isArray(output.traceRecords) ||
    !Array.isArray(output.ledgerRecords) ||
    !Array.isArray(output.observations) ||
    output.traceRecords.length > 16_384 ||
    output.ledgerRecords.length > 16_384 ||
    output.observations.length > 16_384
  )
    throw new TypeError(
      "collective_statistical_campaign_runner_output_invalid",
    );
  ownJson(output.outcome);
  ownJsonArray(output.traceRecords);
  ownJsonArray(output.ledgerRecords);
  ownJsonArray(output.observations);
}

function requireBootstrap(
  value: CollectiveStatisticalCampaignAggregationInputV1["bootstrap"],
): void {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.seed) ||
    value.seed < 0 ||
    !Number.isSafeInteger(value.resamples) ||
    value.resamples < 10_000
  )
    throw new TypeError("collective_statistical_campaign_bootstrap_invalid");
}

function requireRunner(
  value: string,
): asserts value is CollectiveStatisticalCampaignRunnerV1 {
  if (!runners.includes(value as CollectiveStatisticalCampaignRunnerV1))
    throw new TypeError("collective_statistical_campaign_runner_invalid");
}

function requireAttempt(
  value: string,
): asserts value is CollectiveStatisticalCampaignAttemptV1 {
  if (!attempts.includes(value as CollectiveStatisticalCampaignAttemptV1))
    throw new TypeError("collective_statistical_campaign_attempt_invalid");
}

function reasonCode(value: unknown): value is string {
  return (
    typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,127}$/u.test(value)
  );
}

function slotKey(
  cellId: string,
  runner: CollectiveStatisticalCampaignRunnerV1,
  attempt: CollectiveStatisticalCampaignAttemptV1,
): string {
  return `${cellId}\0${runner}\0${attempt}`;
}

function ownJson<T extends PlanningJson>(value: T): T {
  return JSON.parse(json(value)) as T;
}

function ownJsonArray(value: readonly PlanningJson[]): readonly PlanningJson[] {
  return Object.freeze(value.map((entry) => ownJson(entry)));
}

function json(value: PlanningJson | object): string {
  return canonicalizePlanningJsonV1(value as PlanningJson, {
    maximumBytes: 67_108_864,
    maximumDepth: 64,
    maximumNodes: 2_000_000,
    maximumKeysPerObject: 4_096,
    maximumItemsPerArray: 262_144,
  });
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const source = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest("SHA-256", source),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
