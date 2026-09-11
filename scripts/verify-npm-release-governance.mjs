import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  matchesOwnerReviewException,
  NPM_OWNER_REVIEW_EXCEPTION,
} from "./npm-owner-review-exception.mjs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY = "Agentplat/agentplat";

// Standing owner authorization, 2026-09-11: review bypass on this ruleset only.
// Protect main and npm deployment/2FA approvals remain separate controls.
const OWNER_PR_REVIEW_EXCEPTION = Object.freeze({
  userId: 207043696,
  reviewRulesetId: 20820479,
});

export function analyzeNpmReleaseGovernance({
  environment,
  environmentVariables,
  repositorySecrets,
  actionsPermissions,
  mainBranchRules,
  releaseVersion,
  scope = "all",
  distTag = "next",
}) {
  const findings = [];
  const variable = (name) =>
    environmentVariables?.variables?.find((entry) => entry.name === name)
      ?.value;
  const ownerReviewVersion = variable("AGENTPLAT_NPM_OWNER_REVIEW_VERSION");
  const ownerReviewLogin = variable("AGENTPLAT_NPM_OWNER_REVIEW_LOGIN");
  const ownerException = matchesOwnerReviewException({
    releaseVersion,
    scope,
    distTag,
    ownerReviewVersion,
    ownerReviewLogin,
  });
  if ((ownerReviewVersion || ownerReviewLogin) && !ownerException)
    findings.push("npm_owner_review_exception_scope_mismatch");
  if (environment?.name !== "npm-production") {
    findings.push("npm_production_environment_missing");
  } else {
    if (environment.can_admins_bypass !== false) {
      findings.push("npm_environment_admin_bypass_enabled");
    }
    const reviewerRule = environment.protection_rules?.find(
      (rule) => rule.type === "required_reviewers",
    );
    const ownerReviewer =
      ownerException &&
      reviewerRule?.reviewers?.length === 1 &&
      reviewerRule.reviewers[0].type === "User" &&
      reviewerRule.reviewers[0].reviewer?.login ===
        NPM_OWNER_REVIEW_EXCEPTION.ownerLogin;
    if (
      !reviewerRule ||
      (reviewerRule.prevent_self_review !== true && !ownerReviewer)
    ) {
      findings.push("npm_environment_independent_review_missing");
    }
    if (
      !Array.isArray(reviewerRule?.reviewers) ||
      reviewerRule.reviewers.length === 0
    ) {
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

  const secretNames = new Set(
    repositorySecrets?.secrets?.map((secret) => secret.name),
  );
  if (secretNames.has("NPM_TOKEN")) findings.push("legacy_npm_token_present");
  if (actionsPermissions?.sha_pinning_required !== true) {
    findings.push("github_actions_sha_pinning_not_required");
  }

  const pullRequestRule = mainBranchRules?.find(
    (rule) => rule.type === "pull_request",
  );
  if (
    !pullRequestRule ||
    pullRequestRule.parameters?.require_code_owner_review !== true
  ) {
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

  if (
    mainBranchRules?.some(
      (rule) =>
        rule.bypass_mode === "pull_request" &&
        !(
          rule.actor_type === "User" &&
          rule.actor_id === OWNER_PR_REVIEW_EXCEPTION.userId &&
          rule.ruleset_id === OWNER_PR_REVIEW_EXCEPTION.reviewRulesetId
        ),
    )
  ) {
    findings.push("main_ruleset_unapproved_review_bypass");
  }

  return Object.freeze({
    schemaVersion: 1,
    kind: "agentplat-npm-release-governance-v1",
    status: findings.length === 0 ? "passed" : "failed",
    findings: Object.freeze(findings),
  });
}

export function verifyNpmReleaseGovernance() {
  const environment = ghApi(`repos/${REPOSITORY}/environments/npm-production`, {
    allow404: true,
  });
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
        ruleset_id: detail.id,
        bypass_mode: actor.bypass_mode,
        actor_id: actor.actor_id,
        actor_type: actor.actor_type,
      })),
    ];
  });
  const report = analyzeNpmReleaseGovernance({
    environment,
    environmentVariables,
    repositorySecrets,
    actionsPermissions,
    mainBranchRules: [...mainBranchRules, ...detailedRules],
    releaseVersion: JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ).version,
    scope: process.env.NPM_PACKAGE_SCOPE ?? "all",
    distTag: process.env.NPM_DIST_TAG ?? "next",
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
  if (
    allow404 &&
    result.status === 1 &&
    /HTTP 404|Not Found/iu.test(result.stderr)
  ) {
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
