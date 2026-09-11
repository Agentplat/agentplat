import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import semver from 'semver';
import { parse } from '@babel/parser';
import { assertReleaseLine } from './release-line.mjs';
import {
  compareAscii,
  discoverWorkspacePackageManifests,
  loadPublicPackageCatalog,
  publishablePackages,
} from './public-package-catalog.mjs';

export const INTERNAL_DEPENDENCY_FIELDS = Object.freeze([
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
]);
export const PROHIBITED_PUBLISH_LIFECYCLE_SCRIPTS = Object.freeze([
  'dependencies',
  'install',
  'postinstall',
  'postpack',
  'postpublish',
  'postversion',
  'preinstall',
  'prepack',
  'prepare',
  'prepublish',
  'prepublishOnly',
  'preversion',
  'publish',
  'version',
]);
const ALLOWED_PACKAGE_FILES = new Set([
  'README.md',
  'dist',
  'fixtures',
  'migrations',
]);
const ALLOWED_PACKAGE_BINS = Object.freeze({
  '@agentplat/mcp-docs': Object.freeze({
    'agentplat-mcp-docs': './dist/cli.js',
  }),
});
const ALL_DEPENDENCY_FIELDS = Object.freeze([
  ...INTERNAL_DEPENDENCY_FIELDS,
  'devDependencies',
]);
const NODE_BUILTINS = new Set(
  builtinModules.map((specifier) => specifier.replace(/^node:/, ''))
);
const SOURCE_EXTENSIONS = Object.freeze([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);
const SEMVER_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export async function verifyRelease(root = process.cwd()) {
  const catalog = await loadPublicPackageCatalog(root);
  const catalogPackages = catalog.packages;
  const expectedPackages = publishablePackages(catalog);
  const catalogByName = new Map(
    catalogPackages.map((entry) => [entry.name, entry])
  );
  const rootManifest = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8')
  );

  await assertReleaseLine({
    root,
    catalog,
    rootManifest,
  });

  assert.match(
    rootManifest.version,
    SEMVER_PATTERN,
    'The release version must be valid semantic versioning'
  );

  const discoveredManifests = await discoverWorkspacePackageManifests(root);
  assert.deepEqual(
    discoveredManifests.map((record) => record.directory),
    catalogPackages.map((entry) => entry.directory),
    'Every workspace package manifest must be declared in the public package catalog in ASCII order'
  );

  const discoveredByDirectory = new Map(
    discoveredManifests.map((record) => [record.directory, record])
  );
  const packageRecordsByName = new Map();

  for (const catalogEntry of catalogPackages) {
    const packageName = path.posix.basename(catalogEntry.directory);
    const record = discoveredByDirectory.get(catalogEntry.directory);
    assert.ok(record, `Missing package manifest for ${catalogEntry.directory}`);
    const { manifest } = record;
    assert.equal(
      manifest.name,
      catalogEntry.name,
      `${catalogEntry.directory} must match its catalog package name`
    );
    packageRecordsByName.set(manifest.name, {
      catalogEntry,
      directory: catalogEntry.directory,
      manifest,
    });

    if (!catalogEntry.publish) {
      assert.equal(
        manifest.private,
        true,
        `${manifest.name} is not publishable and must be private`
      );
      continue;
    }
    assert.notEqual(
      manifest.private,
      true,
      `${manifest.name} must be publishable`
    );
    assert.equal(
      manifest.version,
      rootManifest.version,
      `${manifest.name} must use the fixed workspace release version`
    );
    assert.equal(
      manifest.license,
      'Apache-2.0',
      `${manifest.name} must declare Apache-2.0`
    );
    assert.equal(
      manifest.main,
      './dist/index.js',
      `${manifest.name} must publish compiled JavaScript`
    );
    assert.equal(
      manifest.types,
      './dist/index.d.ts',
      `${manifest.name} must publish declarations`
    );
    assert.ok(
      resolveConditionalExport(manifest.exports?.['.']),
      `${manifest.name} must declare ESM exports`
    );
    assert.ok(manifest.scripts?.build, `${manifest.name} must define a build`);
    assert.equal(
      manifest.sideEffects,
      false,
      `${manifest.name} must declare its side-effect behavior`
    );
    assert.equal(
      manifest.publishConfig?.access,
      'public',
      `${manifest.name} must publish with public access`
    );
    assertSecurePublishManifest(manifest.name, manifest);
    assert.equal(
      manifest.repository?.directory,
      `packages/${packageName}`,
      `${manifest.name} must identify its monorepo directory`
    );
    await access(path.join(root, catalogEntry.directory, 'dist', 'index.js'));
    await access(path.join(root, catalogEntry.directory, 'dist', 'index.d.ts'));
  }

  for (const catalogEntry of expectedPackages) {
    assertInternalDependenciesArePublishable(
      catalogEntry.name,
      packageRecordsByName,
      catalogByName
    );
    if (catalogEntry.providerNeutral) {
      assertProviderNeutralDependencyGraph(
        catalogEntry.name,
        packageRecordsByName,
        catalogByName
      );
    }
    for (const browserEntrypoint of catalogEntry.browserEntrypoints) {
      await assertBrowserEntrypointGraph({
        catalogByName,
        packageRecordsByName,
        root,
        rootEntrypoint: browserEntrypoint,
        rootPackage: catalogEntry.name,
      });
    }
  }

  console.log(
    `Verified ${expectedPackages.length} publishable package manifests at ${rootManifest.version}, internal dependency publication, browser entrypoints and build outputs.`
  );
}

