import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  loadExternalTerminologyDenylist,
  parseTerminologyDenylist,
} from './public-audit-terminology.mjs';

const maximumTextBytes = 1_000_000;
const maximumAllowedBinaryBytes = 20_000_000;
const excludedDirectoryNames = new Set([
  '.git',
  '.next',
  '.pnpm-store',
  '.turbo',
  'coverage',
  'node_modules',
]);
const excludedFileNames = new Set(['.DS_Store', '.git']);
const allowedBinaryExtensions = new Set([
  '.avif',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.pdf',
  '.png',
  '.ttf',
  '.webp',
  '.woff',
  '.woff2',
]);
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
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

export async function runPublicAudit({
  root = process.cwd(),
  terminologyDenylistFile = process.env.AGENTPLAT_PUBLIC_DENYLIST_FILE,
  requireTerminologyDenylist = false,
  blockedTerms: suppliedBlockedTerms,
  inlineTerminologyDenylist = process.env.AGENTPLAT_PUBLIC_AUDIT_BLOCKED_TERMS,
  excludedDirectories = excludedDirectoryNames,
  excludedFiles = excludedFileNames,
  evidenceExceptionFile = 'config/public-audit-evidence-exceptions-v1.json',
} = {}) {
  const requestedRoot = path.resolve(root);
  const rootStatus = await lstat(requestedRoot);
  assert.equal(
    rootStatus.isSymbolicLink(),
    false,
    `Audit root must not be a symbolic link: ${requestedRoot}`
  );
  assert.equal(
    rootStatus.isDirectory(),
    true,
    `Audit root must be a directory: ${requestedRoot}`
  );
  const resolvedRoot = await realpath(requestedRoot);
  const externalBlockedTerms =
    suppliedBlockedTerms ??
    (await loadExternalTerminologyDenylist({
      root: resolvedRoot,
      filePath: terminologyDenylistFile,
      required: requireTerminologyDenylist,
    }));
  const inlineBlockedTerms = parseTerminologyDenylist(
    (inlineTerminologyDenylist ?? '').split(',').join('\n')
  );
  const blockedTerms = parseTerminologyDenylist(
    [...externalBlockedTerms, ...inlineBlockedTerms].join('\n')
  );
  const evidenceExceptions = await loadEvidenceExceptions(
    resolvedRoot,
    evidenceExceptionFile,
  );
  const observedEvidenceExceptions = new Set();
  assert.ok(
    !requireTerminologyDenylist || blockedTerms.length > 0,
    'A non-empty external terminology denylist is required'
  );

  const findings = [];
  let scannedFiles = 0;
  let allowedBinaryFiles = 0;

  const excludedDirectorySet = new Set(excludedDirectories);
  const excludedFileSet = new Set(excludedFiles);
  for await (const file of walkAuditTree(
    resolvedRoot,
    excludedDirectorySet,
    excludedFileSet
  )) {
    const relativeFile = normalizeRelativePath(
      path.relative(resolvedRoot, file.path)
    );
    const normalizedRelativeFile = relativeFile.toLocaleLowerCase('en-US');
    const evidenceException = evidenceExceptions.get(relativeFile);
    for (const [index, term] of blockedTerms.entries()) {
      if (normalizedRelativeFile.includes(term.toLocaleLowerCase('en-US'))) {
        findings.push(
          `${relativeFile}: path contains restricted terminology entry #${index + 1}`
        );
      }
    }
    if (file.status.size > maximumTextBytes) {
      const extension = path.extname(file.path).toLocaleLowerCase('en-US');
      if (
        (!allowedBinaryExtensions.has(extension) ||
          file.status.size > maximumAllowedBinaryBytes) &&
        !evidenceException
      ) {
        findings.push(
          `${relativeFile}: file exceeds the audited size limit (${file.status.size} bytes)`
        );
        continue;
      }
    }
    if (
      evidenceException &&
      (file.status.size !== evidenceException.bytes ||
        file.status.size > maximumAllowedBinaryBytes)
    ) {
      findings.push(`${relativeFile}: evidence exception size changed`);
      continue;
    }

    let contents;
    try {
      contents = await readFile(file.path);
    } catch (error) {
      throw new Error(`Unable to read audited file ${relativeFile}`, {
        cause: error,
      });
    }
    scannedFiles += 1;

    if (evidenceException) {
      const actualDigest = createHash('sha256').update(contents).digest('hex');
      if (actualDigest !== evidenceException.sha256) {
        findings.push(`${relativeFile}: evidence exception digest changed`);
        continue;
      }
      observedEvidenceExceptions.add(relativeFile);
    }

    if (isBinary(contents)) {
      const extension = path.extname(file.path).toLocaleLowerCase('en-US');
      if (!allowedBinaryExtensions.has(extension) && !evidenceException) {
        findings.push(`${relativeFile}: binary file type is not allowlisted`);
      } else if (contents.byteLength > maximumAllowedBinaryBytes) {
        findings.push(
          `${relativeFile}: allowlisted binary exceeds ${maximumAllowedBinaryBytes} bytes`
        );
      } else {
        allowedBinaryFiles += 1;
      }
      continue;
    }

    let text;
    try {
      text = utf8Decoder.decode(contents);
    } catch {
      findings.push(`${relativeFile}: text file is not valid UTF-8`);
      continue;
    }
    const normalizedText = text.toLocaleLowerCase('en-US');
    for (const [index, term] of blockedTerms.entries()) {
      if (normalizedText.includes(term.toLocaleLowerCase('en-US'))) {
        findings.push(
          `${relativeFile}: restricted terminology entry #${index + 1}`
        );
      }
    }
    for (const [label, pattern] of patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) findings.push(`${relativeFile}: ${label}`);
    }
  }

  for (const relativeFile of evidenceExceptions.keys())
    if (!observedEvidenceExceptions.has(relativeFile))
      findings.push(`${relativeFile}: evidence exception was not observed exactly`);

  assert.deepEqual(
    findings,
    [],
    `Public-surface audit failed:\n${findings.join('\n')}`
  );
  return Object.freeze({
    root: resolvedRoot,
    blockedTermCount: blockedTerms.length,
    scannedFiles,
    allowedBinaryFiles,
    evidenceExceptionFiles: observedEvidenceExceptions.size,
  });
}

