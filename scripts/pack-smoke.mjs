import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runPublicAudit } from './audit-public.mjs';
import {
  loadPublicPackageCatalog,
  packSmokePackages,
} from './public-package-catalog.mjs';
import { loadExternalTerminologyDenylist } from './public-audit-terminology.mjs';
import { assertPackedInternalDependencyRanges } from './packed-manifest.mjs';
import { assertInferenceControlReleaseLine } from './inference-control-release-line.mjs';

const root = process.cwd();
const catalog = await loadPublicPackageCatalog(root);
await assertInferenceControlReleaseLine({ root, catalog });
const packageEntries = packSmokePackages(catalog);
const pnpmStoreDirectory = execFileSync('corepack', ['pnpm', 'store', 'path'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const blockedTerms = await loadExternalTerminologyDenylist({
  root,
  filePath: process.env.AGENTPLAT_PUBLIC_DENYLIST_FILE,
});
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'agentplat-pack-'));
const tarballRoot = path.join(temporaryRoot, 'tarballs');
const extractionRoot = path.join(temporaryRoot, 'extracted');
const consumerRoot = path.join(temporaryRoot, 'consumer');

try {
  await Promise.all([
    mkdir(tarballRoot, { recursive: true }),
    mkdir(extractionRoot, { recursive: true }),
  ]);

  for (const packageEntry of packageEntries) {
    execFileSync(
      'corepack',
      ['pnpm', 'pack', '--pack-destination', tarballRoot],
      {
        cwd: path.join(root, packageEntry.directory),
        stdio: 'pipe',
      },
    );
  }

  const tarballs = (await readdir(tarballRoot)).sort();
  assert.equal(tarballs.length, packageEntries.length);

  const overrides = {};
  const packedArtifacts = [];
  for (const packageEntry of packageEntries) {
    const sourceManifest = JSON.parse(
      await readFile(
        path.join(root, packageEntry.directory, 'package.json'),
        'utf8',
      ),
    );
    assert.equal(sourceManifest.name, packageEntry.name);
    const tarball = expectedTarballName(sourceManifest);
    assert.ok(tarballs.includes(tarball), `Missing tarball: ${tarball}`);
    const tarballPath = path.join(tarballRoot, tarball);
    const packageExtractionRoot = path.join(
      extractionRoot,
      packageEntry.name.slice('@agentplat/'.length),
    );
    await mkdir(packageExtractionRoot, { recursive: true });
    assertSafeTarballPaths(tarballPath);
    execFileSync('tar', ['-xzf', tarballPath, '-C', packageExtractionRoot], {
      stdio: 'pipe',
    });
    assert.deepEqual(
      (await readdir(packageExtractionRoot)).sort(),
      ['package'],
      `${packageEntry.name} tarball must contain only the package root`,
    );
    const extractedPackageRoot = path.join(packageExtractionRoot, 'package');
    const packedManifest = JSON.parse(
      await readFile(path.join(extractedPackageRoot, 'package.json'), 'utf8'),
    );
    assert.equal(packedManifest.name, packageEntry.name);
    assert.equal(packedManifest.version, sourceManifest.version);
    assertPackedInternalDependencyRanges(packedManifest);
    await runPublicAudit({
      root: extractedPackageRoot,
      blockedTerms,
      excludedDirectories: [],
      excludedFiles: [],
    });

    const tarballReference = `file:${tarballPath}`;
    overrides[packageEntry.name] = tarballReference;
    packedArtifacts.push({
      directoryName: packageEntry.name.slice('@agentplat/'.length),
      importSpecifiers: declaredImportSpecifiers(packedManifest),
      packageEntry,
      tarballReference,
    });
  }

  const packageConsumerRoot = path.join(consumerRoot, 'consumers');
  const functionalConsumerRoot = path.join(consumerRoot, 'functional');
  const meshScenarioConsumerRoot = path.join(consumerRoot, 'mesh-three-peer');
  const meshAllocationRecoveryConsumerRoot = path.join(
    consumerRoot,
    'mesh-allocation-recovery',
  );
  const typeScriptConsumerRoot = path.join(consumerRoot, 'typescript');
  const inferenceControlConsumerRoot = path.join(
    consumerRoot,
    'inference-control',
  );
  await Promise.all([
    mkdir(packageConsumerRoot, { recursive: true }),
    mkdir(functionalConsumerRoot, { recursive: true }),
    mkdir(meshScenarioConsumerRoot, { recursive: true }),
    mkdir(meshAllocationRecoveryConsumerRoot, { recursive: true }),
    mkdir(typeScriptConsumerRoot, { recursive: true }),
    mkdir(inferenceControlConsumerRoot, { recursive: true }),
  ]);
  const workspaceWrites = [
    writeFile(
      path.join(consumerRoot, 'package.json'),
      `${JSON.stringify(
        {
          name: 'agentplat-pack-smoke-workspace',
          private: true,
          packageManager: 'pnpm@8.10.0',
          pnpm: { overrides },
        },
        null,
        2,
      )}\n`,
    ),
    writeFile(
      path.join(consumerRoot, '.npmrc'),
      [
        'node-linker=isolated',
        'hoist=false',
        'strict-peer-dependencies=true',
        '',
      ].join('\n'),
    ),
    writeFile(
      path.join(consumerRoot, 'pnpm-workspace.yaml'),
      [
        'packages:',
        "  - 'consumers/*'",
        "  - 'functional'",
        "  - 'mesh-three-peer'",
        "  - 'mesh-allocation-recovery'",
        "  - 'typescript'",
        "  - 'inference-control'",
        '',
      ].join('\n'),
    ),
  ];

  for (const artifact of packedArtifacts) {
    const packageRoot = path.join(packageConsumerRoot, artifact.directoryName);
    await mkdir(packageRoot, { recursive: true });
    workspaceWrites.push(
      writeFile(
        path.join(packageRoot, 'package.json'),
        `${JSON.stringify(
          {
            name: `agentplat-pack-smoke-${artifact.directoryName}`,
            version: '1.0.0',
            private: true,
            type: 'module',
            dependencies: {
              [artifact.packageEntry.name]: artifact.tarballReference,
            },
          },
          null,
          2,
        )}\n`,
      ),
      writeFile(
        path.join(packageRoot, 'verify-imports.mjs'),
        importVerificationSource(artifact.importSpecifiers),
      ),
    );
  }

  const functionalDependencies = Object.fromEntries(
    packedArtifacts.map((artifact) => [
      artifact.packageEntry.name,
      artifact.tarballReference,
    ]),
  );
  const meshPackageNames = Object.freeze([
    '@agentplat/mesh',
    '@agentplat/mesh-crypto',
    '@agentplat/mesh-protocol',
    '@agentplat/mesh-sim',
  ]);
  const artifactsByName = new Map(
    packedArtifacts.map((artifact) => [artifact.packageEntry.name, artifact]),
  );
  const meshDependencies = Object.fromEntries(
    meshPackageNames.map((packageName) => {
      const artifact = artifactsByName.get(packageName);
      assert.ok(artifact, `Missing packed Mesh dependency: ${packageName}`);
      return [packageName, artifact.tarballReference];
    }),
  );
  const inferenceControlArtifact = artifactsByName.get(
    '@agentplat/inference-control',
  );
  assert.ok(
    inferenceControlArtifact,
    'Missing packed inference-control dependency',
  );
  workspaceWrites.push(
    writeFile(
      path.join(functionalConsumerRoot, 'package.json'),
      `${JSON.stringify(
        {
          name: 'agentplat-pack-smoke-functional',
          version: '1.0.0',
          private: true,
          type: 'module',
          dependencies: functionalDependencies,
        },
        null,
        2,
      )}\n`,
    ),
    writeFile(
      path.join(functionalConsumerRoot, 'verify-functional.mjs'),
      [
        "import { AgentPlat } from '@agentplat/framework';",
        "import { InMemoryRoomRepository, RoomService } from '@agentplat/rooms';",
        "import { DefaultAgentRuntime } from '@agentplat/runtime';",
        "import { MockAgentProvider } from '@agentplat/runtime-mock';",
        "import { createMultiAgentSession } from '@agentplat/sessions';",
        "import { streamToSSE } from '@agentplat/streaming';",
        'const runtime = new DefaultAgentRuntime();',
        'const service = new RoomService({ repository: new InMemoryRoomRepository(), runtime });',
        "const adapter = { id: 'consumer', capabilities: { streaming: false, tools: false, structuredOutput: false, vision: false }, generate: async () => ({ content: 'ok', finishReason: 'stop' }) };",
        "const result = await AgentPlat.quickRun({ adapter, instructions: 'Test', input: 'hello' });",
        'const mockRuntime = new DefaultAgentRuntime();',
        "mockRuntime.registerProvider('mock', new MockAgentProvider({ responsesByAgent: { a: ['A'], b: ['B'] } }));",
        "const session = createMultiAgentSession({ runtime: mockRuntime, maxRounds: 1, speakers: [{ id: 'a', name: 'A', instructions: 'A', platform: 'mock' }, { id: 'b', name: 'B', instructions: 'B', platform: 'mock' }] });",
        "const sessionResult = await session.run({ input: 'test' });",
        "async function* events() { yield { type: 'completed', content: result.output }; }",
        'const response = streamToSSE(events());',
        "if (!service || result.output !== 'ok' || sessionResult.turnsCompleted !== 2 || !response.headers.get('content-type')?.startsWith('text/event-stream')) process.exit(1);",
        '',
      ].join('\n'),
    ),
    writeFile(
      path.join(typeScriptConsumerRoot, 'package.json'),
      `${JSON.stringify(
        {
          name: 'agentplat-pack-smoke-typescript',
          version: '1.0.0',
          private: true,
          type: 'module',
          dependencies: meshDependencies,
        },
        null,
        2,
      )}\n`,
    ),
    writeFile(
      path.join(typeScriptConsumerRoot, 'tsconfig.json'),
      `${JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            strict: true,
            noEmit: true,
            skipLibCheck: false,
            types: [],
            lib: ['ES2022', 'DOM'],
          },
          include: ['verify-types.ts'],
        },
        null,
        2,
      )}\n`,
    ),
    copyFile(
      path.join(root, 'scripts/pack-consumers/mesh-types.ts'),
      path.join(typeScriptConsumerRoot, 'verify-types.ts'),
    ),
    writeFile(
      path.join(inferenceControlConsumerRoot, 'package.json'),
      `${JSON.stringify({ name: 'agentplat-pack-smoke-inference-control', version: '1.0.0', private: true, type: 'module', dependencies: { '@agentplat/inference-control': inferenceControlArtifact.tarballReference } }, null, 2)}\n`,
    ),
    writeFile(
      path.join(inferenceControlConsumerRoot, 'tsconfig.json'),
      `${JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, skipLibCheck: false, types: [], lib: ['ES2022', 'DOM'] }, include: ['verify-types.ts'] }, null, 2)}\n`,
    ),
    copyFile(
      path.join(root, 'scripts/pack-consumers/inference-control-types.ts'),
      path.join(inferenceControlConsumerRoot, 'verify-types.ts'),
    ),
    copyFile(
      path.join(root, 'scripts/pack-consumers/inference-control-alpha3.mjs'),
      path.join(inferenceControlConsumerRoot, 'verify-inference-control.mjs'),
    ),
    writeFile(
      path.join(meshScenarioConsumerRoot, 'package.json'),
      `${JSON.stringify(
        {
          name: 'agentplat-pack-smoke-mesh-three-peer',
          version: '1.0.0',
          private: true,
          type: 'module',
          dependencies: meshDependencies,
        },
        null,
        2,
      )}\n`,
    ),
    copyFile(
      path.join(root, 'scripts/pack-consumers/mesh-three-peer.mjs'),
      path.join(meshScenarioConsumerRoot, 'verify-mesh.mjs'),
    ),
    writeFile(
      path.join(meshAllocationRecoveryConsumerRoot, 'package.json'),
      `${JSON.stringify(
        {
          name: 'agentplat-pack-smoke-mesh-allocation-recovery',
          version: '1.0.0',
          private: true,
          type: 'module',
          dependencies: meshDependencies,
        },
        null,
        2,
      )}\n`,
    ),
    copyFile(
      path.join(root, 'scripts/pack-consumers/mesh-allocation-recovery.mjs'),
      path.join(
        meshAllocationRecoveryConsumerRoot,
        'verify-allocation-recovery.mjs',
      ),
    ),
  );
  await Promise.all(workspaceWrites);

  execFileSync(
    'corepack',
    [
      'pnpm',
      'install',
      '--ignore-scripts',
      '--no-frozen-lockfile',
      '--prefer-offline',
      '--store-dir',
      pnpmStoreDirectory,
    ],
    {
      cwd: consumerRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        npm_config_cache: path.join(temporaryRoot, 'npm-cache'),
      },
    },
  );
  for (const artifact of packedArtifacts) {
    execFileSync(process.execPath, ['verify-imports.mjs'], {
      cwd: path.join(packageConsumerRoot, artifact.directoryName),
      stdio: 'inherit',
    });
  }
  execFileSync(
    process.execPath,
    [
      path.join(root, 'node_modules/typescript/bin/tsc'),
      '--project',
      'tsconfig.json',
    ],
    {
      cwd: typeScriptConsumerRoot,
      stdio: 'inherit',
    },
  );
  execFileSync(process.execPath, ['verify-mesh.mjs'], {
    cwd: meshScenarioConsumerRoot,
    stdio: 'inherit',
  });
  execFileSync(process.execPath, ['verify-allocation-recovery.mjs'], {
    cwd: meshAllocationRecoveryConsumerRoot,
    stdio: 'inherit',
  });
  execFileSync(
    process.execPath,
    [
      path.join(root, 'node_modules/typescript/bin/tsc'),
      '--project',
      'tsconfig.json',
    ],
    {
      cwd: inferenceControlConsumerRoot,
      stdio: 'inherit',
    },
  );
  execFileSync(process.execPath, ['verify-inference-control.mjs'], {
    cwd: inferenceControlConsumerRoot,
    stdio: 'inherit',
  });
  execFileSync(process.execPath, ['verify-functional.mjs'], {
    cwd: functionalConsumerRoot,
    stdio: 'inherit',
  });

  const importedExportCount = packedArtifacts.reduce(
    (total, artifact) => total + artifact.importSpecifiers.length,
    0,
  );
  console.log(
    `Audited ${tarballs.length} tarballs, imported ${importedExportCount} exports, compiled the packed TypeScript declarations, replayed the signed three-peer scenario, and verified allocation plus recovery fencing before the unchanged functional smoke test.`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

function expectedTarballName(manifest) {
  const packageName = manifest.name.slice('@agentplat/'.length);
  return `agentplat-${packageName}-${manifest.version}.tgz`;
}

function assertSafeTarballPaths(tarballPath) {
  const entries = execFileSync('tar', ['-tzf', tarballPath], {
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .filter(Boolean);
  assert.ok(entries.length > 0, `${tarballPath} must not be empty`);
  for (const entry of entries) {
    const normalized = entry.replace(/\/+$/g, '');
    assert.equal(
      path.posix.isAbsolute(normalized),
      false,
      `Unsafe absolute path in package tarball: ${entry}`,
    );
    assert.equal(
      normalized.split('/').includes('..'),
      false,
      `Unsafe parent traversal in package tarball: ${entry}`,
    );
    assert.ok(
      normalized === 'package' || normalized.startsWith('package/'),
      `Package tarball entry must remain under package/: ${entry}`,
    );
  }
}

function declaredImportSpecifiers(manifest) {
  assert.ok(manifest.exports, `${manifest.name} must declare exports`);
  if (
    typeof manifest.exports === 'string' ||
    Array.isArray(manifest.exports) ||
    !Object.keys(manifest.exports).some((key) => key.startsWith('.'))
  ) {
    return [manifest.name];
  }
  return Object.keys(manifest.exports).map((subpath) => {
    assert.doesNotMatch(
      subpath,
      /\*/,
      `${manifest.name} wildcard exports require explicit pack-smoke fixtures`,
    );
    assert.ok(
      subpath === '.' || subpath.startsWith('./'),
      `${manifest.name} has an invalid export subpath: ${subpath}`,
    );
    return subpath === '.'
      ? manifest.name
      : `${manifest.name}/${subpath.slice(2)}`;
  });
}

function importVerificationSource(importSpecifiers) {
  return [
    `const specifiers = ${JSON.stringify([...new Set(importSpecifiers)], null, 2)};`,
    'for (const specifier of specifiers) {',
    '  try {',
    '    await import(specifier);',
    '  } catch (error) {',
    '    throw new Error(`Unable to import packed export ${specifier}`, { cause: error });',
    '  }',
    '}',
    'console.log(`Imported ${specifiers.length} declared exports from an isolated package consumer.`);',
    '',
  ].join('\n');
}
