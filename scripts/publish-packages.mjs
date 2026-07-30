import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPublicAudit } from './audit-public.mjs';
import {
  loadPublicPackageCatalog,
  publishablePackages,
} from './public-package-catalog.mjs';
import { loadExternalTerminologyDenylist } from './public-audit-terminology.mjs';

export const PUBLIC_NPM_REGISTRY_ARGUMENTS = Object.freeze([
  '--registry=https://registry.npmjs.org/',
  '--@agentplat:registry=https://registry.npmjs.org/',
]);

export async function publishPackages({
  root = process.cwd(),
  environment = process.env,
} = {}) {
  const distributionTag = environment.NPM_DIST_TAG ?? 'latest';
  const dryRun = environment.NPM_PUBLISH_DRY_RUN === '1';
  if (!/^[a-z][0-9a-z._-]*$/i.test(distributionTag)) {
    throw new TypeError(`Invalid npm distribution tag: ${distributionTag}`);
  }

  const rootManifest = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8')
  );
  const prerelease = rootManifest.version.includes('-');
  if (prerelease && distributionTag === 'latest') {
    throw new Error(
      `Refusing to publish prerelease ${rootManifest.version} under the latest tag.`
    );
  }

  const blockedTerms = await loadExternalTerminologyDenylist({
    root,
    filePath: environment.AGENTPLAT_PUBLIC_DENYLIST_FILE,
    required: true,
  });
  await runPublicAudit({
    root,
    blockedTerms,
    requireTerminologyDenylist: true,
  });

  const status = runGit(root, ['status', '--porcelain'], environment);
  if (status.trim()) {
    throw new Error('Refusing to publish from a dirty working tree.');
  }
  const branch = runGit(root, ['branch', '--show-current'], environment).trim();
  if (branch !== 'main' && branch !== 'master') {
    throw new Error(
      `Refusing to ${dryRun ? 'simulate' : 'publish'} a release from branch ${branch || '(detached HEAD)'}.`
    );
  }
  const commit = runGit(root, ['rev-parse', 'HEAD'], environment).trim();
  assert.match(
    commit,
    /^[0-9a-f]{40,64}$/i,
    'Unable to resolve release commit'
  );
  const stagingTag = `agentplat-stage-${commit.slice(0, 12).toLowerCase()}`;
  assert.notEqual(
    distributionTag,
    stagingTag,
    'Final distribution tag must differ from the staging tag'
  );

  const catalog = await loadPublicPackageCatalog(root);
  const packages = publishablePackages(catalog);
  const manifests = new Map();
  for (const packageEntry of packages) {
    const manifest = JSON.parse(
      await readFile(
        path.join(root, packageEntry.directory, 'package.json'),
        'utf8'
      )
    );
    assert.equal(manifest.name, packageEntry.name);
    assert.equal(
      manifest.version,
      rootManifest.version,
      `${manifest.name} must use the coordinated release version`
    );
    manifests.set(manifest.name, manifest);
  }
  const orderedPackages = topologicalPackages(packages, manifests);
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'agentplat-publish-')
  );
  const tarballRoot = path.join(temporaryRoot, 'tarballs');
  const extractionRoot = path.join(temporaryRoot, 'extracted');
  const registryArtifactRoot = path.join(temporaryRoot, 'registry');

  try {
    await Promise.all([
      mkdir(tarballRoot, { recursive: true }),
      mkdir(extractionRoot, { recursive: true }),
      mkdir(registryArtifactRoot, { recursive: true }),
    ]);
    const artifacts = [];
    for (const packageEntry of orderedPackages) {
      const manifest = manifests.get(packageEntry.name);
      run(
        root,
        environment,
        'corepack',
        ['pnpm', 'pack', '--pack-destination', tarballRoot],
        {
          cwd: path.join(root, packageEntry.directory),
          stdio: 'pipe',
        }
      );
      const tarballName = expectedTarballName(manifest);
      const tarballPath = path.join(tarballRoot, tarballName);
      assert.ok(
        (await readdir(tarballRoot)).includes(tarballName),
        `Missing prepacked artifact for ${manifest.name}`
      );

      const packageExtractionRoot = path.join(
        extractionRoot,
        packageEntry.name.slice('@agentplat/'.length)
      );
      await mkdir(packageExtractionRoot, { recursive: true });
      extractPackageTarball({
        root,
        environment,
        tarballPath,
        destination: packageExtractionRoot,
      });
      assert.deepEqual(
        (await readdir(packageExtractionRoot)).sort(),
        ['package'],
        `${manifest.name} tarball must contain only the package root`
      );
      const extractedPackageRoot = path.join(packageExtractionRoot, 'package');
      const packedManifest = JSON.parse(
        await readFile(path.join(extractedPackageRoot, 'package.json'), 'utf8')
      );
      assert.equal(packedManifest.name, manifest.name);
      assert.equal(packedManifest.version, manifest.version);
      await runPublicAudit({
        root: extractedPackageRoot,
        blockedTerms,
        requireTerminologyDenylist: true,
        excludedDirectories: [],
        excludedFiles: [],
      });

      artifacts.push({
        packageEntry,
        manifest,
        tarballPath,
        extractedPackageRoot,
        integrity: await sha512Integrity(tarballPath),
      });
    }

    const registryState = new Map();
    for (const artifact of artifacts) {
      const existingIntegrity = registryIntegrity({
        environment,
        packageName: artifact.manifest.name,
        root,
        version: artifact.manifest.version,
      });
      if (existingIntegrity === undefined) {
        registryState.set(artifact.manifest.name, {
          action: 'publish',
          expectedRegistryIntegrity: artifact.integrity,
        });
        continue;
      }
      if (existingIntegrity !== artifact.integrity) {
        await verifyExistingRegistryArtifactEquivalent({
          artifact,
          blockedTerms,
          environment,
          registryArtifactRoot,
          registryIntegrity: existingIntegrity,
          root,
        });
        console.log(
          `Verified existing ${artifact.manifest.name}@${artifact.manifest.version}; authenticated extracted contents match after canonicalizing package.json object key order.`
        );
      } else {
        determineUploadAction({
          existingIntegrity,
          localIntegrity: artifact.integrity,
          packageName: artifact.manifest.name,
          version: artifact.manifest.version,
        });
      }
      registryState.set(artifact.manifest.name, {
        action: 'skip',
        expectedRegistryIntegrity: existingIntegrity,
      });
    }

    console.log(
      `${dryRun ? 'Dry-running' : 'Publishing'} ${artifacts.length} prepacked packages in dependency order with staging tag ${stagingTag}.`
    );
    for (const artifact of artifacts) {
      const name = artifact.manifest.name;
      const version = artifact.manifest.version;
      if (registryState.get(name).action === 'skip') {
        console.log(
          `Verified existing ${name}@${version}; skipping immutable version upload.`
        );
        if (!dryRun) {
          addDistributionTag({
            environment,
            packageName: name,
            root,
            tag: stagingTag,
            version,
          });
        }
        continue;
      }

      const publishArguments = [
        'publish',
        artifact.tarballPath,
        '--access',
        'public',
        '--tag',
        stagingTag,
        ...PUBLIC_NPM_REGISTRY_ARGUMENTS,
      ];
      if (dryRun) publishArguments.push('--dry-run');
      run(root, environment, 'npm', publishArguments, {
        cwd: root,
        stdio: 'inherit',
      });

      if (!dryRun) {
        const publishedIntegrity = await waitForRegistryIntegrity({
          environment,
          packageName: name,
          root,
          version,
        });
        assert.equal(
          publishedIntegrity,
          artifact.integrity,
          `${name}@${version} registry integrity differs after publishing`
        );
      }
    }

    if (dryRun) {
      for (const artifact of artifacts) {
        console.log(
          `[dry-run] Would promote ${artifact.manifest.name}@${artifact.manifest.version} to ${distributionTag}.`
        );
      }
      console.log(
        `Dry run completed: all ${artifacts.length} packages were prepacked and existing versions were integrity-checked; no distribution tags changed.`
      );
      return;
    }

    const stagingCleanupFailures = [];
    for (const artifact of artifacts) {
      const { name, version } = artifact.manifest;
      const verifiedIntegrity = await waitForRegistryIntegrity({
        environment,
        packageName: name,
        root,
        version,
      });
      assert.equal(
        verifiedIntegrity,
        registryState.get(name).expectedRegistryIntegrity,
        `${name}@${version} failed final integrity verification`
      );
    }
    for (const artifact of artifacts) {
      addDistributionTag({
        environment,
        packageName: artifact.manifest.name,
        root,
        tag: distributionTag,
        version: artifact.manifest.version,
      });
    }
    for (const artifact of artifacts) {
      const { name, version } = artifact.manifest;
      const distributionTags = registryDistributionTags({
        environment,
        packageName: name,
        root,
      });
      const stagingTags = new Set([
        stagingTag,
        ...stagingTagsForVersion(distributionTags, version),
      ]);
      for (const tag of [...stagingTags].sort()) {
        try {
          removeDistributionTag({
            environment,
            packageName: name,
            root,
            tag,
          });
        } catch (error) {
          stagingCleanupFailures.push(error);
        }
      }
    }
    if (stagingCleanupFailures.length > 0) {
      throw new AggregateError(
        stagingCleanupFailures,
        `Unable to remove ${stagingCleanupFailures.length} staging distribution tags after promotion`
      );
    }
    console.log(
      `Published and promoted ${artifacts.length} cataloged packages to ${distributionTag}.`
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export function topologicalPackages(packageEntries, packageManifests) {
  const byName = new Map(
    packageEntries.map((packageEntry) => [packageEntry.name, packageEntry])
  );
  const permanent = new Set();
  const temporary = new Set();
  const ordered = [];

  const visit = (packageName, trail = []) => {
    if (permanent.has(packageName)) return;
    if (temporary.has(packageName)) {
      throw new Error(
        `Public package dependency cycle: ${[...trail, packageName].join(' -> ')}`
      );
    }
    temporary.add(packageName);
    const manifest = packageManifests.get(packageName);
    assert.ok(manifest, `Missing manifest for ${packageName}`);
    const internalDependencies = runtimeDependencyNames(manifest)
      .filter((dependency) => dependency.startsWith('@agentplat/'))
      .sort();
    for (const dependency of internalDependencies) {
      assert.ok(
        byName.has(dependency),
        `${packageName} depends on unpublished public package ${dependency}`
      );
      visit(dependency, [...trail, packageName]);
    }
    temporary.delete(packageName);
    permanent.add(packageName);
    ordered.push(byName.get(packageName));
  };

  for (const packageName of [...byName.keys()].sort()) visit(packageName);
  return ordered;
}

export function determineUploadAction({
  existingIntegrity,
  localIntegrity,
  packageName,
  version,
}) {
  if (existingIntegrity === undefined) return 'publish';
  assert.equal(
    existingIntegrity,
    localIntegrity,
    `${packageName}@${version} already exists with different integrity`
  );
  return 'skip';
}

export function parseRegistryIntegrityResult(result, packageName, version) {
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    if (/\bE404\b|404 Not Found|is not in this registry/i.test(output)) {
      return undefined;
    }
    throw new Error(
      `Unable to inspect ${packageName}@${version}: ${output.trim()}`
    );
  }
  const output = String(result.stdout ?? '').trim();
  assert.ok(output, `${packageName}@${version} has no registry integrity`);
  const parsed = JSON.parse(output);
  assert.equal(
    typeof parsed,
    'string',
    `${packageName}@${version} returned invalid registry integrity`
  );
  assert.match(
    parsed,
    /^sha512-[A-Za-z0-9+/]+={0,2}$/,
    `${packageName}@${version} returned unsupported registry integrity`
  );
  return parsed;
}

export function parseRegistryDistributionTags(result, packageName) {
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
    throw new Error(
      `Unable to inspect distribution tags for ${packageName}: ${output}`
    );
  }
  const parsed = JSON.parse(String(result.stdout ?? '').trim());
  assert.ok(
    parsed && typeof parsed === 'object' && !Array.isArray(parsed),
    `${packageName} returned invalid registry distribution tags`
  );
  for (const [tag, version] of Object.entries(parsed)) {
    assert.match(tag, /^[a-z][0-9a-z._-]*$/i);
    assert.equal(
      typeof version,
      'string',
      `${packageName} returned an invalid version for distribution tag ${tag}`
    );
  }
  return parsed;
}

