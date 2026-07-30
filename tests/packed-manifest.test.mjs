import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertPackedInternalDependencyRanges,
  PACKED_RUNTIME_DEPENDENCY_FIELDS,
} from '../scripts/packed-manifest.mjs';

test('packed internal runtime dependencies reject workspace-only ranges', () => {
  for (const field of PACKED_RUNTIME_DEPENDENCY_FIELDS) {
    assert.throws(
      () =>
        assertPackedInternalDependencyRanges({
          name: '@agentplat/consumer',
          version: '0.3.0-alpha.1',
          [field]: { '@agentplat/dependency': 'workspace:^' },
        }),
      /registry-compatible semantic version range/u
    );
  }
});

test('packed dependency validation accepts registry ranges and external packages', () => {
  assert.doesNotThrow(() =>
    assertPackedInternalDependencyRanges({
      name: '@agentplat/consumer',
      version: '0.3.0-alpha.1',
      dependencies: {
        '@agentplat/core': '^0.3.0-alpha.1',
        external: 'file:../external',
      },
      optionalDependencies: { '@agentplat/optional': '~0.3.0-alpha.1' },
      peerDependencies: { '@agentplat/peer': '>=0.3.0-alpha.1 <0.4.0' },
    })
  );
  assert.throws(
    () =>
      assertPackedInternalDependencyRanges({
        name: '@agentplat/consumer',
        version: '0.3.0-alpha.1',
        dependencies: [],
      }),
    /must be an object/u
  );
  assert.throws(
    () =>
      assertPackedInternalDependencyRanges({
        name: '@agentplat/consumer',
        version: '0.3.0-alpha.1',
        dependencies: null,
      }),
    /must be an object/u
  );
});

test('packed internal ranges reject local protocols and incompatible versions', () => {
  for (const range of [
    'file:../../packages/core',
    'link:../../packages/core',
    '^999.0.0',
  ]) {
    assert.throws(
      () =>
        assertPackedInternalDependencyRanges({
          name: '@agentplat/consumer',
          version: '0.3.0-alpha.1',
          dependencies: { '@agentplat/core': range },
        }),
      /semantic version range|must include coordinated version/u
    );
  }
});
