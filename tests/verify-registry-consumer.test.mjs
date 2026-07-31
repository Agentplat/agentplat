import assert from 'node:assert/strict';
import test from 'node:test';

import {
  registryConsumerEnvironments,
  registryConsumerManifest,
  REGISTRY_CONSUMER_SCRIPTS,
  REGISTRY_MESH_PACKAGES,
} from '../scripts/verify-registry-consumer.mjs';

test('registry consumer pins every Mesh package to the exact release version', () => {
  const manifest = registryConsumerManifest('0.3.0-alpha.1');
  assert.deepEqual(Object.keys(manifest.dependencies), [
    ...REGISTRY_MESH_PACKAGES,
  ]);
  assert.deepEqual(
    new Set(Object.values(manifest.dependencies)),
    new Set(['0.3.0-alpha.1'])
  );
  assert.equal(manifest.private, true);
  assert.equal(Object.isFrozen(manifest.dependencies), true);
  assert.throws(
    () => registryConsumerManifest('workspace:^'),
    /must be SemVer/u
  );
});

test('registry consumer copies both executable Mesh verification scenarios', () => {
  assert.deepEqual(REGISTRY_CONSUMER_SCRIPTS, [
    {
      source: 'scripts/pack-consumers/mesh-three-peer.mjs',
      destination: 'verify-mesh.mjs',
    },
    {
      source: 'scripts/pack-consumers/mesh-allocation-recovery.mjs',
      destination: 'verify-allocation-recovery.mjs',
    },
  ]);
  assert.equal(Object.isFrozen(REGISTRY_CONSUMER_SCRIPTS), true);
  assert.equal(Object.isFrozen(REGISTRY_CONSUMER_SCRIPTS[0]), true);
});

test('registry consumer isolates install and execution environments', () => {
  const environments = registryConsumerEnvironments(
    {
      PATH: '/usr/bin',
      HTTPS_PROXY: 'https://proxy.example',
      NODE_AUTH_TOKEN: 'secret-node-token',
      NPM_TOKEN: 'secret-npm-token',
      NODE_OPTIONS: '--require ./host-hook.cjs',
      NODE_PATH: '/host/node_modules',
      npm_config_registry: 'https://registry.example',
      NPM_CONFIG_USERCONFIG: '/host/.npmrc',
    },
    '/tmp/consumer/.npmrc'
  );

  assert.deepEqual(environments.execution, {
    PATH: '/usr/bin',
  });
  assert.deepEqual(environments.install, {
    PATH: '/usr/bin',
    HTTPS_PROXY: 'https://proxy.example',
    NPM_CONFIG_USERCONFIG: '/tmp/consumer/.npmrc',
  });
  assert.equal(Object.isFrozen(environments), true);
  assert.equal(Object.isFrozen(environments.execution), true);
  assert.equal(Object.isFrozen(environments.install), true);
});