export function assertSecurePublishManifest(packageName, manifest) {
  assert.deepEqual(
    Object.keys(manifest.publishConfig ?? {}).sort(compareAscii),
    ['access'],
    `${packageName}.publishConfig must contain only the fixed public access policy`
  );

  for (const scriptName of PROHIBITED_PUBLISH_LIFECYCLE_SCRIPTS) {
    assert.equal(
      Object.hasOwn(manifest.scripts ?? {}, scriptName),
      false,
      `${packageName} must not declare lifecycle script ${scriptName}`
    );
  }

  assert.ok(
    Array.isArray(manifest.files) && manifest.files.length > 0,
    `${packageName}.files must be an explicit non-empty allowlist`
  );
  assert.equal(
    new Set(manifest.files).size,
    manifest.files.length,
    `${packageName}.files must not contain duplicates`
  );
  assert.ok(manifest.files.includes('dist'), `${packageName}.files must include dist`);
  assert.ok(
    manifest.files.includes('README.md'),
    `${packageName}.files must include README.md`
  );
  for (const entry of manifest.files) {
    assert.ok(
      ALLOWED_PACKAGE_FILES.has(entry),
      `${packageName}.files contains unapproved entry ${entry}`
    );
  }

  assert.equal(
    manifest.bundledDependencies ?? manifest.bundleDependencies,
    undefined,
    `${packageName} must not bundle dependencies`
  );
  assert.deepEqual(
    manifest.bin,
    ALLOWED_PACKAGE_BINS[packageName],
    `${packageName}.bin does not match the reviewed executable allowlist`
  );

  for (const field of ALL_DEPENDENCY_FIELDS) {
    for (const [dependency, specifier] of Object.entries(manifest[field] ?? {})) {
      assert.equal(
        typeof specifier,
        'string',
        `${packageName}.${field}.${dependency} must be a string`
      );
      if (dependency.startsWith('@agentplat/')) {
        assert.match(
          specifier,
          /^workspace:(?:\*|\^|~)$/u,
          `${packageName}.${field}.${dependency} must use a workspace protocol range`
        );
        continue;
      }
      assert.ok(
        semver.validRange(specifier) !== null,
        `${packageName}.${field}.${dependency} must use a registry semver range`
      );
    }
  }
}

export function assertInternalDependenciesArePublishable(
  packageName,
  packageRecords,
  catalogEntries
) {
  const record = packageRecords.get(packageName);
  assert.ok(record, `Missing manifest for ${packageName}`);

  for (const [field, dependency] of internalDependencies(record.manifest)) {
    const dependencyEntry = catalogEntries.get(dependency);
    assert.ok(
      dependencyEntry,
      `${packageName}.${field} references uncataloged workspace package ${dependency}`
    );
    assert.equal(
      dependencyEntry.publish,
      true,
      `${packageName}.${field} must not reference unpublished workspace package ${dependency}`
    );
    assert.ok(
      packageRecords.has(dependency),
      `${packageName}.${field} references workspace package ${dependency} without a manifest`
    );
  }
}

function assertProviderNeutralDependencyGraph(
  rootPackage,
  packageRecords,
  catalogEntries
) {
  const pending = [rootPackage];
  const visited = new Set();
  while (pending.length > 0) {
    const packageName = pending.pop();
    if (!packageName || visited.has(packageName)) continue;
    visited.add(packageName);
    const record = packageRecords.get(packageName);
    assert.ok(record, `Missing manifest for ${packageName}`);
    for (const [, dependency] of allDependencies(record.manifest)) {
      assert.ok(
        !isVendorSdk(dependency),
        `${rootPackage} must not depend on provider SDK ${dependency} through ${packageName}`
      );
      if (!dependency.startsWith('@agentplat/')) continue;
      const dependencyEntry = catalogEntries.get(dependency);
      assert.ok(
        dependencyEntry,
        `${packageName} depends on uncataloged workspace package ${dependency}`
      );
      assert.equal(
        dependencyEntry.providerNeutral,
        true,
        `${rootPackage} must not depend on provider-specific package ${dependency} through ${packageName}`
      );
      pending.push(dependency);
    }
  }
}