export function stagingTagsForVersion(distributionTags, version) {
  return Object.entries(distributionTags)
    .filter(
      ([tag, taggedVersion]) =>
        tag.startsWith('agentplat-stage-') && taggedVersion === version
    )
    .map(([tag]) => tag)
    .sort();
}

export async function assertPackageTreesEquivalent(
  localPackageRoot,
  registryPackageRoot
) {
  const [localEntries, registryEntries] = await Promise.all([
    packageTreeEntries(localPackageRoot),
    packageTreeEntries(registryPackageRoot),
  ]);
  assert.deepEqual(
    [...registryEntries.keys()],
    [...localEntries.keys()],
    'Registry package tree differs from the local package tree'
  );
  for (const [relativePath, localEntry] of localEntries) {
    const registryEntry = registryEntries.get(relativePath);
    assert.equal(
      registryEntry.type,
      localEntry.type,
      `Package entry type differs for ${relativePath}`
    );
    assert.equal(
      registryEntry.mode,
      localEntry.mode,
      `Package permission mode differs for ${relativePath}`
    );
    if (localEntry.type !== 'file') continue;
    if (relativePath === 'package.json') {
      assert.equal(
        canonicalJson(registryEntry.contents, relativePath),
        canonicalJson(localEntry.contents, relativePath),
        'Registry package.json differs from the local package.json'
      );
      continue;
    }
    assert.ok(
      registryEntry.contents.equals(localEntry.contents),
      `Package file contents differ for ${relativePath}`
    );
  }
}

