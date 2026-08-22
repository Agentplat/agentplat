import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  discoverWorkspacePackageManifests,
  loadPublicPackageCatalog,
} from "./public-package-catalog.mjs";

export const TRUST_PACKAGE_NAME = "@agentplat/trust";

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
  const line = RELEASE_LINES.find(
    (candidate) =>
      candidate.catalogPackageCount === resolvedCatalog.packages.length &&
      candidate.trustPackageCount === trustPackageCount,
  );

  assert.ok(
    line,
    `Release line requires exactly 29 Alpha 3 packages without ${TRUST_PACKAGE_NAME}, 30 Alpha 4 packages, 33 Alpha 5 packages, 34 Beta 1 packages, 36 Beta 2 packages, or 56 Beta 5 packages with it exactly once`,
  );

  const resolvedRootManifest =
    rootManifest ??
    JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
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
