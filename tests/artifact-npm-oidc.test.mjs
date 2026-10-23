import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  validateArtifactNpmOidc,
  OIDC_VALIDATION_PACKAGES,
} from "../scripts/validate-artifact-npm-oidc.mjs";
const environment = {
  AGENTPLAT_NPM_DIRECT_RELEASE_ENABLED: "true",
  AGENTPLAT_NPM_DIRECT_PUBLISH_CONFIRMED: "true",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/main",
  GITHUB_REF_PROTECTED: "true",
  GITHUB_REPOSITORY: "Agentplat/agentplat",
  RUNNER_ENVIRONMENT: "github-hosted",
  GITHUB_WORKFLOW_REF:
    "Agentplat/agentplat/.github/workflows/release-direct.yml@refs/heads/main",
  GITHUB_ACTOR: "douglas-grishen",
  GITHUB_ACTOR_ID: "207043696",
  GITHUB_TRIGGERING_ACTOR: "douglas-grishen",
  GITHUB_SHA: "a".repeat(40),
  ACTIONS_ID_TOKEN_REQUEST_URL: "https://fixture.invalid/oidc?request=1",
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: "request-secret",
  NPM_DIST_TAG: "latest",
};
const credential = {
  token_type: "oidc",
  token: "npm-secret",
  created: "2026-10-22T00:00:00Z",
  expires: "2026-10-22T01:00:00Z",
};
const now = () => Date.parse("2026-10-22T00:01:00Z");
test("exchanges only the two fixed packages, with correct audience and no credential leakage", async () => {
  const requests = [];
  const report = await validateArtifactNpmOidc({
    environment,
    now,
    fetchImplementation: async (url, options) => {
      requests.push({ url, options });
      return requests.length === 1
        ? { status: 200, json: async () => ({ value: "id-secret" }) }
        : { status: 201, json: async () => credential };
    },
  });
  assert.equal(requests.length, 3);
  assert.equal(
    new URL(requests[0].url).searchParams.get("audience"),
    "npm:registry.npmjs.org",
  );
  for (const [i, name] of OIDC_VALIDATION_PACKAGES.entries()) {
    assert.equal(
      requests[i + 1].url,
      `https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(name)}`,
    );
    assert.equal(requests[i + 1].options.method, "POST");
    assert.equal(
      requests[i + 1].options.headers.authorization,
      "Bearer id-secret",
    );
    assert.equal(requests[i + 1].options.redirect, "error");
  }
  assert.equal(report.publicationAttempted, false);
  assert.equal(report.distTagsModified, false);
  assert(!JSON.stringify(report).includes("secret"));
});
test("foreign identity, workflow, branch and disabled flags fail before network access", async () => {
  for (const change of [
    { GITHUB_ACTOR: "foreign" },
    { GITHUB_TRIGGERING_ACTOR: "foreign" },
    { GITHUB_REF_PROTECTED: "false" },
    { GITHUB_WORKFLOW_REF: "other" },
    { AGENTPLAT_NPM_DIRECT_RELEASE_ENABLED: "false" },
    { AGENTPLAT_NPM_DIRECT_PUBLISH_CONFIRMED: "false" },
    { NPM_TOKEN: "secret" },
  ]) {
    let called = false;
    await assert.rejects(
      validateArtifactNpmOidc({
        environment: { ...environment, ...change },
        now,
        fetchImplementation: async () => {
          called = true;
        },
      }),
    );
    assert.equal(called, false);
  }
});
test("rejected exchange fails closed without reading or exposing its response body", async () => {
  let calls = 0;
  await assert.rejects(
    validateArtifactNpmOidc({
      environment,
      now,
      fetchImplementation: async () =>
        ++calls === 1
          ? { status: 200, json: async () => ({ value: "secret" }) }
          : {
              status: 401,
              json: async () => {
                throw Error("body must not be read");
              },
            },
    }),
    /HTTP 401/,
  );
  assert.equal(calls, 2);
});
test("expired or malformed npm credentials are rejected", async () => {
  for (const change of [
    { token_type: "other" },
    { token: "" },
    { created: "invalid" },
    { expires: "2020-01-01" },
  ]) {
    let calls = 0;
    await assert.rejects(
      validateArtifactNpmOidc({
        environment,
        now,
        fetchImplementation: async () =>
          ++calls === 1
            ? { status: 200, json: async () => ({ value: "id-secret" }) }
            : { status: 201, json: async () => ({ ...credential, ...change }) },
      }),
    );
  }
});
test("validation dispatch cannot fall through into release preparation or publication", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/release-direct.yml", import.meta.url),
    "utf8",
  );
  assert.match(
    workflow,
    /prepare:\n    if: >-\n      !inputs.validate_artifact_oidc &&/,
  );
  assert.match(
    workflow,
    /publish:\n    if: \$\{\{ !inputs.dry_run && !inputs.validate_artifact_oidc/,
  );
  assert.match(workflow, /inputs.validate_artifact_oidc && inputs.dry_run &&/);
  const validationJob = workflow.split("  validate-artifact-oidc:")[1];
  assert.match(validationJob, /environment: npm-release/);
  assert.match(validationJob, /id-token: write/);
  assert(!validationJob.includes("publish-direct-npm-release.mjs"));
});
