import {
  canonicalizePlanningJsonV1,
  digestPlanningJsonV1,
  type PlanningDigestV1,
  type PlanningJson,
} from "@agentplat/collective-planning";
import {
  validateCollectiveEvaluationCampaignManifestV1,
  validateCollectiveEvaluationCampaignRegistrationV1,
  type CollectiveEvaluationCampaignManifestEntryV1,
  type CollectiveEvaluationCampaignManifestV1,
  type CollectiveEvaluationCampaignRegistrationV1,
} from "@agentplat/collective-planning/evaluation";

type JsonValue = PlanningJson;

export const COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_ARTIFACT_BYTES_V1 =
  16 * 1024 * 1024;
export const COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_BUNDLE_BYTES_V1 =
  256 * 1024 * 1024;

export type CollectiveStatisticalCampaignArtifactKindV1 =
  | "source-lock"
  | "package-lock"
  | "fixture"
  | "policy"
  | "environment"
  | "observation-policy"
  | "monitor"
  | "hidden-canary"
  | "registration"
  | "manifest"
  | "sample"
  | "trace"
  | "ledger"
  | "evidence"
  | "comparison"
  | "summary";

export type CollectiveStatisticalCampaignRunnerV1 =
  | "adaptive_collective"
  | "centralized_planner";
export type CollectiveStatisticalCampaignAttemptV1 = "first" | "replay";

export interface CollectiveStatisticalCampaignArtifactIndexEntryV1 {
  readonly schemaVersion: 1;
  readonly artifactId: string;
  readonly kind: CollectiveStatisticalCampaignArtifactKindV1;
  readonly path: string;
  readonly byteLength: number;
  /** SHA-256 of the exact supplied UTF-8/string or Uint8Array bytes. */
  readonly sha256: string;
  /** Digest of parsed canonical JSON, independent of presentation whitespace. */
  readonly canonicalDigest: PlanningDigestV1;
}

export interface CollectiveStatisticalCampaignCellV1 {
  readonly schemaVersion: 1;
  readonly cellId: string;
  readonly comparisonArtifactId: string;
}

export interface CollectiveStatisticalCampaignExpectedArtifactV1 {
  readonly schemaVersion: 1;
  readonly artifactId: string;
  readonly kind: CollectiveStatisticalCampaignArtifactKindV1;
  readonly cellId: string | null;
  readonly seed: number | null;
  readonly runner: CollectiveStatisticalCampaignRunnerV1 | null;
  readonly attempt: CollectiveStatisticalCampaignAttemptV1 | null;
}

export interface CollectiveStatisticalCampaignSourceLockV1 {
  readonly schemaVersion: 1;
  readonly sourceCommit: string;
  readonly sourceTreeDigest: PlanningDigestV1;
  readonly dirtyWorktree: false;
}

export interface CollectiveStatisticalCampaignSampleV1 {
  readonly schemaVersion: 1;
  readonly cellId: string;
  readonly seed: number;
  readonly runner: CollectiveStatisticalCampaignRunnerV1;
  readonly attempt: CollectiveStatisticalCampaignAttemptV1;
  /** Failed executions are evidence and must remain in the closed bundle. */
  readonly status: "passed" | "failed";
  readonly traceArtifactId: string;
  readonly ledgerArtifactId: string;
  readonly evidenceArtifactId: string;
  readonly outcome: JsonValue;
  readonly sampleDigest: PlanningDigestV1;
}

export interface CollectiveStatisticalCampaignTraceV1 {
  readonly schemaVersion: 1;
  readonly sampleArtifactId: string;
  readonly records: readonly JsonValue[];
  readonly traceDigest: PlanningDigestV1;
}

export interface CollectiveStatisticalCampaignLedgerV1 {
  readonly schemaVersion: 1;
  readonly sampleArtifactId: string;
  readonly records: readonly JsonValue[];
  readonly ledgerDigest: PlanningDigestV1;
}

export interface CollectiveStatisticalCampaignEvidenceV1 {
  readonly schemaVersion: 1;
  readonly sampleArtifactId: string;
  readonly sampleDigest: PlanningDigestV1;
  readonly observations: readonly JsonValue[];
  readonly evidenceDigest: PlanningDigestV1;
}

export interface CollectiveStatisticalCampaignComparisonV1 {
  readonly schemaVersion: 1;
  readonly cellId: string;
  readonly adaptiveSampleArtifactIds: readonly string[];
  readonly centralizedSampleArtifactIds: readonly string[];
  readonly bootstrap: {
    readonly schemaVersion: 1;
    readonly seed: number;
    readonly resamples: number;
  };
  readonly statistics: JsonValue;
  readonly inputDigest: PlanningDigestV1;
  readonly comparisonDigest: PlanningDigestV1;
}

export interface CollectiveStatisticalCampaignSummaryV1 {
  readonly schemaVersion: 1;
  readonly comparisonArtifactIds: readonly string[];
  readonly status: "passed" | "failed";
  readonly statistics: JsonValue;
  readonly summaryDigest: PlanningDigestV1;
}

export interface CollectiveStatisticalCampaignBundleV1 {
  readonly schemaVersion: 1;
  readonly campaignId: string;
  readonly sourceLockArtifactId: string;
  readonly registrationArtifactId: string;
  readonly manifestArtifactId: string;
  readonly cells: readonly CollectiveStatisticalCampaignCellV1[];
  readonly expectedArtifacts: readonly CollectiveStatisticalCampaignExpectedArtifactV1[];
  readonly artifacts: readonly CollectiveStatisticalCampaignArtifactIndexEntryV1[];
  readonly summaryArtifactId: string;
  readonly bundleDigest: PlanningDigestV1;
}

export interface CollectiveStatisticalCampaignBundleBytesV1 {
  readonly [artifactId: string]: Uint8Array | string;
}

export interface CollectiveStatisticalCampaignBundleVerificationHooksV1 {
  /** Trusted provenance supplied outside the self-described bundle. */
  readonly expectedSourceLock: Readonly<{
    readonly sourceCommit: string;
    readonly sourceTreeDigest: PlanningDigestV1;
  }>;
  readonly validateArtifact?: (
    kind: CollectiveStatisticalCampaignArtifactKindV1,
    value: JsonValue,
    context: Readonly<{ artifactId: string; path: string }>,
  ) => void;
  readonly recomputeComparisonStatistics: (
    comparison: CollectiveStatisticalCampaignComparisonV1,
    adaptive: readonly CollectiveStatisticalCampaignSampleV1[],
    centralized: readonly CollectiveStatisticalCampaignSampleV1[],
  ) => JsonValue;
  readonly recomputeSummaryStatistics: (
    summary: CollectiveStatisticalCampaignSummaryV1,
    comparisons: readonly CollectiveStatisticalCampaignComparisonV1[],
  ) => JsonValue;
}

