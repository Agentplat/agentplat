import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  parsePublicAuditArguments,
  runPublicAudit,
} from '../scripts/audit-public.mjs';
import {
  isPathOutside,
  loadExternalTerminologyDenylist,
  parseTerminologyDenylist,
} from '../scripts/public-audit-terminology.mjs';

test('terminology denylist parser ignores comments and deduplicates literals', () => {
  assert.deepEqual(
    parseTerminologyDenylist(`
      # maintained outside the public repository
      restricted phrase
      another literal
      RESTRICTED PHRASE
    `),
    ['restricted phrase', 'another literal']
  );
});

test('terminology denylist path must remain outside the public repository', () => {
  const root = path.resolve('/workspace/public');

  assert.equal(
    isPathOutside(root, path.resolve('/workspace/restricted-terms.txt')),
    true
  );
  assert.equal(
    isPathOutside(root, path.resolve('/workspace/public/config/terms.txt')),
    false
  );
});

test('required terminology denylist must be external and non-empty', async () => {
  const fixture = await auditFixture();
  try {
    await assert.rejects(
      loadExternalTerminologyDenylist({
        root: fixture.root,
        required: true,
      }),
      /non-empty external terminology denylist is required/
    );
    await writeFile(fixture.denylist, '# comments do not make it non-empty\n');
    await assert.rejects(
      loadExternalTerminologyDenylist({
        root: fixture.root,
        filePath: fixture.denylist,
        required: true,
      }),
      /non-empty external terminology denylist is required/
    );
    await writeFile(fixture.denylist, 'restricted phrase\n');
    assert.deepEqual(
      await loadExternalTerminologyDenylist({
        root: fixture.root,
        filePath: fixture.denylist,
        required: true,
      }),
      ['restricted phrase']
    );
  } finally {
    await fixture.cleanup();
  }
});

test('terminology denylist symbolic links are rejected', async () => {
  const fixture = await auditFixture();
  try {
    const target = path.join(fixture.parent, 'terms-target.txt');
    const linked = path.join(fixture.parent, 'terms-linked.txt');
    await writeFile(target, 'restricted phrase\n');
    await symlink(target, linked);
    await assert.rejects(
      loadExternalTerminologyDenylist({
        root: fixture.root,
        filePath: linked,
        required: true,
      }),
      /must not be a symbolic link/
    );
  } finally {
    await fixture.cleanup();
  }
});

test('public audit supports an explicit root and enforces terminology', async () => {
  const fixture = await auditFixture();
  try {
    await writeFile(fixture.denylist, 'restricted phrase\n');
    await writeFile(
      path.join(fixture.root, 'README.md'),
      'Industry terminology only.\n'
    );
    const report = await runPublicAudit({
      root: fixture.root,
      terminologyDenylistFile: fixture.denylist,
      requireTerminologyDenylist: true,
    });
    assert.equal(report.scannedFiles, 1);
    assert.equal(report.blockedTermCount, 1);

    await writeFile(
      path.join(fixture.root, 'README.md'),
      'Contains the restricted phrase.\n'
    );
    await assert.rejects(
      runPublicAudit({
        root: fixture.root,
        terminologyDenylistFile: fixture.denylist,
        requireTerminologyDenylist: true,
      }),
      /restricted terminology entry #1/
    );

    await writeFile(
      path.join(fixture.root, 'README.md'),
      'Industry terminology only.\n'
    );
    await writeFile(
      path.join(fixture.root, 'restricted phrase.md'),
      'Safe contents.\n'
    );
    await assert.rejects(
      runPublicAudit({
        root: fixture.root,
        terminologyDenylistFile: fixture.denylist,
        requireTerminologyDenylist: true,
      }),
      /path contains restricted terminology entry #1/
    );
  } finally {
    await fixture.cleanup();
  }
});

test('public audit preserves comma-separated inline policy compatibility', async () => {
  const fixture = await auditFixture();
  try {
    await writeFile(
      path.join(fixture.root, 'README.md'),
      'Contains a legacy restricted phrase.\n'
    );
    await assert.rejects(
      runPublicAudit({
        root: fixture.root,
        terminologyDenylistFile: '',
        inlineTerminologyDenylist:
          'legacy restricted phrase,another restricted phrase',
      }),
      /restricted terminology entry #1/
    );
    await assert.rejects(
      runPublicAudit({
        root: fixture.root,
        terminologyDenylistFile: '',
        inlineTerminologyDenylist: 'legacy restricted phrase',
        requireTerminologyDenylist: true,
      }),
      /non-empty external terminology denylist is required/
    );
  } finally {
    await fixture.cleanup();
  }
});

