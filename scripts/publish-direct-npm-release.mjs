import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPublicPackageCatalog } from "./public-package-catalog.mjs";
import {
  selectPublishablePackages,
  topologicalPackages,
} from "./publish-packages.mjs";
import { RELEASE_ARTIFACT_MANIFEST } from "./prepare-npm-release-artifacts.mjs";
import {
  validateReleaseArtifactManifest,
  verifyReleaseArtifactFiles,
} from "./stage-npm-release-artifacts.mjs";
import {
  verifyRegistryArtifact,
  publicRegistryUrl,
} from "./npm-registry-artifact.mjs";
import { validateRegistryPackageEvidence } from "./verify-npm-release-provenance.mjs";

export const DIRECT_WORKFLOW = ".github/workflows/release-direct.yml";
export function assertDirectReleaseContext(e) {
  assert.equal(
    e.AGENTPLAT_NPM_DIRECT_RELEASE_ENABLED,
    "true",
    "Direct release has not been enabled",
  );
  assert.equal(
    e.AGENTPLAT_NPM_DIRECT_PUBLISH_CONFIRMED,
    "true",
    "npm direct OIDC permissions have not been confirmed",
  );
  assert.equal(e.GITHUB_EVENT_NAME, "workflow_dispatch");
  assert.equal(e.GITHUB_REF, "refs/heads/main");
  assert.equal(e.GITHUB_REF_PROTECTED, "true");
  assert.equal(e.GITHUB_REPOSITORY, "Agentplat/agentplat");
  assert.equal(e.RUNNER_ENVIRONMENT, "github-hosted");
  assert.equal(
    e.GITHUB_WORKFLOW_REF,
    `Agentplat/agentplat/${DIRECT_WORKFLOW}@refs/heads/main`,
  );
  assert.equal(e.GITHUB_ACTOR, "douglas-grishen");
  assert.equal(e.GITHUB_ACTOR_ID, "207043696");
  assert.equal(e.GITHUB_TRIGGERING_ACTOR, "douglas-grishen");
  assert.match(e.GITHUB_SHA ?? "", /^[0-9a-f]{40}$/);
  assert.ok(
    e.ACTIONS_ID_TOKEN_REQUEST_URL && e.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
    "GitHub OIDC is required",
  );
  assert.equal(
    e.NODE_AUTH_TOKEN,
    undefined,
    "Long-lived npm tokens are prohibited",
  );
  assert.equal(e.NPM_TOKEN, undefined, "Long-lived npm tokens are prohibited");
  assert(["next", "latest"].includes(e.NPM_DIST_TAG));
}

export function publicationOrder(packed) {
  const manifests = new Map(packed.map((p) => [p.name, p]));
  assert.equal(manifests.size, packed.length, "Duplicate packed package");
  return topologicalPackages(
    packed.map((p) => ({ name: p.name })),
    manifests,
  ).map((p) => p.name);
}

// A rerun may skip a version only after checking its exact bytes, tag and origin.
export async function inspectPublishedArtifact({
  artifact,
  manifest,
  fetchImplementation = fetch,
}) {
  const r = await fetchImplementation(
    `https://registry.npmjs.org/${encodeURIComponent(artifact.name)}`,
    { headers: { accept: "application/json" } },
  );
  assert(
    r.ok,
    `Package must already exist and be readable: ${artifact.name} (${r.status})`,
  );
  const packument = await r.json();
  assert.equal(packument.name, artifact.name);
  const v = packument.versions?.[artifact.version];
  if (!v) return false;
  const keysResponse = await fetchImplementation(
    "https://registry.npmjs.org/-/npm/v1/keys",
    { redirect: "error" },
  );
  assert(keysResponse.ok, "Unable to read npm signing keys");
  const attest = await fetchImplementation(
    publicRegistryUrl(v.dist?.attestations?.url),
    { redirect: "error" },
  );
  assert(attest.ok, "Unable to verify existing provenance: " + artifact.name);
  validateRegistryPackageEvidence({
    artifact,
    attestations: await attest.json(),
    dist: v.dist,
    distributionTags: packument["dist-tags"],
    expectedCommit: manifest.sourceCommit,
    expectedDistTag: manifest.distTag,
    expectedWorkflowPath: DIRECT_WORKFLOW,
  });
  await verifyRegistryArtifact({
    artifact,
    dist: v.dist,
    keys: await keysResponse.json(),
    fetchImplementation,
  });
  return true;
}

