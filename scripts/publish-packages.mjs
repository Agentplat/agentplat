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

const status = runGit(['status', '--porcelain']);
if (status.trim()) {
  console.error('Refusing to publish from a dirty working tree.');
  process.exit(1);
}
const branch = runGit(['branch', '--show-current']).trim();
if (!prerelease && branch !== 'main' && branch !== 'master') {
  console.error(`Refusing to publish a stable release from branch ${branch}.`);
  process.exit(1);
}

const publishArguments = [
  '-r',
  'publish',
  '--access',
  'public',
  '--tag',
  distributionTag,
  '--no-git-checks',
];
if (process.env.NPM_PUBLISH_DRY_RUN === '1') {
  publishArguments.push('--dry-run');
}
const result = spawnSync('pnpm', publishArguments, {
  stdio: 'inherit',
  env: process.env,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);

function runGit(arguments_) {
  const result = spawnSync('git', arguments_, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${arguments_.join(' ')} failed`);
  }
  return result.stdout;
}
