import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertBrowserEntrypointGraph,
  assertInternalDependenciesArePublishable,
  extractRuntimeModuleSpecifiers,
  INTERNAL_DEPENDENCY_FIELDS,
  isNodeBuiltinSpecifier,
} from '../scripts/verify-release.mjs';

test('module analysis sees side-effect, bare, dynamic and require imports', () => {
  const specifiers = extractRuntimeModuleSpecifiers(`
    import 'node:fs';
    import fs from 'fs';
    import type { PathLike } from 'node:path';
    const crypto = import('node:crypto');
    const operatingSystem = require('os');
  `);

  assert.deepEqual(specifiers, ['fs', 'node:crypto', 'node:fs', 'os']);
  for (const specifier of specifiers) {
    assert.equal(isNodeBuiltinSpecifier(specifier), true);
  }
  assert.equal(isNodeBuiltinSpecifier('node:sqlite'), true);
  assert.equal(isNodeBuiltinSpecifier('fs/promises'), true);
  assert.equal(isNodeBuiltinSpecifier('fs-extra'), false);
});

test('module analysis rejects computed dynamic imports and require calls', () => {
  for (const [label, source] of [
    ['dynamic import', 'const name = "module"; import(name);'],
    ['require', 'const name = "module"; require(name);'],
  ]) {
    assert.throws(
      () => extractRuntimeModuleSpecifiers(source),
      new RegExp(`non-literal ${label}`)
    );
  }
});

test('all internal dependency sections require a published catalog entry', () => {
  for (const field of INTERNAL_DEPENDENCY_FIELDS) {
    const rootName = '@agentplat/root';
    const dependencyName = '@agentplat/private';
    const packageRecords = new Map([
      [
        rootName,
        {
          manifest: {
            [field]: {
              [dependencyName]: 'workspace:*',
            },
          },
        },
      ],
      [dependencyName, { manifest: {} }],
    ]);
    const catalogEntries = new Map([
      [rootName, { publish: true }],
      [dependencyName, { publish: false }],
    ]);

    assert.throws(
      () =>
        assertInternalDependenciesArePublishable(
          rootName,
          packageRecords,
          catalogEntries
        ),
      new RegExp(`${field} must not reference unpublished workspace package`)
    );
  }
});

test('browser traversal rejects every supported Node.js import form', async (t) => {
  const fixture = await createBrowserFixture();
  t.after(() => rm(fixture.root, { force: true, recursive: true }));

  for (const [label, source] of [
    ['side-effect', "import 'node:fs';"],
    ['bare builtin', "import fs from 'fs'; void fs;"],
    ['dynamic', "void import('node:crypto');"],
    ['require', "const os = require('os'); void os;"],
  ]) {
    await t.test(label, async () => {
      await writeFile(fixture.rootSourcePath, `${source}\n`);
      await assert.rejects(
        () => assertBrowserEntrypointGraph(fixture.graph),
        /must not import Node\.js built-in/
      );
    });
  }
});

test('browser traversal rejects undeclared internal browser subpaths', async (t) => {
  const fixture = await createBrowserFixture({
    rootSource: "import '@agentplat/dependency/browser';\n",
    withDependency: true,
  });
  t.after(() => rm(fixture.root, { force: true, recursive: true }));

  await assert.rejects(
    () => assertBrowserEntrypointGraph(fixture.graph),
    /not declared as a browser entrypoint/
  );
});

test('browser traversal rejects unmodeled external packages', async (t) => {
  const fixture = await createBrowserFixture({
    rootSource: "import 'external-package';\n",
  });
  t.after(() => rm(fixture.root, { force: true, recursive: true }));

  await assert.rejects(
    () => assertBrowserEntrypointGraph(fixture.graph),
    /browser entrypoints are fail-closed/
  );
});

async function createBrowserFixture({
  rootSource = 'export const value = true;\n',
  withDependency = false,
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentplat-browser-gate-'));
  const rootSourcePath = path.join(root, 'packages/root/src/index.ts');
  await mkdir(path.dirname(rootSourcePath), { recursive: true });
  await writeFile(rootSourcePath, rootSource);

  const rootEntry = {
    browserEntrypoints: ['.'],
    name: '@agentplat/root',
    publish: true,
  };
  const rootRecord = {
    directory: 'packages/root',
    manifest: {
      exports: {
        '.': {
          import: './dist/index.js',
        },
      },
    },
  };
  const catalogByName = new Map([[rootEntry.name, rootEntry]]);
  const packageRecordsByName = new Map([[rootEntry.name, rootRecord]]);

  if (withDependency) {
    const dependencySourcePath = path.join(
      root,
      'packages/dependency/src/browser.ts'
    );
    await mkdir(path.dirname(dependencySourcePath), { recursive: true });
    await writeFile(dependencySourcePath, 'export const browser = true;\n');
    const dependencyEntry = {
      browserEntrypoints: [],
      name: '@agentplat/dependency',
      publish: true,
    };
    catalogByName.set(dependencyEntry.name, dependencyEntry);
    packageRecordsByName.set(dependencyEntry.name, {
      directory: 'packages/dependency',
      manifest: {
        exports: {
          './browser': {
            import: './dist/browser.js',
          },
        },
      },
    });
  }

  return {
    graph: {
      catalogByName,
      packageRecordsByName,
      root,
      rootEntrypoint: '.',
      rootPackage: rootEntry.name,
    },
    root,
    rootSourcePath,
  };
}
