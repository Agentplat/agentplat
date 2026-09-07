import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPublicPackageCatalog } from "./public-package-catalog.mjs";
import { selectPublishablePackages } from "./publish-packages.mjs";
import { RELEASE_ARTIFACT_MANIFEST } from "./prepare-npm-release-artifacts.mjs";

const PUBLIC_REGISTRY_ARGUMENTS = Object.freeze([
  "--registry=https://registry.npmjs.org/",
  "--@agentplat:registry=https://registry.npmjs.org/",
]);
const PROHIBITED_LIFECYCLE_SCRIPTS = new Set([
  "dependencies",
  "install",
  "postinstall",
  "postpack",
  "postpublish",
  "postversion",
  "preinstall",
  "prepack",
  "prepare",
  "prepublish",
  "prepublishOnly",
  "preversion",
  "publish",
  "version",
]);

export async function stageNpmReleaseArtifacts({
  root = process.cwd(),
  environment = process.env,
} = {}) {
  assert.equal(environment.GITHUB_EVENT_NAME, "workflow_dispatch");
  assert.equal(environment.GITHUB_REF, "refs/heads/main");
  assert.equal(environment.GITHUB_REF_PROTECTED, "true");
  assert.equal(
    environment.AGENTPLAT_NPM_STAGE_ONLY_CONFIRMED,
    "true",
    "The npm stage-only trusted publisher configuration must be explicitly confirmed",
  );
  assert.equal(
    environment.NODE_AUTH_TOKEN,
    undefined,
    "NODE_AUTH_TOKEN must not be present",
  );
  assert.equal(
    environment.NPM_TOKEN,
    undefined,
    "NPM_TOKEN must not be present",
  );
  assert.ok(
    environment.ACTIONS_ID_TOKEN_REQUEST_URL,
    "GitHub OIDC URL is required",
  );
  assert.ok(
    environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
    "GitHub OIDC token is required",
  );

  const artifactDirectory = path.resolve(
    root,
    environment.AGENTPLAT_RELEASE_ARTIFACT_DIRECTORY ?? "release-artifacts",
  );
  const manifest = JSON.parse(
    await readFile(
      path.join(artifactDirectory, RELEASE_ARTIFACT_MANIFEST),
      "utf8",
    ),
  );
  const catalog = await loadPublicPackageCatalog(root);
  const selectedPackages = selectPublishablePackages({
    catalog,
    root,
    scope: manifest.scope,
  });
  validateReleaseArtifactManifest(manifest, {
    expectedCommit: environment.GITHUB_SHA,
    expectedDistTag: environment.NPM_DIST_TAG,
    expectedPackageNames: selectedPackages
      .map((entry) => entry.name)
      .sort(compareAscii),
  });

  const expectedFiles = [
    RELEASE_ARTIFACT_MANIFEST,
    ...manifest.artifacts.map((artifact) => artifact.filename),
  ].sort(compareAscii);
  assert.deepEqual(
    (await readdir(artifactDirectory)).sort(compareAscii),
    expectedFiles,
    "Release artifact directory contains missing or unexpected files",
  );

  for (const artifact of manifest.artifacts) {
    const tarballPath = path.join(artifactDirectory, artifact.filename);
    const contents = await readFile(tarballPath);
    assert.equal(
      contents.byteLength,
      artifact.size,
      `${artifact.name} size mismatch`,
    );
    assert.equal(
      `sha512-${createHash("sha512").update(contents).digest("base64")}`,
      artifact.integrity,
      `${artifact.name} integrity mismatch`,
    );
    const packedManifest = JSON.parse(
      run("tar", ["-xOzf", tarballPath, "package/package.json"], {
        environment: scrubAuthentication(environment),
      }).stdout,
    );
    assert.equal(packedManifest.name, artifact.name);
    assert.equal(packedManifest.version, artifact.version);
    for (const scriptName of Object.keys(packedManifest.scripts ?? {})) {
      assert.equal(
        PROHIBITED_LIFECYCLE_SCRIPTS.has(scriptName),
        false,
        `${artifact.name} packed forbidden lifecycle script ${scriptName}`,
      );
    }
  }

  assertSupportedNpm(
    run("npm", ["--version"], { environment: scrubAuthentication(environment) })
      .stdout,
  );
  const registration = await Promise.all(
    manifest.artifacts.map(async (artifact) => ({
      name: artifact.name,
      exists: await registryPackageExists(artifact.name),
    })),
  );
  const missingPackages = registration
    .filter((entry) => !entry.exists)
    .map((entry) => entry.name);
  assert.deepEqual(
    missingPackages,
    [],
    `Every package must be bootstrapped before staged publishing: ${missingPackages.join(", ")}`,
  );

  for (const artifact of manifest.artifacts) {
    run(
      "npm",
      [
        "stage",
        "publish",
        path.join(artifactDirectory, artifact.filename),
        "--access",
        "public",
        "--tag",
        manifest.distTag,
        "--provenance",
        ...PUBLIC_REGISTRY_ARGUMENTS,
      ],
      { environment: scrubAuthentication(environment), stdio: "inherit" },
    );
  }
  console.log(
    `Staged ${manifest.artifacts.length} packages from ${manifest.sourceCommit}; no package is public until separately approved with 2FA.`,
  );
}