export async function assertBrowserEntrypointGraph({
  root,
  rootPackage,
  rootEntrypoint,
  packageRecordsByName,
  catalogByName,
}) {
  const rootEntry = catalogByName.get(rootPackage);
  assert.ok(rootEntry, `Missing catalog entry for ${rootPackage}`);
  assert.ok(
    rootEntry.browserEntrypoints.includes(rootEntrypoint),
    `${rootPackage} does not declare browser entrypoint ${rootEntrypoint}`
  );

  const pending = [
    await resolvePackageSourceEntrypoint(
      root,
      rootPackage,
      rootEntrypoint,
      packageRecordsByName
    ),
  ];
  const visited = new Set();
  const rootLabel = `${rootPackage}${formatEntrypoint(rootEntrypoint)}`;

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current.sourcePath)) continue;
    visited.add(current.sourcePath);

    const source = await readFile(current.sourcePath, 'utf8');
    for (const specifier of extractRuntimeModuleSpecifiers(
      source,
      current.sourcePath
    )) {
      assert.ok(
        !isNodeBuiltinSpecifier(specifier),
        `${rootLabel} must not import Node.js built-in ${specifier} through ${path.relative(root, current.sourcePath)}`
      );

      if (specifier.startsWith('.')) {
        const sourcePath = await resolveRelativeSourceImport(
          current.sourcePath,
          specifier,
          path.join(root, current.packageDirectory, 'src')
        );
        pending.push({
          packageDirectory: current.packageDirectory,
          packageName: current.packageName,
          sourcePath,
        });
        continue;
      }

      const internalImport = parseInternalPackageSpecifier(specifier);
      assert.ok(
        internalImport,
        `${rootLabel} imports external package ${specifier}; browser entrypoints are fail-closed until the dependency is explicitly modeled`
      );
      const dependencyEntry = catalogByName.get(internalImport.packageName);
      assert.ok(
        dependencyEntry,
        `${rootLabel} imports uncataloged workspace entrypoint ${specifier}`
      );
      assert.equal(
        dependencyEntry.publish,
        true,
        `${rootLabel} imports unpublished workspace entrypoint ${specifier}`
      );
      assert.ok(
        dependencyEntry.browserEntrypoints.includes(internalImport.entrypoint),
        `${rootLabel} imports ${specifier}, which is not declared as a browser entrypoint`
      );
      pending.push(
        await resolvePackageSourceEntrypoint(
          root,
          internalImport.packageName,
          internalImport.entrypoint,
          packageRecordsByName
        )
      );
    }
  }
}

export function extractRuntimeModuleSpecifiers(source, fileName = 'source.ts') {
  const sourceFile = parse(source, {
    sourceType: 'unambiguous',
    createImportExpressions: true,
    plugins: [
      ['typescript', { dts: fileName.endsWith('.d.ts') }],
      ...( /\.[jt]sx$/.test(fileName) ? ['jsx'] : []),
    ],
    allowUndeclaredExports: true,
  });
  const specifiers = new Set();
  const addLiteral = (literal, importKind) => {
    const value = literal?.type === 'StringLiteral' ? literal.value :
      literal?.type === 'TemplateLiteral' && literal.expressions.length === 0
        ? literal.quasis[0].value.cooked : undefined;
    assert.equal(typeof value, 'string',
      `${fileName} uses a non-literal ${importKind}; browser entrypoints require statically analyzable imports`);
    specifiers.add(value);
  };
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'ImportDeclaration' && node.importKind !== 'type' &&
        (node.specifiers.length === 0 || node.specifiers.some(item => item.importKind !== 'type'))) {
      addLiteral(node.source, 'import');
    } else if (node.type === 'ExportAllDeclaration' && node.exportKind !== 'type') {
      addLiteral(node.source, 'export');
    } else if (node.type === 'ExportNamedDeclaration' && node.source && node.exportKind !== 'type' &&
        node.specifiers.some(item => item.exportKind !== 'type')) {
      addLiteral(node.source, 'export');
    } else if (node.type === 'TSImportEqualsDeclaration' && node.importKind !== 'type' &&
        node.moduleReference.type === 'TSExternalModuleReference') {
      addLiteral(node.moduleReference.expression, 'import assignment');
    } else if (node.type === 'ImportExpression') {
      addLiteral(node.source, 'dynamic import');
    } else if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require') {
      addLiteral(node.arguments[0], 'require');
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) for (const child of value) visit(child);
      else if (value && typeof value === 'object' && typeof value.type === 'string') visit(value);
    }
  };
  visit(sourceFile);
  return Object.freeze([...specifiers].sort(compareAscii));
}