export function extractPackageTarball({
  destination,
  environment,
  root,
  tarballPath,
}) {
  assertSafeTarballPaths(root, environment, tarballPath);
  run(root, environment, 'tar', ['-xzpf', tarballPath, '-C', destination], {
    stdio: 'pipe',
  });
}

function runtimeDependencyNames(manifest) {
  return [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ];
}

function expectedTarballName(manifest) {
  return `agentplat-${manifest.name.slice('@agentplat/'.length)}-${manifest.version}.tgz`;
}

async function sha512Integrity(file) {
  return `sha512-${createHash('sha512')
    .update(await readFile(file))
    .digest('base64')}`;
}

async function packageTreeEntries(root) {
  const entries = new Map();
  const rootStats = await lstat(root);
  assert.equal(
    rootStats.isSymbolicLink(),
    false,
    'Package root must not be a symbolic link'
  );
  assert.ok(rootStats.isDirectory(), 'Package root must be a directory');
  entries.set('.', {
    type: 'directory',
    mode: rootStats.mode & 0o7777,
  });

  async function visit(directory, relativeDirectory = '') {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const relativePath = path.posix.join(relativeDirectory, child.name);
      const absolutePath = path.join(directory, child.name);
      const stats = await lstat(absolutePath);
      assert.equal(
        stats.isSymbolicLink(),
        false,
        `Package tree must not contain symbolic links: ${relativePath}`
      );
      if (stats.isDirectory()) {
        entries.set(relativePath, {
          type: 'directory',
          mode: stats.mode & 0o7777,
        });
        await visit(absolutePath, relativePath);
        continue;
      }
      assert.ok(
        stats.isFile(),
        `Package tree contains unsupported entry: ${relativePath}`
      );
      assert.equal(
        stats.nlink,
        1,
        `Package tree must not contain hard links: ${relativePath}`
      );
      entries.set(relativePath, {
        type: 'file',
        mode: stats.mode & 0o7777,
        contents: await readFile(absolutePath),
      });
    }
  }

  await visit(root);
  return entries;
}