export interface CollectiveStatisticalCampaignBundleVerificationResultV1 {
  readonly schemaVersion: 1;
  readonly campaignId: string;
  readonly registrationDigest: PlanningDigestV1;
  readonly manifestDigest: PlanningDigestV1;
  readonly artifactCount: number;
  readonly sampleCount: number;
  readonly comparisonCount: number;
  readonly status: "passed" | "failed";
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const MAXIMUM_SNAPSHOT_DEPTH = 64;
const MAXIMUM_SNAPSHOT_NODES = 1_000_000;
const MAXIMUM_SNAPSHOT_FIELDS = 16_384;
const ARTIFACT_JSON_LIMITS = Object.freeze({
  maximumBytes: COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_ARTIFACT_BYTES_V1,
  maximumDepth: MAXIMUM_SNAPSHOT_DEPTH,
  maximumNodes: MAXIMUM_SNAPSHOT_NODES,
  maximumKeysPerObject: 4_096,
  maximumItemsPerArray: MAXIMUM_SNAPSHOT_FIELDS,
});
const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const hexPattern = /^[0-9a-f]{64}$/u;
const artifactKinds = new Set<CollectiveStatisticalCampaignArtifactKindV1>([
  "source-lock",
  "package-lock",
  "fixture",
  "policy",
  "environment",
  "observation-policy",
  "monitor",
  "hidden-canary",
  "registration",
  "manifest",
  "sample",
  "trace",
  "ledger",
  "evidence",
  "comparison",
  "summary",
]);

export function digestCollectiveStatisticalCampaignArtifactV1(
  kind: CollectiveStatisticalCampaignArtifactKindV1,
  value: JsonValue,
): PlanningDigestV1 {
  kindValue(kind);
  return digestArtifact({ schemaVersion: 1, kind, value });
}

export function digestCollectiveStatisticalCampaignSampleV1(
  value: Omit<CollectiveStatisticalCampaignSampleV1, "sampleDigest">,
): PlanningDigestV1 {
  const snapshot = snapshotJson(value, "sample digest input") as unknown as Omit<
    CollectiveStatisticalCampaignSampleV1,
    "sampleDigest"
  >;
  const {
    attempt: _attempt,
    traceArtifactId: _trace,
    ledgerArtifactId: _ledger,
    evidenceArtifactId: _evidence,
    ...replayStable
  } = snapshot;
  return digestArtifact({
    schemaVersion: 1,
    kind: "sample-result",
    value: replayStable,
  });
}

export function digestCollectiveStatisticalCampaignTraceV1(
  value: Omit<CollectiveStatisticalCampaignTraceV1, "traceDigest">,
): PlanningDigestV1 {
  return digestArtifact({ schemaVersion: 1, kind: "trace", value });
}

export function digestCollectiveStatisticalCampaignLedgerV1(
  value: Omit<CollectiveStatisticalCampaignLedgerV1, "ledgerDigest">,
): PlanningDigestV1 {
  return digestArtifact({ schemaVersion: 1, kind: "ledger", value });
}

export function digestCollectiveStatisticalCampaignEvidenceV1(
  value: Omit<CollectiveStatisticalCampaignEvidenceV1, "evidenceDigest">,
): PlanningDigestV1 {
  return digestArtifact({ schemaVersion: 1, kind: "evidence", value });
}

export function digestCollectiveStatisticalCampaignComparisonInputV1(input: {
  readonly cellId: string;
  readonly adaptiveSampleDigests: readonly PlanningDigestV1[];
  readonly centralizedSampleDigests: readonly PlanningDigestV1[];
  readonly bootstrap: CollectiveStatisticalCampaignComparisonV1["bootstrap"];
}): PlanningDigestV1 {
  return digestArtifact({
    schemaVersion: 1,
    kind: "comparison-input",
    value: input,
  });
}

export function digestCollectiveStatisticalCampaignComparisonV1(
  value: Omit<CollectiveStatisticalCampaignComparisonV1, "comparisonDigest">,
): PlanningDigestV1 {
  return digestArtifact({ schemaVersion: 1, kind: "comparison", value });
}

export function digestCollectiveStatisticalCampaignSummaryV1(
  value: Omit<CollectiveStatisticalCampaignSummaryV1, "summaryDigest">,
): PlanningDigestV1 {
  return digestArtifact({ schemaVersion: 1, kind: "summary", value });
}

export function digestCollectiveStatisticalCampaignBundleV1(
  value: Omit<CollectiveStatisticalCampaignBundleV1, "bundleDigest">,
): PlanningDigestV1 {
  const snapshot = snapshotJson(value, "bundle digest input");
  return digestPlanningJsonV1("evaluation-campaign-bundle-v1", snapshot);
}

/**
 * Verifies a fully supplied in-memory bundle. Paths remain logical: this
 * function performs no file-system or network access and trusts no summary.
 */
export async function verifyCollectiveStatisticalCampaignBundleV1(
  bundleInput: unknown,
  suppliedBytesInput: unknown,
  hooksInput: CollectiveStatisticalCampaignBundleVerificationHooksV1,
): Promise<CollectiveStatisticalCampaignBundleVerificationResultV1> {
  const parsedBundle = validateBundle(snapshotJson(bundleInput, "bundle"));
  const byteMap = snapshotByteMap(suppliedBytesInput);
  const hooks = snapshotHooks(hooksInput);
  const expected = new Map(
    parsedBundle.expectedArtifacts.map((value) => [value.artifactId, value]),
  );
  const indexed = new Map(
    parsedBundle.artifacts.map((value) => [value.artifactId, value]),
  );
  if (
    expected.size !== indexed.size ||
    [...expected.keys()].some((id) => !indexed.has(id))
  )
    fail("artifact index is not an exact closure of expected artifacts");
  for (const [artifactId, expectation] of expected) {
    if (indexed.get(artifactId)!.kind !== expectation.kind)
      fail(`artifact kind does not match expectation: ${artifactId}`);
    assertExpectedArtifactScope(expectation);
  }
  if (
    Object.keys(byteMap).length !== indexed.size ||
    [...indexed.keys()].some((id) => !(id in byteMap))
  )
    fail("supplied artifact bytes are not an exact closure of the index");

  const values = new Map<string, JsonValue>();
  for (const [artifactId, entry] of indexed) {
    const raw = byteMap[artifactId]!;
    if (
      raw.byteLength !== entry.byteLength ||
      (await sha256(raw)) !== entry.sha256
    )
      fail(`artifact bytes do not match index: ${artifactId}`);
    const value = parseJson(raw, artifactId);
    if (
      digestCollectiveStatisticalCampaignArtifactV1(entry.kind, value) !==
      entry.canonicalDigest
    )
      fail(`artifact canonical digest is invalid: ${artifactId}`);
    hooks.validateArtifact?.(entry.kind, value, {
      artifactId,
      path: entry.path,
    });
    values.set(artifactId, value);
  }

  assertGlobalArtifact(parsedBundle.sourceLockArtifactId, "source-lock", expected);
  assertGlobalArtifact(parsedBundle.registrationArtifactId, "registration", expected);
  assertGlobalArtifact(parsedBundle.manifestArtifactId, "manifest", expected);
  assertGlobalArtifact(parsedBundle.summaryArtifactId, "summary", expected);
  const sourceLock = validateSourceLock(
    values.get(parsedBundle.sourceLockArtifactId),
  );
  if (
    sourceLock.sourceCommit !== hooks.expectedSourceLock.sourceCommit ||
    sourceLock.sourceTreeDigest !== hooks.expectedSourceLock.sourceTreeDigest
  )
    fail("source lock does not match trusted provenance");

  const registration = validateRegistration(
    values.get(parsedBundle.registrationArtifactId),
  );
  const manifest = validateManifest(
    values.get(parsedBundle.manifestArtifactId),
    registration,
  );
  if (registration.campaignId !== parsedBundle.campaignId)
    fail("bundle campaignId does not match registration");
  assertRegistrationProvenance(registration, indexed);

  const registeredCells = new Map(
    registration.cells.map((cell) => [cell.cellId, cell]),
  );
  if (
    parsedBundle.cells.length !== registration.cells.length ||
    parsedBundle.cells.some(
      (cell, index) => cell.cellId !== registration.cells[index]!.cellId,
    )
  )
    fail("bundle cells do not exactly match the registered schedule");
  const manifestEntries = new Map(
    manifest.entries.map((entry) => [entry.cellId, entry]),
  );

  const comparisons = new Map<string, CollectiveStatisticalCampaignComparisonV1>();
  const samples = new Map<string, CollectiveStatisticalCampaignSampleV1>();
  const traces = new Map<string, CollectiveStatisticalCampaignTraceV1>();
  const ledgers = new Map<string, CollectiveStatisticalCampaignLedgerV1>();
  const evidence = new Map<string, CollectiveStatisticalCampaignEvidenceV1>();
  for (const [artifactId, entry] of indexed) {
    const value = values.get(artifactId)!;
    if (entry.kind === "sample") samples.set(artifactId, validateSample(value));
    if (entry.kind === "trace") traces.set(artifactId, validateTrace(value));
    if (entry.kind === "ledger") ledgers.set(artifactId, validateLedger(value));
    if (entry.kind === "evidence") evidence.set(artifactId, validateEvidence(value));
    if (entry.kind === "comparison")
      comparisons.set(artifactId, validateComparison(value));
  }
  const summary = validateSummary(values.get(parsedBundle.summaryArtifactId));

  assertArtifactReferenceClosure(samples, traces, ledgers, evidence);
  for (const [artifactId, sample] of samples) {
    const expectation = expected.get(artifactId);
    const registeredCell = registeredCells.get(sample.cellId);
    if (
      !expectation ||
      expectation.kind !== "sample" ||
      !registeredCell ||
      sample.seed !== registeredCell.seed ||
      expectation.cellId !== sample.cellId ||
      expectation.seed !== sample.seed ||
      expectation.runner !== sample.runner ||
      expectation.attempt !== sample.attempt
    )
      fail(`sample is not registered: ${artifactId}`);
    assertExecutionArtifactBinding(
      artifactId,
      sample,
      expectation,
      expected,
      traces,
      ledgers,
      evidence,
    );
  }
  for (const expectation of expected.values()) {
    if (expectation.kind === "sample" && !samples.has(expectation.artifactId))
      fail(`expected sample is absent: ${expectation.artifactId}`);
  }
  assertExactAttempts(
    registration,
    samples,
    traces,
    ledgers,
    evidence,
    expected,
  );

  const orderedComparisons: CollectiveStatisticalCampaignComparisonV1[] = [];
  for (const cell of parsedBundle.cells) {
    const registeredCell = registeredCells.get(cell.cellId)!;
    const manifestEntry = manifestEntries.get(cell.cellId)!;
    const comparisonExpectation = expected.get(cell.comparisonArtifactId);
    const comparison = comparisons.get(cell.comparisonArtifactId);
    if (
      comparisonExpectation?.kind !== "comparison" ||
      comparisonExpectation.cellId !== cell.cellId ||
      !comparison ||
      comparison.cellId !== cell.cellId
    )
      fail(`comparison is missing or substituted: ${cell.cellId}`);
    const adaptive = comparison.adaptiveSampleArtifactIds.map((id) =>
      sampleFor(id, samples, registeredCell.seed, cell.cellId, "adaptive_collective"),
    );
    const centralized = comparison.centralizedSampleArtifactIds.map((id) =>
      sampleFor(id, samples, registeredCell.seed, cell.cellId, "centralized_planner"),
    );
    if (adaptive.length !== 1 || centralized.length !== 1)
      fail(`comparison is not an exact paired cell: ${cell.cellId}`);
    const inputDigest = digestCollectiveStatisticalCampaignComparisonInputV1({
      cellId: comparison.cellId,
      adaptiveSampleDigests: adaptive.map((sample) => sample.sampleDigest),
      centralizedSampleDigests: centralized.map((sample) => sample.sampleDigest),
      bootstrap: comparison.bootstrap,
    });
    if (comparison.inputDigest !== inputDigest)
      fail(`comparison input digest is invalid: ${cell.cellId}`);
    if (
      !sameJson(
        hooks.recomputeComparisonStatistics(
          comparison,
          adaptive,
          centralized,
        ),
        comparison.statistics,
      )
    )
      fail(`comparison statistics are not independently recomputable: ${cell.cellId}`);
    assertManifestEntry(
      manifestEntry,
      comparison,
      adaptive[0]!,
      centralized[0]!,
      samples,
      traces,
      ledgers,
      evidence,
      expected,
    );
    orderedComparisons.push(comparison);
  }
  if (comparisons.size !== parsedBundle.cells.length)
    fail("comparison artifacts are not an exact closure of cells");
  if (
    !sameStrings(
      summary.comparisonArtifactIds,
      parsedBundle.cells.map((cell) => cell.comparisonArtifactId),
    )
  )
    fail("summary does not close over all comparisons");
  if (
    !sameJson(
      hooks.recomputeSummaryStatistics(summary, orderedComparisons),
      summary.statistics,
    )
  )
    fail("summary statistics are not independently recomputable");
  const anyFailure =
    manifest.entries.some((entry) => entry.status === "failure") ||
    [...samples.values()].some((sample) => sample.status === "failed");
  if ((summary.status === "passed") === anyFailure)
    fail("summary status does not reflect retained campaign failures");

  return Object.freeze({
    schemaVersion: 1,
    campaignId: parsedBundle.campaignId,
    registrationDigest: registration.registrationDigest,
    manifestDigest: manifest.manifestDigest,
    artifactCount: indexed.size,
    sampleCount: samples.size,
    comparisonCount: comparisons.size,
    status: summary.status,
  });
}

function validateBundle(value: JsonValue): CollectiveStatisticalCampaignBundleV1 {
  exact(value, [
    "schemaVersion",
    "campaignId",
    "sourceLockArtifactId",
    "registrationArtifactId",
    "manifestArtifactId",
    "cells",
    "expectedArtifacts",
    "artifacts",
    "summaryArtifactId",
    "bundleDigest",
  ], "bundle");
  const body = value as unknown as Record<string, unknown>;
  if (body.schemaVersion !== 1) fail("bundle schema is invalid");
  token(body.campaignId, "campaignId");
  for (const name of [
    "sourceLockArtifactId",
    "registrationArtifactId",
    "manifestArtifactId",
    "summaryArtifactId",
  ]) token(body[name], name);
  digestValue(body.bundleDigest, "bundleDigest");
  const cells = dense(body.cells, "cells", 1, 240).map(validateCell);
  unique(cells.map((cell) => cell.cellId), "cell ids");
  unique(cells.map((cell) => cell.comparisonArtifactId), "comparison ids");
  const expectedArtifacts = dense(
    body.expectedArtifacts,
    "expectedArtifacts",
    1,
    16_384,
  ).map(validateExpectedArtifact);
  unique(expectedArtifacts.map((item) => item.artifactId), "expected artifact ids");
  unique(
    expectedArtifacts.map((item) =>
      [item.kind, item.cellId, item.seed, item.runner, item.attempt].join("\u0000"),
    ),
    "expected artifact scopes",
  );
  const artifacts = dense(body.artifacts, "artifacts", 1, 16_384).map(
    validateIndexEntry,
  );
  unique(artifacts.map((item) => item.artifactId), "artifact ids");
  unique(artifacts.map((item) => item.path), "artifact paths");
  const totalBytes = artifacts.reduce((total, item) => total + item.byteLength, 0);
  if (totalBytes > COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_BUNDLE_BYTES_V1)
    fail("bundle byte limit is exceeded");
  const { bundleDigest: _digest, ...digestBody } = body;
  if (
    digestCollectiveStatisticalCampaignBundleV1(
      digestBody as unknown as Omit<CollectiveStatisticalCampaignBundleV1, "bundleDigest">,
    ) !== body.bundleDigest
  )
    fail("bundle digest is invalid");
  return body as unknown as CollectiveStatisticalCampaignBundleV1;
}

function validateCell(value: unknown): CollectiveStatisticalCampaignCellV1 {
  exact(value, ["schemaVersion", "cellId", "comparisonArtifactId"], "cell");
  const body = value as Record<string, unknown>;
  if (body.schemaVersion !== 1) fail("cell schema is invalid");
  token(body.cellId, "cellId");
  token(body.comparisonArtifactId, "comparisonArtifactId");
  return body as unknown as CollectiveStatisticalCampaignCellV1;
}

function validateExpectedArtifact(
  value: unknown,
): CollectiveStatisticalCampaignExpectedArtifactV1 {
  exact(value, [
    "schemaVersion",
    "artifactId",
    "kind",
    "cellId",
    "seed",
    "runner",
    "attempt",
  ], "expected artifact");
  const body = value as Record<string, unknown>;
  if (body.schemaVersion !== 1) fail("expected artifact schema is invalid");
  token(body.artifactId, "expected artifactId");
  kindValue(body.kind);
  nullableToken(body.cellId, "expected cellId");
  nullableInteger(body.seed, "expected seed");
  nullableRunner(body.runner);
  nullableAttempt(body.attempt);
  return body as unknown as CollectiveStatisticalCampaignExpectedArtifactV1;
}

function validateIndexEntry(
  value: unknown,
): CollectiveStatisticalCampaignArtifactIndexEntryV1 {
  exact(value, [
    "schemaVersion",
    "artifactId",
    "kind",
    "path",
    "byteLength",
    "sha256",
    "canonicalDigest",
  ], "artifact index entry");
  const body = value as Record<string, unknown>;
  if (body.schemaVersion !== 1) fail("index schema is invalid");
  token(body.artifactId, "artifactId");
  kindValue(body.kind);
  safePath(body.path);
  integer(body.byteLength, "byteLength", 0);
  if (
    (body.byteLength as number) >
    COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_ARTIFACT_BYTES_V1
  ) fail("artifact byte limit is exceeded");
  hex(body.sha256, "sha256");
  digestValue(body.canonicalDigest, "canonicalDigest");
  return body as unknown as CollectiveStatisticalCampaignArtifactIndexEntryV1;
}

function validateSourceLock(value: unknown): CollectiveStatisticalCampaignSourceLockV1 {
  exact(value, ["schemaVersion", "sourceCommit", "sourceTreeDigest", "dirtyWorktree"], "source lock");
  const body = value as Record<string, unknown>;
  if (
    body.schemaVersion !== 1 ||
    typeof body.sourceCommit !== "string" ||
    !/^[0-9a-f]{40}$/u.test(body.sourceCommit) ||
    body.dirtyWorktree !== false
  ) fail("source lock is invalid");
  digestValue(body.sourceTreeDigest, "sourceTreeDigest");
  return body as unknown as CollectiveStatisticalCampaignSourceLockV1;
}

function validateRegistration(value: unknown): CollectiveEvaluationCampaignRegistrationV1 {
  try {
    return validateCollectiveEvaluationCampaignRegistrationV1(value);
  } catch (error) {
    fail(`registration contract is invalid: ${errorMessage(error)}`);
  }
}

function validateManifest(
  value: unknown,
  registration: CollectiveEvaluationCampaignRegistrationV1,
): CollectiveEvaluationCampaignManifestV1 {
  try {
    return validateCollectiveEvaluationCampaignManifestV1(value, registration);
  } catch (error) {
    fail(`manifest contract is invalid: ${errorMessage(error)}`);
  }
}

function validateSample(value: unknown): CollectiveStatisticalCampaignSampleV1 {
  exact(value, [
    "schemaVersion", "cellId", "seed", "runner", "attempt", "status",
    "traceArtifactId", "ledgerArtifactId", "evidenceArtifactId", "outcome",
    "sampleDigest",
  ], "sample");
  const body = value as Record<string, unknown>;
  if (body.schemaVersion !== 1) fail("sample schema is invalid");
  token(body.cellId, "sample cellId");
  integer(body.seed, "sample seed", 0);
  runner(body.runner);
  attempt(body.attempt);
  if (body.status !== "passed" && body.status !== "failed")
    fail("sample status is invalid");
  token(body.traceArtifactId, "traceArtifactId");
  token(body.ledgerArtifactId, "ledgerArtifactId");
  token(body.evidenceArtifactId, "evidenceArtifactId");
  safeJson(body.outcome);
  digestValue(body.sampleDigest, "sampleDigest");
  const { sampleDigest: _digest, ...digestBody } = body;
  if (
    digestCollectiveStatisticalCampaignSampleV1(
      digestBody as unknown as Omit<CollectiveStatisticalCampaignSampleV1, "sampleDigest">,
    ) !== body.sampleDigest
  ) fail("sample digest is invalid");
  return body as unknown as CollectiveStatisticalCampaignSampleV1;
}

function validateTrace(value: unknown): CollectiveStatisticalCampaignTraceV1 {
  exact(value, ["schemaVersion", "sampleArtifactId", "records", "traceDigest"], "trace");
  const body = value as Record<string, unknown>;
  if (body.schemaVersion !== 1) fail("trace schema is invalid");
  token(body.sampleArtifactId, "trace sampleArtifactId");
  dense(body.records, "trace records", 0, 16_384).forEach(safeJson);
  digestValue(body.traceDigest, "traceDigest");
  const { traceDigest: _digest, ...digestBody } = body;
  if (digestCollectiveStatisticalCampaignTraceV1(digestBody as never) !== body.traceDigest)
    fail("trace digest is invalid");
  return body as unknown as CollectiveStatisticalCampaignTraceV1;
}

function validateLedger(value: unknown): CollectiveStatisticalCampaignLedgerV1 {
  exact(value, ["schemaVersion", "sampleArtifactId", "records", "ledgerDigest"], "ledger");
  const body = value as Record<string, unknown>;
  if (body.schemaVersion !== 1) fail("ledger schema is invalid");
  token(body.sampleArtifactId, "ledger sampleArtifactId");
  dense(body.records, "ledger records", 0, 16_384).forEach(safeJson);
  digestValue(body.ledgerDigest, "ledgerDigest");
  const { ledgerDigest: _digest, ...digestBody } = body;
  if (digestCollectiveStatisticalCampaignLedgerV1(digestBody as never) !== body.ledgerDigest)
    fail("ledger digest is invalid");
  return body as unknown as CollectiveStatisticalCampaignLedgerV1;
}

function validateEvidence(value: unknown): CollectiveStatisticalCampaignEvidenceV1 {
  exact(value, ["schemaVersion", "sampleArtifactId", "sampleDigest", "observations", "evidenceDigest"], "evidence");
  const body = value as Record<string, unknown>;
  if (body.schemaVersion !== 1) fail("evidence schema is invalid");
  token(body.sampleArtifactId, "evidence sampleArtifactId");
  digestValue(body.sampleDigest, "evidence sampleDigest");
  dense(body.observations, "evidence observations", 0, 16_384).forEach(safeJson);
  digestValue(body.evidenceDigest, "evidenceDigest");
  const { evidenceDigest: _digest, ...digestBody } = body;
  if (digestCollectiveStatisticalCampaignEvidenceV1(digestBody as never) !== body.evidenceDigest)
    fail("evidence digest is invalid");
  return body as unknown as CollectiveStatisticalCampaignEvidenceV1;
}

function validateComparison(value: unknown): CollectiveStatisticalCampaignComparisonV1 {
  exact(value, [
    "schemaVersion", "cellId", "adaptiveSampleArtifactIds",
    "centralizedSampleArtifactIds", "bootstrap", "statistics", "inputDigest",
    "comparisonDigest",
  ], "comparison");
  const body = value as Record<string, unknown>;
  if (body.schemaVersion !== 1) fail("comparison schema is invalid");
  token(body.cellId, "comparison cellId");
  const adaptive = strings(body.adaptiveSampleArtifactIds, "adaptive samples", 1);
  const centralized = strings(body.centralizedSampleArtifactIds, "centralized samples", 1);
  unique(adaptive, "adaptive samples");
  unique(centralized, "centralized samples");
  exact(body.bootstrap, ["schemaVersion", "seed", "resamples"], "bootstrap");
  const bootstrap = body.bootstrap as Record<string, unknown>;
  if (bootstrap.schemaVersion !== 1) fail("bootstrap schema is invalid");
  integer(bootstrap.seed, "bootstrap seed", 0);
  integer(bootstrap.resamples, "bootstrap resamples", 10_000);
  safeJson(body.statistics);
  digestValue(body.inputDigest, "inputDigest");
  digestValue(body.comparisonDigest, "comparisonDigest");
  const { comparisonDigest: _digest, ...digestBody } = body;
  if (digestCollectiveStatisticalCampaignComparisonV1(digestBody as never) !== body.comparisonDigest)
    fail("comparison digest is invalid");
  return body as unknown as CollectiveStatisticalCampaignComparisonV1;
}

function validateSummary(value: unknown): CollectiveStatisticalCampaignSummaryV1 {
  exact(value, ["schemaVersion", "comparisonArtifactIds", "status", "statistics", "summaryDigest"], "summary");
  const body = value as Record<string, unknown>;
  if (body.schemaVersion !== 1) fail("summary schema is invalid");
  const comparisons = strings(body.comparisonArtifactIds, "summary comparisons", 1);
  unique(comparisons, "summary comparisons");
  if (body.status !== "passed" && body.status !== "failed")
    fail("summary status is invalid");
  safeJson(body.statistics);
  digestValue(body.summaryDigest, "summaryDigest");
  const { summaryDigest: _digest, ...digestBody } = body;
  if (digestCollectiveStatisticalCampaignSummaryV1(digestBody as never) !== body.summaryDigest)
    fail("summary digest is invalid");
  return body as unknown as CollectiveStatisticalCampaignSummaryV1;
}

function assertRegistrationProvenance(
  registration: CollectiveEvaluationCampaignRegistrationV1,
  indexed: ReadonlyMap<string, CollectiveStatisticalCampaignArtifactIndexEntryV1>,
): void {
  const bindings = [
    ["source-lock", registration.sourceDigest],
    ["package-lock", registration.packageDigest],
    ["fixture", registration.fixtureManifestDigest],
    ["policy", registration.policyDigest],
    ["environment", registration.environmentDigest],
    ["observation-policy", registration.observationPolicyDigest],
    ["monitor", registration.monitorDigest],
    ["hidden-canary", registration.hiddenCanaryDigest],
  ] as const;
  for (const [kind, digest] of bindings) {
    const artifact = singleArtifactOfKind(indexed, kind);
    if (artifact.canonicalDigest !== digest)
      fail(`registration provenance does not bind ${kind}`);
  }
  singleArtifactOfKind(indexed, "registration");
  singleArtifactOfKind(indexed, "manifest");
  singleArtifactOfKind(indexed, "summary");
}

function assertArtifactReferenceClosure(
  samples: ReadonlyMap<string, CollectiveStatisticalCampaignSampleV1>,
  traces: ReadonlyMap<string, CollectiveStatisticalCampaignTraceV1>,
  ledgers: ReadonlyMap<string, CollectiveStatisticalCampaignLedgerV1>,
  evidence: ReadonlyMap<string, CollectiveStatisticalCampaignEvidenceV1>,
): void {
  const closures = [
    [new Set([...samples.values()].map((item) => item.traceArtifactId)), traces, "trace"],
    [new Set([...samples.values()].map((item) => item.ledgerArtifactId)), ledgers, "ledger"],
    [new Set([...samples.values()].map((item) => item.evidenceArtifactId)), evidence, "evidence"],
  ] as const;
  for (const [references, artifacts, label] of closures) {
    if (
      references.size !== artifacts.size ||
      [...artifacts.keys()].some((id) => !references.has(id))
    ) fail(`${label} artifacts are not an exact closure of samples`);
  }
}

function assertExecutionArtifactBinding(
  sampleArtifactId: string,
  sample: CollectiveStatisticalCampaignSampleV1,
  sampleExpectation: CollectiveStatisticalCampaignExpectedArtifactV1,
  expected: ReadonlyMap<string, CollectiveStatisticalCampaignExpectedArtifactV1>,
  traces: ReadonlyMap<string, CollectiveStatisticalCampaignTraceV1>,
  ledgers: ReadonlyMap<string, CollectiveStatisticalCampaignLedgerV1>,
  evidence: ReadonlyMap<string, CollectiveStatisticalCampaignEvidenceV1>,
): void {
  const bindings = [
    [sample.traceArtifactId, "trace", traces.get(sample.traceArtifactId)],
    [sample.ledgerArtifactId, "ledger", ledgers.get(sample.ledgerArtifactId)],
    [sample.evidenceArtifactId, "evidence", evidence.get(sample.evidenceArtifactId)],
  ] as const;
  for (const [artifactId, kind, artifact] of bindings) {
    const expectation = expected.get(artifactId);
    if (!expectation || !sameExecutionScope(expectation, sampleExpectation, kind))
      fail(`sample ${kind} expectation is not bound: ${sampleArtifactId}`);
    if (!artifact || artifact.sampleArtifactId !== sampleArtifactId)
      fail(`sample ${kind} is not bound: ${sampleArtifactId}`);
  }
  const evidenceValue = evidence.get(sample.evidenceArtifactId)!;
  if (evidenceValue.sampleDigest !== sample.sampleDigest)
    fail(`sample evidence digest is not bound: ${sampleArtifactId}`);
}

function assertExactAttempts(
  registration: CollectiveEvaluationCampaignRegistrationV1,
  samples: ReadonlyMap<string, CollectiveStatisticalCampaignSampleV1>,
  traces: ReadonlyMap<string, CollectiveStatisticalCampaignTraceV1>,
  ledgers: ReadonlyMap<string, CollectiveStatisticalCampaignLedgerV1>,
  evidence: ReadonlyMap<string, CollectiveStatisticalCampaignEvidenceV1>,
  expected: ReadonlyMap<string, CollectiveStatisticalCampaignExpectedArtifactV1>,
): void {
  for (const cell of registration.cells) {
    for (const runnerValue of ["adaptive_collective", "centralized_planner"] as const) {
      const firstExpectation = findSampleExpectation(
        expected, cell.cellId, cell.seed, runnerValue, "first",
      );
      const replayExpectation = findSampleExpectation(
        expected, cell.cellId, cell.seed, runnerValue, "replay",
      );
      if (!firstExpectation || !replayExpectation)
        fail(`expected replay pair is absent: ${cell.cellId}/${runnerValue}`);
      const first = samples.get(firstExpectation.artifactId);
      const replay = samples.get(replayExpectation.artifactId);
      if (!first || !replay || first.sampleDigest !== replay.sampleDigest)
        fail(`sample replay diverged: ${cell.cellId}/${runnerValue}`);
      if (
        !sameJson(
          traces.get(first.traceArtifactId)!.records,
          traces.get(replay.traceArtifactId)!.records,
        ) ||
        !sameJson(
          ledgers.get(first.ledgerArtifactId)!.records,
          ledgers.get(replay.ledgerArtifactId)!.records,
        ) ||
        !sameJson(
          evidence.get(first.evidenceArtifactId)!.observations,
          evidence.get(replay.evidenceArtifactId)!.observations,
        )
      ) fail(`replay artifacts diverged: ${cell.cellId}/${runnerValue}`);
    }
  }
}

function assertManifestEntry(
  entry: CollectiveEvaluationCampaignManifestEntryV1,
  comparison: CollectiveStatisticalCampaignComparisonV1,
  adaptive: CollectiveStatisticalCampaignSampleV1,
  centralized: CollectiveStatisticalCampaignSampleV1,
  samples: ReadonlyMap<string, CollectiveStatisticalCampaignSampleV1>,
  traces: ReadonlyMap<string, CollectiveStatisticalCampaignTraceV1>,
  ledgers: ReadonlyMap<string, CollectiveStatisticalCampaignLedgerV1>,
  evidence: ReadonlyMap<string, CollectiveStatisticalCampaignEvidenceV1>,
  expected: ReadonlyMap<string, CollectiveStatisticalCampaignExpectedArtifactV1>,
): void {
  const executions = [...expected.values()]
    .filter((item) => item.kind === "sample" && item.cellId === entry.cellId)
    .map((item) => samples.get(item.artifactId)!);
  if (entry.status === "failure") {
    if (!executions.some((sample) => sample.status === "failed"))
      fail(`failed manifest entry omits a failed execution: ${entry.cellId}`);
    return;
  }
  if (executions.some((sample) => sample.status !== "passed"))
    fail(`successful manifest entry contains a failed execution: ${entry.cellId}`);
  const expectedBindings = {
    adaptiveResultDigest: adaptive.sampleDigest,
    centralizedResultDigest: centralized.sampleDigest,
    adaptiveTraceDigest: traces.get(adaptive.traceArtifactId)!.traceDigest,
    centralizedTraceDigest: traces.get(centralized.traceArtifactId)!.traceDigest,
    adaptiveLedgerDigest: ledgers.get(adaptive.ledgerArtifactId)!.ledgerDigest,
    centralizedLedgerDigest: ledgers.get(centralized.ledgerArtifactId)!.ledgerDigest,
    fairnessDigest: comparison.comparisonDigest,
    adaptiveCampaignEvidenceDigest: evidence.get(adaptive.evidenceArtifactId)!.evidenceDigest,
    centralizedCampaignEvidenceDigest: evidence.get(centralized.evidenceArtifactId)!.evidenceDigest,
  } as const;
  for (const [name, digest] of Object.entries(expectedBindings)) {
    if (entry[name as keyof typeof expectedBindings] !== digest)
      fail(`manifest ${name} does not bind cell: ${entry.cellId}`);
  }
}

function sampleFor(
  id: string,
  samples: ReadonlyMap<string, CollectiveStatisticalCampaignSampleV1>,
  seed: number,
  cellId: string,
  runnerValue: CollectiveStatisticalCampaignRunnerV1,
): CollectiveStatisticalCampaignSampleV1 {
  const sample = samples.get(id);
  if (
    !sample ||
    sample.cellId !== cellId ||
    sample.seed !== seed ||
    sample.runner !== runnerValue ||
    sample.attempt !== "first"
  ) fail(`comparison sample is invalid: ${id}`);
  return sample;
}

function snapshotByteMap(value: unknown): Readonly<Record<string, Uint8Array>> {
  const descriptors = dataRecordDescriptors(value, "artifact bytes");
  const result: Record<string, Uint8Array> = Object.create(null);
  let total = 0;
  for (const [id, descriptor] of descriptors) {
    token(id, "artifact bytes id");
    const raw = descriptor.value;
    let bytes: Uint8Array;
    if (typeof raw === "string") {
      if (raw.length > COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_ARTIFACT_BYTES_V1)
        fail(`artifact byte limit is exceeded: ${id}`);
      bytes = encoder.encode(raw);
    } else if (raw instanceof Uint8Array) {
      if (raw.byteLength > COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_ARTIFACT_BYTES_V1)
        fail(`artifact byte limit is exceeded: ${id}`);
      bytes = new Uint8Array(raw);
    } else {
      fail(`artifact bytes are invalid: ${id}`);
    }
    if (bytes.byteLength > COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_ARTIFACT_BYTES_V1)
      fail(`artifact byte limit is exceeded: ${id}`);
    total += bytes.byteLength;
    if (total > COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_BUNDLE_BYTES_V1)
      fail("bundle byte limit is exceeded");
    result[id] = bytes;
  }
  return Object.freeze(result);
}

function snapshotHooks(
  value: unknown,
): CollectiveStatisticalCampaignBundleVerificationHooksV1 {
  const descriptors = dataRecordDescriptors(value, "verification hooks");
  const permitted = new Set([
    "expectedSourceLock",
    "validateArtifact",
    "recomputeComparisonStatistics",
    "recomputeSummaryStatistics",
  ]);
  const fields = Object.fromEntries(
    descriptors.map(([name, descriptor]) => {
      if (!permitted.has(name)) fail(`hook is invalid: ${name}`);
      return [name, descriptor.value];
    }),
  ) as Record<string, unknown>;
  for (const name of [
    "recomputeComparisonStatistics",
    "recomputeSummaryStatistics",
  ]) if (typeof fields[name] !== "function") fail(`required hook is invalid: ${name}`);
  if (fields.validateArtifact !== undefined && typeof fields.validateArtifact !== "function")
    fail("hook is invalid: validateArtifact");
  exact(fields.expectedSourceLock, ["sourceCommit", "sourceTreeDigest"], "expected source lock");
  const source = fields.expectedSourceLock as Record<string, unknown>;
  if (typeof source.sourceCommit !== "string" || !/^[0-9a-f]{40}$/u.test(source.sourceCommit))
    fail("expected source commit is invalid");
  digestValue(source.sourceTreeDigest, "expected sourceTreeDigest");
  return Object.freeze({
    expectedSourceLock: Object.freeze({
      sourceCommit: source.sourceCommit,
      sourceTreeDigest: source.sourceTreeDigest as PlanningDigestV1,
    }),
    ...(fields.validateArtifact === undefined
      ? {}
      : { validateArtifact: fields.validateArtifact as CollectiveStatisticalCampaignBundleVerificationHooksV1["validateArtifact"] }),
    recomputeComparisonStatistics: fields.recomputeComparisonStatistics as CollectiveStatisticalCampaignBundleVerificationHooksV1["recomputeComparisonStatistics"],
    recomputeSummaryStatistics: fields.recomputeSummaryStatistics as CollectiveStatisticalCampaignBundleVerificationHooksV1["recomputeSummaryStatistics"],
  });
}

function snapshotJson(
  value: unknown,
  label: string,
  budget: { nodes: number; stringCodeUnits: number } = {
    nodes: 0,
    stringCodeUnits: 0,
  },
  depth = 0,
  active = new WeakSet<object>(),
): JsonValue {
  if (depth > MAXIMUM_SNAPSHOT_DEPTH) fail(`${label} exceeds snapshot depth`);
  budget.nodes += 1;
  if (budget.nodes > MAXIMUM_SNAPSHOT_NODES)
    fail(`${label} exceeds snapshot node limit`);
  if (
    value === null ||
    typeof value === "boolean"
  ) return value;
  if (typeof value === "string") {
    budget.stringCodeUnits += value.length;
    if (
      budget.stringCodeUnits >
      COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_BUNDLE_BYTES_V1
    ) fail(`${label} exceeds snapshot string limit`);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) fail(`${label} is not canonical JSON`);
    return value;
  }
  if (typeof value !== "object") fail(`${label} is not JSON data`);
  if (active.has(value)) fail(`${label} is cyclic`);
  active.add(value);
  try {
    if (Array.isArray(value)) {
      if (
        Object.getPrototypeOf(value) !== Array.prototype ||
        Object.getOwnPropertySymbols(value).length !== 0
      ) fail(`${label} array is invalid`);
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
      if (!lengthDescriptor || !("value" in lengthDescriptor)) fail(`${label} array length is invalid`);
      const length = lengthDescriptor.value as number;
      if (
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > MAXIMUM_SNAPSHOT_FIELDS
      ) fail(`${label} array exceeds snapshot item limit`);
      const names = Object.getOwnPropertyNames(value);
      if (names.length !== length + 1) fail(`${label} array has holes or properties`);
      const result: JsonValue[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
          fail(`${label} array has accessor or hole`);
        result.push(
          snapshotJson(
            descriptor.value,
            `${label}[${index}]`,
            budget,
            depth + 1,
            active,
          ),
        );
      }
      return Object.freeze(result) as unknown as JsonValue;
    }
    const descriptors = dataRecordDescriptors(value, label);
    const result: Record<string, JsonValue> = Object.create(null);
    for (const [name, descriptor] of descriptors)
      result[name] = snapshotJson(
        descriptor.value,
        `${label}.${name}`,
        budget,
        depth + 1,
        active,
      );
    return Object.freeze(result);
  } finally {
    active.delete(value);
  }
}

