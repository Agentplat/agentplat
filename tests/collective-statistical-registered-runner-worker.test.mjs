import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';

const enabled = process.env.AGENTPLAT_DOCKER_ISOLATION_TEST === '1';
const root = path.resolve(import.meta.dirname, '..');
const image =
  'node:20.19.3-bookworm-slim@sha256:fa43945ad45c5f8c50dbea0633d888ddeb739f7d4e06c7696a9d68b54054238a';

test(
  'digest-pinned runner container executes with a read-only filesystem and no network',
  { skip: !enabled, timeout: 120_000 },
  async () => {
    const child = spawn(
      'docker',
      [
        'run',
        '--rm',
        '-i',
        '--pull',
        'never',
        '--network',
        'none',
        '--read-only',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--pids-limit',
        '128',
        '--memory',
        '4g',
        '--cpus',
        '2',
        '--tmpfs',
        '/tmp:rw,noexec,nosuid,nodev,size=64m',
        '--volume',
        `${root}:/workspace:ro`,
        '--workdir',
        '/workspace',
        image,
        'node',
        'scripts/collective-beta3-registered-runner-worker.mjs',
      ],
      { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    const result = new Promise((resolve, reject) => {
      lines.once('line', (line) => {
        try {
          resolve(JSON.parse(line));
        } catch (error) {
          reject(error);
        }
      });
      child.once('error', reject);
    });
    child.stdin.write(
      `${JSON.stringify({
        type: 'execute',
        id: 1,
        context: {
          schemaVersion: 1,
          executionId: 'execution:isolated-worker-test',
          registrationDigest: `sha256:${'1'.repeat(64)}`,
          runKey: 'run:isolated-worker-test',
          cell: {
            schemaVersion: 1,
            cellId: 'cell:isolated-worker-test',
            peerCount: 50,
            stratum: 'nominal',
            seed: 0,
            maximumInteractions: 1_000,
          },
          runner: 'adaptive_collective',
          attempt: 'first',
          maximumInteractions: 1_000,
        },
      })}\n`,
    );
    const message = await result;
    assert.equal(message.type, 'result');
    assert.equal(message.id, 1);
    assert.equal(message.ok, true);
    assert.equal(message.output.status, 'passed');
    child.stdin.end(`${JSON.stringify({ type: 'close' })}\n`);
    const [code] = await once(child, 'close');
    assert.equal(code, 0);
  },
);
