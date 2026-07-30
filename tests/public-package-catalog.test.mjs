import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareAscii,
  discoverWorkspacePackageManifests,
  loadPublicPackageCatalog,
  packSmokePackages,
  PUBLIC_PACKAGE_CATALOG_SCHEMA_VERSION,
  publishablePackages,
  validatePublicPackageCatalog,
} from '../scripts/public-package-catalog.mjs';

const alphaOneCatalogEntries = Object.freeze([
  Object.freeze({
    browserEntrypoints: Object.freeze(['.', './loopback']),
    directory: 'packages/mesh',
    layer: 'collaboration',
    name: '@agentplat/mesh',
    packSmoke: true,
    providerNeutral: true,
    publish: true,
  }),
  Object.freeze({
    browserEntrypoints: Object.freeze(['.']),
    directory: 'packages/mesh-crypto',
    layer: 'foundation',
    name: '@agentplat/mesh-crypto',
    packSmoke: true,
    providerNeutral: true,
    publish: true,
  }),
  Object.freeze({
    browserEntrypoints: Object.freeze(['.']),
    directory: 'packages/mesh-protocol',
    layer: 'transport',
    name: '@agentplat/mesh-protocol',
    packSmoke: true,
    providerNeutral: true,
    publish: true,
  }),
  Object.freeze({
    browserEntrypoints: Object.freeze(['.']),
    directory: 'packages/mesh-sim',
    layer: 'testing',
    name: '@agentplat/mesh-sim',
    packSmoke: true,
    providerNeutral: true,
    publish: true,
  }),
]);

test('public package catalog is the ordered allowlist for release and pack smoke', async () => {
  const catalog = await loadPublicPackageCatalog();
  const discovered = await discoverWorkspacePackageManifests();
  const publishable = publishablePackages(catalog);
  const packed = packSmokePackages(catalog);
  const expectedAlphaOneNames = [
    ...new Set([
      ...discovered.map((record) => record.manifest.name),
      ...alphaOneCatalogEntries.map((entry) => entry.name),
    ]),
  ].sort(compareAscii);
  const expectedAlphaOnePackageCount = expectedAlphaOneNames.length;

  assert.equal(catalog.schemaVersion, PUBLIC_PACKAGE_CATALOG_SCHEMA_VERSION);
  assert.deepEqual(
    catalog.packages.map((entry) => entry.name),
    expectedAlphaOneNames
  );
  assert.equal(expectedAlphaOnePackageCount, 28);
  assert.equal(catalog.packages.length, expectedAlphaOnePackageCount);
  assert.deepEqual(
    packed.map((entry) => entry.name),
    publishable.map((entry) => entry.name)
  );
  assert.equal(
    new Set(catalog.packages.map((entry) => entry.name)).size,
    catalog.packages.length
  );
  assert.equal(
    new Set(catalog.packages.map((entry) => entry.directory)).size,
    catalog.packages.length
  );
  for (const expectedEntry of alphaOneCatalogEntries) {
    assert.deepEqual(
      catalog.packages.find((entry) => entry.name === expectedEntry.name),
      expectedEntry
    );
  }
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
