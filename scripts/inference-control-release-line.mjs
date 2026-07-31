import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  discoverWorkspacePackageManifests,
  loadPublicPackageCatalog,
} from './public-package-catalog.mjs';

export const INFERENCE_CONTROL_PACKAGE_NAME = '@agentplat/inference-control';
export const INFERENCE_CONTROL_RELEASE_VERSION = '0.3.0-alpha.3';
export const INFERENCE_CONTROL_PACKAGE_COUNT = 29;

/**
 * Reject the transient, publishable 29-package Alpha 2 workspace line.
 *
 * The guard is intentionally inert before inference-control is cataloged so
 * historical release lines remain verifiable. Once it is present, every
 * release-facing operation must use the coordinated Alpha 3 line.
 */
export async function assertInferenceControlReleaseLine({
  root = process.cwd(),
  catalog = undefined,
  rootManifest = undefined,
} = {}) {
  const resolvedCatalog = catalog ?? (await loadPublicPackageCatalog(root));
  const hasInferenceControl = resolvedCatalog.packages.some(
    (entry) => entry.name === INFERENCE_CONTROL_PACKAGE_NAME,
  );
  if (!hasInferenceControl) return false;

  assert.equal(
    resolvedCatalog.packages.length,
    INFERENCE_CONTROL_PACKAGE_COUNT,
    `${INFERENCE_CONTROL_PACKAGE_NAME} requires exactly ${INFERENCE_CONTROL_PACKAGE_COUNT} cataloged packages`,
  );

  const resolvedRootManifest =
    rootManifest ??
    JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(
    resolvedRootManifest.version,
    INFERENCE_CONTROL_RELEASE_VERSION,
    `${INFERENCE_CONTROL_PACKAGE_NAME} requires root version ${INFERENCE_CONTROL_RELEASE_VERSION}`,
  );

  const manifests = await discoverWorkspacePackageManifests(root);
  assert.equal(
    manifests.length,
    INFERENCE_CONTROL_PACKAGE_COUNT,
    `${INFERENCE_CONTROL_PACKAGE_NAME} requires exactly ${INFERENCE_CONTROL_PACKAGE_COUNT} workspace manifests`,
  );
  assert.deepEqual(
    manifests.map((record) => record.directory),
    resolvedCatalog.packages.map((entry) => entry.directory),
    `${INFERENCE_CONTROL_PACKAGE_NAME} requires workspace manifests to match the catalog in ASCII order`,
  );
  for (const { manifest } of manifests) {
    assert.equal(
      manifest.version,
      INFERENCE_CONTROL_RELEASE_VERSION,
      `${manifest.name} must use ${INFERENCE_CONTROL_RELEASE_VERSION} when ${INFERENCE_CONTROL_PACKAGE_NAME} is present`,
    );
  }

  return true;
}