function dataRecordDescriptors(
  value: unknown,
  label: string,
  maximumFields = MAXIMUM_SNAPSHOT_FIELDS,
): readonly (readonly [string, PropertyDescriptor])[] {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) fail(`${label} must be a plain data object`);
  const names = Object.getOwnPropertyNames(value);
  if (names.length > maximumFields)
    fail(`${label} exceeds snapshot field limit`);
  return Object.freeze(
    names.map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
        fail(`${label} must not have accessors`);
      return Object.freeze([name, descriptor] as const);
    }),
  );
}

function parseJson(bytes: Uint8Array, artifactId: string): JsonValue {
  try {
    return snapshotJson(JSON.parse(decoder.decode(bytes)), `artifact ${artifactId}`);
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith("collective_statistical"))
      throw error;
    fail(`artifact is not valid UTF-8 JSON: ${artifactId}`);
  }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const result = await crypto.subtle.digest(
    "SHA-256",
    bytes as Uint8Array<ArrayBuffer>,
  );
  return [...new Uint8Array(result)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function digestArtifact(value: unknown): PlanningDigestV1 {
  const snapshot = snapshotJson(value, "artifact digest input");
  return digestPlanningJsonV1(
    "evaluation-campaign-artifact-v1",
    snapshot,
    ARTIFACT_JSON_LIMITS,
  );
}

function exact(value: unknown, keys: readonly string[], label: string): void {
  const descriptors = dataRecordDescriptors(value, label);
  const names = descriptors.map(([name]) => name).sort(compareAscii);
  const expected = [...keys].sort(compareAscii);
  if (
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index])
  ) fail(`${label} has an invalid shape`);
  if (descriptors.some(([, descriptor]) => descriptor.value === undefined))
    fail(`${label} has undefined property`);
}

