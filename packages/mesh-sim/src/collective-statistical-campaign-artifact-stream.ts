import type { PlanningJson } from "@agentplat/collective-planning";

import {
  COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_ARTIFACT_BYTES_V1,
  COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_BUNDLE_BYTES_V1,
  digestCollectiveStatisticalCampaignArtifactV1,
  type CollectiveStatisticalCampaignArtifactIndexEntryV1,
  type CollectiveStatisticalCampaignArtifactKindV1,
} from "./collective-statistical-campaign-bundle.js";

export const COLLECTIVE_STATISTICAL_CAMPAIGN_ARTIFACT_STREAM_SCHEMA_VERSION_V1 =
  1 as const;
const MAXIMUM_ARTIFACT_STREAM_CHUNKS_V1 = 65_536;

export interface CollectiveStatisticalCampaignArtifactReaderV1 {
  readonly schemaVersion: 1;
  /** Returns the complete logical artifact namespace visible to this reader. */
  listArtifactIdsV1(): Promise<readonly string[]>;
  /** Opens a fresh, ordered byte stream for one exact logical artifact. */
  openArtifactV1(artifactId: string): AsyncIterable<Uint8Array>;
}

export interface CollectiveStatisticalCampaignArtifactWriterV1 {
  readonly schemaVersion: 1;
  /**
   * Commits one immutable logical artifact. Same ID/same bytes is idempotent;
   * same ID/different bytes must reject as a conflict.
   */
  putArtifactV1(input: {
    readonly artifactId: string;
    readonly kind: CollectiveStatisticalCampaignArtifactKindV1;
    readonly bytes: AsyncIterable<Uint8Array>;
    readonly maximumBytes: number;
  }): Promise<CollectiveStatisticalCampaignArtifactIndexEntryV1>;
}

export interface CollectiveStatisticalCampaignArtifactStreamLimitsV1 {
  readonly maximumArtifacts: number;
  readonly maximumArtifactBytes: number;
  readonly maximumTotalBytes: number;
}

export const DEFAULT_COLLECTIVE_STATISTICAL_CAMPAIGN_ARTIFACT_STREAM_LIMITS_V1 =
  Object.freeze({
    maximumArtifacts: 16_384,
    maximumArtifactBytes:
      COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_ARTIFACT_BYTES_V1,
    maximumTotalBytes: COLLECTIVE_STATISTICAL_CAMPAIGN_MAXIMUM_BUNDLE_BYTES_V1,
  } satisfies CollectiveStatisticalCampaignArtifactStreamLimitsV1);

export interface CollectiveStatisticalCampaignArtifactStreamVisitV1 {
  readonly schemaVersion: 1;
  readonly index: CollectiveStatisticalCampaignArtifactIndexEntryV1;
  readonly value: PlanningJson;
}

export interface CollectiveStatisticalCampaignArtifactStreamVerificationV1 {
  readonly schemaVersion: 1;
  readonly artifactCount: number;
  readonly totalBytes: number;
  readonly orderedArtifactIds: readonly string[];
}

/**
 * Verifies an exact artifact closure one artifact at a time. Unlike the legacy
 * in-memory verifier, this function never retains the complete bundle body.
 * Callers may retain bounded, normalized projections from `visitArtifactV1`.
 */
