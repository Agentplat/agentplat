import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const packageNames = [
  'core',
  'auth',
  'events',
  'audit',
  'tools',
  'mcp',
  'memory',
  'workflows',
  'runtime',
  'provider-openai',
];
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'agentplat-pack-'));
const tarballRoot = path.join(temporaryRoot, 'tarballs');
const consumerRoot = path.join(temporaryRoot, 'consumer');

try {
  for (const packageName of packageNames) {
    execFileSync(
      'corepack',
      ['pnpm', 'pack', '--pack-destination', tarballRoot],
      {
        cwd: path.join(root, 'packages', packageName),
        stdio: 'pipe',
      }
    );
  }

  const tarballs = await readdir(tarballRoot);
  assert.equal(tarballs.length, packageNames.length);

  const dependencies = {};
  for (const packageName of packageNames) {
    const manifest = JSON.parse(
      await readFile(
        path.join(root, 'packages', packageName, 'package.json'),
        'utf8'
      )
    );
    const tarball = `agentplat-${packageName}-${manifest.version}.tgz`;
    assert.ok(tarballs.includes(tarball), `Missing tarball: ${tarball}`);
    dependencies[`@agentplat/${packageName}`] =
      `file:${path.join(tarballRoot, tarball)}`;
  }

  await mkdir(consumerRoot, { recursive: true });
  await writeFile(
    path.join(consumerRoot, 'package.json'),
    `${JSON.stringify({ private: true, type: 'module', dependencies }, null, 2)}\n`
  );
  await writeFile(
    path.join(consumerRoot, 'verify.mjs'),
    "import { DefaultAgentRuntime } from '@agentplat/runtime';\nconst runtime = new DefaultAgentRuntime();\nif (!runtime) process.exit(1);\n"
  );
  execFileSync(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: consumerRoot, stdio: 'pipe' }
  );
  execFileSync(process.execPath, ['verify.mjs'], {
    cwd: consumerRoot,
    stdio: 'pipe',
  });

  console.log(
    `Packed and installed ${tarballs.length} packages in an isolated consumer project.`
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
