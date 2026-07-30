import assert from 'node:assert/strict';
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setWorkspaceVersion } from '../scripts/set-version.mjs';

test('set-version updates every manifest through one staged transaction', async (t) => {
  const fixture = await createVersionFixture();
  t.after(() => rm(fixture.root, { force: true, recursive: true }));

  const result = await setWorkspaceVersion('1.1.0-alpha.1', {
    root: fixture.root,
    transactionId: 'success',
  });

  assert.deepEqual(result, {
    packageCount: fixture.packageManifestPaths.length,
    version: '1.1.0-alpha.1',
  });
  for (const manifestPath of fixture.allManifestPaths) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.equal(manifest.version, '1.1.0-alpha.1');
  }
  await assertNoTransactionFiles(fixture.root);
});

test('set-version preflight failure leaves every readable manifest unchanged', async (t) => {
  const fixture = await createVersionFixture({ invalidLastManifest: true });
  t.after(() => rm(fixture.root, { force: true, recursive: true }));
  const originals = new Map();
  for (const manifestPath of fixture.allManifestPaths) {
    originals.set(manifestPath, await readFile(manifestPath, 'utf8'));
  }

  await assert.rejects(
    () =>
      setWorkspaceVersion('1.1.0', {
        root: fixture.root,
        transactionId: 'preflight',
      }),
    /Invalid JSON/
  );

  for (const [manifestPath, original] of originals) {
    assert.equal(await readFile(manifestPath, 'utf8'), original);
  }
  await assertNoTransactionFiles(fixture.root);
});

test('set-version rejects invalid semantic versions before writing files', async (t) => {
  const fixture = await createVersionFixture();
  t.after(() => rm(fixture.root, { force: true, recursive: true }));
  const originals = new Map();
  for (const manifestPath of fixture.allManifestPaths) {
    originals.set(manifestPath, await readFile(manifestPath, 'utf8'));
  }

  await assert.rejects(
    () =>
      setWorkspaceVersion('01.0.0-', {
        root: fixture.root,
        transactionId: 'invalid',
      }),
    /valid semantic versioning/
  );
  for (const [manifestPath, original] of originals) {
    assert.equal(await readFile(manifestPath, 'utf8'), original);
  }
  await assertNoTransactionFiles(fixture.root);
});

test('set-version preflight refuses uncataloged workspace manifests', async (t) => {
  const fixture = await createVersionFixture();
  t.after(() => rm(fixture.root, { force: true, recursive: true }));
  const uncatalogedManifestPath = path.join(
    fixture.root,
    'packages/uncataloged/package.json'
  );
  await mkdir(path.dirname(uncatalogedManifestPath), { recursive: true });
  await writeFile(
    uncatalogedManifestPath,
    `${JSON.stringify(
      { name: '@agentplat/uncataloged', version: '1.0.0' },
      null,
      2
    )}\n`
  );
  const originals = new Map();
  for (const manifestPath of [
    ...fixture.allManifestPaths,
    uncatalogedManifestPath,
  ]) {
    originals.set(manifestPath, await readFile(manifestPath, 'utf8'));
  }

  await assert.rejects(
    () =>
      setWorkspaceVersion('1.1.0', {
        root: fixture.root,
        transactionId: 'uncataloged',
      }),
    /must be cataloged/
  );
  for (const [manifestPath, original] of originals) {
    assert.equal(await readFile(manifestPath, 'utf8'), original);
  }
  await assertNoTransactionFiles(fixture.root);
});

test('set-version restores every original after a mid-commit rename failure', async (t) => {
  const fixture = await createVersionFixture();
  t.after(() => rm(fixture.root, { force: true, recursive: true }));
  const originals = new Map();
  for (const manifestPath of fixture.allManifestPaths) {
    originals.set(manifestPath, await readFile(manifestPath, 'utf8'));
  }

  let renameCall = 0;
  const fileSystem = {
    access,
    readFile,
    async rename(from, to) {
      renameCall += 1;
      if (renameCall === 4) {
        const error = new Error('injected rename failure');
        error.code = 'EIO';
        throw error;
      }
      await rename(from, to);
    },
    stat,
    unlink,
    writeFile,
  };

  await assert.rejects(
    () =>
      setWorkspaceVersion('2.0.0', {
        fileSystem,
        root: fixture.root,
        transactionId: 'rollback',
      }),
    /every changed manifest was restored/
  );

  for (const [manifestPath, original] of originals) {
    assert.equal(await readFile(manifestPath, 'utf8'), original);
  }
  await assertNoTransactionFiles(fixture.root);
});

async function createVersionFixture({ invalidLastManifest = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentplat-version-set-'));
  const packageNames = ['alpha', 'beta'];
  const catalog = {
    schemaVersion: 2,
    packages: packageNames.map((name) => ({
      browserEntrypoints: [],
      directory: `packages/${name}`,
      layer: 'foundation',
      name: `@agentplat/${name}`,
      packSmoke: true,
      providerNeutral: true,
      publish: true,
    })),
  };
  await mkdir(path.join(root, 'config'), { recursive: true });
  await writeFile(
    path.join(root, 'config/public-packages.json'),
    `${JSON.stringify(catalog, null, 2)}\n`
  );

  const rootManifestPath = path.join(root, 'package.json');
  await writeFile(
    rootManifestPath,
    `${JSON.stringify({ name: 'fixture', version: '1.0.0' }, null, 2)}\n`
  );
  const packageManifestPaths = [];
  for (const [index, name] of packageNames.entries()) {
    const manifestPath = path.join(root, `packages/${name}/package.json`);
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(
      manifestPath,
      invalidLastManifest && index === packageNames.length - 1
        ? '{ invalid json\n'
        : `${JSON.stringify(
            { name: `@agentplat/${name}`, version: '1.0.0' },
            null,
            2
          )}\n`
    );
    packageManifestPaths.push(manifestPath);
  }

  return {
    allManifestPaths: [rootManifestPath, ...packageManifestPaths],
    packageManifestPaths,
    root,
  };
}

async function assertNoTransactionFiles(root) {
  const files = await readdir(root, { recursive: true });
  assert.deepEqual(
    files.filter((file) => file.includes('.agentplat-version-')),
    []
  );
}
