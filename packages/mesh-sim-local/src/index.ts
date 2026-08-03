import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  link,
  mkdir,
  open,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type {
  CollectiveStatisticalCampaignExecutionArtifactsV1,
  CollectiveStatisticalCampaignExecutionStoreV1,
} from "@agentplat/mesh-sim";

export const COLLECTIVE_STATISTICAL_CAMPAIGN_LOCAL_STORE_SCHEMA_VERSION_V1 =
  1 as const;
export const DEFAULT_COLLECTIVE_STATISTICAL_CAMPAIGN_LOCAL_STORE_LIMITS_V1 =
  Object.freeze({
    maximumArtifactBytes: 16 * 1024 * 1024,
    maximumFiles: 16_384,
    maximumArtifactsPerSlot: 16,
    maximumReadKeys: 4_096,
  });

export interface CollectiveStatisticalCampaignLocalStoreLimitsV1 {
  readonly maximumArtifactBytes: number;
  readonly maximumFiles: number;
  readonly maximumArtifactsPerSlot: number;
  readonly maximumReadKeys: number;
}

export interface OpenCollectiveStatisticalCampaignLocalStoreV1 {
  /** Absolute local directory owned by this adapter. */
  readonly root: string;
  readonly limits?: Partial<CollectiveStatisticalCampaignLocalStoreLimitsV1>;
}

export interface CollectiveStatisticalCampaignStoredArtifactV1 {
  readonly sha256: string;
  readonly byteLength: number;
  readonly duplicate: boolean;
}

export interface CollectiveStatisticalCampaignSlotCommitV1 {
  readonly schemaVersion: 1;
  readonly runKey: string;
  readonly artifactSha256: readonly string[];
}

export interface CommitCollectiveStatisticalCampaignSlotV1 {
  readonly runKey: string;
  readonly artifactSha256: readonly string[];
}

export interface CollectiveStatisticalCampaignSlotCommitResultV1 {
  readonly status: "committed" | "duplicate";
  readonly commit: CollectiveStatisticalCampaignSlotCommitV1;
}

export interface CollectiveStatisticalCampaignReadSlotV1 {
  readonly runKey: string;
  readonly commit: CollectiveStatisticalCampaignSlotCommitV1 | null;
}

export interface CollectiveStatisticalCampaignCampaignLockV1 {
  readonly campaignKey: string;
  readonly lockId: string;
  release(): Promise<void>;
}

export interface CollectiveStatisticalCampaignMutationLockInspectionV1 {
  readonly lockId: string | null;
}

export interface PublishCollectiveStatisticalCampaignBundleV1 {
  /** Logical bundle digest, normally the campaign bundle digest. */
  readonly bundleDigest: string;
  readonly bytes: Uint8Array | string;
}

export interface CollectiveStatisticalCampaignPublishedBundleV1 {
  readonly bundleDigest: string;
  readonly contentSha256: string;
  readonly byteLength: number;
  readonly duplicate: boolean;
}

export type CollectiveStatisticalCampaignBundleVerifierV1 = (
  bytes: Uint8Array,
  bundleDigest: string,
) => Promise<void> | void;

type CollectiveStatisticalCampaignExecutionStateV1 = NonNullable<
  Awaited<
    ReturnType<
      CollectiveStatisticalCampaignExecutionStoreV1["readExecutionStateV1"]
    >
  >
>;

export interface CollectiveStatisticalCampaignLocalStoreV1 {
  readonly root: string;
  putArtifactV1(
    bytes: Uint8Array | string,
  ): Promise<CollectiveStatisticalCampaignStoredArtifactV1>;
  readArtifactV1(sha256: string): Promise<Uint8Array>;
  commitSlotV1(
    input: CommitCollectiveStatisticalCampaignSlotV1,
  ): Promise<CollectiveStatisticalCampaignSlotCommitResultV1>;
  readSlotCommitsV1(
    runKeys: readonly string[],
  ): Promise<readonly CollectiveStatisticalCampaignReadSlotV1[]>;
  readExecutionStateV1(
    input: Readonly<{ executionId: string; registrationDigest: string }>,
  ): Promise<CollectiveStatisticalCampaignExecutionStateV1 | null>;
  compareAndSwapExecutionStateV1(
    input: Readonly<{
      executionId: string;
      expectedExecutionDigest: string | null;
      state: CollectiveStatisticalCampaignExecutionStateV1;
    }>,
  ): Promise<"committed" | "duplicate" | "conflict">;
  inspectMutationLockV1(): Promise<CollectiveStatisticalCampaignMutationLockInspectionV1>;
  /** Removes a stranded mutation lock only when its exact lockId is supplied. */
  recoverMutationLockV1(lockId: string): Promise<"recovered" | "missing">;
  acquireCampaignLockV1(
    campaignKey: string,
  ): Promise<CollectiveStatisticalCampaignCampaignLockV1>;
  publishBundleV1(
    input: PublishCollectiveStatisticalCampaignBundleV1,
  ): Promise<CollectiveStatisticalCampaignPublishedBundleV1>;
  readBundleV1(
    bundleDigest: string,
    verify: CollectiveStatisticalCampaignBundleVerifierV1,
  ): Promise<Uint8Array>;
  readCurrentBundleV1(
    verify: CollectiveStatisticalCampaignBundleVerifierV1,
  ): Promise<
    | (CollectiveStatisticalCampaignPublishedBundleV1 & {
        readonly bytes: Uint8Array;
      })
    | null
  >;
}

