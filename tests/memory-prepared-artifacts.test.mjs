import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
for (const scenario of ["missing", "foreign"])
  test(`memory prepared mode rejects ${scenario} manifest without rebuilding or installing`, async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "memory-prepared-"));
    try {
      if (scenario === "foreign")
        await writeFile(
          path.join(directory, "npm-release-artifacts-v1.json"),
          JSON.stringify({
            schemaVersion: 1,
            kind: "agentplat-npm-release-artifacts-v1",
            scope: "all",
            sourceCommit: "0".repeat(40),
            releaseVersion: "1.4.0",
            distTag: "next",
            artifacts: [],
            manifestDigest: "invalid",
          }),
        );
      const result = spawnSync(
        process.execPath,
        ["scripts/verify-memory-consumer.mjs"],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            AGENTPLAT_POSTGRES_TEST: "1",
            AGENTPLAT_PREPACKED_TARBALL_DIRECTORY: directory,
          },
        },
      );
      assert.equal(result.status, 1);
      assert.doesNotMatch(result.stdout, /Building and packing|Installing/);
      assert.match(
        result.stderr,
        scenario === "missing" ? /ENOENT/ : /AssertionError/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
test("both release workflows require memory checks against prepared artifacts before upload", async () => {
  for (const workflow of ["release.yml", "release-direct.yml"]) {
    const text = await readFile(
      new URL("../.github/workflows/" + workflow, import.meta.url),
      "utf8",
    );
    const exact = text
      .split("      - name: Verify the exact release artifacts")[1]
      .split("      - name: Upload immutable npm release artifacts")[0];
    assert.match(exact, /pnpm run verify:memory-consumer/);
    assert.match(exact, /AGENTPLAT_PREPACKED_TARBALL_DIRECTORY/);
    assert.match(exact, /PGDATABASE: agentplat_release/);
  }
});
