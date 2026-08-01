import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import semver from 'semver';
import { assertReleaseLine } from './release-line.mjs';

export const REGISTRY_MESH_PACKAGES = Object.freeze([
  '@agentplat/mesh',
  '@agentplat/mesh-crypto',
  '@agentplat/mesh-protocol',
  '@agentplat/mesh-sim',
]);
export const REGISTRY_INFERENCE_CONTROL_PACKAGE =
  '@agentplat/inference-control';
export const REGISTRY_TRUST_PACKAGE = '@agentplat/trust';
export const REGISTRY_ALPHA5_PACKAGES = Object.freeze([
  '@agentplat/mesh-http',
  '@agentplat/mesh-postgres',
  '@agentplat/rooms-mesh',
]);
export const REGISTRY_PACKAGES = Object.freeze([
  ...REGISTRY_MESH_PACKAGES,
  REGISTRY_INFERENCE_CONTROL_PACKAGE,
  REGISTRY_TRUST_PACKAGE,
  ...REGISTRY_ALPHA5_PACKAGES,
]);

export const REGISTRY_CONSUMER_SCRIPTS = Object.freeze([
  Object.freeze({
    source: 'scripts/pack-consumers/mesh-three-peer.mjs',
    destination: 'verify-mesh.mjs',
  }),
  Object.freeze({
    source: 'scripts/pack-consumers/mesh-allocation-recovery.mjs',
    destination: 'verify-allocation-recovery.mjs',
  }),
  Object.freeze({
    source: 'scripts/pack-consumers/inference-control-alpha3.mjs',
    destination: 'verify-inference-control.mjs',
  }),
  Object.freeze({
    source: 'scripts/pack-consumers/trust-foundation.mjs',
    destination: 'verify-trust.mjs',
  }),
  Object.freeze({
    source: 'scripts/pack-consumers/mesh-adapters-alpha5.mjs',
    destination: 'verify-mesh-adapters.mjs',
  }),
]);

const RUNTIME_ENVIRONMENT_KEYS = new Set([
  'COMSPEC',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'TMPDIR',
  'WINDIR',
]);
const INSTALL_ENVIRONMENT_KEYS = new Set([
  ...RUNTIME_ENVIRONMENT_KEYS,
  'ALL_PROXY',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NODE_EXTRA_CA_CERTS',
  'NO_PROXY',
  'SSL_CERT_FILE',
]);

export function registryConsumerManifest(version) {
  assert.ok(semver.valid(version), 'Registry consumer version must be SemVer');
  return Object.freeze({
    name: 'agentplat-registry-release-consumer',
    version: '1.0.0',
    private: true,
    type: 'module',
    packageManager: 'pnpm@8.10.0',
    dependencies: Object.freeze(
      Object.fromEntries(
        REGISTRY_PACKAGES.map((packageName) => [packageName, version]),
      ),
    ),
    devDependencies: Object.freeze({
      '@types/node': '^20.10.0',
      typescript: '^5.3.0',
    }),
  });
}

export function registryConsumerEnvironments(environment, userConfigPath) {
  assert.ok(
    path.isAbsolute(userConfigPath),
    'Registry consumer npm configuration path must be absolute',
  );

  const execution = Object.freeze(
    selectEnvironment(environment, RUNTIME_ENVIRONMENT_KEYS),
  );
  const install = Object.freeze({
    ...selectEnvironment(environment, INSTALL_ENVIRONMENT_KEYS),
    NPM_CONFIG_USERCONFIG: userConfigPath,
  });

  return Object.freeze({ execution, install });
}