export async function verifyCollectiveStatisticalCampaignArtifactStreamV1(input: {
  readonly schemaVersion: 1;
  readonly artifacts: readonly CollectiveStatisticalCampaignArtifactIndexEntryV1[];
  readonly reader: CollectiveStatisticalCampaignArtifactReaderV1;
  readonly limits?: Partial<CollectiveStatisticalCampaignArtifactStreamLimitsV1>;
  readonly visitArtifactV1?: (
    artifact: CollectiveStatisticalCampaignArtifactStreamVisitV1,
  ) => Promise<void> | void;
}): Promise<CollectiveStatisticalCampaignArtifactStreamVerificationV1> {
  if (!input || typeof input !== "object" || input.schemaVersion !== 1)
    fail("artifact stream input is invalid");
  const reader = input.reader;
  if (
    !reader ||
    typeof reader !== "object" ||
    reader.schemaVersion !== 1 ||
    typeof reader.listArtifactIdsV1 !== "function" ||
    typeof reader.openArtifactV1 !== "function"
  )
    fail("artifact stream reader is invalid");
  if (
    input.visitArtifactV1 !== undefined &&
    typeof input.visitArtifactV1 !== "function"
  )
    fail("artifact stream visitor is invalid");
  const limits = normalizeLimits(input.limits);
  const artifacts = snapshotDenseArray(
    input.artifacts,
    limits.maximumArtifacts,
    "artifact stream index",
  );

  const indexed = new Map<
    string,
    CollectiveStatisticalCampaignArtifactIndexEntryV1
  >();
  for (const entry of artifacts) {
    validateIndexEntry(entry, limits.maximumArtifactBytes);
    if (indexed.has(entry.artifactId))
      fail(`artifact stream index has duplicate id: ${entry.artifactId}`);
    indexed.set(entry.artifactId, entry);
  }
  const orderedArtifactIds = [...indexed.keys()].sort(compareAscii);
  const listedInput = await reader.listArtifactIdsV1();
  const listed = snapshotDenseArray(
    listedInput,
    limits.maximumArtifacts,
    "artifact stream reader index",
  );
  for (const artifactId of listed) assertArtifactId(artifactId);
  const listedSet = new Set(listed);
  if (
    listedSet.size !== listed.length ||
    listed.length !== orderedArtifactIds.length ||
    orderedArtifactIds.some((artifactId) => !listedSet.has(artifactId))
  )
    fail("artifact stream reader is not an exact index closure");

  let totalBytes = 0;
  for (const artifactId of orderedArtifactIds) {
    const entry = indexed.get(artifactId)!;
    const raw = await readBounded(
      reader.openArtifactV1(artifactId),
      entry.byteLength,
      limits.maximumArtifactBytes,
    );
    totalBytes += raw.byteLength;
    if (totalBytes > limits.maximumTotalBytes)
      fail("artifact stream exceeds total byte limit");
    if ((await sha256Hex(raw)) !== entry.sha256)
      fail(`artifact stream sha256 mismatch: ${artifactId}`);
    const value = parseJson(raw, artifactId);
    if (
      digestCollectiveStatisticalCampaignArtifactV1(entry.kind, value) !==
      entry.canonicalDigest
    )
      fail(`artifact stream canonical digest mismatch: ${artifactId}`);
    await input.visitArtifactV1?.(
      Object.freeze({ schemaVersion: 1 as const, index: entry, value }),
    );
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    artifactCount: orderedArtifactIds.length,
    totalBytes,
    orderedArtifactIds: Object.freeze(orderedArtifactIds),
  });
}

async function readBounded(
  stream: AsyncIterable<Uint8Array>,
  expectedBytes: number,
  maximumBytes: number,
): Promise<Uint8Array> {
  if (!stream || typeof stream[Symbol.asyncIterator] !== "function")
    fail("artifact byte stream is invalid");
  const result = new Uint8Array(expectedBytes);
  let byteLength = 0;
  let chunkCount = 0;
  for await (const chunk of stream) {
    chunkCount += 1;
    if (
      chunkCount > MAXIMUM_ARTIFACT_STREAM_CHUNKS_V1 ||
      !(chunk instanceof Uint8Array) ||
      chunk.byteLength === 0
    )
      fail("artifact stream chunk is invalid");
    const nextByteLength = byteLength + chunk.byteLength;
    if (nextByteLength > maximumBytes || nextByteLength > expectedBytes)
      fail("artifact stream exceeds declared byte length");
    result.set(chunk, byteLength);
    byteLength = nextByteLength;
  }
  if (byteLength !== expectedBytes)
    fail("artifact stream byte length does not match index");
  return result;
}

