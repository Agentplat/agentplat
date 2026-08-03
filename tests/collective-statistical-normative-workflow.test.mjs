import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  validateCollectiveEvaluationCampaignRegistrationV1,
  validateNormativeOperationPlanV1,
  validateNormativeRunnerDescriptorV1,
} from "../packages/collective-planning/dist/evaluation.js";

const root = path.resolve(import.meta.dirname, "..");
const workflow = path.join(
  root,
  ".github/workflows/collective-statistical-normative.yml",
);
const cli = path.join(root, "scripts/collective-beta3-normative-operation.mjs");

test("normative workflow is manual, least-privilege and bounded", async () => {
  const source = await readFile(workflow, "utf8");
  assert.match(source, /^\s*workflow_dispatch:/m);
  assert.doesNotMatch(source, /^\s*schedule:/m);
  assert.doesNotMatch(source, /^\s*(push|pull_request|workflow_call):/m);
  assert.match(source, /\^\[a-f0-9\]\{40\}\$/);
  assert.match(source, /GITHUB_REF.*refs\/heads\/main/);
  assert.match(source, /SOURCE_SHA.*GITHUB_SHA/);
  assert.doesNotMatch(source, /source_tree_digest|ref: \$\{\{ inputs\./);
  assert.match(source, /contents: read/);
  assert.match(source, /RUN_NORMATIVE_240X4/);
  assert.match(source, /options: \["1", "2"\]/);
  assert.match(source, /fail-fast: false/);
  assert.match(source, /cancel-in-progress: false/);
  assert.equal((source.match(/retention-days: 90/g) ?? []).length, 7);
  assert.equal(
    (source.match(/environment: normative-campaign-protected/g) ?? []).length,
    6,
  );
  assert.equal((source.match(/persist-credentials: false/g) ?? []).length, 7);
  assert.match(source, /if: \$\{\{ always\(\) \}\}/);
  assert.match(source, /needs: \[plan, collect\]/);
  assert.match(source, /needs: \[plan, analyze\]/);
  assert.match(source, /needs: \[plan, verify\]/);
  assert.match(source, /adapter_registered == 'true'/);
  assert.match(source, /steps\.adapter-gate\.outcome == 'success'/);
  assert.match(source, /needs\.execution-gate\.result == 'success'/);
  assert.doesNotMatch(source, /continue-on-error:\s*true/);
  assert.match(source, /execution:\{0\}:attempt:\{1\}/);
  for (const block of workflowRunBlocks(source))
    assert.doesNotMatch(
      block,
      /\$\{\{\s*(?:inputs|github|needs|matrix)\./,
      "workflow expressions must enter shell steps through env, never interpolation",
    );
  assert.match(source, /CAMPAIGN_ID: \$\{\{ inputs\.campaign_id \}\}/);
  assert.match(source, /--campaign-id "\$CAMPAIGN_ID"/);
  const shardMatrix = source.match(
    /matrix:\n\s+shard:\n\s+\[([\s\S]*?)\n\s+\]/,
  )?.[1];
  assert.ok(shardMatrix);
  assert.deepEqual(
    [...shardMatrix.matchAll(/\d+/g)].map(([value]) => Number(value)),
    Array.from({ length: 48 }, (_, index) => index),
  );
  assert.doesNotMatch(source, /secrets\.|npm publish|deploy|cloud|dist-tag/i);
  for (const match of source.matchAll(/uses: ([^\s#]+)/g))
    assert.match(match[1], /@[a-f0-9]{40}$/);
});

test("default plan registers a clean exact source with the fixed campaign shape", async () => {
  const repo = await cleanFixtureRepo();
  const output = await mkdtemp(
    path.join(os.tmpdir(), "normative-plan-output-"),
  );
  try {
    const sha = git(repo, ["rev-parse", "HEAD"]);
    execFileSync(
      "node",
      [
        cli,
        "--mode",
        "plan",
        "--confirm",
        "DO_NOT_RUN",
        "--campaign-id",
        "audit-240",
        "--source-sha",
        sha,
        "--output-directory",
        output,
      ],
      { cwd: repo, encoding: "utf8" },
    );
    const registration = JSON.parse(
      await readFile(path.join(output, "registration.json"), "utf8"),
    );
    const sourceLock = JSON.parse(
      await readFile(path.join(output, "source-lock.json"), "utf8"),
    );
    const descriptor = JSON.parse(
      await readFile(path.join(output, "adapter-descriptor.json"), "utf8"),
    );
    const operationPlan = JSON.parse(
      await readFile(path.join(output, "operation-plan.json"), "utf8"),
    );
    const expected = JSON.parse(
      await readFile(path.join(output, "expected-manifest.json"), "utf8"),
    );
    const estimate = JSON.parse(
      await readFile(path.join(output, "estimate.json"), "utf8"),
    );
    assert.equal(sourceLock.sourceCommit, sha);
    assert.equal(sourceLock.dirtyWorktree, false);
    assert.match(sourceLock.sourceTreeDigest, /^sha256:[a-f0-9]{64}$/);
    const validatedRegistration =
      validateCollectiveEvaluationCampaignRegistrationV1(registration);
    const validatedDescriptor = validateNormativeRunnerDescriptorV1(descriptor);
    const validatedPlan = validateNormativeOperationPlanV1(
      operationPlan,
      validatedRegistration,
      validatedDescriptor,
    );
    assert.equal(validatedRegistration.cells.length, 240);
    assert.equal(validatedPlan.expectedSlotCount, 960);
    assert.equal(validatedPlan.shards.length, 48);
    assert.equal(validatedDescriptor.runnerClass, "diagnostic");
    assert.equal(expected.slots.length, 960);
    assert.equal(estimate.maximumInteractions, 3296000);
    execFileSync(
      "node",
      [
        cli,
        "--mode",
        "plan",
        "--confirm",
        "DO_NOT_RUN",
        "--campaign-id",
        "audit-240",
        "--source-sha",
        sha,
        "--output-directory",
        output,
      ],
      { cwd: repo, encoding: "utf8" },
    );
  } finally {
    await rm(repo, { recursive: true, force: true });
    await rm(output, { recursive: true, force: true });
  }
});

test("plan rejects source mismatch and a dirty worktree", async () => {
  const repo = await cleanFixtureRepo();
  try {
    const sha = git(repo, ["rev-parse", "HEAD"]);
    const common = [
      cli,
      "--mode",
      "plan",
      "--confirm",
      "DO_NOT_RUN",
      "--campaign-id",
      "audit-240",
      "--source-sha",
    ];
    assert.throws(
      () =>
        execFileSync(
          "node",
          [
            ...common,
            "a".repeat(40),
            "--output-directory",
            path.join(repo, "bad"),
          ],
          { cwd: repo, stdio: "pipe" },
        ),
      /normative_source_commit_mismatch/,
    );
    await writeFile(path.join(repo, "untracked.txt"), "dirty\n");
    assert.throws(
      () =>
        execFileSync(
          "node",
          [...common, sha, "--output-directory", path.join(repo, "dirty")],
          { cwd: repo, stdio: "pipe" },
        ),
      /normative_source_worktree_dirty/,
    );
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("execution modes always leave a fail-closed receipt", async () => {
  const receiptDirectory = await mkdtemp(
    path.join(os.tmpdir(), "normative-receipt-"),
  );
  try {
    const digest = `sha256:${"a".repeat(64)}`;
    const args = [
      cli,
      "--mode",
      "execute-shard",
      "--confirm",
      "RUN_NORMATIVE_240X4",
      "--campaign-id",
      "audit-240",
      "--source-sha",
      "b".repeat(40),
      "--registration-digest",
      digest,
      "--plan-digest",
      digest,
      "--execution-id",
      "execution-1",
      "--run-id",
      "run-1",
      "--run-attempt",
      "1",
      "--registration-directory",
      receiptDirectory,
      "--shard",
      "0",
      "--adapter",
      "diagnostic",
    ];
    assert.throws(
      () => execFileSync("node", args, { stdio: "pipe" }),
      /Command failed/,
    );
    const receiptFiles = await readdir(receiptDirectory);
    assert.equal(receiptFiles.length, 1);
    assert.match(
      receiptFiles[0],
      /^receipt-execute-shard-[a-f0-9]{64}\.json$/u,
    );
    const receiptPath = path.join(receiptDirectory, receiptFiles[0]);
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    assert.equal(receipt.reasonCode, "normative_diagnostic_adapter_rejected");
    assert.equal(receipt.executionPermitted, false);
    assert.equal(receipt.registrationDigest, digest);
    assert.equal(receipt.planDigest, digest);
    assert.throws(
      () => execFileSync("node", args, { stdio: "pipe" }),
      /Command failed/,
    );
  } finally {
    await rm(receiptDirectory, { recursive: true, force: true });
  }
});

async function cleanFixtureRepo() {
  const repo = await mkdtemp(path.join(os.tmpdir(), "normative-git-"));
  await writeFile(
    path.join(repo, "package.json"),
    '{"version":"0.0.0-test"}\n',
  );
  await writeFile(
    path.join(repo, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\n",
  );
  git(repo, ["init"]);
  git(repo, ["add", "package.json", "pnpm-lock.yaml"]);
  git(repo, [
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "-m",
    "fixture",
  ]);
  return repo;
}
function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function workflowRunBlocks(source) {
  const lines = source.split("\n");
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s+)run:\s*(.*)$/.exec(lines[index]);
    if (!match) continue;
    const indentation = match[1].length;
    const block = [match[2]];
    while (index + 1 < lines.length) {
      const next = lines[index + 1];
      if (next.trim() && next.length - next.trimStart().length <= indentation)
        break;
      block.push(next);
      index += 1;
    }
    blocks.push(block.join("\n"));
  }
  return blocks;
}
