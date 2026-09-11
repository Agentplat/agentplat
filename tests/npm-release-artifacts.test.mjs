import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { validateReleaseArtifactManifest } from "../scripts/stage-npm-release-artifacts.mjs";

test("staging loads without installed workspace dependencies", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agentplat-stage-clean-"));
  try {
    await cp(
      new URL("../scripts/", import.meta.url),
      path.join(root, "scripts"),
      { recursive: true },
    );
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "await import('./scripts/stage-npm-release-artifacts.mjs')",
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, NODE_PATH: "" },
      },
    );
    assert.equal(result.status, 0, result.stderr);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(",")}}`;
}

function fixture() {
  const body = {
    schemaVersion: 1,
    kind: "agentplat-npm-release-artifacts-v1",
    sourceCommit: "a".repeat(40),
    releaseVersion: "1.2.3-beta.1",
    scope: "public-consumer",
    distTag: "next",
    artifacts: [
      {
        filename: "agentplat-core-1.2.3-beta.1.tgz",
        integrity: `sha512-${Buffer.alloc(64).toString("base64")}`,
        name: "@agentplat/core",
        size: 42,
        version: "1.2.3-beta.1",
      },
    ],
  };
  return {
    ...body,
    manifestDigest: `sha256-${createHash("sha256").update(canonical(body)).digest("base64")}`,
  };
}

const expected = {
  expectedCommit: "a".repeat(40),
  expectedDistTag: "next",
  expectedPackageNames: ["@agentplat/core"],
};

test("release artifact manifest binds commit, tag, cohort and tarball integrity", () => {
  assert.doesNotThrow(() =>
    validateReleaseArtifactManifest(fixture(), expected),
  );
  for (const mutate of [
    (value) => {
      value.sourceCommit = "b".repeat(40);
    },
    (value) => {
      value.distTag = "latest";
    },
    (value) => {
      value.artifacts[0].integrity = `sha512-${Buffer.alloc(64, 1).toString("base64")}`;
    },
    (value) => {
      value.artifacts[0].filename = "other.tgz";
    },
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(() => validateReleaseArtifactManifest(value, expected));
  }
});

test("release artifact manifest rejects omitted or injected package identities", () => {
  assert.throws(() =>
    validateReleaseArtifactManifest(fixture(), {
      ...expected,
      expectedPackageNames: ["@agentplat/core", "@agentplat/runtime"],
    }),
  );
  const value = fixture();
  value.artifacts.push({ ...value.artifacts[0], name: "@agentplat/surprise" });
  assert.throws(() => validateReleaseArtifactManifest(value, expected));
});
