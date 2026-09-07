import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function validateApprovedReleaseSource({
  run,
  workflow,
  jobs,
  expectedCommit,
  expectedRunId,
}) {
  assert.match(expectedCommit, /^[0-9a-f]{40}$/);
  assert.match(String(expectedRunId), /^[1-9][0-9]{0,19}$/);
  assert.equal(String(run.id), String(expectedRunId));
  assert.equal(run.repository?.full_name, "Agentplat/agentplat");
  assert.equal(run.head_repository?.full_name, "Agentplat/agentplat");
  assert.equal(run.event, "workflow_dispatch");
  assert.equal(run.head_branch, "main");
  assert.equal(run.head_sha, expectedCommit);
  assert.equal(run.status, "completed");
  assert.equal(run.conclusion, "success");
  assert.equal(workflow.path, ".github/workflows/release.yml");
  assert.equal(run.workflow_id, workflow.id);
  assert.ok(
    jobs.some(
      (job) =>
        job.name === "stage" &&
        job.status === "completed" &&
        job.conclusion === "success",
    ),
    "Originating release must have successfully staged its artifacts",
  );
  return run.head_sha;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const expectedRunId = process.env.RELEASE_RUN_ID;
  assert.match(expectedRunId ?? "", /^[1-9][0-9]{0,19}$/);
  const api = (endpoint) => {
    const result = spawnSync("gh", ["api", endpoint], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    assert.equal(
      result.status,
      0,
      "Unable to verify originating GitHub release",
    );
    return JSON.parse(result.stdout);
  };
  const prefix = "repos/Agentplat/agentplat/actions";
  const sourceCommit = validateApprovedReleaseSource({
    run: api(`${prefix}/runs/${expectedRunId}`),
    workflow: api(`${prefix}/workflows/release.yml`),
    jobs: api(`${prefix}/runs/${expectedRunId}/jobs?per_page=100`).jobs,
    expectedCommit: process.env.SOURCE_COMMIT,
    expectedRunId,
  });
  assert.ok(process.env.GITHUB_OUTPUT);
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `source_commit=${sourceCommit}\n`,
  );
  console.log(
    "Verified source commit against the successfully staged main-branch release.",
  );
}
