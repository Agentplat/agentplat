import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verify} from './verify.mjs';
const original = process.env.MORPHOGENESIS_PILOT_DIR;
assert(original,'set MORPHOGENESIS_PILOT_DIR to a completed pilot bundle');
test('complete pilot evidence verifies',()=>assert.equal(verify(original).cases,11));
function mutated(fn) {
  const dir = mkdtempSync(path.join(tmpdir(),'morph-paper-negative-'));
  try { cpSync(original,dir,{recursive:true}); fn(dir); }
  finally { rmSync(dir,{recursive:true,force:true}); }
}
test('raw sink tampering fails manifest integrity',()=>mutated(dir=>{
  const f=path.join(dir,'morphogenesis-lost-ack/sink.jsonl');
  writeFileSync(f,readFileSync(f,'utf8').replace('team:recruit','team:tampered'));
  assert.throws(()=>verify(dir));
}));
test('a rehashed malformed runtime record fails semantic verification',()=>mutated(dir=>{
  const rel='morphogenesis-lost-ack/record.json', f=path.join(dir,rel);
  const record=JSON.parse(readFileSync(f,'utf8'));
  record.decisionDigest=`sha256:${'0'.repeat(64)}`;
  writeFileSync(f,JSON.stringify(record));
  const manifest=JSON.parse(readFileSync(path.join(dir,'manifest.json'),'utf8'));
  manifest.find(e=>e.path===rel).digest=`sha256:${createHash('sha256').update(readFileSync(f)).digest('hex')}`;
  writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest));
  assert.throws(()=>verify(dir));
}));
