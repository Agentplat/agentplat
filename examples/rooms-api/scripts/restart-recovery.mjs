import { spawnSync } from 'node:child_process';

const worker = new URL('./restart-recovery-worker.mjs', import.meta.url);
const operationWorker = new URL(
  './restart-recovery-operations-worker.mjs',
  import.meta.url
);
for (const target of [worker, operationWorker]) {
  for (const phase of ['prepare', 'recover']) {
    const result = spawnSync(process.execPath, [target.pathname, phase], {
      env: process.env,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      process.stderr.write(result.stderr);
      process.exit(result.status ?? 1);
    }
    process.stdout.write(result.stdout);
  }
}