function parseJson(bytes: Uint8Array, artifactId: string): PlanningJson {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(`artifact stream is not valid UTF-8: ${artifactId}`);
  }
  try {
    return JSON.parse(text!) as PlanningJson;
  } catch {
    fail(`artifact stream is not valid JSON: ${artifactId}`);
  }
}

function snapshotDenseArray<T>(
  value: readonly T[],
  maximumItems: number,
  label: string,
): readonly T[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  )
    fail(`${label} is invalid`);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    !lengthDescriptor ||
    !("value" in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 ||
    lengthDescriptor.value > maximumItems
  )
    fail(`${label} is invalid`);
  const length = lengthDescriptor.value as number;
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== length + 1 || !names.includes("length"))
    fail(`${label} is invalid`);
  const result: T[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) fail(`${label} is invalid`);
    result.push(descriptor.value as T);
  }
  return Object.freeze(result);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) fail("artifact stream crypto is unavailable");
  // Copy into an ArrayBuffer-backed view. TypeScript deliberately rejects a
  // possibly SharedArrayBuffer-backed Uint8Array at the Web Crypto boundary.
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeLimits(
  input:
    Partial<CollectiveStatisticalCampaignArtifactStreamLimitsV1> | undefined,
): CollectiveStatisticalCampaignArtifactStreamLimitsV1 {
  if (input !== undefined && (!input || typeof input !== "object"))
    fail("artifact stream limits are invalid");
  const value = {
    ...DEFAULT_COLLECTIVE_STATISTICAL_CAMPAIGN_ARTIFACT_STREAM_LIMITS_V1,
    ...input,
  };
  for (const [name, maximum] of [
    [
      "maximumArtifacts",
      DEFAULT_COLLECTIVE_STATISTICAL_CAMPAIGN_ARTIFACT_STREAM_LIMITS_V1.maximumArtifacts,
    ],
    [
      "maximumArtifactBytes",
      DEFAULT_COLLECTIVE_STATISTICAL_CAMPAIGN_ARTIFACT_STREAM_LIMITS_V1.maximumArtifactBytes,
    ],
    [
      "maximumTotalBytes",
      DEFAULT_COLLECTIVE_STATISTICAL_CAMPAIGN_ARTIFACT_STREAM_LIMITS_V1.maximumTotalBytes,
    ],
  ] as const) {
    if (
      !Number.isSafeInteger(value[name]) ||
      value[name] < 1 ||
      value[name] > maximum
    )
      fail(`artifact stream ${name} is invalid`);
  }
  if (value.maximumArtifactBytes > value.maximumTotalBytes)
    fail("artifact stream artifact limit exceeds total limit");
  return Object.freeze(value);
}

function validateIndexEntry(
  value: CollectiveStatisticalCampaignArtifactIndexEntryV1,
  maximumArtifactBytes: number,
): void {
  if (!value || typeof value !== "object" || value.schemaVersion !== 1)
    fail("artifact stream index entry is invalid");
  assertArtifactId(value.artifactId);
  if (
    typeof value.kind !== "string" ||
    typeof value.path !== "string" ||
    value.path.length < 1 ||
    value.path.length > 512 ||
    value.path.startsWith("/") ||
    value.path.includes("\\") ||
    value.path
      .split("/")
      .some((segment) => segment === "" || segment === "." || segment === "..")
  )
    fail("artifact stream index path is invalid");
  if (
    !Number.isSafeInteger(value.byteLength) ||
    value.byteLength < 1 ||
    value.byteLength > maximumArtifactBytes
  )
    fail("artifact stream index byteLength is invalid");
  if (!/^[0-9a-f]{64}$/u.test(value.sha256))
    fail("artifact stream index sha256 is invalid");
  if (!/^sha256:[0-9a-f]{64}$/u.test(value.canonicalDigest))
    fail("artifact stream index canonical digest is invalid");
}

function assertArtifactId(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 256 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)
  )
    fail("artifact stream artifactId is invalid");
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message: string): never {
  throw new TypeError(
    `collective_statistical_campaign_${message.replaceAll(" ", "_")}`,
  );
}
