import assert from 'node:assert/strict';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';

const maximumTerms = 256;
const maximumTermLength = 256;
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

export async function loadExternalTerminologyDenylist({
  root,
  filePath,
  required = false,
}) {
  if (!filePath?.trim()) {
    assert.equal(
      required,
      false,
      'A non-empty external terminology denylist is required'
    );
    return [];
  }

  const resolvedRoot = await realpath(path.resolve(root));
  const requestedFile = path.resolve(filePath);
  const fileStatus = await lstat(requestedFile);
  assert.equal(
    fileStatus.isSymbolicLink(),
    false,
    'The external terminology denylist must not be a symbolic link'
  );
  assert.equal(
    fileStatus.isFile(),
    true,
    'The external terminology denylist must be a regular file'
  );
  const resolvedFile = await realpath(requestedFile);
  assert.ok(
    isPathOutside(resolvedRoot, resolvedFile),
    'The public terminology denylist must be stored outside the repository'
  );

  const contents = decodeUtf8(
    await readFile(resolvedFile),
    'The external terminology denylist must be valid UTF-8 text'
  );
  const terms = parseTerminologyDenylist(contents);
  assert.ok(
    !required || terms.length > 0,
    'A non-empty external terminology denylist is required'
  );
  return terms;
}

export function parseTerminologyDenylist(contents) {
  const terms = [];
  const normalizedTerms = new Set();

  for (const line of contents.split(/\r?\n/)) {
    const term = line.trim();
    if (!term || term.startsWith('#')) continue;
    assert.ok(
      term.length <= maximumTermLength,
      `Terminology denylist entries must not exceed ${maximumTermLength} characters`
    );
    const normalized = term.toLocaleLowerCase('en-US');
    if (normalizedTerms.has(normalized)) continue;
    normalizedTerms.add(normalized);
    terms.push(term);
  }

  assert.ok(
    terms.length <= maximumTerms,
    `Terminology denylist must not exceed ${maximumTerms} entries`
  );
  return Object.freeze(terms);
}

export function isPathOutside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  );
}

function decodeUtf8(buffer, message) {
  try {
    return utf8Decoder.decode(buffer);
  } catch (error) {
    throw new TypeError(message, { cause: error });
  }
}