async function loadEvidenceExceptions(root, relativeFile) {
  const file = path.join(root, relativeFile);
  let contents;
  try {
    contents = await readFile(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return new Map();
    throw error;
  }
  const ledger = JSON.parse(contents);
  assert.equal(ledger?.schemaVersion, 1);
  assert.equal(ledger.kind, 'agentplat-public-audit-evidence-exceptions-v1');
  assert.equal(ledger.status, 'frozen-exact-files');
  assert.deepEqual(ledger.policy, {
    allowPathGlobExceptions: false,
    allowDirectoryExceptions: false,
    maximumExceptionBytesPerFile: maximumAllowedBinaryBytes,
    requireSha256Match: true,
    continueSecretAndTerminologyScanningForText: true,
  });
  assert.ok(Array.isArray(ledger.entries));
  const result = new Map();
  for (const entry of ledger.entries) {
    assert.deepEqual(Object.keys(entry).sort(), [
      'bytes',
      'path',
      'reason',
      'sha256',
    ]);
    assert.match(entry.path, /^[A-Za-z0-9._/-]+$/u);
    assert.equal(path.isAbsolute(entry.path), false);
    assert.equal(entry.path.split('/').includes('..'), false);
    assert.match(entry.sha256, /^[0-9a-f]{64}$/u);
    assert.ok(
      Number.isSafeInteger(entry.bytes) &&
        entry.bytes >= 0 &&
        entry.bytes <= maximumAllowedBinaryBytes,
    );
    assert.ok(typeof entry.reason === 'string' && entry.reason.length > 20);
    assert.equal(result.has(entry.path), false);
    result.set(entry.path, Object.freeze({ ...entry }));
  }
  return result;
}

async function* walkAuditTree(root, excludedDirectories, excludedFiles) {
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0
    );
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(
          `Symbolic links are not allowed in the audited tree: ${normalizeRelativePath(path.relative(root, target))}`
        );
      }
      if (entry.isDirectory()) {
        if (!excludedDirectories.has(entry.name)) pending.push(target);
        continue;
      }
      if (entry.isFile() && excludedFiles.has(entry.name)) continue;
      if (!entry.isFile()) {
        throw new Error(
          `Unsupported filesystem entry in audited tree: ${normalizeRelativePath(path.relative(root, target))}`
        );
      }
      yield { path: target, status: await lstat(target) };
    }
  }
}

function isBinary(contents) {
  const inspected = contents.subarray(0, Math.min(contents.byteLength, 8192));
  return inspected.includes(0);
}

function normalizeRelativePath(value) {
  return value.split(path.sep).join('/');
}

export function parsePublicAuditArguments(arguments_) {
  const options = {
    root: process.cwd(),
    requireTerminologyDenylist: false,
  };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--require-terminology-denylist') {
      options.requireTerminologyDenylist = true;
      continue;
    }
    if (argument === '--root') {
      const value = arguments_[index + 1];
      assert.ok(value, '--root requires a path');
      options.root = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('--root=')) {
      const value = argument.slice('--root='.length);
      assert.ok(value, '--root requires a path');
      options.root = value;
      continue;
    }
    throw new TypeError(`Unknown public audit argument: ${argument}`);
  }
  return options;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const report = await runPublicAudit(
      parsePublicAuditArguments(process.argv.slice(2))
    );
    console.log(
      `Public-surface audit passed for ${report.scannedFiles} files with no secret findings or restricted terminology matches (${report.blockedTermCount} external entries, ${report.allowedBinaryFiles} allowlisted binary files, ${report.evidenceExceptionFiles} exact evidence exceptions).`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
