import test from "node:test";
import assert from "node:assert/strict";
import { validateApprovedReleaseSource } from "../scripts/verify-approved-release-source.mjs";
const fixture = () => ({
  expectedCommit: "a".repeat(40),
  expectedRunId: "123",
  run: {
    id: 123,
    repository: { full_name: "Agentplat/agentplat" },
    head_repository: { full_name: "Agentplat/agentplat" },
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: "a".repeat(40),
    status: "completed",
    conclusion: "success",
    workflow_id: 7,
  },
  workflow: { id: 7, path: ".github/workflows/release.yml" },
  jobs: [{ name: "stage", status: "completed", conclusion: "success" }],
});
test("approved verifier accepts only a completed staged release from main", () => {
  assert.equal(validateApprovedReleaseSource(fixture()), "a".repeat(40));
});
test("approved verifier rejects foreign commits, forks, workflows and unstaged runs", () => {
  for (const mutate of [
    (x) => (x.run.head_sha = "b".repeat(40)),
    (x) => (x.run.head_branch = "attacker"),
    (x) => (x.run.head_repository.full_name = "someone/agentplat"),
    (x) => (x.run.repository.full_name = "someone/agentplat"),
    (x) => (x.run.event = "pull_request"),
    (x) => (x.run.conclusion = "failure"),
    (x) => (x.workflow.id = 9),
    (x) => (x.workflow.path = ".github/workflows/other.yml"),
    (x) => (x.jobs[0].conclusion = "skipped"),
    (x) => (x.run.id = 456),
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(() => validateApprovedReleaseSource(value));
  }
});
