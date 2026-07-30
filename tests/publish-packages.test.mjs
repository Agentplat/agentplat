import assert from 'node:assert/strict';
import test from 'node:test';
import {
  determineUploadAction,
  parseRegistryIntegrityResult,
  topologicalPackages,
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
