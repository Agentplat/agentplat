import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  discoverWorkspacePackageManifests,
  loadPublicPackageCatalog,
} from './public-package-catalog.mjs';

export const TRUST_PACKAGE_NAME = '@agentplat/trust';

export const RELEASE_LINES = Object.freeze([
  Object.freeze({
    catalogPackageCount: 29,
    id: 'alpha3',
    releaseVersion: '0.3.0-alpha.3',
    trustPackageCount: 0,
  }),
  Object.freeze({
    catalogPackageCount: 30,
    id: 'alpha4',
    releaseVersion: '0.3.0-alpha.4',
    trustPackageCount: 1,
  }),
]);

/**
 * Verify the only publishable coordinated release cohorts.
 *
 * Alpha 3 remains valid while Trust has not yet entered the public catalog.
 * Adding Trust is an atomic Alpha 4 transition: the catalog, root and every
 * workspace manifest must move together before pack or registry operations.
 */
export async function assertReleaseLine({
  root = process.cwd(),
  catalog = undefined,
  rootManifest = undefined,
} = {}) {
  const resolvedCatalog = catalog ?? (await loadPublicPackageCatalog(root));
  const trustPackageCount = resolvedCatalog.packages.filter(
    (entry) => entry.name === TRUST_PACKAGE_NAME
  ).length;
  const line = RELEASE_LINES.find(
    (candidate) =>
      candidate.catalogPackageCount === resolvedCatalog.packages.length &&
      candidate.trustPackageCount === trustPackageCount
  );

  assert.ok(
    line,
    `Release line requires exactly either 29 Alpha 3 packages without ${TRUST_PACKAGE_NAME} or 30 Alpha 4 packages with ${TRUST_PACKAGE_NAME} exactly once`
  );

  const resolvedRootManifest =
    rootManifest ??
    JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(
    resolvedRootManifest.version,
    line.releaseVersion,
    `Release line ${line.id} requires root version ${line.releaseVersion}`
  );

  const manifests = await discoverWorkspacePackageManifests(root);
  assert.equal(
    manifests.length,
    line.catalogPackageCount,
    `Release line ${line.id} requires exactly ${line.catalogPackageCount} workspace manifests`
  );
  assert.deepEqual(
    manifests.map((record) => record.directory),
    resolvedCatalog.packages.map((entry) => entry.directory),
    `Release line ${line.id} requires workspace manifests to match the catalog in ASCII order`
  );
  for (const { manifest } of manifests) {
    assert.equal(
      manifest.version,
      line.releaseVersion,
      `${manifest.name} must use ${line.releaseVersion} on release line ${line.id}`
    );
  }

  return true;
}
