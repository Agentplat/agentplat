import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const auditFile = fileURLToPath(import.meta.url);
const scanRoots = [
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'package.json',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  '.github',
  'packages',
  'examples',
  'tests',
  'scripts',
];
const ignoredDirectories = new Set(['.git', 'dist', 'node_modules']);
const blockedTerms = [
  'Pooshlo',
  'Trafilea',
  'Santander',
  'NoFirmes',
  'Kidney Connective',
  'thekidneyconnective',
  'El Pais',
  'elpais',
  'ContactMetrics',
  'Biodexia',
  'ClientesReales',
  'DondeVivir',
  'Grishen',
];
const patterns = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ['bearer token', /\bBearer\s+[A-Za-z0-9._~+/=-]{30,}/gi],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g],
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  [
    'provider credential',
    /\b(?:sk-(?:proj-)?|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9._-]{20,}\b/g,
  ],
  ['signed URL', /\b(?:X-Amz-Signature|X-Amz-Credential|AWSAccessKeyId)=/gi],
  [
    'credential-bearing URL',
    /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s/:]+:[^\s/@]+@/gi,
  ],
  [
    'secret assignment',
    /\b[A-Z0-9_]*(?:API_KEY|SECRET|PASSWORD|TOKEN|ACCESS_KEY|PRIVATE_KEY|CLIENT_SECRET)\s*=\s*["'][^"']{8,}["']/g,
  ],
  [
    'credential property',
    /\b(?:api[_-]?key|secret|password|token|access[_-]?key|private[_-]?key|client[_-]?secret)\s*[:=]\s*["'][A-Za-z0-9._~+/=-]{20,}["']/gi,
  ],
];

async function* walk(target) {
  const targetStat = await stat(target);
  if (targetStat.isFile()) {
    yield target;
    return;
  }
  for (const entry of await readdir(target, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    yield* walk(path.join(target, entry.name));
  }
}

const findings = [];
for (const scanRoot of scanRoots) {
  for await (const file of walk(path.join(root, scanRoot))) {
    if (file === auditFile) continue;
    const fileStat = await stat(file);
    if (fileStat.size > 1_000_000) continue;
    const contents = await readFile(file, 'utf8').catch(() => '');
    for (const term of blockedTerms) {
      if (contents.toLowerCase().includes(term.toLowerCase()))
        findings.push(
          `${path.relative(root, file)}: blocked private term "${term}"`
        );
    }
    for (const [label, pattern] of patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(contents))
        findings.push(`${path.relative(root, file)}: ${label}`);
    }
  }
}

assert.deepEqual(
  findings,
  [],
  `Public-surface audit failed:\n${findings.join('\n')}`
);
console.log(
  'Public-surface audit passed with no secret or private-domain findings.'
);