function canonicalJson(contents, relativePath) {
  let parsed;
  try {
    parsed = new CanonicalJsonParser(
      new TextDecoder('utf-8', {
        fatal: true,
        ignoreBOM: true,
      }).decode(contents)
    ).parse();
  } catch (error) {
    throw new Error(`Unable to parse ${relativePath}`, { cause: error });
  }
  return parsed;
}

const jsonNumberPattern = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

class CanonicalJsonParser {
  constructor(source) {
    this.source = source;
    this.index = 0;
  }

  parse() {
    this.skipWhitespace();
    const value = this.parseValue();
    this.skipWhitespace();
    if (this.index !== this.source.length) this.fail('trailing input');
    return value;
  }

  parseValue() {
    const character = this.source[this.index];
    if (character === '{') return this.parseObject();
    if (character === '[') return this.parseArray();
    if (character === '"') return `s${JSON.stringify(this.parseString())}`;
    if (this.source.startsWith('true', this.index)) {
      this.index += 4;
      return 'b1';
    }
    if (this.source.startsWith('false', this.index)) {
      this.index += 5;
      return 'b0';
    }
    if (this.source.startsWith('null', this.index)) {
      this.index += 4;
      return 'z';
    }
    if (character === '-' || (character >= '0' && character <= '9')) {
      return this.parseNumber();
    }
    return this.fail('invalid value');
  }