export class CollectiveStatisticalCampaignLocalStoreError extends Error {
  readonly name = "CollectiveStatisticalCampaignLocalStoreError";
}

/**
 * Adapts the local CAS/slot-commit store to the portable execution service.
 * One canonical execution record is published per runKey; an orphan content
 * blob is harmless until its immutable slot commit becomes visible.
 */
export function createLocalCollectiveStatisticalCampaignExecutionStoreV1(
  store: CollectiveStatisticalCampaignLocalStoreV1,
): CollectiveStatisticalCampaignExecutionStoreV1 {
  if (!store || typeof store !== "object")
    fail("local execution store is invalid");
  return Object.freeze({
    schemaVersion: 1 as const,
    readExecutionStateV1: (
      input: Readonly<{ executionId: string; registrationDigest: string }>,
    ) => store.readExecutionStateV1(input),
    compareAndSwapExecutionStateV1: (
      input: Readonly<{
        executionId: string;
        expectedExecutionDigest: string | null;
        state: CollectiveStatisticalCampaignExecutionStateV1;
      }>,
    ) => store.compareAndSwapExecutionStateV1(input),
    async readExecutionsV1(runKeys: readonly string[]) {
      const commits = await store.readSlotCommitsV1(runKeys);
      const result = [];
      for (const entry of commits) {
        if (entry.commit === null) {
          result.push(Object.freeze({ runKey: entry.runKey, execution: null }));
          continue;
        }
        if (entry.commit.artifactSha256.length !== 1)
          fail("execution slot commit must bind exactly one record");
        const bytes = await store.readArtifactV1(
          entry.commit.artifactSha256[0]!,
        );
        let execution: CollectiveStatisticalCampaignExecutionArtifactsV1;
        try {
          execution = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(bytes),
          );
        } catch {
          fail("execution slot record is not valid UTF-8 JSON");
        }
        result.push(Object.freeze({ runKey: entry.runKey, execution }));
      }
      return Object.freeze(result);
    },
    async commitExecutionV1(
      input: Readonly<{
        runKey: string;
        execution: CollectiveStatisticalCampaignExecutionArtifactsV1;
      }>,
    ) {
      exactObject(input, ["execution", "runKey"], "execution commit");
      assertToken(input.runKey, "runKey");
      const artifact = await store.putArtifactV1(
        JSON.stringify(input.execution),
      );
      const committed = await store.commitSlotV1({
        runKey: input.runKey,
        artifactSha256: [artifact.sha256],
      });
      return committed.status;
    },
  });
}

const digestPattern = /^[0-9a-f]{64}$/u;
const bundleDigestPattern = /^sha256:[0-9a-f]{64}$/u;
const tokenPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u;

/** Opens an explicit local store. Existing symlinks anywhere below root reject. */
export async function openCollectiveStatisticalCampaignLocalStoreV1(
  input: OpenCollectiveStatisticalCampaignLocalStoreV1,
): Promise<CollectiveStatisticalCampaignLocalStoreV1> {
  exactObject(input, ["root", "limits"], "open input", true);
  if (typeof input.root !== "string" || !path.isAbsolute(input.root))
    fail("root must be an absolute path");
  const root = path.resolve(input.root);
  const limits = normalizeLimits(input.limits);
  await ensureDirectory(root);
  for (const relative of [
    "content",
    "content/sha256",
    "slots",
    "states",
    "bundles",
    "locks",
    "tmp",
  ])
    await ensureDirectory(safeChild(root, relative));
  await assertStoreDirectories(root);
  return new LocalStore(root, limits);
}

