import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateMorphogenesisExecutionRecordV1, validateMorphologyHeadV1,
  createMorphogenesisSuccessorTeamReceiptV1} from '../../packages/collective-runtime/dist/morphogenesis.js';

const hash = b => `sha256:${createHash('sha256').update(b).digest('hex')}`;
const read = f => JSON.parse(readFileSync(f, 'utf8'));
const lines = f => readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const files = dir => readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? files(path.join(dir,e.name)) : [path.join(dir,e.name)]);
export function verify(directory) {
  const dir = path.resolve(directory);
  const manifest = read(path.join(dir,'manifest.json'));
  const expectedPaths = files(dir).map(f => path.relative(dir,f)).filter(f => f !== 'manifest.json').sort();
  assert.deepEqual(manifest.map(e => e.path).sort(), expectedPaths, 'manifest coverage');
  for (const entry of manifest) {
    assert(!path.isAbsolute(entry.path) && !entry.path.split(path.sep).includes('..'));
    assert.equal(hash(readFileSync(path.join(dir,entry.path))), entry.digest, entry.path);
  }
  const summary = read(path.join(dir,'summary.json'));
  assert.equal(summary.outcomes.length,10);
  for (const outcome of summary.outcomes) {
    const folder = path.join(dir,`${outcome.condition}-${outcome.scenario}`);
    const sinkPath = path.join(folder,'sink.jsonl');
    const effects = existsSync(sinkPath) ? lines(sinkPath) : [];
    const expectedEffects = outcome.scenario === 'stale-owner' ? 0 : outcome.condition === 'fresh-id' && outcome.scenario === 'lost-ack' ? 2 : 1;
    assert.equal(effects.length,expectedEffects,'prespecified sink effect count');
    assert.equal(effects.length,outcome.effectCount);
    assert.equal(new Set(effects.map(e => e.operationId)).size,effects.length);
    assert.equal(outcome.duplicateSemanticEffects,Math.max(0,effects.length-new Set(effects.map(e => e.semanticTarget)).size));
    for (const effect of effects) {
      const {schemaVersion,receiptDigest,...body} = effect.receipt;
      assert.equal(schemaVersion,1);
      assert.equal(createMorphogenesisSuccessorTeamReceiptV1(body).receiptDigest,receiptDigest);
      assert.equal(effect.receipt.operationId,effect.operationId);
    }
    const workers = read(path.join(folder,'workers.json'));
    for (const worker of workers) {
      assert.equal(worker.error,null);
      if (worker.expectedKill) assert.equal(worker.signal,'SIGKILL');
      else assert.equal(worker.exitCode,0);
    }
    if (['lost-ack','owner-unavailable'].includes(outcome.scenario)) {
      const pids = [effects[0].pid, outcome.lastWorker.pid];
      assert.notEqual(pids[0],pids[1],'worker process changed');
      if (outcome.condition !== 'fresh-id') assert.equal(effects.length,1);
    }
    if (outcome.scenario === 'owner-unavailable') {
      const blocked = read(path.join(folder,'worker-second.json'));
      assert.equal(blocked.status,'blocked');
      assert.equal(blocked.phase,'activating_team');
      assert.equal(blocked.pendingOperationId,effects[0].operationId);
    }
    if (outcome.lastWorker.status === 'completed') {
      const record = validateMorphogenesisExecutionRecordV1(read(path.join(folder,'record.json')));
      assert.equal(record.phase,'completed');
      assert.equal(record.team.receiptDigest,effects.at(-1).receipt.receiptDigest);
      assert.equal(record.receipt.receiptDigest,outcome.lastWorker.receiptDigest);
      const history = lines(path.join(folder,'head.jsonl'));
      assert.equal(history.length,2);
      const head = validateMorphologyHeadV1(history.at(-1).head);
      assert.equal(head.acceptedProposalDigest,record.proposalDigest);
      assert.equal(head.headDigest,record.activation.morphologyHeadDigest);
      assert.equal(head.morphologyEpoch,2);
    }
    if (outcome.scenario === 'room') {
      const room = read(path.join(folder,'room.json'));
      assert.deepEqual(room.artifact,room.retained);
      assert.deepEqual(room.receiptArtifact,room.retainedReceipt);
      assert.equal(room.retainedReceipt.versions[0].content.receiptDigest,outcome.lastWorker.receiptDigest);
    }
  }
  const losing = read(path.join(dir,'losing-effects.json'));
  assert.equal(losing.inputs.length,2);
  assert.equal(losing.results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(losing.results.filter(r=>r.status==='rejected').length,1);
  const head = validateMorphologyHeadV1(losing.head);
  assert.equal(losing.inputs.filter(i=>i.proposalDigest!==head.acceptedProposalDigest).length,1);
  assert.equal(losing.automaticallyCompensated,false);
  return {status:'verified', cases:summary.caseCount, files:manifest.length,
    scope:'Hashes, runtime record validators, owner effect counts and process identities; not independent replication or external trust certification.'};
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) console.log(JSON.stringify(verify(process.argv[2])));
