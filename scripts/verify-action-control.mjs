import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

assert.equal(process.env.AGENTPLAT_POSTGRES_TEST, '1',
  'Action-control qualification requires AGENTPLAT_POSTGRES_TEST=1 and a disposable local PostgreSQL database');
const tests = [
  'tests/inference-control-action-control-postgres.test.mjs',
  'tests/inference-control-action-effects.test.mjs',
  'tests/inference-control-action-admission.test.mjs',
  'tests/inference-control-action-admission-postgres.test.mjs',
  'tests/inference-control-action-approvals.test.mjs',
  'tests/inference-control-action-approvals-postgres.test.mjs',
  'tests/inference-control-grant-builder.test.mjs',
  'tests/inference-control-gateways.test.mjs',
  'tests/inference-control-action-grant-repository.test.mjs',
];
execFileSync('pnpm', ['run','build'], { stdio: 'inherit' });
execFileSync('pnpm', ['run','type-check:public'], { stdio: 'inherit' });
const tap = execFileSync(process.execPath, ['--test','--test-reporter=tap', ...tests], { encoding: 'utf8' });
process.stdout.write(tap);
assert.match(tap, /# fail 0\b/);
assert.match(tap, /# skipped 0\b/);
assert.match(tap, /# todo 0\b/);
assert.match(tap, /# cancelled 0\b/);
execFileSync('pnpm', ['run','verify:action-control-consumer'], { stdio: 'inherit' });
console.log('Standalone action-control qualification passed: real PostgreSQL, public types and independent tarballs; no deployment or publication.');
