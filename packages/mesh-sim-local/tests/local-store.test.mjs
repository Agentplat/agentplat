import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createLocalCollectiveStatisticalCampaignArtifactReaderV1,
  createLocalCollectiveStatisticalCampaignArtifactWriterV1,
  createLocalCollectiveStatisticalCampaignDeadlineArtifactWriterV1,
  createLocalCollectiveStatisticalCampaignExecutionStoreV1,
  openCollectiveStatisticalCampaignLocalStoreV1,
} from "../dist/index.js";
import { verifyCollectiveStatisticalCampaignArtifactStreamV1 } from "@agentplat/mesh-sim";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const bundleDigest = (value) => `sha256:${sha256(value)}`;

async function withStore(run) {
  const root = await mkdtemp(join(tmpdir(), "agentplat-mesh-sim-local-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function* byteStream(value) {
  const bytes = new TextEncoder().encode(value);
  const split = Math.max(1, Math.floor(bytes.byteLength / 2));
  yield bytes.slice(0, split);
  yield bytes.slice(split);
}

async function writeLogicalArtifact(writer, artifactId, value) {
  return writer.putArtifactV1({
    artifactId,
    kind: "policy",
    bytes: byteStream(JSON.stringify(value)),
    maximumBytes: 1_024,
  });
}

test("adapts the local CAS into an exact, streaming logical artifact store", async () => {
  await withStore(async (root) => {
    const local = await openCollectiveStatisticalCampaignLocalStoreV1({ root });
    const writer =
      createLocalCollectiveStatisticalCampaignArtifactWriterV1(local);
    const beta = await writeLogicalArtifact(writer, "artifact:beta", {
      schemaVersion: 1,
      value: "beta",
    });
    const alpha = await writeLogicalArtifact(writer, "artifact:alpha", {
      schemaVersion: 1,
      value: "alpha",
    });

    const reader = createLocalCollectiveStatisticalCampaignArtifactReaderV1(
      local,
      [beta, alpha],
    );
    const visited = [];
    const result = await verifyCollectiveStatisticalCampaignArtifactStreamV1({
      schemaVersion: 1,
      artifacts: [beta, alpha],
      reader,
      visitArtifactV1(artifact) {
        visited.push([artifact.index.artifactId, artifact.value.value]);
      },
    });
    assert.deepEqual(result.orderedArtifactIds, [
      "artifact:alpha",
      "artifact:beta",
    ]);
    assert.deepEqual(visited, [
      ["artifact:alpha", "alpha"],
      ["artifact:beta", "beta"],
    ]);
    assert.equal(result.artifactCount, 2);
    assert.equal(result.totalBytes, alpha.byteLength + beta.byteLength);

    await assert.rejects(
      verifyCollectiveStatisticalCampaignArtifactStreamV1({
        schemaVersion: 1,
        artifacts: [alpha],
        reader,
      }),
      /exact_index_closure/i,
    );
  });
});

test("logical artifact writer is idempotent but rejects same ID with different bytes", async () => {
  await withStore(async (root) => {
    const writer = createLocalCollectiveStatisticalCampaignArtifactWriterV1(
      await openCollectiveStatisticalCampaignLocalStoreV1({ root }),
    );
    const first = await writeLogicalArtifact(writer, "artifact:immutable", {
      schemaVersion: 1,
      value: "same",
    });
    const duplicate = await writeLogicalArtifact(writer, "artifact:immutable", {
      schemaVersion: 1,
      value: "same",
    });
    assert.deepEqual(duplicate, first);
    await assert.rejects(
      writeLogicalArtifact(writer, "artifact:immutable", {
        schemaVersion: 1,
        value: "different",
      }),
      /conflicts/i,
    );
    await assert.rejects(
      writer.putArtifactV1({
        artifactId: "artifact:immutable",
        kind: "evidence",
        bytes: byteStream(JSON.stringify({ schemaVersion: 1, value: "same" })),
        maximumBytes: 1_024,
      }),
      /conflicts/i,
    );
    await assert.rejects(
      writer.putArtifactV1({
        artifactId: "artifact:empty-chunk",
        kind: "policy",
        bytes: (async function* () {
          yield new Uint8Array(0);
          yield new TextEncoder().encode('{"schemaVersion":1}');
        })(),
        maximumBytes: 1_024,
      }),
      /chunk is invalid/i,
    );
  });
});

test("deadline artifact writer never publishes an expired logical binding", async () => {
  await withStore(async (root) => {
    const local = await openCollectiveStatisticalCampaignLocalStoreV1({ root });
    let now = 99;
    const writer =
      createLocalCollectiveStatisticalCampaignDeadlineArtifactWriterV1(
        local,
        () => now,
      );
    const active = await writer.putArtifactBeforeDeadlineV1({
      artifactId: "artifact:before-deadline",
      kind: "policy",
      bytes: byteStream(JSON.stringify({ schemaVersion: 1, value: "active" })),
      maximumBytes: 1_024,
      operationExpiresAtMs: 100,
    });
    assert.equal(active.artifactId, "artifact:before-deadline");

    now = 100;
    await assert.rejects(
      writer.putArtifactBeforeDeadlineV1({
        artifactId: "artifact:at-deadline",
        kind: "policy",
        bytes: byteStream(
          JSON.stringify({ schemaVersion: 1, value: "expired" }),
        ),
        maximumBytes: 1_024,
        operationExpiresAtMs: 100,
      }),
      /deadline expired/i,
    );
  });
});

test("logical artifact reader rejects tampered bindings and stream limits", async () => {
  await withStore(async (root) => {
    const local = await openCollectiveStatisticalCampaignLocalStoreV1({ root });
    const writer =
      createLocalCollectiveStatisticalCampaignArtifactWriterV1(local);
    const target = await writeLogicalArtifact(writer, "artifact:target", {
      schemaVersion: 1,
      value: "target",
    });
    const replacement = await writeLogicalArtifact(
      writer,
      "artifact:replacement",
      {
        schemaVersion: 1,
        value: "replacement",
      },
    );
    const reader = createLocalCollectiveStatisticalCampaignArtifactReaderV1(
      local,
      [target],
    );

    await assert.rejects(
      verifyCollectiveStatisticalCampaignArtifactStreamV1({
        schemaVersion: 1,
        artifacts: [target],
        reader,
        limits: { maximumArtifactBytes: target.byteLength - 1 },
      }),
      /byteLength_is_invalid/i,
    );
    await assert.rejects(
      writer.putArtifactV1({
        artifactId: "artifact:too-large",
        kind: "policy",
        bytes: byteStream(JSON.stringify({ schemaVersion: 1, value: "large" })),
        maximumBytes: 1,
      }),
      /byte[_ ]limit/i,
    );
    const pathTamperedReader =
      createLocalCollectiveStatisticalCampaignArtifactReaderV1(local, [
        { ...target, path: "artifacts/sha256/forged.json" },
      ]);
    await assert.rejects(
      verifyCollectiveStatisticalCampaignArtifactStreamV1({
        schemaVersion: 1,
        artifacts: [{ ...target, path: "artifacts/sha256/forged.json" }],
        reader: pathTamperedReader,
      }),
      /logical[_ ]binding/i,
    );

    const runKey = `artifact-v1:${sha256("artifact:target")}`;
    await writeFile(
      join(root, "slots", `${sha256(runKey)}.json`),
      JSON.stringify({
        artifactSha256: [replacement.sha256],
        runKey,
        schemaVersion: 1,
      }),
    );
    await assert.rejects(
      verifyCollectiveStatisticalCampaignArtifactStreamV1({
        schemaVersion: 1,
        artifacts: [target],
        reader,
      }),
      /logical[_ ]binding/i,
    );
  });
});

test("stores immutable content and commits slots idempotently", async () => {
  await withStore(async (root) => {
    const store = await openCollectiveStatisticalCampaignLocalStoreV1({ root });
    const first = await store.putArtifactV1("outcome:42");
    assert.equal(first.duplicate, false);
    assert.equal((await store.putArtifactV1("outcome:42")).duplicate, true);
    assert.deepEqual(
      Buffer.from(await store.readArtifactV1(first.sha256)),
      Buffer.from("outcome:42"),
    );

    const commit = { runKey: "cell/1", artifactSha256: [first.sha256] };
    assert.equal((await store.commitSlotV1(commit)).status, "committed");
    assert.equal((await store.commitSlotV1(commit)).status, "duplicate");
    const other = await store.putArtifactV1("different");
    await assert.rejects(
      store.commitSlotV1({ runKey: "cell/1", artifactSha256: [other.sha256] }),
      /conflicts/i,
    );

    const reads = await store.readSlotCommitsV1(["missing", "cell/1"]);
    assert.deepEqual(
      reads.map((entry) => entry.commit?.runKey ?? null),
      [null, "cell/1"],
    );
  });
});

test("crash leftovers in tmp are ignored", async () => {
  await withStore(async (root) => {
    await openCollectiveStatisticalCampaignLocalStoreV1({ root });
    await writeFile(join(root, "tmp", "interrupted.tmp"), randomBytes(64));
    const store = await openCollectiveStatisticalCampaignLocalStoreV1({ root });
    assert.deepEqual(await store.readSlotCommitsV1(["interrupted"]), [
      { runKey: "interrupted", commit: null },
    ]);
    const artifact = await store.putArtifactV1("complete");
    assert.deepEqual(
      Buffer.from(await store.readArtifactV1(artifact.sha256)),
      Buffer.from("complete"),
    );
  });
});

test("rejects corrupt content, path violations, and symlink intrusion", async () => {
  await assert.rejects(
    openCollectiveStatisticalCampaignLocalStoreV1({ root: "relative-root" }),
    /absolute path/i,
  );
  await withStore(async (root) => {
    const store = await openCollectiveStatisticalCampaignLocalStoreV1({ root });
    const artifact = await store.putArtifactV1("verified");
    await writeFile(
      join(root, "content", "sha256", artifact.sha256),
      "tampered",
    );
    await assert.rejects(store.readArtifactV1(artifact.sha256), /corrupt/i);
  });
  await withStore(async (root) => {
    const store = await openCollectiveStatisticalCampaignLocalStoreV1({ root });
    const artifact = await store.putArtifactV1("verified");
    await symlink(
      join(root, "content", "sha256", artifact.sha256),
      join(root, "content", "sha256", "attacker-link"),
    );
    await assert.rejects(store.putArtifactV1("later"), /symbolic link/i);
  });
  await withStore(async (root) => {
    const outside = await mkdtemp(
      join(tmpdir(), "agentplat-mesh-sim-local-outside-"),
    );
    try {
      const store = await openCollectiveStatisticalCampaignLocalStoreV1({
        root,
      });
      await mkdir(join(outside, "sha256"));
      await rm(join(root, "content"), { recursive: true });
      await symlink(outside, join(root, "content"));
      await assert.rejects(
        store.putArtifactV1("must not escape"),
        /symbolic link/i,
      );
      assert.deepEqual(await readdir(join(outside, "sha256")), []);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

test("rejects a non-canonical or corrupted slot commit before it can be consumed", async () => {
  await withStore(async (root) => {
    const store = await openCollectiveStatisticalCampaignLocalStoreV1({ root });
    const artifact = await store.putArtifactV1("verified result");
    const runKey = "cell/corrupt";
    await store.commitSlotV1({ runKey, artifactSha256: [artifact.sha256] });
    await writeFile(
      join(root, "slots", `${sha256(runKey)}.json`),
      JSON.stringify({
        runKey,
        artifactSha256: [artifact.sha256],
        schemaVersion: 1,
      }),
    );
    await assert.rejects(store.readSlotCommitsV1([runKey]), /not canonical/i);
  });
});

test("campaign locks are explicit and are never broken by age", async () => {
  await withStore(async (root) => {
    const store = await openCollectiveStatisticalCampaignLocalStoreV1({ root });
    const lock = await store.acquireCampaignLockV1("campaign-a");
    await assert.rejects(
      store.acquireCampaignLockV1("campaign-a"),
      /already held/i,
    );
    await lock.release();
    const next = await store.acquireCampaignLockV1("campaign-a");
    await next.release();
  });
});

test("mutation lock recovery requires the exact persisted lockId", async () => {
  await withStore(async (root) => {
    const store = await openCollectiveStatisticalCampaignLocalStoreV1({ root });
    const lockId = "123e4567-e89b-42d3-a456-426614174000";
    await writeFile(
      join(root, "locks", "store-mutation.lock"),
      JSON.stringify({ lockId, schemaVersion: 1 }),
    );
    assert.deepEqual(await store.inspectMutationLockV1(), { lockId });
    await assert.rejects(
      store.putArtifactV1("blocked"),
      /local store is busy/i,
    );
    await assert.rejects(
      store.recoverMutationLockV1("123e4567-e89b-42d3-a456-426614174001"),
      /ownership changed/i,
    );
    assert.equal(await store.recoverMutationLockV1(lockId), "recovered");
    assert.deepEqual(await store.inspectMutationLockV1(), { lockId: null });
    assert.equal((await store.putArtifactV1("unblocked")).duplicate, false);
  });
});

test("publishes immutable bundles and makes CURRENT revalidable", async () => {
  await withStore(async (root) => {
    const store = await openCollectiveStatisticalCampaignLocalStoreV1({ root });
    const digest = bundleDigest("bundle-v1");
    assert.equal(
      (
        await store.publishBundleV1({
          bundleDigest: digest,
          bytes: "bundle bytes",
        })
      ).duplicate,
      false,
    );
    assert.equal(
      (
        await store.publishBundleV1({
          bundleDigest: digest,
          bytes: "bundle bytes",
        })
      ).duplicate,
      true,
    );
    const verify = (bytes) =>
      assert.deepEqual(Buffer.from(bytes), Buffer.from("bundle bytes"));
    assert.deepEqual(
      Buffer.from(await store.readBundleV1(digest, verify)),
      Buffer.from("bundle bytes"),
    );
    const current = await store.readCurrentBundleV1(verify);
    assert.equal(current?.bundleDigest, digest);

    await writeFile(
      join(root, "bundles", "CURRENT"),
      JSON.stringify({
        bundleDigest: digest,
        contentSha256: sha256("bad"),
        byteLength: 3,
        schemaVersion: 1,
      }),
    );
    await assert.rejects(
      store.readCurrentBundleV1(verify),
      /canonical|does not match/i,
    );
    assert.ok(
      (await readFile(join(root, "bundles", `${sha256(digest)}.json`)))
        .byteLength > 0,
    );
  });
});

test("enforces configured byte limits before writing", async () => {
  await withStore(async (root) => {
    const store = await openCollectiveStatisticalCampaignLocalStoreV1({
      root,
      limits: { maximumArtifactBytes: 4, maximumFiles: 100 },
    });
    await assert.rejects(store.putArtifactV1("five!"), /byte limit/i);
  });
});

test("reserves every durable bundle file and validates publication metadata", async () => {
  await withStore(async (root) => {
    const digest = bundleDigest("limited-bundle");
    const limited = await openCollectiveStatisticalCampaignLocalStoreV1({
      root,
      limits: { maximumArtifactBytes: 1_000, maximumFiles: 2 },
    });
    await assert.rejects(
      limited.publishBundleV1({ bundleDigest: digest, bytes: "x" }),
      /file limit/i,
    );
    assert.deepEqual(await readdir(join(root, "bundles")), []);

    const store = await openCollectiveStatisticalCampaignLocalStoreV1({
      root,
      limits: { maximumArtifactBytes: 1_000, maximumFiles: 3 },
    });
    const publication = await store.publishBundleV1({
      bundleDigest: digest,
      bytes: "x",
    });
    assert.deepEqual((await readdir(join(root, "bundles"))).sort().length, 2);
    await rm(join(root, "bundles", "CURRENT"));
    const constrained = await openCollectiveStatisticalCampaignLocalStoreV1({
      root,
      limits: { maximumArtifactBytes: 1_000, maximumFiles: 2 },
    });
    await assert.rejects(
      constrained.publishBundleV1({ bundleDigest: digest, bytes: "x" }),
      /file limit/i,
    );
    assert.equal(
      (await store.publishBundleV1({ bundleDigest: digest, bytes: "x" }))
        .duplicate,
      true,
    );
    await writeFile(
      join(root, "bundles", `${sha256(digest)}.json`),
      JSON.stringify({
        bundleDigest: digest,
        byteLength: 99,
        contentSha256: publication.contentSha256,
        schemaVersion: 1,
      }),
    );
    await assert.rejects(
      store.readBundleV1(digest, () => undefined),
      /byteLength/i,
    );
  });
});

test("enforces maximumArtifactsPerSlot when reading persisted slots", async () => {
  await withStore(async (root) => {
    const initial = await openCollectiveStatisticalCampaignLocalStoreV1({
      root,
    });
    const first = await initial.putArtifactV1("first");
    const second = await initial.putArtifactV1("second");
    await initial.commitSlotV1({
      runKey: "cell/limited",
      artifactSha256: [first.sha256, second.sha256],
    });
    const limited = await openCollectiveStatisticalCampaignLocalStoreV1({
      root,
      limits: { maximumArtifactsPerSlot: 1 },
    });
    await assert.rejects(
      limited.readSlotCommitsV1(["cell/limited"]),
      /slot artifact digests are invalid/i,
    );
  });
});

test("persists canonical execution state with compare-and-swap semantics", async () => {
  await withStore(async (root) => {
    const local = await openCollectiveStatisticalCampaignLocalStoreV1({ root });
    const store =
      createLocalCollectiveStatisticalCampaignExecutionStoreV1(local);
    const executionId = "execution/local-state";
    const registrationDigest = bundleDigest("registration");
    const firstDigest = bundleDigest("state-1");
    const first = {
      cells: [],
      executionDigest: firstDigest,
      executionId,
      manifest: null,
      registrationDigest,
      revision: 0,
      schemaVersion: 1,
      status: "running",
    };
    assert.equal(
      await store.compareAndSwapExecutionStateV1({
        executionId,
        expectedExecutionDigest: null,
        state: first,
      }),
      "committed",
    );
    assert.equal(
      await store.compareAndSwapExecutionStateV1({
        executionId,
        expectedExecutionDigest: firstDigest,
        state: first,
      }),
      "duplicate",
    );
    assert.equal(
      await store.compareAndSwapExecutionStateV1({
        executionId,
        expectedExecutionDigest: bundleDigest("wrong"),
        state: first,
      }),
      "conflict",
    );
    const next = {
      ...first,
      executionDigest: bundleDigest("state-2"),
      revision: 1,
    };
    assert.equal(
      await store.compareAndSwapExecutionStateV1({
        executionId,
        expectedExecutionDigest: firstDigest,
        state: next,
      }),
      "committed",
    );
    assert.deepEqual(
      await createLocalCollectiveStatisticalCampaignExecutionStoreV1(
        await openCollectiveStatisticalCampaignLocalStoreV1({ root }),
      ).readExecutionStateV1({ executionId, registrationDigest }),
      next,
    );

    await writeFile(
      join(root, "states", `${sha256(executionId)}.json`),
      JSON.stringify({ schemaVersion: next.schemaVersion, ...next }),
    );
    await assert.rejects(
      local.readExecutionStateV1({ executionId, registrationDigest }),
      /not canonical/i,
    );
  });
});

test("adapts immutable execution records to the portable campaign store", async () => {
  await withStore(async (root) => {
    const local = await openCollectiveStatisticalCampaignLocalStoreV1({ root });
    const store =
      createLocalCollectiveStatisticalCampaignExecutionStoreV1(local);
    const runKey = `sha256:${"a".repeat(64)}`;
    const execution = {
      schemaVersion: 1,
      cellId: "cell:adapter",
      seed: 0,
      runner: "adaptive_collective",
      attempt: "first",
    };
    assert.equal(
      await store.commitExecutionV1({ runKey, execution }),
      "committed",
    );
    assert.equal(
      await store.commitExecutionV1({ runKey, execution }),
      "duplicate",
    );
    const reopened = createLocalCollectiveStatisticalCampaignExecutionStoreV1(
      await openCollectiveStatisticalCampaignLocalStoreV1({ root }),
    );
    assert.deepEqual(await reopened.readExecutionsV1([runKey]), [
      { runKey, execution },
    ]);
    await assert.rejects(
      store.commitExecutionV1({
        runKey,
        execution: { ...execution, seed: 1 },
      }),
      /conflicts/i,
    );
  });
});

test("local fenced execution commits validate the live lease before duplicate detection", async () => {
  await withStore(async (root) => {
    let currentTime = 1_500;
    const local = await openCollectiveStatisticalCampaignLocalStoreV1({ root });
    const store = createLocalCollectiveStatisticalCampaignExecutionStoreV1(
      local,
      () => currentTime,
    );
    const executionId = "execution/local-fenced";
    const registrationDigest = bundleDigest("registration-fenced");
    const runKey = bundleDigest("run-fenced");
    const cellId = "cell:local-fenced";
    const fenceA = {
      workerId: "worker:a",
      leaseToken: "lease:a",
      generation: 1,
      expiresAtMs: 1_000,
    };
    const fenceB = {
      workerId: "worker:b",
      leaseToken: "lease:b",
      generation: 2,
      expiresAtMs: 2_000,
    };
    const state = {
      schemaVersion: 1,
      executionId,
      registrationDigest,
      status: "active",
      revision: 3,
      cells: [
        {
          cellId,
          status: "running",
          lease: fenceB,
          runs: [{ runKey, status: "running" }],
        },
      ],
      manifest: null,
      executionDigest: bundleDigest("state-fenced"),
    };
    assert.equal(
      await store.compareAndSwapExecutionStateV1({
        executionId,
        expectedExecutionDigest: null,
        state,
      }),
      "committed",
    );
    const execution = {
      schemaVersion: 1,
      executionId,
      runKey,
      cellId,
      seed: 1,
      runner: "adaptive_collective",
      attempt: "first",
    };
    const operationExpiresAtMs = 3_000;
    const commit = (fence) =>
      store.commitExecutionWithFenceV1({
        executionId,
        registrationDigest,
        cellId,
        runKey,
        fence,
        operationExpiresAtMs,
        execution,
      });

    assert.equal(await commit(fenceA), "stale_fence");
    assert.deepEqual(await store.readExecutionsV1([runKey]), [
      { runKey, execution: null },
    ]);
    for (const fence of [
      { ...fenceB, workerId: "worker:wrong" },
      { ...fenceB, leaseToken: "lease:wrong" },
      { ...fenceB, generation: 3 },
    ])
      assert.equal(await commit(fence), "stale_fence");
    assert.equal(await commit(fenceB), "committed");
    assert.deepEqual(
      await store.readExecutionWithFenceV1({
        executionId,
        registrationDigest,
        cellId,
        runKey,
        fence: fenceB,
        operationExpiresAtMs,
      }),
      execution,
    );
    await assert.rejects(
      store.readExecutionWithFenceV1({
        executionId,
        registrationDigest,
        cellId,
        runKey,
        fence: { ...fenceB, workerId: "worker:wrong" },
        operationExpiresAtMs,
      }),
      /provenance does not match/u,
    );
    await assert.rejects(
      store.readExecutionWithFenceV1({
        executionId,
        registrationDigest,
        cellId,
        runKey,
        fence: fenceB,
        operationExpiresAtMs: operationExpiresAtMs + 1,
      }),
      /provenance does not match/u,
    );
    assert.equal(await commit(fenceA), "stale_fence");
    currentTime = fenceB.expiresAtMs;
    assert.equal(await commit(fenceB), "stale_fence");
    assert.deepEqual(await store.readExecutionsV1([runKey]), [
      { runKey, execution },
    ]);
  });
});