test('public audit fails closed for symlinks, large files and unknown binary files', async () => {
  const cases = [
    async (root, parent) => {
      const target = path.join(parent, 'target.txt');
      await writeFile(target, 'safe\n');
      await symlink(target, path.join(root, 'linked.txt'));
    },
    async (root) => {
      await writeFile(path.join(root, 'large.txt'), 'x'.repeat(1_000_001));
    },
    async (root) => {
      await writeFile(path.join(root, 'unknown.data'), Buffer.from([0, 1, 2]));
    },
  ];
  const expected = [
    /Symbolic links are not allowed/,
    /file exceeds the audited size limit/,
    /binary file type is not allowlisted/,
  ];

  for (const [index, prepare] of cases.entries()) {
    const fixture = await auditFixture();
    try {
      await prepare(fixture.root, fixture.parent);
      await assert.rejects(
        runPublicAudit({ root: fixture.root }),
        expected[index]
      );
    } finally {
      await fixture.cleanup();
    }
  }
});

test('public audit evidence exceptions require exact path, size and digest', async () => {
  const fixture = await auditFixture();
  try {
    const relativeFile = 'evidence/large.json';
    const file = path.join(fixture.root, relativeFile);
    const contents = Buffer.from(`{"value":"${'x'.repeat(1_000_000)}"}\n`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents);
    await writeEvidenceLedger(fixture.root, [exception(relativeFile, contents)]);
    const report = await runPublicAudit({ root: fixture.root });
    assert.equal(report.evidenceExceptionFiles, 1);

    const changed = Buffer.from(contents);
    changed[changed.length - 3] = 'y'.charCodeAt(0);
    await writeFile(file, changed);
    await assert.rejects(
      runPublicAudit({ root: fixture.root }),
      /evidence exception digest changed/,
    );
  } finally {
    await fixture.cleanup();
  }
});

test('public audit rejects stale exception entries and still scans excepted text', async () => {
  const staleFixture = await auditFixture();
  try {
    const contents = Buffer.from('missing evidence');
    await writeEvidenceLedger(staleFixture.root, [
      exception('evidence/missing.json', contents),
    ]);
    await assert.rejects(
      runPublicAudit({ root: staleFixture.root }),
      /evidence exception was not observed exactly/,
    );
  } finally {
    await staleFixture.cleanup();
  }

  const secretFixture = await auditFixture();
  try {
    const relativeFile = 'evidence/large-secret.json';
    const file = path.join(secretFixture.root, relativeFile);
    const contents = Buffer.from(
      `${'x'.repeat(1_000_001)}\nAPI_KEY='abcdefghijklmnopqrstuvwxyz123456'\n`,
    );
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents);
    await writeEvidenceLedger(secretFixture.root, [
      exception(relativeFile, contents),
    ]);
    await assert.rejects(
      runPublicAudit({ root: secretFixture.root }),
      /secret assignment/,
    );
  } finally {
    await secretFixture.cleanup();
  }
});

test('public audit CLI arguments reject unknown or incomplete options', () => {
  assert.deepEqual(parsePublicAuditArguments(['--root', '/tmp/example']), {
    root: '/tmp/example',
    requireTerminologyDenylist: false,
  });
  assert.deepEqual(
    parsePublicAuditArguments([
      '--root=/tmp/example',
      '--require-terminology-denylist',
    ]),
    {
      root: '/tmp/example',
      requireTerminologyDenylist: true,
    }
  );
  assert.throws(() => parsePublicAuditArguments(['--root']), /requires a path/);
  assert.throws(
    () => parsePublicAuditArguments(['--unexpected']),
    /Unknown public audit argument/
  );
});

async function auditFixture() {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'agentplat-audit-test-'));
  const root = path.join(parent, 'public');
  await mkdir(root);
  return {
    parent,
    root,
    denylist: path.join(parent, 'terms.txt'),
    cleanup: () => rm(parent, { recursive: true, force: true }),
  };
}

function exception(relativePath, contents) {
  return {
    path: relativePath,
    sha256: createHash('sha256').update(contents).digest('hex'),
    bytes: contents.byteLength,
    reason: 'Immutable test evidence retained to verify exact exception behavior.',
  };
}

async function writeEvidenceLedger(root, entries) {
  const config = path.join(root, 'config');
  await mkdir(config, { recursive: true });
  await writeFile(
    path.join(config, 'public-audit-evidence-exceptions-v1.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      kind: 'agentplat-public-audit-evidence-exceptions-v1',
      status: 'frozen-exact-files',
      policy: {
        allowPathGlobExceptions: false,
        allowDirectoryExceptions: false,
        maximumExceptionBytesPerFile: 20_000_000,
        requireSha256Match: true,
        continueSecretAndTerminologyScanningForText: true,
      },
      entries,
    })}\n`,
  );
}
