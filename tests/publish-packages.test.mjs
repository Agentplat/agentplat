import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertPackageTreesEquivalent,
  determineUploadAction,
  extractPackageTarball,
  parseRegistryDistributionTags,
  parseRegistryIntegrityResult,
  PUBLIC_NPM_READ_ARGUMENTS,
  PUBLIC_NPM_REGISTRY_ARGUMENTS,
  stagingTagsForVersion,
  topologicalPackages,
  waitForRegistryBatch,
} from '../scripts/publish-packages.mjs';

test('publisher orders packages by runtime dependencies and rejects cycles', () => {
  const entries = ['app', 'core', 'transport'].map((name) => ({
    name: `@agentplat/${name}`,
  }));
  const manifests = new Map([
    [
      '@agentplat/app',
      {
        dependencies: { '@agentplat/core': 'workspace:^' },
        optionalDependencies: { '@agentplat/transport': 'workspace:^' },
      },
    ],
    ['@agentplat/core', {}],
    ['@agentplat/transport', {}],
  ]);
  assert.deepEqual(
    topologicalPackages(entries, manifests).map((entry) => entry.name),
    ['@agentplat/core', '@agentplat/transport', '@agentplat/app']
  );

  manifests.set('@agentplat/core', {
    peerDependencies: { '@agentplat/app': 'workspace:^' },
  });
  assert.throws(
    () => topologicalPackages(entries, manifests),
    /Public package dependency cycle/
  );
});

test('publisher retry skips only an immutable version with matching integrity', () => {
  const input = {
    localIntegrity: 'sha512-bG9jYWw=',
    packageName: '@agentplat/example',
    version: '1.0.0',
  };
  assert.equal(
    determineUploadAction({ ...input, existingIntegrity: undefined }),
    'publish'
  );
  assert.equal(
    determineUploadAction({
      ...input,
      existingIntegrity: input.localIntegrity,
    }),
    'skip'
  );
  assert.throws(
    () =>
      determineUploadAction({
        ...input,
        existingIntegrity: 'sha512-ZGlmZmVyZW50',
      }),
    /already exists with different integrity/
  );
});

test('publisher parses registry absence and integrity fail-closed', () => {
  const name = '@agentplat/example';
  const version = '1.0.0';
  assert.equal(
    parseRegistryIntegrityResult(
      { status: 1, stdout: '', stderr: 'npm error code E404' },
      name,
      version
    ),
    undefined
  );
  assert.equal(
    parseRegistryIntegrityResult(
      {
        status: 0,
        stdout: '"sha512-bG9jYWw="',
        stderr: '',
      },
      name,
      version
    ),
    'sha512-bG9jYWw='
  );
  assert.throws(
    () =>
      parseRegistryIntegrityResult(
        { status: 1, stdout: '', stderr: 'network unavailable' },
        name,
        version
      ),
    /Unable to inspect/
  );
  assert.throws(
    () =>
      parseRegistryIntegrityResult(
        { status: 0, stdout: 'null', stderr: '' },
        name,
        version
      ),
    /invalid registry integrity/
  );
});