class LocalStore implements CollectiveStatisticalCampaignLocalStoreV1 {
  readonly #mutationLockPath: string;
  readonly #limits: CollectiveStatisticalCampaignLocalStoreLimitsV1;
  constructor(
    readonly root: string,
    limits: CollectiveStatisticalCampaignLocalStoreLimitsV1,
  ) {
    this.#limits = limits;
    this.#mutationLockPath = safeChild(root, "locks/store-mutation.lock");
  }

  async putArtifactV1(
    input: Uint8Array | string,
  ): Promise<CollectiveStatisticalCampaignStoredArtifactV1> {
    await this.#assertStoreDirectories();
    const bytes = normalizeBytes(input, this.#limits.maximumArtifactBytes);
    const sha256 = digestBytes(bytes);
    return this.#withMutationLock(async () => {
      const destination = this.#contentPath(sha256);
      if (await exists(destination)) {
        const existing = await readRegularFile(
          destination,
          this.#limits.maximumArtifactBytes,
        );
        if (digestBytes(existing) !== sha256)
          fail("content-addressed artifact is corrupt");
        return Object.freeze({
          sha256,
          byteLength: existing.byteLength,
          duplicate: true,
        });
      }
      await this.#reserveFiles(1);
      await publishNoReplace(destination, bytes);
      return Object.freeze({
        sha256,
        byteLength: bytes.byteLength,
        duplicate: false,
      });
    });
  }

  async readArtifactV1(sha256: string): Promise<Uint8Array> {
    await this.#assertStoreDirectories();
    assertSha256(sha256, "artifact sha256");
    const bytes = await readRegularFile(
      this.#contentPath(sha256),
      this.#limits.maximumArtifactBytes,
    );
    if (digestBytes(bytes) !== sha256)
      fail("content-addressed artifact is corrupt");
    return bytes;
  }

  async commitSlotV1(
    input: CommitCollectiveStatisticalCampaignSlotV1,
  ): Promise<CollectiveStatisticalCampaignSlotCommitResultV1> {
    await this.#assertStoreDirectories();
    exactObject(input, ["runKey", "artifactSha256"], "slot commit");
    assertToken(input.runKey, "runKey");
    const artifactSha256 = normalizeDigests(
      input.artifactSha256,
      this.#limits.maximumArtifactsPerSlot,
    );
    for (const digest of artifactSha256) await this.readArtifactV1(digest);
    const commit = Object.freeze({
      schemaVersion: 1 as const,
      runKey: input.runKey,
      artifactSha256: Object.freeze([...artifactSha256]),
    });
    const bytes = encodeCanonical(commit);
    return this.#withMutationLock(async () => {
      const destination = this.#slotPath(input.runKey);
      if (await exists(destination)) {
        const existing = await readRegularFile(
          destination,
          this.#limits.maximumArtifactBytes,
        );
        const parsed = parseSlotCommit(
          existing,
          this.#limits.maximumArtifactsPerSlot,
        );
        if (!equalBytes(existing, encodeCanonical(parsed)))
          fail("slot commit is not canonical");
        if (!equalBytes(existing, bytes))
          fail("slot commit conflicts with existing runKey");
        return Object.freeze({ status: "duplicate" as const, commit: parsed });
      }
      await this.#reserveFiles(1);
      await publishNoReplace(destination, bytes);
      return Object.freeze({ status: "committed" as const, commit });
    });
  }

  async readSlotCommitsV1(
    runKeys: readonly string[],
  ): Promise<readonly CollectiveStatisticalCampaignReadSlotV1[]> {
    await this.#assertStoreDirectories();
    if (
      !Array.isArray(runKeys) ||
      runKeys.length > this.#limits.maximumReadKeys
    )
      fail("requested run keys exceed limit");
    const normalized = runKeys.map((key) => {
      assertToken(key, "runKey");
      return key;
    });
    if (new Set(normalized).size !== normalized.length)
      fail("requested run keys are duplicated");
    const result: CollectiveStatisticalCampaignReadSlotV1[] = [];
    for (const runKey of normalized) {
      const file = this.#slotPath(runKey);
      if (!(await exists(file))) {
        result.push(Object.freeze({ runKey, commit: null }));
        continue;
      }
      const raw = await readRegularFile(
        file,
        this.#limits.maximumArtifactBytes,
      );
      const commit = parseSlotCommit(raw, this.#limits.maximumArtifactsPerSlot);
      if (!equalBytes(raw, encodeCanonical(commit)))
        fail("slot commit is not canonical");
      if (commit.runKey !== runKey)
        fail("slot file does not bind requested runKey");
      for (const digest of commit.artifactSha256)
        await this.readArtifactV1(digest);
      result.push(Object.freeze({ runKey, commit }));
    }
    return Object.freeze(result);
  }

  async readExecutionStateV1(
    input: Readonly<{
      executionId: string;
      registrationDigest: string;
    }>,
  ): Promise<CollectiveStatisticalCampaignExecutionStateV1 | null> {
    exactObject(
      input,
      ["executionId", "registrationDigest"],
      "execution state read",
    );
    assertToken(input.executionId, "executionId");
    assertBundleDigest(input.registrationDigest);
    await this.#assertStoreDirectories();
    const file = this.#statePath(input.executionId);
    if (!(await exists(file))) return null;
    const bytes = await readRegularFile(
      file,
      this.#limits.maximumArtifactBytes,
    );
    const state = parseExecutionState(bytes);
    if (!equalBytes(bytes, encodeCanonical(state)))
      fail("execution state is not canonical");
    if (
      state.executionId !== input.executionId ||
      state.registrationDigest !== input.registrationDigest
    )
      fail("execution state does not bind requested identity");
    return state;
  }

  async compareAndSwapExecutionStateV1(
    input: Readonly<{
      executionId: string;
      expectedExecutionDigest: string | null;
      state: CollectiveStatisticalCampaignExecutionStateV1;
    }>,
  ): Promise<"committed" | "duplicate" | "conflict"> {
    exactObject(
      input,
      ["executionId", "expectedExecutionDigest", "state"],
      "execution state compare-and-swap",
    );
    assertToken(input.executionId, "executionId");
    if (input.expectedExecutionDigest !== null)
      assertBundleDigest(input.expectedExecutionDigest);
    const state = assertExecutionState(input.state, input.executionId);
    const bytes = encodeCanonical(state);
    if (bytes.byteLength > this.#limits.maximumArtifactBytes)
      fail("execution state exceeds artifact byte limit");
    return this.#withMutationLock(async () => {
      const destination = this.#statePath(input.executionId);
      if (!(await exists(destination))) {
        if (input.expectedExecutionDigest !== null) return "conflict";
        await this.#reserveFiles(1);
        await replaceAtomically(this.root, destination, bytes, "state");
        return "committed";
      }
      const currentBytes = await readRegularFile(
        destination,
        this.#limits.maximumArtifactBytes,
      );
      const current = parseExecutionState(currentBytes);
      if (!equalBytes(currentBytes, encodeCanonical(current)))
        fail("execution state is not canonical");
      if (current.executionId !== input.executionId)
        fail("execution state does not bind requested identity");
      if (current.executionDigest !== input.expectedExecutionDigest)
        return "conflict";
      if (equalBytes(currentBytes, bytes)) return "duplicate";
      await replaceAtomically(this.root, destination, bytes, "state");
      return "committed";
    });
  }

  async inspectMutationLockV1(): Promise<CollectiveStatisticalCampaignMutationLockInspectionV1> {
    await this.#assertStoreDirectories();
    if (!(await exists(this.#mutationLockPath)))
      return Object.freeze({ lockId: null });
    const lock = parseMutationLock(
      await readRegularFile(
        this.#mutationLockPath,
        this.#limits.maximumArtifactBytes,
      ),
    );
    return Object.freeze({ lockId: lock.lockId });
  }

  async recoverMutationLockV1(
    lockId: string,
  ): Promise<"recovered" | "missing"> {
    assertLockId(lockId);
    await this.#assertStoreDirectories();
    if (!(await exists(this.#mutationLockPath))) return "missing";
    const bytes = await readRegularFile(
      this.#mutationLockPath,
      this.#limits.maximumArtifactBytes,
    );
    const lock = parseMutationLock(bytes);
    if (!equalBytes(bytes, encodeCanonical(lock)) || lock.lockId !== lockId)
      fail("store mutation lock ownership changed");
    await rm(this.#mutationLockPath, { force: false });
    await syncDirectory(path.dirname(this.#mutationLockPath));
    return "recovered";
  }

  async acquireCampaignLockV1(
    campaignKey: string,
  ): Promise<CollectiveStatisticalCampaignCampaignLockV1> {
    await this.#assertStoreDirectories();
    assertToken(campaignKey, "campaignKey");
    const lockId = randomUUID();
    const destination = safeChild(
      this.root,
      `locks/campaign-${digestText(campaignKey)}.lock`,
    );
    try {
      await publishNoReplace(
        destination,
        encodeCanonical({ schemaVersion: 1, campaignKey, lockId }),
      );
    } catch (error) {
      if (isExists(error))
        fail(
          "campaign lock is already held; locks are never broken automatically",
        );
      throw error;
    }
    let released = false;
    return Object.freeze({
      campaignKey,
      lockId,
      release: async () => {
        if (released) return;
        await this.#assertStoreDirectories();
        const bytes = await readRegularFile(
          destination,
          this.#limits.maximumArtifactBytes,
        );
        const value = parseObject(bytes, "campaign lock");
        if (value.campaignKey !== campaignKey || value.lockId !== lockId)
          fail("campaign lock ownership changed");
        await rm(destination, { force: false });
        await syncDirectory(path.dirname(destination));
        released = true;
      },
    });
  }

  async publishBundleV1(
    input: PublishCollectiveStatisticalCampaignBundleV1,
  ): Promise<CollectiveStatisticalCampaignPublishedBundleV1> {
    await this.#assertStoreDirectories();
    exactObject(input, ["bundleDigest", "bytes"], "bundle publication");
    assertBundleDigest(input.bundleDigest);
    const artifact = await this.putArtifactV1(input.bytes);
    const publication = Object.freeze({
      schemaVersion: 1,
      bundleDigest: input.bundleDigest,
      contentSha256: artifact.sha256,
      byteLength: artifact.byteLength,
    });
    const bytes = encodeCanonical(publication);
    return this.#withMutationLock(async () => {
      const destination = this.#bundlePath(input.bundleDigest);
      const currentAbsent = !(await exists(
        safeChild(this.root, "bundles/CURRENT"),
      ));
      let duplicate = false;
      if (await exists(destination)) {
        const existing = await readRegularFile(
          destination,
          this.#limits.maximumArtifactBytes,
        );
        if (!equalBytes(existing, bytes))
          fail("bundle digest conflicts with existing publication");
        duplicate = true;
        if (currentAbsent) await this.#reserveFiles(1);
      } else {
        await this.#reserveFiles(currentAbsent ? 2 : 1);
        await publishNoReplace(destination, bytes);
      }
      await this.#writeCurrent(publication);
      return Object.freeze({
        bundleDigest: input.bundleDigest,
        contentSha256: artifact.sha256,
        byteLength: artifact.byteLength,
        duplicate,
      });
    });
  }

  async readBundleV1(
    bundleDigest: string,
    verify: CollectiveStatisticalCampaignBundleVerifierV1,
  ): Promise<Uint8Array> {
    await this.#assertStoreDirectories();
    assertBundleDigest(bundleDigest);
    assertVerifier(verify);
    const publication = await this.#readPublication(bundleDigest);
    const bytes = await this.readArtifactV1(publication.contentSha256);
    if (bytes.byteLength !== publication.byteLength)
      fail("bundle publication byteLength does not match content");
    await verify(new Uint8Array(bytes), publication.bundleDigest);
    return bytes;
  }

  async readCurrentBundleV1(
    verify: CollectiveStatisticalCampaignBundleVerifierV1,
  ): Promise<
    | (CollectiveStatisticalCampaignPublishedBundleV1 & {
        readonly bytes: Uint8Array;
      })
    | null
  > {
    await this.#assertStoreDirectories();
    assertVerifier(verify);
    const current = safeChild(this.root, "bundles/CURRENT");
    if (!(await exists(current))) return null;
    const pointerBytes = await readRegularFile(
      current,
      this.#limits.maximumArtifactBytes,
    );
    const pointer = parsePublication(pointerBytes);
    if (!equalBytes(pointerBytes, encodeCanonical(pointer)))
      fail("CURRENT is not canonical");
    const published = await this.#readPublication(pointer.bundleDigest);
    if (!samePublication(pointer, published))
      fail("CURRENT does not match immutable bundle publication");
    const bytes = await this.readArtifactV1(published.contentSha256);
    if (bytes.byteLength !== published.byteLength)
      fail("bundle publication byteLength does not match content");
    await verify(new Uint8Array(bytes), published.bundleDigest);
    return Object.freeze({ ...published, duplicate: true, bytes });
  }

  #contentPath(sha256: string): string {
    return safeChild(this.root, `content/sha256/${sha256}`);
  }
  #slotPath(runKey: string): string {
    return safeChild(this.root, `slots/${digestText(runKey)}.json`);
  }
  #statePath(executionId: string): string {
    return safeChild(this.root, `states/${digestText(executionId)}.json`);
  }
  #bundlePath(bundleDigest: string): string {
    return safeChild(this.root, `bundles/${digestText(bundleDigest)}.json`);
  }

  async #readPublication(bundleDigest: string): Promise<BundlePublication> {
    const bytes = await readRegularFile(
      this.#bundlePath(bundleDigest),
      this.#limits.maximumArtifactBytes,
    );
    const value = parsePublication(bytes);
    if (!equalBytes(bytes, encodeCanonical(value)))
      fail("bundle publication is not canonical");
    if (value.bundleDigest !== bundleDigest)
      fail("bundle publication does not bind requested digest");
    return value;
  }

  async #writeCurrent(publication: BundlePublication): Promise<void> {
    await this.#assertStoreDirectories();
    const current = safeChild(this.root, "bundles/CURRENT");
    await replaceAtomically(
      this.root,
      current,
      encodeCanonical(publication),
      "current",
    );
  }

  async #reserveFiles(additional: number): Promise<void> {
    if (!Number.isSafeInteger(additional) || additional < 0)
      fail("store file reservation is invalid");
    const count = await countRegularFiles(this.root);
    if (count + additional > this.#limits.maximumFiles)
      fail("store file limit is exceeded");
  }

  async #assertStoreDirectories(): Promise<void> {
    await assertStoreDirectories(this.root);
  }

  async #withMutationLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.#assertStoreDirectories();
    const lockId = randomUUID();
    const lockBytes = encodeCanonical({ schemaVersion: 1, lockId });
    try {
      await publishNoReplace(this.#mutationLockPath, lockBytes);
    } catch (error) {
      if (isExists(error)) fail("local store is busy");
      throw error;
    }
    try {
      await this.#assertStoreDirectories();
      return await operation();
    } finally {
      const current = await readRegularFile(
        this.#mutationLockPath,
        this.#limits.maximumArtifactBytes,
      );
      if (!equalBytes(current, lockBytes))
        fail("store mutation lock ownership changed");
      await rm(this.#mutationLockPath, { force: false });
      await syncDirectory(path.dirname(this.#mutationLockPath));
    }
  }
}

interface BundlePublication {
  readonly schemaVersion: 1;
  readonly bundleDigest: string;
  readonly contentSha256: string;
  readonly byteLength: number;
}

function assertExecutionState(
  value: unknown,
  executionId: string,
): CollectiveStatisticalCampaignExecutionStateV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    fail("execution state is invalid");
  const record = value as Record<string, unknown>;
  if (record.executionId !== executionId)
    fail("execution state executionId conflicts");
  assertBundleDigest(record.registrationDigest);
  assertBundleDigest(record.executionDigest);
  return value as CollectiveStatisticalCampaignExecutionStateV1;
}

function parseExecutionState(
  bytes: Uint8Array,
): CollectiveStatisticalCampaignExecutionStateV1 {
  const value = parseObject(bytes, "execution state");
  if (typeof value.executionId !== "string")
    fail("execution state executionId is invalid");
  return assertExecutionState(value, value.executionId);
}

function normalizeLimits(
  input: unknown,
): CollectiveStatisticalCampaignLocalStoreLimitsV1 {
  if (input === undefined)
    return DEFAULT_COLLECTIVE_STATISTICAL_CAMPAIGN_LOCAL_STORE_LIMITS_V1;
  exactObject(
    input,
    [
      "maximumArtifactBytes",
      "maximumFiles",
      "maximumArtifactsPerSlot",
      "maximumReadKeys",
    ],
    "limits",
    true,
  );
  const value = input as Record<string, unknown>;
  const result = {
    maximumArtifactBytes: limitOrDefault(
      value.maximumArtifactBytes,
      DEFAULT_COLLECTIVE_STATISTICAL_CAMPAIGN_LOCAL_STORE_LIMITS_V1.maximumArtifactBytes,
    ),
    maximumFiles: limitOrDefault(
      value.maximumFiles,
      DEFAULT_COLLECTIVE_STATISTICAL_CAMPAIGN_LOCAL_STORE_LIMITS_V1.maximumFiles,
    ),
    maximumArtifactsPerSlot: limitOrDefault(
      value.maximumArtifactsPerSlot,
      DEFAULT_COLLECTIVE_STATISTICAL_CAMPAIGN_LOCAL_STORE_LIMITS_V1.maximumArtifactsPerSlot,
    ),
    maximumReadKeys: limitOrDefault(
      value.maximumReadKeys,
      DEFAULT_COLLECTIVE_STATISTICAL_CAMPAIGN_LOCAL_STORE_LIMITS_V1.maximumReadKeys,
    ),
  };
  for (const [name, value] of Object.entries(result))
    if (!Number.isSafeInteger(value) || value < 1)
      fail(`limit is invalid: ${name}`);
  return Object.freeze(result);
}

function limitOrDefault(value: unknown, fallback: number): number {
  return value === undefined
    ? fallback
    : typeof value === "number"
      ? value
      : Number.NaN;
}

function normalizeBytes(
  input: Uint8Array | string,
  maximum: number,
): Uint8Array {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? new Uint8Array(input)
        : fail("artifact bytes are invalid");
  if (bytes.byteLength > maximum) fail("artifact byte limit is exceeded");
  return bytes;
}

function normalizeDigests(value: unknown, maximum: number): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximum)
    fail("slot artifact digests are invalid");
  const digests = value.map((item) => {
    assertSha256(item, "slot artifact sha256");
    return item;
  });
  if (new Set(digests).size !== digests.length)
    fail("slot artifact digests are duplicated");
  return Object.freeze(digests);
}

