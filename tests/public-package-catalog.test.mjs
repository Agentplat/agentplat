import assert from 'node:assert/strict';
import test from 'node:test';
import {
  discoverWorkspacePackageManifests,
  loadPublicPackageCatalog,
  packSmokePackages,
  PUBLIC_PACKAGE_CATALOG_SCHEMA_VERSION,
  publishablePackages,
  validatePublicPackageCatalog,
} from '../scripts/public-package-catalog.mjs';

test('public package catalog is the ordered allowlist for release and pack smoke', async () => {
  const catalog = await loadPublicPackageCatalog();
  const discovered = await discoverWorkspacePackageManifests();
  const publishable = publishablePackages(catalog);
  const packed = packSmokePackages(catalog);

  assert.equal(catalog.schemaVersion, PUBLIC_PACKAGE_CATALOG_SCHEMA_VERSION);
  assert.deepEqual(
    catalog.packages.map((entry) => entry.directory),
    discovered.map((record) => record.directory)
  );
  assert.deepEqual(
    packed.map((entry) => entry.name),
    publishable.map((entry) => entry.name)
  );
  assert.equal(
    new Set(catalog.packages.map((entry) => entry.name)).size,
    discovered.length
  );
  assert.equal(
    new Set(catalog.packages.map((entry) => entry.directory)).size,
    discovered.length
  );
  assert.deepEqual(
    catalog.packages.find((entry) => entry.name === '@agentplat/framework')
      ?.browserEntrypoints,
    ['./browser']
  );
  assert.deepEqual(
    catalog.packages.find((entry) => entry.name === '@agentplat/rooms')
      ?.browserEntrypoints,
    []
  );
});

test('public package catalog rejects accidental fields and unsafe directories', () => {
  const validEntry = {
    browserEntrypoints: ['.'],
    name: '@agentplat/example',
    directory: 'packages/example',
    layer: 'foundation',
    publish: true,
    providerNeutral: true,
    packSmoke: true,
  };

  assert.throws(
    () =>
      validatePublicPackageCatalog({
        schemaVersion: PUBLIC_PACKAGE_CATALOG_SCHEMA_VERSION,
        packages: [{ ...validEntry, unexpected: true }],
      }),
    /Unexpected catalog fields/
  );
  assert.throws(
    () =>
      validatePublicPackageCatalog({
        schemaVersion: PUBLIC_PACKAGE_CATALOG_SCHEMA_VERSION,
        packages: [
          {
            ...validEntry,
            directory: 'packages/../private',
          },
        ],
      }),
    /Invalid public package directory/
  );
});

test('public package catalog requires pack smoke for every published package', () => {
  assert.throws(
    () =>
      validatePublicPackageCatalog({
        schemaVersion: PUBLIC_PACKAGE_CATALOG_SCHEMA_VERSION,
        packages: [
          {
            browserEntrypoints: [],
            directory: 'packages/example',
            layer: 'foundation',
            name: '@agentplat/example',
            packSmoke: false,
            providerNeutral: true,
            publish: true,
          },
        ],
      }),
    /must enable packSmoke/
  );
});

test('public package catalog requires ASCII ordering for packages and browser entrypoints', () => {
  const entry = {
    browserEntrypoints: ['./z', './a'],
    directory: 'packages/example',
    layer: 'foundation',
    name: '@agentplat/example',
    packSmoke: true,
    providerNeutral: true,
    publish: true,
  };

  assert.throws(
    () =>
      validatePublicPackageCatalog({
        schemaVersion: PUBLIC_PACKAGE_CATALOG_SCHEMA_VERSION,
        packages: [entry],
      }),
    /browserEntrypoints must be sorted in ASCII order/
  );
  assert.throws(
    () =>
      validatePublicPackageCatalog({
        schemaVersion: PUBLIC_PACKAGE_CATALOG_SCHEMA_VERSION,
        packages: [
          {
            ...entry,
            browserEntrypoints: [],
            name: '@agentplat/zebra',
            directory: 'packages/zebra',
          },
          {
            ...entry,
            browserEntrypoints: [],
            name: '@agentplat/alpha',
            directory: 'packages/alpha',
          },
        ],
      }),
    /sorted by package name in ASCII order/
  );
});
