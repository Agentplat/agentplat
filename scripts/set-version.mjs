import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  access,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  discoverWorkspacePackageManifests,
  loadPublicPackageCatalog,
} from './public-package-catalog.mjs';

const SEMVER_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const DEFAULT_FILE_SYSTEM = Object.freeze({
  access,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
});

export async function setWorkspaceVersion(
  version,
  {
    fileSystem = DEFAULT_FILE_SYSTEM,
    root = process.cwd(),
    transactionId = randomUUID(),
  } = {}
) {
  assert.match(
    version ?? '',
    SEMVER_PATTERN,
    'The target version must be valid semantic versioning'
  );
  assert.match(
    transactionId,
    /^[0-9A-Za-z_-]+$/,
    'The version transaction ID contains unsafe characters'
  );

  const catalog = await loadPublicPackageCatalog(root);
  const discoveredManifests = await discoverWorkspacePackageManifests(root);
  assert.deepEqual(
    discoveredManifests.map((record) => record.directory),
    catalog.packages.map((entry) => entry.directory),
    'Every workspace package manifest must be cataloged before changing versions'
  );
  const manifestDefinitions = [
    {
      expectedName: undefined,
      manifestPath: path.join(root, 'package.json'),
    },
    ...catalog.packages.map((entry) => ({
      expectedName: entry.name,
      manifestPath: path.join(root, entry.directory, 'package.json'),
    })),
  ];
  assert.equal(
    new Set(manifestDefinitions.map(({ manifestPath }) => manifestPath)).size,
    manifestDefinitions.length,
    'The version transaction contains duplicate manifest paths'
  );

  const transactionRecords = await Promise.all(
    manifestDefinitions.map(async ({ expectedName, manifestPath }) => {
      const [source, metadata] = await Promise.all([
        fileSystem.readFile(manifestPath, 'utf8'),
        fileSystem.stat(manifestPath),
      ]);
      let manifest;
      try {
        manifest = JSON.parse(source);
      } catch (error) {
        throw new Error(
          `Invalid JSON in ${path.relative(root, manifestPath)}`,
          {
            cause: error,
          }
        );
      }
      assert.ok(
        manifest && typeof manifest === 'object' && !Array.isArray(manifest),
        `${path.relative(root, manifestPath)} must contain a JSON object`
      );
      assert.equal(
        typeof manifest.name,
        'string',
        `${path.relative(root, manifestPath)} must declare a package name`
      );
      assert.match(
        manifest.version ?? '',
        SEMVER_PATTERN,
        `${manifest.name} must have a valid current semantic version`
      );
      if (expectedName) {
        assert.equal(
          manifest.name,
          expectedName,
          `${path.relative(root, manifestPath)} must be ${expectedName}`
        );
      }

      const temporaryPath = `${manifestPath}.agentplat-version-${transactionId}.tmp`;
      const backupPath = `${manifestPath}.agentplat-version-${transactionId}.bak`;
      await Promise.all([
        assertPathDoesNotExist(fileSystem, temporaryPath),
        assertPathDoesNotExist(fileSystem, backupPath),
      ]);

      return {
        backupCreated: false,
        backupPath,
        content: `${JSON.stringify({ ...manifest, version }, null, 2)}\n`,
        manifestPath,
        mode: metadata.mode & 0o777,
        replaced: false,
        temporaryPath,
      };
    })
  );

  const staged = [];
  try {
    for (const record of transactionRecords) {
      await fileSystem.writeFile(record.temporaryPath, record.content, {
        flag: 'wx',
        mode: record.mode,
      });
      staged.push(record);
    }
  } catch (error) {
    await cleanupPaths(
      fileSystem,
      staged.map((record) => record.temporaryPath)
    );
    throw new Error('Unable to stage the workspace version transaction', {
      cause: error,
    });
  }

  try {
    for (const record of transactionRecords) {
      await fileSystem.rename(record.manifestPath, record.backupPath);
      record.backupCreated = true;
      await fileSystem.rename(record.temporaryPath, record.manifestPath);
      record.replaced = true;
    }
  } catch (error) {
    const rollbackErrors = await rollbackTransaction(
      fileSystem,
      transactionRecords
    );
    await cleanupPaths(
      fileSystem,
      transactionRecords.map((record) => record.temporaryPath)
    );
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        'Workspace version update failed and rollback was incomplete; .bak files were preserved'
      );
    }
    throw new Error(
      'Workspace version update failed; every changed manifest was restored',
      { cause: error }
    );
  }

  const cleanupErrors = await cleanupPaths(
    fileSystem,
    transactionRecords.map((record) => record.backupPath)
  );
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      'Workspace versions were updated, but one or more .bak files could not be removed'
    );
  }

  return {
    packageCount: catalog.packages.length,
    version,
  };
}

async function rollbackTransaction(fileSystem, records) {
  const errors = [];
  for (const record of [...records].reverse()) {
    if (!record.backupCreated) continue;
    try {
      if (record.replaced) {
        await ignoreMissing(() => fileSystem.unlink(record.manifestPath));
      }
      await fileSystem.rename(record.backupPath, record.manifestPath);
      record.backupCreated = false;
      record.replaced = false;
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

async function cleanupPaths(fileSystem, paths) {
  const errors = [];
  for (const target of paths) {
    try {
      await ignoreMissing(() => fileSystem.unlink(target));
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

async function ignoreMissing(operation) {
  try {
    await operation();
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function assertPathDoesNotExist(fileSystem, target) {
  try {
    await fileSystem.access(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  assert.fail(`Version transaction path already exists: ${target}`);
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const version = process.argv[2];
  if (!version || !SEMVER_PATTERN.test(version)) {
    console.error('Usage: pnpm version:set <semver>');
    process.exitCode = 1;
  } else {
    try {
      const result = await setWorkspaceVersion(version);
      console.log(
        `Set ${result.packageCount} cataloged package versions to ${result.version}.`
      );
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  }
}