function dense(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0 ||
    value.length < minimum ||
    value.length > maximum ||
    Object.getOwnPropertyNames(value).length !== value.length + 1
  ) fail(`${label} is invalid`);
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
      fail(`${label} has accessor or hole`);
    result.push(descriptor.value);
  }
  return result;
}

function safeJson(value: unknown): void {
  canonicalizePlanningJsonV1(value as PlanningJson, ARTIFACT_JSON_LIMITS);
}

function assertGlobalArtifact(
  artifactId: string,
  kind: CollectiveStatisticalCampaignArtifactKindV1,
  expected: ReadonlyMap<string, CollectiveStatisticalCampaignExpectedArtifactV1>,
): void {
  const value = expected.get(artifactId);
  if (!value || value.kind !== kind || !isGlobalScope(value))
    fail(`${kind} expectation is invalid`);
}

function assertExpectedArtifactScope(
  value: CollectiveStatisticalCampaignExpectedArtifactV1,
): void {
  const execution = ["sample", "trace", "ledger", "evidence"].includes(value.kind);
  const cellOnly = value.kind === "comparison";
  if (execution) {
    if (
      value.cellId === null ||
      value.seed === null ||
      value.runner === null ||
      value.attempt === null
    ) fail(`execution artifact expectation is incomplete: ${value.artifactId}`);
  } else if (cellOnly) {
    if (
      value.cellId === null ||
      value.seed !== null ||
      value.runner !== null ||
      value.attempt !== null
    ) fail(`cell artifact expectation is invalid: ${value.artifactId}`);
  } else if (!isGlobalScope(value)) {
    fail(`global artifact expectation is invalid: ${value.artifactId}`);
  }
}

