import assert from 'node:assert/strict';
import semver from 'semver';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertPackedInternalDependencyRanges } from './packed-manifest.mjs';
import { discoverWorkspacePackageManifests } from './public-package-catalog.mjs';

const root = process.cwd();
const purposeGovernance = process.argv.includes('--purpose-governance');
const actionControl = process.argv.includes('--action-control');
const optionalJev = process.argv.includes('--optional-jev');
const targets = Object.freeze([
  ...(actionControl ? ['@agentplat/inference-control', '@agentplat/collective-control-postgres'] : []),
  ...(optionalJev ? ['@agentplat/assessor-typesafe'] : []),
  ...(purposeGovernance ? [
    '@agentplat/rooms', '@agentplat/rooms-api',
    '@agentplat/rooms-postgres', '@agentplat/workflows-rooms',
  ] : []),
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
const registryRelease = process.env.AGENTPLAT_PUBLIC_CONSUMER_SOURCE === 'registry';
assert.ok(!purposeGovernance || !registryRelease,
  'Purpose governance currently verifies local tarballs, not an unpublished registry surface');
const registryVersion = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
).version;
assert.ok(!actionControl || !registryRelease || semver.gte(registryVersion, '1.2.0'),
  'Registry action-control consumption requires published 1.2.0 or newer');
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'agentplat-public-consumer-'));
const suppliedTarballRoot = process.env.AGENTPLAT_PREPACKED_TARBALL_DIRECTORY;
const tarballRoot = suppliedTarballRoot
  ? path.resolve(suppliedTarballRoot)
  : path.join(temporaryRoot, 'tarballs');
const consumerRoot = path.join(temporaryRoot, 'consumer');

try {
  await Promise.all([
    ...(suppliedTarballRoot ? [] : [mkdir(tarballRoot, { recursive: true })]),
    mkdir(consumerRoot, { recursive: true }),
  ]);

  const tarballs = new Map();
  for (const name of [...required].sort()) {
    const record = recordsByName.get(name);
    if (registryRelease) {
      tarballs.set(name, registryVersion);
      continue;
    }
    if (!suppliedTarballRoot) {
      execFileSync('corepack', ['pnpm', 'pack', '--pack-destination', tarballRoot], {
        cwd: path.join(root, record.directory),
        stdio: 'pipe',
      });
    }
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
  if (actionControl) {
    await writeFile(path.join(consumerRoot, 'action-control.mjs'),
      await readFile(path.join(root, 'scripts/pack-consumers/action-control.mjs'), 'utf8'));
    execFileSync(process.execPath, ['action-control.mjs'], { cwd: consumerRoot, stdio: 'inherit' });
    for (const name of ['action-approvals', 'action-admission', 'action-effects']) {
      await writeFile(path.join(consumerRoot, `${name}.mts`),
        await readFile(path.join(root, `tests/inference-control-${name}.test.mts`), 'utf8'));
    }
    const config = JSON.parse(await readFile(path.join(consumerRoot, 'tsconfig.json'), 'utf8'));
    config.include.push('*.mts');
    await writeFile(path.join(consumerRoot, 'tsconfig.json'), JSON.stringify(config));
  }
  if(optionalJev){
    await writeFile(path.join(consumerRoot,'optional-jev.mjs'),await readFile(path.join(root,'scripts/pack-consumers/optional-jev.mjs'),'utf8'));
    execFileSync(process.execPath,['optional-jev.mjs'],{cwd:consumerRoot,stdio:'inherit'});
    await writeFile(path.join(consumerRoot,'jev.mts'),await readFile(path.join(root,'tests/assessor-typesafe-public-contracts.test.mts'),'utf8'));
    const tsconfig=JSON.parse(await readFile(path.join(consumerRoot,'tsconfig.json'),'utf8'));tsconfig.include.push('jev.mts');
    await writeFile(path.join(consumerRoot,'tsconfig.json'),JSON.stringify(tsconfig));
  }
  if (purposeGovernance) {
    await writeFile(
      path.join(consumerRoot, "purpose-governance.mjs"),
      await readFile(
        path.join(root, "scripts/pack-consumers/purpose-governance.mjs"),
        "utf8",
      ),
    );
    execFileSync(process.execPath, ["purpose-governance.mjs"], {
      cwd: consumerRoot,
      stdio: "inherit",
    });
    for (const name of [
      "rooms-interaction",
      "rooms-governance",
      "rooms-inception",
      "rooms-attention",
      "rooms-execution",
      "rooms-purpose",
      "rooms-continuity",
    ]) {
      await writeFile(
        path.join(consumerRoot, `${name}.mts`),
        await readFile(
          path.join(root, `tests/${name}-public-contracts.test.mts`),
          "utf8",
        ),
      );
    }
    const tsconfig = JSON.parse(
      await readFile(path.join(consumerRoot, "tsconfig.json"), "utf8"),
    );
    tsconfig.include.push("*.mts");
    await writeFile(
      path.join(consumerRoot, "tsconfig.json"),
      JSON.stringify(tsconfig),
    );
  }
  execFileSync(process.execPath, ['verify-imports.mjs'], { cwd: consumerRoot, stdio: 'inherit' });
  execFileSync(
    process.execPath,
    [path.join(root, 'node_modules/typescript/bin/tsc'), '--project', 'tsconfig.json'],
    { cwd: consumerRoot, stdio: 'inherit' },
  );
  console.log(
    `Verified ${registryRelease ? 'registry' : 'packed'} TypeScript consumer for ${targets.join(', ')} at ${registryVersion}.`,
  );
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
