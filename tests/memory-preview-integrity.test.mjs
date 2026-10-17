import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = process.env.MEMORY_PREVIEW_BUNDLE;
for (const scenario of [
  "modified-file",
  "extra-file",
  "modified-npm-file",
  "extra-npm-file",
])
  test(
    `memory preview refuses ${scenario} before install or database execution`,
    { skip: !bundle },
    async () => {
      const temp = await mkdtemp(path.join(os.tmpdir(), "memory-integrity-"));
      try {
        await cp(path.resolve(bundle), temp, { recursive: true });
        const directory = scenario.includes("npm")
          ? "npm-consumer"
          : "consumer";
        if (scenario.startsWith("modified")) {
          const target = path.join(
            temp,
            directory + "/persistent-memory-postgres.mjs",
          );
          await writeFile(
            target,
            (await readFile(target, "utf8")) + "\n// altered consumer\n",
          );
        } else
          await writeFile(
            path.join(temp, directory, ".npmrc"),
            "ignore-scripts=false\n",
          );
        const result = spawnSync(
          process.execPath,
          [
            path.join(root, "scripts/verify-memory-consumer.mjs"),
            "--verify",
            temp,
            ...(scenario.includes("npm") ? ["--manager", "npm"] : []),
          ],
          {
            encoding: "utf8",
            env: { ...process.env, AGENTPLAT_POSTGRES_TEST: "1" },
          },
        );
        assert.equal(result.status, 1);
        assert.match(
          result.stderr,
          scenario.startsWith("modified")
            ? /Bundle bytes changed/
            : /Unsealed files/,
        );
        assert.doesNotMatch(result.stdout, /Installing/);
      } finally {
        await rm(temp, { recursive: true, force: true });
      }
    },
  );
