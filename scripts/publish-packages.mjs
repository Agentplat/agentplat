import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const distributionTag = process.env.NPM_DIST_TAG ?? 'latest';
if (!/^[a-z][0-9a-z._-]*$/i.test(distributionTag)) {
  console.error(`Invalid npm distribution tag: ${distributionTag}`);
  process.exit(1);
}

const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const prerelease = manifest.version.includes('-');
if (prerelease && distributionTag === 'latest') {
  console.error(
    `Refusing to publish prerelease ${manifest.version} under the latest tag.`
  );
  process.exit(1);
}

const result = spawnSync(
  'pnpm',
  ['-r', 'publish', '--access', 'public', '--tag', distributionTag],
  { stdio: 'inherit', env: process.env }
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
