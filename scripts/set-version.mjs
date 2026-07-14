import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('Usage: pnpm version:set <semver>');
  process.exit(1);
}

const root = process.cwd();
const manifestPaths = [path.join(root, 'package.json')];
for (const entry of await readdir(path.join(root, 'packages'), {
  withFileTypes: true,
})) {
  if (!entry.isDirectory()) continue;
  const manifestPath = path.join(root, 'packages', entry.name, 'package.json');
  try {
    await access(manifestPath);
    manifestPaths.push(manifestPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

for (const manifestPath of manifestPaths) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.version = version;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log(`Set ${manifestPaths.length - 1} package versions to ${version}.`);
