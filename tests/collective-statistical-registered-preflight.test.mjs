import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const workflow = path.join(
  root,
  '.github/workflows/collective-statistical-registered-preflight.yml',
);
const cli = path.join(
  root,
  'scripts/collective-beta3-registered-preflight.mjs',
);
const worker = path.join(
  root,
  'scripts/collective-beta3-registered-runner-worker.mjs',
);

function runCli(args) {
  return spawnSync('node', [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

test('registered preflight workflow is manual, least-privilege, protected and bounded', async () => {
  const source = await readFile(workflow, 'utf8');
  const planJob = source.slice(
    source.indexOf('jobs:\n  plan:'),
    source.indexOf('\n  execution-gate:'),
  );
  const protectedPreflightJob = source.slice(source.indexOf('\n  preflight:'));
  assert.match(source, /^\s*workflow_dispatch:/m);
  assert.doesNotMatch(
    source,
    /^\s*(?:push|pull_request|schedule|workflow_call):/m,
  );
  assert.match(source, /contents: read/);
  assert.match(source, /environment: normative-campaign-protected/);
  assert.match(source, /RUN_REGISTERED_PREFLIGHT_5X4/);
  assert.match(
    source,
    /\[\[ "\$CONFIRM" == "RUN_REGISTERED_PREFLIGHT_5X4" \]\]/,
  );
  assert.match(source, /steps\.gate\.outputs\.adapter_registered/);
  assert.match(
    source,
    /needs\.execution-gate\.result == 'success' && needs\.execution-gate\.outputs\.adapter_registered == 'true'/,
  );
  assert.doesNotMatch(source, /continue-on-error:\s*true/);
  assert.doesNotMatch(
    source,
    /cache:\s*pnpm/u,
    'setup-node must not request pnpm caching before corepack enables pnpm',
  );
  assert.equal(
    (
      source.match(
        /path: \$\{\{ runner\.temp \}\}\/registered-preflight-plan/g,
      ) ?? []
    ).length,
    3,
  );
  assert.doesNotMatch(
    source,
    /^\s+path:\s+registered-preflight-/mu,
    'downloaded and generated evidence must not dirty the source checkout',
  );
  assert.doesNotMatch(source, /^\s*(?:push|pull_request|schedule):/m);
  assert.doesNotMatch(
    source,
    /\b(?:npm publish|pnpm publish|deploy|dist-tag)\b/i,
  );
  assert.equal(
    (
      source.match(/secrets\.AGENTPLAT_PREFLIGHT_SIGNING_PRIVATE_KEY_B64/g) ??
      []
    ).length,
    1,
  );
  assert.equal(
    (source.match(/secrets\.AGENTPLAT_PREFLIGHT_DATABASE_PASSWORD/g) ?? [])
      .length,
    3,
  );
  assert.doesNotMatch(planJob, /AGENTPLAT_PREFLIGHT_SIGNING_PRIVATE_KEY_B64/);
  assert.match(
    protectedPreflightJob,
    /AGENTPLAT_PREFLIGHT_SIGNING_PRIVATE_KEY_B64/,
  );
  assert.equal(
    (source.match(/vars\.AGENTPLAT_PREFLIGHT_TRUSTED_PUBLIC_KEY_B64/g) ?? [])
      .length,
    3,
  );
  assert.doesNotMatch(
    source
      .replaceAll('secrets.AGENTPLAT_PREFLIGHT_SIGNING_PRIVATE_KEY_B64', '')
      .replaceAll('secrets.AGENTPLAT_PREFLIGHT_DATABASE_PASSWORD', ''),
    /secrets\./i,
  );
  assert.doesNotMatch(source, /^\s+matrix:/m);
  assert.match(
    source,
    /image: postgres:16\.14-alpine3\.24@sha256:[a-f0-9]{64}/,
  );
  assert.match(
    source,
    /node:20\.19\.3-bookworm-slim@sha256:fa43945ad45c5f8c50dbea0633d888ddeb739f7d4e06c7696a9d68b54054238a/,
  );
  for (const match of source.matchAll(/uses: ([^\s#]+)/g))
    assert.match(match[1], /@[a-f0-9]{40}$/);
});

test('workflow executes exactly one protected five-cell, twenty-slot preflight and then resumes it', async () => {
  const source = await readFile(workflow, 'utf8');
  assert.match(
    source,
    /--mode execute --confirm RUN_REGISTERED_PREFLIGHT_5X4/g,
  );
  assert.equal(
    (
      source.match(/--mode execute --confirm RUN_REGISTERED_PREFLIGHT_5X4/g) ??
      []
    ).length,
    2,
  );
  assert.match(source, /Execute the exact five-cell preflight/);
  assert.match(
    source,
    /Resume from a fresh process without re-executing slots/,
  );
  assert.match(source, /executedSlotCount===20&&x\.resumedSlotCount===0/);
  assert.match(source, /executedSlotCount===0&&x\.resumedSlotCount===20/);
  assert.match(source, /fullCampaignPermitted!==false/);
  assert.match(source, /releaseEvidence!==false/);
  assert.match(source, /Upload public preflight receipts only/);
  assert.match(source, /preflight-receipt-\*\.json/);
  assert.doesNotMatch(
    source,
    /upload-artifact[\s\S]*?registered-preflight-plan\/[\s\S]*?authorization\.json/i,
  );
});

test('CLI fails closed for unknown modes and non-exact confirmations before any operation', () => {
  const unknown = runCli(['--mode', 'unknown']);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /registered_preflight_failed/);

  const plan = runCli([
    '--mode',
    'plan',
    '--confirm',
    'RUN_REGISTERED_PREFLIGHT_5X4',
    '--campaign-id',
    'campaign:test',
    '--source-sha',
    'a'.repeat(40),
    '--output-directory',
    '/tmp/registered-preflight-test-must-not-write',
  ]);
  assert.equal(plan.status, 2);
  assert.match(plan.stderr, /registered_preflight_failed/);

  const validate = runCli([
    '--mode',
    'validate',
    '--confirm',
    'DO_NOT_RUN',
    '--campaign-id',
    'campaign:test',
    '--source-sha',
    'a'.repeat(40),
    '--registration-directory',
    '/tmp/registered-preflight-test-missing',
    '--output-directory',
    '/tmp/registered-preflight-test-must-not-write',
  ]);
  assert.equal(validate.status, 2);
  assert.match(validate.stderr, /registered_preflight_failed/);
});

test('CLI source contains no path to a complete campaign or paid provider', async () => {
  const source = await readFile(cli, 'utf8');
  const workerSource = await readFile(worker, 'utf8');
  assert.match(source, /const PREFLIGHT_SHARD = 2/);
  assert.match(source, /cellCount: 5/);
  assert.match(source, /slotCount: 20/);
  assert.match(source, /maximumCells: 5/);
  assert.match(source, /paidProviderCalls: 0/);
  assert.match(source, /fullCampaignPermitted: false/);
  assert.match(source, /releaseEvidence: false/);
  assert.match(source, /preflight_authorization_trust_anchor_mismatch/);
  assert.match(source, /delete process\.env\.AGENTPLAT_PREFLIGHT_DATABASE_URL/);
  assert.match(
    source,
    /delete process\.env\.AGENTPLAT_PREFLIGHT_DATABASE_USER/,
  );
  assert.match(
    source,
    /delete process\.env\.AGENTPLAT_PREFLIGHT_DATABASE_PASSWORD/,
  );
  assert.doesNotMatch(source, /postgresql:\/\/[^/\s]+:[^@\s]+@/u);
  assert.match(source, /parsed\.username !== ''/u);
  assert.match(source, /parsed\.password !== ''/u);
  assert.match(source, /connectionTimeoutMillis: 10_000/u);
  assert.match(source, /['"]--network['"],\s*['"]none['"]/u);
  assert.match(source, /['"]--read-only['"]/u);
  assert.match(source, /['"]--cap-drop['"],\s*['"]ALL['"]/u);
  assert.match(source, /['"]--pull['"],\s*['"]never['"]/u);
  assert.doesNotMatch(
    workerSource,
    /(?:postgres|AGENTPLAT_PREFLIGHT_DATABASE|node:(?:net|http)|child_process|process\.env)/u,
  );
  assert.match(workerSource, /input: process\.stdin/u);
  assert.doesNotMatch(source, /(?:openai|anthropic|gemini|bedrock|vertex)/i);
  assert.doesNotMatch(source, /(?:npm publish|pnpm publish|deploy|dist-tag)/i);
});
