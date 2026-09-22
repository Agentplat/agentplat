import assert from "node:assert/strict";
import {
  verifyRegistryArtifact,
  publicRegistryUrl,
} from "./npm-registry-artifact.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPublicPackageCatalog } from "./public-package-catalog.mjs";
import { selectPublishablePackages } from "./publish-packages.mjs";
import { RELEASE_ARTIFACT_MANIFEST } from "./prepare-npm-release-artifacts.mjs";
import { validateReleaseArtifactManifest } from "./stage-npm-release-artifacts.mjs";

export async function verifyNpmReleaseProvenance({
  root = process.cwd(),
  environment = process.env,
  fetchImplementation = fetch,
} = {}) {
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
  const expectedPackageNames = selectPublishablePackages({
    catalog,
    root,
    scope: manifest.scope,
  })
    .map((entry) => entry.name)
    .sort(compareAscii);
  validateReleaseArtifactManifest(manifest, {
    expectedCommit: environment.AGENTPLAT_SOURCE_COMMIT,
    expectedDistTag: environment.NPM_DIST_TAG,
    expectedPackageNames,
  });

  const keyResponse = await fetchImplementation(
    "https://registry.npmjs.org/-/npm/v1/keys",
    { redirect: "error" },
  );
  assert.ok(keyResponse.ok, "Unable to read npm registry signing keys");
  const keys = await keyResponse.json();
  for (const artifact of manifest.artifacts) {
    const packumentResponse = await fetchImplementation(
      `https://registry.npmjs.org/${encodeURIComponent(artifact.name)}`,
      { headers: { accept: "application/vnd.npm.install-v1+json" } },
    );
    assert.equal(packumentResponse.ok, true, `Unable to read ${artifact.name}`);
    const packument = await packumentResponse.json();
    const version = packument.versions?.[artifact.version];
    assert.ok(version, `${artifact.name}@${artifact.version} is not published`);
    const attestationResponse = await fetchImplementation(
      publicRegistryUrl(version.dist?.attestations?.url),
      { redirect: "error" },
    );
    assert.equal(
      attestationResponse.ok,
      true,
      `Unable to read ${artifact.name} attestations`,
    );
    await verifyRegistryArtifact({
      artifact,
      dist: version.dist,
      keys,
      fetchImplementation,
    });
    validateRegistryPackageEvidence({
      artifact,
      attestations: await attestationResponse.json(),
      dist: version.dist,
      distributionTags: packument["dist-tags"],
      expectedCommit: manifest.sourceCommit,
      expectedDistTag: manifest.distTag,
      expectedWorkflowPath: environment.AGENTPLAT_RELEASE_WORKFLOW_PATH,
    });
  }
  console.log(
    `Verified registry integrity, signatures, provenance and ${manifest.distTag} for ${manifest.artifacts.length} packages from ${manifest.sourceCommit}.`,
  );
}

export function validateRegistryPackageEvidence({
  artifact,
  attestations,
  dist,
  distributionTags,
  expectedCommit,
  expectedDistTag,
  expectedWorkflowPath = ".github/workflows/release.yml",
}) {
  assert.ok(
    [
      ".github/workflows/release.yml",
      ".github/workflows/release-direct.yml",
    ].includes(expectedWorkflowPath),
    "Unapproved release workflow",
  );
  assert.equal(
    dist.integrity,
    artifact.integrity,
    `${artifact.name} registry integrity mismatch`,
  );
  assert.ok(
    Array.isArray(dist.signatures) && dist.signatures.length > 0,
    `${artifact.name} is unsigned`,
  );
  assert.equal(
    distributionTags?.[expectedDistTag],
    artifact.version,
    `${artifact.name} ${expectedDistTag} does not target the release version`,
  );
  assert.ok(Array.isArray(attestations?.attestations));
  const statements = attestations.attestations.map(decodeStatement);
  assert.ok(
    statements.some(
      (statement) =>
        statement.predicateType ===
        "https://github.com/npm/attestation/tree/main/specs/publish/v0.1",
    ),
    `${artifact.name} is missing the npm publish attestation`,
  );
  const provenance = statements.find(
    (statement) => statement.predicateType === "https://slsa.dev/provenance/v1",
  );
  assert.ok(provenance, `${artifact.name} is missing SLSA provenance`);
  const subject = provenance.subject?.find(
    (entry) =>
      entry.name ===
      `pkg:npm/${artifact.name.replace(/^@/u, "%40")}@${artifact.version}`,
  );
  assert.ok(subject, `${artifact.name} provenance subject is missing`);
  assert.equal(
    subject.digest?.sha512,
    Buffer.from(artifact.integrity.slice("sha512-".length), "base64").toString(
      "hex",
    ),
    `${artifact.name} provenance subject digest mismatch`,
  );
  const buildDefinition = provenance.predicate?.buildDefinition;
  assert.equal(
    buildDefinition?.buildType,
    "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
  );
  assert.deepEqual(buildDefinition?.externalParameters?.workflow, {
    ref: "refs/heads/main",
    repository: "https://github.com/Agentplat/agentplat",
    path: expectedWorkflowPath,
  });
  assert.ok(
    buildDefinition?.resolvedDependencies?.some(
      (dependency) => dependency.digest?.gitCommit === expectedCommit,
    ),
    `${artifact.name} provenance does not bind release commit ${expectedCommit}`,
  );
  assert.equal(
    provenance.predicate?.runDetails?.builder?.id,
    "https://github.com/actions/runner/github-hosted",
  );
}

function decodeStatement(attestation) {
  const payload = attestation?.bundle?.dsseEnvelope?.payload;
  assert.equal(typeof payload, "string", "Attestation DSSE payload is missing");
  return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    await verifyNpmReleaseProvenance();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
