import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const workflow = path.join(
  root,
  ".github/workflows/collective-campaign-readiness.yml",
);

test("campaign readiness workflow is manual, secret-free and non-executing", async () => {
  const source = await readFile(workflow, "utf8");
  assert.match(source, /^\s*workflow_dispatch:/m);
  assert.doesNotMatch(
    source,
    /^\s*(schedule|push|pull_request|workflow_call):/m,
  );
  assert.match(source, /permissions:\n\s+contents: read\n\s+actions: read/u);
  assert.match(source, /options: \[plan, assess\]/u);
  assert.match(source, /options: \[DO_NOT_RUN, RUN_READINESS_CHECKS\]/u);
  assert.match(source, /GITHUB_REF.*refs\/heads\/main/u);
  assert.match(source, /SOURCE_SHA.*GITHUB_SHA/u);
  assert.equal((source.match(/persist-credentials: false/g) ?? []).length, 8);
  assert.equal((source.match(/retention-days: 30/g) ?? []).length, 8);
  assert.equal(
    [...source.matchAll(/^\s+timeout-minutes:\s+(\d+)$/gmu)].reduce(
      (total, match) => total + Number(match[1]),
      0,
    ),
    170,
  );
  assert.doesNotMatch(
    source,
    /secrets\.|environment:\s+[^\n]|npm publish|dist-tag|deploy|execute-shard|RUN_NORMATIVE_240X4|RUN_REGISTERED_PREFLIGHT_5X4/iu,
  );
  assert.doesNotMatch(source, /continue-on-error:\s*true/u);
  assert.doesNotMatch(
    source,
    /cache:\s*pnpm/u,
    "setup-node must not request pnpm caching before corepack enables pnpm",
  );
  assert.doesNotMatch(source, /matrix:\s*[\s\S]*?shard/iu);
  for (const match of source.matchAll(/uses: ([^\s#]+)/g))
    assert.match(match[1], /@[a-f0-9]{40}$/u);
  for (const block of workflowRunBlocks(source))
    assert.doesNotMatch(
      block,
      /\$\{\{\s*(?:inputs|github|needs|matrix)\./u,
      "workflow expressions must enter shell steps through env",
    );
});

test("campaign readiness workflow closes the exact provider-neutral control set", async () => {
  const source = await readFile(workflow, "utf8");
  const dependencySecurityJob = source.slice(
    source.indexOf("\n  dependency-security:"),
    source.indexOf("\n  assess:"),
  );
  for (const controlId of [
    "portable_node20_consumer",
    "portable_node22_consumer",
    "postgres_durable_consumer",
    "public_evidence_privacy",
    "predispatch_evidence_safety",
    "retention_and_indeterminate_safety",
    "production_dependency_security",
    "integrated_replanning_safety",
  ])
    assert.match(
      source,
      new RegExp(controlId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"),
    );
  assert.match(source, /node-version: 20\.19\.3/u);
  assert.match(source, /node-version: 22/u);
  assert.match(source, /verify:packed-postgres-consumer/u);
  assert.match(source, /--mode preflight/u);
  assert.match(source, /run-id: \$\{\{ inputs\.preflight_run_id \}\}/u);
  assert.match(
    source,
    /download_root="\$RUNNER_TEMP\/protected-preflight-download"/u,
  );
  assert.match(
    source,
    /authorization="\$download_root\/registered-preflight-authorization\/authorization-receipt\.json"/u,
  );
  assert.match(
    source,
    /receipts_root="\$download_root\/registered-preflight-results"/u,
  );
  assert.match(source, /\[\[ "\$\{#files\[@\]\}" -eq 3 \]\]/u);
  assert.match(source, /\[\[ "\$\{#receipts\[@\]\}" -eq 2 \]\]/u);
  assert.match(
    source,
    /\.path == "\.github\/workflows\/collective-statistical-registered-preflight\.yml"/u,
  );
  assert.match(source, /--status failed --reason-code evidence_missing/u);
  assert.match(source, /audit:dependencies|production-dependency-audit/u);
  assert.match(
    dependencySecurityJob,
    /pnpm --filter @agentplat\/collective-planning\.\.\. build/u,
  );
  assert.match(source, /--mode assess/u);
});

function workflowRunBlocks(source) {
  const lines = source.split("\n");
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s+)run:\s*(.*)$/u.exec(lines[index]);
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