export async function publishDirectNpmRelease({
  root = process.cwd(),
  environment = process.env,
  fetchImplementation = fetch,
  execute = run,
} = {}) {
  assertDirectReleaseContext(environment);
  const artifactDirectory = path.resolve(
    root,
    environment.AGENTPLAT_RELEASE_ARTIFACT_DIRECTORY ?? "release-artifacts",
  );
  assert(
    artifactDirectory.startsWith(path.resolve(root) + path.sep),
    "Artifacts must be inside the checkout",
  );
  const manifest = JSON.parse(
    await readFile(
      path.join(artifactDirectory, RELEASE_ARTIFACT_MANIFEST),
      "utf8",
    ),
  );
  const catalog = await loadPublicPackageCatalog(root);
  const names = selectPublishablePackages({
    catalog,
    root,
    scope: manifest.scope,
  })
    .map((p) => p.name)
    .sort();
  validateReleaseArtifactManifest(manifest, {
    expectedCommit: environment.GITHUB_SHA,
    expectedDistTag: environment.NPM_DIST_TAG,
    expectedPackageNames: names,
  });
  assert.equal(
    manifest.releaseVersion,
    JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version,
  );
  assert(
    !(manifest.releaseVersion.includes("-") && manifest.distTag === "latest"),
    "Prereleases must not promote latest",
  );
  const clean = {
    ...environment,
    NPM_CONFIG_USERCONFIG: "/dev/null",
    NPM_CONFIG_GLOBALCONFIG: "/dev/null",
    NPM_CONFIG_IGNORE_SCRIPTS: "true",
  };
  delete clean.npm_config_userconfig;
  delete clean.npm_config_globalconfig;
  delete clean.npm_config_ignore_scripts;
  // Validate the ENTIRE archive cohort before any public mutation.
  const packed = await verifyReleaseArtifactFiles({
    artifactDirectory,
    manifest,
    environment: clean,
  });
  const order = publicationOrder(packed),
    artifacts = new Map(manifest.artifacts.map((a) => [a.name, a]));
  const existing = new Set();
  for (const artifact of manifest.artifacts)
    if (
      await inspectPublishedArtifact({
        artifact,
        manifest,
        fetchImplementation,
      })
    )
      existing.add(artifact.name);
  const cwd = await mkdtemp(
    path.join(os.tmpdir(), "agentplat-direct-publish-"),
  );
  const result = {
    sourceCommit: manifest.sourceCommit,
    manifestDigest: manifest.manifestDigest,
    releaseVersion: manifest.releaseVersion,
    distTag: manifest.distTag,
    packages: [],
  };
  const report = path.join(root, "direct-release-report.json");
  try {
    // npm rejects loading one path as both user and global configuration.
    clean.NPM_CONFIG_USERCONFIG = path.join(cwd, "user.npmrc");
    clean.NPM_CONFIG_GLOBALCONFIG = path.join(cwd, "global.npmrc");
    await writeFile(clean.NPM_CONFIG_USERCONFIG, "", { mode: 0o600 });
    await writeFile(clean.NPM_CONFIG_GLOBALCONFIG, "", { mode: 0o600 });
    const version = execute("npm", ["--version"], {
      cwd,
      environment: clean,
    }).stdout.trim();
    assert(/^\d+\.\d+\.\d+$/.test(version), "Invalid npm version");
    const [major, minor] = version.split(".").map(Number);
    assert(major > 11 || (major === 11 && minor >= 15), "npm >=11.15 required");
    for (const name of order) {
      const artifact = artifacts.get(name);
      if (!existing.has(name))
        execute(
          "npm",
          [
            "publish",
            path.join(artifactDirectory, artifact.filename),
            "--ignore-scripts",
            "--access",
            "public",
            "--tag",
            manifest.distTag,
            "--provenance",
            "--registry=https://registry.npmjs.org/",
            "--@agentplat:registry=https://registry.npmjs.org/",
          ],
          { cwd, environment: clean, stdio: "inherit" },
        );
      result.packages.push({
        name,
        status: existing.has(name) ? "verified-existing" : "published",
      });
      await writeFile(report, JSON.stringify(result, null, 2) + "\n");
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
  console.log(
    `Direct OIDC publication completed for ${result.packages.length} packages; post-publication verification is still required.`,
  );
  return result;
}
function run(command, args, { cwd, environment, stdio = "pipe" }) {
  const r = spawnSync(command, args, {
    cwd,
    env: environment,
    encoding: "utf8",
    stdio,
  });
  if (r.error) throw r.error;
  assert.equal(
    r.status,
    0,
    `${command} failed; stop and rerun the same immutable release after diagnosis`,
  );
  return r;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await publishDirectNpmRelease();
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
