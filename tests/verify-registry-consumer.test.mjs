import assert from 'node:assert/strict';
import test from 'node:test';

import {
  registryConsumerEnvironments,
  registryConsumerManifest,
  REGISTRY_ALPHA5_PACKAGES,
  REGISTRY_CONSUMER_SCRIPTS,
  REGISTRY_INFERENCE_CONTROL_PACKAGE,
  REGISTRY_MESH_PACKAGES,
  REGISTRY_PACKAGES,
  REGISTRY_POSTGRES_CONSUMER_SCRIPT,
  REGISTRY_TRUST_PACKAGE,
} from '../scripts/verify-registry-consumer.mjs';

test('registry consumer pins all 36 public packages to the exact release version', () => {
  const manifest = registryConsumerManifest('0.3.0-alpha.1');
  assert.deepEqual(Object.keys(manifest.dependencies), [...REGISTRY_PACKAGES]);
  assert.deepEqual(
    new Set(Object.values(manifest.dependencies)),
    new Set(['0.3.0-alpha.1'])
  );
  assert.equal(manifest.private, true);
  assert.equal(REGISTRY_PACKAGES.length, 36);
  assert.equal(Object.isFrozen(manifest.dependencies), true);
  assert.throws(
    () => registryConsumerManifest('workspace:^'),
    /must be SemVer/u
  );
});

test('registry consumer copies compatibility and conformance scenarios', () => {
  assert.deepEqual(REGISTRY_CONSUMER_SCRIPTS, [
    {
      source: 'scripts/pack-consumers/mesh-three-peer.mjs',
      destination: 'verify-mesh.mjs',
    },
    {
      source: 'scripts/pack-consumers/mesh-allocation-recovery.mjs',
      destination: 'verify-allocation-recovery.mjs',
    },
    {
      source: 'scripts/pack-consumers/inference-control-alpha3.mjs',
      destination: 'verify-inference-control.mjs',
    },
    {
      source: 'scripts/pack-consumers/trust-foundation.mjs',
      destination: 'verify-trust.mjs',
    },
    {
      source: 'scripts/pack-consumers/mesh-adapters-alpha5.mjs',
      destination: 'verify-mesh-adapters.mjs',
    },
    {
      source: 'scripts/pack-consumers/mesh-mixed-version.mjs',
      destination: 'verify-mixed-version.mjs',
    },
    {
      source: 'scripts/pack-consumers/mesh-conformance.mjs',
      destination: 'verify-conformance.mjs',
    },
    {
      source: 'scripts/pack-consumers/collective-control-beta2.mjs',
      destination: 'verify-collective-control.mjs',
    },
  ]);
  assert.equal(Object.isFrozen(REGISTRY_CONSUMER_SCRIPTS), true);
  assert.equal(Object.isFrozen(REGISTRY_CONSUMER_SCRIPTS[0]), true);
  assert.deepEqual(REGISTRY_POSTGRES_CONSUMER_SCRIPT, {
    source: 'scripts/pack-consumers/collective-control-postgres-beta2.mjs',
    destination: 'verify-collective-control-postgres.mjs',
  });
  assert.equal(Object.isFrozen(REGISTRY_POSTGRES_CONSUMER_SCRIPT), true);
  for (const packageName of [
    ...REGISTRY_MESH_PACKAGES,
    ...REGISTRY_ALPHA5_PACKAGES,
    REGISTRY_INFERENCE_CONTROL_PACKAGE,
    REGISTRY_TRUST_PACKAGE,
  ]) {
    assert.equal(REGISTRY_PACKAGES.includes(packageName), true);
  }
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
      PGHOST: '127.0.0.1',
      PGDATABASE: 'agentplat_test',
    },
    '/tmp/consumer/.npmrc'
  );

  assert.deepEqual(environments.execution, {
    PATH: '/usr/bin',
    PGHOST: '127.0.0.1',
    PGDATABASE: 'agentplat_test',
  });
  assert.deepEqual(environments.install, {
    PATH: '/usr/bin',
    PGHOST: '127.0.0.1',
    PGDATABASE: 'agentplat_test',
    HTTPS_PROXY: 'https://proxy.example',
    NPM_CONFIG_USERCONFIG: '/tmp/consumer/.npmrc',
  });
  assert.equal(Object.isFrozen(environments), true);
  assert.equal(Object.isFrozen(environments.execution), true);
  assert.equal(Object.isFrozen(environments.install), true);
});
