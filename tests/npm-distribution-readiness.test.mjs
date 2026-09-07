import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDistribution } from '../scripts/npm-distribution-readiness.mjs';
const version = '0.3.0-beta.7';
const packages = [{ name: '@agentplat/a', exports: ['.', './new'] }, { name: '@agentplat/b', exports: ['.'] }];
const published = (extra = {}) => ({ status: 200, document: { 'dist-tags': { next: version }, versions: { [version]: { exports: { '.': './dist/index.js', './new': './dist/new.js' }, ...extra } } } });
function analyze(metadata) { return analyzeDistribution({ version, tag: 'next', packages, metadata }); }
test('all versions, tags and internal dependency ranges must resolve', () => {
  const result = analyze({ '@agentplat/a': published({ dependencies: { '@agentplat/b': version } }), '@agentplat/b': published() });
  assert.equal(result.status, 'complete');
  assert.equal(result.totals.tagAligned, 2);
});
test('404 and unavailable registry reads remain distinct', () => {
  const result = analyze({ '@agentplat/a': { status: 404 }, '@agentplat/b': { status: 503 } });
  assert.equal(result.status, 'incomplete');
  assert.equal(result.totals.unregistered, 1);
  assert.equal(result.totals.unverified, 1);
});
test('existing name does not prove target version or expected tag availability', () => {
  const a = published(); delete a.document.versions[version];
  const b = published(); b.document['dist-tags'].next = '0.3.0-beta.5';
  const result = analyze({ '@agentplat/a': a, '@agentplat/b': b });
  assert.deepEqual(result.rows.map(r => r.status), ['version_missing', 'tag_mismatch']);
  assert.deepEqual(result.rows[1].missingAdvertisedExports, ['.']);
});
test('unresolvable dependencies keep a fully tagged cohort incomplete', () => {
  const result = analyze({ '@agentplat/a': published({ dependencies: { '@agentplat/b': '9.0.0' } }), '@agentplat/b': published() });
  assert.equal(result.rows[0].status, 'dependency_failure');
  assert.equal(result.rows[0].dependencyFindings[0].issue, 'no_matching_version');
});
test('a dependency outside the source catalog can resolve from public metadata', () => {
  const result = analyze({ '@agentplat/a': published({ peerDependencies: { '@agentplat/legacy': version } }), '@agentplat/b': published(), '@agentplat/legacy': published() });
  assert.equal(result.status, 'complete');
});