  parseObject() {
    this.index += 1;
    this.skipWhitespace();
    const entries = [];
    const keys = new Set();
    if (this.source[this.index] === '}') {
      this.index += 1;
      return 'o{}';
    }
    while (this.index < this.source.length) {
      if (this.source[this.index] !== '"') this.fail('invalid object key');
      const key = this.parseString();
      if (keys.has(key))
        this.fail(`duplicate object key ${JSON.stringify(key)}`);
      keys.add(key);
      this.skipWhitespace();
      if (this.source[this.index] !== ':') this.fail('missing object colon');
      this.index += 1;
      this.skipWhitespace();
      entries.push([key, this.parseValue()]);
      this.skipWhitespace();
      const delimiter = this.source[this.index];
      if (delimiter === '}') {
        this.index += 1;
        entries.sort(([left], [right]) =>
          left < right ? -1 : left > right ? 1 : 0
        );
        return `o{${entries
          .map(([entryKey, value]) => `${JSON.stringify(entryKey)}:${value}`)
          .join(',')}}`;
      }
      if (delimiter !== ',') this.fail('invalid object delimiter');
      this.index += 1;
      this.skipWhitespace();
    }
    return this.fail('unterminated object');
  }

  parseArray() {
    this.index += 1;
    this.skipWhitespace();
    const entries = [];
    if (this.source[this.index] === ']') {
      this.index += 1;
      return 'a[]';
    }
    while (this.index < this.source.length) {
      entries.push(this.parseValue());
      this.skipWhitespace();
      const delimiter = this.source[this.index];
      if (delimiter === ']') {
        this.index += 1;
        return `a[${entries.join(',')}]`;
      }
      if (delimiter !== ',') this.fail('invalid array delimiter');
      this.index += 1;
      this.skipWhitespace();
    }
    return this.fail('unterminated array');
  }

  parseString() {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length) {
      const code = this.source.charCodeAt(this.index);
      if (code === 0x22) {
        this.index += 1;
        return JSON.parse(this.source.slice(start, this.index));
      }
      if (code <= 0x1f) this.fail('invalid string character');
      if (code === 0x5c) {
        this.index += 1;
        if (this.source[this.index] === 'u') {
          if (
            !/^[0-9a-fA-F]{4}$/.test(
              this.source.slice(this.index + 1, this.index + 5)
            )
          ) {
            this.fail('invalid Unicode escape');
          }
          this.index += 5;
          continue;
        }
        if (!'"\\/bfnrt'.includes(this.source[this.index] ?? '')) {
          this.fail('invalid string escape');
        }
      }
      this.index += 1;
    }
    return this.fail('unterminated string');
  }

  parseNumber() {
    jsonNumberPattern.lastIndex = this.index;
    const match = jsonNumberPattern.exec(this.source);
    if (!match) return this.fail('invalid number');
    this.index = jsonNumberPattern.lastIndex;
    return `n${match[0].length}:${match[0]}`;
  }

  skipWhitespace() {
    while (' \n\r\t'.includes(this.source[this.index] ?? '\0')) {
      this.index += 1;
    }
  }

  fail(reason) {
    throw new SyntaxError(`${reason} at byte ${this.index}`);
  }
}

function assertSafeTarballPaths(root, environment, tarballPath) {
  const result = run(root, environment, 'tar', ['-tzf', tarballPath], {
    encoding: 'utf8',
  });
  const entries = result.stdout.split(/\r?\n/).filter(Boolean);
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
  const verboseResult = run(root, environment, 'tar', ['-tvzf', tarballPath], {
    encoding: 'utf8',
  });
  const verboseEntries = verboseResult.stdout.split(/\r?\n/).filter(Boolean);
  assert.equal(
    verboseEntries.length,
    entries.length,
    `${tarballPath} returned inconsistent tar entry metadata`
  );
  for (const entry of verboseEntries) {
    assert.match(
      entry,
      /^[d-]/,
      `Package tarball must contain only regular files and directories: ${entry}`
    );
  }
}