export function isNodeBuiltinSpecifier(specifier) {
  if (specifier.startsWith('node:')) return true;
  if (NODE_BUILTINS.has(specifier)) return true;
  const rootSpecifier = specifier.split('/')[0];
  return NODE_BUILTINS.has(rootSpecifier);
}

async function resolvePackageSourceEntrypoint(
  root,
  packageName,
  entrypoint,
  packageRecords
) {
  const record = packageRecords.get(packageName);
  assert.ok(record, `Missing manifest for ${packageName}`);
  const exportTarget = resolveConditionalExport(
    record.manifest.exports?.[entrypoint]
  );
  assert.ok(
    exportTarget,
    `${packageName} must declare an ESM export for ${entrypoint}`
  );
  assert.match(
    exportTarget,
    /^\.\/dist\/.+\.[cm]?js$/,
    `${packageName} export ${entrypoint} must point to compiled JavaScript under ./dist`
  );
  const compiledRelativePath = exportTarget.slice('./dist/'.length);
  const sourceRelativePath = compiledRelativePath.replace(/\.[cm]?js$/, '');
  const sourceRoot = path.join(root, record.directory, 'src');
  const sourcePath = await resolveSourcePath(
    path.join(sourceRoot, sourceRelativePath)
  );
  assertPathWithin(
    sourceRoot,
    sourcePath,
    `${packageName} export ${entrypoint} resolves outside its source directory`
  );
  return {
    packageDirectory: record.directory,
    packageName,
    sourcePath,
  };
}

function resolveConditionalExport(definition) {
  if (typeof definition === 'string') return definition;
  if (!definition || typeof definition !== 'object') return undefined;
  return (
    resolveConditionalExport(definition.browser) ??
    resolveConditionalExport(definition.import) ??
    resolveConditionalExport(definition.default)
  );
}

async function resolveRelativeSourceImport(
  importerPath,
  specifier,
  sourceRoot
) {
  const unresolvedPath = path.resolve(path.dirname(importerPath), specifier);
  assertPathWithin(
    sourceRoot,
    unresolvedPath,
    `${path.relative(sourceRoot, importerPath)} imports outside its package source directory: ${specifier}`
  );
  return resolveSourcePath(unresolvedPath);
}

async function resolveSourcePath(unresolvedPath) {
  const extension = path.extname(unresolvedPath);
  const withoutCompiledExtension = /\.[cm]?js$/.test(extension)
    ? unresolvedPath.slice(0, -extension.length)
    : unresolvedPath;
  const candidates = [];

  if (extension && !/\.[cm]?js$/.test(extension)) {
    candidates.push(unresolvedPath);
  }
  for (const sourceExtension of SOURCE_EXTENSIONS) {
    candidates.push(`${withoutCompiledExtension}${sourceExtension}`);
  }
  for (const sourceExtension of SOURCE_EXTENSIONS) {
    candidates.push(
      path.join(withoutCompiledExtension, `index${sourceExtension}`)
    );
  }

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  assert.fail(`Unable to resolve source import ${unresolvedPath}`);
}

function assertPathWithin(parent, target, message) {
  const relative = path.relative(parent, target);
  assert.ok(
    relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative),
    message
  );
}

function parseInternalPackageSpecifier(specifier) {
  const match = /^(@agentplat\/[^/]+)(\/.*)?$/.exec(specifier);
  if (!match) return undefined;
  return {
    entrypoint: match[2] ? `.${match[2]}` : '.',
    packageName: match[1],
  };
}

function internalDependencies(manifest) {
  return INTERNAL_DEPENDENCY_FIELDS.flatMap((field) =>
    Object.keys(manifest[field] ?? {})
      .filter((dependency) => dependency.startsWith('@agentplat/'))
      .sort(compareAscii)
      .map((dependency) => [field, dependency])
  );
}

function allDependencies(manifest) {
  return INTERNAL_DEPENDENCY_FIELDS.flatMap((field) =>
    Object.keys(manifest[field] ?? {})
      .sort(compareAscii)
      .map((dependency) => [field, dependency])
  );
}

function formatEntrypoint(entrypoint) {
  return entrypoint === '.' ? '' : entrypoint.slice(1);
}

function isVendorSdk(dependency) {
  return (
    dependency === '@agentplat/provider-openai' ||
    dependency.startsWith('@openai/') ||
    dependency.startsWith('@anthropic-ai/') ||
    dependency.startsWith('@google/generative-ai')
  );
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  await verifyRelease();
}