export async function verifyRegistryConsumer({
  environment = process.env,
  root = process.cwd(),
} = {}) {
  const rootManifest = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8'),
  );
  await assertReleaseLine({ root, rootManifest });
  const manifest = registryConsumerManifest(rootManifest.version);
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'agentplat-registry-consumer-'),
  );
  const npmConfigurationPath = path.join(temporaryRoot, '.npmrc');
  const cleanEnvironments = registryConsumerEnvironments(
    environment,
    npmConfigurationPath,
  );

  try {
    await Promise.all([
      writeFile(
        path.join(temporaryRoot, 'package.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
      ),
      writeFile(
        npmConfigurationPath,
        [
          'registry=https://registry.npmjs.org/',
          '@agentplat:registry=https://registry.npmjs.org/',
          'node-linker=isolated',
          'hoist=false',
          'strict-peer-dependencies=true',
          '',
        ].join('\n'),
      ),
      writeFile(
        path.join(temporaryRoot, 'tsconfig.json'),
        `${JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2022',
              module: 'NodeNext',
              moduleResolution: 'NodeNext',
              strict: true,
              noEmit: true,
              skipLibCheck: false,
              types: ['node'],
              lib: ['ES2022', 'DOM'],
            },
            include: [
              'verify-types.ts',
              'verify-inference-control-types.ts',
              'verify-mesh-adapters-types.ts',
            ],
          },
          null,
          2,
        )}\n`,
      ),
      copyFile(
        path.join(root, 'scripts/pack-consumers/mesh-types.ts'),
        path.join(temporaryRoot, 'verify-types.ts'),
      ),
      copyFile(
        path.join(root, 'scripts/pack-consumers/inference-control-types.ts'),
        path.join(temporaryRoot, 'verify-inference-control-types.ts'),
      ),
      copyFile(
        path.join(root, 'scripts/pack-consumers/mesh-adapters-alpha5-types.ts'),
        path.join(temporaryRoot, 'verify-mesh-adapters-types.ts'),
      ),
      ...REGISTRY_CONSUMER_SCRIPTS.map(({ source, destination }) =>
        copyFile(
          path.join(root, source),
          path.join(temporaryRoot, destination),
        ),
      ),
      mkdir(path.join(temporaryRoot, 'store'), { recursive: true }),
    ]);

    execFileSync(
      'corepack',
      [
        'pnpm',
        'install',
        '--ignore-scripts',
        '--no-frozen-lockfile',
        '--registry=https://registry.npmjs.org/',
        '--store-dir',
        path.join(temporaryRoot, 'store'),
      ],
      {
        cwd: temporaryRoot,
        env: cleanEnvironments.install,
        stdio: 'inherit',
      },
    );
    execFileSync(
      process.execPath,
      [
        path.join(temporaryRoot, 'node_modules/typescript/bin/tsc'),
        '--project',
        'tsconfig.json',
      ],
      {
        cwd: temporaryRoot,
        env: cleanEnvironments.execution,
        stdio: 'inherit',
      },
    );
    execFileSync(process.execPath, ['verify-mesh.mjs'], {
      cwd: temporaryRoot,
      env: cleanEnvironments.execution,
      stdio: 'inherit',
    });
    execFileSync(process.execPath, ['verify-allocation-recovery.mjs'], {
      cwd: temporaryRoot,
      env: cleanEnvironments.execution,
      stdio: 'inherit',
    });
    execFileSync(process.execPath, ['verify-inference-control.mjs'], {
      cwd: temporaryRoot,
      env: cleanEnvironments.execution,
      stdio: 'inherit',
    });
    execFileSync(process.execPath, ['verify-trust.mjs'], {
      cwd: temporaryRoot,
      env: cleanEnvironments.execution,
      stdio: 'inherit',
    });
    execFileSync(process.execPath, ['verify-mesh-adapters.mjs'], {
      cwd: temporaryRoot,
      env: cleanEnvironments.execution,
      stdio: 'inherit',
    });

    console.log(
      `Verified ${REGISTRY_PACKAGES.length} exact registry packages at ${rootManifest.version} from an independent clean consumer.`,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function selectEnvironment(environment, allowedKeys) {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([key, value]) =>
        typeof value === 'string' && allowedKeys.has(key.toUpperCase()),
    ),
  );
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    await verifyRegistryConsumer();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
