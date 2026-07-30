import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPublicAudit } from './audit-public.mjs';
import {
  loadPublicPackageCatalog,
  publishablePackages,
} from './public-package-catalog.mjs';
import { loadExternalTerminologyDenylist } from './public-audit-terminology.mjs';

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

  try {
    await Promise.all([
      mkdir(tarballRoot, { recursive: true }),
      mkdir(extractionRoot, { recursive: true }),
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
      assertSafeTarballPaths(root, environment, tarballPath);
      run(
        root,
        environment,
        'tar',
        ['-xzf', tarballPath, '-C', packageExtractionRoot],
        { stdio: 'pipe' }
      );
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
      registryState.set(
        artifact.manifest.name,
        determineUploadAction({
          existingIntegrity,
          localIntegrity: artifact.integrity,
          packageName: artifact.manifest.name,
          version: artifact.manifest.version,
        })
      );
    }

    console.log(
      `${dryRun ? 'Dry-running' : 'Publishing'} ${artifacts.length} prepacked packages in dependency order with staging tag ${stagingTag}.`
    );
    for (const artifact of artifacts) {
      const name = artifact.manifest.name;
      const version = artifact.manifest.version;
      if (registryState.get(name) === 'skip') {
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
        artifact.integrity,
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
      removeDistributionTag({
        environment,
        packageName: artifact.manifest.name,
        root,
        tag: stagingTag,
      });
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
}

function registryIntegrity({ environment, packageName, root, version }) {
  const result = spawnSync(
    'npm',
    ['view', `${packageName}@${version}`, 'dist.integrity', '--json'],
    {
      cwd: root,
      encoding: 'utf8',
      env: environment,
    }
  );
  return parseRegistryIntegrityResult(result, packageName, version);
}

async function waitForRegistryIntegrity({
  environment,
  packageName,
  root,
  version,
}) {
  const delays = [0, 1_000, 2_000, 4_000, 8_000];
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
    ['dist-tag', 'add', `${packageName}@${version}`, tag],
    {
      cwd: root,
      stdio: 'inherit',
    }
  );
}

function removeDistributionTag({ environment, packageName, root, tag }) {
  const result = spawnSync('npm', ['dist-tag', 'rm', packageName, tag], {
    cwd: root,
    stdio: 'inherit',
    env: environment,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.warn(
      `Unable to remove staging tag ${tag} from ${packageName}; the final tag is already promoted.`
    );
  }
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
