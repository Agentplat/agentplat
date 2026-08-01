import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
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
  promoteDistributionTagBatch,
  PUBLIC_NPM_READ_ARGUMENTS,
  PUBLIC_NPM_REGISTRY_ARGUMENTS,
  stagingTagsForVersion,
  topologicalPackages,
  waitForDistributionTagBatch,
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
  const missingResult = {
    status: 1,
    stdout: '',
    stderr: 'npm error code E404',
  };
  assert.deepEqual(
    parseRegistryDistributionTags(missingResult, name, {
      allowMissing: true,
    }),
    {}
  );
  assert.throws(
    () => parseRegistryDistributionTags(missingResult, name),
    /Unable to inspect distribution tags/
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

test('release workflow defaults to dry-run and scopes the npm token to publishing', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/release.yml', import.meta.url),
    'utf8'
  );
  assert.match(
    workflow,
    /dry_run:\n(?: {8}.+\n)* {8}default: true\n {8}type: boolean/
  );
  assert.match(workflow, /name: Dry-run package publication/);
  assert.match(workflow, /name: Publish packages/);
  assert.equal(workflow.match(/NODE_AUTH_TOKEN:/g)?.length, 1);
  assert.match(
    workflow,
    /actions\/checkout@[0-9a-f]{40} # v7[\s\S]+actions\/setup-node@[0-9a-f]{40} # v7/
  );
  assert.match(
    workflow,
    /concurrency:\n {2}group: release-packages\n {2}cancel-in-progress: false/
  );

  const verificationStep = workflow.slice(
    workflow.indexOf('name: Run release audit and full verification'),
    workflow.indexOf('name: Dry-run package publication')
  );
  const dryRunStep = workflow.slice(
    workflow.indexOf('name: Dry-run package publication'),
    workflow.indexOf('name: Publish packages')
  );
  const publishStep = workflow.slice(
    workflow.indexOf('name: Publish packages'),
    workflow.indexOf('name: Verify exact packages')
  );
  assert.doesNotMatch(verificationStep, /NODE_AUTH_TOKEN/);
  assert.doesNotMatch(dryRunStep, /NODE_AUTH_TOKEN/);
  assert.match(verificationStep, /NPM_CONFIG_USERCONFIG: \/dev\/null/);
  assert.match(dryRunStep, /NPM_CONFIG_USERCONFIG: \/dev\/null/);
  assert.match(publishStep, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/);
  assert.doesNotMatch(publishStep, /NPM_CONFIG_USERCONFIG: \/dev\/null/);
  assert.match(
    workflow,
    /name: Verify exact packages from a PostgreSQL durable registry consumer[\s\S]+AGENTPLAT_REGISTRY_CONSUMER_PROFILE: postgres/
  );
  assert.equal(
    workflow.match(/NPM_CONFIG_USERCONFIG: \/dev\/null/g)?.length,
    6
  );
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

test('publisher verifies coordinated distribution tags against one shared deadline', async () => {
  const packages = [
    {
      name: '@agentplat/a',
      tag: 'next',
      expectedVersion: '1.0.0',
    },
    {
      name: '@agentplat/b',
      tag: 'next',
      expectedVersion: '1.0.0',
    },
  ];
  let clock = 0;
  await waitForDistributionTagBatch({
    packages,
    maximumWaitMs: 10,
    delays: [2],
    now: () => clock,
    sleep: async (milliseconds) => {
      clock += milliseconds;
    },
    lookupTags: ({ name }) => ({
      next: name === '@agentplat/a' || clock >= 4 ? '1.0.0' : '0.9.0',
    }),
  });
  assert.equal(clock, 4);

  clock = 0;
  await assert.rejects(
    waitForDistributionTagBatch({
      packages,
      maximumWaitMs: 5,
      delays: [2],
      now: () => clock,
      sleep: async (milliseconds) => {
        clock += milliseconds;
      },
      lookupTags: () => ({ next: '0.9.0' }),
    }),
    /within 5ms: @agentplat\/a, @agentplat\/b/
  );
  assert.equal(clock, 5);
});

test('publisher restores every previous distribution tag after partial promotion', async () => {
  const packages = [
    { name: '@agentplat/a', version: '1.0.0' },
    { name: '@agentplat/b', version: '1.0.0' },
  ];
  const previousTargets = new Map([
    ['@agentplat/a', '0.9.0'],
    ['@agentplat/b', undefined],
  ]);
  const registryTags = new Map([
    ['@agentplat/a', { next: '0.9.0' }],
    ['@agentplat/b', {}],
  ]);
  const removed = [];

  await assert.rejects(
    promoteDistributionTagBatch({
      packages,
      previousTargets,
      tag: 'next',
      addTag: ({ name, tag, version }) => {
        registryTags.get(name)[tag] = version;
        if (name === '@agentplat/b' && version === '1.0.0') {
          throw new Error('simulated partial promotion');
        }
      },
      removeTag: ({ name, tag }) => {
        delete registryTags.get(name)[tag];
        removed.push(`${name}:${tag}`);
      },
      lookupTags: ({ name }) => ({ ...registryTags.get(name) }),
      waitOptions: {
        maximumWaitMs: 5,
        delays: [1],
      },
    }),
    (error) => {
      assert.equal(error instanceof AggregateError, true);
      assert.match(error.message, /restored every previous/);
      assert.match(error.errors[0].message, /simulated partial promotion/);
      return true;
    }
  );

  assert.deepEqual(registryTags.get('@agentplat/a'), { next: '0.9.0' });
  assert.deepEqual(registryTags.get('@agentplat/b'), {});
  assert.deepEqual(removed, ['@agentplat/b:next']);
});

test('publisher aborts before promotion when a rollback target has drifted', async () => {
  const packages = [
    { name: '@agentplat/a', version: '1.0.0' },
    { name: '@agentplat/b', version: '1.0.0' },
  ];
  const previousTargets = new Map([
    ['@agentplat/a', '0.9.0'],
    ['@agentplat/b', '0.9.0'],
  ]);
  const registryTags = new Map([
    ['@agentplat/a', { next: '0.9.1-external' }],
    ['@agentplat/b', { next: '0.9.0' }],
  ]);
  let mutationCount = 0;

  await assert.rejects(
    promoteDistributionTagBatch({
      packages,
      previousTargets,
      tag: 'next',
      addTag: () => {
        mutationCount += 1;
      },
      removeTag: () => {
        mutationCount += 1;
      },
      lookupTags: ({ name }) => ({ ...registryTags.get(name) }),
    }),
    /changed after rollback targets were recorded/
  );

  assert.equal(mutationCount, 0);
  assert.deepEqual(registryTags.get('@agentplat/a'), {
    next: '0.9.1-external',
  });
});

test('publisher never overwrites concurrent tag drift during rollback', async () => {
  const packages = [
    { name: '@agentplat/a', version: '1.0.0' },
    { name: '@agentplat/b', version: '1.0.0' },
  ];
  const previousTargets = new Map([
    ['@agentplat/a', '0.9.0'],
    ['@agentplat/b', '0.9.0'],
  ]);
  const registryTags = new Map([
    ['@agentplat/a', { next: '0.9.0' }],
    ['@agentplat/b', { next: '0.9.0' }],
  ]);
  let clock = 0;

  await assert.rejects(
    promoteDistributionTagBatch({
      packages,
      previousTargets,
      tag: 'next',
      addTag: ({ name, tag, version }) => {
        registryTags.get(name)[tag] = version;
        if (name === '@agentplat/b' && version === '1.0.0') {
          registryTags.get('@agentplat/a').next = '0.9.1-external';
          throw new Error('simulated concurrent change');
        }
      },
      removeTag: ({ name, tag }) => {
        delete registryTags.get(name)[tag];
      },
      lookupTags: ({ name }) => ({ ...registryTags.get(name) }),
      waitOptions: {
        maximumWaitMs: 1,
        delays: [1],
        now: () => clock,
        sleep: async (milliseconds) => {
          clock += milliseconds;
        },
      },
    }),
    (error) => {
      assert.equal(error instanceof AggregateError, true);
      assert.match(
        error.message,
        /rollback operation or verification failures/
      );
      assert.equal(
        error.errors.some((entry) =>
          /Refusing to overwrite concurrent next target/.test(entry.message)
        ),
        true
      );
      return true;
    }
  );

  assert.deepEqual(registryTags.get('@agentplat/a'), {
    next: '0.9.1-external',
  });
  assert.deepEqual(registryTags.get('@agentplat/b'), { next: '0.9.0' });
});
