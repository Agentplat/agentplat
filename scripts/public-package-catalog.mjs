import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export const PUBLIC_PACKAGE_CATALOG_PATH = 'config/public-packages.json';
export const PUBLIC_PACKAGE_CATALOG_SCHEMA_VERSION = 2;

export const PUBLIC_PACKAGE_LAYERS = Object.freeze([
  'foundation',
  'model',
  'runtime',
  'collaboration',
  'adapter',
  'transport',
  'observability',
  'testing',
]);

const entryKeys = Object.freeze([
  'browserEntrypoints',
  'directory',
  'layer',
  'name',
  'packSmoke',
  'providerNeutral',
  'publish',
]);

export async function loadPublicPackageCatalog(root = process.cwd()) {
  const catalog = JSON.parse(
    await readFile(path.join(root, PUBLIC_PACKAGE_CATALOG_PATH), 'utf8')
  );
  return validatePublicPackageCatalog(catalog);
}

export async function discoverWorkspacePackageManifests(root = process.cwd()) {
  const packageRoot = path.join(root, 'packages');
  const entries = await readdir(packageRoot, { withFileTypes: true });
  const manifests = [];

  for (const entry of entries.sort((left, right) =>
    compareAscii(left.name, right.name)
  )) {
    if (!entry.isDirectory()) continue;
    const directory = `packages/${entry.name}`;
    const manifestPath = path.join(root, directory, 'package.json');
    let source;
    try {
      source = await readFile(manifestPath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    let manifest;
    try {
      manifest = JSON.parse(source);
    } catch (error) {
      throw new Error(`Invalid JSON in ${path.relative(root, manifestPath)}`, {
        cause: error,
      });
    }
    manifests.push(
      Object.freeze({
        directory,
        manifest: Object.freeze(manifest),
        manifestPath,
      })
    );
  }

  return Object.freeze(manifests);
}

export function validatePublicPackageCatalog(catalog) {
  assert.equal(
    catalog?.schemaVersion,
    PUBLIC_PACKAGE_CATALOG_SCHEMA_VERSION,
    `The public package catalog must use schemaVersion ${PUBLIC_PACKAGE_CATALOG_SCHEMA_VERSION}`
  );
  assert.ok(
    Array.isArray(catalog.packages),
    'The public package catalog must contain a packages array'
  );
  assert.ok(
    catalog.packages.length > 0,
    'The public package catalog must not be empty'
  );

  const names = new Set();
  const directories = new Set();
  let previousName = '';

  for (const entry of catalog.packages) {
    assert.deepEqual(
      Object.keys(entry).sort(compareAscii),
      entryKeys,
      `Unexpected catalog fields for ${entry?.name ?? 'unknown package'}`
    );
    assert.match(
      entry.name,
      /^@agentplat\/[a-z0-9]+(?:-[a-z0-9]+)*$/,
      `Invalid public package name: ${entry.name}`
    );
    assert.match(
      entry.directory,
      /^packages\/[a-z0-9]+(?:-[a-z0-9]+)*$/,
      `Invalid public package directory: ${entry.directory}`
    );
    assert.equal(
      path.posix.basename(entry.directory),
      entry.name.slice('@agentplat/'.length),
      `${entry.name} must match its package directory`
    );
    assert.ok(
      PUBLIC_PACKAGE_LAYERS.includes(entry.layer),
      `${entry.name} has an invalid layer`
    );
    for (const field of ['publish', 'providerNeutral', 'packSmoke']) {
      assert.equal(
        typeof entry[field],
        'boolean',
        `${entry.name}.${field} must be boolean`
      );
    }
    assert.ok(
      Array.isArray(entry.browserEntrypoints),
      `${entry.name}.browserEntrypoints must be an array`
    );
    let previousBrowserEntrypoint = '';
    const browserEntrypoints = new Set();
    for (const browserEntrypoint of entry.browserEntrypoints) {
      assert.equal(
        typeof browserEntrypoint,
        'string',
        `${entry.name}.browserEntrypoints entries must be strings`
      );
      assert.match(
        browserEntrypoint,
        /^\.(?:$|\/[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*)$/,
        `${entry.name} has an invalid browser entrypoint: ${browserEntrypoint}`
      );
      assert.ok(
        !browserEntrypoints.has(browserEntrypoint),
        `${entry.name} has a duplicate browser entrypoint: ${browserEntrypoint}`
      );
      assert.ok(
        compareAscii(previousBrowserEntrypoint, browserEntrypoint) < 0,
        `${entry.name}.browserEntrypoints must be sorted in ASCII order`
      );
      browserEntrypoints.add(browserEntrypoint);
      previousBrowserEntrypoint = browserEntrypoint;
    }
    assert.ok(
      !entry.publish || entry.packSmoke,
      `${entry.name} must enable packSmoke when publish is true`
    );
    assert.ok(
      entry.publish || entry.browserEntrypoints.length === 0,
      `${entry.name} must be publishable when browserEntrypoints are declared`
    );
    assert.ok(!names.has(entry.name), `Duplicate package name: ${entry.name}`);
    assert.ok(
      !directories.has(entry.directory),
      `Duplicate package directory: ${entry.directory}`
    );
    assert.ok(
      compareAscii(previousName, entry.name) < 0,
      'Public package catalog entries must be sorted by package name in ASCII order'
    );
    names.add(entry.name);
    directories.add(entry.directory);
    previousName = entry.name;
  }

  return Object.freeze({
    schemaVersion: catalog.schemaVersion,
    packages: Object.freeze(
      catalog.packages.map((entry) =>
        Object.freeze({
          ...entry,
          browserEntrypoints: Object.freeze([...entry.browserEntrypoints]),
        })
      )
    ),
  });
}

export function publishablePackages(catalog) {
  return catalog.packages.filter((entry) => entry.publish);
}

export function packSmokePackages(catalog) {
  return publishablePackages(catalog).filter((entry) => entry.packSmoke);
}

export function compareAscii(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
