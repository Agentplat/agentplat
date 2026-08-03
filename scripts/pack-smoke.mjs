import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
import {
  assertPublicApiCompatibility,
  inspectPackedTypeSurface,
  inspectSourceTypeSurface,
} from './public-api-surface.mjs';
import { assertReleaseLine } from './release-line.mjs';

const root = process.cwd();
const alpha5BaselineTag = 'v0.3.0-alpha.5';
const alpha5BaselineCommit = '5d11f715947bd7d3e5b8f7311c8f6f68c8c33a98';
assert.equal(
  git(['rev-parse', `${alpha5BaselineTag}^{commit}`]).trim(),
  alpha5BaselineCommit
);
const alpha5ContractSources = git([
  'ls-tree',
  '-r',
  '--name-only',
  alpha5BaselineTag,
  'tests',
  'scripts/pack-consumers',
])
  .split('\n')
  .filter(
    (file) =>
      file.endsWith('.test.mts') ||
      (file.startsWith('scripts/pack-consumers/') && file.endsWith('-types.ts'))
  )
  .sort(compareAscii);
assert.ok(alpha5ContractSources.length > 0);
const alpha5Catalog = JSON.parse(
  git(['show', `${alpha5BaselineTag}:config/public-packages.json`])
);
const catalog = await loadPublicPackageCatalog(root);
await assertReleaseLine({ root, catalog });
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
const alpha5ExtractionRoot = path.join(temporaryRoot, 'alpha5-source');
const alpha5ArchivePath = path.join(temporaryRoot, 'alpha5-source.tar');
const consumerRoot = path.join(temporaryRoot, 'consumer');