test('publisher authenticates equivalent package trees while ignoring only JSON key order', async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'agentplat-package-tree-')
  );
  const localRoot = path.join(temporaryRoot, 'local');
  const registryRoot = path.join(temporaryRoot, 'registry');
  try {
    await Promise.all([
      mkdir(path.join(localRoot, 'dist'), { recursive: true }),
      mkdir(path.join(registryRoot, 'dist'), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(
        path.join(localRoot, 'package.json'),
        '{"name":"@agentplat/example","dependencies":{"a":"1","b":"2"}}\n'
      ),
      writeFile(
        path.join(registryRoot, 'package.json'),
        '{"dependencies":{"b":"2","a":"1"},"name":"@agentplat/example"}\n'
      ),
      writeFile(path.join(localRoot, 'dist', 'index.js'), 'export {};\n'),
      writeFile(path.join(registryRoot, 'dist', 'index.js'), 'export {};\n'),
    ]);

    await assertPackageTreesEquivalent(localRoot, registryRoot);
    await writeFile(path.join(registryRoot, 'dist', 'index.js'), 'changed\n');
    await assert.rejects(
      assertPackageTreesEquivalent(localRoot, registryRoot),
      /Package file contents differ/
    );

    await writeFile(
      path.join(registryRoot, 'dist', 'index.js'),
      'export {};\n'
    );
    await Promise.all([
      writeFile(
        path.join(localRoot, 'package.json'),
        '{"name":"example","value":9007199254740992}\n'
      ),
      writeFile(
        path.join(registryRoot, 'package.json'),
        '{"value":9007199254740993,"name":"example"}\n'
      ),
    ]);
    await assert.rejects(
      assertPackageTreesEquivalent(localRoot, registryRoot),
      /package.json differs/
    );

    await Promise.all([
      writeFile(path.join(localRoot, 'package.json'), '{"name":"example"}\n'),
      writeFile(
        path.join(registryRoot, 'package.json'),
        '{"name":"example","name":"example"}\n'
      ),
    ]);
    await assert.rejects(
      assertPackageTreesEquivalent(localRoot, registryRoot),
      /Unable to parse package.json/
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('publisher rejects extra entries and symbolic links in recovered package trees', async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'agentplat-package-tree-')
  );
  const localRoot = path.join(temporaryRoot, 'local');
  const registryRoot = path.join(temporaryRoot, 'registry');
  try {
    await Promise.all([
      mkdir(localRoot, { recursive: true }),
      mkdir(registryRoot, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(path.join(localRoot, 'package.json'), '{"name":"example"}\n'),
      writeFile(
        path.join(registryRoot, 'package.json'),
        '{"name":"example"}\n'
      ),
      writeFile(path.join(registryRoot, 'extra.txt'), 'unexpected\n'),
    ]);
    await assert.rejects(
      assertPackageTreesEquivalent(localRoot, registryRoot),
      /package tree differs/i
    );

    await rm(path.join(registryRoot, 'extra.txt'));
    await symlink(
      path.join(registryRoot, 'package.json'),
      path.join(registryRoot, 'linked.json')
    );
    await assert.rejects(
      assertPackageTreesEquivalent(localRoot, registryRoot),
      /must not contain symbolic links/
    );

    await rm(path.join(registryRoot, 'linked.json'));
    await Promise.all([
      chmod(path.join(localRoot, 'package.json'), 0o744),
      chmod(path.join(registryRoot, 'package.json'), 0o711),
    ]);
    await assert.rejects(
      assertPackageTreesEquivalent(localRoot, registryRoot),
      /permission mode differs/
    );

    await Promise.all([
      chmod(path.join(localRoot, 'package.json'), 0o644),
      chmod(path.join(registryRoot, 'package.json'), 0o644),
      writeFile(path.join(localRoot, 'first.txt'), 'same\n'),
      writeFile(path.join(localRoot, 'second.txt'), 'same\n'),
      writeFile(path.join(registryRoot, 'first.txt'), 'same\n'),
    ]);
    await link(
      path.join(registryRoot, 'first.txt'),
      path.join(registryRoot, 'second.txt')
    );
    await assert.rejects(
      assertPackageTreesEquivalent(localRoot, registryRoot),
      /must not contain hard links/
    );

    await Promise.all([
      rm(path.join(localRoot, 'first.txt')),
      rm(path.join(localRoot, 'second.txt')),
      rm(path.join(registryRoot, 'first.txt')),
      rm(path.join(registryRoot, 'second.txt')),
      chmod(localRoot, 0o755),
      chmod(registryRoot, 0o700),
    ]);
    await assert.rejects(
      assertPackageTreesEquivalent(localRoot, registryRoot),
      /permission mode differs/
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('publisher selects every staging tag for the promoted version', () => {
  const name = '@agentplat/example';
  const tags = parseRegistryDistributionTags(
    {
      status: 0,
      stdout: JSON.stringify({
        latest: '0.2.0',
        next: '0.3.0-alpha.1',
        'agentplat-stage-old': '0.3.0-alpha.1',
        'agentplat-stage-current': '0.3.0-alpha.1',
        'agentplat-stage-future': '0.4.0-alpha.1',
      }),
      stderr: '',
    },
    name
  );
  assert.deepEqual(stagingTagsForVersion(tags, '0.3.0-alpha.1'), [
    'agentplat-stage-current',
    'agentplat-stage-old',
  ]);
  assert.throws(
    () =>
      parseRegistryDistributionTags(
        { status: 0, stdout: '[]', stderr: '' },
        name
      ),
    /invalid registry distribution tags/
  );
});

test('publisher pins both global and scoped operations to the public registry', () => {
  assert.deepEqual(PUBLIC_NPM_REGISTRY_ARGUMENTS, [
    '--registry=https://registry.npmjs.org/',
    '--@agentplat:registry=https://registry.npmjs.org/',
  ]);
  assert.equal(Object.isFrozen(PUBLIC_NPM_REGISTRY_ARGUMENTS), true);
  assert.deepEqual(PUBLIC_NPM_READ_ARGUMENTS, [
    ...PUBLIC_NPM_REGISTRY_ARGUMENTS,
    '--prefer-online',
  ]);
  assert.equal(Object.isFrozen(PUBLIC_NPM_READ_ARGUMENTS), true);
});

test('publisher preserves tarball permission modes independently of the process umask', async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'agentplat-tar-mode-')
  );
  const sourceRoot = path.join(temporaryRoot, 'source');
  const packageRoot = path.join(sourceRoot, 'package');
  const extractionRoot = path.join(temporaryRoot, 'extracted');
  const tarballPath = path.join(temporaryRoot, 'package.tgz');
  try {
    await Promise.all([
      mkdir(packageRoot, { recursive: true }),
      mkdir(extractionRoot, { recursive: true }),
    ]);
    await writeFile(path.join(packageRoot, 'package.json'), '{"name":"x"}\n');
    await Promise.all([
      chmod(packageRoot, 0o777),
      chmod(path.join(packageRoot, 'package.json'), 0o777),
    ]);
    const packed = spawnSync(
      'tar',
      ['-czf', tarballPath, '-C', sourceRoot, 'package'],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(packed.status, 0, packed.stderr);

    const previousUmask = process.umask(0o077);
    try {
      extractPackageTarball({
        destination: extractionRoot,
        environment: process.env,
        root: temporaryRoot,
        tarballPath,
      });
    } finally {
      process.umask(previousUmask);
    }

    const [rootStats, manifestStats] = await Promise.all([
      lstat(path.join(extractionRoot, 'package')),
      lstat(path.join(extractionRoot, 'package', 'package.json')),
    ]);
    assert.equal(rootStats.mode & 0o7777, 0o777);
    assert.equal(manifestStats.mode & 0o7777, 0o777);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('publisher verifies registry visibility against one shared batch deadline', async () => {
  const packages = [
    {
      name: '@agentplat/a',
      version: '1.0.0',
      expectedIntegrity: 'sha512-YQ==',
    },
    {
      name: '@agentplat/b',
      version: '1.0.0',
      expectedIntegrity: 'sha512-Yg==',
    },
  ];
  let clock = 0;
  await waitForRegistryBatch({
    packages,
    maximumWaitMs: 10,
    delays: [2],
    now: () => clock,
    sleep: async (milliseconds) => {
      clock += milliseconds;
    },
    lookupIntegrity: ({ name }) =>
      name === '@agentplat/a'
        ? 'sha512-YQ=='
        : clock >= 4
          ? 'sha512-Yg=='
          : undefined,
  });
  assert.equal(clock, 4);

  clock = 0;
  await assert.rejects(
    waitForRegistryBatch({
      packages,
      maximumWaitMs: 5,
      delays: [2],
      now: () => clock,
      sleep: async (milliseconds) => {
        clock += milliseconds;
      },
      lookupIntegrity: () => undefined,
    }),
    /within 5ms: @agentplat\/a, @agentplat\/b/
  );
  assert.equal(clock, 5);
});
