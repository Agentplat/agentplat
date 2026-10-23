import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { assertDirectReleaseContext } from "./publish-direct-npm-release.mjs";

export const OIDC_VALIDATION_PACKAGES = Object.freeze([
  "@agentplat/artifacts",
  "@agentplat/artifacts-postgres",
]);

// This probe exchanges credentials only. It never calls publish or dist-tag APIs.
export async function validateArtifactNpmOidc({
  environment = process.env,
  fetchImplementation = fetch,
  now = Date.now,
} = {}) {
  assertDirectReleaseContext(environment);
  const requestUrl = new URL(environment.ACTIONS_ID_TOKEN_REQUEST_URL);
  assert.equal(requestUrl.protocol, "https:");
  requestUrl.searchParams.set("audience", "npm:registry.npmjs.org");
  const idResponse = await fetchImplementation(requestUrl.href, {
    headers: {
      authorization: `Bearer ${environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`,
    },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(idResponse.status, 200, "GitHub OIDC request failed");
  const { value: idToken } = await idResponse.json();
  assert.equal(typeof idToken, "string", "GitHub OIDC token missing");
  assert(idToken.length > 0, "GitHub OIDC token empty");
  const results = [];
  for (const name of OIDC_VALIDATION_PACKAGES) {
    const response = await fetchImplementation(
      `https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(name)}`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${idToken}` },
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      },
    );
    // Never include response bodies or credentials in diagnostics or artifacts.
    assert.equal(
      response.status,
      201,
      `npm OIDC exchange failed for ${name} (HTTP ${response.status})`,
    );
    const credential = await response.json();
    assert.equal(
      credential.token_type,
      "oidc",
      "Unexpected npm credential type",
    );
    assert(
      typeof credential.token === "string" && credential.token.length > 0,
      "npm credential missing",
    );
    // npm CLI requires the exchanged token, not optional timestamp metadata.
    // Validate timestamps when supplied; npm may omit them in live responses.
    if (credential.created !== undefined) {
      assert(
        Number.isFinite(Date.parse(credential.created)),
        "Invalid npm credential creation",
      );
    }
    if (credential.expires !== undefined) {
      assert(Date.parse(credential.expires) > now(), "npm credential expired");
    }
    results.push({
      name,
      exchange: "accepted",
      ...(credential.expires === undefined
        ? {}
        : { expires: new Date(credential.expires).toISOString() }),
    });
  }
  return {
    sourceCommit: environment.GITHUB_SHA,
    workflow: environment.GITHUB_WORKFLOW_REF,
    environment: "npm-release",
    packages: results,
    publicationAttempted: false,
    distTagsModified: false,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const report = await validateArtifactNpmOidc();
    await writeFile(
      "artifact-npm-oidc-report.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(
      "npm accepted OIDC exchange for both artifact packages; no publication or tag changes attempted.",
    );
  } catch (error) {
    // Fetch exceptions may carry request metadata; do not dump stacks/causes.
    console.error(
      error instanceof assert.AssertionError
        ? error.message
        : "OIDC validation failed; credentials omitted.",
    );
    process.exitCode = 1;
  }
}