function parseSlotCommit(
  bytes: Uint8Array,
  maximumArtifacts: number,
): CollectiveStatisticalCampaignSlotCommitV1 {
  const value = parseObject(bytes, "slot commit");
  exactObject(
    value,
    ["schemaVersion", "runKey", "artifactSha256"],
    "slot commit",
  );
  if (value.schemaVersion !== 1) fail("slot commit schema is invalid");
  assertToken(value.runKey, "slot runKey");
  return Object.freeze({
    schemaVersion: 1,
    runKey: value.runKey as string,
    artifactSha256: normalizeDigests(value.artifactSha256, maximumArtifacts),
  });
}

interface MutationLock {
  readonly schemaVersion: 1;
  readonly lockId: string;
}
function parseMutationLock(bytes: Uint8Array): MutationLock {
  const value = parseObject(bytes, "store mutation lock");
  exactObject(value, ["schemaVersion", "lockId"], "store mutation lock");
  if (value.schemaVersion !== 1) fail("store mutation lock schema is invalid");
  assertLockId(value.lockId);
  return Object.freeze({ schemaVersion: 1, lockId: value.lockId });
}

function parsePublication(bytes: Uint8Array): BundlePublication {
  const value = parseObject(bytes, "bundle publication");
  exactObject(
    value,
    ["schemaVersion", "bundleDigest", "contentSha256", "byteLength"],
    "bundle publication",
  );
  if (
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.byteLength) ||
    (value.byteLength as number) < 0
  )
    fail("bundle publication is invalid");
  assertBundleDigest(value.bundleDigest);
  assertSha256(value.contentSha256, "bundle contentSha256");
  return Object.freeze({
    schemaVersion: 1,
    bundleDigest: value.bundleDigest as string,
    contentSha256: value.contentSha256 as string,
    byteLength: value.byteLength as number,
  });
}