export function validateReleaseArtifactManifest(
  manifest,
  { expectedCommit, expectedDistTag, expectedPackageNames },
) {
  assert.deepEqual(Object.keys(manifest).sort(compareAscii), [
    "artifacts",
    "distTag",
    "kind",
    "manifestDigest",
    "releaseVersion",
    "schemaVersion",
    "scope",
    "sourceCommit",
  ]);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.kind, "agentplat-npm-release-artifacts-v1");
  assert.equal(manifest.sourceCommit, expectedCommit);
  assert.equal(manifest.distTag, expectedDistTag);
  assert.match(manifest.sourceCommit, /^[0-9a-f]{40}$/u);
  assert.match(manifest.releaseVersion, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u);
  assert.match(manifest.distTag, /^[a-z][0-9a-z._-]*$/iu);
  assert.ok(["all", "public-consumer"].includes(manifest.scope));
  assert.ok(Array.isArray(manifest.artifacts) && manifest.artifacts.length > 0);
  assert.deepEqual(
    manifest.artifacts.map((artifact) => artifact.name),
    expectedPackageNames,
  );
  for (const artifact of manifest.artifacts) {
    assert.deepEqual(Object.keys(artifact).sort(compareAscii), [
      "filename",
      "integrity",
      "name",
      "size",
      "version",
    ]);
    assert.match(artifact.name, /^@agentplat\/[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    assert.equal(artifact.version, manifest.releaseVersion);
    assert.equal(
      artifact.filename,
      `agentplat-${artifact.name.slice("@agentplat/".length)}-${artifact.version}.tgz`,
    );
    assert.match(artifact.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/u);
    assert.ok(Number.isSafeInteger(artifact.size) && artifact.size > 0);
  }
  const { manifestDigest, ...body } = manifest;
  assert.equal(manifestDigest, digestCanonical(body));
}

async function registryPackageExists(packageName) {
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(packageName)}`,
    { headers: { accept: "application/vnd.npm.install-v1+json" } },
  );
  if (response.status === 404) return false;
  assert.equal(
    response.ok,
    true,
    `Unable to inspect ${packageName}: HTTP ${response.status}`,
  );
  return (await response.json()).name === packageName;
}

function scrubAuthentication(environment) {
  const clean = { ...environment, NPM_CONFIG_USERCONFIG: "/dev/null" };
  delete clean.NODE_AUTH_TOKEN;
  delete clean.NPM_TOKEN;
  delete clean.npm_config_userconfig;
  return clean;
}

function assertSupportedNpm(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)\s*$/u.exec(value);
  assert.ok(match, `Unable to parse npm version: ${value}`);
  const [, major, minor] = match.map(Number);
  assert.ok(
    major > 11 || (major === 11 && minor >= 15),
    `npm stage publish requires npm >=11.15.0; received ${value.trim()}`,
  );
}

function run(command, arguments_, { environment, stdio = "pipe" }) {
  const result = spawnSync(command, arguments_, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: environment,
    stdio,
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    `${command} ${arguments_.join(" ")} failed: ${result.stderr ?? ""}`,
  );
  return result;
}

function digestCanonical(value) {
  return `sha256-${createHash("sha256").update(canonical(value)).digest("base64")}`;
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort(compareAscii)
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(",")}}`;
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    await stageNpmReleaseArtifacts();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
