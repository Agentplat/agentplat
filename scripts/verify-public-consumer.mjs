import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertPackedInternalDependencyRanges } from './packed-manifest.mjs';
import { discoverWorkspacePackageManifests } from './public-package-catalog.mjs';

const root = process.cwd();
const targets = Object.freeze([
  '@agentplat/collective-runtime',
  '@agentplat/audit',
]);
const dependencyFields = Object.freeze([
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
]);
const records = await discoverWorkspacePackageManifests(root);
const recordsByName = new Map(records.map((record) => [record.manifest.name, record]));
const required = collectInternalClosure(targets, recordsByName);
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'agentplat-public-consumer-'));
const tarballRoot = path.join(temporaryRoot, 'tarballs');
const consumerRoot = path.join(temporaryRoot, 'consumer');

try {
  await Promise.all([
    mkdir(tarballRoot, { recursive: true }),
    mkdir(consumerRoot, { recursive: true }),
  ]);

  const tarballs = new Map();
  for (const name of [...required].sort()) {
    const record = recordsByName.get(name);
    execFileSync('corepack', ['pnpm', 'pack', '--pack-destination', tarballRoot], {
      cwd: path.join(root, record.directory),
      stdio: 'pipe',
    });
    const tarball = expectedTarballName(record.manifest);
    const tarballPath = path.join(tarballRoot, tarball);
    assert.ok((await readdir(tarballRoot)).includes(tarball), `Missing ${tarball}`);
    const packedManifest = JSON.parse(
      execFileSync('tar', ['-xOzf', tarballPath, 'package/package.json'], {
        encoding: 'utf8',
      }),
    );
    assertPackedInternalDependencyRanges(packedManifest);
    tarballs.set(name, `file:${tarballPath}`);
  }

  await writeFile(
    path.join(consumerRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: 'agentplat-public-consumer-smoke',
        version: '1.0.0',
        private: true,
        type: 'module',
        dependencies: Object.fromEntries(
          [...tarballs].sort(([left], [right]) => left.localeCompare(right)),
        ),
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(consumerRoot, 'consumer.ts'),
    [
      'import { createCollective } from "@agentplat/collective-runtime";',
      'import { createMemoryAuditSink } from "@agentplat/audit";',
      '',
      'void createCollective;',
      'const auditSink = createMemoryAuditSink();',
      'void auditSink;',
      '',
    ].join('\n'),
  );
  await writeFile(
    path.join(consumerRoot, 'verify-imports.mjs'),
    [
      'import { createCollective } from "@agentplat/collective-runtime";',
      'import { createMemoryAuditSink } from "@agentplat/audit";',
      'if (typeof createCollective !== "function" || typeof createMemoryAuditSink !== "function") process.exit(1);',
      '',
    ].join('\n'),
  );
  await writeFile(
    path.join(consumerRoot, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          skipLibCheck: false,
        },
        include: ['consumer.ts'],
      },
      null,
      2,
    )}\n`,
  );

  execFileSync(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false'],
    {
      cwd: consumerRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        npm_config_cache: path.join(temporaryRoot, 'npm-cache'),
        npm_config_userconfig: '/dev/null',
      },
    },
  );
  execFileSync(process.execPath, ['verify-imports.mjs'], { cwd: consumerRoot, stdio: 'inherit' });
  execFileSync(
    process.execPath,
    [path.join(root, 'node_modules/typescript/bin/tsc'), '--project', 'tsconfig.json'],
    { cwd: consumerRoot, stdio: 'inherit' },
  );
  console.log(`Verified packed TypeScript consumer for ${targets.join(', ')}.`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

function collectInternalClosure(initialNames, packageRecords) {
  const requiredNames = new Set();
  const pending = [...initialNames];
  while (pending.length > 0) {
    const name = pending.pop();
    if (requiredNames.has(name)) continue;
    const record = packageRecords.get(name);
    assert.ok(record, `Missing workspace package ${name}`);
    requiredNames.add(name);
    for (const field of dependencyFields) {
      for (const dependency of Object.keys(record.manifest[field] ?? {})) {
        if (dependency.startsWith('@agentplat/')) pending.push(dependency);
      }
    }
  }
  return requiredNames;
}

function expectedTarballName(manifest) {
  return `agentplat-${manifest.name.slice('@agentplat/'.length)}-${manifest.version}.tgz`;
}