function parseObject(
  bytes: Uint8Array,
  label: string,
): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail(`${label} is not valid UTF-8 JSON`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value))
    fail(`${label} is invalid`);
  return value as Record<string, unknown>;
}

function encodeCanonical(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonical(value));
}
function canonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value))
      fail("canonical number is invalid");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value !== "object") fail("canonical value is invalid");
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

async function ensureDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink())
    fail("store directory is invalid or symbolic link");
}

const fixedStoreDirectories = Object.freeze([
  "content",
  "content/sha256",
  "slots",
  "states",
  "bundles",
  "locks",
  "tmp",
]);

/** Checks every segment separately, so an intermediate symlink cannot escape root. */
async function assertStoreDirectories(root: string): Promise<void> {
  await assertDirectory(root);
  for (const relative of fixedStoreDirectories) {
    let current = root;
    for (const segment of relative.split("/")) {
      current = safeChild(current, segment);
      await assertDirectory(current);
    }
  }
}

async function assertDirectory(directory: string): Promise<void> {
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink())
    fail("store directory is invalid or symbolic link");
}

async function publishNoReplace(
  destination: string,
  bytes: Uint8Array,
): Promise<void> {
  await ensureDirectory(path.dirname(destination));
  const temporary = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${randomUUID()}.tmp`,
  );
  await writeSyncedTemp(temporary, bytes);
  try {
    await link(temporary, destination);
    await syncDirectory(path.dirname(destination));
  } finally {
    await rm(temporary, { force: true });
  }
}

async function replaceAtomically(
  root: string,
  destination: string,
  bytes: Uint8Array,
  label: string,
): Promise<void> {
  const temporary = safeChild(root, `tmp/${label}-${randomUUID()}`);
  await writeSyncedTemp(temporary, bytes);
  try {
    await rename(temporary, destination);
    await syncDirectory(path.dirname(destination));
  } finally {
    await rm(temporary, { force: true });
  }
}

async function writeSyncedTemp(file: string, bytes: Uint8Array): Promise<void> {
  const handle = await open(file, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function readRegularFile(
  file: string,
  maximum: number,
): Promise<Uint8Array> {
  const pathInfo = await lstat(file);
  if (!pathInfo.isFile() || pathInfo.isSymbolicLink())
    fail("stored file is invalid or symbolic link");
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
  const handle = await open(file, flags);
  try {
    const info = await handle.stat();
    if (
      !info.isFile() ||
      info.size > maximum ||
      info.ino !== pathInfo.ino ||
      info.dev !== pathInfo.dev
    )
      fail("stored file is invalid or exceeds limit");
    const bytes = new Uint8Array(await handle.readFile());
    if (bytes.byteLength !== info.size || bytes.byteLength > maximum)
      fail("stored file changed while reading");
    return bytes;
  } finally {
    await handle.close();
  }
}

async function countRegularFiles(root: string): Promise<number> {
  let count = 0;
  for (const directory of ["content/sha256", "slots", "states", "bundles"]) {
    const absolute = safeChild(root, directory);
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      const candidate = safeChild(absolute, entry.name);
      const info = await lstat(candidate);
      if (info.isSymbolicLink()) fail("store contains a symbolic link");
      if (info.isFile()) count += 1;
      else if (info.isDirectory() && directory === "content/sha256") {
        // Content files stay flat; nested directories are a malformed store.
        fail("store contains an unexpected nested directory");
      } else if (!info.isDirectory()) fail("store contains an invalid entry");
    }
  }
  return count;
}

async function syncDirectory(directory: string): Promise<void> {
  try {
    const handle = await open(directory, constants.O_RDONLY);
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code !== "EINVAL" &&
      (error as NodeJS.ErrnoException).code !== "EPERM"
    )
      throw error;
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
function safeChild(root: string, relative: string): string {
  const candidate = path.resolve(root, relative);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`))
    fail("derived store path escapes root");
  return candidate;
}
function digestBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function digestText(value: string): string {
  return digestBytes(new TextEncoder().encode(value));
}
function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index])
  );
}
function samePublication(
  left: BundlePublication,
  right: BundlePublication,
): boolean {
  return (
    left.bundleDigest === right.bundleDigest &&
    left.contentSha256 === right.contentSha256 &&
    left.byteLength === right.byteLength
  );
}
function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !digestPattern.test(value))
    fail(`${label} is invalid`);
}
function assertBundleDigest(value: unknown): asserts value is string {
  if (typeof value !== "string" || !bundleDigestPattern.test(value))
    fail("bundleDigest is invalid");
}
function assertToken(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !tokenPattern.test(value))
    fail(`${label} is invalid`);
}
function assertVerifier(
  value: unknown,
): asserts value is CollectiveStatisticalCampaignBundleVerifierV1 {
  if (typeof value !== "function") fail("bundle verifier is required");
}
function assertLockId(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  )
    fail("store mutation lockId is invalid");
}
function exactObject(
  value: unknown,
  keys: readonly string[],
  label: string,
  optional = false,
): void {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  )
    fail(`${label} must be a plain object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    optional
      ? actual.some((key) => !expected.includes(key))
      : actual.length !== expected.length ||
        actual.some((key, index) => key !== expected[index])
  )
    fail(`${label} has invalid keys`);
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
      fail(`${label} contains an accessor`);
  }
}
function isExists(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "EEXIST";
}
function fail(message: string): never {
  throw new CollectiveStatisticalCampaignLocalStoreError(
    `collective_statistical_campaign_local_store_invalid: ${message}`,
  );
}
