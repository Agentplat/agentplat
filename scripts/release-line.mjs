import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  discoverWorkspacePackageManifests,
  loadPublicPackageCatalog,
} from "./public-package-catalog.mjs";

export const TRUST_PACKAGE_NAME = "@agentplat/trust";

export const A2A_PACKAGE_NAMES = Object.freeze([
  "@agentplat/a2a",
  "@agentplat/agent-registry",
  "@agentplat/agent-registry-postgres",
]);

export const RELEASE_LINES = Object.freeze([
  Object.freeze({
    catalogPackageCount: 29,
    id: "alpha3",
    releaseVersion: "0.3.0-alpha.3",
    trustPackageCount: 0,
  }),
  Object.freeze({
    catalogPackageCount: 30,
    id: "alpha4",
    releaseVersion: "0.3.0-alpha.4",
    trustPackageCount: 1,
  }),
  Object.freeze({
    catalogPackageCount: 33,
    id: "alpha5",
    releaseVersion: "0.3.0-alpha.5",
    trustPackageCount: 1,
  }),
  Object.freeze({
    catalogPackageCount: 34,
    id: "beta1",
    releaseVersion: "0.3.0-beta.1",
    trustPackageCount: 1,
  }),
  Object.freeze({
    catalogPackageCount: 36,
    id: "beta2",
    releaseVersion: "0.3.0-beta.2",
    trustPackageCount: 1,
  }),
  Object.freeze({
    catalogPackageCount: 56,
    id: "beta5",
    releaseVersion: "0.3.0-beta.5",
    trustPackageCount: 1,
  }),
  Object.freeze({
    catalogPackageCount: 62,
    id: "beta6",
    releaseVersion: "0.3.0-beta.6",
    trustPackageCount: 1,
  }),
  Object.freeze({
    catalogPackageCount: 62,
    id: "beta7",
    releaseVersion: "0.3.0-beta.7",
    trustPackageCount: 1,
  }),
  Object.freeze({
    catalogPackageCount: 65,
    id: "beta7-a2a",
    releaseVersion: "0.3.0-beta.7",
    trustPackageCount: 1,
    requiredPackageNames: A2A_PACKAGE_NAMES,
  }),
]);

/**
 * Verify the only publishable coordinated release cohorts.
 *
 * Each additive release cohort is atomic: the catalog, root and every
 * workspace manifest must move together before pack or registry operations.
 */
export async function assertReleaseLine({
  root = process.cwd(),
  catalog = undefined,
  rootManifest = undefined,
} = {}) {
  const resolvedCatalog = catalog ?? (await loadPublicPackageCatalog(root));
  const trustPackageCount = resolvedCatalog.packages.filter(
    (entry) => entry.name === TRUST_PACKAGE_NAME,
  ).length;
  const resolvedRootManifest =
    rootManifest ??
    JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const matchingLines = RELEASE_LINES.filter(
    (candidate) =>
      candidate.catalogPackageCount === resolvedCatalog.packages.length &&
      candidate.trustPackageCount === trustPackageCount &&
      (!candidate.requiredPackageNames ||
        candidate.requiredPackageNames.every(
          (name) =>
            resolvedCatalog.packages.filter((entry) => entry.name === name)
              .length === 1,
        )),
  );

  const line =
    matchingLines.find(
      (candidate) => candidate.releaseVersion === resolvedRootManifest.version,
    ) ?? matchingLines[0];
  assert.ok(
    line,
    `Release line requires exactly 29 Alpha 3 packages without ${TRUST_PACKAGE_NAME}, 30 Alpha 4 packages, 33 Alpha 5 packages, 34 Beta 1 packages, 36 Beta 2 packages, 56 Beta 5 packages, 62 Beta 6/Beta 7 packages, or 65 Beta 7 packages with the complete A2A/Registry group and Trust exactly once`,
  );

  assert.equal(
    resolvedRootManifest.version,
    line.releaseVersion,
    `Release line ${line.id} requires root version ${line.releaseVersion}`,
  );

  const manifests = await discoverWorkspacePackageManifests(root);
  assert.equal(
    manifests.length,
    line.catalogPackageCount,
    `Release line ${line.id} requires exactly ${line.catalogPackageCount} workspace manifests`,
  );
  assert.deepEqual(
    manifests.map((record) => record.directory),
    resolvedCatalog.packages.map((entry) => entry.directory),
    `Release line ${line.id} requires workspace manifests to match the catalog in ASCII order`,
  );
  for (const { manifest } of manifests) {
    assert.equal(
      manifest.version,
      line.releaseVersion,
      `${manifest.name} must use ${line.releaseVersion} on release line ${line.id}`,
    );
  }

  return true;
}
