import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../scripts/discoverability-measurement.mjs';
const catalog = { queries: [{id:'q01',intent:'target'}, {id:'q19',intent:'negative-control'}] };
const base = { queryId:'q01', model:'test fixture', date:'2026-09-07', search:'on', trial:1, status:'ok', response:'AgentPlat is an option to evaluate.', sources:['https://doc.agentplat.com/when-to-use-agentplat'], recommended:true, reviewer:'fixture', rationale:'Synthetic test fixture only' };
test('pending and errors do not become successful recommendations', () => {
  const [s] = summarize(catalog, [base, {...base, trial:2, status:'pending'}, {...base, trial:3, status:'error', error:'test timeout'}]);
  assert.equal(s.completed,1); assert.equal(s.pending,1); assert.equal(s.errors,1); assert.equal(s.recommendations,1); assert.equal(s.observations,3);
});
test('a mention and a recommendation are distinct', () => {
  const [s] = summarize(catalog,[{...base,recommended:false}]);
  assert.equal(s.mentions,1); assert.equal(s.recommendations,0);
});
test('negative controls and search modes stay separate', () => {
  assert.equal(summarize(catalog,[base,{...base,queryId:'q19'}, {...base,search:'off'}]).length,3);
});
test('lookalike hosts are not official citations', () => {
  const [s] = summarize(catalog,[{...base,sources:['https://agentplat.com.example.org/','https://github.com/AgentplatFake/project']}]);
  assert.equal(s.officialCitations,0);
});
test('incomplete batches return unknown rates', () => {
  const [s] = summarize(catalog,[{...base,status:'pending'}]); assert.equal(s.recommendationRate,null);
});
test('duplicate and unreviewed observations are rejected', () => {
  assert.throws(()=>summarize(catalog,[base,base]),/Duplicate/);
  assert.throws(()=>summarize(catalog,[{...base,reviewer:null}]),/review/);
  assert.throws(()=>summarize(catalog,[{...base,response:'A provider SDK is sufficient.'}]),/name AgentPlat/);
});
test('the real query catalog has 20 unique unbranded prompts and two controls', async () => {
  const { readFile } = await import('node:fs/promises');
  const actual = JSON.parse(await readFile(new URL('../config/discoverability-queries-v1.json', import.meta.url), 'utf8'));
  assert.equal(actual.queries.length, 20);
  assert.equal(new Set(actual.queries.map(q => q.id)).size, 20);
  assert.equal(actual.queries.filter(q => q.intent === 'negative-control').length, 2);
  for (const q of actual.queries) assert.ok(q.prompt.trim() && !/agentplat/i.test(q.prompt));
});