async function verifyExistingRegistryArtifactEquivalent({
  artifact,
  blockedTerms,
  environment,
  registryArtifactRoot,
  registryIntegrity: expectedRegistryIntegrity,
  root,
}) {
  const { name, version } = artifact.manifest;
  const packageRoot = path.join(
    registryArtifactRoot,
    name.slice('@agentplat/'.length)
  );
  const tarballRoot = path.join(packageRoot, 'tarball');
  const extractionRoot = path.join(packageRoot, 'extracted');
  await Promise.all([
    mkdir(tarballRoot, { recursive: true }),
    mkdir(extractionRoot, { recursive: true }),
  ]);
  run(
    root,
    environment,
    'npm',
    [
      'pack',
      `${name}@${version}`,
      '--pack-destination',
      tarballRoot,
      '--ignore-scripts',
      ...PUBLIC_NPM_REGISTRY_ARGUMENTS,
    ],
    { stdio: 'pipe' }
  );
  const tarballName = expectedTarballName(artifact.manifest);
  assert.deepEqual(
    (await readdir(tarballRoot)).sort(),
    [tarballName],
    `Registry download for ${name}@${version} produced unexpected files`
  );
  const tarballPath = path.join(tarballRoot, tarballName);
  assert.equal(
    await sha512Integrity(tarballPath),
    expectedRegistryIntegrity,
    `${name}@${version} download differs from registry integrity metadata`
  );
  extractPackageTarball({
    root,
    environment,
    tarballPath,
    destination: extractionRoot,
  });
  assert.deepEqual(
    (await readdir(extractionRoot)).sort(),
    ['package'],
    `${name}@${version} registry tarball must contain only the package root`
  );
  const extractedRegistryPackageRoot = path.join(extractionRoot, 'package');
  await runPublicAudit({
    root: extractedRegistryPackageRoot,
    blockedTerms,
    requireTerminologyDenylist: true,
    excludedDirectories: [],
    excludedFiles: [],
  });
  await assertPackageTreesEquivalent(
    artifact.extractedPackageRoot,
    extractedRegistryPackageRoot
  );
}

function registryIntegrity({ environment, packageName, root, version }) {
  const result = spawnSync(
    'npm',
    [
      'view',
      `${packageName}@${version}`,
      'dist.integrity',
      '--json',
      ...PUBLIC_NPM_REGISTRY_ARGUMENTS,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: environment,
    }
  );
  return parseRegistryIntegrityResult(result, packageName, version);
}

function registryDistributionTags({ environment, packageName, root }) {
  const result = spawnSync(
    'npm',
    [
      'view',
      packageName,
      'dist-tags',
      '--json',
      ...PUBLIC_NPM_REGISTRY_ARGUMENTS,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: environment,
    }
  );
  return parseRegistryDistributionTags(result, packageName);
}

async function waitForRegistryIntegrity({
  environment,
  packageName,
  root,
  version,
}) {
  const delays = [0, 1_000, 2_000, 4_000, 8_000, 16_000, 30_000];
  for (const delay of delays) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    const integrity = registryIntegrity({
      environment,
      packageName,
      root,
      version,
    });
    if (integrity !== undefined) return integrity;
  }
  throw new Error(
    `${packageName}@${version} did not become visible in the registry`
  );
}

function addDistributionTag({ environment, packageName, root, tag, version }) {
  run(
    root,
    environment,
    'npm',
    [
      'dist-tag',
      'add',
      `${packageName}@${version}`,
      tag,
      ...PUBLIC_NPM_REGISTRY_ARGUMENTS,
    ],
    {
      cwd: root,
      stdio: 'inherit',
    }
  );
}

function removeDistributionTag({ environment, packageName, root, tag }) {
  const result = spawnSync(
    'npm',
    ['dist-tag', 'rm', packageName, tag, ...PUBLIC_NPM_REGISTRY_ARGUMENTS],
    {
      cwd: root,
      encoding: 'utf8',
      env: environment,
    }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Unable to remove staging tag ${tag} from ${packageName}: ${`${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim()}`
    );
  }
  console.log(String(result.stdout ?? '').trim());
}

function runGit(root, arguments_, environment) {
  const result = run(root, environment, 'git', arguments_, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return result.stdout;
}

function run(root, environment, command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: options.cwd ?? root,
    encoding: options.encoding,
    stdio: options.stdio ?? 'pipe',
    env: environment,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details =
      options.stdio === 'inherit'
        ? ''
        : `\n${String(result.stdout ?? '')}${String(result.stderr ?? '')}`;
    throw new Error(
      `${command} ${arguments_.join(' ')} failed with status ${result.status}.${details}`
    );
  }
  return result;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    await publishPackages();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
