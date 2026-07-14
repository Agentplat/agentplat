import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const expectedPackages = [
  'audit',
  'auth',
  'core',
  'events',
  'mcp',
  'memory',
  'provider-openai',
  'runtime',
  'tools',
  'workflows',
];
const packageRoot = path.join(root, 'packages');
const actualPackages = [];
const rootManifest = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8')
);

assert.match(
  rootManifest.version,
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/,
  'The release version must be valid semantic versioning'
);

for (const entry of await readdir(packageRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  try {
    await access(path.join(packageRoot, entry.name, 'package.json'));
    actualPackages.push(entry.name);
  } catch {}
}

assert.deepEqual(actualPackages.sort(), expectedPackages);

for (const packageName of expectedPackages) {
  const directory = path.join(packageRoot, packageName);
  const manifest = JSON.parse(
    await readFile(path.join(directory, 'package.json'), 'utf8')
  );

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
    manifest.exports?.['.']?.import,
    `${manifest.name} must declare ESM exports`
  );
  assert.ok(manifest.scripts?.build, `${manifest.name} must define a build`);
  await access(path.join(directory, 'dist', 'index.js'));
  await access(path.join(directory, 'dist', 'index.d.ts'));
}

console.log(
  `Verified ${expectedPackages.length} publishable package manifests at ${rootManifest.version} and build outputs.`
);
