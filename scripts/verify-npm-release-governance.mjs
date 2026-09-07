import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY = "Agentplat/agentplat";

export function analyzeNpmReleaseGovernance({
  environment,
  environmentVariables,
  repositorySecrets,
  actionsPermissions,
  mainBranchRules,
}) {
  const findings = [];
  if (environment?.name !== "npm-production") {
    findings.push("npm_production_environment_missing");
  } else {
    if (environment.can_admins_bypass !== false) {
      findings.push("npm_environment_admin_bypass_enabled");
    }
    const reviewerRule = environment.protection_rules?.find(
      (rule) => rule.type === "required_reviewers",
    );
    if (!reviewerRule || reviewerRule.prevent_self_review !== true) {
      findings.push("npm_environment_independent_review_missing");
    }
    if (!Array.isArray(reviewerRule?.reviewers) || reviewerRule.reviewers.length === 0) {
      findings.push("npm_environment_reviewer_missing");
    }
    if (
      environment.deployment_branch_policy?.protected_branches !== true ||
      environment.deployment_branch_policy?.custom_branch_policies !== false
    ) {
      findings.push("npm_environment_protected_branch_policy_missing");
    }
    if (
      !environmentVariables?.variables?.some(
        (variable) =>
          variable.name === "AGENTPLAT_NPM_STAGE_ONLY_CONFIRMED" &&
          variable.value === "true",
      )
    ) {
      findings.push("npm_stage_only_confirmation_variable_missing");
    }
  }

  const secretNames = new Set(repositorySecrets?.secrets?.map((secret) => secret.name));
  if (secretNames.has("NPM_TOKEN")) findings.push("legacy_npm_token_present");
  if (actionsPermissions?.sha_pinning_required !== true) {
    findings.push("github_actions_sha_pinning_not_required");
  }

  const pullRequestRule = mainBranchRules?.find((rule) => rule.type === "pull_request");
  if (!pullRequestRule || pullRequestRule.parameters?.require_code_owner_review !== true) {
    findings.push("main_code_owner_review_not_required");
  }
  const statusRule = mainBranchRules?.find(
    (rule) => rule.type === "required_status_checks",
  );
  if (
    !statusRule?.parameters?.required_status_checks?.some(
      (check) => check.context === "check",
    )
  ) {
    findings.push("main_release_check_not_required");
  }
  if (mainBranchRules?.some((rule) => rule.bypass_mode === "always")) {
    findings.push("main_ruleset_permanent_bypass_present");
  }

  return Object.freeze({
    schemaVersion: 1,
    kind: "agentplat-npm-release-governance-v1",
    status: findings.length === 0 ? "passed" : "failed",
    findings: Object.freeze(findings),
  });
}

export function verifyNpmReleaseGovernance() {
  const environment = ghApi(
    `repos/${REPOSITORY}/environments/npm-production`,
    { allow404: true },
  );
  const environmentVariables = ghApi(
    `repos/${REPOSITORY}/environments/npm-production/variables`,
    { allow404: true },
  );
  const repositorySecrets = ghApi(`repos/${REPOSITORY}/actions/secrets`);
  const actionsPermissions = ghApi(`repos/${REPOSITORY}/actions/permissions`);
  const mainBranchRules = ghApi(`repos/${REPOSITORY}/rules/branches/main`);
  const rulesets = ghApi(`repos/${REPOSITORY}/rulesets`);
  const detailedRules = rulesets.flatMap((ruleset) => {
    const detail = ghApi(`repos/${REPOSITORY}/rulesets/${ruleset.id}`);
    return [
      ...(detail.rules ?? []),
      ...(detail.bypass_actors ?? []).map((actor) => ({
        type: "ruleset_bypass_actor",
        bypass_mode: actor.bypass_mode,
      })),
    ];
  });
  const report = analyzeNpmReleaseGovernance({
    environment,
    environmentVariables,
    repositorySecrets,
    actionsPermissions,
    mainBranchRules: [...mainBranchRules, ...detailedRules],
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  assert.equal(
    report.status,
    "passed",
    `npm release governance is incomplete: ${report.findings.join(", ")}`,
  );
  return report;
}

function ghApi(endpoint, { allow404 = false } = {}) {
  const result = spawnSync("gh", ["api", endpoint], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (allow404 && result.status === 1 && /HTTP 404|Not Found/iu.test(result.stderr)) {
    return undefined;
  }
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `gh api ${endpoint} failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    verifyNpmReleaseGovernance();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
