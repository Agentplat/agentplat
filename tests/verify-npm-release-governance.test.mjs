import assert from "node:assert/strict";
import test from "node:test";
import { analyzeNpmReleaseGovernance } from "../scripts/verify-npm-release-governance.mjs";

function secureState() {
  return {
    environment: {
      name: "npm-production",
      can_admins_bypass: false,
      protection_rules: [
        {
          type: "required_reviewers",
          prevent_self_review: true,
          reviewers: [{ type: "User", reviewer: { login: "reviewer" } }],
        },
      ],
      deployment_branch_policy: {
        protected_branches: true,
        custom_branch_policies: false,
      },
    },
    environmentVariables: {
      variables: [
        { name: "AGENTPLAT_NPM_STAGE_ONLY_CONFIRMED", value: "true" },
      ],
    },
    repositorySecrets: { secrets: [{ name: "AGENTPLAT_PUBLIC_DENYLIST" }] },
    actionsPermissions: { sha_pinning_required: true },
    mainBranchRules: [
      {
        type: "pull_request",
        parameters: { require_code_owner_review: true },
      },
      {
        type: "required_status_checks",
        parameters: { required_status_checks: [{ context: "check" }] },
      },
    ],
  };
}

test("npm release governance passes only the complete protected state", () => {
  assert.deepEqual(analyzeNpmReleaseGovernance(secureState()), {
    schemaVersion: 1,
    kind: "agentplat-npm-release-governance-v1",
    status: "passed",
    findings: [],
  });
});

test("npm release governance reports every missing external control", () => {
  const state = secureState();
  state.environment.can_admins_bypass = true;
  state.environment.protection_rules[0].prevent_self_review = false;
  state.environment.protection_rules[0].reviewers = [];
  state.environment.deployment_branch_policy.protected_branches = false;
  state.environmentVariables.variables = [];
  state.repositorySecrets.secrets.push({ name: "NPM_TOKEN" });
  state.actionsPermissions.sha_pinning_required = false;
  state.mainBranchRules[0].parameters.require_code_owner_review = false;
  state.mainBranchRules[1].parameters.required_status_checks = [];
  state.mainBranchRules.push({ type: "ruleset_bypass_actor", bypass_mode: "always" });
  assert.deepEqual(analyzeNpmReleaseGovernance(state).findings, [
    "npm_environment_admin_bypass_enabled",
    "npm_environment_independent_review_missing",
    "npm_environment_reviewer_missing",
    "npm_environment_protected_branch_policy_missing",
    "npm_stage_only_confirmation_variable_missing",
    "legacy_npm_token_present",
    "github_actions_sha_pinning_not_required",
    "main_code_owner_review_not_required",
    "main_release_check_not_required",
    "main_ruleset_permanent_bypass_present",
  ]);
});
