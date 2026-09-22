import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { canOwnerApproveRelease } from "./npm-owner-review-exception.mjs";

export async function approveOwnerNpmRelease({
  runId,
  mode = "staged",
  api = githubApi,
}) {
  assert.match(String(runId ?? ""), /^\d+$/, "supply a release run ID");
  assert(["staged", "direct"].includes(mode), "Unknown release approval mode");
  const direct = mode === "direct",
    environment = direct ? "npm-release" : "npm-production";
  const workflow = direct
    ? ".github/workflows/release-direct.yml"
    : ".github/workflows/release.yml";
  const repo = "repos/Agentplat/agentplat";
  const run = api(`${repo}/actions/runs/${runId}`),
    viewer = api("user");
  assert(
    canOwnerApproveRelease({
      actor: run.actor,
      triggeringActor: run.triggering_actor,
      viewer,
    }),
    "Automatic review is limited to owner-initiated and owner-rerun releases",
  );
  assert.equal(run.head_branch, "main");
  assert.equal(run.path, workflow);
  assert.equal(run.event, "workflow_dispatch");
  const jobs = api(`${repo}/actions/runs/${runId}/jobs?per_page=100`).jobs;
  assert(
    jobs.some(
      (j) =>
        j.name === "prepare" &&
        j.status === "completed" &&
        j.conclusion === "success",
    ),
    "Exact artifacts must pass preparation first",
  );
  const env = api(`${repo}/environments/${environment}`);
  assert.equal(env.can_admins_bypass, false);
  if (direct) {
    assert.equal(
      api(`${repo}/actions/variables/AGENTPLAT_NPM_DIRECT_RELEASE_ENABLED`)
        .value,
      "true",
    );
    assert.equal(
      api(
        `${repo}/environments/${environment}/variables/AGENTPLAT_NPM_DIRECT_PUBLISH_CONFIRMED`,
      ).value,
      "true",
    );
    assert.equal(env.deployment_branch_policy.protected_branches, false);
    assert.equal(env.deployment_branch_policy.custom_branch_policies, true);
    const policies = api(
      `${repo}/environments/${environment}/deployment-branch-policies`,
    ).branch_policies;
    assert.deepEqual(
      policies.map((p) => ({ name: p.name, type: p.type })),
      [{ name: "main", type: "branch" }],
    );
  } else {
    assert.equal(env.deployment_branch_policy.protected_branches, true);
    assert.equal(env.deployment_branch_policy.custom_branch_policies, false);
  }
  const review = env.protection_rules.find(
    (r) => r.type === "required_reviewers",
  );
  assert.equal(review.prevent_self_review, false);
  assert.deepEqual(
    review.reviewers.map((r) => ({ type: r.type, id: r.reviewer.id })),
    [{ type: "User", id: viewer.id }],
  );
  const pending = api(`${repo}/actions/runs/${runId}/pending_deployments`);
  const target = pending.find((p) => p.environment.name === environment);
  assert(
    target?.current_user_can_approve,
    "Owner approval must be available for this pending environment",
  );
  api(`${repo}/actions/runs/${runId}/pending_deployments`, {
    environment_ids: [target.environment.id],
    state: "approved",
    comment: direct
      ? "Owner-authorized release-level approval of the exact prepared cohort. Direct OIDC publication is explicitly enabled."
      : "Standing owner authorization: owner-initiated release; exact artifacts prepared. npm staged-byte review and 2FA remain required.",
  });
  return { mode, environment, approved: true };
}
function githubApi(endpoint, body) {
  const args = [
    "api",
    ...(body ? ["--method", "POST"] : []),
    endpoint,
    ...(body ? ["--input", "-"] : []),
  ];
  const text = execFileSync("gh", args, {
    encoding: "utf8",
    input: body ? JSON.stringify(body) : undefined,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return text.trim() ? JSON.parse(text) : undefined;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    assert(
      process.argv.length <= 4 &&
        (!process.argv[3] || process.argv[3] === "--direct"),
      "Usage: approve-owner-npm-release.mjs RUN_ID [--direct]",
    );
    console.log(
      JSON.stringify(
        await approveOwnerNpmRelease({
          runId: process.argv[2],
          mode: process.argv[3] ? "direct" : "staged",
        }),
      ),
    );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
