import assert from "node:assert/strict";
import test from "node:test";
import { approveOwnerNpmRelease } from "../scripts/approve-owner-npm-release.mjs";
function fixture(mode) {
  const owner = { login: "douglas-grishen", id: 207043696 };
  const direct = mode === "direct";
  const r = "repos/Agentplat/agentplat",
    name = direct ? "npm-release" : "npm-production";
  const table = {
    [`${r}/actions/runs/123`]: {
      actor: owner,
      triggering_actor: owner,
      head_branch: "main",
      path: direct
        ? ".github/workflows/release-direct.yml"
        : ".github/workflows/release.yml",
      event: "workflow_dispatch",
    },
    user: owner,
    [`${r}/actions/runs/123/jobs?per_page=100`]: {
      jobs: [{ name: "prepare", status: "completed", conclusion: "success" }],
    },
    [`${r}/environments/${name}`]: {
      can_admins_bypass: false,
      deployment_branch_policy: {
        protected_branches: !direct,
        custom_branch_policies: direct,
      },
      protection_rules: [
        {
          type: "required_reviewers",
          prevent_self_review: false,
          reviewers: [{ type: "User", reviewer: owner }],
        },
      ],
    },
    [`${r}/actions/runs/123/pending_deployments`]: [
      { environment: { id: 9, name }, current_user_can_approve: true },
    ],
    [`${r}/actions/variables/AGENTPLAT_NPM_DIRECT_RELEASE_ENABLED`]: {
      value: "true",
    },
    [`${r}/environments/${name}/variables/AGENTPLAT_NPM_DIRECT_PUBLISH_CONFIRMED`]:
      { value: "true" },
    [`${r}/environments/${name}/deployment-branch-policies`]: {
      branch_policies: [{ name: "main", type: "branch" }],
    },
  };
  const writes = [];
  const api = (key, body) => {
    if (body) {
      writes.push({ key, body });
      return;
    }
    assert(key in table, key);
    return table[key];
  };
  return { table, writes, api, r, name };
}
for (const mode of ["staged", "direct"])
  test(`${mode} approval binds the intended gate after successful preparation`, async () => {
    const f = fixture(mode);
    assert.equal(
      (await approveOwnerNpmRelease({ runId: "123", mode, api: f.api }))
        .approved,
      true,
    );
    assert.equal(f.writes.length, 1);
    assert.deepEqual(f.writes[0].body.environment_ids, [9]);
  });
for (const fault of [
  "actor",
  "rerun",
  "branch",
  "workflow",
  "prepare",
  "reviewer",
  "gate",
  "flag",
  "branch-policy",
])
  test(`direct approval rejects ${fault} before mutation`, async () => {
    const f = fixture("direct"),
      run = f.table[`${f.r}/actions/runs/123`],
      env = f.table[`${f.r}/environments/${f.name}`];
    if (fault === "actor") run.actor = { login: "other", id: 1 };
    if (fault === "rerun") run.triggering_actor = { login: "other", id: 1 };
    if (fault === "branch") run.head_branch = "topic";
    if (fault === "workflow") run.path = ".github/workflows/release.yml";
    if (fault === "prepare")
      f.table[`${f.r}/actions/runs/123/jobs?per_page=100`].jobs[0].conclusion =
        "failure";
    if (fault === "reviewer")
      env.protection_rules[0].reviewers.push({
        type: "User",
        reviewer: { id: 2 },
      });
    if (fault === "gate")
      f.table[
        `${f.r}/actions/runs/123/pending_deployments`
      ][0].environment.name = "npm-production";
    if (fault === "flag")
      f.table[
        `${f.r}/actions/variables/AGENTPLAT_NPM_DIRECT_RELEASE_ENABLED`
      ].value = "false";
    if (fault === "branch-policy")
      f.table[
        `${f.r}/environments/${f.name}/deployment-branch-policies`
      ].branch_policies = [{ name: "*", type: "branch" }];
    await assert.rejects(
      approveOwnerNpmRelease({ runId: "123", mode: "direct", api: f.api }),
    );
    assert.equal(f.writes.length, 0);
  });