function isGlobalScope(value: CollectiveStatisticalCampaignExpectedArtifactV1): boolean {
  return value.cellId === null && value.seed === null && value.runner === null && value.attempt === null;
}

function sameExecutionScope(
  value: CollectiveStatisticalCampaignExpectedArtifactV1,
  sample: CollectiveStatisticalCampaignExpectedArtifactV1,
  kind: "trace" | "ledger" | "evidence",
): boolean {
  return (
    value.kind === kind &&
    value.cellId === sample.cellId &&
    value.seed === sample.seed &&
    value.runner === sample.runner &&
    value.attempt === sample.attempt
  );
}

function findSampleExpectation(
  expected: ReadonlyMap<string, CollectiveStatisticalCampaignExpectedArtifactV1>,
  cellId: string,
  seed: number,
  runnerValue: CollectiveStatisticalCampaignRunnerV1,
  attemptValue: CollectiveStatisticalCampaignAttemptV1,
): CollectiveStatisticalCampaignExpectedArtifactV1 | undefined {
  return [...expected.values()].find(
    (item) =>
      item.kind === "sample" &&
      item.cellId === cellId &&
      item.seed === seed &&
      item.runner === runnerValue &&
      item.attempt === attemptValue,
  );
}

function singleArtifactOfKind(
  indexed: ReadonlyMap<string, CollectiveStatisticalCampaignArtifactIndexEntryV1>,
  kind: CollectiveStatisticalCampaignArtifactKindV1,
): CollectiveStatisticalCampaignArtifactIndexEntryV1 {
  const values = [...indexed.values()].filter((value) => value.kind === kind);
  if (values.length !== 1) fail(`bundle must contain exactly one ${kind} artifact`);
  return values[0]!;
}

