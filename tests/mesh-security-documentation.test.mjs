import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);

function read(relativePath) {
  return readFileSync(new URL(relativePath, root), 'utf8');
}

test('Mesh security documentation distinguishes integrity and authenticity from confidentiality or truth', () => {
  const cryptoReadme = read('packages/mesh-crypto/README.md');
  const meshReadme = read('packages/mesh/README.md');
  const threatModel = read('docs/security/agent-mesh-threat-model.md');

  assert.match(
    cryptoReadme,
    /payload integrity, signature validity and\s+authentication of possession of a live locally bound key/u
  );
  assert.match(
    cryptoReadme,
    /does not provide\s+confidentiality or establish the truth of a sender claim/u
  );
  assert.match(
    meshReadme,
    /reason\s+codes from unexpired self-claims\. .*Neither API\s+returns assignment authority/su
  );
  assert.match(
    threatModel,
    /Message signatures do not provide confidentiality, truth or correct model\s+behavior/u
  );
  assert.match(threatModel, /Signatures authenticate key possession\./u);
  assert.match(
    threatModel,
    /self-claims, not\s+statements of truth; outcomes require separate verification/u
  );
});