try {
  await Promise.all([
    mkdir(tarballRoot, { recursive: true }),
    mkdir(extractionRoot, { recursive: true }),
    mkdir(alpha5ExtractionRoot, { recursive: true }),
  ]);
  await writeFile(
    alpha5ArchivePath,
    execFileSync(
      'git',
      ['archive', '--format=tar', alpha5BaselineTag, 'packages'],
      {
        cwd: root,
        encoding: null,
        maxBuffer: 32 * 1024 * 1024,
      }
    )
  );
  execFileSync('tar', ['-xf', alpha5ArchivePath, '-C', alpha5ExtractionRoot]);

  for (const packageEntry of packageEntries) {
    execFileSync(
      'corepack',
      ['pnpm', 'pack', '--pack-destination', tarballRoot],
      {
        cwd: path.join(root, packageEntry.directory),
        stdio: 'pipe',
      }
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
        'utf8'
      )
    );
    assert.equal(sourceManifest.name, packageEntry.name);
    const tarball = expectedTarballName(sourceManifest);
    assert.ok(tarballs.includes(tarball), `Missing tarball: ${tarball}`);
    const tarballPath = path.join(tarballRoot, tarball);
    const packageExtractionRoot = path.join(
      extractionRoot,
      packageEntry.name.slice('@agentplat/'.length)
    );
    await mkdir(packageExtractionRoot, { recursive: true });
    assertSafeTarballPaths(tarballPath);
    execFileSync('tar', ['-xzf', tarballPath, '-C', packageExtractionRoot], {
      stdio: 'pipe',
    });
    assert.deepEqual(
      (await readdir(packageExtractionRoot)).sort(),
      ['package'],
      `${packageEntry.name} tarball must contain only the package root`
    );
    const extractedPackageRoot = path.join(packageExtractionRoot, 'package');
    const packedManifest = JSON.parse(
      await readFile(path.join(extractedPackageRoot, 'package.json'), 'utf8')
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
      surfaceRecords: declaredExportSubpaths(packedManifest).map((subpath) => ({
        package: packageEntry.name,
        subpath,
        browser: packageEntry.browserEntrypoints.includes(subpath),
        sideEffects: packedManifest.sideEffects,
        dependencies: internalRuntimeDependencies(packedManifest),
        ...inspectPackedTypeSurface(
          extractedPackageRoot,
          packedManifest,
          subpath
        ),
      })),
      packageEntry,
      tarballReference,
    });
  }

  const packageConsumerRoot = path.join(consumerRoot, 'consumers');
  const functionalConsumerRoot = path.join(consumerRoot, 'functional');
  const meshScenarioConsumerRoot = path.join(consumerRoot, 'mesh-three-peer');
  const meshConformanceConsumerRoot = path.join(
    consumerRoot,
    'mesh-conformance'
  );
  const meshAllocationRecoveryConsumerRoot = path.join(
    consumerRoot,
    'mesh-allocation-recovery'
  );
  const collectivePlanningMeshConsumerRoot = path.join(
    consumerRoot,
    'collective-planning-mesh-three-peer'
  );
  const collectivePlanningClosedLoopConsumerRoot = path.join(
    consumerRoot,
    'collective-planning-closed-loop'
  );
  const collectivePlanningClosedLoopResilienceConsumerRoot = path.join(
    consumerRoot,
    'collective-planning-closed-loop-resilience'
  );
  const collectivePlanningResilienceConformanceConsumerRoot = path.join(
    consumerRoot,
    'collective-planning-resilience-conformance'
  );
  const typeScriptConsumerRoot = path.join(consumerRoot, 'typescript');
  const inferenceControlConsumerRoot = path.join(
    consumerRoot,
    'inference-control'
  );
  const trustConsumerRoot = path.join(consumerRoot, 'trust');
  const meshAdaptersConsumerRoot = path.join(
    consumerRoot,
    'mesh-adapters-alpha5'
  );
  const alpha5ContractsConsumerRoot = path.join(
    consumerRoot,
    'alpha5-contracts'
  );
  const alpha5ContractsSourceRoot = path.join(
    alpha5ContractsConsumerRoot,
    'sources'
  );
  const npmConsumerRoot = path.join(temporaryRoot, 'npm-consumer');
  await Promise.all([
    mkdir(packageConsumerRoot, { recursive: true }),
    mkdir(functionalConsumerRoot, { recursive: true }),
    mkdir(meshScenarioConsumerRoot, { recursive: true }),
    mkdir(meshConformanceConsumerRoot, { recursive: true }),
    mkdir(meshAllocationRecoveryConsumerRoot, { recursive: true }),
    mkdir(collectivePlanningMeshConsumerRoot, { recursive: true }),
    mkdir(collectivePlanningClosedLoopConsumerRoot, { recursive: true }),
    mkdir(collectivePlanningClosedLoopResilienceConsumerRoot, {
      recursive: true,
    }),
    mkdir(collectivePlanningResilienceConformanceConsumerRoot, {
      recursive: true,
    }),
    mkdir(typeScriptConsumerRoot, { recursive: true }),
    mkdir(inferenceControlConsumerRoot, { recursive: true }),
    mkdir(trustConsumerRoot, { recursive: true }),
    mkdir(meshAdaptersConsumerRoot, { recursive: true }),
    mkdir(alpha5ContractsSourceRoot, { recursive: true }),
    mkdir(npmConsumerRoot, { recursive: true }),
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
        2
      )}\n`
    ),
    writeFile(
      path.join(consumerRoot, '.npmrc'),
      [
        'node-linker=isolated',
        'hoist=false',
        'strict-peer-dependencies=true',
        '',
      ].join('\n')
    ),
    writeFile(
      path.join(consumerRoot, 'pnpm-workspace.yaml'),
      [
        'packages:',
        "  - 'consumers/*'",
        "  - 'functional'",
        "  - 'mesh-three-peer'",
        "  - 'mesh-conformance'",
        "  - 'mesh-allocation-recovery'",
        "  - 'collective-planning-mesh-three-peer'",
        "  - 'collective-planning-closed-loop'",
        "  - 'collective-planning-closed-loop-resilience'",
        "  - 'collective-planning-resilience-conformance'",
        "  - 'typescript'",
        "  - 'inference-control'",
        "  - 'trust'",
        "  - 'mesh-adapters-alpha5'",
        "  - 'alpha5-contracts'",
        '',
      ].join('\n')
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
            devDependencies: { '@types/node': '^20.10.0' },
          },
          null,
          2
        )}\n`
      ),
      writeFile(
        path.join(packageRoot, 'verify-imports.mjs'),
        importVerificationSource(artifact.importSpecifiers)
      ),
      writeFile(
        path.join(packageRoot, 'verify-types.ts'),
        typeImportVerificationSource(artifact.importSpecifiers)
      ),
      writeFile(
        path.join(packageRoot, 'tsconfig.json'),
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
            include: ['verify-types.ts'],
          },
          null,
          2
        )}\n`
      )
    );
  }

  const functionalDependencies = Object.fromEntries(
    packedArtifacts.map((artifact) => [
      artifact.packageEntry.name,
      artifact.tarballReference,
    ])
  );
  const meshPackageNames = Object.freeze([
    '@agentplat/mesh',
    '@agentplat/mesh-conformance',
    '@agentplat/mesh-crypto',
    '@agentplat/mesh-protocol',
    '@agentplat/mesh-sim',
  ]);
  const artifactsByName = new Map(
    packedArtifacts.map((artifact) => [artifact.packageEntry.name, artifact])
  );
  const meshDependencies = Object.fromEntries(
    meshPackageNames.map((packageName) => {
      const artifact = artifactsByName.get(packageName);
      assert.ok(artifact, `Missing packed Mesh dependency: ${packageName}`);
      return [packageName, artifact.tarballReference];
    })
  );
  const collectivePlanningMeshPackageNames = Object.freeze([
    '@agentplat/collective-control',
    '@agentplat/collective-planning',
    '@agentplat/mesh',
    '@agentplat/mesh-crypto',
    '@agentplat/mesh-protocol',
  ]);
  const collectivePlanningMeshDependencies = Object.fromEntries(
    collectivePlanningMeshPackageNames.map((packageName) => {
      const artifact = artifactsByName.get(packageName);
      assert.ok(
        artifact,
        `Missing packed collective planning Mesh dependency: ${packageName}`
      );
      return [packageName, artifact.tarballReference];
    })
  );
  const collectivePlanningClosedLoopPackageNames = Object.freeze([
    '@agentplat/collective-control',
    '@agentplat/collective-planning',
    '@agentplat/inference-control',
    '@agentplat/mesh',
    '@agentplat/mesh-crypto',
    '@agentplat/mesh-protocol',
    '@agentplat/mesh-sim',
    '@agentplat/trust',
  ]);
  const collectivePlanningClosedLoopDependencies = Object.fromEntries(
    collectivePlanningClosedLoopPackageNames.map((packageName) => {
      const artifact = artifactsByName.get(packageName);
      assert.ok(
        artifact,
        `Missing packed closed-loop dependency: ${packageName}`
      );
      return [packageName, artifact.tarballReference];
    })
  );
  const collectivePlanningResilienceConformanceDependencies = {
    ...collectivePlanningClosedLoopDependencies,
    '@agentplat/mesh-conformance': meshDependencies['@agentplat/mesh-conformance'],
  };
  const meshAdapterPackageNames = Object.freeze([
    '@agentplat/mesh',
    '@agentplat/mesh-crypto',
    '@agentplat/mesh-http',
    '@agentplat/mesh-postgres',
    '@agentplat/mesh-protocol',
    '@agentplat/rooms-mesh',
  ]);
  const meshAdapterDependencies = Object.fromEntries(
    meshAdapterPackageNames.map((packageName) => {
      const artifact = artifactsByName.get(packageName);
      assert.ok(
        artifact,
        `Missing packed Mesh adapter dependency: ${packageName}`
      );
      return [packageName, artifact.tarballReference];
    })
  );
  const inferenceControlArtifact = artifactsByName.get(
    '@agentplat/inference-control'
  );
  assert.ok(
    inferenceControlArtifact,
    'Missing packed inference-control dependency'
  );
  const trustArtifact = artifactsByName.get('@agentplat/trust');
  assert.ok(trustArtifact, 'Missing packed Trust dependency');
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
        2
      )}\n`
    ),
    writeFile(
      path.join(functionalConsumerRoot, 'verify-functional.mjs'),
      [
        "import { mkdtemp, rm } from 'node:fs/promises';",
        "import { tmpdir } from 'node:os';",
        "import path from 'node:path';",
        "import { AgentPlat } from '@agentplat/framework';",
        "import { MESH_CONFORMANCE_CASES, MESH_CONFORMANCE_REPORT_SCHEMA_VERSION } from '@agentplat/mesh-conformance';",
        "import { InMemoryRoomRepository, RoomService } from '@agentplat/rooms';",
        "import { DefaultAgentRuntime } from '@agentplat/runtime';",
        "import { MockAgentProvider } from '@agentplat/runtime-mock';",
        "import { createMultiAgentSession } from '@agentplat/sessions';",
        "import { streamToSSE } from '@agentplat/streaming';",
        "import { openCollectiveStatisticalCampaignLocalStoreV1 } from '@agentplat/mesh-sim-local';",
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
        "const localRoot = await mkdtemp(path.join(tmpdir(), 'agentplat-pack-local-'));",
        'let localStorePassed = false;',
        'try {',
        '  const localStore = await openCollectiveStatisticalCampaignLocalStoreV1({ root: localRoot });',
        "  const stored = await localStore.putArtifactV1('packed-local-store');",
        "  localStorePassed = new TextDecoder().decode(await localStore.readArtifactV1(stored.sha256)) === 'packed-local-store';",
        '} finally {',
        '  await rm(localRoot, { recursive: true, force: true });',
        '}',
        "if (!service || result.output !== 'ok' || sessionResult.turnsCompleted !== 2 || !response.headers.get('content-type')?.startsWith('text/event-stream') || MESH_CONFORMANCE_REPORT_SCHEMA_VERSION !== 1 || MESH_CONFORMANCE_CASES.length < 1 || !localStorePassed) process.exit(1);",
        '',
      ].join('\n')
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
        2
      )}\n`
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
        2
      )}\n`
    ),
    copyFile(
      path.join(root, 'scripts/pack-consumers/mesh-types.ts'),
      path.join(typeScriptConsumerRoot, 'verify-types.ts')
    ),
    writeFile(
      path.join(inferenceControlConsumerRoot, 'package.json'),
      `${JSON.stringify({ name: 'agentplat-pack-smoke-inference-control', version: '1.0.0', private: true, type: 'module', dependencies: { '@agentplat/inference-control': inferenceControlArtifact.tarballReference } }, null, 2)}\n`
    ),
    writeFile(
      path.join(inferenceControlConsumerRoot, 'tsconfig.json'),
      `${JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, skipLibCheck: false, types: [], lib: ['ES2022', 'DOM'] }, include: ['verify-types.ts'] }, null, 2)}\n`
    ),
    copyFile(
      path.join(root, 'scripts/pack-consumers/inference-control-types.ts'),
      path.join(inferenceControlConsumerRoot, 'verify-types.ts')
    ),
    copyFile(
      path.join(root, 'scripts/pack-consumers/inference-control-alpha3.mjs'),
      path.join(inferenceControlConsumerRoot, 'verify-inference-control.mjs')
    ),
    writeFile(
      path.join(trustConsumerRoot, 'package.json'),
      `${JSON.stringify({ name: 'agentplat-pack-smoke-trust', version: '1.0.0', private: true, type: 'module', dependencies: { '@agentplat/trust': trustArtifact.tarballReference, '@agentplat/mesh': meshDependencies['@agentplat/mesh'], '@agentplat/inference-control': inferenceControlArtifact.tarballReference } }, null, 2)}\n`
    ),
    copyFile(
      path.join(root, 'scripts/pack-consumers/trust-foundation.mjs'),
      path.join(trustConsumerRoot, 'verify-trust.mjs')
    ),
    writeFile(
      path.join(meshAdaptersConsumerRoot, 'package.json'),
      `${JSON.stringify({ name: 'agentplat-pack-smoke-mesh-adapters-alpha5', version: '1.0.0', private: true, type: 'module', dependencies: meshAdapterDependencies, devDependencies: { '@types/node': '^20.10.0' } }, null, 2)}\n`
    ),
    writeFile(
      path.join(meshAdaptersConsumerRoot, 'tsconfig.json'),
      `${JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, skipLibCheck: false, types: ['node'], lib: ['ES2022', 'DOM'] }, include: ['verify-types.ts'] }, null, 2)}\n`
    ),
    copyFile(
      path.join(root, 'scripts/pack-consumers/mesh-adapters-alpha5-types.ts'),
      path.join(meshAdaptersConsumerRoot, 'verify-types.ts')
    ),
    copyFile(
      path.join(root, 'scripts/pack-consumers/mesh-adapters-alpha5.mjs'),
      path.join(meshAdaptersConsumerRoot, 'verify-mesh-adapters.mjs')
    ),
    writeFile(
      path.join(alpha5ContractsConsumerRoot, 'package.json'),
      `${JSON.stringify({ name: 'agentplat-pack-smoke-alpha5-contracts', version: '1.0.0', private: true, type: 'module', dependencies: functionalDependencies, devDependencies: { '@types/node': '^20.10.0' } }, null, 2)}\n`
    ),
    writeFile(
      path.join(alpha5ContractsConsumerRoot, 'tsconfig.json'),
      `${JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, skipLibCheck: false, types: ['node'], lib: ['ES2022', 'DOM'] }, include: ['sources/*'] }, null, 2)}\n`
    ),
    ...alpha5ContractSources.map((file, index) =>
      writeFile(
        path.join(
          alpha5ContractsSourceRoot,
          `${String(index).padStart(3, '0')}-${path.basename(file)}`
        ),
        git(['show', `${alpha5BaselineTag}:${file}`]),
        'utf8'
      )
    ),
    writeFile(
      path.join(meshConformanceConsumerRoot, 'package.json'),
      `${JSON.stringify(
        {
          name: 'agentplat-pack-smoke-mesh-conformance',
          version: '1.0.0',
          private: true,
          type: 'module',
          dependencies: meshDependencies,
        },
        null,
        2
      )}\n`
    ),
    copyFile(
      path.join(root, 'scripts/pack-consumers/mesh-conformance.mjs'),
      path.join(meshConformanceConsumerRoot, 'verify-conformance.mjs')
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
        2
      )}\n`
    ),
    copyFile(
      path.join(root, 'scripts/pack-consumers/mesh-three-peer.mjs'),
      path.join(meshScenarioConsumerRoot, 'verify-mesh.mjs')
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
        2
      )}\n`
    ),
    copyFile(
      path.join(root, 'scripts/pack-consumers/mesh-allocation-recovery.mjs'),
      path.join(
        meshAllocationRecoveryConsumerRoot,
        'verify-allocation-recovery.mjs'
      )
    ),
    writeFile(
      path.join(collectivePlanningMeshConsumerRoot, 'package.json'),
      `${JSON.stringify(
        {
          name: 'agentplat-pack-smoke-collective-planning-mesh-three-peer',
          version: '1.0.0',
          private: true,
          type: 'module',
          dependencies: collectivePlanningMeshDependencies,
        },
        null,
        2
      )}\n`
    ),
    writeFile(
      path.join(collectivePlanningClosedLoopConsumerRoot, 'package.json'),
      `${JSON.stringify(
        {
          name: 'agentplat-pack-smoke-collective-planning-closed-loop',
          version: '1.0.0',
          private: true,
          type: 'module',
          dependencies: collectivePlanningClosedLoopDependencies,
        },
        null,
        2
      )}\n`
    ),
    copyFile(
      path.join(
        root,
        'scripts/pack-consumers/collective-planning-closed-loop.mjs'
      ),
      path.join(
        collectivePlanningClosedLoopConsumerRoot,
        'verify-closed-loop.mjs'
      )
    ),
    copyFile(
      path.join(
        root,
        'scripts/pack-consumers/collective-planning-closed-loop-types.ts'
      ),
      path.join(collectivePlanningClosedLoopConsumerRoot, 'verify-types.ts')
    ),
    writeFile(
      path.join(collectivePlanningClosedLoopConsumerRoot, 'tsconfig.json'),
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
        2
      )}\n`
    ),
    writeFile(
      path.join(
        collectivePlanningClosedLoopResilienceConsumerRoot,
        'package.json'
      ),
      `${JSON.stringify(
        {
          name: 'agentplat-pack-smoke-collective-planning-closed-loop-resilience',
          version: '1.0.0',
          private: true,
          type: 'module',
          dependencies: collectivePlanningClosedLoopDependencies,
        },
        null,
        2
      )}\n`
    ),
    copyFile(
      path.join(
        root,
        'scripts/pack-consumers/collective-planning-closed-loop-resilience.mjs'
      ),
      path.join(
        collectivePlanningClosedLoopResilienceConsumerRoot,
        'verify-resilience.mjs'
      )
    ),
    copyFile(
      path.join(
        root,
        'scripts/pack-consumers/collective-planning-closed-loop-resilience-types.ts'
      ),
      path.join(
        collectivePlanningClosedLoopResilienceConsumerRoot,
        'verify-types.ts'
      )
    ),
    writeFile(
      path.join(
        collectivePlanningResilienceConformanceConsumerRoot,
        'package.json'
      ),
      `${JSON.stringify(
        {
          name: 'agentplat-pack-smoke-collective-planning-resilience-conformance',
          version: '1.0.0',
          private: true,
          type: 'module',
          dependencies: collectivePlanningResilienceConformanceDependencies,
        },
        null,
        2
      )}\n`
    ),
    copyFile(
      path.join(
        root,
        'scripts/pack-consumers/collective-planning-resilience-conformance.mjs'
      ),
      path.join(
        collectivePlanningResilienceConformanceConsumerRoot,
        'verify-resilience-conformance.mjs'
      )
    ),
    writeFile(
      path.join(
        collectivePlanningClosedLoopResilienceConsumerRoot,
        'tsconfig.json'
      ),
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
        2
      )}\n`
    ),
    copyFile(
      path.join(
        root,
        'scripts/pack-consumers/collective-planning-mesh-three-peer.mjs'
      ),
      path.join(collectivePlanningMeshConsumerRoot, 'verify-planning-mesh.mjs')
    ),
    copyFile(
      path.join(root, 'scripts/pack-consumers/collective-planning-types.ts'),
      path.join(collectivePlanningMeshConsumerRoot, 'verify-types.ts')
    ),
    writeFile(
      path.join(collectivePlanningMeshConsumerRoot, 'tsconfig.json'),
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
        2
      )}\n`
    ),
    writeFile(
      path.join(npmConsumerRoot, 'package.json'),
      `${JSON.stringify(
        {
          name: 'agentplat-pack-smoke-npm-consumer',
          version: '1.0.0',
          private: true,
          type: 'module',
          dependencies: functionalDependencies,
        },
        null,
        2
      )}\n`
    ),
    copyFile(
      path.join(root, 'scripts/pack-consumers/mesh-mixed-version.mjs'),
      path.join(npmConsumerRoot, 'verify-mixed-version.mjs')
    ),
    copyFile(
      path.join(root, 'scripts/pack-consumers/mesh-conformance.mjs'),
      path.join(npmConsumerRoot, 'verify-conformance.mjs')
    ),
    copyFile(
      path.join(
        root,
        'scripts/pack-consumers/collective-planning-resilience-conformance.mjs'
      ),
      path.join(npmConsumerRoot, 'verify-resilience-conformance.mjs')
    )
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
    }
  );
  const runtimeSurfaces = new Map();
  for (const artifact of packedArtifacts) {
    const artifactConsumerRoot = path.join(
      packageConsumerRoot,
      artifact.directoryName
    );
    const output = execFileSync(process.execPath, ['verify-imports.mjs'], {
      cwd: artifactConsumerRoot,
      encoding: 'utf8',
    });
    const result = JSON.parse(output.trim());
    for (const surface of result.surfaces) {
      runtimeSurfaces.set(surface.specifier, surface.runtimeExports);
    }
    execFileSync(
      process.execPath,
      [
        path.join(root, 'node_modules/typescript/bin/tsc'),
        '--project',
        'tsconfig.json',
      ],
      { cwd: artifactConsumerRoot, stdio: 'inherit' }
    );
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
    }
  );
  execFileSync(process.execPath, ['verify-resilience-conformance.mjs'], {
    cwd: collectivePlanningResilienceConformanceConsumerRoot,
    stdio: 'inherit',
  });
  execFileSync(process.execPath, ['verify-mesh.mjs'], {
    cwd: meshScenarioConsumerRoot,
    stdio: 'inherit',
  });
  execFileSync(process.execPath, ['verify-conformance.mjs'], {
    cwd: meshConformanceConsumerRoot,
    stdio: 'inherit',
  });
  execFileSync(process.execPath, ['verify-allocation-recovery.mjs'], {
    cwd: meshAllocationRecoveryConsumerRoot,
    stdio: 'inherit',
  });
  execFileSync(process.execPath, ['verify-planning-mesh.mjs'], {
    cwd: collectivePlanningMeshConsumerRoot,
    stdio: 'inherit',
  });
  execFileSync(process.execPath, ['verify-closed-loop.mjs'], {
    cwd: collectivePlanningClosedLoopConsumerRoot,
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
      cwd: collectivePlanningClosedLoopConsumerRoot,
      stdio: 'inherit',
    }
  );
  execFileSync(process.execPath, ['verify-resilience.mjs'], {
    cwd: collectivePlanningClosedLoopResilienceConsumerRoot,
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
      cwd: collectivePlanningClosedLoopResilienceConsumerRoot,
      stdio: 'inherit',
    }
  );
  execFileSync(
    process.execPath,
    [
      path.join(root, 'node_modules/typescript/bin/tsc'),
      '--project',
      'tsconfig.json',
    ],
    {
      cwd: collectivePlanningMeshConsumerRoot,
      stdio: 'inherit',
    }
  );
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
    }
  );
  execFileSync(process.execPath, ['verify-inference-control.mjs'], {
    cwd: inferenceControlConsumerRoot,
    stdio: 'inherit',
  });
  execFileSync(process.execPath, ['verify-trust.mjs'], {
    cwd: trustConsumerRoot,
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
      cwd: meshAdaptersConsumerRoot,
      stdio: 'inherit',
    }
  );
  execFileSync(process.execPath, ['verify-mesh-adapters.mjs'], {
    cwd: meshAdaptersConsumerRoot,
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
      cwd: alpha5ContractsConsumerRoot,
      stdio: 'inherit',
    }
  );
  execFileSync(process.execPath, ['verify-functional.mjs'], {
    cwd: functionalConsumerRoot,
    stdio: 'inherit',
  });
  execFileSync(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
    ],
    {
      cwd: npmConsumerRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        npm_config_cache: path.join(temporaryRoot, 'npm-independent-cache'),
        npm_config_userconfig: '/dev/null',
      },
    }
  );
  execFileSync(process.execPath, ['verify-mixed-version.mjs'], {
    cwd: npmConsumerRoot,
    stdio: 'inherit',
    env: { ...process.env, npm_config_userconfig: '/dev/null' },
  });
  execFileSync(process.execPath, ['verify-conformance.mjs'], {
    cwd: npmConsumerRoot,
    stdio: 'inherit',
    env: { ...process.env, npm_config_userconfig: '/dev/null' },
  });
  execFileSync(process.execPath, ['verify-resilience-conformance.mjs'], {
    cwd: npmConsumerRoot,
    stdio: 'inherit',
    env: { ...process.env, npm_config_userconfig: '/dev/null' },
  });

  const importedExportCount = packedArtifacts.reduce(
    (total, artifact) => total + artifact.importSpecifiers.length,
    0
  );
  const publicApiSurface = Object.freeze({
    schemaVersion: 1,
    releaseVersion: JSON.parse(
      await readFile(
        path.join(
          root,
          packedArtifacts[0].packageEntry.directory,
          'package.json'
        ),
        'utf8'
      )
    ).version,
    records: packedArtifacts.flatMap((artifact) =>
      artifact.surfaceRecords.map((record) => {
        const specifier =
          record.subpath === '.'
            ? record.package
            : `${record.package}/${record.subpath.slice(2)}`;
        const runtimeExports = runtimeSurfaces.get(specifier);
        assert.ok(runtimeExports, `Missing runtime surface for ${specifier}`);
        return Object.freeze({ ...record, runtimeExports });
      })
    ),
  });
  const alpha5ApiSurface = alpha5Catalog.packages.flatMap((entry) => {
    const packageRoot = path.join(alpha5ExtractionRoot, entry.directory);
    const manifest = JSON.parse(
      git(['show', `${alpha5BaselineTag}:${entry.directory}/package.json`])
    );
    return declaredExportSubpaths(manifest).map((subpath) => ({
      package: entry.name,
      subpath,
      browser: entry.browserEntrypoints.includes(subpath),
      sideEffects: manifest.sideEffects,
      ...inspectSourceTypeSurface(packageRoot, manifest, subpath),
    }));
  });
  assertPublicApiCompatibility(alpha5ApiSurface, publicApiSurface.records);
  assert.equal(publicApiSurface.records.length, importedExportCount);
  const publicApiSurfaceDigest = createHash('sha256')
    .update(JSON.stringify(publicApiSurface))
    .digest('hex');
  if (process.env.AGENTPLAT_PUBLIC_API_SURFACE_OUTPUT) {
    const outputPath = path.resolve(
      root,
      process.env.AGENTPLAT_PUBLIC_API_SURFACE_OUTPUT
    );
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify(
        {
          ...publicApiSurface,
          alpha5BaselineTag,
          alpha5BaselineCommit,
          surfaceSha256: publicApiSurfaceDigest,
        },
        null,
        2
      )}\n`,
      { encoding: 'utf8', mode: 0o644 }
    );
  }
  console.log(
    `Audited ${tarballs.length} tarballs, inventoried ${importedExportCount} packed API surfaces (${publicApiSurfaceDigest}), compiled ${alpha5ContractSources.length} unchanged Alpha 5 contract sources and the packed TypeScript declarations, ran conformance through pnpm and independent npm installs, replayed the signed three-peer scenario, verified allocation plus recovery fencing, exercised Trust policy/profile/eligibility, and verified the HTTP, durability, PostgreSQL, Rooms bridge and functional consumer surfaces.`
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
      `Unsafe absolute path in package tarball: ${entry}`
    );
    assert.equal(
      normalized.split('/').includes('..'),
      false,
      `Unsafe parent traversal in package tarball: ${entry}`
    );
    assert.ok(
      normalized === 'package' || normalized.startsWith('package/'),
      `Package tarball entry must remain under package/: ${entry}`
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
      `${manifest.name} wildcard exports require explicit pack-smoke fixtures`
    );
    assert.ok(
      subpath === '.' || subpath.startsWith('./'),
      `${manifest.name} has an invalid export subpath: ${subpath}`
    );
    return subpath === '.'
      ? manifest.name
      : `${manifest.name}/${subpath.slice(2)}`;
  });
}

