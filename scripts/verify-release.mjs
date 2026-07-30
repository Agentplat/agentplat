import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
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
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForFile(fileName)
  );
  const specifiers = new Set();

  const addLiteral = (literal, importKind) => {
    assert.ok(
      literal && ts.isStringLiteralLike(literal),
      `${fileName} uses a non-literal ${importKind}; browser entrypoints require statically analyzable imports`
    );
    specifiers.add(literal.text);
  };

  const visit = (node) => {
    if (
      ts.isImportDeclaration(node) &&
      importDeclarationHasRuntimeEffect(node)
    ) {
      addLiteral(node.moduleSpecifier, 'import');
    } else if (
      ts.isExportDeclaration(node) &&
      exportDeclarationHasRuntimeEffect(node)
    ) {
      addLiteral(node.moduleSpecifier, 'export');
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      !node.isTypeOnly &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      addLiteral(node.moduleReference.expression, 'import assignment');
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require'))
    ) {
      addLiteral(
        node.arguments[0],
        node.expression.kind === ts.SyntaxKind.ImportKeyword
          ? 'dynamic import'
          : 'require'
      );
    }
    ts.forEachChild(node, visit);
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

function importDeclarationHasRuntimeEffect(node) {
  const clause = node.importClause;
  if (!clause) return true;
  if (clause.isTypeOnly) return false;
  if (clause.name) return true;
  if (!clause.namedBindings) return true;
  if (ts.isNamespaceImport(clause.namedBindings)) return true;
  if (ts.isNamedImports(clause.namedBindings)) {
    return clause.namedBindings.elements.some((element) => !element.isTypeOnly);
  }
  return true;
}

function exportDeclarationHasRuntimeEffect(node) {
  if (!node.moduleSpecifier || node.isTypeOnly) return false;
  if (node.exportClause && ts.isNamedExports(node.exportClause)) {
    return node.exportClause.elements.some((element) => !element.isTypeOnly);
  }
  return true;
}

function scriptKindForFile(fileName) {
  if (fileName.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (fileName.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (fileName.endsWith('.js') || fileName.endsWith('.mjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
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