function token(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)
  ) fail(`${label} is invalid`);
}
function nullableToken(value: unknown, label: string): void {
  if (value !== null) token(value, label);
}
function integer(value: unknown, label: string, minimum: number): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    fail(`${label} is invalid`);
}
function nullableInteger(value: unknown, label: string): void {
  if (value !== null) integer(value, label, 0);
}
function strings(value: unknown, label: string, minimum: number): string[] {
  return dense(value, label, minimum, 256).map((item) => {
    token(item, label);
    return item;
  });
}
function runner(value: unknown): asserts value is CollectiveStatisticalCampaignRunnerV1 {
  if (value !== "adaptive_collective" && value !== "centralized_planner")
    fail("runner is invalid");
}
function nullableRunner(value: unknown): void {
  if (value !== null) runner(value);
}
function attempt(value: unknown): asserts value is CollectiveStatisticalCampaignAttemptV1 {
  if (value !== "first" && value !== "replay") fail("attempt is invalid");
}
function nullableAttempt(value: unknown): void {
  if (value !== null) attempt(value);
}
function kindValue(value: unknown): asserts value is CollectiveStatisticalCampaignArtifactKindV1 {
  if (
    typeof value !== "string" ||
    !artifactKinds.has(value as CollectiveStatisticalCampaignArtifactKindV1)
  ) fail("artifact kind is invalid");
}
function digestValue(value: unknown, label: string): asserts value is PlanningDigestV1 {
  if (typeof value !== "string" || !digestPattern.test(value))
    fail(`${label} is invalid`);
}
function hex(value: unknown, label: string): void {
  if (typeof value !== "string" || !hexPattern.test(value)) fail(`${label} is invalid`);
}
function safePath(value: unknown): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").some((part) => part === "" || part === "." || part === "..")
  ) fail("artifact path is not a safe relative path");
}
function unique<T>(values: readonly T[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label} are not unique`);
}
function sameStrings(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}
function sameJson(left: unknown, right: unknown): boolean {
  return (
    canonicalizePlanningJsonV1(left as PlanningJson, ARTIFACT_JSON_LIMITS) ===
    canonicalizePlanningJsonV1(right as PlanningJson, ARTIFACT_JSON_LIMITS)
  );
}
function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
function fail(message: string): never {
  throw new TypeError(`collective_statistical_campaign_bundle_invalid: ${message}`);
}
