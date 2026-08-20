import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../dist/index.js';
const root = new URL('../../..', import.meta.url).pathname;

test('lists canonical resources', () => {
  const response = handleRequest({ method: 'resources/list' }, root);
  assert.equal(response.ok, true); assert.ok(response.result.some(x => x.uri === 'agentplat://spec/agentplat-v1'));
});
test('maps requirements without mutation', () => {
  const response = handleRequest({ method: 'tools/call', params: { name: 'map_requirements', arguments: { requirements: ['persistent rooms', 'distributed agents'] } } }, root);
  assert.equal(response.ok, true); assert.equal(response.result.recommendations.length, 2);
});