function declaredExportSubpaths(manifest) {
  if (
    typeof manifest.exports === 'string' ||
    Array.isArray(manifest.exports) ||
    !Object.keys(manifest.exports).some((key) => key.startsWith('.'))
  ) {
    return ['.'];
  }
  return Object.keys(manifest.exports);
}

function internalRuntimeDependencies(manifest) {
  return [
    ...new Set(
      ['dependencies', 'optionalDependencies', 'peerDependencies'].flatMap(
        (field) =>
          Object.keys(manifest[field] ?? {}).filter((name) =>
            name.startsWith('@agentplat/')
          )
      )
    ),
  ].sort();
}

function importVerificationSource(importSpecifiers) {
  return [
    `const specifiers = ${JSON.stringify([...new Set(importSpecifiers)], null, 2)};`,
    'const surfaces = [];',
    'for (const specifier of specifiers) {',
    '  try {',
    '    const imported = await import(specifier);',
    '    surfaces.push({ specifier, runtimeExports: Object.keys(imported).sort() });',
    '  } catch (error) {',
    '    throw new Error(`Unable to import packed export ${specifier}`, { cause: error });',
    '  }',
    '}',
    'console.log(JSON.stringify({ surfaces }));',
    '',
  ].join('\n');
}

function typeImportVerificationSource(importSpecifiers) {
  return [
    ...importSpecifiers.map(
      (specifier, index) =>
        `import * as Surface${index} from ${JSON.stringify(specifier)};`
    ),
    ...importSpecifiers.map((_specifier, index) => `void Surface${index};`),
    '',
  ].join('\n');
}

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
